# solUSD v2 — Product Requirements Document

**Author:** Patrick
**Date:** April 4, 2026
**Status:** Draft
**Program ID:** `7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J`
**Stack:** Rust / Anchor 0.30.0 on Solana

---

## 1. Problem Statement

The current solUSD protocol is a USDC-backed stablecoin: users deposit USDC on-chain and receive solUSD at 1:1. While functional, this model inherits all of USDC's counterparty risk and offers no independent dollar backing. Users who want a stablecoin genuinely backed by US dollars held in reserve have no Solana-native option that provides on-chain proof of those reserves.

solUSD v2 transforms the protocol from a USDC wrapper into a fiat-backed stablecoin where every token in circulation is backed 1:1 by US dollars held in custodial bank accounts, with reserve balances published on-chain via a Chainlink-style oracle. This requires fundamental changes to the minting model (fiat deposit triggers on-chain mint, not USDC deposit), the addition of compliance controls (pause, freeze, blacklist), multi-sig governance for admin operations, and an off-chain API layer that bridges fiat banking to the Solana program.

The cost of not making this change is that solUSD remains a derivative of USDC with no independent value proposition, limited institutional appeal, and no path to regulatory legitimacy.

---

## 2. Goals

**User Goals**

- Users can convert US dollars to solUSD and back at a 1:1 rate (minus fees), with confidence that reserves exist.
- Users can verify on-chain at any time that total USD reserves >= total solUSD supply.
- Users experience automatic protection: minting halts if reserves ever fall below outstanding supply.

**Business Goals**

- Achieve $10M in total reserves within 6 months of mainnet launch, measured by oracle-reported balances.
- Maintain 100% reserve ratio at all times, verified by on-chain oracle data with no gaps longer than 24 hours.
- Generate sustainable fee revenue from mint/redeem operations with transparent on-chain accounting.
- Meet regulatory requirements for a fiat-backed stablecoin, including the ability to freeze accounts and pause operations if required by law enforcement.

---

## 3. Non-Goals

- **Algorithmic stability mechanisms.** solUSD is strictly 1:1 fiat-backed. No bonding curves, no collateral ratios, no algorithmic minting. Reason: simplicity and trust.
- **Multi-currency support.** v2 supports USD only. EUR, GBP, or other fiat currencies are a separate initiative.
- **Yield or interest on reserves.** Revenue from reserve investments (T-bills, etc.) is out of scope. The protocol earns only from mint/redeem fees.
- **Decentralized governance (DAO voting).** Admin operations use multi-sig, not token-weighted governance. DAO governance is premature at this stage.
- **USDC compatibility or migration path.** The USDC deposit flow is being removed entirely. There is no bridge or conversion from USDC-backed solUSD to fiat-backed solUSD.

---

## 4. User Stories

### End Users (Token Holders)

- As a **crypto user**, I want to deposit USD via bank transfer and receive solUSD in my wallet so that I can hold a dollar-denominated asset on Solana.
- As a **solUSD holder**, I want to redeem my solUSD for US dollars sent to my bank account so that I can exit the protocol at any time.
- As a **solUSD holder**, I want to verify on-chain that the total USD reserves match or exceed the total solUSD supply so that I can trust the peg.
- As a **DeFi user**, I want to use solUSD as collateral or in liquidity pools, trusting that it is always redeemable for $1.

### Protocol Administrators (Multi-sig Signers)

- As a **protocol admin**, I want to pause all minting and redeeming in an emergency so that the protocol can respond to security incidents.
- As a **protocol admin**, I want to freeze a specific wallet address so that the protocol can comply with law enforcement requests.
- As a **protocol admin**, I want to blacklist an address permanently so that sanctioned entities cannot use the protocol.
- As a **protocol admin**, I want to update the mint/redeem fee so that the protocol can adjust its revenue model.
- As a **protocol admin**, I want to withdraw accumulated fees from the treasury so that the protocol can fund operations.
- As a **protocol admin**, I want all admin actions to require multi-sig approval so that no single party can unilaterally control the protocol.

### Oracle / Attestor

- As an **oracle operator**, I want to publish the current USD reserve balance on-chain so that users and the program can verify the peg.
- As an **oracle operator**, I want the protocol to automatically halt minting if my reported reserves fall below the outstanding supply so that the system self-protects.

