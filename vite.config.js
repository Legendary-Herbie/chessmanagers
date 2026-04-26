import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const API_TARGET = env.VITE_API_URL

  return {
    plugins: [react()],

    // ── Dev server ──────────────────────────────────────────────
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/v1/, ''),
        },
      },
    },

    // ── Build ───────────────────────────────────────────────────
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      minify: mode === 'production' ? 'esbuild' : false,
    },

    // ── Env exposure ────────────────────────────────────────────
    define: {
      __APP_ENV__: JSON.stringify(mode),
    },
  }
})