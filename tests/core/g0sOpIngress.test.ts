import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { inspectZip, mergeFromInspection } from '../../src/assets/package';
import { writeZipEntries } from '../../src/assets/zipio';
import { visibleEntities } from '../../src/core/reduce';
import { ProjectStore, type DispatchInput, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import {
  loadOpCorpus,
  type OpCorpusCase,
  type OpCorpusRelation,
  type OpCorpusSubject,
} from '../helpers/g0sOpCorpus';

const CORPUS = loadOpCorpus();
const USER: Identity = {
  userId: 'usr_00000000000000000000000090',
  deviceId: 'dev_00000000000000000000000090',
  displayName: 'g0s corpus',
};
const encoder = new TextEncoder();

class RecordingMemoryFS extends MemoryFS {
  appendCalls = 0;

  resetAppendCalls(): void {
    this.appendCalls = 0;
  }

  override async appendText(path: string, text: string): Promise<void> {
    this.appendCalls += 1;
    await super.appendText(path, text);
  }
}

type DescriptorSnapshot = Map<PropertyKey, PropertyDescriptor>;

interface ObjectIntrinsicSnapshot {
  constructor: DescriptorSnapshot;
  prototype: DescriptorSnapshot;
}

function snapshotDescriptors(target: object): DescriptorSnapshot {
  return new Map(
    Reflect.ownKeys(target).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(target, key)!,
    ]),
  );
}

function descriptorsMatch(target: object, snapshot: DescriptorSnapshot): boolean {
  const currentKeys = Reflect.ownKeys(target);
  if (currentKeys.length !== snapshot.size) return false;
  return currentKeys.every((key) => {
    const expected = snapshot.get(key);
    const actual = Object.getOwnPropertyDescriptor(target, key);
    return expected !== undefined && actual !== undefined && isDeepStrictEqual(actual, expected);
  });
}

function restoreDescriptors(target: object, snapshot: DescriptorSnapshot): void {
  for (const key of Reflect.ownKeys(target)) {
    if (!snapshot.has(key)) Reflect.deleteProperty(target, key);
  }
  for (const [key, descriptor] of snapshot) {
    Object.defineProperty(target, key, descriptor);
  }
}

function snapshotObjectIntrinsics(): ObjectIntrinsicSnapshot {
  return {
    constructor: snapshotDescriptors(Object),
    prototype: snapshotDescriptors(Object.prototype),
  };
}

function objectIntrinsicsMatch(snapshot: ObjectIntrinsicSnapshot): boolean {
  return (
    descriptorsMatch(Object, snapshot.constructor) &&
    descriptorsMatch(Object.prototype, snapshot.prototype)
  );
}

function restoreObjectIntrinsics(snapshot: ObjectIntrinsicSnapshot): void {
  restoreDescriptors(Object, snapshot.constructor);
  restoreDescriptors(Object.prototype, snapshot.prototype);
}

type TestMode = 'pass' | 'xfail';

const OPEN_KNOWN_DEFECTS = new Set([
  'opaque-extra-top-level-member',
  'opaque-delete-with-value',
  'opaque-recursive-reserved-key',
  'opaque-invalid-calendar-hlc',
  'opaque-hlc-actor-mismatch',
  'opaque-known-title-control',
  'opaque-nonfinite-number',
  'opaque-nfc-colliding-keys',
  'opaque-duplicate-nested-key',
  'opaque-known-kind-wrong-id-prefix',
  'opaque-reserved-entity-kind',
  'opaque-reserved-entity-id',
  'opaque-direct-reserved-value-key',
]);

const INTRINSIC_KNOWN_DEFECTS = new Set([
  'opaque-reserved-entity-kind',
]);

const OPEN_FAILURE_KNOWN_DEFECTS = new Set([
  'opaque-invalid-calendar-hlc',
  'opaque-reserved-entity-id',
]);

const DISPATCH_QUEUE_ALREADY_SAFE = new Set([
  'opaque-reserved-entity-id',
]);

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
    rawPreserved: true,
    objectIntrinsicsIntact: true,
  };
}

