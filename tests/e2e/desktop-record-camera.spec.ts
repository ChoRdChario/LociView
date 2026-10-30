import {test,expect,chromium,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import * as A from '@automerge/automerge';
import {ownedServer} from '../offline-e2e/server';
import {triangleGlb,smallPng} from './fixtures';
import {revealCoordinateAdd,revealCameraPositions,revealModelManagement,revealFileSurface,revealWorkPanel} from './workspaceUi';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {validationMetadataLimits} from '../../src/projectFiles/validation';

test('record list, pin actions and direct camera navigation remain coherent through drawing edits and reopening',async({},info)=>{
  test.setTimeout(240_000);A.getHeads(A.init());
  const server=await ownedServer('offline-desktop-dist'),browser=await chromium.launch({channel:'chromium',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:true}),p=await context.newPage(),errors:string[]=[],remote:string[]=[];
  p.setDefaultTimeout(15_000);p.on('pageerror',e=>errors.push(e.stack??e.message));
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===new URL(server.url).origin||['data:','blob:'].includes(u.protocol))return route.continue();remote.push(u.href);return route.abort();});
  const detail=p.getByRole('region',{name:'キャプションの詳細',exact:true}),list=p.getByLabel('キャプション一覧',{exact:true}),tools=p.getByRole('region',{name:'記録の操作',exact:true}),pin=p.getByRole('region',{name:'位置の調整',exact:true});
  const ready=async(text:string)=>{await expect(p.getByText(text,{exact:true})).toBeVisible({timeout:90_000});await expect(p.locator('main.lv-project-workspace > header > .lv-operation-status')).toHaveAttribute('data-busy','false');};
  const task=async(name:string)=>{await revealWorkPanel(p);await p.getByRole('tab',{name,exact:true}).click();};
  const backup=async(name:string)=>{
    await revealFileSurface(p,'保存');const files=p.getByRole('region',{name:'ファイル',exact:true});await files.getByLabel('名前（任意）',{exact:true}).fill(name);
    // File generation uses the existing file-action budget, not the generic 15s input deadline.
    const[download]=await Promise.all([p.waitForEvent('download',{timeout:90_000}),files.locator('.lv-file-primary').click()]),path=info.outputPath(name+'.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
    await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy','false');await p.locator('details.lv-project-files').getByRole('button',{name:'閉じる',exact:true}).click();
    const archive=await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]),validationMetadataLimits);return{identity:archive.source.proof.identity,changes:archive.source.originalChanges()};
  };
  const drag=async(area:ReturnType<Page['locator']>,dx:number,dy:number)=>{const r=(await area.boundingBox())!;await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down({button:'left'});await p.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:8});await p.mouse.up({button:'left'});};
  try{
    await p.goto(server.url);await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'模型A.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('記録とカメラの確認');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
    const gizmo=p.locator('.lv-project-camera');await expect(gizmo.getByRole('button',{name:'Z',exact:true})).toBeEnabled({timeout:90_000});await expect(p.getByRole('tab')).toHaveText(['キャプション','モデル','描画']);await expect(p.locator('details.lv-comparison-actions')).toBeHidden();
    await task('モデル');await revealModelManagement(p);const choose=p.waitForEvent('filechooser');await p.getByRole('button',{name:'3Dモデルを追加',exact:true}).click();await(await choose).setFiles({name:'模型B.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await ready('モデルを追加しました。');await task('キャプション');
    for(const [name,x] of [['確認点A','0'],['確認点B','.2']]){
      await revealCoordinateAdd(p);const owner=p.getByLabel('追加先モデル',{exact:true});await owner.focus();await owner.selectOption({label:'模型A.glb'});await p.getByRole('button',{name:'このモデルに追加',exact:true}).click();
      for(const axis of ['X','Y','Z'])await pin.getByLabel('位置 '+axis,{exact:true}).fill(axis==='X'?x!:axis==='Y'?'.5':'0');await pin.getByRole('button',{name:'位置を確定',exact:true}).click();await ready('ピンの位置を確定しました。');
      await detail.getByLabel('タイトル',{exact:true}).fill(name!);await detail.getByLabel('本文',{exact:true}).fill('一覧を見ながら確認する本文');await expect(list).toBeInViewport();await expect(detail.getByRole('button',{name:'変更を適用',exact:true})).toBeInViewport({ratio:1});await detail.getByRole('button',{name:'変更を適用',exact:true}).click();await ready('変更を適用しました。');
    }
    await gizmo.getByRole('button',{name:'Z',exact:true}).press('Enter');await expect(p.locator('.lv-project-marker')).toHaveCount(2);
    const unselected=p.locator('.lv-project-marker[aria-pressed="false"]');await expect(unselected).toHaveText('確認点A');expect(await unselected.evaluate(n=>getComputedStyle(n).fontSize)).toBe('0px');expect((await unselected.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await expect(p.getByText('記録を整理',{exact:true})).toHaveCount(0);await expect(p.locator('.lv-comparison-actions')).toHaveCount(0);
    const rows=list.locator('li');await expect(rows.first().getByRole('button',{name:'編集',exact:true})).toBeVisible();await expect(rows.first().getByRole('button',{name:'削除',exact:true})).toBeVisible();
    await rows.filter({hasText:'確認点A'}).getByRole('button',{name:'編集',exact:true}).click();await expect(detail.getByLabel('本文',{exact:true})).toBeFocused();
    const windows=p.locator('.lv-caption-window');await expect(windows).toHaveCount(2);await windows.filter({hasText:'確認点B'}).getByRole('button',{name:'閉じる',exact:true}).focus();await expect(windows.filter({hasText:'確認点B'})).toHaveAttribute('data-active','true');await expect(detail.getByLabel('タイトル',{exact:true})).toHaveValue('確認点A');
    await tools.getByRole('button',{name:'位置を調整',exact:true}).click();await expect(pin).toBeVisible();await pin.getByRole('button',{name:'取り消す',exact:true}).click();
    await tools.getByText('親モデルを変更',{exact:true}).click();const parent=tools.getByLabel('変更先モデル',{exact:true});await parent.focus();await parent.selectOption({label:'模型B.glb'});await tools.getByRole('button',{name:'位置を確認',exact:true}).click();await expect(pin.getByRole('button',{name:'親モデルと位置を確定',exact:true})).toBeEnabled();await pin.getByRole('button',{name:'取り消す',exact:true}).click();
    const choosePhoto=p.waitForEvent('filechooser');await p.getByLabel('メディアを追加',{exact:true}).click();await(await choosePhoto).setFiles({name:'確認画像.png',mimeType:'image/png',buffer:smallPng()});await ready('メディアを追加しました。');await p.screenshot({path:info.outputPath('list-and-detail.png'),fullPage:false});
    const before=await backup('before-camera');await gizmo.getByRole('button',{name:'Z',exact:true}).press('Enter');const z=gizmo.getByRole('button',{name:'Z',exact:true}),initialAxis=await z.getAttribute('style');
    await drag(gizmo.locator('.lv-camera-axes'),70,25);await expect(z).toHaveAttribute('aria-pressed','false');await expect(z).not.toHaveAttribute('style',initialAxis!);
    const marker=p.locator('.lv-project-marker').filter({hasText:'確認点A'}),oldLeft=await marker.getAttribute('style'),pan=gizmo.getByRole('button',{name:'平行移動',exact:true});await expect(pan).toBeEnabled();await drag(pan,35,-20);await expect(marker).not.toHaveAttribute('style',oldLeft!);await pan.press('ArrowRight');
    const projection=gizmo.getByLabel('投影方式',{exact:true});await projection.selectOption('orthographic');await expect(projection).toHaveValue('orthographic');await drag(gizmo.locator('.lv-camera-axes'),-30,15);await drag(pan,-15,15);await expect(projection).toHaveValue('orthographic');
    const after=await backup('after-camera');expect(after.identity).toEqual(before.identity);expect(after.changes).toEqual(before.changes);
    await revealCameraPositions(p);await p.getByRole('button',{name:'開始視点を記録',exact:true}).click();await ready('開始視点を記録しました。');await expect(p.getByRole('button',{name:'開始視点を更新',exact:true})).toBeEnabled();await expect(p.getByLabel('記録した視点',{exact:true})).toHaveCount(0);await p.locator('.lv-camera-positions > summary').click();
    await task('描画');const drawing=p.getByRole('region',{name:'材質',exact:true});await drawing.getByLabel('モデル',{exact:true}).selectOption({label:'模型A.glb'});const face=drawing.getByLabel('マテリアル',{exact:true});await face.selectOption((await face.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).find(Boolean)))!);await expect(drawing.getByRole('button',{name:'設定を編集',exact:true})).toBeHidden();await drawing.getByLabel('照明',{exact:true}).selectOption('unlit');
    await p.setViewportSize({width:1280,height:600});const apply=drawing.getByRole('button',{name:'変更を適用',exact:true});await expect(apply).toBeInViewport({ratio:1});await drawing.locator('.lv-material-content').evaluate(n=>{n.scrollTop=n.scrollHeight;});await expect(apply).toBeInViewport({ratio:1});await apply.click();await ready('材質の設定を適用しました。');await backup('drawing-applied');
    await p.reload();await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('記録とカメラの確認',{timeout:90_000});await expect(gizmo.getByRole('button',{name:'Z',exact:true})).toBeEnabled({timeout:90_000});await task('キャプション');await list.locator('.lv-caption-select').filter({hasText:'確認点A'}).click();await expect(detail.getByLabel('本文',{exact:true})).toHaveValue('一覧を見ながら確認する本文');await expect(list).toBeInViewport();
    await revealCameraPositions(p);await expect(p.getByRole('button',{name:'開始視点を更新',exact:true})).toBeEnabled();await expect(p.getByLabel('記録した視点',{exact:true})).toHaveCount(0);await p.locator('.lv-camera-positions > summary').click();
    await list.locator('li').filter({hasText:'確認点B'}).getByRole('button',{name:'削除',exact:true}).click();const deletion=p.getByRole('region',{name:'削除の確認',exact:true});await expect(deletion).toBeVisible();await expect(deletion.getByRole('button',{name:'取り消す',exact:true})).toBeFocused();await deletion.getByRole('button',{name:'取り消す',exact:true}).click();await expect(p.getByRole('searchbox',{name:'検索',exact:true})).toBeFocused();await expect(list.locator('li')).toHaveCount(2);await list.locator('li').filter({hasText:'確認点B'}).getByRole('button',{name:'削除',exact:true}).click();await deletion.getByRole('button',{name:'削除する',exact:true}).click();await ready('プロジェクトから削除しました。');await expect(list.locator('li')).toHaveCount(1);await expect(p.getByRole('searchbox',{name:'検索',exact:true})).toBeFocused();await backup('after-delete');await p.reload();await expect(list.locator('li')).toHaveCount(1,{timeout:90_000});
    await p.screenshot({path:info.outputPath('reopened-short.png'),fullPage:false});
    expect(errors).toEqual([]);expect(remote).toEqual([]);
  }catch(error){await p.screenshot({path:info.outputPath('failure.png'),fullPage:false});throw error;}
  finally{await browser.close();await server.stop();}
});
