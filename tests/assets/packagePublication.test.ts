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
import { serializeOps } from '../../src/core/jsonl';
import { parseManifest, type ProjectManifest } from '../../src/core/manifest';
import { visibleEntities } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import {
  FaultInjectingMemoryFS,
  type FaultEvent,
  type FaultFileSnapshot,
  type FaultOutcome,
} from '../helpers/faultFs';

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
const BASE_BYTES = encoder.encode('solid base\nendsolid base\n');
const PEER_B_BYTES = encoder.encode('solid peer-b\nendsolid peer-b\n');
const PEER_C_BYTES = encoder.encode('solid peer-c\nendsolid peer-c\n');

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
  expectedOps: ReadonlyMap<string, string>;
  expectedBinaries: ReadonlyMap<string, Uint8Array>;
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
  if (inspection.manifest === null) throw new Error('import fixture lacks a manifest');
  return {
    inspection,
    expectedState: storeB.state,
    expectedManifest: inspection.manifest,
    expectedOps: new Map(inspection.opsFiles.map((file) => [file.path, file.text])),
    expectedBinaries: new Map(inspection.binaries.map((binary) => [binary.path, binary.data])),
  };
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
  const manifestText = await fs.readText(`${dir}/lociview.json`);
  if (manifestText === null) return { active: false, complete: false, safe: true };

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
    reopened.loadErrors.length === 0 && isDeepStrictEqual(reopened.state, fixture.expectedState);
  const complete = manifestComplete && opsComplete && binariesComplete && stateComplete;
  return { active: true, complete, safe: complete };
}

