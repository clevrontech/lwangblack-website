/**
 * LWANG BLACK — MULTI-REGION PRICING ENGINE
 * Real products from lwangblack.co with exact names, images & prices
 */

// Base CDN URL for Lwang Black product images
const CDN = 'https://www.lwangblack.co/cdn/shop/files/';

const LB_PRODUCTS = {
  "2-0-combo-set": {
    "id": "2-0-combo-set",
    "name": "2.0 Combo Set (Choose your French Press)",
    "category": "bundles",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/product_image-chatgpt-image-oct-11-2025-04_50_16-pm-8048.webp?v=1769347132",
    "description": "Experience bold, rich flavour with our Limited Edition Coffee Set, featuring premium ground coffee infused with aroma...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 96.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$96.99"
      },
      "US": {
        "amount": 63.04,
        "currency": "USD",
        "symbol": "$",
        "display": "$63.04"
      },
      "GB": {
        "amount": 48.49,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a348.49"
      },
      "CA": {
        "amount": 87.29,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$87.29"
      },
      "NZ": {
        "amount": 106.69,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$106.69"
      },
      "NP": {
        "amount": 7274.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 7274.0"
      },
      "DEFAULT": {
        "amount": 63.04,
        "currency": "USD",
        "symbol": "$",
        "display": "$63.04"
      }
    }
  },
  "2-0-filter": {
    "id": "2-0-filter",
    "name": "2.0 Filter",
    "category": "accessories",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/2.0_Filter.png?v=1753708044",
    "description": "Experience Better, Smoother, Stronger & Cleaner CoffeeOur triple-layered filter system is designed to deliver a bolde...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 2.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$2.99"
      },
      "US": {
        "amount": 1.94,
        "currency": "USD",
        "symbol": "$",
        "display": "$1.94"
      },
      "GB": {
        "amount": 1.5,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a31.5"
      },
      "CA": {
        "amount": 2.69,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$2.69"
      },
      "NZ": {
        "amount": 3.29,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$3.29"
      },
      "NP": {
        "amount": 224.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 224.0"
      },
      "DEFAULT": {
        "amount": 1.94,
        "currency": "USD",
        "symbol": "$",
        "display": "$1.94"
      }
    }
  },
  "250g-lwang-black-mix": {
    "id": "250g-lwang-black-mix",
    "name": "250g Lwang Black",
    "category": "coffee",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/DSC07401.jpg?v=1753318956",
    "description": "This 250g package provides an introduction to the unique Lwang Black Mix blend \u2014 premium ground coffee infused with a...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 24.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$24.99"
      },
      "US": {
        "amount": 16.24,
        "currency": "USD",
        "symbol": "$",
        "display": "$16.24"
      },
      "GB": {
        "amount": 12.49,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a312.49"
      },
      "CA": {
        "amount": 22.49,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$22.49"
      },
      "NZ": {
        "amount": 27.49,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$27.49"
      },
      "NP": {
        "amount": 1874.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 1874.0"
      },
      "DEFAULT": {
        "amount": 16.24,
        "currency": "USD",
        "symbol": "$",
        "display": "$16.24"
      }
    }
  },
  "250g-500g-lwang-black-mix": {
    "id": "250g-500g-lwang-black-mix",
    "name": "250g Lwang Black + 500g Lwang Black",
    "category": "bundles",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/DSC07286.jpg?v=1753318831",
    "description": "Crafted from premium ground coffee beans infused with aromatic cloves, Lwang Black delivers a rich, smooth body with ...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 44.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$44.99"
      },
      "US": {
        "amount": 29.24,
        "currency": "USD",
        "symbol": "$",
        "display": "$29.24"
      },
      "GB": {
        "amount": 22.5,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a322.5"
      },
      "CA": {
        "amount": 40.49,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$40.49"
      },
      "NZ": {
        "amount": 49.49,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$49.49"
      },
      "NP": {
        "amount": 3374.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 3374.0"
      },
      "DEFAULT": {
        "amount": 29.24,
        "currency": "USD",
        "symbol": "$",
        "display": "$29.24"
      }
    }
  },
  "250g-lwang-black-white-french-press-1": {
    "id": "250g-lwang-black-white-french-press-1",
    "name": "250g Lwang Black Coffee + French Press (Choose Your Colour)",
    "category": "bundles",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/DSC00367.jpg?v=1769326597",
    "description": "This package includes a 250g pack of Lwang Black Mix \u2014 premium ground coffee infused with aromatic cloves \u2014 paired wi...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 49.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$49.99"
      },
      "US": {
        "amount": 32.49,
        "currency": "USD",
        "symbol": "$",
        "display": "$32.49"
      },
      "GB": {
        "amount": 25.0,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a325.0"
      },
      "CA": {
        "amount": 44.99,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$44.99"
      },
      "NZ": {
        "amount": 54.99,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$54.99"
      },
      "NP": {
        "amount": 3749.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 3749.0"
      },
      "DEFAULT": {
        "amount": 32.49,
        "currency": "USD",
        "symbol": "$",
        "display": "$32.49"
      }
    }
  },
  "500g-lwang-black-pink-french-press-copy": {
    "id": "500g-lwang-black-pink-french-press-copy",
    "name": "500g Lwang Black Coffee + French Press (Choose Your Colour)",
    "category": "bundles",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/DSC00364_9dc3a32f-1021-42c6-b756-caed2cb5f171.jpg?v=1769262874",
    "description": "This package includes a 500g pack of Lwang Black Mix \u2014 premium ground coffee infused with aromatic cloves \u2014 along wit...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 58.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$58.99"
      },
      "US": {
        "amount": 38.34,
        "currency": "USD",
        "symbol": "$",
        "display": "$38.34"
      },
      "GB": {
        "amount": 29.5,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a329.5"
      },
      "CA": {
        "amount": 53.09,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$53.09"
      },
      "NZ": {
        "amount": 64.89,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$64.89"
      },
      "NP": {
        "amount": 4424.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 4424.0"
      },
      "DEFAULT": {
        "amount": 38.34,
        "currency": "USD",
        "symbol": "$",
        "display": "$38.34"
      }
    }
  },
  "5oog-lwang-black-mix": {
    "id": "5oog-lwang-black-mix",
    "name": "5OOG Lwang Black",
    "category": "coffee",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/DSC07374.jpg?v=1753707276",
    "description": "For consumers, the 500g package offers a cost-effective way to enjoy Lwang Black Mix \u2014 premium ground coffee infused ...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 34.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$34.99"
      },
      "US": {
        "amount": 22.74,
        "currency": "USD",
        "symbol": "$",
        "display": "$22.74"
      },
      "GB": {
        "amount": 17.5,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a317.5"
      },
      "CA": {
        "amount": 31.49,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$31.49"
      },
      "NZ": {
        "amount": 38.49,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$38.49"
      },
      "NP": {
        "amount": 2624.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 2624.0"
      },
      "DEFAULT": {
        "amount": 22.74,
        "currency": "USD",
        "symbol": "$",
        "display": "$22.74"
      }
    }
  },
  "plunger-french-press": {
    "id": "plunger-french-press",
    "name": "French Press/Plunger",
    "category": "accessories",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/DSC07397.jpg?v=1768363098",
    "description": "An insulated coffee plunger, elegantly designed to brew the perfect cup of Lwang Black Mix coffee. Its insulation ens...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 39.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$39.99"
      },
      "US": {
        "amount": 25.99,
        "currency": "USD",
        "symbol": "$",
        "display": "$25.99"
      },
      "GB": {
        "amount": 20.0,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a320.0"
      },
      "CA": {
        "amount": 35.99,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$35.99"
      },
      "NZ": {
        "amount": 43.99,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$43.99"
      },
      "NP": {
        "amount": 2999.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 2999.0"
      },
      "DEFAULT": {
        "amount": 25.99,
        "currency": "USD",
        "symbol": "$",
        "display": "$25.99"
      }
    }
  },
  "lwang-black-drip-set": {
    "id": "lwang-black-drip-set",
    "name": "LB Drip & Sip Set",
    "category": "bundles",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/DSC00248.jpg?v=1768362482",
    "description": "Lwang Black Drip & Sip includes 14 premium drip coffee sachets and 1 insulated pot, designed to keep your coffee warm...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 39.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$39.99"
      },
      "US": {
        "amount": 25.99,
        "currency": "USD",
        "symbol": "$",
        "display": "$25.99"
      },
      "GB": {
        "amount": 20.0,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a320.0"
      },
      "CA": {
        "amount": 35.99,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$35.99"
      },
      "NZ": {
        "amount": 43.99,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$43.99"
      },
      "NP": {
        "amount": 2999.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 2999.0"
      },
      "DEFAULT": {
        "amount": 25.99,
        "currency": "USD",
        "symbol": "$",
        "display": "$25.99"
      }
    }
  },
  "lb-pot-and-press-gift-set": {
    "id": "lb-pot-and-press-gift-set",
    "name": "LB Pot & Press gift set",
    "category": "bundles",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/CF2AB6CD-E6A1-419E-869B-B8275262687D.jpg?v=1768362305",
    "description": "LB Pot & Press Gift Set \u2013 the perfect gift for coffee lovers! This all-in-one set includes: 1 Insulated Leakproof Pot...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 82.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$82.99"
      },
      "US": {
        "amount": 53.94,
        "currency": "USD",
        "symbol": "$",
        "display": "$53.94"
      },
      "GB": {
        "amount": 41.49,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a341.49"
      },
      "CA": {
        "amount": 74.69,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$74.69"
      },
      "NZ": {
        "amount": 91.29,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$91.29"
      },
      "NP": {
        "amount": 6224.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 6224.0"
      },
      "DEFAULT": {
        "amount": 53.94,
        "currency": "USD",
        "symbol": "$",
        "display": "$53.94"
      }
    }
  },
  "untitled-dec25_22-48": {
    "id": "untitled-dec25_22-48",
    "name": "Lwang Black Brewing Pot",
    "category": "accessories",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/DSC00214.jpg?v=1768362755",
    "description": "Premium insulated keep cup designed for life on the go, 100% leakproof and keeps your drink warm for up to 5\u20136 hours....",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 19.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$19.99"
      },
      "US": {
        "amount": 12.99,
        "currency": "USD",
        "symbol": "$",
        "display": "$12.99"
      },
      "GB": {
        "amount": 9.99,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a39.99"
      },
      "CA": {
        "amount": 17.99,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$17.99"
      },
      "NZ": {
        "amount": 21.99,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$21.99"
      },
      "NP": {
        "amount": 1499.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 1499.0"
      },
      "DEFAULT": {
        "amount": 12.99,
        "currency": "USD",
        "symbol": "$",
        "display": "$12.99"
      }
    }
  },
  "lwang-black-drip-coffee-bags": {
    "id": "lwang-black-drip-coffee-bags",
    "name": "Lwang Black Drip Coffee Bags",
    "category": "coffee",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/DSC00258.jpg?v=1768362689",
    "description": "Lwang Black Drip Coffee Bags \u2013 includes 14 easy-to-use sachets, each delivering a fresh, smooth, and aromatic cup of ...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 19.99,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$19.99"
      },
      "US": {
        "amount": 12.99,
        "currency": "USD",
        "symbol": "$",
        "display": "$12.99"
      },
      "GB": {
        "amount": 9.99,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a39.99"
      },
      "CA": {
        "amount": 17.99,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$17.99"
      },
      "NZ": {
        "amount": 21.99,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$21.99"
      },
      "NP": {
        "amount": 1499.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 1499.0"
      },
      "DEFAULT": {
        "amount": 12.99,
        "currency": "USD",
        "symbol": "$",
        "display": "$12.99"
      }
    }
  },
  "qr-based-surprise-message-send-love-in-a-unique-way": {
    "id": "qr-based-surprise-message-send-love-in-a-unique-way",
    "name": "QR-Based Surprise Message \u2013 Send Love in a Unique Way",
    "category": "accessories",
    "image": "https://cdn.shopify.com/s/files/1/0741/9589/4489/files/jjjjj.jpg?v=1764157383",
    "description": "Click here to fill the form Form Link \ud83d\udc48 Make your gift unforgettable with a personalized QR message card.You share yo...",
    "stock": 100,
    "allowed_regions": "ALL",
    "prices": {
      "AU": {
        "amount": 10.0,
        "currency": "AUD",
        "symbol": "A$",
        "display": "A$10.0"
      },
      "US": {
        "amount": 6.5,
        "currency": "USD",
        "symbol": "$",
        "display": "$6.5"
      },
      "GB": {
        "amount": 5.0,
        "currency": "GBP",
        "symbol": "\u00a3",
        "display": "\u00a35.0"
      },
      "CA": {
        "amount": 9.0,
        "currency": "CAD",
        "symbol": "C$",
        "display": "C$9.0"
      },
      "NZ": {
        "amount": 11.0,
        "currency": "NZD",
        "symbol": "NZ$",
        "display": "NZ$11.0"
      },
      "NP": {
        "amount": 750.0,
        "currency": "NPR",
        "symbol": "Rs",
        "display": "Rs 750.0"
      },
      "DEFAULT": {
        "amount": 6.5,
        "currency": "USD",
        "symbol": "$",
        "display": "$6.5"
      }
    }
  }
};
// Country-specific logistics rates (carrier-mapped)
const COUNTRY_SHIPPING_RATES = {
  NP: {
    standard: { price: 0, label: 'Pathao Standard (1–3 days)', carrier: 'Pathao' },
    express:  { price: 0, label: 'Pathao Express (Same day KTM)', carrier: 'Pathao' }
  },
  AU: {
    standard: { price: 14.99, label: 'Australia Post Standard (5–8 days)', carrier: 'Australia Post' },
    express:  { price: 29.99, label: 'Australia Post Express (2–3 days)', carrier: 'Australia Post' }
  },
  US: {
    firstClass: { price: 4.50,  label: 'USPS First-Class Mail (1–5 days)',        carrier: 'USPS', serviceCode: 'FIRST_CLASS' },
    standard:   { price: 8.70,  label: 'USPS Priority Mail (2–3 days)',            carrier: 'USPS', serviceCode: 'PRIORITY' },
    express:    { price: 26.35, label: 'USPS Priority Mail Express (1–2 days)',    carrier: 'USPS', serviceCode: 'PRIORITY_EXPRESS' },
    ground:     { price: 7.25,  label: 'USPS Retail Ground (2–8 days)',            carrier: 'USPS', serviceCode: 'RETAIL_GROUND' },
    liveRates:  true // flag: checkout.html will fetch live rates from /api/logistics/usps/rates
  },
  GB: {
    standard: { price: 11.99, label: 'Australia Post International (6–9 days)', carrier: 'Australia Post' },
    express:  { price: 26.99, label: 'Australia Post Priority International (2–4 days)', carrier: 'Australia Post' }
  },
  CA: {
    standard: { price: 15.99, label: 'Chit Chats Standard (7–10 days)', carrier: 'Chit Chats' },
    express:  { price: 36.99, label: 'Chit Chats Express (3–5 days)', carrier: 'Chit Chats' }
  },
  NZ: {
    standard: { price: 12.99, label: 'NZ Post Standard (5–7 days)', carrier: 'NZ Post' },
    express:  { price: 27.99, label: 'NZ Post Express (2–3 days)', carrier: 'NZ Post' }
  },
  JP: {
    standard: { price: 890, label: 'Japan Post 標準 (7–12日)', carrier: 'Japan Post' },
    express:  { price: 1980, label: 'Japan Post 速達 (4–7日)', carrier: 'Japan Post' },
  },
  DEFAULT: {
    standard: { price: 19.99, label: 'Australia Post International (8–14 days)', carrier: 'Australia Post' },
    express:  { price: 44.99, label: 'Australia Post Priority International (4–7 days)', carrier: 'Australia Post' }
  }
};

