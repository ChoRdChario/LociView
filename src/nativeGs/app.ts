import * as THREE from 'three';
import { detectFormat, type ModelFormat } from '../viewer/loaders';
import { clear, el, fmtBytes } from '../ui/dom';
import { OpfsFS } from '../platform/opfs';
import type { WorkspaceFS } from '../platform/fs';
import { ProjectMutationCoordinator, type ProjectMutationSession } from '../platform/projectLock';
import { registerPwa } from '../platform/pwa';
import { inspectNativeGsPlyV1 } from './plyProfile';
import { isNativeGsOfflineReady, prepareNativeGsOffline } from './offline';
import {
  activateNativeManualAssetTransformV1,
  NATIVE_GS_PROFILE_ID,
  NATIVE_IDENTITY_TRANSFORM,
  nativeModelProfileId,
  newNativeId,
  normalizeNativeSim3,
  setNativeAssetVisibilityV1,
  updateSelectedNativeCaptionV1,
  type NativeAssetBindingRevisionV1,
  type NativeDisplayMode,
  type NativeProjectDraftV1,
  type NativeProjectSnapshotV1,
  type NativeRepresentationDraftV1,
  type NativeSavedViewV1,
  type NativeSim3V1,
  type NativeSolidBackgroundV1,
} from './schema';
import { activeNativeRepresentationsV1, isNativeAssetVisibleV1, nativeCaptionNeedsReviewV1 } from './resolver';
import {
  addNativeAssetV1,
  assertNativeProjectDoesNotMixV1,
  createNativeProjectV1,
  deleteNativeProjectV1,
  listNativeProjectsV1,
  nativeProjectRoot,
  openNativeProjectV1,
  readNativeRepresentationV1,
  replaceNativeAssetV1,
  saveNativeProjectV1,
  type NativeAssetImportV1,
  type NativeBinarySource,
} from './storage';
import {
  exportNativePortablePackageV1,
  inspectNativePortablePackageV1,
  restoreNativePortablePackageV1,
} from './portablePackage';
import { digestNativeStream } from './sha256';
import { NativeGsViewer, type NativeAssetGizmoMode } from './viewer';
import './style.css';

interface SelectedFiles {
  readonly mesh: File | null;
  readonly gs: File | null;
  readonly proxy: File | null;
}

interface DraftResult {
  readonly draft: NativeProjectDraftV1;
  readonly sources: ReadonlyMap<string, NativeBinarySource>;
}

interface AssetImportBuild {
  readonly imported: NativeAssetImportV1;
  readonly sources: ReadonlyMap<string, NativeBinarySource>;
}

interface ExistingAssetBuildIdentity {
  readonly assetId: string;
  readonly assetFrameId: string;
  readonly label: string;
  readonly bindingMethod: NativeAssetBindingRevisionV1['method'];
}

function backgroundHex(background: NativeSolidBackgroundV1): string {
  return `#${background.colorSrgb.map((component) => (
    Math.round(THREE.MathUtils.clamp(component, 0, 1) * 255).toString(16).padStart(2, '0')
  )).join('')}`;
}

function backgroundFromHex(hex: string): NativeSolidBackgroundV1 {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) throw new Error('背景色が不正です。');
  return {
    kind: 'solid',
    colorSrgb: [
      Number.parseInt(hex.slice(1, 3), 16) / 255,
      Number.parseInt(hex.slice(3, 5), 16) / 255,
      Number.parseInt(hex.slice(5, 7), 16) / 255,
    ],
  };
}

function fileSource(file: File, mediaType: string): NativeBinarySource {
  return { size: file.size, mediaType, stream: () => file.stream() };
}

function modelMediaType(format: ModelFormat): string {
  switch (format) {
    case 'glb': return 'model/gltf-binary';
    case 'gltf': return 'model/gltf+json';
    case 'obj': return 'text/plain';
    case 'stl': return 'model/stl';
    case 'ply': return 'application/octet-stream';
  }
}

async function inspectModelFile(file: File, label: string): Promise<ModelFormat> {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 64 * 1024)).arrayBuffer());
  const format = detectFormat(file.name, head);
  if (format === null) throw new Error(`${label}はGLB/GLTF/OBJ/STL/通常PLYのいずれでもありません。`);
  if (format === 'ply') {
    const inspection = await inspectNativeGsPlyV1(file);
    if (inspection.kind === 'supported-gs') throw new Error(`${label}にGS PLYが選ばれています。GS欄へ指定してください。`);
  }
  return format;
}

function labelFromFile(file: File, fallback: string): string {
  const withoutExtension = file.name.replace(/\.[^.]+$/, '').trim();
  return withoutExtension === '' ? fallback : withoutExtension.slice(0, 160);
}

async function buildAssetImport(
  kind: 'mesh' | 'gs',
  file: File,
  proxy: File | null,
  assetToProject: NativeSim3V1,
  existing?: ExistingAssetBuildIdentity,
): Promise<AssetImportBuild> {
  if (kind === 'mesh' && proxy !== null) throw new Error('キャプション配置用の補助モデルは、対象のGaussian Splattingと一緒に指定してください。');
  const assetId = existing?.assetId ?? newNativeId('ast');
  const assetFrameId = existing?.assetFrameId ?? newNativeId('frm');
  const revisionId = newNativeId('rev');
  const bindingId = newNativeId('bnd');
  const primaryRepresentationId = newNativeId('rep');
  const primaryFamilyId = newNativeId('fam');
  const representations: NativeRepresentationDraftV1[] = [];
  const sources = new Map<string, NativeBinarySource>();
  const representationIds = [primaryRepresentationId];

  if (kind === 'mesh') {
    const format = await inspectModelFile(file, '3Dモデル');
    representations.push({
      id: primaryRepresentationId,
      assetId,
      representationFrameId: newNativeId('frm'),
      contentKind: 'mesh',
      purposes: ['source', 'display'],
      role: 'meshPrimary',
      variantFamilyId: primaryFamilyId,
      formatProfile: { id: nativeModelProfileId(format) },
      representationToAsset: NATIVE_IDENTITY_TRANSFORM,
      derivedFrom: [],
      mediaType: modelMediaType(format),
    });
    sources.set(primaryRepresentationId, fileSource(file, modelMediaType(format)));
  } else {
    const inspection = await inspectNativeGsPlyV1(file);
    if (inspection.kind !== 'supported-gs') {
      throw new Error('GS欄には対応Graphdeco binary little-endian SH2/SH3 PLYを選択してください。');
    }
    representations.push({
      id: primaryRepresentationId,
      assetId,
      representationFrameId: newNativeId('frm'),
      contentKind: 'gaussianSplat',
      purposes: ['source', 'display'],
      role: 'gsPrimary',
      variantFamilyId: primaryFamilyId,
      formatProfile: { id: NATIVE_GS_PROFILE_ID },
      representationToAsset: NATIVE_IDENTITY_TRANSFORM,
      derivedFrom: [],
      gsPly: inspection.facts,
      mediaType: 'application/octet-stream',
    });
    sources.set(primaryRepresentationId, fileSource(file, 'application/octet-stream'));
    if (proxy !== null) {
      const proxyFormat = await inspectModelFile(proxy, 'キャプション配置用の補助モデル');
      const proxyRepresentationId = newNativeId('rep');
      representationIds.push(proxyRepresentationId);
      representations.push({
        id: proxyRepresentationId,
        assetId,
        representationFrameId: newNativeId('frm'),
        contentKind: 'mesh',
        purposes: ['interaction'],
        role: 'interactionProxy',
        variantFamilyId: newNativeId('fam'),
        formatProfile: { id: nativeModelProfileId(proxyFormat) },
        representationToAsset: NATIVE_IDENTITY_TRANSFORM,
        derivedFrom: [primaryRepresentationId],
        proxyForGsVariantFamilyId: primaryFamilyId,
        mediaType: modelMediaType(proxyFormat),
      });
      sources.set(proxyRepresentationId, fileSource(proxy, modelMediaType(proxyFormat)));
    }
  }

  return {
    imported: {
      asset: {
        id: assetId,
        label: existing?.label ?? labelFromFile(file, kind === 'mesh' ? '3Dモデル' : 'Gaussian Splatting'),
        assetFrameId,
        status: { kind: 'ready', activeBindingId: bindingId },
      },
      binding: {
        id: bindingId,
        assetId,
        assetRevisionId: revisionId,
        assetToProject,
        method: existing?.bindingMethod ?? 'import',
      },
      revision: {
        id: revisionId,
        assetId,
        representationIds,
        anchorCompatibilityClasses: [{ id: newNativeId('cls'), targetVariantFamilyIds: [primaryFamilyId] }],
      },
      representations,
    },
    sources,
  };
}

