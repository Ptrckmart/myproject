use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::state::{Config, RedemptionRecord, RedemptionStatus};
use crate::errors::StablecoinError;
use crate::events::{RedeemCompleted, RedeemCancelled, RefundClaimed};

const REFUND_TIMEOUT_SECONDS: i64 = 72 * 3600; // 72 hours

// ── complete_redeem ───────────────────────────────────────────────────────────

pub fn handle_complete_redeem(ctx: Context<CompleteRedeem>, _redemption_id: u64) -> Result<()> {
    require!(
        ctx.accounts.minting_authority.key() == ctx.accounts.config.minting_authority,
        StablecoinError::UnauthorizedMinter
    );

    let record = &ctx.accounts.redemption_record;
    require!(
        record.status == RedemptionStatus::Pending,
        StablecoinError::RedemptionNotPending
    );

    let amount = record.amount;
    let user = record.user;
    let redemption_id = record.redemption_id;

    let escrow_authority_bump = ctx.bumps.redeem_escrow_authority;
    let seeds = &[b"redeem-escrow-authority".as_ref(), &[escrow_authority_bump]];
    let signer_seeds = &[&seeds[..]];

    // Burn escrowed solUSD
    token::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.redeem_escrow.to_account_info(),
                authority: ctx.accounts.redeem_escrow_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Update supply
    let config = &mut ctx.accounts.config;
    config.total_solusd_minted = config.total_solusd_minted
        .checked_sub(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    // Update record status
    let record = &mut ctx.accounts.redemption_record;
    record.status = RedemptionStatus::Completed;

    let clock = Clock::get()?;
    emit!(RedeemCompleted { user, redemption_id, timestamp: clock.unix_timestamp });

    Ok(())
}

#[derive(Accounts)]
#[instruction(redemption_id: u64)]
pub struct CompleteRedeem<'info> {
    pub minting_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(mut, address = config.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"redeem-escrow"],
        bump = config.redeem_escrow_bump,
    )]
    pub redeem_escrow: Account<'info, TokenAccount>,

    /// CHECK: PDA that owns the redeem escrow
    #[account(
        seeds = [b"redeem-escrow-authority"],
        bump,
    )]
    pub redeem_escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"redemption", redemption_record.user.as_ref(), &redemption_id.to_le_bytes()],
        bump = redemption_record.bump,
    )]
    pub redemption_record: Account<'info, RedemptionRecord>,

    pub token_program: Program<'info, Token>,
}

// ── cancel_redeem ─────────────────────────────────────────────────────────────

pub fn handle_cancel_redeem(ctx: Context<CancelRedeem>, _redemption_id: u64) -> Result<()> {
    require!(
        ctx.accounts.minting_authority.key() == ctx.accounts.config.minting_authority,
        StablecoinError::UnauthorizedMinter
    );

    let record = &ctx.accounts.redemption_record;
    require!(
        record.status == RedemptionStatus::Pending,
        StablecoinError::RedemptionNotPending
    );

    let amount = record.amount;
    let user = record.user;
    let redemption_id = record.redemption_id;

    let escrow_authority_bump = ctx.bumps.redeem_escrow_authority;
    let seeds = &[b"redeem-escrow-authority".as_ref(), &[escrow_authority_bump]];
    let signer_seeds = &[&seeds[..]];

    // Return solUSD from escrow to user
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.redeem_escrow.to_account_info(),
                to: ctx.accounts.user_solusd_account.to_account_info(),
                authority: ctx.accounts.redeem_escrow_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let record = &mut ctx.accounts.redemption_record;
    record.status = RedemptionStatus::Failed;

    let clock = Clock::get()?;
    emit!(RedeemCancelled { user, redemption_id, timestamp: clock.unix_timestamp });

    Ok(())
}

#[derive(Accounts)]
#[instruction(redemption_id: u64)]
pub struct CancelRedeem<'info> {
    pub minting_authority: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(address = config.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"redeem-escrow"],
        bump = config.redeem_escrow_bump,
    )]
    pub redeem_escrow: Account<'info, TokenAccount>,

    /// CHECK: PDA that owns the redeem escrow
    #[account(
        seeds = [b"redeem-escrow-authority"],
        bump,
    )]
    pub redeem_escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"redemption", redemption_record.user.as_ref(), &redemption_id.to_le_bytes()],
        bump = redemption_record.bump,
    )]
    pub redemption_record: Account<'info, RedemptionRecord>,

    /// User's solUSD account (receives returned tokens)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = redemption_record.user,
    )]
    pub user_solusd_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
}

// ── claim_refund ──────────────────────────────────────────────────────────────

pub fn handle_claim_refund(ctx: Context<ClaimRefund>, _redemption_id: u64) -> Result<()> {
    let record = &ctx.accounts.redemption_record;

    require!(
        ctx.accounts.user.key() == record.user,
        StablecoinError::UnauthorizedAccess
    );
    require!(
        record.status == RedemptionStatus::Pending,
        StablecoinError::RedemptionNotPending
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp - record.timestamp >= REFUND_TIMEOUT_SECONDS,
        StablecoinError::RedemptionTimeoutNotReached
    );

    let amount = record.amount;
    let user = record.user;
    let redemption_id = record.redemption_id;

    let escrow_authority_bump = ctx.bumps.redeem_escrow_authority;
    let seeds = &[b"redeem-escrow-authority".as_ref(), &[escrow_authority_bump]];
    let signer_seeds = &[&seeds[..]];

    // Return solUSD from escrow to user
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.redeem_escrow.to_account_info(),
                to: ctx.accounts.user_solusd_account.to_account_info(),
                authority: ctx.accounts.redeem_escrow_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let record = &mut ctx.accounts.redemption_record;
    record.status = RedemptionStatus::Failed;

    emit!(RefundClaimed { user, redemption_id, timestamp: clock.unix_timestamp });

    Ok(())
}

#[derive(Accounts)]
#[instruction(redemption_id: u64)]
pub struct ClaimRefund<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(address = config.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"redeem-escrow"],
        bump = config.redeem_escrow_bump,
    )]
    pub redeem_escrow: Account<'info, TokenAccount>,

    /// CHECK: PDA that owns the redeem escrow
    #[account(
        seeds = [b"redeem-escrow-authority"],
        bump,
    )]
    pub redeem_escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"redemption", user.key().as_ref(), &redemption_id.to_le_bytes()],
        bump = redemption_record.bump,
    )]
    pub redemption_record: Account<'info, RedemptionRecord>,

    /// User's solUSD account (receives returned tokens)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_solusd_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
}
