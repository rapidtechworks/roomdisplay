import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { requireAdmin } from '../../hooks/requireAdmin.js';
import { DEFAULT_THEME } from '../../../../shared/src/index.js';
import type { Theme } from '../../../../shared/src/index.js';
import { pushRoomState } from '../../lib/wsManager.js';

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
});

const updateGroupSchema = z.object({
  name:    z.string().min(1).max(100).optional(),
  themeId: z.number().int().positive().nullable().optional(),
});

export async function registerThemeGroupsRoutes(server: FastifyInstance) {
  const auth     = { preHandler: requireAdmin };
  const authCsrf = { preHandler: [requireAdmin, server.csrfProtection] };

  // ── GET /api/admin/theme-groups ───────────────────────────────────────────
  server.get('/api/admin/theme-groups', auth, async (_req, reply) => {
    const groups = await db
      .selectFrom('theme_groups')
      .select(['id', 'name', 'theme_id', 'created_at'])
      .orderBy('name', 'asc')
      .execute();

    // Count only rooms actively using group theme (theme_tier = 'group')
    const counts = await db
      .selectFrom('rooms')
      .select(['theme_group_id', db.fn.count<number>('id').as('n')])
      .where('theme_group_id', 'is not', null)
      .where('theme_tier', '=', 'group')
      .groupBy('theme_group_id')
      .execute();

    const countMap = new Map(counts.map((c) => [c.theme_group_id, Number(c.n)]));

    return reply.send(
      groups.map((g) => ({
        id:          g.id,
        name:        g.name,
        themeId:     g.theme_id,
        usingGlobal: g.theme_id === null,
        roomCount:   countMap.get(g.id) ?? 0,
        createdAt:   g.created_at,
      })),
    );
  });

  // ── POST /api/admin/theme-groups ──────────────────────────────────────────
  server.post('/api/admin/theme-groups', authCsrf, async (request, reply) => {
    const parsed = createGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', message: 'Invalid request body' });
    }

    const now    = new Date().toISOString();
    const result = await db
      .insertInto('theme_groups')
      .values({ name: parsed.data.name, theme_id: null, created_at: now })
      .returning(['id', 'name'])
      .executeTakeFirstOrThrow();

    server.log.info({ groupId: result.id }, 'Theme group created');
    return reply.code(201).send({ id: result.id, name: result.name });
  });

  // ── GET /api/admin/theme-groups/:id ──────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    '/api/admin/theme-groups/:id',
    auth,
    async (request, reply) => {
      const id = Number(request.params.id);
      const group = await db
        .selectFrom('theme_groups')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!group) {
        return reply.code(404).send({ error: 'not_found', message: 'Theme group not found' });
      }

      // Only rooms actively using this group's theme (not just remembered)
      const rooms = await db
        .selectFrom('rooms')
        .select(['id', 'slug', 'display_name'])
        .where('theme_group_id', '=', id)
        .where('theme_tier', '=', 'group')
        .orderBy('display_name', 'asc')
        .execute();

      return reply.send({
        id:          group.id,
        name:        group.name,
        themeId:     group.theme_id,
        usingGlobal: group.theme_id === null,
        createdAt:   group.created_at,
        rooms: rooms.map((r) => ({ id: r.id, slug: r.slug, displayName: r.display_name })),
      });
    },
  );

  // ── PATCH /api/admin/theme-groups/:id ─────────────────────────────────────
  server.patch<{ Params: { id: string } }>(
    '/api/admin/theme-groups/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const group = await db
        .selectFrom('theme_groups')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!group) {
        return reply.code(404).send({ error: 'not_found', message: 'Theme group not found' });
      }

      const parsed = updateGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_error', message: 'Invalid request body' });
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.name    !== undefined) updates['name']     = parsed.data.name;
      if (parsed.data.themeId !== undefined) updates['theme_id'] = parsed.data.themeId;

      if (Object.keys(updates).length > 0) {
        await db.updateTable('theme_groups').set(updates).where('id', '=', id).execute();
      }

      // Push rooms in this group if the theme changed
      if (parsed.data.themeId !== undefined) {
        const rooms = await db
          .selectFrom('rooms')
          .select('slug')
          .where('theme_group_id', '=', id)
          .where('theme_tier', '=', 'group')
          .execute();
        for (const r of rooms) {
          pushRoomState(r.slug).catch(() => { /* non-critical */ });
        }
      }

      return reply.send({ ok: true });
    },
  );

  // ── DELETE /api/admin/theme-groups/:id ────────────────────────────────────
  // Rooms in the group become unassigned (theme_group_id nulled by FK cascade).
  server.delete<{ Params: { id: string } }>(
    '/api/admin/theme-groups/:id',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const group = await db
        .selectFrom('theme_groups')
        .select(['id', 'theme_id'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!group) {
        return reply.code(404).send({ error: 'not_found', message: 'Theme group not found' });
      }

      await db.deleteFrom('theme_groups').where('id', '=', id).execute();
      // The referenced named theme stays in the library and can be reused elsewhere.

      server.log.info({ groupId: id }, 'Theme group deleted');
      return reply.send({ ok: true });
    },
  );

  // ── GET /api/admin/theme-groups/:id/theme ────────────────────────────────
  server.get<{ Params: { id: string } }>(
    '/api/admin/theme-groups/:id/theme',
    auth,
    async (request, reply) => {
      const id = Number(request.params.id);
      const group = await db
        .selectFrom('theme_groups')
        .select(['theme_id'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!group) {
        return reply.code(404).send({ error: 'not_found', message: 'Theme group not found' });
      }

      if (group.theme_id !== null) {
        const themeRow = await db
          .selectFrom('themes')
          .select(['id', 'settings_json'])
          .where('id', '=', group.theme_id)
          .executeTakeFirst();
        if (themeRow) {
          const settings: Theme = { ...DEFAULT_THEME, ...(JSON.parse(themeRow.settings_json) as Partial<Theme>) };
          return reply.send({ usingGlobal: false, themeId: themeRow.id, settings });
        }
      }

      // Fall back: return global settings as preview (not a custom theme)
      const globalRow = await db
        .selectFrom('themes')
        .select(['id', 'settings_json'])
        .where('is_global', '=', 1)
        .executeTakeFirst();

      const settings: Theme = globalRow
        ? { ...DEFAULT_THEME, ...(JSON.parse(globalRow.settings_json) as Partial<Theme>) }
        : DEFAULT_THEME;

      return reply.send({ usingGlobal: true, themeId: null, settings });
    },
  );

  // ── POST /api/admin/theme-groups/:id/theme ───────────────────────────────
  // Enable a custom theme for this group (copies from global as starting point).
  server.post<{ Params: { id: string } }>(
    '/api/admin/theme-groups/:id/theme',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const group = await db
        .selectFrom('theme_groups')
        .select(['id', 'name', 'theme_id'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!group) {
        return reply.code(404).send({ error: 'not_found', message: 'Theme group not found' });
      }

      if (group.theme_id !== null) {
        // Already has a custom theme — return existing
        const existing = await db
          .selectFrom('themes')
          .select(['id', 'settings_json'])
          .where('id', '=', group.theme_id)
          .executeTakeFirst();
        if (existing) {
          const settings: Theme = { ...DEFAULT_THEME, ...(JSON.parse(existing.settings_json) as Partial<Theme>) };
          return reply.send({ themeId: existing.id, settings });
        }
      }

      // Copy global theme as the starting point
      const globalRow = await db
        .selectFrom('themes')
        .select('settings_json')
        .where('is_global', '=', 1)
        .executeTakeFirst();

      const baseSettings = globalRow ? globalRow.settings_json : JSON.stringify(DEFAULT_THEME);
      const now          = new Date().toISOString();

      const newTheme = await db
        .insertInto('themes')
        .values({ name: group.name, is_global: 0, is_named: 1, settings_json: baseSettings, created_at: now, updated_at: now })
        .returning(['id', 'settings_json'])
        .executeTakeFirstOrThrow();

      await db.updateTable('theme_groups').set({ theme_id: newTheme.id }).where('id', '=', id).execute();

      const settings: Theme = { ...DEFAULT_THEME, ...(JSON.parse(newTheme.settings_json) as Partial<Theme>) };
      return reply.send({ themeId: newTheme.id, settings });
    },
  );

  // ── PATCH /api/admin/theme-groups/:id/theme ──────────────────────────────
  server.patch<{ Params: { id: string } }>(
    '/api/admin/theme-groups/:id/theme',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const group = await db
        .selectFrom('theme_groups')
        .select('theme_id')
        .where('id', '=', id)
        .executeTakeFirst();

      if (!group || group.theme_id === null) {
        return reply.code(404).send({ error: 'not_found', message: 'No custom theme for this group' });
      }

      const updates = request.body as Partial<Theme>;
      const existing = await db
        .selectFrom('themes')
        .select('settings_json')
        .where('id', '=', group.theme_id)
        .executeTakeFirstOrThrow();

      const merged = { ...JSON.parse(existing.settings_json) as Partial<Theme>, ...updates };
      await db
        .updateTable('themes')
        .set({ settings_json: JSON.stringify(merged), updated_at: new Date().toISOString() })
        .where('id', '=', group.theme_id)
        .execute();

      return reply.send({ ok: true });
    },
  );

  // ── DELETE /api/admin/theme-groups/:id/theme ─────────────────────────────
  // Remove the custom theme override — group reverts to global.
  server.delete<{ Params: { id: string } }>(
    '/api/admin/theme-groups/:id/theme',
    authCsrf,
    async (request, reply) => {
      const id = Number(request.params.id);
      const group = await db
        .selectFrom('theme_groups')
        .select(['id', 'theme_id'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!group) {
        return reply.code(404).send({ error: 'not_found', message: 'Theme group not found' });
      }

      if (group.theme_id !== null) {
        await db.updateTable('theme_groups').set({ theme_id: null }).where('id', '=', id).execute();
        // Named theme stays in the library; only the group's reference is removed.
      }

      return reply.send({ ok: true });
    },
  );
}