---

## 5. Requirements

### Must-Have (P0)

#### 5.1 Remove USDC Deposit/Redemption Flow
The current `mint` and `redeem` instructions accept USDC transfers on-chain. These must be replaced with a fiat-triggered model.

- **Remove:** `reserve-vault` (USDC token account), USDC transfer logic in `mint.rs` and `redeem.rs`, and the `usdc_mint` field from `Config`.
- **Replace with:** A `mint_to_user` instruction callable only by an authorized minting authority (the off-chain API service) after confirming a fiat deposit.
- **Replace with:** A `initiate_redeem` instruction that burns solUSD and emits an event; the off-chain API service listens for the event and triggers a fiat wire.

**Acceptance Criteria:**
- [ ] No USDC token accounts exist in the program's PDA set
- [ ] `mint_to_user` accepts (user_wallet, amount) and is restricted to the minting authority
- [ ] `initiate_redeem` burns the user's solUSD and emits a `RedeemInitiated` event with (user_wallet, amount, timestamp)
- [ ] Fee math remains identical (basis points on mint and redeem)

#### 5.2 On-Chain Proof of Reserves (Chainlink-Style Oracle)

A trusted oracle publishes the total USD reserve balance to an on-chain account that the program reads.

- **New PDA:** `"oracle-config"` storing the authorized oracle public key and the latest reserve balance.
- **New instruction:** `update_reserves(amount: u64)` callable only by the authorized oracle key.
- **The program reads `oracle-config.total_usd_reserves`** when processing `mint_to_user` to verify the peg holds.

**Acceptance Criteria:**
- [ ] `oracle-config` PDA stores: `oracle_authority` (Pubkey), `total_usd_reserves` (u64), `last_updated` (i64 timestamp), bumps
- [ ] Only the `oracle_authority` can call `update_reserves`
- [ ] `update_reserves` updates the balance and sets `last_updated` to current clock timestamp
- [ ] Reserve data is readable by any off-chain client

#### 5.3 Circuit Breaker: Auto-Halt Minting

If on-chain reserves < total outstanding solUSD supply, minting must halt automatically.

- **In `mint_to_user`:** Before minting, assert `oracle_config.total_usd_reserves >= config.total_solusd_minted + mint_amount`.
- **New error code:** `ReservesInsufficient` — "Minting halted: reserves below outstanding supply."
- Redemptions remain open (allowing supply to decrease and restore the ratio).

**Acceptance Criteria:**
- [ ] `mint_to_user` fails with `ReservesInsufficient` if post-mint supply would exceed reported reserves
- [ ] `initiate_redeem` succeeds regardless of reserve ratio (users can always exit)
- [ ] Minting resumes automatically once the oracle updates reserves above the supply

#### 5.4 Compliance Controls: Pause, Freeze, Blacklist

**Global Pause:**
- New field in `Config`: `is_paused: bool`
- New instruction: `set_paused(paused: bool)` — admin multi-sig only
- When paused, `mint_to_user` and `initiate_redeem` both revert with `ProtocolPaused`

**Account Freeze:**
- New PDA pattern: `["frozen", user_pubkey]` — existence means the account is frozen
- New instruction: `freeze_account(user: Pubkey)` — admin multi-sig only
- New instruction: `unfreeze_account(user: Pubkey)` — admin multi-sig only
- Frozen accounts cannot call `initiate_redeem` or receive minted solUSD
- New error code: `AccountFrozen`

**Blacklist:**
- New PDA pattern: `["blacklisted", user_pubkey]` — permanent, no unblacklist instruction
- New instruction: `blacklist_account(user: Pubkey)` — admin multi-sig only
- Blacklisted accounts cannot interact with the protocol at all
- New error code: `AccountBlacklisted`

**Acceptance Criteria:**
- [ ] `set_paused(true)` causes all mint/redeem calls to fail with `ProtocolPaused`
- [ ] `set_paused(false)` restores normal operations
- [ ] Frozen accounts cannot redeem or receive mints; error is `AccountFrozen`
- [ ] Unfreezing restores full access
- [ ] Blacklisted accounts are permanently blocked; no unblacklist path exists
- [ ] All compliance instructions require multi-sig authorization

