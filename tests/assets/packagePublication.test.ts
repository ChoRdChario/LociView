import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  exportProjectZip,
  importNewProject,
  inspectZip,
  mergeFromInspection,
  type ZipInspection,
} from '../../src/assets/package';
import { addModelAsset } from '../../src/assets/modelAsset';
import { parseHlc } from '../../src/core/hlc';
import { parseOpsJsonl, serializeOps } from '../../src/core/jsonl';
import { parseManifest, type ProjectManifest } from '../../src/core/manifest';
import { mergeOps } from '../../src/core/merge';
import { reduce, versionVector, visibleEntities } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import {
  FaultInjectingMemoryFS,
  type FaultEvent,
  type FaultFileSnapshot,
  type FaultOutcome,
} from '../helpers/faultFs';
import {
  ResolvedCorruptingMemoryFS,
  type ResolvedCorruptionMode,
} from '../helpers/resolvedCorruptingFs';
import { sanitizeZipPath, writeZipEntries, type ZipEntryData } from '../../src/assets/zipio';
import { rawZipEntryShapes } from '../helpers/maliciousZip';

const USER_A: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000040',
  deviceId: 'dev_00000000000000000000000040',
  displayName: 'blob publication A',
});
const USER_B: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000041',
  deviceId: 'dev_00000000000000000000000041',
  displayName: 'blob publication B',
});
const USER_C: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000042',
  deviceId: 'dev_00000000000000000000000042',
  displayName: 'blob publication C',
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASE_BYTES = encoder.encode('solid base\nendsolid base\n');
const PEER_B_BYTES = encoder.encode('solid peer-b\nendsolid peer-b\n');
const PEER_C_BYTES = encoder.encode('solid peer-c\nendsolid peer-c\n');
const IMPORT_MODEL_ROLES: readonly KnownModelRole[] = [
  { originalName: 'source-a.stl', bytes: BASE_BYTES },
  { originalName: 'source-b.stl', bytes: PEER_B_BYTES },
];
const MERGE_MODEL_ROLES: readonly KnownModelRole[] = [
  { originalName: 'base.stl', bytes: BASE_BYTES },
  { originalName: 'peer-b.stl', bytes: PEER_B_BYTES },
  { originalName: 'peer-c.stl', bytes: PEER_C_BYTES },
];

