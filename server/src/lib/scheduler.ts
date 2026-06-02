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
import { pushRoomState } from './wsManager.js';
import type { FastifyBaseLogger } from 'fastify';

const TICK_MS = 30_000; // check every 30 seconds

let timer: ReturnType<typeof setInterval> | null = null;

/** Push room state for any room that has at least one enabled schedule (re-evaluates themes). */
async function pushScheduledRooms(log: FastifyBaseLogger): Promise<void> {
  const schedules = await db
    .selectFrom('theme_schedules')
    .select(['scope_type', 'scope_id'])
    .where('enabled', '=', 1)
    .execute();

  if (schedules.length === 0) return;

  const slugSet = new Set<string>();

  for (const sched of schedules) {
    if (sched.scope_type === 'global') {
      const rooms = await db.selectFrom('rooms').select('slug').execute();
      rooms.forEach((r) => slugSet.add(r.slug));
      break; // global covers everything — no need to continue
    } else if (sched.scope_type === 'group' && sched.scope_id !== null) {
      const rooms = await db
        .selectFrom('rooms')
        .select('slug')
        .where('theme_group_id', '=', sched.scope_id)
        .execute();
      rooms.forEach((r) => slugSet.add(r.slug));
    } else if (sched.scope_type === 'room' && sched.scope_id !== null) {
      const room = await db
        .selectFrom('rooms')
        .select('slug')
        .where('id', '=', sched.scope_id)
        .executeTakeFirst();
      if (room) slugSet.add(room.slug);
    }
  }

  for (const slug of slugSet) {
    pushRoomState(slug).catch((err: unknown) =>
      log.warn({ err, slug }, 'Scheduler: scheduled theme push failed'),
    );
  }
}

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

  // Re-push rooms that have active schedules so theme transitions take effect within one tick.
  pushScheduledRooms(log).catch((err: unknown) =>
    log.warn({ err }, 'Scheduler: scheduled theme push failed'),
  );
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
