-- Explicit theme tier so group assignment is retained when switching away from Group Theme.
-- Values: 'room' | 'group' | 'global'
-- Backfill from existing themeOverrideId / themeGroupId state.
ALTER TABLE rooms ADD COLUMN theme_tier TEXT NOT NULL DEFAULT 'global';

UPDATE rooms SET theme_tier = 'room'  WHERE theme_override_id IS NOT NULL;
UPDATE rooms SET theme_tier = 'group' WHERE theme_override_id IS NULL AND theme_group_id IS NOT NULL;
