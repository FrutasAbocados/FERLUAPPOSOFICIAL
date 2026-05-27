import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globIgnores: [
          '**/vendor-excel-*.js',
          '**/vendor-exceljs-*.js',
          '**/vendor-xlsx-*.js',
          '**/vendor-recharts-*.js',
          '**/vendor-leaflet-*.js',
        ],
        // Bundle pasó de 2MB tras añadir Recharts + Gastos + Clientes (2026-05-06).
        // 5 MiB cubre con margen y evita romper el build de Vercel.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Abocados OS',
        short_name: 'Abocados',
        description: 'Operativa interna Frutas Abocados',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'vendor-recharts'
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet') || id.includes('node_modules/@react-leaflet')) return 'vendor-leaflet'
          if (id.includes('node_modules/exceljs')) return 'vendor-exceljs'
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx'
        },
      },
    },
  },
  server: {
    host: true,
    port: 5174,
  },
})
