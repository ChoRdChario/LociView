import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as Automerge from '@automerge/automerge';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { nativeConversionBackup, frozenV1ConversionBackup, lociMyuConversionBackup, triangleGlb, smallPng } from './fixtures';

const entry = `http://127.0.0.1:4182/dev.html?editor=project${process.env.LOCIVIEW_E2E_TIMINGS === '1' ? '&timings=1' : ''}`;
const body = '変換した記録にブラウザで追記した本文';
const lanes = [
  { kind: 'Native', summary: 'Nativeファイル', title: 'Nativeから引き継ぐ記録', build: nativeConversionBackup, scene: '観察', caption: '既存のピン', previousBody: '本文を保持', emptyTitle: '未配置の記録', position: [3, 0.5, 0], assets: 2, scenes: 2, captions: 2, media: 2, attachments: 2, images: 2 },
  { kind: '旧LociView', summary: '旧LociViewファイル', title: '旧形式の記録', build: frozenV1ConversionBackup, scene: '観察', caption: '配置済み', previousBody: '元の本文', emptyTitle: '', position: [0.25, 0.5, 0], assets: 1, scenes: 2, captions: 3, media: 2, attachments: 3, images: 3 },
  { kind: 'LociMyu', summary: 'LociMyu', title: 'LociMyuから引き継ぐ記録', build: lociMyuConversionBackup, scene: 'records', caption: '配置済み', previousBody: '元の本文', emptyTitle: '未配置の記録', position: [0.2, 0.2, 0], assets: 1, scenes: 1, captions: 2, media: 1, attachments: 2, images: 1 },
];
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const detail = (page: Page) => page.getByRole('region', { name: 'キャプションの詳細', exact: true });
const history = (source: { originalChanges(): Uint8Array[] }) => source.originalChanges().map(bytes => [sha(bytes), Buffer.from(bytes).toString('hex')]).sort((a, b) => a[0]!.localeCompare(b[0]!));

