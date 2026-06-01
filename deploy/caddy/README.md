# LAN HTTPS for Room Display (Caddy, internal CA)

The **wake on camera motion** screensaver feature uses the browser `getUserMedia`
API. Browsers only expose that API in a **secure context** — HTTPS, or
`http://localhost`. Serving the display over plain HTTP on a LAN IP
(`http://192.168.x.x`) is *not* secure, so the camera can never start and the
feature silently does nothing.

This sets up [Caddy](https://caddyserver.com) as a TLS-terminating reverse proxy
in front of the Node app. Caddy issues certificates from its **own local CA**, so
no public domain or internet access is required — perfect for an isolated LAN.

```
tablet ──HTTPS──▶ Caddy (:443, local-CA cert) ──HTTP──▶ Node app (127.0.0.1:3000)
```

Once each tablet trusts Caddy's root CA, the `https://` origin is fully trusted
and the camera API is unblocked.

## Quick start

```bash
cd /opt/roomdisplay
bash scripts/setup-https.sh
```

That script installs Caddy, asks for the hostname/IP tablets will use, moves the
app to port 3000, sets `COOKIE_SECURE=true`, installs the `roomdisplay-caddy`
systemd unit, and starts everything. At the end it prints the per-tablet steps.

## Trust the CA on each tablet (one time)

A tablet that hasn't trusted the CA yet can't load HTTPS, so it grabs the cert
over plain HTTP first:

1. On the tablet, open **`http://<host>/rootca.crt`** — this downloads the CA cert.
2. Install + trust it:
   - **iPad / iOS:** Settings → General → VPN & Device Management → install the
     downloaded profile. Then **Settings → General → About → Certificate Trust
     Settings** and toggle full trust on for the Room Display CA. *(This extra
     trust toggle is required on iOS — without it HTTPS still fails.)*
   - **Android:** Settings → Security → Encryption & credentials → Install a
     certificate → **CA certificate** → pick the downloaded file.
3. Open **`https://<host>/diagnostics`** and run the live camera test.

## Verifying

The `/diagnostics` page (reachable on any tablet) reports:

- **Secure context (HTTPS)** — must be Yes
- **Camera API available** — must be Yes
- **Camera permission** — grant it via the live test
- a **live motion test** that increments a counter when you wave at the tablet

If "Secure context" is still No after trusting the CA, the tablet is probably
hitting the old `http://` URL — make sure its home-screen shortcut points at
`https://<host>/display/<room-slug>`.

## Files

| File | Purpose |
|---|---|
| `Caddyfile` | Reverse-proxy + internal-CA config; serves `/rootca.crt` over HTTP for bootstrapping |
| `caddy.env.example` | Copy to `caddy.env`; sets `RD_HOSTNAME` and `RD_BACKEND_PORT` |
| `../systemd/caddy.service` | Installed as `roomdisplay-caddy.service`; pins storage to `/var/lib/caddy` |

The internal CA root cert lives at
`/var/lib/caddy/data/caddy/pki/authorities/local/root.crt`.

## iPad caveat

Even with a trusted cert, camera access from a **home-screen (standalone) web
app** has historically been unreliable on iOS — third-party iOS browsers all use
WebKit and inherit the same limits. If the live test fails on an iPad after the
CA is trusted, test in Safari directly, and prefer Android tablets where
installed-PWA camera support is dependable. Validate on your actual iPadOS
version before relying on it.

## Alternative: public cert via DNS-01 (not used here)

If you later get a domain you own, you can skip per-tablet CA installs by issuing
a publicly-trusted cert via the ACME DNS-01 challenge (works even though the
device only has a private IP). Replace the global block in the `Caddyfile`:

```caddyfile
# Requires a Caddy build with your DNS provider plugin, e.g. Cloudflare:
#   caddy add-package github.com/caddy-dns/cloudflare
your-host.example.org {
	tls {
		dns cloudflare {env.CF_API_TOKEN}
	}
	reverse_proxy 127.0.0.1:3000
}
```

Point an A record for `your-host.example.org` at the server's LAN IP and set
`CF_API_TOKEN` in `caddy.env`. No tablet-side cert install needed.
