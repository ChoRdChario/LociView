import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { inspectZip, mergeFromInspection } from '../../src/assets/package';
import { writeZipEntries } from '../../src/assets/zipio';
import { formatHlc, parseHlc } from '../../src/core/hlc';
import { parseOpsJsonl } from '../../src/core/jsonl';
import { reduce as reduceOps, versionVector, visibleEntities } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type DispatchInput, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import {
  loadOpCorpus,
  type OpCorpusCase,
  type OpCorpusRelation,
  type OpCorpusSubject,
} from '../helpers/g0sOpCorpus';
import {
  objectIntrinsicsMatch,
  restoreObjectIntrinsics,
  snapshotObjectIntrinsics,
} from '../helpers/objectIntrinsics';

const CORPUS = loadOpCorpus();
const USER: Identity = {
  userId: 'usr_00000000000000000000000090',
  deviceId: 'dev_00000000000000000000000090',
  displayName: 'g0s corpus',
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface PublicFileAuthority {
  marker: Uint8Array | null;
  logs: Map<string, number[]>;
}

class RecordingMemoryFS extends MemoryFS {
  readonly publicAuthorityCheckpoints: PublicFileAuthority[] = [];
  private watchedDir: string | null = null;

  beginPublicAuthorityHistory(dir: string): void {
    this.watchedDir = dir;
    this.publicAuthorityCheckpoints.length = 0;
  }

  private async checkpointPublicAuthority(): Promise<void> {
    if (this.watchedDir === null) return;
    this.publicAuthorityCheckpoints.push({
      marker: await this.readBytes(`${this.watchedDir}/lociview.json`),
      logs: await activeLogInventory(this, this.watchedDir),
    });
  }

  override async writeText(path: string, text: string): Promise<void> {
    await super.writeText(path, text);
    await this.checkpointPublicAuthority();
  }

  override async appendText(path: string, text: string): Promise<void> {
    await super.appendText(path, text);
    await this.checkpointPublicAuthority();
  }

  override async appendBytes(path: string, data: Uint8Array): Promise<void> {
    await super.appendBytes(path, data);
    await this.checkpointPublicAuthority();
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    await super.writeBytes(path, data);
    await this.checkpointPublicAuthority();
  }

  override async remove(path: string): Promise<void> {
    await super.remove(path);
    await this.checkpointPublicAuthority();
  }
}

type TestMode = 'pass' | 'xfail';

const OPEN_KNOWN_DEFECTS = new Set([
  'opaque-known-title-control',
  'opaque-duplicate-nested-key',
  'opaque-known-kind-wrong-id-prefix',
  'opaque-noncanonical-user',
  'opaque-known-kind-malformed-ulid',
]);

const INTRINSIC_KNOWN_DEFECTS = new Set<string>();

const OPEN_FAILURE_KNOWN_DEFECTS = new Set<string>();

const DISPATCH_KNOWN_DEFECTS = new Set([
  'opaque-known-title-control',
  'opaque-known-kind-wrong-id-prefix',
  'opaque-known-kind-malformed-ulid',
]);

const STRUCTURAL_CONTROL_CASE_ID = 'valid-unknown-nested-evidence';
const STRUCTURAL_CONTROL_ACTOR = 'a_0ABCDEFGHJKMN';
const FIXED_NOW = Date.UTC(2026, 7, 19, 12, 0, 0, 0);
const NEXT_VALID_INPUT: DispatchInput = {
  t: 'create',
  e: 'caption',
  id: 'cap_00000000000000000000000099',
  v: { title: 'valid after structural rejection' },
};

function withStructuralPositiveControls(fixture: OpCorpusCase): OpCorpusCase {
  if (fixture.id !== STRUCTURAL_CONTROL_CASE_ID) return fixture;
  if (fixture.dispatchInputJson === null) throw new Error('structural positive control needs dispatch input');
  const wire = JSON.parse(fixture.wireJson) as Record<string, unknown>;
  const input = JSON.parse(fixture.dispatchInputJson) as Record<string, unknown>;
  wire.actor = STRUCTURAL_CONTROL_ACTOR;
  wire.hlc = `2026-08-19T00:00:00.000Z-00af-${STRUCTURAL_CONTROL_ACTOR}`;
  const safeNearMisses = {
    __proto: 'safe near-miss key',
    prototypeSafe: 'safe near-miss key',
    constructorSafe: 'safe near-miss key',
    'é': 'NFC key',
    'e\u0300': 'NFD key with a distinct NFC value',
    reservedWordsAsValues: ['__proto__', 'prototype', 'constructor'],
  };
  for (const operation of [wire, input]) {
    const value = operation.v;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('structural positive control has no object payload');
    }
    const future = (value as Record<string, unknown>).future;
    if (future === null || typeof future !== 'object' || Array.isArray(future)) {
      throw new Error('structural positive control has no future object');
    }
    (future as Record<string, unknown>).safeNearMisses = structuredClone(safeNearMisses);
  }
  return {
    ...fixture,
    logActor: STRUCTURAL_CONTROL_ACTOR,
    wireJson: JSON.stringify(wire),
    dispatchInputJson: JSON.stringify(input),
    subject: { ...fixture.subject, actor: STRUCTURAL_CONTROL_ACTOR },
  };
}

function structuralPositiveControlsAreExact(fixture: OpCorpusCase): boolean {
  if (fixture.id !== STRUCTURAL_CONTROL_CASE_ID) return true;
  const wire = JSON.parse(fixture.wireJson) as Record<string, unknown>;
  const value = wire.v as Record<string, unknown>;
  const future = value.future as Record<string, unknown>;
  const controls = future.safeNearMisses as Record<string, unknown>;
  const keys = Object.keys(controls).filter((key) => key !== 'reservedWordsAsValues');
  return (
    wire.actor === STRUCTURAL_CONTROL_ACTOR &&
    wire.hlc === `2026-08-19T00:00:00.000Z-00af-${STRUCTURAL_CONTROL_ACTOR}` &&
    /^a_[0-9A-HJKMNP-TV-Z]{13}$/u.test(STRUCTURAL_CONTROL_ACTOR) &&
    Object.hasOwn(controls, '__proto') &&
    !Object.hasOwn(controls, '__proto__') &&
    isDeepStrictEqual(controls.reservedWordsAsValues, ['__proto__', 'prototype', 'constructor']) &&
    new Set(keys.map((key) => key.normalize('NFC'))).size === keys.length &&
    keys.some((key) => key !== key.normalize('NFC'))
  );
}

function defineFinalAssertion(
  mode: TestMode,
  name: string,
  actual: () => unknown,
  expected: unknown,
): void {
  const assertion = (): void => {
    expect(actual()).toEqual(expected);
  };
  if (mode === 'xfail') it.fails(name, assertion);
  else it(name, assertion);
}

function subjectVisible(store: ProjectStore | null, subject: OpCorpusSubject): boolean {
  if (store === null) return false;
  try {
    return visibleEntities(store.state, subject.kind).some((record) => record.id === subject.id);
  } catch {
    return false;
  }
}

function matchingSubjectOp(store: ProjectStore | null, subject: OpCorpusSubject): Record<string, unknown> | null {
  if (store === null) return null;
  const match = store.allOps.find((op) => op.actor === subject.actor && op.op === subject.op);
  return match === undefined ? null : (match as unknown as Record<string, unknown>);
}

function parsedPayloadMatches(wireJson: string, actual: Record<string, unknown> | null): boolean | null {
  if (actual === null) return null;
  let expected: unknown;
  try {
    expected = JSON.parse(wireJson);
  } catch {
    return null;
  }
  if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) return null;
  return isDeepStrictEqual(actual.v, (expected as Record<string, unknown>).v);
}

