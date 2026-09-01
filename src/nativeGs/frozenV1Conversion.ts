import * as THREE from 'three';
import { visibleEntities, type EntityRecord, type ProjectState } from '../core/reduce';
import type { ProjectStore } from '../core/store';
import type { ProjectWorkspaceFS, WorkspaceReadableFile } from '../platform/fs';
import { detectFormat, disposeModelResources, loadModel, type ModelFormat } from '../viewer/loaders';
import { legacyV1MaterialSlotKey, nativeMaterialSlotKey } from './materialSlots';
import { inspectNativeGsPlyV1, inspectNativePointPlyV1 } from './plyProfile';
import {
  NATIVE_CAPTION_PIN_SCALE_MAX,
  NATIVE_CAPTION_PIN_SCALE_MIN,
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  NATIVE_GS_PROFILE_ID,
  NATIVE_IDENTITY_TRANSFORM,
  NATIVE_POINT_PROFILE_ID,
  isNativeImageMediaType,
  nativeModelProfileId,
  newNativeId,
  type NativeAssetBindingRevisionV1,
  type NativeAssetRevisionV1,
  type NativeAssetV1,
  type NativeCaptionV1,
  type NativeDisplaySetV1,
  type NativeMediaResourceDraftV1,
  type NativeMeshMaterialAppearanceV1,
  type NativeProjectDraftV1,
  type NativeProjectSnapshotV1,
  type NativeRepresentationDraftV1,
  type NativeSavedViewV1,
  type NativeSim3V1,
} from './schema';
import { digestNativeBytes, digestNativeStream } from './sha256';
import type { NativeBinarySource } from './storage';

const encoder = new TextEncoder();
const NATIVE_ID_SUFFIX = '[0-9A-HJKMNPQRSTVWXYZ]{26}';

export type FrozenV1ConversionIssueSeverity = 'info' | 'warning' | 'blocking';

export interface FrozenV1ConversionIssue {
  readonly severity: FrozenV1ConversionIssueSeverity;
  readonly code: string;
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly field: string | null;
  readonly message: string;
  readonly sourceValue?: string;
}

export interface FrozenV1ConversionMapping {
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly note?: string;
}

export interface FrozenV1SourceFingerprint {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface FrozenV1SourceInventory {
  readonly aggregateSha256: string;
  readonly operationCount: number;
  readonly operationSha256: string;
  readonly files: readonly FrozenV1SourceFingerprint[];
}

export interface FrozenV1ConversionReport {
  readonly format: 'lociview-frozen-v1-to-native-report';
  readonly version: 1;
  readonly completedAt: string;
  readonly source: {
    readonly projectId: string;
    readonly title: string;
    readonly projectDir: string;
    readonly before: FrozenV1SourceInventory;
    readonly after: FrozenV1SourceInventory;
    readonly unchanged: true;
  };
  readonly target: {
    readonly projectId: string;
    readonly title: string;
    readonly snapshotId: string;
    readonly generation: number;
  };
  readonly sourceVisibleCounts: Readonly<Record<string, number>>;
  readonly sourceDeletedCounts: Readonly<Record<string, number>>;
  readonly convertedCounts: Readonly<Record<string, number>>;
  readonly mappings: readonly FrozenV1ConversionMapping[];
  readonly issues: readonly FrozenV1ConversionIssue[];
}

export interface FrozenV1ConversionPlan {
  readonly sourceProjectId: string;
  readonly sourceTitle: string;
  readonly sourceDir: string;
  readonly sourceBefore: FrozenV1SourceInventory;
  readonly sourceVisibleCounts: Readonly<Record<string, number>>;
  readonly sourceDeletedCounts: Readonly<Record<string, number>>;
  readonly draft: NativeProjectDraftV1;
  readonly representationSources: ReadonlyMap<string, NativeBinarySource>;
  readonly mediaSources: ReadonlyMap<string, NativeBinarySource>;
  readonly mappings: readonly FrozenV1ConversionMapping[];
  readonly issues: readonly FrozenV1ConversionIssue[];
  readonly blockingIssueCount: number;
}

interface ConvertedAsset {
  readonly sourceId: string;
  readonly asset: NativeAssetV1;
  readonly binding: NativeAssetBindingRevisionV1;
  readonly revision: NativeAssetRevisionV1;
  readonly representation: NativeRepresentationDraftV1;
  readonly source: NativeBinarySource;
  readonly sourceRecord: EntityRecord;
  readonly sourceFile: WorkspaceReadableFile;
}

interface MaterialSlotTarget {
  readonly nativeKey: string;
  readonly opacity: number;
  readonly doubleSided: boolean;
}

function visibleAndDeletedCounts(state: ProjectState): {
  readonly visible: Record<string, number>;
  readonly deleted: Record<string, number>;
} {
  const visible: Record<string, number> = {};
  const deleted: Record<string, number> = {};
  for (const [kind, byId] of Object.entries(state.byKind)) {
    const current = visibleEntities(state, kind).length;
    if (current > 0) visible[kind] = current;
    const removed = Object.keys(byId).length - current;
    if (removed > 0) deleted[kind] = removed;
  }
  return { visible, deleted };
}

function sourceValue(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return String(value);
    return text;
  } catch {
    return String(value);
  }
}

