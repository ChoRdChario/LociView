import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const CANONICAL_GS_SOURCE_PATH = 'fixtures/gs/source.v1.json';
export const CANONICAL_GS_EXPECTED_PATH = 'fixtures/gs/expected.v1.json';
export const CANONICAL_GS_OUTPUT_PATH = 'fixtures/gs/profile-golden-sh3-v1.ply';

export const GS_PLY_PROPERTY_NAMES = Object.freeze([
  'x', 'y', 'z',
  'nx', 'ny', 'nz',
  'f_dc_0', 'f_dc_1', 'f_dc_2',
  ...Array.from({ length: 45 }, (_unused, index) => `f_rest_${index}`),
  'opacity',
  'scale_0', 'scale_1', 'scale_2',
  'rot_0', 'rot_1', 'rot_2', 'rot_3',
]);
export const GS_PLY_STRIDE_BYTES = GS_PLY_PROPERTY_NAMES.length * 4;
export const GS_PLY_FLOATS_PER_SPLAT = GS_PLY_PROPERTY_NAMES.length;

const SH_C0 = 0.28209479177387814;
const DEFAULT_LIMITS = Object.freeze({
  maxHeaderBytes: 64 * 1024,
  maxVertexCount: 4_000_000,
  maxPayloadBytes: 1_000_000_000,
});
const PLY_SCALAR_TYPES = new Set([
  'char', 'uchar', 'short', 'ushort', 'int', 'uint', 'float', 'double',
  'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'float32', 'float64',
]);
const PLY_LIST_COUNT_TYPES = new Set([
  'char', 'uchar', 'short', 'ushort', 'int', 'uint',
  'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32',
]);
const GS_PROPERTY_PATTERN = /^(?:f_dc_|f_rest_|opacity$|scale_|rot_)/u;

function fail(message) {
  throw new Error(`GS profile fixtures: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function equalBytes(a, b) {
  return a.byteLength === b.byteLength && a.every((value, index) => value === b[index]);
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} keys must be exactly [${expected.join(', ')}], received [${actual.join(', ')}]`);
  }
}

function portablePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) fail(`${label} is invalid`);
  if (
    value !== value.normalize('NFC') ||
    value.includes('\\') ||
    value.includes(':') ||
    /^[/.]/u.test(value) ||
    /[\u0000-\u001f]/u.test(value)
  ) fail(`${label} is not a normalized relative path`);
  for (const segment of value.split('/')) {
    if (
      segment === '' || segment === '.' || segment === '..' || /[. ]$/u.test(segment) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)
    ) fail(`${label} contains a non-portable segment`);
  }
  return value;
}

function inside(rootPath, candidatePath) {
  const fromRoot = relative(rootPath, candidatePath);
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function repositoryPath(value, label, repositoryRoot) {
  portablePath(value, label);
  const absolute = resolve(repositoryRoot, value);
  if (!inside(repositoryRoot, absolute)) fail(`${label} escapes the repository`);
  return absolute;
}

async function assertSafeParent(absolute, label, repositoryRoot) {
  const repositoryReal = await realpath(repositoryRoot);
  const parentRelative = relative(repositoryRoot, dirname(absolute));
  let cursor = repositoryRoot;
  for (const segment of parentRelative.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    const stat = await lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} parent must be a directory and not a link`);
  }
  const parentReal = await realpath(dirname(absolute));
  if (!inside(repositoryReal, parentReal)) fail(`${label} parent resolves outside the repository`);
}

async function readRepositoryRegularFile(value, label, repositoryRoot = root) {
  const absolute = repositoryPath(value, label, repositoryRoot);
  await assertSafeParent(absolute, label, repositoryRoot);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-link file`);
  const [repositoryReal, resolved] = await Promise.all([realpath(repositoryRoot), realpath(absolute)]);
  if (!inside(repositoryReal, resolved)) fail(`${label} resolves outside the repository`);
  return new Uint8Array(await readFile(resolved));
}

async function safeOutputDestination(value, label, repositoryRoot = root) {
  const absolute = repositoryPath(value, label, repositoryRoot);
  await assertSafeParent(absolute, label, repositoryRoot);
  try {
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} target must be a regular non-link file`);
  } catch (error) {
    if (!(error !== null && typeof error === 'object' && error.code === 'ENOENT')) throw error;
  }
  return absolute;
}

function finiteArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} must contain exactly ${length} numbers`);
  return value.map((number, index) => {
    if (!Number.isFinite(number) || Object.is(number, -0)) fail(`${label}[${index}] must be finite and must not be negative zero`);
    const float32 = Math.fround(number);
    if (!Number.isFinite(float32) || Object.is(float32, -0)) fail(`${label}[${index}] cannot be represented as canonical finite float32`);
    return number;
  });
}

