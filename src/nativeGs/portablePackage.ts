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
  NATIVE_SCHEMA_VERSION,
  parseNativeSnapshotV1,
  type NativeProjectSnapshotV1,
} from './schema';
import {
  nativeSnapshotPath,
  nativeProjectRoot,
  nativeRepresentationPath,
  openNativeProjectV1,
  restoreNativeProjectV1,
  type NativeBinarySource,
} from './storage';
import {
  digestNativeBytes,
  hashingNativeStream,
  type NativeStreamDigest,
} from './sha256';

configure({ useWebWorkers: false });

export const NATIVE_PORTABLE_PACKAGE_FORMAT = 'lociview-native-portable-backup' as const;
export const NATIVE_PORTABLE_PACKAGE_VERSION = 1 as const;
export const NATIVE_PORTABLE_MANIFEST_ENTRY = 'native/package.json' as const;
export const NATIVE_PORTABLE_SNAPSHOT_ENTRY = 'native/snapshot.json' as const;

const METADATA_ENTRY_LIMIT_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_READER_CHUNK_BYTES = 64 * 1024 * 1024;
const ZIP_EPOCH = new Date('1980-01-01T00:00:00.000Z');
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

export interface NativePortableRepresentationManifestV1 {
  readonly representationId: string;
  readonly entry: string;
  readonly byteLength: number;
  readonly algorithm: 'sha256';
  readonly digest: string;
  readonly mediaType: string;
}

export interface NativePortableManifestV1 {
  readonly format: typeof NATIVE_PORTABLE_PACKAGE_FORMAT;
  readonly packageVersion: typeof NATIVE_PORTABLE_PACKAGE_VERSION;
  readonly nativeSnapshot: {
    readonly schemaVersion: typeof NATIVE_SCHEMA_VERSION;
    readonly projectId: string;
    readonly snapshotId: string;
    readonly generation: number;
    readonly entry: typeof NATIVE_PORTABLE_SNAPSHOT_ENTRY;
    readonly byteLength: number;
    readonly algorithm: 'sha256';
    readonly digest: string;
  };
  readonly representations: readonly NativePortableRepresentationManifestV1[];
}

export interface NativePortableInspectionV1 {
  readonly manifest: NativePortableManifestV1;
  readonly snapshot: NativeProjectSnapshotV1;
  readonly packageByteLength: number;
  readonly representationByteLength: number;
}

export interface NativePortableStreamMetrics {
  readonly representationByteLength: number;
  readonly packageByteLength: number;
  readonly packageSha256: string;
  readonly maxApplicationChunkBytes: number;
  readonly jsHeapStartBytes: number | null;
  readonly jsHeapPeakBytes: number | null;
  readonly jsHeapEndBytes: number | null;
}

export interface NativePortableExportResult {
  readonly snapshot: NativeProjectSnapshotV1;
  readonly manifest: NativePortableManifestV1;
  readonly metrics: NativePortableStreamMetrics;
}

export interface NativePortableRestoreResult {
  readonly snapshot: NativeProjectSnapshotV1;
  readonly maxApplicationChunkBytes: number;
  readonly jsHeapStartBytes: number | null;
  readonly jsHeapPeakBytes: number | null;
  readonly jsHeapEndBytes: number | null;
}

interface OpenPortablePackage {
  readonly reader: ZipReader<Blob>;
  readonly files: ReadonlyMap<string, FileEntry>;
  readonly inspection: NativePortableInspectionV1;
  readonly snapshotText: string;
}

