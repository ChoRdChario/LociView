import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as Automerge from '@automerge/automerge';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { smallPng, triangleGlb } from './fixtures';

const entry = `http://127.0.0.1:4182/dev.html?editor=project${process.env.LOCIVIEW_E2E_TIMINGS === '1' ? '&timings=1' : ''}`;
const projectName = '自動検証のプロジェクト', captionName = '三角形の確認';
const body = '自動検証の本文\n画像と位置を保存します。';
const tracing = process.env.LOCIVIEW_E2E_TRACE !== '0';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function projectReady(page: Page) {
  await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(projectName, { timeout: 90_000 });
}
async function selectCaption(page: Page) {
  await projectReady(page);
  await page.getByRole('list', { name: 'キャプション一覧', exact: true })
    .locator('.lv-caption-select').filter({ hasText: captionName }).click();
}
async function checkCaption(page: Page, expectedBody = body) {
  const detail = page.getByRole('region', { name: 'キャプションの詳細', exact: true });
  await expect(detail.getByLabel('タイトル', { exact: true })).toHaveValue(captionName);
  await expect(detail.getByLabel('本文', { exact: true })).toHaveValue(expectedBody);
  const image = page.getByRole('region', { name: '画像の整理', exact: true }).locator('img').first();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth)).toBe(2);
}
async function inspectBackup(path: string, glb: Buffer, png: Buffer, expectedBody: string) {
  // Initialize the pinned Wasm shared by the slim source reader.
  Automerge.getHeads(Automerge.init());
  const bytes = await readFile(path);
  const archive = await BackupArchive.inspect(new Blob([new Uint8Array(bytes).buffer]), validationMetadataLimits);
  const inspection = await inspectProjectCandidates(archive.source.read(), validationMetadataLimits);
  expect(inspection.kind).toBe('project-candidate-inspection');
  if (inspection.kind !== 'project-candidate-inspection') throw Error('backup metadata rejected');
  const records = inspection.unambiguousRecords as Record<string, any>;
  expect(records.project.title).toBe(projectName);
  expect(Object.values(records.captionsById)).toEqual([expect.objectContaining({ title: captionName, body: expectedBody,
    anchor: expect.objectContaining({ kind: 'asset', positionAsset: [0.2, 0.2, 0] }) })]);
  expect(Object.keys(records.captionAttachmentsById)).toHaveLength(1);
  const manifest = archive.archive.control.manifest;
  if (manifest.purpose !== 'backup') throw Error('expected backup manifest');
  for (const input of [glb, png]) {
    const digest = sha256(input), descriptor = manifest.blobs.find(blob => blob.sha256 === digest);
    expect(descriptor, 'original input belongs to the backup closure').toBeTruthy();
    expect(Buffer.from(await archive.archive.entryBytes(`blobs/sha256/${digest}`, input.length))).toEqual(input);
  }
  return { identity: manifest.identity, sha256: sha256(bytes), bytes: bytes.length };
}
async function saveBackup(page: Page, path: string, name: string) {
  const files = page.getByRole('region', { name: 'ファイル', exact: true });
  await files.getByRole('button', { name: '保存', exact: true }).click();
  await files.getByLabel('名前（任意）', { exact: true }).fill(name);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    files.getByRole('button', { name: 'ファイルに保存', exact: true }).click(),
  ]);
  await download.saveAs(path); expect(await download.failure()).toBeNull();
  const history = files.locator('details').filter({ has: page.locator('summary', { hasText: /^作成したファイル$/ }) });
  await history.locator('summary').first().click();
  const row = history.locator('section').filter({ hasText: `バックアップ ${name} —` });
  await row.getByText('保存先のファイルを確認', { exact: true }).click();
  const choosing = page.waitForEvent('filechooser');
  await row.getByRole('button', { name: 'ファイルを選択', exact: true }).click();
  await (await choosing).setFiles(path);
  await expect(files.getByText('選択したファイルの内容を確認しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByLabel('保存ファイルの状態', { exact: true }))
    .toHaveText('確定済みの内容は、選択した保存ファイルと一致しています。');
}

test('GLBと画像の編集を保存し、ブラウザ再起動と別端末相当の復元から続けられる', async ({}, testInfo) => {
  const root = testInfo.outputPath('profiles'); await mkdir(root, { recursive: true });
  const profile = await mkdtemp(join(root, 'workflow-'));
  const restoredProfile = await mkdtemp(join(root, 'restored-'));
  const glb = triangleGlb(), png = smallPng(), errors: string[] = [], timings: Record<string, number> = {};
  let currentPage: Page | undefined;
  const timingSnapshot = async () => currentPage?.evaluate(() => {
    document.dispatchEvent(new Event('lociview-timing-snapshot'));
    return performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('lociview.')).map(entry => ({
      stage: entry.name, milliseconds: entry.duration, start: entry.startTime, detail: (entry as PerformanceMeasure).detail,
    }));
  });
  const measure = async <T>(name: string, action: () => Promise<T>) => {
    const before = await timingSnapshot().catch(() => undefined);
    await currentPage?.evaluate(() => performance.clearMeasures()).catch(() => undefined);
    const started = performance.now();
    try { return await action(); } finally {
      timings[name] = Math.round(performance.now() - started); console.info(`${name}: ${timings[name]}ms`);
      // Diagnostics must not replace an action failure if its page has closed.
      const after = await timingSnapshot().catch(() => undefined);
      await testInfo.attach(`段階別計測 ${name}`, { body: JSON.stringify({ before: before?.at(-1), after }), contentType: 'application/json' }).catch(() => undefined);
    }
  };
  let context: BrowserContext | undefined, phase = 0;
  const launch = async (userDataDir: string) => {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
      acceptDownloads: true, serviceWorkers: 'block',
    });
    context.setDefaultTimeout(15_000); context.setDefaultNavigationTimeout(15_000);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === new URL(entry).origin || ['blob:', 'data:'].includes(url.protocol)
        ? route.continue() : route.abort('blockedbyclient');
    });
    if (tracing) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = context.pages()[0] ?? await context.newPage();
    currentPage = page;
    page.on('pageerror', error => errors.push(error.message));
    return page;
  };
  const close = async () => {
    const owned = context; context = undefined;
    if (!owned) return;
    try {
      if (tracing) {
        const path = testInfo.outputPath(`phase-${++phase}.zip`);
        await owned.tracing.stop({ path }); await testInfo.attach(`操作記録 ${phase}`, { path, contentType: 'application/zip' });
      }
    } finally { await owned.close(); }
  };
  try {
    let page = await launch(profile);
    await page.goto(entry);
    const html = await page.request.get('http://127.0.0.1:4182/dev.html');
    expect(sha256(await html.body())).toBe(sha256(await readFile('validation-dist/dev.html')));
    const assets = await readdir('validation-dist/assets');
    await testInfo.attach('実行環境', { body: JSON.stringify({ browser: context!.browser()!.version(), headless: true, tracing,
      node: process.version, platform: process.platform, route: entry,
      assets: await Promise.all(assets.map(async name => ({ name, sha256: sha256(await readFile(join('validation-dist/assets', name))) }))) }, null, 2), contentType: 'application/json' });
    await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'triangle.glb', mimeType: 'model/gltf-binary', buffer: glb });
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await page.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill(projectName);
    await page.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(projectName);
    await expect(page.locator('.lv-project-viewport-status')).toBeEmpty();
    await page.getByText('数値で配置', { exact: true }).click();
    const model = page.getByLabel('追加先モデル', { exact: true }); await model.focus();
    const options = await model.locator('option').evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value).filter(Boolean));
    expect(options).toHaveLength(1); await model.selectOption(options[0]!);
    await page.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const [axis, value] of [['X', '0.2'], ['Y', '0.2'], ['Z', '0']] as const) await page.getByLabel(`位置 ${axis}`, { exact: true }).fill(value);
    await page.getByRole('button', { name: '位置を確定', exact: true }).click();
    await expect(page.getByText('ピンの位置を確定しました。', { exact: true })).toBeVisible();
    const detail = page.getByRole('region', { name: 'キャプションの詳細', exact: true });
    await detail.getByLabel('タイトル', { exact: true }).fill(captionName);
    await detail.getByLabel('本文', { exact: true }).fill(body);
    await detail.getByRole('button', { name: '変更を適用', exact: true }).click();
    await expect(page.getByText('変更を適用しました。', { exact: true })).toBeVisible();
    const choosing = page.waitForEvent('filechooser');
    await page.getByLabel('メディアを追加', { exact: true }).click();
    await (await choosing).setFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('メディアを追加しました。', { exact: true })).toBeVisible();
    await checkCaption(page);
    const backup = testInfo.outputPath('first-backup.zip'); await measure('最初の保存と実ファイル確認', () => saveBackup(page, backup, '最初の保存'));
    const first = await inspectBackup(backup, glb, png, body);
    await measure('通常の再読込から編集画面の準備', async () => { await page.reload(); await projectReady(page); });
    await selectCaption(page); await checkCaption(page);
    await expect(page.getByLabel('保存ファイルの状態', { exact: true })).toContainText('一致しています');
    await close();

    page = await measure('完全終了後の起動と再開', async () => {
      const resumed = await launch(profile); await resumed.goto(entry);
      await expect(resumed.getByText(`最後のプロジェクトを再開しました：${projectName}`, { exact: true })).toBeVisible({ timeout: 90_000 });
      return resumed;
    });
    await selectCaption(page); await checkCaption(page);
    await page.screenshot({ path: testInfo.outputPath('cold-resume.png'), fullPage: true });
    await close();

    page = await launch(restoredProfile); await page.goto(entry);
    await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles(backup);
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await measure('空の保存領域への初回復元', async () => {
      await page.getByRole('button', { name: 'バックアップから復元', exact: true }).click();
      await expect(page.getByText('バックアップから復元しています。', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'バックアップから復元', exact: true })).toBeDisabled();
      await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(projectName, { timeout: 90_000 });
    });
    await selectCaption(page); await checkCaption(page);
    const continued = `${body}\n復元後も編集を続けました。`;
    const restoredDetail = page.getByRole('region', { name: 'キャプションの詳細', exact: true });
    await restoredDetail.getByLabel('本文', { exact: true }).fill(continued);
    await measure('復元後の本文適用', async () => {
      await restoredDetail.getByRole('button', { name: '変更を適用', exact: true }).click();
      await expect(page.getByText('変更を適用しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
    });
    const secondPath = testInfo.outputPath('restored-backup.zip'); await measure('復元後の保存と実ファイル確認', () => saveBackup(page, secondPath, '復元後の保存'));
    const second = await inspectBackup(secondPath, glb, png, continued);
    expect(second.identity).toEqual(first.identity);
    await measure('復元後の再読込から編集画面の準備', async () => { await page.reload(); await projectReady(page); });
    await selectCaption(page); await checkCaption(page, continued);
    await page.screenshot({ path: testInfo.outputPath('restored-edit.png'), fullPage: true });
    await testInfo.attach('保存ファイル検査', { body: JSON.stringify({ first, second }, null, 2), contentType: 'application/json' });
    expect(errors, 'uncaught browser errors').toEqual([]);
  } catch (error) {
    if (context) {
      for (const page of context.pages()) {
        await page.screenshot({ path: testInfo.outputPath('failure.png'), fullPage: true }).catch(() => {});
        const locks = await page.evaluate(() => navigator.locks.query()).catch(() => null);
        await testInfo.attach('テスト専用ブラウザのロック状態', { body: JSON.stringify(locks), contentType: 'application/json' });
      }
    }
    throw error;
  } finally {
    await close();
    await testInfo.attach('ブラウザ例外', { body: JSON.stringify(errors), contentType: 'application/json' });
    await testInfo.attach('操作全体の実時間（内訳未分離・性能受入れではない）', { body: JSON.stringify(timings, null, 2), contentType: 'application/json' });
  }
});
