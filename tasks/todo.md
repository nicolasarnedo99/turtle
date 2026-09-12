# Turtle preparation

## Verified manual round trip — 12 September 2026, 07:09 UTC

The authorized round trip is complete. Its one-buy authorization is consumed;
no further buy or redemption is pending. Automatic purchases remain disabled.
Nico confirmed real browser login; the server independently verified the
pinned Privy user and successful authenticated wallet API access. Browser
appearance was not inspected through Nico's session.

Bought Apple pair 1 with 0.10 test USDC, nonce 0, finalized block 61694020:
`0xa49d1bf52aafa0a6fe750f65d64f984e0e49f83cffc16be02d4e0fd559103f20`.
Minted exactly 300057182411893 synth units, or 0.000300057182411893 tokens.
Native balance changed from 10 to 9.896733088 test USDC, including gas.

Redeemed that exact minted amount, nonce 1, finalized block 61694270:
`0x4d38d417cb4e8f3155804dddee3eebc8ae459a21030e29f6bbf99525486abd79`.
Received 0.099400899999999688 test USDC before redemption gas. Final native
balance is 9.993153889999999688; synth balance returned to zero. Total native
cost was 0.006846110000000312 test USDC, including both fees, gas and rounding.
The 1 test-USDC reserve held throughout. Gross daily buy principal remains
0.10 test USDC; redemption does not restore that allowance.

Redemption signature validation initially stopped before broadcast because
viem represents an RLP zero value as undefined. A failing regression proved
the issue; normalizing numeric zero fixed it without weakening any other
field check. Recovery revalidated live policy, nonce, original minimum, gas,
venue and reserve, then broadcast the original saved bytes once. No second
signature, changed nonce, changed fees, or changed minimum was used. Each
transaction needed one read-only reconciliation after its initial receipt
check. Both receipts, vault events, mint/burn events, finalized blocks, and
historical native/synth deltas were verified.

Current evidence is in tasks/manual-roundtrip.json. Private bytes remain in
data/execution.sqlite; never-broadcast spike fixtures were untouched. A fresh
read at 07:09:32 UTC found latest/pending nonce 2, zero synths, unchanged live
policy, and the final native balance above. SQLite contains exactly two
confirmed attempts and no execution lock. The shared file lock is absent.
One application listener remains on 127.0.0.1:4173, PID 995101; no QVAC listener
or funded execution worker remains.

Verification: 85 backend tests, 3 browser tests, TypeScript and production
build passed. The browser suite uses its existing isolated auth stub; the
real login proof is Nico's confirmation plus production API verification.
The production build retains its existing dependency chunk-size warning.
No commits or pushes were made. QVAC diagnosis has not resumed.

Remaining gate: mandatory QVAC/NVIDIA classification still fails negative
cases. The manual engine is isolated from simulated events; no event is
queued for delayed execution. Classification integration and submission
materials remain future work. Checkpoint complete before QVAC diagnosis.

## Current authorized execution — 12 September 2026

Nico explicitly authorized browser verification, a durable manual engine,
and one 0.10 test USDC buy and redemption on the existing Arc setup. This
supersedes the preparation-only checkpoint below. Automatic purchases remain
disabled. Use Apple pair 1, the previously policy-tested positive fixture's
asset; never broadcast that fixture. Preserve the existing wallet.

Scope budget: 60 minutes for the engine and adapter, 20 minutes for browser
evidence, then one reviewed round trip and checkpoint. Stop on uncertain
transaction state; no blind retries or duplicate workers. Read-only receipt
checks are bounded to 12 checks per transaction at five-second intervals.

- [x] Verify current code, wallet policy, balance, nonce, and venue state
- [x] Verify the real authenticated browser session
- [x] Implement and test durable manual execution and recovery
- [x] Execute one 0.10 test USDC buy and redeem its exact output
- [x] Record hashes, verified balance changes, and remaining gates


## Current preparation checkpoint — 12 September 2026

Scope: one documentation and local-state review, capped at 15 minutes.
Success means the current gates are explicit, prior evidence is preserved,
and the next feasibility investigation is concrete without app changes.
Nico's latest preparation-only instruction supersedes historical approvals
below. App implementation and chain selection require explicit authorization.
No signing, broadcasting, provisioning, or application restart is in scope.

