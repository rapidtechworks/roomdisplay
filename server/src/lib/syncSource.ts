/**
 * Core sync logic for a single calendar source.
 * Used by both the manual "Sync Now" endpoint and the background scheduler.
 */
import { db, sqlite } from '../db/index.js';
import { buildProvider } from '../providers/index.js';
import { pushRoomState } from './wsManager.js';

const SYNC_WINDOW_DAYS = 14;

export interface SyncResult {
  sourceId: number;
  status: 'ok' | 'error';
  message: string;
  roomsSynced: number;
  eventsUpserted: number;
  eventsDeleted: number;
  durationMs: number;
}

export async function syncSource(sourceId: number): Promise<SyncResult> {
  const start = Date.now();

  // Load source
  const source = await db
    .selectFrom('calendar_sources')
    .selectAll()
    .where('id', '=', sourceId)
    .executeTakeFirst();

  if (!source) {
    return {
      sourceId,
      status: 'error',
      message: `Source ${sourceId} not found`,
      roomsSynced: 0,
      eventsUpserted: 0,
      eventsDeleted: 0,
      durationMs: Date.now() - start,
    };
  }

  // Load all rooms mapped to this source
  const rooms = await db
    .selectFrom('rooms')
    .select(['id', 'slug', 'external_calendar_id', 'time_zone'])
    .where('calendar_source_id', '=', sourceId)
    .execute();

  if (rooms.length === 0) {
    // Nothing to sync yet — update status and return
    await db
      .updateTable('calendar_sources')
      .set({
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'ok',
        last_sync_error: null,
      })
      .where('id', '=', sourceId)
      .execute();

    return {
      sourceId,
      status: 'ok',
      message: 'No rooms mapped to this source',
      roomsSynced: 0,
      eventsUpserted: 0,
      eventsDeleted: 0,
      durationMs: Date.now() - start,
    };
  }

  const provider = buildProvider(source);
  const from = new Date();
  const to = new Date(from.getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let totalUpserted = 0;
  let totalDeleted = 0;
  let roomsSynced = 0;

  try {
    for (const room of rooms) {
      const remoteEvents = await provider.fetchEvents(room.external_calendar_id, from, to);

      // Reconcile: upsert remote events, delete stale ones
      // Do this synchronously in a transaction using better-sqlite3 directly
      sqlite.transaction(() => {
        const now = new Date().toISOString();

        // Collect external IDs from this sync
        const remoteIds = new Set<string>();

        for (const event of remoteEvents) {
          remoteIds.add(event.externalId);

          // Upsert into bookings_cache
          sqlite
            .prepare(`
              INSERT INTO bookings_cache (room_id, source, external_id, title, starts_at, ends_at, last_synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (source, external_id, room_id)
              DO UPDATE SET
                title          = excluded.title,
                starts_at      = excluded.starts_at,
                ends_at        = excluded.ends_at,
                last_synced_at = excluded.last_synced_at
            `)
            .run(
              room.id,
              source.type,
              event.externalId,
              event.title,
              event.startsAt.toISOString(),
              event.endsAt.toISOString(),
              now,
            );
          totalUpserted++;
        }

        // Delete cache entries for this room+source that are no longer in the remote result
        // Only delete entries within the sync window (don't delete future events outside the window)
        const existingRows = sqlite
          .prepare(`
            SELECT id, external_id FROM bookings_cache
            WHERE room_id = ? AND source = ? AND starts_at >= ?
          `)
          .all(room.id, source.type, from.toISOString()) as Array<{ id: number; external_id: string }>;

        for (const row of existingRows) {
          if (!remoteIds.has(row.external_id)) {
            sqlite.prepare('DELETE FROM bookings_cache WHERE id = ?').run(row.id);
            totalDeleted++;
          }
        }
      })();

      roomsSynced++;
    }

    // Update source status
    await db
      .updateTable('calendar_sources')
      .set({
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'ok',
        last_sync_error: null,
      })
      .where('id', '=', sourceId)
      .execute();

    // Push fresh state to any tablets currently connected to these rooms
    for (const room of rooms) {
      pushRoomState(room.slug).catch(() => { /* non-critical */ });
    }

    return {
      sourceId,
      status: 'ok',
      message: `Synced ${roomsSynced} room(s)`,
      roomsSynced,
      eventsUpserted: totalUpserted,
      eventsDeleted: totalDeleted,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .updateTable('calendar_sources')
      .set({
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'error',
        last_sync_error: message,
      })
      .where('id', '=', sourceId)
      .execute();

    return {
      sourceId,
      status: 'error',
      message,
      roomsSynced,
      eventsUpserted: totalUpserted,
      eventsDeleted: totalDeleted,
      durationMs: Date.now() - start,
    };
  }
}
