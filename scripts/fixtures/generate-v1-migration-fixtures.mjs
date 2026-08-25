import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  configure,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js';

configure({ useWebWorkers: false });

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourcePath = 'fixtures/v1-migration/source.v1.json';
const expectedPath = 'fixtures/v1-migration/expected.v1.json';
const captionIdentityExpectedPath = 'fixtures/v1-migration/expected.locimyu-caption-id-2.json';
export const CANONICAL_V1_MIGRATION_OUTPUTS = Object.freeze([
  'fixtures/v1-migration/locimyu-drive-exact-v1.zip',
  'fixtures/v1-migration/native-v1-base.lociview',
  'fixtures/v1-migration/native-v1-branch-a.lociview',
  'fixtures/v1-migration/native-v1-branch-b.lociview',
]);
const CANONICAL_V1_MIGRATION_SOURCES = new Set([
  'public/samples/tri.glb',
]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const fixedDate = new Date(1980, 0, 1, 0, 0, 0, 0);
const knownPrefixes = new Map([
  ['set', 'set'],
  ['caption', 'cap'],
  ['view', 'view'],
  ['material', 'mat'],
  ['asset', 'ast'],
  ['profile', 'usr'],
  ['meta', 'meta'],
]);
const ulid = '[0-7][0123456789ABCDEFGHJKMNPQRSTVWXYZ]{25}';
const actorRe = /^a_[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{13}$/;
const userRe = new RegExp(`^usr_${ulid}$`);
const projectRe = new RegExp(`^prj_${ulid}$`);

function fail(message) {
  throw new Error(`v1 migration fixtures: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactObject(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} has extra or missing members`);
  return value;
}

function isLociMyuTrimCodeUnit(code) {
  return (
    (code >= 0x0009 && code <= 0x000d) ||
    code === 0x0020 ||
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

function lociMyuTrimV1(value) {
  let start = 0;
  let end = value.length;
  while (start < end && isLociMyuTrimCodeUnit(value.charCodeAt(start))) start++;
  while (end > start && isLociMyuTrimCodeUnit(value.charCodeAt(end - 1))) end--;
  return start === 0 && end === value.length ? value : value.slice(start, end);
}

function exactCaptionIdentityString(value, maxScalars, label) {
  if (typeof value !== 'string' || value === '' || lociMyuTrimV1(value) !== value) {
    fail(`${label} is not an exact non-empty LociMyuTrimV1 string`);
  }
  let scalarLength = 0;
  for (let index = 0; index < value.length; index++) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) fail(`${label} contains a lone surrogate`);
      index++;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail(`${label} contains a lone surrogate`);
    }
    scalarLength++;
  }
  if (scalarLength > maxScalars) fail(`${label} exceeds ${maxScalars} Unicode scalars`);
  return value;
}

function restrictedCaptionIdentityJcs(key, label) {
  exactObject(key, ['legacyId', 'occurrence', 'sheetIdentity'], label);
  exactObject(key.sheetIdentity, ['kind', 'value'], `${label}.sheetIdentity`);
  exactCaptionIdentityString(key.legacyId, 128, `${label}.legacyId`);
  if (!Number.isSafeInteger(key.occurrence) || key.occurrence < 0) fail(`${label}.occurrence is invalid`);
  if (key.sheetIdentity.kind !== 'legacyGid' && key.sheetIdentity.kind !== 'sheetName') fail(`${label}.sheetIdentity.kind is invalid`);
  exactCaptionIdentityString(key.sheetIdentity.value, 256, `${label}.sheetIdentity.value`);
  return (
    `{"legacyId":${JSON.stringify(key.legacyId)},` +
    `"occurrence":${JSON.stringify(key.occurrence)},` +
    `"sheetIdentity":{"kind":${JSON.stringify(key.sheetIdentity.kind)},` +
    `"value":${JSON.stringify(key.sheetIdentity.value)}}}`
  );
}

function portableCaptionIdFromDigestHex(fullDigest, label) {
  if (typeof fullDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(fullDigest)) fail(`${label} is not a SHA-256 hex digest`);
  const bytes = Buffer.from(fullDigest, 'hex');
  let value = 0n;
  for (let index = 0; index < 16; index++) value = (value << 8n) | BigInt(bytes[index]);
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let suffix = '';
  for (let index = 0; index < 26; index++) {
    suffix = alphabet[Number(value & 31n)] + suffix;
    value >>= 5n;
  }
  return `cap_${suffix}`;
}

function equalBytes(a, b) {
  return a.byteLength === b.byteLength && a.every((value, index) => value === b[index]);
}

function portablePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) fail(`${label} is invalid`);
  if (value !== value.normalize('NFC') || value.includes('\\') || value.includes(':') || /^[/.]/u.test(value) || /[\u0000-\u001f]/u.test(value)) {
    fail(`${label} is not a normalized relative path`);
  }
  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.' || segment === '..' || /[. ]$/u.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)) {
      fail(`${label} contains a non-portable segment`);
    }
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

