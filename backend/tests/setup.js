// Force test mode before any imports
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-refresh-key';
// Force in-memory mode by not providing a valid DB URL
process.env.DATABASE_URL = '';
process.env.DB_HOST = '';

// Suppress noisy logs in tests
const originalConsole = { ...console };
if (process.env.SUPPRESS_LOGS !== 'false') {
  console.log = () => {};
  console.warn = () => {};
  console.error = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('[DB]') || msg.includes('[Redis]') || msg.includes('[WS]') || msg.includes('[Auth]')) return;
    originalConsole.error(...args);
  };
}

const app = require('../src/server');

// Wait for in-memory store to be ready
beforeAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});

module.exports = { app };
