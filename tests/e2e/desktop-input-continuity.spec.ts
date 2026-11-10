import { test, expect, chromium, type Page } from '@playwright/test';
import { ownedServer } from '../offline-e2e/server';
import { triangleGlb, smallPng } from './fixtures';
import { revealCoordinateAdd, revealWorkPanel, revealCaptionList, beginMaterialEditing, revealFileSurface, closeFileSurface } from './workspaceUi';

for (const touch of [false, true]) test(`attachment ordering and Drawing completion retain the next input (${touch ? 'touch' : 'PC'})`, async ({}, info) => {
  test.setTimeout(180_000);
  const server = await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT ?? 'offline-desktop-dist'), browser = await chromium.launch({ channel: 'chromium', headless: true });
  const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: touch, serviceWorkers: 'block' });
  const page = await context.newPage(), errors: string[] = [], remote: string[] = []; let resumedPage: Page | undefined, resumePhase = 'daily', restoreStarted: number | undefined, restoreElapsed: number | undefined; page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => { const url = new URL(route.request().url());
    if (url.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue(); remote.push(url.origin); return route.abort(); });
  const ready = async (text: string) => { await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(page.locator('main.lv-project-workspace > header > .lv-operation-status')).toHaveAttribute('data-busy', 'false'); };
  const detail = page.getByRole('region', { name: 'キャプションの詳細', exact: true });
  try {
    await page.goto(server.url); await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'continuity.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await page.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill('操作の継続'); await page.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    const stage = page.getByRole('button', { name: '3D', exact: true });
    if (touch) { await expect(stage).toBeVisible(); if (await stage.getAttribute('aria-pressed') !== 'true') await stage.click(); }
    await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    await revealCaptionList(page); await revealCoordinateAdd(page); await page.getByLabel('追加先モデル', { exact: true }).focus();
    await page.getByLabel('追加先モデル', { exact: true }).selectOption({ label: 'continuity.glb' });
    await page.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const axis of ['X', 'Y', 'Z']) await page.getByRole('region', { name: '位置の調整', exact: true }).getByLabel(`位置 ${axis}`, { exact: true }).fill(axis === 'Y' ? '.5' : '0');
    await page.getByRole('button', { name: '位置を確定', exact: true }).click(); await ready('ピンの位置を確定しました。');
    await revealCaptionList(page); await page.locator('.lv-caption-select').first().click();
    // Keep the resume fixture small; later attachment/drawing history is a separate concern.
    await detail.getByLabel('タイトル', { exact: true }).fill('再開時の記録'); await detail.getByLabel('本文', { exact: true }).fill('元のバックアップ本文');
    await detail.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready('変更を適用しました。');
    await revealFileSurface(page, '保存'); const files = page.getByRole('region', { name: 'ファイル', exact: true });
    const [download] = await Promise.all([page.waitForEvent('download'), files.locator('.lv-file-primary').click()]);
    const backup = info.outputPath('resume-fixture.zip'); await download.saveAs(backup); expect(await download.failure()).toBeNull(); await closeFileSurface(page);
    for (const name of ['A.png', 'B.png', 'C.png']) {
      const chooser = page.waitForEvent('filechooser'); await page.getByLabel('メディアを追加', { exact: true }).click();
      await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: smallPng() }); await ready('メディアを追加しました。');
    }
    const media = detail.getByRole('region', { name: 'メディアの整理', exact: true }), gallery = media.getByRole('region', { name: '添付メディア', exact: true });
    const figures = gallery.locator('figure'), first = figures.filter({ hasText: 'A.png' }); await expect(figures).toHaveCount(3);
    await first.getByText('添付を整理', { exact: true }).click(); const next = first.getByRole('button', { name: '後へ', exact: true }), originalButton = await next.elementHandle();
    await next.focus(); await page.keyboard.press('Enter'); await ready('添付の順序を変更しました。');
    await expect(next).toBeFocused(); expect(await originalButton!.evaluate(node => node === document.activeElement)).toBe(true);
    await page.keyboard.press('Enter'); await ready('添付の順序を変更しました。');
    await expect(first.getByRole('button', { name: '前へ', exact: true })).toBeFocused(); await expect(figures.last()).toContainText('A.png');
    const edit = first.getByRole('button', { name: '説明を編集', exact: true }); await edit.click();
    const description = media.getByLabel('メディアの説明', { exact: true }); await description.fill('順序を変えた写真');
    await media.getByRole('button', { name: '説明を適用', exact: true }).focus(); await page.keyboard.press('Enter'); await ready('メディアの説明を適用しました。');
    await expect(edit).toBeFocused(); await expect(edit).toBeInViewport(); await expect(first).toContainText('順序を変えた写真');
    await page.keyboard.press('Enter'); await description.fill('取り消す説明'); await media.getByRole('region', { name: '説明の編集', exact: true }).getByRole('button', { name: '取り消す', exact: true }).focus();
    await page.keyboard.press('Enter'); await expect(edit).toBeFocused(); await expect(edit).toBeInViewport(); await expect(first).not.toContainText('取り消す説明');
    await revealWorkPanel(page); await page.getByRole('tab', { name: '描画', exact: true }).click(); const drawing = page.getByRole('tabpanel', { name: '描画', exact: true });
    await drawing.getByLabel('モデル', { exact: true }).selectOption({ label: 'continuity.glb' });
    const surface = drawing.getByLabel('マテリアル', { exact: true }); await surface.selectOption((await surface.locator('option').evaluateAll(nodes => nodes.map(n => (n as HTMLOptionElement).value).find(Boolean)))!);
    await beginMaterialEditing(drawing); const opacity = drawing.getByLabel('不透明度（%）', { exact: true }); await opacity.fill('63');
    const readableFieldHelp = async () => {
      await expect(page.getByRole('tooltip')).toBeVisible();
      expect(await opacity.evaluate(node => { const label = node.closest('label')!, note = document.getElementById(node.getAttribute('data-lv-help-for')!)!;
        const field = label.getBoundingClientRect(), hint = note.getBoundingClientRect();
        return Math.min(field.right, hint.right) > Math.max(field.left, hint.left) && Math.min(field.bottom, hint.bottom) > Math.max(field.top, hint.top); })).toBe(false);
    };
    if (touch) { await drawing.getByText('色の透過と詳細', { exact: true }).click(); await drawing.locator('.lv-material-content').evaluate(node => { node.scrollTop = node.scrollHeight; }); }
    await drawing.getByRole('button', { name: '変更を適用', exact: true }).focus(); await page.keyboard.press('Enter'); await ready('材質の設定を適用しました。'); await expect(opacity).toBeFocused(); await expect(opacity).toBeInViewport();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    if (touch) { await opacity.press('Tab'); await page.keyboard.press('Shift+Tab'); await expect(opacity).toBeFocused(); await readableFieldHelp();
      await page.keyboard.press('Escape'); await expect(page.getByRole('tooltip')).toHaveCount(0); await expect(opacity).toBeFocused(); await expect(opacity).toHaveValue('63'); }
    await opacity.fill('45'); await drawing.getByRole('button', { name: '取り消す', exact: true }).click(); await page.getByRole('button', { name: '変更を取り消す', exact: true }).press('Enter');
    await expect(opacity).toHaveValue('63'); await expect(opacity).toBeFocused(); await expect(opacity).toBeInViewport();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    if (!touch) {
      await revealCaptionList(page); await page.locator('.lv-caption-select').first().click();
      const stored = media.getByRole('group', { name: '既存のメディアを添付', exact: true });
      await stored.locator(':scope > summary').click();
      for (let i = 0; i < 10; i++) {
        await stored.getByRole('button', { name: 'A.png', exact: true }).click();
        await stored.getByRole('button', { name: '選択したメディアを添付', exact: true }).click(); await ready('選択したメディアを添付しました。');
      }
      await gallery.locator('figure').first().getByText('添付を整理', { exact: true }).click();
      const firstEdit = gallery.locator('figure').first().getByRole('button', { name: '説明を編集', exact: true });
      await firstEdit.click(); await description.fill('保存しない説明');
      await media.getByRole('region', { name: '説明の編集', exact: true }).getByRole('button', { name: '取り消す', exact: true }).click();
      await expect(firstEdit).toBeFocused(); await expect(firstEdit).toBeInViewport();
      const oldEdit = await firstEdit.elementHandle();
      await gallery.getByRole('button', { name: '次の一覧', exact: true }).click();
      expect(await oldEdit!.evaluate(node => node.isConnected)).toBe(false);
      await oldEdit!.evaluate(node => (node as HTMLButtonElement).click());
      await expect(media.getByRole('region', { name: '説明の編集', exact: true })).toBeHidden();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('continued-input.png') });
    await context.close(); resumePhase = 'restore-setup';
    const recipient = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: touch, serviceWorkers: 'block' });
    await recipient.route('**/*', route => { const url = new URL(route.request().url());
      if (url.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue(); remote.push(url.origin); return route.abort(); });
    const resumed = resumedPage = await recipient.newPage(); resumed.setDefaultTimeout(15_000); resumed.on('pageerror', error => errors.push(error.message));
    await resumed.goto(server.url + '?timings=1'); await resumed.getByLabel('ファイルを選択', { exact: true }).setInputFiles(backup);
    await resumed.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); restoreStarted = Date.now(); await resumed.getByRole('button', { name: 'バックアップから復元', exact: true }).click();
    // Existing first-backup operation budget, separate from the 15s UI/180s overall limits.
    await expect(resumed.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled({ timeout: 90_000 });
    restoreElapsed = Date.now() - restoreStarted; await info.attach('resume-setup', { body: JSON.stringify({ restoreMilliseconds: restoreElapsed, phaseBudget: 'existing first-backup 90s, not a performance guarantee' }), contentType: 'application/json' });
    resumePhase = 'saved-body-edit'; await revealCaptionList(resumed);
    await resumed.locator('.lv-caption-select').filter({ hasText: '再開時の記録' }).click();
    const resumedDetail = resumed.getByRole('region', { name: 'キャプションの詳細', exact: true }), body = '復元した端末で保存した本文';
    await resumedDetail.getByLabel('本文', { exact: true }).fill(body); await resumedDetail.getByRole('button', { name: '変更を適用', exact: true }).click();
    await expect(resumed.getByText('変更を適用しました。', { exact: true })).toBeVisible();
    await recipient.addInitScript(() => {
      let blocked = false, release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
      const state = { held: 0, release() { blocked = false; release(); } }; (window as any).resumeReadGate = state;
      const measure = Performance.prototype.measure, getFile = FileSystemFileHandle.prototype.getFile;
      Performance.prototype.measure = function(name: string, ...args: any[]) {
        const entry = Reflect.apply(measure, this, [name, ...args]); if (name === 'lociview.host.open.reading') blocked = true; return entry;
      };
      FileSystemFileHandle.prototype.getFile = async function() { if (blocked) { state.held++; await gate; } return getFile.call(this); };
    });
    resumePhase = 'cold-held-read'; if (touch) await resumed.setViewportSize({ width: 320, height: 568 }); await resumed.reload();
    const reader = resumed.getByRole('region', { name: '再開中のキャプション', exact: true }); await expect(reader).toBeVisible();
    await expect.poll(() => resumed.evaluate(() => (window as any).resumeReadGate.held)).toBeGreaterThan(0);
    await expect(resumed.locator('main.lv-project-workspace')).toHaveCount(0); await expect(reader.locator('textarea,input[type=file]')).toHaveCount(0);
    await reader.getByRole('button', { name: '再開時の記録', exact: true }).click(); await expect(reader.getByText(body, { exact: true })).toBeVisible();
    expect(await resumed.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await resumed.screenshot({ path: info.outputPath('early-resume-body.png') });
    if (touch) await reader.getByRole('button', { name: '一覧へ戻る', exact: true }).click();
    const search = reader.getByRole('searchbox', { name: '検索', exact: true }); await search.focus(); await search.dispatchEvent('compositionstart'); await search.fill('再開');
    const sameReader = await reader.elementHandle(); resumePhase = 'IME-handoff'; await resumed.evaluate(() => (window as any).resumeReadGate.release());
    await expect.poll(() => resumed.evaluate(() => performance.getEntriesByName('lociview.host.open.total').length)).toBeGreaterThan(0);
    expect(await sameReader!.evaluate(node => node.isConnected)).toBe(true); await expect(search).toBeFocused();
    await search.dispatchEvent('compositionend'); await expect(reader).toHaveCount(0);
    const continuedSearch = resumed.locator('.lv-caption-browser').getByRole('searchbox', { name: '検索', exact: true });
    await expect(continuedSearch).toHaveValue('再開'); await expect(continuedSearch).toBeFocused(); await expect(continuedSearch).toBeInViewport();
    await expect(resumed.locator('.lv-caption-select').filter({ hasText: '再開時の記録' })).toHaveAttribute('aria-current', 'true');
    await resumed.locator('.lv-caption-select').filter({ hasText: '再開時の記録' }).click(); await expect(resumedDetail.getByLabel('本文', { exact: true })).toHaveValue(body);
    await resumed.screenshot({ path: info.outputPath('resumed-input.png') }); expect(errors).toEqual([]); expect(remote).toEqual([]);
  } catch (error) {
    const failed = resumedPage ?? page;
    await failed.screenshot({ path: info.outputPath('failure.png') }).catch(() => {});
    await info.attach('reading-failure-state', { body: JSON.stringify({ phase: resumePhase, restoreElapsed: restoreElapsed ?? (restoreStarted === undefined ? undefined : Date.now() - restoreStarted), page: await failed.evaluate(() => ({
      url: location.href, held: (window as any).resumeReadGate?.held,
      stages: performance.getEntriesByType('measure').map(entry => ({ name: entry.name, milliseconds: entry.duration })),
    })).catch(() => null) }), contentType: 'application/json' }); throw error;
  }
  finally { await browser.close(); await server.stop(); }
});
