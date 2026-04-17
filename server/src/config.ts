import { z } from 'zod';
import path from 'path';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  DEFAULT_TIMEZONE: z.string().default('America/Chicago'),
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
