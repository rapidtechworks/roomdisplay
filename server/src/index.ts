import 'dotenv/config';
import Fastify from 'fastify';
import { config } from './config.js';
import { registerSessionPlugin } from './plugins/session.js';
import { registerCsrfPlugin } from './plugins/csrf.js';
import { registerHealthRoute } from './routes/health.js';
import { registerAuthRoutes } from './routes/admin/auth.js';

const server = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport: config.isDev
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  },
  trustProxy: true, // needed for correct request.ip behind a reverse proxy
});

// ─── Plugins (order matters) ──────────────────────────────────────────────────

// 1. Sessions (registers cookie plugin internally first)
await registerSessionPlugin(server);

// 2. CSRF protection (requires cookie plugin)
await registerCsrfPlugin(server);

// ─── Routes ──────────────────────────────────────────────────────────────────

await registerHealthRoute(server);
await registerAuthRoutes(server);

// ─── Start ───────────────────────────────────────────────────────────────────

try {
  await server.listen({ port: config.PORT, host: '0.0.0.0' });
  server.log.info(`Room Display server running on port ${config.PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