async function readRepositoryRegularFile(value, label, repositoryRoot = root) {
  const absolute = repositoryPath(value, label, repositoryRoot);
  const parentRelative = relative(repositoryRoot, dirname(absolute));
  let cursor = repositoryRoot;
  for (const segment of parentRelative.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    const parentStat = await lstat(cursor);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) fail(`${label} parent must be a directory and not a link`);
  }
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-link file`);
  const [repositoryReal, resolved] = await Promise.all([realpath(repositoryRoot), realpath(absolute)]);
  if (!inside(repositoryReal, resolved)) fail(`${label} resolves outside the repository`);
  return new Uint8Array(await readFile(resolved));
}

export function validateApprovedFixtureSource(value, label = 'sourcePath') {
  portablePath(value, label);
  if (!CANONICAL_V1_MIGRATION_SOURCES.has(value)) fail(`${label} is not an approved fixture source`);
  return value;
}

export async function readApprovedFixtureSource(value, label = 'sourcePath', repositoryRoot = root) {
  return readRepositoryRegularFile(validateApprovedFixtureSource(value, label), label, repositoryRoot);
}

export function validateCanonicalOutputPaths(source) {
  const actual = [
    source?.locimyu?.output,
    source?.native?.outputs?.base,
    source?.native?.outputs?.branchA,
    source?.native?.outputs?.branchB,
  ];
  if (JSON.stringify(actual) !== JSON.stringify(CANONICAL_V1_MIGRATION_OUTPUTS)) {
    fail(`output paths must be exactly ${CANONICAL_V1_MIGRATION_OUTPUTS.join(', ')}`);
  }
  return actual;
}

export async function safeOutputDestination(value, label, repositoryRoot = root) {
  const absolute = repositoryPath(value, label, repositoryRoot);
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
  try {
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} target must be a regular non-link file`);
  } catch (error) {
    if (!(error !== null && typeof error === 'object' && error.code === 'ENOENT')) throw error;
  }
  return absolute;
}

function sortedEntries(entries, label) {
  const seen = new Set();
  for (const entry of entries) {
    portablePath(entry.path, `${label}.${entry.path}`);
    const key = entry.path.normalize('NFC').toLocaleLowerCase('en-US');
    if (seen.has(key)) fail(`${label} has a path collision at ${entry.path}`);
    seen.add(key);
    if (!(entry.data instanceof Uint8Array)) fail(`${label}.${entry.path} has invalid bytes`);
  }
  return [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.path, 'utf8'), Buffer.from(b.path, 'utf8')));
}

