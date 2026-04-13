const request = require('supertest');
const { app } = require('./setup');

describe('Logistics API', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'lwangblack2024' });
    token = res.body.token;
  });

  test('GET /api/logistics/carriers — list carriers', async () => {
    const res = await request(app)
      .get('/api/logistics/carriers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.carriers).toBeDefined();
    const ids = res.body.carriers.map(c => c.id);
    expect(ids).toContain('dhl');
    expect(ids).toContain('shippo');
    expect(ids).toContain('sajilo');
    expect(ids).toContain('aramex');
  });

  test('GET /api/logistics/zones — list delivery zones', async () => {
    const res = await request(app)
      .get('/api/logistics/zones')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.zones).toBeDefined();
    const nepal = res.body.zones.find(z => z.country === 'NP' && z.region === 'Kathmandu');
    expect(nepal).toBeDefined();
    expect(parseFloat(nepal.shipping_cost)).toBe(0);
  });

  test('POST /api/logistics/shipping-cost — Nepal Kathmandu free', async () => {
    const res = await request(app)
      .post('/api/logistics/shipping-cost')
      .set('Authorization', `Bearer ${token}`)
      .send({ country: 'NP', region: 'Kathmandu', orderTotal: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.shipping).toBe(0);
  });

  test('POST /api/logistics/shipping-cost — Australia paid', async () => {
    const res = await request(app)
      .post('/api/logistics/shipping-cost')
      .set('Authorization', `Bearer ${token}`)
      .send({ country: 'AU', orderTotal: 30 });

    expect(res.status).toBe(200);
    expect(res.body.shipping).toBeGreaterThan(0);
  });

  test('POST /api/logistics/shipping-cost — Australia free above threshold', async () => {
    const res = await request(app)
      .post('/api/logistics/shipping-cost')
      .set('Authorization', `Bearer ${token}`)
      .send({ country: 'AU', orderTotal: 100 });

    expect(res.status).toBe(200);
    expect(res.body.shipping).toBe(0);
  });

  test('POST /api/logistics/rates — get rates', async () => {
    const res = await request(app)
      .post('/api/logistics/rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ toCountry: 'AU', weight: 0.5 });

    expect(res.status).toBe(200);
    expect(res.body.rates).toBeDefined();
    expect(res.body.rates.length).toBeGreaterThan(0);
  });

  test('POST /api/logistics/rates — Nepal local couriers', async () => {
    const res = await request(app)
      .post('/api/logistics/rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ toCountry: 'NP' });

    expect(res.status).toBe(200);
    const localRate = res.body.rates.find(r => r.carrierId === 'local');
    expect(localRate).toBeDefined();
    expect(localRate.price).toBe(0);
  });

  test('POST /api/logistics/create-shipment — create', async () => {
    const res = await request(app)
      .post('/api/logistics/create-shipment')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: 'LB-2449', carrierId: 'dhl' });

    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBeDefined();
    expect(res.body.success).toBe(true);
  });

  test('POST /api/logistics/track — track shipment', async () => {
    const res = await request(app)
      .post('/api/logistics/track')
      .set('Authorization', `Bearer ${token}`)
      .send({ trackingNumber: 'DHL123456', carrierId: 'dhl' });

    expect(res.status).toBe(200);
    expect(res.body.tracking).toBeDefined();
    expect(res.body.tracking.number).toBe('DHL123456');
  });
});
