import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge'; // Node-only local Wasm initialization.
import { MemoryFS, type ProjectMutationAuthority } from '../src/platform/fs';
import { MetadataProjectSession, type MetadataSessionRead } from '../src/projectMetadata/session';
import { MetadataRepository, type MetadataStorageFactory, type MetadataStoragePort } from '../src/projectMetadata/repository';
import { PersistentContentVerifier, type VerifiedInventoryPort } from '../src/projectMetadata/contentEvidence';
import { TransactionJournal } from '../src/projectMetadata/journal';
import { digest, json, underWriteLease, writeReceipt } from '../src/projectMetadata/persistence';
import { ProjectMetadataSource, type MetadataLimits } from '../src/projectMetadata/source';
import { planRemoteChanges, type FullMetadataSource } from '../src/projectMetadata/remote';
import { captureJournalRemote, type JournalRemoteInput, type PackageRemoteBatchProof } from '../src/projectMetadata/packageRemote';
import type { JsonObject } from '../src/domain/values';
import { inspectAtomicHistory } from '../src/domain/atomicHistory';
import { fixture, id, limits as valueLimits } from './helpers/projectRecordsFixture';
import { developmentContentVerifier, developmentContentBytes } from '../poc/scene-history/content-verifier';
import { planMetadataEdit, type MetadataEdit } from '../src/projectMetadata/commands';
import { captionMembershipGroups, type CaptionMembershipResolution } from '../src/projectMetadata/membership';
import { OriginBlobStore, type StoredBlobRef } from '../src/projectMetadata/blobStore';
import { blobInventory } from '../src/projectMetadata/blobInventory';
import { WorkspaceSourceCapture } from '../src/projectPackage/workspaceSource';
import { WorkspaceArchive, writeWorkspaceArchive } from '../src/projectPackage/workspaceArchive';
import { immutableDigest } from '../src/domain/projectGraphSupport';
import { createFixtureModel } from '../src/harness/projectScene/modelClosure';
import { PACKAGE_FORMAT, PACKAGE_WIRE_VERSION } from '../src/projectPackage/contract';
import { readManifestControl } from '../src/projectPackage/manifest';
import { summarizeFullHistory } from '../src/projectPackage/historySummary';
import { planWorkspaceClosure } from '../src/projectPackage/closure';
import { generationDatabaseName, openWorkspaceGeneration, type WorkspaceGenerationId } from '../src/projectMetadata/generationScope';
import { ProjectMutationCoordinator } from '../src/platform/projectLock';

const limits: MetadataLimits = { ...valueLimits, maxWork: 1_000_000, maxChanges: 100,
  maxChangeBytes: 1_000_000, maxTotalBytes: 4_000_000, maxOperations: 10_000 };
class FaultFS extends MemoryFS {
  reject: (path: string) => boolean = () => false;
  writes = 0;
  override async writeText(path: string, value: string) {
    if (this.reject(path)) throw new DOMException('synthetic quota', 'QuotaExceededError');
    this.writes++; await super.writeText(path, value);
  }
  override async writeBytes(path: string, value: Uint8Array) {
    if (this.reject(path)) throw new DOMException('synthetic quota', 'QuotaExceededError');
    this.writes++; await super.writeBytes(path, value);
  }
}
function setup(fs = new FaultFS()) {
  const rows = new Map<string, Uint8Array>();
  const fault = { save: false, writes: 0, factories: 0, bodies: 0, inventory: 0, afterSave: () => {} };
  const matches = (key: string, prefix: string[]) => prefix.every((p, i) => JSON.parse(key)[i] === p);
  const storage: MetadataStorageFactory = () => {
    fault.factories++;
    return {
      load: async key => rows.get(JSON.stringify(key))?.slice(),
      save: async (key, bytes) => {
        if (fault.save) throw new DOMException('synthetic quota', 'QuotaExceededError');
        rows.set(JSON.stringify(key), bytes.slice()); fault.writes++; fault.afterSave();
      },
      remove: async key => { rows.delete(JSON.stringify(key)); },
      loadRange: async prefix => [...rows].filter(([key]) => matches(key, prefix)).map(([key, data]) => ({ key: JSON.parse(key), data: data.slice() })),
      removeRange: async prefix => { for (const key of rows.keys()) if (matches(key, prefix)) rows.delete(key); },
    } satisfies MetadataStoragePort;
  };
  const records = fixture() as { schema: JsonObject; identity: JsonObject } & JsonObject;
  const rep = (records.representationsById as Record<string, any>)[id('rep')];
  const executor = developmentContentVerifier([{ variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest }]);
  let presence: Awaited<ReturnType<VerifiedInventoryPort['inspect']>> = 'verified-present';
  const inventory: VerifiedInventoryPort = { inspect: async () => { fault.inventory++; return presence; } };
  const verifier = (write: boolean) => new PersistentContentVerifier(fs, limits,
    { scope: executor.scope, verify: async q => { fault.bodies++; return executor.verify(q); } }, 'synthetic-executor-1', inventory, write);
  const session = () => new MetadataProjectSession(fs, storage, limits, verifier);
  return { fs, rows, fault, records, storage, session, verifier, inventory, setPresence: (v: typeof presence) => { presence = v; } };
}
function textCandidates(source: NonNullable<Awaited<ReturnType<MetadataProjectSession['read']>>['source']>, name: string) {
  const read = inspectAtomicHistory(source.read().history, limits);
  if (read.kind !== 'atomic-history-inspection') throw Error('test history rejected');
  return read.fields.find(f => f.path.join('/') === `captionsById/${id('cap')}/${name}`)!.candidates.map(c => c.value);
}
const fullSource = (source: ProjectMetadataSource): FullMetadataSource => ({
  packageId: id('pkg'), metadataBytes: source.encodeFullSource(), proof: source.proof, remoteHeads: source.heads,
});

