import { ulid } from '../core/ids';
import { parseJsonWithoutDuplicateMembers } from '../core/json';
import type { NativeGsPlyFactsV1, NativePointPlyFactsV1 } from './plyProfile';

export const NATIVE_SNAPSHOT_FORMAT = 'lociview-native-project-snapshot' as const;
export const NATIVE_ACTIVE_FORMAT = 'lociview-native-project-active' as const;
export const NATIVE_SCHEMA_VERSION = 1 as const;
export const NATIVE_GS_PROFILE_ID = 'lociview-native-graphdeco-ply-le-sh2-sh3-v1' as const;
export const NATIVE_POINT_PROFILE_ID = 'lociview-native-point-ply-ascii-xyz-rgb-v1' as const;
export const NATIVE_CAPTION_PIN_SCALE_MIN = 0.001 as const;
export const NATIVE_CAPTION_PIN_SCALE_MAX = 1000 as const;
export const NATIVE_CAPTION_PIN_SCALE_DEFAULT = 1 as const;

export type NativeDisplayMode = 'mixed' | 'gs-only' | 'mesh-only';
export type NativeModelFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'ply';
export type NativeRepresentationRole = 'meshPrimary' | 'pointPrimary' | 'gsPrimary' | 'interactionProxy';

export type NativeIdPrefix = 'prj' | 'snp' | 'ast' | 'rev' | 'bnd' | 'rep' | 'frm' | 'fam' | 'cls' | 'cap' | 'view' | 'set' | 'mat' | 'med';

export const NATIVE_DEFAULT_DISPLAY_SET_ID = 'set_00000000000000000000000000' as const;

export function isNativeImageMediaType(value: unknown): value is 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif';
}

export function newNativeId(prefix: NativeIdPrefix): string {
  return `${prefix}_${ulid()}`;
}

export interface NativeSim3V1 {
  readonly translation: readonly [number, number, number];
  readonly rotationXYZW: readonly [number, number, number, number];
  readonly uniformScale: number;
}

export interface NativeCanonicalTransformV1 extends NativeSim3V1 {
  readonly reflection: 'none' | 'x';
}

export const NATIVE_IDENTITY_SIM3: NativeSim3V1 = Object.freeze({
  translation: [0, 0, 0] as const,
  rotationXYZW: [0, 0, 0, 1] as const,
  uniformScale: 1,
});

export const NATIVE_IDENTITY_TRANSFORM: NativeCanonicalTransformV1 = Object.freeze({
  ...NATIVE_IDENTITY_SIM3,
  reflection: 'none' as const,
});

export interface NativeBlobRefV1 {
  readonly algorithm: 'sha256';
  readonly digest: string;
  readonly byteLength: number;
  readonly mediaType: string;
}

export interface NativeAssetV1 {
  readonly id: string;
  readonly label: string;
  readonly assetFrameId: string;
  readonly status: { readonly kind: 'ready'; readonly activeBindingId: string };
  readonly pinScale?: number;
}

export interface NativeAssetBindingRevisionV1 {
  readonly id: string;
  readonly assetId: string;
  readonly assetRevisionId: string;
  readonly assetToProject: NativeSim3V1;
  readonly method: 'import' | 'manual';
}

export interface NativeAnchorCompatibilityClassV1 {
  readonly id: string;
  readonly targetVariantFamilyIds: readonly string[];
}

export interface NativeAssetRevisionV1 {
  readonly id: string;
  readonly assetId: string;
  readonly representationIds: readonly string[];
  readonly anchorCompatibilityClasses: readonly NativeAnchorCompatibilityClassV1[];
}

export interface NativeFormatProfileRefV1 {
  readonly id: string;
}

export interface NativeRepresentationV1 {
  readonly id: string;
  readonly assetId: string;
  readonly representationFrameId: string;
  readonly contentKind: 'mesh' | 'pointCloud' | 'gaussianSplat';
  readonly purposes: readonly ('source' | 'display' | 'interaction')[];
  readonly role: NativeRepresentationRole;
  readonly variantFamilyId: string;
  readonly formatProfile: NativeFormatProfileRefV1;
  readonly blob: NativeBlobRefV1;
  readonly representationToAsset: NativeCanonicalTransformV1;
  readonly derivedFrom: readonly string[];
  readonly proxyForGsVariantFamilyId?: string;
  readonly gsPly?: NativeGsPlyFactsV1;
  readonly pointPly?: NativePointPlyFactsV1;
}

export interface NativeCaptionV1 {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly displaySetId?: string;
  readonly color?: string;
  readonly tags?: readonly string[];
  readonly attachmentMediaIds?: readonly string[];
  readonly anchor: {
    readonly kind: 'asset';
    readonly assetId: string;
    readonly assetFrameId: string;
    readonly positionAsset: readonly [number, number, number];
    readonly authoredAssetRevisionId: string;
    readonly authoredAnchorCompatibilityId: string;
    readonly hitEvidence: { readonly method: 'manual' };
  } | null;
}

export type NativeProjectCameraProjectionV1 =
  | { readonly kind: 'perspective'; readonly verticalFovRadians: number }
  | { readonly kind: 'orthographic'; readonly verticalSpan: number };

export interface NativeProjectCameraV1 {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly projection: NativeProjectCameraProjectionV1;
}

export interface NativeSolidBackgroundV1 {
  readonly kind: 'solid';
  readonly colorSrgb: readonly [number, number, number];
}

export interface NativeSavedViewV1 {
  readonly id: string;
  readonly name: string;
  readonly orderKey: string;
  readonly projectFrameId: string;
  readonly camera: NativeProjectCameraV1;
  readonly background: NativeSolidBackgroundV1;
  readonly displaySetId?: string;
}

export interface NativeDisplaySetV1 {
  readonly id: string;
  readonly name: string;
  readonly orderKey: string;
  readonly defaultSavedViewId: string | null;
}

export interface NativeChromaAppearanceV1 {
  readonly enabled: boolean;
  readonly colorSrgb: readonly [number, number, number];
  readonly tolerance: number;
  readonly feather: number;
}

export interface NativeMeshMaterialAppearanceV1 {
  readonly id: string;
  readonly displaySetId: string;
  readonly assetId: string;
  readonly authoredAssetRevisionId: string;
  readonly representationId: string;
  readonly materialSlotKey: string;
  readonly opacity: number;
  readonly doubleSided: boolean;
  readonly unlit: boolean;
  readonly chroma: NativeChromaAppearanceV1;
}

export interface NativeMediaResourceV1 {
  readonly id: string;
  readonly label: string;
  readonly kind: 'image';
  readonly blob: NativeBlobRefV1;
}

