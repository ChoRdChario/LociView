import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  inspectZip,
  mergeFromInspection,
  type ZipInspection,
} from '../../src/assets/package';
import { addModelAsset, replaceModelAsset } from '../../src/assets/modelAsset';
import { readZipEntries, writeZipEntries } from '../../src/assets/zipio';
import { formatHlc, parseHlc } from '../../src/core/hlc';
import { actorIdFrom } from '../../src/core/ids';
import { parseOpsJsonl, serializeOps } from '../../src/core/jsonl';
import { parseManifest } from '../../src/core/manifest';
import { reduce, versionVector, visibleEntities, type ProjectState } from '../../src/core/reduce';
import { validateOp, type Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import type { WorkspaceFS } from '../../src/platform/fs';
import {
  ModeledTransactionGateFS,
  type ModeledFileSnapshot,
  type ModeledGateObservation,
  type ModeledPublication,
} from '../helpers/modeledTransactionGateFs';

const OWNER: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000080',
  deviceId: 'dev_00000000000000000000000080',
  displayName: 'transaction setup owner',
});
const MERGER: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000081',
  deviceId: 'dev_00000000000000000000000081',
  displayName: 'modeled merge context',
});
const REPLACER: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000082',
  deviceId: 'dev_00000000000000000000000082',
  displayName: 'modeled replacement context',
});
const REMOTE: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000083',
  deviceId: 'dev_00000000000000000000000083',
  displayName: 'incoming package actor',
});
const AUDITOR: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000084',
  deviceId: 'dev_00000000000000000000000084',
  displayName: 'transaction closure auditor',
});

const DIR = 'projects/modeled-package-replacement';
const FIXED_NOW = 1_800_000_100_000;
const INCOMING_ASSET_ID = 'ast_00000000000000000000000085';
const encoder = new TextEncoder();
const BASE_BYTES = encoder.encode('solid transaction-base\nendsolid transaction-base\n');
const REPLACEMENT_BYTES = encoder.encode(
  'solid transaction-replacement\nfacet normal 0 0 1\nendfacet\nendsolid transaction-replacement\n',
);
const INCOMING_BYTES = encoder.encode('solid transaction-incoming\nendsolid transaction-incoming\n');

type TransactionOrder = 'merge-first' | 'replacement-first';
type CandidateKind = 'old' | 'merge' | 'replace' | 'combined';

interface Settled<T> {
  rejected: boolean;
  value: T | null;
}

interface PublishedProjection {
  state: ProjectState;
  ops: readonly Op[];
  vector: Readonly<Record<string, number>>;
}

interface ConcurrencyFixture {
  gateFs: ModeledTransactionGateFS;
  setupFs: WorkspaceFS;
  firstFs: WorkspaceFS;
  secondFs: WorkspaceFS;
  auditFs: WorkspaceFS;
  mergeFs: WorkspaceFS;
  replacementFs: WorkspaceFS;
  mergeContext: 'first' | 'second';
  replacementContext: 'first' | 'second';
  mergeStore: ProjectStore;
  replacementStore: ProjectStore;
  inspection: ZipInspection;
  manifestText: string;
  baselineOps: readonly Op[];
  baselineState: ProjectState;
  baselineVector: Readonly<Record<string, number>>;
  baselineLogs: ReadonlyMap<string, string>;
  baseAssetId: string;
  captionId: string;
  oldPath: string;
  replacementPath: string | null;
  incomingPath: string;
  incomingOp: Op;
  mergeLogPath: string;
  replacementLogPath: string;
  facadesAreDistinct: boolean;
  fixtureShapeIsExact: boolean;
}

interface ScenarioResult {
  initialized: boolean;
  finalAuthoritySafe: boolean;
  finalKind: CandidateKind | null;
  transactionSerializedOrRejected: boolean;
  publicationClosureSafe: boolean;
}

function bytesEqual(actual: Uint8Array | null | undefined, expected: Uint8Array): boolean {
  return actual !== null && actual !== undefined &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function opKey(op: Op): string {
  return `${op.actor}#${op.op}`;
}

function operationsByKey(ops: readonly Op[]): Op[] {
  return [...ops].sort((left, right) => opKey(left).localeCompare(opKey(right)));
}

function logInventoryAndActorsAreExact(
  logs: ReadonlyMap<string, string>,
  expected: ReadonlyMap<string, string>,
): boolean {
  if (!isDeepStrictEqual([...logs.keys()].sort(), [...expected.keys()].sort())) return false;
  for (const [path, text] of logs) {
    const actor = path.slice(path.lastIndexOf('/') + 1, -'.jsonl'.length);
    const parsed = parseOpsJsonl(text);
    if (parsed.errors.length !== 0 || parsed.ops.some((op) => op.actor !== actor)) return false;
  }
  return true;
}

async function settleValue<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { rejected: false, value: await promise };
  } catch {
    return { rejected: true, value: null };
  }
}

async function settleTransaction<T>(
  action: () => Promise<T>,
  store: ProjectStore,
): Promise<Settled<T>> {
  const actionOutcome = await settleValue(action());
  const flushOutcome = await settleValue(store.flush());
  return {
    rejected: actionOutcome.rejected || flushOutcome.rejected,
    value: actionOutcome.value,
  };
}

function cloneProjection(store: ProjectStore): PublishedProjection {
  return {
    state: structuredClone(store.state),
    ops: operationsByKey(structuredClone([...store.allOps])),
    vector: { ...store.vector },
  };
}

async function readActiveLogs(fs: WorkspaceFS): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const path of (await fs.list(`${DIR}/ops/`)).filter((item) => item.endsWith('.jsonl'))) {
    const text = await fs.readText(path);
    if (text === null) throw new Error(`listed active log is unreadable: ${path}`);
    result.set(path, text);
  }
  return result;
}

async function snapshotAll(fs: WorkspaceFS): Promise<Map<string, Uint8Array | null>> {
  const result = new Map<string, Uint8Array | null>();
  for (const path of await fs.list('')) result.set(path, await fs.readBytes(path));
  return result;
}

function expectedOperations(
  fixture: ConcurrencyFixture,
  replacementOp: Op | null,
  kind: CandidateKind,
): Op[] | null {
  const result = [...fixture.baselineOps];
  if (kind === 'merge' || kind === 'combined') result.push(fixture.incomingOp);
  if (kind === 'replace' || kind === 'combined') {
    if (replacementOp === null) return null;
    result.push(replacementOp);
  }
  return operationsByKey(result);
}

