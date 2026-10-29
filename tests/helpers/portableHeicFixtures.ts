import { deflateSync } from 'node:zlib';
/** Owned synthetic green PNG; no external photograph or HEIC decoding. */
export function portablePng(width = 96, height = 64, green = 180): Uint8Array {
  const chunk = (name: string, bytes: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), bytes]), size = Buffer.alloc(4), crc = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length); let sum = 0xffffffff;
    for (const byte of body) { sum ^= byte; for (let bit = 0; bit < 8; bit++) sum = sum & 1 ? (sum >>> 1) ^ 0xedb88320 : sum >>> 1; }
    crc.writeUInt32BE((sum ^ 0xffffffff) >>> 0); return Buffer.concat([size, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rows[y * (width * 3 + 1) + 1 + x * 3 + 1] = green;
  return Uint8Array.from(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}
export const fixturePngDecoder = async (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), close() {} };
};
