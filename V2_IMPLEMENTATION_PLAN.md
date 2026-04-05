# solUSD v2 — Implementation Plan

**Based on:** solUSD_PRD.md
**Status:** Phases 1–9 complete. v2 is the current codebase. Phase 10 (off-chain API) is a separate repository.
**Completed:** v2 — fiat-backed, oracle proof-of-reserves, multi-sig, compliance controls, redemption escrow (43/47 tests passing, 4 skipped — see CLAUDE.md)

---

## How to Read This Plan

Each step is self-contained and listed in dependency order. Steps within the same phase can be worked in parallel. Complete all steps in a phase before starting the next. Build and test after each phase.

---

## Phase 1 — State Layer (Data Structures) ✅

No instruction logic changes yet. Just the accounts that hold data.

### Step 1.1 — Rewrite `state/config.rs`

**Remove these fields:**
- `usdc_mint: Pubkey` — no more USDC on-chain backing
- `total_usdc_reserves: u64` — replaced by oracle-reported reserves
- `reserve_bump: u8` — reserve PDA is being removed

**Add these fields:**
```rust
pub minting_authority: Pubkey,    // Off-chain API signing key (HSM-backed)
pub co_signer: Pubkey,            // Independent co-signer for dual-sig minting
pub emergency_guardian: Pubkey,   // Single-key emergency pause (HSM-backed)
pub is_paused: bool,              // Global pause flag
pub redemption_counter: u64,      // Monotonic ID counter; used as redemption_id each initiate_redeem
pub per_tx_mint_cap: u64,         // Max solUSD per single mint tx
pub daily_mint_cap: u64,          // Max solUSD per rolling 24h window
pub daily_minted: u64,            // Counter for current window
pub daily_mint_window_start: i64, // Timestamp when current 24h window started
pub oracle_config_bump: u8,
pub redeem_escrow_bump: u8,
```

Update `Config::LEN` to match. The `authority` field stays but now points to a Squads multi-sig vault address instead of a single key.

---

### Step 1.2 — Create `state/oracle_config.rs`

New account. Stores the oracle state.

```rust
#[account]
pub struct OracleConfig {
    pub oracle_authority: Pubkey,      // Who can call update_reserves
    pub total_usd_reserves: u64,       // Latest reported USD balance (6 decimals)
    pub last_updated: i64,             // Unix timestamp of last update
    pub max_staleness_seconds: i64,    // Minting halts if older than this
    pub bump: u8,
}
// PDA seed: ["oracle-config"]
```

---

### Step 1.3 — Create `state/redemption_record.rs`

New per-redemption account. Tracks escrow state.

```rust
#[account]
pub struct RedemptionRecord {
    pub user: Pubkey,
    pub amount: u64,           // solUSD amount in escrow
    pub timestamp: i64,        // When initiate_redeem was called
    pub status: RedemptionStatus,
    pub redemption_id: u64,    // Incrementing ID per user, or a nonce
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum RedemptionStatus {
    Pending,
    Completed,
    Failed,
}
// PDA seed: ["redemption", user_pubkey, redemption_id.to_le_bytes()]
```

---

### Step 1.4 — Create `state/frozen_account.rs` and `state/blacklisted_account.rs`

Marker PDAs. Existence = account is frozen/blacklisted. No meaningful data fields needed beyond a bump.

```rust
// frozen_account.rs
#[account]
pub struct FrozenAccount { pub bump: u8 }
// PDA seed: ["frozen", user_pubkey]

// blacklisted_account.rs
#[account]
pub struct BlacklistedAccount { pub bump: u8 }
// PDA seed: ["blacklisted", user_pubkey]
```

---

### Step 1.5 — Update `state/mod.rs`

Export all new state types: `OracleConfig`, `RedemptionRecord`, `FrozenAccount`, `BlacklistedAccount`.

---

## Phase 2 — Errors and Events ✅

### Step 2.1 — Update `errors.rs`

Add new variants after the existing 8 (codes 6008–6019):

