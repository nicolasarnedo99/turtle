# Turtle remote preparation, 11 September 2026

## Current priority — funding and Apple Wallet notifications

Nico superseded classification-first ordering and authorized prioritizing
funding and purchase-notification flows, confirming Apple Wallet Shortcut
intake. Preserve the existing wallet and completed transaction history.
Automatic purchases remain disabled. Check listeners before starting any
service. Current scope and verification are at the top of tasks/todo.md.

Funding and Shortcut intake are implemented and verified: 110 backend
tests, 11 browser tests, typecheck/build passed. Existing wallet still holds
9.993153889999999688 test USDC at the 08:02:42 UTC read. Production runs on
127.0.0.1:4173, PID 1005929; QVAC is stopped. Protected-route rejection and
wallet/history preservation were checked after the additive storage change.
No live transaction or production Shortcut token was created. Phone setup,
actual card fields and delivery need Nico's verification using
tasks/apple-wallet-setup.md. Automatic purchases remain disabled.

## Current authorization — direct relationships, 12 September 2026

Nico authorized one 30-minute QVAC/NVIDIA investigation, at most two
candidates, with caching disabled. Clarify direct YouTube/Alphabet and
Tesla service ownership, preserve the original tests, and add held-out
paraphrases and unrelated repair/video merchants. Require zero false
eligible decisions and every original positive correct. No transactions
or automatic execution. Report results and stop within the budget; see
the top of tasks/todo.md for the fixed prompts and held-out protocol.

Completed and stopped within budget after two candidates. Both correctly
classify all ten original positives and eight held-out positives, but A
has six false eligible decisions and B eighteen. Neither passes. No
integration or transactions were attempted; SDK workers are closed.
Evidence and remaining blocker: tasks/qvac-relationships.md.

## Current authorization — classifier diagnosis, 12 September 2026

Nico authorized diagnosing QVAC/NVIDIA classification and, once its gate
passes, integrating it with existing durable execution and testing offline.
This supersedes the preparation-only scope below. Preserve the existing Arc
wallet and transaction history. Automatic live purchases stay disabled until
offline end-to-end tests pass and Nico separately approves enabling them.
No new live transactions, unrelated UI work, commits, or pushes. Current
progress and the bounded investigation are at the top of tasks/todo.md.

Diagnosis checkpoint: stopped after two failed full candidates. Disabling
the SDK cache fixes the demonstrated cache-path failure but the unchanged
prompt passes only 18/20. A second explicit rejection prompt passes every
negative and skips two supported merchants, also 18/20. No integration or
third candidate was attempted. SDK workers were closed; see
tasks/qvac-diagnosis.md for raw evidence and the next manual action.

## Current authorization — preparation only, 12 September 2026

Nico's latest instruction restores preparation-only scope. It supersedes
the saved implementation and chain approvals below for future work. App
implementation and chain selection require explicit authorization. Preserve
the existing Arc setup and completed round-trip evidence without treating
either as permission for another transaction.

The current review covered documentation and local listeners only. Neither
4173 nor 11435 has a listener. No service was started or stopped, no app code
changed, and no wallet API, signing, broadcast, or provisioning was invoked.
QVAC/NVIDIA classification remains blocked by the saved negative-case
failures. The cached-versus-uncached comparison remains a proposed isolated
investigation, not an executed third attempt. See the top of tasks/todo.md.

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

Historical record, superseded by `implementation-plan.md` and the current
interactive session. Implementation is now approved, Codex is authenticated,
and work stays on morty. Both QVAC and NVIDIA are mandatory. Use Arc testnet
AchRWA synthetic tokens and an app-owned Privy wallet linked to the single
allowed login. Build execution before responsive web UI. No delayed buys.
Stop for funding or unresolved blockers. Never commit or push. The original
notes below are preserved as history, not current instructions.

