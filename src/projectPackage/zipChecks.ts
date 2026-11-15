import { PackageControlError } from './manifest';

const table = new Uint32Array(8 * 256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  table[i] = value >>> 0;
}
for (let i = 256; i < table.length; i++) {
  const value = table[i - 256]!;
  table[i] = (value >>> 8) ^ table[value & 255]!;
}
/** ZIP's CRC-32/ISO-HDLC; integrity only, never author authentication. */
export class ZipCrc32 {
  private value = 0xffffffff;
  update(bytes: Uint8Array): void {
    let value = this.value;
    let i = 0;
    for (; i + 8 <= bytes.length; i += 8) {
      const word = value ^ bytes[i]! ^ (bytes[i + 1]! << 8) ^ (bytes[i + 2]! << 16) ^ (bytes[i + 3]! << 24);
      value = table[7 * 256 + (word & 255)]! ^ table[6 * 256 + ((word >>> 8) & 255)]! ^ table[5 * 256 + ((word >>> 16) & 255)]! ^ table[4 * 256 + (word >>> 24)]! ^
        table[3 * 256 + bytes[i + 4]!]! ^ table[2 * 256 + bytes[i + 5]!]! ^ table[256 + bytes[i + 6]!]! ^ table[bytes[i + 7]!]!;
    }
    for (; i < bytes.length; i++) value = table[(value ^ bytes[i]!) & 255]! ^ (value >>> 8);
    this.value = value;
  }
  digest(): number { return (this.value ^ 0xffffffff) >>> 0; }
}
export function rejectNestedZip(prefix: Uint8Array): void {
  if (prefix.length >= 4 && prefix[0] === 0x50 && prefix[1] === 0x4b &&
    ((prefix[2] === 3 && prefix[3] === 4) || (prefix[2] === 5 && prefix[3] === 6) || (prefix[2] === 7 && prefix[3] === 8)))
    throw new PackageControlError('nested-zip');
}
export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError');
}
