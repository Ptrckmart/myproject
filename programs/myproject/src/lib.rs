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
        collateral_ratio: u64,
        liquidation_threshold: u64,
        initial_sol_price_usd: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, collateral_ratio, liquidation_threshold, initial_sol_price_usd)
    }

    pub fn deposit_collateral_and_mint(
        ctx: Context<DepositCollateralAndMint>,
        sol_amount: u64,
        solusd_amount: u64,
    ) -> Result<()> {
        instructions::deposit::handler(ctx, sol_amount, solusd_amount)
    }

    pub fn redeem_and_withdraw(
        ctx: Context<RedeemAndWithdraw>,
        solusd_amount: u64,
        sol_amount: u64,
    ) -> Result<()> {
        instructions::redeem::handler(ctx, solusd_amount, sol_amount)
    }
}
