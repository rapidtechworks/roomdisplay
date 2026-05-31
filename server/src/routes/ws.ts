/**
 * WebSocket endpoint — /ws
 *
 * Tablets connect here, send a `subscribe` message with their roomSlug,
 * and receive `state` pushes whenever the room changes.
 *
 * Device identity comes from the `rd_device_id` cookie set by the server
 * on the first HTTP response — no client-side UUID generation.
 *
 * Protocol (application-level):
 *   Client → Server:  { type: 'subscribe', roomSlug }
 *                     { type: 'pong' }
 *   Server → Client:  { type: 'state',    payload: RoomState }
 *                     { type: 'ping' }
 *                     { type: 'server_shutting_down' }
 *
 * Keepalive: server sends `ping` every 30 s; closes the connection if no
 * `pong` is received within 10 s.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { db } from '../db/index.js';
import { subscribe, unsubscribe, sendStateTo, trackTablet, untrackTablet } from '../lib/wsManager.js';
import type { WsClientMessage, WsServerMessage } from '../../../shared/src/index.js';

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS  = 10_000;

export async function registerWsRoute(server: FastifyInstance) {
  server.get(
    '/ws',
    { websocket: true },
    (connection: SocketStream, request: FastifyRequest) => {
      const socket = connection.socket;

      // Device identity from the server-set cookie. If somehow absent (direct
      // WS connection before any HTTP response), generate a transient ID.
      const deviceId: string = request.cookies['rd_device_id'] ?? randomUUID();

      let subscribedSlug: string | null = null;

      // ── Keepalive ──────────────────────────────────────────────────────────
      let pongTimeout: ReturnType<typeof setTimeout> | null = null;

      const pingInterval = setInterval(() => {
        if (socket.readyState !== 1 /* OPEN */) {
          clearInterval(pingInterval);
          return;
        }
        const ping: WsServerMessage = { type: 'ping' };
        socket.send(JSON.stringify(ping));

        pongTimeout = setTimeout(() => {
          server.log.debug({ slug: subscribedSlug }, 'WS pong timeout — closing connection');
          socket.close(1001, 'Pong timeout');
        }, PONG_TIMEOUT_MS);
      }, PING_INTERVAL_MS);

      // ── Message handler ────────────────────────────────────────────────────
      socket.on('message', (raw: Buffer | string) => {
        let msg: WsClientMessage;
        try {
          msg = JSON.parse(raw.toString()) as WsClientMessage;
        } catch {
          return; // ignore malformed frames
        }

        if (msg.type === 'subscribe') {
          const { roomSlug } = msg;

          // Swap subscription if the tablet changes rooms
          if (subscribedSlug && subscribedSlug !== roomSlug) {
            unsubscribe(subscribedSlug, socket);
          }

          subscribedSlug = roomSlug;
          subscribe(roomSlug, socket);
          trackTablet(deviceId, roomSlug, request.ip);

          server.log.info(
            { roomSlug, deviceId, ip: request.ip },
            'Tablet subscribed to room',
          );

          // Upsert tablet record (best-effort — don't block the subscribe)
          const now = new Date().toISOString();
          db.insertInto('tablets')
            .values({
              tablet_uuid:      deviceId,
              last_seen_at:     now,
              last_ip:          request.ip,
              user_agent:       request.headers['user-agent'] ?? null,
              assigned_room_id: null,
              label:            null,
              created_at:       now,
            })
            .onConflict((oc) =>
              oc.column('tablet_uuid').doUpdateSet({
                last_seen_at: now,
                last_ip:      request.ip,
                user_agent:   request.headers['user-agent'] ?? null,
              }),
            )
            .execute()
            .catch((err: unknown) => {
              server.log.warn({ err }, 'Failed to upsert tablet record');
            });

          // Push current state immediately to this tablet
          sendStateTo(roomSlug, socket).catch((err: unknown) => {
            server.log.warn({ err, roomSlug }, 'Failed to send initial state to tablet');
          });
        }

        if (msg.type === 'pong') {
          if (pongTimeout) {
            clearTimeout(pongTimeout);
            pongTimeout = null;
          }
        }
      });

      // ── Cleanup ────────────────────────────────────────────────────────────
      socket.on('close', () => {
        clearInterval(pingInterval);
        if (pongTimeout) clearTimeout(pongTimeout);
        if (subscribedSlug) {
          unsubscribe(subscribedSlug, socket);
          server.log.debug({ slug: subscribedSlug }, 'Tablet disconnected');
        }
        untrackTablet(deviceId);
      });

      socket.on('error', (err: Error) => {
        server.log.warn({ err }, 'WebSocket error');
      });
    },
  );
}
