# v2 Test Plan

Full specification of every test case for the v2 program. Write tests in `tests/myproject.ts` against this plan. Tests run on localnet with `anchor test --skip-build`.

Each test case includes: what to call, what to assert, and what error to expect on failure cases.

---

## Test Setup (before hook)

> **Note:** The plan originally described setting up a Squads multisig vault as `authority`. In the actual implementation, `provider.wallet.publicKey` is used as `authority` (no Squads on localnet). The on-chain program only checks `authority.key() == config.authority`, so this simplification is valid for testing.

```
1. Create solUSD mint keypair
2. Use provider.wallet.publicKey as authority (simulates multi-sig vault)
3. Create minting_authority keypair (airdrop SOL)
4. Create co_signer keypair (airdrop SOL)
5. Create emergency_guardian keypair (airdrop SOL)
6. Derive all PDAs (config, mintAuthority, oracleConfig, treasury, treasuryVault, redeemEscrow, redeemEscrowAuthority)
7. Run initialize — minting_authority/co_signer/emergencyGuardian passed as accounts (not args)
8. Create authority's solUSD ATA inside test 1.1 (requires mint to exist first)
```

**Optional accounts sentinel:** `mintToUser` and `initiateRedeem` have optional `frozenAccount` and `blacklistedAccount` accounts. Anchor 0.30.1 requires all IDL accounts to be provided. Pass `program.programId` as sentinel for unused optional accounts. The `mintAccounts()` helper in the test file encapsulates this pattern for all `mintToUser` calls.

---

## 1. Initialization

### 1.1 — Initializes successfully
**Call:** `initialize(fee_bps=30, minting_authority, co_signer, emergency_guardian, per_tx_cap=1_000_000_000, daily_cap=10_000_000_000, max_staleness=86400)`
**Assert:**
- `config.authority == vaultPda`
- `config.mint == mintKeypair.publicKey`
- `config.minting_authority == mintingAuthority.publicKey`
- `config.co_signer == coSigner.publicKey`
- `config.emergency_guardian == emergencyGuardian.publicKey`
- `config.fee_bps == 30`
- `config.total_solusd_minted == 0`
- `config.is_paused == false`
- `config.redemption_counter == 0`
- `config.per_tx_mint_cap == 1_000_000_000`
- `config.daily_mint_cap == 10_000_000_000`
- OracleConfig account exists at `oracle_config` PDA
- `oracle_config.oracle_authority == mintingAuthority.publicKey`
- `oracle_config.total_usd_reserves == 0`
- `oracle_config.max_staleness_seconds == 86400`
- Treasury vault token account exists
- Redeem escrow token account exists

### 1.2 — Rejects fee above maximum
**Call:** `initialize(fee_bps=1001, ...)`
**Expect error:** `FeeTooHigh` (6003)

---

## 2. Oracle

### 2.1 — Updates reserves successfully
**Call:** `update_reserves(amount=10_000_000_000)` signed by `oracle_authority`
**Assert:**
- `oracle_config.total_usd_reserves == 10_000_000_000`
- `oracle_config.last_updated` is recent (within 5 seconds of `Date.now()/1000`)
- `ReservesUpdated` event emitted with correct amount and timestamp

### 2.2 — Rejects non-oracle caller
**Call:** `update_reserves(amount=10_000_000_000)` signed by a random keypair
**Expect error:** `InvalidOracleAuthority` (6012)

---

## 3. Mint (mint_to_user)

**Pre-condition for all mint tests:** Oracle has been updated with sufficient reserves (`update_reserves(amount=100_000_000_000)`). User wallet has a solUSD ATA created.

### 3.1 — Mints successfully with dual signature
**Call:** `mint_to_user(user_wallet, amount=100_000_000)` signed by `minting_authority` + `co_signer`
**Assert:**
- User solUSD balance == `amount - fee` == `100_000_000 - 30_000` == `99_970_000`
- Treasury vault solUSD balance increased by `30_000`
- `config.total_solusd_minted == 99_970_000`
- `config.daily_minted == 100_000_000`
- `MintExecuted` event emitted with correct user, amount, fee, timestamp

### 3.2 — Rejects missing co-signer
**Call:** `mint_to_user(...)` signed by `minting_authority` only (no co_signer)
**Expect error:** Anchor `SignerError` or `InvalidCoSigner` (6016)

### 3.3 — Rejects wrong minting authority
**Call:** `mint_to_user(...)` signed by a random keypair + co_signer
**Expect error:** `UnauthorizedMinter` (6014)

### 3.4 — Rejects when protocol is paused
**Setup:** Call `set_paused(true)` via Squads first
**Call:** `mint_to_user(user_wallet, amount=100_000_000)`
**Expect error:** `ProtocolPaused` (6008)
**Cleanup:** Call `set_paused(false)` via Squads

### 3.5 — Rejects mint to frozen account
**Setup:** Call `freeze_account(user_wallet)` via Squads
**Call:** `mint_to_user(user_wallet, amount=100_000_000)`
**Expect error:** `AccountFrozen` (6009)
**Cleanup:** Call `unfreeze_account(user_wallet)` via Squads

