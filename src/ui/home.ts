// ホーム画面 — Native package、従来形式、LociMyu ZIPの目的別受け口。

import { inspectZip, type ZipInspection } from '../assets/package';
import { buildImportPlan, type ImportPlan } from '../assets/importWizard';
import { inspectZipContainerIdentity, readZipEntries } from '../assets/zipio';
import {
  parseCandidateV1ManifestBytes,
  readPublishedCandidateV1ManifestBytes,
} from '../core/manifest';
import type { Identity } from '../core/store';
import type { ProjectSessionMode, WorkspaceFS } from '../platform/fs';
import { el, clear, downloadBlob } from './dom';
import { confirmDialog, infoDialog } from './dialogs';
import { importWizardDialog } from './importDialog';
import { isStandalone, onInstallAvailability, promptInstall } from '../platform/pwa';
import type { LociMyuDisplaySetRelationConfirmation } from '../io/locimyu';
import { serializeConventionalSourceReport } from './conventionalSourceReport';

export interface HomeDeps {
  fs: WorkspaceFS;
  identity: Identity;
  openProject: (dir: string) => Promise<void>;
  registerConventionalPackage: (inspection: ZipInspection) => Promise<string>;
  openProfile: () => void;
  storageWarning: string | null;
  listNativeProjects: () => Promise<NativeProjectListItem[]>;
  openNativeProjects: (projectId?: string, mode?: ProjectSessionMode) => void;
  restoreNativePackage: (
    file: File,
    onStatus: (message: string) => void,
  ) => Promise<{ readonly projectId: string; readonly openMode: ProjectSessionMode }>;
  convertLociMyuZipToNative: (
    file: File,
    plan: ImportPlan,
    projectName: string,
    confirmedDisplaySetRelation: LociMyuDisplaySetRelationConfirmation | null,
    onStatus: (message: string) => void,
  ) => Promise<string | null>;
}

interface ProjectListItem {
  readonly dir: string;
  readonly name: string;
  readonly projectId: string;
  readonly createdAt: string;
}

export interface NativeProjectListItem {
  readonly projectId: string;
  readonly title: string;
}

export type HomeIntakeRoute = 'native-package' | 'conventional-view' | 'locimyu-conversion' | 'unsupported';

export function decideHomeIntakeRoute(input: Readonly<{
  container: 'native-portable' | 'v1' | 'foreign';
  hasLociMyuSource?: boolean;
}>): HomeIntakeRoute {
  if (input.container === 'native-portable') return 'native-package';
  if (input.container === 'v1') return 'conventional-view';
  return input.hasLociMyuSource === true ? 'locimyu-conversion' : 'unsupported';
}