// Country code → display name map
const COUNTRY_NAMES = {
  NP: 'Nepal 🇳🇵', AU: 'Australia 🇦🇺', US: 'United States 🇺🇸',
  GB: 'United Kingdom 🇬🇧', CA: 'Canada 🇨🇦', DE: 'Germany 🇩🇪',
  FR: 'France 🇫🇷', NZ: 'New Zealand 🇳🇿', SG: 'Singapore 🇸🇬',
  AE: 'UAE 🇦🇪', IN: 'India 🇮🇳', JP: 'Japan 🇯🇵',
  CN: 'China 🇨🇳', KR: 'South Korea 🇰🇷', BR: 'Brazil 🇧🇷',
  OTHER: 'Other Region 🌍'
};

function getProductPrice(productId, countryCode) {
  const product = LB_PRODUCTS[productId];
  if (!product) return null;
  if (product.allowed_regions !== 'ALL') {
    if (!product.allowed_regions.includes(countryCode)) return null;
  }
  const prices = product.prices;
  let basePrice = prices[countryCode] || null;

  // Japan: use explicit JPY when present; otherwise derive from USD list price (Stripe charges in whole yen).
  if (!basePrice && countryCode === 'JP') {
    const us = prices.US || prices.DEFAULT;
    if (us && typeof us.amount === 'number') {
      const jpy = Math.max(50, Math.round(us.amount * 155));
      return {
        amount: jpy,
        currency: 'JPY',
        symbol: '¥',
        display: `¥${jpy.toLocaleString('ja-JP')}`,
      };
    }
  }

  if (!basePrice) basePrice = prices.DEFAULT || null;

  if (window.AUCurrencyState && window.AUCurrencyState.active && basePrice) {
    const convertedAmount = basePrice.amount * window.AUCurrencyState.rate;
    const sym = window.AUCurrencyState.symbol || window.AUCurrencyState.targetCurrency;
    const cFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(convertedAmount);
    return {
      amount: convertedAmount,
      currency: window.AUCurrencyState.targetCurrency,
      symbol: sym,
      display: sym + cFormat
    };
  }

  return basePrice;
}