async function buildDraft(title: string, files: SelectedFiles): Promise<DraftResult> {
  if (files.mesh === null && files.gs === null) throw new Error('3DモデルまたはGaussian Splattingを少なくとも一つ選択してください。');
  if (files.proxy !== null && files.gs === null) throw new Error('キャプション配置用の補助モデルは、対象のGaussian Splattingと一緒に指定してください。');
  const projectId = newNativeId('prj');
  const projectFrameId = newNativeId('frm');
  const builtAssets: AssetImportBuild[] = [];
  const sources = new Map<string, NativeBinarySource>();
  if (files.mesh !== null) {
    builtAssets.push(await buildAssetImport('mesh', files.mesh, null, {
      translation: [-1.5, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1,
    }));
  }
  if (files.gs !== null) {
    builtAssets.push(await buildAssetImport('gs', files.gs, files.proxy, {
      translation: [1.5, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1,
    }));
  }
  for (const built of builtAssets) for (const [id, source] of built.sources) sources.set(id, source);
  const meshAssetId = builtAssets.find((built) => built.imported.representations.some((entry) => entry.role === 'meshPrimary'))?.imported.asset.id ?? null;
  const gsAssetId = builtAssets.find((built) => built.imported.representations.some((entry) => entry.role === 'gsPrimary'))?.imported.asset.id ?? null;
  const displayMode: NativeDisplayMode = meshAssetId !== null && gsAssetId !== null ? 'mixed' : gsAssetId !== null ? 'gs-only' : 'mesh-only';
  return {
    draft: {
      project: {
        id: projectId,
        title: title.trim() === '' ? '新しいプロジェクト' : title.trim().slice(0, 160),
        frame: { id: projectFrameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } },
      },
      assets: builtAssets.map((built) => built.imported.asset),
      assetBindingRevisions: builtAssets.map((built) => built.imported.binding),
      assetRevisions: builtAssets.map((built) => built.imported.revision),
      representations: builtAssets.flatMap((built) => built.imported.representations),
      presentation: { displayMode, captionTargetAssetId: gsAssetId ?? meshAssetId, hiddenAssetIds: [] },
      captions: [],
    },
    sources,
  };
}

function selectedFile(input: HTMLInputElement): File | null {
  return input.files?.[0] ?? null;
}

function setButtonDisabled(button: HTMLButtonElement, disabled: boolean): void {
  button.disabled = disabled;
}

type NativeSavePicker = (options: {
  readonly suggestedName: string;
  readonly types: readonly [{
    readonly description: string;
    readonly accept: Readonly<Record<string, readonly string[]>>;
  }];
}) => Promise<FileSystemFileHandle>;

function requestNativeBackupDestination(suggestedName: string): Promise<FileSystemFileHandle | null> {
  const picker = (window as typeof window & { showSaveFilePicker?: NativeSavePicker }).showSaveFilePicker;
  return picker === undefined
    ? Promise.resolve(null)
    : picker.call(window, {
        suggestedName,
        types: [{ description: 'LociViewプロジェクトのバックアップ', accept: { 'application/zip': ['.lociview'] } }],
      });
}

function nativeBackupFileName(title: string): string {
  const safe = title
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  return `${safe === '' ? 'LociView-project' : safe}.lociview`;
}

function nativeBackupStagePath(projectId: string, snapshotId: string): string {
  return `native-backup-staging/${projectId}/${snapshotId}.lociview`;
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '操作を中止しました。未完成のバックアップやプロジェクトは保存されていません。';
  return error instanceof Error ? error.message : String(error);
}

export async function bootNativeGsApp(root: HTMLElement): Promise<void> {
  clear(root);
  root.className = 'ng-app';
  root.append(el('main', { class: 'ng-home' }, el('p', {}, 'プロジェクトの保存領域を準備しています…')));
  if (!(await OpfsFS.isAvailable())) {
    clear(root);
    root.append(el('main', { class: 'ng-home' }, el('p', { class: 'ng-error' }, 'このブラウザではプロジェクトを端末内へ保存できません。別の対応ブラウザをお試しください。')));
    return;
  }
  const fs: WorkspaceFS = await OpfsFS.open();
  try {
    await navigator.storage.persist?.();
  } catch {
    // Best effort. Publication still remains marker-last and fail closed.
  }
  const coordinator = ProjectMutationCoordinator.browser(navigator.locks ?? null);
  const pwaRegistration = registerPwa({ onUpdate: () => undefined });
  let activeViewer: NativeGsViewer | null = null;
  let activeSession: ProjectMutationSession | null = null;
  let unsubscribeAccess: (() => void) | null = null;
  let transitionInFlight = false;
  let activeDownloadUrl: string | null = null;
  let homeNotice: string | null = null;

  const closeActive = (): void => {
    unsubscribeAccess?.();
    unsubscribeAccess = null;
    activeViewer?.dispose();
    activeViewer = null;
    activeSession?.release();
    activeSession = null;
    if (activeDownloadUrl !== null) {
      URL.revokeObjectURL(activeDownloadUrl);
      activeDownloadUrl = null;
    }
  };

  const renderHome = async (): Promise<void> => {
    closeActive();
    clear(root);
    const status = el('p', { class: 'ng-note' }, 'GSをオフラインで利用できるか確認しています…');
    const offlineDetail = el('p', { class: 'ng-note' });
    const prepare = el('button', { class: 'primary' }, 'GSをオフラインで使えるようにする');
    const title = el('input', { type: 'text', value: '新しいプロジェクト', maxlength: '160' });
    const mesh = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const gs = el('input', { type: 'file', accept: '.ply,application/octet-stream' });
    const proxy = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const createStatus = el('p', { class: 'ng-status' });
    const createDetail = el('p', { class: 'ng-note' });
    const create = el('button', { class: 'primary' }, 'プロジェクトを作成');
    const projectList = el('div', { class: 'ng-list' });
    // iOS Files may classify a custom .lociview extension as an unknown UTI and
    // hide it when an accept filter is present. Selection is only a UI hint;
    // the strict package/version/path/size/hash checks below are authoritative.
    const restoreInput = el('input', { type: 'file' });
    const restore = el('button', { class: 'primary' }, 'バックアップから復元');
    const cancelPortable = el('button', { disabled: 'true' }, '処理を中止');
    const portableStatus = el('p', { class: 'ng-status' }, homeNotice ?? '');
    const portableDetail = el('p', { class: 'ng-note' });
    const portableResult = el('div', { class: 'ng-row' });
    let portableAbort: AbortController | null = null;
    homeNotice = null;

    const setPortableBusy = (busy: boolean): void => {
      restore.disabled = busy;
      cancelPortable.disabled = !busy;
    };
    cancelPortable.addEventListener('click', () => {
      portableAbort?.abort(new DOMException('User cancelled portable backup operation', 'AbortError'));
    });

    const refreshOffline = async (): Promise<void> => {
      const ready = await isNativeGsOfflineReady(await pwaRegistration);
      status.className = ready ? 'ng-note ng-ok' : 'ng-note ng-warn';
      status.textContent = ready
        ? 'この端末ではGSをオフラインで利用できます。'
        : import.meta.env.DEV
          ? '開発用画面ではオフライン保存の完了確認は行いません。'
          : 'オンラインのうちに準備すると、GSをオフラインでも表示できます。';
      offlineDetail.textContent = ready ? 'オフライン保存を確認済みです。' : '';
    };
    prepare.addEventListener('click', () => {
      setButtonDisabled(prepare, true);
      status.textContent = 'GS表示機能をこの端末へ保存し、確認しています…';
      void pwaRegistration.then((registration) => prepareNativeGsOffline(registration)).then((result) => {
        status.textContent = result.offlineReady
          ? 'GSをオフラインで利用する準備ができました。'
          : '準備を完了できませんでした。オンラインでページを再読み込みしてから、もう一度お試しください。';
        offlineDetail.textContent = result.detail;
        status.className = result.offlineReady ? 'ng-note ng-ok' : 'ng-note ng-warn';
      }).catch((error: unknown) => {
        status.textContent = 'GSのオフライン準備を完了できませんでした。詳しい情報を確認してください。';
        offlineDetail.textContent = error instanceof Error ? error.message : String(error);
        status.className = 'ng-error';
      }).finally(() => setButtonDisabled(prepare, false));
    });

    create.addEventListener('click', () => {
      if (transitionInFlight) return;
      transitionInFlight = true;
      setButtonDisabled(create, true);
      createStatus.className = 'ng-status';
      createStatus.textContent = '選んだファイルを確認しています…';
      createDetail.textContent = '';
      void (async () => {
        const built = await buildDraft(title.value, {
          mesh: selectedFile(mesh),
          gs: selectedFile(gs),
          proxy: selectedFile(proxy),
        });
        const required = [...built.sources.values()].reduce((sum, source) => sum + source.size, 0);
        const estimate = await navigator.storage.estimate?.();
        if (
          estimate?.quota !== undefined && estimate.usage !== undefined &&
          Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
          estimate.quota - estimate.usage < required
        ) {
          throw new Error(`保存容量が不足しています（必要 ${fmtBytes(required)}）。プロジェクトは作成されていません。`);
        }
        await assertNativeProjectDoesNotMixV1(fs, built.draft.project.id);
        const session = await coordinator.tryAcquire(fs, nativeProjectRoot(built.draft.project.id), built.draft.project.id);
        if (!session.holdsWriteLock) throw new Error(session.accessDetail);
        session.activateNewProject();
        try {
          const snapshot = await createNativeProjectV1(session.workspace, built.draft, built.sources, (message) => {
            createStatus.textContent = 'モデルとプロジェクトをこの端末へ保存しています…';
            createDetail.textContent = message;
          });
          activeSession = session;
          await renderProject(snapshot, session);
        } catch (error) {
          if (activeSession === session) closeActive();
          else session.release();
          throw error;
        }
      })().catch((error: unknown) => {
        createStatus.className = 'ng-error';
        createStatus.textContent = 'プロジェクトを作成できませんでした。詳しい情報を確認してください。';
        createDetail.textContent = error instanceof Error ? error.message : String(error);
      }).finally(() => {
        transitionInFlight = false;
        setButtonDisabled(create, false);
      });
    });

    restore.addEventListener('click', () => {
      if (transitionInFlight) return;
      const packageFile = selectedFile(restoreInput);
      if (packageFile === null) {
        portableStatus.className = 'ng-error';
        portableStatus.textContent = '復元するバックアップファイルを選択してください。';
        return;
      }
      transitionInFlight = true;
      portableAbort = new AbortController();
      setPortableBusy(true);
      clear(portableResult);
      portableStatus.className = 'ng-status';
      portableStatus.textContent = 'バックアップファイルを確認しています…';
      portableDetail.textContent = '';
      void (async () => {
        const signal = portableAbort!.signal;
        const inspection = await inspectNativePortablePackageV1(packageFile, signal);
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
        const session = await coordinator.tryAcquire(fs, nativeProjectRoot(projectId), projectId);
        if (!session.holdsWriteLock) {
          const detail = session.accessDetail;
          session.release();
          throw new Error(detail);
        }
        session.activateNewProject();
        const unsubscribeRestore = session.subscribeAccess((state) => {
          if (state !== 'editable') portableAbort?.abort(new Error(session.accessDetail));
        });
        try {
          const restored = await restoreNativePortablePackageV1(session.workspace, fs, packageFile, {
            signal,
            onStatus(message) {
              portableStatus.textContent = 'バックアップからプロジェクトを復元しています…';
              portableDetail.textContent = message;
            },
          });
          homeNotice = `「${restored.snapshot.project.title}」をこの端末へ復元しました。`;
        } finally {
          unsubscribeRestore();
          session.release();
        }
        await renderHome();
      })().catch((error: unknown) => {
        portableStatus.className = 'ng-error';
        portableStatus.textContent = 'バックアップを復元できませんでした。別のファイルを選ぶか、詳しい情報を確認してください。';
        portableDetail.textContent = errorMessage(error);
      }).finally(() => {
        portableAbort = null;
        transitionInFlight = false;
        setPortableBusy(false);
      });
    });

    const summaries = await listNativeProjectsV1(fs);
    if (summaries.length === 0) projectList.append(el('p', { class: 'ng-note' }, 'この端末に保存されたプロジェクトはありません。'));
    for (const summary of summaries) {
      const view = el('button', {}, '閲覧のみで開く');
      const edit = el('button', { class: 'primary' }, '編集して開く');
      const backup = el('button', {}, 'バックアップを書き出す');
      const remove = el('button', {}, 'この端末から削除');
      view.addEventListener('click', () => void openProject(summary.projectId, 'view'));
      edit.addEventListener('click', () => void openProject(summary.projectId, 'edit'));
      backup.addEventListener('click', () => {
        if (transitionInFlight) return;
        if (portableResult.childElementCount > 0) {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = '先に作成済みのバックアップをファイルへ保存し、「この端末の一時ファイルを削除」で片付けてください。';
          return;
        }
        const suggestedName = nativeBackupFileName(summary.title);
        let destinationHandle: Promise<FileSystemFileHandle | null>;
        try {
          // Calling the picker inside the user gesture is required by browsers.
          destinationHandle = requestNativeBackupDestination(suggestedName);
        } catch (error) {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = 'バックアップの保存先を開けませんでした。詳しい情報を確認してください。';
          portableDetail.textContent = errorMessage(error);
          return;
        }
        transitionInFlight = true;
        portableAbort = new AbortController();
        setPortableBusy(true);
        clear(portableResult);
        portableStatus.className = 'ng-status';
        portableStatus.textContent = '保存先を確認しています…';
        portableDetail.textContent = '';
        void (async () => {
          const signal = portableAbort!.signal;
          const handle = await destinationHandle;
          if (signal.aborted) throw signal.reason;
          const session = await coordinator.tryAcquire(fs, nativeProjectRoot(summary.projectId), summary.projectId);
          if (!session.holdsWriteLock) {
            const detail = session.accessDetail;
            session.release();
            throw new Error(detail);
          }
          let stagedPath: string | null = null;
          let stagedWrite: Promise<void> | null = null;
          let unsubscribeExport: (() => void) | null = null;
          let destination: WritableStream<Uint8Array> | null = null;
          try {
            const durable = await openNativeProjectV1(session.workspace, summary.projectId);
            session.activateAfterDurableReload();
            unsubscribeExport = session.subscribeAccess((state) => {
              if (state !== 'editable') portableAbort?.abort(new Error(session.accessDetail));
            });
            if (handle !== null) {
              portableStatus.textContent = '選択したファイルへバックアップを書き出しています…';
              const writable = await handle.createWritable();
              destination = writable as unknown as WritableStream<Uint8Array>;
            } else {
              const representationBytes = durable.snapshot.representations.reduce(
                (sum, representation) => sum + representation.blob.byteLength,
                0,
              );
              const estimate = await navigator.storage.estimate?.();
              const required = representationBytes + 32 * 1024 * 1024;
              if (
                estimate?.quota !== undefined && estimate.usage !== undefined &&
                Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
                estimate.quota - estimate.usage < required
              ) {
                throw new Error(`ダウンロード準備用の保存容量が不足しています（モデル ${fmtBytes(representationBytes)}）。`);
              }
              stagedPath = nativeBackupStagePath(summary.projectId, durable.snapshot.snapshotId);
              await fs.remove(stagedPath).catch(() => {});
              const bridge = new TransformStream<Uint8Array, Uint8Array>();
              stagedWrite = fs.writeStream(stagedPath, bridge.readable);
              void stagedWrite.catch(() => {});
              destination = bridge.writable;
              portableStatus.textContent = 'この端末でバックアップファイルを準備しています…';
            }
            const exported = await exportNativePortablePackageV1(session.workspace, summary.projectId, destination, {
              signal,
              onStatus(message) {
                portableStatus.textContent = 'バックアップを書き出しています…';
                portableDetail.textContent = message;
              },
            });
            await stagedWrite;
            let completedFile: Blob;
            if (handle !== null) {
              completedFile = await handle.getFile();
            } else {
              const staged = stagedPath === null ? null : await fs.readStream(stagedPath);
              if (staged === null || staged.blob === undefined) {
                throw new Error('確認済みのバックアップをダウンロードへ渡せません。');
              }
              completedFile = await staged.blob();
            }
            portableStatus.textContent = '書き出したバックアップを確認しています…';
            const readBack = await digestNativeStream(completedFile.stream(), signal);
            if (
              readBack.byteLength !== exported.metrics.packageByteLength ||
              readBack.sha256 !== exported.metrics.packageSha256
            ) {
              throw new Error('完成 .lociview fileのsize／SHA-256 read-backが一致しません。');
            }
            if (handle === null) {
              if (activeDownloadUrl !== null) URL.revokeObjectURL(activeDownloadUrl);
              activeDownloadUrl = URL.createObjectURL(completedFile);
              const download = el('a', { href: activeDownloadUrl, download: suggestedName }, 'バックアップファイルを保存');
              download.addEventListener('click', () => {
                portableStatus.textContent = 'ダウンロードを開始しました。端末のファイル／ダウンロード先で保存完了を確認してください。';
              });
              const discard = el('button', {}, 'この端末の一時ファイルを削除');
              discard.addEventListener('click', () => {
                if (transitionInFlight || stagedPath === null || !window.confirm('ファイル／ダウンロード先への保存完了を確認しましたか？ この端末の一時ファイルを削除します。')) return;
                transitionInFlight = true;
                void fs.remove(stagedPath).then(() => {
                  if (activeDownloadUrl !== null) URL.revokeObjectURL(activeDownloadUrl);
                  activeDownloadUrl = null;
                  clear(portableResult);
                  portableStatus.textContent = 'この端末の一時ファイルを削除しました。保存先のバックアップは変更していません。';
                }).catch((error: unknown) => {
                  portableStatus.className = 'ng-error';
                  portableStatus.textContent = 'この端末の一時ファイルを削除できませんでした。詳しい情報を確認してください。';
                  portableDetail.textContent = errorMessage(error);
                }).finally(() => { transitionInFlight = false; });
              });
              portableResult.append(download, discard);
            }
            const heap = exported.metrics.jsHeapPeakBytes === null
              ? 'heap値はこのbrowserでは取得不可'
              : `観測heap peak ${fmtBytes(exported.metrics.jsHeapPeakBytes)}`;
            portableStatus.className = 'ng-status ng-ok';
            portableStatus.textContent = handle === null
              ? 'バックアップの確認が完了しました。上のリンクからファイルを保存してください。'
              : 'バックアップを保存しました。';
            portableDetail.textContent = `package ${fmtBytes(exported.metrics.packageByteLength)}、最大chunk ${fmtBytes(exported.metrics.maxApplicationChunkBytes)}、${heap}`;
          } catch (error) {
            await destination?.abort(error).catch(() => {});
            await stagedWrite?.catch(() => {});
            if (stagedPath !== null) await fs.remove(stagedPath).catch(() => {});
            throw error;
          } finally {
            unsubscribeExport?.();
            session.release();
          }
        })().catch((error: unknown) => {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = 'バックアップを作成できませんでした。元のプロジェクトは変更されていません。詳しい情報を確認してください。';
          portableDetail.textContent = errorMessage(error);
        }).finally(() => {
          portableAbort = null;
          transitionInFlight = false;
          setPortableBusy(false);
        });
      });
      remove.addEventListener('click', () => {
        if (transitionInFlight || !window.confirm(`「${summary.title}」をこの端末から削除します。必要な場合は先にバックアップを保存してください。`)) return;
        transitionInFlight = true;
        portableStatus.className = 'ng-status';
        portableStatus.textContent = '削除前に最新の保存状態を確認しています…';
        portableDetail.textContent = '';
        void (async () => {
          const session = await coordinator.tryAcquire(fs, nativeProjectRoot(summary.projectId), summary.projectId);
          if (!session.holdsWriteLock) {
            const detail = session.accessDetail;
            session.release();
            throw new Error(detail);
          }
          try {
            const durable = await openNativeProjectV1(session.workspace, summary.projectId);
            if (
              durable.snapshot.snapshotId !== summary.snapshotId ||
              durable.snapshot.generation !== summary.generation
            ) {
              throw new Error('確認後にプロジェクトが更新されました。最新状態を再表示してから、もう一度削除を確認してください。');
            }
            session.activateAfterDurableReload();
            await deleteNativeProjectV1(session.workspace, summary.projectId, summary);
            homeNotice = `「${summary.title}」をこの端末から削除しました。保存済みのバックアップから復元できます。`;
          } finally {
            session.release();
          }
          await renderHome();
        })().catch((error: unknown) => {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = 'この端末からプロジェクトを削除できませんでした。詳しい情報を確認してください。';
          portableDetail.textContent = errorMessage(error);
        }).finally(() => { transitionInFlight = false; });
      });
      projectList.append(el('div', { class: 'ng-project-row' },
        el('strong', {}, summary.title),
        view,
        edit,
        backup,
        remove,
      ));
    }

    root.append(el('main', { class: 'ng-home' },
      el('header', { class: 'ng-head' },
        el('div', {}, el('h1', {}, 'LociView プロジェクト'), el('p', { class: 'ng-note' }, 'この端末で3Dモデルとキャプションをオフライン利用できます。')),
        el('a', { href: import.meta.env.BASE_URL }, '従来形式のプロジェクト画面'),
      ),
      el('section', { class: 'ng-card' },
        el('h2', {}, 'この端末のプロジェクト'),
        projectList,
        el('h3', {}, 'バックアップから復元'),
        el('p', { class: 'ng-note' }, 'LociViewのバックアップファイルを選ぶと、モデルとキャプションをこの端末へ復元します。'),
        el('label', { class: 'ng-field' }, el('span', {}, 'バックアップファイル'), restoreInput),
        el('p', { class: 'ng-note' }, 'iPhoneを含め、ファイル選択後に内容を厳密に確認します。'),
        el('div', { class: 'ng-row' }, restore, cancelPortable),
        portableStatus,
        portableResult,
        el('details', {}, el('summary', {}, '詳しい情報'), portableDetail),
      ),
      el('section', { class: 'ng-card' },
        el('h2', {}, '新しいプロジェクトを作成'),
        el('p', { class: 'ng-note' }, '3DモデルとGaussian Splattingは別々のモデルとして読み込み、あとから位置や表示を調整できます。どちらか一方だけでも作成できます。'),
        el('label', { class: 'ng-field' }, el('span', {}, 'プロジェクト名'), title),
        el('div', { class: 'ng-grid' },
          el('label', { class: 'ng-field' }, el('span', {}, '3Dモデル（任意）'), mesh),
          el('label', { class: 'ng-field' }, el('span', {}, 'Gaussian Splatting（PLY、任意）'), gs),
          el('label', { class: 'ng-field' }, el('span', {}, 'GSのキャプション配置用補助モデル（任意）'), proxy),
        ),
        create,
        createStatus,
        el('details', {}, el('summary', {}, '詳しい情報'), createDetail),
      ),
      el('section', { class: 'ng-card' },
        el('h2', {}, 'GSをオフラインで使う準備'),
        status,
        prepare,
        el('details', {}, el('summary', {}, '詳しい情報'), offlineDetail),
      ),
    ));
    await refreshOffline();
  };

  const openProject = async (projectId: string, mode: 'view' | 'edit'): Promise<void> => {
    if (transitionInFlight) return;
    transitionInFlight = true;
    closeActive();
    let openingSession: ProjectMutationSession | null = null;
    try {
      await assertNativeProjectDoesNotMixV1(fs, projectId);
      const session = mode === 'view'
        ? coordinator.openView(fs, nativeProjectRoot(projectId), projectId)
        : await coordinator.tryAcquire(fs, nativeProjectRoot(projectId), projectId);
      openingSession = session;
      const opened = await openNativeProjectV1(session.workspace, projectId);
      if (mode === 'edit' && session.holdsWriteLock) session.activateAfterDurableReload();
      activeSession = session;
      await renderProject(opened.snapshot, session);
    } catch (error) {
      if (activeSession === openingSession) closeActive();
      else openingSession?.release();
      clear(root);
      root.append(el('main', { class: 'ng-home' },
        el('p', { class: 'ng-error' }, 'プロジェクトを開けませんでした。保存状態または編集状態を確認してください。'),
        el('details', {},
          el('summary', {}, '詳しい情報'),
          el('p', { class: 'ng-note' }, error instanceof Error ? error.message : String(error)),
        ),
        el('button', { onclick: () => void renderHome() }, '一覧へ戻る'),
      ));
    } finally {
      transitionInFlight = false;
    }
  };

  const renderProject = async (initial: NativeProjectSnapshotV1, session: ProjectMutationSession): Promise<void> => {
    clear(root);
    let durable = initial;
    let working = initial;
    let saving = false;
    let dirty = false;
    let selectedCaptionId = initial.captions[0]?.id ?? null;
    let captionMoveActive = false;
    let creatingCaption = false;
    let selectedSavedViewId = initial.savedViews?.[0]?.id ?? null;
    const canvas = el('canvas', { 'aria-label': '3DモデルとGaussian Splattingのプロジェクト' });
    const accessBadge = el('span', { class: 'ng-badge' });
    const visibilityBadge = el('span', { class: 'ng-badge' });
    const runtimeStatus = el('p', { class: 'ng-status' }, 'モデルを読み込んでいます…');
    const diagnostics = el('ul', { class: 'ng-diagnostics' });
    const display = el('select');
    display.append(el('option', { value: '' }, '一括表示を選択'));
    for (const [value, label] of [['mixed', 'すべてのモデル'], ['gs-only', 'Gaussian Splattingのみ'], ['mesh-only', '3Dモデルのみ']] as const) {
      display.append(el('option', { value }, label));
    }
    display.value = '';
    const visibilityList = el('div', { class: 'ng-list' });
    const visibilityInputs = new Map<string, HTMLInputElement>();
    const target = el('select');
    const save = el('button', { class: 'primary' }, 'プロジェクトを保存');
    const unload = el('button', {}, 'GSを解放');
    const close = el('button', {}, '閉じる');
    const addKind = el('select');
    addKind.append(el('option', { value: 'mesh' }, '3Dモデル'), el('option', { value: 'gs' }, 'Gaussian Splatting'));
    const addSourceLabel = el('span', {}, '3Dモデルファイル');
    const addSource = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const addProxy = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply', disabled: 'true' });
    const addAsset = el('button', { class: 'primary' }, 'モデルを追加して保存');
    const replaceAsset = el('select');
    const replaceKind = el('select');
    replaceKind.append(el('option', { value: 'mesh' }, '3Dモデル'), el('option', { value: 'gs' }, 'Gaussian Splatting'));
    const replaceSourceLabel = el('span', {}, '新しい3Dモデルファイル');
    const replaceSource = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const replaceProxy = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply', disabled: 'true' });
    const replaceButton = el('button', { class: 'primary' }, '選択したモデルを差し替えて保存');
    const transformAsset = el('select');
    const translationInputs = [0, 1, 2].map(() => el('input', { type: 'number', step: '0.01' }));
    const rotationInputs = [0, 1, 2].map(() => el('input', { type: 'number', step: '1' }));
    const scaleInput = el('input', { type: 'number', step: '0.01', min: '0.000001' });
    const applyTransformButton = el('button', {}, '位置・回転・スケールを適用');
    let assetGizmoMode: NativeAssetGizmoMode = 'translate';
    const assetGizmoButtons = new Map<NativeAssetGizmoMode, HTMLButtonElement>([
      ['translate', el('button', { 'aria-pressed': 'true' }, '移動')],
      ['rotate', el('button', { 'aria-pressed': 'false' }, '回転')],
      ['scale', el('button', { 'aria-pressed': 'false' }, '均一スケール')],
    ]);
    const captionList = el('div', { class: 'ng-list ng-caption-list', 'aria-label': 'キャプション一覧' });
    const newCaption = el('button', { class: 'primary' }, '＋ 新しいキャプション');
    const captionTitle = el('input', { type: 'text', maxlength: '160' });
    const captionBody = el('textarea');
    const captionGuide = el('p', { class: 'ng-note' });
    const captionReview = el('p', { class: 'ng-note' });
    const moveCaption = el('button', { 'aria-pressed': 'false' }, 'ピンを移動');
    const repositionCaption = el('button', {}, '表面へ置き直す');
    const captionSection = el('section', { class: 'ng-card ng-caption-card' });
    const savedViewSelect = el('select', { 'aria-label': '保存済みビュー' });
    const savedViewName = el('input', { type: 'text', maxlength: '160', value: '' });
    const captureSavedView = el('button', { class: 'primary' }, '現在のビューを保存');
    const overwriteSavedView = el('button', {}, '選択中を更新');
    const applySavedView = el('button', {}, '表示');
    const deleteSavedView = el('button', {}, '削除');
    const orthographic = el('input', { type: 'checkbox' });
    const backgroundColor = el('input', { type: 'color', value: '#101725', 'aria-label': '背景色' });
    const fitView = el('button', {}, '全体表示');
    const axes = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
    const axisButtons = new Map(axes.map((axis) => [axis, el('button', {}, axis.toUpperCase())]));
    const savedViewSection = el('section', { class: 'ng-card' });

    const rolesByAsset = new Map(working.assets.map((asset) => [
      asset.id,
      activeNativeRepresentationsV1(working, asset.id).map((representation) => representation.role),
    ]));
    for (const asset of working.assets) {
      const roles = rolesByAsset.get(asset.id) ?? [];
      const role = roles.includes('gsPrimary') ? 'Gaussian Splatting' : '3Dモデル';
      target.append(el('option', { value: asset.id }, `${asset.label} (${role})`));
      transformAsset.append(el('option', { value: asset.id }, `${asset.label} (${role})`));
      replaceAsset.append(el('option', { value: asset.id }, `${asset.label} (${role})`));
      const checkbox = el('input', { type: 'checkbox', checked: isNativeAssetVisibleV1(working, asset.id) });
      visibilityInputs.set(asset.id, checkbox);
      visibilityList.append(el('label', { class: 'ng-project-row' }, checkbox, el('strong', {}, asset.label), el('span', { class: 'ng-note' }, role)));
    }
    target.value = working.presentation.captionTargetAssetId ?? '';

    const setDiagnostics = (messages: readonly string[]): void => {
      clear(diagnostics);
      for (const message of messages) diagnostics.append(el('li', {}, message));
    };
    const selectedCaption = () => selectedCaptionId === null
      ? undefined
      : working.captions.find((caption) => caption.id === selectedCaptionId);
    const savedViews = (): readonly NativeSavedViewV1[] => working.savedViews ?? [];
    const selectedSavedView = (): NativeSavedViewV1 | undefined => selectedSavedViewId === null
      ? undefined
      : savedViews().find((view) => view.id === selectedSavedViewId);
    const rebuildSavedViewOptions = (): void => {
      clear(savedViewSelect);
      if (savedViews().length === 0) {
        savedViewSelect.append(el('option', { value: '' }, '保存済みビューはありません'));
        selectedSavedViewId = null;
        savedViewName.value = '';
      } else {
        if (!savedViews().some((view) => view.id === selectedSavedViewId)) selectedSavedViewId = savedViews()[0]!.id;
        for (const view of savedViews()) savedViewSelect.append(el('option', { value: view.id }, view.name));
        savedViewSelect.value = selectedSavedViewId ?? '';
        savedViewName.value = selectedSavedView()?.name ?? '';
      }
    };
    const rebuildCaptionList = (): void => {
      clear(captionList);
      if (working.captions.length === 0) {
        captionList.append(el('p', { class: 'ng-note' }, 'キャプションはまだありません。'));
        return;
      }
      for (const caption of working.captions) {
        const owner = working.assets.find((asset) => asset.id === caption.anchor.assetId);
        const review = nativeCaptionNeedsReviewV1(working, caption) ? '［要再配置］ ' : '';
        const button = el(
          'button',
          {
            class: 'ng-caption-row',
            'aria-current': String(caption.id === selectedCaptionId),
          },
          el('strong', {}, `${review}${caption.title || '（無題）'}`),
          el('span', { class: 'ng-note' }, owner?.label ?? '所属モデル不明'),
        );
        button.addEventListener('click', () => {
          creatingCaption = false;
          selectedCaptionId = caption.id;
          captionMoveActive = false;
          activeViewer?.selectCaption(caption.id);
          rebuildCaptionList();
          populateCaptionFields();
          updateAccess();
          runtimeStatus.className = 'ng-status';
          runtimeStatus.textContent = `キャプションを選択しました：${caption.title || '（無題）'}`;
        });
        captionList.append(button);
      }
    };
    const populateCaptionFields = (): void => {
      const caption = selectedCaption();
      captionTitle.value = caption?.title ?? '';
      captionBody.value = caption?.body ?? '';
      const needsReview = caption !== undefined && nativeCaptionNeedsReviewV1(working, caption);
      captionGuide.textContent = caption === undefined
        ? creatingCaption
          ? '配置先モデルを選び、PCは画面上でShift＋クリック、iPhoneは長押ししてください。配置が決まるまでデータは作成されません。'
          : '「＋ 新しいキャプション」を押すか、一覧・画面上のマーカーから既存のキャプションを選んでください。'
        : 'タイトルと本文を編集できます。位置を変えるときだけ「ピンを移動」を使います。';
      captionReview.className = needsReview ? 'ng-error' : 'ng-note';
      captionReview.textContent = caption === undefined
        ? ''
        : needsReview
          ? 'このキャプションはモデル差し替え前の表面位置です。位置は保持されていますが、現在のモデル上で再配置すると確認済みに戻ります。'
          : '現在のモデル表面に対応しています。';
    };
    const commitSelectedCaption = (caption: NativeProjectSnapshotV1['captions'][number]): boolean => {
      try {
        const previous = selectedCaption();
        const previousNeedsReview = previous === undefined ? false : nativeCaptionNeedsReviewV1(working, previous);
        const wasNew = selectedCaptionId === null;
        working = updateSelectedNativeCaptionV1(working, selectedCaptionId, caption);
        selectedCaptionId ??= caption.id;
        const nextNeedsReview = nativeCaptionNeedsReviewV1(working, caption);
        if (wasNew || previous?.title !== caption.title || previousNeedsReview !== nextNeedsReview) rebuildCaptionList();
        populateCaptionFields();
        return true;
      } catch (error) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = error instanceof Error ? error.message : String(error);
        return false;
      }
    };
    const canMutateWorking = (): boolean => session.accessState === 'editable' && !saving;
    const syncVisibilityControls = (): void => {
      let visibleCount = 0;
      for (const asset of working.assets) {
        const visible = isNativeAssetVisibleV1(working, asset.id);
        visibilityInputs.get(asset.id)!.checked = visible;
        if (visible) visibleCount += 1;
      }
      visibilityBadge.textContent = `${visibleCount}/${working.assets.length}モデルを表示中`;
      display.value = '';
    };
    const updateAccess = (): void => {
      accessBadge.textContent = session.sessionMode === 'view'
        ? '閲覧のみ'
        : session.accessState === 'editable'
          ? '編集中'
          : session.accessState === 'lock-lost'
            ? '書き込み停止・閲覧のみ'
            : '編集できないため閲覧のみ';
      accessBadge.title = session.accessDetail;
      const editable = canMutateWorking();
      const caption = selectedCaption();
      const captionVisible = caption !== undefined && isNativeAssetVisibleV1(working, caption.anchor.assetId);
      const captionFieldsEditable = caption !== undefined && captionVisible;
      if (!editable && creatingCaption) {
        creatingCaption = false;
        populateCaptionFields();
      }
      if ((!editable || !captionVisible) && captionMoveActive) {
        captionMoveActive = false;
        activeViewer?.stopCaptionPositionEditing();
      }
      save.disabled = !editable || !dirty;
      applyTransformButton.disabled = !editable;
      for (const button of assetGizmoButtons.values()) button.disabled = !editable;
      captionTitle.disabled = !editable || !captionFieldsEditable;
      captionBody.disabled = !editable || !captionFieldsEditable;
      newCaption.disabled = !editable;
      newCaption.textContent = creatingCaption ? '新規配置をやめる' : '＋ 新しいキャプション';
      newCaption.setAttribute('aria-pressed', String(creatingCaption));
      moveCaption.disabled = !editable || caption === undefined || !captionVisible;
      moveCaption.textContent = captionMoveActive ? 'ピン移動を終了' : 'ピンを移動';
      moveCaption.setAttribute('aria-pressed', String(captionMoveActive));
      display.disabled = !editable;
      for (const checkbox of visibilityInputs.values()) checkbox.disabled = !editable;
      target.disabled = !editable;
      addKind.disabled = !editable;
      addSource.disabled = !editable;
      addProxy.disabled = !editable || addKind.value !== 'gs';
      addAsset.disabled = !editable;
      replaceAsset.disabled = !editable;
      replaceKind.disabled = !editable;
      replaceSource.disabled = !editable;
      replaceProxy.disabled = !editable || replaceKind.value !== 'gs';
      replaceButton.disabled = !editable;
      repositionCaption.disabled = !editable || caption === undefined || !captionVisible;
      captureSavedView.disabled = !editable;
      overwriteSavedView.disabled = !editable || selectedSavedView() === undefined;
      deleteSavedView.disabled = !editable || selectedSavedView() === undefined;
      applySavedView.disabled = saving || selectedSavedView() === undefined;
      savedViewSelect.disabled = saving || savedViews().length === 0;
      savedViewName.disabled = !editable;
      orthographic.disabled = saving;
      backgroundColor.disabled = saving;
      fitView.disabled = saving;
      for (const button of axisButtons.values()) button.disabled = saving;
      close.disabled = saving;
      activeViewer?.setEditingEnabled(editable);
    };
    const markDirty = (): void => {
      dirty = true;
      updateAccess();
      runtimeStatus.textContent = '未保存の変更があります。';
    };
    const bindingFor = (assetId: string): NativeAssetBindingRevisionV1 | null => {
      const asset = working.assets.find((entry) => entry.id === assetId);
      return working.assetBindingRevisions.find((entry) => entry.id === asset?.status.activeBindingId) ?? null;
    };
    const populateTransform = (): void => {
      const binding = bindingFor(transformAsset.value);
      if (binding === null) return;
      binding.assetToProject.translation.forEach((value, index) => { translationInputs[index]!.value = String(value); });
      const q = new THREE.Quaternion().fromArray(binding.assetToProject.rotationXYZW);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      [euler.x, euler.y, euler.z].forEach((value, index) => { rotationInputs[index]!.value = String(THREE.MathUtils.radToDeg(value)); });
      scaleInput.value = String(binding.assetToProject.uniformScale);
    };
    const commitWorkingAssetTransform = (assetId: string, transform: NativeSim3V1): boolean => {
      if (!canMutateWorking()) return false;
      const next = activateNativeManualAssetTransformV1(working, assetId, newNativeId('bnd'), transform);
      if (next === working) return false;
      working = next;
      transformAsset.value = assetId;
      populateTransform();
      return true;
    };

    captionSection.append(
      el('h2', {}, 'キャプション'),
      el('p', { class: 'ng-note' }, '新しく置くか、一覧や画面上のマーカーから既存のキャプションを選びます。'),
      newCaption,
      el('label', { class: 'ng-field' }, el('span', {}, '新しいキャプションの配置先'), target),
      captionGuide,
      captionList,
      el('label', { class: 'ng-field' }, el('span', {}, 'タイトル'), captionTitle),
      el('label', { class: 'ng-field' }, el('span', {}, '本文'), captionBody),
      captionReview,
      el('div', { class: 'ng-row' }, moveCaption, repositionCaption),
    );

    savedViewSection.append(
      el('h2', {}, 'ビュー'),
      el('p', { class: 'ng-note' }, '見やすい向き・投影方法・背景色を名前付きで保存できます。モデルの位置や表示状態は変更しません。'),
      el('div', { class: 'ng-grid' },
        el('label', { class: 'ng-field' }, el('span', {}, '保存済みビュー'), savedViewSelect),
        el('label', { class: 'ng-field' }, el('span', {}, '名前'), savedViewName),
      ),
      el('div', { class: 'ng-row' }, captureSavedView, overwriteSavedView, applySavedView, deleteSavedView),
      el('label', { class: 'ng-row' }, orthographic, el('span', {}, '平行投影')),
      el('div', { class: 'ng-axis-grid' }, ...axisButtons.values()),
      el('div', { class: 'ng-row' }, fitView, el('span', { class: 'ng-note' }, '背景'), backgroundColor),
    );

    root.append(el('main', { class: 'ng-view' },
      el('section', { class: 'ng-stage' }, canvas, el('div', { class: 'ng-stage-badges' }, accessBadge, visibilityBadge)),
      el('aside', { class: 'ng-panel' },
        el('div', {}, el('h1', {}, working.project.title), el('div', { class: 'ng-row ng-project-actions' }, save)),
        captionSection,
        savedViewSection,
        el('details', { class: 'ng-card' },
          el('summary', {}, 'モデルの表示設定'),
          el('label', { class: 'ng-field' }, el('span', {}, '一括表示'), display),
          el('span', { class: 'ng-note' }, 'モデルごとの表示／非表示'),
          visibilityList,
          el('p', { class: 'ng-note' }, '読み込んだ各モデルは、形式に関係なく個別に表示／非表示を切り替えられます。'),
        ),
        el('details', { class: 'ng-card' },
          el('summary', {}, 'モデルを追加'),
          el('div', { class: 'ng-grid' },
            el('label', { class: 'ng-field' }, el('span', {}, '描画形式'), addKind),
            el('label', { class: 'ng-field' }, addSourceLabel, addSource),
          ),
          el('label', { class: 'ng-field' }, el('span', {}, 'GSのキャプション配置用補助モデル（任意）'), addProxy),
          addAsset,
          el('p', { class: 'ng-note' }, '一回に一つのモデルを追加します。追加後に位置を調整できます。'),
        ),
        el('details', { class: 'ng-card' },
          el('summary', {}, 'モデルを差し替え'),
          el('label', { class: 'ng-field' }, el('span', {}, '差し替えるモデル'), replaceAsset),
          el('div', { class: 'ng-grid' },
            el('label', { class: 'ng-field' }, el('span', {}, '新しい描画形式'), replaceKind),
            el('label', { class: 'ng-field' }, replaceSourceLabel, replaceSource),
          ),
          el('label', { class: 'ng-field' }, el('span', {}, '新しいGSのキャプション配置用補助モデル（任意）'), replaceProxy),
          replaceButton,
          el('p', { class: 'ng-note' }, 'モデルの位置とキャプション本文は保ちます。表面が同じとは推測しないため、既存キャプションは必要に応じて再配置してください。'),
        ),
        el('details', { class: 'ng-card' },
          el('summary', {}, 'モデルの位置を調整'),
          el('label', { class: 'ng-field' }, el('span', {}, '調整するモデル'), transformAsset),
          el('span', { class: 'ng-note' }, 'ギズモ操作'),
          el('div', { class: 'ng-row ng-gizmo-modes' }, ...assetGizmoButtons.values()),
          el('span', { class: 'ng-note' }, '位置 X/Y/Z'), el('div', { class: 'ng-three' }, ...translationInputs),
          el('span', { class: 'ng-note' }, '回転 X/Y/Z（度）'), el('div', { class: 'ng-three' }, ...rotationInputs),
          el('label', { class: 'ng-field' }, el('span', {}, '均一スケール'), scaleInput),
          applyTransformButton,
          el('p', { class: 'ng-note' }, '元のモデルファイルは変更しません。'),
        ),
        el('details', { class: 'ng-card' },
          el('summary', {}, '詳細'),
          unload,
          diagnostics,
          el('div', { class: 'ng-row' }, close, el('button', { onclick: () => location.reload() }, '再読み込み')),
        ),
        runtimeStatus,
      ),
    ));

    const offlineReady = import.meta.env.DEV || await isNativeGsOfflineReady(await pwaRegistration);
    const viewer = new NativeGsViewer(canvas, working, {
      onCaptionCreationStarted() {
        if (!canMutateWorking()) return false;
        if (!creatingCaption) {
          runtimeStatus.className = 'ng-status';
          runtimeStatus.textContent = '先に「＋ 新しいキャプション」を押してください。';
          return false;
        }
        selectedCaptionId = null;
        captionMoveActive = false;
        rebuildCaptionList();
        populateCaptionFields();
        updateAccess();
        return true;
      },
      onCaptionChanged(caption) {
        if (!canMutateWorking()) {
          creatingCaption = false;
          rebuildCaptionList();
          populateCaptionFields();
          updateAccess();
          return false;
        }
        const wasNew = selectedCaptionId === null;
        const titleValue = captionTitle.value.trim();
        const next = { ...caption, title: titleValue === '' ? 'Caption' : titleValue, body: captionBody.value };
        if (!commitSelectedCaption(next)) {
          creatingCaption = false;
          rebuildCaptionList();
          populateCaptionFields();
          updateAccess();
          return false;
        }
        captionMoveActive = true;
        captionTitle.value = next.title;
        captionBody.value = next.body;
        markDirty();
        if (wasNew) {
          queueMicrotask(() => {
            captionSection.scrollIntoView({ block: 'nearest' });
            captionTitle.focus();
            captionTitle.select();
            runtimeStatus.textContent = 'キャプションを追加しました。タイトルと本文を編集し、プロジェクトを保存してください。';
          });
        }
        return true;
      },
      onCaptionSelected(captionId) {
        if (!working.captions.some((caption) => caption.id === captionId)) return;
        selectedCaptionId = captionId;
        if (!creatingCaption) captionMoveActive = false;
        creatingCaption = false;
        rebuildCaptionList();
        populateCaptionFields();
        updateAccess();
        runtimeStatus.textContent = `キャプションを選択しました：${selectedCaption()?.title ?? 'Caption'}`;
      },
      onAssetTransformCommitted(assetId, transform) {
        if (session.accessState !== 'editable' || !commitWorkingAssetTransform(assetId, transform)) return;
        viewer.setSnapshot(working);
        viewer.selectAlignmentAsset(assetId);
        markDirty();
      },
      onIssuesChanged: setDiagnostics,
      onProgress(message) { runtimeStatus.textContent = message; },
      onRuntimeError(message) { setDiagnostics([...viewer.getResolution().issues, message]); },
    });
    const syncCurrentViewControls = (): void => {
      orthographic.checked = viewer.isOrthographic();
      backgroundColor.value = backgroundHex(viewer.getBackground());
    };
    const captureViewRecord = (existing?: NativeSavedViewV1): NativeSavedViewV1 => {
      const id = existing?.id ?? newNativeId('view');
      const fallbackName = existing?.name ?? `ビュー ${savedViews().length + 1}`;
      return {
        id,
        name: savedViewName.value.trim() || fallbackName,
        orderKey: existing?.orderKey ?? id.slice('view_'.length),
        projectFrameId: working.project.frame.id,
        camera: viewer.getProjectCamera(),
        background: viewer.getBackground(),
      };
    };
    activeViewer = viewer;
    unsubscribeAccess = session.subscribeAccess(() => updateAccess());
    await viewer.load(
      (representationId) => readNativeRepresentationV1(fs, working.project.id, representationId),
      offlineReady,
    );
    syncVisibilityControls();
    runtimeStatus.textContent = offlineReady
      ? 'モデルを読み込みました。表示切替とキャプション編集を利用できます。'
      : 'GSのオフライン準備がないため、Gaussian Splattingは表示していません。';
    rebuildCaptionList();
    populateCaptionFields();
    viewer.selectCaption(selectedCaptionId);
    populateTransform();
    viewer.setAssetGizmoMode(assetGizmoMode);
    rebuildSavedViewOptions();
    syncCurrentViewControls();
    updateAccess();

    savedViewSelect.addEventListener('change', () => {
      selectedSavedViewId = savedViewSelect.value === '' ? null : savedViewSelect.value;
      savedViewName.value = selectedSavedView()?.name ?? '';
      updateAccess();
    });
    captureSavedView.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const view = captureViewRecord();
      working = { ...working, savedViews: [...savedViews(), view] };
      selectedSavedViewId = view.id;
      rebuildSavedViewOptions();
      markDirty();
      runtimeStatus.textContent = `現在のビューを「${view.name}」として保存対象に追加しました。`;
    });
    overwriteSavedView.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const existing = selectedSavedView();
      if (existing === undefined) return;
      const view = captureViewRecord(existing);
      working = {
        ...working,
        savedViews: savedViews().map((candidate) => candidate.id === view.id ? view : candidate),
      };
      rebuildSavedViewOptions();
      markDirty();
      runtimeStatus.textContent = `「${view.name}」を現在のビューで更新しました。`;
    });
    applySavedView.addEventListener('click', () => {
      const view = selectedSavedView();
      if (view === undefined) return;
      viewer.applyProjectCamera(view.camera);
      viewer.setBackground(view.background);
      syncCurrentViewControls();
      runtimeStatus.textContent = `「${view.name}」を表示しました。`;
    });
    deleteSavedView.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const view = selectedSavedView();
      if (view === undefined) return;
      working = { ...working, savedViews: savedViews().filter((candidate) => candidate.id !== view.id) };
      selectedSavedViewId = null;
      rebuildSavedViewOptions();
      markDirty();
      runtimeStatus.textContent = `「${view.name}」を保存対象から削除しました。`;
    });
    orthographic.addEventListener('change', () => {
      viewer.setOrthographic(orthographic.checked);
      syncCurrentViewControls();
    });
    backgroundColor.addEventListener('input', () => viewer.setBackground(backgroundFromHex(backgroundColor.value)));
    fitView.addEventListener('click', () => {
      viewer.fitCamera();
      syncCurrentViewControls();
    });
    for (const [axis, button] of axisButtons) {
      button.addEventListener('click', () => {
        viewer.viewAxis(axis);
        syncCurrentViewControls();
      });
    }

    addKind.addEventListener('change', () => {
      const isGs = addKind.value === 'gs';
      addSource.value = '';
      addProxy.value = '';
      addSource.accept = isGs ? '.ply,application/octet-stream' : '.glb,.gltf,.obj,.stl,.ply';
      addSourceLabel.textContent = isGs ? 'Gaussian Splatting（PLY）' : '3Dモデルファイル';
      updateAccess();
    });
    replaceKind.addEventListener('change', () => {
      const isGs = replaceKind.value === 'gs';
      replaceSource.value = '';
      replaceProxy.value = '';
      replaceSource.accept = isGs ? '.ply,application/octet-stream' : '.glb,.gltf,.obj,.stl,.ply';
      replaceSourceLabel.textContent = isGs ? '新しいGaussian Splatting（PLY）' : '新しい3Dモデルファイル';
      updateAccess();
    });
    addAsset.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const sourceFile = selectedFile(addSource);
      if (sourceFile === null) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '追加するモデルファイルを選択してください。';
        return;
      }
      saving = true;
      updateAccess();
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = '追加するモデルを確認しています…';
      void (async () => {
        const kind = addKind.value === 'gs' ? 'gs' : 'mesh';
        const built = await buildAssetImport(
          kind,
          sourceFile,
          kind === 'gs' ? selectedFile(addProxy) : null,
          { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 },
        );
        const required = [...built.sources.values()].reduce((sum, source) => sum + source.size, 0);
        const estimate = await navigator.storage.estimate?.();
        if (
          estimate?.quota !== undefined && estimate.usage !== undefined &&
          Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
          estimate.quota - estimate.usage < required
        ) {
          throw new Error(`保存容量が不足しています（必要 ${fmtBytes(required)}）。現在のプロジェクトは変更しません。`);
        }
        const saved = await addNativeAssetV1(
          session.workspace,
          working,
          built.imported,
          built.sources,
          (message) => { runtimeStatus.textContent = message; },
        );
        durable = saved;
        working = saved;
        dirty = false;
        unsubscribeAccess?.();
        unsubscribeAccess = null;
        viewer.dispose();
        if (activeViewer === viewer) activeViewer = null;
        saving = false;
        await renderProject(saved, session);
      })().catch((error: unknown) => {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = `モデルを追加できませんでした：${error instanceof Error ? error.message : String(error)}。最後に保存されたプロジェクトを維持しました。`;
      }).finally(() => {
        if (activeViewer === viewer) {
          saving = false;
          updateAccess();
        }
      });
    });
    replaceButton.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const existing = working.assets.find((asset) => asset.id === replaceAsset.value);
      const activeBinding = existing === undefined ? null : bindingFor(existing.id);
      const sourceFile = selectedFile(replaceSource);
      if (existing === undefined || activeBinding === null) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '差し替えるモデルの現在状態を確認できません。';
        return;
      }
      if (sourceFile === null) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '新しいモデルファイルを選択してください。';
        return;
      }
      if (!window.confirm(`「${existing.label}」の表示内容を差し替えます。位置と既存キャプションは保持し、表面対応は自動推測しません。続行しますか？`)) return;
      saving = true;
      updateAccess();
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = '新しいモデルを検査しています…';
      void (async () => {
        const kind = replaceKind.value === 'gs' ? 'gs' : 'mesh';
        const built = await buildAssetImport(
          kind,
          sourceFile,
          kind === 'gs' ? selectedFile(replaceProxy) : null,
          activeBinding.assetToProject,
          {
            assetId: existing.id,
            assetFrameId: existing.assetFrameId,
            label: existing.label,
            bindingMethod: activeBinding.method,
          },
        );
        const required = [...built.sources.values()].reduce((sum, source) => sum + source.size, 0);
        const estimate = await navigator.storage.estimate?.();
        if (
          estimate?.quota !== undefined && estimate.usage !== undefined &&
          Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
          estimate.quota - estimate.usage < required
        ) {
          throw new Error(`保存可能容量が不足しています（必要 ${fmtBytes(required)}）。現在のモデルは変更しません。`);
        }
        const saved = await replaceNativeAssetV1(
          session.workspace,
          working,
          built.imported,
          built.sources,
          (message) => { runtimeStatus.textContent = message; },
        );
        durable = saved;
        working = saved;
        dirty = false;
        unsubscribeAccess?.();
        unsubscribeAccess = null;
        viewer.dispose();
        if (activeViewer === viewer) activeViewer = null;
        saving = false;
        await renderProject(saved, session);
      })().catch((error: unknown) => {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = `モデルを差し替えられませんでした：${error instanceof Error ? error.message : String(error)}。現在の保存済みモデルを維持しました。`;
      }).finally(() => {
        if (activeViewer === viewer) {
          saving = false;
          updateAccess();
        }
      });
    });

    display.addEventListener('change', () => {
      if (!canMutateWorking()) return;
      const preset = display.value as NativeDisplayMode;
      if (preset !== 'mixed' && preset !== 'gs-only' && preset !== 'mesh-only') return;
      let next: NativeProjectSnapshotV1 = {
        ...working,
        presentation: { ...working.presentation, displayMode: preset },
      };
      for (const asset of working.assets) {
        const roles = rolesByAsset.get(asset.id) ?? [];
        const visible = preset === 'mixed' ||
          (preset === 'gs-only' && roles.includes('gsPrimary')) ||
          (preset === 'mesh-only' && roles.includes('meshPrimary'));
        next = setNativeAssetVisibilityV1(next, asset.id, visible);
      }
      working = next;
      viewer.setSnapshot(working);
      syncVisibilityControls();
      markDirty();
    });
    for (const [assetId, checkbox] of visibilityInputs) {
      checkbox.addEventListener('change', () => {
        if (!canMutateWorking()) {
          syncVisibilityControls();
          return;
        }
        working = setNativeAssetVisibilityV1(working, assetId, checkbox.checked);
        viewer.setSnapshot(working);
        syncVisibilityControls();
        markDirty();
      });
    }
    target.addEventListener('change', () => {
      if (!canMutateWorking()) return;
      working = { ...working, presentation: { ...working.presentation, captionTargetAssetId: target.value } };
      viewer.setSnapshot(working);
      markDirty();
    });
    newCaption.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      if (creatingCaption) {
        creatingCaption = false;
        selectedCaptionId = working.captions[0]?.id ?? null;
        viewer.selectCaption(selectedCaptionId);
        rebuildCaptionList();
        populateCaptionFields();
        updateAccess();
        runtimeStatus.className = 'ng-status';
        runtimeStatus.textContent = '新しいキャプションの配置をやめました。';
        return;
      }
      creatingCaption = true;
      captionMoveActive = false;
      selectedCaptionId = null;
      viewer.selectCaption(null);
      rebuildCaptionList();
      populateCaptionFields();
      updateAccess();
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = '配置先モデルを選び、PCは画面上でShift＋クリック、iPhoneは長押ししてください。';
    });
    moveCaption.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      creatingCaption = false;
      if (captionMoveActive) {
        viewer.stopCaptionPositionEditing();
        captionMoveActive = false;
        updateAccess();
        runtimeStatus.className = 'ng-status';
        runtimeStatus.textContent = 'ピンの移動を終了しました。';
        return;
      }
      if (!viewer.editCaptionPosition()) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '選択中のキャプションを移動できません。所属モデルの表示と編集状態を確認してください。';
        return;
      }
      captionMoveActive = true;
      updateAccess();
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = '黄色いピンのギズモをドラッグして位置を調整してください。';
    });
    repositionCaption.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const caption = selectedCaption();
      if (caption === undefined) return;
      const owner = working.assets.find((asset) => asset.id === caption.anchor.assetId);
      if (owner === undefined || !isNativeAssetVisibleV1(working, owner.id)) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '所属モデルが見つからないか非表示のため、表面へ置き直せません。キャプションの位置は変更していません。';
        return;
      }
      creatingCaption = false;
      captionMoveActive = false;
      viewer.stopCaptionPositionEditing();
      const previousTargetAssetId = working.presentation.captionTargetAssetId;
      const targetChanged = previousTargetAssetId !== owner.id;
      if (targetChanged) {
        working = { ...working, presentation: { ...working.presentation, captionTargetAssetId: owner.id } };
        target.value = owner.id;
        viewer.setSnapshot(working);
      }
      const interaction = viewer.getResolution().interaction;
      if (!interaction.enabled || interaction.targetAssetId !== owner.id) {
        if (targetChanged) {
          working = { ...working, presentation: { ...working.presentation, captionTargetAssetId: previousTargetAssetId } };
          target.value = previousTargetAssetId ?? '';
          viewer.setSnapshot(working);
        }
        updateAccess();
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '所属モデルの配置用表面を利用できないため、置き直しを開始できません。キャプションの位置は変更していません。';
        return;
      }
      if (!viewer.armCaptionReposition(caption.id)) {
        if (targetChanged) {
          working = { ...working, presentation: { ...working.presentation, captionTargetAssetId: previousTargetAssetId } };
          target.value = previousTargetAssetId ?? '';
          viewer.setSnapshot(working);
        }
        updateAccess();
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '選択中のキャプションを再配置できません。モデルの表示と編集状態を確認してください。';
        return;
      }
      if (targetChanged) markDirty();
      updateAccess();
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = `「${owner.label}」の表面で、PCはShift＋クリック、iPhoneは長押しして新しい位置を指定してください。`;
    });
    unload.addEventListener('click', () => {
      viewer.disposeGs();
      runtimeStatus.textContent = 'Gaussian Splattingをメモリから解放しました。もう一度表示するにはプロジェクトを開き直してください。';
    });
    transformAsset.addEventListener('change', () => {
      creatingCaption = false;
      captionMoveActive = false;
      populateTransform();
      runtimeStatus.textContent = viewer.selectAlignmentAsset(transformAsset.value)
        ? '選択したモデルの位置調整ギズモを表示しました。'
        : '選択したモデルは非表示のため、位置調整ギズモを表示できません。';
      updateAccess();
    });
    for (const [mode, button] of assetGizmoButtons) {
      button.addEventListener('click', () => {
        creatingCaption = false;
        captionMoveActive = false;
        assetGizmoMode = mode;
        for (const [candidate, candidateButton] of assetGizmoButtons) {
          candidateButton.setAttribute('aria-pressed', String(candidate === mode));
        }
        viewer.selectAlignmentAsset(transformAsset.value);
        viewer.setAssetGizmoMode(mode);
        updateAccess();
        runtimeStatus.textContent = `モデルの位置調整：${button.textContent}`;
      });
    }
    applyTransformButton.addEventListener('click', () => {
      try {
        const assetId = transformAsset.value;
        const euler = new THREE.Euler(
          THREE.MathUtils.degToRad(Number(rotationInputs[0]!.value)),
          THREE.MathUtils.degToRad(Number(rotationInputs[1]!.value)),
          THREE.MathUtils.degToRad(Number(rotationInputs[2]!.value)),
          'XYZ',
        );
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        const transform: NativeSim3V1 = normalizeNativeSim3({
          translation: translationInputs.map((input) => Number(input.value)) as [number, number, number],
          rotationXYZW: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
          uniformScale: Number(scaleInput.value),
        });
        if (!commitWorkingAssetTransform(assetId, transform)) return;
        viewer.setSnapshot(working);
        viewer.selectAlignmentAsset(assetId);
        markDirty();
      } catch (error) {
        runtimeStatus.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    captionTitle.addEventListener('input', () => {
      if (!canMutateWorking()) return;
      const caption = selectedCaption();
      if (caption === undefined) return;
      if (!commitSelectedCaption({ ...caption, title: captionTitle.value.trim() || 'Caption' })) return;
      viewer.setSnapshot(working);
      markDirty();
    });
    captionBody.addEventListener('input', () => {
      if (!canMutateWorking()) return;
      const caption = selectedCaption();
      if (caption === undefined) return;
      if (!commitSelectedCaption({ ...caption, body: captionBody.value })) return;
      viewer.setSnapshot(working);
      markDirty();
    });
    save.addEventListener('click', () => {
      if (saving || session.accessState !== 'editable') return;
      saving = true;
      updateAccess();
      runtimeStatus.textContent = 'プロジェクトを保存しています…';
      void saveNativeProjectV1(session.workspace, working).then((saved) => {
        durable = saved;
        working = saved;
        dirty = false;
        viewer.setSnapshot(saved);
        creatingCaption = false;
        captionMoveActive = false;
        viewer.selectCaption(selectedCaptionId);
        syncVisibilityControls();
        rebuildCaptionList();
        populateCaptionFields();
        rebuildSavedViewOptions();
        runtimeStatus.textContent = 'プロジェクトを保存しました。';
      }).catch((error: unknown) => {
        working = durable;
        selectedCaptionId = durable.captions.some((caption) => caption.id === selectedCaptionId)
          ? selectedCaptionId
          : durable.captions[0]?.id ?? null;
        viewer.setSnapshot(durable);
        creatingCaption = false;
        captionMoveActive = false;
        viewer.selectCaption(selectedCaptionId);
        syncVisibilityControls();
        rebuildCaptionList();
        selectedSavedViewId = durable.savedViews?.some((view) => view.id === selectedSavedViewId)
          ? selectedSavedViewId
          : durable.savedViews?.[0]?.id ?? null;
        rebuildSavedViewOptions();
        populateCaptionFields();
        dirty = false;
        runtimeStatus.textContent = `保存できませんでした：${error instanceof Error ? error.message : String(error)}。最後に保存された状態へ戻しました。`;
      }).finally(() => {
        saving = false;
        updateAccess();
      });
    });
    close.addEventListener('click', () => void renderHome());
  };

  await renderHome();
}
