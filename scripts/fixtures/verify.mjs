import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  CANONICAL_GS_EXPECTED_PATH,
  CANONICAL_GS_OUTPUT_PATH,
  inspectPlyFixture,
  verifyGsProfileFixtures,
} from './generate-gs-profile-fixtures.mjs';
import { verifyV1MigrationFixtures } from './generate-v1-migration-fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rootReal = await realpath(root);
const registryFile = resolve(root, 'fixtures', 'registry.json');
const schemaFile = resolve(root, 'fixtures', 'registry.schema.json');
const GS_CANDIDATE_PROFILE_ID = 'lociview-gs-ply-f32le-sh3-1';
const GS_CANDIDATE_SPECIFICATION_PATH = 'docs/g0/gs-source-profile-candidate.md';
const CANDIDATE_EVIDENCE_WARNING = 'Candidate semantic contract is not ratified renderer or device evidence.';
const EXTERNAL_ACQUISITION_WARNING = 'External transport identity requires separate acquisition verification.';

function fail(message) { throw new Error(`fixture registry: ${message}`); }
function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function exactKeys(value, keys, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} keys must be exactly [${expected.join(', ')}], received [${actual.join(', ')}]`);
}
function string(value, label, max = 1024) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail(`${label} must be a non-empty string`);
}
function choice(value, allowed, label) {
  if (!allowed.includes(value)) fail(`${label} must be one of ${allowed.join(', ')}`);
}
function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer`);
}
function vec3(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((n) => !Number.isFinite(n))) fail(`${label} must contain three finite numbers`);
}
function normalizedLogicalPath(value, label) {
  string(value, label, 512);
  if (
    value !== value.normalize('NFC') ||
    value.includes('\\') ||
    value.includes(':') ||
    /[\u0000-\u001f]/u.test(value) ||
    isAbsolute(value)
  ) fail(`${label} must be an NFC, normalized relative path`);
  const segments = value.split('/');
  if (
    segments.some((segment) =>
      segment === '' ||
      segment === '.' ||
      segment === '..' ||
      /[. ]$/u.test(segment) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)
    )
  ) fail(`${label} contains a non-portable path segment`);
  return value.toLowerCase();
}

function repositoryPath(value, label, repositoryRoot = root) {
  normalizedLogicalPath(value, label);
  const absolute = resolve(repositoryRoot, value);
  const fromRoot = relative(repositoryRoot, absolute);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) fail(`${label} escapes the repository`);
  return absolute;
}

