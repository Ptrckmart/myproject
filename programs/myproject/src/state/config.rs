use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub authority: Pubkey,
    /// The solUSD mint address
    pub mint: Pubkey,
    /// The accepted USDC mint address
    pub usdc_mint: Pubkey,
    /// Fee in basis points applied to mint and redeem (e.g., 30 = 0.30%)
    pub fee_bps: u64,
    /// Total USDC held in the reserve token account (6 decimals)
    pub total_usdc_reserves: u64,
    /// Total outstanding solUSD (6 decimals)
    pub total_solusd_minted: u64,
    pub bump: u8,
    pub mint_authority_bump: u8,
    pub reserve_bump: u8,
    pub treasury_bump: u8,
}

impl Config {
    pub const LEN: usize = 8   // discriminator
        + 32  // authority
        + 32  // mint
        + 32  // usdc_mint
        + 8   // fee_bps
        + 8   // total_usdc_reserves
        + 8   // total_solusd_minted
        + 1   // bump
        + 1   // mint_authority_bump
        + 1   // reserve_bump
        + 1;  // treasury_bump
}
