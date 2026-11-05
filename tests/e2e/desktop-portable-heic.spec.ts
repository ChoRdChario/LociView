import { writeCleanImportFixture } from './cleanImportFixture';
import { selectShareOutput, closeFileSurface, revealCoordinateAdd, revealFileSurface, revealProjectSelection } from './workspaceUi';
import { desktopOrigin, desktopEntry } from './desktopEntry';
import { test, expect, chromium, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import * as A from '@automerge/automerge';
import { triangleGlb } from './fixtures';
import { portablePng } from '../helpers/portableHeicFixtures';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { CleanArchive } from '../../src/projectPackage/cleanArchive';
import { validationMetadataLimits as limits } from '../../src/projectFiles/validation';

const title = 'HEICのオフライン閲覧';
async function ready(p: Page, text: string) {
  await expect(p.getByText(text, { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(p.locator('main.lv-project-workspace > header > p.lv-operation-status')).toHaveAttribute('data-busy', 'false');
}
async function output(p: Page, info: TestInfo, name: string, purpose: 'backup' | 'teamWorkspace') {
  const menu = p.locator('details.lv-project-files'); if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
  const area = p.getByRole('region', { name: 'ファイル', exact: true }),compact=await revealFileSurface(p,purpose==='backup'?'保存':'共有'); if(!compact)await area.getByRole('button', { name: purpose === 'backup' ? '保存' : '相手に渡す', exact: true }).click();
  if (purpose === 'backup') await area.getByLabel('名前（任意）', { exact: true }).fill(name); else await selectShareOutput(area, purpose);

  await expect(area.locator('.lv-file-intents')).toContainText('HEIC原本と表示用PNGの組');
  const [download] = await Promise.all([p.waitForEvent('download', { timeout: 90_000 }), area.locator('button.lv-file-primary').click()]);
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 90_000 });
  const history = area.locator('details').filter({ has: p.locator('summary', { hasText: '作成したファイル' }) });
  if (!await history.evaluate(n => (n as HTMLDetailsElement).open)) await history.locator(':scope > summary').click();
  await expect(history).toContainText('HEIC原本と表示用PNGの組');
  const path = info.outputPath(name + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull(); await closeFileSurface(p);return path;
}
async function open(p: Page, path: string) { await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles(path); await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); }
async function gallery(p: Page) {
  await p.locator('.lv-caption-select').first().click();
  const area = p.locator('.lv-caption-window').getByRole('region', { name: '添付メディア', exact: true }); const image = area.locator('img').first();
  await expect(image).toBeVisible(); await expect.poll(() => image.evaluate(n => (n as HTMLImageElement).naturalWidth)).toBe(96);
  await area.getByRole('button', { name: '画像を表示', exact: true }).click();
  await expect(p.getByLabel('メディアビューア', { exact: true })).toBeVisible(); await p.getByLabel('メディアビューア', { exact: true }).getByLabel('閉じる', { exact: true }).click();
}
test('08c uses canvas generation, portable offline display/save/reopen and a portable-only copy on the current build', async ({}, info) => {
  test.setTimeout(600_000); A.getHeads(A.init());
  await mkdir('.artifacts/e2e/profiles', { recursive: true }); const profiles = await Promise.all(['creator','receiver'].map(n => mkdtemp('.artifacts/e2e/profiles/heic-' + n + '-')));
  const contexts = new Set<BrowserContext>(), errors: string[] = [], remote: string[] = [];
  const launch = async (index: number) => {
    const context = await chromium.launchPersistentContext(profiles[index]!, { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true }); contexts.add(context);
    await context.addInitScript(({ creator, png }) => {
      const original = createImageBitmap.bind(window); (window as any).__heicDecodes = 0;
      window.createImageBitmap = (async (...args: any[]) => {
        if (args[0] instanceof Blob && args[0].type === 'image/heic') {
          (window as any).__heicDecodes++;
          if (!creator) throw Error('HEIC deliberately unavailable');
          return original(new Blob([new Uint8Array(png)], { type: 'image/png' }));
        }
        return (original as any)(...args);
      }) as typeof createImageBitmap;
    }, { creator: index === 0, png: [...portablePng()] });
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.origin === desktopOrigin || ['blob:', 'data:'].includes(u.protocol)) return route.continue();
      remote.push(u.href); return route.abort('blockedbyclient');
    });
    const p = context.pages()[0] ?? await context.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', e => errors.push(e.message)); await p.goto(desktopEntry); return { context, p };
  };
  try {
    const a = await launch(0), p = a.p;
    await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'model.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await p.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill(title); await p.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 }); await expect(p.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false');
    await revealCoordinateAdd(p); const owner = p.getByLabel('追加先モデル', { exact: true }); await owner.focus(); await owner.selectOption({ label: 'model.glb' }); await p.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const [axis,value] of [['X','0'],['Y','.5'],['Z','0']]) await p.getByLabel(`位置 ${axis}`, { exact: true }).fill(value!);
    await p.getByRole('button', { name: '位置を確定', exact: true }).click(); await ready(p, 'ピンの位置を確定しました。');
    const settings=p.getByLabel('設定',{exact:true});await settings.locator('summary').click();await settings.getByLabel('編集者名',{exact:true}).fill('HEIC担当');await settings.getByLabel('このプロジェクトの今後の編集にこの名前を残す',{exact:true}).check();await settings.getByRole('button',{name:'編集者名を設定',exact:true}).click();
    await p.getByLabel('本文',{exact:true}).fill('名前のみの履歴');await p.getByRole('button',{name:'変更を適用',exact:true}).click();await ready(p,'変更を適用しました。');
    const chooser = p.waitForEvent('filechooser'); await p.getByLabel('メディアを追加', { exact: true }).click(); await (await chooser).setFiles('tests/fixtures/daily-media/owned-still.heic'); await ready(p, 'メディアを追加しました。');
    await gallery(p); expect(await p.evaluate(() => (window as any).__heicDecodes)).toBe(1);
    const workspace = await output(p, info, 'portable-workspace', 'teamWorkspace');
    const inspected = await WorkspaceArchive.inspect(new Blob([Uint8Array.from(await readFile(workspace)).buffer]), limits); expect(inspected.archive.control.manifest.requiredCapabilities).toEqual(['editor-attribution-v1','portable-heic-display-v1']);
    const b = await launch(1); await open(b.p, workspace); await expect(b.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 }); await gallery(b.p);
    // Already-loaded shell only: no claim of offline app cold startup/PWA caching.
    await b.context.setOffline(true); await b.p.getByLabel('本文', { exact: true }).fill('オフラインの追記'); await b.p.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready(b.p, '変更を適用しました。');
    const backup = await output(b.p, info, 'offline-backup', 'backup'); await gallery(b.p);
    await revealProjectSelection(b.p); await b.p.getByRole('button', { name: /^(?:ファイルを開く|別のプロジェクトを開く)$/, exact: true }).click(); await b.p.getByRole('button', { name: '編集で開く', exact: true }).first().click(); await gallery(b.p); expect(await b.p.evaluate(() => (window as any).__heicDecodes)).toBe(0);
    await b.context.setOffline(false); await b.context.close(); contexts.delete(b.context);
    const cold = await launch(1);
    await expect(cold.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 }); await gallery(cold.p);
    await expect(cold.p.getByLabel('本文', { exact: true })).toHaveValue('オフラインの追記');
    expect(await cold.p.evaluate(() => (window as any).__heicDecodes)).toBe(0);
    const portableOnly = await writeCleanImportFixture(backup, info.outputPath('portable-only-copy.zip'));
    const clean = await CleanArchive.inspect(await openAsBlob(portableOnly), limits);
    expect(clean.archive.control.manifest.requiredCapabilities).toEqual(['portable-heic-display-v1']);
    const copyRun = String(clean.source.proof.identity.projectId).slice(4);
    expect(copyRun).not.toBe(new URL(cold.p.url()).searchParams.get('run'));
    await revealProjectSelection(cold.p);
    await cold.p.locator('details.lv-project-files').getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await open(cold.p, portableOnly);
    await expect.poll(() => new URL(cold.p.url()).searchParams.get('run')).toBe(copyRun);
    await gallery(cold.p);
    expect(await cold.p.evaluate(() => (window as any).__heicDecodes)).toBe(0);
    await cold.p.screenshot({ path: info.outputPath('portable-heic-recipient.png'), fullPage: true });
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally { for (const context of contexts) { for (const [i,p] of context.pages().entries()) await p.screenshot({ path: info.outputPath(`last-${[...contexts].indexOf(context)}-${i}.png`), fullPage: true }).catch(() => {}); await context.close(); } }
});