| Code | Variant | Message |
|---|---|---|
| 6008 | `ProtocolPaused` | "Protocol is paused" |
| 6009 | `AccountFrozen` | "This account is frozen" |
| 6010 | `AccountBlacklisted` | "This account is blacklisted" |
| 6011 | `ReservesInsufficient` | "Minting halted: post-mint supply would exceed reserves" |
| 6012 | `InvalidOracleAuthority` | "Caller is not the authorized oracle" |
| 6013 | `StaleOracle` | "Minting halted: oracle data exceeds max staleness threshold" |
| 6014 | `UnauthorizedMinter` | "Caller is not the authorized minting service" |
| 6015 | `MintCapExceeded` | "Mint amount exceeds per-transaction or daily cap" |
| 6016 | `InvalidCoSigner` | "Co-signer verification failed" |
| 6017 | `RedemptionNotFound` | "Redemption record does not exist" |
| 6018 | `RedemptionNotPending` | "Redemption is not in pending status" |
| 6019 | `RedemptionTimeoutNotReached` | "72h timeout has not elapsed" |

---

### Step 2.2 — Create `events.rs`

New file. Anchor events emitted for all state changes. These are what the off-chain API listens for.

```rust
#[event] pub struct MintExecuted { pub user: Pubkey, pub amount: u64, pub fee: u64, pub timestamp: i64 }
#[event] pub struct RedeemInitiated { pub user: Pubkey, pub amount: u64, pub redemption_id: u64, pub timestamp: i64 }
#[event] pub struct RedeemCompleted { pub user: Pubkey, pub redemption_id: u64, pub timestamp: i64 }
#[event] pub struct RedeemCancelled { pub user: Pubkey, pub redemption_id: u64, pub timestamp: i64 }
#[event] pub struct RefundClaimed { pub user: Pubkey, pub redemption_id: u64, pub timestamp: i64 }
#[event] pub struct ReservesUpdated { pub total_usd_reserves: u64, pub timestamp: i64 }
#[event] pub struct AccountFrozen { pub user: Pubkey }
#[event] pub struct AccountUnfrozen { pub user: Pubkey }
#[event] pub struct AccountBlacklisted { pub user: Pubkey }
#[event] pub struct ProtocolPaused { pub timestamp: i64 }
#[event] pub struct ProtocolUnpaused { pub timestamp: i64 }
#[event] pub struct FeeUpdated { pub old_fee_bps: u64, pub new_fee_bps: u64 }
#[event] pub struct MintCapsUpdated { pub per_tx_cap: u64, pub daily_cap: u64 }
```

---

## Phase 3 — Rewrite Existing Instructions ✅

### Step 3.1 — Rewrite `instructions/initialize.rs`

**Remove:**
- `usdc_mint` account parameter
- `reserve_vault` token account init (the USDC reserve vault is gone)
- `reserve` PDA
- Setting `config.usdc_mint`, `config.total_usdc_reserves`, `config.reserve_bump`

**Add parameters:**
```rust
pub fn handler(
    ctx: Context<Initialize>,
    fee_bps: u64,
    minting_authority: Pubkey,
    co_signer: Pubkey,
    emergency_guardian: Pubkey,
    per_tx_mint_cap: u64,
    daily_mint_cap: u64,
    max_staleness_seconds: i64,
) -> Result<()>
```

**New accounts to init:**
- `oracle_config` PDA (seed `"oracle-config"`) — init with `oracle_authority = minting_authority`, `total_usd_reserves = 0`, `last_updated = 0`, `max_staleness_seconds`
- `redeem_escrow` SPL token account (seed `"redeem-escrow"`) — holds solUSD during pending redemptions, authority = `redeem_escrow_authority` PDA

**Keep:** `mint`, `mint_authority`, `treasury_vault`, `treasury` PDAs — these are unchanged.

---

### Step 3.2 — Rewrite `instructions/mint.rs` → `mint_to_user`

This is the largest change. The public user USDC deposit flow is entirely replaced.