interface IngestOutcome {
  opened: boolean;
  reducerAccepted: boolean;
  issueReported: boolean;
  visible: boolean;
  payloadPreserved: boolean | null;
  acceptedAuthorityExact: boolean | null;
  inactiveAuthorityExact: boolean | null;
  rawPreserved: boolean;
  objectIntrinsicsIntact: boolean;
}

function expectedIngest(fixture: OpCorpusCase): IngestOutcome {
  const accepted = fixture.expected.reducer !== 'none';
  return {
    opened: true,
    reducerAccepted: accepted,
    issueReported: fixture.expected.reducer === 'none',
    visible: fixture.expected.reducer === 'visible',
    payloadPreserved: accepted ? true : null,
    acceptedAuthorityExact: accepted ? true : null,
    inactiveAuthorityExact: accepted ? null : true,
    rawPreserved: true,
    objectIntrinsicsIntact: true,
  };
}

async function characterizeOpen(fixture: OpCorpusCase): Promise<IngestOutcome> {
  const fs = new MemoryFS();
  const dir = `projects/open-${fixture.id}`;
  const baseline = await ProjectStore.create(fs, dir, fixture.id, USER);
  const baselineAuthority = {
    allOps: structuredClone(baseline.allOps),
    state: structuredClone(baseline.state),
    vector: structuredClone(baseline.vector),
    manifest: await fs.readBytes(`${dir}/lociview.json`),
  };
  const logPath = `${dir}/ops/${fixture.logActor}.jsonl`;
  await fs.writeText(logPath, `${fixture.wireJson}\n`);
  const expectedActiveLogs = await activeLogInventory(fs, dir);
  const expectedAcceptedOps = fixture.expected.reducer === 'none'
    ? null
    : [...baselineAuthority.allOps, decodedFixtureOp(fixture)];

  const prototypeBefore = snapshotObjectIntrinsics();
  try {
    let store: ProjectStore | null = null;
    try {
      store = await ProjectStore.open(fs, dir, USER);
    } catch {
      // A product open failure is part of the unsafe baseline outcome.
    }
    const matching = matchingSubjectOp(store, fixture.subject);
    return {
      opened: store !== null,
      reducerAccepted: matching !== null,
      issueReported: store !== null && store.loadErrors.some(({ file }) => file === logPath),
      visible: subjectVisible(store, fixture.subject),
      payloadPreserved: parsedPayloadMatches(fixture.wireJson, matching),
      acceptedAuthorityExact: expectedAcceptedOps === null
        ? null
        : store !== null &&
          await fullAuthorityIsExact(
            fs,
            dir,
            store,
            expectedAcceptedOps,
            baselineAuthority.manifest,
          ) &&
          isDeepStrictEqual(await activeLogInventory(fs, dir), expectedActiveLogs),
      inactiveAuthorityExact: fixture.expected.reducer === 'none'
        ? store !== null &&
          isDeepStrictEqual(store.allOps, baselineAuthority.allOps) &&
          isDeepStrictEqual(store.state, baselineAuthority.state) &&
          isDeepStrictEqual(store.vector, baselineAuthority.vector) &&
          isDeepStrictEqual(await fs.readBytes(`${dir}/lociview.json`), baselineAuthority.manifest) &&
          isDeepStrictEqual(await activeLogInventory(fs, dir), expectedActiveLogs)
        : null,
      rawPreserved: (await fs.readText(logPath)) === `${fixture.wireJson}\n`,
      objectIntrinsicsIntact: objectIntrinsicsMatch(prototypeBefore),
    };
  } finally {
    restoreObjectIntrinsics(prototypeBefore);
  }
}

interface DispatchOutcome {
  explicitlyRejected: boolean;
  activeAuthorityUnchanged: boolean | null;
  memoryReducerAccepted: boolean;
  memoryVisible: boolean;
  memoryPayloadPreserved: boolean | null;
  acceptedAuthorityExact: boolean | null;
  durableLogChanged: boolean;
  listenerNotified: boolean;
  reopened: boolean;
  reopenedReducerAccepted: boolean;
  reopenedVisible: boolean;
  reopenedPayloadPreserved: boolean | null;
  nextValidTwinAuthorityExact: boolean | null;
  objectIntrinsicsIntact: boolean;
}

function expectedDispatch(fixture: OpCorpusCase): DispatchOutcome {
  const accepted = fixture.expected.reducer !== 'none';
  return {
    explicitlyRejected: !accepted,
    activeAuthorityUnchanged: accepted ? null : true,
    memoryReducerAccepted: accepted,
    memoryVisible: fixture.expected.reducer === 'visible',
    memoryPayloadPreserved: accepted ? true : null,
    acceptedAuthorityExact: accepted ? true : null,
    durableLogChanged: accepted,
    listenerNotified: accepted,
    reopened: true,
    reopenedReducerAccepted: accepted,
    reopenedVisible: fixture.expected.reducer === 'visible',
    reopenedPayloadPreserved: accepted ? true : null,
    nextValidTwinAuthorityExact: accepted ? null : true,
    objectIntrinsicsIntact: true,
  };
}

function dispatchPayloadMatches(
  input: DispatchInput,
  actual: Record<string, unknown> | null,
): boolean | null {
  if (actual === null) return null;
  const comparableActual = {
    t: actual.t,
    e: actual.e,
    id: actual.id,
    ...(Object.hasOwn(actual, 'v') ? { v: actual.v } : {}),
  };
  return isDeepStrictEqual(comparableActual, input);
}

function operationKey(value: { actor: string; op: number }): string {
  return `${value.actor}#${value.op}`;
}

async function activeLogInventory(fs: MemoryFS, dir: string): Promise<Map<string, number[]>> {
  const inventory = new Map<string, number[]>();
  for (const path of (await fs.list(`${dir}/ops/`)).filter((path) => path.endsWith('.jsonl')).sort()) {
    const bytes = await fs.readBytes(path);
    if (bytes === null) throw new Error(`listed active log disappeared: ${path}`);
    inventory.set(path, Array.from(bytes));
  }
  return inventory;
}

function publicAuthorityCheckpointsAreExact(
  checkpoints: readonly PublicFileAuthority[],
  expectedMarker: Uint8Array | null,
  expectedLogs: Map<string, number[]>,
): boolean {
  return checkpoints.every(
    ({ marker, logs }) =>
      isDeepStrictEqual(marker, expectedMarker) && isDeepStrictEqual(logs, expectedLogs),
  );
}

function logInventorySemanticallyMatches(
  inventory: Map<string, number[]>,
  dir: string,
  expectedOps: readonly Op[],
): boolean {
  const byActor = new Map<string, Op[]>();
  for (const op of expectedOps) {
    const actorOps = byActor.get(op.actor) ?? [];
    actorOps.push(op);
    byActor.set(op.actor, actorOps);
  }
  const expectedPaths = [...byActor.keys()].map((actor) => `${dir}/ops/${actor}.jsonl`).sort();
  if (!isDeepStrictEqual([...inventory.keys()].sort(), expectedPaths)) return false;
  for (const [actor, ops] of byActor) {
    const bytes = inventory.get(`${dir}/ops/${actor}.jsonl`);
    if (bytes === undefined) return false;
    const parsed = parseOpsJsonl(decoder.decode(Uint8Array.from(bytes)));
    if (parsed.errors.length !== 0 || !operationsAreExact(parsed.ops, ops)) return false;
  }
  return true;
}

function publicAuthorityCheckpointsAreBaselineOrCandidate(
  checkpoints: readonly PublicFileAuthority[],
  dir: string,
  expectedMarker: Uint8Array | null,
  baselineLogs: Map<string, number[]>,
  candidateOps: readonly Op[],
): boolean {
  return checkpoints.every(
    ({ marker, logs }) =>
      isDeepStrictEqual(marker, expectedMarker) &&
      (isDeepStrictEqual(logs, baselineLogs) ||
        logInventorySemanticallyMatches(logs, dir, candidateOps)),
  );
}

