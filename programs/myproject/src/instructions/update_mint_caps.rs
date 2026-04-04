use anchor_lang::prelude::*;

use crate::state::Config;
use crate::errors::StablecoinError;
use crate::events::MintCapsUpdated;

pub fn handler(
    ctx: Context<UpdateMintCaps>,
    per_tx_cap: u64,
    daily_cap: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.per_tx_mint_cap = per_tx_cap;
    config.daily_mint_cap = daily_cap;

    emit!(MintCapsUpdated { per_tx_cap, daily_cap });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateMintCaps<'info> {
    #[account(
        constraint = authority.key() == config.authority @ StablecoinError::UnauthorizedAccess,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
}
