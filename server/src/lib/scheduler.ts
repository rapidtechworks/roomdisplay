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
    const elapsedSec = Math.floor((now - lastSynced) / 1000);
    const due = elapsedSec >= source.poll_interval_seconds;

    if (!due) continue;

    log.info(
      { sourceId: source.id, sourceName: source.display_name, elapsedSec },
      'Scheduler: syncing source',
    );

    // Fire without awaiting so one slow source doesn't delay the others
    syncSource(source.id)
      .then((result) => {
        if (result.status === 'ok') {
          log.info(
            { sourceId: source.id, roomsSynced: result.roomsSynced, eventsUpserted: result.eventsUpserted, durationMs: result.durationMs },
            'Scheduler: sync complete',
          );
        } else {
          log.warn(
            { sourceId: source.id, message: result.message },
            'Scheduler: sync returned error status',
          );
        }
      })
      .catch((err: unknown) => {
        log.warn({ err, sourceId: source.id, sourceName: source.display_name }, 'Scheduler: sync threw unexpectedly');
      });
  }
}

export function startScheduler(log: FastifyBaseLogger): void {
  if (timer) return; // already running

  log.info({ tickMs: TICK_MS }, 'Scheduler started');

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
