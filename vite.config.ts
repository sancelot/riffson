import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createAiMiddleware } from './server/ai-api.mjs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Les clés restent côté serveur : jamais injectées dans le bundle (pas de `define`)
    const aiApi = createAiMiddleware(env);
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'ai-api',
          configureServer(server) { server.middlewares.use(aiApi); },
          configurePreviewServer(server) { server.middlewares.use(aiApi); },
        },
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
