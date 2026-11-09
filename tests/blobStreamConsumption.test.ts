import { describe, expect, it, vi } from 'vitest';
import { checkedBlobStream } from '../src/projectMetadata/blobStream';
import { NativeSha256 } from '../src/nativeGs/sha256';
import { createHash } from 'node:crypto';
import * as taskYield from '../src/core/taskYield';

const limits = { maxBlobBytes: 1024, maxChunkBytes: 1024, maxChunks: 8 };
const digest = (bytes: Uint8Array) => {
  const hash = new NativeSha256(); hash.update(bytes);
  return { digest: hash.digestHex(), byteLength: bytes.length };
};

describe('checksum reader ownership and cancelled EOF', () => {
  it.each([0, 65_535, 65_536, 65_537, 131_073])('preserves exact digest and raw partition at %i bytes including an empty tail', async length => {
    const bytes = Uint8Array.from({ length }, (_, i) => i % 251), split = Math.min(65_537, length), complete = vi.fn();
    const expected = { digest: createHash('sha256').update(bytes).digest('hex'), byteLength: length };
    const input = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.subarray(0, split)); c.enqueue(bytes.subarray(split)); c.close(); } }, { highWaterMark: 0 });
    const reader = checkedBlobStream(input, { maxBlobBytes: Math.max(1, length), maxChunkBytes: Math.max(1, length), maxChunks: 2 }, complete, expected).getReader();
    try { expect((await reader.read()).value).toEqual(bytes.subarray(0, split)); expect((await reader.read()).value).toEqual(bytes.subarray(split));
      expect((await reader.read()).done).toBe(true); expect(complete).toHaveBeenCalledExactlyOnceWith(expected); }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); } expect(input.locked).toBe(false);
  });

  it.each(['finish', 'cancel', 'abort'] as const)('owns a large raw chunk before cooperative %s and keeps its original input budget', async mode => {
    const original = Uint8Array.from({ length: 131_072 }, (_, i) => i % 251), borrowed = original.slice(),
      expected = { digest: createHash('sha256').update(original).digest('hex'), byteLength: original.length }, complete = vi.fn(), failed = vi.fn(), cancel = vi.fn();
    const input = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(borrowed); c.close(); }, cancel }, { highWaterMark: 0 });
    const controller = new AbortController(); let elapsed = 0, entered!: () => void, release: (() => void) | undefined;
    const paused = new Promise<void>(resolve => { entered = resolve; });
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed += 9);
    const timer = vi.spyOn(taskYield, 'yieldTask').mockImplementation(() => new Promise<void>(resolve => { release = resolve; entered(); }));
    const reader = checkedBlobStream(input, { maxBlobBytes: original.length, maxChunkBytes: original.length, maxChunks: 1 }, complete, expected, controller.signal, failed).getReader();
    const reading = reader.read(); void reading.catch(() => {});
    try {
      await Promise.race([paused, reading.then(() => { throw Error('Expected an internal task boundary before returning the large chunk'); })]);
      expect(complete).not.toHaveBeenCalled(); borrowed.fill(255);
      if (mode === 'cancel') { await reader.cancel('stopped'); release!(); expect((await reading).done).toBe(true); expect(failed).not.toHaveBeenCalled(); }
      else if (mode === 'abort') { const reason = Error('stopped'); controller.abort(reason); release!(); await expect(reading).rejects.toBe(reason); expect(failed).toHaveBeenCalledExactlyOnceWith(reason); }
      else { release!(); expect((await reading).value).toEqual(original); expect((await reader.read()).done).toBe(true); expect(complete).toHaveBeenCalledExactlyOnceWith(expected); }
      if (mode !== 'finish') expect(complete).not.toHaveBeenCalled();
    } finally { release?.(); await reading.catch(() => {}); await reader.cancel().catch(() => {}); reader.releaseLock(); timer.mockRestore(); clock.mockRestore(); }
    expect(input.locked).toBe(false);
  });

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
