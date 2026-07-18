// ホーム画面 — ZIPドロップ / 最近のプロジェクト / 新規作成 / プロファイル
// 投入物の自動判別（docs/02 §6.2）: lociview.json有 → 開く or 取込 / モデル単体 → 新規作成

import { importNewProject, inspectZip } from '../assets/package';
import { parseManifest } from '../core/manifest';
import { entityIdFor, ProjectStore, type Identity } from '../core/store';
import type { WorkspaceFS } from '../platform/fs';
import { detectFormat } from '../viewer/loaders';
import { el, clear } from './dom';
import { confirmDialog, infoDialog, promptDialog } from './dialogs';

export interface HomeDeps {
  fs: WorkspaceFS;
  identity: Identity;
  openProject: (dir: string) => Promise<void>;
  openProfile: () => void;
  storageWarning: string | null;
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

  root.append(
    el('div', { class: 'lv-home' },
      el('header', { class: 'lv-home-head' },
        el('b', {}, 'LociView'),
        el('span', { class: 'lv-flex1' }),
        el('button', { onclick: deps.openProfile }, 'プロファイル'),
      ),
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
              const store = await ProjectStore.create(deps.fs, `projects/${entityIdFor('meta')}`, name, deps.identity);
              await store.flush();
              const items = await listProjects(deps.fs);
              const item = items.find((i) => i.projectId === store.manifest.projectId);
              if (item !== undefined) await deps.openProject(item.dir);
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
      const store = await ProjectStore.create(deps.fs, dir, name, deps.identity);
      const astId = entityIdFor('asset');
      const ext = lower.split('.').pop() ?? 'bin';
      await deps.fs.writeBytes(`${dir}/models/${astId}.${ext}`, bytes);
      store.dispatch({
        t: 'create', e: 'asset', id: astId,
        v: { kind: 'model', path: `models/${astId}.${ext}`, originalName: file.name, mime: '', size: bytes.length, transform: { scale: 1, upAxis: 'Y' } },
      });
      await store.flush();
      await deps.openProject(dir);
      return;
    }

    // ZIP → lociview判定
    try {
      const insp = await inspectZip(bytes);
      if (insp.kind !== 'lociview' || insp.manifest === null) {
        await infoDialog('取込', 'LociViewプロジェクトではないZIPです。（Drive ZIP移行ウィザードは次段で実装予定）');
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
        const store = await ProjectStore.open(deps.fs, existing.dir, deps.identity);
        const { mergeFromInspection } = await import('../assets/package');
        await mergeFromInspection(deps.fs, existing.dir, store, insp);
        await deps.openProject(existing.dir);
        return;
      }
      const dir = `projects/${insp.manifest.projectId}`;
      await importNewProject(deps.fs, dir, insp);
      await deps.openProject(dir);
    } catch (e) {
      await infoDialog('取込失敗', e instanceof Error ? e.message : String(e));
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
                for (const f of await deps.fs.list(item.dir + '/')) await deps.fs.remove(f);
                await renderList();
              });
            },
          }, '削除'),
        ),
      );
    }
  }

  void renderList();
}
