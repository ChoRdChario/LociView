import {
  BlobReader,
  TextReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
  configure,
  type Entry,
  type FileEntry,
  type ReadableReader,
} from '@zip.js/zip.js';
import { DEFAULT_ZIP_LIMITS, sanitizeZipPath } from '../assets/zipio';
import { parseJsonWithoutDuplicateMembers } from '../core/json';
import type { ProjectWorkspaceFS, WorkspaceFS } from '../platform/fs';
import {
  createNativeCollaborationBaselineV1,
  mergeNativeCaptionStateV1,
  validateNativeCollaborationBaselineV1,
  type NativeCollaborationConflictV1,
} from './captionThreeWayMerge';
import {
  buildNativeCleanCopySnapshotPlanV1,
  buildNativeCollaborationSnapshotPlanV1,
  buildNativeReviewSnapshotPlanV1,
  type NativeExchangeSnapshotPlanV1,
} from './packageSnapshots';
import {
  NATIVE_SCHEMA_VERSION,
  parseNativeSnapshotV1,
  serializeNativeSnapshotV1,
  type NativeProjectSnapshotV1,
} from './schema';
import {
  nativeMediaPath,
  nativeProjectRoot,
  nativeRepresentationPath,
  openNativeProjectV1,
  publishNativeCaptionMergeV1,
  restoreNativeProjectV1,
  saveNativeProjectV1,
  type NativeBinarySource,
} from './storage';
import { digestNativeBytes, digestNativeStream, hashingNativeStream, type NativeStreamDigest } from './sha256';

configure({ useWebWorkers: false });

export const NATIVE_EXCHANGE_PACKAGE_FORMAT = 'lociview-native-package-exchange' as const;
export const NATIVE_EXCHANGE_PACKAGE_VERSION = 1 as const;
export const NATIVE_EXCHANGE_MANIFEST_ENTRY = 'native/package.json' as const;
export const NATIVE_EXCHANGE_SNAPSHOT_ENTRY = 'native/snapshot.json' as const;

export type NativeExchangePurposeV1 = 'collaboration' | 'review' | 'cleanCopy';

export function nativeExchangeDefaultOpenModeV1(purpose: NativeExchangePurposeV1): 'view' | 'edit' {
  return purpose === 'review' ? 'view' : 'edit';
}

export interface NativeExchangeBinaryManifestV1 {
  readonly id: string;
  readonly entry: string;
  readonly byteLength: number;
  readonly algorithm: 'sha256';
  readonly digest: string;
  readonly mediaType: string;
}

export interface NativeExchangeManifestV1 {
  readonly format: typeof NATIVE_EXCHANGE_PACKAGE_FORMAT;
  readonly packageVersion: typeof NATIVE_EXCHANGE_PACKAGE_VERSION;
  readonly purpose: NativeExchangePurposeV1;
  readonly nativeSnapshot: {
    readonly schemaVersion: typeof NATIVE_SCHEMA_VERSION;
    readonly projectId: string;
    readonly snapshotId: string;
    readonly generation: number;
    readonly entry: typeof NATIVE_EXCHANGE_SNAPSHOT_ENTRY;
    readonly byteLength: number;
    readonly algorithm: 'sha256';
    readonly digest: string;
  };
  readonly lineage?: {
    readonly projectId: string;
    readonly baselineId: string;
  };
  readonly representations: readonly NativeExchangeBinaryManifestV1[];
  readonly media: readonly NativeExchangeBinaryManifestV1[];
}

export interface NativeExchangeInspectionV1 {
  readonly manifest: NativeExchangeManifestV1;
  readonly snapshot: NativeProjectSnapshotV1;
  readonly packageByteLength: number;
  readonly representationByteLength: number;
  readonly mediaByteLength: number;
}

export type NativePackageContainerKindV1 = 'backup' | 'exchange';

export interface NativeExchangeMetricsV1 {
  readonly representationByteLength: number;
  readonly mediaByteLength: number;
  readonly packageByteLength: number;
  readonly packageSha256: string;
  readonly maxApplicationChunkBytes: number;
}

export interface NativeExchangeExportResultV1 {
  readonly snapshot: NativeProjectSnapshotV1;
  readonly manifest: NativeExchangeManifestV1;
  readonly metrics: NativeExchangeMetricsV1;
}

export type NativeCollaborationImportResultV1 =
  | { readonly kind: 'merged'; readonly snapshot: NativeProjectSnapshotV1 }
  | { readonly kind: 'noop'; readonly snapshot: NativeProjectSnapshotV1 }
  | { readonly kind: 'conflict'; readonly conflicts: readonly NativeCollaborationConflictV1[] };