#### 5.5 Multi-Sig Governance

Replace the single `authority` in `Config` with a multi-sig requirement for all admin operations.

- **Option A (recommended):** Integrate with Squads Protocol (Solana-native multi-sig) — the `authority` field becomes a Squads vault address, and all admin instructions verify the caller is the vault executing an approved transaction.
- **Option B:** Build a native M-of-N multi-sig into the program with proposal/approve/execute flow.

**Acceptance Criteria:**
- [ ] No admin instruction can execute with a single signer
- [ ] At minimum 3-of-5 signers required (configurable at initialization)
- [ ] Fee updates, pause/unpause, freeze/blacklist, oracle authority changes, and fee withdrawals all require multi-sig
- [ ] Multi-sig threshold is updatable (itself requiring current multi-sig approval)

#### 5.6 Off-Chain API Layer

A backend service that bridges fiat banking to the Solana program.

**Fiat Deposit Flow (Mint):**
1. User submits a mint request via API with their Solana wallet address
2. API returns bank wire instructions (or ACH details) with a unique reference ID
3. Banking partner confirms deposit receipt via webhook
4. API calls `mint_to_user(user_wallet, net_amount)` on-chain
5. API calls `deposit_fee(fee_amount)` to treasury

**Fiat Redemption Flow (Redeem):**
1. User calls `initiate_redeem(amount)` on-chain, burning solUSD
2. API listens for `RedeemInitiated` events
3. API initiates fiat wire to user's registered bank account
4. API calls `update_reserves` (or triggers oracle update) reflecting the outflow

**Acceptance Criteria:**
- [ ] API exposes: `POST /mint/request`, `GET /mint/status/:id`, `POST /redeem/register-bank`, `GET /redeem/status/:id`
- [ ] All API endpoints require authentication (API key + KYC verification for large amounts)
- [ ] Fiat deposit confirmation triggers on-chain mint within 15 minutes of bank confirmation
- [ ] Redemption wire initiated within 1 business day of on-chain burn
- [ ] API maintains an audit log of all mint/redeem operations

#### 5.7 Stale Oracle Protection (Promoted from P1)

If `oracle_config.last_updated` is older than a configurable threshold, minting halts automatically. This protects against a silent oracle failure where the program trusts a stale reserve balance indefinitely.

- **New field in OracleConfig:** `max_staleness_seconds: i64` (default 86400 = 24 hours, configurable by admin multi-sig)
- **In `mint_to_user`:** Before minting, assert `clock.unix_timestamp - oracle_config.last_updated <= oracle_config.max_staleness_seconds`
- **New error code:** `StaleOracle` — "Minting halted: oracle data exceeds maximum staleness."
- Redemptions remain open regardless of oracle staleness.

**Acceptance Criteria:**
- [ ] `mint_to_user` fails with `StaleOracle` if `last_updated` exceeds `max_staleness_seconds`
- [ ] `initiate_redeem` succeeds regardless of oracle staleness
- [ ] `max_staleness_seconds` is updatable via multi-sig
- [ ] Minting resumes automatically once the oracle posts a fresh update

#### 5.8 Minting Authority Key Security and Mint Caps

The minting authority key (held by the off-chain API) is the most valuable attack surface. A compromised key could mint unbacked solUSD. This requirement adds defense-in-depth.

**HSM Requirement:**
- The minting authority keypair must be generated and stored in a hardware security module (HSM) or cloud KMS (e.g., AWS CloudHSM, GCP Cloud KMS). The private key must never exist in plaintext outside the HSM.

**Mint Caps (On-Chain):**
- **New fields in Config:** `per_tx_mint_cap: u64` (max solUSD per single mint), `daily_mint_cap: u64` (max solUSD per rolling 24h window), `daily_minted: u64` (counter), `daily_mint_window_start: i64` (timestamp)
- **In `mint_to_user`:** Assert `amount <= per_tx_mint_cap`. Assert `daily_minted + amount <= daily_mint_cap` within the current 24h window. If window has elapsed, reset counter.
- Caps are updatable via multi-sig only.
- Mints exceeding either cap fail with `MintCapExceeded`.

