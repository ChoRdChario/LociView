import {test,expect,chromium,type Page} from '@playwright/test';
import {nativeConversionBackup,texturedTriangleGlb,smallPng} from './fixtures';
import {makeNativeDraft,snapshotFromDraft} from '../nativeGs/nativeTestProject';
import {ZipWriter,Uint8ArrayReader,Uint8ArrayWriter} from '@zip.js/zip.js';
import {createHash} from 'node:crypto';
import {inspectNativePortablePackageV1} from '../../src/nativeGs/portablePackage';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';

const canvasName='3DモデルとGaussian Splattingのプロジェクト';
async function shortProfile(name:string) {
  const root=join(process.cwd(),'.artifacts/e2e/profiles');await mkdir(root,{recursive:true});return mkdtemp(join(root,`${name}-`));
}
async function sample(page:Page) {
  return page.getByLabel(canvasName,{exact:true}).evaluate((canvas:HTMLCanvasElement)=>new Promise<number[]>(done=>requestAnimationFrame(()=>{
    const gl=canvas.getContext('webgl2')!,out=new Uint8Array(4);gl.readPixels(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);done([...out]);
  })));
}
test('Native材質付きバックアップを直接編集し、実context復旧と保存後の再開で対象キーを保持する',async({},info)=>{
  const context=await chromium.launchPersistentContext(info.outputPath('native-profile'),{channel:'chromium',headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
  context.setDefaultTimeout(15_000);
  const errors:string[]=[];let page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto('/');
    const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
    await (await choosing).setFiles({name:'native-appearance.zip',mimeType:'application/zip',buffer:await nativeConversionBackup(texturedTriangleGlb(),smallPng(),2,true)});
    await page.getByRole('button',{name:'この端末に復元',exact:true}).click();
    await page.getByRole('button',{name:'編集して開く',exact:true}).click();
    const canvas=page.getByLabel(canvasName,{exact:true});await expect(canvas).toBeVisible();
    await expect(page.getByText('モデルを読み込みました。表示切替とキャプション編集を利用できます。',{exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'マテリアル',exact:true}).click();
    await page.getByLabel('マテリアルを調整するモデル',{exact:true}).selectOption({label:'建物'});
    const slot=page.getByLabel('調整するマテリアル',{exact:true});await expect(slot).toHaveValue(/:m\/0\/0$/);
    await expect(page.getByLabel('両面表示',{exact:true})).toBeChecked();
    await page.getByLabel('両面表示',{exact:true}).uncheck();
    const view=await canvas.boundingBox();const initialFrame=createHash('sha256').update(await canvas.screenshot()).digest('hex');
    await page.mouse.move(view!.x+view!.width*.7,view!.y+view!.height*.65);await page.mouse.down();
    await page.mouse.move(view!.x+view!.width*.7+40,view!.y+view!.height*.65+15,{steps:6});await page.mouse.up();
    await expect.poll(async()=>createHash('sha256').update(await canvas.screenshot()).digest('hex')).not.toBe(initialFrame);
    const before=await sample(page);expect(before[3]).toBe(255);expect(before[0]).toBeGreaterThan(100);expect(before[1]).toBeGreaterThan(100);
    await canvas.evaluate((node:HTMLCanvasElement)=>{const ext=node.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
      (globalThis as any).__restoreNativeContext=()=>ext.restoreContext();ext.loseContext();});
    await expect(page.getByText('3D表示の接続が切れました。接続の回復後に表示を復旧します。',{exact:true})).toBeVisible();
    await page.evaluate(()=>(globalThis as any).__restoreNativeContext());
    await expect(page.getByText('3D表示を復旧しました。',{exact:true})).toBeVisible();
    await expect(slot).toHaveValue(/:m\/0\/0$/);await expect(page.getByLabel('両面表示',{exact:true})).not.toBeChecked();
    expect(await sample(page)).toEqual(before);
    await page.getByRole('button',{name:'端末に保存',exact:true}).click();
    await expect(page.getByText('プロジェクトを保存しました。',{exact:true})).toBeVisible();
    await page.reload();await page.getByRole('button',{name:'編集して開く',exact:true}).click();
    await page.getByRole('tab',{name:'マテリアル',exact:true}).click();await page.getByLabel('マテリアルを調整するモデル',{exact:true}).selectOption({label:'建物'});
    await expect(page.getByLabel('調整するマテリアル',{exact:true})).toHaveValue(/:m\/0\/0$/);
    await expect(page.getByLabel('両面表示',{exact:true})).not.toBeChecked();
    await page.screenshot({path:info.outputPath('native-recovered.png'),fullPage:true});expect(errors).toEqual([]);
  } catch(error) {await info.attach('failure page',{body:await page.locator('body').innerText(),contentType:'text/plain'});await page.screenshot({path:info.outputPath('failure.png'),fullPage:true});throw error;}
  finally {await context.close();}
});

async function sparkBackup() {
  const {draft,sources}=makeNativeDraft(),snapshot=snapshotFromDraft(draft),bytes=new Map<string,Uint8Array>();
  for(const rep of snapshot.representations) {
    const data=new Uint8Array(await new Response(sources.get(rep.id)!.stream()).arrayBuffer());bytes.set(rep.id,data);
    Object.assign(rep,{blob:{...rep.blob,digest:createHash('sha256').update(data).digest('hex'),byteLength:data.length}});
  }
  const body=Buffer.from(JSON.stringify(snapshot)),manifest={format:'lociview-native-portable-backup',packageVersion:1,
    nativeSnapshot:{schemaVersion:1,projectId:snapshot.project.id,snapshotId:snapshot.snapshotId,generation:snapshot.generation,entry:'native/snapshot.json',byteLength:body.length,algorithm:'sha256',digest:createHash('sha256').update(body).digest('hex')},
    representations:snapshot.representations.map(r=>({representationId:r.id,entry:`native/representations/${r.id}.bin`,...r.blob}))};
  const writer=new ZipWriter(new Uint8ArrayWriter()),add=(name:string,data:Uint8Array)=>writer.add(name,new Uint8ArrayReader(data),{level:0});
  await add('native/package.json',Buffer.from(JSON.stringify(manifest)));await add('native/snapshot.json',body);
  for(const rep of manifest.representations)await add(rep.entry,bytes.get(rep.representationId)!);
  const result=Buffer.from(await writer.close());await inspectNativePortablePackageV1(new File([result],'native-spark.zip'));return result;
}
test('既存Native Spark2.1は186でGS pixel・表示切替・位置指定・解放後再開を維持する',async({},info)=>{
  const context=await chromium.launchPersistentContext(await shortProfile('spark'),{channel:'chromium',headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'allow'});
  context.setDefaultTimeout(15_000);const page=context.pages()[0]??await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto('/');const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
    await (await choosing).setFiles({name:'native-spark.zip',mimeType:'application/zip',buffer:await sparkBackup()});
    await page.getByRole('button',{name:'GSのオフライン表示を準備',exact:true}).click();
    await expect(page.getByText('GSをオフラインで利用する準備ができました。',{exact:true})).toBeVisible({timeout:60_000});
    await page.getByRole('button',{name:'この端末に復元',exact:true}).click();await page.getByRole('button',{name:'編集して開く',exact:true}).click();
    await expect(page.getByText('モデルを読み込みました。表示切替とキャプション編集を利用できます。',{exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'モデル',exact:true}).click();await page.getByLabel('一括表示',{exact:true}).selectOption('gs-only');
    await page.getByRole('button',{name:'全体表示',exact:true}).click();
    await expect.poll(async()=>(await sample(page)).slice(0,3)).not.toEqual([16,23,37]);const lit=await sample(page);expect(lit[3]).toBe(255);
    await page.getByLabel('一括表示',{exact:true}).selectOption('mesh-only');await expect.poll(()=>sample(page)).not.toEqual(lit);const mesh=await sample(page);
    await page.getByLabel('一括表示',{exact:true}).selectOption('gs-only');await expect.poll(()=>sample(page)).toEqual(lit);
    await page.getByRole('tab',{name:'視点',exact:true}).click();await page.getByRole('tabpanel',{name:'視点',exact:true}).getByRole('button',{name:'+Z',exact:true}).click();
    await page.getByRole('tab',{name:'キャプション',exact:true}).click();await page.getByRole('button',{name:'キャプションを追加',exact:true}).click();
    const canvas=page.getByLabel(canvasName,{exact:true}),box=(await canvas.boundingBox())!;
    const distance=.5*1.25/Math.sin(48*Math.PI/360),scale=box.height/(2*Math.tan(48*Math.PI/360)*distance);
    const hit={x:box.width/2-.375*scale,y:box.height/2-.375*scale};
    await canvas.click({position:hit,modifiers:['Shift']});
    await expect(page.getByText('キャプションを追加しました。タイトルと本文を編集し、プロジェクトを保存してください。',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'移動を終了',exact:true}).click();
    await page.getByRole('button',{name:'このキャプションを閉じる',exact:true}).click();await canvas.click({position:hit});
    await expect(page.getByText('キャプションを選択しました：キャプション',{exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'モデル',exact:true}).click();await page.getByRole('button',{name:'全体表示',exact:true}).click();
    await page.getByRole('button',{name:'端末に保存',exact:true}).click();await expect(page.getByText('プロジェクトを保存しました。',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'ヘルプ',exact:true}).click();await page.getByText('困ったとき',{exact:true}).click();
    await page.getByRole('button',{name:'GSを解放',exact:true}).click();await expect.poll(()=>sample(page)).not.toEqual(lit);
    await page.reload();await page.getByRole('button',{name:'編集して開く',exact:true}).click();
    await expect(page.getByText('モデルを読み込みました。表示切替とキャプション編集を利用できます。',{exact:true})).toBeVisible();await expect.poll(()=>sample(page)).toEqual(lit);
    await info.attach('actual Native Spark pixel',{body:JSON.stringify({lit,mesh,version:'2.1.0',headless:true}),contentType:'application/json'});expect(errors).toEqual([]);
  } catch(error) {
    const response=await page.request.get('/sw.js');await info.attach('Service Worker registration diagnostics',{body:JSON.stringify({errors,script:{status:response.status(),headers:response.headers(),sha256:createHash('sha256').update(await response.body()).digest('hex')}}),contentType:'application/json'});
    await info.attach('Spark preparation diagnostics',{body:JSON.stringify(await page.evaluate(async()=>({
      workers:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state,installing:r.installing?.state,waiting:r.waiting?.state})),
      caches:await Promise.all((await caches.keys()).map(async name=>({name,keys:(await (await caches.open(name)).keys()).map(r=>r.url)}))),
      resources:performance.getEntriesByType('resource').filter(r=>/spark|sw\.js/.test(r.name)).map(r=>({url:r.name.slice(0,200),duration:r.duration})),
    }))),contentType:'application/json'});
    await info.attach('failure page',{body:await page.locator('body').innerText(),contentType:'text/plain'});await page.screenshot({path:info.outputPath('failure.png'),fullPage:true});throw error;}
  finally {await context.close();}
});
