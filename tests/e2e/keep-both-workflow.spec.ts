import { sceneModelBinding, scenePinAnchor, chooseHomeFiles, expectSelectedCaptionPhotos, expectResumedProject, openAddOptions, revealCoordinateAdd, beginSceneCreation, revealCaptionList } from './workspaceUi';
import { test, expect, chromium, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as Automerge from '@automerge/automerge';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { PackageArchive } from '../../src/projectPackage/zipArchive';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import type { ProjectMetadataSource } from '../../src/projectMetadata/source';
import { triangleGlb, smallPng } from './fixtures';

const entry = `http://127.0.0.1:4182/dev.html?editor=project${process.env.LOCIVIEW_E2E_TIMINGS === '1' ? '&timings=1' : ''}`;
const projectName = '別々の記録として引き継ぐプロジェクト', targetScene = '共同作業', initialTitle = '共有する記録';
const originalTitle = '元の記録', copyTitle = '分けた記録', originalBody = 'Aが元の記録に追記した本文', copyBody = 'Bが分けた記録に追記した本文';
const copyAlt = '分けた記録だけの画像説明', actionTimeout = 90_000, fileTimeout = 180_000;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const history = (source: ProjectMetadataSource) => source.originalChanges().map(bytes => [sha(bytes), Buffer.from(bytes).toString('hex')]).sort((a, b) => a[0]!.localeCompare(b[0]!));
const fileBlob = async (path: string) => new Blob([new Uint8Array(await readFile(path)).buffer]);
const modelPanel = (page: Page) => page.getByRole('tabpanel', { name: 'モデル', exact: true });
const modelRows = (page: Page) => modelPanel(page).getByRole('list', { name: 'プロジェクトのモデル一覧', exact: true }).locator('.lv-model-select');
const detail = (page: Page) => page.getByRole('region', { name: '記録の詳細', exact: true });
async function settled(page: Page) { await expect(page.locator('header > .lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: actionTimeout }); }
async function done(page: Page, message: string) { await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: actionTimeout }); await settled(page); }
async function scene(page: Page, name: string) {
  await revealCaptionList(page);
  await page.getByRole('tab', { name: '記録', exact: true }).click();
  await page.getByRole('combobox', { name: 'シーン', exact: true }).selectOption({ label: name });
  await expect(page.getByRole('combobox', { name: 'シーン', exact: true }).locator('option:checked')).toHaveText(name);
}
async function caption(page: Page, title: string) {
  await revealCaptionList(page);
  await page.getByRole('tab', { name: '記録', exact: true }).click();
  await page.getByRole('list', { name: '記録一覧', exact: true }).locator('.lv-caption-select').filter({ hasText: title }).click();
}
async function editCaption(page: Page, title: string, body: string) {
  await detail(page).getByLabel('タイトル', { exact: true }).fill(title); await detail(page).getByLabel('本文', { exact: true }).fill(body);
  await detail(page).getByRole('button', { name: '変更を適用', exact: true }).click(); await done(page, '変更を適用しました。');
}
const checkImage = (page: Page) => expectSelectedCaptionPhotos(page, 1, 2);
async function download(page: Page, info: TestInfo, name: string, purpose: 'backup' | 'teamWorkspace' | 'contribution', base?: string) {
  const area = page.getByRole('region', { name: 'ファイル', exact: true });
  await area.getByRole('button', { name: purpose === 'backup' ? '保存' : '相手に渡す', exact: true }).click();
  if (purpose === 'backup') await area.getByLabel('保存名（任意）', { exact: true }).fill(name);
  else { await area.getByLabel('渡す内容', { exact: true }).selectOption(purpose);
    if (purpose === 'contribution') { expect(base).toBeTruthy(); await area.getByLabel('相手と共有したファイル', { exact: true }).selectOption(base!); await expect(area.getByLabel('相手と共有したファイル', { exact: true })).toHaveValue(base!); } }
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: fileTimeout }), area.getByRole('button', { name: purpose === 'backup' ? 'ファイルに保存' : 'ダウンロード', exact: true }).click()]);
  const path = info.outputPath(`${name}.zip`); await file.saveAs(path); expect(await file.failure()).toBeNull();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: fileTimeout }); return path;
}
async function receive(page: Page, path: string) {
  const area = page.getByRole('region', { name: '更新ファイル', exact: true }); await area.getByLabel('更新ファイルを選択', { exact: true }).setInputFiles(path);
  await expect(area.getByText('更新を受け取りました。', { exact: true })).toBeHidden(); await area.getByRole('button', { name: '更新を受け取る', exact: true }).click();
  await expect(area.getByText('更新を受け取りました。', { exact: true })).toBeVisible({ timeout: actionTimeout });
}
async function records(source: ProjectMetadataSource) {
  const inspected = await inspectProjectCandidates(source.read(), validationMetadataLimits); if (inspected.kind !== 'project-candidate-inspection') throw Error('metadata rejected');
  return inspected.unambiguousRecords as Record<string, any>;
}
async function backup(path: string) { const file = await BackupArchive.inspect(await fileBlob(path), validationMetadataLimits); return { file, records: await records(file.source), history: history(file.source) }; }

