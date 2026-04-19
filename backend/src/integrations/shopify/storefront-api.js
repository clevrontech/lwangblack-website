/**
 * Shopify Storefront API (GraphQL) — official HTTPS integration.
 * @see https://shopify.dev/docs/api/storefront
 */
const fetch = require('node-fetch');
const config = require('../../config');

function getShopifyConfig() {
  const s = config.shopify || {};
  return {
    enabled: !!s.enabled && !!s.storeDomain && !!s.storefrontAccessToken,
    storeDomain: (s.storeDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    storefrontAccessToken: s.storefrontAccessToken || '',
    apiVersion: s.apiVersion || '2025-01',
  };
}

function endpoint() {
  const { storeDomain, apiVersion } = getShopifyConfig();
  return `https://${storeDomain}/api/${apiVersion}/graphql.json`;
}

async function storefrontGraphql(query, variables = {}) {
  const { storefrontAccessToken } = getShopifyConfig();
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.errors?.map((e) => e.message).join('; ') || res.statusText;
    throw new Error(msg || 'Shopify HTTP error');
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

const PRODUCT_NODE = `
  id
  handle
  title
  description
  descriptionHtml
  productType
  tags
  featuredImage { url altText }
  images(first: 20) {
    edges { node { url altText } }
  }
  variants(first: 100) {
    edges {
      node {
        id
        title
        availableForSale
        quantityAvailable
        price { amount currencyCode }
        compareAtPrice { amount currencyCode }
      }
    }
  }
  priceRange {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
`;

function parseMoney(node) {
  if (!node?.amount) return 0;
  return parseFloat(node.amount);
}

/**
 * Map Shopify product → Lwang JSON-store shape (prices duplicated per region using shop currency amount).
 */
function mapProductNode(node) {
  if (!node) return null;
  const imgs = [];
  if (node.featuredImage?.url) imgs.push(node.featuredImage.url);
  for (const e of node.images?.edges || []) {
    const u = e?.node?.url;
    if (u && !imgs.includes(u)) imgs.push(u);
  }
  const variants = [];
  for (const e of node.variants?.edges || []) {
    const v = e.node;
    const price = parseMoney(v.price);
    const cmp = v.compareAtPrice ? parseMoney(v.compareAtPrice) : null;
    variants.push({
      id: v.id,
      title: v.title || 'Default',
      sku: '',
      inventory: typeof v.quantityAvailable === 'number' ? v.quantityAvailable : 99,
      availableForSale: v.availableForSale !== false,
      price,
      compareAtPrice: cmp,
    });
  }
  if (!variants.length) return null;

  const minP = parseMoney(node.priceRange?.minVariantPrice) || variants[0].price;
  const currency = node.priceRange?.minVariantPrice?.currencyCode || 'USD';
  const regions = ['NP', 'AU', 'US', 'GB', 'EU', 'CA', 'JP', 'NZ'];
  const prices = {};
  const compareAtPrices = {};
  regions.forEach((r) => {
    prices[r] = minP;
    const cmp0 = variants[0].compareAtPrice;
    if (cmp0) compareAtPrices[r] = cmp0;
  });

  const cat = (node.productType || 'coffee').toLowerCase().replace(/\s+/g, '-');
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description || (node.descriptionHtml ? stripHtml(node.descriptionHtml) : ''),
    category: cat.includes('coffee') ? 'coffee' : cat.includes('bundle') ? 'bundles' : cat.includes('access') ? 'accessories' : 'coffee',
    images: imgs.length ? imgs : ['https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png'],
    variants,
    prices,
    compareAtPrices: Object.keys(compareAtPrices).length ? compareAtPrices : undefined,
    status: 'active',
    tags: node.tags || [],
    rating: 0,
    reviewCount: 0,
    currencyCode: currency,
    source: 'shopify',
  };
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

async function fetchProducts(first = 50) {
  const q = `
    query StoreProducts($first: Int!) {
      products(first: $first) {
        edges { node { ${PRODUCT_NODE} } }
      }
    }
  `;
  const data = await storefrontGraphql(q, { first });
  const edges = data?.products?.edges || [];
  return edges.map((e) => mapProductNode(e.node)).filter(Boolean);
}

async function fetchProductByHandle(handle) {
  const q = `
    query OneProduct($handle: String!) {
      product(handle: $handle) { ${PRODUCT_NODE} }
    }
  `;
  const data = await storefrontGraphql(q, { handle });
  return mapProductNode(data?.product);
}

async function createCheckout(lines) {
  const mutation = `
    mutation CreateCheckout($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors { field message code }
      }
    }
  `;
  const data = await storefrontGraphql(mutation, { input: { lines } });
  const payload = data?.cartCreate;
  const errs = payload?.userErrors;
  if (errs?.length) {
    throw new Error(errs.map((e) => e.message).join('; '));
  }
  const url = payload?.cart?.checkoutUrl;
  if (!url) throw new Error('Shopify did not return checkoutUrl');
  return { checkoutUrl: url, cartId: payload?.cart?.id };
}

module.exports = {
  getShopifyConfig,
  storefrontGraphql,
  fetchProducts,
  fetchProductByHandle,
  createCheckout,
  mapProductNode,
};