### 3.6 — Rejects mint to blacklisted account
**Setup:** Call `blacklist_account(user_wallet)` via Squads
**Call:** `mint_to_user(user_wallet, amount=100_000_000)`
**Expect error:** `AccountBlacklisted` (6010)

### 3.7 — Rejects when reserves insufficient
**Setup:** Set oracle reserves below total supply (`update_reserves(amount=0)`)
**Call:** `mint_to_user(user_wallet, amount=100_000_000)`
**Expect error:** `ReservesInsufficient` (6011)
**Cleanup:** Restore oracle to sufficient amount

### 3.8 — Rejects when oracle is stale
**Setup:** Initialize with `max_staleness_seconds=1`. Wait 2 seconds without updating oracle.
**Call:** `mint_to_user(user_wallet, amount=100_000_000)`
**Expect error:** `StaleOracle` (6013)

### 3.9 — Rejects amount above per-tx cap
**Call:** `mint_to_user(user_wallet, amount=per_tx_mint_cap + 1)`
**Expect error:** `MintCapExceeded` (6015)

### 3.10 — Rejects when daily cap exceeded across multiple mints
**Setup:** Mint up to `daily_mint_cap - 1` across multiple calls
**Call:** Final `mint_to_user(...)` that would push `daily_minted` over `daily_mint_cap`
**Expect error:** `MintCapExceeded` (6015)

### 3.11 — Daily cap resets after 24h window
**Note:** Hard to test directly on localnet (requires clock manipulation). Document as a manual test or use a short `daily_cap` window for a reduced-time test.

### 3.12 — Rejects zero amount
**Call:** `mint_to_user(user_wallet, amount=0)`
**Expect error:** `ZeroAmount` (6000)

### 3.13 — Rejects amount too small (results in 0 after fee)
**Call:** `mint_to_user(user_wallet, amount=1)` (fee = 0 at low amounts, but net = 1 is fine; test with fee_bps=10000 to force net=0)
**Expect error:** `MintAmountTooSmall` (6006)

---

## 4. Redeem (initiate_redeem)

**Pre-condition:** User has solUSD balance from a prior mint.

### 4.1 — Initiates redeem successfully
**Call:** `initiate_redeem(solusd_amount=50_000_000, redemption_id=0)` by user
**Assert:**
- User solUSD balance decreased by `50_000_000`
- Redeem escrow balance increased by `50_000_000`
- `config.total_solusd_minted` unchanged (tokens still outstanding in escrow)
- `config.redemption_counter == 1` (incremented)
- RedemptionRecord PDA exists at `["redemption", user, 0]`
- `record.status == Pending`
- `record.amount == 50_000_000`
- `record.user == user.publicKey`
- `RedeemInitiated` event emitted with correct user, amount, redemption_id, timestamp

### 4.2 — Rejects when protocol is paused
**Setup:** Pause protocol
**Call:** `initiate_redeem(...)`
**Expect error:** `ProtocolPaused` (6008)
**Cleanup:** Unpause

### 4.3 — Rejects frozen account
**Setup:** Freeze user wallet
**Call:** `initiate_redeem(...)` by that user
**Expect error:** `AccountFrozen` (6009)

### 4.4 — Rejects blacklisted account
**Setup:** Blacklist user wallet
**Call:** `initiate_redeem(...)` by that user
**Expect error:** `AccountBlacklisted` (6010)

### 4.5 — Rejects zero amount
**Call:** `initiate_redeem(solusd_amount=0, ...)`
**Expect error:** `ZeroAmount` (6000)

### 4.6 — Rejects amount too small after fee
**Expect error:** `RedeemAmountTooSmall` (6007)

---

## 5. Redeem Lifecycle

**Pre-condition:** A redemption with `redemption_id=0` is in Pending status from test 4.1.

### 5.1 — complete_redeem burns escrow and decrements supply
**Call:** `complete_redeem(redemption_id=0)` by `minting_authority`
**Assert:**
- Redeem escrow balance decreased by `50_000_000`
- `config.total_solusd_minted` decreased by `50_000_000`
- RedemptionRecord `status == Completed`
- `RedeemCompleted` event emitted

### 5.2 — cancel_redeem returns solUSD to user
**Setup:** Create a new redemption (redemption_id=1)
**Call:** `cancel_redeem(redemption_id=1)` by `minting_authority`
**Assert:**
- Redeem escrow balance decreased
- User solUSD balance restored
- `config.total_solusd_minted` unchanged (tokens back with user)
- RedemptionRecord `status == Failed`
- `RedeemCancelled` event emitted

### 5.3 — complete_redeem rejects non-minting-authority caller
**Call:** `complete_redeem(redemption_id=...)` by random keypair
**Expect error:** `UnauthorizedMinter` (6014)

