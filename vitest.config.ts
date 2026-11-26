import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@contract': fileURLToPath(new URL('./contract', import.meta.url)),
    },
  },
  test: {
    include: ['server/**/*.spec.ts', 'scripts/**/*.spec.ts', 'src/**/*.spec.ts'],
    environment: 'node',
  },
});
