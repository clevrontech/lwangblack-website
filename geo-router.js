/**
 * LWANG BLACK — GEO ROUTING ENGINE v2.2
 * IP-based detection, bot protection, region data & currency state.
 *
 * Routing policy:
 *   • Nepal IP            → NP region (Nepal site / NPR pricing)
 *   • Supported region IP → matching region (own currency)
 *   • Anything else       → AU fallback (Australia site / AUD pricing)
 */

// Default region for any visitor we cannot place — bots, private IPs,
// unsupported country codes, geolocation failures.
const FALLBACK_REGION = 'AU';

// ─────────────────────────────────────────────
// BOT DETECTION
// ─────────────────────────────────────────────
const BOT_PATTERNS = /googlebot|bingbot|baiduspider|yandexbot|duckduckbot|slurp|facebot|ia_archiver|mj12bot|ahrefsbot|semrushbot|screaming.?frog/i;
const IS_BOT = BOT_PATTERNS.test(navigator.userAgent);

// ─────────────────────────────────────────────
// REGION DATA
// ─────────────────────────────────────────────
const REGION_DATA = {
  AU: {
    code: 'AU', slug: 'au', name: 'Australia', flag: '🇦🇺', flagEmoji: '🇦🇺',
    currency: 'AUD', currencySymbol: 'A$',
    phone: '+61 2 8005 7000', whatsapp: '+61280057000',
    address: 'Sydney, NSW, Australia',
    heroTitle: 'PREMIUM CLOVE COFFEE,\nDELIVERED ACROSS AUSTRALIA.',
    heroSubtitle: 'Specialty Arabica fused with hand-selected cloves. No fillers, no additives — bold, smooth, and unmistakably Lwang Black.',
    heroCtaLabel: 'Shop Now',
    practicePriority: ['commercial', 'migration', 'corporate', 'property'],
    accent: '#C9A84C',
    paymentMethods: ['Stripe', 'PayPal', 'Apple Pay', 'Google Pay', 'Afterpay'],
    carrier: 'Australia Post',
    estimatedDelivery: '2–5 business days',
  },
  NP: {
    code: 'NP', slug: 'np', name: 'Nepal', flag: '🇳🇵', flagEmoji: '🇳🇵',
    currency: 'NPR', currencySymbol: 'रू',
    phone: '+977 1 5970 800', whatsapp: '+97715970800',
    address: 'Durbarmarg, Kathmandu 44600, Nepal',
    heroTitle: 'विशेष क्लोभ कफी —\nनेपालमै तयार।',
    heroSubtitle: 'हस्तचयन गरिएका लवङ र विशेषश्रेणीको अरेबिका कफीको मिश्रण। शुद्ध, सशक्त, र पूर्ण नेपाली।',
    heroCtaLabel: 'अहिले किन्नुहोस्',
    practicePriority: ['migration', 'student', 'family', 'commercial'],
    accent: '#C9A84C',
    paymentMethods: ['eSewa', 'Khalti', 'Nabil Bank', 'Cash on Delivery'],
    carrier: 'Pathao',
    estimatedDelivery: '1–3 days inside KTM, 3–5 days nationwide',
  },
  US: {
    code: 'US', slug: 'us', name: 'United States', flag: '🇺🇸', flagEmoji: '🇺🇸',
    currency: 'USD', currencySymbol: '$',
    phone: '+1 (415) 800 7000', whatsapp: '+14158007000',
    address: 'Ships from Sydney to all 50 states · USPS',
    heroTitle: 'BOLD CLOVE COFFEE,\nSHIPPED ACROSS AMERICA.',
    heroSubtitle: 'Specialty-grade Arabica fused with hand-selected cloves. USPS delivery in 3–7 business days. Pay in USD.',
    heroCtaLabel: 'Shop Now',
    practicePriority: ['commercial', 'corporate', 'migration', 'property'],
    accent: '#C9A84C',
    paymentMethods: ['Stripe', 'PayPal', 'Apple Pay', 'Google Pay', 'Afterpay'],
    carrier: 'USPS',
    estimatedDelivery: '3–7 business days',
  },
  GB: {
    code: 'GB', slug: 'uk', name: 'United Kingdom', flag: '🇬🇧', flagEmoji: '🇬🇧',
    currency: 'GBP', currencySymbol: '£',
    phone: '+44 20 7946 0800', whatsapp: '+442079460800',
    address: 'International shipping · VAT included',
    heroTitle: 'PREMIUM CLOVE COFFEE,\nDELIVERED ACROSS THE UK.',
    heroSubtitle: 'Hand-roasted Arabica with whole-clove infusion. International delivery in 7–14 business days. GBP checkout.',
    heroCtaLabel: 'Shop Now',
    practicePriority: ['commercial', 'dispute', 'corporate', 'migration'],
    accent: '#C9A84C',
    paymentMethods: ['Stripe', 'PayPal', 'Apple Pay', 'Google Pay'],
    carrier: 'Royal Mail / Australia Post International',
    estimatedDelivery: '7–14 business days',
  },
  EU: {
    code: 'EU', slug: 'eu', name: 'Eurozone', flag: '🇪🇺', flagEmoji: '🇪🇺',
    currency: 'EUR', currencySymbol: '€',
    phone: '+353 1 568 0000', whatsapp: '+35315680000',
    address: 'EU-wide shipping — VAT where applicable',
    heroTitle: 'PREMIUM COFFEE\nACROSS EUROPE.',
    heroSubtitle: 'Bold flavour, ethical sourcing, and secure EUR checkout with Stripe and PayPal.',
    heroCtaLabel: 'Shop the range',
    practicePriority: ['commercial', 'corporate', 'migration', 'property'],
    accent: '#C9A84C',
    paymentMethods: ['Stripe', 'PayPal', 'Apple Pay', 'Google Pay'],
    carrier: 'Australia Post International',
    estimatedDelivery: '7–14 business days',
  },
  JP: {
    code: 'JP', slug: 'jp', name: 'Japan', flag: '🇯🇵', flagEmoji: '🇯🇵',
    currency: 'JPY', currencySymbol: '¥',
    phone: '+81 3 6800 7000', whatsapp: '+81368007000',
    address: 'Japan Post EMS · all 47 prefectures',
    heroTitle: '本格クローブコーヒー、\n日本全国へお届け。',
    heroSubtitle: '厳選されたアラビカ豆と手摘みクローブの融合。Japan Post EMSで5〜10営業日以内にお届け。',
    heroCtaLabel: '今すぐ購入',
    practicePriority: ['commercial', 'corporate', 'migration', 'family'],
    accent: '#C9A84C',
    paymentMethods: ['Stripe', 'PayPal', 'Google Pay'],
    carrier: 'Japan Post',
    estimatedDelivery: '5–10 business days',
  },
  NZ: {
    code: 'NZ', slug: 'nz', name: 'New Zealand', flag: '🇳🇿', flagEmoji: '🇳🇿',
    currency: 'NZD', currencySymbol: 'NZ$',
    phone: '+64 9 800 7000', whatsapp: '+6498007000',
    address: 'NZ Post · nationwide tracked delivery',
    heroTitle: 'BOLD CLOVE COFFEE,\nDELIVERED ACROSS NEW ZEALAND.',
    heroSubtitle: 'Specialty Arabica with hand-selected cloves. NZ Post tracked delivery in 3–6 business days. NZD checkout.',
    heroCtaLabel: 'Shop Now',
    practicePriority: ['migration', 'family', 'commercial', 'property'],
    accent: '#C9A84C',
    paymentMethods: ['Stripe', 'PayPal', 'Apple Pay', 'Google Pay', 'Afterpay'],
    carrier: 'NZ Post',
    estimatedDelivery: '3–6 business days',
  },
  CN: {
    code: 'CN', slug: 'cn', name: 'China', flag: '🇨🇳', flagEmoji: '🇨🇳',
    currency: 'CNY', currencySymbol: '¥',
    phone: '+86 21 6800 7000', whatsapp: '+862168007000',
    address: 'International shipping via Australia Post',
    heroTitle: '精品丁香咖啡,\n全球直邮。',
    heroSubtitle: '精选阿拉比卡咖啡豆与手选丁香的完美融合。由澳大利亚直邮,支持人民币结算。',
    heroCtaLabel: '立即购买',
    practicePriority: ['commercial', 'migration', 'corporate', 'property'],
    accent: '#C9A84C',
    paymentMethods: ['Stripe', 'PayPal'],
    carrier: 'Australia Post International',
    estimatedDelivery: '10–20 business days',
  },
  CA: {
    code: 'CA', slug: 'ca', name: 'Canada', flag: '🇨🇦', flagEmoji: '🇨🇦',
    currency: 'CAD', currencySymbol: 'CA$',
    phone: '+1 (416) 800 7000', whatsapp: '+14168007000',
    address: 'Chit Chats · cross-border to all provinces',
    heroTitle: 'YOUR PREMIUM\nCANADIAN ROAST.',
    heroSubtitle: 'Bold flavour, pure clove fusion, and real health benefits — shipped directly to you across Canada with Chit Chats.',
    heroCtaLabel: 'Shop Now',
    practicePriority: ['commercial', 'migration', 'corporate', 'property'],
    accent: '#C9A84C',
    paymentMethods: ['Stripe', 'PayPal', 'Apple Pay', 'Google Pay'],
    carrier: 'Chit Chats',
    estimatedDelivery: '4–8 business days',
  },
};