**Old behavior:** Any user deposits USDC → receives solUSD
**New behavior:** `minting_authority` + `co_signer` both sign → solUSD minted to a specified user wallet

**New handler signature:**
```rust
pub fn handler(ctx: Context<MintToUser>, user_wallet: Pubkey, amount: u64) -> Result<()>
```

**Logic order:**
1. Verify `ctx.accounts.minting_authority.key() == config.minting_authority` → `UnauthorizedMinter`
2. Verify `ctx.accounts.co_signer.key() == config.co_signer` → `InvalidCoSigner`
3. Check `config.is_paused` → `ProtocolPaused`
4. Check blacklist PDA for `user_wallet` — if it exists → `AccountBlacklisted`
5. Check frozen PDA for `user_wallet` — if it exists → `AccountFrozen`
6. `require!(amount > 0, ZeroAmount)`
7. `require!(amount <= config.per_tx_mint_cap, MintCapExceeded)`
8. Reset daily window if `clock.unix_timestamp - config.daily_mint_window_start > 86400`
9. `require!(config.daily_minted + amount <= config.daily_mint_cap, MintCapExceeded)`
10. Load `oracle_config`. Assert `clock.unix_timestamp - oracle_config.last_updated <= oracle_config.max_staleness_seconds` → `StaleOracle`
11. Assert `oracle_config.total_usd_reserves >= config.total_solusd_minted + amount` → `ReservesInsufficient`
12. Calculate fee: `fee = calculate_fee(amount, config.fee_bps)`; `net_amount = amount - fee`; `require!(net_amount > 0, MintAmountTooSmall)`
13. `token::mint_to(...)` — mint `net_amount` solUSD to `user_solusd_account` (PDA-signed via `mint_authority`)
14. Mint `fee` solUSD to `treasury_vault` token account (PDA-signed via `mint_authority`).
15. Mint `net_amount` solUSD to `user_solusd_account` (PDA-signed via `mint_authority`).
15. Update `config.daily_minted += amount`
16. Update `config.total_solusd_minted += net_amount`
17. Emit `MintExecuted { user: user_wallet, amount: net_amount, fee, timestamp }`

**Account struct change:** Remove `user_usdc_account`, `reserve_vault`, `treasury_vault`. Add `minting_authority: Signer`, `co_signer: Signer`, `oracle_config: Account<OracleConfig>`, optional frozen/blacklist PDA checks.

---

### Step 3.3 — Rewrite `instructions/redeem.rs` → `initiate_redeem`

**Old behavior:** User burns solUSD, immediately receives USDC from reserve vault
**New behavior:** User transfers solUSD to escrow PDA, creates a `RedemptionRecord`, emits event. No burn yet.

**Logic:**
1. Check `config.is_paused` → `ProtocolPaused`
2. Check blacklist PDA for caller → `AccountBlacklisted`
3. Check frozen PDA for caller → `AccountFrozen`
4. `require!(solusd_amount > 0, ZeroAmount)`
5. Calculate fee: `fee = calculate_fee(solusd_amount, config.fee_bps)`, `net_usdc = solusd_amount - fee`, `require!(net_usdc > 0, RedeemAmountTooSmall)`
6. Derive a `redemption_id` (use `config.total_solusd_minted` as nonce or a dedicated counter — simplest: pass in as param from client, or use current timestamp + user pubkey hash)
7. Transfer `solusd_amount` from `user_solusd_account` to `redeem_escrow` token account
8. Init `RedemptionRecord` PDA with `status = Pending`, `amount = solusd_amount`, `timestamp = clock.unix_timestamp`
9. **Do NOT update `config.total_solusd_minted`** — tokens are still outstanding while in escrow
10. Emit `RedeemInitiated { user, amount: solusd_amount, redemption_id, timestamp }`

**Remove:** All USDC transfer logic, `reserve_vault`, `reserve` PDA, `user_usdc_account`
**Add:** `redeem_escrow` token account, `redemption_record` PDA init, `clock` sysvar

---

### Step 3.4 — Update `instructions/admin.rs`