function operationsAreExact(actual: readonly Op[], expected: readonly Op[]): boolean {
  if (actual.length !== expected.length) return false;
  const unmatched = [...actual];
  for (const expectedOp of expected) {
    const index = unmatched.findIndex((actualOp) => isDeepStrictEqual(actualOp, expectedOp));
    if (index < 0) return false;
    unmatched.splice(index, 1);
  }
  return unmatched.length === 0;
}

function memoryAuthorityIsExact(store: ProjectStore, expectedOps: readonly Op[]): boolean {
  return (
    operationsAreExact(store.allOps, expectedOps) &&
    isDeepStrictEqual(store.state, reduceOps(expectedOps)) &&
    isDeepStrictEqual(store.vector, versionVector(expectedOps))
  );
}

async function fullAuthorityIsExact(
  fs: MemoryFS,
  dir: string,
  store: ProjectStore,
  expectedOps: readonly Op[],
  expectedManifest: Uint8Array | null,
): Promise<boolean> {
  return (
    memoryAuthorityIsExact(store, expectedOps) &&
    isDeepStrictEqual(await fs.readBytes(`${dir}/lociview.json`), expectedManifest) &&
    await activeLogsSemanticallyMatch(fs, dir, expectedOps)
  );
}

function decodedFixtureOp(fixture: OpCorpusCase): Op {
  const decoded = JSON.parse(fixture.wireJson) as unknown;
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error(`${fixture.id} accepted fixture is not an operation object`);
  }
  return structuredClone(decoded) as Op;
}

async function activeLogsSemanticallyMatch(
  fs: MemoryFS,
  dir: string,
  expectedOps: readonly Op[],
): Promise<boolean> {
  return logInventorySemanticallyMatches(await activeLogInventory(fs, dir), dir, expectedOps);
}

function actorBoundOperationsEquivalent(
  target: Record<string, unknown> | null,
  targetActor: string,
  twin: Record<string, unknown> | null,
  twinActor: string,
): boolean {
  if (target === null || twin === null || targetActor === twinActor) return false;
  if (typeof target.hlc !== 'string' || typeof twin.hlc !== 'string') return false;
  let targetHlc: ReturnType<typeof parseHlc>;
  let twinHlc: ReturnType<typeof parseHlc>;
  try {
    targetHlc = parseHlc(target.hlc);
    twinHlc = parseHlc(twin.hlc);
  } catch {
    return false;
  }
  return (
    target.actor === targetActor &&
    twin.actor === twinActor &&
    targetHlc.actor === targetActor &&
    twinHlc.actor === twinActor &&
    target.op === twin.op &&
    targetHlc.physical === twinHlc.physical &&
    targetHlc.counter === twinHlc.counter &&
    target.user === twin.user &&
    target.t === twin.t &&
    target.e === twin.e &&
    target.id === twin.id &&
    isDeepStrictEqual(target.v, twin.v)
  );
}

async function characterizeDispatch(fixture: OpCorpusCase): Promise<DispatchOutcome> {
  if (fixture.dispatchInputJson === null) throw new Error(`${fixture.id} has no dispatch input`);
  const shouldReject = fixture.expected.reducer === 'none';
  const now = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  const fs = new RecordingMemoryFS();
  const twinFs = shouldReject ? new RecordingMemoryFS() : null;
  const dir = `projects/dispatch-${fixture.id}`;
  const store = await ProjectStore.create(fs, dir, fixture.id, USER);
  const twin = twinFs === null ? null : await ProjectStore.create(twinFs, dir, fixture.id, USER);
  const logPath = `${dir}/ops/${store.actorId}.jsonl`;
  const beforeOps = store.allOps.length;
  const beforeOwnOps = store.allOps.filter((op) => op.actor === store.actorId).length;
  const twinBeforeOwnOps = twin?.allOps.filter((op) => op.actor === twin.actorId).length ?? null;
  const beforeKeys = new Set(store.allOps.map(operationKey));
  const beforeLog = await fs.readText(logPath);
  const authorityBefore = {
    allOps: structuredClone(store.allOps),
    state: structuredClone(store.state),
    vector: structuredClone(store.vector),
    manifest: await fs.readBytes(`${dir}/lociview.json`),
    logs: await activeLogInventory(fs, dir),
    durability: structuredClone(store.durabilityStatus),
  };
  let listenerCalls = 0;
  const unsubscribe = store.subscribe(() => {
    listenerCalls += 1;
  });
  const input = JSON.parse(fixture.dispatchInputJson) as DispatchInput;
  const expectedAcceptedOps = shouldReject
    ? null
    : [
        ...authorityBefore.allOps,
        {
          op: beforeOwnOps + 1,
          hlc: formatHlc(FIXED_NOW, beforeOwnOps, store.actorId),
          actor: store.actorId,
          user: USER.userId,
          ...structuredClone(input),
        } satisfies Op,
      ];
  fs.beginPublicAuthorityHistory(dir);
  const prototypeBefore = snapshotObjectIntrinsics();

  try {
    let explicitlyRejected = false;
    try {
      store.dispatch(input);
    } catch {
      explicitlyRejected = true;
    }
    try {
      await store.flush();
    } catch {
      // A rejected write queue is observed through exact public authority and reopen.
    }
    unsubscribe();

    const added = store.allOps.slice(beforeOps);
    const actual = added.length === 1 ? (added[0] as unknown as Record<string, unknown>) : null;
    const localSubject =
      added.length === 1
        ? { actor: added[0]!.actor, op: added[0]!.op, kind: added[0]!.e, id: added[0]!.id }
        : null;
    let objectIntrinsicsIntact = objectIntrinsicsMatch(prototypeBefore);
    restoreObjectIntrinsics(prototypeBefore);

    let reopened: ProjectStore | null = null;
    try {
      reopened = await ProjectStore.open(fs, dir, USER);
    } catch {
      // Reopen failure is part of the unsafe baseline outcome.
    }
    objectIntrinsicsIntact &&= objectIntrinsicsMatch(prototypeBefore);
    const reopenedAdded =
      reopened?.allOps.filter((op) => !beforeKeys.has(operationKey(op))) ?? [];
    const reopenedActual =
      reopenedAdded.length === 1
        ? (reopenedAdded[0] as unknown as Record<string, unknown>)
        : null;
    const reopenedSubject =
      reopenedAdded.length === 1
        ? {
            actor: reopenedAdded[0]!.actor,
            op: reopenedAdded[0]!.op,
            kind: reopenedAdded[0]!.e,
            id: reopenedAdded[0]!.id,
          }
        : null;
    const durableLogChanged = (await fs.readText(logPath)) !== beforeLog;
    const activeAuthorityUnchanged = shouldReject
      ? isDeepStrictEqual(store.allOps, authorityBefore.allOps) &&
        isDeepStrictEqual(store.state, authorityBefore.state) &&
        isDeepStrictEqual(store.vector, authorityBefore.vector) &&
        isDeepStrictEqual(await fs.readBytes(`${dir}/lociview.json`), authorityBefore.manifest) &&
        isDeepStrictEqual(await activeLogInventory(fs, dir), authorityBefore.logs) &&
        isDeepStrictEqual(store.durabilityStatus, authorityBefore.durability) &&
        publicAuthorityCheckpointsAreExact(
          fs.publicAuthorityCheckpoints,
          authorityBefore.manifest,
          authorityBefore.logs,
        )
      : null;

    const acceptedAuthorityExact = expectedAcceptedOps === null
      ? null
      : reopened !== null &&
        await fullAuthorityIsExact(fs, dir, store, expectedAcceptedOps, authorityBefore.manifest) &&
        await fullAuthorityIsExact(fs, dir, reopened, expectedAcceptedOps, authorityBefore.manifest);
    let nextValidTwinAuthorityExact: boolean | null = null;
    if (shouldReject && twin !== null && twinFs !== null && twinBeforeOwnOps !== null) {
      let targetProbe: Record<string, unknown> | null = null;
      let twinProbe: Record<string, unknown> | null = null;
      let probesFlushed = false;
      try {
        targetProbe = store.dispatch(NEXT_VALID_INPUT) as unknown as Record<string, unknown>;
        twinProbe = twin.dispatch(NEXT_VALID_INPUT) as unknown as Record<string, unknown>;
        await store.flush();
        await twin.flush();
        probesFlushed = true;
      } catch {
        // A rejected operation must not poison the next valid operation or durability queue.
      }
      let targetProbeReopened: Record<string, unknown> | null = null;
      let twinProbeReopened: Record<string, unknown> | null = null;
      let targetOwnOps: readonly { actor: string; op: number }[] = [];
      let twinOwnOps: readonly { actor: string; op: number }[] = [];
      try {
        const targetAfterProbe = await ProjectStore.open(fs, dir, USER);
        const twinAfterProbe = await ProjectStore.open(twinFs, dir, USER);
        targetOwnOps = targetAfterProbe.allOps.filter((op) => op.actor === store.actorId);
        twinOwnOps = twinAfterProbe.allOps.filter((op) => op.actor === twin.actorId);
        targetProbeReopened = targetOwnOps.at(-1) as unknown as Record<string, unknown>;
        twinProbeReopened = twinOwnOps.at(-1) as unknown as Record<string, unknown>;
      } catch {
        // Reopen is part of the exact durable-authority check below.
      }
      nextValidTwinAuthorityExact =
        probesFlushed &&
        targetOwnOps.length === beforeOwnOps + 1 &&
        twinOwnOps.length === twinBeforeOwnOps + 1 &&
        actorBoundOperationsEquivalent(targetProbe, store.actorId, twinProbe, twin.actorId) &&
        actorBoundOperationsEquivalent(
          targetProbeReopened,
          store.actorId,
          twinProbeReopened,
          twin.actorId,
        ) &&
        isDeepStrictEqual(targetProbe, targetProbeReopened) &&
        isDeepStrictEqual(twinProbe, twinProbeReopened);
    }
    return {
      explicitlyRejected,
      activeAuthorityUnchanged,
      memoryReducerAccepted: added.length === 1,
      memoryVisible: localSubject !== null && subjectVisible(store, localSubject),
      memoryPayloadPreserved: dispatchPayloadMatches(input, actual),
      acceptedAuthorityExact,
      durableLogChanged,
      listenerNotified: listenerCalls > 0,
      reopened: reopened !== null,
      reopenedReducerAccepted: reopenedAdded.length === 1,
      reopenedVisible: reopenedSubject !== null && subjectVisible(reopened, reopenedSubject),
      reopenedPayloadPreserved: dispatchPayloadMatches(input, reopenedActual),
      nextValidTwinAuthorityExact,
      objectIntrinsicsIntact,
    };
  } finally {
    unsubscribe();
    restoreObjectIntrinsics(prototypeBefore);
    now.mockRestore();
  }
}

