import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app.js';
import { BLOCK_REASON, EventStore } from '../../server/store.js';

const endpoint = '/api/notifications/apple-wallet';
const event = () => ({ id: randomUUID(), merchant: 'Apple', amount: '5.00', currency: 'USD' as const, timestamp: '2026-09-12T10:00:00Z' });

describe('Apple Wallet Shortcut intake without execution', () => {
  let store: EventStore;
  let server: Server;
  let base: string;
  let directory: string;
  let time: number;
  const verifyToken = vi.fn(async (token: string) => {
    if (token !== 'allowed' && token !== 'other') throw new Error('Private authentication detail');
    return `did:privy:${token}`;
  });
  const readWallet = vi.fn(async () => ({ address: '0x123', balanceUsdc: '10', chainId: 5042002 as const, holdings: [] }));
  const request = (path: string, body?: unknown, token = 'allowed') => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const rotate = async () => {
    const response = await request('/api/shortcut/token', {});
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.endpointPath).toBe(endpoint);
    expect(result.token).toMatch(/^turtle_shortcut_[A-Za-z0-9_-]{43}$/);
    return result.token as string;
  };
  const start = async (user = 'did:privy:allowed') => {
    store = new EventStore(join(directory, 'events.sqlite'));
    server = createApp({ appId: 'public-app', allowedUser: user, store, now: () => time,
      verifyToken, readWallet }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test listener');
    base = `http://127.0.0.1:${address.port}`;
  };
  const stop = async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  };
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'turtle-shortcut-'));
    time = 0;
    verifyToken.mockClear(); readWallet.mockClear();
    await start();
  });
  afterEach(async () => {
    await stop();
    rmSync(directory, { recursive: true });
  });

  it('requires pinned Privy authentication to manage a token and never returns its stored hash', async () => {
    expect((await fetch(`${base}/api/shortcut`)).status).toBe(401);
    for (const path of ['/api/shortcut/token', '/api/shortcut/revoke']) {
      expect((await request(path, {}, 'invalid')).status).toBe(401);
      expect((await request(path, {}, 'other')).status).toBe(403);
    }
    expect(await (await request('/api/shortcut')).json()).toEqual({ enabled: false, endpointPath: endpoint });
    const token = await rotate();
    expect(await (await request('/api/shortcut')).json()).toEqual({ enabled: true, endpointPath: endpoint });
    const saved = store.database.prepare('SELECT * FROM shortcut_credential').all();
    expect(saved).toEqual([{ slot: 1, user_id: 'did:privy:allowed', token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(JSON.stringify(saved)).not.toContain(token);
  });

  it('restricts Shortcut credentials to intake, excluding wallet, activity, simulation and token management', async () => {
    const token = await rotate();
    verifyToken.mockClear();
    for (const [path, body] of [
      ['/api/status', undefined], ['/api/events', undefined], ['/api/shortcut', undefined],
      ['/api/events', event()], ['/api/shortcut/token', {}], ['/api/shortcut/revoke', {}],
      ['/api/pause', { paused: false }], [`/api/events/${randomUUID()}/retry`, {}],
    ] as const) expect((await request(path, body, token)).status).toBe(401);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(readWallet).not.toHaveBeenCalled();
    expect((await request(endpoint, event(), 'allowed')).status).toBe(401);
    expect((await request(endpoint, event(), 'other')).status).toBe(401);
    expect((await request(endpoint, event(), token + 'x')).status).toBe(401);
    expect(store.list()).toEqual([]);
  });

  it('persists scoped credentials across restart, invalidates rotation/revocation, and binds them to pinned user', async () => {
    const first = await rotate();
    await stop(); await start();
    expect((await request(endpoint, event(), first)).status).toBe(202);
    const second = await rotate();
    expect(second).not.toBe(first);
    expect((await request(endpoint, event(), first)).status).toBe(401);
    expect((await request(endpoint, event(), second)).status).toBe(202);
    expect(await (await request('/api/shortcut/revoke', {})).json()).toEqual({ enabled: false });
    await stop(); await start();
    expect((await request(endpoint, event(), second)).status).toBe(401);
    const third = await rotate();
    await stop(); await start('did:privy:other');
    expect((await request(endpoint, event(), third)).status).toBe(401);
    expect(await (await request('/api/shortcut', undefined, 'other')).json()).toEqual({ enabled: false, endpointPath: endpoint });
  });

  it('persists concurrent duplicate receipts once, rejects conflicts and protects IDs across both sources', async () => {
    const token = await rotate();
    const input = event();
    const replies = await Promise.all([request(endpoint, input, token), request(endpoint, input, token)]);
    expect(replies.map(reply => reply.status).sort()).toEqual([200, 202]);
    for (const reply of replies) expect(await reply.json()).toEqual({ id: input.id, received: true, purchased: false, status: 'needs_retry' });
    expect((await request(endpoint, { ...input, id: input.id.toUpperCase() }, token)).status).toBe(200);
    expect((await request(endpoint, { ...input, merchant: 'Microsoft' }, token)).status).toBe(409);
    expect((await request('/api/events', input)).status).toBe(409);
    const simulation = event();
    expect((await request('/api/events', simulation)).status).toBe(202);
    expect((await request(endpoint, simulation, token)).status).toBe(409);
    const rows = await (await request('/api/events')).json();
    expect(rows.events.map((row: { id: string; source: string }) => [row.id, row.source])).toEqual([
      [simulation.id, 'simulation'], [input.id, 'apple_wallet'],
    ]);
    expect(rows.events[1]).toMatchObject({ ...input, reason: BLOCK_REASON, principalUsdc: '0.5', status: 'needs_retry' });
    expect(readWallet).not.toHaveBeenCalled();
    await stop(); await start();
    expect((await request(endpoint, input, token)).status).toBe(200);
    expect(store.list()).toEqual(rows.events);
    expect((await request(`/api/events/${input.id}/retry`, {})).status).toBe(423);
    expect((await request('/api/pause', { paused: false })).status).toBe(423);
    expect((await (await request('/api/status')).json()).execution.enabled).toBe(false);
  });

  it.each([{ amount: '0' }, { amount: '-1' }, { amount: '1e2' }, { amount: '1,20' }, { amount: 2 },
    { amount: '1.0000001' }, { currency: 'GBP' }, { source: 'apple_wallet' }, { source: 'simulation' },
    { merchant: '  ' }, { merchant: 'Apple\nprivate' }, { merchant: 'a'.repeat(161) },
    { timestamp: 'yesterday' }, { timestamp: '2026-02-30T00:00:00Z' }, { id: 'not-uuid' },
    { cardNumber: 'private' }, { walletId: 'private' }])('rejects invalid fields without persistence or leakage: %j', async fields => {
    const token = await rotate();
    const response = await request(endpoint, { ...event(), ...fields }, token);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid purchase notification' });
    expect(store.list()).toEqual([]);
    expect(readWallet).not.toHaveBeenCalled();
  });

  it('bounds JSON size and malformed content without echoing secrets', async () => {
    const token = await rotate();
    for (const [body, status, error] of [
      [JSON.stringify({ ...event(), merchant: token.repeat(100) }), 413, 'Request body too large'],
      [`{"merchant":"${token}`, 400, 'Invalid JSON'],
      ['null', 400, 'Invalid JSON'],
    ] as const) {
      const response = await fetch(`${base}${endpoint}`, { method: 'POST', headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      }, body });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
    }
    expect(store.list()).toEqual([]);
  });

  it('rolls back a failed durable receipt and reports failure without claiming acceptance', async () => {
    const token = await rotate();
    store.database.exec(`CREATE TRIGGER reject_receipt BEFORE INSERT ON event_order
      BEGIN SELECT RAISE(ABORT, 'Private database failure'); END;`);
    const response = await request(endpoint, event(), token);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Request failed; no purchase was attempted' });
    expect(store.database.prepare('SELECT COUNT(*) AS count FROM apple_wallet_notifications').get()).toEqual({ count: 0 });
    expect(store.list()).toEqual([]);
    expect(readWallet).not.toHaveBeenCalled();
  });

  it('limits scoped intake to 30 requests/minute without rotation bypass or affecting simulation', async () => {
    const token = await rotate();
    const input = event();
    for (let count = 0; count < 30; count++) expect((await request(endpoint, input, token)).status).toBe(count ? 200 : 202);
    const limited = await request(endpoint, event(), token);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    const rotated = await rotate();
    expect((await request(endpoint, event(), rotated)).status).toBe(429);
    expect((await request('/api/events', event())).status).toBe(202);
    time = 60_000;
    expect((await request(endpoint, input, rotated)).status).toBe(200);
    expect(store.list()).toHaveLength(2);
  });

  it('adds notification storage without replacing legacy event tables, rows or unrelated transaction history', async () => {
    await stop();
    const path = join(directory, 'legacy.sqlite');
    const legacy = new Database(path);
    legacy.exec(`CREATE TABLE events (
      id TEXT PRIMARY KEY, payload TEXT NOT NULL, merchant TEXT NOT NULL,
      amount TEXT NOT NULL, currency TEXT NOT NULL, timestamp TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source = 'simulation'), status TEXT NOT NULL,
      reason TEXT NOT NULL, principal_usdc TEXT NOT NULL, rate_json TEXT NOT NULL
    ); CREATE TABLE execution_history (id TEXT PRIMARY KEY, hash TEXT);
    INSERT INTO execution_history VALUES ('confirmed-buy', 'preserved-hash');`);
    const original = event();
    legacy.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      original.id, JSON.stringify([original.merchant, original.amount, original.currency, original.timestamp]),
      original.merchant, original.amount, original.currency, original.timestamp, 'simulation', 'needs_retry',
      BLOCK_REASON, '0.5', '{"value":"1","demo":false}');
    const before = legacy.prepare('SELECT rowid, * FROM events').all();
    const schema = legacy.prepare("SELECT rootpage, sql FROM sqlite_master WHERE name = 'events'").get();
    legacy.close();
    const migrated = new EventStore(path);
    expect(migrated.database.prepare('SELECT rowid, * FROM events').all()).toEqual(before);
    expect(migrated.database.prepare("SELECT rootpage, sql FROM sqlite_master WHERE name = 'events'").get()).toEqual(schema);
    expect(migrated.list().map(row => row.id)).toEqual([original.id]);
    migrated.intake(event(), 'apple_wallet');
    expect(migrated.database.prepare('SELECT * FROM execution_history').all()).toEqual([{ id: 'confirmed-buy', hash: 'preserved-hash' }]);
    expect(migrated.database.prepare('SELECT rowid, * FROM events').all()).toEqual(before);
    migrated.close();
    await start();
  });
});
