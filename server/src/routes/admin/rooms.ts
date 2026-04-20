import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { requireAdmin } from '../../hooks/requireAdmin.js';
import { syncSource } from '../../lib/syncSource.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a display name to a URL-safe slug */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createRoomSchema = z.object({
  displayName:        z.string().min(1).max(100),
  slug:               z.string().optional(),   // auto-generated if omitted
  calendarSourceId:   z.number().int().positive(),
  externalCalendarId: z.string().min(1),
  timeZone:           z.string().min(1).default('America/Chicago'),
  themeOverrideId:    z.number().int().positive().nullable().default(null),
});

const updateRoomSchema = z.object({
  displayName:        z.string().min(1).max(100).optional(),
  slug:               z.string().optional(),
  calendarSourceId:   z.number().int().positive().optional(),
  externalCalendarId: z.string().min(1).optional(),
  timeZone:           z.string().min(1).optional(),
  themeOverrideId:    z.number().int().positive().nullable().optional(),
});

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerRoomsRoutes(server: FastifyInstance) {
  const auth     = { preHandler: requireAdmin };
  const authCsrf = { preHandler: [requireAdmin, server.csrfProtection] };

  // ── GET /api/admin/rooms ───────────────────────────────────────────────────
  server.get('/api/admin/rooms', auth, async (_req, reply) => {
    const rooms = await db
      .selectFrom('rooms as r')
      .innerJoin('calendar_sources as cs', 'cs.id', 'r.calendar_source_id')
      .select([
        'r.id', 'r.slug', 'r.display_name', 'r.time_zone',
        'r.calendar_source_id', 'r.external_calendar_id',
        'r.theme_override_id', 'r.background_image_path', 'r.created_at',
        'cs.display_name as source_name', 'cs.type as source_type',
      ])
      .orderBy('r.display_name', 'asc')
      .execute();

    return reply.send(
      rooms.map((r) => ({
        id:                 r.id,
        slug:               r.slug,
        displayName:        r.display_name,
        timeZone:           r.time_zone,
        calendarSourceId:   r.calendar_source_id,
        externalCalendarId: r.external_calendar_id,
        themeOverrideId:    r.theme_override_id,
        backgroundImagePath: r.background_image_path,
        createdAt:          r.created_at,
        source: {
          id:   r.calendar_source_id,
          name: r.source_name,
          type: r.source_type,
        },
      })),
    );
  });

  // ── POST /api/admin/rooms ──────────────────────────────────────────────────
  server.post('/api/admin/rooms', authCsrf, async (request, reply) => {
    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    const { displayName, calendarSourceId, externalCalendarId, timeZone, themeOverrideId } = parsed.data;

    // Resolve slug
    const slug = parsed.data.slug
      ? parsed.data.slug.toLowerCase().trim()
      : slugify(displayName);

    if (!isValidSlug(slug)) {
      return reply.code(400).send({
        error: 'invalid_slug',
        message: 'Slug must be lowercase letters, numbers, and hyphens only (e.g. "fellowship-hall")',
      });
    }

    // Check slug uniqueness
    const existing = await db
      .selectFrom('rooms')
      .select('id')
      .where('slug', '=', slug)
      .executeTakeFirst();

    if (existing) {
      return reply.code(409).send({
        error: 'slug_taken',
        message: `A room with slug "${slug}" already exists.`,
      });
    }

    // Verify the calendar source exists
    const source = await db
      .selectFrom('calendar_sources')
      .select('id')
      .where('id', '=', calendarSourceId)
      .executeTakeFirst();

    if (!source) {
      return reply.code(400).send({
        error: 'source_not_found',
        message: `Calendar source ${calendarSourceId} does not exist.`,
      });
    }

    const result = await db
      .insertInto('rooms')
      .values({
        slug,
        display_name:          displayName,
        calendar_source_id:    calendarSourceId,
        external_calendar_id:  externalCalendarId,
        time_zone:             timeZone,
        theme_override_id:     themeOverrideId,
        background_image_path: null,
        created_at:            new Date().toISOString(),
      })
      .returning(['id', 'slug'])
      .executeTakeFirstOrThrow();

    server.log.info({ roomId: result.id, slug: result.slug }, 'Room created');

    // Trigger an initial sync so events appear right away
    syncSource(calendarSourceId).catch((err: unknown) => {
      server.log.warn({ err, calendarSourceId }, 'Initial sync after room creation failed');
    });

    return reply.code(201).send({ id: result.id, slug: result.slug });
  });

  // ── GET /api/admin/rooms/:id ───────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    '/api/admin/rooms/:id',
    auth,
    async (request, reply) => {
      const id = Number(request.params.id);

      const room = await db
        .selectFrom('rooms as r')
        .innerJoin('calendar_sources as cs', 'cs.id', 'r.calendar_source_id')
        .select([
          'r.id', 'r.slug', 'r.display_name', 'r.time_zone',
          'r.calendar_source_id', 'r.external_calendar_id',
          'r.theme_override_id', 'r.background_image_path', 'r.created_at',
          'cs.display_name as source_name', 'cs.type as source_type',
        ])
        .where('r.id', '=', id)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }

      // Active walk-ups
      const now = new Date().toISOString();
      const activeWalkUps = await db
        .selectFrom('walk_ups')
        .select(['id', 'title', 'starts_at', 'ends_at', 'created_at', 'created_from_ip'])
        .where('room_id', '=', id)
        .where('ends_at', '>', now)
        .orderBy('starts_at', 'asc')
        .execute();

      return reply.send({
        id:                  room.id,
        slug:                room.slug,
        displayName:         room.display_name,
        timeZone:            room.time_zone,
        calendarSourceId:    room.calendar_source_id,
        externalCalendarId:  room.external_calendar_id,
        themeOverrideId:     room.theme_override_id,
        backgroundImagePath: room.background_image_path,
        createdAt:           room.created_at,
        source: {
          id:   room.calendar_source_id,
          name: room.source_name,
          type: room.source_type,
        },
        activeWalkUps,
      });
    },
  );

  // ── PATCH /api/admin/rooms/:id ─────────────────────────────────────────────
  server.patch<{ Params: { id: string } }>(
    '/api/admin/rooms/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const room = await db
        .selectFrom('rooms')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }

      const parsed = updateRoomSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'validation_error',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        });
      }

      const updates: Record<string, unknown> = {};
      const {
        displayName, slug, calendarSourceId,
        externalCalendarId, timeZone, themeOverrideId,
      } = parsed.data;

      if (displayName        !== undefined) updates['display_name']          = displayName;
      if (timeZone           !== undefined) updates['time_zone']             = timeZone;
      if (themeOverrideId    !== undefined) updates['theme_override_id']     = themeOverrideId;
      if (calendarSourceId   !== undefined) updates['calendar_source_id']   = calendarSourceId;
      if (externalCalendarId !== undefined) updates['external_calendar_id'] = externalCalendarId;

      if (slug !== undefined) {
        const cleanSlug = slug.toLowerCase().trim();
        if (!isValidSlug(cleanSlug)) {
          return reply.code(400).send({
            error: 'invalid_slug',
            message: 'Slug must be lowercase letters, numbers, and hyphens only.',
          });
        }
        const taken = await db
          .selectFrom('rooms')
          .select('id')
          .where('slug', '=', cleanSlug)
          .where('id', '!=', id)
          .executeTakeFirst();
        if (taken) {
          return reply.code(409).send({
            error: 'slug_taken',
            message: `Slug "${cleanSlug}" is already used by another room.`,
          });
        }
        updates['slug'] = cleanSlug;
      }

      if (Object.keys(updates).length > 0) {
        await db.updateTable('rooms').set(updates).where('id', '=', id).execute();
      }

      return reply.send({ ok: true });
    },
  );

  // ── DELETE /api/admin/rooms/:id ────────────────────────────────────────────
  server.delete<{ Params: { id: string } }>(
    '/api/admin/rooms/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const room = await db
        .selectFrom('rooms')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }

      // CASCADE on rooms handles bookings_cache, walk_ups, and tablet assignment
      await db.deleteFrom('rooms').where('id', '=', id).execute();
      server.log.info({ roomId: id }, 'Room deleted');

      return reply.send({ ok: true });
    },
  );

  // ── GET /api/admin/rooms/:id/events ───────────────────────────────────────
  server.get<{ Params: { id: string }; Querystring: { days?: string } }>(
    '/api/admin/rooms/:id/events',
    auth,
    async (request, reply) => {
      const id   = Number(request.params.id);
      const days = Math.min(Number(request.query.days ?? 14), 60);

      const room = await db
        .selectFrom('rooms')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }

      const now = new Date();
      const to  = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const events = await db
        .selectFrom('bookings_cache')
        .select(['id', 'source', 'external_id', 'title', 'starts_at', 'ends_at'])
        .where('room_id', '=', id)
        .where('ends_at',   '>', now.toISOString())
        .where('starts_at', '<', to.toISOString())
        .orderBy('starts_at', 'asc')
        .execute();

      return reply.send(events);
    },
  );

  // ── DELETE /api/admin/rooms/:id/walkups/:walkupId ─────────────────────────
  server.delete<{ Params: { id: string; walkupId: string } }>(
    '/api/admin/rooms/:id/walkups/:walkupId',
    authCsrf,
    async (request, reply) => {
      const roomId   = Number(request.params.id);
      const walkupId = Number(request.params.walkupId);

      const walkup = await db
        .selectFrom('walk_ups')
        .select('id')
        .where('id', '=', walkupId)
        .where('room_id', '=', roomId)
        .executeTakeFirst();

      if (!walkup) {
        return reply.code(404).send({ error: 'not_found', message: 'Walk-up not found' });
      }

      // Remove from both tables
      await db.deleteFrom('walk_ups').where('id', '=', walkupId).execute();
      await db
        .deleteFrom('bookings_cache')
        .where('source', '=', 'local_walkup')
        .where('external_id', '=', String(walkupId))
        .where('room_id', '=', roomId)
        .execute();

      server.log.info({ roomId, walkupId }, 'Walk-up deleted by admin');
      return reply.send({ ok: true });
    },
  );
}
