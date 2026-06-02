-- Add is_named flag: 1 = standalone library theme that can be assigned to rooms/groups/schedules
ALTER TABLE themes ADD COLUMN is_named INTEGER NOT NULL DEFAULT 0;

-- Migrate all existing non-global themes to named library themes
UPDATE themes SET is_named = 1 WHERE is_global = 0;

-- Theme schedules: automatically apply a named theme at a scheduled time
CREATE TABLE IF NOT EXISTS theme_schedules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  theme_id         INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  scope_type       TEXT    NOT NULL CHECK(scope_type IN ('global','group','room')),
  scope_id         INTEGER,               -- rooms.id or theme_groups.id; NULL for global scope
  recurrence_type  TEXT    NOT NULL CHECK(recurrence_type IN ('weekly','one_time')),
  day_of_week      INTEGER CHECK(day_of_week BETWEEN 0 AND 6),  -- 0=Sun…6=Sat; NULL for one_time
  date             TEXT,                  -- YYYY-MM-DD; NULL for weekly
  start_time       TEXT    NOT NULL,      -- HH:MM local time
  end_time         TEXT,                  -- HH:MM local time; NULL = runs until midnight
  time_zone        TEXT    NOT NULL DEFAULT 'America/Chicago',
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_theme_schedules_scope   ON theme_schedules(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_theme_schedules_enabled ON theme_schedules(enabled);
