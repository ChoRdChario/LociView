// ZIP低レベル入出力と健全性ガード (docs/02 §8)
// zip.js を使用。ガード: パストラバーサル / エントリ数 / 展開サイズ / ネストアーカイブ

import {
  BlobReader,
  configure,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
  type FileEntry,
} from '@zip.js/zip.js';
import { NativeSha256 } from '../nativeGs/sha256';

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
      | 'nested-archive'
      | 'encrypted',
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
export interface ZipContainerMetadata { readonly identity: ZipContainerIdentity; readonly hasSpreadsheetEntry: boolean }

/**
 * Classifies a selected archive from bounded random-access metadata only. The
 * format-specific parser remains authoritative after routing; Representation
 * or other entry bodies are never materialized here.
 */
export async function inspectZipContainerIdentity(
  blob: Blob,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipContainerIdentity> {
  return (await inspectZipContainerMetadata(blob, limits)).identity;
}

/** Negative routing hint only; all format-specific payload checks remain required. */
export async function inspectZipContainerMetadata(
  blob: Blob,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipContainerMetadata> {
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
    const identity = files.has(V1_MANIFEST_ENTRY) ? 'v1' : files.has(NATIVE_PORTABLE_MANIFEST_ENTRY) ? 'native-portable' : 'foreign';
    return Object.freeze({ identity, hasSpreadsheetEntry: [...files].some(path => /\.(xlsx|csv)$/i.test(path)) });
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

export interface VerifiedZipEntry {
  readonly path: string; readonly index: number; readonly byteLength: number;
  readonly digest: string; readonly prefix: readonly number[];
}
export interface VerifiedZipCatalog {
  readonly original: Blob; readonly entries: readonly VerifiedZipEntry[];
  withEntry<T>(path: string, consume: (stream: ReadableStream<Uint8Array>) => Promise<T>, signal?: AbortSignal): Promise<T>;
  readBytes(path: string, maximum: number, signal?: AbortSignal): Promise<Uint8Array>;
  dispose(): Promise<void>;
}
const zipAbort = (signal: AbortSignal) => signal.reason ?? new DOMException('Operation aborted', 'AbortError');
function forwardAbort(signal: AbortSignal | undefined, controller: AbortController) {
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  return () => signal?.removeEventListener('abort', abort);
}

/** All regular entries finish CRC/hash inspection; only compact facts survive. */
export async function openVerifiedZipCatalog(input: Blob, options: {
  readonly limits?: ZipLimits; readonly signal?: AbortSignal;
  /** Borrowed scan facts only; observers must not retain full chunks. */
  readonly observe?: (path: string, chunk: Uint8Array, offset: number) => void;
} = {}): Promise<VerifiedZipCatalog> {
  const limits = Object.freeze({ ...(options.limits ?? DEFAULT_ZIP_LIMITS) });
  if (Object.values(limits).some(n => !Number.isSafeInteger(n) || n <= 0)) throw new Error('Invalid ZIP inspection limits');
  let original: Blob | undefined = input.slice(), reader: ZipReader<Blob> | undefined = new ZipReader(new BoundedIdentityBlobReader(original), { strictness: 'strict' });
  const owner = new AbortController(), detachOwner = forwardAbort(options.signal, owner);
  let closed = false, tail: Promise<void> = Promise.resolve(), closing: Promise<void> | undefined;
  const current = () => { if (closed || owner.signal.aborted) throw zipAbort(owner.signal); };
  const metadata = new Map<string, FileEntry>(), facts = new Map<string, VerifiedZipEntry>();
  const exclusive = <T>(run: () => Promise<T>) => {
    const operation = tail.then(() => { current(); return run(); }); tail = operation.then(() => {}, () => {}); return operation;
  };
  async function extract(path: string, signal: AbortSignal, remaining: number,
    write?: (chunk: Uint8Array) => Promise<void>, observe = false): Promise<VerifiedZipEntry> {
    const entry = metadata.get(path)!; const sha = new NativeSha256(), prefix: number[] = [];
    let count = 0, yielded = 0;
    const destination = new WritableStream<Uint8Array>({ async write(chunk) {
      if (signal.aborted) throw zipAbort(signal);
      if (!(chunk instanceof Uint8Array)) throw new Error('Invalid ZIP chunk');
      if (chunk.length > entry.uncompressedSize - count || chunk.length > limits.maxEntryBytes - count)
        throw new ZipGuardError('entry-too-large', `${path}: actual size exceeds declared size or entry budget`);
      if (chunk.length > remaining - count) throw new ZipGuardError('total-too-large', 'Actual ZIP expansion exceeds its budget');
      const offset = count; count += chunk.length; sha.update(chunk);
      for (let i = 0; i < chunk.length && prefix.length < 64; i++) prefix.push(chunk[i]!);
      // Keep observation and forwarding bounded even if a codec chooses larger chunks.
      for (let at = 0; at < chunk.length; at += 65536) {
        const part = chunk.subarray(at, at + 65536);
        if (observe) options.observe?.(path, part.slice(), offset + at);
        if (write) await write(part);
      }
      yielded += chunk.length;
      if (yielded >= 4 * 1024 * 1024) { yielded = 0; await new Promise<void>(resolve => setTimeout(resolve, 0)); }
    } });
    try {
      await entry.getData(destination, { checkSignature: true, strictness: 'strict', preventClose: true, signal });
      if (signal.aborted) throw zipAbort(signal);
      if (count !== entry.uncompressedSize) throw new ZipGuardError('entry-too-large', `${path}: actual size differs from declared size`);
      const digest = sha.digestHex(), expected = facts.get(path);
      if (expected && (count !== expected.byteLength || digest !== expected.digest)) throw new Error('ZIP entry no longer matches its verified source');
      if (hasZipSignature(new Uint8Array(prefix)) && !SUPPORTED_NESTED_CONTAINER_RE.test(path))
        throw new ZipGuardError('nested-archive', `nested archive content rejected: ${path}`);
      return Object.freeze({ path, index: expected?.index ?? facts.size, byteLength: count, digest, prefix: Object.freeze(prefix) });
    } finally {
      if (!destination.locked) { const writer = destination.getWriter(); try { await writer.close().catch(() => {}); } finally { writer.releaseLock(); } }
    }
  }
  async function withEntry<T>(path: string, consume: (stream: ReadableStream<Uint8Array>) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return exclusive(async () => {
      if (signal?.aborted) throw zipAbort(signal);
      if (!facts.has(path)) throw new Error('Unknown verified ZIP entry');
      const operation = new AbortController(), detach = [forwardAbort(owner.signal, operation), forwardAbort(signal, operation)];
      const bridge = new TransformStream<Uint8Array, Uint8Array>(undefined, { highWaterMark: 1 }, { highWaterMark: 0 });
      const writer = bridge.writable.getWriter(), source = bridge.readable.getReader();
      let complete = false, released = false, failure: unknown;
      const release = () => { if (!released) { released = true; source.releaseLock(); } };
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try { const r = await source.read(); if (r.done) { complete = true; controller.close(); release(); } else controller.enqueue(r.value); }
          catch (error) { controller.error(error); release(); }
        },
        async cancel(reason) { operation.abort(reason); try { await source.cancel(reason); } finally { release(); } },
      }, { highWaterMark: 0 });
      // Do not expose EOF until getData has finished its CRC/size/hash checks.
      const producing = (async () => {
        try { await extract(path, operation.signal, limits.maxEntryBytes, chunk => writer.write(chunk)); await writer.close(); }
        catch (error) { failure = error; await writer.abort(error).catch(() => {}); }
        finally { writer.releaseLock(); }
      })();
      try {
        const value = await consume(stream);
        if (!complete) throw new Error('ZIP consumer did not finish verified EOF');
        await producing; if (failure) throw failure;
        if (operation.signal.aborted) throw zipAbort(operation.signal); current(); return value;
      } catch (error) {
        operation.abort(error); await source.cancel(error).catch(() => {}); await producing; throw error;
      } finally { detach.forEach(remove => remove()); release(); }
    });
  }
  const dispose = () => closing ??= (async () => {
    closed = true; owner.abort(); await tail; detachOwner();
    try { await reader?.close(); } finally { reader = undefined; original = undefined; metadata.clear(); }
  })();
  try {
    current(); const entries = await reader.getEntries({ strictness: 'strict', checkAmbiguity: true }); current();
    if (entries.length > limits.maxEntries) throw new ZipGuardError('too-many-entries', `entries: ${entries.length} > ${limits.maxEntries}`);
    const namespace: { path: string; directory: boolean }[] = []; let declared = 0;
    for (const entry of entries) {
      if (entry.bitFlag?.languageEncodingFlag === true) fatalUtf8Decoder.decode(entry.rawFilename);
      const path = normalizedEntryPath(entry.filename, entry.directory);
      if (path === null) throw new ZipGuardError('unsafe-path', `unsafe entry path: ${entry.filename}`);
      const type = rawUnixEntryType(entry.versionMadeBy, entry.externalFileAttributes);
      if (type === UNIX_ENTRY_TYPE_SYMLINK || type === UNIX_ENTRY_TYPE_FIFO) throw new ZipGuardError('unsafe-entry-type', `unsupported Unix entry type: ${path}`);
      if (entry.encrypted) throw new ZipGuardError('encrypted', `encrypted entry is unsupported: ${path}`);
      if (entry.directory && entry.uncompressedSize !== 0)
        throw new ZipGuardError('unsafe-entry-type', `directory payload is unsupported: ${path}`);
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > limits.maxEntryBytes)
        throw new ZipGuardError('entry-too-large', `invalid declared size: ${path}`);
      declared += entry.uncompressedSize;
      if (!Number.isSafeInteger(declared) || declared > limits.maxTotalBytes) throw new ZipGuardError('total-too-large', 'Declared ZIP expansion exceeds its budget');
      namespace.push({ path, directory: entry.directory });
      if (!entry.directory) {
        if (NESTED_ARCHIVE_RE.test(path)) throw new ZipGuardError('nested-archive', `nested archive rejected: ${path}`);
        metadata.set(path, entry);
      }
    }
    assertUnambiguousNamespace(namespace);
    let actual = 0;
    for (const path of metadata.keys()) { current(); const checked = await extract(path, owner.signal, limits.maxTotalBytes - actual, undefined, true); actual += checked.byteLength; facts.set(path, checked); }
    const catalog: VerifiedZipCatalog = {
      get original() { current(); return original!; }, entries: Object.freeze([...facts.values()]), withEntry,
      async readBytes(path, maximum, signal) {
        const known = facts.get(path); if (!known || !Number.isSafeInteger(maximum) || maximum < 0 || known.byteLength > maximum)
          throw new ZipGuardError('entry-too-large', `entry exceeds parser buffer budget: ${path}`);
        return withEntry(path, async stream => {
          const bytes = new Uint8Array(known.byteLength), r = stream.getReader(); let offset = 0;
          try { for (;;) { const next = await r.read(); if (next.done) break; bytes.set(next.value, offset); offset += next.value.length; } return bytes; }
          finally { r.releaseLock(); }
        }, signal);
      }, dispose,
    };
    return catalog;
  } catch (error) { await dispose().catch(() => {}); throw error; }
}
