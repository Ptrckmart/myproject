use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{Config, OracleConfig};
use crate::errors::StablecoinError;

pub fn handler(
    ctx: Context<Initialize>,
    fee_bps: u64,
    minting_authority: Pubkey,
    co_signer: Pubkey,
    emergency_guardian: Pubkey,
    per_tx_mint_cap: u64,
    daily_mint_cap: u64,
    max_staleness_seconds: i64,
) -> Result<()> {
    require!(fee_bps <= 1_000, StablecoinError::FeeTooHigh);

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.minting_authority = minting_authority;
    config.co_signer = co_signer;
    config.emergency_guardian = emergency_guardian;
    config.fee_bps = fee_bps;
    config.total_solusd_minted = 0;
    config.per_tx_mint_cap = per_tx_mint_cap;
    config.daily_mint_cap = daily_mint_cap;
    config.daily_minted = 0;
    config.daily_mint_window_start = 0;
    config.redemption_counter = 0;
    config.is_paused = false;
    config.bump = ctx.bumps.config;
    config.mint_authority_bump = ctx.bumps.mint_authority;
    config.treasury_bump = ctx.bumps.treasury;
    config.oracle_config_bump = ctx.bumps.oracle_config;
    config.redeem_escrow_bump = ctx.bumps.redeem_escrow;

    let oracle = &mut ctx.accounts.oracle_config;
    oracle.oracle_authority = minting_authority;
    oracle.total_usd_reserves = 0;
    oracle.last_updated = 0;
    oracle.max_staleness_seconds = max_staleness_seconds;
    oracle.bump = ctx.bumps.oracle_config;

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
    pub config: Box<Account<'info, Config>>,

    /// The solUSD mint (created here)
    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = mint_authority,
    )]
    pub mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA used as mint authority for solUSD mint_to CPIs
    #[account(
        seeds = [b"mint-authority"],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    /// Oracle config PDA (stores reserve balance and staleness config)
    #[account(
        init,
        payer = authority,
        space = OracleConfig::LEN,
        seeds = [b"oracle-config"],
        bump,
    )]
    pub oracle_config: Box<Account<'info, OracleConfig>>,

    /// Treasury token account (solUSD fees)
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = treasury,
        seeds = [b"treasury-vault"],
        bump,
    )]
    pub treasury_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA that owns the treasury token account
    #[account(
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: UncheckedAccount<'info>,

    /// Redeem escrow token account (holds solUSD during pending redemptions)
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = redeem_escrow_authority,
        seeds = [b"redeem-escrow"],
        bump,
    )]
    pub redeem_escrow: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA that owns the redeem escrow token account
    #[account(
        seeds = [b"redeem-escrow-authority"],
        bump,
    )]
    pub redeem_escrow_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
