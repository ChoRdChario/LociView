import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Installation and tests share this project's dedicated browser cache.
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const args = process.argv[2] === '--install' ? ['install', 'chromium'] : ['test', ...process.argv.slice(2)];
const child = spawn(process.execPath, [cli, ...args], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, BASE_PATH: '/',
    LOCIVIEW_E2E_RUN: `${Date.now()}-${process.pid}`,
    PLAYWRIGHT_BROWSERS_PATH: fileURLToPath(new URL('../.artifacts/e2e/browsers', import.meta.url)) },
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
