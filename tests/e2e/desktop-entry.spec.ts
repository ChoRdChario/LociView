import { desktopOrigin, desktopEntry } from './desktopEntry';
import {test,expect} from '@playwright/test';
import {triangleGlb} from './fixtures';
import { homeSampleFiles } from '../../src/projectScene/homeSample';
import {ownedServer} from '../offline-e2e/server';
import {revealCaptionList,chooseHomeFiles,revealProjectSelection} from './workspaceUi';

for(const touch of [false,true])test(`Home sample follows normal inspection, saving and independent reopening (${touch?'touch':'PC'})`,async({browser},info)=>{
 const server=await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT??'offline-desktop-dist');
 const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1280,height:720},hasTouch:touch,isMobile:touch,serviceWorkers:'block',acceptDownloads:true});
 const recipient=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1280,height:720},hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
 const page=await context.newPage(),errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const current of [context,recipient])await current.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===new URL(server.url).origin||['blob:','data:'].includes(url.protocol))return route.continue();remote.push(url.origin);return route.abort();});
 try{
  await page.goto(server.url);const sample=page.getByRole('button',{name:'サンプルで試す',exact:true});
  const sampleFile=homeSampleFiles()[0]!;
  await chooseHomeFiles(page,{name:sampleFile.name,mimeType:'application/zip',buffer:Buffer.from(await sampleFile.arrayBuffer())});
  const convert=page.getByRole('button',{name:'新しいプロジェクトに変換',exact:true});await expect(convert).toBeVisible();await expect(convert).toBeFocused();
  await page.getByRole('button',{name:'選択を取り消す',exact:true}).click();await expect(sample).toBeEnabled();
  await sample.focus();await sample.press('Enter');await expect(page.getByRole('button',{name:'閲覧する',exact:true})).toBeEnabled({timeout:90000});
  const firstProject=await page.evaluate(()=>new URL(location.href).searchParams.get('run'));expect(firstProject).toBeTruthy();
  if(touch){const stage=page.getByRole('button',{name:'3D',exact:true});if(await stage.getAttribute('aria-pressed')!=='true')await stage.click();}
  const canvas=page.getByLabel('3Dモデルの表示',{exact:true});await expect(canvas).toHaveAttribute('aria-busy','false',{timeout:90000});
  await revealCaptionList(page);const search=page.getByRole('searchbox',{name:'検索',exact:true});await search.fill('点検');
  const row=page.locator('.lv-caption-select').filter({hasText:'パネルの傷'});await expect(row).toHaveCount(1);await expect(row).toHaveAccessibleDescription(/右側に細い傷/);await search.fill('');
  if(touch){await page.setViewportSize({width:320,height:568});await expect(search).toBeInViewport();expect((await search.boundingBox())!.width).toBeGreaterThan(250);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('sample-list-320.png')});await page.setViewportSize({width:390,height:844});}
  await row.click();const detail=page.getByRole('region',{name:'記録の詳細',exact:true});
  await page.getByRole('button',{name:'画像を表示',exact:true}).locator('visible=true').first().click();const viewer=page.getByRole('dialog',{name:'メディアビューア',exact:true});
  await expect.poll(()=>viewer.locator('img').evaluate((node:HTMLImageElement)=>node.naturalWidth)).toBe(320);
  await expect(viewer.getByRole('button',{name:'倍率 100%',exact:true})).toHaveCount(0);await viewer.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('button',{name:'画像を表示',exact:true}).locator('visible=true').first().click();
  await viewer.getByRole('button',{name:'ピンを表示',exact:true}).click();
  await expect(viewer).toBeHidden(); await expect(canvas).toBeFocused();
  await expect(page.locator('.lv-project-stage button[data-caption-id][aria-pressed="true"]')).toBeInViewport();
  if(touch){await revealCaptionList(page);await row.click();}
  const body='サンプルに書き加えた記録';await detail.getByLabel('本文',{exact:true}).fill(body);await expect(detail.locator('[data-save-state]')).toHaveAttribute('data-save-state','saved',{timeout:30000});
  const header=page.locator('main.lv-project-workspace > header');await expect(header.getByRole('button',{name:'共有',exact:true})).toBeVisible();
  const [download]=await Promise.all([page.waitForEvent('download'),header.getByRole('button',{name:'ファイルに保存',exact:true}).click()]);const file=info.outputPath('sample-backup.zip');await download.saveAs(file);expect(await download.failure()).toBeNull();
  await expect(page.getByLabel('保存ファイルの状態',{exact:true})).toContainText('ダウンロード開始');await expect(page.locator('.lv-save-filename')).toHaveText(download.suggestedFilename());
  await page.screenshot({path:info.outputPath('sample-saved.png')});
  const restored=await recipient.newPage();restored.on('pageerror',e=>errors.push(e.message));await restored.goto(server.url);await chooseHomeFiles(restored,file);await restored.getByRole('button',{name:'このファイルから再開',exact:true}).click();
  await expect(restored.getByRole('button',{name:'閲覧する',exact:true})).toBeEnabled({timeout:90000});await revealCaptionList(restored);await restored.locator('.lv-caption-select').filter({hasText:'パネルの傷'}).click();await expect(restored.getByRole('region',{name:'記録の詳細',exact:true}).getByLabel('本文',{exact:true})).toHaveValue(body);
  await restored.reload();await expect(restored.getByRole('button',{name:'閲覧する',exact:true})).toBeEnabled({timeout:90000});
  await revealProjectSelection(page);await page.getByRole('button',{name:'プロジェクトを選ぶ',exact:true}).click();await sample.click();await expect(page.getByRole('button',{name:'閲覧する',exact:true})).toBeEnabled({timeout:90000});
  expect(await page.evaluate(()=>new URL(location.href).searchParams.get('run'))).not.toBe(firstProject);expect(errors).toEqual([]);expect(remote).toEqual([]);
 }finally{await recipient.close();await context.close();await server.stop();}
});
test('PCトップから旧データの画面を経由しても新規作成はProjectSceneへ戻り、SWを登録しない',async({page,context},info)=>{
 const remote:string[]=[];await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===desktopOrigin||['blob:','data:'].includes(u.protocol))return route.continue();remote.push(u.origin);return route.abort('blockedbyclient');});
 await context.addInitScript(()=>{(window as any).swAttempts=0;const original=ServiceWorkerContainer.prototype.register;ServiceWorkerContainer.prototype.register=function(...args:Parameters<typeof original>){(window as any).swAttempts++;return original.apply(this,args);};});
 await page.goto(desktopEntry);await expect(page.getByRole('heading',{name:'LociView',exact:true})).toBeVisible();await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
 await page.getByRole('button',{name:'以前のプロジェクトを開く',exact:true}).click();await expect(page.locator('.lv-home')).toBeVisible();
 await expect(page.getByRole('button',{name:'GSのオフライン表示を準備',exact:true})).toHaveCount(0);
 const chooser=page.waitForEvent('filechooser');await page.locator('.lv-drop').click();await(await chooser).setFiles({name:'モデル.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});
 await expect(page.getByLabel('プロジェクト名',{exact:true})).toBeVisible();await page.getByLabel('プロジェクト名',{exact:true}).fill('PCの新しい作業');await page.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
 await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('PCの新しい作業',{timeout:90_000});
 await expect(page.locator('details.lv-project-files')).toHaveJSProperty('open',false);const canvas=page.getByLabel('3Dモデルの表示',{exact:true});expect((await canvas.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height/2);await page.screenshot({path:info.outputPath('desktop-workspace.png'),fullPage:true});
 expect(await page.evaluate(()=>(window as any).swAttempts)).toBe(0);expect(remote).toEqual([]);
 await page.reload();await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('PCの新しい作業',{timeout:90_000});expect(await page.evaluate(()=>(window as any).swAttempts)).toBe(0);
});
