use anchor_lang::prelude::*;

declare_id!("7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J");

pub mod state;
pub mod instructions;
pub mod errors;
pub mod helpers;

use instructions::*;

#[program]
pub mod myproject {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        fee_bps: u64,
        initial_sol_price_usd: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, fee_bps, initial_sol_price_usd)
    }

    pub fn mint(
        ctx: Context<MintSolUsd>,
        sol_amount: u64,
    ) -> Result<()> {
        instructions::mint::handler(ctx, sol_amount)
    }

    pub fn redeem(
        ctx: Context<RedeemSolUsd>,
        solusd_amount: u64,
    ) -> Result<()> {
        instructions::redeem::handler(ctx, solusd_amount)
    }

    pub fn update_price(
        ctx: Context<UpdateConfig>,
        new_sol_price_usd: u64,
    ) -> Result<()> {
        instructions::admin::handle_update_price(ctx, new_sol_price_usd)
    }

    pub fn update_fee(
        ctx: Context<UpdateConfig>,
        new_fee_bps: u64,
    ) -> Result<()> {
        instructions::admin::handle_update_fee(ctx, new_fee_bps)
    }

    pub fn withdraw_fees(
        ctx: Context<WithdrawFees>,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw_fees::handler(ctx, amount)
    }
}
