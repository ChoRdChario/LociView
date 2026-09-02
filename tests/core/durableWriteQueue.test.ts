import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportOpsOnlyZip, exportProjectZip } from '../../src/assets/package';
import { parseOpsJsonl, serializeOps } from '../../src/core/jsonl';
import { reduce, versionVector, visibleEntities, type ProjectState } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import {
  ProjectStore,
  type DurableWriteStatus,
  type Identity,
} from '../../src/core/store';
import type { WorkspaceFS } from '../../src/platform/fs';
import { generateAndStartPackageDownload } from '../../src/ui/packageExport';
import {
  describeProjectAccess,
  describeSaveStatus,
  type PackageExportStatus,
} from '../../src/ui/saveStatus';
import {
  DurableWriteFault,
  DurableWriteMemoryFS,
  DurableQuotaFault,
  type AppendFaultStep,
} from '../helpers/durableWriteFs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const USER: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000030',
  deviceId: 'dev_00000000000000000000000030',
  displayName: 'G0S durable queue',
});
const MANIFEST = JSON.stringify({
  format: 'lociview-project',
  schemaVersion: 1,
  projectId: 'prj_00000000000000000000000030',
  name: 'G0S durable queue characterization',
  createdAt: '2026-08-21T00:00:00.000Z',
  generator: 'G0S test fixture',
});

interface RecoveryResult {
  path: string;
  expectedOps: [Op, Op, Op];
  baselineRawText: string;
  flushRejected: boolean[];
  rawSnapshots: Uint8Array[];
  observedFaultTokens: string[];
  rawText: string;
  rawOps: Op[];
  parseErrorCount: number;
  reopenLoadErrorCount: number;
  visibleIds: string[];
  firstEvent: DurableWriteMemoryFS['events'][number] | undefined;
  activeLogPaths: string[];
  reopenedOps: Op[];
  reopenedVector: Record<string, number>;
  reopenedState: ProjectState;
  reopenedManifest: ProjectStore['manifest'];
  durabilityEvents: Array<{
    status: DurableWriteStatus;
    rawBytes: Uint8Array;
  }>;
  utf8SplitInsideScalar: boolean;
}

interface RecoveryScenario {
  label: string;
  scenarioDigit: number;
  steps: AppendFaultStep[];
  flushAttempts: number;
  firstErrorName: 'DurableWriteFault' | 'QuotaExceededError';
  kind: 'exact' | 'commit';
  requiredFaultTokens?: string[];
  splitUtf8Scalar?: boolean;
}

async function seedEmptyProject(fs: WorkspaceFS, dir: string): Promise<void> {
  await fs.writeText(`${dir}/lociview.json`, MANIFEST);
}

function fixedCaptionId(scenarioDigit: number, itemDigit: number): string {
  return `cap_${scenarioDigit}${itemDigit}${'0'.repeat(24)}`;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function bytesStartWith(value: Uint8Array, prefix: Uint8Array): boolean {
  if (value.length < prefix.length) return false;
  return prefix.every((byte, index) => value[index] === byte);
}

function byteIndexOf(value: Uint8Array, needle: Uint8Array): number {
  for (let start = 0; start <= value.length - needle.length; start += 1) {
    if (needle.every((byte, index) => value[start + index] === byte)) return start;
  }
  return -1;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function captureInjectedFault(
  promise: Promise<unknown>,
): Promise<{ token: string; name: string } | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof DurableWriteFault || error instanceof DurableQuotaFault) {
      return { token: error.token, name: error.name };
    }
    throw error;
  }
}

async function isRejected(promise: Promise<unknown>): Promise<boolean> {
  try {
    await promise;
    return false;
  } catch {
    return true;
  }
}

function matchesExpectedOperation(op: Op, expected: readonly Op[]): boolean {
  return expected.some((candidate) => isDeepStrictEqual(candidate, op));
}

function exactVisibleIds(store: ProjectStore, expected: readonly Op[]): string[] {
  const expectedIds = new Set(expected.map((op) => op.id));
  return visibleEntities(store.state, 'caption')
    .map((record) => record.id)
    .filter((id) => expectedIds.has(id))
    .sort();
}

