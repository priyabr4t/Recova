import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'

// Single source of truth for the API port is backend/.env (PORT=...). Read it
// so the dev proxy always agrees with the backend, whatever port it sits on.
const backendEnv = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8')
const apiPort = backendEnv.match(/^PORT=(\d+)$/m)?.[1] ?? '8080'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // The frontend calls these prefixes directly (no /api prefix in lib/api.ts),
    // so each API route family is proxied explicitly.
    proxy: Object.fromEntries(
      ['/summary', '/recovery', '/simulation', '/health', '/webhooks'].map((p) => [
        p,
        { target: `http://localhost:${apiPort}`, changeOrigin: true },
      ]),
    ),
  },
  build: {
    outDir: '../backend/dist-frontend',
    emptyOutDir: true,
  },
})
