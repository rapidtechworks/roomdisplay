/**
 * Background sync scheduler.
 *
 * Ticks every 30 seconds and syncs any calendar source whose
 * poll_interval_seconds has elapsed since its last successful sync.
 * Sources that have never been synced are always due.
 *
 * syncSource() handles its own error logging and status updates,
 * so this file just needs to fire-and-forget with a warn on throw.
 */
import { db } from '../db/index.js';
import { syncSource } from './syncSource.js';
import type { FastifyBaseLogger } from 'fastify';

const TICK_MS = 30_000; // check every 30 seconds

let timer: ReturnType<typeof setInterval> | null = null;

async function tick(log: FastifyBaseLogger): Promise<void> {
  const sources = await db
    .selectFrom('calendar_sources')
    .select(['id', 'display_name', 'poll_interval_seconds', 'last_synced_at'])
    .execute();

  const now = Date.now();

  for (const source of sources) {
    const lastSynced = source.last_synced_at ? new Date(source.last_synced_at).getTime() : 0;
    const due = now - lastSynced >= source.poll_interval_seconds * 1000;

    if (!due) continue;

    // Fire without awaiting so one slow source doesn't delay the others
    syncSource(source.id).catch((err: unknown) => {
      log.warn({ err, sourceId: source.id, sourceName: source.display_name }, 'Scheduler sync failed');
    });
  }
}

export function startScheduler(log: FastifyBaseLogger): void {
  if (timer) return; // already running

  // First tick after a short delay so the server finishes starting up
  const initial = setTimeout(() => {
    tick(log).catch((err: unknown) => log.warn({ err }, 'Scheduler initial tick failed'));
  }, 5_000);
  initial.unref();

  timer = setInterval(() => {
    tick(log).catch((err: unknown) => log.warn({ err }, 'Scheduler tick failed'));
  }, TICK_MS);
  timer.unref(); // don't prevent process exit
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
