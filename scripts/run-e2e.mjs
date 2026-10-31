import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

// Installation and tests share this project's dedicated browser cache.
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const flags = process.argv.slice(2);
// The Desktop lane must never bind or navigate the user's existing 4182 preview.
// Reserve a free loopback port, then let Playwright's strict owned server bind it.
// A collision fails the run rather than reusing another process's server.
const desktop = flags.some(flag => flag.endsWith('playwright.desktop.config.ts'));
let desktopOrigin;
if (desktop) {
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  desktopOrigin = `http://127.0.0.1:${reservation.address().port}`;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  if (desktopOrigin.endsWith(':4182')) throw Error('The personal preview port is reserved; no Desktop test was started.');
}
if (flags.includes('--record-trace') && flags.includes('--no-trace')) throw Error('Choose either --record-trace or --no-trace.');
const args = flags[0] === '--install' ? ['install', 'chromium'] : ['test', ...flags.filter(flag => !['--timings', '--record-trace', '--no-trace'].includes(flag))];
const child = spawn(process.execPath, [cli, ...args], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, BASE_PATH: '/',
    ...(desktopOrigin ? { LOCIVIEW_DESKTOP_E2E_ORIGIN: desktopOrigin } : {}),
    LOCIVIEW_E2E_RUN: `${Date.now()}-${process.pid}`,
    LOCIVIEW_E2E_TIMINGS: flags.includes('--timings') ? '1' : '0',
    LOCIVIEW_E2E_TRACE: flags.includes('--record-trace') ? '1' : '0',
    PLAYWRIGHT_BROWSERS_PATH: fileURLToPath(new URL('../.artifacts/e2e/browsers', import.meta.url)) },
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
