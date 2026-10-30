import { test, expect, chromium, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as A from '@automerge/automerge';
import { ownedServer } from '../offline-e2e/server';
import { triangleGlb } from './fixtures';
import { revealFileSurface } from './workspaceUi';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { validationMetadataLimits } from '../../src/projectFiles/validation';

test('review files use the same camera controls and create an independent editable copy only after confirmation', async ({}, info) => {
  test.setTimeout(180_000); A.getHeads(A.init());
  const server=await ownedServer('offline-desktop-dist'),browser=await chromium.launch({channel:'chromium',headless:true}),errors:string[]=[],remote:string[]=[];
  const launch=async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:true});
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===new URL(server.url).origin||['blob:','data:'].includes(url.protocol))return route.continue();remote.push(url.href);return route.abort();});
    const page=await context.newPage();page.setDefaultTimeout(15_000);page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);return page;
  };
  const backup=async(page:Page,name:string)=>{
    await revealFileSurface(page,'保存');const files=page.getByRole('region',{name:'ファイル',exact:true});await files.getByLabel('名前（任意）',{exact:true}).fill(name);
    const primary=files.locator('.lv-file-primary');await expect(primary).toBeEnabled({timeout:90_000});const [download]=await Promise.all([page.waitForEvent('download'),primary.click()]),path=info.outputPath(name+'.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
    await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy','false');const archive=await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]),validationMetadataLimits);return archive.source.proof.identity.projectId;
  };
  try {
    const source=await launch();await source.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'比較用モデル.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await source.getByRole('button',{name:'ファイルを開く',exact:true}).click();await source.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('操作の確認');await source.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
    await expect(source.getByLabel('3Dモデルの表示',{exact:true})).toHaveAttribute('aria-busy','false',{timeout:90_000});const original=await backup(source,'original');
    await revealFileSurface(source,'共有');const files=source.getByRole('region',{name:'ファイル',exact:true});await files.getByLabel('渡す内容',{exact:true}).selectOption('review');const scenes=files.getByLabel('渡すシーン',{exact:true});await scenes.selectOption((await scenes.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).find(Boolean)))!);await files.getByRole('button',{name:'内容を確認',exact:true}).click();await expect(files.locator('.lv-file-primary')).toHaveText('ダウンロード');
    const [download]=await Promise.all([source.waitForEvent('download'),files.locator('.lv-file-primary').click()]),path=info.outputPath('review.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
    const page=await launch();await page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(path);await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();const review=page.getByRole('main',{name:'閲覧用のシーン',exact:true}),gizmo=review.locator('.lv-project-camera');await expect(gizmo.getByRole('button',{name:'Z',exact:true})).toBeEnabled({timeout:90_000});
    await expect(review.getByRole('button',{name:'正面',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveCount(0);
    for(const name of ['X','−X','Y','−Y','Z','−Z']){const axis=gizmo.getByRole('button',{name,exact:true});await axis.press('Enter');await expect(axis).toHaveAttribute('aria-pressed','true');}
    await gizmo.getByRole('button',{name:'全体表示',exact:true}).click();await review.getByText('視点',{exact:true}).click();const projection=review.getByLabel('投影方式',{exact:true});await projection.selectOption('orthographic');await expect(projection).toHaveValue('orthographic');await projection.selectOption('perspective');await expect(projection).toHaveValue('perspective');
    await gizmo.getByRole('button',{name:'Z',exact:true}).press('Enter');await expect(review.getByRole('textbox',{name:'検索',exact:true})).toHaveCount(0);const empty=review.locator('.lv-development-sidebar > p');await expect(empty).toHaveText('このシーンにキャプションはありません。');await expect(empty).toBeVisible();
    await page.screenshot({path:info.outputPath('review-wide.png'),fullPage:false});await page.setViewportSize({width:390,height:844});await expect(gizmo).toBeInViewport();await page.screenshot({path:info.outputPath('review-narrow.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});
    await review.getByRole('button',{name:'編集コピーを作る',exact:true}).click();const confirmation=page.getByRole('region',{name:'編集コピーの確認',exact:true});await expect(confirmation).toContainText('変更分の返送には使えません');await confirmation.getByRole('button',{name:'戻る',exact:true}).click();await expect(confirmation).toBeHidden();await expect(review).toBeVisible();
    await review.getByRole('button',{name:'編集コピーを作る',exact:true}).click();await confirmation.getByRole('button',{name:'コピーを作成',exact:true}).click();await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toBeVisible({timeout:90_000});await expect(review).toHaveCount(0);
    const independent=await backup(page,'independent');expect(independent).not.toBe(original);await page.reload();await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toBeVisible({timeout:90_000});expect(await backup(page,'reopened')).toBe(independent);expect(errors).toEqual([]);expect(remote).toEqual([]);
  } finally { await browser.close();await server.stop(); }
});