for (const lane of lanes) test(`${lane.kind}ファイルを内容確認して変換し、既存の記録と画像を編集・照合保存・完全再開できる`, async ({}, info) => {
  const { title } = lane;
  Automerge.getHeads(Automerge.init());
  const root = info.outputPath('profiles'); await mkdir(root, { recursive: true }); const profile = await mkdtemp(join(root, 'native-'));
  const model = triangleGlb(), image = smallPng(), input = await lane.build(model, image), errors: string[] = [];
  const tracing = process.env.LOCIVIEW_E2E_TRACE !== '0', stages: Record<string, number> = {};
  let context: BrowserContext | undefined, current: Page | undefined, phase = 0, failed = false;
  const launch = async () => {
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
    context.setDefaultTimeout(15_000);
    await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === new URL(entry).origin || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient'); });
    if (tracing) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = context.pages()[0] ?? await context.newPage(); current = page; page.on('pageerror', error => errors.push(error.message)); await page.goto(entry); return page;
  };
  const close = async () => {
    const owned = context; context = undefined; if (!owned) return;
    try { for (const page of owned.pages()) await info.attach('終了前の計測', { body: JSON.stringify(await page.evaluate(async () => {
      document.dispatchEvent(new Event('lociview-timing-snapshot')); return { locks: await navigator.locks.query(), measures: performance.getEntriesByType('measure').filter(e => e.name.startsWith('lociview.')).map(e => ({ name: e.name, duration: e.duration, detail: (e as PerformanceMeasure).detail })) };
    })), contentType: 'application/json' }); if (tracing) await owned.tracing.stop({ path: info.outputPath(`native-${++phase}-trace.zip`) }); }
    finally { await owned.close(); }
  };
  const step = async (name: string, action: () => Promise<void>) => { const start = performance.now(); try { await test.step(name, action); } finally { stages[name] = Math.round(performance.now() - start); console.info(`${name}: ${stages[name]}ms`); } };
  const check = async (page: Page) => {
    await expect(page.getByRole('region', { name: 'シーン', exact: true }).getByRole('button', { name: lane.scene, exact: true })).toHaveAttribute('aria-pressed', 'true');
    const list = page.getByRole('list', { name: 'キャプション一覧', exact: true }); await expect(list.locator('.lv-caption-select')).toHaveCount(2);
    await list.locator('.lv-caption-select').filter({ hasText: lane.caption }).click();
    await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue(body);
    const images = page.getByRole('region', { name: '画像の整理', exact: true }).locator('img'); await expect(images).toHaveCount(lane.images);
    for (const item of await images.all()) await expect.poll(() => item.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth)).toBe(2);
    await expect(page.locator('.lv-project-viewport-status')).toBeEmpty(); await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toBeVisible();
  };
  const save = async (page: Page, name: string, verify = false) => {
    const files = page.getByRole('region', { name: 'ファイル', exact: true }); await files.getByRole('button', { name: '保存', exact: true }).click();
    await files.getByLabel('名前（任意）', { exact: true }).fill(name);
    const [file] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), files.getByRole('button', { name: 'ファイルに保存', exact: true }).click()]);
    const path = info.outputPath(`${name}.zip`); await file.saveAs(path); expect(await file.failure()).toBeNull();
    await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 90_000 });
    if (verify) {
      const history = files.locator('details').filter({ has: page.locator('summary', { hasText: /^作成したファイル$/ }) }); await history.locator('summary').first().click();
      const row = history.locator('section').filter({ hasText: `バックアップ ${name} —` }); await row.getByText('保存先のファイルを確認', { exact: true }).click();
      const chooser = page.waitForEvent('filechooser'); await row.getByRole('button', { name: 'ファイルを選択', exact: true }).click(); await (await chooser).setFiles(path);
      await expect(files.getByText('選択したファイルの内容を確認しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(page.getByLabel('保存ファイルの状態', { exact: true })).toHaveText('確定済みの内容は、選択した保存ファイルと一致しています。');
    }
    const archive = await BackupArchive.inspect(new Blob([new Uint8Array(await readFile(path)).buffer]), validationMetadataLimits);
    const inspected = await inspectProjectCandidates(archive.source.read(), validationMetadataLimits); if (inspected.kind !== 'project-candidate-inspection') throw Error('converted metadata rejected');
    const records = inspected.unambiguousRecords as Record<string, any>, manifest = archive.archive.control.manifest;
    if (manifest.purpose !== 'backup') throw Error('backup purpose');
    expect(records.project.title).toBe(title); expect(Object.keys(records.assetsById)).toHaveLength(lane.assets); expect(Object.keys(records.scenesById)).toHaveLength(lane.scenes); expect(Object.keys(records.captionsById)).toHaveLength(lane.captions);
    expect(Object.values(records.captionsById)).toEqual(expect.arrayContaining([expect.objectContaining({ title: lane.caption, body, anchor: expect.objectContaining({ positionAsset: lane.position }) }), expect.objectContaining({ title: lane.emptyTitle, anchor: expect.objectContaining({ kind: 'unplaced' }) })]));
    expect(Object.keys(records.mediaResourcesById)).toHaveLength(lane.media); expect(Object.keys(records.captionAttachmentsById)).toHaveLength(lane.attachments);
    if (lane.kind === 'LociMyu') expect((Object.values(records.captionsById) as any[]).find(row => row.title === lane.emptyTitle).anchor.ownerAssetId).toBe(Object.keys(records.assetsById)[0]);
    if (lane.kind === '旧LociView') expect((Object.values(records.captionsById) as any[]).find(row => row.title === '親だけの記録').anchor).toEqual({ kind: 'unplaced', ownerAssetId: Object.keys(records.assetsById)[0] });
    expect(manifest.blobs).toHaveLength(2); expect(manifest.blobs.some(row => row.sha256 === sha(input))).toBe(false);
    for (const bytes of [model, image]) expect(Buffer.from(await archive.archive.entryBytes(`blobs/sha256/${sha(bytes)}`, bytes.length))).toEqual(bytes);
    return { records, history: history(archive.source), heads: archive.source.heads, identity: manifest.identity };
  };
  try {
    let page = await launch();
    const html = await page.request.get('http://127.0.0.1:4182/dev.html'); expect(sha(await html.body())).toBe(sha(await readFile('validation-dist/dev.html')));
    await info.attach('実行環境', { body: JSON.stringify({ browser: context!.browser()!.version(), node: process.version, platform: process.platform, headless: true, tracing, route: entry,
      assets: await Promise.all((await readdir('validation-dist/assets')).map(async name => ({ name, sha256: sha(await readFile(join('validation-dist/assets', name))) }))) }), contentType: 'application/json' });
    await step(`${lane.kind}の内容と原本保管を確認して変換し、既存の記録を編集する`, async () => {
      const preview = async () => {
        await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: `${lane.kind}-backup.zip`, mimeType: 'application/zip', buffer: input });
        await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
        const convert = page.getByRole('button', { name: '新しいプロジェクトに変換', exact: true }); await expect(convert).toBeVisible({ timeout: 90_000 });
        if (lane.kind === 'LociMyu') {
          await expect(page.getByLabel('変換する表', { exact: true }).locator('option:checked')).toContainText('records.csv');
          await page.getByLabel('変換後のプロジェクト名', { exact: true }).fill(title); await page.getByRole('button', { name: '変換内容を確認', exact: true }).click();
          await expect(convert).toBeEnabled({ timeout: 90_000 }); await expect(page.getByLabel('表と視点・材質の関連付けを確認', { exact: true })).toBeHidden();
        }
        await expect(convert.locator('..')).toContainText(lane.summary); await expect(page.getByRole('button', { name: 'プロジェクトを作成', exact: true })).toBeHidden(); return convert;
      };
      let convert = await preview(); const help = lane.kind === 'LociMyu' ? '元ZIPと変換の説明を別に保管してください。変換後のバックアップや共有ファイルには元データと説明は含まれません。' : '元ファイルは変更しません。チームでは変換後のファイルを使ってください。元ファイルは書き出しに含まれないため、別に保管してください。'; await expect(page.getByText(help, { exact: true })).toBeVisible();
      await convert.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`${lane.kind}変換前の確認.png`), fullPage: true });
      await page.getByRole('button', { name: 'キャンセル', exact: true }).click(); await expect(convert).toBeHidden(); convert = await preview(); await convert.click();
      await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 });
      await page.getByRole('list', { name: 'キャプション一覧', exact: true }).locator('.lv-caption-select').filter({ hasText: lane.caption }).click();
      await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue(lane.previousBody); await detail(page).getByLabel('本文', { exact: true }).fill(body);
      await detail(page).getByRole('button', { name: '変更を適用', exact: true }).click(); await expect(page.getByText('変更を適用しました。', { exact: true })).toBeVisible({ timeout: 90_000 }); await check(page);
    });
    let saved!: Awaited<ReturnType<typeof save>>;
    await step('実際の保存ファイルを選び直して照合する', async () => { saved = await save(page, `${lane.kind}変換後の保存`, true); });
    await step('完全終了から同じ記録と画像を再開し、新しい保存も照合する', async () => {
      await close(); page = await launch(); await expect(page.getByText(`最後のプロジェクトを再開しました：${title}`, { exact: true })).toBeVisible({ timeout: 90_000 });
      await check(page); const cold = await save(page, `${lane.kind}再開後の保存`); expect(cold).toEqual(saved);
      await page.screenshot({ path: info.outputPath(`${lane.kind}変換から編集を再開.png`), fullPage: true });
      await info.attach('変換後の記録と原本bytes', { body: JSON.stringify({ ...cold, sourceArchiveSha256: sha(input), modelSha256: sha(model), imageSha256: sha(image) }), contentType: 'application/json' });
    }); expect(errors).toEqual([]);
  } catch (error) { failed = true; if (current) await current.screenshot({ path: info.outputPath(`${lane.kind}-failure.png`), fullPage: true }).catch(() => {}); throw error; }
  finally { try { await close(); } catch (error) { if (!failed) throw error; }
    await info.attach('ブラウザ例外と段階', { body: JSON.stringify({ errors, stages }), contentType: 'application/json' }); }
});
