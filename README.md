# solUSD — Fiat-Backed Stablecoin on Solana

solUSD is a regulated, fiat-backed stablecoin protocol built on Solana using the Anchor framework. Users receive solUSD after a fiat wire is confirmed off-chain by an authorized minting service; redemptions are settled via bank wire after solUSD is locked in escrow on-chain.

**Program ID:** `3mcYviYiePvUudVFgYKwzipqNhUTDxTtgth2v9ApThMU`

---

## How It Works

### Minting
1. User sends a fiat wire to the reserve bank account
2. Banking partner confirms receipt and notifies the off-chain API
3. API calls `mint_to_user` on-chain with dual signatures (minting authority + co-signer)
4. Program verifies oracle reserves, mint caps, and compliance status
5. Net solUSD (amount minus fee) is minted directly to the user's wallet

### Redemption
1. User calls `initiate_redeem` — solUSD moves into an on-chain escrow PDA
2. Off-chain API detects the event and initiates a fiat wire to the user's bank
3. On wire success: API calls `complete_redeem` → escrow solUSD is burned
4. On wire failure: API calls `cancel_redeem` → solUSD returned to user
5. If unresolved after 72h: user calls `claim_refund` → solUSD returned automatically

---

## Protocol Parameters

| Parameter | Value | Description |
|---|---|---|
| Fee | 0.30% (30 bps) | Applied to mint operations |
| Max Fee | 10% (1,000 bps) | Upper limit for fee adjustments |
| Token Decimals | 6 | Matches USDC convention |
| Oracle staleness | Configurable | Minting halts if reserve data is too old |

---

## Architecture

### Accounts

| Account | PDA Seed | Description |
|---|---|---|
| Config | `"config"` | Protocol state: authority, keys, fee, caps, pause flag |
| OracleConfig | `"oracle-config"` | Reserve balance, staleness config, oracle authority |
| Mint Authority | `"mint-authority"` | PDA that signs solUSD mint operations |
| Treasury | `"treasury"` | Owns the treasury token account |
| Treasury Vault | `"treasury-vault"` | SPL token account holding fee revenue |
| Redeem Escrow | `"redeem-escrow"` | SPL token account holding solUSD pending redemption |
| FrozenAccount | `["frozen", user]` | Existence indicates a frozen wallet |
| BlacklistedAccount | `["blacklisted", user]` | Existence indicates a permanently blacklisted wallet |
| RedemptionRecord | `["redemption", user, id]` | Status of an individual redemption |

### Instructions

| Instruction | Access | Description |
|---|---|---|
| `initialize` | Deployer | Creates all protocol accounts and PDAs |
| `mint_to_user` | Minting Authority + Co-signer | Mint solUSD after fiat confirmation |
| `initiate_redeem` | User | Lock solUSD in escrow, begin redemption |
| `complete_redeem` | Minting Authority | Burn escrowed solUSD after wire confirmed |
| `cancel_redeem` | Minting Authority | Return escrowed solUSD after wire failure |
| `claim_refund` | Redemption owner | Reclaim solUSD after 72h timeout |
| `update_reserves` | Oracle Authority | Post latest reserve balance on-chain |
| `update_fee` | Authority | Update fee rate (max 10%) |
| `update_mint_caps` | Authority | Update per-tx and daily mint caps |
| `withdraw_fees` | Authority | Withdraw accumulated fee revenue |
| `set_paused` | Authority | Pause or unpause the protocol |
| `emergency_pause` | Emergency Guardian | One-way immediate pause |
| `freeze_account` | Authority | Freeze a user wallet |
| `unfreeze_account` | Authority | Unfreeze a user wallet |
| `blacklist_account` | Authority | Permanently blacklist a wallet |

---

## Project Structure

```
programs/myproject/src/
├── lib.rs                        # Instruction routing
├── errors.rs                     # Custom error codes
├── helpers.rs                    # Fee calculation utility
├── events.rs                     # Anchor event definitions
├── state/
│   ├── config.rs
│   ├── oracle_config.rs
│   ├── redemption_record.rs
│   ├── frozen_account.rs
│   └── blacklisted_account.rs
└── instructions/
    ├── initialize.rs
    ├── mint_to_user.rs
    ├── update_reserves.rs
    ├── admin.rs
    ├── compliance.rs
    └── redeem_lifecycle.rs
tests/
└── myproject.ts                  # 47-case integration test suite
```

---

## Prerequisites

- [Rust](https://rustup.rs/) with the `solana` toolchain
- [Solana CLI](https://docs.solanalabs.com/cli/install) v1.18.x
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) v0.30.0 (cargo-installed)
- [Node.js](https://nodejs.org/) and [Yarn](https://yarnpkg.com/)

## Build & Test

```bash
# Install dependencies
yarn install

# Build (--no-idl required due to anchor-syn 0.30.1 bug)
/Users/patrick/.cargo/bin/anchor build --no-idl

# Run tests
rm -rf .anchor/test-ledger && COPYFILE_DISABLE=1 /Users/patrick/.cargo/bin/anchor test --skip-build
```

> **Note:** The IDL at `target/idl/myproject.json` and TypeScript types at `target/types/myproject.ts` are hand-maintained and not committed to git. Update them manually after any instruction or account change.

---

## Error Codes

| Code | Name | Description |
|---|---|---|
| 6000 | ZeroAmount | Amount must be greater than zero |
| 6001 | MathOverflow | Arithmetic overflow |
| 6002 | UnauthorizedAccess | Caller is not the protocol authority |
| 6003 | FeeTooHigh | Fee exceeds 1,000 bps (10%) |
| 6004 | InsufficientReserves | Reserve insufficient for redemption |
| 6005 | InsufficientTreasuryBalance | Treasury insufficient for withdrawal |
| 6006 | MintAmountTooSmall | Deposit too small — results in 0 solUSD after fees |
| 6007 | RedeemAmountTooSmall | Redemption too small — results in 0 after fees |
| 6008 | ProtocolPaused | Protocol is paused |
| 6009 | AccountFrozen | This account is frozen |
| 6010 | AccountBlacklisted | This account is blacklisted |
| 6011 | ReservesInsufficient | Minting would exceed reported reserves |
| 6012 | InvalidOracleAuthority | Caller is not the authorized oracle |
| 6013 | StaleOracle | Oracle data exceeds max staleness threshold |
| 6014 | UnauthorizedMinter | Caller is not the authorized minting service |
| 6015 | MintCapExceeded | Amount exceeds per-tx or daily mint cap |
| 6016 | InvalidCoSigner | Co-signer verification failed |
| 6017 | RedemptionNotFound | Redemption record does not exist |
| 6018 | RedemptionNotPending | Redemption is not in pending status |
| 6019 | RedemptionTimeoutNotReached | 72h timeout has not elapsed |

---

## License

ISC