/** Prevent a forged central-directory length from becoming one giant read. */
class BoundedBlobReader extends BlobReader {
  override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (length > MAX_ZIP_READER_CHUNK_BYTES) {
      throw new Error(`native portable package: ZIP metadata read exceeds ${MAX_ZIP_READER_CHUNK_BYTES} bytes`);
    }
    return super.readUint8Array(index, length);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`native portable package: ${label} must be an object`);
  return value;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`native portable package: unknown ${label} field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) throw new Error(`native portable package: missing ${label} field ${key}`);
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`native portable package: ${label} must be a non-empty string`);
  }
  return value;
}

function safeNonNegative(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`native portable package: ${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function positiveGeneration(value: unknown): number {
  const generation = safeNonNegative(value, 'snapshot generation');
  if (generation < 1) throw new Error('native portable package: snapshot generation must be positive');
  return generation;
}

function digest(value: unknown, label: string): string {
  const result = nonEmptyString(value, label);
  if (!/^[0-9a-f]{64}$/.test(result)) throw new Error(`native portable package: invalid ${label}`);
  return result;
}

function nativeId(value: unknown, prefix: 'prj' | 'snp' | 'rep', label: string): string {
  const result = nonEmptyString(value, label);
  if (!new RegExp(`^${prefix}_[0-9A-HJKMNPQRSTVWXYZ]{26}$`).test(result)) {
    throw new Error(`native portable package: invalid ${label}`);
  }
  return result;
}

function representationEntry(representationId: string): string {
  return `native/representations/${representationId}.bin`;
}

function parsePortableManifestV1(text: string): NativePortableManifestV1 {
  const input = record(parseJsonWithoutDuplicateMembers(text), 'manifest');
  exactKeys(input, ['format', 'packageVersion', 'nativeSnapshot', 'representations'], 'manifest');
  if (input.format !== NATIVE_PORTABLE_PACKAGE_FORMAT || input.packageVersion !== NATIVE_PORTABLE_PACKAGE_VERSION) {
    throw new Error('native portable package: unsupported package format or version');
  }
  const nativeSnapshot = record(input.nativeSnapshot, 'nativeSnapshot');
  exactKeys(
    nativeSnapshot,
    ['schemaVersion', 'projectId', 'snapshotId', 'generation', 'entry', 'byteLength', 'algorithm', 'digest'],
    'nativeSnapshot',
  );
  if (nativeSnapshot.schemaVersion !== NATIVE_SCHEMA_VERSION) {
    throw new Error('native portable package: unsupported native snapshot version');
  }
  if (nativeSnapshot.entry !== NATIVE_PORTABLE_SNAPSHOT_ENTRY || nativeSnapshot.algorithm !== 'sha256') {
    throw new Error('native portable package: invalid native snapshot integrity record');
  }
  if (!Array.isArray(input.representations) || input.representations.length < 1) {
    throw new Error('native portable package: representations must be a non-empty array');
  }
  const seen = new Set<string>();
  const representations = input.representations.map((value) => {
    const item = record(value, 'Representation entry');
    exactKeys(item, ['representationId', 'entry', 'byteLength', 'algorithm', 'digest', 'mediaType'], 'Representation entry');
    const representationId = nativeId(item.representationId, 'rep', 'Representation id');
    if (seen.has(representationId)) throw new Error(`native portable package: duplicate Representation ${representationId}`);
    seen.add(representationId);
    if (item.entry !== representationEntry(representationId) || item.algorithm !== 'sha256') {
      throw new Error(`native portable package: invalid logical entry for ${representationId}`);
    }
    return {
      representationId,
      entry: item.entry,
      byteLength: safeNonNegative(item.byteLength, 'Representation byteLength'),
      algorithm: 'sha256' as const,
      digest: digest(item.digest, 'Representation digest'),
      mediaType: nonEmptyString(item.mediaType, 'Representation mediaType'),
    };
  });
  const sorted = [...representations].sort((a, b) => a.representationId.localeCompare(b.representationId));
  if (representations.some((value, index) => value.representationId !== sorted[index]!.representationId)) {
    throw new Error('native portable package: Representation manifest must be sorted');
  }
  return {
    format: NATIVE_PORTABLE_PACKAGE_FORMAT,
    packageVersion: NATIVE_PORTABLE_PACKAGE_VERSION,
    nativeSnapshot: {
      schemaVersion: NATIVE_SCHEMA_VERSION,
      projectId: nativeId(nativeSnapshot.projectId, 'prj', 'project id'),
      snapshotId: nativeId(nativeSnapshot.snapshotId, 'snp', 'snapshot id'),
      generation: positiveGeneration(nativeSnapshot.generation),
      entry: NATIVE_PORTABLE_SNAPSHOT_ENTRY,
      byteLength: safeNonNegative(nativeSnapshot.byteLength, 'snapshot byteLength'),
      algorithm: 'sha256',
      digest: digest(nativeSnapshot.digest, 'snapshot digest'),
    },
    representations,
  };
}

function serializePortableManifestV1(manifest: NativePortableManifestV1): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function unixEntryType(entry: Entry): number | null {
  if (((entry.versionMadeBy >>> 8) & 0xff) !== 3) return null;
  return ((entry.externalFileAttributes >>> 16) & 0xffff) & 0o170000;
}

function inspectEntryNamespace(entries: readonly Entry[]): Map<string, FileEntry> {
  if (entries.length > DEFAULT_ZIP_LIMITS.maxEntries) {
    throw new Error(`native portable package: too many entries (${entries.length})`);
  }
  const files = new Map<string, FileEntry>();
  const normalized = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    if (entry.bitFlag?.languageEncodingFlag === true) fatalUtf8Decoder.decode(entry.rawFilename);
    const path = sanitizeZipPath(entry.directory && entry.filename.endsWith('/')
      ? entry.filename.slice(0, -1)
      : entry.filename);
    if (path === null || path !== entry.filename || path.normalize('NFC') !== path) {
      throw new Error(`native portable package: unsafe entry path ${entry.filename}`);
    }
    const namespaceKey = path.normalize('NFC').replace(/[A-Z]/g, (character) => character.toLowerCase());
    if (normalized.has(namespaceKey)) throw new Error(`native portable package: duplicate or ambiguous entry ${path}`);
    normalized.add(namespaceKey);
    if (entry.directory) throw new Error(`native portable package: unexpected directory entry ${path}`);
    const type = unixEntryType(entry);
    if (type !== null && type !== 0 && type !== 0o100000) {
      throw new Error(`native portable package: unsupported special entry ${path}`);
    }
    if (entry.encrypted) throw new Error(`native portable package: encrypted entry is unsupported: ${path}`);
    if (entry.compressionMethod !== 0 || entry.compressedSize !== entry.uncompressedSize) {
      throw new Error(`native portable package: entry must use STORE without compression: ${path}`);
    }
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
      throw new Error(`native portable package: invalid declared size for ${path}`);
    }
    if (entry.uncompressedSize > DEFAULT_ZIP_LIMITS.maxEntryBytes) {
      throw new Error(`native portable package: entry too large: ${path}`);
    }
    total += entry.uncompressedSize;
    if (!Number.isSafeInteger(total) || total > DEFAULT_ZIP_LIMITS.maxTotalBytes) {
      throw new Error('native portable package: declared total size exceeds the existing package limit');
    }
    files.set(path, entry as FileEntry);
  }
  return files;
}