export function validateCanonicalGsSource(source) {
  exactKeys(source, ['schemaVersion', 'output', 'description', 'splats'], 'source');
  if (source.schemaVersion !== 1) fail('source.schemaVersion must be 1');
  if (source.output !== CANONICAL_GS_OUTPUT_PATH) fail(`source.output must be exactly ${CANONICAL_GS_OUTPUT_PATH}`);
  if (typeof source.description !== 'string' || source.description.length < 1 || source.description.length > 512) {
    fail('source.description is invalid');
  }
  if (!Array.isArray(source.splats) || source.splats.length < 8 || source.splats.length > 12) {
    fail('source.splats must contain 8 to 12 manually auditable splats');
  }
  const labels = new Set();
  source.splats.forEach((splat, index) => {
    const label = `source.splats[${index}]`;
    exactKeys(splat, ['label', 'mean', 'normal', 'shDc', 'shRest', 'opacityLogit', 'logScale', 'rotationWxyz'], label);
    if (typeof splat.label !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/u.test(splat.label) || labels.has(splat.label)) {
      fail(`${label}.label is invalid or duplicated`);
    }
    labels.add(splat.label);
    finiteArray(splat.mean, 3, `${label}.mean`);
    finiteArray(splat.normal, 3, `${label}.normal`);
    finiteArray(splat.shDc, 3, `${label}.shDc`);
    finiteArray(splat.logScale, 3, `${label}.logScale`);
    const rotation = finiteArray(splat.rotationWxyz, 4, `${label}.rotationWxyz`);
    const normSquared = rotation.reduce((sum, component) => sum + Math.fround(component) ** 2, 0);
    if (!Number.isFinite(normSquared) || normSquared === 0) fail(`${label}.rotationWxyz must have a non-zero finite norm`);
    if (
      !Number.isFinite(splat.opacityLogit) || Object.is(splat.opacityLogit, -0) ||
      !Number.isFinite(Math.fround(splat.opacityLogit)) || Object.is(Math.fround(splat.opacityLogit), -0)
    ) {
      fail(`${label}.opacityLogit must be canonical finite float32`);
    }
    if (splat.shRest === null || typeof splat.shRest !== 'object' || Array.isArray(splat.shRest)) fail(`${label}.shRest must be an object`);
    for (const [key, value] of Object.entries(splat.shRest)) {
      if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) > 44) fail(`${label}.shRest.${key} is outside 0..44`);
      if (
        !Number.isFinite(value) || Object.is(value, -0) ||
        !Number.isFinite(Math.fround(value)) || Object.is(Math.fround(value), -0)
      ) {
        fail(`${label}.shRest.${key} must be canonical finite float32`);
      }
    }
  });
  return source;
}

function expandSplat(splat) {
  const shRest = Array(45).fill(0);
  for (const [index, value] of Object.entries(splat.shRest)) shRest[Number(index)] = value;
  const row = [
    ...splat.mean,
    ...splat.normal,
    ...splat.shDc,
    ...shRest,
    splat.opacityLogit,
    ...splat.logScale,
    ...splat.rotationWxyz,
  ];
  if (row.length !== GS_PLY_FLOATS_PER_SPLAT) fail(`expanded ${splat.label} to ${row.length} values instead of ${GS_PLY_FLOATS_PER_SPLAT}`);
  return row;
}

function canonicalHeader(vertexCount) {
  return [
    'ply',
    'format binary_little_endian 1.0',
    'comment LociView deterministic synthetic SH3 profile golden v1',
    `element vertex ${vertexCount}`,
    ...GS_PLY_PROPERTY_NAMES.map((name) => `property float ${name}`),
    'end_header',
    '',
  ].join('\n');
}

