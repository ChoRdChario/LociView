export interface RestartableByteSource {
  readonly size: number;
  stream(): ReadableStream<Uint8Array>;
}

export interface NativeGsPlyFactsV1 {
  readonly shDegree: 2 | 3;
  readonly splatCount: number;
  readonly headerByteLength: number;
  readonly recordStrideBytes: 164 | 248;
  readonly payloadByteLength: number;
}

export interface NativePointPlyFactsV1 {
  readonly pointCount: number;
  readonly headerByteLength: number;
  readonly encoding: 'ascii';
}

export type NativePlyInspection =
  | { readonly kind: 'supported-gs'; readonly facts: NativeGsPlyFactsV1 }
  | { readonly kind: 'ordinary-ply' };

export type NativePointPlyInspection =
  | { readonly kind: 'supported-point'; readonly facts: NativePointPlyFactsV1 }
  | { readonly kind: 'mesh-ply' };

export type NativeGsPlyErrorCode =
  | 'PLY_HEADER_INVALID'
  | 'PLY_HEADER_LIMIT'
  | 'PLY_STREAM_FAILED'
  | 'PLY_GS_PROFILE_UNSUPPORTED'
  | 'PLY_POINT_PROFILE_UNSUPPORTED'
  | 'PLY_POINT_PAYLOAD_INVALID'
  | 'PLY_PAYLOAD_TRUNCATED'
  | 'PLY_TRAILING_BYTES';

export class NativeGsPlyError extends Error {
  constructor(readonly code: NativeGsPlyErrorCode, message: string) {
    super(message);
    this.name = 'NativeGsPlyError';
  }
}

const MAX_HEADER_BYTES = 64 * 1024;
const MAX_POINT_PAYLOAD_ROW_BYTES = 1024;
const ASCII_DECODER = new TextDecoder('utf-8', { fatal: true });
const ASCII_DECIMAL_FLOAT = /^[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?)|(?:\.[0-9]+))(?:[eE][+-]?[0-9]+)?$/u;

function numbered(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

const COMMON_PREFIX = Object.freeze([
  'x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2',
]);
const COMMON_SUFFIX = Object.freeze(['opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']);
const SH2_PROPERTIES = Object.freeze([...COMMON_PREFIX, ...numbered('f_rest_', 24), ...COMMON_SUFFIX]);
const SH3_PROPERTIES = Object.freeze([...COMMON_PREFIX, ...numbered('f_rest_', 45), ...COMMON_SUFFIX]);
const POINT_PROPERTIES = Object.freeze([
  'float x', 'float y', 'float z', 'uchar red', 'uchar green', 'uchar blue',
]);

interface ParsedPlyHeader {
  readonly headerByteLength: number;
  readonly format: string | null;
  readonly vertexCount: number | null;
  readonly vertexProperties: readonly { readonly type: string; readonly name: string }[];
  readonly nonVertexElements: readonly { readonly name: string; readonly count: number }[];
}

function bytesEndWith(haystack: Uint8Array, needle: Uint8Array, at: number): boolean {
  if (at + needle.byteLength > haystack.byteLength) return false;
  for (let index = 0; index < needle.byteLength; index += 1) {
    if (haystack[at + index] !== needle[index]) return false;
  }
  return true;
}

const HEADER_END_LF = new TextEncoder().encode('end_header\n');
const HEADER_END_CRLF = new TextEncoder().encode('end_header\r\n');

function findHeaderEnd(bytes: Uint8Array): number | null {
  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytesEndWith(bytes, HEADER_END_LF, index)) return index + HEADER_END_LF.byteLength;
    if (bytesEndWith(bytes, HEADER_END_CRLF, index)) return index + HEADER_END_CRLF.byteLength;
  }
  return null;
}

