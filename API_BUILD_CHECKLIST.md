# Phase 10 — API Build Checklist

Work through these in order. Each item is a discrete unit that can be committed and pushed individually.

---

## Stage 1 — Keypair Setup

- [ ] Generate minting authority keypair: `solana-keygen new -o api/keypairs/minting-authority.json`
- [ ] Generate co-signer keypair: `solana-keygen new -o api/keypairs/co-signer.json`
- [ ] Airdrop devnet SOL to both: `solana airdrop 2 <pubkey> --url devnet` (need SOL to sign transactions)
- [ ] Add `api/keypairs/` to `.gitignore` — never commit keypair files
- [ ] Record both public keys — they must be passed to `initialize` when setting up the on-chain program on devnet

## Stage 2 — Project Scaffold

- [ ] Create `api/package.json` with dependencies (Express, Anchor, @solana/web3.js, dotenv, ts-node, better-sqlite3)
- [ ] Create `api/tsconfig.json`
- [ ] Create `api/.env.example` (see template at bottom of this file)
- [ ] Create `api/.env` from the example, fill in values
- [ ] Create `api/.gitignore` (ignore `node_modules/`, `.env`, `keypairs/`)
- [ ] Run `yarn install` inside `api/` and confirm no errors
- [ ] Create `api/src/index.ts` — bare Express server that starts and listens on a port
- [ ] Confirm server starts: `npx ts-node src/index.ts`

## Stage 3 — State Store

- [ ] Create `api/src/store.ts` — SQLite database (better-sqlite3) with two tables:
  - `deposits` — `(id, wallet_address, amount_usd, status, tx_signature, created_at)`
  - `bank_accounts` — `(wallet_address, bank_account, created_at)`
- [ ] Write `createDeposit()`, `getDeposit()`, `updateDepositStatus()` functions
- [ ] Write `registerBankAccount()`, `getBankAccount()` functions
- [ ] Confirm database file is created on first run and persists across restarts

## Stage 4 — Anchor Client

- [ ] Create `api/src/chain.ts`
- [ ] Load minting authority and co-signer keypairs from paths in `.env`
- [ ] Connect to RPC endpoint from `.env`
- [ ] Load the IDL and initialize the Anchor program client
- [ ] Write `getConfig()` — fetches and returns the on-chain Config account
- [ ] Write `mintToUser(walletAddress, amount)` — builds and sends a dual-signed `mint_to_user` transaction (both minting authority and co-signer sign in the same transaction)
- [ ] Write `completeRedeem(user, redemptionId)` — calls `complete_redeem` on-chain
- [ ] Write `cancelRedeem(user, redemptionId)` — calls `cancel_redeem` on-chain
- [ ] Test: call `getConfig()` against devnet and confirm it returns data

## Stage 5 — Mock Bank

- [ ] Create `api/src/mock-bank.ts`
- [ ] `getBalance(): Promise<number>` — returns `MOCK_BANK_BALANCE_USD` from env
- [ ] `confirmDeposit(id: string): Promise<boolean>` — returns true after `MOCK_BANK_CONFIRM_DELAY_MS`
- [ ] `sendWire(bankAccount: string, amount: number): Promise<string>` — logs the wire, returns a fake reference ID
- [ ] `confirmWire(referenceId: string): Promise<boolean>` — simulates wire confirmation (returns true after delay)
- [ ] All functions log their actions to console so you can follow the flow

## Stage 6 — Oracle Service

- [ ] Create `api/src/oracle.ts`
- [ ] `updateReserves()` — calls `getBalance()` from bank, then calls `update_reserves` on-chain
- [ ] Test: call `updateReserves()` once manually, confirm OracleConfig is updated on devnet
- [ ] Implement polling loop — calls `updateReserves()` every `ORACLE_POLL_INTERVAL_MS` (default 12h)
- [ ] Startup call — run `updateReserves()` once immediately on server start

## Stage 7 — Event Listener

- [ ] Create `api/src/listener.ts`
- [ ] On startup: query recent transactions to catch any `RedeemInitiated` events missed while server was down
- [ ] Subscribe to program logs using `connection.onLogs`
- [ ] Parse `RedeemInitiated` events — extract `user`, `amount`, `redemption_id`
- [ ] On each event: look up bank account for user, call `sendWire()`, update deposit record status to `wired`
- [ ] After wire confirmed: call `completeRedeem()` on-chain, update status to `completed`
- [ ] If wire fails: call `cancelRedeem()` on-chain, update status to `cancelled`
- [ ] Log all events and actions
- [ ] Test: call `initiateRedeem` on devnet directly, confirm listener fires and flow completes

## Stage 8 — 72h Timeout Monitor

