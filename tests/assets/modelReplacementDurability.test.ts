import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { addModelAsset, replaceModelAsset } from '../../src/assets/modelAsset';
import { writeVerifiedBytes } from '../../src/assets/verifiedWrite';
import { formatHlc, parseHlc } from '../../src/core/hlc';
import { parseOpsJsonl } from '../../src/core/jsonl';
import { reduce, versionVector, type ProjectState } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import {
  FaultInjectingMemoryFS,
  type FaultOutcome,
} from '../helpers/faultFs';
import {
  ResolvedCorruptingMemoryFS,
  type ResolvedCorruptionMode,
} from '../helpers/resolvedCorruptingFs';

const USER: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000050',
  deviceId: 'dev_00000000000000000000000050',
  displayName: 'model replacement durability',
});
const encoder = new TextEncoder();
const STL_A = encoder.encode('solid durable-a\nendsolid durable-a\n');
const STL_B = encoder.encode('solid durable-b\nfacet normal 0 0 1\nendfacet\nendsolid durable-b\n');
const STL_C = encoder.encode('solid durable-c\nfacet normal 1 0 0\nendfacet\nendsolid durable-c\n');

class MissingReadAfterWriteFS extends FaultInjectingMemoryFS {
  constructor(private readonly hiddenPath: string) {
    super();
  }

  override async readBytes(path: string): Promise<Uint8Array | null> {
    if (path === this.hiddenPath) return null;
    return super.readBytes(path);
  }
}

class MutatingArgumentFS extends FaultInjectingMemoryFS {
  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    if (data.length > 0) data[0] = data[0]! ^ 0xff;
    await super.writeBytes(path, data);
  }
}

type DynamicBlobFault = FaultOutcome | null;

class ReplacementFaultFS extends FaultInjectingMemoryFS {
  private selector: ((path: string) => boolean) | null = null;
  private expected: Uint8Array | null = null;
  private outcome: DynamicBlobFault = null;
  private message = '';
  matchedBlobPath: string | null = null;

  trackNextReplacementBlob(
    selector: (path: string) => boolean,
    expected: Uint8Array,
    outcome: DynamicBlobFault,
    message: string,
  ): void {
    if (this.selector !== null || this.matchedBlobPath !== null) {
      throw new Error('replacement blob tracker is already armed or consumed');
    }
    this.selector = selector;
    this.expected = new Uint8Array(expected);
    this.outcome = outcome;
    this.message = message;
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    if (
      this.matchedBlobPath === null &&
      this.selector !== null &&
      this.expected !== null &&
      this.selector(path) &&
      bytesEqual(data, this.expected)
    ) {
      this.matchedBlobPath = path;
      const outcome = this.outcome;
      this.selector = null;
      this.expected = null;
      if (outcome === 'throw-before') this.failNextWrite(path, this.message);
      else if (outcome === 'write-prefix-then-throw') {
        this.failNextWriteAfterPrefix(path, 5, this.message);
      } else if (outcome === 'commit-then-throw') {
        this.failNextWriteAfterCommit(path, this.message);
      }
    }
    await super.writeBytes(path, data);
  }
}

