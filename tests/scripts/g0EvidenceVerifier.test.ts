import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

type JsonObject = Record<string, unknown>;
type CliResult = { exitCode: number; stdout: string; stderr: string };
type SyntheticWorkspace = {
  root: string;
  gitCommit: string;
  fixture: {
    id: string;
    sha256: string;
    bytes: number;
    sourceLocation: 'git';
    triangles: number;
    ordinaryPoints: number;
    splats: number;
  };
  trace: { relativePath: string; sha256: string; bytes: number };
};

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const verifierPath = resolve(repositoryRoot, 'scripts', 'verify-g0-evidence.mjs');
const evidenceSource = resolve(repositoryRoot, 'evidence', 'g0');
const registrySchemaSource = resolve(repositoryRoot, 'fixtures', 'registry.schema.json');
const createdRoots: string[] = [];
const SYNTHETIC_NOTE = 'SYNTHETIC TEST FIXTURE ONLY; this is not measured G0 evidence.';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function replaceRequired(value: string, target: string, replacement: string): string {
  if (!value.includes(target)) throw new Error(`Synthetic JSON fixture is missing expected token: ${target}`);
  return value.replace(target, replacement);
}

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, 'utf8')) as JsonObject;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runFile(
  executable: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<CliResult> {
  return new Promise((resolveResult) => {
    execFile(
      executable,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const exitCode = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolveResult({ exitCode, stdout, stderr });
      },
    );
  });
}

function runVerifier(root: string, env: NodeJS.ProcessEnv = process.env): Promise<CliResult> {
  return runFile(process.execPath, [verifierPath, '--root', root], { cwd: repositoryRoot, env });
}

function expectRelativeDiagnostic(
  result: CliResult,
  root: string,
  code: string,
  relativePath?: string,
): void {
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(code);
  if (relativePath !== undefined) expect(result.stderr).toContain(relativePath);
  expect(result.stderr).not.toContain(root);
  expect(result.stderr).not.toContain(root.replaceAll('\\', '/'));
}

async function makeWorkspace(): Promise<SyntheticWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'lociview-g0-verifier-'));
  createdRoots.push(root);

  for (const directory of ['schema', 'templates', 'devices', 'runs', 'manifests']) {
    await mkdir(resolve(root, 'evidence', 'g0', directory), { recursive: true });
  }
  for (const name of [
    'device-environment.schema.json',
    'run-record.schema.json',
    'external-artifact-manifest.schema.json',
  ]) {
    await copyFile(resolve(evidenceSource, 'schema', name), resolve(root, 'evidence', 'g0', 'schema', name));
  }
  for (const name of [
    'device-environments.template.jsonl',
    'run-record.template.json',
    'external-artifact-manifest.template.json',
  ]) {
    await copyFile(resolve(evidenceSource, 'templates', name), resolve(root, 'evidence', 'g0', 'templates', name));
  }
  await mkdir(resolve(root, 'fixtures'), { recursive: true });
  await copyFile(registrySchemaSource, resolve(root, 'fixtures', 'registry.schema.json'));

  const fixtureBytes = Buffer.from('synthetic-g0-fixture-bytes\n', 'utf8');
  const fixturePath = resolve(root, 'fixtures', 'data', 'synthetic-g0-mesh.glb');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, fixtureBytes);
  const fixture = {
    id: 'synthetic-g0-mesh-v1',
    sha256: sha256(fixtureBytes),
    bytes: fixtureBytes.byteLength,
    sourceLocation: 'git' as const,
    triangles: 12,
    ordinaryPoints: 0,
    splats: 0,
  };
  await writeJson(resolve(root, 'fixtures', 'registry.json'), {
    $schema: './registry.schema.json',
    registryVersion: 1,
    fixtures: [
      {
        id: fixture.id,
        storage: { tier: fixture.sourceLocation, path: 'fixtures/data/synthetic-g0-mesh.glb' },
        byteSize: fixture.bytes,
        sha256: fixture.sha256,
        mediaType: 'model/gltf-binary',
        classification: 'mesh',
        geometry: {
          triangleCount: fixture.triangles,
          ordinaryPointCount: fixture.ordinaryPoints,
          splatCount: fixture.splats,
          textureCount: 0,
          bounds: { min: [0, 0, 0], max: [1, 1, 1] },
        },
        coordinates: { handedness: 'right', upAxis: '+Y', unit: 'source-unit' },
        provenance: { kind: 'generated', source: 'test builder', reproducibility: 'pinned-output-only' },
        license: { spdx: 'NOASSERTION', reviewStatus: 'unreviewed' },
        privacy: { content: 'synthetic', personalData: false, anonymization: 'not-applicable' },
        restore: { method: 'repository', instructions: SYNTHETIC_NOTE },
        expected: { classification: 'mesh', warnings: [SYNTHETIC_NOTE] },
      },
    ],
  });

  const traceBytes = Buffer.from('synthetic-camera-input-trace-v1\n', 'utf8');
  const trace = {
    relativePath: 'fixtures/traces/synthetic-camera-input.trace',
    sha256: sha256(traceBytes),
    bytes: traceBytes.byteLength,
  };
  const tracePath = resolve(root, trace.relativePath);
  await mkdir(dirname(tracePath), { recursive: true });
  await writeFile(tracePath, traceBytes);

  const lockBytes = Buffer.from('{"name":"synthetic-g0-test-workspace","lockfileVersion":3}\n', 'utf8');
  await writeFile(resolve(root, 'package-lock.json'), lockBytes);

  const gitCommit = await initialiseGit(root);
  return { root, gitCommit, fixture, trace };
}

async function deviceTemplate(root: string): Promise<JsonObject> {
  const firstLine = (await readFile(
    resolve(root, 'evidence', 'g0', 'templates', 'device-environments.template.jsonl'),
    'utf8',
  )).split(/\r?\n/u).find((line) => line.trim() !== '');
  if (firstLine === undefined) throw new Error('Synthetic workspace has no device template');
  return JSON.parse(firstLine) as JsonObject;
}

