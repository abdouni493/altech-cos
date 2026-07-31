import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    // `host: true` exposes the app on the local network so the phone can open
    // the /scan/<session> page shown by the POS QR code.
    server: { host: true, port: 5175 },
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
});
