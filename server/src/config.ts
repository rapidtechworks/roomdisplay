import { z } from 'zod';
import path from 'node:path';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  DEFAULT_TIMEZONE: z.string().default('America/Chicago'),
  // Set true when the app is served over HTTPS (e.g. behind the Caddy TLS proxy)
  // so session cookies are flagged Secure. Requires trustProxy (already on) so
  // the X-Forwarded-Proto header from the proxy is honoured. Leave false for
  // plain-HTTP LAN access. Camera wake needs HTTPS regardless of this flag —
  // this only hardens the cookie.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Optional public URL returning { version, commit } JSON — used to detect available updates.
  // Host a public GitHub Gist or similar; no credentials required.
  VERSION_CHECK_URL: z.string().url().optional(),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    console.error(`[config] Missing or invalid environment variables: ${missing}`);
    console.error(result.error.format());
    process.exit(1);
  }
  const env = result.data;
  return {
    ...env,
    DATA_DIR: path.resolve(env.DATA_DIR),
    isProd: env.NODE_ENV === 'production',
    isDev: env.NODE_ENV === 'development',
  };
}

export const config = loadConfig();
export type Config = typeof config;
