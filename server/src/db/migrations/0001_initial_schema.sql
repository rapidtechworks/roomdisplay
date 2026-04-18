-- 0001_initial_schema.sql
-- All core tables for Room Display v1

-- ─── calendar_sources ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_sources (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  type                  TEXT    NOT NULL CHECK (type IN ('pco', 'ical')),
  display_name          TEXT    NOT NULL,
  credentials_encrypted TEXT    NOT NULL,
  poll_interval_seconds INTEGER NOT NULL DEFAULT 300,
  last_synced_at        TEXT,
  last_sync_status      TEXT    NOT NULL DEFAULT 'pending'
                                CHECK (last_sync_status IN ('ok', 'error', 'pending')),
  last_sync_error       TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ─── themes ──────────────────────────────────────────────────────────────────
-- Created before rooms so rooms can FK to it

CREATE TABLE IF NOT EXISTS themes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  is_global     INTEGER NOT NULL DEFAULT 0 CHECK (is_global IN (0, 1)),
  settings_json TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Enforce only one global theme
CREATE UNIQUE INDEX IF NOT EXISTS themes_one_global
  ON themes (is_global) WHERE is_global = 1;

-- ─── rooms ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                  TEXT    NOT NULL UNIQUE,
  display_name          TEXT    NOT NULL,
  calendar_source_id    INTEGER NOT NULL REFERENCES calendar_sources (id) ON DELETE RESTRICT,
  external_calendar_id  TEXT    NOT NULL,
  time_zone             TEXT    NOT NULL DEFAULT 'America/Chicago',
  theme_override_id     INTEGER REFERENCES themes (id) ON DELETE SET NULL,
  background_image_path TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ─── bookings_cache ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookings_cache (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id        INTEGER NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  source         TEXT    NOT NULL CHECK (source IN ('pco', 'ical', 'local_walkup')),
  external_id    TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  starts_at      TEXT    NOT NULL,
  ends_at        TEXT    NOT NULL,
  last_synced_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_cache_room_starts
  ON bookings_cache (room_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_bookings_cache_room_ends
  ON bookings_cache (room_id, ends_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_cache_source_external
  ON bookings_cache (source, external_id, room_id);

-- ─── walk_ups ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS walk_ups (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id          INTEGER NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  title            TEXT    NOT NULL,
  starts_at        TEXT    NOT NULL,
  ends_at          TEXT    NOT NULL,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_from_ip  TEXT
);

CREATE INDEX IF NOT EXISTS idx_walk_ups_room_starts
  ON walk_ups (room_id, starts_at);

-- ─── tablets ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tablets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tablet_uuid      TEXT    NOT NULL UNIQUE,
  assigned_room_id INTEGER REFERENCES rooms (id) ON DELETE SET NULL,
  label            TEXT,
  last_seen_at     TEXT,
  last_ip          TEXT,
  user_agent       TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ─── admin_config ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_config (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
