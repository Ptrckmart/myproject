# CLAUDE.md — solUSD API (Phase 10)

This is the off-chain API service for solUSD. It is a Node.js/TypeScript Express server. The on-chain Rust/Anchor program lives in `../programs/`. Read `../CLAUDE.md` for on-chain context.

---

## Quick Reference — Task to File

| Task | File |
|---|---|
| Add/change an endpoint | `src/index.ts` |
| Change on-chain calls | `src/chain.ts` |
| Change database schema or queries | `src/store.ts` |
| Change mock bank behavior | `src/mock-bank.ts` |
| Change oracle polling | `src/oracle.ts` |
| Change event listener logic | `src/listener.ts` |
| Change 72h timeout monitor | `src/monitor.ts` |
| Build checklist / stage status | `../API_BUILD_CHECKLIST.md` |
| On-chain instruction reference | `../tests/myproject.ts` (working TS examples of every instruction) |
| IDL | `../target/idl/myproject.json` |

---

## Build & Run Commands

```bash
# From api/ directory
yarn install
npx ts-node src/index.ts

# Or with auto-reload during development
npx ts-node-dev src/index.ts
```

---

## Key Facts

- **Program ID (devnet):** `3mcYviYiePvUudVFgYKwzipqNhUTDxTtgth2v9ApThMU`
- **Network:** devnet (not mainnet)
- **IDL path from `src/`:** `../../target/idl/myproject.json`
- **IDL path from `api/`:** `../target/idl/myproject.json`
- **Keypairs:** stored in `api/keypairs/` — gitignored, never commit
- **Database:** SQLite at path from `DB_PATH` env var

---

## Reference Implementation

**`../tests/myproject.ts` has working TypeScript examples of every on-chain instruction.** Before writing any code in `chain.ts`, read the relevant test section. The accounts structs, PDA derivations, and signer patterns are all already solved there.

Key sections to reference:
- `initialize` call → test 1.1 (lines ~114–163)
- `mintToUser` call → `mintAccounts()` helper + test 3.1 (lines ~283–325)
- `initiateRedeem` call → test 4.1 (lines ~546–595)
- `completeRedeem` call → test 5.1
- `cancelRedeem` call → test 5.2
- `updateReserves` call → test 2.1

---

## Critical Patterns

### 1 — Dual-Sig Transaction (mintToUser)

`mintToUser` requires both `mintingAuthority` and `coSigner` to sign. Pass both as signers — Anchor handles the rest:

```typescript
const sig = await program.methods
  .mintToUser(new PublicKey(userWallet), new BN(amount))
  .accounts({
    mintingAuthority: mintingAuthority.publicKey,
    coSigner: coSigner.publicKey,
    config: configPda,
    mint: mintPublicKey,
    mintAuthority: mintAuthorityPda,
    oracleConfig: oracleConfigPda,
    treasuryVault: treasuryVaultPda,
    userSolusdAccount: userAta,
    blacklistedAccount: program.programId,  // sentinel — see below
    frozenAccount: program.programId,        // sentinel — see below
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  })
  .signers([mintingAuthority, coSigner])
  .rpc();
```

If the provider wallet is not one of the signers, use `.signers([mintingAuthority, coSigner])` and Anchor signs with both.

### 2 — Optional Account Sentinel

`mintToUser` and `initiateRedeem` have optional `frozenAccount` and `blacklistedAccount` accounts. The Anchor 0.30.1 client requires every IDL account to be provided. Pass `program.programId` as a sentinel when the user is not frozen/blacklisted:

```typescript
blacklistedAccount: program.programId,
frozenAccount: program.programId,
```

This is the same pattern used in `../tests/myproject.ts`. The on-chain program checks `account.is_none()` — the program ID is never a valid PDA for these seeds so it evaluates as absent.

### 3 — Anchor Event Parsing (listener.ts)

Anchor events appear in transaction logs as base64-encoded strings prefixed with `"Program data: "`. Use `program.addEventListener` for live subscriptions and manual log parsing for catch-up:

**Live subscription:**
```typescript
const listenerId = program.addEventListener('RedeemInitiated', (event, slot, sig) => {
  // event.user: PublicKey
  // event.amount: BN
  // event.redemptionId: BN
  // event.timestamp: BN
  handleRedeem(event);
});

// On shutdown:
await program.removeEventListener(listenerId);
```

