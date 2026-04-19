/**
 * LWANG BLACK — Global Currency Converter
 * Works on ALL region pages. Converts prices from the active region's
 * base currency into any other currency the visitor chooses.
 *
 * Depends on: geo-router.js (must load first)
 */

// Shared state — consumed by pricing.js / product rendering
window.AUCurrencyState = {
  active: false,
  baseCurrency: 'AUD',      // region's native currency
  targetCurrency: 'AUD',    // currently selected target
  rate: 1.0,
  symbol: 'A$',
  countryName: 'Australia',
};

const LB_CURRENCY_STORAGE_KEY = 'lb_currency_target_v2';

// Regions that have their own dedicated pricing (no conversion needed)
// When region changes, we switch base currency accordingly
const REGION_CURRENCIES = {
  AU: { code: 'AUD', symbol: 'A$' },
  US: { code: 'USD', symbol: '$' },
  GB: { code: 'GBP', symbol: '£' },
  EU: { code: 'EUR', symbol: '€' },
  NP: { code: 'NPR', symbol: 'रू' },
  JP: { code: 'JPY', symbol: '¥' },
  NZ: { code: 'NZD', symbol: 'NZ$' },
  CN: { code: 'CNY', symbol: '¥' },
  CA: { code: 'CAD', symbol: 'CA$' },
};

let _countriesData = [];
let _exchangeRates = {};       // rates FROM current base currency
let _currentBaseCurrency = 'AUD';
let _converterReady = false;

// ── Fetch helpers ──────────────────────────────────────────────────────────

function _fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function _fetchRates(baseCurrency) {
  // Primary: open.er-api.com (free, no key needed)
  try {
    const res = await _fetchWithTimeout(
      `https://open.er-api.com/v6/latest/${baseCurrency}`, 6000
    );
    if (res.ok) {
      const data = await res.json();
      if (data.result === 'success' && data.rates) return data.rates;
    }
  } catch(e) { /* try fallback */ }

  // Fallback: frankfurter.app (ECB data, no key, covers major currencies)
  try {
    const res = await _fetchWithTimeout(
      `https://api.frankfurter.app/latest?from=${baseCurrency}`, 6000
    );
    if (res.ok) {
      const data = await res.json();
      if (data.rates) {
        // frankfurter doesn't return the base in rates, add it
        data.rates[baseCurrency] = 1.0;
        return data.rates;
      }
    }
  } catch(e) { /* continue */ }

  return null;
}

async function _fetchCountries() {
  try {
    const res = await _fetchWithTimeout(
      'https://restcountries.com/v3.1/all?fields=name,currencies,cca2', 8000
    );
    if (res.ok) return await res.json();
  } catch(e) {}
  return [];
}

// ── Core init ──────────────────────────────────────────────────────────────

async function initAUCurrencyConverter() {
  try {
    const currentCode = (typeof GeoRouter !== 'undefined') ? GeoRouter.get() : 'AU';
    const regionCurrency = REGION_CURRENCIES[currentCode] || REGION_CURRENCIES.AU;
    _currentBaseCurrency = regionCurrency.code;

    window.AUCurrencyState.baseCurrency = _currentBaseCurrency;
    window.AUCurrencyState.symbol = regionCurrency.symbol;

    // Fetch countries + exchange rates in parallel
    const [rawCountries, rates] = await Promise.all([
      _fetchCountries(),
      _fetchRates(_currentBaseCurrency)
    ]);

    _exchangeRates = rates || {};

    _countriesData = rawCountries
      .map(c => {
        const key = Object.keys(c.currencies || {})[0];
        const obj = c.currencies ? c.currencies[key] : null;
        return {
          name: c.name ? c.name.common : '',
          code: c.cca2,
          currency: key,
          symbol: obj ? (obj.symbol || key) : key
        };
      })
      .filter(c => c.currency && c.name && _exchangeRates[c.currency])
      .sort((a, b) => a.name.localeCompare(b.name));

    _converterReady = true;
    buildConverterUI();
    _restoreSelection();

    // Listen to region changes
    document.addEventListener('lb:regionChanged', async (e) => {
      const newCode = e.detail.code;
      const newCur = REGION_CURRENCIES[newCode] || REGION_CURRENCIES.AU;
      if (newCur.code !== _currentBaseCurrency) {
        _currentBaseCurrency = newCur.code;
        window.AUCurrencyState.baseCurrency = _currentBaseCurrency;
        // Fetch fresh rates for new base currency
        const freshRates = await _fetchRates(_currentBaseCurrency);
        if (freshRates) _exchangeRates = freshRates;
        // Rebuild options with new rates filter
        _rebuildOptions();
        _restoreSelection();
      }
      // Always show the bar on all regions
      const wrapper = document.getElementById('lb-currency-wrapper');
      if (wrapper) wrapper.style.display = 'flex';
    });

  } catch(err) {
    console.warn('[LBCurrency] Init failed:', err);
  }
}

// ── UI build ───────────────────────────────────────────────────────────────

