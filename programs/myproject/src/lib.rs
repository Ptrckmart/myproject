use anchor_lang::prelude::*;

declare_id!("7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J");

pub mod state;
pub mod instructions;
pub mod errors;

use instructions::*;

#[program]
pub mod myproject {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        collateral_ratio: u64,
        liquidation_threshold: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, collateral_ratio, liquidation_threshold)
    }
}
