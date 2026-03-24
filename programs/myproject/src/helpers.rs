use anchor_lang::prelude::*;
use pyth_sdk_solana::state::SolanaPriceAccount;

use crate::errors::StablecoinError;

/// Maximum acceptable price age in seconds (60s)
pub const MAX_PRICE_AGE_SECS: u64 = 60;

/// Get SOL price in USD with 6 decimal places from Pyth oracle.
/// Falls back to fallback_price if price_feed_info is None.
pub fn get_sol_price_usd<'info>(
    price_feed_info: &Option<AccountInfo<'info>>,
    fallback_price: u64,
    clock: &Clock,
) -> Result<u64> {
    if let Some(price_account_info) = price_feed_info {
        let price_feed = SolanaPriceAccount::account_info_to_feed(price_account_info)
            .map_err(|_| error!(StablecoinError::InvalidOraclePrice))?;

        let current_price = price_feed
            .get_price_no_older_than(clock.unix_timestamp, MAX_PRICE_AGE_SECS)
            .ok_or(StablecoinError::StaleOraclePrice)?;

        require!(current_price.price > 0, StablecoinError::InvalidOraclePrice);

        let price_u64 = current_price.price as u64;
        let exponent = current_price.expo; // typically -8 for USD pairs

        // Normalize to 6 decimal places
        let target_decimals: i32 = -6;
        let adjustment = exponent - target_decimals; // e.g., -8 - (-6) = -2

        let normalized_price = if adjustment < 0 {
            let divisor = 10u64.pow((-adjustment) as u32);
            price_u64.checked_div(divisor)
                .ok_or(StablecoinError::MathOverflow)?
        } else if adjustment > 0 {
            let multiplier = 10u64.pow(adjustment as u32);
            price_u64.checked_mul(multiplier)
                .ok_or(StablecoinError::MathOverflow)?
        } else {
            price_u64
        };

        Ok(normalized_price)
    } else {
        require!(fallback_price > 0, StablecoinError::InvalidOraclePrice);
        Ok(fallback_price)
    }
}

/// Calculate fee in lamports for a given SOL amount.
pub fn calculate_fee_lamports(sol_amount: u64, fee_bps: u64) -> Result<u64> {
    let fee = (sol_amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(StablecoinError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(StablecoinError::MathOverflow)?;
    Ok(fee as u64)
}

/// Convert SOL lamports to solUSD (6 decimals) at a given price.
pub fn sol_to_solusd(lamports: u64, sol_price_usd: u64) -> Result<u64> {
    let solusd = (lamports as u128)
        .checked_mul(sol_price_usd as u128)
        .ok_or(StablecoinError::MathOverflow)?
        .checked_div(1_000_000_000)
        .ok_or(StablecoinError::MathOverflow)?;
    Ok(solusd as u64)
}

/// Convert solUSD (6 decimals) to SOL lamports at a given price.
pub fn solusd_to_sol(solusd: u64, sol_price_usd: u64) -> Result<u64> {
    let lamports = (solusd as u128)
        .checked_mul(1_000_000_000)
        .ok_or(StablecoinError::MathOverflow)?
        .checked_div(sol_price_usd as u128)
        .ok_or(StablecoinError::MathOverflow)?;
    Ok(lamports as u64)
}