export interface NativeProjectSnapshotV1 {
  readonly format: typeof NATIVE_SNAPSHOT_FORMAT;
  readonly schemaVersion: typeof NATIVE_SCHEMA_VERSION;
  readonly snapshotId: string;
  readonly generation: number;
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly frame: {
      readonly id: string;
      readonly handedness: 'right';
      readonly upAxis: '+Y';
      readonly unit: { readonly kind: 'unknown' } | { readonly kind: 'meters'; readonly metersPerProjectUnit: 1 };
    };
  };
  readonly assets: readonly NativeAssetV1[];
  readonly assetBindingRevisions: readonly NativeAssetBindingRevisionV1[];
  readonly assetRevisions: readonly NativeAssetRevisionV1[];
  readonly representations: readonly NativeRepresentationV1[];
  readonly presentation: {
    readonly displayMode: NativeDisplayMode;
    readonly captionTargetAssetId: string | null;
    readonly hiddenAssetIds?: readonly string[];
    readonly activeDisplaySetId?: string;
  };
  readonly captions: readonly NativeCaptionV1[];
  readonly savedViews?: readonly NativeSavedViewV1[];
  readonly displaySets?: readonly NativeDisplaySetV1[];
  readonly meshMaterialAppearances?: readonly NativeMeshMaterialAppearanceV1[];
  readonly mediaResources?: readonly NativeMediaResourceV1[];
}

export interface NativeActiveMarkerV1 {
  readonly format: typeof NATIVE_ACTIVE_FORMAT;
  readonly schemaVersion: typeof NATIVE_SCHEMA_VERSION;
  readonly projectId: string;
  readonly generation: number;
  readonly snapshotId: string;
  readonly snapshotByteLength: number;
  readonly snapshotSha256: string;
}

export interface NativeRepresentationDraftV1 extends Omit<NativeRepresentationV1, 'blob'> {
  readonly mediaType: string;
}

export interface NativeMediaResourceDraftV1 extends Omit<NativeMediaResourceV1, 'blob'> {
  readonly mediaType: string;
}

export interface NativeProjectDraftV1 extends Omit<NativeProjectSnapshotV1, 'format' | 'schemaVersion' | 'snapshotId' | 'generation' | 'representations' | 'mediaResources'> {
  readonly representations: readonly NativeRepresentationDraftV1[];
  readonly mediaResources?: readonly NativeMediaResourceDraftV1[];
}

export function nativeDisplaySetsV1(snapshot: NativeProjectSnapshotV1): readonly NativeDisplaySetV1[] {
  return snapshot.displaySets ?? [{
    id: NATIVE_DEFAULT_DISPLAY_SET_ID,
    name: 'Default',
    orderKey: '000000',
    defaultSavedViewId: null,
  }];
}

export function nativeCaptionDisplaySetIdV1(caption: NativeCaptionV1): string {
  return caption.displaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
}

export function nativeSavedViewDisplaySetIdV1(savedView: NativeSavedViewV1): string {
  return savedView.displaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`native snapshot: ${label} must be an object`);
  return value;
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`native snapshot: unknown field ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) throw new Error(`native snapshot: missing field ${key}`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`native snapshot: ${label} must be a non-empty string`);
  return value;
}

function singleLineString(value: unknown, label: string): string {
  const text = string(value, label);
  if (/[\u0000-\u001f\u007f]/u.test(text)) {
    throw new Error(`native snapshot: ${label} must be single-line text without controls`);
  }
  return text;
}

function id(value: unknown, prefix: NativeIdPrefix, label: string): string {
  const text = string(value, label);
  const pattern = new RegExp(`^${prefix}_[0-9A-HJKMNPQRSTVWXYZ]{26}$`);
  if (!pattern.test(text)) throw new Error(`native snapshot: invalid ${label}`);
  return text;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`native snapshot: ${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function safeNonNegative(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`native snapshot: ${label} must be a non-negative safe integer`);
  return value as number;
}

function positiveGeneration(value: unknown): number {
  const number = safeNonNegative(value, 'generation');
  if (number < 1) throw new Error('native snapshot: generation must be positive');
  return number;
}

function vec3(value: unknown, label: string): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`native snapshot: ${label} must contain three numbers`);
  return [finite(value[0], label), finite(value[1], label), finite(value[2], label)];
}

function quaternion(value: unknown, label: string): readonly [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`native snapshot: ${label} must contain four numbers`);
  const result = [finite(value[0], label), finite(value[1], label), finite(value[2], label), finite(value[3], label)] as const;
  const length = Math.hypot(...result);
  if (Math.abs(length - 1) > 1e-9) throw new Error(`native snapshot: ${label} must be a unit quaternion`);
  const [x, y, z, w] = result;
  const first = w !== 0 ? w : x !== 0 ? x : y !== 0 ? y : z;
  if (first < 0) throw new Error(`native snapshot: ${label} quaternion sign is not canonical`);
  return result;
}

function sim3(value: unknown, canonical: boolean): NativeSim3V1 | NativeCanonicalTransformV1 {
  const input = record(value, 'Sim3');
  exactKeys(input, canonical
    ? ['translation', 'rotationXYZW', 'uniformScale', 'reflection']
    : ['translation', 'rotationXYZW', 'uniformScale']);
  const uniformScale = finite(input.uniformScale, 'uniformScale');
  if (uniformScale <= 0) throw new Error('native snapshot: uniformScale must be positive');
  const base: NativeSim3V1 = {
    translation: vec3(input.translation, 'translation'),
    rotationXYZW: quaternion(input.rotationXYZW, 'rotationXYZW'),
    uniformScale,
  };
  if (!canonical) return base;
  if (input.reflection !== 'none' && input.reflection !== 'x') {
    throw new Error('native snapshot: reflection must be none or x');
  }
  return { ...base, reflection: input.reflection };
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`native snapshot: ${label} must be an array`);
  return value.map((entry) => string(entry, label));
}

function uniqueIds<T extends { readonly id: string }>(values: readonly T[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) throw new Error(`native snapshot: duplicate ${label} id ${value.id}`);
    seen.add(value.id);
  }
}

function parseBlobRef(value: unknown): NativeBlobRefV1 {
  const input = record(value, 'blob');
  exactKeys(input, ['algorithm', 'digest', 'byteLength', 'mediaType']);
  if (input.algorithm !== 'sha256') throw new Error('native snapshot: blob algorithm must be sha256');
  const digest = string(input.digest, 'blob digest');
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('native snapshot: invalid blob digest');
  return {
    algorithm: 'sha256',
    digest,
    byteLength: safeNonNegative(input.byteLength, 'blob byteLength'),
    mediaType: string(input.mediaType, 'blob mediaType'),
  };
}

function parseGsFacts(value: unknown): NativeGsPlyFactsV1 {
  const input = record(value, 'gsPly');
  exactKeys(input, ['shDegree', 'splatCount', 'headerByteLength', 'recordStrideBytes', 'payloadByteLength']);
  if (input.shDegree !== 2 && input.shDegree !== 3) throw new Error('native snapshot: unsupported SH degree');
  if (input.recordStrideBytes !== 164 && input.recordStrideBytes !== 248) throw new Error('native snapshot: unsupported GS stride');
  const splatCount = safeNonNegative(input.splatCount, 'GS splatCount');
  if (splatCount < 1) throw new Error('native snapshot: GS splatCount must be positive');
  const headerByteLength = safeNonNegative(input.headerByteLength, 'GS headerByteLength');
  const payloadByteLength = safeNonNegative(input.payloadByteLength, 'GS payloadByteLength');
  if ((input.shDegree === 2 ? 164 : 248) !== input.recordStrideBytes) {
    throw new Error('native snapshot: GS SH degree and stride disagree');
  }
  if (BigInt(splatCount) * BigInt(input.recordStrideBytes) !== BigInt(payloadByteLength)) {
    throw new Error('native snapshot: GS payload length disagrees with count and stride');
  }
  return {
    shDegree: input.shDegree,
    splatCount,
    headerByteLength,
    recordStrideBytes: input.recordStrideBytes,
    payloadByteLength,
  };
}

