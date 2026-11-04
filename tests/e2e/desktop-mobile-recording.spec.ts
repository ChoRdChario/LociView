import { chromium, expect, test } from '@playwright/test';
import { ownedServer } from '../offline-e2e/server';
import { nativeConversionBackup, smallPng, triangleGlb } from './fixtures';

test('phone record list, body and completion stay usable when the viewport shrinks', async ({}, info) => {
  const server = await ownedServer('offline-desktop-dist');
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const list = page.getByRole('list', { name: 'キャプション一覧', exact: true });
  const detail = page.getByRole('region', { name: 'キャプションの詳細', exact: true });
  const record = list.locator('.lv-caption-select').filter({ hasText: '既存のピン' });
  const body = detail.getByLabel('本文', { exact: true });
  const apply = detail.getByRole('button', { name: '変更を適用', exact: true });
  try {
    await page.goto(server.url);
    const source = await nativeConversionBackup(triangleGlb(), smallPng(), 100);
    await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'records.zip', mimeType: 'application/zip', buffer: source });
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).tap();
    await page.getByRole('button', { name: '新しいプロジェクトに変換', exact: true }).tap();
    await expect(page.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled({ timeout: 90_000 });
    await expect(list.locator('li')).toHaveCount(100);
    expect((await list.boundingBox())?.height).toBeGreaterThanOrEqual(88);
    await page.getByRole('searchbox', { name: '検索', exact: true }).fill('既存のピン');
    await record.tap();
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: '一覧へ戻る', exact: true }).tap();
    await expect(record).toBeFocused();
    await expect(record).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('searchbox', { name: '検索', exact: true })).toHaveValue('既存のピン');
    await record.tap();
    await body.tap();
    await body.fill('狭い画面から本文を編集');
    await page.setViewportSize({ width: 320, height: 365 });
    for (const control of [body, apply, detail.getByRole('button', { name: '取り消す', exact: true })]) {
      await expect.poll(() => control.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return target !== null && node.contains(target);
      })).toBe(true);
    }
    await page.screenshot({ path: info.outputPath('short-portrait-draft.png') });
    await apply.tap();
    await expect(page.getByText('変更を適用しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(body).toHaveValue('狭い画面から本文を編集');
  } finally {
    await context.close(); await browser.close(); await server.stop();
  }
});