async function runTemplate(root: string): Promise<JsonObject> {
  return readJson(resolve(root, 'evidence', 'g0', 'templates', 'run-record.template.json'));
}

async function artifactTemplate(root: string): Promise<JsonObject> {
  return readJson(resolve(root, 'evidence', 'g0', 'templates', 'external-artifact-manifest.template.json'));
}

async function makeRecordedManifest(
  root: string,
  options: {
    manifestId: string;
    runId: string;
    artifactId?: string;
    kind?: string;
    sha256?: string;
    bytes?: number;
    storageLocator?: string;
  },
): Promise<JsonObject> {
  const manifest = await artifactTemplate(root);
  Object.assign(manifest, {
    status: 'recorded',
    manifestId: options.manifestId,
    runId: options.runId,
    artifacts: [{
      artifactId: options.artifactId ?? 'blob_synthetic-recorded',
      kind: options.kind ?? 'other',
      sha256: options.sha256 ?? SHA_A,
      bytes: options.bytes ?? 1,
      storageLocator: options.storageLocator ?? 'external-store/synthetic-artifact.bin',
      restoreInstructions: SYNTHETIC_NOTE,
      capturedAtUtc: '2026-08-19T00:00:00Z',
      containsSensitiveData: false,
      retentionNote: SYNTHETIC_NOTE,
    }],
    notes: [SYNTHETIC_NOTE],
  });
  return manifest;
}

async function makeMeasuredEnvironment(root: string, id = 'env_synthetic-iphone'): Promise<JsonObject> {
  const environment = await deviceTemplate(root);
  Object.assign(environment, {
    status: 'measured',
    environmentId: id,
    deviceClass: 'iphone-14-pro',
    deviceModel: 'Synthetic iPhone 14 Pro',
    osName: 'Synthetic iOS',
    osVersion: '0-test',
    browserName: 'Synthetic Safari',
    browserVersion: '0-test',
    launchMode: 'pwa',
    viewportCss: { width: 393, height: 852 },
    devicePixelRatio: 3,
    drawingBufferPx: { width: 1179, height: 2556 },
    ramGiB: 6,
    gpu: 'Synthetic GPU',
    freeStorageBytes: 1,
    power: { source: 'battery', chargePercent: 100, lowPowerMode: false, thermalCondition: 'cool' },
    notes: [SYNTHETIC_NOTE],
  });
  return environment;
}

async function makeCompleteRun(
  workspace: SyntheticWorkspace,
  options: { traceSource?: 'git' | 'generated'; traceLocator?: string; gitCommit?: string } = {},
): Promise<JsonObject> {
  const run = await runTemplate(workspace.root);
  const packageLock = await readFile(resolve(workspace.root, 'package-lock.json'));
  Object.assign(run, {
    status: 'measured',
    runId: 'run_synthetic-local',
    environmentId: 'env_synthetic-iphone',
    deviceClass: 'iphone-14-pro',
    startedAtUtc: '2026-08-19T00:00:00Z',
    completion: 'complete',
    artifactManifestId: null,
    notes: [SYNTHETIC_NOTE],
  });
  Object.assign(run.build as JsonObject, {
    deliveryMode: 'local',
    gitCommit: options.gitCommit ?? workspace.gitCommit,
    gitDirty: false,
    packageLockSha256: sha256(packageLock),
    workflowRunId: null,
    deployUrl: null,
    indexSha256: SHA_A,
    serviceWorkerSha256: SHA_B,
  });
  Object.assign(run.fixture as JsonObject, {
    fixtureId: workspace.fixture.id,
    sha256: workspace.fixture.sha256,
    sourceBytes: workspace.fixture.bytes,
    format: 'model/gltf-binary',
    triangles: workspace.fixture.triangles,
    ordinaryPoints: workspace.fixture.ordinaryPoints,
    splats: workspace.fixture.splats,
    packageBytes: workspace.fixture.bytes,
    sourceLocation: workspace.fixture.sourceLocation,
  });
  Object.assign(run.traceRef as JsonObject, {
    traceId: 'trace_synthetic-camera-v1',
    sha256: workspace.trace.sha256,
    bytes: workspace.trace.bytes,
    version: 'synthetic-v1',
    sourceLocation: options.traceSource ?? 'git',
    restoreLocator: options.traceLocator ?? workspace.trace.relativePath,
  });
  Object.assign(run.conditions as JsonObject, {
    network: 'offline',
    cacheState: 'service-worker-warm',
    launchMode: 'pwa',
    viewportCss: { width: 393, height: 852 },
    devicePixelRatio: 3,
    drawingBufferPx: { width: 1179, height: 2556 },
  });
  const metrics = run.metrics as Record<string, JsonObject>;
  const metric = (name: string): JsonObject => {
    const value = metrics[name];
    if (value === undefined) throw new Error(`Synthetic run template is missing metrics.${name}`);
    return value;
  };
  Object.assign(metric('offlineLaunch'), { attempts: 5, successes: 5, samplesMs: [1, 1, 1, 1, 1] });
  Object.assign(metric('project'), { openMs: 1, firstPreviewMs: 1, fullyUsableMs: 1 });
  Object.assign(metric('frame'), {
    durationSeconds: 120,
    sampleCount: 20,
    p50Ms: 1,
    p95Ms: 1,
    maxMs: 1,
    over66_7MsCount: 0,
    hiddenIntervalsExcluded: true,
  });
  Object.assign(metric('pick'), {
    sampleCount: 30,
    computeP50Ms: 1,
    computeP95Ms: 1,
    gestureP50Ms: 1,
    gestureP95Ms: 1,
    maxErrorPx: 0,
  });
  Object.assign(metric('lifecycle'), {
    backgroundCycles: 3,
    successfulRestores: 3,
    continuousUseSeconds: 600,
    loadUnloadCycles: 20,
    unexpectedReloads: 0,
    contextLosses: 0,
  });
  Object.assign(metric('resources'), {
    managedBytesBefore: 0,
    managedBytesAfter: 0,
    managedHandlesBefore: 0,
    managedHandlesAfter: 0,
    jsHeapStatus: 'unavailable',
    firstStableFiveMedianBytes: null,
    finalFiveMedianBytes: null,
  });
  Object.assign(metric('storage'), { beforeBytes: 0, afterBytes: 0, afterCleanupBytes: 0 });
  Object.assign(metric('packageIo'), { inspectMs: 1, importMs: 1, exportMs: 1 });
  return run;
}