async function runRecoveryScenario(scenario: RecoveryScenario): Promise<RecoveryResult> {
  const fs = new DurableWriteMemoryFS();
  const dir = `projects/g0s-durable-${scenario.scenarioDigit}`;
  await seedEmptyProject(fs, dir);
  const store = await ProjectStore.open(fs, dir, USER);
  const path = `${dir}/ops/${store.actorId}.jsonl`;
  const opP = store.dispatch({
    t: 'create',
    e: 'caption',
    id: fixedCaptionId(scenario.scenarioDigit, 8),
    v: { title: `${scenario.label} durable P` },
  });
  await store.flush();
  const baselineRawText = (await fs.readText(path)) ?? '';
  const pendingDurabilityEvents: Array<Promise<RecoveryResult['durabilityEvents'][number]>> = [];
  const unsubscribeDurability = store.subscribeDurability((status) => {
    const raw = fs.readBytes(path);
    pendingDurabilityEvents.push((async () => ({
      status: { ...status },
      rawBytes: (await raw) ?? new Uint8Array(),
    }))());
  });
  const opA = store.dispatch({
    t: 'create',
    e: 'caption',
    id: fixedCaptionId(scenario.scenarioDigit, 0),
    v: { title: `${scenario.label} A 部分書込み` },
  });
  const effectiveSteps = scenario.steps.map((step) => ({ ...step })) as AppendFaultStep[];
  let utf8SplitInsideScalar = false;
  if (scenario.splitUtf8Scalar === true) {
    const first = effectiveSteps[0];
    if (first?.kind !== 'write-prefix-then-throw') {
      throw new Error('UTF-8 split scenario must start with a prefix-write fault');
    }
    const requested = encoder.encode(serializeOps([opA]));
    const markerStart = byteIndexOf(requested, encoder.encode('部'));
    if (markerStart < 0) throw new Error('UTF-8 split marker is absent from serialized operation');
    const prefixBytes = markerStart + 1;
    effectiveSteps[0] = { ...first, prefixBytes };
    utf8SplitInsideScalar =
      (requested[prefixBytes - 1]! & 0xc0) === 0xc0 &&
      (requested[prefixBytes]! & 0xc0) === 0x80;
  }
  fs.plan(path, ...effectiveSteps);
  const opB = store.dispatch({
    t: 'create',
    e: 'caption',
    id: fixedCaptionId(scenario.scenarioDigit, 1),
    v: { title: `${scenario.label} B` },
  });
  const flushRejected: boolean[] = [];
  const rawSnapshots: Uint8Array[] = [];
  for (let attempt = 0; attempt < scenario.flushAttempts; attempt += 1) {
    flushRejected.push(await isRejected(store.flush()));
    rawSnapshots.push((await fs.readBytes(path)) ?? new Uint8Array());
  }
  unsubscribeDurability();

  const rawText = (await fs.readText(path)) ?? '';
  const parsed = parseOpsJsonl(rawText);
  const reopened = await ProjectStore.open(fs, dir, USER);
  const expectedOps: [Op, Op, Op] = [opP, opA, opB];
  return {
    path,
    expectedOps,
    baselineRawText,
    flushRejected,
    rawSnapshots,
    observedFaultTokens: fs.events
      .filter((event) => event.path === path && event.token !== null)
      .map((event) => event.token!),
    rawText,
    rawOps: parsed.ops,
    parseErrorCount: parsed.errors.length,
    reopenLoadErrorCount: reopened.loadErrors.length,
    visibleIds: exactVisibleIds(reopened, expectedOps),
    firstEvent: fs.events.find(
      (event) => event.path === path && event.token === scenario.steps[0]!.token,
    ),
    activeLogPaths: (await fs.list(`${dir}/ops/`)).filter((candidate) => {
      const relative = candidate.slice(`${dir}/ops/`.length);
      return relative.endsWith('.jsonl') && !relative.includes('/');
    }),
    reopenedOps: [...reopened.allOps],
    reopenedVector: reopened.vector,
    reopenedState: reopened.state,
    reopenedManifest: reopened.manifest,
    durabilityEvents: await Promise.all(pendingDurabilityEvents),
    utf8SplitInsideScalar,
  };
}

function eventualFlushResolved(result: RecoveryResult): boolean {
  return result.flushRejected.at(-1) === false;
}

function rawTextIsSafe(
  rawText: string,
  expectedOps: readonly [Op, Op, Op],
  kind: RecoveryScenario['kind'],
): boolean {
  const parsed = parseOpsJsonl(rawText);
  if (parsed.errors.length !== 0) return false;
  return operationCandidates(expectedOps, kind).some((candidate) =>
    isDeepStrictEqual(parsed.ops, candidate));
}

function operationCandidates(
  expectedOps: readonly [Op, Op, Op],
  kind: RecoveryScenario['kind'],
): Op[][] {
  const [opP, opA, opB] = expectedOps;
  const candidates = [[opP, opA, opB]];
  if (kind === 'commit') candidates.push([opP, opA, opA, opB]);
  return candidates;
}

