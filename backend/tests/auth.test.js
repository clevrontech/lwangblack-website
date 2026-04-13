const request = require('supertest');
const { app } = require('./setup');

describe('Auth API', () => {
  let token, refreshToken;

  test('POST /api/auth/login — valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'lwangblack2024' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('owner');
    token = res.body.token;
    refreshToken = res.body.refreshToken;
  });

  test('POST /api/auth/login — invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('GET /api/auth/verify — with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user || res.body.username).toBeDefined();
  });

  test('GET /api/auth/verify — without token', async () => {
    const res = await request(app).get('/api/auth/verify');
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/refresh — valid refresh token', async () => {
    if (!refreshToken) return;
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});
