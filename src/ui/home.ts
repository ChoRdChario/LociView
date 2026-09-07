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
import type { NativeHomeUi } from '../nativeGs/homeUi';

export interface HomeDeps {
  nativeHome?: NativeHomeUi;
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
  const conventionalSection = el('details', { class: 'ng-card', hidden: 'true' },
    el('summary', {}, 'この端末に残っている旧プロジェクト'),
    el('p', { class: 'ng-note' }, '以前に読み込んだ旧LociViewプロジェクトです。閲覧専用で開き、元データを変更せず新しいプロジェクトへ変換できます。'),
    listEl,
  );
  const nativeListEl = el('div', { class: 'lv-home-list' });
  const nativeProjectsSection = el('section', { class: 'ng-card' },
    el('h2', {}, 'この端末のプロジェクト'),
    deps.nativeHome?.projects ?? nativeListEl,
  );
  const fileStatus = el('div', { class: 'lv-dim lv-pad lv-file-status', role: 'status' });
  const fileInput = el('input', {
    type: 'file',
    // No accept filter: custom .lociview UTI may otherwise be hidden on iPhone.
    style: 'display:none',
  }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) void handleFile(file);
    fileInput.value = '';
  });

  const dropZone = el('button', {
    type: 'button',
    class: 'lv-drop',
    'aria-label': 'ファイルを開く',
    'aria-describedby': 'lv-file-open-hint',
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
    el('span', { class: 'lv-drop-title' }, 'ファイルを開く'),
    el('span', { id: 'lv-file-open-hint', class: 'lv-dim' }, '選択またはここにドロップ'),
  );

  let creationPending = false;
  let hasConventionalProjects = false;
  const syncHomeStep = (): void => {
    dropZone.hidden = creationPending;
    nativeProjectsSection.hidden = creationPending;
    conventionalSection.hidden = creationPending || !hasConventionalProjects;
  };
  deps.nativeHome?.onCreationPendingChange((pending) => {
    const returningToIdle = creationPending && !pending;
    creationPending = pending;
    syncHomeStep();
    if (returningToIdle) dropZone.focus();
  });

  const installBar = el('div', { class: 'lv-install' });
  if (!isStandalone()) {
    onInstallAvailability((available) => {
      clear(installBar);
      if (!available) return;
      installBar.append(
        el('span', {}, 'ホーム画面に追加できます。オフライン利用の準備と、外部ファイルへのバックアップも確認してください。'),
        el('button', { class: 'primary mini', onclick: () => void promptInstall() }, '追加'),
      );
    });
  }

  root.append(
    el('main', { class: 'lv-home ng-home' },
      el('header', { class: 'lv-home-head' },
        el('span', { class: 'ng-brand' }, 'LociView'),
        el('span', { class: 'lv-flex1' }),
        el('button', { onclick: deps.openProfile }, 'プロファイル'),
      ),
      installBar,
      deps.storageWarning === null ? null : el('div', { class: 'lv-warn lv-pad' }, `⚠ ${deps.storageWarning}`),
      el('h1', {}, 'LociViewは、3Dデータにキャプションとメディアを添付するツールです'),
      el('p', { class: 'ng-note' },
        '作業内容はこの端末に保存されます。同じプロジェクトを使う相手とは、共同編集用ファイルでキャプション変更をやり取りできます。',
      ),
      dropZone,
      fileStatus,
      deps.nativeHome?.transfer ?? null,
      deps.nativeHome?.creation ?? null,
      nativeProjectsSection,
      conventionalSection,
      fileInput,
    ),
  );

  async function handleFile(file: File): Promise<void> {
    const release = deps.nativeHome?.beginIntake();
    if (release === null) {
      fileStatus.textContent = '処理中、または書き出したファイルの保存確認待ちです。処理結果を確認してから開いてください。';
      return;
    }
    try {
      fileStatus.className = 'lv-file-status lv-dim lv-pad';
      fileStatus.textContent = 'ファイルを確認しています…';
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const hasZipSignature = head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && (
        head[2] === 0x03 && head[3] === 0x04 ||
        head[2] === 0x05 && head[3] === 0x06 ||
        head[2] === 0x07 && head[3] === 0x08
      );
      let identity: Awaited<ReturnType<typeof inspectZipContainerIdentity>>;
      try {
        identity = await inspectZipContainerIdentity(file);
      } catch (error) {
        if (hasZipSignature || deps.nativeHome === undefined) throw error;
        release?.();
        await deps.nativeHome.acceptModelFile(file);
        fileStatus.textContent = '';
        return;
      }
      if (decideHomeIntakeRoute({ container: identity }) === 'native-package') {
        if (deps.nativeHome !== undefined) {
          release?.();
          fileStatus.textContent = '';
          deps.nativeHome.acceptPackageFile(file);
          return;
        }
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
          fileStatus.className = 'lv-file-status lv-warn lv-pad';
          fileStatus.textContent = '安全に開けない記録があります。この端末には保存していません。';
          const saveReport = await confirmDialog(
            'ファイルを安全に開けません',
            `${issues.length}件の記録を閲覧へ反映できません。元のファイルは変更せず、ファイル・行番号・理由を説明ファイルに書き出せます。`,
            '説明ファイルを保存',
          );
          if (saveReport) {
            downloadBlob(
              serializeConventionalSourceReport(issues),
              `${inspection.manifest.projectId}-source-report.json`,
              'application/json',
            );
            fileStatus.textContent = '説明ファイルのダウンロードを開始しました。ブラウザの保存先で完了を確認してください。従来形式は保存していません。';
          } else {
            fileStatus.textContent = 'ファイルを開くのを中止しました。説明ファイルも、この端末のプロジェクトも作成していません。';
          }
          return;
        }
        const existing = (await listProjects(deps.fs)).find(
          ({ projectId }) => projectId === inspection.manifest!.projectId,
        );
        const proceed = await confirmDialog(
          'ファイルを確認しました',
          existing === undefined
            ? '検出した内容：以前のLociView形式。開き方：この端末へ旧形式のコピーを保存し、閲覧専用で開きます。編集する場合は、開いた後に元データを変更しない新しいプロジェクトへ変換します。選択したファイルは変更しません。'
            : '検出した内容：以前のLociView形式。同じプロジェクトの旧形式コピーがこの端末にあります。選択したファイルは統合・上書き・変更せず、保存済みのコピーを閲覧専用で開きます。',
          existing === undefined ? '保存して閲覧専用で開く' : '保存済みを閲覧専用で開く',
        );
        if (!proceed) {
          fileStatus.className = 'lv-file-status lv-dim lv-pad';
          fileStatus.textContent = 'ファイルを開くのを中止しました。この端末には保存していません。';
          return;
        }
        if (existing !== undefined) {
          await openSavedConventional(existing.dir, true);
          return;
        }
        const dir = await deps.registerConventionalPackage(inspection);
        fileStatus.textContent = '従来形式を保存しました。閲覧専用で開きます…';
        await deps.openProject(dir);
        return;
      }

      await runLociMyuConversion(file, bytes);
    } catch (error) {
      fileStatus.className = 'lv-file-status lv-warn lv-pad';
      fileStatus.textContent = 'ファイルを開けませんでした。元のファイルは変更されていません。';
      const detail = error instanceof Error ? error.message : String(error);
      await infoDialog(
        'ファイルを開けません',
        /operation log|legacy|\bv1\b|writer/iu.test(detail)
          ? '安全に読み込めない記録があるため、この従来形式は開きませんでした。元のファイルは変更されていません。'
          : detail,
      );
    } finally { release?.(); }
  }

  async function openSavedConventional(dir: string, intakeHeld = false): Promise<void> {
    const release = intakeHeld ? undefined : deps.nativeHome?.beginIntake();
    if (release === null) {
      fileStatus.textContent = '先にファイル処理と保存先の確認を完了してください。';
      return;
    }
    try {
      fileStatus.className = 'lv-file-status lv-dim lv-pad';
      fileStatus.textContent = '従来形式を安全に確認しています…';
      await deps.openProject(dir);
    } catch (error) {
      fileStatus.className = 'lv-file-status lv-warn lv-pad';
      fileStatus.textContent = '従来形式を開けませんでした。保存済みの元データは変更されていません。';
      const detail = error instanceof Error ? error.message : String(error);
      await infoDialog(
        '従来形式を開けませんでした',
        /operation log|legacy|\bv1\b|writer|manifest/iu.test(detail)
          ? '安全に読み込めない記録があるため、この従来形式は開きませんでした。保存済みの元データは変更されていません。'
          : detail,
      );
    } finally { release?.(); }
  }

  async function runLociMyuConversion(file: File, bytes: Uint8Array): Promise<void> {
    const plan = await buildImportPlan(await readZipEntries(bytes), { preserveBlockedLociMyuSource: true });
    const directNative = plan.migration !== null || plan.blockedLociMyuSource !== null && plan.blockedLociMyuSource !== undefined;
    if (decideHomeIntakeRoute({ container: 'foreign', hasLociMyuSource: directNative }) === 'unsupported') {
      await infoDialog(
        '対応していないZIP',
        'このZIPには、開けるLociViewまたはLociMyuデータが見つかりませんでした。別のファイルを選んでください。',
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
        fileStatus.className = 'lv-file-status lv-dim lv-pad';
        fileStatus.textContent = message;
      },
    );
    if (projectId === null) {
      fileStatus.className = 'lv-file-status lv-warn lv-pad';
      fileStatus.textContent = '変換は開始されませんでした。変換結果の説明を確認してください。';
      return;
    }
    fileStatus.textContent = '変換が完了しました。編集できるプロジェクトを開きます…';
    deps.openNativeProjects(projectId, 'edit');
  }

  async function renderList(): Promise<void> {
    clear(listEl);
    const items = await listProjects(deps.fs);
    hasConventionalProjects = items.length > 0;
    syncHomeStep();
    if (items.length === 0) {
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

  if (deps.nativeHome === undefined) void renderNativeList();
  void renderList();
}
