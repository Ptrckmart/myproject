use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    /// The owner of this vault
    pub owner: Pubkey,
    /// Amount of SOL deposited as collateral (in lamports)
    pub sol_deposited: u64,
    /// Amount of solUSD minted (in smallest unit, 6 decimals)
    pub solusd_minted: u64,
    /// Bump seed for the vault PDA
    pub bump: u8,
}

impl Vault {
    pub const LEN: usize = 8  // discriminator
        + 32  // owner
        + 8   // sol_deposited
        + 8   // solusd_minted
        + 1;  // bump
}
