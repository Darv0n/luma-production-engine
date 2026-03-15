import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createApiMiddleware, createLumaMiddleware, createPlatformMiddleware, createStorageMiddleware } from './src/server/proxy.js';

export default defineConfig(({ mode }) => {
  // Load .env file (all vars, not just VITE_-prefixed)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 5173,
      strictPort: true,
    },
    plugins: [
      react(),
      {
        name: 'luma-api-proxy',
        configureServer(server) {
          server.middlewares.use('/api', createApiMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use('/api/luma', createLumaMiddleware(env.LUMA_API_KEY));
          server.middlewares.use('/api/platform', createPlatformMiddleware());
          server.middlewares.use('/api/storage', createStorageMiddleware());
        },
      },
    ],
  };
});
