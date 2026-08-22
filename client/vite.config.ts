import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// The dev API listens on IPv4 loopback. Using `localhost` can resolve to IPv6 on
// Windows, causing Vite's proxy to fail even while the server is healthy on 4822.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4822';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Personal Dashboard',
        short_name: 'Dashboard',
        description: 'Life, GitHub, and AI usage at a glance',
        display: 'standalone',
        background_color: '#05070d',
        theme_color: '#05070d',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    // Tailscale Serve forwards the dashboard's HTTPS hostname to this local dev server.
    // Vite otherwise rejects that Host header before the app or API proxy can respond.
    allowedHosts: ['desktop-endv2tl.tail619da5.ts.net'],
    proxy: {
      // Dev server only — kept on a different port than the launchd-managed production
      // `npm start` instance (4821) so a dev session never fights it for the port.
      '/api': apiProxyTarget,
    },
  },
});