async function readMetadataEntry(entry: FileEntry, signal?: AbortSignal): Promise<Uint8Array> {
  if (entry.uncompressedSize > METADATA_ENTRY_LIMIT_BYTES) {
    throw new Error(`native portable package: metadata entry exceeds ${METADATA_ENTRY_LIMIT_BYTES} bytes`);
  }
  const bytes = await entry.getData(new Uint8ArrayWriter(), {
    signal,
    checkSignature: true,
    checkAmbiguity: true,
    checkOverlappingEntry: true,
    strictness: 'strict',
  });
  if (bytes.byteLength !== entry.uncompressedSize) {
    throw new Error(`native portable package: metadata size mismatch for ${entry.filename}`);
  }
  return bytes;
}

function crossCheckManifestAndSnapshot(
  manifest: NativePortableManifestV1,
  snapshot: NativeProjectSnapshotV1,
  files: ReadonlyMap<string, FileEntry>,
): number {
  if (
    snapshot.schemaVersion !== manifest.nativeSnapshot.schemaVersion ||
    snapshot.project.id !== manifest.nativeSnapshot.projectId ||
    snapshot.snapshotId !== manifest.nativeSnapshot.snapshotId ||
    snapshot.generation !== manifest.nativeSnapshot.generation
  ) {
    throw new Error('native portable package: manifest and snapshot identity disagree');
  }
  const snapshotRepresentations = new Map(snapshot.representations.map((representation) => [representation.id, representation]));
  if (snapshotRepresentations.size !== manifest.representations.length) {
    throw new Error('native portable package: manifest and snapshot Representation sets disagree');
  }
  let representationByteLength = 0;
  for (const item of manifest.representations) {
    const representation = snapshotRepresentations.get(item.representationId);
    if (
      representation === undefined || representation.blob.algorithm !== item.algorithm ||
      representation.blob.byteLength !== item.byteLength || representation.blob.digest !== item.digest ||
      representation.blob.mediaType !== item.mediaType
    ) {
      throw new Error(`native portable package: Representation integrity record disagrees for ${item.representationId}`);
    }
    const entry = files.get(item.entry);
    if (entry === undefined || entry.uncompressedSize !== item.byteLength) {
      throw new Error(`native portable package: missing or wrong-sized entry ${item.entry}`);
    }
    representationByteLength += item.byteLength;
    if (!Number.isSafeInteger(representationByteLength)) {
      throw new Error('native portable package: Representation total exceeds safe integer range');
    }
  }
  const expectedPaths = new Set([
    NATIVE_PORTABLE_MANIFEST_ENTRY,
    NATIVE_PORTABLE_SNAPSHOT_ENTRY,
    ...manifest.representations.map((item) => item.entry),
  ]);
  if (files.size !== expectedPaths.size || [...files.keys()].some((path) => !expectedPaths.has(path))) {
    throw new Error('native portable package: package contains an extra or undeclared entry');
  }
  return representationByteLength;
}

