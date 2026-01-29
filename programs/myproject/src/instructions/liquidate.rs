use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

use crate::state::{Config, Vault};
use crate::errors::StablecoinError;
use crate::helpers;

/// Liquidation bonus in basis points (500 = 5%)
pub const LIQUIDATION_BONUS_BPS: u64 = 500;

pub fn handler(
    ctx: Context<Liquidate>,
    solusd_to_repay: u64,
) -> Result<()> {
    require!(solusd_to_repay > 0, StablecoinError::ZeroAmount);

    let config = &ctx.accounts.config;
    let vault = &mut ctx.accounts.vault;

    // Get current SOL price
    let clock = Clock::get()?;
    let pyth_info = ctx.accounts.pyth_price_feed.as_ref()
        .map(|a| a.to_account_info());
    let sol_price_usd = helpers::get_sol_price_usd(
        &pyth_info,
        config.sol_price_usd,
        &clock,
    )?;

    // Check that the vault is below liquidation threshold
    let ratio_bps = helpers::calculate_ratio_bps(
        vault.sol_deposited,
        sol_price_usd,
        vault.solusd_minted,
    )?;

    require!(
        ratio_bps < config.liquidation_threshold_bps as u128,
        StablecoinError::VaultNotLiquidatable
    );

    // Cap repayment to the vault's total debt
    let repay_amount = solusd_to_repay.min(vault.solusd_minted);

    // Calculate SOL to seize:
    // base_sol = (repay_amount * 1e9) / sol_price_usd
    //   (repay_amount is in 6-decimal solUSD, sol_price_usd is 6-decimal USD, result in lamports)
    // seized_sol = base_sol * (10000 + LIQUIDATION_BONUS_BPS) / 10000
    let base_sol_lamports = (repay_amount as u128)
        .checked_mul(1_000_000_000)
        .ok_or(StablecoinError::MathOverflow)?
        .checked_div(sol_price_usd as u128)
        .ok_or(StablecoinError::MathOverflow)?;

    let seized_sol_lamports = base_sol_lamports
        .checked_mul(10_000 + LIQUIDATION_BONUS_BPS as u128)
        .ok_or(StablecoinError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(StablecoinError::MathOverflow)? as u64;

    // Cap seized SOL to what the vault actually has
    let actual_seized = seized_sol_lamports.min(vault.sol_deposited);

    // Burn the liquidator's solUSD
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.liquidator_solusd_account.to_account_info(),
                authority: ctx.accounts.liquidator.to_account_info(),
            },
        ),
        repay_amount,
    )?;

    // Update vault state
    vault.solusd_minted = vault.solusd_minted.checked_sub(repay_amount)
        .ok_or(StablecoinError::MathOverflow)?;
    vault.sol_deposited = vault.sol_deposited.checked_sub(actual_seized)
        .ok_or(StablecoinError::MathOverflow)?;

    // Transfer seized SOL from vault to liquidator
    let vault_info = ctx.accounts.vault.to_account_info();
    let liquidator_info = ctx.accounts.liquidator.to_account_info();

    **vault_info.try_borrow_mut_lamports()? = vault_info
        .lamports()
        .checked_sub(actual_seized)
        .ok_or(StablecoinError::MathOverflow)?;
    **liquidator_info.try_borrow_mut_lamports()? = liquidator_info
        .lamports()
        .checked_add(actual_seized)
        .ok_or(StablecoinError::MathOverflow)?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(solusd_to_repay: u64)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// The undercollateralized vault to liquidate
    #[account(
        mut,
        seeds = [b"vault", vault_owner.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: The owner of the vault being liquidated (not a signer)
    pub vault_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = liquidator,
    )]
    pub liquidator_solusd_account: Account<'info, TokenAccount>,

    /// CHECK: Optional Pyth SOL/USD price feed account. Validated in helper.
    pub pyth_price_feed: Option<UncheckedAccount<'info>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