const METADATA_ENTRY_LIMIT_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_READER_CHUNK_BYTES = 64 * 1024 * 1024;
const ZIP_EPOCH = new Date('1980-01-01T00:00:00.000Z');
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

class BoundedBlobReader extends BlobReader {
  override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (length > MAX_ZIP_READER_CHUNK_BYTES) {
      throw new Error(`native exchange package: ZIP metadata read exceeds ${MAX_ZIP_READER_CHUNK_BYTES} bytes`);
    }
    return super.readUint8Array(index, length);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`native exchange package: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`native exchange package: unknown field ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) throw new Error(`native exchange package: missing field ${key}`);
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`native exchange package: invalid ${label}`);
  return value;
}

function nativeId(value: unknown, prefix: 'prj' | 'snp' | 'rep' | 'med', label: string): string {
  const result = nonEmptyString(value, label);
  if (!new RegExp(`^${prefix}_[0-9A-HJKMNPQRSTVWXYZ]{26}$`).test(result)) {
    throw new Error(`native exchange package: invalid ${label}`);
  }
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = nonEmptyString(value, label);
  if (!/^[0-9a-f]{64}$/.test(result)) throw new Error(`native exchange package: invalid ${label}`);
  return result;
}

function safeNonNegative(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`native exchange package: invalid ${label}`);
  }
  return value as number;
}

function positiveGeneration(value: unknown): number {
  const result = safeNonNegative(value, 'snapshot generation');
  if (result < 1) throw new Error('native exchange package: snapshot generation must be positive');
  return result;
}

function representationEntry(id: string): string {
  return `native/representations/${id}.bin`;
}

function mediaEntry(id: string): string {
  return `native/media/${id}.bin`;
}

function parseBinaryManifest(
  value: unknown,
  kind: 'representation' | 'media',
): NativeExchangeBinaryManifestV1 {
  const item = record(value, kind);
  exactKeys(item, ['id', 'entry', 'byteLength', 'algorithm', 'digest', 'mediaType']);
  const id = nativeId(item.id, kind === 'representation' ? 'rep' : 'med', `${kind} id`);
  const expectedEntry = kind === 'representation' ? representationEntry(id) : mediaEntry(id);
  if (item.entry !== expectedEntry || item.algorithm !== 'sha256') {
    throw new Error(`native exchange package: invalid ${kind} integrity entry`);
  }
  return {
    id,
    entry: expectedEntry,
    byteLength: safeNonNegative(item.byteLength, `${kind} byteLength`),
    algorithm: 'sha256',
    digest: sha256(item.digest, `${kind} digest`),
    mediaType: nonEmptyString(item.mediaType, `${kind} mediaType`),
  };
}

function parseManifest(text: string): NativeExchangeManifestV1 {
  const input = record(parseJsonWithoutDuplicateMembers(text), 'manifest');
  if (input.format !== NATIVE_EXCHANGE_PACKAGE_FORMAT || input.packageVersion !== NATIVE_EXCHANGE_PACKAGE_VERSION) {
    throw new Error('native exchange package: unsupported format or version');
  }
  if (input.purpose !== 'collaboration' && input.purpose !== 'review' && input.purpose !== 'cleanCopy') {
    throw new Error('native exchange package: unsupported purpose');
  }
  exactKeys(
    input,
    ['format', 'packageVersion', 'purpose', 'nativeSnapshot', 'representations', 'media'],
    input.purpose === 'collaboration' ? ['lineage'] : [],
  );
  if (input.purpose === 'collaboration' && input.lineage === undefined) {
    throw new Error('native exchange package: collaboration lineage is missing');
  }
  if (input.purpose !== 'collaboration' && input.lineage !== undefined) {
    throw new Error('native exchange package: review/copy must omit collaboration lineage');
  }
  const nativeSnapshot = record(input.nativeSnapshot, 'nativeSnapshot');
  exactKeys(nativeSnapshot, [
    'schemaVersion', 'projectId', 'snapshotId', 'generation', 'entry', 'byteLength', 'algorithm', 'digest',
  ]);
  if (
    nativeSnapshot.schemaVersion !== NATIVE_SCHEMA_VERSION || nativeSnapshot.entry !== NATIVE_EXCHANGE_SNAPSHOT_ENTRY ||
    nativeSnapshot.algorithm !== 'sha256'
  ) {
    throw new Error('native exchange package: invalid native snapshot integrity record');
  }
  if (!Array.isArray(input.representations) || !Array.isArray(input.media)) {
    throw new Error('native exchange package: binary manifests must be arrays');
  }
  const representations = input.representations.map((entry) => parseBinaryManifest(entry, 'representation'));
  const media = input.media.map((entry) => parseBinaryManifest(entry, 'media'));
  for (const [label, entries] of [['Representation', representations], ['media', media]] as const) {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
      throw new Error(`native exchange package: duplicate ${label} ID`);
    }
    if (entries.some((entry, index) => index > 0 && entries[index - 1]!.id.localeCompare(entry.id) >= 0)) {
      throw new Error(`native exchange package: ${label} manifest must be sorted`);
    }
  }
  let lineage: NativeExchangeManifestV1['lineage'];
  if (input.purpose === 'collaboration') {
    const source = record(input.lineage, 'lineage');
    exactKeys(source, ['projectId', 'baselineId']);
    lineage = {
      projectId: nativeId(source.projectId, 'prj', 'lineage Project id'),
      baselineId: sha256(source.baselineId, 'baseline id'),
    };
  }
  return {
    format: NATIVE_EXCHANGE_PACKAGE_FORMAT,
    packageVersion: NATIVE_EXCHANGE_PACKAGE_VERSION,
    purpose: input.purpose,
    nativeSnapshot: {
      schemaVersion: NATIVE_SCHEMA_VERSION,
      projectId: nativeId(nativeSnapshot.projectId, 'prj', 'snapshot Project id'),
      snapshotId: nativeId(nativeSnapshot.snapshotId, 'snp', 'snapshot id'),
      generation: positiveGeneration(nativeSnapshot.generation),
      entry: NATIVE_EXCHANGE_SNAPSHOT_ENTRY,
      byteLength: safeNonNegative(nativeSnapshot.byteLength, 'snapshot byteLength'),
      algorithm: 'sha256',
      digest: sha256(nativeSnapshot.digest, 'snapshot digest'),
    },
    ...(lineage === undefined ? {} : { lineage }),
    representations,
    media,
  };
}

