import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * preHandler hook — attach to any route or plugin scope that requires
 * an authenticated admin session.
 *
 * Usage on a single route:
 *   server.get('/api/admin/me', { preHandler: requireAdmin }, handler)
 *
 * Usage on a scoped plugin (all routes inside):
 *   server.register(async (scope) => {
 *     scope.addHook('preHandler', requireAdmin);
 *     scope.get('/protected', handler);
 *   });
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.session.adminLoggedIn) {
    return reply.code(401).send({
      error: 'unauthorized',
      message: 'You must be logged in to access this resource.',
    });
  }
}
