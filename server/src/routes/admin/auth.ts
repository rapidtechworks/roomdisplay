import type { FastifyInstance } from 'fastify';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { requireAdmin } from '../../hooks/requireAdmin.js';
import {
  isLockedOut,
  recordFailure,
  clearFailures,
  lockoutSecondsRemaining,
} from '../../lib/loginRateLimit.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const loginBodySchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerAuthRoutes(server: FastifyInstance) {
  /**
   * GET /api/admin/csrf-token
   * Returns a fresh CSRF token. Must be called before any POST/PATCH/DELETE.
   * The admin UI fetches this once on app load and stores it in memory.
   */
  server.get('/api/admin/csrf-token', async (request, reply) => {
    const token = await reply.generateCsrf();
    return reply.send({ csrfToken: token });
  });

  /**
   * POST /api/admin/login
   * Body: { password: string }
   * Sets a session cookie on success.
   */
  server.post('/api/admin/login', async (request, reply) => {
    const ip = request.ip;

    // Rate limit check
    if (isLockedOut(ip)) {
      const seconds = lockoutSecondsRemaining(ip);
      return reply.code(429).send({
        error: 'too_many_attempts',
        message: `Too many failed login attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
        retryAfterSeconds: seconds,
      });
    }

    // Validate body
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'Password is required.',
      });
    }

    // Load password hash
    const adminConfig = await db
      .selectFrom('admin_config')
      .select(['id', 'password_hash'])
      .executeTakeFirst();

    if (!adminConfig) {
      return reply.code(500).send({
        error: 'not_configured',
        message: 'Admin password has not been set. Run npm run init-admin on the server.',
      });
    }

    // Verify password
    const valid = await argon2.verify(adminConfig.password_hash, parsed.data.password);

    if (!valid) {
      const result = recordFailure(ip);
      server.log.warn({ ip }, 'Failed admin login attempt');

      if (result.locked) {
        return reply.code(429).send({
          error: 'too_many_attempts',
          message: 'Too many failed attempts. Account locked for 1 hour.',
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        });
      }

      return reply.code(401).send({
        error: 'invalid_credentials',
        message: 'Incorrect password.',
        attemptsRemaining: result.remaining,
      });
    }

    // Success — set session
    clearFailures(ip);
    request.session.adminLoggedIn = true;
    await request.session.save();

    server.log.info({ ip }, 'Admin login successful');

    return reply.code(200).send({ ok: true });
  });

  /**
   * POST /api/admin/logout
   * Destroys the session.
   */
  server.post(
    '/api/admin/logout',
    { preHandler: requireAdmin },
    async (request, reply) => {
      await request.session.destroy();
      return reply.code(200).send({ ok: true });
    },
  );

  /**
   * GET /api/admin/me
   * Returns { loggedIn: true } if session is valid, 401 otherwise.
   * The admin UI calls this on load to check whether to show the login page.
   */
  server.get(
    '/api/admin/me',
    { preHandler: requireAdmin },
    async (_request, reply) => {
      return reply.send({ loggedIn: true });
    },
  );
}
