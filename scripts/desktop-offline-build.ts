import { deflateSync } from 'node:zlib';
import type { Plugin } from 'vite';

// Original, deliberately simple L mark: generated locally, no third-party artwork.
function icon(size: number): Uint8Array {
  const crc = (bytes: Uint8Array) => { let n = 0xffffffff; for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; };
  const chunk = (name: string, data: Uint8Array) => { const type = Buffer.from(name), body = Buffer.concat([type, data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const mark = (x >= size * .28 && x < size * .42 && y >= size * .23 && y < size * .76) || (x >= size * .28 && x < size * .73 && y >= size * .62 && y < size * .76);
    const i = y * (size * 4 + 1) + 1 + x * 4; pixels.set(mark ? [250, 249, 248, 255] : [49, 47, 45, 255], i);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
export function desktopOfflineBuild(outputDirectory: (path:string)=>void): Plugin {
  return {
    name: 'lociview-offline-owned-icons-and-closure',
    configResolved(config) { outputDirectory(config.build.outDir); },
    generateBundle(_options, bundle) {
      for (const size of [192, 512]) this.emitFile({ type: 'asset', fileName: `offline-icons/icon-${size}.png`, source: icon(size) });
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          if (Object.keys(output.modules).some(id => /[\\/]src[\\/](?:ui[\\/]app|nativeGs[\\/]app)\.ts$/.test(id) || id.includes('@sparkjsdev/spark'))) this.error('Original viewer reached the offline build');
        }
        if (!output.fileName.endsWith('.map')) {
          const size = output.type === 'chunk' ? Buffer.byteLength(output.code) : typeof output.source === 'string' ? Buffer.byteLength(output.source) : output.source.byteLength;
          if (size > 8 * 1024 * 1024) this.error(`Offline app asset exceeds precache admission: ${output.fileName}`);
        }
      }
    },
  };
}