function issue(
  issues: FrozenV1ConversionIssue[],
  severity: FrozenV1ConversionIssueSeverity,
  code: string,
  record: Pick<EntityRecord, 'kind' | 'id'>,
  field: string | null,
  message: string,
  value?: unknown,
): void {
  issues.push({
    severity,
    code,
    sourceKind: record.kind,
    sourceId: record.id,
    field,
    message,
    ...(value === undefined ? {} : { sourceValue: sourceValue(value) }),
  });
}

function nativeId(sourceId: string, prefix: Parameters<typeof newNativeId>[0]): string {
  return new RegExp(`^${prefix}_${NATIVE_ID_SUFFIX}$`).test(sourceId) ? sourceId : newNativeId(prefix);
}

function singleLine(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();
  return cleaned === '' ? fallback : cleaned.slice(0, 160);
}

function safeRelativePath(value: unknown): string | null {
  if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\')) return null;
  const parts = value.split('/');
  return parts.some((part) => part === '' || part === '.' || part === '..') ? null : value;
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

function imageMediaType(record: EntityRecord): string | null {
  const declared = record.fields.mime;
  const name = `${record.fields.originalName ?? ''}`.toLowerCase();
  const inferred = name.endsWith('.png')
    ? 'image/png'
    : name.endsWith('.jpg') || name.endsWith('.jpeg')
      ? 'image/jpeg'
      : name.endsWith('.webp')
        ? 'image/webp'
        : name.endsWith('.gif')
          ? 'image/gif'
          : null;
  if (declared === undefined) return inferred;
  if (typeof declared !== 'string') return null;
  const normalized = declared.trim().toLowerCase();
  if (!isNativeImageMediaType(normalized)) return null;
  return inferred === null || inferred === normalized ? normalized : null;
}

async function readPrefix(source: WorkspaceReadableFile, maxBytes = 64 * 1024): Promise<Uint8Array> {
  const reader = source.stream().getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < maxBytes) {
      const result = await reader.read();
      if (result.done) break;
      const remaining = maxBytes - length;
      const chunk = new Uint8Array(result.value).subarray(0, remaining);
      chunks.push(new Uint8Array(chunk));
      length += chunk.byteLength;
      if (chunk.byteLength < result.value.byteLength) break;
    }
    await reader.cancel();
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function collectBytes(source: WorkspaceReadableFile): Promise<Uint8Array> {
  if (source.blob !== undefined) return new Uint8Array(await (await source.blob()).arrayBuffer());
  const reader = source.stream().getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = new Uint8Array(result.value);
      chunks.push(chunk);
      length += chunk.byteLength;
      if (!Number.isSafeInteger(length) || length > source.size) throw new Error('source model stream length is invalid');
    }
  } finally {
    reader.releaseLock();
  }
  if (length !== source.size) throw new Error(`source model stream truncated (${length} != ${source.size})`);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function sourceBinary(file: WorkspaceReadableFile, mediaType: string): NativeBinarySource {
  return { size: file.size, mediaType, stream: () => file.stream() };
}

function assetTransform(record: EntityRecord, issues: FrozenV1ConversionIssue[]): NativeSim3V1 | null {
  const raw = record.fields.transform;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    issue(issues, 'info', 'asset-transform-default', record, 'transform', 'v1 default transform (scale 1, Y-up) was used because no explicit transform was stored.');
    return { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 };
  }
  const transform = raw as Record<string, unknown>;
  const scale = transform.scale;
  const upAxis = transform.upAxis;
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0 || (upAxis !== 'Y' && upAxis !== 'Z')) {
    issue(issues, 'blocking', 'asset-transform-invalid', record, 'transform', 'The stored v1 transform is invalid and was not guessed.', raw);
    return null;
  }
  return {
    translation: [0, 0, 0],
    rotationXYZW: upAxis === 'Z' ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, 0, 1],
    uniformScale: scale,
  };
}

function vec3(value: unknown): readonly [number, number, number] | null {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    ? value as [number, number, number]
    : null;
}

function validCameraBasis(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  up: readonly [number, number, number],
): boolean {
  const direction = target.map((component, index) => component - position[index]!) as [number, number, number];
  const directionLength = Math.hypot(...direction);
  const upLength = Math.hypot(...up);
  if (directionLength === 0 || upLength === 0) return false;
  const crossLength = Math.hypot(
    direction[1] * up[2] - direction[2] * up[1],
    direction[2] * up[0] - direction[0] * up[2],
    direction[0] * up[1] - direction[1] * up[0],
  );
  return Number.isFinite(crossLength) && crossLength / (directionLength * upLength) > 1e-12;
}

function hexColor(value: unknown): readonly [number, number, number] | null {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/iu.test(value)) return null;
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  ];
}

async function sourceInventory(
  fs: ProjectWorkspaceFS,
  dir: string,
  operations: readonly unknown[],
): Promise<FrozenV1SourceInventory> {
  const paths = (await fs.list(`${dir}/`)).filter((path) => path.startsWith(`${dir}/`)).sort();
  const files: FrozenV1SourceFingerprint[] = [];
  for (const path of paths) {
    const source = await fs.readStream(path);
    if (source === null) throw new Error(`v1 conversion: source file disappeared: ${path}`);
    const digest = await digestNativeStream(source.stream());
    if (digest.byteLength !== source.size) throw new Error(`v1 conversion: source file changed while hashing: ${path}`);
    files.push({ path, byteLength: digest.byteLength, sha256: digest.sha256 });
  }
  const operationDigest = digestNativeBytes(encoder.encode(JSON.stringify(operations)));
  const aggregate = digestNativeBytes(encoder.encode(JSON.stringify(files)));
  return {
    aggregateSha256: aggregate.sha256,
    operationCount: operations.length,
    operationSha256: operationDigest.sha256,
    files,
  };
}

