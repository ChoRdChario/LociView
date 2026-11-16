import { expect, test, type Page } from '@playwright/test';
import { gsFixture } from '../helpers/gsFixture';
import { smallPng, triangleGlb } from './fixtures';
import { chooseHomeFiles, openAddOptions, beginSceneCreation, closeFileSurface, lookAlongFront, revealCameraPositions, revealCaptionList, revealFileSurface, selectShareOutput } from './workspaceUi';

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
const detail = (page: Page) => page.getByRole('region', { name: 'キャプションの詳細', ...exact });
const status = (page: Page, text: string) => expect(page.getByText(text, exact)).toBeVisible();

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
  const open = detail(page).getByRole('button', { name: '画像を表示', ...exact });
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
        await action(page, 'キャプションを追加').click();
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
          await action(page, 'キャプションを追加').click();
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
        await action(page, 'ここに記録を作る').click();
        await detail(page).getByLabel('タイトル', exact).fill('塗装の確認');
        await detail(page).getByLabel('本文', exact).fill('塗装の境界を確認。');
        const picker = page.waitForEvent('filechooser');
        await page.getByLabel('メディアを追加', exact).click();
        await (await picker).setFiles({ name: '外板.png', mimeType: 'image/png', buffer: smallPng() });
        await detail(page).getByRole('button', { name: '変更を適用', ...exact }).click();
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
        await bodyInput.fill('未適用の本文を保持。');
        if (touch) await action(page, '3D').click();
        await action(page, '記録を検索').click(); await search.fill('見つからない条件');
        if (touch) {
          await expect(page.locator('.lv-retained-edit')).toBeVisible();
          await page.locator('.lv-retained-edit').getByRole('button', { name: '編集に戻る', ...exact }).click();
        }
        await expect(bodyInput).toBeVisible(); await expect(bodyInput).toHaveValue('未適用の本文を保持。');
        await detail(page).getByRole('button', { name: '取り消す', ...exact }).click();
        await detail(page).getByRole('button', { name: '変更を取り消す', ...exact }).click();
        await revealCaptionList(page); await search.fill(''); await selectRecord(page);
        if (touch) {
          await action(page, '3D').click();
          await expect(page.locator('.lv-project-marker[aria-pressed="true"]')).toBeVisible();
          await tab(page, 'キャプション').click();
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
        await detail(page).getByRole('button', { name: '変更を適用', ...exact }).click();
        await status(page, '変更を適用しました。');
        await action(page, 'シーン 1').click();
        await selectRecord(page);
        await expect(detail(page).getByLabel('本文', exact)).toHaveValue(sharedBody);
        await checkPhoto(page);
        if (sharedTitle !== '塗装の確認') {
          await detail(page).getByLabel('タイトル', exact).fill(sharedTitle);
          await detail(page).getByRole('button', { name: '変更を適用', ...exact }).click();
          await status(page, '変更を適用しました。');
        }

        await action(page, reviewSceneName).click();
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
        const [download] = await Promise.all([page.waitForEvent('download'), files.getByRole('button', { name: 'ダウンロード', ...exact }).click()]);
        const path = info.outputPath('shared-scene.zip');
        await download.saveAs(path);
        expect(await download.failure()).toBeNull();

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
          const reading = other.getByRole('region', { name: 'キャプションの詳細', ...exact });
          await expect(reading).toBeFocused();
          await reading.getByRole('button', { name: '3Dに戻る', ...exact }).tap();
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
          await expect(progress).toContainText('シーンを読み込んでいます…');
          await expect(scenes).toBeDisabled();
          await expect(action(other, '再試行')).toBeHidden();
          await other.screenshot({ path: info.outputPath('switch-loading.png') });
          await other.evaluate(() => (window as unknown as { sceneReadFault: SceneReadFault }).sceneReadFault.release());
          await expect(reader).toBeVisible();
          await other.evaluate(() => { (window as unknown as { sceneReadFault: SceneReadFault }).sceneReadFault.mode = 'fail'; });
          await scenes.selectOption({ label: 'シーン 1' });
          const retry = action(other, '再試行');
          await expect(progress).toHaveAttribute('data-busy', 'false');
          await expect(progress).toContainText('確認用のシーン読み込み失敗');
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
          const reading = other.getByRole('region', { name: 'キャプションの詳細', ...exact });
          const started = Date.now();
          await other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).tap();
          await expect(reading).toBeFocused();
          await expect(reading.getByRole('heading', { name: sharedTitle, ...exact })).toBeInViewport();
          await expect(reading).toContainText(sharedBody);
          const returnTo3D = reading.getByRole('button', { name: '3Dに戻る', ...exact });
          await expect(returnTo3D).toBeInViewport();
          await info.attach('shared-reading-entry', { body: JSON.stringify({ milliseconds: Date.now() - started, from: 'selected list row', to: 'focused visible detail heading', viewport: options.viewport }), contentType: 'application/json' });
          await returnTo3D.press('Enter');
          await expect(readingCanvas).toBeFocused();
          await expect(readerSearch).toHaveValue('塗装');
          await expect(scenes.locator('option:checked')).toHaveText(reviewSceneName);
          await expect(receivingProjection).toHaveValue('orthographic');
          await other.locator('.lv-development-pin').first().tap();
          await expect(reading).toBeFocused();
          await expect(other.locator('.lv-caption-window')).toHaveCount(0);
        } else await other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).click();
        await expect(other.getByText(sharedBody, exact).first()).toBeVisible();
        const selectedPin = other.locator('.lv-development-pin[aria-current="true"]');
        await expect(selectedPin).toBeVisible();
        await expect(selectedPin).toHaveAccessibleName(sharedTitle);
        await expect(selectedPin).toHaveCSS('box-shadow', /3px/);
        await other.getByLabel('選択中のキャプションのメディア', exact).getByRole('button', { name: '画像を表示', ...exact }).click();
        await expect(other.getByRole('dialog', { name: 'メディアビューア', ...exact }).locator('img')).toHaveJSProperty('naturalWidth', 2);
        await other.getByRole('dialog', { name: 'メディアビューア', ...exact }).getByRole('button', { name: '閉じる', ...exact }).click();
        if (touch) {
          const reading = other.getByRole('region', { name: 'キャプションの詳細', ...exact });
          const photo = reading.getByRole('button', { name: '画像を表示', ...exact });
          await expect(photo).toBeFocused();
          const returnTo3D = reading.getByRole('button', { name: '3Dに戻る', ...exact });
          await expect(returnTo3D).toBeInViewport();
          await other.screenshot({ path: info.outputPath('reading-long-record.png') });
          await returnTo3D.tap();
          await expect(readingCanvas).toBeFocused();
          await expect(selectedPin).toBeInViewport();
          await expect(readerSearch).toHaveValue('塗装');
          if (kind === 'GS') {
            await other.setViewportSize({ width: 320, height: 568 });
            const narrowScene = (await scenes.boundingBox())!;
            expect(narrowScene.x + narrowScene.width).toBeLessThanOrEqual(320);
            await action(other, '記録を検索').press('Enter');
            await readerSearch.fill('一致する記録がない検索');
            await expect(readerSearch).toBeFocused();
            await expect(other.getByText('このシーンに条件に合うキャプションはありません。', exact)).toBeVisible();
            await readerSearch.fill('塗装');
            await other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).press('Enter');
            await expect(reading).toBeFocused();
            await other.evaluate(() => { document.documentElement.style.zoom = '2'; });
            await reading.press('Tab');
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
      }
      finally {
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
  await action(page, 'キャプションを追加').click();
  const task = page.getByRole('region', { name: '位置の調整', ...exact });
  await task.getByLabel('記録するモデル', exact).selectOption({ label: '外板.ply' });
  await action(page, '座標を入力').click();
  const position = ['0.25', '0.5', '0'];
  for (const [index, axis] of ['X', 'Y', 'Z'].entries())
    await task.getByLabel('位置 ' + axis, exact).fill(position[index]!);
  await action(page, 'ここに記録を作る').click();
  await status(page, 'ピンの位置を確定しました。');
  await detail(page).getByLabel('タイトル', exact).fill('基準点');
  await detail(page).getByRole('button', { name: '変更を適用', ...exact }).click();
  await status(page, '変更を適用しました。');
  await page.reload();
  await page.locator('.lv-caption-select').filter({ hasText: '基準点' }).click();
  await action(page, '位置を調整').click();
  await task.getByText('座標で微調整', exact).click();
  for (const [index, axis] of ['X', 'Y', 'Z'].entries())
    await expect(task.getByLabel('位置 ' + axis, exact)).toHaveValue(position[index]!);
  await task.getByRole('button', { name: '取り消す', ...exact }).click();
});