describe('local generation capabilities (ports only, not backup restore/selection acceptance)', () => {
  const nextId = 'd'.repeat(32);
  function local() {
    const fs = new FaultFS(), original = setup(fs);
    const databases = new Map<WorkspaceGenerationId, ReturnType<typeof setup>>([[null, original]]);
    const allowed = new Set<WorkspaceGenerationId>([null]);
    const opened: { id: WorkspaceGenerationId; create: boolean }[] = [];
    let closed = 0;
    const bind = (generationId: WorkspaceGenerationId, allowCreate = false, onCheck = async () => {}) =>
      openWorkspaceGeneration(fs, { generationId, allowCreate, assertSelected: async () => {
        await onCheck(); if (!allowed.has(generationId)) throw Error('Retired generation');
      } }, async (id, create) => {
        opened.push({ id, create });
        if (!databases.has(id)) { if (!create) throw Error('Missing database'); databases.set(id, setup(fs)); }
        return { factory: databases.get(id)!.storage, dispose: async () => { closed++; } };
      });
    return { fs, original, databases, allowed, opened, bind, closed: () => closed };
  }
  const deferred = () => { let release!: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

  it('retains the original name/Repo history and isolates restored storage and package paths', async () => {
    const f = local(), old = await f.bind(null), source = ProjectMetadataSource.bootstrap(f.original.records.schema,
      f.original.records.identity, limits).initialize(f.original.records);
    const later = await source.prepareCaptionText(source.token, id('cap'), 'body', '手元の新しい記録');
    const repositoryId = 'b'.repeat(32), oldRepo = new MetadataRepository(old.fs, old.factory, limits);
    await underWriteLease(old.fs, () => oldRepo.persist(repositoryId, later));
    await old.fs.writeText('v2/packages/evidence/old', 'old base evidence');
    const originalRows = [...f.original.rows].map(([key, bytes]) => [key, [...bytes]]);
    f.allowed.add(nextId); const next = await f.bind(nextId, true);
    expect(next.fs.mutationAuthority).toBe(old.fs.mutationAuthority);
    const nextRepo = new MetadataRepository(next.fs, next.factory, limits);
    await nextRepo.assertImportNamespace();
    await underWriteLease(next.fs, () => nextRepo.persist(repositoryId, source));
    await next.fs.writeText(`${next.fs.projectRoot}/v2/packages/evidence/restored`, 'restored base evidence');
    await f.fs.writeText('v2/local-restore/job', 'root-only');
    expect(await old.fs.list('')).toEqual(['v2/packages/evidence/old']);
    expect((await oldRepo.read(repositoryId, source.proof))?.originalChanges()).toEqual(later.originalChanges());
    const cold = await f.bind(nextId);
    expect((await new MetadataRepository(cold.fs, cold.factory, limits).read(repositoryId, source.proof))?.originalChanges())
      .toEqual(source.originalChanges());
    await next.factory().removeRange([]);
    expect(await next.factory().loadRange([])).toEqual([]);
    expect([...f.original.rows].map(([key, bytes]) => [key, [...bytes]])).toEqual(originalRows);
    expect(generationDatabaseName('existing-database', null)).toBe('existing-database');
    expect(generationDatabaseName('existing-database', nextId)).toBe(`existing-database-generation-${nextId}`);
  });

  it('does not initialize a missing selected database or bypass a failed pre-open fence', async () => {
    const f = local(); f.allowed.add(nextId);
    await expect(f.bind(nextId)).rejects.toThrow('Missing database');
    expect(f.databases.has(nextId)).toBe(false);
    f.allowed.delete(nextId);
    await expect(f.bind(nextId, true)).rejects.toThrow('Retired');
    expect(f.opened).toEqual([{ id: nextId, create: false }]);
    const entered = deferred(), release = deferred(); let disposals = 0;
    const opening = openWorkspaceGeneration(f.fs, { generationId: null, allowCreate: false,
      assertSelected: async () => { if (!f.allowed.has(null)) throw Error('Retired'); } }, async () => {
        entered.release(); await release.promise;
        return { factory: f.original.storage, dispose: async () => { disposals++; } };
      });
    await entered.promise; f.allowed.delete(null); release.release();
    await expect(opening).rejects.toThrow('Retired'); expect(disposals).toBe(1);
  });

  it('rejects path escape/reserved access without changing sibling data', async () => {
    const f = local(), old = await f.bind(null); f.allowed.add(nextId); const next = await f.bind(nextId, true);
    for (const path of ['../x', '/x', 'v2//x', 'v2/../x', 'v2\\x', 'v2/generations/x', 'v2/local-restore/job']) {
      expect(() => old.fs.writeText(path, 'bad')).toThrow();
    }
    expect(() => next.fs.remove('v2/packages/evidence/old')).toThrow();
    expect(() => next.fs.list('')).toThrow();
    expect(await f.fs.list('')).toEqual([]);
    await expect(f.bind('../bad', true)).rejects.toThrow();
  });

  it('rejects every stale FS/IDB operation and even a no-I/O lease action', async () => {
    const f = local(), old = await f.bind(null), port = old.factory();
    await old.fs.writeBytes('body', new Uint8Array([1])); await port.save(['doc'], new Uint8Array([2]));
    const handle = await old.fs.readStream('body');
    f.allowed.delete(null);
    const actions = [() => old.fs.readText('body'), () => old.fs.readBytes('body'), () => old.fs.readBytesFrom('body', 0),
      () => old.fs.readStream('body'), () => old.fs.list(''), () => old.fs.exists('body'), () => old.fs.remove('body'),
      () => old.fs.writeText('body', 'bad'), () => old.fs.appendText('body', 'bad'),
      () => old.fs.writeBytes('body', new Uint8Array([3])), () => old.fs.appendBytes('body', new Uint8Array([3])),
      () => port.load(['doc']), () => port.save(['doc'], new Uint8Array([3])), () => port.remove(['doc']),
      () => port.loadRange([]), () => port.removeRange([]), () => underWriteLease(old.fs, async () => 'false success'),
      () => handle!.blob!(), () => handle!.stream().getReader().read()];
    for (const action of actions) await expect(action()).rejects.toThrow('Retired');
    let cancelled = false;
    await expect(old.fs.writeStream('body', new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } })))
      .rejects.toThrow('Retired');
    expect(cancelled).toBe(true); expect(await f.fs.readBytes('body')).toEqual(new Uint8Array([1]));
    expect(await f.original.storage().load(['doc'])).toEqual(new Uint8Array([2]));
  });

  it('serializes both generation service calls with the original root queue and rechecks queued work', async () => {
    const f = local(), old = await f.bind(null); f.allowed.add(nextId); const next = await f.bind(nextId, true);
    const entered = deferred(), release = deferred(), order: string[] = [];
    const first = underWriteLease(old.fs, async () => { order.push('old'); entered.release(); await release.promise; });
    await entered.promise;
    const second = underWriteLease(next.fs, async () => { order.push('next'); });
    await Promise.resolve(); expect(order).toEqual(['old']);
    release.release(); await Promise.all([first, second]); expect(order).toEqual(['old', 'next']);
    const held = deferred(), proceed = deferred();
    const rootAction = underWriteLease(f.fs, async () => { held.release(); await proceed.promise; f.allowed.delete(null); });
    await held.promise;
    const stale = underWriteLease(old.fs, async () => { throw Error('must never execute'); });
    proceed.release(); await rootAction; await expect(stale).rejects.toThrow('Retired');
  });

  it('owns storage keys/bytes across asynchronous checks and disposes captured ports once', async () => {
    const f = local(), entered = deferred(), release = deferred(); let pause = false;
    const old = await f.bind(null, false, async () => { if (pause) { entered.release(); await release.promise; } });
    const port = old.factory(), key = ['doc'], bytes = new Uint8Array([1]); pause = true;
    const pending = port.save(key, bytes); await entered.promise; key[0] = 'other'; bytes[0] = 9; release.release(); await pending;
    pause = false;
    expect(await port.load(['doc'])).toEqual(new Uint8Array([1])); expect(await port.load(['other'])).toBeUndefined();
    await old.dispose(); await old.dispose(); expect(f.closed()).toBe(1);
    await expect(port.load(['doc'])).rejects.toThrow('generation-closed');
    expect(() => old.factory()).toThrow('generation-closed');
  });

  it('refuses late completion and cancels a stream after the bound generation changes', async () => {
    const f = local(), entered = deferred(), release = deferred();
    let cancelled = false, selected = true;
    const base = f.fs.readStream.bind(f.fs);
    f.fs.readStream = async path => path === 'slow' ? { size: 1,
      stream: () => new ReadableStream<Uint8Array>({ async pull(controller) {
        entered.release(); await release.promise; controller.enqueue(new Uint8Array([1]));
      }, cancel() { cancelled = true; } }, { highWaterMark: 0 }) } : base(path);
    const scope = await f.bind(null, false, async () => { if (!selected) throw Error('Retired'); });
    const handle = await scope.fs.readStream('slow'), reader = handle!.stream().getReader(), pending = reader.read();
    await entered.promise; selected = false; release.release();
    await expect(pending).rejects.toThrow('Retired'); expect(cancelled).toBe(true); reader.releaseLock();
    selected = true;
    await expect(underWriteLease(scope.fs, async () => { selected = false; return 'false completion'; })).rejects.toThrow('Retired');
  });

  it('streams/reopens the scoped root under the actual local lease and denies writes after release', async () => {
    const f = local(), coordinator = ProjectMutationCoordinator.local(), root = `validation-test/${nextId}`;
    const lease = await coordinator.tryAcquire(f.fs, root, nextId); lease.activateNewProject();
    const scope = await openWorkspaceGeneration(lease.workspace, { generationId: nextId, allowCreate: true,
      assertSelected: async () => {} }, async () => ({ factory: f.original.storage, dispose: async () => {} }));
    const path = `${scope.fs.projectRoot}/v2/packages/original`, bytes = new Uint8Array([1, 2, 3]);
    await underWriteLease(scope.fs, () => scope.fs.writeStream(path, new Blob([bytes]).stream()));
    expect(await scope.fs.list(`${scope.fs.projectRoot}/`)).toEqual([path]);
    const file = await scope.fs.readStream(path);
    const blob = await file!.blob!();
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    for (let i = 0; i < 2; i++) expect(new Uint8Array(await new Response(file!.stream()).arrayBuffer())).toEqual(bytes);
    expect(await scope.fs.readBytesFrom(path, 1)).toEqual({ size: 3, data: new Uint8Array([2, 3]) });
    const competitor = await coordinator.tryAcquire(f.fs, root, nextId);
    expect(competitor.accessState).not.toBe('editable'); competitor.release();
    lease.release();
    await expect(scope.fs.remove(path)).rejects.toThrow();
    await expect(scope.factory().save(['doc'], bytes)).rejects.toThrow();
    expect(await f.fs.readBytes(path)).toEqual(bytes);
    await scope.dispose();
  });

  it('owns a streamed chunk before the asynchronous post-read fence', async () => {
    const f = local(), entered = deferred(), release = deferred(), bytes = new Uint8Array([1]);
    let delivered = false;
    f.fs.readStream = async () => ({ size: 1, stream: () => new ReadableStream<Uint8Array>({ pull(controller) {
      delivered = true; controller.enqueue(bytes); controller.close();
    } }, { highWaterMark: 0 }) });
    const scope = await f.bind(null, false, async () => { if (delivered) { entered.release(); await release.promise; } });
    const file = await scope.fs.readStream('body'), result = new Response(file!.stream()).arrayBuffer();
    await entered.promise; bytes[0] = 9; release.release();
    expect(new Uint8Array(await result)).toEqual(new Uint8Array([1]));
  });
});
function checked(read: MetadataSessionRead) {
  if (read.provider?.kind !== 'scene-provider') throw Error('Expected a verified provider');
  return { ...read, provider: read.provider };
}

/** Real original metadata/controls; this journal fixture does not claim body/profile admission. */
async function workspaceRemote(source: ProjectMetadataSource, final: ProjectMetadataSource) {
  const bytes = source.encodeFullSource(), inspection = await source.inspectOriginal({ maxNodes: 100_000, maxWork: 1_000_000 });
  const summary = summarizeFullHistory(inspection), closure = planWorkspaceClosure(inspection.candidates);
  const metadata = { path: 'metadata.am', sha256: await digest(bytes), byteLength: bytes.length };
  const entries = [metadata, ...closure.entries], blobBytes = closure.entries.reduce((n, e) => n + e.byteLength, 0);
  const manifest = { format: PACKAGE_FORMAT, wireVersion: PACKAGE_WIRE_VERSION, packageId: id('pkg'), createdByVersion: 'test',
    purpose: 'teamWorkspace', identity: source.proof.identity, metadataEnvelope: source.proof.envelope, targetHeads: source.heads,
    metadata, blobs: closure.entries, summary: { algorithm: 'lociview-project-summary-1', scope: 'entireHistory',
      entityClasses: summary.entityClasses, fieldClasses: summary.fieldClasses, blobEntryCount: closure.entries.length, blobBytes },
    payloadTotals: { entryCount: entries.length, uncompressedBytes: entries.reduce((n, e) => n + e.byteLength, 0), largestEntryBytes: Math.max(...entries.map(e => e.byteLength)) } };
  const manifestBytes = new TextEncoder().encode(json(manifest)), checksumBytes = new TextEncoder().encode(await digest(manifestBytes));
  readManifestControl(manifestBytes, checksumBytes);
  const proof: PackageRemoteBatchProof = { version: 'lociview-package-remote-1', source: { kind: 'fullMetadata',
    packageId: id('pkg'), manifest: { sha256: await digest(manifestBytes), byteLength: manifestBytes.length },
    checksum: { sha256: await digest(checksumBytes), byteLength: checksumBytes.length },
    metadata: { sha256: metadata.sha256, byteLength: metadata.byteLength }, metadataEnvelope: source.proof.envelope, remoteHeads: source.heads },
    expectedFinalHeads: final.heads };
  return { proof, bytes, manifestBytes, checksumBytes };
}