function expectedLogs(
  fixture: ConcurrencyFixture,
  replacementOp: Op | null,
  kind: CandidateKind,
): Map<string, string> | null {
  const result = new Map(fixture.baselineLogs);
  if (kind === 'merge' || kind === 'combined') {
    result.set(fixture.mergeLogPath, serializeOps([fixture.incomingOp]));
  }
  if (kind === 'replace' || kind === 'combined') {
    if (replacementOp === null) return null;
    result.set(fixture.replacementLogPath, serializeOps([replacementOp]));
  }
  return result;
}

function referencedBytesAreExact(
  fixture: ConcurrencyFixture,
  state: ProjectState,
  files: ReadonlyMap<string, Uint8Array | null>,
): boolean {
  const expectedByPath = new Map<string, Uint8Array>([
    [fixture.oldPath, BASE_BYTES],
    [fixture.incomingPath, INCOMING_BYTES],
  ]);
  if (fixture.replacementPath !== null) {
    expectedByPath.set(fixture.replacementPath, REPLACEMENT_BYTES);
  }
  for (const asset of visibleEntities(state, 'asset')) {
    const path = asset.fields.path;
    const size = asset.fields.size;
    const expected = typeof path === 'string' ? expectedByPath.get(path) : undefined;
    if (
      typeof path !== 'string' ||
      expected === undefined ||
      size !== expected.length ||
      !bytesEqual(files.get(`${DIR}/${path}`), expected)
    ) {
      return false;
    }
  }
  return true;
}

function candidateSemanticRolesAreExact(
  fixture: ConcurrencyFixture,
  state: ProjectState,
  kind: CandidateKind,
): boolean {
  const base = state.byKind.asset?.[fixture.baseAssetId];
  const caption = state.byKind.caption?.[fixture.captionId];
  const incoming = state.byKind.asset?.[INCOMING_ASSET_ID];
  if (base === undefined || caption === undefined) return false;
  const expectsReplacement = kind === 'replace' || kind === 'combined';
  const expectsMerge = kind === 'merge' || kind === 'combined';
  const anchor = caption.fields.anchor as { modelAssetId?: unknown } | undefined;
  const baseExact =
    (!expectsReplacement || fixture.replacementPath !== null) &&
    base.fields.path === (expectsReplacement ? fixture.replacementPath : fixture.oldPath) &&
    base.fields.originalName === (expectsReplacement ? 'replacement.stl' : 'baseline.stl') &&
    base.fields.size === (expectsReplacement ? REPLACEMENT_BYTES.length : BASE_BYTES.length) &&
    isDeepStrictEqual(base.fields.transform, { scale: 2.25, upAxis: 'Z' }) &&
    base.fields.pinScale === 1.75 &&
    anchor?.modelAssetId === fixture.baseAssetId;
  const incomingExact = expectsMerge
    ? incoming !== undefined &&
      incoming.fields.path === fixture.incomingPath &&
      incoming.fields.originalName === 'incoming.stl' &&
      incoming.fields.size === INCOMING_BYTES.length &&
      isDeepStrictEqual(incoming.fields.transform, { scale: 1, upAxis: 'Y' }) &&
      incoming.fields.pinScale === 1
    : incoming === undefined;
  return baseExact && incomingExact;
}

function projectionMatchesCandidate(
  fixture: ConcurrencyFixture,
  replacementOp: Op | null,
  projection: PublishedProjection,
  files: ReadonlyMap<string, Uint8Array | null>,
  kind: CandidateKind,
): boolean {
  const ops = expectedOperations(fixture, replacementOp, kind);
  if (ops === null) return false;
  return (
    isDeepStrictEqual(operationsByKey(projection.ops), ops) &&
    isDeepStrictEqual(projection.state, reduce(ops)) &&
    isDeepStrictEqual(projection.vector, versionVector(ops)) &&
    candidateSemanticRolesAreExact(fixture, projection.state, kind) &&
    referencedBytesAreExact(fixture, projection.state, files)
  );
}

function projectionCandidateKind(
  fixture: ConcurrencyFixture,
  replacementOp: Op | null,
  projection: PublishedProjection,
  files: ReadonlyMap<string, Uint8Array | null>,
): CandidateKind | null {
  const matches = (['old', 'merge', 'replace', 'combined'] as const)
    .filter((kind) => projectionMatchesCandidate(fixture, replacementOp, projection, files, kind));
  return matches.length === 1 ? matches[0]! : null;
}

async function authorityCandidateKind(
  fixture: ConcurrencyFixture,
  replacementOp: Op | null,
): Promise<CandidateKind | null> {
  const markerPaths = (await fixture.auditFs.list('projects/'))
    .filter((path) => path.endsWith('/lociview.json'))
    .sort();
  if (!isDeepStrictEqual(markerPaths, [`${DIR}/lociview.json`])) return null;
  const manifestText = await fixture.auditFs.readText(`${DIR}/lociview.json`);
  if (manifestText === null) return null;
  try {
    if (!isDeepStrictEqual(parseManifest(manifestText), fixture.mergeStore.manifest)) return null;
  } catch {
    return null;
  }

  let reopened: ProjectStore;
  try {
    reopened = await ProjectStore.open(fixture.auditFs, DIR, AUDITOR);
  } catch {
    return null;
  }
  if (reopened.loadErrors.length !== 0) return null;
  const logs = await readActiveLogs(fixture.auditFs);
  const files = await snapshotAll(fixture.auditFs);
  const projection = cloneProjection(reopened);
  const matches: CandidateKind[] = [];
  for (const kind of ['old', 'merge', 'replace', 'combined'] as const) {
    const expected = expectedLogs(fixture, replacementOp, kind);
    if (
      expected !== null &&
      logInventoryAndActorsAreExact(logs, expected) &&
      projectionMatchesCandidate(fixture, replacementOp, projection, files, kind)
    ) {
      matches.push(kind);
    }
  }
  return matches.length === 1 ? matches[0]! : null;
}

