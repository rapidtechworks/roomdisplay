/**
 * Admin routes for theme schedules.
 *
 * Schedules automatically apply a named theme at a given time window,
 * with either a weekly recurring or one-time recurrence pattern.
 * Schedule priority: room > group > global (same as the static tier system).
 *
 *   GET    /api/admin/theme-schedules        – list all schedules
 *   POST   /api/admin/theme-schedules        – create a schedule
 *   PATCH  /api/admin/theme-schedules/:id    – update a schedule
 *   DELETE /api/admin/theme-schedules/:id    – delete a schedule
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { requireAdmin } from '../../hooks/requireAdmin.js';

// ─── Validation ───────────────────────────────────────────────────────────────

const scheduleBase = z.object({
  name:           z.string().min(1).max(100),
  themeId:        z.number().int().positive(),
  scopeType:      z.enum(['global', 'group', 'room']),
  scopeId:        z.number().int().positive().nullable().optional(),
  recurrenceType: z.enum(['weekly', 'one_time']),
  dayOfWeek:      z.number().int().min(0).max(6).nullable().optional(),
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  startTime:      z.string().regex(/^\d{2}:\d{2}$/),
  endTime:        z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timeZone:       z.string().min(1).max(100),
  enabled:        z.boolean().optional().default(true),
});

const createSchema = scheduleBase;
const updateSchema = scheduleBase.partial();

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerThemeSchedulesRoutes(server: FastifyInstance) {
  const auth     = { preHandler: requireAdmin };
  const authCsrf = { preHandler: [requireAdmin, server.csrfProtection] };

  // ── GET /api/admin/theme-schedules ────────────────────────────────────────
  server.get('/api/admin/theme-schedules', auth, async (_req, reply) => {
    const schedules = await db
      .selectFrom('theme_schedules as s')
      .innerJoin('themes as t', 't.id', 's.theme_id')
      .select([
        's.id', 's.name', 's.theme_id', 't.name as theme_name',
        's.scope_type', 's.scope_id', 's.recurrence_type',
        's.day_of_week', 's.date', 's.start_time', 's.end_time',
        's.time_zone', 's.enabled', 's.created_at',
      ])
      .orderBy('s.name', 'asc')
      .execute();

    // Resolve scope names
    const roomIds   = schedules.filter((s) => s.scope_type === 'room'  && s.scope_id).map((s) => s.scope_id!);
    const groupIds  = schedules.filter((s) => s.scope_type === 'group' && s.scope_id).map((s) => s.scope_id!);

    const rooms = roomIds.length > 0
      ? await db.selectFrom('rooms').select(['id', 'display_name']).where('id', 'in', roomIds).execute()
      : [];
    const groups = groupIds.length > 0
      ? await db.selectFrom('theme_groups').select(['id', 'name']).where('id', 'in', groupIds).execute()
      : [];

    const roomMap  = new Map(rooms.map((r) => [r.id, r.display_name]));
    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

    return reply.send(
      schedules.map((s) => ({
        id:             s.id,
        name:           s.name,
        themeId:        s.theme_id,
        themeName:      s.theme_name,
        scopeType:      s.scope_type,
        scopeId:        s.scope_id,
        scopeName:      s.scope_type === 'global'
          ? 'All Rooms'
          : s.scope_type === 'room'
            ? (roomMap.get(s.scope_id!) ?? `Room ${s.scope_id}`)
            : (groupMap.get(s.scope_id!) ?? `Group ${s.scope_id}`),
        recurrenceType: s.recurrence_type,
        dayOfWeek:      s.day_of_week,
        date:           s.date,
        startTime:      s.start_time,
        endTime:        s.end_time,
        timeZone:       s.time_zone,
        enabled:        s.enabled === 1,
        createdAt:      s.created_at,
      })),
    );
  });

  // ── POST /api/admin/theme-schedules ───────────────────────────────────────
  server.post('/api/admin/theme-schedules', authCsrf, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error:   'validation_error',
        message: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    const d = parsed.data;

    // Validate: weekly requires dayOfWeek; one_time requires date
    if (d.recurrenceType === 'weekly' && (d.dayOfWeek === null || d.dayOfWeek === undefined)) {
      return reply.code(400).send({ error: 'validation_error', message: 'Weekly schedule requires dayOfWeek' });
    }
    if (d.recurrenceType === 'one_time' && !d.date) {
      return reply.code(400).send({ error: 'validation_error', message: 'One-time schedule requires date' });
    }
    // Validate: non-global scopes require scopeId
    if (d.scopeType !== 'global' && !d.scopeId) {
      return reply.code(400).send({ error: 'validation_error', message: 'Group and room scopes require scopeId' });
    }

    // Validate theme is a named theme
    const theme = await db
      .selectFrom('themes')
      .select('id')
      .where('id', '=', d.themeId)
      .where('is_named', '=', 1)
      .executeTakeFirst();

    if (!theme) {
      return reply.code(400).send({ error: 'invalid_theme', message: 'Theme not found in library' });
    }

    const result = await db
      .insertInto('theme_schedules')
      .values({
        name:            d.name,
        theme_id:        d.themeId,
        scope_type:      d.scopeType,
        scope_id:        d.scopeId ?? null,
        recurrence_type: d.recurrenceType,
        day_of_week:     d.dayOfWeek ?? null,
        date:            d.date ?? null,
        start_time:      d.startTime,
        end_time:        d.endTime ?? null,
        time_zone:       d.timeZone,
        enabled:         d.enabled ? 1 : 0,
        created_at:      new Date().toISOString(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    server.log.info({ scheduleId: result.id, name: d.name }, 'Theme schedule created');
    return reply.code(201).send({ id: result.id });
  });

  // ── PATCH /api/admin/theme-schedules/:id ─────────────────────────────────
  server.patch<{ Params: { id: string } }>(
    '/api/admin/theme-schedules/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);

      const existing = await db
        .selectFrom('theme_schedules')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return reply.code(404).send({ error: 'not_found', message: 'Schedule not found' });
      }

      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_error', message: 'Invalid request body' });
      }

      const d = parsed.data;
      const updates: Record<string, unknown> = {};

      if (d.name           !== undefined) updates['name']            = d.name;
      if (d.themeId        !== undefined) updates['theme_id']        = d.themeId;
      if (d.scopeType      !== undefined) updates['scope_type']      = d.scopeType;
      if (d.scopeId        !== undefined) updates['scope_id']        = d.scopeId;
      if (d.recurrenceType !== undefined) updates['recurrence_type'] = d.recurrenceType;
      if (d.dayOfWeek      !== undefined) updates['day_of_week']     = d.dayOfWeek;
      if (d.date           !== undefined) updates['date']            = d.date;
      if (d.startTime      !== undefined) updates['start_time']      = d.startTime;
      if (d.endTime        !== undefined) updates['end_time']        = d.endTime;
      if (d.timeZone       !== undefined) updates['time_zone']       = d.timeZone;
      if (d.enabled        !== undefined) updates['enabled']         = d.enabled ? 1 : 0;

      if (Object.keys(updates).length > 0) {
        await db.updateTable('theme_schedules').set(updates).where('id', '=', id).execute();
      }

      return reply.send({ ok: true });
    },
  );

  // ── DELETE /api/admin/theme-schedules/:id ────────────────────────────────
  server.delete<{ Params: { id: string } }>(
    '/api/admin/theme-schedules/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);

      const existing = await db
        .selectFrom('theme_schedules')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return reply.code(404).send({ error: 'not_found', message: 'Schedule not found' });
      }

      await db.deleteFrom('theme_schedules').where('id', '=', id).execute();
      server.log.info({ scheduleId: id }, 'Theme schedule deleted');
      return reply.send({ ok: true });
    },
  );
}
