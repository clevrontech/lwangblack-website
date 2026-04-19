/**
 * Shopify Admin API (GraphQL) — server-side only.
 * @see https://shopify.dev/docs/api/admin-graphql
 *
 * Required env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN
 * Typical custom app scopes: read_orders, read_products, read_inventory, read_locations
 */
const fetch = require('node-fetch');
const config = require('../../config');

function getAdminConfig() {
  const s = config.shopify || {};
  return {
    ok: !!(s.storeDomain && s.adminAccessToken),
    storeDomain: (s.storeDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    adminAccessToken: s.adminAccessToken || '',
    apiVersion: s.apiVersion || '2025-01',
  };
}

function adminEndpoint() {
  const { storeDomain, apiVersion } = getAdminConfig();
  return `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
}

async function adminGraphql(query, variables = {}) {
  const { adminAccessToken, ok } = getAdminConfig();
  if (!ok) {
    const err = new Error('Shopify Admin API not configured (SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_ACCESS_TOKEN)');
    err.code = 'SHOPIFY_ADMIN_NOT_CONFIGURED';
    throw err;
  }

  const res = await fetch(adminEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': adminAccessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.errors?.map((e) => e.message).join('; ') || res.statusText;
    throw new Error(msg || 'Shopify Admin HTTP error');
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

async function pingShop() {
  const q = `
    query ShopPing {
      shop {
        name
        email
        myshopifyDomain
        currencyCode
      }
    }
  `;
  return adminGraphql(q);
}

async function listOrders(first = 25, after = null) {
  const q = `
    query Orders($first: Int!, $after: String) {
      orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        edges {
          cursor
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            customer { displayName email }
            shippingAddress { countryCode city }
          }
        }
      }
    }
  `;
  return adminGraphql(q, { first, after });
}

function toOrderGid(id) {
  const s = String(id).trim();
  if (s.startsWith('gid://')) return s;
  if (/^\d+$/.test(s)) return `gid://shopify/Order/${s}`;
  return s;
}

async function getOrder(id) {
  const q = `
    query OneOrder($id: ID!) {
      order(id: $id) {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        subtotalPriceSet { shopMoney { amount currencyCode } }
        customer { displayName email phone }
        shippingAddress { address1 city zip countryCode }
        lineItems(first: 50) {
          edges {
            node {
              title
              quantity
              originalUnitPriceSet { shopMoney { amount currencyCode } }
              variant { id sku title }
            }
          }
        }
        fulfillments(first: 5) {
          status
          trackingInfo { company number url }
        }
      }
    }
  `;
  return adminGraphql(q, { id: toOrderGid(id) });
}

async function listProductInventory(first = 50) {
  const q = `
    query Inv($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            handle
            title
            status
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  sku
                  inventoryQuantity
                  inventoryPolicy
                }
              }
            }
          }
        }
      }
    }
  `;
  return adminGraphql(q, { first });
}

module.exports = {
  getAdminConfig,
  adminGraphql,
  pingShop,
  listOrders,
  getOrder,
  listProductInventory,
  toOrderGid,
};
