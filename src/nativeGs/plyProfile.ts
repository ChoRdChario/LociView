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

export type NativePlyInspection =
  | { readonly kind: 'supported-gs'; readonly facts: NativeGsPlyFactsV1 }
  | { readonly kind: 'ordinary-ply' };

export type NativeGsPlyErrorCode =
  | 'PLY_HEADER_INVALID'
  | 'PLY_HEADER_LIMIT'
  | 'PLY_STREAM_FAILED'
  | 'PLY_GS_PROFILE_UNSUPPORTED'
  | 'PLY_PAYLOAD_TRUNCATED'
  | 'PLY_TRAILING_BYTES';

export class NativeGsPlyError extends Error {
  constructor(readonly code: NativeGsPlyErrorCode, message: string) {
    super(message);
    this.name = 'NativeGsPlyError';
  }
}

const MAX_HEADER_BYTES = 64 * 1024;
const ASCII_DECODER = new TextDecoder('utf-8', { fatal: true });

function numbered(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

const COMMON_PREFIX = Object.freeze([
  'x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2',
]);
const COMMON_SUFFIX = Object.freeze(['opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']);
const SH2_PROPERTIES = Object.freeze([...COMMON_PREFIX, ...numbered('f_rest_', 24), ...COMMON_SUFFIX]);
const SH3_PROPERTIES = Object.freeze([...COMMON_PREFIX, ...numbered('f_rest_', 45), ...COMMON_SUFFIX]);

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

/**
 * Structural production admission for the first Graphdeco PLY path.
 * It reads only the bounded header; payload values are not rescanned.
 */
export async function inspectNativeGsPlyV1(source: RestartableByteSource): Promise<NativePlyInspection> {
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
  let insideVertex = false;
  let extraElement = false;
  const properties: string[] = [];
  for (const line of lines.slice(1, -2)) {
    if (line === '' || line.startsWith('comment ') || line.startsWith('obj_info ')) continue;
    if (line.startsWith('format ')) {
      if (format !== null) throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY format is duplicated');
      format = line;
      continue;
    }
    if (line.startsWith('element ')) {
      const match = /^element vertex ([0-9]+)$/.exec(line);
      if (match === null) {
        extraElement = true;
        insideVertex = false;
        continue;
      }
      if (vertexCount !== null) throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY vertex element is duplicated');
      const parsed = Number(match[1]);
      if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new NativeGsPlyError('PLY_HEADER_INVALID', 'PLY vertex count must be a positive safe integer');
      }
      vertexCount = parsed;
      insideVertex = true;
      continue;
    }
    if (line.startsWith('property ')) {
      if (!insideVertex) {
        extraElement = true;
        continue;
      }
      const match = /^property float ([A-Za-z0-9_]+)$/.exec(line);
      if (match === null) {
        properties.push(`!unsupported:${line}`);
      } else {
        properties.push(match[1]!);
      }
      continue;
    }
    throw new NativeGsPlyError('PLY_HEADER_INVALID', `Unsupported PLY header directive: ${line}`);
  }

  if (!hasGsMarkers(properties)) return { kind: 'ordinary-ply' };
  if (format !== 'format binary_little_endian 1.0' || vertexCount === null || extraElement) {
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

  const headerByteLength = headerBytes.byteLength;
  const payloadBig = BigInt(vertexCount) * BigInt(recordStrideBytes);
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
    facts: { shDegree, splatCount: vertexCount, headerByteLength, recordStrideBytes, payloadByteLength },
  };
}
