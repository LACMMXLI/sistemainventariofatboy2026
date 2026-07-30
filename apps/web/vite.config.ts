import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icon-180.png", "brand-fatboy.png", "products/*.png"],
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
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: "NetworkOnly"
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
