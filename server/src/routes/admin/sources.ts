import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { encryptJson, decryptJson } from '../../crypto.js';
import { buildProvider } from '../../providers/index.js';
import { syncSource } from '../../lib/syncSource.js';
import { requireAdmin } from '../../hooks/requireAdmin.js';
import type { IcalCredentials } from '../../providers/base.js';

// ─── Validation schemas ───────────────────────────────────────────────────────

const icalCredentialsSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  httpAuth: z
    .object({ username: z.string().min(1), password: z.string().min(1) })
    .nullable()
    .default(null),
});

const createSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ical'),
    displayName: z.string().min(1).max(100),
    credentials: icalCredentialsSchema,
    pollIntervalSeconds: z.number().int().min(60).max(3600).default(300),
  }),
  z.object({
    type: z.literal('pco'),
    displayName: z.string().min(1).max(100),
    credentials: z.object({
      authType: z.literal('pat'),
      clientId: z.string().min(1),
      secret: z.string().min(1),
    }),
    pollIntervalSeconds: z.number().int().min(60).max(900).default(120),
  }),
]);

const updateSourceSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  pollIntervalSeconds: z.number().int().min(60).max(3600).optional(),
  // Credentials are updated separately (replace-all only, never partial)
  credentials: z.record(z.unknown()).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Never return raw credentials — mask the URL after first save */
