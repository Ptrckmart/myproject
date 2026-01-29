use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

use crate::state::Config;
use crate::errors::StablecoinError;

pub fn handler(
    ctx: Context<Initialize>,
    collateral_ratio_bps: u64,
    liquidation_threshold_bps: u64,
) -> Result<()> {
    require!(
        collateral_ratio_bps > 10_000,
        StablecoinError::InvalidCollateralRatio
    );
    require!(
        liquidation_threshold_bps > 10_000,
        StablecoinError::LiquidationThresholdTooLow
    );
    require!(
        liquidation_threshold_bps < collateral_ratio_bps,
        StablecoinError::InvalidLiquidationThreshold
    );

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.collateral_ratio_bps = collateral_ratio_bps;
    config.liquidation_threshold_bps = liquidation_threshold_bps;
    config.bump = ctx.bumps.config;
    config.mint_authority_bump = ctx.bumps.mint_authority;

    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Config::LEN,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = mint_authority,
    )]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA used as mint authority, no data needed
    #[account(
        seeds = [b"mint-authority"],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
