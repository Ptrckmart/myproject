# PDA Reference

All PDAs for the v2 solUSD program. Each entry shows the seeds, where the bump is stored, Rust derivation, and TypeScript derivation.

**Program ID:** Generated on first v2 build (fresh deploy). Update this file after running `anchor build --no-idl` for the first time.

---

## Config

| | |
|---|---|
| **Seeds** | `["config"]` |
| **Bump stored in** | `config.bump` |
| **Account type** | `Config` |

**Rust (in account constraint):**
```rust
#[account(
    seeds = [b"config"],
    bump = config.bump,
)]
pub config: Account<'info, Config>,
```

**TypeScript:**
```typescript
const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
);
```

---

## Mint Authority

| | |
|---|---|
| **Seeds** | `["mint-authority"]` |
| **Bump stored in** | `config.mint_authority_bump` |
| **Account type** | `UncheckedAccount` (no data, signs mint_to CPIs) |

**Rust:**
```rust
/// CHECK: PDA used as mint authority
#[account(
    seeds = [b"mint-authority"],
    bump = config.mint_authority_bump,
)]
pub mint_authority: UncheckedAccount<'info>,
```

**Rust (signer seeds for CPI):**
```rust
let seeds = &[b"mint-authority".as_ref(), &[config.mint_authority_bump]];
let signer_seeds = &[&seeds[..]];
```

**TypeScript:**
```typescript
const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint-authority")],
    program.programId
);
```

---

## Oracle Config

| | |
|---|---|
| **Seeds** | `["oracle-config"]` |
| **Bump stored in** | `config.oracle_config_bump` and `oracle_config.bump` |
| **Account type** | `OracleConfig` |

**Rust:**
```rust
#[account(
    seeds = [b"oracle-config"],
    bump = config.oracle_config_bump,
)]
pub oracle_config: Account<'info, OracleConfig>,
```

**TypeScript:**
```typescript
const [oracleConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle-config")],
    program.programId
);
```

---

## Treasury

| | |
|---|---|
| **Seeds** | `["treasury"]` |
| **Bump stored in** | `config.treasury_bump` |
| **Account type** | `UncheckedAccount` (owns treasury-vault token account) |

**Rust:**
```rust
/// CHECK: PDA that owns the treasury token account
#[account(
    seeds = [b"treasury"],
    bump = config.treasury_bump,
)]
pub treasury: UncheckedAccount<'info>,
```

**Rust (signer seeds for CPI):**
```rust
let seeds = &[b"treasury".as_ref(), &[config.treasury_bump]];
let signer_seeds = &[&seeds[..]];
```

**TypeScript:**
```typescript
const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
);
```

---

## Treasury Vault

| | |
|---|---|
| **Seeds** | `["treasury-vault"]` |
| **Bump stored in** | Not stored — derived at runtime |
| **Account type** | `TokenAccount` (SPL token account holding solUSD fees) |
| **Token mint** | solUSD mint |
| **Token authority** | Treasury PDA |

**Rust:**
```rust
#[account(
    mut,
    seeds = [b"treasury-vault"],
    bump,
)]
pub treasury_vault: Account<'info, TokenAccount>,
```

**TypeScript:**
```typescript
const [treasuryVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury-vault")],
    program.programId
);
```

---

## Redeem Escrow

| | |
|---|---|
| **Seeds** | `["redeem-escrow"]` |
| **Bump stored in** | `config.redeem_escrow_bump` |
| **Account type** | `TokenAccount` (SPL token account holding escrowed solUSD) |
| **Token mint** | solUSD mint |
| **Token authority** | Redeem Escrow Authority PDA (see below) |

**Rust:**
```rust
#[account(
    mut,
    seeds = [b"redeem-escrow"],
    bump = config.redeem_escrow_bump,
)]
pub redeem_escrow: Account<'info, TokenAccount>,
```

**TypeScript:**
```typescript
const [redeemEscrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("redeem-escrow")],
    program.programId
);
```

> **Note:** The redeem escrow token account needs an owning PDA to sign transfers out of it. Use a `["redeem-escrow-authority"]` PDA as the token authority, similar to how `"reserve"` owned `"reserve-vault"` in v1.

---

## Frozen Account

| | |
|---|---|
| **Seeds** | `["frozen", user_pubkey]` |
| **Bump stored in** | `frozen_account.bump` |
| **Account type** | `FrozenAccount` |
| **Existence check** | If this account exists → wallet is frozen |

**Rust (init on freeze):**
```rust
#[account(
    init,
    payer = authority,
    space = FrozenAccount::LEN,
    seeds = [b"frozen", user.key().as_ref()],
    bump,
)]
pub frozen_account: Account<'info, FrozenAccount>,
```

**Rust (existence check in mint/redeem):**
```rust
// Pass as Option<Account> — if Some, account is frozen
#[account(
    seeds = [b"frozen", user.key().as_ref()],
    bump,
)]
pub frozen_account: Option<Account<'info, FrozenAccount>>,
// Then in handler:
require!(ctx.accounts.frozen_account.is_none(), StablecoinError::AccountFrozen);
```

**TypeScript:**
```typescript
const [frozenPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("frozen"), userPublicKey.toBuffer()],
    program.programId
);
```

---

## Blacklisted Account

| | |
|---|---|
| **Seeds** | `["blacklisted", user_pubkey]` |
| **Bump stored in** | `blacklisted_account.bump` |
| **Account type** | `BlacklistedAccount` |
| **Existence check** | If this account exists → wallet is blacklisted |

**Rust (init on blacklist):**
```rust
#[account(
    init,
    payer = authority,
    space = BlacklistedAccount::LEN,
    seeds = [b"blacklisted", user.key().as_ref()],
    bump,
)]
pub blacklisted_account: Account<'info, BlacklistedAccount>,
```

**Rust (existence check):**
```rust
#[account(
    seeds = [b"blacklisted", user.key().as_ref()],
    bump,
)]
pub blacklisted_account: Option<Account<'info, BlacklistedAccount>>,
// Then in handler:
require!(ctx.accounts.blacklisted_account.is_none(), StablecoinError::AccountBlacklisted);
```

**TypeScript:**
```typescript
const [blacklistedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("blacklisted"), userPublicKey.toBuffer()],
    program.programId
);
```

---

## Redemption Record

| | |
|---|---|
| **Seeds** | `["redemption", user_pubkey, redemption_id.to_le_bytes()]` |
| **Bump stored in** | `redemption_record.bump` |
| **Account type** | `RedemptionRecord` |
| **ID source** | `config.redemption_counter` at time of `initiate_redeem` |

**Rust (init on initiate_redeem):**
```rust
#[account(
    init,
    payer = user,
    space = RedemptionRecord::LEN,
    seeds = [
        b"redemption",
        user.key().as_ref(),
        &config.redemption_counter.to_le_bytes(),
    ],
    bump,
)]
pub redemption_record: Account<'info, RedemptionRecord>,
```

**TypeScript:**
```typescript
// Read current counter first
const config = await program.account.config.fetch(configPda);
const redemptionId = config.redemptionCounter; // BN

const [redemptionRecordPda] = PublicKey.findProgramAddressSync(
    [
        Buffer.from("redemption"),
        userPublicKey.toBuffer(),
        redemptionId.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
);
```

---

## Removed PDAs (v1 only — do not use in v2)

| PDA Seed | Why Removed |
|---|---|
| `"reserve"` | No on-chain USDC reserve in v2 |
| `"reserve-vault"` | No USDC token account in v2 |
