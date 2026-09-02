// アプリシェル — 画面遷移（ホーム ⇄ ビューア）、identity、ワークスペース選択、キーボード

import { ProjectStore, type Identity } from '../core/store';
import { newId } from '../core/ids';
import {
  parseCandidateV1ManifestBytes,
  readPublishedCandidateV1ManifestBytes,
} from '../core/manifest';
import { MemoryFS, type ProjectSessionMode, type WorkspaceFS } from '../platform/fs';
import { OpfsFS } from '../platform/opfs';
import { ProjectMutationCoordinator, type ProjectMutationSession } from '../platform/projectLock';
import {
  initFileHandlers,
  initInstallPrompt,
  onExternalFileOpen,
  registerPwa,
} from '../platform/pwa';
import { detectFormat, loadModel } from '../viewer/loaders';
import { ViewerCore } from '../viewer/viewer';
import { AppContext } from './context';
import { el, clear, downloadBlob, fmtBytes } from './dom';
import { infoDialog, promptDialog } from './dialogs';
import { fNum, fStr } from './fields';
import { mountHome, type NativeProjectListItem } from './home';
import type { ZipInspection } from '../assets/package';
import { serializeConventionalSourceReport } from './conventionalSourceReport';
import { mountViewerScreen } from './viewerScreen';
import type { PackageExportStatus } from './saveStatus';
import type { ImportPlan } from '../assets/importWizard';
import type { LociMyuDisplaySetRelationConfirmation } from '../io/locimyu';

/** これを超えるモデルは開いた時点で自動読み込みせず、手動表示に委ねる（iOSメモリ対策） */
const AUTO_LOAD_LIMIT = 25 * 1024 * 1024;

