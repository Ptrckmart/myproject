use anchor_lang::prelude::*;

use crate::state::Config;
use crate::errors::StablecoinError;

pub fn handle_update_fee(
    ctx: Context<UpdateConfig>,
    new_fee_bps: u64,
) -> Result<()> {
    require!(new_fee_bps <= 1_000, StablecoinError::FeeTooHigh);

    let config = &mut ctx.accounts.config;
    config.fee_bps = new_fee_bps;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
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