test('二人の重複登録を両方残し、元と独立コピーを別々に編集して返送・再開できる', async ({}, info) => {
  test.setTimeout(900_000); Automerge.getHeads(Automerge.init());
  const root = info.outputPath('profiles'); await mkdir(root, { recursive: true });
  const profiles = { A: await mkdtemp(join(root, 'keep-A-')), B: await mkdtemp(join(root, 'keep-B-')) };
  const contexts = new Map<string, BrowserContext>(), errors: string[] = [], stages: Record<string, number> = {}, contributions: string[][] = [];
  const tracing = process.env.LOCIVIEW_E2E_TRACE !== '0', evidence: Record<string, unknown> = { stages }, glb = triangleGlb(), png = smallPng();
  const launch = async (who: 'A' | 'B') => {
    const context = await chromium.launchPersistentContext(profiles[who], { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
    contexts.set(who, context); context.setDefaultTimeout(15_000);
    await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === new URL(entry).origin || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient'); });
    if (tracing) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = context.pages()[0] ?? await context.newPage(); page.on('pageerror', error => errors.push(`${who}: ${error.message}`)); await page.goto(entry); return page;
  };
  const close = async (who: string) => {
    const context = contexts.get(who); if (!context) return; contexts.delete(who);
    try { for (const page of context.pages()) {
      const read = await page.evaluate(async () => { document.dispatchEvent(new Event('lociview-timing-snapshot')); return { locks: await navigator.locks.query(), measures: performance.getEntriesByType('measure').filter(e => e.name.startsWith('lociview.')).map(e => ({ name: e.name, duration: e.duration, detail: (e as PerformanceMeasure).detail })) }; });
      await info.attach(`${who} 終了前の計測`, { body: JSON.stringify(read), contentType: 'application/json' });
    } if (tracing) await context.tracing.stop({ path: info.outputPath(`${who}-${Date.now()}-trace.zip`) }); } finally { await context.close(); }
  };
  const step = async (name: string, action: () => Promise<void>) => { const start = performance.now(); try { await test.step(name, action); } finally { stages[name] = Math.round(performance.now() - start); console.info(`${name}: ${stages[name]}ms`); } };
  let failed = false;
  try {
    let a = await launch('A'), b = await launch('B'), firstScene = '';
    const html = await a.request.get('http://127.0.0.1:4182/dev.html'); expect(sha(await html.body())).toBe(sha(await readFile('validation-dist/dev.html')));
    await info.attach('実行環境', { body: JSON.stringify({ browser: contexts.get('A')!.browser()!.version(), node: process.version, platform: process.platform, headless: true, tracing, route: entry, independentProfiles: profiles.A !== profiles.B,
      assets: await Promise.all((await readdir('validation-dist/assets')).map(async name => ({ name, sha256: sha(await readFile(join('validation-dist/assets', name))) }))) }), contentType: 'application/json' });
    let base!: Awaited<ReturnType<typeof WorkspaceArchive.inspect>>, seed!: Record<string, any>, originalAsset = '', originalCaption = '', originalSceneId = '', targetSceneId = '';
    await step('元のシーンを保ち、二人が同じモデルと記録を別々に追加する', async () => {
      await chooseHomeFiles(a, { name: 'shared.glb', mimeType: 'model/gltf-binary', buffer: glb });
      await a.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill(projectName); await a.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
      await expect(a.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(projectName);
      firstScene = (await a.getByRole('region', { name: 'シーン', exact: true }).locator('select[aria-label="シーン"] option:checked').textContent())!;
      await revealCoordinateAdd(a); const target = a.getByLabel('追加先モデル', { exact: true }); await target.focus();
      const values = await target.locator('option').evaluateAll(nodes => nodes.map(n => (n as HTMLOptionElement).value).filter(Boolean)); expect(values).toHaveLength(1); await target.selectOption(values[0]!);
      await a.getByRole('button', { name: 'このモデルに追加', exact: true }).click(); for (const [axis, value] of [['X', '0.2'], ['Y', '0.2'], ['Z', '0']]) await a.getByRole('region', { name: '位置の調整', exact: true }).getByLabel(`位置 ${axis}`, { exact: true }).fill(value!);
      await a.getByRole('button', { name: 'ここに記録を作る', exact: true }).click(); await done(a, 'ピンの位置を確定しました。'); await editCaption(a, initialTitle, '配布した本文');
      const picker = a.waitForEvent('filechooser'); await a.getByLabel('メディアを追加', { exact: true }).click(); await (await picker).setFiles({ name: '共有画像.png', mimeType: 'image/png', buffer: png }); await a.getByRole('region',{name:'記録の詳細',exact:true}).getByRole('button',{name:'変更を適用',exact:true}).click(); await done(a, 'メディアを追加しました。');
      await a.getByRole('tab', { name: 'モデル', exact: true }).click(); await modelRows(a).first().click(); await modelPanel(a).getByRole('button', { name: '配置を調整', exact: true }).click();
      await modelPanel(a).getByLabel('位置 X', { exact: true }).fill('0.75'); await modelPanel(a).getByLabel('倍率', { exact: true }).fill('1.25');
      await modelPanel(a).getByRole('button', { name: '配置を確定', exact: true }).click(); await done(a, 'モデルの配置を確定しました。');
      await a.getByRole('tab', { name: '記録', exact: true }).click(); await beginSceneCreation(a); await a.getByLabel('シーン名', { exact: true }).fill(targetScene); await a.getByRole('button', { name: 'シーンを追加', exact: true }).click(); await done(a, 'シーンを追加しました。');
      await a.getByRole('tab', { name: 'モデル', exact: true }).click(); const check = modelPanel(a).getByRole('checkbox', { name: 'このシーンに表示', exact: true });
      await check.click(); await done(a, 'このシーンからモデルを外しました。'); await expect(check).not.toBeChecked(); await scene(a, firstScene);
      const initial = await download(a, info, 'W0-登録前の作業一式', 'teamWorkspace'); base = await WorkspaceArchive.inspect(await fileBlob(initial), validationMetadataLimits); seed = await records(base.source);
      originalAsset = Object.keys(seed.assetsById)[0]!; originalCaption = Object.keys(seed.captionsById)[0]!;
      originalSceneId = Object.keys(seed.scenesById).find(id => seed.scenesById[id].name === firstScene)!; targetSceneId = Object.keys(seed.scenesById).find(id => seed.scenesById[id].name === targetScene)!;
      await chooseHomeFiles(b, initial); await b.getByRole('button', { name: 'プロジェクトを取り込む', exact: true }).click(); await expect(b.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(projectName, { timeout: actionTimeout });
      for (const page of [a, b]) {
        await scene(page, targetScene); await page.getByRole('tab', { name: 'モデル', exact: true }).click(); const toggle = modelPanel(page).getByRole('checkbox', { name: 'このシーンに表示', exact: true });
        await expect(toggle).not.toBeChecked(); await toggle.click(); await done(page, 'このシーンにモデルを追加しました。'); await expect(toggle).toBeChecked();
        await page.getByRole('tab', { name: '記録', exact: true }).click(); await openAddOptions(page);
        const include = page.locator('details.lv-caption-include'); await include.getByText('既存の記録を追加', { exact: true }).click();
        await include.getByLabel('記録', { exact: true }).selectOption(originalCaption); await include.getByRole('button', { name: 'このシーンに追加', exact: true }).click(); await done(page, 'このシーンに追加しました。');
      }
      evidence.initial = { identity: base.source.proof.identity, heads: base.source.heads, originalAsset, originalCaption, originalSceneId, targetSceneId };
    });
    const contribution = async (page: Page, name: string) => {
      const path = await download(page, info, name, 'contribution', base.archive.control.manifest.packageId), archive = await PackageArchive.inspect(await fileBlob(path)), manifest = archive.control.manifest;
      if (manifest.purpose !== 'contribution') throw Error('contribution'); expect(manifest.identity).toEqual(base.source.proof.identity); expect(manifest.base.workspacePackageId).toBe(base.archive.control.manifest.packageId); expect(manifest.base.heads).toEqual(base.source.heads);
      for (const part of manifest.changes) { const bytes = await archive.entryBytes(`changes/${String(part.ordinal).padStart(8, '0')}.amchange`, part.byteLength); expect(sha(bytes)).toBe(part.bytesSha256); contributions.push([sha(bytes), Buffer.from(bytes).toString('hex')]); } return path;
    };
    let split!: Record<string, any>, copyAsset = '', copyCaption = '';
    await step('元と独立コピーの影響を確認してモデルと記録を両方残す', async () => {
      await receive(a, await contribution(b, 'B0-別々に追加した登録'));
      const reviewToggle = a.getByRole('button', { name: /^残す内容を選ぶ/ }); await reviewToggle.click();
      const group = a.getByRole('region', { name: '記録の競合', exact: true }).getByRole('listitem', { name: `${targetScene}：${initialTitle}の重複登録`, exact: true });
      await expect(group).toContainText(firstScene); await expect(group).not.toContainText('入力の長さ・改行・空白'); await expect(group.getByRole('button', { name: '競合を解消', exact: true })).toBeDisabled();
      await reviewToggle.click(); await a.getByRole('tab', { name: 'モデル', exact: true }).click(); const modelGroup = modelPanel(a).getByRole('region', { name: `${targetScene}：shared.glbの重複登録`, exact: true });
      await expect(modelGroup).toContainText(firstScene); await expect(modelGroup).toContainText('既存の記録は元のモデルに残ります');
      await expect(modelGroup.getByLabel('残すモデル登録', { exact: true })).toHaveValue(''); await expect(modelGroup.getByRole('button', { name: '選択を確定', exact: true })).toBeDisabled();
      await modelGroup.getByLabel('重複するモデル', { exact: true }).selectOption('both');
      const candidates = await modelGroup.getByLabel('残すモデル登録', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(n => (n as HTMLOptionElement).value).filter(Boolean)); expect(candidates).toHaveLength(2);
      await modelGroup.getByLabel('残すモデル登録', { exact: true }).selectOption(candidates[0]!); evidence.originalModelEdge = candidates[0]; evidence.modelCandidates = candidates;
      await expect(modelGroup.getByLabel('残すモデル登録', { exact: true })).toHaveCSS('background-color', 'rgb(248, 245, 237)');
      await expect(modelGroup.getByLabel('重複するモデル', { exact: true })).toHaveCSS('color', 'rgb(53, 50, 41)');
      await expect(modelPanel(a)).not.toContainText('モデルの配置を確定するか'); await modelGroup.scrollIntoViewIfNeeded(); await a.screenshot({ path: info.outputPath('モデルの両方残す確認.png'), fullPage: true });
      await modelGroup.getByRole('button', { name: '選択を確定', exact: true }).click(); await done(a, 'モデルの登録を整理しました。'); await expect(modelRows(a)).toHaveCount(2);
      await a.getByRole('tab', { name: '記録', exact: true }).click(); await reviewToggle.click(); await expect(group.getByRole('combobox').first()).toHaveValue('');
      const choices = await group.getByRole('combobox').first().locator('option').evaluateAll(nodes => nodes.map(n => (n as HTMLOptionElement).value).filter(Boolean)); expect(choices).toHaveLength(2);
      await group.getByRole('combobox').first().selectOption(choices[0]!); await expect(group.getByRole('button', { name: '競合を解消', exact: true })).toBeDisabled();
      await group.getByRole('combobox').nth(1).selectOption('both'); evidence.originalCaptionEdge = choices[0]; evidence.captionCandidates = choices;
      await expect(group.getByRole('combobox').first()).toHaveCSS('background-color', 'rgb(248, 245, 237)');
      await expect(group.getByRole('combobox').nth(1)).toHaveCSS('color', 'rgb(53, 50, 41)');
      await group.scrollIntoViewIfNeeded(); await a.screenshot({ path: info.outputPath('記録の両方残す確認.png'), fullPage: true });
      await group.getByRole('button', { name: '競合を解消', exact: true }).click(); await settled(a); await expect(group).toBeHidden({ timeout: actionTimeout });
      const workspacePath = await download(a, info, 'W1-独立した二つの登録', 'teamWorkspace'), workspace = await WorkspaceArchive.inspect(await fileBlob(workspacePath), validationMetadataLimits); split = await records(workspace.source);
      expect(Object.keys(split.assetsById)).toHaveLength(2); expect(Object.keys(split.captionsById)).toHaveLength(2); copyAsset = Object.keys(split.assetsById).find(id => id !== originalAsset)!; copyCaption = Object.keys(split.captionsById).find(id => id !== originalCaption)!;
      expect(split.assetsById[originalAsset]).toEqual(seed.assetsById[originalAsset]); expect(split.captionsById[originalCaption]).toEqual(seed.captionsById[originalCaption]);
      for (const [map, ids, keep] of [['sceneAssetMembershipsById', candidates, candidates[0]], ['sceneCaptionMembershipsById', choices, choices[0]]] as const) {
        for (const id of ids) expect(split[map][id].lifecycle.state).toBe(id === keep ? 'active' : 'deleted');
        for (const row of Object.values(seed[map]) as any[]) if (row.sceneId === originalSceneId) expect(split[map][row.id]).toEqual(row);
      }
      const active = (table: string, id: string, field: string) => Object.values(split[table]).filter((e: any) => e.lifecycle.state === 'active' && e[field] === id).map((e: any) => e.sceneId).sort();
      expect(active('sceneAssetMembershipsById', originalAsset, 'assetId')).toEqual([originalSceneId, targetSceneId].sort()); expect(active('sceneAssetMembershipsById', copyAsset, 'assetId')).toEqual([targetSceneId]);
      expect(active('sceneCaptionMembershipsById', originalCaption, 'captionId')).toEqual([originalSceneId, targetSceneId].sort()); expect(active('sceneCaptionMembershipsById', copyCaption, 'captionId')).toEqual([targetSceneId]);
      expect(split.captionsById[copyCaption].anchor).toEqual(seed.captionsById[originalCaption].anchor);
      const original = split.assetsById[originalAsset], copy = split.assetsById[copyAsset], binding = sceneModelBinding(split, copyAsset, targetSceneId), sourceBinding = sceneModelBinding(split, originalAsset, targetSceneId);
      expect(copy.assetFrameId).not.toBe(original.assetFrameId); expect(binding.assetToProject).toEqual(sourceBinding.assetToProject); expect(binding.method).toBe(sourceBinding.method); expect(sourceBinding.method).toBe('import'); expect(binding.parentBindingId).toBeUndefined();
      const sourceRevision = split.assetRevisionsById[sourceBinding.assetRevisionId], revision = split.assetRevisionsById[binding.assetRevisionId]; expect(revision.id).not.toBe(sourceRevision.id);
      const rep = split.representationsById[revision.representationIds[0]], sourceRep = split.representationsById[sourceRevision.representationIds[0]];
      expect(rep.id).not.toBe(sourceRep.id); expect(rep.blob).toEqual(sourceRep.blob); expect(rep.representationFrameId).not.toBe(sourceRep.representationFrameId); expect(rep.variantFamilyId).not.toBe(sourceRep.variantFamilyId);
      const attachments = Object.values(split.captionAttachmentsById) as any[]; expect(attachments).toHaveLength(2); expect(attachments[0].id).not.toBe(attachments[1].id); expect(attachments[0].mediaResourceId).toBe(attachments[1].mediaResourceId);
      evidence.split = { records: split, history: history(workspace.source), copyAsset, copyCaption }; await receive(b, workspacePath);
    });
    let final!: Awaited<ReturnType<typeof backup>>;
    await step('元とコピーの本文・画像説明・配置を別々に変え、実ファイルで返す', async () => {
      await scene(a, firstScene); await caption(a, initialTitle); await editCaption(a, originalTitle, originalBody);
      await a.getByRole('tab', { name: 'モデル', exact: true }).click(); await modelPanel(a).getByLabel('一覧の範囲', { exact: true }).selectOption('included');
      await expect(modelRows(a)).toHaveCount(1); await modelRows(a).first().click();
      await expect(modelPanel(a).getByRole('button', { name: '配置を調整', exact: true })).toBeEnabled();
      await modelPanel(a).getByRole('button', { name: '配置を調整', exact: true }).click();
      await modelPanel(a).getByLabel('位置 X', { exact: true }).fill('1.75');
      await modelPanel(a).getByRole('button', { name: '配置を確定', exact: true }).click(); await done(a, 'モデルの配置を確定しました。');
      await receive(b, await contribution(a, 'A1-元の記録とモデルの変更'));
      await scene(b, targetScene); await caption(b, initialTitle); await editCaption(b, copyTitle, copyBody); await checkImage(b);
      const media = b.getByRole('region', { name: 'メディアの整理', exact: true });
      await media.getByText('添付を整理', { exact: true }).click(); await media.getByRole('button', { name: '説明を編集', exact: true }).click();
      await media.getByLabel('メディアの説明', { exact: true }).fill(copyAlt); await media.getByRole('button', { name: '説明を適用', exact: true }).click(); await done(b, 'メディアの説明を適用しました。');
      const pins = b.getByRole('region', { name: '位置の調整', exact: true }); await b.getByRole('button', { name: '位置を調整', exact: true }).click();
      await b.getByText('座標で微調整', {exact:true}).click();
      for (const [axis, value] of [['X', '0.4'], ['Y', '0.3'], ['Z', '0.1']]) await pins.getByLabel(`位置 ${axis}`, { exact: true }).fill(value!);
      await pins.getByRole('button', { name: '位置を確定', exact: true }).click(); await done(b, 'ピンの位置を確定しました。');
      await b.getByRole('tab', { name: 'モデル', exact: true }).click(); await expect(modelRows(b)).toHaveCount(2);
      await modelPanel(b).locator(`.lv-model-select[data-asset-id="${copyAsset}"]`).click();
      await modelPanel(b).getByRole('button', { name: '配置を調整', exact: true }).click();
      const beforeCopy = sceneModelBinding(split, copyAsset, targetSceneId).assetToProject;
      await expect(modelPanel(b).getByLabel('位置 X', { exact: true })).toHaveValue(String(beforeCopy.translation[0]));
      await expect(modelPanel(b).getByLabel('倍率', { exact: true })).toHaveValue(String(beforeCopy.uniformScale));
      await modelPanel(b).getByLabel('位置 X', { exact: true }).fill('3.5');
      await modelPanel(b).getByRole('button', { name: '配置を確定', exact: true }).click(); await done(b, 'モデルの配置を確定しました。');
      const returned = await contribution(b, 'B1-独立コピーの変更'); await receive(a, returned); await receive(a, returned);
      final = await backup(await download(b, info, 'B-別々の編集を保存', 'backup'));
      const r = final.records; expect(Object.keys(r.assetsById)).toHaveLength(2); expect(Object.keys(r.captionsById)).toHaveLength(2);
      expect(r.captionsById[originalCaption]).toMatchObject({ title: originalTitle, body: originalBody, anchor: seed.captionsById[originalCaption].anchor });
      expect(r.captionsById[copyCaption]).toMatchObject({ title: copyTitle, body: copyBody, anchor: split.captionsById[copyCaption].anchor });
      expect(scenePinAnchor(r, copyCaption, targetSceneId)).toMatchObject({ ...seed.captionsById[originalCaption].anchor, positionAsset: [0.4, 0.3, 0.1] });
      const attachment = (id: string) => (Object.values(r.captionAttachmentsById) as any[]).find(e => e.captionId === id)!; expect(attachment(originalCaption).altText).toBe(''); expect(attachment(copyCaption).altText).toBe(copyAlt); expect(attachment(originalCaption).mediaResourceId).toBe(attachment(copyCaption).mediaResourceId);
      for (const [id, sceneId, x] of [[originalAsset, originalSceneId, 1.75], [copyAsset, targetSceneId, 3.5]] as const)
        expect(sceneModelBinding(r, id, sceneId).assetToProject).toEqual({ ...sceneModelBinding(split, id, sceneId).assetToProject, translation: [x, 0, 0] });
      expect(sceneModelBinding(r, originalAsset, targetSceneId)).toEqual(sceneModelBinding(split, originalAsset, targetSceneId));
      expect(final.history).toEqual(expect.arrayContaining(history(base.source))); expect(final.history).toEqual(expect.arrayContaining(contributions));
      for (const input of [glb, png]) expect(Buffer.from(await final.file.archive.entryBytes(`blobs/sha256/${sha(input)}`, input.length))).toEqual(input);
      evidence.final = { records: r, history: final.history, heads: final.file.source.heads };
    });
    await step('両ブラウザを完全終了して元とコピーを別々に再開する', async () => {
      await close('A'); await close('B'); a = await launch('A'); b = await launch('B');
      for (const [who, page] of [['A', a], ['B', b]] as const) {
        await expectResumedProject(page, projectName, actionTimeout); await scene(page, firstScene);
        await expect(page.getByRole('list', { name: '記録一覧', exact: true }).locator('.lv-caption-select')).toHaveCount(1); await caption(page, originalTitle); await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue(originalBody); await checkImage(page);
        await scene(page, targetScene); await expect(page.getByRole('list', { name: '記録一覧', exact: true }).locator('.lv-caption-select')).toHaveCount(2); await caption(page, copyTitle); await expect(detail(page).getByLabel('本文', { exact: true })).toHaveValue(copyBody); await checkImage(page);
        await expect(page.getByRole('region', { name: 'メディアの整理', exact: true })).toContainText(copyAlt); await expect(page.getByRole('region', { name: '記録の競合', exact: true })).toBeHidden();
        await page.getByRole('tab', { name: 'モデル', exact: true }).click(); await expect(modelRows(page)).toHaveCount(2);
        for (const id of [originalAsset, copyAsset]) {
          await modelPanel(page).locator(`.lv-model-select[data-asset-id="${id}"]`).click();
          await modelPanel(page).getByRole('button', { name: '配置を調整', exact: true }).click();
          const x = sceneModelBinding(final.records, id, targetSceneId).assetToProject.translation[0];
          await expect(modelPanel(page).getByLabel('位置 X', { exact: true })).toHaveValue(String(x));
          await modelPanel(page).getByRole('button', { name: '配置を取り消す', exact: true }).click();
        }
        await caption(page, copyTitle); await expect(page.locator('.lv-project-viewport-status')).toBeEmpty(); await page.screenshot({ path: info.outputPath(`${who}-別々の編集を再開.png`), fullPage: true });
      }
      const cold = await backup(await download(a, info, 'A-再開後の保存', 'backup')); expect(cold.records).toEqual(final.records); expect(cold.history).toEqual(final.history); expect(cold.file.source.heads).toEqual(final.file.source.heads); expect(cold.file.source.proof.identity).toEqual(base.source.proof.identity);
      for (const input of [glb, png]) expect(Buffer.from(await cold.file.archive.entryBytes(`blobs/sha256/${sha(input)}`, input.length))).toEqual(input);
    }); expect(errors).toEqual([]);
  } catch (error) { failed = true; await Promise.allSettled([...contexts].flatMap(([who, context]) => context.pages().map(page => page.screenshot({ path: info.outputPath(`${who}-failure.png`), fullPage: true })))); throw error; }
  finally { const cleanup = await Promise.allSettled([...contexts.keys()].map(close)); await Promise.allSettled([info.attach('独立コピーと原本の証拠', { body: JSON.stringify(evidence), contentType: 'application/json' }), info.attach('ブラウザ例外', { body: JSON.stringify(errors), contentType: 'application/json' })]); const rejected = cleanup.find(r => r.status === 'rejected'); if (!failed && rejected?.status === 'rejected') throw rejected.reason; }
});