function isProductAvailable(productId, countryCode) {
  const product = LB_PRODUCTS[productId];
  if (!product) return false;
  if (product.allowed_regions === 'ALL') return true;
  return product.allowed_regions.includes(countryCode);
}

function getShippingRates(countryCode) {
  const rates = COUNTRY_SHIPPING_RATES[countryCode] || COUNTRY_SHIPPING_RATES.DEFAULT;
  // For US, return the USPS options as an array for the checkout display
  if (countryCode === 'US') {
    const { liveRates, ...options } = rates;
    return { ...options, liveRates: true };
  }
  return rates;
}

// Returns a flat array of shipping options for a country (used in checkout dropdowns).
function getShippingOptions(countryCode) {
  const rates = COUNTRY_SHIPPING_RATES[countryCode] || COUNTRY_SHIPPING_RATES.DEFAULT;
  return Object.entries(rates)
    .filter(([key]) => key !== 'liveRates')
    .map(([key, opt]) => ({ key, ...opt }));
}

function formatPrice(price) {
  if (!price) return null;
  return price.display;
}

window.LB_PRODUCTS = LB_PRODUCTS;
window.COUNTRY_SHIPPING_RATES = COUNTRY_SHIPPING_RATES;
window.COUNTRY_NAMES = COUNTRY_NAMES;
window.getProductPrice = getProductPrice;
window.isProductAvailable = isProductAvailable;
window.getShippingRates = getShippingRates;
window.getShippingOptions = getShippingOptions;
window.formatPrice = formatPrice;

