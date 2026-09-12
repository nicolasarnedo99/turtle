# Turtle

Turtle is a private Arc testnet demo that records simulated purchases and
shows an app-owned wallet and synthetic-token holdings. **Automatic purchases are
disabled.** QVAC loads the selected NVIDIA model, but its merchant classifier
failed the negative-case evaluation. Saving an event records `needs_retry`;
it neither charges a card nor queues a future purchase.

The app currently includes Privy login with a server-enforced user allowlist,
SQLite event storage, duplicate-ID handling, fixed-point allocation math,
read-only wallet balances, a pause control, and a responsive interface.
Unknown users cannot read or submit events. Neither retries nor unpausing can
bypass the classifier block. The app server has no signing or broadcast path. A separate manual CLI
implements the explicitly authorized, one-time Apple buy/redemption check.

## Run on morty

Use Node 22.23.2 or a compatible Node 22 release. From `/home/nico/turtle`:

```sh
npm ci
npm run build
npm run server
```

Open `http://127.0.0.1:4173` through your SSH port forward. Production frontend
and API share that origin. Configure the actual browser origin in the Privy
dashboard. For frontend development, run `npm run dev` in another terminal;
Vite proxies `/api` to the same backend. No public listener is created.

The existing private `.env` must contain `PRIVY_APP_ID`, `PRIVY_APP_SECRET`,
and `TURTLE_ALLOWED_PRIVY_USER_ID`. The allowed ID uses the `did:privy:` prefix.
The public app ID is returned by `/api/config`; secrets and user identifiers
are not bundled into the frontend. Automatic embedded-wallet creation is off.
Never print the environment file or copy it into source control.

Startup reuses `spikes/privy-arc/.private/provision.json`, checks its pinned
user and app ownership, and refuses unresolved provisioning. Preserve this
private state. Do not provision a replacement wallet. The login is linked
server-side; it does not own the signing key. Data lives in
`data/turtle.sqlite`, using WAL and full synchronous writes. Stop the server
before a filesystem backup or use SQLite's consistent backup facilities.

## Current behavior

`POST /api/events` validates a stable UUID, merchant, decimal amount, USD/EUR
currency, and ISO timestamp. The source is always assigned as `simulation`
by the server. A new event returns 202 after persistence; an identical retry
returns 200; a changed payload with the same ID returns 409. The UI stores the submitted ID and payload in user-scoped sessionStorage
before sending. It retains that identity after a network failure, rate limit,
re-login, or reload so an explicit retry of that save cannot create a second
event within the same browser tab session. Closing the tab loses that local
draft, so check activity before re-entering an uncertain event. The API lists the latest 200 events.

Amounts use integer micro-USDC arithmetic. The planned allocation is 10%,
clamped to 0.10–1 test USDC. EUR uses an explicitly simulated rate of 1.10
USD per EUR dated 12 September 2026, not a live market rate. Each stored EUR
event records this rate. The 5 test-USDC daily cap, Europe/Madrid day boundary,
outstanding reservations, and 1 test-USDC reserve after worst-case gas have
unit-tested calculation functions. The separate manual execution engine persists its own reservations and
transaction attempts in `data/execution.sqlite`; simulation events never
enter that engine. Restart marks unsigned unfinished events `needs_retry`.
No delayed buys run on startup or after errors.

## Verification

```sh
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:ui
```

Backend tests cover authentication rejection, durable idempotency, payload
conflicts, invalid amounts and currencies, pause/retry blocking, restart,
rate limits, fixed-point money, cap boundaries, midnight, and reserve/gas
exposure. Browser tests use a test-only Privy stub and mocked API responses
to exercise the interface and uncertain-save retry. They do not claim a
live authenticated end-to-end test. The production build never aliases the
stub. Browser screenshots are written to ignored `test-results/`.

The live Privy policy spike previously verified signing a deliberately
non-broadcast fixture and six actual `policy_violation` rejections. The
signed fixture is private, has nonce 1,000,000,000, and must never be broadcast
or imported into application execution. Ten complete per-pair policy rules
constrain the selected five companies because numeric calldata conditions
support equality but not membership. This is provider-tested policy evidence,
not proof that the application buys or redeems tokens.

## Authorized manual round trip

