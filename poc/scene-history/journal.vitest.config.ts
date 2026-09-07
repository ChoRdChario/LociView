import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['poc/scene-history/journal.test.ts'],
  fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000 } });
