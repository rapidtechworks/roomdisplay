/**
 * WebSocket subscription manager.
 *
 * Tracks which sockets are subscribed to which room slugs and
 * provides a push function called after every booking or sync.
 */
import { buildRoomState } from './roomState.js';
import type { WsServerMessage } from '../../../shared/src/index.js';

// Minimal socket interface — avoids importing ws types directly
interface ManagedSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string | Buffer): void;
}

// readyState === 1 means OPEN in the ws library
const WS_OPEN = 1;

// ─── Subscription map ─────────────────────────────────────────────────────────

const subscribers = new Map<string, Set<ManagedSocket>>();

// ─── Connected tablets map ────────────────────────────────────────────────────

interface ConnectedTablet {
  slug: string;
  ip: string;
  connectedAt: string;
}

const connectedTablets = new Map<string, ConnectedTablet>();

export function trackTablet(tabletUuid: string, slug: string, ip: string): void {
  connectedTablets.set(tabletUuid, {
    slug,
    ip,
    connectedAt: new Date().toISOString(),
  });
}

export function untrackTablet(tabletUuid: string): void {
  connectedTablets.delete(tabletUuid);
}

export function getConnectedTablets(): Array<{ tabletUuid: string; slug: string; ip: string; connectedAt: string }> {
  return Array.from(connectedTablets.entries()).map(([tabletUuid, info]) => ({
    tabletUuid,
    ...info,
  }));
}

export function subscribe(slug: string, socket: ManagedSocket): void {
  let sockets = subscribers.get(slug);
  if (!sockets) {
    sockets = new Set();
    subscribers.set(slug, sockets);
  }
  sockets.add(socket);
}

export function unsubscribe(slug: string, socket: ManagedSocket): void {
  const sockets = subscribers.get(slug);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) subscribers.delete(slug);
}

// ─── Push helpers ─────────────────────────────────────────────────────────────

/** Send a pre-serialised JSON string to every open socket subscribed to slug. */
function broadcast(slug: string, json: string): void {
  const sockets = subscribers.get(slug);
  if (!sockets) return;
  for (const socket of sockets) {
    if (socket.readyState === WS_OPEN) {
      try { socket.send(json); } catch { /* ignore; will be cleaned up on close */ }
    }
  }
}

/**
 * Build a fresh RoomState and push it to every tablet subscribed to that room.
 * Fire-and-forget safe — callers can .catch() or ignore the returned promise.
 */
export async function pushRoomState(slug: string): Promise<void> {
  const sockets = subscribers.get(slug);
  if (!sockets || sockets.size === 0) return;

  const state = await buildRoomState(slug);
  if (!state) return;

  const msg: WsServerMessage = { type: 'state', payload: state };
  broadcast(slug, JSON.stringify(msg));
}

/**
 * Send state directly to a single socket (used on initial subscribe).
 * Does not require the socket to already be in the subscribers map.
 */
export async function sendStateTo(slug: string, socket: ManagedSocket): Promise<void> {
  const state = await buildRoomState(slug);
  if (!state) return;
  if (socket.readyState !== WS_OPEN) return;

  const msg: WsServerMessage = { type: 'state', payload: state };
  try { socket.send(JSON.stringify(msg)); } catch { /* ignore */ }
}

/**
 * Notify all connected tablets that the server is going down.
 * Called from the process shutdown handler.
 */
export function broadcastShutdown(): void {
  const msg: WsServerMessage = { type: 'server_shutting_down' };
  const json = JSON.stringify(msg);
  for (const sockets of subscribers.values()) {
    for (const socket of sockets) {
      if (socket.readyState === WS_OPEN) {
        try { socket.send(json); } catch { /* ignore */ }
      }
    }
  }
}
