import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['poc/cas-io/*.test.ts'],
  fileParallelism: false, testTimeout: 180_000, hookTimeout: 30_000 } });
