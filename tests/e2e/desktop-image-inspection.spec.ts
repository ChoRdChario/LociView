import { test, expect, chromium, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as A from '@automerge/automerge';
import { ownedServer } from '../offline-e2e/server';
import { triangleGlb } from './fixtures';
import { revealCoordinateAdd, revealFileSurface } from './workspaceUi';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { jpegBytes } from '../helpers/jpegFixtures';

async function backup(page: Page, info: TestInfo, name: string) {
  await revealFileSurface(page, '保存'); const area = page.getByRole('region', { name: 'ファイル', exact: true });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), area.locator('button.lv-file-primary').click()]);
  const path = info.outputPath(name + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false');
  await page.locator('details.lv-project-files').getByRole('button', { name: '閉じる', exact: true }).click();
  return BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]), validationMetadataLimits);
}

test('image details, Scene keyboard focus and dismissible header sheets retain Project data through actual backup', async ({}, info) => {
  A.getHeads(A.init()); const server = await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT ?? 'offline-desktop-dist'), browser = await chromium.launch({ channel: 'chromium', headless: true });
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
    await page.getByRole('button', { name: 'ここに記録を作る', exact: true }).click(); await ready('ピンの位置を確定しました。');
    const detail = page.getByRole('region', { name: 'キャプションの詳細', exact: true }); await detail.getByLabel('タイトル', { exact: true }).fill('細部の記録'); await detail.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready('変更を適用しました。');
    const choose = page.waitForEvent('filechooser'); await page.getByLabel('メディアを追加', { exact: true }).click(); await (await choose).setFiles({ name: '細部の写真.png', mimeType: 'image/png', buffer: png }); await page.getByRole('region',{name:'キャプションの詳細',exact:true}).getByRole('button',{name:'変更を適用',exact:true}).click(); await ready('メディアを追加しました。');
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
    const portrait = Buffer.from(jpegBytes('rgb-exif-6')), choosePortrait = page.waitForEvent('filechooser');
    await page.getByLabel('メディアを追加', { exact: true }).click();
    await (await choosePortrait).setFiles({ name: '縦向きの写真.jpg', mimeType: 'image/jpeg', buffer: portrait }); await page.getByRole('region',{name:'キャプションの詳細',exact:true}).getByRole('button',{name:'変更を適用',exact:true}).click(); await ready('メディアを追加しました。');
    const gallery = page.getByRole('region', { name: 'メディアの整理', exact: true }).getByRole('region', { name: '添付メディア', exact: true });
    const portraitCard = gallery.locator('figure').filter({ hasText: '縦向きの写真.jpg' });
    await expect(portraitCard).toHaveCount(1);
    await info.attach('portrait-thumbnail-before-scroll', { body: JSON.stringify(await portraitCard.evaluate(node => {
      const card = node.getBoundingClientRect(), pane = node.closest('.lv-caption-reading'), bounds = pane?.getBoundingClientRect();
      return { card: { top: card.top, bottom: card.bottom }, pane: bounds && { top: bounds.top, bottom: bounds.bottom, scrollTop: pane!.scrollTop },
        images: [...node.querySelectorAll('img')].map(img => ({ width: img.naturalWidth, height: img.naturalHeight })) };
    })), contentType: 'application/json' });
    await portraitCard.getByRole('button', { name: '画像を表示', exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(() => portraitCard.locator('img').evaluate(n => [(n as HTMLImageElement).naturalWidth,(n as HTMLImageElement).naturalHeight])).toEqual([4,8]);
    await portraitCard.getByRole('button', { name: '画像を表示', exact: true }).click();
    await expect.poll(() => dialog.locator('img').evaluate(n => [(n as HTMLImageElement).naturalWidth,(n as HTMLImageElement).naturalHeight])).toEqual([4,8]);
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    const phoneSource = await backup(page, info, 'with-portrait');
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
    await phoneContext.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === new URL(server.url).origin || ['blob:','data:'].includes(u.protocol)) return route.continue(); remote.push(u.href); return route.abort(); });
    const phone = await phoneContext.newPage(); phone.setDefaultTimeout(15_000); phone.on('pageerror', e => errors.push(e.message));
    await phone.goto(server.url); await phone.getByLabel('ファイルを選択', { exact: true }).setInputFiles(info.outputPath('with-portrait.zip'));
    await phone.getByRole('button', { name: 'ファイルを開く', exact: true }).tap(); await phone.getByRole('button', { name: 'このファイルから再開', exact: true }).tap();
    await expect(phone.getByRole('button', { name: '3D', exact: true })).toBeEnabled({ timeout: 90_000 }); await phone.getByRole('button', { name: '3D', exact: true }).tap();
    const phoneCanvas = phone.getByLabel('3Dモデルの表示', { exact: true }), pin = phone.locator('.lv-project-marker').first();
    await expect(phoneCanvas).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 }); await expect(pin).toBeVisible(); await pin.tap();
    const showPhoto = phone.getByRole('region', { name: 'キャプションの詳細', exact: true }).getByRole('button', { name: '画像を表示', exact: true }).first();
    await expect(phone.locator('.lv-caption-window')).toHaveCount(0);
    await expect(showPhoto).toBeVisible(); await showPhoto.tap();
    const phoneDialog = phone.getByRole('dialog', { name: 'メディアビューア', exact: true }), phoneImage = phoneDialog.locator('img');
    await expect.poll(() => phoneImage.evaluate(n => (n as HTMLImageElement).naturalWidth)).toBe(2048);
    await expect(phoneCanvas).toHaveAttribute('aria-busy', 'true');
    await phoneDialog.getByRole('button', { name: '原寸', exact: true }).tap();
    const photoArea = phoneDialog.getByRole('region', { name: '画像の表示領域', exact: true });
    await photoArea.evaluate(n => { n.scrollLeft = 120; n.scrollTop = 50; });
    // Explicit visibility-event simulation exercises native image cleanup; this is not OS/iOS background evidence.
    await phone.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(phoneDialog.locator('img')).toHaveCount(0); await expect(phoneDialog).toBeVisible();
    await phone.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(() => phoneDialog.locator('img').evaluate(n => (n as HTMLImageElement).naturalWidth)).toBe(2048);
    await expect(phoneDialog.getByLabel('画像の表示倍率', { exact: true })).toHaveText('100%');
    expect(await photoArea.evaluate(n => ({x:n.scrollLeft,y:n.scrollTop}))).toEqual({x:120,y:50});
    await phoneDialog.getByRole('button', { name: '次のメディア', exact: true }).tap();
    await expect.poll(() => phoneDialog.locator('img').evaluate(n => [(n as HTMLImageElement).naturalWidth,(n as HTMLImageElement).naturalHeight])).toEqual([4,8]);
    await phoneDialog.getByRole('button', { name: '前のメディア', exact: true }).tap(); await phoneDialog.getByRole('button', { name: '閉じる', exact: true }).tap();
    await expect(showPhoto).toBeFocused(); await phone.getByRole('button', { name:'3D',exact:true }).tap();
    await expect(phoneCanvas).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 }); await expect(pin).toBeVisible();
    await phone.screenshot({ path: info.outputPath('phone-photo-returned.png') });
    const phoneAfter = await backup(phone, info, 'phone-after-inspection');
    expect(phoneAfter.source.originalChanges()).toEqual(phoneSource.source.originalChanges()); expect(phoneAfter.archive.control.manifest.blobs).toEqual(phoneSource.archive.control.manifest.blobs);
    await phoneContext.close();
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally { await context.close(); await browser.close(); await server.stop(); }
});