// ── API product grid (shop + catalogue) ─────────────────────────────────────
// Map LB_PRODUCTS (local fallback) → API shape used by lwbRenderProductCard.
function lwbLocalProductsAsApiShape() {
  const out = [];
  try {
    const dict = window.LB_PRODUCTS || {};
    for (const id in dict) {
      const p = dict[id];
      if (!p) continue;
      // Convert local prices ({amount,currency,symbol,display}) → numeric amount per region.
      const prices = {};
      const compareAt = {};
      for (const r in (p.prices || {})) {
        const px = p.prices[r];
        if (px && typeof px.amount === 'number') prices[r] = px.amount;
      }
      out.push({
        id: p.id || id,
        handle: p.id || id,
        title: p.name || id,
        category: p.category || 'coffee',
        images: [p.image].filter(Boolean),
        prices,
        compareAtPrices: compareAt,
        variants: [{ id: (p.id || id) + '-default', title: 'Default' }],
        rating: p.rating || 0,
        reviewCount: p.reviewCount || 0,
      });
    }
  } catch (e) {
    console.warn('[lwb] local fallback build failed', e);
  }
  return out;
}

// Race a promise against a timeout so the page never hangs on a slow/dead API.
function lwbWithTimeout(promise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, ms);
    Promise.resolve(promise).then((v) => {
      if (!settled) { settled = true; clearTimeout(t); resolve(v); }
    }).catch(() => {
      if (!settled) { settled = true; clearTimeout(t); resolve(null); }
    });
  });
}