export async function bootApp(root: HTMLElement): Promise<void> {
  // ---- PWA（オフライン起動・インストール・ファイル関連付け）------------------------
  initFileHandlers();
  initInstallPrompt();
  void registerPwa({
    onUpdate: (applyUpdate) => showToast('新しいバージョンがあります', '更新', applyUpdate),
  });

  // ---- ワークスペース ----------------------------------------------------------
  let fs: WorkspaceFS;
  let persistentWorkspace = false;
  let storageWarning: string | null = null;
  if (await OpfsFS.isAvailable()) {
    fs = await OpfsFS.open();
    persistentWorkspace = true;
    // 永続化を要求（iOSのストレージ削除対策。docs/06 §4）
    try {
      await navigator.storage.persist?.();
    } catch {
      // best-effort
    }
  } else {
    fs = new MemoryFS();
    storageWarning =
      'このブラウザでは端末への永続保存を利用できません。従来形式の登録・変換は開始できません。';
  }
  // View mode never needs this coordinator. Edit mode always requires the real
  // browser cross-context primitive, even when the workspace itself is tab-local.
  const mutationCoordinator = ProjectMutationCoordinator.browser(
    typeof navigator !== 'undefined' && navigator.locks !== undefined ? navigator.locks : null,
  );

  // ---- 編集者identity（自己発行。docs/02 §3） ------------------------------------
  const identity: Identity = {
    userId: localStorage.getItem('lv-userId') ?? `usr_${newId('usr').slice(4)}`,
    deviceId: localStorage.getItem('lv-deviceId') ?? `dev_${newId('dev').slice(4)}`,
    displayName: localStorage.getItem('lv-displayName') ?? '',
  };
  localStorage.setItem('lv-userId', identity.userId);
  localStorage.setItem('lv-deviceId', identity.deviceId);

  let ctx: AppContext | null = null;
  let unmountViewer: (() => void) | null = null;
  let projectAccess: ProjectMutationSession | null = null;
  let projectOpening = false;
  let projectNavigationEpoch = 0;
  let packageExportStatus: PackageExportStatus = Object.freeze({ phase: 'idle' });
  let v1ConversionInProgress = false;
  let lociMyuConversionInProgress = false;

  // ---- 保存状態（書き出し済みop数をプロジェクトごとに記録） -----------------------------
  const exportedKey = (dir: string): string => `lv-package-covered:${dir}`;
  function unexportedCount(): number {
    if (ctx === null) return 0;
    const current = ctx.store.allOps.length;
    const stored = localStorage.getItem(exportedKey(ctx.dir));
    if (stored === null) return current;
    const covered = Number(stored);
    if (!Number.isSafeInteger(covered) || covered < 0 || covered > current) return current;
    return current - covered;
  }
  function setPackageExportStatus(dir: string, status: PackageExportStatus): void {
    if (ctx === null || ctx.dir !== dir) return;
    packageExportStatus = status;
    if (status.phase === 'download-started') {
      localStorage.setItem(exportedKey(dir), String(status.coveredOpCount));
    }
    ctx.notify();
  }

  // ---- プロファイル -------------------------------------------------------------
  async function openProfile(): Promise<void> {
    if (ctx !== null && !ctx.store.canMutate) {
      await infoDialog('閲覧専用', '従来形式を開いている間はプロファイルを変更できません。');
      return;
    }
    const name = await promptDialog('プロファイル', '表示名', identity.displayName ?? '');
    if (name === null) return;
    identity.displayName = name;
    localStorage.setItem('lv-displayName', name);
    if (ctx !== null) {
      // プロジェクト内のprofileエンティティも更新
      const existing = ctx.state.byKind.profile?.[identity.userId];
      if (existing !== undefined) {
        ctx.store.dispatch({ t: 'update', e: 'profile', id: identity.userId, v: { displayName: name } });
      } else {
        ctx.store.dispatch({
          t: 'create', e: 'profile', id: identity.userId,
          v: { displayName: name, defaultPinColor: '#eab308' },
        });
      }
    }
  }

  // ---- モデル読込 ---------------------------------------------------------------
  async function loadModelAsset(assetId: string): Promise<void> {
    if (ctx === null) return;
    const asset = ctx.asset(assetId);
    if (asset === null) return;
    // 軽量版があればそれを表示に使う（原本は書き出し用に保持）。iOSメモリ対策
    const optPath = fStr(asset, 'optimizedPath');
    const displayPath = optPath !== '' ? optPath : fStr(asset, 'path');
    let bytes = await ctx.fs.readBytes(`${ctx.dir}/${displayPath}`);
    if (bytes === null && optPath !== '') {
      bytes = await ctx.fs.readBytes(`${ctx.dir}/${fStr(asset, 'path')}`); // 軽量版が無ければ原本
    }
    if (bytes === null) {
      await infoDialog('モデル読込', `ファイルが見つかりません（差分ZIPで受け取った場合はフルZIPの取込が必要です）`);
      return;
    }
    const fmt = detectFormat(displayPath, bytes);
    if (fmt === null) {
      await infoDialog('モデル読込', '対応していない形式です');
      return;
    }
    try {
      const model = await loadModel(fmt, bytes);
      ctx.viewer.setModel(model);
      ctx.ui.activeModelAssetId = assetId;
      ctx.ui.loadedModelAssetId = assetId; // 実際に描画された（「表示中」判定の根拠）
      // transformの適用
      const t = asset.fields.transform;
      if (typeof t === 'object' && t !== null && !Array.isArray(t)) {
        const o = t as Record<string, unknown>;
        ctx.viewer.setModelTransform({
          scale: typeof o.scale === 'number' ? o.scale : 1,
          upAxis: o.upAxis === 'Z' ? 'Z' : 'Y',
        });
      }
      ctx.syncPins();
      ctx.syncMaterials();
      ctx.notify();
    } catch (e) {
      await infoDialog('モデル読込失敗', e instanceof Error ? e.message : String(e));
    }
  }

  // ---- project session / 画面遷移 ----------------------------------------------
  async function readProjectManifest(dir: string) {
    const bytes = await readPublishedCandidateV1ManifestBytes(fs, dir);
    if (bytes === null) throw new Error(`project: no manifest in ${dir}`);
    return parseCandidateV1ManifestBytes(bytes);
  }

  async function registerConventionalPackage(inspection: ZipInspection): Promise<string> {
    if (!persistentWorkspace) {
      throw new Error('このブラウザでは従来形式を端末へ保存できないため、取込を開始できません。');
    }
    if (inspection.kind !== 'lociview' || inspection.manifest === null) {
      throw new Error('従来形式として確認できませんでした。');
    }
    const dir = `projects/${inspection.manifest.projectId}`;
    const access = await mutationCoordinator.tryAcquire(fs, dir, inspection.manifest.projectId);
    if (!access.holdsWriteLock) {
      const detail = access.accessDetail;
      access.release();
      throw new Error(detail);
    }
    try {
      access.activateNewProject();
      const { importNewProject } = await import('../assets/package');
      try {
        await importNewProject(access.workspace, dir, inspection, {
          rejectPublishedTarget: true,
          namespaceFs: fs,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('target is already published')) {
          throw new Error(
            '同じ識別情報の従来形式が端末に保存済みです。選択したファイルは統合・上書きしていません。ホームから保存済みのコピーを閲覧専用で開いてください。',
          );
        }
        if (error instanceof Error && error.message.includes('new-format project')) {
          throw new Error(
            '同じ識別情報の新しい形式のプロジェクトが端末にあるため、選択した従来形式は保存していません。' +
            'ホームから既存の新しい形式のプロジェクトを開いてください。',
          );
        }
        throw error;
      }
      return dir;
    } finally {
      access.release();
    }
  }

  function disposeViewer(): void {
    if (unmountViewer !== null) {
      unmountViewer();
      unmountViewer = null;
    }
    if (ctx !== null) {
      ctx.viewer.dispose();
      ctx.dispose();
      ctx = null;
    }
  }

  function openNativeProjects(projectId?: string, mode?: ProjectSessionMode): void {
    const url = new URL(import.meta.env.BASE_URL, window.location.origin);
    url.searchParams.set('mode', 'native-gs');
    if (projectId !== undefined && mode !== undefined) {
      url.searchParams.set('project', projectId);
      url.searchParams.set('session', mode);
    }
    window.location.assign(url);
  }

  async function convertOpenedV1ToNative(onStatus: (message: string) => void): Promise<void> {
    const activeCtx = ctx;
    const viewAccess = projectAccess;
    if (activeCtx === null || viewAccess === null) throw new Error('変換する従来形式を先に開いてください。');
    if (!persistentWorkspace) throw new Error('このブラウザでは新しい形式を端末へ保存できないため、変換を開始できません。');
    if (v1ConversionInProgress) throw new Error('新しい形式への変換はすでに進行中です。');
    v1ConversionInProgress = true;
    const progressText = el('p', { role: 'status' }, '変換元を確認しています…');
    const progressDialog = el('dialog', { class: 'lv-dialog' },
      el('h2', {}, '新しい形式へ変換'),
      el('p', {}, '従来形式は変更しません。変換が完了すると、編集できる新しいプロジェクトを開きます。'),
      progressText,
    ) as HTMLDialogElement;
    document.body.append(progressDialog);
    progressDialog.showModal();
    let progressClosed = false;
    const closeProgress = (): void => {
      if (progressClosed) return;
      progressClosed = true;
      progressDialog.close();
      progressDialog.remove();
    };
    const status = (message: string): void => {
      progressText.textContent = message;
      onStatus(message);
    };
    let sourceGuard: ProjectMutationSession | null = null;
    let targetAccess: ProjectMutationSession | null = null;
    let created: import('../nativeGs/schema').NativeProjectSnapshotV1 | null = null;
    let sourceAuthorityLost = false;
    let unsubscribeSourceAccess = (): void => {};
    try {
      status('変換中に元データが変わらないよう保護しています…');
      sourceGuard = await mutationCoordinator.tryAcquireSourceSnapshot(
        fs,
        activeCtx.dir,
        activeCtx.store.manifest.projectId,
      );
      if (!sourceGuard.holdsSourceSnapshotLock) {
        throw new Error(sourceGuard.accessDetail);
      }
      const sourceStore = await ProjectStore.openLegacySource(sourceGuard.workspace, activeCtx.dir, identity);
      if (sourceStore.manifest.projectId !== activeCtx.store.manifest.projectId) {
        throw new Error('変換元の識別情報が変わったため、変換を開始しませんでした。');
      }
      sourceGuard.activateSourceSnapshotAfterDurableReload();
      unsubscribeSourceAccess = sourceGuard.subscribeAccess((state) => {
        if (state === 'lock-lost') sourceAuthorityLost = true;
      });
      const assertSourceAuthority = (): void => {
        if (
          sourceAuthorityLost || !sourceGuard?.holdsSourceSnapshotLock ||
          ctx !== activeCtx || projectAccess !== viewAccess
        ) {
          throw new Error('変換元の保護を維持できないため、新しいプロジェクトの公開を中止しました。');
        }
        sourceStore.assertSourceSnapshotProtected();
      };
      assertSourceAuthority();
      const conversion = await import('../nativeGs/frozenV1Conversion');
      status('内容と元ファイルを照合しています…');
      const plan = await conversion.planOpenedFrozenV1ToNative(
        sourceGuard.workspace,
        activeCtx.dir,
        sourceStore,
      );
      assertSourceAuthority();
      if (plan.blockingIssueCount > 0) {
        downloadBlob(
          conversion.serializeFrozenV1ConversionPreflight(plan),
          `${plan.sourceProjectId}-new-format-conversion-details.json`,
          'application/json',
        );
        closeProgress();
        await infoDialog(
          '変換を開始しませんでした',
          `${plan.blockingIssueCount}件の変換できない項目があります。不完全なプロジェクトは作成していません。理由の説明を保存しました。`,
        );
        return;
      }
      const storage = await import('../nativeGs/storage');
      const assertSourceUnchanged = async (): Promise<void> => {
        assertSourceAuthority();
        await conversion.assertOpenedFrozenV1SourceUnchanged(
          plan,
          sourceGuard!.workspace,
          sourceStore,
        );
        assertSourceAuthority();
      };
      await assertSourceUnchanged();
      assertSourceAuthority();
      status('新しいプロジェクトの保存準備をしています…');
      targetAccess = await mutationCoordinator.tryAcquire(
        fs,
        storage.nativeProjectRoot(plan.draft.project.id),
        plan.draft.project.id,
      );
      if (!targetAccess.holdsWriteLock) throw new Error(targetAccess.accessDetail);
      targetAccess.activateNewProject();
      assertSourceAuthority();
      status('モデルと画像を検証しながら新しいプロジェクトへ保存しています…');
      created = await storage.createNativeProjectV1(
        targetAccess.workspace,
        plan.draft,
        plan.representationSources,
        () => status('新しいプロジェクトを保存しています…'),
        plan.mediaSources,
        assertSourceUnchanged,
      );
      assertSourceAuthority();
      const sourceAfter = await conversion.assertOpenedFrozenV1SourceUnchanged(
        plan,
        sourceGuard.workspace,
        sourceStore,
      );
      assertSourceAuthority();
      const report = conversion.completeOpenedFrozenV1ConversionReport(plan, created, sourceAfter);
      downloadBlob(
        conversion.serializeFrozenV1ConversionReport(report),
        `${plan.sourceProjectId}-to-${created.project.id}-new-format-details.json`,
        'application/json',
      );
      targetAccess.release();
      targetAccess = null;
      closeProgress();
      const reported = report.issues.length;
      await infoDialog(
        '新しい形式への変換が完了しました',
        `従来形式は変更されていません。編集できる新しいプロジェクトを作成しました。${reported}件の注記を説明ファイルへ保存しました。`,
      );
      if (!(await closeProjectAndShowHome())) return;
      openNativeProjects(created.project.id, 'edit');
    } catch (error) {
      if (created !== null && targetAccess !== null) {
        try {
          const storage = await import('../nativeGs/storage');
          await storage.deleteNativeProjectV1(targetAccess.workspace, created.project.id, created);
          created = null;
        } catch (cleanupError) {
          throw new Error(
            `${error instanceof Error ? error.message : String(error)}\n` +
            `作成途中の新しいプロジェクトを片付けられませんでした: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          );
        }
      }
      const detail = error instanceof Error ? error.message : String(error);
      if (/source (?:file )?(?:changed|disappeared)|source changed while hashing/iu.test(detail)) {
        throw new Error('変換中に元データが変わったため、新しいプロジェクトは公開していません。もう一度開き直して確認してください。');
      }
      if (/malformed operation|unsupported source schema/iu.test(detail)) {
        throw new Error('従来形式に安全に変換できない記録があるため、新しいプロジェクトは作成していません。');
      }
      if (/legacy|\bv1\b|writer|operation log|native project/iu.test(detail)) {
        throw new Error('新しい形式への変換を完了できませんでした。元の従来形式は変更されていません。');
      }
      throw error;
    } finally {
      unsubscribeSourceAccess();
      sourceGuard?.release();
      targetAccess?.release();
      closeProgress();
      v1ConversionInProgress = false;
    }
  }

  async function listNativeProjects(): Promise<NativeProjectListItem[]> {
    if (!persistentWorkspace) return [];
    const { listNativeProjectsV1 } = await import('../nativeGs/storage');
    return (await listNativeProjectsV1(fs)).map(({ projectId, title }) => ({ projectId, title }));
  }

  async function convertLociMyuZipToNative(
    sourceFile: File,
    importPlan: ImportPlan,
    projectName: string,
    confirmedDisplaySetRelation: LociMyuDisplaySetRelationConfirmation | null,
    onStatus: (message: string) => void,
  ): Promise<string | null> {
    if (!persistentWorkspace) {
      throw new Error('このブラウザでは新しいプロジェクトを端末へ保存できないため、LociMyu変換を開始できません。');
    }
    if (lociMyuConversionInProgress) throw new Error('LociMyu変換はすでに進行中です。');
    lociMyuConversionInProgress = true;
    const progressText = el('p', { role: 'status' }, '元のLociMyu ZIPを読み取り専用で確認しています…');
    const progressDialog = el('dialog', { class: 'lv-dialog' },
      el('h2', {}, 'LociMyu ZIPを新しいプロジェクトへ変換'),
      el('p', {}, '元ZIPには書き戻しません。変換できない項目は説明ファイルへ記録します。'),
      progressText,
    ) as HTMLDialogElement;
    document.body.append(progressDialog);
    progressDialog.showModal();
    let progressClosed = false;
    const closeProgress = (): void => {
      if (progressClosed) return;
      progressClosed = true;
      progressDialog.close();
      progressDialog.remove();
    };
    const status = (message: string): void => {
      progressText.textContent = message;
      onStatus(message);
    };
    let targetAccess: ProjectMutationSession | null = null;
    let created: import('../nativeGs/schema').NativeProjectSnapshotV1 | null = null;
    try {
      const conversion = await import('../nativeGs/locimyuConversion');
      status('表、キャプション、モデル、画像を照合しています…');
      const plan = await conversion.planLociMyuZipToNative(sourceFile, importPlan, projectName, {
        confirmedDisplaySetRelation,
      });
      const reportStem = sourceFile.name.replace(/\.(zip|lociview)$/iu, '') || 'locimyu';
      if (plan.blockingIssueCount > 0) {
        status('元ZIPが変化していないことを再確認しています…');
        const sourceAfter = await conversion.assertLociMyuSourceUnchanged(plan, sourceFile);
        const report = conversion.completeBlockedLociMyuNativeConversionReport(plan, sourceAfter);
        downloadBlob(
          conversion.serializeLociMyuNativeConversionReport(report),
          `${reportStem}-native-conversion-preflight.json`,
          'application/json',
        );
        closeProgress();
        await infoDialog(
          '変換を開始しませんでした',
          `${plan.blockingIssueCount}件の変換できない項目があります。元ZIPは変更せず、不完全なプロジェクトも作成していません。詳細を説明ファイルへ保存しました。`,
        );
        return null;
      }
      const storage = await import('../nativeGs/storage');
      status('元ZIPが変化していないことを確認しています…');
      await conversion.assertLociMyuSourceUnchanged(plan, sourceFile);
      status('新しいプロジェクトの保存準備をしています…');
      targetAccess = await mutationCoordinator.tryAcquire(
        fs,
        storage.nativeProjectRoot(plan.draft.project.id),
        plan.draft.project.id,
      );
      if (!targetAccess.holdsWriteLock) throw new Error(targetAccess.accessDetail);
      targetAccess.activateNewProject();
      status('モデルと画像を検証しながら新しいプロジェクトへ保存しています…');
      created = await conversion.createLociMyuNativeProject(
        targetAccess.workspace,
        plan,
        sourceFile,
        () => status('新しいプロジェクトを保存しています…'),
      );
      const sourceAfter = await conversion.assertLociMyuSourceUnchanged(plan, sourceFile);
      const report = conversion.completeLociMyuNativeConversionReport(plan, created, sourceAfter);
      downloadBlob(
        conversion.serializeLociMyuNativeConversionReport(report),
        `${reportStem}-to-${created.project.id}-conversion-report.json`,
        'application/json',
      );
      targetAccess.release();
      targetAccess = null;
      closeProgress();
      await infoDialog(
        '変換が完了しました',
        `元のLociMyu ZIPは変更されていません。編集できる新しいプロジェクトを作成し、${report.issues.length}件の注記を説明ファイルへ保存しました。`,
      );
      return created.project.id;
    } catch (error) {
      if (created !== null && targetAccess !== null) {
        try {
          const storage = await import('../nativeGs/storage');
          await storage.deleteNativeProjectV1(targetAccess.workspace, created.project.id, created);
          created = null;
        } catch (cleanupError) {
          throw new Error(
            `${error instanceof Error ? error.message : String(error)}\n` +
            `作成途中の新しいプロジェクトを片付けられませんでした: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          );
        }
      }
      throw error;
    } finally {
      targetAccess?.release();
      closeProgress();
      lociMyuConversionInProgress = false;
    }
  }

  async function restoreNativePackage(
    file: File,
    onStatus: (message: string) => void,
  ): Promise<{ readonly projectId: string; readonly openMode: ProjectSessionMode }> {
    if (!persistentWorkspace) {
      throw new Error('このブラウザでは対応プロジェクトを端末へ保存できないため、バックアップを復元できません。');
    }
    const [
      { inspectNativePortablePackageV1, restoreNativePortablePackageV1 },
      {
        detectNativePackageContainerKindV1,
        inspectNativeExchangePackageV1,
        nativeExchangeDefaultOpenModeV1,
        restoreNativeExchangePackageV1,
      },
      { listNativeProjectsV1, nativeProjectRoot },
    ] = await Promise.all([
      import('../nativeGs/portablePackage'),
      import('../nativeGs/packageExchange'),
      import('../nativeGs/storage'),
    ]);
    onStatus('LociView packageの内容を確認しています…');
    const containerKind = await detectNativePackageContainerKindV1(file);
    const inspection = containerKind === 'backup'
      ? await inspectNativePortablePackageV1(file)
      : await inspectNativeExchangePackageV1(file);
    const required = inspection.representationByteLength + inspection.mediaByteLength + inspection.manifest.nativeSnapshot.byteLength + 64 * 1024;
    const estimate = await navigator.storage.estimate?.();
    if (
      estimate?.quota !== undefined && estimate.usage !== undefined &&
      Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
      estimate.quota - estimate.usage < required
    ) {
      throw new Error(`保存容量が不足しています（データ ${fmtBytes(inspection.representationByteLength + inspection.mediaByteLength)}）。プロジェクトは復元されていません。`);
    }

    const projectId = inspection.snapshot.project.id;
    if (
      containerKind === 'exchange' && 'purpose' in inspection.manifest &&
      inspection.manifest.purpose === 'collaboration' &&
      (await listNativeProjectsV1(fs)).some((project) => project.projectId === projectId)
    ) {
      throw new Error(
        'この共同編集用packageと同じProjectが既にあります。対象Projectを「編集して開く」から開き、' +
        '共同編集packageを統合してください。',
      );
    }
    const access = await mutationCoordinator.tryAcquire(fs, nativeProjectRoot(projectId), projectId);
    if (!access.holdsWriteLock) {
      const detail = access.accessDetail;
      access.release();
      throw new Error(detail);
    }
    const abort = new AbortController();
    let unsubscribe = (): void => {};
    try {
      access.activateNewProject();
      unsubscribe = access.subscribeAccess((state) => {
        if (state !== 'editable') abort.abort(new Error(access.accessDetail));
      });
      onStatus('モデルデータをこの端末へ復元しています…');
      if (containerKind === 'backup') {
        await restoreNativePortablePackageV1(access.workspace, fs, file, {
          signal: abort.signal,
          onStatus: () => onStatus('モデルデータを確認しながら完全バックアップを復元しています…'),
        });
        return { projectId, openMode: 'edit' };
      }
      const restored = await restoreNativeExchangePackageV1(access.workspace, fs, file, {
        signal: abort.signal,
        onStatus: () => onStatus('モデルデータを確認しながらpackageを復元しています…'),
      });
      return { projectId, openMode: nativeExchangeDefaultOpenModeV1(restored.purpose) };
    } finally {
      unsubscribe();
      access.release();
    }
  }

  function renderHome(): void {
    clear(root);
    mountHome(root, {
      fs,
      identity,
      openProject,
      registerConventionalPackage,
      openProfile: () => void openProfile(),
      storageWarning,
      listNativeProjects,
      openNativeProjects,
      restoreNativePackage,
      convertLociMyuZipToNative,
    });
  }

  async function closeProjectAndShowHome(): Promise<boolean> {
    projectNavigationEpoch += 1;
    const activeCtx = ctx;
    const access = projectAccess;
    if (activeCtx !== null && access !== null) {
      access.beginClose();
      activeCtx.notify();
      try {
        for (;;) {
          await activeCtx.store.flush();
          await access.waitForWorkspaceIdle();
          await activeCtx.store.flush();
          if (access.sealWorkspaceWritesForRelease()) break;
        }
      } catch (error) {
        access.resumeAfterCloseFailure();
        activeCtx.notify();
        await infoDialog(
          '保存を完了できません',
          `Edit modeと書込みロックを維持しています。保存を再試行してからホームへ戻ってください。\n\n${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
      access.release();
    } else {
      access?.release();
    }
    projectAccess = null;
    disposeViewer();
    renderHome();
    return true;
  }

  async function openProject(
    dir: string,
  ): Promise<void> {
    if (projectOpening) {
      return;
    }
    if (ctx !== null || projectAccess !== null) {
      throw new Error('project: close the current session before opening another project');
    }
    projectOpening = true;
    const navigationEpoch = ++projectNavigationEpoch;
    let access: ProjectMutationSession | null = null;
    try {
      const manifest = await readProjectManifest(dir);
      access = mutationCoordinator.openView(fs, dir, manifest.projectId);
      const store = await ProjectStore.openLegacySource(access.workspace, dir, identity);
      if (store.manifest.projectId !== manifest.projectId) {
        throw new Error('project: manifest identity changed during open');
      }
      if (navigationEpoch !== projectNavigationEpoch) {
        throw new Error('project: opening was superseded by another navigation');
      }
      await mountOpenedProject(dir, access, store, navigationEpoch);
    } catch (error) {
      access?.release();
      if (projectAccess === access) {
        projectAccess = null;
        disposeViewer();
        if (navigationEpoch === projectNavigationEpoch) renderHome();
      }
      throw error;
    } finally {
      projectOpening = false;
    }
  }

  async function mountOpenedProject(
    dir: string,
    access: ProjectMutationSession,
    store: ProjectStore,
    navigationEpoch: number,
  ): Promise<void> {
    projectAccess = access;
    packageExportStatus = Object.freeze({ phase: 'idle' });
    if (store.loadErrors.length > 0) {
      const total = store.loadErrors.reduce((s, e) => s + e.errors.length, 0);
      downloadBlob(
        serializeConventionalSourceReport(store.loadErrors.flatMap(({ file, errors }) =>
          errors.map(({ line, reason }) => ({ path: file, line, reason })))),
        `${store.manifest.projectId}-source-report.json`,
        'application/json',
      );
      await infoDialog(
        '従来形式の確認結果',
        `安全に表示できない記録が ${total} 件あり、その内容は表示に反映していません。ファイル、行番号、理由を説明ファイルへ保存しました。新しい形式への変換は開始できません。`,
      );
    }
    if (navigationEpoch !== projectNavigationEpoch || projectAccess !== access) {
      throw new Error('project: opening was superseded by another navigation');
    }
    clear(root);
    const viewer = new ViewerCore();
    ctx = new AppContext(access.workspace, dir, store, viewer, identity);
    // メモリ不足でGLが落ちたら、白画面のままにせず状況を伝える
    let contextLostShown = false;
    viewer.onContextLost(() => {
      // 描画は失われたので「表示中」を解除し、再表示できる状態に戻す
      if (ctx !== null) {
        ctx.ui.loadedModelAssetId = null;
        ctx.notify();
      }
      if (contextLostShown) return;
      contextLostShown = true;
      void infoDialog(
        '表示を停止しました',
        '端末のメモリが不足したため、3D表示を停止しました。' +
          'より軽いモデルでお試しいただくか、他のアプリを閉じてから開き直してください。' +
          '（キャプションや記録は失われていません）',
      );
    });
    unmountViewer = mountViewerScreen(root, ctx, {
      goHome: () => void closeProjectAndShowHome(),
      loadModelAsset,
      unexportedCount,
      persistentWorkspace,
      packageExportStatus: () => packageExportStatus,
      setPackageExportStatus: (status) => setPackageExportStatus(dir, status),
      openProfile: () => void openProfile(),
      convertOpenedV1ToNative,
    });
    // 最初のモデルを自動表示。ただし大きいモデルは自動で読まない。
    // （iOSはタブのメモリ上限が厳しく、開くたびに巨大モデルを読むとクラッシュが繰り返す。
    //  自動表示を外すことで、開く操作自体は必ず成功し、ユーザーが表示可否を選べる）
    if (ctx.ui.activeModelAssetId !== null) {
      const asset = ctx.asset(ctx.ui.activeModelAssetId);
      // 軽量版があればその大きさで判定する（軽量化により自動表示できる場合が増える）
      const optSize = asset !== null ? fNum(asset, 'optimizedSize', 0) : 0;
      const size = optSize > 0 ? optSize : asset !== null ? fNum(asset, 'size', 0) : 0;
      if (size > AUTO_LOAD_LIMIT) {
        await infoDialog(
          'モデルの表示',
          `モデル（${fmtBytes(size)}）が大きいため、自動では表示していません。\n\n` +
            'Modelタブの「表示」から読み込めます。端末のメモリに余裕がないと表示できないことがあります' +
            '（その場合は画面が再読み込みされます）。まずは軽い操作で問題がないか確かめてください。',
        );
      } else {
        await loadModelAsset(ctx.ui.activeModelAssetId);
      }
    }
    // 開発検証用フック（devビルドのみ）
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__lv = {
        ctx,
        fs: access.workspace,
        viewer,
        store,
        loadModelAsset,
      };
    }
  }

  // ---- キーボード ---------------------------------------------------------------
  document.addEventListener('keydown', (ev) => {
    if (ctx === null) return;
    if (v1ConversionInProgress) return;
    const editing = (ev.target as HTMLElement).tagName === 'INPUT' || (ev.target as HTMLElement).tagName === 'TEXTAREA';
    if (editing) return;
    if (!ctx.store.canMutate) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
      ev.preventDefault();
      ctx.undo.undo();
    } else if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) {
      ev.preventDefault();
      ctx.undo.redo();
    }
  });

  // ---- OSから開かれたファイル（関連付け・共有シート） -------------------------------
  onExternalFileOpen(async (file) => {
    // ビューアを開いている場合はホームへ戻してから投入する（ホームが受け口の一貫ルール）
    if (!(await closeProjectAndShowHome())) return;
    await new Promise((r) => setTimeout(r, 0));
    const dropTarget = root.querySelector('.lv-drop');
    if (dropTarget === null) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });

  renderHome();
}

/** 画面下部の一時通知（更新案内など） */
function showToast(message: string, actionLabel?: string, action?: () => void): void {
  const toast = el('div', { class: 'lv-toast', role: 'status' }, message);
  if (actionLabel !== undefined && action !== undefined) {
    toast.append(
      el('button', {
        class: 'primary mini',
        onclick: () => {
          toast.remove();
          action();
        },
      }, actionLabel),
    );
  }
  toast.append(el('button', { class: 'mini', onclick: () => toast.remove() }, '×'));
  document.body.append(toast);
  setTimeout(() => toast.remove(), 30_000);
}
