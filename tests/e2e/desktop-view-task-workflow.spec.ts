import { revealCameraPositions, revealWorkPanel, revealFileSurface } from './workspaceUi';
import { test, expect, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as A from '@automerge/automerge';
import { triangleGlb } from './fixtures';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits as limits } from '../../src/projectFiles/validation';
import { ownedServer } from '../offline-e2e/server';

const tab = (p: Page, name: string) => p.getByRole('tab', { name, exact: true });
const views = (p: Page) => p.getByRole('region', { name: '視点の作業', exact: true });
const author = (p: Page) => p.getByRole('region', { name: '視点の作成と管理', exact: true });
const materials = (p: Page) => p.getByRole('region', { name: '材質', exact: true });
async function ready(p: Page, text: string) {
  await expect(p.getByText(text, { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(p.locator('main.lv-project-workspace > header > p.lv-operation-status')).toHaveAttribute('data-busy', 'false');
}
async function localOnly(context: BrowserContext, remote: string[],origin:string) {
  await context.route('**/*', route => {
    const u = new URL(route.request().url()); if (u.origin === origin || ['blob:', 'data:'].includes(u.protocol)) return route.continue();
    remote.push(u.origin); return route.abort('blockedbyclient');
  });
}
async function tabsVisible(p: Page) {
  for (const name of ['キャプション', 'モデル', '描画']) {
    const control = tab(p, name); await expect(control).toBeInViewport();
    const box = await control.boundingBox(); expect(box).not.toBeNull(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    const lines = await control.evaluate(n => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()].filter(b => b.width > 0 && b.height > 0).length; }); expect(lines).toBe(1);
    const size = p.viewportSize()!; expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
  }
}
async function scrollTask(p: Page) {
  await p.locator('.lv-material-content:visible,.lv-caption-content:visible,.lv-camera-position-content:visible').evaluateAll(nodes=>nodes.forEach(n=>{n.scrollTop=n.scrollHeight;})); await tabsVisible(p);
  const stage = await p.locator('.lv-project-stage').boundingBox(); expect(stage!.y).toBeGreaterThanOrEqual(0); expect(stage!.y + stage!.height).toBeLessThanOrEqual(p.viewportSize()!.height + 1);
}
async function save(p: Page, info: TestInfo, name: string) {
  const menu = p.locator('details.lv-project-files'); if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
  const area = p.getByRole('region', { name: 'ファイル', exact: true }); if(!await revealFileSurface(p,'共有')) await area.getByRole('button', { name: '相手に渡す', exact: true }).click(); await area.getByLabel('渡す内容', { exact: true }).selectOption('teamWorkspace');
  const [download] = await Promise.all([p.waitForEvent('download', { timeout: 90_000 }), area.locator('button.lv-file-primary').click()]);
  const path = info.outputPath(name + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 90_000 }); return path;
}
async function inspect(path: string) {
  const archive = await WorkspaceArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]), limits), result = await inspectProjectCandidates(archive.source.read(), limits);
  if (result.kind !== 'project-candidate-inspection') throw Error('metadata'); return { archive, records: result.unambiguousRecords as Record<string, any> };
}
async function chooseMaterial(p: Page) {
  await revealWorkPanel(p);await tab(p, '描画').click(); const panel = materials(p);
  await panel.getByRole('combobox', { name: 'モデル', exact: true }).selectOption({ label: '作業するモデル.glb' });
  const face = panel.getByRole('combobox', { name: 'マテリアル', exact: true }), value = await face.locator('option').evaluateAll(ns => ns.map(n => (n as HTMLOptionElement).value).find(Boolean));
  expect(value).toBeTruthy(); await face.selectOption(value!); return panel;
}

