/**
 * Admin theme routes
 *
 * Global theme:
 *   GET  /api/admin/themes/global           – fetch global settings
 *   PATCH /api/admin/themes/global          – update global settings (partial)
 *
 * Image uploads:
 *   POST /api/admin/images/upload           – multipart; returns { path }
 *
 * Per-room theme overrides:
 *   GET    /api/admin/rooms/:id/theme       – effective theme + whether it's custom
 *   POST   /api/admin/rooms/:id/theme       – enable room override (copies global)
 *   PATCH  /api/admin/rooms/:id/theme       – update room override fields
 *   DELETE /api/admin/rooms/:id/theme       – remove override, revert to global
 */
import type { FastifyInstance } from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../../db/index.js';
import { requireAdmin } from '../../hooks/requireAdmin.js';
import { config } from '../../config.js';
import { DEFAULT_THEME } from '../../../../shared/src/index.js';
import type { Theme } from '../../../../shared/src/index.js';
import { loadTheme } from '../../lib/roomState.js';
import { pushRoomState } from '../../lib/wsManager.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read the global theme row, merge with DEFAULT_THEME so new fields always have values. */
async function readGlobalTheme(): Promise<{ id: number; name: string; settings: Theme }> {
  const row = await db
    .selectFrom('themes')
    .select(['id', 'name', 'settings_json'])
    .where('is_global', '=', 1)
    .executeTakeFirst();

  if (!row) throw new Error('Global theme row missing — run migrations');

  const settings: Theme = {
    ...DEFAULT_THEME,
    ...(JSON.parse(row.settings_json) as Partial<Theme>),
  };
  return { id: row.id, name: row.name, settings };
}

