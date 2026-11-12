import { test, expect, chromium, type Page } from '@playwright/test';
import { ownedServer } from '../offline-e2e/server';
import { triangleGlb, smallPng } from './fixtures';
import { revealWorkPanel, revealCaptionList, beginMaterialEditing, revealFileSurface, closeFileSurface } from './workspaceUi';

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
    await page.goto(server.url);
    const cancelledPicker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
    await (await cancelledPicker).setFiles([]);await expect(page.getByText('ファイルを選択してください。',{exact:true})).toBeHidden();
    await expect(page.getByRole('button',{name:'プロジェクトを作成',exact:true})).toBeHidden();
    const firstPicker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
    await (await firstPicker).setFiles({ name: 'continuity.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await expect(page.getByText('3Dモデル・点群から新規作成、保存したファイルから再開できます。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await page.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill('操作の継続'); await page.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    const stage = page.getByRole('button', { name: '3D', exact: true });
    if (touch) { await expect(stage).toBeVisible(); if (await stage.getAttribute('aria-pressed') !== 'true') await stage.click(); }
    await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    if (touch) {
      const tasks = page.getByRole('tablist', { name: '作業', exact: true }), drawing = tasks.getByRole('tab', { name: '描画', exact: true });
      await expect(tasks).toBeVisible(); await expect(tasks.locator('[aria-selected="true"]')).toHaveCount(0);
      const canvas = await page.getByLabel('3Dモデルの表示', { exact: true }).elementHandle();
      await drawing.click(); await expect(page.getByRole('tabpanel', { name: '描画', exact: true })).toBeVisible();
      await expect(page.getByLabel('3Dモデルの表示', { exact: true })).toBeVisible();
      expect(await canvas!.evaluate(node => node === document.querySelector('canvas[aria-label="3Dモデルの表示"]'))).toBe(true);
      await drawing.focus(); await page.setViewportSize({ width: 1440, height: 900 });
      await expect(page.locator('.lv-sidebar-toolbar > [role="tablist"]')).toHaveCount(1); await expect(drawing).toBeFocused();
      await drawing.evaluate(node => (node as HTMLElement).blur());
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('.lv-compact-navigation > [role="tablist"]')).toHaveCount(1);await expect(page.locator('body')).toBeFocused();
      await drawing.focus();await page.setViewportSize({ width: 1440, height: 900 });await expect(drawing).toBeFocused();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('.lv-compact-navigation > [role="tablist"]')).toHaveCount(1); await expect(drawing).toBeFocused();
      await expect(tasks).toHaveCount(1);
    }
    await revealCaptionList(page);
    const firstAdd = page.getByRole('button', { name: 'キャプションを追加', exact: true });
    await expect(firstAdd).toHaveText('キャプションを追加');
    expect(await firstAdd.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(14);
    expect((await firstAdd.boundingBox())!.y).toBeLessThan((await page.locator('.lv-caption-browser input[type="search"]').boundingBox())!.y);
    await expect(page.getByRole('group', { name: '保存状況', exact: true })).toContainText('ブラウザ内');
    await page.screenshot({ path: info.outputPath('first-record-entry.png') });
    await firstAdd.click();
    const firstCanvas = page.getByLabel('3Dモデルの表示', { exact: true });
    await expect(firstCanvas).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    const firstCanvasBox = (await firstCanvas.boundingBox())!;
    const firstPosition = { x: firstCanvasBox.width / 2, y: firstCanvasBox.height / 2 };
    if (touch) await firstCanvas.tap({ position: firstPosition }); else await firstCanvas.click({ position: firstPosition });
    await page.getByRole('button', { name: '位置を確定', exact: true }).click(); await ready('ピンの位置を確定しました。');
    await expect(detail).toBeVisible();await expect(detail.getByText('タイトル・本文や写真を追加できます。',{exact:true})).toBeVisible();
    await expect(detail.getByRole('heading',{name:'名称なし',exact:true})).toBeFocused();
    // One tiny photo follows the same explicit text completion and survives the existing restore.
    await detail.getByLabel('タイトル', { exact: true }).fill('再開時の記録'); await detail.getByLabel('本文', { exact: true }).fill('元のバックアップ本文');
    const firstPhoto = page.waitForEvent('filechooser'); await page.getByLabel('メディアを追加', { exact: true }).click();
    await (await firstPhoto).setFiles({ name: 'A.png', mimeType: 'image/png', buffer: smallPng() });
    await expect(detail.locator('.lv-record-media-draft')).toContainText('A.png');
    await detail.getByRole('button', { name:'取り消す', exact:true }).click();
    const staleConfirmation = await detail.getByRole('button', { name:'変更を取り消す', exact:true }).elementHandle();
    const replacement = page.waitForEvent('filechooser'); await page.getByLabel('メディアを追加', { exact:true }).click();
    await (await replacement).setFiles({ name:'新しく選んだ写真.png', mimeType:'image/png', buffer:smallPng() });
    await expect(detail.getByRole('button', { name:'変更を取り消す', exact:true })).toBeHidden();
    await staleConfirmation!.evaluate(node => (node as HTMLButtonElement).click());
    await expect(detail.locator('.lv-record-media-draft')).toContainText('新しく選んだ写真.png');
    const finalPhoto = page.waitForEvent('filechooser'); await page.getByLabel('メディアを追加', { exact:true }).click();
    await (await finalPhoto).setFiles({ name:'A.png', mimeType:'image/png', buffer:smallPng() });
    await page.emulateMedia({ reducedMotion:'reduce' });
    expect(await detail.locator('.lv-record-media-draft').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
    await page.emulateMedia({ reducedMotion:'no-preference' });
    await detail.getByLabel('本文', { exact: true }).dispatchEvent('compositionstart');
    await expect(detail.getByRole('button', { name: '変更を適用', exact: true })).toBeDisabled();
    await expect(page.getByLabel('保存ファイルの状態', { exact: true })).toBeHidden();
    await detail.getByLabel('本文', { exact: true }).dispatchEvent('compositionend');
    await expect(detail.getByText('「変更を適用」の後、「ファイルに保存」できます。',{exact:true})).toBeVisible();
    await expect(page.locator('header').getByRole('button',{name:'ファイルに保存',exact:true})).toBeDisabled();
    await page.screenshot({ path: info.outputPath('text-and-selected-photo.png') });
    await detail.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready('変更を適用しました。');
    await expect(page.getByLabel('保存ファイルの状態', { exact: true })).toHaveText('保存未確認');
    const rowEdit = page.locator('.lv-caption-row').first().getByRole('button', { name: '編集', exact: true, includeHidden: true });
    const rowDescription = await rowEdit.getAttribute('aria-describedby'); expect(rowDescription).toBeTruthy();
    await expect(page.locator('#' + rowDescription)).toHaveText('再開時の記録');
    const headerBeforeSave = await page.locator('main.lv-project-workspace > header').boundingBox();
    await page.locator('header').getByRole('button',{name:'ファイルに保存',exact:true}).click(); const files = page.getByRole('region', { name: 'ファイル', exact: true });
    await expect(files).toContainText('保存したファイルは「ファイルを開く」から再開できます。');
    await expect(files.getByLabel('保存名（任意）', { exact: true })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), files.locator('.lv-file-primary').click()]);
    const backup = info.outputPath('resume-fixture.zip'); await download.saveAs(backup); expect(await download.failure()).toBeNull();
    await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false');
    await closeFileSurface(page);
    await expect(page.getByLabel('保存ファイルの状態', { exact: true })).toHaveText('ダウンロード開始・保存先未確認');
    expect((await page.locator('.lv-project-shell > .lv-operation-status').allTextContents()).join('')).not.toContain('ダウンロードを開始しました。');
    expect((await page.locator('main.lv-project-workspace > header').boundingBox())!.y).toBe(headerBeforeSave!.y);
    await page.screenshot({ path: info.outputPath('save-status-after-close.png') });
    const menu=page.locator('details.lv-project-files');await menu.locator(':scope > summary').click();
    await menu.getByRole('button',{name:'ファイルを開く',exact:true}).click();
    const recent=page.getByRole('region',{name:'このブラウザから再開',exact:true});await expect(recent).toHaveAttribute('aria-busy','false');
    await recent.getByRole('group',{name:'操作の継続',exact:true}).getByRole('button',{name:'編集で開く',exact:true}).click();
    await expect(page.getByRole('button',{name:'閲覧する',exact:true})).toBeEnabled({timeout:90_000});
    await revealCaptionList(page);await page.locator('.lv-caption-select').filter({hasText:'再開時の記録'}).click();
    await expect(detail.getByLabel('本文',{exact:true})).toHaveValue('元のバックアップ本文');
    await expect(detail.getByRole('region',{name:'添付メディア',exact:true}).locator('figure')).toHaveCount(1);
    for (const name of ['B.png', 'C.png']) {
      const chooser = page.waitForEvent('filechooser'); await page.getByLabel('メディアを追加', { exact: true }).click();
      await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: smallPng() });
      await detail.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready('メディアを追加しました。');
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
    await recipient.addInitScript(() => {
      let blocked = false, release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
      const state = { held: 0, release() { blocked = false; release(); } }; (window as any).firstRestoreGate = state;
      const measure = Performance.prototype.measure, createWritable = FileSystemFileHandle.prototype.createWritable;
      Performance.prototype.measure = function(name: string, ...args: any[]) {
        const entry = Reflect.apply(measure, this, [name, ...args]); if (name === 'lociview.restore.first.initialize.start') blocked = true; return entry;
      };
      FileSystemFileHandle.prototype.createWritable = async function(...args) { if (blocked) { state.held++; await gate; } return Reflect.apply(createWritable, this, args); };
    });
    await recipient.route('**/*', route => { const url = new URL(route.request().url());
      if (url.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue(); remote.push(url.origin); return route.abort(); });
    const resumed = resumedPage = await recipient.newPage(); resumed.setDefaultTimeout(15_000); resumed.on('pageerror', error => errors.push(error.message));
    await resumed.goto(server.url + '?timings=1'); await resumed.getByLabel('ファイルを選択', { exact: true }).setInputFiles(backup);
    await resumed.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); restoreStarted = Date.now(); await resumed.getByRole('button', { name: 'このファイルから再開', exact: true }).click();
    const restoreTimeLeft = () => Math.max(1, restoreStarted! + 90_000 - Date.now());
    const firstReader = resumed.getByRole('region', { name: '復元中のキャプション', exact: true });
    await expect(firstReader).toBeVisible(); await expect.poll(() => resumed.evaluate(() => (window as any).firstRestoreGate.held)).toBeGreaterThan(0);
    await expect(resumed.locator('main.lv-project-workspace')).toHaveCount(0); await expect(firstReader.locator('textarea,input[type=file],canvas,img,video,audio')).toHaveCount(0);
    await expect(resumed.getByRole('button', { name: 'キャンセル', exact: true })).toBeDisabled();
    if (touch) await resumed.setViewportSize({ width: 320, height: 365 });
    await firstReader.getByRole('button', { name: '再開時の記録', exact: true }).click();
    await expect(firstReader.getByText('元のバックアップ本文', { exact: true })).toBeVisible();
    expect(await resumed.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await resumed.screenshot({ path: info.outputPath('first-restore-before-initialize.png') });
    if (touch) { await resumed.setViewportSize({ width: 844, height: 390 }); await firstReader.getByRole('button', { name: '一覧へ戻る', exact: true }).click(); }
    const firstSearch = firstReader.getByRole('searchbox', { name: '検索', exact: true });
    await firstSearch.focus(); await firstSearch.dispatchEvent('compositionstart'); await firstSearch.fill('再開');
    const firstReaderNode = await firstReader.elementHandle(); await resumed.evaluate(() => (window as any).firstRestoreGate.release());
    await expect.poll(() => resumed.evaluate(() => performance.getEntriesByName('lociview.restore.first.adopt').length), { timeout: restoreTimeLeft() }).toBeGreaterThan(0);
    expect(await firstReaderNode!.evaluate(node => node.isConnected)).toBe(true); await expect(firstSearch).toBeFocused();
    await expect(firstReader.getByText('復元が完了しました。入力を終えると編集画面に移ります。', { exact: true })).toBeVisible();
    await firstSearch.dispatchEvent('compositionend'); await expect(firstReader).toHaveCount(0);
    // Existing first-backup operation budget, separate from the 15s UI/180s overall limits.
    await expect(resumed.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled({ timeout: restoreTimeLeft() });
    restoreElapsed = Date.now() - restoreStarted; await info.attach('resume-setup', { body: JSON.stringify({ restoreMilliseconds: restoreElapsed, phaseBudget: 'existing first-backup 90s, not a performance guarantee' }), contentType: 'application/json' });
    if (touch) await resumed.setViewportSize({ width: 390, height: 844 });
    const restoredSearch = resumed.locator('.lv-caption-browser').getByRole('searchbox', { name: '検索', exact: true });
    await expect(restoredSearch).toHaveValue('再開'); await expect(restoredSearch).toBeFocused();
    await expect(resumed.locator('.lv-caption-select').filter({ hasText: '再開時の記録' })).toHaveAttribute('aria-current', 'true');
    resumePhase = 'saved-body-edit'; await revealCaptionList(resumed);
    await resumed.locator('.lv-caption-select').filter({ hasText: '再開時の記録' }).click();
    const resumedDetail = resumed.getByRole('region', { name: 'キャプションの詳細', exact: true }), body = '復元した端末で保存した本文';
    await expect(resumedDetail.getByRole('region', { name: '添付メディア', exact: true }).locator('figure')).toHaveCount(1);
    await expect(resumedDetail).toContainText('A.png');
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
