/**
 * LWANG BLACK — Cart (localStorage) + lwbCart API + LB_CART compatibility
 */

const CART_KEY = 'lwangblack_cart';
const LEGACY_V2 = 'lwangblack_cart_v2';
const LEGACY_KEY = 'lb_cart';

const CURRENCY = {
  NP: { symbol: 'रु', code: 'NPR', decimals: 0 },
  AU: { symbol: 'A$', code: 'AUD', decimals: 2 },
  US: { symbol: '$', code: 'USD', decimals: 2 },
  EU: { symbol: '€', code: 'EUR', decimals: 2 },
  CA: { symbol: 'C$', code: 'CAD', decimals: 2 },
  JP: { symbol: '¥', code: 'JPY', decimals: 0 },
  NZ: { symbol: 'NZ$', code: 'NZD', decimals: 2 },
  GB: { symbol: '£', code: 'GBP', decimals: 2 },
};

function getLwbRegion() {
  try {
    return localStorage.getItem('lwb_region') || 'NP';
  } catch {
    return 'NP';
  }
}

function getCartRaw() {
  try {
    let raw = localStorage.getItem(CART_KEY);
    if (!raw || raw === '[]') {
      const v2 = localStorage.getItem(LEGACY_V2);
      if (v2 && v2 !== '[]') {
        localStorage.setItem(CART_KEY, v2);
        raw = v2;
      }
    }
    if (!raw || raw === '[]') {
      const leg = localStorage.getItem(LEGACY_KEY);
      if (leg && leg !== '[]') {
        localStorage.setItem(CART_KEY, leg);
        raw = leg;
      }
    }
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function saveCartRaw(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (_) {}
  updateAllBadges();
}

function formatPrice(amount, region) {
  const r = region || getLwbRegion();
  const c = CURRENCY[r] || CURRENCY.NP;
  const n = Number(amount) || 0;
  if (c.decimals === 0) {
    return `${c.symbol}${n.toLocaleString(r === 'JP' ? 'ja-JP' : undefined)}`;
  }
  return `${c.symbol}${n.toFixed(c.decimals)}`;
}

function enrichItemForLegacy(item) {
  const region = item.region || getLwbRegion();
  const meta = CURRENCY[region] || CURRENCY.NP;
  const sub = Number(item.price) * Number(item.qty);
  return {
    ...item,
    region,
    currency: meta.code,
    symbol: meta.symbol,
    display: formatPrice(sub, region),
  };
}

function getCart() {
  return getCartRaw();
}

function saveCart(cart) {
  saveCartRaw(cart);
}

function addToCart(product, variantId, qty = 1) {
  const region = getLwbRegion();
  const variant = product.variants.find((v) => v.id === variantId) || product.variants[0];
  const price = product.prices[region] ?? product.prices.NP ?? product.prices.US ?? 0;
  const key = `${product.id}-${variant.id}`;
  const cart = getCartRaw();
  const existing = cart.find((i) => i.key === key);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      key,
      productId: product.id,
      variantId: variant.id,
      handle: product.handle,
      name: product.title,
      variantTitle: variant.title,
      price,
      image: (product.images && product.images[0]) || '',
      qty,
      region,
      shopify: product.source === 'shopify',
    });
  }
  saveCartRaw(cart);
  showToast(`✓ ${product.title} added to cart`);
  if (window.LB_CART && typeof LB_CART.renderDrawer === 'function') {
    LB_CART.renderDrawer();
  }
}

function removeFromCart(key) {
  saveCartRaw(getCartRaw().filter((i) => i.key !== key));
  if (window.LB_CART && typeof LB_CART.renderDrawer === 'function') LB_CART.renderDrawer();
}

function clearCart() {
  try {
    localStorage.removeItem(CART_KEY);
    localStorage.removeItem(LEGACY_V2);
  } catch (_) {}
  updateAllBadges();
}

function updateQty(key, qty) {
  const cart = getCartRaw();
  if (qty <= 0) {
    removeFromCart(key);
    return;
  }
  const item = cart.find((i) => i.key === key);
  if (item) {
    item.qty = qty;
    saveCartRaw(cart);
    if (window.LB_CART && typeof LB_CART.renderDrawer === 'function') LB_CART.renderDrawer();
  }
}

function getCartTotal() {
  return getCartRaw().reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
}

function getCartCount() {
  return getCartRaw().reduce((s, i) => s + i.qty, 0);
}

function updateAllBadges() {
  const count = getCartCount();
  document.querySelectorAll('#lb-cart-count, #cart-count, .cart-count, [data-cart-count]').forEach((el) => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : '';
  });
}