interface PackageOutcome {
  inspected: boolean;
  sourceRawPreserved: boolean;
  reopened: boolean;
  reducerAccepted: boolean;
  issueReported: boolean;
  visible: boolean;
  payloadPreserved: boolean | null;
  acceptedAuthorityExact: boolean | null;
  inactiveAuthorityExact: boolean | null;
  objectIntrinsicsIntact: boolean;
}

function expectedPackage(fixture: OpCorpusCase): PackageOutcome {
  const accepted = fixture.expected.reducer !== 'none';
  return {
    inspected: true,
    sourceRawPreserved: true,
    reopened: true,
    reducerAccepted: accepted,
    issueReported: fixture.expected.reducer === 'none',
    visible: fixture.expected.reducer === 'visible',
    payloadPreserved: accepted ? true : null,
    acceptedAuthorityExact: accepted ? true : null,
    inactiveAuthorityExact: accepted ? null : true,
    objectIntrinsicsIntact: true,
  };
}

async function characterizePackage(fixture: OpCorpusCase): Promise<PackageOutcome> {
  const fs = new MemoryFS();
  const dir = `projects/package-${fixture.id}`;
  const target = await ProjectStore.create(fs, dir, fixture.id, USER);
  const baselineAuthority = {
    allOps: structuredClone(target.allOps),
    state: structuredClone(target.state),
    vector: structuredClone(target.vector),
    manifest: await fs.readBytes(`${dir}/lociview.json`),
    logs: await activeLogInventory(fs, dir),
  };
  const expectedAcceptedOps = fixture.expected.reducer === 'none'
    ? null
    : [...baselineAuthority.allOps, decodedFixtureOp(fixture)];
  const manifestText = await fs.readText(`${dir}/lociview.json`);
  if (manifestText === null) throw new Error('package target manifest setup failed');
  const zip = await writeZipEntries([
    { path: 'lociview.json', data: encoder.encode(manifestText) },
    {
      path: `ops/${fixture.logActor}.jsonl`,
      data: encoder.encode(`${fixture.wireJson}\n`),
    },
  ]);

  const prototypeBefore = snapshotObjectIntrinsics();
  try {
    let inspection: Awaited<ReturnType<typeof inspectZip>> | null = null;
    try {
      inspection = await inspectZip(zip);
    } catch {
      // Inspection failure is recorded below; fixture construction failures occurred above.
    }

    if (inspection !== null) {
      try {
        await mergeFromInspection(fs, dir, target, inspection);
      } catch {
        // Safe rejection is permitted if the existing target remains intact and reopenable.
      }
    }
    let objectIntrinsicsIntact = objectIntrinsicsMatch(prototypeBefore);
    restoreObjectIntrinsics(prototypeBefore);

    let reopened: ProjectStore | null = null;
    try {
      reopened = await ProjectStore.open(fs, dir, USER);
    } catch {
      // An existing project must remain openable even when incoming evidence is invalid.
    }
    objectIntrinsicsIntact &&= objectIntrinsicsMatch(prototypeBefore);

    const matching = matchingSubjectOp(reopened, fixture.subject);
    return {
      inspected: inspection !== null,
      sourceRawPreserved:
        inspection?.opsFiles.some(
          ({ path, text }) =>
            path === `ops/${fixture.logActor}.jsonl` && text === `${fixture.wireJson}\n`,
        ) ?? false,
      reopened: reopened !== null,
      reducerAccepted: matching !== null,
      issueReported: (inspection?.opsErrorCount ?? 0) > 0,
      visible: subjectVisible(reopened, fixture.subject),
      payloadPreserved: parsedPayloadMatches(fixture.wireJson, matching),
      acceptedAuthorityExact: expectedAcceptedOps === null
        ? null
        : reopened !== null &&
          await fullAuthorityIsExact(
            fs,
            dir,
            target,
            expectedAcceptedOps,
            baselineAuthority.manifest,
          ) &&
          await fullAuthorityIsExact(
            fs,
            dir,
            reopened,
            expectedAcceptedOps,
            baselineAuthority.manifest,
          ),
      inactiveAuthorityExact: fixture.expected.reducer === 'none'
        ? reopened !== null &&
          isDeepStrictEqual(reopened.allOps, baselineAuthority.allOps) &&
          isDeepStrictEqual(reopened.state, baselineAuthority.state) &&
          isDeepStrictEqual(reopened.vector, baselineAuthority.vector) &&
          isDeepStrictEqual(await fs.readBytes(`${dir}/lociview.json`), baselineAuthority.manifest) &&
          isDeepStrictEqual(await activeLogInventory(fs, dir), baselineAuthority.logs)
        : null,
      objectIntrinsicsIntact,
    };
  } finally {
    restoreObjectIntrinsics(prototypeBefore);
  }
}

