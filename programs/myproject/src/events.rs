use anchor_lang::prelude::*;

#[event]
pub struct MintExecuted {
    pub user: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedeemInitiated {
    pub user: Pubkey,
    pub amount: u64,
    pub redemption_id: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedeemCompleted {
    pub user: Pubkey,
    pub redemption_id: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedeemCancelled {
    pub user: Pubkey,
    pub redemption_id: u64,
    pub timestamp: i64,
}

#[event]
pub struct RefundClaimed {
    pub user: Pubkey,
    pub redemption_id: u64,
    pub timestamp: i64,
}

#[event]
pub struct ReservesUpdated {
    pub total_usd_reserves: u64,
    pub timestamp: i64,
}

#[event]
pub struct AccountFrozen {
    pub user: Pubkey,
}

#[event]
pub struct AccountUnfrozen {
    pub user: Pubkey,
}

#[event]
pub struct AccountBlacklisted {
    pub user: Pubkey,
}

#[event]
pub struct ProtocolPaused {
    pub timestamp: i64,
}

#[event]
pub struct ProtocolUnpaused {
    pub timestamp: i64,
}

#[event]
pub struct FeeUpdated {
    pub old_fee_bps: u64,
    pub new_fee_bps: u64,
}

#[event]
pub struct MintCapsUpdated {
    pub per_tx_cap: u64,
    pub daily_cap: u64,
}