**Catch-up on restart (parse historical transactions):**
```typescript
const signatures = await connection.getSignaturesForAddress(
  programId,
  { limit: 100 },
  'confirmed'
);

for (const { signature } of signatures) {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta?.logMessages) continue;

  for (const log of tx.meta.logMessages) {
    if (!log.startsWith('Program data: ')) continue;
    const event = program.coder.events.decode(log.slice('Program data: '.length));
    if (event?.name === 'RedeemInitiated') {
      handleRedeem(event.data);
    }
  }
}
```

### 4 — IDL Import

```typescript
import { Myproject } from '../../target/types/myproject';
import idl from '../../target/idl/myproject.json';
import * as anchor from '@coral-xyz/anchor';

const program = new anchor.Program(idl as anchor.Idl, provider) as anchor.Program<Myproject>;
```

### 5 — PDA Derivation in TypeScript

```typescript
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);

const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
const [mintAuthorityPda] = PublicKey.findProgramAddressSync([Buffer.from('mint-authority')], PROGRAM_ID);
const [oracleConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('oracle-config')], PROGRAM_ID);
const [treasuryVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('treasury-vault')], PROGRAM_ID);
const [redeemEscrowPda] = PublicKey.findProgramAddressSync([Buffer.from('redeem-escrow')], PROGRAM_ID);

// User-specific PDAs
const [frozenPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('frozen'), userPublicKey.toBuffer()], PROGRAM_ID
);
const [blacklistedPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('blacklisted'), userPublicKey.toBuffer()], PROGRAM_ID
);
const [redemptionPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('redemption'), userPublicKey.toBuffer(), redemptionId.toArrayLike(Buffer, 'le', 8)],
  PROGRAM_ID
);
```

---

## SQLite Schema

```sql
CREATE TABLE deposits (
  id          TEXT PRIMARY KEY,        -- reference ID returned to user
  wallet      TEXT NOT NULL,           -- Solana wallet address (base58)
  amount_usd  REAL NOT NULL,           -- USD amount requested
  status      TEXT NOT NULL            -- 'pending' | 'confirmed' | 'minted' | 'failed'
              DEFAULT 'pending',
  tx_sig      TEXT,                    -- on-chain tx signature after mint
  created_at  INTEGER NOT NULL         -- unix timestamp
);

CREATE TABLE bank_accounts (
  wallet      TEXT PRIMARY KEY,        -- Solana wallet address (base58)
  bank_acct   TEXT NOT NULL,           -- bank account string (mock or real)
  created_at  INTEGER NOT NULL
);

CREATE TABLE redemptions (
  redemption_id  INTEGER PRIMARY KEY,  -- matches on-chain redemption_counter
  wallet         TEXT NOT NULL,        -- Solana wallet address
  amount         INTEGER NOT NULL,     -- solUSD amount (base units, 6 decimals)
  status         TEXT NOT NULL         -- 'pending' | 'wired' | 'completed' | 'cancelled'
                 DEFAULT 'pending',
  wire_ref       TEXT,                 -- bank wire reference ID
  created_at     INTEGER NOT NULL
);
```

---

## Devnet Initialization

The program is deployed at `3mcYviYiePvUudVFgYKwzipqNhUTDxTtgth2v9ApThMU` but **not yet initialized** — no Config account exists. Before any API calls will work, `initialize` must be called once with the minting authority and co-signer keypairs generated in Stage 1.

See `../tests/myproject.ts` test 1.1 for the exact accounts and args. Run as a one-time setup script from `api/scripts/initialize-devnet.ts`.

---

## Gotchas

- **`BN` for all u64/i64 values** — Anchor serializes all integer types > 32-bit as `BN`. Always wrap amounts, caps, and IDs in `new BN(value)`.
- **ATA must exist before minting** — `mintToUser` writes to `userSolusdAccount` (an ATA). If the account doesn't exist yet, create it with `createAssociatedTokenAccountInstruction` before calling `mintToUser`, or use `initIfNeeded` in the accounts struct (check if the IDL marks it as such).
- **`redemption_id` is the current counter value** — read `config.redemptionCounter` before calling `initiateRedeem` to derive the correct PDA. The counter increments after the call.
- **Devnet RPC can be flaky** — use `--max-sign-attempts 20` for deploys and add retry logic to transaction sends in `chain.ts`.