function serializedCandidates(result: RecoveryResult, scenario: RecoveryScenario): Uint8Array[] {
  return operationCandidates(result.expectedOps, scenario.kind)
    .map((candidate) => encoder.encode(serializeOps(candidate)));
}

function rawRecoveryIsSafe(result: RecoveryResult, scenario: RecoveryScenario): boolean {
  return rawTextIsSafe(result.rawText, result.expectedOps, scenario.kind);
}

function resolvedFlushCheckpointsAreSafe(
  result: RecoveryResult,
  scenario: RecoveryScenario,
): boolean {
  const candidates = serializedCandidates(result, scenario);
  return result.flushRejected.every((rejected, index) => {
    const snapshot = result.rawSnapshots[index] ?? new Uint8Array();
    if (!rejected) return rawTextIsSafe(decoder.decode(snapshot), result.expectedOps, scenario.kind);
    return candidates.some((candidate) => bytesStartWith(candidate, snapshot));
  });
}

function reopenedStateIsSafe(result: RecoveryResult, scenario: RecoveryScenario): boolean {
  return reopenedAuthorityIsCandidate(
    result.path,
    result.reopenLoadErrorCount,
    result.activeLogPaths,
    result.reopenedManifest,
    result.reopenedOps,
    result.reopenedVector,
    result.reopenedState,
    operationCandidates(result.expectedOps, scenario.kind),
  );
}

function reopenedAuthorityIsCandidate(
  path: string,
  loadErrorCount: number,
  activeLogPaths: readonly string[],
  manifest: ProjectStore['manifest'],
  ops: readonly Op[],
  vector: Record<string, number>,
  state: ProjectState,
  candidates: readonly (readonly Op[])[],
): boolean {
  if (
    loadErrorCount !== 0 ||
    !isDeepStrictEqual(activeLogPaths, [path]) ||
    !isDeepStrictEqual(manifest, JSON.parse(MANIFEST))
  ) {
    return false;
  }
  return candidates.some((candidate) =>
    isDeepStrictEqual(ops, candidate) &&
    isDeepStrictEqual(vector, versionVector(candidate)) &&
    isDeepStrictEqual(state, reduce(candidate)));
}

describe.sequential('DurableWriteMemoryFS controls', () => {
  it('models every append failure stage at deterministic byte boundaries', async () => {
    const fs = new DurableWriteMemoryFS();
    const path = 'projects/helper/ops/a_000000000000D.jsonl';
    fs.plan(
      path,
      { kind: 'throw-before', token: 'before' },
      { kind: 'write-prefix-then-throw', token: 'partial', prefixBytes: 4 },
      { kind: 'commit-then-throw', token: 'committed' },
      { kind: 'pass', token: 'healthy' },
    );
    expect(await captureInjectedFault(fs.appendText(path, 'first\n'))).toEqual({
      token: 'before', name: 'DurableWriteFault',
    });
    expect(await fs.readText(path)).toBeNull();
    expect(await captureInjectedFault(fs.appendText(path, 'prefix\n'))).toEqual({
      token: 'partial', name: 'DurableWriteFault',
    });
    expect(await fs.readText(path)).toBe('pref');
    expect(await captureInjectedFault(fs.appendText(path, 'committed\n'))).toEqual({
      token: 'committed', name: 'DurableWriteFault',
    });
    expect(await captureInjectedFault(fs.appendText(path, 'healthy\n'))).toBeNull();
    expect(await fs.readText(path)).toBe('prefcommitted\nhealthy\n');
    expect(fs.events.map((event) => event.outcome)).toEqual([
      'throw-before',
      'write-prefix-then-throw',
      'commit-then-throw',
      'pass',
    ]);
    expect(fs.events.map((event) => event.index)).toEqual([1, 2, 3, 4]);
    expect(fs.remainingSteps(path)).toHaveLength(0);
  });

  it('keeps a persistent failure active until explicitly released', async () => {
    const fs = new DurableWriteMemoryFS();
    const path = 'projects/helper/ops/a_000000000000P.jsonl';
    fs.failPersistently(path, 'persistent');
    expect(await captureInjectedFault(fs.appendText(path, 'blocked\n'))).toEqual({
      token: 'persistent', name: 'DurableWriteFault',
    });
    expect(await fs.readText(path)).toBeNull();
    fs.releasePersistent(path);
    expect(await captureInjectedFault(fs.appendText(path, 'durable\n'))).toBeNull();
    expect(await fs.readText(path)).toBe('durable\n');
    expect(fs.events.map((event) => event.outcome)).toEqual([
      'persistent-throw-before',
      'unplanned-pass',
    ]);
  });

  it('applies the same fault plan to replacement writes used by safe repair strategies', async () => {
    const fs = new DurableWriteMemoryFS();
    const path = 'projects/helper/ops/a_000000000000R.jsonl';
    fs.plan(
      path,
      { kind: 'throw-before', token: 'text-replacement' },
      { kind: 'write-prefix-then-throw', token: 'byte-replacement', prefixBytes: 3 },
      { kind: 'pass', token: 'repaired' },
    );
    expect(await captureInjectedFault(fs.writeText(path, 'blocked'))).toEqual({
      token: 'text-replacement', name: 'DurableWriteFault',
    });
    expect(await captureInjectedFault(fs.writeBytes(path, encoder.encode('binary')))).toEqual({
      token: 'byte-replacement', name: 'DurableWriteFault',
    });
    expect(await fs.readText(path)).toBe('bin');
    expect(await captureInjectedFault(fs.writeText(path, 'repaired'))).toBeNull();
    expect(await fs.readText(path)).toBe('repaired');
    expect(fs.events.map((event) => event.method)).toEqual([
      'writeText',
      'writeBytes',
      'writeText',
    ]);
  });
});