async function deterministicZip(entries, label) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    level: 0,
    extendedTimestamp: false,
    dataDescriptor: false,
    dataDescriptorSignature: false,
    useWebWorkers: false,
  });
  for (const entry of sortedEntries(entries, label)) {
    await writer.add(entry.path, new Uint8ArrayReader(entry.data), {
      lastModDate: fixedDate,
      level: 0,
      extendedTimestamp: false,
      dataDescriptor: false,
      dataDescriptorSignature: false,
      useWebWorkers: false,
    });
  }
  return writer.close({ preventClose: false });
}

function esc(value) {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

function columnName(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function numericCell(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && typeof value.number === 'string';
}

async function makeXlsx(sheets, label) {
  const shared = [];
  const sharedIndex = new Map();
  const sheetXmls = [];
  for (const [sheetIndex, sheet] of sheets.entries()) {
    if (typeof sheet.name !== 'string' || !Array.isArray(sheet.rows)) fail(`${label}.sheets[${sheetIndex}] is invalid`);
    let rowsXml = '';
    sheet.rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) fail(`${label}.${sheet.name}.rows[${rowIndex}] is invalid`);
      let cellsXml = '';
      row.forEach((cell, columnIndex) => {
        const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
        if (cell === '') return;
        if (numericCell(cell)) {
          if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:E[+-]?\d+)?$/u.test(cell.number)) fail(`${label}.${ref} numeric source is invalid`);
          cellsXml += `<c r="${ref}"><v>${cell.number}</v></c>`;
          return;
        }
        if (typeof cell !== 'string') fail(`${label}.${ref} must be a string or numeric cell`);
        let index = sharedIndex.get(cell);
        if (index === undefined) {
          index = shared.length;
          shared.push(cell);
          sharedIndex.set(cell, index);
        }
        cellsXml += `<c r="${ref}" t="s"><v>${index}</v></c>`;
      });
      rowsXml += `<row r="${rowIndex + 1}">${cellsXml}</row>`;
    });
    sheetXmls.push(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`);
  }
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${esc(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`;
  const sharedXml = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((value) => `<si><t>${esc(value)}</t></si>`).join('')}</sst>`;
  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>';
  return deterministicZip([
    { path: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { path: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(rels) },
    { path: 'xl/sharedStrings.xml', data: encoder.encode(sharedXml) },
    ...sheetXmls.map((xml, index) => ({ path: `xl/worksheets/sheet${index + 1}.xml`, data: encoder.encode(xml) })),
  ], label);
}

async function materialize(spec, label) {
  portablePath(spec.path, `${label}.path`);
  const sources = ['sourcePath', 'base64', 'utf8'].filter((key) => Object.hasOwn(spec, key));
  if (sources.length !== 1) fail(`${label} must have exactly one byte source`);
  if (spec.sourcePath !== undefined) {
    return { path: spec.path, data: await readApprovedFixtureSource(spec.sourcePath, `${label}.sourcePath`) };
  }
  if (spec.base64 !== undefined) return { path: spec.path, data: new Uint8Array(Buffer.from(spec.base64, 'base64')) };
  return { path: spec.path, data: encoder.encode(spec.utf8) };
}

function validateOperation(operation, label) {
  const required = operation.t === 'delete'
    ? ['op', 'hlc', 'actor', 'user', 't', 'e', 'id']
    : ['op', 'hlc', 'actor', 'user', 't', 'e', 'id', 'v'];
  const actual = Object.keys(operation).sort();
  if (JSON.stringify(actual) !== JSON.stringify(required.sort())) fail(`${label} has extra or missing top-level members`);
  if (!Number.isSafeInteger(operation.op) || operation.op < 1) fail(`${label}.op is invalid`);
  if (!actorRe.test(operation.actor)) fail(`${label}.actor is noncanonical`);
  if (operation.user !== '' && !userRe.test(operation.user)) fail(`${label}.user is noncanonical`);
  const escapedActor = operation.actor.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  if (!new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z-[0-9a-f]{4}-${escapedActor}$`).test(operation.hlc)) fail(`${label}.hlc is noncanonical`);
  if (new Date(operation.hlc.slice(0, 24)).toISOString() !== operation.hlc.slice(0, 24)) fail(`${label}.hlc timestamp does not round-trip`);
  const prefix = knownPrefixes.get(operation.e);
  if (prefix !== undefined && !new RegExp(`^${prefix}_${ulid}$`).test(operation.id)) fail(`${label}.id is noncanonical for ${operation.e}`);
  if (operation.t !== 'create' && operation.t !== 'update' && operation.t !== 'delete') fail(`${label}.t is invalid`);
  if (operation.t !== 'delete' && (operation.v === null || typeof operation.v !== 'object' || Array.isArray(operation.v))) fail(`${label}.v is invalid`);
  return operation;
}