function bytesEqual(actual: Uint8Array | null, expected: Uint8Array): boolean {
  return actual !== null &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function operationKey(op: Op): string {
  return `${op.actor}#${op.op}`;
}

async function materializeSnapshot(snapshot: FaultFileSnapshot): Promise<MemoryFS> {
  const fs = new MemoryFS();
  for (const [path, bytes] of snapshot.files) {
    if (bytes !== null) await fs.writeBytes(path, bytes);
  }
  return fs;
}

async function copyWorkspace(source: MemoryFS, target: MemoryFS): Promise<void> {
  for (const path of await source.list('')) {
    const bytes = await source.readBytes(path);
    if (bytes !== null) await target.writeBytes(path, bytes);
  }
}

async function settle(promise: Promise<unknown>): Promise<{ rejected: boolean; message: string | null }> {
  try {
    await promise;
    return { rejected: false, message: null };
  } catch (error) {
    return {
      rejected: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function settleValue<T>(promise: Promise<T>): Promise<{
  rejected: boolean;
  value: T | null;
}> {
  try {
    return { rejected: false, value: await promise };
  } catch {
    return { rejected: true, value: null };
  }
}

async function settleInspection(bytes: Uint8Array): Promise<{
  rejected: boolean;
  inspection: ZipInspection | null;
}> {
  try {
    return { rejected: false, inspection: await inspectZip(bytes) };
  } catch {
    return { rejected: true, inspection: null };
  }
}

class PausingWriteMemoryFS extends FaultInjectingMemoryFS {
  private pausedPath: string | null = null;
  private reachedResolve: (() => void) | null = null;
  private releaseResolve: (() => void) | null = null;
  private releasePromise: Promise<void> = Promise.resolve();

  pauseNextWrite(path: string): { reached: Promise<void>; release: () => void } {
    if (this.pausedPath !== null) throw new Error(`write pause already armed for ${this.pausedPath}`);
    this.pausedPath = path;
    const reached = new Promise<void>((resolve) => {
      this.reachedResolve = resolve;
    });
    this.releasePromise = new Promise<void>((resolve) => {
      this.releaseResolve = resolve;
    });
    return {
      reached,
      release: () => this.releaseResolve?.(),
    };
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    if (path === this.pausedPath) {
      this.pausedPath = null;
      this.reachedResolve?.();
      await this.releasePromise;
    }
    await super.writeBytes(path, data);
  }
}

interface ImportFixture {
  inspection: ZipInspection;
  expectedState: ProjectStore['state'];
  expectedManifest: ProjectManifest;
  expectedOperationObjects: readonly Op[];
  expectedOps: ReadonlyMap<string, string>;
  expectedBinaries: ReadonlyMap<string, Uint8Array>;
  requiredBinaryPaths: readonly string[];
  healthyEntries: readonly ZipEntryData[];
}

function operationsByKey(ops: readonly Op[]): Op[] {
  return [...ops].sort((left, right) => operationKey(left).localeCompare(operationKey(right)));
}

function requiredBinaryPathsFromOps(ops: readonly Op[]): string[] {
  const paths = new Set<string>();
  for (const op of ops) {
    if (op.e !== 'asset' || op.t === 'delete' || op.v === undefined) continue;
    for (const key of ['path', 'optimizedPath'] as const) {
      const path = op.v[key];
      if (typeof path === 'string') paths.add(path);
    }
  }
  return [...paths].sort();
}

interface KnownModelRole {
  originalName: string;
  bytes: Uint8Array;
}

function expectedModelFields(id: string, role: KnownModelRole): Record<string, unknown> {
  const extension = role.originalName.split('.').pop()!.toLowerCase();
  return {
    kind: 'model',
    path: `models/${id}.${extension}`,
    originalName: role.originalName,
    mime: '',
    size: role.bytes.length,
    transform: { scale: 1, upAxis: 'Y' },
    pinScale: 1,
  };
}

function knownModelAssetsAreExact(
  state: ProjectStore['state'],
  ops: readonly Op[],
  binaries: ReadonlyMap<string, Uint8Array>,
  roles: readonly KnownModelRole[],
): boolean {
  const assets = visibleEntities(state, 'asset');
  const assetOps = ops.filter((op) => op.e === 'asset');
  const assetCreates = assetOps.filter((op) => op.t === 'create');
  if (
    assets.length !== roles.length ||
    assetOps.length !== roles.length ||
    assetCreates.length !== roles.length
  ) {
    return false;
  }

  const expectedPaths: string[] = [];
  for (const role of roles) {
    const matchingAssets = assets.filter((asset) => asset.fields.originalName === role.originalName);
    if (matchingAssets.length !== 1) return false;
    const asset = matchingAssets[0]!;
    const expectedFields = expectedModelFields(asset.id, role);
    const matchingOps = assetCreates.filter((op) => op.id === asset.id);
    const path = expectedFields.path as string;
    if (
      !asset.id.startsWith('ast_') ||
      !isDeepStrictEqual(asset.fields, expectedFields) ||
      matchingOps.length !== 1 ||
      !isDeepStrictEqual(matchingOps[0]!.v, expectedFields) ||
      !bytesEqual(binaries.get(path) ?? null, role.bytes)
    ) {
      return false;
    }
    expectedPaths.push(path);
  }

  return isDeepStrictEqual(
    [...binaries.keys()].sort(),
    expectedPaths.sort(),
  ) && isDeepStrictEqual(requiredBinaryPathsFromOps(ops), expectedPaths.sort());
}

function importFixtureFromInspection(
  inspection: ZipInspection,
  expectedState: ProjectStore['state'],
): ImportFixture {
  if (inspection.manifest === null) throw new Error('import fixture lacks a manifest');
  const healthyEntries: ZipEntryData[] = [
    {
      path: 'lociview.json',
      data: encoder.encode(JSON.stringify(inspection.manifest, null, 2)),
    },
    ...inspection.opsFiles.map((file) => ({ path: file.path, data: encoder.encode(file.text) })),
    ...inspection.binaries.map((binary) => ({
      path: binary.path,
      data: new Uint8Array(binary.data),
    })),
  ];
  return {
    inspection,
    expectedState,
    expectedManifest: inspection.manifest,
    expectedOperationObjects: operationsByKey(inspection.ops),
    expectedOps: new Map(inspection.opsFiles.map((file) => [file.path, file.text])),
    expectedBinaries: new Map(inspection.binaries.map((binary) => [binary.path, binary.data])),
    requiredBinaryPaths: requiredBinaryPathsFromOps(inspection.ops),
    healthyEntries,
  };
}

async function makeImportFixture(): Promise<ImportFixture> {
  const fs = new MemoryFS();
  const dir = 'projects/import-source';
  const storeA = await ProjectStore.create(fs, dir, 'two-actor import source', USER_A);
  await addModelAsset(fs, dir, storeA, 'source-a.stl', BASE_BYTES);
  await storeA.flush();

  const storeB = await ProjectStore.open(fs, dir, USER_B);
  await addModelAsset(fs, dir, storeB, 'source-b.stl', PEER_B_BYTES);
  await storeB.flush();
  const inspection = await inspectZip(await exportProjectZip(fs, dir, storeB));
  return importFixtureFromInspection(inspection, storeB.state);
}

interface ImportClosure {
  active: boolean;
  complete: boolean;
  safe: boolean;
}

async function inspectImportedClosure(
  fs: MemoryFS,
  dir: string,
  fixture: ImportFixture,
): Promise<ImportClosure> {
  const markerPaths = (await fs.list('projects/'))
    .filter((path) => path.endsWith('/lociview.json'))
    .sort();
  const manifestText = await fs.readText(`${dir}/lociview.json`);
  if (manifestText === null) {
    const active = markerPaths.length > 0;
    return { active, complete: false, safe: !active };
  }

  let manifestComplete = false;
  try {
    manifestComplete = isDeepStrictEqual(parseManifest(manifestText), fixture.expectedManifest);
  } catch {
    manifestComplete = false;
  }
  const opsComplete = (
    await Promise.all(
      [...fixture.expectedOps].map(async ([path, text]) => (await fs.readText(`${dir}/${path}`)) === text),
    )
  ).every(Boolean);
  const expectedActiveOpsPaths = [...fixture.expectedOps.keys()]
    .map((path) => `${dir}/${path}`)
    .sort();
  const activeOpsPaths = (await fs.list(`${dir}/ops/`))
    .filter((path) => path.endsWith('.jsonl'))
    .sort();
  const binariesComplete = (
    await Promise.all(
      [...fixture.expectedBinaries].map(async ([path, bytes]) =>
        bytesEqual(await fs.readBytes(`${dir}/${path}`), bytes)),
    )
  ).every(Boolean);

  let reopened: ProjectStore;
  try {
    reopened = await ProjectStore.open(fs, dir, USER_C);
  } catch {
    return { active: true, complete: false, safe: false };
  }
  const stateComplete =
    reopened.loadErrors.length === 0 &&
    isDeepStrictEqual(reopened.state, fixture.expectedState) &&
    isDeepStrictEqual(operationsByKey(reopened.allOps), fixture.expectedOperationObjects);
  const complete =
    isDeepStrictEqual(markerPaths, [`${dir}/lociview.json`]) &&
    manifestComplete &&
    isDeepStrictEqual(activeOpsPaths, expectedActiveOpsPaths) &&
    opsComplete &&
    binariesComplete &&
    stateComplete;
  return { active: true, complete, safe: complete };
}

async function importMarkerHistoryIsSafe(
  fs: FaultInjectingMemoryFS,
  dir: string,
  fixture: ImportFixture,
  snapshotToken: string,
): Promise<boolean> {
  const markerPath = `${dir}/lociview.json`;
  const expectedLogPaths = [...fixture.expectedOps.keys()]
    .map((path) => `${dir}/${path}`)
    .sort();
  const expectedLogSet = new Set(expectedLogPaths);
  const requiredBlobPaths = new Set(
    fixture.requiredBinaryPaths.map((path) => `${dir}/${path}`),
  );
  const committed = fs.events
    .filter((event): event is FaultEvent & { commitIndex: number } => event.commitIndex !== null)
    .sort((left, right) => left.commitIndex - right.commitIndex);
  const markerEvents = committed.filter((event) =>
    event.path.startsWith('projects/') && event.path.endsWith('/lociview.json'));
  const directMarkerEvents = markerEvents.filter((event) => event.path === markerPath);
  const snapshots = fs.fileSnapshots.filter((snapshot) => snapshot.token === snapshotToken);
  const snapshotByEvent = new Map(snapshots.map((snapshot) => [snapshot.eventIndex, snapshot]));
  if (directMarkerEvents.length !== snapshots.length) return false;

  const closureCommits = committed.filter((event) =>
    expectedLogSet.has(event.path) || requiredBlobPaths.has(event.path));
  const presentMarkers = new Set<string>();
  const presentActiveLogs = new Set<string>();
  let safe = true;
  let lastDirectMarkerRemoval = 0;

  for (const event of committed) {
    const publishedBeforeEvent = presentMarkers.size > 0;
    const activeLog = event.path.startsWith(`${dir}/ops/`) && event.path.endsWith('.jsonl');
    if (publishedBeforeEvent && (activeLog || requiredBlobPaths.has(event.path))) safe = false;

    if (event.path.startsWith('projects/') && event.path.endsWith('/lociview.json')) {
      if (event.method === 'remove') presentMarkers.delete(event.path);
      else presentMarkers.add(event.path);
      if (event.path !== markerPath && event.method !== 'remove') safe = false;
    }
    if (activeLog) {
      if (event.method === 'remove') presentActiveLogs.delete(event.path);
      else presentActiveLogs.add(event.path);
    }

    if (event.path === markerPath && event.method !== 'remove') {
      const lastClosureCommitInSegment = Math.max(
        lastDirectMarkerRemoval,
        ...closureCommits
          .filter((candidate) =>
            candidate.commitIndex > lastDirectMarkerRemoval &&
            candidate.commitIndex <= event.commitIndex)
          .map((candidate) => candidate.commitIndex),
      );
      if (event.startIndex <= lastClosureCommitInSegment) safe = false;
      if (!isDeepStrictEqual([...presentMarkers].sort(), [markerPath])) safe = false;
      if (!isDeepStrictEqual([...presentActiveLogs].sort(), expectedLogPaths)) safe = false;
      const snapshot = snapshotByEvent.get(event.commitIndex);
      if (
        snapshot === undefined ||
        !(await inspectImportedClosure(await materializeSnapshot(snapshot), dir, fixture)).complete
      ) {
        safe = false;
      }
    }
    if (event.path === markerPath && event.method === 'remove') {
      lastDirectMarkerRemoval = event.commitIndex;
    }
  }
  return safe;
}

interface MergeFixture {
  targetFs: FaultInjectingMemoryFS;
  targetDir: string;
  targetStore: ProjectStore;
  targetIdentity: Readonly<Identity>;
  inspection: ZipInspection;
  baselineManifestText: string;
  baselineState: ProjectStore['state'];
  baselineOps: readonly Op[];
  baselineVector: Readonly<Record<string, number>>;
  baselineOpsFiles: ReadonlyMap<string, string>;
  completeState: ProjectStore['state'];
  completeOps: readonly Op[];
  completeVector: Readonly<Record<string, number>>;
  completeOpsFiles: ReadonlyMap<string, string>;
  baselineAssetIds: string[];
  baselinePath: string;
  baselineOpKeys: string[];
  incomingOpKeys: string[];
  incomingAssetIds: [string, string];
  incomingActors: [string, string];
  existingIncomingActor: string;
  newIncomingActor: string;
  incomingBinaries: [ZipInspection['binaries'][number], ZipInspection['binaries'][number]];
  expectedBinaries: ReadonlyMap<string, Uint8Array>;
}

async function readActiveOpsFiles(fs: MemoryFS, dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const path of (await fs.list(`${dir}/ops/`)).filter((item) => item.endsWith('.jsonl'))) {
    const text = await fs.readText(path);
    if (text === null) throw new Error(`listed active operation log is unreadable: ${path}`);
    files.set(path, text);
  }
  return files;
}

function expectedMergedOpsFiles(
  baseline: ReadonlyMap<string, string>,
  dir: string,
  incoming: readonly Op[],
): Map<string, string> {
  const expected = new Map(baseline);
  const byActor = new Map<string, Op[]>();
  for (const op of incoming) {
    const actorOps = byActor.get(op.actor) ?? [];
    actorOps.push(op);
    byActor.set(op.actor, actorOps);
  }
  for (const [actor, ops] of byActor) {
    const path = `${dir}/ops/${actor}.jsonl`;
    expected.set(path, (expected.get(path) ?? '') + serializeOps(ops));
  }
  return expected;
}

async function makeMergeFixture(
  targetFs = new FaultInjectingMemoryFS(),
  targetIdentity: Readonly<Identity> = USER_A,
  baselineAssetOmitsSize = false,
): Promise<MergeFixture> {
  const targetDir = 'projects/merge-target';
  const createdStore = await ProjectStore.create(targetFs, targetDir, 'two-actor merge target', USER_A);
  const baselineAssetId = await addModelAsset(targetFs, targetDir, createdStore, 'base.stl', BASE_BYTES);
  await createdStore.flush();
  if (baselineAssetOmitsSize) {
    const baselineAssetOp = createdStore.allOps.find(
      (op) => op.e === 'asset' && op.id === baselineAssetId && op.v !== undefined,
    );
    if (baselineAssetOp?.v === undefined) throw new Error('merge fixture lacks its baseline asset op');
    const logPath = `${targetDir}/ops/${baselineAssetOp.actor}.jsonl`;
    const parsed = parseOpsJsonl((await targetFs.readText(logPath)) ?? '');
    if (parsed.errors.length !== 0) throw new Error('merge fixture baseline log is not parseable');
    await targetFs.writeText(logPath, serializeOps(parsed.ops.map((op): Op => {
      if (operationKey(op) !== operationKey(baselineAssetOp) || op.v === undefined) return op;
      const v = { ...op.v };
      delete v.size;
      return { ...op, v };
    })));
  }

  const seedB = await ProjectStore.open(targetFs, targetDir, USER_B);
  seedB.createEntity('caption', { title: 'existing actor-B log seed' });
  await seedB.flush();
  const targetStore = await ProjectStore.open(targetFs, targetDir, targetIdentity);
  const baselineManifestText = await targetFs.readText(`${targetDir}/lociview.json`);
  if (baselineManifestText === null) throw new Error('merge fixture lacks its baseline manifest');
  const baselineState = structuredClone(targetStore.state);
  const baselineOps = operationsByKey(targetStore.allOps);
  const baselineVector = { ...targetStore.vector };
  const baselineOpsFiles = await readActiveOpsFiles(targetFs, targetDir);
  const baselineAssetIds = visibleEntities(targetStore.state, 'asset').map((asset) => asset.id).sort();
  const baselinePath = targetStore.state.byKind.asset![baselineAssetId]!.fields.path as string;
  const baseKeys = new Set(targetStore.allOps.map(operationKey));
  const baseZip = await exportProjectZip(targetFs, targetDir, targetStore);

  const peerFs = new MemoryFS();
  const peerDir = 'projects/merge-peer';
  await importNewProject(peerFs, peerDir, await inspectZip(baseZip));
  const peerB = await ProjectStore.open(peerFs, peerDir, USER_B);
  const assetB = await addModelAsset(peerFs, peerDir, peerB, 'peer-b.stl', PEER_B_BYTES);
  await peerB.flush();
  const peerC = await ProjectStore.open(peerFs, peerDir, USER_C);
  const assetC = await addModelAsset(peerFs, peerDir, peerC, 'peer-c.stl', PEER_C_BYTES);
  await peerC.flush();
  const inspection = await inspectZip(await exportProjectZip(peerFs, peerDir, peerC));
  const incomingOps = inspection.ops.filter((op) => !baseKeys.has(operationKey(op)));
  const incomingActors = [...new Set(incomingOps.map((op) => op.actor))].sort();
  const incomingPaths = new Set(
    [assetB, assetC].map((assetId) => peerC.state.byKind.asset![assetId]!.fields.path as string),
  );
  const incomingBinaries = inspection.binaries.filter((binary) => incomingPaths.has(binary.path));
  if (incomingActors.length !== 2 || incomingBinaries.length !== 2) {
    throw new Error('merge fixture must contain exactly two incoming actors and two exclusive blobs');
  }
  const existingActors = [];
  const newActors = [];
  for (const actor of incomingActors) {
    if (await targetFs.exists(`${targetDir}/ops/${actor}.jsonl`)) existingActors.push(actor);
    else newActors.push(actor);
  }
  if (existingActors.length !== 1 || newActors.length !== 1) {
    throw new Error('merge fixture must append one existing actor log and create one new actor log');
  }
  const completeOpsInStorageOrder = [...targetStore.allOps, ...incomingOps];
  const completeState = reduce(completeOpsInStorageOrder);
  const completeOps = operationsByKey(completeOpsInStorageOrder);
  const completeVector = versionVector(completeOpsInStorageOrder);
  const completeOpsFiles = expectedMergedOpsFiles(
    baselineOpsFiles,
    targetDir,
    incomingOps,
  );
  return {
    targetFs,
    targetDir,
    targetStore,
    targetIdentity,
    inspection,
    baselineManifestText,
    baselineState,
    baselineOps,
    baselineVector,
    baselineOpsFiles,
    completeState,
    completeOps,
    completeVector,
    completeOpsFiles,
    baselineAssetIds,
    baselinePath,
    baselineOpKeys: [...baseKeys].sort(),
    incomingOpKeys: incomingOps.map(operationKey).sort(),
    incomingAssetIds: [assetB, assetC],
    incomingActors: [incomingActors[0]!, incomingActors[1]!],
    existingIncomingActor: existingActors[0]!,
    newIncomingActor: newActors[0]!,
    incomingBinaries: [incomingBinaries[0]!, incomingBinaries[1]!],
    expectedBinaries: new Map(inspection.binaries.map((binary) => [binary.path, binary.data])),
  };
}

interface ExpectedBlobReference {
  path: string;
  bytes: Uint8Array;
}

function expectedVisibleBlobReferences(
  state: ProjectStore['state'],
  fixture: MergeFixture,
): ExpectedBlobReference[] | null {
  const references = new Map<string, Uint8Array>();
  for (const asset of visibleEntities(state, 'asset')) {
    for (const [pathKey, sizeKey] of [
      ['path', 'size'],
      ['optimizedPath', 'optimizedSize'],
    ] as const) {
      const path = asset.fields[pathKey];
      if (pathKey === 'optimizedPath' && (path === undefined || path === '')) continue;
      const expected = typeof path === 'string' ? fixture.expectedBinaries.get(path) : undefined;
      const actualSize = asset.fields[sizeKey];
      if (
        typeof path !== 'string' ||
        expected === undefined ||
        (actualSize !== undefined && actualSize !== expected.length)
      ) {
        return null;
      }
      const previous = references.get(path);
      if (previous !== undefined && !bytesEqual(previous, expected)) return null;
      references.set(path, expected);
    }
  }
  return [...references].map(([path, bytes]) => ({ path, bytes }));
}

async function visibleBlobReferencesAreExact(
  fs: MemoryFS,
  state: ProjectStore['state'],
  fixture: MergeFixture,
): Promise<boolean> {
  const references = expectedVisibleBlobReferences(state, fixture);
  if (references === null) return false;
  return (await Promise.all(references.map(async ({ path, bytes }) =>
    bytesEqual(await fs.readBytes(`${fixture.targetDir}/${path}`), bytes)))).every(Boolean);
}

function mergeSnapshotPathsForAuthority(fixture: MergeFixture): string[] {
  return [
    `${fixture.targetDir}/lociview.json`,
    ...fixture.completeOpsFiles.keys(),
    ...[...fixture.expectedBinaries.keys()].map((path) => `${fixture.targetDir}/${path}`),
  ];
}

function snapshotHasExactOpsFiles(
  snapshot: FaultFileSnapshot,
  fixture: MergeFixture,
  expected: ReadonlyMap<string, string>,
): boolean {
  const actualFiles = new Map<string, string>();
  for (const path of fixture.completeOpsFiles.keys()) {
    const actualBytes = snapshot.files.get(path);
    const expectedText = expected.get(path);
    if (expectedText === undefined) {
      if (actualBytes !== null) return false;
      continue;
    }
    if (actualBytes === undefined || actualBytes === null) return false;
    actualFiles.set(path, decoder.decode(actualBytes));
  }
  return opsFilesMatchAuthority(actualFiles, expected, fixture.baselineOpsFiles);
}

function snapshotHasExactVisibleAuthority(
  snapshot: FaultFileSnapshot | undefined,
  state: ProjectStore['state'],
  fixture: MergeFixture,
): boolean {
  if (snapshot === undefined) return false;
  const marker = snapshot.files.get(`${fixture.targetDir}/lociview.json`);
  if (marker === undefined || marker === null) return false;
  try {
    if (!isDeepStrictEqual(
      parseManifest(decoder.decode(marker)),
      parseManifest(fixture.baselineManifestText),
    )) return false;
  } catch {
    return false;
  }
  if (
    !snapshotHasExactOpsFiles(snapshot, fixture, fixture.baselineOpsFiles) &&
    !snapshotHasExactOpsFiles(snapshot, fixture, fixture.completeOpsFiles)
  ) {
    return false;
  }
  const references = expectedVisibleBlobReferences(state, fixture);
  return references !== null && references.every(({ path, bytes }) =>
    bytesEqual(snapshot.files.get(`${fixture.targetDir}/${path}`) ?? null, bytes));
}

interface ExactMergeAuthority {
  oldAuthority: boolean;
  completeAuthority: boolean;
  blobsMatch: boolean;
  safe: boolean;
}

type MergeAuthorityKind = 'old' | 'complete';

function currentMergeAuthorityKind(fixture: MergeFixture): MergeAuthorityKind | null {
  const ops = operationsByKey(fixture.targetStore.allOps);
  const old =
    isDeepStrictEqual(fixture.targetStore.state, fixture.baselineState) &&
    isDeepStrictEqual(ops, fixture.baselineOps) &&
    isDeepStrictEqual(fixture.targetStore.vector, fixture.baselineVector);
  if (old) return 'old';
  const complete =
    isDeepStrictEqual(fixture.targetStore.state, fixture.completeState) &&
    isDeepStrictEqual(ops, fixture.completeOps) &&
    isDeepStrictEqual(fixture.targetStore.vector, fixture.completeVector);
  return complete ? 'complete' : null;
}

function exactMergeAuthorityKind(authority: ExactMergeAuthority): MergeAuthorityKind | null {
  if (authority.oldAuthority && !authority.completeAuthority) return 'old';
  if (authority.completeAuthority && !authority.oldAuthority) return 'complete';
  return null;
}

interface ClockPosition {
  physical: number;
  counter: number;
}

function compareClockPosition(left: ClockPosition, right: ClockPosition): number {
  return left.physical - right.physical || left.counter - right.counter;
}

function maximumClockPosition(ops: readonly Op[]): ClockPosition {
  if (ops.length === 0) throw new Error('clock probe requires at least one operation');
  return ops.reduce<ClockPosition>((maximum, op) => {
    const parsed = parseHlc(op.hlc);
    const candidate = { physical: parsed.physical, counter: parsed.counter };
    return compareClockPosition(candidate, maximum) > 0 ? candidate : maximum;
  }, { physical: 0, counter: 0 });
}

function incomingOpsForFixture(fixture: MergeFixture): Op[] {
  const baselineKeys = new Set(fixture.baselineOps.map(operationKey));
  return fixture.completeOps.filter((op) => !baselineKeys.has(operationKey(op)));
}

function mergeProbeShapeIsValid(fixture: MergeFixture): boolean {
  const incoming = incomingOpsForFixture(fixture);
  const baselineClock = maximumClockPosition(fixture.baselineOps);
  const incomingClock = maximumClockPosition(incoming);
  const actor = fixture.targetStore.actorId;
  return (
    compareClockPosition(incomingClock, baselineClock) > 0 &&
    (fixture.completeVector[actor] ?? 0) > (fixture.baselineVector[actor] ?? 0) &&
    incoming.some((op) => op.actor === actor) &&
    baselineClock.physical > 0
  );
}

function mergeProbeNow(fixture: MergeFixture): number {
  return maximumClockPosition(fixture.baselineOps).physical - 1;
}

async function probeOldMergeStore(
  fixture: MergeFixture,
  twinFs: MemoryFS,
  twinStore: ProjectStore,
): Promise<boolean> {
  const input = {
    t: 'create' as const,
    e: 'caption',
    id: 'cap_00000000000000000000000049',
    v: { title: 'post-rejection merge clock and sequence probe' },
  };
  const actual = fixture.targetStore.dispatch(input);
  const twin = twinStore.dispatch(input);
  const [targetFlush, twinFlush] = await Promise.all([
    settle(fixture.targetStore.flush()),
    settle(twinStore.flush()),
  ]);
  if (twinFlush.rejected) throw new Error('merge probe twin flush failed');
  const twinReopened = await ProjectStore.open(twinFs, fixture.targetDir, fixture.targetIdentity);
  const targetReopened = await settleValue(
    ProjectStore.open(fixture.targetFs, fixture.targetDir, fixture.targetIdentity),
  );
  if (targetReopened.value === null) return false;
  const targetFiles = await readActiveOpsFiles(fixture.targetFs, fixture.targetDir);
  const twinFiles = await readActiveOpsFiles(twinFs, fixture.targetDir);
  return (
    !targetFlush.rejected &&
    isDeepStrictEqual(actual, twin) &&
    isDeepStrictEqual(fixture.targetStore.state, twinStore.state) &&
    isDeepStrictEqual(
      operationsByKey(fixture.targetStore.allOps),
      operationsByKey(twinStore.allOps),
    ) &&
    isDeepStrictEqual(fixture.targetStore.vector, twinStore.vector) &&
    targetReopened.value.loadErrors.length === 0 &&
    twinReopened.loadErrors.length === 0 &&
    isDeepStrictEqual(targetReopened.value.state, twinReopened.state) &&
    isDeepStrictEqual(
      operationsByKey(targetReopened.value.allOps),
      operationsByKey(twinReopened.allOps),
    ) &&
    isDeepStrictEqual(targetReopened.value.vector, twinReopened.vector) &&
    mapsAreDeepEqual(targetFiles, twinFiles)
  );
}

function mapsAreDeepEqual<V>(
  actual: ReadonlyMap<string, V>,
  expected: ReadonlyMap<string, V>,
): boolean {
  const entries = (value: ReadonlyMap<string, V>): Array<[string, V]> =>
    [...value.entries()].sort(([left], [right]) => left.localeCompare(right));
  return isDeepStrictEqual(entries(actual), entries(expected));
}

function opsFilesMatchAuthority(
  actual: ReadonlyMap<string, string>,
  expected: ReadonlyMap<string, string>,
  baseline: ReadonlyMap<string, string>,
): boolean {
  const actualPaths = [...actual.keys()].sort();
  const expectedPaths = [...expected.keys()].sort();
  if (!isDeepStrictEqual(actualPaths, expectedPaths)) return false;
  for (const path of expectedPaths) {
    const actualText = actual.get(path);
    const expectedText = expected.get(path);
    if (actualText === undefined || expectedText === undefined) return false;
    const baselineText = baseline.get(path);
    if (baselineText !== undefined && !actualText.startsWith(baselineText)) return false;
    const actualParsed = parseOpsJsonl(actualText);
    const expectedParsed = parseOpsJsonl(expectedText);
    if (actualParsed.errors.length !== 0 || expectedParsed.errors.length !== 0) return false;
    const fileActor = path.slice(path.lastIndexOf('/') + 1, -'.jsonl'.length);
    if (
      actualParsed.ops.some((op) => op.actor !== fileActor) ||
      expectedParsed.ops.some((op) => op.actor !== fileActor) ||
      !isDeepStrictEqual(actualParsed.ops, expectedParsed.ops)
    ) {
      return false;
    }
  }
  return true;
}

function semanticallyReformatJsonl(text: string): string {
  if (text === '') return '';
  const parsed = parseOpsJsonl(text);
  if (parsed.errors.length !== 0) throw new Error('cannot reformat malformed JSONL control');
  return `${parsed.ops.map((op) => JSON.stringify({
    ...(op.v === undefined ? {} : { v: op.v }),
    id: op.id,
    e: op.e,
    t: op.t,
    user: op.user,
    actor: op.actor,
    hlc: op.hlc,
    op: op.op,
  })).join('\n')}\n`;
}

async function inspectExactMergeAuthority(
  fixture: MergeFixture,
  fs: MemoryFS = fixture.targetFs,
): Promise<ExactMergeAuthority> {
  let reopened: ProjectStore;
  try {
    reopened = await ProjectStore.open(fs, fixture.targetDir, USER_A);
  } catch {
    return { oldAuthority: false, completeAuthority: false, blobsMatch: false, safe: false };
  }
  const markerPaths = (await fs.list('projects/'))
    .filter((path) => path.endsWith('/lociview.json'))
    .sort();
  const manifestPath = `${fixture.targetDir}/lociview.json`;
  const manifestText = await fs.readText(manifestPath);
  let manifestExact = false;
  try {
    manifestExact =
      isDeepStrictEqual(markerPaths, [manifestPath]) &&
      manifestText !== null &&
      isDeepStrictEqual(
        parseManifest(manifestText),
        parseManifest(fixture.baselineManifestText),
      );
  } catch {
    manifestExact = false;
  }
  const activeOpsFiles = await readActiveOpsFiles(fs, fixture.targetDir);
  const reopenedOps = operationsByKey(reopened.allOps);
  const oldAuthority =
    manifestExact &&
    reopened.loadErrors.length === 0 &&
    isDeepStrictEqual(reopened.state, fixture.baselineState) &&
    isDeepStrictEqual(reopenedOps, fixture.baselineOps) &&
    isDeepStrictEqual(reopened.vector, fixture.baselineVector) &&
    opsFilesMatchAuthority(activeOpsFiles, fixture.baselineOpsFiles, fixture.baselineOpsFiles);
  const completeAuthority =
    manifestExact &&
    reopened.loadErrors.length === 0 &&
    isDeepStrictEqual(reopened.state, fixture.completeState) &&
    isDeepStrictEqual(reopenedOps, fixture.completeOps) &&
    isDeepStrictEqual(reopened.vector, fixture.completeVector) &&
    opsFilesMatchAuthority(activeOpsFiles, fixture.completeOpsFiles, fixture.baselineOpsFiles);

  const blobsMatch = await visibleBlobReferencesAreExact(fs, reopened.state, fixture);
  return {
    oldAuthority,
    completeAuthority,
    blobsMatch,
    safe: blobsMatch && (oldAuthority || completeAuthority),
  };
}

interface MergeAuthorityHistoryWatch {
  tokenByPath: ReadonlyMap<string, string>;
}

function mergeAuthorityMutationPathsAreKnown(
  fixture: MergeFixture,
  scenarioEvents: readonly FaultEvent[],
): boolean {
  const targetMarker = `${fixture.targetDir}/lociview.json`;
  const knownLogs = new Set(fixture.completeOpsFiles.keys());
  for (const event of scenarioEvents) {
    if (event.commitIndex === null || event.method === 'remove') continue;
    if (event.path.startsWith('projects/') && event.path.endsWith('/lociview.json')) {
      if (event.path !== targetMarker) return false;
      continue;
    }
    if (
      event.path.startsWith(`${fixture.targetDir}/ops/`) &&
      event.path.endsWith('.jsonl') &&
      !knownLogs.has(event.path)
    ) {
      return false;
    }
  }
  return true;
}

function armMergeAuthorityHistory(
  fs: FaultInjectingMemoryFS,
  fixture: MergeFixture,
  tokenPrefix: string,
): MergeAuthorityHistoryWatch {
  const authorityPaths = [
    `${fixture.targetDir}/lociview.json`,
    ...fixture.completeOpsFiles.keys(),
  ].sort();
  const snapshotPaths = [
    ...authorityPaths,
    ...[...fixture.expectedBinaries.keys()].map((path) => `${fixture.targetDir}/${path}`),
  ];
  const tokenByPath = new Map<string, string>();
  authorityPaths.forEach((path, index) => {
    const token = `${tokenPrefix}-${index}`;
    tokenByPath.set(path, token);
    fs.watchFilesAfterCommit(token, path, snapshotPaths);
  });
  return { tokenByPath };
}

async function mergeAuthorityHistoryIsSafe(
  fs: FaultInjectingMemoryFS,
  fixture: MergeFixture,
  scenarioEvents: readonly FaultEvent[],
  watch: MergeAuthorityHistoryWatch,
): Promise<boolean> {
  if (!mergeAuthorityMutationPathsAreKnown(fixture, scenarioEvents)) return false;
  const targetMarker = `${fixture.targetDir}/lociview.json`;
  for (const event of scenarioEvents) {
    if (event.commitIndex === null) continue;
    const projectMarker =
      event.path.startsWith('projects/') && event.path.endsWith('/lociview.json');
    const activeLog =
      event.path.startsWith(`${fixture.targetDir}/ops/`) && event.path.endsWith('.jsonl');
    if (!projectMarker && !activeLog) continue;
    if (projectMarker && event.path !== targetMarker) {
      if (event.method !== 'remove') return false;
      continue;
    }
    const token = watch.tokenByPath.get(event.path);
    if (token === undefined) {
      if (event.method !== 'remove') return false;
      continue;
    }
    const snapshot = fs.fileSnapshots.find((candidate) =>
      candidate.token === token && candidate.eventIndex === event.commitIndex);
    if (
      snapshot === undefined ||
      !(await inspectExactMergeAuthority(fixture, await materializeSnapshot(snapshot))).safe
    ) {
      return false;
    }
  }
  return true;
}

function exactMergeAuthorityIsLiveAndCrashSafe(
  fixture: MergeFixture,
  authority: ExactMergeAuthority,
  historySafe: boolean,
): boolean {
  const reopenedKind = exactMergeAuthorityKind(authority);
  if (
    !authority.safe ||
    reopenedKind === null ||
    currentMergeAuthorityKind(fixture) !== reopenedKind
  ) {
    return false;
  }
  return historySafe;
}

async function mergeSnapshotPaths(fixture: MergeFixture): Promise<string[]> {
  const paths = new Set(await fixture.targetFs.list(`${fixture.targetDir}/`));
  for (const actor of fixture.incomingActors) paths.add(`${fixture.targetDir}/ops/${actor}.jsonl`);
  for (const binary of fixture.incomingBinaries) paths.add(`${fixture.targetDir}/${binary.path}`);
  return [...paths].sort();
}

interface ExactObservedMergeState {
  token: string;
  manifest: ProjectStore['manifest'];
  state: ProjectStore['state'];
  ops: readonly Op[];
  vector: Readonly<Record<string, number>>;
}

function observeExactMergeState(
  token: string,
  state: ProjectStore['state'],
  store: ProjectStore,
): ExactObservedMergeState {
  return {
    token,
    manifest: structuredClone(store.manifest),
    state: structuredClone(state),
    ops: operationsByKey(structuredClone([...store.allOps])),
    vector: { ...store.vector },
  };
}

function exactObservedMergePublicationIsSafe(
  observed: ExactObservedMergeState,
  snapshot: FaultFileSnapshot | undefined,
  fixture: MergeFixture,
): boolean {
  let manifestExact = false;
  try {
    manifestExact = isDeepStrictEqual(
      observed.manifest,
      parseManifest(fixture.baselineManifestText),
    );
  } catch {
    manifestExact = false;
  }
  if (!manifestExact) return false;
  const oldAuthority =
    isDeepStrictEqual(observed.state, fixture.baselineState) &&
    isDeepStrictEqual(observed.ops, fixture.baselineOps) &&
    isDeepStrictEqual(observed.vector, fixture.baselineVector);
  const completeAuthority =
    isDeepStrictEqual(observed.state, fixture.completeState) &&
    isDeepStrictEqual(observed.ops, fixture.completeOps) &&
    isDeepStrictEqual(observed.vector, fixture.completeVector);
  const expectedState = oldAuthority
    ? fixture.baselineState
    : completeAuthority
      ? fixture.completeState
      : null;
  return expectedState !== null && snapshotHasExactVisibleAuthority(snapshot, expectedState, fixture);
}

describe.sequential('FaultInjectingMemoryFS publication controls', () => {
  it('distinguishes throw-before, prefix-write, commit-then-throw and cleanup boundaries', async () => {
    const fs = new FaultInjectingMemoryFS();
    fs.failNext('writeText', 'staging/before.txt', 'before');
    expect(await settle(fs.writeText('staging/before.txt', 'blocked'))).toEqual({
      rejected: true,
      message: 'before',
    });
    expect(await fs.readText('staging/before.txt')).toBeNull();

    fs.failNextAfterPrefix('writeBytes', 'staging/prefix.bin', 3, 'prefix');
    expect(await settle(fs.writeBytes('staging/prefix.bin', encoder.encode('abcdef')))).toEqual({
      rejected: true,
      message: 'prefix',
    });
    expect(await fs.readText('staging/prefix.bin')).toBe('abc');

    fs.failNextAfterCommit('writeText', 'staging/committed.txt', 'committed');
    expect(await settle(fs.writeText('staging/committed.txt', 'durable'))).toEqual({
      rejected: true,
      message: 'committed',
    });
    expect(await fs.readText('staging/committed.txt')).toBe('durable');

    await fs.writeText('staging/remove.bin', 'old');
    fs.failNext('remove', 'staging/remove.bin', 'remove-before');
    expect(await settle(fs.remove('staging/remove.bin'))).toEqual({
      rejected: true,
      message: 'remove-before',
    });
    expect(await fs.exists('staging/remove.bin')).toBe(true);
    fs.failNextAfterCommit('remove', 'staging/remove.bin', 'remove-after');
    expect(await settle(fs.remove('staging/remove.bin'))).toEqual({
      rejected: true,
      message: 'remove-after',
    });
    expect(await fs.exists('staging/remove.bin')).toBe(false);
    fs.assertAllConsumed();

    const faultEvents = fs.events.filter((event) => event.outcome !== 'pass');
    expect(faultEvents.map((event) => event.outcome)).toEqual([
      'throw-before',
      'write-prefix-then-throw',
      'commit-then-throw',
      'throw-before',
      'commit-then-throw',
    ]);
    expect(faultEvents[0]!.commitIndex).toBeNull();
    expect(faultEvents[1]!.commitIndex).toBeGreaterThan(faultEvents[1]!.startIndex);
    expect(faultEvents[2]!.commitIndex).toBeGreaterThan(faultEvents[2]!.startIndex);
  });

  it('matches any durable write method and freezes the file set at the commit boundary', async () => {
    const fs = new FaultInjectingMemoryFS();
    await fs.writeText('staging/baseline.txt', 'baseline');
    fs.watchFilesAfterCommit(
      'method-neutral-prefix',
      'staging/rewritten.txt',
      ['staging/baseline.txt', 'staging/rewritten.txt'],
    );
    fs.failNextWriteAfterPrefix('staging/rewritten.txt', 3, 'neutral-prefix');
    expect(await settle(fs.writeText('staging/rewritten.txt', 'abcdef'))).toEqual({
      rejected: true,
      message: 'neutral-prefix',
    });
    await fs.settleProbes();
    fs.assertAllConsumed();

    const snapshot = fs.fileSnapshots.find((candidate) => candidate.token === 'method-neutral-prefix');
    expect(snapshot).toBeDefined();
    expect(new TextDecoder().decode(snapshot!.files.get('staging/baseline.txt')!)).toBe('baseline');
    expect(new TextDecoder().decode(snapshot!.files.get('staging/rewritten.txt')!)).toBe('abc');
    expect(fs.events.find((event) => event.path === 'staging/rewritten.txt')).toMatchObject({
      method: 'writeText',
      outcome: 'write-prefix-then-throw',
    });
  });
});

for (const mode of ['bitflip', 'truncate'] as const) {
  it(`ResolvedCorruptingMemoryFS ${mode} corrupts once, observes it, and permits exact retry`, async () => {
    const path = `verification/${mode}.bin`;
    const setupPath = `verification/setup-${mode}.bin`;
    const source = encoder.encode(`resolved ${mode} source bytes`);
    const sourceBefore = new Uint8Array(source);
    const fs = new ResolvedCorruptingMemoryFS(path, source, mode);
    await fs.writeBytes(setupPath, source);
    expect(fs.injectionCount).toBe(0);
    fs.beginAction();
    await fs.writeBytes(`verification/private-staging-${mode}.bin`, source);
    expect(fs.injectionCount).toBe(0);
    await fs.writeBytes(path, source);
    const observed = await fs.readBytes(path);
    await fs.writeBytes(path, source);
    fs.endAction();
    const finalBytes = await fs.readBytes(path);

    expect(fs.injectionCount).toBe(1);
    expect(fs.injectedPath).toBe(path);
    expect(fs.requestedWrites).toHaveLength(2);
    expect(fs.requestedWrites.every((bytes) => bytesEqual(bytes, sourceBefore))).toBe(true);
    expect(bytesEqual(source, sourceBefore)).toBe(true);
    expect(fs.corruptBytes).not.toBeNull();
    expect(bytesEqual(fs.corruptBytes, sourceBefore)).toBe(false);
    expect(mode === 'bitflip'
      ? fs.corruptBytes!.length === sourceBefore.length
      : fs.corruptBytes!.length === sourceBefore.length - 1).toBe(true);
    expect(bytesEqual(observed, fs.corruptBytes!)).toBe(true);
    expect(fs.verificationReads).toHaveLength(1);
    expect(bytesEqual(fs.verificationReads[0] ?? null, fs.corruptBytes!)).toBe(true);
    expect(bytesEqual(finalBytes, sourceBefore)).toBe(true);
  });
}

type MarkerHistoryControl =
  | 'marker-last'
  | 'marker-early'
  | 'nested-marker'
  | 'extra-active-log'
  | 'deactivate-repair-republish';

async function exerciseMarkerHistoryControl(
  fixture: ImportFixture,
  control: MarkerHistoryControl,
): Promise<{ finalComplete: boolean; historySafe: boolean }> {
  const fs = new FaultInjectingMemoryFS();
  const dir = `projects/marker-history-${control}`;
  const markerPath = `${dir}/lociview.json`;
  const markerText = JSON.stringify(fixture.expectedManifest, null, 2);
  const markerToken = `marker-history-${control}`;
  const closurePaths = [
    markerPath,
    ...[...fixture.expectedOps.keys()].map((path) => `${dir}/${path}`),
    ...[...fixture.expectedBinaries.keys()].map((path) => `${dir}/${path}`),
  ];
  fs.watchFilesAfterCommit(markerToken, markerPath, closurePaths);
  const writeClosure = async (): Promise<void> => {
    for (const [path, text] of fixture.expectedOps) await fs.writeText(`${dir}/${path}`, text);
    for (const [path, bytes] of fixture.expectedBinaries) {
      await fs.writeBytes(`${dir}/${path}`, bytes);
    }
  };

  if (control === 'marker-last') {
    await fs.writeText(`staging/${control}/lociview.json`, markerText);
  }
  if (control === 'marker-early') await fs.writeText(markerPath, markerText);
  await writeClosure();
  if (control === 'nested-marker') {
    const nested = `projects/.staging/${control}/lociview.json`;
    await fs.writeText(nested, markerText);
    await fs.remove(nested);
  }
  if (control === 'extra-active-log') {
    await fs.writeText(`${dir}/ops/extra.jsonl`, [...fixture.expectedOps.values()][0]!);
  }
  if (control === 'deactivate-repair-republish') {
    await fs.writeText(markerPath, markerText);
    await fs.remove(markerPath);
    const [repairPath, repairBytes] = [...fixture.expectedBinaries][0]!;
    await fs.writeBytes(`${dir}/${repairPath}`, repairBytes);
    await fs.writeText(markerPath, markerText);
  } else if (control !== 'marker-early') {
    await fs.writeText(markerPath, markerText);
  }
  if (control === 'extra-active-log') await fs.remove(`${dir}/ops/extra.jsonl`);
  await fs.settleProbes();

  return {
    finalComplete: (await inspectImportedClosure(fs, dir, fixture)).complete,
    historySafe: await importMarkerHistoryIsSafe(fs, dir, fixture, markerToken),
  };
}

describe.sequential('import completion-marker history oracle controls', () => {
  let fixture: ImportFixture;

  beforeAll(async () => {
    fixture = await makeImportFixture();
  });

  for (const control of [
    'marker-last',
    'marker-early',
    'nested-marker',
    'extra-active-log',
    'deactivate-repair-republish',
  ] as const satisfies readonly MarkerHistoryControl[]) {
    it(`${control} reaches an exact final closure and the expected history disposition`, async () => {
      expect(await exerciseMarkerHistoryControl(fixture, control)).toEqual({
        finalComplete: true,
        historySafe: control === 'marker-last' || control === 'deactivate-repair-republish',
      });
    });
  }
});

type MergeAuthorityHistoryControl =
  | 'same-byte-authority-rewrite'
  | 'complete-same-byte-authority-rewrite'
  | 'private-staging-marker'
  | 'public-nested-marker'
  | 'partial-active-log'
  | 'extra-active-log';

async function exerciseMergeAuthorityHistoryControl(
  control: MergeAuthorityHistoryControl,
): Promise<{ finalExact: boolean; historySafe: boolean }> {
  const fixture = await makeMergeFixture();
  const fs = fixture.targetFs;
  const expectedKind: MergeAuthorityKind =
    control === 'complete-same-byte-authority-rewrite' ? 'complete' : 'old';
  if (expectedKind === 'complete') {
    await mergeFromInspection(fs, fixture.targetDir, fixture.targetStore, fixture.inspection);
  }
  const watch = armMergeAuthorityHistory(fs, fixture, `merge-history-${control}`);
  const eventOffset = fs.events.length;
  const markerPath = `${fixture.targetDir}/lociview.json`;
  const authorityOpsFiles = expectedKind === 'complete'
    ? fixture.completeOpsFiles
    : fixture.baselineOpsFiles;
  const [logPath, logText] = [...authorityOpsFiles][0]!;

  if (
    control === 'same-byte-authority-rewrite' ||
    control === 'complete-same-byte-authority-rewrite'
  ) {
    await fs.writeText(markerPath, fixture.baselineManifestText);
    await fs.writeText(logPath, logText);
  } else if (control === 'private-staging-marker') {
    const path = `staging/${control}/lociview.json`;
    await fs.writeText(path, fixture.baselineManifestText);
    await fs.remove(path);
  } else if (control === 'public-nested-marker') {
    const path = `projects/.staging/${control}/lociview.json`;
    await fs.writeText(path, fixture.baselineManifestText);
    await fs.remove(path);
  } else if (control === 'partial-active-log') {
    await fs.writeText(logPath, '{"broken":');
    await fs.writeText(logPath, logText);
  } else {
    const path = `${fixture.targetDir}/ops/a_extra.jsonl`;
    await fs.writeText(path, logText);
    await fs.remove(path);
  }

  await fs.settleProbes();
  const authority = await inspectExactMergeAuthority(fixture);
  return {
    finalExact:
      authority.safe &&
      exactMergeAuthorityKind(authority) === expectedKind &&
      currentMergeAuthorityKind(fixture) === expectedKind,
    historySafe: await mergeAuthorityHistoryIsSafe(
      fs,
      fixture,
      fs.events.slice(eventOffset),
      watch,
    ),
  };
}

describe.sequential('merge authority history oracle controls', () => {
  for (const control of [
    'same-byte-authority-rewrite',
    'complete-same-byte-authority-rewrite',
    'private-staging-marker',
    'public-nested-marker',
    'partial-active-log',
    'extra-active-log',
  ] as const satisfies readonly MergeAuthorityHistoryControl[]) {
    it(`${control} reaches exact final authority and the expected history disposition`, async () => {
      expect(await exerciseMergeAuthorityHistoryControl(control)).toEqual({
        finalExact: true,
        historySafe:
          control === 'same-byte-authority-rewrite' ||
          control === 'complete-same-byte-authority-rewrite' ||
          control === 'private-staging-marker',
      });
    });
  }
});

describe.sequential('rejected-merge HLC and own-sequence probe control', () => {
  it('keeps identical baselines equal and exposes observation of the incoming own actor', async () => {
    const source = await makeMergeFixture(new FaultInjectingMemoryFS(), USER_B);
    expect(mergeProbeShapeIsValid(source)).toBe(true);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(mergeProbeNow(source));
    try {
      const poisonedFs = new FaultInjectingMemoryFS();
      const cleanFs = new MemoryFS();
      await copyWorkspace(source.targetFs, poisonedFs);
      await copyWorkspace(source.targetFs, cleanFs);
      const poisonedStore = await ProjectStore.open(
        poisonedFs,
        source.targetDir,
        source.targetIdentity,
      );
      const cleanStore = await ProjectStore.open(
        cleanFs,
        source.targetDir,
        source.targetIdentity,
      );
      const poisonedFixture: MergeFixture = { ...source, targetFs: poisonedFs, targetStore: poisonedStore };
      poisonedStore.mergeExternal(incomingOpsForFixture(poisonedFixture));
      const input = {
        t: 'create' as const,
        e: 'caption',
        id: 'cap_00000000000000000000000048',
        v: { title: 'probe control' },
      };
      const poisonedOp = poisonedStore.dispatch(input);
      const cleanOp = cleanStore.dispatch(input);
      const [poisonedFlush, cleanFlush] = await Promise.all([
        settle(poisonedStore.flush()),
        settle(cleanStore.flush()),
      ]);
      expect({
        sameActor: poisonedOp.actor === cleanOp.actor,
        sequenceAdvanced: poisonedOp.op > cleanOp.op,
        clockAdvanced: poisonedOp.hlc > cleanOp.hlc,
        flushesResolved: !poisonedFlush.rejected && !cleanFlush.rejected,
      }).toEqual({
        sameActor: true,
        sequenceAdvanced: true,
        clockAdvanced: true,
        flushesResolved: true,
      });

      const targetFs = new FaultInjectingMemoryFS();
      const twinFs = new MemoryFS();
      await copyWorkspace(source.targetFs, targetFs);
      await copyWorkspace(source.targetFs, twinFs);
      const targetStore = await ProjectStore.open(targetFs, source.targetDir, source.targetIdentity);
      const twinStore = await ProjectStore.open(twinFs, source.targetDir, source.targetIdentity);
      const cleanFixture: MergeFixture = { ...source, targetFs, targetStore };
      expect(await probeOldMergeStore(cleanFixture, twinFs, twinStore)).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe.sequential('G0S-BLOB new-project publication', () => {
  let successComplete: boolean;
  let markerLast: boolean;
  let fixtureShapeValid: boolean;

  beforeAll(async () => {
    const fixture = await makeImportFixture();
    fixtureShapeValid =
      fixture.expectedOps.size === 2 &&
      fixture.expectedBinaries.size === 2 &&
      knownModelAssetsAreExact(
        fixture.expectedState,
        fixture.expectedOperationObjects,
        fixture.expectedBinaries,
        IMPORT_MODEL_ROLES,
      );
    const target = new FaultInjectingMemoryFS();
    const targetDir = 'projects/import-success';
    await importNewProject(target, targetDir, fixture.inspection);
    const closure = await inspectImportedClosure(target, targetDir, fixture);
    successComplete = closure.complete;

    const markerPath = `${targetDir}/lociview.json`;
    const markerEvents = target.events.filter((event) => event.path === markerPath);
    const closurePaths = [
      ...[...fixture.expectedOps.keys()].map((path) => `${targetDir}/${path}`),
      ...[...fixture.expectedBinaries.keys()].map((path) => `${targetDir}/${path}`),
    ];
    const closureEvents = closurePaths.map((path) => target.events.filter((event) => event.path === path));
    if (
      markerEvents.length === 0 ||
      closureEvents.some((events) => events.length === 0 || events.some((event) => event.commitIndex === null))
    ) {
      throw new Error('successful import did not exercise every closure write');
    }
    const firstMarkerStart = Math.min(...markerEvents.map((event) => event.startIndex));
    const lastClosureCommit = Math.max(
      ...closureEvents.flatMap((events) => events.map((event) => event.commitIndex!)),
    );
    markerLast = lastClosureCommit < firstMarkerStart;
  });

  it('uses a complete two-actor/two-blob fixture and imports it successfully', () => {
    expect(fixtureShapeValid).toBe(true);
    expect(successComplete).toBe(true);
  });

  it.fails('commits the manifest/completion marker only after every raw op and blob is durable', () => {
    expect(markerLast).toBe(true);
  });
});

type ImportFaultBoundary =
  | 'manifest-before'
  | 'manifest-prefix'
  | 'manifest-after'
  | 'actor-prefix'
  | 'first-blob-prefix'
  | 'second-blob-prefix'
  | 'second-blob-after';

const IMPORT_FAULT_ROWS: Array<{
  boundary: ImportFaultBoundary;
  baselineSafe: boolean;
  expectedOutcome: FaultOutcome;
}> = [
  { boundary: 'manifest-before', baselineSafe: true, expectedOutcome: 'throw-before' },
  { boundary: 'manifest-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'manifest-after', baselineSafe: false, expectedOutcome: 'commit-then-throw' },
  { boundary: 'actor-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'first-blob-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'second-blob-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'second-blob-after', baselineSafe: true, expectedOutcome: 'commit-then-throw' },
];

function armImportFault(
  fs: FaultInjectingMemoryFS,
  dir: string,
  fixture: ImportFixture,
  boundary: ImportFaultBoundary,
  message: string,
): { path: string } {
  const ops = [...fixture.expectedOps.keys()];
  const binaries = [...fixture.expectedBinaries.keys()];
  if (
    boundary === 'manifest-before' ||
    boundary === 'manifest-prefix' ||
    boundary === 'manifest-after'
  ) {
    const path = `${dir}/lociview.json`;
    if (boundary === 'manifest-before') fs.failNextWrite(path, message);
    else if (boundary === 'manifest-prefix') fs.failNextWriteAfterPrefix(path, 8, message);
    else fs.failNextWriteAfterCommit(path, message);
    return { path };
  }
  if (boundary === 'actor-prefix') {
    const path = `${dir}/${ops[1]!}`;
    fs.failNextWriteAfterPrefix(path, 8, message);
    return { path };
  }
  const binaryIndex = boundary === 'first-blob-prefix' ? 0 : 1;
  const path = `${dir}/${binaries[binaryIndex]!}`;
  if (boundary === 'second-blob-after') fs.failNextWriteAfterCommit(path, message);
  else fs.failNextWriteAfterPrefix(path, 3, message);
  return { path };
}

for (const row of IMPORT_FAULT_ROWS) {
  describe.sequential(`G0S-BLOB import interruption: ${row.boundary}`, () => {
    let safe: boolean;
    let faultObserved: boolean;

    beforeAll(async () => {
      const fixture = await makeImportFixture();
      if (fixture.expectedOps.size !== 2 || fixture.expectedBinaries.size !== 2) {
        throw new Error('import interruption fixture lost its two-actor/two-blob shape');
      }
      const target = new FaultInjectingMemoryFS();
      const targetDir = `projects/import-${row.boundary}`;
      const message = `injected import ${row.boundary}`;
      const armed = armImportFault(target, targetDir, fixture, row.boundary, message);
      await settle(importNewProject(target, targetDir, fixture.inspection));
      target.assertAllConsumed();
      const faultEvent = target.events.find(
        (event) => event.path === armed.path && event.outcome !== 'pass',
      );
      faultObserved = faultEvent?.outcome === row.expectedOutcome;
      safe = (await inspectImportedClosure(target, targetDir, fixture)).safe;
    });

    it('reaches exactly the requested durable prefix outside the safety assertion', () => {
      expect(faultObserved).toBe(true);
    });

    if (row.baselineSafe) {
      it('is already inactive or complete at this boundary', () => {
        expect(safe).toBe(true);
      });
    } else {
      it.fails('is inactive or has the complete manifest, both raw actor logs and both blobs', () => {
        expect(safe).toBe(true);
      });
    }
  });
}

for (const mode of ['bitflip', 'truncate'] as const satisfies readonly ResolvedCorruptionMode[]) {
  describe.sequential(`G0S-BLOB resolved import corruption: ${mode}`, () => {
    let fixtureValid = false;
    let corruptionReached = false;
    let verificationReadObserved = false;
    let publicationSafe = false;

    beforeAll(async () => {
      const fixture = await makeImportFixture();
      const expectedBinaryPaths = [...fixture.expectedBinaries.keys()].sort();
      fixtureValid =
        fixture.requiredBinaryPaths.length === 2 &&
        isDeepStrictEqual(fixture.requiredBinaryPaths, expectedBinaryPaths) &&
        fixture.expectedOperationObjects.length === fixture.inspection.ops.length &&
        knownModelAssetsAreExact(
          fixture.expectedState,
          fixture.expectedOperationObjects,
          fixture.expectedBinaries,
          IMPORT_MODEL_ROLES,
        );
      const relativeTarget = fixture.requiredBinaryPaths[0]!;
      const expected = fixture.expectedBinaries.get(relativeTarget);
      if (expected === undefined) throw new Error('resolved import target lacks healthy bytes');
      const sourceBefore = new Uint8Array(expected);
      const targetDir = `projects/import-resolved-${mode}`;
      const targetPath = `${targetDir}/${relativeTarget}`;
      const fs = new ResolvedCorruptingMemoryFS(targetPath, expected, mode);
      const markerPath = `${targetDir}/lociview.json`;
      const markerToken = `resolved-import-marker-${mode}`;
      const closurePaths = [
        markerPath,
        ...[...fixture.expectedOps.keys()].map((path) => `${targetDir}/${path}`),
        ...[...fixture.expectedBinaries.keys()].map((path) => `${targetDir}/${path}`),
      ];
      fs.watchFilesAfterCommit(markerToken, markerPath, closurePaths);

      let actionOutcome: Awaited<ReturnType<typeof settleValue>>;
      fs.beginAction();
      try {
        actionOutcome = await settleValue(importNewProject(fs, targetDir, fixture.inspection));
      } finally {
        fs.endAction();
      }
      await fs.settleProbes();

      corruptionReached =
        fs.injectionCount === 1 &&
        fs.injectedPath !== null &&
        fs.requestedWrites.length >= 1 &&
        bytesEqual(fs.requestedWrites[0] ?? null, sourceBefore) &&
        bytesEqual(expected, sourceBefore) &&
        fs.corruptBytes !== null &&
        !bytesEqual(fs.corruptBytes, sourceBefore) &&
        (mode === 'bitflip'
          ? fs.corruptBytes.length === sourceBefore.length
          : fs.corruptBytes.length === sourceBefore.length - 1);
      verificationReadObserved = fs.verificationReads.some((bytes) =>
        bytesEqual(bytes, fs.corruptBytes!));

      const markerHistorySafe = await importMarkerHistoryIsSafe(
        fs,
        targetDir,
        fixture,
        markerToken,
      );
      const finalClosure = await inspectImportedClosure(fs, targetDir, fixture);
      const explicitlyRejected = actionOutcome.rejected;
      publicationSafe =
        markerHistorySafe &&
        finalClosure.safe &&
        (finalClosure.complete || explicitlyRejected);
    });

    it('uses an exact healthy closure and commits the requested resolved corruption once', () => {
      expect({ fixtureValid, corruptionReached }).toEqual({
        fixtureValid: true,
        corruptionReached: true,
      });
    });

    it.fails('reads and observes the wrong bytes before acknowledging or retrying the blob write', () => {
      expect(verificationReadObserved).toBe(true);
    });

    it.fails('never publishes a marker unless the full reopened closure has exact healthy bytes', () => {
      expect(publicationSafe).toBe(true);
    });
  });
}

describe.sequential('G0S-BLOB existing-project merge publication', () => {
  let fixtureShapeValid: boolean;
  let mergeComplete: boolean;
  let blobsBeforeDurableMetadata: boolean;
  let notificationSawExactBlobs: boolean;

  beforeAll(async () => {
    const fixture = await makeMergeFixture();
    fixtureShapeValid =
      fixture.incomingActors.length === 2 &&
      fixture.incomingBinaries.length === 2 &&
      fixture.incomingAssetIds.length === 2 &&
      (await Promise.all(fixture.incomingActors.map((actor) =>
        fixture.targetFs.exists(`${fixture.targetDir}/ops/${actor}.jsonl`)))).filter(Boolean).length === 1;
    const eventOffset = fixture.targetFs.events.length;
    let notificationCount = 0;
    const notificationStates: ExactObservedMergeState[] = [];
    const authorityPaths = mergeSnapshotPathsForAuthority(fixture);
    const unsubscribe = fixture.targetStore.subscribe((state) => {
      const token = `incoming-state-notified-${notificationCount++}`;
      notificationStates.push(observeExactMergeState(token, state, fixture.targetStore));
      fixture.targetFs.markFiles(token, authorityPaths);
    });
    await mergeFromInspection(
      fixture.targetFs,
      fixture.targetDir,
      fixture.targetStore,
      fixture.inspection,
    );
    unsubscribe();
    await fixture.targetFs.settleProbes();
    const authority = await inspectExactMergeAuthority(fixture);
    mergeComplete =
      authority.safe &&
      exactMergeAuthorityKind(authority) === 'complete' &&
      currentMergeAuthorityKind(fixture) === 'complete';

    const scenarioEvents = fixture.targetFs.events.slice(eventOffset);
    const blobEvents = fixture.incomingBinaries.map((binary) =>
      scenarioEvents.filter((event) => event.path === `${fixture.targetDir}/${binary.path}`));
    const metadataEvents = fixture.incomingActors.map((actor) =>
      scenarioEvents.filter((event) => event.path === `${fixture.targetDir}/ops/${actor}.jsonl`));
    if (
      notificationStates.length === 0 ||
      blobEvents.some((events) => events.length === 0 || events.some((event) => event.commitIndex === null)) ||
      metadataEvents.some((events) => events.length === 0)
    ) {
      throw new Error('merge publication fixture did not observe every blob and metadata boundary');
    }
    const lastBlobCommit = Math.max(
      ...blobEvents.flatMap((events) => events.map((event) => event.commitIndex!)),
    );
    const firstMetadataStart = Math.min(
      ...metadataEvents.flatMap((events) => events.map((event) => event.startIndex)),
    );
    blobsBeforeDurableMetadata = lastBlobCommit < firstMetadataStart;
    const notificationSnapshots = fixture.targetFs.fileSnapshots.filter(
      (snapshot) => snapshot.token.startsWith('incoming-state-notified-'),
    );
    notificationSawExactBlobs =
      mergeAuthorityMutationPathsAreKnown(fixture, scenarioEvents) &&
      notificationStates.length === notificationSnapshots.length &&
      notificationStates.every((observed) =>
        exactObservedMergePublicationIsSafe(
          observed,
          notificationSnapshots.find((snapshot) => snapshot.token === observed.token),
          fixture,
        ));
  });

  it('merges the complete two-actor/two-exclusive-blob fixture successfully', () => {
    expect(fixtureShapeValid).toBe(true);
    expect(mergeComplete).toBe(true);
  });

  it('durably places both new blobs before either actor log is mutated', () => {
    expect(blobsBeforeDurableMetadata).toBe(true);
  });

  it('publishes in-memory state only when both newly referenced blobs are exact', () => {
    expect(notificationSawExactBlobs).toBe(true);
  });
});

describe.sequential('G0S-BLOB in-memory merge publication while blob I/O is pending', () => {
  let stateWasSafeWhilePaused: boolean;
  let completedAfterRelease: boolean;

  beforeAll(async () => {
    const fs = new PausingWriteMemoryFS();
    const fixture = await makeMergeFixture(fs);
    const pausedBinary = fixture.incomingBinaries[0];
    const pause = fs.pauseNextWrite(`${fixture.targetDir}/${pausedBinary.path}`);
    const mergePromise = mergeFromInspection(fs, fixture.targetDir, fixture.targetStore, fixture.inspection);
    await pause.reached;
    const pausedAuthority = await inspectExactMergeAuthority(fixture, fs);
    stateWasSafeWhilePaused =
      currentMergeAuthorityKind(fixture) === 'old' &&
      pausedAuthority.safe &&
      exactMergeAuthorityKind(pausedAuthority) === 'old';
    pause.release();
    await mergePromise;
    const finalAuthority = await inspectExactMergeAuthority(fixture);
    completedAfterRelease =
      finalAuthority.safe &&
      exactMergeAuthorityKind(finalAuthority) === 'complete' &&
      currentMergeAuthorityKind(fixture) === 'complete';
  });

  it('completes normally after the paused blob write is released', () => {
    expect(completedAfterRelease).toBe(true);
  });

  it('keeps synchronous state/allOps old until every newly referenced blob is durable', () => {
    expect(stateWasSafeWhilePaused).toBe(true);
  });
});

describe.sequential('G0S-BLOB resolved merge corruption verification', () => {
  let fixtureValid = false;
  let corruptionReached = false;
  let verificationReadObserved = false;
  let notificationPublicationSafe = false;
  let finalAuthoritySafe = false;

  beforeAll(async () => {
    const sourceFixture = await makeMergeFixture(new FaultInjectingMemoryFS(), USER_B);
    const binary = sourceFixture.incomingBinaries[0];
    const targetPath = `${sourceFixture.targetDir}/${binary.path}`;
    const absentBeforeAction = !(await sourceFixture.targetFs.exists(targetPath));
    const expectedBefore = new Uint8Array(binary.data);
    const fs = new ResolvedCorruptingMemoryFS(targetPath, binary.data, 'bitflip');
    await copyWorkspace(sourceFixture.targetFs, fs);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(mergeProbeNow(sourceFixture));
    try {
      const targetStore = await ProjectStore.open(
        fs,
        sourceFixture.targetDir,
        sourceFixture.targetIdentity,
      );
      const fixture: MergeFixture = { ...sourceFixture, targetFs: fs, targetStore };
      const twinFs = new MemoryFS();
      await copyWorkspace(fs, twinFs);
      const twinStore = await ProjectStore.open(
        twinFs,
        fixture.targetDir,
        fixture.targetIdentity,
      );
      fixtureValid =
        absentBeforeAction &&
        fixture.incomingBinaries.every((candidate) =>
          fixture.expectedBinaries.has(candidate.path)) &&
        isDeepStrictEqual(
          requiredBinaryPathsFromOps(fixture.completeOps),
          [...fixture.expectedBinaries.keys()].sort(),
        ) &&
        knownModelAssetsAreExact(
          fixture.completeState,
          fixture.completeOps,
          fixture.expectedBinaries,
          MERGE_MODEL_ROLES,
        ) &&
        mergeProbeShapeIsValid(fixture);

      const authorityWatch = armMergeAuthorityHistory(
        fs,
        fixture,
        'resolved-merge-authority',
      );
      const eventOffset = fs.events.length;
      const binaryPaths = mergeSnapshotPathsForAuthority(fixture);
      const observed: ExactObservedMergeState[] = [];
      const unsubscribe = fixture.targetStore.subscribe((state) => {
        const token = `resolved-merge-notification-${observed.length}`;
        observed.push(observeExactMergeState(token, state, fixture.targetStore));
        fs.markFiles(token, binaryPaths);
      });
      let actionOutcome: Awaited<ReturnType<typeof settleValue>>;
      fs.beginAction();
      try {
        actionOutcome = await settleValue(
          mergeFromInspection(fs, fixture.targetDir, fixture.targetStore, fixture.inspection),
        );
      } finally {
        fs.endAction();
      }
      try {
        await settle(fixture.targetStore.flush());
      } finally {
        unsubscribe();
      }
      await fs.settleProbes();

      corruptionReached =
        fs.injectionCount === 1 &&
        fs.injectedPath !== null &&
        fs.requestedWrites.length >= 1 &&
        bytesEqual(fs.requestedWrites[0] ?? null, expectedBefore) &&
        bytesEqual(binary.data, expectedBefore) &&
        fs.corruptBytes !== null &&
        fs.corruptBytes.length === expectedBefore.length &&
        !bytesEqual(fs.corruptBytes, expectedBefore);
      verificationReadObserved = fs.verificationReads.some((bytes) =>
        bytesEqual(bytes, fs.corruptBytes!));

      const finalAuthority = await inspectExactMergeAuthority(fixture, fs);
      const scenarioEvents = fs.events.slice(eventOffset);
      const historySafe = await mergeAuthorityHistoryIsSafe(
        fs,
        fixture,
        scenarioEvents,
        authorityWatch,
      );
      finalAuthoritySafe = exactMergeAuthorityIsLiveAndCrashSafe(
        fixture,
        finalAuthority,
        historySafe,
      );
      const finalKind = exactMergeAuthorityKind(finalAuthority);
      if (finalKind === 'old') {
        finalAuthoritySafe = finalAuthoritySafe &&
          (await probeOldMergeStore(fixture, twinFs, twinStore));
      }
      const snapshots = fs.fileSnapshots.filter((snapshot) =>
        snapshot.token.startsWith('resolved-merge-notification-'));
      const notificationsAtSafeAuthority = observed.length === 0
        ? finalKind === 'old' && finalAuthoritySafe
        : observed.length === snapshots.length &&
          observed.every((state) => exactObservedMergePublicationIsSafe(
            state,
            snapshots.find((snapshot) => snapshot.token === state.token),
            fixture,
          ));
      notificationPublicationSafe =
        notificationsAtSafeAuthority &&
        (finalKind !== 'old' || actionOutcome.rejected);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('uses an absent exclusive target and commits one same-length wrong-byte result', () => {
    expect({ fixtureValid, corruptionReached }).toEqual({
      fixtureValid: true,
      corruptionReached: true,
    });
  });

  it('reads and observes the wrong bytes before accepting or retrying the incoming blob', () => {
    expect(verificationReadObserved).toBe(true);
  });

  it('never notifies complete incoming authority against corrupt required bytes', () => {
    expect(notificationPublicationSafe).toBe(true);
  });

  it('reopens as the exact old authority or the fully verified merged authority', () => {
    expect(finalAuthoritySafe).toBe(true);
  });
});

describe.sequential('G0S-BLOB native package with one omitted required binary', () => {
  let fixtureValid = false;
  let newImportSafe = false;
  let mergeSafe = false;

  beforeAll(async () => {
    let fixture = await makeMergeFixture(new FaultInjectingMemoryFS(), USER_B);
    const healthyImport = importFixtureFromInspection(
      fixture.inspection,
      fixture.completeState,
    );
    const omitted = fixture.incomingBinaries[0];
    const omittedTargetPath = `${fixture.targetDir}/${omitted.path}`;
    const omittedAbsentFromTarget = !(await fixture.targetFs.exists(omittedTargetPath));
    const healthyPaths = healthyImport.healthyEntries.map((entry) => entry.path);
    const missingEntries = healthyImport.healthyEntries
      .filter((entry) => entry.path !== omitted.path)
      .map((entry) => ({ path: entry.path, data: new Uint8Array(entry.data) }));
    const missingPaths = missingEntries.map((entry) => entry.path);
    const referencingOp = healthyImport.expectedOperationObjects.find((op) =>
      op.e === 'asset' && op.v?.path === omitted.path);
    const omittedRole = MERGE_MODEL_ROLES.find((role) => bytesEqual(omitted.data, role.bytes));
    const allOtherRequiredPresent = healthyImport.requiredBinaryPaths
      .filter((path) => path !== omitted.path)
      .every((path) => {
        const healthy = healthyImport.expectedBinaries.get(path);
        const candidate = missingEntries.find((entry) => entry.path === path)?.data;
        return healthy !== undefined && bytesEqual(candidate ?? null, healthy);
      });
    const packageBytes = await writeZipEntries(missingEntries);
    const rawEntries = await rawZipEntryShapes(packageBytes);
    const actualEntryMap = new Map(
      rawEntries.map((entry) => [entry.filename, entry.payload]),
    );
    const expectedMissingMap = new Map(missingEntries.map((entry) => [entry.path, entry.data]));
    const healthyEntryMap = new Map(
      healthyImport.healthyEntries.map((entry) => [entry.path, entry.data]),
    );
    const actualEntriesExact =
      rawEntries.length === missingEntries.length &&
      actualEntryMap.size === rawEntries.length &&
      rawEntries.every((entry) =>
        !entry.directory &&
        entry.payload !== null &&
        sanitizeZipPath(entry.filename) === entry.filename &&
        bytesEqual(entry.payload, expectedMissingMap.get(entry.filename) ?? new Uint8Array())) &&
      missingEntries.every((entry) =>
        bytesEqual(actualEntryMap.get(entry.path) ?? null, entry.data));
    const healthyDifference = healthyPaths
      .filter((path) => !actualEntryMap.has(path))
      .sort();
    const commonEntriesExact = [...actualEntryMap].every(([path, bytes]) =>
      bytes !== null && bytesEqual(bytes, healthyEntryMap.get(path) ?? new Uint8Array()));
    const omittedCollisionKey = omitted.path.normalize('NFC').toLowerCase();
    const noOmittedAlias = [...actualEntryMap.keys()].every((path) =>
      sanitizeZipPath(path) !== omitted.path &&
      path.normalize('NFC').toLowerCase() !== omittedCollisionKey);
    const actualOps: Op[] = [];
    let actualOpsParseClean = true;
    for (const [path, bytes] of actualEntryMap) {
      if (!path.startsWith('ops/') || !path.endsWith('.jsonl') || bytes === null) continue;
      const parsed = parseOpsJsonl(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      actualOps.push(...parsed.ops);
      actualOpsParseClean = actualOpsParseClean && parsed.errors.length === 0;
    }
    const actualOmittedReferences = actualOps.filter((op) =>
      op.e === 'asset' && op.t === 'create' && op.v?.path === omitted.path);

    fixtureValid =
      omittedAbsentFromTarget &&
      new Set(healthyPaths).size === healthyPaths.length &&
      healthyPaths.filter((path) => path === omitted.path).length === 1 &&
      !missingPaths.includes(omitted.path) &&
      missingEntries.length === healthyImport.healthyEntries.length - 1 &&
      allOtherRequiredPresent &&
      actualEntriesExact &&
      isDeepStrictEqual(healthyDifference, [omitted.path]) &&
      commonEntriesExact &&
      noOmittedAlias &&
      actualOpsParseClean &&
      isDeepStrictEqual(
        operationsByKey(actualOps),
        healthyImport.expectedOperationObjects,
      ) &&
      actualOmittedReferences.length === 1 &&
      isDeepStrictEqual(actualOmittedReferences[0], referencingOp) &&
      referencingOp?.t === 'create' &&
      referencingOp.v?.size === omitted.data.length &&
      omittedRole !== undefined &&
      isDeepStrictEqual(referencingOp.v, expectedModelFields(referencingOp.id, omittedRole)) &&
      healthyImport.expectedBinaries.get(omitted.path) !== undefined &&
      bytesEqual(healthyImport.expectedBinaries.get(omitted.path) ?? null, omitted.data) &&
      isDeepStrictEqual(
        healthyImport.requiredBinaryPaths,
        [...healthyImport.expectedBinaries.keys()].sort(),
      ) &&
      knownModelAssetsAreExact(
        fixture.completeState,
        fixture.completeOps,
        fixture.expectedBinaries,
        MERGE_MODEL_ROLES,
      ) &&
      mergeProbeShapeIsValid(fixture);

    const newOutcome = await settleInspection(packageBytes);
    const newFs = new FaultInjectingMemoryFS();
    const newDir = 'projects/missing-required-new';
    const newMarkerPath = `${newDir}/lociview.json`;
    const newClosurePaths = [
      newMarkerPath,
      ...[...healthyImport.expectedOps.keys()].map((path) => `${newDir}/${path}`),
      ...[...healthyImport.expectedBinaries.keys()].map((path) => `${newDir}/${path}`),
    ];
    const newMarkerToken = 'missing-required-new-marker';
    newFs.watchFilesAfterCommit(newMarkerToken, newMarkerPath, newClosurePaths);
    let newActionRejected = newOutcome.rejected;
    if (newOutcome.inspection !== null) {
      const outcome = await settleValue(importNewProject(newFs, newDir, newOutcome.inspection));
      newActionRejected = outcome.rejected;
    }
    await newFs.settleProbes();
    const newMarkerHistorySafe = await importMarkerHistoryIsSafe(
      newFs,
      newDir,
      healthyImport,
      newMarkerToken,
    );
    const newFinalClosure = await inspectImportedClosure(newFs, newDir, healthyImport);
    newImportSafe =
      newMarkerHistorySafe &&
      newFinalClosure.safe &&
      (newFinalClosure.complete || newActionRejected);

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(mergeProbeNow(fixture));
    try {
      const targetStore = await ProjectStore.open(
        fixture.targetFs,
        fixture.targetDir,
        fixture.targetIdentity,
      );
      fixture = { ...fixture, targetStore };
      const twinFs = new MemoryFS();
      await copyWorkspace(fixture.targetFs, twinFs);
      const twinStore = await ProjectStore.open(
        twinFs,
        fixture.targetDir,
        fixture.targetIdentity,
      );
      const mergeOutcome = await settleInspection(packageBytes);
      let mergeActionRejected = mergeOutcome.rejected;
      const authorityWatch = armMergeAuthorityHistory(
        fixture.targetFs,
        fixture,
        'missing-required-merge-authority',
      );
      const eventOffset = fixture.targetFs.events.length;
      const binaryPaths = mergeSnapshotPathsForAuthority(fixture);
      const observed: ExactObservedMergeState[] = [];
      const unsubscribe = fixture.targetStore.subscribe((state) => {
        const token = `missing-required-merge-notification-${observed.length}`;
        observed.push(observeExactMergeState(token, state, fixture.targetStore));
        fixture.targetFs.markFiles(token, binaryPaths);
      });
      try {
        if (mergeOutcome.inspection !== null) {
          const outcome = await settleValue(mergeFromInspection(
            fixture.targetFs,
            fixture.targetDir,
            fixture.targetStore,
            mergeOutcome.inspection,
          ));
          mergeActionRejected = outcome.rejected;
        }
        await settle(fixture.targetStore.flush());
      } finally {
        unsubscribe();
      }
      await fixture.targetFs.settleProbes();
      const finalAuthority = await inspectExactMergeAuthority(fixture);
      const finalKind = exactMergeAuthorityKind(finalAuthority);
      const historySafe = await mergeAuthorityHistoryIsSafe(
        fixture.targetFs,
        fixture,
        fixture.targetFs.events.slice(eventOffset),
        authorityWatch,
      );
      const finalAuthoritySafe = exactMergeAuthorityIsLiveAndCrashSafe(
        fixture,
        finalAuthority,
        historySafe,
      );
      const snapshots = fixture.targetFs.fileSnapshots.filter((snapshot) =>
        snapshot.token.startsWith('missing-required-merge-notification-'));
      const notificationsAtSafeAuthority = observed.length === 0
        ? finalKind === 'old' && finalAuthoritySafe
        : observed.length === snapshots.length &&
          observed.every((state) => exactObservedMergePublicationIsSafe(
            state,
            snapshots.find((snapshot) => snapshot.token === state.token),
            fixture,
          ));
      const notificationsSafe =
        notificationsAtSafeAuthority &&
        (finalKind !== 'old' || mergeActionRejected);
      const clockAndSequenceSafe = finalKind !== 'old' ||
        (await probeOldMergeStore(fixture, twinFs, twinStore));
      mergeSafe = finalAuthoritySafe && notificationsSafe && clockAndSequenceSafe;
    } finally {
      nowSpy.mockRestore();
    }
  }, 30_000);

  it('omits exactly one still-referenced exclusive binary from an otherwise exact native package', () => {
    expect(fixtureValid).toBe(true);
  });

  it.fails('new-project import never publishes the incomplete required-blob closure', () => {
    expect(newImportSafe).toBe(true);
  });

  it('existing merge preserves exact old authority or completes with every required blob', () => {
    expect(mergeSafe).toBe(true);
  });
});

type MergeFaultBoundary =
  | 'first-blob-prefix'
  | 'second-blob-prefix'
  | 'existing-actor-prefix'
  | 'new-actor-prefix'
  | 'second-blob-after';

const MERGE_FAULT_ROWS: Array<{
  boundary: MergeFaultBoundary;
  baselineSafe: boolean;
  expectedOutcome: FaultOutcome;
}> = [
  { boundary: 'first-blob-prefix', baselineSafe: true, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'second-blob-prefix', baselineSafe: true, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'existing-actor-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'new-actor-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'second-blob-after', baselineSafe: true, expectedOutcome: 'commit-then-throw' },
];

function armMergeFault(
  fixture: MergeFixture,
  boundary: MergeFaultBoundary,
  message: string,
): { path: string } {
  if (
    boundary === 'existing-actor-prefix' ||
    boundary === 'new-actor-prefix'
  ) {
    const actor = boundary === 'existing-actor-prefix'
      ? fixture.existingIncomingActor
      : fixture.newIncomingActor;
    const path = `${fixture.targetDir}/ops/${actor}.jsonl`;
    fixture.targetFs.failNextWriteAfterPrefix(path, 8, message);
    return { path };
  }
  const binaryIndex = boundary === 'first-blob-prefix' ? 0 : 1;
  const path = `${fixture.targetDir}/${fixture.incomingBinaries[binaryIndex].path}`;
  if (boundary === 'second-blob-after') {
    fixture.targetFs.failNextWriteAfterCommit(path, message);
  } else {
    fixture.targetFs.failNextWriteAfterPrefix(path, 3, message);
  }
  return { path };
}

type ActorAfterBoundary = 'existing-actor-after' | 'new-actor-after';

interface ActorAfterResult {
  boundary: ActorAfterBoundary;
  faultObserved: boolean;
  safe: boolean;
}

async function runActorAfterBoundary(boundary: ActorAfterBoundary): Promise<ActorAfterResult> {
  const fixture = await makeMergeFixture();
  const actor = boundary === 'existing-actor-after'
    ? fixture.existingIncomingActor
    : fixture.newIncomingActor;
  const path = `${fixture.targetDir}/ops/${actor}.jsonl`;
  const message = `injected merge ${boundary}`;
  const snapshotToken = `merge-crash-${boundary}`;
  const eventOffset = fixture.targetFs.events.length;
  fixture.targetFs.failNextWriteAfterCommit(path, message);
  fixture.targetFs.watchFilesAfterCommit(
    snapshotToken,
    path,
    await mergeSnapshotPaths(fixture),
  );
  await settle(
    mergeFromInspection(fixture.targetFs, fixture.targetDir, fixture.targetStore, fixture.inspection),
  );
  await fixture.targetFs.settleProbes();
  fixture.targetFs.assertAllConsumed();
  const faultEvent = fixture.targetFs.events.find(
    (event) => event.path === path && event.outcome !== 'pass',
  );
  const crashSnapshot = fixture.targetFs.fileSnapshots.find(
    (snapshot) => snapshot.token === snapshotToken,
  );
  if (crashSnapshot === undefined) throw new Error('actor after-commit did not capture its crash snapshot');
  const authorityPathsKnown = mergeAuthorityMutationPathsAreKnown(
    fixture,
    fixture.targetFs.events.slice(eventOffset),
  );
  return {
    boundary,
    faultObserved: faultEvent?.outcome === 'commit-then-throw',
    safe: authorityPathsKnown && (await inspectExactMergeAuthority(
      fixture,
      await materializeSnapshot(crashSnapshot),
    )).safe,
  };
}

for (const row of MERGE_FAULT_ROWS) {
  describe.sequential(`G0S-BLOB merge interruption: ${row.boundary}`, () => {
    let safe: boolean;
    let faultObserved: boolean;

    beforeAll(async () => {
      const fixture = await makeMergeFixture();
      const message = `injected merge ${row.boundary}`;
      const eventOffset = fixture.targetFs.events.length;
      const armed = armMergeFault(fixture, row.boundary, message);
      const snapshotToken = `merge-crash-${row.boundary}`;
      fixture.targetFs.watchFilesAfterCommit(
        snapshotToken,
        armed.path,
        await mergeSnapshotPaths(fixture),
      );
      const actionOutcome = await settle(
        mergeFromInspection(fixture.targetFs, fixture.targetDir, fixture.targetStore, fixture.inspection),
      );
      await fixture.targetFs.settleProbes();
      fixture.targetFs.assertAllConsumed();
      const faultEvent = fixture.targetFs.events.find(
        (event) => event.path === armed.path && event.outcome !== 'pass',
      );
      faultObserved = faultEvent?.outcome === row.expectedOutcome;
      const crashSnapshot = fixture.targetFs.fileSnapshots.find(
        (snapshot) => snapshot.token === snapshotToken,
      );
      if (crashSnapshot === undefined) throw new Error('merge fault did not capture its crash snapshot');
      const crashAuthoritySafe = (await inspectExactMergeAuthority(
        fixture,
        await materializeSnapshot(crashSnapshot),
      )).safe;
      const finalAuthority = await inspectExactMergeAuthority(fixture);
      const finalKind = exactMergeAuthorityKind(finalAuthority);
      safe =
        mergeAuthorityMutationPathsAreKnown(
          fixture,
          fixture.targetFs.events.slice(eventOffset),
        ) &&
        crashAuthoritySafe &&
        finalAuthority.safe &&
        finalKind !== null &&
        currentMergeAuthorityKind(fixture) === finalKind &&
        (actionOutcome.rejected || finalKind === 'complete');
    });

    it('reaches the requested blob or actor-log durable prefix outside the safety assertion', () => {
      expect(faultObserved).toBe(true);
    });

    if (row.baselineSafe) {
      it('is already the exact old or complete closure at this after-commit boundary', () => {
        expect(safe).toBe(true);
      });
    } else {
      it.fails('reopens as either the exact old state or the complete two-actor/two-blob state', () => {
        expect(safe).toBe(true);
      });
    }
  });
}

describe.sequential('G0S-BLOB actor-log after-commit publication boundary', () => {
  let results: ActorAfterResult[];

  beforeAll(async () => {
    results = await Promise.all([
      runActorAfterBoundary('existing-actor-after'),
      runActorAfterBoundary('new-actor-after'),
    ]);
  });

  for (const boundary of ['existing-actor-after', 'new-actor-after'] as const) {
    it(`reaches ${boundary} independently of physical actor write order`, () => {
      expect(results.find((result) => result.boundary === boundary)?.faultObserved).toBe(true);
    });
  }

  it('has one exact final actor-log commit snapshot regardless of which actor is written last', () => {
    expect(results.some((result) => result.safe)).toBe(true);
  });

  it.fails('makes every actor-log commit atomic as an exact old-or-complete authority', () => {
    expect(results.every((result) => result.safe)).toBe(true);
  });
});

describe.sequential('G0S-BLOB same-path binary identity', () => {
  it('accepts an already-present byte-identical incoming blob', async () => {
    const fixture = await makeMergeFixture();
    const binary = fixture.incomingBinaries[1];
    await fixture.targetFs.writeBytes(`${fixture.targetDir}/${binary.path}`, binary.data);
    await mergeFromInspection(
      fixture.targetFs,
      fixture.targetDir,
      fixture.targetStore,
      fixture.inspection,
    );
    const authority = await inspectExactMergeAuthority(fixture);
    expect(exactMergeAuthorityKind(authority)).toBe('complete');
    expect(authority.safe).toBe(true);
  });

  describe('different bytes under the same path', () => {
    let fixtureValid: boolean;
    let dispositionSafe: boolean;
    let metadataApplicationSafe: boolean;
    let publicationSafe: boolean;

    beforeAll(async () => {
      const fixture = await makeMergeFixture();
      const binary = fixture.incomingBinaries[1];
      const evil = Uint8Array.from(binary.data, (value) => value ^ 0xff);
      fixtureValid = evil.length === binary.data.length && !bytesEqual(evil, binary.data);
      await fixture.targetFs.writeBytes(`${fixture.targetDir}/${binary.path}`, evil);
      const eventOffset = fixture.targetFs.events.length;
      const authorityPaths = mergeSnapshotPathsForAuthority(fixture);
      let notificationCount = 0;
      const notificationStates: ExactObservedMergeState[] = [];
      let mergeCallCount = 0;
      const unsubscribe = fixture.targetStore.subscribe((state) => {
        const token = `collision-notification-${notificationCount++}`;
        notificationStates.push(observeExactMergeState(token, state, fixture.targetStore));
        fixture.targetFs.markFiles(token, authorityPaths);
      });
      const originalMergeExternal = fixture.targetStore.mergeExternal.bind(fixture.targetStore);
      const mergeSpy = vi.spyOn(fixture.targetStore, 'mergeExternal').mockImplementation((incoming) => {
        fixture.targetFs.markFiles(`collision-merge-call-${mergeCallCount++}`, authorityPaths);
        return originalMergeExternal(incoming);
      });
      let result: Awaited<ReturnType<typeof settle>>;
      try {
        result = await settle(
          mergeFromInspection(fixture.targetFs, fixture.targetDir, fixture.targetStore, fixture.inspection),
        );
      } finally {
        mergeSpy.mockRestore();
        unsubscribe();
      }
      await fixture.targetFs.settleProbes();
      const authority = await inspectExactMergeAuthority(fixture);
      const finalKind = exactMergeAuthorityKind(authority);
      dispositionSafe =
        authority.safe &&
        finalKind !== null &&
        currentMergeAuthorityKind(fixture) === finalKind &&
        (result.rejected || finalKind === 'complete');
      const snapshots = fixture.targetFs.fileSnapshots.filter(
        (snapshot) => snapshot.token.startsWith('collision-notification-'),
      );
      const mergeCallSnapshots = fixture.targetFs.fileSnapshots.filter(
        (snapshot) => snapshot.token.startsWith('collision-merge-call-'),
      );
      metadataApplicationSafe = mergeCallSnapshots.length === 0
        ? result.rejected
        : mergeCallSnapshots.every((snapshot) =>
          snapshotHasExactVisibleAuthority(snapshot, fixture.completeState, fixture));
      publicationSafe = snapshots.length === 0
        ? result.rejected && mergeAuthorityMutationPathsAreKnown(
          fixture,
          fixture.targetFs.events.slice(eventOffset),
        )
        : mergeAuthorityMutationPathsAreKnown(
          fixture,
          fixture.targetFs.events.slice(eventOffset),
        ) && notificationStates.length === snapshots.length &&
          notificationStates.every((observed) =>
            exactObservedMergePublicationIsSafe(
              observed,
              snapshots.find((snapshot) => snapshot.token === observed.token),
              fixture,
            ));
    });

    it('uses equal-length but byte-different collision input', () => {
      expect(fixtureValid).toBe(true);
    });

    it('rejects the merge without changing active state or completes with exact incoming bytes', () => {
      expect(dispositionSafe).toBe(true);
    });

    it('applies incoming operations only after every referenced incoming blob is exact', () => {
      expect(metadataApplicationSafe).toBe(true);
    });

    it('never notifies observers while a published asset points at different bytes', () => {
      expect(publicationSafe).toBe(true);
    });

    it.todo('reports a typed, durable binary-collision issue without relying on throw-versus-return behavior');
  });

  describe('different bytes under a path referenced by the active project', () => {
    let fixtureValid: boolean;
    let rejectedWithoutMutation: boolean;
    let noTransientPublication: boolean;

    beforeAll(async () => {
      const fixture = await makeMergeFixture();
      const collisionAssetId = fixture.incomingAssetIds[0];
      const collisionBytes = Uint8Array.from(BASE_BYTES, (value) => value ^ 0xff);
      const originalIncomingPath = fixture.inspection.ops.find(
        (op) => op.e === 'asset' && op.id === collisionAssetId,
      )?.v?.path;
      if (typeof originalIncomingPath !== 'string') {
        throw new Error('referenced collision fixture lacks its incoming asset path');
      }
      const collisionOps = fixture.inspection.ops.map((op): Op =>
        op.e === 'asset' && op.id === collisionAssetId
          ? { ...op, v: { ...op.v, path: fixture.baselinePath, size: collisionBytes.length } }
          : op);
      const byActor = new Map<string, Op[]>();
      for (const op of collisionOps) {
        const actorOps = byActor.get(op.actor) ?? [];
        actorOps.push(op);
        byActor.set(op.actor, actorOps);
      }
      const collisionInspection: ZipInspection = {
        ...fixture.inspection,
        ops: collisionOps,
        opsFiles: [...byActor].map(([actor, ops]) => ({
          path: `ops/${actor}.jsonl`,
          text: serializeOps(ops),
        })),
        binaries: fixture.inspection.binaries
          .filter((binary) => binary.path !== originalIncomingPath)
          .map((binary) => binary.path === fixture.baselinePath
            ? { path: binary.path, data: collisionBytes }
            : binary),
      };
      const eventOffset = fixture.targetFs.events.length;
      fixtureValid =
        collisionBytes.length === BASE_BYTES.length &&
        !bytesEqual(collisionBytes, BASE_BYTES) &&
        collisionInspection.binaries.filter((binary) => binary.path === fixture.baselinePath).length === 1;
      let mergeCallCount = 0;
      const notificationStates: ExactObservedMergeState[] = [];
      const authorityPaths = mergeSnapshotPathsForAuthority(fixture);
      const originalMergeExternal = fixture.targetStore.mergeExternal.bind(fixture.targetStore);
      const mergeSpy = vi.spyOn(fixture.targetStore, 'mergeExternal').mockImplementation((incoming) => {
        mergeCallCount += 1;
        return originalMergeExternal(incoming);
      });
      const unsubscribe = fixture.targetStore.subscribe((state) => {
        const token = `referenced-collision-notification-${notificationStates.length}`;
        notificationStates.push(observeExactMergeState(
          token,
          state,
          fixture.targetStore,
        ));
        fixture.targetFs.markFiles(token, authorityPaths);
      });
      let result: Awaited<ReturnType<typeof settle>>;
      try {
        result = await settle(
          mergeFromInspection(
            fixture.targetFs,
            fixture.targetDir,
            fixture.targetStore,
            collisionInspection,
          ),
        );
      } finally {
        mergeSpy.mockRestore();
        unsubscribe();
      }
      await fixture.targetFs.settleProbes();
      const authority = await inspectExactMergeAuthority(fixture);
      rejectedWithoutMutation =
        result.rejected &&
        authority.safe &&
        exactMergeAuthorityKind(authority) === 'old' &&
        currentMergeAuthorityKind(fixture) === 'old' &&
        bytesEqual(
          await fixture.targetFs.readBytes(`${fixture.targetDir}/${fixture.baselinePath}`),
          BASE_BYTES,
        );
      noTransientPublication =
        mergeCallCount === 0 &&
        mergeAuthorityMutationPathsAreKnown(
          fixture,
          fixture.targetFs.events.slice(eventOffset),
        ) &&
        notificationStates.every((observed) =>
          exactObservedMergePublicationIsSafe(
            observed,
            fixture.targetFs.fileSnapshots.find((snapshot) => snapshot.token === observed.token),
            fixture,
          ) &&
          isDeepStrictEqual(observed.state, fixture.baselineState));
    });

    it('uses a byte-different incoming payload for an already referenced path', () => {
      expect(fixtureValid).toBe(true);
    });

    it('rejects before mutating the old asset, its bytes, or any incoming metadata', () => {
      expect(rejectedWithoutMutation).toBe(true);
    });

    it('never applies or notifies the impossible shared-path metadata before rejection', () => {
      expect(noTransientPublication).toBe(true);
    });
  });
});

describe.sequential('G0S-BLOB merge preflight controls', () => {
  for (const mode of ['empty', 'verified'] as const) {
    it(`${mode} optimized reference preserves an exact merged authority`, async () => {
      const fixture = await makeMergeFixture();
      const baselineStorageOps = [...fixture.targetStore.allOps];
      const targetAssetId = fixture.incomingAssetIds[0];
      const optimizedPath = `models/${targetAssetId}.opt.glb`;
      const optimizedBytes = encoder.encode('verified optimized merge control');
      const incomingOps = fixture.inspection.ops.map((op): Op => {
        if (op.e !== 'asset' || op.id !== targetAssetId || op.v === undefined) return op;
        return {
          ...op,
          v: mode === 'empty'
            ? { ...op.v, optimizedPath: '' }
            : {
                ...op.v,
                optimizedPath,
                optimizedSize: optimizedBytes.length,
              },
        };
      });
      const unreferenced = {
        path: 'models/private-unreferenced-control.bin',
        data: encoder.encode('unreferenced package bytes'),
      };
      const inspection: ZipInspection = {
        ...fixture.inspection,
        ops: incomingOps,
        binaries: [
          ...fixture.inspection.binaries,
          ...(mode === 'verified' ? [{ path: optimizedPath, data: optimizedBytes }] : []),
          unreferenced,
        ],
      };
      const preview = mergeOps(baselineStorageOps, incomingOps);
      const expectedOps = operationsByKey([...baselineStorageOps, ...preview.newOps]);
      const expectedFiles = expectedMergedOpsFiles(
        fixture.baselineOpsFiles,
        fixture.targetDir,
        preview.newOps,
      );
      const expectedBinaries = new Map(fixture.expectedBinaries);
      if (mode === 'verified') expectedBinaries.set(optimizedPath, optimizedBytes);

      await mergeFromInspection(
        fixture.targetFs,
        fixture.targetDir,
        fixture.targetStore,
        inspection,
      );
      const reopened = await ProjectStore.open(fixture.targetFs, fixture.targetDir, USER_A);
      const targetAsset = reopened.state.byKind.asset?.[targetAssetId];

      expect(reopened.loadErrors).toHaveLength(0);
      expect(reopened.state).toEqual(preview.stateAfter);
      expect(operationsByKey(reopened.allOps)).toEqual(expectedOps);
      expect(reopened.vector).toEqual(versionVector([...baselineStorageOps, ...preview.newOps]));
      expect(opsFilesMatchAuthority(
        await readActiveOpsFiles(fixture.targetFs, fixture.targetDir),
        expectedFiles,
        fixture.baselineOpsFiles,
      )).toBe(true);
      expect(await visibleBlobReferencesAreExact(
        fixture.targetFs,
        reopened.state,
        { ...fixture, expectedBinaries },
      )).toBe(true);
      expect(targetAsset?.fields.optimizedPath).toBe(mode === 'empty' ? '' : optimizedPath);
      if (mode === 'verified') {
        expect(targetAsset?.fields.optimizedSize).toBe(optimizedBytes.length);
      }
    });
  }

  it('accepts ops-only existing targets plus semantic manifest and appended-operation JSON formatting', async () => {
    const fixture = await makeMergeFixture();
    for (const binary of fixture.incomingBinaries) {
      await fixture.targetFs.writeBytes(`${fixture.targetDir}/${binary.path}`, binary.data);
    }
    await fixture.targetFs.writeText(
      `${fixture.targetDir}/lociview.json`,
      JSON.stringify(parseManifest(fixture.baselineManifestText)),
    );
    await mergeFromInspection(
      fixture.targetFs,
      fixture.targetDir,
      fixture.targetStore,
      { ...fixture.inspection, binaries: [] },
    );
    let reformatted = false;
    for (const [path, completeText] of fixture.completeOpsFiles) {
      const baselineText = fixture.baselineOpsFiles.get(path) ?? '';
      if (!completeText.startsWith(baselineText)) {
        throw new Error('semantic JSONL control lacks its exact baseline prefix');
      }
      const suffix = completeText.slice(baselineText.length);
      if (suffix === '') continue;
      const semanticText = baselineText + semanticallyReformatJsonl(suffix);
      reformatted ||= semanticText !== completeText;
      await fixture.targetFs.writeText(path, semanticText);
    }
    const authority = await inspectExactMergeAuthority(fixture);
    expect(reformatted).toBe(true);
    expect(exactMergeAuthorityKind(authority)).toBe('complete');
    expect(authority.safe).toBe(true);
  });

  it('accepts an unchanged legacy asset without size when its existing target bytes are exact', async () => {
    const fixture = await makeMergeFixture(undefined, USER_A, true);
    for (const binary of fixture.incomingBinaries) {
      await fixture.targetFs.writeBytes(`${fixture.targetDir}/${binary.path}`, binary.data);
    }
    await mergeFromInspection(
      fixture.targetFs,
      fixture.targetDir,
      fixture.targetStore,
      { ...fixture.inspection, binaries: [] },
    );
    const authority = await inspectExactMergeAuthority(fixture);
    const baselineAsset = fixture.targetStore.state.byKind.asset?.[fixture.baselineAssetIds[0]!];
    expect(baselineAsset?.fields.size).toBeUndefined();
    expect(exactMergeAuthorityKind(authority)).toBe('complete');
    expect(authority.safe).toBe(true);
  });

  it('applies the same incoming-operation snapshot that was used for async blob preflight', async () => {
    const fs = new PausingWriteMemoryFS();
    const fixture = await makeMergeFixture(fs);
    const inspection: ZipInspection = {
      ...fixture.inspection,
      ops: structuredClone(fixture.inspection.ops),
    };
    const pausedBinary = fixture.incomingBinaries[0];
    const pause = fs.pauseNextWrite(`${fixture.targetDir}/${pausedBinary.path}`);
    const merge = mergeFromInspection(fs, fixture.targetDir, fixture.targetStore, inspection);
    await pause.reached;
    const mutableOp = inspection.ops.find(
      (op) => op.e === 'asset' && op.id === fixture.incomingAssetIds[0] && op.v !== undefined,
    );
    if (mutableOp?.v === undefined) throw new Error('mutable merge control lacks its asset operation');
    mutableOp.v.path = 'models/unverified-after-preview.stl';
    mutableOp.v.size = 999;
    pause.release();
    await merge;
    const authority = await inspectExactMergeAuthority(fixture);
    expect(exactMergeAuthorityKind(authority)).toBe('complete');
    expect(authority.safe).toBe(true);
    expect(fixture.targetStore.state.byKind.asset?.[fixture.incomingAssetIds[0]]?.fields.path)
      .not.toBe('models/unverified-after-preview.stl');
  });

  for (const boundary of [
    'duplicate-binary',
    'noncanonical-binary-path',
    'missing-visible-path',
    'missing-visible-size',
    'invalid-visible-size',
    'missing-baseline-target',
  ] as const) {
    it(`rejects ${boundary} before mergeExternal`, async () => {
      const fixture = await makeMergeFixture();
      let inspection: ZipInspection = fixture.inspection;
      if (boundary === 'duplicate-binary') {
        const duplicate = fixture.inspection.binaries[0]!;
        inspection = {
          ...fixture.inspection,
          binaries: [...fixture.inspection.binaries, { path: duplicate.path, data: duplicate.data }],
        };
      } else if (boundary === 'noncanonical-binary-path') {
        inspection = {
          ...fixture.inspection,
          binaries: [
            ...fixture.inspection.binaries,
            { path: '../outside.bin', data: encoder.encode('unsafe') },
          ],
        };
      } else if (boundary === 'missing-baseline-target') {
        await fixture.targetFs.remove(`${fixture.targetDir}/${fixture.baselinePath}`);
        inspection = {
          ...fixture.inspection,
          binaries: fixture.inspection.binaries.filter(
            (binary) => binary.path !== fixture.baselinePath,
          ),
        };
      } else {
        const targetAssetId = fixture.incomingAssetIds[0];
        inspection = {
          ...fixture.inspection,
          ops: fixture.inspection.ops.map((op): Op => {
            if (op.e !== 'asset' || op.id !== targetAssetId || op.v === undefined) return op;
            const v = { ...op.v };
            if (boundary === 'missing-visible-path') delete v.path;
            else if (boundary === 'missing-visible-size') delete v.size;
            else v.size = 'invalid';
            return { ...op, v };
          }),
        };
      }
      let mergeCallCount = 0;
      const original = fixture.targetStore.mergeExternal.bind(fixture.targetStore);
      const spy = vi.spyOn(fixture.targetStore, 'mergeExternal').mockImplementation((ops) => {
        mergeCallCount += 1;
        return original(ops);
      });
      let outcome: Awaited<ReturnType<typeof settle>>;
      try {
        outcome = await settle(mergeFromInspection(
          fixture.targetFs,
          fixture.targetDir,
          fixture.targetStore,
          inspection,
        ));
      } finally {
        spy.mockRestore();
      }
      expect(outcome.rejected).toBe(true);
      expect(mergeCallCount).toBe(0);
      expect(currentMergeAuthorityKind(fixture)).toBe('old');
    });
  }
});

describe('G0S-BLOB deferred package transaction boundaries', () => {
  it.todo('proves real navigator.locks/OPFS two-tab serialization, project-ID scoping and lock-unavailable read-only enforcement');
});
