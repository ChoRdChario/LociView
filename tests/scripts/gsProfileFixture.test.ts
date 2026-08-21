import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error The fixture generator is a checked ESM script without a declaration file.
import * as fixtureGenerator from '../../scripts/fixtures/generate-gs-profile-fixtures.mjs';

const {
  CANONICAL_GS_EXPECTED_PATH,
  CANONICAL_GS_OUTPUT_PATH,
  CANONICAL_GS_SOURCE_PATH,
  GS_PLY_FLOATS_PER_SPLAT,
  GS_PLY_PROPERTY_NAMES,
  GS_PLY_STRIDE_BYTES,
  buildGsProfileArtifacts,
  inspectPlyFixture,
  validateCanonicalGsSource,
  verifyGsProfileFixtures,
} = fixtureGenerator;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

interface SourceSplat {
  label: string;
  mean: number[];
  normal: number[];
  shDc: number[];
  shRest: Record<string, number>;
  opacityLogit: number;
  logScale: number[];
  rotationWxyz: number[];
}

interface SourceOracle {
  schemaVersion: number;
  output: string;
  description: string;
  splats: SourceSplat[];
}

interface ExpectedRow {
  index: number;
  label: string;
  float32BitsHex: string[];
}

interface DerivedRow {
  index: number;
  label: string;
  mean: number[];
  normal: number[];
  shDc: number[];
  nonZeroShRest: Array<{ index: number; value: number }>;
  opacityLogit: number;
  sigmoidOpacity: number;
  logScale: number[];
  expScale: number[];
  rotationWxyz: number[];
  normalizedRotationWxyz: number[];
  dcColorLinearUnclamped: number[];
}

interface ExpectedOracle {
  oracleVersion: number;
  sourcePath: string;
  artifact: { path: string; byteSize: number; sha256: string; classification: string };
  header: {
    magic: string;
    encoding: string;
    version: string;
    headerByteLength: number;
    element: string;
    count: number;
    propertyType: string;
    propertyNames: string[];
    floatsPerSplat: number;
    strideBytes: number;
    payloadByteLength: number;
    trailingByteLength: number;
    lines: string[];
  };
  meanBounds: { min: number[]; max: number[] };
  rawRows: ExpectedRow[];
  derivedRows: DerivedRow[];
  limitations: {
    formatProfile: string;
    supportBounds: string;
    sphericalHarmonicViewTransform: string;
    renderingGuarantee: string;
  };
}

let source: SourceOracle;
let expected: ExpectedOracle;
let exactBytes: Uint8Array;
let ordinaryBytes: Uint8Array;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8')) as T;
}

async function readBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve(repositoryRoot, path)));
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function replaceAsciiSameLength(bytes: Uint8Array, from: string, to: string): Uint8Array {
  expect(to.length).toBe(from.length);
  const copy = cloneBytes(bytes);
  const sourceNeedle = Buffer.from(from, 'ascii');
  const index = Buffer.from(copy).indexOf(sourceNeedle);
  expect(index).toBeGreaterThanOrEqual(0);
  copy.set(Buffer.from(to, 'ascii'), index);
  return copy;
}

function joinHeaderAndPayload(headerText: string, payload: Uint8Array): Uint8Array {
  const header = new TextEncoder().encode(headerText);
  const result = new Uint8Array(header.byteLength + payload.byteLength);
  result.set(header);
  result.set(payload, header.byteLength);
  return result;
}

function ordinaryMesh(extraFaceProperty?: string): Uint8Array {
  return new TextEncoder().encode([
    'ply',
    'format ascii 1.0',
    'element vertex 3',
    'property float x',
    'property float y',
    'property float z',
    'element face 1',
    'property list uchar int vertex_indices',
    ...(extraFaceProperty === undefined ? [] : [extraFaceProperty]),
    'end_header',
    '0 0 0',
    '1 0 0',
    '0 1 0',
    '3 0 1 2',
    '',
  ].join('\n'));
}

beforeAll(async () => {
  [source, expected, exactBytes, ordinaryBytes] = await Promise.all([
    readJson<SourceOracle>(CANONICAL_GS_SOURCE_PATH),
    readJson<ExpectedOracle>(CANONICAL_GS_EXPECTED_PATH),
    readBytes(CANONICAL_GS_OUTPUT_PATH),
    readBytes('public/samples/points.ply'),
  ]);
});

