import { test, expect, chromium, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as A from '@automerge/automerge';
import { ownedServer } from '../offline-e2e/server';
import { triangleGlb } from './fixtures';
import { revealCoordinateAdd, revealFileSurface } from './workspaceUi';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { validationMetadataLimits } from '../../src/projectFiles/validation';

async function backup(page: Page, info: TestInfo, name: string) {
  await revealFileSurface(page, '保存'); const area = page.getByRole('region', { name: 'ファイル', exact: true });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), area.locator('button.lv-file-primary').click()]);
  const path = info.outputPath(name + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false');
  await page.locator('details.lv-project-files').getByRole('button', { name: '閉じる', exact: true }).click();
  return BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]), validationMetadataLimits);
}

test('image details, Scene keyboard focus and dismissible header sheets retain Project data through actual backup', async ({}, info) => {
  A.getHeads(A.init()); const server = await ownedServer('offline-desktop-dist'), browser = await chromium.launch({ channel: 'chromium', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true }), errors: string[] = [], remote: string[] = [];
  const page = await context.newPage(); page.setDefaultTimeout(15_000); page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(u.protocol)) return route.continue(); remote.push(u.href); return route.abort(); });
  const ready = async (text: string) => { await expect(page.getByText(text, { exact: true })).toBeVisible(); await expect(page.locator('main.lv-project-workspace > header > .lv-operation-status')).toHaveAttribute('data-busy', 'false'); };
  try {
    await page.goto(server.url);
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024; const g = canvas.getContext('2d')!;
      for (let x = 0; x < canvas.width; x += 32) { g.fillStyle = `rgb(${x % 255},${255 - x % 255},${Math.floor(x / 8) % 255})`; g.fillRect(x, 0, 32, canvas.height); }
      g.fillStyle = 'white'; g.font = 'bold 48px sans-serif'; for (let y = 80; y < 1024; y += 160) for (let x = 40; x < 2048; x += 300) g.fillText(`${x},${y}`, x, y);
      return canvas.toDataURL('image/png').split(',')[1]!;
    }), 'base64');
    await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: '検査用模型.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await page.getByLabel('プロジェクト名', { exact: true }).fill('細部の確認'); await page.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    const scenes = page.getByRole('region', { name: 'シーン', exact: true }), firstName = await scenes.locator('button[aria-pressed="true"]').innerText();
    const manage = page.locator('details[aria-label="シーンの管理"]'); await manage.locator(':scope > summary').click(); await manage.getByRole('button', { name: 'シーンを作る', exact: true }).click();
    await page.getByLabel('シーン名', { exact: true }).fill('別のシーン'); await page.getByRole('button', { name: 'シーンを追加', exact: true }).click(); await ready('シーンを追加しました。');
    const first = scenes.getByRole('button', { name: firstName, exact: true }); await first.focus(); await page.keyboard.press('Enter'); await expect(first).toBeFocused(); await expect(first).toHaveAttribute('aria-pressed', 'true');
    await revealCoordinateAdd(page); const owner = page.getByLabel('追加先モデル', { exact: true }); await owner.focus(); await owner.selectOption({ label: '検査用模型.glb' }); await page.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const axis of ['X', 'Y', 'Z']) await page.getByLabel('位置 ' + axis, { exact: true }).fill(axis === 'Y' ? '.5' : '0');
    await page.getByRole('button', { name: '位置を確定', exact: true }).click(); await ready('ピンの位置を確定しました。');
    const detail = page.getByRole('region', { name: 'キャプションの詳細', exact: true }); await detail.getByLabel('タイトル', { exact: true }).fill('細部の記録'); await detail.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready('変更を適用しました。');
    const choose = page.waitForEvent('filechooser'); await page.getByLabel('メディアを追加', { exact: true }).click(); await (await choose).setFiles({ name: '細部の写真.png', mimeType: 'image/png', buffer: png }); await ready('メディアを追加しました。');
    const notice=page.locator('main.lv-project-workspace > header > .lv-operation-status'),help = page.locator('details[aria-label="ヘルプ"]'), helpSummary = help.locator(':scope > summary');
    await expect(notice).toHaveAttribute('data-passive','true');await helpSummary.click();
    const stage=page.getByLabel('3Dモデルの表示', { exact: true }), stageBounds=(await stage.boundingBox())!; await stage.click({ position: { x: stageBounds.width-20, y: stageBounds.height-20 } }); await expect(help).not.toHaveAttribute('open');
    await expect(notice).toHaveText('メディアを追加しました。');
    const before = await backup(page, info, 'before-inspection');
    await expect(notice).toBeEmpty();await helpSummary.click(); await page.keyboard.press('Escape'); await expect(help).not.toHaveAttribute('open'); await expect(helpSummary).toBeFocused();
    const settings = page.locator('details[aria-label="設定"]'), summary = settings.locator(':scope > summary'); await summary.click(); const displayName = settings.getByLabel('このブラウザの表示名', { exact: true });
    await displayName.fill('保持する入力'); await displayName.dispatchEvent('compositionstart'); await page.keyboard.press('Escape'); await expect(settings).toHaveAttribute('open'); await displayName.dispatchEvent('compositionend');
    await page.keyboard.press('Escape'); await expect(settings).not.toHaveAttribute('open'); await expect(summary).toBeFocused(); await summary.click(); await expect(displayName).toHaveValue('保持する入力');
    await settings.getByRole('button', { name: '表示名の入力を取り消す', exact: true }).click(); await page.keyboard.press('Escape');
    const show = page.getByRole('region', { name: 'メディアの整理', exact: true }).getByRole('region', { name: '添付メディア', exact: true }).getByRole('button', { name: '画像を表示', exact: true }); await show.click();
    const dialog = page.getByRole('dialog', { name: 'メディアビューア', exact: true }), image = dialog.locator('img'), viewport = dialog.getByRole('region', { name: '画像の表示領域', exact: true });
    await expect.poll(() => image.evaluate(n => { const img=n as HTMLImageElement;return img.complete && img.naturalWidth === 2048 && img.naturalHeight === 1024; })).toBe(true);
    await expect.poll(() => image.evaluate(n => n.getBoundingClientRect().width)).toBeLessThan(2048); await page.screenshot({ path: info.outputPath('fit-image.png'), fullPage: false });
    await dialog.getByRole('button', { name: '原寸', exact: true }).click(); await expect.poll(() => image.evaluate(n => n.getBoundingClientRect().width)).toBe(2048);
    const originalPixels = await viewport.screenshot(), previousScroll = await viewport.evaluate(n => ({ x: n.scrollLeft, y: n.scrollTop })), box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 123, box.y + box.height / 2 - 57, { steps: 5 }); await page.mouse.up();
    const nextScroll = await viewport.evaluate(n => ({ x: n.scrollLeft, y: n.scrollTop })); expect(nextScroll.x).toBeCloseTo(previousScroll.x + 123, 0); expect(nextScroll.y).toBeCloseTo(previousScroll.y + 57, 0);
    expect(createHash('sha256').update(await viewport.screenshot()).digest('hex')).not.toBe(createHash('sha256').update(originalPixels).digest('hex'));
    await page.setViewportSize({ width: 1280, height: 800 }); await expect(dialog.getByLabel('画像の表示倍率', { exact: true })).toHaveText('100%'); await expect.poll(() => image.evaluate(n => n.getBoundingClientRect().width)).toBe(2048);
    await viewport.focus(); await page.keyboard.press('Shift+ArrowLeft'); await expect.poll(() => viewport.evaluate(n => n.scrollLeft)).toBeCloseTo(nextScroll.x - 40, 0);
    await dialog.getByRole('button', { name: '全体', exact: true }).click(); const fitted = await image.boundingBox(), area = await viewport.boundingBox(); expect(fitted!.width).toBeLessThanOrEqual(area!.width + 1); expect(fitted!.height).toBeLessThanOrEqual(area!.height + 1);
    await page.screenshot({ path: info.outputPath('inspected-image.png'), fullPage: false }); await dialog.getByRole('button', { name: '閉じる', exact: true }).click(); await expect(show).toBeFocused();
    const after = await backup(page, info, 'after-inspection'); expect(after.source.originalChanges()).toEqual(before.source.originalChanges()); expect(after.source.proof.identity).toEqual(before.source.proof.identity);
    expect(after.archive.control.manifest.blobs).toEqual(before.archive.control.manifest.blobs); expect(after.archive.control.manifest.blobs.some(b => b.sha256 === createHash('sha256').update(png).digest('hex'))).toBe(true);
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally { await context.close(); await browser.close(); await server.stop(); }
});
