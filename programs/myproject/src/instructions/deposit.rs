use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::state::{Config, Vault};
use crate::errors::StablecoinError;
use crate::helpers;

pub fn handler(
    ctx: Context<DepositCollateralAndMint>,
    sol_amount: u64,
    solusd_amount: u64,
) -> Result<()> {
    require!(sol_amount > 0, StablecoinError::ZeroAmount);
    require!(solusd_amount > 0, StablecoinError::ZeroAmount);

    // Get SOL price from Pyth oracle (or fallback)
    let clock = Clock::get()?;
    let pyth_info = ctx.accounts.pyth_price_feed.as_ref()
        .map(|a| a.to_account_info());
    let sol_price_usd = helpers::get_sol_price_usd(
        &pyth_info,
        ctx.accounts.config.sol_price_usd,
        &clock,
    )?;

    // Transfer SOL from user to the vault PDA first (before mutable borrow)
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        sol_amount,
    )?;

    // Now update vault state
    let vault = &mut ctx.accounts.vault;
    let config = &ctx.accounts.config;

    vault.owner = ctx.accounts.owner.key();
    vault.sol_deposited = vault.sol_deposited.checked_add(sol_amount)
        .ok_or(StablecoinError::MathOverflow)?;
    vault.solusd_minted = vault.solusd_minted.checked_add(solusd_amount)
        .ok_or(StablecoinError::MathOverflow)?;
    vault.bump = ctx.bumps.vault;

    // Check collateral ratio
    let ratio_bps = helpers::calculate_ratio_bps(
        vault.sol_deposited,
        sol_price_usd,
        vault.solusd_minted,
    )?;

    require!(
        ratio_bps >= config.collateral_ratio_bps as u128,
        StablecoinError::InsufficientCollateral
    );

    // Mint solUSD to the user's token account
    let seeds = &[b"mint-authority".as_ref(), &[config.mint_authority_bump]];
    let signer_seeds = &[&seeds[..]];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.user_solusd_account.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ),
        solusd_amount,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct DepositCollateralAndMint<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = owner,
        space = Vault::LEN,
        seeds = [b"vault", owner.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA used as mint authority
    #[account(
        seeds = [b"mint-authority"],
        bump = config.mint_authority_bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub user_solusd_account: Account<'info, TokenAccount>,

    /// CHECK: Optional Pyth SOL/USD price feed account. Validated in helper.
    pub pyth_price_feed: Option<UncheckedAccount<'info>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