describe('full Workspace journal connection (memory ports, not a completed file receiver)', () => {
  async function staged() {
    const h = setup(), writer = h.session(), initial = await writer.create(h.records);
    const local = await writer.editCaption(initial.source!.token, id('cap'), 'body', '手元の記録');
    const first = await initial.source!.prepareCaptionText(initial.source!.token, id('cap'), 'title', '一巡目');
    const remote = await first.prepareCaptionText(first.token, id('cap'), 'title', '二巡目');
    const plan = planRemoteChanges(local.source!, remote, limits), input = await workspaceRemote(remote, plan.final);
    const journal = new TransactionJournal(h.fs, limits), prior = (await journal.entries()).at(-1)!;
    const start = { ...prior.start, transactionId: 'f'.repeat(32), predecessor: prior.start.transactionId,
      purpose: 'remotePackageMerge' as const, baseHeads: local.source!.heads };
    return { h, writer, local, remote, plan, input, journal, start };
  }
  it('seals exact controls with jcs-v2, retains local work and cold-publishes once from original changes', async () => {
    const f = await staged(), saved = structuredClone(f.input), reads = f.h.fault.bodies;
    const promise = underWriteLease(f.h.fs, () => f.journal.stage(f.start, f.plan.parts, [], f.input));
    // Capture owns independent originals; later caller mutations cannot change them.
    const owned = captureJournalRemote(saved, f.start.proof, limits);
    saved.bytes.fill(0); saved.manifestBytes.fill(0); saved.checksumBytes.fill(0);
    expect(owned.bytes).toEqual(f.input.bytes);
    const p = await promise;
    const preimage = { transactionId: f.start.transactionId, target: { identity: f.start.proof.identity, metadataEnvelope: f.start.proof.envelope },
      purpose: f.start.purpose, stagedBlobs: [], metadataBatch: { kind: f.start.purpose, baseHeads: f.start.baseHeads, changes: p.changes, ...f.input.proof } };
    expect(p.exactChangeSetDigest).toBe(await digest(new TextEncoder().encode(`lociview:v2:metadata-change-set:jcs-v2\n${json(preimage)}`)));
    expect(p.exactChangeSetDigest).not.toBe(await digest(new TextEncoder().encode(`lociview:v2:metadata-change-set:jcs-v1\n${json(preimage)}`)));
    for (const [name, bytes] of [['source-manifest.json', f.input.manifestBytes], ['source-manifest.sha256', f.input.checksumBytes], ['source-metadata.am', f.input.bytes]] as const)
      expect(await f.h.fs.readBytes(f.journal.path(f.start.transactionId, name))).toEqual(bytes);
    // Simulate a crash with only the first of two receiver parts durable.
    await underWriteLease(f.h.fs, () => new MetadataRepository(f.h.fs, f.h.storage, limits)
      .persist(f.start.repositoryId, f.local.source!.appendOriginal(f.plan.parts.slice(0, 1))));
    expect((await f.h.session().read()).source!.token).toBe(f.local.source!.token);
    const done = await f.h.session().retry(); expect(done.state).toBe('ready');
    expect(done.source!.originalChanges()).toEqual(f.plan.final.originalChanges());
    expect(textCandidates(done.source!, 'body')).toEqual([{ kind: 'value', value: '手元の記録' }]);
    const writes = f.h.fs.writes, metadataWrites = f.h.fault.writes;
    const cold = f.h.session(); expect((await cold.read()).source!.token).toBe(done.source!.token);
    expect((await cold.retry()).publication).toBe(done.publication);
    expect(f.h.fs.writes).toBe(writes); expect(f.h.fault.writes).toBe(metadataWrites); expect(f.h.fault.bodies).toBe(reads);
  });
  it.each(['source-manifest.json', 'source-manifest.sha256', 'source-metadata.am'])('never replenishes acknowledged %s from a retained input', async name => {
    const f = await staged(); await underWriteLease(f.h.fs, () => f.journal.stage(f.start, f.plan.parts, [], f.input));
    const path = f.journal.path(f.start.transactionId, name); await f.h.fs.remove(path);
    const writes = f.h.fs.writes, metadataWrites = f.h.fault.writes;
    await expect(f.h.session().retry()).rejects.toThrow();
    await expect(underWriteLease(f.h.fs, () => f.journal.stage(f.start, f.plan.parts, [], f.input))).rejects.toThrow();
    expect(await f.h.fs.readBytes(path)).toBeNull(); expect(f.h.fs.writes).toBe(writes); expect(f.h.fault.writes).toBe(metadataWrites);
    expect((await f.h.session().read()).source!.token).toBe(f.local.source!.token);
  });
  it('rejects changed manifest semantics, source descriptors and versions before any write', async () => {
    const f = await staged(), invalid: JournalRemoteInput[] = [];
    for (const mutate of [(p: any) => { p.version = 'future'; }, (p: any) => { p.source.kind = 'contributionDelta'; },
      (p: any) => { p.source.remoteHeads = f.local.source!.heads; }, (p: any) => { p.source.metadata.sha256 = '0'.repeat(64); },
      (p: any) => { p.source.extra = 1; }]) {
      const copy = structuredClone(f.input); mutate(copy.proof); invalid.push(copy);
    }
    for (const mutate of [(m: any) => { m.purpose = 'clean'; m.summary.scope = 'snapshot'; },
      (m: any) => { m.identity.projectId = id('prj', 9); }, (m: any) => { m.targetHeads = f.local.source!.heads; }]) {
      const copy = structuredClone(f.input), manifest = JSON.parse(new TextDecoder().decode(copy.manifestBytes)); mutate(manifest);
      copy.manifestBytes = new TextEncoder().encode(json(manifest)); copy.checksumBytes = new TextEncoder().encode(await digest(copy.manifestBytes));
      copy.proof.source.manifest = { sha256: await digest(copy.manifestBytes), byteLength: copy.manifestBytes.length };
      copy.proof.source.checksum = { sha256: await digest(copy.checksumBytes), byteLength: 64 }; invalid.push(copy);
    }
    const writes = f.h.fs.writes;
    for (const input of invalid) await expect(underWriteLease(f.h.fs, () => f.journal.stage(f.start, f.plan.parts, [], input))).rejects.toThrow();
    expect(f.h.fs.writes).toBe(writes); expect((await f.h.session().read()).state).toBe('ready');
  });
  it('supports only canonical multi-body deltas in the new branch and verifies them again before publication', async () => {
    const f = await staged(), refs: JsonObject[] = ['a', 'b'].map(c => ({ algorithm: 'sha256', digest: c.repeat(64), byteLength: 7, mediaType: 'image/png' }));
    for (const delta of [[refs[1]!, refs[0]!], [refs[0]!, refs[0]!], [refs[0]!, { ...refs[0]!, byteLength: 8 }].sort((a, b) => json(a) < json(b) ? -1 : 1)])
      await expect(underWriteLease(f.h.fs, () => f.journal.stage(f.start, f.plan.parts, delta, f.input))).rejects.toThrow();
    const p = await underWriteLease(f.h.fs, () => f.journal.stage(f.start, f.plan.parts, refs, f.input)); expect(p.stagedBlobs).toEqual(refs);
    await expect(f.h.session().retry()).rejects.toThrow('media-unconnected');
    const verified: (readonly JsonObject[])[] = [];
    const cold = new MetadataProjectSession(f.h.fs, f.h.storage, limits, f.h.verifier, {
      stage: async () => { throw Error('recovery must not stage'); }, verify: async refs => { verified.push(refs); },
    });
    expect((await cold.retry()).state).toBe('ready'); expect(verified).toEqual([refs]);
  });
  it('rechecks complete missing originals and refuses a correctly sealed incomplete set', async () => {
    const f = await staged(); await underWriteLease(f.h.fs, () => f.journal.stage(f.start, f.plan.parts.slice(0, 1), [], f.input));
    await expect(f.h.session().retry()).rejects.toThrow('remote-complete-set');
    expect((await f.h.session().read()).source!.token).toBe(f.local.source!.token);
  });
});

