import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { resetDb, sqlite } from './testDb.js';
import { encryptJson } from '../src/crypto.js';
import { syncSource } from '../src/lib/syncSource.js';

// ─── ICS fixture server ──────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;
let currentIcs = '';

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/calendar');
    res.end(currentIcs);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}/feed.ics`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIcs(events: Array<{ uid: string; summary: string; startsAt: string; endsAt: string }>): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `SUMMARY:${e.summary}`,
      `DTSTART:${e.startsAt}`,
      `DTEND:${e.endsAt}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function seedSourceAndRoom(): { sourceId: number; roomId: number } {
  const encrypted = encryptJson({ url: baseUrl, httpAuth: null });
  const src = sqlite
    .prepare(`INSERT INTO calendar_sources (type, display_name, credentials_encrypted) VALUES ('ical','Test',?)`)
    .run(encrypted);
  const sourceId = Number(src.lastInsertRowid);
  const room = sqlite
    .prepare(`INSERT INTO rooms (slug, display_name, calendar_source_id, external_calendar_id) VALUES (?,?,?,?)`)
    .run('fellowship', 'Fellowship', sourceId, 'default');
  return { sourceId, roomId: Number(room.lastInsertRowid) };
}

function isoInDays(days: number): string {
  // node-ical needs the Z-suffixed compact form, e.g. 20260601T140000Z
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

beforeEach(() => {
  resetDb();
  currentIcs = '';
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('syncSource', () => {
  it('returns ok and no work when no rooms are mapped', async () => {
    const encrypted = encryptJson({ url: baseUrl, httpAuth: null });
    const src = sqlite
      .prepare(`INSERT INTO calendar_sources (type, display_name, credentials_encrypted) VALUES ('ical','Test',?)`)
      .run(encrypted);

    const result = await syncSource(Number(src.lastInsertRowid));
    expect(result.status).toBe('ok');
    expect(result.roomsSynced).toBe(0);
    expect(result.message).toMatch(/No rooms/);

    const row = sqlite.prepare(`SELECT last_sync_status FROM calendar_sources WHERE id = ?`).get(src.lastInsertRowid) as { last_sync_status: string };
    expect(row.last_sync_status).toBe('ok');
  });

  it('upserts events from the remote feed into bookings_cache', async () => {
    const { sourceId, roomId } = seedSourceAndRoom();
    currentIcs = makeIcs([
      { uid: 'evt-1', summary: 'A', startsAt: isoInDays(1), endsAt: isoInDays(1) },
      { uid: 'evt-2', summary: 'B', startsAt: isoInDays(2), endsAt: isoInDays(2) },
    ]);

    const result = await syncSource(sourceId);
    expect(result.status).toBe('ok');
    expect(result.eventsUpserted).toBe(2);

    const rows = sqlite
      .prepare(`SELECT external_id, title FROM bookings_cache WHERE room_id = ? AND source = 'ical' ORDER BY external_id`)
      .all(roomId) as Array<{ external_id: string; title: string }>;
    expect(rows.map((r) => r.external_id)).toEqual(['evt-1', 'evt-2']);
    expect(rows.map((r) => r.title)).toEqual(['A', 'B']);
  });

  it('updates an existing cached event when title/time changes', async () => {
    const { sourceId, roomId } = seedSourceAndRoom();
    currentIcs = makeIcs([{ uid: 'evt-1', summary: 'Original', startsAt: isoInDays(1), endsAt: isoInDays(1) }]);
    await syncSource(sourceId);

    currentIcs = makeIcs([{ uid: 'evt-1', summary: 'Renamed', startsAt: isoInDays(1), endsAt: isoInDays(1) }]);
    const result = await syncSource(sourceId);
    expect(result.status).toBe('ok');

    const rows = sqlite
      .prepare(`SELECT title FROM bookings_cache WHERE room_id = ? AND source = 'ical'`)
      .all(roomId) as Array<{ title: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('Renamed');
  });

  it('deletes cached events that no longer appear in the remote feed', async () => {
    const { sourceId, roomId } = seedSourceAndRoom();
    currentIcs = makeIcs([
      { uid: 'evt-1', summary: 'Keep', startsAt: isoInDays(1), endsAt: isoInDays(1) },
      { uid: 'evt-2', summary: 'Drop', startsAt: isoInDays(2), endsAt: isoInDays(2) },
    ]);
    await syncSource(sourceId);

    currentIcs = makeIcs([{ uid: 'evt-1', summary: 'Keep', startsAt: isoInDays(1), endsAt: isoInDays(1) }]);
    const result = await syncSource(sourceId);
    expect(result.eventsDeleted).toBe(1);

    const ids = sqlite
      .prepare(`SELECT external_id FROM bookings_cache WHERE room_id = ? AND source = 'ical'`)
      .all(roomId) as Array<{ external_id: string }>;
    expect(ids.map((r) => r.external_id)).toEqual(['evt-1']);
  });

  it('leaves walk-ups untouched during sync', async () => {
    const { sourceId, roomId } = seedSourceAndRoom();
    // Insert a walk-up directly
    const startsAt = new Date(Date.now() + 60_000).toISOString();
    const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    sqlite
      .prepare(`INSERT INTO walk_ups (room_id, title, starts_at, ends_at) VALUES (?, 'Local', ?, ?)`)
      .run(roomId, startsAt, endsAt);
    sqlite
      .prepare(`INSERT INTO bookings_cache (room_id, source, external_id, title, starts_at, ends_at) VALUES (?, 'local_walkup', '1', 'Local', ?, ?)`)
      .run(roomId, startsAt, endsAt);

    currentIcs = makeIcs([]);
    await syncSource(sourceId);

    const walkups = sqlite.prepare(`SELECT COUNT(*) AS c FROM bookings_cache WHERE source='local_walkup'`).get() as { c: number };
    expect(walkups.c).toBe(1);
  });

  it('records an error on the source when fetching fails', async () => {
    // Source pointing at a port nothing listens on
    const encrypted = encryptJson({ url: 'http://127.0.0.1:1/missing.ics', httpAuth: null });
    const src = sqlite
      .prepare(`INSERT INTO calendar_sources (type, display_name, credentials_encrypted) VALUES ('ical','Bad',?)`)
      .run(encrypted);
    const sourceId = Number(src.lastInsertRowid);
    sqlite
      .prepare(`INSERT INTO rooms (slug, display_name, calendar_source_id, external_calendar_id) VALUES (?,?,?,?)`)
      .run('bad-room', 'Bad', sourceId, 'default');

    const result = await syncSource(sourceId);
    expect(result.status).toBe('error');

    const row = sqlite
      .prepare(`SELECT last_sync_status, last_sync_error FROM calendar_sources WHERE id = ?`)
      .get(sourceId) as { last_sync_status: string; last_sync_error: string | null };
    expect(row.last_sync_status).toBe('error');
    expect(row.last_sync_error).toBeTruthy();
  });

  it('returns an error result when the source id does not exist', async () => {
    const result = await syncSource(99_999);
    expect(result.status).toBe('error');
    expect(result.message).toMatch(/not found/);
  });
});
