import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db/index.js';
import { runMigrations } from './db/runMigrations.js';
import { syncSource } from './lib/syncSource.js';
import { registerSessionPlugin } from './plugins/session.js';
import { registerCsrfPlugin } from './plugins/csrf.js';
import { registerHealthRoute } from './routes/health.js';
import { registerAuthRoutes } from './routes/admin/auth.js';
import { registerSourcesRoutes } from './routes/admin/sources.js';
import { registerRoomsRoutes } from './routes/admin/rooms.js';
import { registerTabletsRoutes } from './routes/admin/tablets.js';
import { registerThemesRoutes } from './routes/admin/themes.js';
import { registerRoomRoutes } from './routes/rooms.js';
import { registerWsRoute } from './routes/ws.js';
import { broadcastShutdown } from './lib/wsManager.js';
import { startScheduler, stopScheduler } from './lib/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport: config.isDev
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  },
  trustProxy: true, // needed for correct request.ip behind a reverse proxy
});

// ─── Migrations (run before anything else touches the DB) ────────────────────
const { applied: migrationsApplied } = runMigrations({ info: (msg) => server.log.info(msg) });

// ─── Plugins (order matters) ──────────────────────────────────────────────────

// 1. Sessions (registers cookie plugin internally first)
await registerSessionPlugin(server);

// 2. CSRF protection (requires cookie plugin)
await registerCsrfPlugin(server);

// 3. Multipart (file uploads — must be registered before upload routes)
await server.register(fastifyMultipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max per upload
});

// 4. WebSocket support (must be before WS routes)
await server.register(websocketPlugin);

// ─── Routes ──────────────────────────────────────────────────────────────────

await registerHealthRoute(server);
await registerAuthRoutes(server);
await registerSourcesRoutes(server);
await registerRoomsRoutes(server);
await registerTabletsRoutes(server);
await registerThemesRoutes(server);
await registerRoomRoutes(server);
await registerWsRoute(server);

// ─── User-uploaded images (served in all environments) ───────────────────────
// Uploaded background images live in DATA_DIR/uploads/ and are served at /uploads/*.
// In dev the Vite proxy forwards /uploads to this server; in prod this is direct.
const uploadsDir = path.join(config.DATA_DIR, 'uploads');
mkdirSync(uploadsDir, { recursive: true });
await server.register(fastifyStatic, {
  root:           uploadsDir,
  prefix:         '/uploads/',
  decorateReply:  false,
});

// ─── Static file serving (production only) ───────────────────────────────────
// In dev, Vite serves the frontend and proxies API calls to this server.
// In production, this server serves the built frontend from web/dist.

if (config.isProd) {
  // __dirname is server/dist in prod, server/src in dev (tsx).
  // Either way, two levels up lands at the repo root → web/dist.
  const webDist = path.join(process.cwd(), 'web', 'dist');

  await server.register(fastifyStatic, {
    root:    webDist,
    prefix:  '/',
    wildcard: false, // don't auto-register a catch-all; we do it below
  });

  // SPA fallback: serve index.html for every non-API / non-WS path so
  // client-side React Router handles routing.
  server.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api') || request.url === '/ws') {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
    }
    return reply.sendFile('index.html');
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    server.log.info(`Received ${signal} — shutting down`);
    stopScheduler();
    broadcastShutdown();
    await server.close();
    process.exit(0);
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  // In dev, bind to localhost only. In production, bind to all interfaces
  // (the systemd service runs on port 80, protected by the LAN firewall).
  const host = config.isDev ? '127.0.0.1' : '0.0.0.0';
  await server.listen({ port: config.PORT, host });
  server.log.info(`Room Display server running on port ${config.PORT}`);
  startScheduler(server.log);

  // If new migrations were applied this startup, immediately re-sync all sources
  // so cached data reflects any schema changes (e.g. new columns).
  if (migrationsApplied > 0) {
    server.log.info('New migrations applied — triggering full sync of all sources');
    db.selectFrom('calendar_sources').select('id').execute().then((sources) => {
      for (const s of sources) {
        syncSource(s.id).catch((err) =>
          server.log.warn({ err, sourceId: s.id }, 'Post-migration sync failed'),
        );
      }
    }).catch(() => { /* non-critical */ });
  }
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
