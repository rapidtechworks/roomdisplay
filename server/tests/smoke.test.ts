import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, sqlite } from './testDb.js';

describe('test db scaffolding', () => {
  beforeEach(() => resetDb());

  it('runs migrations and seeds the global theme', () => {
    const tables = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('rooms');
    expect(names).toContain('bookings_cache');
    expect(names).toContain('walk_ups');
    expect(names).toContain('calendar_sources');

    const theme = sqlite.prepare(`SELECT id FROM themes WHERE is_global = 1`).get();
    expect(theme).toBeTruthy();
  });

  it('resets between tests', () => {
    sqlite.prepare(`INSERT INTO calendar_sources (type, display_name, credentials_encrypted) VALUES ('ical','x','y')`).run();
    const count = sqlite.prepare(`SELECT COUNT(*) AS c FROM calendar_sources`).get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('starts empty after reset', () => {
    const count = sqlite.prepare(`SELECT COUNT(*) AS c FROM calendar_sources`).get() as { c: number };
    expect(count.c).toBe(0);
  });
});
