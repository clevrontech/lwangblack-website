import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Dev-only: opening http://localhost:5173/ or /admin (no slash) often shows a blank page; send users to the SPA. */
function adminDevEntryRedirect() {
  return {
    name: 'admin-dev-entry-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = req.url?.split('?')[0] || ''
        if (pathOnly === '/' || pathOnly === '/index.html') {
          res.statusCode = 302
          res.setHeader('Location', '/admin/')
          res.end()
          return
        }
        if (pathOnly === '/admin') {
          res.statusCode = 302
          res.setHeader('Location', '/admin/')
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  base: '/admin/',
  plugins: [adminDevEntryRedirect(), react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Lwang API — use 3010 in dev so port 3001 can be another app (e.g. a different Node service).
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3010',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../admin',
    emptyOutDir: true,
  },
})
