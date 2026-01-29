use anchor_lang::prelude::*;

use crate::state::Config;
use crate::errors::StablecoinError;

pub fn handle_update_price(
    ctx: Context<UpdateConfig>,
    new_sol_price_usd: u64,
) -> Result<()> {
    require!(new_sol_price_usd > 0, StablecoinError::InvalidOraclePrice);

    let config = &mut ctx.accounts.config;
    config.sol_price_usd = new_sol_price_usd;

    Ok(())
}

pub fn handle_update_params(
    ctx: Context<UpdateConfig>,
    new_collateral_ratio_bps: Option<u64>,
    new_liquidation_threshold_bps: Option<u64>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    let collateral_ratio = new_collateral_ratio_bps.unwrap_or(config.collateral_ratio_bps);
    let liquidation_threshold = new_liquidation_threshold_bps.unwrap_or(config.liquidation_threshold_bps);

    require!(
        collateral_ratio > 10_000,
        StablecoinError::InvalidCollateralRatio
    );
    require!(
        liquidation_threshold > 10_000,
        StablecoinError::LiquidationThresholdTooLow
    );
    require!(
        liquidation_threshold < collateral_ratio,
        StablecoinError::InvalidLiquidationThreshold
    );

    config.collateral_ratio_bps = collateral_ratio;
    config.liquidation_threshold_bps = liquidation_threshold;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        constraint = authority.key() == config.authority @ StablecoinError::UnauthorizedAccess,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
}
