import { useEffect, useRef } from 'react';
import { getAccessToken } from '../lib/api';
import { resolveRealtimeWsUrl } from '../lib/realtime';

/**
 * Subscribes to backend WebSocket (JWT + channels `orders`, `inventory`).
 * Fires `onEvent` for server pushes so dashboards can refetch KPIs.
 *
 * @param {(msg: object) => void} onEvent
 * @param {{ enabled?: boolean }} options
 */
export function useAdminRealtime(onEvent, options = {}) {
  const { enabled = true } = options;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    const token = getAccessToken();
    if (!token) return;

    let ws;
    let reconnectTimer;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      try {
        const base = resolveRealtimeWsUrl();
        const url = `${base}?token=${encodeURIComponent(token)}`;
        ws = new WebSocket(url);
      } catch {
        return;
      }

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'orders' }));
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'inventory' }));
        } catch (_) {}
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'connected' || msg.type === 'pong' || msg.type === 'subscribed') return;
          onEventRef.current?.(msg);
        } catch (_) {}
      };

      ws.onclose = () => {
        if (stopped) return;
        reconnectTimer = window.setTimeout(connect, 4000);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch (_) {}
      };
    };

    connect();

    const ping = window.setInterval(() => {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      } catch (_) {}
    }, 25000);

    return () => {
      stopped = true;
      window.clearInterval(ping);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try {
        if (ws) ws.close();
      } catch (_) {}
    };
  }, [enabled]);
}