async function openPortablePackage(blob: Blob, signal?: AbortSignal): Promise<OpenPortablePackage> {
  if (!Number.isSafeInteger(blob.size) || blob.size < 1) throw new Error('native portable package: file is empty or too large');
  const reader = new ZipReader(new BoundedBlobReader(blob), { strictness: 'strict' });
  try {
    const files = inspectEntryNamespace(await reader.getEntries({ strictness: 'strict', checkAmbiguity: true }));
    const manifestEntry = files.get(NATIVE_PORTABLE_MANIFEST_ENTRY);
    if (manifestEntry === undefined) throw new Error('native portable package: manifest entry is missing');
    const manifestBytes = await readMetadataEntry(manifestEntry, signal);
    const manifest = parsePortableManifestV1(fatalUtf8Decoder.decode(manifestBytes));
    const snapshotEntry = files.get(NATIVE_PORTABLE_SNAPSHOT_ENTRY);
    if (snapshotEntry === undefined || snapshotEntry.uncompressedSize !== manifest.nativeSnapshot.byteLength) {
      throw new Error('native portable package: snapshot entry is missing or has the wrong size');
    }
    const snapshotBytes = await readMetadataEntry(snapshotEntry, signal);
    const snapshotDigest = digestNativeBytes(snapshotBytes);
    if (
      snapshotDigest.byteLength !== manifest.nativeSnapshot.byteLength ||
      snapshotDigest.sha256 !== manifest.nativeSnapshot.digest
    ) {
      throw new Error('native portable package: snapshot size/SHA-256 mismatch');
    }
    const snapshotText = fatalUtf8Decoder.decode(snapshotBytes);
    const snapshot = parseNativeSnapshotV1(snapshotText);
    const representationByteLength = crossCheckManifestAndSnapshot(manifest, snapshot, files);
    return {
      reader,
      files,
      inspection: { manifest, snapshot, packageByteLength: blob.size, representationByteLength },
      snapshotText,
    };
  } catch (error) {
    await reader.close().catch(() => {});
    throw error;
  }
}

export async function inspectNativePortablePackageV1(
  blob: Blob,
  signal?: AbortSignal,
): Promise<NativePortableInspectionV1> {
  const opened = await openPortablePackage(blob, signal);
  try {
    return opened.inspection;
  } finally {
    await opened.reader.close().catch(() => {});
  }
}

function currentHeapBytes(): number | null {
  if (typeof performance === 'undefined') return null;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === 'number' && Number.isFinite(memory.usedJSHeapSize)
    ? memory.usedJSHeapSize
    : null;
}

class StreamObservation {
  maxChunkBytes = 0;
  readonly heapStartBytes = currentHeapBytes();
  heapPeakBytes = this.heapStartBytes;

  observe(chunk: Uint8Array): void {
    this.maxChunkBytes = Math.max(this.maxChunkBytes, chunk.byteLength);
    const heap = currentHeapBytes();
    if (heap !== null) this.heapPeakBytes = Math.max(this.heapPeakBytes ?? heap, heap);
  }

  stream(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    return input.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        const stable = new Uint8Array(chunk);
        this.observe(stable);
        controller.enqueue(stable);
      },
    }));
  }
}

function buildManifest(snapshot: NativeProjectSnapshotV1, snapshotText: string): NativePortableManifestV1 {
  const snapshotDigest = digestNativeBytes(new TextEncoder().encode(snapshotText));
  return {
    format: NATIVE_PORTABLE_PACKAGE_FORMAT,
    packageVersion: NATIVE_PORTABLE_PACKAGE_VERSION,
    nativeSnapshot: {
      schemaVersion: NATIVE_SCHEMA_VERSION,
      projectId: snapshot.project.id,
      snapshotId: snapshot.snapshotId,
      generation: snapshot.generation,
      entry: NATIVE_PORTABLE_SNAPSHOT_ENTRY,
      byteLength: snapshotDigest.byteLength,
      algorithm: 'sha256',
      digest: snapshotDigest.sha256,
    },
    representations: [...snapshot.representations]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((representation) => ({
        representationId: representation.id,
        entry: representationEntry(representation.id),
        byteLength: representation.blob.byteLength,
        algorithm: 'sha256' as const,
        digest: representation.blob.digest,
        mediaType: representation.blob.mediaType,
      })),
  };
}

