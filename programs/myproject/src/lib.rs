use anchor_lang::prelude::*;

declare_id!("7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J");

pub mod state;
pub mod instructions;
pub mod errors;
pub mod helpers;
pub mod events;

use instructions::*;

#[program]
pub mod myproject {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        fee_bps: u64,
        minting_authority: Pubkey,
        co_signer: Pubkey,
        emergency_guardian: Pubkey,
        per_tx_mint_cap: u64,
        daily_mint_cap: u64,
        max_staleness_seconds: i64,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            fee_bps,
            minting_authority,
            co_signer,
            emergency_guardian,
            per_tx_mint_cap,
            daily_mint_cap,
            max_staleness_seconds,
        )
    }

    pub fn mint_to_user(
        ctx: Context<MintToUser>,
        user_wallet: Pubkey,
        amount: u64,
    ) -> Result<()> {
        instructions::mint::handler(ctx, user_wallet, amount)
    }

    pub fn initiate_redeem(
        ctx: Context<InitiateRedeem>,
        solusd_amount: u64,
        redemption_id: u64,
    ) -> Result<()> {
        instructions::redeem::handler(ctx, solusd_amount, redemption_id)
    }

    pub fn complete_redeem(
        ctx: Context<CompleteRedeem>,
        redemption_id: u64,
    ) -> Result<()> {
        instructions::redeem_lifecycle::handle_complete_redeem(ctx, redemption_id)
    }

    pub fn cancel_redeem(
        ctx: Context<CancelRedeem>,
        redemption_id: u64,
    ) -> Result<()> {
        instructions::redeem_lifecycle::handle_cancel_redeem(ctx, redemption_id)
    }

    pub fn claim_refund(
        ctx: Context<ClaimRefund>,
        redemption_id: u64,
    ) -> Result<()> {
        instructions::redeem_lifecycle::handle_claim_refund(ctx, redemption_id)
    }

    pub fn update_reserves(
        ctx: Context<UpdateReserves>,
        amount: u64,
    ) -> Result<()> {
        instructions::update_reserves::handler(ctx, amount)
    }

    pub fn update_fee(
        ctx: Context<UpdateConfig>,
        new_fee_bps: u64,
    ) -> Result<()> {
        instructions::admin::handle_update_fee(ctx, new_fee_bps)
    }

    pub fn update_mint_caps(
        ctx: Context<UpdateMintCaps>,
        per_tx_cap: u64,
        daily_cap: u64,
    ) -> Result<()> {
        instructions::update_mint_caps::handler(ctx, per_tx_cap, daily_cap)
    }

    pub fn withdraw_fees(
        ctx: Context<WithdrawFees>,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw_fees::handler(ctx, amount)
    }

    pub fn set_paused(
        ctx: Context<SetPaused>,
        paused: bool,
    ) -> Result<()> {
        instructions::compliance::handle_set_paused(ctx, paused)
    }

    pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
        instructions::compliance::handle_emergency_pause(ctx)
    }

    pub fn freeze_account(
        ctx: Context<FreezeAccount>,
        user: Pubkey,
    ) -> Result<()> {
        instructions::compliance::handle_freeze_account(ctx, user)
    }

    pub fn unfreeze_account(
        ctx: Context<UnfreezeAccount>,
        user: Pubkey,
    ) -> Result<()> {
        instructions::compliance::handle_unfreeze_account(ctx, user)
    }

    pub fn blacklist_account(
        ctx: Context<BlacklistAccount>,
        user: Pubkey,
    ) -> Result<()> {
        instructions::compliance::handle_blacklist_account(ctx, user)
    }
}
