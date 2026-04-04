# Account Size Reference

All account sizes for v2. Used to set the `space` parameter in `init` constraints and to define `::LEN` constants. Getting these wrong causes initialization failures or wasted rent.

**Rule:** Always add 8 bytes for the Anchor account discriminator. Borsh sizes: `Pubkey`=32, `u64`/`i64`=8, `u32`=4, `u16`=2, `u8`/`bool`=1, enum with no data=1.

---

## Config

PDA seed: `["config"]`

| Field | Type | Bytes |
|---|---|---|
| discriminator | — | 8 |
| authority | Pubkey | 32 |
| mint | Pubkey | 32 |
| minting_authority | Pubkey | 32 |
| co_signer | Pubkey | 32 |
| emergency_guardian | Pubkey | 32 |
| fee_bps | u64 | 8 |
| total_solusd_minted | u64 | 8 |
| per_tx_mint_cap | u64 | 8 |
| daily_mint_cap | u64 | 8 |
| daily_minted | u64 | 8 |
| daily_mint_window_start | i64 | 8 |
| redemption_counter | u64 | 8 |
| is_paused | bool | 1 |
| bump | u8 | 1 |
| mint_authority_bump | u8 | 1 |
| treasury_bump | u8 | 1 |
| oracle_config_bump | u8 | 1 |
| redeem_escrow_bump | u8 | 1 |
| **TOTAL** | | **238** |

```rust
pub const LEN: usize = 8      // discriminator
    + 32 * 5                  // authority, mint, minting_authority, co_signer, emergency_guardian
    + 8 * 7                   // fee_bps, total_solusd_minted, per_tx_mint_cap, daily_mint_cap,
                              //   daily_minted, daily_mint_window_start, redemption_counter
    + 1                       // is_paused
    + 1 * 5;                  // bump, mint_authority_bump, treasury_bump, oracle_config_bump, redeem_escrow_bump
// = 8 + 160 + 56 + 1 + 5 = 230... wait:
// 8 + 160 = 168
// 168 + 56 = 224
// 224 + 1 = 225
// 225 + 5 = 230
// Correct total: 230
```

> **Note:** The arithmetic above: 8 + (5×32) + (7×8) + 1 + (5×1) = 8 + 160 + 56 + 1 + 5 = **230**

```rust
pub const LEN: usize = 8 + 32*5 + 8*7 + 1 + 5; // = 230
```

---

## OracleConfig

PDA seed: `["oracle-config"]`

| Field | Type | Bytes |
|---|---|---|
| discriminator | — | 8 |
| oracle_authority | Pubkey | 32 |
| total_usd_reserves | u64 | 8 |
| last_updated | i64 | 8 |
| max_staleness_seconds | i64 | 8 |
| bump | u8 | 1 |
| **TOTAL** | | **65** |

```rust
pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1; // = 65
```

---

## RedemptionRecord

PDA seed: `["redemption", user_pubkey (32 bytes), redemption_id.to_le_bytes() (8 bytes)]`

| Field | Type | Bytes |
|---|---|---|
| discriminator | — | 8 |
| user | Pubkey | 32 |
| amount | u64 | 8 |
| timestamp | i64 | 8 |
| status | enum (Pending/Completed/Failed) | 1 |
| redemption_id | u64 | 8 |
| bump | u8 | 1 |
| **TOTAL** | | **66** |

```rust
pub const LEN: usize = 8 + 32 + 8 + 8 + 1 + 8 + 1; // = 66
```

> **Note on enum size:** `RedemptionStatus` has 3 variants with no associated data. Borsh serializes this as a single `u8` (1 byte).

---

## FrozenAccount

PDA seed: `["frozen", user_pubkey (32 bytes)]`

| Field | Type | Bytes |
|---|---|---|
| discriminator | — | 8 |
| bump | u8 | 1 |
| **TOTAL** | | **9** |

```rust
pub const LEN: usize = 8 + 1; // = 9
```

---

## BlacklistedAccount

PDA seed: `["blacklisted", user_pubkey (32 bytes)]`

| Field | Type | Bytes |
|---|---|---|
| discriminator | — | 8 |
| bump | u8 | 1 |
| **TOTAL** | | **9** |

```rust
pub const LEN: usize = 8 + 1; // = 9
```

---

## SPL Token Accounts (for reference)

These use fixed Anchor sizes — do not define a `LEN` constant for them.

| Account | Space |
|---|---|
| `Mint` | `82` (use `anchor_spl::token::Mint::LEN`) |
| `TokenAccount` | `165` (use `anchor_spl::token::TokenAccount::LEN`) |

The `redeem-escrow` and `treasury-vault` token accounts use these sizes automatically when initialized with `token::mint` and `token::authority` constraints.

---

## Rent Estimates (approximate, devnet 2024)

| Account | Size | Rent-exempt balance |
|---|---|---|
| Config | 230 bytes | ~0.0017 SOL |
| OracleConfig | 65 bytes | ~0.0010 SOL |
| RedemptionRecord | 66 bytes | ~0.0010 SOL |
| FrozenAccount | 9 bytes | ~0.0009 SOL |
| BlacklistedAccount | 9 bytes | ~0.0009 SOL |
| TokenAccount (escrow/treasury) | 165 bytes | ~0.0020 SOL |

Use `solana rent <bytes>` to get the exact current value.
