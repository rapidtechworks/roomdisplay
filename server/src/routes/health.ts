import type { FastifyInstance } from 'fastify';

const startedAt = Date.now();

export async function registerHealthRoute(server: FastifyInstance) {
  server.get('/api/health', async (_req, reply) => {
    return reply.send({
      ok: true,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      version: process.env['npm_package_version'] ?? '0.0.0',
      timestamp: new Date().toISOString(),
    });
  });
}
