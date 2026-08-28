const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** Small incremental SHA-256 used only for native-project stream verification. */
export class NativeSha256 {
  private readonly state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly pending = new Uint8Array(64);
  // Reuse one schedule for the entire stream. Allocating 64 words per block
  // would create millions of short-lived objects for a representative GS.
  private readonly words = new Uint32Array(64);
  private pendingLength = 0;
  private byteLength = 0n;
  private finished = false;

  update(input: Uint8Array): void {
    if (this.finished) throw new Error('native sha256: digest already finalized');
    this.byteLength += BigInt(input.byteLength);
    let offset = 0;
    if (this.pendingLength > 0) {
      const take = Math.min(64 - this.pendingLength, input.byteLength);
      this.pending.set(input.subarray(0, take), this.pendingLength);
      this.pendingLength += take;
      offset += take;
      if (this.pendingLength === 64) {
        this.compress(this.pending);
        this.pendingLength = 0;
      }
    }
    while (offset + 64 <= input.byteLength) {
      this.compress(input, offset);
      offset += 64;
    }
    if (offset < input.byteLength) {
      const rest = input.subarray(offset);
      this.pending.set(rest, 0);
      this.pendingLength = rest.byteLength;
    }
  }

  digestHex(): string {
    if (this.finished) throw new Error('native sha256: digest already finalized');
    this.finished = true;
    const tail = new Uint8Array(this.pendingLength < 56 ? 64 : 128);
    tail.set(this.pending.subarray(0, this.pendingLength));
    tail[this.pendingLength] = 0x80;
    const bitLength = this.byteLength * 8n;
    for (let index = 0; index < 8; index += 1) {
      tail[tail.byteLength - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
    }
    this.compress(tail.subarray(0, 64));
    if (tail.byteLength === 128) this.compress(tail.subarray(64, 128));
    return Array.from(this.state, (word) => word.toString(16).padStart(8, '0')).join('');
  }

  private compress(block: Uint8Array, blockOffset = 0): void {
    const words = this.words;
    for (let index = 0; index < 16; index += 1) {
      const offset = blockOffset + index * 4;
      words[index] = (
        (block[offset]! << 24) |
        (block[offset + 1]! << 16) |
        (block[offset + 2]! << 8) |
        block[offset + 3]!
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15]!;
      const b = words[index - 2]!;
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }

    let a = this.state[0]!;
    let b = this.state[1]!;
    let c = this.state[2]!;
    let d = this.state[3]!;
    let e = this.state[4]!;
    let f = this.state[5]!;
    let g = this.state[6]!;
    let h = this.state[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + ROUND_CONSTANTS[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    this.state[0] = (this.state[0]! + a) >>> 0;
    this.state[1] = (this.state[1]! + b) >>> 0;
    this.state[2] = (this.state[2]! + c) >>> 0;
    this.state[3] = (this.state[3]! + d) >>> 0;
    this.state[4] = (this.state[4]! + e) >>> 0;
    this.state[5] = (this.state[5]! + f) >>> 0;
    this.state[6] = (this.state[6]! + g) >>> 0;
    this.state[7] = (this.state[7]! + h) >>> 0;
  }
}

export interface NativeStreamDigest {
  readonly byteLength: number;
  readonly sha256: string;
}

export function digestNativeBytes(bytes: Uint8Array): NativeStreamDigest {
  const hash = new NativeSha256();
  hash.update(bytes);
  return { byteLength: bytes.byteLength, sha256: hash.digestHex() };
}

export async function digestNativeStream(stream: ReadableStream<Uint8Array>): Promise<NativeStreamDigest> {
  const reader = stream.getReader();
  const hash = new NativeSha256();
  let byteLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      hash.update(result.value);
      byteLength += result.value.byteLength;
      if (!Number.isSafeInteger(byteLength)) throw new Error('native sha256: byte length exceeds safe integer range');
    }
  } finally {
    reader.releaseLock();
  }
  return { byteLength, sha256: hash.digestHex() };
}

export function hashingNativeStream(
  stream: ReadableStream<Uint8Array>,
  onComplete: (digest: NativeStreamDigest) => void,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  const hash = new NativeSha256();
  let byteLength = 0;
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    reader.releaseLock();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          onComplete({ byteLength, sha256: hash.digestHex() });
          controller.close();
          release();
          return;
        }
        const chunk = new Uint8Array(result.value);
        hash.update(chunk);
        byteLength += chunk.byteLength;
        if (!Number.isSafeInteger(byteLength)) throw new Error('native sha256: byte length exceeds safe integer range');
        controller.enqueue(chunk);
      } catch (error) {
        try {
          await reader.cancel(error);
        } catch {
          // The original stream failure remains authoritative.
        }
        release();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        release();
      }
    },
  });
}
