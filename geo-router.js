/**
 * LWANG BLACK — GEO ROUTING ENGINE v2.0
 * Handles IP-based detection, bot protection, subdirectory mapping,
 * and all regional data (contact, hero, practice areas).
 */

// ─────────────────────────────────────────────
// BOT DETECTION — Crawlers always see AU version
// ─────────────────────────────────────────────
const BOT_PATTERNS = /googlebot|bingbot|baiduspider|yandexbot|duckduckbot|slurp|facebot|ia_archiver|mj12bot|ahrefsbot|semrushbot|screaming frog/i;
const IS_BOT = BOT_PATTERNS.test(navigator.userAgent);

// ─────────────────────────────────────────────
// REGION DATA MAP
// ─────────────────────────────────────────────
const REGION_DATA = {
  AU: {
    code: 'AU',
    slug: 'au',
    name: 'Australia',
    flag: '🇦🇺',
    flagEmoji: '🇦🇺',
    currency: 'AUD',
    phone: '+61 2 8005 7000',
    whatsapp: '+61280057000',
    address: '135 King St, Sydney NSW 2000, Australia',
    heroTitle: 'GLOBAL FIRM,\nAUSTRALIAN HEART.',
    heroSubtitle: 'Premium legal counsel across Australia. Your goals, our expertise — delivered with precision and care.',
    heroCtaLabel: 'Explore Our Services',
    practicePriority: ['commercial', 'migration', 'corporate', 'property'],
    accent: '#C9A84C',
  },
  NP: {
    code: 'NP',
    slug: 'np',
    name: 'Nepal',
    flag: '🇳🇵',
    flagEmoji: '🇳🇵',
    currency: 'NPR',
    phone: '+977 1 5970 800',
    whatsapp: '+97715970800',
    address: 'Durbarmarg, Kathmandu 44600, Nepal',
    heroTitle: 'YOUR PATH TO\nAUSTRALIA STARTS\nHERE.',
    heroSubtitle: 'Expert migration law services for Nepali nationals. Skilled visas, partner visas, and student pathways — handled seamlessly.',
    heroCtaLabel: 'Start Your Migration',
    practicePriority: ['migration', 'student', 'family', 'commercial'],
    accent: '#C9A84C',
  },
  US: {
    code: 'US',
    slug: 'us',
    name: 'United States',
    flag: '🇺🇸',
    flagEmoji: '🇺🇸',
    currency: 'USD',
    phone: '+1 (415) 800 7000',
    whatsapp: '+14158007000',
    address: '580 California St, San Francisco CA 94104, USA',
    heroTitle: 'ELITE COMMERCIAL\nLEGAL COUNSEL.',
    heroSubtitle: 'Cross-border business law, M&A advisory, and corporate governance. Serving US-based clients with global reach.',
    heroCtaLabel: 'Talk to Our Team',
    practicePriority: ['commercial', 'corporate', 'migration', 'property'],
    accent: '#C9A84C',
  },
  GB: {
    code: 'GB',
    slug: 'uk',
    name: 'United Kingdom',
    flag: '🇬🇧',
    flagEmoji: '🇬🇧',
    currency: 'GBP',
    phone: '+44 20 7946 0800',
    whatsapp: '+442079460800',
    address: '10 Finsbury Square, London EC2A 1AF, UK',
    heroTitle: 'SOPHISTICATED\nLEGAL STRATEGY,\nGLOBALLY.',
    heroSubtitle: 'Commercial law, dispute resolution, and cross-border advisory for UK businesses operating at the highest level.',
    heroCtaLabel: 'Schedule a Consultation',
    practicePriority: ['commercial', 'dispute', 'corporate', 'migration'],
    accent: '#C9A84C',
  },
  JP: {
    code: 'JP',
    slug: 'jp',
    name: 'Japan',
    flag: '🇯🇵',
    flagEmoji: '🇯🇵',
    currency: 'JPY',
    phone: '+81 3 6800 7000',
    whatsapp: '+81368007000',
    address: '2-1-1 Nihonbashi, Chuo-ku, Tokyo 103-0027, Japan',
    heroTitle: 'BRIDGING JAPAN\n& THE WORLD.',
    heroSubtitle: 'Corporate law, cross-border commerce, and immigration advisory for Japanese corporations and individuals.',
    heroCtaLabel: 'Connect With Experts',
    practicePriority: ['commercial', 'corporate', 'migration', 'family'],
    accent: '#C9A84C',
  },
  NZ: {
    code: 'NZ',
    slug: 'nz',
    name: 'New Zealand',
    flag: '🇳🇿',
    flagEmoji: '🇳🇿',
    currency: 'NZD',
    phone: '+64 9 800 7000',
    whatsapp: '+6498007000',
    address: '151 Queen St, Auckland CBD 1010, New Zealand',
    heroTitle: 'MIGRATION &\nBEYOND.',
    heroSubtitle: 'Expert New Zealand immigration counsel. Residency pathways, work visas, and skilled migrant programs.',
    heroCtaLabel: 'Explore Visa Options',
    practicePriority: ['migration', 'family', 'commercial', 'property'],
    accent: '#C9A84C',
  },
  CN: {
    code: 'CN',
    slug: 'cn',
    name: 'China',
    flag: '🇨🇳',
    flagEmoji: '🇨🇳',
    currency: 'CNY',
    phone: '+86 21 6800 7000',
    whatsapp: '+862168007000',
    address: '88 Century Avenue, Pudong, Shanghai 200120, China',
    heroTitle: 'YOUR GLOBAL\nLEGAL PARTNER.',
    heroSubtitle: 'Cross-border investment, immigration pathways, and commercial law — bridging China and Australia.',
    heroCtaLabel: 'Contact Our Team',
    practicePriority: ['commercial', 'migration', 'corporate', 'property'],
    accent: '#C9A84C',
  },
  CA: {
    code: 'CA',
    slug: 'ca',
    name: 'Canada',
    flag: '🇨🇦',
    flagEmoji: '🇨🇦',
    currency: 'CAD',
    phone: '+1 (416) 800 7000',
    whatsapp: '+14168007000',
    address: '100 King St W, Toronto ON M5X 1A9, Canada',
    heroTitle: 'YOUR PREMIUM\nCANADIAN ROAST.',
    heroSubtitle: 'Bold flavor, pure clove fusion, and real health benefits—shipped directly to you across Canada.',
    heroCtaLabel: 'Contact Our Team',
    practicePriority: ['commercial', 'migration', 'corporate', 'property'],
    accent: '#C9A84C',
  },
};