describe('streamed bodies connected to metadata creation (memory FS/fake origin locks, not adoption)', () => {
  const budget = { maxBlobBytes: 65536, maxChunkBytes: 65536, maxChunks: 4096, metadata: limits };
  const locks = () => {
    const held = new Set<string>(), names: string[] = [];
    const manager = { async request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<unknown>) {
      expect(options).toEqual({ mode: 'exclusive', ifAvailable: true }); names.push(name);
      if (held.has(name)) return callback(null);
      held.add(name); try { return await callback({ name, mode: 'exclusive' }); } finally { held.delete(name); }
    } } as unknown as LockManager;
    return { manager, names };
  };
  const chunks = (bytes: Uint8Array, step = 7) => {
    let at = 0;
    return new ReadableStream<Uint8Array>({ pull(c) {
      if (at === bytes.length) { c.close(); return; }
      const end = Math.min(at + step, bytes.length); c.enqueue(bytes.slice(at, end)); at = end;
    } }, { highWaterMark: 0 });
  };
  class Bodies extends FaultFS {
    bodyReads = 0; mode: 'normal' | 'quota' | 'early' | 'readback-corrupt' = 'normal';
    override async readBytes(path: string) {
      if (path.startsWith('v2/cas/objects/')) throw Error('whole body read forbidden');
      return super.readBytes(path);
    }
    override async readStream(path: string) {
      const file = await super.readStream(path); if (!file || !path.startsWith('v2/cas/objects/')) return file;
      return { size: file.size, stream: () => { this.bodyReads++; return file.stream(); } };
    }
    override async writeStream(path: string, stream: ReadableStream<Uint8Array>) {
      if (this.mode === 'quota' || this.mode === 'early') {
        const reader = stream.getReader(), r = await reader.read();
        if (!r.done) await super.writeBytes(path, r.value);
        await reader.cancel(); reader.releaseLock();
        if (this.mode === 'quota') throw new DOMException('synthetic quota', 'QuotaExceededError');
        return;
      }
      await super.writeStream(path, stream);
      if (this.mode === 'readback-corrupt') await super.writeBytes(path, new Uint8Array([99]));
    }
  }
  const readAll = async (store: OriginBlobStore, ref: JsonObject | StoredBlobRef) => {
    const file = await store.open(ref), reader = file.stream().getReader();
    const parts: Uint8Array[] = []; let count = 0;
    try { for (;;) { const r = await reader.read(); if (r.done) break; parts.push(r.value); count += r.value.length; } }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(count); let at = 0; for (const p of parts) { bytes.set(p, at); at += p.length; } return bytes;
  };
  const captureSetup = async (records = fixture()) => {
    const fs = new Bodies(), h = setup(fs), lock = locks(); Object.assign(h.records, records);
    const store = () => new OriginBlobStore(fs, budget, lock.manager);
    // Deliberately do not seed inactive/weak representations.
    const bodies = [records.representationsById[id('rep')], ...Object.values(records.mediaResourcesById)] as JsonObject[];
    for (const record of bodies) {
      const blob = record.blob as JsonObject;
      await store().put(chunks((await developmentContentBytes(record))!), blob.mediaType as string, blob);
    }
    const executor = developmentContentVerifier(Object.values(records.representationsById).map((r: any) =>
      ({ variantFamilyId: r.variantFamilyId, representationId: r.id, payloadDigest: r.payloadDigest })), r => readAll(store(), r.blob as JsonObject));
    const session = () => new MetadataProjectSession(fs, h.storage, limits, write => new PersistentContentVerifier(fs, limits,
      executor, 'workspace-source-fixture-1', blobInventory(store(), limits), write));
    const writer = session(), initial = await writer.create(h.records); expect(initial.state).toBe('ready');
    return { ...h, fs, store, session, writer, initial, lock };
  };

  it('verifies read-only bodies without writer locks or diagnostics, and refuses oversized raw chunks', async () => {
    const fs = new Bodies(), lock = locks(), store = new OriginBlobStore(fs, budget, lock.manager);
    const bytes = new Uint8Array([1, 2, 3]), ref = await store.put(chunks(bytes), 'application/octet-stream');
    const readerStore = new OriginBlobStore(fs, budget, null), writes = fs.writes, leases = lock.names.length;
    const consume = async (chunkLimit = 3) => {
      const file = await readerStore.openReadOnly(ref, { ...budget, maxChunkBytes: chunkLimit });
      const reader = file.stream().getReader();
      try { while (!(await reader.read()).done) {} } finally { reader.releaseLock(); }
    };
    await consume(); await expect(consume(2)).rejects.toMatchObject({ code: 'limit' });
    await expect(readerStore.openReadOnly(ref, { ...budget, maxChunks: NaN })).rejects.toMatchObject({ code: 'invalid' });
    const path = (await fs.list('v2/cas/objects/'))[0]!;
    await fs.writeBytes(path, new Uint8Array([1, 2, 4])); const afterCorruption = fs.writes;
    await expect(consume()).rejects.toMatchObject({ code: 'mismatch' });
    expect(fs.writes).toBe(afterCorruption); expect(afterCorruption).toBe(writes + 1);
    expect(lock.names).toHaveLength(leases); expect(await fs.list('v2/cas/suspect/')).toEqual([]);
    expect(await readerStore.inspect(ref)).toBe('verified-present'); // No diagnostic marker; not a digest claim.
  });

  it('captures exact history plus deduplicated strong bodies, excluding a distinct weak historical model', async () => {
    const records = fixture(), old = createFixtureModel({ asset: id('ast'), assetFrame: id('frm', 2), representationFrame: id('frm', 4),
      representation: id('rep', 2), revision: id('rev', 2), binding: id('bnd', 2), family: id('fam', 2), compatibility: id('cmp', 2),
      layout: id('lay', 2), slot: id('slot', 2) }, 'updated', { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 });
    records.representationsById[old.representation.id] = old.representation; records.assetRevisionsById[old.revision.id] = old.revision;
    records.captionsById[id('cap')].anchor.authoredAssetRevisionId = old.revision.id;
    records.captionsById[id('cap')].anchor.authoredAnchorCompatibilityId = id('cmp', 2);
    const image = Object.values(records.mediaResourcesById)[0] as any;
    const copy = { ...image, id: id('med', 2) }; copy.payloadDigest = await immutableDigest('media-resource', copy);
    records.mediaResourcesById[copy.id] = copy;
    records.captionAttachmentsById[id('att', 2)] = { ...records.captionAttachmentsById[id('att')], id: id('att', 2), mediaResourceId: copy.id, orderKey: 'B' };
    const h = await captureSetup(records);
    const edited = await h.writer.editCaption(h.initial.source!.token, id('cap'), 'body', '参加者の追記');
    const writes = h.fs.writes, rowWrites = h.fault.writes, reads = h.fs.bodyReads, leases = h.lock.names.length;
    const capture = await WorkspaceSourceCapture.prepare(h.session(), edited.source!.token, h.store(), limits);
    expect(capture.blobs.map(e => e.sha256).sort()).toEqual([records.representationsById[id('rep')].blob.digest, image.blob.digest].sort());
    expect(capture.blobs.some(e => e.sha256 === old.representation.blob.digest)).toBe(false);
    expect(capture.summary.blobEntryCount).toBe(2);
    expect(capture.summary.blobBytes).toBe(records.representationsById[id('rep')].blob.byteLength + image.blob.byteLength);
    expect(capture.summary.entityClasses).toContainEqual({ class: 'mediaResourcesById', count: 2 });
    expect(capture.summary.entityClasses).toContainEqual({ class: 'representationsById', count: 2 });
    const reopened = ProjectMetadataSource.fromFullSource(capture.metadataBytes(), capture.proof, limits);
    expect(reopened.originalChanges()).toEqual(edited.source!.originalChanges());
    expect(reopened.heads).toEqual(capture.targetHeads); expect(capture.publication).toBe(edited.publication);
    capture.metadataBytes().fill(0); expect(await digest(capture.metadataBytes())).toBe(capture.metadata.sha256);
    expect(h.fs.bodyReads - reads).toBe(2); expect(h.fs.writes).toBe(writes); expect(h.fault.writes).toBe(rowWrites);
    expect(h.lock.names).toHaveLength(leases);
    expect((await h.session().read()).source!.token).toBe(edited.source!.token);
    const parts: BlobPart[] = [];
    const generated = await writeWorkspaceArchive(capture, h.store(), new WritableStream({ write(bytes) { parts.push(bytes.slice() as BlobPart); } }),
      { packageId: id('pkg'), createdByVersion: '0.0.1' });
    const archive = await WorkspaceArchive.inspect(new Blob(parts), limits);
    expect(archive.archive.sha256).toBe(generated.sha256);
    expect(archive.source.originalChanges()).toEqual(edited.source!.originalChanges());
    expect(archive.blobs).toEqual(capture.blobs);
    for (const record of [records.representationsById[id('rep')], image]) {
      const bytes = new Uint8Array(await archive.archive.entryBlob(`blobs/sha256/${record.blob.digest}`).arrayBuffer());
      expect(bytes).toEqual(await developmentContentBytes(record));
    }
    expect(h.fs.writes).toBe(writes); expect(h.fault.writes).toBe(rowWrites); expect(h.lock.names).toHaveLength(leases);
    const stillReady = await h.session().read();
    expect(stillReady.publication).toBe(edited.publication); expect(stillReady.source!.token).toBe(edited.source!.token);
  });

  it('refuses pending/stale captures, retaining edits and requiring one unchanged publication', async () => {
    const h = await captureSetup(), initial = h.initial;
    const files = h.fs.writes, rows = h.fault.writes;
    await expect(WorkspaceSourceCapture.prepare(h.session(), 'stale', h.store(), limits)).rejects.toThrow(/workspace-not-ready/);
    expect(h.fs.writes).toBe(files); expect(h.fault.writes).toBe(rows);
    let changed = false;
    await expect(WorkspaceSourceCapture.prepare(h.session(), initial.source!.token, { openReadOnly: async (ref, ceilings) => {
      if (!changed) { changed = true; await h.writer.editCaption(initial.source!.token, id('cap'), 'body', '検証中の追記'); }
      return h.store().openReadOnly(ref, ceilings);
    } }, limits)).rejects.toThrow(/workspace-not-ready/);
    const edited = await h.session().read(); expect(textCandidates(edited.source!, 'body')).toEqual([{ kind: 'value', value: '検証中の追記' }]);
    let calls = 0;
    await expect(WorkspaceSourceCapture.prepare({ read: async () => ({ ...(await h.session().read()),
      publication: ++calls === 1 ? edited.publication : 'different-publication' }) }, edited.source!.token, h.store(), limits)).rejects.toThrow(/workspace-publication-changed/);
    h.fs.reject = path => path.endsWith('/published.json');
    await expect(h.writer.editCaption(edited.source!.token, id('cap'), 'title', '中断した編集')).rejects.toThrow();
    const pendingWrites = h.fs.writes, pendingRows = h.fault.writes, pendingReads = h.fs.bodyReads;
    await expect(WorkspaceSourceCapture.prepare(h.session(), edited.source!.token, h.store(), limits)).rejects.toThrow(/workspace-not-ready/);
    expect(h.fs.writes).toBe(pendingWrites); expect(h.fault.writes).toBe(pendingRows); expect(h.fs.bodyReads).toBe(pendingReads);
    h.fs.reject = () => false;
    const resumed = await h.session().retry();
    const capture = await WorkspaceSourceCapture.prepare(h.session(), resumed.source!.token, h.store(), limits);
    expect(capture.targetHeads).toEqual(resumed.source!.heads);
  });

  it.each(['missing', 'same-size-corrupt'] as const)('rejects %s bodies with no writes or completed capture', async damage => {
    const h = await captureSetup(), token = h.initial.source!.token;
    const path = (await h.fs.list('v2/cas/objects/'))[0]!;
    if (damage === 'missing') await h.fs.remove(path);
    else {
      const bytes = (await MemoryFS.prototype.readBytes.call(h.fs, path))!; bytes[0] = bytes[0]! ^ 1;
      await h.fs.writeBytes(path, bytes);
    }
    const writes = h.fs.writes, rows = h.fault.writes, leases = h.lock.names.length;
    await expect(WorkspaceSourceCapture.prepare(h.session(), token, h.store(), limits)).rejects.toThrow();
    expect(h.fs.writes).toBe(writes); expect(h.fault.writes).toBe(rows); expect(h.lock.names).toHaveLength(leases);
    expect(await h.fs.list('v2/cas/suspect/')).toEqual([]);
    expect((await h.session().read()).source!.originalChanges()).toEqual(h.initial.source!.originalChanges());
  });

  it('cancels a blocked body stream without completing or acknowledging a capture', async () => {
    const h = await captureSetup(), abort = new AbortController(); let entered!: () => void, cancelled = false;
    const reading = new Promise<void>(resolve => { entered = resolve; });
    const writes = h.fs.writes, rows = h.fault.writes;
    const capture = WorkspaceSourceCapture.prepare(h.session(), h.initial.source!.token, { openReadOnly: async ref => ({ size: ref.byteLength as number,
      stream: () => new ReadableStream<Uint8Array>({ pull() { entered(); return new Promise<void>(() => {}); }, cancel() { cancelled = true; } }, { highWaterMark: 0 }) }) }, limits, abort.signal);
    const rejected = expect(capture).rejects.toMatchObject({ name: 'AbortError' });
    await reading; abort.abort(); await rejected;
    expect(cancelled).toBe(true); expect(h.fs.writes).toBe(writes); expect(h.fault.writes).toBe(rows);
    expect((await h.session().read()).publication).toBe(h.initial.publication);
  });
  it('stages arbitrary chunks, reads saved bytes back, deduplicates across stores and refuses missing/busy origin locks', async () => {
    const fs = new Bodies(), lock = locks(), a = new OriginBlobStore(fs, budget, lock.manager), b = new OriginBlobStore(fs, budget, lock.manager);
    const bytes = Uint8Array.from({ length: 97 }, (_, i) => i), ref = await a.put(chunks(bytes), 'application/octet-stream');
    expect(ref).toEqual({ algorithm: 'sha256', digest: await digest(bytes), byteLength: 97, mediaType: 'application/octet-stream' });
    expect(await a.inspect(ref)).toBe('verified-present'); expect(await readAll(b, ref)).toEqual(bytes);
    const files = await fs.list('v2/cas/objects/'); expect(files).toHaveLength(1);
    expect(await b.put(chunks(bytes, 3), 'application/octet-stream', ref)).toEqual(ref);
    expect(await fs.list('v2/cas/objects/')).toEqual(files); expect(new Set(lock.names).size).toBe(1);
    const partitioned = new OriginBlobStore(fs, { ...budget, maxChunkBytes: 7, maxChunks: 14 }, lock.manager);
    await partitioned.put(chunks(bytes, 7), ref.mediaType, ref); expect(await readAll(partitioned, ref)).toEqual(bytes);
    const noLock = new OriginBlobStore(fs, budget, null), before = await fs.list('v2/cas/');
    await expect(noLock.put(chunks(bytes), ref.mediaType)).rejects.toMatchObject({ code: 'busy' }); expect(await fs.list('v2/cas/')).toEqual(before);
    const abort = new AbortController(); let entered!: () => void; const ready = new Promise<void>(r => { entered = r; });
    const slow = new ReadableStream<Uint8Array>({ pull() { entered(); return new Promise<void>(() => {}); } }, { highWaterMark: 0 });
    const first = a.put(slow, ref.mediaType, undefined, abort.signal); const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await ready; await expect(b.put(chunks(bytes), ref.mediaType)).rejects.toMatchObject({ code: 'busy' });
    abort.abort(); await rejected;
    expect(await a.inspect(ref)).toBe('verified-present');
  });
  it('never publishes mismatch, limited, cancelled, short-sink or quota attempts; retry and marker recovery do not overwrite bodies', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]), expected = { algorithm: 'sha256' as const, digest: await digest(bytes), byteLength: 4, mediaType: 'application/octet-stream' };
    const fs = new Bodies(), lock = locks(), store = new OriginBlobStore(fs, budget, lock.manager);
    for (const input of [new Uint8Array([1, 2]), new Uint8Array([1, 2, 3, 5])])
      await expect(store.put(chunks(input), expected.mediaType, expected)).rejects.toMatchObject({ code: 'mismatch' });
    for (const mode of ['quota', 'early', 'readback-corrupt'] as const) {
      fs.mode = mode; await expect(store.put(chunks(bytes, 1), expected.mediaType, expected)).rejects.toThrow();
      expect(await store.inspect(expected)).toBe('unverified'); expect(await fs.list('v2/cas/sha256/')).toHaveLength(0);
    }
    fs.mode = 'normal';
    const limited = new OriginBlobStore(fs, { ...budget, maxChunkBytes: 2 }, lock.manager);
    await expect(limited.put(chunks(bytes, 4), expected.mediaType)).rejects.toMatchObject({ code: 'limit' });
    const many = new OriginBlobStore(fs, { ...budget, maxChunks: 1 }, lock.manager);
    await expect(many.put(chunks(bytes, 1), expected.mediaType)).rejects.toMatchObject({ code: 'limit' });
    const large = new OriginBlobStore(fs, { ...budget, maxBlobBytes: 2 }, lock.manager);
    await expect(large.put(chunks(bytes, 1), expected.mediaType)).rejects.toMatchObject({ code: 'limit' });
    fs.reject = path => path.startsWith('v2/cas/sha256/');
    await expect(store.put(chunks(bytes), expected.mediaType, expected)).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(await store.inspect(expected)).toBe('unverified'); fs.reject = () => false;
    const orphanPaths = await fs.list('v2/cas/objects/'); const before = await Promise.all(orphanPaths.map(path => MemoryFS.prototype.readBytes.call(fs, path)));
    await store.put(chunks(bytes), expected.mediaType, expected); expect(await store.inspect(expected)).toBe('verified-present');
    expect(await Promise.all(orphanPaths.map(path => MemoryFS.prototype.readBytes.call(fs, path)))).toEqual(before);
  });
  it('detects actual stored corruption on verify and keeps suspicion across a new store; torn receipts never repair themselves', async () => {
    const fs = new Bodies(), lock = locks(), store = new OriginBlobStore(fs, budget, lock.manager), bytes = new Uint8Array([3, 4, 5]);
    const ref = await store.put(chunks(bytes), 'application/octet-stream'), path = (await fs.list('v2/cas/objects/'))[0]!;
    await fs.writeBytes(path, new Uint8Array([3, 4, 6]));
    expect(await store.inspect(ref)).toBe('verified-present'); // Size-only metadata inspection is not cryptographic readback.
    await expect(store.verify(ref)).rejects.toMatchObject({ code: 'corrupt' });
    const cold = new OriginBlobStore(fs, budget, lock.manager); expect(await cold.inspect(ref)).toBe('suspect');
    await expect(cold.open(ref)).rejects.toMatchObject({ code: 'unverified' });
    await expect(cold.put(chunks(bytes), ref.mediaType, ref)).rejects.toThrow();
    expect(await MemoryFS.prototype.readBytes.call(fs, path)).toEqual(new Uint8Array([3, 4, 6]));
    const other = await store.put(chunks(new Uint8Array([8, 9])), ref.mediaType);
    const receipt = `v2/cas/sha256/${other.digest.slice(0, 2)}/${other.digest.slice(2)}.json`;
    const valid = JSON.parse((await fs.readText(receipt))!);
    await fs.writeText(receipt, json({ ...valid, objectId: [valid.objectId] })); expect(await cold.inspect(other)).toBe('suspect');
    await fs.writeText(receipt, '{'); expect(await cold.inspect(other)).toBe('suspect');
    await expect(cold.put(chunks(new Uint8Array([8, 9])), other.mediaType, other)).rejects.toThrow(); expect(await fs.readText(receipt)).toBe('{');
    const third = await store.put(chunks(new Uint8Array([10, 11])), ref.mediaType);
    const thirdReceipt = JSON.parse((await fs.readText(`v2/cas/sha256/${third.digest.slice(0, 2)}/${third.digest.slice(2)}.json`))!);
    await fs.writeBytes(`v2/cas/objects/${thirdReceipt.objectId}.bin`, new Uint8Array([10, 12]));
    await expect(readAll(store, third)).rejects.toMatchObject({ code: 'mismatch' });
    expect(await new OriginBlobStore(fs, budget, lock.manager).inspect(third)).toBe('suspect');
  });
  it('creates a Project only from saved Mesh/PNG handles, then saves/recovers/reopens without body reads or fixture fallback', async () => {
    const fs = new Bodies(), h = setup(fs), lock = locks();
    const store = () => new OriginBlobStore(fs, budget, lock.manager), records = h.records as Record<string, any>;
    const rep = records.representationsById[id('rep')], images = Object.values(records.mediaResourcesById) as JsonObject[];
    for (const r of [rep, ...images]) {
      const bytes = (await developmentContentBytes(r))!; expect(bytes).toBeDefined();
      await store().put(chunks(bytes), (r.blob as StoredBlobRef).mediaType, r.blob);
    }
    let executions = 0;
    const session = () => {
      const bodies = store(), inventory = blobInventory(bodies, limits);
      const executor = developmentContentVerifier([{ variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest }],
        r => readAll(bodies, r.blob as JsonObject));
      const verifier = (write: boolean) => new PersistentContentVerifier(fs, limits,
        { scope: executor.scope, verify: q => { executions++; return executor.verify(q); } }, 'saved-stream-fixture-1', inventory, write);
      return new MetadataProjectSession(fs, h.storage, limits, verifier);
    };
    const writer = session(), initial = await writer.create(h.records); expect(initial.state).toBe('ready');
    expect(executions).toBeGreaterThan(0); const calls = executions, reads = fs.bodyReads;
    const saved = await writer.editCaption(initial.source!.token, id('cap'), 'body', '新しい保存本体を使う'); expect(saved.state).toBe('ready');
    fs.reject = p => p.endsWith('/published.json');
    await expect(writer.editCaption(saved.source!.token, id('cap'), 'title', '復旧する')).rejects.toThrow();
    expect((await session().read()).source!.token).toBe(saved.source!.token); fs.reject = () => false;
    const recovered = await session().retry(), reopened = await session().read();
    expect(reopened.state).toBe('ready'); expect(reopened.source!.originalChanges()).toEqual(recovered.source!.originalChanges());
    expect(textCandidates(reopened.source!, 'title')).toEqual([{ kind: 'value', value: '復旧する' }]);
    expect(executions).toBe(calls); expect(fs.bodyReads).toBe(reads);
    const receiptPath = `v2/cas/sha256/${rep.blob.digest.slice(0, 2)}/${rep.blob.digest.slice(2)}.json`;
    const receipt = JSON.parse((await fs.readText(receiptPath))!), body = `v2/cas/objects/${receipt.objectId}.bin`;
    await fs.remove(body); const damaged = await session().read(); expect(damaged.state).toBe('repair-required');
    expect(damaged.source!.token).toBe(reopened.source!.token); await expect(session().editCaption(reopened.source!.token, id('cap'), 'body', '失敗')).rejects.toThrow();
    expect(executions).toBe(calls); expect(await fs.readText(receiptPath)).not.toBeNull();
    const empty = setup(new Bodies()), unseeded = new OriginBlobStore(empty.fs, budget, lock.manager);
    const fakeExecutor = developmentContentVerifier([{ variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest }],
      r => readAll(unseeded, r.blob as JsonObject));
    const refused = new MetadataProjectSession(empty.fs, empty.storage, limits, write => new PersistentContentVerifier(empty.fs, limits, fakeExecutor,
      'saved-stream-fixture-1', blobInventory(unseeded, limits), write));
    await expect(refused.create(empty.records)).rejects.toThrow(); expect((await refused.read()).publication).toBeNull(); expect(empty.rows.size).toBe(0);
  });
});

