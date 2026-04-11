// ── WebSocket Server — Real-time updates ────────────────────────────────────
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { isSessionValid } = require('../db/redis');

let wss = null;
const clients = new Map(); // userId => Set<WebSocket>

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

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch { /* ignore invalid messages */ }
    });

    ws.on('close', () => {
      if (ws.userId && clients.has(ws.userId)) {
        clients.get(ws.userId).delete(ws);
        if (clients.get(ws.userId).size === 0) clients.delete(ws.userId);
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

module.exports = { initWebSocket, broadcast, sendToUser, getClientCount };
