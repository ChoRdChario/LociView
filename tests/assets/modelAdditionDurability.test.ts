import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { addModelAsset } from '../../src/assets/modelAsset';
import { formatHlc, parseHlc } from '../../src/core/hlc';
import { parseOpsJsonl } from '../../src/core/jsonl';
import { GENERATOR, MANIFEST_FORMAT, SCHEMA_VERSION } from '../../src/core/manifest';
import { reduce, versionVector, type ProjectState } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import { FaultInjectingMemoryFS } from '../helpers/faultFs';
import {
  ResolvedCorruptingMemoryFS,
  type ResolvedCorruptionMode,
} from '../helpers/resolvedCorruptingFs';

const USER: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000060',
  deviceId: 'dev_00000000000000000000000060',
  displayName: 'model addition durability',
});
const MODEL_NAME = 'added-model.stl';
const SOURCE_BYTES = new TextEncoder().encode(
  'solid addition\nfacet normal 0 0 1\nendfacet\nendsolid addition\n',
);

type ActionOutcome<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; message: string };

interface AdditionAuthority {
  manifest: unknown;
  ops: Op[];
  state: ProjectState;
  vector: Record<string, number>;
}

interface AdditionFixture {
  fs: FaultInjectingMemoryFS;
  dir: string;
  store: ProjectStore;
  actorLogPath: string;
  baseline: AdditionAuthority;
}

type AdditionCandidate =
  | { kind: 'old'; assetId: null; path: null }
  | { kind: 'new'; assetId: string; path: string };

interface Publication {
  token: string;
  authority: AdditionAuthority;
}

