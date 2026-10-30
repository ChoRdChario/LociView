import { beginSceneCreation, revealModelManagement, lookAlongFront, revealCaptionList } from './workspaceUi';
import { test, expect, chromium, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as Automerge from '@automerge/automerge';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { PackageArchive } from '../../src/projectPackage/zipArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import type { PreparedJournal } from '../../src/projectMetadata/journal';
import { triangleGlb, smallPng } from './fixtures';

const entry = `http://127.0.0.1:4182/dev.html?editor=project${process.env.LOCIVIEW_E2E_TIMINGS === '1' ? '&timings=1' : ''}`;
const title = 'モデルを引き継ぐプロジェクト', captionTitle = '位置を見直す記録', localBody = 'Bの現地で追記した本文';
const mergedBody = `${localBody}。Aの復旧後の追記。Bの二巡目の追記`, finalBody = `${mergedBody}。元の記録に追記`;
const originalTitle = '位置を見直した元の記録', copyTitle = '別々に残した記録', copyBody = 'Bが独立した記録に追記した本文', copyAlt = '独立した記録の画像説明';
const fileTimeout = 180_000, actionTimeout = 90_000;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const blob = async (path: string) => new Blob([new Uint8Array(await readFile(path)).buffer]);
const originals = (source: { originalChanges(): Uint8Array[] }) => source.originalChanges().map(bytes => [sha(bytes), Buffer.from(bytes).toString('hex')]).sort((a, b) => a[0]!.localeCompare(b[0]!));
const detail = (page: Page) => page.getByRole('region', { name: 'キャプションの詳細', exact: true });
const models = (page: Page) => page.getByRole('tabpanel', { name: 'モデル', exact: true });
const pinArea = (page: Page) => page.getByRole('region', { name: 'ピンの操作', exact: true });
const marker = (page: Page) => page.locator('.lv-project-marker');

async function chooseCaption(page: Page, name = captionTitle) {
  await revealCaptionList(page);
  await page.getByRole('tab', { name: 'キャプション', exact: true }).click();
  await page.getByRole('list', { name: 'キャプション一覧', exact: true }).locator('.lv-caption-select').filter({ hasText: name }).click();
}
async function edit(page: Page, body: string) {
  await detail(page).getByLabel('本文', { exact: true }).fill(body);
  await detail(page).getByRole('button', { name: '変更を適用', exact: true }).click();
  await expect(page.getByText('変更を適用しました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
}
async function image(page: Page, name: string, buffer: Buffer) {
  const picker = page.waitForEvent('filechooser'); await page.getByLabel('メディアを追加', { exact: true }).click();
  await (await picker).setFiles({ name, mimeType: 'image/png', buffer });
  await expect(page.getByText('メディアを追加しました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
}
async function checkImages(page: Page, count: number) {
  const images = page.getByRole('region', { name: '画像の整理', exact: true }).locator('img');
  await expect(images).toHaveCount(count);
  for (const item of await images.all()) await expect.poll(() => item.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth)).toBe(2);
}
async function download(page: Page, info: TestInfo, name: string, purpose: 'backup' | 'teamWorkspace' | 'contribution', base?: string) {
  const files = page.getByRole('region', { name: 'ファイル', exact: true });
  await files.getByRole('button', { name: purpose === 'backup' ? '保存' : '相手に渡す', exact: true }).click();
  if (purpose === 'backup') await files.getByLabel('名前（任意）', { exact: true }).fill(name);
  else {
    await files.getByLabel('渡す内容', { exact: true }).selectOption(purpose);
    if (purpose === 'contribution') {
      expect(base).toBeTruthy(); await files.getByLabel('元にする作業一式', { exact: true }).selectOption(base!);
      await expect(files.getByLabel('元にする作業一式', { exact: true })).toHaveValue(base!);
    }
  }
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: fileTimeout }),
    files.getByRole('button', { name: purpose === 'backup' ? 'ファイルに保存' : 'ダウンロード', exact: true }).click()]);
  const path = info.outputPath(`${name}.zip`); await file.saveAs(path); expect(await file.failure()).toBeNull();
  await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: fileTimeout }); return path;
}
async function receive(page: Page, path: string) {
  const region = page.getByRole('region', { name: '更新ファイル', exact: true });
  await region.getByLabel('更新ファイルを選択', { exact: true }).setInputFiles(path);
  await expect(region.getByText('更新を受け取りました。', { exact: true })).toBeHidden();
  await region.getByRole('button', { name: '更新を受け取る', exact: true }).click();
  await expect(region.getByText('更新を受け取りました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
}
async function inspect(path: string) {
  const backup = await BackupArchive.inspect(await blob(path), validationMetadataLimits);
  const inspected = await inspectProjectCandidates(backup.source.read(), validationMetadataLimits);
  if (inspected.kind !== 'project-candidate-inspection') throw Error('backup metadata rejected');
  return { backup, records: inspected.unambiguousRecords as Record<string, any>, history: originals(backup.source) };
}

test('差し替えと受信の中断を元のファイルから復旧し、手元の記録・ピンを保って二巡目も返せる', async ({}, info) => {
  test.setTimeout(900_000); Automerge.getHeads(Automerge.init());
  const root = info.outputPath('profiles'); await mkdir(root, { recursive: true });
  const profiles = { A: await mkdtemp(join(root, 'model-A-')), B: await mkdtemp(join(root, 'model-B-')) };
  const contexts = new Map<string, BrowserContext>(), errors: string[] = [], stages: Record<string, number> = {};
  const tracing = process.env.LOCIVIEW_E2E_TRACE !== '0', evidence: Record<string, unknown> = { stages };
  const oldGlb = triangleGlb(), newGlb = triangleGlb(0.5), png = smallPng(), localPng = smallPng(180);
  expect(sha(oldGlb)).not.toBe(sha(newGlb));
  const launch = async (who: 'A' | 'B') => {
    const context = await chromium.launchPersistentContext(profiles[who], { channel: 'chromium', headless: true,
      viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
    contexts.set(who, context); context.setDefaultTimeout(15_000);
    await context.route('**/*', route => { const url = new URL(route.request().url());
      return url.origin === new URL(entry).origin || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient'); });
    if (tracing) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = context.pages()[0] ?? await context.newPage(); page.on('pageerror', error => errors.push(`${who}: ${error.message}`));
    await page.goto(entry); return page;
  };
  const close = async (who: string) => {
    const context = contexts.get(who); if (!context) return; contexts.delete(who);
    try {
      for (const page of context.pages()) {
        const measures = await page.evaluate(async () => { document.dispatchEvent(new Event('lociview-timing-snapshot'));
          return { locks: await navigator.locks.query(), measures: performance.getEntriesByType('measure').filter(e => e.name.startsWith('lociview.')).map(e => ({ name: e.name, duration: e.duration, detail: (e as PerformanceMeasure).detail })) }; });
        await info.attach(`${who} 終了前の計測`, { body: JSON.stringify(measures), contentType: 'application/json' });
      }
      if (tracing) await context.tracing.stop({ path: info.outputPath(`${who}-${Date.now()}-trace.zip`) });
    } finally { await context.close(); }
  };
  const step = async (name: string, action: () => Promise<void>) => {
    const start = performance.now(); try { await test.step(name, action); }
    finally { stages[name] = Math.round(performance.now() - start); console.info(`${name}: ${stages[name]}ms`); }
  };
  let failed = false;
  try {
    let a = await launch('A'), b = await launch('B');
    const html = await a.request.get('http://127.0.0.1:4182/dev.html'); expect(sha(await html.body())).toBe(sha(await readFile('validation-dist/dev.html')));
    await info.attach('実行環境', { body: JSON.stringify({ browser: contexts.get('A')!.browser()!.version(), node: process.version,
      platform: process.platform, tracing, headless: true, route: entry, independentProfiles: profiles.A !== profiles.B,
      assets: await Promise.all((await readdir('validation-dist/assets')).map(async name => ({ name, sha256: sha(await readFile(join('validation-dist/assets', name))) }))) }), contentType: 'application/json' });
    let initialWorkspacePath = '', primaryScene = '';
    let base!: Awaited<ReturnType<typeof WorkspaceArchive.inspect>>, initialRecords!: Record<string, any>, originalColor = '';
    await step('配置済みモデルを二つのシーンで共有し、Bが作業一式を開く', async () => {
      await a.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'original.glb', mimeType: 'model/gltf-binary', buffer: oldGlb });
      await a.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await a.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill(title);
      await a.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click(); await expect(a.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title);
      await a.getByText('数値で配置', { exact: true }).click(); const target = a.getByLabel('追加先モデル', { exact: true }); await target.focus();
      const ids = await target.locator('option').evaluateAll(nodes => nodes.map(n => (n as HTMLOptionElement).value).filter(Boolean)); expect(ids).toHaveLength(1);
      await target.selectOption(ids[0]!); await a.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
      for (const [axis, value] of [['X', '0.2'], ['Y', '0.2'], ['Z', '0']]) await a.getByLabel(`位置 ${axis}`, { exact: true }).fill(value!);
      await a.getByRole('button', { name: '位置を確定', exact: true }).click(); await expect(a.getByText('ピンの位置を確定しました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
      await detail(a).getByLabel('タイトル', { exact: true }).fill(captionTitle); await edit(a, '配布した本文'); await image(a, '共有画像.png', png);
      await a.getByRole('tab', { name: 'モデル', exact: true }).click(); await models(a).locator('.lv-model-select').first().click();
      await models(a).getByRole('button', { name: '配置を調整', exact: true }).click();
      await models(a).getByLabel('モデル位置 X', { exact: true }).fill('1.25'); await models(a).getByLabel('モデル倍率', { exact: true }).fill('1.5');
      await models(a).getByRole('button', { name: '配置を確定', exact: true }).click(); await expect(a.getByText('モデルの配置を確定しました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
      await a.getByRole('tab', { name: 'キャプション', exact: true }).click();
      const scenes = a.getByRole('region', { name: 'シーン', exact: true }), first = (await scenes.locator('button[aria-pressed="true"]').textContent())!; primaryScene = first;
      await beginSceneCreation(a); await a.getByLabel('シーン名', { exact: true }).fill('共有した別シーン'); await a.getByRole('button', { name: 'シーンを追加', exact: true }).click();
      await expect(a.getByText('シーンを追加しました。', { exact: true })).toBeVisible({ timeout: actionTimeout }); await scenes.getByRole('button', { name: first, exact: true }).click(); await chooseCaption(a);
      const path = await download(a, info, 'W0-差し替え前', 'teamWorkspace'); initialWorkspacePath = path; base = await WorkspaceArchive.inspect(await blob(path), validationMetadataLimits);
      const inspected = await inspectProjectCandidates(base.source.read(), validationMetadataLimits); if (inspected.kind !== 'project-candidate-inspection') throw Error('initial metadata'); initialRecords = inspected.unambiguousRecords;
      await b.getByLabel('ファイルを選択', { exact: true }).setInputFiles(path); await b.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
      await expect(b.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: actionTimeout }); await chooseCaption(b); await edit(b, localBody); await image(b, 'Bの追加画像.png', localPng);
      originalColor = await marker(b).evaluate(node => getComputedStyle(node).backgroundColor);
    });
    let recovered!: Awaited<ReturnType<typeof inspect>>, fault!: { prepared: PreparedJournal; durable: { transactionId: string; exactChangeSetDigest: string }; changes: string[]; published: boolean; hits: number; path: string[] };
    await step('差し替え確認と取消、公開中断後の完全終了と再試行', async () => {
      await a.getByRole('tab', { name: 'モデル', exact: true }).click(); await models(a).locator('.lv-model-select').first().click();
      const select = async () => { const picker = a.waitForEvent('filechooser'); await revealModelManagement(a); await models(a).getByRole('button', { name: 'モデルを差し替える', exact: true }).click();
        await (await picker).setFiles({ name: 'replacement.glb', mimeType: 'model/gltf-binary', buffer: newGlb }); };
      await select(); const note = models(a).getByRole('region', { name: 'モデルのファイル', exact: true });
      await expect(note).toContainText('2シーン'); await expect(note).toContainText('ピンは要確認'); await expect(note).toContainText('材質の調整は引き継ぎません');
      await a.screenshot({ path: info.outputPath('差し替えの確認.png'), fullPage: true });
      await note.getByRole('button', { name: '選択を取り消す', exact: true }).click(); await expect(note.getByRole('button', { name: '差し替えを確定', exact: true })).toBeHidden();
      await select();
      // Test-only native failure before OPFS creates the publication marker; all data writes stay real.
      await a.evaluate(() => {
        const state = { armed: true, hits: 0, dir: null as FileSystemDirectoryHandle | null }; (window as any).__modelPublicationFault = state;
        const get = FileSystemDirectoryHandle.prototype.getFileHandle;
        FileSystemDirectoryHandle.prototype.getFileHandle = async function(name, options) {
          if (state.armed && name === 'published.json' && options?.create === true) {
            state.armed = false; state.hits++; state.dir = this; throw new DOMException('検証用の公開中断', 'AbortError');
          }
          return get.call(this, name, options);
        };
      });
      await models(a).getByRole('button', { name: '差し替えを確定', exact: true }).click();
      await expect(a.getByRole('button', { name: '更新を再試行', exact: true })).toBeVisible({ timeout: actionTimeout });
      await expect(a.getByRole('button', { name: '更新を再試行', exact: true })).toBeEnabled({ timeout: actionTimeout });
      await expect(a.locator('header > .lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: actionTimeout });
      await expect(a.getByText('モデルを差し替えました。配置と記録を保持しています。', { exact: true })).toBeHidden();
      fault = await a.evaluate(async () => {
        const state = (window as any).__modelPublicationFault, dir: FileSystemDirectoryHandle = state.dir;
        const text = async (name: string) => (await (await dir.getFileHandle(name)).getFile()).text();
        const prepared: PreparedJournal = JSON.parse(await text('blobsVerified.json')), durable = JSON.parse(await text('metadataDurable.json'));
        let published = false; try { await dir.getFileHandle('published.json'); published = true; } catch (error) { if ((error as DOMException).name !== 'NotFoundError') throw error; }
        const changesDir = await dir.getDirectoryHandle('changes');
        const changes = await Promise.all(prepared.changes.map(async part => {
          const bytes = new Uint8Array(await (await (await changesDir.getFileHandle(`${String(part.ordinal).padStart(8, '0')}.amchange`)).getFile()).arrayBuffer());
          return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        }));
        const path = await (await navigator.storage.getDirectory()).resolve(dir); if (!path) throw Error('fault directory outside OPFS');
        return { prepared, durable, changes, published, hits: state.hits, path };
      });
      evidence.interruption = fault;
      expect(fault.hits).toBe(1); expect(fault.published).toBe(false); expect(fault.prepared.start.purpose).toBe('localCommand'); expect(fault.changes).toHaveLength(1);
      expect(fault.durable).toEqual({ transactionId: fault.prepared.start.transactionId, exactChangeSetDigest: fault.prepared.exactChangeSetDigest });
      fault.changes.forEach((hex, i) => expect(sha(Buffer.from(hex, 'hex'))).toBe(fault.prepared.changes[i]!.bytesSha256));
      await a.screenshot({ path: info.outputPath('中断時の再試行.png'), fullPage: true }); await close('A'); a = await launch('A');
      const incomplete = a.locator('p').filter({ hasText: title }).filter({ hasText: '更新が未完了' });
      await expect(incomplete).toBeVisible({ timeout: actionTimeout });
      await expect(a.getByText(`最後のプロジェクトを再開しました：${title}`, { exact: true })).toBeHidden();
      await a.screenshot({ path: info.outputPath('復旧するプロジェクトの選択.png'), fullPage: true });
      await incomplete.getByRole('button', { name: '編集で開く', exact: true }).click();
      await expect(a.getByRole('button', { name: '更新を再試行', exact: true })).toBeVisible({ timeout: actionTimeout });
      await a.getByRole('button', { name: '更新を再試行', exact: true }).click();
      await expect(a.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: actionTimeout }); await chooseCaption(a);
      const retried = await a.evaluate(async path => {
        let dir = await navigator.storage.getDirectory(); for (const part of path) dir = await dir.getDirectoryHandle(part);
        const text = async (name: string) => (await (await dir.getFileHandle(name)).getFile()).text();
        const prepared: PreparedJournal = JSON.parse(await text('blobsVerified.json')), changesDir = await dir.getDirectoryHandle('changes');
        const changes = await Promise.all(prepared.changes.map(async part => {
          const bytes = new Uint8Array(await (await (await changesDir.getFileHandle(`${String(part.ordinal).padStart(8, '0')}.amchange`)).getFile()).arrayBuffer());
          return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        }));
        return { prepared, changes, durable: JSON.parse(await text('metadataDurable.json')), publication: JSON.parse(await text('published.json')) };
      }, fault.path);
      evidence.recoveredJournal = retried;
      expect(retried.prepared).toEqual(fault.prepared); expect(retried.durable).toEqual(fault.durable); expect(retried.changes).toEqual(fault.changes);
      expect(retried.publication).toMatchObject(fault.durable);
      await expect(marker(a)).toHaveAttribute('data-review', 'true'); await checkImages(a, 1);
      recovered = await inspect(await download(a, info, 'A-中断から復旧', 'backup'));
      expect(recovered.history).toHaveLength(originals(base.source).length + 1); expect(recovered.history).toEqual(expect.arrayContaining(originals(base.source)));
      expect(recovered.history).toEqual(expect.arrayContaining(fault.changes.map(hex => [sha(Buffer.from(hex, 'hex')), hex])));
      expect(recovered.records.captionsById).toEqual(initialRecords.captionsById);
      expect(recovered.records.sceneAssetMembershipsById).toEqual(initialRecords.sceneAssetMembershipsById);
      const oldAsset = Object.values(initialRecords.assetsById)[0] as any, nextAsset = recovered.records.assetsById[oldAsset.id];
      const oldBinding = initialRecords.assetBindingsById[oldAsset.status.activeBindingId], nextBinding = recovered.records.assetBindingsById[nextAsset.status.activeBindingId];
      expect(nextBinding.assetToProject).toEqual(oldBinding.assetToProject); expect(nextBinding.parentBindingId).toBe(oldBinding.id);
      expect(nextBinding.assetRevisionId).not.toBe(oldBinding.assetRevisionId); expect(nextAsset.assetFrameId).toBe(oldAsset.assetFrameId);
      const revision = recovered.records.assetRevisionsById[nextBinding.assetRevisionId];
      expect(recovered.records.representationsById[revision.representationIds[0]].blob.digest).toBe(sha(newGlb));
      expect(Object.keys(recovered.records.scenesById)).toHaveLength(2);
    });
    const contributionBytes: string[][] = [];
    const checkContribution = async (path: string) => {
      const archive = await PackageArchive.inspect(await blob(path)), manifest = archive.control.manifest;
      if (manifest.purpose !== 'contribution') throw Error('reply purpose');
      expect(manifest.identity).toEqual(base.source.proof.identity); expect(manifest.base.heads).toEqual(base.source.heads);
      expect(manifest.base.workspacePackageId).toBe(base.archive.control.manifest.packageId);
      for (const part of manifest.changes) { const bytes = await archive.entryBytes(`changes/${String(part.ordinal).padStart(8, '0')}.amchange`, part.byteLength);
        expect(sha(bytes)).toBe(part.bytesSha256); contributionBytes.push([sha(bytes), Buffer.from(bytes).toString('hex')]); }
      return manifest;
    };
    let beforeReceive!: Awaited<ReturnType<typeof inspect>>;
    await step('受信中断を元ファイルの再選択で復旧し、手元の本文と画像を保つ', async () => {
      const update = await download(a, info, 'W1-差し替え済み', 'teamWorkspace'), updateBytes = await readFile(update);
      const workspace = await WorkspaceArchive.inspect(await blob(update), validationMetadataLimits);
      beforeReceive = await inspect(await download(b, info, 'B-受信前の手元作業', 'backup'));
      // Test-only BEFORE native creation: retain closed input binding, with no input/start/journal.
      await b.evaluate(() => {
        const state = { armed: true, hits: 0, dir: null as FileSystemDirectoryHandle | null }; (window as any).__receiveInputFault = state;
        const get = FileSystemDirectoryHandle.prototype.getFileHandle;
        FileSystemDirectoryHandle.prototype.getFileHandle = async function(name, options) {
          if (state.armed && name === 'input.zip' && options?.create === true) {
            state.armed = false; state.hits++; state.dir = this; throw new DOMException('検証用の受信中断', 'AbortError');
          }
          return get.call(this, name, options);
        };
      });
      let area = b.getByRole('region', { name: '更新ファイル', exact: true });
      await area.getByLabel('更新ファイルを選択', { exact: true }).setInputFiles(update);
      await area.getByRole('button', { name: '更新を受け取る', exact: true }).click();
      await expect(area.getByRole('button', { name: '元のファイルを選び直す', exact: true })).toBeEnabled({ timeout: actionTimeout });
      await expect(area.getByText('更新を受け取りました。', { exact: true })).toBeHidden();
      await expect(detail(b).getByLabel('本文', { exact: true })).toHaveValue(localBody); await checkImages(b, 2);
      const fault = await b.evaluate(async () => {
        const state = (window as any).__receiveInputFault, path = await (await navigator.storage.getDirectory()).resolve(state.dir);
        if (!path) throw Error('receive directory outside OPFS'); return { path, hits: state.hits };
      });
      expect(fault.hits).toBe(1); expect(fault.path.slice(-4, -1)).toEqual(['v2', 'packages', 'receive']);
      const jobId = fault.path.at(-1)!;
      const snapshot = (page: Page) => page.evaluate(async path => {
        const root = await navigator.storage.getDirectory();
        const directory = async (parts: string[]) => { let dir = root; try { for (const part of parts) dir = await dir.getDirectoryHandle(part); return dir; }
          catch (error) { if ((error as DOMException).name === 'NotFoundError') return null; throw error; } };
        const dir = (await directory(path))!;
        const file = async (parent: FileSystemDirectoryHandle | null, name: string) => { if (!parent) return null; try { return await (await parent.getFileHandle(name)).getFile(); }
          catch (error) { if ((error as DOMException).name === 'NotFoundError') return null; throw error; } };
        const text = async (parent: FileSystemDirectoryHandle | null, name: string) => (await file(parent, name))?.text() ?? null;
        const entries = async (parent: FileSystemDirectoryHandle | null) => { const result: string[] = []; if (parent) for await (const [name] of (parent as any).entries()) result.push(name); return result.sort(); };
        const journal = await directory([...path.slice(0, -4), 'v2', 'metadata', 'journal', path.at(-1)!]), input = await file(dir, 'input.zip');
        const stepDir = await directory([...path, 'steps']), steps = [];
        for (const name of await entries(stepDir)) steps.push(JSON.parse((await text(stepDir, name))!));
        return { prepared: await text(dir, 'prepared.json'), binding: await text(dir, 'input.json'), start: await text(dir, 'start.json'),
          inputHex: input ? Array.from(new Uint8Array(await input.arrayBuffer()), n => n.toString(16).padStart(2, '0')).join('') : null,
          steps, journalStart: await text(journal, 'staging.json'), publication: await text(journal, 'published.json'),
          jobIds: await entries(await directory(path.slice(0, -1))) };
      }, fault.path);
      const pending = await snapshot(b), prepared = JSON.parse(pending.prepared!), binding = JSON.parse(pending.binding!);
      expect(prepared.packageId).toBe(workspace.archive.control.manifest.packageId);
      expect(binding).toMatchObject({ jobId, archive: { sha256: sha(updateBytes), byteLength: updateBytes.length } });
      expect(pending).toMatchObject({ start: null, inputHex: null, steps: [], journalStart: null, publication: null });
      // Warm refusal must reach exact-input validation, not be blocked by its own receive failure.
      const picker = b.waitForEvent('filechooser'); await area.getByRole('button', { name: '元のファイルを選び直す', exact: true }).click();
      await (await picker).setFiles(initialWorkspacePath); await expect(area.getByRole('button', { name: '受信を再開', exact: true })).toHaveCount(1); await area.locator('form').getByRole('button', { name: '受信を再開', exact: true }).click();
      await expect(area.getByText('中断前と異なるファイルです。読み込みを始めた元のファイルを選び直してください。', { exact: true })).toBeVisible({ timeout: actionTimeout });
      await expect(area.getByRole('button', { name: '受信を再開', exact: true })).toBeEnabled(); expect(await snapshot(b)).toEqual(pending);
      await area.scrollIntoViewIfNeeded(); await b.screenshot({ path: info.outputPath('別のファイルを拒否して受信を保持.png'), fullPage: true });
      await close('B'); b = await launch('B');
      const incomplete = b.locator('p').filter({ hasText: title }).filter({ hasText: '更新が未完了' }); await expect(incomplete).toBeVisible({ timeout: actionTimeout });
      await incomplete.getByRole('button', { name: '編集で開く', exact: true }).click(); area = b.getByRole('region', { name: '更新ファイル', exact: true });
      await expect(area.getByRole('button', { name: '元のファイルを選び直す', exact: true })).toBeEnabled({ timeout: actionTimeout });
      await expect(b.getByRole('button', { name: '更新を再試行', exact: true })).toBeHidden(); expect(await snapshot(b)).toEqual(pending);
      await area.scrollIntoViewIfNeeded(); await b.screenshot({ path: info.outputPath('再起動後に元ファイルで受信を再開.png'), fullPage: true });
      const correct = b.waitForEvent('filechooser'); await area.getByRole('button', { name: '元のファイルを選び直す', exact: true }).click();
      await (await correct).setFiles(update); await expect(area.getByRole('button', { name: '受信を再開', exact: true })).toHaveCount(1); await area.locator('form').getByRole('button', { name: '受信を再開', exact: true }).click();
      await expect(area.getByText('更新を受け取りました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
      const resumed = await snapshot(b); expect(resumed.prepared).toBe(pending.prepared); expect(resumed.binding).toBe(pending.binding);
      expect(resumed.jobIds).toEqual(pending.jobIds); expect(Buffer.from(resumed.inputHex!, 'hex')).toEqual(updateBytes);
      expect(JSON.parse(resumed.start!)).toMatchObject({ jobId, operation: 'receiveWorkspace' });
      expect(JSON.parse(resumed.journalStart!)).toMatchObject({ transactionId: jobId, purpose: 'remotePackageMerge', baseHeads: beforeReceive.backup.source.heads });
      expect(JSON.parse(resumed.publication!)).toMatchObject({ transactionId: jobId });
      expect(resumed.steps.map(step => step.detail.kind).sort()).toEqual(['baseRecorded', 'workspacePublished']);
      evidence.receiveInterruption = { fault, pending, resumed };
      await chooseCaption(b); await expect(detail(b).getByLabel('本文', { exact: true })).toHaveValue(localBody); await checkImages(b, 2);
      await expect(marker(b)).toHaveAttribute('data-review', 'true');
    });
    let final!: Awaited<ReturnType<typeof inspect>>;
    await step('Bの本文と画像を保ち、要確認を面選択で補正してAに返す', async () => {
      await chooseCaption(b);
      await expect(detail(b).getByLabel('本文', { exact: true })).toHaveValue(localBody); await checkImages(b, 2);
      await expect(marker(b)).toHaveAttribute('data-review', 'true'); await expect(marker(b)).toHaveAttribute('aria-description', '要確認');
      expect(await marker(b).evaluate(node => getComputedStyle(node).backgroundColor)).toBe(originalColor);
      const row = b.getByRole('list', { name: 'キャプション一覧', exact: true }).getByRole('listitem'); await expect(row).toContainText('要確認');
      await b.screenshot({ path: info.outputPath('要確認のピン.png'), fullPage: true });
      await pinArea(b).getByRole('button', { name: '位置を調整', exact: true }).click();
      await expect(pinArea(b).getByLabel('位置 X', { exact: true })).toBeHidden();
      await expect(pinArea(b).getByRole('button', { name: '位置を確定', exact: true })).toBeHidden();
      await expect(pinArea(b)).toContainText('モデルの面を選択'); await pinArea(b).getByRole('button', { name: '取り消す', exact: true }).click();
      await expect(marker(b)).toHaveAttribute('data-review', 'true');
      await lookAlongFront(b); await b.getByRole('button', { name: '全体表示', exact: true }).click();
      await pinArea(b).getByRole('button', { name: '位置を調整', exact: true }).click();
      const canvas = b.getByLabel('3Dモデルの表示', { exact: true }), box = await canvas.boundingBox(); expect(box).toBeTruthy();
      await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
      await expect(pinArea(b).getByRole('button', { name: '位置を確定', exact: true })).toBeVisible();
      expect(Number(await pinArea(b).getByLabel('位置 Z', { exact: true }).inputValue())).toBeCloseTo(0.5, 5);
      for (const [axis, value] of [['X', '0.1'], ['Y', '0.4'], ['Z', '0.5']]) await pinArea(b).getByLabel(`位置 ${axis}`, { exact: true }).fill(value!);
      await pinArea(b).getByRole('button', { name: '位置を確定', exact: true }).click(); await expect(b.getByText('ピンの位置を確定しました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
      await expect(marker(b)).toHaveAttribute('data-review', 'false'); await checkImages(b, 2);
      const reply = await download(b, info, 'B-ピンを補正した変更分', 'contribution', base.archive.control.manifest.packageId);
      await checkContribution(reply);
      await receive(a, reply); await receive(a, reply); await chooseCaption(a); await expect(marker(a)).toHaveAttribute('data-review', 'false');
      await expect(detail(a).getByLabel('本文', { exact: true })).toHaveValue(localBody); await checkImages(a, 2);
      final = await inspect(await download(b, info, 'B-補正完了', 'backup'));
      const caption = Object.values(final.records.captionsById)[0] as any;
      expect(caption.anchor).toMatchObject({ positionAsset: [0.1, 0.4, 0.5] });
      const asset = Object.values(final.records.assetsById)[0] as any, binding = final.records.assetBindingsById[asset.status.activeBindingId];
      expect(caption.anchor.authoredAssetRevisionId).toBe(binding.assetRevisionId); expect(caption.body).toBe(localBody);
      expect(final.history).toEqual(expect.arrayContaining(recovered.history));
      expect(final.history).toEqual(expect.arrayContaining(beforeReceive.history));
      for (const input of [oldGlb, newGlb, png, localPng]) expect(Buffer.from(await final.backup.archive.entryBytes(`blobs/sha256/${sha(input)}`, input.length))).toEqual(input);
      evidence.final = { records: final.records, history: final.history, heads: final.backup.source.heads };
    });
    await step('同じProjectの本文競合を解消し、両方残した独立記録を編集して二巡目を返す', async () => {
      const previous = final, originalId = Object.keys(previous.records.captionsById)[0]!;
      const secondScene = '共有した別シーン', aBody = `${localBody}。Aの復旧後の追記`, bBody = `${localBody}。Bの二巡目の追記`;
      await chooseCaption(a); await edit(a, aBody); await chooseCaption(b); await edit(b, bBody);
      for (const page of [a, b]) {
        const scenes = page.getByRole('region', { name: 'シーン', exact: true }); await scenes.getByRole('button', { name: secondScene, exact: true }).click();
        const include = page.locator('details.lv-caption-include'); await include.getByText('キャプションの追加・除外', { exact: true }).click();
        await include.getByLabel('キャプション', { exact: true }).selectOption(originalId); await include.getByRole('button', { name: 'このシーンに追加', exact: true }).click();
        await expect(page.getByText('このシーンに追加しました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
        await scenes.getByRole('button', { name: primaryScene, exact: true }).click();
      }
      const outward = await download(a, info, 'A-二巡目の変更分', 'contribution', base.archive.control.manifest.packageId); await checkContribution(outward); await receive(b, outward);
      const recovery = b.getByRole('region', { name: '記録の競合', exact: true });
      const body = recovery.getByRole('listitem', { name: `${captionTitle}：本文`, exact: true });
      await expect(body).toContainText(aBody); await expect(body).toContainText(bBody); await expect(body.getByRole('combobox')).toHaveValue('');
      await body.getByRole('combobox').selectOption('manual'); await body.getByRole('textbox').fill(mergedBody);
      await body.getByRole('button', { name: '競合を解消', exact: true }).click(); await expect(body).toBeHidden({ timeout: actionTimeout });
      const duplicate = recovery.getByRole('listitem', { name: `${secondScene}：${captionTitle}の重複登録`, exact: true });
      await expect(duplicate).toContainText(primaryScene); await expect(duplicate.getByRole('combobox').first()).toHaveValue('');
      const choices = await duplicate.getByRole('combobox').first().locator('option').evaluateAll(nodes => nodes.map(n => (n as HTMLOptionElement).value).filter(Boolean)); expect(choices).toHaveLength(2);
      await duplicate.getByRole('combobox').first().selectOption(choices[0]!); await duplicate.getByRole('combobox').nth(1).selectOption('both');
      await duplicate.scrollIntoViewIfNeeded(); await b.screenshot({ path: info.outputPath('復旧後も同じProjectで両方残す.png'), fullPage: true });
      await duplicate.getByRole('button', { name: '競合を解消', exact: true }).click(); await expect(duplicate).toBeHidden({ timeout: actionTimeout });
      // Original is unambiguous in its first Scene; its new name then distinguishes the copy.
      await chooseCaption(b); await detail(b).getByLabel('タイトル', { exact: true }).fill(originalTitle); await edit(b, finalBody);
      await b.getByRole('region', { name: 'シーン', exact: true }).getByRole('button', { name: secondScene, exact: true }).click();
      await chooseCaption(b); await detail(b).getByLabel('タイトル', { exact: true }).fill(copyTitle); await edit(b, copyBody); await checkImages(b, 2);
      const gallery = b.getByRole('region', { name: '画像の整理', exact: true }); await gallery.getByRole('button', { name: '説明を編集', exact: true }).first().click();
      await gallery.getByLabel('メディアの説明', { exact: true }).fill(copyAlt); await gallery.getByRole('button', { name: '説明を適用', exact: true }).click();
      await expect(b.getByText('メディアの説明を適用しました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
      const reply = await download(b, info, 'B-二巡目の返送', 'contribution', base.archive.control.manifest.packageId); await checkContribution(reply);
      await receive(a, reply); await receive(a, reply); await chooseCaption(a, originalTitle); await expect(detail(a).getByLabel('本文', { exact: true })).toHaveValue(finalBody);
      final = await inspect(await download(b, info, 'B-二巡目完了', 'backup'));
      expect(Object.keys(final.records.captionsById)).toHaveLength(2); const copyId = Object.keys(final.records.captionsById).find(id => id !== originalId)!;
      expect(final.records.captionsById[originalId]).toEqual({ ...previous.records.captionsById[originalId], title: originalTitle, body: finalBody });
      expect(final.records.captionsById[copyId]).toMatchObject({ title: copyTitle, body: copyBody, anchor: previous.records.captionsById[originalId].anchor, lifecycle: { state: 'active' } });
      for (const map of ['assetsById', 'assetBindingsById', 'assetRevisionsById', 'representationsById', 'mediaResourcesById', 'sceneAssetMembershipsById']) expect(final.records[map]).toEqual(previous.records[map]);
      for (const [id, attachment] of Object.entries(previous.records.captionAttachmentsById)) expect(final.records.captionAttachmentsById[id]).toEqual(attachment);
      const copies = (Object.values(final.records.captionAttachmentsById) as any[]).filter(row => row.captionId === copyId); expect(copies).toHaveLength(2); expect(copies.some(row => row.altText === copyAlt)).toBe(true);
      for (const row of copies) expect(Object.values(previous.records.captionAttachmentsById).some((original: any) => original.id !== row.id && original.mediaResourceId === row.mediaResourceId)).toBe(true);
      const firstId = Object.keys(previous.records.scenesById).find(id => previous.records.scenesById[id].name === primaryScene)!;
      for (const [id, edge] of Object.entries(previous.records.sceneCaptionMembershipsById) as [string, any][]) if (edge.sceneId === firstId) expect(final.records.sceneCaptionMembershipsById[id]).toEqual(edge);
      expect(final.history).toEqual(expect.arrayContaining(previous.history)); expect(final.history).toEqual(expect.arrayContaining(contributionBytes));
      evidence.secondRound = { records: final.records, history: final.history, heads: final.backup.source.heads, contributionBytes, copyId, originalId, choices, continuingOriginal: choices[0] };
    });
    await step('両ブラウザの再開と実バックアップが補正済みモデルと記録を保持する', async () => {
      await close('A'); await close('B'); a = await launch('A'); b = await launch('B');
      for (const [who, page] of [['A', a], ['B', b]] as const) {
        await expect(page.getByText(`最後のプロジェクトを再開しました：${title}`, { exact: true })).toBeVisible({ timeout: actionTimeout }); await chooseCaption(page, originalTitle);
        await expect(marker(page)).toHaveAttribute('data-review', 'false'); await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue(finalBody); await checkImages(page, 2);
        await page.getByRole('region', { name: 'シーン', exact: true }).getByRole('button', { name: '共有した別シーン', exact: true }).click();
        await expect(page.getByRole('list', { name: 'キャプション一覧', exact: true }).locator('.lv-caption-select')).toHaveCount(2); await chooseCaption(page, copyTitle);
        await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue(copyBody); await checkImages(page, 2);
        await expect(page.getByRole('region', { name: '画像の整理', exact: true })).toContainText(copyAlt);
        await expect(marker(page)).toHaveCount(2); for (const pin of await marker(page).all()) await expect(pin).toHaveAttribute('data-review', 'false');
        await expect(page.getByRole('region', { name: '記録の競合', exact: true })).toBeHidden();
        await expect(page.locator('.lv-project-viewport-status')).toBeEmpty(); await page.screenshot({ path: info.outputPath(`${who}-補正後の再開.png`), fullPage: true });
      }
      const cold = await inspect(await download(a, info, 'A-再起動後の保存', 'backup'));
      expect(cold.records).toEqual(final.records); expect(cold.history).toEqual(final.history); expect(cold.backup.source.heads).toEqual(final.backup.source.heads);
      expect(cold.backup.source.proof.identity).toEqual(base.source.proof.identity);
      for (const input of [oldGlb, newGlb, png, localPng]) expect(Buffer.from(await cold.backup.archive.entryBytes(`blobs/sha256/${sha(input)}`, input.length))).toEqual(input);
    });
    expect(errors).toEqual([]);
  } catch (error) {
    failed = true; await Promise.allSettled([...contexts].flatMap(([who, context]) => context.pages().map(page => page.screenshot({ path: info.outputPath(`${who}-failure.png`), fullPage: true })))); throw error;
  } finally {
    const cleanup = await Promise.allSettled([...contexts.keys()].map(close));
    await Promise.allSettled([info.attach('中断・原本・補正の証拠', { body: JSON.stringify(evidence), contentType: 'application/json' }),
      info.attach('ブラウザ例外', { body: JSON.stringify(errors), contentType: 'application/json' })]);
    const rejected = cleanup.find(r => r.status === 'rejected'); if (!failed && rejected?.status === 'rejected') throw rejected.reason;
  }
});