function parsePointFacts(value: unknown): NativePointPlyFactsV1 {
  const input = record(value, 'pointPly');
  exactKeys(input, ['pointCount', 'headerByteLength', 'encoding']);
  const pointCount = safeNonNegative(input.pointCount, 'Point count');
  const headerByteLength = safeNonNegative(input.headerByteLength, 'Point headerByteLength');
  if (pointCount < 1 || headerByteLength < 1 || input.encoding !== 'ascii') {
    throw new Error('native snapshot: unsupported ordinary-point PLY facts');
  }
  return { pointCount, headerByteLength, encoding: 'ascii' };
}

function parseAsset(value: unknown): NativeAssetV1 {
  const input = record(value, 'asset');
  exactKeys(input, ['id', 'label', 'assetFrameId', 'status'], ['pinScale']);
  const status = record(input.status, 'asset status');
  exactKeys(status, ['kind', 'activeBindingId']);
  if (status.kind !== 'ready') throw new Error('native snapshot: only ready Assets are persisted in snapshot v1');
  const pinScale = input.pinScale === undefined ? undefined : finite(input.pinScale, 'Asset pinScale');
  if (pinScale !== undefined && (pinScale < NATIVE_CAPTION_PIN_SCALE_MIN || pinScale > NATIVE_CAPTION_PIN_SCALE_MAX)) {
    throw new Error(`native snapshot: Asset pinScale must be between ${NATIVE_CAPTION_PIN_SCALE_MIN} and ${NATIVE_CAPTION_PIN_SCALE_MAX}`);
  }
  return {
    id: id(input.id, 'ast', 'Asset id'),
    label: string(input.label, 'Asset label'),
    assetFrameId: id(input.assetFrameId, 'frm', 'Asset frame id'),
    status: { kind: 'ready', activeBindingId: id(status.activeBindingId, 'bnd', 'active binding id') },
    ...(pinScale === undefined ? {} : { pinScale }),
  };
}

function parseBinding(value: unknown): NativeAssetBindingRevisionV1 {
  const input = record(value, 'AssetBindingRevision');
  exactKeys(input, ['id', 'assetId', 'assetRevisionId', 'assetToProject', 'method']);
  if (input.method !== 'import' && input.method !== 'manual') throw new Error('native snapshot: invalid binding method');
  return {
    id: id(input.id, 'bnd', 'binding id'),
    assetId: id(input.assetId, 'ast', 'binding Asset id'),
    assetRevisionId: id(input.assetRevisionId, 'rev', 'binding revision id'),
    assetToProject: sim3(input.assetToProject, false) as NativeSim3V1,
    method: input.method,
  };
}

function parseRevision(value: unknown): NativeAssetRevisionV1 {
  const input = record(value, 'AssetRevision');
  exactKeys(input, ['id', 'assetId', 'representationIds', 'anchorCompatibilityClasses']);
  if (!Array.isArray(input.anchorCompatibilityClasses)) {
    throw new Error('native snapshot: anchorCompatibilityClasses must be an array');
  }
  const classes = input.anchorCompatibilityClasses.map((entry) => {
    const item = record(entry, 'anchorCompatibilityClass');
    exactKeys(item, ['id', 'targetVariantFamilyIds']);
    const targets = stringArray(item.targetVariantFamilyIds, 'targetVariantFamilyIds');
    if (targets.length < 1 || new Set(targets).size !== targets.length) {
      throw new Error('native snapshot: compatibility targets must be non-empty and unique');
    }
    for (const target of targets) id(target, 'fam', 'target family id');
    return { id: id(item.id, 'cls', 'compatibility class id'), targetVariantFamilyIds: targets };
  });
  uniqueIds(classes, 'compatibility class');
  const representationIds = stringArray(input.representationIds, 'representationIds');
  for (const representationId of representationIds) id(representationId, 'rep', 'Representation id');
  if (representationIds.length < 1 || new Set(representationIds).size !== representationIds.length) {
    throw new Error('native snapshot: revision representations must be non-empty and unique');
  }
  return {
    id: id(input.id, 'rev', 'revision id'),
    assetId: id(input.assetId, 'ast', 'revision Asset id'),
    representationIds,
    anchorCompatibilityClasses: classes,
  };
}

function parseRepresentation(value: unknown): NativeRepresentationV1 {
  const input = record(value, 'Representation');
  exactKeys(
    input,
    ['id', 'assetId', 'representationFrameId', 'contentKind', 'purposes', 'role', 'variantFamilyId', 'formatProfile', 'blob', 'representationToAsset', 'derivedFrom'],
    ['proxyForGsVariantFamilyId', 'gsPly', 'pointPly'],
  );
  if (input.contentKind !== 'mesh' && input.contentKind !== 'pointCloud' && input.contentKind !== 'gaussianSplat') {
    throw new Error('native snapshot: unsupported Representation contentKind');
  }
  if (input.role !== 'meshPrimary' && input.role !== 'pointPrimary' && input.role !== 'gsPrimary' && input.role !== 'interactionProxy') {
    throw new Error('native snapshot: unsupported Representation role');
  }
  const purposes = stringArray(input.purposes, 'Representation purposes');
  if (purposes.some((purpose) => purpose !== 'source' && purpose !== 'display' && purpose !== 'interaction')) {
    throw new Error('native snapshot: unsupported Representation purpose');
  }
  const formatProfile = record(input.formatProfile, 'formatProfile');
  exactKeys(formatProfile, ['id']);
  const derivedFrom = stringArray(input.derivedFrom, 'derivedFrom');
  for (const derived of derivedFrom) id(derived, 'rep', 'derived Representation id');
  const result: NativeRepresentationV1 = {
    id: id(input.id, 'rep', 'Representation id'),
    assetId: id(input.assetId, 'ast', 'Representation Asset id'),
    representationFrameId: id(input.representationFrameId, 'frm', 'Representation frame id'),
    contentKind: input.contentKind,
    purposes: purposes as NativeRepresentationV1['purposes'],
    role: input.role,
    variantFamilyId: id(input.variantFamilyId, 'fam', 'variant family id'),
    formatProfile: { id: string(formatProfile.id, 'format profile id') },
    blob: parseBlobRef(input.blob),
    representationToAsset: sim3(input.representationToAsset, true) as NativeCanonicalTransformV1,
    derivedFrom,
    ...(input.proxyForGsVariantFamilyId === undefined
      ? {}
      : { proxyForGsVariantFamilyId: id(input.proxyForGsVariantFamilyId, 'fam', 'Proxy target family id') }),
    ...(input.gsPly === undefined ? {} : { gsPly: parseGsFacts(input.gsPly) }),
    ...(input.pointPly === undefined ? {} : { pointPly: parsePointFacts(input.pointPly) }),
  };
  if (result.role === 'gsPrimary') {
    if (
      result.contentKind !== 'gaussianSplat' || result.formatProfile.id !== NATIVE_GS_PROFILE_ID ||
      result.gsPly === undefined || result.pointPly !== undefined
    ) {
      throw new Error('native snapshot: gsPrimary must use the supported GS PLY profile and facts');
    }
    if (result.purposes.join(',') !== 'source,display' || result.proxyForGsVariantFamilyId !== undefined) {
      throw new Error('native snapshot: invalid gsPrimary purpose/relationship fields');
    }
  } else if (result.role === 'meshPrimary') {
    if (
      result.contentKind !== 'mesh' || result.purposes.join(',') !== 'source,display' ||
      result.gsPly !== undefined || result.pointPly !== undefined || result.proxyForGsVariantFamilyId !== undefined
    ) {
      throw new Error('native snapshot: invalid meshPrimary fields');
    }
  } else if (result.role === 'pointPrimary') {
    if (
      result.contentKind !== 'pointCloud' || result.purposes.join(',') !== 'source,display' ||
      result.formatProfile.id !== NATIVE_POINT_PROFILE_ID || result.pointPly === undefined ||
      result.gsPly !== undefined || result.proxyForGsVariantFamilyId !== undefined
    ) {
      throw new Error('native snapshot: pointPrimary must use the supported ordinary-point PLY profile and facts');
    }
  } else if (
    result.contentKind !== 'mesh' || result.purposes.join(',') !== 'interaction' ||
    result.proxyForGsVariantFamilyId === undefined || result.gsPly !== undefined || result.pointPly !== undefined
  ) {
    throw new Error('native snapshot: invalid interactionProxy fields');
  }
  return result;
}

