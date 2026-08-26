import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseOpsJsonl } from '../../src/core/jsonl';
import { opKey, visibleEntities } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type DurableWriteStatus, type Identity } from '../../src/core/store';
import { MemoryFS, ProjectMutationDeniedError, type WorkspaceFS } from '../../src/platform/fs';
import { ProjectMutationCoordinator } from '../../src/platform/projectLock';
import { InterleavingAppendMemoryFS } from '../helpers/interleavingFs';

const USER_A: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000010',
  deviceId: 'dev_00000000000000000000000010',
  displayName: 'G0S tab A',
});
const USER_B: Readonly<Identity> = Object.freeze({ ...USER_A });
const MANIFEST = JSON.stringify({
  format: 'lociview-project',
  schemaVersion: 1,
  projectId: 'prj_00000000000000000000000010',
  name: 'G0S multi-tab characterization',
  createdAt: '2026-08-21T00:00:00.000Z',
  generator: 'G0S test fixture',
});
const EXTERNAL_ACTOR = 'a_000000000000E';
const EXTERNAL_USER = 'usr_00000000000000000000000020';

interface ParsedLogs {
  files: string[];
  ops: Op[];
  parseErrorCount: number;
  fileActorMatches: boolean;
}

async function seedEmptyProject(fs: WorkspaceFS, dir: string): Promise<void> {
  await fs.writeText(`${dir}/lociview.json`, MANIFEST);
}

async function readLogs(fs: WorkspaceFS, dir: string): Promise<ParsedLogs> {
  const files = (await fs.list(`${dir}/ops/`)).filter((path) => path.endsWith('.jsonl'));
  const ops: Op[] = [];
  let parseErrorCount = 0;
  let fileActorMatches = true;
  for (const file of files) {
    const text = await fs.readText(file);
    if (text === null) throw new Error(`missing operation log after list: ${file}`);
    const parsed = parseOpsJsonl(text);
    parseErrorCount += parsed.errors.length;
    const fileActor = file.slice(file.lastIndexOf('/') + 1, -'.jsonl'.length);
    if (parsed.ops.some((op) => op.actor !== fileActor)) fileActorMatches = false;
    ops.push(...parsed.ops);
  }
  return { files, ops, parseErrorCount, fileActorMatches };
}

function captionId(scenarioDigit: number, lane: number, index: number): string {
  const suffix = `${scenarioDigit}${lane}${index.toString().padStart(24, '0')}`;
  if (suffix.length !== 26) throw new Error(`bad fixed caption suffix: ${suffix}`);
  return `cap_${suffix}`;
}

function shuffledPlan(seed: number): Array<{ lane: 0 | 1; index: number }> {
  const plan: Array<{ lane: 0 | 1; index: number }> = [];
  for (let index = 0; index < 1_000; index += 1) {
    plan.push({ lane: 0, index }, { lane: 1, index });
  }
  let state = seed >>> 0;
  const random = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  for (let i = plan.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [plan[i], plan[j]] = [plan[j]!, plan[i]!];
  }
  return plan;
}

function byId(ops: readonly Op[]): Map<string, Op> {
  return new Map(ops.map((op) => [op.id, op]));
}

function mapsHaveSameOperations(actual: Map<string, Op>, expected: Map<string, Op>): boolean {
  if (actual.size !== expected.size) return false;
  for (const [id, expectedOp] of expected) {
    const actualOp = actual.get(id);
    if (actualOp === undefined || !isDeepStrictEqual(actualOp, expectedOp)) return false;
  }
  return true;
}

function mapIsOperationSubset(actual: Map<string, Op>, expected: Map<string, Op>): boolean {
  for (const [id, actualOp] of actual) {
    const expectedOp = expected.get(id);
    if (expectedOp === undefined || !isDeepStrictEqual(actualOp, expectedOp)) return false;
  }
  return true;
}

