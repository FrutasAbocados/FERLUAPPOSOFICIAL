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
          '**/vendor-recharts-*.js',
          '**/vendor-leaflet-*.js',
          // Stack PDF (jspdf + html2canvas-pro + canvg): solo se usa al exportar.
          // Sin grupo propio: separado de sus dependencias, rolldown generaba un
          // chunk que no evaluaba (export jspdf_es_min_exports inexistente).
          '**/jspdf.es.min-*.js',
          '**/html2canvas-pro.esm-*.js',
          '**/index.es-*.js',
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
      '@': path.resolve(import.meta.dirname, './src'),
      // jspdf importa html2canvas solo en .html() (que no usamos); el alias evita
      // bundlear html2canvas clásico + html2canvas-pro a la vez (~200KB duplicados).
      html2canvas: 'html2canvas-pro',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Grupos sin arrastrar dependencias: con manualChunks el bundler metía
        // React, clsx o el helper de preload dentro de vendor-leaflet/-recharts/-pdf
        // y el entry precargaba ~1,3 MB que solo se usan al abrir mapas, gráficos o PDF.
        // Tras cambiar grupos, comprobar que index.html no precarga ningún vendor-*.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'vendor-recharts', test: /node_modules[\\/](recharts|d3-|victory-vendor)/ },
            { name: 'vendor-leaflet', test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/ },
            { name: 'vendor-exceljs', test: /node_modules[\\/]exceljs[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5174,
  },
})