function parseCaption(value: unknown): NativeCaptionV1 {
  const input = record(value, 'Caption');
  exactKeys(input, ['id', 'title', 'body', 'anchor'], ['displaySetId', 'color', 'tags', 'attachmentMediaIds']);
  let anchor: NativeCaptionV1['anchor'] = null;
  if (input.anchor !== null) {
    const sourceAnchor = record(input.anchor, 'Caption anchor');
    exactKeys(sourceAnchor, ['kind', 'assetId', 'assetFrameId', 'positionAsset', 'authoredAssetRevisionId', 'authoredAnchorCompatibilityId', 'hitEvidence']);
    const hit = record(sourceAnchor.hitEvidence, 'Caption hitEvidence');
    exactKeys(hit, ['method']);
    if (sourceAnchor.kind !== 'asset' || hit.method !== 'manual') {
      throw new Error('native snapshot: Caption anchor must be null or a manual Asset anchor');
    }
    anchor = {
      kind: 'asset',
      assetId: id(sourceAnchor.assetId, 'ast', 'Caption Asset id'),
      assetFrameId: id(sourceAnchor.assetFrameId, 'frm', 'Caption Asset frame id'),
      positionAsset: vec3(sourceAnchor.positionAsset, 'Caption positionAsset'),
      authoredAssetRevisionId: id(sourceAnchor.authoredAssetRevisionId, 'rev', 'Caption revision id'),
      authoredAnchorCompatibilityId: id(sourceAnchor.authoredAnchorCompatibilityId, 'cls', 'Caption compatibility class id'),
      hitEvidence: { method: 'manual' },
    };
  }
  const tags = input.tags === undefined ? [] : stringArray(input.tags, 'Caption tags').map((tag) => singleLineString(tag, 'Caption tag'));
  if (new Set(tags).size !== tags.length) throw new Error('native snapshot: Caption tags must be unique');
  const attachmentMediaIds = input.attachmentMediaIds === undefined
    ? []
    : stringArray(input.attachmentMediaIds, 'Caption attachment media IDs')
      .map((mediaId) => id(mediaId, 'med', 'Caption attachment media id'));
  if (new Set(attachmentMediaIds).size !== attachmentMediaIds.length) {
    throw new Error('native snapshot: Caption attachment media IDs must be unique');
  }
  const color = input.color === undefined ? '#ffffff' : singleLineString(input.color, 'Caption color');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('native snapshot: Caption color must be #RRGGBB');
  return {
    id: id(input.id, 'cap', 'Caption id'),
    title: string(input.title, 'Caption title'),
    body: typeof input.body === 'string' ? input.body : (() => { throw new Error('native snapshot: Caption body must be text'); })(),
    anchor,
    ...(input.displaySetId === undefined ? {} : { displaySetId: id(input.displaySetId, 'set', 'Caption DisplaySet id') }),
    ...(input.color === undefined ? {} : { color: color.toLowerCase() }),
    ...(input.tags === undefined ? {} : { tags }),
    ...(input.attachmentMediaIds === undefined ? {} : { attachmentMediaIds }),
  };
}

function parseProjectCamera(value: unknown): NativeProjectCameraV1 {
  const input = record(value, 'SavedView camera');
  exactKeys(input, ['position', 'target', 'up', 'projection']);
  const position = vec3(input.position, 'SavedView camera position');
  const target = vec3(input.target, 'SavedView camera target');
  const up = vec3(input.up, 'SavedView camera up');
  const direction = target.map((component, index) => component - position[index]!) as unknown as readonly [number, number, number];
  const directionLength = Math.hypot(...direction);
  const upLength = Math.hypot(...up);
  if (!Number.isFinite(directionLength) || directionLength === 0) {
    throw new Error('native snapshot: SavedView camera position and target must differ finitely');
  }
  if (!Number.isFinite(upLength) || upLength === 0) {
    throw new Error('native snapshot: SavedView camera up must be finite and non-zero');
  }
  const crossLength = Math.hypot(
    direction[1] * up[2] - direction[2] * up[1],
    direction[2] * up[0] - direction[0] * up[2],
    direction[0] * up[1] - direction[1] * up[0],
  );
  const normalizedCross = crossLength / (directionLength * upLength);
  if (!Number.isFinite(normalizedCross) || normalizedCross <= 1e-12) {
    throw new Error('native snapshot: SavedView camera up must not be parallel to its view direction');
  }
  const projection = record(input.projection, 'SavedView camera projection');
  if (projection.kind === 'perspective') {
    exactKeys(projection, ['kind', 'verticalFovRadians']);
    const verticalFovRadians = finite(projection.verticalFovRadians, 'SavedView vertical FOV');
    if (verticalFovRadians <= 0 || verticalFovRadians >= Math.PI) {
      throw new Error('native snapshot: SavedView vertical FOV must be between zero and pi');
    }
    return { position, target, up, projection: { kind: 'perspective', verticalFovRadians } };
  }
  if (projection.kind === 'orthographic') {
    exactKeys(projection, ['kind', 'verticalSpan']);
    const verticalSpan = finite(projection.verticalSpan, 'SavedView orthographic vertical span');
    if (verticalSpan <= 0) throw new Error('native snapshot: SavedView orthographic vertical span must be positive');
    return { position, target, up, projection: { kind: 'orthographic', verticalSpan } };
  }
  throw new Error('native snapshot: unsupported SavedView camera projection');
}

