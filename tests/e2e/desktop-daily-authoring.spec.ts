import { desktopOrigin, desktopEntry } from './desktopEntry';
import { revealCoordinateAdd, revealFileSurface } from './workspaceUi';
import { test, expect, chromium, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as A from '@automerge/automerge';
import { triangleGlb, smallPng } from './fixtures';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits as limits } from '../../src/projectFiles/validation';

async function ready(page: Page, text: string) { await expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 90_000 }); await expect(page.locator('main.lv-project-workspace > header > p.lv-operation-status')).toHaveAttribute('data-busy', 'false'); }
async function output(page: Page, info: TestInfo, name: string, purpose: 'backup' | 'teamWorkspace') {
  const menu = page.locator('details.lv-project-files'); if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
  const area = page.getByRole('region', { name: 'ファイル', exact: true }); if(!await revealFileSurface(page,purpose==='backup'?'保存':'共有')) await area.getByRole('button', { name: purpose === 'backup' ? '保存' : '相手に渡す', exact: true }).click();
  if (purpose === 'backup') await area.getByLabel('名前（任意）', { exact: true }).fill(name); else await area.getByLabel('渡す内容', { exact: true }).selectOption(purpose);
  const primary = area.locator('button.lv-file-primary'); await expect(primary).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), primary.click()]), path = info.outputPath(name + '.zip'); await download.saveAs(path);
  expect(await download.failure()).toBeNull(); await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 90_000 }); return path;
}
async function backupRecords(path: string) {
  const archive = await BackupArchive.inspect(new Blob([Uint8Array.from(await readFile(path)).buffer]), limits), c = await inspectProjectCandidates(archive.source.read(), limits);
  if (c.kind !== 'project-candidate-inspection') throw Error('metadata'); return { archive, records: c.unambiguousRecords as Record<string, any> };
}
test('daily Scene and Caption organization, tags, alignment, settings and files survive a full cold restart', async ({}, info) => {
  test.setTimeout(600_000); A.getHeads(A.init()); await mkdir('.artifacts/e2e/profiles', { recursive: true }); const profile = await mkdtemp('.artifacts/e2e/profiles/daily-');
  const contexts = new Set<BrowserContext>(), errors: string[] = [], remote: string[] = [];
  const launch = async (ownedProfile=profile) => {
    const context = await chromium.launchPersistentContext(ownedProfile, { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true }); contexts.add(context);
    await context.addInitScript(()=>{const urls:string[]=[];(window as any).__releasedMediaUrls=urls;const revoke=URL.revokeObjectURL;URL.revokeObjectURL=function(url:string){urls.push(url);return revoke.call(URL,url);};});
    await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === desktopOrigin || ['blob:', 'data:'].includes(u.protocol)) return route.continue(); remote.push(u.href); return route.abort('blockedbyclient'); });
    const page = context.pages()[0] ?? await context.newPage(); page.setDefaultTimeout(15_000); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); await page.goto(desktopEntry); return { page, context };
  };
  try {
    const first = await launch(), p = first.page;
    const heicBytes=await readFile('tests/fixtures/daily-media/owned-still.heic'),nativeHeic=await p.evaluate(async bytes=>{try{const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/heic'}));const valid=bitmap.width===96&&bitmap.height===64;bitmap.close();return valid;}catch{return false;}},[...heicBytes]);
    if(!nativeHeic){
      await p.getByLabel('ファイルを選択',{exact:true}).setInputFiles([{name:'基準.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()},{name:'owned-still.heic',mimeType:'image/heic',buffer:heicBytes}]);await p.getByRole('button',{name:'ファイルを開く',exact:true}).click();
      await expect(p.getByRole('status').filter({hasText:'端末で別のJPEG'}).first()).toBeVisible();await expect(p.getByRole('textbox',{name:'プロジェクト名',exact:true})).not.toBeVisible();await expect(p.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveCount(0);
    }
    await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles([{ name: '基準.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() }, { name: '移動するモデル.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb(.25) }]);
    await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await p.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill('日常の編集'); await p.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('日常の編集', { timeout: 90_000 }); await expect(p.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false');
    console.log('daily: project created');
    const originalSceneName = await p.getByRole('region', { name: 'シーン', exact: true }).locator('button[aria-pressed="true"]').innerText();
    expect(originalSceneName).toBe('シーン 1');
    await revealCoordinateAdd(p); const owner = p.getByLabel('追加先モデル', { exact: true }); await owner.focus(); await owner.selectOption({ label: '基準.glb' }); await expect(p.getByRole('button', { name: 'このモデルに追加', exact: true })).toBeEnabled(); await p.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const [axis, value] of [['X', '0'], ['Y', '.5'], ['Z', '0']]) await p.getByLabel(`位置 ${axis}`, { exact: true }).fill(value!);
    await p.getByRole('button', { name: '位置を確定', exact: true }).click(); await ready(p, 'ピンの位置を確定しました。');
    await p.getByRole('button', { name: '記録の変更を元に戻す', exact: true }).click(); await ready(p, '記録の変更を元に戻しました。'); await expect(p.locator('.lv-caption-select')).toHaveCount(0);
    await p.getByRole('button', { name: '記録の変更をやり直す', exact: true }).click(); await ready(p, '記録の変更をやり直しました。'); await expect(p.locator('.lv-caption-select')).toHaveCount(1);
    await p.getByLabel('タイトル', { exact: true }).fill('元の記録'); await p.getByLabel('本文', { exact: true }).fill('元の本文'); await p.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready(p, '変更を適用しました。');
    const chooser = p.waitForEvent('filechooser'); await p.getByLabel('メディアを追加', { exact: true }).click(); await (await chooser).setFiles({ name: '現地.png', mimeType: 'image/png', buffer: smallPng() }); await ready(p, 'メディアを追加しました。');
    await p.getByRole('button', { name: '記録の変更を元に戻す', exact: true }).click(); await ready(p, '記録の変更を元に戻しました。'); await expect(p.getByRole('region', {name:'添付メディア',exact:true}).getByRole('figure')).toHaveCount(0);
    await p.getByRole('button', { name: '記録の変更をやり直す', exact: true }).click(); await ready(p, '記録の変更をやり直しました。'); await expect(p.getByRole('region', {name:'添付メディア',exact:true}).getByRole('figure')).toHaveCount(1);
    const timedFiles=await Promise.all(['owned-video.mp4','owned-audio.m4a','owned-audio.mp3'].map(async name=>({name,mimeType:name.endsWith('.mp4')?'video/mp4':name.endsWith('.m4a')?'audio/mp4':'audio/mpeg',buffer:await readFile(`tests/fixtures/daily-media/${name}`)})));
    const play=async(page:Page,kind:'video'|'audio',name:string)=>{
      const gallery=page.getByRole('region',{name:'メディアの整理',exact:true});
      await gallery.getByRole('figure').filter({hasText:name}).getByRole('button',{name:kind==='video'?'動画を再生':'音声を再生',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'メディアビューア',exact:true}),node=dialog.locator(kind);await expect(node).toBeVisible();expect(await node.getAttribute('autoplay')).toBeNull();
      await node.evaluate(async n=>{await(n as HTMLMediaElement).play();});await expect.poll(()=>node.evaluate(n=>(n as HTMLMediaElement).currentTime)).toBeGreaterThan(.2);
      if(kind==='video')expect(await node.evaluate(n=>(n as HTMLVideoElement).getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(0);
      const playerBox=await node.boundingBox(),dialogBox=await dialog.boundingBox();expect(playerBox!.width).toBeLessThanOrEqual(dialogBox!.width);
      const url=await node.getAttribute('src'),handle=await node.elementHandle();await dialog.getByRole('button',{name:'閉じる',exact:true}).click();await expect(dialog).not.toBeVisible();expect(await handle!.evaluate(n=>(n as HTMLMediaElement).paused&&!n.isConnected&&!n.getAttribute('src'))).toBe(true);expect(await page.evaluate(url=>(window as any).__releasedMediaUrls.includes(url),url)).toBe(true);
    };
    for(const file of timedFiles){const pick=p.waitForEvent('filechooser');await p.getByLabel('メディアを追加',{exact:true}).click();await(await pick).setFiles(file);await ready(p,'メディアを追加しました。');await play(p,file.mimeType==='video/mp4'?'video':'audio',file.name);}
    await expect(p.locator('.lv-media-grid video,.lv-media-grid audio')).toHaveCount(0);
    const heicPick=p.waitForEvent('filechooser');await p.getByLabel('メディアを追加',{exact:true}).click();await(await heicPick).setFiles({name:'owned-still.heic',mimeType:'image/heic',buffer:heicBytes});
    if(nativeHeic)await ready(p,'メディアを追加しました。');else{await expect(p.locator('main.lv-project-workspace > header > p.lv-operation-status')).toContainText('端末で別のJPEG');await p.getByRole('region',{name:'メディア',exact:true}).getByRole('button',{name:'選択を取り消す',exact:true}).click();await expect(p.locator('main.lv-project-workspace > header > p.lv-operation-status')).toHaveText('');}
    await info.attach('native-media-environment',{body:JSON.stringify({browser:first.context.browser()?.version()??await p.evaluate(()=>navigator.userAgent),nativeHeic,avcAacMp3:'actual initial decode and play time/frame progression passed'},null,2),contentType:'application/json'});
    console.log('daily: original media playback and HEIC capability verified');
    const tags = p.getByLabel('タグの管理', { exact: true }); await tags.locator('summary').click(); await tags.getByLabel('タグ名', { exact: true }).fill('現地'); await tags.getByRole('button', { name: 'タグを追加', exact: true }).click(); await ready(p, 'タグを保存しました。');
    await tags.getByRole('button', { name: 'この記録にタグを付ける', exact: true }).click(); await ready(p, '記録のタグを変更しました。');
    await p.getByRole('button', { name: '記録を複製', exact: true }).click(); await ready(p, '記録を複製しました。元の記録は変わりません。');
    await p.getByLabel('タイトル', { exact: true }).fill('複製の記録'); await p.getByLabel('本文', { exact: true }).fill('独立した本文'); await p.getByRole('button', { name: '変更を適用', exact: true }).click(); await ready(p, '変更を適用しました。');
    await p.getByRole('button', { name: '記録の変更を元に戻す', exact: true }).click(); await ready(p, '記録の変更を元に戻しました。'); await expect(p.getByLabel('本文', { exact: true })).toHaveValue('元の本文');
    await p.getByRole('button', { name: '記録の変更をやり直す', exact: true }).click(); await ready(p, '記録の変更をやり直しました。');
    await p.getByRole('button', {name:'プロジェクトから削除',exact:true}).click(); await p.getByRole('region',{name:'削除の確認',exact:true}).getByRole('button',{name:'削除する',exact:true}).click(); await ready(p,'プロジェクトから削除しました。'); await expect(p.locator('.lv-caption-select')).toHaveCount(1);
    await p.getByRole('button',{name:'記録の変更を元に戻す',exact:true}).click(); await ready(p,'記録の変更を元に戻しました。'); await expect(p.getByLabel('本文',{exact:true})).toHaveValue('独立した本文');
    await p.getByRole('button',{name:'記録の変更を元に戻す',exact:true}).click(); await ready(p,'記録の変更を元に戻しました。'); await expect(p.getByLabel('本文',{exact:true})).toHaveValue('元の本文');
    await p.getByRole('button',{name:'記録の変更を元に戻す',exact:true}).click(); await ready(p,'記録の変更を元に戻しました。'); await expect(p.locator('.lv-caption-select')).toHaveCount(1);
    for(let i=0;i<3;i++){await p.getByRole('button',{name:'記録の変更をやり直す',exact:true}).click();await ready(p,'記録の変更をやり直しました。');}
    await expect(p.locator('.lv-caption-select')).toHaveCount(1); await p.getByRole('button',{name:'記録の変更を元に戻す',exact:true}).click();await ready(p,'記録の変更を元に戻しました。');await expect(p.getByLabel('本文',{exact:true})).toHaveValue('独立した本文');
    await p.getByRole('button', { name: '次の記録', exact: true }).click(); await expect(p.getByLabel('タイトル', { exact: true })).toHaveValue('元の記録');
    await p.getByRole('button', { name: '前の記録', exact: true }).click(); await expect(p.getByLabel('タイトル', { exact: true })).toHaveValue('複製の記録');
    console.log('daily: records and undo verified');
    const search = p.getByRole('region', { name: 'キャプション', exact: true }).locator('.lv-caption-search').getByLabel('検索', { exact: true });
    await search.fill('複製'); await expect(p.getByRole('button', { name: '次の記録', exact: true })).toBeDisabled(); await search.fill('');
    await p.getByText('シーンを管理', { exact: true }).click(); await p.getByRole('button', { name: 'シーンを複製', exact: true }).click(); await p.getByLabel('複製するシーン名', { exact: true }).fill('現地調査'); await p.getByRole('button', { name: '複製を作成', exact: true }).click(); await ready(p, 'シーンを複製しました。記録は別々に編集できます。');
    await p.getByRole('button', { name: '表示順を前へ', exact: true }).click(); await ready(p, 'シーンの順序を変更しました。');
    await p.getByRole('button', { name: '開始シーンにする', exact: true }).click(); await p.getByRole('button', { name: '開始シーンを設定', exact: true }).click(); await ready(p, '開始シーンを設定しました。');
    await p.getByRole('region', { name: 'シーン', exact: true }).getByRole('button', { name: originalSceneName, exact: true }).click(); await p.getByRole('button', { name: 'シーンを削除', exact: true }).click(); await p.getByRole('button', { name: 'このシーンを削除する', exact: true }).click(); await ready(p, 'シーンを削除しました。記録・モデル・画像はプロジェクトに残っています。');
    console.log('daily: Scene organization verified');
    await p.getByRole('tab', { name: 'モデル', exact: true }).click(); const models = p.getByRole('tabpanel', { name: 'モデル', exact: true });
    await models.locator('.lv-model-select').filter({ hasText: '移動するモデル.glb' }).click(); await models.getByRole('button', { name: '配置を調整', exact: true }).click(); await models.getByLabel('モデル位置 X', { exact: true }).fill('5'); await models.getByLabel('モデル倍率', { exact: true }).fill('2'); await models.getByRole('button', { name: '配置を確定', exact: true }).click(); await ready(p, 'モデルの配置を確定しました。');
    await models.getByLabel('位置合わせ', { exact: true }).locator('summary').click(); await models.locator('.lv-model-select').filter({ hasText: '基準.glb' }).click(); await models.getByRole('button', { name: 'このモデルを基準にする', exact: true }).click(); await expect(models.getByRole('button', { name: '配置を調整', exact: true })).toBeDisabled();
    await models.locator('.lv-model-select').filter({ hasText: '移動するモデル.glb' }).click(); await models.getByRole('button', { name: '基準の中心と大きさに合わせる', exact: true }).click(); await models.getByRole('button', { name: '配置を確定', exact: true }).click(); await ready(p, 'モデルの配置を確定しました。');
    await models.getByRole('button', { name: '配置を元に戻す', exact: true }).click(); await ready(p, '配置を元に戻しました。'); await models.getByRole('button', { name: '配置をやり直す', exact: true }).click(); await ready(p, '配置をやり直しました。');
    await models.getByLabel('回転・拡縮の基準', { exact: true }).selectOption('centre'); await models.getByRole('button', { name: '配置を調整', exact: true }).click(); await models.getByLabel('モデル回転 Z', { exact: true }).fill('90'); await models.getByRole('button', { name: '配置を確定', exact: true }).click(); await ready(p, 'モデルの配置を確定しました。');
    await models.getByRole('button', { name: '読み込み時の配置に戻す', exact: true }).click(); await models.getByRole('button', { name: '配置を取り消す', exact: true }).click();
    console.log('daily: alignment verified');
    const settings = p.getByLabel('設定', { exact: true }); await settings.locator('summary').click(); await settings.getByLabel('このブラウザの表示名', { exact: true }).fill('現地担当'); await settings.getByRole('button', { name: '表示名を設定', exact: true }).click(); await expect(settings.getByRole('status')).toHaveText('このブラウザの表示名を設定しました。'); await expect(p.getByLabel('このブラウザの利用者', { exact: true })).toHaveText('現地担当');
    await p.screenshot({ path: info.outputPath('daily-authoring.png'), fullPage: true });
    const saved = await output(p, info, 'daily-backup', 'backup'), before = await backupRecords(saved), workspace = await output(p, info, 'daily-workspace', 'teamWorkspace');
    const sent = await WorkspaceArchive.inspect(new Blob([Uint8Array.from(await readFile(workspace)).buffer]), limits); expect(sent.source.originalChanges()).toEqual(before.archive.source.originalChanges());
    const activeCaptions = Object.values(before.records.captionsById); expect(activeCaptions).toHaveLength(4); expect(activeCaptions.filter((c: any) => c.body === '独立した本文')).toHaveLength(2);
    for (const bytes of [triangleGlb(), triangleGlb(.25), smallPng(),...timedFiles.map(f=>f.buffer),...(nativeHeic?[heicBytes]:[])]) {
      const digest = createHash('sha256').update(bytes).digest('hex'); expect(Buffer.from(await before.archive.archive.entryBytes(`blobs/sha256/${digest}`, bytes.length))).toEqual(bytes);
    }
    expect(Object.values(before.records.captionAttachmentsById)).toHaveLength(nativeHeic?20:16); expect(Object.values(before.records.mediaResourcesById)).toHaveLength(nativeHeic?5:4);
    await first.context.close(); contexts.delete(first.context); const cold = await launch(); await expect(cold.page.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText('日常の編集', { timeout: 90_000 });
    await expect(cold.page.getByRole('button',{name:'記録の変更を元に戻す',exact:true})).toBeDisabled(); await expect(cold.page.getByRole('button',{name:'記録の変更をやり直す',exact:true})).toBeDisabled();
    await cold.page.getByLabel('設定', { exact: true }).locator('summary').click(); await expect(cold.page.getByLabel('このブラウザの表示名', { exact: true })).toHaveValue('現地担当');
    const after = await backupRecords(await output(cold.page, info, 'daily-cold', 'backup')); expect(after.records).toEqual(before.records); expect(after.archive.source.token).toBe(before.archive.source.token);
    await cold.page.getByRole('tab',{name:'キャプション',exact:true}).click();await cold.page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').filter({hasText:'複製の記録'}).click();await play(cold.page,'audio','owned-audio.mp3');
    await cold.page.setViewportSize({width:320,height:740});await play(cold.page,'video','owned-video.mp4');await cold.page.screenshot({path:info.outputPath('daily-media-320.png'),fullPage:true});
    const recipient=await launch(await mkdtemp('.artifacts/e2e/profiles/daily-recipient-'));await recipient.page.getByLabel('ファイルを選択',{exact:true}).setInputFiles(workspace);await recipient.page.getByRole('button',{name:'ファイルを開く',exact:true}).click();await expect(recipient.page.getByRole('heading',{name:'プロジェクト名',exact:true})).toHaveText('日常の編集',{timeout:90000});await recipient.page.getByRole('list',{name:'キャプション一覧',exact:true}).locator('.lv-caption-select').filter({hasText:'複製の記録'}).click();await play(recipient.page,'video','owned-video.mp4');const received=await backupRecords(await output(recipient.page,info,'daily-recipient-backup','backup'));expect(received.records).toEqual(before.records);expect(received.archive.source.originalChanges()).toEqual(before.archive.source.originalChanges());
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally { for (const context of contexts) await context.close(); }
});
