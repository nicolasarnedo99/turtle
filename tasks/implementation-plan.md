# Turtle MVP implementation plan

## Current authorization — 12 September 2026, manual round trip

Completed at 07:09 UTC. Both transactions finalized and the one-buy
authorization is consumed. See tasks/manual-roundtrip.json and the top of
tasks/todo.md for hashes, balance changes, recovery details, and checks.
Automatic purchases remain disabled. QVAC diagnosis has not resumed.

Nico explicitly authorized authenticated browser verification, the live
transaction engine, and one 0.10 test USDC buy followed by redemption of the
resulting synthetic tokens on the existing Arc setup. This supersedes the
intervening preparation-only scope. Enforce policy, reserve, receipts, and
durable tracking. Keep automatic purchases disabled while classification
is blocked. No duplicate workers, blind retries, commits, or pushes.
Checkpoint before returning to QVAC diagnosis. See tasks/todo.md.

Status: implementation approved in the interactive session; resumed after a requested safe pause. Updated 11 September 2026. This plan supersedes earlier Solana/Jupiter, user-owned wallet, and native iOS proposals. The original Ideaverse idea note remains unchanged. Older remote handoff notes may contain superseded decisions.

## Current execution scope

On 12 September Nico authorized independent backend, safeguards, and UI work
while the QVAC classifier gate remains blocked. Automatic purchases stay
disabled. This supersedes the earlier app-work sequencing gate, not the
mandatory QVAC/NVIDIA acceptance criteria. No live signing or broadcasting
is part of this independent application scope.

## Outcome and constraints

Demonstrate an authenticated, visibly simulated card purchase being classified by an NVIDIA open model running through QVAC, followed by a policy-constrained purchase of an AchRWA synthetic stock-price token on Arc testnet. Show the confirmed transaction and resulting holding. These are testnet synthetic tokens, not backed shares or an investment product.

Building starts Saturday 12 September. Submission closes Sunday 13 September at 18:00 CEST; target submission is 15:00. About 1.5 working days are available. Preserve time for a 2–4 minute, at least 720p video with Nico's own voice, README, AI-use disclosure, and submission. Recheck the event requirements before submitting.

No agent may commit. Nico commits manually with GPG. Do not push to GitHub without new explicit permission. No app code has been implemented under this plan.

## Settled decisions

1. Only Nico's account can use the demo, with real Privy login.
2. The wallet is app-owned and linked to that login. The backend controls signing; this is not a user-owned or self-custodial wallet.
3. QVAC and an NVIDIA open model are both mandatory. Cut UI features before either integration. A failed feasibility gate requires replanning, not a silent substitute.
4. Investment principal is 10% of purchase value, clamped to 0.10–1 test USDC.
5. Daily gross purchase principal is capped at 5 test USDC per Europe/Madrid calendar day. Preserve an additional 1 test USDC balance after worst-case transaction gas.
6. A labeled simulation is acceptable. A simulated payment must still trigger a real testnet transaction.
7. Responsive web is sufficient; desktop preview can be used for the recording. No native iOS package.
8. No delayed automatic purchases. Failures need explicit retry. Possibly submitted transactions must be reconciled before any new attempt.

Future-only: phone-local inference, related-sector investments, ETFs, risk profiles, salary-aware monthly allocation, rebalancing, and actual card settlement integration.

## Remaining gates, ranked

1. **QVAC must actually run the chosen NVIDIA model.** Repository support is not proof that the installed release loads the model on morty. Its CPU-only 4-core, approximately 8 GB machine has limited headroom. Prove loading, structured output, latency, and memory before UI work.
2. **The actual vault call must pass Privy policy and execute.** The reference team's USDC transfer does not prove Turtle's payable `buy` call. Native USDC uses 18 decimals; the ERC-20 interface uses 6. Confusing these can invalidate every amount or policy.
3. **Retries must not duplicate purchases.** A timeout is not a failed transaction. Persist signed bytes before broadcasting, reconcile by hash and nonce, and keep reservations while outcome is uncertain.

The venue is selected, but Turtle's own buy/redeem round trip remains untested. Oracle availability, pause state, and synthetic redemption liquidity remain external dependencies.

## Proposed implementation defaults

These are engineering defaults for approval, not previously answered product questions. Use TypeScript, Vite/React, a small Express API, viem, SQLite, Zod, and Vitest. One backend process owns wallet execution. Serve production frontend and API from the same origin. Pin dependency versions during setup; confirm current SDK signatures before using them.

Run QVAC as a separate loopback HTTP service on port 11435, avoiding Ollama's usual port. Do not expose model inference publicly. No agent framework, tool-calling loop, distributed queue, or second execution worker.

