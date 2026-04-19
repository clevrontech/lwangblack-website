// ── WebSocket Server — Real-time updates ────────────────────────────────────
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { isSessionValid } = require('../db/redis');

let wss = null;
const clients = new Map(); // userId => Set<WebSocket>
/** @type {Map<string, Set<import('ws')>>} channel name → subscribers (public real-time: inventory, storefront) */
const channelClients = new Map();

/**
 * Initialize WebSocket server on an existing HTTP server
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    // Authenticate via query param or first message
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (token) {
      try {
        const user = jwt.verify(token, config.jwt.secret);
        ws.userId = user.id;
        ws.userRole = user.role;
        ws.userCountry = user.country;
        ws.isAuthenticated = true;

        if (!clients.has(user.id)) clients.set(user.id, new Set());
        clients.get(user.id).add(ws);

        ws.send(JSON.stringify({ type: 'connected', data: { userId: user.id, role: user.role } }));
        console.log(`[WS] Client connected: ${user.username} (${user.role})`);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid token' } }));
        ws.close(4001, 'Authentication failed');
        return;
      }
    } else {
      // Allow unauthenticated connections for public events (limited)
      ws.isAuthenticated = false;
      ws.send(JSON.stringify({ type: 'connected', data: { authenticated: false } }));
    }

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.channels = new Set();

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
          const ch = msg.channel.slice(0, 64);
          if (!channelClients.has(ch)) channelClients.set(ch, new Set());
          channelClients.get(ch).add(ws);
          ws.channels.add(ch);
          ws.send(JSON.stringify({ type: 'subscribed', channel: ch }));
        }
        if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
          const ch = msg.channel.slice(0, 64);
          const set = channelClients.get(ch);
          if (set) set.delete(ws);
          ws.channels.delete(ch);
        }
      } catch { /* ignore invalid messages */ }
    });

    ws.on('close', () => {
      if (ws.userId && clients.has(ws.userId)) {
        clients.get(ws.userId).delete(ws);
        if (clients.get(ws.userId).size === 0) clients.delete(ws.userId);
      }
      if (ws.channels && ws.channels.size) {
        ws.channels.forEach((ch) => {
          const set = channelClients.get(ch);
          if (set) {
            set.delete(ws);
            if (set.size === 0) channelClients.delete(ch);
          }
        });
        ws.channels.clear();
      }
    });

    ws.on('error', () => {
      if (ws.userId && clients.has(ws.userId)) {
        clients.get(ws.userId).delete(ws);
      }
    });
  });

  // Heartbeat interval — kill dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  console.log('[WS] WebSocket server initialized on /ws');
}

/**
 * Broadcast a message to all authenticated clients
 * Managers only receive events for their country
 */
function broadcast(message) {
  if (!wss) return;

  const data = JSON.stringify(message);

  wss.clients.forEach(ws => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!ws.isAuthenticated) return;

    // Country-filter for managers
    if (ws.userRole === 'manager' && ws.userCountry) {
      const eventCountry = message.data?.country;
      if (eventCountry && eventCountry !== ws.userCountry) return;
    }

    try { ws.send(data); } catch { /* ignore */ }
  });
}

/**
 * Send to a specific user
 */
function sendToUser(userId, message) {
  const sockets = clients.get(userId);
  if (!sockets) return;

  const data = JSON.stringify(message);
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch { /* ignore */ }
    }
  });
}

/**
 * Get connected client count
 */
function getClientCount() {
  return wss ? wss.clients.size : 0;
}

/**
 * Real-time layer (GraphQL subscriptions are not required when clients use this WebSocket).
 * Broadcast to subscribers of a named channel (e.g. inventory, cart hints).
 */
function broadcastChannel(channel, message) {
  const set = channelClients.get(channel);
  if (!set || !set.size) return;
  const data = JSON.stringify(message);
  set.forEach((clientWs) => {
    if (clientWs.readyState !== WebSocket.OPEN) return;
    try { clientWs.send(data); } catch { /* ignore */ }
  });
}

function broadcastInventoryUpdate(payload) {
  broadcastChannel('inventory', {
    type: 'inventory:update',
    data: payload,
    ts: new Date().toISOString(),
  });
}

/** Storefront listeners subscribe to WebSocket channel `orders` (no JWT required). */
function broadcastStoreEvent(message) {
  broadcastChannel('orders', message);
}

/**
 * Gracefully shut down the WebSocket server — clears heartbeat interval.
 * Call this in test afterAll or process cleanup.
 */
function closeWebSocket() {
  if (wss) {
    wss.close();
    wss = null;
  }
  clients.clear();
}

module.exports = {
  initWebSocket,
  broadcast,
  sendToUser,
  getClientCount,
  closeWebSocket,
  broadcastChannel,
  broadcastInventoryUpdate,
  broadcastStoreEvent,
};
