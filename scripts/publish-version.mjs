#!/usr/bin/env node
/**
 * Publishes the current git commit to the public version gist so customer
 * deployments know an update is available.
 *
 * Called automatically by the GitHub Actions workflow on every push to main.
 * Can also be run manually: node scripts/publish-version.mjs
 *
 * Required env vars:
 *   GIST_ID     — the ID of the public gist (from the URL: gist.github.com/<user>/<GIST_ID>)
 *   GIST_TOKEN  — a GitHub personal access token with the 'gist' scope
 */

import { execSync } from 'node:child_process';

const GIST_ID    = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

if (!GIST_ID || !GIST_TOKEN) {
  console.error('Error: GIST_ID and GIST_TOKEN environment variables are required.');
  process.exit(1);
}

const commit  = execSync('git rev-parse HEAD').toString().trim();
const version = (() => {
  try {
    return execSync('git describe --tags --exact-match 2>/dev/null', { shell: true }).toString().trim();
  } catch {
    return execSync('git describe --tags --always 2>/dev/null || echo "dev"', { shell: true }).toString().trim();
  }
})();

const fileContent = JSON.stringify({ version, commit }, null, 2);
const payload     = JSON.stringify({ files: { 'version.json': { content: fileContent } } });

const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
  method:  'PATCH',
  headers: {
    'Authorization': `Bearer ${GIST_TOKEN}`,
    'Content-Type':  'application/json',
    'User-Agent':    'roomdisplay-release',
  },
  body: payload,
});

if (!res.ok) {
  const body = await res.text();
  console.error(`GitHub API error ${res.status}: ${body}`);
  process.exit(1);
}

console.log(`Published version=${version} commit=${commit.slice(0, 8)} to gist ${GIST_ID}`);
