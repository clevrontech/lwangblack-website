const request = require('supertest');
const { app } = require('./setup');

describe('Admin API', () => {
  let ownerToken, managerToken;

  beforeAll(async () => {
    const ownerRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'lwangblack2024' });
    ownerToken = ownerRes.body.token;

    const mgrRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nepal_mgr', password: 'lwangblack2024' });
    managerToken = mgrRes.body.token;
  });

  test('POST /api/auth/login — accepts email field as username alias', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner', password: 'lwangblack2024' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('owner');
  });

  test('GET /api/health — server health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBeDefined();
  });

  test('GET /api/checkout-config — GDPR config', async () => {
    const res = await request(app).get('/api/checkout-config');
    expect(res.status).toBe(200);
    expect(res.body.policies).toBeDefined();
    expect(res.body.policies.privacy).toBeDefined();
    expect(res.body.gdpr.consentRequired).toBe(true);
  });

  test('GET /api/settings — owner can read settings', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.settings).toBeDefined();
  });

  test('PUT /api/settings — owner can update', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ store_name: 'Lwang Black Test' });

    expect(res.status).toBe(200);
  });

  test('PUT /api/settings — manager cannot update (role check)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ store_name: 'Hack' });

    expect(res.status).toBe(403);
  });

  test('GET /api/settings/audit-log — owner only', async () => {
    const res = await request(app)
      .get('/api/settings/audit-log')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.logs).toBeDefined();
  });

  test('GET /api/customers — list customers', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customers).toBeDefined();
  });

  test('GET /api/orders — manager sees country-filtered orders', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    if (res.body.orders.length > 0) {
      expect(res.body.orders.every(o => o.country === 'NP')).toBe(true);
    }
  });

  test('GET /api/orders/export/csv — CSV export', async () => {
    const res = await request(app)
      .get('/api/orders/export/csv')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  test('POST /api/notifications/invoice/:orderId — generate invoice', async () => {
    const res = await request(app)
      .post('/api/notifications/invoice/LB-2450')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.invoice).toBeDefined();
    expect(res.body.invoice.invoiceNumber).toBeDefined();
  });
});
