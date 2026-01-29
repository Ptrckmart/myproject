use anchor_lang::prelude::*;

#[account]
pub struct Config {
    /// The authority that can update protocol parameters
    pub authority: Pubkey,
    /// The solUSD mint address
    pub mint: Pubkey,
    /// Minimum collateral ratio in basis points (e.g., 15000 = 150%)
    pub collateral_ratio_bps: u64,
    /// Liquidation threshold in basis points (e.g., 13000 = 130%)
    pub liquidation_threshold_bps: u64,
    /// Bump seed for the config PDA
    pub bump: u8,
    /// Bump seed for the mint authority PDA
    pub mint_authority_bump: u8,
}

impl Config {
    pub const LEN: usize = 8  // discriminator
        + 32  // authority
        + 32  // mint
        + 8   // collateral_ratio_bps
        + 8   // liquidation_threshold_bps
        + 1   // bump
        + 1;  // mint_authority_bump
}
