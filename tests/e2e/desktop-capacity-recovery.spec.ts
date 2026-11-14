import {test,createBrowserProfile} from '../helpers/browserProfile';
import {expect,chromium,type BrowserContext,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import * as A from '@automerge/automerge';
import {ownedServer} from '../offline-e2e/server';
import {nativeConversionBackup,smallPng,triangleGlb} from './fixtures';
import {revealCaptionList,revealCoordinateAdd,revealWorkPanel,revealFileSurface} from './workspaceUi';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {inspectProjectCandidates} from '../../src/domain/projectCandidates';
import {validationMetadataLimits} from '../../src/projectFiles/validation';

// Inject only the native failure. Everything after it uses the ordinary command,
// OPFS, archive inspection and download boundaries; no product test hook exists.
async function installQuotaProbe(context:BrowserContext){
  await context.addInitScript(()=>{
    const paths=new WeakMap<object,string>(),fault={kind:'',hits:[] as string[]};
    (window as any).__capacityFault=fault;
    const directory=FileSystemDirectoryHandle.prototype.getDirectoryHandle;
    FileSystemDirectoryHandle.prototype.getDirectoryHandle=async function(name,options){
      const handle=await directory.call(this,name,options);paths.set(handle,(paths.get(this)??'')+'/'+name);return handle;
    };
    const file=FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle=async function(name,options){
      const handle=await file.call(this,name,options);paths.set(handle,(paths.get(this)??'')+'/'+name);return handle;
    };
    const writable=FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable=async function(options){
      const path=paths.get(this)??this.name;
      if(fault.kind==='edit'&&path.endsWith('/published.json')||fault.kind==='output'&&/\/artifacts\/[^/]+\.zip$/.test(path)){
        fault.hits.push(path);throw new DOMException('Native quota exhausted','QuotaExceededError');
      }
      return writable.call(this,options);
    };
  });
}
for(const touch of [false,true])test(`native capacity recovery retains drafts and output through cold reopening (${touch?'touch':'PC'})`,async({},info)=>{
  test.setTimeout(180_000);A.getHeads(A.init());
  const profile=await createBrowserProfile('capacity'),server=await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT??'offline-desktop-dist');
  const errors:string[]=[],remote:string[]=[],measurements:Record<string,number>={};let context:BrowserContext|undefined;
  const launch=async()=>{
    context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch,isMobile:touch,serviceWorkers:'block',acceptDownloads:true});
    await installQuotaProbe(context);await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===new URL(server.url).origin||['blob:','data:'].includes(url.protocol))return route.continue();remote.push(url.href);return route.abort();});
    const p=context.pages()[0]??await context.newPage();p.setDefaultTimeout(15_000);p.on('pageerror',e=>errors.push(e.message));await p.goto(server.url);return p;
  };
  const fault=async(p:Page,kind:string)=>p.evaluate(value=>{(window as any).__capacityFault.kind=value;},kind);
  try{
    const p=await launch();await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'容量確認.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});
    await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('容量から復旧');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
    if(touch)await p.getByRole('button',{name:'3D',exact:true}).click();
    await expect(p.getByLabel('3Dモデルの表示',{exact:true})).toHaveAttribute('aria-busy','false',{timeout:90_000});await revealWorkPanel(p);await revealCoordinateAdd(p);
    const model=p.getByLabel('追加先モデル',{exact:true});await model.focus();await model.selectOption({label:'容量確認.glb'});
    await p.getByRole('button',{name:'このモデルに追加',exact:true}).click();for(const axis of ['X','Y','Z'])await p.getByLabel('位置 '+axis,{exact:true}).fill(axis==='Y'?'.5':'0');
    await p.getByRole('button',{name:'ここに記録を作る',exact:true}).click();const detail=p.getByRole('region',{name:'キャプションの詳細',exact:true});
    await expect(detail.getByLabel('本文',{exact:true})).toBeEnabled();await detail.getByLabel('タイトル',{exact:true}).fill('保持する記録');await detail.getByLabel('本文',{exact:true}).fill('容量不足でも失わない本文');
    await fault(p,'edit');let started=Date.now();await detail.getByRole('button',{name:'変更を適用',exact:true}).click();
    const retry=p.getByRole('button',{name:'更新を再試行',exact:true});await expect(retry).toBeEnabled();await expect(p.locator('.lv-project-workspace > header > .lv-operation-status')).toContainText('保存容量が不足');
    const detailStatus=detail.getByRole('status').filter({hasText:'未適用の入力'});await expect(detailStatus).toContainText('保存容量が不足');expect((await detailStatus.innerText()).split('保存容量が不足しています。')).toHaveLength(2);await expect(detailStatus).not.toContainText('Native quota exhausted');
    measurements.editFailureMs=Date.now()-started;await expect(detail.getByLabel('本文',{exact:true})).toHaveValue('容量不足でも失わない本文');await p.screenshot({path:info.outputPath('quota-edit.png'),fullPage:true});
    await fault(p,'');started=Date.now();await retry.click();
    await expect(retry).toBeHidden().catch(async error=>{await info.attach('edit-retry-diagnostic',{body:JSON.stringify({text:await p.locator('body').innerText(),fault:await p.evaluate(()=>(window as any).__capacityFault),errors}),contentType:'application/json'});throw error;});measurements.editRecoveryMs=Date.now()-started;
    await revealFileSurface(p,'保存');const files=p.getByRole('region',{name:'ファイル',exact:true});
    const [previous]=await Promise.all([p.waitForEvent('download'),files.locator('.lv-file-primary').click()]);
    await previous.saveAs(info.outputPath('retained-before-cleanup.zip'));
    await files.getByLabel('保存名（任意）',{exact:true}).fill('保持する保存名');await fault(p,'output');
    started=Date.now();await files.locator('.lv-file-primary').click();await expect(files.locator('.lv-operation-status')).toContainText('保存容量が不足');await expect(files.getByRole('button',{name:'生成を再開',exact:true})).toBeEnabled();measurements.outputFailureMs=Date.now()-started;
    await expect(files.getByLabel('保存名（任意）',{exact:true})).toHaveValue('保持する保存名');await p.screenshot({path:info.outputPath('quota-output.png'),fullPage:true});
    await fault(p,'');
    // Owned unacknowledged output only: represent a drained partial native write.
    await p.evaluate(async()=>{
      const path=((window as any).__capacityFault.hits as string[]).find(value=>/\/artifacts\/[^/]+\.zip$/.test(value))!;
      if(!/^\/lociview-development-validation-1\/[0-9a-f]{32}\/v2\/packages\/backup-output\/[0-9a-f]{32}\/artifacts\/[0-9a-f]{32}\.zip$/.test(path))throw Error('Unexpected owned output path');
      const parts=path.split('/').filter(Boolean),name=parts.pop()!;let directory=await navigator.storage.getDirectory();
      for(const part of parts)directory=await directory.getDirectoryHandle(part);
      const file=await directory.getFileHandle(name),writer=await file.createWritable(),chunk=new Uint8Array(4*1024*1024);
      await writer.write(chunk);await writer.write(chunk);await writer.close();
      (window as any).__cleanupAttempt={path,size:(await file.getFile()).size};
    });
    // A real shared Web Lock protects an observing tab; cleanup cannot pass it.
    const reader=await context!.newPage();await reader.goto(server.url);
    await reader.evaluate(()=>new Promise<void>(ready=>{
      (window as any).__outputReader=navigator.locks.request('lociview:output-artifacts:v1',{mode:'shared'},()=>new Promise<void>(release=>{(window as any).__releaseOutputReader=release;ready();}));
    }));
    await files.getByRole('button',{name:'一時ファイルを整理',exact:true}).click();
    await expect(files.locator('.lv-operation-status')).toHaveText('一時ファイルを確認しています。');
    await expect.poll(()=>p.evaluate(async()=> (await navigator.locks.query()).pending?.some(lock=>lock.name==='lociview:output-artifacts:v1'&&lock.mode==='exclusive'))).toBe(true);
    await reader.evaluate(()=>{(window as any).__releaseOutputReader();return(window as any).__outputReader;});await reader.close();
    await expect(files.locator('.lv-operation-status')).toContainText('1ファイル');
    await expect(files.locator('.lv-operation-status')).toContainText('8.4 MB');
    expect(await p.evaluate(async()=>{
      const {path,size}=(window as any).__cleanupAttempt,parts=path.split('/').filter(Boolean),name=parts.pop();let directory=await navigator.storage.getDirectory();
      for(const part of parts)directory=await directory.getDirectoryHandle(part);
      try{await directory.getFileHandle(name);return false;}catch(error){return error instanceof DOMException&&error.name==='NotFoundError'&&size===8*1024*1024;}
    })).toBe(true);
    await expect(files.getByRole('button',{name:'一時ファイルを整理',exact:true})).toBeEnabled();
    await p.screenshot({path:info.outputPath('temporary-output-cleaned.png'),fullPage:true});
    await expect(files.getByLabel('保存名（任意）',{exact:true})).toHaveValue('保持する保存名');
    started=Date.now();const [download]=await Promise.all([p.waitForEvent('download'),files.getByRole('button',{name:'生成を再開',exact:true}).click()]);measurements.outputRecoveryToDownloadMs=Date.now()-started;
    const saved=info.outputPath('capacity-recovered.zip');await download.saveAs(saved);expect(await download.failure()).toBeNull();const archive=await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(saved)).buffer]),validationMetadataLimits);
    const inspected=await inspectProjectCandidates(archive.source.read(),validationMetadataLimits);expect(inspected.kind).toBe('project-candidate-inspection');if(inspected.kind!=='project-candidate-inspection')throw Error('Saved records');
    const captions=inspected.unambiguousRecords?.captionsById;if(!captions||typeof captions!=='object'||Array.isArray(captions))throw Error('Saved Caption map');
    expect(Object.values(captions)).toEqual([expect.objectContaining({title:'保持する記録',body:'容量不足でも失わない本文'})]);
    await expect(files.getByLabel('保存名（任意）',{exact:true})).toHaveValue('');
    const close=p.locator('details.lv-project-files').getByRole('button',{name:'閉じる',exact:true});await expect(close).toBeEnabled();await close.click();
    await expect(p.locator('details.lv-project-files')).toHaveJSProperty('open',false);
    await expect(p.getByRole('region',{name:'ファイル操作',exact:true})).toBeHidden();
    const hits=await p.evaluate(()=>(window as any).__capacityFault.hits as string[]);expect(hits.some(path=>path.endsWith('/published.json'))).toBe(true);expect(hits.some(path=>path.includes('/artifacts/'))).toBe(true);
    await context!.close();context=undefined;const cold=await launch();await expect(cold.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('容量から復旧',{timeout:90_000});await revealWorkPanel(cold);
    await cold.locator('.lv-caption-select').filter({hasText:'保持する記録'}).click();await expect(cold.getByRole('region',{name:'キャプションの詳細',exact:true}).getByLabel('本文',{exact:true})).toHaveValue('容量不足でも失わない本文');
    expect(errors).toEqual([]);expect(remote).toEqual([]);await info.attach('capacity-measurements',{body:JSON.stringify({measurements,hits,browser:await cold.evaluate(()=>navigator.userAgent),touchEmulated:touch,physicalDevice:false}),contentType:'application/json'});
  }finally{await context?.close();await server.stop();}
});

