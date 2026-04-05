# CLAUDE.md - Project Instructions for Claude Code

## Project Overview

solUSD is a fiat-backed stablecoin on Solana built with Anchor 0.30.1. The codebase is **v2** (fiat-backed with oracle proof-of-reserves, multi-sig governance, compliance controls, and a redemption escrow model). v1 (USDC-backed) has been retired and replaced entirely.

**Program ID:** `3mcYviYiePvUudVFgYKwzipqNhUTDxTtgth2v9ApThMU`
**GitHub:** https://github.com/Ptrckmart/myproject
**PRD:** `solUSD_PRD.md` — Full requirements, user stories, and non-goals. Key decisions: strictly 1:1 fiat-backed (no algorithmic stability, no USDC migration path), USD-only (no multi-currency), fee-only revenue (no yield on reserves), multi-sig governance (no DAO). Read the PRD when reasoning about product scope — the on-chain design is already implemented.

---

## Quick Reference — Task to File

| Task | Files to read/edit |
|---|---|
| Add/change an instruction | `programs/myproject/src/instructions/<file>.rs`, `lib.rs`, then update IDL + TS types |
| Change account fields | `programs/myproject/src/state/<account>.rs`, `ACCOUNT_SIZES.md`, then update IDL + TS types |
| Update IDL / TS types | `target/idl/myproject.json`, `target/types/myproject.ts` — follow `IDL_UPDATE_CHECKLIST.md` |
| Add a test | `tests/myproject.ts` — use `mintAccounts()` helper for mint calls, `expectError()` for error cases |
| Look up PDA seeds | `PDA_REFERENCE.md` |
| Look up account byte sizes | `ACCOUNT_SIZES.md` |
| Understand error codes | `programs/myproject/src/errors.rs` |
| Understand product requirements | `solUSD_PRD.md` |
| Phase completion status | `V2_IMPLEMENTATION_PLAN.md` (phases 1–9 ✅, phase 10 `api/` not started) |
| API build checklist | `API_BUILD_CHECKLIST.md` — 11-stage checklist for building the off-chain API |
| API dev guide | `api/CLAUDE.md` — patterns, schema, gotchas specific to Phase 10 |

## Deployment Status

The program is deployed on **devnet** at `3mcYviYiePvUudVFgYKwzipqNhUTDxTtgth2v9ApThMU`. Not yet on mainnet. Upgrade authority: `G6Z2hMk6kZEM6ht5LhdQko3DvpUCTbnVLQhnGX6ggBRX` (default CLI wallet).

The off-chain API (`api/`) has not been started yet. Follow `API_BUILD_CHECKLIST.md` — 11 stages covering keypair setup, scaffold, SQLite store, Anchor client, mock bank, oracle, event listener, 72h monitor, REST endpoints, integration testing, and docs.

**When working on Phase 10, read `api/CLAUDE.md` first** — it has API-specific build commands, all key TypeScript patterns (dual-sig, event parsing, PDA derivation), the SQLite schema, the IDL import path, and API-specific gotchas.

## Build & Test Commands

```bash
# Build (must use --no-idl flag due to anchor-syn 0.30.1 bug)
/Users/patrick/.cargo/bin/anchor build --no-idl

# Run tests (skip build since anchor test tries IDL generation which fails)
rm -rf .anchor/test-ledger && COPYFILE_DISABLE=1 /Users/patrick/.cargo/bin/anchor test --skip-build

# If Cargo.lock needs regenerating (use solana toolchain, not default)
cargo +solana generate-lockfile
```

## Important Gotchas

- **Always use `--no-idl`** when building. The `anchor-syn 0.30.1` crate has a `source_file()` bug that breaks IDL auto-generation. The IDL and TypeScript types at `target/idl/myproject.json` and `target/types/myproject.ts` are hand-written and must be updated manually when instructions/accounts change.
- **`target/` is gitignored.** `target/idl/myproject.json` and `target/types/myproject.ts` are never committed. They must be maintained by hand in your working directory.
- **Use the cargo-installed anchor** at `/Users/patrick/.cargo/bin/anchor` (v0.30.0). The avm-managed anchor at `~/.avm/bin/anchor` has no version set and will error.
- **Solana BPF tools use Cargo 1.75** which cannot handle crates using `edition2024`. If `Cargo.lock` is regenerated and build fails with rustc version errors, downgrade offending crates: `cargo +solana update <crate>@<new-version> --precise <older-version>`.
- **macOS test ledger issue**: Always use `COPYFILE_DISABLE=1` and `rm -rf .anchor/test-ledger` before running tests to avoid `._genesis.bin` resource fork corruption.
- **IDL discriminators** are `sha256("global:<instruction_name>")` first 8 bytes. Account discriminator for Config is `sha256("account:Config")` first 8 bytes.
- **IDL and TS types are hand-maintained.** After any instruction, account, or error change, manually update `target/idl/myproject.json` and `target/types/myproject.ts`.

