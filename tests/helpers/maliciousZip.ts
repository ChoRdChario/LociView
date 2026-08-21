import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
  type ZipWriterAddDataOptions,
} from '@zip.js/zip.js';
import type { ZipEntryData } from '../../src/assets/zipio';

const encoder = new TextEncoder();

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const FIXED_ZIP_DATE = new Date('2026-01-02T03:04:06.000Z');

export interface DirectZipEntry {
  path: string;
  data?: Uint8Array;
  options?: ZipWriterAddDataOptions;
}

export interface RawZipEntryShape {
  filename: string;
  rawFilename: Uint8Array;
  localRawFilename: Uint8Array;
  centralBitFlag: number;
  localBitFlag: number;
  centralCrc32: number;
  localCrc32: number;
  centralCompressedSize: number;
  localCompressedSize: number;
  centralUncompressedSize: number;
  localUncompressedSize: number;
  filenameUTF8: boolean;
  directory: boolean;
  encrypted: boolean;
  compressionMethod: number;
  unixMode: number | null;
  payload: Uint8Array | null;
}

function equalBytesAt(bytes: Uint8Array, needle: Uint8Array, offset: number): boolean {
  if (offset + needle.length > bytes.length) return false;
  for (let index = 0; index < needle.length; index += 1) {
    if (bytes[offset + index] !== needle[index]) return false;
  }
  return true;
}

function uint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function setUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function setUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (uint32(bytes, offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }
  throw new Error('malicious ZIP alias fixture has no end-of-central-directory record');
}

interface CentralDirectoryRecord {
  offset: number;
  filenameOffset: number;
  filenameLength: number;
  localOffset: number;
}

function centralDirectoryRecords(bytes: Uint8Array): CentralDirectoryRecord[] {
  const endOffset = findEndOfCentralDirectory(bytes);
  const entryCount = uint16(bytes, endOffset + 10);
  let offset = uint32(bytes, endOffset + 16);
  const records: CentralDirectoryRecord[] = [];
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (uint32(bytes, offset) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error('raw ZIP descriptor found an invalid central-directory header');
    }
    const filenameLength = uint16(bytes, offset + 28);
    const extraLength = uint16(bytes, offset + 30);
    const commentLength = uint16(bytes, offset + 32);
    const filenameOffset = offset + 46;
    records.push({
      offset,
      filenameOffset,
      filenameLength,
      localOffset: uint32(bytes, offset + 42),
    });
    offset = filenameOffset + filenameLength + extraLength + commentLength;
  }
  return records;
}

function uniqueCentralRecord(bytes: Uint8Array, filename: string): CentralDirectoryRecord {
  const encodedFilename = encoder.encode(filename);
  const matches = centralDirectoryRecords(bytes).filter(
    (record) =>
      record.filenameLength === encodedFilename.length &&
      equalBytesAt(bytes, encodedFilename, record.filenameOffset),
  );
  if (matches.length !== 1) {
    throw new Error(`ZIP header mutation expected 1 source entry, found ${matches.length}`);
  }
  const record = matches[0]!;
  if (uint32(bytes, record.localOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error('ZIP header mutation found an invalid local-file header');
  }
  const localFilenameLength = uint16(bytes, record.localOffset + 26);
  if (
    localFilenameLength !== encodedFilename.length ||
    !equalBytesAt(bytes, encodedFilename, record.localOffset + 30)
  ) {
    throw new Error('ZIP header mutation source local and central names disagree');
  }
  return record;
}

/** Build small adversarial entries through zip.js' public writer API. */
export async function writeDirectZip(entries: readonly DirectZipEntry[]): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    level: 0,
    extendedTimestamp: false,
    lastModDate: FIXED_ZIP_DATE,
    dataDescriptor: false,
    keepOrder: true,
    useWebWorkers: false,
  });
  for (const entry of entries) {
    const options: ZipWriterAddDataOptions = {
      ...entry.options,
      level: 0,
      extendedTimestamp: false,
      lastModDate: FIXED_ZIP_DATE,
      dataDescriptor: false,
      useWebWorkers: false,
    };
    await writer.add(
      entry.path,
      entry.data === undefined ? undefined : new Uint8ArrayReader(entry.data),
      options,
    );
  }
  return writer.close();
}