function validateReplacementOp(fixture: ConcurrencyFixture): Op | null {
  const baselineKeys = new Set(fixture.baselineOps.map(opKey));
  const candidates = fixture.replacementStore.allOps.filter((op) =>
    op.actor === fixture.replacementStore.actorId && !baselineKeys.has(opKey(op)));
  if (candidates.length !== 1) return null;
  const op = candidates[0]!;
  let parsed;
  try {
    parsed = parseHlc(op.hlc);
  } catch {
    return null;
  }
  const path = op.v?.path;
  if (
    typeof path !== 'string' ||
    !path.startsWith('models/') ||
    !path.endsWith('.stl') ||
    path.includes('..') ||
    path.includes('\\') ||
    path === fixture.oldPath ||
    path === fixture.incomingPath
  ) {
    return null;
  }
  const expectedValue = {
    path,
    originalName: 'replacement.stl',
    size: REPLACEMENT_BYTES.length,
    optimizedPath: '',
    optimizedSize: 0,
  };
  if (
    validateOp(op) &&
    op.actor === fixture.replacementStore.actorId &&
    op.user === REPLACER.userId &&
    op.op === 1 &&
    op.t === 'update' &&
    op.e === 'asset' &&
    op.id === fixture.baseAssetId &&
    parsed.actor === op.actor &&
    parsed.physical === FIXED_NOW &&
    formatHlc(parsed.physical, parsed.counter, parsed.actor) === op.hlc &&
    isDeepStrictEqual(op.v, expectedValue)
  ) {
    fixture.replacementPath = path;
    return structuredClone(op);
  }
  return null;
}

function candidateContains(kind: CandidateKind, transaction: 'merge' | 'replace'): boolean {
  if (kind === 'combined') return true;
  return kind === transaction;
}

function outcomeAllowsCandidate(
  kind: CandidateKind | null,
  mergeOutcome: Settled<unknown>,
  replacementOutcome: Settled<unknown>,
): boolean {
  if (kind === null) return false;
  if (!mergeOutcome.rejected && !candidateContains(kind, 'merge')) return false;
  if (!replacementOutcome.rejected && !candidateContains(kind, 'replace')) return false;
  return true;
}

async function buildFixture(
  order: TransactionOrder,
  gateFs = new ModeledTransactionGateFS(),
): Promise<ConcurrencyFixture> {
  const setupFs = gateFs.context('setup');
  const firstFs = gateFs.context('first');
  const secondFs = gateFs.context('second');
  const auditFs = gateFs.context('audit');
  const mergeContext = order === 'merge-first' ? 'first' : 'second';
  const replacementContext = order === 'replacement-first' ? 'first' : 'second';
  const mergeFs = mergeContext === 'first' ? firstFs : secondFs;
  const replacementFs = replacementContext === 'first' ? firstFs : secondFs;

  const setupStore = await ProjectStore.create(
    setupFs,
    DIR,
    'modeled package and replacement transaction',
    OWNER,
  );
  const baseAssetId = await addModelAsset(setupFs, DIR, setupStore, 'baseline.stl', BASE_BYTES);
  const captionId = setupStore.createEntity('caption', {
    title: 'transaction-stable caption',
    anchor: { modelAssetId: baseAssetId, position: [1, 2, 3] },
  });
  setupStore.updateEntity('asset', baseAssetId, {
    transform: { scale: 2.25, upAxis: 'Z' },
    pinScale: 1.75,
  });
  await setupStore.flush();

  const manifestText = await setupFs.readText(`${DIR}/lociview.json`);
  if (manifestText === null) throw new Error('transaction fixture is missing its manifest');
  const baselineOps = operationsByKey(setupStore.allOps);
  const baselineState = structuredClone(setupStore.state);
  const baselineVector = { ...setupStore.vector };
  const baselineLogs = await readActiveLogs(setupFs);
  const baseAsset = setupStore.state.byKind.asset?.[baseAssetId];
  const caption = setupStore.state.byKind.caption?.[captionId];
  const oldPath = baseAsset?.fields.path;
  if (typeof oldPath !== 'string') throw new Error('transaction fixture lacks its baseline asset path');

  const incomingActor = actorIdFrom(REMOTE.userId, REMOTE.deviceId);
  const incomingPath = `models/${INCOMING_ASSET_ID}.stl`;
  const incomingOp: Op = {
    op: 1,
    hlc: formatHlc(FIXED_NOW - 1_000, 0, incomingActor),
    actor: incomingActor,
    user: REMOTE.userId,
    t: 'create',
    e: 'asset',
    id: INCOMING_ASSET_ID,
    v: {
      kind: 'model',
      path: incomingPath,
      originalName: 'incoming.stl',
      mime: '',
      size: INCOMING_BYTES.length,
      transform: { scale: 1, upAxis: 'Y' },
      pinScale: 1,
    },
  };
  const incomingText = serializeOps([incomingOp]);
  const packageEntries = [
    { path: 'lociview.json', data: encoder.encode(manifestText) },
    { path: `ops/${incomingActor}.jsonl`, data: encoder.encode(incomingText) },
    { path: incomingPath, data: INCOMING_BYTES },
  ];
  const packageBytes = await writeZipEntries(packageEntries);
  const rawEntries = await readZipEntries(packageBytes);
  const inspection = await inspectZip(packageBytes);

  // This exact orphan removes the already-characterized merge blob-before-notify
  // defect, leaving only the cross-context replacement/cleanup boundary here.
  await setupFs.writeBytes(`${DIR}/${incomingPath}`, INCOMING_BYTES);

  const mergeStore = await ProjectStore.open(mergeFs, DIR, MERGER);
  const replacementStore = await ProjectStore.open(replacementFs, DIR, REPLACER);
  const mergeLogPath = `${DIR}/ops/${incomingActor}.jsonl`;
  const replacementLogPath = `${DIR}/ops/${replacementStore.actorId}.jsonl`;
  const actors = new Set([
    setupStore.actorId,
    mergeStore.actorId,
    replacementStore.actorId,
    incomingActor,
    actorIdFrom(AUDITOR.userId, AUDITOR.deviceId),
  ]);
  const parsedBaseline = [...baselineLogs.entries()].map(([path, text]) => ({
    path,
    parsed: parseOpsJsonl(text),
  }));
  const rawEntryMap = new Map(rawEntries.map((entry) => [entry.path, entry.data]));
  const anchor = caption?.fields.anchor as { modelAssetId?: unknown } | undefined;
  const fixtureShapeIsExact =
    actors.size === 5 &&
    baseAssetId !== INCOMING_ASSET_ID &&
    oldPath !== incomingPath &&
    !bytesEqual(BASE_BYTES, INCOMING_BYTES) &&
    !bytesEqual(BASE_BYTES, REPLACEMENT_BYTES) &&
    !bytesEqual(INCOMING_BYTES, REPLACEMENT_BYTES) &&
    validateOp(incomingOp) &&
    incomingOp.actor === incomingActor &&
    incomingOp.hlc.endsWith(`-${incomingActor}`) &&
    baseAsset !== undefined &&
    baseAsset.fields.originalName === 'baseline.stl' &&
    baseAsset.fields.size === BASE_BYTES.length &&
    isDeepStrictEqual(baseAsset.fields.transform, { scale: 2.25, upAxis: 'Z' }) &&
    baseAsset.fields.pinScale === 1.75 &&
    anchor?.modelAssetId === baseAssetId &&
    rawEntries.length === 3 &&
    isDeepStrictEqual([...rawEntryMap.keys()].sort(), packageEntries.map((entry) => entry.path).sort()) &&
    packageEntries.every((entry) => bytesEqual(rawEntryMap.get(entry.path), entry.data)) &&
    inspection.kind === 'lociview' &&
    inspection.opsErrorCount === 0 &&
    inspection.opsFiles.length === 1 &&
    inspection.opsFiles[0]?.path === `ops/${incomingActor}.jsonl` &&
    inspection.opsFiles[0]?.text === incomingText &&
    isDeepStrictEqual(inspection.ops, [incomingOp]) &&
    inspection.binaries.length === 1 &&
    inspection.binaries[0]?.path === incomingPath &&
    bytesEqual(inspection.binaries[0]?.data, INCOMING_BYTES) &&
    inspection.manifest !== null &&
    isDeepStrictEqual(inspection.manifest, parseManifest(manifestText)) &&
    parsedBaseline.every(({ path, parsed }) =>
      parsed.errors.length === 0 &&
      parsed.ops.every((op) => path.endsWith(`/ops/${op.actor}.jsonl`))) &&
    bytesEqual(await auditFs.readBytes(`${DIR}/${oldPath}`), BASE_BYTES) &&
    bytesEqual(await auditFs.readBytes(`${DIR}/${incomingPath}`), INCOMING_BYTES);

  return {
    gateFs,
    setupFs,
    firstFs,
    secondFs,
    auditFs,
    mergeFs,
    replacementFs,
    mergeContext,
    replacementContext,
    mergeStore,
    replacementStore,
    inspection,
    manifestText,
    baselineOps,
    baselineState,
    baselineVector,
    baselineLogs,
    baseAssetId,
    captionId,
    oldPath,
    replacementPath: null,
    incomingPath,
    incomingOp,
    mergeLogPath,
    replacementLogPath,
    facadesAreDistinct:
      setupFs !== firstFs && firstFs !== secondFs && secondFs !== auditFs && mergeFs !== replacementFs,
    fixtureShapeIsExact,
  };
}

