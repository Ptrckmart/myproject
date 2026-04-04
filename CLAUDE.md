# CLAUDE.md - Project Instructions for Claude Code

## Project Overview

solUSD is a fiat-backed stablecoin on Solana built with Anchor 0.30.0. The current codebase is **v1** (USDC-backed). Active development is targeting **v2** (fiat-backed with oracle proof-of-reserves, multi-sig governance, compliance controls, and a redemption escrow model).

**Program ID:** `7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J`
**GitHub:** https://github.com/Ptrckmart/myproject
**PRD:** `solUSD_PRD.md`
**v2 Implementation Plan:** `V2_IMPLEMENTATION_PLAN.md`

---

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
- **Use the cargo-installed anchor** at `/Users/patrick/.cargo/bin/anchor` (v0.30.0). The avm-managed anchor at `~/.avm/bin/anchor` has no version set and will error.
- **Solana BPF tools use Cargo 1.75** which cannot handle crates using `edition2024`. If `Cargo.lock` is regenerated and build fails with rustc version errors, downgrade offending crates: `cargo +solana update <crate>@<new-version> --precise <older-version>`.
- **macOS test ledger issue**: Always use `COPYFILE_DISABLE=1` and `rm -rf .anchor/test-ledger` before running tests to avoid `._genesis.bin` resource fork corruption.
- **IDL discriminators** are `sha256("global:<instruction_name>")` first 8 bytes. Account discriminator for Config is `sha256("account:Config")` first 8 bytes.
- **IDL and TS types are hand-maintained.** After any instruction, account, or error change, manually update `target/idl/myproject.json` and `target/types/myproject.ts`.

---

## v1 Architecture (Current Code)

This is what exists in the codebase right now. v2 will replace this.

### Instructions (5 total)

| Instruction | Access | Description |
|---|---|---|
| `initialize(fee_bps)` | Admin | Creates config, solUSD mint, USDC reserve/treasury vaults |
| `mint(usdc_amount)` | Anyone | Deposit USDC → receive solUSD (1:1 minus fee) |
| `redeem(solusd_amount)` | Anyone | Burn solUSD → receive USDC (1:1 minus fee) |
| `update_fee(new_fee_bps)` | Admin | Update fee rate (max 1000 bps / 10%) |
| `withdraw_fees(amount)` | Admin | Withdraw USDC fees from treasury vault |

### PDAs (v1)

| PDA Seed | Purpose |
|---|---|
| `"config"` | Protocol state |
| `"mint-authority"` | Signs solUSD mint_to operations |
| `"reserve"` | Owns the reserve USDC token account |
| `"reserve-vault"` | SPL token account holding USDC reserves |
| `"treasury"` | Owns the treasury USDC token account |
| `"treasury-vault"` | SPL token account holding USDC fees |

### Config State Fields (v1)

`authority`, `mint` (solUSD), `usdc_mint`, `fee_bps`, `total_usdc_reserves`, `total_solusd_minted`, `bump`, `mint_authority_bump`, `reserve_bump`, `treasury_bump`

### Error Codes (v1)

6000=ZeroAmount, 6001=MathOverflow, 6002=UnauthorizedAccess, 6003=FeeTooHigh, 6004=InsufficientReserves, 6005=InsufficientTreasuryBalance, 6006=MintAmountTooSmall, 6007=RedeemAmountTooSmall

---

## v2 Target Architecture

### What Changes in v2

| Aspect | v1 (Current) | v2 (Target) |
|---|---|---|
| Backing asset | USDC (on-chain) | USD (off-chain bank accounts) |
| Mint trigger | User deposits USDC directly | Off-chain API after fiat confirmation |
| Redeem trigger | User burns solUSD, gets USDC | User moves solUSD to escrow, receives fiat wire |
| Reserve verification | Implicit (USDC in vault) | Explicit (Chainlink-style oracle) |
| Admin model | Single authority key | Multi-sig (3-of-5 via Squads) |
| Compliance controls | None | Pause, freeze, blacklist |
| Circuit breaker | None | Auto-halt minting if reserves < supply |
| Off-chain dependency | None | API layer + banking partner |

### v2 Instructions (17 total)

| Instruction | Access | Description |
|---|---|---|
| `initialize(fee_bps, minting_authority, co_signer, emergency_guardian, per_tx_cap, daily_cap, max_staleness_seconds)` | Deployer | Creates Config, solUSD mint, oracle config, treasury vault, redeem escrow |
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
| `blacklist_account(user)` | Multi-sig authority | Permanently blacklist a wallet (no unblacklist) |

