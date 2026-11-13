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
    await revealFileSurface(p,'保存');const files=p.getByRole('region',{name:'ファイル',exact:true});await files.getByLabel('保存名（任意）',{exact:true}).fill(name);
    // File generation uses the existing file-action budget, not the generic 15s input deadline.
    const[download]=await Promise.all([p.waitForEvent('download',{timeout:90_000}),files.locator('.lv-file-primary').click()]),path=info.outputPath(name+'.zip');await download.saveAs(path);expect(await download.failure()).toBeNull();
    await expect(files.locator('.lv-operation-status')).toHaveAttribute('data-busy','false');await p.locator('details.lv-project-files').getByRole('button',{name:'閉じる',exact:true}).click();
    const archive=await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]),validationMetadataLimits);return{identity:archive.source.proof.identity,changes:archive.source.originalChanges()};
  };
  const drag=async(area:ReturnType<Page['locator']>,dx:number,dy:number,button:'left'|'right'='left')=>{const r=(await area.boundingBox())!;await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down({button});await p.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:8});await p.mouse.up({button});};
  try{
    await p.goto(server.url);await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'模型A.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('記録とカメラの確認');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
    const gizmo=p.locator('.lv-project-camera');await expect(gizmo.getByRole('button',{name:'Z',exact:true})).toBeEnabled({timeout:90_000});await expect(p.getByRole('tab')).toHaveText(['キャプション','モデル','描画']);await expect(p.locator('details.lv-comparison-actions')).toBeHidden();
    await task('モデル');await revealModelManagement(p);const choose=p.waitForEvent('filechooser');await p.getByRole('button',{name:'3Dモデルを追加',exact:true}).click();await(await choose).setFiles({name:'模型B.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});await ready('モデルを追加しました。');await task('キャプション');
    for(const [name,x] of [['確認点A','0'],['確認点B','.2'],['確認点C','-.2']]){
      await revealCoordinateAdd(p);const owner=p.getByLabel('追加先モデル',{exact:true});await owner.focus();await owner.selectOption({label:'模型A.glb'});await p.getByRole('button',{name:'このモデルに追加',exact:true}).click();
      for(const axis of ['X','Y','Z'])await pin.getByLabel('位置 '+axis,{exact:true}).fill(axis==='X'?x!:axis==='Y'?'.5':'0');await pin.getByRole('button',{name:'ここに記録を作る',exact:true}).click();await ready('ピンの位置を確定しました。');
      await detail.getByLabel('タイトル',{exact:true}).fill(name!);await detail.getByLabel('本文',{exact:true}).fill('一覧を見ながら確認する本文');await expect(list).toBeInViewport();await expect(detail.getByRole('button',{name:'変更を適用',exact:true})).toBeInViewport({ratio:1});await detail.getByRole('button',{name:'変更を適用',exact:true}).click();await ready('変更を適用しました。');
    }
    await gizmo.getByRole('button',{name:'Z',exact:true}).press('Enter');await expect(p.locator('.lv-project-marker')).toHaveCount(3);
    const unselected=p.locator('.lv-project-marker[aria-pressed="false"]').filter({hasText:'確認点A'});await expect(unselected).toHaveText('確認点A');expect(await unselected.evaluate(n=>getComputedStyle(n).fontSize)).toBe('0px');expect((await unselected.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    const selected=p.locator('.lv-project-marker[aria-pressed="true"]');expect(await selected.evaluate(n=>getComputedStyle(n).fontSize)).toBe('0px');expect((await selected.boundingBox())!.width).toBe(44);
    const scale=p.getByLabel('ピンの大きさ',{exact:true});await scale.locator(':scope > summary').click();await scale.getByLabel('ピンのモデル',{exact:true}).selectOption({label:'模型A.glb'});await scale.getByLabel('ピンの表示倍率',{exact:true}).fill('1.5');await scale.getByRole('button',{name:'倍率を適用',exact:true}).click();await ready('ピンの表示倍率を変更しました。');await scale.locator(':scope > summary').click();
    await expect(p.getByText('記録を整理',{exact:true})).toHaveCount(0);await expect(p.locator('.lv-comparison-actions')).toHaveCount(0);
    const rows=list.locator('li');await expect(rows.first().getByRole('button',{name:'編集',exact:true})).toBeVisible();await expect(rows.first().getByRole('button',{name:'削除',exact:true})).toBeVisible();
    await rows.filter({hasText:'確認点A'}).getByRole('button',{name:'編集',exact:true}).click();await expect(detail.getByLabel('本文',{exact:true})).toBeFocused();
    const windows=p.locator('.lv-caption-window');
    await expect(p.getByRole('button',{name:'窓を残す',exact:true})).toHaveCount(0);
    while(await windows.count())await p.locator('.lv-caption-window[data-active="true"]').getByRole('button',{name:'閉じる',exact:true}).press('Enter');
    const order=(await rows.locator('.lv-caption-title').allTextContents()).map(value=>value.trim());
    expect([...order].sort()).toEqual(['確認点A','確認点B','確認点C']);
    const chooseRecord=async(name:string)=>rows.filter({hasText:name}).locator('.lv-caption-select').click();
    const card=(name:string)=>windows.filter({has:p.locator('.lv-caption-window-title').filter({hasText:name})});
    await chooseRecord(order[0]!);await chooseRecord(order[2]!);await expect(windows).toHaveCount(2);
    const other=card(order[2]!),otherNode=await other.elementHandle(),otherRect=await other.boundingBox();
    await card(order[0]!).locator('.lv-caption-window-title').focus();
    await card(order[0]!).locator('.lv-caption-window-title').press('ArrowRight');
    const activeRect=await card(order[0]!).boundingBox();
    await expect(detail.getByLabel('タイトル',{exact:true})).toHaveValue(order[2]!);
    await detail.getByRole('button',{name:'次の記録',exact:true}).click();
    await expect(detail.getByLabel('タイトル',{exact:true})).toHaveValue(order[1]!);await expect(windows).toHaveCount(2);
    await expect(card(order[0]!)).toHaveCount(0);await expect(card(order[1]!)).toHaveAttribute('data-active','true');
    expect(await card(order[1]!).boundingBox()).toEqual(activeRect);expect(await other.boundingBox()).toEqual(otherRect);
    expect(await otherNode!.evaluate(node=>node.isConnected)).toBe(true);
    await detail.getByRole('button',{name:'次の記録',exact:true}).click();
    await expect(windows).toHaveCount(2);await expect(card(order[2]!)).toHaveAttribute('data-active','true');
    expect(await card(order[1]!).boundingBox()).toEqual(activeRect);expect(await other.boundingBox()).toEqual(otherRect);
    await expect(detail.getByRole('button',{name:'次の記録',exact:true})).toBeDisabled();
    await other.getByRole('button',{name:'閉じる',exact:true}).press('Enter');
    await detail.getByRole('button',{name:'前の記録',exact:true}).click();await expect(windows).toHaveCount(1);
    await expect(card(order[0]!)).toHaveAttribute('data-active','true');await expect(card(order[2]!)).toHaveCount(0);
    await chooseRecord(order[2]!);await expect(windows).toHaveCount(2);
    await p.screenshot({path:info.outputPath('ordinary-multiple-caption-windows.png')});
    await chooseRecord('確認点B');await chooseRecord('確認点A');
    const extra=windows.filter({hasText:'確認点C'});
    if(await extra.count())await extra.getByRole('button',{name:'閉じる',exact:true}).press('Enter');
    await windows.filter({hasText:'確認点B'}).getByRole('button',{name:'閉じる',exact:true}).focus();
    await expect(detail.getByLabel('タイトル',{exact:true})).toHaveValue('確認点A');
    await tools.getByRole('button',{name:'位置を調整',exact:true}).click();await expect(pin).toBeVisible();await pin.getByRole('button',{name:'取り消す',exact:true}).click();
    await tools.getByText('親モデルを変更',{exact:true}).click();const parent=tools.getByLabel('変更先モデル',{exact:true});await parent.focus();await parent.selectOption({label:'模型B.glb'});await tools.getByRole('button',{name:'位置を確認',exact:true}).click();await expect(pin.getByRole('button',{name:'親モデルと位置を確定',exact:true})).toBeEnabled();await pin.getByRole('button',{name:'取り消す',exact:true}).click();
    await detail.getByLabel('本文',{exact:true}).focus();const choosePhoto=p.waitForEvent('filechooser');await p.getByLabel('メディアを追加',{exact:true}).click();await(await choosePhoto).setFiles({name:'確認画像.png',mimeType:'image/png',buffer:smallPng()});await p.getByRole('region',{name:'キャプションの詳細',exact:true}).getByRole('button',{name:'変更を適用',exact:true}).click(); await ready('メディアを追加しました。');await p.screenshot({path:info.outputPath('list-and-detail.png'),fullPage:false});
    const before=await backup('before-camera');await gizmo.getByRole('button',{name:'Z',exact:true}).press('Enter');const z=gizmo.getByRole('button',{name:'Z',exact:true}),initialAxis=await z.getAttribute('style');
    const canvas=p.getByLabel('3Dモデルの表示',{exact:true}),captureCanvas=(name:string)=>canvas.screenshot({path:info.outputPath(name),scale:'device',style:'.lv-project-markers,.lv-development-pin-layer,.lv-caption-windows,.lv-caption-window-line,.lv-context-help-note{visibility:hidden!important}'});await drag(canvas,35,15);await expect(z).toHaveAttribute('aria-pressed','false');await z.press('Enter');
    const selectedTitle=await detail.getByLabel('タイトル',{exact:true}).inputValue(),rootPin=p.locator('.lv-project-marker').filter({hasText:'確認点A'});await drag(rootPin,25,15);await expect(z).toHaveAttribute('aria-pressed','false');await expect(detail.getByLabel('タイトル',{exact:true})).toHaveValue(selectedTitle);await z.press('Enter');
    const canvasPan=await rootPin.getAttribute('style');await drag(canvas,20,10,'right');await expect(rootPin).not.toHaveAttribute('style',canvasPan!);await z.press('Enter');
    const rootPan=await rootPin.getAttribute('style');await drag(rootPin,20,10,'right');await expect(rootPin).not.toHaveAttribute('style',rootPan!);await expect(detail.getByLabel('タイトル',{exact:true})).toHaveValue(selectedTitle);await z.press('Enter');
    await drag(gizmo.locator('.lv-camera-axes'),70,25);await expect(z).toHaveAttribute('aria-pressed','false');await expect(z).not.toHaveAttribute('style',initialAxis!);
    const marker=p.locator('.lv-project-marker').filter({hasText:'確認点A'}),oldLeft=await marker.getAttribute('style'),pan=gizmo.getByRole('button',{name:'平行移動',exact:true});await expect(pan).toBeEnabled();await drag(pan,35,-20);await expect(marker).not.toHaveAttribute('style',oldLeft!);await pan.press('ArrowRight');
    const projection=gizmo.getByLabel('投影方式',{exact:true});await projection.selectOption('orthographic');await expect(projection).toHaveValue('orthographic');await drag(gizmo.locator('.lv-camera-axes'),-30,15);await drag(pan,-15,15);await expect(projection).toHaveValue('orthographic');
    const after=await backup('after-camera');expect(after.identity).toEqual(before.identity);expect(after.changes).toEqual(before.changes);
    await revealCameraPositions(p);await p.getByRole('button',{name:'開始視点を記録',exact:true}).click();await ready('開始視点を記録しました。');await expect(p.getByRole('button',{name:'開始視点を更新',exact:true})).toBeEnabled();await expect(p.getByLabel('記録した視点',{exact:true})).toHaveCount(0);await p.locator('.lv-camera-positions > summary').click();
    await task('描画');const drawing=p.getByRole('region',{name:'材質',exact:true});await drawing.getByLabel('モデル',{exact:true}).selectOption({label:'模型A.glb'});const face=drawing.getByLabel('マテリアル',{exact:true});await face.selectOption((await face.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).find(Boolean)))!);await expect(drawing.getByRole('button',{name:'設定を編集',exact:true})).toBeHidden();await drawing.getByLabel('照明',{exact:true}).selectOption('unlit');
    const opacity=drawing.getByLabel('不透明度（%）',{exact:true}),advanced=drawing.locator('.lv-material-advanced');await advanced.locator(':scope > summary').click();
    const drawingLayout=async(name:string,columns:number)=>{
      const layout=await drawing.evaluate(root=>{
        const rect=(n:Element)=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
        const fields=root.querySelector('.lv-material-fields')!,target=root.querySelector('.lv-material-target')!,detail=root.querySelector('.lv-material-advanced')!;
        return{gridTemplateColumns:getComputedStyle(fields).gridTemplateColumns,target:rect(target),advanced:rect(detail),
          fields:[...fields.querySelectorAll(':scope > label')].map(n=>({label:n.querySelector('input,select')!.getAttribute('aria-label'),...rect(n.querySelector('input,select')!)})),
          actions:[...root.querySelectorAll('.lv-material-actions > button')].filter(n=>!n.hasAttribute('hidden')).map(n=>({name:n.textContent,background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color,...rect(n)})),
          scrollTop:root.querySelector('.lv-material-content')!.scrollTop};
      });
      await info.attach(name+'-layout',{body:JSON.stringify(layout),contentType:'application/json'});await p.screenshot({path:info.outputPath(name+'.png'),fullPage:false});
      // Verify visible occupied columns and full width, independently of CSS track serialization.
      expect(new Set(layout.fields.map(field=>Math.round(field.x))).size).toBe(columns);expect(layout.advanced.width).toBeCloseTo(layout.target.width,0);
      for(const field of layout.fields){expect(field.height).toBeGreaterThanOrEqual(44);expect(field.width).toBeGreaterThanOrEqual(44);}
      expect(Math.min(...layout.fields.map(field=>field.x))).toBeCloseTo(layout.target.x,0);expect(Math.max(...layout.fields.map(field=>field.x+field.width))).toBeCloseTo(layout.target.x+layout.target.width,0);
      if(columns===2){expect(layout.fields[0]!.y).toBe(layout.fields[1]!.y);expect(layout.fields[2]!.y).toBe(layout.fields[3]!.y);}
      for(const name of ['変更を適用','取り消す'])await expect(drawing.getByRole('button',{name,exact:true})).toBeInViewport({ratio:1});
    };
    await drawingLayout('drawing-normal-draft',2);await p.setViewportSize({width:390,height:844});await revealWorkPanel(p);await drawingLayout('drawing-narrow-draft',1);
    await expect(canvas).toBeVisible(); await expect(canvas).toHaveAttribute('aria-busy','false');
    const previewBox=(await canvas.boundingBox())!,panelBox=(await drawing.boundingBox())!;
    expect(previewBox.width).toBeGreaterThan(300); expect(previewBox.height).toBeGreaterThan(120);
    expect(panelBox.y).toBeGreaterThanOrEqual(previewBox.y+previewBox.height);
    await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const narrowOriginal=await captureCanvas('narrow-original-canvas.png'); await opacity.fill('45');
    await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    expect(await canvas.boundingBox()).toEqual(previewBox); expect(Buffer.compare(narrowOriginal,await captureCanvas('narrow-drawing-preview-canvas.png'))).not.toBe(0);
    await opacity.fill('100'); await expect(p.locator('.lv-project-stage canvas')).toHaveCount(1);
    await drawing.getByRole('button',{name:'取り消す',exact:true}).click();await drawing.getByRole('region',{name:'操作の確認',exact:true}).getByRole('button',{name:'変更を取り消す',exact:true}).click();await expect(drawing.getByLabel('照明',{exact:true})).toHaveValue('inherit');await expect(opacity).toHaveValue('100');
    await p.setViewportSize({width:1440,height:1000});await task('モデル');const modelPanel=p.getByRole('tabpanel',{name:'モデル',exact:true});
    await modelPanel.locator('.lv-model-select').filter({hasText:'模型A.glb'}).click();await modelPanel.getByRole('button',{name:'このモデルだけ表示',exact:true}).click();
    await expect(modelPanel.locator('.lv-model-row').filter({hasText:'模型B.glb'})).toContainText('一時的に非表示です。');
    await task('描画');await drawing.getByLabel('照明',{exact:true}).selectOption('unlit');await expect(drawing.getByLabel('照明',{exact:true})).toHaveValue('unlit');await expect(drawing.getByRole('button',{name:'変更を適用',exact:true})).toBeEnabled();await expect(opacity).toHaveValue('100');await expect(canvas).toHaveAttribute('aria-busy','false');await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const originalPixels=await captureCanvas('numeric-original-canvas.png'),originalExtent=await canvas.boundingBox(),r=(await opacity.boundingBox())!;
    await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2-40,r.y+r.height/2,{steps:10});await expect(opacity).toHaveValue('80');await expect(canvas).toHaveAttribute('aria-busy','false');await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const draggingPixels=await captureCanvas('numeric-held-canvas.png');expect(await canvas.boundingBox()).toEqual(originalExtent);expect(Buffer.compare(originalPixels,draggingPixels)).not.toBe(0);await p.screenshot({path:info.outputPath('numeric-preview-held.png')});await p.keyboard.press('Escape');await p.mouse.up();await expect(opacity).toHaveValue('100');await expect(canvas).toHaveAttribute('aria-busy','false');await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));expect(await canvas.boundingBox()).toEqual(originalExtent);expect(Buffer.compare(originalPixels,await captureCanvas('numeric-restored-canvas.png'))).toBe(0);await expect(drawing.getByRole('button',{name:'変更を適用',exact:true})).toBeEnabled();
    await drag(opacity,-60,0);await expect(opacity).toHaveValue('70');await expect(drawing.getByRole('button',{name:'変更を適用',exact:true})).toBeEnabled();
    await p.setViewportSize({width:1280,height:600});const apply=drawing.getByRole('button',{name:'変更を適用',exact:true});await expect(apply).toBeInViewport({ratio:1});await drawing.locator('.lv-material-content').evaluate(n=>{n.scrollTop=n.scrollHeight;});await expect(apply).toBeInViewport({ratio:1});await apply.click();await ready('材質の設定を適用しました。');await backup('drawing-applied');
    await p.setViewportSize({width:720,height:500});await task('キャプション');await tools.getByRole('button',{name:'位置を調整',exact:true}).click();
    if(!await canvas.isVisible())await p.getByRole('button',{name:'3D',exact:true}).click();
    await expect(pin).toBeVisible();const pinExtent=await canvas.boundingBox(),retry=p.getByRole('button',{name:'3D表示を再試行',exact:true});
    await canvas.evaluate(c=>new Promise<void>(resolve=>{const gl=(c as HTMLCanvasElement).getContext('webgl2')!,ext=gl.getExtension('WEBGL_lose_context');if(!ext)throw Error('Context-loss extension unavailable');(c as any).__testContextLoss=ext;c.addEventListener('webglcontextlost',()=>resolve(),{once:true});ext.loseContext();}));
    await expect(p.locator('.lv-project-viewport-status')).toContainText('3D表示を停止しました。');await expect(retry).toBeVisible();expect(await canvas.boundingBox()).toEqual(pinExtent);
    const hit=async(control:ReturnType<Page['locator']>)=>{await expect(control).toBeInViewport({ratio:1});expect(await control.evaluate(n=>{const r=n.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>=44&&r.height>=44&&(target===n||n.contains(target));})).toBe(true);};
    await hit(retry);await hit(pin.getByRole('button',{name:'取り消す',exact:true}));await hit(gizmo.getByRole('button',{name:'全体表示',exact:true}));
    await hit(windows.filter({hasText:'確認点B'}).getByRole('button',{name:'閉じる',exact:true}));await p.screenshot({path:info.outputPath('short-context-loss-pin.png')});
    await canvas.evaluate(c=>new Promise<void>(resolve=>{c.addEventListener('webglcontextrestored',()=>resolve(),{once:true});(c as any).__testContextLoss.restoreContext();}));await retry.click();await expect(retry).toBeHidden();await expect(canvas).toHaveAttribute('aria-busy','false');expect(await canvas.boundingBox()).toEqual(pinExtent);
    await hit(pin.getByRole('button',{name:'位置を確定',exact:true}));await hit(pin.getByRole('button',{name:'取り消す',exact:true}));await pin.getByRole('button',{name:'取り消す',exact:true}).click();
    await p.setViewportSize({width:1280,height:600});
    await p.reload();await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('記録とカメラの確認',{timeout:90_000});await expect(gizmo.getByRole('button',{name:'Z',exact:true})).toBeEnabled({timeout:90_000});await task('キャプション');await list.locator('.lv-caption-select').filter({hasText:'確認点A'}).click();await expect(detail.getByLabel('本文',{exact:true})).toHaveValue('一覧を見ながら確認する本文');await expect(list).toBeInViewport();
    await scale.locator(':scope > summary').click();await scale.getByLabel('ピンのモデル',{exact:true}).selectOption({label:'模型A.glb'});await expect(scale.getByLabel('ピンの表示倍率',{exact:true})).toHaveValue('1.5');await scale.locator(':scope > summary').click();expect(await p.locator('.lv-project-marker').filter({hasText:'確認点A'}).evaluate(n=>getComputedStyle(n,'::before').transform)).toContain('matrix(1.5');
    await task('描画');await drawing.getByLabel('モデル',{exact:true}).selectOption({label:'模型A.glb'});await face.selectOption((await face.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).find(Boolean)))!);await expect(opacity).toHaveValue('70');await task('キャプション');
    await revealCameraPositions(p);await expect(p.getByRole('button',{name:'開始視点を更新',exact:true})).toBeEnabled();await expect(p.getByLabel('記録した視点',{exact:true})).toHaveCount(0);await p.locator('.lv-camera-positions > summary').click();
    await list.locator('li').filter({hasText:'確認点B'}).getByRole('button',{name:'削除',exact:true}).click();const deletion=p.getByRole('region',{name:'削除の確認',exact:true});await expect(deletion).toBeVisible();await expect(deletion.getByRole('button',{name:'取り消す',exact:true})).toBeFocused();await deletion.getByRole('button',{name:'取り消す',exact:true}).click();await expect(p.getByRole('searchbox',{name:'検索',exact:true})).toBeFocused();await expect(list.locator('li')).toHaveCount(3);await list.locator('li').filter({hasText:'確認点B'}).getByRole('button',{name:'削除',exact:true}).click();await deletion.getByRole('button',{name:'削除する',exact:true}).click();await ready('プロジェクトから削除しました。');await expect(list.locator('li')).toHaveCount(2);await expect(p.getByRole('searchbox',{name:'検索',exact:true})).toBeFocused();await backup('after-delete');await p.reload();await expect(list.locator('li')).toHaveCount(2,{timeout:90_000});
    await p.screenshot({path:info.outputPath('reopened-short.png'),fullPage:false});
    expect(errors).toEqual([]);expect(remote).toEqual([]);
  }catch(error){await p.screenshot({path:info.outputPath('failure.png'),fullPage:false});throw error;}
  finally{await browser.close();await server.stop();}
});
