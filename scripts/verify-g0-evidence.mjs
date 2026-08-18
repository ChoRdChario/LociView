import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidenceRoot = resolve(root, 'evidence', 'g0');
const fixtureRegistry = JSON.parse(await readFile(resolve(root, 'fixtures', 'registry.json'), 'utf8'));

function fail(message) { throw new Error(`G0 evidence: ${message}`); }
function readJson(path) { return readFile(path, 'utf8').then((text) => JSON.parse(text)); }
function assertPending(value, label) {
  if (value.status !== 'pending') fail(`${label} template must remain pending`);
}
function inspectStrings(value, label) {
  if (typeof value === 'string') {
    if (/https?:\/\/[^/\s]+:[^@\s]+@/iu.test(value)) fail(`${label} contains credentials in a URL`);
    if (/[a-z]:\\users\\[^\\/]+/iu.test(value)) fail(`${label} contains a Windows account path`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, index) => inspectStrings(item, `${label}[${index}]`));
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) inspectStrings(child, `${label}.${key}`);
  }
}

for (const schema of ['device-environment.schema.json', 'run-record.schema.json', 'external-artifact-manifest.schema.json']) {
  await readJson(resolve(evidenceRoot, 'schema', schema));
}

const deviceLines = (await readFile(resolve(evidenceRoot, 'templates', 'device-environments.template.jsonl'), 'utf8'))
  .split(/\r?\n/u)
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line));
const expectedClasses = ['iphone-14-pro', 'windows-desktop', 'windows-tablet-pc'];
if (deviceLines.length !== expectedClasses.length) fail('device template must contain exactly three target classes');
if (JSON.stringify(deviceLines.map(({ deviceClass }) => deviceClass).sort()) !== JSON.stringify([...expectedClasses].sort())) {
  fail('device template target classes differ from the approved G0 matrix');
}
for (const [index, device] of deviceLines.entries()) {
  assertPending(device, `device line ${index + 1}`);
  if (device.environmentId !== null) fail(`device line ${index + 1} must not invent an environmentId`);
  inspectStrings(device, `device line ${index + 1}`);
}

const runTemplate = await readJson(resolve(evidenceRoot, 'templates', 'run-record.template.json'));
assertPending(runTemplate, 'run');
if (runTemplate.completion !== 'pending') fail('run template completion must remain pending');
if (runTemplate.v1GsSupport !== 'unsupported') fail('v1 GS baseline must remain unsupported');
if (runTemplate.provisionalThresholds?.approvalState !== 'unapproved') fail('provisional thresholds must remain unapproved');
if (Object.values(runTemplate.provisionalThresholds?.observations ?? {}).some((value) => value !== 'not-evaluated')) {
  fail('run template must not contain threshold observations');
}
inspectStrings(runTemplate, 'run template');

const artifactTemplate = await readJson(resolve(evidenceRoot, 'templates', 'external-artifact-manifest.template.json'));
assertPending(artifactTemplate, 'artifact manifest');
if (artifactTemplate.artifacts.length !== 0) fail('artifact template must not contain fabricated artifacts');
inspectStrings(artifactTemplate, 'artifact template');

async function readRecords(directory) {
  let entries;
  try {
    entries = await readdir(resolve(evidenceRoot, directory), { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(files.map(async ({ name }) => ({ name, value: await readJson(resolve(evidenceRoot, directory, name)) })));
}

const devices = await readRecords('devices');
const manifests = await readRecords('manifests');
const runs = await readRecords('runs');
const deviceById = new Map(devices.map(({ value }) => [value.environmentId, value]));
const manifestById = new Map(manifests.map(({ value }) => [value.manifestId, value]));
const fixtureById = new Map(fixtureRegistry.fixtures.map((fixture) => [fixture.id, fixture]));

for (const { name, value: run } of runs) {
  inspectStrings(run, `runs/${name}`);
  if (run.completion !== 'complete') continue;
  if (run.status !== 'measured') fail(`runs/${name} is complete but not measured`);
  const device = deviceById.get(run.environmentId);
  if (device === undefined || device.status !== 'measured' || device.deviceClass !== run.deviceClass) {
    fail(`runs/${name} does not resolve to a matching measured environment`);
  }
  const fixture = fixtureById.get(run.fixture?.fixtureId);
  if (fixture === undefined || fixture.sha256 !== run.fixture.sha256) fail(`runs/${name} fixture ID/hash is not in the registry`);
  if (run.artifactManifestId !== null) {
    const manifest = manifestById.get(run.artifactManifestId);
    if (manifest === undefined || manifest.status !== 'recorded' || manifest.runId !== run.runId) {
      fail(`runs/${name} artifact manifest does not resolve to the same run`);
    }
  }
  if (run.traceRef?.sourceLocation === 'external') {
    const manifest = manifestById.get(run.artifactManifestId);
    const traceArtifact = manifest?.artifacts?.find(
      (artifact) =>
        artifact.kind === 'camera-input-trace' &&
        artifact.sha256 === run.traceRef.sha256 &&
        artifact.bytes === run.traceRef.bytes,
    );
    if (traceArtifact === undefined) fail(`runs/${name} external trace does not resolve by hash/bytes in its manifest`);
  }
}

console.log(`G0 evidence verified: ${deviceLines.length} pending device templates, ${runs.length} run records, ${devices.length} environment records, ${manifests.length} artifact manifests`);
