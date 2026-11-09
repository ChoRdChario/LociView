import { describe, expect, it, vi } from 'vitest';
import { checkedBlobStream } from '../src/projectMetadata/blobStream';
import { NativeSha256 } from '../src/nativeGs/sha256';

const limits = { maxBlobBytes: 1024, maxChunkBytes: 1024, maxChunks: 8 };
const digest = (bytes: Uint8Array) => {
  const hash = new NativeSha256(); hash.update(bytes);
  return { digest: hash.digestHex(), byteLength: bytes.length };
};

describe('checksum reader ownership and cancelled EOF', () => {
  it('owns input bytes before exposing them to a consumer', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]), expected = digest(bytes), complete = vi.fn();
    const input = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }, { highWaterMark: 0 });
    const reader = checkedBlobStream(input, limits, complete, expected).getReader();
    try {
      const first = await reader.read(); bytes.fill(99);
      expect(first.value).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
      first.value!.fill(88);
      expect((await reader.read()).done).toBe(true);
      expect(complete).toHaveBeenCalledExactlyOnceWith(expected);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    expect(input.locked).toBe(false);
  });

  it('normalizes subclass bytes before hashing and exposing an owned copy', async () => {
    const bytes = Uint8Array.from({ length: 64 }, (_, i) => i), expected = digest(bytes), complete = vi.fn();
    class AlteredView extends Uint8Array {
      override slice() { return this; }
      override subarray(start = 0, end = this.length) { return new Uint8Array(end - start).fill(255); }
    }
    const borrowed = new AlteredView(bytes);
    const input = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(borrowed); c.close(); } }, { highWaterMark: 0 });
    const reader = checkedBlobStream(input, limits, complete, expected).getReader();
    try {
      const first = await reader.read();
      expect(Object.getPrototypeOf(first.value)).toBe(Uint8Array.prototype);
      borrowed.fill(99); expect(first.value).toEqual(bytes);
      expect((await reader.read()).done).toBe(true);
      expect(complete).toHaveBeenCalledExactlyOnceWith(expected);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    expect(input.locked).toBe(false);
  });

  it.each(['finish', 'cancel', 'abort'] as const)('handles %s during a held EOF without late completion', async mode => {
    const bytes = new Uint8Array([1, 2, 3]), expected = digest(bytes), complete = vi.fn(), failed = vi.fn(), cancel = vi.fn();
    let finish!: () => void, entered!: () => void, sent = false;
    const gate = new Promise<void>(r => { finish = r; }), pending = new Promise<void>(r => { entered = r; });
    const input = new ReadableStream<Uint8Array>({ async pull(c) {
      if (!sent) { sent = true; c.enqueue(bytes); return; }
      entered(); await gate; c.close();
    }, cancel }, { highWaterMark: 0 });
    const controller = new AbortController(), reader = checkedBlobStream(input, limits, complete, expected, controller.signal, failed).getReader();
    try {
      expect((await reader.read()).value).toEqual(bytes);
      const ending = reader.read(); void ending.catch(() => {}); await pending;
      expect(complete).not.toHaveBeenCalled();
      if (mode === 'finish') {
        finish(); expect((await ending).done).toBe(true);
        expect(complete).toHaveBeenCalledExactlyOnceWith(expected); expect(cancel).not.toHaveBeenCalled();
      } else if (mode === 'cancel') {
        await reader.cancel('stopped'); expect((await ending).done).toBe(true);
        expect(complete).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledExactlyOnceWith('stopped');
        expect(failed).not.toHaveBeenCalled();
      } else {
        const reason = Error('stopped'); controller.abort(reason);
        await expect(ending).rejects.toBe(reason); expect(complete).not.toHaveBeenCalled();
        expect(cancel).toHaveBeenCalledExactlyOnceWith(reason); expect(failed).toHaveBeenCalledExactlyOnceWith(reason);
      }
    } finally { finish(); await reader.cancel().catch(() => {}); reader.releaseLock(); }
    expect(input.locked).toBe(false);
  });
});