async function writeEnvironment(root: string, name: string, value: unknown): Promise<void> {
  await writeJson(resolve(root, 'evidence', 'g0', 'devices', name), value);
}

async function writeRun(root: string, name: string, value: unknown): Promise<void> {
  await writeJson(resolve(root, 'evidence', 'g0', 'runs', name), value);
}

async function writeManifest(root: string, name: string, value: unknown): Promise<void> {
  await writeJson(resolve(root, 'evidence', 'g0', 'manifests', name), value);
}

async function initialiseGit(root: string): Promise<string> {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'LociView synthetic verifier test',
    GIT_AUTHOR_EMAIL: 'synthetic-test@invalid.example',
    GIT_COMMITTER_NAME: 'LociView synthetic verifier test',
    GIT_COMMITTER_EMAIL: 'synthetic-test@invalid.example',
  };
  for (const args of [
    ['init', '--quiet'],
    ['add', '--', 'package-lock.json', 'fixtures/registry.json', 'fixtures/data/synthetic-g0-mesh.glb', 'fixtures/traces/synthetic-camera-input.trace'],
    ['commit', '--quiet', '-m', 'synthetic evidence inputs'],
  ]) {
    const result = await runFile('git', args, { cwd: root, env });
    if (result.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  }
  const result = await runFile('git', ['rev-parse', 'HEAD'], { cwd: root, env });
  if (result.exitCode !== 0) throw new Error(`git rev-parse failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function commitGitSymlink(
  root: string,
  path: string,
  target: string,
): Promise<{ commit: string; sha256: string; bytes: number }> {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'LociView synthetic verifier test',
    GIT_AUTHOR_EMAIL: 'synthetic-test@invalid.example',
    GIT_COMMITTER_NAME: 'LociView synthetic verifier test',
    GIT_COMMITTER_EMAIL: 'synthetic-test@invalid.example',
  };
  const targetBytes = Buffer.from(target, 'utf8');
  const objectInput = resolve(root, '.synthetic-git-symlink-target');
  await writeFile(objectInput, targetBytes);
  const hashResult = await runFile('git', ['hash-object', '-w', objectInput], { cwd: root, env });
  if (hashResult.exitCode !== 0) throw new Error(`git hash-object failed: ${hashResult.stderr}`);
  const blob = hashResult.stdout.trim();
  for (const args of [
    ['update-index', '--add', '--cacheinfo', `120000,${blob},${path}`],
    ['commit', '--quiet', '-m', 'synthetic symlink tree entry'],
  ]) {
    const result = await runFile('git', args, { cwd: root, env });
    if (result.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  }
  const commitResult = await runFile('git', ['rev-parse', 'HEAD'], { cwd: root, env });
  if (commitResult.exitCode !== 0) throw new Error(`git rev-parse failed: ${commitResult.stderr}`);
  return { commit: commitResult.stdout.trim(), sha256: sha256(targetBytes), bytes: targetBytes.byteLength };
}

async function createDanglingCommit(root: string): Promise<string> {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'LociView synthetic verifier test',
    GIT_AUTHOR_EMAIL: 'synthetic-test@invalid.example',
    GIT_COMMITTER_NAME: 'LociView synthetic verifier test',
    GIT_COMMITTER_EMAIL: 'synthetic-test@invalid.example',
  };
  const treeResult = await runFile('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, env });
  if (treeResult.exitCode !== 0) throw new Error(`git rev-parse tree failed: ${treeResult.stderr}`);
  const commitResult = await runFile(
    'git',
    ['commit-tree', treeResult.stdout.trim(), '-m', 'synthetic dangling evidence commit'],
    { cwd: root, env },
  );
  if (commitResult.exitCode !== 0) throw new Error(`git commit-tree failed: ${commitResult.stderr}`);
  return commitResult.stdout.trim();
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('G0 evidence verifier CLI', () => {
  it('accepts the pending-only synthetic workspace and prints a summary', async () => {
    const workspace = await makeWorkspace();
    const result = await runVerifier(workspace.root);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/G0 evidence verified:/u);
    expect(result.stdout).toContain('3 pending device templates');
  });

  it('uses exit code 2 for invalid CLI usage', async () => {
    const result = await runFile(process.execPath, [verifierPath, '--not-a-real-option'], { cwd: repositoryRoot });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/usage/iu);
  });

  it('rejects a schema-invalid template with only a repository-relative path', async () => {
    const workspace = await makeWorkspace();
    const path = resolve(workspace.root, 'evidence', 'g0', 'templates', 'run-record.template.json');
    const template = await readJson(path);
    template.unexpectedSyntheticProperty = true;
    await writeJson(path, template);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_SCHEMA', 'evidence/g0/templates/run-record.template.json');
  });

  it('rejects an extra template file without disclosing its name or contents', async () => {
    const workspace = await makeWorkspace();
    const rawName = 'run-real-synthetic-secret.json';
    await writeFile(
      resolve(workspace.root, 'evidence', 'g0', 'templates', rawName),
      '{"notes":["Authorization: token synthetic-secret-value"]}\n',
      'utf8',
    );
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_TEMPLATE', 'evidence/g0/templates');
    expect(result.stderr).not.toContain(rawName);
    expect(result.stderr).not.toContain('synthetic-secret-value');
  });

  it('rejects a pending run template that contains a fabricated metric value', async () => {
    const workspace = await makeWorkspace();
    const path = resolve(workspace.root, 'evidence', 'g0', 'templates', 'run-record.template.json');
    const template = await readJson(path);
    const metrics = template.metrics as Record<string, JsonObject>;
    const frame = metrics.frame;
    if (frame === undefined) throw new Error('Synthetic run template has no frame metrics');
    frame.p50Ms = 1;
    await writeJson(path, template);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_TEMPLATE', 'evidence/g0/templates/run-record.template.json');
  });

  it('rejects a pending device template that contains a fabricated RAM claim', async () => {
    const workspace = await makeWorkspace();
    const path = resolve(workspace.root, 'evidence', 'g0', 'templates', 'device-environments.template.jsonl');
    const devices = (await readFile(path, 'utf8'))
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as JsonObject);
    const firstDevice = devices[0];
    if (firstDevice === undefined) throw new Error('Synthetic device template is empty');
    firstDevice.ramGiB = 6;
    await writeFile(path, `${devices.map((device) => JSON.stringify(device)).join('\n')}\n`, 'utf8');
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(
      result,
      workspace.root,
      'E_TEMPLATE',
      'evidence/g0/templates/device-environments.template.jsonl',
    );
  });

  it('rejects duplicate keys in a record before a hidden secret value can be overwritten', async () => {
    const workspace = await makeWorkspace();
    const device = await deviceTemplate(workspace.root);
    const raw = replaceRequired(
      JSON.stringify(device),
      '"notes":[]',
      '"notes":["https://example.invalid/?token=synthetic-secret-value"],"notes":[]',
    );
    await writeFile(resolve(workspace.root, 'evidence', 'g0', 'devices', 'duplicate.json'), `${raw}\n`, 'utf8');
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_PARSE', 'devices/duplicate.json');
    expect(result.stderr).not.toContain('synthetic-secret-value');
  });

  it('rejects escaped-equivalent duplicate keys in a JSONL device template', async () => {
    const workspace = await makeWorkspace();
    const path = resolve(workspace.root, 'evidence', 'g0', 'templates', 'device-environments.template.jsonl');
    const raw = replaceRequired(
      await readFile(path, 'utf8'),
      '"notes":[]',
      '"no\\u0074es":["https://example.invalid/?token=synthetic-secret-value"],"notes":[]',
    );
    await writeFile(path, raw, 'utf8');
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(
      result,
      workspace.root,
      'E_PARSE',
      'evidence/g0/templates/device-environments.template.jsonl',
    );
    expect(result.stderr).not.toContain('synthetic-secret-value');
  });

  it('rejects duplicate keys nested inside a record object', async () => {
    const workspace = await makeWorkspace();
    const device = await deviceTemplate(workspace.root);
    const raw = replaceRequired(
      JSON.stringify(device),
      '"power":{"source":"unknown"',
      '"power":{"source":"https://example.invalid/?token=synthetic-secret-value","source":"unknown"',
    );
    await writeFile(resolve(workspace.root, 'evidence', 'g0', 'devices', 'nested-duplicate.json'), `${raw}\n`, 'utf8');
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_PARSE', 'devices/nested-duplicate.json');
    expect(result.stderr).not.toContain('synthetic-secret-value');
  });

  it('rejects matching external trace tuples that contain an unsafe integer byte count', async () => {
    const workspace = await makeWorkspace();
    const unsafeBytes = Number.MAX_SAFE_INTEGER + 1;
    const run = await makeCompleteRun(workspace);
    run.artifactManifestId = 'art_synthetic-unsafe-integer';
    Object.assign(run.traceRef as JsonObject, {
      sourceLocation: 'external',
      restoreLocator: 'external-store/unsafe-integer.trace',
      bytes: unsafeBytes,
    });
    const manifest = await makeRecordedManifest(workspace.root, {
      manifestId: 'art_synthetic-unsafe-integer',
      runId: run.runId as string,
      artifactId: 'blob_synthetic-unsafe-integer',
      kind: 'camera-input-trace',
      sha256: (run.traceRef as JsonObject).sha256 as string,
      bytes: unsafeBytes,
      storageLocator: 'external-store/unsafe-integer.trace',
    });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    await writeManifest(workspace.root, 'synthetic.json', manifest);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_NUMBER');
  });

  it('rejects an oversized JSON input before parsing it', async () => {
    const workspace = await makeWorkspace();
    const path = resolve(workspace.root, 'evidence', 'g0', 'devices', 'oversized.json');
    await writeFile(path, Buffer.alloc(2 * 1024 * 1024 + 1, 0x20));
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_LIMIT', 'devices/oversized.json');
  });

  const unexpectedRecordEntryCases: Array<[string, string]> = [
    ['fabricated.X-Goog-Signature%3Dsynthetic-secret-value.JSON', '{"fabricated":true}\n'],
    ['untracked-synthetic-secret-value.txt', 'synthetic-secret-value\n'],
  ];

  it.each(unexpectedRecordEntryCases)(
    'rejects an unexpected record-directory entry without disclosing its raw name: %s',
    async (rawName, contents) => {
      const workspace = await makeWorkspace();
      await writeFile(resolve(workspace.root, 'evidence', 'g0', 'devices', rawName), contents, 'utf8');
      const result = await runVerifier(workspace.root);
      expectRelativeDiagnostic(result, workspace.root, 'E_IO');
      expect(result.stderr).not.toContain(rawName);
      expect(result.stderr).not.toContain('synthetic-secret-value');
      expect(result.stderr).not.toContain('%3D');
    },
  );

  it.each(['con.json', 'com1.json'])(
    'rejects a Windows-reserved record filename without disclosing it: %s',
    async (rawName) => {
      const workspace = await makeWorkspace();
      await writeJson(
        resolve(workspace.root, 'evidence', 'g0', 'devices', rawName),
        await deviceTemplate(workspace.root),
      );
      const result = await runVerifier(workspace.root);
      expectRelativeDiagnostic(result, workspace.root, 'E_IO');
      expect(result.stderr).not.toContain(rawName);
    },
  );

  const duplicateCases: Array<[string, (workspace: SyntheticWorkspace) => Promise<void>]> = [
    ['environmentId', async (workspace) => {
      const record = await deviceTemplate(workspace.root);
      record.environmentId = 'env_synthetic-duplicate';
      await writeEnvironment(workspace.root, 'one.json', record);
      await writeEnvironment(workspace.root, 'two.json', clone(record));
    }],
    ['runId', async (workspace) => {
      const record = await runTemplate(workspace.root);
      record.runId = 'run_synthetic-duplicate';
      await writeRun(workspace.root, 'one.json', record);
      await writeRun(workspace.root, 'two.json', clone(record));
    }],
    ['manifestId', async (workspace) => {
      const record = await artifactTemplate(workspace.root);
      record.manifestId = 'art_synthetic-duplicate';
      await writeManifest(workspace.root, 'one.json', record);
      await writeManifest(workspace.root, 'two.json', clone(record));
    }],
    ['artifactId', async (workspace) => {
      const makeManifest = async (manifestId: string, runId: string): Promise<JsonObject> => {
        const manifest = await artifactTemplate(workspace.root);
        Object.assign(manifest, { manifestId, runId });
        manifest.artifacts = [{
          artifactId: 'blob_synthetic-duplicate',
          kind: 'other',
          sha256: SHA_A,
          bytes: 1,
          storageLocator: 'synthetic-external-store',
          restoreInstructions: SYNTHETIC_NOTE,
          capturedAtUtc: '2026-08-19T00:00:00Z',
          containsSensitiveData: false,
          retentionNote: SYNTHETIC_NOTE,
        }];
        return manifest;
      };
      await writeManifest(workspace.root, 'one.json', await makeManifest('art_synthetic-one', 'run_synthetic-one'));
      await writeManifest(workspace.root, 'two.json', await makeManifest('art_synthetic-two', 'run_synthetic-two'));
    }],
    ['fixture ID', async (workspace) => {
      const path = resolve(workspace.root, 'fixtures', 'registry.json');
      const registry = await readJson(path);
      const fixtures = registry.fixtures as JsonObject[];
      const firstFixture = fixtures[0];
      if (firstFixture === undefined) throw new Error('Synthetic fixture registry is empty');
      fixtures.push(clone(firstFixture));
      await writeJson(path, registry);
    }],
  ];

  it.each(duplicateCases)('rejects duplicate %s values before indexing', async (_label, arrange) => {
    const workspace = await makeWorkspace();
    await arrange(workspace);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_DUPLICATE_ID');
  });

  const privacyCases: Array<[string, string, (workspace: SyntheticWorkspace) => Promise<void>]> = [
    ['device record', 'devices/private.json', async (workspace) => {
      const device = await deviceTemplate(workspace.root);
      device.notes = ['C:\\Users\\SyntheticAccount\\private'];
      await writeEnvironment(workspace.root, 'private.json', device);
    }],
    ['artifact manifest', 'manifests/private.json', async (workspace) => {
      const manifest = await artifactTemplate(workspace.root);
      manifest.notes = ['https://synthetic-user:synthetic-password@example.invalid/private'];
      await writeManifest(workspace.root, 'private.json', manifest);
    }],
  ];

  it.each(privacyCases)('rejects privacy-sensitive strings in a %s', async (_label, path, arrange) => {
    const workspace = await makeWorkspace();
    await arrange(workspace);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_PRIVACY', path);
  });

  const encodedPrivacyCases: Array<[string, string]> = [
    [
      'a percent-encoded X-Goog-Signature key',
      'https://example.invalid/object?%58%2D%47%6F%6F%67%2D%53%69%67%6E%61%74%75%72%65=synthetic-secret-value',
    ],
    [
      'an encoded X-Goog-Signature key beside an invalid percent escape',
      'https://example.invalid/?bad=%ZZ&%58-Goog-Signature=synthetic-secret-value',
    ],
    ['an Authorization bearer header', 'Authorization: Bearer synthetic-secret-value'],
    ['an AWS authorization header', 'Authorization: AWS4-HMAC-SHA256 Credential=AKIA_SYNTHETIC,Signature=synthetic-secret-value'],
    ['SFTP URL user information', 'sftp://synthetic-user:synthetic-password@example.invalid/blob'],
    [
      'a doubly encoded credential URL',
      `https://example.invalid/?restore=${encodeURIComponent(encodeURIComponent('sftp://synthetic-user:synthetic-password@example.invalid/blob'))}`,
    ],
  ];

  it.each(encodedPrivacyCases)('rejects %s without echoing its value', async (_label, privateValue) => {
    const workspace = await makeWorkspace();
    const device = await deviceTemplate(workspace.root);
    device.notes = [privateValue];
    await writeEnvironment(workspace.root, 'private.json', device);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_PRIVACY', 'devices/private.json');
    expect(result.stderr).not.toContain('synthetic-secret-value');
    expect(result.stderr).not.toContain('synthetic-password');
    expect(result.stderr).not.toContain('AKIA_SYNTHETIC');
    expect(result.stderr).not.toContain('%58');
  });

  it('fails closed on excessively nested percent encoding', async () => {
    const workspace = await makeWorkspace();
    let privateValue = 'sftp://synthetic-user:synthetic-password@example.invalid/blob';
    for (let depth = 0; depth < 9; depth += 1) privateValue = encodeURIComponent(privateValue);
    const device = await deviceTemplate(workspace.root);
    device.notes = [`https://example.invalid/?restore=${privateValue}`];
    await writeEnvironment(workspace.root, 'private.json', device);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_PRIVACY', 'devices/private.json');
    expect(result.stderr).not.toContain('synthetic-user');
    expect(result.stderr).not.toContain('synthetic-password');
  });

  it('rejects a basic authorization header without echoing its credential', async () => {
    const workspace = await makeWorkspace();
    const credential = 'c3ludGhldGljOnNlY3JldA==';
    const device = await deviceTemplate(workspace.root);
    device.notes = [`Authorization: Basic ${credential}`];
    await writeEnvironment(workspace.root, 'private.json', device);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_PRIVACY', 'devices/private.json');
    expect(result.stderr).not.toContain(credential);
  });

  it('rejects username-only URL userinfo without echoing the credential-like username', async () => {
    const workspace = await makeWorkspace();
    const privateValue = 'https://ya29.oauth-token@example.invalid/blob';
    const manifest = await artifactTemplate(workspace.root);
    manifest.notes = [privateValue];
    await writeManifest(workspace.root, 'private.json', manifest);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_PRIVACY', 'manifests/private.json');
    expect(result.stderr).not.toContain('ya29');
    expect(result.stderr).not.toContain('oauth-token');
    expect(result.stderr).not.toContain(privateValue);
  });

  it('accepts a complete local run with null deployment metadata and a verified Git trace', async () => {
    const workspace = await makeWorkspace();
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', await makeCompleteRun(workspace));
    const result = await runVerifier(workspace.root);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('1 run records');
    expect(result.stdout).toContain('1 environment records');
  });

  it('ignores inherited Git repository redirection while verifying recorded sources', async () => {
    const workspace = await makeWorkspace();
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', await makeCompleteRun(workspace));
    const result = await runVerifier(workspace.root, {
      ...process.env,
      GIT_DIR: resolve(workspace.root, '.synthetic-invalid-git-dir'),
      GIT_WORK_TREE: resolve(workspace.root, '.synthetic-invalid-work-tree'),
      GIT_OBJECT_DIRECTORY: resolve(workspace.root, '.synthetic-invalid-objects'),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('allows two complete runs to reuse an identical trace ID and trace tuple', async () => {
    const workspace = await makeWorkspace();
    const firstRun = await makeCompleteRun(workspace);
    const secondRun = clone(firstRun);
    secondRun.runId = 'run_synthetic-local-two';
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'one.json', firstRun);
    await writeRun(workspace.root, 'two.json', secondRun);
    const result = await runVerifier(workspace.root);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('2 run records');
  });

  it('rejects a complete run that relies on an unregistered generated trace', async () => {
    const workspace = await makeWorkspace();
    const generatedPath = '.artifacts/traces/synthetic-camera-input.trace';
    const generatedFile = resolve(workspace.root, generatedPath);
    await mkdir(dirname(generatedFile), { recursive: true });
    await copyFile(resolve(workspace.root, workspace.trace.relativePath), generatedFile);
    const run = await makeCompleteRun(workspace, { traceSource: 'generated', traceLocator: generatedPath });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_TRACE');
  });

  const divergentTraceCases: Array<[string, (trace: JsonObject) => void]> = [
    ['hash', (trace) => { trace.sha256 = SHA_A; }],
    ['restore locator', (trace) => { trace.restoreLocator = 'fixtures/traces/divergent.trace'; }],
  ];

  it.each(divergentTraceCases)(
    'rejects two runs that reuse a trace ID with a divergent %s',
    async (_label, diverge) => {
      const workspace = await makeWorkspace();
      const firstRun = await makeCompleteRun(workspace);
      const secondRun = clone(firstRun);
      secondRun.runId = 'run_synthetic-local-two';
      diverge(secondRun.traceRef as JsonObject);
      await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
      await writeRun(workspace.root, 'one.json', firstRun);
      await writeRun(workspace.root, 'two.json', secondRun);
      const result = await runVerifier(workspace.root);
      expectRelativeDiagnostic(result, workspace.root, 'E_DUPLICATE_ID');
    },
  );

  it('rejects an external trace whose manifest artifact has a different restore locator', async () => {
    const workspace = await makeWorkspace();
    const run = await makeCompleteRun(workspace);
    run.artifactManifestId = 'art_synthetic-external-trace';
    Object.assign(run.traceRef as JsonObject, {
      sourceLocation: 'external',
      restoreLocator: 'external-store/trace-from-run.bin',
    });
    const manifest = await makeRecordedManifest(workspace.root, {
      manifestId: 'art_synthetic-external-trace',
      runId: run.runId as string,
      artifactId: 'blob_synthetic-external-trace',
      kind: 'camera-input-trace',
      sha256: (run.traceRef as JsonObject).sha256 as string,
      bytes: (run.traceRef as JsonObject).bytes as number,
      storageLocator: 'external-store/different-trace.bin',
    });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    await writeManifest(workspace.root, 'synthetic.json', manifest);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_TRACE');
  });

  it('accepts a complete deployed run with matching external fixture and trace artifacts', async () => {
    const workspace = await makeWorkspace();
    const registryPath = resolve(workspace.root, 'fixtures', 'registry.json');
    const registry = await readJson(registryPath);
    const fixture = (registry.fixtures as JsonObject[])[0];
    if (fixture === undefined) throw new Error('Synthetic fixture registry is empty');
    Object.assign(fixture.storage as JsonObject, {
      tier: 'external',
      path: 'external-store/synthetic-fixture.glb',
    });
    Object.assign(fixture.provenance as JsonObject, { reproducibility: 'external-restore' });
    Object.assign(fixture.restore as JsonObject, { method: 'external', instructions: SYNTHETIC_NOTE });
    await writeJson(registryPath, registry);

    const run = await makeCompleteRun(workspace);
    run.artifactManifestId = 'art_synthetic-external-complete';
    Object.assign(run.build as JsonObject, {
      deliveryMode: 'deployed',
      workflowRunId: 'synthetic-workflow-1',
      deployUrl: 'https://example.invalid/synthetic-g0-build/',
    });
    Object.assign(run.fixture as JsonObject, { sourceLocation: 'external' });
    Object.assign(run.traceRef as JsonObject, {
      sourceLocation: 'external',
      restoreLocator: 'external-store/synthetic-camera-input.trace',
    });

    const manifest = await makeRecordedManifest(workspace.root, {
      manifestId: 'art_synthetic-external-complete',
      runId: run.runId as string,
      artifactId: 'blob_synthetic-external-fixture',
      kind: 'large-fixture',
      sha256: (run.fixture as JsonObject).sha256 as string,
      bytes: (run.fixture as JsonObject).sourceBytes as number,
      storageLocator: 'external-store/synthetic-fixture.glb',
    });
    manifest.artifacts = [
      ...(manifest.artifacts as JsonObject[]),
      {
        artifactId: 'blob_synthetic-external-trace',
        kind: 'camera-input-trace',
        sha256: (run.traceRef as JsonObject).sha256,
        bytes: (run.traceRef as JsonObject).bytes,
        storageLocator: (run.traceRef as JsonObject).restoreLocator,
        restoreInstructions: SYNTHETIC_NOTE,
        capturedAtUtc: '2026-08-19T00:00:00Z',
        containsSensitiveData: false,
        retentionNote: SYNTHETIC_NOTE,
      },
    ];

    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    await writeManifest(workspace.root, 'synthetic.json', manifest);
    const result = await runVerifier(workspace.root);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('1 artifact manifests');
  });

  it('accepts a complete local run with a verified generated fixture', async () => {
    const workspace = await makeWorkspace();
    const generatedFixturePath = '.artifacts/fixtures/synthetic-g0-mesh.glb';
    const generatedFixtureFile = resolve(workspace.root, generatedFixturePath);
    await mkdir(dirname(generatedFixtureFile), { recursive: true });
    await copyFile(resolve(workspace.root, 'fixtures', 'data', 'synthetic-g0-mesh.glb'), generatedFixtureFile);
    const registryPath = resolve(workspace.root, 'fixtures', 'registry.json');
    const registry = await readJson(registryPath);
    const fixture = (registry.fixtures as JsonObject[])[0];
    if (fixture === undefined) throw new Error('Synthetic fixture registry is empty');
    Object.assign(fixture.storage as JsonObject, {
      tier: 'generated',
      path: generatedFixturePath,
    });
    Object.assign(fixture.provenance as JsonObject, { reproducibility: 'byte-reproducible' });
    Object.assign(fixture.restore as JsonObject, { method: 'generate', instructions: SYNTHETIC_NOTE });
    await writeJson(registryPath, registry);

    const run = await makeCompleteRun(workspace);
    Object.assign(run.fixture as JsonObject, { sourceLocation: 'generated' });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('1 run records');
  });

  it('rejects a generated fixture that is not declared byte-reproducible', async () => {
    const workspace = await makeWorkspace();
    const generatedFixturePath = '.artifacts/fixtures/synthetic-g0-mesh.glb';
    const generatedFixtureFile = resolve(workspace.root, generatedFixturePath);
    await mkdir(dirname(generatedFixtureFile), { recursive: true });
    await copyFile(resolve(workspace.root, 'fixtures', 'data', 'synthetic-g0-mesh.glb'), generatedFixtureFile);
    const registryPath = resolve(workspace.root, 'fixtures', 'registry.json');
    const registry = await readJson(registryPath);
    const fixture = (registry.fixtures as JsonObject[])[0];
    if (fixture === undefined) throw new Error('Synthetic fixture registry is empty');
    Object.assign(fixture.storage as JsonObject, { tier: 'generated', path: generatedFixturePath });
    Object.assign(fixture.restore as JsonObject, { method: 'generate', instructions: SYNTHETIC_NOTE });
    await writeJson(registryPath, registry);
    const run = await makeCompleteRun(workspace);
    Object.assign(run.fixture as JsonObject, { sourceLocation: 'generated' });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    expectRelativeDiagnostic(await runVerifier(workspace.root), workspace.root, 'E_FIXTURE');
  });

  it('rejects an external fixture without an external-restore provenance contract', async () => {
    const workspace = await makeWorkspace();
    const registryPath = resolve(workspace.root, 'fixtures', 'registry.json');
    const registry = await readJson(registryPath);
    const fixture = (registry.fixtures as JsonObject[])[0];
    if (fixture === undefined) throw new Error('Synthetic fixture registry is empty');
    Object.assign(fixture.storage as JsonObject, { tier: 'external', path: 'external-store/synthetic-fixture.glb' });
    Object.assign(fixture.restore as JsonObject, { method: 'external', instructions: SYNTHETIC_NOTE });
    await writeJson(registryPath, registry);
    const run = await makeCompleteRun(workspace);
    Object.assign(run.fixture as JsonObject, { sourceLocation: 'external' });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    expectRelativeDiagnostic(await runVerifier(workspace.root), workspace.root, 'E_FIXTURE');
  });

  const unsupportedCompleteFixtureCases: Array<[
    string,
    string,
    { triangleCount: number; ordinaryPointCount: number; splatCount: number },
  ]> = [
    ['evidence-only input', 'evidence', { triangleCount: 0, ordinaryPointCount: 0, splatCount: 0 }],
    ['Gaussian-splat input', 'gaussian-splat', { triangleCount: 0, ordinaryPointCount: 0, splatCount: 1 }],
    ['empty mesh input', 'mesh', { triangleCount: 0, ordinaryPointCount: 0, splatCount: 0 }],
  ];

  it.each(unsupportedCompleteFixtureCases)(
    'rejects a complete v1 run that uses %s',
    async (_label, classification, geometry) => {
      const workspace = await makeWorkspace();
      const registryPath = resolve(workspace.root, 'fixtures', 'registry.json');
      const registry = await readJson(registryPath);
      const fixture = (registry.fixtures as JsonObject[])[0];
      if (fixture === undefined) throw new Error('Synthetic fixture registry is empty');
      fixture.classification = classification;
      Object.assign(fixture.geometry as JsonObject, geometry);
      (fixture.expected as JsonObject).classification = classification;
      await writeJson(registryPath, registry);
      const run = await makeCompleteRun(workspace);
      Object.assign(run.fixture as JsonObject, {
        triangles: geometry.triangleCount,
        ordinaryPoints: geometry.ordinaryPointCount,
        splats: geometry.splatCount,
      });
      await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
      await writeRun(workspace.root, 'synthetic.json', run);
      expectRelativeDiagnostic(await runVerifier(workspace.root), workspace.root, 'E_FIXTURE');
    },
  );

  it('rejects a recorded manifest that its complete run does not reference', async () => {
    const workspace = await makeWorkspace();
    const run = await makeCompleteRun(workspace);
    const manifest = await makeRecordedManifest(workspace.root, {
      manifestId: 'art_synthetic-orphan',
      runId: run.runId as string,
      artifactId: 'blob_synthetic-orphan',
    });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    await writeManifest(workspace.root, 'orphan.json', manifest);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_MANIFEST');
  });

  it('rejects a run-to-manifest reference whose manifest points to another run', async () => {
    const workspace = await makeWorkspace();
    const run = await makeCompleteRun(workspace);
    run.artifactManifestId = 'art_synthetic-mismatched';
    const manifest = await makeRecordedManifest(workspace.root, {
      manifestId: 'art_synthetic-mismatched',
      runId: 'run_synthetic-different',
      artifactId: 'blob_synthetic-mismatched',
    });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    await writeManifest(workspace.root, 'mismatched.json', manifest);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_MANIFEST');
  });

  it('rejects a complete deployed run without workflow and deployment metadata', async () => {
    const workspace = await makeWorkspace();
    const run = await makeCompleteRun(workspace);
    Object.assign(run.build as JsonObject, { deliveryMode: 'deployed', workflowRunId: null, deployUrl: null });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_SCHEMA', 'runs/synthetic.json');
  });

  const fixtureMismatchCases: Array<[string, (run: JsonObject) => void]> = [
    ['source byte size', (run) => { (run.fixture as JsonObject).sourceBytes = 999; }],
    ['storage tier', (run) => { (run.fixture as JsonObject).sourceLocation = 'external'; }],
    ['triangle count', (run) => { (run.fixture as JsonObject).triangles = 999; }],
    ['ordinary point count', (run) => { (run.fixture as JsonObject).ordinaryPoints = 999; }],
    ['splat count', (run) => { (run.fixture as JsonObject).splats = 999; }],
  ];

  it.each(fixtureMismatchCases)('rejects complete-run fixture %s mismatches', async (_label, mutate) => {
    const workspace = await makeWorkspace();
    const run = await makeCompleteRun(workspace);
    mutate(run);
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_FIXTURE');
  });

  const traceCases: Array<[
    string,
    (workspace: SyntheticWorkspace, run: JsonObject) => Promise<void>,
  ]> = [
    ['Git trace hash', async (_workspace, run) => { (run.traceRef as JsonObject).sha256 = SHA_A; }],
    ['Git trace byte size', async (workspace, run) => {
      (run.traceRef as JsonObject).bytes = workspace.trace.bytes + 1;
    }],
    ['Git trace traversal path', async (_workspace, run) => {
      (run.traceRef as JsonObject).restoreLocator = '../outside.trace';
    }],
  ];

  const nonPortableTraceLocators = [
    'fixtures/traces/bad<name.trace',
    'fixtures/traces/CONIN$.trace',
  ];

  it.each(nonPortableTraceLocators)('rejects a non-portable trace locator: %s', async (locator) => {
    const workspace = await makeWorkspace();
    const run = await makeCompleteRun(workspace);
    (run.traceRef as JsonObject).restoreLocator = locator;
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_TRACE');
  });

  it.each(traceCases)('rejects a mismatched or unsafe %s', async (_label, mutate) => {
    const workspace = await makeWorkspace();
    const run = await makeCompleteRun(workspace);
    await mutate(workspace, run);
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_TRACE');
  });

  it('rejects a Git symlink tree entry used as a trace blob', async () => {
    const workspace = await makeWorkspace();
    const locator = 'fixtures/traces/synthetic-symlink.trace';
    const link = await commitGitSymlink(workspace.root, locator, 'synthetic-camera-input.trace');
    const run = await makeCompleteRun(workspace);
    (run.build as JsonObject).gitCommit = link.commit;
    Object.assign(run.traceRef as JsonObject, {
      sourceLocation: 'git',
      restoreLocator: locator,
      sha256: link.sha256,
      bytes: link.bytes,
    });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_TRACE');
  });

  it('rejects a dangling Git commit even when its tree contains the declared build inputs', async () => {
    const workspace = await makeWorkspace();
    const run = await makeCompleteRun(workspace);
    (run.build as JsonObject).gitCommit = await createDanglingCommit(workspace.root);
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_BUILD');
  });

  it('rejects a bracketed Git symlink locator even when its pathspec also matches a regular blob', async () => {
    const workspace = await makeWorkspace();
    const regularPath = resolve(workspace.root, 'fixtures', 'a.trace');
    await writeFile(regularPath, Buffer.from('regular-trace-content\n', 'utf8'));
    const stageResult = await runFile('git', ['add', '--', 'fixtures/a.trace'], { cwd: workspace.root });
    if (stageResult.exitCode !== 0) throw new Error(`git add failed: ${stageResult.stderr}`);

    const locator = 'fixtures/[a].trace';
    const link = await commitGitSymlink(workspace.root, locator, 'a.trace');
    const run = await makeCompleteRun(workspace);
    (run.build as JsonObject).gitCommit = link.commit;
    Object.assign(run.traceRef as JsonObject, {
      sourceLocation: 'git',
      restoreLocator: locator,
      sha256: link.sha256,
      bytes: link.bytes,
    });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_TRACE');
  });

  it('rejects a Git symlink tree entry used as a fixture blob', async () => {
    const workspace = await makeWorkspace();
    const locator = 'fixtures/data/synthetic-symlink-fixture.glb';
    const link = await commitGitSymlink(workspace.root, locator, 'synthetic-g0-mesh.glb');
    const registryPath = resolve(workspace.root, 'fixtures', 'registry.json');
    const registry = await readJson(registryPath);
    const fixture = (registry.fixtures as JsonObject[])[0];
    if (fixture === undefined) throw new Error('Synthetic fixture registry is empty');
    Object.assign(fixture, { byteSize: link.bytes, sha256: link.sha256 });
    Object.assign(fixture.storage as JsonObject, { path: locator });
    await writeJson(registryPath, registry);

    const run = await makeCompleteRun(workspace);
    (run.build as JsonObject).gitCommit = link.commit;
    Object.assign(run.fixture as JsonObject, { sourceBytes: link.bytes, sha256: link.sha256 });
    await writeEnvironment(workspace.root, 'synthetic.json', await makeMeasuredEnvironment(workspace.root));
    await writeRun(workspace.root, 'synthetic.json', run);
    const result = await runVerifier(workspace.root);
    expectRelativeDiagnostic(result, workspace.root, 'E_FIXTURE');
  });
});