The `update_fee` instruction currently checks `authority.key() == config.authority`. With Squads, `config.authority` stores the Squads vault address. The caller of this instruction will be the Squads vault PDA executing an approved transaction — the existing constraint requires no code change.

**Change:** Emit `FeeUpdated { old_fee_bps: config.fee_bps, new_fee_bps }` before updating. No structural changes needed.

Emit `FeeUpdated { old_fee_bps: config.fee_bps, new_fee_bps }` before updating.

---

### Step 3.5 — Update `instructions/withdraw_fees.rs`

Remove the `config.usdc_mint` constraint on `authority_usdc_account` — there is no USDC anymore. The treasury now holds SOL or a different token depending on how fees are structured.

**Decision point:** In v2, the treasury vault still holds SOL-denominated fees? Or is the treasury now fiat-side? Per the PRD, fees are taken on-chain from the mint amount (net_amount = amount - fee, only net_amount is minted). The fee never touches an on-chain vault — it stays off-chain with the custodian. If that is the case, `withdraw_fees` may become a no-op or be removed.

**Recommendation:** Keep `treasury_vault` as a SOL token account for any on-chain fee accumulation, and remove the USDC constraint. Update the authority check to multi-sig pattern. This can be refined once the fee model is finalized.

---

## Phase 4 — New Instructions ✅

### Step 4.1 — Create `instructions/update_reserves.rs`

Called by the oracle service to update the on-chain reserve balance.

```rust
pub fn handler(ctx: Context<UpdateReserves>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.oracle_authority.key() == ctx.accounts.oracle_config.oracle_authority,
        StablecoinError::InvalidOracleAuthority
    );
    let oracle = &mut ctx.accounts.oracle_config;
    oracle.total_usd_reserves = amount;
    oracle.last_updated = Clock::get()?.unix_timestamp;
    emit!(ReservesUpdated { total_usd_reserves: amount, timestamp: oracle.last_updated });
    Ok(())
}
```

Accounts: `oracle_authority: Signer`, `oracle_config: Account<OracleConfig>` (mutable)

---

### Step 4.2 — Create `instructions/compliance.rs`

Five instructions in one file:

**`set_paused(paused: bool)`** — multi-sig authority only
- Verify `authority.key() == config.authority`
- Set `config.is_paused = paused`
- Emit `ProtocolPaused` or `ProtocolUnpaused`

**`emergency_pause()`** — emergency_guardian only
- Verify `guardian.key() == config.emergency_guardian`
- `require!(!config.is_paused, ...)` — no-op if already paused (or just set it)
- Set `config.is_paused = true`
- Emit `ProtocolPaused`
- **Cannot unpause.** `set_paused(false)` is the only way to unpause and requires multi-sig.

**`freeze_account(user: Pubkey)`** — multi-sig authority only
- Verify `authority.key() == config.authority`
- Init `FrozenAccount` PDA at `["frozen", user]`
- Emit `AccountFrozen { user }`

**`unfreeze_account(user: Pubkey)`** — multi-sig authority only
- Verify `authority.key() == config.authority`
- Close `FrozenAccount` PDA (return lamports to authority)
- Emit `AccountUnfrozen { user }`

**`blacklist_account(user: Pubkey)`** — multi-sig authority only
- Verify `authority.key() == config.authority`
- Init `BlacklistedAccount` PDA at `["blacklisted", user]`
- Emit `AccountBlacklisted { user }`
- No `unblacklist` instruction exists.

---

### Step 4.3 — Create `instructions/redeem_lifecycle.rs`

Three instructions to complete the redemption escrow flow:

**`complete_redeem(redemption_id: u64)`** — minting_authority only
Called by the API after the fiat wire is confirmed.
- Verify `ctx.accounts.minting_authority.key() == config.minting_authority`
- Load `RedemptionRecord`, verify `status == Pending` → `RedemptionNotPending`
- Burn the escrowed solUSD from `redeem_escrow`
- Update `config.total_solusd_minted -= record.amount`
- Set `record.status = Completed`
- Emit `RedeemCompleted { user, redemption_id, timestamp }`

