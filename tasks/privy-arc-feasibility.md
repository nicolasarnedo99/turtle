# Privy / Arc feasibility checkpoint

Updated 11 September 2026, 17:45 UTC after the user resumed. Implementation is approved. One read-only Privy wallet-list request succeeded; no wallet creation, policy creation, signatures, broadcasts, or funding occurred. The user explicitly deferred the previously requested Privy secret rotation until after submission; this supersedes the rotation prerequisite in the plan. Credentials were loaded privately inside the read-only preflight process; no credential values were printed or saved.

## Verified Arc evidence

`spikes/privy-arc/probe.mjs` ran successfully against `https://rpc.testnet.arc.io` with viem 2.56.3. The snapshot in `arc-readonly.json` records chain ID 5042002 and block 61599487 at 17:23:18 UTC. Both contracts were unpaused and their oracle/vault links matched the plan. All inspected synths had 18 decimals and nonempty matching runtime-code hashes. Fee was 30 basis points. The inspected pairs were active, unfrozen, and their oracle prices were 12 seconds old. All 0.10 native-USDC buy quotes were nonzero; hypothetical half-output redemption quotes reported sufficient reserves. These are read-only quotes, not transaction or round-trip proof. State must be checked again before execution.

**Verified plan correction:** pair 8 is Natural Gas (NATGAS), not Tesla. A full `getAllPairs` registry read, saved in `registry.json`, identifies Tesla as pair 7. The intended company set remains unchanged. Use the verified mapping below, and reject any registry mismatch before signing.

| Company | Pair | Synthetic token |
| --- | --- | --- |
| Apple | 1 | `0xB7d0e4FBB6C31997aeBc8070f9BF326Bb0ef859E` |
| Alphabet | 2 | `0x22Dd732d8bf020d1Cd6D2ec3342ce43f15a982b1` |
| Microsoft | 6 | `0x4fb69F9521b84be62da5dEC21E5e93D8e3fE6204` |
| Tesla | 7 | `0xf1f19cE22Fb971a61B12F9494D100E72F9C3956E` |
| NVIDIA | 9 | `0x8f9A9ac6F16f4677beB730293C8E75694a458084` |

The probe now uses Tesla pair 7 and asserts each pair ID, exact symbol, stock category, full synthetic-token address, active/unfrozen state, 18 decimals, nonempty code, contract links, 30-basis-point fee, fresh nonzero buy quote, and available hypothetical redemption reserve. It passed at block 61600808 at 17:34:41 UTC. `arc-readonly.json` now contains this corrected snapshot including Tesla. One initial fast run hit RPC rate limiting; explicit 350 ms pacing between contract reads resolved it. The failed run did not overwrite the prior snapshot.

