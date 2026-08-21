import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { addModelAsset, replaceModelAsset } from '../../src/assets/modelAsset';
import { parseOpsJsonl } from '../../src/core/jsonl';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import {
  FaultInjectingMemoryFS,
  type FaultOutcome,
} from '../helpers/faultFs';

const USER: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000050',
  deviceId: 'dev_00000000000000000000000050',
  displayName: 'model replacement durability',
});
const encoder = new TextEncoder();
const STL_A = encoder.encode('solid durable-a\nendsolid durable-a\n');
const STL_B = encoder.encode('solid durable-b\nfacet normal 0 0 1\nendfacet\nendsolid durable-b\n');

function bytesEqual(actual: Uint8Array | null, expected: Uint8Array): boolean {
  return actual !== null &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
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

interface ReplacementFixture {
  fs: FaultInjectingMemoryFS;
  store: ProjectStore;
  dir: string;
  assetId: string;
  captionId: string;
  actorLogPath: string;
  oldPath: string;
  newPath: string;
  replacementNow: number;
}

class CorruptingWriteMemoryFS extends FaultInjectingMemoryFS {
  private corruptPath: string | null = null;
  corruptionObserved = false;

  corruptNextWrite(path: string): void {
    if (this.corruptPath !== null) throw new Error(`corruption already armed for ${this.corruptPath}`);
    this.corruptPath = path;
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    if (path !== this.corruptPath) {
      await super.writeBytes(path, data);
      return;
    }
    this.corruptPath = null;
    this.corruptionObserved = true;
    await super.writeBytes(path, Uint8Array.from(data, (value) => value ^ 0xff));
  }
}

async function makeReplacementFixture(
  fs: FaultInjectingMemoryFS = new FaultInjectingMemoryFS(),
): Promise<ReplacementFixture> {
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
  const newPath = `models/${assetId}.${replacementNow.toString(36)}.stl`;
  return {
    fs,
    store,
    dir,
    assetId,
    captionId,
    actorLogPath: `${dir}/ops/${store.actorId}.jsonl`,
    oldPath,
    newPath,
    replacementNow,
  };
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
    bytesEqual(await fixture.fs.readBytes(`${fixture.dir}/${fixture.oldPath}`), STL_A);
  const newComplete =
    stableFields &&
    asset.fields.path === fixture.newPath &&
    asset.fields.originalName === 'model-b.stl' &&
    asset.fields.size === STL_B.length &&
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
  | 'metadata-before'
  | 'metadata-prefix'
  | 'metadata-after'
  | 'cleanup-before'
  | 'cleanup-after';

const REPLACEMENT_ROWS: Array<{
  boundary: ReplacementFaultBoundary;
  baselineStateSafe: boolean;
  baselineCleanupSafe: boolean;
  expectedOutcome: FaultOutcome;
}> = [
  {
    boundary: 'new-blob-before',
    baselineStateSafe: true,
    baselineCleanupSafe: true,
    expectedOutcome: 'throw-before',
  },
  {
    boundary: 'new-blob-prefix',
    baselineStateSafe: true,
    baselineCleanupSafe: true,
    expectedOutcome: 'write-prefix-then-throw',
  },
  {
    boundary: 'metadata-before',
    baselineStateSafe: false,
    baselineCleanupSafe: false,
    expectedOutcome: 'throw-before',
  },
  {
    boundary: 'metadata-prefix',
    baselineStateSafe: false,
    baselineCleanupSafe: false,
    expectedOutcome: 'write-prefix-then-throw',
  },
  {
    boundary: 'metadata-after',
    baselineStateSafe: true,
    baselineCleanupSafe: false,
    expectedOutcome: 'commit-then-throw',
  },
  {
    boundary: 'cleanup-before',
    baselineStateSafe: true,
    baselineCleanupSafe: false,
    expectedOutcome: 'throw-before',
  },
  {
    boundary: 'cleanup-after',
    baselineStateSafe: true,
    baselineCleanupSafe: false,
    expectedOutcome: 'commit-then-throw',
  },
];

function armReplacementFault(
  fixture: ReplacementFixture,
  boundary: ReplacementFaultBoundary,
  message: string,
): { path: string } {
  if (boundary === 'new-blob-before' || boundary === 'new-blob-prefix') {
    const path = `${fixture.dir}/${fixture.newPath}`;
    if (boundary === 'new-blob-before') fixture.fs.failNextWrite(path, message);
    else fixture.fs.failNextWriteAfterPrefix(path, 5, message);
    return { path };
  }
  if (boundary.startsWith('metadata-')) {
    if (boundary === 'metadata-before') fixture.fs.failNextWrite(fixture.actorLogPath, message);
    else if (boundary === 'metadata-prefix') {
      fixture.fs.failNextWriteAfterPrefix(fixture.actorLogPath, 8, message);
    } else fixture.fs.failNextWriteAfterCommit(fixture.actorLogPath, message);
    return { path: fixture.actorLogPath };
  }
  const path = `${fixture.dir}/${fixture.oldPath}`;
  if (boundary === 'cleanup-before') fixture.fs.failNext('remove', path, message);
  else fixture.fs.failNextAfterCommit('remove', path, message);
  return { path };
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
      const fixture = await makeReplacementFixture();
      const eventOffset = fixture.fs.events.length;
      fixture.fs.watchTextAtStart(
        'old-blob-cleanup-log',
        'remove',
        `${fixture.dir}/${fixture.oldPath}`,
        fixture.actorLogPath,
      );
      const message = `injected replacement ${row.boundary}`;
      const armed = armReplacementFault(fixture, row.boundary, message);
      const now = vi.spyOn(Date, 'now').mockReturnValue(fixture.replacementNow);
      try {
        await settle(
          replaceModelAsset(fixture.fs, fixture.dir, fixture.store, fixture.assetId, 'model-b.stl', STL_B),
        );
      } finally {
        now.mockRestore();
      }
      await settle(fixture.store.flush());
      cleanupDeferred = fixture.fs.discardPendingFault();
      if (!row.boundary.startsWith('cleanup-') && cleanupDeferred) {
        throw new Error(`replacement did not reach the armed ${row.boundary} write`);
      }
      fixture.fs.assertAllConsumed();
      const scenarioEvents = fixture.fs.events.slice(eventOffset);
      const faultEvent = scenarioEvents.find(
        (event) => event.path === armed.path && event.outcome !== 'pass',
      );
      faultObserved = faultEvent?.outcome === row.expectedOutcome;
      const closure = await inspectReplacementClosure(fixture);
      stateSafe = closure.safe;
      logReadable = closure.logReadable;

      const cleanupEvent = scenarioEvents.find(
        (event) => event.method === 'remove' && event.path === `${fixture.dir}/${fixture.oldPath}`,
      );
      if (cleanupEvent === undefined) {
        cleanupSafe = true;
        cleanupProbeValid = true;
      } else {
        const cleanupSnapshot = fixture.fs.textSnapshots.find(
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

    if (row.baselineStateSafe) {
      it('already reopens with an exact old or exact new binding/blob pair', () => {
        expect(stateSafe).toBe(true);
      });
    } else {
      it.fails('reopens with an exact old or exact new binding/blob pair', () => {
        expect(stateSafe).toBe(true);
      });
    }

    if (row.baselineCleanupSafe) {
      it('does not start old-blob cleanup without durable replacement metadata', () => {
        expect(cleanupSafe).toBe(true);
      });
    } else {
      it.fails('starts old-blob cleanup only after the complete replacement operation is durable', () => {
        expect(cleanupSafe).toBe(true);
      });
    }
  });
}

describe.sequential('G0S-BLOB resolved-but-corrupt replacement blob', () => {
  let corruptionObserved: boolean;
  let stateSafe: boolean;

  beforeAll(async () => {
    const fs = new CorruptingWriteMemoryFS();
    const fixture = await makeReplacementFixture(fs);
    fs.corruptNextWrite(`${fixture.dir}/${fixture.newPath}`);
    const now = vi.spyOn(Date, 'now').mockReturnValue(fixture.replacementNow);
    try {
      await settle(replaceModelAsset(
          fixture.fs,
          fixture.dir,
          fixture.store,
          fixture.assetId,
          'model-b.stl',
          STL_B,
        ));
    } finally {
      now.mockRestore();
    }
    await settle(fixture.store.flush());
    corruptionObserved = fs.corruptionObserved;
    stateSafe = (await inspectReplacementClosure(fixture)).safe;
  });

  it('writes same-length altered bytes while reporting success', () => {
    expect(corruptionObserved).toBe(true);
  });

  it.fails('verifies the new blob bytes before publishing replacement metadata', () => {
    expect(stateSafe).toBe(true);
  });
});

describe.sequential('G0S-BLOB shared old-blob reference', () => {
  let fixtureValid: boolean;
  let allBindingsSafe: boolean;

  beforeAll(async () => {
    const fixture = await makeReplacementFixture();
    const sharedAssetId = fixture.store.createEntity('asset', {
      kind: 'model',
      path: fixture.oldPath,
      originalName: 'shared-model-a.stl',
      mime: 'model/stl',
      size: STL_A.length,
      transform: { scale: 1, upAxis: 'Y' },
      pinScale: 1,
    });
    await fixture.store.flush();
    const preReplacement = await ProjectStore.open(fixture.fs, fixture.dir, USER);
    if (preReplacement.loadErrors.length !== 0) {
      throw new Error('shared-reference fixture did not reopen cleanly before replacement');
    }
    const originalAsset = preReplacement.state.byKind.asset?.[fixture.assetId];
    const sharedAssetBefore = preReplacement.state.byKind.asset?.[sharedAssetId];
    fixtureValid =
      fixture.assetId !== sharedAssetId &&
      originalAsset?.fields.path === fixture.oldPath &&
      originalAsset.fields.size === STL_A.length &&
      originalAsset.fields.originalName === 'model-a.stl' &&
      sharedAssetBefore?.fields.path === fixture.oldPath &&
      sharedAssetBefore.fields.size === STL_A.length &&
      sharedAssetBefore.fields.originalName === 'shared-model-a.stl' &&
      bytesEqual(await fixture.fs.readBytes(`${fixture.dir}/${fixture.oldPath}`), STL_A);

    const now = vi.spyOn(Date, 'now').mockReturnValue(fixture.replacementNow);
    try {
      await settle(replaceModelAsset(
        fixture.fs,
        fixture.dir,
        fixture.store,
        fixture.assetId,
        'model-b.stl',
        STL_B,
      ));
    } finally {
      now.mockRestore();
    }
    await settle(fixture.store.flush());
    const reopened = await ProjectStore.open(fixture.fs, fixture.dir, USER);
    if (reopened.loadErrors.length !== 0) throw new Error('shared-reference fixture reopened with parse errors');
    const sharedAsset = reopened.state.byKind.asset?.[sharedAssetId];
    const replacementClosure = await inspectReplacementClosure(fixture);
    allBindingsSafe =
      replacementClosure.logReadable &&
      replacementClosure.safe &&
      sharedAsset?.fields.path === fixture.oldPath &&
      sharedAsset.fields.size === STL_A.length &&
      sharedAsset.fields.originalName === 'shared-model-a.stl' &&
      bytesEqual(await fixture.fs.readBytes(`${fixture.dir}/${fixture.oldPath}`), STL_A);
  });

  it('starts with two assets sharing one exact old blob', () => {
    expect(fixtureValid).toBe(true);
  });

  it.fails('deletes an old blob only after proving that no other active asset references it', () => {
    expect(allBindingsSafe).toBe(true);
  });
});

describe('G0S-BLOB model boundaries not exposed by the v1 API', () => {
  it.todo('keeps optimizedPath empty when optimized GLB write/verification fails');
  it.todo('retries or journals interrupted original/optimized cleanup across a later process restart');
  it.todo('pauses concurrent replacements and exposes both candidates through a typed resolution API');
});
