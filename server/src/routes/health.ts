import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';

const startedAt = Date.now();

export async function registerHealthRoute(server: FastifyInstance) {
  server.get('/api/health', async (_req, reply) => {
    const sources = await db
      .selectFrom('calendar_sources')
      .select([
        'id',
        'display_name',
        'type',
        'last_sync_status',
        'last_synced_at',
        'last_sync_error',
      ])
      .execute();

    const allOk = sources.every((s) => s.last_sync_status !== 'error');

    return reply.send({
      ok: allOk,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      version: process.env['npm_package_version'] ?? '0.0.0',
      timestamp: new Date().toISOString(),
      sources: sources.map((s) => ({
        id: s.id,
        name: s.display_name,
        type: s.type,
        status: s.last_sync_status,
        lastSyncedAt: s.last_synced_at,
        lastError: s.last_sync_status === 'error' ? s.last_sync_error : null,
      })),
    });
  });
}
