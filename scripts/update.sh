#!/usr/bin/env bash
# update.sh — Pull latest code, rebuild, and restart the service.
# Spawned detached by the server's POST /api/admin/system/update endpoint.
# Writes JSON status to $DATA_DIR/update-status.json throughout so the UI
# can poll for progress even across the service restart.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-/opt/roomdisplay/data}"
STATUS_FILE="$DATA_DIR/update-status.json"
LOG_FILE="/var/log/roomdisplay/update.log"

write_status() {
  printf '%s\n' "$1" > "$STATUS_FILE" 2>/dev/null || true
}

fail() {
  write_status "{\"status\":\"error\",\"message\":\"$1\",\"completedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  echo "=== Update FAILED: $1 at $(date -u) ===" >> "$LOG_FILE" 2>/dev/null || true
  exit 1
}

echo "=== Update started at $(date -u) ===" >> "$LOG_FILE"

cd "$REPO_DIR"

write_status "{\"status\":\"running\",\"step\":\"Pulling latest code\",\"startedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
git pull >> "$LOG_FILE" 2>&1 || fail "git pull failed — check /var/log/roomdisplay/update.log"

write_status "{\"status\":\"running\",\"step\":\"Installing dependencies\"}"
# NODE_ENV=production causes npm to skip devDependencies (vite, tsc, etc.)
# Override it here so build tools are installed; the running service uses production.
NODE_ENV=development npm ci --workspaces --include-workspace-root >> "$LOG_FILE" 2>&1 || fail "npm ci failed"

write_status "{\"status\":\"running\",\"step\":\"Building\"}"
# Explicitly add node_modules/.bin to PATH so workspace tools (vite, tsc) are
# found in detached shell contexts where npm doesn't inject the bin path automatically.
export PATH="$REPO_DIR/node_modules/.bin:$PATH"
NODE_ENV=development npm run build >> "$LOG_FILE" 2>&1 || fail "Build failed"

write_status "{\"status\":\"running\",\"step\":\"Running migrations\"}"
npm run migrate >> "$LOG_FILE" 2>&1 || fail "Migrations failed"

# Write success BEFORE restarting the service. systemd kills all processes in
# the service cgroup on restart (including this detached script), so we cannot
# write status after the restart call. The UI polls after the server comes back
# up and will read this "ok" from the file.
write_status "{\"status\":\"ok\",\"message\":\"Update complete\",\"completedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
echo "=== Update complete at $(date -u) ===" >> "$LOG_FILE"

write_status "{\"status\":\"ok\",\"step\":\"Restarting service\",\"message\":\"Update complete\",\"completedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
sudo systemctl restart roomdisplay >> "$LOG_FILE" 2>&1 || true