// Practice area content
const PRACTICE_AREAS = {
  migration: {
    id: 'migration',
    icon: '✈',
    title: 'Migration Law',
    desc: 'Skilled visas, partner, student, employer-sponsored, and permanent residency. Expert guidance for every pathway.',
  },
  commercial: {
    id: 'commercial',
    icon: '⚖',
    title: 'Commercial Law',
    desc: 'Contracts, M&A, trade compliance, and cross-border advisory for businesses of all sizes.',
  },
  corporate: {
    id: 'corporate',
    icon: '🏛',
    title: 'Corporate Governance',
    desc: 'Shareholder agreements, board advisory, and corporate restructuring with precision and clarity.',
  },
  family: {
    id: 'family',
    icon: '👨‍👩‍👧',
    title: 'Family Law',
    desc: 'Divorce, parenting orders, property settlements, and international family matters handled with care.',
  },
  property: {
    id: 'property',
    icon: '🏢',
    title: 'Property & Conveyancing',
    desc: 'Residential and commercial property transactions, foreign investment advice, and land development.',
  },
  student: {
    id: 'student',
    icon: '🎓',
    title: 'Student Visas',
    desc: 'Australian student visa applications, extensions, and graduate work permit pathways.',
  },
  dispute: {
    id: 'dispute',
    icon: '🔍',
    title: 'Dispute Resolution',
    desc: 'Commercial litigation, mediation, arbitration, and enforcement of judgments globally.',
  },
};