async function duplicateCaptionSetup(reverse = false) {
  const h = setup(), records = h.records as Record<string, any>;
  records.scenesById[id('scn', 2)] = { id: id('scn', 2), name: '詳細', orderKey: 'B', lifecycle: records.scenesById[id('scn')].lifecycle };
  records.sceneAssetMembershipsById[id('sam', 2)] = { ...records.sceneAssetMembershipsById[id('sam')], id: id('sam', 2), sceneId: id('scn', 2) };
  delete records.captionsById[id('cap')].colorSrgb;
  delete records.captionAttachmentsById[id('att')].altText;
  records.captionAttachmentsById[id('att', 2)] = { ...records.captionAttachmentsById[id('att')], id: id('att', 2), altText: '後の添付' };
  const writer = h.session(), first = checked(await writer.create(h.records));
  const include = (n: number): MetadataEdit => ({ kind: 'include', sceneId: id('scn', 2), resourceKind: 'caption', resourceId: id('cap'),
    membershipId: id('scm', n), orderKey: 'B', eventId: id('evt', n) });
  const remote = first.source!.prepareEdit(first.source!.token, include(reverse ? 2 : 3), first.provider!, '1'.repeat(32));
  const local = await writer.edit(first.source!.token, include(reverse ? 3 : 2));
  const merged = checked(await writer.receiveFullSource(local.source!.token, fullSource(remote)));
  const command: CaptionMembershipResolution = { kind: 'resolveCaptionMembership', sceneId: id('scn', 2), captionId: id('cap'),
    observedMembershipIds: [id('scm', 2), id('scm', 3)], originalMembershipId: id('scm', 2), choice: 'both', eventId: id('evt', 8),
    copies: [{ sourceMembershipId: id('scm', 3), captionId: id('cap', 8), membershipId: id('scm', 8),
      attachments: [{ sourceId: id('att'), targetId: id('att', 9) }, { sourceId: id('att', 2), targetId: id('att', 8) }],
      tags: [{ sourceId: id('tgm'), targetId: id('tgm', 8) }] }] };
  return { ...h, writer, first, remote, merged, command };
}

