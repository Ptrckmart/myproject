# solUSD - USDC-Backed Stablecoin on Solana

A decentralized stablecoin protocol built on Solana using the Anchor framework. Users deposit USDC to mint solUSD at a 1:1 rate (minus a small fee), and burn solUSD to redeem USDC.

## Overview

solUSD is a USDC-backed stablecoin where anyone can mint tokens by depositing USDC and redeem tokens to receive USDC back. The protocol charges a small fee on both operations to cover operational costs. All deposited USDC is held in a PDA-owned reserve token account, and fees accumulate in a separate PDA-owned treasury token account.

**Program ID:** `7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J`

## Protocol Parameters

| Parameter | Default | Description |
|---|---|---|
| Fee | 0.30% (30 bps) | Applied to both mint and redeem operations |
| Max Fee | 10% (1,000 bps) | Upper limit for fee adjustments |
| Token Decimals | 6 | Matches USDC convention |

## Architecture

### Account Structures

**Config** (PDA seeded with `"config"`)
- Stores protocol settings: authority, solUSD mint, accepted USDC mint, fee rate
- Tracks total USDC reserves and total outstanding solUSD
- Created once during initialization

**Reserve Vault** (PDA token account seeded with `"reserve-vault"`)
- SPL token account holding all USDC deposits backing outstanding solUSD
- Owned by the Reserve PDA (`"reserve"`)

**Treasury Vault** (PDA token account seeded with `"treasury-vault"`)
- SPL token account accumulating USDC fee revenue
- Owned by the Treasury PDA (`"treasury"`)

**Mint Authority** (PDA seeded with `"mint-authority"`)
- Program-controlled authority for the solUSD SPL token mint

### Instructions

#### `initialize`
Sets up the protocol: creates Config PDA, initializes solUSD token mint (6 decimals), creates PDA-owned USDC token accounts for reserve and treasury, and stores the initial fee rate.

#### `mint`
Anyone can deposit USDC to receive solUSD at a 1:1 rate minus fees:
```
fee = usdc_amount * fee_bps / 10,000
net_usdc = usdc_amount - fee
solusd_minted = net_usdc
```
Net USDC goes to the reserve vault, fee goes to the treasury vault.

#### `redeem`
Anyone can burn solUSD to receive USDC back at a 1:1 rate minus fees:
```
gross_usdc = solusd_amount (1:1)
fee = gross_usdc * fee_bps / 10,000
net_usdc_to_user = gross_usdc - fee
```

#### `update_fee`
Admin-only: updates the fee rate (max 10%).

#### `withdraw_fees`
Admin-only: withdraws accumulated USDC fees from the treasury vault.

## Project Structure

```
myproject/
├── programs/myproject/src/
│   ├── lib.rs                 # Program entry point and instruction routing
│   ├── errors.rs              # Custom error codes
│   ├── helpers.rs             # Fee calculation utility
│   ├── state/
│   │   └── config.rs          # Config account definition
│   └── instructions/
│       ├── initialize.rs      # Protocol initialization
│       ├── mint.rs            # Deposit USDC → mint solUSD
│       ├── redeem.rs          # Burn solUSD → withdraw USDC
│       ├── admin.rs           # Admin fee updates
│       └── withdraw_fees.rs   # Admin fee withdrawal
├── tests/
│   └── myproject.ts           # TypeScript integration tests
├── Anchor.toml                # Anchor configuration
└── Cargo.toml                 # Rust workspace configuration
```

## Prerequisites

- [Rust](https://rustup.rs/) (toolchain specified in `rust-toolchain`)
- [Solana CLI](https://docs.solanalabs.com/cli/install) v1.18.x
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) v0.30.0
- [Node.js](https://nodejs.org/) and [Yarn](https://yarnpkg.com/)

## Setup

```bash
# Install dependencies
yarn install

# Build the program
anchor build --no-idl

# Run the local validator and tests
anchor test
```

> **Note:** The `--no-idl` flag is required due to an `anchor-syn 0.30.1` compatibility issue with IDL generation.

## Testing

The test suite covers:

- Protocol initialization with USDC mint and fee parameters
- Minting solUSD by depositing USDC (with fee verification)
- Multi-user minting and accounting consistency
- Redeeming solUSD for USDC (with fee verification)
- Zero amount rejection
- Admin fee updates and max fee enforcement
- Admin fee withdrawal from treasury
- Unauthorized access rejection

## Dependencies

### Rust (On-chain Program)

| Crate | Version | Purpose |
|---|---|---|
| `anchor-lang` | 0.30.0 | Solana framework |
| `anchor-spl` | 0.30.0 | SPL Token program integration |

### TypeScript (Tests/Client)

| Package | Version | Purpose |
|---|---|---|
| `@coral-xyz/anchor` | ^0.30.0 | Anchor client library |
| `@solana/spl-token` | ^0.4.14 | SPL Token client utilities |
| `chai` | ^4.3.4 | Test assertions |
| `mocha` / `ts-mocha` | ^9.0.3 / ^10.0.0 | Test runner |

## Error Codes

| Error | Description |
|---|---|
| `ZeroAmount` | Amount must be greater than zero |
| `MathOverflow` | Arithmetic overflow detected |
| `UnauthorizedAccess` | Caller is not the protocol authority |
| `FeeTooHigh` | Fee must not exceed 1,000 basis points (10%) |
| `InsufficientReserves` | Reserve does not have enough USDC for redemption |
| `InsufficientTreasuryBalance` | Treasury does not have enough USDC for withdrawal |
| `MintAmountTooSmall` | Deposit too small, results in zero solUSD after fees |
| `RedeemAmountTooSmall` | Redemption too small, results in zero USDC after fees |

## License

ISC
