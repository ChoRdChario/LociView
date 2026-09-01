import * as THREE from 'three';
import { detectFormat, type ModelFormat } from '../viewer/loaders';
import { clear, el, fmtBytes } from '../ui/dom';
import { confirmDialog } from '../ui/dialogs';
import { OpfsFS } from '../platform/opfs';
import type { WorkspaceFS } from '../platform/fs';
import { ProjectMutationCoordinator, type ProjectMutationSession } from '../platform/projectLock';
import { registerPwa } from '../platform/pwa';
import { inspectNativeGsPlyV1, inspectNativePointPlyV1, type NativePointPlyFactsV1 } from './plyProfile';
import { isNativeGsOfflineReady, prepareNativeGsOffline } from './offline';
import { NATIVE_POINT_DIAMETER_DEFAULT_CSS_PX } from './pointPresentation';
import { filterNativeCaptionListV1 } from './captionList';
import {
  activateNativeManualAssetTransformV1,
  appendNativeSavedViewAsDisplaySetDefaultV1,
  NATIVE_CAPTION_PIN_SCALE_DEFAULT,
  NATIVE_CAPTION_PIN_SCALE_MAX,
  NATIVE_CAPTION_PIN_SCALE_MIN,
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  NATIVE_GS_PROFILE_ID,
  NATIVE_IDENTITY_TRANSFORM,
  NATIVE_POINT_PROFILE_ID,
  nativeModelProfileId,
  nativeAssetPinScaleV1,
  nativeCaptionDisplaySetIdV1,
  nativeCaptionOwnerAssetIdV1,
  nativeDisplaySetsV1,
  nativeSavedViewDisplaySetIdV1,
  newNativeId,
  normalizeNativeSim3,
  removeNativeAssetV1,
  removeSelectedNativeCaptionV1,
  setNativeAssetVisibilityV1,
  setNativeAssetPinScaleV1,
  updateSelectedNativeCaptionV1,
  type NativeAssetBindingRevisionV1,
  type NativeDisplayMode,
  type NativeProjectDraftV1,
  type NativeProjectSnapshotV1,
  type NativeMeshMaterialAppearanceV1,
  type NativeRepresentationDraftV1,
  type NativeSavedViewV1,
  type NativeSim3V1,
  type NativeSolidBackgroundV1,
} from './schema';
import {
  activeNativeBindingV1,
  activeNativeRepresentationsV1,
  isNativeAssetVisibleV1,
  nativeCaptionNeedsReviewV1,
  summarizeNativeVisibleAssetReadinessV1,
} from './resolver';
import {
  addNativeAssetV1,
  addNativeCaptionImageV1,
  assertNativeProjectDoesNotMixV1,
  createNativeProjectV1,
  deleteNativeProjectV1,
  listNativeProjectsV1,
  nativeProjectRoot,
  openNativeProjectV1,
  readNativeRepresentationV1,
  readNativeMediaV1,
  replaceNativeAssetV1,
  saveNativeProjectV1,
  type NativeAssetImportV1,
  type NativeBinarySource,
  type NativeProjectSummary,
} from './storage';
import {
  exportNativePortablePackageV1,
  inspectNativePortablePackageV1,
  restoreNativePortablePackageV1,
} from './portablePackage';
import {
  detectNativePackageContainerKindV1,
  exportNativeExchangePackageV1,
  inspectNativeExchangePackageV1,
  mergeNativeCollaborationPackageV1,
  nativeExchangeDefaultOpenModeV1,
  restoreNativeExchangePackageV1,
  type NativeExchangePurposeV1,
} from './packageExchange';
import { digestNativeStream } from './sha256';
import { NativeGsViewer, type NativeAssetGizmoMode } from './viewer';
import { nativeRuntimeGltfTextureMaxEdge } from './mobileTexturePolicy';
import {
  mountNativeCaptionOverlayV1,
  type NativeCaptionOverlayControllerV1,
} from './captionOverlay';
import { NativeUnsavedChangesGuard } from './unsavedChanges';
import { resolveNativeInitialProjectRoute } from './initialRoute';
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

function srgbTupleFromHex(hex: string): readonly [number, number, number] {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) throw new Error('色指定が不正です。');
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function srgbHexFromTuple(color: readonly [number, number, number]): string {
  return `#${color.map((component) => (
    Math.round(THREE.MathUtils.clamp(component, 0, 1) * 255).toString(16).padStart(2, '0')
  )).join('')}`;
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

interface InspectedModelFile {
  readonly format: ModelFormat;
  readonly pointPly?: NativePointPlyFactsV1;
}

async function inspectModelFile(file: File, label: string, pointAllowed = true): Promise<InspectedModelFile> {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 64 * 1024)).arrayBuffer());
  const format = detectFormat(file.name, head);
  if (format === null) throw new Error(`${label}はGLB/GLTF/OBJ/STL/通常PLYのいずれでもありません。`);
  if (format === 'ply') {
    const inspection = await inspectNativeGsPlyV1(file);
    if (inspection.kind === 'supported-gs') throw new Error(`${label}にGS PLYが選ばれています。GS欄へ指定してください。`);
    const pointInspection = await inspectNativePointPlyV1(file);
    if (pointInspection.kind === 'supported-point') {
      if (!pointAllowed) throw new Error(`${label}には三角形を持つ3Dモデルを指定してください。通常点群は補助面にできません。`);
      return { format, pointPly: pointInspection.facts };
    }
  }
  return { format };
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
    const inspected = await inspectModelFile(file, '3Dモデル／通常点群');
    const pointPly = inspected.pointPly;
    representations.push({
      id: primaryRepresentationId,
      assetId,
      representationFrameId: newNativeId('frm'),
      contentKind: pointPly === undefined ? 'mesh' : 'pointCloud',
      purposes: ['source', 'display'],
      role: pointPly === undefined ? 'meshPrimary' : 'pointPrimary',
      variantFamilyId: primaryFamilyId,
      formatProfile: { id: pointPly === undefined ? nativeModelProfileId(inspected.format) : NATIVE_POINT_PROFILE_ID },
      representationToAsset: NATIVE_IDENTITY_TRANSFORM,
      derivedFrom: [],
      ...(pointPly === undefined ? {} : { pointPly }),
      mediaType: modelMediaType(inspected.format),
    });
    sources.set(primaryRepresentationId, fileSource(file, modelMediaType(inspected.format)));
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
      const proxyFormat = await inspectModelFile(proxy, 'キャプション配置用の補助モデル', false);
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
        formatProfile: { id: nativeModelProfileId(proxyFormat.format) },
        representationToAsset: NATIVE_IDENTITY_TRANSFORM,
        derivedFrom: [primaryRepresentationId],
        proxyForGsVariantFamilyId: primaryFamilyId,
        mediaType: modelMediaType(proxyFormat.format),
      });
      sources.set(proxyRepresentationId, fileSource(proxy, modelMediaType(proxyFormat.format)));
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
  if (files.mesh === null && files.gs === null) throw new Error('3Dモデル、通常点群、Gaussian Splattingのいずれかを少なくとも一つ選択してください。');
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
  const modelAssetId = builtAssets.find((built) => built.imported.representations.some((entry) => (
    entry.role === 'meshPrimary' || entry.role === 'pointPrimary'
  )))?.imported.asset.id ?? null;
  const gsAssetId = builtAssets.find((built) => built.imported.representations.some((entry) => entry.role === 'gsPrimary'))?.imported.asset.id ?? null;
  const displayMode: NativeDisplayMode = modelAssetId !== null && gsAssetId !== null ? 'mixed' : gsAssetId !== null ? 'gs-only' : 'mesh-only';
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
      presentation: { displayMode, captionTargetAssetId: gsAssetId ?? modelAssetId, hiddenAssetIds: [] },
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

function requestNativePackageDestination(
  suggestedName: string,
  description: string,
): Promise<FileSystemFileHandle | null> {
  const picker = (window as typeof window & { showSaveFilePicker?: NativeSavePicker }).showSaveFilePicker;
  return picker === undefined
    ? Promise.resolve(null)
    : picker.call(window, {
        suggestedName,
        types: [{ description, accept: { 'application/zip': ['.lociview'] } }],
      });
}

function nativePackageFileName(title: string, purpose: 'backup' | NativeExchangePurposeV1): string {
  const safe = title
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  const suffix = purpose === 'backup'
    ? 'backup'
    : purpose === 'collaboration'
      ? 'collaboration'
      : purpose === 'review' ? 'review' : 'editable-copy';
  return `${safe === '' ? 'LociView-project' : safe}-${suffix}.lociview`;
}

function nativePackageStagePath(
  projectId: string,
  snapshotId: string,
  purpose: 'backup' | NativeExchangePurposeV1,
): string {
  return `native-backup-staging/${projectId}/${snapshotId}-${purpose}.lociview`;
}

function requestNativeBackupDestination(suggestedName: string): Promise<FileSystemFileHandle | null> {
  return requestNativePackageDestination(suggestedName, 'LociViewプロジェクトの完全バックアップ');
}

function nativeBackupFileName(title: string): string {
  return nativePackageFileName(title, 'backup');
}

