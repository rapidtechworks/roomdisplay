import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import type { DB } from './schema.js';

// Strip the "file:" prefix if present (DATABASE_URL=file:./data/app.db)
const dbPath = config.DATABASE_URL.replace(/^file:/, '');

// Ensure the directory exists before opening the DB
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
// Enforce foreign key constraints
sqlite.pragma('foreign_keys = ON');

export const db = new Kysely<DB>({
  dialect: new SqliteDialect({ database: sqlite }),
});

export { sqlite };
