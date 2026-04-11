// ── Database Migration Runner ───────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    `postgres://${process.env.DB_USER || 'lwangblack'}:${process.env.DB_PASSWORD || 'lwangblack_secret'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'lwangblack'}`,
});

async function migrate() {
  const migrationDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`[Migrate] Found ${files.length} migration files`);

  for (const file of files) {
    const filePath = path.join(migrationDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`[Migrate] Running: ${file}...`);
    try {
      await pool.query(sql);
      console.log(`[Migrate] ✓ ${file} completed`);
    } catch (err) {
      console.error(`[Migrate] ✗ ${file} failed:`, err.message);
      // Don't break on duplicate errors (idempotent migrations)
      if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
        throw err;
      }
    }
  }

  console.log('[Migrate] All migrations complete');
  await pool.end();
}

migrate().catch(err => {
  console.error('[Migrate] Fatal error:', err);
  process.exit(1);
});
