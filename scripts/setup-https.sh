#!/usr/bin/env bash
# setup-https.sh — Put Room Display behind Caddy with LAN HTTPS (internal CA).
#
# Why: the "wake on camera motion" feature needs a secure context (HTTPS).
# This installs Caddy as a TLS-terminating reverse proxy in front of the Node
# app, using Caddy's own local CA (no public domain or internet required).
#
# Run after install.sh, as a user with sudo:
#   cd /opt/roomdisplay && bash scripts/setup-https.sh
#
# Idempotent — safe to re-run.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
CADDY_ENV="$REPO_DIR/deploy/caddy/caddy.env"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   Room Display — HTTPS Setup (Caddy)   ║"
echo "╚════════════════════════════════════════╝"
echo ""

# ─── 1. Install Caddy ─────────────────────────────────────────────────────────

if ! command -v caddy &>/dev/null; then
  echo "==> Installing Caddy (official apt repo)..."
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
  # We run Caddy via our own systemd unit, not the packaged one.
  sudo systemctl disable --now caddy 2>/dev/null || true
else
  echo "==> Caddy already installed: $(caddy version | head -1)"
fi

# ─── 2. caddy.env (hostname / backend port) ───────────────────────────────────

if [[ ! -f "$CADDY_ENV" ]]; then
  echo ""
  echo "==> Configuring the tablet-facing hostname/IP."
  DEFAULT_IP="$(hostname -I | awk '{print $1}')"
  read -rp "  Hostname or LAN IP tablets will use [$DEFAULT_IP]: " RD_HOSTNAME
  RD_HOSTNAME="${RD_HOSTNAME:-$DEFAULT_IP}"
  cat > "$CADDY_ENV" <<EOF
RD_HOSTNAME=$RD_HOSTNAME
RD_BACKEND_PORT=3000
EOF
  echo "  Wrote $CADDY_ENV"
else
  echo "==> $CADDY_ENV already exists — leaving as-is."
  # shellcheck disable=SC1090
  source "$CADDY_ENV"
fi
RD_HOSTNAME="${RD_HOSTNAME:-$(awk -F= '/^RD_HOSTNAME=/{print $2}' "$CADDY_ENV")}"

# ─── 3. Move the app off port 80 onto 3000, flag cookies Secure ───────────────
# Caddy now owns 80/443; the Node app only needs a local port.

echo "==> Updating app .env (PORT=3000, COOKIE_SECURE=true)..."
if grep -q '^PORT=' "$ENV_FILE"; then
  sudo sed -i 's/^PORT=.*/PORT=3000/' "$ENV_FILE"
else
  echo 'PORT=3000' | sudo tee -a "$ENV_FILE" > /dev/null
fi
if grep -q '^COOKIE_SECURE=' "$ENV_FILE"; then
  sudo sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' "$ENV_FILE"
else
  echo 'COOKIE_SECURE=true' | sudo tee -a "$ENV_FILE" > /dev/null
fi

# ─── 4. Caddy storage dir (deterministic root-CA path) ────────────────────────

echo "==> Preparing Caddy storage at /var/lib/caddy ..."
sudo mkdir -p /var/lib/caddy/data /var/lib/caddy/config

# ─── 5. Install + start the Caddy systemd unit ────────────────────────────────

echo "==> Installing caddy.service..."
sudo cp "$REPO_DIR/deploy/systemd/caddy.service" /etc/systemd/system/roomdisplay-caddy.service
sudo systemctl daemon-reload
sudo systemctl enable roomdisplay-caddy

echo "==> Restarting app, then (re)starting Caddy..."
sudo systemctl restart roomdisplay
sleep 2
sudo systemctl restart roomdisplay-caddy
sleep 3

ROOT_CA="/var/lib/caddy/data/caddy/pki/authorities/local/root.crt"

if sudo systemctl is-active --quiet roomdisplay-caddy; then
  echo ""
  echo "╔════════════════════════════════════════╗"
  echo "║   HTTPS is up!                         ║"
  echo "╚════════════════════════════════════════╝"
  echo ""
  echo "  Display (HTTPS):  https://$RD_HOSTNAME/"
  echo "  Diagnostics:      https://$RD_HOSTNAME/diagnostics"
  echo ""
  echo "  ── Trust the CA on each tablet (one time) ──"
  echo "  1. On the tablet, open:  http://$RD_HOSTNAME/rootca.crt  (downloads the CA)"
  echo "  2. iPad:    Settings → General → VPN & Device Management → install profile,"
  echo "              then Settings → General → About → Certificate Trust Settings → enable it."
  echo "     Android: Settings → Security → Encryption → Install a certificate → CA certificate."
  echo "  3. Reload  https://$RD_HOSTNAME/diagnostics  and run the live camera test."
  echo ""
  echo "  Root CA file on this server: $ROOT_CA"
  echo ""
else
  echo ""
  echo "✗ Caddy failed to start. Check logs:"
  echo "    sudo journalctl -u roomdisplay-caddy -n 50"
  echo "    tail -n 50 /var/log/roomdisplay/caddy.log"
  exit 1
fi
