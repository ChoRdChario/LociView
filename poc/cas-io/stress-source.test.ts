import { it, expect } from 'vitest';
import { createCipheriv, createHash, webcrypto } from 'node:crypto';
import { browserStressSource, STRESS_REF } from './stress-source';
import { CHUNK_BYTES } from './candidate';

it('browser WebCrypto recipe matches independent Node AES across chunk/counter boundaries', async () => {
  for (const size of [5 * CHUNK_BYTES + 19, STRESS_REF.byteLength]) {
    const cipher = createCipheriv('aes-256-ctr', Buffer.alloc(32, 0x43), Buffer.alloc(16, 0x19));
    const expected = createHash('sha256'); const observed = createHash('sha256');
    let count = 0;
    for await (const part of browserStressSource(size, undefined, () => {}, webcrypto.subtle as SubtleCrypto)) {
      expected.update(cipher.update(new Uint8Array(part.length))); observed.update(part); count += part.length;
      expect(part.length).toBeLessThanOrEqual(CHUNK_BYTES);
    }
    expected.update(cipher.final());
    const digest = observed.digest('hex');
    expect(count).toBe(size); expect(digest).toBe(expected.digest('hex'));
    if (size === STRESS_REF.byteLength) expect(digest).toBe(STRESS_REF.sha256);
  }
  expect(STRESS_REF.byteLength).toBe(500 * CHUNK_BYTES);
  const abort = new AbortController(); abort.abort();
  await expect(browserStressSource(1, abort.signal, () => {}, webcrypto.subtle as SubtleCrypto)[Symbol.asyncIterator]().next())
    .rejects.toMatchObject({ name: 'AbortError' });
});
