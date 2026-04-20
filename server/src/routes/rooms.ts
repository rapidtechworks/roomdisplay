import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, sqlite } from '../db/index.js';
import { DEFAULT_THEME } from '../../../shared/src/index.js';
import type {
  Theme,
  CachedEvent,
  RoomState,
  AvailableDurationsResponse,
  CreateBookingResponse,
} from '../../../shared/src/index.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATIONS    = [15, 30, 45, 60, 90, 120] as const;
const AGENDA_DAYS  = 7;

// ─── Validation ───────────────────────────────────────────────────────────────

const createBookingSchema = z.object({
  title:           z.string().min(1).max(100).optional(),
  durationMinutes: z.number().int().refine(
    (d) => (DURATIONS as readonly number[]).includes(d),
    { message: `Duration must be one of: ${DURATIONS.join(', ')}` },
  ),
});

// ─── Walk-up rate limiter ─────────────────────────────────────────────────────
// 10 bookings per hour per IP to prevent abuse

const bookingCounts = new Map<string, { count: number; resetAt: number }>();
const BOOKING_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const BOOKING_MAX       = 10;

function checkBookingRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = bookingCounts.get(ip);

  if (!entry || now >= entry.resetAt) {
    bookingCounts.set(ip, { count: 1, resetAt: now + BOOKING_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= BOOKING_MAX) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}

// Purge stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of bookingCounts.entries()) {
    if (now >= entry.resetAt) bookingCounts.delete(ip);
  }
}, 5 * 60 * 1000).unref();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Load the effective theme for a room (override → global → hardcoded default) */
async function loadTheme(themeOverrideId: number | null): Promise<Theme> {
  if (themeOverrideId !== null) {
    const row = await db
      .selectFrom('themes')
      .select('settings_json')
      .where('id', '=', themeOverrideId)
      .executeTakeFirst();
    if (row) {
      try { return JSON.parse(row.settings_json) as Theme; } catch { /* fall through */ }
    }
  }

  const globalRow = await db
    .selectFrom('themes')
    .select('settings_json')
    .where('is_global', '=', 1)
    .executeTakeFirst();
  if (globalRow) {
    try { return JSON.parse(globalRow.settings_json) as Theme; } catch { /* fall through */ }
  }

  return DEFAULT_THEME;
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerRoomRoutes(server: FastifyInstance) {

  // ── GET /api/rooms/:slug/state ─────────────────────────────────────────────
  // Public — no auth required. Tablet polls this every 30 s (+ WebSocket push).
  server.get<{ Params: { slug: string } }>(
    '/api/rooms/:slug/state',
    async (request, reply) => {
      const { slug } = request.params;

      const room = await db
        .selectFrom('rooms')
        .select(['id', 'slug', 'display_name', 'time_zone', 'theme_override_id'])
        .where('slug', '=', slug)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }

      const now       = new Date();
      const windowEnd = new Date(now.getTime() + AGENDA_DAYS * 24 * 60 * 60 * 1000);

      const rows = await db
        .selectFrom('bookings_cache')
        .select(['id', 'source', 'title', 'starts_at', 'ends_at'])
        .where('room_id',   '=', room.id)
        .where('ends_at',   '>', now.toISOString())
        .where('starts_at', '<', windowEnd.toISOString())
        .orderBy('starts_at', 'asc')
        .execute();

      const events: CachedEvent[] = rows.map((r) => ({
        id:       String(r.id),
        source:   r.source as CachedEvent['source'],
        title:    r.title,
        startsAt: r.starts_at,
        endsAt:   r.ends_at,
      }));

      const theme = await loadTheme(room.theme_override_id);

      const state: RoomState = {
        version:  1,
        cachedAt: now.toISOString(),
        roomSlug: room.slug,
        roomName: room.display_name,
        timeZone: room.time_zone,
        theme,
        events,
      };

      return reply.send(state);
    },
  );

  // ── GET /api/rooms/:slug/available-durations ───────────────────────────────
  // Public. Called when the tablet opens the "Book Now" sheet.
  server.get<{ Params: { slug: string } }>(
    '/api/rooms/:slug/available-durations',
    async (request, reply) => {
      const { slug } = request.params;

      const room = await db
        .selectFrom('rooms')
        .select('id')
        .where('slug', '=', slug)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }

      const now    = new Date();
      const maxEnd = new Date(now.getTime() + Math.max(...DURATIONS) * 60 * 1000);

      // All events that could overlap with any possible booking window starting now
      const upcoming = await db
        .selectFrom('bookings_cache')
        .select(['title', 'starts_at', 'ends_at'])
        .where('room_id',   '=', room.id)
        .where('ends_at',   '>', now.toISOString())
        .where('starts_at', '<', maxEnd.toISOString())
        .orderBy('starts_at', 'asc')
        .execute();

      const nowIso = now.toISOString();

      // Room is occupied if any event spans right now
      const occupied = upcoming.some(
        (e) => e.starts_at <= nowIso && e.ends_at > nowIso,
      );

      // First event that starts strictly in the future
      const nextEventRow = upcoming.find((e) => e.starts_at > nowIso) ?? null;

      const availableDurations: number[] = [];

      if (!occupied) {
        for (const dur of DURATIONS) {
          const proposedEnd = new Date(now.getTime() + dur * 60 * 1000).toISOString();
          // Available if no event overlaps [now, proposedEnd)
          const overlaps = upcoming.some(
            (e) => e.starts_at < proposedEnd && e.ends_at > nowIso,
          );
          if (!overlaps) availableDurations.push(dur);
        }
      }

      const response: AvailableDurationsResponse = {
        now:                nowIso,
        availableDurations,
        nextEvent: nextEventRow
          ? { title: nextEventRow.title, startsAt: nextEventRow.starts_at }
          : null,
      };

      return reply.send(response);
    },
  );

  // ── POST /api/rooms/:slug/bookings ─────────────────────────────────────────
  // Public. Creates a walk-up booking with a transactional overlap check.
  server.post<{ Params: { slug: string } }>(
    '/api/rooms/:slug/bookings',
    async (request, reply) => {
      // Per-IP rate limit
      const ip        = request.ip;
      const rateCheck = checkBookingRateLimit(ip);
      if (!rateCheck.allowed) {
        return reply.code(429).send({
          error:   'too_many_requests',
          message: `Too many bookings from this device. Try again in ${Math.ceil((rateCheck.retryAfterMs ?? 0) / 60_000)} minute(s).`,
        });
      }

      const { slug } = request.params;

      const room = await db
        .selectFrom('rooms')
        .select(['id', 'slug'])
        .where('slug', '=', slug)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }

      const parsed = createBookingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error:   'validation_error',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        });
      }

      const { durationMinutes, title } = parsed.data;
      const bookingTitle = title?.trim() || 'Walk-up Booking';
      const now          = new Date();
      const startsAt     = now;
      const endsAt       = new Date(now.getTime() + durationMinutes * 60 * 1000);
      const nowIso       = now.toISOString();
      const startsIso    = startsAt.toISOString();
      const endsIso      = endsAt.toISOString();

      // Transactional overlap check + insert
      type OverlapError = Error & { code: 'OVERLAP' };

      let walkupId: number;
      try {
        walkupId = sqlite.transaction((): number => {
          // Overlap: existing event starts before our end AND ends after our start
          const overlap = sqlite
            .prepare(`
              SELECT id FROM bookings_cache
              WHERE room_id   = ?
                AND starts_at < ?
                AND ends_at   > ?
            `)
            .get(room.id, endsIso, startsIso);

          if (overlap) {
            const err = new Error('Room is no longer available for that time slot') as OverlapError;
            err.code = 'OVERLAP';
            throw err;
          }

          // Insert walk_up record
          const walkupResult = sqlite
            .prepare(`
              INSERT INTO walk_ups (room_id, title, starts_at, ends_at, created_at, created_from_ip)
              VALUES (?, ?, ?, ?, ?, ?)
            `)
            .run(room.id, bookingTitle, startsIso, endsIso, nowIso, ip);

          const newId = Number(walkupResult.lastInsertRowid);

          // Mirror into bookings_cache so state endpoint picks it up immediately
          sqlite
            .prepare(`
              INSERT INTO bookings_cache
                (room_id, source, external_id, title, starts_at, ends_at, last_synced_at)
              VALUES (?, 'local_walkup', ?, ?, ?, ?, ?)
            `)
            .run(room.id, String(newId), bookingTitle, startsIso, endsIso, nowIso);

          return newId;
        })();

      } catch (err: unknown) {
        if (err instanceof Error && (err as OverlapError).code === 'OVERLAP') {
          return reply.code(409).send({
            error:   'overlap',
            message: (err as Error).message,
          });
        }
        throw err;
      }

      server.log.info({ roomId: room.id, walkupId, durationMinutes, ip }, 'Walk-up booking created');

      const response: CreateBookingResponse = {
        id:       walkupId,
        startsAt: startsIso,
        endsAt:   endsIso,
        title:    bookingTitle,
      };

      return reply.code(201).send(response);
    },
  );
}