async function readRepositoryFile(value, label, repositoryRoot = root) {
  const absolute = repositoryPath(value, label, repositoryRoot);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must resolve to a regular non-link file`);
  const resolved = await realpath(absolute);
  const repositoryReal = repositoryRoot === root ? rootReal : await realpath(repositoryRoot);
  const fromRoot = relative(repositoryReal, resolved);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) fail(`${label} resolves outside the repository`);
  return readFile(resolved);
}

const inheritedNonGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_') && key.toUpperCase() !== 'GCM_INTERACTIVE'),
);
const gitEnvironment = Object.freeze({
  ...inheritedNonGitEnvironment,
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'Never',
  GIT_NO_REPLACE_OBJECTS: '1',
});
const GIT_QUERY_TIMEOUT_MS = 120_000;

function requireTrackedRegularBlob(value, label, repositoryRoot = root) {
  return new Promise((accept, reject) => {
    const safeRoot = repositoryRoot.replaceAll('\\', '/');
    const child = spawn(
      'git',
      ['-c', `safe.directory=${safeRoot}`, '-C', repositoryRoot, '--literal-pathspecs', 'ls-files', '--stage', '-z', '--', value],
      { shell: false, windowsHide: true, env: gitEnvironment, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const chunks = [];
    let bytes = 0;
    let done = false;
    let timer;
    const bad = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      reject(new Error(`fixture registry: ${label} must be one exact tracked regular Git blob`));
    };
    timer = setTimeout(bad, GIT_QUERY_TIMEOUT_MS);
    timer.unref();
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 2048) bad();
      else chunks.push(chunk);
    });
    child.once('error', bad);
    child.once('close', (exitCode) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (exitCode !== 0) {
        reject(new Error(`fixture registry: ${label} must be one exact tracked regular Git blob`));
        return;
      }
      let metadata;
      try { metadata = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); } catch { metadata = ''; }
      const match = /^(100644|100755) ([0-9a-f]{40,64}) 0\t([^\0]+)\0$/u.exec(metadata);
      if (match === null || match[3] !== value) {
        reject(new Error(`fixture registry: ${label} must be one exact tracked regular Git blob`));
        return;
      }
      accept(match[2]);
    });
  });
}

function hashIndexedRegularBlob(objectId, expectedBytes, label, repositoryRoot = root) {
  return new Promise((accept, reject) => {
    const safeRoot = repositoryRoot.replaceAll('\\', '/');
    const child = spawn(
      'git',
      ['-c', `safe.directory=${safeRoot}`, '-C', repositoryRoot, 'cat-file', 'blob', objectId],
      { shell: false, windowsHide: true, env: gitEnvironment, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const hash = createHash('sha256');
    let bytes = 0;
    let done = false;
    const bad = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      reject(new Error(`fixture registry: ${label} must equal its indexed regular Git blob`));
    };
    const timer = setTimeout(bad, GIT_QUERY_TIMEOUT_MS);
    timer.unref();
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (!Number.isSafeInteger(bytes) || bytes > expectedBytes) bad();
      else hash.update(chunk);
    });
    child.once('error', bad);
    child.once('close', (exitCode) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (exitCode !== 0 || bytes !== expectedBytes) {
        reject(new Error(`fixture registry: ${label} must equal its indexed regular Git blob`));
        return;
      }
      accept(hash.digest('hex'));
    });
  });
}

async function readTrackedRepositoryFile(value, label, repositoryRoot = root) {
  normalizedLogicalPath(value, label);
  const objectId = await requireTrackedRegularBlob(value, label, repositoryRoot);
  const bytes = await readRepositoryFile(value, label, repositoryRoot);
  const indexedDigest = await hashIndexedRegularBlob(objectId, bytes.byteLength, label, repositoryRoot);
  if (indexedDigest !== createHash('sha256').update(bytes).digest('hex')) {
    fail(`${label} worktree bytes must equal the indexed regular Git blob`);
  }
  return bytes;
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function sha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
}

function publicHttpsUrl(value, label, { canonical = false, publicTerms = false } = {}) {
  string(value, label, 2048);
  if (/\s/u.test(value)) fail(`${label} must not contain whitespace`);
  let url;
  try { url = new URL(value); } catch { fail(`${label} must be a public HTTPS URL`); }
  if (url.protocol !== 'https:' || url.hostname === '' || url.username !== '' || url.password !== '') {
    fail(`${label} must be a public HTTPS URL without user information`);
  }
  if (canonical && (url.search !== '' || url.hash !== '' || url.href !== value)) {
    fail(`${label} must be a canonical HTTPS URL without a query or fragment`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  if (
    publicTerms &&
    (
      isIP(hostname) !== 0 ||
      !hostname.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion|home|lan)$/iu.test(hostname) ||
      hostname.toLowerCase().endsWith('.home.arpa')
    )
  ) fail(`${label} must use a public terms host, not a local, literal, or special-use host`);
  return url;
}

function fixtureReleaseLocator(value, label) {
  const url = publicHttpsUrl(value, label, { canonical: true });
  const match = /^\/ChoRdChario\/LociView\/releases\/download\/fixtures-v[0-9]+(?:\.[0-9]+)*\/([A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9])?)$/u.exec(url.pathname);
  if (url.hostname !== 'github.com' || match === null || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(match[1])) {
    fail(`${label} must identify a versioned fixture-only LociView GitHub Release asset with a portable asset name`);
  }
  return value;
}

export function validateFixtureRegistrySchema(registry, schema) {
  let validate;
  try {
    validate = new Ajv2020({
      strict: true,
      allErrors: false,
      validateFormats: true,
      allowUnionTypes: false,
      $data: false,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    }).compile(schema);
  } catch {
    fail('trusted registry schema compilation failed');
  }
  if (validate(registry)) return;
  const detail = (validate.errors ?? []).slice(0, 4)
    .map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`)
    .join('; ');
  fail(`registry does not match schema${detail === '' ? '' : `: ${detail}`}`);
}