- [x] Read coding rules, skill map, and profile Parts I and III
- [x] Review saved handoffs and reconcile current authorization
- [x] Check local service listeners and prepare the next investigation
- [ ] Resolve the app implementation and chain selection gates

Local inspection found no listeners on ports 4173 or 11435. The earlier
running-server checkpoint is historical. Wallet balances and transaction
state were not queried again; the last saved check is not a fresh balance.

The saved QVAC evaluations failed all ten negative cases on both attempts.
The next proposed feasibility investigation is a 30-minute isolated spike:
inspect the installed SDK's cache controls, compare identical inputs through
cached HTTP and uncached SDK execution with the same pinned NVIDIA model,
and change only the cache path. Start with a known positive, an unknown
merchant, and a prompt injection. Only if that discriminates the hypothesis,
repeat the unchanged 20-case acceptance set and record cold load, warm p95,
and memory. Stop after two failed repetitions; no deterministic substitute
or wallet access. This is a prepared replan, not an executed third attempt.

Saved remaining blockers are real authenticated browser login, durable
transaction reservations and recovery, and a verified buy/redeem round trip.
Those app and execution steps remain gated. Existing wallet state and
never-broadcast signing fixtures must be preserved. No app files changed,
no services started, and no transactions were signed or broadcast here.

## Historical checkpoints

- [x] Review the plan and current API documentation
- [x] Install Codex CLI on morty
- [x] Clone Turtle on morty
- [x] Verify the phone launcher
- [x] Complete ChatGPT login on morty
- [x] Select Arc testnet AchRWA synthetic tokens
- [x] Approve the staged implementation plan

- [ ] Prove QVAC runs the NVIDIA model on morty
- [ ] Verify Privy policy restrictions and Arc vault execution
- [x] Fund the verified app wallet
- [ ] Build authenticated event intake and durable execution
- [ ] Verify retries, limits, reservations, and restart behavior
- [ ] Build the minimal responsive interface
- [ ] Prepare the verified demo and submission materials

Implementation approved in the interactive session on 11 September 2026.
`implementation-plan.md` is authoritative. Work only on morty, execution
before UI. Stop for wallet funding or unresolved blockers. Never commit or
push. Initial feasibility checkpoints are 30 minutes for QVAC and 60 minutes
for Privy/Arc; stop after two failed repetitions of an approach.

## Paused checkpoint — 11 September 2026

Nico requested a safe pause and session restart. Do not resume automatically.
Implementation remains approved when Nico resumes: QVAC/NVIDIA feasibility
and Privy/Arc policy verification first, execution before UI. Stop for wallet
funding or unresolved blockers. Never commit or push. Work only on morty.

Completed in this session: read coding-rules.md, skill-map.md, the current
implementation plan, and historical handoff; reconciled the remote task
records without deleting history. Codex authentication is already complete.
Nico explicitly deferred Privy secret rotation until after submission; this
supersedes the plan's rotation prerequisite. Never print .env or credentials.

QVAC CLI 0.13.0 is installed locally under spikes/qvac with a package lock.
Resolved SDK 0.19.1 and llm-llamacpp backend 0.49.1. CLI serve flags and model
configuration types were inspected. Morty has four AMD EPYC CPU cores,
7745 MiB RAM, approximately 6552 MiB available at inspection, and no swap.
Downloaded the NVIDIA Q4_K_M artifact (2837072864 bytes) into ignored data/models.
Repository: nvidia/NVIDIA-Nemotron-3-Nano-4B-GGUF.
Revision: ba223d14e45525f7fae81db77ea8cabeb2fc6c25.
File: NVIDIA-Nemotron3-Nano-4B-Q4_K_M.gguf.
Verified SHA-256: be5d9a656a51922f24f1f09a759cebb694e1f5d9728bf0ef9f8c972c5a0b5ef2.
The model's custom NVIDIA license still needs explicit review.
spikes/qvac/qvac.config.json selects CPU, 2048 context, one slot and disabled
reasoning. Configuration is prepared, not proven: no model server was started,
no model load or inference ran, and the 20-case evaluation is not yet written.
Installation and download processes completed; no QVAC service was launched.

