import { A, LIMIT, type Doc, type Ref, type Target, type Journal, type Prepared,
  type Part, type Batch, require, canonical, same, jsonBytes, sha, heads, index,
  atHeads, load, validateRoot, transaction, refs, missing, ordered, seal, decodeJournal } from './journal-format';

export interface Files {
  read(key: string, limit: number): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
}
export interface Control { publishedHeads: string[]; pending: string | null }
export interface Ports {
  files: Files;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  control(): Promise<Control>;
  setControl(next: Control): Promise<void>;
  current(): Promise<Doc>;
  // Reads just the requested exact ancestry, not an unpublished/corrupt prefix.
  readAt(heads: string[]): Promise<Doc>;
  appendAndFlush(bytes: Uint8Array): Promise<void>;
  protect(refs: Ref[]): Promise<void>;
  hasProtected(ref: Ref): Promise<boolean>;
  hasVerified(ref: Ref): Promise<boolean>;
  finalClosure(doc: Doc): Ref[];
  checkpoint(name: string): Promise<void>;
}
const basePath = (tx: string) => `journal/${tx}`;
const journalPath = (tx: string) => `${basePath(tx)}/journal.json`;
const sourcePath = (tx: string) => `${basePath(tx)}/source-metadata.am`;
const partPath = (tx: string, n: number) => `${basePath(tx)}/changes/${n.toString().padStart(8, '0')}.amchange`;
const detached = (doc: Doc, changes: Uint8Array[]) => A.applyChanges(A.clone(doc), changes)[0];