Public verified source and ABI were downloaded from [Arcscan vault](https://testnet.arcscan.app/api/v2/smart-contracts/0xb8dc1f767167b567227326D8849175a188A0e78C) and [Arcscan oracle](https://testnet.arcscan.app/api/v2/smart-contracts/0x76398cfa526D4a76EaEC0c4709d6B7C966E5ABdB), saved as `vault-source.json` and `oracle-source.json`. Vault source confirms payable `buy(uint256 pairId,uint256 minSynth)` consumes native 18-decimal USDC without ERC-20 approval. `redeem(uint256 pairId,uint256 synthAmount,uint256 minUsdc)` burns directly without approval. Both charge 0.3%. The source checks active status and price staleness but does not directly check `pair.frozen` in buy; backend must check frozen state too. The owner can withdraw reserve while paused. Keeper freshness is not proof of a live exchange price.

## Privy policy findings, not yet live-tested

The [policy overview](https://docs.privy.io/controls/policies/overview) explicitly supports `eth_signTransaction`, evaluates every condition in one rule conjunctively, and denies actions with no matching rule. Separate ALLOW rules can broaden permissions; use one restrictive buy ALLOW rule. Other RPC methods, key export, and arbitrary vault methods should have no ALLOW rule.

The [Ethereum policy examples](https://docs.privy.io/controls/policies/example-policies/ethereum) expose `ethereum_transaction.chain_id`, `to`, and `value`, plus ABI-decoded `ethereum_calldata.function_name` and named function arguments. Proposed buy rule: chain ID 5042002, exact vault address, `function_name == buy`, `buy.pairId in [1,2,6,7,9]`, native value at most `1000000000000000000`. Require positive value and positive `buy.minSynth` as additional restrictions. All conditions belong to that same rule. A separate equally restricted redeem rule would permit only `redeem`, supported pair IDs, zero native value, and positive amount/minimum output. `prepare-policy.mjs` generated the concrete `policy.json` locally. It has not been sent to Privy or tested live. Daily gross-principal cap and reserve-plus-gas checks remain backend responsibilities.

The [signing API](https://docs.privy.io/api-reference/wallets/ethereum/eth-sign-transaction) accepts snake-case transaction fields including `chain_id`, `gas_limit`, `max_fee_per_gas`, `max_priority_fee_per_gas`, `nonce`, `to`, `data`, and `value`. It returns `data.signed_transaction`. Persist signed bytes privately and compute/store their transaction hash before any broadcast. Never broadcast negative-test or positive-signing-test fixtures; test requests need isolated durable identities and bytes retained for audit/reconciliation. Live negative tests must return actual `policy_violation`, not a transport or malformed-request error.

The [wallet creation API](https://docs.privy.io/api-reference/wallets/create) accepts at most one `policy_ids` entry, a stable `external_id`, and nullable `owner_id`. The [creation guide](https://docs.privy.io/wallets/wallets/create/create-a-wallet) says user `entity` attribution does not grant control and is immutable once set. The [authorization documentation](https://docs.privy.io/api-reference/authorization-signatures) requires owner authorization signatures when owner_id is set. The full Markdown creation guide, saved as `privy-create-doc.md`, includes a Java example that creates a wallet with no owner by supplying only `chain_type`. Together with the authorization-signature requirement only when an owner is set, this documents the intended app-credential-controlled configuration. Do not assign Nico as the wallet owner. Use the single pinned login for server-side linkage (and optional non-controlling user entity attribution).

`preflight.mjs` privately loads the existing morty `.env` using Node's built-in loader. Its only request is `GET /v1/wallets`; it prints and saves only status/count/presence fields. At 17:44:53 UTC it returned HTTP 200, zero wallets, and no next page. `privy-preflight.json` contains this sanitized evidence. `.env` has PRIVY_APP_ID and PRIVY_APP_SECRET but no TURTLE_ALLOWED_PRIVY_USER_ID. **Blocked on the user's out-of-band allowed Privy user ID.** Root has asked for it. No first-caller registration or guessed owner is permitted.

## Resume sequence

1. Completed: Tesla pair 7 correction and exact five-asset current-state probe. Recheck state before signing because quotes expire.
2. Obtain the pinned TURTLE_ALLOWED_PRIVY_USER_ID from Nico before linking the app-owned wallet. Prepare one restrictive policy and one durable wallet creation record. Use stable idempotency/external IDs, inspect existing resources first, and never create a replacement on an ambiguous response.
3. Use existing morty credentials privately, create the policy/wallet only when ownership is settled, then prove valid signing plus wrong-chain, wrong-destination, wrong-method, wrong-pair, and over-value `policy_violation` results. No test-fixture broadcast.
4. Provide verified new app wallet address and stop for funding. After funding, simulate and execute the plan's 0.10 test-USDC buy/small-redemption gate with durable transaction handling.

No background process was started by this spike. Isolated dependencies are in `spikes/privy-arc/node_modules`; package.json and package-lock.json pin viem 2.56.3. No app code or UI was built. Earlier sandbox commands failed with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`; approved escalation was used on morty. Python urllib received Arcscan 403 once; curl successfully fetched the same public oracle source. Do not repeat those failing approaches.


No background process remains from this spike. Latest additions are prepare-policy.mjs, policy.json, preflight.mjs, privy-preflight.json, and the public Privy creation documentation. `verify-policy.mjs` now implements provision/sign-tests commands, but live mutation and signing are untested. It refuses to proceed without the pinned user ID, verifies that user through Privy, records server-side login linkage without assigning user ownership, locks against concurrent runs, fsyncs state before requests, persists stable request keys and signed fixtures privately, and blocks unresolved responses or repeated fixture runs. Its provision request was exercised only with the missing-ID guard and refused before any API call. The separate sign-tests command includes valid buy, wrong chain/destination/method/pair/value, and zero minimum checks, and verifies recovered signer plus immutable transaction fields. Fixture nonce 1,000,000,000 deliberately avoids execution nonces; no broadcast operation exists. All live policy assertions remain pending. Private state is ignored under spikes/privy-arc/.private/.

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
