# Next Session — Pick Up Here

Last updated: 2026-04-04

---

## Where We Are

- On-chain program complete (phases 1–9 ✅)
- Program deployed to devnet: `3mcYviYiePvUudVFgYKwzipqNhUTDxTtgth2v9ApThMU`
- Upgrade authority: `G6Z2hMk6kZEM6ht5LhdQko3DvpUCTbnVLQhnGX6ggBRX` (default CLI wallet)
- Program is deployed but **not initialized** — no Config account exists on devnet yet
- `api/` directory does not exist yet — Phase 10 has not started
- Deployer wallet balance: ~3.17 SOL on devnet (topped up via faucet if needed)

---

## Next Step

**Start Phase 10, Stage 1 — Generate keypairs and initialize the program on devnet.**

### Step 1 — Generate keypairs

```bash
mkdir -p api/keypairs
solana-keygen new -o api/keypairs/minting-authority.json
solana-keygen new -o api/keypairs/co-signer.json
```

Fund both on devnet (need SOL to sign transactions):
```bash
solana airdrop 2 $(solana-keygen pubkey api/keypairs/minting-authority.json) --url devnet
solana airdrop 2 $(solana-keygen pubkey api/keypairs/co-signer.json) --url devnet
```

### Step 2 — Initialize the program on devnet (Stage 1b)

Create `api/scripts/initialize-devnet.ts` — a one-time script that calls `initialize` with the new keypairs. Reference `tests/myproject.ts` test 1.1 for the exact accounts and args.

Verify by fetching the Config account and confirming `mintingAuthority` and `coSigner` match the generated keypairs.

### Step 3 — Scaffold `api/` (Stage 2)

After initialization is confirmed, scaffold the Node.js/TypeScript project per Stage 2 of `API_BUILD_CHECKLIST.md`.

---

## Key Files to Read at Start of Session

| File | Why |
|---|---|
| `api/CLAUDE.md` | All API patterns, schema, gotchas — read this first |
| `API_BUILD_CHECKLIST.md` | Full 11-stage checklist — track progress here |
| `tests/myproject.ts` | Reference implementation for all on-chain calls |
| `target/idl/myproject.json` | IDL needed for Anchor client setup |

---

## Decisions Already Made

- **Tech stack:** Node.js / TypeScript / Express / SQLite (better-sqlite3)
- **Banking partner:** mock bank first, Column for production
- **API lives in:** `api/` within this repo (monorepo)
- **State store:** SQLite — schema defined in `api/CLAUDE.md`
- **Key management:** local keypair files for devnet, HSM/KMS for mainnet

---

## If Deployer Wallet Needs More SOL

```bash
solana address   # get wallet address
```
Then go to https://faucet.solana.com and request SOL for devnet.

Use `--use-rpc` and `--max-sign-attempts 20` flags if deploy transactions fail due to devnet congestion.