/** Retained-artifact protocol proof only; not the production repository/journal. */
export class JournalCandidate {
  private readonly target: Target;
  constructor(private readonly ports: Ports, target: Target) { this.target = JSON.parse(canonical(target)); }
  private async required(key: string, limit: number): Promise<Uint8Array> {
    const bytes = await this.ports.files.read(key, limit); require(bytes, 'missing journal file'); return bytes!;
  }
  private async write(journal: Journal) {
    const bytes = jsonBytes(journal); require(bytes.length <= LIMIT.journal, 'journal bytes');
    decodeJournal(bytes); await this.ports.files.write(journalPath(journal.transactionId), bytes);
  }
  private async checkClosure(doc: Doc): Promise<void> {
    validateRoot(doc, this.target); const closure = this.ports.finalClosure(doc); refs(closure);
    for (const ref of closure) require(await this.ports.hasProtected(ref) && await this.ports.hasVerified(ref), 'missing final blob/inventory');
  }
  private async protect(staged: Ref[]): Promise<void> {
    refs(staged);
    for (const ref of staged) require(await this.ports.hasVerified(ref), 'unverified staged blob');
    await this.ports.protect(staged); await this.ports.checkpoint('inventoryProtected');
  }
  async view(): Promise<{ readOnly: boolean; doc: Doc; repairRequired?: boolean }> {
    const control = await this.ports.control(); const doc = await this.ports.readAt(control.publishedHeads);
    validateRoot(doc, this.target);
    try { await this.checkClosure(doc); }
    catch { return { readOnly: true, doc, repairRequired: true }; }
    return { readOnly: control.pending !== null, doc };
  }
  async request(action: 'edit' | 'export' | 'gc'): Promise<void> {
    await this.ports.exclusive(async () => {
      require(['edit', 'export', 'gc'].includes(action), 'unknown facade request');
      const control = await this.ports.control();
      require(control.pending === null, 'unfinished journal; read-only');
      await this.checkClosure(await this.ports.readAt(control.publishedHeads));
    });
  }
  async remote(tx: string, source: Uint8Array, packageId: string, stagedBlobs: Ref[] = []): Promise<'published' | 'noop'> {
    transaction(tx); const bytes = new Uint8Array(source); const staged = JSON.parse(canonical(stagedBlobs)) as Ref[];
    require(bytes.length <= LIMIT.metadata, 'metadata byte budget');
    return this.prepare(tx, 'remotePackageMerge', staged, base => {
      const remote = load(bytes, this.target); const parts = missing(base, remote);
      return { parts, source: bytes, batchSource: { packageId, metadataSha256: sha(bytes),
        metadataByteLength: bytes.length, metadataEnvelope: this.target.metadataEnvelope, remoteHeads: heads(remote) } };
    });
  }
  async local(tx: string, actor: string, command: (draft: Record<string, any>) => void, stagedBlobs: Ref[] = []): Promise<'published' | 'noop'> {
    transaction(tx); const staged = JSON.parse(canonical(stagedBlobs)) as Ref[];
    require(actor.length === 32 && /^[0-9a-f]{32}$/.test(actor), 'invalid actor');
    return this.prepare(tx, 'localCommand', staged, base => {
      // Prepare once under the actor/project queue. Recovery never invokes this closure.
      const next = A.change(A.clone(base, { actor }), { message: `lociview:transaction:v1:${tx}`, time: 0 }, command);
      const parts = missing(base, next); require(parts.length === 1, 'local command must make one change');
      return { parts };
    });
  }
  private async prepare(tx: string, kind: Batch['kind'], staged: Ref[], build: (base: Doc) => {
    parts: Uint8Array[]; source?: Uint8Array; batchSource?: Batch['source'];
  }): Promise<'published' | 'noop'> {
    return this.ports.exclusive(async () => {
      const control = await this.ports.control(); require(!control.pending, 'unfinished journal; read-only');
      require(!await this.ports.files.read(journalPath(tx), LIMIT.journal), 'transaction already exists');
      const base = await this.ports.current(); validateRoot(base, this.target);
      const built = build(base);
      // Complete replay has no metadata transaction; only explicit blob repair/protection.
      if (!built.parts.length) { await this.protect(staged); await this.checkClosure(base); return 'noop'; }
      require(built.parts.length <= LIMIT.count, 'change count');
      await this.write({ transactionId: tx, purpose: kind, target: this.target, state: 'staging', sourceResume: { kind: 'none' } });
      await this.ports.setControl({ ...control, pending: tx });
      await this.ports.checkpoint('staging');
      await this.protect(staged);
      if (built.source) await this.ports.files.write(sourcePath(tx), built.source);
      await this.ports.checkpoint('sourceStored');
      const descriptors: Part[] = [];
      for (const [ordinal, bytes] of built.parts.entries()) {
        require(bytes.length > 0 && bytes.length <= LIMIT.part, 'change byte budget');
        const decoded = A.decodeChange(bytes);
        await this.ports.files.write(partPath(tx, ordinal), bytes);
        descriptors.push({ ordinal, expectedChangeHash: decoded.hash, dependencies: [...decoded.deps].sort(),
          byteLength: bytes.length, bytesSha256: sha(bytes) });
        await this.ports.checkpoint(`partStored:${ordinal}`);
      }
      const final = detached(base, built.parts); await this.checkClosure(final);
      const batch: Batch = { kind, baseHeads: heads(base), exactChangeSetDigest: '0'.repeat(64), changes: descriptors,
        ...(kind === 'remotePackageMerge' ? { source: built.batchSource!, expectedFinalHeads: heads(final) } : {}) };
      const journal: Prepared = { transactionId: tx, purpose: kind, target: this.target, state: 'blobsVerified', stagedBlobs: staged, metadataBatch: batch };
      batch.exactChangeSetDigest = seal(journal);
      await this.write(journal); await this.ports.checkpoint('prepared');
      await this.resume(journal); return 'published';
    });
  }
  async recover(tx: string): Promise<'published' | 'noop' | 'discarded-staging'> {
    transaction(tx);
    return this.ports.exclusive(async () => {
      const control = await this.ports.control();
      const journal = decodeJournal(await this.required(journalPath(tx), LIMIT.journal));
      require(journal.transactionId === tx && same(journal.target, this.target), 'journal target mismatch');
      if (control.pending === null) {
        // Completed retained artifacts are not replayed into a newer authority.
        require(journal.state === 'metadataDurable', 'unowned unfinished journal');
        await this.resume(journal, true); return 'noop';
      }
      require(control.pending === tx, 'different pending journal');
      if (journal.state === 'staging') {
        // No source lease: discard only its active staging intent, not unknown bytes.
        // Artifacts stay retained for inspection; no metadata mutation was prepared.
        const current = await this.ports.current(); validateRoot(current, this.target);
        require(same(heads(current), control.publishedHeads), 'unexpected writer during staging');
        await this.ports.setControl({ ...control, pending: null }); return 'discarded-staging';
      }
      await this.resume(journal); return 'published';
    });
  }
  private async resume(journal: Prepared, completed = false): Promise<void> {
    // Re-read descriptors and all exact source parts even on first application.
    const j = decodeJournal(await this.required(journalPath(journal.transactionId), LIMIT.journal));
    require(j.state !== 'staging' && same(j.target, this.target) && j.transactionId === journal.transactionId, 'invalid prepared target');
    const prepared = j as Prepared; const batch = prepared.metadataBatch;
    const current = await this.ports.current(); validateRoot(current, this.target);
    const base = atHeads(current, batch.baseHeads); validateRoot(base, this.target);
    const changes: Uint8Array[] = [];
    for (const part of batch.changes) {
      const bytes = await this.required(partPath(j.transactionId, part.ordinal), LIMIT.part); const decoded = A.decodeChange(bytes);
      require(bytes.length === part.byteLength && sha(bytes) === part.bytesSha256 && decoded.hash === part.expectedChangeHash &&
        same([...decoded.deps].sort(), part.dependencies), 'part integrity/dependency mismatch');
      if (batch.kind === 'localCommand') require(same(part.dependencies, batch.baseHeads) &&
        decoded.message === `lociview:transaction:v1:${j.transactionId}`, 'local transaction/dependency mismatch');
      changes.push(bytes);
    }
    require(same(ordered(changes, new Set(index(base).keys())).map(sha), changes.map(sha)), 'noncanonical topology');
    if (batch.kind === 'remotePackageMerge') {
      const descriptor = batch.source!;
      const bytes = await this.required(sourcePath(j.transactionId), LIMIT.metadata);
      require(bytes.length === descriptor.metadataByteLength && sha(bytes) === descriptor.metadataSha256, 'source integrity mismatch');
      const source = load(bytes, this.target);
      require(same(heads(source), descriptor.remoteHeads), 'source heads mismatch');
      const expected = missing(base, source);
      require(same(expected.map(sha), changes.map(sha)), 'incomplete source change set');
    }
    const finalAtBase = detached(base, changes);
    await this.checkClosure(finalAtBase);
    for (const ref of prepared.stagedBlobs)
      require(await this.ports.hasProtected(ref) && await this.ports.hasVerified(ref), 'staged inventory missing');
    if (batch.kind === 'remotePackageMerge') {
      require(same(heads(finalAtBase), batch.expectedFinalHeads), 'final heads mismatch');
      const allowed = index(finalAtBase);
      if (!completed) require([...index(current).keys()].every(h => allowed.has(h)), 'unexpected remote writer');
    }
    // Local concurrent replacements remain legal and participate in final closure.
    await this.checkClosure(detached(current, changes));
    if (completed || prepared.state === 'metadataDurable') {
      const known = index(current);
      require(batch.changes.every(p => known.has(p.expectedChangeHash)), 'acknowledged metadata missing; repair required');
      for (const [ordinal, bytes] of changes.entries())
        require(sha(known.get(batch.changes[ordinal]!.expectedChangeHash)!.bytes) === sha(bytes), 'durable bytes rewritten');
      if (completed) return; // Later legitimate edits are allowed; no old-head republication.
      if (batch.kind === 'remotePackageMerge')
        require(same(heads(current), batch.expectedFinalHeads), 'acknowledged heads mismatch; repair required');
      // A completed durable write cannot be silently recreated from staged parts.
    } else {
      for (const [ordinal, bytes] of changes.entries()) {
        if (!index(await this.ports.current()).has(A.decodeChange(bytes).hash)) await this.ports.appendAndFlush(bytes);
        await this.ports.checkpoint(`metadataDurable:${ordinal}`);
      }
    }
    const durable = await this.ports.current(); validateRoot(durable, this.target);
    const known = index(durable);
    require(batch.changes.every(p => known.has(p.expectedChangeHash)), 'change not durable');
    for (const [ordinal, bytes] of changes.entries())
      require(sha(known.get(batch.changes[ordinal]!.expectedChangeHash)!.bytes) === sha(bytes), 'durable bytes rewritten');
    if (batch.kind === 'remotePackageMerge') require(same(heads(durable), batch.expectedFinalHeads), 'durable heads mismatch');
    await this.checkClosure(durable);
    await this.write({ ...prepared, state: 'metadataDurable' }); await this.ports.checkpoint('journalDurable');
    const control = await this.ports.control(); require(control.pending === j.transactionId, 'publication owner changed');
    await this.ports.setControl({ pending: null, publishedHeads: heads(durable) });
    await this.ports.checkpoint('published');
    // Original files intentionally retained in the PoC. No cleanup/GC guarantee.
  }
}
