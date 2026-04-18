import 'dotenv/config';
import * as argon2 from 'argon2';
import Database from 'better-sqlite3';
import { createInterface } from 'node:readline';
import { mkdirSync } from 'node:fs';
import { dirname as pathDirname } from 'node:path';
import { config } from '../config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden) {
      // Suppress echo for password input
      process.stdout.write(question);
      process.stdin.setRawMode?.(true);
      let password = '';
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char: string) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(password);
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit(0);
        } else if (char === '\u007f') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += char;
          process.stdout.write('*');
        }
      };

      process.stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nRoom Display — Admin Setup\n');

  // Open the DB (must already be migrated)
  const dbPath = config.DATABASE_URL.replace(/^file:/, '');
  mkdirSync(pathDirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  const existing = db.prepare('SELECT id FROM admin_config LIMIT 1').get();

  if (existing) {
    const confirm = await prompt(
      'An admin password already exists. Overwrite it? (yes/no): ',
    );
    if (confirm.toLowerCase() !== 'yes') {
      console.log('Aborted.');
      db.close();
      process.exit(0);
    }
  }

  // Get password
  const password = await prompt('Enter new admin password: ', true);

  if (password.length < 8) {
    console.error('\nPassword must be at least 8 characters.');
    db.close();
    process.exit(1);
  }

  const confirm = await prompt('Confirm password: ', true);

  if (password !== confirm) {
    console.error('\nPasswords do not match.');
    db.close();
    process.exit(1);
  }

  // Hash with argon2id
  console.log('\nHashing password…');
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,
    parallelism: 1,
  });

  const now = new Date().toISOString();

  if (existing) {
    db.prepare(
      'UPDATE admin_config SET password_hash = ?, updated_at = ? WHERE id = ?',
    ).run(hash, now, (existing as { id: number }).id);
  } else {
    db.prepare(
      'INSERT INTO admin_config (password_hash, created_at, updated_at) VALUES (?, ?, ?)',
    ).run(hash, now, now);
  }

  db.close();
  console.log('Admin password set successfully.\n');
  console.log(`You can now log in at http://roomdisplay/admin\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
