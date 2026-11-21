import {test,createBrowserProfile} from '../helpers/browserProfile';
import {expect,chromium,type BrowserContext,type Page} from '@playwright/test';
import {appendFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as A from '@automerge/automerge';
import {ownedServer} from '../offline-e2e/server';
import {nativeConversionBackup,smallPng,triangleGlb} from './fixtures';
import { chooseHomeFiles, finishCaptionEditing, revealCaptionList,revealCoordinateAdd,revealWorkPanel,revealFileSurface } from './workspaceUi';
import {BackupArchive} from '../../src/projectPackage/backupArchive';
import {inspectProjectCandidates} from '../../src/domain/projectCandidates';
import {validationMetadataLimits} from '../../src/projectFiles/validation';
import {closeFileSurface} from './workspaceUi';

const readLocalTimings = (page: Page, start = 0) => page.evaluate(start => performance.getEntriesByType('measure')
  .filter(entry => entry.name.startsWith('lociview.') && entry.startTime >= start)
  .map(entry => ({ ...entry.toJSON(), detail: (entry as PerformanceMeasure).detail })), start);

const projectFiles = (page: Page, run: string) => page.evaluate(async run => {
  let root = await navigator.storage.getDirectory();
  for (const name of ['lociview-development-validation-1', run]) root = await root.getDirectoryHandle(name);
  const files: { path: string; size: number; sha256: string }[] = [];
  const visit = async (directory: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, handle] of (directory as any).entries()) {
      const path = prefix + name;
      if (handle.kind === 'directory') await visit(handle, path + '/');
      else {
        const file = await handle.getFile(), hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        files.push({ path, size: file.size, sha256: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') });
      }
    }
  };
  await visit(root, ''); return files.sort((a, b) => a.path.localeCompare(b.path));
}, run);

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
    const p=await launch();await chooseHomeFiles(p, {name:'容量確認.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});
    await p.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('容量から復旧');await p.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();
    if(touch)await p.getByRole('button',{name:'3D',exact:true}).click();
    await expect(p.getByLabel('3Dモデルの表示',{exact:true})).toHaveAttribute('aria-busy','false',{timeout:90_000});await revealWorkPanel(p);await revealCoordinateAdd(p);
    const model=p.getByLabel('追加先モデル',{exact:true});await model.focus();await model.selectOption({label:'容量確認.glb'});
    await p.getByRole('button',{name:'このモデルに追加',exact:true}).click();for(const axis of ['X','Y','Z'])await p.getByLabel('位置 '+axis,{exact:true}).fill(axis==='Y'?'.5':'0');
    await p.getByRole('button',{name:'ここに記録を作る',exact:true}).click();const detail=p.getByRole('region',{name:'記録の詳細',exact:true});
    await expect(detail.getByLabel('タイトル',{exact:true})).toBeEditable();await fault(p,'edit');let started=Date.now();
    await detail.getByLabel('タイトル',{exact:true}).fill('保持する記録');await detail.getByLabel('本文',{exact:true}).fill('容量不足でも失わない本文');
    const retry=detail.getByRole('button',{name:'保存を再試行',exact:true});await expect(retry).toBeEnabled();
    const detailStatus=detail.locator('[data-save-state="failed"]');await expect(detailStatus).toContainText('保存容量が不足');expect((await detailStatus.innerText()).split('保存容量が不足しています。')).toHaveLength(2);await expect(detailStatus).not.toContainText('Native quota exhausted');
    measurements.editFailureMs=Date.now()-started;await expect(detail.getByLabel('本文',{exact:true})).toHaveValue('容量不足でも失わない本文');await p.screenshot({path:info.outputPath('quota-edit.png'),fullPage:true});
    await fault(p,'');started=Date.now();await retry.click();
    await expect(retry).toBeHidden().catch(async error=>{await info.attach('edit-retry-diagnostic',{body:JSON.stringify({text:await p.locator('body').innerText(),fault:await p.evaluate(()=>(window as any).__capacityFault),errors}),contentType:'application/json'});throw error;});
    await finishCaptionEditing(p,{body:'容量不足でも失わない本文'});measurements.editRecoveryMs=Date.now()-started;
    await revealFileSurface(p,'保存');const files=p.getByRole('region',{name:'ファイル',exact:true});
    const [previous]=await Promise.all([p.waitForEvent('download'),files.locator('.lv-file-primary').click()]);
    await previous.saveAs(info.outputPath('retained-before-cleanup.zip'));
    await files.getByLabel('保存名（任意）',{exact:true}).fill('保持する保存名');await fault(p,'output');
    started=Date.now();await files.locator('.lv-file-primary').click();await expect(files.locator('.lv-operation-status')).toContainText('保存容量が不足');await expect(files.getByRole('button',{name:'生成を再開',exact:true})).toBeEnabled();measurements.outputFailureMs=Date.now()-started;
    await expect(files.locator('.lv-failure-details:visible')).toHaveCount(1);
    await expect(p.locator('.lv-project-shell > .lv-failure-details')).toBeHidden();
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
    await files.locator('details').filter({has: p.getByText('メンテナンス',{exact:true})}).locator(':scope > summary').click();
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
    await cold.locator('.lv-caption-select').filter({hasText:'保持する記録'}).click();await expect(cold.getByRole('region',{name:'記録の詳細',exact:true}).getByLabel('本文',{exact:true})).toHaveValue('容量不足でも失わない本文');
    expect(errors).toEqual([]);expect(remote).toEqual([]);await info.attach('capacity-measurements',{body:JSON.stringify({measurements,hits,browser:await cold.evaluate(()=>navigator.userAgent),touchEmulated:touch,physicalDevice:false}),contentType:'application/json'});
  }finally{await context?.close();await server.stop();}
});

