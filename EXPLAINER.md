# solUSD — Plain Language Explainer

---

## What is solUSD?

solUSD is a digital dollar. One solUSD is always worth exactly one US dollar.

You can think of it like a digital gift card that is always worth $1.00. You load it with real money, use it however you like, and cash it out whenever you want.

The difference from a regular gift card is that solUSD lives on a public computer network called Solana — which means no single company controls it, every transaction is recorded permanently, and anyone can verify at any time that the dollars backing it are real.

---

## Why does this exist?

Most digital payment systems require trusting a bank or company in the middle. That company can freeze your funds, go bankrupt, or make mistakes. solUSD is designed so that the rules are written in code and enforced automatically — not by a person making a judgment call.

It is also designed for people and businesses who want to move dollars quickly across borders or into digital applications, without the delays and fees of traditional wire transfers.

---

## How do you get solUSD?

**Step 1 — Send dollars.**
You send US dollars to a bank account held in reserve. This is a normal bank wire, the same as wiring money to any business.

**Step 2 — The system confirms.**
An automated service watches the bank account. When your wire arrives and is confirmed, it sends a signal to the solUSD program.

**Step 3 — solUSD appears in your wallet.**
The program creates new solUSD tokens equal to the amount you deposited, minus a small fee (currently 0.30%), and sends them to your digital wallet. The whole process is automatic — no human approves it.

---

## How do you cash out?

**Step 1 — Lock your solUSD.**
You tell the program you want to redeem. Your solUSD tokens are moved into a locked holding area (called an escrow). You cannot spend them while they are there, but they have not been destroyed yet.

**Step 2 — The wire goes out.**
The automated service sees that you locked your tokens and initiates a bank wire to your registered bank account.

**Step 3 — Tokens are destroyed.**
Once the wire is confirmed as sent, the program permanently destroys the locked tokens. The dollar amount has moved from the reserve bank account to your personal bank account.

**What if something goes wrong?**
If the wire fails for any reason, your tokens are automatically returned to your wallet — nothing is lost. If the system goes silent for 72 hours without any response, you can reclaim your tokens yourself, no permission needed.

---

## How do you know the dollars are really there?

A service called an oracle regularly checks the actual bank balance and reports it to the solUSD program. This happens at least every 24 hours.

The program compares the reported bank balance to the total number of solUSD tokens in circulation. If the bank balance is ever lower than the number of tokens, the program automatically stops allowing new tokens to be created. Minting is halted until the balance is corrected.

This means it is mathematically impossible for there to be more solUSD in circulation than dollars in the bank — the code enforces it automatically.

Anyone can look at the solUSD program at any time and see the reported reserve balance and the total tokens in circulation. It is public.

---

## Who controls it?

No single person controls solUSD. Admin actions — like changing fees, pausing the system, or withdrawing collected fees — require approval from multiple people simultaneously. This is called multi-signature control, and it works like a safe that requires more than one key to open.

There are three types of administrative access:

| Role | What they can do |
|---|---|
| **Protocol Authority** (multi-sig group) | Change fees, update limits, pause/unpause, freeze/unfreeze accounts, withdraw fees |
| **Minting Service** | Approve new tokens after a deposit is confirmed; approve redemptions after a wire is sent |
| **Emergency Guardian** | Immediately pause all activity in a crisis — but cannot unpause alone |

The Emergency Guardian is a single person with one specific power: a panic button. They can stop everything instantly if something looks wrong. But they cannot restart it — that requires the multi-sig group. This means one compromised key cannot be used to resume a paused system and drain funds.

---

## What safety features does it have?

**Pause**
The entire system can be paused instantly. No new tokens can be created, and no redemptions can start. Existing locked redemptions are unaffected — users can still claim refunds after 72 hours.

**Freeze**
A specific wallet can be frozen. A frozen wallet cannot send or receive solUSD. This is used to comply with legal requirements, such as a court order or law enforcement request. A frozen wallet can be unfrozen.

**Blacklist**
A wallet can be permanently blacklisted. This is a one-way action — there is no un-blacklist. It is reserved for wallets confirmed to be associated with fraud or illegal activity.

**Reserve check**
Before every single token creation, the program checks that the bank balance reported by the oracle is greater than or equal to the number of tokens already in circulation plus the new tokens being created. If not, the transaction is rejected automatically.

**Stale data check**
If the oracle has not reported a new bank balance within the allowed time window (currently 24 hours), the program stops accepting new deposits. This prevents the system from operating on outdated information.

**72-hour escape hatch**
If a user locks their tokens for redemption and the automated service never responds — due to a bug, outage, or any other reason — the user can reclaim their tokens after 72 hours without needing permission from anyone.

---

## What does the fee pay for?

A small fee (0.30%) is charged when tokens are created. This covers the cost of operating the banking infrastructure, the automated services, key security hardware, and ongoing development. The fee is visible on-chain — anyone can see how much has been collected and how much has been withdrawn.

---

## What solUSD is not

- **Not a bank.** solUSD does not pay interest. The dollars in reserve earn nothing for token holders.
- **Not an investment.** One solUSD will always be worth one dollar. It is not designed to go up in value.
- **Not anonymous.** All transactions are recorded permanently on a public network. The wallet addresses involved in every transaction are visible to anyone.
- **Not available in multiple currencies yet.** The current version supports US dollars only.
