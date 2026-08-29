// ZIP低レベル入出力と健全性ガード (docs/02 §8)
// zip.js を使用。ガード: パストラバーサル / エントリ数 / 展開サイズ / ネストアーカイブ

import {
  BlobReader,
  configure,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js';

// Node(テスト)ではWeb Workerが無いため無効化。ブラウザでも動作は同一
configure({ useWebWorkers: false });

export interface ZipLimits {
  maxEntries: number;
  maxTotalBytes: number;
  maxEntryBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 20_000,
  maxTotalBytes: 2 * 1024 * 1024 * 1024, // 2GB (docs/06 §6)
  maxEntryBytes: 1024 * 1024 * 1024, // 1GB
};

export class ZipGuardError extends Error {
  constructor(
    readonly code:
      | 'too-many-entries'
      | 'total-too-large'
      | 'entry-too-large'
      | 'unsafe-path'
      | 'unsafe-entry-type'
      | 'ambiguous-path'
      | 'nested-archive',
    message: string,
  ) {
    super(message);
    this.name = 'ZipGuardError';
  }
}

/** ZIP内パスの検証・正規化。危険なら null */
export function sanitizeZipPath(raw: string): string | null {
  if (raw.includes('\\')) return null; // バックスラッシュ区切りは不正とみなす
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(raw)) return null;
  const path = raw.replace(/\/+/g, '/');
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return null; // 絶対パス
  const parts = path.split('/');
  for (const p of parts) {
    if (p === '' || p === '.' || p === '..') return null;
  }
  return parts.join('/');
}

const NESTED_ARCHIVE_RE = /\.(zip|lociview|7z|rar|tar|gz|tgz)$/i;
const SUPPORTED_NESTED_CONTAINER_RE = /\.xlsx$/i;
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });
const ZIP_HOST_SYSTEM_UNIX = 3;
const UNIX_ENTRY_TYPE_MASK = 0o170000;
const UNIX_ENTRY_TYPE_FIFO = 0o010000;
const UNIX_ENTRY_TYPE_SYMLINK = 0o120000;
const MAX_ZIP_IDENTITY_READ_BYTES = 64 * 1024 * 1024;
const V1_MANIFEST_ENTRY = 'lociview.json';
const NATIVE_PORTABLE_MANIFEST_ENTRY = 'native/package.json';

class BoundedIdentityBlobReader extends BlobReader {
  constructor(private readonly sourceBlob: Blob) {
    super(sourceBlob);
  }

  override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (length > MAX_ZIP_IDENTITY_READ_BYTES) {
      throw new ZipGuardError(
        'entry-too-large',
        `ZIP identity metadata read exceeds ${MAX_ZIP_IDENTITY_READ_BYTES} bytes`,
      );
    }
    // Always slice first. BlobReader otherwise calls the selected File's own
    // arrayBuffer() when a read spans the whole Blob, which defeats the
    // ordinary-entry guarantee for small archives and makes it hard to prove
    // that package-wide materialization is not part of dispatch.
    return new Uint8Array(await this.sourceBlob.slice(index, index + length).arrayBuffer());
  }
}

function rawUnixEntryType(versionMadeBy: number, externalFileAttributes: number): number | null {
  const hostSystem = (versionMadeBy >>> 8) & 0xff;
  if (hostSystem !== ZIP_HOST_SYSTEM_UNIX) return null;
  return ((externalFileAttributes >>> 16) & 0xffff) & UNIX_ENTRY_TYPE_MASK;
}

function normalizedEntryPath(filename: string, directory: boolean): string | null {
  const candidate = directory && filename.endsWith('/') ? filename.slice(0, -1) : filename;
  return sanitizeZipPath(candidate);
}