**Dual-Signature Minting (Recommended):**
- The API proposes a mint; a separate co-signer service independently verifies the bank deposit via a second channel before countersigning.
- On-chain, `mint_to_user` requires two signers: `minting_authority` AND `co_signer`. Both must sign the transaction.
- **New field in Config:** `co_signer: Pubkey`

**Acceptance Criteria:**
- [ ] `mint_to_user` fails with `MintCapExceeded` if amount exceeds `per_tx_mint_cap`
- [ ] `mint_to_user` fails with `MintCapExceeded` if `daily_minted + amount` exceeds `daily_mint_cap`
- [ ] Daily counter resets after 24 hours
- [ ] Both `minting_authority` and `co_signer` must sign `mint_to_user` transactions
- [ ] Caps and co-signer are updatable via multi-sig only
- [ ] HSM key management documented in operational runbook

#### 5.9 Emergency Guardian Role

Full multi-sig (3-of-5) for an emergency pause creates an unacceptable response time risk. A dedicated emergency guardian can pause the protocol instantly while unpause still requires full multi-sig.

- **New field in Config:** `emergency_guardian: Pubkey`
- **New instruction:** `emergency_pause()` — callable by `emergency_guardian` only; sets `is_paused = true`
- `emergency_pause` can ONLY pause. It cannot unpause, change fees, freeze accounts, or take any other action.
- `set_paused(false)` (unpause) still requires full multi-sig.
- The `emergency_guardian` key is stored in an HSM and held by a trusted operator with 24/7 availability.
- The guardian key is updatable via multi-sig.

**Acceptance Criteria:**
- [ ] `emergency_guardian` can call `emergency_pause()` as a single signer
- [ ] `emergency_pause()` only sets `is_paused = true`; it cannot unpause or perform any other action
- [ ] `set_paused(false)` still requires full multi-sig
- [ ] `emergency_guardian` is updatable via multi-sig
- [ ] Protocol can be paused within seconds of an incident, not hours

#### 5.10 Redemption Escrow and Failure Recovery

Users burn solUSD instantly on-chain but receive fiat over 1+ business days. If the wire fails, users lose both their solUSD and their dollars. This requirement makes redemptions recoverable.

**Escrow Model:**
- `initiate_redeem` does NOT burn solUSD directly. Instead, it transfers solUSD to a protocol-owned escrow token account (`"redeem-escrow"` PDA).
- **New PDA per redemption:** `["redemption", user_pubkey, redemption_id]` — stores `user`, `amount`, `timestamp`, `status` (pending/completed/failed).
- The off-chain API initiates the fiat wire and, upon bank confirmation, calls `complete_redeem(redemption_id)` which burns the escrowed solUSD.
- If the wire fails, the API calls `cancel_redeem(redemption_id)` which returns the escrowed solUSD to the user's wallet.
- **Timeout safety net:** If no `complete_redeem` or `cancel_redeem` occurs within 72 hours, the user can call `claim_refund(redemption_id)` to reclaim their solUSD from escrow.

**Acceptance Criteria:**
- [ ] `initiate_redeem` moves solUSD to escrow, does not burn
- [ ] Redemption PDA tracks status: pending, completed, failed
- [ ] `complete_redeem` burns escrowed solUSD (callable by minting authority / API only)
- [ ] `cancel_redeem` returns escrowed solUSD to user (callable by minting authority / API only)
- [ ] `claim_refund` returns escrowed solUSD to user after 72h timeout (callable by user)
- [ ] Escrowed solUSD is counted in `total_solusd_minted` (still outstanding until burned)

#### 5.11 Updated Config Account

```
authority              Pubkey    Multi-sig vault address (Squads)
mint                   Pubkey    solUSD token mint address
oracle_authority       Pubkey    Authorized oracle key
minting_authority      Pubkey    Off-chain API minting key (HSM-backed)
co_signer              Pubkey    Independent co-signer for dual-sig minting
emergency_guardian     Pubkey    Single-signer emergency pause key (HSM-backed)
fee_bps                u64       Fee in basis points
total_solusd_minted    u64       Total outstanding solUSD (6 decimals)
per_tx_mint_cap        u64       Max solUSD per single mint transaction
daily_mint_cap         u64       Max solUSD per rolling 24h window
daily_minted           u64       Counter for current 24h window
daily_mint_window_start i64      Timestamp when current window started
is_paused              bool      Global pause flag
bump                   u8
mint_authority_bump    u8
treasury_bump          u8
oracle_config_bump     u8
redeem_escrow_bump     u8
```