const decoder = new TextDecoder();

function fileAuthorityCandidateKind(
  fixture: ConcurrencyFixture,
  replacementOp: Op | null,
  files: ReadonlyMap<string, Uint8Array | null>,
): CandidateKind | null {
  const markerPaths = [...files.keys()]
    .filter((path) => path.startsWith('projects/') && path.endsWith('/lociview.json'))
    .sort();
  if (!isDeepStrictEqual(markerPaths, [`${DIR}/lociview.json`])) return null;
  const manifestBytes = files.get(`${DIR}/lociview.json`);
  if (manifestBytes === null || manifestBytes === undefined) return null;
  const manifestText = decoder.decode(manifestBytes);
  try {
    if (!isDeepStrictEqual(parseManifest(manifestText), fixture.mergeStore.manifest)) return null;
  } catch {
    return null;
  }

  const logs = new Map<string, string>();
  const parsedOps: Op[] = [];
  for (const [path, bytes] of files) {
    if (!path.startsWith(`${DIR}/ops/`) || !path.endsWith('.jsonl')) continue;
    if (bytes === null) return null;
    const text = decoder.decode(bytes);
    const parsed = parseOpsJsonl(text);
    const actor = path.slice(path.lastIndexOf('/') + 1, -'.jsonl'.length);
    if (parsed.errors.length !== 0 || parsed.ops.some((op) => op.actor !== actor)) return null;
    logs.set(path, text);
    parsedOps.push(...parsed.ops);
  }

  const matches: CandidateKind[] = [];
  for (const kind of ['old', 'merge', 'replace', 'combined'] as const) {
    const expectedOps = expectedOperations(fixture, replacementOp, kind);
    const expectedLogMap = expectedLogs(fixture, replacementOp, kind);
    if (
      expectedOps !== null &&
      expectedLogMap !== null &&
      logInventoryAndActorsAreExact(logs, expectedLogMap) &&
      isDeepStrictEqual(operationsByKey(parsedOps), expectedOps) &&
      candidateSemanticRolesAreExact(fixture, reduce(expectedOps), kind) &&
      referencedBytesAreExact(fixture, reduce(expectedOps), files)
    ) {
      matches.push(kind);
    }
  }
  return matches.length === 1 ? matches[0]! : null;
}

function publicationHistoryIsSafe(
  fixture: ConcurrencyFixture,
  replacementOp: Op | null,
  publications: readonly ModeledPublication<PublishedProjection>[],
  observation: ModeledGateObservation,
  mergeOutcome: Settled<unknown>,
  replacementOutcome: Settled<unknown>,
): boolean {
  const ordered = [...publications].sort((left, right) => left.tick - right.tick);
  if (ordered.length < 2) return false;
  if (ordered.some((publication) =>
    projectionCandidateKind(fixture, replacementOp, publication.value, publication.files) === null)) {
    return false;
  }

  const mergePublished = ordered.some((publication) => {
    if (publication.context !== fixture.mergeContext) return false;
    const kind = projectionCandidateKind(fixture, replacementOp, publication.value, publication.files);
    return kind === 'merge' || kind === 'combined';
  });
  const replacementPublished = ordered.some((publication) => {
    if (publication.context !== fixture.replacementContext) return false;
    const kind = projectionCandidateKind(fixture, replacementOp, publication.value, publication.files);
    return kind === 'replace' || kind === 'combined';
  });
  if (!mergeOutcome.rejected && !mergePublished) return false;
  if (!replacementOutcome.rejected && !replacementPublished) return false;

  for (const snapshot of observation.snapshots) {
    if (fileAuthorityCandidateKind(fixture, replacementOp, snapshot.files) === null) return false;
    for (const context of ['first', 'second'] as const) {
      const latest = ordered
        .filter((publication) => publication.context === context && publication.tick <= snapshot.tick)
        .at(-1);
      if (
        latest === undefined ||
        projectionCandidateKind(fixture, replacementOp, latest.value, snapshot.files) === null
      ) {
        return false;
      }
    }
  }
  return true;
}

