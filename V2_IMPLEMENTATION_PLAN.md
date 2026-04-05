# solUSD v2 — Implementation Plan

**Status:** Phases 1–9 complete. v2 is the current codebase. Phase 10 (off-chain API) is a separate repository.
**Test suite:** 43/47 passing, 4 skipped — see CLAUDE.md for details.

---

## Phase 1 — State Layer ✅

Rewrote `state/config.rs`; created `oracle_config.rs`, `redemption_record.rs`, `frozen_account.rs`, `blacklisted_account.rs`, updated `state/mod.rs`.

## Phase 2 — Errors and Events ✅

Added error codes 6008–6019 to `errors.rs`; created `events.rs` with `MintExecuted`, `RedeemInitiated`, `RedeemCompleted`, `RedeemCancelled`, `FeeUpdated`, `MintCapsUpdated`.

## Phase 3 — Rewrite Existing Instructions ✅

Rewrote `initialize.rs` (new accounts, Pubkey args moved to UncheckedAccount); rewrote `mint.rs` → `mint_to_user.rs`; rewrote `redeem.rs` → split into `redeem_lifecycle.rs`; updated `admin.rs` and `withdraw_fees.rs`.

## Phase 4 — New Instructions ✅

Created `update_reserves.rs`, `compliance.rs` (emergency_pause, freeze, unfreeze, blacklist), `redeem_lifecycle.rs` (complete_redeem, cancel_redeem, claim_refund), `update_mint_caps.rs`.

## Phase 5 — Wire Everything Together ✅

Updated `instructions/mod.rs` exports and `lib.rs` routing for all 15 instructions.

## Phase 6 — PDAs to Remove ✅

Removed `"reserve"` and `"reserve-vault"` PDAs (no on-chain USDC reserve in v2). Removed `reserve_bump` from Config.

## Phase 7 — Build Verification ✅

Program builds cleanly with `/Users/patrick/.cargo/bin/anchor build --no-idl`.

## Phase 8 — Update Hand-Written IDL and TypeScript Types ✅

Manually rewrote `target/idl/myproject.json` and `target/types/myproject.ts` to match v2 instruction set. Both files are gitignored — not committed. Follow `IDL_UPDATE_CHECKLIST.md` for future changes.

## Phase 9 — Rewrite Tests ✅

Full 47-test suite in `tests/myproject.ts`. 43 passing, 4 skipped (clock-warp and unreachable-error cases). See CLAUDE.md Test Suite Status for details.

---

## Phase 10 — Off-Chain API (Separate Codebase) 🔜 NOT STARTED

The on-chain program is complete. The off-chain API is a separate backend service. Requirements:

**Endpoints needed:**
- `POST /mint/request` — user submits wallet address, gets bank wire instructions
- `GET /mint/status/:id` — poll deposit confirmation status
- `POST /redeem/register-bank` — user registers bank account for redemption wires
- `GET /redeem/status/:id` — poll redemption wire status

**Event listener:** Subscribe to `RedeemInitiated` events on-chain and trigger wire initiation.

**Oracle service:** Periodically (at least every 12h) fetch bank balance and call `update_reserves` on-chain.

**Key management:** `minting_authority` and `emergency_guardian` keypairs must be in HSM/KMS before mainnet. For devnet testing, use local keypairs.

---

## Architectural Decisions

1. **Multi-sig:** Squads Protocol. The `authority` field holds the Squads vault address. Minimum 3-of-5 signers.
2. **Fee model:** On-chain. `mint_to_user` mints `amount - fee` to user and `fee` to `treasury_vault` as solUSD.
3. **Treasury vault:** Kept. `withdraw_fees` is a multi-sig admin instruction.
4. **Program upgrade vs. new deploy:** Fresh deploy. v1 program ID `7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J` is retired.
5. **`redemption_id` generation:** Counter in Config. `redemption_counter` increments on each `initiate_redeem`. PDA seed: `["redemption", user_pubkey, redemption_counter.to_le_bytes()]`.