function flushDispositionIsTruthful(
  outcome: PromiseSettledResult<void>,
  status: DurableWriteStatus,
  laneOps: readonly Op[],
  rawOps: ReadonlyMap<string, Op>,
  reopenedOps: ReadonlyMap<string, Op>,
): boolean {
  if (outcome.status === 'rejected') {
    return status.phase === 'failed' && status.pending > 0;
  }
  return status.phase === 'durable' &&
    status.pending === 0 &&
    laneOps.every((expected) =>
      isDeepStrictEqual(rawOps.get(expected.id), expected) &&
      isDeepStrictEqual(reopenedOps.get(expected.id), expected));
}

describe.sequential('G0S-TAB actor instance characterization', () => {
  let actorIds: [string, string];
  let operationMetadataIsConsistent: boolean;
  let rawIds: string[];
  let loadErrorCount: number;
  let durableAuthorityIsTruthful: boolean;

  beforeAll(async () => {
    const fs = new MemoryFS();
    const dir = 'projects/g0s-actor';
    await seedEmptyProject(fs, dir);
    const [tabA, tabB] = await Promise.all([
      ProjectStore.open(fs, dir, USER_A),
      ProjectStore.open(fs, dir, USER_B),
    ]);
    actorIds = [tabA.actorId, tabB.actorId];
    const opA = tabA.dispatch({
      t: 'create', e: 'caption', id: captionId(0, 0, 1), v: { title: 'actor A' },
    });
    const opB = tabB.dispatch({
      t: 'create', e: 'caption', id: captionId(0, 1, 1), v: { title: 'actor B' },
    });
    const flushOutcomes = await Promise.allSettled([tabA.flush(), tabB.flush()]);
    const logs = await readLogs(fs, dir);
    rawIds = logs.ops.map((op) => op.id).sort();
    operationMetadataIsConsistent =
      tabA.actorId === actorIds[0] &&
      tabB.actorId === actorIds[1] &&
      actorIds.every((actor) => /^a_[0-9A-HJKMNP-TV-Z]{13}$/u.test(actor)) &&
      opA.actor === actorIds[0] &&
      opB.actor === actorIds[1] &&
      opA.hlc.endsWith(`-${actorIds[0]}`) &&
      opB.hlc.endsWith(`-${actorIds[1]}`) &&
      isDeepStrictEqual(
        [...logs.files].sort(),
        actorIds.map((actor) => `${dir}/ops/${actor}.jsonl`).sort(),
      ) &&
      logs.parseErrorCount === 0 &&
      logs.fileActorMatches;
    const reopened = await ProjectStore.open(fs, dir, USER_A);
    loadErrorCount = reopened.loadErrors.length;
    const expectedOps = byId([opA, opB]);
    const rawOps = byId(logs.ops);
    const reopenedOps = byId(reopened.allOps);
    durableAuthorityIsTruthful =
      flushOutcomes.every((outcome) => outcome.status === 'fulfilled') &&
      [tabA, tabB].every(
        (store) => store.durabilityStatus.phase === 'durable' && store.durabilityStatus.pending === 0,
      ) &&
      logs.ops.length === rawOps.size &&
      mapIsOperationSubset(rawOps, expectedOps) &&
      mapsHaveSameOperations(reopenedOps, rawOps) &&
      flushDispositionIsTruthful(
        flushOutcomes[0]!, tabA.durabilityStatus, [opA], rawOps, reopenedOps,
      ) &&
      flushDispositionIsTruthful(
        flushOutcomes[1]!, tabB.durabilityStatus, [opB], rawOps, reopenedOps,
      );
  });

  it('keeps setup, operation metadata, raw lines, and reopenability outside the xfail', () => {
    expect(operationMetadataIsConsistent).toBe(true);
    expect(rawIds.every((id) => [captionId(0, 0, 1), captionId(0, 1, 1)].includes(id))).toBe(true);
    expect(loadErrorCount).toBe(0);
    expect(durableAuthorityIsTruthful).toBe(true);
  });

  it('G0S-TAB: two simultaneous stores for one identity use distinct actor instances', () => {
    expect(new Set(actorIds).size).toBe(2);
  });
});

