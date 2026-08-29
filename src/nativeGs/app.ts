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
import { activeNativeRepresentationsV1, isNativeAssetVisibleV1 } from './resolver';
import {
  addNativeAssetV1,
  assertNativeProjectDoesNotMixV1,
  createNativeProjectV1,
  deleteNativeProjectV1,
  listNativeProjectsV1,
  nativeProjectRoot,
  openNativeProjectV1,
  readNativeRepresentationV1,
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
): Promise<AssetImportBuild> {
  if (kind === 'mesh' && proxy !== null) throw new Error('Interaction Proxyは対象GSと一緒に指定してください。');
  const assetId = newNativeId('ast');
  const assetFrameId = newNativeId('frm');
  const revisionId = newNativeId('rev');
  const bindingId = newNativeId('bnd');
  const primaryRepresentationId = newNativeId('rep');
  const primaryFamilyId = newNativeId('fam');
  const representations: NativeRepresentationDraftV1[] = [];
  const sources = new Map<string, NativeBinarySource>();
  const representationIds = [primaryRepresentationId];

  if (kind === 'mesh') {
    const format = await inspectModelFile(file, '通常Mesh');
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
      const proxyFormat = await inspectModelFile(proxy, 'Interaction Proxy');
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
        label: labelFromFile(file, kind === 'mesh' ? 'ordinary Mesh' : 'partial GS'),
        assetFrameId,
        status: { kind: 'ready', activeBindingId: bindingId },
      },
      binding: { id: bindingId, assetId, assetRevisionId: revisionId, assetToProject, method: 'import' },
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
  if (files.mesh === null && files.gs === null) throw new Error('通常MeshまたはGSを少なくとも一つ選択してください。');
  if (files.proxy !== null && files.gs === null) throw new Error('Interaction Proxyは対象GSと一緒に指定してください。');
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
        title: title.trim() === '' ? 'Native GS project' : title.trim().slice(0, 160),
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
        types: [{ description: 'LociView native portable backup', accept: { 'application/zip': ['.lociview'] } }],
      });
}

function nativeBackupFileName(title: string): string {
  const safe = title
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  return `${safe === '' ? 'LociView-native-project' : safe}.lociview`;
}

function nativeBackupStagePath(projectId: string, snapshotId: string): string {
  return `native-backup-staging/${projectId}/${snapshotId}.lociview`;
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '操作を中止しました。完成backup／active projectは公開していません。';
  return error instanceof Error ? error.message : String(error);
}

