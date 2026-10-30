import { revealFileSurface, revealModelManagement, lookAlongFront } from './workspaceUi';
import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {createHash} from 'node:crypto';
import {openAsBlob} from 'node:fs';
import * as A from '@automerge/automerge';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {validationMetadataLimits} from '../../src/projectFiles/validation';
import {smallPng,texturedTriangleGlb} from './fixtures';

const ply=Buffer.from('ply\nformat ascii 1.0\nelement vertex 5\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n0 0 0 255 0 0\n-1 -1 0 0 255 0\n1 -1 0 0 0 255\n-1 1 0 255 255 0\n1 1 0 255 0 255\n');
async function backup(page:Page,info:TestInfo,name:string){
 const menu=page.locator('details.lv-project-files');if(!await menu.evaluate(n=>(n as HTMLDetailsElement).open))await menu.locator(':scope > summary').click();
 const files=page.getByRole('region',{name:'ファイル',exact:true});if(!await revealFileSurface(page,'保存')) await files.getByRole('button',{name:'保存',exact:true}).click();
 const primary=files.getByRole('button',{name:'ファイルに保存',exact:true});await expect(primary).toBeEnabled({timeout:90_000});
 const [download]=await Promise.all([page.waitForEvent('download'),primary.click()]);const path=info.outputPath(name+'.zip');await download.saveAs(path);
 await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy','false',{timeout:90_000});
 return BackupArchive.inspect(await openAsBlob(path),validationMetadataLimits);
}
test('PCでモデル読込中も記録を検索・閲覧し、準備済み点群を操作でき、完了後の保存内容が変わらない',async({page,context},info)=>{
 test.setTimeout(300_000);A.getHeads(A.init());const errors:string[]=[],remote:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin==='http://127.0.0.1:4182'||['blob:','data:'].includes(url.protocol))return route.continue();remote.push(url.origin);return route.abort();});
 await context.addInitScript(()=>{
  const original=window.createImageBitmap.bind(window) as(...args:any[])=>Promise<ImageBitmap>;const pending:(()=>void)[]=[];
  (window as any).__heldBitmaps=0;(window as any).__releaseBitmaps=()=>{sessionStorage.removeItem('lv-test-hold-bitmaps');for(const release of pending.splice(0))release();};
  window.createImageBitmap=((...args:any[])=>{if(!sessionStorage.getItem('lv-test-hold-bitmaps'))return original(...args);
   (window as any).__heldBitmaps++;return new Promise<ImageBitmap>((resolve,reject)=>{pending.push(()=>{original(...args).then(resolve,reject);});});}) as typeof createImageBitmap;
 });
 await page.goto('/?timings=1');await page.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'先に見える点群.ply',mimeType:'application/ply',buffer:ply});
 await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await page.getByLabel('プロジェクト名',{exact:true}).fill('読み込み中の作業');await page.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
 const status=page.locator('.lv-project-viewport-status'),canvas=page.getByLabel('3Dモデルの表示',{exact:true});await expect(status).toHaveAttribute('data-busy','false',{timeout:90_000});
 await lookAlongFront(page);await page.getByRole('button',{name:'ピンを追加',exact:true}).click();const box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width/2,y:box.height/2}});
 await page.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(page.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible();
 const detail=page.getByRole('region',{name:'キャプションの詳細',exact:true});await detail.getByLabel('タイトル',{exact:true}).fill('先に読める記録');await detail.getByLabel('本文',{exact:true}).fill('読み込み途中もこの文章を読めます');await detail.getByRole('button',{name:'変更を適用',exact:true}).click();await expect(page.getByText('変更を適用しました。',{exact:true})).toBeVisible();
 const image=page.waitForEvent('filechooser');await page.getByLabel('メディアを追加',{exact:true}).click();await(await image).setFiles({name:'写真.png',mimeType:'image/png',buffer:smallPng()});await expect(page.getByText('メディアを追加しました。',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'モデル',exact:true}).click();const model=page.waitForEvent('filechooser');await revealModelManagement(page); await page.getByRole('button',{name:'3Dモデルを追加',exact:true}).click();await(await model).setFiles({name:'後から表示する面.glb',mimeType:'model/gltf-binary',buffer:texturedTriangleGlb()});await expect(page.getByText('モデルを追加しました。',{exact:true})).toBeVisible({timeout:90_000});
 const before=await backup(page,info,'before-loading');await page.evaluate(()=>sessionStorage.setItem('lv-test-hold-bitmaps','1'));await page.reload();
 await expect(page.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('読み込み中の作業',{timeout:90_000});await expect.poll(()=>page.evaluate(()=>(window as any).__heldBitmaps)).toBeGreaterThan(0);
 const search=page.getByRole('searchbox',{name:'検索',exact:true}),row=page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select');
 await search.fill('存在しない言葉');await expect(row).toHaveCount(0);await search.fill('先に読める');await expect(row).toHaveCount(1);await row.click();await expect(detail.getByLabel('本文',{exact:true})).toHaveValue('読み込み途中もこの文章を読めます');
 await expect(detail.getByLabel('タイトル',{exact:true})).not.toBeEditable();await expect(detail.getByRole('button',{name:'変更を適用',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'ピンを追加',exact:true})).toBeDisabled();await expect(status).toHaveAttribute('data-busy','true');await expect(canvas).toHaveAttribute('aria-busy','true');
 const pixels=await canvas.screenshot();expect(await canvas.evaluate(async(_node,png)=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
  const copy=document.createElement('canvas');copy.width=image.width;copy.height=image.height;const context=copy.getContext('2d')!;context.drawImage(image,0,0);const bytes=context.getImageData(0,0,copy.width,copy.height).data;let red=0;for(let i=0;i<bytes.length;i+=4)if(bytes[i]!>200&&bytes[i+1]!<80&&bytes[i+2]!<80)red++;return red;},pixels.toString('base64'))).toBeGreaterThan(0);
 const initial=await canvas.screenshot();await lookAlongFront(page);const rotated=await canvas.screenshot();expect(createHash('sha256').update(rotated).digest('hex')).not.toBe(createHash('sha256').update(initial).digest('hex'));
 const menu=page.locator('details.lv-project-files');await menu.locator(':scope > summary').click();await expect(menu.getByRole('tablist',{name:'ファイルの操作',exact:true}).getByRole('tab',{name:'保存',exact:true})).toBeDisabled();
 await menu.locator(':scope > summary').click();
 expect(await status.evaluate(n=>getComputedStyle(n,'::before').animationName)).toBe('lv-operation-spin');await page.emulateMedia({reducedMotion:'reduce'});expect(await status.evaluate(n=>getComputedStyle(n,'::before').animationName)).toBe('none');await page.emulateMedia({reducedMotion:'no-preference'});
 await page.screenshot({path:info.outputPath('usable-while-loading.png'),fullPage:true});
 await page.evaluate(()=>(window as any).__releaseBitmaps());await expect(status).toHaveAttribute('data-busy','false',{timeout:90_000});await expect(status).toBeEmpty();await expect(detail.getByLabel('タイトル',{exact:true})).toBeEditable();await expect(search).toHaveValue('先に読める');await expect(detail.getByLabel('タイトル',{exact:true})).toHaveValue('先に読める記録');
 const after=await backup(page,info,'after-loading');expect(after.source.token).toBe(before.source.token);expect(after.source.originalChanges()).toEqual(before.source.originalChanges());
 await page.screenshot({path:info.outputPath('loaded-workspace.png'),fullPage:true});expect(errors).toEqual([]);expect(remote).toEqual([]);
});
