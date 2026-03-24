use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::state::Config;
use crate::errors::StablecoinError;

pub fn handler(
    ctx: Context<WithdrawFees>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);

    let treasury_lamports = ctx.accounts.treasury.lamports();
    require!(
        amount <= treasury_lamports,
        StablecoinError::InsufficientTreasuryBalance
    );

    let treasury_seeds = &[b"treasury".as_ref(), &[ctx.accounts.config.treasury_bump]];
    let treasury_signer = &[&treasury_seeds[..]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.authority.to_account_info(),
            },
            treasury_signer,
        ),
        amount,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        mut,
        constraint = authority.key() == config.authority @ StablecoinError::UnauthorizedAccess,
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: Treasury PDA. Validated by seeds.
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = config.treasury_bump,
    )]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
