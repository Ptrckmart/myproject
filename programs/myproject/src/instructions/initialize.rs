use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::Config;
use crate::errors::StablecoinError;

pub fn handler(
    ctx: Context<Initialize>,
    fee_bps: u64,
) -> Result<()> {
    require!(fee_bps <= 1_000, StablecoinError::FeeTooHigh);

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.fee_bps = fee_bps;
    config.total_usdc_reserves = 0;
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

    /// The solUSD mint (created here)
    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = mint_authority,
    )]
    pub mint: Account<'info, Mint>,

    /// The accepted USDC mint (already exists on-chain)
    pub usdc_mint: Account<'info, Mint>,

    /// CHECK: PDA used as mint authority, no data needed
    #[account(
        seeds = [b"mint-authority"],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    /// Reserve token account (USDC) owned by the reserve PDA
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = reserve,
        seeds = [b"reserve-vault"],
        bump,
    )]
    pub reserve_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA that owns the reserve token account
    #[account(
        seeds = [b"reserve"],
        bump,
    )]
    pub reserve: UncheckedAccount<'info>,

    /// Treasury token account (USDC) owned by the treasury PDA
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = treasury,
        seeds = [b"treasury-vault"],
        bump,
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA that owns the treasury token account
    #[account(
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
