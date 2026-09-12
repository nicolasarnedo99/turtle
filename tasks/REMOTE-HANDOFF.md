# Turtle remote preparation, 11 September 2026

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