// Isolate06l from the earlier prepared-photo/output fault sequence below.
// A fixed existing backup can be supplied for matched artifact comparisons.
for (const touch of [false, true]) test(`06l restored unprepared edit resolves, exports and independently reopens (${touch ? 'touch' : 'desktop'})`, async ({}, info) => {
  A.getHeads(A.init()); const server = await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT ?? 'desktop-dist');
  let context: BrowserContext | undefined;
  const errors: string[] = [];
  const open = async (profile: string, run?: string) => {
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', serviceWorkers: 'block', acceptDownloads: true,
      viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, isMobile: touch, hasTouch: touch });
    context.setDefaultTimeout(15_000);
    const page = context.pages()[0]!, url = new URL(server.url);
    if (run) url.searchParams.set('run', run);
    if (process.env.LOCIVIEW_E2E_TIMINGS === '1') url.searchParams.set('timings', '1');
    await page.route('**/*', route => { const u = new URL(route.request().url()); return u.origin === url.origin || ['blob:', 'data:'].includes(u.protocol) ? route.continue() : route.abort('blockedbyclient'); });
    page.on('pageerror', e => errors.push(e.message)); await page.goto(url.href); return page;
  };
  const close = async () => { await context?.close(); context = undefined; };
  const record = async (page: Page) => { await revealCaptionList(page); await page.locator('.lv-caption-select').filter({ hasText: '既存のピン' }).click(); return page.getByRole('region', { name: '記録の詳細', exact: true }).getByLabel('本文', { exact: true }); };
  const backup = async (page: Page, name: string) => {
    await revealFileSurface(page, '保存'); const primary = page.getByRole('region', { name: 'ファイル', exact: true }).locator('.lv-file-primary');
    await expect(primary).toBeEnabled(); const since = await page.evaluate(() => performance.now()), started = Date.now();
    try {
      const [file] = await Promise.all([page.waitForEvent('download'), primary.click()]);
      const milliseconds = Date.now() - started, path = info.outputPath(name + '.zip'); await file.saveAs(path); expect(await file.failure()).toBeNull();
      await info.attach(name + '-output', { body: JSON.stringify({ milliseconds, stages: await readLocalTimings(page, since) }), contentType: 'application/json' });
      await closeFileSurface(page); return path;
    } catch (error) {
      await info.attach(name + '-output-failure', { body: JSON.stringify({ stages: await readLocalTimings(page, since) }), contentType: 'application/json' }); throw error;
    }
  };
  try {
    let input = process.env.LOCIVIEW_E2E_LOCAL_RECOVERY_BACKUP;
    if (!input) {
      const author = await open(await createBrowserProfile('local-recovery-author'));
      await chooseHomeFiles(author, { name: '記録.zip', mimeType: 'application/zip', buffer: await nativeConversionBackup(triangleGlb(), smallPng()) });
      await author.getByRole('button', { name: '新しいプロジェクトに変換', exact: true }).click(); await expect(author.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled();
      input = await backup(author, 'input'); await close();
    }
    const bytes = Uint8Array.from(await readFile(input)), original = await BackupArchive.inspect(new Blob([bytes.buffer]), validationMetadataLimits);
    await info.attach('fixed-input', { body: JSON.stringify({ sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }), contentType: 'application/json' });
    const profile = await createBrowserProfile('local-recovery'), page = await open(profile);
    await chooseHomeFiles(page, input); await page.getByRole('button', { name: 'このファイルから再開', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('Nativeから引き継ぐ記録', { timeout: 120_000 });
    await expect(page.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled();
    const confirmed = '06l：中断前に確定した本文', field = await record(page); await field.fill(confirmed); await finishCaptionEditing(page, { body: confirmed });
    await page.evaluate(() => {
      const openFile = FileSystemDirectoryHandle.prototype.getFileHandle;
      FileSystemDirectoryHandle.prototype.getFileHandle = async function(name, options) {
        if (options?.create && name === '00000000.amchange') { await openFile.call(this, name, options); console.info('06l part created'); await new Promise<void>(() => {}); }
        return openFile.call(this, name, options);
      };
    });
    const paused = page.waitForEvent('console', msg => msg.text() === '06l part created'); await field.fill('反映されない未確定入力'); await paused;
    const protocol = await context!.newCDPSession(page), crashed = page.waitForEvent('crash'); void protocol.send('Page.crash').catch(() => {}); await crashed; await close();
    const run = (original.source.proof.identity.projectId as string).slice(4), blocked = await open(profile, run);
    const proceed = blocked.getByRole('button', { name: '最後に保存された内容で続ける', exact: true }); await expect(proceed).toBeEnabled();
    const before = await projectFiles(blocked, run); expect(before.some(f => f.path.endsWith('/changes/00000000.amchange') && f.size === 0)).toBe(true);
    const since = await blocked.evaluate(() => performance.now()), started = Date.now();
    await proceed.focus(); await proceed.press('Enter'); await expect(await record(blocked)).toHaveValue(confirmed);
    await info.attach('06l-recovery', { body: JSON.stringify({ milliseconds: Date.now() - started, touch, physicalDevice: false, stages: await readLocalTimings(blocked, since) }), contentType: 'application/json' });
    const after = await projectFiles(blocked, run), paths = new Set(before.map(f => f.path));
    expect(after.filter(f => paths.has(f.path))).toEqual(before); expect(after.filter(f => !paths.has(f.path)).map(f => f.path)).toEqual([expect.stringMatching(/\/closedLocal\.json$/)]);
    const saved = await backup(blocked, 'recovered'), restored = await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(saved)).buffer]), validationMetadataLimits);
    expect(restored.source.proof).toEqual(original.source.proof); expect(restored.source.originalChanges()).toEqual(expect.arrayContaining(original.source.originalChanges()));
    expect(restored.source.originalChanges()).toHaveLength(original.source.originalChanges().length + 1); expect(restored.archive.control.manifest.blobs).toEqual(original.archive.control.manifest.blobs);
    for (const entry of original.archive.control.manifest.blobs) expect(await restored.archive.entryBlob(entry.path).arrayBuffer()).toEqual(await original.archive.entryBlob(entry.path).arrayBuffer());
    await close(); const fresh = await open(await createBrowserProfile('local-recovery-recipient'));
    await chooseHomeFiles(fresh, saved); await fresh.getByRole('button', { name: 'このファイルから再開', exact: true }).click();
    await expect(fresh.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('Nativeから引き継ぐ記録', { timeout: 120_000 });
    await expect(await record(fresh)).toHaveValue(confirmed); const next = '06l：別環境で再編集'; await (await record(fresh)).fill(next); await finishCaptionEditing(fresh, { body: next });
    await fresh.reload(); await expect(await record(fresh)).toHaveValue(next); expect(errors).toEqual([]); await fresh.screenshot({ path: info.outputPath('06l-reopened.png') });
  } catch (error) {
    const active = context?.pages().find(page => !page.isClosed());
    if (active) {
      const body = JSON.stringify({ text: await active.locator('body').innerText().catch(() => ''), stages: await readLocalTimings(active).catch(() => []) });
      await appendFile(info.outputPath('06l-failure.json'), body).catch(() => {});
      await info.attach('06l-failure', { body, contentType: 'application/json' }).catch(() => {});
    }
    throw error;
  } finally { await close(); await server.stop(); }
});

