use anchor_lang::prelude::*;

/// Marker PDA — existence means the wallet is frozen.
/// Seed: ["frozen", user_pubkey]
#[account]
pub struct FrozenAccount {
    pub bump: u8,
}

impl FrozenAccount {
    pub const LEN: usize = 8 + 1; // = 9
}
