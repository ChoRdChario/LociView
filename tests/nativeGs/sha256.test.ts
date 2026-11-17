import { describe, expect, it, vi } from 'vitest';
import { digestNativeBytes, digestNativeStream, hashingNativeStream, hashOwnedBytes } from '../../src/nativeGs/sha256';

function chunked(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const value = chunks[index++];
      if (value === undefined) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
  });
}

describe('native streaming SHA-256', () => {
  it('matches standard vectors without whole-buffer WebCrypto', async () => {
    expect(digestNativeBytes(new Uint8Array()).sha256).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect((await digestNativeStream(chunked(['a', 'b', 'c']))).sha256).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const millionA = new Uint8Array(1_000_000).fill(0x61);
    expect(digestNativeBytes(millionA).sha256).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('hashes the same chunks that reach the writer', async () => {
    let completed: { byteLength: number; sha256: string } | null = null;
    const passed = await new Response(hashingNativeStream(chunked(['stream', '-', 'verified']), (result) => {
      completed = result;
    })).arrayBuffer();
    expect(new TextDecoder().decode(passed)).toBe('stream-verified');
    expect(completed).toEqual(digestNativeBytes(new TextEncoder().encode('stream-verified')));
  });

  it('hashes only the supplied buffer range with or without the browser digest', async () => {
    const bytes = new TextEncoder().encode('[abc]').subarray(1, 4);
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(await hashOwnedBytes(bytes)).toBe(expected);
    vi.stubGlobal('crypto', {});
    try { expect(await hashOwnedBytes(bytes)).toBe(expected); }
    finally { vi.unstubAllGlobals(); }
  });
});
