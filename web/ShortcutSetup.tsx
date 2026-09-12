import { useEffect, useState } from 'react';
import './shortcut.css';

type Request = (path: string, body?: unknown) => Promise<any>;
const endpointPath = '/api/notifications/apple-wallet';

export function ShortcutSetup({ request }: { request: Request }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    request('/api/shortcut').then(result => {
      if (typeof result.enabled !== 'boolean') throw new Error('Invalid setup response');
      if (active) setEnabled(result.enabled);
    }).catch(() => { if (active) setError('Shortcut setup is unavailable. Reload to check its state.'); });
    return () => { active = false; };
  }, [request]);

  async function configure(revoke = false) {
    setBusy(true); setError(''); setNotice(''); setToken(''); setVisible(false);
    try {
      const result = await request(revoke ? '/api/shortcut/revoke' : '/api/shortcut/token', {});
      if (revoke) {
        if (result.enabled !== false) throw new Error('Invalid revocation response');
        setEnabled(false); setNotice('Shortcut access revoked. Existing notifications remain saved.');
      } else {
        if (typeof result.token !== 'string' || !/^turtle_shortcut_[A-Za-z0-9_-]{43}$/.test(result.token)) throw new Error('Invalid token response');
        setToken(result.token); setEnabled(true);
        setNotice('Copy this header into your Shortcut now. It is shown only in this session. Any previous token is invalid.');
      }
    } catch {
      setEnabled(null);
      setError('Setup change could not be confirmed. Reload to check access; create a replacement if the token was lost.');
    } finally { setBusy(false); }
  }

  async function copyHeader() {
    try {
      await navigator.clipboard.writeText(`Bearer ${token}`);
      setNotice('Authorization header copied. Paste it only into your private Shortcut.');
    } catch { setError('Clipboard unavailable. Show the header and copy it manually.'); }
  }

  return <section className="shortcut-card" aria-labelledby="shortcut-title">
    <p className="eyebrow">APPLE WALLET NOTIFICATIONS</p>
    <h2 id="shortcut-title">Connect a card-tap Shortcut</h2>
    <p>A Shortcut can send merchant, amount and currency when you tap your selected card. Turtle records the notification; it does not charge the card or buy tokens.</p>
    <p className="muted">{enabled === null ? 'Access state unavailable or loading.' : enabled ? 'Shortcut access is enabled.' : 'Shortcut access is not enabled.'}</p>
    <div className="shortcut-actions">
      <button className="text-button" disabled={busy || enabled === null} onClick={() => void configure()}>{enabled ? 'Replace Shortcut token' : 'Create Shortcut token'}</button>
      {enabled && <button className="text-button" disabled={busy} onClick={() => void configure(true)}>Revoke Shortcut access</button>}
    </div>
    {enabled && <p className="fine-print">Replacing the token disconnects the old Shortcut until you paste the new header.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {token && <div className="shortcut-secret">
      <label htmlFor="shortcut-header">Authorization header · shown once</label>
      <input id="shortcut-header" type={visible ? 'text' : 'password'} value={`Bearer ${token}`} readOnly autoComplete="off" spellCheck={false} onFocus={event => event.currentTarget.select()} />
      <div className="shortcut-actions"><button className="text-button" onClick={() => setVisible(!visible)}>{visible ? 'Hide header' : 'Show header'}</button><button className="text-button" onClick={() => void copyHeader()}>Copy Authorization header</button></div>
    </div>}
    <details><summary>Set up the Shortcut on your iPhone</summary>
      <ol>
        <li>In Shortcuts, create a personal automation using Transaction, then When I tap, and select your card.</li>
        <li>Inspect Shortcut Input on your phone. Use the merchant, amount and currency it actually supplies. If a field is missing, ask for it; do not invent a value. Your card's available fields still need verification.</li>
        <li>Generate one UUID and an ISO 8601 timestamp for the tap. Save them with the merchant, amount and currency before sending, so a retry uses the same values.</li>
        <li>Add Get Contents of URL with method POST, JSON body and the Authorization header above. Use the endpoint below through a connection your iPhone can reach.</li>
        <li>Keep the saved notification if the request fails. After receipt, find it in Your activity as “Apple Wallet Shortcut”. Receipt is not proof of card settlement.</li>
      </ol>
      <label htmlFor="shortcut-endpoint">Notification endpoint</label>
      <input id="shortcut-endpoint" value={`${window.location.origin}${endpointPath}`} readOnly onFocus={event => event.currentTarget.select()} />
      <p className="fine-print">A localhost address works on iPhone only with its own SSH port forward to morty. Otherwise use a private reachable Turtle URL; keep the token off public or untrusted connections.</p>
      <dl className="shortcut-fields"><dt>id</dt><dd>UUID, unchanged on retry</dd><dt>merchant</dt><dd>Merchant name, up to 160 characters</dd><dt>amount</dt><dd>Decimal text, such as 5.00, with no currency symbol</dd><dt>currency</dt><dd>USD or EUR</dd><dt>timestamp</dt><dd>ISO 8601 date with timezone, unchanged on retry</dd></dl>
      <p className="fine-print">A received response contains received: true and purchased: false. Do not generate another UUID to retry an uncertain request.</p>
      <a className="text-button" href="https://support.apple.com/guide/shortcuts/transaction-trigger-apd65c67538a/ios" target="_blank" rel="noreferrer">Apple's transaction trigger guide ↗</a>
    </details>
  </section>;
}