function assertExportFitsImportBoundary(
  manifest: NativePortableManifestV1,
  snapshotText: string,
): string {
  const manifestText = serializePortableManifestV1(manifest);
  const manifestBytes = new TextEncoder().encode(manifestText).byteLength;
  const snapshotBytes = new TextEncoder().encode(snapshotText).byteLength;
  if (manifest.representations.length + 2 > DEFAULT_ZIP_LIMITS.maxEntries) {
    throw new Error('native portable export: entry count exceeds the supported import boundary');
  }
  if (manifestBytes > METADATA_ENTRY_LIMIT_BYTES || snapshotBytes > METADATA_ENTRY_LIMIT_BYTES) {
    throw new Error('native portable export: metadata exceeds the supported import boundary');
  }
  let total = manifestBytes + snapshotBytes;
  for (const item of manifest.representations) {
    if (item.byteLength > DEFAULT_ZIP_LIMITS.maxEntryBytes) {
      throw new Error(`native portable export: ${item.representationId} exceeds the supported entry boundary`);
    }
    total += item.byteLength;
    if (!Number.isSafeInteger(total) || total > DEFAULT_ZIP_LIMITS.maxTotalBytes) {
      throw new Error('native portable export: project exceeds the supported package boundary');
    }
  }
  return manifestText;
}

function storedEntryOptions(signal?: AbortSignal) {
  return {
    level: 0,
    bufferedWrite: false,
    dataDescriptor: true,
    zip64: false,
    extendedTimestamp: false,
    lastModDate: ZIP_EPOCH,
    signal,
  } as const;
}

