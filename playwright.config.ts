import { defineConfig } from '@playwright/test';

const run = process.env.LOCIVIEW_E2E_RUN ?? `${Date.now()}-${process.pid}`;
if (!/^\d+-\d+$/.test(run)) throw Error('Invalid E2E run identifier');
const artifacts = `.artifacts/e2e/runs/${run}`;
export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.spec.ts',
  testIgnore: '**/normal-three-compat.spec.ts',
  fullyParallel: false, workers: 1, retries: 0,
  // Functional diagnostics only; these deadlines are not latency acceptance.
  timeout: 360_000, expect: { timeout: 15_000 },
  outputDir: `${artifacts}/results`,
  reporter: [['list'], ['html', { outputFolder: `${artifacts}/report`, open: 'never' }],
    ['json', { outputFile: `${artifacts}/result.json` }]],
  use: { baseURL: 'http://127.0.0.1:4182' },
  webServer: {
    command: 'npm run build:validation && npm run preview:validation',
    url: 'http://127.0.0.1:4182/dev.html',
    reuseExistingServer: false, timeout: 120_000,
    stdout: 'pipe', stderr: 'pipe',
  },
});
