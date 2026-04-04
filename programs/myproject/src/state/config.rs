use anchor_lang::prelude::*;

#[account]
pub struct Config {
    /// Multi-sig vault address (Squads Protocol)
    pub authority: Pubkey,
    /// The solUSD mint address
    pub mint: Pubkey,
    /// Off-chain API signing key (HSM-backed)
    pub minting_authority: Pubkey,
    /// Independent co-signer for dual-sig minting
    pub co_signer: Pubkey,
    /// Single-key emergency pause (HSM-backed)
    pub emergency_guardian: Pubkey,
    /// Fee in basis points applied to mint and redeem (e.g., 30 = 0.30%)
    pub fee_bps: u64,
    /// Total outstanding solUSD (6 decimals)
    pub total_solusd_minted: u64,
    /// Max solUSD per single mint transaction (6 decimals)
    pub per_tx_mint_cap: u64,
    /// Max solUSD per rolling 24h window (6 decimals)
    pub daily_mint_cap: u64,
    /// Counter of solUSD minted in current 24h window (6 decimals)
    pub daily_minted: u64,
    /// Unix timestamp when current 24h window started
    pub daily_mint_window_start: i64,
    /// Monotonic counter used as redemption_id for each initiate_redeem
    pub redemption_counter: u64,
    /// Global pause flag — blocks mint and redeem when true
    pub is_paused: bool,
    pub bump: u8,
    pub mint_authority_bump: u8,
    pub treasury_bump: u8,
    pub oracle_config_bump: u8,
    pub redeem_escrow_bump: u8,
}

impl Config {
    pub const LEN: usize = 8      // discriminator
        + 32 * 5                  // authority, mint, minting_authority, co_signer, emergency_guardian
        + 8 * 7                   // fee_bps, total_solusd_minted, per_tx_mint_cap, daily_mint_cap,
                                  //   daily_minted, daily_mint_window_start, redemption_counter
        + 1                       // is_paused
        + 1 * 5;                  // bump, mint_authority_bump, treasury_bump, oracle_config_bump, redeem_escrow_bump
                                  // = 8 + 160 + 56 + 1 + 5 = 230
}
