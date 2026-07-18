// ModelLoaderRegistry (docs/04 §1)
// 全フォーマットを共通の LoadedModel に正規化する。原本は改変しない（表示用構築のみ）。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export type ModelFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'ply';

export interface MaterialEntry {
  /** 決定的マテリアルキー (docs/04 §4)。表示名に依存しない */
  key: string;
  /** UI表示名（重複時は連番付与済み） */
  name: string;
  materials: THREE.Material[];
}

export interface ModelStats {
  vertices: number;
  triangles: number;
  points: number;
  meshes: number;
}

export interface LoadedModel {
  root: THREE.Object3D;
  kind: 'mesh' | 'points' | 'mixed';
  materials: MaterialEntry[];
  stats: ModelStats;
  warnings: string[];
}

const decoder = new TextDecoder();

/** 拡張子 + マジックバイトでフォーマット判定 */
export function detectFormat(fileName: string, bytes: Uint8Array): ModelFormat | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'glb') return 'glb';
  if (ext === 'gltf') return 'gltf';
  if (ext === 'obj') return 'obj';
  if (ext === 'stl') return 'stl';
  if (ext === 'ply') return 'ply';
  if (bytes.length >= 4 && decoder.decode(bytes.subarray(0, 4)) === 'glTF') return 'glb';
  if (bytes.length >= 3 && decoder.decode(bytes.subarray(0, 3)) === 'ply') return 'ply';
  return null;
}

export interface LoadDeps {
  /** OBJの.mtlテキスト（ZIP内の随伴ファイル解決。無ければ既定マテリアル） */
  mtlText?: string;
}

export async function loadModel(
  format: ModelFormat,
  bytes: Uint8Array,
  deps: LoadDeps = {},
): Promise<LoadedModel> {
  const warnings: string[] = [];
  let root: THREE.Object3D;

  switch (format) {
    case 'glb':
    case 'gltf': {
      root = await loadGltf(bytes, warnings);
      break;
    }
    case 'obj': {
      root = loadObj(bytes, deps, warnings);
      break;
    }
    case 'stl': {
      root = loadStl(bytes);
      break;
    }
    case 'ply': {
      root = loadPly(bytes);
      break;
    }
  }

  const stats = computeStats(root);
  const materials = buildMaterialRegistry(root);
  const kind: LoadedModel['kind'] =
    stats.points > 0 && stats.triangles > 0 ? 'mixed' : stats.points > 0 ? 'points' : 'mesh';
  return { root, kind, materials, stats, warnings };
}

// ---- 各フォーマット --------------------------------------------------------------

function loadGltf(bytes: Uint8Array, warnings: string[]): Promise<THREE.Object3D> {
  // 外部URI参照はオフライン原則により拒否する（docs/03 §5）。
  // data:/blob: 以外の参照は空データに差し替え、警告として報告する。
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    warnings.push(`外部URI参照をブロックしました: ${url.slice(0, 120)}`);
    return 'data:application/octet-stream;base64,';
  });
  const loader = new GLTFLoader(manager);
  const buf = new Uint8Array(bytes).buffer;
  return new Promise((resolve, reject) => {
    loader.parse(
      buf,
      '',
      (gltf) => resolve(gltf.scene),
      (err) => reject(err instanceof Error ? err : new Error('GLTF parse error')),
    );
  });
}

function loadObj(bytes: Uint8Array, deps: LoadDeps, warnings: string[]): THREE.Object3D {
  const objLoader = new OBJLoader();
  if (deps.mtlText !== undefined) {
    try {
      const mtl = new MTLLoader().parse(deps.mtlText, '');
      mtl.preload();
      objLoader.setMaterials(mtl);
    } catch {
      warnings.push('.mtlの解析に失敗したため既定マテリアルを使用します');
    }
  }
  const group = objLoader.parse(decoder.decode(bytes));
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const geom = o.geometry as THREE.BufferGeometry;
      if (geom.getAttribute('normal') === undefined) geom.computeVertexNormals();
    }
  });
  return group;
}

function loadStl(bytes: Uint8Array): THREE.Object3D {
  const geom = new STLLoader().parse(new Uint8Array(bytes).buffer);
  if (geom.getAttribute('normal') === undefined) geom.computeVertexNormals();
  const hasColors = geom.hasAttribute('color');
  const mat = new THREE.MeshStandardMaterial({
    color: hasColors ? 0xffffff : 0x9aa4af,
    vertexColors: hasColors,
    metalness: 0.1,
    roughness: 0.8,
  });
  mat.name = 'STL';
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'STL';
  return mesh;
}

function loadPly(bytes: Uint8Array): THREE.Object3D {
  const geom = new PLYLoader().parse(new Uint8Array(bytes).buffer);
  const hasColors = geom.hasAttribute('color');
  const isMesh = geom.index !== null && geom.index.count > 0;
  if (isMesh) {
    if (geom.getAttribute('normal') === undefined) geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: hasColors ? 0xffffff : 0x9aa4af,
      vertexColors: hasColors,
      metalness: 0.1,
      roughness: 0.8,
    });
    mat.name = 'PLY';
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = 'PLY';
    return mesh;
  }
  // 点群 (docs/04 §6)。点サイズはViewerCore側でモデル規模に応じて調整する
  const mat = new THREE.PointsMaterial({
    size: 1,
    sizeAttenuation: true,
    color: hasColors ? 0xffffff : 0x9aa4af,
    vertexColors: hasColors,
  });
  mat.name = 'PLY points';
  const points = new THREE.Points(geom, mat);
  points.name = 'PLY points';
  return points;
}

// ---- 統計・マテリアル登記 ----------------------------------------------------------

function computeStats(root: THREE.Object3D): ModelStats {
  const stats: ModelStats = { vertices: 0, triangles: 0, points: 0, meshes: 0 };
  root.traverse((o) => {
    if (o instanceof THREE.Points) {
      const pos = (o.geometry as THREE.BufferGeometry).getAttribute('position');
      if (pos !== undefined) stats.points += pos.count;
    } else if (o instanceof THREE.Mesh) {
      stats.meshes++;
      const geom = o.geometry as THREE.BufferGeometry;
      const pos = geom.getAttribute('position');
      if (pos !== undefined) stats.vertices += pos.count;
      stats.triangles += Math.floor((geom.index !== null ? geom.index.count : pos?.count ?? 0) / 3);
    }
  });
  return stats;
}

function nodePath(o: THREE.Object3D, root: THREE.Object3D): string {
  const parts: string[] = [];
  let cur: THREE.Object3D | null = o;
  while (cur !== null && cur !== root) {
    const parent: THREE.Object3D | null = cur.parent;
    const label = cur.name !== '' ? cur.name : `#${parent !== null ? parent.children.indexOf(cur) : 0}`;
    parts.unshift(label);
    cur = parent;
  }
  return parts.join('|');
}

/** 決定的マテリアルキーの構築 (docs/04 §4): m/<nodePath>/<slot> */
function buildMaterialRegistry(root: THREE.Object3D): MaterialEntry[] {
  const entries: MaterialEntry[] = [];
  const nameCount = new Map<string, number>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.Points)) return;
    const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m, slot) => {
      const key = `m/${nodePath(o, root)}/${slot}`;
      let display = m.name !== '' ? m.name : '(unnamed)';
      const n = nameCount.get(display) ?? 0;
      nameCount.set(display, n + 1);
      if (n > 0) display = `${display} (${n + 1})`;
      entries.push({ key, name: display, materials: [m] });
    });
  });
  return entries;
}
