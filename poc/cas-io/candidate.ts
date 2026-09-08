// Disposable bounded CAS publication proof. NOT the cross-store metadata journal.
import { NativeSha256 } from '../../src/nativeGs/sha256';

export const CHUNK_BYTES = 1024 * 1024;
const RECEIPT_BYTES = 4096;
export interface BlobRef { sha256: string; byteLength: number }
export interface Source { size: number; chunks(): AsyncIterable<Uint8Array> }
export interface Io {
  // Observation may wait for the same writer lock; mutations retain the
  // backend's default contention policy. Never inspect receipts without a lease.
  exclusive<T>(task: () => Promise<T>, options?: { wait: boolean }): Promise<T>;
  read(key: string): Promise<Source | null>;
  write(key: string, bytes: AsyncIterable<Uint8Array>): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface Sink {
  write(bytes: Uint8Array): Promise<void>;
  commit(): Promise<void>;
  abort(): Promise<void>;
}
export type Boundary = 'stagingReceipt' | 'stagedBytes' | 'verifiedSourceReceipt' |
  'copiedBytes' | 'verifiedCopy' | 'publishedReceipt' | 'completeReceipt' | 'cleanup';
type Receipt = { state: 'staging' | 'verifiedSource' | 'complete'; ref: BlobRef };
export class CasError extends Error {
  constructor(readonly code: 'invalid' | 'corrupt' | 'unverified' | 'missing' | 'incomplete' | 'duplicate') {
    super(`CAS probe: ${code}`); this.name = 'CasError';
  }
}
const fail = (code: CasError['code']): never => { throw new CasError(code); };
const validateRef = (ref: BlobRef): void => {
  if (!ref || !/^[0-9a-f]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.byteLength) || ref.byteLength < 0)
    fail('invalid');
};
const validateTx = (tx: string) => { if (!/^[0-9a-f]{32}$/.test(tx)) fail('invalid'); };
const sameRef = (a: BlobRef, b: BlobRef) => a.sha256 === b.sha256 && a.byteLength === b.byteLength;
const transactionKey = (tx: string) => `receipts/${tx}.json`;
const stageKey = (tx: string) => `staging/${tx}.bin`;
const blobKey = (ref: BlobRef) => `blobs/${ref.sha256}`;
const verifiedKey = (ref: BlobRef) => `verified/${ref.sha256}.json`;
const stopped = (signal?: AbortSignal) => { signal?.throwIfAborted(); };
async function* one(bytes: Uint8Array) { yield bytes; }
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('corrupt');
  return input as Record<string, unknown>;
}
function exactKeys(input: Record<string, unknown>, keys: string[]) {
  if (Object.keys(input).sort().join(',') !== keys.sort().join(',')) fail('corrupt');
}

export class CasCandidate {
  constructor(private readonly io: Io, private readonly checkpoint: (at: Boundary) => Promise<void> = async () => {}) {}