/** Push fresh room state to any connected tablets after a theme change. */
async function pushAllRoomsForTheme(themeId: number): Promise<void> {
  const rooms = await db
    .selectFrom('rooms')
    .select(['slug', 'theme_override_id'])
    .execute();

  for (const room of rooms) {
    // A room is affected if it has no override (uses global) or uses this specific theme
    const affected =
      room.theme_override_id === null || room.theme_override_id === themeId;
    if (affected) {
      pushRoomState(room.slug).catch(() => { /* non-critical */ });
    }
  }
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerThemesRoutes(server: FastifyInstance) {
  const auth     = { preHandler: requireAdmin };
  const authCsrf = { preHandler: [requireAdmin, server.csrfProtection] };

  // ── GET /api/admin/themes/global ───────────────────────────────────────────
  server.get('/api/admin/themes/global', auth, async (_req, reply) => {
    const global = await readGlobalTheme();
    return reply.send(global);
  });

  // ── PATCH /api/admin/themes/global ────────────────────────────────────────
  server.patch('/api/admin/themes/global', authCsrf, async (request, reply) => {
    const global  = await readGlobalTheme();
    const patch   = request.body as Partial<Theme>;
    const merged  = { ...global.settings, ...patch };

    await db
      .updateTable('themes')
      .set({ settings_json: JSON.stringify(merged), updated_at: new Date().toISOString() })
      .where('is_global', '=', 1)
      .execute();

    await pushAllRoomsForTheme(global.id);
    return reply.send({ ok: true });
  });

  // ── POST /api/admin/images/upload ─────────────────────────────────────────
  server.post('/api/admin/images/upload', authCsrf, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'no_file', message: 'No file uploaded' });
    }

    const ext = path.extname(data.filename).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (!allowed.includes(ext)) {
      return reply.code(400).send({
        error:   'invalid_type',
        message: `Only ${allowed.join(', ')} images are allowed`,
      });
    }

    const uploadsDir = path.join(config.DATA_DIR, 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const dest     = path.join(uploadsDir, filename);

    await pipeline(data.file, createWriteStream(dest));

    server.log.info({ filename }, 'Background image uploaded');
    return reply.send({ path: `/uploads/${filename}` });
  });

  // ── GET /api/admin/rooms/:id/theme ─────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    '/api/admin/rooms/:id/theme',
    auth,
    async (request, reply) => {
      const roomId = Number(request.params.id);
      const room   = await db
        .selectFrom('rooms')
        .select(['id', 'theme_override_id'])
        .where('id', '=', roomId)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }

      const usingGlobal = room.theme_override_id === null;
      const settings    = await loadTheme(room.theme_override_id);

      // If the room has an override, also send back the theme row id
      let themeId: number | null = room.theme_override_id;

      return reply.send({ usingGlobal, themeId, settings });
    },
  );

  // ── POST /api/admin/rooms/:id/theme — enable per-room override ─────────────
  server.post<{ Params: { id: string } }>(
    '/api/admin/rooms/:id/theme',
    authCsrf,
    async (request, reply) => {
      const roomId = Number(request.params.id);
      const room   = await db
        .selectFrom('rooms')
        .select(['id', 'slug', 'theme_override_id'])
        .where('id', '=', roomId)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }
      if (room.theme_override_id !== null) {
        return reply.code(409).send({
          error:   'already_customised',
          message: 'Room already has a custom theme. PATCH to update it.',
        });
      }

      // Start with a copy of the current global theme so the room looks the same
      // initially — the admin can then diverge from there.
      const global   = await readGlobalTheme();
      const now      = new Date().toISOString();
      const newTheme = await db
        .insertInto('themes')
        .values({
          name:          `Room ${roomId} override`,
          is_global:     0,
          settings_json: JSON.stringify(global.settings),
          created_at:    now,
          updated_at:    now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await db
        .updateTable('rooms')
        .set({ theme_override_id: newTheme.id })
        .where('id', '=', roomId)
        .execute();

      server.log.info({ roomId, themeId: newTheme.id }, 'Per-room theme override created');
      pushRoomState(room.slug).catch(() => { /* non-critical */ });

      return reply.code(201).send({ themeId: newTheme.id, settings: global.settings });
    },
  );

  // ── PATCH /api/admin/rooms/:id/theme — update per-room override ────────────
  server.patch<{ Params: { id: string } }>(
    '/api/admin/rooms/:id/theme',
    authCsrf,
    async (request, reply) => {
      const roomId = Number(request.params.id);
      const room   = await db
        .selectFrom('rooms')
        .select(['id', 'slug', 'theme_override_id'])
        .where('id', '=', roomId)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }
      if (room.theme_override_id === null) {
        return reply.code(404).send({
          error:   'no_override',
          message: 'Room has no custom theme. POST first to enable one.',
        });
      }

      const themeRow = await db
        .selectFrom('themes')
        .select(['id', 'settings_json'])
        .where('id', '=', room.theme_override_id)
        .executeTakeFirst();

      if (!themeRow) {
        return reply.code(500).send({ error: 'theme_missing', message: 'Theme row not found' });
      }

      const current: Theme = {
        ...DEFAULT_THEME,
        ...(JSON.parse(themeRow.settings_json) as Partial<Theme>),
      };
      const patch   = request.body as Partial<Theme>;
      const merged  = { ...current, ...patch };

      await db
        .updateTable('themes')
        .set({ settings_json: JSON.stringify(merged), updated_at: new Date().toISOString() })
        .where('id', '=', room.theme_override_id)
        .execute();

      pushRoomState(room.slug).catch(() => { /* non-critical */ });
      return reply.send({ ok: true });
    },
  );

  // ── DELETE /api/admin/rooms/:id/theme — revert to global ──────────────────
  server.delete<{ Params: { id: string } }>(
    '/api/admin/rooms/:id/theme',
    authCsrf,
    async (request, reply) => {
      const roomId = Number(request.params.id);
      const room   = await db
        .selectFrom('rooms')
        .select(['id', 'slug', 'theme_override_id'])
        .where('id', '=', roomId)
        .executeTakeFirst();

      if (!room) {
        return reply.code(404).send({ error: 'not_found', message: 'Room not found' });
      }
      if (room.theme_override_id === null) {
        return reply.code(404).send({
          error:   'no_override',
          message: 'Room has no custom theme to remove.',
        });
      }

      const themeId = room.theme_override_id;

      // Unlink first, then delete the orphaned theme row
      await db
        .updateTable('rooms')
        .set({ theme_override_id: null })
        .where('id', '=', roomId)
        .execute();

      await db.deleteFrom('themes').where('id', '=', themeId).execute();

      server.log.info({ roomId, themeId }, 'Per-room theme override removed');
      pushRoomState(room.slug).catch(() => { /* non-critical */ });

      return reply.send({ ok: true });
    },
  );
}
