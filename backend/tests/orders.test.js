const request = require('supertest');
const { app } = require('./setup');

describe('Orders API', () => {
  let token;
  let orderId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'lwangblack2024' });
    token = res.body.token;
  });

  test('GET /api/orders — list orders', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.orders).toBeDefined();
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.total).toBeDefined();
  });

  test('POST /api/orders — create order', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        country: 'AU',
        currency: 'AUD',
        symbol: 'A$',
        items: [{ name: 'Lwang Black 250g', qty: 1, price: 27 }],
        subtotal: 27,
        shipping: 14.99,
        total: 41.99,
        customer: { fname: 'Test', lname: 'User', email: 'test@example.com', phone: '+61400000000' },
        paymentMethod: 'stripe',
      });

    expect(res.status).toBe(201);
    expect(res.body.orderId).toBeDefined();
    expect(res.body.order.status).toBe('pending');
    orderId = res.body.orderId;
  });

  test('newly created order should be pending (not paid)', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.order.status).toBe('pending');
  });

  test('PATCH /api/orders/:id — admin can manually mark order as paid', async () => {
    // Simulates admin confirming payment received (e.g., bank transfer verified)
    const res = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'paid' });

    expect(res.status).toBe(200);

    const orderRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(orderRes.body.order.status).toBe('paid');
  });

  test('GET /api/orders/:id — get order detail', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.order).toBeDefined();
    expect(res.body.order.id).toBe(orderId);
  });

  test('PATCH /api/orders/:id — update to shipped with tracking', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'shipped', tracking: 'DHL-TEST-123', carrier: 'DHL' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('updated');
  });

  test('GET /api/orders?status=shipped — filter by status', async () => {
    const res = await request(app)
      .get('/api/orders?status=shipped')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = res.body.orders.find(o => o.id === orderId);
    expect(found).toBeDefined();
    expect(found.status).toBe('shipped');
  });

  test('DELETE /api/orders/:id — cancel order', async () => {
    const res = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
