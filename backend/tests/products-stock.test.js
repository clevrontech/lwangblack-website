const request = require('supertest');
const { app } = require('./setup');

describe('POST /api/products/stock-check', () => {
  test('validates cart lines against JSON catalog', async () => {
    const res = await request(app)
      .post('/api/products/stock-check')
      .send({
        items: [{ productId: 'lwb-001', variantId: 'lwb-001-wb', qty: 1 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.issues).toEqual([]);
  });

  test('flags insufficient stock', async () => {
    const res = await request(app)
      .post('/api/products/stock-check')
      .send({
        items: [{ productId: 'lwb-001', variantId: 'lwb-001-wb', qty: 999999 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });
});
