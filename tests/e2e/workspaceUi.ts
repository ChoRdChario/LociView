import { expect, type Page } from '@playwright/test';

/** Same pin-add intent; retained readers can still use their earlier wording. */
export async function revealCoordinateAdd(page:Page){
  const current=page.getByText('座標で追加',{exact:true}),summary=await current.count()?current:page.getByText('数値で配置',{exact:true});
  if(!await summary.locator('..').evaluate(n=>(n as HTMLDetailsElement).open))await summary.click();
}

export async function revealWorkPanel(page:Page){
  const panel=page.getByRole('button',{name:'作業パネル',exact:true});if(await panel.isVisible()&&await panel.getAttribute('aria-pressed')!=='true')await panel.click();
}

/** Uses the actual camera drawer; old fixed readers retain their tab. */
export async function revealCameraPositions(page:Page){
  const camera=page.locator('.lv-camera-positions');
  if(await camera.count()){
    const stage=page.getByRole('button',{name:'3D・比較',exact:true});if(await stage.isVisible()&&await stage.getAttribute('aria-pressed')!=='true')await stage.click();
    if(!await camera.evaluate(n=>(n as HTMLDetailsElement).open))await camera.locator(':scope > summary').click();
  }else await page.getByRole('tab',{name:'保存した視点',exact:true}).click();
}

/** Select an exact signed direction using the gizmo's keyboard route. */
export async function lookAlongFront(page: Page) {
  const axis = page.locator('.lv-project-camera').getByRole('button', { name: 'Z', exact: true });
  await expect(axis).toBeEnabled();
  await axis.press('Enter');
  await expect(axis).toHaveAttribute('aria-pressed', 'true');
}

export async function revealModelManagement(page: Page) {
  const details = page.locator('.lv-model-management');
  if (!await details.evaluate(node => (node as HTMLDetailsElement).open)) await details.locator(':scope > summary').click();
}

export async function beginSceneCreation(page: Page) {
  const details = page.locator('details[aria-label="シーンの管理"]');
  if (!await details.evaluate(node => (node as HTMLDetailsElement).open)) await details.locator(':scope > summary').click();
  await details.getByRole('button', { name: 'シーンを作る', exact: true }).click();
}

/** Navigate the visible product UI; never bypass draft/IME or file guards. */
export async function revealCaptionList(page: Page) {
  const panel = page.getByRole('button', { name: '作業パネル', exact: true });
  if (await panel.isVisible() && await panel.getAttribute('aria-pressed') !== 'true') await panel.click();
  const tab = page.getByRole('tab', { name: 'キャプション', exact: true });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  const back = page.getByRole('button', { name: '一覧へ戻る', exact: true });
  if (await back.isVisible()) await back.click();
}

export async function revealProjectHelp(page: Page) {
  const help = page.locator('details[aria-label="ヘルプ"]');
  if (!await help.evaluate(node => (node as HTMLDetailsElement).open)) await help.locator(':scope > summary').click();
}

/** Select only through the actual compact File navigation; legacy validation keeps its own controls. */
export async function revealFileSurface(page: Page, surface: '保存' | '共有' | '受信' | '復元') {
  const menu = page.locator('details.lv-project-files');
  if (!await menu.count()) return false;
  if (!await menu.evaluate(node => (node as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
  const tabs = menu.getByRole('tablist', { name: 'ファイルの操作', exact: true });
  if (!await tabs.count()) return false;
  const tab = tabs.getByRole('tab', { name: surface, exact: true });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  return true;
}

export async function revealProjectSelection(page: Page) {
  const menu = page.locator('details.lv-project-files');
  if (await menu.getByRole('button', { name: '別のプロジェクトを開く', exact: true, includeHidden: true }).count()) {
    if (!await menu.evaluate(node => (node as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
  } else await revealProjectHelp(page);
}

export async function revealOfflineUtilities(page: Page) {
  const offline = page.locator('.lv-offline-controls');
  await expect(offline).toHaveCount(1);
  if (await offline.isVisible()) return;
  const settings = page.locator('.lv-home-settings, details[aria-label="設定"]');
  if (!await settings.evaluate(node => (node as HTMLDetailsElement).open)) await settings.locator(':scope > summary').click();
}
