# IDL Update Checklist

The IDL (`target/idl/myproject.json`) and TypeScript types (`target/types/myproject.ts`) are **hand-maintained** because `anchor-syn 0.30.1` has a bug that breaks auto-generation. Run through this checklist every time you change an instruction, account, event, or error.

---

## When to Update

| Code change | IDL update required? |
|---|---|
| Add / remove / rename an instruction | Yes |
| Add / remove / rename an instruction parameter | Yes |
| Add / remove / rename an account in an instruction's `Accounts` struct | Yes |
| Add / remove / rename a field on a state account (`Config`, etc.) | Yes |
| Add / remove an error variant in `errors.rs` | Yes |
| Add / remove an event in `events.rs` | Yes |
| Change logic inside a handler (no signature change) | No |
| Change a comment | No |

---

## Checklist

### 1. Instructions (`instructions` array in IDL)

For each changed instruction:

- [ ] Instruction name matches the Rust function name in `lib.rs`, converted to camelCase (e.g., `mint_to_user` → `"mintToUser"`)
- [ ] All `args` listed in order with correct `name` (camelCase) and `type`
- [ ] All `accounts` listed in the same order as the `Accounts` struct in Rust
- [ ] Each account has correct `name` (camelCase), `isMut`, `isSigner`
- [ ] PDA accounts have `"pda": { "seeds": [...] }` block
- [ ] Removed instructions are deleted from the array
- [ ] Discriminator bytes match `sha256("global:<snake_case_name>")[0..8]`

**Type mapping (Rust → IDL):**
| Rust | IDL type |
|---|---|
| `u8` | `"u8"` |
| `u64` | `"u64"` |
| `i64` | `"i64"` |
| `bool` | `"bool"` |
| `Pubkey` | `"publicKey"` |
| `String` | `{ "defined": "string" }` |

---

### 2. Accounts (`accounts` array in IDL)

For each changed account struct:

- [ ] Account name matches the Rust struct name exactly (PascalCase)
- [ ] Discriminator bytes match `sha256("account:<StructName>")[0..8]`
- [ ] All fields listed in Rust declaration order
- [ ] Field names converted to camelCase
- [ ] Field types mapped correctly (see type mapping above)
- [ ] Removed accounts deleted from the array
- [ ] New accounts added

**Enum fields** — use `{ "defined": "EnumName" }` as the type and add the enum to the `types` array:
```json
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
```

---

### 3. Errors (`errors` array in IDL)

- [ ] Each error has `"code"` (starting at 6000), `"name"`, and `"msg"` matching `errors.rs`
- [ ] Codes are sequential and match the Rust enum order
- [ ] New errors appended at the end (never renumber existing errors — it breaks clients)

---

### 4. Events (`events` array in IDL)

- [ ] Each event has `"name"` matching the Rust struct name
- [ ] All fields listed with correct camelCase names and types
- [ ] Discriminator for events is `sha256("event:<EventName>")[0..8]`

---

### 5. Types (`types` array in IDL)

- [ ] Any custom enum or struct used as a field type is defined here
- [ ] `RedemptionStatus` enum is present (used by `RedemptionRecord`)

---

### 6. Update TypeScript Types (`target/types/myproject.ts`)

After updating the IDL JSON, update the TypeScript type file to match:

- [ ] The `IDL` const at the bottom of the file matches the JSON exactly
- [ ] The `Myproject` TypeScript type at the top reflects all instruction signatures
- [ ] Account types include all new/modified fields
- [ ] Error types include all new codes

**Fastest approach:** Copy the entire updated IDL JSON into the `IDL` const in the `.ts` file, then update the TypeScript type definition at the top to match.

---

### 7. Verify Discriminators

Discriminators are the first 8 bytes of a SHA-256 hash. If you add a new instruction or account, compute its discriminator:

```bash
# Instruction discriminator (replace mint_to_user with your instruction name)
node -e "
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update('global:mint_to_user').digest();
console.log([...hash.slice(0,8)]);
"

# Account discriminator (replace Config with your account name)
node -e "
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update('account:Config').digest();
console.log([...hash.slice(0,8)]);
"

# Event discriminator
node -e "
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update('event:MintExecuted').digest();
console.log([...hash.slice(0,8)]);
"
```

---

### 8. Smoke Test

After updating the IDL and TS types:

```bash
# Rebuild TypeScript to catch type errors
yarn tsc --noEmit

# Run tests against local validator
rm -rf .anchor/test-ledger && COPYFILE_DISABLE=1 /Users/patrick/.cargo/bin/anchor test --skip-build
```

If the Anchor client throws `"unknown account"` or `"invalid instruction data"`, a discriminator is wrong. If it throws TypeScript errors, the TS type file is out of sync with the IDL.
