use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Collateral ratio must be greater than 100%")]
    InvalidCollateralRatio,
    #[msg("Liquidation threshold must be less than collateral ratio")]
    InvalidLiquidationThreshold,
    #[msg("Liquidation threshold must be greater than 100%")]
    LiquidationThresholdTooLow,
}
