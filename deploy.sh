#!/usr/bin/env bash
# deploy.sh — Pull latest code, rebuild, and restart the service.
# Run as: rtwadmin (the user who owns /opt/roomdisplay)
# Requires: sudo access for systemctl restart

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Pulling latest code..."
cd "$REPO_DIR"
git pull

echo "==> Installing dependencies..."
npm ci --workspaces --include-workspace-root

echo "==> Building..."
npm run build

echo "==> Restarting service..."
sudo systemctl restart roomdisplay

echo "==> Waiting for service to come up..."
sleep 2
sudo systemctl is-active --quiet roomdisplay \
  && echo "✓ roomdisplay is running." \
  || { echo "✗ Service failed to start. Check: sudo journalctl -u roomdisplay -n 50"; exit 1; }

echo ""
echo "Deploy complete."