**OracleConfig account:**
```
oracle_authority       Pubkey    Authorized oracle key
total_usd_reserves     u64       Latest reported USD reserves (6 decimals)
last_updated           i64       Timestamp of last oracle update
max_staleness_seconds  i64       Max allowed age of oracle data before minting halts
bump                   u8
```

**Removed fields from v1 Config:** `usdc_mint`, `total_usdc_reserves`, `reserve_bump`.

**New accounts:**
| PDA Seed | Type | Purpose |
|---|---|---|
| `"oracle-config"` | OracleConfig | Oracle authority, reserve balance, staleness config |
| `"redeem-escrow"` | SPL token account | Holds solUSD during pending redemptions |
| `["frozen", user_pubkey]` | FrozenAccount (empty) | Existence = account is frozen |
| `["blacklisted", user_pubkey]` | BlacklistedAccount (empty) | Existence = account is blacklisted |
| `["redemption", user_pubkey, id]` | RedemptionRecord | Tracks status of individual redemptions |

### Nice-to-Have (P1)

#### 5.16 Rate Limiting
Per-wallet rate limits on mint and redeem to prevent abuse. Configurable by admin. E.g., max $100K per wallet per 24 hours.

#### 5.17 Event Emission
Emit Anchor events for all state changes: `MintExecuted`, `RedeemInitiated`, `RedeemCompleted`, `RedeemCancelled`, `RefundClaimed`, `ReservesUpdated`, `AccountFrozen`, `AccountBlacklisted`, `ProtocolPaused`, `EmergencyPaused`, `FeeUpdated`, `MintCapUpdated`. Enables indexing and real-time monitoring.

#### 5.18 Reserve Attestation History
Store the last N oracle updates on-chain (ring buffer) so users can see a history of reserve attestations, not just the latest.

#### 5.19 Dual-Oracle Redundancy
Run two independent oracle sources (e.g., Chainlink + Switchboard). The program uses the lower of the two reported values. If one oracle fails, the other continues operating. Divergence beyond a threshold triggers an alert event.

### Future Considerations (P2)

#### 5.20 Timelock on Admin Actions
Add a mandatory delay (e.g., 48 hours) between proposing and executing fee changes, oracle authority changes, or other non-emergency admin actions. Emergency pause remains immediate.

#### 5.21 Third-Party Audit Integration
Publish a standardized attestation format that auditing firms (e.g., Grant Thornton, Deloitte) can sign and submit on-chain, supplementing the oracle feed.

#### 5.22 Multi-Custodian Reserve Model
Spread USD reserves across multiple bank custodians with each reporting independently. Aggregate on-chain for total reserve calculation.

#### 5.23 Fiat On-Ramp Partners
Integrate with payment processors (Stripe, Bridge, etc.) so users can deposit via card or instant bank transfer rather than wire only.

---

## 6. Success Metrics

| Metric | Target | Measurement | Timeframe |
|---|---|---|---|
| Reserve ratio | >= 100% at all times | `oracle_config.total_usd_reserves / config.total_solusd_minted` | Continuous |
| Oracle freshness | Updated at least every 12 hours | `clock.unix_timestamp - oracle_config.last_updated` | Continuous |
| Total reserves | $10M | Oracle-reported balance | 6 months post-launch |
| Mint latency | < 15 min from bank confirmation to on-chain mint | API audit log timestamps | Ongoing |
| Redeem latency | < 1 business day from burn to wire initiation | API audit log timestamps | Ongoing |
| Circuit breaker activations | 0 | On-chain error logs | Ongoing |
| Compliance response time | < 1 hour to freeze an account after request | Admin action timestamps | Ongoing |

---

## 7. Architecture: Current vs. Proposed

### Current Flow (v1 — Being Replaced)
```
User USDC Wallet --> [mint instruction] --> USDC Reserve Vault (on-chain)
                                       --> solUSD minted to user
User solUSD      --> [redeem instruction] --> solUSD burned
                                          --> USDC sent from Reserve Vault
```

