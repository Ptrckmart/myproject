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

describe("solUSD Fiat-Backed Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Myproject as Program<Myproject>;
  const authority = provider.wallet;

  const mintKeypair = Keypair.generate();
  let configPda: PublicKey;
  let mintAuthorityPda: PublicKey;
  let reservePda: PublicKey;
  let treasuryPda: PublicKey;
  let userSolusdAccount: PublicKey;

  // Protocol parameters
  const feeBps = new anchor.BN(30); // 0.30%
  const initialSolPriceUsd = new anchor.BN(150_000_000); // $150.00 (6 decimals)

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
    userSolusdAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      authority.publicKey
    );
  });

  it("Initializes the protocol", async () => {
    const pythPlaceholder = SystemProgram.programId;

    const tx = await program.methods
      .initialize(feeBps, initialSolPriceUsd)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        mintAuthority: mintAuthorityPda,
        reserve: reservePda,
        treasury: treasuryPda,
        pythSolUsdFeed: pythPlaceholder,
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
    assert.equal(config.feeBps.toNumber(), 30);
    assert.equal(config.solPriceUsd.toNumber(), 150_000_000);
    assert.equal(config.totalSolReserves.toNumber(), 0);
    assert.equal(config.totalSolusdMinted.toNumber(), 0);
  });

  it("Mints solUSD by depositing SOL", async () => {
    // Create the user's associated token account for solUSD
    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      userSolusdAccount,
      authority.publicKey,
      mintKeypair.publicKey
    );
    const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
    await provider.sendAndConfirm(createAtaTx);

    const solAmount = new anchor.BN(LAMPORTS_PER_SOL); // 1 SOL

    // Expected: fee = 1_000_000_000 * 30 / 10_000 = 3_000_000 lamports
    // net_sol = 1_000_000_000 - 3_000_000 = 997_000_000
    // solusd = 997_000_000 * 150_000_000 / 1_000_000_000 = 149_550_000
    const expectedFee = 3_000_000;
    const expectedNetSol = 997_000_000;
    const expectedSolusd = 149_550_000;

    const treasuryBefore = await provider.connection.getBalance(treasuryPda);

    const tx = await program.methods
      .mint(solAmount)
      .accounts({
        user: authority.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        mintAuthority: mintAuthorityPda,
        reserve: reservePda,
        treasury: treasuryPda,
        userSolusdAccount: userSolusdAccount,
        pythPriceFeed: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Mint tx:", tx);

    // Verify config accounting
    const config = await program.account.config.fetch(configPda);
    assert.equal(config.totalSolReserves.toNumber(), expectedNetSol);
    assert.equal(config.totalSolusdMinted.toNumber(), expectedSolusd);

    // Verify treasury received fees
    const treasuryAfter = await provider.connection.getBalance(treasuryPda);
    assert.equal(treasuryAfter - treasuryBefore, expectedFee);
  });

  it("Mints for a second user", async () => {
    const secondUser = Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      secondUser.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Create ATA for second user
    const secondUserAta = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      secondUser.publicKey
    );
    const createAtaIx = createAssociatedTokenAccountInstruction(
      secondUser.publicKey,
      secondUserAta,
      secondUser.publicKey,
      mintKeypair.publicKey
    );
    const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
    createAtaTx.feePayer = secondUser.publicKey;
    createAtaTx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
    createAtaTx.sign(secondUser);
    const ataSig = await provider.connection.sendRawTransaction(createAtaTx.serialize());
    await provider.connection.confirmTransaction(ataSig);

    const solAmount = new anchor.BN(2 * LAMPORTS_PER_SOL); // 2 SOL

    // Expected: fee = 2_000_000_000 * 30 / 10_000 = 6_000_000
    // net_sol = 2_000_000_000 - 6_000_000 = 1_994_000_000
    // solusd = 1_994_000_000 * 150_000_000 / 1_000_000_000 = 299_100_000

    await program.methods
      .mint(solAmount)
      .accounts({
        user: secondUser.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        mintAuthority: mintAuthorityPda,
        reserve: reservePda,
        treasury: treasuryPda,
        userSolusdAccount: secondUserAta,
        pythPriceFeed: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([secondUser])
      .rpc();

    // Verify additive accounting
    const config = await program.account.config.fetch(configPda);
    assert.equal(config.totalSolReserves.toNumber(), 997_000_000 + 1_994_000_000);
    assert.equal(config.totalSolusdMinted.toNumber(), 149_550_000 + 299_100_000);
  });

  it("Redeems solUSD for SOL", async () => {
    const solusdAmount = new anchor.BN(50_000_000); // 50 solUSD

    // Expected: gross_sol = 50_000_000 * 1_000_000_000 / 150_000_000 = 333_333_333
    // fee = 333_333_333 * 30 / 10_000 = 999_999
    // net_sol = 333_333_333 - 999_999 = 332_333_334
    const expectedGrossSol = 333_333_333;

    const configBefore = await program.account.config.fetch(configPda);
    const reservesBefore = configBefore.totalSolReserves.toNumber();
    const mintedBefore = configBefore.totalSolusdMinted.toNumber();

    const tx = await program.methods
      .redeem(solusdAmount)
      .accounts({
        user: authority.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        reserve: reservePda,
        treasury: treasuryPda,
        userSolusdAccount: userSolusdAccount,
        pythPriceFeed: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Redeem tx:", tx);

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.totalSolReserves.toNumber(), reservesBefore - expectedGrossSol);
    assert.equal(config.totalSolusdMinted.toNumber(), mintedBefore - 50_000_000);
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
          reserve: reservePda,
          treasury: treasuryPda,
          userSolusdAccount: userSolusdAccount,
          pythPriceFeed: null,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
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
        err.toString().includes("6005")
      );
    }
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

    // Reset price for remaining tests
    await program.methods
      .updatePrice(initialSolPriceUsd)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();
  });

  it("Withdraws fees from treasury (admin)", async () => {
    const treasuryBalance = await provider.connection.getBalance(treasuryPda);
    assert.isAbove(treasuryBalance, 0, "Treasury should have fees");

    const authorityBefore = await provider.connection.getBalance(authority.publicKey);
    const withdrawAmount = new anchor.BN(1_000_000); // 0.001 SOL

    const tx = await program.methods
      .withdrawFees(withdrawAmount)
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Withdraw fees tx:", tx);

    const treasuryAfter = await provider.connection.getBalance(treasuryPda);
    assert.equal(treasuryAfter, treasuryBalance - 1_000_000);
  });

  it("Rejects unauthorized admin operations", async () => {
    const randomUser = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      randomUser.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Try update_price
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
    } catch (err: any) {
      if (err.message === "Should have failed with unauthorized access") throw err;
      assert.ok(
        err.toString().includes("Unauthorized") ||
        err.toString().includes("ConstraintRaw") ||
        err.toString().includes("2012") ||
        err.toString().includes("6004")
      );
    }

    // Try update_fee
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
      if (err.message === "Should have failed with unauthorized access") throw err;
      assert.ok(
        err.toString().includes("Unauthorized") ||
        err.toString().includes("ConstraintRaw") ||
        err.toString().includes("2012") ||
        err.toString().includes("6004")
      );
    }

    // Try withdraw_fees
    try {
      await program.methods
        .withdrawFees(new anchor.BN(1000))
        .accounts({
          authority: randomUser.publicKey,
          config: configPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([randomUser])
        .rpc();
      assert.fail("Should have failed with unauthorized access");
    } catch (err: any) {
      if (err.message === "Should have failed with unauthorized access") throw err;
      assert.ok(
        err.toString().includes("Unauthorized") ||
        err.toString().includes("ConstraintRaw") ||
        err.toString().includes("2012") ||
        err.toString().includes("6004")
      );
    }
  });
});
