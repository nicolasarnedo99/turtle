import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Funding } from './Funding';
import { ShortcutSetup } from './ShortcutSetup';

export type Event = { id: string; merchant: string; amount: string; currency: string; timestamp: string; source: string; status: string; reason: string; principalUsdc: string };
export type Status = {
  wallet: { address: string; balanceUsdc: string; chainId: number; holdings: { symbol: string; balance: string; address: string }[] };
  execution: { enabled: false; paused: true; reason: string };
  limits: { dailyCapUsdc: string; reserveUsdc: string };
  eurUsdRate: { value: string; date: string; demo: boolean };
};
type Draft = { id: string; merchant: string; amount: string; currency: string; timestamp: string };
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

export function Turtle({ large = false }: { large?: boolean }) {
  return <svg className={large ? 'turtle-large' : 'turtle-mark'} viewBox="0 0 120 90" fill="none" aria-hidden="true">
    <path d="M22 55c-7 0-12 4-15 8M35 63l-6 12M68 66l5 10" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <path d="M24 56c0-23 12-38 33-38s32 15 32 38c-16 13-48 13-65 0Z" fill="currentColor" />
    <path d="m56 20-13 18 9 19 21-1 11-17M25 50l18-12M52 57l-6 10" stroke="#c9e4c8" strokeWidth="3" strokeLinejoin="round" />
    <path d="M86 44c6-9 21-11 25-2 5 12-9 22-21 17" fill="currentColor" />
    <circle cx="104" cy="45" r="2" fill="#f7faf2" />
  </svg>;
}