async function listProjects(fs: WorkspaceFS): Promise<ProjectListItem[]> {
  const out: ProjectListItem[] = [];
  for (const path of await fs.list('projects/')) {
    if (!path.endsWith('/lociview.json')) continue;
    try {
      const dir = path.slice(0, -'/lociview.json'.length);
      const bytes = await readPublishedCandidateV1ManifestBytes(fs, dir);
      if (bytes === null) continue;
      const manifest = parseCandidateV1ManifestBytes(bytes);
      out.push({
        dir,
        name: manifest.name,
        projectId: manifest.projectId,
        createdAt: manifest.createdAt,
      });
    } catch {
      // A partial or invalid completion marker is not an active project.
    }
  }
  return out.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function mountHome(root: HTMLElement, deps: HomeDeps): void {
  const listEl = el('div', { class: 'lv-home-list' });
  const nativeListEl = el('div', { class: 'lv-home-list' });
  const fileStatus = el('div', { class: 'lv-dim lv-pad', role: 'status' });
  const fileInput = el('input', {
    type: 'file',
    accept: '.zip,.lociview',
    style: 'display:none',
  }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) void handleFile(file);
    fileInput.value = '';
  });

  const dropZone = el('div', {
    class: 'lv-drop',
    onclick: () => fileInput.click(),
    ondragover: (event) => {
      event.preventDefault();
      dropZone.classList.add('over');
    },
    ondragleave: () => dropZone.classList.remove('over'),
    ondrop: (event) => {
      event.preventDefault();
      dropZone.classList.remove('over');
      const file = (event as DragEvent).dataTransfer?.files?.[0];
      if (file !== undefined) void handleFile(file);
    },
  },
    el('div', { class: 'lv-drop-title' }, 'バックアップ／従来形式／LociMyu ZIPを開く'),
    el('div', { class: 'lv-dim' }, '従来形式は閲覧専用で開き、新しい形式へ変換して編集できます。'),
  );

  const installBar = el('div', { class: 'lv-install' });
  if (!isStandalone()) {
    onInstallAvailability((available) => {
      clear(installBar);
      if (!available) return;
      installBar.append(
        el('span', {}, '📲 ホーム画面に追加すると、ネットのない場所でも起動でき、データが消えにくくなります'),
        el('button', { class: 'primary mini', onclick: () => void promptInstall() }, '追加'),
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
      deps.storageWarning === null ? null : el('div', { class: 'lv-warn lv-pad' }, `⚠ ${deps.storageWarning}`),
      el('div', { class: 'lv-row lv-space', style: 'margin-top:14px' },
        el('div', { class: 'lv-hint' }, '編集できるプロジェクト'),
        el('button', { class: 'primary', onclick: () => deps.openNativeProjects() }, '開く／新しく作る'),
      ),
      nativeListEl,
      dropZone,
      fileStatus,
      el('div', { class: 'lv-hint', style: 'margin-top:14px' }, '従来形式・閲覧専用'),
      listEl,
      fileInput,
    ),
  );

  async function handleFile(file: File): Promise<void> {
    const archiveLike = /\.(zip|lociview)$/iu.test(file.name);
    if (!archiveLike) {
      await infoDialog('開けないファイル', 'ここではZIP形式のバックアップ、従来形式、LociMyuデータを選んでください。');
      return;
    }
    try {
      fileStatus.className = 'lv-dim lv-pad';
      fileStatus.textContent = 'ファイルの種類を確認しています…';
      const identity = await inspectZipContainerIdentity(file);
      if (decideHomeIntakeRoute({ container: identity }) === 'native-package') {
        const restored = await deps.restoreNativePackage(file, (message) => { fileStatus.textContent = message; });
        fileStatus.textContent = '復元が完了しました。プロジェクトを開きます…';
        deps.openNativeProjects(restored.projectId, restored.openMode);
        return;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (identity === 'v1') {
        const inspection = await inspectZip(bytes);
        if (inspection.manifest === null) throw new Error('従来形式の情報を確認できませんでした。');
        const issues = inspection.opsIssues ?? [];
        if (issues.length > 0) {
          downloadBlob(
            serializeConventionalSourceReport(issues),
            `${inspection.manifest.projectId}-source-report.json`,
            'application/json',
          );
          fileStatus.className = 'lv-warn lv-pad';
          fileStatus.textContent = '安全に読み込めない記録があるため、従来形式は保存していません。';
          await infoDialog(
            '従来形式の確認結果',
            `${issues.length}件の記録を閲覧へ反映できません。ファイル、行番号、理由を説明ファイルへ保存しました。元のファイルは変更されていません。`,
          );
          return;
        }
        const existing = (await listProjects(deps.fs)).find(
          ({ projectId }) => projectId === inspection.manifest!.projectId,
        );
        if (existing !== undefined) {
          const openSaved = await confirmDialog(
            '保存済みの従来形式があります',
            '選択したファイルは統合・上書きしません。端末に保存済みのコピーを閲覧専用で開きますか？',
          );
          if (openSaved) await openSavedConventional(existing.dir);
          return;
        }
        const dir = await deps.registerConventionalPackage(inspection);
        fileStatus.textContent = '従来形式を保存しました。閲覧専用で開きます…';
        await deps.openProject(dir);
        return;
      }

      await runLociMyuConversion(file, bytes);
    } catch (error) {
      fileStatus.className = 'lv-warn lv-pad';
      fileStatus.textContent = 'ファイルを開けませんでした。元のファイルは変更されていません。';
      const detail = error instanceof Error ? error.message : String(error);
      await infoDialog(
        '取込失敗',
        /operation log|legacy|\bv1\b|writer/iu.test(detail)
          ? '安全に読み込めない記録があるため、この従来形式は開きませんでした。元のファイルは変更されていません。'
          : detail,
      );
    }
  }

  async function openSavedConventional(dir: string): Promise<void> {
    try {
      fileStatus.className = 'lv-dim lv-pad';
      fileStatus.textContent = '従来形式を安全に確認しています…';
      await deps.openProject(dir);
    } catch (error) {
      fileStatus.className = 'lv-warn lv-pad';
      fileStatus.textContent = '従来形式を開けませんでした。保存済みの元データは変更されていません。';
      const detail = error instanceof Error ? error.message : String(error);
      await infoDialog(
        '従来形式を開けませんでした',
        /operation log|legacy|\bv1\b|writer|manifest/iu.test(detail)
          ? '安全に読み込めない記録があるため、この従来形式は開きませんでした。保存済みの元データは変更されていません。'
          : detail,
      );
    }
  }

  async function runLociMyuConversion(file: File, bytes: Uint8Array): Promise<void> {
    const plan = await buildImportPlan(await readZipEntries(bytes), { preserveBlockedLociMyuSource: true });
    const directNative = plan.migration !== null || plan.blockedLociMyuSource !== null && plan.blockedLociMyuSource !== undefined;
    if (decideHomeIntakeRoute({ container: 'foreign', hasLociMyuSource: directNative }) === 'unsupported') {
      await infoDialog(
        '対応していないZIP',
        'この画面で変換できるLociMyuデータが見つかりませんでした。モデルから始める場合は「開く／新しく作る」を選んでください。',
      );
      return;
    }
    const defaultName = file.name.replace(/\.(zip|lociview)$/iu, '');
    const answer = await importWizardDialog(plan, defaultName, { directNative: true });
    if (answer === null) return;
    const projectId = await deps.convertLociMyuZipToNative(
      file,
      plan,
      answer.projectName,
      answer.confirmedDisplaySetRelation,
      (message) => {
        fileStatus.className = 'lv-dim lv-pad';
        fileStatus.textContent = message;
      },
    );
    if (projectId === null) {
      fileStatus.className = 'lv-warn lv-pad';
      fileStatus.textContent = '変換は開始されませんでした。変換結果の説明を確認してください。';
      return;
    }
    fileStatus.textContent = '変換が完了しました。編集できるプロジェクトを開きます…';
    deps.openNativeProjects(projectId, 'edit');
  }

  async function renderList(): Promise<void> {
    clear(listEl);
    const items = await listProjects(deps.fs);
    if (items.length === 0) {
      listEl.append(el('div', { class: 'lv-dim lv-pad' }, '保存済みの従来形式はありません'));
      return;
    }
    for (const item of items) {
      listEl.append(el('div', { class: 'lv-home-item' },
        el('b', {}, item.name),
        el('span', { class: 'lv-dim' }, item.createdAt.slice(0, 10)),
        el('span', { class: 'lv-flex1' }),
        el('button', { onclick: () => void openSavedConventional(item.dir) }, '閲覧専用で開く'),
      ));
    }
  }

  async function renderNativeList(): Promise<void> {
    clear(nativeListEl);
    try {
      const items = await deps.listNativeProjects();
      if (items.length === 0) {
        nativeListEl.append(el('div', { class: 'lv-dim lv-pad' }, '保存済みのプロジェクトはありません'));
        return;
      }
      for (const item of items) {
        nativeListEl.append(el('div', { class: 'lv-home-item' },
          el('b', {}, item.title),
          el('span', { class: 'lv-flex1' }),
          el('button', { class: 'primary', onclick: () => deps.openNativeProjects(item.projectId, 'edit') }, '編集して開く'),
          el('button', { onclick: () => deps.openNativeProjects(item.projectId, 'view') }, '閲覧のみで開く'),
        ));
      }
    } catch (error) {
      nativeListEl.append(el('div', { class: 'lv-warn lv-pad' },
        `一覧を読み込めませんでした：${error instanceof Error ? error.message : String(error)}`));
    }
  }

  void renderNativeList();
  void renderList();
}
