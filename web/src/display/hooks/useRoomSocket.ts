import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { RoomState, WsClientMessage, WsServerMessage } from '@roomdisplay/shared';

function generateUuid(): string {
  // crypto.randomUUID() requires a secure context (HTTPS/localhost).
  // Fall back to a manual implementation for plain-HTTP LAN access.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getOrCreateTabletUuid(): string {
  const KEY = 'roomdisplay_tablet_uuid';
  let uuid = localStorage.getItem(KEY);
  if (!uuid) {
    uuid = generateUuid();
    localStorage.setItem(KEY, uuid);
  }
  return uuid;
}

export function useRoomSocket(slug: string) {
  const [state,     setState]     = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef       = useRef<WebSocket | null>(null);
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryDelay  = useRef(3_000);
  const alive       = useRef(true);

  const tabletUuid = useMemo(() => getOrCreateTabletUuid(), []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${slug}/state`);
      if (!res.ok) return;
      const s = await res.json() as RoomState;
      if (alive.current) setState(s);
    } catch { /* ignore */ }
  }, [slug]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPoll = useCallback(() => {
    if (pollRef.current) return;
    void fetchState();
    pollRef.current = setInterval(() => void fetchState(), 30_000);
  }, [fetchState]);

  const connect = useCallback(() => {
    if (!alive.current) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!alive.current) { ws.close(); return; }
      retryDelay.current = 3_000;
      const msg: WsClientMessage = { type: 'subscribe', roomSlug: slug, tabletUuid };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      if (!alive.current) return;
      try {
        const msg = JSON.parse(ev.data) as WsServerMessage;
        if (msg.type === 'state') {
          setState(msg.payload);
          setConnected(true);
          stopPoll();
        } else if (msg.type === 'ping') {
          const pong: WsClientMessage = { type: 'pong' };
          ws.send(JSON.stringify(pong));
        }
        // server_shutting_down → let onclose handle reconnect
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      if (!alive.current) return;
      setConnected(false);
      wsRef.current = null;
      startPoll(); // HTTP fallback while disconnected
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
        connect();
      }, retryDelay.current);
    };

    ws.onerror = () => { ws.close(); };
  }, [slug, tabletUuid, startPoll, stopPoll]);

  useEffect(() => {
    alive.current = true;
    void fetchState(); // Load state immediately via REST so display shows before WS connects
    connect();
    return () => {
      alive.current = false;
      wsRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
      stopPoll();
    };
  }, [connect, stopPoll, fetchState]);

  return { state, connected };
}