### 5.4 — complete_redeem rejects already-completed record
**Call:** `complete_redeem(redemption_id=0)` again (already Completed from 5.1)
**Expect error:** `RedemptionNotPending` (6018)

### 5.5 — claim_refund rejects before 72h timeout
**Setup:** Create a new redemption (redemption_id=2)
**Call:** `claim_refund(redemption_id=2)` immediately by user
**Expect error:** `RedemptionTimeoutNotReached` (6019)

### 5.6 — claim_refund succeeds after 72h timeout
**Note:** Requires clock manipulation on localnet. Use `solana-test-validator --slots-per-epoch` or warp slot. Document as manual test if clock manipulation is unavailable.
**Assert:** User gets solUSD back, record status = Failed, `RefundClaimed` event emitted

### 5.7 — claim_refund rejects wrong user
**Setup:** Create redemption by user A
**Call:** `claim_refund(...)` by user B
**Expect error:** `UnauthorizedAccess` (6002)

---

## 6. Compliance

### 6.1 — set_paused(true) pauses protocol
**Call:** `set_paused(true)` via Squads vault
**Assert:** `config.is_paused == true`, `ProtocolPaused` event emitted

### 6.2 — set_paused(false) unpauses protocol
**Call:** `set_paused(false)` via Squads vault
**Assert:** `config.is_paused == false`, `ProtocolUnpaused` event emitted

### 6.3 — set_paused rejects non-authority caller
**Call:** `set_paused(true)` signed by random keypair
**Expect error:** `UnauthorizedAccess` (6002)

### 6.4 — emergency_pause pauses immediately
**Call:** `emergency_pause()` signed by `emergency_guardian`
**Assert:** `config.is_paused == true`, `ProtocolPaused` event emitted

### 6.5 — emergency_pause rejects non-guardian caller
**Call:** `emergency_pause()` signed by random keypair
**Expect error:** `UnauthorizedAccess` (6002)

### 6.6 — emergency_pause cannot unpause (only set_paused(false) can)
**Note:** There is no `emergency_unpause`. Verify that after `emergency_pause`, only Squads `set_paused(false)` restores operations. This is enforced by the absence of an unpause path in `emergency_pause`.

### 6.7 — freeze_account creates frozen PDA
**Call:** `freeze_account(user_wallet)` via Squads vault
**Assert:** FrozenAccount PDA exists at `["frozen", user_wallet]`, `AccountFrozen` event emitted

### 6.8 — unfreeze_account closes frozen PDA
**Call:** `unfreeze_account(user_wallet)` via Squads vault
**Assert:** FrozenAccount PDA no longer exists, `AccountUnfrozen` event emitted

### 6.9 — blacklist_account creates blacklist PDA permanently
**Call:** `blacklist_account(user_wallet)` via Squads vault
**Assert:** BlacklistedAccount PDA exists, `AccountBlacklisted` event emitted

### 6.10 — no unblacklist instruction exists
**Note:** Verified by absence — there is no `unblacklist_account` instruction in the program.

---

## 7. Admin

### 7.1 — update_fee succeeds via Squads
**Call:** `update_fee(new_fee_bps=50)` via Squads vault
**Assert:** `config.fee_bps == 50`, `FeeUpdated` event emitted with old=30, new=50
**Cleanup:** Reset fee back to 30

### 7.2 — update_fee rejects non-authority caller
**Call:** `update_fee(new_fee_bps=50)` signed by random keypair
**Expect error:** `UnauthorizedAccess` (6002)

### 7.3 — update_fee rejects fee above maximum
**Call:** `update_fee(new_fee_bps=1001)` via Squads vault
**Expect error:** `FeeTooHigh` (6003)

### 7.4 — update_mint_caps succeeds via Squads
**Call:** `update_mint_caps(per_tx_cap=2_000_000_000, daily_cap=20_000_000_000)` via Squads vault
**Assert:** `config.per_tx_mint_cap == 2_000_000_000`, `config.daily_mint_cap == 20_000_000_000`, `MintCapsUpdated` event emitted

### 7.5 — withdraw_fees succeeds via Squads
**Pre-condition:** Treasury vault has accumulated solUSD from minting fees
**Call:** `withdraw_fees(amount=30_000)` via Squads vault
**Assert:**
- Treasury vault balance decreased by `30_000`
- Authority's solUSD ATA increased by `30_000`

### 7.6 — withdraw_fees rejects amount exceeding treasury balance
**Call:** `withdraw_fees(amount=treasury_balance + 1)` via Squads vault
**Expect error:** `InsufficientTreasuryBalance` (6005)

### 7.7 — withdraw_fees rejects non-authority caller
**Call:** `withdraw_fees(amount=1000)` signed by random keypair
**Expect error:** `UnauthorizedAccess` (6002)

---

## Test Count Summary

| Section | Tests |
|---|---|
| Initialization | 2 |
| Oracle | 2 |
| Mint | 13 |
| Redeem | 6 |
| Redeem lifecycle | 7 |
| Compliance | 10 |
| Admin | 7 |
| **Total** | **47** |
