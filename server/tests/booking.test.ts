import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { resetDb, sqlite } from './testDb.js';
import { registerRoomRoutes } from '../src/routes/rooms.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerRoomRoutes(app);
  await app.ready();
  return app;
}

function seedRoom(slug = 'fellowship'): number {
  const src = sqlite
    .prepare(`INSERT INTO calendar_sources (type, display_name, credentials_encrypted) VALUES ('ical','Test','x')`)
    .run();
  const room = sqlite
    .prepare(`INSERT INTO rooms (slug, display_name, calendar_source_id, external_calendar_id) VALUES (?,?,?,?)`)
    .run(slug, 'Fellowship Hall', Number(src.lastInsertRowid), 'default');
  return Number(room.lastInsertRowid);
}

function insertEvent(roomId: number, source: string, externalId: string, startsAt: string, endsAt: string) {
  sqlite
    .prepare(`
      INSERT INTO bookings_cache (room_id, source, external_id, title, starts_at, ends_at)
      VALUES (?, ?, ?, 'Existing', ?, ?)
    `)
    .run(roomId, source, externalId, startsAt, endsAt);
}

function isoIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

let app: FastifyInstance;

beforeEach(async () => {
  resetDb();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/rooms/:slug/bookings', () => {
  it('creates a walk-up when the room is free', async () => {
    seedRoom();
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/fellowship/bookings',
      // Use a unique IP per test to avoid the in-memory rate limiter carrying
      // counts across tests in the same process.
      remoteAddress: '10.0.0.1',
      payload: { title: 'Quick sync', endsAt: isoIn(30) },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe('Quick sync');
    expect(new Date(body.endsAt).getTime()).toBeGreaterThan(Date.now());

    const cacheRows = sqlite.prepare(`SELECT * FROM bookings_cache WHERE source='local_walkup'`).all();
    expect(cacheRows).toHaveLength(1);
    const walkupRows = sqlite.prepare(`SELECT * FROM walk_ups`).all();
    expect(walkupRows).toHaveLength(1);
  });

  it('defaults title to "Walk-up Booking" when omitted', async () => {
    seedRoom();
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/fellowship/bookings',
      remoteAddress: '10.0.0.2',
      payload: { endsAt: isoIn(30) },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe('Walk-up Booking');
  });

  it('returns 409 when an overlapping event exists', async () => {
    const roomId = seedRoom();
    insertEvent(roomId, 'ical', 'ext-1', isoIn(-5), isoIn(45));

    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/fellowship/bookings',
      remoteAddress: '10.0.0.3',
      payload: { title: 'Conflict', endsAt: isoIn(30) },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('overlap');

    expect(sqlite.prepare(`SELECT COUNT(*) AS c FROM walk_ups`).get()).toEqual({ c: 0 });
  });

  it('returns 404 for unknown room', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/nope/bookings',
      remoteAddress: '10.0.0.4',
      payload: { endsAt: isoIn(30) },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid endsAt', async () => {
    seedRoom();
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/fellowship/bookings',
      remoteAddress: '10.0.0.5',
      payload: { endsAt: 'not-a-date' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });

  it('rejects end times in the past after snap', async () => {
    seedRoom();
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/fellowship/bookings',
      remoteAddress: '10.0.0.6',
      payload: { endsAt: isoIn(-60) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_request');
  });

  it('rejects bookings longer than the 4-hour ceiling', async () => {
    seedRoom();
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/fellowship/bookings',
      remoteAddress: '10.0.0.7',
      payload: { endsAt: isoIn(5 * 60) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/4 hours/);
  });

  it('only one of two concurrent overlapping bookings succeeds', async () => {
    seedRoom();
    const payload = { endsAt: isoIn(30) };

    // Use different IPs so the rate limiter doesn't reject the second one
    // and we're only testing the transactional overlap check.
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/rooms/fellowship/bookings', remoteAddress: '10.0.1.1', payload }),
      app.inject({ method: 'POST', url: '/api/rooms/fellowship/bookings', remoteAddress: '10.0.1.2', payload }),
    ]);

    const statuses = [a.statusCode, b.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    expect(sqlite.prepare(`SELECT COUNT(*) AS c FROM walk_ups`).get()).toEqual({ c: 1 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS c FROM bookings_cache WHERE source='local_walkup'`).get()).toEqual({ c: 1 });
  });

  it('rate-limits the same IP after 10 bookings per hour', async () => {
    seedRoom();
    const ip = '10.0.2.1';
    // Use back-to-back non-overlapping windows by inserting our own walk-ups
    // outside the test path — but here we just hammer the same payload and
    // accept that calls 2..N will be 409. The 11th call should be 429.
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/rooms/fellowship/bookings',
        remoteAddress: ip,
        payload: { endsAt: isoIn(30) },
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });
});

describe('GET /api/rooms/:slug/available-durations', () => {
  it('returns all durations when the room is free', async () => {
    seedRoom();
    const res = await app.inject({ method: 'GET', url: '/api/rooms/fellowship/available-durations' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.availableSlots.map((s: { minutes: number }) => s.minutes)).toEqual([15, 30, 45, 60, 90, 120]);
    expect(body.nextEvent).toBeNull();
  });

  it('returns no slots when the room is currently occupied', async () => {
    const roomId = seedRoom();
    insertEvent(roomId, 'ical', 'ext-1', isoIn(-5), isoIn(30));

    const res = await app.inject({ method: 'GET', url: '/api/rooms/fellowship/available-durations' });
    const body = res.json();
    expect(body.availableSlots).toHaveLength(0);
  });

  it('drops durations that would overlap an upcoming event', async () => {
    const roomId = seedRoom();
    insertEvent(roomId, 'ical', 'ext-1', isoIn(40), isoIn(70));

    const res = await app.inject({ method: 'GET', url: '/api/rooms/fellowship/available-durations' });
    const body = res.json();
    const allowed = body.availableSlots.map((s: { minutes: number }) => s.minutes);
    expect(allowed).toContain(15);
    expect(allowed).toContain(30);
    expect(allowed).not.toContain(60);
    expect(allowed).not.toContain(90);
    expect(allowed).not.toContain(120);
    expect(body.nextEvent).not.toBeNull();
  });
});