async function lwbFetchProducts(category) {
  // Don't let a stuck Shopify-config probe block product rendering forever.
  await lwbWithTimeout(window.__lwbShopifyReady || Promise.resolve(), 1500);
  const qs = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
  const basePath = window.__LWB_SHOPIFY_ACTIVE__ ? '/shopify/products' : '/products';
  const url =
    typeof window.lwbApiUrl === 'function'
      ? window.lwbApiUrl(basePath + qs)
      : `${window.LWB_API_BASE}${basePath}${qs}`;
  try {
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (timer) clearTimeout(timer);
    const data = await res.json();
    const list = (data && data.products) || [];
    if (list.length) return list;
    return lwbLocalProductsAsApiShape();
  } catch (e) {
    console.warn('[lwb] products fetch failed, using local fallback', e);
    return lwbLocalProductsAsApiShape();
  }
}

async function lwbFetchProduct(handleOrId) {
  await (window.__lwbShopifyReady || Promise.resolve());
  const basePath = window.__LWB_SHOPIFY_ACTIVE__ ? '/shopify/products/' : '/products/';
  const url =
    typeof window.lwbApiUrl === 'function'
      ? window.lwbApiUrl(basePath + encodeURIComponent(handleOrId))
      : `${window.LWB_API_BASE}${basePath}${encodeURIComponent(handleOrId)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.product || null;
  } catch {
    return null;
  }
}

function lwbRenderStars(rating) {
  const r = Number(rating) || 0;
  const full = Math.floor(r);
  const half = r % 1 >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}

function lwbFormatPriceSafe(amount, region) {
  if (amount == null) return '';
  if (window.lwbCart && typeof window.lwbCart.formatPrice === 'function') {
    try { return window.lwbCart.formatPrice(amount, region); } catch (e) { /* fall through */ }
  }
  // Minimal fallback formatter so cards still render before cart.js is ready.
  const map = { NP: 'Rs ', AU: 'A$', US: '$', GB: '£', CA: 'C$', NZ: 'NZ$', JP: '¥', EU: '€' };
  const sym = map[region] || '$';
  const num = Number(amount);
  if (!isFinite(num)) return '';
  return sym + num.toFixed(2);
}

function lwbRenderProductCard(product) {
  if (!product || typeof product !== 'object') return '';
  const region = (typeof window.lwbCart !== 'undefined' && window.lwbCart && window.lwbCart.getRegion)
    ? window.lwbCart.getRegion()
    : (localStorage.getItem('lwb_region') || 'NP');
  const prices = product.prices || {};
  const priceVal = prices[region] != null ? prices[region] : (prices.EU != null ? prices.EU : prices.NP);
  const price = lwbFormatPriceSafe(priceVal, region);
  const cmpMap = product.compareAtPrices || {};
  const cmp = cmpMap[region] != null ? cmpMap[region] : cmpMap.EU;
  const comparePrice = (cmp != null) ? lwbFormatPriceSafe(cmp, region) : '';
  const hasCompare = !!comparePrice;

  const variantSelect =
    product.variants && product.variants.length > 1
      ? `<select class="variant-select lwb-variant" data-lwb-product="${product.id}" style="width:100%;padding:6px;margin-bottom:10px;border:1px solid var(--border-color);border-radius:4px;background:transparent;font-size:12px;color:var(--text-primary);">
          ${product.variants.map((v) => `<option value="${v.id}">${v.title}</option>`).join('')}
        </select>`
      : '';

  const cat = product.category || 'coffee';
  const handle = product.handle || product.id || '';
  const img0 = (product.images && product.images[0]) || (product.image || '');
  return `
    <div class="product-card" data-category="${cat}" data-product-id="${product.id}">
      ${hasCompare ? '<div class="product-badge">SALE</div>' : ''}
      <a href="product.html?id=${encodeURIComponent(handle)}" class="product-image-wrap">
        <img src="${img0}" alt="${(product.title || '').replace(/"/g, '&quot;')}" loading="lazy" decoding="async" style="width:100%;aspect-ratio:1;object-fit:cover" onerror="this.style.opacity=0.2" />
      </a>
      <div class="product-info">
        <p class="product-category" style="font-size:10px;letter-spacing:2px;color:var(--text-muted);margin:0">${String(product.category).toUpperCase()}</p>
        <h3 class="product-title" style="margin:6px 0 4px;font-size:clamp(1rem,2vw,1.1rem)">${product.title}</h3>
        ${(product.reviewCount > 0)
          ? `<div class="product-rating" style="color:var(--accent);font-size:12px;margin-bottom:8px">
          ${lwbRenderStars(product.rating)} <span style="color:var(--text-muted)">(${product.reviewCount})</span>
        </div>`
          : ''}
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <span class="product-price" style="font-size:1.35rem;font-family:var(--font-heading)">${price}</span>
          ${comparePrice ? `<span style="text-decoration:line-through;color:var(--text-muted);font-size:0.85rem">${comparePrice}</span>` : ''}
        </div>
        ${variantSelect}
        <button type="button" class="btn-solid" style="width:100%;padding:0.75rem;font-size:0.65rem;letter-spacing:2px;"
          data-lwb-add="${product.id}">ADD TO CART</button>
      </div>
    </div>`;
}

let _lwbProductCache = [];

async function lwbAddFromGrid(productId) {
  let p = _lwbProductCache.find((x) => x.id === productId);
  if (!p) p = await lwbFetchProduct(productId);
  if (!p) {
    if (window.lwbCart && window.lwbCart.showToast) window.lwbCart.showToast('Product not found', 'error');
    return;
  }
  const sel = document.querySelector(`select[data-lwb-product="${productId}"]`);
  const vid = sel ? sel.value : ((p.variants && p.variants[0] && p.variants[0].id) || p.id);
  if (window.lwbCart && typeof window.lwbCart.addToCart === 'function') {
    window.lwbCart.addToCart(p, vid, 1);
  } else {
    console.warn('[lwb] cart not ready');
  }
}

async function initLwbProductGrids() {
  if (typeof window.LWB_API_BASE === 'undefined' && typeof location !== 'undefined') {
    window.LWB_API_BASE = location.origin.replace(/\/$/, '') + '/api';
  }
  const sel = '#lb-shop-grid, .product-grid, #products-grid, #product-grid';
  const grid = document.querySelector(sel);
  if (!grid) return;

  function safeRenderCard(p) {
    try { return lwbRenderProductCard(p); }
    catch (e) { console.warn('[lwb] card render failed', e, p); return ''; }
  }

  function attachAddHandlers(scope) {
    scope.querySelectorAll('[data-lwb-add]').forEach((btn) => {
      if (btn.__lwbBound) return;
      btn.__lwbBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        lwbAddFromGrid(btn.getAttribute('data-lwb-add'));
      });
    });
  }

  function render(list) {
    const html = list.map(safeRenderCard).filter(Boolean).join('');
    if (!html) {
      // Defensive: if render produced nothing at all, keep skeletons rather than show "No products"
      return false;
    }
    grid.innerHTML = html;
    attachAddHandlers(grid);
    return true;
  }

  // ── PHASE 1: render local catalogue IMMEDIATELY (synchronous, no waiting) ──
  // Guarantees "OUR COLLECTION" never shows empty/loading-forever even if API is down.
  const localList = lwbLocalProductsAsApiShape();
  if (localList.length) {
    _lwbProductCache = localList;
    render(localList);
  } else {
    // Only show skeletons if we truly have no local data (shouldn't happen).
    const skeletonCount = 6;
    grid.innerHTML = Array.from({ length: skeletonCount }, () =>
      `<div class="lwb-skeleton-card" aria-hidden="true"></div>`
    ).join('');
  }

  // Wire up filter buttons against whatever is currently in the cache.
  function bindFilters() {
    document.querySelectorAll('.filter-btn[data-filter]').forEach((btn) => {
      if (btn.__lwbFilterBound) return;
      btn.__lwbFilterBound = true;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn[data-filter]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.getAttribute('data-filter') || 'all';
        const productList = _lwbProductCache || [];
        const filtered = cat === 'all' ? productList : productList.filter((p) => p.category === cat);
        render(filtered);
      });
    });
  }
  bindFilters();

  // ── PHASE 2: try to upgrade to live API data in the background ──
  try {
    const apiProducts = await lwbFetchProducts('all');
    if (Array.isArray(apiProducts) && apiProducts.length) {
      // Only swap if API result is meaningfully different / has more items.
      const sameLen = _lwbProductCache && _lwbProductCache.length === apiProducts.length;
      _lwbProductCache = apiProducts;
      if (!sameLen) render(apiProducts);
    }
  } catch (e) {
    console.warn('[lwb] background API upgrade failed; keeping local catalogue', e);
  }
}

// Inject Product / ItemList JSON-LD for SEO when a grid is on the page.
function lwbInjectProductSchema(products) {
  try {
    if (!Array.isArray(products) || !products.length) return;
    if (document.getElementById('lwb-products-jsonld')) return;
    const region = (localStorage.getItem('lwb_region') || 'NP');
    const currencyMap = { NP:'NPR', AU:'AUD', US:'USD', GB:'GBP', CA:'CAD', NZ:'NZD', JP:'JPY', EU:'EUR' };
    const items = products.slice(0, 30).map((p, i) => {
      const handle = p.handle || p.id;
      const url = 'https://www.lwangblack.co/product.html?id=' + encodeURIComponent(handle);
      const priceVal = (p.prices && (p.prices[region] != null ? p.prices[region] : p.prices.US));
      return {
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          '@id': url,
          name: p.title || p.name || handle,
          url,
          image: (p.images && p.images[0]) || p.image || '',
          brand: { '@type': 'Brand', name: 'Lwang Black' },
          category: p.category || 'Coffee',
          offers: priceVal != null ? {
            '@type': 'Offer',
            url,
            priceCurrency: currencyMap[region] || 'USD',
            price: Number(priceVal).toFixed(2),
            availability: 'https://schema.org/InStock',
            itemCondition: 'https://schema.org/NewCondition',
          } : undefined,
          aggregateRating: (p.reviewCount > 0 && p.rating)
            ? { '@type': 'AggregateRating', ratingValue: Number(p.rating).toFixed(1), reviewCount: p.reviewCount }
            : undefined,
        }
      };
    });
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Lwang Black Products',
      numberOfItems: items.length,
      itemListElement: items,
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'lwb-products-jsonld';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  } catch (e) {
    console.warn('[lwb] product schema inject failed', e);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initLwbProductGrids();
  if (Array.isArray(_lwbProductCache) && _lwbProductCache.length) {
    lwbInjectProductSchema(_lwbProductCache);
  }
});

window.lwbPricing = {
  fetchProducts: lwbFetchProducts,
  fetchProduct: lwbFetchProduct,
  initLwbProductGrids,
  lwbRenderProductCard,
};

// Variant image preloading removed for performance
// Images load on-demand when variants are selected