**`cancel_redeem(redemption_id: u64)`** — minting_authority only
Called by the API if the fiat wire fails.
- Verify `ctx.accounts.minting_authority.key() == config.minting_authority`
- Load `RedemptionRecord`, verify `status == Pending`
- Transfer solUSD from `redeem_escrow` back to `user_solusd_account`
- Set `record.status = Failed`
- Emit `RedeemCancelled { user, redemption_id, timestamp }`

**`claim_refund(redemption_id: u64)`** — user only, after 72h timeout
Safety net if the API never resolves the redemption.
- Verify `user.key() == record.user`
- Verify `status == Pending`
- Verify `clock.unix_timestamp - record.timestamp >= 72 * 3600` → `RedemptionTimeoutNotReached`
- Transfer solUSD from `redeem_escrow` back to user
- Set `record.status = Failed`
- Emit `RefundClaimed { user, redemption_id, timestamp }`

---

### Step 4.4 — Create `instructions/update_mint_caps.rs`

Admin instruction to update per-tx and daily mint caps.

```rust
pub fn handler(ctx: Context<UpdateMintCaps>, per_tx_cap: u64, daily_cap: u64) -> Result<()> {
    require!(ctx.accounts.authority.key() == ctx.accounts.config.authority, UnauthorizedAccess);
    let config = &mut ctx.accounts.config;
    config.per_tx_mint_cap = per_tx_cap;
    config.daily_mint_cap = daily_cap;
    emit!(MintCapsUpdated { per_tx_cap, daily_cap });
    Ok(())
}
```

---

## Phase 5 — Wire Everything Together ✅

### Step 5.1 — Update `instructions/mod.rs`

Export all new instruction modules:
```rust
pub mod update_reserves;
pub mod compliance;
pub mod redeem_lifecycle;
pub mod update_mint_caps;
```

---

### Step 5.2 — Update `lib.rs`

Add routing for all new public instructions:

```rust
pub fn mint_to_user(ctx: Context<MintToUser>, user_wallet: Pubkey, amount: u64) -> Result<()>
pub fn initiate_redeem(ctx: Context<InitiateRedeem>, solusd_amount: u64, redemption_id: u64) -> Result<()>
pub fn complete_redeem(ctx: Context<CompleteRedeem>, redemption_id: u64) -> Result<()>
pub fn cancel_redeem(ctx: Context<CancelRedeem>, redemption_id: u64) -> Result<()>
pub fn claim_refund(ctx: Context<ClaimRefund>, redemption_id: u64) -> Result<()>
pub fn update_reserves(ctx: Context<UpdateReserves>, amount: u64) -> Result<()>
pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()>
pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()>
pub fn freeze_account(ctx: Context<FreezeAccount>, user: Pubkey) -> Result<()>
pub fn unfreeze_account(ctx: Context<UnfreezeAccount>, user: Pubkey) -> Result<()>
pub fn blacklist_account(ctx: Context<BlacklistAccount>, user: Pubkey) -> Result<()>
pub fn update_mint_caps(ctx: Context<UpdateMintCaps>, per_tx_cap: u64, daily_cap: u64) -> Result<()>
```

Remove the old `mint` and `redeem` entrypoints. Keep `update_fee` and `withdraw_fees`.

Also add `pub mod events;` at the top.

---

## Phase 6 — PDAs to Remove ✅

The following PDAs exist in v1 but have no role in v2. They will simply not be created during `initialize` anymore. Existing devnet/testnet deployments will need a migration or a fresh program deployment.

| PDA Seed | Why Removed |
|---|---|
| `"reserve"` | No on-chain USDC reserve |
| `"reserve-vault"` | No USDC token account |

Remove all references to these from account structs and from `Config`. The `reserve_bump` field is removed in Step 1.1.

---

## Phase 7 — Build Verification ✅

```bash
/Users/patrick/.cargo/bin/anchor build --no-idl
```

