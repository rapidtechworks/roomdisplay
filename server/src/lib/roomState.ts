/**
 * Builds a RoomState snapshot from the database.
 * Used by both the HTTP state endpoint and the WebSocket push.
 */
import { db } from '../db/index.js';
import { DEFAULT_THEME } from '../../../shared/src/index.js';
import type { Theme, CachedEvent, RoomState } from '../../../shared/src/index.js';

const AGENDA_DAYS = 7;

// ─── Theme loader ─────────────────────────────────────────────────────────────

export async function loadTheme(themeOverrideId: number | null): Promise<Theme> {
  if (themeOverrideId !== null) {
    const row = await db
      .selectFrom('themes')
      .select('settings_json')
      .where('id', '=', themeOverrideId)
      .executeTakeFirst();
    if (row) {
      try { return JSON.parse(row.settings_json) as Theme; } catch { /* fall through */ }
    }
  }

  const globalRow = await db
    .selectFrom('themes')
    .select('settings_json')
    .where('is_global', '=', 1)
    .executeTakeFirst();
  if (globalRow) {
    try { return JSON.parse(globalRow.settings_json) as Theme; } catch { /* fall through */ }
  }

  return DEFAULT_THEME;
}

// ─── State builder ────────────────────────────────────────────────────────────

/** Returns null if no room exists with that slug. */
export async function buildRoomState(slug: string): Promise<RoomState | null> {
  const room = await db
    .selectFrom('rooms')
    .select(['id', 'slug', 'display_name', 'time_zone', 'theme_override_id'])
    .where('slug', '=', slug)
    .executeTakeFirst();

  if (!room) return null;

  const now       = new Date();
  const windowEnd = new Date(now.getTime() + AGENDA_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .selectFrom('bookings_cache')
    .select(['id', 'source', 'title', 'starts_at', 'ends_at', 'all_day'])
    .where('room_id',   '=', room.id)
    .where('ends_at',   '>', now.toISOString())
    .where('starts_at', '<', windowEnd.toISOString())
    .orderBy('starts_at', 'asc')
    .execute();

  const events: CachedEvent[] = rows.map((r) => ({
    id:       String(r.id),
    source:   r.source as CachedEvent['source'],
    title:    r.title,
    startsAt: r.starts_at,
    endsAt:   r.ends_at,
    allDay:   r.all_day === 1,
  }));

  const theme = await loadTheme(room.theme_override_id);

  return {
    version:  1,
    cachedAt: now.toISOString(),
    roomSlug: room.slug,
    roomName: room.display_name,
    timeZone: room.time_zone,
    theme,
    events,
  };
}
