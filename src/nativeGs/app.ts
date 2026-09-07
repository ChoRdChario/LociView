import * as THREE from 'three';
import { disposeModelResources, loadModel, type ModelFormat } from '../viewer/loaders';
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
  appendEmptyNativeDisplaySetV1,
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
  renameNativeDisplaySetV1,
  setNativeDisplaySetDefaultSavedViewV1,
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
} from './schema';
import {
  activeNativeBindingV1,
  activeNativeRepresentationsV1,
  allActiveNativeRepresentationsV1,
  isNativeAssetVisibleV1,
  nativeCaptionNeedsReviewV1,
  summarizeNativeVisibleAssetReadinessV1,
} from './resolver';
import {
  addNativeAssetV1,
  addNativeCaptionImageV1,
  attachExistingNativeCaptionMediaV1,
  assertNativeProjectDoesNotMixV1,
  createNativeProjectV1,
  deleteNativeProjectV1,
  listNativeProjectsV1,
  nativeProjectRoot,
  openNativeProjectV1,
  readNativeRepresentationV1,
  readNativeMediaV1,
  removeNativeCaptionMediaV1,
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
  mountNativeCaptionWindowsV1,
  type NativeCaptionWindowsControllerV1,
} from './captionWindows';
import { NativeUnsavedChangesGuard } from './unsavedChanges';
import { resolveNativeInitialProjectRoute } from './initialRoute';
import './style.css';
import './workspaceUi.css';
import type { NativeHomeHost } from './homeUi';
import { createNativeUiDialog, mountNativeWorkspaceUi } from './workspaceUi';
import { NativePinColorFilter, nativePinColorKey } from './pinColorFilter';
import {
  NATIVE_STANDARD_BACKGROUND_HEX,
  nativeBackgroundFromHex,
  nativeBackgroundHex,
  normalizeNativeBackgroundHex,
} from './backgroundColor';
import { NativeCaptionSessionUiV1 } from './captionSessionUi';
import { resolveNativeDisplaySetUiSelectionV1 } from './displaySetUi';
import {
  buildNativeExportHandoffUrlV1,
  clearNativeExportHandoffV1,
  resolveNativeExportHandoffV1,
  type NativeExportIntentV1,
  type NativeExportPurposeV1,
} from './exportHandoff';
import {
  createNativeExportPreflightV1,
  sameNativeExportPreflightV1,
  type NativeExportPreflightV1,
} from './exportPreflight';
import { nativeChoiceLabelsByIdV1 } from './choiceLabels';
import {
  nativeCollaborationConflictMessageV1,
  nativeCollaborationOperationErrorMessageV1,
} from './collaborationUi';
import { nativeExportStagePathV1, newNativeExportAttemptTokenV1 } from './exportStaging';
import {
  nativeImportDisclosureV1,
  sameNativeImportInspectionV1,
  type NativeImportInspectionIdentityV1,
} from './importPreflight';

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

interface NativeProjectUiResumeV1 {
  readonly activeDisplaySetId: string;
  readonly selectedCaptionId: string | null;
  readonly selectedSavedViewId: string | null;
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

interface HomeModelFileInspection {
  readonly detected: string;
  readonly role: 'mesh' | 'gs';
}

type NonPlyModelFormat = Exclude<ModelFormat, 'ply'>;

const modelInspectionDecoder = new TextDecoder();

function isGlbHeader(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c &&
    bytes[2] === 0x54 && bytes[3] === 0x46;
}

function isPlyHeader(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x70 && bytes[1] === 0x6c && bytes[2] === 0x79 &&
    (bytes[3] === 0x0a || bytes[3] === 0x0d);
}

function rawModelCandidates(bytes: Uint8Array): NonPlyModelFormat[] {
  if (isGlbHeader(bytes)) return ['glb'];
  const candidates = new Set<NonPlyModelFormat>();
  if (bytes.byteLength >= 84) {
    const triangleCount = new DataView(bytes.buffer, bytes.byteOffset + 80, 4).getUint32(0, true);
    if (BigInt(bytes.byteLength) === 84n + 50n * BigInt(triangleCount)) return ['stl'];
  }
  const text = modelInspectionDecoder.decode(bytes);
  const trimmed = text.replace(/^\uFEFF/u, '').trimStart();
  if (trimmed.startsWith('{')) candidates.add('gltf');
  let objVertex = false;
  let objPrimitive = false;
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const directive = line.split(/\s+/u, 1)[0];
    if (directive === 'v') objVertex = true;
    if (directive === 'f' || directive === 'p') objPrimitive = true;
    if (objVertex && objPrimitive) break;
  }
  if (objVertex && objPrimitive) candidates.add('obj');
  if (/^\s*solid(?:\s|$)/u.test(text) &&
      /(?:^|\r?\n)\s*facet\s+normal\s+/u.test(text) &&
      /(?:^|\r?\n)\s*vertex\s+/u.test(text)) candidates.add('stl');
  return [...candidates];
}

async function validateRenderableModel(format: NonPlyModelFormat | 'ply', bytes: Uint8Array): Promise<boolean> {
  let loaded: Awaited<ReturnType<typeof loadModel>> | undefined;
  try {
    loaded = await loadModel(format, bytes, format === 'glb' || format === 'gltf'
      ? { gltfTextures: { kind: 'skip' } }
      : {});
    let containsLinePrimitive = false;
    loaded.root.traverse((object) => {
      if (object instanceof THREE.Line) containsLinePrimitive = true;
    });
    return !containsLinePrimitive && loaded.kind === 'mesh' && loaded.stats.triangles > 0;
  } catch {
    return false;
  } finally {
    if (loaded !== undefined) disposeModelResources(loaded.root);
  }
}

interface ValidatedModelFileInspection extends InspectedModelFile {
  readonly content: 'mesh' | 'point' | 'gs';
}