function nativeBackupStagePath(projectId: string, snapshotId: string): string {
  return nativePackageStagePath(projectId, snapshotId, 'backup');
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '操作を中止しました。未完成のpackageやプロジェクトは保存されていません。';
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
  let activeCaptionOverlay: NativeCaptionOverlayControllerV1 | null = null;
  let activeUnsavedChanges: NativeUnsavedChangesGuard | null = null;
  let activeSession: ProjectMutationSession | null = null;
  let unsubscribeAccess: (() => void) | null = null;
  let transitionInFlight = false;
  let activeDownloadUrl: string | null = null;
  let homeNotice: string | null = null;

  const closeActive = (): void => {
    unsubscribeAccess?.();
    unsubscribeAccess = null;
    activeUnsavedChanges?.dispose();
    activeUnsavedChanges = null;
    activeCaptionOverlay?.dispose();
    activeCaptionOverlay = null;
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
    const restore = el('button', { class: 'primary' }, 'packageを読み込む');
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
        portableStatus.textContent = '読み込むLociView packageを選択してください。';
        return;
      }
      transitionInFlight = true;
      portableAbort = new AbortController();
      setPortableBusy(true);
      clear(portableResult);
      portableStatus.className = 'ng-status';
      portableStatus.textContent = 'LociView packageを確認しています…';
      portableDetail.textContent = '';
      void (async () => {
        const signal = portableAbort!.signal;
        const containerKind = await detectNativePackageContainerKindV1(packageFile, signal);
        let exchangePurpose: NativeExchangePurposeV1 | null = null;
        const inspection = containerKind === 'backup'
          ? await inspectNativePortablePackageV1(packageFile, signal)
          : await inspectNativeExchangePackageV1(packageFile, signal).then((value) => {
              exchangePurpose = value.manifest.purpose;
              return value;
            });
        const required = inspection.representationByteLength + inspection.mediaByteLength +
          inspection.manifest.nativeSnapshot.byteLength + 64 * 1024;
        const estimate = await navigator.storage.estimate?.();
        if (
          estimate?.quota !== undefined && estimate.usage !== undefined &&
          Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
          estimate.quota - estimate.usage < required
        ) {
          throw new Error(`保存容量が不足しています（データ ${fmtBytes(inspection.representationByteLength + inspection.mediaByteLength)}）。プロジェクトは復元されていません。`);
        }
        const projectId = inspection.snapshot.project.id;
        if (exchangePurpose === 'collaboration') {
          const currentProjects = await listNativeProjectsV1(fs);
          if (currentProjects.some((project) => project.projectId === projectId)) {
            throw new Error('この共同編集用packageと同じProjectが既にあります。対象Projectを「編集して開く」から開き、共同編集packageを統合してください。');
          }
        }
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
        let openMode: 'view' | 'edit' | null = null;
        try {
          if (containerKind === 'backup') {
            const restored = await restoreNativePortablePackageV1(session.workspace, fs, packageFile, {
              signal,
              onStatus(message) {
                portableStatus.textContent = '完全バックアップからプロジェクトを復元しています…';
                portableDetail.textContent = message;
              },
            });
            homeNotice = `「${restored.snapshot.project.title}」を完全バックアップからこの端末へ復元しました。`;
          } else {
            const restored = await restoreNativeExchangePackageV1(session.workspace, fs, packageFile, {
              signal,
              onStatus(message) {
                portableStatus.textContent = 'packageからプロジェクトを復元しています…';
                portableDetail.textContent = message;
              },
            });
            openMode = nativeExchangeDefaultOpenModeV1(restored.purpose);
            const purposeLabel = restored.purpose === 'review'
              ? '閲覧共有用package'
              : restored.purpose === 'cleanCopy' ? '編集用コピー' : '共同編集用package';
            homeNotice = `「${restored.snapshot.project.title}」を${purposeLabel}からこの端末へ復元しました。`;
          }
        } finally {
          unsubscribeRestore();
          session.release();
        }
        if (openMode === null) {
          await renderHome();
        } else {
          transitionInFlight = false;
          await openProject(projectId, openMode);
        }
      })().catch((error: unknown) => {
        portableStatus.className = 'ng-error';
        portableStatus.textContent = 'LociView packageを読み込めませんでした。別のファイルを選ぶか、詳しい情報を確認してください。';
        portableDetail.textContent = errorMessage(error);
      }).finally(() => {
        portableAbort = null;
        transitionInFlight = false;
        setPortableBusy(false);
      });
    });

    const beginPackageExport = (
      summary: NativeProjectSummary,
      purpose: 'backup' | NativeExchangePurposeV1,
    ): void => {
      if (transitionInFlight) return;
      if (portableResult.childElementCount > 0) {
        portableStatus.className = 'ng-error';
        portableStatus.textContent = '先に作成済みのファイルを保存し、「この端末の一時ファイルを削除」で片付けてください。';
        return;
      }
      const labels = purpose === 'backup'
        ? { noun: '完全バックアップ', description: 'LociViewプロジェクトの完全バックアップ' }
        : purpose === 'collaboration'
          ? { noun: '共同編集用package', description: 'LociView共同編集用package' }
          : purpose === 'review'
            ? { noun: '閲覧共有用package', description: 'LociView閲覧共有用package' }
            : { noun: '編集用コピー', description: 'LociView編集用コピー' };
      const suggestedName = nativePackageFileName(summary.title, purpose);
      let destinationHandle: Promise<FileSystemFileHandle | null>;
      try {
        // File pickers require this call in the original user gesture.
        destinationHandle = requestNativePackageDestination(suggestedName, labels.description);
      } catch (error) {
        portableStatus.className = 'ng-error';
        portableStatus.textContent = `${labels.noun}の保存先を開けませんでした。詳しい情報を確認してください。`;
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
            portableStatus.textContent = `選択したファイルへ${labels.noun}を書き出しています…`;
            const writable = await handle.createWritable();
            destination = writable as unknown as WritableStream<Uint8Array>;
          } else {
            const binaryBytes = [
              ...durable.snapshot.representations.map((entry) => entry.blob.byteLength),
              ...(durable.snapshot.mediaResources ?? []).map((entry) => entry.blob.byteLength),
            ].reduce((sum, bytes) => sum + bytes, 0);
            const estimate = await navigator.storage.estimate?.();
            const required = binaryBytes + 32 * 1024 * 1024;
            if (
              estimate?.quota !== undefined && estimate.usage !== undefined &&
              Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
              estimate.quota - estimate.usage < required
            ) {
              throw new Error(`ダウンロード準備用の保存容量が不足しています（データ ${fmtBytes(binaryBytes)}）。`);
            }
            stagedPath = nativePackageStagePath(summary.projectId, durable.snapshot.snapshotId, purpose);
            await fs.remove(stagedPath).catch(() => {});
            const bridge = new TransformStream<Uint8Array, Uint8Array>();
            stagedWrite = fs.writeStream(stagedPath, bridge.readable);
            void stagedWrite.catch(() => {});
            destination = bridge.writable;
            portableStatus.textContent = `この端末で${labels.noun}を準備しています…`;
          }
          let metrics: {
            readonly packageByteLength: number;
            readonly packageSha256: string;
            readonly maxApplicationChunkBytes: number;
            readonly memoryDetail: string;
          };
          if (purpose === 'backup') {
            const exported = await exportNativePortablePackageV1(session.workspace, summary.projectId, destination, {
              signal,
              onStatus(message) {
                portableStatus.textContent = `${labels.noun}を書き出しています…`;
                portableDetail.textContent = message;
              },
            });
            metrics = {
              ...exported.metrics,
              memoryDetail: exported.metrics.jsHeapPeakBytes === null
                ? 'heap値はこのbrowserでは取得不可'
                : `観測heap peak ${fmtBytes(exported.metrics.jsHeapPeakBytes)}`,
            };
          } else {
            const exported = await exportNativeExchangePackageV1(
              session.workspace,
              summary.projectId,
              purpose,
              destination,
              {
                signal,
                onStatus(message) {
                  portableStatus.textContent = `${labels.noun}を書き出しています…`;
                  portableDetail.textContent = message;
                },
              },
            );
            metrics = { ...exported.metrics, memoryDetail: 'binaryはSTORE方式でstream出力' };
          }
          await stagedWrite;
          let completedFile: Blob;
          if (handle !== null) {
            completedFile = await handle.getFile();
          } else {
            const staged = stagedPath === null ? null : await fs.readStream(stagedPath);
            if (staged === null || staged.blob === undefined) {
              throw new Error(`確認済みの${labels.noun}をダウンロードへ渡せません。`);
            }
            completedFile = await staged.blob();
          }
          portableStatus.textContent = `書き出した${labels.noun}を確認しています…`;
          const readBack = await digestNativeStream(completedFile.stream(), signal);
          if (readBack.byteLength !== metrics.packageByteLength || readBack.sha256 !== metrics.packageSha256) {
            throw new Error('完成 .lociview fileのsize／SHA-256 read-backが一致しません。');
          }
          if (handle === null) {
            if (activeDownloadUrl !== null) URL.revokeObjectURL(activeDownloadUrl);
            activeDownloadUrl = URL.createObjectURL(completedFile);
            const download = el('a', { href: activeDownloadUrl, download: suggestedName }, `${labels.noun}を保存`);
            download.addEventListener('click', () => {
              portableStatus.textContent = 'ダウンロードを開始しました。端末のファイル／ダウンロード先で保存完了を確認してください。';
            });
            const discard = el('button', {}, 'この端末の一時ファイルを削除');
            discard.addEventListener('click', () => {
              if (transitionInFlight || stagedPath === null || !window.confirm('保存完了を確認しましたか？ この端末の一時ファイルを削除します。')) return;
              transitionInFlight = true;
              void fs.remove(stagedPath).then(() => {
                if (activeDownloadUrl !== null) URL.revokeObjectURL(activeDownloadUrl);
                activeDownloadUrl = null;
                clear(portableResult);
                portableStatus.textContent = 'この端末の一時ファイルを削除しました。保存先の .lociview は変更していません。';
              }).catch((error: unknown) => {
                portableStatus.className = 'ng-error';
                portableStatus.textContent = 'この端末の一時ファイルを削除できませんでした。詳しい情報を確認してください。';
                portableDetail.textContent = errorMessage(error);
              }).finally(() => { transitionInFlight = false; });
            });
            portableResult.append(download, discard);
          }
          portableStatus.className = 'ng-status ng-ok';
          portableStatus.textContent = handle === null
            ? `${labels.noun}の確認が完了しました。上のリンクからファイルを保存してください。`
            : `${labels.noun}を保存しました。`;
          portableDetail.textContent = `package ${fmtBytes(metrics.packageByteLength)}、最大chunk ${fmtBytes(metrics.maxApplicationChunkBytes)}、${metrics.memoryDetail}`;
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
        portableStatus.textContent = `${labels.noun}を作成できませんでした。未完成ファイルは完成packageとして扱いません。`;
        portableDetail.textContent = errorMessage(error);
      }).finally(() => {
        portableAbort = null;
        transitionInFlight = false;
        setPortableBusy(false);
      });
    };

    const summaries = await listNativeProjectsV1(fs);
    if (summaries.length === 0) projectList.append(el('p', { class: 'ng-note' }, 'この端末に保存されたプロジェクトはありません。'));
    for (const summary of summaries) {
      const view = el('button', {}, '閲覧のみで開く');
      const edit = el('button', { class: 'primary' }, '編集して開く');
      const backup = el('button', {}, 'バックアップを書き出す');
      const collaborationExport = el('button', {}, '共同編集用を書き出す');
      const reviewExport = el('button', {}, '閲覧共有用を書き出す');
      const cleanCopyExport = el('button', {}, '編集用コピーを書き出す');
      const exchangeDisclosure = el('details', { class: 'ng-package-actions' },
        el('summary', {}, '共有・コピー…'),
        el('p', { class: 'ng-note' }, '共同編集用は同じProjectへ統合できます。閲覧共有用は閲覧開始、編集用コピーは別Projectとして編集開始します。'),
        el('div', { class: 'ng-row' }, collaborationExport, reviewExport, cleanCopyExport),
      );
      const remove = el('button', {}, 'この端末から削除');
      view.addEventListener('click', () => void openProject(summary.projectId, 'view'));
      edit.addEventListener('click', () => void openProject(summary.projectId, 'edit'));
      collaborationExport.addEventListener('click', () => beginPackageExport(summary, 'collaboration'));
      reviewExport.addEventListener('click', () => beginPackageExport(summary, 'review'));
      cleanCopyExport.addEventListener('click', () => beginPackageExport(summary, 'cleanCopy'));
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
        exchangeDisclosure,
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
        el('h3', {}, 'LociView packageを読み込む'),
        el('p', { class: 'ng-note' }, '完全バックアップ、共同編集用、閲覧共有用、編集用コピーを内容から判定して読み込みます。共同編集用は、同じProjectがある場合、そのProject内の統合操作を使います。'),
        el('label', { class: 'ng-field' }, el('span', {}, 'LociView package（.lociview）'), restoreInput),
        el('p', { class: 'ng-note' }, 'iPhoneを含め、ファイル選択後に内容を厳密に確認します。'),
        el('div', { class: 'ng-row' }, restore, cancelPortable),
        portableStatus,
        portableResult,
        el('details', {}, el('summary', {}, '詳しい情報'), portableDetail),
      ),
      el('section', { class: 'ng-card' },
        el('h2', {}, '新しいプロジェクトを作成'),
        el('p', { class: 'ng-note' }, '3Dモデル、通常点群、Gaussian Splattingは別々のモデルとして読み込み、あとから位置や表示を調整できます。一種類だけでも作成できます。'),
        el('label', { class: 'ng-field' }, el('span', {}, 'プロジェクト名'), title),
        el('div', { class: 'ng-grid' },
          el('label', { class: 'ng-field' }, el('span', {}, '3Dモデル／通常点群（任意）'), mesh),
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
    activeCaptionOverlay?.dispose();
    activeCaptionOverlay = null;
    clear(root);
    let durable = initial;
    let working = initial;
    let activeDisplaySetIdValue = initial.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
    let saving = false;
    activeUnsavedChanges?.dispose();
    const unsavedChanges = new NativeUnsavedChangesGuard(window);
    activeUnsavedChanges = unsavedChanges;
    let selectedCaptionId = initial.captions.find((caption) => (
      nativeCaptionDisplaySetIdV1(caption) === (initial.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID)
    ))?.id ?? null;
    let captionMoveActive = false;
    let creatingCaption = false;
    let captionDeleteConfirmationInFlight = false;
    let assetDeleteConfirmationInFlight = false;
    let assetClosureChanged = false;
    let selectedSavedViewId = initial.savedViews?.[0]?.id ?? null;
    const canvas = el('canvas', { 'aria-label': '3DモデルとGaussian Splattingのプロジェクト' });
    const accessBadge = el('span', { class: 'ng-badge' });
    const visibilityBadge = el('span', { class: 'ng-badge' });
    const runtimeErrorBadge = el('span', { class: 'ng-badge ng-error' }, 'モデル表示エラー');
    runtimeErrorBadge.hidden = true;
    const stage = el('section', { class: 'ng-stage' },
      canvas,
      el('div', { class: 'ng-stage-badges' }, accessBadge, visibilityBadge, runtimeErrorBadge),
    );
    const runtimeStatus = el('p', { class: 'ng-status' }, 'モデルを読み込んでいます…');
    const diagnostics = el('ul', { class: 'ng-diagnostics' });
    const runtimeErrors: string[] = [];
    const display = el('select');
    display.append(el('option', { value: '' }, '一括表示を選択'));
    for (const [value, label] of [['mixed', 'すべてのモデル'], ['gs-only', 'Gaussian Splattingのみ'], ['mesh-only', '3Dモデル／通常点群のみ']] as const) {
      display.append(el('option', { value }, label));
    }
    display.value = '';
    const visibilityList = el('div', { class: 'ng-list' });
    const visibilityInputs = new Map<string, HTMLInputElement>();
    const target = el('select');
    const save = el('button', { class: 'primary' }, 'プロジェクトを保存');
    const unload = el('button', {}, 'GSを解放');
    const close = el('button', {}, '閉じる');
    const reload = el('button', {}, '再読み込み');
    const addKind = el('select');
    addKind.append(el('option', { value: 'mesh' }, '3Dモデル／通常点群'), el('option', { value: 'gs' }, 'Gaussian Splatting'));
    const addSourceLabel = el('span', {}, '3Dモデル／通常点群ファイル');
    const addSource = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const addProxy = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply', disabled: 'true' });
    const addAsset = el('button', { class: 'primary' }, 'モデルを追加して保存');
    const replaceAsset = el('select');
    const replaceKind = el('select');
    replaceKind.append(el('option', { value: 'mesh' }, '3Dモデル／通常点群'), el('option', { value: 'gs' }, 'Gaussian Splatting'));
    const replaceSourceLabel = el('span', {}, '新しい3Dモデル／通常点群ファイル');
    const replaceSource = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const replaceProxy = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply', disabled: 'true' });
    const replaceButton = el('button', { class: 'primary' }, '選択したモデルを差し替えて保存');
    const deleteAsset = el('select');
    const deleteAssetButton = el('button', { class: 'danger' }, '選択したモデルをプロジェクトから削除');
    const transformAsset = el('select');
    const translationInputs = [0, 1, 2].map(() => el('input', { type: 'number', step: '0.01' }));
    const rotationInputs = [0, 1, 2].map(() => el('input', { type: 'number', step: '1' }));
    const scaleInput = el('input', { type: 'number', step: '0.01', min: '0.000001' });
    const applyTransformButton = el('button', {}, '位置・回転・スケールを適用');
    const pinScaleNumber = el('input', {
      type: 'number',
      min: String(NATIVE_CAPTION_PIN_SCALE_MIN),
      max: String(NATIVE_CAPTION_PIN_SCALE_MAX),
      step: 'any',
      value: String(NATIVE_CAPTION_PIN_SCALE_DEFAULT),
      'aria-label': '選択したモデルのキャプションピン倍率',
    });
    const pinScaleSlider = el('input', {
      type: 'range', min: '-3', max: '3', step: '0.01', value: '0',
      'aria-label': '選択したモデルのキャプションピン倍率スライダー',
    });
    const pinScaleValue = el('output', {}, `${NATIVE_CAPTION_PIN_SCALE_DEFAULT}×`);
    const pointAppearance = el('div', { class: 'ng-field', hidden: 'true' });
    const pointDiameter = el('input', {
      type: 'range', min: '1', max: '20', step: '0.5', value: String(NATIVE_POINT_DIAMETER_DEFAULT_CSS_PX),
    });
    const pointDiameterValue = el('output', {}, `${NATIVE_POINT_DIAMETER_DEFAULT_CSS_PX} px`);
    pointAppearance.append(
      el('span', {}, '点の大きさ（現在の表示）'),
      el('div', { class: 'ng-row' }, pointDiameter, pointDiameterValue),
      el('span', { class: 'ng-note' }, 'すぐに画面へ反映します。正式な見え方セットへの保存は後続です。'),
    );
    let assetGizmoMode: NativeAssetGizmoMode = 'translate';
    const assetGizmoButtons = new Map<NativeAssetGizmoMode, HTMLButtonElement>([
      ['translate', el('button', { 'aria-pressed': 'true' }, '移動')],
      ['rotate', el('button', { 'aria-pressed': 'false' }, '回転')],
      ['scale', el('button', { 'aria-pressed': 'false' }, '均一スケール')],
    ]);
    const captionList = el('div', { class: 'ng-list ng-caption-list', 'aria-label': 'キャプション一覧' });
    const captionSearch = el('input', {
      type: 'search',
      placeholder: '検索（タイトル・本文）',
      'aria-label': 'キャプションをタイトルまたは本文で検索',
    });
    const captionAssetFilter = el('select', { 'aria-label': 'キャプションを所属モデルで絞り込み' });
    const captionResultCount = el('span', { class: 'ng-note' });
    const newCaption = el('button', { class: 'primary' }, '＋ 新しいキャプション');
    const captionTitle = el('input', { type: 'text', maxlength: '160' });
    const captionBody = el('textarea');
    const captionColor = el('input', { type: 'color', value: '#eab308', 'aria-label': 'キャプションピンの色' });
    const captionGuide = el('p', { class: 'ng-note' });
    const captionReview = el('p', { class: 'ng-note' });
    const moveCaption = el('button', { 'aria-pressed': 'false' }, 'ピンを移動');
    const repositionCaption = el('button', {}, '表面へ置き直す');
    const deleteCaption = el('button', { class: 'danger' }, '削除');
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
    const displaySetSelect = el('select', { 'aria-label': '表示セット' });
    const materialAsset = el('select', { 'aria-label': 'マテリアルを調整するモデル' });
    const materialSlot = el('select', { 'aria-label': '調整するマテリアル' });
    const materialOpacity = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '1' });
    const materialOpacityValue = el('output', {}, '1.00');
    const materialDoubleSided = el('input', { type: 'checkbox' });
    const materialUnlit = el('input', { type: 'checkbox' });
    const materialChromaEnabled = el('input', { type: 'checkbox' });
    const materialChromaColor = el('input', { type: 'color', value: '#000000' });
    const materialChromaTolerance = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.1' });
    const materialChromaFeather = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0' });
    const resetMaterialAppearance = el('button', {}, '元の見え方へ戻す');
    const materialStatus = el('p', { class: 'ng-note' });
    const materialSection = el('section', { class: 'ng-card' });
    const captionMedia = el('div', { class: 'ng-list' });
    const captionImageInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
    const addCaptionImage = el('button', {}, '画像を添付して保存');
    const captionImageStatus = el('p', { class: 'ng-note' });
    const collaborationInput = el('input', { type: 'file' });
    const collaborationMerge = el('button', { class: 'primary' }, '共同編集packageを統合');
    const collaborationStatus = el('p', { class: 'ng-note' });
    const collaborationDetail = el('p', { class: 'ng-note' });
    let captionMediaGeneration = 0;
    const captionMediaUrls = new Set<string>();

    const rolesByAsset = new Map(working.assets.map((asset) => [
      asset.id,
      activeNativeRepresentationsV1(working, asset.id).map((representation) => representation.role),
    ]));
    const targetOptions = new Map<string, HTMLOptionElement>();
    const transformOptions = new Map<string, HTMLOptionElement>();
    const replaceOptions = new Map<string, HTMLOptionElement>();
    const deleteOptions = new Map<string, HTMLOptionElement>();
    const visibilityRows = new Map<string, HTMLElement>();
    for (const asset of working.assets) {
      const roles = rolesByAsset.get(asset.id) ?? [];
      const role = roles.includes('gsPrimary')
        ? 'Gaussian Splatting'
        : roles.includes('pointPrimary') ? '通常点群' : '3Dモデル';
      targetOptions.set(asset.id, el('option', { value: asset.id }, `${asset.label} (${role})`));
      transformOptions.set(asset.id, el('option', { value: asset.id }, `${asset.label} (${role})`));
      replaceOptions.set(asset.id, el('option', { value: asset.id }, `${asset.label} (${role})`));
      deleteOptions.set(asset.id, el('option', { value: asset.id }, `${asset.label} (${role})`));
      const checkbox = el('input', { type: 'checkbox', checked: isNativeAssetVisibleV1(working, asset.id) });
      visibilityInputs.set(asset.id, checkbox);
      visibilityRows.set(asset.id, el('label', { class: 'ng-project-row' }, checkbox, el('strong', {}, asset.label), el('span', { class: 'ng-note' }, role)));
    }
    const syncAssetControlMembership = (): void => {
      const previousTransform = transformAsset.value;
      const previousReplacement = replaceAsset.value;
      const previousDeletion = deleteAsset.value;
      const previousCaptionAssetFilter = captionAssetFilter.value;
      clear(target);
      clear(transformAsset);
      clear(replaceAsset);
      clear(deleteAsset);
      clear(visibilityList);
      clear(captionAssetFilter);
      captionAssetFilter.append(el('option', { value: '' }, 'すべてのモデル'));
      for (const asset of working.assets) {
        target.append(targetOptions.get(asset.id)!);
        transformAsset.append(transformOptions.get(asset.id)!);
        replaceAsset.append(replaceOptions.get(asset.id)!);
        deleteAsset.append(deleteOptions.get(asset.id)!);
        visibilityList.append(visibilityRows.get(asset.id)!);
        captionAssetFilter.append(el('option', { value: asset.id }, asset.label));
      }
      target.value = working.presentation.captionTargetAssetId ?? '';
      const fallbackAssetId = working.assets[0]!.id;
      transformAsset.value = working.assets.some((asset) => asset.id === previousTransform) ? previousTransform : fallbackAssetId;
      replaceAsset.value = working.assets.some((asset) => asset.id === previousReplacement) ? previousReplacement : fallbackAssetId;
      deleteAsset.value = working.assets.some((asset) => asset.id === previousDeletion) ? previousDeletion : fallbackAssetId;
      captionAssetFilter.value = working.assets.some((asset) => asset.id === previousCaptionAssetFilter)
        ? previousCaptionAssetFilter
        : '';
    };
    syncAssetControlMembership();

    const setDiagnostics = (messages: readonly string[]): void => {
      clear(diagnostics);
      for (const message of messages) diagnostics.append(el('li', {}, message));
    };
    const selectedCaption = () => selectedCaptionId === null
      ? undefined
      : working.captions.find((caption) => caption.id === selectedCaptionId);
    const activeDisplaySetId = (): string => activeDisplaySetIdValue;
    const displaySets = () => nativeDisplaySetsV1(working);
    const savedViews = (): readonly NativeSavedViewV1[] => (working.savedViews ?? [])
      .filter((view) => nativeSavedViewDisplaySetIdV1(view) === activeDisplaySetId());
    const selectedSavedView = (): NativeSavedViewV1 | undefined => selectedSavedViewId === null
      ? undefined
      : savedViews().find((view) => view.id === selectedSavedViewId);
    const rebuildDisplaySetOptions = (): void => {
      clear(displaySetSelect);
      for (const displaySet of displaySets()) {
        displaySetSelect.append(el('option', { value: displaySet.id }, displaySet.name));
      }
      displaySetSelect.value = activeDisplaySetId();
    };
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
      const setCaptions = working.captions.filter((caption) => (
        nativeCaptionDisplaySetIdV1(caption) === activeDisplaySetId()
      ));
      if (setCaptions.length === 0) {
        captionResultCount.textContent = '0件';
        captionList.append(el('p', { class: 'ng-note' }, 'この表示セットにキャプションはまだありません。'));
        return;
      }
      const filtered = filterNativeCaptionListV1(setCaptions, {
        query: captionSearch.value,
        assetId: captionAssetFilter.value === '' ? null : captionAssetFilter.value,
      });
      captionResultCount.textContent = `${filtered.length} / ${setCaptions.length}件`;
      if (filtered.length === 0) {
        captionList.append(el('p', { class: 'ng-note' }, '条件に一致するキャプションはありません。'));
        return;
      }
      for (const caption of filtered) {
        const owner = working.assets.find((asset) => asset.id === nativeCaptionOwnerAssetIdV1(caption));
        const review = nativeCaptionNeedsReviewV1(working, caption) ? '［要再配置］ ' : '';
        const button = el(
          'button',
          {
            class: 'ng-caption-row',
            'aria-current': String(caption.id === selectedCaptionId),
          },
          el('strong', {}, `${review}${caption.title || '（無題）'}`),
          el('span', { class: 'ng-note' }, caption.anchor === null ? '未配置' : owner?.label ?? '所属モデル不明'),
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
      const generation = ++captionMediaGeneration;
      const captionId = caption?.id ?? null;
      captionTitle.value = caption?.title ?? '';
      captionBody.value = caption?.body ?? '';
      captionColor.value = caption?.color ?? '#eab308';
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
      for (const url of captionMediaUrls) URL.revokeObjectURL(url);
      captionMediaUrls.clear();
      clear(captionMedia);
      for (const mediaId of caption?.attachmentMediaIds ?? []) {
        const media = (working.mediaResources ?? []).find((candidate) => candidate.id === mediaId);
        if (media === undefined) continue;
        const open = el('button', {}, `画像を表示：${media.label}`);
        open.addEventListener('click', () => {
          open.disabled = true;
          void readNativeMediaV1(fs, working.project.id, media.id).then(async (source) => {
            if (source === null) throw new Error('添付画像を端末内から読み込めません。');
            const blob = await new Response(source.stream(), {
              headers: { 'Content-Type': media.blob.mediaType },
            }).blob();
            const url = URL.createObjectURL(blob);
            if (generation !== captionMediaGeneration || selectedCaptionId !== captionId) {
              URL.revokeObjectURL(url);
              return;
            }
            captionMediaUrls.add(url);
            const image = el('img', {
              src: url,
              alt: media.label,
              style: 'display:block;max-width:100%;max-height:20rem;object-fit:contain',
            });
            const release = (): void => {
              if (!captionMediaUrls.delete(url)) return;
              URL.revokeObjectURL(url);
            };
            image.addEventListener('load', release, { once: true });
            image.addEventListener('error', release, { once: true });
            captionMedia.append(image);
          }).catch((error: unknown) => {
            if (generation !== captionMediaGeneration || selectedCaptionId !== captionId) return;
            runtimeStatus.className = 'ng-error';
            runtimeStatus.textContent = error instanceof Error ? error.message : String(error);
          }).finally(() => { open.disabled = false; });
        });
        captionMedia.append(open);
      }
    };
    const commitSelectedCaption = (caption: NativeProjectSnapshotV1['captions'][number]): boolean => {
      try {
        const previous = selectedCaption();
        const previousNeedsReview = previous === undefined ? false : nativeCaptionNeedsReviewV1(working, previous);
        const wasNew = selectedCaptionId === null;
        working = updateSelectedNativeCaptionV1(working, selectedCaptionId, caption);
        selectedCaptionId ??= caption.id;
        const nextNeedsReview = nativeCaptionNeedsReviewV1(working, caption);
        if (
          wasNew || previous?.title !== caption.title || previousNeedsReview !== nextNeedsReview ||
          (captionSearch.value.trim() !== '' && previous?.body !== caption.body)
        ) rebuildCaptionList();
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
      for (const asset of working.assets) {
        const visible = isNativeAssetVisibleV1(working, asset.id);
        visibilityInputs.get(asset.id)!.checked = visible;
      }
      const readiness = summarizeNativeVisibleAssetReadinessV1(
        working,
        activeViewer?.getResolution().visibleRepresentationIds ?? [],
      );
      visibilityBadge.textContent = readiness.fullyReady
        ? `${readiness.requestedVisibleAssetCount}/${readiness.totalAssetCount}モデルを表示中`
        : `${readiness.readyVisibleAssetCount}/${readiness.requestedVisibleAssetCount}モデルを読込済み`;
      visibilityBadge.className = readiness.fullyReady ? 'ng-badge' : 'ng-badge ng-error';
      visibilityBadge.title = readiness.fullyReady ? '' : '表示指定と、実際に描画できるモデル数が一致していません。';
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
      const captionOwnerAssetId = caption === undefined ? null : nativeCaptionOwnerAssetIdV1(caption);
      const captionVisible = caption !== undefined && (
        captionOwnerAssetId === null || isNativeAssetVisibleV1(working, captionOwnerAssetId)
      );
      const captionFieldsEditable = caption !== undefined && captionVisible;
      if (!editable && creatingCaption) {
        creatingCaption = false;
        populateCaptionFields();
      }
      if ((!editable || !captionVisible) && captionMoveActive) {
        captionMoveActive = false;
        activeViewer?.stopCaptionPositionEditing();
      }
      save.disabled = !editable || !unsavedChanges.isDirty;
      applyTransformButton.disabled = !editable;
      pointDiameter.disabled = saving || pointAppearance.hidden;
      for (const button of assetGizmoButtons.values()) button.disabled = !editable;
      captionTitle.disabled = !editable || !captionFieldsEditable;
      captionBody.disabled = !editable || !captionFieldsEditable;
      captionColor.disabled = !editable || !captionFieldsEditable;
      captionImageInput.disabled = !editable || !captionFieldsEditable || unsavedChanges.isDirty;
      addCaptionImage.disabled = !editable || !captionFieldsEditable || unsavedChanges.isDirty;
      pinScaleNumber.disabled = !editable;
      pinScaleSlider.disabled = !editable;
      newCaption.disabled = !editable;
      newCaption.textContent = creatingCaption ? '新規配置をやめる' : '＋ 新しいキャプション';
      newCaption.setAttribute('aria-pressed', String(creatingCaption));
      moveCaption.disabled = !editable || caption?.anchor === null || caption === undefined || !captionVisible;
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
      deleteAsset.disabled = !editable || assetDeleteConfirmationInFlight;
      displaySetSelect.disabled = saving || displaySets().length < 2;
      materialAsset.disabled = !editable || materialAsset.options.length === 0;
      materialSlot.disabled = !editable || materialSlot.options.length === 0;
      materialOpacity.disabled = !editable || materialSlot.options.length === 0;
      materialDoubleSided.disabled = !editable || materialSlot.options.length === 0;
      materialUnlit.disabled = !editable || materialSlot.options.length === 0;
      materialChromaEnabled.disabled = !editable || materialSlot.options.length === 0;
      materialChromaColor.disabled = !editable || materialSlot.options.length === 0;
      materialChromaTolerance.disabled = !editable || materialSlot.options.length === 0;
      materialChromaFeather.disabled = !editable || materialSlot.options.length === 0;
      resetMaterialAppearance.disabled = !editable || materialSlot.options.length === 0;
      deleteAssetButton.disabled = !editable || assetDeleteConfirmationInFlight;
      repositionCaption.disabled = !editable || caption === undefined || !captionVisible;
      deleteCaption.disabled = !editable || caption === undefined || captionDeleteConfirmationInFlight;
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
      reload.disabled = saving;
      collaborationInput.disabled = !editable || unsavedChanges.isDirty;
      collaborationMerge.disabled = !editable || unsavedChanges.isDirty;
      activeViewer?.setEditingEnabled(editable);
    };
    const markDirty = (): void => {
      unsavedChanges.markDirty();
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
      const asset = working.assets.find((candidate) => candidate.id === transformAsset.value);
      const pinScale = asset === undefined ? NATIVE_CAPTION_PIN_SCALE_DEFAULT : nativeAssetPinScaleV1(asset);
      binding.assetToProject.translation.forEach((value, index) => { translationInputs[index]!.value = String(value); });
      const q = new THREE.Quaternion().fromArray(binding.assetToProject.rotationXYZW);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      [euler.x, euler.y, euler.z].forEach((value, index) => { rotationInputs[index]!.value = String(THREE.MathUtils.radToDeg(value)); });
      scaleInput.value = String(binding.assetToProject.uniformScale);
      pinScaleNumber.value = String(pinScale);
      pinScaleSlider.value = String(Math.log10(pinScale));
      pinScaleValue.textContent = `${pinScale.toLocaleString()}×`;
      const pointAsset = activeNativeRepresentationsV1(working, transformAsset.value)
        .some((representation) => representation.role === 'pointPrimary');
      pointAppearance.hidden = !pointAsset;
      if (pointAsset) {
        const diameter = activeViewer?.getPointDiameterCssPixels(transformAsset.value) ?? NATIVE_POINT_DIAMETER_DEFAULT_CSS_PX;
        pointDiameter.value = String(diameter);
        pointDiameterValue.textContent = `${diameter.toLocaleString()} px`;
      }
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
      el('label', { class: 'ng-field' }, el('span', {}, 'キャプションの配置先モデル'), target),
      captionGuide,
      el('div', { class: 'ng-grid' },
        el('label', { class: 'ng-field' }, el('span', {}, 'キャプションを検索'), captionSearch),
        el('label', { class: 'ng-field' }, el('span', {}, '所属モデルで絞り込み'), captionAssetFilter),
      ),
      captionResultCount,
      captionList,
      el('label', { class: 'ng-field' }, el('span', {}, 'タイトル'), captionTitle),
      el('label', { class: 'ng-field' }, el('span', {}, '本文'), captionBody),
      el('label', { class: 'ng-field' }, el('span', {}, 'ピンの色'), captionColor),
      captionMedia,
      el('label', { class: 'ng-field' }, el('span', {}, '画像を追加（PNG／JPEG／WebP／GIF）'), captionImageInput),
      addCaptionImage,
      captionImageStatus,
      captionReview,
      el('div', { class: 'ng-row' }, moveCaption, repositionCaption, deleteCaption),
    );

    materialSection.append(
      el('h2', {}, '表示セットと見え方'),
      el('p', { class: 'ng-note' }, '表示セットはキャプション群・3Dモデルのマテリアル設定・任意のビューを一緒に切り替えます。モデルの表示／非表示や位置は変えません。'),
      el('label', { class: 'ng-field' }, el('span', {}, '表示セット'), displaySetSelect),
      el('div', { class: 'ng-grid' },
        el('label', { class: 'ng-field' }, el('span', {}, '3Dモデル'), materialAsset),
        el('label', { class: 'ng-field' }, el('span', {}, 'マテリアル'), materialSlot),
      ),
      el('label', { class: 'ng-field' },
        el('span', {}, '不透明度'),
        el('div', { class: 'ng-row' }, materialOpacity, materialOpacityValue),
      ),
      el('div', { class: 'ng-row' },
        el('label', { class: 'ng-row' }, materialDoubleSided, el('span', {}, '両面表示')),
        el('label', { class: 'ng-row' }, materialUnlit, el('span', {}, 'ライトの影響を受けない')),
        el('label', { class: 'ng-row' }, materialChromaEnabled, el('span', {}, 'クロマキー')),
      ),
      el('div', { class: 'ng-grid' },
        el('label', { class: 'ng-field' }, el('span', {}, '抜く色'), materialChromaColor),
        el('label', { class: 'ng-field' }, el('span', {}, '許容幅'), materialChromaTolerance),
        el('label', { class: 'ng-field' }, el('span', {}, '境界のぼかし'), materialChromaFeather),
      ),
      resetMaterialAppearance,
      materialStatus,
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
    rebuildDisplaySetOptions();

    root.append(el('main', { class: 'ng-view' },
      stage,
      el('aside', { class: 'ng-panel' },
        el('div', {}, el('h1', {}, working.project.title), el('div', { class: 'ng-row ng-project-actions' }, save)),
        materialSection,
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
          el('summary', {}, 'モデルをプロジェクトから削除'),
          el('label', { class: 'ng-field' }, el('span', {}, '削除するモデル'), deleteAsset),
          deleteAssetButton,
          el('p', { class: 'ng-note' }, 'このモデルにキャプションがある場合は、先にそのキャプションを削除してください。元のモデルファイルは変更しません。'),
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
          el('label', { class: 'ng-field' },
            el('span', {}, 'キャプションピンの大きさ（このモデル）'),
            el('div', { class: 'ng-row' }, pinScaleNumber, pinScaleValue),
            pinScaleSlider,
            el('span', { class: 'ng-note' }, '0.001～1000倍。数値とスライダーは連動し、すぐ画面へ反映します。'),
          ),
          pointAppearance,
          el('p', { class: 'ng-note' }, '元のモデルファイルは変更しません。'),
        ),
        el('details', { class: 'ng-card' },
          el('summary', {}, '共同編集packageを統合'),
          el('p', { class: 'ng-note' }, 'このProjectと同じlineage／baselineから分岐したCaption変更だけを統合します。未保存変更がある間は実行できません。'),
          el('label', { class: 'ng-field' }, el('span', {}, '共同編集用 .lociview'), collaborationInput),
          collaborationMerge,
          collaborationStatus,
          el('details', {}, el('summary', {}, '統合の詳しい情報'), collaborationDetail),
        ),
        el('details', { class: 'ng-card' },
          el('summary', {}, '詳細'),
          unload,
          diagnostics,
          el('div', { class: 'ng-row' }, close, reload),
        ),
        runtimeStatus,
      ),
    ));

    const offlineReady = import.meta.env.DEV || await isNativeGsOfflineReady(await pwaRegistration);
    const gltfTextureMaxEdge = nativeRuntimeGltfTextureMaxEdge({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });
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
        const next = {
          ...caption,
          title: titleValue === '' ? 'Caption' : titleValue,
          body: captionBody.value,
          displaySetId: caption.displaySetId ?? activeDisplaySetId(),
        };
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
      onCaptionDeselected() {
        selectedCaptionId = null;
        creatingCaption = false;
        captionMoveActive = false;
        rebuildCaptionList();
        populateCaptionFields();
        updateAccess();
        runtimeStatus.className = 'ng-status';
        runtimeStatus.textContent = 'キャプションの選択を解除しました。';
      },
      onAssetTransformCommitted(assetId, transform) {
        if (session.accessState !== 'editable' || !commitWorkingAssetTransform(assetId, transform)) return;
        viewer.setSnapshot(working);
        viewer.selectAlignmentAsset(assetId);
        markDirty();
      },
      onIssuesChanged(issues) { setDiagnostics([...new Set([...issues, ...runtimeErrors])]); },
      onProgress(message) { runtimeStatus.textContent = message; },
      onRuntimeError(message) {
        if (!runtimeErrors.includes(message)) runtimeErrors.push(message);
        runtimeErrorBadge.hidden = false;
        runtimeErrorBadge.title = message;
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = `モデルを表示できません：${message}`;
        setDiagnostics([...new Set([...runtimeErrors, ...(activeViewer?.getResolution().issues ?? [])])]);
        syncVisibilityControls();
      },
    }, gltfTextureMaxEdge === null ? {} : { gltfTextureMaxEdge });
    const syncMaterialAssetOptions = (): void => {
      const previous = materialAsset.value;
      clear(materialAsset);
      for (const asset of working.assets) {
        if (!activeNativeRepresentationsV1(working, asset.id).some((representation) => representation.role === 'meshPrimary')) continue;
        materialAsset.append(el('option', { value: asset.id }, asset.label));
      }
      if (materialAsset.options.length > 0) {
        materialAsset.value = [...materialAsset.options].some((option) => option.value === previous)
          ? previous
          : materialAsset.options[0]!.value;
      }
    };
    const selectedMaterialSlot = () => {
      const separator = materialSlot.value.indexOf(':');
      if (separator < 0) return undefined;
      const representationId = materialSlot.value.slice(0, separator);
      const key = materialSlot.value.slice(separator + 1);
      return viewer.listMeshMaterialSlots(materialAsset.value)
        .find((slot) => slot.representationId === representationId && slot.key === key);
    };
    const syncMaterialControls = (): void => {
      const previous = materialSlot.value;
      clear(materialSlot);
      for (const slot of viewer.listMeshMaterialSlots(materialAsset.value)) {
        const value = `${slot.representationId}:${slot.key}`;
        materialSlot.append(el('option', { value }, slot.name));
      }
      if (materialSlot.options.length > 0) {
        materialSlot.value = [...materialSlot.options].some((option) => option.value === previous)
          ? previous
          : materialSlot.options[0]!.value;
      }
      const slot = selectedMaterialSlot();
      const appearance = slot === undefined ? undefined : (working.meshMaterialAppearances ?? []).find((candidate) => (
        candidate.displaySetId === activeDisplaySetId() && candidate.assetId === materialAsset.value &&
        candidate.representationId === slot.representationId && candidate.materialSlotKey === slot.key
      ));
      const baseline = slot?.baseline;
      materialOpacity.value = String(appearance?.opacity ?? baseline?.opacity ?? 1);
      materialOpacityValue.textContent = Number(materialOpacity.value).toFixed(2);
      materialDoubleSided.checked = appearance?.doubleSided ?? baseline?.doubleSided ?? false;
      materialUnlit.checked = appearance?.unlit ?? baseline?.unlit ?? false;
      materialChromaEnabled.checked = appearance?.chroma.enabled ?? baseline?.chroma.enabled ?? false;
      materialChromaColor.value = srgbHexFromTuple(appearance?.chroma.colorSrgb ?? baseline?.chroma.colorSrgb ?? [0, 0, 0]);
      materialChromaTolerance.value = String(appearance?.chroma.tolerance ?? baseline?.chroma.tolerance ?? 0.1);
      materialChromaFeather.value = String(appearance?.chroma.feather ?? baseline?.chroma.feather ?? 0);
      resetMaterialAppearance.hidden = appearance === undefined;
      materialStatus.textContent = slot === undefined
        ? 'マテリアルを持つ3Dモデルがありません。GS・通常点群・配置用補助モデルはこの設定の対象外です。'
        : slot.supportsUnlitAndChroma
          ? '変更はすぐ画面へ反映され、プロジェクト保存時にこの表示セットへ保存されます。'
          : 'このマテリアルでは不透明度と両面表示だけを利用できます。';
      updateAccess();
      if (slot !== undefined && !slot.supportsUnlitAndChroma) {
        materialUnlit.disabled = true;
        materialChromaEnabled.disabled = true;
        materialChromaColor.disabled = true;
        materialChromaTolerance.disabled = true;
        materialChromaFeather.disabled = true;
      }
    };
    const commitMaterialAppearance = (): void => {
      if (!canMutateWorking()) return;
      const slot = selectedMaterialSlot();
      const binding = activeNativeBindingV1(working, materialAsset.value);
      if (slot === undefined || binding === null) return;
      const existing = (working.meshMaterialAppearances ?? []).find((candidate) => (
        candidate.displaySetId === activeDisplaySetId() && candidate.assetId === materialAsset.value &&
        candidate.representationId === slot.representationId && candidate.materialSlotKey === slot.key
      ));
      const appearance: NativeMeshMaterialAppearanceV1 = {
        id: existing?.id ?? newNativeId('mat'),
        displaySetId: activeDisplaySetId(),
        assetId: materialAsset.value,
        authoredAssetRevisionId: binding.assetRevisionId,
        representationId: slot.representationId,
        materialSlotKey: slot.key,
        opacity: Number(materialOpacity.value),
        doubleSided: materialDoubleSided.checked,
        unlit: slot.supportsUnlitAndChroma && materialUnlit.checked,
        chroma: {
          enabled: slot.supportsUnlitAndChroma && materialChromaEnabled.checked,
          colorSrgb: srgbTupleFromHex(materialChromaColor.value),
          tolerance: Number(materialChromaTolerance.value),
          feather: Number(materialChromaFeather.value),
        },
      };
      working = {
        ...working,
        meshMaterialAppearances: existing === undefined
          ? [...(working.meshMaterialAppearances ?? []), appearance]
          : (working.meshMaterialAppearances ?? []).map((candidate) => candidate.id === existing.id ? appearance : candidate),
      };
      materialOpacityValue.textContent = appearance.opacity.toFixed(2);
      viewer.setSnapshot(working);
      markDirty();
    };
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
        displaySetId: activeDisplaySetId(),
      };
    };
    activeViewer = viewer;
    unsubscribeAccess = session.subscribeAccess(() => updateAccess());
    await viewer.load(
      (representationId) => readNativeRepresentationV1(fs, working.project.id, representationId),
      offlineReady,
    );
    viewer.setActiveDisplaySet(activeDisplaySetId());
    syncMaterialAssetOptions();
    syncMaterialControls();
    syncVisibilityControls();
    const requestedPrimaryRepresentations = working.assets
      .filter((asset) => isNativeAssetVisibleV1(working, asset.id))
      .flatMap((asset) => activeNativeRepresentationsV1(working, asset.id))
      .filter((representation) => representation.role !== 'interactionProxy');
    const readyRepresentationIds = new Set(viewer.getResolution().visibleRepresentationIds);
    const unavailableRequested = requestedPrimaryRepresentations.filter((representation) => (
      !readyRepresentationIds.has(representation.id)
    ));
    if (runtimeErrors.length > 0 || unavailableRequested.length > 0) {
      runtimeErrorBadge.hidden = false;
      runtimeStatus.className = 'ng-error';
      runtimeStatus.textContent = runtimeErrors.length > 0
        ? `モデルを表示できません：${runtimeErrors[0]}`
        : `${unavailableRequested.length}件のモデルを表示できません。詳しい情報を確認してください。`;
    } else {
      runtimeErrorBadge.hidden = true;
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = gltfTextureMaxEdge === null
        ? 'モデルを読み込みました。表示切替とキャプション編集を利用できます。'
        : `モデルをiPhone/iPad用の最大${gltfTextureMaxEdge}px画像で読み込みました。`;
    }
    rebuildCaptionList();
    populateCaptionFields();
    viewer.selectCaption(selectedCaptionId);
    activeCaptionOverlay = mountNativeCaptionOverlayV1({
      stage,
      getSnapshot: () => working,
      getSelectedCaptionId: () => selectedCaptionId,
      getActiveDisplaySetId: activeDisplaySetId,
      projectCaption: (captionId) => viewer.projectCaption(captionId),
      readMedia: (mediaId) => readNativeMediaV1(fs, working.project.id, mediaId),
      onDismiss: () => {
        if (!viewer.selectCaption(null)) return;
        selectedCaptionId = null;
        creatingCaption = false;
        captionMoveActive = false;
        rebuildCaptionList();
        populateCaptionFields();
        updateAccess();
      },
      onError: (message) => {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = message;
      },
    });
    populateTransform();
    viewer.selectAlignmentAsset(transformAsset.value);
    viewer.setAssetGizmoMode(assetGizmoMode);
    rebuildSavedViewOptions();
    syncCurrentViewControls();
    updateAccess();

    displaySetSelect.addEventListener('change', () => {
      if (!displaySets().some((displaySet) => displaySet.id === displaySetSelect.value)) return;
      activeDisplaySetIdValue = displaySetSelect.value;
      selectedCaptionId = null;
      creatingCaption = false;
      captionMoveActive = false;
      const defaultSavedViewId = displaySets().find((displaySet) => displaySet.id === activeDisplaySetId())?.defaultSavedViewId ?? null;
      selectedSavedViewId = defaultSavedViewId;
      viewer.setActiveDisplaySet(activeDisplaySetId());
      viewer.selectCaption(selectedCaptionId);
      rebuildCaptionList();
      populateCaptionFields();
      rebuildSavedViewOptions();
      syncMaterialControls();
      const defaultView = defaultSavedViewId === null
        ? undefined
        : savedViews().find((view) => view.id === defaultSavedViewId);
      if (defaultView !== undefined) {
        viewer.applyProjectCamera(defaultView.camera);
        viewer.setBackground(defaultView.background);
        syncCurrentViewControls();
      }
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = `表示セット「${displaySets().find((displaySet) => displaySet.id === activeDisplaySetId())?.name ?? ''}」へ切り替えました。`;
    });
    materialAsset.addEventListener('change', syncMaterialControls);
    materialSlot.addEventListener('change', syncMaterialControls);
    for (const control of [materialOpacity, materialChromaTolerance, materialChromaFeather]) {
      control.addEventListener('input', commitMaterialAppearance);
    }
    for (const control of [materialDoubleSided, materialUnlit, materialChromaEnabled, materialChromaColor]) {
      control.addEventListener('change', commitMaterialAppearance);
    }
    materialChromaColor.addEventListener('input', commitMaterialAppearance);
    resetMaterialAppearance.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const slot = selectedMaterialSlot();
      if (slot === undefined) return;
      const previous = working.meshMaterialAppearances ?? [];
      const retained = previous.filter((candidate) => !(
        candidate.displaySetId === activeDisplaySetId() && candidate.assetId === materialAsset.value &&
        candidate.representationId === slot.representationId && candidate.materialSlotKey === slot.key
      ));
      if (retained.length === previous.length) return;
      working = { ...working, meshMaterialAppearances: retained };
      viewer.setSnapshot(working);
      syncMaterialControls();
      markDirty();
    });

    savedViewSelect.addEventListener('change', () => {
      selectedSavedViewId = savedViewSelect.value === '' ? null : savedViewSelect.value;
      savedViewName.value = selectedSavedView()?.name ?? '';
      updateAccess();
    });
    captureSavedView.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const view = captureViewRecord();
      working = appendNativeSavedViewAsDisplaySetDefaultV1(working, activeDisplaySetId(), view);
      selectedSavedViewId = view.id;
      rebuildSavedViewOptions();
      markDirty();
      runtimeStatus.textContent = `現在のビューを「${view.name}」として保存し、この表示セットの切替ビューにしました。`;
    });
    overwriteSavedView.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const existing = selectedSavedView();
      if (existing === undefined) return;
      const view = captureViewRecord(existing);
      working = {
        ...working,
        savedViews: (working.savedViews ?? []).map((candidate) => candidate.id === view.id ? view : candidate),
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
      working = {
        ...working,
        savedViews: (working.savedViews ?? []).filter((candidate) => candidate.id !== view.id),
        ...(working.displaySets === undefined ? {} : {
          displaySets: working.displaySets.map((displaySet) => displaySet.defaultSavedViewId === view.id
            ? { ...displaySet, defaultSavedViewId: null }
            : displaySet),
        }),
      };
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
      addSourceLabel.textContent = isGs ? 'Gaussian Splatting（PLY）' : '3Dモデル／通常点群ファイル';
      updateAccess();
    });
    replaceKind.addEventListener('change', () => {
      const isGs = replaceKind.value === 'gs';
      replaceSource.value = '';
      replaceProxy.value = '';
      replaceSource.accept = isGs ? '.ply,application/octet-stream' : '.glb,.gltf,.obj,.stl,.ply';
      replaceSourceLabel.textContent = isGs ? '新しいGaussian Splatting（PLY）' : '新しい3Dモデル／通常点群ファイル';
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
        unsavedChanges.clear();
        unsubscribeAccess?.();
        unsubscribeAccess = null;
        activeCaptionOverlay?.dispose();
        activeCaptionOverlay = null;
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
        unsavedChanges.clear();
        unsubscribeAccess?.();
        unsubscribeAccess = null;
        activeCaptionOverlay?.dispose();
        activeCaptionOverlay = null;
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
    deleteAssetButton.addEventListener('click', () => {
      if (activeViewer !== viewer || !canMutateWorking() || assetDeleteConfirmationInFlight) return;
      const asset = working.assets.find((candidate) => candidate.id === deleteAsset.value);
      if (asset === undefined) return;
      if (working.assets.length === 1) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '最後のモデルは削除できません。プロジェクト全体を削除する場合は、一覧画面の「この端末から削除」を使用してください。';
        return;
      }
      const ownedCaptionCount = working.captions.filter((caption) => nativeCaptionOwnerAssetIdV1(caption) === asset.id).length;
      if (ownedCaptionCount > 0) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = `このモデルには${ownedCaptionCount}件のキャプションがあります。先にそのキャプションを削除してください。`;
        return;
      }
      const assetId = asset.id;
      const assetLabel = asset.label;
      assetDeleteConfirmationInFlight = true;
      updateAccess();
      void confirmDialog(
        'モデルをプロジェクトから削除',
        `「${assetLabel}」をこのプロジェクトから削除しますか？ 元ファイルは変更しません。プロジェクトを保存するまでは確定しません。`,
      ).then((confirmed) => {
        if (
          !confirmed || activeViewer !== viewer || !canMutateWorking() ||
          deleteAsset.value !== assetId || !working.assets.some((candidate) => candidate.id === assetId)
        ) return;
        working = removeNativeAssetV1(working, assetId);
        assetClosureChanged = true;
        creatingCaption = false;
        captionMoveActive = false;
        viewer.stopCaptionPositionEditing();
        viewer.setSnapshot(working);
        syncAssetControlMembership();
        syncMaterialAssetOptions();
        syncMaterialControls();
        syncVisibilityControls();
        rebuildCaptionList();
        populateTransform();
        populateCaptionFields();
        markDirty();
        runtimeStatus.className = 'ng-status';
        runtimeStatus.textContent = `「${assetLabel}」を保存対象から削除しました。プロジェクトを保存すると確定します。`;
      }).catch((error: unknown) => {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = `モデルを削除できませんでした：${error instanceof Error ? error.message : String(error)}`;
      }).finally(() => {
        assetDeleteConfirmationInFlight = false;
        updateAccess();
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
          (preset === 'mesh-only' && (roles.includes('meshPrimary') || roles.includes('pointPrimary')));
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
    captionSearch.addEventListener('input', rebuildCaptionList);
    captionAssetFilter.addEventListener('change', rebuildCaptionList);
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
      const durableOwnerId = nativeCaptionOwnerAssetIdV1(caption);
      const ownerId = durableOwnerId ?? working.presentation.captionTargetAssetId;
      const owner = working.assets.find((asset) => asset.id === ownerId);
      if (owner === undefined || !isNativeAssetVisibleV1(working, owner.id)) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = '所属モデルが見つからないか非表示のため、表面へ置き直せません。キャプションの位置は変更していません。';
        return;
      }
      if (
        durableOwnerId === null &&
        !window.confirm(
          `この旧キャプションには所属モデル情報がありません。現在選択中の「${owner.label}」へ所属させ、` +
          'その表面へ置き直しますか？ 実際の変更は表面を指定してプロジェクトを保存した時に確定します。',
        )
      ) return;
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
      if (!viewer.armCaptionReposition(caption.id, owner.id)) {
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
    deleteCaption.addEventListener('click', () => {
      if (activeViewer !== viewer || !canMutateWorking() || captionDeleteConfirmationInFlight) return;
      const caption = selectedCaption();
      if (caption === undefined) return;
      const captionId = caption.id;
      const captionLabel = caption.title || '（無題）';
      captionDeleteConfirmationInFlight = true;
      updateAccess();
      void confirmDialog(
        'キャプションの削除',
        `「${captionLabel}」をこのプロジェクトから削除しますか？ プロジェクトを保存するまでは確定しません。`,
      ).then((confirmed) => {
        if (
          !confirmed || activeViewer !== viewer || !canMutateWorking() ||
          selectedCaptionId !== captionId || selectedCaption()?.id !== captionId
        ) return;
        working = removeSelectedNativeCaptionV1(working, captionId);
        creatingCaption = false;
        captionMoveActive = false;
        viewer.stopCaptionPositionEditing();
        selectedCaptionId = null;
        viewer.setSnapshot(working);
        viewer.selectCaption(null);
        rebuildCaptionList();
        populateCaptionFields();
        markDirty();
        runtimeStatus.className = 'ng-status';
        runtimeStatus.textContent = `「${captionLabel}」を保存対象から削除しました。プロジェクトを保存すると確定します。`;
      }).catch((error: unknown) => {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = `キャプションを削除できませんでした：${error instanceof Error ? error.message : String(error)}`;
      }).finally(() => {
        captionDeleteConfirmationInFlight = false;
        updateAccess();
      });
    });
    unload.addEventListener('click', () => {
      viewer.disposeGs();
      syncVisibilityControls();
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
    pointDiameter.addEventListener('input', () => {
      const diameter = viewer.setPointDiameterCssPixels(transformAsset.value, Number(pointDiameter.value));
      pointDiameter.value = String(diameter);
      pointDiameterValue.textContent = `${diameter.toLocaleString()} px`;
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = '点の大きさを現在の表示へ反映しました。プロジェクトデータは変更していません。';
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
    const commitPinScale = (value: number): void => {
      if (!canMutateWorking()) return;
      try {
        const next = setNativeAssetPinScaleV1(working, transformAsset.value, value);
        if (next === working) return;
        working = next;
        pinScaleNumber.value = String(value);
        pinScaleSlider.value = String(Math.log10(value));
        pinScaleValue.textContent = `${value.toLocaleString()}×`;
        viewer.setSnapshot(working);
        markDirty();
      } catch (error) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = error instanceof Error ? error.message : String(error);
      }
    };
    pinScaleNumber.addEventListener('input', () => {
      if (pinScaleNumber.value === '') return;
      const value = Number(pinScaleNumber.value);
      if (!Number.isFinite(value) || value < NATIVE_CAPTION_PIN_SCALE_MIN || value > NATIVE_CAPTION_PIN_SCALE_MAX) return;
      commitPinScale(value);
    });
    pinScaleNumber.addEventListener('change', populateTransform);
    pinScaleSlider.addEventListener('input', () => {
      commitPinScale(Number((10 ** Number(pinScaleSlider.value)).toPrecision(6)));
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
    captionColor.addEventListener('input', () => {
      if (!canMutateWorking()) return;
      const caption = selectedCaption();
      if (caption === undefined) return;
      if (!commitSelectedCaption({ ...caption, color: captionColor.value })) return;
      viewer.setSnapshot(working);
      markDirty();
    });
    addCaptionImage.addEventListener('click', () => {
      if (saving || session.accessState !== 'editable') return;
      const caption = selectedCaption();
      const image = selectedFile(captionImageInput);
      if (caption === undefined || image === null) {
        captionImageStatus.className = 'ng-error';
        captionImageStatus.textContent = '保存済みのキャプションと添付する画像を選択してください。';
        return;
      }
      if (unsavedChanges.isDirty) {
        captionImageStatus.className = 'ng-error';
        captionImageStatus.textContent = '先に現在の変更を保存してから画像を添付してください。';
        return;
      }
      saving = true;
      updateAccess();
      captionImageStatus.className = 'ng-status';
      captionImageStatus.textContent = '画像を確認しています…';
      const source: NativeBinarySource = {
        size: image.size,
        mediaType: image.type.toLowerCase(),
        stream: () => image.stream(),
      };
      void addNativeCaptionImageV1(
        session.workspace,
        durable,
        caption.id,
        image.name,
        source,
        (message) => { captionImageStatus.textContent = message; },
      ).then((saved) => {
        durable = saved;
        working = saved;
        unsavedChanges.clear();
        viewer.setSnapshot(working);
        viewer.selectCaption(selectedCaptionId);
        populateCaptionFields();
        captionImageInput.value = '';
        captionImageStatus.className = 'ng-status ng-ok';
        captionImageStatus.textContent = '画像をキャプションへ添付して保存しました。';
      }).catch((error: unknown) => {
        captionImageStatus.className = 'ng-error';
        captionImageStatus.textContent = errorMessage(error);
      }).finally(() => {
        saving = false;
        updateAccess();
      });
    });
    collaborationMerge.addEventListener('click', () => {
      if (saving || session.accessState !== 'editable') return;
      if (unsavedChanges.isDirty) {
        collaborationStatus.className = 'ng-error';
        collaborationStatus.textContent = '先に現在の変更を保存してから統合してください。';
        return;
      }
      const packageFile = selectedFile(collaborationInput);
      if (packageFile === null) {
        collaborationStatus.className = 'ng-error';
        collaborationStatus.textContent = '共同編集用 .lociview を選択してください。';
        return;
      }
      saving = true;
      updateAccess();
      collaborationStatus.className = 'ng-status';
      collaborationStatus.textContent = 'packageを検証しています…';
      collaborationDetail.textContent = '';
      void mergeNativeCollaborationPackageV1(
        session.workspace,
        durable.project.id,
        packageFile,
        {
          onStatus(message) {
            collaborationStatus.textContent = '共同編集packageを検証・統合しています…';
            collaborationDetail.textContent = message;
          },
        },
      ).then((result) => {
        if (result.kind === 'conflict') {
          collaborationStatus.className = 'ng-error';
          collaborationStatus.textContent = `統合を中止しました（${result.conflicts.length}件）。このProjectは変更していません。`;
          collaborationDetail.textContent = result.conflicts.map((conflict) => conflict.message).join('\n');
          return;
        }
        if (result.kind === 'noop') {
          collaborationStatus.className = 'ng-status ng-ok';
          collaborationStatus.textContent = 'このpackageの変更はすでに反映済みです。新しい保存状態は作りませんでした。';
          collaborationDetail.textContent = '';
          return;
        }
        durable = result.snapshot;
        working = result.snapshot;
        unsavedChanges.clear();
        creatingCaption = false;
        captionMoveActive = false;
        if (!working.captions.some((caption) => caption.id === selectedCaptionId)) selectedCaptionId = null;
        viewer.setSnapshot(working);
        viewer.selectCaption(selectedCaptionId);
        rebuildCaptionList();
        populateCaptionFields();
        syncVisibilityControls();
        collaborationStatus.className = 'ng-status ng-ok';
        collaborationStatus.textContent = 'Caption変更と必要な新規画像を統合し、Projectへ保存しました。';
        collaborationDetail.textContent = `snapshot generation ${working.generation}`;
      }).catch((error: unknown) => {
        collaborationStatus.className = 'ng-error';
        collaborationStatus.textContent = '共同編集packageを統合できませんでした。このProjectは変更していません。';
        collaborationDetail.textContent = errorMessage(error);
      }).finally(() => {
        saving = false;
        updateAccess();
      });
    });
    save.addEventListener('click', () => {
      if (saving || session.accessState !== 'editable') return;
      saving = true;
      updateAccess();
      runtimeStatus.textContent = 'プロジェクトを保存しています…';
      void saveNativeProjectV1(session.workspace, working).then((saved) => {
        durable = saved;
        working = saved;
        unsavedChanges.clear();
        if (assetClosureChanged) viewer.setSnapshotAndReleaseAbsentResources(saved);
        else viewer.setSnapshot(saved);
        assetClosureChanged = false;
        creatingCaption = false;
        captionMoveActive = false;
        viewer.selectCaption(selectedCaptionId);
        syncAssetControlMembership();
        syncMaterialAssetOptions();
        syncMaterialControls();
        syncVisibilityControls();
        rebuildCaptionList();
        populateCaptionFields();
        populateTransform();
        rebuildSavedViewOptions();
        runtimeStatus.textContent = 'プロジェクトを保存しました。';
      }).catch((error: unknown) => {
        working = durable;
        assetClosureChanged = false;
        selectedCaptionId = durable.captions.some((caption) => caption.id === selectedCaptionId)
          ? selectedCaptionId
          : durable.captions[0]?.id ?? null;
        viewer.setSnapshot(durable);
        creatingCaption = false;
        captionMoveActive = false;
        viewer.selectCaption(selectedCaptionId);
        syncAssetControlMembership();
        syncMaterialAssetOptions();
        syncMaterialControls();
        syncVisibilityControls();
        rebuildCaptionList();
        selectedSavedViewId = durable.savedViews?.some((view) => view.id === selectedSavedViewId)
          ? selectedSavedViewId
          : durable.savedViews?.[0]?.id ?? null;
        rebuildSavedViewOptions();
        populateCaptionFields();
        populateTransform();
        unsavedChanges.clear();
        runtimeStatus.textContent = `保存できませんでした：${error instanceof Error ? error.message : String(error)}。最後に保存された状態へ戻しました。`;
      }).finally(() => {
        saving = false;
        updateAccess();
      });
    });
    let discardConfirmationInFlight = false;
    const confirmDiscard = async (action: '閉じる' | '再読み込み'): Promise<boolean> => {
      if (discardConfirmationInFlight) return false;
      discardConfirmationInFlight = true;
      try {
        return await unsavedChanges.confirmDiscard(() => confirmDialog(
          '未保存の変更があります',
          `保存していないプロジェクトの変更を破棄して${action}操作を続けますか？`,
        ));
      } finally {
        discardConfirmationInFlight = false;
      }
    };
    close.addEventListener('click', () => {
      void (async () => {
        if (!await confirmDiscard('閉じる')) return;
        unsavedChanges.clear();
        await renderHome();
      })();
    });
    reload.addEventListener('click', () => {
      void (async () => {
        if (!await confirmDiscard('再読み込み')) return;
        unsavedChanges.clear();
        location.reload();
      })();
    });
  };

  const summaries = await listNativeProjectsV1(fs);
  const initialRoute = resolveNativeInitialProjectRoute(
    window.location.search,
    new Set(summaries.map((summary) => summary.projectId)),
  );
  if (initialRoute.kind !== 'none') {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('project');
    cleanUrl.searchParams.delete('session');
    window.history.replaceState(null, '', cleanUrl);
  }
  if (initialRoute.kind === 'open') {
    await openProject(initialRoute.projectId, initialRoute.mode);
  } else {
    if (initialRoute.kind === 'invalid') homeNotice = initialRoute.message;
    await renderHome();
  }
}
