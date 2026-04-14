function resolveApiBase() {
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

const API_BASE = resolveApiBase();

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

async function tryRefresh() {
  if (!refreshToken) return false;
  try {
    const res = await fetch(joinApiUrl(API_BASE, '/auth/refresh'), {
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
  const url = path.startsWith('http') ? path : joinApiUrl(API_BASE, path);
  const headers = { ...options.headers };

  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  let res = await fetch(url, { ...options, headers });

  if (res.status === 401 && accessToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `API error ${res.status}`);
  }

  return res.json();
}
