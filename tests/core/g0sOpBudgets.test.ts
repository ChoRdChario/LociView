import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { importNewProject, inspectZip, mergeFromInspection } from '../../src/assets/package';
import { parseHlc } from '../../src/core/hlc';
import { MAX_LINE_CHARS, parseOpsJsonl, serializeOps } from '../../src/core/jsonl';
import { actorIdFrom } from '../../src/core/ids';
import { MANIFEST_FORMAT, SCHEMA_VERSION } from '../../src/core/manifest';
import { reduce, versionVector } from '../../src/core/reduce';
import { LIMITS, type Op } from '../../src/core/schema';
import { ProjectStore, type DispatchInput, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import { writeDirectZip } from '../helpers/maliciousZip';

const encoder = new TextEncoder();
const USER: Identity = {
  userId: 'usr_00000000000000000000000090',
  deviceId: 'dev_00000000000000000000000090',
  displayName: 'operation budget characterization',
};
const ACTOR = actorIdFrom(USER.userId, USER.deviceId);
const PROJECT_ID = 'prj_00000000000000000000000090';
const BASE_CAPTION_ID = 'cap_00000000000000000000000090';
const INVALID_CAPTION_ID = 'cap_00000000000000000000000091';
const PROBE_CAPTION_ID = 'cap_00000000000000000000000092';
const VALID_CAPTION_ID = 'cap_00000000000000000000000093';
const FIXED_ISO = '2098-01-02T03:04:05.000Z';
const FIXED_NOW = Date.parse(FIXED_ISO);
const PROJECT_DIR = 'projects/g0s-op-budget';
const LOG_PATH = `${PROJECT_DIR}/ops/${ACTOR}.jsonl`;
const MANIFEST_TEXT = JSON.stringify({
  format: MANIFEST_FORMAT,
  schemaVersion: SCHEMA_VERSION,
  projectId: PROJECT_ID,
  name: 'operation budget characterization',
  createdAt: '2026-01-02T03:04:05.000Z',
  generator: 'LociView/test',
});
const BASE_OP: Op = {
  op: 1,
  hlc: `${FIXED_ISO}-0000-${ACTOR}`,
  actor: ACTOR,
  user: USER.userId,
  t: 'create',
  e: 'caption',
  id: BASE_CAPTION_ID,
  v: { title: 'baseline' },
};
const BASE_LINE = JSON.stringify(BASE_OP);
const BASE_LOG = `${BASE_LINE}\n`;
const BASE_STATE = reduce([BASE_OP]);
const PROBE_INPUT: DispatchInput = {
  t: 'create',
  e: 'caption',
  id: PROBE_CAPTION_ID,
  v: { title: 'post-rejection probe' },
};

type MutationKind = 'writeText' | 'appendText' | 'writeBytes' | 'remove';

interface FsMutation {
  kind: MutationKind;
  path: string;
}

class RecordingMemoryFS extends MemoryFS {
  readonly mutations: FsMutation[] = [];

  resetMutations(): void {
    this.mutations.length = 0;
  }

  mutationCountAt(path: string): number {
    return this.mutations.filter((mutation) => mutation.path === path).length;
  }

  override async writeText(path: string, text: string): Promise<void> {
    this.mutations.push({ kind: 'writeText', path });
    await super.writeText(path, text);
  }

  override async appendText(path: string, text: string): Promise<void> {
    this.mutations.push({ kind: 'appendText', path });
    await super.appendText(path, text);
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.mutations.push({ kind: 'writeBytes', path });
    await super.writeBytes(path, data);
  }

  override async remove(path: string): Promise<void> {
    this.mutations.push({ kind: 'remove', path });
    await super.remove(path);
  }
}

type BudgetCaseId = 'serialized-line' | 'direct-fields';

interface BudgetCase {
  id: BudgetCaseId;
  op: Op;
  dispatchInput: DispatchInput;
  wire: string;
  sourceLog: string;
}

interface DirectParseOutcome {
  baselineOnly: boolean;
  hasErrors: boolean;
}

interface OpenOutcome {
  openable: boolean;
  baselineOnly: boolean;
  baselineState: boolean;
  hasLoadErrors: boolean;
  rawTextUnchanged: boolean;
  rawBytesUnchanged: boolean;
}

interface PackageOutcome {
  deterministic: boolean;
  inspectionRawExact: boolean;
  inspectionBaselineOnly: boolean;
  inspectionHasErrors: boolean;
  newImportSafe: boolean;
  existingAuthorityUnchanged: boolean;
  existingReopenUnchanged: boolean;
}

interface LocalShapeOutcome {
  topLevelKeysExact: boolean;
  opExact: boolean;
  hlcExact: boolean;
  actorExact: boolean;
  userExact: boolean;
  tExact: boolean;
  eExact: boolean;
  idExact: boolean;
  dispatchExact: boolean;
  sourceExact: boolean;
  serializedSemanticExact: boolean;
  serializedPhysicalBudgetExact: boolean;
}

interface LocalOutcome {
  initialized: boolean;
  ordinaryShape: LocalShapeOutcome;
  baselineReopenable: boolean;
  modestBaselineRetainedAfterReopen: boolean;
  allOpsStateListenerUnchanged: boolean;
  activeLogMutationZeroAndByteExact: boolean;
  reopenAndNextOperationTwinEqual: boolean;
}

function bytesEqual(left: Uint8Array | null, right: Uint8Array | null): boolean {
  return left !== null && right !== null &&
    left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function hasActiveAuthorityMutation(fs: RecordingMemoryFS): boolean {
  const manifestPath = `${PROJECT_DIR}/lociview.json`;
  const opsPrefix = `${PROJECT_DIR}/ops/`;
  return fs.mutations.some(({ path }) =>
    path === manifestPath || (path.startsWith(opsPrefix) && path.endsWith('.jsonl')),
  );
}

async function activeLogInventory(fs: MemoryFS): Promise<Map<string, number[]>> {
  const inventory = new Map<string, number[]>();
  const paths = (await fs.list(`${PROJECT_DIR}/ops/`))
    .filter((path) => path.endsWith('.jsonl'))
    .sort();
  for (const path of paths) {
    const bytes = await fs.readBytes(path);
    if (bytes === null) throw new Error(`listed active log disappeared: ${path}`);
    inventory.set(path, Array.from(bytes));
  }
  return inventory;
}

function actorBoundProbesEquivalent(
  target: Op | null,
  targetActor: string,
  twin: Op | null,
  twinActor: string,
): boolean {
  if (target === null || twin === null) return false;
  let targetHlc: ReturnType<typeof parseHlc>;
  let twinHlc: ReturnType<typeof parseHlc>;
  try {
    targetHlc = parseHlc(target.hlc);
    twinHlc = parseHlc(twin.hlc);
  } catch {
    return false;
  }
  return target.actor === targetActor && targetHlc.actor === targetActor &&
    twin.actor === twinActor && twinHlc.actor === twinActor &&
    targetActor !== twinActor &&
    target.op === twin.op &&
    targetHlc.physical === twinHlc.physical &&
    targetHlc.counter === twinHlc.counter &&
    target.user === twin.user &&
    target.t === twin.t &&
    target.e === twin.e &&
    target.id === twin.id &&
    isDeepStrictEqual(target.v, twin.v);
}

function invalidOpWithValue(value: Record<string, unknown>): Op {
  return {
    op: 2,
    hlc: `${FIXED_ISO}-0001-${ACTOR}`,
    actor: ACTOR,
    user: USER.userId,
    t: 'create',
    e: 'caption',
    id: INVALID_CAPTION_ID,
    v: value,
  };
}

function budgetCase(id: BudgetCaseId, value: Record<string, unknown>): BudgetCase {
  const op = invalidOpWithValue(value);
  const wire = JSON.stringify(op);
  return {
    id,
    op,
    dispatchInput: {
      t: op.t,
      e: op.e,
      id: op.id,
      v: op.v,
    },
    wire,
    sourceLog: `${BASE_LINE}\n${wire}\n`,
  };
}

function lineBudgetCase(): BudgetCase {
  const empty = invalidOpWithValue({ futurePadding: '' });
  const emptyLength = JSON.stringify(empty).length;
  const paddingLength = MAX_LINE_CHARS + 1 - emptyLength;
  if (paddingLength < 1) throw new Error('MAX_LINE_CHARS is too small for the canonical fixture');
  return budgetCase('serialized-line', { futurePadding: 'x'.repeat(paddingLength) });
}

function fieldBudgetCase(): BudgetCase {
  const value = Object.fromEntries(Array.from(
    { length: LIMITS.maxFieldsPerOp + 1 },
    (_unused, index) => [`f${index.toString(36)}`, 'x'],
  ));
  return budgetCase('direct-fields', value);
}

const CASES: readonly BudgetCase[] = [lineBudgetCase(), fieldBudgetCase()];

async function seedProject(fs: MemoryFS): Promise<void> {
  await fs.writeText(`${PROJECT_DIR}/lociview.json`, MANIFEST_TEXT);
  await fs.writeText(LOG_PATH, BASE_LOG);
}

async function openOrNull(fs: MemoryFS): Promise<ProjectStore | null> {
  try {
    return await ProjectStore.open(fs, PROJECT_DIR, USER);
  } catch {
    return null;
  }
}

function characterizeDirectParse(fixture: BudgetCase): DirectParseOutcome {
  const parsed = parseOpsJsonl(fixture.sourceLog);
  return {
    baselineOnly: isDeepStrictEqual(parsed.ops, [BASE_OP]),
    hasErrors: parsed.errors.length > 0,
  };
}

async function characterizeOpen(fixture: BudgetCase): Promise<OpenOutcome> {
  const fs = new MemoryFS();
  await fs.writeText(`${PROJECT_DIR}/lociview.json`, MANIFEST_TEXT);
  await fs.writeText(LOG_PATH, fixture.sourceLog);
  const textBefore = await fs.readText(LOG_PATH);
  const bytesBefore = await fs.readBytes(LOG_PATH);
  const store = await openOrNull(fs);
  const textAfter = await fs.readText(LOG_PATH);
  const bytesAfter = await fs.readBytes(LOG_PATH);
  return {
    openable: store !== null,
    baselineOnly: store !== null && isDeepStrictEqual(store.allOps, [BASE_OP]),
    baselineState: store !== null && isDeepStrictEqual(store.state, BASE_STATE),
    hasLoadErrors: store !== null && store.loadErrors.some((entry) => entry.errors.length > 0),
    rawTextUnchanged: textBefore === fixture.sourceLog && textAfter === fixture.sourceLog,
    rawBytesUnchanged: bytesEqual(bytesBefore, bytesAfter),
  };
}

async function characterizePackage(fixture: BudgetCase): Promise<PackageOutcome> {
  const entries = [
    { path: 'lociview.json', data: encoder.encode(MANIFEST_TEXT) },
    { path: `ops/${ACTOR}.jsonl`, data: encoder.encode(fixture.sourceLog) },
  ];
  const zip = await writeDirectZip(entries);
  const repeatedZip = await writeDirectZip(entries);
  const inspection = await inspectZip(zip);
  const inspectionRawExact =
    inspection.opsFiles.length === 1 &&
    inspection.opsFiles[0]?.path === `ops/${ACTOR}.jsonl` &&
    inspection.opsFiles[0].text === fixture.sourceLog;
  const inspectionBaselineOnly = isDeepStrictEqual(inspection.ops, [BASE_OP]);
  const inspectionHasErrors = inspection.opsErrorCount > 0;

  const importedFs = new RecordingMemoryFS();
  const importedMarkerPath = `${PROJECT_DIR}/lociview.json`;
  let newImportSafe = false;
  try {
    await importNewProject(importedFs, PROJECT_DIR, inspection);
    const reopened = await openOrNull(importedFs);
    newImportSafe =
      reopened !== null &&
      isDeepStrictEqual(reopened.allOps, [BASE_OP]) &&
      isDeepStrictEqual(reopened.state, BASE_STATE);
  } catch {
    newImportSafe =
      importedFs.mutationCountAt(importedMarkerPath) === 0 &&
      !(await importedFs.exists(importedMarkerPath));
  }

  const targetFs = new RecordingMemoryFS();
  await seedProject(targetFs);
  const target = await ProjectStore.open(targetFs, PROJECT_DIR, USER);
  const manifestBefore = await targetFs.readBytes(`${PROJECT_DIR}/lociview.json`);
  const logBefore = await targetFs.readBytes(LOG_PATH);
  targetFs.resetMutations();
  let publishedNonBaselineState = false;
  const unsubscribe = target.subscribe((state) => {
    if (!isDeepStrictEqual(state, BASE_STATE)) publishedNonBaselineState = true;
  });
  try {
    try {
      await mergeFromInspection(targetFs, PROJECT_DIR, target, inspection);
    } catch {
      // A safe implementation may block the merge or surface a queued durability rejection.
    }
    try {
      await target.flush();
    } catch {
      // The final active authority and a fresh reopen below decide whether rejection was safe.
    }
  } finally {
    unsubscribe();
  }
  const existingAuthorityUnchanged =
    !hasActiveAuthorityMutation(targetFs) &&
    !publishedNonBaselineState &&
    bytesEqual(await targetFs.readBytes(`${PROJECT_DIR}/lociview.json`), manifestBefore) &&
    bytesEqual(await targetFs.readBytes(LOG_PATH), logBefore) &&
    isDeepStrictEqual(target.allOps, [BASE_OP]) &&
    isDeepStrictEqual(target.state, BASE_STATE);
  const targetReopened = await openOrNull(targetFs);
  const existingReopenUnchanged =
    targetReopened !== null &&
    isDeepStrictEqual(targetReopened.allOps, [BASE_OP]) &&
    isDeepStrictEqual(targetReopened.state, BASE_STATE);

  return {
    deterministic: bytesEqual(zip, repeatedZip),
    inspectionRawExact,
    inspectionBaselineOnly,
    inspectionHasErrors,
    newImportSafe,
    existingAuthorityUnchanged,
    existingReopenUnchanged,
  };
}

async function characterizeLocal(fixture: BudgetCase): Promise<LocalOutcome> {
  const targetFs = new RecordingMemoryFS();
  const twinFs = new RecordingMemoryFS();
  await Promise.all([seedProject(targetFs), seedProject(twinFs)]);
  const now = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  try {
    const target = await ProjectStore.open(targetFs, PROJECT_DIR, USER);
    const twin = await ProjectStore.open(twinFs, PROJECT_DIR, USER);
    const intendedLocalOp: Op = {
      op: 1,
      hlc: `${FIXED_ISO}-0001-${target.actorId}`,
      actor: target.actorId,
      user: USER.userId,
      ...fixture.dispatchInput,
    };
    const serializedLocal = serializeOps([intendedLocalOp]);
    const serializedLocalLine = serializedLocal.endsWith('\n')
      ? serializedLocal.slice(0, -1)
      : serializedLocal;
    let serializedLocalValue: unknown = null;
    try {
      serializedLocalValue = JSON.parse(serializedLocalLine);
    } catch {
      // The semantic and physical checks below remain false for malformed serialization.
    }
    const serializedLocalAscii =
      encoder.encode(serializedLocalLine).length === serializedLocalLine.length &&
      [...encoder.encode(serializedLocalLine)].every((byte) => byte <= 0x7f);
    const ordinaryShape: LocalShapeOutcome = {
      topLevelKeysExact: isDeepStrictEqual(
        Object.keys(intendedLocalOp).sort(),
        ['actor', 'e', 'hlc', 'id', 'op', 't', 'user', 'v'],
      ),
      opExact: intendedLocalOp.op === 1,
      hlcExact: intendedLocalOp.hlc === `${FIXED_ISO}-0001-${target.actorId}`,
      actorExact:
        intendedLocalOp.actor === target.actorId &&
        /^a_[0-9A-HJKMNP-TV-Z]{13}$/u.test(target.actorId),
      userExact: intendedLocalOp.user === USER.userId,
      tExact: intendedLocalOp.t === 'create',
      eExact: intendedLocalOp.e === 'caption',
      idExact: intendedLocalOp.id === INVALID_CAPTION_ID,
      dispatchExact: isDeepStrictEqual(fixture.dispatchInput, {
        t: 'create',
        e: 'caption',
        id: INVALID_CAPTION_ID,
        v: fixture.op.v,
      }),
      sourceExact: fixture.sourceLog === `${BASE_LINE}\n${fixture.wire}\n`,
      serializedSemanticExact: isDeepStrictEqual(serializedLocalValue, intendedLocalOp),
      serializedPhysicalBudgetExact:
        serializedLocal === `${serializedLocalLine}\n` &&
        !serializedLocalLine.includes('\n') &&
        serializedLocalLine.trim() === serializedLocalLine &&
        serializedLocalAscii &&
        (fixture.id === 'serialized-line'
          ? serializedLocalLine.length === MAX_LINE_CHARS + 1 &&
            Object.keys(intendedLocalOp.v ?? {}).length === 1
          : Object.keys(intendedLocalOp.v ?? {}).length === LIMITS.maxFieldsPerOp + 1 &&
            serializedLocalLine.length < MAX_LINE_CHARS),
    };
    const initialized =
      isDeepStrictEqual(target.allOps, [BASE_OP]) &&
      isDeepStrictEqual(target.state, BASE_STATE) &&
      isDeepStrictEqual(twin.allOps, [BASE_OP]) &&
      isDeepStrictEqual(twin.state, BASE_STATE) &&
      target.loadErrors.length === 0 && twin.loadErrors.length === 0 &&
      await targetFs.readText(LOG_PATH) === BASE_LOG &&
      await twinFs.readText(LOG_PATH) === BASE_LOG;
    const targetLogsBefore = await activeLogInventory(targetFs);

    let listenerCalls = 0;
    const unsubscribe = target.subscribe(() => {
      listenerCalls += 1;
    });
    targetFs.resetMutations();
    try {
      try {
        target.dispatch(fixture.dispatchInput);
      } catch {
        // Throw versus Result is not fixed; mutation effects below are the contract.
      }
      try {
        await target.flush();
      } catch {
        // Rejection may be the invalid-dispatch signal; later probe behavior detects poisoning.
      }
    } finally {
      unsubscribe();
    }

    const allOpsStateListenerUnchanged =
      isDeepStrictEqual(target.allOps, [BASE_OP]) &&
      isDeepStrictEqual(target.state, BASE_STATE) &&
      listenerCalls === 0;
    const activeLogMutationZeroAndByteExact =
      !hasActiveAuthorityMutation(targetFs) &&
      isDeepStrictEqual(await activeLogInventory(targetFs), targetLogsBefore);

    const targetReopened = await openOrNull(targetFs);
    const twinReopened = await openOrNull(twinFs);
    const baselineReopenable = targetReopened !== null && twinReopened !== null;
    const modestBaselineRetainedAfterReopen =
      targetReopened !== null &&
      isDeepStrictEqual(targetReopened.allOps, [BASE_OP]) &&
      isDeepStrictEqual(targetReopened.state, BASE_STATE);
    const reopenedTwinEqual =
      targetReopened !== null && twinReopened !== null &&
      isDeepStrictEqual(targetReopened.allOps, twinReopened.allOps) &&
      isDeepStrictEqual(targetReopened.state, twinReopened.state) &&
      isDeepStrictEqual(
        versionVector(targetReopened.allOps),
        versionVector(twinReopened.allOps),
      );

    let targetProbe: Op | null = null;
    let twinProbe: Op | null = null;
    let targetProbeDispatched = false;
    let twinProbeDispatched = false;
    let targetProbeFlushed = false;
    let twinProbeFlushed = false;
    try {
      targetProbe = target.dispatch(PROBE_INPUT);
      targetProbeDispatched = true;
    } catch {
      // A valid post-rejection dispatch must remain usable; failure is captured below.
    }
    try {
      twinProbe = twin.dispatch(PROBE_INPUT);
      twinProbeDispatched = true;
    } catch {
      // The control dispatch failure is captured rather than aborting characterization.
    }
    try {
      await target.flush();
      targetProbeFlushed = true;
    } catch {
      // A poisoned target durability queue must make the consistency outcome false.
    }
    try {
      await twin.flush();
      twinProbeFlushed = true;
    } catch {
      // A failed control durability queue must also make the consistency outcome false.
    }
    const nextOperationTwinEqual =
      targetProbeDispatched && twinProbeDispatched &&
      targetProbeFlushed && twinProbeFlushed &&
      actorBoundProbesEquivalent(
        targetProbe,
        target.actorId,
        twinProbe,
        twin.actorId,
      );

    return {
      initialized,
      ordinaryShape,
      baselineReopenable,
      modestBaselineRetainedAfterReopen,
      allOpsStateListenerUnchanged,
      activeLogMutationZeroAndByteExact,
      reopenAndNextOperationTwinEqual: reopenedTwinEqual && nextOperationTwinEqual,
    };
  } finally {
    now.mockRestore();
  }
}

async function modestValidDispatchRoundTrips(): Promise<boolean> {
  const fs = new MemoryFS();
  await seedProject(fs);
  const now = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  try {
    const store = await ProjectStore.open(fs, PROJECT_DIR, USER);
    const input: DispatchInput = {
      t: 'create',
      e: 'caption',
      id: VALID_CAPTION_ID,
      v: { title: 'modest valid dispatch' },
    };
    const expected: Op = {
      op: 1,
      hlc: `${FIXED_ISO}-0001-${store.actorId}`,
      actor: store.actorId,
      user: USER.userId,
      ...input,
    };
    const actual = store.dispatch(input);
    await store.flush();
    const reopened = await ProjectStore.open(fs, PROJECT_DIR, USER);
    const localLogPath = `${PROJECT_DIR}/ops/${store.actorId}.jsonl`;
    const baselineLog = await fs.readText(LOG_PATH);
    const localLog = await fs.readText(localLogPath);
    const parsedBaseline = baselineLog === null ? null : parseOpsJsonl(baselineLog);
    const parsedLocal = localLog === null ? null : parseOpsJsonl(localLog);
    const reopenedHasExactOps =
      reopened.allOps.length === 2 &&
      reopened.allOps.some((op) => isDeepStrictEqual(op, BASE_OP)) &&
      reopened.allOps.some((op) => isDeepStrictEqual(op, expected));
    return (
      isDeepStrictEqual(actual, expected) &&
      store.actorId !== ACTOR &&
      /^a_[0-9A-HJKMNP-TV-Z]{13}$/u.test(store.actorId) &&
      isDeepStrictEqual((await fs.list(`${PROJECT_DIR}/ops/`)).sort(), [LOG_PATH, localLogPath].sort()) &&
      baselineLog === BASE_LOG && localLog === serializeOps([expected]) &&
      parsedBaseline !== null && parsedBaseline.errors.length === 0 &&
      isDeepStrictEqual(parsedBaseline.ops, [BASE_OP]) &&
      parsedLocal !== null && parsedLocal.errors.length === 0 &&
      isDeepStrictEqual(parsedLocal.ops, [expected]) &&
      reopenedHasExactOps &&
      isDeepStrictEqual(reopened.state, reduce([BASE_OP, expected])) &&
      reopened.loadErrors.length === 0
    );
  } finally {
    now.mockRestore();
  }
}

describe.sequential('G0S-OP configured reload-budget parity', () => {
  let directResults: Record<BudgetCaseId, DirectParseOutcome>;
  let openResults: Record<BudgetCaseId, OpenOutcome>;
  let packageResults: Record<BudgetCaseId, PackageOutcome>;
  let localResults: Record<BudgetCaseId, LocalOutcome>;
  let modestValidRoundTrips = false;

  beforeAll(async () => {
    directResults = {} as Record<BudgetCaseId, DirectParseOutcome>;
    openResults = {} as Record<BudgetCaseId, OpenOutcome>;
    packageResults = {} as Record<BudgetCaseId, PackageOutcome>;
    localResults = {} as Record<BudgetCaseId, LocalOutcome>;
    for (const fixture of CASES) {
      directResults[fixture.id] = characterizeDirectParse(fixture);
      openResults[fixture.id] = await characterizeOpen(fixture);
      packageResults[fixture.id] = await characterizePackage(fixture);
      localResults[fixture.id] = await characterizeLocal(fixture);
    }
    modestValidRoundTrips = await modestValidDispatchRoundTrips();
  }, 30_000);

  it('builds only the two configured N+1 rejection fixtures with an otherwise common canonical envelope', () => {
    expect(CASES.map((fixture) => ({
      id: fixture.id,
      lineLength: fixture.wire.length,
      utf8ByteLength: encoder.encode(fixture.wire).length,
      directFields: Object.keys(fixture.op.v ?? {}).length,
      baselineFirst: fixture.sourceLog.startsWith(BASE_LOG),
      trimmed: fixture.wire.trim() === fixture.wire,
      ascii: [...encoder.encode(fixture.wire)].every((byte) => byte <= 0x7f),
    }))).toEqual([
      {
        id: 'serialized-line',
        lineLength: MAX_LINE_CHARS + 1,
        utf8ByteLength: MAX_LINE_CHARS + 1,
        directFields: 1,
        baselineFirst: true,
        trimmed: true,
        ascii: true,
      },
      {
        id: 'direct-fields',
        lineLength: CASES[1]!.wire.length,
        utf8ByteLength: CASES[1]!.wire.length,
        directFields: LIMITS.maxFieldsPerOp + 1,
        baselineFirst: true,
        trimmed: true,
        ascii: true,
      },
    ]);
    expect(CASES[1]!.wire.length).toBeLessThan(MAX_LINE_CHARS);
  });

  it('keeps a modest valid local dispatch visible and byte-reloadable', () => {
    expect(modestValidRoundTrips).toBe(true);
  });

  for (const fixture of CASES) {
    describe(fixture.id, () => {
      it('direct JSONL parsing retains only the modest baseline and reports a diagnostic', () => {
        expect(directResults[fixture.id]).toEqual({ baselineOnly: true, hasErrors: true });
      });

      it('workspace open preserves raw bytes while exposing only the modest baseline', () => {
        expect(openResults[fixture.id]).toEqual({
          openable: true,
          baselineOnly: true,
          baselineState: true,
          hasLoadErrors: true,
          rawTextUnchanged: true,
          rawBytesUnchanged: true,
        });
      });

      it('package inspection/import/merge keeps the invalid operation outside active authority', () => {
        expect(packageResults[fixture.id]).toEqual({
          deterministic: true,
          inspectionRawExact: true,
          inspectionBaselineOnly: true,
          inspectionHasErrors: true,
          newImportSafe: true,
          existingAuthorityUnchanged: true,
          existingReopenUnchanged: true,
        });
      });

      it('initializes the independent local shape and keeps the modest baseline reopenable', () => {
        expect({
          initialized: localResults[fixture.id].initialized,
          ordinaryShape: localResults[fixture.id].ordinaryShape,
          baselineReopenable: localResults[fixture.id].baselineReopenable,
          modestBaselineRetainedAfterReopen:
            localResults[fixture.id].modestBaselineRetainedAfterReopen,
        }).toEqual({
          initialized: true,
          ordinaryShape: {
            topLevelKeysExact: true,
            opExact: true,
            hlcExact: true,
            actorExact: true,
            userExact: true,
            tExact: true,
            eExact: true,
            idExact: true,
            dispatchExact: true,
            sourceExact: true,
            serializedSemanticExact: true,
            serializedPhysicalBudgetExact: true,
          },
          baselineReopenable: true,
          modestBaselineRetainedAfterReopen: true,
        });
      });

      it.fails('local rejection leaves allOps, state and listener publication unchanged', () => {
        expect(localResults[fixture.id].allOpsStateListenerUnchanged).toBe(true);
      });

      it.fails('local rejection does not mutate the active actor log and leaves its bytes exact', () => {
        expect(localResults[fixture.id].activeLogMutationZeroAndByteExact).toBe(true);
      });

      it.fails('reload stays twin-equal and the rejected attempt does not poison seq or HLC', () => {
        expect(localResults[fixture.id].reopenAndNextOperationTwinEqual).toBe(true);
      });
    });
  }

  it.todo('ratifies whether raw leading/trailing JSONL whitespace counts toward a v1 line budget');
  it.todo('ratifies recursive v1 depth, node, field, array and string budgets independently of these configured guards');
});
