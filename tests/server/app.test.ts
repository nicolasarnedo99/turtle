import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import { BLOCK_REASON, EventStore } from '../../server/store.js';

describe('authenticated disabled execution API', () => {
  let store: EventStore;
  let server: Server;
  let base: string;
  let directory: string;
  let chainFails: boolean;
  let time: number;
  const event = () => ({ id: randomUUID(), merchant: 'Apple', amount: '5.00', currency: 'USD', timestamp: '2026-09-12T10:00:00Z' });
  const request = (path: string, body?: unknown, token = 'allowed') => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'turtle-test-'));
    store = new EventStore(join(directory, 'events.sqlite'));
    chainFails = false;
    time = 0;
    const app = createApp({ appId: 'public-app', allowedUser: 'did:privy:allowed', store, now: () => time,
      verifyToken: async token => { if (token === 'invalid') throw new Error('private detail'); return `did:privy:${token}`; },
      readWallet: async () => {
        if (chainFails) throw new Error('private RPC detail');
        return { address: '0x123', balanceUsdc: '10', chainId: 5042002, holdings: [] };
      },
    });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true });
  });

  it('exposes only public app config and rejects absent, invalid, and another valid user', async () => {
    expect(await (await fetch(`${base}/api/config`)).json()).toEqual({ privyAppId: 'public-app' });
    expect((await fetch(`${base}/api/events`)).status).toBe(401);
    expect((await request('/api/events', event(), 'invalid')).status).toBe(401);
    expect((await request('/api/events', event(), 'other')).status).toBe(403);
    expect(store.list()).toHaveLength(0);
  });
  it('persists intake once under concurrent duplicate requests and rejects changed payload', async () => {
    const input = event();
    const responses = await Promise.all([request('/api/events', input), request('/api/events', input)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 202]);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({ status: 'needs_retry', principalUsdc: '0.5', source: 'simulation', reason: BLOCK_REASON });
    expect((await request('/api/events', { ...input, amount: '6.00' })).status).toBe(409);
    expect(store.list()[0]!.amount).toBe('5.00');
    expect((await request('/api/events', { ...input, id: input.id.toUpperCase() })).status).toBe(200);
  });
  it.each([{ amount: '0' }, { amount: '-1' }, { amount: '1e2' }, { amount: 2 }, { currency: 'GBP' },
    { source: 'card' }, { merchant: '  ' }, { timestamp: 'yesterday' }, { timestamp: '2026-02-30T00:00:00Z' }, { id: 'not-uuid' }])('rejects invalid fields %j without persistence', async fields => {
    expect((await request('/api/events', { ...event(), ...fields })).status).toBe(400);
    expect(store.list()).toHaveLength(0);
  });
  it('never retries or unpauses, including after restart', async () => {
    const input = event();
    await request('/api/events', input);
    expect((await request(`/api/events/${input.id}/retry`, {})).status).toBe(423);
    expect((await request('/api/pause', { paused: false })).status).toBe(423);
    expect((await request('/api/pause', { paused: true })).status).toBe(200);
    const status = await (await request('/api/status')).json();
    expect(status.execution).toEqual({ enabled: false, paused: true, reason: BLOCK_REASON });
    store.database.prepare("UPDATE events SET status = 'preparing'").run();
    const reopened = new EventStore(join(directory, 'events.sqlite'));
    expect(reopened.list()[0]!.status).toBe('needs_retry');
    expect(reopened.database.prepare("SELECT value FROM settings WHERE key = 'paused'").get()).toEqual({ value: 'true' });
    reopened.close();
  });
  it('surfaces RPC failure instead of inventing a zero balance', async () => {
    chainFails = true;
    const response = await request('/api/status');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Arc wallet state unavailable; retry the read later' });
  });
  it('bounds authenticated intake and resumes after a minute', async () => {
    const input = event();
    for (let count = 0; count < 30; count++) await request('/api/events', input);
    expect((await request('/api/events', input)).status).toBe(429);
    time = 60_000;
    expect((await request('/api/events', input)).status).toBe(200);
  });
});