export async function verifyFixtureLicenseBindings(fixture, label = 'fixture', repositoryRoot = root) {
  const license = fixture.license;
  exactKeys(license, ['spdx', 'reviewStatus', 'licenseUrl', 'licenseText', 'attribution'], `${label}.license`);
  string(license.spdx, `${label}.license.spdx`, 128);
  choice(license.reviewStatus, ['unreviewed', 'approved'], `${label}.license.reviewStatus`);
  if (license.reviewStatus === 'unreviewed') return;

  if (license.licenseUrl !== null) publicHttpsUrl(license.licenseUrl, `${label}.license.licenseUrl`, { canonical: true, publicTerms: true });
  if (license.spdx === 'CC-BY-4.0' && license.licenseUrl !== 'https://creativecommons.org/licenses/by/4.0/') {
    fail(`${label}.license.licenseUrl must use the canonical CC-BY-4.0 terms URL`);
  }
  if (
    license.spdx === 'CC0-1.0' &&
    license.licenseUrl !== null &&
    license.licenseUrl !== 'https://creativecommons.org/publicdomain/zero/1.0/'
  ) fail(`${label}.license.licenseUrl must use the canonical CC0-1.0 terms URL`);
  if (license.licenseText !== null) {
    exactKeys(license.licenseText, ['path', 'sha256'], `${label}.license.licenseText`);
    normalizedLogicalPath(license.licenseText.path, `${label}.license.licenseText.path`);
    sha256(license.licenseText.sha256, `${label}.license.licenseText.sha256`);
    const bytes = await readTrackedRepositoryFile(license.licenseText.path, `${label}.license.licenseText.path`, repositoryRoot);
    const actual = digest(bytes);
    if (actual !== license.licenseText.sha256) {
      fail(`${label}.license.licenseText SHA-256 mismatch: ${actual} != ${license.licenseText.sha256}`);
    }
  }

  const attribution = license.attribution;
  exactKeys(attribution, [
    'creators', 'title', 'creditLine', 'copyrightNotice', 'sourceUrl',
    'licenseNotice', 'disclaimerNotice', 'retainedNotices', 'modified',
    'modificationNotice',
  ], `${label}.license.attribution`);
  if (attribution.sourceUrl !== null) {
    publicHttpsUrl(attribution.sourceUrl, `${label}.license.attribution.sourceUrl`, { publicTerms: true });
  }
}