function showToast(msg, type = 'success') {
  const existing = document.querySelector('.lwb-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'lwb-toast';
  toast.style.cssText = [
    'position:fixed;bottom:20px;right:20px;z-index:99999;',
    `background:${type === 'success' ? '#1a1a1a' : '#c0392b'};color:#fff;`,
    'padding:12px 20px;border-radius:4px;font-size:14px;',
    'box-shadow:0 4px 20px rgba(0,0,0,0.3);',
  ].join('');
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

if (!document.getElementById('lwb-toast-style')) {
  const s = document.createElement('style');
  s.id = 'lwb-toast-style';
  s.textContent =
    '@keyframes lwbSlideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}} .lwb-toast{animation:lwbSlideIn 0.3s ease}';
  document.head.appendChild(s);
}

window.lwbCart = {
  CURRENCY,
  addToCart,
  removeFromCart,
  updateQty,
  getCart,
  clearCart,
  getCartTotal,
  getCartCount,
  formatPrice,
  getRegion: getLwbRegion,
  showToast,
  get API() {
    return window.LWB_API_BASE || '';
  },
};

/** Legacy LB_CART — same storage as lwbCart */
const LB_CART = {
  STORAGE_KEY: CART_KEY,

  load() {
    let raw = getCartRaw();
    if (!raw.length) {
      try {
        const leg = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
        if (leg.length) {
          raw = leg;
          saveCartRaw(leg);
        }
      } catch (_) {}
    }
    return raw.map(enrichItemForLegacy);
  },

  save(items) {
    const stripped = items.map(({ currency, symbol, display, ...rest }) => rest);
    saveCartRaw(stripped);
    this._updateBadge(this.load().reduce((s, i) => s + i.qty, 0));
  },

  async add(productId, variant = null, qty = 1) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    const country = window.LB_REGION?.get() || getLwbRegion();
    const productStatic = window.LB_PRODUCTS?.[productId];
    const priceObj = window.getProductPrice?.(productId, country);

    if (productStatic && priceObj) {
      const items = this.load().map(({ currency, symbol, display, ...r }) => r);
      const key = variant ? `${productId}-${variant}` : productId;
      const existing = items.find((i) => i.key === key);
      if (existing) {
        existing.qty += qty;
      } else {
        items.push({
          key,
          productId,
          variant,
          name: productStatic.name + (variant ? ` (${variant})` : ''),
          image: productStatic.image,
          price: priceObj.amount,
          currency: priceObj.currency,
          symbol: priceObj.symbol,
          display: priceObj.display,
          qty,
          region: country === 'GB' ? 'GB' : country,
        });
      }
      this.save(items);
      this.renderDrawer();
      this.openDrawer();
      this._showToast(`✓ ${productStatic.name} added to cart`);
      if (window.dataLayer) {
        window.dataLayer.push({
          event: 'add_to_cart',
          currency: priceObj.currency,
          value: priceObj.amount,
          items: [{ item_id: productId, item_name: productStatic.name, price: priceObj.amount, quantity: qty }],
        });
      }
      return;
    }

    try {
      const base = window.LWB_API_BASE || '';
      const res = await fetch(`${base}/products/${encodeURIComponent(productId)}`);
      const data = await res.json();
      const product = data.product;
      if (!product) {
        this._showToast('Product not found', 'error');
        return;
      }
      const variantId = variant || product.variants[0]?.id;
      addToCart(product, variantId, qty);
      this.renderDrawer();
      this.openDrawer();
    } catch (e) {
      this._showToast('Could not add to cart', 'error');
    }
  },

  remove(key) {
    removeFromCart(key);
    this.renderDrawer();
  },

  setQty(key, qty) {
    if (qty < 1) {
      this.remove(key);
      return;
    }
    updateQty(key, qty);
    this.renderDrawer();
  },

  clear() {
    clearCart();
    this.renderDrawer();
  },

  getTotals() {
    const items = this.load();
    if (!items.length) {
      const r = getLwbRegion();
      const meta = CURRENCY[r] || CURRENCY.NP;
      return {
        count: 0,
        subtotal: 0,
        currency: meta.code,
        symbol: meta.symbol,
        display: formatPrice(0, r),
      };
    }
    const subtotal = items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
    const first = items[0];
    const region =
      (typeof window.LB_REGION !== 'undefined' && typeof LB_REGION.get === 'function' && LB_REGION.get()) ||
      first.region ||
      getLwbRegion();
    const meta = CURRENCY[region] || CURRENCY.NP;
    return {
      count: items.reduce((s, i) => s + i.qty, 0),
      subtotal,
      currency: meta.code,
      symbol: meta.symbol,
      display: formatPrice(subtotal, region),
    };
  },

  openDrawer() {
    document.getElementById('lb-cart-drawer')?.classList.add('open');
    document.getElementById('lb-cart-overlay')?.classList.add('show');
    document.body.style.overflow = 'hidden';
    if (window.dataLayer) {
      const totals = this.getTotals();
      window.dataLayer.push({ event: 'view_cart', currency: totals.currency, value: totals.subtotal });
    }
  },

  closeDrawer() {
    document.getElementById('lb-cart-drawer')?.classList.remove('open');
    document.getElementById('lb-cart-overlay')?.classList.remove('show');
    document.body.style.overflow = '';
  },

  renderDrawer() {
    const body = document.getElementById('lb-cart-body');
    const footer = document.getElementById('lb-cart-footer');
    if (!body) return;

    const items = this.load();
    const totals = this.getTotals();

    if (!items.length) {
      body.innerHTML = `
        <div class="lb-cart-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <p>Your cart is empty</p>
          <a href="shop.html" class="btn-solid" style="margin-top:1.5rem; font-size:0.7rem; padding:0.8rem 2rem;">SHOP NOW</a>
        </div>`;
      if (footer) footer.innerHTML = '';
      return;
    }

    body.innerHTML = items
      .map(
        (item) => {
          const ir = item.region || getLwbRegion();
          const dec = (CURRENCY[ir] || CURRENCY.NP).decimals;
          const line = Number(item.price) * Number(item.qty);
          const lineStr = line.toLocaleString(ir === 'JP' ? 'ja-JP' : undefined, {
            minimumFractionDigits: dec,
            maximumFractionDigits: dec,
          });
          return `
      <div class="lb-cart-item" data-key="${item.key}">
        <img src="${item.image}" alt="${item.name}" onerror="this.src='images/product-hero-500g.jpg'"/>
        <div class="lb-cart-item-info">
          <div class="lb-cart-item-name">${item.name}</div>
          <div class="lb-cart-item-price">${item.symbol}${lineStr}</div>
          <div class="lb-cart-qty-row">
            <button type="button" class="lb-qty-btn" onclick="LB_CART.setQty('${item.key}', ${item.qty - 1})">−</button>
            <span class="lb-qty-num">${item.qty}</span>
            <button type="button" class="lb-qty-btn" onclick="LB_CART.setQty('${item.key}', ${item.qty + 1})">+</button>
            <button type="button" class="lb-cart-remove" onclick="LB_CART.remove('${item.key}')">Remove</button>
          </div>
        </div>
      </div>`;
        }
      )
      .join('');

    if (footer) {
      footer.innerHTML = `
        <div class="lb-cart-subtotal">
          <span>Subtotal</span>
          <strong>${totals.display}</strong>
        </div>
        <p class="lb-cart-note">Shipping calculated at checkout</p>
        <a href="checkout.html" class="btn-solid lb-checkout-btn" onclick="LB_CART.closeDrawer()">PROCEED TO CHECKOUT</a>`;
    }
  },

  _updateBadge(count) {
    const badge = document.getElementById('lb-cart-count');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  },

  _showToast(message, type = 'success') {
    const toast = document.getElementById('cartToast');
    if (toast) {
      toast.textContent = message;
      toast.className = type === 'error' ? 'error show' : 'show';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
    } else {
      showToast(message, type);
    }
  },
};

function buildCartDrawer() {
  if (document.getElementById('lb-cart-drawer')) return;

  const overlay = document.createElement('div');
  overlay.id = 'lb-cart-overlay';
  overlay.className = 'lb-cart-overlay';
  overlay.addEventListener('click', () => LB_CART.closeDrawer());

  const drawer = document.createElement('div');
  drawer.id = 'lb-cart-drawer';
  drawer.className = 'lb-cart-drawer';
  drawer.innerHTML = `
    <div class="lb-cart-header">
      <h3>YOUR CART</h3>
      <button type="button" class="lb-cart-close-btn" onclick="LB_CART.closeDrawer()" aria-label="Close cart">✕</button>
    </div>
    <div class="lb-cart-body" id="lb-cart-body"></div>
    <div class="lb-cart-footer" id="lb-cart-footer"></div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  LB_CART.renderDrawer();
}

function injectCartIcon() {
  const navRights = document.querySelectorAll('.nav-links');
  const lastNavLinks = navRights[navRights.length - 1];
  if (!lastNavLinks || document.getElementById('lb-cart-icon')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'lb-cart-icon';
  btn.className = 'lb-cart-icon-btn';
  btn.setAttribute('aria-label', 'Open cart');
  btn.onclick = () => {
    LB_CART.renderDrawer();
    LB_CART.openDrawer();
  };
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
    <span id="lb-cart-count" style="display:none">0</span>
  `;
  lastNavLinks.appendChild(btn);

  LB_CART._updateBadge(LB_CART.load().reduce((s, i) => s + i.qty, 0));
}

function wireCartRealtime() {
  window.addEventListener('lwb-inventory-update', (ev) => {
    const d = ev.detail || {};
    const cart = getCartRaw();
    let changed = false;
    const next = cart
      .map((line) => {
        if (d.productId && String(line.productId) === String(d.productId)) {
          const avail =
            typeof d.totalStock === 'number'
              ? d.totalStock
              : typeof d.stock === 'number'
                ? d.stock
                : null;
          if (avail != null && line.qty > avail) {
            changed = true;
            LB_CART._showToast(
              avail <= 0
                ? `${line.name} is out of stock — removed from cart.`
                : `Stock update: ${line.name} limited to ${avail}.`,
              'error'
            );
            if (avail <= 0) return null;
            return { ...line, qty: avail };
          }
        }
        return line;
      })
      .filter(Boolean);
    if (changed) {
      saveCartRaw(next);
      LB_CART.renderDrawer();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  buildCartDrawer();
  injectCartIcon();
  updateAllBadges();
  wireCartRealtime();
});

window.LB_CART = LB_CART;