function parseSavedView(value: unknown): NativeSavedViewV1 {
  const input = record(value, 'SavedView');
  exactKeys(input, ['id', 'name', 'orderKey', 'projectFrameId', 'camera', 'background'], ['displaySetId']);
  const background = record(input.background, 'SavedView background');
  exactKeys(background, ['kind', 'colorSrgb']);
  if (background.kind !== 'solid') throw new Error('native snapshot: bounded SavedView background must be solid');
  const colorSrgb = vec3(background.colorSrgb, 'SavedView background color');
  if (colorSrgb.some((component) => component < 0 || component > 1)) {
    throw new Error('native snapshot: SavedView background color must be normalized');
  }
  return {
    id: id(input.id, 'view', 'SavedView id'),
    name: singleLineString(input.name, 'SavedView name'),
    orderKey: singleLineString(input.orderKey, 'SavedView orderKey'),
    projectFrameId: id(input.projectFrameId, 'frm', 'SavedView ProjectFrame id'),
    camera: parseProjectCamera(input.camera),
    background: { kind: 'solid', colorSrgb },
    ...(input.displaySetId === undefined ? {} : { displaySetId: id(input.displaySetId, 'set', 'SavedView DisplaySet id') }),
  };
}

function parseDisplaySet(value: unknown): NativeDisplaySetV1 {
  const input = record(value, 'DisplaySet');
  exactKeys(input, ['id', 'name', 'orderKey', 'defaultSavedViewId']);
  return {
    id: id(input.id, 'set', 'DisplaySet id'),
    name: singleLineString(input.name, 'DisplaySet name'),
    orderKey: singleLineString(input.orderKey, 'DisplaySet orderKey'),
    defaultSavedViewId: input.defaultSavedViewId === null
      ? null
      : id(input.defaultSavedViewId, 'view', 'DisplaySet default SavedView id'),
  };
}

function parseMediaResource(value: unknown): NativeMediaResourceV1 {
  const input = record(value, 'media resource');
  exactKeys(input, ['id', 'label', 'kind', 'blob']);
  if (input.kind !== 'image') throw new Error('native snapshot: unsupported media resource kind');
  const blob = parseBlobRef(input.blob);
  if (!isNativeImageMediaType(blob.mediaType)) {
    throw new Error('native snapshot: image media must use a valid image media type');
  }
  return {
    id: id(input.id, 'med', 'media resource id'),
    label: singleLineString(input.label, 'media resource label'),
    kind: 'image',
    blob,
  };
}

function normalizedUnitInterval(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result < 0 || result > 1) throw new Error(`native snapshot: ${label} must be between zero and one`);
  return result;
}

function parseMeshMaterialAppearance(value: unknown): NativeMeshMaterialAppearanceV1 {
  const input = record(value, 'Mesh material appearance');
  exactKeys(input, [
    'id', 'displaySetId', 'assetId', 'authoredAssetRevisionId', 'representationId',
    'materialSlotKey', 'opacity', 'doubleSided', 'unlit', 'chroma',
  ]);
  if (typeof input.doubleSided !== 'boolean' || typeof input.unlit !== 'boolean') {
    throw new Error('native snapshot: Mesh material flags must be boolean');
  }
  const chroma = record(input.chroma, 'Mesh material chroma');
  exactKeys(chroma, ['enabled', 'colorSrgb', 'tolerance', 'feather']);
  if (typeof chroma.enabled !== 'boolean') throw new Error('native snapshot: chroma enabled must be boolean');
  const colorSrgb = vec3(chroma.colorSrgb, 'Mesh material chroma color');
  if (colorSrgb.some((component) => component < 0 || component > 1)) {
    throw new Error('native snapshot: Mesh material chroma color must be normalized');
  }
  return {
    id: id(input.id, 'mat', 'Mesh material appearance id'),
    displaySetId: id(input.displaySetId, 'set', 'Mesh material DisplaySet id'),
    assetId: id(input.assetId, 'ast', 'Mesh material Asset id'),
    authoredAssetRevisionId: id(input.authoredAssetRevisionId, 'rev', 'Mesh material revision id'),
    representationId: id(input.representationId, 'rep', 'Mesh material Representation id'),
    materialSlotKey: singleLineString(input.materialSlotKey, 'Mesh material slot key'),
    opacity: normalizedUnitInterval(input.opacity, 'Mesh material opacity'),
    doubleSided: input.doubleSided,
    unlit: input.unlit,
    chroma: {
      enabled: chroma.enabled,
      colorSrgb,
      tolerance: normalizedUnitInterval(chroma.tolerance, 'Mesh material chroma tolerance'),
      feather: normalizedUnitInterval(chroma.feather, 'Mesh material chroma feather'),
    },
  };
}