### Proposed Flow (v2)
```
User Bank Account --> [wire/ACH] --> Custodial Bank Account (off-chain)
Banking Partner   --> [webhook]  --> Off-Chain API
Off-Chain API     --> [mint_to_user] --> solUSD minted to user's wallet

User solUSD       --> [initiate_redeem] --> solUSD burned, event emitted
Off-Chain API     <-- [event listener]  <-- RedeemInitiated event
Off-Chain API     --> [wire initiation] --> User Bank Account

Oracle Service    --> [update_reserves] --> Oracle Config PDA (on-chain)
Program           --> [reads oracle]    --> Validates peg before minting
```

### Key Differences Summary

| Aspect | v1 (Current) | v2 (Proposed) |
|---|---|---|
| Backing asset | USDC (on-chain) | USD (off-chain bank accounts) |
| Mint trigger | User deposits USDC directly | Off-chain API after fiat confirmation |
| Redeem trigger | User burns solUSD, gets USDC | User burns solUSD, receives fiat wire |
| Reserve verification | Implicit (USDC in vault) | Explicit (Chainlink-style oracle) |
| Admin model | Single authority key | Multi-sig (3-of-5 via Squads) |
| Compliance controls | None | Pause, freeze, blacklist |
| Circuit breaker | None | Auto-halt minting if reserves < supply |
| Off-chain dependency | None | API layer + banking partner |

---

## 8. Changes to Existing Codebase

### Files to Remove or Gut
| File | Change |
|---|---|
| `instructions/mint.rs` | Rewrite entirely: remove USDC transfer, add `mint_to_user` with authority check + oracle check |
| `instructions/redeem.rs` | Rewrite entirely: remove USDC transfer, add `initiate_redeem` with burn + event emission |
| `instructions/initialize.rs` | Remove USDC mint/vault setup; add oracle config, pause flag, multi-sig authority |
| `state/config.rs` | Remove `usdc_mint`, `total_usdc_reserves`, `reserve_bump`; add `is_paused`, `oracle_config_bump` |

### Files to Add
| File | Purpose |
|---|---|
| `state/oracle_config.rs` | OracleConfig account struct |
| `state/frozen_account.rs` | FrozenAccount PDA marker |
| `state/blacklisted_account.rs` | BlacklistedAccount PDA marker |
| `state/redemption_record.rs` | RedemptionRecord PDA struct (user, amount, timestamp, status) |
| `instructions/update_reserves.rs` | Oracle reserve update instruction |
| `instructions/compliance.rs` | `set_paused`, `emergency_pause`, `freeze_account`, `unfreeze_account`, `blacklist_account` |
| `instructions/redeem_lifecycle.rs` | `complete_redeem`, `cancel_redeem`, `claim_refund` |
| `events.rs` | Anchor event definitions for all state changes |

### Files to Modify
| File | Change |
|---|---|
| `lib.rs` | Add new instruction routing for all new instructions |
| `errors.rs` | Add: `ProtocolPaused`, `AccountFrozen`, `AccountBlacklisted`, `ReservesInsufficient`, `StaleOracle`, `InvalidOracleAuthority` |
| `instructions/admin.rs` | Add multi-sig verification to `update_fee` |
| `instructions/withdraw_fees.rs` | Add multi-sig verification |
| `target/idl/myproject.json` | Update hand-maintained IDL with all new instructions, accounts, events |
| `target/types/myproject.ts` | Update hand-maintained TypeScript types |
| `tests/myproject.ts` | Rewrite test suite for new flows |

### PDAs to Remove
| PDA | Reason |
|---|---|
| `"reserve"` | No more on-chain USDC reserve |
| `"reserve-vault"` | No more USDC token account |

