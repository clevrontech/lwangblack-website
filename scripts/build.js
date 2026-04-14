'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT   = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  }
  return n;
}

// ── Create public/ FIRST (so it always exists even if later steps fail) ──────
console.log('\n===  Preparing public/ output directory  ===');
if (fs.existsSync(PUBLIC)) fs.rmSync(PUBLIC, { recursive: true, force: true });
ensureDir(PUBLIC);

// ── Build admin dashboard ────────────────────────────────────────────────────
const adminDashboardDir = path.join(ROOT, 'admin-dashboard');
const adminOutDir       = path.join(ROOT, 'admin');

if (fs.existsSync(path.join(adminDashboardDir, 'package.json'))) {
  try {
    console.log('\n===  Building admin dashboard  ===');
    run('npm --prefix admin-dashboard install --no-audit --no-fund');
    run('npm --prefix admin-dashboard run build');
    console.log('  Admin dashboard built successfully.');
  } catch (err) {
    console.error('\n  WARNING: Admin dashboard build failed:', err.message);
    console.error('  Will copy pre-built admin/ from git if available.\n');
  }
} else {
  console.log('\n  admin-dashboard/package.json not found — using pre-built admin/');
}

// ── Copy static storefront files into public/ ────────────────────────────────
console.log('\n===  Copying storefront files → public/  ===');

const STATIC_EXTS = new Set([
  '.html', '.css', '.js',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico',
  '.mp4', '.webm', '.mov',
  '.woff', '.woff2', '.ttf', '.eot',
  '.txt', '.xml',
]);

const COPY_DIRS = new Set(['images', 'fonts', 'icons', 'assets']);

const SKIP = new Set([
  'node_modules', '.git', '.github', 'backend', 'admin-dashboard',
  'admin', 'api', 'scripts', 'public',
  '.env', '.env.example', '.env.local', '.env.production',
  'package.json', 'package-lock.json', 'vercel.json',
  '.gitignore', '.vercelignore', '.node-version', '.nvmrc',
  'apply_clone.py', 'fetch_images.js',
]);

for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (SKIP.has(entry.name)) continue;

  const src  = path.join(ROOT, entry.name);
  const dest = path.join(PUBLIC, entry.name);

  if (entry.isDirectory()) {
    if (COPY_DIRS.has(entry.name)) {
      console.log(`  dir   ${entry.name}/`);
      copyDir(src, dest);
    }
  } else {
    const ext = path.extname(entry.name).toLowerCase();
    if (STATIC_EXTS.has(ext)) {
      console.log(`  file  ${entry.name}`);
      copyFile(src, dest);
    }
  }
}

// ── Copy built admin dashboard → public/admin/ ──────────────────────────────
if (fs.existsSync(adminOutDir)) {
  console.log('\n===  Copying admin dashboard → public/admin/  ===');
  copyDir(adminOutDir, path.join(PUBLIC, 'admin'));
  console.log('  Done.');
} else {
  console.warn('\n  WARNING: admin/ directory not found — admin dashboard will not be available');
}

// ── Verify ──────────────────────────────────────────────────────────────────
const total = countFiles(PUBLIC);
const hasIndex = fs.existsSync(path.join(PUBLIC, 'index.html'));
const hasAdmin = fs.existsSync(path.join(PUBLIC, 'admin', 'index.html'));

console.log(`\n===  Build complete  ===`);
console.log(`  Total files:   ${total}`);
console.log(`  index.html:    ${hasIndex ? 'OK' : 'MISSING!'}`);
console.log(`  admin/:        ${hasAdmin ? 'OK' : 'MISSING!'}`);

if (!hasIndex) {
  console.error('\nFATAL: public/index.html not found — build is broken');
  process.exit(1);
}

console.log('');
