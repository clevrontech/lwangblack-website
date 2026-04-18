/**
 * Product detail page — load from /api/store when ?handle= or ?id= matches seed catalogue.
 */
(function () {
  function qp(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function mapGeoToLwb(code) {
    const m = { AU: 'AU', NP: 'NP', US: 'US', GB: 'GB', CA: 'CA', JP: 'JP', NZ: 'NZ', CN: 'NP' };
    return m[code] || 'NP';
  }

  async function load() {
    if (!window.lwbPricing || !window.lwbCart) return false;
    const handleOrId = qp('handle') || qp('id');
    if (!handleOrId) return false;

    const product = await window.lwbPricing.fetchProduct(handleOrId);
    if (!product || !product.id) return false;

    window.__LWB_API_PRODUCT__ = true;
    const region = localStorage.getItem('lwb_region') || mapGeoToLwb(window.LB_REGION?.get() || 'NP');
    const price = product.prices[region] ?? product.prices.NP ?? 0;
    const cmp = product.compareAtPrices && product.compareAtPrices[region];

    document.title = `${product.title} — Lwang Black`;
    const crumb = document.getElementById('pp-crumb-name');
    if (crumb) crumb.textContent = product.title;

    const imgWrap = document.getElementById('pp-image-wrap');
    if (imgWrap && product.images && product.images.length) {
      imgWrap.style.display = product.images.length > 1 ? 'flex' : 'block';
      imgWrap.style.overflowX = product.images.length > 1 ? 'auto' : 'hidden';
      imgWrap.innerHTML = product.images
        .map(
          (src) =>
            `<img src="${src}" class="pp-image" style="flex:0 0 100%;scroll-snap-align:start;object-fit:cover;" alt="" />`
        )
        .join('');
    }

    const catEl = document.getElementById('pp-category');
    if (catEl) catEl.textContent = String(product.category || '').toUpperCase();
    const titleEl = document.getElementById('pp-title');
    if (titleEl) titleEl.textContent = product.title;
    const descEl = document.getElementById('pp-desc');
    if (descEl) descEl.textContent = product.description || '';

    const priceArea = document.getElementById('pp-price-area');
    const priceEl = document.getElementById('pp-price');
    if (priceEl && window.lwbCart) {
      priceEl.textContent = window.lwbCart.formatPrice(price, region);
    }
    if (priceArea) priceArea.style.display = 'flex';

    const unavail = document.getElementById('pp-unavailable-msg');
    const actions = document.getElementById('pp-actions-area');
    if (unavail) unavail.style.display = 'none';
    if (actions) actions.style.display = 'flex';

    const vContainer = document.getElementById('pp-variants-container');
    if (vContainer && product.variants && product.variants.length) {
      vContainer.innerHTML = `
        <div class="label-micro" style="margin-bottom:0.8rem;display:block;">SELECT VARIANT</div>
        <div class="variant-options" id="lwb-variant-btns" style="margin-bottom:0.5rem;">
          ${product.variants
            .map(
              (v, i) =>
                `<button type="button" class="variant-btn ${i === 0 ? 'selected' : ''}" data-vid="${v.id}">${v.title}</button>`
            )
            .join('')}
        </div>`;
      vContainer.querySelectorAll('.variant-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          vContainer.querySelectorAll('.variant-btn').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });
    }

    window.__lwbCurrentProduct = product;
    window.__lwbSelectedVariantId = product.variants[0]?.id;

    const addBtn = document.getElementById('pp-add-to-cart');
    if (addBtn) {
      addBtn.onclick = function () {
        const vid =
          document.querySelector('#lwb-variant-btns .variant-btn.selected')?.getAttribute('data-vid') ||
          product.variants[0]?.id;
        const qty = parseInt(document.getElementById('pp-qty')?.value, 10) || 1;
        window.lwbCart.addToCart(product, vid, qty);
        const btn = document.getElementById('pp-add-to-cart');
        if (btn) {
          const t = btn.textContent;
          btn.textContent = '✓ ADDED TO CART';
          btn.style.background = '#2e624c';
          setTimeout(() => {
            btn.textContent = t;
            btn.style.background = '';
          }, 2000);
        }
      };
    }

    const schemaScript = document.getElementById('productSchema');
    if (schemaScript) {
      try {
        const schema = JSON.parse(schemaScript.textContent);
        schema.name = product.title;
        schema.description = product.description;
        schema.image = product.images;
        schema.offers.price = String(price);
        schema.offers.priceCurrency = window.lwbCart.CURRENCY[region]?.code || 'NPR';
        schema.offers.url = window.location.href;
        schemaScript.textContent = JSON.stringify(schema);
      } catch (_) {}
    }

    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf('.pp-image-wrap');
      gsap.killTweensOf('.pp-details > *');
      gsap.fromTo('.pp-image-wrap', { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.8, ease: 'power2.out' });
      gsap.fromTo('.pp-details > *', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out', delay: 0.2 });
    }

    window.__SKIP_LEGACY_PRODUCT__ = true;
    return true;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const h = qp('handle') || qp('id');
    if (h) {
      const ok = await load();
      if (!ok && typeof window.renderProduct === 'function') window.renderProduct();
    } else if (typeof window.renderProduct === 'function') {
      window.renderProduct();
    }
  });
})();
