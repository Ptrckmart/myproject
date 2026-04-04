use anchor_lang::prelude::*;

use crate::state::{Config, FrozenAccount, BlacklistedAccount};
use crate::errors::StablecoinError;
use crate::events::{
    ProtocolPaused, ProtocolUnpaused,
    AccountFrozen, AccountUnfrozen, AccountBlacklisted,
};

// ── set_paused ────────────────────────────────────────────────────────────────

pub fn handle_set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.is_paused = paused;

    let clock = Clock::get()?;
    if paused {
        emit!(ProtocolPaused { timestamp: clock.unix_timestamp });
    } else {
        emit!(ProtocolUnpaused { timestamp: clock.unix_timestamp });
    }

    Ok(())
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
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

// ── emergency_pause ───────────────────────────────────────────────────────────

pub fn handle_emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
    require!(
        ctx.accounts.guardian.key() == ctx.accounts.config.emergency_guardian,
        StablecoinError::UnauthorizedAccess
    );

    let config = &mut ctx.accounts.config;
    config.is_paused = true;

    let clock = Clock::get()?;
    emit!(ProtocolPaused { timestamp: clock.unix_timestamp });

    Ok(())
}

#[derive(Accounts)]
pub struct EmergencyPause<'info> {
    pub guardian: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
}

// ── freeze_account ────────────────────────────────────────────────────────────

pub fn handle_freeze_account(ctx: Context<FreezeAccount>, user: Pubkey) -> Result<()> {
    ctx.accounts.frozen_account.bump = ctx.bumps.frozen_account;

    emit!(AccountFrozen { user });

    Ok(())
}

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct FreezeAccount<'info> {
    #[account(
        mut,
        constraint = authority.key() == config.authority @ StablecoinError::UnauthorizedAccess,
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = authority,
        space = FrozenAccount::LEN,
        seeds = [b"frozen", user.as_ref()],
        bump,
    )]
    pub frozen_account: Account<'info, FrozenAccount>,

    pub system_program: Program<'info, System>,
}

// ── unfreeze_account ──────────────────────────────────────────────────────────

pub fn handle_unfreeze_account(_ctx: Context<UnfreezeAccount>, user: Pubkey) -> Result<()> {
    emit!(AccountUnfrozen { user });

    Ok(())
}

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct UnfreezeAccount<'info> {
    #[account(
        mut,
        constraint = authority.key() == config.authority @ StablecoinError::UnauthorizedAccess,
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        close = authority,
        seeds = [b"frozen", user.as_ref()],
        bump = frozen_account.bump,
    )]
    pub frozen_account: Account<'info, FrozenAccount>,
}

// ── blacklist_account ─────────────────────────────────────────────────────────

pub fn handle_blacklist_account(ctx: Context<BlacklistAccount>, user: Pubkey) -> Result<()> {
    ctx.accounts.blacklisted_account.bump = ctx.bumps.blacklisted_account;

    emit!(AccountBlacklisted { user });

    Ok(())
}

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct BlacklistAccount<'info> {
    #[account(
        mut,
        constraint = authority.key() == config.authority @ StablecoinError::UnauthorizedAccess,
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = authority,
        space = BlacklistedAccount::LEN,
        seeds = [b"blacklisted", user.as_ref()],
        bump,
    )]
    pub blacklisted_account: Account<'info, BlacklistedAccount>,

    pub system_program: Program<'info, System>,
}