describe('complete-source Caption membership resolution on the metadata service', () => {
  it.each([false, true])('keeps independent content, anchors, attachments and tags; reverse receive=%s', async reverse => {
    const h = await duplicateCaptionSetup(reverse), token = h.merged.source!.token, bodies = h.fault.bodies;
    expect(captionMembershipGroups(h.merged.provider!, limits)).toEqual([{ sceneId: id('scn', 2), captionId: id('cap'), edgeIds: [id('scm', 2), id('scm', 3)] }]);
    const done = checked(await h.writer.edit(token, h.command)), r = done.provider.details.mutable;
    expect(done.source!.originalChanges()).toHaveLength(h.merged.source!.originalChanges().length + 1);
    expect(captionMembershipGroups(done.provider!, limits)).toEqual([]);
    expect(r.captionsById[id('cap', 8)]!.body).toEqual(r.captionsById[id('cap')]!.body);
    expect(r.captionsById[id('cap', 8)]!.anchor).toEqual(r.captionsById[id('cap')]!.anchor);
    expect(r.captionsById[id('cap', 8)]!.colorSrgb).toEqual({ kind: 'value', value: undefined });
    expect(r.captionAttachmentsById[id('att', 9)]!.altText).toEqual({ kind: 'value', value: undefined });
    expect(r.captionAttachmentsById[id('att', 8)]!.orderKey).toEqual({ kind: 'value', value: '0000000000002' });
    expect(r.captionAttachmentsById[id('att', 9)]!.orderKey).toEqual({ kind: 'value', value: '0000000000001' });
    expect(r.captionTagMembershipsById[id('tgm', 8)]!.tagId).toEqual(r.captionTagMembershipsById[id('tgm')]!.tagId);
    expect(r.sceneCaptionMembershipsById[id('scm')]).toEqual(h.first.provider!.details.mutable.sceneCaptionMembershipsById[id('scm')]);
    const edit = async (command: MetadataEdit) => h.writer.edit((await h.writer.read()).source!.token, command);
    await edit({ kind: 'editCaption', captionId: id('cap', 8), edits: { body: 'コピーだけの本文' } });
    const anchor = (h.records as Record<string, any>).captionsById[id('cap')].anchor;
    await edit({ kind: 'movePin', sceneId: id('scn', 2), captionId: id('cap', 8), anchor: { ...anchor, positionAsset: [1, 2, 3] } });
    await edit({ kind: 'editAttachment', sceneId: id('scn', 2), captionId: id('cap', 8), attachmentId: id('att', 8), field: 'altText', value: 'コピーの説明' });
    const reopened = checked(await h.session().read());
    expect(reopened.provider!.details.mutable.captionsById[id('cap')]).toEqual(h.first.provider!.details.mutable.captionsById[id('cap')]);
    expect(reopened.provider!.details.mutable.captionAttachmentsById[id('att', 2)]).toEqual(h.first.provider!.details.mutable.captionAttachmentsById[id('att', 2)]);
    expect(reopened.provider!.details.mutable.captionsById[id('cap', 8)]!.body).toEqual({ kind: 'value', value: 'コピーだけの本文' });
    const files = h.fs.writes;
    expect((await h.writer.receiveFullSource(reopened.source!.token, fullSource(h.remote))).source!.token).toBe(reopened.source!.token);
    expect(h.fs.writes).toBe(files); expect(h.fault.bodies).toBe(bodies);
    const unseen = h.first.source!.prepareEdit(h.first.source!.token, { kind: 'include', sceneId: id('scn', 2), resourceKind: 'caption',
      resourceId: id('cap'), membershipId: id('scm', 4), orderKey: 'B', eventId: id('evt', 4) }, h.first.provider!, '2'.repeat(32));
    const later = checked(await h.writer.receiveFullSource(reopened.source!.token, fullSource(unseen)));
    expect(captionMembershipGroups(later.provider!, limits)[0]!.edgeIds).toEqual([id('scm', 2), id('scm', 4)]);
    expect(Object.keys(later.provider!.details.mutable.captionsById)).toHaveLength(2);
  });

  it.each([false, true])('keeps one only after the explicit observed-edge choice; reverse receive=%s', async reverse => {
    const h = await duplicateCaptionSetup(reverse);
    const done = checked(await h.writer.edit(h.merged.source!.token, { ...h.command, choice: 'one', copies: [] }));
    expect(Object.keys(done.provider!.details.mutable.captionsById)).toHaveLength(1);
    expect(done.provider!.details.mutable.captionsById).toEqual(h.first.provider!.details.mutable.captionsById);
    expect(captionMembershipGroups(done.provider!, limits)).toHaveLength(0);
    expect(done.provider!.state.captionMemberships[id('scm', 2)]!.lifecycle).toEqual(
      { kind: 'value', value: { state: 'active', reason: 'initial', eventId: id('evt', 2) } });
  });

  it('rejects stale/incomplete choices and missing/colliding child IDs without writes', async () => {
    const h = await duplicateCaptionSetup(), token = h.merged.source!.token, writes = h.fs.writes, rows = h.fault.writes;
    const copy = h.command.copies[0]!;
    for (const command of [{ ...h.command, observedMembershipIds: [id('scm', 2)] },
      { ...h.command, copies: [{ ...copy, attachments: [] }] }, { ...h.command, copies: [{ ...copy, tags: [] }] },
      { ...h.command, copies: [{ ...copy, captionId: id('cap') }] },
      { ...h.command, copies: [{ ...copy, attachments: copy.attachments.map(c => ({ ...c, targetId: id('att', 8) })) }] }])
      await expect(h.writer.edit(token, command)).rejects.toThrow();
    await expect(h.writer.edit('stale', h.command)).rejects.toThrow();
    expect((await h.writer.read()).source!.token).toBe(token); expect(h.fs.writes).toBe(writes); expect(h.fault.writes).toBe(rows);
  });

  it('cold-recovers the same copy IDs and bytes after publication failure, without a partial copy', async () => {
    const h = await duplicateCaptionSetup(); h.fs.reject = p => p.endsWith('/published.json');
    await expect(h.writer.edit(h.merged.source!.token, h.command)).rejects.toThrow();
    const journal = new TransactionJournal(h.fs, limits), entry = (await journal.entries()).at(-1)!.prepared!;
    const bytes = await journal.validateParts(entry), pending = checked(await h.session().read());
    expect(pending.state).toBe('pending'); expect(pending.source!.token).toBe(h.merged.source!.token);
    expect(Object.keys(pending.provider!.details.mutable.captionsById)).toHaveLength(1);
    h.fs.reject = () => false; const done = checked(await h.session().retry());
    expect(done.source!.originalChanges()).toEqual(h.merged.source!.appendOriginal(bytes).originalChanges());
    expect(Object.keys(done.provider!.details.mutable.captionsById)).toEqual([id('cap'), id('cap', 8)]);
    expect((await h.session().retry()).source!.token).toBe(done.source!.token);
  });

  it('does not omit a deleted attachment with a concurrent edit or hide a candidate enumeration limit', async () => {
    const h = await duplicateCaptionSetup(), first = h.first;
    const deleted = first.source!.prepareEdit(first.source!.token, { kind: 'deleteAttachment', sceneId: id('scn'), captionId: id('cap'),
      attachmentId: id('att', 2), eventId: id('evt', 7) }, first.provider, '7'.repeat(32));
    const edited = first.source!.prepareEdit(first.source!.token, { kind: 'editAttachment', sceneId: id('scn'), captionId: id('cap'),
      attachmentId: id('att', 2), field: 'altText', value: '同時編集を失わない' }, first.provider, '8'.repeat(32));
    const concurrent = deleted.appendOriginal(edited.originalChanges());
    const received = checked(await h.writer.receiveFullSource(h.merged.source!.token, fullSource(concurrent)));
    expect(received.provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[1] === id('att', 2))).toBe(true);
    const writes = h.fs.writes, token = received.source!.token;
    await expect(h.writer.edit(token, h.command)).rejects.toThrow(/membership-resolution-delete-edit/);
    expect(h.fs.writes).toBe(writes); expect((await h.writer.read()).source!.token).toBe(token);
    expect(() => captionMembershipGroups(received.provider, { ...limits, maxWork: received.provider.inspection.candidates.fields.length + 2 }))
      .toThrow(/membership-resolution-limit/);
  });

  it('refuses unknown fields and ambiguous ownership/content from the complete candidates, not the projected DTO', async () => {
    const h = await duplicateCaptionSetup(), provider = h.merged.provider;
    for (const [map, name] of [['captionsById', 'body'], ['captionAttachmentsById', 'captionId'], ['captionTagMembershipsById', 'captionId'],
      ['sceneCaptionMembershipsById', 'captionId']] as const) {
      const changed = structuredClone(provider), field = changed.inspection.candidates.fields.find(f => f.path[0] === map && f.path[2] === name &&
        (map !== 'sceneCaptionMembershipsById' || f.path[1] === id('scm', 2)))!;
      const candidates = field.candidates as unknown as { operationId: string; value: { kind: string; value: unknown } }[];
      candidates.push({ ...candidates[0]!, operationId: '999@alternate', value: { kind: 'value', value: name === 'captionId' ? id('cap', 99) : '別の本文' } });
      expect(() => planMetadataEdit(changed, h.command, limits)).toThrow();
    }
    const changed = structuredClone(provider), fields = changed.inspection.candidates.fields as unknown as Record<string, unknown>[];
    fields.push({ ...fields.find(f => (f.path as string[]).join('/') === `captionsById/${id('cap')}/title`)!,
      path: ['captionsById', id('cap'), 'futureField'], hasUnknownFields: true });
    expect(() => planMetadataEdit(changed, h.command, limits)).toThrow(/unresolved|unknown/);
  });
});