function ingestDecision(
  outcome: IngestOutcome,
): Omit<IngestOutcome, 'opened' | 'rawPreserved' | 'objectIntrinsicsIntact'> {
  const {
    opened: _opened,
    rawPreserved: _raw,
    objectIntrinsicsIntact: _intrinsics,
    ...decision
  } = outcome;
  return decision;
}

function dispatchDecision(
  outcome: DispatchOutcome,
): Omit<DispatchOutcome, 'reopened' | 'objectIntrinsicsIntact'> {
  const {
    reopened: _reopened,
    objectIntrinsicsIntact: _intrinsics,
    ...decision
  } = outcome;
  return decision;
}

function packageDecision(
  outcome: PackageOutcome,
): Omit<
  PackageOutcome,
  'inspected' | 'sourceRawPreserved' | 'reopened' | 'objectIntrinsicsIntact'
> {
  const {
    inspected: _inspected,
    sourceRawPreserved: _sourceRaw,
    reopened: _reopened,
    objectIntrinsicsIntact: _intrinsics,
    ...decision
  } = outcome;
  return decision;
}

const DIRECT_MERGE_ACTORS = ['a_0ABCDEFGHJKMP', 'a_0ABCDEFGHJKMQ'] as const;

function directMergeOp(actor: string, op: number, id: string, v: Record<string, unknown>): Op {
  return {
    op,
    hlc: `2026-08-19T12:00:00.000Z-000${op - 1}-${actor}`,
    actor,
    user: USER.userId,
    t: 'create',
    e: 'caption',
    id,
    v,
  };
}

async function directMergeOrderIsAtomic(order: 'valid-first' | 'invalid-first'): Promise<boolean> {
  const fs = new RecordingMemoryFS();
  const twinFs = new RecordingMemoryFS();
  const dir = `projects/direct-merge-${order}`;
  const store = await ProjectStore.create(fs, dir, order, USER);
  const twin = await ProjectStore.create(twinFs, dir, order, USER);
  const incomingActor = DIRECT_MERGE_ACTORS.find((actor) => actor !== store.actorId)!;
  const valid = directMergeOp(
    incomingActor,
    1,
    'cap_00000000000000000000000081',
    { title: 'valid batch member' },
  );
  const invalid = {
    ...directMergeOp(
      incomingActor,
      2,
      'cap_00000000000000000000000082',
      { title: 'invalid batch member' },
    ),
    hlc: `2026-08-19T12:00:00.000Z-0001-${DIRECT_MERGE_ACTORS.find((actor) => actor !== incomingActor)!}`,
  };
  const baseline = {
    allOps: structuredClone(store.allOps),
    state: structuredClone(store.state),
    vector: structuredClone(store.vector),
    manifest: await fs.readBytes(`${dir}/lociview.json`),
    logs: await activeLogInventory(fs, dir),
    durability: structuredClone(store.durabilityStatus),
    ownCount: store.allOps.filter((op) => op.actor === store.actorId).length,
  };
  const twinBaseline = {
    allOps: structuredClone(twin.allOps),
    manifest: await twinFs.readBytes(`${dir}/lociview.json`),
    logs: await activeLogInventory(twinFs, dir),
    ownCount: twin.allOps.filter((op) => op.actor === twin.actorId).length,
  };
  fs.beginPublicAuthorityHistory(dir);
  twinFs.beginPublicAuthorityHistory(dir);
  let listenerCalls = 0;
  const unsubscribe = store.subscribe(() => {
    listenerCalls += 1;
  });
  let explicitlyRejected = false;
  try {
    try {
      store.mergeExternal(order === 'valid-first' ? [valid, invalid] : [invalid, valid]);
    } catch {
      explicitlyRejected = true;
    }
    await Promise.resolve();
  } finally {
    unsubscribe();
  }
  const boundaryExact =
    explicitlyRejected &&
    listenerCalls === 0 &&
    memoryAuthorityIsExact(store, baseline.allOps) &&
    isDeepStrictEqual(store.state, baseline.state) &&
    isDeepStrictEqual(store.vector, baseline.vector) &&
    isDeepStrictEqual(await fs.readBytes(`${dir}/lociview.json`), baseline.manifest) &&
    isDeepStrictEqual(await activeLogInventory(fs, dir), baseline.logs) &&
    isDeepStrictEqual(store.durabilityStatus, baseline.durability) &&
    publicAuthorityCheckpointsAreExact(
      fs.publicAuthorityCheckpoints,
      baseline.manifest,
      baseline.logs,
    );

  let targetProbe: Record<string, unknown> | null = null;
  let twinProbe: Record<string, unknown> | null = null;
  let expectedTargetOps: readonly Op[] | null = null;
  let expectedTwinOps: readonly Op[] | null = null;
  let liveProbeExact = false;
  let probeDurable = false;
  try {
    targetProbe = store.dispatch(NEXT_VALID_INPUT) as unknown as Record<string, unknown>;
    twinProbe = twin.dispatch(NEXT_VALID_INPUT) as unknown as Record<string, unknown>;
    expectedTargetOps = [...baseline.allOps, structuredClone(targetProbe) as unknown as Op];
    expectedTwinOps = [...twinBaseline.allOps, structuredClone(twinProbe) as unknown as Op];
    liveProbeExact =
      memoryAuthorityIsExact(store, expectedTargetOps) &&
      memoryAuthorityIsExact(twin, expectedTwinOps);
    await store.flush();
    await twin.flush();
    probeDurable = true;
  } catch {
    // Exact return/reopen checks below capture a poisoned sequence, clock, or queue.
  }
  const reopened = await ProjectStore.open(fs, dir, USER);
  const twinReopened = await ProjectStore.open(twinFs, dir, USER);
  const targetOwn = reopened.allOps.filter((op) => op.actor === store.actorId);
  const twinOwn = twinReopened.allOps.filter((op) => op.actor === twin.actorId);
  const targetReopenedProbe = targetOwn.at(-1) as unknown as Record<string, unknown>;
  const twinReopenedProbe = twinOwn.at(-1) as unknown as Record<string, unknown>;
  const probeExact =
    probeDurable &&
    liveProbeExact &&
    expectedTargetOps !== null &&
    expectedTwinOps !== null &&
    targetOwn.length === baseline.ownCount + 1 &&
    twinOwn.length === twinBaseline.ownCount + 1 &&
    actorBoundOperationsEquivalent(targetProbe, store.actorId, twinProbe, twin.actorId) &&
    actorBoundOperationsEquivalent(
      targetReopenedProbe,
      store.actorId,
      twinReopenedProbe,
      twin.actorId,
    ) &&
    isDeepStrictEqual(targetProbe, targetReopenedProbe) &&
    isDeepStrictEqual(twinProbe, twinReopenedProbe) &&
    await fullAuthorityIsExact(fs, dir, store, expectedTargetOps, baseline.manifest) &&
    await fullAuthorityIsExact(fs, dir, reopened, expectedTargetOps, baseline.manifest) &&
    await fullAuthorityIsExact(twinFs, dir, twin, expectedTwinOps, twinBaseline.manifest) &&
    await fullAuthorityIsExact(twinFs, dir, twinReopened, expectedTwinOps, twinBaseline.manifest) &&
    publicAuthorityCheckpointsAreBaselineOrCandidate(
      fs.publicAuthorityCheckpoints,
      dir,
      baseline.manifest,
      baseline.logs,
      expectedTargetOps,
    ) &&
    publicAuthorityCheckpointsAreBaselineOrCandidate(
      twinFs.publicAuthorityCheckpoints,
      dir,
      twinBaseline.manifest,
      twinBaseline.logs,
      expectedTwinOps,
    ) &&
    reopened.loadErrors.length === 0 &&
    twinReopened.loadErrors.length === 0;
  return boundaryExact && probeExact;
}