function serializeManifest(manifest: NativeExchangeManifestV1): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function unixEntryType(entry: Entry): number | null {
  if (((entry.versionMadeBy >>> 8) & 0xff) !== 3) return null;
  return ((entry.externalFileAttributes >>> 16) & 0xffff) & 0o170000;
}

function inspectEntryNamespace(entries: readonly Entry[]): Map<string, FileEntry> {
  if (entries.length > DEFAULT_ZIP_LIMITS.maxEntries) throw new Error('native exchange package: too many entries');
  const files = new Map<string, FileEntry>();
  const normalized = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    if (entry.bitFlag?.languageEncodingFlag === true) fatalUtf8Decoder.decode(entry.rawFilename);
    const path = sanitizeZipPath(entry.directory && entry.filename.endsWith('/')
      ? entry.filename.slice(0, -1)
      : entry.filename);
    if (path === null || path !== entry.filename || path.normalize('NFC') !== path) {
      throw new Error(`native exchange package: unsafe entry path ${entry.filename}`);
    }
    const key = path.normalize('NFC').toLowerCase();
    if (normalized.has(key)) throw new Error(`native exchange package: duplicate or ambiguous entry ${path}`);
    normalized.add(key);
    if (entry.directory) throw new Error(`native exchange package: unexpected directory ${path}`);
    const type = unixEntryType(entry);
    if (type !== null && type !== 0 && type !== 0o100000) {
      throw new Error(`native exchange package: unsupported special entry ${path}`);
    }
    if (entry.encrypted) throw new Error(`native exchange package: encrypted entry ${path}`);
    if (entry.compressionMethod !== 0 || entry.compressedSize !== entry.uncompressedSize) {
      throw new Error(`native exchange package: entry must use STORE: ${path}`);
    }
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 ||
        entry.uncompressedSize > DEFAULT_ZIP_LIMITS.maxEntryBytes) {
      throw new Error(`native exchange package: invalid entry size ${path}`);
    }
    total += entry.uncompressedSize;
    if (!Number.isSafeInteger(total) || total > DEFAULT_ZIP_LIMITS.maxTotalBytes) {
      throw new Error('native exchange package: declared total exceeds the package limit');
    }
    files.set(path, entry as FileEntry);
  }
  return files;
}

async function readMetadataEntry(entry: FileEntry, signal?: AbortSignal): Promise<Uint8Array> {
  if (entry.uncompressedSize > METADATA_ENTRY_LIMIT_BYTES) {
    throw new Error('native exchange package: metadata exceeds the supported boundary');
  }
  const bytes = await entry.getData(new Uint8ArrayWriter(), {
    signal, checkSignature: true, checkAmbiguity: true, checkOverlappingEntry: true, strictness: 'strict',
  });
  if (bytes.byteLength !== entry.uncompressedSize) throw new Error('native exchange package: metadata size mismatch');
  return bytes;
}

