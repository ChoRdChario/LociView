import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Installation and tests share this project's dedicated browser cache.
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const flags = process.argv.slice(2);
if (flags.includes('--record-trace') && flags.includes('--no-trace')) throw Error('Choose either --record-trace or --no-trace.');
const args = flags[0] === '--install' ? ['install', 'chromium'] : ['test', ...flags.filter(flag => !['--timings', '--record-trace', '--no-trace'].includes(flag))];
const child = spawn(process.execPath, [cli, ...args], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, BASE_PATH: '/',
    LOCIVIEW_E2E_RUN: `${Date.now()}-${process.pid}`,
    LOCIVIEW_E2E_TIMINGS: flags.includes('--timings') ? '1' : '0',
    LOCIVIEW_E2E_TRACE: flags.includes('--record-trace') ? '1' : '0',
    PLAYWRIGHT_BROWSERS_PATH: fileURLToPath(new URL('../.artifacts/e2e/browsers', import.meta.url)) },
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
