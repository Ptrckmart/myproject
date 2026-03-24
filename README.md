# solUSD - Fiat-Backed Stablecoin on Solana

A decentralized stablecoin protocol built on Solana using the Anchor framework. Users deposit SOL to mint solUSD at the current SOL/USD exchange rate, paying a small fee. solUSD is a USD-pegged stablecoin with 6 decimal places.

## Overview

solUSD is a fiat-backed stablecoin where anyone can mint tokens by depositing SOL and redeem tokens to receive SOL back. The protocol charges a small fee on both operations to cover gas and fund operational improvements. All deposited SOL is held in a central reserve PDA, and fees accumulate in a separate treasury PDA.

**Program ID:** `7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J`

## Protocol Parameters

| Parameter | Default | Description |
|---|---|---|
| Fee | 0.30% (30 bps) | Applied to both mint and redeem operations |
| Max Fee | 10% (1,000 bps) | Upper limit for fee adjustments |
| Token Decimals | 6 | Matches USDC convention |
| Max Oracle Age | 60 seconds | Pyth price feed staleness limit |

## Architecture

### Account Structures

**Config** (PDA seeded with `"config"`)
- Stores protocol settings: authority, mint address, fee rate, oracle feed
- Tracks total SOL reserves and total outstanding solUSD
- Created once during initialization

**Reserve** (PDA seeded with `"reserve"`)
- Holds all SOL deposits backing outstanding solUSD
- A bare PDA with no data, just holds lamports

**Treasury** (PDA seeded with `"treasury"`)
- Accumulates fee revenue from mint and redeem operations
- Authority can withdraw fees for operational use

**Mint Authority** (PDA seeded with `"mint-authority"`)
- Program-controlled authority for the solUSD SPL token mint

### Instructions

#### `initialize`
Sets up the protocol: creates Config PDA, initializes solUSD token mint (6 decimals), derives reserve and treasury PDAs, and stores initial fee rate and oracle address.

#### `mint`
Anyone can deposit SOL to receive solUSD. The fee is deducted from the deposited SOL before conversion:
```
fee_lamports = sol_amount * fee_bps / 10_000
net_sol = sol_amount - fee_lamports
solusd_minted = net_sol * sol_price_usd / 1e9
```
Net SOL goes to the reserve, fee goes to the treasury.

#### `redeem`
Anyone can burn solUSD to receive SOL back. The fee is deducted from the SOL being returned:
```
gross_sol = solusd_amount * 1e9 / sol_price_usd
fee_lamports = gross_sol * fee_bps / 10_000
net_sol_to_user = gross_sol - fee_lamports
```

#### `update_price`
Admin-only: updates the fallback SOL/USD price used when Pyth oracle is unavailable.

#### `update_fee`
Admin-only: updates the fee rate (max 10%).

#### `withdraw_fees`
Admin-only: withdraws accumulated SOL fees from the treasury.

### Oracle Integration

The protocol uses [Pyth Network](https://pyth.network/) for SOL/USD price feeds via `pyth-sdk-solana`. Prices are normalized to 6 decimal places. If the Pyth feed is unavailable or stale (>60 seconds), the protocol falls back to a manually-set price stored in Config.

## Project Structure

```
myproject/
├── programs/myproject/src/
│   ├── lib.rs                 # Program entry point and instruction routing
│   ├── errors.rs              # Custom error codes
│   ├── helpers.rs             # Oracle price, fee calculation, SOL/USD conversion
│   ├── state/
│   │   └── config.rs          # Config account definition
│   └── instructions/
│       ├── initialize.rs      # Protocol initialization
│       ├── mint.rs             # Deposit SOL → mint solUSD
│       ├── redeem.rs           # Burn solUSD → withdraw SOL
│       ├── admin.rs            # Admin price/fee updates
│       └── withdraw_fees.rs    # Admin fee withdrawal
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

- Protocol initialization with fee and price parameters
- Minting solUSD by depositing SOL (with fee verification)
- Multi-user minting and accounting consistency
- Redeeming solUSD for SOL (with fee verification)
- Zero amount rejection
- Admin fee updates and max fee enforcement
- Admin price updates
- Admin fee withdrawal from treasury
- Unauthorized access rejection

## Dependencies

### Rust (On-chain Program)

| Crate | Version | Purpose |
|---|---|---|
| `anchor-lang` | 0.30.0 | Solana framework |
| `anchor-spl` | 0.30.0 | SPL Token program integration |
| `pyth-sdk-solana` | 0.10.3 | Pyth oracle price feed integration |

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
| `StaleOraclePrice` | Pyth price feed is older than 60 seconds |
| `InvalidOraclePrice` | Pyth returned a non-positive price |
| `UnauthorizedAccess` | Caller is not the protocol authority |
| `FeeTooHigh` | Fee must not exceed 1,000 basis points (10%) |
| `InsufficientReserves` | Reserve does not have enough SOL for redemption |
| `InsufficientTreasuryBalance` | Treasury does not have enough SOL for withdrawal |
| `MintAmountTooSmall` | Deposit too small, results in zero solUSD after fees |
| `RedeemAmountTooSmall` | Redemption too small, results in zero SOL after fees |

## License

ISC