function logFile(entries, label) {
  const sequences = new Map();
  const lines = entries.map((entry, index) => {
    const line = Object.hasOwn(entry, 'rawLine') ? entry.rawLine : JSON.stringify(entry);
    if (typeof line !== 'string' || line.includes('\n') || line.includes('\r')) fail(`${label}[${index}] raw line is invalid`);
    let operation;
    try { operation = JSON.parse(line); } catch { fail(`${label}[${index}] is not JSON`); }
    validateOperation(operation, `${label}[${index}]`);
    const previous = sequences.get(operation.actor) ?? 0;
    if (operation.op !== previous + 1) fail(`${label}[${index}] sequence is not contiguous`);
    sequences.set(operation.actor, operation.op);
    return line;
  });
  if (sequences.size !== 1) fail(`${label} must contain exactly one actor per log file`);
  return { actor: [...sequences.keys()][0], text: `${lines.join('\n')}\n` };
}

async function zipInventory(bytes) {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  try {
    const entries = (await reader.getEntries()).filter((entry) => !entry.directory);
    const out = [];
    for (const entry of entries) {
      const data = await entry.getData(new Uint8ArrayWriter());
      out.push({ path: entry.filename, byteSize: data.byteLength, sha256: sha256(data) });
    }
    return out.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  } finally {
    await reader.close().catch(() => {});
  }
}

async function exactZipEntryBytes(bytes, expectedPath, label) {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  try {
    const matches = (await reader.getEntries()).filter((entry) => !entry.directory && entry.filename === expectedPath);
    if (matches.length !== 1) fail(`${label} must contain exactly one ${expectedPath}`);
    const data = await matches[0].getData(new Uint8ArrayWriter());
    return data;
  } finally {
    await reader.close().catch(() => {});
  }
}