function asciiCaseFold(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function lowerBound(sorted: readonly string[], target: string): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (sorted[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function assertUnambiguousNamespace(entries: readonly { path: string; directory: boolean }[]): void {
  const logicalEntries = new Map<string, { path: string; directory: boolean }>();
  const logicalFilePaths = new Set<string>();
  const logicalPaths: string[] = [];
  for (const entry of entries) {
    const logical = asciiCaseFold(entry.path.normalize('NFC'));
    const existing = logicalEntries.get(logical);
    if (existing !== undefined) {
      const relation = existing.directory === entry.directory
        ? 'duplicate entry path'
        : 'file/directory path collision';
      throw new ZipGuardError(
        'ambiguous-path',
        `${relation}: ${existing.path} / ${entry.path}`,
      );
    }
    logicalEntries.set(logical, entry);
    logicalPaths.push(logical);
    if (!entry.directory) logicalFilePaths.add(logical);
  }
  logicalPaths.sort();

  for (const filePath of logicalFilePaths) {
    const prefix = `${filePath}/`;
    const descendantIndex = lowerBound(logicalPaths, prefix);
    if (logicalPaths[descendantIndex]?.startsWith(prefix)) {
      throw new ZipGuardError('ambiguous-path', `file path is an ancestor: ${filePath}`);
    }
  }
}

function hasZipSignature(data: Uint8Array): boolean {
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) return false;
  return (
    (data[2] === 0x03 && data[3] === 0x04) ||
    (data[2] === 0x05 && data[3] === 0x06) ||
    (data[2] === 0x07 && data[3] === 0x08)
  );
}

export interface ZipEntryData {
  path: string;
  data: Uint8Array;
}

export type ZipContainerIdentity = 'v1' | 'native-portable' | 'foreign';

/**
 * Classifies a selected archive from bounded random-access metadata only. The
 * format-specific parser remains authoritative after routing; Representation
 * or other entry bodies are never materialized here.
 */
export async function inspectZipContainerIdentity(
  blob: Blob,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipContainerIdentity> {
  if (!Number.isSafeInteger(blob.size) || blob.size < 1) {
    throw new Error('ZIP identity: file is empty or too large');
  }
  const reader = new ZipReader(new BoundedIdentityBlobReader(blob), { strictness: 'strict' });
  try {
    const entries = await reader.getEntries({ strictness: 'strict', checkAmbiguity: true });
    if (entries.length > limits.maxEntries) {
      throw new ZipGuardError('too-many-entries', `entries: ${entries.length} > ${limits.maxEntries}`);
    }

    let declaredTotal = 0;
    const normalizedEntries: { path: string; directory: boolean }[] = [];
    for (const entry of entries) {
      if (entry.bitFlag?.languageEncodingFlag === true) fatalUtf8Decoder.decode(entry.rawFilename);
      const path = normalizedEntryPath(entry.filename, entry.directory);
      if (path === null) {
        throw new ZipGuardError('unsafe-path', `unsafe entry path: ${entry.filename}`);
      }
      const unixEntryType = rawUnixEntryType(entry.versionMadeBy, entry.externalFileAttributes);
      if (unixEntryType === UNIX_ENTRY_TYPE_SYMLINK || unixEntryType === UNIX_ENTRY_TYPE_FIFO) {
        throw new ZipGuardError(
          'unsafe-entry-type',
          `unsupported Unix entry type: ${entry.filename}`,
        );
      }
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
        throw new ZipGuardError('entry-too-large', `invalid declared size: ${entry.filename}`);
      }
      if (entry.uncompressedSize > limits.maxEntryBytes) {
        throw new ZipGuardError('entry-too-large', `${entry.filename}: ${entry.uncompressedSize}B`);
      }
      declaredTotal += entry.uncompressedSize;
      if (!Number.isSafeInteger(declaredTotal) || declaredTotal > limits.maxTotalBytes) {
        throw new ZipGuardError('total-too-large', `declared total exceeds ${limits.maxTotalBytes}B`);
      }
      normalizedEntries.push({ path, directory: entry.directory });
    }
    assertUnambiguousNamespace(normalizedEntries);

    const files = new Set(normalizedEntries.filter((entry) => !entry.directory).map((entry) => entry.path));
    // Frozen v1 says the exact root manifest is authoritative. Preserve that
    // precedence even when forward-compatible/unknown extra entries exist.
    if (files.has(V1_MANIFEST_ENTRY)) return 'v1';
    if (files.has(NATIVE_PORTABLE_MANIFEST_ENTRY)) return 'native-portable';
    return 'foreign';
  } finally {
    await reader.close().catch(() => {});
  }
}

/** ZIP全体を読み、ガードを適用してエントリ配列を返す */
export async function readZipEntries(
  bytes: Uint8Array,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipEntryData[]> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { strictness: 'strict' });
  try {
    const entries = await reader.getEntries({ strictness: 'strict' });
    const files = entries.filter((e) => !e.directory);
    if (entries.length > limits.maxEntries) {
      throw new ZipGuardError('too-many-entries', `entries: ${entries.length} > ${limits.maxEntries}`);
    }

    let declaredTotal = 0;
    const normalizedEntries: { path: string; directory: boolean }[] = [];
    for (const e of entries) {
      if (e.bitFlag?.languageEncodingFlag === true) fatalUtf8Decoder.decode(e.rawFilename);
      const path = normalizedEntryPath(e.filename, e.directory);
      if (path === null) {
        throw new ZipGuardError('unsafe-path', `unsafe entry path: ${e.filename}`);
      }
      const unixEntryType = rawUnixEntryType(e.versionMadeBy, e.externalFileAttributes);
      if (unixEntryType === UNIX_ENTRY_TYPE_SYMLINK || unixEntryType === UNIX_ENTRY_TYPE_FIFO) {
        throw new ZipGuardError(
          'unsafe-entry-type',
          `unsupported Unix entry type: ${e.filename}`,
        );
      }
      normalizedEntries.push({ path, directory: e.directory });
      if (e.uncompressedSize > limits.maxEntryBytes) {
        throw new ZipGuardError('entry-too-large', `${e.filename}: ${e.uncompressedSize}B`);
      }
      declaredTotal += e.uncompressedSize;
    }
    assertUnambiguousNamespace(normalizedEntries);
    if (declaredTotal > limits.maxTotalBytes) {
      throw new ZipGuardError('total-too-large', `total: ${declaredTotal}B > ${limits.maxTotalBytes}B`);
    }

    const out: ZipEntryData[] = [];
    let actualTotal = 0;
    for (const e of files) {
      const path = normalizedEntryPath(e.filename, false)!;
      if (NESTED_ARCHIVE_RE.test(path)) {
        throw new ZipGuardError('nested-archive', `nested archive rejected: ${path}`);
      }
      const data = await e.getData!(new Uint8ArrayWriter(), {
        checkSignature: true,
        strictness: 'strict',
      });
      // 宣言サイズは偽装できるため実サイズでも検査する（zip bomb対策）
      if (data.length > limits.maxEntryBytes) {
        throw new ZipGuardError('entry-too-large', `${path}: actual ${data.length}B`);
      }
      actualTotal += data.length;
      if (actualTotal > limits.maxTotalBytes) {
        throw new ZipGuardError('total-too-large', `actual total exceeds ${limits.maxTotalBytes}B`);
      }
      if (hasZipSignature(data) && !SUPPORTED_NESTED_CONTAINER_RE.test(path)) {
        throw new ZipGuardError('nested-archive', `nested archive content rejected: ${path}`);
      }
      out.push({ path, data });
    }
    return out;
  } finally {
    await reader.close().catch(() => {});
  }
}

/** エントリ配列からZIPを構築する */
export async function writeZipEntries(entries: readonly ZipEntryData[]): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter());
  for (const e of entries) {
    await writer.add(e.path, new Uint8ArrayReader(e.data));
  }
  return writer.close();
}
