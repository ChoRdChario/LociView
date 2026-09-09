import { A, LIMIT, type Doc, type Ref, type Target, type Journal, type Prepared,
  type Part, type Batch, type RemoteSource, type MigrationSource, require, canonical, same, jsonBytes, sha, heads, index,
  atHeads, load, validateRoot, transaction, refs, missing, ordered, seal, decodeJournal, migrationSource } from './journal-format';

export interface Files {
  read(key: string, limit: number): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
}
export interface Control { publishedHeads: string[]; pending: string | null }
export interface RetainedBlob { ref: Ref; bytes: Uint8Array }
export type ReadRetained = (ref: Ref) => Promise<Uint8Array>;
/** Trusted, explicitly configured recipe verifier. Never a permissive remote-source fallback. */
export interface MigrationVerifier {
  // Verify registered case/recipe, raw input/receipt, fixed foundation, artifact DAG
  // and original registrations. Return their exact reconstructed source, not new changes.
  verifySource(source: MigrationSource, originalInput: Uint8Array, read: ReadRetained): Promise<Doc>;
  // Check all domain/managed/birth candidates at the actual receiver union.
  validateFinal(doc: Doc): Promise<void>;
}
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
  finalClosure(doc: Doc): Ref[] | Promise<Ref[]>;
  checkpoint(name: string): Promise<void>;
}
const basePath = (tx: string) => `journal/${tx}`;
const journalPath = (tx: string) => `${basePath(tx)}/journal.json`;
const sourcePath = (tx: string) => `${basePath(tx)}/source-metadata.am`;
const originalPath = (tx: string) => `${basePath(tx)}/original-source.bin`;
const artifactPath = (tx: string, ref: Ref) => `${basePath(tx)}/artifacts/${ref.digest}.bin`;
const partPath = (tx: string, n: number) => `${basePath(tx)}/changes/${n.toString().padStart(8, '0')}.amchange`;
const detached = (doc: Doc, changes: Uint8Array[]) => A.applyChanges(A.clone(doc), changes)[0];

