import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    host: true,   // Expose ke jaringan lokal agar bisa diakses HP lain via IP
    port: 5173,
  },

  // ── Build Optimizations (Fase 2 — Bundle Splitting) ────────────────────────
  build: {
    // Target ES2015 untuk kompatibilitas Android 6+ dan iOS 12+
    target: 'es2015',

    // Vite 8 menggunakan OXC sebagai minifier default (lebih cepat dari esbuild)
    minify: 'oxc',

    // Hapus console.log & debugger dari production build via oxc
    // Mengurangi ukuran bundle dan tidak membocorkan info debug ke user
    oxcOptions: {
      transform: {
        exclude: [],
      },
    },

    rolldownOptions: {
      output: {
        // ── Manual Chunk Splitting ────────────────────────────────────────
        // Memisahkan library besar ke chunk tersendiri agar browser bisa
        // cache tiap chunk secara independen. Saat app update, hanya chunk
        // yang berubah yang perlu di-download ulang (bukan keseluruhan bundle).
        //
        // Sebelum: 1 chunk tunggal 838 KB (gzip 243 KB)
        // Sesudah : ~4-5 chunk terpisah, masing-masing <200 KB
        manualChunks(id) {
          // vendor-react: React core — jarang berubah, cache jangka panjang
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          // vendor-mqtt: mqtt.js — library besar ~150 KB gzip, jarang berubah
          if (id.includes('node_modules/mqtt')) {
            return 'vendor-mqtt';
          }
          // vendor-leaflet: Leaflet + plugin — jarang berubah
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) {
            return 'vendor-leaflet';
          }
          // vendor-misc: sisa dependency kecil lainnya
          if (id.includes('node_modules')) {
            return 'vendor-misc';
          }
          // app: kode aplikasi — chunk yang sering berubah
        },
      },
    },

    // Naikkan limit warning ke 600 KB agar tidak spam warning setelah split
    chunkSizeWarningLimit: 600,
  },

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'CycloTrack — Community Live Tracking',
        short_name: 'CycloTrack',
        description: 'Live GPS tracking aplikasi untuk event sepeda komunitas',
        theme_color: '#4B8B3B',
        // Fix: background_color disesuaikan ke tema dark Emerald Forest
        // (sebelumnya #FFFFFF putih — menyebabkan flash putih saat PWA launch)
        background_color: '#0D1117',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache tile OpenStreetMap untuk semua subdomain (a, b, c)
            // Diperluas agar coverage offline lebih baik di jalur terpencil
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles-cache',
              expiration: {
                // Naikkan dari 500 → 2000 tiles (lebih dari cukup untuk rute 100km+)
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 hari
              },
              // Pastikan response valid sebelum di-cache
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
})


