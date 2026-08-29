// アプリシェル — 画面遷移（ホーム ⇄ ビューア）、identity、ワークスペース選択、キーボード

import { ProjectStore, type Identity } from '../core/store';
import { newId } from '../core/ids';
import { parseManifest } from '../core/manifest';
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
import { el, clear, fmtBytes } from './dom';
import { infoDialog, promptDialog } from './dialogs';
import { fNum, fStr } from './fields';
import { mountHome, type NativeProjectListItem, type WritableProjectSession } from './home';
import { mountViewerScreen } from './viewerScreen';
import type { PackageExportStatus } from './saveStatus';

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
      'このブラウザは永続ワークスペース(OPFS)に未対応です。作業内容はタブを閉じると消えます。必ず「書き出し」で保存してください。';
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
      await infoDialog('読み取り専用', 'Edit modeで書込みロックを取得し、端末保存済みデータを再読込するまで、プロファイル変更は記録できません。');
      return;
    }
    const name = await promptDialog('プロファイル', '表示名（マージ時に相手へ見える名前）', identity.displayName ?? '');
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
    const text = await fs.readText(`${dir}/lociview.json`);
    if (text === null) throw new Error(`project: no manifest in ${dir}`);
    return parseManifest(text);
  }

  async function startProjectMutation(
    dir: string,
    projectId: string,
    existing: boolean,
  ): Promise<WritableProjectSession | null> {
    const access = await mutationCoordinator.tryAcquire(fs, dir, projectId);
    if (!access.holdsWriteLock) {
      access.release();
      return null;
    }
    try {
      if (!existing) {
        if (await fs.exists(`${dir}/lociview.json`)) {
          throw new Error(`project: target is already active (${dir})`);
        }
        access.activateNewProject();
        return { access, fs: access.workspace, store: null };
      }
      const store = await ProjectStore.open(access.workspace, dir, identity);
      if (store.manifest.projectId !== projectId) {
        throw new Error('project: manifest identity changed during lock acquisition');
      }
      access.activateAfterDurableReload();
      return { access, fs: access.workspace, store };
    } catch (error) {
      access.release();
      throw error;
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

  async function listNativeProjects(): Promise<NativeProjectListItem[]> {
    if (!persistentWorkspace) return [];
    const { listNativeProjectsV1 } = await import('../nativeGs/storage');
    return (await listNativeProjectsV1(fs)).map(({ projectId, title }) => ({ projectId, title }));
  }

  async function restoreNativePackage(file: File, onStatus: (message: string) => void): Promise<string> {
    if (!persistentWorkspace) {
      throw new Error('このブラウザでは対応プロジェクトを端末へ保存できないため、バックアップを復元できません。');
    }
    const [{ inspectNativePortablePackageV1, restoreNativePortablePackageV1 }, { nativeProjectRoot }] = await Promise.all([
      import('../nativeGs/portablePackage'),
      import('../nativeGs/storage'),
    ]);
    onStatus('バックアップの内容を確認しています…');
    const inspection = await inspectNativePortablePackageV1(file);
    const required = inspection.representationByteLength + inspection.manifest.nativeSnapshot.byteLength + 64 * 1024;
    const estimate = await navigator.storage.estimate?.();
    if (
      estimate?.quota !== undefined && estimate.usage !== undefined &&
      Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
      estimate.quota - estimate.usage < required
    ) {
      throw new Error(`保存容量が不足しています（モデル ${fmtBytes(inspection.representationByteLength)}）。プロジェクトは復元されていません。`);
    }

    const projectId = inspection.snapshot.project.id;
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
      await restoreNativePortablePackageV1(access.workspace, fs, file, {
        signal: abort.signal,
        onStatus: () => onStatus('モデルデータを確認しながら復元しています…'),
      });
      return projectId;
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
      startProjectMutation,
      openProfile: () => void openProfile(),
      storageWarning,
      listNativeProjects,
      openNativeProjects,
      restoreNativePackage,
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
    mode: ProjectSessionMode,
    prepared?: WritableProjectSession,
  ): Promise<void> {
    if (projectOpening) {
      // A plain home-list double click does not own anything that needs cleanup.
      // Prepared mutation sessions must reject so their caller releases the unused lock.
      if (prepared === undefined) return;
      throw new Error('project: another project is already opening');
    }
    if (ctx !== null || projectAccess !== null) {
      throw new Error('project: close the current session before opening another project');
    }
    projectOpening = true;
    const navigationEpoch = ++projectNavigationEpoch;
    let access: ProjectMutationSession | null = prepared?.access ?? null;
    try {
      let store = prepared?.store ?? null;
      if (access === null) {
        const manifest = await readProjectManifest(dir);
        access = mode === 'view'
          ? mutationCoordinator.openView(fs, dir, manifest.projectId)
          : await mutationCoordinator.tryAcquire(fs, dir, manifest.projectId);
        store = await ProjectStore.open(access.workspace, dir, identity);
        if (store.manifest.projectId !== manifest.projectId) {
          throw new Error('project: manifest identity changed during open');
        }
        if (access.holdsWriteLock) access.activateAfterDurableReload();
      } else {
        if (mode !== 'edit' || access.sessionMode !== 'edit') {
          throw new Error('project: prepared mutation session requires Edit mode');
        }
        if (access.projectRoot !== dir) throw new Error('project: prepared session root mismatch');
        store ??= await ProjectStore.open(access.workspace, dir, identity);
        if (store.workspace !== access.workspace || store.manifest.projectId !== access.projectId) {
          throw new Error('project: prepared session identity mismatch');
        }
        if (access.holdsWriteLock && access.accessState !== 'editable') {
          access.activateAfterDurableReload();
        }
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

  async function requestEditMode(): Promise<void> {
    const activeCtx = ctx;
    const oldAccess = projectAccess;
    if (activeCtx === null || oldAccess === null || activeCtx.store.canMutate) return;
    const navigationEpoch = projectNavigationEpoch;
    const next = await mutationCoordinator.tryAcquire(
      fs,
      activeCtx.dir,
      activeCtx.store.manifest.projectId,
    );
    if (!next.holdsWriteLock) {
      const detail = next.accessDetail;
      next.release();
      await infoDialog('読み取り専用', `書込みロックをまだ取得できません。\n\n${detail}`);
      return;
    }
    try {
      const store = await ProjectStore.open(next.workspace, activeCtx.dir, identity);
      if (
        navigationEpoch !== projectNavigationEpoch ||
        ctx !== activeCtx ||
        projectAccess !== oldAccess
      ) {
        next.release();
        return;
      }
      if (store.manifest.projectId !== activeCtx.store.manifest.projectId) {
        throw new Error('project: manifest identity changed before ownership transfer');
      }
      next.activateAfterDurableReload();
      oldAccess.release();
      projectAccess = null;
      disposeViewer();
      await mountOpenedProject(activeCtx.dir, next, store, navigationEpoch);
    } catch (error) {
      next.release();
      if (projectAccess === next) {
        projectAccess = null;
        disposeViewer();
        if (navigationEpoch === projectNavigationEpoch) renderHome();
      }
      await infoDialog('Edit modeへの切替', error instanceof Error ? error.message : String(error));
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
      await infoDialog('警告', `ログに破損行が ${total} 行あり、スキップしました（他のデータは無事です）`);
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
      requestEditMode: () => void requestEditMode(),
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