Privy/Arc read-only work and scripts live under spikes/privy-arc; see
tasks/privy-arc-feasibility.md for the delegated checkpoint. No Privy policy
or wallet was created, no transaction was signed or broadcast, and no funds
were moved. No UI or application execution code was built.

Critical plan correction found in the saved onchain registry: Tesla is pair
7, not pair 8. Pair 8 is Natural Gas. The intended five-company allowlist is
[1, 2, 6, 7, 9]. Tesla synth is
0xf1f19cE22Fb971a61B12F9494D100E72F9C3956E.
Evidence: spikes/privy-arc/registry.json, cross-checked during checkpoint.
The authoritative implementation plan is not edited at this pause; reconcile
its Tesla ID before any policy creation or signing. Never authorize pair 8.

## Resume order

- [x] Read this checkpoint and the Privy/Arc feasibility report
- [x] Reconcile the verified Tesla pair ID in the implementation plan
- [x] Review the pinned NVIDIA artifact license
- [x] Start QVAC on 127.0.0.1:11435 and prove model loading
- [ ] Run 20 fixed classifier cases and measure latency and memory
- [ ] Verify app ownership defaults and exact Privy policy API behavior
- [x] Create and persist one restricted app wallet and test actual policy rejection
- [ ] Stop for Nico to fund the verified wallet address
- [ ] Verify a tiny buy and redemption before building application execution

Start command from /home/nico/turtle after resume:
`spikes/qvac/node_modules/.bin/qvac serve --openai --host 127.0.0.1 --port 11435 --config spikes/qvac/qvac.config.json`

Use a 30-minute QVAC checkpoint and 60-minute Privy/Arc checkpoint; no more
than two failed repetitions before replanning. Preserve 8–10 focused hours
as the implementation scope ceiling, plus the submission buffer described
in the plan. No feasibility success is claimed by this checkpoint.

Environment caveat: sandbox operations failed before execution with
`bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`, including
apply_patch. Approved escalated commands worked. Request normal tool
escalation when needed; do not treat the failed sandbox call as execution.
The profile selector used this session was too permissive and emitted some
extra subsection text. On restart, only select exact top-level PART I and
PART III boundaries; never reopen Parts II or IV.

Subagent shutdown confirmed: privy_arc completed its checkpoint and reports
no live processes or Privy API requests. No policy files were generated.
The saved read-only probe still uses the original pair 8 to preserve the
discovery evidence; correct it to pair 7 and add symbol/category/address
assertions before rerunning. Tesla-specific quote checks remain unverified.

## Resumed

Nico explicitly requested continuation. Resume the approved feasibility gates.
The authoritative plan now uses verified Tesla pair 7. QVAC checkpoint is
30 minutes of active work; Privy/Arc checkpoint is 60 minutes.

## Latest resume — 11 September, 17:44 UTC

Nico resumed with unrestricted tool permissions; omit sandbox escalation.
QVAC first failed because libatomic.so.1 was absent. Installed Ubuntu
libatomic1 14.2.0-4ubuntu2~24.04.1. On the second start the NVIDIA model
loaded successfully through QVAC. The server and Bare child were stopped
cleanly for the intervening pause; resuming evaluation now. No inference
request has run yet. The attempted evaluator write was interrupted and
spikes/qvac/evaluate.py does not exist yet. No cold-load timing was captured.
NVIDIA's pinned card links the NVIDIA Nemotron Open Model License dated
December 15, 2025; reviewed its use and redistribution provisions. Model
weights stay in ignored data and are not included in source distribution.
Allowed Privy user ID remains missing; user was asked and has not answered.

## Stopped at unresolved gates — 11 September, 17:51 UTC

Two bounded QVAC/NVIDIA evaluations completed. Both returned schema-valid
output for 20/20 cases and correct supported-company results for 10/10,
but falsely selected companies for all 10 negative cases, including prompt
injections. First warm p95: 8.8603 seconds; second: 8.7386 seconds. The runtime
loads the model, but classification is unsafe and the feasibility gate FAILS.
No third attempt or application execution work started. QVAC was stopped
cleanly after evaluation. See tasks/qvac-feasibility.md and both JSON reports
under spikes/qvac. Measured process snapshots are in runtime.json; startup
load time has not been measured. Current output explanations also run into
the grammar's character limit, so valid JSON alone is insufficient.

