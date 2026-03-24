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
  createMint,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("solUSD USDC-Backed Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Myproject as Program<Myproject>;
  const authority = provider.wallet;
  const payer = (authority as any).payer as Keypair;

  const mintKeypair = Keypair.generate();
  let configPda: PublicKey;
  let mintAuthorityPda: PublicKey;
  let reservePda: PublicKey;
  let treasuryPda: PublicKey;
  let reserveVaultPda: PublicKey;
  let treasuryVaultPda: PublicKey;

  // USDC mint (fake for testing)
  let usdcMint: PublicKey;
  let authorityUsdcAccount: PublicKey;
  let authoritySolusdAccount: PublicKey;

  // Protocol parameters
  const feeBps = new anchor.BN(30); // 0.30%
  const USDC_DECIMALS = 6;
  const ONE_USDC = 1_000_000; // 10^6

  before(async () => {
    // Derive PDAs
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
    [mintAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint-authority")],
      program.programId
    );
    [reservePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reserve")],
      program.programId
    );
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );
    [reserveVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reserve-vault")],
      program.programId
    );
    [treasuryVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury-vault")],
      program.programId
    );

    // Create a fake USDC mint on localnet (authority = provider wallet)
    usdcMint = await createMint(
      provider.connection,
      payer,
      authority.publicKey, // mint authority
      null,                // freeze authority
      USDC_DECIMALS
    );

    // Create authority's USDC token account
    authorityUsdcAccount = await getAssociatedTokenAddress(
      usdcMint,
      authority.publicKey
    );
    const createUsdcAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      authorityUsdcAccount,
      authority.publicKey,
      usdcMint
    );
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(createUsdcAtaIx)
    );

    // Mint 10,000 USDC to authority
    await mintTo(
      provider.connection,
      payer,
      usdcMint,
      authorityUsdcAccount,
      authority.publicKey, // mint authority
      10_000 * ONE_USDC
    );

    // Derive authority's solUSD ATA (created later after mint is initialized)
    authoritySolusdAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      authority.publicKey
    );
  });

  it("Initializes the protocol", async () => {
    const tx = await program.methods
      .initialize(feeBps)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        usdcMint: usdcMint,
        mintAuthority: mintAuthorityPda,
        reserveVault: reserveVaultPda,
        reserve: reservePda,
        treasuryVault: treasuryVaultPda,
        treasury: treasuryPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    console.log("Initialize tx:", tx);

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(config.mint.toBase58(), mintKeypair.publicKey.toBase58());
    assert.equal(config.usdcMint.toBase58(), usdcMint.toBase58());
    assert.equal(config.feeBps.toNumber(), 30);
    assert.equal(config.totalUsdcReserves.toNumber(), 0);
    assert.equal(config.totalSolusdMinted.toNumber(), 0);
  });

  it("Mints solUSD by depositing USDC", async () => {
    // Create authority's solUSD ATA
    const createSolusdAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      authoritySolusdAccount,
      authority.publicKey,
      mintKeypair.publicKey
    );
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(createSolusdAtaIx)
    );

    const usdcAmount = new anchor.BN(100 * ONE_USDC); // 100 USDC

    // Expected: fee = 100_000_000 * 30 / 10_000 = 300_000 (0.30 USDC)
    // net_usdc = 100_000_000 - 300_000 = 99_700_000
    // solusd_minted = 99_700_000 (1:1)
    const expectedFee = 300_000;
    const expectedNetUsdc = 99_700_000;
    const expectedSolusd = 99_700_000;

    const treasuryBefore = Number(
      (await getAccount(provider.connection, treasuryVaultPda)).amount
    );

    const tx = await program.methods
      .mint(usdcAmount)
      .accounts({
        user: authority.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        mintAuthority: mintAuthorityPda,
        reserveVault: reserveVaultPda,
        treasuryVault: treasuryVaultPda,
        userUsdcAccount: authorityUsdcAccount,
        userSolusdAccount: authoritySolusdAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Mint tx:", tx);

    // Verify config accounting
    const config = await program.account.config.fetch(configPda);
    assert.equal(config.totalUsdcReserves.toNumber(), expectedNetUsdc);
    assert.equal(config.totalSolusdMinted.toNumber(), expectedSolusd);

    // Verify treasury received fees
    const treasuryAfter = Number(
      (await getAccount(provider.connection, treasuryVaultPda)).amount
    );
    assert.equal(treasuryAfter - treasuryBefore, expectedFee);

    // Verify user received solUSD
    const solusdBalance = Number(
      (await getAccount(provider.connection, authoritySolusdAccount)).amount
    );
    assert.equal(solusdBalance, expectedSolusd);
  });

  it("Mints for a second user", async () => {
    const secondUser = Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      secondUser.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Create second user's USDC ATA
    const secondUserUsdcAta = await getAssociatedTokenAddress(
      usdcMint,
      secondUser.publicKey
    );
    const createUsdcAtaIx = createAssociatedTokenAccountInstruction(
      secondUser.publicKey,
      secondUserUsdcAta,
      secondUser.publicKey,
      usdcMint
    );
    const createUsdcTx = new anchor.web3.Transaction().add(createUsdcAtaIx);
    createUsdcTx.feePayer = secondUser.publicKey;
    createUsdcTx.recentBlockhash = (
      await provider.connection.getLatestBlockhash()
    ).blockhash;
    createUsdcTx.sign(secondUser);
    const usdcAtaSig = await provider.connection.sendRawTransaction(
      createUsdcTx.serialize()
    );
    await provider.connection.confirmTransaction(usdcAtaSig);

    // Mint 5,000 USDC to second user (authority is USDC mint authority)
    await mintTo(
      provider.connection,
      payer,
      usdcMint,
      secondUserUsdcAta,
      authority.publicKey,
      5_000 * ONE_USDC
    );

    // Create second user's solUSD ATA
    const secondUserSolusdAta = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      secondUser.publicKey
    );
    const createSolusdAtaIx = createAssociatedTokenAccountInstruction(
      secondUser.publicKey,
      secondUserSolusdAta,
      secondUser.publicKey,
      mintKeypair.publicKey
    );
    const createSolusdTx = new anchor.web3.Transaction().add(
      createSolusdAtaIx
    );
    createSolusdTx.feePayer = secondUser.publicKey;
    createSolusdTx.recentBlockhash = (
      await provider.connection.getLatestBlockhash()
    ).blockhash;
    createSolusdTx.sign(secondUser);
    const solusdAtaSig = await provider.connection.sendRawTransaction(
      createSolusdTx.serialize()
    );
    await provider.connection.confirmTransaction(solusdAtaSig);

    const usdcAmount = new anchor.BN(200 * ONE_USDC); // 200 USDC

    // Expected: fee = 200_000_000 * 30 / 10_000 = 600_000
    // net_usdc = 200_000_000 - 600_000 = 199_400_000
    const expectedNetUsdc = 199_400_000;

    await program.methods
      .mint(usdcAmount)
      .accounts({
        user: secondUser.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        mintAuthority: mintAuthorityPda,
        reserveVault: reserveVaultPda,
        treasuryVault: treasuryVaultPda,
        userUsdcAccount: secondUserUsdcAta,
        userSolusdAccount: secondUserSolusdAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([secondUser])
      .rpc();

    // Verify additive accounting
    const config = await program.account.config.fetch(configPda);
    assert.equal(
      config.totalUsdcReserves.toNumber(),
      99_700_000 + expectedNetUsdc
    );
    assert.equal(
      config.totalSolusdMinted.toNumber(),
      99_700_000 + expectedNetUsdc
    );
  });

  it("Redeems solUSD for USDC", async () => {
    const solusdAmount = new anchor.BN(50 * ONE_USDC); // 50 solUSD

    // Expected: gross_usdc = 50_000_000 (1:1)
    // fee = 50_000_000 * 30 / 10_000 = 150_000
    // net_usdc_to_user = 50_000_000 - 150_000 = 49_850_000
    const expectedGrossUsdc = 50_000_000;

    const configBefore = await program.account.config.fetch(configPda);
    const reservesBefore = configBefore.totalUsdcReserves.toNumber();
    const mintedBefore = configBefore.totalSolusdMinted.toNumber();

    const userUsdcBefore = Number(
      (await getAccount(provider.connection, authorityUsdcAccount)).amount
    );

    const tx = await program.methods
      .redeem(solusdAmount)
      .accounts({
        user: authority.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        reserve: reservePda,
        reserveVault: reserveVaultPda,
        treasuryVault: treasuryVaultPda,
        userUsdcAccount: authorityUsdcAccount,
        userSolusdAccount: authoritySolusdAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Redeem tx:", tx);

    const config = await program.account.config.fetch(configPda);
    assert.equal(
      config.totalUsdcReserves.toNumber(),
      reservesBefore - expectedGrossUsdc
    );
    assert.equal(
      config.totalSolusdMinted.toNumber(),
      mintedBefore - 50_000_000
    );

    // Verify user received net USDC (49.85 USDC)
    const userUsdcAfter = Number(
      (await getAccount(provider.connection, authorityUsdcAccount)).amount
    );
    assert.equal(userUsdcAfter - userUsdcBefore, 49_850_000);
  });

  it("Fails to mint with zero amount", async () => {
    try {
      await program.methods
        .mint(new anchor.BN(0))
        .accounts({
          user: authority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          mintAuthority: mintAuthorityPda,
          reserveVault: reserveVaultPda,
          treasuryVault: treasuryVaultPda,
          userUsdcAccount: authorityUsdcAccount,
          userSolusdAccount: authoritySolusdAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should have failed with zero amount");
    } catch (err: any) {
      if (err.message === "Should have failed with zero amount") throw err;
      assert.ok(
        err.toString().includes("Amount must be greater than zero") ||
          err.toString().includes("ZeroAmount") ||
          err.toString().includes("6000")
      );
    }
  });

  it("Updates fee rate (admin)", async () => {
    const newFeeBps = new anchor.BN(50); // 0.50%

    const tx = await program.methods
      .updateFee(newFeeBps)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    console.log("Update fee tx:", tx);

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.feeBps.toNumber(), 50);

    // Reset fee for remaining tests
    await program.methods
      .updateFee(feeBps)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();
  });

  it("Rejects fee above maximum", async () => {
    try {
      await program.methods
        .updateFee(new anchor.BN(1001))
        .accounts({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();
      assert.fail("Should have failed with fee too high");
    } catch (err: any) {
      if (err.message === "Should have failed with fee too high") throw err;
      assert.ok(
        err.toString().includes("Fee must not exceed") ||
          err.toString().includes("FeeTooHigh") ||
          err.toString().includes("6003")
      );
    }
  });

  it("Withdraws fees from treasury (admin)", async () => {
    const treasuryBalance = Number(
      (await getAccount(provider.connection, treasuryVaultPda)).amount
    );
    assert.isAbove(treasuryBalance, 0, "Treasury should have fees");

    const withdrawAmount = new anchor.BN(100_000); // 0.10 USDC

    const authorityUsdcBefore = Number(
      (await getAccount(provider.connection, authorityUsdcAccount)).amount
    );

    const tx = await program.methods
      .withdrawFees(withdrawAmount)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        treasury: treasuryPda,
        treasuryVault: treasuryVaultPda,
        authorityUsdcAccount: authorityUsdcAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Withdraw fees tx:", tx);

    const treasuryAfter = Number(
      (await getAccount(provider.connection, treasuryVaultPda)).amount
    );
    assert.equal(treasuryAfter, treasuryBalance - 100_000);

    const authorityUsdcAfter = Number(
      (await getAccount(provider.connection, authorityUsdcAccount)).amount
    );
    assert.equal(authorityUsdcAfter - authorityUsdcBefore, 100_000);
  });

  it("Rejects unauthorized admin operations", async () => {
    const randomUser = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      randomUser.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Try update_fee with non-authority
    try {
      await program.methods
        .updateFee(new anchor.BN(100))
        .accounts({
          authority: randomUser.publicKey,
          config: configPda,
        })
        .signers([randomUser])
        .rpc();
      assert.fail("Should have failed with unauthorized access");
    } catch (err: any) {
      if (err.message === "Should have failed with unauthorized access")
        throw err;
      assert.ok(
        err.toString().includes("Unauthorized") ||
          err.toString().includes("ConstraintRaw") ||
          err.toString().includes("2012") ||
          err.toString().includes("6002")
      );
    }

    // Create random user's USDC ATA for withdraw_fees test
    const randomUserUsdcAta = await getAssociatedTokenAddress(
      usdcMint,
      randomUser.publicKey
    );
    const createAtaIx = createAssociatedTokenAccountInstruction(
      randomUser.publicKey,
      randomUserUsdcAta,
      randomUser.publicKey,
      usdcMint
    );
    const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
    createAtaTx.feePayer = randomUser.publicKey;
    createAtaTx.recentBlockhash = (
      await provider.connection.getLatestBlockhash()
    ).blockhash;
    createAtaTx.sign(randomUser);
    const ataSig = await provider.connection.sendRawTransaction(
      createAtaTx.serialize()
    );
    await provider.connection.confirmTransaction(ataSig);

    // Try withdraw_fees with non-authority
    try {
      await program.methods
        .withdrawFees(new anchor.BN(1000))
        .accounts({
          authority: randomUser.publicKey,
          config: configPda,
          treasury: treasuryPda,
          treasuryVault: treasuryVaultPda,
          authorityUsdcAccount: randomUserUsdcAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([randomUser])
        .rpc();
      assert.fail("Should have failed with unauthorized access");
    } catch (err: any) {
      if (err.message === "Should have failed with unauthorized access")
        throw err;
      assert.ok(
        err.toString().includes("Unauthorized") ||
          err.toString().includes("ConstraintRaw") ||
          err.toString().includes("2012") ||
          err.toString().includes("6002")
      );
    }
  });
});
