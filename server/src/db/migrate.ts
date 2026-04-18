import 'dotenv/config';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { DEFAULT_THEME } from '../../../shared/src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Setup ───────────────────────────────────────────────────────────────────

const dbPath = config.DATABASE_URL.replace(/^file:/, '');
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Migrations table ─────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    applied_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);

// ─── Run pending migrations ───────────────────────────────────────────────────

const migrationsDir = join(__dirname, 'migrations');
const sqlFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort(); // alphabetical = numeric order given 0001_, 0002_, etc.

const applied = new Set(
  db
    .prepare('SELECT name FROM migrations')
    .all()
    .map((r) => (r as { name: string }).name),
);

let count = 0;

for (const file of sqlFiles) {
  if (applied.has(file)) {
    console.log(`  skip  ${file}`);
    continue;
  }

  const sql = readFileSync(join(migrationsDir, file), 'utf8');

  db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
  })();

  console.log(`  apply ${file}`);
  count++;
}

// ─── Seed global theme (once) ─────────────────────────────────────────────────

const themeExists = db
  .prepare('SELECT id FROM themes WHERE is_global = 1')
  .get();

if (!themeExists) {
  db.prepare(`
    INSERT INTO themes (name, is_global, settings_json)
    VALUES ('Global', 1, ?)
  `).run(JSON.stringify(DEFAULT_THEME));
  console.log('  seed  global theme');
}

// ─── Done ─────────────────────────────────────────────────────────────────────

if (count === 0) {
  console.log('Database is up to date.');
} else {
  console.log(`\nApplied ${count} migration(s). Database ready.`);
}

db.close();