async function characterizeOpen(fixture: OpCorpusCase): Promise<IngestOutcome> {
  const fs = new MemoryFS();
  const dir = `projects/open-${fixture.id}`;
  await ProjectStore.create(fs, dir, fixture.id, USER);
  const logPath = `${dir}/ops/${fixture.logActor}.jsonl`;
  await fs.writeText(logPath, `${fixture.wireJson}\n`);

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
      rawPreserved: (await fs.readText(logPath)) === `${fixture.wireJson}\n`,
      objectIntrinsicsIntact: objectIntrinsicsMatch(prototypeBefore),
    };
  } finally {
    restoreObjectIntrinsics(prototypeBefore);
  }
}

interface DispatchOutcome {
  memoryReducerAccepted: boolean;
  memoryVisible: boolean;
  memoryPayloadPreserved: boolean | null;
  durableLogChanged: boolean;
  appendCalls: number;
  listenerNotified: boolean;
  reopened: boolean;
  reopenedReducerAccepted: boolean;
  reopenedVisible: boolean;
  reopenedPayloadPreserved: boolean | null;
  objectIntrinsicsIntact: boolean;
}

function expectedDispatch(fixture: OpCorpusCase): DispatchOutcome {
  const accepted = fixture.expected.reducer !== 'none';
  return {
    memoryReducerAccepted: accepted,
    memoryVisible: fixture.expected.reducer === 'visible',
    memoryPayloadPreserved: accepted ? true : null,
    durableLogChanged: accepted,
    appendCalls: accepted ? 1 : 0,
    listenerNotified: accepted,
    reopened: true,
    reopenedReducerAccepted: accepted,
    reopenedVisible: fixture.expected.reducer === 'visible',
    reopenedPayloadPreserved: accepted ? true : null,
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

async function characterizeDispatch(fixture: OpCorpusCase): Promise<DispatchOutcome> {
  if (fixture.dispatchInputJson === null) throw new Error(`${fixture.id} has no dispatch input`);
  const fs = new RecordingMemoryFS();
  const dir = `projects/dispatch-${fixture.id}`;
  const store = await ProjectStore.create(fs, dir, fixture.id, USER);
  const logPath = `${dir}/ops/${store.actorId}.jsonl`;
  const beforeOps = store.allOps.length;
  const beforeKeys = new Set(store.allOps.map(operationKey));
  const beforeLog = await fs.readText(logPath);
  let listenerCalls = 0;
  const unsubscribe = store.subscribe(() => {
    listenerCalls += 1;
  });
  const input = JSON.parse(fixture.dispatchInputJson) as DispatchInput;
  fs.resetAppendCalls();
  const prototypeBefore = snapshotObjectIntrinsics();

  try {
    try {
      store.dispatch(input);
    } catch {
      // Throw versus Result is not fixed; only memory/queue/durable effects are asserted.
    }
    try {
      await store.flush();
    } catch {
      // A rejected write queue is observed through append count, durable text, and reopen.
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
    return {
      memoryReducerAccepted: added.length === 1,
      memoryVisible: localSubject !== null && subjectVisible(store, localSubject),
      memoryPayloadPreserved: dispatchPayloadMatches(input, actual),
      durableLogChanged: (await fs.readText(logPath)) !== beforeLog,
      appendCalls: fs.appendCalls,
      listenerNotified: listenerCalls > 0,
      reopened: reopened !== null,
      reopenedReducerAccepted: reopenedAdded.length === 1,
      reopenedVisible: reopenedSubject !== null && subjectVisible(reopened, reopenedSubject),
      reopenedPayloadPreserved: dispatchPayloadMatches(input, reopenedActual),
      objectIntrinsicsIntact,
    };
  } finally {
    unsubscribe();
    restoreObjectIntrinsics(prototypeBefore);
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
    objectIntrinsicsIntact: true,
  };
}

async function characterizePackage(fixture: OpCorpusCase): Promise<PackageOutcome> {
  const fs = new MemoryFS();
  const dir = `projects/package-${fixture.id}`;
  const target = await ProjectStore.create(fs, dir, fixture.id, USER);
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
): Omit<DispatchOutcome, 'appendCalls' | 'reopened' | 'objectIntrinsicsIntact'> {
  const {
    appendCalls: _appendCalls,
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

describe.sequential('G0S-OP shared operation corpus', () => {
  describe.each(CORPUS.cases)('$id', (fixture) => {
    describe('JSONL open ingress', () => {
      let outcome: IngestOutcome;
      beforeAll(async () => {
        outcome = await characterizeOpen(fixture);
      });
      defineFinalAssertion(
        OPEN_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
        'matches the approved accept/quarantine oracle',
        () => ingestDecision(outcome),
        ingestDecision(expectedIngest(fixture)),
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
          outcome = await characterizeDispatch(fixture);
        });
        defineFinalAssertion(
          fixture.expected.reducer === 'none' ? 'xfail' : 'pass',
          'is atomic and matches the approved payload oracle',
          () => dispatchDecision(outcome),
          dispatchDecision(expectedDispatch(fixture)),
        );
        defineFinalAssertion(
          'pass',
          'keeps the durable project reopenable independently of the operation decision',
          () => outcome.reopened,
          true,
        );
        if (fixture.expected.reducer === 'none') {
          defineFinalAssertion(
            DISPATCH_QUEUE_ALREADY_SAFE.has(fixture.id) ? 'pass' : 'xfail',
            'does not enqueue a rejected local operation',
            () => outcome.appendCalls,
            0,
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
        outcome = await characterizePackage(fixture);
      });
      defineFinalAssertion(
        OPEN_KNOWN_DEFECTS.has(fixture.id) ? 'xfail' : 'pass',
        'matches the same oracle through inspect, merge, and reopen',
        () => packageDecision(outcome),
        packageDecision(expectedPackage(fixture)),
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
  });

  it.todo('verifies durable package evidence through a storage-location-neutral evidence API');
});

interface RelationOutcome {
  bothOpened: boolean;
  bothReported: boolean;
  bothVisible: boolean;
  orderIndependent: boolean;
}

async function characterizeOpenRelation(
  relation: OpCorpusRelation,
  first: string,
  second: string,
  suffix: string,
): Promise<{ opened: boolean; reported: boolean; visible: boolean; fields: unknown }> {
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
  return {
    bothOpened: forward.opened && reverse.opened,
    bothReported: forward.reported && reverse.reported,
    bothVisible: forward.visible && reverse.visible,
    orderIndependent: isDeepStrictEqual(forward.fields, reverse.fields),
  };
}

async function characterizePackageRelationOrder(
  relation: OpCorpusRelation,
  first: string,
  second: string,
  suffix: string,
): Promise<{ targetReopened: boolean; reported: boolean; visible: boolean; fields: unknown }> {
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
  };
}

interface LocalIncomingRelationOutcome {
  bothTargetsReopened: boolean;
  bothBaseCandidatesPreserved: boolean;
  bothMergesRejected: boolean;
}

async function characterizeLocalIncomingRelationOrder(
  relation: OpCorpusRelation,
  baseWireJson: string,
  incomingWireJson: string,
  suffix: string,
): Promise<{ targetReopened: boolean; baseCandidatePreserved: boolean; mergeRejected: boolean }> {
  const fs = new MemoryFS();
  const dir = `projects/relation-local-incoming-${relation.id}-${suffix}`;
  await ProjectStore.create(fs, dir, relation.id, USER);
  await fs.writeText(
    `${dir}/ops/${relation.subject.actor}.jsonl`,
    `${baseWireJson}\n`,
  );
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
  return {
    bothOpened: forward.targetReopened && reverse.targetReopened,
    bothReported: forward.reported && reverse.reported,
    bothVisible: forward.visible && reverse.visible,
    orderIndependent: isDeepStrictEqual(forward.fields, reverse.fields),
  };
}

function relationDecision(outcome: RelationOutcome): Omit<RelationOutcome, 'bothOpened'> {
  const { bothOpened: _opened, ...decision } = outcome;
  return decision;
}

function expectedRelation(relation: OpCorpusRelation): RelationOutcome {
  const collision = relation.expected.decision === 'collision';
  return {
    bothOpened: true,
    bothReported: collision,
    bothVisible: !collision,
    orderIndependent: true,
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
        relation.expected.decision === 'collision' ? 'xfail' : 'pass',
        'rejects divergent same-key input at the current report boundary',
        () => outcome.bothMergesRejected,
        relation.expected.decision === 'collision',
      );
    });
  });
});
