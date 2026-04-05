# Phase 10 — API Build Checklist

Work through these in order. Each item is a discrete unit that can be committed and pushed individually.

---

## Stage 1 — Project Scaffold

- [ ] Create `api/package.json` with dependencies (Express, Anchor, @solana/web3.js, dotenv, ts-node)
- [ ] Create `api/tsconfig.json`
- [ ] Create `api/.env.example` with all required environment variables documented
- [ ] Create `api/.gitignore` (ignore `node_modules/`, `.env`, keypair files)
- [ ] Run `yarn install` inside `api/` and confirm no errors
- [ ] Create `api/src/index.ts` — bare Express server that starts and listens on a port
- [ ] Confirm server starts: `npx ts-node src/index.ts`

## Stage 2 — Anchor Client

- [ ] Create `api/src/chain.ts`
- [ ] Load keypairs from `.env` (minting authority, co-signer)
- [ ] Connect to devnet RPC (from `.env`)
- [ ] Load the IDL and initialize the Anchor program client
- [ ] Write a `getConfig()` function that fetches and returns the on-chain Config account
- [ ] Test: run `getConfig()` against devnet and confirm it returns data

## Stage 3 — Mock Bank

- [ ] Create `api/src/mock-bank.ts`
- [ ] Expose a `getBalance(): Promise<number>` function that returns a hardcoded or configurable USD balance
- [ ] Expose a `confirmDeposit(id: string): Promise<boolean>` function that simulates a deposit confirmation (returns true after a short delay)
- [ ] Expose a `sendWire(bankAccount: string, amount: number): Promise<string>` function that logs the wire and returns a fake reference ID
- [ ] All mock functions log their actions to console so you can follow the flow

## Stage 4 — Oracle Service

- [ ] Create `api/src/oracle.ts`
- [ ] Implement `updateReserves()` — calls `getBalance()` from mock bank, then calls `update_reserves` on-chain
- [ ] Test: call `updateReserves()` once manually, confirm the on-chain OracleConfig account is updated
- [ ] Implement polling loop — call `updateReserves()` every 12 hours (configurable via `.env`)
- [ ] Add startup call — run `updateReserves()` once immediately on server start

## Stage 5 — Event Listener

- [ ] Create `api/src/listener.ts`
- [ ] Subscribe to the devnet program's logs using `connection.onLogs`
- [ ] Parse `RedeemInitiated` events from transaction logs
- [ ] On each event: extract `user`, `amount`, `redemption_id` from the event data
- [ ] Call `sendWire()` from mock bank when a `RedeemInitiated` event is detected
- [ ] Log all detected events and wire actions to console
- [ ] Test: manually call `initiateRedeem` on devnet, confirm the listener picks it up

## Stage 6 — REST Endpoints

- [ ] `POST /mint/request`
  - [ ] Accept `{ walletAddress: string, amountUsd: number }` in request body
  - [ ] Validate inputs (valid Solana address, amount > 0)
  - [ ] Return wire instructions (bank name, account number, reference ID from mock bank)
  - [ ] Store pending deposit in memory (or simple JSON file) keyed by reference ID
- [ ] `GET /mint/status/:id`
  - [ ] Look up the pending deposit by reference ID
  - [ ] Call `confirmDeposit(id)` from mock bank
  - [ ] If confirmed: call `mintToUser` on-chain, return `{ status: "minted", txSignature }`
  - [ ] If pending: return `{ status: "pending" }`
- [ ] `POST /redeem/register-bank`
  - [ ] Accept `{ walletAddress: string, bankAccount: string }` in request body
  - [ ] Store the bank account mapping in memory keyed by wallet address
  - [ ] Return `{ status: "registered" }`
- [ ] `GET /redeem/status/:id`
  - [ ] Look up the redemption by ID
  - [ ] Return current status (`pending`, `wired`, `completed`, `cancelled`)

## Stage 7 — Wire Up and Integration Test

- [ ] Start the server
- [ ] Confirm oracle polling starts and `update_reserves` is called on devnet
- [ ] Confirm event listener is active
- [ ] **Full mint flow test:**
  - [ ] POST `/mint/request` with a test wallet address
  - [ ] GET `/mint/status/:id` — should return `pending` first call
  - [ ] GET `/mint/status/:id` again — mock bank confirms, `mintToUser` is called on-chain
  - [ ] Verify solUSD balance of test wallet on devnet increased
- [ ] **Full redeem flow test:**
  - [ ] POST `/redeem/register-bank` for test wallet
  - [ ] Call `initiateRedeem` on devnet directly (via test script or Anchor client)
  - [ ] Confirm listener fires and `sendWire` is called in mock bank logs
  - [ ] GET `/redeem/status/:id` — confirm status updated

## Stage 8 — Cleanup and Documentation

- [ ] Add error handling to all endpoints (try/catch, meaningful error responses)
- [ ] Add request logging middleware
- [ ] Write `api/README.md` — how to configure, run locally, and test each endpoint
- [ ] Update root `README.md` to mention the `api/` directory
- [ ] Confirm `.env` is in `.gitignore` and no secrets are committed

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

# Oracle
ORACLE_POLL_INTERVAL_MS=43200000   # 12 hours

# Mock bank (devnet only — replace with real bank API key for mainnet)
MOCK_BANK_BALANCE_USD=1000000      # Simulated reserve balance
MOCK_BANK_CONFIRM_DELAY_MS=2000    # Simulated confirmation delay
```
