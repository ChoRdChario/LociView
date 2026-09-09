import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['poc/scene-history/journal.test.ts', 'poc/scene-history/journal-repo.test.ts', 'poc/scene-history/purposes.test.ts', 'poc/scene-history/development.test.ts', 'poc/scene-history/atomic-read.test.ts', 'poc/scene-history/development-source.test.ts', 'poc/scene-history/development-ack.test.ts'],
  fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000 } });
