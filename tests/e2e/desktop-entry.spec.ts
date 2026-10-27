import {test,expect} from '@playwright/test';
import {triangleGlb} from './fixtures';
test('PCトップから旧データの画面を経由しても新規作成はProjectSceneへ戻り、SWを登録しない',async({page,context},info)=>{
 const remote:string[]=[];await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:4182'||['blob:','data:'].includes(u.protocol))return route.continue();remote.push(u.origin);return route.abort('blockedbyclient');});
 await context.addInitScript(()=>{(window as any).swAttempts=0;const original=ServiceWorkerContainer.prototype.register;ServiceWorkerContainer.prototype.register=function(...args:Parameters<typeof original>){(window as any).swAttempts++;return original.apply(this,args);};});
 await page.goto('/');await expect(page.getByRole('heading',{name:'LociView',exact:true})).toBeVisible();await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
 await page.getByRole('button',{name:'以前のプロジェクトを開く',exact:true}).click();await expect(page.locator('.lv-home')).toBeVisible();
 await expect(page.getByRole('button',{name:'GSのオフライン表示を準備',exact:true})).toHaveCount(0);
 const chooser=page.waitForEvent('filechooser');await page.locator('.lv-drop').click();await(await chooser).setFiles({name:'モデル.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});
 await expect(page.getByLabel('プロジェクト名',{exact:true})).toBeVisible();await page.getByLabel('プロジェクト名',{exact:true}).fill('PCの新しい作業');await page.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
 await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('PCの新しい作業',{timeout:90_000});
 await expect(page.locator('details.lv-project-files')).toHaveJSProperty('open',false);const canvas=page.getByLabel('3Dモデルの表示',{exact:true});expect((await canvas.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height/2);await page.screenshot({path:info.outputPath('desktop-workspace.png'),fullPage:true});
 expect(await page.evaluate(()=>(window as any).swAttempts)).toBe(0);expect(remote).toEqual([]);
 await page.reload();await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('PCの新しい作業',{timeout:90_000});expect(await page.evaluate(()=>(window as any).swAttempts)).toBe(0);
});