### `mintAccounts` helper in tests

All `mintToUser` calls in `tests/myproject.ts` go through a shared `mintAccounts()` helper function that pre-fills default accounts including the `program.programId` sentinels for optional accounts. When adding new mint test cases, use this helper rather than spelling out all accounts inline.

### BPF Pubkey Arg Corruption (Anchor 0.30.1)

During `try_accounts`, Anchor/Solana internal code writes `Rent::default()` constants (lamports_per_byte_year=3480, exemption_threshold=2.0, burn_percent=50) to a fixed BPF virtual address. This address overlaps with deserialized instruction args on the stack. The overlap position shifts when the Accounts struct size changes. **Pubkey args (32 bytes) are large enough to straddle the corruption zone; u64/i64 args (8 bytes) are small enough to avoid it.**

**Rule:** Never pass Pubkey values as instruction args. Instead, pass them as `UncheckedAccount<'info>` fields in the Accounts struct and read them via `ctx.accounts.X.key()` in the handler.

The `initialize` instruction uses this pattern for `minting_authority`, `co_signer`, and `emergency_guardian`.

**Also at risk:** `freeze_account`, `unfreeze_account`, and `blacklist_account` take a `user: Pubkey` instruction arg. These currently work because the accounts struct is small enough that the corruption zone doesn't hit the single Pubkey arg. If the accounts struct for any of these instructions grows (new accounts added), the corruption zone may shift and corrupt the `user` arg. Apply the same fix (move to `UncheckedAccount`) if that happens.

### Optional Accounts Sentinel (Anchor 0.30.1)

Anchor 0.30.1 `validateAccounts` in `node_modules/@coral-xyz/anchor/src/program/common.ts` does **not** check the `optional` flag — it requires every IDL account to be provided. Workaround: pass `program.programId` as a sentinel for unused optional accounts:

```typescript
blacklistedAccount: program.programId,  // user is not blacklisted
frozenAccount: program.programId,       // user is not frozen
```

The on-chain program checks `account.is_none()` — the program ID is never a valid PDA for these seeds, so it correctly evaluates as absent. This applies to `mintToUser` and `initiateRedeem` calls.

---

## v2 Architecture

### Instructions (17 total)

| Instruction | Access | Description |
|---|---|---|
| `initialize(fee_bps, per_tx_cap, daily_cap, max_staleness_seconds)` | Deployer | Creates Config, solUSD mint, oracle config, treasury vault, redeem escrow. Pubkey args (minting_authority, co_signer, emergency_guardian) passed as accounts. |
| `mint_to_user(user_wallet, amount)` | Minting Authority + Co-signer | Mint solUSD after fiat deposit; checks oracle, staleness, caps, compliance |
| `initiate_redeem(solusd_amount, redemption_id)` | Any non-frozen/blacklisted user | Transfer solUSD to escrow, create RedemptionRecord, emit event |
| `complete_redeem(redemption_id)` | Minting Authority | Burn escrowed solUSD after fiat wire confirmed |
| `cancel_redeem(redemption_id)` | Minting Authority | Return escrowed solUSD to user after wire failure |
| `claim_refund(redemption_id)` | Redemption owner | Reclaim escrowed solUSD after 72h timeout |
| `update_reserves(amount)` | Oracle Authority | Update on-chain reserve balance and timestamp |
| `update_fee(new_fee_bps)` | Multi-sig authority | Update fee rate (max 10%) |
| `update_mint_caps(per_tx_cap, daily_cap)` | Multi-sig authority | Update minting caps |
| `withdraw_fees(amount)` | Multi-sig authority | Withdraw accumulated fees from treasury |
| `set_paused(paused)` | Multi-sig authority | Pause or unpause all protocol operations |
| `emergency_pause()` | Emergency Guardian | Immediately pause — cannot unpause |
| `freeze_account(user)` | Multi-sig authority | Freeze a specific wallet |
| `unfreeze_account(user)` | Multi-sig authority | Unfreeze a specific wallet |
| `blacklist_account(user)` | Multi-sig authority | Permanently blacklist a wallet (no unblacklist instruction) |

