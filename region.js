/**
 * LWANG BLACK — REGION UI v2.1
 * Region Switcher + all region-dependent UI updates.
 * Depends on: geo-router.js (must load first)
 */

function getRegionMap() {
  return window.REGION_DATA || {};
}

function getGeoRouterSafe() {
  return (window.GeoRouter && typeof window.GeoRouter.get === 'function')
    ? window.GeoRouter
    : null;
}

function getRegionSafe(code) {
  const map = getRegionMap();
  if (code && map[code]) return map[code];
  return map.NP || {
    code: 'NP',
    slug: 'np',
    name: 'Nepal',
    flagEmoji: '🇳🇵',
    phone: '+977 1 5970 800',
    whatsapp: '+97715970800',
    address: 'Kathmandu, Nepal',
  };
}

// ─────────────────────────────────────────────
// REGION SWITCHER
// ─────────────────────────────────────────────
function buildRegionSwitcher() {
  const regionOrder = ['AU', 'NP', 'US', 'GB', 'EU', 'CA', 'JP', 'NZ'];
  const regionMap = getRegionMap();

  const wrapper = document.createElement('div');
  wrapper.className = 'region-switcher';
  wrapper.id = 'regionSwitcher';

  wrapper.innerHTML = `
    <div class="region-switcher-btn" id="regionSwitcherBtn" aria-label="Choose Region">
      <img class="rs-flag" id="rsFlagDisplay" src="https://flagcdn.com/au.svg" alt="AU" width="18" height="13" />
      <span class="rs-name" id="rsNameDisplay">Australia</span>
      <svg class="rs-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </div>
    <div class="region-dropdown" id="regionDropdown">
      <div class="rd-header">Select Region</div>
      ${regionOrder.map(code => {
        const r = regionMap[code];
        if (!r) return '';
        // Use ISO 2-letter code for flagcdn (gb not uk)
        const slug = typeof r.slug === 'string' && r.slug ? r.slug.toLowerCase() : code.toLowerCase();
        const flagSlug = code === 'GB' ? 'gb' : code === 'EU' ? 'eu' : slug;
        return `
          <button class="region-option" data-code="${code}" type="button">
            <img src="https://flagcdn.com/${flagSlug}.svg" alt="${r.name}" width="18" height="13" />
            <span>${r.name}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;

  // Toggle dropdown on button click
  wrapper.addEventListener('click', (e) => {
    const btn = document.getElementById('regionSwitcherBtn');
    const drop = document.getElementById('regionDropdown');
    const optionBtn = e.target && e.target.closest ? e.target.closest('.region-option') : null;

    if (optionBtn) {
      const nextCode = optionBtn.getAttribute('data-code');
      const router = getGeoRouterSafe();
      if (router && typeof router.set === 'function' && nextCode) {
        router.set(nextCode);
      }
      if (drop) drop.classList.remove('active');
      if (btn) btn.classList.remove('active');
      return;
    }

    if (btn && drop && (btn.contains(e.target) || btn === e.target)) {
      e.stopPropagation();
      const open = drop.classList.toggle('active');
      btn.classList.toggle('active', open);
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    const drop = document.getElementById('regionDropdown');
    const btn = document.getElementById('regionSwitcherBtn');
    if (drop) drop.classList.remove('active');
    if (btn) btn.classList.remove('active');
  });

  return wrapper;
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function initRegionUI() {
  const navRight = document.querySelector('.nav-right');
  if (navRight && !document.getElementById('regionSwitcher')) {
    navRight.prepend(buildRegionSwitcher());
  }

  // Listen to region changes (fired by GeoRouter after init / manual set)
  document.addEventListener('lb:regionChanged', (e) => {
    const detail = e && e.detail ? e.detail : {};
    const code = (detail.code || 'NP').toUpperCase();
    const region = detail.region || getRegionSafe(code);
    updateRegionUI(code, region);
    updateContactSection(code, region);
    updatePracticeAreas(code, region);
    updateFlagsGrid(code);
    updateSchemaContact(region);
    updateHomeProducts(code);
  });

  // When currency converter changes, re-render product prices
  document.addEventListener('lb:currencyConverted', () => {
    const router = getGeoRouterSafe();
    const code = router ? router.get() : 'NP';
    updateHomeProducts(code);
  });
}

// ─────────────────────────────────────────────
// UI UPDATE HELPERS
// ─────────────────────────────────────────────

function updateRegionUI(code, region) {
  const safeRegion = region || getRegionSafe(code);
  const safeCode = (code || safeRegion.code || 'NP').toUpperCase();
  // flagcdn uses lowercase ISO code; GB not UK
  const flagSlug = safeCode === 'GB' ? 'gb' : safeCode === 'EU' ? 'eu' : safeCode.toLowerCase();

  const flagDisplay = document.getElementById('rsFlagDisplay');
  const nameDisplay = document.getElementById('rsNameDisplay');
  if (flagDisplay) { flagDisplay.src = `https://flagcdn.com/${flagSlug}.svg`; flagDisplay.alt = safeRegion.name; }
  if (nameDisplay) nameDisplay.textContent = safeRegion.name;

  const heroFlag = document.getElementById('heroRegionFlag');
  const heroBadge = document.getElementById('heroRegionBadge');
  if (heroFlag) { heroFlag.src = `https://flagcdn.com/${flagSlug}.svg`; heroFlag.alt = safeRegion.name; }
  if (heroBadge) heroBadge.textContent = safeRegion.name;

  document.querySelectorAll('.region-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.code === safeCode);
  });

  document.documentElement.lang = getLangCode(safeCode);
}

function updateContactSection(code, region) {
  const safeRegion = region || getRegionSafe(code);
  const elPhone   = document.getElementById('contactPhone');
  const elAddr    = document.getElementById('contactAddress');
  const elWa      = document.getElementById('contactWhatsapp');
  const elName    = document.getElementById('contactRegionName');
  const elFlag    = document.getElementById('contactFlag');

  if (elPhone)  elPhone.textContent = safeRegion.phone || '';
  if (elAddr)   elAddr.textContent  = safeRegion.address || '';
  if (elName)   elName.textContent  = safeRegion.name || '';
  if (elFlag)   elFlag.textContent  = safeRegion.flagEmoji || '';
  if (elWa) {
    const msg = encodeURIComponent(`Hi Lwang Black ${safeRegion.name || ''} office, I'd like a consultation.`);
    const waNumber = String(safeRegion.whatsapp || '').replace(/[\s+]/g, '');
    if (waNumber) {
      elWa.href = `https://wa.me/${waNumber}?text=${msg}`;
    }
  }
}

function updatePracticeAreas(code, region) {
  const grid = document.getElementById('practiceAreasGrid');
  if (!grid) return;
  const areas = window.PRACTICE_AREAS;
  if (!areas || typeof areas !== 'object') return;

  const safeRegion = region || getRegionSafe(code);
  const priority = safeRegion.practicePriority || ['commercial', 'migration', 'corporate', 'property'];
  const ordered = [
    ...priority.map(id => areas[id]).filter(Boolean),
    ...Object.values(areas).filter(a => !priority.includes(a.id))
  ].slice(0, 6);

  grid.innerHTML = ordered.map((area, i) => `
    <div class="practice-card ${i === 0 ? 'practice-card--featured' : ''}" data-area="${area.id}">
      <div class="practice-card-icon">${area.icon}</div>
      <h3 class="practice-card-title">${area.title}</h3>
      <p class="practice-card-desc">${area.desc}</p>
      ${i === 0 ? `<span class="practice-featured-label">PRIORITY SERVICE · ${(safeRegion.name || '').toUpperCase()}</span>` : ''}
    </div>
  `).join('');
}

function updateFlagsGrid(activeCode) {
  document.querySelectorAll('.flag-card').forEach(card => {
    card.classList.toggle('flag-card--active', card.dataset.code === activeCode);
  });
}

function updateSchemaContact(region) {
  const safeRegion = region || getRegionSafe('NP');
  const schema = document.getElementById('schemaOrg');
  if (!schema) return;
  try {
    const data = JSON.parse(schema.textContent);
    if (data.contactPoint) data.contactPoint.telephone = safeRegion.phone;
    schema.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    console.warn('[region.js] Failed to update schema contact:', e.message);
  }
}

function updateHomeProducts(code) {
  const grid = document.querySelector('.product-grid');
  const products = window.LB_PRODUCTS;
  if (!grid || !products || typeof products !== 'object') return;
  const safeCode = (code || 'NP').toUpperCase();

  const showcaseIds = [
    'lb-pot-and-press-gift-set',
    'lwang-black-drip-set',
    '5oog-lwang-black-mix',
    '250g-lwang-black-mix',
    'lwang-black-drip-coffee-bags'
  ];
  let html = '';

  showcaseIds.forEach(id => {
    const prod = products[id];
    if (!prod) return;

    if (prod.allowed_regions !== 'ALL' &&
        Array.isArray(prod.allowed_regions) &&
        !prod.allowed_regions.includes(safeCode)) return;

    let priceData = window.getProductPrice
      ? window.getProductPrice(id, safeCode)
      : (prod.prices && (prod.prices[safeCode] || prod.prices.DEFAULT));
    if (!priceData && prod.prices) priceData = prod.prices.DEFAULT;

    // Currency conversion
    let priceDisplay = priceData ? priceData.display : '';
    if (window.AUCurrencyState && window.AUCurrencyState.active && priceData && typeof priceData.amount !== 'undefined') {
      const converted = window.LBConvertPrice
        ? window.LBConvertPrice(priceData.amount)
        : (priceData.amount * window.AUCurrencyState.rate).toFixed(2);
      const sym = window.AUCurrencyState.symbol || window.AUCurrencyState.targetCurrency;
      priceDisplay = `${sym}${parseFloat(converted).toLocaleString('en', { minimumFractionDigits: 2 })}`;
    }

    const pName   = window.LBi18n ? window.LBi18n.t(`prod.${id}.name`, prod.name) : prod.name;
    const pDesc   = window.LBi18n ? window.LBi18n.t(`prod.${id}.desc`, prod.description) : prod.description;
    let badgeText = prod.badge || 'PREMIUM';
    if (badgeText === prod.badge) badgeText = window.LBi18n ? window.LBi18n.t(`prod.${id}.badge`, badgeText) : badgeText;
    const btnAdd  = window.LBi18n ? window.LBi18n.t('btn.add', 'ADD') : 'ADD';

    html += `
      <div class="product-card" onclick="window.location='catalogue.html#product-${id}'" style="cursor:pointer;">
        <div style="position:relative;">
          <img src="${prod.image}" alt="${pName}" class="product-img" loading="lazy" />
        </div>
        <span class="label-micro" style="margin-bottom:0.5rem;">${prod.category.toUpperCase()} / ${badgeText}</span>
        <h3 style="font-size:1.8rem; margin-bottom:1rem;">${pName}</h3>
        <p style="margin-bottom:2rem; flex-grow:1; color:var(--text-muted); font-size:0.9rem; line-height:1.7;
                  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${pDesc}</p>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-family:var(--font-heading); font-size:1.5rem;">${priceDisplay}</span>
          <button class="btn-solid" style="padding:0.8rem 1.5rem;"
            onclick="event.stopPropagation(); if(window.LB_CART) LB_CART.add('${id}')">${btnAdd}</button>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

function getLangCode(code) {
  const map = { AU:'en-AU', NP:'ne-NP', US:'en-US', GB:'en-GB', EU:'en', JP:'ja-JP', NZ:'en-NZ', CN:'zh-CN', CA:'en-CA' };
  return map[code] || 'en';
}

// ─────────────────────────────────────────────
// BOOT — wait for DOM, then init UI, then start GeoRouter
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initRegionUI();
  // window.GeoRouter.init() dispatches lb:regionChanged once the region is resolved
  const router = getGeoRouterSafe();
  if (router && typeof router.init === 'function') {
    router.init();
  } else {
    console.error('[region.js] GeoRouter not found — is geo-router.js loaded first?');
  }
});

// Backward-compat alias — set after DOMContentLoaded so GeoRouter is guaranteed available
window.LB_REGION = getGeoRouterSafe();

// Sync storefront pricing region (used by /api/store cart + product cards)
(function syncLwbRegion() {
  function mapCode(code) {
    const m = { AU: 'AU', NP: 'NP', US: 'US', GB: 'GB', EU: 'EU', CA: 'CA', JP: 'JP', NZ: 'NZ', CN: 'NP' };
    return m[code] || 'NP';
  }
  document.addEventListener('lb:regionChanged', (e) => {
    try {
      const code = e.detail && e.detail.code;
      if (code) localStorage.setItem('lwb_region', mapCode(code));
    } catch (err) {
      console.warn('[region.js] Failed to persist lwb_region:', err.message);
    }
  });
})();