describe.sequential('InterleavingAppendMemoryFS serialized path', () => {
  let finalText: string | null;
  let eventSummary: { reads: number; writes: number; mode: string | undefined; attempts: number | undefined };

  beforeAll(async () => {
    const fs = new InterleavingAppendMemoryFS();
    const path = 'projects/helper/ops/a_000000000000E.jsonl';
    await fs.writeText(path, 'base\n');
    fs.armAppendRace(path, 2, 5);
    await fs.appendText(path, 'first\n');
    await fs.appendText(path, 'second\n');
    finalText = await fs.readText(path);
    const complete = fs.events.find((event) => event.type === 'complete');
    eventSummary = {
      reads: fs.events.filter((event) => event.type === 'read-attempt').length,
      writes: fs.events.filter((event) => event.type === 'write').length,
      mode: complete?.type === 'complete' ? complete.releaseMode : undefined,
      attempts: complete?.type === 'complete' ? complete.attempts : undefined,
    };
  });

  it('timeout-releases a serialized first writer and lets the second read the updated snapshot', () => {
    expect(finalText).toBe('base\nfirst\nsecond\n');
    expect(eventSummary).toEqual({ reads: 2, writes: 2, mode: 'timeout', attempts: 2 });
  });
});

describe.sequential('G0S-TAB fail-closed ownership loss', () => {
  it('blocks dispatch, merge, and project bytes before memory or durable authority changes', async () => {
    const fs = new MemoryFS();
    const dir = 'projects/g0s-lock-lost';
    await seedEmptyProject(fs, dir);
    const coordinator = ProjectMutationCoordinator.local();
    const access = await coordinator.tryAcquire(fs, dir, 'prj_00000000000000000000000010');
    const store = await ProjectStore.open(access.workspace, dir, USER_A);
    access.activateAfterDurableReload();
    const beforeOps = structuredClone(store.allOps);
    const beforeState = structuredClone(store.state);
    const beforeManifest = await fs.readText(`${dir}/lociview.json`);

    access.failClosed('simulated lock loss');
    expect(() => store.dispatch({
      t: 'create',
      e: 'caption',
      id: captionId(8, 0, 1),
      v: { title: 'must not enter memory' },
    })).toThrow(ProjectMutationDeniedError);
    expect(() => store.mergeExternal([])).toThrow(ProjectMutationDeniedError);
    await expect(access.workspace.writeText(`${dir}/media/forbidden.bin`, 'forbidden'))
      .rejects.toBeInstanceOf(ProjectMutationDeniedError);

    expect(access.accessState).toBe('lock-lost');
    expect(store.allOps).toEqual(beforeOps);
    expect(store.state).toEqual(beforeState);
    expect(await fs.readText(`${dir}/lociview.json`)).toBe(beforeManifest);
    expect(await fs.readBytes(`${dir}/media/forbidden.bin`)).toBeNull();
  });
});

const STRESS_SCENARIOS = [
  { label: 'seed 0x13579bdf', scenarioDigit: 1, seed: 0x13579bdf },
  { label: 'seed 0x2468ace0', scenarioDigit: 2, seed: 0x2468ace0 },
] as const;