describe.sequential('G0S-WRITE healthy and idempotent controls', () => {
  it('persists healthy A/B/C writes in exact FIFO order', async () => {
    const fs = new DurableWriteMemoryFS();
    const dir = 'projects/g0s-durable-healthy';
    await seedEmptyProject(fs, dir);
    const store = await ProjectStore.open(fs, dir, USER);
    const ops = [0, 1, 2].map((item) => store.dispatch({
      t: 'create',
      e: 'caption',
      id: fixedCaptionId(4, item),
      v: { title: `healthy ${item}` },
    }));
    await store.flush();
    const path = `${dir}/ops/${store.actorId}.jsonl`;
    expect(await fs.readText(path)).toBe(serializeOps(ops));
    const reopened = await ProjectStore.open(fs, dir, USER);
    expect(reopened.loadErrors).toHaveLength(0);
    expect(exactVisibleIds(reopened, ops)).toEqual(ops.map((op) => op.id).sort());
  });

  it('treats a byte-identical physical operation duplicate as one logical change', async () => {
    const fs = new DurableWriteMemoryFS();
    const dir = 'projects/g0s-durable-duplicate';
    await seedEmptyProject(fs, dir);
    const store = await ProjectStore.open(fs, dir, USER);
    const opA = store.dispatch({
      t: 'create', e: 'caption', id: fixedCaptionId(5, 0), v: { title: 'duplicate A' },
    });
    await store.flush();
    const path = `${dir}/ops/${store.actorId}.jsonl`;
    await fs.appendText(path, serializeOps([opA]));
    const refreshed = await ProjectStore.open(fs, dir, USER);
    expect(refreshed.actorId).not.toBe(store.actorId);
    const opB = refreshed.dispatch({
      t: 'create', e: 'caption', id: fixedCaptionId(5, 1), v: { title: 'after duplicate B' },
    });
    await refreshed.flush();
    const refreshedPath = `${dir}/ops/${refreshed.actorId}.jsonl`;
    const oldParsed = parseOpsJsonl((await fs.readText(path))!);
    const newParsed = parseOpsJsonl((await fs.readText(refreshedPath))!);
    expect(oldParsed.errors).toHaveLength(0);
    expect(newParsed.errors).toHaveLength(0);
    expect(oldParsed.ops).toEqual([opA, opA]);
    expect(newParsed.ops).toEqual([opB]);
    expect((await fs.list(`${dir}/ops/`)).sort()).toEqual([path, refreshedPath].sort());
    const reopened = await ProjectStore.open(fs, dir, USER);
    const expectedPhysicalOps = [opA, opA, opB].sort((left, right) =>
      `${left.actor}#${left.op}`.localeCompare(`${right.actor}#${right.op}`));
    const reopenedPhysicalOps = [...reopened.allOps].sort((left, right) =>
      `${left.actor}#${left.op}`.localeCompare(`${right.actor}#${right.op}`));
    expect(reopened.loadErrors).toHaveLength(0);
    expect(reopenedPhysicalOps).toEqual(expectedPhysicalOps);
    expect(reopened.vector).toEqual(versionVector(expectedPhysicalOps));
    expect(reopened.state).toEqual(reduce(expectedPhysicalOps));
    expect(exactVisibleIds(reopened, [opA, opB])).toEqual([opA.id, opB.id].sort());
  });

  it('does not acknowledge an append that resolves after storing only a byte prefix', async () => {
    const fs = new DurableWriteMemoryFS();
    const dir = 'projects/g0s-durable-resolved-prefix';
    await seedEmptyProject(fs, dir);
    const store = await ProjectStore.open(fs, dir, USER);
    const path = `${dir}/ops/${store.actorId}.jsonl`;
    fs.plan(
      path,
      { kind: 'write-prefix-then-resolve', token: 'resolved-prefix', prefixBytes: 7 },
      { kind: 'pass', token: 'resolved-prefix-repair' },
    );
    const op = store.dispatch({
      t: 'create', e: 'caption', id: fixedCaptionId(5, 2), v: { title: 'resolved prefix' },
    });
    const expected = encoder.encode(serializeOps([op]));

    const firstRejected = await isRejected(store.flush());
    const firstBytes = await fs.readBytes(path);
    const firstStatus = store.durabilityStatus;
    const retryRejected = await isRejected(store.flush());
    const durable = await fs.readBytes(path);
    const reopened = await ProjectStore.open(fs, dir, USER);

    expect(firstBytes).not.toBeNull();
    if (firstRejected) {
      expect(firstStatus).toEqual({ phase: 'failed', pending: 1, retryable: true });
      expect(firstBytes!.length).toBeLessThan(expected.length);
      expect(bytesStartWith(expected, firstBytes!)).toBe(true);
    } else {
      expect(firstStatus).toEqual({ phase: 'durable', pending: 0, retryable: false });
      expect(bytesEqual(firstBytes!, expected)).toBe(true);
    }
    expect(retryRejected).toBe(false);
    expect(bytesEqual(durable ?? new Uint8Array(), expected)).toBe(true);
    expect(fs.events.some((event) => event.outcome === 'write-prefix-then-resolve')).toBe(true);
    expect(reopened.loadErrors).toHaveLength(0);
    expect(reopened.allOps).toEqual([op]);
  });
});

