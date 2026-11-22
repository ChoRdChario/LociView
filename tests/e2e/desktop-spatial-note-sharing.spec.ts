import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PackageArchive } from '../../src/projectPackage/zipArchive';
import { gsFixture } from '../helpers/gsFixture';
import { smallPng, triangleGlb } from './fixtures';
import { finishCaptionEditing, chooseHomeFiles, openAddOptions, beginSceneCreation, closeFileSurface, lookAlongFront, revealCameraPositions, revealCaptionList, revealFileSurface, selectShareOutput } from './workspaceUi';

const points = Buffer.from([
  'ply', 'format ascii 1.0', 'element vertex 5', 'property float x', 'property float y', 'property float z',
  'property uchar red', 'property uchar green', 'property uchar blue', 'end_header',
  '0 0 0 255 0 0', '-1 -1 0 0 255 0', '1 -1 0 0 0 255', '-1 1 0 255 255 0', '1 1 0 255 0 255', '',
].join('\n'));

const splat = Array<number>(89).fill(0);
splat[81] = 0.6;
splat[82] = splat[83] = splat[84] = Math.log(0.3);
splat[85] = 1;
const gs = Buffer.from(gsFixture(4, Array.from({ length: 64 }, () => splat)));

const exact = { exact: true } as const;
const action = (page: Page, name: string) => page.getByRole('button', { name, ...exact });
const tab = (page: Page, name: string) => page.getByRole('tab', { name, ...exact });
const detail = (page: Page) => page.getByRole('region', { name: '記録の詳細', ...exact });
const status = (page: Page, text: string) => expect(page.getByText(text, exact)).toBeVisible();

async function checkPinTouchNavigation(page: Page, pin: Locator, canvasFirst: boolean) {
  await expect(pin).toBeInViewport();
  const contacts = await pin.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const mark = { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    if (document.elementFromPoint(mark.x, mark.y) !== node) throw Error('Pin is covered');
    for (const dx of [-65, 65, 0]) for (const dy of [0, -65, 65]) {
      const blank = { x: mark.x + dx, y: mark.y + dy };
      if (document.elementFromPoint(blank.x, blank.y)?.tagName === 'CANVAS') return { mark, blank };
    }
    throw Error('No adjacent canvas for the second finger');
  });
  const axes = () => page.locator('.lv-camera-axes button').evaluateAll(nodes =>
    nodes.map(node => [Math.round(parseFloat(node.style.left)), Math.round(parseFloat(node.style.top)), node.style.zIndex]));
  const before = await axes(), client = await page.context().newCDPSession(page);
  const start = canvasFirst ? [contacts.blank, contacts.mark] : [contacts.mark, contacts.blank];
  const points = (dx: number, dy: number) => start.map((p, i) => ({ id: i+1, x: p.x+dx, y: p.y+dy }));
  try {
    await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:points(0,0).slice(0,1) });
    await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:points(0,0) });
    for (let step = 1; step <= 5; step++)
      await client.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:points(4*step,2*step) });
    // Chromium takes the lifted contact here. The first finger stays on the surface.
    await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:points(20,10).slice(1) });
    await client.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:points(25,14).slice(0,1) });
    await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    await expect.poll(() => pin.evaluate(n => n.getBoundingClientRect().left+n.getBoundingClientRect().width/2))
      .toBeGreaterThan(contacts.mark.x+10);
    expect(await axes()).toEqual(before);
    const box = (await pin.boundingBox())!;
    const point = { x:box.x+box.width/2, y:box.y+box.height/2 };
    await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[point] });
    for (let step = 1; step <= 5; step++)
      await client.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:point.x+5*step, y:point.y+step }] });
    await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    await expect.poll(axes).not.toEqual(before);
  } finally { await client.detach(); }
}

type SceneReadFault = { mode: 'normal' | 'hold' | 'fail'; held: boolean; release(): void };
async function installSceneReadFault(page: Page) {
  await page.evaluate(() => {
    const state: SceneReadFault = { mode: 'normal', held: false, release() {} };
    Object.assign(window, { sceneReadFault: state });
    async function beforeRead() {
      const mode = state.mode; state.mode = 'normal';
      if (mode === 'fail') throw Error('確認用のシーン読み込み失敗');
      if (mode === 'hold') {
        state.held = true;
        await new Promise<void>(resolve => { state.release = resolve; });
      }
    }
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args: Parameters<SubtleCrypto['digest']>) => { await beforeRead(); return digest(...args); };
    const bitmap = window.createImageBitmap.bind(window);
    window.createImageBitmap = (async (...args: Parameters<typeof bitmap>) => { await beforeRead(); return bitmap(...args); }) as typeof createImageBitmap;
  });
}

async function selectRecord(page: Page) {
  await revealCaptionList(page);
  await page.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).click();
}

