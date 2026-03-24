/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/myproject.json`.
 */
export type Myproject = {
  "address": "7hRVbVHoJ4rZnjscFytTNxwZKBe3qir3KjJCgXVmnq9J",
  "metadata": {
    "name": "myproject",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "initialize",
      "discriminator": number[],
      "accounts": [
        { "name": "authority", "writable": true, "signer": true },
        { "name": "config", "writable": true },
        { "name": "mint", "writable": true, "signer": true },
        { "name": "usdcMint" },
        { "name": "mintAuthority" },
        { "name": "reserveVault", "writable": true },
        { "name": "reserve" },
        { "name": "treasuryVault", "writable": true },
        { "name": "treasury" },
        { "name": "tokenProgram" },
        { "name": "systemProgram" },
        { "name": "rent" }
      ],
      "args": [
        { "name": "feeBps", "type": "u64" }
      ]
    },
    {
      "name": "mint",
      "discriminator": number[],
      "accounts": [
        { "name": "user", "writable": true, "signer": true },
        { "name": "config", "writable": true },
        { "name": "mint", "writable": true },
        { "name": "mintAuthority" },
        { "name": "reserveVault", "writable": true },
        { "name": "treasuryVault", "writable": true },
        { "name": "userUsdcAccount", "writable": true },
        { "name": "userSolusdAccount", "writable": true },
        { "name": "tokenProgram" }
      ],
      "args": [
        { "name": "usdcAmount", "type": "u64" }
      ]
    },
    {
      "name": "redeem",
      "discriminator": number[],
      "accounts": [
        { "name": "user", "writable": true, "signer": true },
        { "name": "config", "writable": true },
        { "name": "mint", "writable": true },
        { "name": "reserve" },
        { "name": "reserveVault", "writable": true },
        { "name": "treasuryVault", "writable": true },
        { "name": "userUsdcAccount", "writable": true },
        { "name": "userSolusdAccount", "writable": true },
        { "name": "tokenProgram" }
      ],
      "args": [
        { "name": "solusdAmount", "type": "u64" }
      ]
    },
    {
      "name": "updateFee",
      "discriminator": number[],
      "accounts": [
        { "name": "authority", "signer": true },
        { "name": "config", "writable": true }
      ],
      "args": [
        { "name": "newFeeBps", "type": "u64" }
      ]
    },
    {
      "name": "withdrawFees",
      "discriminator": number[],
      "accounts": [
        { "name": "authority", "writable": true, "signer": true },
        { "name": "config" },
        { "name": "treasury" },
        { "name": "treasuryVault", "writable": true },
        { "name": "authorityUsdcAccount", "writable": true },
        { "name": "tokenProgram" }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": number[]
    }
  ],
  "errors": [
    { "code": 6000, "name": "zeroAmount", "msg": "Amount must be greater than zero" },
    { "code": 6001, "name": "mathOverflow", "msg": "Math overflow" },
    { "code": 6002, "name": "unauthorizedAccess", "msg": "Unauthorized access" },
    { "code": 6003, "name": "feeTooHigh", "msg": "Fee must not exceed 1000 basis points (10%)" },
    { "code": 6004, "name": "insufficientReserves", "msg": "Reserve does not have enough USDC to cover redemption" },
    { "code": 6005, "name": "insufficientTreasuryBalance", "msg": "Treasury does not have enough USDC for withdrawal" },
    { "code": 6006, "name": "mintAmountTooSmall", "msg": "Deposit too small: results in zero solUSD after fees" },
    { "code": 6007, "name": "redeemAmountTooSmall", "msg": "Redemption too small: results in zero USDC after fees" }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "pubkey" },
          { "name": "mint", "type": "pubkey" },
          { "name": "usdcMint", "type": "pubkey" },
          { "name": "feeBps", "type": "u64" },
          { "name": "totalUsdcReserves", "type": "u64" },
          { "name": "totalSolusdMinted", "type": "u64" },
          { "name": "bump", "type": "u8" },
          { "name": "mintAuthorityBump", "type": "u8" },
          { "name": "reserveBump", "type": "u8" },
          { "name": "treasuryBump", "type": "u8" }
        ]
      }
    }
  ]
};
