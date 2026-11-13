import { expect, test, type Page } from '@playwright/test';
import { gsFixture } from '../helpers/gsFixture';
import { smallPng, triangleGlb } from './fixtures';
import { beginSceneCreation, closeFileSurface, lookAlongFront, revealCameraPositions, revealCaptionList, revealFileSurface, selectShareOutput } from './workspaceUi';

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
      const sender = await browser.newContext(options), receiver = await browser.newContext(options);
      try {
        const page = await sender.newPage();
        await page.goto(baseURL!);
        const input = page.getByLabel('ファイルを選択', exact);
        await input.setInputFiles({ name: 'invalid.zip', mimeType: 'application/zip', buffer: Buffer.from('invalid') });
        await action(page, 'ファイルを開く').click();
        const fileStatus = page.locator('.lv-validation-status');
        await expect(fileStatus).toHaveAttribute('data-busy', 'false');
        const error = await fileStatus.innerText();
        expect(error.trim()).not.toBe('');
        await input.setInputFiles({ name: '外板.ply', mimeType: 'application/octet-stream', buffer: kind === '点群' ? points : gs });
        await expect(fileStatus).not.toHaveText(error);
        await action(page, 'ファイルを開く').click();
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
          await status(page, '位置指定用の面を登録しました。');
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
        await page.getByLabel('シーン名', exact).fill('監修用');
        await action(page, 'シーンを追加').click();
        await status(page, 'シーンを追加しました。');
        await revealCaptionList(page);
        const existing = page.getByLabel('既存の記録を追加', exact);
        await existing.locator(':scope > summary').click();
        const choices = existing.getByRole('listbox');
        await choices.selectOption({ label: '塗装の確認 — 外板.ply' });
        await existing.getByRole('button', { name: 'このシーンに追加', ...exact }).click();
        await status(page, 'このシーンに追加しました。');
        await expect(existing).toHaveJSProperty('open', false);
        await selectRecord(page);
        await detail(page).getByLabel('本文', exact).fill('監修用シーンでも同じ記録を確認。');
        await detail(page).getByRole('button', { name: '変更を適用', ...exact }).click();
        await status(page, '変更を適用しました。');
        await action(page, 'シーン 1').click();
        await selectRecord(page);
        await expect(detail(page).getByLabel('本文', exact)).toHaveValue('監修用シーンでも同じ記録を確認。');
        await checkPhoto(page);

        await action(page, '監修用').click();
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
        await sharedScenes.getByRole('checkbox', { name: '監修用', ...exact }).check();
        await files.getByRole('button', { name: '内容を確認', ...exact }).click();
        const [download] = await Promise.all([page.waitForEvent('download'), files.getByRole('button', { name: 'ダウンロード', ...exact }).click()]);
        const path = info.outputPath('shared-scene.zip');
        await download.saveAs(path);
        expect(await download.failure()).toBeNull();

        const other = await receiver.newPage();
        await other.goto(baseURL!);
        await other.getByLabel('ファイルを選択', exact).setInputFiles(path);
        await action(other, 'ファイルを開く').click();
        const scenes = other.getByLabel('表示するシーン', exact);
        await expect(scenes.locator('option:checked')).toHaveText('シーン 1');
        await expect(other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' })).toHaveCount(1);
        await scenes.selectOption({ label: '監修用' });
        await expect(scenes.locator('option:checked')).toHaveText('監修用');
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
        if (touch) {
          await other.locator('.lv-development-pin').first().tap();
          await expect(other.getByRole('region', { name: 'キャプションの詳細', ...exact })).toBeFocused();
          await expect(other.locator('.lv-caption-window')).toHaveCount(0);
        } else await other.locator('.lv-caption-select').filter({ hasText: '塗装の確認' }).click();
        await expect(other.getByText('監修用シーンでも同じ記録を確認。', exact).first()).toBeVisible();
        await expect(other.locator('.lv-development-pin[aria-current="true"]')).toBeVisible();
        await other.getByLabel('選択中のキャプションのメディア', exact).getByRole('button', { name: '画像を表示', ...exact }).click();
        await expect(other.getByRole('dialog', { name: 'メディアビューア', ...exact }).locator('img')).toHaveJSProperty('naturalWidth', 2);
        await other.getByRole('dialog', { name: 'メディアビューア', ...exact }).getByRole('button', { name: '閉じる', ...exact }).click();
        await expect(other.locator('main.lv-review-workspace > [role="status"]')).not.toContainText('準備しています');
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
  await page.getByLabel('ファイルを選択', exact).setInputFiles({ name: '外板.ply', mimeType: 'application/octet-stream', buffer: gs });
  await action(page, 'ファイルを開く').click();
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
