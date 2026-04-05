# Squads Protocol Integration

> **Scope: Phase 10 (not yet started).** This document covers future mainnet integration. Phase 10 work will live in `api/` within this repo. The current on-chain program and test suite use `provider.wallet.publicKey` as `authority` — no Squads setup is needed for local development or testing. Only read this file when working on Squads integration for devnet/mainnet deployment.

How Squads multi-sig works with the solUSD v2 program. Covers the mental model, how admin instructions are called, and how to test locally.

---

## Mental Model

In solUSD v2, `config.authority` stores a **Squads vault address** instead of a plain keypair. A Squads vault is a PDA owned by the Squads program — it can sign transactions, but only after M-of-N members have approved a proposal.

From solUSD's perspective nothing changes: the program still checks `authority.key() == config.authority`. The difference is that `authority` is now a vault PDA that requires off-chain coordination to produce a valid signature.

```
Squads Member 1 ──┐
Squads Member 2 ──┼──► Squads Program ──► Vault PDA ──► solUSD instruction
Squads Member 3 ──┘         (M-of-N approval)         (authority == vault)
```

---

## Squads Concepts

| Term | Meaning |
|---|---|
| **Multisig** | The Squads account that holds members, threshold, and transaction queue |
| **Vault** | A PDA derived from the multisig — this is what `config.authority` stores |
| **Transaction** | A Squads proposal containing one or more instructions to execute |
| **Approval** | A member signing off on a transaction |
| **Execution** | After M approvals, any member (or anyone) can execute the transaction |

**Vault address derivation (Squads v4):**
```typescript
import { getVaultPda } from "@squads-protocol/multisig";

const [vaultPda] = getVaultPda({
    multisigPda,
    index: 0, // vault index, typically 0
});
```

---

## Setup

### Install Squads SDK

```bash
yarn add @squads-protocol/multisig
```

### Create a Multisig (devnet/localnet)

```typescript
import * as multisig from "@squads-protocol/multisig";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("http://localhost:8899", "confirmed");

// Generate a unique multisig create key (used only for PDA derivation)
const createKey = Keypair.generate();

const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

// Members and their voting weights
const members = [
    { key: member1.publicKey, permissions: multisig.Permissions.all() },
    { key: member2.publicKey, permissions: multisig.Permissions.all() },
    { key: member3.publicKey, permissions: multisig.Permissions.all() },
];

const sig = await multisig.rpc.multisigCreate({
    connection,
    creator: payer,
    multisigPda,
    configAuthority: null,     // no config authority = immutable threshold
    threshold: 2,              // 2-of-3 for testing; 3-of-5 for production
    members,
    timeLock: 0,               // no timelock for now
    createKey,
    sendOptions: { skipPreflight: true },
});
```

### Initialize solUSD with the Vault as Authority

```typescript
await program.methods
    .initialize(
        feeBps,
        mintingAuthority.publicKey,
        coSigner.publicKey,
        emergencyGuardian.publicKey,
        perTxMintCap,
        dailyMintCap,
        maxStalenessSeconds,
    )
    .accounts({
        authority: vaultPda,   // <-- vault address stored as config.authority
        // ... other accounts
    })
    .rpc();
```

---

## Executing an Admin Instruction via Squads

Every admin instruction (`update_fee`, `withdraw_fees`, `set_paused`, `freeze_account`, etc.) must go through the Squads proposal flow. Steps:

### 1. Build the target instruction

```typescript
// Build the solUSD instruction (do NOT send it)
const updateFeeIx = await program.methods
    .updateFee(new anchor.BN(50))
    .accounts({
        authority: vaultPda,
        config: configPda,
    })
    .instruction(); // .instruction() not .rpc()
```

### 2. Create a Squads transaction proposal

```typescript
const [transactionPda] = multisig.getTransactionPda({
    multisigPda,
    index: BigInt(transactionIndex), // increment for each new proposal
});

await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: member1,
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    creator: member1.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [updateFeeIx],
    }).compileToV0Message(),
    memo: "Update fee to 0.50%",
});
```

### 3. Members approve

```typescript
// Member 1 approves
await multisig.rpc.proposalApprove({
    connection,
    feePayer: member1,
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    member: member1,
});

// Member 2 approves (threshold met)
await multisig.rpc.proposalApprove({
    connection,
    feePayer: member2,
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    member: member2,
});
```

### 4. Execute

```typescript
await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: member1,
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    member: member1.publicKey,
    signers: [member1],
});
```

---

## Testing Multi-sig Flows on Localnet

For unit tests, use a 1-of-1 or 2-of-3 threshold to keep tests fast. The pattern:

```typescript
// In test setup (before hook):
// 1. Create multisig with test keypairs as members
// 2. Store vaultPda as the authority used in initialize
// 3. For each admin operation, wrap in the 4-step flow above

// Helper to execute a multisig instruction in tests:
async function executeViaSquads(ix: TransactionInstruction, txIndex: number) {
    await multisig.rpc.vaultTransactionCreate({ /* ... */ });
    await multisig.rpc.proposalApprove({ member: member1, /* ... */ });
    await multisig.rpc.proposalApprove({ member: member2, /* ... */ }); // if threshold = 2
    await multisig.rpc.vaultTransactionExecute({ /* ... */ });
}

// Usage:
const ix = await program.methods.updateFee(new anchor.BN(50)).accounts({...}).instruction();
await executeViaSquads(ix, txIndex++);
```

---

## Emergency Guardian — Not Through Squads

`emergency_pause()` is called by the `emergency_guardian` keypair directly — it bypasses Squads entirely. The guardian is a single keypair stored in an HSM. On-chain, `config.emergency_guardian` stores the guardian's public key and the instruction verifies `guardian.key() == config.emergency_guardian`.

```typescript
// emergency_pause does NOT go through Squads
await program.methods
    .emergencyPause()
    .accounts({
        guardian: emergencyGuardian.publicKey,
        config: configPda,
    })
    .signers([emergencyGuardian])
    .rpc();
```

---

## Minting Authority — Not Through Squads

`mint_to_user` and redeem lifecycle instructions (`complete_redeem`, `cancel_redeem`) are called by the `minting_authority` keypair directly — also not through Squads. These are high-frequency operations called by the off-chain API.

---

## Production Key Management

| Key | Custody | Usage |
|---|---|---|
| Squads members (5 keys) | Distributed across team members (hardware wallets) | Signing admin proposals |
| `minting_authority` | HSM / Cloud KMS | Called by off-chain API on every mint |
| `co_signer` | Separate HSM / Cloud KMS | Co-signs every mint_to_user tx |
| `emergency_guardian` | HSM, held by on-call operator | Break-glass pause only |

---

## Useful Links

- Squads v4 SDK: `@squads-protocol/multisig`
- Squads docs: https://docs.squads.so
- Squads devnet program ID: `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`
- Squads mainnet program ID: `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` (same)
