import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createApi } from './server/api.mjs'

/**
 * Mounts the local database API inside the dev server, so `npm run dev` reads
 * and writes the very same `data/` folder as the offline production server.
 */
const localDatabase = (): Plugin => ({
  name: 'altech-local-database',
  configureServer(server) {
    const { handle, db } = createApi({ dataDir: path.resolve(__dirname, 'data') })
    server.middlewares.use((req, res, next) => {
      handle(req, res, next)
    })
    server.httpServer?.on('close', () => db.close())
  },
  configurePreviewServer(server) {
    const { handle } = createApi({ dataDir: path.resolve(__dirname, 'data') })
    server.middlewares.use((req, res, next) => {
      handle(req, res, next)
    })
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localDatabase()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // `host: true` exposes the app on the local network so the phone can open
  // the /scan/<session> page shown by the POS QR code.
  server: { host: true, port: 5175, watch: { ignored: ['**/data/**'] } },
  preview: { host: true, port: 5175 },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          vendor: ['date-fns', 'jsbarcode', 'html2canvas', 'react-to-print', 'zustand'],
        },
      },
    },
  },
})