The one-time live check completed on 12 September 2026: the 0.10 test-USDC
buy and exact-output redemption both finalized. Final balance was
9.993153889999999688 test USDC with zero Apple synths. Full hashes, receipt
and balance evidence are in [the checkpoint](tasks/manual-roundtrip.json).
The authorization is consumed; existing commands cannot create another buy.

The CLI permits exactly one 0.10 test-USDC Apple buy, then redemption of
that buy's exact verified minted amount. It cannot enable automatic buys,
process simulation events, change assets, or reuse signing fixtures. The
wallet, policy hash, live policy, chain, registry, contract bytecode, quotes,
nonce, reserve after maximum gas, and transaction simulation are checked
before signing. Each transaction's maximum gas cost is capped at 0.10 test
USDC, in addition to the 1 test-USDC remaining-balance requirement.

```sh
npx tsx server/manual.ts preflight
npx tsx server/manual.ts prepare
npx tsx server/manual.ts status
```

These commands read chain state or prepare a quote without signing. Real
Privy login through the production browser must produce recent private
`data/browser-verification.json` evidence before either execution command.
That evidence proves authenticated API access, not that someone inspected
the rendered interface; record the user's browser confirmation separately.

```sh
npx tsx server/manual.ts buy
npx tsx server/manual.ts redeem
```

The engine writes intent and reservation before requesting a signature,
then writes signed bytes and their hash before validating and broadcasting.
It verifies finalized receipts, immutable transaction fields, mint/burn and
vault events, nonce changes, and historical native/synth balance changes.
Only the verified buy output can be redeemed. Redemption does not replenish
the gross daily buy allowance. Existing attempts are returned without new
signing or broadcasting; new IDs cannot bypass the one-time authorization.

An uncertain result retains its reservation. Inspect the persisted hash and
start with read-only reconciliation; no command automatically rebroadcasts
or re-signs. Limit receipt checks to 12 per transaction, five seconds apart.

```sh
npx tsx server/manual.ts reconcile authorized-2026-09-12-apple-buy-0.10-v1
npx tsx server/manual.ts reconcile authorized-2026-09-12-apple-redeem-v1
```

If explicit recovery is required, `broadcast-saved` accepts the same saved
attempt ID. It checks for an existing receipt, revalidates live policy,
venue, nonce, reserve, gas, and the original minimum output, then sends the
identical bytes once. It cannot request another signature or change fields.
Use it only after diagnosing the uncertain state, never as a blind retry.

Private raw bytes stay in `data/execution.sqlite`; sanitized hashes and
accounting evidence are in `data/manual-roundtrip.json`. Preserve these and
the existing provisioning state. The CLI shares the provisioning spike's
exclusive `.private/lock` and also holds a SQLite wallet lock during work.
If interrupted, do not delete the file lock blindly: inspect its saved PID
and command, establish that the process is dead and no wallet worker is
running, then reconcile saved attempts before any new action. An old empty
lock has no owner evidence and requires explicit investigation. The engine
can reclaim its own SQLite lock only when the recorded process is dead.

## Remaining gates

QVAC/NVIDIA classification must pass its 20-case evaluation, including
unknown and malicious merchant text. Both technologies remain mandatory.
The independent application work is authorized while that gate stays blocked;
there is no configuration switch that enables purchases.

The manual engine has durable reservations, nonce checks, and read-only
reconciliation after ambiguous signing, broadcast, or receipt responses.
Actual browser and transaction verification results are recorded in
`tasks/todo.md`; implementing the engine alone does not prove a live round
trip. Classification integration and the submission recording remain gated. Arc testnet AchRWA tokens
are synthetic price tokens, not backed shares or a production investment
product. Oracle and redemption liquidity can change. See
`tasks/implementation-plan.md`, `tasks/todo.md`, and the feasibility reports
for current evidence and constraints.

QVAC CLI 0.13.0 uses SDK 0.19.1 and llm-llamacpp 0.49.1 on morty. The model is
NVIDIA Nemotron 3 Nano 4B Q4_K_M at revision
`ba223d14e45525f7fae81db77ea8cabeb2fc6c25`. Model metadata, checksum, license
reference, and failed evaluations are recorded in `tasks/qvac-feasibility.md`.
`libatomic1` is required by the QVAC native worker. Weights stay outside source
control. Solana packages in the dependency graph satisfy Privy React's build
requirements; Turtle still targets only Arc testnet and creates no Solana wallet.

Codex assisted with implementation, tests, and documentation. Nico owns the
project decisions, manual signed commits, recording, and submission.
