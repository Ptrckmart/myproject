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

    let treasury_bump = ctx.accounts.config.treasury_bump;
    let seeds = &[b"treasury".as_ref(), &[treasury_bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.treasury_vault.to_account_info(),
                to: ctx.accounts.authority_solusd_account.to_account_info(),
                authority: ctx.accounts.treasury.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    /// Must be the Squads vault address stored in config.authority
    #[account(
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

    /// Treasury solUSD token account (source)
    #[account(
        mut,
        seeds = [b"treasury-vault"],
        bump,
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    /// Authority's solUSD token account (destination)
    #[account(
        mut,
        associated_token::mint = config.mint,
        associated_token::authority = authority,
    )]
    pub authority_solusd_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
}
