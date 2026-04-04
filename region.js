/**
 * LWANG BLACK — REGION UI v2.0
 * Region Switcher component in nav + flag bar below logo
 * Depends on geo-router.js being loaded first
 */

// ─────────────────────────────────────────────
// REGION SWITCHER — Nav Component
// ─────────────────────────────────────────────
function buildRegionSwitcher() {
  const regionOrder = ['AU', 'NP', 'US', 'GB', 'CA', 'JP', 'NZ', 'CN'];

  const wrapper = document.createElement('div');
  wrapper.className = 'region-switcher';
  wrapper.id = 'regionSwitcher';

  wrapper.innerHTML = `
    <div class="region-switcher-btn" id="regionSwitcherBtn" aria-label="Current Region" style="pointer-events: none; cursor: default; border: none; padding-right: 0;">
      <img class="rs-flag" id="rsFlagDisplay" src="https://flagcdn.com/au.svg" alt="AU" width="18" height="13" />
      <span class="rs-name" id="rsNameDisplay" style="color: rgba(255,255,255,0.7);">Australia</span>
    </div>
  `;

  return wrapper;
}

/**
 * Build the region flag bar shown below the logo in the nav
 */
function buildFlagBar() {
  const bar = document.createElement('div');
  bar.className = 'nav-region-flag-bar';
  bar.id = 'navFlagBar';
  bar.innerHTML = `
    <div class="nrfb-inner">
      <img class="nrfb-flag" id="nrfbFlag" src="https://flagcdn.com/au.svg" alt="AU" width="20" height="14" />
    </div>
  `;
  return bar;
}

/**
 * Initialize the region switcher UI
 */
function initRegionUI() {
  // Inject Region Switcher into nav (right side)
  const navRight = document.querySelector('.nav-right');
  if (navRight) {
    const switcher = buildRegionSwitcher();
    navRight.prepend(switcher);
  }

  // Inject Flag Bar below nav-brand
  const navBrand = document.querySelector('.nav-brand');
  if (navBrand) {
    const flagBar = buildFlagBar();
    navBrand.after(flagBar);
  }

    // DROPDOWN HAS BEEN REMOVED TO LOCK REGION
  // Listen to region changes
  document.addEventListener('lb:regionChanged', (e) => {
    const { code, region } = e.detail;
    updateRegionUI(code, region);
    updateContactSection(code, region);
    updateFlagsGrid(code);
    updateSchemaContact(region);
    updateHomeProducts(code);
  });

  // Listen to currency changes (sub-region in AU)
  document.addEventListener('lb:currencyConverted', () => {
    const activeCode = GeoRouter.get();
    updateHomeProducts(activeCode);
  });
}

/**
 * Update all region-based UI elements
 */
function updateRegionUI(code, region) {
  // Get the ISO slug for flagcdn.com (gb for GB/UK)
  const slug = code.toLowerCase();

  // Update switcher button flag image
  const flagDisplay = document.getElementById('rsFlagDisplay');
  const nameDisplay = document.getElementById('rsNameDisplay');
  if (flagDisplay) { flagDisplay.src = `https://flagcdn.com/${slug}.svg`; flagDisplay.alt = region.name; }
  if (nameDisplay) nameDisplay.textContent = region.name;

  // Update flag bar below logo (flag image only)
  const nrfbFlag = document.getElementById('nrfbFlag');
  if (nrfbFlag) { nrfbFlag.src = `https://flagcdn.com/${slug}.svg`; nrfbFlag.alt = region.name; }

  // Update hero region badge
  const heroFlag = document.getElementById('heroRegionFlag');
  const heroBadge = document.getElementById('heroRegionBadge');
  if (heroFlag) { heroFlag.src = `https://flagcdn.com/${slug}.svg`; heroFlag.alt = region.name; }
  if (heroBadge) heroBadge.textContent = region.name;

  // Mark active option in dropdown
  document.querySelectorAll('.region-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.code === code);
  });

  // Update page lang attribute
  document.documentElement.lang = getLangCode(code);
}

/**
 * Update Hero section — STATIC (original slogan kept, only badge updates)
 * Hero badge is updated in updateRegionUI above.
 */

/**
 * Update Contact block dynamically
 */
function updateContactSection(code, region) {
  const contactPhone = document.getElementById('contactPhone');
  const contactAddress = document.getElementById('contactAddress');
  const contactWhatsapp = document.getElementById('contactWhatsapp');
  const contactRegionName = document.getElementById('contactRegionName');
  const contactFlag = document.getElementById('contactFlag');

  if (contactPhone) contactPhone.textContent = region.phone;
  if (contactAddress) contactAddress.textContent = region.address;
  if (contactRegionName) contactRegionName.textContent = region.name;
  if (contactFlag) contactFlag.textContent = region.flagEmoji;
  if (contactWhatsapp) {
    const msg = encodeURIComponent(`Hi Lwang Black ${region.name} office, I'd like a consultation.`);
    contactWhatsapp.href = `https://wa.me/${region.whatsapp.replace(/\s|\+/g, '')}?text=${msg}`;
  }
}

