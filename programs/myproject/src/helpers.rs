use anchor_lang::prelude::*;

use crate::errors::StablecoinError;

/// Calculate fee for a given token amount in basis points.
pub fn calculate_fee(amount: u64, fee_bps: u64) -> Result<u64> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(StablecoinError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(StablecoinError::MathOverflow)?;
    Ok(fee as u64)
}
