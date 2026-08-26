// ホーム画面 — ZIPドロップ / 最近のプロジェクト / 新規作成 / プロファイル
// 投入物の自動判別（docs/02 §6.2）: lociview.json有 → 開く or 取込 / モデル単体 → 新規作成

import { importNewProject, inspectZip } from '../assets/package';
import { applyImportPlan, buildImportPlan } from '../assets/importWizard';
import { optimizeGlbBytes } from '../assets/glbOptimize';
import { addModelAsset } from '../assets/modelAsset';
import { readZipEntries } from '../assets/zipio';
import { createManifest, parseManifest } from '../core/manifest';
import { entityIdFor, ProjectStore, type Identity } from '../core/store';
import type { ProjectWorkspaceFS, WorkspaceFS } from '../platform/fs';
import type { ProjectMutationSession } from '../platform/projectLock';
import { detectFormat } from '../viewer/loaders';
import { el, clear } from './dom';
import { confirmDialog, infoDialog, promptDialog } from './dialogs';
import { importWizardDialog } from './importDialog';
import { isStandalone, onInstallAvailability, promptInstall } from '../platform/pwa';

export interface HomeDeps {
  fs: WorkspaceFS;
  identity: Identity;
  openProject: (dir: string, prepared?: WritableProjectSession) => Promise<void>;
  startProjectMutation: (
    dir: string,
    projectId: string,
    existing: boolean,
  ) => Promise<WritableProjectSession | null>;
  openProfile: () => void;
  storageWarning: string | null;
}

export interface WritableProjectSession {
  readonly access: ProjectMutationSession;
  readonly fs: ProjectWorkspaceFS;
  store: ProjectStore | null;
}

interface ProjectListItem {
  dir: string;
  name: string;
  projectId: string;
  createdAt: string;
}

