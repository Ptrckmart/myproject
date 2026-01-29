use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Collateral ratio must be greater than 100%")]
    InvalidCollateralRatio,
    #[msg("Liquidation threshold must be less than collateral ratio")]
    InvalidLiquidationThreshold,
    #[msg("Liquidation threshold must be greater than 100%")]
    LiquidationThresholdTooLow,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient collateral to maintain required ratio")]
    InsufficientCollateral,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Unauthorized vault access")]
    UnauthorizedVaultAccess,
    #[msg("Insufficient minted balance to burn")]
    InsufficientMintedBalance,
    #[msg("Oracle price is stale or unavailable")]
    StaleOraclePrice,
    #[msg("Oracle returned an invalid price")]
    InvalidOraclePrice,
}
