import { test, expect, chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as A from '@automerge/automerge';
import { triangleGlb } from './fixtures';
import { ownedServer } from '../offline-e2e/server';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';

test('delayed explanations stay readable and preserve a Caption draft through touch, keyboard and saved reopening', async ({}, info) => {
  test.setTimeout(180_000); A.getHeads(A.init());
  const artifact = process.env.LOCIVIEW_CONTEXT_HELP_ARTIFACT ?? 'desktop-dist';
  if (!['desktop-dist', 'offline-desktop-dist'].includes(artifact)) throw Error('Unsupported help-test artifact');
  const server = await ownedServer(artifact), errors: string[] = [], remote: string[] = [];
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(u.protocol)) return route.continue(); remote.push(u.href); return route.abort(); });
  const p = await context.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', e => errors.push(e.message));
  try {
    await p.goto(server.url); await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: '説明の確認.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await p.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill('補足説明の確認'); await p.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    await expect(p.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    await p.getByText('数値で配置', { exact: true }).click(); const owner = p.getByLabel('追加先モデル', { exact: true }); await owner.focus(); await owner.selectOption({ label: '説明の確認.glb' }); await p.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const axis of ['X', 'Y', 'Z']) await p.getByLabel('位置 ' + axis, { exact: true }).fill(axis === 'Y' ? '.5' : '0');
    await p.getByRole('button', { name: '位置を確定', exact: true }).click(); await expect(p.getByText('ピンの位置を確定しました。', { exact: true })).toBeVisible();
    const title = p.getByRole('region', { name: 'キャプションの詳細', exact: true }).getByLabel('タイトル', { exact: true }); await title.fill('説明を開いても入力を保持');
    const help = p.getByLabel('記録の編集操作', { exact: true }).getByRole('button', { name: '説明', exact: true });
    const tooltip = p.getByRole('tooltip'); await help.hover(); await p.waitForTimeout(700); await expect(tooltip).toHaveCount(0);
    await expect(tooltip).toBeVisible({ timeout: 4_000 }); await expect(tooltip).toContainText('別の更新がある場合は戻せません。');
    await tooltip.hover(); await p.waitForTimeout(300); await expect(tooltip).toBeVisible(); await p.keyboard.press('Escape'); await expect(tooltip).toHaveCount(0); await expect(title).toHaveValue('説明を開いても入力を保持');
    await p.getByText('数値で配置', { exact: true }).focus();
    for (let i = 0; i < 12 && !await help.evaluate(n => n === document.activeElement); i++) await p.keyboard.press('Tab');
    await expect(help).toBeFocused(); await expect(tooltip).toBeVisible(); await p.keyboard.press('Escape'); await expect(tooltip).toHaveCount(0);
    await help.tap(); await expect(tooltip).toBeVisible(); await p.screenshot({ path: info.outputPath('wide-context-help.png'), fullPage: true }); await help.tap(); await expect(tooltip).toHaveCount(0);
    await p.setViewportSize({ width: 320, height: 740 }); await help.tap(); await expect(tooltip).toBeVisible();
    const bounds = await tooltip.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
    await p.screenshot({ path: info.outputPath('narrow-context-help.png'), fullPage: true }); await p.keyboard.press('Escape'); await expect(title).toHaveValue('説明を開いても入力を保持');
    await p.setViewportSize({ width: 1440, height: 1000 }); const detail = p.getByRole('region', { name: 'キャプションの詳細', exact: true }); await detail.getByRole('button', { name: '変更を適用', exact: true }).click(); await expect(p.getByText('変更を適用しました。', { exact: true })).toBeVisible();
    const menu = p.locator('details.lv-project-files'); if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
    const files = p.getByRole('region', { name: 'ファイル', exact: true }); await files.getByRole('button', { name: '保存', exact: true }).click();
    const [download] = await Promise.all([p.waitForEvent('download'), files.locator('button.lv-file-primary').click()]); const saved = info.outputPath('help-backup.zip'); await download.saveAs(saved);
    const archive = await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(saved)).buffer]), validationMetadataLimits), inspected = await inspectProjectCandidates(archive.source.read(), validationMetadataLimits);
    expect(inspected.kind).toBe('project-candidate-inspection'); if (inspected.kind !== 'project-candidate-inspection') throw Error('Saved metadata');
    expect(Object.values((inspected.unambiguousRecords as any).captionsById)).toEqual([expect.objectContaining({ title: '説明を開いても入力を保持' })]);
    await p.reload(); await expect(p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('補足説明の確認', { timeout: 90_000 }); await p.locator('.lv-caption-select').filter({ hasText: '説明を開いても入力を保持' }).click(); await expect(title).toHaveValue('説明を開いても入力を保持');
    expect(errors).toEqual([]); expect(remote).toEqual([]); await info.attach('help-environment', { body: JSON.stringify({ artifact, browser: browser.version(), serviceWorkers: 'blocked', hasTouch: 'emulated', physicalDevice: false }), contentType: 'application/json' });
  } finally { await context.close(); await browser.close(); await server.stop(); }
});
