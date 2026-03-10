import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/monroe-fishing-app/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Lake Monroe Bass Tracker',
        short_name: 'BassTracker',
        description: 'Personal fishing pattern tracker and AI advisor for Lake Monroe largemouth bass',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'open-meteo', expiration: { maxEntries: 20, maxAgeSeconds: 1800 } },
          },
          {
            urlPattern: /^https:\/\/api\.weather\.gov\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'weather-api', expiration: { maxEntries: 10, maxAgeSeconds: 3600 } },
          },
          {
            urlPattern: /^https:\/\/aa\.usno\.navy\.mil\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'usno-api', expiration: { maxEntries: 10, maxAgeSeconds: 3600 } },
          },
          {
            urlPattern: /^https:\/\/waterservices\.usgs\.gov\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'usgs-api', expiration: { maxEntries: 10, maxAgeSeconds: 3600 } },
          },
        ],
      },
    }),
  ],
})
