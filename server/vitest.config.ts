import { defineConfig } from 'vitest/config';
import path from 'node:path';
import os from 'node:os';

const TEST_DATA_DIR = path.join(os.tmpdir(), 'roomdisplay-tests');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    forks: { singleFork: true },
    env: {
      NODE_ENV: 'test',
      DATA_DIR: TEST_DATA_DIR,
      DATABASE_URL: `file:${path.join(TEST_DATA_DIR, 'test.db')}`,
      SESSION_SECRET: 'test-session-secret-1234567890',
      ENCRYPTION_KEY: 'test-encryption-key-1234567890',
      LOG_LEVEL: 'error',
    },
  },
});
