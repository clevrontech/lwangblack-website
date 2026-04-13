# Lwang Black — Admin Dashboard (Vite + React)

This admin dashboard talks to the backend API under `../backend` via `/api/*`.

## Run locally (recommended)

Start the backend (API on `http://localhost:3001`):

```bash
cd ../backend
npm run dev
```

Start the admin dashboard (Vite on `http://localhost:5173`):

```bash
cd ../admin-dashboard
npm run dev
```

## Demo login (works without Postgres)

The backend automatically falls back to an in-memory demo database if Postgres isn't available.

- **username**: `owner`
- **password**: `lwangblack2024`

## Notes

- The Vite dev server proxies `/api` to `http://localhost:3001` (see `vite.config.js`).
- If you build the dashboard (`npm run build`), the backend serves it at `/admin` when running.
