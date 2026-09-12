import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import express from 'express';
import { PrivyClient } from '@privy-io/node';
import { getAddress } from 'viem';
import { createApp } from './app.js';
import { walletReader } from './arc.js';
import { EventStore } from './store.js';

const root = fileURLToPath(new URL('../', import.meta.url));
process.umask(0o077);

try {
  const environment = resolve(root, '.env');
  if (existsSync(environment)) loadEnvFile(environment);
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const allowedUser = process.env.TURTLE_ALLOWED_PRIVY_USER_ID;
  if (!appId || !appSecret || !allowedUser) throw new Error('Missing authentication configuration');
  // Reuse the provisioned app wallet. Signing fixtures are never loaded here.
  const provision = JSON.parse(readFileSync(resolve(root, 'spikes/privy-arc/.private/provision.json'), 'utf8'));
  if (provision.allowedUser !== allowedUser || provision.pending || provision.wallet?.owner_id !== null) {
    throw new Error('Provisioned identity requires reconciliation');
  }
  const address = getAddress(provision.wallet.address);
  mkdirSync(resolve(root, 'data'), { recursive: true, mode: 0o700 });
  const store = new EventStore(resolve(root, 'data/turtle.sqlite'));
  const privy = new PrivyClient({ appId, appSecret });
  const app = createApp({ appId, allowedUser, store, readWallet: walletReader(address),
    verifyToken: async token => (await privy.utils().auth().verifyAccessToken(token)).user_id });
  const dist = resolve(root, 'dist');
  app.use(express.static(dist, { dotfiles: 'deny' }));
  app.get('/{*path}', (_request, response) => {
    if (!existsSync(resolve(dist, 'index.html'))) {
      response.status(503).type('text').send('Frontend build missing. Run npm run build.'); return;
    }
    response.sendFile(resolve(dist, 'index.html'));
  });
  const server = app.listen(4173, '127.0.0.1', () => {
    console.log('Turtle listening on http://127.0.0.1:4173; purchases disabled');
  });
  server.on('error', () => { console.error('Turtle listener failed'); store.close(); process.exitCode = 1; });
  const stop = () => { server.close(() => { store.close(); }); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
} catch {
  console.error('Turtle startup failed. Check private configuration, provisioned identity, and database access.');
  process.exitCode = 1;
}
