import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createApiMiddleware } from './src/server/proxy.js';

export default defineConfig(({ mode }) => {
  // Load .env file (all vars, not just VITE_-prefixed)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'luma-api-proxy',
        configureServer(server) {
          server.middlewares.use('/api', createApiMiddleware(env.ANTHROPIC_API_KEY));
        },
      },
    ],
  };
});
