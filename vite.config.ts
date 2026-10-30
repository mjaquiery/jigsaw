import { defineConfig } from 'vitest/config';
import { serviceWorker } from './build/service-worker';

export default defineConfig({
  // Relative paths so the same build works at the site root and in stage/.
  base: './',
  plugins: [serviceWorker()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
  },
});
