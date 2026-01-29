use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

use crate::state::{Config, Vault};
use crate::errors::StablecoinError;

pub fn handler(
    ctx: Context<RedeemAndWithdraw>,
    solusd_amount: u64,
    sol_amount: u64,
) -> Result<()> {
    require!(solusd_amount > 0 || sol_amount > 0, StablecoinError::ZeroAmount);

    let vault = &mut ctx.accounts.vault;
    let config = &ctx.accounts.config;

    // Validate the vault belongs to the signer
    require!(
        vault.owner == ctx.accounts.owner.key(),
        StablecoinError::UnauthorizedVaultAccess
    );

    // Burn solUSD from user's token account
    if solusd_amount > 0 {
        require!(
            vault.solusd_minted >= solusd_amount,
            StablecoinError::InsufficientMintedBalance
        );

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.user_solusd_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            solusd_amount,
        )?;

        vault.solusd_minted = vault.solusd_minted.checked_sub(solusd_amount)
            .ok_or(StablecoinError::MathOverflow)?;
    }

    // Withdraw SOL from vault to user
    if sol_amount > 0 {
        require!(
            vault.sol_deposited >= sol_amount,
            StablecoinError::InsufficientCollateral
        );

        vault.sol_deposited = vault.sol_deposited.checked_sub(sol_amount)
            .ok_or(StablecoinError::MathOverflow)?;

        // If there's remaining debt, check collateral ratio
        if vault.solusd_minted > 0 {
            let collateral_value_usd = (vault.sol_deposited as u128)
                .checked_mul(config.sol_price_usd as u128)
                .ok_or(StablecoinError::MathOverflow)?
                .checked_div(1_000_000_000)
                .ok_or(StablecoinError::MathOverflow)?;

            let ratio_bps = collateral_value_usd
                .checked_mul(10_000)
                .ok_or(StablecoinError::MathOverflow)?
                .checked_div(vault.solusd_minted as u128)
                .ok_or(StablecoinError::MathOverflow)?;

            require!(
                ratio_bps >= config.collateral_ratio_bps as u128,
                StablecoinError::InsufficientCollateral
            );
        }

        // Transfer SOL from vault PDA to user
        let owner_key = ctx.accounts.owner.key();
        let seeds = &[
            b"vault".as_ref(),
            owner_key.as_ref(),
            &[vault.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Use raw lamport transfer from PDA
        let vault_info = ctx.accounts.vault.to_account_info();
        let owner_info = ctx.accounts.owner.to_account_info();

        **vault_info.try_borrow_mut_lamports()? = vault_info
            .lamports()
            .checked_sub(sol_amount)
            .ok_or(StablecoinError::MathOverflow)?;
        **owner_info.try_borrow_mut_lamports()? = owner_info
            .lamports()
            .checked_add(sol_amount)
            .ok_or(StablecoinError::MathOverflow)?;

        // Suppress unused variable warning — seeds kept for clarity
        let _ = signer_seeds;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct RedeemAndWithdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        address = config.mint,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub user_solusd_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