function bytesEqual(actual: Uint8Array | null, expected: Uint8Array): boolean {
  return actual !== null &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

describe('v1 exact blob read-back', () => {
  it('stores exact bytes without mutating the caller buffer', async () => {
    const fs = new FaultInjectingMemoryFS();
    const path = 'verified/exact.bin';
    const source = Uint8Array.from([1, 2, 3, 4]);
    const sourceBefore = new Uint8Array(source);
    await writeVerifiedBytes(fs, path, source);
    expect(source).toEqual(sourceBefore);
    expect(await fs.readBytes(path)).toEqual(sourceBefore);
  });

  it('rejects a write that cannot be read back', async () => {
    const path = 'verified/missing.bin';
    const fs = new MissingReadAfterWriteFS(path);
    await expect(writeVerifiedBytes(fs, path, Uint8Array.from([5, 6, 7]))).rejects.toThrow();
  });

  it('isolates its comparison source when an adapter mutates the write argument', async () => {
    const fs = new MutatingArgumentFS();
    const source = Uint8Array.from([8, 9, 10]);
    const sourceBefore = new Uint8Array(source);
    await expect(writeVerifiedBytes(fs, 'verified/mutating-adapter.bin', source)).rejects.toThrow();
    expect(source).toEqual(sourceBefore);
  });
});

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

interface ReplacementFixtureBase {
  fs: FaultInjectingMemoryFS;
  store: ProjectStore;
  dir: string;
  assetId: string;
  captionId: string;
  actorLogPath: string;
  oldPath: string;
  replacementNow: number;
}

interface ReplacementFixture extends ReplacementFixtureBase {
  newPath: string;
}

interface ReplacementAuthority {
  manifest: unknown;
  ops: Op[];
  state: ProjectState;
  vector: Record<string, number>;
}

type ReplacementAuthorityBaseline = ReplacementAuthority;

type ReplacementCandidateKind = 'old' | 'new';

interface ReplacementExpectation {
  path: string;
  originalName: string;
  bytes: Uint8Array;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function snapshotReplacementAuthority(
  store: ProjectStore,
  state: ProjectState = store.state,
): ReplacementAuthority {
  return {
    manifest: cloneValue(store.manifest),
    ops: cloneValue([...store.allOps]),
    state: cloneValue(state),
    vector: cloneValue(store.vector),
  };
}

function replacementOperationIsExact(
  op: Op,
  fixture: ReplacementFixture,
  baseline: ReplacementAuthorityBaseline,
  expectation: ReplacementExpectation,
): boolean {
  const previousOwnSequence = Math.max(
    0,
    ...baseline.ops
      .filter((candidate) => candidate.actor === fixture.store.actorId)
      .map((candidate) => candidate.op),
  );
  if (
    !isDeepStrictEqual(
      Object.keys(op).sort(),
      ['op', 'hlc', 'actor', 'user', 't', 'e', 'id', 'v'].sort(),
    ) ||
    op.op !== previousOwnSequence + 1 ||
    op.actor !== fixture.store.actorId ||
    op.user !== USER.userId ||
    op.t !== 'update' ||
    op.e !== 'asset' ||
    op.id !== fixture.assetId ||
    !isDeepStrictEqual(op.v, {
      path: expectation.path,
      originalName: expectation.originalName,
      size: expectation.bytes.length,
      optimizedPath: '',
      optimizedSize: 0,
    })
  ) {
    return false;
  }
  try {
    const parsed = parseHlc(op.hlc);
    return parsed.actor === fixture.store.actorId &&
      formatHlc(parsed.physical, parsed.counter, parsed.actor) === op.hlc;
  } catch {
    return false;
  }
}

function replacementCandidateKind(
  authority: ReplacementAuthority,
  fixture: ReplacementFixture,
  baseline: ReplacementAuthorityBaseline,
  expectation: ReplacementExpectation = {
    path: fixture.newPath,
    originalName: 'model-b.stl',
    bytes: STL_B,
  },
): ReplacementCandidateKind | null {
  const { state, ops, vector } = authority;
  if (!isDeepStrictEqual(authority.manifest, baseline.manifest)) return null;
  if (
    isDeepStrictEqual(ops, baseline.ops) &&
    isDeepStrictEqual(state, baseline.state) &&
    isDeepStrictEqual(vector, baseline.vector)
  ) {
    return 'old';
  }
  if (
    ops.length !== baseline.ops.length + 1 ||
    !isDeepStrictEqual(ops.slice(0, baseline.ops.length), baseline.ops)
  ) {
    return null;
  }
  const replacement = ops[ops.length - 1]!;
  if (!replacementOperationIsExact(replacement, fixture, baseline, expectation)) return null;
  const expectedOps = [...baseline.ops, replacement];
  const asset = state.byKind.asset?.[fixture.assetId];
  return isDeepStrictEqual(state, reduce(expectedOps)) &&
    isDeepStrictEqual(vector, versionVector(expectedOps)) &&
    asset?.fields.path === expectation.path &&
    asset.fields.originalName === expectation.originalName &&
    asset.fields.size === expectation.bytes.length &&
    asset.fields.optimizedPath === '' &&
    asset.fields.optimizedSize === 0
    ? 'new'
    : null;
}

async function makeReplacementFixture(
  fs: FaultInjectingMemoryFS = new FaultInjectingMemoryFS(),
): Promise<ReplacementFixtureBase> {
  const dir = 'projects/replacement-durability';
  const store = await ProjectStore.create(fs, dir, 'replacement durability', USER);
  const assetId = await addModelAsset(fs, dir, store, 'model-a.stl', STL_A);
  const captionId = store.createEntity('caption', {
    title: 'durable pin',
    anchor: { modelAssetId: assetId, position: [1, 2, 3] },
  });
  store.updateEntity('asset', assetId, {
    transform: { scale: 2.5, upAxis: 'Z' },
    pinScale: 1.8,
  });
  await store.flush();
  const oldPath = store.state.byKind.asset![assetId]!.fields.path as string;
  const replacementNow = Date.now() + 60_000;
  return {
    fs,
    store,
    dir,
    assetId,
    captionId,
    actorLogPath: `${dir}/ops/${store.actorId}.jsonl`,
    oldPath,
    replacementNow,
  };
}

function isDirectReplacementPath(fixture: ReplacementFixtureBase, absolutePath: string): boolean {
  const prefix = `${fixture.dir}/models/`;
  const suffix = '.stl';
  if (!absolutePath.startsWith(prefix) || !absolutePath.endsWith(suffix)) return false;
  const filename = absolutePath.slice(prefix.length);
  return filename.length > suffix.length && !filename.includes('/') && !filename.includes('\\') &&
    absolutePath !== `${fixture.dir}/${fixture.oldPath}`;
}

function bindReplacementPath(
  fixture: ReplacementFixtureBase,
  absolutePath: string | null,
): ReplacementFixture {
  if (absolutePath === null || !isDirectReplacementPath(fixture, absolutePath)) {
    throw new Error(`invalid dynamically observed replacement path: ${String(absolutePath)}`);
  }
  return { ...fixture, newPath: absolutePath.slice(fixture.dir.length + 1) };
}

function bindReplacementAuthorityPath(
  fixture: ReplacementFixtureBase,
  attemptedPath: string | null,
): ReplacementFixture {
  const livePath = fixture.store.state.byKind.asset?.[fixture.assetId]?.fields.path;
  const liveAbsolutePath = typeof livePath === 'string' ? `${fixture.dir}/${livePath}` : null;
  return bindReplacementPath(
    fixture,
    liveAbsolutePath !== null && isDirectReplacementPath(fixture, liveAbsolutePath)
      ? liveAbsolutePath
      : attemptedPath,
  );
}

interface ReplacementClosure {
  oldComplete: boolean;
  newComplete: boolean;
  logReadable: boolean;
  safe: boolean;
}

async function inspectReplacementClosure(fixture: ReplacementFixture): Promise<ReplacementClosure> {
  const reopened = await ProjectStore.open(fixture.fs, fixture.dir, USER);
  const asset = reopened.state.byKind.asset?.[fixture.assetId];
  const caption = reopened.state.byKind.caption?.[fixture.captionId];
  if (asset === undefined || caption === undefined) {
    return {
      oldComplete: false,
      newComplete: false,
      logReadable: reopened.loadErrors.length === 0,
      safe: false,
    };
  }
  const anchor = caption.fields.anchor as { modelAssetId?: unknown } | undefined;
  const stableFields =
    isDeepStrictEqual(asset.fields.transform, { scale: 2.5, upAxis: 'Z' }) &&
    asset.fields.pinScale === 1.8 &&
    anchor?.modelAssetId === fixture.assetId;
  const oldComplete =
    stableFields &&
    asset.fields.path === fixture.oldPath &&
    asset.fields.originalName === 'model-a.stl' &&
    asset.fields.size === STL_A.length &&
    asset.fields.optimizedPath === undefined &&
    asset.fields.optimizedSize === undefined &&
    bytesEqual(await fixture.fs.readBytes(`${fixture.dir}/${fixture.oldPath}`), STL_A);
  const newComplete =
    stableFields &&
    asset.fields.path === fixture.newPath &&
    asset.fields.originalName === 'model-b.stl' &&
    asset.fields.size === STL_B.length &&
    asset.fields.optimizedPath === '' &&
    asset.fields.optimizedSize === 0 &&
    bytesEqual(await fixture.fs.readBytes(`${fixture.dir}/${fixture.newPath}`), STL_B);
  return {
    oldComplete,
    newComplete,
    logReadable: reopened.loadErrors.length === 0,
    safe: oldComplete || newComplete,
  };
}

type ReplacementFaultBoundary =
  | 'new-blob-before'
  | 'new-blob-prefix'
  | 'new-blob-after'
  | 'metadata-before'
  | 'metadata-prefix'
  | 'metadata-after'
  | 'cleanup-before'
  | 'cleanup-after';

const REPLACEMENT_ROWS: Array<{
  boundary: ReplacementFaultBoundary;
  expectedOutcome: FaultOutcome;
}> = [
  {
    boundary: 'new-blob-before',
    expectedOutcome: 'throw-before',
  },
  {
    boundary: 'new-blob-prefix',
    expectedOutcome: 'write-prefix-then-throw',
  },
  {
    boundary: 'new-blob-after',
    expectedOutcome: 'commit-then-throw',
  },
  {
    boundary: 'metadata-before',
    expectedOutcome: 'throw-before',
  },
  {
    boundary: 'metadata-prefix',
    expectedOutcome: 'write-prefix-then-throw',
  },
  {
    boundary: 'metadata-after',
    expectedOutcome: 'commit-then-throw',
  },
  {
    boundary: 'cleanup-before',
    expectedOutcome: 'throw-before',
  },
  {
    boundary: 'cleanup-after',
    expectedOutcome: 'commit-then-throw',
  },
];

function armReplacementFault(
  fixture: ReplacementFixtureBase,
  fs: ReplacementFaultFS,
  boundary: ReplacementFaultBoundary,
  message: string,
): { path: () => string | null } {
  const dynamicOutcome: DynamicBlobFault = boundary === 'new-blob-before'
    ? 'throw-before'
    : boundary === 'new-blob-prefix'
      ? 'write-prefix-then-throw'
      : boundary === 'new-blob-after'
        ? 'commit-then-throw'
        : null;
  fs.trackNextReplacementBlob(
    (path) => isDirectReplacementPath(fixture, path),
    STL_B,
    dynamicOutcome,
    message,
  );
  if (boundary.startsWith('new-blob-')) return { path: () => fs.matchedBlobPath };
  if (boundary.startsWith('metadata-')) {
    if (boundary === 'metadata-before') fs.failNextWrite(fixture.actorLogPath, message);
    else if (boundary === 'metadata-prefix') {
      fs.failNextWriteAfterPrefix(fixture.actorLogPath, 8, message);
    } else fs.failNextWriteAfterCommit(fixture.actorLogPath, message);
    return { path: () => fixture.actorLogPath };
  }
  const path = `${fixture.dir}/${fixture.oldPath}`;
  if (boundary === 'cleanup-before') fs.failNext('remove', path, message);
  else fs.failNextAfterCommit('remove', path, message);
  return { path: () => path };
}

function containsCompleteReplacementOp(rawText: string, fixture: ReplacementFixture): boolean {
  const parsed = parseOpsJsonl(rawText);
  if (parsed.errors.length !== 0) return false;
  return parsed.ops.some((op: Op) =>
    op.t === 'update' &&
    op.e === 'asset' &&
    op.id === fixture.assetId &&
    op.v !== undefined &&
    op.v.path === fixture.newPath &&
    op.v.originalName === 'model-b.stl' &&
    op.v.size === STL_B.length);
}

for (const row of REPLACEMENT_ROWS) {
  describe.sequential(`G0S-BLOB model replacement: ${row.boundary}`, () => {
    let stateSafe: boolean;
    let cleanupSafe: boolean;
    let cleanupProbeValid: boolean;
    let faultObserved: boolean;
    let cleanupDeferred: boolean;
    let logReadable: boolean;

    beforeAll(async () => {
      const fs = new ReplacementFaultFS();
      const fixtureBase = await makeReplacementFixture(fs);
      const baseline = snapshotReplacementAuthority(fixtureBase.store);
      const eventOffset = fs.events.length;
      fs.watchTextAtStart(
        'old-blob-cleanup-log',
        'remove',
        `${fixtureBase.dir}/${fixtureBase.oldPath}`,
        fixtureBase.actorLogPath,
      );
      const message = `injected replacement ${row.boundary}`;
      const armed = armReplacementFault(fixtureBase, fs, row.boundary, message);
      const now = vi.spyOn(Date, 'now').mockReturnValue(fixtureBase.replacementNow);
      let outcome: { rejected: boolean; message: string | null };
      try {
        outcome = await settle(
          replaceModelAsset(fs, fixtureBase.dir, fixtureBase.store, fixtureBase.assetId, 'model-b.stl', STL_B),
        );
      } finally {
        now.mockRestore();
      }
      await settle(fixtureBase.store.flush());
      const attemptedPath = fs.matchedBlobPath;
      const fixture = bindReplacementAuthorityPath(fixtureBase, attemptedPath);
      cleanupDeferred = fs.discardPendingFault();
      if (!row.boundary.startsWith('cleanup-') && cleanupDeferred) {
        throw new Error(`replacement did not reach the armed ${row.boundary} write`);
      }
      fs.assertAllConsumed();
      const scenarioEvents = fs.events.slice(eventOffset);
      const armedPath = armed.path();
      if (armedPath === null) throw new Error(`replacement did not resolve ${row.boundary} fault path`);
      const faultEvent = scenarioEvents.find(
        (event) => event.path === armedPath && event.outcome !== 'pass',
      );
      faultObserved = faultEvent?.outcome === row.expectedOutcome;
      const closure = await inspectReplacementClosure(fixture);
      const exactAuthoritySafe = row.boundary === 'metadata-prefix'
        ? true
        : await finalReplacementAuthorityIsSafe(fixture, baseline, outcome.rejected);
      stateSafe =
        closure.safe &&
        (closure.oldComplete ? outcome.rejected : closure.newComplete) &&
        exactAuthoritySafe;
      logReadable = closure.logReadable;

      const cleanupEvent = scenarioEvents.find(
        (event) => event.method === 'remove' && event.path === `${fixture.dir}/${fixture.oldPath}`,
      );
      if (cleanupEvent === undefined) {
        cleanupSafe = true;
        cleanupProbeValid = true;
      } else {
        const cleanupSnapshot = fs.textSnapshots.find(
          (snapshot) =>
            snapshot.token === 'old-blob-cleanup-log' &&
            snapshot.eventStartIndex === cleanupEvent.startIndex,
        );
        cleanupProbeValid = cleanupSnapshot !== undefined;
        const metadataCommittedBeforeCleanup = scenarioEvents.some(
          (event) =>
            event.path === fixture.actorLogPath &&
            event.commitIndex !== null &&
            event.commitIndex < cleanupEvent.startIndex,
        );
        cleanupSafe =
          metadataCommittedBeforeCleanup &&
          cleanupSnapshot !== undefined &&
          cleanupSnapshot.text !== null &&
          containsCompleteReplacementOp(cleanupSnapshot.text, fixture);
      }
    });

    it('reaches the requested durable boundary or safely defers optional cleanup', () => {
      expect(faultObserved || (row.boundary.startsWith('cleanup-') && cleanupDeferred)).toBe(true);
      expect(cleanupProbeValid).toBe(true);
    });

    if (row.boundary === 'metadata-prefix') {
      it.fails('recovers or truncates a partial metadata record before the project is reopened', () => {
        expect(logReadable).toBe(true);
      });
    } else {
      it('keeps the operation log parseable at this boundary', () => {
        expect(logReadable).toBe(true);
      });
    }

    it('already reopens with an exact old or exact new binding/blob pair', () => {
      expect(stateSafe).toBe(true);
    });

    it('does not start old-blob cleanup without durable replacement metadata', () => {
      expect(cleanupSafe).toBe(true);
    });
  });
}

function replacementBlobIsExact(
  kind: ReplacementCandidateKind,
  fixture: ReplacementFixture,
  files: ReadonlyMap<string, Uint8Array | null>,
): boolean {
  const path = kind === 'old'
    ? `${fixture.dir}/${fixture.oldPath}`
    : `${fixture.dir}/${fixture.newPath}`;
  const expected = kind === 'old' ? STL_A : STL_B;
  return bytesEqual(files.get(path) ?? null, expected);
}

async function activeReplacementLogIsExact(
  fixture: ReplacementFixture,
  authority: ReplacementAuthority,
): Promise<boolean> {
  const activeLogs = (await fixture.fs.list(`${fixture.dir}/ops/`))
    .filter((path) => path.endsWith('.jsonl'))
    .sort();
  if (!isDeepStrictEqual(activeLogs, [fixture.actorLogPath])) return false;
  const raw = await fixture.fs.readText(fixture.actorLogPath);
  if (raw === null) return false;
  const parsed = parseOpsJsonl(raw);
  return parsed.errors.length === 0 && isDeepStrictEqual(parsed.ops, authority.ops);
}

async function finalReplacementAuthorityIsSafe(
  fixture: ReplacementFixture,
  baseline: ReplacementAuthorityBaseline,
  rejected: boolean,
): Promise<boolean> {
  let reopened: ProjectStore;
  try {
    reopened = await ProjectStore.open(fixture.fs, fixture.dir, USER);
  } catch {
    return false;
  }
  if (reopened.loadErrors.length !== 0) return false;
  const live = snapshotReplacementAuthority(fixture.store);
  const durable = snapshotReplacementAuthority(reopened);
  const liveKind = replacementCandidateKind(live, fixture, baseline);
  const durableKind = replacementCandidateKind(durable, fixture, baseline);
  if (liveKind === null || durableKind === null || (!rejected && durableKind !== 'new')) return false;
  const finalFiles = new Map<string, Uint8Array | null>([
    [`${fixture.dir}/${fixture.oldPath}`, await fixture.fs.readBytes(`${fixture.dir}/${fixture.oldPath}`)],
    [`${fixture.dir}/${fixture.newPath}`, await fixture.fs.readBytes(`${fixture.dir}/${fixture.newPath}`)],
  ]);
  return replacementBlobIsExact(liveKind, fixture, finalFiles) &&
    replacementBlobIsExact(durableKind, fixture, finalFiles) &&
    await activeReplacementLogIsExact(fixture, durable);
}

for (const mode of ['bitflip', 'truncate'] as const satisfies readonly ResolvedCorruptionMode[]) {
  describe.sequential(`G0S-BLOB resolved-but-corrupt replacement blob: ${mode}`, () => {
    let fixtureShapeValid: boolean;
    let corruptionReached: boolean;
    let verificationObserved: boolean;
    let publicationSafe: boolean;
    let finalAuthoritySafe: boolean;

    beforeAll(async () => {
      let fixtureBase!: ReplacementFixtureBase;
      const fs = new ResolvedCorruptingMemoryFS(
        (path) => fixtureBase !== undefined && isDirectReplacementPath(fixtureBase, path),
        STL_B,
        mode,
      );
      fixtureBase = await makeReplacementFixture(fs);
      const baseline = snapshotReplacementAuthority(fixtureBase.store);
      const sourceCopy = new Uint8Array(STL_B);
      const publications: Array<{ token: string; authority: ReplacementAuthority }> = [];
      let publicationIndex = 0;
      const unsubscribe = fixtureBase.store.subscribe((state) => {
        const token = `resolved-${mode}-publication-${++publicationIndex}`;
        publications.push({ token, authority: snapshotReplacementAuthority(fixtureBase.store, state) });
        const targetPath = fs.targetPath;
        const statePath = state.byKind.asset?.[fixtureBase.assetId]?.fields.path;
        fs.markFiles(token, [
          `${fixtureBase.dir}/${fixtureBase.oldPath}`,
          ...(targetPath === null ? [] : [targetPath]),
          ...(typeof statePath === 'string' ? [`${fixtureBase.dir}/${statePath}`] : []),
        ]);
      });

      let outcome: { rejected: boolean; message: string | null };
      fs.beginAction();
      try {
        outcome = await settle(replaceModelAsset(
          fs,
          fixtureBase.dir,
          fixtureBase.store,
          fixtureBase.assetId,
          'model-b.stl',
          STL_B,
        ));
      } finally {
        fs.endAction();
        unsubscribe();
      }
      await settle(fixtureBase.store.flush());
      await fs.settleProbes();
      const attemptedPath = fs.injectedPath;
      const fixture = bindReplacementAuthorityPath(fixtureBase, attemptedPath);

      const corrupt = fs.corruptBytes;
      fixtureShapeValid =
        replacementCandidateKind(baseline, fixture, baseline) === 'old' &&
        bytesEqual(STL_B, sourceCopy) &&
        fs.injectionCount === 1 &&
        attemptedPath !== null &&
        isDirectReplacementPath(fixtureBase, attemptedPath) &&
        fs.requestedWrites.length >= 1 &&
        fs.requestedWrites.every((bytes) => bytesEqual(bytes, STL_B)) &&
        corrupt !== null &&
        !bytesEqual(corrupt, STL_B) &&
        (mode === 'bitflip'
          ? corrupt.length === STL_B.length
          : corrupt.length === STL_B.length - 1);
      corruptionReached = corrupt !== null;
      verificationObserved =
        corrupt !== null &&
        fs.verificationReads.some((bytes) => bytes !== null && bytesEqual(bytes, corrupt));
      publicationSafe = publications.every((publication) => {
        const snapshot = fs.fileSnapshots.find((candidate) => candidate.token === publication.token);
        if (snapshot === undefined) return false;
        const kind = replacementCandidateKind(publication.authority, fixture, baseline);
        return kind !== null && replacementBlobIsExact(kind, fixture, snapshot.files);
      });
      finalAuthoritySafe = await finalReplacementAuthorityIsSafe(fixture, baseline, outcome.rejected);
    });

    it('commits the intended resolved-corruption fixture without mutating the source bytes', () => {
      expect({ fixtureShapeValid, corruptionReached }).toEqual({
        fixtureShapeValid: true,
        corruptionReached: true,
      });
    });

    it('reads back the corrupt stored bytes before accepting replacement metadata', () => {
      expect(verificationObserved).toBe(true);
    });

    it('publishes no corrupt binding and finishes with exact old or exact verified-new authority', () => {
      expect({ publicationSafe, finalAuthoritySafe }).toEqual({
        publicationSafe: true,
        finalAuthoritySafe: true,
      });
    });
  });
}

describe.sequential('G0S-BLOB repeated replacement in one timestamp tick', () => {
  let fixtureShapeValid: boolean;
  let verificationObserved: boolean;
  let authoritySafe: boolean;

  beforeAll(async () => {
    let fixtureBase!: ReplacementFixtureBase;
    const fs = new ResolvedCorruptingMemoryFS(
      (path) => fixtureBase !== undefined && isDirectReplacementPath(fixtureBase, path),
      STL_C,
      'bitflip',
    );
    fixtureBase = await makeReplacementFixture(fs);
    const fixedNow = fixtureBase.replacementNow;
    const now = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    let firstOutcome: { rejected: boolean; message: string | null };
    let secondOutcome: { rejected: boolean; message: string | null };
    let firstPath: string | null = null;
    let baseline!: ReplacementAuthorityBaseline;
    const publications: Array<{ token: string; authority: ReplacementAuthority }> = [];
    let unsubscribe = (): void => undefined;
    try {
      firstOutcome = await settle(replaceModelAsset(
        fs,
        fixtureBase.dir,
        fixtureBase.store,
        fixtureBase.assetId,
        'model-b.stl',
        STL_B,
      ));
      const observedFirstPath = fixtureBase.store.state.byKind.asset?.[fixtureBase.assetId]?.fields.path;
      firstPath = typeof observedFirstPath === 'string' ? observedFirstPath : null;
      baseline = snapshotReplacementAuthority(fixtureBase.store);
      let publicationIndex = 0;
      unsubscribe = fixtureBase.store.subscribe((state) => {
        const token = `repeat-replacement-${++publicationIndex}`;
        publications.push({ token, authority: snapshotReplacementAuthority(fixtureBase.store, state) });
        const targetPath = fs.targetPath;
        const statePath = state.byKind.asset?.[fixtureBase.assetId]?.fields.path;
        fs.markFiles(token, [
          ...(firstPath === null ? [] : [`${fixtureBase.dir}/${firstPath}`]),
          ...(targetPath === null ? [] : [targetPath]),
          ...(typeof statePath === 'string' ? [`${fixtureBase.dir}/${statePath}`] : []),
        ]);
      });
      fs.beginAction();
      try {
        secondOutcome = await settle(replaceModelAsset(
          fs,
          fixtureBase.dir,
          fixtureBase.store,
          fixtureBase.assetId,
          'model-c.stl',
          STL_C,
        ));
      } finally {
        fs.endAction();
      }
    } finally {
      unsubscribe();
      now.mockRestore();
    }
    await settle(fixtureBase.store.flush());
    await fs.settleProbes();
    const attemptedPath = fs.injectedPath;
    if (firstPath === null) throw new Error('first replacement did not publish a path');
    const secondFixtureBase: ReplacementFixtureBase = { ...fixtureBase, oldPath: firstPath };
    const fixture = bindReplacementAuthorityPath(secondFixtureBase, attemptedPath);
    const expectation: ReplacementExpectation = {
      path: fixture.newPath,
      originalName: 'model-c.stl',
      bytes: STL_C,
    };
    const corrupt = fs.corruptBytes;
    const firstAbsolutePath = `${fixture.dir}/${firstPath}`;
    fixtureShapeValid =
      !firstOutcome.rejected &&
      isDirectReplacementPath(fixtureBase, firstAbsolutePath) &&
      attemptedPath !== null &&
      isDirectReplacementPath(fixtureBase, attemptedPath) &&
      firstAbsolutePath !== attemptedPath &&
      firstPath !== fixture.newPath &&
      fs.injectionCount === 1 &&
      corrupt !== null &&
      !bytesEqual(corrupt, STL_C) &&
      fs.requestedWrites.every((bytes) => bytesEqual(bytes, STL_C));
    verificationObserved =
      corrupt !== null &&
      fs.verificationReads.some((bytes) => bytes !== null && bytesEqual(bytes, corrupt));

    const publicationSafe = publications.every((publication) => {
      const kind = replacementCandidateKind(publication.authority, fixture, baseline, expectation);
      const snapshot = fs.fileSnapshots.find((candidate) => candidate.token === publication.token);
      if (kind === null || snapshot === undefined || firstPath === null) return false;
      const path = kind === 'old' ? `${fixture.dir}/${firstPath}` : `${fixture.dir}/${fixture.newPath}`;
      const expected = kind === 'old' ? STL_B : STL_C;
      return bytesEqual(snapshot.files.get(path) ?? null, expected);
    });
    let reopened: ProjectStore | null = null;
    try {
      reopened = await ProjectStore.open(fs, fixture.dir, USER);
    } catch {
      // Checked below as an unsafe final authority.
    }
    const live = snapshotReplacementAuthority(fixture.store);
    const durable = reopened === null ? null : snapshotReplacementAuthority(reopened);
    const liveKind = replacementCandidateKind(live, fixture, baseline, expectation);
    const durableKind = durable === null ? null : replacementCandidateKind(durable, fixture, baseline, expectation);
    const finalPath = durableKind === 'old' ? firstPath : durableKind === 'new' ? fixture.newPath : null;
    const finalBytes = durableKind === 'old' ? STL_B : durableKind === 'new' ? STL_C : null;
    authoritySafe =
      publicationSafe &&
      liveKind !== null &&
      durableKind !== null &&
      reopened !== null &&
      reopened.loadErrors.length === 0 &&
      (secondOutcome.rejected || durableKind === 'new') &&
      finalPath !== null &&
      finalBytes !== null &&
      bytesEqual(await fs.readBytes(`${fixture.dir}/${finalPath}`), finalBytes) &&
      await activeReplacementLogIsExact(fixture, durable!);
  });

  it('uses distinct canonical paths for two replacements under the same wall-clock value', () => {
    expect(fixtureShapeValid).toBe(true);
  });

  it('verifies the second write and retains exact first-or-second durable authority', () => {
    expect({ verificationObserved, authoritySafe }).toEqual({
      verificationObserved: true,
      authoritySafe: true,
    });
  });
});

describe.sequential('G0S-BLOB shared old-blob reference', () => {
  let fixtureValid: boolean;
  let allBindingsSafe: boolean;
  let replacementSucceeded: boolean;

  beforeAll(async () => {
    const fixtureBase = await makeReplacementFixture();
    const sharedAssetId = fixtureBase.store.createEntity('asset', {
      kind: 'model',
      path: fixtureBase.oldPath,
      originalName: 'shared-model-a.stl',
      mime: 'model/stl',
      size: STL_A.length,
      transform: { scale: 1, upAxis: 'Y' },
      pinScale: 1,
    });
    await fixtureBase.store.flush();
    const preReplacement = await ProjectStore.open(fixtureBase.fs, fixtureBase.dir, USER);
    if (preReplacement.loadErrors.length !== 0) {
      throw new Error('shared-reference fixture did not reopen cleanly before replacement');
    }
    const baseline = snapshotReplacementAuthority(fixtureBase.store);
    const originalAsset = preReplacement.state.byKind.asset?.[fixtureBase.assetId];
    const sharedAssetBefore = preReplacement.state.byKind.asset?.[sharedAssetId];
    const initialFixtureValid =
      fixtureBase.assetId !== sharedAssetId &&
      originalAsset?.fields.path === fixtureBase.oldPath &&
      originalAsset.fields.size === STL_A.length &&
      originalAsset.fields.originalName === 'model-a.stl' &&
      sharedAssetBefore?.fields.path === fixtureBase.oldPath &&
      sharedAssetBefore.fields.size === STL_A.length &&
      sharedAssetBefore.fields.originalName === 'shared-model-a.stl' &&
      bytesEqual(await fixtureBase.fs.readBytes(`${fixtureBase.dir}/${fixtureBase.oldPath}`), STL_A);

    const publications: Array<{ token: string; authority: ReplacementAuthority }> = [];
    let publicationIndex = 0;
    const unsubscribe = fixtureBase.store.subscribe((state) => {
      const token = `healthy-replacement-${++publicationIndex}`;
      publications.push({ token, authority: snapshotReplacementAuthority(fixtureBase.store, state) });
      const path = state.byKind.asset?.[fixtureBase.assetId]?.fields.path;
      fixtureBase.fs.markFiles(token, [
        `${fixtureBase.dir}/${fixtureBase.oldPath}`,
        ...(typeof path === 'string' ? [`${fixtureBase.dir}/${path}`] : []),
      ]);
    });

    const now = vi.spyOn(Date, 'now').mockReturnValue(fixtureBase.replacementNow);
    let outcome: { rejected: boolean; message: string | null };
    try {
      outcome = await settle(replaceModelAsset(
        fixtureBase.fs,
        fixtureBase.dir,
        fixtureBase.store,
        fixtureBase.assetId,
        'model-b.stl',
        STL_B,
      ));
    } finally {
      unsubscribe();
      now.mockRestore();
    }
    await settle(fixtureBase.store.flush());
    await fixtureBase.fs.settleProbes();
    const observedPath = fixtureBase.store.state.byKind.asset?.[fixtureBase.assetId]?.fields.path;
    const discardedAttemptPath = `${fixtureBase.dir}/models/discarded-attempt.stl`;
    const fixture = bindReplacementAuthorityPath(
      fixtureBase,
      discardedAttemptPath,
    );
    const reopened = await ProjectStore.open(fixture.fs, fixture.dir, USER);
    if (reopened.loadErrors.length !== 0) throw new Error('shared-reference fixture reopened with parse errors');
    const sharedAsset = reopened.state.byKind.asset?.[sharedAssetId];
    const replacementClosure = await inspectReplacementClosure(fixture);
    const durableAuthority = snapshotReplacementAuthority(reopened);
    const liveAuthority = snapshotReplacementAuthority(fixture.store);
    const notificationKindsAreExact = publications.length > 0 && publications.every((publication) => {
      const kind = replacementCandidateKind(publication.authority, fixture, baseline);
      const snapshot = fixture.fs.fileSnapshots.find((candidate) => candidate.token === publication.token);
      return kind === 'new' &&
        snapshot !== undefined &&
        replacementBlobIsExact(kind, fixture, snapshot.files) &&
        bytesEqual(snapshot.files.get(`${fixture.dir}/${fixture.oldPath}`) ?? null, STL_A);
    });
    const manifestMutation = cloneValue(durableAuthority);
    manifestMutation.manifest = { ...(manifestMutation.manifest as Record<string, unknown>), name: 'mutated' };
    const duplicateOp = cloneValue(durableAuthority);
    duplicateOp.ops.push(cloneValue(duplicateOp.ops[duplicateOp.ops.length - 1]!));
    const classifierControlsAreExact =
      replacementCandidateKind(baseline, fixture, baseline) === 'old' &&
      replacementCandidateKind(liveAuthority, fixture, baseline) === 'new' &&
      replacementCandidateKind(durableAuthority, fixture, baseline) === 'new' &&
      replacementCandidateKind(manifestMutation, fixture, baseline) === null &&
      replacementCandidateKind(duplicateOp, fixture, baseline) === null;
    const finalAuthoritySafe = await finalReplacementAuthorityIsSafe(fixture, baseline, outcome.rejected);
    const extraLogPath = `${fixture.dir}/ops/a_0000000000000.jsonl`;
    await fixture.fs.writeText(extraLogPath, '');
    const extraActiveLogRejected = !(await activeReplacementLogIsExact(fixture, durableAuthority));
    await fixture.fs.remove(extraLogPath);
    replacementSucceeded =
      !outcome.rejected &&
      replacementClosure.newComplete &&
      notificationKindsAreExact &&
      classifierControlsAreExact &&
      extraActiveLogRejected &&
      finalAuthoritySafe;
    fixtureValid =
      initialFixtureValid &&
      typeof observedPath === 'string' &&
      fixture.newPath === observedPath &&
      `${fixture.dir}/${fixture.newPath}` !== discardedAttemptPath &&
      classifierControlsAreExact;
    allBindingsSafe =
      replacementClosure.logReadable &&
      replacementClosure.newComplete &&
      sharedAsset?.fields.path === fixture.oldPath &&
      sharedAsset.fields.size === STL_A.length &&
      sharedAsset.fields.originalName === 'shared-model-a.stl' &&
      bytesEqual(await fixture.fs.readBytes(`${fixture.dir}/${fixture.oldPath}`), STL_A);
  });

  it('starts with two assets sharing one exact old blob', () => {
    expect(fixtureValid).toBe(true);
  });

  it('completes the replacement while preserving the exact blob used by another active asset', () => {
    expect({ replacementSucceeded, allBindingsSafe }).toEqual({
      replacementSucceeded: true,
      allBindingsSafe: true,
    });
  });
});

describe('G0S-BLOB model boundaries not exposed by the v1 API', () => {
  it.todo('keeps optimizedPath empty when optimized GLB write/verification fails');
  it.todo('retries or journals interrupted original/optimized cleanup across a later process restart');
  it.todo('pauses concurrent replacements and exposes both candidates through a typed resolution API');
});
