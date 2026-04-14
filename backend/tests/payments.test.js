const request = require('supertest');
const { app } = require('./setup');

describe('Payments API', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'lwangblack2024' });
    token = res.body.token;
  });

  test('GET /api/payments/methods?country=AU — global methods', async () => {
    const res = await request(app).get('/api/payments/methods?country=AU');

    expect(res.status).toBe(200);
    expect(res.body.methods).toBeDefined();
    const ids = res.body.methods.map(m => m.id);
    expect(ids).toContain('stripe');
    expect(ids).toContain('paypal');
  });

  test('GET /api/payments/methods?country=NP — Nepal methods: esewa, card, cod', async () => {
    const res = await request(app).get('/api/payments/methods?country=NP');

    expect(res.status).toBe(200);
    const ids = res.body.methods.map(m => m.id);
    expect(ids).toContain('esewa');
    expect(ids).toContain('card');
    expect(ids).toContain('cod');
    // Khalti and Nabil not offered
    expect(ids).not.toContain('khalti');
    expect(ids).not.toContain('nabil');
  });

  test('POST /api/payments/stripe-session — returns 503 when keys not configured', async () => {
    const res = await request(app)
      .post('/api/payments/stripe-session')
      .send({
        items: [{ name: 'Test', qty: 1, price: 10 }],
        country: 'AU',
        orderId: 'LB-TEST',
      });

    // No Stripe keys in test env → gateway not configured error
    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/payments/checkout with khalti — returns 503 when keys not configured', async () => {
    const res = await request(app)
      .post('/api/payments/checkout')
      .send({
        gateway: 'khalti',
        customer: { fname: 'Aarav', lname: 'Shrestha', email: 'aarav.khalti@test.com' },
        items: [{ name: 'Lwang Black 250g', qty: 1, price: 1599 }],
        country: 'NP', currency: 'NPR', symbol: 'Rs',
        subtotal: 1599, shipping: 0, total: 1599,
      });

    // No KHALTI_SECRET_KEY in test env → 503
    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/payments/esewa-initiate — initiation', async () => {
    const res = await request(app)
      .post('/api/payments/esewa-initiate')
      .send({ orderId: 'LB-TEST', amount: 1599 });

    expect(res.status).toBe(200);
    expect(res.body.gatewayUrl).toBeDefined();
    expect(res.body.formData).toBeDefined();
  });

  test('POST /api/payments/cod-place — cash on delivery stays pending', async () => {
    const res = await request(app)
      .post('/api/payments/cod-place')
      .send({ orderId: 'LB-2448', amount: 5198 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.method).toBe('cod');

    // COD order stays pending until admin confirms
    const statusRes = await request(app).get('/api/payments/status/LB-2448');
    expect(statusRes.body.paymentMethod).toBe('cod');
  });

  test('POST /api/payments/checkout — returns 503 when Stripe keys not configured', async () => {
    const res = await request(app)
      .post('/api/payments/checkout')
      .send({
        gateway: 'stripe',
        customer: { fname: 'Test', lname: 'User', email: 'test@test.com' },
        items: [{ name: 'Lwang Black 250g', qty: 1, price: 27 }],
        country: 'AU', currency: 'AUD', symbol: 'A$',
        subtotal: 27, shipping: 14.99, total: 41.99,
      });

    // No Stripe keys configured in test env
    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
    expect(res.body.gateway).toBe('stripe');
  });

  test('POST /api/payments/checkout — COD places order as pending (Nepal)', async () => {
    const res = await request(app)
      .post('/api/payments/checkout')
      .send({
        gateway: 'cod',
        customer: { fname: 'Aarav', lname: 'Shrestha', email: 'aarav@test.com', phone: '+977980000000' },
        items: [{ name: 'Lwang Black 500g', qty: 1, price: 4999 }],
        country: 'NP', currency: 'NPR', symbol: 'Rs',
        subtotal: 4999, shipping: 0, total: 4999,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.method).toBe('cod');
    expect(res.body.orderId).toBeDefined();

    // Order must be pending — not confirmed before delivery
    const statusRes = await request(app).get(`/api/payments/status/${res.body.orderId}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('pending');
  });

  test('POST /api/payments/checkout — COD rejected outside Nepal', async () => {
    const res = await request(app)
      .post('/api/payments/checkout')
      .send({
        gateway: 'cod',
        customer: { fname: 'John', lname: 'Smith', email: 'john@test.com' },
        items: [{ name: 'Test Product', qty: 1, price: 30 }],
        country: 'AU', currency: 'AUD', symbol: 'A$',
        subtotal: 30, shipping: 15, total: 45,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Nepal/i);
  });

  test('POST /api/payments/checkout — validates required fields', async () => {
    const res = await request(app)
      .post('/api/payments/checkout')
      .send({ gateway: 'stripe' }); // missing items, total, customer

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('GET /api/payments/status/:orderId — check status', async () => {
    const res = await request(app).get('/api/payments/status/LB-2450');

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe('LB-2450');
    expect(res.body.status).toBeDefined();
  });

  test('POST /api/payments/:orderId/refund — process refund', async () => {
    const res = await request(app)
      .post('/api/payments/LB-2450/refund')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Test refund' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Refund');
  });
});