async function readBoundedHeader(source: RestartableByteSource): Promise<Uint8Array> {
  if (!Number.isSafeInteger(source.size) || source.size < 1) {
    throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY byte length must be a positive safe integer');
  }
  const reader = source.stream().getReader();
  let bytes = new Uint8Array(0);
  try {
    while (bytes.byteLength <= MAX_HEADER_BYTES) {
      const result = await reader.read();
      if (result.done) break;
      const remaining = MAX_HEADER_BYTES + 1 - bytes.byteLength;
      const next = result.value.subarray(0, remaining);
      const merged = new Uint8Array(bytes.byteLength + next.byteLength);
      merged.set(bytes);
      merged.set(next, bytes.byteLength);
      bytes = merged;
      const end = findHeaderEnd(bytes);
      if (end !== null) {
        await reader.cancel('PLY header read complete');
        return bytes.slice(0, end);
      }
      if (next.byteLength < result.value.byteLength || bytes.byteLength > MAX_HEADER_BYTES) break;
    }
  } catch (error) {
    throw new NativeGsPlyError(
      'PLY_STREAM_FAILED',
      `PLY header stream failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    reader.releaseLock();
  }
  if (bytes.byteLength > MAX_HEADER_BYTES) {
    throw new NativeGsPlyError('PLY_HEADER_LIMIT', `PLY header exceeds ${MAX_HEADER_BYTES} bytes`);
  }
  throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY end_header terminator is missing');
}

function sameProperties(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
}

function hasGsMarkers(properties: readonly string[]): boolean {
  return properties.some((name) => (
    name === 'opacity' || name.startsWith('f_dc_') || name.startsWith('f_rest_') ||
    name.startsWith('scale_') || name.startsWith('rot_')
  ));
}

async function parsePlyHeader(source: RestartableByteSource): Promise<ParsedPlyHeader> {
  const headerBytes = await readBoundedHeader(source);
  if (headerBytes.some((byte) => byte !== 0x0a && byte !== 0x0d && (byte < 0x20 || byte > 0x7e))) {
    throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY header must be ASCII text');
  }
  let header: string;
  try {
    header = ASCII_DECODER.decode(headerBytes);
  } catch {
    throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY header is not valid UTF-8/ASCII');
  }
  const lines = header.split('\n').map((line) => line.endsWith('\r') ? line.slice(0, -1) : line);
  if (lines[0] !== 'ply') throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY magic is invalid');
  if (lines.at(-2) !== 'end_header') {
    throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY header terminator is malformed');
  }

  let format: string | null = null;
  let vertexCount: number | null = null;
  let currentElement: string | null = null;
  const vertexProperties: { type: string; name: string }[] = [];
  const nonVertexElements: { name: string; count: number }[] = [];
  for (const line of lines.slice(1, -2)) {
    if (line === '' || line.startsWith('comment ') || line.startsWith('obj_info ')) continue;
    if (line.startsWith('format ')) {
      if (format !== null) throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY format is duplicated');
      format = line;
      continue;
    }
    if (line.startsWith('element ')) {
      const match = /^element ([A-Za-z0-9_]+) ([0-9]+)$/.exec(line);
      if (match === null) throw new NativeGsPlyError('PLY_HEADER_INVALID', `Malformed PLY element: ${line}`);
      const count = Number(match[2]);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY element count must be a non-negative safe integer');
      }
      currentElement = match[1]!;
      if (currentElement === 'vertex') {
        if (vertexCount !== null) throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY vertex element is duplicated');
        if (count < 1) throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY vertex count must be positive');
        vertexCount = count;
      } else {
        nonVertexElements.push({ name: currentElement, count });
      }
      continue;
    }
    if (line.startsWith('property ')) {
      if (currentElement === null) throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY property has no element');
      if (currentElement !== 'vertex') continue;
      const match = /^property ([A-Za-z0-9_]+) ([A-Za-z0-9_]+)$/.exec(line);
      if (match === null) vertexProperties.push({ type: `!unsupported:${line}`, name: line });
      else vertexProperties.push({ type: match[1]!, name: match[2]! });
      continue;
    }
    throw new NativeGsPlyError('PLY_HEADER_INVALID', `Unsupported PLY header directive: ${line}`);
  }
  if (format === null || vertexCount === null) {
    throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY format and vertex element are required');
  }
  return {
    headerByteLength: headerBytes.byteLength,
    format,
    vertexCount,
    vertexProperties,
    nonVertexElements,
  };
}

async function validateAsciiPointPayload(
  source: RestartableByteSource,
  facts: NativePointPlyFactsV1,
): Promise<void> {
  const reader = source.stream().getReader();
  let skipped = 0;
  let rowBytes: number[] = [];
  let rows = 0;
  const consumeLine = (raw: string): void => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') throw new NativeGsPlyError('PLY_POINT_PAYLOAD_INVALID', 'Point PLY contains an empty payload row');
    const fields = line.trim().split(/[ \t]+/u);
    if (fields.length !== 6) throw new NativeGsPlyError('PLY_POINT_PAYLOAD_INVALID', 'Point PLY row must contain XYZ and RGB');
    for (const field of fields.slice(0, 3)) {
      if (!ASCII_DECIMAL_FLOAT.test(field) || !Number.isFinite(Number(field))) {
        throw new NativeGsPlyError('PLY_POINT_PAYLOAD_INVALID', 'Point PLY XYZ values must be finite decimal floats');
      }
    }
    for (const field of fields.slice(3)) {
      if (!/^[0-9]+$/u.test(field)) throw new NativeGsPlyError('PLY_POINT_PAYLOAD_INVALID', 'Point PLY RGB values must be integers');
      const value = Number(field);
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new NativeGsPlyError('PLY_POINT_PAYLOAD_INVALID', 'Point PLY RGB values must be in 0..255');
      }
    }
    rows += 1;
    if (rows > facts.pointCount) throw new NativeGsPlyError('PLY_POINT_PAYLOAD_INVALID', 'Point PLY contains trailing rows');
  };
  const consumeByte = (byte: number): void => {
    if (byte === 0x0a) {
      consumeLine(String.fromCharCode(...rowBytes));
      rowBytes = [];
      return;
    }
    if (byte !== 0x09 && byte !== 0x0d && (byte < 0x20 || byte > 0x7e)) {
      throw new NativeGsPlyError('PLY_POINT_PAYLOAD_INVALID', 'Point PLY payload must contain ASCII text only');
    }
    if (rowBytes.length >= MAX_POINT_PAYLOAD_ROW_BYTES) {
      throw new NativeGsPlyError(
        'PLY_POINT_PAYLOAD_INVALID',
        `Point PLY payload row exceeds ${MAX_POINT_PAYLOAD_ROW_BYTES} bytes`,
      );
    }
    rowBytes.push(byte);
  };
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      let bytes = result.value;
      if (skipped < facts.headerByteLength) {
        const count = Math.min(facts.headerByteLength - skipped, bytes.byteLength);
        skipped += count;
        bytes = bytes.subarray(count);
      }
      if (bytes.byteLength === 0) continue;
      for (const byte of bytes) consumeByte(byte);
    }
    if (skipped !== facts.headerByteLength) {
      throw new NativeGsPlyError('PLY_POINT_PAYLOAD_INVALID', 'Point PLY ended before its header');
    }
    if (rowBytes.length > 0) consumeLine(String.fromCharCode(...rowBytes));
    if (rows !== facts.pointCount) {
      throw new NativeGsPlyError('PLY_POINT_PAYLOAD_INVALID', `Point PLY row count is ${rows}; expected ${facts.pointCount}`);
    }
  } catch (error) {
    try { await reader.cancel(error); } catch { /* preserve the admission error */ }
    if (error instanceof NativeGsPlyError) throw error;
    throw new NativeGsPlyError(
      'PLY_POINT_PAYLOAD_INVALID',
      `Point PLY payload stream failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    reader.releaseLock();
  }
}

/**
 * Structural production admission for the first Graphdeco PLY path.
 * It reads only the bounded header; payload values are not rescanned.
 */
export async function inspectNativeGsPlyV1(source: RestartableByteSource): Promise<NativePlyInspection> {
  const parsed = await parsePlyHeader(source);
  const properties = parsed.vertexProperties.map((property) => property.type === 'float' ? property.name : `!unsupported:${property.type} ${property.name}`);

  if (parsed.nonVertexElements.some((element) => element.name === 'face' && element.count > 0)) {
    return { kind: 'ordinary-ply' };
  }
  if (!hasGsMarkers(properties)) return { kind: 'ordinary-ply' };
  if (parsed.format !== 'format binary_little_endian 1.0' || parsed.nonVertexElements.length > 0) {
    throw new NativeGsPlyError(
      'PLY_GS_PROFILE_UNSUPPORTED',
      'GS PLY must be binary little-endian 1.0 with exactly one vertex element',
    );
  }

  let shDegree: 2 | 3;
  let recordStrideBytes: 164 | 248;
  if (sameProperties(properties, SH2_PROPERTIES)) {
    shDegree = 2;
    recordStrideBytes = 164;
  } else if (sameProperties(properties, SH3_PROPERTIES)) {
    shDegree = 3;
    recordStrideBytes = 248;
  } else {
    throw new NativeGsPlyError(
      'PLY_GS_PROFILE_UNSUPPORTED',
      'GS PLY properties must exactly match the supported Graphdeco SH2 or SH3 float32 profile',
    );
  }

  const headerByteLength = parsed.headerByteLength;
  const payloadBig = BigInt(parsed.vertexCount!) * BigInt(recordStrideBytes);
  const expectedBig = BigInt(headerByteLength) + payloadBig;
  const actualBig = BigInt(source.size);
  if (actualBig < expectedBig) {
    throw new NativeGsPlyError('PLY_PAYLOAD_TRUNCATED', 'GS PLY payload is shorter than the header-derived length');
  }
  if (actualBig > expectedBig) {
    throw new NativeGsPlyError('PLY_TRAILING_BYTES', 'GS PLY contains bytes after the header-derived payload');
  }
  const payloadByteLength = Number(payloadBig);
  if (!Number.isSafeInteger(payloadByteLength)) {
    throw new NativeGsPlyError('PLY_HEADER_INVALID', 'GS PLY payload exceeds the safe integer range');
  }
  return {
    kind: 'supported-gs',
    facts: { shDegree, splatCount: parsed.vertexCount!, headerByteLength, recordStrideBytes, payloadByteLength },
  };
}

/** Exact, streamed admission for the first ordinary-point production profile. */
export async function inspectNativePointPlyV1(source: RestartableByteSource): Promise<NativePointPlyInspection> {
  const parsed = await parsePlyHeader(source);
  const propertySignature = parsed.vertexProperties.map((property) => `${property.type} ${property.name}`);
  if (parsed.nonVertexElements.some((element) => element.name === 'face' && element.count > 0)) {
    return { kind: 'mesh-ply' };
  }
  if (hasGsMarkers(parsed.vertexProperties.map((property) => property.name))) {
    throw new NativeGsPlyError('PLY_POINT_PROFILE_UNSUPPORTED', 'GS properties are not an ordinary-point profile');
  }
  if (parsed.nonVertexElements.length > 0) {
    throw new NativeGsPlyError('PLY_POINT_PROFILE_UNSUPPORTED', 'Point PLY must contain only one vertex element');
  }
  if (parsed.format !== 'format ascii 1.0' || !sameProperties(propertySignature, POINT_PROPERTIES)) {
    throw new NativeGsPlyError(
      'PLY_POINT_PROFILE_UNSUPPORTED',
      'Point PLY must be ASCII 1.0 with exact float XYZ and uchar RGB properties',
    );
  }
  const facts: NativePointPlyFactsV1 = {
    pointCount: parsed.vertexCount!,
    headerByteLength: parsed.headerByteLength,
    encoding: 'ascii',
  };
  await validateAsciiPointPayload(source, facts);
  return { kind: 'supported-point', facts };
}
