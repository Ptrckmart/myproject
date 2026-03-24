use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub pyth_sol_usd_feed: Pubkey,
    /// Fallback SOL price in USD (6 decimals). Used when Pyth feed is unavailable.
    pub sol_price_usd: u64,
    /// Fee in basis points applied to mint and redeem (e.g., 30 = 0.30%)
    pub fee_bps: u64,
    /// Total SOL lamports held in the reserve PDA (excluding rent)
    pub total_sol_reserves: u64,
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
        + 32  // pyth_sol_usd_feed
        + 8   // sol_price_usd
        + 8   // fee_bps
        + 8   // total_sol_reserves
        + 8   // total_solusd_minted
        + 1   // bump
        + 1   // mint_authority_bump
        + 1   // reserve_bump
        + 1;  // treasury_bump
}