test('PC task navigation retains model, View and material drafts through keyboard switching and saved-file reopening', async ({ page, context, browser }, info) => {
  test.setTimeout(420_000); page.setDefaultTimeout(15_000); A.getHeads(A.init()); await page.setViewportSize({ width: 1280, height: 800 });
  const server=await ownedServer('offline-desktop-dist'),origin=new URL(server.url).origin;
  const errors: string[] = [], remote: string[] = []; await localOnly(context, remote,origin); page.on('pageerror', error => errors.push(error.message));
  const peer = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true }); await localOnly(peer, remote,origin);
  try {
    await page.goto(server.url); await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: '作業するモデル.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await page.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill('視点と材質の整理'); await page.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('視点と材質の整理', { timeout: 90_000 }); await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(() => { (window as any).__taskCanvas = document.querySelector('.lv-project-stage canvas'); });
    await tab(page, 'モデル').click(); const modelPanel = page.getByRole('tabpanel', { name: 'モデル', exact: true }); await modelPanel.locator('.lv-model-select').filter({ hasText: '作業するモデル.glb' }).click();
    await modelPanel.getByRole('button', { name: '配置を調整', exact: true }).click(); await modelPanel.getByLabel('モデル位置 X', { exact: true }).fill('2.5'); await scrollTask(page);
    await tab(page, 'モデル').focus(); await page.keyboard.press('ArrowRight'); await expect(tab(page, '描画')).toHaveAttribute('aria-selected', 'true'); await revealCameraPositions(page);await expect(views(page).getByRole('button', { name: /開始視点を(?:記録|更新)/, exact: true })).toBeDisabled();await page.locator('.lv-camera-positions > summary').click();await tab(page,'描画').focus();
    await page.keyboard.press('ArrowLeft'); await expect(modelPanel.getByLabel('モデル位置 X', { exact: true })).toHaveValue('2.5'); await modelPanel.getByRole('button', { name: '配置を取り消す', exact: true }).click();
    await modelPanel.getByRole('button', { name: '配置を調整', exact: true }).click(); await modelPanel.getByLabel('モデル位置 X', { exact: true }).fill('1'); await modelPanel.getByLabel('モデル倍率', { exact: true }).fill('1.25'); await modelPanel.getByRole('button', { name: '配置を確定', exact: true }).click(); await ready(page, 'モデルの配置を確定しました。');
    await revealCameraPositions(page);
    await views(page).getByRole('button',{name:'開始視点を記録',exact:true}).click();await ready(page,'開始視点を記録しました。');
    await page.locator('.lv-project-camera').getByLabel('投影方式',{exact:true}).selectOption('orthographic');await views(page).getByRole('button',{name:'開始視点を更新',exact:true}).click();await ready(page,'開始視点を記録しました。');
    const background=views(page).getByLabel('背景色',{exact:true});await background.fill('#334455');await scrollTask(page);
    await page.locator('.lv-camera-positions > summary').click();await revealWorkPanel(page);await tab(page,'描画').click();await expect(page.locator('.lv-retained-edit')).toContainText('カメラ位置');await page.locator('.lv-retained-edit').getByRole('button',{name:'編集に戻る',exact:true}).click();await expect(background).toHaveValue('#334455');await views(page).getByRole('button',{name:'背景に適用',exact:true}).click();
    const material = await chooseMaterial(page); await expect(material.getByRole('button', { name: '設定を編集', exact: true })).toBeHidden(); await material.getByLabel('照明', { exact: true }).selectOption('unlit'); await material.getByLabel('透過の表示方法', { exact: true }).selectOption('mask');
    await material.getByLabel('不透明度（%）', { exact: true }).fill('65'); await material.getByLabel('切り抜きのしきい値', { exact: true }).fill('0.4'); await scrollTask(page);
    await material.getByLabel('不透明度（%）', { exact: true }).focus();
    for (const key of ['', 'Tab']) {
      if (key) await page.keyboard.press(key);
      const bounds = await material.evaluate(panel => { const focused = document.activeElement!, active = focused.getBoundingClientRect(), strip = document.querySelector('.lv-project-body > aside > [role="tablist"]')!.getBoundingClientRect(); return { inside: panel.contains(focused), top: active.top, bottom: active.bottom, stripBottom: strip.bottom, paneBottom: panel.closest('aside')!.getBoundingClientRect().bottom }; });
      expect(bounds.inside).toBe(true); expect(bounds.top).toBeGreaterThanOrEqual(bounds.stripBottom); expect(bounds.bottom).toBeLessThanOrEqual(bounds.paneBottom);
    }
    await scrollTask(page);
    await tab(page,'描画').focus();await page.keyboard.press('ArrowLeft');await expect(tab(page,'モデル')).toHaveAttribute('aria-selected','true');await revealCameraPositions(page);await expect(views(page).getByRole('button',{name:/開始視点を(?:記録|更新)/,exact:true})).toBeDisabled();await page.locator('.lv-camera-positions > summary').click();await tab(page,'モデル').focus();await page.keyboard.press('ArrowRight');
    await expect(material.getByLabel('不透明度（%）', { exact: true })).toHaveValue('65'); await expect(material.getByLabel('切り抜きのしきい値', { exact: true })).toHaveValue('0.4'); await expect(material.getByLabel('照明', { exact: true })).toHaveValue('unlit');
    await material.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready(page, '材質の設定を適用しました。'); await scrollTask(page);
    expect(await page.evaluate(() => (window as any).__taskCanvas === document.querySelector('.lv-project-stage canvas'))).toBe(true); await page.screenshot({ path: info.outputPath('sticky-material-task.png'), fullPage: true });
    const file = await save(page, info, '視点と材質'), saved = await inspect(file), savedViews = Object.values(saved.records.viewsById) as any[];
    expect(savedViews).toHaveLength(2);expect(savedViews.map(v=>v.camera.projection.kind).sort()).toEqual(['orthographic','perspective']);const entry=(Object.values(saved.records.scenesById) as any[])[0]!.defaultViewId;expect(saved.records.viewsById[entry].camera.projection.kind).toBe('orthographic');
    const storedMaterials = Object.values(saved.records.materialOverridesById) as any[]; expect(storedMaterials).toHaveLength(1); expect(storedMaterials[0]).toMatchObject({ appearance: { lighting: 'unlit', opacity: 0.65 }, compositing: { coverage: { policy: 'mask', alphaCutoff: 0.4 } } });
    const b = await peer.newPage(); b.setDefaultTimeout(15_000); b.on('pageerror', error => errors.push(error.message)); await b.goto(server.url); await b.getByLabel('ファイルを選択', { exact: true }).setInputFiles(file); await b.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await expect(b.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('視点と材質の整理', { timeout: 90_000 }); await expect(b.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false'); await tabsVisible(b);
    await tab(b, 'モデル').click(); const peerModel = b.getByRole('tabpanel', { name: 'モデル', exact: true }); await peerModel.locator('.lv-model-select').filter({ hasText: '作業するモデル.glb' }).click(); await peerModel.getByRole('button', { name: '配置を調整', exact: true }).click();
    await expect(peerModel.getByLabel('モデル位置 X', { exact: true })).toHaveValue('1'); await expect(peerModel.getByLabel('モデル倍率', { exact: true })).toHaveValue('1.25'); await peerModel.getByRole('button', { name: '配置を取り消す', exact: true }).click();
    await revealCameraPositions(b);await expect(views(b).getByRole('button',{name:'開始視点を更新',exact:true})).toBeEnabled();await expect(views(b).getByLabel('記録した視点',{exact:true})).toHaveCount(0);await expect(b.locator('.lv-project-camera').getByLabel('投影方式',{exact:true})).toHaveValue('orthographic');
    const peerFile = await save(b, info, '開き直した作業'), reopened = await inspect(peerFile); expect(reopened.archive.source.originalChanges()).toEqual(saved.archive.source.originalChanges());
    await page.reload(); await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('視点と材質の整理', { timeout: 90_000 }); await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false');
    await page.setViewportSize({ width: 320, height: 740 }); const enlarged = await page.addStyleTag({ content: '.lv-project-workspace [role="tab"] { font-size: 32px; }' });
    const captionTab = tab(page, 'キャプション'), last = tab(page, '描画'); await captionTab.focus();
    const firstBox = await captionTab.boundingBox(); expect((await last.boundingBox())!.y).toBeGreaterThan(firstBox!.y); await page.evaluate(y => scrollTo(0, y + scrollY - innerHeight + 44), firstBox!.y);
    await page.keyboard.press('End'); await expect(last).toBeFocused(); const lastBox = await last.boundingBox(); expect(lastBox!.y).toBeGreaterThanOrEqual(0); expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(741);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await page.screenshot({ path: info.outputPath('wrapped-keyboard-tabs.png'), fullPage: true }); await enlarged.evaluate(n => (n as HTMLElement).remove());
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally { await peer.close();await server.stop(); }
});
