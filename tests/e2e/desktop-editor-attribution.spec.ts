import { test, expect, chromium, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as A from '@automerge/automerge';
import { triangleGlb } from './fixtures';
import { gsFixture } from '../helpers/gsFixture';
import { PackageArchive } from '../../src/projectPackage/zipArchive';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { WorkspaceArchive } from '../../src/projectPackage/workspaceArchive';
import { ProjectMetadataSource } from '../../src/projectMetadata/source';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { validationMetadataLimits as limits } from '../../src/projectFiles/validation';

const title = '編集者名の共有', caption = '共有記録', nameA = '担当A・SHARED_EDITOR_A', nameB = '担当B・SHARED_EDITOR_B';
const blob = async (path: string) => new Blob([Uint8Array.from(await readFile(path)).buffer]);
const files = (p: Page) => p.getByRole('region', { name: 'ファイル', exact: true });
const detail = (p: Page) => p.getByRole('region', { name: 'キャプションの詳細', exact: true });
async function settled(p: Page) { await expect(p.locator('main.lv-project-workspace > header > p.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 90_000 }); }
async function selected(p: Page) { await p.getByRole('list', { name: 'キャプション一覧', exact: true }).locator('.lv-caption-select').first().click(); }
async function editor(p: Page, name: string, enabled = true) {
  const settings = p.getByLabel('設定', { exact: true });
  if (!await settings.evaluate(n => (n as HTMLDetailsElement).open)) await settings.locator('summary').click();
  await settings.getByLabel('編集者名', { exact: true }).fill(name);
  await settings.getByLabel('このプロジェクトの今後の編集にこの名前を残す', { exact: true }).setChecked(enabled);
  await settings.getByRole('button', { name: '編集者名を設定', exact: true }).click();
  await expect(settings.getByRole('status')).toHaveText('編集者名の設定を保存しました。');
}
async function edit(p: Page, field: 'タイトル' | '本文', value: string) {
  await detail(p).getByLabel(field, { exact: true }).fill(value);
  await detail(p).getByRole('button', { name: '変更を適用', exact: true }).click();
  await expect(p.getByText('変更を適用しました。', { exact: true })).toBeVisible({ timeout: 90_000 }); await settled(p);
}
async function output(p: Page, info: TestInfo, label: string, purpose: 'backup' | 'teamWorkspace' | 'contribution' | 'clean' | 'review', base?: string) {
  const menu = p.locator('details.lv-project-files'); if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
  const area = files(p); await area.getByRole('button', { name: purpose === 'backup' ? '保存' : '相手に渡す', exact: true }).click();
  if (purpose === 'backup') await area.getByLabel('名前（任意）', { exact: true }).fill(label);
  else if (purpose === 'clean' || purpose === 'review') {
    const more = area.locator('.lv-file-intents > details'); if (!await more.evaluate(n => (n as HTMLDetailsElement).open)) await more.locator('summary').click();
    await more.getByRole('button', { name: purpose === 'clean' ? '独立コピーを作る' : 'シーンを共有', exact: true }).click();
  } else await area.getByLabel('渡す内容', { exact: true }).selectOption(purpose);
  if (purpose === 'contribution') await area.getByLabel('元にする作業一式', { exact: true }).selectOption(base!);
  if (purpose === 'review') { const scene = area.getByLabel('渡すシーン', { exact: true }); await scene.selectOption((await scene.locator('option').evaluateAll(ns => ns.map(n => (n as HTMLOptionElement).value).filter(Boolean)))[0]!); }
  const primary = area.locator('button.lv-file-primary');
  if (purpose === 'clean' || purpose === 'review') { await primary.click(); await expect(primary).toHaveText('ダウンロード'); }
  if (purpose === 'backup' || purpose === 'teamWorkspace') await expect(area.locator('.lv-file-intents')).toContainText('記録された編集者名を含みます。');
  if (purpose === 'contribution') await expect(area.locator('.lv-file-intents')).toContainText('今回の変更分に編集者名は含みません。');
  const [download] = await Promise.all([p.waitForEvent('download', { timeout: 120_000 }), primary.click()]);
  const path = info.outputPath(label + '.zip'); await download.saveAs(path); expect(await download.failure()).toBeNull();
  await expect(area.locator('.lv-operation-status')).toHaveAttribute('data-busy', 'false', { timeout: 120_000 }); return path;
}
async function receive(p: Page, path: string) {
  const menu = p.locator('details.lv-project-files'); if (!await menu.evaluate(n => (n as HTMLDetailsElement).open)) await menu.locator(':scope > summary').click();
  const area = p.getByRole('region', { name: '更新ファイル', exact: true });
  await area.getByLabel('更新ファイルを選択', { exact: true }).setInputFiles(path);
  await area.getByRole('button', { name: '更新を受け取る', exact: true }).click();
  await expect(area.getByText('更新を受け取りました。', { exact: true })).toBeVisible({ timeout: 90_000 }); await settled(p);
}
async function records(path: string) {
  const backup = await BackupArchive.inspect(await blob(path), limits), inspected = await inspectProjectCandidates(backup.source.read(), limits);
  if (inspected.kind !== 'project-candidate-inspection') throw Error('Backup inspection');
  return { backup, records: inspected.unambiguousRecords };
}
async function receipts(p: Page) {
  return p.evaluate(async () => {
    const result: Record<string, { sha256: string; value?: unknown }> = {}, root = await navigator.storage.getDirectory();
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, handle] of (dir as any).entries()) {
        const path = prefix + name;
        if (handle.kind === 'directory') await walk(handle, path + '/');
        else if (path.includes('/v2/metadata/') && /(?:\.json|\.amchange)$/.test(path)) {
          const bytes = await (await handle.getFile()).arrayBuffer(), hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
          result[path] = { sha256: [...hash].map(v => v.toString(16).padStart(2, '0')).join(''),
            ...(path.endsWith('/staging.json') ? { value: JSON.parse(new TextDecoder().decode(bytes)) } : {}) };
        }
      }
    }; await walk(root, ''); return result;
  });
}

test('08b editor names remain exact through collaboration, purpose privacy, restore, cold resume and the fixed old reader', async ({}, info) => {
  test.setTimeout(900_000); A.getHeads(A.init());
  execFileSync(process.execPath, ['scripts/prepare-editor-attribution-old-reader.mjs'], { windowsHide: true });
  await mkdir('.artifacts/e2e/profiles', { recursive: true });
  const profiles = await Promise.all(['a', 'b', 'restore', 'old-file'].map(n => mkdtemp('.artifacts/e2e/profiles/editor-' + n + '-')));
  const contexts = new Set<BrowserContext>(), errors: string[] = [], oldErrors: string[] = [], servedOld = new Map<string, string>();
  const launch = async (profile: string, old = false) => {
    const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true }); contexts.add(context);
    const oldRoot = resolve('.artifacts/e2e/editor-attribution-old-reader/6c3788e06fa004f4c1f13ba2091f47f183695c2d/desktop-dist');
    await context.route('**/*', async route => {
      const u = new URL(route.request().url()); if (['blob:', 'data:'].includes(u.protocol)) return route.continue();
      if (u.origin !== 'http://127.0.0.1:4182') { errors.push('unexpected network origin'); return route.abort('blockedbyclient'); }
      if (!old) return route.continue();
      const path = resolve(oldRoot, u.pathname === '/' ? 'index.html' : '.' + u.pathname);
      if (!path.startsWith(oldRoot + sep)) throw Error('Old build path');
      let bytes: Buffer;
      try { bytes = await readFile(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return route.fulfill({ status: 404, body: '' }); throw error; }
      servedOld.set(path, createHash('sha256').update(bytes).digest('hex'));
      return route.fulfill({ path });
    });
    const p = context.pages()[0] ?? await context.newPage(); p.setDefaultTimeout(15_000);
    p.on('pageerror', e => (old ? oldErrors : errors).push(e.message));
    await p.goto('/'); return { context, p };
  };
  const close = async (context: BrowserContext) => { await context.close(); contexts.delete(context); };
  try {
    const a = await launch(profiles[0]!), b = await launch(profiles[1]!);
    await a.p.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'model.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    await a.p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await a.p.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill(title);
    await a.p.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click(); await expect(a.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 });
    await expect(a.p.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    await a.p.getByText('数値で配置', { exact: true }).click(); const owner = a.p.getByLabel('追加先モデル', { exact: true }); await owner.focus(); await owner.selectOption({ label: 'model.glb' });
    await expect(a.p.getByRole('button', { name: 'このモデルに追加', exact: true })).toBeEnabled();
    await a.p.getByRole('button', { name: 'このモデルに追加', exact: true }).click();
    for (const [axis, value] of [['X', '0'], ['Y', '.5'], ['Z', '0']]) await a.p.getByLabel(`位置 ${axis}`, { exact: true }).fill(value!);
    await a.p.getByRole('button', { name: '位置を確定', exact: true }).click(); await expect(a.p.getByText('ピンの位置を確定しました。', { exact: true })).toBeVisible({ timeout: 90_000 });
    const settings = a.p.getByLabel('設定', { exact: true }); await settings.locator('summary').click();
    await settings.getByLabel('このブラウザの表示名', { exact: true }).fill('私的な名前'); await settings.getByRole('button', { name: '表示名を設定', exact: true }).click();
    await expect(settings.getByLabel('編集者名', { exact: true })).toHaveValue('私的な名前'); await expect(settings.getByRole('checkbox')).not.toBeChecked();
    await editor(a.p, nameA); await edit(a.p, 'タイトル', caption); await edit(a.p, '本文', '配布時の本文');
    await detail(a.p).getByText('編集者情報', { exact: true }).click(); await expect(detail(a.p)).toContainText(`編集者名：${nameA}`); await expect(detail(a.p)).toContainText('編集者情報なし');
    const initial = await output(a.p, info, 'named-workspace', 'teamWorkspace');
    console.log('08b: initial named Workspace downloaded');
    await b.p.getByLabel('ファイルを選択', { exact: true }).setInputFiles(initial); await b.p.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await expect(b.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 }); await selected(b.p);
    const bs = b.p.getByLabel('設定', { exact: true }); await bs.locator('summary').click(); await expect(bs.getByRole('checkbox')).not.toBeChecked();
    await editor(b.p, nameB); await edit(b.p, '本文', 'Bの手元編集'); await edit(a.p, '本文', 'Aの変更');
    await receive(b.p, await output(a.p, info, 'A-update', 'teamWorkspace')); await selected(b.p);
    const group = b.p.getByRole('region', { name: '記録の競合', exact: true }).getByRole('listitem', { name: `${caption}：本文`, exact: true });
    await expect(group).toContainText(nameA); await expect(group).toContainText(nameB);
    await group.getByRole('combobox').selectOption('manual'); await group.getByRole('textbox').fill('AとBの確認済み本文');
    await group.getByRole('button', { name: '競合を解消', exact: true }).click(); await expect(group).toBeHidden({ timeout: 90_000 });
    console.log('08b: both editor names displayed and conflict resolved');
    const shared = await output(b.p, info, 'resolved-workspace', 'teamWorkspace'), sharedArchive = await WorkspaceArchive.inspect(await blob(shared), limits);
    await receive(a.p, shared); await selected(a.p);
    await editor(b.p, nameB, false); await edit(b.p, '本文', '無記名の追記');
    const delta = await output(b.p, info, 'anonymous-delta', 'contribution', sharedArchive.archive.control.manifest.packageId), d = await PackageArchive.inspect(await blob(delta));
    expect(d.control.manifest.requiredCapabilities).toEqual(['editor-attribution-v1']);
    if (d.control.manifest.purpose !== 'contribution') throw Error('Contribution');
    for (const entry of d.control.manifest.changes) expect(A.decodeChange(await d.entryBytes(`changes/${String(entry.ordinal).padStart(8, '0')}.amchange`, limits.maxChangeBytes)).message ?? '').not.toContain('transaction:v2');
    await receive(a.p, delta); await selected(a.p); await expect(detail(a.p).getByLabel('本文', { exact: true })).toHaveValue('無記名の追記');
    const saved = await output(a.p, info, 'named-backup', 'backup'), before = await records(saved);
    console.log('08b: anonymous delta received and full history backed up');
    expect(new Set(before.backup.source.editorDeclarations().map(v => v.declaration.editor.name))).toEqual(new Set([nameA, nameB]));
    const clean = await PackageArchive.inspect(await blob(await output(a.p, info, 'clean', 'clean'))), review = await PackageArchive.inspect(await blob(await output(a.p, info, 'review', 'review')));
    expect(clean.control.manifest.requiredCapabilities).toBeUndefined(); expect(review.control.manifest.requiredCapabilities).toBeUndefined();
    const cm = clean.control.manifest; if (cm.purpose !== 'clean') throw Error('Clean');
    const copied = ProjectMetadataSource.fromFullSource(await clean.entryBytes('metadata.am', limits.maxTotalBytes), { identity: cm.identity, envelope: cm.metadataEnvelope }, limits);
    copied.assertFreshInitialization(); expect(copied.editorDeclarations()).toEqual([]);
    const snapshot = new TextDecoder().decode(await review.entryBytes('review.json', 8_000_000)); expect(snapshot).not.toContain(nameA); expect(snapshot).not.toContain(nameB);
    console.log('08b: Review and Clean exclude editor declarations');
    const restored = await launch(profiles[2]!); await restored.p.getByLabel('ファイルを選択', { exact: true }).setInputFiles(saved); await restored.p.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    await restored.p.getByRole('button', { name: 'バックアップから復元', exact: true }).click(); await expect(restored.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 120_000 });
    const after = await records(await output(restored.p, info, 'restored', 'backup')); expect(after.records).toEqual(before.records); expect(after.backup.source.originalChanges()).toEqual(before.backup.source.originalChanges());
    await close(restored.context); const cold = await launch(profiles[2]!); await expect(cold.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 }); await selected(cold.p);
    await cold.p.getByLabel('設定', { exact: true }).locator('summary').click(); await expect(cold.p.getByLabel('このプロジェクトの今後の編集にこの名前を残す', { exact: true })).not.toBeChecked();
    await edit(cold.p, '本文', '復元して再開した追記');
    const resumed = await records(await output(cold.p, info, 'resumed', 'backup')); expect(resumed.backup.source.editorDeclarations()).toEqual(before.backup.source.editorDeclarations());
    console.log('08b: restore, cold reopen and new anonymous edit verified');
    for (const r of Object.values(await receipts(cold.p))) if (r.value) expect((r.value as any).requiredCapabilities).toEqual(['editor-attribution-v1']);
    const priorReceipts = await receipts(a.p); await close(a.context);
    const old = await launch(profiles[0]!, true); await expect(old.p.getByText(/最後のプロジェクトを再開できません/)).toBeVisible({ timeout: 90_000 });
    await expect(old.p.locator('main.lv-project-workspace')).toHaveCount(0); expect(await receipts(old.p)).toEqual(priorReceipts); await old.p.screenshot({ path: info.outputPath('old-reader-refused-resume.png'), fullPage: true }); await close(old.context);
    const oldFile = await launch(profiles[3]!, true); const open = oldFile.p.getByRole('button', { name: 'ファイルを開く', exact: true });
    await oldFile.p.getByLabel('ファイルを選択', { exact: true }).setInputFiles(initial); await open.click(); await expect(open).toBeEnabled({ timeout: 90_000 });
    await expect(oldFile.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveCount(0); await expect(oldFile.p.getByRole('status').first()).not.toBeEmpty();
    await oldFile.p.screenshot({ path: info.outputPath('old-reader-refused-file.png'), fullPage: true });
    console.log('08b: fixed old reader refused same-profile resume and Workspace input');
    const current = await launch(profiles[0]!); await expect(current.p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 });
    const unchanged = await records(await output(current.p, info, 'after-old-reader', 'backup')); expect(unchanged.backup.source.originalChanges()).toEqual(before.backup.source.originalChanges());
    expect(errors).toEqual([]); expect(servedOld.size).toBeGreaterThan(3);
    await info.attach('editor-attribution-evidence', { body: JSON.stringify({ profiles, oldBuildSourceCheckpoint: '6c3788e (source unchanged from90b0e82)', servedOld: [...servedOld], oldErrors, errors }), contentType: 'application/json' });
  } finally { for (const context of contexts) { await context.pages()[0]?.screenshot({ path: info.outputPath('failure-' + [...contexts].indexOf(context) + '.png'), fullPage: true }).catch(() => {}); await context.close(); } }
});