interface AdditionRun {
  outcome: ActionOutcome<string>;
  sourceUnchanged: boolean;
  publications: Publication[];
  publicationsSafe: boolean;
  boundarySafe: boolean;
  finalSafe: boolean;
  liveKind: AdditionCandidate['kind'] | null;
  durableKind: AdditionCandidate['kind'] | null;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function bytesEqual(actual: Uint8Array | null, expected: Uint8Array): boolean {
  return actual !== null &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

async function settleValue<T>(promise: Promise<T>): Promise<ActionOutcome<T>> {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch (error) {
    return {
      status: 'rejected',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function snapshotAuthority(
  store: ProjectStore,
  state: ProjectState = store.state,
): AdditionAuthority {
  return {
    manifest: cloneValue(store.manifest),
    ops: cloneValue([...store.allOps]),
    state: cloneValue(state),
    vector: cloneValue(store.vector),
  };
}

function isDirectStlPath(dir: string, absolutePath: string): boolean {
  const prefix = `${dir}/models/`;
  if (!absolutePath.startsWith(prefix) || !absolutePath.endsWith('.stl')) return false;
  const filename = absolutePath.slice(prefix.length);
  return filename.length > '.stl'.length && !filename.includes('/') && !filename.includes('\\');
}

function additionOperationIsExact(
  op: Op,
  fixture: AdditionFixture,
  assetId: string,
  relativePath: string,
): boolean {
  const previousOwnSequence = Math.max(
    0,
    ...fixture.baseline.ops
      .filter((candidate) => candidate.actor === fixture.store.actorId)
      .map((candidate) => candidate.op),
  );
  const previousMaximumHlc = fixture.baseline.ops.reduce(
    (maximum, candidate) => candidate.hlc > maximum ? candidate.hlc : maximum,
    '',
  );
  if (
    !isDeepStrictEqual(
      Object.keys(op).sort(),
      ['op', 'hlc', 'actor', 'user', 't', 'e', 'id', 'v'].sort(),
    ) ||
    op.op !== previousOwnSequence + 1 ||
    op.actor !== fixture.store.actorId ||
    op.user !== USER.userId ||
    op.t !== 'create' ||
    op.e !== 'asset' ||
    op.id !== assetId ||
    !/^ast_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(assetId) ||
    op.hlc <= previousMaximumHlc ||
    !isDeepStrictEqual(op.v, {
      kind: 'model',
      path: relativePath,
      originalName: MODEL_NAME,
      mime: '',
      size: SOURCE_BYTES.length,
      transform: { scale: 1, upAxis: 'Y' },
      pinScale: 1,
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

function operationEnvelopeIsCanonical(op: Op, fixture: AdditionFixture): boolean {
  if (
    !isDeepStrictEqual(
      Object.keys(op).sort(),
      ['op', 'hlc', 'actor', 'user', 't', 'e', 'id', 'v'].sort(),
    ) ||
    op.actor !== fixture.store.actorId ||
    op.user !== USER.userId
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

async function diskAuthorityIsExact(
  fixture: AdditionFixture,
  authority: AdditionAuthority,
): Promise<boolean> {
  const markerPaths = (await fixture.fs.list('projects/'))
    .filter((path) => path.endsWith('/lociview.json'))
    .sort();
  const markerBytes = await fixture.fs.readBytes(`${fixture.dir}/lociview.json`);
  let marker: unknown;
  try {
    marker = markerBytes === null
      ? null
      : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(markerBytes));
  } catch {
    return false;
  }
  const logPaths = (await fixture.fs.list(`${fixture.dir}/ops/`))
    .filter((path) => path.endsWith('.jsonl'))
    .sort();
  const rawLog = await fixture.fs.readText(fixture.actorLogPath);
  const parsed = rawLog === null ? null : parseOpsJsonl(rawLog);
  return isDeepStrictEqual(markerPaths, [`${fixture.dir}/lociview.json`]) &&
    isDeepStrictEqual(marker, authority.manifest) &&
    isDeepStrictEqual(logPaths, [fixture.actorLogPath]) &&
    parsed !== null &&
    parsed.errors.length === 0 &&
    isDeepStrictEqual(parsed.ops, authority.ops);
}

async function baselineIsExact(fixture: AdditionFixture, suffix: string): Promise<boolean> {
  const manifest = fixture.baseline.manifest as Record<string, unknown>;
  const createdAt = manifest.createdAt;
  const ops = fixture.baseline.ops;
  if (
    !isDeepStrictEqual(
      Object.keys(manifest).sort(),
      ['format', 'schemaVersion', 'projectId', 'name', 'createdAt', 'generator'].sort(),
    ) ||
    manifest.format !== MANIFEST_FORMAT ||
    manifest.schemaVersion !== SCHEMA_VERSION ||
    typeof manifest.projectId !== 'string' ||
    !/^prj_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(manifest.projectId) ||
    manifest.name !== `model addition ${suffix}` ||
    typeof createdAt !== 'string' ||
    new Date(createdAt).toISOString() !== createdAt ||
    manifest.generator !== GENERATOR ||
    ops.length !== 2 ||
    ops[0]?.op !== 1 ||
    ops[1]?.op !== 2 ||
    !operationEnvelopeIsCanonical(ops[0]!, fixture) ||
    !operationEnvelopeIsCanonical(ops[1]!, fixture) ||
    ops[0]!.hlc >= ops[1]!.hlc ||
    ops[0]!.t !== 'create' ||
    ops[0]!.e !== 'set' ||
    !/^set_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(ops[0]!.id) ||
    !isDeepStrictEqual(ops[0]!.v, { name: '標準', order: 1 }) ||
    ops[1]!.t !== 'create' ||
    ops[1]!.e !== 'profile' ||
    ops[1]!.id !== USER.userId ||
    !isDeepStrictEqual(ops[1]!.v, {
      displayName: USER.displayName,
      defaultPinColor: '#eab308',
    }) ||
    !isDeepStrictEqual(fixture.baseline.state, reduce(ops)) ||
    !isDeepStrictEqual(fixture.baseline.vector, versionVector(ops)) ||
    Object.keys(fixture.baseline.state.byKind.asset ?? {}).length !== 0
  ) {
    return false;
  }
  return diskAuthorityIsExact(fixture, fixture.baseline);
}

function classifyAuthority(
  authority: AdditionAuthority,
  fixture: AdditionFixture,
): AdditionCandidate | null {
  const baseline = fixture.baseline;
  if (!isDeepStrictEqual(authority.manifest, baseline.manifest)) return null;
  if (
    isDeepStrictEqual(authority.ops, baseline.ops) &&
    isDeepStrictEqual(authority.state, baseline.state) &&
    isDeepStrictEqual(authority.vector, baseline.vector)
  ) {
    return { kind: 'old', assetId: null, path: null };
  }
  if (
    authority.ops.length !== baseline.ops.length + 1 ||
    !isDeepStrictEqual(authority.ops.slice(0, baseline.ops.length), baseline.ops)
  ) {
    return null;
  }
  const op = authority.ops[authority.ops.length - 1]!;
  const path = op.v?.path;
  if (
    typeof path !== 'string' ||
    !isDirectStlPath(fixture.dir, `${fixture.dir}/${path}`) ||
    !additionOperationIsExact(op, fixture, op.id, path)
  ) {
    return null;
  }
  const expectedOps = [...baseline.ops, op];
  if (
    !isDeepStrictEqual(authority.state, reduce(expectedOps)) ||
    !isDeepStrictEqual(authority.vector, versionVector(expectedOps))
  ) {
    return null;
  }
  return { kind: 'new', assetId: op.id, path };
}

async function makeFixture(
  fs: FaultInjectingMemoryFS,
  suffix: string,
): Promise<AdditionFixture> {
  const dir = `projects/model-addition-${suffix}`;
  const store = await ProjectStore.create(fs, dir, `model addition ${suffix}`, USER);
  await store.flush();
  const fixture: AdditionFixture = {
    fs,
    dir,
    store,
    actorLogPath: `${dir}/ops/${store.actorId}.jsonl`,
    baseline: undefined as unknown as AdditionAuthority,
  };
  fixture.baseline = snapshotAuthority(store);
  return fixture;
}

function capturePublications(
  fixture: AdditionFixture,
  targetPath: () => string | null,
): { publications: Publication[]; unsubscribe: () => void } {
  const publications: Publication[] = [];
  let sequence = 0;
  const unsubscribe = fixture.store.subscribe((state) => {
    const token = `model-addition-publication-${++sequence}`;
    publications.push({ token, authority: snapshotAuthority(fixture.store, state) });
    const paths = new Set<string>([`${fixture.dir}/lociview.json`]);
    const target = targetPath();
    if (target !== null) paths.add(target);
    for (const asset of Object.values(state.byKind.asset ?? {})) {
      const path = asset.fields.path;
      if (typeof path === 'string') paths.add(`${fixture.dir}/${path}`);
    }
    fixture.fs.markFiles(token, [...paths]);
  });
  return { publications, unsubscribe };
}

function publicationsAreSafe(
  fixture: AdditionFixture,
  publications: readonly Publication[],
): boolean {
  return publications.every((publication) => {
    const candidate = classifyAuthority(publication.authority, fixture);
    const files = fixture.fs.fileSnapshots.find((snapshot) => snapshot.token === publication.token)?.files;
    if (candidate === null || files === undefined) return false;
    const markerBytes = files.get(`${fixture.dir}/lociview.json`);
    let marker: unknown;
    try {
      marker = markerBytes === null || markerBytes === undefined
        ? null
        : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(markerBytes));
    } catch {
      return false;
    }
    return isDeepStrictEqual(marker, fixture.baseline.manifest) &&
      (candidate.kind === 'old' ||
        bytesEqual(files.get(`${fixture.dir}/${candidate.path}`) ?? null, SOURCE_BYTES));
  });
}

async function candidateBlobIsExact(
  fixture: AdditionFixture,
  candidate: AdditionCandidate,
): Promise<boolean> {
  return candidate.kind === 'old' ||
    bytesEqual(await fixture.fs.readBytes(`${fixture.dir}/${candidate.path}`), SOURCE_BYTES);
}

async function inspectFinal(
  fixture: AdditionFixture,
  outcome: ActionOutcome<string>,
): Promise<{
  safe: boolean;
  liveKind: AdditionCandidate['kind'] | null;
  durableKind: AdditionCandidate['kind'] | null;
}> {
  let reopened: ProjectStore;
  try {
    reopened = await ProjectStore.open(fixture.fs, fixture.dir, USER);
  } catch {
    return { safe: false, liveKind: null, durableKind: null };
  }
  const live = classifyAuthority(snapshotAuthority(fixture.store), fixture);
  const durableAuthority = snapshotAuthority(reopened);
  const durable = classifyAuthority(durableAuthority, fixture);
  const markerPaths = (await fixture.fs.list('projects/'))
    .filter((path) => path.endsWith('/lociview.json'))
    .sort();
  const logsExact = await diskAuthorityIsExact(fixture, durableAuthority);
  const candidatesExact =
    live !== null &&
    durable !== null &&
    await candidateBlobIsExact(fixture, live) &&
    await candidateBlobIsExact(fixture, durable) &&
    (live.kind !== 'new' || durable.kind !== 'new' ||
      (live.assetId === durable.assetId && live.path === durable.path));
  const outcomeExact = outcome.status === 'fulfilled'
    ? live?.kind === 'new' && durable?.kind === 'new' &&
      live.assetId === outcome.value && durable.assetId === outcome.value
    : live !== null && durable !== null;
  return {
    safe:
      reopened.loadErrors.length === 0 &&
      isDeepStrictEqual(markerPaths, [`${fixture.dir}/lociview.json`]) &&
      logsExact &&
      candidatesExact &&
      outcomeExact,
    liveKind: live?.kind ?? null,
    durableKind: durable?.kind ?? null,
  };
}

async function runAddition(
  fixture: AdditionFixture,
  targetPath: () => string | null,
  actionWindow?: { begin: () => void; end: () => void },
): Promise<AdditionRun> {
  const sourceBefore = new Uint8Array(SOURCE_BYTES);
  const capture = capturePublications(fixture, targetPath);
  let outcome: ActionOutcome<string>;
  actionWindow?.begin();
  try {
    outcome = await settleValue(addModelAsset(
      fixture.fs,
      fixture.dir,
      fixture.store,
      MODEL_NAME,
      SOURCE_BYTES,
    ));
  } finally {
    actionWindow?.end();
  }
  // Capture the action boundary before any test-side flush. This prevents the
  // audit flush below from hiding a production path that returned too early.
  let boundary: Awaited<ReturnType<typeof inspectFinal>>;
  try {
    boundary = await inspectFinal(fixture, outcome);
    await settleValue(fixture.store.flush());
  } finally {
    capture.unsubscribe();
  }
  await fixture.fs.settleProbes();
  const final = await inspectFinal(fixture, outcome);
  return {
    outcome,
    sourceUnchanged: bytesEqual(SOURCE_BYTES, sourceBefore),
    publications: capture.publications,
    publicationsSafe: publicationsAreSafe(fixture, capture.publications),
    boundarySafe: boundary.safe,
    finalSafe: final.safe,
    liveKind: final.liveKind,
    durableKind: final.durableKind,
  };
}

describe.sequential('G0S-BLOB verified model addition', () => {
  describe('healthy STL source', () => {
    let fixtureShapeValid: boolean;
    let oracleControlsValid: boolean;
    let run: AdditionRun;

    beforeAll(async () => {
      const fixture = await makeFixture(new FaultInjectingMemoryFS(), 'healthy');
      fixtureShapeValid =
        await baselineIsExact(fixture, 'healthy') &&
        classifyAuthority(fixture.baseline, fixture)?.kind === 'old' &&
        Object.keys(fixture.baseline.state.byKind.asset ?? {}).length === 0;
      run = await runAddition(fixture, () => null);

      const healthy = snapshotAuthority(fixture.store);
      const healthyCandidate = classifyAuthority(healthy, fixture);
      const lastOp = healthy.ops[healthy.ops.length - 1]!;
      const lastHlc = parseHlc(lastOp.hlc);

      const manifestMutation = cloneValue(healthy);
      manifestMutation.manifest = {
        ...(manifestMutation.manifest as Record<string, unknown>),
        name: 'mutated model addition',
      };

      const malformedId = cloneValue(healthy);
      malformedId.ops[malformedId.ops.length - 1] = {
        ...malformedId.ops[malformedId.ops.length - 1]!,
        id: `ast_8${'0'.repeat(25)}`,
      };
      malformedId.state = reduce(malformedId.ops);
      malformedId.vector = versionVector(malformedId.ops);

      const staleHlc = cloneValue(healthy);
      staleHlc.ops[staleHlc.ops.length - 1] = {
        ...staleHlc.ops[staleHlc.ops.length - 1]!,
        hlc: formatHlc(parseHlc(fixture.baseline.ops[0]!.hlc).physical - 1, 0, fixture.store.actorId),
      };
      staleHlc.state = reduce(staleHlc.ops);
      staleHlc.vector = versionVector(staleHlc.ops);

      const extraOperation = cloneValue(healthy);
      extraOperation.ops.push({
        op: lastOp.op + 1,
        hlc: formatHlc(lastHlc.physical, lastHlc.counter + 1, lastHlc.actor),
        actor: lastOp.actor,
        user: lastOp.user,
        t: 'delete',
        e: lastOp.e,
        id: lastOp.id,
      });
      extraOperation.state = reduce(extraOperation.ops);
      extraOperation.vector = versionVector(extraOperation.ops);

      const originalLog = await fixture.fs.readText(fixture.actorLogPath);
      if (originalLog === null || healthyCandidate?.kind !== 'new') {
        throw new Error('healthy addition did not produce a usable authority control');
      }
      const reformattedLog = `${healthy.ops.map((op) => JSON.stringify({
        ...(op.v === undefined ? {} : { v: op.v }),
        id: op.id,
        e: op.e,
        t: op.t,
        user: op.user,
        actor: op.actor,
        hlc: op.hlc,
        op: op.op,
      })).join('\n')}\n`;
      await fixture.fs.writeText(fixture.actorLogPath, reformattedLog);
      const semanticReformatAccepted = (await inspectFinal(fixture, run.outcome)).safe;
      await fixture.fs.writeText(fixture.actorLogPath, originalLog);

      const privateMarker = 'staging/model-addition/private/lociview.json';
      const orphanPath = `${fixture.dir}/models/unreferenced-orphan.stl`;
      await fixture.fs.writeText(privateMarker, '{}');
      await fixture.fs.writeBytes(orphanPath, Uint8Array.from([9, 8, 7]));
      const privateStagingAndOrphanAccepted = (await inspectFinal(fixture, run.outcome)).safe;
      await fixture.fs.remove(privateMarker);
      await fixture.fs.remove(orphanPath);

      const extraLogPath = `${fixture.dir}/ops/a_0000000000000.jsonl`;
      await fixture.fs.writeText(extraLogPath, '');
      const extraActiveLogRejected = !(await inspectFinal(fixture, run.outcome)).safe;
      await fixture.fs.remove(extraLogPath);

      const publicMarker = 'projects/.staging/model-addition/lociview.json';
      await fixture.fs.writeText(publicMarker, '{}');
      const publicMarkerRejected = !(await inspectFinal(fixture, run.outcome)).safe;
      await fixture.fs.remove(publicMarker);

      const publishedBlobPath = `${fixture.dir}/${healthyCandidate.path}`;
      const healthyBlob = await fixture.fs.readBytes(publishedBlobPath);
      if (healthyBlob === null) throw new Error('healthy addition lacks its published blob');
      const corruptBlob = Uint8Array.from(healthyBlob, (value, index) =>
        index === 0 ? value ^ 0xff : value);
      await fixture.fs.writeBytes(publishedBlobPath, corruptBlob);
      const corruptReferencedBlobRejected = !(await inspectFinal(fixture, run.outcome)).safe;
      await fixture.fs.writeBytes(publishedBlobPath, healthyBlob);

      oracleControlsValid =
        classifyAuthority(fixture.baseline, fixture)?.kind === 'old' &&
        classifyAuthority(healthy, fixture)?.kind === 'new' &&
        classifyAuthority(manifestMutation, fixture) === null &&
        classifyAuthority(malformedId, fixture) === null &&
        classifyAuthority(staleHlc, fixture) === null &&
        classifyAuthority(extraOperation, fixture) === null &&
        semanticReformatAccepted &&
        privateStagingAndOrphanAccepted &&
        extraActiveLogRejected &&
        publicMarkerRejected &&
        corruptReferencedBlobRejected;
    });

    it('starts from an exact project with no asset authority', () => {
      expect(fixtureShapeValid).toBe(true);
    });

    it('accepts only semantic old/new authority while preserving staging and format freedom', () => {
      expect(oracleControlsValid).toBe(true);
    });

    it('publishes and reopens exactly one verified model addition', () => {
      expect({
        fulfilled: run.outcome.status === 'fulfilled',
        sourceUnchanged: run.sourceUnchanged,
        notified: run.publications.length > 0,
        publicationsSafe: run.publicationsSafe,
        boundarySafe: run.boundarySafe,
        finalSafe: run.finalSafe,
        liveKind: run.liveKind,
        durableKind: run.durableKind,
      }).toEqual({
        fulfilled: true,
        sourceUnchanged: true,
        notified: true,
        publicationsSafe: true,
        boundarySafe: true,
        finalSafe: true,
        liveKind: 'new',
        durableKind: 'new',
      });
    });
  });

  for (const mode of ['bitflip', 'truncate'] as const satisfies readonly ResolvedCorruptionMode[]) {
    describe(`resolved ${mode} source corruption`, () => {
      let faultShapeValid: boolean;
      let verificationObserved: boolean;
      let run: AdditionRun;

      beforeAll(async () => {
        let fixture!: AdditionFixture;
        const fs = new ResolvedCorruptingMemoryFS(
          (path) => fixture !== undefined && isDirectStlPath(fixture.dir, path),
          SOURCE_BYTES,
          mode,
        );
        fixture = await makeFixture(fs, mode);
        run = await runAddition(
          fixture,
          () => fs.targetPath,
          { begin: () => fs.beginAction(), end: () => fs.endAction() },
        );
        const attemptedPath = fs.injectedPath;
        const corrupt = fs.corruptBytes;
        faultShapeValid =
          attemptedPath !== null &&
          isDirectStlPath(fixture.dir, attemptedPath) &&
          fs.injectionCount === 1 &&
          fs.requestedWrites.length >= 1 &&
          fs.requestedWrites.every((bytes) => bytesEqual(bytes, SOURCE_BYTES)) &&
          corrupt !== null &&
          !bytesEqual(corrupt, SOURCE_BYTES) &&
          (mode === 'bitflip'
            ? corrupt.length === SOURCE_BYTES.length
            : corrupt.length === SOURCE_BYTES.length - 1) &&
          run.sourceUnchanged;
        verificationObserved =
          corrupt !== null &&
          fs.verificationReads.some((bytes) => bytes !== null && bytesEqual(bytes, corrupt));
      });

      it('commits the intended one-shot corruption and observes it inside the action', () => {
        expect({ faultShapeValid, verificationObserved }).toEqual({
          faultShapeValid: true,
          verificationObserved: true,
        });
      });

      it('publishes no corrupt binding and finishes as exact old or verified new authority', () => {
        expect({
          publicationsSafe: run.publicationsSafe,
          boundarySafe: run.boundarySafe,
          finalSafe: run.finalSafe,
        }).toEqual({
          publicationsSafe: true,
          boundarySafe: true,
          finalSafe: true,
        });
      });
    });
  }

  describe('actor-log append rejection', () => {
    let faultReached: boolean;
    let run: AdditionRun;

    beforeAll(async () => {
      const fs = new FaultInjectingMemoryFS();
      const fixture = await makeFixture(fs, 'append-rejection');
      const eventOffset = fs.events.length;
      fs.failNext('appendText', fixture.actorLogPath, 'injected model addition append rejection');
      run = await runAddition(fixture, () => null);
      fs.assertAllConsumed();
      faultReached = fs.events.slice(eventOffset).some((event) =>
        event.method === 'appendText' &&
        event.path === fixture.actorLogPath &&
        event.outcome === 'throw-before');
    });

    it('does not acknowledge an asset ID before exact durable authority exists', () => {
      expect({ faultReached, boundarySafe: run.boundarySafe }).toEqual({
        faultReached: true,
        boundarySafe: true,
      });
    });

    it('keeps every notification blob-safe and reopens as exact old or verified new authority', () => {
      expect({
        sourceUnchanged: run.sourceUnchanged,
        publicationsSafe: run.publicationsSafe,
        finalSafe: run.finalSafe,
      }).toEqual({
        sourceUnchanged: true,
        publicationsSafe: true,
        finalSafe: true,
      });
    });
  });
});