test('renderer crashes before writing, before publication and immediately after success preserve the confirmed text exactly once', async ({}, info) => {
  A.getHeads(A.init());
  const server = await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT ?? 'desktop-dist');
  const receiver = await createBrowserProfile('restored-text');
  let context: BrowserContext | undefined;
  const open = async (profile: string, suffix = '') => {
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', serviceWorkers: 'block', acceptDownloads: true });
    const page = context.pages()[0]!;
    await page.goto(server.url + suffix);
    return page;
  };
  const backup = async (page: Page, name: string) => {
    await revealFileSurface(page, '保存');
    const [file] = await Promise.all([page.waitForEvent('download'),
      page.getByRole('region', { name: 'ファイル', exact: true }).locator('.lv-file-primary').click()]);
    const path = info.outputPath(name + '.zip');
    await file.saveAs(path); expect(await file.failure()).toBeNull();
    return BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]), validationMetadataLimits);
  };
  const text = '強制終了しても一度だけ残る本文', detail = (page: Page) => page.getByRole('region', { name: 'キャプションの詳細', exact: true });
  const record = async (page: Page) => {
    await revealCaptionList(page);
    await page.locator('.lv-caption-select').filter({ hasText: '既存のピン' }).click();
    return detail(page).getByLabel('本文', { exact: true });
  };
  const crash = async (page: Page) => {
    const protocol = await context!.newCDPSession(page), crashed = page.waitForEvent('crash');
    void protocol.send('Page.crash').catch(() => {});
    await crashed;
    await context!.close();
  };
  const crashAt = async (page: Page, fileName: string) => {
    const signal = page.waitForEvent('console', msg => msg.text() === 'text write paused');
    await page.evaluate(fileName => {
      const openFile = FileSystemDirectoryHandle.prototype.getFileHandle;
      FileSystemDirectoryHandle.prototype.getFileHandle = async function(name, options) {
        if (options?.create && name === fileName) {
          console.info('text write paused');
          await new Promise<void>(() => {});
        }
        return openFile.call(this, name, options);
      };
    }, fileName);
    await detail(page).getByRole('button', { name: '変更を適用', exact: true }).click();
    await signal;
    await crash(page);
  };
  try {
    const author = await open(await createBrowserProfile('author'));
    await author.getByLabel('ファイルを選択', { exact: true }).setInputFiles({
      name: '記録.zip', mimeType: 'application/zip', buffer: await nativeConversionBackup(triangleGlb(), smallPng()) });
    await author.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await author.getByRole('button', { name: '新しいプロジェクトに変換', exact: true }).click();
    await expect(author.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled();
    const before = await backup(author, 'before');
    await context!.close();
    const page = await open(receiver);
    await page.getByLabel('ファイルを選択', { exact: true }).setInputFiles(info.outputPath('before.zip'));
    await page.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await page.getByRole('button', { name: 'このファイルから再開', exact: true }).click();
    // Restore can already offer read-only captions while the editor is being
    // prepared. Exercise the crash only after this specific operation closes.
    const restoredProject = page.getByRole('heading', { name: 'プロジェクト名', exact: true });
    await expect(restoredProject).toHaveText('Nativeから引き継ぐ記録', { timeout: 120_000 });
    await expect(page.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled();
    const field = await record(page);
    await expect(field).toHaveValue('本文を保持');
    await field.fill('最初の書き込み前に終了する文章');
    await crashAt(page, 'staging.json');
    const run = (before.source.proof.identity.projectId as string).slice(4);
    const afterPreparation = await open(receiver, '?run=' + run);
    const enter = afterPreparation.getByRole('button', { name: '編集する', exact: true });
    await expect(afterPreparation.locator('.lv-caption-select').filter({ hasText: '既存のピン' })).toBeVisible();
    if (await enter.isVisible()) await enter.click();
    const previous = await record(afterPreparation);
    await expect(previous).toHaveValue('本文を保持');
    await previous.fill(text);
    await crashAt(afterPreparation, 'published.json');
    const resume = await open(receiver, '?run=' + run);
    const retry = resume.getByRole('button', { name: '更新を再試行', exact: true });
    const edit = resume.getByRole('button', { name: '編集する', exact: true });
    await expect(retry.or(edit).filter({visible:true}).first()).toBeVisible();
    if (await edit.isVisible()) await edit.click();
    await retry.click();
    await expect(await record(resume)).toHaveValue(text);
    const after = await backup(resume, 'after');
    expect(after.source.proof).toEqual(before.source.proof);
    const originals = before.source.originalChanges(), changes = after.source.originalChanges();
    expect(changes).toHaveLength(originals.length + 1);
    expect(changes).toEqual(expect.arrayContaining(originals));
    expect(after.archive.control.manifest.blobs).toEqual(before.archive.control.manifest.blobs);
    for (const entry of before.archive.control.entries.filter(e => e.path.startsWith('blobs/'))) {
      expect(await after.archive.entryBlob(entry.path).arrayBuffer()).toEqual(await before.archive.entryBlob(entry.path).arrayBuffer());
    }
    const confirmed = '完了表示の直後に終了しても残る本文';
    await (await record(resume)).fill(confirmed);
    await detail(resume).getByRole('button', { name: '変更を適用', exact: true }).click();
    await expect(resume.getByText('変更を適用しました。', { exact: true })).toBeVisible();
    await crash(resume);
    const cold = await open(receiver, '?run=' + run);
    const row = cold.locator('.lv-caption-select').filter({hasText: '既存のピン'});
    await expect(row).toBeVisible();
    const enterEdit = cold.getByRole('button',{name:'編集する',exact:true});
    if (await enterEdit.isVisible()) await enterEdit.click();
    await expect(await record(cold)).toHaveValue(confirmed);
    const reopened = await backup(cold, 'reopened');
    expect(reopened.source.originalChanges()).toEqual(expect.arrayContaining(changes));
    expect(reopened.source.originalChanges()).toHaveLength(changes.length + 1);
    expect(reopened.archive.control.manifest.blobs).toEqual(before.archive.control.manifest.blobs);
  } finally { await context?.close(); await server.stop(); }
});