Fix all compiler errors before proceeding. The biggest sources of errors will be:
- `Config` field removals causing references in old instruction files to fail
- Missing `oracle_config` accounts in `initialize`
- `mint.rs` referencing removed accounts

---

## Phase 8 — Update Hand-Written IDL and TypeScript Types ✅

**`target/idl/myproject.json`** — must be updated manually (auto-gen is disabled). Changes needed:
- Remove `mint` instruction, add `mintToUser`
- Remove `redeem` instruction, add `initiateRedeem`
- Add `completeRedeem`, `cancelRedeem`, `claimRefund`
- Add `updateReserves`, `setPaused`, `emergencyPause`, `freezeAccount`, `unfreezeAccount`, `blacklistAccount`, `updateMintCaps`
- Add `OracleConfig`, `RedemptionRecord`, `FrozenAccount`, `BlacklistedAccount` account types
- Add all new error codes (6008–6019)
- Add event definitions

**`target/types/myproject.ts`** — update to match IDL.

---

## Phase 9 — Rewrite Tests ✅

`tests/myproject.ts` must be rewritten to match the new instruction set. Key scenarios to cover:

**Initialization**
- [ ] Initialize with all new params (minting_authority, co_signer, emergency_guardian, caps, oracle)
- [ ] Verify Config fields set correctly
- [ ] Verify OracleConfig created

**Oracle**
- [ ] `update_reserves` called by oracle authority succeeds
- [ ] `update_reserves` called by non-oracle fails with `InvalidOracleAuthority`
- [ ] Oracle `last_updated` timestamp is set correctly

**Mint (mint_to_user)**
- [ ] Minting authority + co-signer mint to a user succeeds
- [ ] Minting authority alone fails (missing co-signer)
- [ ] Non-minting-authority fails with `UnauthorizedMinter`
- [ ] Minting when paused fails with `ProtocolPaused`
- [ ] Minting to a frozen account fails with `AccountFrozen`
- [ ] Minting to a blacklisted account fails with `AccountBlacklisted`
- [ ] Minting when oracle reserves < supply fails with `ReservesInsufficient`
- [ ] Minting when oracle is stale fails with `StaleOracle`
- [ ] Minting above `per_tx_mint_cap` fails with `MintCapExceeded`
- [ ] Minting above `daily_mint_cap` across multiple txs fails with `MintCapExceeded`
- [ ] Daily cap resets after 24h window
- [ ] MintExecuted event emitted

**Redeem (initiate_redeem)**
- [ ] User initiates redeem, solUSD moves to escrow
- [ ] `total_solusd_minted` not decremented yet
- [ ] RedemptionRecord created with Pending status
- [ ] Redeem when paused fails with `ProtocolPaused`
- [ ] Frozen account cannot redeem
- [ ] Blacklisted account cannot redeem
- [ ] RedeemInitiated event emitted

**Redeem lifecycle**
- [ ] `complete_redeem` by minting_authority burns escrow solUSD, decrements supply
- [ ] `cancel_redeem` by minting_authority returns solUSD to user
- [ ] `claim_refund` by user before 72h fails with `RedemptionTimeoutNotReached`
- [ ] `claim_refund` by user after 72h succeeds and returns solUSD
- [ ] `complete_redeem` on non-pending record fails with `RedemptionNotPending`

**Compliance**
- [ ] `set_paused(true)` by multi-sig pauses protocol
- [ ] `set_paused(false)` by multi-sig unpauses protocol
- [ ] `emergency_pause` by guardian pauses immediately
- [ ] `emergency_pause` by non-guardian fails
- [ ] `emergency_pause` cannot unpause (set_paused(false) required)
- [ ] `freeze_account` creates frozen PDA
- [ ] `unfreeze_account` closes frozen PDA and restores access
- [ ] `blacklist_account` creates blacklist PDA permanently

**Admin**
- [ ] `update_fee` by authority works, emits FeeUpdated
- [ ] `update_fee` by non-authority fails
- [ ] `update_mint_caps` by authority works, emits MintCapsUpdated
- [ ] `withdraw_fees` by authority works