const RECOVERY_SCENARIOS: RecoveryScenario[] = [
  {
    label: 'transient throw-before',
    scenarioDigit: 6,
    steps: [
      { kind: 'throw-before', token: 'transient-1' },
      { kind: 'pass', token: 'retry-A' },
      { kind: 'pass', token: 'then-B' },
    ],
    flushAttempts: 2,
    firstErrorName: 'DurableWriteFault',
    kind: 'exact',
  },
  {
    label: 'partial write',
    scenarioDigit: 7,
    steps: [
      { kind: 'write-prefix-then-throw', token: 'partial-1', prefixBytes: 8 },
      { kind: 'pass', token: 'repair-A' },
      { kind: 'pass', token: 'then-B' },
    ],
    flushAttempts: 2,
    firstErrorName: 'DurableWriteFault',
    kind: 'exact',
    splitUtf8Scalar: true,
  },
  {
    label: 'repeated quota',
    scenarioDigit: 1,
    steps: [
      { kind: 'throw-before', token: 'quota-1', errorName: 'QuotaExceededError' },
      { kind: 'throw-before', token: 'quota-2', errorName: 'QuotaExceededError' },
      { kind: 'pass', token: 'retry-A' },
      { kind: 'pass', token: 'then-B' },
    ],
    flushAttempts: 3,
    firstErrorName: 'QuotaExceededError',
    kind: 'exact',
    requiredFaultTokens: ['quota-1', 'quota-2'],
  },
  {
    label: 'commit then throw',
    scenarioDigit: 2,
    steps: [
      { kind: 'commit-then-throw', token: 'committed-A' },
      { kind: 'pass', token: 'retry-or-B' },
      { kind: 'pass', token: 'then-B' },
    ],
    flushAttempts: 2,
    firstErrorName: 'DurableWriteFault',
    kind: 'commit',
  },
];

