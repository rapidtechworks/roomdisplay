#!/usr/bin/env bash
# install.sh — First-time server setup for Room Display.
# Run once as a user with sudo access (e.g. rtwadmin) after cloning the repo.
# Safe to re-run — most steps are idempotent.
#
# Usage:
#   cd /opt/roomdisplay
#   bash scripts/install.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${SUDO_USER:-$(whoami)}"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   Room Display — First-time Install    ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Repo:  $REPO_DIR"
echo "User:  $APP_USER"
echo ""

# ─── 1. Node.js ──────────────────────────────────────────────────────────────

echo "==> Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo "  Node.js not found. Installing via NodeSource (Node 20 LTS)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  NODE_VER=$(node --version)
  echo "  Found $NODE_VER"
fi

# Grant node permission to bind to port 80 without root
NODE_BIN="$(which node)"
echo "==> Granting cap_net_bind_service to $NODE_BIN..."
sudo setcap cap_net_bind_service=+ep "$NODE_BIN"

# ─── 2. Dependencies + build ──────────────────────────────────────────────────

echo "==> Installing npm dependencies..."
cd "$REPO_DIR"
npm ci --workspaces --include-workspace-root

echo "==> Building..."
npm run build

# ─── 3. Environment file ─────────────────────────────────────────────────────

ENV_FILE="$REPO_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "==> .env already exists — skipping."
else
  echo ""
  echo "==> Creating .env — you'll be prompted for secrets."
  echo "    Generate values with: openssl rand -hex 32"
  echo ""

  read -rp "  SESSION_SECRET (openssl rand -hex 32): " SESSION_SECRET
  read -rp "  ENCRYPTION_KEY (openssl rand -hex 32): " ENCRYPTION_KEY
  read -rp "  PORT [80]: " PORT
  PORT="${PORT:-80}"
  read -rp "  DEFAULT_TIMEZONE [America/Chicago]: " DEFAULT_TIMEZONE
  DEFAULT_TIMEZONE="${DEFAULT_TIMEZONE:-America/Chicago}"

  DATA_DIR="$REPO_DIR/data"
  mkdir -p "$DATA_DIR"

  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$PORT
DATA_DIR=$DATA_DIR
DATABASE_URL=file:$DATA_DIR/app.db
SESSION_SECRET=$SESSION_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
LOG_LEVEL=info
DEFAULT_TIMEZONE=$DEFAULT_TIMEZONE
VERSION_CHECK_URL=https://gist.githubusercontent.com/rapidtechworks/73995f9c1a0f32185af636468e2d8f2e/raw/version.json
EOF
  chmod 600 "$ENV_FILE"
  echo "  .env written to $ENV_FILE"
fi

# ─── 4. Database migrations ───────────────────────────────────────────────────

echo "==> Running database migrations..."
npm run migrate

# ─── 5. Admin password ───────────────────────────────────────────────────────

echo ""
echo "==> Setting admin password (required to log into the admin panel)..."
npm run init-admin

# ─── 6. Log directory ────────────────────────────────────────────────────────

echo "==> Creating log directory..."
sudo mkdir -p /var/log/roomdisplay
sudo chown "$APP_USER:$APP_USER" /var/log/roomdisplay

# ─── 7. Logrotate ────────────────────────────────────────────────────────────

echo "==> Installing logrotate config..."
if ! command -v logrotate &>/dev/null; then
  sudo apt-get install -y logrotate
fi
sudo cp "$REPO_DIR/deploy/logrotate/roomdisplay" /etc/logrotate.d/roomdisplay

# ─── 8. Systemd service ──────────────────────────────────────────────────────

echo "==> Installing systemd service..."
# Patch the service file with the actual repo path and user before copying
sed \
  -e "s|WorkingDirectory=.*|WorkingDirectory=$REPO_DIR|" \
  -e "s|EnvironmentFile=.*|EnvironmentFile=$ENV_FILE|" \
  -e "s|User=.*|User=$APP_USER|" \
  "$REPO_DIR/deploy/systemd/roomdisplay.service" \
  | sudo tee /etc/systemd/system/roomdisplay.service > /dev/null

sudo systemctl daemon-reload
sudo systemctl enable roomdisplay

# ─── 9. Sudoers rule for update button ───────────────────────────────────────

echo "==> Adding sudoers rule for service restart..."
echo "$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart roomdisplay" \
  | sudo tee /etc/sudoers.d/roomdisplay > /dev/null
sudo chmod 440 /etc/sudoers.d/roomdisplay

# Make update script executable
chmod +x "$REPO_DIR/scripts/update.sh"

# ─── 10. Start service ───────────────────────────────────────────────────────

echo "==> Starting roomdisplay service..."
sudo systemctl start roomdisplay
sleep 3

if sudo systemctl is-active --quiet roomdisplay; then
  echo ""
  echo "╔════════════════════════════════════════╗"
  echo "║   Install complete!                    ║"
  echo "╚════════════════════════════════════════╝"
  echo ""
  echo "  Admin panel: http://$(hostname -I | awk '{print $1}')/admin"
  echo "  Room picker: http://$(hostname -I | awk '{print $1}')/"
  echo ""
  echo "  Future updates: Admin → System → Update Now"
  echo "  Or manually:    bash $REPO_DIR/deploy.sh"
  echo ""
else
  echo ""
  echo "✗ Service failed to start. Check logs:"
  echo "    sudo journalctl -u roomdisplay -n 50"
  exit 1
fi