### New Error Codes
| Code | Name | Description |
|---|---|---|
| 6008 | `ProtocolPaused` | Protocol is paused; no minting or redeeming |
| 6009 | `AccountFrozen` | This account is frozen |
| 6010 | `AccountBlacklisted` | This account is blacklisted |
| 6011 | `ReservesInsufficient` | Minting halted: post-mint supply would exceed reserves |
| 6012 | `InvalidOracleAuthority` | Caller is not the authorized oracle |
| 6013 | `StaleOracle` | Minting halted: oracle data exceeds max staleness threshold |
| 6014 | `UnauthorizedMinter` | Caller is not the authorized minting service |
| 6015 | `MintCapExceeded` | Mint amount exceeds per-transaction or daily cap |
| 6016 | `InvalidCoSigner` | Co-signer verification failed |
| 6017 | `RedemptionNotFound` | Redemption record does not exist |
| 6018 | `RedemptionNotPending` | Redemption is not in pending status |
| 6019 | `RedemptionTimeoutNotReached` | 72h timeout has not elapsed; cannot claim refund yet |

---

## 9. Open Questions (Updated)

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | Which banking partner will hold USD reserves? This determines the webhook integration for the API layer. | Biz Dev | Yes |
| 2 | Which Chainlink oracle product will be used, or will we run a custom oracle node? Chainlink Data Feeds vs. custom Chainlink External Adapter vs. Switchboard as fallback. | Engineering | Yes |
| 3 | What is the KYC requirement for mint/redeem? Open access is the goal, but fiat on/off ramps may require KYC for regulatory compliance. | Legal | Yes |
| 4 | Should Squads Protocol be used for multi-sig, or should we build native multi-sig into the program? Squads is battle-tested but adds an external dependency. | Engineering | No |
| 5 | What is the maximum acceptable oracle staleness before minting should halt? 12 hours? 24 hours? | Product | No |
| 6 | Is the existing program ID reusable, or should v2 deploy as a new program? Reusing requires an upgrade authority; new program is cleaner but breaks existing integrations. | Engineering | Yes |
| 7 | What audit firm will review the v2 program before mainnet? | Biz Dev | No (can proceed with devnet) |
| 8 | Which HSM/KMS provider for minting authority and emergency guardian keys? AWS CloudHSM, GCP Cloud KMS, or dedicated HSM appliance? | Engineering | Yes |
| 9 | What is the appropriate per-transaction and daily mint cap at launch? Needs to balance usability with risk exposure. | Product + Risk | No |
| 10 | Who serves as the emergency guardian operator with 24/7 availability? Internal team member or contracted service? | Operations | Yes (before mainnet) |

---

## 10. Timeline Considerations

**Phase 1 — On-Chain Program (Weeks 1-4)**
Implement all P0 on-chain changes: remove USDC flow, add oracle integration, compliance controls, multi-sig, circuit breaker. Deploy to devnet.

**Phase 2 — Off-Chain API (Weeks 3-6)**
Build the API layer: fiat deposit/redemption flow, banking partner integration, event listener, audit logging. Overlap with Phase 1.

**Phase 3 — Integration Testing (Weeks 5-7)**
End-to-end testing on devnet with testnet fiat (sandbox banking API). Oracle simulation. Multi-sig workflow testing.

**Phase 4 — Audit (Weeks 7-10)**
Third-party security audit of the on-chain program. Fix findings. Re-audit critical findings.

**Phase 5 — Mainnet Launch (Week 11+)**
Deploy to mainnet. Begin with limited access (invite-only) before opening to all users.

**Hard Dependencies:**
- Banking partner agreement must be signed before Phase 2 can begin
- Oracle provider must be selected before Phase 1 oracle integration
- Legal review of compliance controls must complete before mainnet

---

## 11. Risk Register

