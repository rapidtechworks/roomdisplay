import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_DATA_DIR = path.join(os.tmpdir(), 'roomdisplay-tests');

// Defensive: vitest.config.ts also sets these, but make sure they're present
// before any module imports config.ts.
process.env.NODE_ENV ??= 'test';
process.env.DATA_DIR ??= TEST_DATA_DIR;
process.env.DATABASE_URL ??= `file:${path.join(TEST_DATA_DIR, 'test.db')}`;
process.env.SESSION_SECRET ??= 'test-session-secret-1234567890';
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-1234567890';
process.env.LOG_LEVEL ??= 'error';

// Clean tmp dir at suite start so each run begins fresh.
try {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
} catch {
  // ignore
}
mkdirSync(TEST_DATA_DIR, { recursive: true });
