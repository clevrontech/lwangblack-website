/**
 * WebSocket client — inventory + order events (subscribe to channels on API host).
 * Requires lwb-api.js (sets LWB_API_BASE). Uses wss:// when API is https.
 */
(function () {
  function apiOrigin() {
    const base = (window.LWB_API_BASE || '').replace(/\s/g, '').replace(/\/$/, '') || '';
    if (base) return base.replace(/\/api\/?$/i, '');
    if (typeof location !== 'undefined') return location.origin.replace(/\/$/, '');
    return '';
  }

  function connect() {
    const origin = apiOrigin();
    if (!origin || !/^https?:/i.test(origin)) return;
    const wsProto = origin.startsWith('https') ? 'wss' : 'ws';
    const hostPath = origin.replace(/^https?:\/\//, '');
    let url = wsProto + '://' + hostPath + '/ws';
    try {
      const u = new URL(origin);
      if (u.port === '4173' || u.port === '3000') url = wsProto + '://' + u.hostname + ':3010/ws';
    } catch (_) {}

    const ws = new WebSocket(url);
    ws.onopen = function () {
      try {
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'inventory' }));
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'orders' }));
      } catch (_) {}
    };
    ws.onmessage = function (ev) {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'inventory:update') {
          window.dispatchEvent(new CustomEvent('lwb-inventory-update', { detail: msg.data || {} }));
        }
        if (
          msg.type === 'store:order:new' ||
          msg.type === 'order:new' ||
          msg.type === 'order:updated'
        ) {
          window.dispatchEvent(new CustomEvent('lwb-order-event', { detail: msg.data || {} }));
        }
      } catch (_) {}
    };
    ws.onclose = function () {
      setTimeout(connect, 8000);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect);
  else connect();
})();