function trackedPaths(
  fixture: ConcurrencyFixture,
  transaction: 'merge' | 'replace',
) {
  if (transaction === 'merge') {
    return [{
      path: fixture.mergeLogPath,
      required: true,
      contributesToOrdering: true,
    }];
  }
  return [
    {
      path: fixture.replacementLogPath,
      required: true,
      contributesToOrdering: true,
    },
    {
      path: `${DIR}/${fixture.oldPath}`,
      required: false,
      contributesToOrdering: false,
    },
  ];
}

function orderingIsSerialized(
  fixture: ConcurrencyFixture,
  observation: ModeledGateObservation,
): boolean {
  if (fixture.replacementPath === null) return false;
  const pathsFor = (transaction: 'merge' | 'replace'): readonly string[] =>
    transaction === 'merge'
      ? [fixture.mergeLogPath]
      : [fixture.replacementLogPath, `${DIR}/${fixture.replacementPath}`];
  const firstTransaction = fixture.mergeContext === 'first' ? 'merge' : 'replace';
  const secondTransaction = firstTransaction === 'merge' ? 'replace' : 'merge';
  const firstPaths = new Set(pathsFor(firstTransaction));
  const secondPaths = new Set(pathsFor(secondTransaction));
  const firstCommits = observation.events
    .filter((event) =>
      event.context === 'first' && event.phase === 'commit' && firstPaths.has(event.path))
    .map((event) => event.tick);
  const firstCommittedPaths = new Set(observation.events
    .filter((event) =>
      event.context === 'first' && event.phase === 'commit' && firstPaths.has(event.path))
    .map((event) => event.path));
  const secondStarts = observation.events
    .filter((event) =>
      event.context === 'second' && event.phase === 'start' && secondPaths.has(event.path))
    .map((event) => event.tick);
  const secondStartedPaths = new Set(observation.events
    .filter((event) =>
      event.context === 'second' && event.phase === 'start' && secondPaths.has(event.path))
    .map((event) => event.path));
  return (
    firstCommittedPaths.size === firstPaths.size &&
    secondStartedPaths.size === secondPaths.size &&
    Math.max(...firstCommits) < Math.min(...secondStarts)
  );
}

async function runScenario(order: TransactionOrder): Promise<ScenarioResult> {
  const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  try {
    const fixture = await buildFixture(order);
    const initialKind = await authorityCandidateKind(fixture, null);
    const publications: Array<Promise<ModeledPublication<PublishedProjection>>> = [];
    const recordMerge = (): void => {
      publications.push(fixture.gateFs.capturePublication(
        fixture.mergeContext,
        cloneProjection(fixture.mergeStore),
      ));
    };
    const recordReplacement = (): void => {
      publications.push(fixture.gateFs.capturePublication(
        fixture.replacementContext,
        cloneProjection(fixture.replacementStore),
      ));
    };
    const unsubscribeMerge = fixture.mergeStore.subscribe(recordMerge);
    const unsubscribeReplacement = fixture.replacementStore.subscribe(recordReplacement);
    recordMerge();
    recordReplacement();

    const firstTransaction = order === 'merge-first' ? 'merge' : 'replace';
    const secondTransaction = order === 'merge-first' ? 'replace' : 'merge';
    const armed = fixture.gateFs.arm({
      gatePath: firstTransaction === 'merge'
        ? fixture.mergeLogPath
        : fixture.replacementLogPath,
      first: trackedPaths(fixture, firstTransaction),
      second: trackedPaths(fixture, secondTransaction),
      timeoutMs: 150,
    });

    const mergeAction = async (): Promise<unknown> =>
      mergeFromInspection(fixture.mergeFs, DIR, fixture.mergeStore, fixture.inspection);
    const replacementAction = async (): Promise<void> => {
      await replaceModelAsset(
        fixture.replacementFs,
        DIR,
        fixture.replacementStore,
        fixture.baseAssetId,
        'replacement.stl',
        REPLACEMENT_BYTES,
      );
    };
    const run = (transaction: 'merge' | 'replace'): Promise<Settled<unknown>> =>
      transaction === 'merge'
        ? settleTransaction(mergeAction, fixture.mergeStore)
        : settleTransaction(replacementAction, fixture.replacementStore);

    let firstSettledBeforeGate = false;
    let firstOutcome!: Settled<unknown>;
    let secondOutcome!: Settled<unknown>;
    try {
      const firstPromise = run(firstTransaction);
      const progress = await Promise.race([
        armed.reached.then(() => 'reached' as const),
        firstPromise.then(() => 'settled' as const),
      ]);
      firstSettledBeforeGate = progress === 'settled';
      if (firstSettledBeforeGate) armed.abort();
      const secondPromise = run(secondTransaction);
      [firstOutcome, secondOutcome] = await Promise.all([firstPromise, secondPromise]);
    } finally {
      armed.abort();
      unsubscribeMerge();
      unsubscribeReplacement();
    }

    const [mergeFlush, replacementFlush] = await Promise.all([
      settleValue(fixture.mergeStore.flush()),
      settleValue(fixture.replacementStore.flush()),
    ]);
    const observation = await armed.finish();
    const capturedPublications = await Promise.all(publications);
    const outcomeByTransaction = new Map([
      [firstTransaction, firstOutcome],
      [secondTransaction, secondOutcome],
    ] as const);
    const mergeActionOutcome = outcomeByTransaction.get('merge')!;
    const replacementActionOutcome = outcomeByTransaction.get('replace')!;
    const mergeOutcome: Settled<unknown> = {
      rejected: mergeActionOutcome.rejected || mergeFlush.rejected,
      value: mergeActionOutcome.value,
    };
    const replacementOutcome: Settled<unknown> = {
      rejected: replacementActionOutcome.rejected || replacementFlush.rejected,
      value: replacementActionOutcome.value,
    };
    const replacementOp = validateReplacementOp(fixture);
    const finalKind = await authorityCandidateKind(fixture, replacementOp);
    const finalAuthoritySafe = outcomeAllowsCandidate(finalKind, mergeOutcome, replacementOutcome);
    const secondEffectiveOutcome = secondTransaction === 'merge' ? mergeOutcome : replacementOutcome;
    const transactionSerializedOrRejected = finalKind === 'combined'
      ? orderingIsSerialized(fixture, observation)
      : finalAuthoritySafe;
    const publicationClosureSafe = publicationHistoryIsSafe(
      fixture,
      replacementOp,
      capturedPublications,
      observation,
      mergeOutcome,
      replacementOutcome,
    );
    const firstMissingAllowed = firstOutcome.rejected || observation.missingRequired.first.length === 0;
    const secondMissingAllowed = secondEffectiveOutcome.rejected || observation.missingRequired.second.length === 0;
    const replacementWriteCommitted = fixture.replacementPath !== null && observation.events.some((event) =>
      event.context === fixture.replacementContext &&
      event.phase === 'commit' &&
      event.path === `${DIR}/${fixture.replacementPath}`);
    const replacementBindingIsDisjoint = fixture.replacementPath !== null &&
      new Set([fixture.oldPath, fixture.incomingPath, fixture.replacementPath]).size === 3;
    const releaseModeIsValid = firstSettledBeforeGate
      ? firstOutcome.rejected && observation.releaseMode === 'abort'
      : observation.releaseMode === 'overlap' || observation.releaseMode === 'timeout';
    const initialized =
      fixture.facadesAreDistinct &&
      fixture.fixtureShapeIsExact &&
      initialKind === 'old' &&
      observation.inFlight === 0 &&
      releaseModeIsValid &&
      firstMissingAllowed &&
      secondMissingAllowed &&
      (replacementOutcome.rejected || replacementOp !== null) &&
      (replacementOutcome.rejected || replacementWriteCommitted) &&
      (replacementOutcome.rejected || replacementBindingIsDisjoint) &&
      capturedPublications.length >= 2;

    return {
      initialized,
      finalAuthoritySafe,
      finalKind,
      transactionSerializedOrRejected,
      publicationClosureSafe,
    };
  } finally {
    dateSpy.mockRestore();
  }
}

