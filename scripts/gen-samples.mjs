// 開発検証用サンプル3Dファイル生成 → public/samples/
// 実行: node scripts/gen-samples.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples');
mkdirSync(outDir, { recursive: true });

// ---- cube.stl (ASCII) ----------------------------------------------------------

const V = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
// 各面 [法線, 三角形2つ]
const faces = [
  [[0, 0, -1], [0, 2, 1], [0, 3, 2]],
  [[0, 0, 1], [4, 5, 6], [4, 6, 7]],
  [[0, -1, 0], [0, 1, 5], [0, 5, 4]],
  [[1, 0, 0], [1, 2, 6], [1, 6, 5]],
  [[0, 1, 0], [2, 3, 7], [2, 7, 6]],
  [[-1, 0, 0], [3, 0, 4], [3, 4, 7]],
];
let stl = 'solid cube\n';
for (const [n, ...tris] of faces) {
  for (const tri of tris) {
    stl += `facet normal ${n.join(' ')}\n outer loop\n`;
    for (const vi of tri) stl += `  vertex ${V[vi].join(' ')}\n`;
    stl += ' endloop\nendfacet\n';
  }
}
stl += 'endsolid cube\n';
writeFileSync(join(outDir, 'cube.stl'), stl);

// ---- cube.obj ------------------------------------------------------------------

let obj = '# LociView sample cube\no Cube\n';
for (const v of V) obj += `v ${v.join(' ')}\n`;
for (const [, ...tris] of faces) {
  for (const tri of tris) obj += `f ${tri.map((i) => i + 1).join(' ')}\n`;
}
writeFileSync(join(outDir, 'cube.obj'), obj);

// ---- points.ply (ASCII点群・頂点色つき螺旋) ------------------------------------------

const N = 20000;
let plyBody = '';
for (let i = 0; i < N; i++) {
  const t = (i / N) * Math.PI * 20;
  const r = 0.2 + (i / N) * 1.2;
  const x = Math.cos(t) * r;
  const y = (i / N) * 2.5;
  const z = Math.sin(t) * r;
  const cr = Math.floor(128 + 127 * Math.sin(t));
  const cg = Math.floor((i / N) * 255);
  const cb = Math.floor(128 + 127 * Math.cos(t));
  plyBody += `${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)} ${cr} ${cg} ${cb}\n`;
}
const ply =
  `ply\nformat ascii 1.0\nelement vertex ${N}\n` +
  'property float x\nproperty float y\nproperty float z\n' +
  'property uchar red\nproperty uchar green\nproperty uchar blue\n' +
  'end_header\n' +
  plyBody;
writeFileSync(join(outDir, 'points.ply'), ply);

// ---- tri.glb（最小GLB: 単色三角形） -------------------------------------------------

const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0]);
const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
const bin = new Uint8Array(positions.byteLength + normals.byteLength);
bin.set(new Uint8Array(positions.buffer), 0);
bin.set(new Uint8Array(normals.buffer), positions.byteLength);

const gltf = {
  asset: { version: '2.0', generator: 'LociView sample-gen' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'Tri' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }], name: 'TriMesh' }],
  materials: [
    { name: 'TriMat', pbrMetallicRoughness: { baseColorFactor: [0.9, 0.55, 0.15, 1], roughness: 0.8 } },
  ],
  buffers: [{ byteLength: bin.byteLength }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
    { buffer: 0, byteOffset: positions.byteLength, byteLength: normals.byteLength },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
  ],
};

function pad4(n, padByte) {
  const rem = n % 4;
  return rem === 0 ? 0 : 4 - rem;
}
const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
const jsonPad = pad4(jsonBytes.length);
const binPad = pad4(bin.length);
const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad;

const glb = new ArrayBuffer(total);
const dv = new DataView(glb);
const u8 = new Uint8Array(glb);
let off = 0;
dv.setUint32(off, 0x46546c67, true); off += 4; // 'glTF'
dv.setUint32(off, 2, true); off += 4;
dv.setUint32(off, total, true); off += 4;
dv.setUint32(off, jsonBytes.length + jsonPad, true); off += 4;
dv.setUint32(off, 0x4e4f534a, true); off += 4; // 'JSON'
u8.set(jsonBytes, off); off += jsonBytes.length;
for (let i = 0; i < jsonPad; i++) u8[off++] = 0x20; // space padding
dv.setUint32(off, bin.length + binPad, true); off += 4;
dv.setUint32(off, 0x004e4942, true); off += 4; // 'BIN'
u8.set(bin, off); off += bin.length;

writeFileSync(join(outDir, 'tri.glb'), Buffer.from(glb));

console.log('samples generated:', outDir);
