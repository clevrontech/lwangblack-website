/**
 * LWANG BLACK — CART SYSTEM
 * Cart state management, cart drawer UI, localStorage persistence
 */

const LB_CART = {
  STORAGE_KEY: 'lb_cart',

  /** Load cart from localStorage */
  load() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch { return []; }
  },

  /** Save cart to localStorage */
  save(items) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    this._updateBadge(items.reduce((s, i) => s + i.qty, 0));
  },

  /** Add item to cart */
  add(productId, variant = null) {
    const country = window.LB_REGION?.get() || 'US';
    const product = window.LB_PRODUCTS?.[productId];
    const priceObj = window.getProductPrice?.(productId, country);

    if (!product || !priceObj) {
      this._showToast('Not available in your region', 'error');
      return;
    }

    const items = this.load();
    const key = variant ? `${productId}-${variant}` : productId;
    const existing = items.find(i => i.key === key);

    if (existing) {
      existing.qty++;
    } else {
      items.push({
        key,
        productId,
        variant,
        name: product.name + (variant ? ` (${variant})` : ''),
        image: product.image,
        price: priceObj.amount,
        currency: priceObj.currency,
        symbol: priceObj.symbol,
        display: priceObj.display,
        qty: 1
      });
    }

    this.save(items);
    this.renderDrawer();
    this.openDrawer();
    this._showToast(`✓ ${product.name} added to cart`);

    // GTM: add_to_cart event
    if (window.dataLayer) {
      window.dataLayer.push({
        event: 'add_to_cart',
        currency: priceObj.currency,
        value: priceObj.amount,
        items: [{ item_id: productId, item_name: product.name, price: priceObj.amount, quantity: 1, item_variant: variant || '' }]
      });
    }
  },

  /** Remove item */
  remove(key) {
    const removing = this.load().find(i => i.key === key);
    const items = this.load().filter(i => i.key !== key);
    this.save(items);
    this.renderDrawer();
    // GTM: remove_from_cart event
    if (window.dataLayer && removing) {
      window.dataLayer.push({
        event: 'remove_from_cart',
        currency: removing.currency,
        value: removing.price * removing.qty,
        items: [{ item_id: removing.productId, item_name: removing.name, price: removing.price, quantity: removing.qty }]
      });
    }
  },

  /** Update quantity */
  setQty(key, qty) {
    if (qty < 1) { this.remove(key); return; }
    const items = this.load();
    const item = items.find(i => i.key === key);
    if (item) { item.qty = qty; this.save(items); this.renderDrawer(); }
  },

  /** Clear cart */
  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
    this._updateBadge(0);
  },

  /** Get cart totals */
  getTotals() {
    const items = this.load();
    if (!items.length) return { count: 0, subtotal: 0, currency: 'USD', symbol: '$', display: '$0.00' };
    const first = items[0];
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    return {
      count: items.reduce((s, i) => s + i.qty, 0),
      subtotal,
      currency: first.currency,
      symbol: first.symbol,
      display: `${first.symbol}${subtotal.toLocaleString(undefined, { minimumFractionDigits: subtotal < 100 ? 2 : 0, maximumFractionDigits: subtotal < 100 ? 2 : 0 })}`
    };
  },

  /** Open cart drawer */
  openDrawer() {
    document.getElementById('lb-cart-drawer')?.classList.add('open');
    document.getElementById('lb-cart-overlay')?.classList.add('show');
    document.body.style.overflow = 'hidden';
    // GTM: view_cart event
    if (window.dataLayer) {
      const totals = this.getTotals();
      window.dataLayer.push({
        event: 'view_cart',
        currency: totals.currency,
        value: totals.subtotal
      });
    }
  },

  /** Close cart drawer */
  closeDrawer() {
    document.getElementById('lb-cart-drawer')?.classList.remove('open');
    document.getElementById('lb-cart-overlay')?.classList.remove('show');
    document.body.style.overflow = '';
  },

  /** Render cart drawer contents */
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

    body.innerHTML = items.map(item => `
      <div class="lb-cart-item" data-key="${item.key}">
        <img src="${item.image}" alt="${item.name}" onerror="this.src='images/product-hero-500g.jpg'"/>
        <div class="lb-cart-item-info">
          <div class="lb-cart-item-name">${item.name}</div>
          <div class="lb-cart-item-price">${item.symbol}${(item.price * item.qty).toLocaleString(undefined, {minimumFractionDigits: item.price < 100 ? 2 : 0, maximumFractionDigits: item.price < 100 ? 2 : 0})}</div>
          <div class="lb-cart-qty-row">
            <button class="lb-qty-btn" onclick="LB_CART.setQty('${item.key}', ${item.qty - 1})">−</button>
            <span class="lb-qty-num">${item.qty}</span>
            <button class="lb-qty-btn" onclick="LB_CART.setQty('${item.key}', ${item.qty + 1})">+</button>
            <button class="lb-cart-remove" onclick="LB_CART.remove('${item.key}')">Remove</button>
          </div>
        </div>
      </div>
    `).join('');

    if (footer) {
      const canCheckout = typeof window.LB_REGION?.canCheckout === 'function' ? window.LB_REGION.canCheckout() : true;
      footer.innerHTML = `
        <div class="lb-cart-subtotal">
          <span>Subtotal</span>
          <strong>${totals.display}</strong>
        </div>
        <p class="lb-cart-note">Shipping calculated at checkout</p>
        ${canCheckout
          ? `<a href="checkout.html" class="btn-solid lb-checkout-btn" onclick="LB_CART.closeDrawer()">PROCEED TO CHECKOUT</a>`
          : `<button class="btn-solid lb-checkout-btn lb-blocked" disabled>NOT AVAILABLE IN YOUR REGION</button>`
        }
      `;
    }
  },

  /** Update cart badge count */
  _updateBadge(count) {
    const badge = document.getElementById('lb-cart-count');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  },

  /** Show toast notification */
  _showToast(message, type = 'success') {
    const toast = document.getElementById('cartToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = type === 'error' ? 'error show' : 'show';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }
};

/** Build and inject cart drawer HTML */
function buildCartDrawer() {
  if (document.getElementById('lb-cart-drawer')) return;

  const existing = document.getElementById('cartToast');

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
      <button class="lb-cart-close-btn" onclick="LB_CART.closeDrawer()" aria-label="Close cart">✕</button>
    </div>
    <div class="lb-cart-body" id="lb-cart-body"></div>
    <div class="lb-cart-footer" id="lb-cart-footer"></div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  LB_CART.renderDrawer();
}

/** Inject cart icon into nav */
function injectCartIcon() {
  const navRights = document.querySelectorAll('.nav-links');
  const lastNavLinks = navRights[navRights.length - 1];
  if (!lastNavLinks || document.getElementById('lb-cart-icon')) return;

  const btn = document.createElement('button');
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

  // Update badge on load
  const count = LB_CART.load().reduce((s, i) => s + i.qty, 0);
  LB_CART._updateBadge(count);
}

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  buildCartDrawer();
  injectCartIcon();
});

window.LB_CART = LB_CART;