/**
 * Update Practice Areas — reorder based on region priority
 */
function updatePracticeAreas(code, region) {
  const grid = document.getElementById('practiceAreasGrid');
  if (!grid) return;

  const priority = region.practicePriority || ['commercial', 'migration', 'corporate', 'property'];
  const orderedAreas = [
    ...priority.map(id => PRACTICE_AREAS[id]).filter(Boolean),
    ...Object.values(PRACTICE_AREAS).filter(a => !priority.includes(a.id))
  ].slice(0, 6);

  grid.innerHTML = orderedAreas.map((area, i) => `
    <div class="practice-card ${i === 0 ? 'practice-card--featured' : ''}" data-area="${area.id}">
      <div class="practice-card-icon">${area.icon}</div>
      <h3 class="practice-card-title">${area.title}</h3>
      <p class="practice-card-desc">${area.desc}</p>
      ${i === 0 ? `<span class="practice-featured-label">PRIORITY SERVICE · ${region.name.toUpperCase()}</span>` : ''}
    </div>
  `).join('');
}

/**
 * Highlight active flag in the flags grid
 */
function updateFlagsGrid(activeCode) {
  document.querySelectorAll('.flag-card').forEach(card => {
    const isActive = card.dataset.code === activeCode;
    card.classList.toggle('flag-card--active', isActive);
  });
}

/**
 * Update JSON-LD schema contact info
 */
function updateSchemaContact(region) {
  const schema = document.getElementById('schemaOrg');
  if (!schema) return;
  try {
    const data = JSON.parse(schema.textContent);
    if (data.contactPoint) {
      data.contactPoint.telephone = region.phone;
    }
    schema.textContent = JSON.stringify(data, null, 2);
  } catch(e) {}
}

/**
 * Update Home Page Products dynamically
 */
function updateHomeProducts(code) {
  const grid = document.querySelector('.product-grid');
  if (!grid || !window.LB_PRODUCTS) return;

  const showcaseIds = ['250g', '500g', 'pot-press-gift-set'];
  let html = '';

  showcaseIds.forEach(id => {
    const prod = window.LB_PRODUCTS[id];
    if (!prod) return;
    
    // Fallback if not available in region
    if (prod.allowed_regions !== 'ALL' && Array.isArray(prod.allowed_regions) && !prod.allowed_regions.includes(code)) return;
    
    let priceData = window.getProductPrice ? window.getProductPrice(id, code) : (prod.prices[code] || prod.prices.DEFAULT);
    if (!priceData) priceData = prod.prices.DEFAULT;

    const priceDisplay = priceData ? priceData.display : '';

    const pName = window.LBi18n ? window.LBi18n.t(`prod.${id}.name`, prod.name) : prod.name;
    const pDesc = window.LBi18n ? window.LBi18n.t(`prod.${id}.desc`, prod.description) : prod.description;
    let badgeText = prod.badge || 'PREMIUM';
    if (badgeText === prod.badge) {
      badgeText = window.LBi18n ? window.LBi18n.t(`prod.${id}.badge`, badgeText) : badgeText;
    }
    const btnAddText = window.LBi18n ? window.LBi18n.t('btn.add', 'ADD') : 'ADD';

    html += `
      <div class="product-card" onclick="window.location='catalogue.html#product-${id}'" style="cursor:pointer;">
        <img src="${prod.image}" alt="${pName}" class="product-img" loading="lazy" />
        <span class="label-micro">${prod.category.toUpperCase()} / ${badgeText}</span>
        <h3 style="font-size:1.8rem; margin-bottom:1rem;">${pName}</h3>
        <p style="margin-bottom:2rem; flex-grow:1; color:var(--text-muted); font-size:0.9rem;">${pDesc}</p>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-family:var(--font-heading); font-size:1.5rem;">${priceDisplay}</span>
          <button class="btn-solid" style="padding:0.8rem 1.5rem;" onclick="event.stopPropagation(); if (window.LB_CART) LB_CART.add('${id}')">${btnAddText}</button>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

/**
 * Language codes per region
 */
function getLangCode(code) {
  const map = {
    AU: 'en-AU', NP: 'ne-NP', US: 'en-US',
    GB: 'en-GB', JP: 'ja-JP', NZ: 'en-NZ', CN: 'zh-CN', CA: 'en-CA'
  };
  return map[code] || 'en';
}

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initRegionUI();
  GeoRouter.init();
});

// Backward compat alias
window.LB_REGION = GeoRouter;
