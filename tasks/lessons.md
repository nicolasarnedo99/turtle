# Lessons
- 2026-09-11: The implementation plan supersedes older chain, ownership, login, and native-app proposals below. Arc testnet AchRWA synthetic tokens are explicitly selected; QVAC and NVIDIA are mandatory. Treat the remote handoff as history.
- 2026-09-11: Verify the user's intended chain before optimizing execution. Arc is preferred; Hedera is acceptable only with a verified live stock venue. Do not silently substitute mock stocks or Solana.
- 2026-09-11: Card-event access and native presentation are separate dependencies. Resolve stock availability, wallet control, execution, and payment input before building the app.
- 2026-09-11: Nico explicitly deferred Privy secret rotation until after submission. Do not reintroduce it as an implementation gate; keep credentials private.
- 2026-09-12: A fresh preparation-only instruction overrides saved implementation and chain approvals. Preserve prior evidence, but put current gates above historical resume instructions before continuing.
- 2026-09-12: Test buy and redemption signatures separately. viem decodes RLP zero value as undefined; normalize only numeric zero before comparison, preserve every other immutable-field check, and recover with the exact saved bytes.
