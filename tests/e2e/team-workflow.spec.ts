import { test, expect, chromium, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as Automerge from '@automerge/automerge';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { PackageArchive } from '../../src/projectPackage/zipArchive';
import type { ProjectMetadataSource } from '../../src/projectMetadata/source';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { smallPng, triangleGlb } from './fixtures';

const entry = `http://127.0.0.1:4182/dev.html?editor=project${process.env.LOCIVIEW_E2E_TIMINGS === '1' ? '&timings=1' : ''}`;
const projectName = '二人で引き継ぐプロジェクト', captionName = '共同記録';
const originalBody = '配布時の本文', localBody = 'Bの現地本文', remoteBody = 'Aの更新本文';
const mergedBody = `${remoteBody}\n${localBody}`, finalBody = `${mergedBody}\nBの二巡目`;
const finalTitle = 'Aの二巡目のタイトル';
// Includes generation and output refresh; observed W1 generation alone settled at84s.
// This new multi-file workflow's bound is not latency acceptance.
const fileTimeout = 180_000;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const history = (source: ProjectMetadataSource) => source.originalChanges()
  .map(bytes => [sha256(bytes), Buffer.from(bytes).toString('hex')]).sort((a, b) => a[0]!.localeCompare(b[0]!));
const fileBlob = async (path: string) => new Blob([new Uint8Array(await readFile(path)).buffer]);
const files = (page: Page) => page.getByRole('region', { name: 'ファイル', exact: true });
const detail = (page: Page) => page.getByRole('region', { name: 'キャプションの詳細', exact: true });

async function selectCaption(page: Page, title = captionName) {
  await page.getByRole('list', { name: 'キャプション一覧', exact: true })
    .locator('.lv-caption-select').filter({ hasText: title }).click();
}
async function edit(page: Page, field: 'タイトル' | '本文', value: string) {
  await detail(page).getByLabel(field, { exact: true }).fill(value);
  await detail(page).getByRole('button', { name: '変更を適用', exact: true }).click();
  await expect(page.getByText('変更を適用しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('header > .lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 90_000 });
  await expect(detail(page).getByLabel(field, { exact: true })).toHaveValue(value);
}
async function addImage(page: Page, name: string, buffer: Buffer) {
  const choosing = page.waitForEvent('filechooser');
  await page.getByLabel('メディアを追加', { exact: true }).click();
  await (await choosing).setFiles({ name, mimeType: 'image/png', buffer });
  await expect(page.getByText('メディアを追加しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
}
async function checkImages(page: Page, count: number) {
  const images = page.getByRole('region', { name: 'メディアの整理', exact: true }).locator('img');
  await expect(images).toHaveCount(count);
  for (const image of await images.all()) {
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth)).toBe(2);
  }
}
async function download(page: Page, testInfo: TestInfo, name: string, purpose: 'teamWorkspace' | 'contribution' | 'backup', base?: string) {
  const area = files(page);
  await area.getByRole('button', { name: purpose === 'backup' ? '保存' : '相手に渡す', exact: true }).click();
  if (purpose === 'backup') await area.getByLabel('名前（任意）', { exact: true }).fill(name);
  else {
    await area.getByLabel('渡す内容', { exact: true }).selectOption(purpose);
    if (purpose === 'contribution') {
      expect(base).toBeTruthy();
      await area.getByLabel('元にする作業一式', { exact: true }).selectOption(base!);
      await expect(area.getByLabel('元にする作業一式', { exact: true })).toHaveValue(base!);
    }
  }
  const [result] = await Promise.all([
    page.waitForEvent('download', { timeout: fileTimeout }),
    area.getByRole('button', { name: purpose === 'backup' ? 'ファイルに保存' : 'ダウンロード', exact: true }).click(),
  ]);
  const path = testInfo.outputPath(`${name}.zip`);
  await result.saveAs(path); expect(await result.failure()).toBeNull();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: fileTimeout });
  return path;
}
async function receive(page: Page, path: string) {
  const area = page.getByRole('region', { name: '更新ファイル', exact: true });
  const input = area.getByLabel('更新ファイルを選択', { exact: true });
  await input.setInputFiles(path);
  await expect(area.getByText('更新を受け取りました。', { exact: true })).toBeHidden();
  await area.getByRole('button', { name: '更新を受け取る', exact: true }).click();
  await expect(area.getByText('更新を受け取りました。', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(input).toHaveValue('');
}
async function inspectBackup(path: string, inputs: Buffer[]) {
  const backup = await BackupArchive.inspect(await fileBlob(path), validationMetadataLimits);
  const inspection = await inspectProjectCandidates(backup.source.read(), validationMetadataLimits);
  expect(inspection.kind).toBe('project-candidate-inspection');
  if (inspection.kind !== 'project-candidate-inspection') throw Error('backup metadata rejected');
  const records = inspection.unambiguousRecords as Record<string, any>;
  expect(records.project.title).toBe(projectName);
  expect(Object.keys(records.scenesById)).toHaveLength(2);
  expect(Object.values(records.captionsById)).toEqual([expect.objectContaining({ title: finalTitle, body: finalBody,
    anchor: expect.objectContaining({ kind: 'asset', positionAsset: [0.2, 0.2, 0] }) })]);
  expect(Object.keys(records.captionAttachmentsById)).toHaveLength(2);
  for (const input of inputs) {
    const digest = sha256(input);
    expect(Buffer.from(await backup.archive.entryBytes(`blobs/sha256/${digest}`, input.length))).toEqual(input);
  }
  return { backup, records, history: history(backup.source), heads: [...backup.source.heads], bases: backup.description.table.records };
}

test('独立した二人が実ファイルを二往復し、手元の画像と競合の解消結果を再起動後も保持する', async ({}, testInfo) => {
  // More real file operations than the single-user test; a functional bound only.
  test.setTimeout(900_000);
  Automerge.getHeads(Automerge.init());
  const root = testInfo.outputPath('profiles'); await mkdir(root, { recursive: true });
  const profiles = { A: await mkdtemp(join(root, 'participant-A-')), B: await mkdtemp(join(root, 'participant-B-')) };
  expect(profiles.A).not.toBe(profiles.B);
  const tracing = process.env.LOCIVIEW_E2E_TRACE !== '0';
  const contexts = new Map<string, BrowserContext>(), phases = new Map<string, number>(), errors: string[] = [];
  const glb = triangleGlb(), png = smallPng(), localPng = smallPng(180);
  expect(sha256(png)).not.toBe(sha256(localPng));
  const launch = async (person: 'A' | 'B') => {
    const context = await chromium.launchPersistentContext(profiles[person], { channel: 'chromium', headless: true,
      viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
    contexts.set(person, context); context.setDefaultTimeout(15_000);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === new URL(entry).origin || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient');
    });
    if (tracing) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = context.pages()[0] ?? await context.newPage();
    page.on('pageerror', error => errors.push(`${person}: ${error.message}`)); await page.goto(entry); return page;
  };
  const diagnostics = (page: Page) => page.evaluate(async () => {
    document.dispatchEvent(new Event('lociview-timing-snapshot'));
    return { locks: await navigator.locks.query(), measures: performance.getEntriesByType('measure')
      .filter(entry => entry.name.startsWith('lociview.')).map(entry => ({
        stage: entry.name, milliseconds: entry.duration, detail: (entry as PerformanceMeasure).detail,
      })) };
  });
  const attachDiagnostics = async (person: string, context: BrowserContext, label: string) => {
    await Promise.allSettled(context.pages().map(async page => {
      const snapshot = await diagnostics(page);
      await testInfo.attach(`${person} ${label}の計測とロック`, { body: JSON.stringify(snapshot), contentType: 'application/json' });
    }));
  };
  const close = async (person: string) => {
    const context = contexts.get(person); if (!context) return; contexts.delete(person);
    const phase = (phases.get(person) ?? 0) + 1; phases.set(person, phase);
    try {
      await attachDiagnostics(person, context, `終了前${phase}`);
      if (tracing) {
        const path = testInfo.outputPath(`${person}-${phase}.zip`);
        await context.tracing.stop({ path }); await testInfo.attach(`${person} 操作記録 ${phase}`, { path, contentType: 'application/zip' });
      }
    } finally { await context.close(); }
  };
  const stages: Record<string, number> = {}, evidence: Record<string, unknown> = { stages }, contributedOriginals: string[][] = []; let failed = false;
  const step = async (name: string, action: () => Promise<void>) => {
    const started = performance.now();
    try { return await test.step(name, action); }
    finally { stages[name] = Math.round(performance.now() - started); console.info(`${name}: ${stages[name]}ms`); }
  };
  try {
    let a = await launch('A'), b = await launch('B');
    const html = await a.request.get('http://127.0.0.1:4182/dev.html');
    expect(sha256(await html.body())).toBe(sha256(await readFile('validation-dist/dev.html')));
    const assets = await readdir('validation-dist/assets');
    await testInfo.attach('実行環境', { body: JSON.stringify({ browser: contexts.get('A')!.browser()!.version(),
      node: process.version, platform: process.platform, headless: true, tracing, route: entry, independentProfiles: true,
      assets: await Promise.all(assets.map(async name => ({ name, sha256: sha256(await readFile(join('validation-dist/assets', name))) }))) }), contentType: 'application/json' });
    await step('Aがモデルと記録を作り、Bは実際の作業一式だけから開く', async () => {
      await a.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'team-model.glb', mimeType: 'model/gltf-binary', buffer: glb });
      await a.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
      await a.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill(projectName);
      await a.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
      await expect(a.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(projectName);
      await a.getByText('数値で配置', { exact: true }).click();
      const model = a.getByLabel('追加先モデル', { exact: true }); await model.focus();
      const options = await model.locator('option').evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value).filter(Boolean));
      expect(options).toHaveLength(1); await model.selectOption(options[0]!);
      await a.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
      for (const [axis, value] of [['X', '0.2'], ['Y', '0.2'], ['Z', '0']] as const) await a.getByLabel(`位置 ${axis}`, { exact: true }).fill(value);
      await a.getByRole('button', { name: '位置を確定', exact: true }).click();
      await expect(a.getByText('ピンの位置を確定しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
      await detail(a).getByLabel('タイトル', { exact: true }).fill(captionName); await edit(a, '本文', originalBody);
      await addImage(a, '共有画像.png', png);
      const scenes = a.getByRole('region', { name: 'シーン', exact: true });
      const initialName = (await scenes.locator('button[aria-pressed="true"]').textContent())!;
      await a.getByLabel('シーン名', { exact: true }).fill('現地のシーン');
      await a.getByRole('button', { name: 'シーンを追加', exact: true }).click();
      await expect(a.getByText('シーンを追加しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
      await scenes.getByRole('button', { name: initialName, exact: true }).click(); await selectCaption(a);
      const initial = await download(a, testInfo, 'W0-最初の作業一式', 'teamWorkspace');
      const workspace = await WorkspaceArchive.inspect(await fileBlob(initial), validationMetadataLimits);
      const manifest = workspace.archive.control.manifest; if (manifest.purpose !== 'teamWorkspace') throw Error('workspace');
      evidence.base = { id: manifest.packageId, heads: manifest.targetHeads, identity: manifest.identity, history: history(workspace.source) };
      await expect(b.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveCount(0);
      await b.getByLabel('ファイルを選択', { exact: true }).setInputFiles(initial);
      await b.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
      await expect(b.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(projectName, { timeout: 90_000 });
      await expect(b.getByLabel('3Dモデルの表示', { exact: true })).toBeVisible();
      await expect(b.locator('.lv-project-viewport-status')).toBeEmpty();
      await selectCaption(b); await expect(detail(b).getByLabel('本文', { exact: true })).toHaveValue(originalBody); await checkImages(b, 1);
    });
    const base = evidence.base as { id: string; heads: readonly string[]; identity: unknown; history: string[][] };
    await step('Bの本文と独立画像を残したままAの更新を受信し、競合を明示解消する', async () => {
      await edit(b, '本文', localBody); await addImage(b, 'Bだけで追加した画像.png', localPng);
      await edit(a, '本文', remoteBody);
      const updated = await download(a, testInfo, 'W1-Aの更新', 'teamWorkspace');
      const workspace = await WorkspaceArchive.inspect(await fileBlob(updated), validationMetadataLimits);
      evidence.updatedBase = { id: workspace.archive.control.manifest.packageId, heads: workspace.source.heads };
      await receive(b, updated); await selectCaption(b); await checkImages(b, 2);
      const group = b.getByRole('region', { name: '記録の競合', exact: true }).getByRole('listitem', { name: `${captionName}：本文`, exact: true });
      await expect(group).toBeVisible(); await expect(group).toContainText(localBody); await expect(group).toContainText(remoteBody);
      await expect(detail(b).getByLabel('本文', { exact: true })).toHaveAttribute('readonly', '');
      const choice = group.getByRole('combobox'); await expect(choice).toHaveValue('');
      await expect(group.getByRole('button', { name: '競合を解消', exact: true })).toBeDisabled();
      await choice.selectOption('manual'); await group.getByRole('textbox').fill(mergedBody);
      await group.getByRole('button', { name: '競合を解消', exact: true }).click();
      await expect(group).toBeHidden({ timeout: 90_000 });
      await expect(detail(b).getByLabel('本文', { exact: true })).toHaveValue(mergedBody);
      await expect(detail(b).getByLabel('本文', { exact: true })).toBeEditable(); await checkImages(b, 2);
    });
    const contribution = async (page: Page, name: string) => {
      const path = await download(page, testInfo, name, 'contribution', base.id);
      const archive = await PackageArchive.inspect(await fileBlob(path)), manifest = archive.control.manifest;
      expect(manifest.purpose).toBe('contribution'); if (manifest.purpose !== 'contribution') throw Error('contribution');
      expect(manifest.identity).toEqual(base.identity); expect(manifest.base.workspacePackageId).toBe(base.id); expect(manifest.base.heads).toEqual(base.heads);
      for (const change of manifest.changes) {
        const bytes = await archive.entryBytes(`changes/${String(change.ordinal).padStart(8, '0')}.amchange`, change.byteLength);
        expect(sha256(bytes)).toBe(change.bytesSha256); contributedOriginals.push([sha256(bytes), Buffer.from(bytes).toString('hex')]);
      }
      expect(manifest.changes.length).toBeGreaterThan(0); evidence[name] = { base: manifest.base, heads: manifest.targetHeads, changes: manifest.changes };
      return path;
    };
    await step('第一巡：Bの変更分をAへ返し、Aの追記をBへ渡す', async () => {
      const fromB = await contribution(b, 'B1-一巡目'); await receive(a, fromB); await selectCaption(a); await checkImages(a, 2);
      await expect(detail(a).getByLabel('本文', { exact: true })).toHaveValue(mergedBody);
      await edit(a, 'タイトル', 'Aの一巡目のタイトル');
      await receive(b, await contribution(a, 'A1-一巡目')); await selectCaption(b, 'Aの一巡目のタイトル');
      await expect(detail(b).getByLabel('本文', { exact: true })).toHaveValue(mergedBody); await checkImages(b, 2);
    });
    let secondFromB = '';
    await step('第二巡：互いの未送信編集を保ち、再受信でも内容を増やさない', async () => {
      await edit(b, '本文', finalBody); await edit(a, 'タイトル', finalTitle);
      secondFromB = await contribution(b, 'B2-二巡目'); await receive(a, secondFromB); await selectCaption(a, finalTitle);
      await expect(detail(a).getByLabel('タイトル', { exact: true })).toHaveValue(finalTitle);
      await expect(detail(a).getByLabel('本文', { exact: true })).toHaveValue(finalBody); await checkImages(a, 2);
      await receive(b, await contribution(a, 'A2-二巡目')); await selectCaption(b, finalTitle);
      const before = await inspectBackup(await download(a, testInfo, 'A-再受信前', 'backup'), [glb, png, localPng]);
      await receive(a, secondFromB); await selectCaption(a, finalTitle);
      const after = await inspectBackup(await download(a, testInfo, 'A-再受信後', 'backup'), [glb, png, localPng]);
      const peer = await inspectBackup(await download(b, testInfo, 'B-二巡完了', 'backup'), [glb, png, localPng]);
      expect(after.heads).toEqual(before.heads); expect(after.history).toEqual(before.history); expect(after.records).toEqual(before.records);
      expect(after.bases).toEqual(before.bases); expect(peer.history).toEqual(after.history); expect(peer.records).toEqual(after.records);
      for (const snapshot of [after, peer]) {
        expect(snapshot.backup.source.proof.identity).toEqual(base.identity); expect(snapshot.history).toEqual(expect.arrayContaining(base.history));
        expect(snapshot.history).toEqual(expect.arrayContaining(contributedOriginals));
        const original = snapshot.bases.find(row => row.workspacePackageId === base.id)!; expect(original).toBeTruthy(); expect(original.declaredHeads).toEqual(base.heads);
        const updated = evidence.updatedBase as { id: string; heads: readonly string[] };
        expect(snapshot.bases.find(row => row.workspacePackageId === updated.id)?.declaredHeads).toEqual(updated.heads);
        expect(updated.heads).not.toEqual(snapshot.heads);
        expect(snapshot.bases.map(row => row.workspacePackageId).sort()).toEqual([base.id, updated.id].sort());
      }
      evidence.final = { heads: after.heads, history: after.history, records: after.records,
        aBases: after.bases, bBases: peer.bases };
    });
    await step('両ブラウザを完全終了して同じ各profileから再開する', async () => {
      await close('A'); await close('B'); a = await launch('A'); b = await launch('B');
      for (const [person, page] of [['A', a], ['B', b]] as const) {
        await expect(page.getByText(`最後のプロジェクトを再開しました：${projectName}`, { exact: true })).toBeVisible({ timeout: 90_000 });
        await selectCaption(page, finalTitle); await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue(finalBody); await checkImages(page, 2);
        await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toBeVisible();
        await expect(page.locator('.lv-project-viewport-status')).toBeEmpty();
        await expect(page.getByRole('region', { name: '記録の競合', exact: true })).toBeHidden();
        const cold = await inspectBackup(await download(page, testInfo, `${person}-再起動後`, 'backup'), [glb, png, localPng]);
        const final = evidence.final as { history: string[][]; records: unknown; aBases: unknown; bBases: unknown };
        expect(cold.history).toEqual(final.history); expect(cold.records).toEqual(final.records);
        expect(cold.bases).toEqual(person === 'A' ? final.aBases : final.bBases);
        await page.screenshot({ path: testInfo.outputPath(`${person}-再起動後.png`), fullPage: true });
      }
    });
    expect(errors, 'uncaught browser errors').toEqual([]);
  } catch (error) {
    failed = true;
    for (const [person, context] of contexts) for (const page of context.pages()) {
      await page.screenshot({ path: testInfo.outputPath(`${person}-failure.png`), fullPage: true }).catch(() => {});
      await attachDiagnostics(person, context, '中断時');
    }
    throw error;
  } finally {
    const cleanup = await Promise.allSettled([...contexts.keys()].map(close));
    await Promise.allSettled([
      testInfo.attach('ブラウザ例外', { body: JSON.stringify(errors), contentType: 'application/json' }),
      testInfo.attach('実ファイルと履歴の証拠', { body: JSON.stringify(evidence), contentType: 'application/json' }),
    ]);
    const rejected = cleanup.find(result => result.status === 'rejected');
    if (!failed && rejected?.status === 'rejected') throw rejected.reason;
  }
});
