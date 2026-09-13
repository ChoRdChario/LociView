import type { ProjectWorkspaceFS, WorkspaceFS, WorkspaceReadableFile } from '../platform/fs';
import { ProjectMutationCoordinator } from '../platform/projectLock';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { checkLimits, type MetadataLimits } from './format';
import { newId, readReceipt, underWriteLease, writeReceipt } from './persistence';
import { BlobStoreError, checkedBlobStream, storedBlobStream, type BlobDigest, type BlobStreamLimits } from './blobStream';

export interface StoredBlobRef extends BlobDigest { readonly algorithm: 'sha256'; readonly mediaType: string }
export type BlobPresence = 'verified-present' | 'missing' | 'suspect' | 'unverified';
export interface BlobStoreLimits extends BlobStreamLimits { readonly metadata: MetadataLimits }
interface Receipt extends BlobDigest { version: 'cas-object-1'; objectId: string }
const root = 'v2/cas', lockId = 'v2-cas';
const receiptPath = (hash: string) => `${root}/sha256/${hash.slice(0, 2)}/${hash.slice(2)}.json`;
const objectPath = (id: string) => `${root}/objects/${id}.bin`;
const suspectPath = (hash: string) => `${root}/suspect/${hash}.json`;

/** Disconnected S1 body service. Fixed origin-wide namespace/lock, never a Project's writer. */
export class OriginBlobStore {
  private readonly limits: BlobStoreLimits;
  private readonly coordinator: ProjectMutationCoordinator;
  private readonly readFS: ProjectWorkspaceFS;
  private readonly suspect = new Set<string>();
  constructor(private readonly base: WorkspaceFS, limits: BlobStoreLimits, locks: LockManager | null) {
    for (const n of [limits.maxBlobBytes, limits.maxChunkBytes, limits.maxChunks])
      if (!Number.isSafeInteger(n) || n <= 0) throw new BlobStoreError('invalid');
    this.limits = Object.freeze({ ...limits, metadata: checkLimits(limits.metadata) });
    // Browser backend only; a missing LockManager cannot become local memory authority.
    this.coordinator = ProjectMutationCoordinator.browser(locks);
    this.readFS = this.coordinator.openView(base, root, lockId).workspace;
  }
  private ref(input: JsonObject | StoredBlobRef): StoredBlobRef {
    const value = cloneCanonicalValue(input, this.limits.metadata), c = new ProjectRecordFields(); c.blob(value, []);
    if (c.unknown) throw new BlobStoreError('invalid');
    return Object.freeze(value as unknown as StoredBlobRef);
  }
  private async receipt(fs: ProjectWorkspaceFS, ref: StoredBlobRef): Promise<Receipt | null> {
    const r = await readReceipt<Receipt>(fs, receiptPath(ref.digest), this.limits.metadata);
    if (r && (Object.keys(r).sort().join(',') !== 'byteLength,digest,objectId,version' || r.version !== 'cas-object-1' ||
      r.digest !== ref.digest || r.byteLength !== ref.byteLength || typeof r.objectId !== 'string' || !/^[0-9a-f]{32}$/.test(r.objectId))) throw new BlobStoreError('corrupt');
    return r;
  }
  private async writer<T>(action: (fs: ProjectWorkspaceFS) => Promise<T>): Promise<T> {
    const lease = await this.coordinator.tryAcquire(this.base, root, lockId);
    try {
      if (!lease.holdsWriteLock) throw new BlobStoreError('busy');
      // No cached index: every operation below reloads its exact receipt/body under this lock.
      lease.activateAfterDurableReload();
      return await underWriteLease(lease.workspace, () => action(lease.workspace));
    } finally { lease.release(); }
  }
  private async consume(file: WorkspaceReadableFile, expected: BlobDigest, signal?: AbortSignal): Promise<void> {
    if (file.size !== expected.byteLength) throw new BlobStoreError('mismatch');
    let done = false;
    const reader = storedBlobStream(file.stream(), this.limits, expected, () => { done = true; }, signal).getReader();
    try { while (!(await reader.read()).done) { /* bounded verification, no body accumulation */ } }
    finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
    if (!done) throw new BlobStoreError('incomplete');
  }
  private async verifyReceipt(fs: ProjectWorkspaceFS, ref: StoredBlobRef, r: Receipt, signal?: AbortSignal) {
    if (this.suspect.has(ref.digest) || await fs.exists(suspectPath(ref.digest))) throw new BlobStoreError('corrupt');
    const file = await fs.readStream(objectPath(r.objectId));
    try { if (!file) throw new BlobStoreError('mismatch'); await this.consume(file, ref, signal); }
    catch (error) {
      if (error instanceof BlobStoreError && error.code === 'mismatch') {
        this.suspect.add(ref.digest);
        await writeReceipt(fs, suspectPath(ref.digest), { version: 'cas-suspect-1' }, this.limits.metadata);
        throw new BlobStoreError('corrupt');
      }
      throw error;
    }
  }
  async put(input: ReadableStream<Uint8Array>, mediaType: string, expected?: JsonObject | StoredBlobRef, signal?: AbortSignal): Promise<StoredBlobRef> {
    const c = new ProjectRecordFields(); c.mime(mediaType, []);
    const expectedRef = expected && this.ref(expected);
    if (expectedRef && (expectedRef.mediaType !== mediaType || expectedRef.byteLength > this.limits.maxBlobBytes)) throw new BlobStoreError('invalid');
    return this.writer(async fs => {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError');
      const id = newId(), path = objectPath(id);
      if (await fs.exists(path)) throw new BlobStoreError('corrupt');
      let saved: BlobDigest | null = null;
      const stream = checkedBlobStream(input, this.limits, result => { saved = result; }, expectedRef, signal);
      try { await fs.writeStream(path, stream); }
      finally { try { await stream.cancel(); } catch { /* Sink owns the original failure. */ } }
      if (!saved) throw new BlobStoreError('incomplete');
      const ref: StoredBlobRef = Object.freeze({ algorithm: 'sha256', ...(saved as BlobDigest), mediaType });
      const file = await fs.readStream(path); if (!file) throw new BlobStoreError('incomplete');
      await this.consume(file, ref, signal);
      const prior = await this.receipt(fs, ref);
      if (prior) {
        await this.verifyReceipt(fs, ref, prior, signal);
        // Only this fresh redundant attempt is removed; published/orphan history is never collected here.
        await fs.remove(path);
      } else {
        if (this.suspect.has(ref.digest) || await fs.exists(suspectPath(ref.digest))) throw new BlobStoreError('corrupt');
        if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError');
        await writeReceipt(fs, receiptPath(ref.digest), { version: 'cas-object-1', digest: ref.digest, byteLength: ref.byteLength, objectId: id }, this.limits.metadata);
      }
      return ref;
    });
  }
  async inspect(input: JsonObject | StoredBlobRef): Promise<BlobPresence> {
    const ref = this.ref(input);
    try {
      if (this.suspect.has(ref.digest) || await this.readFS.exists(suspectPath(ref.digest))) return 'suspect';
      const r = await this.receipt(this.readFS, ref); if (!r) return 'unverified';
      const file = await this.readFS.readStream(objectPath(r.objectId));
      return !file ? 'missing' : file.size !== ref.byteLength ? 'suspect' : 'verified-present';
    } catch { return 'suspect'; }
  }
  private async readStored(input: JsonObject | StoredBlobRef) {
    const ref = this.ref(input);
    if (await this.inspect(ref) !== 'verified-present') throw new BlobStoreError('unverified');
    const r = await this.receipt(this.readFS, ref);
    if (!r) throw new BlobStoreError('unverified');
    const file = await this.readFS.readStream(objectPath(r.objectId));
    if (!file || file.size !== ref.byteLength) throw new BlobStoreError('corrupt');
    return { ref, file };
  }
  /** Verified stream without diagnostic writes or lock acquisition, including on corruption. */
  async openReadOnly(input: JsonObject | StoredBlobRef, ceiling: BlobStreamLimits = this.limits): Promise<WorkspaceReadableFile> {
    for (const n of [ceiling.maxBlobBytes, ceiling.maxChunkBytes, ceiling.maxChunks])
      if (!Number.isSafeInteger(n) || n <= 0) throw new BlobStoreError('invalid');
    const limits = { maxBlobBytes: Math.min(ceiling.maxBlobBytes, this.limits.maxBlobBytes),
      maxChunkBytes: Math.min(ceiling.maxChunkBytes, this.limits.maxChunkBytes), maxChunks: Math.min(ceiling.maxChunks, this.limits.maxChunks) };
    const { ref, file } = await this.readStored(input);
    if (file.size > limits.maxBlobBytes) throw new BlobStoreError('limit');
    return { size: file.size, stream: () => checkedBlobStream(file.stream(), limits, () => {}, ref) };
  }
  async open(input: JsonObject | StoredBlobRef): Promise<WorkspaceReadableFile> {
    const { ref, file } = await this.readStored(input);
    return { size: file.size, stream: () => storedBlobStream(file.stream(), this.limits, ref, () => {}, undefined, async error => {
      if (error instanceof BlobStoreError && error.code === 'mismatch') {
        this.suspect.add(ref.digest);
        // Readers never gain a per-Project CAS writer. Busy/quota still rejects the original read.
        await this.writer(fs => writeReceipt(fs, suspectPath(ref.digest), { version: 'cas-suspect-1' }, this.limits.metadata));
      }
    }) };
  }
  /** Export/suspected corruption requires a complete byte verification, unlike metadata-only inspection. */
  async verify(input: JsonObject | StoredBlobRef, signal?: AbortSignal): Promise<void> {
    const ref = this.ref(input);
    await this.writer(async fs => {
      const r = await this.receipt(fs, ref); if (!r) throw new BlobStoreError('unverified');
      await this.verifyReceipt(fs, ref, r, signal);
    });
  }
}