function buildPly(source) {
  const rows = source.splats.map(expandSplat);
  const headerText = canonicalHeader(rows.length);
  const headerBytes = encoder.encode(headerText);
  const bytes = new Uint8Array(headerBytes.byteLength + rows.length * GS_PLY_STRIDE_BYTES);
  bytes.set(headerBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  rows.forEach((row, rowIndex) => {
    row.forEach((value, propertyIndex) => {
      view.setFloat32(headerBytes.byteLength + rowIndex * GS_PLY_STRIDE_BYTES + propertyIndex * 4, value, true);
    });
  });
  return { bytes, headerText, headerByteLength: headerBytes.byteLength, rows };
}

class PlyInspectionFailure extends Error {
  constructor(verdict, code, message) {
    super(message);
    this.verdict = verdict;
    this.code = code;
  }
}

function reject(code, message) {
  throw new PlyInspectionFailure('reject', code, message);
}

function unsupported(code, message) {
  throw new PlyInspectionFailure('unsupported', code, message);
}

function headerLines(bytes, maximum) {
  let lineStart = 0;
  let hasCarriageReturn = false;
  const lines = [];
  const searchLimit = Math.min(bytes.byteLength, maximum);
  for (let index = 0; index < searchLimit; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    let lineEnd = index;
    if (lineEnd > lineStart && bytes[lineEnd - 1] === 0x0d) {
      hasCarriageReturn = true;
      lineEnd -= 1;
    }
    let line;
    try { line = decoder.decode(bytes.subarray(lineStart, lineEnd)); } catch { reject('PLY_HEADER_ENCODING', 'PLY header is not valid UTF-8'); }
    if (!/^[\x20-\x7e]*$/u.test(line)) reject('PLY_HEADER_ASCII', 'PLY header contains non-ASCII or control characters');
    lines.push(line);
    lineStart = index + 1;
    if (line === 'end_header') return { lines, headerByteLength: index + 1, hasCarriageReturn };
  }
  if (bytes.byteLength >= maximum) reject('PLY_HEADER_LIMIT', `PLY header exceeds ${maximum} bytes`);
  reject('PLY_HEADER_TERMINATOR', 'PLY header has no complete end_header line');
}

function parseHeader(lines) {
  if (lines[0] !== 'ply') reject('PLY_MAGIC', 'PLY magic is missing');
  const formatMatch = /^format (ascii|binary_little_endian|binary_big_endian) (1\.0)$/u.exec(lines[1] ?? '');
  if (formatMatch === null) reject('PLY_FORMAT', 'PLY format declaration is malformed or unsupported');
  const elements = [];
  let current = null;
  for (const line of lines.slice(2, -1)) {
    if (line.startsWith('comment ') || line.startsWith('obj_info ')) continue;
    const elementMatch = /^element ([A-Za-z_][A-Za-z0-9_]*) ([0-9]+)$/u.exec(line);
    if (elementMatch !== null) {
      if (elements.some((element) => element.name === elementMatch[1])) reject('PLY_DUPLICATE_ELEMENT', `duplicate PLY element ${elementMatch[1]}`);
      current = { name: elementMatch[1], countText: elementMatch[2], properties: [] };
      elements.push(current);
      continue;
    }
    const listPropertyMatch = /^property list ([a-z0-9]+) ([a-z0-9]+) ([A-Za-z_][A-Za-z0-9_]*)$/u.exec(line);
    if (listPropertyMatch !== null) {
      if (current === null) reject('PLY_PROPERTY_CONTEXT', 'PLY property appears before an element');
      if (!PLY_LIST_COUNT_TYPES.has(listPropertyMatch[1])) {
        reject('PLY_PROPERTY_TYPE', `unsupported PLY list count type ${listPropertyMatch[1]}`);
      }
      if (!PLY_SCALAR_TYPES.has(listPropertyMatch[2])) {
        reject('PLY_PROPERTY_TYPE', `unsupported PLY list item type ${listPropertyMatch[2]}`);
      }
      if (current.properties.some((property) => property.name === listPropertyMatch[3])) {
        reject('PLY_DUPLICATE_PROPERTY', `duplicate PLY property ${listPropertyMatch[3]}`);
      }
      current.properties.push({
        type: 'list',
        countType: listPropertyMatch[1],
        itemType: listPropertyMatch[2],
        name: listPropertyMatch[3],
      });
      continue;
    }
    const propertyMatch = /^property ([a-z0-9]+) ([A-Za-z_][A-Za-z0-9_]*)$/u.exec(line);
    if (propertyMatch !== null) {
      if (current === null) reject('PLY_PROPERTY_CONTEXT', 'PLY property appears before an element');
      if (!PLY_SCALAR_TYPES.has(propertyMatch[1])) reject('PLY_PROPERTY_TYPE', `unsupported PLY scalar type ${propertyMatch[1]}`);
      if (current.properties.some((property) => property.name === propertyMatch[2])) reject('PLY_DUPLICATE_PROPERTY', `duplicate PLY property ${propertyMatch[2]}`);
      current.properties.push({ type: propertyMatch[1], name: propertyMatch[2] });
      continue;
    }
    reject('PLY_HEADER_LINE', `malformed PLY header line: ${line.slice(0, 80)}`);
  }
  return { format: formatMatch[1], version: formatMatch[2], elements };
}

function boundedVertexCount(vertex, limits) {
  if (vertex === undefined) unsupported('PLY_VERTEX_MISSING', 'PLY has no vertex element');
  let count;
  try { count = BigInt(vertex.countText); } catch { reject('PLY_VERTEX_COUNT', 'PLY vertex count is invalid'); }
  if (count > BigInt(Number.MAX_SAFE_INTEGER)) reject('PLY_VERTEX_COUNT_OVERFLOW', 'PLY vertex count exceeds safe integer range');
  if (count > BigInt(limits.maxVertexCount)) reject('PLY_VERTEX_COUNT_LIMIT', `PLY vertex count exceeds ${limits.maxVertexCount}`);
  return Number(count);
}

function exactGsProperties(properties) {
  return properties.length === GS_PLY_PROPERTY_NAMES.length && properties.every((property, index) => (
    property.type === 'float' && property.name === GS_PLY_PROPERTY_NAMES[index]
  ));
}

function inspectExactGsPayload(bytes, headerByteLength, vertexCount, limits) {
  if (vertexCount === 0) reject('PLY_GS_EMPTY', 'GS PLY must contain at least one splat');
  const payloadBytes = BigInt(vertexCount) * BigInt(GS_PLY_STRIDE_BYTES);
  if (payloadBytes > BigInt(limits.maxPayloadBytes)) reject('PLY_PAYLOAD_LIMIT', `PLY payload exceeds ${limits.maxPayloadBytes} bytes`);
  const expectedLength = BigInt(headerByteLength) + payloadBytes;
  if (BigInt(bytes.byteLength) < expectedLength) reject('PLY_PAYLOAD_TRUNCATED', 'GS PLY payload is truncated');
  if (BigInt(bytes.byteLength) > expectedLength) reject('PLY_TRAILING_BYTES', 'GS PLY has trailing bytes');
  const view = new DataView(bytes.buffer, bytes.byteOffset + headerByteLength, Number(payloadBytes));
  const meanBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let row = 0; row < vertexCount; row += 1) {
    const base = row * GS_PLY_STRIDE_BYTES;
    for (let property = 0; property < GS_PLY_FLOATS_PER_SPLAT; property += 1) {
      const value = view.getFloat32(base + property * 4, true);
      if (!Number.isFinite(value)) reject('PLY_NONFINITE', `GS PLY row ${row} property ${GS_PLY_PROPERTY_NAMES[property]} is non-finite`);
      if (property < 3) {
        meanBounds.min[property] = Math.min(meanBounds.min[property], value);
        meanBounds.max[property] = Math.max(meanBounds.max[property], value);
      }
    }
    let normSquared = 0;
    for (let property = 58; property < 62; property += 1) {
      const value = view.getFloat32(base + property * 4, true);
      normSquared += value * value;
    }
    if (!Number.isFinite(normSquared) || normSquared === 0) reject('PLY_ZERO_QUATERNION', `GS PLY row ${row} has a zero or invalid quaternion`);
  }
  return { payloadByteLength: Number(payloadBytes), meanBounds };
}

