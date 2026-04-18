/**
 * Lwang Black — API base for JSON store.
 * - Local / same-host: defaults to same origin + /api
 * - Vercel + API on Render: set LWB_API_BASE at build (see scripts/build.js) or use meta below
 * - Override: <meta name="lwb-api-base" content="https://your-api.onrender.com/api">
 */
var __LWB_BUILD_API_BASE__ = '';
(function () {
  const meta = document.querySelector('meta[name="lwb-api-base"]');
  const fromMeta = meta && meta.getAttribute('content');
  const trimmed = (fromMeta || '').replace(/\s/g, '').replace(/\/$/, '');
  const fromBuild =
    typeof __LWB_BUILD_API_BASE__ !== 'undefined' && __LWB_BUILD_API_BASE__
      ? String(__LWB_BUILD_API_BASE__).replace(/\s/g, '').replace(/\/$/, '')
      : '';
  if (trimmed) {
    window.LWB_API_BASE = trimmed;
  } else if (fromBuild) {
    window.LWB_API_BASE = fromBuild;
  } else if (typeof location !== 'undefined') {
    window.LWB_API_BASE = location.origin.replace(/\/$/, '') + '/api';
  } else {
    window.LWB_API_BASE = '/api';
  }
  window.lwbApiUrl = function (path) {
    const p = path.startsWith('/') ? path : '/' + path;
    return window.LWB_API_BASE + p;
  };
})();
