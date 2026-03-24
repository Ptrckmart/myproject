# CLAUDE.md - Project Instructions for Claude Code

## Project Overview

solUSD is a USDC-backed stablecoin on Solana built with Anchor 0.30.0. Users deposit USDC to mint solUSD at a 1:1 rate (minus a small fee), and burn solUSD to redeem USDC. There is no oracle or price conversion — it's a simple 1:1 USD-backed model.

**Program ID:** `7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J`

## Build & Test Commands

```bash
# Build (must use --no-idl flag due to anchor-syn 0.30.1 bug)
/Users/patrick/.cargo/bin/anchor build --no-idl

# Run tests (skip build since anchor test tries IDL generation which fails)
rm -rf .anchor/test-ledger && COPYFILE_DISABLE=1 /Users/patrick/.cargo/bin/anchor test --skip-build

# If Cargo.lock needs regenerating (use solana toolchain, not default)
cargo +solana generate-lockfile
```

## Important Gotchas

- **Always use `--no-idl`** when building. The `anchor-syn 0.30.1` crate has a `source_file()` bug that breaks IDL auto-generation. The IDL and TypeScript types at `target/idl/myproject.json` and `target/types/myproject.ts` are hand-written and must be updated manually when instructions/accounts change.
- **Use the cargo-installed anchor** at `/Users/patrick/.cargo/bin/anchor` (v0.30.0). The avm-managed anchor at `~/.avm/bin/anchor` has no version set and will error.
- **Solana BPF tools use Cargo 1.75** which cannot handle crates using `edition2024`. If `Cargo.lock` is regenerated and build fails with rustc version errors, downgrade offending crates: `cargo +solana update <crate>@<new-version> --precise <older-version>`.
- **macOS test ledger issue**: Always use `COPYFILE_DISABLE=1` and `rm -rf .anchor/test-ledger` before running tests to avoid `._genesis.bin` resource fork corruption.
- **IDL discriminators** are `sha256("global:<instruction_name>")` first 8 bytes. Account discriminator for Config is `sha256("account:Config")` first 8 bytes.

## Architecture

### Instructions (5 total)

| Instruction | Access | Description |
|---|---|---|
| `initialize(fee_bps)` | Admin | Creates config, solUSD mint, USDC reserve/treasury vaults |
| `mint(usdc_amount)` | Anyone | Deposit USDC → receive solUSD (1:1 minus fee) |
| `redeem(solusd_amount)` | Anyone | Burn solUSD → receive USDC (1:1 minus fee) |
| `update_fee(new_fee_bps)` | Admin | Update fee rate (max 1000 bps / 10%) |
| `withdraw_fees(amount)` | Admin | Withdraw USDC fees from treasury vault |

### Key PDAs

| PDA Seed | Purpose |
|---|---|
| `"config"` | Protocol state (authority, mints, fee, accounting) |
| `"mint-authority"` | Signs solUSD mint_to operations |
| `"reserve"` | Owns the reserve USDC token account |
| `"reserve-vault"` | SPL token account holding USDC reserves |
| `"treasury"` | Owns the treasury USDC token account |
| `"treasury-vault"` | SPL token account holding USDC fees |

### Config State Fields

`authority`, `mint` (solUSD), `usdc_mint`, `fee_bps`, `total_usdc_reserves`, `total_solusd_minted`, `bump`, `mint_authority_bump`, `reserve_bump`, `treasury_bump`

### Error Codes

6000=ZeroAmount, 6001=MathOverflow, 6002=UnauthorizedAccess, 6003=FeeTooHigh, 6004=InsufficientReserves, 6005=InsufficientTreasuryBalance, 6006=MintAmountTooSmall, 6007=RedeemAmountTooSmall

## File Structure

- `programs/myproject/src/lib.rs` — Instruction routing
- `programs/myproject/src/state/config.rs` — Config account struct
- `programs/myproject/src/instructions/` — One file per instruction
- `programs/myproject/src/errors.rs` — Error enum
- `programs/myproject/src/helpers.rs` — `calculate_fee()` utility
- `target/idl/myproject.json` — Hand-written IDL (update manually)
- `target/types/myproject.ts` — Hand-written TS types (update manually)
- `tests/myproject.ts` — Integration tests (uses fake USDC mint on localnet)

## Code Conventions

- Anchor 0.30.0 with `anchor-lang` and `anchor-spl` crates (no other on-chain deps)
- All token transfers use `anchor_spl::token::transfer` with CPI
- PDA-signed transfers use `CpiContext::new_with_signer` with seed arrays
- Fee math: `fee = amount * fee_bps / 10_000` using u128 intermediate to avoid overflow
- Both USDC and solUSD use 6 decimal places