The user is travelling and wants terminal work and project files on morty for the next four hours. SSH user nico, Tailscale address 100.64.192.8. Project: /home/nico/turtle. Codex 0.154.0 installed under /home/nico/.local; Node 22 and tmux already existed. ChatGPT authentication is pending. Public repository cloned without altering history.

Current request: manual actions and staged plans. Remote CLI setup authorized; app implementation is not yet approved. Do not modify the original vault idea or deadline notes. Never commit, push, amend or rebase. User commits with GPG. No signing keys or authentication tokens copied.

The old Solana/no-UI plan is superseded: Arc first, Hedera only with a verified live stock venue, app last. User explicitly selected "Hedera only if a live stock venue is verified" when asked about inaccessible Arc stocks. Do not infer approval for mock stocks, Solana, or cross-chain simulation.

Resolve: stock venue, Privy wallet, agent execution, purchase-event input, iPhone interface. Stock contract, backing, eligibility and executable liquidity must all be established. Arc public mainnet launches September 16, after September 13 18:00 CEST submission. Private Arc access and a stock venue are not established. Hedera Swarm stock support is announced, but issuer-verified deployed contract plus executable weekend quote remains unverified. Swarm public asset and contract registries inspected list Ethereum/Polygon. SaucerSwap stock-named tokens do not establish issuer backing.

Privy custom EVM support does not prove backend broadcast on Arc/Hedera. Test managed send; fallback is Privy eth_signTransaction and explicit RPC broadcast, preserving wallet ownership and policy. Arc testnet chain 5042002, native USDC gas (18 decimals) and ERC-20 interface (6 decimals). Hedera mainnet 295, testnet 296, gas in HBAR. HTS associations and compliance depend on asset.

Card purchase is performed using existing card; Turtle agent executes a subsequent investment from prefunded wallet. No bank-card charging or merchant-payment API is established. Apple Wallet Shortcuts detects taps, not issuer settlement; Spanish card fields remain untested. Simulator must be explicitly labeled if used.

Confirmed design reference: https://crumbs.family/ . White, pale green, simple green turtle drawing with subtle animation. App last. Paid Apple Developer membership and iPhone SSH-client access are still unanswered. Native Privy Expo requires a development build; do not promise Expo Go. PWA is a conditional delivery alternative.

No vendor messages or financial transactions authorized. Wait for chain venue evidence and plan approval before app work. Preserve small budget and source labels.

## Primary references

- Arc launch: https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026
- Arc assets: https://docs.arc.io/arc/references/contract-addresses
- Swarm Hedera: https://swarm.com/swarm-enables-compliant-stocks-on-hedera/
- Swarm registry: https://docs.swarm.com/reference/authorized-assets
- Swarm deployments: https://docs.swarm.com/reference/smart-contracts
- Swarm onboarding: https://docs.swarm.com/core-concepts/passport
- Privy chains: https://docs.privy.io/wallets/overview/chains
- Privy sign API: https://docs.privy.io/api-reference/wallets/ethereum/eth-sign-transaction
- Apple trigger: https://support.apple.com/guide/shortcuts/transaction-trigger-apd65c67538a/ios
- Privy Expo install: https://docs.privy.io/basics/react-native/installation
- Native starter: https://github.com/privy-io/examples/tree/main/privy-expo-starter
- PWA starter: https://github.com/privy-io/examples/tree/main/examples/privy-react-pwa
- Codex login: https://learn.chatgpt.com/docs/auth

## Phone continuation

Connect via Tailscale and SSH. Run /home/nico/.local/bin/codex login --device-auth and complete browser login personally. Do not paste tokens into chat.

Then run:
    cd /home/nico/turtle
    tmux new-session -A -s turtle
    /home/nico/.local/bin/codex-vibecode

Launcher preserves scrollback, uses workspace-write sandbox with on-request approvals, and skips learning exercises for phone sessions. Use codex-vibecode resume --last after a CLI exit. Closing SSH leaves tmux running. No autonomous four-hour job has been launched.