function maskCredentials(type: string, encrypted: string): Record<string, unknown> {
  try {
    const creds = decryptJson<Record<string, unknown>>(encrypted);
    if (type === 'ical') {
      return { url: '••••••••', hasHttpAuth: creds['httpAuth'] !== null };
    }
    return { authType: creds['authType'], clientId: creds['clientId'], secret: '••••••••' };
  } catch {
    return { error: 'Could not read credentials' };
  }
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerSourcesRoutes(server: FastifyInstance) {
  // All routes in this file require auth
  const auth = { preHandler: requireAdmin };
  const authCsrf = { preHandler: [requireAdmin, server.csrfProtection] };

  // ── GET /api/admin/sources ─────────────────────────────────────────────────
  server.get('/api/admin/sources', auth, async (_req, reply) => {
    const sources = await db
      .selectFrom('calendar_sources')
      .select([
        'id', 'type', 'display_name', 'poll_interval_seconds',
        'last_synced_at', 'last_sync_status', 'last_sync_error',
        'created_at', 'credentials_encrypted',
      ])
      .orderBy('created_at', 'asc')
      .execute();

    return reply.send(
      sources.map((s) => ({
        id: s.id,
        type: s.type,
        displayName: s.display_name,
        pollIntervalSeconds: s.poll_interval_seconds,
        lastSyncedAt: s.last_synced_at,
        lastSyncStatus: s.last_sync_status,
        lastSyncError: s.last_sync_error,
        createdAt: s.created_at,
        credentials: maskCredentials(s.type, s.credentials_encrypted),
      })),
    );
  });

  // ── POST /api/admin/sources ────────────────────────────────────────────────
  server.post('/api/admin/sources', authCsrf, async (request, reply) => {
    const parsed = createSourceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    const { type, displayName, credentials, pollIntervalSeconds } = parsed.data;

    // Test connection before saving
    const encrypted = encryptJson(credentials);
    const testSource = {
      id: 0,
      type,
      display_name: displayName,
      credentials_encrypted: encrypted,
      poll_interval_seconds: pollIntervalSeconds,
      last_synced_at: null,
      last_sync_status: 'pending' as const,
      last_sync_error: null,
      created_at: new Date().toISOString(),
    };
    const provider = buildProvider(testSource);
    const test = await provider.testConnection();

    if (!test.ok) {
      return reply.code(422).send({
        error: 'connection_failed',
        message: test.message,
      });
    }

    const now = new Date().toISOString();
    const result = await db
      .insertInto('calendar_sources')
      .values({
        type,
        display_name: displayName,
        credentials_encrypted: encrypted,
        poll_interval_seconds: pollIntervalSeconds,
        last_sync_status: 'pending',
        created_at: now,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    server.log.info({ sourceId: result.id, type }, 'Calendar source created');

    return reply.code(201).send({ id: result.id });
  });

  // ── GET /api/admin/sources/:id ─────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    '/api/admin/sources/:id',
    auth,
    async (request, reply) => {
      const id = Number(request.params.id);
      const source = await db
        .selectFrom('calendar_sources')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!source) {
        return reply.code(404).send({ error: 'not_found', message: 'Source not found' });
      }

      // Count rooms mapped to this source
      const [roomCount] = await db
        .selectFrom('rooms')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('calendar_source_id', '=', id)
        .execute();

      return reply.send({
        id: source.id,
        type: source.type,
        displayName: source.display_name,
        pollIntervalSeconds: source.poll_interval_seconds,
        lastSyncedAt: source.last_synced_at,
        lastSyncStatus: source.last_sync_status,
        lastSyncError: source.last_sync_error,
        createdAt: source.created_at,
        credentials: maskCredentials(source.type, source.credentials_encrypted),
        roomCount: roomCount?.count ?? 0,
      });
    },
  );

  // ── PATCH /api/admin/sources/:id ───────────────────────────────────────────
  server.patch<{ Params: { id: string } }>(
    '/api/admin/sources/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const source = await db
        .selectFrom('calendar_sources')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!source) {
        return reply.code(404).send({ error: 'not_found', message: 'Source not found' });
      }

      const parsed = updateSourceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'validation_error',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        });
      }

      const { displayName, pollIntervalSeconds, credentials } = parsed.data;
      const updates: Record<string, unknown> = {};

      if (displayName !== undefined) updates['display_name'] = displayName;
      if (pollIntervalSeconds !== undefined) updates['poll_interval_seconds'] = pollIntervalSeconds;

      if (credentials !== undefined) {
        // Re-validate and test new credentials before saving
        const newEncrypted = encryptJson(credentials);
        const testSource = { ...source, credentials_encrypted: newEncrypted };
        const provider = buildProvider(testSource);
        const test = await provider.testConnection();
        if (!test.ok) {
          return reply.code(422).send({ error: 'connection_failed', message: test.message });
        }
        updates['credentials_encrypted'] = newEncrypted;
      }

      if (Object.keys(updates).length > 0) {
        await db
          .updateTable('calendar_sources')
          .set(updates)
          .where('id', '=', id)
          .execute();
      }

      return reply.send({ ok: true });
    },
  );

  // ── DELETE /api/admin/sources/:id ──────────────────────────────────────────
  server.delete<{ Params: { id: string } }>(
    '/api/admin/sources/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const source = await db
        .selectFrom('calendar_sources')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!source) {
        return reply.code(404).send({ error: 'not_found', message: 'Source not found' });
      }

      // Warn if rooms are still mapped
      const [roomCount] = await db
        .selectFrom('rooms')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('calendar_source_id', '=', id)
        .execute();

      if ((roomCount?.count ?? 0) > 0) {
        return reply.code(409).send({
          error: 'has_rooms',
          message: `This source has ${roomCount?.count ?? 0} room(s) mapped to it. Remove or remap them before deleting the source.`,
        });
      }

      await db.deleteFrom('calendar_sources').where('id', '=', id).execute();
      server.log.info({ sourceId: id }, 'Calendar source deleted');

      return reply.send({ ok: true });
    },
  );

  // ── POST /api/admin/sources/:id/test ──────────────────────────────────────
  server.post<{ Params: { id: string } }>(
    '/api/admin/sources/:id/test',
    auth,
    async (request, reply) => {
      const id = Number(request.params.id);
      const source = await db
        .selectFrom('calendar_sources')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!source) {
        return reply.code(404).send({ error: 'not_found', message: 'Source not found' });
      }

      const provider = buildProvider(source);
      const result = await provider.testConnection();

      return reply.send(result);
    },
  );

  // ── POST /api/admin/sources/:id/sync ──────────────────────────────────────
  server.post<{ Params: { id: string } }>(
    '/api/admin/sources/:id/sync',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const source = await db
        .selectFrom('calendar_sources')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!source) {
        return reply.code(404).send({ error: 'not_found', message: 'Source not found' });
      }

      const result = await syncSource(id);
      return reply.send(result);
    },
  );

  // ── GET /api/admin/sources/:id/calendars ──────────────────────────────────
  server.get<{ Params: { id: string } }>(
    '/api/admin/sources/:id/calendars',
    auth,
    async (request, reply) => {
      const id = Number(request.params.id);
      const source = await db
        .selectFrom('calendar_sources')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!source) {
        return reply.code(404).send({ error: 'not_found', message: 'Source not found' });
      }

      const provider = buildProvider(source);

      try {
        const calendars = await provider.listCalendars();

        // For each calendar, check if a room is already mapped to it
        const mappedRooms = await db
          .selectFrom('rooms')
          .select(['external_calendar_id', 'id', 'slug', 'display_name'])
          .where('calendar_source_id', '=', id)
          .execute();

        const mappedByCalId = new Map(
          mappedRooms.map((r) => [r.external_calendar_id, r]),
        );

        return reply.send(
          calendars.map((cal) => ({
            id: cal.id,
            name: cal.name,
            kind: cal.kind ?? null,
            mappedRoom: mappedByCalId.get(cal.id) ?? null,
          })),
        );
      } catch (err) {
        return reply.code(502).send({
          error: 'provider_error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