### PDAs

| PDA Seed | Type | Purpose |
|---|---|---|
| `"config"` | Config | Protocol state |
| `"mint-authority"` | PDA | Signs solUSD mint_to operations |
| `"oracle-config"` | OracleConfig | Oracle authority, reserve balance, staleness config |
| `"treasury"` | PDA | Owns treasury token account |
| `"treasury-vault"` | SPL token acct | Holds fee revenue |
| `"redeem-escrow"` | SPL token acct | Holds solUSD during pending redemptions |
| `["frozen", user_pubkey]` | FrozenAccount | Existence = account is frozen |
| `["blacklisted", user_pubkey]` | BlacklistedAccount | Existence = account is blacklisted |
| `["redemption", user_pubkey, id]` | RedemptionRecord | Tracks status of individual redemptions |

### Config State Fields

```
authority              Pubkey    Multi-sig vault address (Squads)
mint                   Pubkey    solUSD token mint address
minting_authority      Pubkey    Off-chain API signing key (HSM-backed)
co_signer              Pubkey    Independent co-signer for dual-sig minting
emergency_guardian     Pubkey    Single-key emergency pause (HSM-backed)
fee_bps                u64       Fee in basis points
total_solusd_minted    u64       Total outstanding solUSD (6 decimals)
per_tx_mint_cap        u64       Max solUSD per single mint transaction
daily_mint_cap         u64       Max solUSD per rolling 24h window
daily_minted           u64       Counter for current window
daily_mint_window_start i64      Timestamp when current window started
is_paused              bool      Global pause flag
redemption_counter     u64       Monotonic counter; used as redemption_id for each initiate_redeem
bump                   u8
mint_authority_bump    u8
treasury_bump          u8
oracle_config_bump     u8
redeem_escrow_bump     u8
```

### OracleConfig Fields

```
oracle_authority       Pubkey    Who can call update_reserves
total_usd_reserves     u64       Latest reported USD balance (6 decimals)
last_updated           i64       Unix timestamp of last update
max_staleness_seconds  i64       Minting halts if data is older than this
bump                   u8
```

### Error Codes (all 20)

| Code | Name | Description |
|---|---|---|
| 6000 | ZeroAmount | Amount must be greater than zero |
| 6001 | MathOverflow | Arithmetic overflow |
| 6002 | UnauthorizedAccess | Caller is not the protocol authority |
| 6003 | FeeTooHigh | Fee exceeds 1,000 bps (10%) |
| 6004 | InsufficientReserves | Reserve doesn't have enough USDC for redemption |
| 6005 | InsufficientTreasuryBalance | Treasury doesn't have enough for withdrawal |
| 6006 | MintAmountTooSmall | Deposit too small — results in 0 solUSD after fees |
| 6007 | RedeemAmountTooSmall | Redemption too small — results in 0 USDC after fees |
| 6008 | ProtocolPaused | Protocol is paused |
| 6009 | AccountFrozen | This account is frozen |
| 6010 | AccountBlacklisted | This account is blacklisted |
| 6011 | ReservesInsufficient | Minting halted: post-mint supply would exceed reserves |
| 6012 | InvalidOracleAuthority | Caller is not the authorized oracle |
| 6013 | StaleOracle | Minting halted: oracle data exceeds max staleness threshold |
| 6014 | UnauthorizedMinter | Caller is not the authorized minting service |
| 6015 | MintCapExceeded | Mint amount exceeds per-transaction or daily cap |
| 6016 | InvalidCoSigner | Co-signer verification failed |
| 6017 | RedemptionNotFound | Redemption record does not exist |
| 6018 | RedemptionNotPending | Redemption is not in pending status |
| 6019 | RedemptionTimeoutNotReached | 72h timeout has not elapsed |

### Key Flows

**Mint flow:**
1. User sends bank wire → banking partner confirms → off-chain API receives webhook
2. API calls `mint_to_user(user_wallet, amount)` on-chain (requires minting_authority + co_signer signatures)
3. Program checks: not paused, not frozen/blacklisted, oracle not stale, reserves sufficient, within mint caps
4. Program mints net solUSD (amount - fee) to user's token account
5. Emits `MintExecuted`

