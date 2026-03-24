use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::state::Config;
use crate::errors::StablecoinError;
use crate::helpers;

pub fn handler(
    ctx: Context<MintSolUsd>,
    usdc_amount: u64,
) -> Result<()> {
    require!(usdc_amount > 0, StablecoinError::ZeroAmount);

    let config = &ctx.accounts.config;

    // Calculate fee and net amounts (1:1, both 6 decimals)
    let fee = helpers::calculate_fee(usdc_amount, config.fee_bps)?;
    let net_usdc = usdc_amount.checked_sub(fee)
        .ok_or(StablecoinError::MathOverflow)?;
    let solusd_to_mint = net_usdc;

    require!(solusd_to_mint > 0, StablecoinError::MintAmountTooSmall);

    // Transfer net USDC from user to reserve
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_usdc_account.to_account_info(),
                to: ctx.accounts.reserve_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        net_usdc,
    )?;

    // Transfer fee USDC from user to treasury
    if fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc_account.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    // Mint solUSD to user's token account
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
        solusd_to_mint,
    )?;

    // Update config accounting
    let config = &mut ctx.accounts.config;
    config.total_usdc_reserves = config.total_usdc_reserves.checked_add(net_usdc)
        .ok_or(StablecoinError::MathOverflow)?;
    config.total_solusd_minted = config.total_solusd_minted.checked_add(solusd_to_mint)
        .ok_or(StablecoinError::MathOverflow)?;

    Ok(())
}

#[derive(Accounts)]
pub struct MintSolUsd<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

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

    /// Reserve USDC token account
    #[account(
        mut,
        seeds = [b"reserve-vault"],
        bump,
    )]
    pub reserve_vault: Account<'info, TokenAccount>,

    /// Treasury USDC token account
    #[account(
        mut,
        seeds = [b"treasury-vault"],
        bump,
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    /// User's USDC token account (source)
    #[account(
        mut,
        constraint = user_usdc_account.mint == config.usdc_mint,
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,

    /// User's solUSD token account (destination)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_solusd_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
