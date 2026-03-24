use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    #[msg("Fee must not exceed 1000 basis points (10%)")]
    FeeTooHigh,
    #[msg("Reserve does not have enough USDC to cover redemption")]
    InsufficientReserves,
    #[msg("Treasury does not have enough USDC for withdrawal")]
    InsufficientTreasuryBalance,
    #[msg("Deposit too small: results in zero solUSD after fees")]
    MintAmountTooSmall,
    #[msg("Redemption too small: results in zero USDC after fees")]
    RedeemAmountTooSmall,
}
