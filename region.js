/**
 * LWANG BLACK — REGION UI v2.1
 * Region Switcher + all region-dependent UI updates.
 * Depends on: geo-router.js (must load first)
 */

// ─────────────────────────────────────────────
// REGION SWITCHER
// ─────────────────────────────────────────────
function buildRegionSwitcher() {
  const regionOrder = ['AU', 'NP', 'US', 'GB', 'CA', 'JP', 'NZ'];

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
        const r = REGION_DATA[code];
        if (!r) return '';
        // Use ISO 2-letter code for flagcdn (gb not uk)
        const flagSlug = code === 'GB' ? 'gb' : r.slug.toLowerCase();
        return `
          <button class="region-option" data-code="${code}"
            onclick="window.GeoRouter.set('${code}'); document.getElementById('regionDropdown').classList.remove('active'); document.getElementById('regionSwitcherBtn').classList.remove('active');">
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
    const { code, region } = e.detail;
    updateRegionUI(code, region);
    updateContactSection(code, region);
    updateFlagsGrid(code);
    updateSchemaContact(region);
    updateHomeProducts(code);
  });

  // When currency converter changes, re-render product prices
  document.addEventListener('lb:currencyConverted', () => {
    const code = GeoRouter.get();
    updateHomeProducts(code);
  });
}

// ─────────────────────────────────────────────
// UI UPDATE HELPERS
// ─────────────────────────────────────────────

function updateRegionUI(code, region) {
  // flagcdn uses lowercase ISO code; GB not UK
  const flagSlug = code === 'GB' ? 'gb' : code.toLowerCase();

  const flagDisplay = document.getElementById('rsFlagDisplay');
  const nameDisplay = document.getElementById('rsNameDisplay');
  if (flagDisplay) { flagDisplay.src = `https://flagcdn.com/${flagSlug}.svg`; flagDisplay.alt = region.name; }
  if (nameDisplay) nameDisplay.textContent = region.name;

  const heroFlag = document.getElementById('heroRegionFlag');
  const heroBadge = document.getElementById('heroRegionBadge');
  if (heroFlag) { heroFlag.src = `https://flagcdn.com/${flagSlug}.svg`; heroFlag.alt = region.name; }
  if (heroBadge) heroBadge.textContent = region.name;

  document.querySelectorAll('.region-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.code === code);
  });

  document.documentElement.lang = getLangCode(code);
}

function updateContactSection(code, region) {
  const elPhone   = document.getElementById('contactPhone');
  const elAddr    = document.getElementById('contactAddress');
  const elWa      = document.getElementById('contactWhatsapp');
  const elName    = document.getElementById('contactRegionName');
  const elFlag    = document.getElementById('contactFlag');

  if (elPhone)  elPhone.textContent = region.phone;
  if (elAddr)   elAddr.textContent  = region.address;
  if (elName)   elName.textContent  = region.name;
  if (elFlag)   elFlag.textContent  = region.flagEmoji;
  if (elWa) {
    const msg = encodeURIComponent(`Hi Lwang Black ${region.name} office, I'd like a consultation.`);
    elWa.href = `https://wa.me/${region.whatsapp.replace(/[\s+]/g, '')}?text=${msg}`;
  }
}

function updatePracticeAreas(code, region) {
  const grid = document.getElementById('practiceAreasGrid');
  if (!grid) return;

  const priority = region.practicePriority || ['commercial', 'migration', 'corporate', 'property'];
  const ordered = [
    ...priority.map(id => PRACTICE_AREAS[id]).filter(Boolean),
    ...Object.values(PRACTICE_AREAS).filter(a => !priority.includes(a.id))
  ].slice(0, 6);

  grid.innerHTML = ordered.map((area, i) => `
    <div class="practice-card ${i === 0 ? 'practice-card--featured' : ''}" data-area="${area.id}">
      <div class="practice-card-icon">${area.icon}</div>
      <h3 class="practice-card-title">${area.title}</h3>
      <p class="practice-card-desc">${area.desc}</p>
      ${i === 0 ? `<span class="practice-featured-label">PRIORITY SERVICE · ${region.name.toUpperCase()}</span>` : ''}
    </div>
  `).join('');
}

function updateFlagsGrid(activeCode) {
  document.querySelectorAll('.flag-card').forEach(card => {
    card.classList.toggle('flag-card--active', card.dataset.code === activeCode);
  });
}

function updateSchemaContact(region) {
  const schema = document.getElementById('schemaOrg');
  if (!schema) return;
  try {
    const data = JSON.parse(schema.textContent);
    if (data.contactPoint) data.contactPoint.telephone = region.phone;
    schema.textContent = JSON.stringify(data, null, 2);
  } catch(e) {}
}

function updateHomeProducts(code) {
  const grid = document.querySelector('.product-grid');
  if (!grid || !window.LB_PRODUCTS) return;

  const showcaseIds = [
    'lb-pot-and-press-gift-set',
    'lwang-black-drip-set',
    '5oog-lwang-black-mix',
    '250g-lwang-black',
    'lwang-black-drip-coffee-bags'
  ];
  let html = '';

  showcaseIds.forEach(id => {
    const prod = window.LB_PRODUCTS[id];
    if (!prod) return;

    if (prod.allowed_regions !== 'ALL' &&
        Array.isArray(prod.allowed_regions) &&
        !prod.allowed_regions.includes(code)) return;

    let priceData = window.getProductPrice
      ? window.getProductPrice(id, code)
      : (prod.prices[code] || prod.prices.DEFAULT);
    if (!priceData) priceData = prod.prices.DEFAULT;

    // Currency conversion
    let priceDisplay = priceData ? priceData.display : '';
    if (window.AUCurrencyState && window.AUCurrencyState.active && priceData && priceData.amount) {
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
  const map = { AU:'en-AU', NP:'ne-NP', US:'en-US', GB:'en-GB', JP:'ja-JP', NZ:'en-NZ', CN:'zh-CN', CA:'en-CA' };
  return map[code] || 'en';
}

// ─────────────────────────────────────────────
// BOOT — wait for DOM, then init UI, then start GeoRouter
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initRegionUI();
  // GeoRouter.init() dispatches lb:regionChanged once the region is resolved
  if (typeof GeoRouter !== 'undefined') {
    GeoRouter.init();
  } else {
    console.error('[region.js] GeoRouter not found — is geo-router.js loaded first?');
  }
});

// Backward-compat alias
window.LB_REGION = GeoRouter;
