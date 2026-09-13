import { NativeSha256 } from '../nativeGs/sha256';
import { PACKAGE_LIMITS as L, type Entry } from './contract';
import { checkPackageEntryTable, readManifestControl, PackageControlError, type ManifestControl } from './manifest';
import { ZipCrc32, rejectNestedZip, checkAbort } from './zipChecks';

const fail = (code: string): never => { throw new PackageControlError(code); };
const chunkBytes = 65_536;
interface ZipEntry { readonly path: string; readonly byteLength: number; readonly crc32: number; readonly offset: number }
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
function name(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > 128 || bytes.some(b => b < 0x21 || b > 0x7e)) return fail('zip-name');
  return new TextDecoder().decode(bytes);
}

/** One sequential inspector's bounded native Blob ranges; never whole-archive arrayBuffer. */
class Ranges {
  reads = 0; headerBytes = 0; private buffering = false;
  constructor(readonly file: Blob, readonly signal?: AbortSignal) {}
  async read(at: number, count: number, header = false): Promise<Uint8Array> {
    checkAbort(this.signal);
    if (![at, count].every(n => Number.isSafeInteger(n) && n >= 0) || count > chunkBytes || at > this.file.size - count) return fail('zip-range');
    if (++this.reads > L.packageChunks) return fail('zip-read-budget');
    if (header && (this.headerBytes += count) > L.containerMetadataBytes) return fail('zip-header-budget');
    const bytes = new Uint8Array(await this.file.slice(at, at + count).arrayBuffer()); checkAbort(this.signal);
    if (bytes.length !== count) return fail('zip-short-read');
    return bytes;
  }
  async bytes(entry: ZipEntry, max: number, signal?: AbortSignal): Promise<Uint8Array> {
    if (!Number.isSafeInteger(max) || max < 0 || entry.byteLength > max || max > L.sourceBytes) return fail('zip-buffer-budget');
    checkAbort(this.signal); checkAbort(signal);
    if (this.buffering) return fail('zip-buffer-busy');
    this.buffering = true;
    try {
      const bytes = new Uint8Array(entry.byteLength);
      for (let at = 0; at < bytes.length; at += chunkBytes) {
        checkAbort(signal);
        bytes.set(await this.read(entry.offset + at, Math.min(chunkBytes, bytes.length - at)), at);
        checkAbort(signal);
      }
      return bytes;
    } finally { this.buffering = false; }
  }
}

/** Exact ZIP/control/payload integrity only. No profile, source-DAG or import authority. */
export class PackageArchive {
  readonly kind = 'package-archive-integrity';
  private constructor(private readonly ranges: Ranges, private readonly entries: readonly ZipEntry[], readonly control: ManifestControl,
    readonly byteLength: number, readonly sha256: string) { Object.freeze(this); }

  /** Immutable native range view; downstream decoders/staging retain their own admission limits. */
  entryBlob(path: string): Blob {
    const entry = this.entries.find(e => e.path === path); if (!entry) return fail('zip-entry-missing');
    return this.ranges.file.slice(entry.offset, entry.offset + entry.byteLength);
  }
  async entryBytes(path: string, max: number, signal?: AbortSignal): Promise<Uint8Array> {
    const entry = this.entries.find(e => e.path === path); if (!entry) return fail('zip-entry-missing');
    return this.ranges.bytes(entry, max, signal);
  }

