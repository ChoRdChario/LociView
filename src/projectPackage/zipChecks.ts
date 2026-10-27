import { PackageControlError } from './manifest';

const table = Uint32Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
/** ZIP's CRC-32/ISO-HDLC; integrity only, never author authentication. */
export class ZipCrc32 {
  private value = 0xffffffff;
  update(bytes: Uint8Array): void {
    let value = this.value;
    for (let i = 0; i < bytes.length; i++) value = table[(value ^ bytes[i]!) & 255]! ^ (value >>> 8);
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
