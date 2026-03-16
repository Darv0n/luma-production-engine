import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createApiMiddleware, createLumaMiddleware, createPlatformMiddleware, createStorageMiddleware, createAssemblyMiddleware, createDreamMiddleware, createAuteurMiddleware, createRealmsMiddleware, createWarRoomMiddleware } from './src/server/proxy.js';

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
          server.middlewares.use('/api/assembly', createAssemblyMiddleware());
          server.middlewares.use('/api/dream', createDreamMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use('/api/auteur', createAuteurMiddleware(env.ANTHROPIC_API_KEY));
          server.middlewares.use('/api/realms', createRealmsMiddleware());
          server.middlewares.use('/api/war-room', createWarRoomMiddleware(env.ANTHROPIC_API_KEY, env.GEMINI_API_KEY));
        },
      },
    ],
  };
});
