import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, sqlite } from '../db/index.js';
import { buildRoomState } from '../lib/roomState.js';
import { pushRoomState } from '../lib/wsManager.js';
import type {
  AvailableDurationsResponse,
  CreateBookingResponse,
} from '../../../shared/src/index.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATIONS = [15, 30, 45, 60, 90, 120] as const;

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

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerRoomRoutes(server: FastifyInstance) {

  // ── GET /api/rooms/:slug/state ─────────────────────────────────────────────
  server.get<{ Params: { slug: string } }>(
    '/api/rooms/:slug/state',
    async (request, reply) => {
      const state = await buildRoomState(request.params.slug);
      if (!state) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }
      return reply.send(state);
    },
  );

  // ── GET /api/rooms/:slug/available-durations ───────────────────────────────
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
      const nowIso = now.toISOString();

      // All events that could overlap with any possible booking window starting now
      const upcoming = await db
        .selectFrom('bookings_cache')
        .select(['title', 'starts_at', 'ends_at'])
        .where('room_id',   '=', room.id)
        .where('ends_at',   '>', nowIso)
        .where('starts_at', '<', maxEnd.toISOString())
        .orderBy('starts_at', 'asc')
        .execute();

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
      const startsIso    = now.toISOString();
      const endsIso      = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();

      type OverlapError = Error & { code: 'OVERLAP' };

      let walkupId: number;
      try {
        walkupId = sqlite.transaction((): number => {
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

          const walkupResult = sqlite
            .prepare(`
              INSERT INTO walk_ups (room_id, title, starts_at, ends_at, created_at, created_from_ip)
              VALUES (?, ?, ?, ?, ?, ?)
            `)
            .run(room.id, bookingTitle, startsIso, endsIso, startsIso, ip);

          const newId = Number(walkupResult.lastInsertRowid);

          sqlite
            .prepare(`
              INSERT INTO bookings_cache
                (room_id, source, external_id, title, starts_at, ends_at, last_synced_at)
              VALUES (?, 'local_walkup', ?, ?, ?, ?, ?)
            `)
            .run(room.id, String(newId), bookingTitle, startsIso, endsIso, startsIso);

          return newId;
        })();

      } catch (err: unknown) {
        if (err instanceof Error && (err as OverlapError).code === 'OVERLAP') {
          return reply.code(409).send({ error: 'overlap', message: (err as Error).message });
        }
        throw err;
      }

      server.log.info({ roomId: room.id, walkupId, durationMinutes, ip }, 'Walk-up booking created');

      // Push updated state to all subscribed tablets immediately
      pushRoomState(slug).catch((err: unknown) => {
        server.log.warn({ err, slug }, 'WS push after booking failed');
      });

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