async function listProjects(fs: WorkspaceFS): Promise<ProjectListItem[]> {
  const out: ProjectListItem[] = [];
  for (const path of await fs.list('projects/')) {
    if (!path.endsWith('/lociview.json')) continue;
    const text = await fs.readText(path);
    if (text === null) continue;
    try {
      const m = parseManifest(text);
      out.push({
        dir: path.slice(0, -'/lociview.json'.length),
        name: m.name,
        projectId: m.projectId,
        createdAt: m.createdAt,
      });
    } catch {
      // 壊れたマニフェストはスキップ
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function mountHome(root: HTMLElement, deps: HomeDeps): void {
  const listEl = el('div', { class: 'lv-home-list' });

  const fileInput = el('input', {
    type: 'file',
    accept: '.zip,.lociview,.glb,.gltf,.obj,.stl,.ply',
    style: 'display:none',
  }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f !== undefined) void handleFile(f);
    fileInput.value = '';
  });

  const dropZone = el('div', {
    class: 'lv-drop',
    onclick: () => fileInput.click(),
    ondragover: (ev) => {
      ev.preventDefault();
      dropZone.classList.add('over');
    },
    ondragleave: () => dropZone.classList.remove('over'),
    ondrop: (ev) => {
      ev.preventDefault();
      dropZone.classList.remove('over');
      const f = (ev as DragEvent).dataTransfer?.files?.[0];
      if (f !== undefined) void handleFile(f);
    },
  },
    el('div', { class: 'lv-drop-title' }, 'プロジェクト（ZIP）をここにドロップ'),
    el('div', { class: 'lv-dim' }, '.lociview / モデル単体（glb・obj・stl・ply）— クリックして選択もできます'),
  );

  // ホーム画面インストールの案内（インストール済み・非対応環境では出さない）
  const installBar = el('div', { class: 'lv-install' });
  if (!isStandalone()) {
    onInstallAvailability((available) => {
      clear(installBar);
      if (!available) return;
      installBar.append(
        el('span', {}, '📲 ホーム画面に追加すると、ネットのない場所でも起動でき、データが消えにくくなります'),
        el('button', {
          class: 'primary mini',
          onclick: () => void promptInstall(),
        }, '追加'),
      );
    });
  }

  root.append(
    el('div', { class: 'lv-home' },
      el('header', { class: 'lv-home-head' },
        el('b', {}, 'LociView'),
        el('span', { class: 'lv-flex1' }),
        el('button', { onclick: deps.openProfile }, 'プロファイル'),
      ),
      installBar,
      deps.storageWarning !== null
        ? el('div', { class: 'lv-warn lv-pad' }, `⚠ ${deps.storageWarning}`)
        : null,
      dropZone,
      el('div', { class: 'lv-row lv-space', style: 'margin-top:14px' },
        el('div', { class: 'lv-hint' }, '最近のプロジェクト（この端末に自動保存済み）'),
        el('button', {
          onclick: () => {
            void promptDialog('新規プロジェクト', 'プロジェクト名').then(async (name) => {
              if (name === null) return;
              const manifest = createManifest(name);
              const dir = `projects/${entityIdFor('meta')}`;
              const session = await deps.startProjectMutation(dir, manifest.projectId, false);
              if (session === null) {
                await infoDialog('新規プロジェクト', '安全な編集権限を取得できないため作成を開始できません。');
                return;
              }
              let handedOff = false;
              try {
                session.store = await ProjectStore.createWithManifest(
                  session.fs,
                  dir,
                  manifest,
                  deps.identity,
                );
                await deps.openProject(dir, session);
                handedOff = true;
              } catch (error) {
                await infoDialog('新規プロジェクト', error instanceof Error ? error.message : String(error));
              } finally {
                if (!handedOff) session.access.release();
              }
            });
          },
        }, '新規プロジェクト'),
      ),
      listEl,
      fileInput,
    ),
  );

  async function handleFile(file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const lower = file.name.toLowerCase();

    // モデル単体 → 新規プロジェクト作成
    const fmt = detectFormat(file.name, bytes);
    if (fmt !== null && !lower.endsWith('.zip') && !lower.endsWith('.lociview')) {
      const name = file.name.replace(/\.[^.]+$/, '');
      const dir = `projects/${entityIdFor('meta')}`;
      const manifest = createManifest(name);
      const session = await deps.startProjectMutation(dir, manifest.projectId, false);
      if (session === null) throw new Error('安全な編集権限を取得できないため作成を開始できません');
      let handedOff = false;
      try {
        const store = await ProjectStore.createWithManifest(session.fs, dir, manifest, deps.identity);
        session.store = store;
        await addModelAsset(session.fs, dir, store, file.name, bytes);
        await store.flush();
        await deps.openProject(dir, session);
        handedOff = true;
      } catch (error) {
        await infoDialog('モデル取込失敗', error instanceof Error ? error.message : String(error));
      } finally {
        if (!handedOff) session.access.release();
      }
      return;
    }

    // ZIP → lociview判定
    try {
      const insp = await inspectZip(bytes);
      if (insp.kind !== 'lociview' || insp.manifest === null) {
        // LociViewプロジェクトでないZIP → インポートウィザード（Drive フォルダZIP等）
        await runImportWizard(bytes, file.name);
        return;
      }
      const existing = (await listProjects(deps.fs)).find((p) => p.projectId === insp.manifest!.projectId);
      if (existing !== undefined) {
        const ok = await confirmDialog(
          '既存プロジェクトのZIP',
          `「${existing.name}」はこの端末に存在します。開いてこのZIPをマージしますか？`,
        );
        if (!ok) return;
        // 開いた後にデータタブから取込…ではなく、その場でマージして開く
        const session = await deps.startProjectMutation(existing.dir, existing.projectId, true);
        if (session === null || session.store === null) {
          await infoDialog('読み取り専用', '別のタブが編集中のためZIPをマージせず、保存済み状態を読み取り専用で開きます。');
          await deps.openProject(existing.dir);
          return;
        }
        let handedOff = false;
        const { mergeFromInspection } = await import('../assets/package');
        try {
          await mergeFromInspection(session.fs, existing.dir, session.store, insp);
          await deps.openProject(existing.dir, session);
          handedOff = true;
        } finally {
          if (!handedOff) session.access.release();
        }
        return;
      }
      const dir = `projects/${insp.manifest.projectId}`;
      const session = await deps.startProjectMutation(dir, insp.manifest.projectId, false);
      if (session === null) throw new Error('安全な編集権限を取得できないため取込を開始できません');
      let handedOff = false;
      try {
        await importNewProject(session.fs, dir, insp);
        await deps.openProject(dir, session);
        handedOff = true;
      } finally {
        if (!handedOff) session.access.release();
      }
    } catch (e) {
      await infoDialog('取込失敗', e instanceof Error ? e.message : String(e));
    }
  }

  /** Drive フォルダZIP等の取り込み（FR-02） */
  async function runImportWizard(bytes: Uint8Array, fileName: string): Promise<void> {
    const plan = await buildImportPlan(await readZipEntries(bytes));
    if (plan.models.length === 0 && plan.images.length === 0 && plan.migration === null) {
      await infoDialog(
        '取込',
        'このZIPにはLociViewが扱えるデータ（3Dモデル・画像・LociMyuのスプレッドシート）が見つかりませんでした。',
      );
      return;
    }
    const defaultName = fileName.replace(/\.(zip|lociview)$/i, '');
    const answer = await importWizardDialog(plan, defaultName);
    if (answer === null) return;
    const manifest = createManifest(answer.projectName);
    const dir = `projects/${entityIdFor('meta')}`;
    const session = await deps.startProjectMutation(dir, manifest.projectId, false);
    if (session === null) {
      await infoDialog('取込', '安全な編集権限を取得できないため取込を開始できません。');
      return;
    }
    let handedOff = false;
    try {
      const result = await applyImportPlan(session.fs, deps.identity, plan, {
        projectName: answer.projectName,
        imageLinks: answer.imageLinks,
        optimizeModel: (b) => optimizeGlbBytes(b),
        targetDir: dir,
        targetManifest: manifest,
      });
      const notes: string[] = [];
      if (result.unlinkedImages > 0) {
        notes.push(`画像${result.unlinkedImages}件は対応付けされていません（キャプションを選んで添付できます）。`);
      }
      if (result.chromaDisabledCount > 0) {
        notes.push(
          `クロマキー設定${result.chromaDisabledCount}件は、LociMyuでは実際には描画に反映されていなかったため、` +
            `当時の見え方を保つ目的で「無効」の状態で取り込みました。設定値は残っているので、Materialタブから有効にできます。`,
        );
      }
      if (notes.length > 0) {
        await infoDialog(
          '取込完了',
          `キャプション${result.captionCount}件・表示セット${result.setCount}件を取り込みました。\n\n${notes.join('\n\n')}`,
        );
      }
      await deps.openProject(result.dir, session);
      handedOff = true;
    } finally {
      if (!handedOff) session.access.release();
    }
  }

  async function renderList(): Promise<void> {
    clear(listEl);
    const items = await listProjects(deps.fs);
    if (items.length === 0) {
      listEl.append(el('div', { class: 'lv-dim lv-pad' }, 'プロジェクトはまだありません'));
      return;
    }
    for (const item of items) {
      listEl.append(
        el('div', { class: 'lv-home-item' },
          el('b', {}, item.name),
          el('span', { class: 'lv-dim' }, item.createdAt.slice(0, 10)),
          el('span', { class: 'lv-flex1' }),
          el('button', { class: 'primary', onclick: () => void deps.openProject(item.dir) }, '開く'),
          el('button', {
            class: 'danger',
            onclick: () => {
              void confirmDialog('プロジェクト削除', `「${item.name}」をこの端末から削除しますか？（書き出したZIPは影響を受けません）`).then(async (ok) => {
                if (!ok) return;
                const session = await deps.startProjectMutation(item.dir, item.projectId, true);
                if (session === null) {
                  await infoDialog('削除できません', '別のタブがこのプロジェクトを編集中です。編集タブを閉じてから再試行してください。');
                  return;
                }
                try {
                  for (const f of await session.fs.list(item.dir + '/')) await session.fs.remove(f);
                  await renderList();
                } finally {
                  session.access.release();
                }
              });
            },
          }, '削除'),
        ),
      );
    }
  }

  void renderList();
}
