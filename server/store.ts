import Database from 'better-sqlite3';
import { DEMO_RATE, formatMicro, principal } from './money.js';

export const BLOCK_REASON = 'QVAC/NVIDIA classification gate failed. Purchases remain disabled; explicit retry will be required after resolution.';
export type EventInput = { id: string; merchant: string; amount: string; currency: 'USD' | 'EUR'; timestamp: string };
export type SavedEvent = EventInput & { source: 'simulation'; status: 'needs_retry'; reason: string; principalUsdc: string };

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
      source, status, reason, principal_usdc AS principalUsdc FROM events ORDER BY rowid DESC LIMIT 200`).all() as SavedEvent[];
  }

  intake(input: EventInput): { event: SavedEvent; created: boolean } {
    const payload = JSON.stringify([input.merchant, input.amount, input.currency, input.timestamp]);
    return this.database.transaction(() => {
      const existing = this.database.prepare('SELECT payload FROM events WHERE id = ?').get(input.id) as { payload: string } | undefined;
      if (existing) {
        if (existing.payload !== payload) throw new EventConflict('Event ID already has a different payload');
        const event = this.database.prepare(`SELECT id, merchant, amount, currency, timestamp,
          source, status, reason, principal_usdc AS principalUsdc FROM events WHERE id = ?`).get(input.id) as SavedEvent;
        return { event, created: false };
      }
      const event: SavedEvent = { ...input, source: 'simulation', status: 'needs_retry',
        reason: BLOCK_REASON, principalUsdc: formatMicro(principal(input.amount, input.currency)) };
      this.database.prepare(`INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        input.id, payload, input.merchant, input.amount, input.currency, input.timestamp,
        event.source, event.status, event.reason, event.principalUsdc,
        JSON.stringify(input.currency === 'EUR' ? DEMO_RATE : { value: '1', demo: false }),
      );
      return { event, created: true };
    }).immediate();
  }

  close(): void { this.database.close(); }
}