const PRACTICE_AREAS = {
  migration: { id: 'migration', icon: '✈', title: 'Migration Law', desc: 'Skilled visas, partner, student, employer-sponsored, and permanent residency. Expert guidance for every pathway.' },
  commercial: { id: 'commercial', icon: '⚖', title: 'Commercial Law', desc: 'Contracts, M&A, trade compliance, and cross-border advisory for businesses of all sizes.' },
  corporate: { id: 'corporate', icon: '🏛', title: 'Corporate Governance', desc: 'Shareholder agreements, board advisory, and corporate restructuring with precision and clarity.' },
  family: { id: 'family', icon: '👨‍👩‍👧', title: 'Family Law', desc: 'Divorce, parenting orders, property settlements, and international family matters handled with care.' },
  property: { id: 'property', icon: '🏢', title: 'Property & Conveyancing', desc: 'Residential and commercial property transactions, foreign investment advice, and land development.' },
  student: { id: 'student', icon: '🎓', title: 'Student Visas', desc: 'Australian student visa applications, extensions, and graduate work permit pathways.' },
  dispute: { id: 'dispute', icon: '🔍', title: 'Dispute Resolution', desc: 'Commercial litigation, mediation, arbitration, and enforcement of judgments globally.' },
};

const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH',
]);

const CODE_TO_SLUG = { AU:'au', NP:'np', US:'us', GB:'uk', UK:'uk', EU:'eu', JP:'jp', NZ:'nz', CN:'cn', CA:'ca' };
const SLUG_TO_CODE = { au:'AU', np:'NP', us:'US', uk:'GB', eu:'EU', jp:'JP', nz:'NZ', cn:'CN', ca:'CA' };
const SUPPORTED_CODES = Object.keys(REGION_DATA);