interface MergeFixture {
  targetFs: FaultInjectingMemoryFS;
  targetDir: string;
  targetStore: ProjectStore;
  inspection: ZipInspection;
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

async function makeMergeFixture(targetFs = new FaultInjectingMemoryFS()): Promise<MergeFixture> {
  const targetDir = 'projects/merge-target';
  const createdStore = await ProjectStore.create(targetFs, targetDir, 'two-actor merge target', USER_A);
  const baselineAssetId = await addModelAsset(targetFs, targetDir, createdStore, 'base.stl', BASE_BYTES);
  await createdStore.flush();

  const seedB = await ProjectStore.open(targetFs, targetDir, USER_B);
  seedB.createEntity('caption', { title: 'existing actor-B log seed' });
  await seedB.flush();
  const targetStore = await ProjectStore.open(targetFs, targetDir, USER_A);
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
  return {
    targetFs,
    targetDir,
    targetStore,
    inspection,
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

interface MergeClosure {
  oldState: boolean;
  completeState: boolean;
  blobsMatch: boolean;
  safe: boolean;
}

async function inspectMergeState(
  fixture: MergeFixture,
  fs: MemoryFS,
  state: ProjectStore['state'],
  readable: boolean,
): Promise<MergeClosure> {
  const visibleAssets = visibleEntities(state, 'asset');
  const visibleIds = visibleAssets.map((asset) => asset.id).sort();
  const completeIds = [...fixture.baselineAssetIds, ...fixture.incomingAssetIds].sort();
  const oldState = readable && isDeepStrictEqual(visibleIds, fixture.baselineAssetIds);
  const completeState = readable && isDeepStrictEqual(visibleIds, completeIds);
  let blobsMatch = true;
  for (const asset of visibleAssets) {
    const path = asset.fields.path;
    if (typeof path !== 'string') {
      blobsMatch = false;
      break;
    }
    const expected = fixture.expectedBinaries.get(path);
    const actual = await fs.readBytes(`${fixture.targetDir}/${path}`);
    if (expected === undefined || !bytesEqual(actual, expected) || asset.fields.size !== expected.length) {
      blobsMatch = false;
      break;
    }
  }
  return { oldState, completeState, blobsMatch, safe: blobsMatch && (oldState || completeState) };
}

async function inspectMergedClosure(
  fixture: MergeFixture,
  fs: MemoryFS = fixture.targetFs,
): Promise<MergeClosure> {
  const reopened = await ProjectStore.open(fs, fixture.targetDir, USER_A);
  return inspectMergeState(fixture, fs, reopened.state, reopened.loadErrors.length === 0);
}

async function mergeSnapshotPaths(fixture: MergeFixture): Promise<string[]> {
  const paths = new Set(await fixture.targetFs.list(`${fixture.targetDir}/`));
  for (const actor of fixture.incomingActors) paths.add(`${fixture.targetDir}/ops/${actor}.jsonl`);
  for (const binary of fixture.incomingBinaries) paths.add(`${fixture.targetDir}/${binary.path}`);
  return [...paths].sort();
}

function snapshotHasExactIncomingBinaries(
  snapshot: FaultFileSnapshot,
  fixture: MergeFixture,
): boolean {
  return fixture.incomingBinaries.every((binary) =>
    bytesEqual(snapshot.files.get(`${fixture.targetDir}/${binary.path}`) ?? null, binary.data));
}

interface ObservedMergeState {
  token: string;
  assetIds: string[];
  opKeys: string[];
}

function observeMergeState(
  token: string,
  state: ProjectStore['state'],
  store: ProjectStore,
): ObservedMergeState {
  return {
    token,
    assetIds: visibleEntities(state, 'asset').map((asset) => asset.id).sort(),
    opKeys: store.allOps.map(operationKey).sort(),
  };
}

function observedOldState(observed: ObservedMergeState, fixture: MergeFixture): boolean {
  return (
    isDeepStrictEqual(observed.assetIds, fixture.baselineAssetIds) &&
    isDeepStrictEqual(observed.opKeys, fixture.baselineOpKeys)
  );
}

function observedCompleteState(observed: ObservedMergeState, fixture: MergeFixture): boolean {
  return (
    isDeepStrictEqual(
      observed.assetIds,
      [...fixture.baselineAssetIds, ...fixture.incomingAssetIds].sort(),
    ) &&
    isDeepStrictEqual(
      observed.opKeys,
      [...fixture.baselineOpKeys, ...fixture.incomingOpKeys].sort(),
    )
  );
}

function observedPublicationIsSafe(
  observed: ObservedMergeState,
  snapshot: FaultFileSnapshot | undefined,
  fixture: MergeFixture,
): boolean {
  if (observedOldState(observed, fixture)) return true;
  return (
    observedCompleteState(observed, fixture) &&
    snapshot !== undefined &&
    snapshotHasExactIncomingBinaries(snapshot, fixture)
  );
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

describe.sequential('G0S-BLOB new-project publication', () => {
  let successComplete: boolean;
  let markerLast: boolean;
  let fixtureShapeValid: boolean;

  beforeAll(async () => {
    const fixture = await makeImportFixture();
    fixtureShapeValid = fixture.expectedOps.size === 2 && fixture.expectedBinaries.size === 2;
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
    const notificationStates: ObservedMergeState[] = [];
    const binaryPaths = fixture.incomingBinaries.map(
      (binary) => `${fixture.targetDir}/${binary.path}`,
    );
    const unsubscribe = fixture.targetStore.subscribe((state) => {
      const token = `incoming-state-notified-${notificationCount++}`;
      notificationStates.push(observeMergeState(token, state, fixture.targetStore));
      fixture.targetFs.markFiles(token, binaryPaths);
    });
    await mergeFromInspection(
      fixture.targetFs,
      fixture.targetDir,
      fixture.targetStore,
      fixture.inspection,
    );
    unsubscribe();
    await fixture.targetFs.settleProbes();
    const closure = await inspectMergedClosure(fixture);
    mergeComplete = closure.completeState && closure.blobsMatch;

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
      notificationStates.length === notificationSnapshots.length &&
      notificationStates.every((observed) =>
        observedPublicationIsSafe(
          observed,
          notificationSnapshots.find((snapshot) => snapshot.token === observed.token),
          fixture,
        ));
  });

  it('merges the complete two-actor/two-exclusive-blob fixture successfully', () => {
    expect(fixtureShapeValid).toBe(true);
    expect(mergeComplete).toBe(true);
  });

  it.fails('durably places both new blobs before either actor log is mutated', () => {
    expect(blobsBeforeDurableMetadata).toBe(true);
  });

  it.fails('publishes in-memory state only when both newly referenced blobs are exact', () => {
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
    const pausedClosure = await inspectMergeState(fixture, fs, fixture.targetStore.state, true);
    const currentOpKeys = fixture.targetStore.allOps.map(operationKey).sort();
    const completeOpKeys = [...fixture.baselineOpKeys, ...fixture.incomingOpKeys].sort();
    const opsMatchState =
      (pausedClosure.oldState && isDeepStrictEqual(currentOpKeys, fixture.baselineOpKeys)) ||
      (pausedClosure.completeState && isDeepStrictEqual(currentOpKeys, completeOpKeys));
    stateWasSafeWhilePaused = pausedClosure.safe && opsMatchState;
    pause.release();
    await mergePromise;
    const finalClosure = await inspectMergedClosure(fixture);
    completedAfterRelease = finalClosure.completeState && finalClosure.blobsMatch;
  });

  it('completes normally after the paused blob write is released', () => {
    expect(completedAfterRelease).toBe(true);
  });

  it.fails('keeps synchronous state/allOps old until every newly referenced blob is durable', () => {
    expect(stateWasSafeWhilePaused).toBe(true);
  });
});

type MergeFaultBoundary =
  | 'first-blob-prefix'
  | 'second-blob-prefix'
  | 'existing-actor-prefix'
  | 'existing-actor-after'
  | 'new-actor-prefix'
  | 'second-blob-after'
  | 'new-actor-after';

const MERGE_FAULT_ROWS: Array<{
  boundary: MergeFaultBoundary;
  baselineSafe: boolean;
  expectedOutcome: FaultOutcome;
}> = [
  { boundary: 'first-blob-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'second-blob-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'existing-actor-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'existing-actor-after', baselineSafe: false, expectedOutcome: 'commit-then-throw' },
  { boundary: 'new-actor-prefix', baselineSafe: false, expectedOutcome: 'write-prefix-then-throw' },
  { boundary: 'second-blob-after', baselineSafe: true, expectedOutcome: 'commit-then-throw' },
  { boundary: 'new-actor-after', baselineSafe: false, expectedOutcome: 'commit-then-throw' },
];

function armMergeFault(
  fixture: MergeFixture,
  boundary: MergeFaultBoundary,
  message: string,
): { path: string } {
  if (
    boundary === 'existing-actor-prefix' ||
    boundary === 'existing-actor-after' ||
    boundary === 'new-actor-prefix' ||
    boundary === 'new-actor-after'
  ) {
    const actor = boundary === 'existing-actor-prefix' || boundary === 'existing-actor-after'
      ? fixture.existingIncomingActor
      : fixture.newIncomingActor;
    const path = `${fixture.targetDir}/ops/${actor}.jsonl`;
    if (boundary === 'new-actor-after' || boundary === 'existing-actor-after') {
      fixture.targetFs.failNextWriteAfterCommit(path, message);
    }
    else fixture.targetFs.failNextWriteAfterPrefix(path, 8, message);
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

for (const row of MERGE_FAULT_ROWS) {
  describe.sequential(`G0S-BLOB merge interruption: ${row.boundary}`, () => {
    let safe: boolean;
    let faultObserved: boolean;

    beforeAll(async () => {
      const fixture = await makeMergeFixture();
      const message = `injected merge ${row.boundary}`;
      const armed = armMergeFault(fixture, row.boundary, message);
      const snapshotToken = `merge-crash-${row.boundary}`;
      fixture.targetFs.watchFilesAfterCommit(
        snapshotToken,
        armed.path,
        await mergeSnapshotPaths(fixture),
      );
      await settle(
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
      safe = (await inspectMergedClosure(fixture, await materializeSnapshot(crashSnapshot))).safe;
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
    const closure = await inspectMergedClosure(fixture);
    expect(closure.completeState).toBe(true);
    expect(closure.blobsMatch).toBe(true);
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
      const binaryPaths = fixture.incomingBinaries.map(
        (candidate) => `${fixture.targetDir}/${candidate.path}`,
      );
      let notificationCount = 0;
      const notificationStates: ObservedMergeState[] = [];
      let mergeCallCount = 0;
      const unsubscribe = fixture.targetStore.subscribe((state) => {
        const token = `collision-notification-${notificationCount++}`;
        notificationStates.push(observeMergeState(token, state, fixture.targetStore));
        fixture.targetFs.markFiles(token, binaryPaths);
      });
      const originalMergeExternal = fixture.targetStore.mergeExternal.bind(fixture.targetStore);
      const mergeSpy = vi.spyOn(fixture.targetStore, 'mergeExternal').mockImplementation((incoming) => {
        fixture.targetFs.markFiles(`collision-merge-call-${mergeCallCount++}`, binaryPaths);
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
      const closure = await inspectMergedClosure(fixture);
      dispositionSafe = result.rejected
        ? closure.oldState && closure.blobsMatch
        : closure.completeState && closure.blobsMatch;
      const snapshots = fixture.targetFs.fileSnapshots.filter(
        (snapshot) => snapshot.token.startsWith('collision-notification-'),
      );
      const mergeCallSnapshots = fixture.targetFs.fileSnapshots.filter(
        (snapshot) => snapshot.token.startsWith('collision-merge-call-'),
      );
      metadataApplicationSafe = mergeCallSnapshots.length === 0
        ? result.rejected
        : mergeCallSnapshots.every((snapshot) => snapshotHasExactIncomingBinaries(snapshot, fixture));
      publicationSafe = snapshots.length === 0
        ? result.rejected
        : notificationStates.length === snapshots.length &&
          notificationStates.every((observed) =>
            observedPublicationIsSafe(
              observed,
              snapshots.find((snapshot) => snapshot.token === observed.token),
              fixture,
            ));
    });

    it('uses equal-length but byte-different collision input', () => {
      expect(fixtureValid).toBe(true);
    });

    it.fails('rejects the merge without changing active state or completes with exact incoming bytes', () => {
      expect(dispositionSafe).toBe(true);
    });

    it.fails('applies incoming operations only after every referenced incoming blob is exact', () => {
      expect(metadataApplicationSafe).toBe(true);
    });

    it.fails('never notifies observers while a published asset points at different bytes', () => {
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
      fixtureValid =
        collisionBytes.length === BASE_BYTES.length &&
        !bytesEqual(collisionBytes, BASE_BYTES) &&
        collisionInspection.binaries.filter((binary) => binary.path === fixture.baselinePath).length === 1;
      let mergeCallCount = 0;
      const notificationStates: ObservedMergeState[] = [];
      const originalMergeExternal = fixture.targetStore.mergeExternal.bind(fixture.targetStore);
      const mergeSpy = vi.spyOn(fixture.targetStore, 'mergeExternal').mockImplementation((incoming) => {
        mergeCallCount += 1;
        return originalMergeExternal(incoming);
      });
      const unsubscribe = fixture.targetStore.subscribe((state) => {
        notificationStates.push(observeMergeState(
          `referenced-collision-notification-${notificationStates.length}`,
          state,
          fixture.targetStore,
        ));
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
      const closure = await inspectMergedClosure(fixture);
      rejectedWithoutMutation =
        result.rejected &&
        closure.oldState &&
        closure.blobsMatch &&
        bytesEqual(
          await fixture.targetFs.readBytes(`${fixture.targetDir}/${fixture.baselinePath}`),
          BASE_BYTES,
        );
      noTransientPublication =
        mergeCallCount === 0 &&
        notificationStates.every((observed) => observedOldState(observed, fixture));
    });

    it('uses a byte-different incoming payload for an already referenced path', () => {
      expect(fixtureValid).toBe(true);
    });

    it.fails('rejects before mutating the old asset, its bytes, or any incoming metadata', () => {
      expect(rejectedWithoutMutation).toBe(true);
    });

    it.fails('never applies or notifies the impossible shared-path metadata before rejection', () => {
      expect(noTransientPublication).toBe(true);
    });
  });
});

describe('G0S-BLOB deferred package transaction boundaries', () => {
  it.todo('characterizes applyImportPlan/new-project wizard imports with the same marker-last closure');
  it.todo('verifies size/hash read-back rather than trusting a resolved write call');
  it.todo('serializes simultaneous merge/replacement across browser contexts with a project-scoped lock');
});
