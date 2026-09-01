import * as THREE from 'three';
import {
  sniffImageExt,
  type FileIdMapSourceRow,
  type ForeignFile,
  type ImportPlan,
} from '../assets/importWizard';
import {
  LAST_VIEW_NAME,
  LM_MATERIALS_SHEET,
  LM_META_SHEET,
  LM_SHEET_NAMES_SHEET,
  LM_VIEWS_SHEET,
  LociMyuIdentityCollisionError,
  LociMyuSourceValidationError,
  analyzeLociMyuSheets,
  isLociMyuCaptionSheet,
  lociMyuTrimV1,
  planLociMyuDisplaySetRelationConfirmation,
  projectLociMyuCaptionSheetIdentities,
  type LociMyuCaption,
  type LociMyuDisplaySetRelationConfirmation,
  type SheetTable,
} from '../io/locimyu';
import { detectFormat, disposeModelResources, loadModel, type ModelFormat } from '../viewer/loaders';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { nativeMaterialSlotKey } from './materialSlots';
import { inspectNativeGsPlyV1, inspectNativePointPlyV1 } from './plyProfile';
import {
  NATIVE_GS_PROFILE_ID,
  NATIVE_IDENTITY_SIM3,
  NATIVE_IDENTITY_TRANSFORM,
  NATIVE_POINT_PROFILE_ID,
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
} from './schema';
import { digestNativeBytes, digestNativeStream } from './sha256';
import { createNativeProjectV1, type NativeBinarySource } from './storage';

export type LociMyuNativeIssueSeverity = 'info' | 'warning' | 'blocking';
export type LociMyuNativeDisposition = 'converted' | 'reported' | 'blocking';

export interface LociMyuNativeConversionIssue {
  readonly severity: LociMyuNativeIssueSeverity;
  readonly code: string;
  readonly sourceSheet: string | null;
  readonly sourceRow: number | null;
  readonly sourceId: string | null;
  readonly field: string | null;
  readonly reason: string;
  readonly impact: string;
  readonly candidates?: readonly string[];
}

export interface LociMyuNativeConversionMapping {
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly disposition: LociMyuNativeDisposition;
  readonly targetKind?: string;
  readonly targetId?: string;
  readonly relationBasis?: 'source-exact' | 'user-confirmed-corroborated-order';
  readonly note?: string;
}

export interface PlanLociMyuZipToNativeOptions {
  readonly confirmedDisplaySetRelation?: LociMyuDisplaySetRelationConfirmation | null;
}

