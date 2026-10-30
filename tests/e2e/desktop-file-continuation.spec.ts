import { revealCoordinateAdd, revealFileSurface, revealCaptionList, revealProjectSelection } from './workspaceUi';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as A from '@automerge/automerge';
import { triangleGlb } from './fixtures';
import { ownedServer } from '../offline-e2e/server';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { validationMetadataLimits as limits } from '../../src/projectFiles/validation';

const files = (p: Page) => p.getByRole('region', { name: 'ファイル', exact: true });
const receive = (p: Page) => p.getByRole('region', { name: '更新ファイル', exact: true });
const detail = (p: Page) => p.getByRole('region', { name: 'キャプションの詳細', exact: true });
const chooseCaption = async (p: Page, title: string) => { await revealCaptionList(p); await p.locator('.lv-caption-select').filter({ hasText: title }).click(); };
async function fileMenu(p: Page) {
  const menu = p.locator('details.lv-project-files');
  if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
}
async function ready(p: Page, message: string) {
  await expect(p.getByText(message, { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(p.locator('main.lv-project-workspace > header > p.lv-operation-status')).toHaveAttribute('data-busy', 'false');
}
async function edit(p: Page, field: 'タイトル' | '本文', value: string) {
  await detail(p).getByLabel(field, { exact: true }).fill(value);
  await detail(p).getByRole('button', { name: '変更を適用', exact: true }).click(); await ready(p, '変更を適用しました。');
}
async function workspaceFits(p: Page) {
  const canvas = p.getByLabel('3Dモデルの表示', { exact: true });
  await expect.poll(() => canvas.evaluate(n => n.getBoundingClientRect().height)).toBeGreaterThan(160);
  const bounds = await p.evaluate(() => {
    const stage = document.querySelector('.lv-project-stage')!.getBoundingClientRect();
    const aside = document.querySelector('.lv-project-body > aside')!.getBoundingClientRect();
    return { top: Math.min(stage.top, aside.top), bottom: Math.max(stage.bottom, aside.bottom),
      width: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0); expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 1);
  expect(bounds.width).toBeLessThanOrEqual(bounds.viewportWidth + 1); expect(bounds.pageHeight).toBeLessThanOrEqual(bounds.viewportHeight + 1);
}
async function output(p: Page, info: TestInfo, name: string, purpose: 'backup' | 'teamWorkspace') {
  await fileMenu(p); const area = files(p);
  if(!await revealFileSurface(p,purpose==='backup'?'保存':'共有')) await area.getByRole('button', { name: purpose === 'backup' ? '保存' : '相手に渡す', exact: true }).click();
  if (purpose === 'backup') await area.getByLabel('名前（任意）', { exact: true }).fill(name);
  else await area.getByLabel('渡す内容', { exact: true }).selectOption(purpose);
  const [download] = await Promise.all([p.waitForEvent('download', { timeout: 90_000 }), area.locator('button.lv-file-primary').click()]);
  const path = info.outputPath(name + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 90_000 }); await workspaceFits(p); return path;
}
async function holdDigest(p: Page) {
  await p.evaluate(() => {
    const w = window as any;
    if (!w.__continuationDigestWrapped) {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      (crypto.subtle as any).digest = async (...args: Parameters<SubtleCrypto['digest']>) => {
        if (w.__holdContinuationDigest) {
          w.__holdContinuationDigest = false;
          w.__continuationDigestHeld = true;
          await new Promise<void>(resolve => { w.__releaseContinuationDigest = resolve; });
        }
        return original(...args);
      };
      w.__continuationDigestWrapped = true;
    }
    w.__holdContinuationDigest = true;
    w.__continuationDigestHeld = false;
  });
}
const releaseDigest = (p: Page) => p.evaluate(() => { const w = window as any; w.__holdContinuationDigest = false; w.__releaseContinuationDigest?.(); w.__releaseContinuationDigest = undefined; w.__continuationDigestHeld = false; });

test('PC Caption work continues after empty tag focus and cancelled file checks, with local receive/restore feedback', async ({ page, context, browser }, info) => {
  test.setTimeout(420_000); A.getHeads(A.init()); await page.setViewportSize({ width: 1280, height: 800 });
  const server=await ownedServer('offline-desktop-dist');
  const errors: string[] = [], remote: string[] = [];
  const localOnly = (c: typeof context) => c.route('**/*', route => {
    const u = new URL(route.request().url()); if (u.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(u.protocol)) return route.continue();
    remote.push(u.origin); return route.abort('blockedbyclient');
  });
  await localOnly(context); page.on('pageerror', error => errors.push(error.message));
  const peer = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true }); await localOnly(peer);
  const b = await peer.newPage(); b.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.url); await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: '現地モデル.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await page.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill('PCで記録を続ける'); await page.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('PCで記録を続ける', { timeout: 90_000 });
    await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false');
    await revealCoordinateAdd(page); const owner = page.getByLabel('追加先モデル', { exact: true }); await owner.focus(); await owner.selectOption({ label: '現地モデル.glb' });
    await page.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const [axis, value] of [['X', '0'], ['Y', '.5'], ['Z', '0']]) await page.getByLabel(`位置 ${axis}`, { exact: true }).fill(value!);
    await page.getByRole('button', { name: '位置を確定', exact: true }).click(); await ready(page, 'ピンの位置を確定しました。'); await edit(page, 'タイトル', '確認する場所');
    await workspaceFits(page); await chooseCaption(page, '確認する場所');
    await page.getByRole('button', { name: '記録を複製', exact: true }).click(); await ready(page, '記録を複製しました。元の記録は変わりません。');
    await edit(page, 'タイトル', '見比べる記録・長い日本語の見出しと現地で確認した内容');
    await chooseCaption(page, '確認する場所'); await chooseCaption(page, '見比べる記録・長い日本語の見出しと現地で確認した内容');
    const windows = page.locator('.lv-caption-window'); await expect(windows).toHaveCount(2);
    await page.evaluate(() => { const w = window as any; w.__layoutCanvas = document.querySelector('.lv-project-stage canvas'); w.__layoutWindows = [...document.querySelectorAll('.lv-caption-window')]; });
    const draft = detail(page).getByLabel('タイトル', { exact: true }); await draft.fill('入力中の記録を保つ');
    await fileMenu(page); await workspaceFits(page); await expect(draft).toHaveValue('入力中の記録を保つ');
    await page.locator('details.lv-project-files > summary').click();
    await detail(page).getByRole('button', { name: '取り消す', exact: true }).click(); await detail(page).getByRole('button', { name: '変更を取り消す', exact: true }).click();
    const moving = windows.last();
    await expect(page.locator('details.lv-comparison-actions')).toHaveCount(0);await moving.getByRole('button',{name:'閉じる',exact:true}).focus();await expect(moving).toHaveAttribute('data-active','true');
    const grip = await moving.locator('.lv-caption-window-title').boundingBox(); expect(grip).not.toBeNull();
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.lv-caption-window')?.getAttribute('aria-label'), { x: grip!.x + 12, y: grip!.y + 12 })).toBe('見比べる記録・長い日本語の見出しと現地で確認した内容');
    await page.mouse.move(grip!.x + 12, grip!.y + 12); await page.mouse.down(); await expect(moving).toHaveAttribute('data-gesture', 'move');
    await page.setViewportSize({ width: 1440, height: 900 }); await expect(moving).not.toHaveAttribute('data-gesture', 'move'); await page.mouse.up(); await workspaceFits(page);
    await page.setViewportSize({ width: 1280, height: 800 }); await workspaceFits(page);
    expect(await page.evaluate(() => { const w = window as any; return w.__layoutCanvas === document.querySelector('.lv-project-stage canvas') && w.__layoutWindows.every((n: HTMLElement) => n.isConnected); })).toBe(true);
    await chooseCaption(page, '確認する場所'); await page.screenshot({ path: info.outputPath('workspace-with-comparison.png'), fullPage: true });
    await fileMenu(page);
    const help = page.getByLabel('ヘルプ', { exact: true }), settings = page.getByLabel('設定', { exact: true });
    await help.locator(':scope > summary').click(); await settings.locator(':scope > summary').click(); await workspaceFits(page);
    await settings.getByLabel('このブラウザの表示名', { exact: true }).fill('入力中の表示名'); await workspaceFits(page); await page.screenshot({ path: info.outputPath('workspace-expanded-tools.png'), fullPage: true });
    await help.locator(':scope > summary').click(); await expect(settings).not.toHaveAttribute('open');
    await settings.locator(':scope > summary').click(); await expect(help).not.toHaveAttribute('open');
    await expect(settings.getByLabel('このブラウザの表示名', { exact: true })).toHaveValue('入力中の表示名');
    await settings.getByRole('button', { name: '表示名の入力を取り消す', exact: true }).click(); await settings.locator(':scope > summary').click(); await workspaceFits(page);
    const tags = page.getByLabel('タグの管理', { exact: true }); await tags.locator(':scope > summary').click();
    await tags.getByLabel('タグ名', { exact: true }).focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    await expect(tags.getByRole('button', { name: 'タグの入力を取り消す', exact: true })).toBeHidden();
    await expect(page.locator('details.lv-project-files').getByRole('button', { name: 'ファイルを開く', exact: true, includeHidden: true })).toBeEnabled();
    await tags.getByLabel('タグ名', { exact: true }).fill('現地確認'); await tags.getByRole('button', { name: 'タグを追加', exact: true }).click(); await ready(page, 'タグを保存しました。');
    await tags.getByRole('button', { name: 'この記録にタグを付ける', exact: true }).click(); await ready(page, '記録のタグを変更しました。');
    // Empty-field keyboard navigation must still permit a real save, without cancellation.
    await tags.getByLabel('タグ名', { exact: true }).focus(); await page.keyboard.press('Tab');
    const backup = await output(page, info, '現地確認', 'backup');
    const before = await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(backup)).buffer]), limits);
    await expect(page.getByLabel('保存ファイルの状態', { exact: true })).toContainText('未確認');
    const fileBody = page.locator('details.lv-project-files > section');
    const sheet=await fileBody.boundingBox();expect(sheet!.y).toBeGreaterThanOrEqual(0);expect(sheet!.y+sheet!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await fileBody.evaluate(n => { n.scrollTop = n.scrollHeight; }); await workspaceFits(page);
    const history = files(page).locator('details').filter({ has: page.getByText('作成したファイル', { exact: true }) });
    if (!await history.evaluate(n => (n as HTMLDetailsElement).open)) await history.locator(':scope > summary').click();
    const verification = history.locator('details'); await verification.locator(':scope > summary').click();
    const choose = page.waitForEvent('filechooser'); await verification.getByRole('button', { name: 'ファイルを選択', exact: true }).click(); const chooser = await choose;
    // Headless chooser is intercepted: inject its native cancel event, then retire it.
    await files(page).getByLabel('保存したファイルを選択', { exact: true }).dispatchEvent('cancel');
    await expect(page.locator('details.lv-project-files').getByRole('button', { name: 'ファイルを開く', exact: true, includeHidden: true })).toBeEnabled(); await chooser.setFiles([]);
    await page.locator('details.lv-project-files').getByRole('button',{name:'閉じる',exact:true}).click();await revealProjectSelection(page);
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await page.getByRole('button', { name: '編集で開く', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('PCで記録を続ける', { timeout: 90_000 }); await chooseCaption(page, '確認する場所');
    const workspace = await output(page, info, '作業一式', 'teamWorkspace');await page.locator('details.lv-project-files').getByRole('button',{name:'閉じる',exact:true}).click();
    await b.goto(server.url); await b.getByLabel('ファイルを選択', { exact: true }).setInputFiles(workspace); await b.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await expect(b.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('PCで記録を続ける', { timeout: 90_000 }); await chooseCaption(b, '確認する場所');
    await edit(b, 'タイトル', '相手のタイトル'); const returned = await output(b, info, '相手の更新', 'teamWorkspace'); await edit(page, '本文', '手元の本文');
    await fileMenu(page); const incoming = receive(page), incomingStatus = incoming.locator(':scope > p[role="status"]');
    await revealFileSurface(page,'受信');await incoming.getByLabel('更新ファイルを選択', { exact: true }).setInputFiles(returned); await holdDigest(page); await incoming.getByRole('button', { name: '更新を受け取る', exact: true }).click();
    await expect(incomingStatus).toHaveAttribute('data-busy', 'true'); await expect(incomingStatus).toHaveText('更新を確認しています。');
    await expect.poll(() => page.evaluate(() => !!(window as any).__continuationDigestHeld)).toBe(true);
    expect(await incomingStatus.evaluate(n => getComputedStyle(n, '::before').animationName)).toBe('lv-operation-spin'); await page.screenshot({ path: info.outputPath('receive-working.png'), fullPage: true });
    await releaseDigest(page); await expect(incomingStatus).toHaveText('更新を受け取りました。', { timeout: 90_000 }); await expect(incomingStatus).toHaveAttribute('data-busy', 'false');
    await page.locator('details.lv-project-files').getByRole('button',{name:'閉じる',exact:true}).click();
    await chooseCaption(page, '相手のタイトル'); await expect(detail(page).getByLabel('タイトル', { exact: true })).toHaveValue('相手のタイトル'); await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue('手元の本文');
    await revealFileSurface(page,'復元'); const restore = incoming.locator('details').filter({ has: page.getByLabel('バックアップを選択', { exact: true }) });
    await restore.getByLabel('バックアップを選択', { exact: true }).setInputFiles(backup); await restore.getByRole('button', { name: '内容を確認', exact: true }).click();
    await expect(restore.getByRole('button', { name: 'このバックアップから復元', exact: true })).toBeEnabled({ timeout: 90_000 });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await holdDigest(page); await restore.getByRole('button', { name: 'このバックアップから復元', exact: true }).click();
    const restoreStatus = restore.locator(':scope > p[role="status"]'); await expect(restoreStatus).toHaveAttribute('data-busy', 'true'); await expect(restoreStatus).toHaveText('復元を確認しています。'); await expect(incomingStatus).toBeEmpty();
    await expect.poll(() => page.evaluate(() => !!(window as any).__continuationDigestHeld)).toBe(true);
    expect(await restoreStatus.evaluate(n => getComputedStyle(n, '::before').animationName)).toBe('none'); await page.screenshot({ path: info.outputPath('restore-working-reduced-motion.png'), fullPage: true });
    await releaseDigest(page); await expect(restoreStatus).toHaveText('バックアップから復元しました。ファイルへの反映はしていません。', { timeout: 90_000 }); await expect(restoreStatus).toHaveAttribute('data-busy', 'false');
    await expect(page.locator('details.lv-project-files [role="tab"][aria-selected="true"]')).toHaveCount(1);await expect(page.locator('details.lv-project-files .lv-file-intents > button:visible')).toHaveCount(0);
    await page.locator('details.lv-project-files').getByRole('button',{name:'閉じる',exact:true}).click();
    await chooseCaption(page, '確認する場所'); await expect(detail(page).getByLabel('タイトル', { exact: true })).toHaveValue('確認する場所'); await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue('');
    const saved = await output(page, info, '復元して継続', 'backup'), after = await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(saved)).buffer]), limits); expect(after.source.originalChanges()).toEqual(before.source.originalChanges());
    await page.reload(); await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('PCで記録を続ける', { timeout: 90_000 }); await chooseCaption(page, '確認する場所');
    await expect(detail(page).getByLabel('タイトル', { exact: true })).toHaveValue('確認する場所'); await workspaceFits(page); await page.screenshot({ path: info.outputPath('continued-workspace.png'), fullPage: true });
    for (const size of [{ width: 640, height: 400 }, { width: 1280, height: 600 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(size); await fileMenu(page);
      await expect(page.locator('details.lv-project-files').getByRole('button', { name: 'ファイルを開く', exact: true, includeHidden: true })).toBeEnabled();
      await revealProjectSelection(page);await page.getByRole('button', { name: 'ファイルを開く', exact: true }).scrollIntoViewIfNeeded();
      const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: innerWidth })); expect(dimensions.page).toBeLessThanOrEqual(dimensions.window + 1);
      await page.screenshot({ path: info.outputPath(`reflow-${size.width}-${size.height}.png`), fullPage: true });
    }
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally { await releaseDigest(page).catch(() => {}); await peer.close(); await server.stop(); }
});