async function checkPhoto(page: Page) {
  const open = page.getByRole('button', { name: '画像を表示', ...exact });
  await expect(open).toHaveCount(1);
  await open.click();
  const viewer = page.getByRole('dialog', { name: 'メディアビューア', ...exact });
  await expect(viewer.locator('img')).toBeVisible();
  await expect(viewer.locator('img')).toHaveJSProperty('naturalWidth', 2);
  await expect(viewer.getByRole('button', { name: '次のメディア', ...exact })).toBeHidden();
  await viewer.getByRole('button', { name: '閉じる', ...exact }).click();
  await expect(open).toBeFocused();
  await expect(detail(page).getByLabel('タイトル', exact)).toHaveValue('塗装の確認');
}

for (const touch of [false, true])
  for (const kind of ['点群', 'GS'] as const) {
    test(`${touch ? 'スマホ' : 'PC'}で${kind}の記録・写真を共用し、共有シーンの開始視点に戻る`, async ({ browser, baseURL }, info) => {
      const options = { viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: touch, serviceWorkers: 'block' as const };
      const sharedBody = '監修用シーンでも同じ記録を確認。' + (touch ? '\n' + '写真と照合しながら、表面の塗装と内部の状態を記録する。'.repeat(65) : '');
      const sharedTitle = touch && kind === 'GS' ? ('塗装の確認' + '対象の詳細を示す長い日本語の記録名'.repeat(32)).slice(0, 512) : '塗装の確認';
      const reviewSceneName = touch && kind === 'GS' ? ('監修用' + '外板と内部の記録を照合する長い日本語のシーン名'.repeat(16)).slice(0, 256) : '監修用';
      const sender = await browser.newContext(options), receiver = await browser.newContext(options);
      try {
        const page = await sender.newPage();
        await page.goto(baseURL!);
        await chooseHomeFiles(page, { name: 'invalid.zip', mimeType: 'application/zip', buffer: Buffer.from('invalid') });
        const fileStatus = page.locator('.lv-validation-status');
        await expect(fileStatus).toHaveAttribute('data-busy', 'false');
        const error = await fileStatus.innerText();
        expect(error.trim()).not.toBe('');
        await chooseHomeFiles(page, { name: '外板.ply', mimeType: 'application/octet-stream', buffer: kind === '点群' ? points : gs });
        await expect(fileStatus).not.toHaveText(error);
        await action(page, 'プロジェクトを作成').click();
        await expect(action(page, '閲覧する')).toBeEnabled({ timeout: 90000 });
        if (touch)
          await action(page, '3D').click();
        const canvas = page.getByLabel('3Dモデルの表示', exact);
        await expect(canvas).toHaveAttribute('aria-busy', 'false');
        await lookAlongFront(page);
        await revealCaptionList(page);
        await action(page, '記録を追加').click();
        const task = page.getByRole('region', { name: '位置の調整', ...exact });
        if (kind === 'GS') {
          const target = task.getByLabel('記録するモデル', exact);
          await target.selectOption({ label: '外板.ply' });
          await expect(action(page, '座標を入力')).toBeVisible();
          // Numeric placement works without a proxy. Cancel leaves an empty list.
          await action(page, '座標を入力').click();
          for (const axis of ['X', 'Y', 'Z'])
            await task.getByLabel('位置 ' + axis, exact).fill('0');
          await expect(action(page, 'ここに記録を作る')).toBeEnabled();
          await task.getByRole('button', { name: '取り消す', ...exact }).click();
          await expect(page.locator('.lv-caption-select')).toHaveCount(0);
          await action(page, '記録を追加').click();
          await target.selectOption({ label: '外板.ply' });
          const pick = page.waitForEvent('filechooser');
          await action(page, 'ピン配置用モデルを選ぶ').click();
          await (await pick).setFiles({ name: '部位.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
          await action(page, 'このモデルでピンを配置する').click();
          await status(page, 'ピン配置用モデルを登録しました。');
          await expect(task).toContainText('ピンを置きたい場所');
        }
        else
          await expect(task).toContainText('ピンを置きたい点を選んでください。');
        await expect(canvas).toHaveAttribute('aria-busy', 'false');
        await lookAlongFront(page);
        const box = (await canvas.boundingBox())!;
        const position = { x: box.width / 2 + (kind === 'GS' ? 3 : 0), y: box.height / 2 - (kind === 'GS' ? 4 : 0) };
        if (touch)
          await canvas.tap({ position });
        else
          await canvas.click({ position });
        await expect(action(page, 'ここに記録を作る')).toBeEnabled();
        await expect(task.getByLabel('位置 X', exact)).toBeHidden();
        const placedPosition = await Promise.all(['X', 'Y', 'Z'].map(async axis => {
          const field = task.getByLabel('位置 ' + axis, exact);
          return field.evaluate(node => (node as HTMLInputElement).valueAsNumber);
        }));
        expect(placedPosition.every(Number.isFinite)).toBe(true);
        await action(page, 'ここに記録を作る').click();
        await detail(page).getByLabel('タイトル', exact).fill('塗装の確認');
        await detail(page).getByLabel('本文', exact).fill('塗装の境界を確認。');
        const picker = page.waitForEvent('filechooser');
        await page.getByLabel('メディアを追加', exact).click();
        await (await picker).setFiles({ name: '外板.png', mimeType: 'image/png', buffer: smallPng() });
        await finishCaptionEditing(page, { title: '塗装の確認', body: '塗装の境界を確認。' });
        await checkPhoto(page);
        const tags = page.getByLabel('分類タグ', exact); await tags.locator(':scope > summary').click();
        const tagSettings = tags.locator('.lv-tag-settings'); await expect(tagSettings).not.toHaveAttribute('open');
        await tagSettings.locator(':scope > summary').click();
        await tagSettings.getByLabel('タグ名', exact).fill('監修');
        await tagSettings.getByRole('button', { name: 'タグを追加', ...exact }).click(); await status(page, 'タグを保存しました。');
        await tagSettings.locator(':scope > summary').click();
        await tags.getByRole('button', { name: 'この記録にタグを付ける', ...exact }).click(); await status(page, '記録のタグを変更しました。');
        await expect(tags.getByRole('button', { name: 'タグを削除', ...exact })).toBeHidden();
        await tags.locator(':scope > summary').click();
        const search = page.getByRole('searchbox', { name: '検索', ...exact });
        await revealCaptionList(page); await search.fill('塗装'); await selectRecord(page);
        const title = detail(page).getByLabel('タイトル', exact);
        await title.dispatchEvent('compositionstart');
        await expect(page.getByRole('button', { name: '記録を検索', exact: true, includeHidden: true })).toBeDisabled();
        await title.dispatchEvent('compositionend');
        if (touch) {
          await action(page, '3D').click(); await page.setViewportSize({ width: 320, height: 568 });
          const a = (await action(page, '記録を検索').boundingBox())!;
          const b = (await page.locator('.lv-camera-positions > summary').boundingBox())!;
          expect(a.x >= b.x + b.width || a.x + a.width <= b.x || a.y >= b.y + b.height || a.y + a.height <= b.y).toBe(true);
        }
        const searchPaint = await action(page, '記録を検索').evaluate(node => {
          const style = getComputedStyle(node); return { background: style.backgroundColor, opacity: Number(style.opacity) };
        });
        expect(searchPaint.background).not.toBe('rgba(0, 0, 0, 0)'); expect(searchPaint.opacity).toBe(1);
        // One Tab from the canvas reaches search before dozens of individual pins.
        await canvas.focus(); await page.keyboard.press('Tab');
        await expect(action(page, '記録を検索')).toBeFocused(); await page.keyboard.press('Enter');
        await expect(search).toBeFocused(); await expect(search).toHaveValue('塗装');
        if (touch) await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator('.lv-caption-select')).toHaveCount(1);
        await search.fill(''); await selectRecord(page);
        const bodyInput = detail(page).getByLabel('本文', exact);
        const retainedBody = '未保存の本文を保持。\u2028';
        await bodyInput.fill(retainedBody);
        if (touch) await action(page, '3D').click();
        await action(page, '記録を検索').click(); await search.fill('見つからない条件');
        if (touch) {
          await expect(page.locator('.lv-retained-edit')).toBeVisible();
          await page.locator('.lv-retained-edit').getByRole('button', { name: '編集に戻る', ...exact }).click();
        }
        await expect(bodyInput).toBeVisible(); await expect(bodyInput).toHaveValue(retainedBody);
        await detail(page).getByRole('button', { name: '取り消す', ...exact }).click();
        await detail(page).getByRole('button', { name: '変更を取り消す', ...exact }).click();
        await revealCaptionList(page); await search.fill(''); await selectRecord(page);
        if (touch) {
          await action(page, '3D').click();
          await expect(page.locator('.lv-project-marker[aria-pressed="true"]')).toBeVisible();
          if (kind === '点群') await checkPinTouchNavigation(page, page.locator('.lv-project-marker').first(), false);
          await tab(page, '記録').click();
        }

        await revealFileSurface(page, '共有');
        const files = page.getByRole('region', { name: 'ファイル', ...exact });
        await selectShareOutput(files, 'review');
        await expect(files.getByLabel('渡すシーン', exact)).toHaveText('渡すシーン：シーン 1');
        await selectShareOutput(files, 'teamWorkspace');
        await closeFileSurface(page);

        await beginSceneCreation(page);
        await page.getByLabel('シーン名', exact).fill(reviewSceneName);
        await action(page, 'シーンを追加').click();
        await status(page, 'シーンを追加しました。');
        await revealCaptionList(page);
        await openAddOptions(page);
        const existing = page.getByLabel('既存の記録を追加', exact);
        await existing.locator(':scope > summary').click();
        const choices = existing.getByRole('listbox');
        await choices.selectOption({ label: '塗装の確認 — 外板.ply' });
        await existing.getByRole('button', { name: 'このシーンに追加', ...exact }).click();
        await status(page, 'このシーンに追加しました。');
        await expect(existing).toHaveJSProperty('open', false);
        await expect(page.locator('.lv-caption-add-settings > summary')).toBeFocused();
        await selectRecord(page);
        await detail(page).getByLabel('本文', exact).fill(sharedBody);
        await finishCaptionEditing(page, {}, 15000);
        await page.getByRole('combobox', { name: 'シーン', exact: true }).selectOption({ label: 'シーン 1' });
        await selectRecord(page);
        await expect(detail(page).getByLabel('本文', exact)).toHaveValue(sharedBody);
        await checkPhoto(page);
        if (sharedTitle !== '塗装の確認') {
          await detail(page).getByLabel('タイトル', exact).fill(sharedTitle);
          await finishCaptionEditing(page, {}, 15000);
        }

        await page.getByRole('combobox', { name: 'シーン', exact: true }).selectOption({ label: reviewSceneName });
        await revealCameraPositions(page);
        const projection = page.locator('.lv-project-camera').getByLabel('投影方式', exact);
        await action(page, '開始視点を記録').click();
        await status(page, '開始視点を記録しました。');
        await projection.selectOption('orthographic');
        await action(page, '開始視点を更新').click();
        await expect(action(page, '開始視点を更新')).toBeEnabled();
        await page.locator('.lv-camera-sheet').getByRole('button', { name: '閉じる', ...exact }).click();

        await revealFileSurface(page, '共有');
        await selectShareOutput(files, 'review');
        const sharedScenes = files.getByRole('group', { name: '渡すシーン', ...exact });
        await sharedScenes.getByRole('checkbox', { name: 'シーン 1', ...exact }).check();
        await sharedScenes.getByRole('checkbox', { name: reviewSceneName, ...exact }).check();
        await files.getByRole('button', { name: '内容を確認', ...exact }).click();
        const contents = files.locator('.lv-share-contents');
        await expect(contents).toBeVisible(); await contents.locator(':scope > summary').click();
        await expect(contents.locator('li').filter({ hasText: /^外板\.ply$/ })).toHaveCount(1);
        await expect(contents.locator('li').filter({ hasText: /^外板\.png$/ })).toHaveCount(1);
        await expect(files).toContainText('写真の撮影情報・位置情報');
        await expect(files).toContainText('相手は編集用コピーを作れます');
        await page.screenshot({ path: info.outputPath('share-contents.png'), fullPage: false });
        // A changed selection cannot keep a formerly checked list/impact visible.
        await sharedScenes.getByRole('checkbox', { name: reviewSceneName, ...exact }).uncheck();
        await expect(contents).toHaveCount(0);
        await sharedScenes.getByRole('checkbox', { name: reviewSceneName, ...exact }).check();
        await files.getByRole('button', { name: '内容を確認', ...exact }).click();
        await expect(contents).toBeVisible();
        const [download] = await Promise.all([page.waitForEvent('download'), files.getByRole('button', { name: 'ダウンロード', ...exact }).click()]);
        const path = info.outputPath('shared-scene.zip');
        await download.saveAs(path);
        expect(await download.failure()).toBeNull();
        const archive = await PackageArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]));
        const snapshot = JSON.parse(new TextDecoder().decode(await archive.entryBytes('review.json', 8_000_000)));
        const exported = Object.values(snapshot.captionsById) as { id: string; title: string; anchor: { positionAsset: number[] } }[];
        expect(exported).toHaveLength(1);
        expect(exported[0]).toMatchObject({ title: sharedTitle, anchor: { positionAsset: placedPosition } });

        const other = await receiver.newPage();
        if (touch && kind === '点群') await other.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          Object.assign(window, { reviewContextUnavailable: true });
          HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
            if ((window as unknown as { reviewContextUnavailable: boolean }).reviewContextUnavailable && this.getAttribute('aria-label') === '3Dモデルの表示') return null;
            return original.apply(this, args);
          } as typeof original;
        });
        await other.goto(baseURL!);
        await chooseHomeFiles(other, path);
        const reader = other.getByRole('main', { name: '閲覧用のシーン', ...exact });
        const heading = reader.getByRole('heading', { level: 1 });
        await expect(heading).toBeFocused();
        const menu = reader.locator('.lv-review-files > summary');
        const canvasBox = await reader.getByLabel('3Dモデルの表示', exact).boundingBox();
        expect(canvasBox!.y).toBeLessThan(76);
        expect(Math.min(options.viewport.height - canvasBox!.y, canvasBox!.height)).toBeGreaterThan(touch ? 320 : 600);
        await expect(reader.getByRole('button', { name: '別のプロジェクトを開く', ...exact })).toBeHidden();
        await menu.focus(); await menu.press('Enter');
        await expect(reader.getByRole('button', { name: '別のプロジェクトを開く', ...exact })).toBeVisible();
        await menu.press('Escape'); await expect(menu).toBeFocused();
        const scenes = other.getByLabel('表示するシーン', exact);
        await expect(scenes.locator('option:checked')).toHaveText('シーン 1');
        await expect(other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' })).toHaveCount(1);
        if (touch && kind === '点群') {
          await expect(action(other, '3D表示を再試行')).toBeVisible();
          await other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).tap();
          const reading = other.getByRole('region', { name: '記録の詳細', ...exact });
          await expect(reading).toBeFocused();
          await reader.getByRole('button', { name: '3Dに戻る', ...exact }).tap();
          await expect(other.getByLabel('3Dモデルの表示', exact)).toBeFocused();
          await expect(action(other, '3D表示を再試行')).toBeInViewport();
          await other.evaluate(() => Object.assign(window, { reviewContextUnavailable: false }));
          await action(other, '3D表示を再試行').click();
          await expect(other.locator('.lv-development-pin').first()).toBeVisible();
        }
        await expect(reader.locator('.lv-review-scene-header h2')).toHaveCount(0);
        if (!touch && kind === '点群' || touch && kind === 'GS') {
          await expect(other.locator('.lv-development-pin').first()).toBeVisible();
          await installSceneReadFault(other);
          await other.evaluate(() => { (window as unknown as { sceneReadFault: SceneReadFault }).sceneReadFault.mode = 'hold'; });
          await scenes.selectOption({ label: reviewSceneName });
          await expect.poll(() => other.evaluate(() => (window as unknown as { sceneReadFault: SceneReadFault }).sceneReadFault.held)).toBe(true);
          const opening = other.getByRole('region', { name: 'シーンの読み込み', ...exact });
          const progress = opening.locator('.lv-validation-status');
          await expect(opening).toBeVisible();
          await expect(progress).toHaveAttribute('data-busy', 'true');
          await expect(progress).toContainText('記録は読めます。');
          await expect(scenes).toBeDisabled();
          await expect(action(other, '再試行')).toBeHidden();
          const early = opening.getByRole('region', { name: '共有シーンの記録' });
          const earlySearch = early.getByRole('searchbox', { name: '検索' });
          await earlySearch.fill('塗装');
          await expect(early.getByRole('button', { name: sharedTitle, exact: true })).toBeVisible();
          expect(await other.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(options.viewport.width);
          const earlyBox = (await earlySearch.boundingBox())!;
          expect(earlyBox.x + earlyBox.width).toBeLessThanOrEqual(options.viewport.width);
          await expect(opening.locator('canvas, img')).toHaveCount(0);
          await earlySearch.dispatchEvent('compositionstart');
          await other.screenshot({ path: info.outputPath('switch-loading.png') });
          await other.evaluate(() => (window as unknown as { sceneReadFault: SceneReadFault }).sceneReadFault.release());
          await expect(progress).toContainText('文字入力を終えると');
          await expect(earlySearch).toBeFocused();
          if (!touch) await early.getByRole('button', { name: sharedTitle, exact: true }).focus();
          await earlySearch.dispatchEvent('compositionend');
          await expect(reader).toBeVisible();
          await expect(reader.getByRole('searchbox')).toHaveValue('塗装');
          if (touch) await expect(reader.getByRole('searchbox')).toBeFocused();
          else {
            await expect(reader.locator('.lv-caption-select').filter({ hasText: sharedTitle })).toBeFocused();
            await expect(reader.locator('.lv-caption-window')).toHaveCount(0);
          }
          await other.evaluate(() => { (window as unknown as { sceneReadFault: SceneReadFault }).sceneReadFault.mode = 'fail'; });
          await scenes.selectOption({ label: 'シーン 1' });
          const retry = action(other, '再試行');
          await expect(progress).toHaveAttribute('data-busy', 'false');
          await expect(progress).toContainText('確認用のシーン読み込み失敗');
          await expect(opening.getByRole('region', { name: '共有シーンの記録' })).toBeVisible();
          await expect(action(other, '編集コピーを作る')).toHaveCount(0);
          await expect(retry).toBeFocused();
          await expect(scenes.locator('option:checked')).toHaveText('シーン 1');
          await other.screenshot({ path: info.outputPath('switch-failed.png') });
          await other.evaluate(() => { (window as unknown as { sceneReadFault: SceneReadFault }).sceneReadFault.mode = 'fail'; });
          await retry.press('Enter');
          await expect(progress).toHaveAttribute('data-busy', 'false');
          await expect(retry).toBeFocused();
          await scenes.selectOption({ label: reviewSceneName });
          await expect(reader).toBeVisible();
          await expect(heading).toBeFocused();
        } else await scenes.selectOption({ label: reviewSceneName });
        // The loading selector already has the requested value; measure only the published reader.
        await expect(reader).toBeVisible();
        await expect(heading).toBeFocused();
        await expect(scenes.locator('option:checked')).toHaveText(reviewSceneName);
        const sceneBox = (await scenes.boundingBox())!;
        expect(sceneBox.x).toBeGreaterThanOrEqual(0);
        expect(sceneBox.x + sceneBox.width).toBeLessThanOrEqual(options.viewport.width);
        const readingCanvas = other.getByLabel('3Dモデルの表示', exact);
        await readingCanvas.focus(); await other.keyboard.press('Tab');
        await expect(action(other, '記録を検索')).toBeFocused(); await other.keyboard.press('Enter');
        const readerSearch = other.getByRole('searchbox', { name: '検索', ...exact });
        await expect(readerSearch).toBeFocused(); await expect(readerSearch).toBeInViewport();
        await readerSearch.fill('塗装'); await expect(other.locator('.lv-caption-select')).toHaveCount(1);
        await readerSearch.dispatchEvent('compositionstart');
        await expect(scenes).toBeDisabled();
        await readerSearch.dispatchEvent('compositionend');
        await expect(scenes).toBeEnabled();
        await action(other, '記録を検索').press('Enter'); await expect(readerSearch).toHaveValue('塗装');
        await readingCanvas.scrollIntoViewIfNeeded();
        const back = action(other, '開始視点に戻る'), receivingProjection = other.getByLabel('投影方式', exact);
        await expect(back).toBeEnabled();
        await expect(back).toBeInViewport();
        await expect(receivingProjection).toHaveValue('orthographic');
        expect(await receivingProjection.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);

        const alternatives = other.getByText('その他の視点', exact);
        await alternatives.click();
        await alternatives.locator('..').getByRole('button', { name: /開始視点/ }).click();
        await expect(receivingProjection).toHaveValue('perspective');
        await alternatives.click();
        await back.click();
        await expect(receivingProjection).toHaveValue('orthographic');
        const axis = other.locator('.lv-project-camera').getByRole('button', { name: 'X', ...exact });
        const orientation = await axis.getAttribute('style');
        await axis.press('Enter');
        await expect(axis).not.toHaveAttribute('style', orientation!);
        await receivingProjection.selectOption('perspective');
        await expect(receivingProjection).toHaveValue('perspective');
        await back.click();
        await expect(receivingProjection).toHaveValue('orthographic');
        await expect(axis).toHaveAttribute('style', orientation!);
        const layout = await other.evaluateHandle(() => {
          const root = document.querySelector('main.lv-review-workspace')!;
          const content = root.querySelector('.lv-development-content')!;
          const status = root.querySelector('.lv-review-render-status > [role="status"]')!;
          const tops: number[] = [];
          const observe = () => tops.push(content.getBoundingClientRect().top - root.getBoundingClientRect().top);
          observe();
          const observer = new MutationObserver(observe);
          observer.observe(status, { childList: true, subtree: true, characterData: true });
          return { tops, stop: () => observer.disconnect() };
        });
        if (touch) {
          const reading = other.getByRole('region', { name: '記録の詳細', ...exact });
          const started = Date.now();
          await other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).tap();
          await expect(reading).toBeFocused();
          await expect(reading.getByRole('heading', { name: sharedTitle, ...exact })).toBeInViewport();
          await expect(reading).toContainText(sharedBody);
          const returnTo3D = reader.getByRole('button', { name: '3Dに戻る', ...exact });
          await expect(returnTo3D).toBeInViewport();
          await expect(reader.locator(':scope > header')).toBeInViewport({ ratio: 1 });
          await info.attach('shared-reading-entry', { body: JSON.stringify({ milliseconds: Date.now() - started, from: 'selected list row', to: 'focused visible detail heading', viewport: options.viewport }), contentType: 'application/json' });
          await returnTo3D.press('Enter');
          await expect(readingCanvas).toBeFocused();
          await expect(readerSearch).toHaveValue('塗装');
          await expect(scenes.locator('option:checked')).toHaveText(reviewSceneName);
          await expect(receivingProjection).toHaveValue('orthographic');
          const pin = other.locator('.lv-development-pin').first();
          if (kind === '点群') {
            await checkPinTouchNavigation(other, pin, true);
            // A quick genuine tap after orbit may arrive without a compatibility click.
            await pin.evaluate(node => node.addEventListener('click', e => e.stopImmediatePropagation(), { capture: true, once: true }));
          }
          await pin.tap();
          await expect(reading).toBeFocused();
          await expect(other.locator('.lv-caption-window')).toHaveCount(0);
        } else await other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).click();
        await expect(other.getByText(sharedBody, exact).first()).toBeVisible();
        const selectedPin = other.locator('.lv-development-pin[aria-current="true"]');
        await expect(selectedPin).toBeVisible();
        await expect(selectedPin).toHaveAccessibleName(sharedTitle);
        await expect.poll(() => selectedPin.evaluate(node => getComputedStyle(node, '::before').boxShadow)).toContain('3px');
        expect((await selectedPin.boundingBox())!.width).toBeGreaterThanOrEqual(44);
        const photoArea = touch ? other.getByLabel('選択中の記録のメディア', exact) : reader.locator('.lv-caption-window[data-active="true"]');
        await photoArea.getByRole('button', { name: '画像を表示', ...exact }).click();
        const photoViewer = other.getByRole('dialog', { name: 'メディアビューア', ...exact });
        const originalPhoto = photoViewer.locator('img');
        await expect(originalPhoto).toHaveJSProperty('naturalWidth', 2);
        const receivedDigest = await originalPhoto.evaluate(async node => {
          const bytes = await (await fetch((node as HTMLImageElement).currentSrc)).arrayBuffer();
          return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
        });
        expect(receivedDigest).toBe(createHash('sha256').update(smallPng()).digest('hex'));
        const locatePhoto = photoViewer.getByRole('button', { name: '3Dでピンを見る', ...exact });
        if (touch) await locatePhoto.tap(); else await locatePhoto.press('Enter');
        await expect(photoViewer).toBeHidden();
        await expect(selectedPin).toHaveAttribute('data-caption-id', exported[0]!.id);
        await expect.poll(() => selectedPin.evaluate(node => {
          const box = node.getBoundingClientRect();
          return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === node;
        })).toBe(true);
        if (touch) await selectedPin.tap(); else await selectedPin.click();
        await photoArea.getByRole('button', { name: '画像を表示', ...exact }).click();
        await other.getByRole('dialog', { name: 'メディアビューア', ...exact }).getByRole('button', { name: '閉じる', ...exact }).click();
        await expect(photoArea.getByRole('button', { name: '画像を表示', ...exact })).toBeFocused();
        if (touch) {
          // Native end-alignment must keep the outer reading panel inside the viewport.
          await photoArea.getByRole('button', { name: '画像を表示', ...exact }).evaluate(node => node.scrollIntoView({ block: 'end', behavior: 'auto' }));
        }
        if (!touch) {
          await photoArea.getByRole('button', { name: '閉じる', ...exact }).click();
          await expect(reader.locator('.lv-caption-select[aria-current="true"]')).toBeInViewport({ ratio: 1 });
          await expect(reader.getByLabel('選択中の記録のメディア', exact).getByRole('button', { name: '画像を表示', ...exact })).toBeVisible();
        }
        const readingContent = reader.locator('.lv-review-reading-content');
        await readingContent.evaluate(node => { node.scrollTop = node.scrollHeight; });
        await expect(scenes).toBeInViewport({ ratio: 1 });
        await expect(back).toBeInViewport({ ratio: 1 });
        // A one-record search has no previous/next navigation to pin below the scene row.
        await expect(reader.locator('.lv-review-record-header')).toBeHidden();
        if (!touch) {
          await back.click();
          await expect(receivingProjection).toHaveValue('orthographic');
        }
        // Compact reading releases 3D resources; the pin becomes accessible again on return.
        await expect(selectedPin).toHaveAttribute('aria-label', sharedTitle);
        if (touch) {
          const reading = other.getByRole('region', { name: '記録の詳細', ...exact });
          const photo = reading.getByRole('button', { name: '画像を表示', ...exact });
          const returnTo3D = reader.getByRole('button', { name: '3Dに戻る', ...exact });
          await expect(returnTo3D).toBeInViewport();
          const panel = (await reader.locator('.lv-development-sidebar').boundingBox())!;
          const projectHeader = (await reader.locator(':scope > header').boundingBox())!;
          expect(panel.y).toBeGreaterThanOrEqual(projectHeader.y + projectHeader.height - 1);
          expect(panel.y + panel.height).toBeLessThanOrEqual(options.viewport.height + 1);
          await other.screenshot({ path: info.outputPath('reading-long-record.png') });
          await returnTo3D.tap();
          await expect(readingCanvas).toBeFocused();
          await expect(reader.locator(':scope > header')).toBeInViewport({ ratio: 1 });
          await expect(returnTo3D).toBeHidden();
          await expect(selectedPin).toBeInViewport();
          await expect(selectedPin).toHaveAccessibleName(sharedTitle);
          await expect(readerSearch).toHaveValue('塗装');
          await expect(back).toBeEnabled();
          await back.press('Enter');
          await expect(receivingProjection).toHaveValue('orthographic');
          await photo.scrollIntoViewIfNeeded();
          await expect(returnTo3D).toBeInViewport();
          await returnTo3D.tap();
          await expect(readingCanvas).toBeFocused();
          await expect(selectedPin).toBeInViewport();
          if (kind === 'GS') {
            await other.setViewportSize({ width: 320, height: 568 });
            const narrowScene = (await scenes.boundingBox())!;
            expect(narrowScene.x + narrowScene.width).toBeLessThanOrEqual(320);
            await action(other, '記録を検索').press('Enter');
            await readerSearch.fill('一致する記録がない検索');
            await expect(readerSearch).toBeFocused();
            await expect(other.getByText('このシーンに条件に合う記録はありません。', exact)).toBeVisible();
            await readerSearch.fill('塗装');
            await other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).press('Enter');
            await expect(reading).toBeFocused();
            await other.evaluate(() => { document.documentElement.style.zoom = '2'; });
            await reading.press('Tab');
            await expect(photo).toBeFocused();
            await expect(photo).toBeInViewport();
            await photo.press('Tab');
            await expect(alternatives).toBeFocused();
            await expect(alternatives).toBeInViewport();
            await other.keyboard.press('Tab');
            // Some browsers cross their document boundary before wrapping to the header.
            if (await other.evaluate(() => document.activeElement === document.body)) await other.keyboard.press('Tab');
            await expect(returnTo3D).toBeFocused();
            await expect(returnTo3D).toBeInViewport();
            expect(await other.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
            await returnTo3D.press('Enter');
            await expect(readingCanvas).toBeFocused();
            await expect(readerSearch).toHaveValue('塗装');
            await other.evaluate(() => { document.documentElement.style.zoom = ''; });
            await other.setViewportSize(options.viewport);
          }
        }
        await expect(other.locator('.lv-review-render-status [role="status"]')).not.toContainText('準備しています');
        const tops = await layout.evaluate(value => { value.stop(); return value.tops; });
        await layout.dispose();
        if (touch) expect(tops.length).toBeGreaterThan(1);
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
        await other.screenshot({ path: info.outputPath('received-scene.png') });
        await scenes.selectOption({ label: 'シーン 1' });
        await expect(reader).toBeVisible();
        await scenes.selectOption({ label: reviewSceneName });
        await expect(readerSearch).toHaveValue('塗装');
        await expect(reader.locator('.lv-caption-select')).toHaveCount(1);
        await expect(reader.locator('.lv-development-pin[aria-current="true"]')).toHaveAccessibleName(sharedTitle);
        if (!touch && kind === '点群') {
          const filter = reader.locator('.lv-caption-colors');
          const color = filter.getByRole('button', { name: /のピン$/ }).first();
          await reader.locator('.lv-caption-color-menu > summary').click();
          await color.click();
          await expect(reader.locator('.lv-caption-select')).toHaveCount(0);
          await scenes.selectOption({ label: 'シーン 1' });
          await expect(reader).toBeVisible();
          await scenes.selectOption({ label: reviewSceneName });
          await expect(reader).toBeVisible();
          await expect(reader.locator('.lv-caption-select')).toHaveCount(0);
          await reader.locator('.lv-caption-color-menu > summary').click();
          await color.click();
          await expect(selectedPin).toHaveAccessibleName(sharedTitle);
        }
        if (touch && kind === 'GS') {
          // Exercise the single-scene heading through an actual selected export, not a DOM substitute.
          await sharedScenes.getByRole('checkbox', { name: 'シーン 1', ...exact }).uncheck();
          await files.getByRole('button', { name: '内容を確認', ...exact }).click();
          const [singleDownload] = await Promise.all([page.waitForEvent('download'), files.getByRole('button', { name: 'ダウンロード', ...exact }).click()]);
          const singlePath = info.outputPath('single-long-scene.zip');
          await singleDownload.saveAs(singlePath); expect(await singleDownload.failure()).toBeNull();
          const single = await receiver.newPage();
          await single.goto(baseURL!); await chooseHomeFiles(single, singlePath);
          const singleReader = single.getByRole('main', { name: '閲覧用のシーン', ...exact });
          const sceneHeading = singleReader.locator('.lv-review-scene-header').getByRole('heading', { name: reviewSceneName, ...exact });
          await expect(sceneHeading).toBeVisible(); await expect(sceneHeading).toHaveAttribute('title', reviewSceneName);
          await expect(singleReader.getByRole('combobox', { name: '表示するシーン', ...exact })).toHaveCount(0);
          for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
            await single.setViewportSize(viewport);
            const readingHeight = await singleReader.locator('.lv-review-reading-content').evaluate(node => node.clientHeight);
            const sceneHeight = await singleReader.locator('.lv-review-scene-header').evaluate(node => node.clientHeight);
            expect(readingHeight).toBeGreaterThan(sceneHeight);
            expect(await single.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
            await single.screenshot({ path: info.outputPath(`single-scene-${viewport.width}.png`) });
          }
          await singleReader.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).press('Enter');
          await expect(singleReader.getByRole('region', { name: '記録の詳細', ...exact })).toContainText(sharedBody);
        }
      }
      catch (error) {
        const failedPage = sender.pages()[0];
        if (failedPage && !failedPage.isClosed()) {
          await info.attach('sharing-failure', { body: await failedPage.locator('body').innerText(), contentType: 'text/plain' });
          await failedPage.screenshot({ path: info.outputPath('sharing-failure.png') });
        }
        throw error;
      } finally {
        await receiver.close();
        await sender.close();
      }
    });
  }