interface AliasIsolationOutcome {
  localLiveExact: boolean;
  localDurableExact: boolean;
  mergeLiveExact: boolean;
  mergeDurableExact: boolean;
}

async function acceptedCallerAliasesAreIsolated(): Promise<AliasIsolationOutcome> {
  const localFs = new MemoryFS();
  const localDir = 'projects/local-alias';
  const localStore = await ProjectStore.create(localFs, localDir, 'local alias', USER);
  const localValue = { future: { label: 'original' }, items: ['one'] };
  const expectedLocalValue = structuredClone(localValue);
  const localInput: DispatchInput = {
    t: 'create',
    e: 'caption',
    id: 'cap_00000000000000000000000083',
    v: localValue,
  };
  const localOp = localStore.dispatch(localInput);
  const expectedLocalOp = structuredClone(localOp);
  localValue.future.label = 'mutated';
  localValue.items.push('two');
  localInput.e = 'asset';
  localInput.id = 'ast_00000000000000000000000083';
  localInput.v = { replacement: true };
  const localLiveExact =
    isDeepStrictEqual(localOp, expectedLocalOp) &&
    isDeepStrictEqual(localOp.v, expectedLocalValue) &&
    isDeepStrictEqual(
      visibleEntities(localStore.state, 'caption').find(({ id }) => id === localOp.id)?.fields,
      expectedLocalValue,
    );
  await localStore.flush();
  const localReopened = await ProjectStore.open(localFs, localDir, USER);
  const localDurableExact = isDeepStrictEqual(
    localReopened.allOps.find((op) => operationKey(op) === operationKey(expectedLocalOp)),
    expectedLocalOp,
  );

  const mergeFs = new MemoryFS();
  const mergeDir = 'projects/merge-alias';
  const mergeStore = await ProjectStore.create(mergeFs, mergeDir, 'merge alias', USER);
  const mergeActor = DIRECT_MERGE_ACTORS.find((actor) => actor !== mergeStore.actorId)!;
  const mergeValue = { future: { label: 'original' }, items: ['one'] };
  const expectedMergeValue = structuredClone(mergeValue);
  const incoming = directMergeOp(
    mergeActor,
    1,
    'cap_00000000000000000000000084',
    mergeValue,
  );
  const expectedIncoming = structuredClone(incoming);
  mergeStore.mergeExternal([incoming]);
  mergeValue.future.label = 'mutated';
  mergeValue.items.push('two');
  incoming.e = 'asset';
  incoming.id = 'ast_00000000000000000000000084';
  incoming.v = { replacement: true };
  const mergeLiveOp = mergeStore.allOps.find((op) => operationKey(op) === operationKey(expectedIncoming));
  const mergeLiveExact =
    isDeepStrictEqual(mergeLiveOp, expectedIncoming) &&
    isDeepStrictEqual(mergeLiveOp?.v, expectedMergeValue) &&
    isDeepStrictEqual(
      visibleEntities(mergeStore.state, 'caption').find(({ id }) => id === expectedIncoming.id)?.fields,
      expectedMergeValue,
    );
  await mergeStore.flush();
  const mergeReopened = await ProjectStore.open(mergeFs, mergeDir, USER);
  const mergeDurableExact = isDeepStrictEqual(
    mergeReopened.allOps.find((op) => operationKey(op) === operationKey(expectedIncoming)),
    expectedIncoming,
  );
  return { localLiveExact, localDurableExact, mergeLiveExact, mergeDurableExact };
}

describe.sequential('G0S-OP shared operation corpus', () => {
  describe.each(CORPUS.cases)('$id', (fixture) => {
    const testedFixture = withStructuralPositiveControls(fixture);

    describe('JSONL open ingress', () => {
      let outcome: IngestOutcome;
      beforeAll(async () => {
        outcome = await characterizeOpen(testedFixture);
      });
      defineFinalAssertion(
        OPEN_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
        'matches the approved accept/quarantine oracle',
        () => ingestDecision(outcome),
        ingestDecision(expectedIngest(testedFixture)),
      );
      defineFinalAssertion(
        OPEN_FAILURE_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
        'keeps the project openable independently of the operation decision',
        () => outcome.opened,
        true,
      );
      defineFinalAssertion(
        'pass',
        'preserves the source evidence line independently of reducer acceptance',
        () => outcome.rawPreserved,
        true,
      );
      defineFinalAssertion(
        INTRINSIC_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
        'does not mutate Object or Object.prototype',
        () => outcome.objectIntrinsicsIntact,
        true,
      );
    });

    if (fixture.dispatchInputJson !== null) {
      describe('local dispatch ingress', () => {
        let outcome: DispatchOutcome;
        beforeAll(async () => {
          outcome = await characterizeDispatch(testedFixture);
        });
        defineFinalAssertion(
          DISPATCH_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
          'is atomic and matches the approved payload oracle',
          () => dispatchDecision(outcome),
          dispatchDecision(expectedDispatch(testedFixture)),
        );
        defineFinalAssertion(
          'pass',
          'keeps the durable project reopenable independently of the operation decision',
          () => outcome.reopened,
          true,
        );
        if (fixture.expected.reducer === 'none') {
          defineFinalAssertion(
            DISPATCH_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
            'leaves rejected local active authority and durability byte-exact',
            () => outcome.activeAuthorityUnchanged,
            true,
          );
        }
        defineFinalAssertion(
          INTRINSIC_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
          'does not mutate Object or Object.prototype',
          () => outcome.objectIntrinsicsIntact,
          true,
        );
      });
    }

    describe('package inspect/merge ingress', () => {
      let outcome: PackageOutcome;
      beforeAll(async () => {
        outcome = await characterizePackage(testedFixture);
      });
      defineFinalAssertion(
        OPEN_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
        'matches the same oracle through inspect, merge, and reopen',
        () => packageDecision(outcome),
        packageDecision(expectedPackage(testedFixture)),
      );
      defineFinalAssertion(
        'pass',
        'keeps the existing target reopenable independently of incoming acceptance',
        () => outcome.reopened,
        true,
      );
      defineFinalAssertion(
        'pass',
        'inspects the exact source evidence independently of merge acceptance',
        () => ({ inspected: outcome.inspected, sourceRawPreserved: outcome.sourceRawPreserved }),
        { inspected: true, sourceRawPreserved: true },
      );
      defineFinalAssertion(
        INTRINSIC_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
        'does not mutate Object or Object.prototype',
        () => outcome.objectIntrinsicsIntact,
        true,
      );
    });

    if (fixture.expected.canonicalEvidence === 'accepted' && fixture.expected.reducer === 'none') {
      it.todo('observes canonical evidence acceptance before known-field quarantine');
    }

    if (fixture.id === STRUCTURAL_CONTROL_CASE_ID) {
      it('keeps safe key near-misses, reserved words as values, and NFC-distinct keys canonical', () => {
        expect(structuralPositiveControlsAreExact(testedFixture)).toBe(true);
      });
    }
  });

  it.todo('verifies durable package evidence through a storage-location-neutral evidence API');
});