async function controlMutation(
  fs: WorkspaceFS,
  method: 'appendText' | 'writeText' | 'writeBytes' | 'remove',
  path: string,
): Promise<void> {
  if (method === 'appendText') return fs.appendText(path, 'append control');
  if (method === 'writeText') return fs.writeText(path, 'write control');
  if (method === 'writeBytes') return fs.writeBytes(path, encoder.encode('bytes control'));
  return fs.remove(path);
}

interface GateControlResult {
  facadesDistinct: boolean;
  fullSnapshots: boolean;
  releaseMode: ModeledGateObservation['releaseMode'];
  serialized: boolean;
  gateCommit: number | null;
  secondStart: number | null;
  missingRequired: number;
  publicationCapturedAtCall: boolean;
}

async function exerciseGateControl(
  method: 'appendText' | 'writeText' | 'writeBytes' | 'remove',
  mode: 'overlap' | 'timeout',
): Promise<GateControlResult> {
  const owner = new ModeledTransactionGateFS();
  const setup = owner.context('setup');
  const first = owner.context('first');
  const second = owner.context('second');
  const audit = owner.context('audit');
  const firstPath = `control/${method}/first`;
  const secondPath = `control/${method}/second`;
  const privatePath = `private/${method}/evidence`;
  await setup.writeText(firstPath, 'seed first');
  await setup.writeText(secondPath, 'seed second');
  await setup.writeText(privatePath, 'private evidence');
  const pointPath = `control/${method}/point-in-time`;
  await setup.writeText(pointPath, 'before capture');
  const pointCapture = owner.capturePublication('first', { token: method });
  await setup.writeText(pointPath, 'after capture');
  const armed = owner.arm({
    gatePath: firstPath,
    first: [{ path: firstPath, required: true, contributesToOrdering: true }],
    second: [{ path: secondPath, required: true, contributesToOrdering: true }],
    timeoutMs: 10,
  });
  const firstPromise = controlMutation(first, method, firstPath);
  await armed.reached;
  let secondPromise: Promise<void>;
  if (mode === 'timeout') {
    await firstPromise;
    secondPromise = controlMutation(second, method, secondPath);
  } else {
    secondPromise = controlMutation(second, method, secondPath);
  }
  await Promise.all([firstPromise, secondPromise]);
  armed.abort();
  const observation = await armed.finish();
  const captured = await pointCapture;
  const fullSnapshots = observation.snapshots.length === 2 &&
    observation.snapshots.every((snapshot) =>
      bytesEqual(snapshot.files.get(privatePath), encoder.encode('private evidence')));
  return {
    facadesDistinct: setup !== first && first !== second && second !== audit,
    fullSnapshots,
    releaseMode: observation.releaseMode,
    serialized: observation.serialized,
    gateCommit: observation.gateCommit,
    secondStart: observation.firstSecondStart,
    missingRequired:
      observation.missingRequired.first.length + observation.missingRequired.second.length,
    publicationCapturedAtCall:
      bytesEqual(captured.files.get(pointPath), encoder.encode('before capture')),
  };
}

interface OracleControlResult {
  candidateClassifiersAreExact: boolean;
  outcomeTableIsExact: boolean;
  healthyPublicationHistoryIsSafe: boolean;
  stagingAndDeferredCleanupAreAllowed: boolean;
  unsafeAuthorityVariantsAreRejected: boolean;
}

function syntheticCandidateFiles(
  fixture: ConcurrencyFixture,
  replacementOp: Op,
  initialFiles: ReadonlyMap<string, Uint8Array | null>,
  kind: CandidateKind,
): Map<string, Uint8Array | null> {
  if (fixture.replacementPath === null) {
    throw new Error('synthetic candidate requires a validated replacement path');
  }
  const files = new Map(
    [...initialFiles].map(([path, bytes]) => [path, bytes === null ? null : new Uint8Array(bytes)]),
  );
  const logs = expectedLogs(fixture, replacementOp, kind);
  if (logs === null) throw new Error(`missing synthetic logs for ${kind}`);
  for (const [path, text] of logs) files.set(path, encoder.encode(text));
  if (kind === 'replace' || kind === 'combined') {
    files.set(`${DIR}/${fixture.replacementPath}`, new Uint8Array(REPLACEMENT_BYTES));
  }
  return files;
}

function syntheticProjection(
  fixture: ConcurrencyFixture,
  replacementOp: Op,
  kind: CandidateKind,
): PublishedProjection {
  const ops = expectedOperations(fixture, replacementOp, kind);
  if (ops === null) throw new Error(`missing synthetic operations for ${kind}`);
  return { state: reduce(ops), ops, vector: versionVector(ops) };
}

