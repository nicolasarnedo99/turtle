# Apple Wallet Shortcut setup

Turtle now receives card-tap notifications independently of classification.
Purchases remain disabled. These steps run on Nico's iPhone; no real tap or
bank settlement has been verified by the server-side implementation tests.

## Connect once

Open Turtle through the iPhone's existing SSH port forward to
`127.0.0.1:4173` on morty and sign in with the allowed Privy account. Check
that the page and wallet refresh work on that phone before setting up the
Shortcut. A localhost URL on a laptop is not reachable from the phone unless
the phone has its own forwarding connection. No public listener or tunnel
has been created for this flow.

In **Connect a card-tap Shortcut**, create a token and copy its Authorization
header into your private Shortcut. The header is `Bearer` followed by the
token. Store it in the Shortcut, not its URL or a public shared Shortcut.
The server saves only a hash. Reloading Turtle hides the issued header; use
Replace Shortcut token if it was lost. Replacement invalidates the previous
header. Revoke Shortcut access disconnects intake without deleting history.

## Build the automation

1. In Shortcuts, create a personal automation with the Transaction trigger,
   select When I tap, and choose your card. Apple documents a tap trigger;
   it does not establish issuer settlement or the fields your card supplies.
2. Inspect Shortcut Input on the actual device. Map only available merchant,
   amount and currency fields. If one is missing, ask for that field and
   keep the notification visibly understood as user-supplied. Do not guess
   a merchant, infer currency from the phone's locale, or add card numbers.
3. Generate a UUID once for the tap and capture its timestamp once. Build
   the five-field dictionary below. Save the dictionary to a file named with
   that UUID in a private pending-notifications folder before the first send.
4. Use Get Contents of URL with POST to the endpoint shown in Turtle. Set
   Authorization to the copied header and the request body to JSON with
   the dictionary fields. Use the same reachable origin as the phone browser.
5. Check the response. `received: true` acknowledges persistence;
   `purchased: false` means no token purchase occurred. Check Your activity
   for the merchant and the Apple Wallet Shortcut source. Archive the saved
   dictionary after confirming receipt.

| Field | Value |
| --- | --- |
| `id` | UUID generated once for this tap |
| `merchant` | Nonempty merchant text, at most 160 characters |
| `amount` | Positive decimal **text**, dot separator, no currency symbol or grouping, at most six fractional digits |
| `currency` | `USD` or `EUR` from the event or your explicit input |
| `timestamp` | ISO 8601 with timezone, such as `2026-09-12T10:00:00+02:00` |

Do not send `source`, a card number, wallet ID or other extra fields. The
endpoint assigns the source. This label identifies the authenticated intake
channel; it is not a cryptographic attestation from Apple or your bank.

## Retry safely

For a network failure or timeout, reopen the saved dictionary and send it
unchanged. Do not generate a new UUID or timestamp. A retry of the same
notification returns 200 and leaves one stored event. A reused UUID with
changed content returns 409; inspect existing activity before correcting
the data rather than repeatedly changing the identity.

For 429, wait for the indicated Retry-After interval and retry the same
dictionary. For 401, check whether access was revoked or the token replaced.
For 400, inspect field formats without adding private payment information.
There is no server retry queue and no automatic token purchase.

## Manual verification still needed

Confirm the phone can reach Turtle, inspect the selected card's real
Shortcut Input, and send one notification from the configured automation.
Record which fields were supplied automatically and which were entered.
Verify one Apple Wallet Shortcut activity entry, then repeat the identical
saved request and verify that the entry count stays unchanged. Existing
browser tests mock the API; backend tests use isolated SQLite and HTTP
fixtures. Neither substitutes for this device check.

The receive-funds panel can be used independently. It targets the existing
app wallet and reads its balance; it does not initiate a funding transfer.

Sources: [Apple transaction trigger](https://support.apple.com/guide/shortcuts/transaction-trigger-apd65c67538a/ios)
and [Get Contents of URL and JSON requests](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios).