// Country code → slug mapping
const CODE_TO_SLUG = {
  AU: 'au', NP: 'np', US: 'us', GB: 'uk',
  UK: 'uk', JP: 'jp', NZ: 'nz', CN: 'cn',
  CA: 'ca',
};

// Slug → code mapping  
const SLUG_TO_CODE = {
  au: 'AU', np: 'NP', us: 'US', uk: 'GB',
  jp: 'JP', nz: 'NZ', cn: 'CN', ca: 'CA',
};

// Supported country codes for routing
const SUPPORTED_CODES = Object.keys(REGION_DATA);

/**
 * GeoRouter — main routing controller
 */
const GeoRouter = {
  STORAGE_KEY: 'lb_region_v2',
  current: null,

  /**
   * Returns region data for a given code (fallback AU)
   */
  getRegion(code) {
    return REGION_DATA[code] || REGION_DATA['AU'];
  },

  /**
   * Get stored region from localStorage
   */
  getStored() {
    try {
      return localStorage.getItem(this.STORAGE_KEY);
    } catch(e) { return null; }
  },

  /**
   * Persist region to localStorage
   */
  persist(code) {
    try {
      localStorage.setItem(this.STORAGE_KEY, code);
    } catch(e) {}
  },

  /**
   * Auto-detect region via ipapi.co
   * Bots always get AU (skip detection entirely)
   */
  async detect() {
    if (IS_BOT) {
      console.log('[GeoRouter] Bot detected — defaulting to AU');
      return 'AU';
    }
    // 1. Try our own backend (also logs the visitor)
    try {
      const res = await fetch('/api/ip-country', { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      if (data.country) {
        const code = (data.country === 'UK' ? 'GB' : data.country).toUpperCase();
        const supported = SUPPORTED_CODES.includes(code) ? code : 'AU';
        // Log visitor in background
        fetch('/api/analytics/ip-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country: supported, page: window.location.pathname })
        }).catch(() => {});
        return supported;
      }
    } catch(e) {}
    // 2. Fallback to ipapi.co direct
    try {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      const raw = (data.country_code || 'AU').toUpperCase();
      const code = raw === 'UK' ? 'GB' : raw;
      return SUPPORTED_CODES.includes(code) ? code : 'AU';
    } catch(e) {
      console.warn('[GeoRouter] IP detection failed, defaulting to AU');
      return 'AU';
    }
  },

  /**
   * Initialize routing:
   * 1. Check bot → AU
   * 2. Check stored preference
   * 3. Auto-detect via IP
   */
  async init() {
    const stored = this.getStored();
    if (stored && SUPPORTED_CODES.includes(stored)) {
      this.current = stored;
    } else {
      this.current = await this.detect();
      // Don't persist auto-detected — only persist manual selections
    }
    this._broadcast(this.current);
    return this.current;
  },

  /**
   * Manually set region (persists to localStorage)
   */
  set(code) {
    const normalized = code.toUpperCase() === 'UK' ? 'GB' : code.toUpperCase();
    this.current = SUPPORTED_CODES.includes(normalized) ? normalized : 'AU';
    this.persist(this.current);
    this._broadcast(this.current);
  },

  /**
   * Get current region code
   */
  get() {
    return this.current || this.getStored() || 'AU';
  },

  /**
   * Broadcast regionChanged event to all listeners
   */
  _broadcast(code) {
    const region = this.getRegion(code);
    document.dispatchEvent(new CustomEvent('lb:regionChanged', {
      detail: { code, region }
    }));
  }
};

// Expose globally
window.GeoRouter = GeoRouter;
window.REGION_DATA = REGION_DATA;
window.PRACTICE_AREAS = PRACTICE_AREAS;
window.IS_BOT = IS_BOT;

