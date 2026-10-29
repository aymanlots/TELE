import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'vite-suppress-hmr-client-error',
        transformIndexHtml: {
          order: 'pre',
          handler() {
            return [
              {
                tag: 'script',
                attrs: {},
                children: `
(function() {
  try {
    var origErr = console.error;
    console.error = function() {
      for (var i = 0; i < arguments.length; i++) {
        var str = (arguments[i] && (arguments[i].message || arguments[i].stack || String(arguments[i]))) || '';
        if (str.indexOf('WebSocket') !== -1 || str.indexOf('[vite]') !== -1) return;
      }
      return origErr.apply(console, arguments);
    };
    if (typeof window !== 'undefined' && window.WebSocket) {
      var NativeWS = window.WebSocket;
      window.WebSocket = function(url, protocols) {
        if (protocols === 'vite-hmr' || (Array.isArray(protocols) && protocols.indexOf('vite-hmr') !== -1) || String(url).indexOf('vite-hmr') !== -1) {
          return {
            readyState: 3,
            url: String(url),
            bufferedAmount: 0,
            extensions: '',
            protocol: 'vite-hmr',
            binaryType: 'blob',
            onopen: null,
            onclose: null,
            onerror: null,
            onmessage: null,
            addEventListener: function(type, listener) {
              if (type === 'close') {
                setTimeout(function() {
                  try { listener({ wasClean: true, code: 1000, reason: 'HMR disabled' }); } catch (e) {}
                }, 0);
              }
            },
            removeEventListener: function() {},
            dispatchEvent: function() { return false; },
            send: function() {},
            close: function() {},
          };
        }
        return new NativeWS(url, protocols);
      };
      window.WebSocket.prototype = NativeWS.prototype;
    }
  } catch (e) {}
})();`,
                injectTo: 'head-prepend',
              },
            ];
          },
        },
      },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'shop-bg.jpg',
        ],
        manifest: {
          id: '/',
          name: 'Golden Shop Manager',
          short_name: 'GoldenShop',
          description: 'Shop management system for phone & electronics store in Morocco',
          theme_color: '#D4AF37',
          background_color: '#121214',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/assets/aistudio/image_e43ac3cd.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: '/assets/aistudio/image_e43ac3cd.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
      watch: null,
    },
  };
});