export interface LociMyuSourceFingerprint {
  readonly fileName: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface LociMyuWorkbookFingerprint {
  readonly archivePath: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface LociMyuNativeSourceInventory {
  readonly workbookCandidateCount: number;
  readonly selectedWorkbook: LociMyuWorkbookFingerprint;
  readonly sheetCount: number;
  readonly captionRowCount: number;
  readonly duplicateOccurrenceCount: number;
  readonly modelCount: number;
  readonly imageCount: number;
  readonly videoCount: number;
  readonly fileIdMapRowCount: number;
  readonly viewRowCount: number;
  readonly materialRowCount: number;
}

export interface LociMyuNativeConversionReport {
  readonly format: 'lociview-locimyu-to-native-report';
  readonly version: 1;
  readonly completedAt: string | null;
  readonly source: {
    readonly before: LociMyuSourceFingerprint;
    readonly after: LociMyuSourceFingerprint | null;
    readonly unchanged: true | null;
    readonly selectedWorkbook: LociMyuWorkbookFingerprint;
    readonly originalZipEmbedded: false;
    readonly retention: 'user-retains-original-zip-and-report-separately';
  };
  readonly target: {
    readonly projectId: string;
    readonly title: string;
    readonly snapshotId: string | null;
    readonly generation: number | null;
  };
  readonly inventory: LociMyuNativeSourceInventory;
  readonly convertedCounts: Readonly<Record<string, number>>;
  readonly mappings: readonly LociMyuNativeConversionMapping[];
  readonly issues: readonly LociMyuNativeConversionIssue[];
}

export interface LociMyuNativeConversionPlan {
  readonly sourceBefore: LociMyuSourceFingerprint;
  readonly selectedWorkbook: LociMyuWorkbookFingerprint;
  readonly inventory: LociMyuNativeSourceInventory;
  readonly draft: NativeProjectDraftV1;
  readonly representationSources: ReadonlyMap<string, NativeBinarySource>;
  readonly mediaSources: ReadonlyMap<string, NativeBinarySource>;
  readonly mappings: readonly LociMyuNativeConversionMapping[];
  readonly issues: readonly LociMyuNativeConversionIssue[];
  readonly blockingIssueCount: number;
}

interface SelectedInputSnapshot {
  readonly tables: SheetTable[];
  readonly workbookPath: string;
  readonly workbookBytes: Uint8Array;
  readonly workbookCandidateCount: number;
  readonly workbookCandidates: readonly {
    readonly archivePath: string;
    readonly byteLength: number;
    readonly validationFailure?: { readonly code: string; readonly message: string };
  }[];
  readonly archiveDiagnostics: readonly string[];
  readonly selectedValidationFailure?: {
    readonly code: string;
    readonly message: string;
  };
  readonly models: ForeignFile[];
  readonly images: ForeignFile[];
  readonly videos: ForeignFile[];
  readonly fileIdMapRows: FileIdMapSourceRow[];
}

interface ConvertedModel {
  readonly source: ForeignFile;
  readonly format: ModelFormat;
  readonly asset: NativeAssetV1;
  readonly binding: NativeAssetBindingRevisionV1;
  readonly revision: NativeAssetRevisionV1;
  readonly representation: NativeRepresentationDraftV1;
  readonly anchorCompatibilityId: string;
}

interface MaterialTarget {
  readonly nativeKey: string;
}

interface MediaResolution {
  readonly file: ForeignFile | null;
  readonly reason: string | null;
  readonly candidates: readonly string[];
}

const INTERNAL_SHEETS = new Set([
  LM_VIEWS_SHEET,
  LM_MATERIALS_SHEET,
  LM_SHEET_NAMES_SHEET,
  LM_META_SHEET,
]);

function snapshotTable(table: SheetTable): SheetTable {
  return {
    name: table.name,
    ...(table.gid === undefined ? {} : { gid: table.gid }),
    rows: table.rows.map((row) => [...row]),
  };
}

function snapshotFile(file: ForeignFile): ForeignFile {
  return { path: file.path, name: file.name, data: new Uint8Array(file.data) };
}

function snapshotSelectedInput(plan: ImportPlan): SelectedInputSnapshot {
  const source = plan.sources[plan.selectedSourceIndex];
  if (source === undefined) throw new Error('LociMyu conversion: selected workbook is missing');
  if (source.archivePath === '' || source.sourceBytes.byteLength < 1) {
    throw new Error('LociMyu conversion: selected workbook source bytes are unavailable');
  }
  return {
    tables: source.tables.map(snapshotTable),
    workbookPath: source.archivePath,
    workbookBytes: new Uint8Array(source.sourceBytes),
    workbookCandidateCount: plan.sources.length,
    workbookCandidates: plan.sources.map((candidate) => ({
      archivePath: candidate.archivePath,
      byteLength: candidate.sourceBytes.byteLength,
      ...(candidate.validationFailure === undefined ? {} : { validationFailure: { ...candidate.validationFailure } }),
    })),
    archiveDiagnostics: [...plan.diagnostics.archive],
    ...(source.validationFailure === undefined
      ? {}
      : { selectedValidationFailure: { ...source.validationFailure } }),
    models: plan.models.map(snapshotFile),
    images: plan.images.map(snapshotFile),
    videos: plan.videos.map(snapshotFile),
    fileIdMapRows: (plan.fileIdMapRows ?? []).map((row) => ({ ...row })),
  };
}

function cleanSingleLine(value: string, fallback: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();
  return (cleaned === '' ? fallback : cleaned).slice(0, 160);
}

function isEmptyRow(row: readonly string[] | undefined): boolean {
  return row === undefined || row.every((value) => lociMyuTrimV1(value) === '');
}

function cell(row: readonly string[] | undefined, index: number): string {
  return lociMyuTrimV1(row?.[index] ?? '');
}

function baseName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? path : path.slice(slash + 1);
}

function hexColor(value: string): readonly [number, number, number] | null {
  if (!/^#[0-9a-f]{6}$/iu.test(value)) return null;
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  ];
}

function finiteNumber(value: string): number | null {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanCell(value: string): boolean | null {
  if (value === '') return false;
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function issue(
  issues: LociMyuNativeConversionIssue[],
  severity: LociMyuNativeIssueSeverity,
  code: string,
  locator: {
    readonly sheet?: string | null;
    readonly row?: number | null;
    readonly id?: string | null;
    readonly field?: string | null;
  },
  reason: string,
  impact: string,
  candidates?: readonly string[],
): void {
  issues.push({
    severity,
    code,
    sourceSheet: locator.sheet ?? null,
    sourceRow: locator.row ?? null,
    sourceId: locator.id ?? null,
    field: locator.field ?? null,
    reason,
    impact,
    ...(candidates === undefined || candidates.length === 0 ? {} : { candidates: [...candidates] }),
  });
}

function byteSource(file: ForeignFile, mediaType: string): NativeBinarySource {
  return {
    size: file.data.byteLength,
    mediaType,
    stream: () => new Blob([new Uint8Array(file.data).buffer]).stream(),
  };
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

interface ImageMediaInspection {
  readonly mediaType: NativeMediaResourceDraftV1['mediaType'] | null;
  readonly reason: 'unsupported-bytes' | 'filename-bytes-conflict' | null;
}

function imageMediaType(file: ForeignFile): ImageMediaInspection {
  const sniffed = (() => {
    switch (sniffImageExt(file.data)) {
      case 'jpg': return 'image/jpeg' as const;
      case 'png': return 'image/png' as const;
      case 'gif': return 'image/gif' as const;
      case 'webp': return 'image/webp' as const;
      default: return null;
    }
  })();
  const lowerName = file.name.toLowerCase();
  const named = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')
    ? 'image/jpeg' as const
    : lowerName.endsWith('.png')
      ? 'image/png' as const
      : lowerName.endsWith('.gif')
        ? 'image/gif' as const
        : lowerName.endsWith('.webp')
          ? 'image/webp' as const
          : null;
  const hasKnownImageExtension = /\.(?:jpe?g|png|gif|webp|bmp|avif|heic|heif|heix|hevc)$/iu.test(lowerName);
  if (named !== null && sniffed !== named) {
    return { mediaType: null, reason: 'filename-bytes-conflict' };
  }
  if (named === null && hasKnownImageExtension && sniffed !== null) {
    return { mediaType: null, reason: 'filename-bytes-conflict' };
  }
  if (sniffed === null) return { mediaType: null, reason: 'unsupported-bytes' };
  return { mediaType: sniffed, reason: null };
}

async function fingerprintFile(file: File): Promise<LociMyuSourceFingerprint> {
  const digest = await digestNativeStream(file.stream());
  if (digest.byteLength !== file.size) {
    throw new Error('LociMyu conversion: source ZIP size changed while hashing');
  }
  return { fileName: file.name, byteLength: digest.byteLength, sha256: digest.sha256 };
}

function sameFingerprint(left: LociMyuSourceFingerprint, right: LociMyuSourceFingerprint): boolean {
  return left.fileName === right.fileName && left.byteLength === right.byteLength && left.sha256 === right.sha256;
}

async function inspectModel(
  file: ForeignFile,
  issues: LociMyuNativeConversionIssue[],
): Promise<ConvertedModel | null> {
  const head = file.data.slice(0, Math.min(file.data.byteLength, 64 * 1024));
  const format = detectFormat(file.name, head);
  if (format === null) {
    issue(issues, 'blocking', 'model-format-unsupported', { id: file.path, field: 'model' },
      'The model format is not supported by the native receiver.',
      'No source-authoritative visual Asset can be created.');
    return null;
  }
  const source = byteSource(file, modelMediaType(format));
  let contentKind: NativeRepresentationDraftV1['contentKind'] = 'mesh';
  let role: NativeRepresentationDraftV1['role'] = 'meshPrimary';
  let profileId = nativeModelProfileId(format);
  let gsPly: NativeRepresentationDraftV1['gsPly'];
  let pointPly: NativeRepresentationDraftV1['pointPly'];
  if (format === 'ply') {
    try {
      const gs = await inspectNativeGsPlyV1(source);
      if (gs.kind === 'supported-gs') {
        contentKind = 'gaussianSplat';
        role = 'gsPrimary';
        profileId = NATIVE_GS_PROFILE_ID;
        gsPly = gs.facts;
      } else {
        const point = await inspectNativePointPlyV1(source);
        if (point.kind === 'supported-point') {
          contentKind = 'pointCloud';
          role = 'pointPrimary';
          profileId = NATIVE_POINT_PROFILE_ID;
          pointPly = point.facts;
        }
      }
    } catch (error) {
      issue(issues, 'blocking', 'model-profile-invalid', { id: file.path, field: 'model' },
        error instanceof Error ? error.message : String(error),
        'The source PLY is not admitted and no native Project is published.');
      return null;
    }
  }
  const assetId = newNativeId('ast');
  const bindingId = newNativeId('bnd');
  const revisionId = newNativeId('rev');
  const representationId = newNativeId('rep');
  const familyId = newNativeId('fam');
  const anchorCompatibilityId = newNativeId('cls');
  const asset: NativeAssetV1 = {
    id: assetId,
    label: cleanSingleLine(file.name.replace(/\.[^.]+$/u, ''), 'LociMyu model'),
    assetFrameId: newNativeId('frm'),
    status: { kind: 'ready', activeBindingId: bindingId },
  };
  const binding: NativeAssetBindingRevisionV1 = {
    id: bindingId,
    assetId,
    assetRevisionId: revisionId,
    assetToProject: NATIVE_IDENTITY_SIM3,
    method: 'import',
  };
  const revision: NativeAssetRevisionV1 = {
    id: revisionId,
    assetId,
    representationIds: [representationId],
    anchorCompatibilityClasses: [{ id: anchorCompatibilityId, targetVariantFamilyIds: [familyId] }],
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
  return { source: file, format, asset, binding, revision, representation, anchorCompatibilityId };
}

async function inspectMaterialTargets(model: ConvertedModel): Promise<Map<string, MaterialTarget[]>> {
  if (model.representation.contentKind !== 'mesh') return new Map();
  const loaded = await loadModel(model.format, model.source.data, { gltfTextures: { kind: 'skip' } });
  const result = new Map<string, MaterialTarget[]>();
  const add = (key: string, target: MaterialTarget): void => {
    if (key === '') return;
    const values = result.get(key) ?? [];
    if (!values.some((entry) => entry.nativeKey === target.nativeKey)) values.push(target);
    result.set(key, values);
  };
  const visit = (object: THREE.Object3D, path: readonly number[]): void => {
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material, slot) => {
        const target = {
          nativeKey: nativeMaterialSlotKey(path, slot),
        };
        // LociMyu's durable materialKey is the trimmed material name. Its
        // renderer broadcasts one row to every exact same-name material
        // instance; repeated slots are therefore valid targets, not an
        // ambiguity from which a winner must be guessed.
        add(lociMyuTrimV1(material.name), target);
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

function mediaAuthority(
  rows: readonly FileIdMapSourceRow[],
  images: readonly ForeignFile[],
): (fileId: string) => MediaResolution {
  const filenamesById = new Map<string, Set<string>>();
  const idsByFilename = new Map<string, Set<string>>();
  const taintedIds = new Set<string>();
  const taintedFilenames = new Set<string>();
  for (const row of rows) {
    const id = lociMyuTrimV1(row.fileId);
    const fileName = lociMyuTrimV1(row.fileName);
    if (id === '' && fileName === '') continue;
    if (id === '' || fileName === '') {
      if (id !== '') taintedIds.add(id);
      if (fileName !== '') taintedFilenames.add(fileName);
      continue;
    }
    const names = filenamesById.get(id) ?? new Set<string>();
    names.add(fileName);
    filenamesById.set(id, names);
    const ids = idsByFilename.get(fileName) ?? new Set<string>();
    ids.add(id);
    idsByFilename.set(fileName, ids);
  }
  const imagesByName = new Map<string, ForeignFile[]>();
  for (const image of images) {
    const name = lociMyuTrimV1(baseName(image.path));
    const current = imagesByName.get(name) ?? [];
    current.push(image);
    imagesByName.set(name, current);
  }
  return (fileId: string): MediaResolution => {
    const names = filenamesById.get(fileId);
    if (taintedIds.has(fileId)) return { file: null, reason: 'incomplete file-ID map row taints this ID', candidates: [...(names ?? [])] };
    if (names === undefined || names.size === 0) return { file: null, reason: 'no exact file-ID map entry', candidates: [] };
    if (names.size !== 1) return { file: null, reason: 'one file ID maps to multiple filenames', candidates: [...names] };
    const fileName = [...names][0]!;
    const reverse = idsByFilename.get(fileName);
    if (taintedFilenames.has(fileName)) return { file: null, reason: 'incomplete file-ID map row taints this filename', candidates: [fileName] };
    if (reverse === undefined || reverse.size !== 1 || !reverse.has(fileId)) {
      return { file: null, reason: 'filename does not map back to exactly one file ID', candidates: [...(reverse ?? [])] };
    }
    const matches = imagesByName.get(fileName) ?? [];
    if (matches.length !== 1) {
      return { file: null, reason: matches.length === 0 ? 'mapped filename has no exact media entry' : 'mapped basename matches multiple media entries', candidates: matches.map((file) => file.path) };
    }
    return { file: matches[0]!, reason: null, candidates: [] };
  };
}

function validCameraBasis(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  up: readonly [number, number, number],
): boolean {
  const direction = [target[0] - position[0], target[1] - position[1], target[2] - position[2]] as const;
  const directionLength = Math.hypot(...direction);
  const upLength = Math.hypot(...up);
  if (directionLength <= 1e-12 || upLength <= 1e-12) return false;
  const crossLength = Math.hypot(
    direction[1] * up[2] - direction[2] * up[1],
    direction[2] * up[0] - direction[0] * up[2],
    direction[0] * up[1] - direction[1] * up[0],
  );
  return Number.isFinite(crossLength) && crossLength / (directionLength * upLength) > 1e-12;
}

const LOCIMYU_LEGACY_DEFAULT_VERTICAL_FOV_DEGREES = 45;

function orthographicVerticalSpan(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  verticalFovDegrees: number,
): number | null {
  const distance = Math.hypot(
    target[0] - position[0],
    target[1] - position[1],
    target[2] - position[2],
  );
  const span = 2 * distance * Math.tan(THREE.MathUtils.degToRad(verticalFovDegrees) / 2);
  return Number.isFinite(span) && span > 0 ? span : null;
}

function countRows(table: SheetTable | undefined, predicate: (row: readonly string[]) => boolean): number {
  return table === undefined ? 0 : table.rows.slice(1).filter(predicate).length;
}

function captionRowsWithLocations(
  tables: readonly SheetTable[],
): Array<{ readonly table: SheetTable; readonly row: readonly string[]; readonly rowNumber: number }> {
  return tables.flatMap((table) => table.rows.slice(1)
    .map((row, index) => ({ table, row, rowNumber: index + 2 }))
    .filter(({ row }) => !isEmptyRow(row)));
}

/** Count every occurrence participating in a same-sheet duplicate group. */
function duplicateLegacyIdOccurrences(tables: readonly SheetTable[]): number {
  let total = 0;
  for (const table of tables) {
    const counts = new Map<string, number>();
    for (const { row } of captionRowsWithLocations([table])) {
      const legacyId = cell(row, 0);
      if (legacyId !== '') counts.set(legacyId, (counts.get(legacyId) ?? 0) + 1);
    }
    for (const count of counts.values()) if (count > 1) total += count;
  }
  return total;
}

function blockedDraft(projectId: string, projectFrameId: string, title: string): NativeProjectDraftV1 {
  return {
    project: {
      id: projectId,
      title,
      frame: { id: projectFrameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } },
    },
    assets: [],
    assetBindingRevisions: [],
    assetRevisions: [],
    representations: [],
    presentation: {
      displayMode: 'mesh-only',
      captionTargetAssetId: null,
      hiddenAssetIds: [],
    },
    captions: [],
    savedViews: [],
    displaySets: [],
    meshMaterialAppearances: [],
    mediaResources: [],
  };
}

function blockedPreflightPlan(input: {
  readonly snapshot: SelectedInputSnapshot;
  readonly sourceBefore: LociMyuSourceFingerprint;
  readonly selectedWorkbook: LociMyuWorkbookFingerprint;
  readonly captionTables: readonly SheetTable[];
  readonly projectId: string;
  readonly projectFrameId: string;
  readonly projectTitle: string;
  readonly issues: readonly LociMyuNativeConversionIssue[];
}): LociMyuNativeConversionPlan {
  const captionRows = captionRowsWithLocations(input.captionTables);
  const mappings: LociMyuNativeConversionMapping[] = [{
    sourceKind: 'workbook',
    sourceId: input.snapshot.workbookPath,
    disposition: 'reported',
    note: 'preflight input retained only in the original ZIP; Project publication blocked',
  }];
  for (const candidate of input.snapshot.workbookCandidates) {
    if (candidate.archivePath === input.snapshot.workbookPath) continue;
    mappings.push({
      sourceKind: 'workbook candidate',
      sourceId: candidate.archivePath,
      disposition: 'reported',
      note: candidate.validationFailure === undefined
        ? 'not selected by the deterministic coarse workbook rule'
        : `rejected candidate: ${candidate.validationFailure.code}: ${candidate.validationFailure.message}`,
    });
  }
  for (const message of input.snapshot.archiveDiagnostics) {
    mappings.push({ sourceKind: 'archive entry', sourceId: message, disposition: 'reported', note: 'unreadable/non-admitted archive input diagnostic' });
  }
  const blockingRows = new Set(input.issues
    .filter((entry) => entry.severity === 'blocking' && entry.sourceSheet !== null && entry.sourceRow !== null)
    .map((entry) => `${entry.sourceSheet}\u0000${entry.sourceRow}`));
  for (const table of input.snapshot.tables) {
    const tableName = lociMyuTrimV1(table.name);
    if (table.rows.some((row) => !isEmptyRow(row))) {
      mappings.push({ sourceKind: 'workbook sheet', sourceId: tableName, disposition: 'reported', note: 'accounted during blocked preflight' });
    }
  }
  const blockedRowKinds = new Map<string, string>([
    [LM_VIEWS_SHEET, 'view row'],
    [LM_MATERIALS_SHEET, 'material row'],
    [LM_SHEET_NAMES_SHEET, 'sheet authority row'],
    [LM_META_SHEET, 'metadata row'],
  ]);
  for (const table of input.snapshot.tables) {
    const sourceKind = blockedRowKinds.get(lociMyuTrimV1(table.name));
    if (sourceKind === undefined) continue;
    for (const [index, row] of table.rows.slice(1).entries()) {
      if (isEmptyRow(row)) continue;
      mappings.push({
        sourceKind,
        sourceId: `${lociMyuTrimV1(table.name)}:${index + 2}`,
        disposition: 'reported',
        note: 'not activated because stable-identity preflight blocked Project publication',
      });
    }
  }
  for (const entry of captionRows) {
    const sheet = lociMyuTrimV1(entry.table.name);
    const legacyId = cell(entry.row, 0);
    mappings.push({
      sourceKind: 'Caption row',
      sourceId: `${sheet}:${entry.rowNumber}:${legacyId || '(missing legacy ID)'}`,
      disposition: blockingRows.has(`${sheet}\u0000${entry.rowNumber}`) ? 'blocking' : 'reported',
      note: 'not converted because the selected workbook cannot produce a complete stable-identity result',
    });
  }
  for (const model of input.snapshot.models) {
    mappings.push({ sourceKind: 'model', sourceId: model.path, disposition: 'reported', note: 'not staged because preflight blocked publication' });
  }
  for (const image of input.snapshot.images) {
    mappings.push({ sourceKind: 'image', sourceId: image.path, disposition: 'reported', note: 'not staged because preflight blocked publication' });
  }
  for (const video of input.snapshot.videos) {
    mappings.push({ sourceKind: 'video', sourceId: video.path, disposition: 'reported', note: 'not staged because preflight blocked publication' });
  }
  for (const row of input.snapshot.fileIdMapRows) {
    mappings.push({ sourceKind: 'file-ID map row', sourceId: `${row.archivePath}:${row.rowNumber}`, disposition: 'reported', note: 'authority input accounted without activating a relation' });
  }
  const viewTable = input.snapshot.tables.find((table) => lociMyuTrimV1(table.name) === LM_VIEWS_SHEET);
  const materialTable = input.snapshot.tables.find((table) => lociMyuTrimV1(table.name) === LM_MATERIALS_SHEET);
  const inventory: LociMyuNativeSourceInventory = {
    workbookCandidateCount: input.snapshot.workbookCandidateCount,
    selectedWorkbook: input.selectedWorkbook,
    sheetCount: input.snapshot.tables.length,
    captionRowCount: captionRows.length,
    duplicateOccurrenceCount: duplicateLegacyIdOccurrences(input.captionTables),
    modelCount: input.snapshot.models.length,
    imageCount: input.snapshot.images.length,
    videoCount: input.snapshot.videos.length,
    fileIdMapRowCount: input.snapshot.fileIdMapRows.length,
    viewRowCount: countRows(viewTable, (row) => !isEmptyRow(row)),
    materialRowCount: countRows(materialTable, (row) => !isEmptyRow(row)),
  };
  return {
    sourceBefore: input.sourceBefore,
    selectedWorkbook: input.selectedWorkbook,
    inventory,
    draft: blockedDraft(input.projectId, input.projectFrameId, input.projectTitle),
    representationSources: new Map(),
    mediaSources: new Map(),
    mappings,
    issues: [...input.issues],
    blockingIssueCount: input.issues.filter((entry) => entry.severity === 'blocking').length,
  };
}

export async function planLociMyuZipToNative(
  sourceFile: File,
  inputPlan: ImportPlan,
  projectTitle: string,
  options: PlanLociMyuZipToNativeOptions = {},
): Promise<LociMyuNativeConversionPlan> {
  const input = snapshotSelectedInput(inputPlan);
  const suppliedDisplaySetConfirmation = options.confirmedDisplaySetRelation === undefined ||
      options.confirmedDisplaySetRelation === null
    ? null
    : {
        workbookArchivePath: options.confirmedDisplaySetRelation.workbookArchivePath,
        relations: options.confirmedDisplaySetRelation.relations.map((relation) => ({
          sheetGid: relation.sheetGid,
          sheetName: relation.sheetName,
        })),
      };
  const sourceBefore = await fingerprintFile(sourceFile);
  const workbookDigest = digestNativeBytes(input.workbookBytes);
  const selectedWorkbook: LociMyuWorkbookFingerprint = {
    archivePath: input.workbookPath,
    byteLength: workbookDigest.byteLength,
    sha256: workbookDigest.sha256,
  };
  const issues: LociMyuNativeConversionIssue[] = [];
  const mappings: LociMyuNativeConversionMapping[] = [];
  const projectId = newNativeId('prj');
  const projectFrameId = newNativeId('frm');
  const resolvedProjectTitle = cleanSingleLine(projectTitle, sourceFile.name.replace(/\.(zip|lociview)$/iu, ''));
  const sourceCaptionTables = input.tables.filter((table) =>
    !INTERNAL_SHEETS.has(lociMyuTrimV1(table.name)) && isLociMyuCaptionSheet(table.rows));
  const sourceCaptionTableSet = new Set(sourceCaptionTables);
  const missingLegacyIdRows = captionRowsWithLocations(sourceCaptionTables)
    .filter(({ row }) => cell(row, 0) === '');
  const conversionTables = input.tables.map((table): SheetTable => ({
    name: table.name,
    ...(table.gid === undefined ? {} : { gid: table.gid }),
    rows: table.rows.map((row, index) =>
      sourceCaptionTableSet.has(table) && index > 0 && !isEmptyRow(row) && cell(row, 0) === ''
        ? row.map(() => '')
        : [...row]),
  }));
  const captionTables = conversionTables.filter((table) =>
    !INTERNAL_SHEETS.has(lociMyuTrimV1(table.name)) && isLociMyuCaptionSheet(table.rows));
  for (const candidate of input.workbookCandidates) {
    if (candidate.archivePath === input.workbookPath) continue;
    const missingIdOnly = candidate.validationFailure?.code === 'missing-legacy-id';
    mappings.push({
      sourceKind: 'workbook candidate',
      sourceId: candidate.archivePath,
      disposition: 'reported',
      note: candidate.validationFailure === undefined
        ? 'not selected by the deterministic coarse workbook rule'
        : missingIdOnly
          ? 'not selected; ID-less Caption rows would be treated as empty if this workbook were selected'
        : `rejected candidate: ${candidate.validationFailure.code}: ${candidate.validationFailure.message}`,
    });
    if (candidate.validationFailure !== undefined && !missingIdOnly) {
      issue(issues, 'warning', 'workbook-candidate-rejected', { id: candidate.archivePath, field: 'workbook' },
        candidate.validationFailure.message,
        'The candidate is not mixed with the selected workbook and remains only in the retained source ZIP/report.');
    }
  }
  for (const message of input.archiveDiagnostics) {
    issue(issues, 'warning', 'archive-entry-reported', { field: 'archive entry' }, message,
      'The entry is not copied into native state and remains in the retained source ZIP/report.');
  }
  for (const entry of missingLegacyIdRows) {
    const sheet = lociMyuTrimV1(entry.table.name);
    issue(issues, 'warning', 'caption-row-skipped-missing-id', {
      sheet: lociMyuTrimV1(entry.table.name),
      row: entry.rowNumber,
      field: 'legacyCaptionId',
    }, 'The non-empty source row has no trimmed legacy ID and is treated as an empty Caption row by the approved direct-adapter rule.',
    'No Caption or guessed ID is created; the unchanged row remains in the retained source ZIP and is explicit in this report.');
    mappings.push({
      sourceKind: 'Caption row',
      sourceId: `${sheet}:${entry.rowNumber}:(missing legacy ID)`,
      disposition: 'reported',
      note: 'treated as empty input; no Caption created and no occurrence ordinal consumed',
    });
  }
  if (input.selectedValidationFailure !== undefined && input.selectedValidationFailure.code !== 'missing-legacy-id') {
    issue(issues, 'blocking', input.selectedValidationFailure.code, {
      id: input.workbookPath,
      field: 'Caption identity',
    }, input.selectedValidationFailure.message,
    'No alternate workbook or identity is guessed and no native Project is published.');
    return blockedPreflightPlan({
      snapshot: input,
      sourceBefore,
      selectedWorkbook,
      captionTables: sourceCaptionTables,
      projectId,
      projectFrameId,
      projectTitle: resolvedProjectTitle,
      issues,
    });
  }
  let migration;
  try {
    migration = await analyzeLociMyuSheets(conversionTables);
  } catch (error) {
    if (!(error instanceof LociMyuSourceValidationError) && !(error instanceof LociMyuIdentityCollisionError)) throw error;
    issue(issues, 'blocking', error.code, { id: input.workbookPath, field: 'Caption identity' },
      error.message,
      'No identity is guessed and no native Project is published.');
    return blockedPreflightPlan({
      snapshot: input,
      sourceBefore,
      selectedWorkbook,
      captionTables: sourceCaptionTables,
      projectId,
      projectFrameId,
      projectTitle: resolvedProjectTitle,
      issues,
    });
  }
  if (migration.sets.length === 0) {
    issue(issues, 'blocking', 'locimyu-sheets-missing', { id: input.workbookPath },
      'The selected workbook has no admitted LociMyu Caption sheets.',
      'No native Project is published.');
  }

  const identityProjection = projectLociMyuCaptionSheetIdentities(conversionTables);
  const authoritativeSetNameByGid = new Map<string, string>();
  for (const table of captionTables) {
    const identity = identityProjection.get(table);
    if (identity?.kind === 'legacyGid') authoritativeSetNameByGid.set(identity.value, lociMyuTrimV1(table.name));
  }
  const relationPlan = planLociMyuDisplaySetRelationConfirmation(conversionTables);
  const confirmedRelations = relationPlan.kind === 'confirmation-required' &&
      suppliedDisplaySetConfirmation !== null &&
      suppliedDisplaySetConfirmation.workbookArchivePath === input.workbookPath &&
      suppliedDisplaySetConfirmation.relations.length === relationPlan.relations.length &&
      suppliedDisplaySetConfirmation.relations.every((relation, index) => {
        const expected = relationPlan.relations[index];
        return expected !== undefined && relation.sheetGid === expected.sheetGid && relation.sheetName === expected.sheetName;
      })
    ? relationPlan.relations
    : null;
  if (suppliedDisplaySetConfirmation !== null && confirmedRelations === null) {
    issue(issues, 'blocking', 'display-set-relation-confirmation-invalid', {
      id: input.workbookPath,
      field: 'DisplaySet relation confirmation',
    }, 'The supplied DisplaySet relation confirmation is stale, partial, reordered, or does not match the selected workbook.',
    'No relation is guessed and no native Project is published.', relationPlan.kind === 'confirmation-required'
      ? relationPlan.relations.map((relation) => `${relation.sheetGid}:${relation.sheetName}`)
      : []);
  } else if (relationPlan.kind === 'confirmation-required' && confirmedRelations === null) {
    issue(issues, 'info', 'display-set-relation-confirmation-required', {
      id: input.workbookPath,
      field: 'DisplaySet relation confirmation',
    }, 'Two source state tables corroborate one complete relation proposal, but the user did not confirm it.',
    'Caption identity remains unchanged; unresolved Saved Views and material appearances stay inactive.',
    relationPlan.relations.map((relation) => `${relation.sheetGid}:${relation.sheetName}`));
  } else if (confirmedRelations !== null) {
    issue(issues, 'info', 'display-set-relation-user-confirmed', {
      id: input.workbookPath,
      field: 'DisplaySet relation confirmation',
    }, 'The user confirmed the complete relation proposal corroborated by the view and material tables.',
    'The confirmed relations may activate Saved Views and material appearances only; Caption identity remains source-exact or sheet-name fallback.',
    confirmedRelations.map((relation) => `${relation.sheetGid}:${relation.sheetName}`));
  }
  const activationSetNameByGid = new Map(authoritativeSetNameByGid);
  for (const relation of confirmedRelations ?? []) {
    activationSetNameByGid.set(relation.sheetGid, relation.sheetName);
  }
  const corroboratedCandidateByGid = new Map(
    relationPlan.kind === 'confirmation-required'
      ? relationPlan.relations.map((relation) => [relation.sheetGid, relation.sheetName] as const)
      : [],
  );
  const candidateTitlesByGid = new Map<string, Set<string>>();
  const candidateGidsByTitle = new Map<string, Set<string>>();
  const sheetMap = conversionTables.find((table) => lociMyuTrimV1(table.name) === LM_SHEET_NAMES_SHEET);
  for (const row of sheetMap?.rows.slice(1) ?? []) {
    const gid = cell(row, 0);
    const title = cell(row, 2) !== '' ? cell(row, 2) : cell(row, 1);
    if (gid === '' || title === '') continue;
    const titles = candidateTitlesByGid.get(gid) ?? new Set<string>();
    titles.add(title);
    candidateTitlesByGid.set(gid, titles);
    const gids = candidateGidsByTitle.get(title) ?? new Set<string>();
    gids.add(gid);
    candidateGidsByTitle.set(title, gids);
  }

  const displaySets: NativeDisplaySetV1[] = migration.sets.map((set, index) => ({
    id: newNativeId('set'),
    name: cleanSingleLine(set.name, `表示セット ${index + 1}`),
    orderKey: String(index).padStart(6, '0'),
    defaultSavedViewId: null,
  }));
  const displaySetIdByName = new Map(migration.sets.map((set, index) => [set.name, displaySets[index]!.id]));
  for (const [index, set] of migration.sets.entries()) {
    mappings.push({ sourceKind: 'Caption sheet', sourceId: set.name, disposition: 'converted', targetKind: 'DisplaySet', targetId: displaySets[index]!.id });
  }
  for (const relation of confirmedRelations ?? []) {
    mappings.push({
      sourceKind: 'DisplaySet relation confirmation',
      sourceId: `${relation.sheetGid}:${relation.sheetName}`,
      disposition: 'converted',
      targetKind: 'DisplaySet activation relation',
      targetId: displaySetIdByName.get(relation.sheetName),
      relationBasis: 'user-confirmed-corroborated-order',
      note: 'activation-only; Caption identity is unchanged',
    });
  }
  for (const [index, row] of (sheetMap?.rows.slice(1) ?? []).entries()) {
    if (isEmptyRow(row)) continue;
    const rowNumber = index + 2;
    const gid = cell(row, 0);
    const title = cell(row, 2) !== '' ? cell(row, 2) : cell(row, 1);
    const targetSetName = gid === '' ? undefined : authoritativeSetNameByGid.get(gid);
    const targetSetId = targetSetName === undefined ? undefined : displaySetIdByName.get(targetSetName);
    if (cell(row, 3) !== '') {
      issue(issues, 'info', 'sheet-authority-fields-reported', {
        sheet: LM_SHEET_NAMES_SHEET, row: rowNumber, id: gid || null, field: 'updatedAt',
      }, 'The first native DisplaySet schema has no durable sheet-registry timestamp.',
      'The DisplaySet authority relation is evaluated normally; updatedAt remains in the report/source ZIP.');
    }
    const exact = gid !== '' && title !== '' && targetSetName === title &&
      candidateTitlesByGid.get(gid)?.size === 1 && candidateGidsByTitle.get(title)?.size === 1 &&
      targetSetId !== undefined;
    mappings.push({
      sourceKind: 'sheet authority row',
      sourceId: `${LM_SHEET_NAMES_SHEET}:${rowNumber}`,
      disposition: exact ? 'converted' : 'reported',
      ...(exact ? { targetKind: 'DisplaySet authority', targetId: targetSetId } : {}),
      ...(exact ? { relationBasis: 'source-exact' as const } : {}),
    });
    if (!exact) {
      issue(issues, 'warning', gid === '' || title === '' ? 'sheet-authority-row-incomplete' : 'sheet-authority-row-inactive', {
        sheet: LM_SHEET_NAMES_SHEET,
        row: rowNumber,
        id: gid || null,
        field: gid === '' ? 'sheetGid' : title === '' ? 'sheetTitle' : 'sheet relation',
      }, gid === '' || title === ''
        ? 'The sheet-authority row is incomplete.'
        : 'The GID/title relation is absent, conflicting, reverse-conflicting or does not name one Caption sheet exactly.',
      'The relation is not used for native Caption identity, Saved View or material activation.', [
        ...(candidateTitlesByGid.get(gid) ?? []),
        ...(candidateGidsByTitle.get(title) ?? []),
      ]);
    }
  }
  for (const table of conversionTables) {
    const name = lociMyuTrimV1(table.name);
    if (captionTables.includes(table)) {
      mappings.push({ sourceKind: 'workbook sheet', sourceId: name, disposition: 'converted', note: 'Caption DisplaySet source' });
    } else if (INTERNAL_SHEETS.has(name)) {
      mappings.push({ sourceKind: 'workbook sheet', sourceId: name, disposition: 'reported', note: name === LM_META_SHEET ? 'metadata has no native destination' : 'container; each supported row is accounted separately' });
      if (name === LM_META_SHEET && table.rows.some((row) => !isEmptyRow(row))) {
        issue(issues, 'info', 'metadata-sheet-reported', { sheet: name },
          'The first native adapter has no durable destination for LociMyu metadata rows.',
          'The values remain in the retained source ZIP and are represented by this report entry.');
      }
    } else if (table.rows.some((row) => !isEmptyRow(row))) {
      mappings.push({ sourceKind: 'workbook sheet', sourceId: name, disposition: 'reported', note: 'not a supported LociMyu sheet' });
      issue(issues, 'info', 'sheet-unsupported-reported', { sheet: name },
        'The non-empty sheet is not part of the admitted LociMyu schema.',
        'It is not copied into native state and remains available only in the separately retained ZIP.');
    }
  }

  let model: ConvertedModel | null = null;
  const representationSources = new Map<string, NativeBinarySource>();
  if (input.models.length !== 1) {
    issue(issues, 'blocking', 'model-owner-not-unique', { field: 'model' },
      input.models.length === 0 ? 'No supported model entry is present.' : 'Multiple supported model entries are present and no source-authoritative owner exists.',
      'Caption coordinates, material targets and Asset transforms are not guessed; Project publication is blocked.',
      input.models.map((entry) => entry.path));
    for (const entry of input.models) mappings.push({ sourceKind: 'model', sourceId: entry.path, disposition: 'blocking' });
  } else {
    model = await inspectModel(input.models[0]!, issues);
    if (model !== null) {
      representationSources.set(model.representation.id, byteSource(model.source, model.representation.mediaType));
      mappings.push({ sourceKind: 'model', sourceId: model.source.path, disposition: 'converted', targetKind: 'Asset', targetId: model.asset.id });
      mappings.push({ sourceKind: 'model bytes', sourceId: model.source.path, disposition: 'converted', targetKind: 'Representation', targetId: model.representation.id, note: `${model.source.data.byteLength} unchanged bytes; LociMyu model frame -> ProjectFrame identity` });
      mappings.push({ sourceKind: 'model transform', sourceId: model.source.path, disposition: 'converted', targetKind: 'AssetBindingRevision', targetId: model.binding.id, note: 'approved LociMyu model/Caption frame definition maps to ProjectFrame with identity Sim(3)' });
    }
  }

  const resolveMedia = mediaAuthority(input.fileIdMapRows, input.images);
  const mediaResources: NativeMediaResourceDraftV1[] = [];
  const mediaSources = new Map<string, NativeBinarySource>();
  const mediaIdByPath = new Map<string, string>();
  const linkedImagePaths = new Set<string>();
  const captions: NativeCaptionV1[] = [];
  for (const [setIndex, set] of migration.sets.entries()) {
    const table = captionTables.find((candidate) => lociMyuTrimV1(candidate.name) === set.name);
    const sourceRows = table?.rows.slice(1).map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => !isEmptyRow(row)) ?? [];
    if (sourceRows.length !== set.captions.length) {
      issue(issues, 'blocking', 'caption-accounting-mismatch', { sheet: set.name },
        'Decoded non-empty Caption rows do not match the analyzed identity plan.',
        'Project publication is blocked before any source row can be omitted.');
    }
    const displaySetId = displaySets[setIndex]!.id;
    for (const [captionIndex, caption] of set.captions.entries()) {
      const sourceRow = sourceRows[captionIndex];
      const locator = { sheet: set.name, row: sourceRow?.rowNumber ?? null, id: caption.legacyId };
      const attachments: string[] = [];
      if (caption.legacyImageFileId !== null) {
        const resolution = resolveMedia(caption.legacyImageFileId);
        if (resolution.file === null) {
          issue(issues, 'warning', 'media-relation-unlinked', { ...locator, field: 'imageFileId' },
            resolution.reason ?? 'The media relation is not source-authoritative.',
            'The Caption remains active with no attachment.', resolution.candidates);
        } else {
          const mediaInspection = imageMediaType(resolution.file);
          if (mediaInspection.mediaType === null) {
            issue(issues, 'warning', mediaInspection.reason === 'filename-bytes-conflict'
              ? 'media-filename-bytes-conflict'
              : 'media-profile-unsupported', { ...locator, field: 'imageFileId' },
              mediaInspection.reason === 'filename-bytes-conflict'
                ? 'The exact map filename extension conflicts with the media bytes.'
                : 'The exactly related image is not one of the native image profiles.',
              'The Caption remains active with no attachment.', [resolution.file.path]);
          } else {
            let mediaId = mediaIdByPath.get(resolution.file.path);
            if (mediaId === undefined) {
              mediaId = newNativeId('med');
              mediaIdByPath.set(resolution.file.path, mediaId);
              mediaResources.push({ id: mediaId, label: cleanSingleLine(resolution.file.name, 'Caption image'), kind: 'image', mediaType: mediaInspection.mediaType });
              mediaSources.set(mediaId, byteSource(resolution.file, mediaInspection.mediaType));
              mappings.push({ sourceKind: 'image', sourceId: resolution.file.path, disposition: 'converted', targetKind: 'Caption media', targetId: mediaId, note: `${resolution.file.data.byteLength} unchanged bytes` });
            }
            linkedImagePaths.add(resolution.file.path);
            attachments.push(mediaId);
          }
        }
      }
      const rawColor = cell(sourceRow?.row, 3);
      if (rawColor !== '' && hexColor(rawColor) === null) {
        issue(issues, 'warning', 'caption-color-defaulted', { ...locator, field: 'color' },
          'The source color is not an exact six-digit sRGB hex value.',
          'The established LociMyu Caption default is used; the original value remains in the report/source ZIP.');
      }
      const rawPosition = [cell(sourceRow?.row, 4), cell(sourceRow?.row, 5), cell(sourceRow?.row, 6)];
      if (caption.position === null && rawPosition.some((value) => value !== '')) {
        issue(issues, 'warning', 'caption-position-unplaced', { ...locator, field: 'position' },
          'The source coordinate tuple is incomplete or non-finite.',
          'The Caption remains active and editable as unplaced.');
      }
      const unsupportedFields = [
        cell(sourceRow?.row, 8) === '' ? null : 'createdAt',
        cell(sourceRow?.row, 9) === '' ? null : 'updatedAt',
      ].filter((field): field is string => field !== null);
      if (unsupportedFields.length > 0) {
        issue(issues, 'info', 'caption-fields-reported', { ...locator, field: unsupportedFields.join(',') },
          'The first native Caption schema has no durable destination for these source timestamps.',
          'Caption content and identity are converted; the timestamps remain in the report/source ZIP.');
      }
      if (caption.identity.key.occurrence > 0) {
        issue(issues, 'info', 'duplicate-legacy-id-occurrence-preserved', locator,
          'This is an additional occurrence of the same legacy ID in one sheet.',
          'It is preserved as a distinct Caption using locimyu-caption-id-2.');
      }
      const rawTitle = caption.title;
      const title = cleanSingleLine(rawTitle, 'Caption');
      if (title !== rawTitle) {
        issue(issues, 'warning', 'caption-title-normalized', { ...locator, field: 'title' },
          'The native single-line title cannot retain controls or an empty label.',
          'The safe title is used and the original remains in the report/source ZIP.');
      }
      const anchor = caption.position !== null && model !== null
        ? {
            kind: 'asset' as const,
            assetId: model.asset.id,
            assetFrameId: model.asset.assetFrameId,
            positionAsset: caption.position,
            authoredAssetRevisionId: model.revision.id,
            authoredAnchorCompatibilityId: model.anchorCompatibilityId,
            hitEvidence: { method: 'manual' as const },
          }
        : null;
      captions.push({
        id: caption.captionId,
        title,
        body: caption.body,
        displaySetId,
        color: caption.color,
        ...(attachments.length === 0 ? {} : { attachmentMediaIds: attachments }),
        anchor,
      });
      mappings.push({
        sourceKind: 'Caption row',
        sourceId: `${set.name}:${sourceRow?.rowNumber ?? captionIndex + 2}:${caption.legacyId}`,
        disposition: 'converted',
        targetKind: 'Caption',
        targetId: caption.captionId,
        note: anchor === null ? 'active unplaced Caption' : 'Asset-local position preserved',
      });
    }
  }
  for (const image of input.images) {
    if (linkedImagePaths.has(image.path)) continue;
    mappings.push({ sourceKind: 'image', sourceId: image.path, disposition: 'reported', note: 'not connected by one exact source-authoritative relation' });
  }
  for (const video of input.videos) {
    mappings.push({ sourceKind: 'video', sourceId: video.path, disposition: 'reported', note: 'Caption video media is outside the first native adapter' });
    issue(issues, 'info', 'video-reported', { id: video.path, field: 'media' },
      'The first native Caption-media receiver admits images only.',
      'The video remains only in the separately retained ZIP and report.');
  }
  for (const row of input.fileIdMapRows) {
    const id = lociMyuTrimV1(row.fileId);
    const name = lociMyuTrimV1(row.fileName);
    if (id === '' && name === '') continue;
    const resolution = id === '' ? null : resolveMedia(id);
    const exact = id !== '' && name !== '' && resolution?.file !== null &&
      resolution?.file !== undefined && lociMyuTrimV1(baseName(resolution.file.path)) === name;
    mappings.push({
      sourceKind: 'file-ID map row',
      sourceId: `${row.archivePath}:${row.rowNumber}`,
      disposition: exact ? 'converted' : 'reported',
      note: exact ? 'one-to-one exact authority relation' : 'relation remains inactive',
    });
    if (!exact) {
      issue(issues, 'warning', id === '' || name === '' ? 'file-id-map-row-incomplete' : 'file-id-map-row-inactive', {
        sheet: row.archivePath,
        row: row.rowNumber,
        id: id || null,
        field: id === '' ? 'fileId' : name === '' ? 'filename' : 'media relation',
      }, id === '' || name === ''
        ? 'The file-ID authority row is incomplete and taints its non-empty value.'
        : resolution?.reason ?? 'The exact map filename does not match the resolved archive media basename.',
      'No attachment relation is activated from this row.', resolution?.candidates ?? [name]);
    }
  }

  const savedViews: NativeSavedViewV1[] = [];
  const viewIdsByDisplaySet = new Map<string, string[]>();
  const viewTable = conversionTables.find((table) => lociMyuTrimV1(table.name) === LM_VIEWS_SHEET);
  for (const [index, row] of (viewTable?.rows.slice(1) ?? []).entries()) {
    if (isEmptyRow(row)) continue;
    const rowNumber = index + 2;
    const sourceId = cell(row, 0);
    const gid = cell(row, 1);
    const unsupportedViewFields = [
      cell(row, 15) === '' ? null : 'createdAt',
      cell(row, 16) === '' ? null : 'updatedAt',
    ].filter((field): field is string => field !== null);
    if (unsupportedViewFields.length > 0) {
      issue(issues, 'info', 'view-fields-reported', {
        sheet: LM_VIEWS_SHEET, row: rowNumber, id: sourceId || null, field: unsupportedViewFields.join(','),
      }, 'The first native Saved View schema has no durable source timestamps.',
      'The view is evaluated normally; these fields remain in the report/source ZIP.');
    }
    const setName = activationSetNameByGid.get(gid);
    const displaySetId = setName === undefined ? undefined : displaySetIdByName.get(setName);
    if (sourceId === '' || displaySetId === undefined) {
      issue(issues, 'warning', 'view-relation-inactive', { sheet: LM_VIEWS_SHEET, row: rowNumber, id: sourceId || null, field: sourceId === '' ? 'id' : 'captionSheetGid' },
        sourceId === '' ? 'The view row has no stable source ID.' : 'The view GID has no exact one-to-one Caption-sheet authority.',
        'No Saved View is activated.', [
          ...(candidateTitlesByGid.get(gid) ?? []),
          ...(corroboratedCandidateByGid.has(gid) ? [corroboratedCandidateByGid.get(gid)!] : []),
        ]);
      mappings.push({ sourceKind: 'view row', sourceId: `${LM_VIEWS_SHEET}:${rowNumber}`, disposition: 'reported' });
      continue;
    }
    const cameraKind = cell(row, 4).toLowerCase();
    if (cameraKind !== '' && cameraKind !== 'perspective' && cameraKind !== 'orthographic') {
      issue(issues, 'warning', 'view-camera-kind-reported', { sheet: LM_VIEWS_SHEET, row: rowNumber, id: sourceId, field: 'cameraType' },
        'The camera type is not an admitted source value.', 'The view is not activated.');
      mappings.push({ sourceKind: 'view row', sourceId, disposition: 'reported' });
      continue;
    }
    const positionAndTargetValues = [5, 6, 7, 8, 9, 10].map((column) => finiteNumber(cell(row, column)));
    const rawUp = [11, 12, 13].map((column) => cell(row, column));
    const usesLegacyDefaultUp = cameraKind === 'orthographic' && rawUp.every((value) => value === '');
    const parsedUp = usesLegacyDefaultUp
      ? [0, 1, 0]
      : rawUp.map((value) => finiteNumber(value));
    const rawFov = cell(row, 14);
    const parsedFov = finiteNumber(rawFov);
    const verticalFovDegrees = cameraKind === 'orthographic' && rawFov === ''
      ? LOCIMYU_LEGACY_DEFAULT_VERTICAL_FOV_DEGREES
      : parsedFov;
    if (positionAndTargetValues.some((value) => value === null) || parsedUp.some((value) => value === null) ||
      verticalFovDegrees === null ||
      verticalFovDegrees <= 1 || verticalFovDegrees >= 179) {
      issue(issues, 'warning', 'view-camera-values-reported', { sheet: LM_VIEWS_SHEET, row: rowNumber, id: sourceId, field: 'camera' },
        cameraKind === 'orthographic' && rawFov !== ''
          ? 'The orthographic camera vectors or non-empty field of view are invalid.'
          : 'The camera vectors or field of view are incomplete or invalid.',
        'The view is not activated.');
      mappings.push({ sourceKind: 'view row', sourceId, disposition: 'reported' });
      continue;
    }
    const position = positionAndTargetValues.slice(0, 3) as [number, number, number];
    const target = positionAndTargetValues.slice(3, 6) as [number, number, number];
    const up = parsedUp as [number, number, number];
    if (!validCameraBasis(position, target, up)) {
      issue(issues, 'warning', 'view-camera-basis-reported', { sheet: LM_VIEWS_SHEET, row: rowNumber, id: sourceId, field: 'camera' },
        'The camera direction and up vector do not form a valid basis.', 'The view is not activated.');
      mappings.push({ sourceKind: 'view row', sourceId, disposition: 'reported' });
      continue;
    }
    let projection: NativeSavedViewV1['camera']['projection'];
    if (cameraKind === 'orthographic') {
      const verticalSpan = orthographicVerticalSpan(position, target, verticalFovDegrees);
      if (verticalSpan === null) {
        issue(issues, 'warning', 'orthographic-view-span-reported', {
          sheet: LM_VIEWS_SHEET,
          row: rowNumber,
          id: sourceId,
          field: 'projection.verticalSpan',
        }, 'The approved orthographic compatibility formula did not produce a finite positive span.',
        'The view is not activated.');
        mappings.push({ sourceKind: 'view row', sourceId, disposition: 'reported' });
        continue;
      }
      projection = { kind: 'orthographic', verticalSpan };
      issue(issues, 'warning', 'orthographic-view-span-approximated', {
        sheet: LM_VIEWS_SHEET,
        row: rowNumber,
        id: sourceId,
        field: 'projection.verticalSpan',
      }, 'LociMyu did not persist the runtime orthographic height.',
      'The active native Saved View uses the Product Owner-approved compatibility approximation and may differ in scale from the original LociMyu view.', [
        `fovDegrees=${verticalFovDegrees}`,
        `fovSource=${rawFov === '' ? 'legacy-default' : 'source'}`,
        `upSource=${usesLegacyDefaultUp ? 'legacy-default-y-up' : 'source'}`,
        `verticalSpan=${verticalSpan}`,
      ]);
    } else {
      projection = { kind: 'perspective', verticalFovRadians: THREE.MathUtils.degToRad(verticalFovDegrees) };
    }
    const rawBackground = cell(row, 3);
    const background = hexColor(rawBackground) ?? [16 / 255, 16 / 255, 16 / 255] as const;
    if (rawBackground !== '' && hexColor(rawBackground) === null) {
      issue(issues, 'warning', 'view-background-defaulted', { sheet: LM_VIEWS_SHEET, row: rowNumber, id: sourceId, field: 'bgColor' },
        'The background is not an exact six-digit sRGB hex value.', 'The established dark background is used.');
    }
    const rawName = cell(row, 2);
    const viewId = newNativeId('view');
    savedViews.push({
      id: viewId,
      name: cleanSingleLine(rawName === LAST_VIEW_NAME ? '前回の視点' : rawName, `ビュー ${savedViews.length + 1}`),
      orderKey: String(savedViews.length).padStart(6, '0'),
      projectFrameId,
      camera: { position, target, up, projection },
      background: { kind: 'solid', colorSrgb: background },
      displaySetId,
    });
    const setViews = viewIdsByDisplaySet.get(displaySetId) ?? [];
    setViews.push(viewId);
    viewIdsByDisplaySet.set(displaySetId, setViews);
    mappings.push({
      sourceKind: 'view row',
      sourceId,
      disposition: 'converted',
      targetKind: 'SavedView',
      targetId: viewId,
      ...(cameraKind === 'orthographic' ? { note: 'orthographic span uses approved legacy compatibility approximation' } : {}),
    });
  }
  const displaySetsWithViews = displaySets.map((set) => {
    const viewIds = viewIdsByDisplaySet.get(set.id) ?? [];
    if (viewIds.length > 1) {
      issue(issues, 'info', 'display-set-default-view-ambiguous', { id: set.name, field: 'defaultSavedViewId' },
        'More than one exact Saved View belongs to this DisplaySet.', 'All views are retained, but no default winner is selected.', viewIds);
    }
    return { ...set, defaultSavedViewId: viewIds.length === 1 ? viewIds[0]! : null };
  });

  const meshMaterialAppearances: NativeMeshMaterialAppearanceV1[] = [];
  let materialTargets = new Map<string, MaterialTarget[]>();
  if (model !== null) {
    try {
      materialTargets = await inspectMaterialTargets(model);
    } catch (error) {
      issue(issues, 'blocking', 'model-decode-failed', { id: model.source.path, field: 'model' },
        error instanceof Error ? error.message : String(error),
        'The source model cannot be established as the native visual/coordinate owner, so no Project is published.');
    }
  }
  const materialTable = conversionTables.find((table) => lociMyuTrimV1(table.name) === LM_MATERIALS_SHEET);
  const materialRows = (materialTable?.rows.slice(1) ?? []).map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => !isEmptyRow(row));
  const latestMaterialRow = new Map<string, number>();
  for (const entry of materialRows) latestMaterialRow.set(`${cell(entry.row, 13)}\u0000${cell(entry.row, 0)}`, entry.rowNumber);
  for (const entry of materialRows) {
    const key = cell(entry.row, 0);
    const gid = cell(entry.row, 13);
    const sourceId = `${gid}:${key}:${entry.rowNumber}`;
    if (key === '') {
      issue(issues, 'warning', 'material-key-missing', { sheet: LM_MATERIALS_SHEET, row: entry.rowNumber, field: 'materialKey' },
        'The non-empty material row has no key.', 'No material appearance is activated.');
      mappings.push({ sourceKind: 'material row', sourceId, disposition: 'reported' });
      continue;
    }
    if (latestMaterialRow.get(`${gid}\u0000${key}`) !== entry.rowNumber) {
      mappings.push({ sourceKind: 'material row', sourceId, disposition: 'reported', note: 'superseded by the source append-only current-state row' });
      continue;
    }
    const setName = activationSetNameByGid.get(gid);
    const displaySetId = setName === undefined ? undefined : displaySetIdByName.get(setName);
    const targets = materialTargets.get(key) ?? [];
    if (displaySetId === undefined || model === null || model.representation.contentKind !== 'mesh' || targets.length === 0) {
      issue(issues, 'warning', 'material-relation-inactive', { sheet: LM_MATERIALS_SHEET, row: entry.rowNumber, id: key, field: displaySetId === undefined ? 'sheetGid' : 'materialKey' },
        displaySetId === undefined
          ? 'The material GID has no exact one-to-one Caption-sheet authority.'
          : 'No Mesh material slot has the exact trimmed LociMyu material name.',
        'No material appearance is activated.', displaySetId === undefined ? [
          ...(candidateTitlesByGid.get(gid) ?? []),
          ...(corroboratedCandidateByGid.has(gid) ? [corroboratedCandidateByGid.get(gid)!] : []),
        ] : targets.map((target) => target.nativeKey));
      mappings.push({ sourceKind: 'material row', sourceId, disposition: 'reported' });
      continue;
    }
    const opacityRaw = cell(entry.row, 1);
    const opacity = opacityRaw === '' ? 1 : finiteNumber(opacityRaw);
    const doubleSided = booleanCell(cell(entry.row, 2));
    const unlit = booleanCell(cell(entry.row, 3));
    const chromaEnabled = booleanCell(cell(entry.row, 4));
    const toleranceRaw = cell(entry.row, 6);
    const featherRaw = cell(entry.row, 7);
    const tolerance = toleranceRaw === '' ? 0 : finiteNumber(toleranceRaw);
    const feather = featherRaw === '' ? 0 : finiteNumber(featherRaw);
    const chromaColor = cell(entry.row, 5) === '' ? [0, 0, 0] as const : hexColor(cell(entry.row, 5));
    if (opacity === null || opacity < 0 || opacity > 1 || doubleSided === null || unlit === null || chromaEnabled === null ||
        tolerance === null || tolerance < 0 || tolerance > 1 || feather === null || feather < 0 || feather > 1 || chromaColor === null) {
      issue(issues, 'warning', 'material-values-reported', { sheet: LM_MATERIALS_SHEET, row: entry.rowNumber, id: key, field: 'appearance' },
        'The material row contains a value outside the admitted native appearance range.', 'No material appearance is activated.');
      mappings.push({ sourceKind: 'material row', sourceId, disposition: 'reported' });
      continue;
    }
    const appearanceIds: string[] = [];
    for (const target of targets) {
      const appearanceId = newNativeId('mat');
      appearanceIds.push(appearanceId);
      meshMaterialAppearances.push({
        id: appearanceId,
        displaySetId,
        assetId: model.asset.id,
        authoredAssetRevisionId: model.revision.id,
        representationId: model.representation.id,
        materialSlotKey: target.nativeKey,
        opacity,
        doubleSided,
        unlit,
        chroma: { enabled: chromaEnabled, colorSrgb: chromaColor, tolerance, feather },
      });
    }
    const unsupported = entry.row.slice(8, 13).map((value, offset) => lociMyuTrimV1(value) === '' ? null : cell(materialTable?.rows[0], offset + 8) || `column${offset + 9}`)
      .filter((value): value is string => value !== null);
    if (unsupported.length > 0) {
      issue(issues, 'info', 'material-fields-reported', { sheet: LM_MATERIALS_SHEET, row: entry.rowNumber, id: key, field: unsupported.join(',') },
        'These LociMyu material fields have no first native appearance destination.',
        'The supported appearance is activated; remaining values stay in the report/source ZIP.');
    }
    for (const [index, appearanceId] of appearanceIds.entries()) {
      mappings.push({
        sourceKind: 'material row',
        sourceId,
        disposition: 'converted',
        targetKind: 'MeshMaterialAppearance',
        targetId: appearanceId,
        note: `exact trimmed material name -> slot ${targets[index]!.nativeKey}`,
      });
    }
  }

  const assets = model === null ? [] : [model.asset];
  const representations = model === null ? [] : [model.representation];
  const hasGs = model?.representation.contentKind === 'gaussianSplat';
  const draft: NativeProjectDraftV1 = {
    project: {
      id: projectId,
      title: resolvedProjectTitle,
      frame: { id: projectFrameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } },
    },
    assets,
    assetBindingRevisions: model === null ? [] : [model.binding],
    assetRevisions: model === null ? [] : [model.revision],
    representations,
    presentation: {
      displayMode: hasGs ? 'gs-only' : 'mesh-only',
      captionTargetAssetId: model?.asset.id ?? null,
      hiddenAssetIds: [],
      activeDisplaySetId: displaySetsWithViews[0]?.id,
    },
    captions,
    savedViews,
    displaySets: displaySetsWithViews,
    meshMaterialAppearances,
    mediaResources,
  };
  mappings.unshift({ sourceKind: 'workbook', sourceId: input.workbookPath, disposition: 'converted', targetKind: 'native conversion input', note: `${selectedWorkbook.byteLength} bytes / sha256 ${selectedWorkbook.sha256}` });
  const inventory: LociMyuNativeSourceInventory = {
    workbookCandidateCount: input.workbookCandidateCount,
    selectedWorkbook,
    sheetCount: input.tables.length,
    captionRowCount: captionRowsWithLocations(sourceCaptionTables).length,
    duplicateOccurrenceCount: duplicateLegacyIdOccurrences(sourceCaptionTables),
    modelCount: input.models.length,
    imageCount: input.images.length,
    videoCount: input.videos.length,
    fileIdMapRowCount: input.fileIdMapRows.length,
    viewRowCount: countRows(viewTable, (row) => !isEmptyRow(row)),
    materialRowCount: materialRows.length,
  };
  if (issues.some((entry) => entry.severity === 'blocking')) {
    return blockedPreflightPlan({
      snapshot: input,
      sourceBefore,
      selectedWorkbook,
      captionTables: sourceCaptionTables,
      projectId,
      projectFrameId,
      projectTitle: resolvedProjectTitle,
      issues,
    });
  }
  return {
    sourceBefore,
    selectedWorkbook,
    inventory,
    draft,
    representationSources,
    mediaSources,
    mappings,
    issues,
    blockingIssueCount: issues.filter((entry) => entry.severity === 'blocking').length,
  };
}

export async function assertLociMyuSourceUnchanged(
  plan: Pick<LociMyuNativeConversionPlan, 'sourceBefore'>,
  sourceFile: File,
): Promise<LociMyuSourceFingerprint> {
  const after = await fingerprintFile(sourceFile);
  if (!sameFingerprint(plan.sourceBefore, after)) {
    throw new Error('LociMyu conversion: the selected outer ZIP changed; native Project publication was stopped');
  }
  return after;
}

/** The only direct-adapter publication entry: blocked plans can never reach storage. */
export async function createLociMyuNativeProject(
  fs: ProjectWorkspaceFS,
  plan: LociMyuNativeConversionPlan,
  sourceFile: File,
  onStatus?: (message: string) => void,
): Promise<NativeProjectSnapshotV1> {
  if (plan.blockingIssueCount > 0) {
    throw new Error('LociMyu conversion: blocked preflight cannot publish a native Project');
  }
  await assertLociMyuSourceUnchanged(plan, sourceFile);
  return createNativeProjectV1(
    fs,
    plan.draft,
    plan.representationSources,
    onStatus,
    plan.mediaSources,
    async () => { await assertLociMyuSourceUnchanged(plan, sourceFile); },
  );
}

function convertedCounts(snapshot: NativeProjectSnapshotV1 | NativeProjectDraftV1): Readonly<Record<string, number>> {
  return {
    assets: snapshot.assets.length,
    representations: snapshot.representations.length,
    displaySets: snapshot.displaySets?.length ?? 0,
    captions: snapshot.captions.length,
    savedViews: snapshot.savedViews?.length ?? 0,
    materialAppearances: snapshot.meshMaterialAppearances?.length ?? 0,
    mediaResources: snapshot.mediaResources?.length ?? 0,
  };
}

function reportBase(plan: LociMyuNativeConversionPlan): LociMyuNativeConversionReport {
  return {
    format: 'lociview-locimyu-to-native-report',
    version: 1,
    completedAt: null,
    source: {
      before: plan.sourceBefore,
      after: null,
      unchanged: null,
      selectedWorkbook: plan.selectedWorkbook,
      originalZipEmbedded: false,
      retention: 'user-retains-original-zip-and-report-separately',
    },
    target: {
      projectId: plan.draft.project.id,
      title: plan.draft.project.title,
      snapshotId: null,
      generation: null,
    },
    inventory: plan.inventory,
    convertedCounts: convertedCounts(plan.draft),
    mappings: plan.mappings,
    issues: plan.issues,
  };
}

export function completeLociMyuNativeConversionReport(
  plan: LociMyuNativeConversionPlan,
  snapshot: NativeProjectSnapshotV1,
  sourceAfter: LociMyuSourceFingerprint,
): LociMyuNativeConversionReport {
  if (!sameFingerprint(plan.sourceBefore, sourceAfter)) {
    throw new Error('LociMyu conversion: source fingerprint changed before report completion');
  }
  return {
    ...reportBase(plan),
    completedAt: new Date().toISOString(),
    source: { ...reportBase(plan).source, after: sourceAfter, unchanged: true },
    target: {
      projectId: snapshot.project.id,
      title: snapshot.project.title,
      snapshotId: snapshot.snapshotId,
      generation: snapshot.generation,
    },
    convertedCounts: convertedCounts(snapshot),
  };
}

export function completeBlockedLociMyuNativeConversionReport(
  plan: LociMyuNativeConversionPlan,
  sourceAfter: LociMyuSourceFingerprint,
): LociMyuNativeConversionReport {
  if (plan.blockingIssueCount < 1) {
    throw new Error('LociMyu conversion: blocked report requires at least one blocking issue');
  }
  if (!sameFingerprint(plan.sourceBefore, sourceAfter)) {
    throw new Error('LociMyu conversion: source fingerprint changed before blocked report completion');
  }
  const base = reportBase(plan);
  return {
    ...base,
    completedAt: new Date().toISOString(),
    source: { ...base.source, after: sourceAfter, unchanged: true },
  };
}

export function serializeLociMyuNativeConversionPreflight(plan: LociMyuNativeConversionPlan): string {
  return `${JSON.stringify(reportBase(plan), null, 2)}\n`;
}

export function serializeLociMyuNativeConversionReport(report: LociMyuNativeConversionReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
