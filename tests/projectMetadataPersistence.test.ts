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
import type { JsonObject } from '../src/domain/values';
import { inspectAtomicHistory } from '../src/domain/atomicHistory';
import { fixture, id, limits as valueLimits } from './helpers/projectRecordsFixture';
import { developmentContentVerifier, developmentContentBytes } from '../poc/scene-history/content-verifier';
import { planMetadataEdit, type MetadataEdit } from '../src/projectMetadata/commands';
import { captionMembershipGroups, type CaptionMembershipResolution } from '../src/projectMetadata/membership';
import { OriginBlobStore, type StoredBlobRef } from '../src/projectMetadata/blobStore';
import { blobInventory } from '../src/projectMetadata/blobInventory';

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
function checked(read: MetadataSessionRead) {
  if (read.provider?.kind !== 'scene-provider') throw Error('Expected a verified provider');
  return { ...read, provider: read.provider };
}

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