export function inspectPlyFixture(input, options = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array();
  const limits = { ...DEFAULT_LIMITS, ...options };
  try {
    if (!(input instanceof Uint8Array)) reject('PLY_INPUT', 'PLY inspector requires Uint8Array input');
    for (const [key, value] of Object.entries(limits)) {
      if (!Number.isSafeInteger(value) || value < 1) reject('PLY_LIMITS', `${key} must be a positive safe integer`);
    }
    const header = headerLines(bytes, limits.maxHeaderBytes);
    const parsed = parseHeader(header.lines);
    const vertex = parsed.elements.find((element) => element.name === 'vertex');
    const vertexCount = boundedVertexCount(vertex, limits);
    const propertyNames = vertex.properties.map((property) => property.name);
    const hasGsMarkers = parsed.elements.some((element) => (
      element.properties.some((property) => GS_PROPERTY_PATTERN.test(property.name))
    ));
    if (!exactGsProperties(vertex.properties)) {
      if (hasGsMarkers) unsupported('PLY_GS_SCHEMA_UNSUPPORTED', 'PLY contains partial or noncanonical GS properties');
      const hasPosition = ['x', 'y', 'z'].every((name) => propertyNames.includes(name));
      if (!hasPosition) unsupported('PLY_CONTENT_UNSUPPORTED', 'PLY vertex data is neither ordinary XYZ points nor the exact GS profile');
      const face = parsed.elements.find((element) => element.name === 'face');
      const classification = face !== undefined && BigInt(face.countText) > 0n ? 'mesh' : 'ordinary-point-cloud';
      return {
        verdict: 'candidate',
        classification,
        format: parsed.format,
        version: parsed.version,
        headerByteLength: header.headerByteLength,
        vertexCount,
        propertyNames,
        validationScope: 'header-classification-only',
      };
    }
    if (parsed.format !== 'binary_little_endian') {
      unsupported('PLY_GS_ENCODING_UNSUPPORTED', 'exact GS properties require binary_little_endian encoding');
    }
    if (header.hasCarriageReturn) unsupported('PLY_GS_LINE_ENDING_UNSUPPORTED', 'exact GS profile requires LF header line endings');
    if (parsed.elements.length !== 1) unsupported('PLY_GS_ELEMENTS_UNSUPPORTED', 'exact GS profile permits only the vertex element');
    const payload = inspectExactGsPayload(bytes, header.headerByteLength, vertexCount, limits);
    return {
      verdict: 'candidate',
      classification: 'gaussian-splat',
      profileStatus: 'candidate-not-ratified',
      format: parsed.format,
      version: parsed.version,
      headerByteLength: header.headerByteLength,
      vertexCount,
      propertyNames,
      strideBytes: GS_PLY_STRIDE_BYTES,
      payloadByteLength: payload.payloadByteLength,
      meanBounds: payload.meanBounds,
      supportBounds: 'not-ratified-not-computed',
      renderingGuarantee: 'none',
    };
  } catch (error) {
    if (error instanceof PlyInspectionFailure) {
      return { verdict: error.verdict, classification: 'unsupported', code: error.code, message: error.message };
    }
    return { verdict: 'reject', classification: 'unsupported', code: 'PLY_INSPECTOR_FAILURE', message: 'PLY inspection failed safely' };
  }
}

