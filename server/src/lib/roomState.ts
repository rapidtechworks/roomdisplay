/**
 * Builds a RoomState snapshot from the database.
 * Used by both the HTTP state endpoint and the WebSocket push.
 */
import { db } from '../db/index.js';
import { DEFAULT_THEME } from '../../../shared/src/index.js';
import type { Theme, CachedEvent, RoomState } from '../../../shared/src/index.js';

const AGENDA_DAYS = 7;

// ─── Theme loader ─────────────────────────────────────────────────────────────

/** Parse a settings_json string, merging with DEFAULT_THEME so any missing fields are filled. */
function parseTheme(json: string): Theme {
  try {
    return { ...DEFAULT_THEME, ...(JSON.parse(json) as Partial<Theme>) };
  } catch {
    return DEFAULT_THEME;
  }
}

// Resolution order: room override → group theme → global theme → DEFAULT_THEME
export async function loadTheme(
  themeOverrideId: number | null,
  themeGroupId: number | null = null,
): Promise<Theme> {
  // 1. Room-level override
  if (themeOverrideId !== null) {
    const row = await db
      .selectFrom('themes')
      .select('settings_json')
      .where('id', '=', themeOverrideId)
      .executeTakeFirst();
    if (row) return parseTheme(row.settings_json);
  }

  // 2. Group-level theme
  if (themeGroupId !== null) {
    const group = await db
      .selectFrom('theme_groups')
      .select('theme_id')
      .where('id', '=', themeGroupId)
      .executeTakeFirst();
    if (group?.theme_id !== null && group?.theme_id !== undefined) {
      const row = await db
        .selectFrom('themes')
        .select('settings_json')
        .where('id', '=', group.theme_id)
        .executeTakeFirst();
      if (row) return parseTheme(row.settings_json);
    }
  }

  // 3. Global theme
  const globalRow = await db
    .selectFrom('themes')
    .select('settings_json')
    .where('is_global', '=', 1)
    .executeTakeFirst();
  if (globalRow) return parseTheme(globalRow.settings_json);

  return DEFAULT_THEME;
}

// ─── State builder ────────────────────────────────────────────────────────────

/** Returns null if no room exists with that slug. */
export async function buildRoomState(slug: string): Promise<RoomState | null> {
  const room = await db
    .selectFrom('rooms')
    .select(['id', 'slug', 'display_name', 'time_zone', 'theme_override_id', 'theme_group_id'])
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

  const theme = await loadTheme(room.theme_override_id, room.theme_group_id);

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