async function buildArtifacts(source) {
  if (source.$schema !== 'lociview.synthetic-v1-migration-source' || source.version !== 1) fail('source identity is invalid');
  if (!projectRe.test(source.native.manifest.projectId)) fail('native manifest projectId is noncanonical');

  const primary = await makeXlsx(source.locimyu.primary.sheets, 'locimyu.primary');
  const backup = await makeXlsx(source.locimyu.backup.sheets, 'locimyu.backup');
  const driveEntries = [
    { path: source.locimyu.primary.path, data: primary },
    { path: source.locimyu.backup.path, data: backup },
    ...await Promise.all(source.locimyu.entries.map((entry, index) => materialize(entry, `locimyu.entries[${index}]`))),
  ];
  const locimyu = await deterministicZip(driveEntries, 'locimyu outer ZIP');

  const baseLog = logFile(source.native.baseLog, 'native.baseLog');
  const branchALog = logFile(source.native.branchALog, 'native.branchALog');
  const branchBLog = logFile(source.native.branchBLog, 'native.branchBLog');
  const common = await Promise.all(source.native.sharedBinaries.map((entry, index) => materialize(entry, `native.sharedBinaries[${index}]`)));
  const onlyA = await Promise.all(source.native.branchABinaries.map((entry, index) => materialize(entry, `native.branchABinaries[${index}]`)));
  const onlyB = await Promise.all(source.native.branchBBinaries.map((entry, index) => materialize(entry, `native.branchBBinaries[${index}]`)));
  const staleSnapshot = encoder.encode(JSON.stringify({ schemaVersion: 1, vector: {}, state: { byKind: {} }, marker: 'STALE CACHE MUST NOT WIN' }));
  const staleCsv = encoder.encode('\ufeffcaptionId,title\r\ncap_00000000000000000000000000,STALE CACHE MUST NOT WIN\r\n');
  const manifest = encoder.encode(JSON.stringify(source.native.manifest, null, 2));
  const basePackageEntries = [
    { path: 'lociview.json', data: manifest },
    { path: `ops/${baseLog.actor}.jsonl`, data: encoder.encode(baseLog.text) },
    { path: 'snapshot.json', data: staleSnapshot },
    { path: 'captions.csv', data: staleCsv },
    ...common,
  ];
  const base = await deterministicZip(basePackageEntries, 'native base package');
  const branchA = await deterministicZip([
    ...basePackageEntries,
    { path: `ops/${branchALog.actor}.jsonl`, data: encoder.encode(branchALog.text) },
    ...onlyA,
  ], 'native branch A package');
  const branchB = await deterministicZip([
    ...basePackageEntries,
    { path: `ops/${branchBLog.actor}.jsonl`, data: encoder.encode(branchBLog.text) },
    ...onlyB,
  ], 'native branch B package');

  const artifacts = new Map([
    [source.locimyu.output, locimyu],
    [source.native.outputs.base, base],
    [source.native.outputs.branchA, branchA],
    [source.native.outputs.branchB, branchB],
  ]);
  for (const [path, bytes] of artifacts) {
    if (bytes.byteLength > source.limits.maxOuterBytes) fail(`${path} exceeds maxOuterBytes`);
    const inventory = await zipInventory(bytes);
    if (inventory.length > source.limits.maxEntries) fail(`${path} exceeds maxEntries`);
    if (inventory.some((entry) => entry.byteSize > source.limits.maxEntryBytes)) fail(`${path} has an oversized entry`);
    if (inventory.reduce((sum, entry) => sum + entry.byteSize, 0) > source.limits.maxExpandedBytes) fail(`${path} exceeds maxExpandedBytes`);
  }
  return {
    artifacts,
    baseText: baseLog.text,
    branchAText: branchALog.text,
    branchBText: branchBLog.text,
  };
}

async function validateExpected(expected, source, built) {
  if (expected.$schema !== 'lociview.synthetic-v1-migration-expected' || expected.version !== 1) fail('expected oracle identity is invalid');
  if (expected.native.projectId !== source.native.manifest.projectId) fail('expected projectId differs from source');
  if (expected.locimyu.migratedState === null || typeof expected.locimyu.migratedState !== 'object') fail('expected LociMyu migratedState is required');
  if (
    !Array.isArray(expected.native.baseState) ||
    !Array.isArray(expected.native.branchAState) ||
    !Array.isArray(expected.native.branchBState) ||
    !Array.isArray(expected.native.convergedState)
  ) fail('expected native base/branchA/branchB/converged states are required');
  if (expected.native.rawProbe.line !== source.native.baseLog.find((entry) => Object.hasOwn(entry, 'rawLine'))?.rawLine) fail('expected raw probe differs from authored source');
  const numericGid = expected.locimyu.numericGidEvidence;
  const numericCells = source.locimyu.primary.sheets.flatMap((sheet) => sheet.rows.flat()).filter(numericCell);
  if (!numericCells.some((cell) => cell.number === numericGid.raw) || String(Number(numericGid.raw)) !== numericGid.normalized) {
    fail('expected numeric GID evidence differs from the authored workbook source');
  }
  const actualArtifacts = [];
  for (const [path, bytes] of built.artifacts) {
    actualArtifacts.push({ path, byteSize: bytes.byteLength, sha256: sha256(bytes), entries: await zipInventory(bytes) });
  }
  actualArtifacts.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  if (JSON.stringify(actualArtifacts) !== JSON.stringify(expected.transport.artifacts)) fail('expected transport inventory is stale');
}