test('08b GS confirmation keeps its editor when another tab changes the local setting during validation', async ({}, info) => {
  test.setTimeout(240_000); A.getHeads(A.init()); await mkdir('.artifacts/e2e/profiles', { recursive: true });
  const profile = await mkdtemp('.artifacts/e2e/profiles/editor-gs-'), errors: string[] = [];
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
  const p = context.pages()[0] ?? await context.newPage(); p.setDefaultTimeout(15_000);
  await context.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === 'http://127.0.0.1:4182' || ['blob:', 'data:'].includes(u.protocol)) return route.continue(); errors.push('unexpected network origin'); return route.abort(); });
  p.on('pageerror', error => errors.push(error.message));
  try {
    await p.goto('/'); await p.getByLabel('ファイルを選択', { exact: true }).setInputFiles({ name: 'model.ply', mimeType: 'application/octet-stream', buffer: Buffer.from(gsFixture()) });
    await p.getByRole('button', { name: 'ファイルを開く', exact: true }).click(); await p.getByRole('textbox', { name: 'プロジェクト名', exact: true }).fill(title);
    await p.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click(); await expect(p.getByRole('heading', { name: 'プロジェクト名', exact: true })).toHaveText(title, { timeout: 90_000 });
    await expect(p.getByLabel('3Dモデルの表示', { exact: true })).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 }); await editor(p, nameA);
    await p.getByRole('tab', { name: 'モデル', exact: true }).click(); const panel = p.getByRole('tabpanel', { name: 'モデル', exact: true }); await panel.locator('.lv-model-select').first().click();
    const choose = p.waitForEvent('filechooser'); await panel.getByRole('button', { name: '位置指定用の面を追加', exact: true }).click();
    await (await choose).setFiles({ name: 'surface.glb', mimeType: 'model/gltf-binary', buffer: triangleGlb() });
    const confirm = panel.getByRole('button', { name: 'このモデルに面を追加', exact: true }); await expect(confirm).toBeEnabled();
    // A second same-origin tab injects an advisory UI-preference change. Project
    // writes still go through the real Proxy confirmation and Session command.
    const other = await context.newPage(); other.setDefaultTimeout(15_000); await other.goto('/');
    other.on('pageerror', error => errors.push(error.message));
    await p.evaluate(() => {
      const w = window as any, original = crypto.subtle.digest.bind(crypto.subtle); w.__holdGsEditorDigest = true;
      (crypto.subtle as any).digest = async (...args: Parameters<SubtleCrypto['digest']>) => {
        if (w.__holdGsEditorDigest) { w.__holdGsEditorDigest = false; w.__gsEditorDigestHeld = true; await new Promise<void>(resolve => { w.__releaseGsEditorDigest = resolve; }); }
        return original(...args);
      };
    });
    await confirm.click(); await expect.poll(() => p.evaluate(() => !!(window as any).__gsEditorDigestHeld)).toBe(true);
    await other.evaluate(([before, after]) => {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('lociview.ui.editor-attribution-1:'));
      if (keys.length !== 1) throw Error('Expected one owned Project preference');
      const value = JSON.parse(localStorage.getItem(keys[0]!)!);
      if (!value.enabled || value.name !== before) throw Error('Unexpected initial editor preference');
      localStorage.setItem(keys[0]!, JSON.stringify({ enabled: true, name: after }));
    }, [nameA, nameB]);
    await p.evaluate(() => (window as any).__releaseGsEditorDigest());
    await expect(p.getByText('位置指定用の面を登録しました。', { exact: true })).toBeVisible({ timeout: 90_000 }); await settled(p);
    const saved = await records(await output(p, info, 'gs-confirmation', 'backup'));
    expect(saved.backup.source.editorDeclarations().map(d => d.declaration.editor.name)).toEqual([nameA]);
    await expect(p.getByLabel('編集者名', { exact: true })).toHaveValue(nameB);
    expect(errors).toEqual([]); await p.screenshot({ path: info.outputPath('gs-confirmation-editor.png'), fullPage: true });
  } finally { await p.evaluate(() => (window as any).__releaseGsEditorDigest?.()).catch(() => {});
    for (const [i, page] of context.pages().entries()) await page.screenshot({ path: info.outputPath(`gs-tab-${i}.png`), fullPage: true }).catch(() => {});
    await context.close(); }
});