function rawRowsFromBytes(bytes, headerByteLength, source) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + headerByteLength, bytes.byteLength - headerByteLength);
  return source.splats.map((splat, rowIndex) => ({
    index: rowIndex,
    label: splat.label,
    float32BitsHex: GS_PLY_PROPERTY_NAMES.map((_name, propertyIndex) => (
      view.getUint32(rowIndex * GS_PLY_STRIDE_BYTES + propertyIndex * 4, true).toString(16).padStart(8, '0')
    )),
  }));
}

function decodedRowsFromBytes(bytes, headerByteLength, source) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + headerByteLength, bytes.byteLength - headerByteLength);
  return source.splats.map((splat, rowIndex) => {
    const values = GS_PLY_PROPERTY_NAMES.map((_name, propertyIndex) => (
      view.getFloat32(rowIndex * GS_PLY_STRIDE_BYTES + propertyIndex * 4, true)
    ));
    const rotation = values.slice(58, 62);
    const rotationNorm = Math.sqrt(rotation.reduce((sum, component) => sum + component * component, 0));
    return {
      index: rowIndex,
      label: splat.label,
      mean: values.slice(0, 3),
      normal: values.slice(3, 6),
      shDc: values.slice(6, 9),
      nonZeroShRest: values.slice(9, 54)
        .map((value, index) => ({ index, value }))
        .filter((entry) => entry.value !== 0),
      opacityLogit: values[54],
      sigmoidOpacity: 1 / (1 + Math.exp(-values[54])),
      logScale: values.slice(55, 58),
      expScale: values.slice(55, 58).map((value) => Math.exp(value)),
      rotationWxyz: rotation,
      normalizedRotationWxyz: rotation.map((component) => component / rotationNorm),
      dcColorLinearUnclamped: values.slice(6, 9).map((value) => 0.5 + SH_C0 * value),
    };
  });
}

