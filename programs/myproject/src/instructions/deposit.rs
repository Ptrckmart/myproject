use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::state::{Config, Vault};
use crate::errors::StablecoinError;

pub fn handler(
    ctx: Context<DepositCollateralAndMint>,
    sol_amount: u64,
    solusd_amount: u64,
) -> Result<()> {
    require!(sol_amount > 0, StablecoinError::ZeroAmount);
    require!(solusd_amount > 0, StablecoinError::ZeroAmount);

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

    // Check collateral ratio:
    // collateral_value_usd = (sol_deposited * sol_price_usd) / 1e9  (lamports to SOL)
    // ratio_bps = (collateral_value_usd * 10_000) / solusd_minted
    // Both sol_price_usd and solusd_minted use 6 decimals, so they cancel out
    let collateral_value_usd = (vault.sol_deposited as u128)
        .checked_mul(config.sol_price_usd as u128)
        .ok_or(StablecoinError::MathOverflow)?
        .checked_div(1_000_000_000) // lamports -> SOL
        .ok_or(StablecoinError::MathOverflow)?;

    let ratio_bps = collateral_value_usd
        .checked_mul(10_000)
        .ok_or(StablecoinError::MathOverflow)?
        .checked_div(vault.solusd_minted as u128)
        .ok_or(StablecoinError::MathOverflow)?;

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

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
