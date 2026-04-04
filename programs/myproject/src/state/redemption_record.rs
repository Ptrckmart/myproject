use anchor_lang::prelude::*;

#[account]
pub struct RedemptionRecord {
    pub user: Pubkey,
    /// solUSD amount held in escrow
    pub amount: u64,
    /// Unix timestamp when initiate_redeem was called
    pub timestamp: i64,
    pub status: RedemptionStatus,
    /// Equals config.redemption_counter at time of initiate_redeem
    pub redemption_id: u64,
    pub bump: u8,
}

impl RedemptionRecord {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 1 + 8 + 1; // = 66
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum RedemptionStatus {
    Pending,
    Completed,
    Failed,
}
