use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,                         // 6000
    #[msg("Math overflow")]
    MathOverflow,                       // 6001
    #[msg("Unauthorized access")]
    UnauthorizedAccess,                 // 6002
    #[msg("Fee must not exceed 1000 basis points (10%)")]
    FeeTooHigh,                         // 6003
    #[msg("Reserve does not have enough USDC to cover redemption")]
    InsufficientReserves,               // 6004
    #[msg("Treasury does not have enough for withdrawal")]
    InsufficientTreasuryBalance,        // 6005
    #[msg("Deposit too small: results in zero solUSD after fees")]
    MintAmountTooSmall,                 // 6006
    #[msg("Redemption too small: results in zero USDC after fees")]
    RedeemAmountTooSmall,               // 6007
    #[msg("Protocol is paused")]
    ProtocolPaused,                     // 6008
    #[msg("This account is frozen")]
    AccountFrozen,                      // 6009
    #[msg("This account is blacklisted")]
    AccountBlacklisted,                 // 6010
    #[msg("Minting halted: post-mint supply would exceed reserves")]
    ReservesInsufficient,               // 6011
    #[msg("Caller is not the authorized oracle")]
    InvalidOracleAuthority,             // 6012
    #[msg("Minting halted: oracle data exceeds max staleness threshold")]
    StaleOracle,                        // 6013
    #[msg("Caller is not the authorized minting service")]
    UnauthorizedMinter,                 // 6014
    #[msg("Mint amount exceeds per-transaction or daily cap")]
    MintCapExceeded,                    // 6015
    #[msg("Co-signer verification failed")]
    InvalidCoSigner,                    // 6016
    #[msg("Redemption record does not exist")]
    RedemptionNotFound,                 // 6017
    #[msg("Redemption is not in pending status")]
    RedemptionNotPending,               // 6018
    #[msg("72h timeout has not elapsed; cannot claim refund yet")]
    RedemptionTimeoutNotReached,        // 6019
}