Arc's corrected read-only probe passed all five identities and quotes,
including Tesla pair 7. The plan and probe now use the correct IDs. Privy
credentials passed read-only HTTP 200 preflight; zero wallets were listed.
Concrete policy.json and verify-policy.mjs are prepared, but no policy or
wallet was created and no transaction was signed or broadcast. The script's
missing-user guard was exercised; root reviewed it and suppressed possible
signed-byte exposure from decoder error messages. Live policy tests remain
unverified. The Privy subagent finished; no subagent worker remains active.

Blocked on TURTLE_ALLOWED_PRIVY_USER_ID, which Nico must provide out of band
or set in morty's .env. The pending question has not been answered. Never
infer the owner from the first caller. Secret rotation remains explicitly
deferred until after submission. No commits or pushes were made.

Next work requires a replan for the failed classifier gate: investigate
QVAC's cached system-prompt path against uncached QVAC SDK execution while
retaining the NVIDIA model. This is a hypothesis, not a confirmed defect.
Resolve that gate and the pinned user ID before any funded execution or UI.

## Privy identity supplied

Nico supplied the allowed user identifier. Stored its did:privy form privately
in TURTLE_ALLOWED_PRIVY_USER_ID. Resume only the independent Privy policy
gate, bounded to 30 minutes; classifier remains blocked. No broadcast.

Privy policy replan: the first request failed because rule names exceeded
50 characters. The corrected request failed because uint256 calldata fields
do not support `in` (actual invalid_policy_format). Replace the two membership
rules with ten complete per-pair equality rules, each retaining every chain,
vault, method, value and minimum-output condition. This preserves exactly
the same allowed transactions. Make one bounded attempt with that new shape;
stop if another provider restriction blocks it. Both rejected requests are
recorded privately and created no wallet.

## Privy signing gate passed — 11 September, 18:16 UTC

Nico supplied the allowed user ID; its did:privy form is configured privately
in TURTLE_ALLOWED_PRIVY_USER_ID and verified through the Privy user endpoint.
One unrelated owner-controlled wallet appeared after login. It was preserved;
provisioning now refuses an existing Turtle external ID or app-controlled
wallet while allowing unrelated owner-controlled wallets after full listing.

Created exactly one app-owned wallet:
0xE0025f5afd3FD375e30E8C3679924a499eE926F4.
Private durable state links this wallet to the pinned login. The provider
reports owner_id null, no additional signers, and the exact attached policy.
Wallet ID, policy ID, request keys, and fixture bytes remain in ignored
spikes/privy-arc/.private/. Reuse this state; never create another wallet.

Actual provider restrictions required two corrections: rule names have a
50-character maximum, and uint256 calldata fields do not support `in`.
The accepted policy has ten complete equality rules, one buy and one redeem
per allowed pair, preserving every common restriction in each rule. Two
rejected policy requests were reconciled and archived before changing shape.
No restrictions were weakened. Signing requires hexadecimal fee strings;
the rejected decimal-string fixture was archived before the corrected test.

policy-results.json proves a valid buy fixture signed and its recovered
signer and immutable fields matched. Wrong chain, destination, method, pair
8, excessive value and zero minimum each returned actual policy_violation.
No fixture was broadcast. The deliberately distant fixture nonce is not an
execution nonce; never broadcast these saved fixtures. Only Apple positive
buy signing was exercised, not every pair or the redeem rule.

Arc read-only balance is zero and pending nonce is zero. Stop for Nico to
fund this address on Arc testnet, chain 5042002. Seven test USDC provides room
for the planned cap/reserve tests with gas headroom; never request real funds.
QVAC classification remains blocked as previously recorded. No app execution
or UI built, no live buy or redemption executed, no commit or push.

Next: resolve the QVAC classifier gate, verify funding, then implement the
small buy/redeem round-trip with durable signing/broadcast records. Do not
rerun sign-tests against existing fixtures or clear uncertain state blindly.