describe('new-workspace metadata persistence service (memory ports, not device/activation evidence)', () => {
  it('receives a full remote history, retains local edits and cold-replays without a second transaction or body read', async () => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records), reads = h.fault.bodies;
    const local = await writer.editCaption(first.source!.token, id('cap'), 'body', '手元の本文');
    const r1 = await first.source!.prepareCaptionText(first.source!.token, id('cap'), 'title', '配布の途中');
    const remote = await r1.prepareCaptionText(r1.token, id('cap'), 'title', '配布されたタイトル');
    const input = fullSource(remote), done = await writer.receiveFullSource(local.source!.token, input);
    const expected = local.source!.appendOriginal(remote.originalChanges());
    expect(done.state).toBe('ready'); expect(done.source!.originalChanges()).toEqual(expected.originalChanges());
    expect(textCandidates(done.source!, 'body')).toEqual([{ kind: 'value', value: '手元の本文' }]);
    expect(textCandidates(done.source!, 'title')).toEqual([{ kind: 'value', value: '配布されたタイトル' }]);
    const entries = await new TransactionJournal(h.fs, limits).entries(), p = entries.at(-1)!.prepared!;
    expect(p.start.purpose).toBe('remotePackageMerge'); expect(p.changes).toHaveLength(2);
    expect(p.remote!.expectedFinalHeads).toEqual(expected.heads);
    expect(await h.fs.readBytes(`v2/metadata/journal/${done.publication}/source-metadata.am`)).toEqual(input.metadataBytes);
    const cold = h.session(), reopened = await cold.read(), writes = h.fault.writes, files = h.fs.writes;
    expect(reopened.source!.originalChanges()).toEqual(expected.originalChanges());
    expect((await cold.receiveFullSource(reopened.source!.token, input)).publication).toBe(done.publication);
    expect(h.fault.writes).toBe(writes); expect(h.fs.writes).toBe(files); expect(h.fault.bodies).toBe(reads);
  });

  it('retains a diamond source and semantic candidates without selecting a winner or blocking an unrelated field', async () => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records);
    const left = await first.source!.prepareCaptionText(first.source!.token, id('cap'), 'title', '候補A');
    const right = await first.source!.prepareCaptionText(first.source!.token, id('cap'), 'title', '候補B');
    const fork = left.appendOriginal(right.originalChanges());
    const diamond = await fork.prepareCaptionText(fork.token, id('cap'), 'body', '両分岐の後');
    expect(A.decodeChange(diamond.originalChanges().at(-1)!).deps).toHaveLength(2);
    const done = await writer.receiveFullSource(first.source!.token, fullSource(diamond));
    expect(done.state).toBe('ready'); expect(textCandidates(done.source!, 'title')).toHaveLength(2);
    await expect(writer.editCaption(done.source!.token, id('cap'), 'title', '勝手に上書き')).rejects.toThrow(/caption-unresolved/);
    const changed = await writer.editCaption(done.source!.token, id('cap'), 'body', '独立した編集');
    expect(changed.state).toBe('ready'); expect(textCandidates(changed.source!, 'title')).toHaveLength(2);
  });

  it('rejects wrong lineage, heads, truncated/dependency-incomplete source and stale input before writes', async () => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records);
    const remote = await first.source!.prepareCaptionText(first.source!.token, id('cap'), 'title', '配布');
    const other = ProjectMetadataSource.bootstrap(h.records.schema, h.records.identity, limits).initialize(h.records);
    const input = fullSource(remote), writes = h.fault.writes, files = h.fs.writes;
    for (const invalid of [fullSource(other), { ...input, remoteHeads: first.source!.heads },
      { ...input, metadataBytes: input.metadataBytes.slice(0, -1) }, { ...input, metadataBytes: remote.originalChanges().at(-1)! }]) {
      await expect(writer.receiveFullSource(first.source!.token, invalid)).rejects.toThrow();
      expect((await writer.read()).source!.token).toBe(first.source!.token);
    }
    await expect(writer.receiveFullSource('stale', input)).rejects.toThrow(/receive-not-ready/);
    expect(h.fault.writes).toBe(writes); expect(h.fs.writes).toBe(files);
    expect((await new TransactionJournal(h.fs, limits).entries())).toHaveLength(1);
  });

  it('revalidates complete remote source on cold partial-apply recovery while another reader only sees the old publication', async () => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records);
    const r1 = await first.source!.prepareCaptionText(first.source!.token, id('cap'), 'title', '最初');
    const remote = await r1.prepareCaptionText(r1.token, id('cap'), 'body', '最後');
    h.fault.save = true;
    await expect(writer.receiveFullSource(first.source!.token, fullSource(remote))).rejects.toThrow();
    const journal = new TransactionJournal(h.fs, limits), p = (await journal.entries()).at(-1)!.prepared!;
    const parts = await journal.validateParts(p); expect(parts).toHaveLength(2);
    h.fault.save = false;
    await underWriteLease(h.fs, () => new MetadataRepository(h.fs, h.storage, limits).persist(p.start.repositoryId, first.source!.appendOriginal(parts.slice(0, 1))));
    const reader = h.session(), pending = await reader.read();
    expect(pending.state).toBe('pending'); expect(pending.source!.token).toBe(first.source!.token);
    await expect(reader.receiveFullSource(first.source!.token, fullSource(remote))).rejects.toThrow(/receive-not-ready/);
    await expect(reader.editCaption(first.source!.token, id('cap'), 'body', '拒否')).rejects.toThrow(/command-not-ready/);
    const recovered = await h.session().retry();
    expect(recovered.source!.originalChanges()).toEqual(remote.originalChanges());
    expect((await journal.entries()).filter(e => e.publication)).toHaveLength(2);
    expect((await h.session().retry()).publication).toBe(recovered.publication);
  });

  it('retains the copied full input across a source-write failure instead of regenerating it', async () => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records);
    const remote = await first.source!.prepareCaptionText(first.source!.token, id('cap'), 'title', '元の更新');
    const input = fullSource(remote), bytes = input.metadataBytes.slice();
    h.fs.reject = path => path.endsWith('/source-metadata.am');
    await expect(writer.receiveFullSource(first.source!.token, input)).rejects.toThrow();
    input.metadataBytes.fill(0);
    await expect(h.session().retry()).rejects.toThrow(/incomplete-staging-repair/);
    h.fs.reject = () => false;
    const done = await writer.retry();
    expect(done.source!.originalChanges()).toEqual(remote.originalChanges());
    expect(await h.fs.readBytes(`v2/metadata/journal/${done.publication}/source-metadata.am`)).toEqual(bytes);
  });

  it.each(['source', 'writer', 'acknowledged-loss'] as const)('refuses remote recovery after %s corruption without erasing evidence', async kind => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records);
    const initialRows = new Map([...h.rows].map(([k, b]) => [k, b.slice()]));
    const remote = await first.source!.prepareCaptionText(first.source!.token, id('cap'), 'title', '配布内容');
    if (kind === 'acknowledged-loss') h.fs.reject = path => path.endsWith('/published.json');
    else h.fault.save = true;
    await expect(writer.receiveFullSource(first.source!.token, fullSource(remote))).rejects.toThrow();
    h.fs.reject = () => false; h.fault.save = false;
    const journal = new TransactionJournal(h.fs, limits), entry = (await journal.entries()).at(-1)!, p = entry.prepared!;
    if (kind === 'source') {
      const path = journal.path(p.start.transactionId, 'source-metadata.am'), bytes = (await h.fs.readBytes(path))!;
      bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; await h.fs.writeBytes(path, bytes);
    } else if (kind === 'writer') {
      const unexpected = await first.source!.prepareCaptionText(first.source!.token, id('cap'), 'body', '不意のwriter');
      await underWriteLease(h.fs, () => new MetadataRepository(h.fs, h.storage, limits).persist(p.start.repositoryId, unexpected));
    } else {
      expect(entry.durable).not.toBeNull(); h.rows.clear(); for (const [k, bytes] of initialRows) h.rows.set(k, bytes.slice());
    }
    const writes = h.fault.writes, files = h.fs.writes;
    await expect(h.session().retry()).rejects.toThrow(kind === 'source' ? /remote-source-digest/ : kind === 'writer' ? /remote-unexpected-writer/ : /remote-acknowledged-change-missing/);
    expect(h.fault.writes).toBe(writes); expect(h.fs.writes).toBe(files);
    expect((await journal.entries()).at(-1)!.publication).toBeNull();
  });

  it.each(['source-metadata.am', 'changes/00000000.amchange'])('does not recreate missing prepared remote %s on same-writer retry', async file => {
    const h = setup(), writer = h.session(), initial = await writer.create(h.records);
    const remote = await initial.source!.prepareCaptionText(initial.source!.token, id('cap'), 'title', '共有された変更');
    h.fs.reject = path => path.endsWith('/published.json');
    await expect(writer.receiveFullSource(initial.source!.token, fullSource(remote))).rejects.toThrow();
    const journal = new TransactionJournal(h.fs, limits), entry = (await journal.entries()).at(-1)!;
    expect(entry.durable).not.toBeNull();
    const path = journal.path(entry.start.transactionId, file);
    await h.fs.remove(path); h.fs.reject = () => false;
    const writes = h.fs.writes, metadataWrites = h.fault.writes;
    await expect(writer.retry()).rejects.toThrow();
    expect(await h.fs.readBytes(path)).toBeNull();
    expect(h.fs.writes).toBe(writes); expect(h.fault.writes).toBe(metadataWrites);
    expect((await journal.entries()).at(-1)!.publication).toBeNull();
  });

  it('rejects a correctly hashed but incomplete remote set using the retained full source', async () => {
    const h = setup(), first = await h.session().create(h.records), base = first.source!;
    const one = await base.prepareCaptionText(base.token, id('cap'), 'title', '第一変更');
    const remote = await one.prepareCaptionText(one.token, id('cap'), 'body', '第二変更');
    const journal = new TransactionJournal(h.fs, limits), prior = (await journal.entries())[0]!;
    const bytes = remote.encodeFullSource(), plan = planRemoteChanges(base, remote, limits), hash = await digest(bytes);
    await underWriteLease(h.fs, () => journal.stage({ ...prior.start, transactionId: 'e'.repeat(32),
      predecessor: prior.start.transactionId, purpose: 'remotePackageMerge', baseHeads: base.heads }, plan.parts.slice(0, 1), [],
      { bytes, proof: { source: { packageId: id('pkg'), metadataSha256: hash, metadataByteLength: bytes.length,
        metadataEnvelope: remote.proof.envelope, remoteHeads: remote.heads }, expectedFinalHeads: plan.final.heads } }));
    const writes = h.fs.writes, metadataWrites = h.fault.writes;
    await expect(h.session().retry()).rejects.toThrow(/remote-complete-set/);
    expect(h.fs.writes).toBe(writes); expect(h.fault.writes).toBe(metadataWrites);
    expect((await h.session().read()).source!.token).toBe(base.token);
  });

  it.each(['candidate', 'manual', 'equal'])('explicit %s resolution observes every candidate, preserves history and survives publication retry', async kind => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records), base = first.source!;
    const local = await writer.editCaption(base.token, id('cap'), 'title', '同じ候補');
    const remote = await base.prepareCaptionText(base.token, id('cap'), 'title', kind === 'equal' ? '同じ候補' : '共有の候補');
    const merged = await writer.receiveFullSource(local.source!.token, fullSource(remote)), source = merged.source!;
    if (merged.provider!.kind !== 'scene-provider') throw Error('test provider');
    const candidates = merged.provider!.inspection.candidates.fields.find(f => f.path.join('/') === `captionsById/${id('cap')}/title`)!.candidates;
    expect(candidates).toHaveLength(2);
    const [materialized] = A.applyChanges(A.init<any>(), source.originalChanges());
    const current = JSON.parse(String(materialized.captionsById[id('cap')].title));
    const selected = candidates.find(c => c.value.kind === 'value' && c.value.value === current)!;
    const command = { kind: 'resolveCaptionText' as const, captionId: id('cap'), field: 'title' as const,
      choice: kind === 'manual' ? { kind: 'manual' as const, text: 'e\u0301' } : { kind: 'candidate' as const, operationId: selected.operationId } };
    const files = h.fs.writes, writes = h.fault.writes;
    await expect(writer.edit(source.token, { ...command, choice: { kind: 'candidate', operationId: 'absent' } })).rejects.toThrow(/resolution-choice/);
    await expect(writer.edit(base.token, command)).rejects.toThrow(/command-not-ready/);
    expect(h.fs.writes).toBe(files); expect(h.fault.writes).toBe(writes);
    h.fs.reject = path => path.endsWith('/published.json');
    await expect(writer.edit(source.token, command)).rejects.toThrow(/synthetic quota/);
    expect((await h.session().read()).source!.token).toBe(source.token);
    const journal = new TransactionJournal(h.fs, limits), p = (await journal.entries()).at(-1)!.prepared!;
    const parts = await journal.validateParts(p); expect(parts).toHaveLength(1);
    expect(A.decodeChange(parts[0]!).deps.sort()).toEqual(source.heads);
    h.fs.reject = () => false; const resolved = await h.session().retry();
    expect(textCandidates(resolved.source!, 'title')).toEqual([{ kind: 'value', value: kind === 'manual' ? 'é' : current }]);
    const hashes = new Set(resolved.source!.originalChanges().map(b => A.decodeChange(b).hash));
    expect(source.originalChanges().every(b => hashes.has(A.decodeChange(b).hash))).toBe(true);
    expect(resolved.source!.originalChanges()).toHaveLength(source.originalChanges().length + 1);
    const final = await h.session().editCaption(resolved.source!.token, id('cap'), 'title', '解消後の編集');
    const replay = await h.session().receiveFullSource(final.source!.token, fullSource(remote));
    expect(replay.source!.token).toBe(final.source!.token);
    const unseen = await base.prepareCaptionText(base.token, id('cap'), 'title', 'まだ届いていなかった編集');
    const reopened = await h.session().receiveFullSource(final.source!.token, fullSource(unseen));
    expect(textCandidates(reopened.source!, 'title')).toHaveLength(2);
  });

  it('creates later contents, saves a Caption and independently reopens exact originals with cold content hits', async () => {
    const h = setup(), writer = h.session();
    expect((await writer.read()).state).toBe('empty'); expect(h.rows.size).toBe(0);
    const first = await writer.create(h.records);
    expect(first.state).toBe('ready'); expect(first.source!.originalChanges()).toHaveLength(2);
    expect(h.fault.bodies).toBeGreaterThan(0); const bodyReads = h.fault.bodies;
    const next = await writer.editCaption(first.source!.token, id('cap'), 'body', '保存する本文');
    expect(next.state).toBe('ready');
    const cold = await h.session().read();
    expect(cold.state).toBe('ready'); expect(cold.source!.originalChanges()).toEqual(next.source!.originalChanges());
    expect(textCandidates(cold.source!, 'body')).toEqual([{ kind: 'value', value: '保存する本文' }]);
    expect(h.fault.bodies).toBe(bodyReads); expect(h.fault.inventory).toBeGreaterThan(3);
    const change = A.decodeChange(next.source!.originalChanges().at(-1)!);
    expect(change.message).toBe(`lociview:transaction:v1:${next.publication}`);
    const entries = await new TransactionJournal(h.fs, limits).entries();
    expect(entries.at(-1)!.prepared!.changes).toHaveLength(1);
    expect(change.deps.sort()).toEqual(entries.at(-1)!.start.baseHeads);
    expect(h.fault.factories).toBeGreaterThan(6);
  });

  it('retains old publication through storage rejection; cold retry uses exactly retained source and repeated retry is a no-op', async () => {
    const h = setup(), writer = h.session(), initial = await writer.create(h.records);
    h.fault.save = true;
    await expect(writer.editCaption(initial.source!.token, id('cap'), 'title', '復旧するタイトル')).rejects.toThrow();
    const cold = h.session(), pending = await cold.read();
    expect(pending.state).toBe('pending'); expect(pending.source!.token).toBe(initial.source!.token);
    await expect(cold.editCaption(initial.source!.token, id('cap'), 'body', '禁止')).rejects.toThrow(/command-not-ready/);
    const journal = new TransactionJournal(h.fs, limits), prepared = (await journal.entries()).at(-1)!.prepared!;
    const original = await journal.validateParts(prepared), reads = h.fault.bodies;
    h.fault.save = false;
    const recovered = await cold.retry();
    expect(recovered.state).toBe('ready'); expect(recovered.source!.originalChanges().at(-1)).toEqual(original[0]);
    const writes = h.fault.writes, fileWrites = h.fs.writes;
    expect((await h.session().retry()).source!.token).toBe(recovered.source!.token);
    expect(h.fault.writes).toBe(writes); expect(h.fs.writes).toBe(fileWrites); expect(h.fault.bodies).toBe(reads);
  });

  it('does not publish after durable metadata but failed final marker; cold recovery finishes once', async () => {
    const h = setup(), writer = h.session(), initial = await writer.create(h.records);
    h.fs.reject = path => path.endsWith('/published.json');
    await expect(writer.editCaption(initial.source!.token, id('cap'), 'body', '公開前')).rejects.toThrow();
    expect((await h.session().read()).source!.token).toBe(initial.source!.token);
    expect((await h.session().read()).state).toBe('pending');
    const writes = h.fault.writes;
    h.fs.reject = () => false;
    const final = await h.session().retry();
    expect(final.state).toBe('ready'); expect(textCandidates(final.source!, 'body')).toEqual([{ kind: 'value', value: '公開前' }]);
    expect(h.fault.writes).toBe(writes); // already durable, no metadata rewrite
  });

  it('keeps unpublished initialization incomplete and retries the same bootstrap, never reseeding identity', async () => {
    const h = setup(), writer = h.session(); h.fault.save = true;
    await expect(writer.create(h.records)).rejects.toThrow();
    const cold = h.session(); expect((await cold.read()).state).toBe('pending'); expect((await cold.read()).source).toBeNull();
    const prepared = (await new TransactionJournal(h.fs, limits).entries())[0]!.prepared!;
    h.fault.save = false; const done = await cold.retry();
    expect(done.state).toBe('ready'); expect(done.source!.proof).toEqual(prepared.start.proof);
    expect(done.source!.originalChanges()).toEqual(await new TransactionJournal(h.fs, limits).validateParts(prepared));
  });

  it('retains staged pre-apply failures for same-session retry but refuses incomplete cold staging', async () => {
    const h = setup(), writer = h.session(), initial = await writer.create(h.records);
    h.fs.reject = path => path.endsWith('/blobsVerified.json');
    await expect(writer.editCaption(initial.source!.token, id('cap'), 'body', '準備中')).rejects.toThrow();
    await expect(h.session().retry()).rejects.toThrow(/incomplete-staging-repair/);
    const partPath = (await h.fs.list('v2/metadata/journal/')).filter(p => p.endsWith('/00000000.amchange')).find(p => !p.includes(initial.publication!))!;
    const retained = await h.fs.readBytes(partPath);
    h.fs.reject = () => false;
    const done = await writer.retry(); expect(done.source!.originalChanges().at(-1)).toEqual(retained);
  });

  it('rejects corrupt retained bytes without changing the previous publication or erasing evidence', async () => {
    const h = setup(), writer = h.session(), initial = await writer.create(h.records); h.fault.save = true;
    await expect(writer.editCaption(initial.source!.token, id('cap'), 'body', '保留')).rejects.toThrow();
    const journal = new TransactionJournal(h.fs, limits), p = (await journal.entries()).at(-1)!.prepared!;
    const path = journal.path(p.start.transactionId, 'changes/00000000.amchange'), bytes = (await h.fs.readBytes(path))!;
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; await h.fs.writeBytes(path, bytes);
    h.fault.save = false; const writes = h.fault.writes;
    await expect(h.session().retry()).rejects.toThrow(/journal-part-digest/);
    expect((await h.session().read()).source!.token).toBe(initial.source!.token); expect(h.fault.writes).toBe(writes);
    expect(await h.fs.readBytes(path)).toEqual(bytes);
  });

  it('preserves concurrent local history on recovery and does not turn a pending title into a stale overwrite', async () => {
    const h = setup(), writer = h.session(), initial = await writer.create(h.records); h.fault.save = true;
    await expect(writer.editCaption(initial.source!.token, id('cap'), 'title', '手元')).rejects.toThrow();
    h.fault.save = false;
    const other = await initial.source!.prepareCaptionText(initial.source!.token, id('cap'), 'title', '並行変更');
    const start = (await new TransactionJournal(h.fs, limits).entries())[0]!.start;
    await underWriteLease(h.fs, () => new MetadataRepository(h.fs, h.storage, limits).persist(start.repositoryId, other));
    const final = await h.session().retry();
    expect(final.state).toBe('ready'); expect(textCandidates(final.source!, 'title')).toHaveLength(2);
    expect(textCandidates(final.source!, 'title')).toEqual(expect.arrayContaining([{ kind: 'value', value: '手元' }, { kind: 'value', value: '並行変更' }]));
    await expect(h.session().editCaption(final.source!.token, id('cap'), 'title', '自動勝者')).rejects.toThrow(/caption-unresolved/);
  });

  it('read-only missing storage cannot seed a replacement repository identity', async () => {
    const h = setup(), first = await h.session().create(h.records);
    h.rows.delete(JSON.stringify(['storage-adapter-id'])); const writes = h.fault.writes;
    expect((await h.session().read()).state).toBe('repair-required');
    expect(h.fault.writes).toBe(writes); expect(first.source).not.toBeNull();
  });

  it('missing/suspect inventory prevents cold content reuse and new Caption acknowledgment', async () => {
    const h = setup(), first = await h.session().create(h.records), reads = h.fault.bodies;
    h.setPresence('missing');
    await expect(h.session().editCaption(first.source!.token, id('cap'), 'body', '禁止')).rejects.toThrow(/provider-not-ready|command-not-ready/);
    h.setPresence('suspect');
    await expect(h.session().editCaption(first.source!.token, id('cap'), 'body', '禁止')).rejects.toThrow(/provider-not-ready|command-not-ready/);
    expect(h.fault.bodies).toBe(reads);
    expect((await h.session().read()).state).toBe('repair-required');
  });

  it('rejects valid but stale published heads that omit the acknowledged transaction', async () => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records);
    const second = await writer.editCaption(first.source!.token, id('cap'), 'body', '新しい本文');
    const journal = new TransactionJournal(h.fs, limits), entries = await journal.entries();
    const path = journal.path(second.publication!, 'published.json');
    await h.fs.writeText(path, json({ ...entries[1]!.publication!, heads: entries[0]!.publication!.heads }));
    expect((await h.session().read()).state).toBe('repair-required');
  });

  it('canonical null receipts are corruption, not write-once absence', async () => {
    const fs = new FaultFS(), path = 'v2/metadata/receipt.json';
    await fs.writeText(path, 'null');
    await expect(writeReceipt(fs, path, { value: 1 }, limits)).rejects.toThrow(/receipt-invalid/);
    expect(await fs.readText(path)).toBe('null');
  });

  it('normalizes only new author input, while preserving its exact retained/reopened change bytes', async () => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records);
    const edited = await writer.editCaption(first.source!.token, id('cap'), 'title', 'e\u0301');
    expect(textCandidates(edited.source!, 'title')).toEqual([{ kind: 'value', value: 'é' }]);
    expect((await h.session().read()).source!.originalChanges()).toEqual(edited.source!.originalChanges());
  });

  it('valid additional local heads after metadata-durable/pre-publication interruption remain recoverable', async () => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records);
    h.fs.reject = path => path.endsWith('/published.json');
    await expect(writer.editCaption(first.source!.token, id('cap'), 'body', '元の変更')).rejects.toThrow();
    const start = (await new TransactionJournal(h.fs, limits).entries())[0]!.start;
    const repository = new MetadataRepository(h.fs, h.storage, limits);
    const stored = (await repository.read(start.repositoryId, start.proof))!;
    const concurrent = await first.source!.prepareCaptionText(first.source!.token, id('cap'), 'title', '追加の変更');
    await underWriteLease(h.fs, () => repository.persist(start.repositoryId, stored.appendOriginal(concurrent.originalChanges())));
    h.fs.reject = () => false;
    const done = await h.session().retry();
    expect(done.state).toBe('ready');
    expect(textCandidates(done.source!, 'body')).toEqual([{ kind: 'value', value: '元の変更' }]);
    expect(textCandidates(done.source!, 'title')).toEqual([{ kind: 'value', value: '追加の変更' }]);
  });

  it('fails closed on lost authority after an adapter write; the next retry may use the already stored exact changes', async () => {
    const h = setup(), writer = h.session(), first = await writer.create(h.records);
    let lost = false, active = 0;
    const assert = () => { if (lost) throw Error('synthetic lost lease'); };
    const authority: ProjectMutationAuthority = {
      sessionMode: 'edit', accessState: 'editable', accessDetail: 'test', assertEditable: assert,
      assertSourceSnapshotProtected: assert, assertWorkspaceWriteAuthorized: assert,
      beginWorkspaceWrite: () => { assert(); active++; return () => { active--; }; }, subscribeAccess: () => () => {},
    };
    Object.defineProperty(h.fs, 'mutationAuthority', { value: authority });
    h.fault.afterSave = () => { lost = true; };
    await expect(writer.editCaption(first.source!.token, id('cap'), 'body', '失権前')).rejects.toThrow(/lost lease/);
    expect(active).toBe(0); expect((await h.session().read()).state).toBe('pending');
    h.fault.afterSave = () => {}; lost = false;
    expect((await h.session().retry()).state).toBe('ready');
  });
});