export default function App() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const [status, setStatus] = useState<Status | null>(null);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [pending, setPending] = useState<Draft | null>(null);
  const [draftRecoveryError, setDraftRecoveryError] = useState(false);
  const session = useRef(0);
  const refreshSequence = useRef(0);
  const request = useCallback(async (path: string, body?: unknown) => {
    const token = await getAccessToken();
    if (!token) throw new ApiError('Your session expired. Sign in again.', 401);
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
    const data = await response.json();
    if (!response.ok) throw new ApiError(typeof data.error === 'string' ? data.error : 'Request failed. Try again.', response.status);
    return data;
  }, [getAccessToken]);
  const refresh = useCallback(async (requireWallet = false) => {
    const current = session.current;
    const sequence = ++refreshSequence.current;
    setLoading(true);
    try {
      const results = await Promise.allSettled([request('/api/status'), request('/api/events')]);
      if (current !== session.current || sequence !== refreshSequence.current) {
        if (requireWallet) throw new Error('Wallet check was superseded. Check again.');
        return;
      }
      const [wallet, activity] = results;
      if (wallet.status === 'fulfilled') setStatus(wallet.value); else setStatus(null);
      if (activity.status === 'fulfilled') setEvents(activity.value.events); else setEvents(null);
      const failed = results.find((result) => result.status === 'rejected');
      setError(failed?.status === 'rejected' ? failed.reason.message : '');
      if (requireWallet && wallet.status === 'rejected') throw wallet.reason;
    } finally { if (current === session.current && sequence === refreshSequence.current) setLoading(false); }
  }, [request]);
  useEffect(() => {
    session.current++;
    setStatus(null); setEvents(null); setError(''); setNotice(''); setPending(null); setSaving(false); setLoading(false);
    setDraftRecoveryError(false);
    if (authenticated && user?.id) {
      try {
        const stored = sessionStorage.getItem(`turtle.pending.${user.id}`);
        if (stored) {
          const draft = JSON.parse(stored);
          if (!draft || ['id', 'merchant', 'amount', 'currency', 'timestamp'].some(key => typeof draft[key] !== 'string')) throw new Error('Invalid saved draft');
          setPending(draft); setMerchant(draft.merchant); setAmount(draft.amount); setCurrency(draft.currency);
        }
      } catch {
        setDraftRecoveryError(true);
        setError('Unable to recover the pending simulation. Check its saved activity before submitting again.');
      }
    }
    if (!authenticated) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 15_000);
    return () => { session.current++; clearInterval(interval); };
  }, [authenticated, refresh, user?.id]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const current = session.current;
    const draft = pending ?? { id: crypto.randomUUID(), merchant, amount, currency, timestamp: new Date().toISOString() };
    if (!user?.id || draftRecoveryError) return;
    const key = `turtle.pending.${user.id}`;
    try { sessionStorage.setItem(key, JSON.stringify(draft)); }
    catch { setError('Unable to preserve this simulation for safe retry. Nothing was submitted.'); return; }
    setPending(draft); setSaving(true); setNotice(''); setError('');
    try {
      await request('/api/events', draft);
      if (current !== session.current) return;
      sessionStorage.removeItem(key);
      setPending(null); setMerchant(''); setAmount('');
      setNotice('Simulation saved. No purchase was made. It will not run automatically later.');
      await refresh();
    } catch (failure) {
      if (current !== session.current) return;
      if (failure instanceof ApiError && failure.status === 400) { sessionStorage.removeItem(key); setPending(null); }
      setError(failure instanceof Error ? failure.message : 'Unable to save simulation.');
    } finally { if (current === session.current) setSaving(false); }
  }
  async function pause() {
    try { await request('/api/pause', { paused: true }); setNotice('Execution remains paused.'); await refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to confirm pause.'); }
  }

  return <div className="site">
    <header><a className="brand" href="/" aria-label="Turtle home"><Turtle /><span>turtle<span className="brand-dot">.</span></span></a>
      <div className="header-actions"><span className="network"><i />Arc testnet</span>{authenticated && <button className="text-button" onClick={() => void logout()}>Sign out</button>}</div>
    </header>
    <main>
      <section className="intro"><div><p className="eyebrow">A LITTLE AT A TIME</p><h1>Small steps.<br /><span>Something to grow.</span></h1><p className="intro-copy">A space to explore everyday spending and synthetic stock-price tokens. One careful step at a time.</p></div><div className="turtle-garden"><Turtle large /><span className="sprout sprout-one" /><span className="sprout sprout-two" /><span className="garden-caption">slow &amp; steady</span></div></section>
      <div className="disclosure">TESTNET DEMO <span>·</span> Synthetic tokens, not backed shares <span>·</span> Simulations and card-tap notifications</div>
      {!authenticated ? <section className="login-panel"><div><p className="eyebrow">YOUR PRIVATE DEMO</p><h2>Welcome back.</h2><p>Sign in to see your app-owned wallet, record a simulation, and follow its status.</p><p className="muted">Access is limited to the configured account. Purchases are disabled.</p></div><button className="primary" disabled={!ready} onClick={() => login()}>{ready ? 'Sign in with Privy' : 'Preparing sign in…'}<span aria-hidden="true">↗</span></button></section> : <>
        <section className="gate" role="status"><span className="gate-icon" aria-hidden="true">Ⅱ</span><div><strong>Purchases are paused</strong><p>QVAC + NVIDIA classification has not passed verification. You can add test funds and record simulations or card-tap notifications. Token purchases stay off; events will not buy automatically later.</p></div><button className="text-button" onClick={() => void pause()}>Confirm pause</button></section>
        {draftRecoveryError && <div className="error" role="alert">Pending simulation recovery failed. Submission is blocked until its saved identity is recovered.</div>}
        {error && <div className="error" role="alert">{error}</div>}
        {notice && <div className="notice" role="status">{notice}</div>}
        <div className="dashboard">
          <section className="wallet-card"><div className="section-title"><span className="eyebrow">YOUR APP WALLET</span><button className="text-button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
            <div className="balance">{status ? status.wallet.balanceUsdc : '—'}<span>test USDC</span></div><p className="muted">Available balance on Arc testnet</p>
            {status && <a className="wallet-address" href={`https://testnet.arcscan.app/address/${status.wallet.address}`} target="_blank" rel="noreferrer">{status.wallet.address}<span aria-hidden="true"> ↗</span></a>}
            <div className="limits"><div><span>Daily purchase cap</span><strong>{status?.limits.dailyCapUsdc ?? '5'} test USDC</strong></div><div><span>Minimum reserve + gas</span><strong>{status?.limits.reserveUsdc ?? '1'} test USDC</strong></div></div>
            <p className="fine-print">App-owned wallet. Signing is controlled by the backend.</p>
            {status && <Funding key={status.wallet.address} wallet={status.wallet} refresh={() => refresh(true)} />}
          </section>
          <section className="simulation-card"><p className="eyebrow">TRY A SIMULATED PURCHASE</p><h2>A small everyday moment.</h2><form onSubmit={(event) => void save(event)}>
            <label htmlFor="merchant">Merchant</label><input id="merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Apple Store Madrid" maxLength={160} required disabled={saving || !!pending} />
            <div className="form-row"><div><label htmlFor="amount">Purchase amount</label><input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required disabled={saving || !!pending} /></div><div><label htmlFor="currency">Currency</label><select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={saving || !!pending}><option>USD</option><option>EUR</option></select></div></div>
            <p className="fine-print">Planned allocation: 10%, bounded to 0.10–1 test USDC.{currency === 'EUR' && ' Demo rate: 1 EUR = 1.10 USD, dated 12 Sep 2026. Not a market quote.'}</p>
            <button className="primary" disabled={saving || !status || draftRecoveryError}>{saving ? 'Saving…' : pending ? 'Retry saving this simulation' : 'Save simulation'}<span aria-hidden="true">+</span></button>
            <p className="save-note">Records an event only. Does not charge a card or buy tokens.</p>
          </form></section>
        </div>
        <ShortcutSetup key={user?.id} request={request} />
        <section className="activity"><div className="section-title"><div><p className="eyebrow">ONE STEP AT A TIME</p><h2>Your activity</h2></div><span className="count">{events ? `${events.length} events` : 'Unavailable'}</span></div>
          {events === null ? <p className="muted">Activity unavailable. Refresh to check saved simulations.</p> : events.length === 0 ? <div className="empty"><span className="empty-mark">⌁</span><strong>No events yet</strong><p>Your saved events will appear here, with an honest status for every step.</p></div> : <ul className="events">{events.map(event => <li key={event.id}><span className="merchant-icon" aria-hidden="true">{event.merchant.slice(0, 1).toUpperCase()}</span><div className="event-detail"><strong>{event.merchant}</strong><span>{event.amount} {event.currency} · {event.source === 'apple_wallet' ? 'Apple Wallet Shortcut' : 'Simulation'} · {new Date(event.timestamp).toLocaleString('en-GB', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' })} Madrid</span><p>{event.reason}</p></div><div className="event-status"><span className="status-pill">{event.status === 'needs_retry' ? 'Not purchased' : event.status}</span><span>{event.principalUsdc} test USDC planned</span></div></li>)}</ul>}
          <p className="fine-print">Failed or unprocessed events always need an explicit retry after execution is available.</p>
        </section>
        <section className="holdings"><div className="section-title"><h2>Confirmed holdings</h2><span className="muted">Onchain balances</span></div>{status ? status.wallet.holdings.some(h => !/^0(?:\.0+)?$/.test(h.balance)) ? <ul className="holding-list">{status.wallet.holdings.filter(h => !/^0(?:\.0+)?$/.test(h.balance)).map(h => <li key={h.address}><strong>{h.symbol}</strong><span>{h.balance} synth</span><a href={`https://testnet.arcscan.app/token/${h.address}`} target="_blank" rel="noreferrer">View token ↗</a></li>)}</ul> : <p className="muted">No synthetic tokens held. Saving a simulation does not create a holding.</p> : <p className="muted">Balances unavailable until the wallet refresh succeeds.</p>}</section>
      </>}
    </main><footer><span>turtle · slow and steady</span><span>Built with QVAC, NVIDIA &amp; Privy · Arc testnet</span></footer>
  </div>;
}
