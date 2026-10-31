import {test,expect,chromium,type Page} from '@playwright/test';
import {ownedServer} from '../offline-e2e/server';
import {triangleGlb} from './fixtures';
import {revealCoordinateAdd,revealFileSurface} from './workspaceUi';
import {readFile} from 'node:fs/promises';
import * as A from '@automerge/automerge';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {validationMetadataLimits} from '../../src/projectFiles/validation';

test('same-profile Project editing stays exclusive and resumes after the holder releases it',async({},info)=>{
  A.getHeads(A.init());
  const server=await ownedServer('offline-desktop-dist'),browser=await chromium.launch({channel:'chromium',headless:true});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),errors:string[]=[],remote:string[]=[];
  context.setDefaultTimeout(15_000);
  const detail=(p:Page)=>p.getByRole('region',{name:'キャプションの詳細',exact:true});
  const ready=async(p:Page,text:string)=>{await expect(p.getByText(text,{exact:true})).toBeVisible();await expect(p.locator('main.lv-project-workspace > header > .lv-operation-status')).toHaveAttribute('data-busy','false');};
  const readable=async(p:Page)=>{await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('同じプロジェクトの二窓');await expect(p.getByLabel('3Dモデルの表示',{exact:true})).toHaveAttribute('aria-busy','false');};
  const backup=async(p:Page,name:string)=>{
    await revealFileSurface(p,'保存');const files=p.getByRole('region',{name:'ファイル',exact:true});
    const [download]=await Promise.all([p.waitForEvent('download',{timeout:90_000}),files.locator('button.lv-file-primary').click()]),path=info.outputPath(name+'.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
    await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy','false');await p.locator('details.lv-project-files').getByRole('button',{name:'閉じる',exact:true}).click();
    const archive=await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]),validationMetadataLimits),bodies=[];
    for(const blob of archive.archive.control.manifest.blobs)bodies.push(Buffer.from(await archive.archive.entryBytes(blob.path,blob.byteLength)).toString('hex'));
    return{identity:archive.source.proof.identity,changes:archive.source.originalChanges().map(bytes=>Buffer.from(bytes).toString('hex')),bodies};
  };
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===new URL(server.url).origin||['blob:','data:'].includes(u.protocol))return route.continue();remote.push(u.href);return route.abort();});
  try{
    const holder=await context.newPage();await holder.goto(server.url);
    await holder.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'共有モデル.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});
    await holder.getByRole('button',{name:'ファイルを開く',exact:true}).click();await holder.getByLabel('プロジェクト名',{exact:true}).fill('同じプロジェクトの二窓');await holder.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await readable(holder);
    await revealCoordinateAdd(holder);const model=holder.getByLabel('追加先モデル',{exact:true});await model.focus();await model.selectOption({label:'共有モデル.glb'});await holder.getByRole('button',{name:'このモデルに追加',exact:true}).click();
    for(const axis of ['X','Y','Z'])await holder.getByLabel(`位置 ${axis}`,{exact:true}).fill('0');
    await holder.getByRole('button',{name:'位置を確定',exact:true}).click();await ready(holder,'ピンの位置を確定しました。');
    await detail(holder).getByLabel('タイトル',{exact:true}).fill('排他確認');await detail(holder).getByLabel('本文',{exact:true}).fill('先の画面の保存済み本文');await detail(holder).getByRole('button',{name:'変更を適用',exact:true}).click();await ready(holder,'変更を適用しました。');
    const before=await backup(holder,'holder-saved');expect(before.bodies).toContain(triangleGlb().toString('hex'));
    const projectUrl=holder.url(),contender=await context.newPage();await contender.goto(projectUrl);await readable(contender);
    await contender.locator('.lv-caption-select').filter({hasText:'排他確認'}).click();
    await expect(contender.getByRole('button',{name:'編集する',exact:true})).toBeEnabled();await expect(contender.locator('[data-lv-edit-only]:visible')).toHaveCount(0);await expect(detail(contender).getByRole('textbox')).toHaveCount(0);
    await expect(detail(contender).locator('[data-caption-field="body"] p')).toHaveText('先の画面の保存済み本文');
    await contender.getByRole('button',{name:'編集する',exact:true}).click();
    await expect(contender.getByText(/書込みロックを使用/)).toBeVisible();await expect(contender.getByRole('button',{name:'編集する',exact:true})).toBeEnabled();await expect(detail(contender).getByRole('textbox')).toHaveCount(0);
    // Both pages share navigator.locks/OPFS. The owner explicitly releases its
    // mutation lease by entering view mode; no fake LockManager or separate peer.
    await holder.getByRole('button',{name:'閲覧する',exact:true}).click();await expect(holder.getByRole('button',{name:'編集する',exact:true})).toBeEnabled();
    await contender.getByRole('button',{name:'編集する',exact:true}).click();await expect(contender.getByRole('button',{name:'閲覧する',exact:true})).toBeEnabled();
    await expect(detail(contender).getByLabel('本文',{exact:true})).toHaveValue('先の画面の保存済み本文');await detail(contender).getByLabel('本文',{exact:true}).fill('解放後の画面で保存');await detail(contender).getByRole('button',{name:'変更を適用',exact:true}).click();await ready(contender,'変更を適用しました。');
    await contender.reload();await readable(contender);await contender.locator('.lv-caption-select').filter({hasText:'排他確認'}).click();await expect(detail(contender).getByLabel('本文',{exact:true})).toHaveValue('解放後の画面で保存');
    const after=await backup(contender,'contender-resumed');expect(after.identity).toEqual(before.identity);expect(after.changes).toEqual(expect.arrayContaining(before.changes));expect(after.changes.length).toBeGreaterThan(before.changes.length);expect(after.bodies).toEqual(before.bodies);
    // The released holder must still be a reader while its peer edits.
    await expect(holder.getByRole('button',{name:'編集する',exact:true})).toBeEnabled();await expect(detail(holder).getByRole('textbox')).toHaveCount(0);
    expect(errors).toEqual([]);expect(remote).toEqual([]);await contender.screenshot({path:info.outputPath('released-and-resumed.png'),fullPage:true});
  }finally{await context.close();await browser.close();await server.stop();}
});