/** Describe central/local names, attributes, and safely extractable payloads. */
export async function rawZipEntryShapes(
  bytes: Uint8Array,
  options: { extractPayload?: boolean } = {},
): Promise<RawZipEntryShape[]> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  try {
    const centralByLocalOffset = new Map(
      centralDirectoryRecords(bytes).map((record) => [record.localOffset, record]),
    );
    const shapes: RawZipEntryShape[] = [];
    for (const entry of await reader.getEntries()) {
      if (uint32(bytes, entry.offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
        throw new Error('raw ZIP descriptor found an invalid local-file header');
      }
      const central = centralByLocalOffset.get(entry.offset);
      if (central === undefined) {
        throw new Error('raw ZIP descriptor could not pair local and central headers');
      }
      const localFilenameLength = uint16(bytes, entry.offset + 26);
      const localNameOffset = entry.offset + 30;
      const payload =
        options.extractPayload !== false &&
        !entry.directory && !entry.encrypted &&
        (entry.compressionMethod === 0 || entry.compressionMethod === 8)
          ? await entry.getData(new Uint8ArrayWriter())
          : null;
      shapes.push({
        filename: entry.filename,
        rawFilename: new Uint8Array(entry.rawFilename),
        localRawFilename: new Uint8Array(
          bytes.subarray(localNameOffset, localNameOffset + localFilenameLength),
        ),
        centralBitFlag: uint16(bytes, central.offset + 8),
        localBitFlag: uint16(bytes, entry.offset + 6),
        centralCrc32: uint32(bytes, central.offset + 16),
        localCrc32: uint32(bytes, entry.offset + 14),
        centralCompressedSize: uint32(bytes, central.offset + 20),
        localCompressedSize: uint32(bytes, entry.offset + 18),
        centralUncompressedSize: uint32(bytes, central.offset + 24),
        localUncompressedSize: uint32(bytes, entry.offset + 22),
        filenameUTF8: entry.filenameUTF8,
        directory: entry.directory,
        encrypted: entry.encrypted,
        compressionMethod: entry.compressionMethod,
        unixMode: entry.unixMode ?? null,
        payload,
      });
    }
    return shapes;
  } finally {
    await reader.close().catch(() => undefined);
  }
}

/** Make one entry's local encryption flag disagree with its central-directory flag. */
export async function writeZipWithMismatchedLocalEncryptionFlag(
  entries: readonly ZipEntryData[],
  filename: string,
): Promise<Uint8Array> {
  const zip = new Uint8Array(await writeDirectZip(entries));
  const record = uniqueCentralRecord(zip, filename);
  const centralBitFlag = uint16(zip, record.offset + 8);
  const localBitFlag = uint16(zip, record.localOffset + 6);
  if (centralBitFlag !== localBitFlag || (centralBitFlag & 0x0001) !== 0) {
    throw new Error('ZIP local-flag fixture source must be matching and unencrypted');
  }
  setUint16(zip, record.localOffset + 6, localBitFlag | 0x0001);
  return zip;
}

/** Give one entry a matching but deliberately false local/central CRC32. */
export async function writeZipWithFalseCrc32(
  entries: readonly ZipEntryData[],
  filename: string,
): Promise<Uint8Array> {
  const zip = new Uint8Array(await writeDirectZip(entries));
  const record = uniqueCentralRecord(zip, filename);
  const centralCrc32 = uint32(zip, record.offset + 16);
  const localCrc32 = uint32(zip, record.localOffset + 14);
  if (centralCrc32 !== localCrc32) {
    throw new Error('false-CRC fixture source local and central CRCs disagree');
  }
  const falseCrc32 = (centralCrc32 ^ 0xffffffff) >>> 0;
  setUint32(zip, record.offset + 16, falseCrc32);
  setUint32(zip, record.localOffset + 14, falseCrc32);
  return zip;
}

/** Give one entry a matching but deliberately false local/central uncompressed size. */
export async function writeZipWithFalseUncompressedSize(
  entries: readonly ZipEntryData[],
  filename: string,
): Promise<Uint8Array> {
  const zip = new Uint8Array(await writeDirectZip(entries));
  const record = uniqueCentralRecord(zip, filename);
  const centralSize = uint32(zip, record.offset + 24);
  const localSize = uint32(zip, record.localOffset + 22);
  if (centralSize !== localSize || centralSize === 0xffffffff) {
    throw new Error('false-size fixture source local and central sizes must match and be non-ZIP64');
  }
  const falseSize = centralSize + 1;
  setUint32(zip, record.offset + 24, falseSize);
  setUint32(zip, record.localOffset + 22, falseSize);
  return zip;
}