async function validateCaptionIdentityExpected(identityExpected, historicalExpected, source, built) {
  exactObject(
    identityExpected,
    ['$schema', 'version', 'recipeId', 'preimagePrefix', 'source', 'vectors', 'fixtureCaptions'],
    'caption identity expected',
  );
  if (
    identityExpected.$schema !== 'lociview.synthetic-locimyu-caption-id-expected' ||
    identityExpected.version !== 1 ||
    identityExpected.recipeId !== 'locimyu-caption-id-2' ||
    identityExpected.preimagePrefix !== 'lociview:v1:locimyu-caption-id:2:jcs-v1\n'
  ) fail('caption identity expected identity is invalid');

  const sourceBinding = exactObject(
    identityExpected.source,
    ['transportPath', 'transportSha256', 'selectedWorkbookPath', 'selectedWorkbookSha256'],
    'caption identity expected.source',
  );
  if (sourceBinding.transportPath !== source.locimyu.output) fail('caption identity transport path differs from source');
  if (sourceBinding.selectedWorkbookPath !== source.locimyu.primary.path) fail('caption identity workbook path differs from source');
  const transport = built.artifacts.get(sourceBinding.transportPath);
  if (transport === undefined || sha256(transport) !== sourceBinding.transportSha256) fail('caption identity transport hash is stale');
  const workbook = await exactZipEntryBytes(
    transport,
    sourceBinding.selectedWorkbookPath,
    'caption identity transport',
  );
  if (sha256(workbook) !== sourceBinding.selectedWorkbookSha256) fail('caption identity workbook hash is stale');

  if (!Array.isArray(identityExpected.vectors) || identityExpected.vectors.length !== 6) fail('caption identity expected must contain six vectors');
  const expectedVectorIds = [
    'synthetic-a',
    'synthetic-b',
    'duplicate-a-0',
    'duplicate-a-1',
    'duplicate-b-0',
    'unicode',
  ];
  const vectorIds = [];
  const vectorsById = new Map();
  const preimages = new Set();
  const captionIds = new Set();
  for (const [index, vector] of identityExpected.vectors.entries()) {
    const label = `caption identity expected.vectors[${index}]`;
    exactObject(vector, ['vectorId', 'identityKey', 'fullDigest', 'captionId'], label);
    if (typeof vector.vectorId !== 'string' || vectorsById.has(vector.vectorId)) fail(`${label}.vectorId is invalid or duplicated`);
    const canonicalKey = restrictedCaptionIdentityJcs(vector.identityKey, `${label}.identityKey`);
    const preimage = `${identityExpected.preimagePrefix}${canonicalKey}`;
    const actualDigest = sha256(encoder.encode(preimage));
    if (vector.fullDigest !== actualDigest) fail(`${label}.fullDigest does not match its exact preimage`);
    if (vector.captionId !== portableCaptionIdFromDigestHex(actualDigest, `${label}.fullDigest`)) fail(`${label}.captionId does not match its digest`);
    if (!/^cap_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u.test(vector.captionId)) fail(`${label}.captionId is noncanonical`);
    if (preimages.has(preimage) || captionIds.has(vector.captionId)) fail(`${label} duplicates another vector identity`);
    preimages.add(preimage);
    captionIds.add(vector.captionId);
    vectorIds.push(vector.vectorId);
    vectorsById.set(vector.vectorId, vector);
  }
  if (JSON.stringify(vectorIds) !== JSON.stringify(expectedVectorIds)) fail('caption identity vector IDs/order are invalid');

  if (!Array.isArray(identityExpected.fixtureCaptions) || identityExpected.fixtureCaptions.length !== 2) {
    fail('caption identity expected must bind exactly two historical fixture captions');
  }
  const boundHistoricalIds = new Set();
  for (const [index, binding] of identityExpected.fixtureCaptions.entries()) {
    const label = `caption identity expected.fixtureCaptions[${index}]`;
    exactObject(binding, ['setName', 'historicalCaptionId', 'vectorId'], label);
    if (typeof binding.setName !== 'string' || binding.setName === '') fail(`${label}.setName is invalid`);
    if (!/^cap_LM[0-9A-HJKMNP-TV-Z]{24}$/u.test(binding.historicalCaptionId)) fail(`${label}.historicalCaptionId is invalid`);
    if (!vectorsById.has(binding.vectorId)) fail(`${label}.vectorId is unknown`);
    if (boundHistoricalIds.has(binding.historicalCaptionId)) fail(`${label}.historicalCaptionId is duplicated`);
    const historicalSet = historicalExpected.locimyu.sets.find((candidate) => candidate.name === binding.setName);
    if (!historicalSet?.captions.some((caption) => caption.captionId === binding.historicalCaptionId)) {
      fail(`${label} does not match the historical expected oracle`);
    }
    boundHistoricalIds.add(binding.historicalCaptionId);
  }
  const historicalIds = historicalExpected.locimyu.sets
    .flatMap((set) => set.captions.map((caption) => caption.captionId))
    .sort();
  if (JSON.stringify([...boundHistoricalIds].sort()) !== JSON.stringify(historicalIds)) {
    fail('caption identity fixture bindings do not cover the historical Caption IDs exactly');
  }
}