async function inspectValidatedModelFile(file: File): Promise<ValidatedModelFileInspection> {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 64 * 1024)).arrayBuffer());
  if (isPlyHeader(head)) {
    const gsInspection = await inspectNativeGsPlyV1(file);
    if (gsInspection.kind === 'supported-gs') return { format: 'ply', content: 'gs' };
    const pointInspection = await inspectNativePointPlyV1(file);
    if (pointInspection.kind === 'supported-point') {
      return { format: 'ply', content: 'point', pointPly: pointInspection.facts };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (await validateRenderableModel('ply', bytes)) return { format: 'ply', content: 'mesh' };
    throw new Error('PLYの内容を、対応する3Dモデル・通常点群・Gaussian Splattingとして確認できませんでした。');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid: NonPlyModelFormat[] = [];
  for (const candidate of rawModelCandidates(bytes)) {
    if (await validateRenderableModel(candidate, bytes)) valid.push(candidate);
  }
  if (valid.length === 0) {
    throw new Error('GLB／glTF／OBJ／STLとして内容を確認できませんでした。');
  }
  if (valid.length > 1) {
    throw new Error('複数のモデル形式として解釈できるため、自動では開きませんでした。');
  }
  return { format: valid[0]!, content: 'mesh' };
}

async function inspectModelFile(file: File, label: string, pointAllowed = true): Promise<InspectedModelFile> {
  const inspection = await inspectValidatedModelFile(file);
  if (inspection.content === 'gs') throw new Error(`${label}にGS PLYが選ばれています。GS欄へ指定してください。`);
  if (inspection.content === 'point' && !pointAllowed) {
    throw new Error(`${label}には三角形を持つ3Dモデルを指定してください。通常点群は補助面にできません。`);
  }
  return { format: inspection.format, ...(inspection.pointPly === undefined ? {} : { pointPly: inspection.pointPly }) };
}

async function inspectHomeModelFile(file: File): Promise<HomeModelFileInspection> {
  const inspection = await inspectValidatedModelFile(file);
  if (inspection.content === 'gs') return { detected: 'Gaussian Splatting（PLY）', role: 'gs' };
  if (inspection.content === 'point') return { detected: '通常点群（PLY）', role: 'mesh' };
  const labels: Readonly<Record<Exclude<ModelFormat, 'ply'>, string>> = {
    glb: '3Dモデル（GLB）',
    gltf: '3Dモデル（glTF）',
    obj: '3Dモデル（OBJ）',
    stl: '3Dモデル（STL）',
  };
  return {
    detected: inspection.format === 'ply' ? '3Dモデル（PLY）' : labels[inspection.format],
    role: 'mesh',
  };
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

function nativeExportLabels(purpose: NativeExportPurposeV1): {
  readonly noun: string;
  readonly description: string;
  readonly explanation: string;
} {
  if (purpose === 'backup') return {
    noun: '完全バックアップ',
    description: 'LociViewプロジェクトの完全バックアップ',
    explanation: 'このプロジェクト全体を、この端末へ戻せる保管用ファイルです。',
  };
  if (purpose === 'collaboration') return {
    noun: '共同編集用ファイル',
    description: 'LociView共同編集用ファイル',
    explanation: '同じプロジェクトから分けた相手のキャプション変更を、あとで取り込むためのファイルです。',
  };
  if (purpose === 'review') return {
    noun: '閲覧共有用ファイル',
    description: 'LociView閲覧共有用ファイル',
    explanation: '選んだ表示セットと、表示対象のモデル・キャプション・メディアを渡すファイルです。',
  };
  return {
    noun: '編集用コピー',
    description: 'LociView編集用コピー',
    explanation: 'プロジェクト全体を別のプロジェクトとして編集するファイルです。変更を元へ統合はできません。',
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '操作を中止しました。未完成のファイルやプロジェクトは保存されていません。';
  return error instanceof Error ? error.message : String(error);
}

export async function bootNativeGsApp(root: HTMLElement, homeHost?: NativeHomeHost): Promise<void> {
  if (homeHost !== undefined && !homeHost.isCurrent()) return;
  clear(root);
  root.className = 'ng-app';
  root.append(el('main', { class: 'ng-home' }, el('p', {}, 'プロジェクトの保存領域を準備しています…')));
  if (!(await OpfsFS.isAvailable())) {
    if (homeHost !== undefined && !homeHost.isCurrent()) return;
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
  const createGsOfflinePreparation = () => {
    const status = el('p', { class: 'ng-note', role: 'status' }, 'GSをオフラインで表示できるか確認しています…');
    const detail = el('p', { class: 'ng-note' });
    const prepare = el('button', { class: 'primary' }, 'GSのオフライン表示を準備');
    const element = el('section', { class: 'ng-card ng-gs-offline', hidden: true },
      el('h3', {}, 'GSをオフラインでも見る'),
      el('p', { class: 'ng-note' }, 'GS表示に必要なアプリ機能を、このブラウザと現在のLociViewのURL用に保存します。プロジェクトやモデルは保存せず、バックアップも作りません。'),
      status,
      prepare,
      el('details', {}, el('summary', {}, '詳しい情報'), detail),
    );
    let visible = false;

    const refresh = async (): Promise<void> => {
      const ready = await isNativeGsOfflineReady(await pwaRegistration);
      if (!visible) return;
      status.className = ready ? 'ng-note ng-ok' : 'ng-note ng-warn';
      status.textContent = ready
        ? 'このブラウザでは、GSをオフラインで利用できます。'
        : import.meta.env.DEV
          ? '開発用画面ではオフライン準備の完了を確認できません。'
          : 'このブラウザでは、GSをオフラインで表示する準備がまだ完了していません。';
      detail.textContent = ready
        ? '現在のブラウザとこのLociViewのURLで、GS表示機能の保存を確認済みです。'
        : '';
    };
    prepare.addEventListener('click', () => {
      setButtonDisabled(prepare, true);
      status.textContent = 'GS表示に必要な機能をこのブラウザへ保存し、確認しています…';
      void pwaRegistration.then((registration) => prepareNativeGsOffline(registration)).then((result) => {
        if (!visible) return;
        status.textContent = result.offlineReady
          ? 'GSをオフラインで利用する準備ができました。'
          : '準備を完了できませんでした。オンラインでページを再読み込みしてから、もう一度お試しください。';
        detail.textContent = result.detail;
        status.className = result.offlineReady ? 'ng-note ng-ok' : 'ng-note ng-warn';
      }).catch((error: unknown) => {
        if (!visible) return;
        status.textContent = 'GSのオフライン準備を完了できませんでした。詳しい情報を確認してください。';
        detail.textContent = error instanceof Error ? error.message : String(error);
        status.className = 'ng-error';
      }).finally(() => setButtonDisabled(prepare, false));
    });

    return {
      element,
      show() {
        const firstReveal = !visible;
        visible = true;
        element.hidden = false;
        if (firstReveal) void refresh();
      },
      hide() {
        visible = false;
        element.hidden = true;
      },
    };
  };
  let activeViewer: NativeGsViewer | null = null;
  let activeCaptionOverlay: NativeCaptionWindowsControllerV1 | null = null;
  let activeUnsavedChanges: NativeUnsavedChangesGuard | null = null;
  let activeSession: ProjectMutationSession | null = null;
  let unsubscribeAccess: (() => void) | null = null;
  let transitionInFlight = false;
  let homeIntakeInFlight = false;
  let homeHasPendingResult = (): boolean => false;
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
    if (homeHost !== undefined && !homeHost.isCurrent()) return;
    closeActive();
    if (homeHost === undefined) {
      window.location.assign(import.meta.env.BASE_URL);
      return;
    }
    clear(root);
    const title = el('input', { type: 'text', value: '新しいプロジェクト', maxlength: '160' });
    const modelInput = el('input', {
      type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply,application/octet-stream', multiple: 'true', hidden: 'true',
      'aria-label': '追加するモデルファイル',
    });
    const chooseModels = el('button', { type: 'button' }, '別の3Dモデルを追加');
    const proxy = el('input', {
      type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply',
      'aria-label': 'GSのキャプション配置用補助モデル',
    });
    const proxyField = el('label', { class: 'ng-field', hidden: 'true' },
      el('span', {}, 'キャプション配置用の補助モデル（GSのみ・任意）'), proxy,
      el('span', { class: 'ng-note' }, 'GSの表示だけなら不要です。表面にピンを置く場合は必要です。'),
    );
    const creationModelList = el('div', { class: 'ng-list' });
    const creationModelSummary = el('section', {
      class: 'ng-card ng-file-preflight', hidden: 'true', 'aria-label': '3Dモデル',
    },
      el('h3', {}, '3Dモデル'),
      creationModelList,
      el('p', { class: 'ng-note' }, 'プロジェクトを作成するまで保存されません。元ファイルは変更されません。'),
    );
    const creationModels = new Map<'mesh' | 'gs', HomeModelFileInspection & { readonly file: File }>();
    let intakePackageFile: File | null = null;
    const creationOfflineSlot = el('div', { class: 'ng-context-action' });
    const gsOffline = createGsOfflinePreparation();
    let updateGsOfflineContext = (): void => undefined;
    const creation = el('section', { class: 'ng-card ng-create', hidden: 'true' });
    const creationHeading = el('h2', { tabindex: '-1' }, '新しいプロジェクト');
    const createStatus = el('p', { class: 'ng-status', role: 'status', 'aria-live': 'polite' });
    const createDetail = el('p', { class: 'ng-note' });
    const create = el('button', { class: 'primary' }, '作成して編集');
    const cancelCreation = el('button', { type: 'button' }, 'キャンセル');
    const projectList = el('div', { class: 'ng-list' });
    let creationInteractionLocked = false;
    const creationRemoveButtons = new Set<HTMLButtonElement>();
    let creationPending = false;
    const creationPendingListeners = new Set<(pending: boolean) => void>();
    const setCreationPending = (pending: boolean): void => {
      creation.hidden = !pending;
      if (pending === creationPending) return;
      creationPending = pending;
      for (const listener of creationPendingListeners) listener(pending);
    };
    const renderCreationModels = (): void => {
      clear(creationModelList);
      creationRemoveButtons.clear();
      for (const role of ['mesh', 'gs'] as const) {
        const selection = creationModels.get(role);
        if (selection === undefined) continue;
        const remove = el('button', {
          type: 'button',
          'aria-label': `${selection.detected}を選択から外す`,
          onclick: () => {
            if (creationInteractionLocked) return;
            creationModels.delete(role);
            if (role === 'gs') proxy.value = '';
            if (creationModels.size === 0) {
              title.value = '新しいプロジェクト';
              createStatus.textContent = '';
              createDetail.textContent = '';
            }
            renderCreationModels();
            if (creationModels.size > 0) creationHeading.focus();
          },
        }, '外す');
        remove.disabled = creationInteractionLocked;
        creationRemoveButtons.add(remove);
        creationModelList.append(el('div', { class: 'ng-project-row' },
          el('strong', {}, selection.detected),
          el('span', { class: 'ng-note' }, selection.file.name),
          remove,
        ));
      }
      creationModelSummary.hidden = creationModels.size === 0;
      chooseModels.textContent = '別の3Dモデルを追加';
      chooseModels.disabled = creationInteractionLocked || creationModels.size >= 2;
      setButtonDisabled(create, creationInteractionLocked || creationModels.size === 0);
      const hasGs = creationModels.has('gs');
      proxyField.hidden = !hasGs;
      if (!hasGs) proxy.value = '';
      setCreationPending(creationModels.size > 0);
      updateGsOfflineContext();
    };
    const setCreationInteractionLocked = (locked: boolean): void => {
      creationInteractionLocked = locked;
      title.disabled = locked;
      modelInput.disabled = locked;
      chooseModels.disabled = locked || creationModels.size >= 2;
      proxy.disabled = locked;
      cancelCreation.disabled = locked;
      for (const remove of creationRemoveButtons) remove.disabled = locked;
      setButtonDisabled(create, locked || creationModels.size === 0);
    };
    const addCreationModels = async (files: readonly File[]): Promise<void> => {
      const additions: Array<HomeModelFileInspection & { readonly file: File }> = [];
      for (const file of files) additions.push({ ...await inspectHomeModelFile(file), file });
      const next = new Map(creationModels);
      for (const addition of additions) {
        if (next.has(addition.role)) {
          const label = addition.role === 'gs' ? 'Gaussian Splatting' : '3Dモデル／通常点群';
          throw new Error(`${label}は一つまで選べます。現在の選択を外してから、別のモデルを選んでください。`);
        }
        next.set(addition.role, addition);
      }
      if (homeHost !== undefined && !homeHost.isCurrent()) return;
      creationModels.clear();
      for (const [role, selection] of next) creationModels.set(role, selection);
      renderCreationModels();
    };
    chooseModels.addEventListener('click', () => {
      if (!creationInteractionLocked) modelInput.click();
    });
    modelInput.addEventListener('change', () => {
      const files = Array.from(modelInput.files ?? []);
      modelInput.value = '';
      if (files.length === 0) return;
      if (transitionInFlight || homeIntakeInFlight || homeHasPendingResult()) {
        createStatus.className = 'ng-error';
        createStatus.textContent = '別の処理が終わってからモデルを選んでください。';
        return;
      }
      transitionInFlight = true;
      setCreationInteractionLocked(true);
      createStatus.className = 'ng-status';
      createStatus.textContent = '3Dモデルを確認しています…';
      createDetail.textContent = '';
      let modelAdded = false;
      void addCreationModels(files).then(() => {
        createStatus.textContent = '';
        modelAdded = true;
      }).catch((error: unknown) => {
        createStatus.className = 'ng-error';
        createStatus.textContent = '3Dモデルを追加できませんでした。選択内容は変更されていません。';
        createDetail.textContent = error instanceof Error ? error.message : String(error);
      }).finally(() => {
        transitionInFlight = false;
        setCreationInteractionLocked(false);
        if (modelAdded) create.focus();
      });
    });
    cancelCreation.addEventListener('click', () => {
      if (creationInteractionLocked) return;
      creationModels.clear();
      modelInput.value = '';
      proxy.value = '';
      title.value = '新しいプロジェクト';
      createStatus.textContent = '';
      createDetail.textContent = '';
      renderCreationModels();
    });
    // iOS Files may classify a custom .lociview extension as an unknown UTI and
    // hide it when an accept filter is present. Selection is only a UI hint;
    // the strict package/version/path/size/hash checks below are authoritative.
    const restoreInput = el('input', { type: 'file' });
    const restore = el('button', { class: 'primary' }, 'LociViewファイルを読み込む');
    const cancelPortable = el('button', { disabled: 'true', hidden: 'true' }, '処理を中止');
    const portableStatus = el('p', { class: 'ng-status' }, homeNotice ?? '');
    const portableDetail = el('p', { class: 'ng-note' });
    const portableResult = el('div', { class: 'ng-row' });
    const importPreflightPanel = el('section', { class: 'ng-card ng-import-preflight', hidden: true });
    const exportPreflightPanel = el('section', { class: 'ng-card ng-export-preflight', hidden: true });
    let pendingImport: {
      readonly file: File;
      readonly identity: NativeImportInspectionIdentityV1;
      readonly projectTitle: string;
      readonly assetCount: number;
      readonly captionCount: number;
      readonly mediaCount: number;
      readonly hasGs: boolean;
      readonly sameProjectExists: boolean;
    } | null = null;
    let pendingExport: {
      readonly summary: NativeProjectSummary;
      readonly intent: NativeExportIntentV1;
      readonly preflight: NativeExportPreflightV1;
    } | null = null;
    let projectChoiceLabels: ReadonlyMap<string, string> = new Map();
    let importPreflightConfirm: HTMLButtonElement | null = null;
    let importPreflightCancel: HTMLButtonElement | null = null;
    let exportPreflightConfirm: HTMLButtonElement | null = null;
    let exportPreflightCancel: HTMLButtonElement | null = null;
    homeHasPendingResult = () => pendingImport !== null || pendingExport !== null || portableResult.childElementCount > 0;
    const restoreSourceName = el('p', { class: 'ng-note' });
    restore.textContent = '同じファイルで再試行';
    restore.hidden = true;
    let portableAbort: AbortController | null = null;
    let portableCancellationAllowed = false;
    homeNotice = null;

    const setPortableBusy = (busy: boolean): void => {
      restore.disabled = busy;
      cancelPortable.disabled = !busy || !portableCancellationAllowed;
      cancelPortable.hidden = !busy || !portableCancellationAllowed;
      if (importPreflightConfirm !== null) importPreflightConfirm.disabled = busy;
      if (importPreflightCancel !== null) importPreflightCancel.disabled = busy;
      if (exportPreflightConfirm !== null) exportPreflightConfirm.disabled = busy;
      if (exportPreflightCancel !== null) {
        exportPreflightCancel.disabled = busy && !portableCancellationAllowed;
        exportPreflightCancel.textContent = busy ? '書き出しを中止' : '中止';
      }
    };
    cancelPortable.addEventListener('click', () => {
      if (portableCancellationAllowed) {
        portableAbort?.abort(new DOMException('User cancelled portable operation', 'AbortError'));
      }
    });

    create.addEventListener('click', () => {
      if (transitionInFlight || homeIntakeInFlight || homeHasPendingResult()) return;
      transitionInFlight = true;
      setCreationInteractionLocked(true);
      const selectedTitle = title.value;
      const selectedFiles: SelectedFiles = {
        mesh: creationModels.get('mesh')?.file ?? null,
        gs: creationModels.get('gs')?.file ?? null,
        proxy: selectedFile(proxy),
      };
      createStatus.className = 'ng-status';
      createStatus.textContent = '選んだファイルを確認しています…';
      createDetail.textContent = '';
      void (async () => {
        const built = await buildDraft(selectedTitle, selectedFiles);
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
          if (homeHost !== undefined) {
            session.release();
            homeHost.openProject(snapshot.project.id, 'edit');
          } else {
            activeSession = session;
            await renderProject(snapshot, session);
          }
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
        setCreationInteractionLocked(false);
      });
    });

    const inspectIncomingNativePackage = async (packageFile: File, signal: AbortSignal) => {
      const containerKind = await detectNativePackageContainerKindV1(packageFile, signal);
      if (containerKind === 'backup') {
        return {
          purpose: 'backup' as const,
          inspection: await inspectNativePortablePackageV1(packageFile, signal),
        };
      }
      const inspection = await inspectNativeExchangePackageV1(packageFile, signal);
      return { purpose: inspection.manifest.purpose, inspection };
    };
    const importInspectionIdentity = (
      inspected: Awaited<ReturnType<typeof inspectIncomingNativePackage>>,
    ): NativeImportInspectionIdentityV1 => ({
      purpose: inspected.purpose,
      projectId: inspected.inspection.snapshot.project.id,
      snapshotId: inspected.inspection.snapshot.snapshotId,
      generation: inspected.inspection.snapshot.generation,
      manifestIdentity: JSON.stringify(inspected.inspection.manifest),
      representationByteLength: inspected.inspection.representationByteLength,
      mediaByteLength: inspected.inspection.mediaByteLength,
    });
    const renderImportPreflight = (): void => {
      clear(importPreflightPanel);
      importPreflightConfirm = null;
      importPreflightCancel = null;
      if (pendingImport === null) {
        importPreflightPanel.hidden = true;
        creationOfflineSlot.append(gsOffline.element);
        updateGsOfflineContext();
        return;
      }
      const selected = pendingImport;
      const disclosure = nativeImportDisclosureV1(selected.identity.purpose, selected.sameProjectExists);
      const confirm = el('button', { class: 'primary' }, disclosure.confirmLabel);
      const cancel = el('button', {}, 'キャンセル');
      importPreflightConfirm = confirm;
      importPreflightCancel = cancel;
      confirm.addEventListener('click', () => {
        if (pendingImport !== selected || transitionInFlight) return;
        if (disclosure.action === 'open-existing') {
          pendingImport = null;
          intakePackageFile = null;
          restoreSourceName.textContent = '';
          renderImportPreflight();
          portableStatus.className = 'ng-status';
          portableStatus.textContent = '既存プロジェクトを編集で開きます。開いた後、「共同編集の変更を受け取る」を選んでください。';
          void openProject(selected.identity.projectId, 'edit');
          return;
        }
        beginNativePackageRestore(selected);
      });
      cancel.addEventListener('click', () => {
        if (pendingImport !== selected || transitionInFlight) return;
        pendingImport = null;
        intakePackageFile = null;
        restoreSourceName.textContent = '';
        restore.hidden = true;
        renderImportPreflight();
        portableStatus.className = 'ng-status';
        portableStatus.textContent = 'ファイルを開くのを中止しました。この端末には保存していません。';
        portableDetail.textContent = '';
      });
      importPreflightPanel.append(
        el('h2', {}, 'ファイルを確認しました'),
        el('p', {}, `検出した内容：${disclosure.detected}`),
        el('p', {}, `プロジェクト：${selected.projectTitle}`),
        el('p', {}, `この後行うこと：${disclosure.nextAction}`),
        el('p', {}, `開き方：${disclosure.openingMode}`),
        el('p', {}, `元ファイル：${disclosure.sourceTreatment}`),
        el('p', { class: 'ng-note' }, `モデル ${selected.assetCount}件・キャプション ${selected.captionCount}件・メディア ${selected.mediaCount}件`),
      );
      if (selected.hasGs) {
        importPreflightPanel.append(gsOffline.element);
        gsOffline.show();
      } else {
        creationOfflineSlot.append(gsOffline.element);
        updateGsOfflineContext();
      }
      importPreflightPanel.append(el('div', { class: 'ng-row' }, confirm, cancel));
      importPreflightPanel.hidden = false;
      setPortableBusy(transitionInFlight);
      importPreflightPanel.scrollIntoView?.({ block: 'nearest' });
      confirm.focus();
    };
    const beginNativePackageRestore = (selected: NonNullable<typeof pendingImport>): void => {
      if (pendingImport !== selected || transitionInFlight || homeIntakeInFlight) return;
      pendingImport = null;
      renderImportPreflight();
      transitionInFlight = true;
      portableAbort = new AbortController();
      portableCancellationAllowed = true;
      setPortableBusy(true);
      portableStatus.className = 'ng-status';
      portableStatus.textContent = '確認したファイルをもう一度検査しています…';
      portableDetail.textContent = '';
      void (async () => {
        const signal = portableAbort!.signal;
        const current = await inspectIncomingNativePackage(selected.file, signal);
        if (!sameNativeImportInspectionV1(selected.identity, importInspectionIdentity(current))) {
          throw new Error('確認後にファイルの内容または目的が変わりました。復元は開始していません。もう一度ファイルを選んでください。');
        }
        const inspection = current.inspection;
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
        if (current.purpose === 'collaboration') {
          const currentProjects = await listNativeProjectsV1(fs);
          if (currentProjects.some((project) => project.projectId === projectId)) {
            throw new Error('同じプロジェクトがこの端末に作成されました。このファイルは復元していません。対象プロジェクトを編集で開き、共同編集の変更を取り込んでください。');
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
          if (current.purpose === 'backup') {
            const restored = await restoreNativePortablePackageV1(session.workspace, fs, selected.file, {
              signal,
              onStatus(message) {
                portableStatus.textContent = '完全バックアップからプロジェクトを復元しています…';
                portableDetail.textContent = message;
              },
            });
            homeNotice = `「${restored.snapshot.project.title}」を完全バックアップからこの端末へ復元しました。`;
          } else {
            const restored = await restoreNativeExchangePackageV1(session.workspace, fs, selected.file, {
              signal,
              onStatus(message) {
                portableStatus.textContent = 'LociViewファイルからプロジェクトを復元しています…';
                portableDetail.textContent = message;
              },
            });
            openMode = nativeExchangeDefaultOpenModeV1(restored.purpose);
            const purposeLabel = restored.purpose === 'review'
              ? '閲覧共有用ファイル'
              : restored.purpose === 'cleanCopy' ? '編集用コピー' : '共同編集用ファイル';
            homeNotice = `「${restored.snapshot.project.title}」を${purposeLabel}からこの端末へ復元しました。`;
          }
        } finally {
          unsubscribeRestore();
          session.release();
        }
        intakePackageFile = null;
        restoreSourceName.textContent = '';
        restore.hidden = true;
        if (openMode === null) {
          await renderHome();
        } else {
          transitionInFlight = false;
          await openProject(projectId, openMode);
        }
      })().catch((error: unknown) => {
        restore.hidden = false;
        portableStatus.className = 'ng-error';
        portableStatus.textContent = 'LociViewファイルを読み込めませんでした。別のファイルを選ぶか、詳しい情報を確認してください。';
        portableDetail.textContent = errorMessage(error);
      }).finally(() => {
        portableAbort = null;
        portableCancellationAllowed = false;
        transitionInFlight = false;
        setPortableBusy(false);
      });
    };
    restore.addEventListener('click', () => {
      if (transitionInFlight || homeIntakeInFlight || homeHasPendingResult()) return;
      const packageFile = intakePackageFile ?? selectedFile(restoreInput);
      if (packageFile === null) {
        portableStatus.className = 'ng-error';
        portableStatus.textContent = '読み込むLociViewファイルを選択してください。';
        return;
      }
      transitionInFlight = true;
      portableAbort = new AbortController();
      portableCancellationAllowed = true;
      restore.hidden = true;
      setPortableBusy(true);
      clear(portableResult);
      portableStatus.className = 'ng-status';
      portableStatus.textContent = 'ファイルの形式と開き方を確認しています…';
      portableDetail.textContent = '';
      void (async () => {
        const inspected = await inspectIncomingNativePackage(packageFile, portableAbort!.signal);
        const currentProjects = await listNativeProjectsV1(fs);
        pendingImport = {
          file: packageFile,
          identity: importInspectionIdentity(inspected),
          projectTitle: inspected.inspection.snapshot.project.title,
          assetCount: inspected.inspection.snapshot.assets.length,
          captionCount: inspected.inspection.snapshot.captions.length,
          mediaCount: inspected.inspection.snapshot.mediaResources?.length ?? 0,
          hasGs: allActiveNativeRepresentationsV1(inspected.inspection.snapshot).some((representation) => (
            representation.role === 'gsPrimary'
          )),
          sameProjectExists: currentProjects.some((project) => project.projectId === inspected.inspection.snapshot.project.id),
        };
        portableStatus.className = 'ng-status ng-ok';
        portableStatus.textContent = '内容を確認しました。次に行うことを確認してください。';
        renderImportPreflight();
      })().catch((error: unknown) => {
        restore.hidden = false;
        portableStatus.className = error instanceof DOMException && error.name === 'AbortError' ? 'ng-status' : 'ng-error';
        portableStatus.textContent = error instanceof DOMException && error.name === 'AbortError'
          ? 'ファイルの確認を中止しました。この端末には保存していません。'
          : 'LociViewファイルを確認できませんでした。別のファイルを選ぶか、詳しい情報を確認してください。';
        portableDetail.textContent = error instanceof DOMException && error.name === 'AbortError' ? '' : errorMessage(error);
      }).finally(() => {
        portableAbort = null;
        portableCancellationAllowed = false;
        transitionInFlight = false;
        setPortableBusy(false);
      });
    });

    const renderExportPreflight = (): void => {
      clear(exportPreflightPanel);
      exportPreflightConfirm = null;
      exportPreflightCancel = null;
      if (pendingExport === null) {
        exportPreflightPanel.hidden = true;
        return;
      }
      const { intent, preflight } = pendingExport;
      const labels = nativeExportLabels(intent.purpose);
      const confirm = el('button', { class: 'primary' }, '保存先を選んで書き出す');
      const cancel = el('button', {}, '中止');
      exportPreflightConfirm = confirm;
      exportPreflightCancel = cancel;
      confirm.addEventListener('click', () => {
        if (pendingExport !== null) beginPackageExport(pendingExport);
      });
      cancel.addEventListener('click', () => {
        if (transitionInFlight) {
          if (portableCancellationAllowed) {
            portableAbort?.abort(new DOMException('User cancelled package export', 'AbortError'));
          }
          return;
        }
        pendingExport = null;
        renderExportPreflight();
        portableStatus.className = 'ng-status';
        portableStatus.textContent = '書き出しを中止しました。プロジェクトは変更していません。';
        portableDetail.textContent = '';
      });
      exportPreflightPanel.append(
        el('h2', {}, '書き出す内容を確認'),
        el('p', {}, `${projectChoiceLabels.get(preflight.projectId) ?? preflight.projectTitle} — ${labels.noun}`),
        el('p', { class: 'ng-note' }, labels.explanation),
        ...(preflight.reviewDisplaySetLabel === null ? [] : [
          el('p', {}, `表示セット：${preflight.reviewDisplaySetLabel}`),
        ]),
        el('dl', { class: 'ng-export-counts' },
          el('div', {}, el('dt', {}, 'モデル'), el('dd', {}, `${preflight.assetCount}件`)),
          el('div', {}, el('dt', {}, 'キャプション'), el('dd', {}, `${preflight.captionCount}件`)),
          el('div', {}, el('dt', {}, 'メディア'), el('dd', {}, `${preflight.mediaCount}件`)),
        ),
        el('p', { class: 'ng-note' }, '検索、ピン色の絞り込み、比較ウィンドウ、現在だけのカメラ操作は含みません。'),
        el('div', { class: 'ng-row' }, confirm, cancel),
      );
      exportPreflightPanel.hidden = false;
      setPortableBusy(transitionInFlight);
      exportPreflightPanel.scrollIntoView({ block: 'nearest' });
    };

    const showExportPreflight = async (
      summary: NativeProjectSummary,
      intent: NativeExportIntentV1,
    ): Promise<void> => {
      if (transitionInFlight || homeIntakeInFlight || portableResult.childElementCount > 0) return;
      transitionInFlight = true;
      portableStatus.className = 'ng-status';
      portableStatus.textContent = '書き出す内容を確認しています…';
      portableDetail.textContent = '';
      try {
        const durable = await openNativeProjectV1(fs, summary.projectId);
        const preflight = createNativeExportPreflightV1(durable.snapshot, intent);
        pendingExport = { summary: { ...summary, title: durable.snapshot.project.title }, intent, preflight };
        renderExportPreflight();
        portableStatus.className = 'ng-status ng-ok';
        portableStatus.textContent = '対象と件数を確認し、保存先を選んでください。';
      } catch (error) {
        pendingExport = null;
        renderExportPreflight();
        portableStatus.className = 'ng-error';
        portableStatus.textContent = '書き出す内容を確認できませんでした。プロジェクトは変更していません。';
        portableDetail.textContent = intent.purpose === 'collaboration'
          ? nativeCollaborationOperationErrorMessageV1(error)
          : errorMessage(error);
      } finally {
        transitionInFlight = false;
        setPortableBusy(false);
      }
    };

    const beginPackageExport = (
      request: NonNullable<typeof pendingExport>,
    ): void => {
      const { summary, intent, preflight } = request;
      const purpose = intent.purpose;
      if (transitionInFlight || homeIntakeInFlight) return;
      if (portableResult.childElementCount > 0) {
        portableStatus.className = 'ng-error';
        portableStatus.textContent = '先に作成済みのファイルを保存し、「この端末の一時ファイルを削除」で片付けてください。';
        return;
      }
      const labels = nativeExportLabels(purpose);
      const suggestedName = nativePackageFileName(summary.title, purpose);
      const exportAttemptToken = newNativeExportAttemptTokenV1();
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
      portableCancellationAllowed = true;
      setPortableBusy(true);
      clear(portableResult);
      portableStatus.className = 'ng-status';
      portableStatus.textContent = '保存先を確認しています…';
      portableDetail.textContent = '';
      let selectedDestinationCommitted = false;
      let directDestinationSelected = false;
      let cleanupFailure: unknown = null;
      let cleanupRetryPath: string | null = null;
      const offerStagedCleanupRetry = (): void => {
        if (cleanupRetryPath === null) return;
        const path = cleanupRetryPath;
        const retry = el('button', {}, '一時ファイルの削除を再試行');
        retry.addEventListener('click', () => {
          if (transitionInFlight) return;
          transitionInFlight = true;
          retry.disabled = true;
          void fs.remove(path).then(() => {
            cleanupRetryPath = null;
            clear(portableResult);
            portableStatus.className = 'ng-status';
            portableStatus.textContent = 'この端末の未完成な一時ファイルを削除しました。同じ対象で再試行できます。';
          }).catch((cleanupError: unknown) => {
            portableStatus.className = 'ng-error';
            portableStatus.textContent = '一時ファイルを削除できませんでした。もう一度試すか、ページを開き直して端末の空き容量を確認してください。';
            portableDetail.textContent = errorMessage(cleanupError);
            retry.disabled = false;
          }).finally(() => { transitionInFlight = false; });
        });
        clear(portableResult);
        portableResult.append(retry);
      };
      void (async () => {
        const signal = portableAbort!.signal;
        const handle = await destinationHandle;
        directDestinationSelected = handle !== null;
        signal.throwIfAborted();
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
          signal.throwIfAborted();
          session.activateAfterDurableReload();
          unsubscribeExport = session.subscribeAccess((state) => {
            if (state !== 'editable') portableAbort?.abort(new Error(session.accessDetail));
          });
          const refreshedPreflight = createNativeExportPreflightV1(durable.snapshot, intent);
          if (!sameNativeExportPreflightV1(preflight, refreshedPreflight)) {
            pendingExport = {
              summary: { ...summary, title: durable.snapshot.project.title }, intent, preflight: refreshedPreflight,
            };
            renderExportPreflight();
            portableStatus.className = 'ng-warn';
            portableStatus.textContent = '確認後に保存済み内容が変わりました。更新した件数を確認し、もう一度「保存先を選んで書き出す」を押してください。';
            portableDetail.textContent = '古い確認内容では書き出していません。選択した保存先にもデータを書いていません。';
            return;
          }
          if (handle !== null) {
            signal.throwIfAborted();
            portableStatus.textContent = `選択したファイルへ${labels.noun}を書き出しています…`;
            const writable = await handle.createWritable();
            destination = writable as unknown as WritableStream<Uint8Array>;
          } else {
            signal.throwIfAborted();
            const binaryBytes = refreshedPreflight.representationByteLength + refreshedPreflight.mediaByteLength;
            const estimate = await navigator.storage.estimate?.();
            const required = binaryBytes + 32 * 1024 * 1024;
            if (
              estimate?.quota !== undefined && estimate.usage !== undefined &&
              Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
              estimate.quota - estimate.usage < required
            ) {
              throw new Error(`ダウンロード準備用の保存容量が不足しています（データ ${fmtBytes(binaryBytes)}）。`);
            }
            stagedPath = nativeExportStagePathV1(
              summary.projectId, durable.snapshot.snapshotId, purpose, exportAttemptToken,
            );
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
                ? 'このブラウザではメモリ使用量を取得できません'
                : `観測したメモリ使用量の最大値 ${fmtBytes(exported.metrics.jsHeapPeakBytes)}`,
            };
          } else {
            const exported = await exportNativeExchangePackageV1(
              session.workspace,
              summary.projectId,
              purpose,
              destination,
              {
                signal,
                ...(intent.purpose === 'review' ? { reviewDisplaySetId: intent.reviewDisplaySetId } : {}),
                onStatus(message) {
                  portableStatus.textContent = `${labels.noun}を書き出しています…`;
                  portableDetail.textContent = message;
                },
              },
            );
            metrics = { ...exported.metrics, memoryDetail: '大きなモデルやメディアを少しずつ処理' };
          }
          if (handle !== null) {
            selectedDestinationCommitted = true;
            portableCancellationAllowed = false;
            setPortableBusy(true);
            portableStatus.textContent = `保存した${labels.noun}を確認しています。この確認は中断できません…`;
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
            throw new Error('完成した .lociview の容量またはSHA-256が、保存後の再確認結果と一致しません。');
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
          portableDetail.textContent = `ファイル ${fmtBytes(metrics.packageByteLength)}、一度に処理した最大量 ${fmtBytes(metrics.maxApplicationChunkBytes)}、${metrics.memoryDetail}`;
          pendingExport = null;
          renderExportPreflight();
        } catch (error) {
          try {
            await destination?.abort(error);
          } catch (abortError) {
            if (directDestinationSelected) cleanupFailure = abortError;
          }
          await stagedWrite?.catch(() => {});
          if (stagedPath !== null) {
            try {
              await fs.remove(stagedPath);
            } catch (removeError) {
              const remaining = await fs.readStream(stagedPath).catch(() => undefined);
              if (remaining !== null) {
                cleanupFailure = removeError;
                cleanupRetryPath = stagedPath;
              }
            }
          }
          throw error;
        } finally {
          unsubscribeExport?.();
          session.release();
        }
      })().catch((error: unknown) => {
        const operationReason = intent.purpose === 'collaboration'
          ? nativeCollaborationOperationErrorMessageV1(error)
          : errorMessage(error);
        if (selectedDestinationCommitted) {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = `${labels.noun}は選択した保存先へ書き込まれましたが、完成確認に失敗しました。`;
          portableDetail.textContent = `そのファイルは使用せず、保存先で削除または次の成功時に上書きしてください。再試行できます。理由：${operationReason}`;
          return;
        }
        if (cleanupFailure !== null) {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = `${labels.noun}の処理は完了せず、未完成なファイルの片付けも確認できませんでした。`;
          portableDetail.textContent = directDestinationSelected
            ? `選択した保存先に未完成なファイルが残っている可能性があります。使用せず、保存先で削除してください。処理理由：${operationReason}／片付け理由：${errorMessage(cleanupFailure)}`
            : `この端末の一時ファイルが残っている可能性があります。下の削除を再試行してください。処理理由：${operationReason}／片付け理由：${errorMessage(cleanupFailure)}`;
          offerStagedCleanupRetry();
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          portableStatus.className = 'ng-status';
          portableStatus.textContent = `${labels.noun}の保存を中止しました。`;
          portableDetail.textContent = '保存先や一時領域へ未完成ファイルは残していません。同じ対象で再試行できます。';
          return;
        }
        portableStatus.className = 'ng-error';
        portableStatus.textContent = `${labels.noun}を作成できませんでした。未完成なファイルを、完成したLociViewファイルとして扱っていません。`;
        portableDetail.textContent = operationReason;
      }).finally(() => {
        portableAbort = null;
        portableCancellationAllowed = false;
        transitionInFlight = false;
        setPortableBusy(false);
      });
    };

    const summaries = await listNativeProjectsV1(fs);
    projectChoiceLabels = nativeChoiceLabelsByIdV1(summaries.map((summary) => ({
      id: summary.projectId, name: summary.title,
    })));
    const exportHandoff = resolveNativeExportHandoffV1(
      window.location.search,
      new Set(summaries.map((summary) => summary.projectId)),
    );
    if (exportHandoff.kind !== 'none') {
      const cleanUrl = clearNativeExportHandoffV1(new URL(window.location.href));
      window.history.replaceState(null, '', cleanUrl);
    }
    if (summaries.length === 0) projectList.append(el('p', { class: 'ng-note' }, 'この端末に保存されたプロジェクトはありません。'));
    for (const summary of summaries) {
      const view = el('button', {}, '閲覧のみで開く');
      const edit = el('button', { class: 'primary' }, '編集して開く');
      const backup = el('button', {}, 'バックアップを書き出す');
      const collaborationExport = el('button', {}, '共同編集用を書き出す');
      const reviewExport = el('button', { disabled: 'true' }, '閲覧共有用を書き出す');
      const cleanCopyExport = el('button', {}, '編集用コピーを書き出す');
      const reviewDisplaySet = el('select', { 'aria-label': '閲覧共有に含める表示セット', disabled: 'true' });
      reviewDisplaySet.append(el('option', { value: '' }, '表示セットを読み込んでいます…'));
      const exchangeDisclosure = el('details', { class: 'ng-package-actions' },
        el('summary', {}, '共有・コピー…'),
        el('p', { class: 'ng-note' }, '目的を選ぶと、書き出すモデル・キャプション・メディアの件数を先に確認できます。'),
        el('div', { class: 'ng-row' }, collaborationExport, cleanCopyExport),
        el('label', { class: 'ng-field' }, el('span', {}, '閲覧共有する表示セット'), reviewDisplaySet),
        reviewExport,
      );
      const remove = el('button', {}, 'この端末から削除');
      view.addEventListener('click', () => void openProject(summary.projectId, 'view'));
      edit.addEventListener('click', () => void openProject(summary.projectId, 'edit'));
      collaborationExport.addEventListener('click', () => void showExportPreflight(summary, {
        projectId: summary.projectId, purpose: 'collaboration',
      }));
      cleanCopyExport.addEventListener('click', () => void showExportPreflight(summary, {
        projectId: summary.projectId, purpose: 'cleanCopy',
      }));
      backup.addEventListener('click', () => void showExportPreflight(summary, {
        projectId: summary.projectId, purpose: 'backup',
      }));
      reviewExport.addEventListener('click', () => {
        if (reviewDisplaySet.value === '') {
          portableStatus.className = 'ng-error';
          portableStatus.textContent = '閲覧共有に含める表示セットを選んでください。';
          return;
        }
        void showExportPreflight(summary, {
          projectId: summary.projectId, purpose: 'review', reviewDisplaySetId: reviewDisplaySet.value,
        });
      });
      void openNativeProjectV1(fs, summary.projectId).then((opened) => {
        clear(reviewDisplaySet);
        const sets = nativeDisplaySetsV1(opened.snapshot);
        const labels = nativeChoiceLabelsByIdV1(sets);
        for (const displaySet of sets) {
          reviewDisplaySet.append(el('option', { value: displaySet.id }, labels.get(displaySet.id) ?? displaySet.name));
        }
        reviewDisplaySet.value = opened.snapshot.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
        reviewDisplaySet.disabled = false;
        reviewExport.disabled = false;
      }).catch(() => {
        clear(reviewDisplaySet);
        reviewDisplaySet.append(el('option', { value: '' }, '表示セットを読み込めません'));
        reviewDisplaySet.disabled = true;
        reviewExport.disabled = true;
      });
      remove.addEventListener('click', () => {
        if (transitionInFlight || homeIntakeInFlight || homeHasPendingResult() || !window.confirm(`「${summary.title}」をこの端末から削除します。必要な場合は先にバックアップを保存してください。`)) return;
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
        el('strong', {}, projectChoiceLabels.get(summary.projectId) ?? summary.title),
        el('div', { class: 'ng-row' }, edit, view),
        el('details', {}, el('summary', {}, 'ファイル・共有…'), backup, exchangeDisclosure,
          el('details', {}, el('summary', {}, '管理'), remove)),
      ));
    }

    creation.append(
        creationHeading,
        creationModelSummary,
        el('label', { class: 'ng-field' }, el('span', {}, 'プロジェクト名'), title),
        el('div', { class: 'ng-row' }, chooseModels, modelInput),
        proxyField,
        creationOfflineSlot,
        el('div', { class: 'ng-row' }, create, cancelCreation),
        createStatus,
        el('details', {}, el('summary', {}, '詳しい情報'), createDetail),
    );
    updateGsOfflineContext = () => {
      if (pendingImport?.hasGs === true) return;
      creationOfflineSlot.append(gsOffline.element);
      const hasSelectedGs = creationModels.has('gs');
      if (hasSelectedGs) gsOffline.show();
      else gsOffline.hide();
    };
    updateGsOfflineContext();
    const transfer = el('section', { class: 'ng-transfer', 'aria-label': 'ファイル処理の結果' },
      importPreflightPanel, exportPreflightPanel, portableStatus, restoreSourceName, portableResult, el('div', { class: 'ng-row' }, restore, cancelPortable),
      el('details', {}, el('summary', {}, '処理の詳細'), portableDetail),
    );
    homeHost.mount(root, {
      projects: projectList, creation, transfer,
      onCreationPendingChange(listener) {
        creationPendingListeners.add(listener);
        listener(creationPending);
        return () => { creationPendingListeners.delete(listener); };
      },
      get busy() { return transitionInFlight || homeIntakeInFlight || homeHasPendingResult(); },
      beginIntake() {
        if (transitionInFlight || homeIntakeInFlight || homeHasPendingResult()) return null;
        homeIntakeInFlight = true;
        let released = false;
        return () => { if (!released) { released = true; homeIntakeInFlight = false; } };
      },
      async acceptModelFile(file) {
        if (transitionInFlight || homeIntakeInFlight || homeHasPendingResult()) return;
        const revealingCreation = creationModels.size === 0;
        transitionInFlight = true;
        setCreationInteractionLocked(true);
        createStatus.className = 'ng-status';
        createStatus.textContent = '3Dモデルを確認しています…';
        createDetail.textContent = '';
        let modelAdded = false;
        try {
          await addCreationModels([file]);
          createStatus.textContent = '';
          creation.scrollIntoView?.({ block: 'nearest' });
          modelAdded = true;
        } catch (error) {
          createStatus.className = 'ng-error';
          createStatus.textContent = '3Dモデルを追加できませんでした。選択内容は変更されていません。';
          createDetail.textContent = error instanceof Error ? error.message : String(error);
          throw error;
        } finally {
          transitionInFlight = false;
          setCreationInteractionLocked(false);
          if (modelAdded) (revealingCreation ? creationHeading : create).focus();
        }
      },
      acceptPackageFile(file) {
        if (transitionInFlight || homeIntakeInFlight || homeHasPendingResult()) return;
        intakePackageFile = file;
        restoreSourceName.textContent = file.name;
        restore.hidden = false;
        restore.click();
      },
    });
    if (exportHandoff.kind === 'invalid') {
      portableStatus.className = 'ng-error';
      portableStatus.textContent = exportHandoff.message;
      portableDetail.textContent = '書き出しは開始していません。プロジェクト一覧から対象と目的を選び直してください。';
    } else if (exportHandoff.kind === 'ready') {
      const summary = summaries.find((candidate) => candidate.projectId === exportHandoff.intent.projectId);
      if (summary !== undefined) await showExportPreflight(summary, exportHandoff.intent);
    }
  };

  const openProject = async (projectId: string, mode: 'view' | 'edit'): Promise<void> => {
    if (transitionInFlight || homeIntakeInFlight || homeHasPendingResult()) return;
    if (homeHost !== undefined) {
      homeHost.openProject(projectId, mode);
      return;
    }
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

  const renderProject = async (
    initial: NativeProjectSnapshotV1,
    session: ProjectMutationSession,
    captionSessionUi = new NativeCaptionSessionUiV1(),
    resume?: NativeProjectUiResumeV1,
  ): Promise<void> => {
    activeCaptionOverlay?.dispose();
    activeCaptionOverlay = null;
    clear(root);
    let durable = initial;
    let working = initial;
    const workspaceGsOffline = createGsOfflinePreparation();
    const updateWorkspaceGsOffline = (): void => {
      if (allActiveNativeRepresentationsV1(working).some((representation) => representation.role === 'gsPrimary')) {
        workspaceGsOffline.show();
      } else {
        workspaceGsOffline.hide();
      }
    };
    updateWorkspaceGsOffline();
    const requestedDisplaySetId = resume?.activeDisplaySetId
      ?? initial.presentation.activeDisplaySetId
      ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
    const requestedCaptionId = resume === undefined
      ? initial.captions.find((caption) => nativeCaptionDisplaySetIdV1(caption) === requestedDisplaySetId)?.id ?? null
      : resume.selectedCaptionId;
    const initialUiSelection = resolveNativeDisplaySetUiSelectionV1(
      initial,
      requestedDisplaySetId,
      requestedCaptionId,
      resume?.selectedSavedViewId ?? initial.savedViews?.[0]?.id ?? null,
    );
    let activeDisplaySetIdValue = initialUiSelection.displaySetId;
    let saving = false;
    activeUnsavedChanges?.dispose();
    const unsavedChanges = new NativeUnsavedChangesGuard(window);
    activeUnsavedChanges = unsavedChanges;
    let selectedCaptionId = initialUiSelection.captionId;
    let captionMoveActive = false;
    let creatingCaption = false;
    let captionBeforeCreationId: string | null = null;
    let captionDeleteConfirmationInFlight = false;
    let assetDeleteConfirmationInFlight = false;
    let assetClosureChanged = false;
    let selectedSavedViewId = initialUiSelection.savedViewId;
    const pinColors = new NativePinColorFilter();
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
    const save = el('button', { class: 'primary' }, '端末に保存');
    const saveState = el('span', { class: 'ng-save-state', role: 'status' });
    const unload = el('button', {}, 'GSを解放');
    const close = el('button', {}, '一覧');
    const fileMenu = el('button', {}, 'ファイル・共有…');
    const helpMenu = el('button', {}, 'ヘルプ');
    const reload = el('button', {}, '再読み込み');
    const workspaceExportPurpose = el('select', { 'aria-label': '書き出す目的' },
      el('option', { value: 'backup' }, '完全なバックアップ'),
      el('option', { value: 'collaboration' }, '共同編集用'),
      el('option', { value: 'review' }, '閲覧共有用'),
      el('option', { value: 'cleanCopy' }, '編集用コピー'),
    );
    const workspaceReviewDisplaySet = el('select', { 'aria-label': '閲覧共有に含める表示セット' });
    const workspaceReviewField = el('label', { class: 'ng-field', hidden: 'true' },
      el('span', {}, '共有する表示セット'), workspaceReviewDisplaySet,
    );
    const workspaceExportDescription = el('p', { class: 'ng-note' });
    const workspaceExportStatus = el('p', { class: 'ng-status', role: 'status' });
    const workspaceExportContinue = el('button', { class: 'primary' }, '書き出し内容を確認');
    const workspaceExportSave = el('button', { class: 'primary' }, '保存して続ける');
    const workspaceExportDiscard = el('button', { class: 'danger' }, '変更を破棄して続ける');
    const workspaceExportCancel = el('button', {}, '中止');
    let workspaceExportAttempt = 0;
    const workspaceExportCleanActions = el('div', { class: 'ng-row' }, workspaceExportContinue);
    const workspaceExportDirtyActions = el('div', { class: 'ng-row', hidden: 'true' },
      workspaceExportSave, workspaceExportDiscard, workspaceExportCancel,
    );
    const openSharingHelp = el('button', {}, '保存と共有の説明');
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
    const modelContext = el('p', { class: 'ng-note' });
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
      el('span', { class: 'ng-note' }, '現在の画面だけに反映します。プロジェクトには保存しません。'),
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
    const newCaption = el('button', { class: 'primary', 'aria-label': 'キャプションを追加' }, '＋ 追加');
    const newCaptionColor = el('input', {
      type: 'color', value: captionSessionUi.authoringColor(activeDisplaySetIdValue),
      'aria-label': '新しいキャプションのピン色',
    });
    const showNewCaptionColor = el('button', {}, '表示');
    const newCaptionColorHidden = el('div', { class: 'ng-row ng-color-hidden', hidden: true },
      el('span', {}, 'この色のピンは絞り込みで非表示'), showNewCaptionColor);
    const captionTitle = el('input', { type: 'text', maxlength: '160' });
    const captionBody = el('textarea');
    const captionColor = el('input', { type: 'color', value: '#eab308', 'aria-label': 'キャプションピンの色' });
    const captionGuide = el('p', { class: 'ng-note' });
    const captionReview = el('p', { class: 'ng-note' });
    const revealPinColor = el('button', {}, '表示');
    const colorHidden = el('div', { class: 'ng-row ng-color-hidden', hidden: true },
      el('span', {}, '色で非表示'), revealPinColor);
    const modeText = el('span');
    const finishPosition = el('button', {}, '終了');
    const positionMode = el('div', { class: 'ng-position-mode', hidden: true }, modeText, finishPosition);
    const moveCaption = el('button', { 'aria-pressed': 'false' }, 'ピンを移動');
    const repositionCaption = el('button', {}, '表面へ置き直す');
    const deleteCaption = el('button', { class: 'danger' }, '削除');
    const captionSection = el('section', { class: 'ng-card ng-caption-card' });
    const captionDetail = el('div', { class: 'ng-caption-detail' });
    const captionSelection = el('p', { class: 'ng-selection-context' });
    const captionPane = el('div', { class: 'ng-caption-pane-switch', 'aria-label': 'キャプションの表示' });
    const captionListPane = el('button', { 'aria-pressed': 'true' }, '一覧');
    const captionDetailPane = el('button', { 'aria-pressed': 'false' }, '内容');
    captionPane.append(captionListPane, captionDetailPane);
    let captionListScroll = 0;
    const showCaptionPane = (pane: 'list' | 'detail'): void => {
      if (captionSection.dataset.pane !== 'detail') captionListScroll = captionList.scrollTop;
      captionSection.dataset.pane = pane;
      captionListPane.setAttribute('aria-pressed', String(pane === 'list'));
      captionDetailPane.setAttribute('aria-pressed', String(pane === 'detail'));
      if (pane === 'list') captionList.scrollTop = captionListScroll;
    };
    captionListPane.addEventListener('click', () => showCaptionPane('list'));
    captionDetailPane.addEventListener('click', () => showCaptionPane('detail'));
    const savedViewSelect = el('select', { 'aria-label': '保存した視点' });
    const savedViewName = el('input', { type: 'text', maxlength: '160', value: '' });
    const captureSavedView = el('button', {
      class: 'primary', 'aria-describedby': 'ng-background-status',
    }, '視点を登録');
    const overwriteSavedView = el('button', {
      'aria-describedby': 'ng-background-status',
    }, '現在の視点で更新');
    const applySavedView = el('button', {}, '表示');
    const makeDefaultSavedView = el('button', {}, '切替時の視点にする');
    const deleteSavedView = el('button', {}, '削除');
    const orthographic = el('input', { type: 'checkbox' });
    const backgroundColor = el('input', {
      type: 'color', value: NATIVE_STANDARD_BACKGROUND_HEX, 'aria-label': '3D背景色',
    });
    const backgroundHexInput = el('input', {
      type: 'text', value: NATIVE_STANDARD_BACKGROUND_HEX, maxlength: '7', spellcheck: 'false',
      inputmode: 'text', 'aria-label': '3D背景色のHEX値', 'aria-describedby': 'ng-background-status',
    });
    const standardBackground = el('button', {}, '標準色');
    const backgroundStatus = el('p', { id: 'ng-background-status', class: 'ng-note', role: 'status' });
    let backgroundHexDraftValid = true;
    const fitView = el('button', {}, '全体表示');
    const fitQuick = el('button', {}, '全体表示');
    const quickOrthographic = el('input', { type: 'checkbox' });
    const quickSavedView = el('select', { 'aria-label': '呼び出す視点' });
    const quickApplyView = el('button', {}, '表示');
    const axes = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
    const axisButtons = new Map(axes.map((axis) => [axis, el('button', {}, axis.toUpperCase())]));
    const savedViewSection = el('section', { class: 'ng-card' });
    const displaySetSelect = el('select', { 'aria-label': '表示セット' });
    const manageDisplaySets = el('button', {
      class: 'ng-icon-button', 'aria-label': '表示セットを管理', title: '表示セットを管理',
    }, '…');
    const createDisplaySetName = el('input', {
      type: 'text', maxlength: '160', autocomplete: 'off', placeholder: '新しい表示セット名',
      'aria-label': '新しい表示セット名',
    });
    const createDisplaySet = el('button', { class: 'primary' }, '新しく作る');
    const renameDisplaySetName = el('input', {
      type: 'text', maxlength: '160', autocomplete: 'off', 'aria-label': '現在の表示セット名',
    });
    const renameDisplaySet = el('button', {}, '名前を変更');
    const currentDisplaySetChoice = el('p', { class: 'ng-selection-context' });
    const displaySetStatus = el('p', { class: 'ng-note', role: 'status' });
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
    const projectMedia = el('div', { class: 'ng-list ng-project-media', 'aria-label': 'このプロジェクトのメディア' });
    const projectMediaSource = el('details', {},
      el('summary', {}, 'このプロジェクトから'),
      el('p', { class: 'ng-note' }, '同じプロジェクトに取り込み済みのメディアを、正確な項目を選んで再利用します。名前から同じものとは推測しません。'),
      projectMedia,
    );
    const captionImageInput = el('input', {
      type: 'file',
      accept: 'image/png,image/jpeg,image/webp,image/gif',
    });
    const addCaptionImage = el('button', {}, '添付して保存');
    const captionImageStatus = el('p', { class: 'ng-note' });
    const projectMediaGuidance = el('p', { id: 'ng-project-media-guidance', class: 'ng-note' });
    const projectMediaStatus = el('p', { id: 'ng-project-media-status', class: 'ng-note', role: 'status' });
    const collaborationInput = el('input', { type: 'file' });
    const collaborationMerge = el('button', { class: 'primary' }, '共同編集の変更を取り込む');
    const collaborationStatus = el('p', { class: 'ng-note' });
    const collaborationDetail = el('p', { class: 'ng-note' });
    let captionMediaGeneration = 0;
    const captionMediaUrls = new Set<string>();
    let captionMediaRenderSignature = '';
    let thumbnailLoadChain = Promise.resolve();

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
      visibilityRows.set(asset.id, el('label', { class: 'ng-asset-visibility' }, checkbox, el('strong', {}, asset.label), el('span', { class: 'ng-note' }, role)));
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
    const displaySetChoiceLabel = (displaySetId: string): string => {
      const sets = displaySets();
      const displaySet = sets.find((candidate) => candidate.id === displaySetId);
      return displaySet === undefined
        ? '選択中の表示セット'
        : nativeChoiceLabelsByIdV1(sets).get(displaySet.id) ?? displaySet.name;
    };
    const savedViews = (): readonly NativeSavedViewV1[] => (working.savedViews ?? [])
      .filter((view) => nativeSavedViewDisplaySetIdV1(view) === activeDisplaySetId());
    const savedViewChoiceLabel = (savedViewId: string): string => {
      const views = savedViews();
      const view = views.find((candidate) => candidate.id === savedViewId);
      return view === undefined
        ? '選択中の視点'
        : nativeChoiceLabelsByIdV1(views).get(view.id) ?? view.name;
    };
    const selectedSavedView = (): NativeSavedViewV1 | undefined => selectedSavedViewId === null
      ? undefined
      : savedViews().find((view) => view.id === selectedSavedViewId);
    const rebuildDisplaySetOptions = (): void => {
      clear(displaySetSelect);
      const sets = displaySets();
      const labels = nativeChoiceLabelsByIdV1(sets);
      for (const displaySet of sets) {
        displaySetSelect.append(el(
          'option', { value: displaySet.id }, labels.get(displaySet.id) ?? displaySet.name,
        ));
      }
      displaySetSelect.value = activeDisplaySetId();
      currentDisplaySetChoice.textContent = `対象：${displaySetChoiceLabel(activeDisplaySetId())}`;
      renameDisplaySetName.value = displaySets().find((displaySet) => displaySet.id === activeDisplaySetId())?.name ?? '';
    };
    const rebuildSavedViewOptions = (): void => {
      clear(savedViewSelect);
      const defaultSavedViewId = displaySets().find((displaySet) => (
        displaySet.id === activeDisplaySetId()
      ))?.defaultSavedViewId ?? null;
      if (savedViews().length === 0) {
        savedViewSelect.append(el('option', { value: '' }, '保存した視点はありません'));
        selectedSavedViewId = null;
        savedViewName.value = '';
      } else {
        if (!savedViews().some((view) => view.id === selectedSavedViewId)) selectedSavedViewId = savedViews()[0]!.id;
        const views = savedViews();
        const labels = nativeChoiceLabelsByIdV1(views);
        for (const view of views) {
          savedViewSelect.append(el('option', { value: view.id }, (
            view.id === defaultSavedViewId
              ? `${labels.get(view.id) ?? view.name}（切替時）`
              : labels.get(view.id) ?? view.name
          )));
        }
        savedViewSelect.value = selectedSavedViewId ?? '';
        savedViewName.value = selectedSavedView()?.name ?? '';
      }
    };
    const rebuildCaptionList = (): void => {
      const scrollTop = captionList.scrollTop;
      const focusedId = (document.activeElement as HTMLElement | null)?.dataset.captionId;
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
        const attachmentCount = caption.attachmentMediaIds?.length ?? 0;
        const swatch = el('span', { class: 'ng-list-pin-color', 'aria-hidden': 'true' });
        swatch.style.backgroundColor = nativePinColorKey(caption.color);
        const button = el(
          'button',
          {
            class: 'ng-caption-row',
            'aria-current': String(caption.id === selectedCaptionId),
            'aria-label': `${review}${caption.title || '無題'}。添付メディア${attachmentCount}件。${caption.anchor === null ? '未配置' : owner?.label ?? '所属モデル不明'}`,
            'data-caption-id': caption.id,
          },
          swatch, el('strong', {}, `${review}${caption.title || '（無題）'}`),
          ...(attachmentCount === 0 ? [] : [el('span', {
            class: 'ng-attachment-count', 'aria-hidden': 'true', title: `添付メディア ${attachmentCount}件`,
          }, `▣ ${attachmentCount}`)]),
          el('span', { class: 'ng-note' }, caption.anchor === null ? '未配置' : owner?.label ?? '所属モデル不明'),
        );
        button.addEventListener('click', () => {
          creatingCaption = false;
          selectedCaptionId = caption.id;
          captionSessionUi.bringToFront(caption.id);
          captionMoveActive = false;
          activeViewer?.selectCaption(caption.id);
          rebuildCaptionList();
          populateCaptionFields();
          showCaptionPane('detail');
          updateAccess();
          runtimeStatus.className = 'ng-status';
          runtimeStatus.textContent = `キャプションを選択しました：${caption.title || '（無題）'}`;
        });
        captionList.append(button);
        if (focusedId === caption.id) button.focus({ preventScroll: true });
      }
      captionList.scrollTop = scrollTop;
    };
    const revealCaptionRow = (): void => {
      if (captionList.clientHeight === 0) return;
      const row = [...captionList.children].find((element) => (element as HTMLElement).dataset.captionId === selectedCaptionId) as HTMLElement | undefined;
      if (row === undefined) return;
      if (row.offsetTop < captionList.scrollTop) captionList.scrollTop = row.offsetTop;
      else if (row.offsetTop + row.offsetHeight > captionList.scrollTop + captionList.clientHeight) {
        captionList.scrollTop = row.offsetTop + row.offsetHeight - captionList.clientHeight;
      }
    };
    const queueMediaThumbnail = (
      image: HTMLImageElement,
      mediaId: string,
      mediaType: string,
      generation: number,
      status: HTMLElement,
      retry: HTMLButtonElement,
    ): void => {
      image.hidden = true;
      status.hidden = false;
      status.textContent = '一覧画像を読み込んでいます…';
      retry.hidden = true;
      retry.disabled = true;
      const showFailure = (message: string): void => {
        if (generation !== captionMediaGeneration || !image.isConnected) return;
        image.hidden = true;
        status.hidden = false;
        status.textContent = message;
        retry.hidden = false;
        retry.disabled = false;
      };
      thumbnailLoadChain = thumbnailLoadChain.then(async () => {
        if (generation !== captionMediaGeneration || !image.isConnected) return;
        const source = await readNativeMediaV1(fs, working.project.id, mediaId);
        if (source === null) throw new Error('端末内のメディアを読み込めません。');
        const blob = await new Response(source.stream(), { headers: { 'Content-Type': mediaType } }).blob();
        if (generation !== captionMediaGeneration || !image.isConnected) return;
        const url = URL.createObjectURL(blob);
        captionMediaUrls.add(url);
        const release = (): void => {
          if (!captionMediaUrls.delete(url)) return;
          URL.revokeObjectURL(url);
        };
        image.addEventListener('load', () => {
          release();
          if (generation !== captionMediaGeneration || !image.isConnected) return;
          status.hidden = true;
          retry.hidden = true;
        }, { once: true });
        image.addEventListener('error', () => {
          release();
          showFailure('この画像形式の一覧表示に失敗しました。');
        }, { once: true });
        image.hidden = false;
        image.src = url;
      }).catch((error: unknown) => {
        showFailure(`一覧画像を読み込めませんでした：${errorMessage(error)}`);
      });
    };
    const populateCaptionFields = (): void => {
      const caption = selectedCaption();
      const captionId = caption?.id ?? null;
      captionDetail.hidden = caption === undefined;
      captionDetailPane.disabled = caption === undefined;
      const owner = working.assets.find((asset) => asset.id === (caption === undefined ? null : nativeCaptionOwnerAssetIdV1(caption)));
      captionSelection.textContent = caption === undefined ? ''
        : `${caption.title || '（無題）'} · ${owner?.label ?? '所属未設定'}${caption.anchor === null ? ' · 未配置' : ''}${owner !== undefined && !isNativeAssetVisibleV1(working, owner.id) ? ' · モデル非表示' : ''}`;
      if (caption === undefined) showCaptionPane('list');
      captionTitle.value = caption?.title ?? '';
      captionBody.value = caption?.body ?? '';
      captionColor.value = caption?.color ?? '#eab308';
      const needsReview = caption !== undefined && nativeCaptionNeedsReviewV1(working, caption);
      captionGuide.textContent = caption === undefined
        ? creatingCaption
          ? '配置先モデルを選び、PCは画面上でShift＋クリック、iPhoneは長押ししてください。配置が決まるまでデータは作成されません。'
          : '追加するか、一覧・3D上のピンを選んでください。'
        : '位置調整後も、端末への保存が必要です。';
      captionReview.className = needsReview ? 'ng-error' : 'ng-note';
      captionReview.textContent = caption === undefined
        ? ''
        : needsReview
          ? 'このキャプションはモデル差し替え前の表面位置です。位置は保持されていますが、現在のモデル上で再配置すると確認済みに戻ります。'
          : '現在のモデル表面に対応しています。';
      const nextMediaSignature = JSON.stringify([
        captionId,
        caption?.attachmentMediaIds ?? [],
        (working.mediaResources ?? []).map((media) => [media.id, media.label, media.blob.mediaType]),
      ]);
      if (nextMediaSignature === captionMediaRenderSignature) return;
      captionMediaRenderSignature = nextMediaSignature;
      const generation = ++captionMediaGeneration;
      for (const url of captionMediaUrls) URL.revokeObjectURL(url);
      captionMediaUrls.clear();
      clear(captionMedia);
      clear(projectMedia);
      projectMediaStatus.textContent = '';
      for (const mediaId of caption?.attachmentMediaIds ?? []) {
        const media = (working.mediaResources ?? []).find((candidate) => candidate.id === mediaId);
        if (media === undefined) continue;
        const open = el('button', {}, '見る');
        open.addEventListener('click', () => activeCaptionOverlay?.openMedia(captionId, media.id));
        const menu = el('details', { class: 'ng-media-item-menu' },
          el('summary', { 'aria-label': `${media.label}の操作` }, '…'),
          el('p', { class: 'ng-note' }, '元のメディア、他のキャプション、完全バックアップからは削除しません。'),
          el('button', { class: 'danger', 'data-caption-media-mutation': 'true' }, 'このキャプションから外す'),
        );
        (menu.querySelector('button') as HTMLButtonElement).addEventListener('click', () => {
          void removeCaptionMediaReference(captionId!, media.id, media.label);
        });
        captionMedia.append(el('div', { class: 'ng-media-item' },
          el('span', { class: 'ng-media-name' }, media.label), open, menu,
        ));
      }
      const allMedia = working.mediaResources ?? [];
      if (allMedia.length === 0) {
        projectMedia.append(el('p', { class: 'ng-note' }, 'このプロジェクトに再利用できるメディアはありません。'));
      }
      for (const media of allMedia) {
        const thumbnail = el('img', { class: 'ng-media-thumbnail', alt: '', hidden: 'true' }) as HTMLImageElement;
        const thumbnailStatus = el('span', { class: 'ng-media-thumbnail-status' }, '一覧画像を読み込んでいます…');
        const retryThumbnail = el('button', { class: 'ng-media-thumbnail-retry', hidden: 'true' }, '再試行');
        retryThumbnail.addEventListener('click', () => {
          queueMediaThumbnail(
            thumbnail, media.id, media.blob.mediaType, generation, thumbnailStatus, retryThumbnail,
          );
        });
        if (projectMediaSource.open) {
          queueMediaThumbnail(
            thumbnail, media.id, media.blob.mediaType, generation, thumbnailStatus, retryThumbnail,
          );
        } else {
          thumbnailStatus.textContent = '開くと一覧画像を読み込みます';
        }
        const view = el('button', {}, '見る');
        view.addEventListener('click', () => activeCaptionOverlay?.openMedia(null, media.id));
        const attached = caption?.attachmentMediaIds?.includes(media.id) ?? false;
        const attach = el('button', {
          'data-caption-media-mutation': 'true', 'data-media-attached': String(attached),
        }, attached ? '添付済み' : '添付して保存');
        attach.disabled = attached;
        attach.addEventListener('click', () => {
          if (captionId !== null) void attachProjectMediaReference(captionId, media.id, media.label);
        });
        projectMedia.append(el('div', { class: 'ng-project-media-item' },
          el('div', { class: 'ng-media-thumbnail-cell' }, thumbnail, thumbnailStatus, retryThumbnail),
          el('span', { class: 'ng-media-name' }, media.label),
          view,
          attach,
        ));
      }
    };
    projectMediaSource.addEventListener('toggle', () => {
      captionMediaRenderSignature = '';
      populateCaptionFields();
      updateAccess();
    });
    const commitSelectedCaption = (caption: NativeProjectSnapshotV1['captions'][number]): boolean => {
      try {
        const previous = selectedCaption();
        const previousNeedsReview = previous === undefined ? false : nativeCaptionNeedsReviewV1(working, previous);
        const wasNew = selectedCaptionId === null;
        working = updateSelectedNativeCaptionV1(working, selectedCaptionId, caption);
        selectedCaptionId ??= caption.id;
        const nextNeedsReview = nativeCaptionNeedsReviewV1(working, caption);
        if (
          wasNew || previous?.title !== caption.title || previous?.color !== caption.color ||
          JSON.stringify(previous?.attachmentMediaIds ?? []) !== JSON.stringify(caption.attachmentMediaIds ?? []) ||
          previousNeedsReview !== nextNeedsReview ||
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
      const repositioning = activeViewer?.isCaptionRepositioning() ?? false;
      const positionTarget = activeViewer?.getPositionEditingTarget();
      if (activeViewer !== null) captionMoveActive = positionTarget?.kind === 'caption';
      positionMode.hidden = !creatingCaption && !repositioning && positionTarget == null;
      modeText.textContent = creatingCaption ? 'ピン追加：表面をShift＋クリック／長押し'
        : repositioning ? '置き直し：表面をShift＋クリック／長押し'
          : positionTarget?.kind === 'asset'
            ? `モデル調整：${working.assets.find((asset) => asset.id === positionTarget.assetId)?.label ?? ''}`
            : 'ピンの位置調整';
      finishPosition.textContent = creatingCaption || repositioning ? '中止' : '終了';
      finishPosition.disabled = saving;
      repositionCaption.textContent = repositioning ? '置き直しを中止' : '置き直す';
      refreshPinColors();
      saveState.textContent = saving ? '保存中…' : unsavedChanges.isDirty ? '未保存' : '保存済み';
      saveState.dataset.dirty = String(unsavedChanges.isDirty);
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
      save.title = saving ? '保存処理中です' : !editable ? session.accessDetail : !unsavedChanges.isDirty ? '未保存の変更はありません' : '変更をこの端末へ保存';
      applyTransformButton.disabled = !editable;
      pointDiameter.disabled = saving || pointAppearance.hidden;
      for (const button of assetGizmoButtons.values()) button.disabled = !editable;
      captionTitle.disabled = !editable || !captionFieldsEditable;
      captionBody.disabled = !editable || !captionFieldsEditable;
      captionColor.disabled = !editable || !captionFieldsEditable;
      captionImageInput.disabled = !editable || !captionFieldsEditable || unsavedChanges.isDirty;
      addCaptionImage.disabled = !editable || !captionFieldsEditable || unsavedChanges.isDirty;
      const mediaMutationReason = unsavedChanges.isDirty
        ? '先に「端末に保存」で未保存の変更を確定してください。'
        : !editable
          ? session.accessDetail
          : !captionFieldsEditable
            ? caption === undefined ? '先にキャプションを選んでください。' : '所属モデルを表示してから操作してください。'
            : '';
      projectMediaGuidance.className = mediaMutationReason === '' ? 'ng-note' : 'ng-warn';
      projectMediaGuidance.textContent = mediaMutationReason;
      for (const button of captionDetail.querySelectorAll<HTMLButtonElement>('[data-caption-media-mutation="true"]')) {
        button.disabled = !editable || !captionFieldsEditable || unsavedChanges.isDirty || button.dataset.mediaAttached === 'true';
        const reason = button.dataset.mediaAttached === 'true' ? 'このキャプションには添付済みです。' : mediaMutationReason;
        button.title = reason;
        if (mediaMutationReason === '' || button.dataset.mediaAttached === 'true') button.removeAttribute('aria-describedby');
        else button.setAttribute('aria-describedby', 'ng-project-media-guidance');
      }
      addCaptionImage.title = unsavedChanges.isDirty ? '先に「端末に保存」で変更を確定してください' : !editable ? session.accessDetail : '';
      pinScaleNumber.disabled = !editable;
      pinScaleSlider.disabled = !editable;
      newCaption.disabled = !editable;
      newCaptionColor.disabled = !editable;
      newCaption.textContent = creatingCaption ? '追加を中止' : '＋ 追加';
      newCaption.setAttribute('aria-label', creatingCaption ? 'キャプション追加を中止' : 'キャプションを追加');
      newCaption.setAttribute('aria-pressed', String(creatingCaption));
      moveCaption.disabled = !editable || caption?.anchor === null || caption === undefined || !captionVisible;
      moveCaption.textContent = captionMoveActive ? '移動を終了' : '位置調整';
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
      captureSavedView.disabled = !editable || !backgroundHexDraftValid;
      captureSavedView.title = backgroundHexDraftValid ? '' : '背景色のHEX入力を直してから視点を登録してください';
      overwriteSavedView.disabled = !editable || selectedSavedView() === undefined || !backgroundHexDraftValid;
      overwriteSavedView.title = backgroundHexDraftValid ? '' : '背景色のHEX入力を直してから視点を更新してください';
      const defaultSavedViewId = displaySets().find((displaySet) => (
        displaySet.id === activeDisplaySetId()
      ))?.defaultSavedViewId ?? null;
      makeDefaultSavedView.disabled = !editable || selectedSavedView() === undefined || selectedSavedViewId === defaultSavedViewId;
      deleteSavedView.disabled = !editable || selectedSavedView() === undefined;
      applySavedView.disabled = saving || selectedSavedView() === undefined;
      savedViewSelect.disabled = saving || savedViews().length === 0;
      savedViewName.disabled = !editable;
      orthographic.disabled = saving;
      backgroundColor.disabled = saving;
      backgroundHexInput.disabled = saving;
      standardBackground.disabled = saving;
      fitView.disabled = saving;
      fitQuick.disabled = saving;
      quickOrthographic.disabled = saving;
      quickSavedView.disabled = saving || savedViews().length === 0;
      quickApplyView.disabled = saving || savedViews().length === 0;
      for (const button of axisButtons.values()) button.disabled = saving;
      close.disabled = saving;
      fileMenu.disabled = saving;
      manageDisplaySets.disabled = !editable;
      createDisplaySetName.disabled = !editable;
      createDisplaySet.disabled = !editable;
      renameDisplaySetName.disabled = !editable;
      renameDisplaySet.disabled = !editable;
      reload.disabled = saving;
      collaborationInput.disabled = !editable || unsavedChanges.isDirty;
      collaborationMerge.disabled = !editable || unsavedChanges.isDirty;
      collaborationMerge.title = unsavedChanges.isDirty ? '先に「端末に保存」で変更を確定してください' : !editable ? session.accessDetail : '';
      activeViewer?.setEditingEnabled(editable);
      refreshWorkspaceExportControls();
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
      const reps = activeNativeRepresentationsV1(working, transformAsset.value);
      modelContext.textContent = reps.some((rep) => rep.role === 'gsPrimary')
        ? reps.some((rep) => rep.role === 'interactionProxy')
          ? 'GS：ピン配置用の補助面を登録済みです。利用可否は読込状態によります。'
          : 'GS：ピン配置用の補助面がありません。表示・モデル配置はできます。'
        : reps.some((rep) => rep.role === 'pointPrimary') ? '通常点群：点の大きさは現在の表示だけに反映します。' : '';
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

    captionDetail.append(
      captionSelection,
      colorHidden,
      el('label', { class: 'ng-field' }, el('span', {}, 'タイトル'), captionTitle),
      el('label', { class: 'ng-field' }, el('span', {}, '本文'), captionBody),
      el('label', { class: 'ng-field' }, el('span', {}, 'ピンの色'), captionColor),
      el('h3', {}, '添付メディア'),
      captionMedia,
      el('details', { class: 'ng-media-add' },
        el('summary', {}, 'メディアを追加'),
        el('details', {}, el('summary', {}, 'ファイルから'),
          el('label', { class: 'ng-field' }, el('span', {}, '画像（PNG／JPEG／WebP／GIF）'), captionImageInput),
          el('p', { class: 'ng-note' }, '添付前にプロジェクトを保存してください。添付は直ちに端末へ保存します。'),
          el('details', {}, el('summary', {}, 'HEIC／HEIFの画像を使うには'), el('p', { class: 'ng-note' },
          'HEIC／HEIFは、端末上で別のJPEGとして書き出してから選んでください。iPhoneでは「プレビュー」の「書き出す」または「ショートカット」の画像変換を利用できます。元の写真は変更されません。')),
          addCaptionImage,
          captionImageStatus,
        ),
        projectMediaSource,
      ),
      projectMediaGuidance,
      projectMediaStatus,
      captionReview,
      el('details', {}, el('summary', {}, 'その他'), deleteCaption),
    );
    const captionActions = el('div', { class: 'ng-caption-actions' },
      el('div', { class: 'ng-caption-add-settings' },
        el('label', { class: 'ng-field' }, el('span', {}, '追加先モデル'), target),
        el('label', { class: 'ng-field ng-new-caption-color' }, el('span', {}, '追加色'), newCaptionColor),
      ),
      newCaptionColorHidden,
      el('div', { class: 'ng-row' }, newCaption, moveCaption, repositionCaption),
      captionGuide,
    );
    const colorFilterBar = el('div', { class: 'ng-pin-colors', 'aria-label': '色で3Dピンを絞り込む' });
    const colorChoices = el('div', { class: 'ng-color-choices' });
    const allColors = el('button', {}, '全色');
    colorFilterBar.append(colorChoices, allColors);
    const colorButtons = new Map<string, HTMLButtonElement>();
    let appliedColorFilter = '';
    const refreshPinColors = (): void => {
      const setId = activeDisplaySetId();
      const colors = [...new Set(working.captions.filter((caption) => nativeCaptionDisplaySetIdV1(caption) === setId)
        .map((caption) => nativePinColorKey(caption.color)))];
      for (const [color, button] of colorButtons) {
        if (colors.includes(color)) continue;
        button.remove(); colorButtons.delete(color);
      }
      for (const color of colors) {
        let button = colorButtons.get(color);
        if (button === undefined) {
          const disc = el('span', { class: 'ng-color-disc', 'aria-hidden': 'true' }, el('span', {}, '✓'));
          disc.style.setProperty('--pin-color', color);
          button = el('button', { class: 'ng-color-circle', 'aria-label': `${color}のピンを表示`, title: `${color}のピン` }, disc);
          button.addEventListener('click', () => {
            const available = working.captions.filter((caption) => nativeCaptionDisplaySetIdV1(caption) === activeDisplaySetId())
              .map((caption) => nativePinColorKey(caption.color));
            pinColors.toggle(activeDisplaySetId(), color, available);
            refreshPinColors();
          });
          colorButtons.set(color, button); colorChoices.append(button);
        }
        button.setAttribute('aria-pressed', String(pinColors.includes(setId, color)));
        button.disabled = saving;
      }
      const selected = pinColors.selected(setId);
      allColors.setAttribute('aria-pressed', String(selected === null));
      allColors.disabled = saving;
      const signature = JSON.stringify([setId, selected === null ? null : [...selected].sort()]);
      if (activeViewer !== null && signature !== appliedColorFilter) {
        activeViewer.setCaptionColorFilter(selected);
        appliedColorFilter = signature;
      }
      const caption = selectedCaption();
      colorHidden.hidden = caption === undefined || pinColors.includes(setId, caption.color);
      revealPinColor.disabled = saving;
      newCaptionColorHidden.hidden = pinColors.includes(setId, captionSessionUi.authoringColor(setId));
      showNewCaptionColor.disabled = saving;
    };
    allColors.addEventListener('click', () => { pinColors.all(activeDisplaySetId()); refreshPinColors(); });
    revealPinColor.addEventListener('click', () => {
      pinColors.show(activeDisplaySetId(), selectedCaption()?.color); refreshPinColors();
    });
    newCaptionColor.addEventListener('input', () => {
      captionSessionUi.setAuthoringColor(activeDisplaySetId(), newCaptionColor.value);
      refreshPinColors();
    });
    showNewCaptionColor.addEventListener('click', () => {
      pinColors.show(activeDisplaySetId(), captionSessionUi.authoringColor(activeDisplaySetId()));
      refreshPinColors();
    });
    captionSection.dataset.pane = 'list';
    captionSection.append(
      captionActions, captionPane,
      el('div', { class: 'ng-caption-browser' },
        el('div', { class: 'ng-caption-search' }, captionSearch, captionAssetFilter, captionResultCount),
        colorFilterBar,
        captionList,
      ),
      captionDetail,
    );

    materialSection.append(
      el('h2', {}, 'モデル表面の見え方'),
      el('p', { class: 'ng-note' }, '現在の表示セットに保存します。モデルの元ファイルは変更しません。'),
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
      ),
      el('details', {}, el('summary', {}, '特定の色を透かす'),
        el('label', { class: 'ng-row' }, materialChromaEnabled, el('span', {}, '有効')),
        el('div', { class: 'ng-grid' },
        el('label', { class: 'ng-field' }, el('span', {}, '抜く色'), materialChromaColor),
        el('label', { class: 'ng-field' }, el('span', {}, '許容幅'), materialChromaTolerance),
        el('label', { class: 'ng-field' }, el('span', {}, '境界のぼかし'), materialChromaFeather),
        )),
      resetMaterialAppearance,
      materialStatus,
    );

    savedViewSection.append(
      el('h2', {}, 'カメラ'),
      el('div', { class: 'ng-axis-grid' }, ...axisButtons.values()),
      el('label', { class: 'ng-row' }, orthographic, el('span', {}, '平行投影')),
      fitView,
      el('h3', {}, '保存した視点'),
      el('div', { class: 'ng-grid' },
        el('label', { class: 'ng-field' }, el('span', {}, '保存した視点'), savedViewSelect),
        el('label', { class: 'ng-field' }, el('span', {}, '名前'), savedViewName),
      ),
      el('div', { class: 'ng-row' }, captureSavedView, overwriteSavedView, applySavedView),
      el('div', { class: 'ng-row' }, makeDefaultSavedView, deleteSavedView),
      backgroundStatus,
      el('p', { class: 'ng-note' }, '新しく登録した視点は、この表示セットへの切替時にも使います。登録・更新後は「端末に保存」で確定します。'),
      ...(working.collaborationBaseline === undefined ? [] : [
        el('p', { class: 'ng-warn' }, '視点や表示セットを変更して保存すると、以前の共同編集用ファイルとの書き出し・統合は停止することがあります。共同編集の基準は自動更新しません。'),
      ]),
      el('details', {}, el('summary', {}, '3D背景色'),
        el('div', { class: 'ng-grid ng-background-controls' },
          el('label', { class: 'ng-field' }, el('span', {}, '色'), backgroundColor),
          el('label', { class: 'ng-field' }, el('span', {}, 'HEX'), backgroundHexInput),
        ),
        standardBackground,
        el('p', { class: 'ng-note' }, '現在の3D表示だけに反映します。視点に残すには「視点を登録」または「現在の視点で更新」を使用してください。')),
    );
    rebuildDisplaySetOptions();

    const modelSection = el('section', { class: 'ng-model-card' },
        el('h2', {}, 'モデル'),
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
          el('p', { class: 'ng-note' }, '一回に一つ追加します。他の未保存変更も含め、作業全体を端末へ保存します。'),
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
          el('p', { class: 'ng-note' }, '他の未保存変更も含め、作業全体を端末へ保存します。'),
          el('p', { class: 'ng-note' }, 'モデルの位置とキャプション本文は保ちます。表面が同じとは推測しないため、既存キャプションは必要に応じて再配置してください。'),
        ),
        el('details', { class: 'ng-card' },
          el('summary', {}, 'モデルをプロジェクトから削除'),
          el('label', { class: 'ng-field' }, el('span', {}, '削除するモデル'), deleteAsset),
          deleteAssetButton,
          el('p', { class: 'ng-note' }, 'このモデルにキャプションがある場合は、先にそのキャプションを削除してください。元のモデルファイルは変更しません。'),
        ),
        el('details', { class: 'ng-card ng-model-placement', open: true },
          el('summary', {}, 'モデルの位置を調整'),
          el('label', { class: 'ng-field' }, el('span', {}, '調整するモデル'), transformAsset),
          modelContext,
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
    );
    const modelPlacement = modelSection.querySelector('.ng-model-placement')!;
    modelSection.insertBefore(modelPlacement, modelSection.children[2] ?? null);
    (modelSection.children[1] as HTMLDetailsElement).open = true;
    const displaySetDialog = createNativeUiDialog('表示セットを管理',
      el('section', { class: 'ng-card' },
        el('h3', {}, '新しい表示セット'),
        el('p', { class: 'ng-note' }, 'キャプション、マテリアル設定、切替時の視点を引き継がない空の表示セットを作ります。モデルの表示／非表示と位置は共通のままです。'),
        el('label', { class: 'ng-field' }, el('span', {}, '名前'), createDisplaySetName),
        createDisplaySet,
      ),
      el('section', { class: 'ng-card' },
        el('h3', {}, '現在の表示セット'),
        currentDisplaySetChoice,
        el('label', { class: 'ng-field' }, el('span', {}, '名前'), renameDisplaySetName),
        renameDisplaySet,
      ),
      ...(working.collaborationBaseline === undefined ? [] : [
        el('p', { class: 'ng-warn' }, '表示セットや視点を変更すると、以前に作った共同編集用ファイルとの統合・書き出しは停止することがあります。元の基準を自動更新はしません。'),
      ]),
      displaySetStatus,
    );
    const sharingDialog = createNativeUiDialog('ファイル・共有',
        el('section', { class: 'ng-card ng-share-export' },
          el('h3', {}, 'このプロジェクトを書き出す'),
          el('p', {}, `対象：${working.project.title}`),
          el('label', { class: 'ng-field' }, el('span', {}, '目的'), workspaceExportPurpose),
          workspaceExportDescription,
          workspaceReviewField,
          workspaceExportCleanActions,
          workspaceExportDirtyActions,
          workspaceExportStatus,
          openSharingHelp,
        ),
        el('details', { class: 'ng-card' },
          el('summary', {}, '共同編集の変更を受け取る'),
          el('p', { class: 'ng-note' }, 'このプロジェクトから書き出した共同編集用ファイルのキャプション変更だけを取り込みます。判断できない競合がある場合は、何も変更せず停止します。未保存変更がある間は実行できません。'),
          el('label', { class: 'ng-field' }, el('span', {}, '共同編集用 .lociview'), collaborationInput),
          collaborationMerge,
          collaborationStatus,
          el('details', {}, el('summary', {}, '統合の詳しい情報'), collaborationDetail),
        ),
    );
    const helpStart = el('details', { class: 'ng-card', open: 'true' },
      el('summary', {}, 'はじめる'),
      el('p', {}, 'ホームの「ファイルを開く」からLociViewファイルや3Dモデルを選びます。編集内容はこの端末に保存されます。'),
      el('p', {}, '表示セットは、同じモデルを別のキャプション・見え方・視点で整理する単位です。画面上部で切り替えます。'),
    );
    const helpRecord = el('details', { class: 'ng-card' },
      el('summary', {}, '記録する'),
      el('p', {}, 'キャプションを追加する色を選び、「＋ 追加」からモデル表面をShift＋クリック／長押しします。位置調整は追加ボタンの近くから開始できます。'),
      el('p', {}, '右の一覧でキャプションを選び、「残す」で複数を比較します。「メディアを追加」から新規メディアを追加するか、プロジェクト内の既存メディアを選べます。'),
      el('p', {}, '回転：ドラッグ／1本指。移動：右ドラッグ／2本指。拡大・縮小：ホイール／ピンチ。'),
    );
    const helpShare = el('details', { class: 'ng-card' },
      el('summary', {}, '保存と共有'),
      el('p', {}, '完全なバックアップは復元用、共同編集用はあとでキャプション変更を取り込む相手用、閲覧共有用は選んだ表示セットだけを見せる相手用、編集用コピーは元へ統合しない別プロジェクト用です。'),
      el('p', {}, '未保存の変更がある場合は、保存するか、明示的に破棄するか、中止するかを選びます。ホームで対象件数を確認するまでファイルは作りません。'),
    );
    const helpTrouble = el('details', { class: 'ng-card' },
      el('summary', {}, '困ったとき'),
      el('p', {}, '失敗理由は画面下の状態表示と「詳しい情報」に残ります。内容を直して同じ操作を再試行してください。保存できない場合は最後に保存された状態へ戻します。'),
      unload,
      el('p', { class: 'ng-note' }, 'GSを解放してもプロジェクトは削除しません。再表示するには開き直してください。'),
      diagnostics,
      reload,
    );
    const helpDialog = createNativeUiDialog('ヘルプ',
        helpStart,
        helpRecord,
        helpShare,
        workspaceGsOffline.element,
        helpTrouble,
    );
    const header = el('header', { class: 'ng-workspace-header' },
      el('span', { class: 'ng-brand' }, 'LociView'),
      el('h1', {}, working.project.title), accessBadge, saveState,
      el('div', { class: 'ng-row' }, save, close, fileMenu, helpMenu),
      el('div', { class: 'ng-display-set' },
        el('label', {}, el('span', {}, '表示セット'), displaySetSelect), manageDisplaySets,
      ),
    );
    runtimeStatus.setAttribute('role', 'status');
    const workspaceUi = mountNativeWorkspaceUi(root, {
      header, stage, caption: captionSection, model: modelSection,
      material: materialSection, view: savedViewSection, status: runtimeStatus,
    });
    root.append(displaySetDialog.element, sharingDialog.element, helpDialog.element);
    sharingDialog.element.addEventListener('cancel', (event) => {
      if (saving) event.preventDefault();
    });
    sharingDialog.element.addEventListener('close', () => { workspaceExportAttempt += 1; });
    function selectedWorkspaceExportPurpose(): NativeExportPurposeV1 | null {
      const purpose = workspaceExportPurpose.value;
      return purpose === 'backup' || purpose === 'collaboration' || purpose === 'review' || purpose === 'cleanCopy'
        ? purpose
        : null;
    }
    function selectedWorkspaceExportIntent(): NativeExportIntentV1 | null {
      const purpose = selectedWorkspaceExportPurpose();
      if (purpose === null) {
        workspaceExportStatus.className = 'ng-error';
        workspaceExportStatus.textContent = '書き出す目的を選び直してください。';
        return null;
      }
      if (purpose === 'review') {
        if (workspaceReviewDisplaySet.value === '') {
          workspaceExportStatus.className = 'ng-error';
          workspaceExportStatus.textContent = '閲覧共有に含める表示セットを選んでください。';
          return null;
        }
        return {
          projectId: durable.project.id,
          purpose,
          reviewDisplaySetId: workspaceReviewDisplaySet.value,
        };
      }
      return { projectId: durable.project.id, purpose };
    }
    function refreshWorkspaceExportControls(resetStatus = false): void {
      if (!sharingDialog.element.open) return;
      const previousDisplaySetId = workspaceReviewDisplaySet.value;
      const sets = displaySets();
      const labels = nativeChoiceLabelsByIdV1(sets);
      clear(workspaceReviewDisplaySet);
      for (const displaySet of sets) {
        workspaceReviewDisplaySet.append(el(
          'option', { value: displaySet.id }, labels.get(displaySet.id) ?? displaySet.name,
        ));
      }
      const preferredDisplaySetId = sets.some((displaySet) => displaySet.id === previousDisplaySetId)
        ? previousDisplaySetId
        : sets.some((displaySet) => displaySet.id === activeDisplaySetId())
          ? activeDisplaySetId()
          : '';
      workspaceReviewDisplaySet.value = preferredDisplaySetId;
      const purpose = selectedWorkspaceExportPurpose();
      workspaceReviewField.hidden = purpose !== 'review';
      workspaceExportDescription.textContent = purpose === null ? '' : nativeExportLabels(purpose).explanation;
      const dirty = unsavedChanges.isDirty;
      workspaceExportCleanActions.hidden = dirty;
      workspaceExportDirtyActions.hidden = !dirty;
      workspaceExportPurpose.disabled = saving;
      workspaceReviewDisplaySet.disabled = saving || sets.length === 0;
      workspaceExportContinue.disabled = saving;
      workspaceExportSave.disabled = saving || session.accessState !== 'editable';
      const reviewSetIsSaved = purpose !== 'review' || nativeDisplaySetsV1(durable).some((displaySet) => (
        displaySet.id === workspaceReviewDisplaySet.value
      ));
      workspaceExportDiscard.disabled = saving || !reviewSetIsSaved;
      workspaceExportDiscard.title = reviewSetIsSaved
        ? '未保存の変更をこのファイルへ含めず、最後に保存した状態から続けます'
        : 'この表示セットはまだ保存されている状態にないため、先に保存してください';
      workspaceExportCancel.disabled = saving;
      sharingDialog.closeButton.disabled = saving;
      if (resetStatus) {
        workspaceExportStatus.className = dirty ? 'ng-warn' : 'ng-status';
        workspaceExportStatus.textContent = dirty
          ? '未保存の変更があります。保存して含めるか、含めずに破棄するか、中止してください。'
          : 'ホームで対象のモデル・キャプション・メディア件数を確認してから、保存先を選びます。';
      }
    }
    function handoffWorkspaceExport(intent: NativeExportIntentV1): void {
      if (intent.projectId !== durable.project.id) {
        workspaceExportStatus.className = 'ng-error';
        workspaceExportStatus.textContent = '書き出すプロジェクトが変わりました。操作をやり直してください。';
        return;
      }
      if (
        intent.purpose === 'review' &&
        !nativeDisplaySetsV1(durable).some((displaySet) => displaySet.id === intent.reviewDisplaySetId)
      ) {
        workspaceExportStatus.className = 'ng-error';
        workspaceExportStatus.textContent = '選んだ表示セットはまだ保存されていません。保存してから続けてください。別の表示セットへは切り替えていません。';
        return;
      }
      const destination = buildNativeExportHandoffUrlV1(
        new URL(import.meta.env.BASE_URL, window.location.origin),
        intent,
      );
      unsavedChanges.clear();
      sharingDialog.element.close();
      closeActive();
      window.location.assign(destination);
    }
    manageDisplaySets.addEventListener('click', () => {
      renameDisplaySetName.value = displaySets().find((displaySet) => displaySet.id === activeDisplaySetId())?.name ?? '';
      displaySetStatus.textContent = '';
      displaySetStatus.className = 'ng-note';
      displaySetDialog.open();
    });
    fileMenu.addEventListener('click', () => {
      sharingDialog.open();
      refreshWorkspaceExportControls(true);
    });
    workspaceExportPurpose.addEventListener('change', () => refreshWorkspaceExportControls(true));
    workspaceReviewDisplaySet.addEventListener('change', () => refreshWorkspaceExportControls(true));
    workspaceExportContinue.addEventListener('click', () => {
      if (saving) return;
      if (unsavedChanges.isDirty) {
        refreshWorkspaceExportControls(true);
        return;
      }
      const intent = selectedWorkspaceExportIntent();
      if (intent !== null) handoffWorkspaceExport(intent);
    });
    workspaceExportSave.addEventListener('click', () => {
      if (saving || !unsavedChanges.isDirty) return;
      const intent = selectedWorkspaceExportIntent();
      if (intent === null) return;
      const attempt = ++workspaceExportAttempt;
      void saveWorkingProject().then((saved) => {
        if (!saved) {
          if (sharingDialog.element.open) {
            workspaceExportStatus.className = 'ng-error';
            workspaceExportStatus.textContent = '保存できなかったため、最後に保存された状態へ戻しました。書き出しは開始していません。続ける場合は、保存済みの内容だけを書き出します。';
          }
          return;
        }
        if (attempt === workspaceExportAttempt && sharingDialog.element.open) handoffWorkspaceExport(intent);
      });
    });
    workspaceExportDiscard.addEventListener('click', () => {
      if (saving || !unsavedChanges.isDirty) return;
      const intent = selectedWorkspaceExportIntent();
      if (intent !== null) handoffWorkspaceExport(intent);
    });
    workspaceExportCancel.addEventListener('click', () => {
      if (saving) return;
      workspaceExportAttempt += 1;
      sharingDialog.element.close();
    });
    helpMenu.addEventListener('click', helpDialog.open);
    openSharingHelp.addEventListener('click', () => {
      sharingDialog.element.close();
      helpShare.open = true;
      helpDialog.open();
      helpShare.scrollIntoView({ block: 'nearest' });
    });
    const quickAxes = axes.map((axis) => el('button', { onclick: () => axisButtons.get(axis)!.click() }, axis.toUpperCase()));
    const quickViewManage = el('button', {}, '視点を管理');
    const cameraQuick = el('details', { class: 'ng-camera-menu' },
      el('summary', {}, 'カメラ・視点'),
      el('div', { class: 'ng-camera-popover' },
        el('div', { class: 'ng-axis-grid' }, ...quickAxes),
        el('label', { class: 'ng-row' }, quickOrthographic, el('span', {}, '平行投影')),
        quickSavedView, quickApplyView, quickViewManage,
      ),
    );
    cameraQuick.addEventListener('toggle', () => {
      if (!cameraQuick.open) return;
      clear(quickSavedView);
      const defaultSavedViewId = displaySets().find((displaySet) => (
        displaySet.id === activeDisplaySetId()
      ))?.defaultSavedViewId ?? null;
      const views = savedViews();
      const labels = nativeChoiceLabelsByIdV1(views);
      for (const view of views) quickSavedView.append(el('option', { value: view.id }, (
        view.id === defaultSavedViewId
          ? `${labels.get(view.id) ?? view.name}（切替時）`
          : labels.get(view.id) ?? view.name
      )));
      quickSavedView.value = selectedSavedViewId ?? savedViews()[0]?.id ?? '';
      quickOrthographic.checked = orthographic.checked;
      for (const button of quickAxes) button.disabled = saving;
      updateAccess();
    });
    quickOrthographic.addEventListener('change', () => {
      orthographic.checked = quickOrthographic.checked;
      orthographic.dispatchEvent(new Event('change'));
    });
    quickApplyView.addEventListener('click', () => {
      savedViewSelect.value = quickSavedView.value;
      savedViewSelect.dispatchEvent(new Event('change'));
      applySavedView.click();
      quickOrthographic.checked = orthographic.checked;
      cameraQuick.open = false;
    });
    quickViewManage.addEventListener('click', () => { cameraQuick.open = false; workspaceUi.showTab('view', true); });
    fitQuick.addEventListener('click', () => fitView.click());
    stage.append(el('div', { class: 'ng-camera-tools' }, cameraQuick, fitQuick), positionMode);

    const offlineReady = import.meta.env.DEV || await isNativeGsOfflineReady(await pwaRegistration);
    const gltfTextureMaxEdge = nativeRuntimeGltfTextureMaxEdge({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    const viewer = new NativeGsViewer(canvas, working, {
      onCaptionCreationStarted() {
        if (!canMutateWorking()) return null;
        if (!creatingCaption) {
          runtimeStatus.className = 'ng-status';
          runtimeStatus.textContent = '先に「＋ 追加」を押してください。';
          return null;
        }
        selectedCaptionId = null;
        captionMoveActive = false;
        rebuildCaptionList();
        populateCaptionFields();
        updateAccess();
        return { color: captionSessionUi.authoringColor(activeDisplaySetId()) };
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
          title: titleValue === '' ? 'キャプション' : titleValue,
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
        queueMicrotask(() => { if (canvas.isConnected && activeViewer === viewer) updateAccess(); });
        captionTitle.value = next.title;
        captionBody.value = next.body;
        markDirty();
        if (wasNew) {
          queueMicrotask(() => {
            workspaceUi.showTab('caption');
            showCaptionPane('detail');
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
        captionSessionUi.bringToFront(captionId);
        if (!creatingCaption) captionMoveActive = false;
        creatingCaption = false;
        rebuildCaptionList();
        populateCaptionFields();
        revealCaptionRow();
        updateAccess();
        runtimeStatus.textContent = `キャプションを選択しました：${selectedCaption()?.title ?? 'キャプション'}`;
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
    const syncProjectionControls = (): void => {
      orthographic.checked = viewer.isOrthographic();
      quickOrthographic.checked = orthographic.checked;
    };
    const syncBackgroundControls = (): void => {
      const hex = nativeBackgroundHex(viewer.getBackground());
      backgroundColor.value = hex;
      backgroundHexInput.value = hex;
      backgroundHexDraftValid = true;
      backgroundHexInput.setAttribute('aria-invalid', 'false');
      backgroundStatus.className = 'ng-note';
      backgroundStatus.textContent = '';
    };
    const syncCurrentViewControls = (includeBackground = true): void => {
      syncProjectionControls();
      if (includeBackground) syncBackgroundControls();
    };
    const captureViewRecord = (existing?: NativeSavedViewV1): NativeSavedViewV1 => {
      const id = existing?.id ?? newNativeId('view');
      const fallbackName = existing?.name ?? `視点 ${savedViews().length + 1}`;
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
    activeCaptionOverlay = mountNativeCaptionWindowsV1({
      stage,
      state: captionSessionUi,
      getSnapshot: () => working,
      getSelectedCaptionId: () => selectedCaptionId,
      getActiveDisplaySetId: activeDisplaySetId,
      projectCaption: (captionId) => viewer.projectCaption(captionId, true),
      isCaptionAssetAvailable: (captionId) => {
        const caption = working.captions.find((candidate) => candidate.id === captionId);
        const ownerAssetId = caption === undefined ? null : nativeCaptionOwnerAssetIdV1(caption);
        if (ownerAssetId === null) return false;
        const ready = new Set(viewer.getResolution().visibleRepresentationIds);
        return activeNativeRepresentationsV1(working, ownerAssetId).some((representation) => (
          representation.role !== 'interactionProxy' && ready.has(representation.id)
        ));
      },
      isPinColorVisible: (captionId) => viewer.isCaptionColorVisible(captionId),
      onShowPinColor: (captionId) => {
        pinColors.show(activeDisplaySetId(), working.captions.find((caption) => caption.id === captionId)?.color);
        refreshPinColors();
      },
      readMedia: (mediaId) => readNativeMediaV1(fs, working.project.id, mediaId),
      onSelect: (captionId) => {
        if (!viewer.selectCaption(captionId)) return;
        captionSessionUi.bringToFront(captionId);
        selectedCaptionId = captionId;
        creatingCaption = false;
        captionMoveActive = false;
        rebuildCaptionList();
        populateCaptionFields();
        revealCaptionRow();
        updateAccess();
      },
      onDismiss: (captionId) => {
        if (selectedCaptionId !== captionId) return;
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
    viewer.setAssetGizmoMode(assetGizmoMode);
    rebuildSavedViewOptions();
    syncCurrentViewControls();
    updateAccess();
    finishPosition.addEventListener('click', () => {
      if (creatingCaption) { newCaption.click(); return; }
      viewer.stopPositionEditing();
      captionMoveActive = false;
      updateAccess();
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = '位置調整を終了しました。未保存の変更は「端末に保存」で確定してください。';
    });

    const switchDisplaySet = (nextDisplaySetId: string, applyDefaultView: boolean): boolean => {
      const nextDisplaySet = displaySets().find((displaySet) => displaySet.id === nextDisplaySetId);
      if (nextDisplaySet === undefined) return false;
      activeDisplaySetIdValue = nextDisplaySet.id;
      newCaptionColor.value = captionSessionUi.authoringColor(nextDisplaySet.id);
      selectedCaptionId = null;
      creatingCaption = false;
      captionMoveActive = false;
      viewer.stopCaptionPositionEditing();
      const defaultSavedViewId = nextDisplaySet.defaultSavedViewId;
      selectedSavedViewId = defaultSavedViewId;
      viewer.setActiveDisplaySet(activeDisplaySetId());
      viewer.selectCaption(selectedCaptionId);
      rebuildDisplaySetOptions();
      rebuildCaptionList();
      populateCaptionFields();
      rebuildSavedViewOptions();
      syncMaterialControls();
      updateAccess();
      const defaultView = defaultSavedViewId === null
        ? undefined
        : savedViews().find((view) => view.id === defaultSavedViewId);
      if (applyDefaultView && defaultView !== undefined) {
        viewer.applyProjectCamera(defaultView.camera);
        viewer.setBackground(defaultView.background);
        syncCurrentViewControls();
      }
      updateAccess();
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = `表示セット「${displaySetChoiceLabel(nextDisplaySet.id)}」へ切り替えました。`;
      return true;
    };
    const reconcileWorkingUi = (): void => {
      const resolved = resolveNativeDisplaySetUiSelectionV1(
        working, activeDisplaySetId(), selectedCaptionId, selectedSavedViewId,
      );
      activeDisplaySetIdValue = resolved.displaySetId;
      selectedCaptionId = resolved.captionId;
      selectedSavedViewId = resolved.savedViewId;
      newCaptionColor.value = captionSessionUi.authoringColor(activeDisplaySetId());
      viewer.setActiveDisplaySet(activeDisplaySetId());
      viewer.selectCaption(selectedCaptionId);
      rebuildDisplaySetOptions();
      rebuildCaptionList();
      populateCaptionFields();
      rebuildSavedViewOptions();
      syncMaterialControls();
      refreshPinColors();
      updateWorkspaceGsOffline();
    };
    displaySetSelect.addEventListener('change', () => {
      if (!switchDisplaySet(displaySetSelect.value, true)) rebuildDisplaySetOptions();
    });
    createDisplaySet.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      try {
        const displaySetId = newNativeId('set');
        working = appendEmptyNativeDisplaySetV1(working, displaySetId, createDisplaySetName.value);
        viewer.setSnapshot(working);
        createDisplaySetName.value = '';
        switchDisplaySet(displaySetId, false);
        markDirty();
        displaySetStatus.className = 'ng-status ng-ok';
        displaySetStatus.textContent = '空の表示セットを作りました。「端末に保存」で確定します。';
      } catch (error) {
        displaySetStatus.className = 'ng-error';
        displaySetStatus.textContent = errorMessage(error).includes('DisplaySet name')
          ? '表示セット名は空白や改行だけにせず、160文字以内の1行で入力してください。入力内容は残しています。'
          : errorMessage(error);
        createDisplaySetName.focus();
      }
    });
    renameDisplaySet.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      try {
        const previous = displaySets().find((displaySet) => displaySet.id === activeDisplaySetId());
        if (previous === undefined) throw new Error('現在の表示セットが見つかりません。');
        const previousLabel = displaySetChoiceLabel(previous.id);
        const next = renameNativeDisplaySetV1(working, previous.id, renameDisplaySetName.value);
        if (next === working) {
          displaySetStatus.className = 'ng-note';
          displaySetStatus.textContent = '名前は変更されていません。';
          return;
        }
        working = next;
        viewer.setSnapshot(working);
        rebuildDisplaySetOptions();
        markDirty();
        displaySetStatus.className = 'ng-status ng-ok';
        displaySetStatus.textContent = `「${previousLabel}」を「${displaySetChoiceLabel(previous.id)}」へ変更しました。「端末に保存」で確定します。`;
      } catch (error) {
        displaySetStatus.className = 'ng-error';
        displaySetStatus.textContent = errorMessage(error).includes('DisplaySet name')
          ? '表示セット名は空白や改行だけにせず、160文字以内の1行で入力してください。入力内容は残しています。'
          : errorMessage(error);
        renameDisplaySetName.focus();
      }
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
      runtimeStatus.textContent = `現在の視点を「${savedViewChoiceLabel(view.id)}」として保存し、この表示セットの切替時の視点にしました。`;
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
      runtimeStatus.textContent = `「${savedViewChoiceLabel(view.id)}」を現在の視点で更新しました。`;
    });
    makeDefaultSavedView.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const view = selectedSavedView();
      if (view === undefined) return;
      try {
        const next = setNativeDisplaySetDefaultSavedViewV1(working, activeDisplaySetId(), view.id);
        if (next === working) return;
        working = next;
        viewer.setSnapshot(working);
        rebuildSavedViewOptions();
        markDirty();
        runtimeStatus.className = 'ng-status';
        runtimeStatus.textContent = `「${savedViewChoiceLabel(view.id)}」を、この表示セットへ切り替えた時の視点にしました。現在のカメラは動かしていません。`;
      } catch (error) {
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    applySavedView.addEventListener('click', () => {
      const view = selectedSavedView();
      if (view === undefined) return;
      viewer.applyProjectCamera(view.camera);
      viewer.setBackground(view.background);
      syncCurrentViewControls();
      updateAccess();
      runtimeStatus.textContent = `「${savedViewChoiceLabel(view.id)}」を表示しました。`;
    });
    deleteSavedView.addEventListener('click', () => {
      if (!canMutateWorking()) return;
      const view = selectedSavedView();
      if (view === undefined) return;
      const choiceLabel = savedViewChoiceLabel(view.id);
      if (!window.confirm(`視点「${choiceLabel}」を削除しますか？ 表示セット切替時の指定も解除されます。端末への確定には保存が必要です。`)) return;
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
      runtimeStatus.textContent = `「${choiceLabel}」を保存対象から削除しました。`;
    });
    orthographic.addEventListener('change', () => {
      viewer.setOrthographic(orthographic.checked);
      syncCurrentViewControls(false);
    });
    backgroundColor.addEventListener('input', () => {
      viewer.setBackground(nativeBackgroundFromHex(backgroundColor.value));
      syncBackgroundControls();
      updateAccess();
    });
    backgroundHexInput.addEventListener('input', () => {
      const hex = normalizeNativeBackgroundHex(backgroundHexInput.value);
      if (hex === null) {
        backgroundHexDraftValid = false;
        backgroundHexInput.setAttribute('aria-invalid', 'true');
        backgroundStatus.className = 'ng-error';
        backgroundStatus.textContent = '「#」と6桁の16進数で入力してください。入力中の値はまだ3Dへ反映していません。';
        updateAccess();
        return;
      }
      viewer.setBackground(nativeBackgroundFromHex(hex));
      backgroundColor.value = hex;
      backgroundHexDraftValid = true;
      backgroundHexInput.setAttribute('aria-invalid', 'false');
      backgroundStatus.className = 'ng-status ng-ok';
      backgroundStatus.textContent = '3D背景へ反映しました。視点へ残すには登録または更新してください。';
      updateAccess();
    });
    standardBackground.addEventListener('click', () => {
      viewer.setBackground(nativeBackgroundFromHex(NATIVE_STANDARD_BACKGROUND_HEX));
      syncBackgroundControls();
      backgroundStatus.className = 'ng-status ng-ok';
      backgroundStatus.textContent = '3D背景を標準色にしました。カメラやマテリアルは変更していません。';
      updateAccess();
    });
    fitView.addEventListener('click', () => {
      viewer.fitCamera();
      syncCurrentViewControls(false);
    });
    for (const [axis, button] of axisButtons) {
      button.addEventListener('click', () => {
        viewer.viewAxis(axis);
        syncCurrentViewControls(false);
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
        await renderProject(saved, session, captionSessionUi, {
          activeDisplaySetId: activeDisplaySetId(),
          selectedCaptionId,
          selectedSavedViewId,
        });
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
        await renderProject(saved, session, captionSessionUi, {
          activeDisplaySetId: activeDisplaySetId(),
          selectedCaptionId,
          selectedSavedViewId,
        });
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
        updateWorkspaceGsOffline();
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
        selectedCaptionId = working.captions.find((caption) => caption.id === captionBeforeCreationId && nativeCaptionDisplaySetIdV1(caption) === activeDisplaySetId())?.id ?? null;
        viewer.selectCaption(selectedCaptionId);
        rebuildCaptionList();
        populateCaptionFields();
        updateAccess();
        runtimeStatus.className = 'ng-status';
        runtimeStatus.textContent = '新しいキャプションの配置をやめました。';
        return;
      }
      captionBeforeCreationId = selectedCaptionId;
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
      if (viewer.isCaptionRepositioning()) {
        viewer.cancelCaptionReposition();
        updateAccess();
        runtimeStatus.className = 'ng-status';
        runtimeStatus.textContent = '置き直しを中止しました。ピン位置は変更していません。';
        return;
      }
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
      if (!commitSelectedCaption({ ...caption, title: captionTitle.value.trim() || 'キャプション' })) return;
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
    const acceptImmediateCaptionMediaSave = (saved: NativeProjectSnapshotV1): void => {
      durable = saved;
      working = saved;
      unsavedChanges.clear();
      captionSessionUi.reconcile(working);
      viewer.setSnapshot(working);
      viewer.selectCaption(selectedCaptionId);
      rebuildCaptionList();
      populateCaptionFields();
      activeCaptionOverlay?.sync();
    };
    const attachProjectMediaReference = async (
      captionId: string,
      mediaId: string,
      label: string,
    ): Promise<void> => {
      if (saving || session.accessState !== 'editable') return;
      if (unsavedChanges.isDirty) {
        projectMediaStatus.className = 'ng-error';
        projectMediaStatus.textContent = '先に現在の変更を保存してからメディアを添付してください。';
        return;
      }
      if (selectedCaptionId !== captionId || !working.captions.some((caption) => caption.id === captionId)) {
        projectMediaStatus.className = 'ng-error';
        projectMediaStatus.textContent = '添付先のキャプションが変わりました。もう一度選んでください。';
        return;
      }
      saving = true;
      updateAccess();
      projectMediaStatus.className = 'ng-status';
      projectMediaStatus.textContent = `「${label}」を添付しています…`;
      try {
        const saved = await attachExistingNativeCaptionMediaV1(
          session.workspace, durable, captionId, mediaId,
          (message) => { projectMediaStatus.textContent = message; },
        );
        acceptImmediateCaptionMediaSave(saved);
        projectMediaStatus.className = 'ng-status ng-ok';
        projectMediaStatus.textContent = `「${label}」をこのキャプションへ添付して保存しました。`;
      } catch (error) {
        projectMediaStatus.className = 'ng-error';
        projectMediaStatus.textContent = `メディアを添付できませんでした：${errorMessage(error)}。保存済み状態は変更していません。`;
      } finally {
        saving = false;
        updateAccess();
      }
    };
    const removeCaptionMediaReference = async (
      captionId: string,
      mediaId: string,
      label: string,
    ): Promise<void> => {
      if (saving || session.accessState !== 'editable') return;
      if (unsavedChanges.isDirty) {
        projectMediaStatus.className = 'ng-error';
        projectMediaStatus.textContent = '先に現在の変更を保存してから添付を外してください。';
        return;
      }
      const confirmed = await confirmDialog(
        'キャプションからメディアを外す',
        `「${label}」をこのキャプションから外して保存しますか？ メディア本体、他のキャプションの添付、完全バックアップからは削除しません。`,
      );
      if (!confirmed) return;
      if (
        saving || session.accessState !== 'editable' || selectedCaptionId !== captionId ||
        !working.captions.find((caption) => caption.id === captionId)?.attachmentMediaIds?.includes(mediaId)
      ) {
        projectMediaStatus.className = 'ng-error';
        projectMediaStatus.textContent = '確認中に対象が変わりました。添付は外していません。';
        return;
      }
      saving = true;
      updateAccess();
      projectMediaStatus.className = 'ng-status';
      projectMediaStatus.textContent = `「${label}」をこのキャプションから外しています…`;
      try {
        const saved = await removeNativeCaptionMediaV1(
          session.workspace, durable, captionId, mediaId,
          (message) => { projectMediaStatus.textContent = message; },
        );
        acceptImmediateCaptionMediaSave(saved);
        projectMediaStatus.className = 'ng-status ng-ok';
        projectMediaStatus.textContent = `「${label}」をこのキャプションから外して保存しました。メディア本体はプロジェクトに残しています。`;
      } catch (error) {
        projectMediaStatus.className = 'ng-error';
        projectMediaStatus.textContent = `添付を外せませんでした：${errorMessage(error)}。保存済み状態は変更していません。`;
      } finally {
        saving = false;
        updateAccess();
      }
    };
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
        acceptImmediateCaptionMediaSave(saved);
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
      collaborationStatus.textContent = '共同編集用ファイルを確認しています…';
      collaborationDetail.textContent = '';
      void mergeNativeCollaborationPackageV1(
        session.workspace,
        durable.project.id,
        packageFile,
        {
          onStatus(message) {
            collaborationStatus.textContent = '共同編集用ファイルを確認し、変更を取り込んでいます…';
            collaborationDetail.textContent = message;
          },
        },
      ).then((result) => {
        if (result.kind === 'conflict') {
          collaborationStatus.className = 'ng-error';
          collaborationStatus.textContent = `統合を中止しました（${result.conflicts.length}件）。このプロジェクトは変更していません。`;
          collaborationDetail.textContent = result.conflicts.map(nativeCollaborationConflictMessageV1).join('\n');
          return;
        }
        if (result.kind === 'noop') {
          collaborationStatus.className = 'ng-status ng-ok';
          collaborationStatus.textContent = 'このファイルの変更はすでに反映済みです。新しい保存状態は作りませんでした。';
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
        collaborationStatus.textContent = 'キャプション変更と必要な新規画像を取り込み、プロジェクトへ保存しました。';
        collaborationDetail.textContent = `保存状態の更新番号：${working.generation}`;
      }).catch((error: unknown) => {
        collaborationStatus.className = 'ng-error';
        collaborationStatus.textContent = '共同編集の変更を取り込めませんでした。このプロジェクトは変更していません。';
        collaborationDetail.textContent = nativeCollaborationOperationErrorMessageV1(error);
      }).finally(() => {
        saving = false;
        updateAccess();
      });
    });
    async function saveWorkingProject(): Promise<boolean> {
      if (saving || session.accessState !== 'editable') return false;
      saving = true;
      updateAccess();
      runtimeStatus.className = 'ng-status';
      runtimeStatus.textContent = 'プロジェクトを保存しています…';
      try {
        const saved = await saveNativeProjectV1(session.workspace, working);
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
        syncVisibilityControls();
        populateTransform();
        reconcileWorkingUi();
        runtimeStatus.textContent = 'プロジェクトを保存しました。';
        return true;
      } catch (error) {
        working = durable;
        assetClosureChanged = false;
        viewer.setSnapshot(durable);
        creatingCaption = false;
        captionMoveActive = false;
        syncAssetControlMembership();
        syncMaterialAssetOptions();
        syncVisibilityControls();
        populateTransform();
        reconcileWorkingUi();
        unsavedChanges.clear();
        runtimeStatus.className = 'ng-error';
        runtimeStatus.textContent = `保存できませんでした：${error instanceof Error ? error.message : String(error)}。最後に保存された状態へ戻しました。`;
        return false;
      } finally {
        saving = false;
        updateAccess();
      }
    }
    save.addEventListener('click', () => { void saveWorkingProject(); });
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