### v2 PDAs

| PDA Seed | Type | Purpose |
|---|---|---|
| `"config"` | Config | Protocol state (updated fields) |
| `"mint-authority"` | PDA | Signs solUSD mint_to operations |
| `"oracle-config"` | OracleConfig | Oracle authority, reserve balance, staleness config |
| `"treasury"` | PDA | Owns treasury token account |
| `"treasury-vault"` | SPL token acct | Holds fee revenue |
| `"redeem-escrow"` | SPL token acct | Holds solUSD during pending redemptions |
| `["frozen", user_pubkey]` | FrozenAccount | Existence = account is frozen |
| `["blacklisted", user_pubkey]` | BlacklistedAccount | Existence = account is blacklisted |
| `["redemption", user_pubkey, id]` | RedemptionRecord | Tracks status of individual redemptions |

**Removed in v2:** `"reserve"` and `"reserve-vault"` PDAs (no on-chain USDC reserve).

### v2 Config State Fields

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

**Removed from v1 Config:** `usdc_mint`, `total_usdc_reserves`, `reserve_bump`

### v2 OracleConfig Fields

```
oracle_authority       Pubkey    Who can call update_reserves
total_usd_reserves     u64       Latest reported USD balance (6 decimals)
last_updated           i64       Unix timestamp of last update
max_staleness_seconds  i64       Minting halts if data is older than this
bump                   u8
```

### v2 Error Codes (all 20)

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

### v2 Key Flows

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

### Current (v1) Source Files

```
programs/myproject/src/
├── lib.rs                        # Instruction routing
├── errors.rs                     # Error enum
├── helpers.rs                    # calculate_fee() utility
├── state/
│   ├── mod.rs
│   └── config.rs                 # Config account struct
└── instructions/
    ├── mod.rs
    ├── initialize.rs
    ├── mint.rs
    ├── redeem.rs
    ├── admin.rs
    └── withdraw_fees.rs
```

### New Files to Create (v2)

```
programs/myproject/src/
├── events.rs                     # NEW: all Anchor event definitions
├── state/
│   ├── oracle_config.rs          # NEW
│   ├── redemption_record.rs      # NEW
│   ├── frozen_account.rs         # NEW
│   └── blacklisted_account.rs    # NEW
└── instructions/
    ├── update_reserves.rs        # NEW
    ├── compliance.rs             # NEW: set_paused, emergency_pause, freeze, unfreeze, blacklist
    ├── redeem_lifecycle.rs       # NEW: complete_redeem, cancel_redeem, claim_refund
    └── update_mint_caps.rs       # NEW
```

### Supporting Files

- `target/idl/myproject.json` — Hand-written IDL (update manually after every change)
- `target/types/myproject.ts` — Hand-written TS types (update manually after every change)
- `tests/myproject.ts` — Integration tests (full rewrite required for v2)
- `solUSD_PRD.md` — Full product requirements document for v2
- `V2_IMPLEMENTATION_PLAN.md` — Step-by-step implementation plan (10 phases, 30 steps)
- `PROJECT_SUMMARY.md` — High-level export summary of the project
- `ACCOUNT_SIZES.md` — Exact byte layout and `::LEN` constants for all v2 accounts
- `PDA_REFERENCE.md` — All PDA seeds with Rust and TypeScript derivation examples
- `IDL_UPDATE_CHECKLIST.md` — Step-by-step checklist for manually updating IDL and TS types
- `SQUADS_INTEGRATION.md` — How to build, sign, and test Squads multi-sig transactions
- `TEST_PLAN.md` — Full 47-case test specification for v2

---

## v2 Open Questions (Resolve Before Coding)

