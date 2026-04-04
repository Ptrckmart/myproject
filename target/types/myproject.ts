/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/myproject.json`.
 */
export type Myproject = {
  "version": "0.2.0",
  "name": "myproject",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false },
        { "name": "mint", "isMut": true, "isSigner": true },
        { "name": "mintAuthority", "isMut": false, "isSigner": false },
        { "name": "oracleConfig", "isMut": true, "isSigner": false },
        { "name": "treasuryVault", "isMut": true, "isSigner": false },
        { "name": "treasury", "isMut": false, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redeemEscrowAuthority", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "rent", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "feeBps", "type": "u64" },
        { "name": "mintingAuthority", "type": "publicKey" },
        { "name": "coSigner", "type": "publicKey" },
        { "name": "emergencyGuardian", "type": "publicKey" },
        { "name": "perTxMintCap", "type": "u64" },
        { "name": "dailyMintCap", "type": "u64" },
        { "name": "maxStalenessSeconds", "type": "i64" }
      ]
    },
    {
      "name": "mintToUser",
      "accounts": [
        { "name": "mintingAuthority", "isMut": false, "isSigner": true },
        { "name": "coSigner", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false },
        { "name": "mint", "isMut": true, "isSigner": false },
        { "name": "mintAuthority", "isMut": false, "isSigner": false },
        { "name": "oracleConfig", "isMut": false, "isSigner": false },
        { "name": "treasuryVault", "isMut": true, "isSigner": false },
        { "name": "userSolusdAccount", "isMut": true, "isSigner": false },
        { "name": "blacklistedAccount", "isMut": false, "isSigner": false, "isOptional": true },
        { "name": "frozenAccount", "isMut": false, "isSigner": false, "isOptional": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "userWallet", "type": "publicKey" },
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "initiateRedeem",
      "accounts": [
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false },
        { "name": "mint", "isMut": false, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redemptionRecord", "isMut": true, "isSigner": false },
        { "name": "userSolusdAccount", "isMut": true, "isSigner": false },
        { "name": "blacklistedAccount", "isMut": false, "isSigner": false, "isOptional": true },
        { "name": "frozenAccount", "isMut": false, "isSigner": false, "isOptional": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "solusdAmount", "type": "u64" },
        { "name": "redemptionId", "type": "u64" }
      ]
    },
    {
      "name": "completeRedeem",
      "accounts": [
        { "name": "mintingAuthority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false },
        { "name": "mint", "isMut": true, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redeemEscrowAuthority", "isMut": false, "isSigner": false },
        { "name": "redemptionRecord", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "redemptionId", "type": "u64" }
      ]
    },
    {
      "name": "cancelRedeem",
      "accounts": [
        { "name": "mintingAuthority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "mint", "isMut": false, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redeemEscrowAuthority", "isMut": false, "isSigner": false },
        { "name": "redemptionRecord", "isMut": true, "isSigner": false },
        { "name": "userSolusdAccount", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "redemptionId", "type": "u64" }
      ]
    },
    {
      "name": "claimRefund",
      "accounts": [
        { "name": "user", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "mint", "isMut": false, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redeemEscrowAuthority", "isMut": false, "isSigner": false },
        { "name": "redemptionRecord", "isMut": true, "isSigner": false },
        { "name": "userSolusdAccount", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "redemptionId", "type": "u64" }
      ]
    },
    {
      "name": "updateReserves",
      "accounts": [
        { "name": "oracleAuthority", "isMut": false, "isSigner": true },
        { "name": "oracleConfig", "isMut": true, "isSigner": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "updateFee",
      "accounts": [
        { "name": "authority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false }
      ],
      "args": [
        { "name": "newFeeBps", "type": "u64" }
      ]
    },
    {
      "name": "updateMintCaps",
      "accounts": [
        { "name": "authority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false }
      ],
      "args": [
        { "name": "perTxCap", "type": "u64" },
        { "name": "dailyCap", "type": "u64" }
      ]
    },
    {
      "name": "withdrawFees",
      "accounts": [
        { "name": "authority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "treasury", "isMut": false, "isSigner": false },
        { "name": "treasuryVault", "isMut": true, "isSigner": false },
        { "name": "authoritySolusdAccount", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "setPaused",
      "accounts": [
        { "name": "authority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false }
      ],
      "args": [
        { "name": "paused", "type": "bool" }
      ]
    },
    {
      "name": "emergencyPause",
      "accounts": [
        { "name": "guardian", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "freezeAccount",
      "accounts": [
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "frozenAccount", "isMut": true, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "user", "type": "publicKey" }
      ]
    },
    {
      "name": "unfreezeAccount",
      "accounts": [
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "frozenAccount", "isMut": true, "isSigner": false }
      ],
      "args": [
        { "name": "user", "type": "publicKey" }
      ]
    },
    {
      "name": "blacklistAccount",
      "accounts": [
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "blacklistedAccount", "isMut": true, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "user", "type": "publicKey" }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "publicKey" },
          { "name": "mint", "type": "publicKey" },
          { "name": "mintingAuthority", "type": "publicKey" },
          { "name": "coSigner", "type": "publicKey" },
          { "name": "emergencyGuardian", "type": "publicKey" },
          { "name": "feeBps", "type": "u64" },
          { "name": "totalSolusdMinted", "type": "u64" },
          { "name": "perTxMintCap", "type": "u64" },
          { "name": "dailyMintCap", "type": "u64" },
          { "name": "dailyMinted", "type": "u64" },
          { "name": "dailyMintWindowStart", "type": "i64" },
          { "name": "redemptionCounter", "type": "u64" },
          { "name": "isPaused", "type": "bool" },
          { "name": "bump", "type": "u8" },
          { "name": "mintAuthorityBump", "type": "u8" },
          { "name": "treasuryBump", "type": "u8" },
          { "name": "oracleConfigBump", "type": "u8" },
          { "name": "redeemEscrowBump", "type": "u8" }
        ]
      }
    },
    {
      "name": "oracleConfig",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "oracleAuthority", "type": "publicKey" },
          { "name": "totalUsdReserves", "type": "u64" },
          { "name": "lastUpdated", "type": "i64" },
          { "name": "maxStalenessSeconds", "type": "i64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "redemptionRecord",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "user", "type": "publicKey" },
          { "name": "amount", "type": "u64" },
          { "name": "timestamp", "type": "i64" },
          { "name": "status", "type": { "defined": "RedemptionStatus" } },
          { "name": "redemptionId", "type": "u64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "frozenAccount",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "blacklistedAccount",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "RedemptionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          { "name": "Pending" },
          { "name": "Completed" },
          { "name": "Failed" }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "MintExecuted",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "fee", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "RedeemInitiated",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "amount", "type": "u64", "index": false },
        { "name": "redemptionId", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "RedeemCompleted",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "redemptionId", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "RedeemCancelled",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "redemptionId", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "RefundClaimed",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false },
        { "name": "redemptionId", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "ReservesUpdated",
      "fields": [
        { "name": "totalUsdReserves", "type": "u64", "index": false },
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "AccountFrozen",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false }
      ]
    },
    {
      "name": "AccountUnfrozen",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false }
      ]
    },
    {
      "name": "AccountBlacklisted",
      "fields": [
        { "name": "user", "type": "publicKey", "index": false }
      ]
    },
    {
      "name": "ProtocolPaused",
      "fields": [
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "ProtocolUnpaused",
      "fields": [
        { "name": "timestamp", "type": "i64", "index": false }
      ]
    },
    {
      "name": "FeeUpdated",
      "fields": [
        { "name": "oldFeeBps", "type": "u64", "index": false },
        { "name": "newFeeBps", "type": "u64", "index": false }
      ]
    },
    {
      "name": "MintCapsUpdated",
      "fields": [
        { "name": "perTxCap", "type": "u64", "index": false },
        { "name": "dailyCap", "type": "u64", "index": false }
      ]
    }
  ],
  "errors": [
    { "code": 6000, "name": "ZeroAmount", "msg": "Amount must be greater than zero" },
    { "code": 6001, "name": "MathOverflow", "msg": "Math overflow" },
    { "code": 6002, "name": "UnauthorizedAccess", "msg": "Unauthorized access" },
    { "code": 6003, "name": "FeeTooHigh", "msg": "Fee must not exceed 1000 basis points (10%)" },
    { "code": 6004, "name": "InsufficientReserves", "msg": "Reserve does not have enough USDC to cover redemption" },
    { "code": 6005, "name": "InsufficientTreasuryBalance", "msg": "Treasury does not have enough for withdrawal" },
    { "code": 6006, "name": "MintAmountTooSmall", "msg": "Deposit too small: results in zero solUSD after fees" },
    { "code": 6007, "name": "RedeemAmountTooSmall", "msg": "Redemption too small: results in zero USDC after fees" },
    { "code": 6008, "name": "ProtocolPaused", "msg": "Protocol is paused" },
    { "code": 6009, "name": "AccountFrozen", "msg": "This account is frozen" },
    { "code": 6010, "name": "AccountBlacklisted", "msg": "This account is blacklisted" },
    { "code": 6011, "name": "ReservesInsufficient", "msg": "Minting halted: post-mint supply would exceed reserves" },
    { "code": 6012, "name": "InvalidOracleAuthority", "msg": "Caller is not the authorized oracle" },
    { "code": 6013, "name": "StaleOracle", "msg": "Minting halted: oracle data exceeds max staleness threshold" },
    { "code": 6014, "name": "UnauthorizedMinter", "msg": "Caller is not the authorized minting service" },
    { "code": 6015, "name": "MintCapExceeded", "msg": "Mint amount exceeds per-transaction or daily cap" },
    { "code": 6016, "name": "InvalidCoSigner", "msg": "Co-signer verification failed" },
    { "code": 6017, "name": "RedemptionNotFound", "msg": "Redemption record does not exist" },
    { "code": 6018, "name": "RedemptionNotPending", "msg": "Redemption is not in pending status" },
    { "code": 6019, "name": "RedemptionTimeoutNotReached", "msg": "72h timeout has not elapsed; cannot claim refund yet" }
  ]
};

export const IDL: Myproject = {
  "version": "0.2.0",
  "name": "myproject",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false },
        { "name": "mint", "isMut": true, "isSigner": true },
        { "name": "mintAuthority", "isMut": false, "isSigner": false },
        { "name": "oracleConfig", "isMut": true, "isSigner": false },
        { "name": "treasuryVault", "isMut": true, "isSigner": false },
        { "name": "treasury", "isMut": false, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redeemEscrowAuthority", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "rent", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "feeBps", "type": "u64" },
        { "name": "mintingAuthority", "type": "publicKey" },
        { "name": "coSigner", "type": "publicKey" },
        { "name": "emergencyGuardian", "type": "publicKey" },
        { "name": "perTxMintCap", "type": "u64" },
        { "name": "dailyMintCap", "type": "u64" },
        { "name": "maxStalenessSeconds", "type": "i64" }
      ]
    },
    {
      "name": "mintToUser",
      "accounts": [
        { "name": "mintingAuthority", "isMut": false, "isSigner": true },
        { "name": "coSigner", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false },
        { "name": "mint", "isMut": true, "isSigner": false },
        { "name": "mintAuthority", "isMut": false, "isSigner": false },
        { "name": "oracleConfig", "isMut": false, "isSigner": false },
        { "name": "treasuryVault", "isMut": true, "isSigner": false },
        { "name": "userSolusdAccount", "isMut": true, "isSigner": false },
        { "name": "blacklistedAccount", "isMut": false, "isSigner": false, "isOptional": true },
        { "name": "frozenAccount", "isMut": false, "isSigner": false, "isOptional": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "userWallet", "type": "publicKey" },
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "initiateRedeem",
      "accounts": [
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false },
        { "name": "mint", "isMut": false, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redemptionRecord", "isMut": true, "isSigner": false },
        { "name": "userSolusdAccount", "isMut": true, "isSigner": false },
        { "name": "blacklistedAccount", "isMut": false, "isSigner": false, "isOptional": true },
        { "name": "frozenAccount", "isMut": false, "isSigner": false, "isOptional": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "solusdAmount", "type": "u64" },
        { "name": "redemptionId", "type": "u64" }
      ]
    },
    {
      "name": "completeRedeem",
      "accounts": [
        { "name": "mintingAuthority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false },
        { "name": "mint", "isMut": true, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redeemEscrowAuthority", "isMut": false, "isSigner": false },
        { "name": "redemptionRecord", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [{ "name": "redemptionId", "type": "u64" }]
    },
    {
      "name": "cancelRedeem",
      "accounts": [
        { "name": "mintingAuthority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "mint", "isMut": false, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redeemEscrowAuthority", "isMut": false, "isSigner": false },
        { "name": "redemptionRecord", "isMut": true, "isSigner": false },
        { "name": "userSolusdAccount", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [{ "name": "redemptionId", "type": "u64" }]
    },
    {
      "name": "claimRefund",
      "accounts": [
        { "name": "user", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "mint", "isMut": false, "isSigner": false },
        { "name": "redeemEscrow", "isMut": true, "isSigner": false },
        { "name": "redeemEscrowAuthority", "isMut": false, "isSigner": false },
        { "name": "redemptionRecord", "isMut": true, "isSigner": false },
        { "name": "userSolusdAccount", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [{ "name": "redemptionId", "type": "u64" }]
    },
    {
      "name": "updateReserves",
      "accounts": [
        { "name": "oracleAuthority", "isMut": false, "isSigner": true },
        { "name": "oracleConfig", "isMut": true, "isSigner": false }
      ],
      "args": [{ "name": "amount", "type": "u64" }]
    },
    {
      "name": "updateFee",
      "accounts": [
        { "name": "authority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false }
      ],
      "args": [{ "name": "newFeeBps", "type": "u64" }]
    },
    {
      "name": "updateMintCaps",
      "accounts": [
        { "name": "authority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false }
      ],
      "args": [
        { "name": "perTxCap", "type": "u64" },
        { "name": "dailyCap", "type": "u64" }
      ]
    },
    {
      "name": "withdrawFees",
      "accounts": [
        { "name": "authority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "treasury", "isMut": false, "isSigner": false },
        { "name": "treasuryVault", "isMut": true, "isSigner": false },
        { "name": "authoritySolusdAccount", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [{ "name": "amount", "type": "u64" }]
    },
    {
      "name": "setPaused",
      "accounts": [
        { "name": "authority", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false }
      ],
      "args": [{ "name": "paused", "type": "bool" }]
    },
    {
      "name": "emergencyPause",
      "accounts": [
        { "name": "guardian", "isMut": false, "isSigner": true },
        { "name": "config", "isMut": true, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "freezeAccount",
      "accounts": [
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "frozenAccount", "isMut": true, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [{ "name": "user", "type": "publicKey" }]
    },
    {
      "name": "unfreezeAccount",
      "accounts": [
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "frozenAccount", "isMut": true, "isSigner": false }
      ],
      "args": [{ "name": "user", "type": "publicKey" }]
    },
    {
      "name": "blacklistAccount",
      "accounts": [
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "config", "isMut": false, "isSigner": false },
        { "name": "blacklistedAccount", "isMut": true, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [{ "name": "user", "type": "publicKey" }]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "publicKey" },
          { "name": "mint", "type": "publicKey" },
          { "name": "mintingAuthority", "type": "publicKey" },
          { "name": "coSigner", "type": "publicKey" },
          { "name": "emergencyGuardian", "type": "publicKey" },
          { "name": "feeBps", "type": "u64" },
          { "name": "totalSolusdMinted", "type": "u64" },
          { "name": "perTxMintCap", "type": "u64" },
          { "name": "dailyMintCap", "type": "u64" },
          { "name": "dailyMinted", "type": "u64" },
          { "name": "dailyMintWindowStart", "type": "i64" },
          { "name": "redemptionCounter", "type": "u64" },
          { "name": "isPaused", "type": "bool" },
          { "name": "bump", "type": "u8" },
          { "name": "mintAuthorityBump", "type": "u8" },
          { "name": "treasuryBump", "type": "u8" },
          { "name": "oracleConfigBump", "type": "u8" },
          { "name": "redeemEscrowBump", "type": "u8" }
        ]
      }
    },
    {
      "name": "oracleConfig",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "oracleAuthority", "type": "publicKey" },
          { "name": "totalUsdReserves", "type": "u64" },
          { "name": "lastUpdated", "type": "i64" },
          { "name": "maxStalenessSeconds", "type": "i64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "redemptionRecord",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "user", "type": "publicKey" },
          { "name": "amount", "type": "u64" },
          { "name": "timestamp", "type": "i64" },
          { "name": "status", "type": { "defined": "RedemptionStatus" } },
          { "name": "redemptionId", "type": "u64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "frozenAccount",
      "type": { "kind": "struct", "fields": [{ "name": "bump", "type": "u8" }] }
    },
    {
      "name": "blacklistedAccount",
      "type": { "kind": "struct", "fields": [{ "name": "bump", "type": "u8" }] }
    }
  ],
  "types": [
    {
      "name": "RedemptionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          { "name": "Pending" },
          { "name": "Completed" },
          { "name": "Failed" }
        ]
      }
    }
  ],
  "events": [
    { "name": "MintExecuted", "fields": [{ "name": "user", "type": "publicKey", "index": false }, { "name": "amount", "type": "u64", "index": false }, { "name": "fee", "type": "u64", "index": false }, { "name": "timestamp", "type": "i64", "index": false }] },
    { "name": "RedeemInitiated", "fields": [{ "name": "user", "type": "publicKey", "index": false }, { "name": "amount", "type": "u64", "index": false }, { "name": "redemptionId", "type": "u64", "index": false }, { "name": "timestamp", "type": "i64", "index": false }] },
    { "name": "RedeemCompleted", "fields": [{ "name": "user", "type": "publicKey", "index": false }, { "name": "redemptionId", "type": "u64", "index": false }, { "name": "timestamp", "type": "i64", "index": false }] },
    { "name": "RedeemCancelled", "fields": [{ "name": "user", "type": "publicKey", "index": false }, { "name": "redemptionId", "type": "u64", "index": false }, { "name": "timestamp", "type": "i64", "index": false }] },
    { "name": "RefundClaimed", "fields": [{ "name": "user", "type": "publicKey", "index": false }, { "name": "redemptionId", "type": "u64", "index": false }, { "name": "timestamp", "type": "i64", "index": false }] },
    { "name": "ReservesUpdated", "fields": [{ "name": "totalUsdReserves", "type": "u64", "index": false }, { "name": "timestamp", "type": "i64", "index": false }] },
    { "name": "AccountFrozen", "fields": [{ "name": "user", "type": "publicKey", "index": false }] },
    { "name": "AccountUnfrozen", "fields": [{ "name": "user", "type": "publicKey", "index": false }] },
    { "name": "AccountBlacklisted", "fields": [{ "name": "user", "type": "publicKey", "index": false }] },
    { "name": "ProtocolPaused", "fields": [{ "name": "timestamp", "type": "i64", "index": false }] },
    { "name": "ProtocolUnpaused", "fields": [{ "name": "timestamp", "type": "i64", "index": false }] },
    { "name": "FeeUpdated", "fields": [{ "name": "oldFeeBps", "type": "u64", "index": false }, { "name": "newFeeBps", "type": "u64", "index": false }] },
    { "name": "MintCapsUpdated", "fields": [{ "name": "perTxCap", "type": "u64", "index": false }, { "name": "dailyCap", "type": "u64", "index": false }] }
  ],
  "errors": [
    { "code": 6000, "name": "ZeroAmount", "msg": "Amount must be greater than zero" },
    { "code": 6001, "name": "MathOverflow", "msg": "Math overflow" },
    { "code": 6002, "name": "UnauthorizedAccess", "msg": "Unauthorized access" },
    { "code": 6003, "name": "FeeTooHigh", "msg": "Fee must not exceed 1000 basis points (10%)" },
    { "code": 6004, "name": "InsufficientReserves", "msg": "Reserve does not have enough USDC to cover redemption" },
    { "code": 6005, "name": "InsufficientTreasuryBalance", "msg": "Treasury does not have enough for withdrawal" },
    { "code": 6006, "name": "MintAmountTooSmall", "msg": "Deposit too small: results in zero solUSD after fees" },
    { "code": 6007, "name": "RedeemAmountTooSmall", "msg": "Redemption too small: results in zero USDC after fees" },
    { "code": 6008, "name": "ProtocolPaused", "msg": "Protocol is paused" },
    { "code": 6009, "name": "AccountFrozen", "msg": "This account is frozen" },
    { "code": 6010, "name": "AccountBlacklisted", "msg": "This account is blacklisted" },
    { "code": 6011, "name": "ReservesInsufficient", "msg": "Minting halted: post-mint supply would exceed reserves" },
    { "code": 6012, "name": "InvalidOracleAuthority", "msg": "Caller is not the authorized oracle" },
    { "code": 6013, "name": "StaleOracle", "msg": "Minting halted: oracle data exceeds max staleness threshold" },
    { "code": 6014, "name": "UnauthorizedMinter", "msg": "Caller is not the authorized minting service" },
    { "code": 6015, "name": "MintCapExceeded", "msg": "Mint amount exceeds per-transaction or daily cap" },
    { "code": 6016, "name": "InvalidCoSigner", "msg": "Co-signer verification failed" },
    { "code": 6017, "name": "RedemptionNotFound", "msg": "Redemption record does not exist" },
    { "code": 6018, "name": "RedemptionNotPending", "msg": "Redemption is not in pending status" },
    { "code": 6019, "name": "RedemptionTimeoutNotReached", "msg": "72h timeout has not elapsed; cannot claim refund yet" }
  ]
};