for (const scenario of STRESS_SCENARIOS) {
  describe.sequential(`G0S-TAB 2 x 1000 operation stress (${scenario.label})`, () => {
    const expectedIds = new Set<string>();
    let planCounts: [number, number];
    let expectedOps: Map<string, Op>;
    let rawOps: Map<string, Op>;
    let reopenedOps: Map<string, Op>;
    let rawOperationCount: number;
    let reopenedOperationCount: number;
    let rawUniqueKeyCount: number;
    let reopenedUniqueKeyCount: number;
    let visibleIds: string[];
    let parseErrorCount: number;
    let fileActorMatches: boolean;
    let reopenLoadErrorCount: number;
    let flushDispositionsAreTruthful: boolean;
    let bothHealthyLanesAreDurable: boolean;
    let nonOwnerWasFailClosed: boolean;
    let successorReloadedDurableState: boolean;

    beforeAll(async () => {
      const fs = new MemoryFS();
      const dir = `projects/g0s-stress-${scenario.scenarioDigit}`;
      await seedEmptyProject(fs, dir);
      const coordinator = ProjectMutationCoordinator.local();
      const accessA = await coordinator.tryAcquire(fs, dir, 'prj_00000000000000000000000010');
      const accessBReadOnly = await coordinator.tryAcquire(fs, dir, 'prj_00000000000000000000000010');
      const [tabA, tabBReadOnly] = await Promise.all([
        ProjectStore.open(accessA.workspace, dir, USER_A),
        ProjectStore.open(accessBReadOnly.workspace, dir, USER_B),
      ]);
      accessA.activateAfterDurableReload();
      const readOnlyOpCount = tabBReadOnly.allOps.length;
      let readOnlyRejected = false;
      try {
        tabBReadOnly.dispatch({
          t: 'create',
          e: 'caption',
          id: captionId(scenario.scenarioDigit, 1, 9_999),
          v: { title: 'must remain read-only' },
        });
      } catch (error) {
        readOnlyRejected = error instanceof ProjectMutationDeniedError;
      }
      nonOwnerWasFailClosed =
        accessA.accessState === 'editable' &&
        accessBReadOnly.accessState === 'read-only' &&
        readOnlyRejected &&
        tabBReadOnly.allOps.length === readOnlyOpCount;
      const plan = shuffledPlan(scenario.seed);
      planCounts = [
        plan.filter((item) => item.lane === 0).length,
        plan.filter((item) => item.lane === 1).length,
      ];
      const dispatched: Op[] = [];
      const dispatchedByLane: [Op[], Op[]] = [[], []];
      for (const item of plan.filter((entry) => entry.lane === 0)) {
        const id = captionId(scenario.scenarioDigit, item.lane, item.index);
        expectedIds.add(id);
        const op = tabA.dispatch({
          t: 'create',
          e: 'caption',
          id,
          v: { title: `${scenario.label} lane ${item.lane} item ${item.index}` },
        });
        dispatched.push(op);
        dispatchedByLane[0].push(op);
      }
      const firstFlush = await Promise.allSettled([tabA.flush()]);
      accessA.release();
      accessBReadOnly.release();

      const accessB = await coordinator.tryAcquire(fs, dir, 'prj_00000000000000000000000010');
      const tabB = await ProjectStore.open(accessB.workspace, dir, USER_B);
      successorReloadedDurableState = tabB.allOps.length === 1_000 && accessB.accessState === 'read-only';
      accessB.activateAfterDurableReload();
      for (const item of plan.filter((entry) => entry.lane === 1)) {
        const id = captionId(scenario.scenarioDigit, item.lane, item.index);
        expectedIds.add(id);
        const op = tabB.dispatch({
          t: 'create',
          e: 'caption',
          id,
          v: { title: `${scenario.label} lane ${item.lane} item ${item.index}` },
        });
        dispatched.push(op);
        dispatchedByLane[1].push(op);
      }
      const secondFlush = await Promise.allSettled([tabB.flush()]);
      const flushOutcomes = [firstFlush[0]!, secondFlush[0]!] as const;
      accessB.release();
      expectedOps = byId(dispatched);

      const logs = await readLogs(fs, dir);
      const scenarioRaw = logs.ops;
      rawOperationCount = scenarioRaw.length;
      rawOps = byId(scenarioRaw);
      rawUniqueKeyCount = new Set(scenarioRaw.map(opKey)).size;
      parseErrorCount = logs.parseErrorCount;
      fileActorMatches = logs.fileActorMatches;

      const reopened = await ProjectStore.open(fs, dir, USER_A);
      const scenarioReopened = [...reopened.allOps];
      reopenedOperationCount = scenarioReopened.length;
      reopenedOps = byId(scenarioReopened);
      reopenedUniqueKeyCount = new Set(scenarioReopened.map(opKey)).size;
      visibleIds = visibleEntities(reopened.state, 'caption')
        .map((record) => record.id)
        .sort();
      reopenLoadErrorCount = reopened.loadErrors.length;
      flushDispositionsAreTruthful =
        flushDispositionIsTruthful(
          flushOutcomes[0]!, tabA.durabilityStatus, dispatchedByLane[0], rawOps, reopenedOps,
        ) &&
        flushDispositionIsTruthful(
          flushOutcomes[1]!, tabB.durabilityStatus, dispatchedByLane[1], rawOps, reopenedOps,
        );
      bothHealthyLanesAreDurable =
        flushOutcomes.every((outcome) => outcome.status === 'fulfilled') &&
        [tabA, tabB].every(
          (store) => store.durabilityStatus.phase === 'durable' && store.durabilityStatus.pending === 0,
        );
    }, 60_000);

    it('plans exactly 2,000 payloads and keeps any fail-closed durable subset parseable and reopenable', () => {
      expect(planCounts).toEqual([1_000, 1_000]);
      expect(expectedIds.size).toBe(2_000);
      expect(expectedOps.size).toBe(2_000);
      expect(parseErrorCount).toBe(0);
      expect(fileActorMatches).toBe(true);
      expect(rawOps.size).toBe(rawOperationCount);
      expect(mapIsOperationSubset(rawOps, expectedOps)).toBe(true);
      expect(reopenLoadErrorCount).toBe(0);
      expect(reopenedOps.size).toBe(reopenedOperationCount);
      expect(mapsHaveSameOperations(reopenedOps, rawOps)).toBe(true);
      expect(flushDispositionsAreTruthful).toBe(true);
      expect(bothHealthyLanesAreDurable).toBe(true);
      expect(nonOwnerWasFailClosed).toBe(true);
      expect(successorReloadedDurableState).toBe(true);
    });

    it('G0S-TAB: all 2,000 durable raw operations have distinct operation keys', () => {
      expect(rawOperationCount === 2_000 && rawUniqueKeyCount === 2_000).toBe(true);
    });

    it('G0S-TAB: all 2,000 reopened operations have distinct operation keys', () => {
      expect(reopenedOperationCount === 2_000 && reopenedUniqueKeyCount === 2_000).toBe(true);
    });

    it('G0S-TAB: reload reduces to the exact 2,000 visible captions', () => {
      expect(visibleIds).toEqual([...expectedIds].sort());
    });
  });
}

