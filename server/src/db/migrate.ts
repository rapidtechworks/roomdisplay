/**
 * Standalone migration runner — called via `npm run migrate`.
 * Migrations also run automatically on every server startup (index.ts),
 * so this script is mainly useful for manual checks or CI pipelines.
 */
import 'dotenv/config';
import { runMigrations } from './runMigrations.js';

runMigrations();

// The shared sqlite connection is kept open by db/index.ts.
// process.exit ensures the script terminates after migrations complete.
process.exit(0);