function semanticClosure(snapshot: NativeProjectSnapshotV1): void {
  uniqueIds(snapshot.assets, 'Asset');
  uniqueIds(snapshot.assetBindingRevisions, 'AssetBindingRevision');
  uniqueIds(snapshot.assetRevisions, 'AssetRevision');
  uniqueIds(snapshot.representations, 'Representation');
  uniqueIds(snapshot.captions, 'Caption');
  uniqueIds(snapshot.savedViews ?? [], 'SavedView');
  uniqueIds(nativeDisplaySetsV1(snapshot), 'DisplaySet');
  uniqueIds(snapshot.meshMaterialAppearances ?? [], 'Mesh material appearance');
  uniqueIds(snapshot.mediaResources ?? [], 'media resource');
  const assets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const bindings = new Map(snapshot.assetBindingRevisions.map((binding) => [binding.id, binding]));
  const revisions = new Map(snapshot.assetRevisions.map((revision) => [revision.id, revision]));
  const representations = new Map(snapshot.representations.map((representation) => [representation.id, representation]));
  const displaySets = new Map(nativeDisplaySetsV1(snapshot).map((displaySet) => [displaySet.id, displaySet]));
  const savedViews = new Map((snapshot.savedViews ?? []).map((savedView) => [savedView.id, savedView]));
  const mediaResources = new Map((snapshot.mediaResources ?? []).map((media) => [media.id, media]));
  for (const binding of snapshot.assetBindingRevisions) {
    const asset = assets.get(binding.assetId);
    const revision = revisions.get(binding.assetRevisionId);
    if (asset === undefined || revision === undefined || revision.assetId !== binding.assetId) {
      throw new Error('native snapshot: retained binding ownership is invalid');
    }
  }
  for (const asset of snapshot.assets) {
    const binding = bindings.get(asset.status.activeBindingId);
    if (binding === undefined || binding.assetId !== asset.id) throw new Error('native snapshot: Asset active binding is missing or foreign');
  }
  for (const revision of snapshot.assetRevisions) {
    if (!assets.has(revision.assetId)) throw new Error('native snapshot: retained revision Asset is missing');
    for (const representationId of revision.representationIds) {
      const representation = representations.get(representationId);
      if (representation === undefined || representation.assetId !== revision.assetId) {
        throw new Error('native snapshot: revision Representation is missing or foreign');
      }
    }
    const visualFamilies = revision.representationIds
      .map((representationId) => representations.get(representationId)!)
      .filter((representation) => (
        representation.role === 'meshPrimary' || representation.role === 'pointPrimary' || representation.role === 'gsPrimary'
      ))
      .map((representation) => representation.variantFamilyId)
      .sort();
    const classFamilies = revision.anchorCompatibilityClasses.flatMap((entry) => entry.targetVariantFamilyIds).sort();
    if (visualFamilies.join('\0') !== classFamilies.join('\0')) {
      throw new Error('native snapshot: compatibility classes must partition visual families');
    }
  }
  for (const representation of snapshot.representations) {
    for (const parentId of representation.derivedFrom) {
      const parent = representations.get(parentId);
      if (parent === undefined || parent.assetId !== representation.assetId) {
        throw new Error('native snapshot: derivedFrom is missing or cross-Asset');
      }
    }
    if (representation.gsPly !== undefined) {
      const expectedLength = representation.gsPly.headerByteLength + representation.gsPly.payloadByteLength;
      if (expectedLength !== representation.blob.byteLength) throw new Error('native snapshot: GS facts disagree with blob length');
    }
    if (representation.pointPly !== undefined && representation.pointPly.headerByteLength >= representation.blob.byteLength) {
      throw new Error('native snapshot: ordinary-point PLY facts disagree with blob length');
    }
  }
  const target = snapshot.presentation.captionTargetAssetId;
  if (target !== null && !assets.has(target)) throw new Error('native snapshot: Caption target Asset is missing');
  const activeDisplaySetId = snapshot.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
  if (!displaySets.has(activeDisplaySetId)) throw new Error('native snapshot: active DisplaySet is missing');
  const hiddenAssetIds = snapshot.presentation.hiddenAssetIds ?? [];
  if (new Set(hiddenAssetIds).size !== hiddenAssetIds.length) {
    throw new Error('native snapshot: hidden Asset IDs must be unique');
  }
  for (const hiddenAssetId of hiddenAssetIds) {
    if (!assets.has(hiddenAssetId)) throw new Error('native snapshot: hidden Asset is missing');
  }
  for (const caption of snapshot.captions) {
    if (!displaySets.has(nativeCaptionDisplaySetIdV1(caption))) {
      throw new Error('native snapshot: Caption DisplaySet is missing');
    }
    for (const mediaId of caption.attachmentMediaIds ?? []) {
      if (!mediaResources.has(mediaId)) throw new Error('native snapshot: Caption attachment media is missing');
    }
    if (caption.anchor !== null) {
      const asset = assets.get(caption.anchor.assetId);
      const revision = revisions.get(caption.anchor.authoredAssetRevisionId);
      if (asset === undefined || asset.assetFrameId !== caption.anchor.assetFrameId || revision?.assetId !== asset.id) {
        throw new Error('native snapshot: Caption anchor ownership is invalid');
      }
      if (!revision.anchorCompatibilityClasses.some((entry) => entry.id === caption.anchor!.authoredAnchorCompatibilityId)) {
        throw new Error('native snapshot: Caption compatibility class is not active');
      }
    }
  }
  for (const savedView of snapshot.savedViews ?? []) {
    if (savedView.projectFrameId !== snapshot.project.frame.id) {
      throw new Error('native snapshot: SavedView ProjectFrame is foreign');
    }
    if (!displaySets.has(nativeSavedViewDisplaySetIdV1(savedView))) {
      throw new Error('native snapshot: SavedView DisplaySet is missing');
    }
  }
  for (const displaySet of nativeDisplaySetsV1(snapshot)) {
    if (displaySet.defaultSavedViewId === null) continue;
    const savedView = savedViews.get(displaySet.defaultSavedViewId);
    if (savedView === undefined || nativeSavedViewDisplaySetIdV1(savedView) !== displaySet.id) {
      throw new Error('native snapshot: DisplaySet default SavedView is missing or foreign');
    }
  }
  const materialTargets = new Set<string>();
  for (const appearance of snapshot.meshMaterialAppearances ?? []) {
    if (!displaySets.has(appearance.displaySetId)) throw new Error('native snapshot: Mesh material DisplaySet is missing');
    const revision = revisions.get(appearance.authoredAssetRevisionId);
    const representation = representations.get(appearance.representationId);
    if (
      revision === undefined || revision.assetId !== appearance.assetId ||
      !revision.representationIds.includes(appearance.representationId) ||
      representation === undefined || representation.assetId !== appearance.assetId ||
      representation.role !== 'meshPrimary'
    ) {
      throw new Error('native snapshot: Mesh material target is missing or foreign');
    }
    const targetKey = `${appearance.displaySetId}\0${appearance.representationId}\0${appearance.materialSlotKey}`;
    if (materialTargets.has(targetKey)) throw new Error('native snapshot: duplicate Mesh material target');
    materialTargets.add(targetKey);
  }
}

export function parseNativeSnapshotV1(text: string): NativeProjectSnapshotV1 {
  const parsed = record(parseJsonWithoutDuplicateMembers(text), 'snapshot');
  exactKeys(parsed, [
    'format', 'schemaVersion', 'snapshotId', 'generation', 'project', 'assets',
    'assetBindingRevisions', 'assetRevisions', 'representations', 'presentation', 'captions',
  ], ['savedViews', 'displaySets', 'meshMaterialAppearances', 'mediaResources']);
  if (parsed.format !== NATIVE_SNAPSHOT_FORMAT || parsed.schemaVersion !== NATIVE_SCHEMA_VERSION) {
    throw new Error('native snapshot: unsupported format or schema version');
  }
  const project = record(parsed.project, 'project');
  exactKeys(project, ['id', 'title', 'frame']);
  const frame = record(project.frame, 'project frame');
  exactKeys(frame, ['id', 'handedness', 'upAxis', 'unit']);
  const unit = record(frame.unit, 'project unit');
  exactKeys(unit, unit.kind === 'meters' ? ['kind', 'metersPerProjectUnit'] : ['kind']);
  if (unit.kind !== 'unknown' && (unit.kind !== 'meters' || unit.metersPerProjectUnit !== 1)) {
    throw new Error('native snapshot: unsupported project unit');
  }
  if (frame.handedness !== 'right' || frame.upAxis !== '+Y') throw new Error('native snapshot: unsupported project frame');
  if (
    !Array.isArray(parsed.assets) || !Array.isArray(parsed.assetBindingRevisions) ||
    !Array.isArray(parsed.assetRevisions) || !Array.isArray(parsed.representations) ||
    !Array.isArray(parsed.captions) || (parsed.savedViews !== undefined && !Array.isArray(parsed.savedViews)) ||
    (parsed.displaySets !== undefined && !Array.isArray(parsed.displaySets)) ||
    (parsed.meshMaterialAppearances !== undefined && !Array.isArray(parsed.meshMaterialAppearances)) ||
    (parsed.mediaResources !== undefined && !Array.isArray(parsed.mediaResources))
  ) {
    throw new Error('native snapshot: record collections must be arrays');
  }
  const presentation = record(parsed.presentation, 'presentation');
  exactKeys(presentation, ['displayMode', 'captionTargetAssetId'], ['hiddenAssetIds', 'activeDisplaySetId']);
  if (presentation.displayMode !== 'mixed' && presentation.displayMode !== 'gs-only' && presentation.displayMode !== 'mesh-only') {
    throw new Error('native snapshot: invalid display mode');
  }
  const hiddenAssetIds = presentation.hiddenAssetIds === undefined
    ? []
    : stringArray(presentation.hiddenAssetIds, 'hidden Asset IDs').map((assetId) => id(assetId, 'ast', 'hidden Asset id'));
  const snapshot: NativeProjectSnapshotV1 = {
    format: NATIVE_SNAPSHOT_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    snapshotId: id(parsed.snapshotId, 'snp', 'snapshot id'),
    generation: positiveGeneration(parsed.generation),
    project: {
      id: id(project.id, 'prj', 'project id'),
      title: string(project.title, 'project title'),
      frame: {
        id: id(frame.id, 'frm', 'project frame id'),
        handedness: 'right',
        upAxis: '+Y',
        unit: unit.kind === 'meters' ? { kind: 'meters', metersPerProjectUnit: 1 } : { kind: 'unknown' },
      },
    },
    assets: parsed.assets.map(parseAsset),
    assetBindingRevisions: parsed.assetBindingRevisions.map(parseBinding),
    assetRevisions: parsed.assetRevisions.map(parseRevision),
    representations: parsed.representations.map(parseRepresentation),
    presentation: {
      displayMode: presentation.displayMode,
      captionTargetAssetId: presentation.captionTargetAssetId === null
        ? null
        : id(presentation.captionTargetAssetId, 'ast', 'Caption target Asset id'),
      hiddenAssetIds,
      ...(presentation.activeDisplaySetId === undefined
        ? {}
        : { activeDisplaySetId: id(presentation.activeDisplaySetId, 'set', 'active DisplaySet id') }),
    },
    captions: parsed.captions.map(parseCaption),
    savedViews: parsed.savedViews === undefined ? [] : parsed.savedViews.map(parseSavedView),
    ...(parsed.displaySets === undefined ? {} : { displaySets: parsed.displaySets.map(parseDisplaySet) }),
    ...(parsed.meshMaterialAppearances === undefined
      ? {}
      : { meshMaterialAppearances: parsed.meshMaterialAppearances.map(parseMeshMaterialAppearance) }),
    ...(parsed.mediaResources === undefined ? {} : { mediaResources: parsed.mediaResources.map(parseMediaResource) }),
  };
  if (snapshot.assets.length < 1) throw new Error('native snapshot: at least one Asset is required');
  semanticClosure(snapshot);
  return snapshot;
}

