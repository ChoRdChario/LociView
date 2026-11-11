import {test, createBrowserProfile} from '../helpers/browserProfile';
import { revealCameraPositions, revealWorkPanel, revealCoordinateAdd, revealFileSurface, revealProjectSelection, lookAlongFront, revealOfflineUtilities } from './workspaceUi';
import { expect, chromium, type Locator } from '@playwright/test';
import { readFile} from 'node:fs/promises';

import * as A from '@automerge/automerge';
import { triangleGlb, smallPng, nativeConversionBackup } from './fixtures';
import { ownedServer } from '../offline-e2e/server';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';

async function readablePrimaryHover(control:Locator){
  await expect(control).toBeEnabled();await control.hover();
  const colors=await control.evaluate(node=>{
    const style=getComputedStyle(node),rgb=(value:string)=>value.match(/[\d.]+/g)!.map(Number),front=rgb(style.color),back=rgb(style.backgroundColor);
    const luminance=(color:number[])=>color.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i]!,0);
    const a=luminance(front),b=luminance(back);return{foregroundAlpha:front[3]??1,backgroundAlpha:back[3]??1,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
  expect(colors.foregroundAlpha).toBe(1);expect(colors.backgroundAlpha).toBe(1);expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
}

test('short Caption workspace keeps dense and filtered lists, Scene choices and draft completion reachable', async ({}, info) => {
  const server = await ownedServer('offline-desktop-dist'), browser = await chromium.launch({ channel: 'chromium', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' }), p = await context.newPage();
  const errors: string[] = [], remote: string[] = [];
  p.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue(); remote.push(url.href); return route.abort(); });
  const input = await nativeConversionBackup(triangleGlb(), smallPng(), 36, false, { bodies: new Map(), update(snapshot) {
    snapshot.project.title = '小さな画面の記録';
    snapshot.displaySets[0].name = '観察する部品と写真を切り替える長いシーン';
    snapshot.displaySets[1].name = '資料全体と記録の位置を確認するシーン';
    for (const n of [3, 4]) snapshot.displaySets.push({ id: `set_${String(n).padStart(26, '0')}`, name: `追加${n}：長い日本語のシーンを選択して確認する`, orderKey: `B${n}`, defaultSavedViewId: null });
    for (const n of [2, 3, 4]) snapshot.captions[n].title = `絞込三件 ${n}：現地の長い記録名`;
  } });
  const scenes = p.getByRole('region', { name: 'シーン', exact: true }), strip = scenes.locator(':scope > div');
  const task = p.locator('.lv-caption-task'), list = p.getByRole('list', { name: 'キャプション一覧', exact: true });
  const detail = p.getByRole('region', { name: 'キャプションの詳細', exact: true }), search = p.locator('.lv-caption-search').getByRole('searchbox', { name: '検索', exact: true });
  const split = () => Promise.all([task.locator(':scope > .lv-caption-browser').boundingBox(), task.locator(':scope > .lv-caption-reading').boundingBox()]);
  const layout = async (name: string, dense = false) => {
    const data = await task.evaluate(root => {
      const rect = (n: Element) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
      const browser = root.querySelector('.lv-caption-browser')!, reading = root.querySelector('.lv-caption-reading')!, list = root.querySelector('.lv-caption-list')!;
      return { task: rect(root), browser: rect(browser), detail: rect(reading), list: rect(list), client: root.clientHeight, scroll: root.scrollHeight, bodyScroll: document.documentElement.scrollWidth, viewport: innerWidth };
    });
    await info.attach(name, { body: JSON.stringify(data), contentType: 'application/json' });
    expect(data.browser.top).toBeGreaterThanOrEqual(data.task.top - 1); expect(data.detail.bottom).toBeLessThanOrEqual(data.task.bottom + 1);
    expect(data.browser.height).toBeGreaterThan(0); expect(data.detail.height).toBeGreaterThan(0); expect(data.scroll).toBeLessThanOrEqual(data.client + 1); expect(data.bodyScroll).toBeLessThanOrEqual(data.viewport);
    if (dense) expect(data.list.height).toBeGreaterThanOrEqual(3 * 44);
  };
  try {
    await p.goto(server.url); await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: '四つのシーン.zip', mimeType: 'application/zip', buffer: input });
    await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await p.getByRole('button', { name: '新しいプロジェクトに変換', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('小さな画面の記録', { timeout: 90_000 });
    await expect(p.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false');
    await expect(strip.locator('button')).toHaveCount(4); await list.locator('.lv-caption-select').filter({ hasText: '既存のピン' }).click();
    const selected = strip.locator('button[aria-pressed="true"]');
    await expect.poll(() => selected.evaluate(node => { const r = node.getBoundingClientRect(), parent = node.parentElement!.getBoundingClientRect(); return r.left >= parent.left - 1 && r.left < parent.right - 44; })).toBe(true);
    await layout('dense-short', true); await p.screenshot({ path: info.outputPath('dense-short.png') });
    const header = p.locator('main.lv-project-workspace > header');
    await header.getByRole('button', { name: '閲覧する', exact: true }).click(); await expect(header.getByRole('button', { name: '編集する', exact: true })).toBeEnabled();
    await readablePrimaryHover(header.getByRole('button',{name:'編集する',exact:true}));
    await p.setViewportSize({ width: 720, height: 500 }); await revealWorkPanel(p); await layout('reading-200percent');
    await expect(detail.getByRole('heading', { name: '既存のピン', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(detail.locator('[data-caption-field="body"] p')).toBeInViewport({ ratio: 1 });
    await expect(list.locator('.lv-caption-select').first()).toBeInViewport({ ratio: 1 });
    for (const name of ['前の記録', '次の記録']) expect((await detail.getByRole('button', { name, exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await p.screenshot({ path: info.outputPath('reading-200percent.png') });
    await p.setViewportSize({ width: 1280, height: 720 }); await header.getByRole('button', { name: '編集する', exact: true }).click(); await expect(header.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled();
    const beforeFocus = await split(); await search.focus(); expect(await split()).toEqual(beforeFocus); await expect(task).toHaveAttribute('data-editing', 'false');
    await list.hover(); await p.mouse.wheel(0, 500); await expect.poll(() => list.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    const manualTop = await list.evaluate(node => node.scrollTop); await search.focus(); expect(await list.evaluate(node => node.scrollTop)).toBe(manualTop);
    const stripMotion = strip.evaluate(node => new Promise<number>(resolve => node.addEventListener('scrollend', () => resolve(node.scrollLeft), { once: true })));
    await strip.hover(); await p.mouse.wheel(180, 0); const manualSceneLeft = await stripMotion; expect(manualSceneLeft).toBeGreaterThan(0);
    await search.fill('絞込三件'); expect(await strip.evaluate(node => node.scrollLeft)).toBe(manualSceneLeft);
    for (const [query, count] of [['絞込三件', 3], ['既存のピン', 1], ['該当しない長い日本語の検索文字列', 0]] as const) {
      await search.fill(query); await expect(list.locator('.lv-caption-select')).toHaveCount(count); await layout(`filtered-${count}`);
      await expect(detail.getByLabel('本文', { exact: true })).toHaveValue('本文を保持');
    }
    await search.fill('既存のピン'); await list.locator('.lv-caption-select').click();
    const body = detail.getByLabel('本文', { exact: true }), beforeBodyFocus = await split(); await body.focus(); expect(await split()).toEqual(beforeBodyFocus); await expect(task).toHaveAttribute('data-editing', 'false');
    await body.fill('小画面で保持する入力'); await expect(task).toHaveAttribute('data-editing', 'true');
    await p.setViewportSize({ width: 720, height: 500 }); await revealWorkPanel(p); await body.focus();
    await body.dispatchEvent('compositionstart', { data: '入力中' }); await p.setViewportSize({ width: 1280, height: 600 });
    await expect(body).toBeFocused(); await expect(body).toHaveValue('小画面で保持する入力'); await body.dispatchEvent('compositionend', { data: '入力中' });
    for (const size of [{ width: 1280, height: 600 }, { width: 720, height: 500 }]) {
      await p.setViewportSize(size); await revealWorkPanel(p); await layout(`edit-${size.width}`);
      for (const name of ['変更を適用', '取り消す']) await expect(detail.locator('[data-caption-completion]').getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
      expect(await detail.locator('[data-caption-completion] > button').evaluateAll(nodes => nodes.every(node => { const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.width >= 44 && r.height >= 44 && (hit === node || node.contains(hit)); }))).toBe(true);
    }
    await detail.getByRole('button', { name: '取り消す', exact: true }).click(); await detail.getByRole('button', { name: '変更を取り消す', exact: true }).click(); await expect(body).toHaveValue('本文を保持');
    await p.setViewportSize({ width: 1280, height: 720 }); await search.fill(''); await layout('return-dense', true);
    const otherName = await strip.locator('button[aria-pressed="false"]').first().innerText(), other = strip.getByRole('button', { name: otherName, exact: true });
    await other.focus(); await p.keyboard.press('Enter'); await expect(other).toHaveAttribute('aria-pressed', 'true');
    await p.setViewportSize({ width: 720, height: 500 }); await revealWorkPanel(p); await expect(task).toHaveAttribute('data-selected', 'false');
    await expect(search).toBeInViewport({ ratio: 1 }); await expect(p.getByRole('button', { name: 'キャプションを追加', exact: true })).toBeInViewport({ ratio: 1 });
    await p.setViewportSize({ width: 1280, height: 720 });
    await strip.getByRole('button', { name: '観察する部品と写真を切り替える長いシーン', exact: true }).focus(); await p.keyboard.press('Enter');
    await expect(list.locator('.lv-caption-select').filter({ hasText: '既存のピン' })).toBeVisible();
    await scenes.getByText('シーンを管理', { exact: true }).click(); await expect(scenes.getByRole('button', { name: 'シーンを作る', exact: true })).toBeInViewport();
    await scenes.getByText('シーンを管理', { exact: true }).click(); await p.screenshot({ path: info.outputPath('returned-short.png') });
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally { await context.close(); await browser.close(); await server.stop(); }
});

test('view mode hides editing while preserving reading, local display, existing downloads and return to saved editing', async ({}, info) => {
  test.setTimeout(180_000); A.getHeads(A.init());
  const server = await ownedServer('offline-desktop-dist'), errors: string[] = [], remote: string[] = [];
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(u.protocol)) return route.continue(); remote.push(u.href); return route.abort(); });
  const p = await context.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', e => errors.push(e.message));
  const detail = p.getByRole('region', { name: 'キャプションの詳細', exact: true });
  const tab = (name: string) => p.getByRole('tab', { name, exact: true });
  const ready = async (text: string) => { await expect(p.getByText(text, { exact: true })).toBeVisible(); await expect(p.locator('main.lv-project-workspace > header > p.lv-operation-status')).toHaveAttribute('data-busy', 'false'); };
  const menu = p.locator('details.lv-project-files'), files = p.getByRole('region', { name: 'ファイル', exact: true });
  const save = async (name: string) => {
    const stageBefore = await p.locator('.lv-project-stage').boundingBox();
    if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
    expect(await p.locator('.lv-project-stage').boundingBox()).toEqual(stageBefore);
    if(!await revealFileSurface(p,'保存')) await files.getByRole('button', { name: '保存', exact: true }).click();
    await readablePrimaryHover(files.locator('button.lv-file-primary'));
    const [download] = await Promise.all([p.waitForEvent('download'), files.locator('button.lv-file-primary').click()]);
    const path = info.outputPath(name + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull();
    await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false');
    await menu.locator(':scope > summary').click(); return path;
  };
  try {
    await p.goto(server.url); await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: '閲覧するモデル.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await p.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill('閲覧と編集'); await p.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    await expect(p.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    const gizmo = p.locator('.lv-project-camera'), axes = gizmo.locator('.lv-camera-axes'), z = gizmo.getByRole('button', { name: 'Z', exact: true });
    await expect(axes).toHaveText('XYZ'); await expect(gizmo.getByRole('button', { name: '全体表示', exact: true })).toHaveText(''); await expect(gizmo.locator('summary')).toHaveCount(0);
    expect(await gizmo.evaluate(n => ({ background: getComputedStyle(n).backgroundColor, border: getComputedStyle(n).borderTopWidth, shadow: getComputedStyle(n).boxShadow }))).toEqual({ background: 'rgba(0, 0, 0, 0)', border: '0px', shadow: 'none' });
    for (const name of ['X', '−X', 'Y', '−Y', 'Z', '−Z']) {
      const axis = gizmo.getByRole('button', { name, exact: true }); await axis.press('Enter'); await expect(axis).toHaveAttribute('aria-pressed', 'true');
      expect(await axis.evaluate(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height, background: getComputedStyle(n).backgroundColor, border: getComputedStyle(n).borderTopWidth }))).toEqual({ width: 44, height: 44, background: 'rgba(0, 0, 0, 0)', border: '0px' });
    }
    await lookAlongFront(p); await axes.click({ position: { x: 56, y: 56 } }); await expect(gizmo.getByRole('button', { name: '−Z', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await axes.click({ position: { x: 56, y: 56 } }); await expect(z).toHaveAttribute('aria-pressed', 'true');
    const xBefore = await gizmo.getByRole('button', { name: 'X', exact: true }).getAttribute('style'), display = p.getByLabel('3Dモデルの表示', { exact: true }), box = (await display.boundingBox())!;
    await p.mouse.move(box.x + box.width * .45, box.y + box.height * .5); await p.mouse.down({ button: 'middle' }); await p.mouse.move(box.x + box.width * .6, box.y + box.height * .6, { steps: 12 }); await p.mouse.up({ button: 'middle' });
    await expect(z).toHaveAttribute('aria-pressed', 'false'); await expect(gizmo.getByRole('button', { name: 'X', exact: true })).not.toHaveAttribute('style', xBefore!);
    await gizmo.getByRole('button', { name: '全体表示', exact: true }).click(); await display.click({ position: { x: 20, y: 120 } }); await p.mouse.move(0, 0); await p.keyboard.press('Escape');
    expect(await gizmo.boundingBox()).toMatchObject({ width: 112, height: 222 });
    await gizmo.screenshot({ path: info.outputPath('gizmo-light.png') }); await p.screenshot({ path: info.outputPath('gizmo-workspace.png'), fullPage: false });
    await lookAlongFront(p); await expect(z).toHaveAttribute('aria-pressed', 'true');
    const overlap = await axes.evaluate(node => {
      const rect = node.getBoundingClientRect(), buttons = [...node.querySelectorAll('button')];
      const tips = buttons.map(button => ({ button, x: parseFloat(button.style.left) + 22, y: parseFloat(button.style.top) + 22, depth: +button.style.zIndex }));
      for (let y = 1; y < rect.height - 1; y++) for (let x = 1; x < rect.width - 1; x++) {
        const ranked = tips.map(t => ({ ...t, distance: Math.hypot(t.x - x, t.y - y) })).sort((a, b) => a.distance - b.distance || b.depth - a.depth);
        const nearest = ranked[0]!;
        if (nearest.distance > 20 || ranked[1]!.distance - nearest.distance < 2) continue;
        const native = document.elementFromPoint(rect.x + x, rect.y + y)?.closest('button');
        if (native && buttons.includes(native) && native !== nearest.button) return { x, y, name: nearest.button.getAttribute('aria-label')!, help: nearest.button.getAttribute('aria-describedby')! };
      }
      return null;
    });
    expect(overlap).not.toBeNull();
    const axisBox = (await axes.boundingBox())!; await p.mouse.move(axisBox.x + overlap!.x, axisBox.y + overlap!.y);
    const hovered = gizmo.getByRole('button', { name: overlap!.name, exact: true }); await expect(hovered).toHaveAttribute('data-hovered', 'true');
    await expect(p.locator('#' + overlap!.help)).toBeVisible();
    await axes.click({ position: { x: overlap!.x, y: overlap!.y } }); await expect(hovered).toBeFocused(); await expect(hovered).toHaveAttribute('aria-pressed', 'true'); await expect(p.getByRole('tooltip')).toBeHidden();
    await lookAlongFront(p);
    await revealCoordinateAdd(p); const owner = p.getByLabel('追加先モデル', { exact: true }); await owner.focus(); await owner.selectOption({ label: '閲覧するモデル.glb' }); await p.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const axis of ['X', 'Y', 'Z']) await p.getByLabel('位置 ' + axis, { exact: true }).fill(axis === 'Y' ? '.5' : '0');
    await p.getByRole('button', { name: '位置を確定', exact: true }).click(); await ready('ピンの位置を確定しました。');
    await detail.getByLabel('タイトル', { exact: true }).fill('現地の写真'); await detail.getByLabel('本文', { exact: true }).fill('確認する本文\n二行目');
    await detail.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready('変更を適用しました。');
    const pick = p.waitForEvent('filechooser'); await p.getByLabel('メディアを追加', { exact: true }).click(); await (await pick).setFiles({ name: '現地.png', mimeType: 'image/png', buffer: smallPng() }); await p.getByRole('region',{name:'キャプションの詳細',exact:true}).getByRole('button',{name:'変更を適用',exact:true}).click(); await ready('メディアを追加しました。');
    await revealCameraPositions(p); const author = p.getByRole('region', { name: '視点の作成と管理', exact: true });
    await p.getByRole('button',{name:'開始視点を記録',exact:true}).click();await ready('開始視点を記録しました。');
    await revealWorkPanel(p); await tab('キャプション').click(); await save('before-view');
    const help=p.locator('details[aria-label="ヘルプ"]'),settings=p.locator('details[aria-label="設定"]');
    await menu.locator(':scope > summary').click();await help.locator(':scope > summary').click();await expect(menu).not.toHaveAttribute('open');
    await settings.locator(':scope > summary').click();await expect(help).not.toHaveAttribute('open');
    await settings.getByLabel('このブラウザの表示名',{exact:true}).fill('保持する入力');await help.locator(':scope > summary').click();
    await expect(settings).not.toHaveAttribute('open');await help.locator(':scope > summary').click();await revealWorkPanel(p); await tab('モデル').click();await p.getByRole('button',{name:'編集に戻る',exact:true}).click();
    await expect(settings).toBeFocused();await expect(tab('モデル')).toHaveAttribute('aria-selected','true');
    await expect(settings.getByLabel('このブラウザの表示名',{exact:true})).toHaveValue('保持する入力');
    await settings.getByRole('button',{name:'表示名の入力を取り消す',exact:true}).click();await settings.locator(':scope > summary').click();
    await revealWorkPanel(p); await tab('キャプション').click();
    for(const intent of ['受信','復元'] as const){
      await revealFileSurface(p,intent);
      await expect(menu.getByRole('region',{name:'ファイル',exact:true})).toBeHidden();
      await menu.getByRole('button',{name:'閉じる',exact:true}).click();await expect(menu.locator(':scope > summary')).toBeFocused();
    }
    await p.getByRole('button', { name: '閲覧する', exact: true }).click(); await expect(p.getByRole('button', { name: '編集する', exact: true })).toBeEnabled();
    await expect(p.locator('[data-lv-edit-only]:visible')).toHaveCount(0);
    await expect(detail.getByRole('textbox')).toHaveCount(0); await expect(detail.getByRole('button', { name: '変更を適用', exact: true })).toHaveCount(0);
    await expect(detail.locator('[data-caption-field="title"] p')).toHaveText('現地の写真'); await expect(detail.locator('[data-caption-field="body"] p')).toHaveText('確認する本文\n二行目');
    await expect(p.getByLabel('メディアを追加', { exact: true })).toBeHidden(); await expect(p.getByRole('region', { name: 'ピンの操作', exact: true })).toHaveCount(0);
    await expect(p.getByRole('region',{name:'キャプション',exact:true})).toBeVisible();
    const captions = p.getByRole('region', { name: 'キャプション', exact: true }); await captions.locator('.lv-caption-search').getByLabel('検索', { exact: true }).fill('現地'); await expect(p.locator('.lv-caption-select')).toHaveCount(1);
    await p.locator('.lv-caption-select').click(); await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: '窓を残す', exact: true }).click(); await expect(p.locator('.lv-caption-window')).toBeVisible();
    await expect(p.getByRole('region', { name: 'メディア', exact: true }).locator('img').first()).toBeVisible();
    if (await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
    await p.screenshot({ path: info.outputPath('view-caption.png'), fullPage: false });
    await revealWorkPanel(p); await tab('モデル').click(); const models = p.getByRole('tabpanel', { name: 'モデル', exact: true }); await models.locator('.lv-model-select').click();
    await expect(models.getByRole('checkbox', { name: 'このシーンに表示', exact: true })).toHaveCount(0);
    await models.getByRole('button', { name: '隠す', exact: true }).click(); await models.getByRole('button', { name: '表示', exact: true }).click();
    await revealCameraPositions(p); await expect(author).toHaveCount(0);
    const views = p.getByRole('region', { name: '視点の作業', exact: true }); await gizmo.getByLabel('投影方式', { exact: true }).selectOption('orthographic'); await expect(views.getByLabel('記録した視点',{exact:true})).toHaveCount(0);await expect(views.getByRole('button',{name:'開始視点を更新',exact:true})).toHaveCount(0);
    await views.getByLabel('背景色', { exact: true }).fill('#334455'); await views.getByRole('button', { name: '背景に適用', exact: true }).click();
    await gizmo.screenshot({ path: info.outputPath('gizmo-dark.png') });
    await revealWorkPanel(p); await tab('描画').click(); const material = p.getByRole('region', { name: '材質', exact: true }); await material.getByLabel('モデル', { exact: true }).selectOption({ label: '閲覧するモデル.glb' });
    const surface = material.getByLabel('マテリアル', { exact: true }), first = await surface.locator('option').evaluateAll(ns => ns.map(n => (n as HTMLOptionElement).value).find(Boolean)); expect(first).toBeTruthy(); await surface.selectOption(first!);
    await expect(material.getByRole('button', { name: '設定を編集', exact: true })).toHaveCount(0); await expect(material.locator('.lv-material-values')).toBeVisible();
    await expect(p.locator('[data-lv-edit-only]:visible')).toHaveCount(0); await p.screenshot({ path: info.outputPath('view-material.png'), fullPage: false });
    if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
    await expect(files.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
    await info.attach('view-files', { body: await menu.innerText(), contentType: 'text/plain' });
    await expect(p.getByRole('button', { name: '更新を受け取る', exact: true })).toHaveCount(0);
    await files.getByText('作成したファイル', { exact: true }).click(); const [existing] = await Promise.all([p.waitForEvent('download'), files.getByRole('button', { name: 'ダウンロード', exact: true }).click()]); expect(await existing.failure()).toBeNull(); await menu.locator(':scope > summary').click();
    await revealWorkPanel(p); await tab('キャプション').click(); await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: info.outputPath('view-narrow.png'), fullPage: false });
    await p.getByRole('button',{name:'3D',exact:true}).click(); await expect(p.getByLabel('3Dモデルの表示',{exact:true})).toBeVisible();if(await p.locator('.lv-camera-sheet-header').getByRole('button',{name:'閉じる',exact:true}).isVisible())await p.locator('.lv-camera-sheet-header').getByRole('button',{name:'閉じる',exact:true}).click();
    const compass=p.locator('.lv-project-camera');await compass.getByRole('button',{name:'Y',exact:true}).press('Enter');await expect(compass.getByRole('button',{name:'Y',exact:true})).toHaveAttribute('aria-pressed','true');await p.getByRole('button',{name:'3D',exact:true}).focus();
    await expect(p.getByRole('tooltip')).toBeHidden();
    await expect(p.locator('.lv-caption-window').getByRole('button',{name:'閉じる',exact:true})).toBeInViewport();
    await p.screenshot({path:info.outputPath('narrow-stage.png'),fullPage:false});
    await p.locator('.lv-caption-window').getByRole('button',{name:'閉じる',exact:true}).click();await expect(p.locator('.lv-caption-window')).toHaveCount(0);
    await p.getByRole('button',{name:'作業パネル',exact:true}).click();await expect(detail).toBeVisible();await detail.getByRole('button',{name:'窓を残す',exact:true}).click();await p.setViewportSize({ width: 1440, height: 1000 });
    await p.getByRole('button', { name: '編集する', exact: true }).click(); await expect(p.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled();
    await expect(p.getByRole('list',{name:'キャプション一覧',exact:true})).toBeVisible();await expect(captions.locator('.lv-caption-search').getByLabel('検索', { exact: true })).toHaveValue('現地');await p.locator('.lv-caption-select').click(); await expect(detail.getByLabel('本文', { exact: true })).toHaveValue('確認する本文\n二行目');
    await detail.getByLabel('本文', { exact: true }).fill('閲覧から戻って編集'); await expect(p.getByRole('button', { name: '閲覧する', exact: true })).toBeDisabled();
    await detail.getByLabel('本文',{exact:true}).dispatchEvent('compositionstart',{data:'編集中'});
    await expect(z).toBeDisabled();
    await expect(tab('モデル')).toBeDisabled();await expect(p.locator('.lv-compact-navigation button').first()).toBeDisabled();
    await detail.getByLabel('本文',{exact:true}).dispatchEvent('compositionend',{data:'編集中'});
    await revealWorkPanel(p); await tab('モデル').click(); await expect(p.getByText('キャプションに未適用の変更があります。',{exact:true})).toBeVisible();
    await p.getByRole('button',{name:'編集に戻る',exact:true}).click(); await expect(detail.getByLabel('本文',{exact:true})).toHaveValue('閲覧から戻って編集');
    await expect(detail.getByRole('heading',{name:'現地の写真',exact:true})).toBeFocused();
    await p.setViewportSize({width:1280,height:600});
    await info.attach('short-edit-layout',{body:JSON.stringify(await p.evaluate(()=>{
      const selectors=['.lv-caption-task','.lv-caption-browser','.lv-caption-reading','.lv-caption-detail','.lv-caption-content','[data-caption-completion]'];
      return{viewport:{width:innerWidth,height:innerHeight},active:{tag:document.activeElement?.tagName,className:document.activeElement?.className},nodes:selectors.map(selector=>{const n=document.querySelector(selector)!,r=n.getBoundingClientRect(),s=getComputedStyle(n);return{selector,rect:{x:r.x,y:r.y,width:r.width,height:r.height},scrollTop:n.scrollTop,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,overflow:s.overflow,rows:s.gridTemplateRows};})};
    })),contentType:'application/json'});
    await expect(detail.getByRole('button',{name:'変更を適用',exact:true})).toBeInViewport().catch(async error=>{await p.screenshot({path:info.outputPath('short-edit-failure.png')});throw error;});
    for(const name of ['変更を適用','取り消す'])await expect(detail.locator('[data-caption-completion]').getByRole('button',{name,exact:true})).toBeInViewport({ratio:1});
    const completionHits=await detail.locator('[data-caption-completion] > button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{text:n.textContent,width:r.width,height:r.height,hit:hit===n||!!hit&&n.contains(hit)};}));
    await info.attach('short-edit-completion-hits',{body:JSON.stringify(completionHits),contentType:'application/json'});expect(completionHits.every(n=>n.hit&&n.width>=44&&n.height>=44)).toBe(true);
    await p.screenshot({path:info.outputPath('edit-short.png'),fullPage:false});await p.setViewportSize({width:1440,height:1000});
    await expect(p.getByRole('list',{name:'キャプション一覧',exact:true})).toBeVisible(); await expect(captions.locator('.lv-caption-search').getByLabel('検索',{exact:true})).toHaveValue('現地');
    await expect(detail.getByLabel('本文',{exact:true})).toHaveValue('閲覧から戻って編集');
    await detail.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready('変更を適用しました。'); const path = await save('after-view');
    const archive = await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]), validationMetadataLimits), inspected = await inspectProjectCandidates(archive.source.read(), validationMetadataLimits);
    if (inspected.kind !== 'project-candidate-inspection') throw Error('Saved metadata'); expect(Object.values((inspected.unambiguousRecords as any).captionsById)).toEqual([expect.objectContaining({ title: '現地の写真', body: '閲覧から戻って編集' })]);
    await p.reload(); await expect(p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('閲覧と編集', { timeout: 90_000 }); await p.locator('.lv-caption-select').filter({ hasText: '現地の写真' }).click(); await expect(detail.getByLabel('本文', { exact: true })).toHaveValue('閲覧から戻って編集');
    expect(errors).toEqual([]); expect(remote).toEqual([]); await info.attach('view-mode-environment', { body: JSON.stringify({ artifact: 'offline-desktop-dist', browser: browser.version(), serviceWorkers: 'blocked', physicalDevice: false }), contentType: 'application/json' });
  } finally { await context.close(); await browser.close(); await server.stop(); }
});

test('one PC app keeps the same Project through connected, cold offline and preparation removal starts', async ({}, info) => {
  test.setTimeout(180_000);
  const server = await ownedServer('offline-desktop-dist'), errors: string[] = [], diagnostics: string[] = [];

  const profile = await createBrowserProfile('wu');
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  const open = async (disconnected = false) => {
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow', offline: disconnected, acceptDownloads: true });
    context.on('console', m => { if (m.type() === 'error') diagnostics.push(m.text()); });
    context.on('requestfailed', r => diagnostics.push(`${r.url()}: ${r.failure()?.errorText}`));
    await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === new URL(server.url).origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort(); });
    const page = context.pages()[0] ?? await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto(server.url); expect(response?.fromServiceWorker()).toBe(disconnected); return page;
  };
  const inspect = async (path: string) => {
    const archive = await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]), validationMetadataLimits);
    const bodies: [string, string][] = [];
    for (const blob of archive.archive.control.manifest.blobs) bodies.push([blob.sha256, Buffer.from(await archive.archive.entryBytes(blob.path, blob.byteLength)).toString('hex')]);
    return { identity: archive.source.proof.identity, changes: archive.source.originalChanges().map(bytes => Buffer.from(bytes).toString('hex')), bodies };
  };
  try {
    let p = await open(); await expect(p.getByLabel('ファイルを選択', { exact: true })).toBeVisible();
    const offlineNode = await p.locator('.lv-offline-controls').elementHandle();
    await expect(p.locator('.lv-home-settings')).not.toHaveAttribute('open'); await expect(p.locator('.lv-offline-controls')).toBeHidden();
    await expect(p.getByLabel('ファイルを選択', { exact: true })).toBeVisible();
    await p.screenshot({ path: info.outputPath('one-entry-home.png'), fullPage: false });
    await p.setViewportSize({ width: 390, height: 844 }); await revealOfflineUtilities(p);
    await expect(p.locator('.lv-offline-controls').getByRole('status')).toContainText('アプリを保存しました。',{timeout:90_000});
    await p.screenshot({ path: info.outputPath('home-settings-narrow.png'), fullPage: false });
    await p.locator('.lv-home-settings > summary').press('Escape'); await expect(p.locator('.lv-home-settings')).not.toHaveAttribute('open');
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.evaluate(async () => { await navigator.serviceWorker.register('/foreign/worker.js', { scope: '/foreign/' }); await (await caches.open('foreign-retain')).put('/sentinel', new Response('unchanged')); });
    await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: '再開するモデル.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await p.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill('オフライン配置'); await p.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    const selected = async () => { await expect(p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('オフライン配置', { timeout: 90_000 }); await expect(p.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 }); };
    await selected(); await expect(p.locator('.lv-home-settings')).toHaveCount(0); await expect(p.locator('.lv-offline-controls')).toHaveCount(1);
    await expect(p.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled();
    await revealCoordinateAdd(p); const owner = p.getByLabel('追加先モデル', { exact: true }); await owner.focus(); await owner.selectOption({ label: '再開するモデル.glb' }); await p.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    const pin = p.getByRole('region', { name: '位置の調整', exact: true }); for (const axis of ['X', 'Y', 'Z']) await pin.getByLabel('位置 ' + axis, { exact: true }).fill(axis === 'Y' ? '.5' : '0'); await pin.getByRole('button', { name: '位置を確定', exact: true }).click();
    const detail = () => p.getByRole('region', { name: 'キャプションの詳細', exact: true });
    await detail().getByLabel('タイトル', { exact: true }).fill('同じ記録'); await detail().getByLabel('本文', { exact: true }).fill('接続中に記録した本文'); await detail().getByRole('button', { name: '変更を適用', exact: true }).click();
    await expect(p.getByText('変更を適用しました。', { exact: true })).toBeVisible();
    const chooser = p.waitForEvent('filechooser'); await p.getByLabel('メディアを追加', { exact: true }).click(); await (await chooser).setFiles({ name: '現場.png', mimeType: 'image/png', buffer: smallPng() }); await p.getByRole('region',{name:'キャプションの詳細',exact:true}).getByRole('button',{name:'変更を適用',exact:true}).click(); await expect(p.getByText('メディアを追加しました。', { exact: true })).toBeVisible();
    const save = async (name: string) => {
      await p.locator('.lv-workspace-actions').getByRole('button', {name:'ファイルに保存',exact:true}).click(); const files = p.getByRole('region', { name: 'ファイル', exact: true }); await files.getByLabel('名前（任意）', { exact: true }).fill(name);
      const [download] = await Promise.all([p.waitForEvent('download'), files.locator('.lv-file-primary').click()]); const path = info.outputPath(name + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull();
      await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false'); await p.locator('details.lv-project-files').getByRole('button', { name: '閉じる', exact: true }).click(); return inspect(path);
    };
    const connected = await save('before-preparation'); await revealOfflineUtilities(p);
    expect(await p.locator('.lv-offline-controls').evaluate((node, original) => node === original, offlineNode)).toBe(true);
    const offline = () => p.locator('.lv-offline-controls'); await expect.poll(()=>p.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.active),{timeout:90_000}).toBe(true);await expect(offline().getByRole('status')).toContainText('アプリを保存しました。');await expect(offline().getByText('アプリの更新・修復',{exact:true})).toBeVisible();expect(await p.evaluate(()=>navigator.serviceWorker.controller)).toBeNull();
    await p.screenshot({ path: info.outputPath('workspace-settings.png'), fullPage: false });
    await context!.close(); context = undefined; await server.stop(); p = await open(true); await selected();
    await p.locator('.lv-caption-select').filter({ hasText: '同じ記録' }).click(); await expect(detail().getByLabel('本文', { exact: true })).toHaveValue('接続中に記録した本文');
    await detail().getByLabel('本文', { exact: true }).fill('通信なしで追記した本文'); await detail().getByRole('button', { name: '変更を適用', exact: true }).click(); await expect(p.getByText('変更を適用しました。', { exact: true })).toBeVisible();
    const saved = await save('offline-edit'); expect(saved.identity).toEqual(connected.identity); expect(saved.changes).toEqual(expect.arrayContaining(connected.changes)); expect(saved.bodies).toEqual(connected.bodies);
    await revealOfflineUtilities(p); await expect(offline().getByRole('status')).toBeHidden();
    await context!.setOffline(false); await server.start(); const cacheNames = await p.evaluate(() => caches.keys());
    await offline().getByText('アプリの更新・修復', { exact: true }).click(); await offline().getByRole('button', { name: 'オフライン準備を解除', exact: true }).click(); await expect(offline().getByText(/解除すると、すべての画面を閉じた後/)).toBeVisible();
    await offline().getByRole('button', { name: '準備を解除', exact: true }).click(); await expect(offline().getByRole('status')).toContainText('通信できる状態で同じアプリ');
    expect(await p.evaluate(() => caches.keys())).toEqual(cacheNames); expect(await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => new URL(r.scope).pathname))).toEqual(['/foreign/']);
    await context!.close(); context = undefined; p = await open(); await selected();
    await expect.poll(()=>p.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration('/'))?.active),{timeout:90_000}).toBe(true);expect(await p.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    await p.locator('.lv-caption-select').filter({ hasText: '同じ記録' }).click(); await expect(detail().getByLabel('本文', { exact: true })).toHaveValue('通信なしで追記した本文'); expect(await save('after-removal')).toEqual(saved);
    await revealProjectSelection(p); await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await expect(p.locator('.lv-home-settings')).not.toHaveAttribute('open');
    await revealOfflineUtilities(p); await expect(offline().getByRole('status')).toContainText('アプリを保存しました。');await expect(offline().getByText('アプリの更新・修復',{exact:true})).toBeVisible();
    expect(await p.evaluate(async () => (await (await caches.open('foreign-retain')).match('/sentinel'))?.text())).toBe('unchanged');
    await p.screenshot({ path: info.outputPath('same-home-after-removal.png'), fullPage: false }); expect(errors).toEqual([]);
    await info.attach('unified-startup-environment', { body: JSON.stringify({ artifact: 'offline-desktop-dist', sameArtifactAndOrigin: true, browser: context!.browser()?.version(), coldNavigationFromServiceWorker: true, serverStopped: true, connectedRestartAutomaticallyPrepared: true, physicalDevice: false }), contentType: 'application/json' });
  } finally { await info.attach('offline-utility-diagnostics', { body: JSON.stringify({ profile, diagnostics }), contentType: 'application/json' }); await context?.close(); await server.stop(); }
});
