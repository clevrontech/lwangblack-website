/**
 * Shopify mode — resolves before pricing/cart use the API.
 * Load immediately after lwb-api.js. Enable with SHOPIFY_* env on the API.
 */
(function () {
  function apiUrl(path) {
    const p = path.startsWith('/') ? path : '/' + path;
    if (typeof window.lwbApiUrl === 'function') return window.lwbApiUrl(p);
    const base = (window.LWB_API_BASE || '/api').replace(/\/$/, '');
    return base + p;
  }

  window.__lwbShopifyReady = fetch(apiUrl('/shopify/config'), { credentials: 'same-origin' })
    .then(function (r) {
      return r.json();
    })
    .then(function (c) {
      window.__LWB_SHOPIFY_ACTIVE__ = !!c.enabled;
      window.__LWB_SHOPIFY_CONFIG__ = c;
      return c;
    })
    .catch(function () {
      window.__LWB_SHOPIFY_ACTIVE__ = false;
      return { enabled: false };
    });
})();
