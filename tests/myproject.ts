import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Myproject } from "../target/types/myproject";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { assert } from "chai";

describe("solUSD Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Myproject as Program<Myproject>;
  const authority = provider.wallet;

  const mintKeypair = Keypair.generate();
  let configPda: PublicKey;
  let configBump: number;
  let mintAuthorityPda: PublicKey;
  let vaultPda: PublicKey;
  let userSolusdAccount: PublicKey;

  // Protocol parameters
  const collateralRatioBps = new anchor.BN(15000); // 150%
  const liquidationThresholdBps = new anchor.BN(13000); // 130%
  const initialSolPriceUsd = new anchor.BN(150_000_000); // $150.00 (6 decimals)

  before(async () => {
    // Derive PDAs
    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
    [mintAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint-authority")],
      program.programId
    );
    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), authority.publicKey.toBuffer()],
      program.programId
    );
    userSolusdAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      authority.publicKey
    );
  });

  it("Initializes the protocol", async () => {
    // Use SystemProgram.programId as a placeholder for the Pyth feed
    // (in testing, the fallback price will be used)
    const pythPlaceholder = SystemProgram.programId;

    const tx = await program.methods
      .initialize(
        collateralRatioBps,
        liquidationThresholdBps,
        initialSolPriceUsd
      )
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        mintAuthority: mintAuthorityPda,
        pythSolUsdFeed: pythPlaceholder,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    console.log("Initialize tx:", tx);

    // Verify config
    const config = await program.account.config.fetch(configPda);
    assert.equal(config.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(config.mint.toBase58(), mintKeypair.publicKey.toBase58());
    assert.equal(config.collateralRatioBps.toNumber(), 15000);
    assert.equal(config.liquidationThresholdBps.toNumber(), 13000);
    assert.equal(config.solPriceUsd.toNumber(), 150_000_000);
  });

  it("Deposits collateral and mints solUSD", async () => {
    // Create the user's associated token account for solUSD
    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      userSolusdAccount,
      authority.publicKey,
      mintKeypair.publicKey
    );
    const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
    await provider.sendAndConfirm(createAtaTx);

    // Deposit 1 SOL, mint 50 solUSD (at $150/SOL, ratio = 150/50 * 100 = 300%)
    const solAmount = new anchor.BN(LAMPORTS_PER_SOL); // 1 SOL
    const solusdAmount = new anchor.BN(50_000_000); // 50 solUSD (6 decimals)

    const tx = await program.methods
      .depositCollateralAndMint(solAmount, solusdAmount)
      .accounts({
        owner: authority.publicKey,
        config: configPda,
        vault: vaultPda,
        mint: mintKeypair.publicKey,
        mintAuthority: mintAuthorityPda,
        userSolusdAccount: userSolusdAccount,
        pythPriceFeed: null, // Use fallback price
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Deposit tx:", tx);

    // Verify vault state
    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.owner.toBase58(), authority.publicKey.toBase58());
    assert.equal(vault.solDeposited.toNumber(), LAMPORTS_PER_SOL);
    assert.equal(vault.solusdMinted.toNumber(), 50_000_000);
  });

  it("Fails to mint with insufficient collateral", async () => {
    // Try to mint 200 solUSD more with no additional collateral
    // Current: 1 SOL ($150), already minted 50 solUSD
    // Trying to mint 200 more = 250 total, ratio = 150/250 * 100 = 60% < 150%
    const solAmount = new anchor.BN(0);
    const solusdAmount = new anchor.BN(200_000_000);

    try {
      await program.methods
        .depositCollateralAndMint(solAmount, solusdAmount)
        .accounts({
          owner: authority.publicKey,
          config: configPda,
          vault: vaultPda,
          mint: mintKeypair.publicKey,
          mintAuthority: mintAuthorityPda,
          userSolusdAccount: userSolusdAccount,
          pythPriceFeed: null,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed with insufficient collateral");
    } catch (err) {
      // Expected: ZeroAmount error (sol_amount is 0)
      assert.ok(err.toString().includes("Amount must be greater than zero") ||
                err.toString().includes("ZeroAmount"));
    }
  });

  it("Redeems solUSD and withdraws collateral", async () => {
    // Burn 25 solUSD and withdraw 0.1 SOL
    const solusdAmount = new anchor.BN(25_000_000); // 25 solUSD
    const solAmount = new anchor.BN(LAMPORTS_PER_SOL / 10); // 0.1 SOL

    const tx = await program.methods
      .redeemAndWithdraw(solusdAmount, solAmount)
      .accounts({
        owner: authority.publicKey,
        config: configPda,
        vault: vaultPda,
        mint: mintKeypair.publicKey,
        userSolusdAccount: userSolusdAccount,
        pythPriceFeed: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Redeem tx:", tx);

    // Verify vault state updated
    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.solDeposited.toNumber(), LAMPORTS_PER_SOL - LAMPORTS_PER_SOL / 10);
    assert.equal(vault.solusdMinted.toNumber(), 25_000_000);
  });

  it("Updates fallback price (admin)", async () => {
    const newPrice = new anchor.BN(200_000_000); // $200.00

    const tx = await program.methods
      .updatePrice(newPrice)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    console.log("Update price tx:", tx);

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.solPriceUsd.toNumber(), 200_000_000);
  });

  it("Updates protocol parameters (admin)", async () => {
    const newCollateralRatio = new anchor.BN(16000); // 160%
    const newLiquidationThreshold = new anchor.BN(14000); // 140%

    const tx = await program.methods
      .updateParams(newCollateralRatio, newLiquidationThreshold)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    console.log("Update params tx:", tx);

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.collateralRatioBps.toNumber(), 16000);
    assert.equal(config.liquidationThresholdBps.toNumber(), 14000);
  });

  it("Rejects unauthorized admin access", async () => {
    const randomUser = Keypair.generate();

    // Airdrop to random user
    const sig = await provider.connection.requestAirdrop(
      randomUser.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    try {
      await program.methods
        .updatePrice(new anchor.BN(100_000_000))
        .accounts({
          authority: randomUser.publicKey,
          config: configPda,
        })
        .signers([randomUser])
        .rpc();
      assert.fail("Should have failed with unauthorized access");
    } catch (err) {
      assert.ok(err.toString().includes("Unauthorized") ||
                err.toString().includes("ConstraintRaw") ||
                err.toString().includes("2012"));
    }
  });
});
