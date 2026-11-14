import * as A from '@automerge/automerge/slim';
import { Repo, stringifyAutomergeUrl, parseAutomergeUrl, type DocumentId, type BinaryDocumentId } from '@automerge/automerge-repo/slim';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { checkedChanges, checkedProof, checkLimits, fail, inspectPhysical, type MetadataLimits, type MetadataProof, type PhysicalDoc } from './format';
import { assertTextDocumentWriter, equalBytes, json, technicalId, withMetadataRead } from './persistence';
import { ProjectMetadataSource } from './source';

/** Owned storage factory, bound to one new-workspace namespace; no library objects escape. */
export interface MetadataStoragePort {
  load(key: string[]): Promise<Uint8Array | undefined>;
  save(key: string[], bytes: Uint8Array): Promise<void>;
  remove(key: string[]): Promise<void>;
  loadRange(prefix: string[]): Promise<{ key: string[]; data: Uint8Array | undefined }[]>;
  removeRange(prefix: string[]): Promise<void>;
}
export type MetadataStorageFactory = () => MetadataStoragePort;
// Repo 2.5.6 hidden seam: intentionally confined here. No handles/autosave/notification authority.
interface PinnedStorage {
  loadDoc(id: DocumentId): Promise<PhysicalDoc | null>;
  saveDoc(id: DocumentId, doc: PhysicalDoc): Promise<void>;
}

