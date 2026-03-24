use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Oracle price is stale or unavailable")]
    StaleOraclePrice,
    #[msg("Oracle returned an invalid price")]
    InvalidOraclePrice,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    #[msg("Fee must not exceed 1000 basis points (10%)")]
    FeeTooHigh,
    #[msg("Reserve does not have enough SOL to cover redemption")]
    InsufficientReserves,
    #[msg("Treasury does not have enough SOL for withdrawal")]
    InsufficientTreasuryBalance,
    #[msg("Deposit too small: results in zero solUSD after fees")]
    MintAmountTooSmall,
    #[msg("Redemption too small: results in zero SOL after fees")]
    RedeemAmountTooSmall,
}
