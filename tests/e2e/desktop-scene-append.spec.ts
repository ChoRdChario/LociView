import { createHash } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import * as A from '@automerge/automerge';
import { chromium, expect, test, type Page } from '@playwright/test';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { selectCleanRecords } from '../../src/projectPackage/cleanRecords';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { ownedServer } from '../offline-e2e/server';
import { smallPng, triangleGlb } from './fixtures';
import {chooseSharedScene, beginSceneCreation, revealCoordinateAdd, revealFileSurface, selectShareOutput } from './workspaceUi';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const files = (page: Page) => page.getByRole('region', { name: 'ファイル', exact: true });
const ready = (page: Page) => expect(button(page, '閲覧する')).toBeEnabled({ timeout: 90_000 });
async function selectFile(page: Page, file: Parameters<ReturnType<Page['getByLabel']>['setInputFiles']>[0]) {
  await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles(file);
  await button(page, 'ファイルを開く').click();
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
    const detail = source.getByRole('region', { name: 'キャプションの詳細', exact: true });
    await detail.getByLabel('タイトル', { exact: true }).fill('継承したピン');
    await detail.getByLabel('本文', { exact: true }).fill('継承した本文');
    await detail.getByRole('button', { name: '変更を適用', exact: true }).click();
    await expect(source.getByText('変更を適用しました。', { exact: true })).toBeVisible();
    const photo = smallPng();
    const chooser = source.waitForEvent('filechooser'); await source.getByLabel('メディアを追加', { exact: true }).click();
    await (await chooser).setFiles({ name: '点検写真.png', mimeType: 'image/png', buffer: photo });
    await source.getByRole('region',{name:'キャプションの詳細',exact:true}).getByRole('button',{name:'変更を適用',exact:true}).click(); await expect(source.getByText('メディアを追加しました。', { exact: true })).toBeVisible();
    await revealFileSurface(source, '共有'); await selectShareOutput(files(source), 'review');
    await chooseSharedScene(files(source),'点検シーン');
    await files(source).getByRole('button', { name: '内容を確認', exact: true }).click();
    const zip = info.outputPath('scene.zip'); await downloadTo(source, zip);
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
    await page.locator('details.lv-project-files').getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await selectFile(page, zip);
    const review = page.getByRole('main', { name: '閲覧用のシーン' });
    const panel = review.getByRole('region', { name: 'シーンの追加' });
    const open = review.getByRole('button', { name: '既存に追加', exact: true });
    await (scenario.touch ? open.tap() : open.click());
    await expect(panel).toContainText('モデル 1・キャプション 1・メディア 1');
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
      const reopen = page.locator('p').filter({ hasText: '追加先プロジェクト — 更新が未完了' }).getByRole('button', { name: '編集で開く', exact: true });
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
    await expect(page.getByRole('button', { name: '点検シーン', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('list', { name: 'キャプション一覧', exact: true })).toContainText('継承したピン');
    await page.screenshot({ path: info.outputPath('appended.png') });
    const after = await backup(page, info.outputPath('after.zip'));
    const current = await selectCleanRecords(after.source, validationMetadataLimits);
    expect(after.source.proof).toEqual(before.source.proof);
    expect(current.project).toEqual(previous.project);
    const otherEdit = !scenario.touch && !scenario.interrupt ? 1 : 0;
    expect(Object.values(current.scenesById!)).toHaveLength(2 + otherEdit);
    expect(Object.values(current.assetsById!)).toHaveLength(2);
    expect(Object.values(current.captionsById!)).toHaveLength(1);
    expect(Object.values(current.captionAttachmentsById!)).toHaveLength(1);
    expect(after.source.originalChanges()).toHaveLength(before.source.originalChanges().length + 1 + otherEdit);
    const hashes = after.archive.control.manifest.blobs.map(entry => entry.sha256);
    for (const bytes of [triangleGlb(0), triangleGlb(2), photo]) expect(hashes).toContain(createHash('sha256').update(bytes).digest('hex'));
    await page.reload(); await ready(page);
    await expect(button(page, '点検シーン')).toHaveCount(1);
    await button(page, '点検シーン').click();
    await expect(page.getByRole('list', { name: 'キャプション一覧', exact: true })).toContainText('継承したピン');
    expect(errors).toEqual([]);
  } finally { await browser.close(); await server.stop(); }
});
