import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addCaptionAttachments,
  type AttachmentSource,
} from '../../src/assets/captionAttachment';
import { formatHlc, parseHlc } from '../../src/core/hlc';
import { parseOpsJsonl } from '../../src/core/jsonl';
import { reduce, versionVector, type ProjectState } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import { entityIdFor, ProjectStore, type Identity } from '../../src/core/store';
import { FaultInjectingMemoryFS } from '../helpers/faultFs';
import {
  ResolvedCorruptingMemoryFS,
  type ResolvedCorruptionMode,
} from '../helpers/resolvedCorruptingFs';

const USER: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000072',
  deviceId: 'dev_00000000000000000000000072',
  displayName: 'caption attachment durability',
});

function png(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

// Two real 1x1 PNG containers keep this durability test compatible with a
// future content-sniffing gate without attempting to characterize that gate.
const OLD_BYTES = png('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAQdEVYdENvbW1lbnQAZXhpc3RpbmcaRKL+AAAAAElFTkSuQmCC');
const SOURCE_BYTES = [
  png('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
  png('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAOdEVYdENvbW1lbnQAc2Vjb25kjhc8pQAAAABJRU5ErkJggg=='),
] as const;
const SOURCE_NAMES = ['first.png', 'second.png'] as const;
const SOURCE_MIMES = ['image/png', 'image/png'] as const;

type ActionOutcome =
  | { status: 'fulfilled'; value: readonly string[] }
  | { status: 'rejected' };

interface Authority {
  manifest: unknown;
  ops: Op[];
  state: ProjectState;
  vector: Record<string, number>;
}

interface Fixture {
  fs: FaultInjectingMemoryFS;
  dir: string;
  store: ProjectStore;
  actorLogPath: string;
  captionId: string;
  oldAssetId: string;
  oldPath: string;
  baseline: Authority;
}

interface Candidate {
  kind: 'old' | 'staged' | 'new';
  count: number;
  assets: Array<{ sourceIndex: number; id: string; path: string }>;
  assetIds: string[];
}

interface Publication {
  token: string;
  authority: Authority;
}

interface RunResult {
  outcome: ActionOutcome;
  publications: Publication[];
  boundarySafe: boolean;
  finalSafe: boolean;
  boundaryLive: Candidate | null;
  boundaryDurable: Candidate | null;
  liveKind: Candidate['kind'] | null;
  durableKind: Candidate['kind'] | null;
  sourceAliasesUnchanged: boolean;
  everySourceRead: boolean;
  callbackAttachments: readonly string[] | null;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function bytesEqual(actual: Uint8Array | null | undefined, expected: Uint8Array): boolean {
  return actual !== null && actual !== undefined &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

async function settle(promise: Promise<readonly string[]>): Promise<ActionOutcome> {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch {
    return { status: 'rejected' };
  }
}

function snapshotAuthority(store: ProjectStore, state = store.state): Authority {
  return {
    manifest: cloneValue(store.manifest),
    ops: cloneValue([...store.allOps]),
    state: cloneValue(state),
    vector: cloneValue(store.vector),
  };
}

function isDirectMediaPath(dir: string, absolutePath: string): boolean {
  const prefix = `${dir}/media/`;
  if (!absolutePath.startsWith(prefix)) return false;
  const name = absolutePath.slice(prefix.length);
  return name.length > 0 && !name.includes('/') && !name.includes('\\');
}

function canonicalEnvelope(op: Op, fixture: Fixture, index: number, previousHlc: string): boolean {
  const previousOwnSequence = Math.max(
    0,
    ...fixture.baseline.ops
      .filter((candidate) => candidate.actor === fixture.store.actorId)
      .map((candidate) => candidate.op),
  );
  if (
    op.op !== previousOwnSequence + index + 1 ||
    op.actor !== fixture.store.actorId ||
    op.user !== USER.userId ||
    op.hlc <= previousHlc
  ) return false;
  try {
    const parsed = parseHlc(op.hlc);
    return parsed.actor === fixture.store.actorId &&
      formatHlc(parsed.physical, parsed.counter, parsed.actor) === op.hlc;
  } catch {
    return false;
  }
}

function classifyAuthority(authority: Authority, fixture: Fixture): Candidate | null {
  const baseline = fixture.baseline;
  if (
    !isDeepStrictEqual(authority.manifest, baseline.manifest) ||
    authority.ops.length < baseline.ops.length ||
    authority.ops.length > baseline.ops.length + SOURCE_BYTES.length + 1 ||
    !isDeepStrictEqual(authority.ops.slice(0, baseline.ops.length), baseline.ops)
  ) return null;

  const added = authority.ops.slice(baseline.ops.length);
  const assetCount = Math.min(added.length, SOURCE_BYTES.length);
  const assets: Candidate['assets'] = [];
  let previousHlc = baseline.ops.reduce(
    (maximum, candidate) => candidate.hlc > maximum ? candidate.hlc : maximum,
    '',
  );
  for (let index = 0; index < assetCount; index += 1) {
    const op = added[index]!;
    const path = op.v?.path;
    const sourceIndex = SOURCE_NAMES.findIndex((name, candidateIndex) =>
      op.v?.originalName === name &&
      op.v?.mime === SOURCE_MIMES[candidateIndex] &&
      op.v?.size === SOURCE_BYTES[candidateIndex]!.length);
    if (
      !canonicalEnvelope(op, fixture, index, previousHlc) ||
      op.t !== 'create' || op.e !== 'asset' ||
      !/^ast_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(op.id) ||
      sourceIndex < 0 || assets.some((asset) => asset.sourceIndex === sourceIndex) ||
      typeof path !== 'string' ||
      !isDirectMediaPath(fixture.dir, `${fixture.dir}/${path}`) ||
      path === fixture.oldPath || assets.some((asset) => asset.path === path || asset.id === op.id) ||
      !isDeepStrictEqual(op.v, {
        kind: 'image',
        path,
        originalName: SOURCE_NAMES[sourceIndex],
        mime: SOURCE_MIMES[sourceIndex],
        size: SOURCE_BYTES[sourceIndex]!.length,
      })
    ) return null;
    assets.push({ sourceIndex, id: op.id, path });
    previousHlc = op.hlc;
  }

  const sourceOrderedAssets = [...assets].sort((left, right) => left.sourceIndex - right.sourceIndex);
  const assetIds = sourceOrderedAssets.map((asset) => asset.id);

  if (added.length > SOURCE_BYTES.length) {
    if (assetCount !== SOURCE_BYTES.length || added.length !== SOURCE_BYTES.length + 1) return null;
    const op = added[SOURCE_BYTES.length]!;
    if (
      !canonicalEnvelope(op, fixture, SOURCE_BYTES.length, previousHlc) ||
      op.t !== 'update' || op.e !== 'caption' || op.id !== fixture.captionId ||
      !isDeepStrictEqual(op.v, { attachments: [fixture.oldAssetId, ...assetIds] })
    ) return null;
  }

  const expectedState = reduce(authority.ops);
  if (
    !isDeepStrictEqual(authority.state, expectedState) ||
    !isDeepStrictEqual(authority.vector, versionVector(authority.ops))
  ) return null;

  if (added.length === 0) return { kind: 'old', count: 0, assets, assetIds };
  if (added.length <= SOURCE_BYTES.length) {
    return { kind: 'staged', count: assetCount, assets, assetIds };
  }
  return { kind: 'new', count: assetCount, assets, assetIds };
}

async function makeFixture(
  fs: FaultInjectingMemoryFS,
  suffix: string,
): Promise<Fixture> {
  const dir = `projects/caption-attachment-${suffix}`;
  const store = await ProjectStore.create(fs, dir, `caption attachment ${suffix}`, USER);
  const oldAssetId = entityIdFor('asset');
  const captionId = entityIdFor('caption');
  const oldPath = 'media/existing.png';
  await fs.writeBytes(`${dir}/${oldPath}`, new Uint8Array(OLD_BYTES));
  store.dispatch({
    t: 'create', e: 'asset', id: oldAssetId,
    v: {
      kind: 'image', path: oldPath, originalName: 'existing.png', mime: 'image/png', size: OLD_BYTES.length,
    },
  });
  store.dispatch({
    t: 'create', e: 'caption', id: captionId,
    v: { title: 'existing caption', attachments: [oldAssetId] },
  });
  await store.flush();
  return {
    fs,
    dir,
    store,
    actorLogPath: `${dir}/ops/${store.actorId}.jsonl`,
    captionId,
    oldAssetId,
    oldPath,
    baseline: snapshotAuthority(store),
  };
}

function capturePublications(
  fixture: Fixture,
  attemptedPaths: () => readonly string[],
): { publications: Publication[]; unsubscribe: () => void } {
  const publications: Publication[] = [];
  let sequence = 0;
  const unsubscribe = fixture.store.subscribe((state) => {
    const token = `caption-attachment-publication-${++sequence}`;
    publications.push({ token, authority: snapshotAuthority(fixture.store, state) });
    const paths = new Set<string>([
      `${fixture.dir}/lociview.json`,
      `${fixture.dir}/${fixture.oldPath}`,
      ...attemptedPaths(),
    ]);
    for (const asset of Object.values(state.byKind.asset ?? {})) {
      const path = asset.fields.path;
      if (typeof path === 'string') paths.add(`${fixture.dir}/${path}`);
    }
    fixture.fs.markFiles(token, [...paths]);
  });
  return { publications, unsubscribe };
}

function snapshotFilesAreExact(
  fixture: Fixture,
  candidate: Candidate,
  files: ReadonlyMap<string, Uint8Array | null>,
): boolean {
  const markerBytes = files.get(`${fixture.dir}/lociview.json`);
  let marker: unknown;
  try {
    marker = markerBytes === null || markerBytes === undefined
      ? null
      : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(markerBytes));
  } catch {
    return false;
  }
  if (
    !isDeepStrictEqual(marker, fixture.baseline.manifest) ||
    !bytesEqual(files.get(`${fixture.dir}/${fixture.oldPath}`), OLD_BYTES)
  ) return false;
  return candidate.assets.every((asset) =>
    bytesEqual(files.get(`${fixture.dir}/${asset.path}`), SOURCE_BYTES[asset.sourceIndex]!));
}

function candidateRank(candidate: Candidate): number {
  return candidate.kind === 'new' ? SOURCE_BYTES.length + 1 : candidate.count;
}

function publicationsAreSafe(fixture: Fixture, publications: readonly Publication[]): boolean {
  let previousRank = 0;
  let previousOps = fixture.baseline.ops;
  return publications.every((publication) => {
    const candidate = classifyAuthority(publication.authority, fixture);
    const files = fixture.fs.fileSnapshots.find((snapshot) => snapshot.token === publication.token)?.files;
    if (
      candidate === null || files === undefined || candidateRank(candidate) < previousRank ||
      !isDeepStrictEqual(
        publication.authority.ops.slice(0, previousOps.length),
        previousOps,
      )
    ) return false;
    previousRank = candidateRank(candidate);
    previousOps = publication.authority.ops;
    return snapshotFilesAreExact(fixture, candidate, files);
  });
}

async function candidateBlobsAreExact(fixture: Fixture, candidate: Candidate): Promise<boolean> {
  if (!bytesEqual(await fixture.fs.readBytes(`${fixture.dir}/${fixture.oldPath}`), OLD_BYTES)) return false;
  for (const asset of candidate.assets) {
    if (!bytesEqual(
      await fixture.fs.readBytes(`${fixture.dir}/${asset.path}`),
      SOURCE_BYTES[asset.sourceIndex]!,
    )) return false;
  }
  return true;
}

async function diskAuthorityIsExact(fixture: Fixture, authority: Authority): Promise<boolean> {
  const markers = (await fixture.fs.list('projects/'))
    .filter((path) => path.endsWith('/lociview.json'))
    .sort();
  const logs = (await fixture.fs.list(`${fixture.dir}/ops/`))
    .filter((path) => path.endsWith('.jsonl'))
    .sort();
  const raw = await fixture.fs.readText(fixture.actorLogPath);
  const parsed = raw === null ? null : parseOpsJsonl(raw);
  return isDeepStrictEqual(markers, [`${fixture.dir}/lociview.json`]) &&
    isDeepStrictEqual(logs, [fixture.actorLogPath]) &&
    parsed !== null && parsed.errors.length === 0 &&
    isDeepStrictEqual(parsed.ops, authority.ops);
}

function durableIsCausalPrefixOfLive(live: Candidate, durable: Candidate): boolean {
  return candidateRank(durable) <= candidateRank(live) &&
    isDeepStrictEqual(durable.assets, live.assets.slice(0, durable.assets.length));
}

async function inspectBoundary(
  fixture: Fixture,
  outcome: ActionOutcome,
): Promise<{ safe: boolean; live: Candidate | null; durable: Candidate | null }> {
  let reopened: ProjectStore;
  try {
    reopened = await ProjectStore.open(fixture.fs, fixture.dir, USER);
  } catch {
    return { safe: false, live: null, durable: null };
  }
  const liveAuthority = snapshotAuthority(fixture.store);
  const live = classifyAuthority(liveAuthority, fixture);
  const durableAuthority = snapshotAuthority(reopened);
  const durable = classifyAuthority(durableAuthority, fixture);
  const candidatesExact =
    live !== null && durable !== null &&
    durableIsCausalPrefixOfLive(live, durable) &&
    isDeepStrictEqual(
      liveAuthority.ops.slice(0, durableAuthority.ops.length),
      durableAuthority.ops,
    ) &&
    await candidateBlobsAreExact(fixture, live) &&
    await candidateBlobsAreExact(fixture, durable);
  const outcomeExact = outcome.status === 'fulfilled'
    ? live?.kind === 'new' && durable?.kind === 'new' &&
      isDeepStrictEqual(outcome.value, live.assetIds) &&
      isDeepStrictEqual(outcome.value, durable.assetIds) &&
      isDeepStrictEqual(fixture.store.durabilityStatus, {
        phase: 'durable', pending: 0, retryable: false,
      })
    : live !== null && durable !== null;
  return {
    safe:
      reopened.loadErrors.length === 0 &&
      candidatesExact && outcomeExact &&
      await diskAuthorityIsExact(fixture, durableAuthority),
    live,
    durable,
  };
}

interface SourceHarness {
  list: AttachmentSource[];
  mutateAliases: () => void;
  bytesUnchanged: () => boolean;
  everySourceRead: () => boolean;
}

function makeSources(): SourceHarness {
  const names: string[] = [...SOURCE_NAMES];
  const mimes: string[] = [...SOURCE_MIMES];
  const sharedBytes = SOURCE_BYTES.map((bytes) => new Uint8Array(bytes));
  const readCounts = SOURCE_BYTES.map(() => 0);
  const list = SOURCE_BYTES.map((_, index): AttachmentSource => ({
    get name() { return names[index]!; },
    get mime() { return mimes[index]!; },
    readBytes: async () => {
      readCounts[index]! += 1;
      return sharedBytes[index]!;
    },
  }));
  return {
    list,
    mutateAliases: () => {
      names[0] = 'mutated-first.bin';
      names[1] = 'mutated-second.bin';
      mimes[0] = 'application/octet-stream';
      mimes[1] = 'video/mp4';
      list.reverse();
      list.splice(0, list.length);
    },
    bytesUnchanged: () => sharedBytes.every((bytes, index) => bytesEqual(bytes, SOURCE_BYTES[index]!)),
    everySourceRead: () => readCounts.every((count) => count > 0),
  };
}

async function runAction(
  fixture: Fixture,
  attemptedPaths: () => readonly string[] = () => [],
  actionWindow?: { begin: () => void; end: () => void },
): Promise<RunResult> {
  const sources = makeSources();
  const capture = capturePublications(fixture, attemptedPaths);
  let callbackAttachments: readonly string[] | null = null;
  actionWindow?.begin();
  const action = addCaptionAttachments(
    fixture.fs,
    fixture.dir,
    fixture.store,
    fixture.captionId,
    sources.list,
    (attachments) => {
      callbackAttachments = [...attachments];
      fixture.store.dispatch({
        t: 'update', e: 'caption', id: fixture.captionId,
        v: { attachments: [...attachments] },
      });
    },
  );
  // The action must have captured the caller-owned list/name/MIME aliases before
  // its first await. Native File bytes are immutable; the returned buffers are
  // retained here only to prove the action/adapter did not mutate them.
  sources.mutateAliases();
  let outcome: ActionOutcome;
  try {
    outcome = await settle(action);
  } finally {
    actionWindow?.end();
  }
  const boundary = await inspectBoundary(fixture, outcome);
  await settle(fixture.store.flush().then(() => []));
  capture.unsubscribe();
  await fixture.fs.settleProbes();
  const final = await inspectBoundary(fixture, outcome);
  return {
    outcome,
    publications: capture.publications,
    boundarySafe: boundary.safe,
    finalSafe: final.safe,
    boundaryLive: boundary.live,
    boundaryDurable: boundary.durable,
    liveKind: final.live?.kind ?? null,
    durableKind: final.durable?.kind ?? null,
    sourceAliasesUnchanged: sources.bytesUnchanged(),
    everySourceRead: sources.everySourceRead(),
    callbackAttachments,
  };
}

class PayloadRejectingMemoryFS extends FaultInjectingMemoryFS {
  private targetPath: string | null = null;
  private predicate: ((op: Op) => boolean) | null = null;
  rejectedPath: string | null = null;
  rejectedOp: Op | null = null;

  rejectNextMatching(path: string, predicate: (op: Op) => boolean): void {
    this.targetPath = path;
    this.predicate = predicate;
  }

  private rejectMatching(path: string, text: string): void {
    if (path !== this.targetPath || this.predicate === null) return;
    const parsed = parseOpsJsonl(text);
    const match = parsed.errors.length === 0 ? parsed.ops.find(this.predicate) : undefined;
    if (match !== undefined) {
      this.targetPath = null;
      this.predicate = null;
      this.rejectedPath = path;
      this.rejectedOp = cloneValue(match);
      throw new Error('injected semantic append rejection');
    }
  }

  private rejectMatchingBytes(path: string, bytes: Uint8Array): void {
    if (path !== this.targetPath || this.predicate === null) return;
    try {
      this.rejectMatching(path, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      if (this.rejectedOp !== null) throw error;
    }
  }

  override async appendText(path: string, text: string): Promise<void> {
    this.rejectMatching(path, text);
    await super.appendText(path, text);
  }

  override async appendBytes(path: string, bytes: Uint8Array): Promise<void> {
    this.rejectMatchingBytes(path, bytes);
    await super.appendBytes(path, bytes);
  }

  override async writeText(path: string, text: string): Promise<void> {
    this.rejectMatching(path, text);
    await super.writeText(path, text);
  }

  override async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    this.rejectMatchingBytes(path, bytes);
    await super.writeBytes(path, bytes);
  }
}

describe.sequential('G0S-BLOB verified caption attachments', () => {
  describe('healthy two-file attachment', () => {
    let fixture: Fixture;
    let run: RunResult;
    let baselineExact: boolean;
    let publicationKinds: string[];

    beforeAll(async () => {
      fixture = await makeFixture(new FaultInjectingMemoryFS(), 'healthy');
      baselineExact =
        classifyAuthority(fixture.baseline, fixture)?.kind === 'old' &&
        await diskAuthorityIsExact(fixture, fixture.baseline) &&
        bytesEqual(await fixture.fs.readBytes(`${fixture.dir}/${fixture.oldPath}`), OLD_BYTES);
      run = await runAction(fixture);
      publicationKinds = run.publications.map((publication) => {
        const candidate = classifyAuthority(publication.authority, fixture);
        return candidate === null ? 'invalid' : `${candidate.kind}:${candidate.count}`;
      });
    });

    it('starts from one exact existing caption attachment', () => {
      expect(baselineExact).toBe(true);
    });

    it('keeps every point-in-time publication on the exact A1/A2/N causal path', () => {
      expect({
        notified: publicationKinds.length > 0,
        finalPublication: publicationKinds.at(-1),
        safe: publicationsAreSafe(fixture, run.publications),
      }).toEqual({
        notified: true,
        finalPublication: 'new:2',
        safe: true,
      });
    });

    it('returns only after the ordered attachments and exact blobs are durable and reopenable', () => {
      const returned = run.outcome.status === 'fulfilled' ? [...run.outcome.value] : null;
      expect({
        fulfilled: run.outcome.status === 'fulfilled',
        returned,
        callbackAttachments: run.callbackAttachments,
        sourceAliasesUnchanged: run.sourceAliasesUnchanged,
        everySourceRead: run.everySourceRead,
        boundarySafe: run.boundarySafe,
        finalSafe: run.finalSafe,
        liveKind: run.liveKind,
        durableKind: run.durableKind,
      }).toEqual({
        fulfilled: true,
        returned: run.boundaryLive?.assetIds ?? null,
        callbackAttachments: [fixture.oldAssetId, ...(run.boundaryLive?.assetIds ?? [])],
        sourceAliasesUnchanged: true,
        everySourceRead: true,
        boundarySafe: true,
        finalSafe: true,
        liveKind: 'new',
        durableKind: 'new',
      });
    });
  });

  for (const mode of ['bitflip', 'truncate'] as const satisfies readonly ResolvedCorruptionMode[]) {
    describe(`resolved ${mode} on the second source`, () => {
      let fs: ResolvedCorruptingMemoryFS;
      let fixture: Fixture;
      let run: RunResult;
      let faultReached: boolean;

      beforeAll(async () => {
        fs = new ResolvedCorruptingMemoryFS(
          (path) => isDirectMediaPath(fixture.dir, path),
          SOURCE_BYTES[1],
          mode,
        );
        fixture = await makeFixture(fs, `resolved-${mode}`);
        run = await runAction(
          fixture,
          () => fs.targetPath === null ? [] : [fs.targetPath],
          { begin: () => fs.beginAction(), end: () => fs.endAction() },
        );
        const corrupt = fs.corruptBytes;
        faultReached =
          fs.targetPath !== null &&
          isDirectMediaPath(fixture.dir, fs.targetPath) &&
          fs.injectionCount === 1 &&
          fs.requestedWrites.length >= 1 &&
          fs.requestedWrites.every((bytes) => bytesEqual(bytes, SOURCE_BYTES[1])) &&
          corrupt !== null && !bytesEqual(corrupt, SOURCE_BYTES[1]) &&
          fs.verificationReads.some((bytes) => bytesEqual(bytes, corrupt));
      });

      it('commits and observes the intended wrong second-source bytes inside the action', () => {
        expect({
          faultReached,
          everySourceRead: run.everySourceRead,
          sourceAliasesUnchanged: run.sourceAliasesUnchanged,
        }).toEqual({ faultReached: true, everySourceRead: true, sourceAliasesUnchanged: true });
      });

      it('publishes metadata only after all sources verify and keeps exact non-dangling authority', () => {
        const verificationDispositionExact = run.outcome.status === 'fulfilled'
          ? run.boundaryLive?.kind === 'new' && run.boundaryDurable?.kind === 'new'
          : run.publications.length === 0 &&
            run.boundaryLive?.kind === 'old' && run.boundaryDurable?.kind === 'old';
        expect({
          verificationDispositionExact,
          publicationsSafe: publicationsAreSafe(fixture, run.publications),
          boundarySafe: run.boundarySafe,
          finalSafe: run.finalSafe,
        }).toEqual({
          verificationDispositionExact: true,
          publicationsSafe: true,
          boundarySafe: true,
          finalSafe: true,
        });
      });
    });
  }

  for (const row of [
    {
      id: 'first-asset-append',
      matches: (fixture: Fixture, op: Op) =>
        op.t === 'create' && op.e === 'asset' && op.id !== fixture.oldAssetId,
    },
    {
      id: 'caption-update-append',
      matches: (fixture: Fixture, op: Op) =>
        op.t === 'update' && op.e === 'caption' && op.id === fixture.captionId,
    },
  ] as const) {
    describe(`${row.id} rejection`, () => {
      let fs: PayloadRejectingMemoryFS;
      let fixture: Fixture;
      let run: RunResult;
      let faultReached: boolean;

      beforeAll(async () => {
        fs = new PayloadRejectingMemoryFS();
        fixture = await makeFixture(fs, row.id);
        fs.rejectNextMatching(fixture.actorLogPath, (op) => row.matches(fixture, op));
        run = await runAction(fixture);
        faultReached =
          fs.rejectedPath === fixture.actorLogPath &&
          fs.rejectedOp !== null && row.matches(fixture, fs.rejectedOp);
      });

      it('reaches the intended semantic append boundary before any test-side repair flush', () => {
        expect({
          faultReached,
          boundarySafe: run.boundarySafe,
        }).toEqual({
          faultReached: true,
          boundarySafe: true,
        });
      });

      it('keeps notifications and reopen on exact non-dangling causal candidates', () => {
        expect({
          publicationsSafe: publicationsAreSafe(fixture, run.publications),
          boundarySafe: run.boundarySafe,
          finalSafe: run.finalSafe,
          sourceAliasesUnchanged: run.sourceAliasesUnchanged,
        }).toEqual({
          publicationsSafe: true,
          boundarySafe: true,
          finalSafe: true,
          sourceAliasesUnchanged: true,
        });
      });
    });
  }
});