function crossCheck(
  manifest: NativeExchangeManifestV1,
  snapshot: NativeProjectSnapshotV1,
  files: ReadonlyMap<string, FileEntry>,
): { readonly representationByteLength: number; readonly mediaByteLength: number } {
  if (
    snapshot.project.id !== manifest.nativeSnapshot.projectId || snapshot.snapshotId !== manifest.nativeSnapshot.snapshotId ||
    snapshot.generation !== manifest.nativeSnapshot.generation
  ) {
    throw new Error('native exchange package: manifest and snapshot identity disagree');
  }
  if (manifest.purpose === 'collaboration') {
    validateNativeCollaborationBaselineV1(snapshot);
    const lineage = manifest.lineage;
    if (
      lineage === undefined || lineage.projectId !== snapshot.project.id ||
      lineage.baselineId !== snapshot.collaborationBaseline!.baselineId
    ) {
      throw new Error('native exchange package: collaboration lineage/baseline disagree');
    }
  } else if (snapshot.collaborationBaseline !== undefined) {
    throw new Error('native exchange package: review/copy snapshot contains collaboration metadata');
  }
  const snapshotRepresentations = new Map(snapshot.representations.map((entry) => [entry.id, entry]));
  const snapshotMedia = new Map((snapshot.mediaResources ?? []).map((entry) => [entry.id, entry]));
  if (snapshotRepresentations.size !== manifest.representations.length || snapshotMedia.size !== manifest.media.length) {
    throw new Error('native exchange package: manifest and snapshot binary sets disagree');
  }
  let representationByteLength = 0;
  for (const item of manifest.representations) {
    const representation = snapshotRepresentations.get(item.id);
    const entry = files.get(item.entry);
    if (
      representation === undefined || entry === undefined || entry.uncompressedSize !== item.byteLength ||
      representation.blob.byteLength !== item.byteLength || representation.blob.digest !== item.digest ||
      representation.blob.mediaType !== item.mediaType
    ) throw new Error(`native exchange package: Representation integrity mismatch for ${item.id}`);
    representationByteLength += item.byteLength;
  }
  let mediaByteLength = 0;
  for (const item of manifest.media) {
    const media = snapshotMedia.get(item.id);
    const entry = files.get(item.entry);
    if (
      media === undefined || entry === undefined || entry.uncompressedSize !== item.byteLength ||
      media.blob.byteLength !== item.byteLength || media.blob.digest !== item.digest ||
      media.blob.mediaType !== item.mediaType
    ) throw new Error(`native exchange package: media integrity mismatch for ${item.id}`);
    mediaByteLength += item.byteLength;
  }
  const expected = new Set([
    NATIVE_EXCHANGE_MANIFEST_ENTRY,
    NATIVE_EXCHANGE_SNAPSHOT_ENTRY,
    ...manifest.representations.map((entry) => entry.entry),
    ...manifest.media.map((entry) => entry.entry),
  ]);
  if (files.size !== expected.size || [...files.keys()].some((path) => !expected.has(path))) {
    throw new Error('native exchange package: extra or undeclared entry');
  }
  return { representationByteLength, mediaByteLength };
}

interface OpenExchangePackage {
  readonly reader: ZipReader<Blob>;
  readonly files: ReadonlyMap<string, FileEntry>;
  readonly inspection: NativeExchangeInspectionV1;
  readonly snapshotText: string;
}

async function openExchangePackage(blob: Blob, signal?: AbortSignal): Promise<OpenExchangePackage> {
  if (!Number.isSafeInteger(blob.size) || blob.size < 1) throw new Error('native exchange package: file is empty or too large');
  const reader = new ZipReader(new BoundedBlobReader(blob), { strictness: 'strict' });
  try {
    const files = inspectEntryNamespace(await reader.getEntries({ strictness: 'strict', checkAmbiguity: true }));
    const manifestEntry = files.get(NATIVE_EXCHANGE_MANIFEST_ENTRY);
    if (manifestEntry === undefined) throw new Error('native exchange package: manifest is missing');
    const manifest = parseManifest(fatalUtf8Decoder.decode(await readMetadataEntry(manifestEntry, signal)));
    const snapshotEntry = files.get(NATIVE_EXCHANGE_SNAPSHOT_ENTRY);
    if (snapshotEntry === undefined || snapshotEntry.uncompressedSize !== manifest.nativeSnapshot.byteLength) {
      throw new Error('native exchange package: snapshot is missing or wrong-sized');
    }
    const snapshotBytes = await readMetadataEntry(snapshotEntry, signal);
    const snapshotDigest = digestNativeBytes(snapshotBytes);
    if (
      snapshotDigest.byteLength !== manifest.nativeSnapshot.byteLength ||
      snapshotDigest.sha256 !== manifest.nativeSnapshot.digest
    ) throw new Error('native exchange package: snapshot size/SHA-256 mismatch');
    const snapshotText = fatalUtf8Decoder.decode(snapshotBytes);
    const snapshot = parseNativeSnapshotV1(snapshotText);
    const lengths = crossCheck(manifest, snapshot, files);
    return {
      reader,
      files,
      snapshotText,
      inspection: { manifest, snapshot, packageByteLength: blob.size, ...lengths },
    };
  } catch (error) {
    await reader.close().catch(() => {});
    throw error;
  }
}