export async function bootNativeGsApp(root: HTMLElement): Promise<void> {
  clear(root);
  root.className = 'ng-app';
  root.append(el('main', { class: 'ng-home' }, el('p', {}, 'Native project storageを初期化しています…')));
  if (!(await OpfsFS.isAvailable())) {
    clear(root);
    root.append(el('main', { class: 'ng-home' }, el('p', { class: 'ng-error' }, 'このブラウザではNative projectに必要なOPFSを利用できません。')));
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
    const status = el('p', { class: 'ng-note' }, 'offline状態を確認しています…');
    const prepare = el('button', { class: 'primary' }, 'GS offline準備');
    const title = el('input', { type: 'text', value: 'Native GS project', maxlength: '160' });
    const mesh = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const gs = el('input', { type: 'file', accept: '.ply,application/octet-stream' });
    const proxy = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const createStatus = el('p', { class: 'ng-status' });
    const create = el('button', { class: 'primary' }, 'Native projectを作成');
    const projectList = el('div', { class: 'ng-list' });
    // iOS Files may classify a custom .lociview extension as an unknown UTI and
    // hide it when an accept filter is present. Selection is only a UI hint;
    // the strict package/version/path/size/hash checks below are authoritative.
    const restoreInput = el('input', { type: 'file' });
    const restore = el('button', { class: 'primary' }, '.lociviewから復元');
    const cancelPortable = el('button', { disabled: 'true' }, '処理を中止');
    const portableStatus = el('p', { class: 'ng-status' }, homeNotice ?? 'backup／restore待機中');
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
        ? 'Spark 2.1.0 runtime: offline-ready'
        : import.meta.env.DEV
          ? '開発server: runtime確認は可能ですがoffline-ready証拠にはなりません。'
          : 'Spark runtimeはまだoffline-readyではありません。GSをofflineで開く前に準備してください。';
    };
    prepare.addEventListener('click', () => {
      setButtonDisabled(prepare, true);
      status.textContent = 'Spark runtimeを初期化しoffline cacheを検証しています…';
      void pwaRegistration.then((registration) => prepareNativeGsOffline(registration)).then((result) => {
        status.textContent = result.detail;
        status.className = result.offlineReady ? 'ng-note ng-ok' : 'ng-note ng-warn';
      }).catch((error: unknown) => {
        status.textContent = error instanceof Error ? error.message : String(error);
        status.className = 'ng-error';
      }).finally(() => setButtonDisabled(prepare, false));
    });

    create.addEventListener('click', () => {
      if (transitionInFlight) return;
      transitionInFlight = true;
      setButtonDisabled(create, true);
      createStatus.className = 'ng-status';
      createStatus.textContent = '入力を検査しています…';
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
          throw new Error(`保存可能容量が不足しています（必要 ${fmtBytes(required)}）。不完全projectはactiveにしません。`);
        }
        await assertNativeProjectDoesNotMixV1(fs, built.draft.project.id);
        const session = await coordinator.tryAcquire(fs, nativeProjectRoot(built.draft.project.id), built.draft.project.id);
        if (!session.holdsWriteLock) throw new Error(session.accessDetail);
        session.activateNewProject();
        try {
          const snapshot = await createNativeProjectV1(session.workspace, built.draft, built.sources, (message) => {
            createStatus.textContent = message;
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
        createStatus.textContent = error instanceof Error ? error.message : String(error);
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
        portableStatus.textContent = '復元する .lociview fileを選択してください。';
        return;
      }
      transitionInFlight = true;
      portableAbort = new AbortController();
      setPortableBusy(true);
      clear(portableResult);
      portableStatus.className = 'ng-status';
      portableStatus.textContent = 'package version、entry、snapshot整合性を検査しています…';
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
          throw new Error(`復元先の保存可能容量が不足しています（Representation ${fmtBytes(inspection.representationByteLength)}）。不完全projectはactiveにしません。`);
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
            onStatus(message) { portableStatus.textContent = message; },
          });
          homeNotice = `復元完了：${restored.snapshot.project.title}（snapshot ${restored.snapshot.generation}、最大application chunk ${fmtBytes(restored.maxApplicationChunkBytes)}）。`;
        } finally {
          unsubscribeRestore();
          session.release();
        }
        await renderHome();
      })().catch((error: unknown) => {
        portableStatus.className = 'ng-error';
        portableStatus.textContent = `復元失敗：${errorMessage(error)}`;
      }).finally(() => {
        portableAbort = null;
        transitionInFlight = false;
        setPortableBusy(false);
      });
    });

    const summaries = await listNativeProjectsV1(fs);
    if (summaries.length === 0) projectList.append(el('p', { class: 'ng-note' }, 'activeなNative projectはまだありません。'));
    for (const summary of summaries) {
      const view = el('button', {}, 'View mode');
      const edit = el('button', { class: 'primary' }, 'Edit mode');
      const backup = el('button', {}, '.lociview backup');
      const remove = el('button', {}, 'local削除');
      view.addEventListener('click', () => void openProject(summary.projectId, 'view'));
      edit.addEventListener('click', () => void openProject(summary.projectId, 'edit'));
      backup.addEventListener('click', () => {
        if (transitionInFlight) return;
        if (portableResult.childElementCount > 0) {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = '先に検証済み一時backupを外部へ保存し、「端末内の一時backupを削除」で片付けてください。';
          return;
        }
        const suggestedName = nativeBackupFileName(summary.title);
        let destinationHandle: Promise<FileSystemFileHandle | null>;
        try {
          // Calling the picker inside the user gesture is required by browsers.
          destinationHandle = requestNativeBackupDestination(suggestedName);
        } catch (error) {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = `backup開始失敗：${errorMessage(error)}`;
          return;
        }
        transitionInFlight = true;
        portableAbort = new AbortController();
        setPortableBusy(true);
        clear(portableResult);
        portableStatus.className = 'ng-status';
        portableStatus.textContent = '保存先を確認しています…';
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
              portableStatus.textContent = '選択した .lociview fileへstream出力しています…';
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
                throw new Error(`download準備用の端末保存容量が不足しています（Representation ${fmtBytes(representationBytes)}）。`);
              }
              stagedPath = nativeBackupStagePath(summary.projectId, durable.snapshot.snapshotId);
              await fs.remove(stagedPath).catch(() => {});
              const bridge = new TransformStream<Uint8Array, Uint8Array>();
              stagedWrite = fs.writeStream(stagedPath, bridge.readable);
              void stagedWrite.catch(() => {});
              destination = bridge.writable;
              portableStatus.textContent = '端末内の検証用Fileへstream出力しています…';
            }
            const exported = await exportNativePortablePackageV1(session.workspace, summary.projectId, destination, {
              signal,
              onStatus(message) { portableStatus.textContent = message; },
            });
            await stagedWrite;
            let completedFile: Blob;
            if (handle !== null) {
              completedFile = await handle.getFile();
            } else {
              const staged = stagedPath === null ? null : await fs.readStream(stagedPath);
              if (staged === null || staged.blob === undefined) {
                throw new Error('検証済みbackupをbrowser downloadへ渡せません。');
              }
              completedFile = await staged.blob();
            }
            portableStatus.textContent = '完成した .lociview fileをstreamでread-back検証しています…';
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
              const download = el('a', { href: activeDownloadUrl, download: suggestedName }, '検証済み .lociview を保存');
              download.addEventListener('click', () => {
                portableStatus.textContent = '検証済みbackupのdownloadを開始しました。端末のFiles／download先で保存完了を確認してください。';
              });
              const discard = el('button', {}, '端末内の一時backupを削除');
              discard.addEventListener('click', () => {
                if (transitionInFlight || stagedPath === null || !window.confirm('Files／download先への保存完了を確認しましたか？ 端末内の一時backupを削除します。')) return;
                transitionInFlight = true;
                void fs.remove(stagedPath).then(() => {
                  if (activeDownloadUrl !== null) URL.revokeObjectURL(activeDownloadUrl);
                  activeDownloadUrl = null;
                  clear(portableResult);
                  portableStatus.textContent = '端末内の一時backupを削除しました。外部へ保存した .lociview は変更していません。';
                }).catch((error: unknown) => {
                  portableStatus.className = 'ng-error';
                  portableStatus.textContent = `一時backup削除失敗：${errorMessage(error)}`;
                }).finally(() => { transitionInFlight = false; });
              });
              portableResult.append(download, discard);
            }
            const heap = exported.metrics.jsHeapPeakBytes === null
              ? 'heap値はこのbrowserでは取得不可'
              : `観測heap peak ${fmtBytes(exported.metrics.jsHeapPeakBytes)}`;
            portableStatus.className = 'ng-status ng-ok';
            portableStatus.textContent = handle === null
              ? `package生成・read-back検証完了（${fmtBytes(exported.metrics.packageByteLength)}、最大chunk ${fmtBytes(exported.metrics.maxApplicationChunkBytes)}、${heap}）。上のlinkから端末外へ保存してください。`
              : `backup完了・read-back検証済み（${fmtBytes(exported.metrics.packageByteLength)}、最大chunk ${fmtBytes(exported.metrics.maxApplicationChunkBytes)}、${heap}）。`;
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
          portableStatus.textContent = `backup失敗：${errorMessage(error)}`;
        }).finally(() => {
          portableAbort = null;
          transitionInFlight = false;
          setPortableBusy(false);
        });
      });
      remove.addEventListener('click', () => {
        if (transitionInFlight || !window.confirm(`「${summary.title}」の端末内projectを削除します。復元用 .lociview を確認してから続行してください。`)) return;
        transitionInFlight = true;
        portableStatus.className = 'ng-status';
        portableStatus.textContent = '書込みロック取得後に端末保存済みprojectを再読込しています…';
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
              throw new Error('確認後にprojectが更新されました。最新状態を再表示してから、もう一度削除を確認してください。');
            }
            session.activateAfterDurableReload();
            await deleteNativeProjectV1(session.workspace, summary.projectId, summary);
            homeNotice = `端末内project「${summary.title}」を削除しました。.lociviewから復元できます。`;
          } finally {
            session.release();
          }
          await renderHome();
        })().catch((error: unknown) => {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = `local削除失敗：${errorMessage(error)}`;
        }).finally(() => { transitionInFlight = false; });
      });
      projectList.append(el('div', { class: 'ng-project-row' },
        el('strong', {}, summary.title),
        el('span', { class: 'ng-note' }, `snapshot ${summary.generation}`),
        view,
        edit,
        backup,
        remove,
      ));
    }

    root.append(el('main', { class: 'ng-home' },
      el('header', { class: 'ng-head' },
        el('div', {}, el('h1', {}, 'LociView Native GS'), el('p', { class: 'ng-note' }, 'First production GS path — G0/G0-S/G1・releaseは未完了')),
        el('a', { href: import.meta.env.BASE_URL }, '通常v1へ戻る'),
      ),
      el('section', { class: 'ng-card' }, el('h2', {}, 'GS offline準備'), status, prepare),
      el('section', { class: 'ng-card' },
        el('h2', {}, 'Native projectを作成'),
        el('p', { class: 'ng-note' }, '通常MeshとGSは独立Assetです。ProxyはGS Asset内の非表示interaction representationです。Mesh-only／GS-onlyも作成できます。'),
        el('label', { class: 'ng-field' }, el('span', {}, 'Project名'), title),
        el('div', { class: 'ng-grid' },
          el('label', { class: 'ng-field' }, el('span', {}, '通常Mesh（任意）'), mesh),
          el('label', { class: 'ng-field' }, el('span', {}, 'Graphdeco GS PLY SH2/SH3（任意）'), gs),
          el('label', { class: 'ng-field' }, el('span', {}, 'GS専用Interaction Proxy（GS指定時のみ任意）'), proxy),
        ),
        create,
        createStatus,
      ),
      el('section', { class: 'ng-card' }, el('h2', {}, '保存済みNative projects'), projectList),
      el('section', { class: 'ng-card' },
        el('h2', {}, 'Portable .lociview backup／restore'),
        el('p', { class: 'ng-note' }, 'snapshotと全Mesh／GS／Proxy source bytesを変換せず保存します。復元は同じproject IDが存在しないworkspaceだけへ行います。'),
        el('label', { class: 'ng-field' }, el('span', {}, '復元する .lociview'), restoreInput),
        el('p', { class: 'ng-note' }, 'iPhoneを含め全fileを選択候補へ表示し、選択後にLociView packageとして厳格検証します。'),
        el('div', { class: 'ng-row' }, restore, cancelPortable),
        portableStatus,
        portableResult,
      ),
      el('p', { class: 'ng-note' }, '高度なAlignment workflow、DisplaySet連携、v1／LociMyu migrationは後続workstreamです。'),
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
        el('p', { class: 'ng-error' }, error instanceof Error ? error.message : String(error)),
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
    let selectedSavedViewId = initial.savedViews?.[0]?.id ?? null;
    const canvas = el('canvas', { 'aria-label': 'Native Mesh and Gaussian Splatting project' });
    const accessBadge = el('span', { class: 'ng-badge' });
    const visibilityBadge = el('span', { class: 'ng-badge' });
    const runtimeStatus = el('p', { class: 'ng-status' }, 'resourcesを読み込んでいます…');
    const diagnostics = el('ul', { class: 'ng-diagnostics' });
    const display = el('select');
    display.append(el('option', { value: '' }, '一括表示を選択'));
    for (const [value, label] of [['mixed', 'すべてのAsset'], ['gs-only', 'GS Assetのみ'], ['mesh-only', 'Mesh Assetのみ']] as const) {
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
    addKind.append(el('option', { value: 'mesh' }, '通常Mesh Asset'), el('option', { value: 'gs' }, 'GS Asset'));
    const addSourceLabel = el('span', {}, '通常Mesh file');
    const addSource = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const addProxy = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply', disabled: 'true' });
    const addAsset = el('button', { class: 'primary' }, 'モデルを追加して保存');
    const transformAsset = el('select');
    const translationInputs = [0, 1, 2].map(() => el('input', { type: 'number', step: '0.01' }));
    const rotationInputs = [0, 1, 2].map(() => el('input', { type: 'number', step: '1' }));
    const scaleInput = el('input', { type: 'number', step: '0.01', min: '0.000001' });
    const applyTransformButton = el('button', {}, '位置・回転・scaleを適用');
    let assetGizmoMode: NativeAssetGizmoMode = 'translate';
    const assetGizmoButtons = new Map<NativeAssetGizmoMode, HTMLButtonElement>([
      ['translate', el('button', { 'aria-pressed': 'true' }, '移動')],
      ['rotate', el('button', { 'aria-pressed': 'false' }, '回転')],
      ['scale', el('button', { 'aria-pressed': 'false' }, 'Uniform scale')],
    ]);
    const captionSelect = el('select', { 'aria-label': 'Caption' });
    const captionTitle = el('input', { type: 'text', maxlength: '160' });
    const captionBody = el('textarea');
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
      const role = roles.includes('gsPrimary') ? 'GS' : 'Mesh';
      target.append(el('option', { value: asset.id }, `${asset.label} (${role})`));
      transformAsset.append(el('option', { value: asset.id }, `${asset.label} (${role})`));
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
    const rebuildCaptionOptions = (): void => {
      clear(captionSelect);
      if (selectedCaptionId === null) {
        captionSelect.append(el('option', { value: '' }, '新しいCaption（未配置）'));
      }
      for (const [index, caption] of working.captions.entries()) {
        const owner = working.assets.find((asset) => asset.id === caption.anchor.assetId);
        captionSelect.append(el(
          'option',
          { value: caption.id },
          `${index + 1}. ${caption.title} — ${owner?.label ?? 'missing Asset'}`,
        ));
      }
      if (working.captions.length === 0 && selectedCaptionId !== null) {
        captionSelect.append(el('option', { value: '' }, 'Captionはまだありません'));
      }
      captionSelect.value = selectedCaptionId ?? '';
    };
    const populateCaptionFields = (): void => {
      const caption = selectedCaption();
      captionTitle.value = caption?.title ?? 'Caption';
      captionBody.value = caption?.body ?? '';
    };
    const commitSelectedCaption = (caption: NativeProjectSnapshotV1['captions'][number]): boolean => {
      try {
        const previous = selectedCaption();
        const wasNew = selectedCaptionId === null;
        working = updateSelectedNativeCaptionV1(working, selectedCaptionId, caption);
        selectedCaptionId ??= caption.id;
        if (wasNew || previous?.title !== caption.title) rebuildCaptionOptions();
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
      visibilityBadge.textContent = `${visibleCount}/${working.assets.length} Assets visible`;
      display.value = '';
    };
    const updateAccess = (): void => {
      accessBadge.textContent = session.sessionMode === 'view'
        ? 'View mode · read-only'
        : session.accessState === 'editable'
          ? 'Edit mode · write lock held'
          : `Edit mode · ${session.accessState}`;
      const editable = canMutateWorking();
      const caption = selectedCaption();
      const captionVisible = caption !== undefined && isNativeAssetVisibleV1(working, caption.anchor.assetId);
      const captionFieldsEditable = caption === undefined || captionVisible;
      save.disabled = !editable || !dirty;
      applyTransformButton.disabled = !editable;
      for (const button of assetGizmoButtons.values()) button.disabled = !editable;
      captionTitle.disabled = !editable || !captionFieldsEditable;
      captionBody.disabled = !editable || !captionFieldsEditable;
      captionSelect.disabled = saving || working.captions.length === 0;
      display.disabled = !editable;
      for (const checkbox of visibilityInputs.values()) checkbox.disabled = !editable;
      target.disabled = !editable;
      addKind.disabled = !editable;
      addSource.disabled = !editable;
      addProxy.disabled = !editable || addKind.value !== 'gs';
      addAsset.disabled = !editable;
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
      el('h2', {}, 'Caption'),
      el('p', { class: 'ng-note' }, '追加先を選び、PCはモデル上でShift＋クリック、iPhoneは長押しします。既存のマーカーはクリック／タップで選択できます。'),
      el('div', { class: 'ng-grid' },
        el('label', { class: 'ng-field' }, el('span', {}, '追加先モデル'), target),
        el('label', { class: 'ng-field' }, el('span', {}, 'キャプション'), captionSelect),
      ),
      el('div', { class: 'ng-row' }, save),
      el('label', { class: 'ng-field' }, el('span', {}, 'タイトル'), captionTitle),
      el('label', { class: 'ng-field' }, el('span', {}, '本文'), captionBody),
      el('p', { class: 'ng-note' }, '配置後は黄色いマーカーのギズモで位置を調整できます。'),
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
        el('div', {}, el('h1', {}, working.project.title)),
        captionSection,
        savedViewSection,
        el('details', { class: 'ng-card' },
          el('summary', {}, 'モデルの表示設定'),
          el('label', { class: 'ng-field' }, el('span', {}, '一括表示'), display),
          el('span', { class: 'ng-note' }, 'Assetごとの表示／非表示'),
          visibilityList,
          el('p', { class: 'ng-note' }, '読み込んだ各モデルは、形式に関係なく個別に表示／非表示を切り替えられます。'),
        ),
        el('details', { class: 'ng-card' },
          el('summary', {}, 'モデルを追加'),
          el('div', { class: 'ng-grid' },
            el('label', { class: 'ng-field' }, el('span', {}, '描画形式'), addKind),
            el('label', { class: 'ng-field' }, addSourceLabel, addSource),
          ),
          el('label', { class: 'ng-field' }, el('span', {}, 'GS配置用の補助モデル（任意）'), addProxy),
          addAsset,
          el('p', { class: 'ng-note' }, '一回に一つのモデルを追加します。追加後に位置を調整できます。'),
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
        selectedCaptionId = null;
        rebuildCaptionOptions();
        populateCaptionFields();
        updateAccess();
        return true;
      },
      onCaptionChanged(caption) {
        if (!canMutateWorking()) return false;
        const wasNew = selectedCaptionId === null;
        const titleValue = captionTitle.value.trim();
        const next = { ...caption, title: titleValue === '' ? 'Caption' : titleValue, body: captionBody.value };
        if (!commitSelectedCaption(next)) return false;
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
        rebuildCaptionOptions();
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
      : 'Spark offline準備がないためGSはactivateしていません。';
    rebuildCaptionOptions();
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
      addSourceLabel.textContent = isGs ? 'Graphdeco GS PLY SH2/SH3' : '通常Mesh file';
      updateAccess();
    });
    addAsset.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const sourceFile = selectedFile(addSource);
      if (sourceFile === null) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '追加するAsset fileを選択してください。';
        return;
      }
      saving = true;
      updateAccess();
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = '追加Assetを検査しています…';
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
          throw new Error(`保存可能容量が不足しています（必要 ${fmtBytes(required)}）。既存snapshotは変更しません。`);
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
        runtimeStatus.textContent = `Asset追加失敗：${error instanceof Error ? error.message : String(error)}。既存active snapshotを維持しました。`;
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
    captionSelect.addEventListener('change', () => {
      const nextId = captionSelect.value === '' ? null : captionSelect.value;
      if (nextId !== null && !working.captions.some((caption) => caption.id === nextId)) {
        rebuildCaptionOptions();
        return;
      }
      selectedCaptionId = nextId;
      if (!viewer.selectCaption(nextId)) {
        selectedCaptionId = working.captions[0]?.id ?? null;
        viewer.selectCaption(selectedCaptionId);
      }
      rebuildCaptionOptions();
      populateCaptionFields();
      updateAccess();
      runtimeStatus.textContent = selectedCaptionId === null
        ? '追加先モデルを選び、画面上でキャプションを追加してください。'
        : `キャプションを選択しました：${selectedCaption()?.title ?? 'Caption'}`;
    });
    unload.addEventListener('click', () => {
      viewer.disposeGs();
      runtimeStatus.textContent = 'GS runtime resourceを解放しました。再読込はprojectを閉じて開き直してください。';
    });
    transformAsset.addEventListener('change', () => {
      populateTransform();
      runtimeStatus.textContent = viewer.selectAlignmentAsset(transformAsset.value)
        ? '選択Assetのalignment gizmoを表示しました。'
        : '選択Assetは現在非表示のためgizmoを表示できません。';
    });
    for (const [mode, button] of assetGizmoButtons) {
      button.addEventListener('click', () => {
        assetGizmoMode = mode;
        for (const [candidate, candidateButton] of assetGizmoButtons) {
          candidateButton.setAttribute('aria-pressed', String(candidate === mode));
        }
        viewer.selectAlignmentAsset(transformAsset.value);
        viewer.setAssetGizmoMode(mode);
        runtimeStatus.textContent = `Asset gizmo: ${button.textContent}`;
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
      viewer.selectCaption(selectedCaptionId);
      markDirty();
    });
    captionBody.addEventListener('input', () => {
      if (!canMutateWorking()) return;
      const caption = selectedCaption();
      if (caption === undefined) return;
      if (!commitSelectedCaption({ ...caption, body: captionBody.value })) return;
      viewer.setSnapshot(working);
      viewer.selectCaption(selectedCaptionId);
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
        viewer.selectCaption(selectedCaptionId);
        syncVisibilityControls();
        rebuildCaptionOptions();
        rebuildSavedViewOptions();
        runtimeStatus.textContent = 'プロジェクトを保存しました。';
      }).catch((error: unknown) => {
        working = durable;
        selectedCaptionId = durable.captions.some((caption) => caption.id === selectedCaptionId)
          ? selectedCaptionId
          : durable.captions[0]?.id ?? null;
        viewer.setSnapshot(durable);
        viewer.selectCaption(selectedCaptionId);
        syncVisibilityControls();
        rebuildCaptionOptions();
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