test('配置用モデルのないGSに座標で記録し、再開して元の位置を確認する', async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await chooseHomeFiles(page, { name: '外板.ply', mimeType: 'application/octet-stream', buffer: gs });
  await action(page, 'プロジェクトを作成').click();
  await expect(action(page, '閲覧する')).toBeEnabled({ timeout: 90000 });
  await action(page, '記録を追加').click();
  const task = page.getByRole('region', { name: '位置の調整', ...exact });
  await task.getByLabel('記録するモデル', exact).selectOption({ label: '外板.ply' });
  await action(page, '座標を入力').click();
  const position = ['0.25', '0.5', '0'];
  for (const [index, axis] of ['X', 'Y', 'Z'].entries())
    await task.getByLabel('位置 ' + axis, exact).fill(position[index]!);
  await action(page, 'ここに記録を作る').click();
  await status(page, 'ピンの位置を確定しました。');
  await detail(page).getByLabel('タイトル', exact).fill('基準点');
  await finishCaptionEditing(page, {}, 15000);
  await page.reload();
  await page.locator('.lv-caption-select').filter({ hasText: '基準点' }).click();
  await action(page, '位置を調整').click();
  await task.getByText('座標で微調整', exact).click();
  for (const [index, axis] of ['X', 'Y', 'Z'].entries())
    await expect(task.getByLabel('位置 ' + axis, exact)).toHaveValue(position[index]!);
  await task.getByRole('button', { name: '取り消す', ...exact }).click();
});
