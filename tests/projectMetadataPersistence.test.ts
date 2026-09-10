import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge'; // Node-only local Wasm initialization.
import { MemoryFS, type ProjectMutationAuthority } from '../src/platform/fs';
import { MetadataProjectSession } from '../src/projectMetadata/session';
import { MetadataRepository, type MetadataStorageFactory, type MetadataStoragePort } from '../src/projectMetadata/repository';
import { PersistentContentVerifier, type VerifiedInventoryPort } from '../src/projectMetadata/contentEvidence';
import { TransactionJournal } from '../src/projectMetadata/journal';
import { json, underWriteLease, writeReceipt } from '../src/projectMetadata/persistence';
import { type MetadataLimits } from '../src/projectMetadata/source';
import type { JsonObject } from '../src/domain/values';
import { inspectAtomicHistory } from '../src/domain/atomicHistory';
import { fixture, id, limits as valueLimits } from './helpers/projectRecordsFixture';
import { developmentContentVerifier } from '../poc/scene-history/content-verifier';

const limits: MetadataLimits = { ...valueLimits, maxWork: 1_000_000, maxChanges: 100,
  maxChangeBytes: 1_000_000, maxTotalBytes: 4_000_000, maxOperations: 10_000 };
class FaultFS extends MemoryFS {
  reject: (path: string) => boolean = () => false;
  writes = 0;
  override async writeText(path: string, value: string) {
    if (this.reject(path)) throw new DOMException('synthetic quota', 'QuotaExceededError');
    this.writes++; await super.writeText(path, value);
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

describe('new-workspace metadata persistence service (memory ports, not device/activation evidence)', () => {
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
