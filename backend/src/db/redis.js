// ── Redis Client ────────────────────────────────────────────────────────────
const Redis = require('ioredis');
const config = require('../config');

let redis = null;
let isConnected = false;
let redisDisabled = false;
let errorLogged = false;

function getRedis() {
  if (redis || redisDisabled) return redis;

  // Skip entirely when REDIS_URL is not configured — avoids noisy retry loop in dev/demo mode.
  if (!config.redis.url) {
    redisDisabled = true;
    console.log('[Redis] REDIS_URL not set — running without cache (JWT-only auth, no session revocation)');
    return null;
  }

  try {
    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => {
        if (times > 3) {
          if (!redisDisabled) console.warn('[Redis] Giving up after 3 retries — running without cache');
          redisDisabled = true;
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      reconnectOnError: () => false,
      lazyConnect: true,
    });

    redis.on('connect', () => {
      isConnected = true;
      errorLogged = false;
      console.log('[Redis] Connected');
    });

    redis.on('error', (err) => {
      isConnected = false;
      // Log once, not per-retry — ioredis emits `error` continuously while reconnecting.
      if (!errorLogged) {
        console.warn('[Redis] Error:', err.message || err.code || 'connection failed');
        errorLogged = true;
      }
    });

    redis.on('close', () => {
      isConnected = false;
    });

    redis.on('end', () => {
      isConnected = false;
      redisDisabled = true;
    });

    redis.connect().catch(() => {
      // handled via retryStrategy
    });
  } catch (err) {
    console.warn('[Redis] Init failed:', err.message);
    redisDisabled = true;
  }

  return redis;
}

function isRedisDisabled() { return redisDisabled; }

// Cache helpers with graceful fallback
async function cacheGet(key) {
  try {
    if (!redis || !isConnected) return null;
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function cacheSet(key, value, ttlSeconds = 300) {
  try {
    if (!redis || !isConnected) return;
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch { /* ignore */ }
}

async function cacheDel(key) {
  try {
    if (!redis || !isConnected) return;
    await redis.del(key);
  } catch { /* ignore */ }
}

async function cacheFlush(pattern) {
  try {
    if (!redis || !isConnected) return;
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch { /* ignore */ }
}

// Session management
async function setSession(userId, tokenId, ttlSeconds = 43200) {
  try {
    if (!redis || !isConnected) return;
    await redis.set(`session:${userId}:${tokenId}`, '1', 'EX', ttlSeconds);
  } catch { /* ignore */ }
}

async function isSessionValid(userId, tokenId) {
  try {
    if (!redis || !isConnected) {
      // Redis unavailable — JWT signature still validates; session revocation not enforced.
      // In production set REDIS_URL to enable server-side session revocation (logout across devices).
      return true;
    }
    const val = await redis.get(`session:${userId}:${tokenId}`);
    // If session key is missing (expired or revoked) deny access so re-login is forced.
    return val === '1';
  } catch {
    // Redis error mid-request — allow (JWT is still the primary auth mechanism).
    return true;
  }
}

async function revokeSession(userId, tokenId) {
  try {
    if (!redis || !isConnected) return;
    await redis.del(`session:${userId}:${tokenId}`);
  } catch { /* ignore */ }
}

async function revokeAllSessions(userId) {
  try {
    if (!redis || !isConnected) return;
    const keys = await redis.keys(`session:${userId}:*`);
    if (keys.length) await redis.del(...keys);
  } catch { /* ignore */ }
}

module.exports = {
  getRedis, isRedisDisabled,
  cacheGet, cacheSet, cacheDel, cacheFlush,
  setSession, isSessionValid, revokeSession, revokeAllSessions,
};