/**
 * Reads only the bounded manifest entry so the product UI can route an
 * untrusted .lociview file to the strict backup or exchange parser. The
 * filename and extension are never used as package authority.
 */
export async function detectNativePackageContainerKindV1(
  blob: Blob,
  signal?: AbortSignal,
): Promise<NativePackageContainerKindV1> {
  if (!Number.isSafeInteger(blob.size) || blob.size < 1) {
    throw new Error('native package: file is empty or too large');
  }
  const reader = new ZipReader(new BoundedBlobReader(blob), { strictness: 'strict' });
  try {
    const files = inspectEntryNamespace(await reader.getEntries({ strictness: 'strict', checkAmbiguity: true }));
    const manifestEntry = files.get(NATIVE_EXCHANGE_MANIFEST_ENTRY);
    if (manifestEntry === undefined) throw new Error('native package: manifest is missing');
    const manifest = record(
      parseJsonWithoutDuplicateMembers(fatalUtf8Decoder.decode(await readMetadataEntry(manifestEntry, signal))),
      'manifest',
    );
    if (manifest.format === 'lociview-native-portable-backup') return 'backup';
    if (manifest.format === NATIVE_EXCHANGE_PACKAGE_FORMAT) return 'exchange';
    throw new Error('native package: unsupported package format');
  } finally {
    await reader.close().catch(() => {});
  }
}

export async function inspectNativeExchangePackageV1(blob: Blob, signal?: AbortSignal): Promise<NativeExchangeInspectionV1> {
  const opened = await openExchangePackage(blob, signal);
  try {
    return opened.inspection;
  } finally {
    await opened.reader.close().catch(() => {});
  }
}

function buildManifest(snapshot: NativeProjectSnapshotV1, purpose: NativeExchangePurposeV1, snapshotText: string): NativeExchangeManifestV1 {
  const digest = digestNativeBytes(new TextEncoder().encode(snapshotText));
  return {
    format: NATIVE_EXCHANGE_PACKAGE_FORMAT,
    packageVersion: NATIVE_EXCHANGE_PACKAGE_VERSION,
    purpose,
    nativeSnapshot: {
      schemaVersion: NATIVE_SCHEMA_VERSION,
      projectId: snapshot.project.id,
      snapshotId: snapshot.snapshotId,
      generation: snapshot.generation,
      entry: NATIVE_EXCHANGE_SNAPSHOT_ENTRY,
      byteLength: digest.byteLength,
      algorithm: 'sha256',
      digest: digest.sha256,
    },
    ...(purpose === 'collaboration' ? {
      lineage: {
        projectId: snapshot.project.id,
        baselineId: snapshot.collaborationBaseline!.baselineId,
      },
    } : {}),
    representations: [...snapshot.representations].sort((a, b) => a.id.localeCompare(b.id)).map((entry) => ({
      id: entry.id,
      entry: representationEntry(entry.id),
      byteLength: entry.blob.byteLength,
      algorithm: 'sha256',
      digest: entry.blob.digest,
      mediaType: entry.blob.mediaType,
    })),
    media: [...(snapshot.mediaResources ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map((entry) => ({
      id: entry.id,
      entry: mediaEntry(entry.id),
      byteLength: entry.blob.byteLength,
      algorithm: 'sha256',
      digest: entry.blob.digest,
      mediaType: entry.blob.mediaType,
    })),
  };
}

function storedOptions(signal?: AbortSignal) {
  return {
    level: 0, bufferedWrite: false, dataDescriptor: true, zip64: false,
    extendedTimestamp: false, lastModDate: ZIP_EPOCH, signal,
  } as const;
}

function assertExportBoundary(manifest: NativeExchangeManifestV1, snapshotText: string): string {
  const text = serializeManifest(manifest);
  const manifestBytes = new TextEncoder().encode(text).byteLength;
  const snapshotBytes = new TextEncoder().encode(snapshotText).byteLength;
  if (manifestBytes > METADATA_ENTRY_LIMIT_BYTES || snapshotBytes > METADATA_ENTRY_LIMIT_BYTES) {
    throw new Error('native exchange export: metadata boundary exceeded');
  }
  const metadataBytes = manifestBytes + snapshotBytes;
  if (manifest.representations.length + manifest.media.length + 2 > DEFAULT_ZIP_LIMITS.maxEntries) {
    throw new Error('native exchange export: entry count exceeds package boundary');
  }
  let total = metadataBytes;
  for (const entry of [...manifest.representations, ...manifest.media]) {
    if (entry.byteLength > DEFAULT_ZIP_LIMITS.maxEntryBytes) throw new Error(`native exchange export: entry too large ${entry.id}`);
    total += entry.byteLength;
    if (!Number.isSafeInteger(total) || total > DEFAULT_ZIP_LIMITS.maxTotalBytes) {
      throw new Error('native exchange export: total exceeds package boundary');
    }
  }
  return text;
}

class StreamObservation {
  maxChunkBytes = 0;
  stream(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    return input.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        const stable = new Uint8Array(chunk);
        this.maxChunkBytes = Math.max(this.maxChunkBytes, stable.byteLength);
        controller.enqueue(stable);
      },
    }));
  }
}

