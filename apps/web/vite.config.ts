import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": la versión nueva se descarga en segundo plano pero no
      // desplaza al usuario a media captura; se avisa y él decide cuándo.
      registerType: "prompt",
      includeAssets: ["icon-180.png"],
      manifest: {
        name: "FATBOY Sistema de Inventario",
        short_name: "FATBOY",
        description: "Inventario, conteo y distribución entre sucursales FATBOY",
        theme_color: "#08090d",
        background_color: "#08090d",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        // El API nunca debe resolverse desde el service worker.
        navigateFallbackDenylist: [/^\/api\//],
        // Al publicar una versión, los cachés de las anteriores se borran.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // El código de la aplicación queda en caché desde la primera visita:
        // las aperturas siguientes cargan del disco y no de la red. Las fotos
        // de producto no van aquí, se guardan conforme se ven (regla de abajo)
        // para no descargar catálogo completo en el primer arranque.
        globPatterns: ["**/*.{js,css,html,webmanifest,woff,woff2}", "icon-192.png"],
        runtimeCaching: [
          {
            // Inventario, conteos y stock siempre del servidor: son datos vivos.
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: "NetworkOnly"
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "fatboy-tipografias",
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Fotos de producto: se muestran al instante y se refrescan detrás.
            urlPattern: /\.(?:png|jpg|jpeg|webp|avif|gif|svg)$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "fatboy-imagenes",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": "http://localhost:3000"
    }
  },
  build: {
    outDir: "dist"
  }
});