For EUR events, use one explicitly documented, dated demo EUR/USD conversion rate and persist it with each attempt. USD uses identity conversion. Reject other currencies. Use integer arithmetic with an explicit rounding rule, never JavaScript floating-point arithmetic for money. Suggested rule: round converted purchase value down to USDC micro-units, take 10% rounded down, then clamp; convert micro-units to native 18-decimal units for the vault.

Only exact supported-company matches are eligible. Unknown, ambiguous, processor-only, and related-sector merchants produce a visible skip. No invented stock substitution.

## Stage 1: prove both hard dependencies

Run these bounded spikes before building the interface. Checkpoint after 30 minutes on QVAC and 60 minutes on wallet/vault integration. If blocked, report the exact failing requirement and remaining options; do not spend the whole build window repeating the same approach.

### QVAC and NVIDIA

Candidate: NVIDIA Nemotron 3 Nano 4B GGUF, Q4_K_M, approximately 2.84 GB weights. Confirm the exact repository artifact, license, model revision, checksum, and QVAC backend version. Engine source has `nemotron-h` support, but release compatibility is unverified.

Configure a small context, approximately 2048 tokens, and preload the model. Verify the installed CLI's flags before starting its OpenAI-compatible HTTP server. Call `/v1/chat/completions` with a pinned model alias and strict JSON schema. Disable reasoning output if supported and use a bounded output budget. Reject truncated or invalid output.

The model sees the merchant string and the five supported companies. It returns a company enum or null plus a short explanation. It never selects addresses, amounts, transaction data, retries, or keys. Do not send bank credentials, card identifiers, or unnecessary payment data to inference.

Gate: 20 fixed cases spanning all five companies, unknowns, ambiguity, Spanish merchant text, and prompt injection. Require valid schema for every result, correct positive cases, and zero purchases on negative cases. Record cold load, warm p95 latency, and memory. Target warm p95 at most 10 seconds, with a 15-second request timeout. Failure requires an explicit replan while retaining both mandatory technologies.

### Privy wallet and Arc vault

Use the existing server-side Privy credentials without printing or copying them into documentation. Create one app-owned Ethereum wallet with a restrictive policy attached, and persist its ID and address. Do not create another wallet on each login or restart. Verify current wallet-owner defaults before creation.

Arc testnet chain ID: `5042002`.

RWAVault: `0xb8dc1f767167b567227326D8849175a188A0e78C`.

Oracle: `0x76398cfa526D4a76EaEC0c4709d6B7C966E5ABdB`.

USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`.

Use the documented Arc testnet RPC and verify `eth_chainId` before signing. Read balances and receipts from Arc, not Privy's unsupported-chain indexing. Broadcast on the server to avoid browser RPC CORS dependencies.

Supported pair IDs: Apple 1, Alphabet 2, Microsoft 6, Tesla 7, NVIDIA 9. Resolve and verify each full synthetic-token address against the onchain registry; never rely on an abbreviated address or symbol alone.

`buy(uint256 pairId,uint256 minSynth)` is payable and consumes native USDC with 18 decimals. It does not require ERC-20 approval. `quoteBuy` returns output, fee, price, and staleness information. Current verified source charges 30 basis points. Synthetic tokens use 18 decimals. Read actual active/pause/oracle state and simulate before signing.

Suggested demo slippage bound: `minSynth = quotedSynth * 995 / 1000`, rounded down; never zero. This bounds execution relative to the quote, not correctness of the oracle's market price. A recently updated keeper timestamp does not establish a live weekend stock price.

Prepare nonce, gas, and fees with viem. Privy signs using `eth_signTransaction`; the backend broadcasts the signed transaction using `sendRawTransaction`. This is the primary integration, not a fallback. Do not copy an `eth_sendTransaction` flow that assumes Privy broadcasts on Arc.

Attach one policy containing narrowly scoped rules. For buys, constrain chain ID, vault destination, decoded `buy` method, allowed pair IDs, and native value at most 1 USDC. Verify the policy API's exact ABI decoding and field support. A separate restricted redeem rule may be needed for the round-trip test; do not allow every vault method. Backend checks are still required for total daily limits and reserve balance.

Policy gate: valid buy signing succeeds. Wrong chain, destination, method, pair, and excessive value each return an actual `policy_violation`. A network error or malformed request does not count as a passing rejection test. If policy expressiveness cannot enforce required restrictions, stop and report it.

After Nico funds the new wallet, execute a 0.10 test USDC buy and a small redemption. Verify successful receipts, expected token balance changes, and USDC accounting including fees and gas. Redemption has its own fee and reserve requirements. The vault owner can withdraw reserve under emergency conditions; do not claim production-grade backing or guaranteed redemption.

## Stage 2: authenticated event intake

Use Privy login and server-verified access tokens. Pin Nico's allowed Privy user ID out of band; never let the first caller claim ownership. Reject other users even when their tokens are valid. Link the configured app wallet to this allowed account server-side, not through a client-supplied wallet ID.

The simulation button calls an authenticated endpoint. Optional Apple Wallet Shortcut uses a separate high-entropy bearer credential bound to the same account. Source labeling comes from the endpoint, not an arbitrary client field. Rate-limit intake and keep secrets out of logs.

Event fields: stable UUID, merchant, positive decimal purchase amount, supported currency, and event timestamp. Persist the validated event before returning `202 Accepted`; this means received, not invested. UI polls its execution status.

Same event ID and same payload return the existing result. Same ID with changed payload returns a conflict. This prevents duplicate processing of one event ID, not every possible duplicate notification for a physical card payment.

Apple Wallet automation is optional and time-boxed after the core path works. Test what fields the selected Revolut Mastercard supplies. A tap notification is not issuer settlement confirmation. If useful fields are absent, use labeled simulation; do not infer access to Revolut or Mastercard payment webhooks.

## Stage 3: durable execution and explicit retry

Keep events, execution attempts, reservations, and transaction identities in SQLite. Enforce uniqueness in the database. Serialize execution for the single wallet so concurrent requests cannot share a nonce or overspend a cap.

Minimal states: received, classifying, skipped, preparing, signed, submitted, confirmed, reverted, needs_retry, uncertain. Record concise failure reasons. Distinguish “classification skipped” from “execution failed.”

For an eligible event:

1. Validate and classify. Unsupported merchants stop without signing.
2. Calculate principal in code. Acquire the wallet execution lock. Check daily principal, outstanding reservations, fresh balance, contract status, oracle state, and quote.
3. Estimate gas and require `balance - principal - maximumGasCost >= 1 USDC`. The daily cap includes gross `msg.value`, including the vault fee, but excludes gas. Pending reservations count. Redemptions do not replenish the daily purchase allowance.
4. Persist the reservation, budget day, nonce, immutable transaction fields, and attempt identity before requesting a signature.
5. Persist signed bytes and their locally computed transaction hash before broadcasting. Keep this data private and out of application logs.
6. Broadcast those exact bytes. Confirm with a successful receipt and the expected synthetic-token mint or balance delta. A returned hash alone is not success.

Record the Europe/Madrid budget day when reserving an attempt. Outstanding reservations from earlier days also constrain available capacity. Any uncertain wallet transaction blocks new buys until reconciled. This prevents midnight rollover from bypassing unresolved exposure.

On a definite pre-broadcast failure, release the reservation and require explicit retry. A reverted receipt releases principal, but consumed gas remains spent. On an ambiguous signing/broadcast outcome, keep the reservation and reconcile transaction identity before authorizing a new attempt. Do not build a new transaction with a new nonce merely because a request timed out.

After restart, reconcile signed/submitted/uncertain attempts. Unprocessed or unsigned work becomes `needs_retry`, not an automatic delayed purchase. Read-only reconciliation may run automatically. Any rebroadcast requires explicit user retry and uses identical signed bytes; no automatic replacement, gas bump, or requote. If transaction outcome cannot be established, fail visibly and keep buying blocked.

Provide an authenticated pause control that prevents new signing/broadcasts. It cannot reverse a transaction already submitted. The app-owned credential holder can alter policies; do not claim policies protect against a malicious backend administrator.

## Stage 4: smallest useful interface

Use the Crumbs reference and existing visual concept: white background, light mint sections, forest-green actions, simple green turtle mark. Implement the mark as a small SVG; animation is optional.

Required screens can be one page: Privy login, app-owned wallet/address and balance, simulation form, execution activity with failure/retry state and explorer link, and confirmed holdings. Display “Arc testnet · synthetic tokens · simulated purchase” where appropriate. Show the model's short explanation without exposing internal reasoning.

Cut onboarding portfolios, charts, elaborate animation, mobile packaging, push notifications, multiple accounts, sell UI, and real card automation before cutting execution verification or QVAC/NVIDIA. Keep redemption as a developer verification script rather than a user-facing feature.

## Acceptance tests

The submission is ready only when all four criteria pass:

1. **Real model judgment:** recorded evaluation proves the pinned NVIDIA model runs through QVAC and returns schema-valid supported-company matches or skips. Demonstrate at least one supported and one unsupported merchant live. No deterministic matcher masquerades as inference.
2. **Real constrained execution:** authenticated simulated purchase produces the deterministic 10% clamped amount, an actual Privy-signed Arc transaction, successful receipt, and expected holding. Negative policy tests prove forbidden transactions cannot be signed under the configured policy.
3. **No duplicate or out-of-budget buy:** tests cover repeated IDs, conflicting payloads, simultaneous events, cap boundaries, reserve plus gas, restart after signing, and RPC timeout after broadcast. Assert transaction counts and reservations, not just HTTP status. No automatic delayed purchase occurs after failure.
4. **Usable and honest demo:** only Nico can access the app; desktop recording shows login, simulation label, classifier decision, pending state, confirmed transaction link, and resulting holding. Unsupported merchant visibly skips. README explains app ownership, testnet synths, model/runtime versions, setup, limitations, and AI assistance.

Additional regression cases: zero/negative/malformed amounts; 0.10 and 1 USDC clamp edges; fixed-rate EUR conversion; Madrid midnight; stale oracle; paused/inactive pair; invalid JSON; inference timeout; reverted receipt; insufficient gas; explicit retry with unresolved transaction; and rejection of another valid Privy user.

## Work budget and handoff

Budget approximately 8–10 focused hours plus submission buffer. Treat this as a ceiling for scope, not a guarantee: hard-dependency spikes 1.5–2 hours; event/execution core 2 hours; model integration and tests 1.5 hours; minimal UI 1 hour; deployment and failure tests 1 hour; recording, README, and submission 1–1.5 hours. Parallelize independent spikes only with isolated file ownership. Stop after two failed repetitions of an approach and replan.

Use Astra at medium reasoning for integration and execution-state work. Escalate effort for a concrete unresolved policy or race-condition problem, not every file. A smaller coding model can handle isolated styling after the API contract is stable. The coding model is separate from the mandatory NVIDIA runtime model.

Local repo: `/Users/nicolasarnedo/turtle`. Remote repo: `/home/nico/turtle` on `morty`. Remote Node, Codex CLI, `codex-vibecode`, and a `turtle` tmux session were prepared earlier. QVAC is not yet installed or proven. Remote handoff files are older than this plan.

For transfer, inspect both working trees first. Copy only reviewed source and this plan without deletion; exclude `.env`, database files, logs, models, and `node_modules`. Preserve remote credentials. Install dependencies on Linux from the lockfile. Do not copy macOS native modules. If migrating execution state, stop both workers and take a consistent SQLite backup before transfer; never copy a live database without its consistency guarantees. Run only one funded-wallet worker at a time.

## Manual actions Nico still owns

- Rotate the Privy secret pasted in chat, then update local and remote `.env` privately. Gitignore does not undo chat exposure. Never paste the replacement into the plan or logs.
- Complete Privy login configuration for the actual local/remote origin, log in once, and pin the allowed user ID out of band.
- Transfer test USDC from the personal wallet to the newly created app wallet after its address is verified. Funding 5 USDC leaves less than 4 USDC available for buys after the reserve and gas; fund more than 6 USDC to exercise a full 5 USDC day safely, with gas headroom.
- Complete remote Codex device login if needed. Verify phone access to morty before leaving; no GPG key transfer is needed.
- Optionally configure and trigger one Apple Wallet Shortcut. Skip it if field availability threatens the core demo.
- Make incremental signed commits manually, record narration, and submit. Nothing is pushed without explicit permission.

The faucet funds previously verified belong to Nico's personal wallet, not the still-to-be-created app wallet. Existing `.env` files do not establish that Privy authentication or wallet signing has been tested.

## Primary references

- [AchRWA overview](https://docs.achswap.app/achrwa/overview/), [supported assets](https://docs.achswap.app/achrwa/supported-assets/), and [vault verified source](https://testnet.arcscan.app/api/v2/smart-contracts/0xb8dc1f767167b567227326D8849175a188A0e78C). Contract state must be rechecked at execution time.
- [Privy transaction signing](https://docs.privy.io/api-reference/wallets/ethereum/eth-sign-transaction), [wallet creation](https://docs.privy.io/api-reference/wallets/create), [Ethereum policies](https://docs.privy.io/controls/policies/example-policies/ethereum), and [idempotency](https://docs.privy.io/api-reference/idempotency-keys). Provider idempotency does not replace durable application reconciliation.
- [Owed reference implementation](https://github.com/shariqazeem/owed). Reuse the signing/broadcast pattern, not its transfer-specific policy or generic-error rejection test. Preserve license attribution if copying code.
- [QVAC HTTP server](https://docs.qvac.tether.io/cli/http-server/), [system requirements](https://docs.qvac.tether.io/system-requirements/), [NVIDIA model](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-GGUF), and [backend architecture source](https://github.com/tetherto/qvac-fabric-llm.cpp/blob/master/src/models/nemotron-h.cpp).
- [Astra model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra) and [Crumbs design reference](https://crumbs.family/).
