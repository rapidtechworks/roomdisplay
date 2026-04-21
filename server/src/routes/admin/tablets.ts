import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { requireAdmin } from '../../hooks/requireAdmin.js';
import { getConnectedTablets } from '../../lib/wsManager.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateTabletSchema = z.object({
  label:          z.string().min(1).max(100).nullable().optional(),
  assignedRoomId: z.number().int().positive().nullable().optional(),
});

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerTabletsRoutes(server: FastifyInstance) {
  const auth     = { preHandler: requireAdmin };
  const authCsrf = { preHandler: [requireAdmin, server.csrfProtection] };

  // ── GET /api/admin/tablets ─────────────────────────────────────────────────
  server.get('/api/admin/tablets', auth, async (_req, reply) => {
    const rows = await db
      .selectFrom('tablets as t')
      .leftJoin('rooms as r', 'r.id', 't.assigned_room_id')
      .select([
        't.tablet_uuid',
        't.label',
        't.last_seen_at',
        't.last_ip',
        't.user_agent',
        't.assigned_room_id',
        't.created_at',
        'r.slug as assigned_room_slug',
        'r.display_name as assigned_room_name',
      ])
      .orderBy('t.last_seen_at', 'desc')
      .execute();

    // Merge with in-memory connected tablets
    const connected = getConnectedTablets();
    const connectedByUuid = new Map(connected.map((c) => [c.tabletUuid, c]));

    const tablets = rows.map((row) => {
      const live = connectedByUuid.get(row.tablet_uuid);
      return {
        tabletUuid:       row.tablet_uuid,
        label:            row.label,
        lastSeenAt:       row.last_seen_at,
        lastIp:           row.last_ip,
        userAgent:        row.user_agent,
        assignedRoomId:   row.assigned_room_id,
        assignedRoomSlug: row.assigned_room_slug ?? null,
        assignedRoomName: row.assigned_room_name ?? null,
        createdAt:        row.created_at,
        online:           live !== undefined,
        currentSlug:      live?.slug ?? null,
      };
    });

    return reply.send(tablets);
  });

  // ── PATCH /api/admin/tablets/:uuid ─────────────────────────────────────────
  server.patch<{ Params: { uuid: string } }>(
    '/api/admin/tablets/:uuid',
    authCsrf,
    async (request, reply) => {
      const { uuid } = request.params;

      const tablet = await db
        .selectFrom('tablets')
        .select('tablet_uuid')
        .where('tablet_uuid', '=', uuid)
        .executeTakeFirst();

      if (!tablet) {
        return reply.code(404).send({ error: 'not_found', message: 'Tablet not found' });
      }

      const parsed = updateTabletSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'validation_error',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        });
      }

      const updates: Record<string, unknown> = {};
      const { label, assignedRoomId } = parsed.data;

      if (label !== undefined)          updates['label']            = label;
      if (assignedRoomId !== undefined) updates['assigned_room_id'] = assignedRoomId;

      if (Object.keys(updates).length > 0) {
        await db
          .updateTable('tablets')
          .set(updates)
          .where('tablet_uuid', '=', uuid)
          .execute();
      }

      return reply.send({ ok: true });
    },
  );
}
