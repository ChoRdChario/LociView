// PWAアイコン生成 → public/icons/
// 依存を増やさないため、PNGを最小構成（非圧縮zlibストア + CRC）で自前出力する。
// 実行: node scripts/gen-icons.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** RGBA画素配列 → PNG */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * LociViewのアイコン: 暗い角丸背景に、黄色のピン（球+脚）と結線されたキャプション枠。
 * 「3Dの一点に記録を結ぶ」というアプリの主題をそのまま図にしたもの。
 */
function drawIcon(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const pad = maskable ? size * 0.18 : size * 0.06; // maskableは安全領域を確保
  const inner = size - pad * 2;
  const radius = inner * 0.22;

  const set = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    const sa = a / 255;
    const da = px[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA === 0) return;
    px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / outA);
    px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / outA);
    px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / outA);
    px[i + 3] = Math.round(outA * 255);
  };

  // 背景（角丸矩形、maskableは全面塗り）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside;
      if (maskable) {
        inside = true;
      } else {
        const lx = x - pad;
        const ly = y - pad;
        if (lx < 0 || ly < 0 || lx >= inner || ly >= inner) inside = false;
        else {
          const cx = Math.min(Math.max(lx, radius), inner - radius);
          const cy = Math.min(Math.max(ly, radius), inner - radius);
          inside = (lx - cx) ** 2 + (ly - cy) ** 2 <= radius ** 2;
        }
      }
      if (inside) set(x, y, 0x0f, 0x11, 0x15, 255);
    }
  }

  const cx = size / 2;
  const cy = size / 2;
  const s = inner / 100; // 内側座標系のスケール

  // キャプション枠（右上）
  const boxX = cx + s * 4;
  const boxY = cy - s * 30;
  const boxW = s * 34;
  const boxH = s * 20;
  for (let y = Math.round(boxY); y < Math.round(boxY + boxH); y++) {
    for (let x = Math.round(boxX); x < Math.round(boxX + boxW); x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const edge =
        x < boxX + s * 1.6 || x > boxX + boxW - s * 1.6 || y < boxY + s * 1.6 || y > boxY + boxH - s * 1.6;
      if (edge) set(x, y, 0xea, 0xb3, 0x08, 255);
      else set(x, y, 0x16, 0x1a, 0x22, 235);
    }
  }
  // 枠内のテキスト行を模した2本線
  for (const [ly, lw] of [[boxY + boxH * 0.34, boxW * 0.58], [boxY + boxH * 0.6, boxW * 0.4]]) {
    for (let y = Math.round(ly); y < Math.round(ly + s * 2.4); y++) {
      for (let x = Math.round(boxX + s * 5); x < Math.round(boxX + s * 5 + lw); x++) {
        if (x >= 0 && y >= 0 && x < size && y < size) set(x, y, 0x9a, 0xa4, 0xaf, 220);
      }
    }
  }

  // 結線（ピン → 枠の左下）
  const px1 = cx - s * 6;
  const py1 = cy + s * 6;
  const px2 = boxX;
  const py2 = boxY + boxH;
  const steps = Math.ceil(Math.hypot(px2 - px1, py2 - py1));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lx = px1 + (px2 - px1) * t;
    const ly = py1 + (py2 - py1) * t;
    const w = s * 1.4;
    for (let dy = -w; dy <= w; dy++) {
      for (let dx = -w; dx <= w; dx++) {
        const x = Math.round(lx + dx);
        const y = Math.round(ly + dy);
        if (x >= 0 && y >= 0 && x < size && y < size && dx * dx + dy * dy <= w * w) {
          set(x, y, 0xea, 0xb3, 0x08, 200);
        }
      }
    }
  }

  // ピン（球 + 下向きの脚）
  const pinR = s * 11;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - px1;
      const dy = y - py1;
      const d = Math.hypot(dx, dy);
      if (d <= pinR) {
        const shade = 1 - 0.28 * Math.max(0, (dx + dy) / (pinR * 2.4));
        set(x, y, Math.round(0xea * shade), Math.round(0xb3 * shade), Math.round(0x08 * shade), 255);
      } else if (d <= pinR + s * 0.9) {
        set(x, y, 0x0f, 0x11, 0x15, 200); // 縁取り
      }
    }
  }
  // 脚（三角）
  const legH = s * 16;
  for (let i = 0; i < legH; i++) {
    const w = pinR * 0.62 * (1 - i / legH);
    const y = Math.round(py1 + pinR * 0.55 + i);
    for (let x = Math.round(px1 - w); x <= Math.round(px1 + w); x++) {
      if (x >= 0 && y >= 0 && x < size && y < size) set(x, y, 0xea, 0xb3, 0x08, 255);
    }
  }

  return encodePng(size, size, px);
}

writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192, false));
writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512, false));
writeFileSync(join(outDir, 'icon-maskable-512.png'), drawIcon(512, true));

// favicon（SVG。CSPで外部参照はしないためインライン相当の静的ファイル）
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0f1115"/>
  <rect x="34" y="12" width="22" height="14" rx="3" fill="#161a22" stroke="#eab308" stroke-width="2"/>
  <path d="M26 38 L36 26" stroke="#eab308" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="24" cy="40" r="7" fill="#eab308"/>
  <path d="M24 46 L28 54 L20 54 Z" fill="#eab308"/>
</svg>
`;
writeFileSync(join(outDir, '..', 'favicon.svg'), favicon);

console.log('icons generated:', outDir);
