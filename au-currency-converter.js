/**
 * LWANG BLACK — AU Region Global Currency Converter
 */

window.AUCurrencyState = {
  active: false,
  countryName: null,
  currencyCode: 'AUD',
  rate: 1.0,
  symbol: 'A$'
};

const EXCLUDED_CODES = ['AQ', 'KP', 'NP', 'GB', 'US', 'JP', 'CA', 'NZ', 'AU', 'CN']; 

const API_COUNTRIES = 'https://restcountries.com/v3.1/all?fields=name,currencies,cca2';
const API_RATES = 'https://api.exchangerate-api.com/v4/latest/AUD';

let countriesData = [];
let exchangeRates = {};

async function initAUCurrencyConverter() {
  try {
    const [regRes, ratesRes] = await Promise.all([
      fetch(API_COUNTRIES),
      fetch(API_RATES)
    ]);
    const rawCountries = await regRes.json();
    const ratesData = await ratesRes.json();
    exchangeRates = ratesData.rates || {};

    // Filter and map countries
    countriesData = rawCountries
      .filter(c => !EXCLUDED_CODES.includes(c.cca2))
      .map(c => {
        const currencyKey = Object.keys(c.currencies || {})[0];
        const currencyObj = c.currencies ? c.currencies[currencyKey] : null;
        return {
          name: c.name.common,
          code: c.cca2,
          currency: currencyKey,
          symbol: currencyObj ? currencyObj.symbol : currencyKey
        };
      })
      .filter(c => c.currency && exchangeRates[c.currency]) // Must have known exchange rate
      .sort((a, b) => a.name.localeCompare(b.name));

    buildConverterUI();
    
    // Listen to region changes to show/hide
    document.addEventListener('lb:regionChanged', (e) => {
      const wrapper = document.getElementById('au-currency-wrapper');
      if (wrapper) {
        wrapper.style.display = e.detail.code === 'AU' ? 'flex' : 'none';
      }
      
      // If we switch away from AU, reset the state so we don't accidentally convert US prices
      if (e.detail.code !== 'AU') {
        window.AUCurrencyState.active = false;
        window.AUCurrencyState.rate = 1.0;
        window.AUCurrencyState.currencyCode = 'AUD';
        const sel = document.getElementById('au-currency-select');
        if (sel) sel.value = 'DEFAULT';
      }
    });

  } catch (err) {
    console.error('Failed to init AU Currency Converter:', err);
  }
}

function buildConverterUI() {
  const wrapper = document.createElement('div');
  wrapper.id = 'au-currency-wrapper';
  wrapper.style.cssText = `
    display: none;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255,255,255,0.05);
    border-top: 1px solid rgba(255,255,255,0.1);
    border-bottom: 1px solid rgba(255,255,255,0.1);
    width: 100%;
    margin-bottom: 2rem;
    box-sizing: border-box;
  `;

  let optionsHtml = `<option value="DEFAULT">Australia (AUD)</option>`;
  countriesData.forEach(c => {
    optionsHtml += `<option value="${c.code}">${c.name} (${c.currency})</option>`;
  });

  wrapper.innerHTML = `
    <span style="font-family:var(--font-micro); font-size:0.75rem; letter-spacing:1px; color:var(--text-muted); text-transform:uppercase;">GLOBAL SHIPPING CURRENCY:</span>
    <select id="au-currency-select" style="
      background: #111;
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-family: var(--font-body);
      font-size: 0.9rem;
      cursor: pointer;
      max-width: 300px;
    ">
      ${optionsHtml}
    </select>
  `;

  // Inject above the product grid on shop and index pages
  const shopFilters = document.querySelector('.filters-container');
  const indexSection = document.querySelector('.product-grid');
  
  if (shopFilters) {
    shopFilters.insertAdjacentElement('afterend', wrapper);
  } else if (indexSection) {
    indexSection.parentElement.insertBefore(wrapper, indexSection);
  } else {
    // If not on an index or shop page, inject near navigation or main content
    const nav = document.getElementById('siteNav');
    if (nav) {
      wrapper.style.marginTop = '80px';
      nav.insertAdjacentElement('afterend', wrapper);
    }
  }

  // Set initial display based on current region
  const currentRegion = typeof GeoRouter !== 'undefined' ? GeoRouter.get() : 'AU';
  wrapper.style.display = currentRegion === 'AU' ? 'flex' : 'none';

  // Handle changes
  document.getElementById('au-currency-select').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'DEFAULT') {
      window.AUCurrencyState.active = false;
      window.AUCurrencyState.countryName = 'Australia';
      window.AUCurrencyState.currencyCode = 'AUD';
      window.AUCurrencyState.rate = 1.0;
      window.AUCurrencyState.symbol = 'A$';
    } else {
      const c = countriesData.find(x => x.code === val);
      if (c) {
        window.AUCurrencyState.active = true;
        window.AUCurrencyState.countryName = c.name;
        window.AUCurrencyState.currencyCode = c.currency;
        window.AUCurrencyState.rate = exchangeRates[c.currency] || 1.0;
        window.AUCurrencyState.symbol = c.symbol || c.currency;
      }
    }
    
    // Trigger global re-render event
    document.dispatchEvent(new CustomEvent('lb:currencyConverted'));
  });
}

document.addEventListener('DOMContentLoaded', initAUCurrencyConverter);