function inventoriesEqual(a: FrozenV1SourceInventory, b: FrozenV1SourceInventory): boolean {
  return a.aggregateSha256 === b.aggregateSha256 && a.operationCount === b.operationCount &&
    a.operationSha256 === b.operationSha256 && JSON.stringify(a.files) === JSON.stringify(b.files);
}

function recordUnknownFields(
  record: EntityRecord,
  known: ReadonlySet<string>,
  issues: FrozenV1ConversionIssue[],
): void {
  for (const [field, value] of Object.entries(record.fields)) {
    if (!known.has(field)) {
      issue(issues, 'info', 'source-field-reported', record, field, 'This known source value has no first-lane native mapping and was recorded instead of discarded.', value);
    }
  }
}

async function materialTargets(asset: ConvertedAsset): Promise<Map<string, MaterialSlotTarget[]>> {
  const format = detectFormat(
    typeof asset.sourceRecord.fields.originalName === 'string'
      ? asset.sourceRecord.fields.originalName
      : String(asset.sourceRecord.fields.path ?? ''),
    await readPrefix(asset.sourceFile),
  );
  if (format === null || asset.representation.contentKind !== 'mesh') return new Map();
  const loaded = await loadModel(format, await collectBytes(asset.sourceFile), { gltfTextures: { kind: 'skip' } });
  const result = new Map<string, MaterialSlotTarget[]>();
  const add = (key: string, target: MaterialSlotTarget): void => {
    const current = result.get(key) ?? [];
    current.push(target);
    result.set(key, current);
  };
  const visit = (object: THREE.Object3D, path: readonly number[]): void => {
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material, slot) => {
        const target = {
          nativeKey: nativeMaterialSlotKey(path, slot),
          opacity: material.opacity,
          doubleSided: material.side === THREE.DoubleSide,
        };
        add(legacyV1MaterialSlotKey(object, loaded.root, slot), target);
        add(target.nativeKey, target);
      });
    }
    object.children.forEach((child, index) => visit(child, [...path, index]));
  };
  try {
    visit(loaded.root, []);
    return result;
  } finally {
    disposeModelResources(loaded.root);
  }
}

function parseMaterialAppearance(
  record: EntityRecord,
  displaySetId: string,
  asset: ConvertedAsset,
  target: MaterialSlotTarget,
  issues: FrozenV1ConversionIssue[],
): NativeMeshMaterialAppearanceV1 | null {
  const opacity = record.fields.opacity === undefined ? target.opacity : record.fields.opacity;
  const doubleSided = record.fields.doubleSided === undefined ? target.doubleSided : record.fields.doubleSided;
  const unlitValue = record.fields.unlit ?? record.fields.unlitLike ?? false;
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 ||
      typeof doubleSided !== 'boolean' || typeof unlitValue !== 'boolean') {
    issue(issues, 'warning', 'material-values-invalid', record, null, 'The material adjustment contains invalid values and was reported without applying it.', record.fields);
    return null;
  }
  const chromaInput = record.fields.chroma;
  let chromaEnabled = false;
  let chromaColor: readonly [number, number, number] = [0, 0, 0];
  let chromaTolerance = 0.1;
  let chromaFeather = 0;
  if (chromaInput !== undefined) {
    if (typeof chromaInput !== 'object' || chromaInput === null || Array.isArray(chromaInput)) {
      issue(issues, 'warning', 'material-chroma-invalid', record, 'chroma', 'The chroma adjustment is malformed and the material adjustment was not applied.', record.fields);
      return null;
    }
    const chroma = chromaInput as Record<string, unknown>;
    chromaEnabled = chroma.enable === true || chroma.enabled === true;
    const parsedColor = hexColor(chroma.color ?? '#000000');
    const tolerance = chroma.tolerance ?? 0.1;
    const feather = chroma.feather ?? 0;
    if (parsedColor === null || typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1 ||
        typeof feather !== 'number' || !Number.isFinite(feather) || feather < 0 || feather > 1) {
      issue(issues, 'warning', 'material-chroma-invalid', record, 'chroma', 'The chroma adjustment contains unsupported values and the material adjustment was not applied.', record.fields);
      return null;
    }
    chromaColor = parsedColor;
    chromaTolerance = tolerance;
    chromaFeather = feather;
  }
  return {
    id: nativeId(record.id, 'mat'),
    displaySetId,
    assetId: asset.asset.id,
    authoredAssetRevisionId: asset.revision.id,
    representationId: asset.representation.id,
    materialSlotKey: target.nativeKey,
    opacity,
    doubleSided,
    unlit: unlitValue,
    chroma: {
      enabled: chromaEnabled,
      colorSrgb: chromaColor,
      tolerance: chromaTolerance,
      feather: chromaFeather,
    },
  };
}