describe.sequential('G0S-OP direct ProjectStore structural boundary', () => {
  it('atomically rejects invalid batches and snapshots accepted caller values', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    try {
      expect({
        validFirst: await directMergeOrderIsAtomic('valid-first'),
        invalidFirst: await directMergeOrderIsAtomic('invalid-first'),
        aliases: await acceptedCallerAliasesAreIsolated(),
      }).toEqual({
        validFirst: true,
        invalidFirst: true,
        aliases: {
          localLiveExact: true,
          localDurableExact: true,
          mergeLiveExact: true,
          mergeDurableExact: true,
        },
      });
    } finally {
      now.mockRestore();
    }
  });
});

interface RelationOutcome {
  bothOpened: boolean;
  bothReported: boolean;
  bothVisible: boolean;
  orderIndependent: boolean;
  candidatesIndividuallyAccepted: boolean;
  sourceRawPreserved: boolean;
}

async function relationCandidateAcceptedThroughOpen(
  relation: OpCorpusRelation,
  wireJson: string,
  suffix: string,
): Promise<boolean> {
  const fs = new MemoryFS();
  const dir = `projects/relation-candidate-open-${relation.id}-${suffix}`;
  await ProjectStore.create(fs, dir, relation.id, USER);
  const logPath = `${dir}/ops/${relation.subject.actor}.jsonl`;
  await fs.writeText(logPath, `${wireJson}\n`);
  const store = await ProjectStore.open(fs, dir, USER);
  return (
    (await fs.readText(logPath)) === `${wireJson}\n` &&
    !store.loadErrors.some(({ file }) => file === logPath) &&
    subjectVisible(store, relation.subject) &&
    isDeepStrictEqual(matchingSubjectOp(store, relation.subject), JSON.parse(wireJson))
  );
}

async function relationCandidateAcceptedThroughPackage(
  relation: OpCorpusRelation,
  wireJson: string,
  suffix: string,
): Promise<boolean> {
  const fs = new MemoryFS();
  const dir = `projects/relation-candidate-package-${relation.id}-${suffix}`;
  const target = await ProjectStore.create(fs, dir, relation.id, USER);
  const manifestText = await fs.readText(`${dir}/lociview.json`);
  if (manifestText === null) throw new Error('relation candidate manifest setup failed');
  const path = `ops/${relation.subject.actor}.jsonl`;
  const text = `${wireJson}\n`;
  const zip = await writeZipEntries([
    { path: 'lociview.json', data: encoder.encode(manifestText) },
    { path, data: encoder.encode(text) },
  ]);
  const inspection = await inspectZip(zip);
  const sourceExact =
    inspection.opsErrorCount === 0 &&
    inspection.opsFiles.length === 1 &&
    inspection.opsFiles[0]?.path === path &&
    inspection.opsFiles[0]?.text === text &&
    inspection.ops.length === 1 &&
    isDeepStrictEqual(inspection.ops[0], JSON.parse(wireJson));
  await mergeFromInspection(fs, dir, target, inspection);
  const reopened = await ProjectStore.open(fs, dir, USER);
  return (
    sourceExact &&
    subjectVisible(reopened, relation.subject) &&
    isDeepStrictEqual(matchingSubjectOp(reopened, relation.subject), JSON.parse(wireJson))
  );
}

async function characterizeOpenRelation(
  relation: OpCorpusRelation,
  first: string,
  second: string,
  suffix: string,
): Promise<{
  opened: boolean;
  reported: boolean;
  visible: boolean;
  fields: unknown;
  sourceRawPreserved: boolean;
}> {
  const fs = new MemoryFS();
  const dir = `projects/relation-open-${relation.id}-${suffix}`;
  await ProjectStore.create(fs, dir, relation.id, USER);
  const logPath = `${dir}/ops/${relation.subject.actor}.jsonl`;
  await fs.writeText(logPath, `${first}\n${second}\n`);
  let store: ProjectStore | null = null;
  try {
    store = await ProjectStore.open(fs, dir, USER);
  } catch {
    // Product open failure is captured as opened=false.
  }
  let fields: unknown = null;
  if (store !== null) {
    try {
      fields = visibleEntities(store.state, relation.subject.kind).find(
        ({ id }) => id === relation.subject.id,
      )?.fields ?? null;
    } catch {
      fields = null;
    }
  }
  return {
    opened: store !== null,
    reported: store !== null && store.loadErrors.some(({ file }) => file === logPath),
    visible: subjectVisible(store, relation.subject),
    fields,
    sourceRawPreserved: (await fs.readText(logPath)) === `${first}\n${second}\n`,
  };
}

async function openRelationOutcome(relation: OpCorpusRelation): Promise<RelationOutcome> {
  const forward = await characterizeOpenRelation(
    relation,
    relation.firstWireJson,
    relation.secondWireJson,
    'forward',
  );
  const reverse = await characterizeOpenRelation(
    relation,
    relation.secondWireJson,
    relation.firstWireJson,
    'reverse',
  );
  const candidateResults = await Promise.all([
    relationCandidateAcceptedThroughOpen(relation, relation.firstWireJson, 'first'),
    relationCandidateAcceptedThroughOpen(relation, relation.secondWireJson, 'second'),
  ]);
  return {
    bothOpened: forward.opened && reverse.opened,
    bothReported: forward.reported && reverse.reported,
    bothVisible: forward.visible && reverse.visible,
    orderIndependent: isDeepStrictEqual(forward.fields, reverse.fields),
    candidatesIndividuallyAccepted: candidateResults.every(Boolean),
    sourceRawPreserved: forward.sourceRawPreserved && reverse.sourceRawPreserved,
  };
}

async function characterizePackageRelationOrder(
  relation: OpCorpusRelation,
  first: string,
  second: string,
  suffix: string,
): Promise<{
  targetReopened: boolean;
  reported: boolean;
  visible: boolean;
  fields: unknown;
  sourceRawPreserved: boolean;
}> {
  const fs = new MemoryFS();
  const dir = `projects/relation-package-${relation.id}-${suffix}`;
  const target = await ProjectStore.create(fs, dir, relation.id, USER);
  const manifestText = await fs.readText(`${dir}/lociview.json`);
  if (manifestText === null) throw new Error('relation target manifest setup failed');
  const zip = await writeZipEntries([
    { path: 'lociview.json', data: encoder.encode(manifestText) },
    {
      path: `ops/${relation.subject.actor}.jsonl`,
      data: encoder.encode(`${first}\n${second}\n`),
    },
  ]);
  const inspection = await inspectZip(zip);
  let mergeRejected = false;
  try {
    await mergeFromInspection(fs, dir, target, inspection);
  } catch {
    // A collision may safely reject the merge; target reopen is checked independently.
    mergeRejected = true;
  }
  let reopened: ProjectStore | null = null;
  try {
    reopened = await ProjectStore.open(fs, dir, USER);
  } catch {
    // Existing project open failure is captured below.
  }
  let fields: unknown = null;
  if (reopened !== null) {
    try {
      fields = visibleEntities(reopened.state, relation.subject.kind).find(
        ({ id }) => id === relation.subject.id,
      )?.fields ?? null;
    } catch {
      fields = null;
    }
  }
  return {
    targetReopened: reopened !== null,
    reported: inspection.opsErrorCount > 0 || mergeRejected,
    visible: subjectVisible(reopened, relation.subject),
    fields,
    sourceRawPreserved:
      inspection.opsFiles.length === 1 &&
      inspection.opsFiles[0]?.path === `ops/${relation.subject.actor}.jsonl` &&
      inspection.opsFiles[0]?.text === `${first}\n${second}\n`,
  };
}

interface LocalIncomingRelationOutcome {
  bothTargetsReopened: boolean;
  bothBaseCandidatesPreserved: boolean;
  bothMergesRejected: boolean;
  bothSourceRawPreserved: boolean;
}

