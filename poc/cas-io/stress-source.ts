import { CHUNK_BYTES, type BlobRef } from './candidate';

// Exact deterministic recipe used by the Node oracle, not user data/encryption.
export const STRESS_REF: Readonly<BlobRef> = Object.freeze({
  byteLength: 500 * 1024 * 1024,
  sha256: 'c8c0875f52ef7820dad6085b1dee88707fa92c5216f950472a2f446ae90cec7b',
});

export async function* browserStressSource(size = STRESS_REF.byteLength,
  signal?: AbortSignal, progress: (bytes: number) => void = () => {},
  subtle: SubtleCrypto = crypto.subtle): AsyncIterable<Uint8Array> {
  if (!Number.isSafeInteger(size) || size < 0 || size > STRESS_REF.byteLength) throw new Error('invalid synthetic size');
  const key = await subtle.importKey('raw', new Uint8Array(32).fill(0x43), 'AES-CTR', false, ['encrypt']);
  const zero = new Uint8Array(CHUNK_BYTES);
  for (let offset = 0; offset < size; offset += CHUNK_BYTES) {
    signal?.throwIfAborted();
    const counter = new Uint8Array(16).fill(0x19);
    let blocks = BigInt(offset / 16);
    for (let i = 15; i >= 0 && blocks; i--) {
      const sum = BigInt(counter[i]!) + (blocks & 255n);
      counter[i] = Number(sum & 255n); blocks = (blocks >> 8n) + (sum >> 8n);
    }
    // Per-chunk WebCrypto generates data only; SHA-256 itself stays incremental.
    const part = await subtle.encrypt({ name: 'AES-CTR', counter, length: 128 }, key,
      zero.subarray(0, Math.min(CHUNK_BYTES, size - offset)));
    signal?.throwIfAborted();
    yield new Uint8Array(part); progress(offset + part.byteLength);
  }
}
