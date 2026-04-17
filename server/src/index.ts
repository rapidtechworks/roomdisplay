import 'dotenv/config';
import Fastify from 'fastify';
import { config } from './config.js';
import { registerHealthRoute } from './routes/health.js';

const server = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.isDev
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
        : undefined,
  },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

await registerHealthRoute(server);

// ─── Start ───────────────────────────────────────────────────────────────────

try {
  await server.listen({ port: config.PORT, host: '0.0.0.0' });
  server.log.info(`Listening on port ${config.PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