---

## Phase 10 — Off-Chain API (Separate Codebase) 🔜 NOT STARTED

The on-chain program is complete after Phase 9. The off-chain API is a separate backend service. High-level requirements for when that work begins:

**Endpoints needed:**
- `POST /mint/request` — user submits wallet address, gets bank wire instructions
- `GET /mint/status/:id` — poll deposit confirmation status
- `POST /redeem/register-bank` — user registers bank account for redemption wires
- `GET /redeem/status/:id` — poll redemption wire status

**Event listener:** Subscribe to `RedeemInitiated` events on-chain and trigger wire initiation.

**Oracle service:** Periodically (at least every 12h) fetch bank balance and call `update_reserves` on-chain.

**Key management:** `minting_authority` and `emergency_guardian` keypairs must be in HSM/KMS before mainnet. For devnet testing, use local keypairs.

---

## Open Questions to Resolve Before Starting

1. ~~**Multi-sig implementation:** Squads Protocol vs. native M-of-N~~ **DECIDED: Squads Protocol.** The `authority` field holds the Squads vault address. Existing `authority.key() == config.authority` constraints work as-is — the vault PDA signs after M-of-N approval. No additional proposal/approve/execute logic needed in this program. Minimum 3-of-5 signers, configurable at init.

2. ~~**Fee model**~~ **DECIDED: On-chain fee.** `mint_to_user` mints `amount - fee` to the user and `fee` to `treasury_vault` as solUSD. See Step 3.2 for updated logic.

3. ~~**Treasury vault in v2**~~ **DECIDED: Kept.** `treasury_vault` accumulates solUSD fees. `withdraw_fees` stays as a multi-sig admin instruction.

4. ~~**Program upgrade vs. new deploy**~~ **DECIDED: Fresh deploy.** v2 deploys as a new program. A new keypair will be generated at build time, producing a new program ID. The v1 ID `7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J` is retired. Update `declare_id!` and `Anchor.toml` with the new ID after first build.

5. ~~**`redemption_id` generation**~~ **DECIDED: Counter in Config.** Add `redemption_counter: u64` to Config. On each `initiate_redeem`, use the current counter value as the `redemption_id`, then increment. PDA seed: `["redemption", user_pubkey, redemption_counter.to_le_bytes()]`. Client reads `config.redemption_counter` before calling to derive the correct PDA address.

---

## File Change Summary

| File | Action | Phase |
|---|---|---|
| `state/config.rs` | Rewrite | 1.1 |
| `state/oracle_config.rs` | Create | 1.2 |
| `state/redemption_record.rs` | Create | 1.3 |
| `state/frozen_account.rs` | Create | 1.4 |
| `state/blacklisted_account.rs` | Create | 1.4 |
| `state/mod.rs` | Update exports | 1.5 |
| `errors.rs` | Add 12 new variants | 2.1 |
| `events.rs` | Create | 2.2 |
| `instructions/initialize.rs` | Rewrite | 3.1 |
| `instructions/mint.rs` | Rewrite → `mint_to_user` | 3.2 |
| `instructions/redeem.rs` | Rewrite → `initiate_redeem` | 3.3 |
| `instructions/admin.rs` | Update (emit event) | 3.4 |
| `instructions/withdraw_fees.rs` | Update (remove USDC constraint) | 3.5 |
| `instructions/update_reserves.rs` | Create | 4.1 |
| `instructions/compliance.rs` | Create | 4.2 |
| `instructions/redeem_lifecycle.rs` | Create | 4.3 |
| `instructions/update_mint_caps.rs` | Create | 4.4 |
| `instructions/mod.rs` | Update exports | 5.1 |
| `lib.rs` | Update routing | 5.2 |
| `target/idl/myproject.json` | Manual rewrite | 8 |
| `target/types/myproject.ts` | Manual rewrite | 8 |
| `tests/myproject.ts` | Full rewrite | 9 |