// ─────────────────────────────────────────────
// FETCH HELPER (replaces AbortSignal.timeout which isn't available in all browsers)
// ─────────────────────────────────────────────
function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

// ─────────────────────────────────────────────
// GeoRouter
// ─────────────────────────────────────────────
const GeoRouter = {
  STORAGE_KEY: 'lb_region_v2',
  current: null,
  rawCountryCode: null,

  getRegion(code) {
    return REGION_DATA[code] || REGION_DATA[FALLBACK_REGION];
  },

  getStored() {
    try { return localStorage.getItem(this.STORAGE_KEY); } catch(e) { return null; }
  },

  persist(code) {
    try { localStorage.setItem(this.STORAGE_KEY, code); } catch(e) {}
  },

  async detect() {
    // Bots & private/lab traffic → AU fallback. Crawlers should index the
    // canonical AU storefront; the NP detection logic stays for real Nepal IPs.
    if (IS_BOT) return FALLBACK_REGION;

    // 1. Try own backend (fastest — avoids CORS & rate limits)
    try {
      const res = await fetchWithTimeout('/api/ip-country', 3000);
      if (res.ok) {
        const data = await res.json();
        if (data.country) {
          const raw = data.country.toUpperCase();
          this.rawCountryCode = raw;
          const code = raw === 'UK' ? 'GB' : raw;
          if (EU_COUNTRY_CODES.has(code)) return 'EU';
          return SUPPORTED_CODES.includes(code) ? code : FALLBACK_REGION;
        }
      }
    } catch(e) { /* continue */ }

    // 2. Fallback: ipapi.co
    try {
      const res = await fetchWithTimeout('https://ipapi.co/json/', 5000);
      if (res.ok) {
        const data = await res.json();
        if (!data.error && data.country_code) {
          const raw = data.country_code.toUpperCase();
          this.rawCountryCode = raw;
          const code = raw === 'UK' ? 'GB' : raw;
          if (EU_COUNTRY_CODES.has(code)) return 'EU';
          return SUPPORTED_CODES.includes(code) ? code : FALLBACK_REGION;
        }
      }
    } catch(e) { /* continue */ }

    // 3. Timezone heuristic — only used when IP geolocation completely fails.
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz === 'Asia/Kathmandu') return 'NP';
      if (tz && tz.startsWith('Australia/')) return 'AU';
      if (tz && tz.startsWith('Pacific/Auckland')) return 'NZ';
      if (tz && tz.startsWith('America/')) return 'US';
      if (tz && tz.startsWith('Europe/London')) return 'GB';
      if (tz && tz.startsWith('Asia/Tokyo')) return 'JP';
      if (tz && tz.startsWith('Europe/')) return 'EU';
    } catch(e) {}

    return FALLBACK_REGION;
  },

  async init() {
    const stored = this.getStored();
    if (stored && SUPPORTED_CODES.includes(stored)) {
      this.current = stored;
      // Still detect in background to get rawCountryCode for currency converter
      this.detect().catch(() => {});
    } else {
      this.current = await this.detect();
    }

    // Log visitor analytics in background
    try {
      fetch('/api/analytics/ip-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: this.current, page: window.location.pathname })
      }).catch(() => {});
    } catch(e) {}

    // Nepal-aware redirect: a Nepali IP landing on the global home/shop should
    // see the Nepal catalogue (NPR pricing, Pathao logistics, eSewa/Khalti).
    // Skip if the user explicitly navigated to a non-NP page (e.g. they tapped
    // the AU flag in the region switcher) — we honour stored preference.
    try { this._maybeRedirectForRegion(); } catch (e) {}

    this._broadcast(this.current);
    return this.current;
  },

  /** Redirect logic — runs once per init.
   *
   *  Rule:
   *    NP visitor on /, /index.html, /shop.html, /catalogue.html → /np_cat.html
   *
   *  We do NOT redirect away from product/checkout/order pages (would break
   *  deep-links and active checkouts). We also skip the redirect if the URL
   *  carries `?region=` (operator override) or if the user previously chose
   *  a different region via the switcher (stored !== detected).
   */
  _maybeRedirectForRegion() {
    if (typeof window === 'undefined' || !window.location) return;
    if (this.current !== 'NP') return;

    const params = new URLSearchParams(window.location.search || '');
    if (params.has('region') || params.has('noredirect')) return;

    const path = (window.location.pathname || '/').toLowerCase();
    const npRedirectablePaths = ['/', '/index.html', '/shop.html', '/catalogue.html'];
    if (!npRedirectablePaths.includes(path)) return;

    // Honour explicit user override: if they previously picked a non-NP region.
    const stored = this.getStored();
    if (stored && stored !== 'NP') return;

    const target = '/np_cat.html';
    if (path === target.toLowerCase()) return;
    window.location.replace(target + window.location.search + window.location.hash);
  },

  set(code) {
    const normalized = code.toUpperCase() === 'UK' ? 'GB' : code.toUpperCase();
    this.current = SUPPORTED_CODES.includes(normalized) ? normalized : FALLBACK_REGION;
    this.persist(this.current);
    this._broadcast(this.current);
  },

  get() {
    return this.current || this.getStored() || FALLBACK_REGION;
  },

  _broadcast(code) {
    const region = this.getRegion(code);
    document.dispatchEvent(new CustomEvent('lb:regionChanged', {
      detail: { code, region }
    }));
  }
};

// Globals
window.GeoRouter = GeoRouter;
window.REGION_DATA = REGION_DATA;
window.PRACTICE_AREAS = PRACTICE_AREAS;
window.CODE_TO_SLUG = CODE_TO_SLUG;
window.SLUG_TO_CODE = SLUG_TO_CODE;
window.IS_BOT = IS_BOT;
