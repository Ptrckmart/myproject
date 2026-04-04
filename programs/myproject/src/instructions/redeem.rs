use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::state::{Config, RedemptionRecord, RedemptionStatus, BlacklistedAccount, FrozenAccount};
use crate::errors::StablecoinError;
use crate::helpers;
use crate::events::RedeemInitiated;

pub fn handler(
    ctx: Context<InitiateRedeem>,
    solusd_amount: u64,
    redemption_id: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;

    require!(!config.is_paused, StablecoinError::ProtocolPaused);
    require!(
        ctx.accounts.blacklisted_account.is_none(),
        StablecoinError::AccountBlacklisted
    );
    require!(
        ctx.accounts.frozen_account.is_none(),
        StablecoinError::AccountFrozen
    );
    require!(solusd_amount > 0, StablecoinError::ZeroAmount);

    let fee = helpers::calculate_fee(solusd_amount, config.fee_bps)?;
    let net_usdc = solusd_amount.checked_sub(fee).ok_or(StablecoinError::MathOverflow)?;
    require!(net_usdc > 0, StablecoinError::RedeemAmountTooSmall);

    // Transfer solUSD from user to redeem escrow (do NOT burn yet)
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_solusd_account.to_account_info(),
                to: ctx.accounts.redeem_escrow.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        solusd_amount,
    )?;

    // Init redemption record
    let record = &mut ctx.accounts.redemption_record;
    let clock = Clock::get()?;
    record.user = ctx.accounts.user.key();
    record.amount = solusd_amount;
    record.timestamp = clock.unix_timestamp;
    record.status = RedemptionStatus::Pending;
    record.redemption_id = redemption_id;
    record.bump = ctx.bumps.redemption_record;

    // Increment counter
    let config = &mut ctx.accounts.config;
    config.redemption_counter = config.redemption_counter
        .checked_add(1)
        .ok_or(StablecoinError::MathOverflow)?;

    emit!(RedeemInitiated {
        user: ctx.accounts.user.key(),
        amount: solusd_amount,
        redemption_id,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(solusd_amount: u64, redemption_id: u64)]
pub struct InitiateRedeem<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(address = config.mint)]
    pub mint: Account<'info, Mint>,

    /// Redeem escrow holds solUSD during pending redemption
    #[account(
        mut,
        seeds = [b"redeem-escrow"],
        bump = config.redeem_escrow_bump,
    )]
    pub redeem_escrow: Account<'info, TokenAccount>,

    /// Created here; tracks this redemption's status
    #[account(
        init,
        payer = user,
        space = RedemptionRecord::LEN,
        seeds = [b"redemption", user.key().as_ref(), &redemption_id.to_le_bytes()],
        bump,
    )]
    pub redemption_record: Account<'info, RedemptionRecord>,

    /// User's solUSD account (source)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_solusd_account: Account<'info, TokenAccount>,

    /// Blacklist check
    #[account(
        seeds = [b"blacklisted", user.key().as_ref()],
        bump,
    )]
    pub blacklisted_account: Option<Account<'info, BlacklistedAccount>>,

    /// Frozen check
    #[account(
        seeds = [b"frozen", user.key().as_ref()],
        bump,
    )]
    pub frozen_account: Option<Account<'info, FrozenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}