describe.sequential('G0S-TAB shared external actor append race', () => {
  const expectedOps: Op[] = [
    {
      op: 1,
      hlc: `2026-08-21T00:00:01.000Z-0000-${EXTERNAL_ACTOR}`,
      actor: EXTERNAL_ACTOR,
      user: EXTERNAL_USER,
      t: 'create',
      e: 'caption',
      id: captionId(3, 0, 1),
      v: { title: 'external one' },
    },
    {
      op: 2,
      hlc: `2026-08-21T00:00:02.000Z-0000-${EXTERNAL_ACTOR}`,
      actor: EXTERNAL_ACTOR,
      user: EXTERNAL_USER,
      t: 'create',
      e: 'caption',
      id: captionId(3, 1, 2),
      v: { title: 'external two' },
    },
  ];
  let baseHasNoExternalKeys: boolean;
  let reportsCreatedExpectedIds: boolean;
  let eventSummary: { reads: number; writes: number; completes: number; releaseModes: string[] };
  let parseErrorCount: number;
  let durableKeys: string[];
  let reopenedKeys: string[];
  let visibleIds: string[];
  let loadErrorCount: number;
  let flushDispositionsAreTruthful: boolean;
  let nonOwnerMergeRejected: boolean;

  beforeAll(async () => {
    const fs = new InterleavingAppendMemoryFS();
    const dir = 'projects/g0s-shared-append';
    await seedEmptyProject(fs, dir);
    const coordinator = ProjectMutationCoordinator.local();
    const accessA = await coordinator.tryAcquire(fs, dir, 'prj_00000000000000000000000010');
    const accessBReadOnly = await coordinator.tryAcquire(fs, dir, 'prj_00000000000000000000000010');
    const [tabA, tabBReadOnly] = await Promise.all([
      ProjectStore.open(accessA.workspace, dir, USER_A),
      ProjectStore.open(accessBReadOnly.workspace, dir, USER_B),
    ]);
    accessA.activateAfterDurableReload();
    const expectedKeys = expectedOps.map(opKey).sort();
    baseHasNoExternalKeys = !tabA.allOps.some((op) => expectedKeys.includes(opKey(op))) &&
      !tabBReadOnly.allOps.some((op) => expectedKeys.includes(opKey(op)));
    const path = `${dir}/ops/${EXTERNAL_ACTOR}.jsonl`;
    fs.armAppendRace(path, 2, 100);
    const reportA = tabA.mergeExternal([expectedOps[0]!]);
    let readOnlyRejected = false;
    try {
      tabBReadOnly.mergeExternal([expectedOps[1]!]);
    } catch (error) {
      readOnlyRejected = error instanceof ProjectMutationDeniedError;
    }
    const flushA = await Promise.allSettled([tabA.flush()]);
    accessA.release();
    accessBReadOnly.release();
    const accessB = await coordinator.tryAcquire(fs, dir, 'prj_00000000000000000000000010');
    const tabB = await ProjectStore.open(accessB.workspace, dir, USER_B);
    accessB.activateAfterDurableReload();
    const reportB = tabB.mergeExternal([expectedOps[1]!]);
    reportsCreatedExpectedIds =
      reportA.created.some((item) => item.id === expectedOps[0]!.id) &&
      reportB.created.some((item) => item.id === expectedOps[1]!.id);
    const flushB = await Promise.allSettled([tabB.flush()]);
    const flushOutcomes = [flushA[0]!, flushB[0]!] as const;
    nonOwnerMergeRejected = readOnlyRejected && tabBReadOnly.allOps.length === 0;
    accessB.release();

    eventSummary = {
      reads: fs.events.filter((event) => event.type === 'read-attempt').length,
      writes: fs.events.filter((event) => event.type === 'write').length,
      completes: fs.events.filter((event) => event.type === 'complete').length,
      releaseModes: fs.events
        .filter((event) => event.type === 'barrier-release')
        .map((event) => event.type === 'barrier-release' ? event.mode : ''),
    };
    const logs = await readLogs(fs, dir);
    const rawOps = byId(logs.ops);
    parseErrorCount = logs.parseErrorCount;
    durableKeys = logs.ops.filter((op) => op.actor === EXTERNAL_ACTOR).map(opKey).sort();
    const reopened = await ProjectStore.open(fs, dir, USER_A);
    const reopenedOps = byId(reopened.allOps);
    loadErrorCount = reopened.loadErrors.length;
    reopenedKeys = reopened.allOps.filter((op) => op.actor === EXTERNAL_ACTOR).map(opKey).sort();
    visibleIds = visibleEntities(reopened.state, 'caption').map((record) => record.id).sort();
    const expected = byId(expectedOps);
    flushDispositionsAreTruthful =
      logs.ops.length === rawOps.size &&
      mapIsOperationSubset(rawOps, expected) &&
      mapsHaveSameOperations(reopenedOps, rawOps) &&
      flushDispositionIsTruthful(
        flushOutcomes[0]!, tabA.durabilityStatus, [expectedOps[0]!], rawOps, reopenedOps,
      ) &&
      flushDispositionIsTruthful(
        flushOutcomes[1]!, tabB.durabilityStatus, [expectedOps[1]!], rawOps, reopenedOps,
      );
  });

  it('keeps merge setup, append attempts, parsing, and reopenability outside the xfails', () => {
    expect(baseHasNoExternalKeys).toBe(true);
    expect(reportsCreatedExpectedIds).toBe(true);
    expect(eventSummary.reads).toBe(2);
    expect(eventSummary.writes).toBe(2);
    expect(eventSummary.completes).toBe(1);
    expect(eventSummary.releaseModes).toHaveLength(1);
    expect(['concurrent', 'timeout']).toContain(eventSummary.releaseModes[0]);
    expect(parseErrorCount).toBe(0);
    expect(loadErrorCount).toBe(0);
    expect(durableKeys.every((key) => expectedOps.map(opKey).includes(key))).toBe(true);
    expect(flushDispositionsAreTruthful).toBe(true);
    expect(nonOwnerMergeRejected).toBe(true);
  });

  it('G0S-TAB: both shared-actor appends remain durable after ownership transfer', () => {
    expect(durableKeys).toEqual(expectedOps.map(opKey).sort());
  });

  it('G0S-TAB: reopen retains both shared-actor operations', () => {
    expect(reopenedKeys).toEqual(expectedOps.map(opKey).sort());
  });

  it('G0S-TAB: reload exposes both shared-actor captions', () => {
    expect(visibleIds).toEqual(expectedOps.map((op) => op.id).sort());
  });
});
