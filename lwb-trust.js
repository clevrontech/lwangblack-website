/**
 * Injects a compact trust / payment strip (SSL, card networks) when #lwb-trust-host exists.
 */
(function () {
  function inject() {
    const host = document.getElementById('lwb-trust-host');
    if (!host || host.dataset.lwbTrustInjected === '1') return;
    host.dataset.lwbTrustInjected = '1';
    host.innerHTML = `
      <div class="lwb-trust-bar" role="region" aria-label="Security and payments">
        <span class="lwb-trust-item" title="Encrypted connection">🔒 SSL secure checkout</span>
        <span class="lwb-trust-sep">·</span>
        <span class="lwb-trust-item">PCI-aligned payments</span>
        <span class="lwb-trust-sep">·</span>
        <span class="lwb-trust-logos" aria-hidden="true">
          <span class="lwb-trust-pay">Visa</span>
          <span class="lwb-trust-pay">Mastercard</span>
          <span class="lwb-trust-pay">Amex</span>
          <span class="lwb-trust-pay">Stripe</span>
          <span class="lwb-trust-pay">PayPal</span>
        </span>
      </div>`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
