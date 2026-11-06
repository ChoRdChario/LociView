import { chromium, expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import * as A from '@automerge/automerge';
import { ownedServer } from './server';
import { triangleGlb } from '../e2e/fixtures';
import { revealFileSurface, closeFileSurface, revealCoordinateAdd, revealOfflineUtilities } from '../e2e/workspaceUi';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { validationMetadataLimits } from '../../src/projectFiles/validation';

const title = '起動修復の記録';
async function prepared(page: Page) {
  await revealOfflineUtilities(page);
  await expect(page.getByRole('region', { name: 'オフライン利用', exact: true }).locator('[role="status"]'))
    .toContainText('アプリを保存しました。', { timeout: 90_000 });
}
async function selected(page: Page) {
  await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 180_000 });
  await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 180_000 });
}
async function backup(page: Page, info: TestInfo, name: string) {
  await revealFileSurface(page, '保存');
  const primary = page.getByRole('region', { name: 'ファイル', exact: true }).locator('.lv-file-primary');
  await expect(primary).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), primary.click()]);
  const path = info.outputPath(name + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull();
  await closeFileSurface(page);
  return BackupArchive.inspect(await openAsBlob(path), validationMetadataLimits);
}

for (const base of ['/', '/LociView/']) test(`same-build cold boot repairs missing and corrupt HTML/entryJS at ${base} without changing Project`, async ({}, info) => {
  A.getHeads(A.init());
  const artifact = `${process.env.LOCIVIEW_OFFLINE_BUILDS}/${base === '/' ? 'a' : 'subpath'}`;
  const server = await ownedServer(artifact, base), errors: string[] = [], stages: unknown[] = [];
  await mkdir('.artifacts/e2e/profiles', { recursive: true }); const profile = await mkdtemp('.artifacts/e2e/profiles/br-');
  let context: BrowserContext | undefined;
  async function launch(disconnected = false) {
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
      viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow', acceptDownloads: true, offline: disconnected });
    context.setDefaultTimeout(20_000);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    const p = context.pages()[0]!; p.on('pageerror', e => errors.push(e.message)); return p;
  }
  async function close() { await context?.close(); context = undefined; }
  try {
    let p = await launch(); await p.goto(server.url); await prepared(p);
    await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'original.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await p.getByLabel('プロジェクト名', { exact: true }).fill(title);
    await p.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click(); await selected(p);
    await revealCoordinateAdd(p); const model = p.getByLabel('追加先モデル', { exact: true }); await model.focus(); await model.selectOption({ label: 'original.glb' });
    await p.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    const position = p.getByRole('region', { name: '位置の調整', exact: true });
    for (const axis of ['X', 'Y', 'Z']) await position.getByLabel(`位置 ${axis}`, { exact: true }).fill('0');
    await position.getByRole('button', { name: '位置を確定', exact: true }).click();
    const detail = () => p.getByRole('region', { name: 'キャプションの詳細', exact: true });
    await detail().getByLabel('本文', { exact: true }).fill('修復前の本文と原本を保持'); await detail().getByRole('button', { name: '変更を適用', exact: true }).click();
    await expect(p.getByText('変更を適用しました。', { exact: true })).toBeVisible();
    const before = await backup(p, info, 'before-repair'), direct = p.url();
    const entry = await p.locator('script[type="module"][src]').first().getAttribute('src'); expect(entry).toBeTruthy();
    const entryUrl = new URL(entry!, server.url).href;
    await p.evaluate(async () => { await (await caches.open('unrelated-preserve')).put('/sentinel', new Response('do not change')); });
    // The initial install never forcibly controls its first page. Full close activates it normally.
    await close(); p = await launch(); await p.goto(direct); await selected(p);
    expect(await p.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    for (const [target, mode] of [['index', 'missing'], ['index', 'corrupt'], ['entry', 'missing'], ['entry', 'corrupt']] as const) {
      const wanted = target === 'index' ? new URL('index.html', server.url).href : entryUrl;
      const damaged = await p.evaluate(async ({ wanted, mode }) => {
        const names = (await caches.keys()).filter(n => n.startsWith('lociview-desktop-offline-1:'));
        if (names.length !== 1) throw Error('Expected one owned build cache');
        const cache = await caches.open(names[0]!), key = (await cache.keys()).find(r => new URL(r.url).pathname === new URL(wanted).pathname);
        if (!key) throw Error('Exact resource key missing');
        const original = await cache.match(key); if (!original) throw Error('Missing original resource');
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await original.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (mode === 'missing') await cache.delete(key); else await cache.put(key, new Response('wrong cached build bytes'));
        return { cache: names[0]!, key: key.url, hash };
      }, { wanted, mode });
      await close(); await server.stop();
      if (target === 'index' && mode === 'missing') {
        p = await launch(true);
        await expect(p.goto(direct)).rejects.toThrow(/net::ERR_/); expect(await p.locator('.lv-project-workspace').count()).toBe(0);
        await close(); stages.push({ target, mode, offlineRejected: true });
      }
      await server.start();
      const faults = target === 'index' && mode === 'missing' ? ['wrong', 'redirect'] as const : target === 'entry' && mode === 'corrupt' ? ['wrong'] as const : [];
      for (const fault of faults) {
        const relative = '/' + new URL(wanted).pathname.slice(base.length);
        server.setFault(path => path === relative ? fault : undefined);
        p = await launch();
        const failure = p.waitForEvent('requestfailed', { predicate: request => target === 'index' ? request.isNavigationRequest() : request.url() === wanted });
        await p.goto(direct).catch(error => { if (!/net::ERR_/.test(String(error))) throw error; });
        expect((await failure).failure()?.errorText).toMatch(/net::ERR_/);
        expect(await p.locator('.lv-project-workspace').count()).toBe(0);
        await close(); server.setFault(undefined); await server.stop(); await server.start();
        if (fault === 'redirect') expect(server.requests).not.toContain('/should-not-follow');
        stages.push({ target, mode, refusedNetwork: fault });
      }
      const at = Date.now(); p = await launch();
      const [entryResponse, mainResponse] = await Promise.all([
        target === 'entry' ? p.waitForResponse(response => response.url() === wanted) : Promise.resolve(undefined), p.goto(direct),
      ]);
      expect(mainResponse?.fromServiceWorker()).toBe(true);
      if (target === 'entry') expect(entryResponse?.fromServiceWorker()).toBe(true);
      await selected(p);
      await p.locator('.lv-caption-select').first().click();
      await expect(detail().getByLabel('本文', { exact: true })).toHaveValue('修復前の本文と原本を保持');
      const restored = await p.evaluate(async damaged => {
        const response = await (await caches.open(damaged.cache)).match(damaged.key); if (!response) return null;
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
      }, damaged);
      expect(restored).toBe(damaged.hash);
      stages.push({ target, mode, recoveredMs: Date.now() - at, fromServiceWorker: true, cacheHashRestored: true });
      expect(await p.evaluate(async () => (await (await caches.open('unrelated-preserve')).match('/sentinel'))!.text())).toBe('do not change');
    }
    const after = await backup(p, info, 'after-repair');
    expect(after.source.proof).toEqual(before.source.proof); expect(after.source.originalChanges()).toEqual(before.source.originalChanges());
    expect(after.archive.control.manifest.blobs).toEqual(before.archive.control.manifest.blobs);
    expect(errors).toEqual([]); await p.screenshot({ path: info.outputPath('recovered.png') });
  } finally {
    await writeFile(info.outputPath('boot-repair.json'), JSON.stringify({ base, stages, errors, browserAndServerClosed: true }, null, 2));
    await close(); await server.stop();
  }
});

test('two controlled windows share one exact resource repair while state inspection stays readonly', async ({}, info) => {
  const server = await ownedServer(`${process.env.LOCIVIEW_OFFLINE_BUILDS}/a`);
  await mkdir('.artifacts/e2e/profiles', { recursive: true }); const profile = await mkdtemp('.artifacts/e2e/profiles/br-');
  let context: BrowserContext | undefined, release: (() => void) | undefined;
  let first: Promise<string> | undefined, second: Promise<string> | undefined;
  const requests: string[] = [];
  async function launch() {
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
      viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
    context.setDefaultTimeout(20_000); return context.pages()[0]!;
  }
  try {
    let a = await launch(); await a.goto(server.url); await prepared(a); await context!.close(); context = undefined;
    a = await launch(); await a.goto(server.url); const b = await context!.newPage(); await b.goto(server.url);
    for (const page of [a, b]) {
      await revealOfflineUtilities(page);
      await expect(page.getByRole('region', { name: 'オフライン利用', exact: true }).locator('[role="status"]'))
        .toContainText('オフラインで起動できます', { timeout: 90_000 });
    }
    expect(await a.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const target = await a.evaluate(async () => {
      const names = (await caches.keys()).filter(n => n.startsWith('lociview-desktop-offline-1:')); if (names.length !== 1) throw Error('Expected owned build');
      const cache = await caches.open(names[0]!), key = (await cache.keys()).find(r => new URL(r.url).pathname.endsWith('/offline-icons/icon-192.png'))!;
      const original = (await cache.match(key))!, hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await original.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
      await cache.put(key, new Response('bad cached image')); const url = new URL(key.url); url.search = ''; return { url: url.href, hash };
    });
    let enter!: () => void; const entered = new Promise<void>(yes => { enter = yes; });
    const held = new Promise<void>(yes => { release = yes; }), path = new URL(target.url).pathname;
    server.setGate(async current => { if (current === path) { requests.push(current); enter(); await held; } });
    const digest = async (url: string) => {
      const response = await fetch(url); if (!response.ok) throw Error('Resource refused');
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
    };
    first = a.evaluate(digest, target.url); void first.catch(() => {}); await entered;
    const secondStarted = b.waitForRequest(request => request.url() === target.url);
    second = b.evaluate(digest, target.url); void second.catch(() => {}); await secondStarted;
    const checked = await b.evaluate(() => new Promise<boolean>(resolve => {
      const channel = new MessageChannel(); channel.port1.onmessage = event => { channel.port1.close(); resolve(event.data.complete); };
      navigator.serviceWorker.controller!.postMessage('lociview-desktop-offline-state-1', [channel.port2]);
    }));
    expect(checked).toBe(false); expect(requests).toEqual([path]);
    release!(); expect(await first).toBe(target.hash); expect(await second).toBe(target.hash); expect(requests).toEqual([path]);
    await writeFile(info.outputPath('parallel-repair.json'), JSON.stringify({ repairRequests: requests.length, independentBodies: true, stateCheckFetched: false }, null, 2));
  } finally {
    release?.(); await Promise.allSettled([first, second]); await context?.close(); await server.stop();
  }
});
