use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::Config;
use crate::errors::StablecoinError;

pub fn handler(
    ctx: Context<WithdrawFees>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);
    require!(
        ctx.accounts.treasury_vault.amount >= amount,
        StablecoinError::InsufficientTreasuryBalance
    );

    let treasury_seeds = &[b"treasury".as_ref(), &[ctx.accounts.config.treasury_bump]];
    let treasury_signer = &[&treasury_seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.treasury_vault.to_account_info(),
                to: ctx.accounts.authority_usdc_account.to_account_info(),
                authority: ctx.accounts.treasury.to_account_info(),
            },
            treasury_signer,
        ),
        amount,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
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

    /// CHECK: PDA that owns the treasury token account
    #[account(
        seeds = [b"treasury"],
        bump = config.treasury_bump,
    )]
    pub treasury: UncheckedAccount<'info>,

    /// Treasury USDC token account
    #[account(
        mut,
        seeds = [b"treasury-vault"],
        bump,
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    /// Authority's USDC token account (destination)
    #[account(
        mut,
        constraint = authority_usdc_account.mint == config.usdc_mint,
    )]
    pub authority_usdc_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