export function verifyFixturePrivacyBindings(fixture, label = 'fixture') {
  exactKeys(fixture.privacy, ['content', 'personalData', 'anonymization', 'reviewStatus'], `${label}.privacy`);
  choice(fixture.privacy.content, ['synthetic', 'anonymized-derived'], `${label}.privacy.content`);
  choice(fixture.privacy.reviewStatus, ['unreviewed', 'approved'], `${label}.privacy.reviewStatus`);
  if (typeof fixture.privacy.personalData !== 'boolean') fail(`${label}.privacy.personalData must be boolean`);
  if (fixture.privacy.personalData) fail(`${label} contains personal data and cannot enter the registry`);
  string(fixture.privacy.anonymization, `${label}.privacy.anonymization`, 256);
  const provenanceDeclaresDerived = fixture.provenance.kind === 'anonymized-derived';
  const privacyDeclaresDerived = fixture.privacy.content === 'anonymized-derived';
  if (provenanceDeclaresDerived !== privacyDeclaresDerived) {
    fail(`${label} anonymized-derived provenance and privacy declarations must agree`);
  }
  const anonymization = fixture.privacy.anonymization.trim();
  if (
    provenanceDeclaresDerived &&
    (
      fixture.license.reviewStatus !== 'approved' ||
      fixture.privacy.reviewStatus !== 'approved' ||
      anonymization.length < 16 ||
      ['not-applicable', 'none', 'unknown', 'n/a'].includes(anonymization.toLowerCase())
    )
  ) fail(`${label} anonymized-derived data requires approved license/privacy reviews and a substantive anonymization record`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function verifySemanticContract(fixture, label) {
  const contract = fixture.semanticContract;
  if (contract === undefined) return null;
  exactKeys(contract, ['status', 'profileId', 'specification', 'oracle'], `${label}.semanticContract`);
  choice(contract.status, ['candidate', 'ratified'], `${label}.semanticContract.status`);
  if (contract.status === 'ratified') {
    fail(`${label}.semanticContract.status cannot be ratified under registryVersion 2; ratification requires a separate reviewed contract`);
  }
  if (typeof contract.profileId !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,95}$/.test(contract.profileId)) {
    fail(`${label}.semanticContract.profileId is invalid`);
  }

  const contractFiles = [];
  const contractDigests = [];
  for (const name of ['specification', 'oracle']) {
    const binding = contract[name];
    const bindingLabel = `${label}.semanticContract.${name}`;
    exactKeys(binding, ['path', 'sha256'], bindingLabel);
    normalizedLogicalPath(binding.path, `${bindingLabel}.path`);
    sha256(binding.sha256, `${bindingLabel}.sha256`);
    contractFiles.push(binding.path.toLowerCase());
    contractDigests.push(binding.sha256);
    const bytes = await readTrackedRepositoryFile(binding.path, `${bindingLabel}.path`);
    const actual = digest(bytes);
    if (actual !== binding.sha256) fail(`${bindingLabel} SHA-256 mismatch: ${actual} != ${binding.sha256}`);
  }
  if (contractFiles[0] === contractFiles[1] || contractDigests[0] === contractDigests[1]) {
    fail(`${label}.semanticContract specification and oracle must be distinct Git blobs`);
  }

  if (contract.status === 'candidate') {
    object(fixture.expected, `${label}.expected`);
    if (!Array.isArray(fixture.expected.warnings) || !fixture.expected.warnings.includes(CANDIDATE_EVIDENCE_WARNING)) {
      fail(`${label} candidate semantic contract must warn that it is not ratified renderer or device evidence`);
    }
  }
  return contract;
}

export async function verifyGsRegistryBindings(registry) {
  object(registry, 'root');
  if (!Array.isArray(registry.fixtures)) fail('fixtures must be an array');

  const gsFixtures = [];
  let candidateCount = 0;
  let ratifiedCount = 0;
  for (const [index, fixture] of registry.fixtures.entries()) {
    const label = `fixtures[${index}]`;
    object(fixture, label);
    const contract = await verifySemanticContract(fixture, label);
    if (fixture.classification !== 'gaussian-splat') continue;
    if (contract === null) fail(`${label} gaussian-splat fixture requires semanticContract`);

    object(fixture.geometry, `${label}.geometry`);
    for (const name of ['triangleCount', 'ordinaryPointCount', 'splatCount', 'textureCount']) {
      count(fixture.geometry[name], `${label}.geometry.${name}`);
    }
    if (fixture.geometry.triangleCount !== 0 || fixture.geometry.ordinaryPointCount !== 0 || fixture.geometry.splatCount < 1) {
      fail(`${label} gaussian-splat geometry requires zero triangles/ordinary points and at least one splat`);
    }
    object(fixture.storage, `${label}.storage`);
    choice(fixture.storage.tier, ['git', 'generated', 'external'], `${label}.storage.tier`);
    if (fixture.storage.tier === 'generated') {
      fail(`${label} registryVersion 2 gaussian-splat semantic contracts require Git or external transport bytes`);
    }

    let inspection = null;
    if (fixture.storage.tier === 'git') {
      const bytes = new Uint8Array(await readTrackedRepositoryFile(fixture.storage.path, `${label}.storage.path`));
      inspection = inspectPlyFixture(bytes);
      if (inspection.verdict !== 'candidate' || inspection.classification !== 'gaussian-splat') {
        fail(`${label} registered GS bytes inspect as ${inspection.classification}${inspection.code === undefined ? '' : ` (${inspection.code})`}, not gaussian-splat`);
      }
      if (inspection.vertexCount !== fixture.geometry.splatCount) {
        fail(`${label}.geometry.splatCount differs from inspected vertex count`);
      }
      if (!sameJson(inspection.meanBounds, fixture.geometry.bounds)) {
        fail(`${label}.geometry.bounds must equal the inspected Gaussian mean bounds`);
      }
    } else if (!fixture.expected.warnings.includes(EXTERNAL_ACQUISITION_WARNING)) {
      fail(`${label} external GS transport must remain pending separate acquisition verification`);
    }

    if (contract.status === 'candidate') candidateCount += 1;
    else ratifiedCount += 1;
    gsFixtures.push({ fixture, label, contract, inspection });
  }

  let generated;
  try {
    generated = await verifyGsProfileFixtures();
  } catch (error) {
    fail(`canonical GS profile artifacts failed verification: ${error instanceof Error ? error.message : String(error)}`);
  }
  const canonicalMatches = gsFixtures.filter(({ fixture }) => fixture.storage.tier === 'git' && fixture.storage.path === CANONICAL_GS_OUTPUT_PATH);
  if (canonicalMatches.length !== 1) fail(`${CANONICAL_GS_OUTPUT_PATH} must have exactly one gaussian-splat registry entry`);
  const canonical = canonicalMatches[0];
  const { fixture, contract, inspection, label } = canonical;
  if (contract.status !== 'candidate') fail(`${label} canonical preflight contract must remain candidate until product-owner ratification`);
  if (contract.profileId !== GS_CANDIDATE_PROFILE_ID) fail(`${label}.semanticContract.profileId differs from the documented provisional handle`);
  if (contract.specification.path !== GS_CANDIDATE_SPECIFICATION_PATH) fail(`${label}.semanticContract.specification.path differs from the candidate specification`);
  if (contract.oracle.path !== CANONICAL_GS_EXPECTED_PATH) fail(`${label}.semanticContract.oracle.path differs from the deterministic diagnostic oracle`);
  if (fixture.byteSize !== generated.expected.artifact.byteSize || fixture.sha256 !== generated.expected.artifact.sha256) {
    fail(`${label} transport identity differs from the deterministic GS artifact`);
  }
  if (
    fixture.classification !== generated.expected.artifact.classification ||
    fixture.classification !== generated.inspection.classification ||
    inspection?.classification !== generated.inspection.classification
  ) fail(`${label} classification differs from the oracle and independent inspections`);
  if (fixture.geometry.splatCount !== generated.expected.header.count || fixture.geometry.splatCount !== generated.inspection.vertexCount) {
    fail(`${label}.geometry.splatCount differs from the oracle and independent inspection`);
  }
  if (!sameJson(fixture.geometry.bounds, generated.expected.meanBounds) || !sameJson(fixture.geometry.bounds, generated.inspection.meanBounds)) {
    fail(`${label}.geometry.bounds differs from the oracle and independent Gaussian mean bounds`);
  }

  return { fixtureCount: gsFixtures.length, candidateCount, ratifiedCount };
}

let registry;
let schema;
try {
  registry = JSON.parse(await readFile(registryFile, 'utf8'));
  schema = JSON.parse(await readFile(schemaFile, 'utf8'));
} catch (error) {
  fail(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

validateFixtureRegistrySchema(registry, schema);
exactKeys(registry, ['$schema', 'registryVersion', 'fixtures'], 'root');
if (registry.$schema !== './registry.schema.json') fail('$schema must be ./registry.schema.json');
if (registry.registryVersion !== 2) fail('registryVersion must be 2');
if (!Array.isArray(registry.fixtures)) fail('fixtures must be an array');

const classes = ['mesh', 'ordinary-point-cloud', 'gaussian-splat', 'package', 'evidence'];
const ids = new Set();
const paths = new Set();
let checkedBytes = 0;
let pendingEntries = 0;

for (const [index, fixture] of registry.fixtures.entries()) {
  const label = `fixtures[${index}]`;
  const fixtureKeys = ['id', 'storage', 'byteSize', 'sha256', 'mediaType', 'classification', 'geometry', 'coordinates', 'provenance', 'license', 'privacy', 'restore', 'expected'];
  if (fixture.semanticContract !== undefined) fixtureKeys.push('semanticContract');
  exactKeys(fixture, fixtureKeys, label);
  if (typeof fixture.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,95}$/.test(fixture.id)) fail(`${label}.id is invalid`);
  if (ids.has(fixture.id)) fail(`${label}.id duplicates ${fixture.id}`);
  ids.add(fixture.id);

  choice(fixture.storage.tier, ['git', 'generated', 'external'], `${label}.storage.tier`);
  let pathKey;
  if (fixture.storage.tier === 'external') {
    exactKeys(fixture.storage, ['tier', 'transport'], `${label}.storage`);
    exactKeys(fixture.storage.transport, ['kind', 'locator', 'retentionPolicy'], `${label}.storage.transport`);
    if (fixture.storage.transport.kind !== 'github-release-asset') fail(`${label}.storage.transport.kind is unsupported`);
    if (fixture.storage.transport.retentionPolicy !== 'versioned-no-overwrite') fail(`${label}.storage.transport.retentionPolicy is unsupported`);
    pathKey = fixtureReleaseLocator(fixture.storage.transport.locator, `${label}.storage.transport.locator`).toLowerCase();
  } else {
    exactKeys(fixture.storage, ['tier', 'path'], `${label}.storage`);
    pathKey = normalizedLogicalPath(fixture.storage.path, `${label}.storage.path`);
  }
  if (paths.has(pathKey)) fail(`${label}.storage identity has a case/NFC collision`);
  paths.add(pathKey);

  count(fixture.byteSize, `${label}.byteSize`);
  if (typeof fixture.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(fixture.sha256)) fail(`${label}.sha256 is invalid`);
  string(fixture.mediaType, `${label}.mediaType`, 128);
  choice(fixture.classification, classes, `${label}.classification`);

  exactKeys(fixture.geometry, ['triangleCount', 'ordinaryPointCount', 'splatCount', 'textureCount', 'bounds'], `${label}.geometry`);
  for (const name of ['triangleCount', 'ordinaryPointCount', 'splatCount', 'textureCount']) count(fixture.geometry[name], `${label}.geometry.${name}`);
  exactKeys(fixture.geometry.bounds, ['min', 'max'], `${label}.geometry.bounds`);
  vec3(fixture.geometry.bounds.min, `${label}.geometry.bounds.min`);
  vec3(fixture.geometry.bounds.max, `${label}.geometry.bounds.max`);
  for (let axis = 0; axis < 3; axis += 1) if (fixture.geometry.bounds.min[axis] > fixture.geometry.bounds.max[axis]) fail(`${label}.geometry.bounds is inverted`);
  if (fixture.classification === 'ordinary-point-cloud' && fixture.geometry.splatCount !== 0) fail(`${label} ordinary point data must declare splatCount=0`);

  exactKeys(fixture.coordinates, ['handedness', 'upAxis', 'unit'], `${label}.coordinates`);
  choice(fixture.coordinates.handedness, ['right', 'left', 'unspecified'], `${label}.coordinates.handedness`);
  choice(fixture.coordinates.upAxis, ['+X', '+Y', '+Z', 'unspecified'], `${label}.coordinates.upAxis`);
  string(fixture.coordinates.unit, `${label}.coordinates.unit`, 64);

  exactKeys(fixture.provenance, ['kind', 'source', 'reproducibility'], `${label}.provenance`);
  choice(fixture.provenance.kind, ['authored', 'generated', 'anonymized-derived', 'third-party'], `${label}.provenance.kind`);
  string(fixture.provenance.source, `${label}.provenance.source`);
  choice(fixture.provenance.reproducibility, ['pinned-output-only', 'byte-reproducible', 'external-restore'], `${label}.provenance.reproducibility`);

  await verifyFixtureLicenseBindings(fixture, label);
  verifyFixturePrivacyBindings(fixture, label);
  if (fixture.license.reviewStatus === 'approved' && !['CC-BY-4.0', 'CC0-1.0'].includes(fixture.license.spdx)) {
    fail(`${label} approved license must use a registry-v2 supported SPDX identifier`);
  }
  if (
    fixture.storage.tier === 'git' &&
    fixture.provenance.kind === 'third-party' &&
    (fixture.license.reviewStatus !== 'approved' || ['NOASSERTION', 'NONE'].includes(fixture.license.spdx))
  ) fail(`${label} third-party Git data requires an approved redistribution license`);
  if (
    fixture.provenance.kind === 'authored' &&
    (fixture.storage.tier !== 'git' || fixture.provenance.reproducibility !== 'pinned-output-only')
  ) fail(`${label} authored evidence must be a pinned Git fixture`);

  exactKeys(fixture.restore, ['method', 'instructions'], `${label}.restore`);
  choice(fixture.restore.method, ['repository', 'generate', 'external'], `${label}.restore.method`);
  string(fixture.restore.instructions, `${label}.restore.instructions`);
  exactKeys(fixture.expected, ['classification', 'warnings'], `${label}.expected`);
  if (fixture.expected.classification !== fixture.classification) fail(`${label}.expected.classification differs from classification`);
  if (!Array.isArray(fixture.expected.warnings) || fixture.expected.warnings.some((warning) => typeof warning !== 'string' || warning.length > 256)) fail(`${label}.expected.warnings is invalid`);

  if (fixture.storage.tier === 'git') {
    if (fixture.restore.method !== 'repository') fail(`${label} Git storage requires repository restore`);
    const bytes = await readTrackedRepositoryFile(fixture.storage.path, `${label}.storage.path`);
    if (fixture.provenance.kind === 'generated' || fixture.provenance.kind === 'authored') {
      await readTrackedRepositoryFile(fixture.provenance.source, `${label}.provenance.source`);
    }
    if (bytes.byteLength !== fixture.byteSize) fail(`${label} byte size mismatch: ${bytes.byteLength} != ${fixture.byteSize}`);
    const actualDigest = digest(bytes);
    if (actualDigest !== fixture.sha256) fail(`${label} SHA-256 mismatch: ${actualDigest} != ${fixture.sha256}`);
    checkedBytes += bytes.byteLength;
  } else {
    if (fixture.storage.tier === 'generated' && fixture.restore.method !== 'generate') {
      fail(`${label} generated storage requires generate restore`);
    }
    if (fixture.storage.tier === 'external') {
      if (fixture.restore.method !== 'external' || fixture.provenance.reproducibility !== 'external-restore') {
        fail(`${label} external storage requires external restore provenance`);
      }
      if (!fixture.expected.warnings.includes(EXTERNAL_ACQUISITION_WARNING)) {
        fail(`${label} external transport must remain pending separate acquisition verification`);
      }
    }
    pendingEntries += 1;
  }
}

const gsBindings = await verifyGsRegistryBindings(registry);
await verifyV1MigrationFixtures();
console.log(`fixture registry verified: ${registry.fixtures.length - pendingEntries} Git entries, ${checkedBytes} Git bytes; ${pendingEntries} generated/external entries pending local byte verification; ${gsBindings.fixtureCount} GS semantic contract (${gsBindings.candidateCount} candidate, ${gsBindings.ratifiedCount} ratified; candidates are not renderer/device evidence); v1 migration artifacts verified`);