async function prepareExportPlan(
  fs: ProjectWorkspaceFS,
  projectId: string,
  purpose: NativeExchangePurposeV1,
  onStatus?: (message: string) => void,
): Promise<{ readonly sourceProjectId: string; readonly plan: NativeExchangeSnapshotPlanV1 }> {
  if (fs.projectRoot !== null && fs.projectRoot !== nativeProjectRoot(projectId)) {
    throw new Error('native exchange export: writer is scoped to another Project');
  }
  fs.mutationAuthority.assertEditable();
  let snapshot = (await openNativeProjectV1(fs, projectId)).snapshot;
  if (purpose === 'collaboration') {
    if (snapshot.collaborationBaseline === undefined) {
      onStatus?.('Freezing the first Caption collaboration baseline…');
      snapshot = await saveNativeProjectV1(fs, {
        ...snapshot,
        collaborationBaseline: createNativeCollaborationBaselineV1(snapshot),
      });
    }
    validateNativeCollaborationBaselineV1(snapshot);
  }
  const plan = purpose === 'collaboration'
    ? buildNativeCollaborationSnapshotPlanV1(snapshot)
    : purpose === 'review'
      ? buildNativeReviewSnapshotPlanV1(snapshot)
      : buildNativeCleanCopySnapshotPlanV1(snapshot);
  return { sourceProjectId: projectId, plan };
}

