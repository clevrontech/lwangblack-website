// ── WebSocket Server — Real-time updates ────────────────────────────────────
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const config = require('../config');
const { isSessionValid } = require('../db/redis');

let wss = null;
let redisPub = null;
let redisSub = null;
let redisFanoutEnabled = false;
const wsInstanceId = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
const REDIS_FANOUT_CHANNEL = 'lwb:ws:broadcast';
const clients = new Map(); // userId => Set<WebSocket>
/** @type {Map<string, Set<import('ws')>>} channel name → subscribers (public real-time: inventory, storefront) */
const channelClients = new Map();

function broadcastLocal(message) {
  if (!wss) return;
  const data = JSON.stringify(message);
  let delivered = 0;
  let failed = 0;

  wss.clients.forEach(ws => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!ws.isAuthenticated) return;

    if (ws.userRole === 'manager' && ws.userCountry) {
      const eventCountry = message.data?.country;
      if (eventCountry && eventCountry !== ws.userCountry) return;
    }

    try {
      ws.send(data);
      delivered += 1;
    } catch (err) {
      failed += 1;
      console.error('[WS] Broadcast send failed:', err.message);
    }
  });

  if (failed > 0) {
    console.warn(`[WS] Broadcast partial failure (${message.type}): delivered=${delivered} failed=${failed}`);
  }
}

function broadcastChannelLocal(channel, message) {
  const set = channelClients.get(channel);
  if (!set || !set.size) return;
  const data = JSON.stringify(message);
  let delivered = 0;
  let failed = 0;
  set.forEach((clientWs) => {
    if (clientWs.readyState !== WebSocket.OPEN) return;
    try {
      clientWs.send(data);
      delivered += 1;
    } catch (err) {
      failed += 1;
      console.error(`[WS] Channel broadcast failed (${channel}):`, err.message);
    }
  });
  if (failed > 0) {
    console.warn(`[WS] Channel broadcast partial failure (${channel}/${message.type}): delivered=${delivered} failed=${failed}`);
  }
}

async function publishFanout(payload) {
  if (!redisFanoutEnabled || !redisPub) return;
  try {
    await redisPub.publish(REDIS_FANOUT_CHANNEL, JSON.stringify({
      source: wsInstanceId,
      ...payload,
    }));
  } catch (err) {
    console.error('[WS] Redis fanout publish failed:', err.message);
  }
}

function initRedisFanout() {
  const redisUrl = config.redis?.url;
  if (!redisUrl) {
    // Single-instance mode — broadcasts stay local; no cross-process fanout. This is fine for dev/demo.
    console.log('[WS] Redis fanout disabled (REDIS_URL not set) — single-instance broadcast only');
    return;
  }

  const redisOpts = {
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => {
      if (times > 3) return null; // give up
      return Math.min(times * 200, 2000);
    },
    reconnectOnError: () => false,
    lazyConnect: true,
  };
  redisPub = new Redis(redisUrl, redisOpts);
  redisSub = new Redis(redisUrl, redisOpts);

  let pubErrLogged = false;
  let subErrLogged = false;
  redisPub.on('error', (err) => {
    if (!pubErrLogged) {
      console.warn('[WS] Redis publisher unavailable:', err.message || err.code);
      pubErrLogged = true;
    }
    redisFanoutEnabled = false;
  });
  redisSub.on('error', (err) => {
    if (!subErrLogged) {
      console.warn('[WS] Redis subscriber unavailable:', err.message || err.code);
      subErrLogged = true;
    }
    redisFanoutEnabled = false;
  });
  redisPub.on('end', () => { redisFanoutEnabled = false; });
  redisSub.on('end', () => { redisFanoutEnabled = false; });

  redisSub.on('message', (channel, raw) => {
    if (channel !== REDIS_FANOUT_CHANNEL) return;
    try {
      const event = JSON.parse(raw);
      if (!event || event.source === wsInstanceId) return;
      if (event.kind === 'auth_broadcast') {
        broadcastLocal(event.message);
      } else if (event.kind === 'channel_broadcast' && typeof event.channel === 'string') {
        broadcastChannelLocal(event.channel, event.message);
      }
    } catch (err) {
      console.error('[WS] Redis fanout message parse failed:', err.message);
    }
  });

  Promise.all([redisPub.connect(), redisSub.connect()])
    .then(() => redisSub.subscribe(REDIS_FANOUT_CHANNEL))
    .then(() => {
      redisFanoutEnabled = true;
      console.log('[WS] Redis fanout enabled');
    })
    .catch((err) => {
      redisFanoutEnabled = false;
      // error handler above already logged once; just disable quietly.
      try { redisPub?.disconnect(); } catch {}
      try { redisSub?.disconnect(); } catch {}
      redisPub = null;
      redisSub = null;
    });
}

/**
 * Initialize WebSocket server on an existing HTTP server
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });
  initRedisFanout();

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
  broadcastLocal(message);
  publishFanout({ kind: 'auth_broadcast', message });
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
  broadcastChannelLocal(channel, message);
  publishFanout({ kind: 'channel_broadcast', channel, message });
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
  if (redisSub) {
    redisSub.quit().catch(() => {});
    redisSub = null;
  }
  if (redisPub) {
    redisPub.quit().catch(() => {});
    redisPub = null;
  }
  redisFanoutEnabled = false;
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
