import { useState } from 'react';
import './funding.css';

type Wallet = { address: string; balanceUsdc: string; chainId: number };

export function Funding({ wallet, refresh }: { wallet: Wallet; refresh: () => Promise<void> }) {
  const [startingBalance] = useState(wallet.balanceUsdc);
  const [checking, setChecking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const supported = wallet.chainId === 5042002 && /^0x[0-9a-fA-F]{40}$/.test(wallet.address);

  async function copyAddress() {
    setCopying(true); setNotice(''); setError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(wallet.address);
      setNotice('Wallet address copied. Select Arc Testnet and USDC in the faucet.');
    } catch {
      setError('Unable to copy the address. Select and copy the full address manually.');
    } finally { setCopying(false); }
  }

  async function checkBalance() {
    setChecking(true); setNotice(''); setError('');
    try {
      await refresh();
      setNotice('Balance checked. A balance change alone does not confirm a particular deposit.');
    } catch {
      setError('Unable to check incoming funds. The displayed balance has not been verified by this check. Try again.');
    } finally { setChecking(false); }
  }

  return <section className="funding" aria-labelledby="funding-title">
    <p className="eyebrow">FUND YOUR EXISTING WALLET</p>
    <h2 id="funding-title">Add test USDC</h2>
    {!supported ? <p className="error" role="alert">Funding is unavailable: the wallet must have a valid address on Arc testnet (chain 5042002).</p> : <>
      <p className="funding-copy">Use the Circle faucet with <strong>Arc Testnet</strong> and <strong>USDC</strong>, then paste this wallet address. Test tokens only; do not send real funds or use another network.</p>
      <label htmlFor="funding-address">Receive address · Arc testnet · chain 5042002</label>
      <input id="funding-address" className="funding-address" value={wallet.address} readOnly spellCheck={false} onFocus={event => event.currentTarget.select()} />
      <div className="funding-actions">
        <button className="text-button" onClick={() => void copyAddress()} disabled={copying}>{copying ? 'Copying…' : 'Copy wallet address'}</button>
        <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Open Circle faucet ↗</a>
      </div>
      <dl className="funding-balances">
        <div><dt>Balance when opened</dt><dd>{startingBalance} test USDC</dd></div>
        <div><dt>Latest observed balance</dt><dd>{wallet.balanceUsdc} test USDC</dd></div>
      </dl>
      <button className="primary" onClick={() => void checkBalance()} disabled={checking}>{checking ? 'Checking funds…' : 'Check incoming funds'}</button>
      <p className="fine-print">After requesting tokens, check the balance here. If unchanged, the transfer may still be pending. <a href={`https://testnet.arcscan.app/address/${wallet.address}`} target="_blank" rel="noreferrer">View wallet transactions ↗</a></p>
      <p className="fine-print">Funding does not enable purchases. The existing app wallet and its transaction history stay in place.</p>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </section>;
}