function buildConverterUI() {
  if (document.getElementById('lb-currency-wrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'lb-currency-wrapper';
  wrapper.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: rgba(255,255,255,0.04);
    border-top: 1px solid rgba(255,255,255,0.08);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    width: 100%;
    box-sizing: border-box;
    flex-wrap: wrap;
  `;

  wrapper.innerHTML = `
    <span style="font-family:var(--font-micro,monospace); font-size:0.72rem; letter-spacing:1px; color:var(--text-muted,#888); text-transform:uppercase; white-space:nowrap;">
      VIEW PRICES IN:
    </span>
    <select id="lb-currency-select" style="
      background: #111;
      border: 1px solid var(--border-color,#333);
      color: var(--text-primary,#fff);
      padding: 0.45rem 0.9rem;
      border-radius: 4px;
      font-family: var(--font-body,sans-serif);
      font-size: 0.88rem;
      cursor: pointer;
      max-width: 280px;
    ">
      ${_buildOptions()}
    </select>
    <span id="lb-currency-rate-label" style="font-size:0.78rem; color:var(--text-muted,#888); white-space:nowrap;"></span>
  `;

  // Inject after filters, or before product grid, or after nav
  const target = document.querySelector('.filters-container') ||
                 document.querySelector('.product-grid') ||
                 document.getElementById('siteNav');

  if (target && target.classList && target.classList.contains('filters-container')) {
    target.insertAdjacentElement('afterend', wrapper);
  } else if (target && target.classList && target.classList.contains('product-grid')) {
    target.parentElement.insertBefore(wrapper, target);
  } else if (target) {
    wrapper.style.marginTop = '80px';
    target.insertAdjacentElement('afterend', wrapper);
  } else {
    // Last resort: prepend to body
    document.body.prepend(wrapper);
  }

  document.getElementById('lb-currency-select').addEventListener('change', _handleChange);
}

function _buildOptions() {
  const baseCur = _currentBaseCurrency;
  const baseRegionName = Object.keys(REGION_CURRENCIES)
    .find(k => REGION_CURRENCIES[k].code === baseCur) || 'AU';
  const rd = (typeof REGION_DATA !== 'undefined' && REGION_DATA[baseRegionName])
    ? REGION_DATA[baseRegionName].name
    : baseCur;

  let html = `<option value="DEFAULT">${rd} (${baseCur})</option>`;
  _countriesData.forEach(c => {
    if (c.currency === baseCur) return; // skip same currency
    html += `<option value="${c.code}">${c.name} (${c.currency})</option>`;
  });
  return html;
}

function _rebuildOptions() {
  const sel = document.getElementById('lb-currency-select');
  if (!sel) return;
  sel.innerHTML = _buildOptions();
}

function _restoreSelection() {
  try {
    const saved = localStorage.getItem(LB_CURRENCY_STORAGE_KEY);
    if (saved) {
      const sel = document.getElementById('lb-currency-select');
      if (sel) {
        // Check if the saved value exists as an option
        const opt = Array.from(sel.options).find(o => o.value === saved);
        if (opt) {
          sel.value = saved;
          sel.dispatchEvent(new Event('change'));
          return;
        }
      }
    }
  } catch(e) {}
  _applyConversion('DEFAULT');
}

function _handleChange(e) {
  const val = e.target.value;
  try { localStorage.setItem(LB_CURRENCY_STORAGE_KEY, val); } catch(ex) {}
  _applyConversion(val);
}

function _applyConversion(val) {
  const label = document.getElementById('lb-currency-rate-label');

  if (val === 'DEFAULT') {
    window.AUCurrencyState.active = false;
    window.AUCurrencyState.targetCurrency = _currentBaseCurrency;
    window.AUCurrencyState.rate = 1.0;
    window.AUCurrencyState.symbol = _getBaseSymbol();
    window.AUCurrencyState.countryName = '';
    if (label) label.textContent = '';
  } else {
    const c = _countriesData.find(x => x.code === val);
    if (c && _exchangeRates[c.currency]) {
      const rate = _exchangeRates[c.currency];
      window.AUCurrencyState.active = true;
      window.AUCurrencyState.targetCurrency = c.currency;
      window.AUCurrencyState.rate = rate;
      window.AUCurrencyState.symbol = c.symbol;
      window.AUCurrencyState.countryName = c.name;
      if (label) label.textContent = `1 ${_currentBaseCurrency} = ${rate.toFixed(4)} ${c.currency}`;
    } else {
      // Currency not in rates (e.g. frankfurter doesn't have it)
      window.AUCurrencyState.active = false;
      window.AUCurrencyState.rate = 1.0;
      if (label) label.textContent = 'Rate unavailable';
    }
  }

  document.dispatchEvent(new CustomEvent('lb:currencyConverted'));
}

function _getBaseSymbol() {
  const entry = Object.values(REGION_CURRENCIES).find(r => r.code === _currentBaseCurrency);
  return entry ? entry.symbol : _currentBaseCurrency;
}

// ── Expose helper: convert a price amount ─────────────────────────────────
window.LBConvertPrice = function(amount) {
  if (!window.AUCurrencyState.active) return amount;
  return +(amount * window.AUCurrencyState.rate).toFixed(2);
};

window.LBFormatPrice = function(amount) {
  const converted = window.LBConvertPrice(amount);
  if (!window.AUCurrencyState.active) return null; // let caller use original
  const sym = window.AUCurrencyState.symbol || window.AUCurrencyState.targetCurrency;
  return `${sym}${converted.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initAUCurrencyConverter);
