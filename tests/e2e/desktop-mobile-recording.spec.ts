import { chromium, expect, test } from '@playwright/test';
import { openAsBlob } from 'node:fs';
import { PackageArchive } from '../../src/projectPackage/zipArchive';
import { ownedServer } from '../offline-e2e/server';
import { nativeConversionBackup, smallPng, triangleGlb } from './fixtures';

test('phone record list, body and completion stay usable when the viewport shrinks', async ({}, info) => {
  const server = await ownedServer('offline-desktop-dist');
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const list = page.getByRole('list', { name: 'キャプション一覧', exact: true });
  const detail = page.getByRole('region', { name: 'キャプションの詳細', exact: true });
  const record = list.locator('.lv-caption-select').filter({ hasText: '既存のピン' });
  const body = detail.getByLabel('本文', { exact: true });
  const apply = detail.getByRole('button', { name: '変更を適用', exact: true });
  try {
    await page.goto(server.url);
    const source = await nativeConversionBackup(triangleGlb(), smallPng(), 100);
    await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'records.zip', mimeType: 'application/zip', buffer: source });
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).tap();
    await page.getByRole('button', { name: '新しいプロジェクトに変換', exact: true }).tap();
    await expect(page.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled({ timeout: 90_000 });
    await expect(list.locator('li')).toHaveCount(100);
    expect((await list.boundingBox())?.height).toBeGreaterThanOrEqual(88);
    await page.getByRole('searchbox', { name: '検索', exact: true }).fill('既存のピン');
    await record.tap();
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: '一覧へ戻る', exact: true }).tap();
    await expect(record).toBeFocused();
    await expect(record).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('searchbox', { name: '検索', exact: true })).toHaveValue('既存のピン');
    await record.tap();
    await body.tap();
    await body.fill('狭い画面から本文を編集');
    await page.setViewportSize({ width: 320, height: 365 });
    for (const control of [body, apply, detail.getByRole('button', { name: '取り消す', exact: true })]) {
      await expect.poll(() => control.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return target !== null && node.contains(target);
      })).toBe(true);
    }
    await page.screenshot({ path: info.outputPath('short-portrait-draft.png') });
    await apply.tap();
    await expect(page.getByText('変更を適用しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(body).toHaveValue('狭い画面から本文を編集');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: '描画', exact: true }).tap();
    const drawing = page.getByRole('region', { name: '材質', exact: true }), surface = drawing.getByLabel('マテリアル', { exact: true });
    const model = drawing.getByLabel('モデル', { exact: true });
    await model.selectOption((await model.locator('option').evaluateAll(nodes => nodes.map(n => (n as HTMLOptionElement).value).find(Boolean)))!);
    await surface.selectOption((await surface.locator('option').evaluateAll(nodes => nodes.map(n => (n as HTMLOptionElement).value).find(Boolean)))!);
    const canvas = page.getByLabel('3Dモデルの表示', { exact: true }), opacity = drawing.getByLabel('不透明度（%）', { exact: true });
    await expect(canvas).toBeVisible(); await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    await expect(page.locator('.lv-caption-windows')).toBeHidden();
    expect(await canvas.evaluate(node => { const r=node.getBoundingClientRect();return !document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.lv-caption-window'); })).toBe(true);
    await page.screenshot({ path:info.outputPath('drawing-preview-uncovered.png') });
    const preview = (await canvas.boundingBox())!, panel = (await drawing.boundingBox())!;
    expect(preview.width).toBeGreaterThan(300); expect(panel.y).toBeGreaterThanOrEqual(preview.y + preview.height);
    await opacity.tap(); await opacity.fill('55'); await opacity.dispatchEvent('compositionstart');
    await expect(drawing.getByRole('button', { name: '変更を適用', exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 320, height: 365 }); await opacity.dispatchEvent('compositionend');
    await expect(opacity).toHaveValue('55'); await opacity.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('short-phone-drawing.png') });
    for (const control of [opacity, drawing.getByRole('button', { name: '変更を適用', exact: true }), drawing.getByRole('button', { name: '取り消す', exact: true })]) {
      await expect(control).toBeInViewport({ ratio: 1 });
      expect(await control.evaluate(node => { const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return target !== null && node.contains(target); })).toBe(true);
    }
    await expect(page.locator('.lv-project-stage canvas')).toHaveCount(1);
    await drawing.getByRole('button', { name: '取り消す', exact: true }).tap();
    await drawing.getByRole('region', { name: '操作の確認', exact: true }).getByRole('button', { name: '変更を取り消す', exact: true }).tap();
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('tab', { name: 'キャプション', exact: true }).tap();
    await page.getByRole('button', { name:'3D', exact:true }).tap();
    await expect(page.locator('.lv-caption-windows')).toBeVisible();
    await page.getByRole('button', { name:'作業パネル', exact:true }).tap();
    await page.locator('details.lv-project-files > summary').tap();
    await page.getByRole('tab', { name: '共有', exact: true }).tap();
    const files = page.getByRole('region', { name: 'ファイル', exact: true });
    const partial = files.getByRole('checkbox', { name: '一部だけ出力', exact: true });
    await expect(partial).not.toBeChecked();
    await expect(files.getByText('編集・返送できます。全シーンと編集履歴を含みます。', { exact: true })).toBeVisible();
    await files.getByText('一部だけ出力', { exact: true }).tap(); await expect(partial).toBeChecked();
    const scenes = files.getByLabel('渡すシーン', { exact: true });
    await scenes.selectOption(await scenes.locator('option').nth(1).getAttribute('value') ?? '');
    await files.getByRole('button', { name: '内容を確認', exact: true }).tap();
    const primary = files.locator('.lv-file-primary'), previewStarted = Date.now();
    await expect(primary).toBeEnabled(); const sceneStarted = Date.now();
    const [download] = await Promise.all([page.waitForEvent('download'), primary.tap()]);
    console.log('phone scene output', { previewReadyMs: sceneStarted - previewStarted, handoffMs: Date.now() - sceneStarted });
    const path = info.outputPath('phone-scene.zip'); await download.saveAs(path);
    expect((await PackageArchive.inspect(await openAsBlob(path))).control.manifest.purpose).toBe('review');
    await expect(partial).not.toBeChecked();
    const continuationStarted = Date.now(); await expect(primary).toBeEnabled(); const wholeStarted = Date.now();
    const [whole] = await Promise.all([page.waitForEvent('download'), primary.tap()]);
    console.log('phone whole output', { previousReadyMs: wholeStarted - continuationStarted, handoffMs: Date.now() - wholeStarted });
    const workspace = info.outputPath('phone-workspace.zip'); await whole.saveAs(workspace);
    await page.locator('details.lv-project-files').getByRole('button', { name: 'ファイルを開く', exact: true }).tap();
    await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles(workspace);
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).tap();
    const destination = page.getByRole('region', { name: '取り込み先', exact: true });
    await expect(destination).toContainText('「Nativeから引き継ぐ記録」に更新を取り込みます。');
    await destination.getByRole('button', { name: '既存に取り込む', exact: true }).tap();
    await expect(page.getByText('更新を取り込みました。', { exact: true })).toBeVisible({ timeout: 90_000 });
    await record.tap(); await expect(body).toHaveValue('狭い画面から本文を編集');
  } finally {
    await context.close(); await browser.close(); await server.stop();
  }
});
