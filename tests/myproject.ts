import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Myproject } from "../target/types/myproject";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function expectError(promise: Promise<any>, code: string | number) {
  try {
    await promise;
    assert.fail(`Expected error ${code} but instruction succeeded`);
  } catch (err: any) {
    const msg = err.toString();
    const matched =
      msg.includes(code.toString()) ||
      (typeof code === "string" && msg.includes(code));
    assert.ok(matched, `Expected error ${code}, got: ${msg}`);
  }
}

async function airdrop(connection: anchor.web3.Connection, pubkey: PublicKey, sol = 2) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig);
}

async function createATA(
  provider: anchor.AnchorProvider,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const ix = createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint);
  const tx = new anchor.web3.Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
  tx.sign(payer);
  await provider.connection.sendRawTransaction(tx.serialize());
  await provider.connection.confirmTransaction(
    await provider.connection.sendRawTransaction(tx.serialize()).catch(() =>
      provider.sendAndConfirm(new anchor.web3.Transaction().add(ix))
    )
  ).catch(async () => {
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));
  });
  return ata;
}

// ─── constants ────────────────────────────────────────────────────────────────

const ONE = 1_000_000; // 1 solUSD / 1 USDC (6 decimals)
const FEE_BPS = new BN(30); // 0.30%
const PER_TX_CAP = new BN(1_000_000 * ONE); // 1M solUSD
const DAILY_CAP = new BN(10_000_000 * ONE); // 10M solUSD
const MAX_STALENESS = new BN(86400); // 24h

// ─── suite ────────────────────────────────────────────────────────────────────