export async function planOpenedFrozenV1ToNative(
  fs: ProjectWorkspaceFS,
  dir: string,
  store: ProjectStore,
): Promise<FrozenV1ConversionPlan> {
  store.assertWorkspace(fs, dir);
  store.assertMutationAllowed();
  if (store.durabilityStatus.phase !== 'durable' || store.durabilityStatus.pending !== 0) {
    throw new Error('v1 conversion: source must already be durably saved before conversion begins');
  }
  if (store.loadErrors.length > 0) {
    throw new Error('v1 conversion: source contains malformed operation-log lines; conversion is fail-closed');
  }
  const sourceOps = structuredClone([...store.allOps]);
  const sourceBefore = await sourceInventory(fs, dir, sourceOps);
  const { visible: sourceVisibleCounts, deleted: sourceDeletedCounts } = visibleAndDeletedCounts(store.state);
  const issues: FrozenV1ConversionIssue[] = [];
  const mappings: FrozenV1ConversionMapping[] = [];
  const projectId = newNativeId('prj');
  const projectFrameId = newNativeId('frm');

  const setRecords = visibleEntities(store.state, 'set').sort((a, b) => {
    const aOrder = typeof a.fields.order === 'number' ? a.fields.order : Number.MAX_SAFE_INTEGER;
    const bOrder = typeof b.fields.order === 'number' ? b.fields.order : Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);
  });
  const displaySets: NativeDisplaySetV1[] = [];
  const setIds = new Map<string, string>();
  if (setRecords.length === 0) {
    displaySets.push({ id: NATIVE_DEFAULT_DISPLAY_SET_ID, name: 'Default', orderKey: '000000', defaultSavedViewId: null });
  } else {
    setRecords.forEach((record, index) => {
      const targetId = nativeId(record.id, 'set');
      const name = singleLine(record.fields.name, `表示セット ${index + 1}`);
      setIds.set(record.id, targetId);
      displaySets.push({
        id: targetId,
        name,
        orderKey: String(index).padStart(6, '0'),
        defaultSavedViewId: null,
      });
      mappings.push({ sourceKind: 'set', sourceId: record.id, targetKind: 'DisplaySet', targetId });
      if (typeof record.fields.name !== 'string' || record.fields.name !== name) {
        issue(issues, 'warning', 'display-set-name-repaired', record, 'name', 'The invalid or non-displayable DisplaySet name was reported and replaced with a safe visible name.', record.fields.name);
      }
      if (record.fields.order !== undefined && (typeof record.fields.order !== 'number' || !Number.isFinite(record.fields.order))) {
        issue(issues, 'warning', 'display-set-order-reported', record, 'order', 'The invalid DisplaySet order was reported; deterministic source order was used.', record.fields.order);
      }
      recordUnknownFields(record, new Set(['name', 'order']), issues);
    });
  }
  const fallbackDisplaySetId = displaySets[0]!.id;

  const assets: ConvertedAsset[] = [];
  const representationSources = new Map<string, NativeBinarySource>();
  const sourceAssetToTarget = new Map<string, ConvertedAsset>();
  for (const record of visibleEntities(store.state, 'asset')) {
    if (record.fields.kind !== 'model') continue;
    const path = safeRelativePath(record.fields.path);
    if (path === null || !path.startsWith('models/')) {
      issue(issues, 'blocking', 'model-path-invalid', record, 'path', 'The source model path is unsafe or missing and was not guessed.', record.fields.path);
      continue;
    }
    const sourceFile = await fs.readStream(`${dir}/${path}`);
    if (sourceFile === null) {
      issue(issues, 'blocking', 'model-bytes-missing', record, 'path', 'The source model bytes are missing.', path);
      continue;
    }
    if (typeof record.fields.size === 'number' && record.fields.size !== sourceFile.size) {
      issue(issues, 'blocking', 'model-size-mismatch', record, 'size', 'The source model size does not match its v1 record.', record.fields.size);
      continue;
    }
    const head = await readPrefix(sourceFile);
    const format = detectFormat(typeof record.fields.originalName === 'string' ? record.fields.originalName : path, head);
    if (format === null) {
      issue(issues, 'blocking', 'model-format-unsupported', record, 'path', 'The source model format is not supported by the native receiver.', path);
      continue;
    }
    const transform = assetTransform(record, issues);
    if (transform === null) continue;
    const assetId = nativeId(record.id, 'ast');
    const assetFrameId = newNativeId('frm');
    const bindingId = newNativeId('bnd');
    const revisionId = newNativeId('rev');
    const representationId = newNativeId('rep');
    const familyId = newNativeId('fam');
    let contentKind: NativeRepresentationDraftV1['contentKind'] = 'mesh';
    let role: NativeRepresentationDraftV1['role'] = 'meshPrimary';
    let profileId = nativeModelProfileId(format);
    let gsPly: NativeRepresentationDraftV1['gsPly'];
    let pointPly: NativeRepresentationDraftV1['pointPly'];
    if (format === 'ply') {
      const gsInspection = await inspectNativeGsPlyV1(sourceFile);
      if (gsInspection.kind === 'supported-gs') {
        contentKind = 'gaussianSplat';
        role = 'gsPrimary';
        profileId = NATIVE_GS_PROFILE_ID;
        gsPly = gsInspection.facts;
      } else {
        const pointInspection = await inspectNativePointPlyV1(sourceFile);
        if (pointInspection.kind === 'supported-point') {
          contentKind = 'pointCloud';
          role = 'pointPrimary';
          profileId = NATIVE_POINT_PROFILE_ID;
          pointPly = pointInspection.facts;
        }
      }
    }
    const sourcePinScale = record.fields.pinScale;
    const pinScale = typeof sourcePinScale === 'number' && Number.isFinite(sourcePinScale) &&
      sourcePinScale >= NATIVE_CAPTION_PIN_SCALE_MIN && sourcePinScale <= NATIVE_CAPTION_PIN_SCALE_MAX
      ? sourcePinScale
      : undefined;
    if (sourcePinScale !== undefined && pinScale === undefined) {
      issue(issues, 'warning', 'pin-scale-invalid', record, 'pinScale',
        `v1 pinScale must be between ${NATIVE_CAPTION_PIN_SCALE_MIN} and ${NATIVE_CAPTION_PIN_SCALE_MAX}; the native Asset uses its default scale.`,
        sourcePinScale);
    }
    const asset: NativeAssetV1 = {
      id: assetId,
      label: singleLine(record.fields.originalName, `Model ${assets.length + 1}`).replace(/\.[^.]+$/u, ''),
      assetFrameId,
      status: { kind: 'ready', activeBindingId: bindingId },
      ...(pinScale === undefined ? {} : { pinScale }),
    };
    const binding: NativeAssetBindingRevisionV1 = {
      id: bindingId,
      assetId,
      assetRevisionId: revisionId,
      assetToProject: transform,
      method: 'import',
    };
    const revision: NativeAssetRevisionV1 = {
      id: revisionId,
      assetId,
      representationIds: [representationId],
      anchorCompatibilityClasses: [{ id: newNativeId('cls'), targetVariantFamilyIds: [familyId] }],
    };
    const representation: NativeRepresentationDraftV1 = {
      id: representationId,
      assetId,
      representationFrameId: newNativeId('frm'),
      contentKind,
      purposes: ['source', 'display'],
      role,
      variantFamilyId: familyId,
      formatProfile: { id: profileId },
      representationToAsset: NATIVE_IDENTITY_TRANSFORM,
      derivedFrom: [],
      ...(gsPly === undefined ? {} : { gsPly }),
      ...(pointPly === undefined ? {} : { pointPly }),
      mediaType: modelMediaType(format),
    };
    const source = sourceBinary(sourceFile, representation.mediaType);
    const converted = { sourceId: record.id, asset, binding, revision, representation, source, sourceRecord: record, sourceFile };
    assets.push(converted);
    sourceAssetToTarget.set(record.id, converted);
    representationSources.set(representationId, source);
    mappings.push({ sourceKind: 'asset', sourceId: record.id, targetKind: 'Asset', targetId: assetId });
    mappings.push({ sourceKind: 'asset-bytes', sourceId: record.id, targetKind: 'Representation', targetId: representationId, note: `${sourceFile.size} bytes, unchanged` });
    recordUnknownFields(record, new Set(['kind', 'path', 'optimizedPath', 'originalName', 'mime', 'size', 'transform', 'pinScale']), issues);
    if (record.fields.optimizedPath !== undefined) issue(issues, 'info', 'optimized-copy-reported', record, 'optimizedPath', 'The original source bytes were preserved; the derived display copy was reported rather than becoming a second authority.', record.fields.optimizedPath);
  }

  const mediaResources: NativeMediaResourceDraftV1[] = [];
  const mediaSources = new Map<string, NativeBinarySource>();
  const sourceMediaToTarget = new Map<string, string>();
  for (const record of visibleEntities(store.state, 'asset')) {
    if (record.fields.kind !== 'image') {
      if (record.fields.kind !== 'model') issue(issues, 'warning', 'asset-kind-reported', record, 'kind', 'This v1 Asset kind is not supported by the first native migration lane and was reported.', record.fields);
      continue;
    }
    const path = safeRelativePath(record.fields.path);
    const mediaType = imageMediaType(record);
    if (path === null || (!path.startsWith('media/') && !path.startsWith('thumbs/')) || mediaType === null) {
      issue(issues, 'blocking', 'image-source-invalid', record, path === null ? 'path' : 'mime', 'The image source path or media type is invalid and was not guessed.');
      continue;
    }
    const sourceFile = await fs.readStream(`${dir}/${path}`);
    if (sourceFile === null) {
      issue(issues, 'blocking', 'image-bytes-missing', record, 'path', 'The source image bytes are missing.', path);
      continue;
    }
    if (typeof record.fields.size === 'number' && record.fields.size !== sourceFile.size) {
      issue(issues, 'blocking', 'image-size-mismatch', record, 'size', 'The source image size does not match its v1 record.', record.fields.size);
      continue;
    }
    const mediaId = nativeId(record.id.replace(/^ast_/u, 'med_'), 'med');
    mediaResources.push({
      id: mediaId,
      label: singleLine(record.fields.originalName, `Image ${mediaResources.length + 1}`),
      kind: 'image',
      mediaType,
    });
    sourceMediaToTarget.set(record.id, mediaId);
    mediaSources.set(mediaId, sourceBinary(sourceFile, mediaType));
    mappings.push({ sourceKind: 'asset', sourceId: record.id, targetKind: 'Caption media', targetId: mediaId, note: `${sourceFile.size} bytes, unchanged` });
    recordUnknownFields(record, new Set(['kind', 'path', 'originalName', 'mime', 'size']), issues);
  }

  const captions: NativeCaptionV1[] = [];
  for (const record of visibleEntities(store.state, 'caption')) {
    const explicitSetId = typeof record.fields.setId === 'string' ? setIds.get(record.fields.setId) : undefined;
    if (explicitSetId === undefined && (record.fields.setId !== undefined || setRecords.length > 0)) {
      issue(issues, 'blocking', 'caption-set-unresolved', record, 'setId', 'The Caption has no exact active DisplaySet relationship. Conversion was blocked instead of assigning a fallback set.', record.fields);
      continue;
    }
    const displaySetId = explicitSetId ?? fallbackDisplaySetId;
    let anchor: NativeCaptionV1['anchor'] = null;
    const rawAnchor = record.fields.anchor;
    if (typeof rawAnchor === 'object' && rawAnchor !== null && !Array.isArray(rawAnchor)) {
      const sourceAnchor = rawAnchor as Record<string, unknown>;
      const owner = typeof sourceAnchor.modelAssetId === 'string' ? sourceAssetToTarget.get(sourceAnchor.modelAssetId) : undefined;
      const position = vec3(sourceAnchor.position);
      if (owner !== undefined && position !== null) {
        const compatibility = owner.revision.anchorCompatibilityClasses[0]!;
        anchor = {
          kind: 'asset',
          assetId: owner.asset.id,
          assetFrameId: owner.asset.assetFrameId,
          positionAsset: position,
          authoredAssetRevisionId: owner.revision.id,
          authoredAnchorCompatibilityId: compatibility.id,
          hitEvidence: { method: 'manual' },
        };
        if (sourceAnchor.normal !== undefined) issue(issues, 'info', 'caption-normal-reported', record, 'anchor.normal', 'The v1 surface normal is not a native position authority and was recorded.', sourceAnchor.normal);
      } else {
        issue(issues, 'warning', 'caption-anchor-unresolved', record, 'anchor', 'The Caption content was retained as unplaced because its exact owner or position is unavailable.', rawAnchor);
      }
    }
    const attachmentIds: string[] = [];
    if (Array.isArray(record.fields.attachments)) {
      for (const sourceAttachmentId of record.fields.attachments) {
        const mediaId = typeof sourceAttachmentId === 'string' ? sourceMediaToTarget.get(sourceAttachmentId) : undefined;
        if (mediaId === undefined) {
          issue(issues, 'warning', 'caption-attachment-unresolved', record, 'attachments', 'An attachment reference was reported because its exact image bytes are unavailable.', sourceAttachmentId);
        } else if (attachmentIds.includes(mediaId)) {
          issue(issues, 'warning', 'caption-attachment-duplicate', record, 'attachments', 'A duplicate attachment reference was recorded once in the native Caption and retained in this report.', record.fields.attachments);
        } else {
          attachmentIds.push(mediaId);
        }
      }
    } else if (record.fields.attachments !== undefined) {
      issue(issues, 'warning', 'caption-attachments-invalid', record, 'attachments', 'The attachment list is malformed and was reported.', record.fields.attachments);
    }
    const sourceTitle = typeof record.fields.title === 'string' ? record.fields.title : '';
    const sourceBody = typeof record.fields.body === 'string' ? record.fields.body : '';
    if (record.fields.title !== undefined && typeof record.fields.title !== 'string') {
      issue(issues, 'warning', 'caption-title-invalid', record, 'title', 'The invalid Caption title was reported and not interpreted as text.', record.fields.title);
    }
    if (record.fields.body !== undefined && typeof record.fields.body !== 'string') {
      issue(issues, 'warning', 'caption-body-invalid', record, 'body', 'The invalid Caption body was reported and not interpreted as text.', record.fields.body);
    }
    if (sourceTitle === '' && sourceBody === '' && attachmentIds.length === 0) {
      issue(issues, 'info', 'empty-caption-reported', record, null, 'The empty v1 Caption was reported and not promoted to a user-visible native Caption.', record.fields);
      continue;
    }
    const title = singleLine(sourceTitle, '（無題）');
    if (sourceTitle.trim() === '') issue(issues, 'info', 'caption-title-placeholder', record, 'title', 'A visible placeholder title was added while preserving the original empty title in this report.', sourceTitle);
    else if (title !== sourceTitle) issue(issues, 'warning', 'caption-title-normalized', record, 'title', 'Control characters or excess title length were normalized for the native Caption and the source title was recorded.', sourceTitle);
    let validColor = false;
    let color = '#eab308';
    if (typeof record.fields.color === 'string' && /^#[0-9a-f]{6}$/iu.test(record.fields.color)) {
      validColor = true;
      color = record.fields.color.toLowerCase();
    }
    if (record.fields.color !== undefined && !validColor) {
      issue(issues, 'warning', 'caption-color-invalid', record, 'color', 'The invalid v1 color was reported; the established default pin color was used.', record.fields.color);
    }
    const tags = Array.isArray(record.fields.tags)
      ? [...new Set(record.fields.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => singleLine(tag, ''))
        .filter((tag) => tag !== ''))]
      : [];
    if (record.fields.tags !== undefined && (
      !Array.isArray(record.fields.tags) ||
      record.fields.tags.some((tag) => typeof tag !== 'string' || tag.trim() === '') ||
      JSON.stringify(tags) !== JSON.stringify(record.fields.tags)
    )) {
      issue(issues, 'warning', 'caption-tags-reported', record, 'tags', 'Invalid or duplicate Caption tags were reported; only distinct non-empty text tags were retained.', record.fields.tags);
    }
    captions.push({
      id: nativeId(record.id, 'cap'),
      title,
      body: sourceBody,
      displaySetId,
      color,
      tags,
      attachmentMediaIds: attachmentIds,
      anchor,
    });
    mappings.push({ sourceKind: 'caption', sourceId: record.id, targetKind: 'Caption', targetId: captions.at(-1)!.id, note: anchor === null ? 'unplaced' : 'asset-local position preserved' });
    recordUnknownFields(record, new Set(['setId', 'title', 'body', 'color', 'tags', 'attachments', 'anchor']), issues);
  }

  const savedViews: NativeSavedViewV1[] = [];
  for (const [index, record] of visibleEntities(store.state, 'view').entries()) {
    const resolvedViewSetId = typeof record.fields.setId === 'string' ? setIds.get(record.fields.setId) : undefined;
    if (resolvedViewSetId === undefined && (record.fields.setId !== undefined || setRecords.length > 0)) {
      issue(issues, 'blocking', 'saved-view-set-unresolved', record, 'setId', 'The Saved View has no exact active DisplaySet relationship. Conversion was blocked instead of assigning a fallback set.', record.fields);
      continue;
    }
    const displaySetId = resolvedViewSetId ?? fallbackDisplaySetId;
    const cameraState = record.fields.cameraState;
    if (typeof cameraState !== 'object' || cameraState === null || Array.isArray(cameraState)) {
      issue(issues, 'warning', 'saved-view-invalid', record, 'cameraState', 'The Saved View camera is malformed and was reported.', record.fields);
      continue;
    }
    const camera = cameraState as Record<string, unknown>;
    const position = vec3(camera.eye);
    const target = vec3(camera.target);
    const up = vec3(camera.up);
    const fov = camera.fov;
    if (
      position === null || target === null || up === null || !validCameraBasis(position, target, up) ||
      typeof fov !== 'number' || !Number.isFinite(fov) || fov <= 1 || fov >= 179 ||
      typeof camera.ortho !== 'boolean'
    ) {
      issue(issues, 'warning', 'saved-view-invalid', record, 'cameraState', 'The Saved View camera values are invalid and were reported.', record.fields);
      continue;
    }
    const radians = THREE.MathUtils.degToRad(fov);
    if (camera.ortho === true) {
      issue(issues, 'warning', 'orthographic-view-reported', record, 'cameraState', 'v1 did not store the orthographic span required for an exact native Saved View, so this view was reported without inventing one.', record.fields);
      continue;
    }
    const background = hexColor(record.fields.background) ?? [16 / 255, 16 / 255, 16 / 255] as const;
    if (hexColor(record.fields.background) === null) issue(issues, 'warning', 'saved-view-background-invalid', record, 'background', 'The background color was invalid; the established dark default was used.', record.fields.background);
    const targetId = nativeId(record.id, 'view');
    savedViews.push({
      id: targetId,
      name: singleLine(record.fields.name, `ビュー ${index + 1}`),
      orderKey: String(index).padStart(6, '0'),
      projectFrameId,
      camera: {
        position,
        target,
        up,
        projection: { kind: 'perspective', verticalFovRadians: radians },
      },
      background: { kind: 'solid', colorSrgb: background },
      displaySetId,
    });
    mappings.push({ sourceKind: 'view', sourceId: record.id, targetKind: 'SavedView', targetId });
    recordUnknownFields(record, new Set(['setId', 'name', 'cameraState', 'background']), issues);
  }

  const meshMaterialAppearances: NativeMeshMaterialAppearanceV1[] = [];
  const targetCache = new Map<string, Map<string, MaterialSlotTarget[]>>();
  for (const record of visibleEntities(store.state, 'material')) {
    const sourceAssetId = typeof record.fields.modelAssetId === 'string' ? record.fields.modelAssetId : '';
    const asset = sourceAssetToTarget.get(sourceAssetId);
    const displaySetId = typeof record.fields.setId === 'string' ? setIds.get(record.fields.setId) : undefined;
    const materialKey = typeof record.fields.materialKey === 'string' ? record.fields.materialKey : '';
    if (asset === undefined || displaySetId === undefined || materialKey === '') {
      issue(issues, 'warning', 'material-relation-unresolved', record, null, 'The material adjustment has no exact converted Asset, DisplaySet, or key and was reported without guessing.', record.fields);
      continue;
    }
    let targets = targetCache.get(asset.sourceId);
    if (targets === undefined) {
      try {
        targets = await materialTargets(asset);
      } catch (error) {
        issue(issues, 'warning', 'material-inspection-failed', record, 'materialKey', 'The model could not be inspected for an exact material target; the adjustment was reported.', { fields: record.fields, error: error instanceof Error ? error.message : error });
        continue;
      }
      targetCache.set(asset.sourceId, targets);
    }
    const candidates = targets.get(materialKey) ?? [];
    if (candidates.length !== 1) {
      issue(issues, 'warning', candidates.length === 0 ? 'material-key-unresolved' : 'material-key-ambiguous', record, 'materialKey', candidates.length === 0
        ? 'No exact source material slot matches this v1 key; it was reported without name-based guessing.'
        : 'The v1 key matches multiple surfaces; it was reported without choosing one.', record.fields);
      continue;
    }
    const appearance = parseMaterialAppearance(record, displaySetId, asset, candidates[0]!, issues);
    if (appearance !== null) {
      meshMaterialAppearances.push(appearance);
      mappings.push({ sourceKind: 'material', sourceId: record.id, targetKind: 'MeshMaterialAppearance', targetId: appearance.id });
    }
    recordUnknownFields(record, new Set(['setId', 'modelAssetId', 'materialKey', 'opacity', 'doubleSided', 'unlit', 'unlitLike', 'chroma']), issues);
  }

  for (const record of visibleEntities(store.state, 'profile')) {
    issue(issues, 'info', 'profile-reported', record, null, 'Editor profile is not copied into the new native Project authority.', record.fields);
  }
  for (const kind of Object.keys(store.state.byKind)) {
    if (new Set(['profile', 'set', 'asset', 'caption', 'view', 'material']).has(kind)) continue;
    for (const record of visibleEntities(store.state, kind)) {
      issue(issues, 'warning', 'record-kind-reported', record, null, 'This known v1 record kind has no first-lane native mapping and was recorded.', record.fields);
    }
  }
  for (const [kind, count] of Object.entries(sourceDeletedCounts)) {
    issues.push({
      severity: 'info',
      code: 'deleted-records-reported',
      sourceKind: kind,
      sourceId: '*',
      field: null,
      message: `${count} deleted/tombstoned ${kind} record(s) remain in the read-only source history and are not active native records.`,
    });
  }

  if (assets.length === 0) {
    issues.push({ severity: 'blocking', code: 'no-convertible-model', sourceKind: 'project', sourceId: store.manifest.projectId, field: null, message: 'The first migration lane requires at least one convertible model Asset.' });
  }
  const gsAssetId = assets.find((asset) => asset.representation.role === 'gsPrimary')?.asset.id ?? null;
  const modelAssetId = assets.find((asset) => asset.representation.role !== 'gsPrimary')?.asset.id ?? null;
  const draft: NativeProjectDraftV1 = {
    project: {
      id: projectId,
      title: `${singleLine(store.manifest.name, 'LociView project')} (Native)`.slice(0, 160),
      frame: { id: projectFrameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } },
    },
    assets: assets.map((asset) => asset.asset),
    assetBindingRevisions: assets.map((asset) => asset.binding),
    assetRevisions: assets.map((asset) => asset.revision),
    representations: assets.map((asset) => asset.representation),
    presentation: {
      displayMode: gsAssetId !== null && modelAssetId !== null ? 'mixed' : gsAssetId !== null ? 'gs-only' : 'mesh-only',
      captionTargetAssetId: modelAssetId ?? gsAssetId,
      hiddenAssetIds: [],
      activeDisplaySetId: fallbackDisplaySetId,
    },
    captions,
    savedViews,
    displaySets,
    meshMaterialAppearances,
    mediaResources,
  };
  store.assertMutationAllowed();
  return {
    sourceProjectId: store.manifest.projectId,
    sourceTitle: store.manifest.name,
    sourceDir: dir,
    sourceBefore,
    sourceVisibleCounts,
    sourceDeletedCounts,
    draft,
    representationSources,
    mediaSources,
    mappings,
    issues,
    blockingIssueCount: issues.filter((entry) => entry.severity === 'blocking').length,
  };
}

