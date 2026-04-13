const request = require('supertest');
const { app } = require('./setup');

describe('Products API', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'lwangblack2024' });
    token = res.body.token;
  });

  test('GET /api/products — list products (public)', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.products).toBeDefined();
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  test('GET /api/products/:id — get single product', async () => {
    const res = await request(app).get('/api/products/250g');

    expect(res.status).toBe(200);
    expect(res.body.product).toBeDefined();
    expect(res.body.product.name).toContain('250g');
  });

  test('GET /api/products/:id — 404 for missing product', async () => {
    const res = await request(app).get('/api/products/nonexistent');
    expect(res.status).toBe(404);
  });

  test('POST /api/products — create product', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Product',
        category: 'coffee',
        description: 'A test product',
        stock: 100,
      });

    expect(res.status).toBe(201);
    expect(res.body.productId).toBeDefined();
  });

  test('PUT /api/products/:id — update stock', async () => {
    const res = await request(app)
      .put('/api/products/test-product')
      .set('Authorization', `Bearer ${token}`)
      .send({ stock: 50 });

    expect(res.status).toBe(200);
  });

  test('GET /api/products?category=coffee — filter by category', async () => {
    const res = await request(app).get('/api/products?category=coffee');

    expect(res.status).toBe(200);
    expect(res.body.products.every(p => p.category === 'coffee')).toBe(true);
  });

  test('DELETE /api/products/:id — archive product', async () => {
    const res = await request(app)
      .delete('/api/products/test-product')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