export async function exportNativeExchangePackageV1(
  fs: ProjectWorkspaceFS,
  projectId: string,
  purpose: NativeExchangePurposeV1,
  destination: WritableStream<Uint8Array>,
  options: { readonly signal?: AbortSignal; readonly onStatus?: (message: string) => void } = {},
): Promise<NativeExchangeExportResultV1> {
  let prepared: { readonly sourceProjectId: string; readonly plan: NativeExchangeSnapshotPlanV1 };
  let manifest: NativeExchangeManifestV1;
  let snapshotText: string;
  let manifestText: string;
  try {
    prepared = await prepareExportPlan(fs, projectId, purpose, options.onStatus);
    snapshotText = serializeNativeSnapshotV1(prepared.plan.snapshot);
    manifest = buildManifest(prepared.plan.snapshot, purpose, snapshotText);
    manifestText = assertExportBoundary(manifest, snapshotText);
  } catch (error) {
    await destination.abort(error).catch(() => {});
    throw error;
  }
  const observation = new StreamObservation();
  const bridge = new TransformStream<Uint8Array, Uint8Array>();
  let packageDigest: NativeStreamDigest | null = null;
  const sink = hashingNativeStream(observation.stream(bridge.readable), (value) => { packageDigest = value; }).pipeTo(destination);
  const writer = new ZipWriter(bridge.writable, storedOptions(options.signal));
  try {
    await writer.add(NATIVE_EXCHANGE_MANIFEST_ENTRY, new TextReader(manifestText), storedOptions(options.signal));
    await writer.add(NATIVE_EXCHANGE_SNAPSHOT_ENTRY, new TextReader(snapshotText), storedOptions(options.signal));
    for (const item of manifest.representations) {
      fs.mutationAuthority.assertEditable();
      const sourceId = prepared.plan.representationSourceIds.get(item.id);
      const source = sourceId === undefined ? null : await fs.readStream(nativeRepresentationPath(projectId, sourceId));
      if (source === null || source.size !== item.byteLength) throw new Error(`native exchange export: source unavailable ${item.id}`);
      options.onStatus?.(`Streaming Representation ${item.id}…`);
      let resolveSourceDigest!: (value: NativeStreamDigest) => void;
      const sourceDigestPromise = new Promise<NativeStreamDigest>((resolve) => { resolveSourceDigest = resolve; });
      const stream = hashingNativeStream(observation.stream(source.stream()), resolveSourceDigest);
      await writer.add(item.entry, { readable: stream, size: item.byteLength } as ReadableReader & { size: number }, storedOptions(options.signal));
      const sourceDigest = await sourceDigestPromise;
      if (sourceDigest.byteLength !== item.byteLength || sourceDigest.sha256 !== item.digest) {
        throw new Error(`native exchange export: source size/SHA-256 mismatch ${item.id}`);
      }
    }
    for (const item of manifest.media) {
      fs.mutationAuthority.assertEditable();
      const sourceId = prepared.plan.mediaSourceIds.get(item.id);
      const source = sourceId === undefined ? null : await fs.readStream(nativeMediaPath(projectId, sourceId));
      if (source === null || source.size !== item.byteLength) throw new Error(`native exchange export: media unavailable ${item.id}`);
      options.onStatus?.(`Streaming Caption image ${item.id}…`);
      let resolveSourceDigest!: (value: NativeStreamDigest) => void;
      const sourceDigestPromise = new Promise<NativeStreamDigest>((resolve) => { resolveSourceDigest = resolve; });
      const stream = hashingNativeStream(observation.stream(source.stream()), resolveSourceDigest);
      await writer.add(item.entry, { readable: stream, size: item.byteLength } as ReadableReader & { size: number }, storedOptions(options.signal));
      const sourceDigest = await sourceDigestPromise;
      if (sourceDigest.byteLength !== item.byteLength || sourceDigest.sha256 !== item.digest) {
        throw new Error(`native exchange export: media size/SHA-256 mismatch ${item.id}`);
      }
    }
    fs.mutationAuthority.assertEditable();
    await writer.close(undefined, { zip64: false });
    await sink;
  } catch (error) {
    await bridge.writable.abort(error).catch(() => {});
    await sink.catch(() => {});
    throw error;
  }
  if (packageDigest === null) throw new Error('native exchange export: output ended without a digest');
  const completed = packageDigest as NativeStreamDigest;
  return {
    snapshot: prepared.plan.snapshot,
    manifest,
    metrics: {
      representationByteLength: manifest.representations.reduce((sum, entry) => sum + entry.byteLength, 0),
      mediaByteLength: manifest.media.reduce((sum, entry) => sum + entry.byteLength, 0),
      packageByteLength: completed.byteLength,
      packageSha256: completed.sha256,
      maxApplicationChunkBytes: observation.maxChunkBytes,
    },
  };
}

function entrySource(entry: FileEntry, mediaType: string, signal?: AbortSignal): NativeBinarySource {
  return {
    size: entry.uncompressedSize,
    mediaType,
    stream() {
      const bridge = new TransformStream<Uint8Array, Uint8Array>();
      void entry.getData(bridge.writable, {
        signal, checkSignature: true, checkAmbiguity: true, checkOverlappingEntry: true, strictness: 'strict',
      }).catch((error: unknown) => bridge.writable.abort(error).catch(() => {}));
      return bridge.readable;
    },
  };
}

async function verifyEntry(entry: FileEntry, expected: NativeExchangeBinaryManifestV1, signal?: AbortSignal): Promise<void> {
  const source = entrySource(entry, expected.mediaType, signal);
  const digest = await digestNativeStream(source.stream(), signal);
  if (digest.byteLength !== expected.byteLength || digest.sha256 !== expected.digest) {
    throw new Error(`native exchange package: binary size/SHA-256 mismatch ${expected.id}`);
  }
}

async function verifyAllBinaryEntries(opened: OpenExchangePackage, signal?: AbortSignal): Promise<void> {
  for (const expected of [...opened.inspection.manifest.representations, ...opened.inspection.manifest.media]) {
    const entry = opened.files.get(expected.entry);
    if (entry === undefined) throw new Error(`native exchange package: missing entry ${expected.entry}`);
    await verifyEntry(entry, expected, signal);
  }
}