/** Make one entry's local filename disagree with its central-directory name. */
export async function writeZipWithMismatchedLocalName(
  entries: readonly ZipEntryData[],
  centralName: string,
  localName: string,
): Promise<Uint8Array> {
  const central = encoder.encode(centralName);
  const local = encoder.encode(localName);
  if (central.length !== local.length || central.length === 0) {
    throw new Error('mismatched ZIP names must have the same non-zero UTF-8 length');
  }

  const zip = new Uint8Array(await writeDirectZip(entries));
  const endOffset = findEndOfCentralDirectory(zip);
  const entryCount = uint16(zip, endOffset + 10);
  let centralOffset = uint32(zip, endOffset + 16);
  let rewritten = 0;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (uint32(zip, centralOffset) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error('mismatched ZIP fixture has an invalid central-directory header');
    }
    const filenameLength = uint16(zip, centralOffset + 28);
    const extraLength = uint16(zip, centralOffset + 30);
    const commentLength = uint16(zip, centralOffset + 32);
    const centralNameOffset = centralOffset + 46;
    if (filenameLength === central.length && equalBytesAt(zip, central, centralNameOffset)) {
      const localOffset = uint32(zip, centralOffset + 42);
      if (
        uint32(zip, localOffset) !== LOCAL_FILE_HEADER_SIGNATURE ||
        uint16(zip, localOffset + 26) !== central.length ||
        !equalBytesAt(zip, central, localOffset + 30)
      ) {
        throw new Error('mismatched ZIP fixture source headers disagree before rewrite');
      }
      zip.set(local, localOffset + 30);
      rewritten += 1;
    }
    centralOffset = centralNameOffset + filenameLength + extraLength + commentLength;
  }
  if (rewritten !== 1) {
    throw new Error(`mismatched ZIP fixture expected 1 source entry, found ${rewritten}`);
  }
  return zip;
}

/**
 * zip.js intentionally refuses duplicate names when writing. Build two distinct
 * entries first, then make their same-length ASCII names alias in the selected
 * entry's local and central-directory headers. ZIP CRCs cover payloads, not
 * entry names. Header offsets are parsed from the archive; payload bytes are
 * never searched or rewritten.
 */
export async function writeZipWithAliasedEntryName(
  entries: readonly ZipEntryData[],
  sourceName: string,
  targetName: string,
): Promise<Uint8Array> {
  const source = encoder.encode(sourceName);
  const target = encoder.encode(targetName);
  if (source.length !== target.length || source.length === 0) {
    throw new Error('malicious ZIP alias names must have the same non-zero UTF-8 length');
  }

  const zip = await writeDirectZip(entries);
  const aliased = new Uint8Array(zip);
  const endOffset = findEndOfCentralDirectory(aliased);
  const entryCount = uint16(aliased, endOffset + 10);
  let centralOffset = uint32(aliased, endOffset + 16);
  let aliasedEntries = 0;

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (uint32(aliased, centralOffset) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error('malicious ZIP alias fixture has an invalid central-directory header');
    }
    const filenameLength = uint16(aliased, centralOffset + 28);
    const extraLength = uint16(aliased, centralOffset + 30);
    const commentLength = uint16(aliased, centralOffset + 32);
    const centralNameOffset = centralOffset + 46;

    if (filenameLength === source.length && equalBytesAt(aliased, source, centralNameOffset)) {
      const localOffset = uint32(aliased, centralOffset + 42);
      if (uint32(aliased, localOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
        throw new Error('malicious ZIP alias fixture has an invalid local-file header');
      }
      const localFilenameLength = uint16(aliased, localOffset + 26);
      const localNameOffset = localOffset + 30;
      if (
        localFilenameLength !== source.length ||
        !equalBytesAt(aliased, source, localNameOffset)
      ) {
        throw new Error('malicious ZIP alias fixture local and central names disagree');
      }
      aliased.set(target, localNameOffset);
      aliased.set(target, centralNameOffset);
      aliasedEntries += 1;
    }

    centralOffset = centralNameOffset + filenameLength + extraLength + commentLength;
  }

  if (aliasedEntries !== 1) {
    throw new Error(`malicious ZIP alias fixture expected 1 source entry, found ${aliasedEntries}`);
  }
  return aliased;
}
