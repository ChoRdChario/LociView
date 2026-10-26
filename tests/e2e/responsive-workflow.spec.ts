import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as Automerge from '@automerge/automerge';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { nativeConversionBackup, triangleGlb, smallPng } from './fixtures';

const entry = `http://127.0.0.1:4182/dev.html?editor=project${process.env.LOCIVIEW_E2E_TIMINGS === '1' ? '&timings=1' : ''}`;
const title = 'Nativeから引き継ぐ記録', lastTitle = '100：長い日本語の記録名を狭い画面でも省略せず確認するための現地観察記録', body = '狭い画面から日本語の記録を継続する';
const imageDescription = '狭い画面で確認した現地写真';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const detail = (page: Page) => page.getByRole('region', { name: 'キャプションの詳細', exact: true });
const history = (source: { originalChanges(): Uint8Array[] }) => source.originalChanges().map(b => [sha(b), Buffer.from(b).toString('hex')]).sort((a, b) => a[0]!.localeCompare(b[0]!));

test('狭い画面とno-hover touchで100記録をキーボード移動し、編集・照合保存・完全再開できる', async ({}, info) => {
  Automerge.getHeads(Automerge.init()); const root = info.outputPath('profiles'); await mkdir(root, { recursive: true }); const profile = await mkdtemp(join(root, 'narrow-'));
  const model = triangleGlb(), image = smallPng(), input = await nativeConversionBackup(model, image, 100), inputPath = info.outputPath('100-caption-native.zip'); await writeFile(inputPath, input);
  const tracing = process.env.LOCIVIEW_E2E_TRACE !== '0', errors: string[] = [], observations: unknown[] = [];
  let context: BrowserContext | undefined, current: Page | undefined, phase = 0, failed = false;
  const launch = async () => {
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 320, height: 720 }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true, serviceWorkers: 'block' });
    context.setDefaultTimeout(15_000); await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === new URL(entry).origin || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient'); });
    if (tracing) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = context.pages()[0] ?? await context.newPage(); current = page; page.on('pageerror', e => errors.push(e.message)); await page.goto(entry); return page;
  };
  const close = async () => { const owned = context; context = undefined; if (!owned) return; try { if (tracing) await owned.tracing.stop({ path: info.outputPath(`narrow-${++phase}-trace.zip`) }); } finally { await owned.close(); } };
  const layout = async (page: Page, stage: string) => {
    const m = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, dpr: devicePixelRatio, hoverNone: matchMedia('(hover: none)').matches,
      overflow: Array.from(document.querySelectorAll<HTMLElement>('button,input,select,textarea,summary,h1,p')).filter(n => n.getClientRects().length && !n.closest('.lv-project-stage')).map(n => ({ tag: n.tagName, label: n.getAttribute('aria-label') || n.textContent?.slice(0, 70), x: n.getBoundingClientRect().x, right: n.getBoundingClientRect().right })).filter(n => n.x < -1 || n.right > innerWidth + 1).slice(0, 20) }));
    observations.push({ stage, ...m }); expect(m.scrollWidth, JSON.stringify(m)).toBeLessThanOrEqual(m.width + 1); expect(m.hoverNone).toBe(true);
  };
  const distinctFill = async (chosen: import('@playwright/test').Locator, other: import('@playwright/test').Locator) => {
    const fill = (n: HTMLElement | SVGElement) => getComputedStyle(n).backgroundColor;
    expect(await chosen.evaluate(fill)).not.toBe(await other.evaluate(fill));
  };
  const save = async (page: Page, name: string, verify: boolean) => {
    const files = page.getByRole('region', { name: 'ファイル', exact: true }); await files.getByRole('button', { name: '保存', exact: true }).tap(); await files.getByLabel('名前（任意）', { exact: true }).fill(name);
    await expect(files.getByRole('button', { name: 'ファイルに保存', exact: true })).toBeEnabled();
    await distinctFill(files.getByRole('button', { name: 'ファイルに保存', exact: true }), files.getByRole('button', { name: '保存', exact: true })); await layout(page, 'save');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), files.getByRole('button', { name: 'ファイルに保存', exact: true }).tap()]);
    const path = info.outputPath(`${name}.zip`); await download.saveAs(path); expect(await download.failure()).toBeNull();
    await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 90_000 });
    if (verify) {
      const rows = files.locator('details').filter({ has: page.locator('summary', { hasText: /^作成したファイル$/ }) }); await rows.locator('summary').first().tap();
      const row = rows.locator('section').filter({ hasText: `バックアップ ${name} —` }); await row.getByText('保存先のファイルを確認', { exact: true }).tap();
      const picker = page.waitForEvent('filechooser'); await row.getByRole('button', { name: 'ファイルを選択', exact: true }).tap(); await (await picker).setFiles(path);
      await expect(files.getByText('選択したファイルの内容を確認しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(page.getByLabel('保存ファイルの状態', { exact: true })).toHaveText('確定済みの内容は、選択した保存ファイルと一致しています。');
    }
    const backup = await BackupArchive.inspect(new Blob([new Uint8Array(await readFile(path)).buffer]), validationMetadataLimits), parsed = await inspectProjectCandidates(backup.source.read(), validationMetadataLimits);
    if (parsed.kind !== 'project-candidate-inspection') throw Error('metadata'); const records = parsed.unambiguousRecords as Record<string, any>;
    expect(Object.keys(records.captionsById)).toHaveLength(100); expect(Object.values(records.captionsById)).toContainEqual(expect.objectContaining({ title: lastTitle, body, anchor: expect.objectContaining({ positionAsset: [3, 0.5, 0] }) }));
    expect(Object.values(records.captionAttachmentsById)).toContainEqual(expect.objectContaining({ altText: imageDescription }));
    for (const bytes of [model, image]) expect(Buffer.from(await backup.archive.entryBytes(`blobs/sha256/${sha(bytes)}`, bytes.length))).toEqual(bytes);
    return { records, history: history(backup.source), heads: backup.source.heads, identity: backup.source.proof.identity };
  };
  try {
    let page = await launch(); const html = await page.request.get('http://127.0.0.1:4182/dev.html'); expect(sha(await html.body())).toBe(sha(await readFile('validation-dist/dev.html')));
    await info.attach('実行環境', { body: JSON.stringify({ browser: context!.browser()!.version(), node: process.version, platform: process.platform, headless: true, touchEmulation: true, physicalDevice: false, browserZoomTested: false, offline: false, tracing, route: entry, inputSha256: sha(input), assets: await Promise.all((await readdir('validation-dist/assets')).map(async name => ({ name, sha256: sha(await readFile(join('validation-dist/assets', name))) }))) }), contentType: 'application/json' });
    await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles(inputPath); await page.getByRole('button', { name: 'ファイルを開く', exact: true }).tap();
    await page.getByRole('button', { name: '新しいプロジェクトに変換', exact: true }).tap(); await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 });
    await expect(detail(page).getByLabel('タイトル', { exact: true })).toHaveAttribute('readonly', '');
    await expect(detail(page).getByLabel('タイトル', { exact: true })).toHaveCSS('border-style', 'dashed');
    await layout(page, 'opened320'); const files = page.getByRole('region', { name: 'ファイル', exact: true });
    for (const target of [files.getByRole('button', { name: '保存', exact: true }), files.getByRole('button', { name: '相手に渡す', exact: true })]) {
      const box = await target.boundingBox(); expect(box).toBeTruthy(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    const scene = page.getByRole('region', { name: 'シーン', exact: true });
    await distinctFill(scene.getByRole('button', { name: '観察', exact: true }), scene.getByRole('button', { name: '全体', exact: true }));
    const tabs = page.getByRole('tablist', { name: '作業', exact: true });
    await distinctFill(tabs.getByRole('tab', { name: 'キャプション', exact: true }), tabs.getByRole('tab', { name: 'モデル', exact: true })); await tabs.getByRole('tab', { name: 'キャプション', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'モデル', exact: true })).toBeFocused(); await page.keyboard.press('End'); await expect(tabs.getByRole('tab', { name: '材質', exact: true })).toBeFocused(); await page.keyboard.press('Home');
    const list = page.getByRole('list', { name: 'キャプション一覧', exact: true }); await expect(list.locator('.lv-caption-select')).toHaveCount(100);
    await list.locator('.lv-caption-select').first().focus();
    // At the accepted 100-row boundary the ordinary DOM tab order remains active.
    for (let n = 1; n < 100; n++) await page.keyboard.press('Tab');
    const last = list.locator('.lv-caption-select').filter({ hasText: lastTitle }); await expect(last).toBeFocused();
    expect(await last.evaluate(n => getComputedStyle(n).outlineStyle)).not.toBe('none'); await page.keyboard.press('Enter'); await expect(detail(page).getByLabel('タイトル', { exact: true })).toHaveValue(lastTitle);
    await distinctFill(last, list.locator('.lv-caption-select').first());
    const text = detail(page).getByLabel('本文', { exact: true }); await text.dispatchEvent('compositionstart'); await text.fill(body); await page.setViewportSize({ width: 568, height: 320 });
    await expect(page.getByRole('region', { name: 'シーン', exact: true }).getByRole('button', { name: '全体', exact: true })).toBeDisabled();
    await text.dispatchEvent('compositionend'); await expect(text).toHaveValue(body); await detail(page).getByRole('button', { name: '変更を適用', exact: true }).tap(); await expect(page.getByText('変更を適用しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
    const pins = page.getByRole('region', { name: 'ピンの操作', exact: true }); await pins.getByRole('button', { name: '位置を調整', exact: true }).tap(); await pins.getByLabel('位置 X', { exact: true }).fill('4.25');
    await pins.getByRole('button', { name: '取り消す', exact: true }).tap(); await layout(page, 'shortHeight');
    await page.setViewportSize({ width: 320, height: 720 }); await page.getByRole('region', { name: 'キャプション', exact: true }).getByLabel('検索', { exact: true }).fill('既存のピン'); await list.locator('.lv-caption-select').filter({ hasText: '既存のピン' }).tap();
    const gallery = page.getByRole('region', { name: '画像の整理', exact: true }), thumb = gallery.getByRole('button').filter({ has: page.locator('img') }).first();
    await gallery.getByRole('region', { name: '添付の編集', exact: true }).getByRole('button', { name: '説明を編集', exact: true }).first().tap();
    await gallery.getByLabel('メディアの説明', { exact: true }).fill(imageDescription); await gallery.getByRole('button', { name: '説明を適用', exact: true }).tap();
    await expect(page.getByText('メディアの説明を適用しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
    await thumb.tap(); const dialog = page.getByRole('dialog', { name: '画像ビューア', exact: true }); await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.locator('img').evaluateAll(nodes => nodes.length > 0 && nodes.every(n => n instanceof HTMLImageElement && n.complete && n.naturalWidth > 0))).toBe(true);
    await layout(page, 'imageOpen'); const imageBox = await dialog.boundingBox(); expect(imageBox).toBeTruthy(); expect(imageBox!.x).toBeGreaterThanOrEqual(0); expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(321);
    await page.screenshot({ path: info.outputPath('320pxの画像ビューア.png'), fullPage: true }); await page.keyboard.press('Escape'); await expect(thumb).toBeFocused();
    await layout(page, 'afterImage'); await page.screenshot({ path: info.outputPath('320pxで記録とファイル操作.png'), fullPage: true }); const first = await save(page, '狭い画面の保存', true);
    await close(); page = await launch(); await expect(page.getByText(`最後のプロジェクトを再開しました：${title}`, { exact: true })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('region', { name: 'キャプション', exact: true }).getByLabel('検索', { exact: true }).fill('100：'); await page.getByRole('list', { name: 'キャプション一覧', exact: true }).locator('.lv-caption-select').filter({ hasText: lastTitle }).tap();
    await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue(body); await layout(page, 'cold320'); const cold = await save(page, '狭い画面から再開', false); expect(cold).toEqual(first);
    expect(errors).toEqual([]); await page.screenshot({ path: info.outputPath('320pxで末尾の記録を再開.png'), fullPage: true });
  } catch (error) { failed = true; if (current) await current.screenshot({ path: info.outputPath('narrow-failure.png'), fullPage: true }).catch(() => {}); throw error; }
  finally { try { await close(); } catch (error) { if (!failed) throw error; } await info.attach('狭幅と入力の観測', { body: JSON.stringify({ errors, observations }), contentType: 'application/json' }); }
});
