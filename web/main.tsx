import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import App from './App';
import './style.css';

const root = createRoot(document.getElementById('root')!);
root.render(<div className="startup">Loading Turtle…</div>);
try {
  const response = await fetch('/api/config', { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Turtle could not reach its backend. Start the server and reload.');
  const config = await response.json();
  if (typeof config.privyAppId !== 'string' || !config.privyAppId) throw new Error('Privy login is not configured.');
  root.render(<StrictMode><PrivyProvider appId={config.privyAppId} config={{
    appearance: { theme: 'light', accentColor: '#174c37' },
    embeddedWallets: { ethereum: { createOnLogin: 'off' }, solana: { createOnLogin: 'off' } },
  }}><App /></PrivyProvider></StrictMode>);
} catch (error) {
  root.render(<div className="startup" role="alert"><h1>Turtle is resting.</h1><p>{error instanceof Error ? error.message : 'Unable to load the app.'}</p><button onClick={() => window.location.reload()}>Try again</button></div>);
}
