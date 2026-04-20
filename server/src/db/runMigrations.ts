/**
 * Runs any pending SQL migrations against the already-open SQLite connection.
 * Safe to call on every server startup — already-applied migrations are skipped.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqlite } from './index.js';
import { DEFAULT_THEME } from '../../../../shared/src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface MigrationResult {
  applied: number; // number of new migrations that ran
}

export function runMigrations(log?: { info: (msg: string) => void }): MigrationResult {
  const print = (msg: string) => log ? log.info(msg) : console.log(msg);

  // ─── Migrations table ────────────────────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  // ─── Run pending migrations ──────────────────────────────────────────────────
  const migrationsDir = join(__dirname, 'migrations');
  const sqlFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // alphabetical = numeric order given 0001_, 0002_, etc.

  const applied = new Set(
    sqlite
      .prepare('SELECT name FROM migrations')
      .all()
      .map((r) => (r as { name: string }).name),
  );

  let count = 0;

  for (const file of sqlFiles) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf8');

    sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    })();

    print(`DB migration applied: ${file}`);
    count++;
  }

  // ─── Seed global theme (once) ────────────────────────────────────────────────
  const themeExists = sqlite.prepare('SELECT id FROM themes WHERE is_global = 1').get();
  if (!themeExists) {
    sqlite
      .prepare(`INSERT INTO themes (name, is_global, settings_json) VALUES ('Global', 1, ?)`)
      .run(JSON.stringify(DEFAULT_THEME));
    print('DB seed: global theme inserted');
  }

  if (count === 0) {
    print('DB migrations: up to date');
  } else {
    print(`DB migrations: ${count} applied`);
  }

  return { applied: count };
}