export class MetadataRepository {
  private readonly limits: MetadataLimits;
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly factory: MetadataStorageFactory, limits: MetadataLimits) {
    this.limits = checkLimits(limits);
  }
  /** OPFS absence is not proof that the separate metadata namespace is vacant. */
  async assertImportNamespace(repositoryId?: string): Promise<void> {
    const rows = await this.factory().loadRange([]);
    if (rows.length > this.limits.maxChanges) fail('stored-chunks');
    let bytes = 0;
    for (const row of rows) {
      if (!row.data || (bytes += row.data.length) > this.limits.maxTotalBytes) fail('stored-chunk-budget');
      if (json(row.key) !== json(['storage-adapter-id']) &&
        (!repositoryId || row.key[0] !== this.documentId(repositoryId))) fail('import-existing-repository');
    }
  }

  private async use<T>(write: boolean, action: (storage: PinnedStorage) => Promise<T>): Promise<T> {
    const base = this.factory(), authority = this.fs.mutationAuthority;
    let closed = false;
    let loadedBytes = 0, loadedChunks = 0;
    const pending = new Set<Promise<void>>();
    const mutate = (action: () => Promise<void>): Promise<void> => {
      if (closed || !write) return Promise.reject(new Error('Metadata storage is read-only'));
      authority.assertWorkspaceWriteAuthorized();
      const task = Promise.resolve().then(() => { authority.assertWorkspaceWriteAuthorized(); return action(); })
        .then(() => { authority.assertWorkspaceWriteAuthorized(); });
      pending.add(task); void task.then(() => pending.delete(task), () => pending.delete(task)); return task;
    };
    const storage: MetadataStoragePort = {
      load: key => base.load(key),
      loadRange: async prefix => {
        const rows = await base.loadRange(prefix);
        loadedChunks += rows.length;
        if (loadedChunks > this.limits.maxChanges) fail('stored-chunks');
        for (const row of rows) { if (!row.data) fail('stored-chunk-missing'); loadedBytes += row.data!.length; }
        if (loadedBytes > this.limits.maxTotalBytes) fail('stored-chunk-budget');
        return rows;
      },
      save: (key, bytes) => mutate(() => base.save([...key], bytes.slice())),
      remove: key => mutate(() => base.remove([...key])),
      removeRange: key => mutate(() => base.removeRange([...key])),
    };
    let repo: Repo | undefined;
    try {
      // Repo constructor may seed its identity: complete that explicitly before constructing it.
      let identity = await base.load(['storage-adapter-id']);
      if (!identity) {
        if (!write) fail('storage-identity-missing');
        const created = new TextEncoder().encode(crypto.randomUUID());
        await storage.save(['storage-adapter-id'], created);
        identity = await base.load(['storage-adapter-id']);
        if (!identity || !equalBytes(identity, created)) fail('storage-identity-readback');
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(new TextDecoder().decode(identity))) fail('storage-identity');
      repo = new Repo({ storage, network: [] }); await repo.storageId();
      const pinned = (repo as unknown as { storageSubsystem?: PinnedStorage }).storageSubsystem;
      if (!pinned?.loadDoc || !pinned.saveDoc) return fail('repo-version');
      return await action(pinned);
    } finally {
      closed = true; await Promise.allSettled([...pending]);
      // No handles exist, so shutdown has no pending document flush to retry.
      if (repo) await repo.shutdown();
    }
  }

  documentId(id: string): DocumentId {
    const bytes = Uint8Array.from(technicalId(id).match(/../g)!, v => parseInt(v, 16));
    return parseAutomergeUrl(stringifyAutomergeUrl(bytes as BinaryDocumentId)).documentId;
  }

  async read(id: string, proof: MetadataProof, heads?: readonly string[], allowUninitialized = false): Promise<ProjectMetadataSource | null> {
    const ownedId = id, ownedProof = checkedProof(proof, this.limits), ownedHeads = heads ? [...heads] : undefined;
    return withMetadataRead(this.fs, this.factory, ({ fs, factory }) =>
      new MetadataRepository(fs, factory!, this.limits).readDirect(ownedId, ownedProof, ownedHeads, allowUninitialized), 'repository.read');
  }

  private async readDirect(id: string, proof: MetadataProof, heads: readonly string[] | undefined, allowUninitialized: boolean): Promise<ProjectMetadataSource | null> {
    if (allowUninitialized && !await this.factory().load(['storage-adapter-id'])) return null;
    return this.use(false, async storage => {
      const doc = await storage.loadDoc(this.documentId(id)); if (!doc) return null;
      const parts = checkedChanges(A.getAllChanges(doc), this.limits);
      if (!heads) return ProjectMetadataSource.reopen(parts, proof, this.limits);
      // 3.4.1 getAllChanges(view) ignores the view heads. Select causal ancestors from exact source instead.
      if (!heads.length || json([...heads].sort()) !== json([...new Set(heads)].sort())) fail('read-heads');
      const decoded = parts.map(bytes => ({ bytes, change: A.decodeChange(bytes) }));
      const byHash = new Map(decoded.map(({ change }) => [change.hash, change]));
      const selected = new Set<string>(), pending = [...heads]; let work = 0;
      while (pending.length) {
        if (++work > this.limits.maxWork) fail('read-heads-budget');
        const hash = pending.pop()!; if (selected.has(hash)) continue;
        const found = byHash.get(hash); if (!found) return fail('read-head-missing');
        selected.add(hash); pending.push(...found.deps);
      }
      const exact = decoded.filter(({ change }) => selected.has(change.hash)).map(({ bytes }) => bytes);
      const source = ProjectMetadataSource.reopen(exact, proof, this.limits);
      if (json(source.heads) !== json([...heads].sort())) fail('read-heads-mismatch');
      return source;
    });
  }

  /** Confirm an ordinary text edit against the latest document in the selected store. */
  async confirmTextSource(id: string, expected: ProjectMetadataSource, captionId: string): Promise<void> {
    await this.use(false, async storage => {
      const doc = await storage.loadDoc(this.documentId(id));
      if (!doc || !expected.matchesStoredCaption(doc, captionId, this.limits)) return fail('command-base-changed');
    });
  }

  /** Live selected text command only. Recovery uses persist and a full fresh inspection. */
  async persistText(id: string, base: ProjectMetadataSource, expected: ProjectMetadataSource, captionId: string, part: Uint8Array) {
    const owned = part.slice(), key = this.documentId(id);
    assertTextDocumentWriter(this.fs, this.factory, key);
    await this.use(true, async storage => {
      const previous = await storage.loadDoc(key);
      if (!previous || !base.matchesStoredCaption(previous, captionId, this.limits)) return fail('command-base-changed');
      const [next] = A.applyChanges(previous, [owned]);
      if (!expected.matchesStoredCaption(next, captionId, this.limits)) return fail('stored-original-bytes');
      await storage.saveDoc(key, next);
    });
    await this.confirmTextSource(id, expected, captionId);
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
  }

  async confirmPublishedEdit(id: string, baseHeads: readonly string[], expectedHeads: readonly string[], part: Uint8Array): Promise<void> {
    await this.use(false, async storage => {
      const doc = await storage.loadDoc(this.documentId(id));
      if (!doc || json(A.getHeads(doc).sort()) !== json(expectedHeads)) return fail('publication-readback');
      const added = A.getChangesSince(doc, [...baseHeads]);
      if (added.length !== 1 || !equalBytes(added[0]!, part)) fail('publication-readback');
    });
  }

  /** Caller holds project lease and has already retained/verified the complete journal. */
  async persist(id: string, expected: ProjectMetadataSource): Promise<ProjectMetadataSource> {
    const parts = expected.originalChanges(), byHash = new Map(parts.map(b => [A.decodeChange(b).hash, b]));
    if (byHash.size !== parts.length) fail('stored-original-bytes');
    await this.use(true, async storage => {
      const existing = await storage.loadDoc(this.documentId(id));
      if (existing) for (const b of A.getAllChanges(existing)) {
        const exact = byHash.get(A.decodeChange(b).hash);
        if (!exact || !equalBytes(exact, b)) fail('unobserved-stored-history');
      }
      const [next] = A.applyChanges(existing ?? A.init<Record<string, any>>(), parts);
      // Inspect the actual merged document before writing. The independent
      // read below still reopens the stored originals and checks their bytes.
      if (A.getMissingDeps(next, []).length) fail('missing-dependencies');
      if (json(A.getHeads(next).sort()) !== json(expected.heads)) fail('stored-heads');
      inspectPhysical(next, expected.proof, this.limits);
      await storage.saveDoc(this.documentId(id), next);
    });
    const fresh = await this.read(id, expected.proof);
    if (!fresh || fresh.token !== expected.token) fail('stored-heads');
    const stored = fresh!.originalChanges(), remaining = new Map(byHash);
    if (stored.length !== parts.length) fail('stored-original-bytes');
    for (const bytes of stored) {
      const hash = A.decodeChange(bytes).hash, original = remaining.get(hash);
      if (!original || !equalBytes(original, bytes)) fail('stored-original-bytes');
      remaining.delete(hash);
    }
    if (remaining.size) fail('stored-original-bytes');
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    return fresh!;
  }
}
