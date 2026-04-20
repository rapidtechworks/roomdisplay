import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

// ─── calendar_sources ────────────────────────────────────────────────────────

export interface CalendarSourcesTable {
  id: Generated<number>;
  type: 'pco' | 'ical';
  display_name: string;
  credentials_encrypted: string;    // AES-256-GCM encrypted JSON
  poll_interval_seconds: number;    // default 300 (ical) or 120 (pco)
  last_synced_at: string | null;    // UTC ISO-8601
  last_sync_status: 'ok' | 'error' | 'pending';
  last_sync_error: string | null;
  created_at: string;               // UTC ISO-8601
}

export type CalendarSource = Selectable<CalendarSourcesTable>;
export type NewCalendarSource = Insertable<CalendarSourcesTable>;
export type CalendarSourceUpdate = Updateable<CalendarSourcesTable>;

// ─── rooms ───────────────────────────────────────────────────────────────────

export interface RoomsTable {
  id: Generated<number>;
  slug: string;                     // URL-safe, unique
  display_name: string;
  calendar_source_id: number;       // FK → calendar_sources
  external_calendar_id: string;     // PCO resource ID or iCal source URL
  time_zone: string;                // IANA tz, e.g. America/Chicago
  theme_override_id: number | null; // FK → themes (null = use global)
  background_image_path: string | null;
  created_at: string;
}

export type Room = Selectable<RoomsTable>;
export type NewRoom = Insertable<RoomsTable>;
export type RoomUpdate = Updateable<RoomsTable>;

// ─── bookings_cache ──────────────────────────────────────────────────────────

export interface BookingsCacheTable {
  id: Generated<number>;
  room_id: number;                  // FK → rooms
  source: 'pco' | 'ical' | 'local_walkup';
  external_id: string;              // provider event ID; for walk-ups, walk_ups.id
  title: string;
  starts_at: string;                // UTC ISO-8601
  ends_at: string;                  // UTC ISO-8601
  all_day: number;                  // SQLite boolean (0/1)
  last_synced_at: string;
}

export type BookingCache = Selectable<BookingsCacheTable>;
export type NewBookingCache = Insertable<BookingsCacheTable>;
export type BookingCacheUpdate = Updateable<BookingsCacheTable>;

// ─── walk_ups ────────────────────────────────────────────────────────────────

export interface WalkUpsTable {
  id: Generated<number>;
  room_id: number;                  // FK → rooms
  title: string;
  starts_at: string;                // UTC ISO-8601
  ends_at: string;                  // UTC ISO-8601
  created_at: string;
  created_from_ip: string | null;
}

export type WalkUp = Selectable<WalkUpsTable>;
export type NewWalkUp = Insertable<WalkUpsTable>;

// ─── themes ──────────────────────────────────────────────────────────────────

export interface ThemesTable {
  id: Generated<number>;
  name: string;                     // 'global' or custom name
  is_global: number;                // SQLite boolean (0/1); exactly one row = 1
  settings_json: string;            // JSON blob — shape defined in shared/Theme
  created_at: string;
  updated_at: string;
}

export type Theme = Selectable<ThemesTable>;
export type NewTheme = Insertable<ThemesTable>;
export type ThemeUpdate = Updateable<ThemesTable>;

// ─── tablets ─────────────────────────────────────────────────────────────────

export interface TabletsTable {
  id: Generated<number>;
  tablet_uuid: string;              // generated client-side, stored in localStorage
  assigned_room_id: number | null;  // FK → rooms (null = unassigned)
  label: string | null;             // admin-editable display name
  last_seen_at: string | null;
  last_ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export type Tablet = Selectable<TabletsTable>;
export type NewTablet = Insertable<TabletsTable>;
export type TabletUpdate = Updateable<TabletsTable>;

// ─── admin_config ────────────────────────────────────────────────────────────

export interface AdminConfigTable {
  id: Generated<number>;
  password_hash: string;            // argon2id hash
  created_at: string;
  updated_at: string;
}

export type AdminConfig = Selectable<AdminConfigTable>;

// ─── Root DB type (passed to Kysely<DB>) ─────────────────────────────────────

export interface DB {
  calendar_sources: CalendarSourcesTable;
  rooms: RoomsTable;
  bookings_cache: BookingsCacheTable;
  walk_ups: WalkUpsTable;
  themes: ThemesTable;
  tablets: TabletsTable;
  admin_config: AdminConfigTable;
}
