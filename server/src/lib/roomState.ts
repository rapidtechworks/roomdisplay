/**
 * Builds a RoomState snapshot from the database.
 * Used by both the HTTP state endpoint and the WebSocket push.
 */
import { db } from '../db/index.js';
import { DEFAULT_THEME } from '../../../shared/src/index.js';
import type { Theme, CachedEvent, RoomState } from '../../../shared/src/index.js';

const AGENDA_DAYS = 7;

// ─── Theme helpers ────────────────────────────────────────────────────────────

/** Parse a settings_json string, merging with DEFAULT_THEME so any missing fields are filled. */
function parseTheme(json: string): Theme {
  try {
    return { ...DEFAULT_THEME, ...(JSON.parse(json) as Partial<Theme>) };
  } catch {
    return DEFAULT_THEME;
  }
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────

interface ScheduleRow {
  settings_json: string;
  recurrence_type: 'weekly' | 'one_time';
  day_of_week: number | null;
  date: string | null;
  start_time: string;
  end_time: string | null;
  time_zone: string;
}

/** Check whether a schedule is currently active given wall-clock time in its timezone. */
function isScheduleActive(sched: ScheduleRow): boolean {
  const now = new Date();

  // Get local time parts in the schedule's timezone using Intl
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone:  sched.time_zone,
    year:      'numeric',
    month:     '2-digit',
    day:       '2-digit',
    hour:      '2-digit',
    minute:    '2-digit',
    hour12:    false,
    weekday:   'short',
  });

  const parts    = fmt.formatToParts(now);
  const get      = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const localDate    = `${get('year')}-${get('month')}-${get('day')}`;
  const localHour    = parseInt(get('hour'), 10);
  const localMinute  = parseInt(get('minute'), 10);
  const localMinutes = localHour * 60 + (isNaN(localMinute) ? 0 : localMinute);

  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const localDow = dowMap[get('weekday')] ?? -1;

  const startParts = sched.start_time.split(':').map(Number);
  const startMins  = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
  const endMins    = sched.end_time
    ? (() => { const p = sched.end_time!.split(':').map(Number); return (p[0] ?? 0) * 60 + (p[1] ?? 0); })()
    : 24 * 60;

  if (sched.recurrence_type === 'weekly') {
    if (sched.day_of_week === null) return false;
    if (localDow !== sched.day_of_week) return false;
    return localMinutes >= startMins && localMinutes < endMins;
  }

  // one_time
  if (!sched.date) return false;
  if (localDate !== sched.date) return false;
  return localMinutes >= startMins && localMinutes < endMins;
}

/** Return the first active schedule theme for the given scope, or null. */
async function getActiveScheduledTheme(
  scopeType: 'global' | 'group' | 'room',
  scopeId: number | null,
): Promise<Theme | null> {
  let query = db
    .selectFrom('theme_schedules as s')
    .innerJoin('themes as t', 't.id', 's.theme_id')
    .select([
      't.settings_json',
      's.recurrence_type', 's.day_of_week', 's.date',
      's.start_time', 's.end_time', 's.time_zone',
    ])
    .where('s.scope_type', '=', scopeType)
    .where('s.enabled', '=', 1);

  if (scopeId === null) {
    query = query.where('s.scope_id', 'is', null);
  } else {
    query = query.where('s.scope_id', '=', scopeId);
  }

  const schedules = await query.execute();

  for (const sched of schedules) {
    if (isScheduleActive(sched as ScheduleRow)) {
      return parseTheme(sched.settings_json);
    }
  }
  return null;
}

// ─── Theme resolution ─────────────────────────────────────────────────────────

// Resolution order: active schedule (room → group → global) → room override → group theme → global theme → DEFAULT_THEME
export async function loadTheme(
  themeOverrideId: number | null,
  themeGroupId: number | null = null,
  roomId: number | null = null,
): Promise<Theme> {
  // 0. Schedule-based overrides (highest priority)
  if (roomId !== null) {
    const roomSched = await getActiveScheduledTheme('room', roomId);
    if (roomSched) return roomSched;
  }

  if (themeGroupId !== null) {
    const groupSched = await getActiveScheduledTheme('group', themeGroupId);
    if (groupSched) return groupSched;
  }

  const globalSched = await getActiveScheduledTheme('global', null);
  if (globalSched) return globalSched;

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
    .select(['id', 'slug', 'display_name', 'time_zone', 'theme_override_id', 'theme_group_id', 'theme_tier'])
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

  const theme = await loadTheme(
    room.theme_tier === 'room'  ? room.theme_override_id : null,
    room.theme_tier === 'group' ? room.theme_group_id    : null,
    room.id,
  );

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
