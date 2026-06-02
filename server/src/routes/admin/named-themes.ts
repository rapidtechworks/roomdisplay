/**
 * Admin routes for the named-theme library.
 *
 * Named themes are standalone, reusable theme objects that can be assigned
 * to rooms, groups, or used by schedules. The global theme is NOT a named theme.
 *
 *   GET    /api/admin/named-themes        – list all named themes
 *   POST   /api/admin/named-themes        – create a new named theme
 *   GET    /api/admin/named-themes/:id    – get a single named theme
 *   PATCH  /api/admin/named-themes/:id    – update name and/or settings
 *   DELETE /api/admin/named-themes/:id    – delete (only if not in use)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { requireAdmin } from '../../hooks/requireAdmin.js';
import { DEFAULT_THEME } from '../../../../shared/src/index.js';
import type { Theme as ThemeSettings } from '../../../../shared/src/index.js';
import { pushRoomState } from '../../lib/wsManager.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readGlobalSettings(): Promise<ThemeSettings> {
  const row = await db
    .selectFrom('themes')
    .select('settings_json')
    .where('is_global', '=', 1)
    .executeTakeFirst();
  if (!row) return DEFAULT_THEME;
  return { ...DEFAULT_THEME, ...(JSON.parse(row.settings_json) as Partial<ThemeSettings>) };
}

/** Push state to all rooms that use this theme (via override or group). */
async function pushRoomsForTheme(themeId: number): Promise<void> {
  // Rooms with direct override
  const directRooms = await db
    .selectFrom('rooms')
    .select('slug')
    .where('theme_override_id', '=', themeId)
    .where('theme_tier', '=', 'room')
    .execute();

  // Groups using this theme, then rooms in those groups
  const groups = await db
    .selectFrom('theme_groups')
    .select('id')
    .where('theme_id', '=', themeId)
    .execute();

  const groupRooms = groups.length > 0
    ? await db
        .selectFrom('rooms')
        .select('slug')
        .where('theme_group_id', 'in', groups.map((g) => g.id))
        .where('theme_tier', '=', 'group')
        .execute()
    : [];

  const allSlugs = new Set([
    ...directRooms.map((r) => r.slug),
    ...groupRooms.map((r) => r.slug),
  ]);

  for (const slug of allSlugs) {
    pushRoomState(slug).catch(() => { /* non-critical */ });
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerNamedThemesRoutes(server: FastifyInstance) {
  const auth     = { preHandler: requireAdmin };
  const authCsrf = { preHandler: [requireAdmin, server.csrfProtection] };

  // ── GET /api/admin/named-themes ───────────────────────────────────────────
  server.get('/api/admin/named-themes', auth, async (_req, reply) => {
    const themes = await db
      .selectFrom('themes')
      .select(['id', 'name', 'settings_json', 'created_at', 'updated_at'])
      .where('is_named', '=', 1)
      .orderBy('name', 'asc')
      .execute();

    // Count usages
    const roomCounts = await db
      .selectFrom('rooms')
      .select(['theme_override_id', db.fn.count<number>('id').as('n')])
      .where('theme_override_id', 'is not', null)
      .groupBy('theme_override_id')
      .execute();
    const roomCountMap = new Map(roomCounts.map((r) => [r.theme_override_id, Number(r.n)]));

    const groupCounts = await db
      .selectFrom('theme_groups')
      .select(['theme_id', db.fn.count<number>('id').as('n')])
      .where('theme_id', 'is not', null)
      .groupBy('theme_id')
      .execute();
    const groupCountMap = new Map(groupCounts.map((g) => [g.theme_id, Number(g.n)]));

    const schedCounts = await db
      .selectFrom('theme_schedules')
      .select(['theme_id', db.fn.count<number>('id').as('n')])
      .groupBy('theme_id')
      .execute();
    const schedCountMap = new Map(schedCounts.map((s) => [s.theme_id, Number(s.n)]));

    return reply.send(
      themes.map((t) => ({
        id:              t.id,
        name:            t.name,
        settings:        { ...DEFAULT_THEME, ...(JSON.parse(t.settings_json) as Partial<ThemeSettings>) },
        usedByRooms:     roomCountMap.get(t.id) ?? 0,
        usedByGroups:    groupCountMap.get(t.id) ?? 0,
        usedBySchedules: schedCountMap.get(t.id) ?? 0,
        createdAt:       t.created_at,
        updatedAt:       t.updated_at,
      })),
    );
  });

  // ── POST /api/admin/named-themes ──────────────────────────────────────────
  server.post('/api/admin/named-themes', authCsrf, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', message: 'Invalid request body' });
    }

    const globalSettings = await readGlobalSettings();
    const now = new Date().toISOString();

    const result = await db
      .insertInto('themes')
      .values({
        name:          parsed.data.name,
        is_global:     0,
        is_named:      1,
        settings_json: JSON.stringify(globalSettings),
        created_at:    now,
        updated_at:    now,
      })
      .returning(['id', 'name', 'settings_json', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();

    server.log.info({ themeId: result.id, name: result.name }, 'Named theme created');

    return reply.code(201).send({
      id:              result.id,
      name:            result.name,
      settings:        { ...DEFAULT_THEME, ...(JSON.parse(result.settings_json) as Partial<ThemeSettings>) },
      usedByRooms:     0,
      usedByGroups:    0,
      usedBySchedules: 0,
      createdAt:       result.created_at,
      updatedAt:       result.updated_at,
    });
  });

  // ── GET /api/admin/named-themes/:id ──────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    '/api/admin/named-themes/:id',
    auth,
    async (request, reply) => {
      const id = Number(request.params.id);
      const theme = await db
        .selectFrom('themes')
        .select(['id', 'name', 'settings_json', 'created_at', 'updated_at'])
        .where('id', '=', id)
        .where('is_named', '=', 1)
        .executeTakeFirst();

      if (!theme) {
        return reply.code(404).send({ error: 'not_found', message: 'Named theme not found' });
      }

      return reply.send({
        id:       theme.id,
        name:     theme.name,
        settings: { ...DEFAULT_THEME, ...(JSON.parse(theme.settings_json) as Partial<ThemeSettings>) },
        createdAt: theme.created_at,
        updatedAt: theme.updated_at,
      });
    },
  );

  // ── PATCH /api/admin/named-themes/:id ────────────────────────────────────
  // Body: { name?: string } to rename, plus any Theme settings fields to update.
  server.patch<{ Params: { id: string } }>(
    '/api/admin/named-themes/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const theme = await db
        .selectFrom('themes')
        .select(['id', 'name', 'settings_json'])
        .where('id', '=', id)
        .where('is_named', '=', 1)
        .executeTakeFirst();

      if (!theme) {
        return reply.code(404).send({ error: 'not_found', message: 'Named theme not found' });
      }

      const body = request.body as Record<string, unknown>;
      const { name: newName, ...settingsPatch } = body;

      const nameUpdate = updateSchema.safeParse({ name: newName });
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updated_at: now };

      if (newName !== undefined) {
        if (!nameUpdate.success) {
          return reply.code(400).send({ error: 'validation_error', message: 'Invalid name' });
        }
        updates['name'] = nameUpdate.data.name;
      }

      if (Object.keys(settingsPatch).length > 0) {
        const current: ThemeSettings = {
          ...DEFAULT_THEME,
          ...(JSON.parse(theme.settings_json) as Partial<ThemeSettings>),
        };
        const merged = { ...current, ...(settingsPatch as Partial<ThemeSettings>) };
        updates['settings_json'] = JSON.stringify(merged);
      }

      await db.updateTable('themes').set(updates).where('id', '=', id).execute();

      await pushRoomsForTheme(id);

      return reply.send({ ok: true });
    },
  );

  // ── DELETE /api/admin/named-themes/:id ───────────────────────────────────
  server.delete<{ Params: { id: string } }>(
    '/api/admin/named-themes/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const theme = await db
        .selectFrom('themes')
        .select('id')
        .where('id', '=', id)
        .where('is_named', '=', 1)
        .executeTakeFirst();

      if (!theme) {
        return reply.code(404).send({ error: 'not_found', message: 'Named theme not found' });
      }

      // Check if referenced by any rooms, groups, or schedules
      const roomRef = await db
        .selectFrom('rooms')
        .select('id')
        .where('theme_override_id', '=', id)
        .executeTakeFirst();

      const groupRef = await db
        .selectFrom('theme_groups')
        .select('id')
        .where('theme_id', '=', id)
        .executeTakeFirst();

      const schedRef = await db
        .selectFrom('theme_schedules')
        .select('id')
        .where('theme_id', '=', id)
        .executeTakeFirst();

      if (roomRef || groupRef || schedRef) {
        return reply.code(409).send({
          error:   'theme_in_use',
          message: 'Cannot delete a theme that is currently assigned to rooms, groups, or schedules.',
        });
      }

      await db.deleteFrom('themes').where('id', '=', id).execute();
      server.log.info({ themeId: id }, 'Named theme deleted');

      return reply.send({ ok: true });
    },
  );
}
