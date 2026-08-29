import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const API_TARGET = env.VITE_API_URL || 'http://localhost:5000'
  const ASSET_TARGET = API_TARGET.replace(/\/api\/v1\/?$/, '')

  return {
    plugins: [react()],

    // ── Dev server ────────────────────────────────────────────────────────────
    server: {
      port: 3000,
      proxy: {
        '/api/v1': {
          target: API_TARGET,
          changeOrigin: true,
          // Preserve OAuth 302 responses so the browser navigates to Google.
          followRedirects: false,
          ws: false,
        },
        '/uploads': {
          target: ASSET_TARGET,
          changeOrigin: true,
          followRedirects: false,
        },
      },
    },

    // ── Build ─────────────────────────────────────────────────────────────────
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      minify: mode === 'production' ? 'esbuild' : false,
    },

    // ── Env exposure ───────────────────────────────────────────────────────────
    define: {
      __APP_ENV__: JSON.stringify(mode),
    },
  }
})
