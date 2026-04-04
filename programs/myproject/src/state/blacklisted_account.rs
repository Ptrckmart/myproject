use anchor_lang::prelude::*;

/// Marker PDA — existence means the wallet is permanently blacklisted.
/// Seed: ["blacklisted", user_pubkey]
/// There is no unblacklist instruction.
#[account]
pub struct BlacklistedAccount {
    pub bump: u8,
}

impl BlacklistedAccount {
    pub const LEN: usize = 8 + 1; // = 9
}
