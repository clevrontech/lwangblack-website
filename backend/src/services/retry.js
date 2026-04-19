/**
 * Exponential backoff retry for webhook handlers and outbound gateway calls.
 */
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, options = {}) {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseMs = options.baseMs ?? 400;
  const maxMs = options.maxMs ?? 8000;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === maxAttempts) break;
      const delay = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = { withRetry, sleep };
