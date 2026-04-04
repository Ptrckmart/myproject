use anchor_lang::prelude::*;

use crate::state::OracleConfig;
use crate::errors::StablecoinError;
use crate::events::ReservesUpdated;

pub fn handler(
    ctx: Context<UpdateReserves>,
    amount: u64,
) -> Result<()> {
    require!(
        ctx.accounts.oracle_authority.key() == ctx.accounts.oracle_config.oracle_authority,
        StablecoinError::InvalidOracleAuthority
    );

    let clock = Clock::get()?;
    let oracle = &mut ctx.accounts.oracle_config;
    oracle.total_usd_reserves = amount;
    oracle.last_updated = clock.unix_timestamp;

    emit!(ReservesUpdated {
        total_usd_reserves: amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateReserves<'info> {
    pub oracle_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"oracle-config"],
        bump = oracle_config.bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}