**Redeem flow:**
1. User calls `initiate_redeem(amount, redemption_id)` on-chain
2. solUSD moves to `redeem-escrow` PDA — not burned yet
3. `RedemptionRecord` created with status=Pending
4. Emits `RedeemInitiated` — off-chain API listener picks this up
5. API initiates fiat wire to user's bank
6. On wire success: API calls `complete_redeem` → escrowed solUSD is burned
7. On wire failure: API calls `cancel_redeem` → solUSD returned to user
8. If API never resolves within 72h: user calls `claim_refund` → solUSD returned

**Oracle flow:**
- Oracle service polls bank balance, calls `update_reserves(amount)` at least every 12h
- Program reads oracle before every mint to verify peg holds

---

## File Structure

```
programs/myproject/src/
├── lib.rs                        # Instruction routing
├── errors.rs                     # Error enum
├── helpers.rs                    # calculate_fee() utility
├── events.rs                     # Anchor event definitions
├── state/
│   ├── mod.rs
│   ├── config.rs                 # Config account struct
│   ├── oracle_config.rs
│   ├── redemption_record.rs
│   ├── frozen_account.rs
│   └── blacklisted_account.rs
└── instructions/
    ├── mod.rs
    ├── initialize.rs
    ├── mint_to_user.rs
    ├── update_reserves.rs
    ├── admin.rs                  # update_fee, update_mint_caps, withdraw_fees, set_paused
    ├── compliance.rs             # emergency_pause, freeze_account, unfreeze_account, blacklist_account
    └── redeem_lifecycle.rs       # initiate_redeem, complete_redeem, cancel_redeem, claim_refund
```

### PDA Seeds (compact)

| Account | Seeds | Bump stored in |
|---|---|---|
| Config | `["config"]` | `config.bump` |
| Mint Authority | `["mint-authority"]` | `config.mint_authority_bump` |
| Oracle Config | `["oracle-config"]` | `config.oracle_config_bump`, `oracle_config.bump` |
| Treasury | `["treasury"]` | `config.treasury_bump` |
| Treasury Vault | `["treasury-vault"]` | — (SPL token account) |
| Redeem Escrow | `["redeem-escrow"]` | `config.redeem_escrow_bump` |
| Redeem Escrow Authority | `["redeem-escrow-authority"]` | — |
| FrozenAccount | `["frozen", user_pubkey]` | `frozen.bump` |
| BlacklistedAccount | `["blacklisted", user_pubkey]` | `blacklisted.bump` |
| RedemptionRecord | `["redemption", user_pubkey, redemption_id.to_le_bytes()]` | `record.bump` |

For full Rust/TypeScript derivation examples see `PDA_REFERENCE.md`.

### Account `::LEN` Constants

| Account | `LEN` | Formula |
|---|---|---|
| `Config` | 230 | `8 + 32*5 + 8*7 + 1 + 5` |
| `OracleConfig` | 65 | `8 + 32 + 8 + 8 + 8 + 1` |
| `RedemptionRecord` | 66 | `8 + 32 + 8 + 8 + 1 + 8 + 1` |
| `FrozenAccount` | 9 | `8 + 1` |
| `BlacklistedAccount` | 9 | `8 + 1` |

SPL `Mint`=82, `TokenAccount`=165 (use `anchor_spl` constants, no custom `LEN`). For full field-by-field breakdown see `ACCOUNT_SIZES.md`.

### Supporting Files

- `target/idl/myproject.json` — Hand-written IDL (gitignored; update manually after every change)
- `target/types/myproject.ts` — Hand-written TS types (gitignored; update manually after every change)
- `tests/myproject.ts` — Integration tests (47 test cases; see test status below)
- `solUSD_PRD.md` — Full product requirements document
- `ACCOUNT_SIZES.md` — Exact byte layout and `::LEN` constants (read this before changing account structs)
- `PDA_REFERENCE.md` — All PDA seeds with Rust and TypeScript derivation examples (read this before deriving PDAs in new code)
- `IDL_UPDATE_CHECKLIST.md` — Step-by-step checklist for manually updating IDL and TS types (follow this after every instruction/account change)
- `SQUADS_INTEGRATION.md` — How to build, sign, and test Squads multi-sig transactions
- `TEST_PLAN.md` — Full 47-case test specification