async function verifyOverlappingLocalMedia(
  fs: ProjectWorkspaceFS,
  current: NativeProjectSnapshotV1,
  incoming: NativeProjectSnapshotV1,
  signal?: AbortSignal,
): Promise<readonly NativeCollaborationConflictV1[]> {
  const currentMedia = new Map((current.mediaResources ?? []).map((media) => [media.id, media]));
  const conflicts: NativeCollaborationConflictV1[] = [];
  for (const incomingMedia of incoming.mediaResources ?? []) {
    const localMedia = currentMedia.get(incomingMedia.id);
    if (localMedia === undefined) continue;
    const source = await fs.readStream(nativeMediaPath(current.project.id, localMedia.id));
    if (source === null) {
      conflicts.push({
        code: 'media-id-conflict', mediaId: localMedia.id,
        message: `Local media ${localMedia.id} is unavailable for byte verification`,
      });
      continue;
    }
    const digest = await digestNativeStream(source.stream(), signal);
    if (digest.byteLength !== localMedia.blob.byteLength || digest.sha256 !== localMedia.blob.digest) {
      conflicts.push({
        code: 'media-id-conflict', mediaId: localMedia.id,
        message: `Local media ${localMedia.id} bytes do not match its size/SHA-256 metadata`,
      });
    }
  }
  return conflicts;
}

export async function restoreNativeExchangePackageV1(
  fs: ProjectWorkspaceFS,
  namespaceFs: WorkspaceFS,
  blob: Blob,
  options: { readonly signal?: AbortSignal; readonly onStatus?: (message: string) => void } = {},
): Promise<{ readonly snapshot: NativeProjectSnapshotV1; readonly purpose: NativeExchangePurposeV1 }> {
  const opened = await openExchangePackage(blob, options.signal);
  try {
    const representations = new Map<string, NativeBinarySource>();
    const media = new Map<string, NativeBinarySource>();
    for (const item of opened.inspection.manifest.representations) {
      representations.set(item.id, entrySource(opened.files.get(item.entry)!, item.mediaType, options.signal));
    }
    for (const item of opened.inspection.manifest.media) {
      media.set(item.id, entrySource(opened.files.get(item.entry)!, item.mediaType, options.signal));
    }
    const snapshot = await restoreNativeProjectV1(
      fs,
      namespaceFs,
      opened.inspection.snapshot,
      representations,
      options.onStatus,
      options.signal,
      opened.snapshotText,
      media,
    );
    return { snapshot, purpose: opened.inspection.manifest.purpose };
  } finally {
    await opened.reader.close().catch(() => {});
  }
}

export async function mergeNativeCollaborationPackageV1(
  fs: ProjectWorkspaceFS,
  projectId: string,
  blob: Blob,
  options: { readonly signal?: AbortSignal; readonly onStatus?: (message: string) => void } = {},
): Promise<NativeCollaborationImportResultV1> {
  const opened = await openExchangePackage(blob, options.signal);
  try {
    if (opened.inspection.manifest.purpose !== 'collaboration') {
      throw new Error('native collaboration: selected package is not for collaboration');
    }
    if (opened.inspection.manifest.lineage?.projectId !== projectId) {
      return {
        kind: 'conflict',
        conflicts: [{ code: 'lineage-mismatch', message: 'The package belongs to a different Project lineage' }],
      };
    }
    const current = (await openNativeProjectV1(fs, projectId)).snapshot;
    const merge = mergeNativeCaptionStateV1(current, opened.inspection.snapshot);
    if (merge.kind === 'conflict') return merge;
    options.onStatus?.('Verifying every package binary before publication…');
    await verifyAllBinaryEntries(opened, options.signal);
    options.onStatus?.('Verifying overlapping local Caption images…');
    const localMediaConflicts = await verifyOverlappingLocalMedia(
      fs,
      current,
      opened.inspection.snapshot,
      options.signal,
    );
    if (localMediaConflicts.length > 0) return { kind: 'conflict', conflicts: localMediaConflicts };
    if (!merge.changed) return { kind: 'noop', snapshot: current };
    const currentMediaIds = new Set((current.mediaResources ?? []).map((media) => media.id));
    const sources = new Map<string, NativeBinarySource>();
    for (const media of merge.snapshot.mediaResources ?? []) {
      if (currentMediaIds.has(media.id)) continue;
      const item = opened.inspection.manifest.media.find((entry) => entry.id === media.id);
      if (item === undefined) throw new Error(`native collaboration: incoming media entry is missing ${media.id}`);
      sources.set(media.id, entrySource(opened.files.get(item.entry)!, item.mediaType, options.signal));
    }
    const snapshot = await publishNativeCaptionMergeV1(
      fs,
      current,
      merge.snapshot,
      sources,
      options.onStatus,
      options.signal,
    );
    return { kind: 'merged', snapshot };
  } finally {
    await opened.reader.close().catch(() => {});
  }
}
