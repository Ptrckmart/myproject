//! mint_to_user instruction
//!
//! Single instruction: `mint_to_user(user_wallet: Pubkey, amount: u64)`
//! Signers: minting_authority + co_signer (dual-sig)
//!
//! Checks (in order): minting_authority key, co_signer key, not paused,
//!   not blacklisted, not frozen, oracle not stale, reserves sufficient,
//!   per-tx cap, daily cap, amount > 0.
//! Mints `net_amount = amount - fee` to user_solusd_account.
//! Mints `fee` to treasury_vault.
//! Emits MintExecuted.
//!
//! BPF note: blacklistedAccount and frozenAccount are optional PDAs.
//! In tests, pass program.programId as sentinel when user is not blacklisted/frozen.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::state::{Config, OracleConfig, BlacklistedAccount, FrozenAccount};
use crate::errors::StablecoinError;
use crate::helpers;
use crate::events::MintExecuted;

pub fn handler(
    ctx: Context<MintToUser>,
    user_wallet: Pubkey,
    amount: u64,
) -> Result<()> {
    // Verify minting authority
    require!(
        ctx.accounts.minting_authority.key() == ctx.accounts.config.minting_authority,
        StablecoinError::UnauthorizedMinter
    );

    // Verify co-signer
    require!(
        ctx.accounts.co_signer.key() == ctx.accounts.config.co_signer,
        StablecoinError::InvalidCoSigner
    );

    // Check pause
    require!(!ctx.accounts.config.is_paused, StablecoinError::ProtocolPaused);

    // Check blacklist and frozen for the recipient wallet
    require!(
        ctx.accounts.blacklisted_account.is_none(),
        StablecoinError::AccountBlacklisted
    );
    require!(
        ctx.accounts.frozen_account.is_none(),
        StablecoinError::AccountFrozen
    );

    require!(amount > 0, StablecoinError::ZeroAmount);

    let config = &ctx.accounts.config;

    // Per-tx cap check
    require!(amount <= config.per_tx_mint_cap, StablecoinError::MintCapExceeded);

    // Daily cap — reset window if 24h has elapsed
    let clock = Clock::get()?;
    let window_elapsed = clock.unix_timestamp - config.daily_mint_window_start;
    let daily_minted = if window_elapsed > 86_400 { 0 } else { config.daily_minted };
    require!(
        daily_minted.checked_add(amount).ok_or(StablecoinError::MathOverflow)? <= config.daily_mint_cap,
        StablecoinError::MintCapExceeded
    );

    // Oracle staleness check
    let oracle = &ctx.accounts.oracle_config;
    require!(
        clock.unix_timestamp - oracle.last_updated <= oracle.max_staleness_seconds,
        StablecoinError::StaleOracle
    );

    // Circuit breaker — reserves must cover post-mint supply
    let post_mint_supply = config.total_solusd_minted
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;
    require!(
        oracle.total_usd_reserves >= post_mint_supply,
        StablecoinError::ReservesInsufficient
    );

    // Fee math
    let fee = helpers::calculate_fee(amount, config.fee_bps)?;
    let net_amount = amount.checked_sub(fee).ok_or(StablecoinError::MathOverflow)?;
    require!(net_amount > 0, StablecoinError::MintAmountTooSmall);

    let mint_authority_bump = config.mint_authority_bump;
    let seeds = &[b"mint-authority".as_ref(), &[mint_authority_bump]];
    let signer_seeds = &[&seeds[..]];

    // Mint net amount to user
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
        net_amount,
    )?;

    // Mint fee to treasury vault
    if fee > 0 {
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;
    }

    // Update config accounting
    let config = &mut ctx.accounts.config;
    config.total_solusd_minted = config.total_solusd_minted
        .checked_add(net_amount)
        .ok_or(StablecoinError::MathOverflow)?;

    if window_elapsed > 86_400 {
        config.daily_minted = amount;
        config.daily_mint_window_start = clock.unix_timestamp;
    } else {
        config.daily_minted = config.daily_minted
            .checked_add(amount)
            .ok_or(StablecoinError::MathOverflow)?;
    }

    emit!(MintExecuted {
        user: user_wallet,
        amount: net_amount,
        fee,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(user_wallet: Pubkey)]
pub struct MintToUser<'info> {
    /// The off-chain API minting key
    pub minting_authority: Signer<'info>,

    /// The independent co-signer
    pub co_signer: Signer<'info>,

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

    #[account(
        seeds = [b"oracle-config"],
        bump = config.oracle_config_bump,
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// Treasury vault receives fee as solUSD
    #[account(
        mut,
        seeds = [b"treasury-vault"],
        bump,
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    /// User's solUSD token account (destination)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user_wallet,
    )]
    pub user_solusd_account: Account<'info, TokenAccount>,

    /// Blacklist check — if this account exists, user_wallet is blacklisted
    #[account(
        seeds = [b"blacklisted", user_wallet.as_ref()],
        bump,
    )]
    pub blacklisted_account: Option<Account<'info, BlacklistedAccount>>,

    /// Frozen check — if this account exists, user_wallet is frozen
    #[account(
        seeds = [b"frozen", user_wallet.as_ref()],
        bump,
    )]
    pub frozen_account: Option<Account<'info, FrozenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
}