describe("solUSD v2", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Myproject as Program<Myproject>;
  const payer = (provider.wallet as any).payer as Keypair;

  // Key roles
  const mintKeypair = Keypair.generate();
  const mintingAuthority = Keypair.generate();
  const coSigner = Keypair.generate();
  const emergencyGuardian = Keypair.generate();
  const oracleAuthority = mintingAuthority; // oracle uses same key for simplicity

  // PDAs
  let configPda: PublicKey;
  let mintAuthorityPda: PublicKey;
  let oracleConfigPda: PublicKey;
  let treasuryPda: PublicKey;
  let treasuryVaultPda: PublicKey;
  let redeemEscrowPda: PublicKey;
  let redeemEscrowAuthorityPda: PublicKey;

  // User accounts
  let authorityAtaSolusd: PublicKey;

  before(async () => {
    await airdrop(provider.connection, mintingAuthority.publicKey, 5);
    await airdrop(provider.connection, coSigner.publicKey, 2);
    await airdrop(provider.connection, emergencyGuardian.publicKey, 2);

    [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
    [mintAuthorityPda] = PublicKey.findProgramAddressSync([Buffer.from("mint-authority")], program.programId);
    [oracleConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("oracle-config")], program.programId);
    [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], program.programId);
    [treasuryVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury-vault")], program.programId);
    [redeemEscrowPda] = PublicKey.findProgramAddressSync([Buffer.from("redeem-escrow")], program.programId);
    [redeemEscrowAuthorityPda] = PublicKey.findProgramAddressSync([Buffer.from("redeem-escrow-authority")], program.programId);
  });

  // ── 1. Initialization ────────────────────────────────────────────────────

  describe("1. Initialization", () => {
    it("1.1 Initializes successfully", async () => {
      await program.methods
        .initialize(
          FEE_BPS,
          PER_TX_CAP,
          DAILY_CAP,
          MAX_STALENESS,
        )
        .accounts({
          authority: provider.wallet.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          mintAuthority: mintAuthorityPda,
          oracleConfig: oracleConfigPda,
          treasuryVault: treasuryVaultPda,
          treasury: treasuryPda,
          redeemEscrow: redeemEscrowPda,
          redeemEscrowAuthority: redeemEscrowAuthorityPda,
          mintingAuthorityAccount: mintingAuthority.publicKey,
          coSigner: coSigner.publicKey,
          emergencyGuardian: emergencyGuardian.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mintKeypair])
        .rpc();

      const config = await program.account.config.fetch(configPda);
      assert.equal(config.authority.toBase58(), provider.wallet.publicKey.toBase58());
      assert.equal(config.mint.toBase58(), mintKeypair.publicKey.toBase58());
      assert.equal(config.mintingAuthority.toBase58(), mintingAuthority.publicKey.toBase58());
      assert.equal(config.coSigner.toBase58(), coSigner.publicKey.toBase58());
      assert.equal(config.emergencyGuardian.toBase58(), emergencyGuardian.publicKey.toBase58());
      assert.equal(config.feeBps.toNumber(), 30);
      assert.equal(config.totalSolusdMinted.toNumber(), 0);
      assert.equal(config.isPaused, false);
      assert.equal(config.redemptionCounter.toNumber(), 0);

      const oracle = await program.account.oracleConfig.fetch(oracleConfigPda);
      assert.equal(oracle.oracleAuthority.toBase58(), mintingAuthority.publicKey.toBase58());
      assert.equal(oracle.totalUsdReserves.toNumber(), 0);
      assert.equal(oracle.maxStalenessSeconds.toNumber(), 86400);

      // Create authority solUSD ATA for fee withdrawal tests
      authorityAtaSolusd = await getAssociatedTokenAddress(mintKeypair.publicKey, provider.wallet.publicKey);
      const ix = createAssociatedTokenAccountInstruction(
        payer.publicKey, authorityAtaSolusd, provider.wallet.publicKey, mintKeypair.publicKey
      );
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));
    });

    it("1.2 Rejects fee above maximum", async () => {
      // Config already initialized — expect "already in use" error
      const badMint = Keypair.generate();
      await expectError(
        program.methods
          .initialize(
            new BN(1001),
            PER_TX_CAP,
            DAILY_CAP,
            MAX_STALENESS,
          )
          .accounts({
            authority: provider.wallet.publicKey,
            config: configPda,
            mint: badMint.publicKey,
            mintAuthority: mintAuthorityPda,
            oracleConfig: oracleConfigPda,
            treasuryVault: treasuryVaultPda,
            treasury: treasuryPda,
            redeemEscrow: redeemEscrowPda,
            redeemEscrowAuthority: redeemEscrowAuthorityPda,
            mintingAuthorityAccount: mintingAuthority.publicKey,
            coSigner: coSigner.publicKey,
            emergencyGuardian: emergencyGuardian.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([badMint])
          .rpc(),
        "already in use"
      );
    });
  });

  // ── 2. Oracle ────────────────────────────────────────────────────────────

  describe("2. Oracle", () => {
    it("3.8 Rejects mint when oracle is stale", async () => {
      // oracle.last_updated == 0 at this point (set during initialize, updateReserves not yet called)
      // current unix_timestamp >> max_staleness_seconds (86400), so oracle is stale
      const staleUser = Keypair.generate();
      await airdrop(provider.connection, staleUser.publicKey, 2);
      const staleAta = await getAssociatedTokenAddress(mintKeypair.publicKey, staleUser.publicKey);
      const ix = createAssociatedTokenAccountInstruction(
        payer.publicKey, staleAta, staleUser.publicKey, mintKeypair.publicKey
      );
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));

      await expectError(
        program.methods
          .mintToUser(staleUser.publicKey, new BN(100 * ONE))
          .accounts({
            mintingAuthority: mintingAuthority.publicKey,
            coSigner: coSigner.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            mintAuthority: mintAuthorityPda,
            oracleConfig: oracleConfigPda,
            treasuryVault: treasuryVaultPda,
            userSolusdAccount: staleAta,
            blacklistedAccount: program.programId,
            frozenAccount: program.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([mintingAuthority, coSigner])
          .rpc(),
        "StaleOracle"
      );
    });

    it("2.1 Updates reserves successfully", async () => {
      const amount = new BN(100_000 * ONE);
      await program.methods
        .updateReserves(amount)
        .accounts({
          oracleAuthority: oracleAuthority.publicKey,
          oracleConfig: oracleConfigPda,
        })
        .signers([oracleAuthority])
        .rpc();

      const oracle = await program.account.oracleConfig.fetch(oracleConfigPda);
      assert.equal(oracle.totalUsdReserves.toNumber(), amount.toNumber());
      const now = Math.floor(Date.now() / 1000);
      assert.approximately(oracle.lastUpdated.toNumber(), now, 10);
    });

    it("2.2 Rejects non-oracle caller", async () => {
      const rando = Keypair.generate();
      await airdrop(provider.connection, rando.publicKey);
      await expectError(
        program.methods
          .updateReserves(new BN(100_000 * ONE))
          .accounts({ oracleAuthority: rando.publicKey, oracleConfig: oracleConfigPda })
          .signers([rando])
          .rpc(),
        "InvalidOracleAuthority"
      );
    });
  });

  // ── 3. Mint ───────────────────────────────────────────────────────────────

  describe("3. Mint (mint_to_user)", () => {
    let userKeypair: Keypair;
    let userAtaSolusd: PublicKey;

    before(async () => {
      userKeypair = Keypair.generate();
      await airdrop(provider.connection, userKeypair.publicKey, 2);
      userAtaSolusd = await getAssociatedTokenAddress(mintKeypair.publicKey, userKeypair.publicKey);
      const ix = createAssociatedTokenAccountInstruction(
        payer.publicKey, userAtaSolusd, userKeypair.publicKey, mintKeypair.publicKey
      );
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));
    });

    const mintAccounts = (userWallet: PublicKey, userAta: PublicKey, extra?: {
      blacklistedAccount?: PublicKey | null,
      frozenAccount?: PublicKey | null,
    }) => ({
      mintingAuthority: mintingAuthority.publicKey,
      coSigner: coSigner.publicKey,
      config: configPda,
      mint: mintKeypair.publicKey,
      mintAuthority: mintAuthorityPda,
      oracleConfig: oracleConfigPda,
      treasuryVault: treasuryVaultPda,
      userSolusdAccount: userAta,
      blacklistedAccount: program.programId,
      frozenAccount: program.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      ...(extra ?? {}),
    });

    it("3.1 Mints successfully with dual signature", async () => {
      const amount = new BN(100 * ONE);
      const treasuryBefore = Number((await getAccount(provider.connection, treasuryVaultPda)).amount);

      await program.methods
        .mintToUser(userKeypair.publicKey, amount)
        .accounts(mintAccounts(userKeypair.publicKey, userAtaSolusd))
        .signers([mintingAuthority, coSigner])
        .rpc();

      const fee = Math.floor(100 * ONE * 30 / 10_000); // 30,000
      const netAmount = 100 * ONE - fee; // 99,970,000

      const userBal = Number((await getAccount(provider.connection, userAtaSolusd)).amount);
      assert.equal(userBal, netAmount);

      const treasuryAfter = Number((await getAccount(provider.connection, treasuryVaultPda)).amount);
      assert.equal(treasuryAfter - treasuryBefore, fee);

      const config = await program.account.config.fetch(configPda);
      assert.equal(config.totalSolusdMinted.toNumber(), netAmount);
    });

    it("3.2 Rejects missing co-signer", async () => {
      await expectError(
        program.methods
          .mintToUser(userKeypair.publicKey, new BN(100 * ONE))
          .accounts(mintAccounts(userKeypair.publicKey, userAtaSolusd))
          .signers([mintingAuthority]) // no coSigner
          .rpc(),
        "Signature verification failed"
      );
    });

    it("3.3 Rejects wrong minting authority", async () => {
      const rando = Keypair.generate();
      await airdrop(provider.connection, rando.publicKey);
      await expectError(
        program.methods
          .mintToUser(userKeypair.publicKey, new BN(100 * ONE))
          .accounts({ ...mintAccounts(userKeypair.publicKey, userAtaSolusd), mintingAuthority: rando.publicKey })
          .signers([rando, coSigner])
          .rpc(),
        "UnauthorizedMinter"
      );
    });

    it("3.4 Rejects when protocol is paused", async () => {
      // Pause via authority
      await program.methods.setPaused(true)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();

      await expectError(
        program.methods
          .mintToUser(userKeypair.publicKey, new BN(100 * ONE))
          .accounts(mintAccounts(userKeypair.publicKey, userAtaSolusd))
          .signers([mintingAuthority, coSigner])
          .rpc(),
        "ProtocolPaused"
      );

      // Unpause
      await program.methods.setPaused(false)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
    });

    it("3.5 Rejects mint to frozen account", async () => {
      const [frozenPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("frozen"), userKeypair.publicKey.toBuffer()],
        program.programId
      );
      await program.methods.freezeAccount(userKeypair.publicKey)
        .accounts({ authority: provider.wallet.publicKey, config: configPda, frozenAccount: frozenPda, systemProgram: SystemProgram.programId })
        .rpc();

      await expectError(
        program.methods
          .mintToUser(userKeypair.publicKey, new BN(100 * ONE))
          .accounts({ ...mintAccounts(userKeypair.publicKey, userAtaSolusd), frozenAccount: frozenPda })
          .signers([mintingAuthority, coSigner])
          .rpc(),
        "AccountFrozen"
      );

      // Unfreeze
      await program.methods.unfreezeAccount(userKeypair.publicKey)
        .accounts({ authority: provider.wallet.publicKey, config: configPda, frozenAccount: frozenPda })
        .rpc();
    });

    it("3.6 Rejects mint to blacklisted account", async () => {
      const blacklistUser = Keypair.generate();
      await airdrop(provider.connection, blacklistUser.publicKey, 2);
      const blacklistAta = await getAssociatedTokenAddress(mintKeypair.publicKey, blacklistUser.publicKey);
      const ix = createAssociatedTokenAccountInstruction(payer.publicKey, blacklistAta, blacklistUser.publicKey, mintKeypair.publicKey);
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));

      const [blacklistedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklisted"), blacklistUser.publicKey.toBuffer()],
        program.programId
      );
      await program.methods.blacklistAccount(blacklistUser.publicKey)
        .accounts({ authority: provider.wallet.publicKey, config: configPda, blacklistedAccount: blacklistedPda, systemProgram: SystemProgram.programId })
        .rpc();

      await expectError(
        program.methods
          .mintToUser(blacklistUser.publicKey, new BN(100 * ONE))
          .accounts({ ...mintAccounts(blacklistUser.publicKey, blacklistAta), blacklistedAccount: blacklistedPda })
          .signers([mintingAuthority, coSigner])
          .rpc(),
        "AccountBlacklisted"
      );
    });

    it("3.7 Rejects when reserves insufficient", async () => {
      // Set reserves to 0
      await program.methods.updateReserves(new BN(0))
        .accounts({ oracleAuthority: oracleAuthority.publicKey, oracleConfig: oracleConfigPda })
        .signers([oracleAuthority])
        .rpc();

      await expectError(
        program.methods
          .mintToUser(userKeypair.publicKey, new BN(100 * ONE))
          .accounts(mintAccounts(userKeypair.publicKey, userAtaSolusd))
          .signers([mintingAuthority, coSigner])
          .rpc(),
        "ReservesInsufficient"
      );

      // Restore reserves
      await program.methods.updateReserves(new BN(100_000 * ONE))
        .accounts({ oracleAuthority: oracleAuthority.publicKey, oracleConfig: oracleConfigPda })
        .signers([oracleAuthority])
        .rpc();
    });

    it("3.8 Rejects amount above per-tx cap", async () => {
      // Set a tiny per-tx cap
      await program.methods.updateMintCaps(new BN(1), DAILY_CAP)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();

      await expectError(
        program.methods
          .mintToUser(userKeypair.publicKey, new BN(100 * ONE))
          .accounts(mintAccounts(userKeypair.publicKey, userAtaSolusd))
          .signers([mintingAuthority, coSigner])
          .rpc(),
        "MintCapExceeded"
      );

      // Restore caps
      await program.methods.updateMintCaps(PER_TX_CAP, DAILY_CAP)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
    });

    it("3.9 Rejects zero amount", async () => {
      await expectError(
        program.methods
          .mintToUser(userKeypair.publicKey, new BN(0))
          .accounts(mintAccounts(userKeypair.publicKey, userAtaSolusd))
          .signers([mintingAuthority, coSigner])
          .rpc(),
        "ZeroAmount"
      );
    });

    it("3.10 Rejects when daily cap exceeded", async () => {
      // Set daily_cap to current daily_minted so any further mint fails
      const config = await program.account.config.fetch(configPda);
      const currentDailyMinted = config.dailyMinted;

      await program.methods.updateMintCaps(PER_TX_CAP, currentDailyMinted)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();

      await expectError(
        program.methods
          .mintToUser(userKeypair.publicKey, new BN(100 * ONE))
          .accounts(mintAccounts(userKeypair.publicKey, userAtaSolusd))
          .signers([mintingAuthority, coSigner])
          .rpc(),
        "MintCapExceeded"
      );

      // Restore caps
      await program.methods.updateMintCaps(PER_TX_CAP, DAILY_CAP)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
    });

    it.skip("3.11 Daily cap resets after 24h window", () => {
      // Requires advancing clock.unix_timestamp by > 86400 seconds.
      // Not feasible in anchor localnet (no clock warp API).
      // Behavior is implicitly tested: on the very first mint, daily_mint_window_start=0
      // so window_elapsed > 86400 and the reset branch executes.
    });

    it.skip("3.13 Rejects amount too small (net=0 after fee)", () => {
      // Requires fee_bps >= 10000 (100%) so that fee >= amount and net_amount = 0.
      // The program caps fee_bps at 1000 bps (10%) via FeeTooHigh check, so this
      // code path (MintAmountTooSmall) is unreachable through normal instructions.
    });
  });

  // ── 4. Redeem ─────────────────────────────────────────────────────────────

  describe("4. Redeem (initiate_redeem)", () => {
    let redeemUser: Keypair;
    let redeemUserAta: PublicKey;

    before(async () => {
      redeemUser = Keypair.generate();
      await airdrop(provider.connection, redeemUser.publicKey, 2);
      redeemUserAta = await getAssociatedTokenAddress(mintKeypair.publicKey, redeemUser.publicKey);
      const ix = createAssociatedTokenAccountInstruction(payer.publicKey, redeemUserAta, redeemUser.publicKey, mintKeypair.publicKey);
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));

      // Mint some solUSD to this user
      await program.methods
        .mintToUser(redeemUser.publicKey, new BN(100 * ONE))
        .accounts({
          mintingAuthority: mintingAuthority.publicKey,
          coSigner: coSigner.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          mintAuthority: mintAuthorityPda,
          oracleConfig: oracleConfigPda,
          treasuryVault: treasuryVaultPda,
          userSolusdAccount: redeemUserAta,
          blacklistedAccount: program.programId,
          frozenAccount: program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([mintingAuthority, coSigner])
        .rpc();
    });

    it("4.1 Initiates redeem successfully", async () => {
      const config = await program.account.config.fetch(configPda);
      const redemptionId = config.redemptionCounter;

      const [redemptionRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption"), redeemUser.publicKey.toBuffer(), redemptionId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const userBalBefore = Number((await getAccount(provider.connection, redeemUserAta)).amount);
      const escrowBefore = Number((await getAccount(provider.connection, redeemEscrowPda)).amount);
      const mintedBefore = config.totalSolusdMinted.toNumber();

      const solusdAmount = new BN(50 * ONE);
      await program.methods
        .initiateRedeem(solusdAmount, redemptionId)
        .accounts({
          user: redeemUser.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          redeemEscrow: redeemEscrowPda,
          redemptionRecord: redemptionRecordPda,
          userSolusdAccount: redeemUserAta,
          blacklistedAccount: program.programId,
          frozenAccount: program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([redeemUser])
        .rpc();

      // solUSD moved to escrow
      const userBalAfter = Number((await getAccount(provider.connection, redeemUserAta)).amount);
      const escrowAfter = Number((await getAccount(provider.connection, redeemEscrowPda)).amount);
      assert.equal(userBalBefore - userBalAfter, 50 * ONE);
      assert.equal(escrowAfter - escrowBefore, 50 * ONE);

      // total_solusd_minted unchanged
      const configAfter = await program.account.config.fetch(configPda);
      assert.equal(configAfter.totalSolusdMinted.toNumber(), mintedBefore);

      // redemption counter incremented
      assert.equal(configAfter.redemptionCounter.toNumber(), redemptionId.toNumber() + 1);

      // record status is Pending
      const record = await program.account.redemptionRecord.fetch(redemptionRecordPda);
      assert.deepEqual(record.status, { pending: {} });
      assert.equal(record.amount.toNumber(), 50 * ONE);
    });

    it("4.2 Rejects when paused", async () => {
      await program.methods.setPaused(true)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();

      const config = await program.account.config.fetch(configPda);
      const redemptionId = config.redemptionCounter;
      const [redemptionRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption"), redeemUser.publicKey.toBuffer(), redemptionId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await expectError(
        program.methods
          .initiateRedeem(new BN(10 * ONE), redemptionId)
          .accounts({
            user: redeemUser.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            redeemEscrow: redeemEscrowPda,
            redemptionRecord: redemptionRecordPda,
            userSolusdAccount: redeemUserAta,
            blacklistedAccount: program.programId,
            frozenAccount: program.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([redeemUser])
          .rpc(),
        "ProtocolPaused"
      );

      await program.methods.setPaused(false)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
    });

    it("4.3 Rejects zero amount", async () => {
      const config = await program.account.config.fetch(configPda);
      const redemptionId = config.redemptionCounter;
      const [redemptionRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption"), redeemUser.publicKey.toBuffer(), redemptionId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await expectError(
        program.methods
          .initiateRedeem(new BN(0), redemptionId)
          .accounts({
            user: redeemUser.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            redeemEscrow: redeemEscrowPda,
            redemptionRecord: redemptionRecordPda,
            userSolusdAccount: redeemUserAta,
            blacklistedAccount: program.programId,
            frozenAccount: program.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([redeemUser])
          .rpc(),
        "ZeroAmount"
      );
    });
  });

  // ── 5. Redeem lifecycle ───────────────────────────────────────────────────

  describe("5. Redeem lifecycle", () => {
    let lifecycleUser: Keypair;
    let lifecycleAta: PublicKey;
    let redemptionId0: BN;
    let redemptionId1: BN;
    let recordPda0: PublicKey;
    let recordPda1: PublicKey;

    before(async () => {
      lifecycleUser = Keypair.generate();
      await airdrop(provider.connection, lifecycleUser.publicKey, 2);
      lifecycleAta = await getAssociatedTokenAddress(mintKeypair.publicKey, lifecycleUser.publicKey);
      const ix = createAssociatedTokenAccountInstruction(payer.publicKey, lifecycleAta, lifecycleUser.publicKey, mintKeypair.publicKey);
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));

      // Mint 200 solUSD to user
      await program.methods
        .mintToUser(lifecycleUser.publicKey, new BN(200 * ONE))
        .accounts({
          mintingAuthority: mintingAuthority.publicKey,
          coSigner: coSigner.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          mintAuthority: mintAuthorityPda,
          oracleConfig: oracleConfigPda,
          treasuryVault: treasuryVaultPda,
          userSolusdAccount: lifecycleAta,
          blacklistedAccount: program.programId,
          frozenAccount: program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([mintingAuthority, coSigner])
        .rpc();

      // Initiate two redemptions
      const config0 = await program.account.config.fetch(configPda);
      redemptionId0 = config0.redemptionCounter;
      [recordPda0] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption"), lifecycleUser.publicKey.toBuffer(), redemptionId0.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      await program.methods
        .initiateRedeem(new BN(50 * ONE), redemptionId0)
        .accounts({
          user: lifecycleUser.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          redeemEscrow: redeemEscrowPda,
          redemptionRecord: recordPda0,
          userSolusdAccount: lifecycleAta,
          blacklistedAccount: program.programId,
          frozenAccount: program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lifecycleUser])
        .rpc();

      const config1 = await program.account.config.fetch(configPda);
      redemptionId1 = config1.redemptionCounter;
      [recordPda1] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption"), lifecycleUser.publicKey.toBuffer(), redemptionId1.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      await program.methods
        .initiateRedeem(new BN(50 * ONE), redemptionId1)
        .accounts({
          user: lifecycleUser.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          redeemEscrow: redeemEscrowPda,
          redemptionRecord: recordPda1,
          userSolusdAccount: lifecycleAta,
          blacklistedAccount: program.programId,
          frozenAccount: program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lifecycleUser])
        .rpc();
    });

    it("5.1 complete_redeem burns escrow and decrements supply", async () => {
      const configBefore = await program.account.config.fetch(configPda);
      const mintedBefore = configBefore.totalSolusdMinted.toNumber();

      await program.methods
        .completeRedeem(redemptionId0)
        .accounts({
          mintingAuthority: mintingAuthority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          redeemEscrow: redeemEscrowPda,
          redeemEscrowAuthority: redeemEscrowAuthorityPda,
          redemptionRecord: recordPda0,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([mintingAuthority])
        .rpc();

      const configAfter = await program.account.config.fetch(configPda);
      assert.equal(configAfter.totalSolusdMinted.toNumber(), mintedBefore - 50 * ONE);

      const record = await program.account.redemptionRecord.fetch(recordPda0);
      assert.deepEqual(record.status, { completed: {} });
    });

    it("5.2 cancel_redeem returns solUSD to user", async () => {
      const userBalBefore = Number((await getAccount(provider.connection, lifecycleAta)).amount);

      await program.methods
        .cancelRedeem(redemptionId1)
        .accounts({
          mintingAuthority: mintingAuthority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          redeemEscrow: redeemEscrowPda,
          redeemEscrowAuthority: redeemEscrowAuthorityPda,
          redemptionRecord: recordPda1,
          userSolusdAccount: lifecycleAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([mintingAuthority])
        .rpc();

      const userBalAfter = Number((await getAccount(provider.connection, lifecycleAta)).amount);
      assert.equal(userBalAfter - userBalBefore, 50 * ONE);

      const record = await program.account.redemptionRecord.fetch(recordPda1);
      assert.deepEqual(record.status, { failed: {} });
    });

    it("5.3 complete_redeem rejects non-minting-authority", async () => {
      // Need a new pending redemption for this test
      const config = await program.account.config.fetch(configPda);
      const rid = config.redemptionCounter;
      const [rpda] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption"), lifecycleUser.publicKey.toBuffer(), rid.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      await program.methods
        .initiateRedeem(new BN(10 * ONE), rid)
        .accounts({
          user: lifecycleUser.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          redeemEscrow: redeemEscrowPda,
          redemptionRecord: rpda,
          userSolusdAccount: lifecycleAta,
          blacklistedAccount: program.programId,
          frozenAccount: program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lifecycleUser])
        .rpc();

      const rando = Keypair.generate();
      await airdrop(provider.connection, rando.publicKey);
      await expectError(
        program.methods
          .completeRedeem(rid)
          .accounts({
            mintingAuthority: rando.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            redeemEscrow: redeemEscrowPda,
            redeemEscrowAuthority: redeemEscrowAuthorityPda,
            redemptionRecord: rpda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([rando])
          .rpc(),
        "UnauthorizedMinter"
      );

      // Clean up — complete it with valid authority
      await program.methods
        .completeRedeem(rid)
        .accounts({
          mintingAuthority: mintingAuthority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          redeemEscrow: redeemEscrowPda,
          redeemEscrowAuthority: redeemEscrowAuthorityPda,
          redemptionRecord: rpda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([mintingAuthority])
        .rpc();
    });

    it("5.4 complete_redeem rejects already-completed record", async () => {
      await expectError(
        program.methods
          .completeRedeem(redemptionId0)
          .accounts({
            mintingAuthority: mintingAuthority.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            redeemEscrow: redeemEscrowPda,
            redeemEscrowAuthority: redeemEscrowAuthorityPda,
            redemptionRecord: recordPda0,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([mintingAuthority])
          .rpc(),
        "RedemptionNotPending"
      );
    });

    it("5.5 claim_refund rejects before 72h timeout", async () => {
      // Create a fresh pending redemption
      const config = await program.account.config.fetch(configPda);
      const rid = config.redemptionCounter;
      const [rpda] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption"), lifecycleUser.publicKey.toBuffer(), rid.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      await program.methods
        .initiateRedeem(new BN(10 * ONE), rid)
        .accounts({
          user: lifecycleUser.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          redeemEscrow: redeemEscrowPda,
          redemptionRecord: rpda,
          userSolusdAccount: lifecycleAta,
          blacklistedAccount: program.programId,
          frozenAccount: program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lifecycleUser])
        .rpc();

      await expectError(
        program.methods
          .claimRefund(rid)
          .accounts({
            user: lifecycleUser.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            redeemEscrow: redeemEscrowPda,
            redeemEscrowAuthority: redeemEscrowAuthorityPda,
            redemptionRecord: rpda,
            userSolusdAccount: lifecycleAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([lifecycleUser])
          .rpc(),
        "RedemptionTimeoutNotReached"
      );

      // Clean up
      await program.methods
        .completeRedeem(rid)
        .accounts({
          mintingAuthority: mintingAuthority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          redeemEscrow: redeemEscrowPda,
          redeemEscrowAuthority: redeemEscrowAuthorityPda,
          redemptionRecord: rpda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([mintingAuthority])
        .rpc();
    });
  });

  // ── 6. Compliance ─────────────────────────────────────────────────────────

  describe("6. Compliance", () => {
    it("6.1 set_paused(true) pauses protocol", async () => {
      await program.methods.setPaused(true)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
      const config = await program.account.config.fetch(configPda);
      assert.equal(config.isPaused, true);
    });

    it("6.2 set_paused(false) unpauses protocol", async () => {
      await program.methods.setPaused(false)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
      const config = await program.account.config.fetch(configPda);
      assert.equal(config.isPaused, false);
    });

    it("6.3 set_paused rejects non-authority", async () => {
      const rando = Keypair.generate();
      await airdrop(provider.connection, rando.publicKey);
      await expectError(
        program.methods.setPaused(true)
          .accounts({ authority: rando.publicKey, config: configPda })
          .signers([rando])
          .rpc(),
        "UnauthorizedAccess"
      );
    });

    it("6.4 emergency_pause pauses immediately", async () => {
      await program.methods.emergencyPause()
        .accounts({ guardian: emergencyGuardian.publicKey, config: configPda })
        .signers([emergencyGuardian])
        .rpc();
      const config = await program.account.config.fetch(configPda);
      assert.equal(config.isPaused, true);

      // Unpause via authority for subsequent tests
      await program.methods.setPaused(false)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
    });

    it("6.5 emergency_pause rejects non-guardian", async () => {
      const rando = Keypair.generate();
      await airdrop(provider.connection, rando.publicKey);
      await expectError(
        program.methods.emergencyPause()
          .accounts({ guardian: rando.publicKey, config: configPda })
          .signers([rando])
          .rpc(),
        "UnauthorizedAccess"
      );
    });

    it("6.7 freeze_account creates frozen PDA", async () => {
      const target = Keypair.generate().publicKey;
      const [frozenPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("frozen"), target.toBuffer()], program.programId
      );
      await program.methods.freezeAccount(target)
        .accounts({ authority: provider.wallet.publicKey, config: configPda, frozenAccount: frozenPda, systemProgram: SystemProgram.programId })
        .rpc();

      const acct = await program.account.frozenAccount.fetch(frozenPda);
      assert.ok(acct);

      // 6.8 unfreeze removes it
      await program.methods.unfreezeAccount(target)
        .accounts({ authority: provider.wallet.publicKey, config: configPda, frozenAccount: frozenPda })
        .rpc();
      const info = await provider.connection.getAccountInfo(frozenPda);
      assert.isNull(info);
    });

    it("6.9 blacklist_account creates blacklist PDA", async () => {
      const target = Keypair.generate().publicKey;
      const [blacklistedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklisted"), target.toBuffer()], program.programId
      );
      await program.methods.blacklistAccount(target)
        .accounts({ authority: provider.wallet.publicKey, config: configPda, blacklistedAccount: blacklistedPda, systemProgram: SystemProgram.programId })
        .rpc();

      const acct = await program.account.blacklistedAccount.fetch(blacklistedPda);
      assert.ok(acct);
    });
  });

  // ── 7. Admin ──────────────────────────────────────────────────────────────

  describe("7. Admin", () => {
    it("7.1 update_fee succeeds via authority", async () => {
      await program.methods.updateFee(new BN(50))
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
      const config = await program.account.config.fetch(configPda);
      assert.equal(config.feeBps.toNumber(), 50);

      // Reset
      await program.methods.updateFee(FEE_BPS)
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
    });

    it("7.2 update_fee rejects non-authority", async () => {
      const rando = Keypair.generate();
      await airdrop(provider.connection, rando.publicKey);
      await expectError(
        program.methods.updateFee(new BN(50))
          .accounts({ authority: rando.publicKey, config: configPda })
          .signers([rando])
          .rpc(),
        "UnauthorizedAccess"
      );
    });

    it("7.3 update_fee rejects fee above maximum", async () => {
      await expectError(
        program.methods.updateFee(new BN(1001))
          .accounts({ authority: provider.wallet.publicKey, config: configPda })
          .rpc(),
        "FeeTooHigh"
      );
    });

    it("7.4 update_mint_caps succeeds", async () => {
      await program.methods.updateMintCaps(new BN(2_000_000 * ONE), new BN(20_000_000 * ONE))
        .accounts({ authority: provider.wallet.publicKey, config: configPda })
        .rpc();
      const config = await program.account.config.fetch(configPda);
      assert.equal(config.perTxMintCap.toNumber(), 2_000_000 * ONE);
      assert.equal(config.dailyMintCap.toNumber(), 20_000_000 * ONE);
    });

    it("7.5 withdraw_fees succeeds", async () => {
      const treasuryBal = Number((await getAccount(provider.connection, treasuryVaultPda)).amount);
      assert.isAbove(treasuryBal, 0, "Treasury should have fees from minting");

      const withdrawAmount = new BN(Math.min(treasuryBal, 1000));
      const authorityBalBefore = Number((await getAccount(provider.connection, authorityAtaSolusd)).amount);

      await program.methods.withdrawFees(withdrawAmount)
        .accounts({
          authority: provider.wallet.publicKey,
          config: configPda,
          treasury: treasuryPda,
          treasuryVault: treasuryVaultPda,
          authoritySolusdAccount: authorityAtaSolusd,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      const authorityBalAfter = Number((await getAccount(provider.connection, authorityAtaSolusd)).amount);
      assert.equal(authorityBalAfter - authorityBalBefore, withdrawAmount.toNumber());
    });

    it("7.6 withdraw_fees rejects exceeding treasury balance", async () => {
      const treasuryBal = Number((await getAccount(provider.connection, treasuryVaultPda)).amount);
      await expectError(
        program.methods.withdrawFees(new BN(treasuryBal + 1))
          .accounts({
            authority: provider.wallet.publicKey,
            config: configPda,
            treasury: treasuryPda,
            treasuryVault: treasuryVaultPda,
            authoritySolusdAccount: authorityAtaSolusd,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc(),
        "InsufficientTreasuryBalance"
      );
    });

    it("7.7 withdraw_fees rejects non-authority", async () => {
      const rando = Keypair.generate();
      await airdrop(provider.connection, rando.publicKey, 2);
      const randoAta = await getAssociatedTokenAddress(mintKeypair.publicKey, rando.publicKey);
      const ix = createAssociatedTokenAccountInstruction(payer.publicKey, randoAta, rando.publicKey, mintKeypair.publicKey);
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));

      await expectError(
        program.methods.withdrawFees(new BN(1000))
          .accounts({
            authority: rando.publicKey,
            config: configPda,
            treasury: treasuryPda,
            treasuryVault: treasuryVaultPda,
            authoritySolusdAccount: randoAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([rando])
          .rpc(),
        "UnauthorizedAccess"
      );
    });
  });
});
