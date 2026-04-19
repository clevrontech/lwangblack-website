import { getApiBase } from './api';

/**
 * WebSocket URL for the same API host as REST (handles Vite dev proxy to /ws).
 */
export function resolveRealtimeWsUrl() {
  const base = getApiBase();
  if (base.startsWith('http://') || base.startsWith('https://')) {
    try {
      const u = new URL(base);
      const proto = u.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${u.host}/ws`;
    } catch {
      /* fall through */
    }
  }
  if (typeof window === 'undefined') return 'ws://localhost:3010/ws';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}
