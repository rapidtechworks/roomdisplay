-- Add all_day flag to bookings_cache
-- All-day events from iCal have DATE (not DATETIME) values and must be
-- grouped by their calendar date, not shifted by the room's timezone.
ALTER TABLE bookings_cache ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0;
