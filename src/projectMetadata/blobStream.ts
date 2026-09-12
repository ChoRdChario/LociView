import { NativeSha256 } from '../nativeGs/sha256';

export interface BlobStreamLimits { readonly maxBlobBytes: number; readonly maxChunkBytes: number; readonly maxChunks: number }
export interface BlobDigest { readonly digest: string; readonly byteLength: number }
export class BlobStoreError extends Error {
  constructor(readonly code: 'invalid' | 'limit' | 'mismatch' | 'incomplete' | 'unverified' | 'corrupt' | 'busy') {
    super(`Blob storage: ${code}`); this.name = 'BlobStoreError';
  }
}

/** One pull at a time; never buffer a whole body or tee an unbounded stream. */
export function checkedBlobStream(input: ReadableStream<Uint8Array>, limits: BlobStreamLimits,
  complete: (digest: BlobDigest) => void, expected?: BlobDigest, signal?: AbortSignal,
  failed?: (error: unknown) => Promise<void>): ReadableStream<Uint8Array> {
  const reader = input.getReader(), hash = new NativeSha256();
  let byteLength = 0, chunks = 0, released = false;
  const abort = () => { if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError'); };
  const onAbort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  const release = () => { if (!released) { released = true; signal?.removeEventListener('abort', onAbort); reader.releaseLock(); } };
  signal?.addEventListener('abort', onAbort, { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        abort(); const r = await reader.read(); abort();
        if (r.done) {
          const digest = { digest: hash.digestHex(), byteLength };
          if (expected && (digest.digest !== expected.digest || byteLength !== expected.byteLength)) throw new BlobStoreError('mismatch');
          complete(digest); controller.close(); release(); return;
        }
        if (!(r.value instanceof Uint8Array)) throw new BlobStoreError('invalid');
        if (expected && r.value.byteLength > expected.byteLength - byteLength) throw new BlobStoreError('mismatch');
        if (++chunks > limits.maxChunks || r.value.byteLength > limits.maxChunkBytes || r.value.byteLength > limits.maxBlobBytes - byteLength)
          throw new BlobStoreError('limit');
        const chunk = r.value.slice(); hash.update(chunk); byteLength += chunk.byteLength; controller.enqueue(chunk);
      } catch (error) {
        try { await reader.cancel(error); } catch { /* Preserve original failure. */ }
        release(); try { await failed?.(error); } catch { /* Original failure still rejects the stream. */ }
        controller.error(error);
      }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { release(); } },
  }, { highWaterMark: 0 });
}

/** Stored files choose their own chunk partition. Split without copying a whole large chunk. */
export function storedBlobStream(input: ReadableStream<Uint8Array>, limits: BlobStreamLimits,
  expected: BlobDigest, complete: (digest: BlobDigest) => void, signal?: AbortSignal,
  failed?: (error: unknown) => Promise<void>): ReadableStream<Uint8Array> {
  const reader = input.getReader(); let pending: Uint8Array | null = null, at = 0, reads = 0, released = false;
  const maxChunks = Math.max(limits.maxChunks, Math.min(Number.MAX_SAFE_INTEGER, expected.byteLength + 1));
  const release = () => { if (!released) { released = true; reader.releaseLock(); } };
  const divided = new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        if (!pending) {
          if (++reads > maxChunks) throw new BlobStoreError('limit');
          const r = await reader.read(); if (r.done) { c.close(); release(); return; }
          if (!(r.value instanceof Uint8Array)) throw new BlobStoreError('invalid'); pending = r.value; at = 0;
        }
        const end = Math.min(at + limits.maxChunkBytes, pending.length); c.enqueue(pending.slice(at, end)); at = end;
        if (at === pending.length) pending = null;
      } catch (error) { try { await reader.cancel(error); } catch { /* Preserve failure. */ } release(); c.error(error); }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { pending = null; release(); } },
  }, { highWaterMark: 0 });
  return checkedBlobStream(divided, { ...limits, maxChunks }, complete, expected, signal, failed);
}
