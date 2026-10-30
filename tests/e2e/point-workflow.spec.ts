import { revealProjectHelp } from './workspaceUi';
import { revealCaptionList } from './workspaceUi';
import * as THREE from 'three';
import { serializeGlb } from '../../src/assets/glbOptimize';
import { defaultPose, fittedPose } from '../../src/harness/projectScene/viewportModel';
import { test, expect, chromium, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as A from '@automerge/automerge';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { smallPng, triangleGlb } from './fixtures';
import { presentedCanvas } from './presentedCanvas';

const entry = process.env.LOCIVIEW_E2E_ENTRY ?? 'http://127.0.0.1:4182/dev.html?editor=project';
const tracing = process.env.LOCIVIEW_E2E_TRACE !== '0';
const ply = Buffer.from('ply\nformat ascii 1.0\nelement vertex 5\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n0 0 0 255 0 0\n-1 -1 0 0 255 0\n1 -1 0 0 0 255\n-1 1 0 255 255 0\n1 1 0 255 0 255\n');
const largePly = Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n100000000 0 0 255 0 0\n');
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const fileBlob = async (path: string) => new Blob([new Uint8Array(await readFile(path)).buffer]);
const files = (page: Page) => page.getByRole('region', { name: 'ファイル', exact: true });
const detail = (page: Page) => page.getByRole('region', { name: 'キャプションの詳細', exact: true });
async function ready(page: Page) { await expect(page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('点群の作業', { timeout: 90_000 }); }
async function caption(page: Page, title = '元の点の記録') { await revealCaptionList(page); await page.getByRole('list', { name: 'キャプション一覧', exact: true }).locator('.lv-caption-select').filter({ hasText: title }).click(); }
async function edit(page: Page, title: string, body: string) {
  await detail(page).getByLabel('タイトル', { exact: true }).fill(title); await detail(page).getByLabel('本文', { exact: true }).fill(body);
  await detail(page).getByRole('button', { name: '変更を適用', exact: true }).click(); await expect(page.getByText('変更を適用しました。', { exact: true })).toBeVisible({timeout:90_000});
}
async function download(page: Page, info: TestInfo, name: string, purpose: 'backup' | 'teamWorkspace' | 'contribution' | 'review', base?: string) {
  const menu=page.locator('details.lv-project-files'); if(await menu.count()&&!await menu.evaluate(n=>(n as HTMLDetailsElement).open))await menu.locator(':scope > summary').click();
  const area = files(page); if (purpose === 'review') { await area.locator('summary').filter({hasText:/^その他$/}).click(); await area.getByRole('button',{name:'シーンを共有',exact:true}).click(); } else await area.getByRole('button', { name: purpose === 'backup' ? '保存' : '相手に渡す', exact: true }).click();
  if (purpose === 'backup') await area.getByLabel('名前（任意）', { exact: true }).fill(name);
  else if (purpose !== 'review') { await area.getByLabel('渡す内容', { exact: true }).selectOption(purpose); if (base) await area.getByLabel('元にする作業一式', { exact: true }).selectOption(base); }
  if (purpose === 'review') { const scene = area.getByLabel('渡すシーン',{exact:true}); const ids = await scene.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).filter(Boolean)); await scene.selectOption(ids[0]!); await area.getByRole('button',{name:'内容を確認',exact:true}).click(); }
  const primary=area.locator('button.lv-file-primary'); await expect(primary).toHaveText(purpose==='backup'?'ファイルに保存':'ダウンロード',{timeout:180_000}); await expect(primary).toBeEnabled({timeout:180_000});
  const [result] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), primary.click()]);
  const path = info.outputPath(`${name}.zip`); await result.saveAs(path); expect(await result.failure()).toBeNull();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 180_000 });
  if (purpose === 'backup') {
    const history = area.locator('details').filter({has:page.locator('summary',{hasText:/^作成したファイル$/})}); await history.locator('summary').first().click();
    const row = history.locator('section').filter({hasText:`バックアップ ${name} —`}); await row.getByText('保存先のファイルを確認',{exact:true}).click();
    const choosing=page.waitForEvent('filechooser'); await row.getByRole('button',{name:'ファイルを選択',exact:true}).click(); await (await choosing).setFiles(path);
    await expect(area.getByText('選択したファイルの内容を確認しました。',{exact:true})).toBeVisible({timeout:90_000});
    await expect(page.getByLabel('保存ファイルの状態',{exact:true})).toHaveText('保存ファイルと一致');
  }
  return path;
}
async function backupRecords(path: string) {
  const backup = await BackupArchive.inspect(await fileBlob(path), validationMetadataLimits), inspection = await inspectProjectCandidates(backup.source.read(), validationMetadataLimits);
  if (inspection.kind !== 'project-candidate-inspection') throw Error('point-backup-rejected');
  expect(Buffer.from(await backup.archive.entryBytes(`blobs/sha256/${hash(ply)}`, ply.length))).toEqual(ply);
  expect(Buffer.from(await backup.archive.entryBytes(`blobs/sha256/${hash(smallPng())}`, smallPng().length))).toEqual(smallPng());
  return { backup, records: inspection.unambiguousRecords as Record<string, any> };
}
async function sample(page: Page, dx = 0, dy = 0) {
  return (await presentedCanvas(page.getByLabel('3Dモデルの表示', { exact: true }), dx, dy)).sample;
}

