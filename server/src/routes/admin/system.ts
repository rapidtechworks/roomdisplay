import type { FastifyInstance } from 'fastify';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../config.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '../../..');

// Repo root is four levels up from server/src/routes/admin/
const REPO_DIR = resolve(__dirname, '../../../..');
const UPDATE_SCRIPT = join(REPO_DIR, 'scripts/update.sh');
const STATUS_FILE = join(config.DATA_DIR, 'update-status.json');

interface UpdateStatus {
  status: 'idle' | 'running' | 'restarting' | 'ok' | 'error';
  step?: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

function readUpdateStatus(): UpdateStatus {
  if (!existsSync(STATUS_FILE)) return { status: 'idle' };
  try {
    return JSON.parse(readFileSync(STATUS_FILE, 'utf8')) as UpdateStatus;
  } catch {
    return { status: 'idle' };
  }
}

function getGitInfo() {
  try {
    const hash    = execSync('git rev-parse --short HEAD',      { cwd: REPO_DIR, timeout: 5000 }).toString().trim();
    const subject = execSync('git log -1 --format=%s',          { cwd: REPO_DIR, timeout: 5000 }).toString().trim();
    const date    = execSync('git log -1 --format=%aI',         { cwd: REPO_DIR, timeout: 5000 }).toString().trim();
    return { hash, subject, date };
  } catch {
    return { hash: 'unknown', subject: 'unknown', date: 'unknown' };
  }
}

export async function registerSystemRoutes(server: FastifyInstance) {

  // ── GET /api/admin/system ─────────────────────────────────────────────────
  server.get('/api/admin/system', async (_req, reply) => {
    return reply.send({
      version: getGitInfo(),
      updateStatus: readUpdateStatus(),
      repoDir: REPO_DIR,
    });
  });

  // ── POST /api/admin/system/update ─────────────────────────────────────────
  server.post('/api/admin/system/update', async (_req, reply) => {
    const current = readUpdateStatus();
    if (current.status === 'running' || current.status === 'restarting') {
      // Allow override if the current "running" status is stale (>3 min old).
      // systemd kills the script's cgroup during restart, which can leave a
      // stale status if the script didn't write "ok" before being killed.
      const ageMs = current.startedAt ? Date.now() - new Date(current.startedAt).getTime() : 0;
      if (ageMs < 3 * 60 * 1000) {
        return reply.code(409).send({
          error: 'update_in_progress',
          message: 'An update is already running.',
        });
      }
      server.log.warn({ ageMs, status: current }, 'Overriding stale update status');
    }

    writeFileSync(
      STATUS_FILE,
      JSON.stringify({ status: 'running', step: 'Starting update…', startedAt: new Date().toISOString() }),
    );

    // Spawn detached so the script survives this process restarting
    const child = spawn('bash', [UPDATE_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      cwd: REPO_DIR,
      env: { ...process.env, DATA_DIR: config.DATA_DIR },
    });
    child.unref();

    server.log.info({ repoDir: REPO_DIR, script: UPDATE_SCRIPT }, 'Update started');

    return reply.code(202).send({ message: 'Update started.' });
  });

  // ── GET /api/admin/system/update/status ───────────────────────────────────
  server.get('/api/admin/system/update/status', async (_req, reply) => {
    return reply.send(readUpdateStatus());
  });
}
