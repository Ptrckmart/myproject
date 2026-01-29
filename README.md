# solUSD - Crypto-Collateralized Stablecoin on Solana

A decentralized stablecoin protocol built on Solana using the Anchor framework. Users deposit SOL as collateral to mint solUSD, a USD-pegged stablecoin with 6 decimal places.

## Overview

solUSD is a crypto-collateralized stablecoin that maintains its peg through overcollateralization. Users lock SOL in personal vaults and mint solUSD against their collateral. The protocol enforces a minimum collateral ratio and includes a liquidation mechanism to keep the system solvent.

**Program ID:** `7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J`

## Protocol Parameters

| Parameter | Default | Description |
|---|---|---|
| Collateral Ratio | 150% (15,000 bps) | Minimum ratio of collateral value to minted solUSD |
| Liquidation Threshold | 130% (13,000 bps) | Ratio below which a vault can be liquidated |
| Liquidation Bonus | 5% (500 bps) | Bonus SOL awarded to liquidators |
| Token Decimals | 6 | Matches USDC convention |
| Max Oracle Age | 60 seconds | Pyth price feed staleness limit |

## Architecture

### Account Structures

**Config** (PDA seeded with `"config"`)
- Stores protocol-wide settings: authority, mint address, collateral ratio, liquidation threshold
- Holds Pyth SOL/USD price feed address and a fallback price
- Created once during initialization

**Vault** (PDA seeded with `"vault"` + owner pubkey)
- Per-user account tracking deposited SOL (lamports) and minted solUSD
- Created automatically on first deposit via `init_if_needed`

**Mint Authority** (PDA seeded with `"mint-authority"`)
- Program-controlled authority for the solUSD SPL token mint
- Signs mint/burn operations via CPI with PDA signer seeds

### Instructions

#### `initialize`
Sets up the protocol: creates the Config PDA, initializes the solUSD token mint (6 decimals), and stores the Pyth oracle address and initial parameters.

#### `deposit_collateral_and_mint`
Combined instruction that deposits SOL collateral and mints solUSD in a single transaction. Validates the resulting collateral ratio meets the minimum requirement.

#### `redeem_and_withdraw`
Burns solUSD and withdraws SOL collateral. If any debt remains after redemption, the collateral ratio is re-validated against the oracle price.

#### `liquidate`
Allows any user to liquidate an undercollateralized vault (below 130% ratio). The liquidator burns solUSD to repay the vault's debt and receives the equivalent SOL plus a 5% bonus.

#### `update_price`
Admin-only instruction to update the fallback SOL/USD price. Used when the Pyth oracle is unavailable.

#### `update_params`
Admin-only instruction to update the collateral ratio and/or liquidation threshold. Validates that the liquidation threshold remains below the collateral ratio and both stay above 100%.

### Oracle Integration

The protocol uses [Pyth Network](https://pyth.network/) for SOL/USD price feeds via `pyth-sdk-solana`. Prices are normalized to 6 decimal places. If the Pyth feed is unavailable or stale (>60 seconds), the protocol falls back to a manually-set price stored in the Config account.

### Collateral Ratio Calculation

```
collateral_value_usd = (sol_deposited_lamports * sol_price_usd) / 1e9
ratio_bps = (collateral_value_usd * 10000) / solusd_minted
```

All arithmetic uses checked math (`checked_add`, `checked_mul`, `checked_div`, `checked_sub`) to prevent overflows.

## Project Structure

```
myproject/
├── programs/myproject/src/
│   ├── lib.rs                 # Program entry point and instruction routing
│   ├── errors.rs              # Custom error codes
│   ├── helpers.rs             # Oracle price reading and ratio calculation
│   ├── state/
│   │   ├── config.rs          # Config account definition
│   │   └── vault.rs           # Vault account definition
│   └── instructions/
│       ├── initialize.rs      # Protocol initialization
│       ├── deposit.rs         # Deposit SOL + mint solUSD
│       ├── redeem.rs          # Burn solUSD + withdraw SOL
│       ├── liquidate.rs       # Liquidation mechanism
│       └── admin.rs           # Admin parameter updates
├── tests/
│   └── myproject.ts           # TypeScript integration tests
├── Anchor.toml                # Anchor configuration
└── Cargo.toml                 # Rust workspace configuration
```

## Prerequisites

- [Rust](https://rustup.rs/) (toolchain 1.88.0 specified in `rust-toolchain`)
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

- Protocol initialization with parameter validation
- Depositing collateral and minting solUSD
- Collateral ratio enforcement (rejects undercollateralized mints)
- Redeeming solUSD and withdrawing collateral
- Admin price updates
- Admin parameter updates
- Unauthorized access rejection

Run tests:

```bash
anchor test
```

## Dependencies

### Rust (On-chain Program)

| Crate | Version | Purpose |
|---|---|---|
| `anchor-lang` | 0.30.0 | Solana framework with `init-if-needed` feature |
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
| `InvalidCollateralRatio` | Collateral ratio must be greater than 100% |
| `InvalidLiquidationThreshold` | Liquidation threshold must be less than collateral ratio |
| `LiquidationThresholdTooLow` | Liquidation threshold must be greater than 100% |
| `ZeroAmount` | Amount must be greater than zero |
| `InsufficientCollateral` | Insufficient collateral to maintain required ratio |
| `MathOverflow` | Arithmetic overflow detected |
| `UnauthorizedVaultAccess` | Caller does not own the vault |
| `InsufficientMintedBalance` | Not enough minted solUSD to burn |
| `StaleOraclePrice` | Pyth price feed is older than 60 seconds |
| `InvalidOraclePrice` | Pyth returned a non-positive price |
| `VaultNotLiquidatable` | Vault collateral ratio is above liquidation threshold |
| `UnauthorizedAccess` | Caller is not the protocol authority |

## License

ISC