export function parseNativeActiveMarkerV1(text: string): NativeActiveMarkerV1 {
  const parsed = record(parseJsonWithoutDuplicateMembers(text), 'active marker');
  exactKeys(parsed, ['format', 'schemaVersion', 'projectId', 'generation', 'snapshotId', 'snapshotByteLength', 'snapshotSha256']);
  if (parsed.format !== NATIVE_ACTIVE_FORMAT || parsed.schemaVersion !== NATIVE_SCHEMA_VERSION) {
    throw new Error('native snapshot: unsupported active marker version');
  }
  const digest = string(parsed.snapshotSha256, 'snapshot digest');
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('native snapshot: invalid snapshot digest');
  return {
    format: NATIVE_ACTIVE_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    projectId: id(parsed.projectId, 'prj', 'active project id'),
    generation: positiveGeneration(parsed.generation),
    snapshotId: id(parsed.snapshotId, 'snp', 'active snapshot id'),
    snapshotByteLength: safeNonNegative(parsed.snapshotByteLength, 'snapshot byteLength'),
    snapshotSha256: digest,
  };
}

export function serializeNativeSnapshotV1(snapshot: NativeProjectSnapshotV1): string {
  const ordered: NativeProjectSnapshotV1 = {
    ...snapshot,
    assets: [...snapshot.assets].sort((a, b) => a.id.localeCompare(b.id)),
    assetBindingRevisions: [...snapshot.assetBindingRevisions].sort((a, b) => a.id.localeCompare(b.id)),
    assetRevisions: [...snapshot.assetRevisions]
      .map((revision) => ({
        ...revision,
        representationIds: [...revision.representationIds].sort(),
        anchorCompatibilityClasses: [...revision.anchorCompatibilityClasses]
          .map((entry) => ({ ...entry, targetVariantFamilyIds: [...entry.targetVariantFamilyIds].sort() }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    representations: [...snapshot.representations]
      .map((representation) => ({ ...representation, derivedFrom: [...representation.derivedFrom].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    presentation: {
      ...snapshot.presentation,
      hiddenAssetIds: [...(snapshot.presentation.hiddenAssetIds ?? [])].sort(),
    },
    captions: [...snapshot.captions].sort((a, b) => a.id.localeCompare(b.id)),
    savedViews: [...(snapshot.savedViews ?? [])]
      .sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id)),
    ...(snapshot.displaySets === undefined ? {} : {
      displaySets: [...snapshot.displaySets]
        .sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id)),
    }),
    ...(snapshot.meshMaterialAppearances === undefined ? {} : {
      meshMaterialAppearances: [...snapshot.meshMaterialAppearances].sort((a, b) => a.id.localeCompare(b.id)),
    }),
    ...(snapshot.mediaResources === undefined ? {} : {
      mediaResources: [...snapshot.mediaResources].sort((a, b) => a.id.localeCompare(b.id)),
    }),
  };
  const text = `${JSON.stringify(ordered)}\n`;
  parseNativeSnapshotV1(text);
  return text;
}

export function serializeNativeActiveMarkerV1(marker: NativeActiveMarkerV1): string {
  const text = `${JSON.stringify(marker)}\n`;
  parseNativeActiveMarkerV1(text);
  return text;
}

export function nativeModelProfileId(format: NativeModelFormat): string {
  return `lociview-native-model-${format}-v1`;
}

export function nativeModelFormat(profileId: string): NativeModelFormat | null {
  const match = /^lociview-native-model-(glb|gltf|obj|stl|ply)-v1$/.exec(profileId);
  return match === null ? null : match[1] as NativeModelFormat;
}

export function normalizeNativeSim3(input: NativeSim3V1): NativeSim3V1 {
  const translation = input.translation.map((value) => finite(value, 'translation')) as unknown as readonly [number, number, number];
  const raw = input.rotationXYZW.map((value) => finite(value, 'rotationXYZW')) as unknown as readonly [number, number, number, number];
  const length = Math.hypot(...raw);
  if (length === 0) throw new Error('native snapshot: rotation quaternion cannot be zero');
  let rotation = raw.map((value) => value / length) as unknown as [number, number, number, number];
  const first = rotation[3] !== 0 ? rotation[3] : rotation[0] !== 0 ? rotation[0] : rotation[1] !== 0 ? rotation[1] : rotation[2];
  if (first < 0) rotation = rotation.map((value) => -value) as [number, number, number, number];
  const uniformScale = finite(input.uniformScale, 'uniformScale');
  if (uniformScale <= 0) throw new Error('native snapshot: uniformScale must be positive');
  return { translation, rotationXYZW: rotation, uniformScale };
}

function sameNativeSim3(left: NativeSim3V1, right: NativeSim3V1): boolean {
  return left.uniformScale === right.uniformScale &&
    left.translation.every((value, index) => value === right.translation[index]) &&
    left.rotationXYZW.every((value, index) => value === right.rotationXYZW[index]);
}

/**
 * Creates one immutable manual binding and flips only the selected Asset's
 * active pointer. In-progress gizmo state remains UI-only until this boundary.
 */
export function activateNativeManualAssetTransformV1(
  snapshot: NativeProjectSnapshotV1,
  assetId: string,
  bindingId: string,
  input: NativeSim3V1,
): NativeProjectSnapshotV1 {
  const asset = snapshot.assets.find((candidate) => candidate.id === assetId);
  const current = snapshot.assetBindingRevisions.find((candidate) => candidate.id === asset?.status.activeBindingId);
  if (asset === undefined || current === undefined || current.assetId !== assetId) {
    throw new Error('native snapshot: selected Asset active binding is unavailable');
  }
  const transform = normalizeNativeSim3(input);
  if (sameNativeSim3(current.assetToProject, transform)) return snapshot;
  const nextBinding: NativeAssetBindingRevisionV1 = {
    ...current,
    id: bindingId,
    assetToProject: transform,
    method: 'manual',
  };
  const candidate: NativeProjectSnapshotV1 = {
    ...snapshot,
    assets: snapshot.assets.map((entry) => entry.id === assetId
      ? { ...entry, status: { kind: 'ready', activeBindingId: nextBinding.id } }
      : entry),
    assetBindingRevisions: [...snapshot.assetBindingRevisions, nextBinding],
  };
  return parseNativeSnapshotV1(serializeNativeSnapshotV1(candidate));
}

/** Updates only project presentation state; it creates no Asset revision or marker. */
export function setNativeAssetVisibilityV1(
  snapshot: NativeProjectSnapshotV1,
  assetId: string,
  visible: boolean,
): NativeProjectSnapshotV1 {
  if (!snapshot.assets.some((asset) => asset.id === assetId)) {
    throw new Error('native snapshot: visibility target Asset is missing');
  }
  const hiddenAssetIds = new Set(snapshot.presentation.hiddenAssetIds ?? []);
  const changed = visible ? hiddenAssetIds.delete(assetId) : !hiddenAssetIds.has(assetId);
  if (!visible) hiddenAssetIds.add(assetId);
  if (!changed) return snapshot;
  return {
    ...snapshot,
    presentation: { ...snapshot.presentation, hiddenAssetIds: [...hiddenAssetIds].sort() },
  };
}

export function nativeAssetPinScaleV1(asset: NativeAssetV1): number {
  return asset.pinScale ?? NATIVE_CAPTION_PIN_SCALE_DEFAULT;
}

/** Updates only the selected Asset's durable Caption-marker scale. */
export function setNativeAssetPinScaleV1(
  snapshot: NativeProjectSnapshotV1,
  assetId: string,
  pinScale: number,
): NativeProjectSnapshotV1 {
  if (!Number.isFinite(pinScale) || pinScale < NATIVE_CAPTION_PIN_SCALE_MIN || pinScale > NATIVE_CAPTION_PIN_SCALE_MAX) {
    throw new Error(`native snapshot: Asset pinScale must be between ${NATIVE_CAPTION_PIN_SCALE_MIN} and ${NATIVE_CAPTION_PIN_SCALE_MAX}`);
  }
  const asset = snapshot.assets.find((candidate) => candidate.id === assetId);
  if (asset === undefined) throw new Error('native snapshot: pin-scale target Asset is missing');
  if (nativeAssetPinScaleV1(asset) === pinScale && asset.pinScale !== undefined) return snapshot;
  return {
    ...snapshot,
    assets: snapshot.assets.map((candidate) => candidate.id === assetId ? { ...candidate, pinScale } : candidate),
  };
}

/**
 * Updates only the Caption selected by stable ID. A null selection means the
 * supplied Caption is new; an existing selection must still resolve by its
 * stable ID or the edit fails closed.
 */
export function updateSelectedNativeCaptionV1(
  snapshot: NativeProjectSnapshotV1,
  selectedCaptionId: string | null,
  caption: NativeCaptionV1,
): NativeProjectSnapshotV1 {
  if (selectedCaptionId === null) {
    if (snapshot.captions.some((candidate) => candidate.id === caption.id)) {
      throw new Error('native snapshot: new Caption ID already exists');
    }
    return { ...snapshot, captions: [...snapshot.captions, caption] };
  }
  if (caption.id !== selectedCaptionId) {
    throw new Error('native snapshot: selected Caption identity changed');
  }
  let found = false;
  const captions = snapshot.captions.map((candidate) => {
    if (candidate.id !== selectedCaptionId) return candidate;
    found = true;
    return caption;
  });
  if (!found) throw new Error('native snapshot: selected Caption is missing');
  return { ...snapshot, captions };
}

/** Removes only the Caption selected by stable ID from the mutable snapshot. */
export function removeSelectedNativeCaptionV1(
  snapshot: NativeProjectSnapshotV1,
  selectedCaptionId: string,
): NativeProjectSnapshotV1 {
  const index = snapshot.captions.findIndex((caption) => caption.id === selectedCaptionId);
  if (index < 0) throw new Error('native snapshot: selected Caption is missing');
  return {
    ...snapshot,
    captions: [
      ...snapshot.captions.slice(0, index),
      ...snapshot.captions.slice(index + 1),
    ],
  };
}

/**
 * Removes one unreferenced Asset and its complete retained record closure from
 * the mutable snapshot. Source bytes are intentionally outside this helper.
 */
export function removeNativeAssetV1(
  snapshot: NativeProjectSnapshotV1,
  assetId: string,
): NativeProjectSnapshotV1 {
  if (!snapshot.assets.some((asset) => asset.id === assetId)) {
    throw new Error('native snapshot: selected Asset is missing');
  }
  if (snapshot.assets.length === 1) {
    throw new Error('native snapshot: the final Asset cannot be removed');
  }
  const ownedCaptionCount = snapshot.captions.filter((caption) => caption.anchor?.assetId === assetId).length;
  if (ownedCaptionCount > 0) {
    throw new Error(`native snapshot: selected Asset owns ${ownedCaptionCount} Caption(s)`);
  }
  return {
    ...snapshot,
    assets: snapshot.assets.filter((asset) => asset.id !== assetId),
    assetBindingRevisions: snapshot.assetBindingRevisions.filter((binding) => binding.assetId !== assetId),
    assetRevisions: snapshot.assetRevisions.filter((revision) => revision.assetId !== assetId),
    representations: snapshot.representations.filter((representation) => representation.assetId !== assetId),
    ...(snapshot.meshMaterialAppearances === undefined ? {} : {
      meshMaterialAppearances: snapshot.meshMaterialAppearances.filter((appearance) => appearance.assetId !== assetId),
    }),
    presentation: {
      ...snapshot.presentation,
      captionTargetAssetId: snapshot.presentation.captionTargetAssetId === assetId
        ? null
        : snapshot.presentation.captionTargetAssetId,
      hiddenAssetIds: (snapshot.presentation.hiddenAssetIds ?? []).filter((hiddenAssetId) => hiddenAssetId !== assetId),
    },
  };
}