| # | Risk | Severity | Likelihood | Mitigation | PRD Section |
|---|---|---|---|---|---|
| R1 | **Oracle single point of failure.** Oracle goes offline, gets compromised, or reports incorrect data. Minting either halts unnecessarily or circuit breaker fails to trigger. | Critical | Medium | Stale oracle protection (5.7) auto-halts minting if oracle stops updating. Dual-oracle redundancy (5.19, P1) adds a second independent source. Long-term, bank-signed attestations (5.21, P2) push trust to the custodian. | 5.2, 5.7, 5.19 |
| R2 | **Minting authority key compromise.** Attacker gains access to the API's signing key and mints unbacked solUSD. Single most valuable attack surface in the system. | Critical | Low | HSM-stored keys (5.8), per-transaction and daily mint caps bound blast radius, dual-signature minting requires independent co-signer verification. Compromising one key alone is insufficient. | 5.8 |
| R3 | **Single banking partner failure.** Bank freezes account, terminates relationship, or experiences prolonged outage. Users can burn solUSD but never receive dollars. | High | Medium | Contractual SLA with uptime guarantees and wind-down period. Multi-custodian model (5.22, P2) spreads risk. Redemption escrow (5.10) protects users during wire failures with automatic refund after 72h. | 5.10, 5.22 |
| R4 | **Compliance controls without legal framework.** Freeze/blacklist exist technically but no policy governs when they're used. Risk of misuse or non-use under regulatory pressure. | High | High | Compliance policy document required before mainnet (Open Question #3). On-chain compliance log with reason hashes for audit trail. Engage compliance counsel during Phase 1 to determine money transmitter licensing requirements. | 5.4, OQ#3 |
| R5 | **Redemption timing mismatch.** User burns solUSD instantly but fiat wire takes 1+ business days. Wire failure leaves user with neither solUSD nor dollars. | High | Medium | Escrow model (5.10): solUSD held in escrow during pending redemptions, not burned. `cancel_redeem` returns tokens on wire failure. 72h `claim_refund` timeout as user-initiated safety net. | 5.10 |
| R6 | **Multi-sig emergency response delay.** Requiring 3-of-5 for emergency pause means incident response depends on signer availability. Weekend or off-hours incidents could go unaddressed for hours. | High | Medium | Emergency guardian role (5.9): single HSM-backed key can pause instantly. Only pause, never unpause or other actions. Full multi-sig still required to resume operations. | 5.9 |
| R7 | **Regulatory classification risk.** Protocol may be classified as a money transmitter, requiring FinCEN registration and state-by-state licensing. Non-compliance could force shutdown. | Critical | High | Blocking open question (#3). Legal counsel must determine classification before mainnet. Protocol architecture supports KYC gating if required (API layer already authenticates users). Compliance controls satisfy enforcement requirements. | OQ#3, 5.4, 5.6 |
| R8 | **Oracle-reserve divergence.** Oracle reports a balance that doesn't match actual bank balances due to timing, errors, or manipulation. | Medium | Medium | Dual-oracle redundancy (5.19, P1) cross-checks sources. Reserve attestation history (5.18, P1) enables trend analysis. Third-party audit integration (5.21, P2) adds independent verification. Mint caps (5.8) bound exposure during divergence. | 5.8, 5.18, 5.19, 5.21 |

---

## 12. Appendix: Updated Instruction Set

| Instruction | Access | Description |
|---|---|---|
| `initialize(fee_bps, oracle_authority, minting_authority, co_signer, emergency_guardian, per_tx_cap, daily_cap)` | Deployer | Creates Config, solUSD mint, oracle config, treasury vault, redeem escrow |
| `mint_to_user(user_wallet, amount)` | Minting Authority + Co-signer | Mint solUSD after fiat deposit; checks oracle reserves, staleness, and mint caps |
| `initiate_redeem(amount)` | Any non-frozen, non-blacklisted user | Transfer solUSD to escrow, create RedemptionRecord, emit RedeemInitiated event |
| `complete_redeem(redemption_id)` | Minting Authority | Burn escrowed solUSD after fiat wire confirmed |
| `cancel_redeem(redemption_id)` | Minting Authority | Return escrowed solUSD to user after wire failure |
| `claim_refund(redemption_id)` | Redemption owner | Reclaim escrowed solUSD after 72h timeout with no resolution |
| `update_reserves(amount)` | Oracle Authority | Update on-chain reserve balance and timestamp |
| `update_fee(new_fee_bps)` | Multi-sig | Update fee rate (max 10%) |
| `update_mint_caps(per_tx, daily)` | Multi-sig | Update minting caps |
| `withdraw_fees(amount)` | Multi-sig | Withdraw accumulated fees from treasury |
| `set_paused(paused)` | Multi-sig | Pause or unpause all protocol operations |
| `emergency_pause()` | Emergency Guardian | Immediately pause all operations (pause only, cannot unpause) |
| `freeze_account(user)` | Multi-sig | Freeze a specific wallet |
| `unfreeze_account(user)` | Multi-sig | Unfreeze a specific wallet |
| `blacklist_account(user)` | Multi-sig | Permanently blacklist a wallet |
