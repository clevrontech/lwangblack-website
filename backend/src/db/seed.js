const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const connectionString =
  process.env.DATABASE_URL ||
  `postgres://${process.env.DB_USER || 'lwangblack'}:${process.env.DB_PASSWORD || 'lwangblack_secret'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'lwangblack'}`;

const pool = new Pool({ connectionString });

const resetRequested =
  process.argv.includes('--reset') ||
  String(process.env.SEED_RESET || '').toLowerCase() === 'true';

const seedFile = path.join(__dirname, 'migrations', '002_seed.sql');

async function seed() {
  if (!fs.existsSync(seedFile)) {
    throw new Error(`Seed file not found: ${seedFile}`);
  }

  const sql = fs.readFileSync(seedFile, 'utf8');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (resetRequested) {
      console.log('[Seed] Reset requested; truncating seeded tables...');
      await client.query(`
        TRUNCATE TABLE
          transactions,
          orders,
          customers,
          products,
          admin_users,
          settings
        RESTART IDENTITY CASCADE
      `);
    }

    console.log('[Seed] Applying seed SQL...');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[Seed] Seed completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[Seed] Failed:', err.message);
  process.exit(1);
});
