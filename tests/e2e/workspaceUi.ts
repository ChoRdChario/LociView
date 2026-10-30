import { expect, type Page } from '@playwright/test';

/** Select an exact signed direction using the gizmo's keyboard route. */
export async function lookAlongFront(page: Page) {
  const axis = page.locator('.lv-project-camera').getByRole('button', { name: 'Z', exact: true });
  await expect(axis).toBeEnabled();
  await axis.press('Enter');
  await expect(axis).toHaveAttribute('aria-pressed', 'true');
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

export async function revealOfflineUtilities(page: Page) {
  const offline = page.locator('.lv-offline-controls');
  if (await offline.isVisible()) return;
  const settings = page.locator('details[aria-label="設定"]');
  if (!await settings.evaluate(node => (node as HTMLDetailsElement).open)) await settings.locator(':scope > summary').click();
}