for (const scenario of RECOVERY_SCENARIOS) {
  describe.sequential(`G0S-WRITE recovery: ${scenario.label}`, () => {
    let result: RecoveryResult;
    let flushRecovered: boolean;
    let rawSafe: boolean;
    let reopenedSafe: boolean;
    let resolvedCheckpointsSafe: boolean;

    beforeAll(async () => {
      result = await runRecoveryScenario(scenario);
      flushRecovered = eventualFlushResolved(result);
      rawSafe = rawRecoveryIsSafe(result, scenario);
      reopenedSafe = reopenedStateIsSafe(result, scenario);
      resolvedCheckpointsSafe = resolvedFlushCheckpointsAreSafe(result, scenario);
    });

    it('reaches the intended fault and keeps diagnostics/reopen outside the xfail', () => {
      expect(result.baselineRawText).toBe(serializeOps([result.expectedOps[0]]));
      expect(result.firstEvent?.token).toBe(scenario.steps[0]!.token);
      expect(result.firstEvent?.outcome).toBe(scenario.steps[0]!.kind);
      expect(result.firstEvent?.errorName).toBe(scenario.firstErrorName);
      expect(result.reopenLoadErrorCount).toBe(result.parseErrorCount);
      expect(result.rawOps.every((op) => matchesExpectedOperation(op, result.expectedOps))).toBe(true);
      expect(result.rawSnapshots).toHaveLength(scenario.flushAttempts);
      expect(
        result.rawSnapshots.every((snapshot) =>
          bytesStartWith(snapshot, encoder.encode(result.baselineRawText))),
      ).toBe(true);
      if (scenario.splitUtf8Scalar === true) expect(result.utf8SplitInsideScalar).toBe(true);
      expect(resolvedCheckpointsSafe).toBe(true);
    });

    if (scenario.requiredFaultTokens !== undefined) {
      it('retries through every planned quota failure before reporting recovery', () => {
        expect(
          scenario.requiredFaultTokens!.every((token) => result.observedFaultTokens.includes(token)),
        ).toBe(true);
      });
    }

    it('eventually resolves a recovery request after retryable failures', () => {
      expect(flushRecovered).toBe(true);
    });

    it('makes exactly A then B durable without skipping or reordering the failed head', () => {
      expect(rawSafe).toBe(true);
    });

    it('reopens without parse errors and exposes the exact A/B state', () => {
      expect(reopenedSafe).toBe(true);
    });
  });
}

describe.sequential('G0S-WRITE persistent failure and package barrier', () => {
  let packageGenerationBlocked: boolean;
  let recoveryRequestResolved: boolean;
  let rawRecoverySafe: boolean;
  let reopenedRecoverySafe: boolean;
  let firstFaultReached: boolean;
  let subsequentWriteQueuedAfterFailure: boolean;
  let laterWriteDidNotOvertake: boolean;
  let resolvedRecoveryCheckpointSafe: boolean;

  beforeAll(async () => {
    const fs = new DurableWriteMemoryFS();
    const dir = 'projects/g0s-durable-persistent';
    await seedEmptyProject(fs, dir);
    const store = await ProjectStore.open(fs, dir, USER);
    const path = `${dir}/ops/${store.actorId}.jsonl`;
    const opP = store.dispatch({
      t: 'create', e: 'caption', id: fixedCaptionId(3, 8), v: { title: 'persistent durable P' },
    });
    await store.flush();
    const baselineRawText = (await fs.readText(path)) ?? '';
    if (baselineRawText !== serializeOps([opP])) {
      throw new Error('persistent scenario failed to establish its durable baseline');
    }
    fs.failPersistently(path, 'permanent');
    const opA = store.dispatch({
      t: 'create', e: 'caption', id: fixedCaptionId(3, 0), v: { title: 'persistent A' },
    });
    const firstFlushRejected = await isRejected(store.flush());
    const opB = store.dispatch({
      t: 'create', e: 'caption', id: fixedCaptionId(3, 1), v: { title: 'persistent B' },
    });
    subsequentWriteQueuedAfterFailure = store.allOps.some((op) => isDeepStrictEqual(op, opB));
    const fullRejected = await isRejected(exportProjectZip(fs, dir, store));
    const diffRejected = await isRejected(exportOpsOnlyZip(fs, dir, store));
    packageGenerationBlocked = fullRejected && diffRejected;
    firstFaultReached = fs.events.some(
      (event) => event.token === 'permanent' && event.outcome === 'persistent-throw-before',
    );
    const rawBeforeRelease = (await fs.readText(path)) ?? '';
    laterWriteDidNotOvertake =
      firstFlushRejected &&
      rawBeforeRelease === baselineRawText;

    fs.releasePersistent(path);
    const recoveryRejected = await isRejected(store.flush());
    const rawText = (await fs.readText(path)) ?? '';
    const parsed = parseOpsJsonl(rawText);
    const reopened = await ProjectStore.open(fs, dir, USER);
    const activeLogPaths = (await fs.list(`${dir}/ops/`)).filter((candidate) => {
      const relative = candidate.slice(`${dir}/ops/`.length);
      return relative.endsWith('.jsonl') && !relative.includes('/');
    });
    recoveryRequestResolved = !recoveryRejected;
    rawRecoverySafe =
      parsed.errors.length === 0 &&
      isDeepStrictEqual(parsed.ops, [opP, opA, opB]);
    resolvedRecoveryCheckpointSafe = recoveryRejected || rawRecoverySafe;
    reopenedRecoverySafe = reopenedAuthorityIsCandidate(
      path,
      reopened.loadErrors.length,
      activeLogPaths,
      reopened.manifest,
      reopened.allOps,
      reopened.vector,
      reopened.state,
      [[opP, opA, opB]],
    );
  });

  it('blocks both full and diff package bytes while the queue remains failed', () => {
    expect(firstFaultReached).toBe(true);
    expect(subsequentWriteQueuedAfterFailure).toBe(true);
    expect(laterWriteDidNotOvertake).toBe(true);
    expect(packageGenerationBlocked).toBe(true);
    expect(resolvedRecoveryCheckpointSafe).toBe(true);
  });

  it('allows a recovery request to resolve after a persistent failure is released', () => {
    expect(recoveryRequestResolved).toBe(true);
  });

  it('makes the failed head and later write durable in exact FIFO order after release', () => {
    expect(rawRecoverySafe).toBe(true);
  });

  it('reopens with the exact recovered state after persistent failure', () => {
    expect(reopenedRecoverySafe).toBe(true);
  });

});