async function characterizeLocalIncomingRelationOrder(
  relation: OpCorpusRelation,
  baseWireJson: string,
  incomingWireJson: string,
  suffix: string,
): Promise<{
  targetReopened: boolean;
  baseCandidatePreserved: boolean;
  mergeRejected: boolean;
  sourceRawPreserved: boolean;
}> {
  const fs = new MemoryFS();
  const dir = `projects/relation-local-incoming-${relation.id}-${suffix}`;
  await ProjectStore.create(fs, dir, relation.id, USER);
  const logPath = `${dir}/ops/${relation.subject.actor}.jsonl`;
  await fs.writeText(logPath, `${baseWireJson}\n`);
  const target = await ProjectStore.open(fs, dir, USER);
  const manifestText = await fs.readText(`${dir}/lociview.json`);
  if (manifestText === null) throw new Error('local/incoming relation manifest setup failed');
  const zip = await writeZipEntries([
    { path: 'lociview.json', data: encoder.encode(manifestText) },
    {
      path: `ops/${relation.subject.actor}.jsonl`,
      data: encoder.encode(`${incomingWireJson}\n`),
    },
  ]);
  const inspection = await inspectZip(zip);
  const incomingSourcePreserved =
    inspection.opsFiles.length === 1 &&
    inspection.opsFiles[0]?.path === `ops/${relation.subject.actor}.jsonl` &&
    inspection.opsFiles[0]?.text === `${incomingWireJson}\n`;
  let mergeRejected = false;
  try {
    await mergeFromInspection(fs, dir, target, inspection);
  } catch {
    // Current MergeReport has no operation-collision channel, so rejection is the only safe signal observable here.
    mergeRejected = true;
  }

  let reopened: ProjectStore | null = null;
  try {
    reopened = await ProjectStore.open(fs, dir, USER);
  } catch {
    // Existing target availability is asserted separately from collision disposition.
  }
  const sameKeyOps =
    reopened?.allOps.filter(
      (op) => op.actor === relation.subject.actor && op.op === relation.subject.op,
    ) ?? [];
  return {
    targetReopened: reopened !== null,
    baseCandidatePreserved:
      sameKeyOps.length === 1 && isDeepStrictEqual(sameKeyOps[0], JSON.parse(baseWireJson)),
    mergeRejected,
    sourceRawPreserved:
      incomingSourcePreserved && (await fs.readText(logPath)) === `${baseWireJson}\n`,
  };
}

async function localIncomingRelationOutcome(
  relation: OpCorpusRelation,
): Promise<LocalIncomingRelationOutcome> {
  const forward = await characterizeLocalIncomingRelationOrder(
    relation,
    relation.firstWireJson,
    relation.secondWireJson,
    'forward',
  );
  const reverse = await characterizeLocalIncomingRelationOrder(
    relation,
    relation.secondWireJson,
    relation.firstWireJson,
    'reverse',
  );
  return {
    bothTargetsReopened: forward.targetReopened && reverse.targetReopened,
    bothBaseCandidatesPreserved:
      forward.baseCandidatePreserved && reverse.baseCandidatePreserved,
    bothMergesRejected: forward.mergeRejected && reverse.mergeRejected,
    bothSourceRawPreserved: forward.sourceRawPreserved && reverse.sourceRawPreserved,
  };
}

async function packageRelationOutcome(relation: OpCorpusRelation): Promise<RelationOutcome> {
  const forward = await characterizePackageRelationOrder(
    relation,
    relation.firstWireJson,
    relation.secondWireJson,
    'forward',
  );
  const reverse = await characterizePackageRelationOrder(
    relation,
    relation.secondWireJson,
    relation.firstWireJson,
    'reverse',
  );
  const candidateResults = await Promise.all([
    relationCandidateAcceptedThroughPackage(relation, relation.firstWireJson, 'first'),
    relationCandidateAcceptedThroughPackage(relation, relation.secondWireJson, 'second'),
  ]);
  return {
    bothOpened: forward.targetReopened && reverse.targetReopened,
    bothReported: forward.reported && reverse.reported,
    bothVisible: forward.visible && reverse.visible,
    orderIndependent: isDeepStrictEqual(forward.fields, reverse.fields),
    candidatesIndividuallyAccepted: candidateResults.every(Boolean),
    sourceRawPreserved: forward.sourceRawPreserved && reverse.sourceRawPreserved,
  };
}

function relationDecision(
  outcome: RelationOutcome,
): Omit<
  RelationOutcome,
  'bothOpened' | 'candidatesIndividuallyAccepted' | 'sourceRawPreserved'
> {
  const {
    bothOpened: _opened,
    candidatesIndividuallyAccepted: _individual,
    sourceRawPreserved: _raw,
    ...decision
  } = outcome;
  return decision;
}

function expectedRelation(relation: OpCorpusRelation): RelationOutcome {
  const collision = relation.expected.decision === 'collision';
  return {
    bothOpened: true,
    bothReported: collision,
    bothVisible: !collision,
    orderIndependent: true,
    candidatesIndividuallyAccepted: true,
    sourceRawPreserved: true,
  };
}

describe.sequential('G0S-OP same-key relations', () => {
  describe.each(CORPUS.relations)('$id', (relation) => {
    describe('JSONL open order', () => {
      let outcome: RelationOutcome;
      beforeAll(async () => {
        outcome = await openRelationOutcome(relation);
      });
      defineFinalAssertion(
        relation.expected.decision === 'collision' ? 'xfail' : 'pass',
        'is order-independent and never silently resolves divergence',
        () => relationDecision(outcome),
        relationDecision(expectedRelation(relation)),
      );
      defineFinalAssertion(
        'pass',
        'keeps both source logs openable while deciding the relation',
        () => outcome.bothOpened,
        true,
      );
      defineFinalAssertion(
        'pass',
        'accepts both relation candidates individually before comparing their shared key',
        () => outcome.candidatesIndividuallyAccepted,
        true,
      );
      defineFinalAssertion(
        'pass',
        'preserves both ordered raw source lines exactly',
        () => outcome.sourceRawPreserved,
        true,
      );
    });

    describe('package inspect/merge order', () => {
      let outcome: RelationOutcome;
      beforeAll(async () => {
        outcome = await packageRelationOutcome(relation);
      });
      defineFinalAssertion(
        relation.expected.decision === 'collision' ? 'xfail' : 'pass',
        'uses the same relation decision in both input orders',
        () => relationDecision(outcome),
        relationDecision(expectedRelation(relation)),
      );
      defineFinalAssertion(
        'pass',
        'keeps both existing targets reopenable even when merge is rejected',
        () => outcome.bothOpened,
        true,
      );
      defineFinalAssertion(
        'pass',
        'accepts both package candidates individually before comparing their shared key',
        () => outcome.candidatesIndividuallyAccepted,
        true,
      );
      defineFinalAssertion(
        'pass',
        'inspects both ordered package source lines exactly',
        () => outcome.sourceRawPreserved,
        true,
      );
    });

    describe('existing target versus incoming package', () => {
      let outcome: LocalIncomingRelationOutcome;
      beforeAll(async () => {
        outcome = await localIncomingRelationOutcome(relation);
      });
      defineFinalAssertion(
        'pass',
        'keeps both existing targets reopenable',
        () => outcome.bothTargetsReopened,
        true,
      );
      defineFinalAssertion(
        'pass',
        'never appends the incoming same-key candidate without resolution',
        () => outcome.bothBaseCandidatesPreserved,
        true,
      );
      defineFinalAssertion(
        'pass',
        'preserves the exact active base and inspected incoming source in both orders',
        () => outcome.bothSourceRawPreserved,
        true,
      );
      defineFinalAssertion(
        relation.expected.decision === 'collision' ? 'xfail' : 'pass',
        'rejects divergent same-key input at the current report boundary',
        () => outcome.bothMergesRejected,
        relation.expected.decision === 'collision',
      );
    });
  });
});
