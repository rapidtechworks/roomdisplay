import { useState, useEffect, useRef, useCallback } from 'react';
import type { RoomState, WsClientMessage, WsServerMessage } from '@roomdisplay/shared';

export function useRoomSocket(slug: string, options?: { previewMode?: boolean }) {
  const previewMode = options?.previewMode ?? false;

  const [state,     setState]     = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef       = useRef<WebSocket | null>(null);
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryDelay  = useRef(3_000);
  const alive       = useRef(true);

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
      // Device identity is carried by the rd_device_id cookie set by the server.
      // The subscribe message only tells the server which room this tablet displays.
      const msg: WsClientMessage = { type: 'subscribe', roomSlug: slug };
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
  }, [slug, startPoll, stopPoll]);

  useEffect(() => {
    alive.current = true;

    if (previewMode) {
      // Preview: REST polling only — no WebSocket, no tablet registration.
      void fetchState();
      pollRef.current = setInterval(() => void fetchState(), 3_000);
      return () => {
        alive.current = false;
        stopPoll();
      };
    }

    // Fetch state first so the rd_device_id cookie is set before the WebSocket
    // upgrade request goes out. The server reads that cookie for device identity.
    fetchState().finally(() => { if (alive.current) connect(); });

    return () => {
      alive.current = false;
      wsRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
      stopPoll();
    };
  }, [connect, stopPoll, fetchState, previewMode]);

  return { state, connected: previewMode ? state !== null : connected };
}