test('点群の元座標で記録し、画像・調整・受け渡し・閲覧・復元・cold再開までつながる', async ({}, info) => {
  test.setTimeout(900_000); A.getHeads(A.init());
  const root = info.outputPath('profiles'); await mkdir(root, {recursive:true});
  const profiles = await Promise.all(['A','B','restore'].map(n=>mkdtemp(join(root,n))));
  const contexts = new Set<BrowserContext>(), errors: string[] = [];
  const launch = async (index: number, dpr = 1) => {
    const context = await chromium.launchPersistentContext(profiles[index]!, { channel:'chromium',headless:true,viewport:{width:1440,height:1000},deviceScaleFactor:dpr,acceptDownloads:true,serviceWorkers:'block' });
    contexts.add(context); context.setDefaultTimeout(15_000); await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === new URL(entry).origin || ['blob:','data:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient'); });
    if (tracing) await context.tracing.start({screenshots:true,snapshots:true,sources:true});
    const page = context.pages()[0] ?? await context.newPage(); page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(entry); return {page,context};
  };
  const close = async (context: BrowserContext, name: string) => { if (tracing) await context.tracing.stop({path:info.outputPath(`${name}.zip`)}); await context.close(); contexts.delete(context); };
  try {
    let a = await launch(0); let page = a.page;
    await page.getByLabel('ファイルを選択', {exact:true}).setInputFiles({name:'測量.ply',mimeType:'application/ply',buffer:ply}); await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
    await page.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('点群の作業'); await page.getByRole('button',{name:'プロジェクトを作成',exact:true}).click(); await ready(page);
    await page.getByRole('button',{name:'正面',exact:true}).click(); await expect(page.locator('.lv-project-viewport-status')).toBeEmpty();
    expect((await sample(page)).slice(0,3)).toEqual([255,0,0]);
    await page.getByRole('tab',{name:'モデル',exact:true}).click(); let models = page.getByRole('tabpanel',{name:'モデル',exact:true});
    await models.locator('.lv-model-select').filter({hasText:'測量.ply'}).click();
    const diameter = models.getByLabel('点の大きさ（px）',{exact:true}); await expect(diameter).toHaveValue('3'); await diameter.focus(); await diameter.press('End'); await expect(diameter).toHaveValue('20');
    expect((await sample(page,8,0)).slice(0,3)).toEqual([255,0,0]); expect((await sample(page,8,8)).slice(0,3)).not.toEqual([255,0,0]);
    await expect(models.getByRole('button',{name:'モデルを差し替える',exact:true})).toBeEnabled(); await diameter.press('Home'); await diameter.press('ArrowRight'); await diameter.press('ArrowRight');
    await page.getByRole('tab',{name:'キャプション',exact:true}).click(); await page.getByRole('button',{name:'ピンを追加',exact:true}).click();
    const canvas = page.getByLabel('3Dモデルの表示',{exact:true}), box = await canvas.boundingBox(); await canvas.click({position:{x:box!.width/2,y:box!.height/2}});
    await page.getByRole('button',{name:'位置を確定',exact:true}).click(); await expect(page.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible(); expect((await sample(page)).slice(0,3)).toEqual([255,0,0]); await edit(page,'元の点の記録','点群の本文');
    const chooser = page.waitForEvent('filechooser'); await page.getByLabel('メディアを追加',{exact:true}).click(); await (await chooser).setFiles({name:'写真.png',mimeType:'image/png',buffer:smallPng()}); await expect(page.getByText('メディアを追加しました。',{exact:true})).toBeVisible();
    const first = await download(page,info,'point-first','backup'), initial = await backupRecords(first);
    const original = Object.values(initial.records.captionsById)[0] as any;
    expect(original.anchor).toMatchObject({positionAsset:[0,0,0],hitEvidence:{method:'point-cloud',source:{surfaceRef:{kind:'pointSample',nodeIndex:0,primitiveIndex:0,pointIndex:0}}}}); expect(original.anchor.normalAsset).toBeUndefined();
    await close(a.context,'initial-dpr1'); a=await launch(0,2); page=a.page; models=page.getByRole('tabpanel',{name:'モデル',exact:true}); await ready(page); await caption(page); await page.getByRole('button',{name:'正面',exact:true}).click();
    expect((await sample(page)).slice(0,3)).toEqual([255,0,0]);
    await page.getByRole('button',{name:'位置を調整',exact:true}).click(); await page.getByRole('button',{name:'位置を確定',exact:true}).click();
    // An explicit numeric move preserves Caption identity/content while dropping source evidence.
    await page.getByRole('button',{name:'位置を調整',exact:true}).click(); await page.getByLabel('位置 X',{exact:true}).fill('0.2'); await page.getByRole('button',{name:'位置を確定',exact:true}).click();
    await page.getByRole('tab',{name:'モデル',exact:true}).click(); const addFile = page.waitForEvent('filechooser'); await models.getByRole('button',{name:'3Dモデルを追加',exact:true}).click(); await (await addFile).setFiles({name:'追加点群.ply',mimeType:'application/ply',buffer:largePly}); await expect(page.getByText('モデルを追加しました。',{exact:true})).toBeVisible();
    const meshFile = page.waitForEvent('filechooser'); await models.getByRole('button',{name:'3Dモデルを追加',exact:true}).click(); await (await meshFile).setFiles({name:'三角形.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()}); await expect(page.getByText('モデルを追加しました。',{exact:true})).toBeVisible();
    await models.locator('.lv-model-select').filter({hasText:'追加点群.ply'}).click(); await models.getByRole('button',{name:'配置を調整',exact:true}).click(); await models.getByLabel('モデル位置 X',{exact:true}).fill('-99999999'); await models.getByRole('button',{name:'配置を確定',exact:true}).click(); await expect(page.getByText('モデルの配置を確定しました。',{exact:true})).toBeVisible();
    await models.getByRole('button',{name:'このモデルだけ表示',exact:true}).click(); await page.getByRole('button',{name:'正面',exact:true}).click(); await page.getByRole('button',{name:'全体表示',exact:true}).click(); expect((await sample(page)).slice(0,3)).toEqual([255,0,0]); await models.getByRole('button',{name:'すべて表示',exact:true}).click();
    await models.locator('.lv-model-select').filter({hasText:'測量.ply'}).click(); await models.getByRole('button',{name:'隠す',exact:true}).click(); await models.getByRole('button',{name:'表示',exact:true}).click();
    await models.getByRole('button',{name:'配置を調整',exact:true}).click(); await models.getByLabel('モデル位置 X',{exact:true}).fill('3'); await models.getByLabel('モデル回転 Z',{exact:true}).fill('90'); await models.getByLabel('モデル倍率',{exact:true}).fill('2'); await models.getByRole('button',{name:'配置を確定',exact:true}).click(); await expect(page.getByText('モデルの配置を確定しました。',{exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'キャプション',exact:true}).click();
    const workspacePath = await download(page,info,'point-workspace','teamWorkspace'), workspace = await WorkspaceArchive.inspect(await fileBlob(workspacePath),validationMetadataLimits);
    const b = await launch(1,2); await b.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(workspacePath); await b.page.getByRole('button',{name:'ファイルを開く',exact:true}).click(); await ready(b.page); await caption(b.page); await edit(b.page,'元の点の記録','相手が追記');
    const updatedPly=Buffer.from(ply.toString().replace('255 0 0','255 80 0'));
    await page.getByRole('tab',{name:'モデル',exact:true}).click();await models.locator('.lv-model-select').filter({hasText:'測量.ply'}).click();
    const replacement=page.waitForEvent('filechooser');await models.getByRole('button',{name:'モデルを差し替える',exact:true}).click();await(await replacement).setFiles({name:'更新点群.ply',mimeType:'application/ply',buffer:updatedPly});
    await expect(models.getByRole('status').filter({hasText:'ピンは要確認'})).toBeVisible();await expect(models.getByRole('status').filter({hasText:'材質の調整は引き継ぎません'})).toHaveCount(0);await models.getByRole('button',{name:'差し替えを確定',exact:true}).click();await expect(page.getByText('モデルを差し替えました。配置と記録を保持しています。',{exact:true})).toBeVisible({timeout:90000});
    await models.getByRole('button',{name:'このモデルだけ表示',exact:true}).click();await page.getByRole('button',{name:'正面',exact:true}).click();await page.getByRole('button',{name:'全体表示',exact:true}).click();
    await page.getByRole('tab',{name:'キャプション',exact:true}).click();await caption(page);await expect(page.locator('.lv-project-marker[data-review="true"]')).toHaveCount(1);
    const updatedWorkspace=await download(page,info,'point-update','teamWorkspace');
    const peerMenu=b.page.locator('details.lv-project-files');if(await peerMenu.count()&&!await peerMenu.evaluate(n=>(n as HTMLDetailsElement).open))await peerMenu.locator(':scope > summary').click();
    const peerReceive=b.page.getByRole('region',{name:'更新ファイル',exact:true});await peerReceive.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(updatedWorkspace);await peerReceive.getByRole('button',{name:'更新を受け取る',exact:true}).click();await expect(peerReceive.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:90000});
    await b.page.getByRole('tab',{name:'モデル',exact:true}).click();const peerModels=b.page.getByRole('tabpanel',{name:'モデル',exact:true});await peerModels.locator('.lv-model-select').filter({hasText:'測量.ply'}).click();await peerModels.getByRole('button',{name:'このモデルだけ表示',exact:true}).click();await b.page.getByRole('button',{name:'正面',exact:true}).click();await b.page.getByRole('button',{name:'全体表示',exact:true}).click();await b.page.getByRole('tab',{name:'キャプション',exact:true}).click();
    await caption(b.page);await expect(detail(b.page).getByLabel('本文',{exact:true})).toHaveValue('相手が追記');await expect(b.page.locator('.lv-project-marker[data-review="true"]')).toHaveCount(1);
    await b.page.getByRole('button',{name:'位置を調整',exact:true}).click();const peerCanvas=b.page.getByLabel('3Dモデルの表示',{exact:true}),peerBox=(await peerCanvas.boundingBox())!;await peerCanvas.click({position:{x:peerBox.width/2,y:peerBox.height/2}});await b.page.getByLabel('位置 X',{exact:true}).fill('0.2');await b.page.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(b.page.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible();await expect(b.page.locator('.lv-project-marker[data-review="false"]')).toHaveCount(1);

    const returned = await download(b.page,info,'point-return','contribution',workspace.archive.control.manifest.packageId);
    const receive = page.getByRole('region',{name:'更新ファイル',exact:true}); await receive.getByLabel('更新ファイルを選択',{exact:true}).setInputFiles(returned); await receive.getByRole('button',{name:'更新を受け取る',exact:true}).click(); await expect(receive.getByText('更新を受け取りました。',{exact:true})).toBeVisible({timeout:90_000});
    await caption(page); await expect(detail(page).getByLabel('本文',{exact:true})).toHaveValue('相手が追記');
    const finalPath = await download(page,info,'point-final','backup'), final = await backupRecords(finalPath);
    expect(Buffer.from(await final.backup.archive.entryBytes(`blobs/sha256/${hash(largePly)}`,largePly.length))).toEqual(largePly);
    expect(final.records.captionsById[original.id]).toMatchObject({title:'元の点の記録',body:'相手が追記',anchor:{positionAsset:[.2,0,0],hitEvidence:{method:'manual'}}});
    expect(final.records.captionsById[original.id].anchor.hitEvidence.source).toBeUndefined(); expect(Object.values(final.records.representationsById).map((r:any)=>r.contentKind).sort()).toEqual(['mesh','pointCloud','pointCloud','pointCloud']);
    expect(Buffer.from(await final.backup.archive.entryBytes(`blobs/sha256/${hash(updatedPly)}`,updatedPly.length))).toEqual(updatedPly);
    const assetId=original.anchor.assetId,oldAsset=initial.records.assetsById[assetId],newAsset=final.records.assetsById[assetId];expect(newAsset.assetFrameId).toBe(oldAsset.assetFrameId);expect(newAsset.status.activeBindingId).not.toBe(oldAsset.status.activeBindingId);expect(final.records.assetBindingsById[newAsset.status.activeBindingId].assetToProject).toMatchObject({translation:[3,0,0],uniformScale:2}); expect(Object.keys(final.records.captionAttachmentsById)).toHaveLength(1);
    const reviewPath = await download(page,info,'point-review','review'); await close(b.context,'B');
    const review = await launch(1,3); await ready(review.page); await revealProjectHelp(review.page); await review.page.getByRole('button',{name:'別のプロジェクトを開く',exact:true}).click(); await expect(review.page.getByLabel('ファイルを選択',{exact:true})).toBeVisible(); await expect(review.page.getByLabel('ファイルを選択',{exact:true})).toBeEnabled(); await review.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(reviewPath); await review.page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
    await expect(review.page.getByText('閲覧用シーンを開きました。編集プロジェクトは作成していません。',{exact:true})).toBeVisible({timeout:180_000});
    await expect(review.page.getByText(/この描画倍率では点群を表示できません/).first()).toBeVisible(); await review.page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').first().click(); await expect(review.page.getByText('相手が追記',{exact:true}).first()).toBeVisible(); await close(review.context,'review');
    await close(a.context,'A'); a = await launch(0,2); await ready(a.page); await caption(a.page); await expect(detail(a.page).getByLabel('本文',{exact:true})).toHaveValue('相手が追記'); await close(a.context,'cold');
    const restored = await launch(2); await restored.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(finalPath); await restored.page.getByRole('button',{name:'ファイルを開く',exact:true}).click(); await restored.page.getByRole('button',{name:'バックアップから復元',exact:true}).click(); await ready(restored.page); await caption(restored.page); await edit(restored.page,'元の点の記録','復元後に追記');
    const restoredPath = await download(restored.page,info,'point-restored','backup'), restoredBackup = await backupRecords(restoredPath); expect(restoredBackup.backup.source.proof.identity).toEqual(final.backup.source.proof.identity);
    const previous = new Map(final.backup.source.originalChanges().map(b=>[hash(b),Buffer.from(b).toString('hex')])), restoredHistory=new Map(restoredBackup.backup.source.originalChanges().map(b=>[hash(b),Buffer.from(b).toString('hex')])); for (const [key,value] of previous) expect(restoredHistory.get(key)).toBe(value); expect(restoredBackup.backup.source.originalChanges().length).toBeGreaterThan(previous.size);
    await restored.page.screenshot({path:info.outputPath('point-restored.png'),fullPage:true}); await close(restored.context,'restored'); expect(errors).toEqual([]);
  } finally { for (const [failureIndex,context] of [...contexts].entries()) { await context.pages()[0]?.screenshot({path:info.outputPath(`failure-${failureIndex}.png`),fullPage:true}).catch(()=>{}); if (tracing) await context.tracing.stop({path:info.outputPath(`failure-${contexts.size}.zip`)}).catch(()=>{}); await context.close(); } await info.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'}); }
});


test('大座標GLBの実描画に隠れる点を拒否し、非表示にすると元の点を選べる', async ({},info) => {
  const root=info.outputPath('gpu-profile'); await mkdir(root,{recursive:true}); const profile=await mkdtemp(join(root,'owned-'));
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'}), errors:string[]=[];
  context.setDefaultTimeout(15_000); await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===new URL(entry).origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort('blockedbyclient');});
  const page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const data=Buffer.from('ply\nformat ascii 1.0\nelement vertex 5\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n-7.5 0 0 255 0 0\n-9 -9 0 0 255 0\n9 9 0 0 0 255\n-9 9 0 255 255 0\n9 -9 0 255 0 255\n');
  const binary=new Uint8Array(36);new Float32Array(binary.buffer).set([99999992,-8,1,100000008,-8,1,99999992,8,1]);
  const glb=Buffer.from(serializeGlb({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[99999992,-8,1],max:[100000008,8,1]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.2,.5,.8,1],roughnessFactor:.7}}]},binary));
  try {
    await page.goto(entry);await page.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'point.ply',mimeType:'application/ply',buffer:data});await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await page.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('点群の作業');await page.getByRole('button',{name:'プロジェクトを作成',exact:true}).click();await ready(page);
    await page.getByRole('tab',{name:'モデル',exact:true}).click();const models=page.getByRole('tabpanel',{name:'モデル',exact:true}),choosing=page.waitForEvent('filechooser');await models.getByRole('button',{name:'3Dモデルを追加',exact:true}).click();await(await choosing).setFiles({name:'large-edge.glb',mimeType:'model/gltf-binary',buffer:glb});await expect(page.getByText('モデルを追加しました。',{exact:true})).toBeVisible();
    await models.locator('.lv-model-select').filter({hasText:'large-edge.glb'}).click();await models.getByRole('button',{name:'配置を調整',exact:true}).click();await models.getByLabel('モデル位置 X',{exact:true}).fill('-99999999');await models.getByRole('button',{name:'配置を確定',exact:true}).click();await expect(page.getByText('モデルの配置を確定しました。',{exact:true})).toBeVisible();await models.locator('.lv-model-select').filter({hasText:'point.ply'}).click();
    const location=async(meshVisible:boolean)=>{await page.getByRole('button',{name:'正面',exact:true}).click();await page.getByRole('button',{name:'全体表示',exact:true}).click();const box=(await page.getByLabel('3Dモデルの表示',{exact:true}).boundingBox())!,pose=fittedPose({min:[-9,-9,0],max:[9,9,meshVisible?1:0]},defaultPose(),box.width/box.height,'+z');if(pose.projection.kind!=='perspective')throw Error('camera');const camera=new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(pose.projection.verticalFov),box.width/box.height,.01,1000);camera.position.set(...pose.position);camera.up.set(...pose.up);camera.lookAt(new THREE.Vector3(...pose.target));camera.updateMatrixWorld(true);const ndc=new THREE.Vector3(-7.5,0,0).project(camera);return{x:(ndc.x+1)*box.width/2,y:(1-ndc.y)*box.height/2,dx:ndc.x*box.width/2,dy:-ndc.y*box.height/2};};
    await page.getByRole('tab',{name:'キャプション',exact:true}).click();const pin=page.getByRole('region',{name:'ピンの操作',exact:true}),canvas=page.getByLabel('3Dモデルの表示',{exact:true});let p=await location(true);expect((await sample(page,p.dx,p.dy)).slice(0,3)).not.toEqual([255,0,0]);await pin.getByRole('button',{name:'ピンを追加',exact:true}).click();await canvas.click({position:{x:p.x,y:p.y}});await expect(page.getByText('配置する面を特定できません。視点を変えて選び直してください。',{exact:true})).toBeVisible();await expect(pin.getByRole('button',{name:'位置を確定',exact:true})).toBeHidden();await pin.getByRole('button',{name:'取り消す',exact:true}).click();
    await page.getByRole('tab',{name:'モデル',exact:true}).click();await models.locator('.lv-model-select').filter({hasText:'large-edge.glb'}).click();await models.getByRole('button',{name:'隠す',exact:true}).click();await models.locator('.lv-model-select').filter({hasText:'point.ply'}).click();await page.getByRole('tab',{name:'キャプション',exact:true}).click();p=await location(false);expect((await sample(page,p.dx,p.dy)).slice(0,3)).toEqual([255,0,0]);await pin.getByRole('button',{name:'ピンを追加',exact:true}).click();await canvas.click({position:{x:p.x,y:p.y}});await expect(pin.getByLabel('位置 X',{exact:true})).toHaveValue('-7.5');await pin.getByRole('button',{name:'位置を確定',exact:true}).click();await expect(page.getByText('ピンの位置を確定しました。',{exact:true})).toBeVisible();expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('large-mesh-occlusion.png'),fullPage:true});
  } finally {await context.tracing.stop({path:info.outputPath('gpu-trace.zip')});await context.close();await info.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'});}
});
