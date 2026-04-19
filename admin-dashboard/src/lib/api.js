function resolveApiBase() {
  // On this machine (Vite dev, `vite preview`, static `serve`), always same-origin `/api` → proxy or your Express.
  // `vite preview` and production builds set import.meta.env.DEV=false; a baked VITE_API_URL can still point at a
  // hosted gateway that expects `email` → "email: Required". Localhost must ignore that.
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') {
      return '/api';
    }
    // Vite "Network" URL (e.g. 192.168.x.x) — same machine as dev server; must not use baked remote VITE_API_URL.
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) {
      return '/api';
    }
  }
  if (import.meta.env.DEV) {
    return '/api';
  }

  const raw = import.meta.env.VITE_API_URL;
  if (raw == null || raw === '') return '/api';
  if (raw.startsWith('/')) return raw.replace(/\/+$/, '') || '/api';
  try {
    const u = new URL(raw);
    let p = u.pathname.replace(/\/+$/, '');
    if (!p || p === '/') p = '/api';
    else if (!p.startsWith('/api')) p = '/api' + (p.startsWith('/') ? p : `/${p}`);
    u.pathname = p;
    return u.origin + u.pathname;
  } catch {
    return '/api';
  }
}

/** Avoid `base` + `path` joining bugs (missing or double slashes). */
function joinApiUrl(base, path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const b = String(base).replace(/\/+$/, '');
  return b + p;
}

/** Resolve each call so localhost / LAN always use `/api` (never a stale baked remote URL). */
export function getApiBase() {
  return resolveApiBase();
}

let accessToken = localStorage.getItem('lb_token') || null;
let refreshToken = localStorage.getItem('lb_refresh') || null;

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('lb_token', access);
  else localStorage.removeItem('lb_token');
  if (refresh) localStorage.setItem('lb_refresh', refresh);
  else localStorage.removeItem('lb_refresh');
}

export function getAccessToken() { return accessToken; }

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('lb_token');
  localStorage.removeItem('lb_refresh');
}

/**
 * Build a user-visible string from a failed API JSON body.
 * Avoids `new Error(object)` which becomes the useless "[object Object]" message.
 */
function messageFromApiPayload(payload, status, statusText) {
  if (payload == null || typeof payload !== 'object') {
    return statusText || `Request failed (${status})`;
  }
  const primary = payload.error ?? payload.message;
  if (typeof primary === 'string') return primary;
  if (Array.isArray(primary)) {
    return primary.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
  }
  if (primary && typeof primary === 'object') {
    if (typeof primary.message === 'string') return primary.message;
    if (typeof primary.msg === 'string') return primary.msg;
    // Zod / tRPC-style: { formErrors: [], fieldErrors: { email: ['Required'] } }
    if (primary.fieldErrors && typeof primary.fieldErrors === 'object') {
      const parts = [];
      for (const [key, msgs] of Object.entries(primary.fieldErrors)) {
        if (Array.isArray(msgs) && msgs.length) parts.push(`${key}: ${msgs.join(', ')}`);
      }
      if (parts.length) return parts.join('; ');
    }
  }
  if (Array.isArray(payload.errors)) {
    return payload.errors
      .map((e) => (typeof e === 'string' ? e : e?.msg || e?.message || JSON.stringify(e)))
      .join('; ');
  }
  if (typeof payload.detail === 'string') return payload.detail;
  try {
    return JSON.stringify(payload);
  } catch {
    return `Request failed (${status})`;
  }
}

/** Safe message for catch blocks / UI when Error.message may be unhelpful. */
export function caughtErrorMessage(err, fallback = 'Something went wrong') {
  if (err == null) return fallback;
  const m = err.message;
  if (typeof m === 'string' && m.length > 0 && m !== '[object Object]') return m;
  return fallback;
}

async function tryRefresh() {
  if (!refreshToken) return false;
  try {
    const res = await fetch(joinApiUrl(getApiBase(), '/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.token) {
      setTokens(data.token, data.refreshToken || refreshToken);
      return true;
    }
  } catch {}
  return false;
}

export async function apiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : joinApiUrl(getApiBase(), path);
  const headers = { ...options.headers };

  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const { signal, ...rest } = options;
  let res = await fetch(url, { ...rest, headers, signal });

  if (res.status === 401 && accessToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(url, { ...rest, headers, signal });
    }
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const msg = messageFromApiPayload(payload, res.status, res.statusText);
    throw new Error(msg);
  }

  return res.json();
}