  private async writeReceipt(key: string, receipt: Receipt): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(receipt));
    if (bytes.length > RECEIPT_BYTES) fail('invalid');
    await this.io.write(key, one(bytes));
  }

  private async receipt(key: string): Promise<Receipt | null> {
    const source = await this.io.read(key); if (!source) return null;
    if (source.size > RECEIPT_BYTES || source.size <= 0) return fail('corrupt');
    const bytes = new Uint8Array(source.size); let count = 0;
    for await (const part of source.chunks()) {
      if (part.length + count > bytes.length) fail('corrupt');
      bytes.set(part, count); count += part.length;
    }
    if (count !== source.size) fail('corrupt');
    let parsed: Record<string, unknown>;
    try { parsed = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
    catch { return fail('corrupt'); }
    exactKeys(parsed, ['state', 'ref']);
    if (!['staging', 'verifiedSource', 'complete'].includes(String(parsed.state))) return fail('corrupt');
    const ref = object(parsed.ref); exactKeys(ref, ['sha256', 'byteLength']);
    if (typeof ref.sha256 !== 'string' || typeof ref.byteLength !== 'number') return fail('corrupt');
    const result = { state: parsed.state as Receipt['state'], ref: { sha256: ref.sha256, byteLength: ref.byteLength } };
    try { validateRef(result.ref); } catch { return fail('corrupt'); }
    return result;
  }

  private async *verifiedChunks(source: AsyncIterable<Uint8Array>, expected: BlobRef,
    signal?: AbortSignal): AsyncIterable<Uint8Array> {
    const digest = new NativeSha256(); let count = 0;
    for await (const bytes of source) {
      stopped(signal);
      // The source contract is bounded too. Never queue or join whole payloads.
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > CHUNK_BYTES) fail('invalid');
      count += bytes.byteLength;
      if (!Number.isSafeInteger(count) || count > expected.byteLength) fail('corrupt');
      digest.update(bytes); yield bytes;
    }
    stopped(signal);
    if (count !== expected.byteLength || digest.digestHex() !== expected.sha256) fail('corrupt');
  }

  private async verify(key: string, ref: BlobRef, signal?: AbortSignal): Promise<void> {
    const source = await this.io.read(key); if (!source) return fail('missing');
    if (source.size !== ref.byteLength) fail('corrupt');
    for await (const _part of this.verifiedChunks(source.chunks(), ref, signal)) { /* discard bounded chunk */ }
  }

  /** Presence/inventory check only; caller must use export for suspicion/full-byte verification. */
  private async isPublished(ref: BlobRef): Promise<boolean> {
    const receipt = await this.receipt(verifiedKey(ref)); if (!receipt) return false;
    if (receipt.state !== 'complete' || !sameRef(receipt.ref, ref)) fail('corrupt');
    const file = await this.io.read(blobKey(ref));
    if (!file) return fail('missing');
    if (file.size !== ref.byteLength) fail('corrupt');
    return true;
  }

  /** Isolated journal test port: verified receipt + size/presence, not a rehash. */
  async hasVerified(ref: BlobRef): Promise<boolean> {
    validateRef(ref); const expected = { ...ref };
    return this.io.exclusive(() => this.isPublished(expected), { wait: true });
  }

  async import(tx: string, ref: BlobRef, source: AsyncIterable<Uint8Array>, signal?: AbortSignal): Promise<BlobRef> {
    validateTx(tx); validateRef(ref);
    // Snapshot caller-owned identity before waiting for the lock.
    const expected = { ...ref };
    return this.io.exclusive(async () => {
      stopped(signal);
      if (await this.io.read(transactionKey(tx))) return fail('duplicate');
      await this.writeReceipt(transactionKey(tx), { state: 'staging', ref: expected });
      await this.checkpoint('stagingReceipt');
      await this.io.write(stageKey(tx), this.verifiedChunks(source, expected, signal));
      await this.checkpoint('stagedBytes');
      await this.writeReceipt(transactionKey(tx), { state: 'verifiedSource', ref: expected });
      await this.checkpoint('verifiedSourceReceipt');
      return this.finish(tx, expected, signal);
    });
  }

  private async finish(tx: string, ref: BlobRef, signal?: AbortSignal): Promise<BlobRef> {
    stopped(signal);
    if (!await this.isPublished(ref)) {
      // Reverify staging on recovery; a stored descriptor is not byte identity.
      await this.verify(stageKey(tx), ref, signal);
      const source = (await this.io.read(stageKey(tx)))!;
      await this.io.write(blobKey(ref), this.verifiedChunks(source.chunks(), ref, signal));
      await this.checkpoint('copiedBytes');
      await this.verify(blobKey(ref), ref, signal);
      await this.checkpoint('verifiedCopy');
      stopped(signal);
      await this.writeReceipt(verifiedKey(ref), { state: 'complete', ref });
      await this.checkpoint('publishedReceipt');
    }
    stopped(signal);
    await this.writeReceipt(transactionKey(tx), { state: 'complete', ref });
    await this.checkpoint('completeReceipt');
    await this.io.remove(stageKey(tx));
    await this.checkpoint('cleanup');
    return { ...ref };
  }

  async recover(tx: string, signal?: AbortSignal): Promise<BlobRef> {
    validateTx(tx);
    return this.io.exclusive(async () => {
      stopped(signal);
      const receipt = await this.receipt(transactionKey(tx)); if (!receipt) return fail('missing');
      if (receipt.state === 'staging') return fail('incomplete'); // No source lease: do not guess/resume.
      if (receipt.state === 'complete') {
        if (!await this.isPublished(receipt.ref)) return fail('unverified');
        await this.io.remove(stageKey(tx)); return { ...receipt.ref };
      }
      return this.finish(tx, receipt.ref, signal);
    });
  }

  async export(ref: BlobRef, sink: Sink, signal?: AbortSignal): Promise<void> {
    try {
      validateRef(ref); const expected = { ...ref };
      await this.io.exclusive(async () => {
        stopped(signal);
        if (!await this.isPublished(expected)) return fail('unverified');
        // Verify before handing out bytes, and again while streaming to a sink
        // that must withhold publication until commit. No full-file buffer.
        await this.verify(blobKey(expected), expected, signal);
        const source = (await this.io.read(blobKey(expected)))!;
        for await (const part of this.verifiedChunks(source.chunks(), expected, signal)) await sink.write(part);
        stopped(signal); await sink.commit();
      });
    } catch (error) {
      try { await sink.abort(); } catch { /* preserve original failure, no success acknowledgement */ }
      throw error;
    }
  }
}
