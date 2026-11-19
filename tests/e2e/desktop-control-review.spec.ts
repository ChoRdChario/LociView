import { test, createBrowserProfile } from '../helpers/browserProfile';
import { expect, chromium, type Page, type BrowserContext } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import * as A from '@automerge/automerge';
import { ownedServer } from '../offline-e2e/server';
import { triangleGlb, nativeSpatialBackup } from './fixtures';
import { finishCaptionEditing, chooseHomeFiles, revealReviewFiles,chooseSharedScene, selectShareOutput, revealFileSurface, revealCaptionList, closeFileSurface } from './workspaceUi';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { ReviewArchive } from '../../src/projectPackage/reviewArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';

test('review files use the same camera controls and create an independent editable copy only after confirmation', async ({}, info) => {
  test.setTimeout(180_000); A.getHeads(A.init());
  const server=await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT??'offline-desktop-dist'),browser=await chromium.launch({channel:'chromium',headless:true}),errors:string[]=[],remote:string[]=[];
  const launch=async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:true});
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===new URL(server.url).origin||['blob:','data:'].includes(url.protocol))return route.continue();remote.push(url.href);return route.abort();});
    const page=await context.newPage();page.setDefaultTimeout(15_000);page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url+(process.env.LOCIVIEW_E2E_TIMINGS==='1'?'?timings=1':''));return page;
  };
  const backup=async(page:Page,name:string)=>{
    await revealFileSurface(page,'保存');const files=page.getByRole('region',{name:'ファイル',exact:true});await files.getByLabel('保存名（任意）',{exact:true}).fill(name);
    await page.evaluate(()=>document.dispatchEvent(new Event('lociview-timing-snapshot')));
    const primary=files.locator('.lv-file-primary');await expect(primary).toBeEnabled({timeout:90_000});
    const started=Date.now();
    const [download]=await Promise.all([page.waitForEvent('download'),primary.click()]).catch(async error=>{
      await page.screenshot({path:info.outputPath(name+'-download-failure.png')});
      await info.attach(name+'-download-state',{body:JSON.stringify({fileText:await files.innerText(),status:await files.locator('.lv-operation-status').getAttribute('data-busy'),primaryText:await primary.innerText(),primaryDisabled:await primary.isDisabled(),timings:await page.evaluate(()=>{document.dispatchEvent(new Event('lociview-timing-snapshot'));return performance.getEntriesByType('measure').filter(entry=>entry.name.startsWith('lociview.')).map(entry=>({...entry.toJSON(),detail:(entry as PerformanceMeasure).detail}));}),errors,remote}),contentType:'application/json'});
      throw error;
    }),handoffMs=Date.now()-started,path=info.outputPath(name+'.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
    await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy','false');
    await info.attach(name+'-save-duration',{body:JSON.stringify({handoffMs,saveAndIdleMs:Date.now()-started,endpoint:'enabled primary click to download event; then actual file save and busy terminal; archive audit excluded'}),contentType:'application/json'});
    const archive=await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]),validationMetadataLimits);return archive.source.proof.identity.projectId;
  };
  try {
    const source=await launch();await chooseHomeFiles(source, {name:'比較用モデル.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await source.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('操作の確認');await source.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
    await expect(source.getByLabel('3Dモデルの表示',{exact:true})).toHaveAttribute('aria-busy','false',{timeout:90_000});const original=await backup(source,'original');
    await revealFileSurface(source,'共有');const files=source.getByRole('region',{name:'ファイル',exact:true});await selectShareOutput(files, 'review');await chooseSharedScene(files);await files.getByRole('button',{name:'内容を確認',exact:true}).click();await expect(files.locator('.lv-file-primary')).toHaveText('ダウンロード');
    const [download]=await Promise.all([source.waitForEvent('download'),files.locator('.lv-file-primary').click()]),path=info.outputPath('review.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
    const page=await launch();await chooseHomeFiles(page, path);const review=page.getByRole('main',{name:'閲覧用のシーン',exact:true}),gizmo=review.locator('.lv-project-camera');await expect(gizmo.getByRole('button',{name:'Z',exact:true})).toBeEnabled({timeout:90_000});
    await expect(review.locator('.lv-review-scene-header > h2')).toHaveCount(1);
    await expect(review.getByLabel('表示するシーン',{exact:true})).toHaveCount(0);
    await expect(review.getByRole('button',{name:'正面',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveCount(0);
    await expect(review.getByRole('button',{name:'開始視点に戻る',exact:true})).toHaveCount(0);
    for(const name of ['X','−X','Y','−Y','Z','−Z']){const axis=gizmo.getByRole('button',{name,exact:true});await axis.press('Enter');await expect(axis).toHaveAttribute('aria-pressed','true');}
    const canvas=review.getByLabel('3Dモデルの表示',{exact:true}),drag=async(button:'left'|'right',dx:number,dy:number)=>{const r=(await canvas.boundingBox())!;await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down({button});await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:8});await page.mouse.up({button});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));};
    await gizmo.getByRole('button',{name:'Z',exact:true}).press('Enter');await drag('left',40,20);await expect(gizmo.getByRole('button',{name:'Z',exact:true})).toHaveAttribute('aria-pressed','false');
    const orbitPixels=await canvas.screenshot({path:info.outputPath('review-left-orbit.png')});await drag('right',30,15);const panPixels=await canvas.screenshot({path:info.outputPath('review-right-pan.png')});expect(Buffer.compare(orbitPixels,panPixels)).not.toBe(0);
    await gizmo.getByRole('button',{name:'全体表示',exact:true}).click();const projection=review.getByLabel('投影方式',{exact:true});await projection.selectOption('orthographic');await expect(projection).toHaveValue('orthographic');await projection.selectOption('perspective');await expect(projection).toHaveValue('perspective');
    await gizmo.getByRole('button',{name:'Z',exact:true}).press('Enter');await expect(review.getByRole('textbox',{name:'検索',exact:true})).toHaveCount(0);const empty=review.getByRole('complementary',{name:'閲覧パネル',exact:true}).getByText('このシーンにキャプションはありません。',{exact:true}).filter({visible:true});await expect(empty).toHaveCount(1);await expect(empty).toHaveText('このシーンにキャプションはありません。');await expect(empty).toBeVisible();
    await page.screenshot({path:info.outputPath('review-wide.png'),fullPage:false});await page.setViewportSize({width:390,height:844});await expect(gizmo).toBeInViewport();
    const narrowCanvas = (await canvas.boundingBox())!, pan = (await gizmo.getByRole('button', {name:'平行移動',exact:true}).boundingBox())!;
    expect(pan.y).toBeGreaterThanOrEqual(narrowCanvas.y);
    expect(pan.y + pan.height).toBeLessThanOrEqual(narrowCanvas.y + narrowCanvas.height);
    await page.screenshot({path:info.outputPath('review-narrow.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});
    await revealReviewFiles(review); await review.getByRole('button',{name:'編集コピーを作る',exact:true}).click();const confirmation=page.getByRole('region',{name:'編集コピーの確認',exact:true});await expect(confirmation).toBeFocused();await expect(confirmation).toBeInViewport();await expect(confirmation).toContainText('変更分の返送には使えません');await confirmation.getByRole('button',{name:'戻る',exact:true}).click();await expect(confirmation).toBeHidden();await expect(review.getByRole('button',{name:'編集コピーを作る',exact:true})).toBeFocused();await expect(review).toBeVisible();
    await revealReviewFiles(review); await review.getByRole('button',{name:'編集コピーを作る',exact:true}).click();await confirmation.getByRole('button',{name:'コピーを作成',exact:true}).click();await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toBeVisible({timeout:90_000});await expect(review).toHaveCount(0);
    const independent=await backup(page,'independent');expect(independent).not.toBe(original);await page.reload();await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toBeVisible({timeout:90_000});expect(await backup(page,'reopened')).toBe(independent);expect(errors).toEqual([]);expect(remote).toEqual([]);
  } finally { await browser.close();await server.stop(); }
});

test('touch Review copy preserves Mesh, Point, GS, Proxy and photos through actual output and cold reopen', async ({}, info) => {
  A.getHeads(A.init()); const fixture = await nativeSpatialBackup(), input = info.outputPath('mixed.zip'); await writeFile(input, fixture.file);
  const server = await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT ?? 'offline-desktop-dist'), contexts = new Set<BrowserContext>();
  const sourceProfile = await createBrowserProfile('mixed-source'), touchProfile = await createBrowserProfile('mixed-touch');
  const errors: string[] = [], remote: string[] = [];
  const launch = async (touch = false) => {
    const context = await chromium.launchPersistentContext(touch ? touchProfile : sourceProfile, { channel: 'chromium', headless: true, viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1, serviceWorkers: 'block', acceptDownloads: true });
    await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(u.protocol)) return route.continue(); remote.push(u.href); return route.abort(); });
    contexts.add(context); const p = context.pages()[0] ?? await context.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(server.url); return p;
  };
  const ready = async (p: Page) => { await expect(p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toBeVisible({ timeout: 90_000 });
    const stage = p.getByRole('button', { name: '3D', exact: true }); if (await stage.isVisible() && await stage.getAttribute('aria-pressed') !== 'true') await stage.click();
    await expect(p.locator('.lv-project-viewport-status')).toBeEmpty({ timeout: 90_000 }); };
  try {
    const source = await launch(); await chooseHomeFiles(source, input);
    await source.getByRole('button', { name: '新しいプロジェクトに変換', exact: true }).click(); await ready(source);
    await revealFileSurface(source, '共有'); const files = source.getByRole('region', { name: 'ファイル', exact: true }); await selectShareOutput(files, 'review');
    const choices = files.getByLabel('渡すシーン', { exact: true }).getByRole('checkbox'); for (const choice of await choices.all()) await choice.check();
    await files.getByRole('button', { name: '内容を確認', exact: true }).click(); const [download] = await Promise.all([source.waitForEvent('download'), files.locator('.lv-file-primary').click()]);
    const reviewPath = info.outputPath('mixed-review.zip'); await download.saveAs(reviewPath); expect(await download.failure()).toBeNull();
    await source.context().close(); contexts.delete(source.context());
    const original = await ReviewArchive.inspect(await openAsBlob(reviewPath), validationMetadataLimits);
    let p = await launch(true); await chooseHomeFiles(p, reviewPath);
    await expect(p.getByRole('main', { name: '閲覧用のシーン', exact: true })).toBeVisible(); await revealReviewFiles(p); await p.getByRole('button', { name: '編集コピーを作る', exact: true }).click();
    const confirmation = p.getByRole('region', { name: '編集コピーの確認', exact: true });
    await expect(confirmation).toBeFocused(); await expect(confirmation).toBeInViewport();
    await p.getByRole('button', { name: 'コピーを作成', exact: true }).click(); await ready(p); await revealCaptionList(p);
    await p.locator('.lv-caption-select').first().click(); const detail = p.getByRole('region', { name: 'キャプションの詳細', exact: true });
    await detail.getByLabel('本文', { exact: true }).fill('スマホで直接コピーを編集'); await finishCaptionEditing(p, {}); await p.screenshot({ path: info.outputPath('touch-edited.png') });
    await revealFileSurface(p, '保存'); const area = p.getByRole('region', { name: 'ファイル', exact: true }); const [saved] = await Promise.all([p.waitForEvent('download'), area.locator('.lv-file-primary').click()]);
    const path = info.outputPath('mixed-saved.zip'); await saved.saveAs(path); expect(await saved.failure()).toBeNull();
    const backup = await BackupArchive.inspect(await openAsBlob(path), validationMetadataLimits), inspected = await inspectProjectCandidates(backup.source.read(), validationMetadataLimits);
    if (inspected.kind !== 'project-candidate-inspection') throw Error('Invalid copied records');
    const records = inspected.unambiguousRecords as Record<string, any>, reps = Object.values(records.representationsById) as any[];
    for (const role of ['pointPrimary', 'gsPrimary', 'interactionProxy']) expect(reps.some(r => r.role === role)).toBe(true);
    expect(reps.some(r => r.contentKind === 'mesh')).toBe(true); expect(Object.keys(records.captionAttachmentsById).length).toBeGreaterThan(0);
    for (const body of original.archive.control.manifest.blobs) expect(backup.archive.control.manifest.blobs).toContainEqual(body);
    await closeFileSurface(p); const context = p.context(); await context.close(); contexts.delete(context); p = await launch(true);
    await ready(p); await revealCaptionList(p); await p.locator('.lv-caption-select').first().click();
    await expect(p.getByRole('region', { name: 'キャプションの詳細', exact: true }).getByLabel('本文', { exact: true })).toHaveValue('スマホで直接コピーを編集');
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally { for (const context of contexts) await context.close(); await server.stop(); }
});
