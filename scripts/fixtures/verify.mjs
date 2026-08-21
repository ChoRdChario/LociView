import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
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

function repositoryPath(value, label) {
  normalizedLogicalPath(value, label);
  const absolute = resolve(root, value);
  const fromRoot = relative(root, absolute);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) fail(`${label} escapes the repository`);
  return absolute;
}

async function readRepositoryFile(value, label) {
  const absolute = repositoryPath(value, label);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must resolve to a regular non-link file`);
  const resolved = await realpath(absolute);
  const fromRoot = relative(rootReal, resolved);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) fail(`${label} resolves outside the repository`);
  return readFile(resolved);
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function sha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
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
    fail(`${label}.semanticContract.status cannot be ratified under registryVersion 1; ratification requires a reviewed schema/version update`);
  }
  if (typeof contract.profileId !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,95}$/.test(contract.profileId)) {
    fail(`${label}.semanticContract.profileId is invalid`);
  }

  const contractFiles = [];
  for (const name of ['specification', 'oracle']) {
    const binding = contract[name];
    const bindingLabel = `${label}.semanticContract.${name}`;
    exactKeys(binding, ['path', 'sha256'], bindingLabel);
    normalizedLogicalPath(binding.path, `${bindingLabel}.path`);
    sha256(binding.sha256, `${bindingLabel}.sha256`);
    contractFiles.push(binding.path.toLowerCase());
    const bytes = await readRepositoryFile(binding.path, `${bindingLabel}.path`);
    const actual = digest(bytes);
    if (actual !== binding.sha256) fail(`${bindingLabel} SHA-256 mismatch: ${actual} != ${binding.sha256}`);
  }
  if (contractFiles[0] === contractFiles[1]) fail(`${label}.semanticContract specification and oracle must be distinct files`);

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
    if (fixture.storage.tier !== 'git') {
      fail(`${label} registryVersion 1 gaussian-splat semantic contracts require Git-tier bytes for inspection`);
    }

    const bytes = new Uint8Array(await readRepositoryFile(fixture.storage.path, `${label}.storage.path`));
    const inspection = inspectPlyFixture(bytes);
    if (inspection.verdict !== 'candidate' || inspection.classification !== 'gaussian-splat') {
      fail(`${label} registered GS bytes inspect as ${inspection.classification}${inspection.code === undefined ? '' : ` (${inspection.code})`}, not gaussian-splat`);
    }
    if (inspection.vertexCount !== fixture.geometry.splatCount) {
      fail(`${label}.geometry.splatCount differs from inspected vertex count`);
    }
    if (!sameJson(inspection.meanBounds, fixture.geometry.bounds)) {
      fail(`${label}.geometry.bounds must equal the inspected Gaussian mean bounds`);
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
  const canonicalMatches = gsFixtures.filter(({ fixture }) => fixture.storage.path === CANONICAL_GS_OUTPUT_PATH);
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
try {
  registry = JSON.parse(await readFile(registryFile, 'utf8'));
  JSON.parse(await readFile(schemaFile, 'utf8'));
} catch (error) {
  fail(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

exactKeys(registry, ['$schema', 'registryVersion', 'fixtures'], 'root');
if (registry.$schema !== './registry.schema.json') fail('$schema must be ./registry.schema.json');
if (registry.registryVersion !== 1) fail('registryVersion must be 1');
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

  exactKeys(fixture.storage, ['tier', 'path'], `${label}.storage`);
  choice(fixture.storage.tier, ['git', 'generated', 'external'], `${label}.storage.tier`);
  const pathKey = normalizedLogicalPath(fixture.storage.path, `${label}.storage.path`);
  if (paths.has(pathKey)) fail(`${label}.storage.path has a case/NFC collision`);
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

  exactKeys(fixture.license, ['spdx', 'reviewStatus'], `${label}.license`);
  string(fixture.license.spdx, `${label}.license.spdx`, 128);
  choice(fixture.license.reviewStatus, ['unreviewed', 'approved'], `${label}.license.reviewStatus`);
  exactKeys(fixture.privacy, ['content', 'personalData', 'anonymization'], `${label}.privacy`);
  choice(fixture.privacy.content, ['synthetic', 'anonymized-derived', 'operational'], `${label}.privacy.content`);
  if (typeof fixture.privacy.personalData !== 'boolean') fail(`${label}.privacy.personalData must be boolean`);
  if (fixture.privacy.personalData) fail(`${label} contains personal data and cannot enter the registry`);
  string(fixture.privacy.anonymization, `${label}.privacy.anonymization`, 256);
  if (fixture.storage.tier === 'git' && fixture.privacy.content === 'operational') fail(`${label} operational data cannot be committed as a Git fixture`);
  if (fixture.license.reviewStatus === 'approved' && ['NOASSERTION', 'NONE'].includes(fixture.license.spdx)) {
    fail(`${label} cannot approve an unknown or absent license`);
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
    const bytes = await readRepositoryFile(fixture.storage.path, `${label}.storage.path`);
    if (fixture.provenance.kind === 'generated' || fixture.provenance.kind === 'authored') {
      await readRepositoryFile(fixture.provenance.source, `${label}.provenance.source`);
    }
    if (bytes.byteLength !== fixture.byteSize) fail(`${label} byte size mismatch: ${bytes.byteLength} != ${fixture.byteSize}`);
    const actualDigest = digest(bytes);
    if (actualDigest !== fixture.sha256) fail(`${label} SHA-256 mismatch: ${actualDigest} != ${fixture.sha256}`);
    checkedBytes += bytes.byteLength;
  } else if (fixture.storage.tier === 'generated' && fixture.restore.method !== 'generate') {
    fail(`${label} generated storage requires generate restore`);
  } else if (fixture.storage.tier === 'external' && fixture.restore.method !== 'external') {
    fail(`${label} external storage requires external restore`);
  } else {
    pendingEntries += 1;
  }
}

const gsBindings = await verifyGsRegistryBindings(registry);
await verifyV1MigrationFixtures();
console.log(`fixture registry verified: ${registry.fixtures.length - pendingEntries} Git entries, ${checkedBytes} Git bytes; ${pendingEntries} generated/external entries pending local byte verification; ${gsBindings.fixtureCount} GS semantic contract (${gsBindings.candidateCount} candidate, ${gsBindings.ratifiedCount} ratified; candidates are not renderer/device evidence); v1 migration artifacts verified`);
