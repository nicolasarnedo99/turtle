import Database from 'better-sqlite3';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DEMO_RATE, formatMicro, principal } from './money.js';

export const BLOCK_REASON = 'QVAC/NVIDIA classification gate failed. Purchases remain disabled; explicit retry will be required after resolution.';
export type EventInput = { id: string; merchant: string; amount: string; currency: 'USD' | 'EUR'; timestamp: string };
export type SavedEvent = EventInput & { source: 'simulation' | 'apple_wallet'; status: 'needs_retry'; reason: string; principalUsdc: string };
export const SHORTCUT_TOKEN_PREFIX = 'turtle_shortcut_';

export class EventConflict extends Error {}

export class EventStore {
  readonly database: Database.Database;

  constructor(path: string) {
    this.database = new Database(path);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = FULL');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, merchant TEXT NOT NULL,
        amount TEXT NOT NULL, currency TEXT NOT NULL, timestamp TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source = 'simulation'), status TEXT NOT NULL,
        reason TEXT NOT NULL, principal_usdc TEXT NOT NULL, rate_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO settings VALUES ('paused', 'true');
      CREATE TABLE IF NOT EXISTS apple_wallet_notifications (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, merchant TEXT NOT NULL,
        amount TEXT NOT NULL, currency TEXT NOT NULL, timestamp TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source = 'apple_wallet'), status TEXT NOT NULL,
        reason TEXT NOT NULL, principal_usdc TEXT NOT NULL, rate_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS event_order (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE
      );
      INSERT OR IGNORE INTO event_order (event_id) SELECT id FROM events ORDER BY rowid;
      CREATE TABLE IF NOT EXISTS shortcut_credential (
        slot INTEGER PRIMARY KEY CHECK(slot = 1), user_id TEXT NOT NULL, token_hash TEXT NOT NULL
      );
    `);
    this.database.prepare(`UPDATE events SET status = 'needs_retry', reason = ?
      WHERE status IN ('received', 'classifying', 'preparing')`).run(BLOCK_REASON);
    this.pause();
  }

  pause(): void {
    this.database.prepare("UPDATE settings SET value = 'true' WHERE key = 'paused'").run();
  }

  list(): SavedEvent[] {
    return this.database.prepare(`SELECT id, merchant, amount, currency, timestamp,
      source, status, reason, principal_usdc AS principalUsdc FROM (
        SELECT * FROM events UNION ALL SELECT * FROM apple_wallet_notifications
      ) AS activity JOIN event_order ON activity.id = event_order.event_id
      ORDER BY event_order.sequence DESC LIMIT 200`).all() as SavedEvent[];
  }

  shortcutEnabled(user: string): boolean {
    return !!this.database.prepare('SELECT 1 FROM shortcut_credential WHERE user_id = ?').get(user);
  }

  rotateShortcutToken(user: string): string {
    const token = SHORTCUT_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    this.database.prepare(`INSERT INTO shortcut_credential VALUES (1, ?, ?)
      ON CONFLICT(slot) DO UPDATE SET user_id = excluded.user_id, token_hash = excluded.token_hash`)
      .run(user, createHash('sha256').update(token).digest('hex'));
    return token;
  }

  revokeShortcutToken(): void {
    this.database.prepare('DELETE FROM shortcut_credential').run();
  }

  acceptsShortcutToken(user: string, token: string): boolean {
    if (!/^turtle_shortcut_[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const saved = this.database.prepare('SELECT token_hash FROM shortcut_credential WHERE user_id = ?')
      .get(user) as { token_hash: string } | undefined;
    if (!saved) return false;
    const expected = Buffer.from(saved.token_hash, 'hex');
    const actual = createHash('sha256').update(token).digest();
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  intake(input: EventInput, source: SavedEvent['source'] = 'simulation'): { event: SavedEvent; created: boolean } {
    const table = source === 'simulation' ? 'events' : 'apple_wallet_notifications';
    const payload = JSON.stringify([input.merchant, input.amount, input.currency, input.timestamp]);
    return this.database.transaction(() => {
      const existing = this.database.prepare(`SELECT payload, source FROM events WHERE id = ?
        UNION ALL SELECT payload, source FROM apple_wallet_notifications WHERE id = ?`)
        .get(input.id, input.id) as { payload: string; source: SavedEvent['source'] } | undefined;
      if (existing) {
        if (existing.source !== source) throw new EventConflict('Event ID already belongs to another source');
        if (existing.payload !== payload) throw new EventConflict('Event ID already has a different payload');
        const event = this.database.prepare(`SELECT id, merchant, amount, currency, timestamp,
          source, status, reason, principal_usdc AS principalUsdc FROM ${table} WHERE id = ?`).get(input.id) as SavedEvent;
        return { event, created: false };
      }
      const event: SavedEvent = { ...input, source, status: 'needs_retry',
        reason: BLOCK_REASON, principalUsdc: formatMicro(principal(input.amount, input.currency)) };
      this.database.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        input.id, payload, input.merchant, input.amount, input.currency, input.timestamp,
        event.source, event.status, event.reason, event.principalUsdc,
        JSON.stringify(input.currency === 'EUR' ? DEMO_RATE : { value: '1', demo: false }),
      );
      this.database.prepare('INSERT INTO event_order (event_id) VALUES (?)').run(input.id);
      return { event, created: true };
    }).immediate();
  }

  close(): void { this.database.close(); }
}
