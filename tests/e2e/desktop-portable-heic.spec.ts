import { revealFileSurface, revealProjectSelection } from './workspaceUi';
import { test, expect, chromium, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as A from '@automerge/automerge';
import { triangleGlb } from './fixtures';
import { portablePng } from '../helpers/portableHeicFixtures';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { validationMetadataLimits as limits } from '../../src/projectFiles/validation';

const title = 'HEICのオフライン閲覧';
async function ready(p: Page, text: string) {
  await expect(p.getByText(text, { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(p.locator('main.lv-project-workspace > header > p.lv-operation-status')).toHaveAttribute('data-busy', 'false');
}
async function output(p: Page, info: TestInfo, name: string, purpose: 'backup' | 'teamWorkspace' | 'clean', portable = true) {
  const menu = p.locator('details.lv-project-files'); if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
  const area = p.getByRole('region', { name: 'ファイル', exact: true }),compact=await revealFileSurface(p,purpose==='backup'?'保存':'共有'); if(!compact)await area.getByRole('button', { name: purpose === 'backup' ? '保存' : '相手に渡す', exact: true }).click();
  if (purpose === 'backup') await area.getByLabel('名前（任意）', { exact: true }).fill(name); else if(compact)await area.getByLabel('渡す内容',{exact:true}).selectOption(purpose);else if(purpose==='clean'){const more=area.locator('.lv-file-intents > details');if(!await more.evaluate(n=>(n as HTMLDetailsElement).open))await more.locator('summary').click();await more.getByRole('button',{name:'独立コピーを作る',exact:true}).click();}else await area.getByLabel('渡す内容', { exact: true }).selectOption(purpose);
  if(purpose==='clean'){await area.locator('button.lv-file-primary').click();await expect(area.locator('button.lv-file-primary')).toHaveText('ダウンロード');}
  await area.locator('button.lv-file-primary').click();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 90_000 });
  const history = area.locator('details').filter({ has: p.locator('summary', { hasText: '作成したファイル' }) });
  if (!await history.evaluate(n => (n as HTMLDetailsElement).open)) await history.locator(':scope > summary').click();
  if(portable)await expect(history).toContainText('HEIC原本と表示用PNGの組');
  const row=history.locator('section').filter({hasText:purpose==='backup'?'バックアップ':purpose==='clean'?'独立コピー':'作業一式'}).filter({hasText:portable?'HEIC原本と表示用PNGの組':'記録された編集者名'});
  const [download] = await Promise.all([p.waitForEvent('download', { timeout: 90_000 }), row.getByRole('button', { name: 'ダウンロード', exact: true }).click()]);
  const path = info.outputPath(name + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull(); return path;
}
async function open(p: Page, path: string) { await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles(path); await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); }
async function gallery(p: Page) {
  await p.locator('.lv-caption-select').first().click();
  const area = p.locator('.lv-caption-window').getByRole('region', { name: '添付メディア', exact: true }); const image = area.locator('img').first();
  await expect(image).toBeVisible(); await expect.poll(() => image.evaluate(n => (n as HTMLImageElement).naturalWidth)).toBe(96);
  await area.getByRole('button', { name: '画像を表示', exact: true }).click();
  await expect(p.getByLabel('メディアビューア', { exact: true })).toBeVisible(); await p.getByLabel('メディアビューア', { exact: true }).getByLabel('閉じる', { exact: true }).click();
}
async function journalSnapshot(p:Page){return p.evaluate(async()=>{
  const rows:Record<string,string>={},root=await navigator.storage.getDirectory();const walk=async(dir:FileSystemDirectoryHandle,prefix:string)=>{for await(const[name,handle]of(dir as any).entries()){const path=prefix+name;if(handle.kind==='directory')await walk(handle,path+'/');else if(path.includes('/v2/metadata/')&&/\.(json|amchange)$/.test(path)){const b=await(await handle.getFile()).arrayBuffer(),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',b));rows[path]=[...digest].map(n=>n.toString(16).padStart(2,'0')).join('');}}};await walk(root,'');return rows;
});}
test('08c uses native canvas generation, portable offline display/save/reopen and the pinned immediate predecessor refusal', async ({}, info) => {
  test.setTimeout(600_000); A.getHeads(A.init()); execFileSync(process.execPath, ['scripts/prepare-editor-attribution-old-reader.mjs', 'portableHeic'], { windowsHide: true });
  await mkdir('.artifacts/e2e/profiles', { recursive: true }); const profiles = await Promise.all(['creator','receiver','old'].map(n => mkdtemp('.artifacts/e2e/profiles/heic-' + n + '-')));
  const contexts = new Set<BrowserContext>(), errors: string[] = [], remote: string[] = [];
  const launch = async (index: number, old = false) => {
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
    const oldRoot = resolve('.artifacts/e2e/editor-attribution-old-reader/fe2010900fabaacfee2e22c39b1d5e9e1196eabb/desktop-dist');
    await context.route('**/*', async route => {
      const u = new URL(route.request().url()); if (['blob:', 'data:'].includes(u.protocol)) return route.continue();
      if (u.origin !== 'http://127.0.0.1:4182') { remote.push(u.href); return route.abort('blockedbyclient'); }
      if (!old) return route.continue();
      const path = resolve(oldRoot, u.pathname === '/' ? 'index.html' : '.' + u.pathname); if (!path.startsWith(oldRoot + sep)) throw Error('Old build path');
      try { return await route.fulfill({ path }); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return route.fulfill({ status: 404, body: '' }); throw error; }
    });
    const p = context.pages()[0] ?? await context.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', e => errors.push(e.message)); await p.goto('/'); return { context, p };
  };
  try {
    const a = await launch(0), p = a.p;
    await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'model.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await p.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill(title); await p.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 }); await expect(p.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false');
    await p.getByText('数値で配置', { exact: true }).click(); const owner = p.getByLabel('追加先モデル', { exact: true }); await owner.focus(); await owner.selectOption({ label: 'model.glb' }); await p.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const [axis,value] of [['X','0'],['Y','.5'],['Z','0']]) await p.getByLabel(`位置 ${axis}`, { exact: true }).fill(value!);
    await p.getByRole('button', { name: '位置を確定', exact: true }).click(); await ready(p, 'ピンの位置を確定しました。');
    const settings=p.getByLabel('設定',{exact:true});await settings.locator('summary').click();await settings.getByLabel('編集者名',{exact:true}).fill('HEIC担当');await settings.getByLabel('このプロジェクトの今後の編集にこの名前を残す',{exact:true}).check();await settings.getByRole('button',{name:'編集者名を設定',exact:true}).click();
    await p.getByLabel('本文',{exact:true}).fill('名前のみの履歴');await p.getByRole('button',{name:'変更を適用',exact:true}).click();await ready(p,'変更を適用しました。');
    const namesOnly=await output(p,info,'names-only','teamWorkspace',false),old=await launch(2,true);await open(old.p,namesOnly);await expect(old.p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText(title,{timeout:90_000});await revealProjectSelection(old.p); await old.p.getByRole('button',{name:'別のプロジェクトを開く',exact:true}).click();
    const chooser = p.waitForEvent('filechooser'); await p.getByLabel('メディアを追加', { exact: true }).click(); await (await chooser).setFiles('tests/fixtures/daily-media/owned-still.heic'); await ready(p, 'メディアを追加しました。');
    await gallery(p); expect(await p.evaluate(() => (window as any).__heicDecodes)).toBe(1);
    const workspace = await output(p, info, 'portable-workspace', 'teamWorkspace');
    const inspected = await WorkspaceArchive.inspect(new Blob([Uint8Array.from(await readFile(workspace)).buffer]), limits); expect(inspected.archive.control.manifest.requiredCapabilities).toEqual(['editor-attribution-v1','portable-heic-display-v1']);
    const b = await launch(1); await open(b.p, workspace); await expect(b.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 }); await gallery(b.p);
    // Already-loaded shell only: no claim of offline app cold startup/PWA caching.
    await b.context.setOffline(true); await b.p.getByLabel('本文', { exact: true }).fill('オフラインの追記'); await b.p.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready(b.p, '変更を適用しました。');
    const backup = await output(b.p, info, 'offline-backup', 'backup'); await gallery(b.p);
    await revealProjectSelection(b.p); await b.p.getByRole('button', { name: '別のプロジェクトを開く', exact: true }).click(); await b.p.getByRole('button', { name: '編集で開く', exact: true }).first().click(); await gallery(b.p); expect(await b.p.evaluate(() => (window as any).__heicDecodes)).toBe(0);
    await b.context.setOffline(false); await b.context.close(); contexts.delete(b.context); const cold = await launch(1); await expect(cold.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 }); await gallery(cold.p); expect(await cold.p.evaluate(() => (window as any).__heicDecodes)).toBe(0);
    await open(old.p, workspace); await expect(old.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveCount(0); await expect(old.p.getByRole('status').filter({ hasText: /対応|機能|確認/ }).first()).toBeVisible();
    const portableOnly=await output(p,info,'portable-only-copy','clean');await open(old.p,portableOnly);await expect(old.p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveCount(0);
    const before=await journalSnapshot(p);await a.context.close();contexts.delete(a.context);const oldLocal=await launch(0,true);await expect(oldLocal.p.getByText(/最後のプロジェクトを再開できません/)).toBeVisible({timeout:90_000});await expect(oldLocal.p.locator('main.lv-project-workspace')).toHaveCount(0);expect(await journalSnapshot(oldLocal.p)).toEqual(before);
    await cold.p.screenshot({ path: info.outputPath('portable-heic-recipient.png'), fullPage: true }); expect((await readFile(backup)).length).toBeGreaterThan(0); expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally { for (const context of contexts) { for (const [i,p] of context.pages().entries()) await p.screenshot({ path: info.outputPath(`last-${[...contexts].indexOf(context)}-${i}.png`), fullPage: true }).catch(() => {}); await context.close(); } }
});
