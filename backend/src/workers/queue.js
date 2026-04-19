/**
 * Background worker — Render `type: worker` or `node src/workers/queue.js`.
 * Keeps Redis warm, reserved for webhook DLQ / scheduled jobs (extend here).
 */
require('dotenv').config();
const config = require('../config');
const { getRedis } = require('../db/redis');

getRedis();

async function tick() {
  try {
    const r = getRedis();
    if (r && r.status === 'ready') await r.ping();
  } catch (_) {}
}

console.log('[Worker] Lwang Black worker started —', config.nodeEnv || process.env.NODE_ENV);
setInterval(tick, 60000);
tick();
