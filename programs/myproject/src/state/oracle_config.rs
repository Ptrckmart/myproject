use anchor_lang::prelude::*;

#[account]
pub struct OracleConfig {
    /// Who can call update_reserves
    pub oracle_authority: Pubkey,
    /// Latest reported USD reserve balance (6 decimals)
    pub total_usd_reserves: u64,
    /// Unix timestamp of last oracle update
    pub last_updated: i64,
    /// Minting halts if oracle data is older than this many seconds
    pub max_staleness_seconds: i64,
    pub bump: u8,
}

impl OracleConfig {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1; // = 65
}
