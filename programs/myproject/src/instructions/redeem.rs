use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::state::Config;
use crate::errors::StablecoinError;
use crate::helpers;

pub fn handler(
    ctx: Context<RedeemSolUsd>,
    solusd_amount: u64,
) -> Result<()> {
    require!(solusd_amount > 0, StablecoinError::ZeroAmount);

    let config = &ctx.accounts.config;

    // 1:1 conversion: solusd_amount == gross USDC
    let gross_usdc = solusd_amount;
    let fee = helpers::calculate_fee(gross_usdc, config.fee_bps)?;
    let net_usdc_to_user = gross_usdc.checked_sub(fee)
        .ok_or(StablecoinError::MathOverflow)?;

    require!(net_usdc_to_user > 0, StablecoinError::RedeemAmountTooSmall);
    require!(
        gross_usdc <= config.total_usdc_reserves,
        StablecoinError::InsufficientReserves
    );

    // Burn solUSD from user's token account
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.user_solusd_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        solusd_amount,
    )?;

    // Transfer net USDC from reserve to user
    let reserve_seeds = &[b"reserve".as_ref(), &[config.reserve_bump]];
    let reserve_signer = &[&reserve_seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.reserve_vault.to_account_info(),
                to: ctx.accounts.user_usdc_account.to_account_info(),
                authority: ctx.accounts.reserve.to_account_info(),
            },
            reserve_signer,
        ),
        net_usdc_to_user,
    )?;

    // Transfer fee USDC from reserve to treasury
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.reserve_vault.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.reserve.to_account_info(),
                },
                reserve_signer,
            ),
            fee,
        )?;
    }

    // Update config accounting
    let config = &mut ctx.accounts.config;
    config.total_usdc_reserves = config.total_usdc_reserves.checked_sub(gross_usdc)
        .ok_or(StablecoinError::MathOverflow)?;
    config.total_solusd_minted = config.total_solusd_minted.checked_sub(solusd_amount)
        .ok_or(StablecoinError::MathOverflow)?;

    Ok(())
}

#[derive(Accounts)]
pub struct RedeemSolUsd<'info> {
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

    /// CHECK: PDA that owns the reserve token account
    #[account(
        seeds = [b"reserve"],
        bump = config.reserve_bump,
    )]
    pub reserve: UncheckedAccount<'info>,

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

    /// User's USDC token account (destination)
    #[account(
        mut,
        constraint = user_usdc_account.mint == config.usdc_mint,
    )]
    pub user_usdc_account: Account<'info, TokenAccount>,

    /// User's solUSD token account (source for burn)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_solusd_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
