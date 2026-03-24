use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

use crate::state::Config;
use crate::errors::StablecoinError;

pub fn handler(
    ctx: Context<Initialize>,
    fee_bps: u64,
    initial_sol_price_usd: u64,
) -> Result<()> {
    require!(fee_bps <= 1_000, StablecoinError::FeeTooHigh);
    require!(initial_sol_price_usd > 0, StablecoinError::InvalidOraclePrice);

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.pyth_sol_usd_feed = ctx.accounts.pyth_sol_usd_feed.key();
    config.sol_price_usd = initial_sol_price_usd;
    config.fee_bps = fee_bps;
    config.total_sol_reserves = 0;
    config.total_solusd_minted = 0;
    config.bump = ctx.bumps.config;
    config.mint_authority_bump = ctx.bumps.mint_authority;
    config.reserve_bump = ctx.bumps.reserve;
    config.treasury_bump = ctx.bumps.treasury;

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

    /// CHECK: PDA that will hold SOL reserves. Validated by seeds.
    #[account(
        seeds = [b"reserve"],
        bump,
    )]
    pub reserve: UncheckedAccount<'info>,

    /// CHECK: PDA that will hold fee revenue. Validated by seeds.
    #[account(
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: Pyth SOL/USD price feed account. Validated when reading prices.
    pub pyth_sol_usd_feed: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