---

## Resolved Open Questions

1. **Multi-sig:** Squads Protocol. The `authority` field in Config stores the Squads vault address. All admin instructions use `authority.key() == config.authority`. The Squads vault PDA signs transactions after M-of-N approval off-chain. Minimum 3-of-5 signers required.
2. **Fee model:** On-chain fee. `mint_to_user` mints `amount - fee` to the user and `fee` to `treasury_vault` as solUSD.
3. **Treasury vault:** Kept. `treasury_vault` holds accumulated solUSD fees. `withdraw_fees` is a multi-sig admin instruction.
4. **Program upgrade vs. new deploy:** Fresh deploy. v2 deploys as a new program. The v1 program ID is retired.
5. **`redemption_id` generation:** Counter in Config. `redemption_counter: u64` increments on each `initiate_redeem`. PDA seed: `["redemption", user_pubkey, redemption_counter.to_le_bytes()]`.

---

## Code Conventions

- Anchor 0.30.0 with `anchor-lang` and `anchor-spl` crates (no other on-chain deps)
- All token transfers use `anchor_spl::token::transfer` with CPI
- PDA-signed transfers use `CpiContext::new_with_signer` with seed arrays
- Fee math: `fee = amount * fee_bps / 10_000` using u128 intermediate to avoid overflow
- solUSD uses 6 decimal places (matches USDC convention)
- Emit Anchor events for all state changes — the off-chain API depends on these

---

## Test File Key Symbols

Key globals and helpers in `tests/myproject.ts` — read this before adding test cases to avoid scanning 1,400 lines.

**Keypairs / roles**
- `mintKeypair` — solUSD token mint
- `mintingAuthority` — dual-sig minting key (also used as `oracleAuthority`)
- `coSigner` — second minting signature
- `emergencyGuardian` — emergency pause key
- `payer` — fee payer (provider.wallet.payer)

**PDAs** (all derived in top-level `before` hook)
`configPda`, `mintAuthorityPda`, `oracleConfigPda`, `treasuryPda`, `treasuryVaultPda`, `redeemEscrowPda`, `redeemEscrowAuthorityPda`

**Constants**
- `ONE = 1_000_000` (1 solUSD in base units)
- `FEE_BPS = 30`, `PER_TX_CAP = 1_000_000 * ONE`, `DAILY_CAP = 10_000_000 * ONE`

**Helper functions**
- `expectError(promise, code)` — asserts a tx fails with the given error name or code number
- `airdrop(connection, pubkey, sol?)` — airdrops SOL and confirms
- `createATA(provider, payer, mint, owner)` — creates an associated token account
- `mintAccounts(userWallet, userAta, extra?)` — returns the full accounts object for a `mintToUser` call with `program.programId` sentinels pre-filled for optional accounts; pass `extra` to override individual fields

## Test Suite Status

**43 passing, 4 skipped** (all 47 tests accounted for).

| Section | Passing | Skipped |
|---|---|---|
| 1. Initialization | 2 | 0 |
| 2. Oracle | 2 | 0 |
| 3. Mint | 10 | 2 (3.11, 3.13) |
| 4. Redeem | 5 | 1 (4.6) |
| 5. Redeem lifecycle | 6 | 1 (5.6) |
| 6. Compliance | 9 | 0 |
| 7. Admin | 7 | 0 |
| **Total** | **43** | **4** |

### Skipped tests and why

- **3.11** Daily cap resets after 24h — requires `clock.unix_timestamp` advance of 86400s; not feasible in standard anchor localnet
- **3.13** Amount too small (net=0 after fee) — `MintAmountTooSmall` requires fee_bps ≥ 10000; program caps at 1000 bps so net_amount can never be 0
- **4.6** Redeem too small after fee — same as 3.13 (`RedeemAmountTooSmall` is unreachable)
- **5.6** claim_refund after 72h — requires clock advance of 259200s

### Non-obvious test placement

**Test 3.8** (stale oracle) is placed inside `describe("2. Oracle")` in the test file, *before* test 2.1 (`update_reserves`). This is intentional: `oracle.last_updated` is 0 from `initialize`, so staleness check fires naturally. Once `update_reserves` runs in 2.1, `last_updated` is no longer 0 and the stale condition would no longer hold without clock manipulation.