export async function exportNativePortablePackageV1(
  fs: ProjectWorkspaceFS,
  projectId: string,
  destination: WritableStream<Uint8Array>,
  options: {
    readonly signal?: AbortSignal;
    readonly onStatus?: (message: string) => void;
  } = {},
): Promise<NativePortableExportResult> {
  let snapshot: NativeProjectSnapshotV1;
  let manifest: NativePortableManifestV1;
  let snapshotText: string;
  let manifestText: string;
  try {
    if (fs.projectRoot !== null && fs.projectRoot !== nativeProjectRoot(projectId)) {
      throw new Error('native portable export: project lock is scoped to another project');
    }
    fs.mutationAuthority.assertEditable();
    const opened = await openNativeProjectV1(fs, projectId);
    if (opened.missingRepresentationIds.length > 0 || opened.sizeMismatchRepresentationIds.length > 0) {
      throw new Error('native portable export: active project has unavailable Representation bytes');
    }
    snapshot = opened.snapshot;
    snapshotText = await fs.readText(nativeSnapshotPath(projectId, snapshot.snapshotId)) ?? '';
    if (snapshotText === '') {
      throw new Error('native portable export: active snapshot bytes are unavailable');
    }
    const storedSnapshot = parseNativeSnapshotV1(snapshotText);
    if (
      storedSnapshot.project.id !== snapshot.project.id || storedSnapshot.snapshotId !== snapshot.snapshotId ||
      storedSnapshot.generation !== snapshot.generation
    ) {
      throw new Error('native portable export: active snapshot identity changed during capture');
    }
    manifest = buildManifest(snapshot, snapshotText);
    manifestText = assertExportFitsImportBoundary(manifest, snapshotText);
  } catch (error) {
    await destination.abort(error).catch(() => {});
    throw error;
  }
  const observation = new StreamObservation();
  const outputBridge = new TransformStream<Uint8Array, Uint8Array>();
  let packageDigest: NativeStreamDigest | null = null;
  const sinkPromise = hashingNativeStream(
    observation.stream(outputBridge.readable),
    (value) => { packageDigest = value; },
  ).pipeTo(destination);
  const writer = new ZipWriter(outputBridge.writable, storedEntryOptions(options.signal));
  try {
    options.onStatus?.('Writing portable package metadata…');
    await writer.add(
      NATIVE_PORTABLE_MANIFEST_ENTRY,
      new TextReader(manifestText),
      storedEntryOptions(options.signal),
    );
    await writer.add(
      NATIVE_PORTABLE_SNAPSHOT_ENTRY,
      new TextReader(snapshotText),
      storedEntryOptions(options.signal),
    );
    for (const item of manifest.representations) {
      fs.mutationAuthority.assertEditable();
      if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Operation aborted', 'AbortError');
      const source = await fs.readStream(nativeRepresentationPath(projectId, item.representationId));
      if (source === null || source.size !== item.byteLength) {
        throw new Error(`native portable export: source bytes are unavailable for ${item.representationId}`);
      }
      options.onStatus?.(`Streaming ${item.representationId} to portable backup…`);
      let sourceDigest: NativeStreamDigest | null = null;
      const stream = hashingNativeStream(observation.stream(source.stream()), (value) => { sourceDigest = value; });
      const knownSizeReader = { readable: stream, size: item.byteLength } as ReadableReader & { size: number };
      await writer.add(item.entry, knownSizeReader, storedEntryOptions(options.signal));
      const completedSourceDigest = sourceDigest as NativeStreamDigest | null;
      if (
        completedSourceDigest === null || completedSourceDigest.byteLength !== item.byteLength ||
        completedSourceDigest.sha256 !== item.digest
      ) {
        throw new Error(`native portable export: source size/SHA-256 mismatch for ${item.representationId}`);
      }
    }
    fs.mutationAuthority.assertEditable();
    options.onStatus?.('Finalizing portable backup central directory…');
    await writer.close(undefined, { zip64: false });
    await sinkPromise;
  } catch (error) {
    await outputBridge.writable.abort(error).catch(() => {});
    await sinkPromise.catch(() => {});
    throw error;
  }
  if (packageDigest === null) throw new Error('native portable export: output stream ended without a digest');
  const finalDigest = packageDigest as NativeStreamDigest;
  return {
    snapshot,
    manifest,
    metrics: {
      representationByteLength: manifest.representations.reduce((sum, item) => sum + item.byteLength, 0),
      packageByteLength: finalDigest.byteLength,
      packageSha256: finalDigest.sha256,
      maxApplicationChunkBytes: observation.maxChunkBytes,
      jsHeapStartBytes: observation.heapStartBytes,
      jsHeapPeakBytes: observation.heapPeakBytes,
      jsHeapEndBytes: currentHeapBytes(),
    },
  };
}

function streamedEntrySource(
  entry: FileEntry,
  mediaType: string,
  observation: StreamObservation,
  signal?: AbortSignal,
): NativeBinarySource {
  return {
    size: entry.uncompressedSize,
    mediaType,
    stream() {
      const bridge = new TransformStream<Uint8Array, Uint8Array>();
      void entry.getData(bridge.writable, {
        signal,
        checkSignature: true,
        checkAmbiguity: true,
        checkOverlappingEntry: true,
        strictness: 'strict',
      }).catch((error: unknown) => bridge.writable.abort(error).catch(() => {}));
      return observation.stream(bridge.readable);
    },
  };
}

export async function restoreNativePortablePackageV1(
  fs: ProjectWorkspaceFS,
  namespaceFs: WorkspaceFS,
  blob: Blob,
  options: {
    readonly signal?: AbortSignal;
    readonly onStatus?: (message: string) => void;
  } = {},
): Promise<NativePortableRestoreResult> {
  const observation = new StreamObservation();
  const opened = await openPortablePackage(blob, options.signal);
  try {
    const sources = new Map<string, NativeBinarySource>();
    for (const item of opened.inspection.manifest.representations) {
      const entry = opened.files.get(item.entry);
      if (entry === undefined) throw new Error(`native portable restore: missing entry ${item.entry}`);
      sources.set(item.representationId, streamedEntrySource(entry, item.mediaType, observation, options.signal));
    }
    const snapshot = await restoreNativeProjectV1(
      fs,
      namespaceFs,
      opened.inspection.snapshot,
      sources,
      options.onStatus,
      options.signal,
      opened.snapshotText,
    );
    return {
      snapshot,
      maxApplicationChunkBytes: observation.maxChunkBytes,
      jsHeapStartBytes: observation.heapStartBytes,
      jsHeapPeakBytes: observation.heapPeakBytes,
      jsHeapEndBytes: currentHeapBytes(),
    };
  } finally {
    await opened.reader.close().catch(() => {});
  }
}
