import { defineConfig } from 'vitest/config';

// Configuration des tests, séparée de vite.config.ts pour ne pas charger l'API IA.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000, // lecture d'images de tablature
  },
});