function buildExpected(source, ply) {
  const inspection = inspectPlyFixture(ply.bytes);
  if (inspection.verdict !== 'candidate' || inspection.classification !== 'gaussian-splat') {
    fail(`generated PLY failed independent inspection: ${inspection.code ?? inspection.classification}`);
  }
  return {
    oracleVersion: 1,
    sourcePath: CANONICAL_GS_SOURCE_PATH,
    artifact: {
      path: CANONICAL_GS_OUTPUT_PATH,
      byteSize: ply.bytes.byteLength,
      sha256: sha256(ply.bytes),
      classification: 'gaussian-splat',
    },
    header: {
      magic: 'ply',
      encoding: 'binary_little_endian',
      version: '1.0',
      headerByteLength: ply.headerByteLength,
      element: 'vertex',
      count: source.splats.length,
      propertyType: 'float',
      propertyNames: [...GS_PLY_PROPERTY_NAMES],
      floatsPerSplat: GS_PLY_FLOATS_PER_SPLAT,
      strideBytes: GS_PLY_STRIDE_BYTES,
      payloadByteLength: source.splats.length * GS_PLY_STRIDE_BYTES,
      trailingByteLength: 0,
      lines: ply.headerText.slice(0, -1).split('\n'),
    },
    meanBounds: inspection.meanBounds,
    rawRows: rawRowsFromBytes(ply.bytes, ply.headerByteLength, source),
    derivedRows: decodedRowsFromBytes(ply.bytes, ply.headerByteLength, source),
    limitations: {
      formatProfile: 'candidate-not-ratified',
      supportBounds: 'not-ratified-not-computed',
      sphericalHarmonicViewTransform: 'not-ratified-not-computed',
      renderingGuarantee: 'none',
    },
  };
}

function expectedBytes(expected) {
  return encoder.encode(`${JSON.stringify(expected, null, 2)}\n`);
}

export function buildGsProfileArtifacts(sourceInput) {
  const source = validateCanonicalGsSource(structuredClone(sourceInput));
  const ply = buildPly(source);
  const expected = buildExpected(source, ply);
  return {
    source,
    expected,
    artifacts: new Map([
      [CANONICAL_GS_OUTPUT_PATH, ply.bytes],
      [CANONICAL_GS_EXPECTED_PATH, expectedBytes(expected)],
    ]),
  };
}

async function checkedSource(repositoryRoot) {
  let parsed;
  try {
    parsed = JSON.parse(decoder.decode(await readRepositoryRegularFile(CANONICAL_GS_SOURCE_PATH, 'GS source', repositoryRoot)));
  } catch (error) {
    fail(`GS source is missing or invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateCanonicalGsSource(parsed);
}

export async function verifyGsProfileFixtures({ write = false, repositoryRoot = root } = {}) {
  const source = await checkedSource(repositoryRoot);
  const first = buildGsProfileArtifacts(source);
  const second = buildGsProfileArtifacts(source);
  for (const [path, bytes] of first.artifacts) {
    const repeated = second.artifacts.get(path);
    if (repeated === undefined || !equalBytes(bytes, repeated)) fail(`${path} is not byte-deterministic across two builds`);
  }
  if (write) {
    const destinations = new Map();
    for (const path of first.artifacts.keys()) destinations.set(path, await safeOutputDestination(path, `${path} output`, repositoryRoot));
    for (const [path, bytes] of first.artifacts) await writeFile(destinations.get(path), bytes);
  }
  for (const [path, bytes] of first.artifacts) {
    let checked;
    try { checked = await readRepositoryRegularFile(path, `${path} checked artifact`, repositoryRoot); } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') fail(`${path} is missing; run generator with --write intentionally`);
      throw error;
    }
    if (!equalBytes(bytes, checked)) fail(`${path} differs from its deterministic source`);
  }
  const checkedPly = await readRepositoryRegularFile(CANONICAL_GS_OUTPUT_PATH, 'checked GS PLY', repositoryRoot);
  const inspection = inspectPlyFixture(checkedPly);
  if (inspection.verdict !== 'candidate' || inspection.classification !== 'gaussian-splat') {
    fail(`checked GS PLY failed inspection: ${inspection.code ?? inspection.classification}`);
  }
  return { ...first, inspection };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--write') || args.filter((arg) => arg === '--write').length > 1) {
    fail('usage: node scripts/fixtures/generate-gs-profile-fixtures.mjs [--write]');
  }
  const write = args.includes('--write');
  const result = await verifyGsProfileFixtures({ write });
  console.log(`GS profile fixtures ${write ? 'written' : 'verified'}: ${result.inspection.vertexCount} splats, ${result.inspection.payloadByteLength} payload bytes`);
}
