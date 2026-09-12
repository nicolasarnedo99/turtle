import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { AMOUNT_PATTERN, DEMO_RATE, parseAmount } from './money.js';
import { BLOCK_REASON, EventConflict, type EventStore } from './store.js';

export type WalletSnapshot = { address: string; balanceUsdc: string; chainId: 5042002;
  holdings: Array<{ symbol: string; balance: string; address: string }> };
export type AppDependencies = {
  appId: string; allowedUser: string; store: EventStore;
  verifyToken: (token: string) => Promise<string>;
  readWallet: () => Promise<WalletSnapshot>;
  now?: () => number;
};

const eventSchema = z.strictObject({
  id: z.uuid().transform(value => value.toLowerCase()), merchant: z.string().min(1).max(160).refine(value => value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value)),
  amount: z.string().regex(AMOUNT_PATTERN).refine(value => { try { parseAmount(value); return true; } catch { return false; } }),
  currency: z.enum(['USD', 'EUR']), timestamp: z.iso.datetime({ offset: true }),
});

export function createApp(dependencies: AppDependencies) {
  if (!dependencies.appId || !/^did:privy:[a-zA-Z0-9]+$/.test(dependencies.allowedUser)) throw new Error('Invalid authentication configuration');
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use('/api', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/config', (_request, response) => { response.json({ privyAppId: dependencies.appId }); });
  app.use('/api', async (request, response, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '');
    if (!match || match[1]!.length > 8192) { response.status(401).json({ error: 'Authentication required' }); return; }
    let user: string;
    try { user = await dependencies.verifyToken(match[1]!); }
    catch { response.status(401).json({ error: 'Invalid or expired access token' }); return; }
    if (user !== dependencies.allowedUser) { response.status(403).json({ error: 'This account cannot access Turtle' }); return; }
    next();
  });
  app.use('/api', express.json({ limit: '4kb', strict: true }));
  app.get('/api/status', async (_request, response) => {
    try {
      response.json({ wallet: await dependencies.readWallet(),
        execution: { enabled: false, paused: true, reason: BLOCK_REASON },
        limits: { dailyCapUsdc: '5', reserveUsdc: '1' }, eurUsdRate: DEMO_RATE });
    } catch { response.status(503).json({ error: 'Arc wallet state unavailable; retry the read later' }); }
  });
  app.get('/api/events', (_request, response) => { response.json({ events: dependencies.store.list() }); });
  const now = dependencies.now ?? Date.now;
  let intakeWindow = now();
  let intakeCount = 0;
  app.post('/api/events', (request, response) => {
    const time = now();
    if (time - intakeWindow >= 60_000) { intakeWindow = time; intakeCount = 0; }
    if (++intakeCount > 30) {
      response.setHeader('Retry-After', '60');
      response.status(429).json({ error: 'Simulation intake limit reached; wait one minute' }); return;
    }
    const parsed = eventSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: 'Invalid simulation event' }); return; }
    try {
      const result = dependencies.store.intake(parsed.data);
      response.status(result.created ? 202 : 200).json({ event: result.event });
    } catch (error) {
      if (error instanceof EventConflict) { response.status(409).json({ error: error.message }); return; }
      throw error;
    }
  });
  app.post('/api/events/:id/retry', (_request, response) => { response.status(423).json({ error: BLOCK_REASON }); });
  app.post('/api/pause', (request, response) => {
    const parsed = z.strictObject({ paused: z.boolean() }).safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: 'Expected paused boolean' }); return; }
    if (!parsed.data.paused) { response.status(423).json({ error: BLOCK_REASON }); return; }
    dependencies.store.pause();
    response.json({ paused: true });
  });
  app.use('/api', (_request, response) => { response.status(404).json({ error: 'Unknown API endpoint' }); });
  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error?.type === 'entity.too.large') { response.status(413).json({ error: 'Request body too large' }); return; }
    if (error?.type === 'entity.parse.failed') { response.status(400).json({ error: 'Invalid JSON' }); return; }
    response.status(500).json({ error: 'Request failed; no purchase was attempted' });
  };
  app.use(errors);
  return app;
}
