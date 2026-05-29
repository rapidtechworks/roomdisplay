# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands are run from the repo root (`roomdisplay/`). This is an npm workspaces monorepo with three packages: `server`, `web`, and `shared`.

```bash
# Development (starts server on :3000 and Vite on :5173 concurrently)
npm run dev

# Type-check all packages
npm run typecheck

# Lint
npm run lint

# Format
npm run format

# Build (web first, then server — order matters)
npm run build

# Run in production (after build)
npm run start

# Database migrations
npm run migrate

# Set admin password interactively (run once after first migrate)
npm run init-admin
```

Server dev uses `tsx watch` (no compile step). Web dev is Vite on port 5173 with a proxy to `localhost:3000` for `/api`, `/ws`, `/uploads`, and `/defaults`.

## Architecture

```
PCO API / iCal URLs  →  Provider Layer  →  SQLite (bookings_cache)  →  WebSocket push  →  Tablets
                                                     ↕
                                              REST API (admin UI)
```

### Monorepo packages

| Package | Path | Role |
|---|---|---|
| `roomdisplay-server` | `server/` | Fastify server, all business logic |
| `roomdisplay-web` | `web/` | React SPA — admin UI + tablet display |
| `shared` | `shared/` | TypeScript types shared between server and web |

In production the server also serves `web/dist` as static files. In dev, Vite proxies API calls.

### Server (`server/src/`)

- **`index.ts`** — entry point; registers plugins, routes, starts sync scheduler, handles graceful shutdown
- **`config.ts`** — validates env vars with Zod, exposes typed `config` object; fails fast on startup if required vars are missing
- **`db/`** — Kysely database client (`index.ts`), typed schema (`schema.ts`), migration runner (`runMigrations.ts`), migration SQL files (`migrations/`)
- **`providers/`** — `CalendarProvider` interface, `IcalProvider`, `PcoProvider` (stub in Phase 1)
- **`lib/`** — `syncSource.ts` (per-source sync logic), `scheduler.ts` (30-second tick), `wsManager.ts` (WebSocket broadcast), `eventBus.ts` (internal emitter)
- **`routes/admin/`** — auth, sources, rooms, tablets, themes (all require admin session)
- **`routes/rooms.ts`** — public booking API: `GET /api/rooms/:slug/available-durations`, `POST /api/rooms/:slug/bookings`
- **`routes/ws.ts`** — WebSocket endpoint at `/ws`
- **`booking/`** — overlap predicate and walk-up booking logic
- **`plugins/`** — session and CSRF middleware wired in startup order
- **`crypto.ts`** — AES-256-GCM encryption for stored calendar credentials
- **`sync/`** — sync scheduler

### Web (`web/src/`)

One React app with two route trees:
- **`/admin/*`** — `admin/AdminApp.tsx`, uses TanStack Query for server state, Zustand for auth store
- **`/display/*`** — `display/DisplayApp.tsx`, uses Zustand + localStorage for offline-resilient state, WebSocket for real-time updates

The tablet display route tree: `/display` (room picker), `/display/:roomSlug` (main display), `/display/:roomSlug/book` (booking flow), `/display/:roomSlug/settings` (settings overlay via tap-and-hold).

Themes are served by the server as part of the WebSocket initial snapshot and pushed on change. The tablet resolves: tablet override → room override → global.

### Key data flow invariants

1. **`bookings_cache` is the unified source of truth** for all display and conflict checking — it holds events from every source plus walk-ups. Never query individual source tables to decide what to show.
2. **Walk-up bookings use `BEGIN IMMEDIATE`** transactions (via `better-sqlite3`'s synchronous API) to prevent race conditions between concurrent tablet taps.
3. **All timestamps are stored as UTC ISO-8601 strings.** Time zones are stored per-room and applied only at display time.
4. **The WebSocket layer is driven by an internal event bus** — sync jobs and booking handlers emit events; the WS manager pushes to subscribed tablets. Nothing pushes directly from route handlers.
5. **iCal credentials (URL + optional HTTP auth) are always encrypted** with AES-256-GCM using `ENCRYPTION_KEY` before being written to `calendar_sources.credentials_encrypted`. Never log or return the plaintext credential after initial entry.

## Environment

Required env vars (see `server/.env.example`):

```
NODE_ENV=production|development
PORT=3000
DATA_DIR=/var/lib/roomdisplay
DATABASE_URL=file:/var/lib/roomdisplay/app.db
SESSION_SECRET=<32 random hex bytes>
ENCRYPTION_KEY=<32 random hex bytes>
```

The SQLite database and uploaded background images live in `DATA_DIR`. Losing `ENCRYPTION_KEY` means all stored calendar credentials need to be re-entered.

## Current status

**Phase 0 (bootstrap) complete.** Phase 1 (iCal, no PCO) is in progress. `PcoProvider` exists as a stub — all its methods throw. PCO integration is Phase 2, gated on getting credentials.

Key Phase 1 items not yet started: sync scheduler integration tests, full WebSocket client (auto-reconnect, offline state machine), booking flow UI, theme editor, Framer Motion transitions.
