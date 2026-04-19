'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT   = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function run(cmd, envMerge) {
  console.log(`\n> ${cmd}`);
  const opts = { stdio: 'inherit', cwd: ROOT };
  if (envMerge && Object.keys(envMerge).length) opts.env = { ...process.env, ...envMerge };
  execSync(cmd, opts);
}

/** Vite admin app: full backend origin (https://xxx.onrender.com). Derived from LWB_API_BASE if unset. */
function resolveViteApiUrlForAdmin() {
  const explicit = (process.env.VITE_API_URL || '').trim();
  if (explicit) return explicit;
  const lwb = (process.env.LWB_API_BASE || '').trim();
  if (!lwb) return '';
  try {
    return new URL(lwb.startsWith('http') ? lwb : `https://${lwb}`).origin;
  } catch {
    return '';
  }
}

function injectLwbApiBase() {
  let base = (process.env.LWB_API_BASE || '').trim().replace(/\/$/, '');
  if (!base) return;
  if (!base.endsWith('/api')) base = `${base.replace(/\/$/, '')}/api`;
  const file = path.join(PUBLIC, 'lwb-api.js');
  if (!fs.existsSync(file)) return;
  const needle = "var __LWB_BUILD_API_BASE__ = '';";
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(needle)) {
    console.warn('  WARNING: public/lwb-api.js missing __LWB_BUILD_API_BASE__ placeholder');
    return;
  }
  s = s.replace(needle, `var __LWB_BUILD_API_BASE__ = ${JSON.stringify(base)};`);
  fs.writeFileSync(file, s);
  console.log('\n===  Injected LWB_API_BASE into public/lwb-api.js  ===');
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
    const viteOrigin = resolveViteApiUrlForAdmin();
    const adminEnv = viteOrigin ? { VITE_API_URL: viteOrigin } : {};
    if (viteOrigin) console.log(`  VITE_API_URL → ${viteOrigin} (from env or LWB_API_BASE)`);
    run('npm --prefix admin-dashboard install --no-audit --no-fund', adminEnv);
    run('npm --prefix admin-dashboard run build', adminEnv);
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

injectLwbApiBase();
if (!(process.env.LWB_API_BASE || '').trim() && process.env.VERCEL) {
  console.warn('\n  NOTE: Set LWB_API_BASE in Vercel (e.g. https://YOUR-SERVICE.onrender.com/api) so the storefront hits Render.');
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
