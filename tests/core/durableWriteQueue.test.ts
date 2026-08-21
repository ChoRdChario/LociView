import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportOpsOnlyZip, exportProjectZip } from '../../src/assets/package';
import { parseOpsJsonl, serializeOps } from '../../src/core/jsonl';
import { visibleEntities } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import type { WorkspaceFS } from '../../src/platform/fs';
import {
  DurableWriteFault,
  DurableWriteMemoryFS,
  DurableQuotaFault,
  type AppendFaultStep,
} from '../helpers/durableWriteFs';

const encoder = new TextEncoder();

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
  rawSnapshots: string[];
  observedFaultTokens: string[];
  rawText: string;
  rawOps: Op[];
  parseErrorCount: number;
  reopenLoadErrorCount: number;
  visibleIds: string[];
  firstEvent: DurableWriteMemoryFS['events'][number] | undefined;
}

interface RecoveryScenario {
  label: string;
  scenarioDigit: number;
  steps: AppendFaultStep[];
  flushAttempts: number;
  firstErrorName: 'DurableWriteFault' | 'QuotaExceededError';
  kind: 'exact' | 'commit';
  requiredFaultTokens?: string[];
}

async function seedEmptyProject(fs: WorkspaceFS, dir: string): Promise<void> {
  await fs.writeText(`${dir}/lociview.json`, MANIFEST);
}

function fixedCaptionId(scenarioDigit: number, itemDigit: number): string {
  return `cap_${scenarioDigit}${itemDigit}${'0'.repeat(24)}`;
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
  fs.plan(path, ...scenario.steps);
  const opA = store.dispatch({
    t: 'create',
    e: 'caption',
    id: fixedCaptionId(scenario.scenarioDigit, 0),
    v: { title: `${scenario.label} A` },
  });
  const opB = store.dispatch({
    t: 'create',
    e: 'caption',
    id: fixedCaptionId(scenario.scenarioDigit, 1),
    v: { title: `${scenario.label} B` },
  });
  const flushRejected: boolean[] = [];
  const rawSnapshots: string[] = [];
  for (let attempt = 0; attempt < scenario.flushAttempts; attempt += 1) {
    flushRejected.push(await isRejected(store.flush()));
    rawSnapshots.push((await fs.readText(path)) ?? '');
  }

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
  const [opP, opA, opB] = expectedOps;
  const parsed = parseOpsJsonl(rawText);
  if (parsed.errors.length !== 0) return false;
  if (kind === 'exact') {
    return (
      rawText === serializeOps([opP, opA, opB]) &&
      isDeepStrictEqual(parsed.ops, [opP, opA, opB])
    );
  }

  const oneA = serializeOps([opP, opA, opB]);
  const duplicateA = serializeOps([opP, opA, opA, opB]);
  return (
    (rawText === oneA && isDeepStrictEqual(parsed.ops, [opP, opA, opB])) ||
    (rawText === duplicateA && isDeepStrictEqual(parsed.ops, [opP, opA, opA, opB]))
  );
}

function rawRecoveryIsSafe(result: RecoveryResult, scenario: RecoveryScenario): boolean {
  return rawTextIsSafe(result.rawText, result.expectedOps, scenario.kind);
}

function resolvedFlushCheckpointsAreSafe(
  result: RecoveryResult,
  scenario: RecoveryScenario,
): boolean {
  return result.flushRejected.every(
    (rejected, index) =>
      rejected || rawTextIsSafe(result.rawSnapshots[index] ?? '', result.expectedOps, scenario.kind),
  );
}

function reopenedStateIsSafe(result: RecoveryResult): boolean {
  const expectedIds = result.expectedOps.map((op) => op.id).sort();
  return result.reopenLoadErrorCount === 0 && isDeepStrictEqual(result.visibleIds, expectedIds);
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
    const opB = store.dispatch({
      t: 'create', e: 'caption', id: fixedCaptionId(5, 1), v: { title: 'after duplicate B' },
    });
    await store.flush();
    const parsed = parseOpsJsonl((await fs.readText(path))!);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.ops).toEqual([opA, opA, opB]);
    const reopened = await ProjectStore.open(fs, dir, USER);
    expect(exactVisibleIds(reopened, [opA, opB])).toEqual([opA.id, opB.id].sort());
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
      reopenedSafe = reopenedStateIsSafe(result);
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
        result.rawSnapshots.every((snapshot) => snapshot.startsWith(result.baselineRawText)),
      ).toBe(true);
      expect(resolvedCheckpointsSafe).toBe(true);
    });

    if (scenario.requiredFaultTokens !== undefined) {
      it.fails('retries through every planned quota failure before reporting recovery', () => {
        expect(
          scenario.requiredFaultTokens!.every((token) => result.observedFaultTokens.includes(token)),
        ).toBe(true);
      });
    }

    it.fails('eventually resolves a recovery request after retryable failures', () => {
      expect(flushRecovered).toBe(true);
    });

    it.fails('makes exactly A then B durable without skipping or reordering the failed head', () => {
      expect(rawSafe).toBe(true);
    });

    it.fails('reopens without parse errors and exposes the exact A/B state', () => {
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
    recoveryRequestResolved = !recoveryRejected;
    rawRecoverySafe =
      parsed.errors.length === 0 &&
      rawText === serializeOps([opP, opA, opB]) &&
      isDeepStrictEqual(parsed.ops, [opP, opA, opB]);
    resolvedRecoveryCheckpointSafe = recoveryRejected || rawRecoverySafe;
    reopenedRecoverySafe =
      reopened.loadErrors.length === 0 &&
      isDeepStrictEqual(
        exactVisibleIds(reopened, [opP, opA, opB]),
        [opP.id, opA.id, opB.id].sort(),
      );
  });

  it('blocks both full and diff package bytes while the queue remains failed', () => {
    expect(firstFaultReached).toBe(true);
    expect(subsequentWriteQueuedAfterFailure).toBe(true);
    expect(laterWriteDidNotOvertake).toBe(true);
    expect(packageGenerationBlocked).toBe(true);
    expect(resolvedRecoveryCheckpointSafe).toBe(true);
  });

  it.fails('allows a recovery request to resolve after a persistent failure is released', () => {
    expect(recoveryRequestResolved).toBe(true);
  });

  it.fails('makes the failed head and later write durable in exact FIFO order after release', () => {
    expect(rawRecoverySafe).toBe(true);
  });

  it.fails('reopens with the exact recovered state after persistent failure', () => {
    expect(reopenedRecoverySafe).toBe(true);
  });

  it.todo('publishes queued/writing/durable/failed plus retryable state so UI never labels failed memory as saved');
  it.todo('separates device durability, package-generated and download-started checkpoints');
});