describe('G0 GS profile golden fixture', () => {
  it('rebuilds both canonical artifacts twice with byte-identical output', async () => {
    const first = buildGsProfileArtifacts(source);
    const second = buildGsProfileArtifacts(source);

    expect([...first.artifacts.keys()]).toEqual([CANONICAL_GS_OUTPUT_PATH, CANONICAL_GS_EXPECTED_PATH]);
    for (const [path, bytes] of first.artifacts as Map<string, Uint8Array>) {
      expect(Buffer.from(bytes).equals(Buffer.from(second.artifacts.get(path) as Uint8Array))).toBe(true);
      expect(Buffer.from(bytes).equals(Buffer.from(await readBytes(path)))).toBe(true);
    }

    await expect(verifyGsProfileFixtures()).resolves.toMatchObject({
      inspection: { verdict: 'candidate', classification: 'gaussian-splat', vertexCount: 8 },
    });
  });

  it('pins the exact binary little-endian SH3 layout and transport digest', () => {
    expect(expected).toMatchObject({
      oracleVersion: 1,
      sourcePath: CANONICAL_GS_SOURCE_PATH,
      artifact: {
        path: CANONICAL_GS_OUTPUT_PATH,
        byteSize: exactBytes.byteLength,
        sha256: digest(exactBytes),
        classification: 'gaussian-splat',
      },
      header: {
        magic: 'ply',
        encoding: 'binary_little_endian',
        version: '1.0',
        element: 'vertex',
        count: source.splats.length,
        propertyType: 'float',
        propertyNames: [...GS_PLY_PROPERTY_NAMES],
        floatsPerSplat: 62,
        strideBytes: 248,
        payloadByteLength: source.splats.length * 248,
        trailingByteLength: 0,
      },
      meanBounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    });
    expect(GS_PLY_PROPERTY_NAMES).toHaveLength(62);
    expect(GS_PLY_FLOATS_PER_SPLAT).toBe(62);
    expect(GS_PLY_STRIDE_BYTES).toBe(248);
    expect(expected.header.headerByteLength + expected.header.payloadByteLength).toBe(exactBytes.byteLength);
    expect(expected.header.lines.at(-1)).toBe('end_header');
  });

  it('binds every raw float32 bit pattern and derives diagnostics from decoded bytes', () => {
    const payload = new DataView(
      exactBytes.buffer,
      exactBytes.byteOffset + expected.header.headerByteLength,
      expected.header.payloadByteLength,
    );
    expect(expected.rawRows).toHaveLength(source.splats.length);
    expect(expected.derivedRows).toHaveLength(source.splats.length);

    expected.rawRows.forEach((row, rowIndex) => {
      expect(row).toMatchObject({ index: rowIndex, label: source.splats[rowIndex]?.label });
      expect(row.float32BitsHex).toHaveLength(62);
      row.float32BitsHex.forEach((bits, propertyIndex) => {
        const actual = payload.getUint32(rowIndex * 248 + propertyIndex * 4, true).toString(16).padStart(8, '0');
        expect(bits).toBe(actual);
      });

      const values: number[] = GS_PLY_PROPERTY_NAMES.map((_name: string, propertyIndex: number) => (
        payload.getFloat32(rowIndex * 248 + propertyIndex * 4, true)
      ));
      const derived = expected.derivedRows[rowIndex];
      expect(derived?.mean).toEqual(values.slice(0, 3));
      expect(derived?.normal).toEqual(values.slice(3, 6));
      expect(derived?.shDc).toEqual(values.slice(6, 9));
      expect(derived?.opacityLogit).toBe(values[54]);
      expect(derived?.sigmoidOpacity).toBeCloseTo(1 / (1 + Math.exp(-(values[54] as number))), 15);
      expect(derived?.logScale).toEqual(values.slice(55, 58));
      derived?.expScale.forEach((value, index) => expect(value).toBeCloseTo(Math.exp(values[55 + index] as number), 15));

      const rotation = values.slice(58, 62);
      const norm = Math.sqrt(rotation.reduce((sum, value) => sum + value * value, 0));
      derived?.normalizedRotationWxyz.forEach((value, index) => expect(value).toBeCloseTo((rotation[index] as number) / norm, 15));
      const normalizedNorm = Math.sqrt((derived?.normalizedRotationWxyz ?? []).reduce((sum, value) => sum + value * value, 0));
      expect(normalizedNorm).toBeCloseTo(1, 15);
    });
  });

  it('classifies the existing ordinary PLY separately from the exact GS candidate', () => {
    expect(inspectPlyFixture(ordinaryBytes)).toMatchObject({
      verdict: 'candidate',
      classification: 'ordinary-point-cloud',
      format: 'ascii',
      vertexCount: 20_000,
      validationScope: 'header-classification-only',
    });
    expect(inspectPlyFixture(exactBytes)).toMatchObject({
      verdict: 'candidate',
      classification: 'gaussian-splat',
      profileStatus: 'candidate-not-ratified',
      format: 'binary_little_endian',
      vertexCount: 8,
      strideBytes: 248,
      payloadByteLength: 1_984,
      meanBounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      supportBounds: 'not-ratified-not-computed',
      renderingGuarantee: 'none',
    });
  });

  it('marks partial GS property sets unsupported without treating them as ordinary points', () => {
    const partial = replaceAsciiSameLength(exactBytes, 'property float rot_3', 'property float rot_x');
    expect(inspectPlyFixture(partial)).toMatchObject({
      verdict: 'unsupported',
      classification: 'unsupported',
      code: 'PLY_GS_SCHEMA_UNSUPPORTED',
    });
  });

  it('parses an ordinary mesh face list without admitting GS markers from another element', () => {
    expect(inspectPlyFixture(ordinaryMesh())).toMatchObject({
      verdict: 'candidate',
      classification: 'mesh',
      format: 'ascii',
      vertexCount: 3,
      validationScope: 'header-classification-only',
    });
    expect(inspectPlyFixture(ordinaryMesh('property float opacity'))).toMatchObject({
      verdict: 'unsupported',
      classification: 'unsupported',
      code: 'PLY_GS_SCHEMA_UNSUPPORTED',
    });
  });

  it('keeps list/extra elements and CRLF headers outside the exact GS candidate', () => {
    const header = new TextDecoder().decode(exactBytes.subarray(0, expected.header.headerByteLength));
    const payload = exactBytes.subarray(expected.header.headerByteLength);
    const withFaceList = joinHeaderAndPayload(
      header.replace('end_header\n', 'element face 0\nproperty list uchar int vertex_indices\nend_header\n'),
      payload,
    );
    expect(inspectPlyFixture(withFaceList)).toMatchObject({
      verdict: 'unsupported',
      classification: 'unsupported',
      code: 'PLY_GS_ELEMENTS_UNSUPPORTED',
    });

    const withCrlf = joinHeaderAndPayload(header.replaceAll('\n', '\r\n'), payload);
    expect(inspectPlyFixture(withCrlf)).toMatchObject({
      verdict: 'unsupported',
      classification: 'unsupported',
      code: 'PLY_GS_LINE_ENDING_UNSUPPORTED',
    });
  });

  it.each([
    ['malformed magic', () => replaceAsciiSameLength(exactBytes, 'ply\n', 'plx\n'), 'PLY_MAGIC'],
    ['truncated payload', () => exactBytes.subarray(0, exactBytes.byteLength - 1), 'PLY_PAYLOAD_TRUNCATED'],
    ['trailing byte', () => {
      const bytes = new Uint8Array(exactBytes.byteLength + 1);
      bytes.set(exactBytes);
      return bytes;
    }, 'PLY_TRAILING_BYTES'],
    ['NaN payload', () => {
      const bytes = cloneBytes(exactBytes);
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(expected.header.headerByteLength, 0x7fc00000, true);
      return bytes;
    }, 'PLY_NONFINITE'],
    ['zero quaternion', () => {
      const bytes = cloneBytes(exactBytes);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let index = 58; index < 62; index += 1) view.setFloat32(expected.header.headerByteLength + index * 4, 0, true);
      return bytes;
    }, 'PLY_ZERO_QUATERNION'],
    ['bounded count limit', () => {
      const header = new TextDecoder().decode(exactBytes.subarray(0, expected.header.headerByteLength));
      return new TextEncoder().encode(header.replace('element vertex 8', 'element vertex 4000001'));
    }, 'PLY_VERTEX_COUNT_LIMIT'],
    ['safe integer count overflow', () => {
      const header = new TextDecoder().decode(exactBytes.subarray(0, expected.header.headerByteLength));
      return new TextEncoder().encode(header.replace('element vertex 8', 'element vertex 9007199254740992'));
    }, 'PLY_VERTEX_COUNT_OVERFLOW'],
  ])('rejects %s safely', (_label, mutate, code) => {
    expect(inspectPlyFixture(mutate())).toMatchObject({
      verdict: 'reject',
      classification: 'unsupported',
      code,
    });
  });

  it('does not claim finite support bounds, SH view transforms, or rendering conformance before ratification', () => {
    expect(expected.limitations).toEqual({
      formatProfile: 'candidate-not-ratified',
      supportBounds: 'not-ratified-not-computed',
      sphericalHarmonicViewTransform: 'not-ratified-not-computed',
      renderingGuarantee: 'none',
    });
    expect(expected).not.toHaveProperty('supportBounds');
    expect(expected).not.toHaveProperty('renderedImage');
  });

  it('keeps the output path fixed and rejects source shape expansion', () => {
    expect(validateCanonicalGsSource(source).output).toBe(CANONICAL_GS_OUTPUT_PATH);
    expect(() => validateCanonicalGsSource({ ...source, output: '../outside.ply' })).toThrow(/source\.output must be exactly/u);
    expect(() => validateCanonicalGsSource({ ...source, splats: source.splats.slice(0, 7) })).toThrow(/8 to 12/u);
    expect(() => validateCanonicalGsSource({ ...source, unexpected: true })).toThrow(/keys must be exactly/u);
    const opacityUnderflow = source.splats.map((splat, index) => (
      index === 0 ? { ...splat, opacityLogit: -1e-50 } : splat
    ));
    expect(() => validateCanonicalGsSource({ ...source, splats: opacityUnderflow })).toThrow(/canonical finite float32/u);
    const shUnderflow = source.splats.map((splat, index) => (
      index === 0 ? { ...splat, shRest: { ...splat.shRest, 0: -1e-50 } } : splat
    ));
    expect(() => validateCanonicalGsSource({ ...source, splats: shUnderflow })).toThrow(/canonical finite float32/u);
  });
});
