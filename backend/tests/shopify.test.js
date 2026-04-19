const request = require('supertest');
const { app } = require('./setup');

describe('Shopify integration', () => {
  test('GET /api/shopify/config — public config (disabled in test env)', async () => {
    const res = await request(app).get('/api/shopify/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('enabled');
    expect(res.body).toHaveProperty('integration', 'storefront-api');
  });

  test('GET /api/shopify/products — empty or 503 when not configured', async () => {
    const res = await request(app).get('/api/shopify/products');
    expect([200, 502, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.products)).toBe(true);
    }
  });
});