for (const restored of [true, false]) for (const touch of [false, true]) test(`renderer crashes before writing, during photo publication and after autosave preserve confirmed records exactly once (${touch ? 'touch' : 'desktop'}, ${restored ? 'restored' : 'original'})`, async ({}, info) => {
  A.getHeads(A.init());
  const testStarted = Date.now(); let launches = 0;
  const phase = (name: string) => appendFile(info.outputPath('crash-phases.jsonl'), JSON.stringify({ phase: name, milliseconds: Date.now() - testStarted }) + '\n');
  const server = await ownedServer(process.env.LOCIVIEW_E2E_ARTIFACT ?? 'desktop-dist');
  const receiver = await createBrowserProfile('restored-text');
  let context: BrowserContext | undefined;
  const open = async (profile: string, suffix = '') => {
    const launch = ++launches; await phase(`launch.${launch}.start`);
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', serviceWorkers: 'block', acceptDownloads: true,
      viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, isMobile: touch, hasTouch: touch });
    await phase(`launch.${launch}.ready`);
    const page = context.pages()[0]!;
    const url = new URL(server.url + suffix);
    if (process.env.LOCIVIEW_E2E_TIMINGS === '1') url.searchParams.set('timings', '1');
    await phase(`navigation.${launch}.start`); await page.goto(url.href); await phase(`navigation.${launch}.ready`);
    return page;
  };
  const backup = async (page: Page, name: string) => {
    await phase(`backup.${name}.start`);
    const started = Date.now(), browserStarted = await page.evaluate(() => performance.now()), measurements: Record<string, number | string> = { name };
    await revealFileSurface(page, '保存');
    const files = page.getByRole('region', { name: 'ファイル', exact: true }), primary = files.locator('.lv-file-primary');
    try {
      const readiness = Date.now();
      await expect(primary).toBeEnabled();
      measurements.readinessMs = Date.now() - readiness;
      const output = Date.now();
      const [file] = await Promise.all([page.waitForEvent('download'), primary.click().then(() => { measurements.clickMs = Date.now() - output; })]);
      measurements.downloadMs = Date.now() - output;
      const path = info.outputPath(name + '.zip');
      await file.saveAs(path); expect(await file.failure()).toBeNull();
      measurements.fileSavedMs = Date.now() - output;
      await phase(`backup.${name}.file-saved`);
      const archive = await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]), validationMetadataLimits);
      await phase(`backup.${name}.inspected`); return archive;
    } catch (error) {
      measurements.failure = String(error);
      await info.attach(name + '-save-failure', { body: JSON.stringify({
        text: await files.innerText().catch(error => String(error)),
        enabled: await primary.isEnabled().catch(error => String(error)),
        timings: await readLocalTimings(page).catch(error => String(error)),
      }), contentType: 'application/json' });
      throw error;
    } finally {
      measurements.totalMs = Date.now() - started;
      const stages = await readLocalTimings(page, browserStarted);
      await info.attach(name + '-save-timings', { body: JSON.stringify({ ...measurements, stages }), contentType: 'application/json' });
    }
  };
  const text = '強制終了しても一度だけ残る本文', detail = (page: Page) => page.getByRole('region', {
    name: process.env.LOCIVIEW_E2E_ARTIFACT ? /^(?:記録|キャプション)の詳細$/ : '記録の詳細', exact: true });
  const record = async (page: Page) => {
    await revealCaptionList(page);
    await page.locator('.lv-caption-select').filter({ hasText: '既存のピン' }).click();
    return detail(page).getByLabel('本文', { exact: true });
  };
  const close = async () => {
    if (!context) return;
    await phase('browser-close.start'); await context.close(); context = undefined; await phase('browser-close.ready');
  };
  const crash = async (page: Page) => {
    await phase('renderer-crash.start');
    const protocol = await context!.newCDPSession(page), crashed = page.waitForEvent('crash');
    void protocol.send('Page.crash').catch(() => {});
    await crashed;
    await phase('renderer-crash.event'); await close();
  };
  const crashAt = async (page: Page, fileName: string, action: () => Promise<unknown>, afterCreation = false) => {
    const signal = page.waitForEvent('console', msg => msg.text() === 'text write paused');
    await page.evaluate(({fileName,afterCreation}) => {
      const openFile = FileSystemDirectoryHandle.prototype.getFileHandle;
      FileSystemDirectoryHandle.prototype.getFileHandle = async function(name, options) {
        if (options?.create && name === fileName) {
          if (afterCreation) await openFile.call(this, name, options);
          console.info('text write paused');
          await new Promise<void>(() => {});
        }
        return openFile.call(this, name, options);
      };
    }, {fileName,afterCreation});
    await action();
    await signal;
    await crash(page);
  };
  try {
    const author = await open(restored ? await createBrowserProfile('author') : receiver);
    await phase('conversion.inspect.start');
    await chooseHomeFiles(author, {
      name: '記録.zip', mimeType: 'application/zip', buffer: await nativeConversionBackup(triangleGlb(), smallPng()) });
    await phase('conversion.inspect.selected');
    await author.getByRole('button', { name: '新しいプロジェクトに変換', exact: true }).click();
    await phase('conversion.command.started');
    await expect(author.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled();
    await phase('conversion.command.ready');
    const before = await backup(author, 'before');
    await close();
    const page = await open(receiver);
    if (restored) {
      await chooseHomeFiles(page, info.outputPath('before.zip'));
      await page.getByRole('button', { name: 'このファイルから再開', exact: true }).click();
    }
    // Restore can already offer read-only captions while the editor is being
    // prepared. Exercise the crash only after this specific operation closes.
    const restoredProject = page.getByRole('heading', { name: 'プロジェクト名', exact: true });
    await expect(restoredProject).toHaveText('Nativeから引き継ぐ記録', { timeout: 120_000 });
    await expect(page.getByRole('button', { name: '閲覧する', exact: true })).toBeEnabled();
    const field = await record(page);
    await expect(field).toHaveValue('本文を保持');
    await crashAt(page, 'staging.json', () => field.fill('最初の書き込み前に終了する文章'));
    const run = (before.source.proof.identity.projectId as string).slice(4);
    const afterPreparation = await open(receiver, '?run=' + run);
    const enter = afterPreparation.getByRole('button', { name: '編集する', exact: true });
    await expect(afterPreparation.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('Nativeから引き継ぐ記録');
    if (await enter.isVisible()) await enter.click();
    const previous = await record(afterPreparation);
    await expect(previous).toHaveValue('本文を保持');
    await expect(detail(afterPreparation).getByRole('region',{name:'添付メディア',exact:true}).locator('figure')).toHaveCount(2);
    await previous.fill(text);
    await finishCaptionEditing(afterPreparation, {body:text});
    // Cover both finite retry forms: reused media and new immutable media.
    const photo = smallPng(restored ? 180 : 40);
    await crashAt(afterPreparation, 'published.json', async () => {
      const chooser=afterPreparation.waitForEvent('filechooser');
      await detail(afterPreparation).getByLabel('メディアを追加',{exact:true}).click();
      await(await chooser).setFiles({name:'中断しても残る写真.png',mimeType:'image/png',buffer:photo});
    });
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
    expect(changes).toHaveLength(originals.length + 2);
    expect(changes).toEqual(expect.arrayContaining(originals));
    const retainedBlobs = after.archive.control.manifest.blobs;
    expect(retainedBlobs).toEqual(expect.arrayContaining([...before.archive.control.manifest.blobs]));
    expect(retainedBlobs).toHaveLength(before.archive.control.manifest.blobs.length + (restored ? 1 : 0));
    const photoHash = createHash('sha256').update(photo).digest('hex');
    const photoEntry = retainedBlobs.find(entry => entry.sha256 === photoHash);
    expect(photoEntry).toBeDefined();
    expect(await after.archive.entryBlob(photoEntry!.path).arrayBuffer()).toEqual(Uint8Array.from(photo).buffer);
    await expect(detail(resume).getByRole('region',{name:'添付メディア',exact:true}).locator('figure')).toHaveCount(3);
    for (const entry of before.archive.control.entries.filter(e => e.path.startsWith('blobs/'))) {
      expect(await after.archive.entryBlob(entry.path).arrayBuffer()).toEqual(await before.archive.entryBlob(entry.path).arrayBuffer());
    }
    const confirmed = '完了表示の直後に終了しても残る本文';
    await (await record(resume)).fill(confirmed);
    await finishCaptionEditing(resume, {body:confirmed});
    await crash(resume);
    const cold = await open(receiver, '?run=' + run);
    await expect(cold.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('Nativeから引き継ぐ記録');
    const enterEdit = cold.getByRole('button',{name:'編集する',exact:true});
    if (await enterEdit.isVisible()) await enterEdit.click();
    await expect(await record(cold)).toHaveValue(confirmed);
    const reopened = await backup(cold, 'reopened');
    expect(reopened.source.originalChanges()).toEqual(expect.arrayContaining(changes));
    expect(reopened.source.originalChanges()).toHaveLength(changes.length + 1);
    expect(reopened.archive.control.manifest.blobs).toEqual(retainedBlobs);
    {
      // Persist a real start and empty part, then crash before its writer opens.
      // Resolution is explicit and must retain every already-present byte.
      const unprepared=await record(cold);
      await crashAt(cold, '00000000.amchange', () => unprepared.fill('準備データが確定する前に終了する本文'), true);
      const blocked = await open(receiver, '?run=' + run);
      const proceed = blocked.getByRole('button', { name: '最後に保存された内容で続ける', exact: true });
      await expect(proceed).toBeEnabled();
      await info.attach('local-recovery-admission', { body: JSON.stringify(await readLocalTimings(blocked)), contentType: 'application/json' });
      const preserved = await projectFiles(blocked, run);
      expect(preserved.some(file=>file.path.endsWith('/changes/00000000.amchange')&&file.size===0)).toBe(true);
      await expect(blocked.getByRole('region', { name: '再開の確認', exact: true })).toBeVisible();
      await expect(blocked.getByRole('region', { name: '再開の確認', exact: true })).toContainText('保存途中の変更は反映されません。');
      const leave = blocked.getByRole('button', { name: '別のプロジェクトを開く', exact: true });
      await expect(blocked.getByRole('heading', { name: '更新ファイル', exact: true })).toBeHidden();
      await blocked.screenshot({ path: info.outputPath('cold-unprepared-guidance.png') });
      await leave.focus(); await leave.press('Enter');
      await expect(blocked.getByRole('button', { name: 'ファイルを開く', exact: true })).toBeVisible();
      expect(await projectFiles(blocked, run)).toEqual(preserved);
      await chooseHomeFiles(blocked, { name: 'ほかの作業.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
      await blocked.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill('ほかの正常な作業');
      await blocked.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
      await expect(blocked.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('ほかの正常な作業');
      await revealFileSurface(blocked, '保存');
      await phase('selector.return.start');
      await blocked.getByRole('button', { name: 'プロジェクトを選ぶ', exact: true }).click();
      await phase('selector.return.clicked');
      await blocked.locator('.lv-recent-project').filter({ hasText: 'Nativeから引き継ぐ記録' }).getByRole('button', { name: '編集で開く', exact: true }).click();
      await expect(proceed).toBeEnabled();
      expect(await projectFiles(blocked, run)).toEqual(preserved);
      const resolveStarted = Date.now();
      const resolveBrowserStarted = await blocked.evaluate(() => performance.now());
      await phase('local-recovery.resolve.start');
      await proceed.focus(); await proceed.press('Enter');
      try { await expect(await record(blocked)).toHaveValue(confirmed); }
      catch (error) {
        await blocked.screenshot({ path: info.outputPath('local-recovery-failure.png') });
        await info.attach('local-recovery-failure', { body: JSON.stringify({ text: await blocked.locator('body').innerText(),
          timings: await readLocalTimings(blocked) }), contentType: 'application/json' });
        throw error;
      }
      await phase('local-recovery.resolve.ready');
      const stages = await readLocalTimings(blocked, resolveBrowserStarted);
      await info.attach('explicit-local-recovery', { body: JSON.stringify({ milliseconds: Date.now() - resolveStarted, restored, touch, physicalDevice: false, stages }), contentType: 'application/json' });
      const resolvedFiles = await projectFiles(blocked, run), priorPaths = new Set(preserved.map(file => file.path));
      expect(resolvedFiles.filter(file => priorPaths.has(file.path))).toEqual(preserved);
      expect(resolvedFiles.filter(file => !priorPaths.has(file.path)).map(file => file.path)).toEqual([expect.stringMatching(/\/closedLocal\.json$/)]);
      const recoveredText = '中断から再開して保存した本文';
      await (await record(blocked)).fill(recoveredText); await finishCaptionEditing(blocked,{body:recoveredText});
      const repaired = await backup(blocked, 'repaired');
      expect(repaired.source.originalChanges()).toHaveLength(reopened.source.originalChanges().length + 1);
      expect(repaired.source.originalChanges()).toEqual(expect.arrayContaining(reopened.source.originalChanges()));
      expect(repaired.archive.control.manifest.blobs).toEqual(retainedBlobs);
      await close();
      const fresh = await open(await createBrowserProfile('backup-rescue'));
      await chooseHomeFiles(fresh, info.outputPath('repaired.zip'));
      await fresh.getByRole('button', { name: 'このファイルから再開', exact: true }).click();
      await expect(fresh.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('Nativeから引き継ぐ記録', { timeout: 120_000 });
      await expect(await record(fresh)).toHaveValue(recoveredText);
      await expect(detail(fresh).getByRole('region',{name:'添付メディア',exact:true}).locator('figure')).toHaveCount(3);
      await fresh.screenshot({ path: info.outputPath('clean-browser-backup-resumed.png') });
    }
  } catch (error) {
    const active = context?.pages().find(page => !page.isClosed());
    if (active) {
      await active.screenshot({path:info.outputPath('crash-workflow-failure.png')}).catch(()=>{});
      await info.attach('crash-workflow-failure',{body:JSON.stringify({url:active.url(),
        text:await active.locator('body').innerText().catch(()=>''),
        rows:await active.locator('.lv-recent-project').allTextContents().catch(()=>[]),
        listBusy:await active.locator('.lv-validation-home [aria-busy]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-busy'))).catch(()=>[]),
        timings:await active.evaluate(()=>{
          document.dispatchEvent(new Event('lociview-timing-snapshot'));
          return performance.getEntriesByType('measure').filter(entry=>entry.name.startsWith('lociview.'))
            .map(entry=>({...entry.toJSON(),detail:(entry as PerformanceMeasure).detail}));
        }).catch(()=>[]),
      }),contentType:'application/json'}).catch(()=>{});
    }
    throw error;
  } finally { await close(); await server.stop(); }
});