  static async inspect(input: Blob, signal?: AbortSignal): Promise<PackageArchive> {
    checkAbort(signal);
    if (!(input instanceof Blob) || input.size < 22 || input.size > L.archiveBytes) return fail('zip-size');
    const file = input.slice(0, input.size), ranges = new Ranges(file, signal);
    const end = view(await ranges.read(file.size - 22, 22, true));
    if (end.getUint32(0, true) !== 0x06054b50 || end.getUint16(4, true) || end.getUint16(6, true) || end.getUint16(20, true)) return fail('zip-eocd');
    const count = end.getUint16(8, true), centralSize = end.getUint32(12, true), centralAt = end.getUint32(16, true);
    if (count < 2 || count > L.entryCount || count !== end.getUint16(10, true) || centralSize > L.containerMetadataBytes ||
      centralAt + centralSize !== file.size - 22) return fail('zip-central-range');
    const entries: ZipEntry[] = [], names = new Set<string>(); let at = centralAt, localAt = 0;
    for (let i = 0; i < count; i++) {
      const central = view(await ranges.read(at, 46, true)), length = central.getUint16(28, true);
      if (central.getUint32(0, true) !== 0x02014b50 || central.getUint16(4, true) !== 20 || central.getUint16(6, true) !== 20 ||
        central.getUint16(8, true) !== 0x0808 || central.getUint16(10, true) || central.getUint16(12, true) || central.getUint16(14, true) !== 33 ||
        !length || length > 128 || central.getUint16(30, true) || central.getUint16(32, true) || central.getUint16(34, true) ||
        central.getUint16(36, true) || central.getUint32(38, true) || central.getUint32(42, true) !== localAt) return fail('zip-central');
      const size = central.getUint32(24, true), crc32 = central.getUint32(16, true);
      if (size !== central.getUint32(20, true) || size > L.payloadBytes) return fail('zip-entry-size');
      const path = name(await ranges.read(at + 46, length, true));
      if (names.has(path)) return fail('zip-duplicate'); names.add(path);
      const local = view(await ranges.read(localAt, 30, true));
      if (local.getUint32(0, true) !== 0x04034b50 || local.getUint16(4, true) !== 20 || local.getUint16(6, true) !== 0x0808 ||
        local.getUint16(8, true) || local.getUint16(10, true) || local.getUint16(12, true) !== 33 || local.getUint32(14, true) ||
        local.getUint32(18, true) || local.getUint32(22, true) || local.getUint16(26, true) !== length || local.getUint16(28, true) ||
        name(await ranges.read(localAt + 30, length, true)) !== path) return fail('zip-local');
      const offset = localAt + 30 + length, descriptorAt = offset + size;
      if (descriptorAt + 16 > centralAt) return fail('zip-overlap');
      const descriptor = view(await ranges.read(descriptorAt, 16, true));
      if (descriptor.getUint32(0, true) !== 0x08074b50 || descriptor.getUint32(4, true) !== crc32 ||
        descriptor.getUint32(8, true) !== size || descriptor.getUint32(12, true) !== size) return fail('zip-descriptor');
      entries.push(Object.freeze({ path, byteLength: size, crc32, offset }));
      localAt = descriptorAt + 16; at += 46 + length;
      if (at > centralAt + centralSize) return fail('zip-central-range');
    }
    if (localAt !== centralAt || at !== centralAt + centralSize) return fail('zip-gap');
    if (entries[0]!.path !== 'manifest.json' || entries[1]!.path !== 'manifest.sha256') return fail('zip-control-order');
    const manifest = await ranges.bytes(entries[0]!, L.controlBytes), checksum = await ranges.bytes(entries[1]!, 64);
    const control = readManifestControl(manifest, checksum);
    if (control.entries.length !== entries.length || control.archiveByteLength !== file.size) return fail('entry-table');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!, expected = control.entries[i]!;
      if (entry.path !== expected.path || entry.byteLength !== expected.byteLength) return fail('entry-table');
    }
    const observed: Entry[] = [], archiveHash = new NativeSha256();
    for (const entry of entries) {
      const crc = new ZipCrc32(), hash = new NativeSha256(); let reads = 0;
      archiveHash.update(await ranges.read(entry.offset - 30 - entry.path.length, 30 + entry.path.length, true));
      for (let offset = 0; offset < entry.byteLength; offset += chunkBytes) {
        if (++reads > L.streamChunks) return fail('zip-stream-budget');
        const bytes = await ranges.read(entry.offset + offset, Math.min(chunkBytes, entry.byteLength - offset));
        if (offset === 0 && entry.path.startsWith('blobs/')) rejectNestedZip(bytes);
        crc.update(bytes); hash.update(bytes); archiveHash.update(bytes);
      }
      if (crc.digest() !== entry.crc32) return fail('zip-crc');
      archiveHash.update(await ranges.read(entry.offset + entry.byteLength, 16, true));
      observed.push({ path: entry.path, byteLength: entry.byteLength, sha256: hash.digestHex() });
    }
    checkPackageEntryTable(control, observed, file.size);
    for (let at = centralAt; at < file.size; at += chunkBytes) archiveHash.update(await ranges.read(at, Math.min(chunkBytes, file.size - at), true));
    checkAbort(signal);
    return new PackageArchive(ranges, Object.freeze(entries), control, file.size, archiveHash.digestHex());
  }
}