async function runOracleControls(): Promise<OracleControlResult> {
  const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  try {
    const fixture = await buildFixture('merge-first');
    const initialFiles = await snapshotAll(fixture.auditFs);
    await replaceModelAsset(
      fixture.replacementFs,
      DIR,
      fixture.replacementStore,
      fixture.baseAssetId,
      'replacement.stl',
      REPLACEMENT_BYTES,
    );
    await fixture.replacementStore.flush();
    const replacementOp = validateReplacementOp(fixture);
    if (replacementOp === null) throw new Error('oracle control lacks a valid replacement operation');

    const kinds = ['old', 'merge', 'replace', 'combined'] as const;
    const files = new Map(kinds.map((kind) => [
      kind,
      syntheticCandidateFiles(fixture, replacementOp, initialFiles, kind),
    ]));
    const projections = new Map(kinds.map((kind) => [
      kind,
      syntheticProjection(fixture, replacementOp, kind),
    ]));
    const candidateClassifiersAreExact = kinds.every((kind) =>
      projectionCandidateKind(fixture, replacementOp, projections.get(kind)!, files.get(kind)!) === kind &&
      fileAuthorityCandidateKind(fixture, replacementOp, files.get(kind)!) === kind);

    const fulfilled: Settled<unknown> = { rejected: false, value: null };
    const rejected: Settled<unknown> = { rejected: true, value: null };
    const allowed = (
      merge: Settled<unknown>,
      replace: Settled<unknown>,
      expected: readonly CandidateKind[],
    ): boolean => kinds.every((kind) =>
      outcomeAllowsCandidate(kind, merge, replace) === expected.includes(kind));
    const outcomeTableIsExact =
      allowed(fulfilled, fulfilled, ['combined']) &&
      allowed(fulfilled, rejected, ['merge', 'combined']) &&
      allowed(rejected, fulfilled, ['replace', 'combined']) &&
      allowed(rejected, rejected, kinds);

    const publications: Array<ModeledPublication<PublishedProjection>> = [
      { tick: 1, context: 'first', value: projections.get('old')!, files: files.get('old')! },
      { tick: 2, context: 'second', value: projections.get('old')!, files: files.get('old')! },
      { tick: 3, context: fixture.mergeContext, value: projections.get('merge')!, files: files.get('merge')! },
      { tick: 4, context: fixture.replacementContext, value: projections.get('replace')!, files: files.get('replace')! },
    ];
    const event = {
      tick: 5,
      callId: 1,
      context: 'first' as const,
      phase: 'commit' as const,
      method: 'appendText' as const,
      path: fixture.mergeLogPath,
      required: true,
      contributesToOrdering: true,
    };
    const snapshot: ModeledFileSnapshot = {
      tick: 5,
      event,
      files: files.get('combined')!,
    };
    const observation: ModeledGateObservation = {
      releaseMode: 'timeout',
      gateStart: 1,
      gateCommit: 5,
      lastFirstCommit: 5,
      firstSecondStart: 6,
      serialized: true,
      missingRequired: { first: [], second: [] },
      inFlight: 0,
      events: [event],
      snapshots: [snapshot],
    };
    const healthyPublicationHistoryIsSafe = publicationHistoryIsSafe(
      fixture,
      replacementOp,
      publications,
      observation,
      fulfilled,
      fulfilled,
    );

    const privateFiles = new Map(files.get('combined')!);
    privateFiles.set('staging/transaction/lociview.json', encoder.encode('private staging marker'));
    privateFiles.set('private/transaction/orphan.bin', encoder.encode('unreferenced orphan'));
    const privateStagingAllowed =
      fileAuthorityCandidateKind(fixture, replacementOp, privateFiles) === 'combined' &&
      projectionCandidateKind(
        fixture,
        replacementOp,
        projections.get('combined')!,
        privateFiles,
      ) === 'combined';

    const replacementFirstFixture: ConcurrencyFixture = {
      ...fixture,
      mergeContext: 'second',
      replacementContext: 'first',
    };
    const cleanupEvents = [
      {
        tick: 1,
        callId: 1,
        context: 'first' as const,
        phase: 'commit' as const,
        method: 'writeBytes' as const,
        path: `${DIR}/${fixture.replacementPath}`,
        required: false,
        contributesToOrdering: false,
      },
      {
        tick: 2,
        callId: 2,
        context: 'first' as const,
        phase: 'commit' as const,
        method: 'appendText' as const,
        path: fixture.replacementLogPath,
        required: true,
        contributesToOrdering: true,
      },
      {
        tick: 3,
        callId: 3,
        context: 'second' as const,
        phase: 'start' as const,
        method: 'appendText' as const,
        path: fixture.mergeLogPath,
        required: true,
        contributesToOrdering: true,
      },
      {
        tick: 4,
        callId: 4,
        context: 'first' as const,
        phase: 'commit' as const,
        method: 'remove' as const,
        path: `${DIR}/${fixture.oldPath}`,
        required: false,
        contributesToOrdering: false,
      },
    ];
    const cleanupOrdering: ModeledGateObservation = {
      releaseMode: 'timeout',
      gateStart: 1,
      gateCommit: 2,
      lastFirstCommit: 2,
      firstSecondStart: 3,
      serialized: true,
      missingRequired: { first: [], second: [] },
      inFlight: 0,
      events: cleanupEvents,
      snapshots: [],
    };
    const cleanupExcludedFromOrdering = orderingIsSerialized(
      replacementFirstFixture,
      cleanupOrdering,
    );

    const combinedWithoutOld = new Map(files.get('combined')!);
    combinedWithoutOld.delete(`${DIR}/${fixture.oldPath}`);
    const combinedPublications: Array<ModeledPublication<PublishedProjection>> = [
      {
        tick: 1,
        context: 'first',
        value: projections.get('combined')!,
        files: files.get('combined')!,
      },
      {
        tick: 2,
        context: 'second',
        value: projections.get('combined')!,
        files: files.get('combined')!,
      },
    ];
    const cleanupEvent = { ...cleanupEvents[3]!, tick: 3 };
    const cleanupHistory: ModeledGateObservation = {
      ...cleanupOrdering,
      events: [cleanupEvent],
      snapshots: [{ tick: 3, event: cleanupEvent, files: combinedWithoutOld }],
    };
    const deferredCleanupSafe = publicationHistoryIsSafe(
      fixture,
      replacementOp,
      combinedPublications,
      cleanupHistory,
      fulfilled,
      fulfilled,
    );

    const extraLog = new Map(files.get('combined')!);
    const extraActor = actorIdFrom(AUDITOR.userId, AUDITOR.deviceId);
    const extraOp: Op = {
      op: 1,
      hlc: formatHlc(FIXED_NOW - 2_000, 0, extraActor),
      actor: extraActor,
      user: AUDITOR.userId,
      t: 'create',
      e: 'caption',
      id: 'cap_00000000000000000000000086',
      v: { title: 'valid but unexpected active log' },
    };
    extraLog.set(`${DIR}/ops/${extraActor}.jsonl`, encoder.encode(serializeOps([extraOp])));
    const extraEmptyLog = new Map(files.get('combined')!);
    extraEmptyLog.set(`${DIR}/ops/a_000000000000F.jsonl`, new Uint8Array());
    const publicMarker = new Map(files.get('combined')!);
    publicMarker.set('projects/.staging/job/lociview.json', encoder.encode(fixture.manifestText));
    const corruptBlob = new Map(files.get('combined')!);
    const corruptReplacement = new Uint8Array(REPLACEMENT_BYTES);
    corruptReplacement[0] = corruptReplacement[0]! ^ 0xff;
    corruptBlob.set(`${DIR}/${fixture.replacementPath}`, corruptReplacement);
    const staleReplacementOp: Op = {
      ...structuredClone(replacementOp),
      hlc: formatHlc(FIXED_NOW - 10_000, 0, replacementOp.actor),
    };
    const staleFiles = syntheticCandidateFiles(
      fixture,
      staleReplacementOp,
      initialFiles,
      'replace',
    );
    const staleProjection = syntheticProjection(fixture, staleReplacementOp, 'replace');

    const reformatted = new Map(files.get('combined')!);
    reformatted.set(
      `${DIR}/lociview.json`,
      encoder.encode(JSON.stringify(parseManifest(fixture.manifestText))),
    );
    for (const [path, bytes] of [...reformatted]) {
      if (!path.startsWith(`${DIR}/ops/`) || !path.endsWith('.jsonl') || bytes === null) continue;
      const parsed = parseOpsJsonl(decoder.decode(bytes));
      if (parsed.errors.length !== 0) throw new Error(`oracle control cannot reformat ${path}`);
      const reordered = parsed.ops.map((op) => JSON.stringify({
        actor: op.actor,
        user: op.user,
        hlc: op.hlc,
        op: op.op,
        id: op.id,
        e: op.e,
        t: op.t,
        ...(op.v === undefined ? {} : { v: op.v }),
      })).join('\n');
      reformatted.set(path, encoder.encode(`  ${reordered.replaceAll('\n', '\n  ')}  \n`));
    }
    const semanticallyReformattedAuthorityIsAccepted =
      fileAuthorityCandidateKind(fixture, replacementOp, reformatted) === 'combined';
    const unsafeAuthorityVariantsAreRejected =
      validateOp(extraOp) &&
      fileAuthorityCandidateKind(fixture, replacementOp, extraLog) === null &&
      fileAuthorityCandidateKind(fixture, replacementOp, extraEmptyLog) === null &&
      fileAuthorityCandidateKind(fixture, replacementOp, publicMarker) === null &&
      fileAuthorityCandidateKind(fixture, replacementOp, corruptBlob) === null &&
      projectionCandidateKind(
        fixture,
        replacementOp,
        projections.get('combined')!,
        corruptBlob,
      ) === null &&
      validateOp(staleReplacementOp) &&
      fileAuthorityCandidateKind(fixture, staleReplacementOp, staleFiles) === null &&
      projectionCandidateKind(
        fixture,
        staleReplacementOp,
        staleProjection,
        staleFiles,
      ) === null;
    return {
      candidateClassifiersAreExact,
      outcomeTableIsExact,
      healthyPublicationHistoryIsSafe,
      stagingAndDeferredCleanupAreAllowed:
        privateStagingAllowed &&
        cleanupExcludedFromOrdering &&
        deferredCleanupSafe &&
        semanticallyReformattedAuthorityIsAccepted,
      unsafeAuthorityVariantsAreRejected,
    };
  } finally {
    dateSpy.mockRestore();
  }
}

