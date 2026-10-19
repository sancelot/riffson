import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createGeminiMiddleware } from './server/gemini-api.mjs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // La clé reste côté serveur : elle n'est plus injectée dans le bundle (plus de `define`)
    const geminiApi = createGeminiMiddleware(env.GEMINI_API_KEY);
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'gemini-api',
          configureServer(server) { server.middlewares.use(geminiApi); },
          configurePreviewServer(server) { server.middlewares.use(geminiApi); },
        },
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
