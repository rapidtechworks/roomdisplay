import 'dotenv/config';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { config } from './config.js';
import { registerSessionPlugin } from './plugins/session.js';
import { registerCsrfPlugin } from './plugins/csrf.js';
import { registerHealthRoute } from './routes/health.js';
import { registerAuthRoutes } from './routes/admin/auth.js';
import { registerSourcesRoutes } from './routes/admin/sources.js';
import { registerRoomsRoutes } from './routes/admin/rooms.js';
import { registerRoomRoutes } from './routes/rooms.js';
import { registerWsRoute } from './routes/ws.js';
import { broadcastShutdown } from './lib/wsManager.js';
import { startScheduler, stopScheduler } from './lib/scheduler.js';

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

// 3. WebSocket support (must be before WS routes)
await server.register(websocketPlugin);

// ─── Routes ──────────────────────────────────────────────────────────────────

await registerHealthRoute(server);
await registerAuthRoutes(server);
await registerSourcesRoutes(server);
await registerRoomsRoutes(server);
await registerRoomRoutes(server);
await registerWsRoute(server);

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
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
