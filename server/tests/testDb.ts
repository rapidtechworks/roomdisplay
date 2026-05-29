/**
 * Per-test DB reset helpers. Uses the real singleton sqlite handle from
 * src/db/index.ts (env vars in vitest.config.ts point it at a tmp file)
 * and wipes/re-creates all tables between tests.
 */
import { sqlite } from '../src/db/index.js';
import { runMigrations } from '../src/db/runMigrations.js';

function dropAllTables() {
  const rows = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>;
  sqlite.pragma('foreign_keys = OFF');
  for (const { name } of rows) {
    sqlite.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  sqlite.pragma('foreign_keys = ON');
}

export function resetDb() {
  dropAllTables();
  runMigrations(); // logs go to console; ignored at LOG_LEVEL=error
}

export { sqlite };