describe.sequential('modeled transaction gate helper controls', () => {
  let overlap: GateControlResult[];
  let timeout: GateControlResult;
  let oracle: OracleControlResult;

  beforeAll(async () => {
    overlap = [];
    for (const method of ['appendText', 'writeText', 'writeBytes', 'remove'] as const) {
      overlap.push(await exerciseGateControl(method, 'overlap'));
    }
    timeout = await exerciseGateControl('appendText', 'timeout');
    oracle = await runOracleControls();
  });

  it('uses distinct facades, one event clock and full point-in-time inventory for every mutation method', () => {
    expect(overlap.every((result) =>
      result.facadesDistinct &&
      result.fullSnapshots &&
      result.publicationCapturedAtCall &&
      result.releaseMode === 'overlap' &&
      !result.serialized &&
      result.secondStart !== null &&
      result.gateCommit !== null &&
      result.secondStart < result.gateCommit &&
      result.missingRequired === 0)).toBe(true);
  });

  it('timeout-releases a future serialized writer without deadlock', () => {
    expect(
      timeout.facadesDistinct &&
      timeout.fullSnapshots &&
      timeout.publicationCapturedAtCall &&
      timeout.releaseMode === 'timeout' &&
      timeout.serialized &&
      timeout.secondStart !== null &&
      timeout.gateCommit !== null &&
      timeout.gateCommit < timeout.secondStart &&
      timeout.missingRequired === 0,
    ).toBe(true);
  });

  it('independently exercises every exact candidate, outcome row and a healthy publication history', () => {
    expect(
      oracle.candidateClassifiersAreExact &&
      oracle.outcomeTableIsExact &&
      oracle.healthyPublicationHistoryIsSafe &&
      oracle.stagingAndDeferredCleanupAreAllowed &&
      oracle.unsafeAuthorityVariantsAreRejected,
    ).toBe(true);
  });
});

for (const order of ['merge-first', 'replacement-first'] as const) {
  describe.sequential(`G0S-TAB modeled package/replacement transaction: ${order}`, () => {
    let result: ScenarioResult;

    beforeAll(async () => {
      result = await runScenario(order);
    });

    it('uses a self-validated disjoint fixture and reaches a future-safe exact final candidate', () => {
      expect(result.initialized && result.finalAuthoritySafe && result.finalKind !== null).toBe(true);
    });

    it.fails('does not start the second canonical log/blob mutation before every first commit', () => {
      expect(result.transactionSerializedOrRejected).toBe(true);
    });

    it('keeps every point-in-time publication backed by an exact referenced-blob closure', () => {
      expect(result.publicationClosureSafe).toBe(true);
    });
  });
}
