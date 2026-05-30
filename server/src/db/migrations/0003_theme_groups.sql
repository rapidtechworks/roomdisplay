-- Theme groups: a named collection of rooms that share a theme tier
-- between the global theme and individual room overrides.

CREATE TABLE theme_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  theme_id   INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL
);

ALTER TABLE rooms ADD COLUMN theme_group_id INTEGER REFERENCES theme_groups(id) ON DELETE SET NULL;
