use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::state::Config;
use crate::errors::StablecoinError;
use crate::helpers;

pub fn handler(
    ctx: Context<MintSolUsd>,
    sol_amount: u64,
) -> Result<()> {
    require!(sol_amount > 0, StablecoinError::ZeroAmount);

    let config = &ctx.accounts.config;

    // Get SOL price from Pyth oracle (or fallback)
    let clock = Clock::get()?;
    let pyth_info = ctx.accounts.pyth_price_feed.as_ref()
        .map(|a| a.to_account_info());
    let sol_price_usd = helpers::get_sol_price_usd(
        &pyth_info,
        config.sol_price_usd,
        &clock,
    )?;

    // Calculate fee and net amounts
    let fee_lamports = helpers::calculate_fee_lamports(sol_amount, config.fee_bps)?;
    let net_sol = sol_amount.checked_sub(fee_lamports)
        .ok_or(StablecoinError::MathOverflow)?;
    let solusd_to_mint = helpers::sol_to_solusd(net_sol, sol_price_usd)?;

    require!(solusd_to_mint > 0, StablecoinError::MintAmountTooSmall);

    // Transfer net SOL from user to reserve PDA
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.reserve.to_account_info(),
            },
        ),
        net_sol,
    )?;

    // Transfer fee from user to treasury PDA
    if fee_lamports > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            fee_lamports,
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
    config.total_sol_reserves = config.total_sol_reserves.checked_add(net_sol)
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

    /// CHECK: Reserve PDA that holds SOL. Validated by seeds.
    #[account(
        mut,
        seeds = [b"reserve"],
        bump = config.reserve_bump,
    )]
    pub reserve: UncheckedAccount<'info>,

    /// CHECK: Treasury PDA that holds fee revenue. Validated by seeds.
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = config.treasury_bump,
    )]
    pub treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_solusd_account: Account<'info, TokenAccount>,

    /// CHECK: Optional Pyth SOL/USD price feed. Validated in helper.
    pub pyth_price_feed: Option<UncheckedAccount<'info>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
