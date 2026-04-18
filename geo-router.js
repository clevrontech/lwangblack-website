/**
 * LWANG BLACK — GEO ROUTING ENGINE v2.1
 * IP-based detection, bot protection, region data & currency state.
 */

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
    address: '135 King St, Sydney NSW 2000, Australia',
    heroTitle: 'GLOBAL FIRM,\nAUSTRALIAN HEART.',
    heroSubtitle: 'Premium legal counsel across Australia. Your goals, our expertise — delivered with precision and care.',
    heroCtaLabel: 'Explore Our Services',
    practicePriority: ['commercial', 'migration', 'corporate', 'property'],
    accent: '#C9A84C',
  },
  NP: {
    code: 'NP', slug: 'np', name: 'Nepal', flag: '🇳🇵', flagEmoji: '🇳🇵',
    currency: 'NPR', currencySymbol: 'रू',
    phone: '+977 1 5970 800', whatsapp: '+97715970800',
    address: 'Durbarmarg, Kathmandu 44600, Nepal',
    heroTitle: 'YOUR PATH TO\nAUSTRALIA STARTS\nHERE.',
    heroSubtitle: 'Expert migration law services for Nepali nationals. Skilled visas, partner visas, and student pathways — handled seamlessly.',
    heroCtaLabel: 'Start Your Migration',
    practicePriority: ['migration', 'student', 'family', 'commercial'],
    accent: '#C9A84C',
  },
  US: {
    code: 'US', slug: 'us', name: 'United States', flag: '🇺🇸', flagEmoji: '🇺🇸',
    currency: 'USD', currencySymbol: '$',
    phone: '+1 (415) 800 7000', whatsapp: '+14158007000',
    address: '580 California St, San Francisco CA 94104, USA',
    heroTitle: 'ELITE COMMERCIAL\nLEGAL COUNSEL.',
    heroSubtitle: 'Cross-border business law, M&A advisory, and corporate governance. Serving US-based clients with global reach.',
    heroCtaLabel: 'Talk to Our Team',
    practicePriority: ['commercial', 'corporate', 'migration', 'property'],
    accent: '#C9A84C',
  },
  GB: {
    code: 'GB', slug: 'uk', name: 'United Kingdom', flag: '🇬🇧', flagEmoji: '🇬🇧',
    currency: 'GBP', currencySymbol: '£',
    phone: '+44 20 7946 0800', whatsapp: '+442079460800',
    address: '10 Finsbury Square, London EC2A 1AF, UK',
    heroTitle: 'SOPHISTICATED\nLEGAL STRATEGY,\nGLOBALLY.',
    heroSubtitle: 'Commercial law, dispute resolution, and cross-border advisory for UK businesses operating at the highest level.',
    heroCtaLabel: 'Schedule a Consultation',
    practicePriority: ['commercial', 'dispute', 'corporate', 'migration'],
    accent: '#C9A84C',
  },
  JP: {
    code: 'JP', slug: 'jp', name: 'Japan', flag: '🇯🇵', flagEmoji: '🇯🇵',
    currency: 'JPY', currencySymbol: '¥',
    phone: '+81 3 6800 7000', whatsapp: '+81368007000',
    address: '2-1-1 Nihonbashi, Chuo-ku, Tokyo 103-0027, Japan',
    heroTitle: 'BRIDGING JAPAN\n& THE WORLD.',
    heroSubtitle: 'Corporate law, cross-border commerce, and immigration advisory for Japanese corporations and individuals.',
    heroCtaLabel: 'Connect With Experts',
    practicePriority: ['commercial', 'corporate', 'migration', 'family'],
    accent: '#C9A84C',
  },
  NZ: {
    code: 'NZ', slug: 'nz', name: 'New Zealand', flag: '🇳🇿', flagEmoji: '🇳🇿',
    currency: 'NZD', currencySymbol: 'NZ$',
    phone: '+64 9 800 7000', whatsapp: '+6498007000',
    address: '151 Queen St, Auckland CBD 1010, New Zealand',
    heroTitle: 'MIGRATION &\nBEYOND.',
    heroSubtitle: 'Expert New Zealand immigration counsel. Residency pathways, work visas, and skilled migrant programs.',
    heroCtaLabel: 'Explore Visa Options',
    practicePriority: ['migration', 'family', 'commercial', 'property'],
    accent: '#C9A84C',
  },
  CN: {
    code: 'CN', slug: 'cn', name: 'China', flag: '🇨🇳', flagEmoji: '🇨🇳',
    currency: 'CNY', currencySymbol: '¥',
    phone: '+86 21 6800 7000', whatsapp: '+862168007000',
    address: '88 Century Avenue, Pudong, Shanghai 200120, China',
    heroTitle: 'YOUR GLOBAL\nLEGAL PARTNER.',
    heroSubtitle: 'Cross-border investment, immigration pathways, and commercial law — bridging China and Australia.',
    heroCtaLabel: 'Contact Our Team',
    practicePriority: ['commercial', 'migration', 'corporate', 'property'],
    accent: '#C9A84C',
  },
  CA: {
    code: 'CA', slug: 'ca', name: 'Canada', flag: '🇨🇦', flagEmoji: '🇨🇦',
    currency: 'CAD', currencySymbol: 'CA$',
    phone: '+1 (416) 800 7000', whatsapp: '+14168007000',
    address: '100 King St W, Toronto ON M5X 1A9, Canada',
    heroTitle: 'YOUR PREMIUM\nCANADIAN ROAST.',
    heroSubtitle: 'Bold flavor, pure clove fusion, and real health benefits—shipped directly to you across Canada.',
    heroCtaLabel: 'Contact Our Team',
    practicePriority: ['commercial', 'migration', 'corporate', 'property'],
    accent: '#C9A84C',
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

const CODE_TO_SLUG = { AU:'au', NP:'np', US:'us', GB:'uk', UK:'uk', JP:'jp', NZ:'nz', CN:'cn', CA:'ca' };
const SLUG_TO_CODE = { au:'AU', np:'NP', us:'US', uk:'GB', jp:'JP', nz:'NZ', cn:'CN', ca:'CA' };
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
    return REGION_DATA[code] || REGION_DATA['NP'];
  },

  getStored() {
    try { return localStorage.getItem(this.STORAGE_KEY); } catch(e) { return null; }
  },

  persist(code) {
    try { localStorage.setItem(this.STORAGE_KEY, code); } catch(e) {}
  },

  async detect() {
    if (IS_BOT) return 'NP';

    // 1. Try own backend (fastest — avoids CORS & rate limits)
    try {
      const res = await fetchWithTimeout('/api/ip-country', 3000);
      if (res.ok) {
        const data = await res.json();
        if (data.country) {
          const raw = data.country.toUpperCase();
          this.rawCountryCode = raw;
          const code = raw === 'UK' ? 'GB' : raw;
          return SUPPORTED_CODES.includes(code) ? code : 'NP';
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
          return SUPPORTED_CODES.includes(code) ? code : 'NP';
        }
      }
    } catch(e) { /* continue */ }

    // 3. Timezone heuristic
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz === 'Asia/Kathmandu' || tz === 'Asia/Kolkata') return 'NP';
      if (tz && tz.startsWith('America/')) return 'US';
      if (tz && tz.startsWith('Europe/London')) return 'GB';
      if (tz && tz.startsWith('Asia/Tokyo')) return 'JP';
    } catch(e) {}

    return 'NP';
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

    this._broadcast(this.current);
    return this.current;
  },

  set(code) {
    const normalized = code.toUpperCase() === 'UK' ? 'GB' : code.toUpperCase();
    this.current = SUPPORTED_CODES.includes(normalized) ? normalized : 'NP';
    this.persist(this.current);
    this._broadcast(this.current);
  },

  get() {
    return this.current || this.getStored() || 'NP';
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