## Funding verified — 11 September 2026

Nico reported funding 10 USDC. Read-only Arc RPC verification confirmed chain
5042002 and exactly 10000000000000000000 native units (10 test USDC) at the
persisted app wallet 0xE0025f5afd3FD375e30E8C3679924a499eE926F4. Pending nonce
is zero. Funding blocker is resolved. No transaction signed or broadcast in
this funding check. QVAC classification remains the unresolved gate; keep
execution stopped until that gate is resolved. Recheck balance before use.

## Independent application work — 12 September 2026

Nico explicitly authorized backend, safeguards, and UI work while QVAC stays
blocked. This supersedes the earlier instruction to stop all app work until
classification passes. Automatic purchases remain disabled with no runtime
switch to bypass the failed gate. No signing or broadcasting in this scope.

Process/transaction preflight: no Turtle or QVAC server running; unrelated
services preserved. Arc balance is still 10 test USDC, latest/pending nonce
0, no pending provisioning. The sole signed fixture (nonce 1000000000) has
no receipt and remains marked neverBroadcast; it must never enter execution.
Saved read-only evidence in tasks/transaction-checkpoint.json.

Scope budget: backend and safeguards up to two hours, UI up to one hour,
then integration checks. Root owns UI and project setup; backend agent owns
server and its tests. Build authenticated durable simulated-event intake,
read-only real wallet/holdings, tested money/cap/reservation logic, and an
honest responsive interface showing why execution is blocked. The demo EUR
conversion is fixed at 1.10 USD/EUR dated 2026-09-12, not a market quote.

- [x] Build and test backend intake, authentication, and safeguards
- [x] Build the responsive login, wallet, simulation, and activity interface
- [x] Verify production build, API behavior, and disabled execution
- [x] Save runnable setup and remaining gate instructions


## Runnable paused application checkpoint — 12 September 2026, 06:45 UTC

The independent backend and interface are implemented. The server is running
on morty at http://127.0.0.1:4173, accessible through an SSH port forward.
Use `npm run server` after a restart; build first if source files change.
README.md contains setup and the precise limits of this checkpoint.

Verification: all 30 backend tests and all 3 browser tests passed. The final
TypeScript/Vite production build passed. Desktop and 390px mobile screenshots
were inspected, and measured horizontal overflow was fixed. Browser tests use
an isolated test-only authentication stub and mocked API; they are not live
Privy login verification. The real production login rendered with no page
errors. Live unauthenticated and invalid-token API requests returned 401.
Requests for private paths returned only the SPA HTML, not private files.

The UI preserves an uncertain simulation's UUID and payload in user-scoped
sessionStorage through reload and re-login; explicit retries reuse that ID.
Failed activity reads show unavailable rather than an empty history. Purchases
and purchase retries remain blocked in server code. The application contains
no signing or broadcast path, and no automatic wallet creation is enabled.

A final read-only Arc check at 06:44:49 UTC confirmed chain 5042002, balance
10 test USDC, and latest/pending nonce 0. No funds moved. Existing private
provisioning and signing fixtures were preserved. No commit or push occurred.
The backend agent finished implementation and review; no subagent remains active.

Build limitations: Privy's dependency graph produces a chunk-size warning.
Dependency audit has 23 moderate advisories and no high or critical findings;
no forced dependency downgrade was applied. Test screenshots are ignored under
test-results/, including production-login.png, dashboard.png and mobile.png.

Remaining work:

- [ ] Resolve and re-evaluate the mandatory QVAC/NVIDIA classifier gate.
- [ ] Build durable reservations and transaction attempts, nonce reconciliation,
      receipt handling, and recovery from ambiguous RPC responses. Current
      fixed-point cap/reserve functions are tested but do not reserve funds.
- [ ] Verify the single allowed Privy login in a real authenticated browser.
- [ ] Once execution gates pass, perform the authorized small testnet buy and
      redemption round trip with durable records; never use signing fixtures.
- [ ] Complete submission recording and other plan deliverables.

Automatic purchases must stay disabled. No delayed buys are queued. Secret
rotation remains deferred by Nico until after submission. Recheck running
processes and transaction state before resuming any execution work.