- [ ] Create `api/src/monitor.ts`
- [ ] Every 15 minutes: query all `RedemptionRecord` accounts on-chain with status `Pending`
- [ ] For any record where `timestamp + 72h` is within 6 hours of now: log a warning and alert (console for now, email/Slack later)
- [ ] This is informational only — the user calls `claim_refund` themselves; the monitor just ensures the operator is aware before it happens

## Stage 9 — REST Endpoints

- [ ] Add API key middleware — all requests must include `x-api-key` header matching `API_KEY` in `.env`
- [ ] `GET /health`
  - [ ] Return `{ status: "ok", oracleLastUpdated, configFetched, devnet: true }`
- [ ] `POST /mint/request`
  - [ ] Validate `{ walletAddress, amountUsd }` — valid Solana address, amount > 0
  - [ ] Create deposit record in SQLite
  - [ ] Return wire instructions (mock bank name, account number, reference ID)
- [ ] `GET /mint/status/:id`
  - [ ] Look up deposit by ID
  - [ ] If not confirmed yet: call `confirmDeposit(id)` from bank
  - [ ] If confirmed: call `mintToUser()` on-chain, update deposit status, return `{ status: "minted", txSignature }`
  - [ ] If pending: return `{ status: "pending" }`
- [ ] `POST /redeem/register-bank`
  - [ ] Validate `{ walletAddress, bankAccount }`
  - [ ] Store in SQLite
  - [ ] Return `{ status: "registered" }`
- [ ] `GET /redeem/status/:id`
  - [ ] Return current status from SQLite (`pending`, `wired`, `completed`, `cancelled`)

## Stage 10 — Integration Test

- [ ] Start server, confirm oracle runs and event listener is active
- [ ] `GET /health` returns ok
- [ ] **Full mint flow:**
  - [ ] `POST /mint/request` → get reference ID
  - [ ] `GET /mint/status/:id` → `pending`
  - [ ] Wait for mock confirm delay, `GET /mint/status/:id` again → `minted`
  - [ ] Check solUSD balance on devnet increased
- [ ] **Full redeem flow:**
  - [ ] `POST /redeem/register-bank` for test wallet
  - [ ] Call `initiateRedeem` on devnet
  - [ ] Confirm listener fires, wire logged, `completeRedeem` called on-chain
  - [ ] `GET /redeem/status/:id` → `completed`
  - [ ] Check redeem escrow is empty on devnet

## Stage 11 — Cleanup and Documentation

- [ ] Add try/catch and meaningful error responses to all endpoints
- [ ] Add request logging middleware (method, path, status, duration)
- [ ] Write `api/README.md` — setup, env vars, running locally, testing each flow
- [ ] Update root `README.md` to mention `api/` and link to `api/README.md`
- [ ] Final `.gitignore` audit — confirm no `.env`, keypairs, or database file is committed

---

## Environment Variables (`.env.example`)

```
# Solana
RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=3mcYviYiePvUudVFgYKwzipqNhUTDxTtgth2v9ApThMU

# Keypairs (paths to JSON files — never commit the actual files)
MINTING_AUTHORITY_KEYPAIR_PATH=./keypairs/minting-authority.json
CO_SIGNER_KEYPAIR_PATH=./keypairs/co-signer.json

# Server
PORT=3000
API_KEY=replace-with-a-long-random-string

# Oracle
ORACLE_POLL_INTERVAL_MS=43200000        # 12 hours

# Mock bank (devnet only — replace with real bank API for mainnet)
MOCK_BANK_BALANCE_USD=1000000           # Simulated reserve balance
MOCK_BANK_CONFIRM_DELAY_MS=2000         # Simulated deposit confirmation delay
MOCK_BANK_WIRE_DELAY_MS=3000            # Simulated wire confirmation delay

# Database
DB_PATH=./data/solusd.db
```

---

## File Structure (final)

```
api/
├── package.json
├── tsconfig.json
├── .env.example
├── .env                    ← gitignored
├── .gitignore
├── keypairs/               ← gitignored
│   ├── minting-authority.json
│   └── co-signer.json
├── data/                   ← gitignored
│   └── solusd.db
├── README.md
└── src/
    ├── index.ts            # Express server, mounts routes, starts oracle + listener
    ├── chain.ts            # Anchor client: getConfig, mintToUser, completeRedeem, cancelRedeem
    ├── store.ts            # SQLite: deposits and bank account tables
    ├── mock-bank.ts        # Stub bank: getBalance, confirmDeposit, sendWire, confirmWire
    ├── oracle.ts           # Polls bank balance → update_reserves on-chain
    ├── listener.ts         # Watches RedeemInitiated events → wire → completeRedeem
    └── monitor.ts          # Checks for redemptions approaching 72h timeout
```