describe.sequential('G0S-WRITE status and package checkpoints', () => {
  it('publishes queued before memory visibility, then writing/failed/retryable/recovered durable', async () => {
    const fs = new DurableWriteMemoryFS();
    const dir = 'projects/g0s-durable-status';
    await seedEmptyProject(fs, dir);
    const store = await ProjectStore.open(fs, dir, USER);
    const path = `${dir}/ops/${store.actorId}.jsonl`;
    fs.failPersistently(path, 'status-failure');

    const timeline: string[] = [];
    const pendingSnapshots: Array<Promise<{
      status: DurableWriteStatus;
      bytes: Uint8Array;
      manifest: ProjectStore['manifest'];
      ops: Op[];
      vector: Record<string, number>;
      state: ProjectState;
      activeLogPaths: string[];
    }>> = [];
    const offDurability = store.subscribeDurability((status) => {
      timeline.push(`durability:${status.phase}`);
      const bytes = fs.readBytes(path);
      const activeLogPaths = fs.list(`${dir}/ops/`).then((paths) => paths.filter((candidate) => {
        const relative = candidate.slice(`${dir}/ops/`.length);
        return relative.endsWith('.jsonl') && !relative.includes('/');
      }));
      const manifest = cloneValue(store.manifest);
      const ops = cloneValue([...store.allOps]);
      const vector = cloneValue(store.vector);
      const state = cloneValue(store.state);
      pendingSnapshots.push((async () => ({
        status: { ...status },
        bytes: (await bytes) ?? new Uint8Array(),
        manifest,
        ops,
        vector,
        state,
        activeLogPaths: await activeLogPaths,
      }))());
    });
    const offState = store.subscribe(() => timeline.push('state'));
    const op = store.dispatch({
      t: 'create', e: 'caption', id: fixedCaptionId(9, 0), v: { title: 'status transition' },
    });
    const firstRejected = await isRejected(store.flush());
    const failed = store.durabilityStatus;
    fs.releasePersistent(path);
    const retryRejected = await isRejected(store.flush());
    const durable = store.durabilityStatus;
    offState();
    offDurability();
    const snapshots = await Promise.all(pendingSnapshots);
    const phases = snapshots.map((snapshot) => snapshot.status.phase);
    const desired = encoder.encode(serializeOps([op]));
    const statusAuthoritySafe = snapshots.every((snapshot) =>
      isDeepStrictEqual(snapshot.manifest, JSON.parse(MANIFEST)) &&
      isDeepStrictEqual(snapshot.ops, [op]) &&
      isDeepStrictEqual(snapshot.vector, versionVector([op])) &&
      isDeepStrictEqual(snapshot.state, reduce([op])) &&
      (isDeepStrictEqual(snapshot.activeLogPaths, []) ||
        isDeepStrictEqual(snapshot.activeLogPaths, [path])) &&
      (snapshot.status.phase === 'durable'
        ? isDeepStrictEqual(snapshot.activeLogPaths, [path]) && bytesEqual(snapshot.bytes, desired)
        : bytesStartWith(desired, snapshot.bytes)));
    const faultObserved = fs.events.some(
      (event) => event.token === 'status-failure' && event.outcome === 'persistent-throw-before',
    );

    expect(Object.isFrozen(failed)).toBe(true);
    expect(firstRejected).toBe(true);
    expect(failed).toEqual({ phase: 'failed', pending: 1, retryable: true });
    expect(retryRejected).toBe(false);
    expect(durable).toEqual({ phase: 'durable', pending: 0, retryable: false });
    expect(timeline.indexOf('durability:queued')).toBeLessThan(timeline.indexOf('state'));
    expect(phases).toEqual(expect.arrayContaining(['queued', 'writing', 'failed', 'durable']));
    expect(phases.indexOf('failed')).toBeLessThan(phases.lastIndexOf('writing'));
    expect(faultObserved).toBe(true);
    expect(statusAuthoritySafe).toBe(true);
  });

  it('keeps session/device durability, package generation and download start as separate claims', async () => {
    const durableStatus: DurableWriteStatus = Object.freeze({
      phase: 'durable', pending: 0, retryable: false,
    });
    const failedStatus: DurableWriteStatus = Object.freeze({
      phase: 'failed', pending: 2, retryable: true,
    });
    const idle: PackageExportStatus = Object.freeze({ phase: 'idle' });
    const persistent = describeSaveStatus(durableStatus, 2, true, idle);
    const ephemeral = describeSaveStatus(durableStatus, 2, false, idle);
    const failed = describeSaveStatus(failedStatus, 2, true, idle);
    const viewAccess = describeProjectAccess('view', 'read-only', 'deliberate view');
    const editableAccess = describeProjectAccess('edit', 'editable', 'write lock held');
    const readOnlyAccess = describeProjectAccess('edit', 'read-only', 'other Edit tab');
    const lostAccess = describeProjectAccess('edit', 'lock-lost', 'lock ended');

    expect(persistent.detailText).toContain('ワークスペースへの書き込み完了');
    expect(persistent.detailText).toContain('未ダウンロードの変更 2件');
    expect(ephemeral.detailText).toContain('このタブ内に一時保持（端末未保存）');
    expect(ephemeral.compactText).not.toContain('✓');
    expect(failed.detailText).toContain('保存に失敗');
    expect(failed.detailText).not.toContain('書き込み完了');
    expect(failed.canRetry).toBe(true);
    expect(viewAccess).toMatchObject({
      compactText: '従来形式・閲覧専用',
      canRetry: false,
      actionLabel: null,
    });
    expect(editableAccess).toMatchObject({ compactText: 'Edit mode（書込み可能）', canRetry: false });
    expect(readOnlyAccess).toMatchObject({
      compactText: 'Edit mode（書込みロック待ち・読み取り専用）',
      canRetry: true,
      actionLabel: '書込みロックを再試行',
    });
    expect(lostAccess.compactText).toBe('Edit mode（ロック喪失・読み取り専用）');
    expect(lostAccess.detailText).toContain('新規書込みは停止');
    for (const phase of ['queued', 'writing'] as const) {
      const presentation = describeSaveStatus(
        { phase, pending: 1, retryable: false }, 2, false, idle,
      );
      expect(presentation.detailText).toContain('このタブ内');
      expect(presentation.detailText).not.toContain('端末ワークスペース');
    }

    const statuses: PackageExportStatus[] = [];
    const started: Uint8Array[] = [];
    const bytes = new Uint8Array([7, 8, 9]);
    await generateAndStartPackageDownload(
      'full',
      4,
      async () => bytes,
      (value) => started.push(new Uint8Array(value)),
      (status) => statuses.push(status),
    );
    expect(statuses.map((status) => status.phase)).toEqual([
      'generating', 'generated', 'download-started',
    ]);
    expect(started).toEqual([bytes]);
    expect(statuses[2]).toMatchObject({ coveredOpCount: 4 });
    expect(describeSaveStatus(durableStatus, 0, true, statuses[2]!).detailText)
      .toContain('ダウンロード開始（完了未確認）');

    const failedStatuses: PackageExportStatus[] = [];
    const generationRejected = await isRejected(generateAndStartPackageDownload(
      'diff',
      5,
      async () => { throw new Error('generation failed'); },
      () => { throw new Error('download must not start'); },
      (status) => failedStatuses.push(status),
    ));
    expect(generationRejected).toBe(true);
    expect(failedStatuses.map((status) => status.phase)).toEqual(['generating', 'failed']);

    const startStatuses: PackageExportStatus[] = [];
    const startRejected = await isRejected(generateAndStartPackageDownload(
      'full',
      6,
      async () => bytes,
      () => { throw new Error('download start failed'); },
      (status) => startStatuses.push(status),
    ));
    expect(startRejected).toBe(true);
    expect(startStatuses.map((status) => status.phase)).toEqual(['generating', 'generated']);
    const previousDownload: PackageExportStatus = Object.freeze({
      phase: 'download-started', kind: 'full', bytes: 3, coveredOpCount: 1,
    });
    const failedAfterDownload = describeSaveStatus(failedStatus, 2, true, previousDownload);
    expect(failedAfterDownload.detailText).toContain('保存に失敗');
    expect(failedAfterDownload.detailText).toContain('ダウンロード開始（完了未確認）');
  });
});