1. ~~**Multi-sig:** Squads Protocol (recommended) vs. native M-of-N~~ **DECIDED: Squads Protocol.** The `authority` field in Config stores the Squads vault address. All admin instructions use `authority.key() == config.authority` — no Anchor-level changes needed. The Squads vault PDA signs transactions after M-of-N approval off-chain. Minimum 3-of-5 signers required, configurable at init.
2. ~~**Fee model**~~ **DECIDED: On-chain fee.** `mint_to_user` mints `amount - fee` to the user and `fee` to `treasury_vault` as solUSD. Fee is transparent and verifiable on-chain.
3. ~~**Treasury vault in v2:** If fees are fiat-side, is `treasury_vault` and `withdraw_fees` still needed?~~ **DECIDED: Yes, kept.** `treasury_vault` holds accumulated solUSD fees. `withdraw_fees` remains as a multi-sig admin instruction.
4. ~~**Program upgrade vs. new deploy**~~ **DECIDED: Fresh deploy.** v2 will deploy as a new program with a new program ID. The v1 program ID `7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J` is retired. No mainnet state to migrate.
5. ~~**`redemption_id` generation**~~ **DECIDED: Counter in Config.** Add `redemption_counter: u64` to Config. On each `initiate_redeem`, use the current counter as the `redemption_id` then increment. PDA seed: `["redemption", user_pubkey, redemption_counter.to_le_bytes()]`. Client reads `config.redemption_counter` before calling to derive the correct PDA.

---

## Code Conventions

- Anchor 0.30.0 with `anchor-lang` and `anchor-spl` crates (no other on-chain deps)
- All token transfers use `anchor_spl::token::transfer` with CPI
- PDA-signed transfers use `CpiContext::new_with_signer` with seed arrays
- Fee math: `fee = amount * fee_bps / 10_000` using u128 intermediate to avoid overflow
- Both solUSD uses 6 decimal places (matches USDC convention)
- Emit Anchor events for all state changes — the off-chain API depends on these

---

## Open To-Dos (Test Suite Debugging)

Current state: **14/29 tests passing**. The v2 on-chain program is complete and builds. Remaining failures are all in the test layer.

### Bug 1 — `initialize` arg corruption (test 1.1)

**Symptom:** `config.mintingAuthority` is stored with wrong bytes on-chain after a successful `initialize` call.

**Root cause:** Anchor 0.30.1 BPF memory corruption. During `try_accounts` execution, some internal Solana/Anchor code (likely `Rent::default()` struct construction) overwrites a region of BPF memory that overlaps with deserialized instruction args. The corruption zone is approximately arg bytes 56–103 (relative to start of arg data, not including 8-byte discriminator).

**Partial fix applied:** Moved `co_signer` and `emergency_guardian` from instruction args to `UncheckedAccount<'info>` entries in the `Initialize` accounts struct (they are read via `ctx.accounts.co_signer.key()` in the handler). This was the right approach but the corruption zone shifted to affect `mintingAuthority` (arg bytes 8–39) in the new layout. Need to re-diagnose the exact corruption range with the new 5-arg layout and potentially move `mintingAuthority` to accounts as well, or restructure arg order.

**Files changed so far:** `initialize.rs`, `lib.rs`, `target/idl/myproject.json`, `target/types/myproject.ts`, `tests/myproject.ts`

### Bug 2 — Optional accounts not supported by `validateAccounts` (tests 3.x)

**Symptom:** All `mintToUser` calls fail with `Error: Account 'blacklistedAccount' not provided.`

**Root cause:** Anchor 0.30.1 `validateAccounts` in `node_modules/@coral-xyz/anchor/src/program/common.ts` does NOT check the `optional` flag — it requires every IDL account to be provided.

**Fix needed:** In every `.accounts({...})` call for `mintToUser`, pass `program.programId` as a sentinel value for unused optional accounts:
```typescript
frozenAccount: program.programId,    // not frozen
blacklistedAccount: program.programId, // not blacklisted
```
This applies to test sections 3, 4, and 5 `before` hooks and individual test cases.

### Bug 3 — `authorityAtaSolusd` undefined (tests 7.5, 7.6)

**Symptom:** `withdraw_fees` tests fail because `authorityAtaSolusd` is `undefined`.

**Root cause:** The ATA creation is inside test 1.1, after the failing assertion at line 144. Since 1.1 throws, the ATA is never created and the variable stays `undefined`.

**Fix needed:** Move the `authorityAtaSolusd` creation block out of test 1.1 and into the top-level `before` hook (or into a dedicated `before` hook in section 7). The ATA creation only works after the mint exists, so it must run after `initialize` succeeds.

### Downstream failures (auto-fix once bugs 1–3 are resolved)

- Tests 2.1, 3.7 — `InvalidOracleAuthority` because `oracle.oracle_authority` was stored from the corrupted `mintingAuthority` arg
- Tests 4.x, 5.x — fail in `before all` hook because minting never succeeded
- Test 6.4 — `emergency_pause` — was fixed in last run (passes now)
