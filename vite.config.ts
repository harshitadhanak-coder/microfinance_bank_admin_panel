import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: Number(env.PORT || env.VITE_PORT) || 6002,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://57.129.128.58:6001/',
          changeOrigin: true,
          // Server-to-server hop: drop the browser Origin so the backend's
          // CORS allow-list (which only knows the public ports) never rejects
          // a same-origin request that came through this proxy.
          configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin')),
        },
      },
    },
  };
});
