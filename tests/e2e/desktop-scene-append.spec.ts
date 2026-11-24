import { createHash } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import * as A from '@automerge/automerge';
import { chromium, expect, test, type Page } from '@playwright/test';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { ReviewArchive } from '../../src/projectPackage/reviewArchive';
import { selectCleanRecords } from '../../src/projectPackage/cleanRecords';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { ownedServer } from '../offline-e2e/server';
import { smallPng, triangleGlb } from './fixtures';
import { finishCaptionEditing, chooseHomeFiles, revealReviewFiles, openAddOptions, chooseSharedScene, beginSceneCreation, revealCoordinateAdd, revealFileSurface, selectShareOutput, revealCaptionList, revealModelManagement, revealWorkPanel, lookAlongFront } from './workspaceUi';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const files = (page: Page) => page.getByRole('region', { name: 'ファイル', exact: true });
const ready = (page: Page) => expect(button(page, '閲覧する')).toBeEnabled({ timeout: 90_000 });
async function selectFile(page: Page, file: Parameters<ReturnType<Page['getByLabel']>['setInputFiles']>[0]) {
  await chooseHomeFiles(page, file);
}
async function createProject(page: Page, title: string, z: number) {
  await selectFile(page, { name: '共通名.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb(z) });
  await page.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill(title);
  await button(page, 'プロジェクトを作成').click();
  await ready(page);
}
async function downloadTo(page: Page, path: string) {
  const download = page.waitForEvent('download');
  await files(page).locator('.lv-file-primary').click();
  await (await download).saveAs(path);
  expect(await (await download).failure()).toBeNull();
  await expect(files(page).locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false');
}
async function backup(page: Page, path: string) {
  await revealFileSurface(page, '保存');
  await downloadTo(page, path);
  return BackupArchive.inspect(await openAsBlob(path), validationMetadataLimits);
}

for (const touch of [false, true]) test(`08e local replacement keeps the other scene and shared photo after reopening (${touch ? 'touch' : 'desktop'})`, async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: touch, hasTouch: touch, acceptDownloads: true, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL!); await createProject(page, 'シーン別の整備記録', 0);
    const scenes = page.getByRole('combobox', { name: 'シーン', exact: true });
    const detail = page.getByRole('region', { name: '記録の詳細', exact: true });
    const pin = page.getByRole('region', { name: '位置の調整', exact: true });
    const row = page.locator('.lv-caption-select').filter({ hasText: '共用する記録' });
    const panel = page.getByRole('tabpanel', { name: 'モデル', exact: true });
    const choose = async (name: string) => {
      await revealCaptionList(page);
      await scenes.selectOption({ label: name });
      await expect(row).toBeVisible();
    };
    const modelPanel = async () => {
      await revealWorkPanel(page); await page.getByRole('tab', { name: 'モデル', exact: true }).click();
      await panel.locator('.lv-model-select').first().click();
    };
    await revealCaptionList(page);
    await button(page, '新規ピンを追加').click();
    await button(page, '原点から調整').click();
    await pin.getByRole('button', { name: 'ここに記録を作る', exact: true }).click();
    await detail.getByLabel('タイトル', { exact: true }).fill('共用する記録');
    await detail.getByLabel('本文', { exact: true }).fill('同じ部位の写真');
    await finishCaptionEditing(page, { body: '同じ部位の写真' });
    const picker = page.waitForEvent('filechooser');
    await detail.getByLabel('メディアを追加', { exact: true }).click();
    await (await picker).setFiles({ name: '部位の写真.png', mimeType: 'image/png', buffer: smallPng() });
    await finishCaptionEditing(page);
    await revealCaptionList(page);
    await beginSceneCreation(page); await page.getByLabel('シーン名', { exact: true }).fill('差し替え側');
    await button(page, 'シーンを追加').click();
    await expect(scenes.locator('option:checked')).toHaveText('差し替え側');
    await openAddOptions(page);
    const include = page.getByLabel('既存の記録を追加', { exact: true });
    await include.locator(':scope > summary').click();
    await include.getByRole('listbox').selectOption({ label: '共用する記録 — 共通名.glb' });
    await include.getByRole('button', { name: 'このシーンに追加', exact: true }).click();
    await expect(row).toBeVisible();
    await modelPanel(); await button(page, '配置を調整').click();
    await panel.getByLabel('位置 X', { exact: true }).fill('0.25');
    await button(page, '配置を確定').click();
    await expect(page.getByText('モデルの配置を確定しました。', { exact: true })).toBeVisible();
    await revealModelManagement(page);
    const replacement = page.waitForEvent('filechooser');
    await button(page, 'モデルを差し替える').click();
    await (await replacement).setFiles({ name: '新しい部品.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb(.5) });
    await button(page, '差し替えを確定').click();
    await revealCaptionList(page);
    await expect(row.locator('..')).toContainText('要確認');
    await choose('シーン 1'); await expect(row.locator('..')).not.toContainText('要確認');
    await choose('差し替え側'); await row.click(); await revealCaptionList(page);
    const settings = page.getByLabel('設定', { exact: true });
    await settings.locator(':scope > summary').click();
    await settings.getByLabel('編集者名', { exact: true }).fill('補正担当');
    await settings.getByLabel('このプロジェクトの今後の編集にこの名前を残す', { exact: true }).check();
    await settings.getByRole('button', { name: '編集者名を設定', exact: true }).click();
    await expect(settings.getByRole('status')).toHaveText('編集者名の設定を保存しました。');
    await settings.locator(':scope > summary').click();
    await button(page, '位置を調整').click(); await lookAlongFront(page);
    await button(page, '全体表示').click();
    const canvas = page.getByLabel('3Dモデルの表示', { exact: true });
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(pin.getByRole('button', { name: '位置を確定', exact: true })).toBeEnabled();
    await pin.getByText('座標で微調整', { exact: true }).click();
    await pin.getByLabel('位置 X', { exact: true }).fill('0.125');
    await button(page, '位置を確定').click();
    await expect(page.getByText('ピンの位置を確定しました。', { exact: true })).toBeVisible();
    const archive = await backup(page, info.outputPath('シーン別配置.zip'));
    const records = await selectCleanRecords(archive.source, validationMetadataLimits);
    expect(Object.keys(records.captionsById!)).toHaveLength(1);
    expect(Object.values(records.captionsById!)[0]).toMatchObject({ anchor: { positionAsset: [0, 0, 0] } });
    expect(Object.keys(records.captionAttachmentsById!)).toHaveLength(1);
    expect(Object.values(records.sceneCaptionMembershipsById!)).toEqual(expect.arrayContaining([
      expect.objectContaining({ anchor: expect.objectContaining({ positionAsset: [.125, expect.any(Number), expect.closeTo(.5, 8)] }) }),
    ]));
    const hashes = archive.archive.control.manifest.blobs.map(blob => blob.sha256);
    for (const bytes of [triangleGlb(0), triangleGlb(.5), smallPng()]) expect(hashes).toContain(createHash('sha256').update(bytes).digest('hex'));
    await page.reload(); await ready(page);
    for (const [name, x] of [['シーン 1', 0], ['差し替え側', .25]] as const) {
      await choose(name); await expect(row.locator('..')).not.toContainText('要確認');
      await row.click();
      await expect(detail.getByLabel('本文', { exact: true })).toHaveValue('同じ部位の写真');
      await expect(detail.locator('figure')).toHaveCount(1);
      const summary = detail.getByText('編集者情報', { exact: true });
      if (!await summary.locator('..').evaluate(n => (n as HTMLDetailsElement).open)) await summary.click();
      await expect(summary.locator('..').getByRole('listitem').filter({ hasText: 'ピン位置' }))
        .toContainText(name === '差し替え側' ? '編集者名：補正担当' : '編集者情報なし');
      await modelPanel(); await button(page, '配置を調整').click();
      expect(Number(await panel.getByLabel('位置 X', { exact: true }).inputValue())).toBe(x);
      await panel.getByRole('button', { name: '配置を取り消す', exact: true }).click();
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

for (const scenario of [
  { title: 'desktop append', touch: false, interrupt: '' },
  { title: 'desktop reselect before preparation', touch: false, interrupt: 'blobsVerified.json' },
  { title: 'phone retry after preparation', touch: true, interrupt: 'published.json' },
]) test(`06d ${scenario.title}`, async ({}, info) => {
  A.getHeads(A.init());
  const server = await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT ?? (scenario.touch ? 'offline-desktop-dist' : 'desktop-dist'));
  const browser = await chromium.launch({ channel: 'chromium' });
  try {
    const sender = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
    const source = await sender.newPage(); await source.goto(server.url); await createProject(source, '送る側', 2);
    await beginSceneCreation(source); await source.getByLabel('シーン名', { exact: true }).fill('点検シーン');
    await button(source, 'シーンを追加').click(); await expect(source.getByText('シーンを追加しました。', { exact: true })).toBeVisible();
    await revealCoordinateAdd(source); await source.getByLabel('追加先モデル', { exact: true }).focus();
    await source.getByLabel('追加先モデル', { exact: true }).selectOption({ label: '共通名.glb' });
    await button(source, 'このモデルに追加').click();
    const pin = source.getByRole('region', { name: '位置の調整', exact: true });
    for (const axis of ['X', 'Y', 'Z']) await pin.getByLabel(`位置 ${axis}`, { exact: true }).fill(axis === 'Y' ? '.5' : '0');
    await button(source, 'ここに記録を作る').click(); await expect(source.getByText('ピンの位置を確定しました。', { exact: true })).toBeVisible();
    const detail = source.getByRole('region', { name: '記録の詳細', exact: true });
    await detail.getByLabel('タイトル', { exact: true }).fill('継承したピン');
    await detail.getByLabel('本文', { exact: true }).fill('継承した本文');
    await finishCaptionEditing(source, {});
    const photo = smallPng();
    const chooser = source.waitForEvent('filechooser'); await source.getByLabel('メディアを追加', { exact: true }).click();
    await (await chooser).setFiles({ name: '点検写真.png', mimeType: 'image/png', buffer: photo });
    await finishCaptionEditing(source, {});
    if (scenario.interrupt) {
      await source.getByRole('combobox', { name: 'シーン', exact: true }).selectOption({ label: 'シーン 1' });
      await openAddOptions(source);
      const existing = source.getByLabel('既存の記録を追加', { exact: true });
      await existing.locator(':scope > summary').click();
      await existing.getByRole('listbox').selectOption({ label: '継承したピン — 共通名.glb' });
      await existing.getByRole('button', { name: 'このシーンに追加', exact: true }).click();
      await expect(source.getByText('このシーンに追加しました。', { exact: true })).toBeVisible();
    }
    await source.getByRole('tab', { name: 'モデル', exact: true }).click();
    const models = source.getByRole('tabpanel', { name: 'モデル', exact: true });
    await models.locator('.lv-model-select').filter({hasText: '共通名.glb'}).click();
    await models.getByRole('button', { name: '隠す', exact: true }).click();
    await expect(models.getByRole('button', { name: '表示', exact: true })).toBeVisible();
    await revealFileSurface(source, '共有'); await selectShareOutput(files(source), 'review');
    await chooseSharedScene(files(source),'点検シーン');
    if (scenario.interrupt) await chooseSharedScene(files(source), 'シーン 1');
    await files(source).getByRole('button', { name: '内容を確認', exact: true }).click();
    const contents = files(source).locator('.lv-share-contents'); await expect(contents).toBeVisible();
    await contents.locator(':scope > summary').click();
    await expect(contents.getByRole('listitem').filter({hasText: /^共通名\.glb$/})).toHaveCount(1);
    await expect(contents.getByRole('listitem').filter({hasText: /^点検写真\.png$/})).toHaveCount(1);
    const zip = info.outputPath('scene.zip'); await downloadTo(source, zip);
    const shared = await ReviewArchive.inspect(await openAsBlob(zip), validationMetadataLimits);
    expect(shared.archive.control.manifest.blobs.map(entry => entry.sha256).sort()).toEqual(
      [triangleGlb(2), photo].map(bytes => createHash('sha256').update(bytes).digest('hex')).sort());
    expect(shared.review.summary.entityClasses.find(entry => entry.class === 'scenesById')?.count).toBe(scenario.interrupt ? 2 : 1);
    await sender.close();

    const receiver = await browser.newContext({ viewport: scenario.touch ? { width: 320, height: 568 } : { width: 1440, height: 1000 },
      isMobile: scenario.touch, hasTouch: scenario.touch, deviceScaleFactor: scenario.touch ? 2 : 1, serviceWorkers: 'block', acceptDownloads: true });
    await receiver.addInitScript(() => {
      const open = FileSystemDirectoryHandle.prototype.getFileHandle;
      FileSystemDirectoryHandle.prototype.getFileHandle = function (name, options) {
        if (options?.create && sessionStorage.getItem('append-fail-once') === name) {
          sessionStorage.removeItem('append-fail-once');
          sessionStorage.setItem('append-failed', name);
          return Promise.reject(new DOMException('検証用の保存中断', 'AbortError'));
        }
        return open.call(this, name, options);
      };
    });
    let page = await receiver.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url); await createProject(page, '追加先プロジェクト', 0);
    const before = await backup(page, info.outputPath('before.zip'));
    const previous = await selectCleanRecords(before.source, validationMetadataLimits);
    await page.locator('details.lv-project-files').getByRole('button', { name: 'プロジェクトを選ぶ', exact: true }).click(); await selectFile(page, zip);
    const review = page.getByRole('main', { name: '閲覧用のシーン' });
    const panel = review.getByRole('region', { name: 'シーンの追加' });
    await revealReviewFiles(review);
    const open = review.getByRole('button', { name: '既存に追加', exact: true });
    await (scenario.touch ? open.tap() : open.click());
    await expect(panel).toContainText('モデル 1・記録 1・メディア 1');
    const select = panel.getByLabel('追加先', { exact: true });
    await select.selectOption({ label: '追加先プロジェクト' });
    const confirm = panel.getByRole('button', { name: 'シーンを追加', exact: true });
    await expect(confirm).toBeEnabled();
    await panel.getByRole('button', { name: 'キャンセル', exact: true }).click(); await expect(panel).toBeHidden();
    await (scenario.touch ? open.tap() : open.click());
    await select.selectOption({ label: '追加先プロジェクト' }); await expect(confirm).toBeEnabled();
    if (!scenario.touch && !scenario.interrupt) {
      const other = await receiver.newPage(); await other.goto(`${server.url}?run=${String(before.source.proof.identity.projectId).slice(4)}`);
      await ready(other);
      await confirm.click(); await expect(panel).toContainText('別のタブで開いている場合は閉じてください');
      await expect(review).toBeVisible();
      await select.selectOption({ label: '追加先プロジェクト' }); await expect(confirm).toBeEnabled();
      await beginSceneCreation(other); await other.getByLabel('シーン名', { exact: true }).fill('別タブで追加');
      await button(other, 'シーンを追加').click(); await expect(other.getByText('シーンを追加しました。', { exact: true })).toBeVisible();
      await other.close();
      await confirm.click(); await expect(panel).toContainText('追加先が更新されました');
      await select.selectOption({ label: '追加先プロジェクト' }); await expect(confirm).toBeEnabled();
    }
    if (scenario.interrupt) await page.evaluate(name => sessionStorage.setItem('append-fail-once', name), scenario.interrupt);
    await (scenario.touch ? confirm.tap() : confirm.click());
    if (scenario.interrupt) {
      await expect(page.getByText('シーンの追加が中断しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
      expect(await page.evaluate(() => sessionStorage.getItem('append-failed'))).toBe(scenario.interrupt);
      const resumeUrl = page.url(); await page.close();
      page = await receiver.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(resumeUrl);
      const resume = button(page, 'シーン追加を再開');
      const reopen = page.getByRole('group', { name: '追加先プロジェクト', exact: true }).filter({ hasText: '更新が未完了' }).getByRole('button', { name: '編集で開く', exact: true });
      await expect(resume.or(reopen).first()).toBeVisible({ timeout: 90_000 });
      if (await reopen.isVisible()) await reopen.click();
      const original = page.getByLabel('元のシーンZIP', { exact: true });
      if (scenario.interrupt === 'blobsVerified.json') {
        await original.setInputFiles(info.outputPath('before.zip'));
        await resume.click(); await expect(page.getByText('選んだファイルは元のシーンZIPと異なります。', { exact: true })).toBeVisible();
        await original.setInputFiles(zip);
      } else await expect(original).toHaveCount(0);
      await (scenario.touch ? resume.tap() : resume.click());
    }
    await ready(page);
    if (scenario.interrupt) await page.getByRole('combobox', { name: 'シーン', exact: true }).selectOption({ label: '点検シーン' });
    await expect(page.getByRole('combobox', { name: 'シーン', exact: true }).locator('option:checked')).toHaveText('点検シーン');
    await expect(page.getByRole('list', { name: '記録一覧', exact: true })).toContainText('継承したピン');
    await page.screenshot({ path: info.outputPath('appended.png') });
    const after = await backup(page, info.outputPath('after.zip'));
    const current = await selectCleanRecords(after.source, validationMetadataLimits);
    expect(after.source.proof).toEqual(before.source.proof);
    expect(current.project).toEqual(previous.project);
    const otherEdit = !scenario.touch && !scenario.interrupt ? 1 : 0;
    expect(Object.values(current.scenesById!)).toHaveLength(2 + otherEdit + (scenario.interrupt ? 1 : 0));
    expect(Object.values(current.assetsById!)).toHaveLength(2);
    expect(Object.values(current.captionsById!)).toHaveLength(1);
    expect(Object.values(current.sceneCaptionMembershipsById!)).toHaveLength(scenario.interrupt ? 2 : 1);
    expect(Object.values(current.captionAttachmentsById!)).toHaveLength(1);
    expect(after.source.originalChanges()).toHaveLength(before.source.originalChanges().length + 1 + otherEdit);
    const hashes = after.archive.control.manifest.blobs.map(entry => entry.sha256);
    for (const bytes of [triangleGlb(0), triangleGlb(2), photo]) expect(hashes).toContain(createHash('sha256').update(bytes).digest('hex'));
    await page.reload(); await ready(page);
    await expect(page.getByRole('combobox', { name: 'シーン', exact: true }).getByRole('option', { name: '点検シーン', exact: true })).toHaveCount(1);
    await page.getByRole('combobox', { name: 'シーン', exact: true }).selectOption({ label: '点検シーン' });
    await expect(page.getByRole('list', { name: '記録一覧', exact: true })).toContainText('継承したピン');
    expect(errors).toEqual([]);
  } finally { await browser.close(); await server.stop(); }
});
