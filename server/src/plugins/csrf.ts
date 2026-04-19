import type { FastifyInstance } from 'fastify';
import fastifyCsrf from '@fastify/csrf-protection';

export async function registerCsrfPlugin(server: FastifyInstance) {
  // Double-submit cookie pattern:
  // 1. Client calls GET /api/admin/csrf-token to receive a token
  // 2. Client includes the token in the `x-csrf-token` header on every
  //    state-mutating request (POST, PATCH, DELETE)
  await server.register(fastifyCsrf, {
    sessionPlugin: '@fastify/session',
  });
}