export async function assertOpenedFrozenV1SourceUnchanged(
  plan: FrozenV1ConversionPlan,
  fs: ProjectWorkspaceFS,
  store: ProjectStore,
): Promise<FrozenV1SourceInventory> {
  store.assertWorkspace(fs, plan.sourceDir);
  store.assertMutationAllowed();
  const after = await sourceInventory(fs, plan.sourceDir, [...store.allOps]);
  store.assertMutationAllowed();
  if (!inventoriesEqual(plan.sourceBefore, after)) {
    throw new Error('v1 conversion: source changed during conversion; the native result must not be kept active');
  }
  return after;
}

export function completeOpenedFrozenV1ConversionReport(
  plan: FrozenV1ConversionPlan,
  snapshot: NativeProjectSnapshotV1,
  sourceAfter: FrozenV1SourceInventory,
): FrozenV1ConversionReport {
  if (!inventoriesEqual(plan.sourceBefore, sourceAfter)) throw new Error('v1 conversion: cannot report a changed source as unchanged');
  const convertedCounts: Record<string, number> = {};
  for (const mapping of plan.mappings) convertedCounts[mapping.targetKind] = (convertedCounts[mapping.targetKind] ?? 0) + 1;
  return {
    format: 'lociview-frozen-v1-to-native-report',
    version: 1,
    completedAt: new Date().toISOString(),
    source: {
      projectId: plan.sourceProjectId,
      title: plan.sourceTitle,
      projectDir: plan.sourceDir,
      before: plan.sourceBefore,
      after: sourceAfter,
      unchanged: true,
    },
    target: {
      projectId: snapshot.project.id,
      title: snapshot.project.title,
      snapshotId: snapshot.snapshotId,
      generation: snapshot.generation,
    },
    sourceVisibleCounts: plan.sourceVisibleCounts,
    sourceDeletedCounts: plan.sourceDeletedCounts,
    convertedCounts,
    mappings: plan.mappings,
    issues: plan.issues,
  };
}

export function serializeFrozenV1ConversionReport(report: FrozenV1ConversionReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function serializeFrozenV1ConversionPreflight(plan: FrozenV1ConversionPlan): string {
  return `${JSON.stringify({
    format: 'lociview-frozen-v1-to-native-preflight-report',
    version: 1,
    createdAt: new Date().toISOString(),
    source: {
      projectId: plan.sourceProjectId,
      title: plan.sourceTitle,
      projectDir: plan.sourceDir,
      fingerprint: plan.sourceBefore,
    },
    plannedTarget: { projectId: plan.draft.project.id, title: plan.draft.project.title },
    sourceVisibleCounts: plan.sourceVisibleCounts,
    sourceDeletedCounts: plan.sourceDeletedCounts,
    mappings: plan.mappings,
    issues: plan.issues,
    blockingIssueCount: plan.blockingIssueCount,
  }, null, 2)}\n`;
}