export async function verifyV1MigrationFixtures({ write = false } = {}) {
  const source = JSON.parse(decoder.decode(await readRepositoryRegularFile(sourcePath, 'source.v1.json')));
  validateCanonicalOutputPaths(source);
  const first = await buildArtifacts(source);
  const second = await buildArtifacts(source);
  for (const [path, bytes] of first.artifacts) {
    const repeated = second.artifacts.get(path);
    if (repeated === undefined || !equalBytes(bytes, repeated)) fail(`${path} is not byte-deterministic across two builds`);
  }
  if (write) {
    for (const [path, bytes] of first.artifacts) {
      await writeFile(await safeOutputDestination(path, `${path} output`), bytes);
    }
  } else {
    for (const [path, bytes] of first.artifacts) {
      let checked;
      try {
        checked = await readRepositoryRegularFile(path, `${path} checked artifact`);
      } catch (error) {
        if (error !== null && typeof error === 'object' && error.code === 'ENOENT') fail(`${path} is missing; run generator with --write intentionally`);
        throw error;
      }
      if (!equalBytes(bytes, checked)) fail(`${path} differs from the deterministic source`);
    }
  }
  let expected;
  try { expected = JSON.parse(decoder.decode(await readRepositoryRegularFile(expectedPath, 'expected.v1.json'))); } catch (error) {
    fail(`expected.v1.json is missing or invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  let captionIdentityExpected;
  try {
    captionIdentityExpected = JSON.parse(decoder.decode(
      await readRepositoryRegularFile(captionIdentityExpectedPath, 'expected.locimyu-caption-id-2.json'),
    ));
  } catch (error) {
    fail(`expected.locimyu-caption-id-2.json is missing or invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  await validateExpected(expected, source, first);
  await validateCaptionIdentityExpected(captionIdentityExpected, expected, source, first);
  return { source, expected, captionIdentityExpected, ...first };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--write') || args.filter((arg) => arg === '--write').length > 1) fail('usage: node scripts/fixtures/generate-v1-migration-fixtures.mjs [--write]');
  const result = await verifyV1MigrationFixtures({ write: args.includes('--write') });
  console.log(`v1 migration fixtures ${args.includes('--write') ? 'written' : 'verified'}: ${result.artifacts.size} artifacts`);
}