/** Retained-artifact protocol proof only; not the production repository/journal. */
export class JournalCandidate {
  private readonly target: Target;
  constructor(private readonly ports: Ports, target: Target, private readonly migration?: MigrationVerifier) { this.target = JSON.parse(canonical(target)); }
  private async required(key: string, limit: number): Promise<Uint8Array> {
    const bytes = await this.ports.files.read(key, limit); require(bytes, 'missing journal file'); return bytes!;
  }
  private async write(journal: Journal) {
    const bytes = jsonBytes(journal); require(bytes.length <= LIMIT.journal, 'journal bytes');
    decodeJournal(bytes); await this.ports.files.write(journalPath(journal.transactionId), bytes);
  }
  private async checkClosure(doc: Doc): Promise<void> {
    validateRoot(doc, this.target); const closure = await this.ports.finalClosure(doc); refs(closure);
    for (const ref of closure) require(await this.ports.hasProtected(ref) && await this.ports.hasVerified(ref), 'missing final blob/inventory');
  }
  private async protect(staged: Ref[]): Promise<void> {
    refs(staged);
    for (const ref of staged) require(await this.ports.hasVerified(ref), 'unverified staged blob');
    await this.ports.protect(staged); await this.ports.checkpoint('inventoryProtected');
  }
  async view(): Promise<{ readOnly: boolean; doc: Doc; repairRequired?: boolean; repairCause?: unknown }> {
    const control = await this.ports.control(); const doc = await this.ports.readAt(control.publishedHeads);
    validateRoot(doc, this.target);
    try { await this.checkClosure(doc); }
    catch (repairCause) { return { readOnly: true, doc, repairRequired: true, repairCause }; }
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
  async preparedMigration(tx: string, source: MigrationSource, originalInput: Uint8Array,
    retained: RetainedBlob[], stagedBlobs: Ref[] = []): Promise<'published' | 'noop'> {
    require(this.migration, 'migration verifier unavailable'); transaction(tx);
    const proof = JSON.parse(canonical(source)) as MigrationSource; migrationSource(proof, this.target);
    require(originalInput.length <= LIMIT.metadata && retained.length <= LIMIT.count, 'migration input budget');
    let total = originalInput.length;
    const blobs = retained.map(item => {
      total += item.bytes.length; require(total <= LIMIT.metadata, 'migration retained byte budget');
      const ref = JSON.parse(canonical(item.ref)) as Ref; refs([ref]);
      require(item.bytes.length === ref.byteLength && sha(item.bytes) === ref.digest, 'retained blob mismatch');
      return { ref, bytes: item.bytes.slice() };
    }).sort((a, b) => a.ref.digest.localeCompare(b.ref.digest));
    refs(blobs.map(item => item.ref));
    const staged = JSON.parse(canonical([...stagedBlobs, ...blobs.map(item => item.ref)])) as Ref[];
    staged.sort((a, b) => a.digest < b.digest ? -1 : 1); refs(staged);
    const original = originalInput.slice();
    return this.prepare(tx, 'preparedMigration', staged, async base => {
      const generated = await this.verifyMigration(proof, original, async ref => {
        const item = blobs.find(item => item.ref.digest === ref.digest);
        require(item && same(item.ref, ref), 'missing retained source blob'); return item.bytes.slice();
      }, base);
      const parts = missing(base, generated);
      await this.migration!.validateFinal(detached(base, parts));
      return { parts, migrationSource: proof, original, retained: blobs };
    });
  }
  private async verifyMigration(source: MigrationSource, original: Uint8Array, read: ReadRetained, receiverBase: Doc): Promise<Doc> {
    require(this.migration, 'migration verifier unavailable'); migrationSource(source, this.target);
    require(original.length === source.originalInput.byteLength && sha(original) === source.originalInput.sha256, 'original input mismatch');
    let total = original.length; const retained = new Map<string, Ref>();
    const verifiedRead: ReadRetained = async ref => {
      refs([ref]); require(ref.byteLength <= LIMIT.metadata, 'retained blob budget');
      const previous = retained.get(ref.digest);
      if (previous) require(same(previous, ref), 'retained reference mismatch');
      else {
        total += ref.byteLength;
        require(retained.size < LIMIT.count && total <= LIMIT.metadata, 'migration retained byte budget');
        retained.set(ref.digest, { ...ref });
      }
      const bytes = await read(ref);
      require(bytes.length === ref.byteLength && sha(bytes) === ref.digest, 'retained source integrity mismatch'); return bytes;
    };
    const ancestor = load(await verifiedRead(source.ancestor.metadata), this.target);
    const foundation = load(await verifiedRead(source.foundation.metadata), this.target);
    require(same(heads(ancestor), source.ancestor.heads) && same(heads(foundation), source.foundation.heads) &&
      same(heads(atHeads(foundation, source.ancestor.heads)), heads(ancestor)), 'migration foundation ancestry mismatch');
    require(same(heads(atHeads(receiverBase, source.foundation.heads)), source.foundation.heads), 'unregistered migration foundation');
    const generated = await this.migration.verifySource(source, original.slice(), verifiedRead);
    validateRoot(generated, this.target);
    require(same(heads(generated), source.generatedHeads) &&
      same(heads(atHeads(generated, source.foundation.heads)), source.foundation.heads), 'generated source ancestry mismatch');
    const all = index(generated), seen = new Set<string>();
    for (const part of [...source.semanticRegistration, ...source.sourceObservation]) {
      const bytes = await verifiedRead(part.bytes), decoded = A.decodeChange(bytes);
      require(!seen.has(decoded.hash) && decoded.hash === part.expectedChangeHash && same([...decoded.deps].sort(), part.dependencies) &&
        all.has(decoded.hash) && sha(all.get(decoded.hash)!.bytes) === part.bytesSha256, 'registration source mismatch');
      seen.add(decoded.hash);
    }
    return generated;
  }
  private async prepare(tx: string, kind: Batch['kind'], staged: Ref[], build: (base: Doc) => {
    parts: Uint8Array[]; source?: Uint8Array; batchSource?: RemoteSource;
  } | Promise<{ parts: Uint8Array[]; source?: Uint8Array; batchSource?: RemoteSource;
    migrationSource?: MigrationSource; original?: Uint8Array; retained?: RetainedBlob[] }>): Promise<'published' | 'noop'> {
    return this.ports.exclusive(async () => {
      const control = await this.ports.control(); require(!control.pending, 'unfinished journal; read-only');
      require(!await this.ports.files.read(journalPath(tx), LIMIT.journal), 'transaction already exists');
      const base = await this.ports.current(); validateRoot(base, this.target);
      require(same(heads(base), control.publishedHeads), 'unpublished receiver base');
      const built = await build(base);
      // Complete replay has no metadata transaction; only explicit blob repair/protection.
      if (!built.parts.length) { await this.protect(staged); await this.checkClosure(base); return 'noop'; }
      require(built.parts.length <= LIMIT.count, 'change count');
      await this.write({ transactionId: tx, purpose: kind, target: this.target, state: 'staging', sourceResume: { kind: 'none' } });
      await this.ports.setControl({ ...control, pending: tx });
      await this.ports.checkpoint('staging');
      await this.protect(staged);
      if (built.source) await this.ports.files.write(sourcePath(tx), built.source);
      if ('original' in built && built.original) await this.ports.files.write(originalPath(tx), built.original);
      if ('retained' in built) for (const item of built.retained ?? []) await this.ports.files.write(artifactPath(tx, item.ref), item.bytes);
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
      if ('migrationSource' in built && built.migrationSource) {
        // Acknowledge only what the journal can actually read back, not just the
        // caller's preparation buffers. A failed staging write stays unprepared.
        await this.verifyMigration(built.migrationSource, await this.required(originalPath(tx), LIMIT.metadata), async ref => {
          require(staged.some(item => same(item, ref)), 'unregistered retained source blob');
          return this.required(artifactPath(tx, ref), LIMIT.metadata);
        }, base);
      }
      const common = { baseHeads: heads(base), exactChangeSetDigest: '0'.repeat(64), changes: descriptors };
      const batch: Batch = kind === 'localCommand' ? { ...common, kind } : kind === 'remotePackageMerge' ?
        { ...common, kind, source: built.batchSource!, expectedFinalHeads: heads(final) } :
        { ...common, kind, source: ('migrationSource' in built ? built.migrationSource : undefined)!, expectedFinalHeads: heads(final) };
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
    if (batch.kind === 'preparedMigration') {
      const source = await this.verifyMigration(batch.source, await this.required(originalPath(j.transactionId), LIMIT.metadata), async ref => {
        require(prepared.stagedBlobs.some(item => same(item, ref)), 'unregistered retained source blob');
        return this.required(artifactPath(j.transactionId, ref), LIMIT.metadata);
      }, base);
      require(same(missing(base, source).map(sha), changes.map(sha)), 'incomplete migration change set');
      await this.migration!.validateFinal(detached(base, changes));
    }
    const finalAtBase = detached(base, changes);
    await this.checkClosure(finalAtBase);
    for (const ref of prepared.stagedBlobs)
      require(await this.ports.hasProtected(ref) && await this.ports.hasVerified(ref), 'staged inventory missing');
    if (batch.kind !== 'localCommand') {
      require(same(heads(finalAtBase), batch.expectedFinalHeads), 'final heads mismatch');
      const allowed = index(finalAtBase);
      if (!completed) require([...index(current).keys()].every(h => allowed.has(h)), 'unexpected remote writer');
    }
    // Local concurrent replacements remain legal and participate in final closure.
    await this.checkClosure(detached(current, changes));
    if (batch.kind === 'preparedMigration') await this.migration!.validateFinal(detached(current, changes));
    if (completed || prepared.state === 'metadataDurable') {
      const known = index(current);
      require(batch.changes.every(p => known.has(p.expectedChangeHash)), 'acknowledged metadata missing; repair required');
      for (const [ordinal, bytes] of changes.entries())
        require(sha(known.get(batch.changes[ordinal]!.expectedChangeHash)!.bytes) === sha(bytes), 'durable bytes rewritten');
      if (completed) return; // Later legitimate edits are allowed; no old-head republication.
      if (batch.kind !== 'localCommand')
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
    if (batch.kind !== 'localCommand') require(same(heads(durable), batch.expectedFinalHeads), 'durable heads mismatch');
    await this.checkClosure(durable);
    await this.write({ ...prepared, state: 'metadataDurable' }); await this.ports.checkpoint('journalDurable');
    const control = await this.ports.control(); require(control.pending === j.transactionId, 'publication owner changed');
    await this.ports.setControl({ pending: null, publishedHeads: heads(durable) });
    await this.ports.checkpoint('published');
    // Original files intentionally retained in the PoC. No cleanup/GC guarantee.
  }
}
