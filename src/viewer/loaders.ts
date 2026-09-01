// ModelLoaderRegistry (docs/04 §1)
// 全フォーマットを共通の LoadedModel に正規化する。原本は改変しない（表示用構築のみ）。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { fitRasterWithinMaxEdge, rasterDimensions } from './rasterDimensions';

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
  if (bytes.length >= 4 && decoder.decode(bytes.subarray(0, 4)) === 'glTF') return 'glb';
  if (
    bytes.length >= 4 && bytes[0] === 0x70 && bytes[1] === 0x6c && bytes[2] === 0x79 &&
    (bytes[3] === 0x0a || bytes[3] === 0x0d)
  ) return 'ply';
  if (ext === 'glb') return 'glb';
  if (ext === 'gltf') return 'gltf';
  if (ext === 'obj') return 'obj';
  if (ext === 'stl') return 'stl';
  if (ext === 'ply') return 'ply';
  return null;
}

export interface LoadDeps {
  /** OBJの.mtlテキスト（ZIP内の随伴ファイル解決。無ければ既定マテリアル） */
  mtlText?: string;
  /** GLB/GLTFの画像処理方針。未指定時はThree.js標準のfull-resolution decode。 */
  gltfTextures?: GltfTexturePolicy;
}

export type GltfTexturePolicy =
  | { readonly kind: 'skip' }
  | { readonly kind: 'max-edge'; readonly maxEdge: number };

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
      root = await loadGltf(bytes, warnings, deps.gltfTextures);
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

interface CloseableBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

const closedBitmaps = new WeakSet<object>();

function closeBitmapOnce(bitmap: CloseableBitmap): void {
  if (closedBitmaps.has(bitmap)) return;
  closedBitmaps.add(bitmap);
  bitmap.close();
}

function closeableBitmap(value: unknown): CloseableBitmap | null {
  if (value === null || typeof value !== 'object') return null;
  const candidate = value as Partial<CloseableBitmap>;
  return typeof candidate.width === 'number' && typeof candidate.height === 'number' &&
    typeof candidate.close === 'function'
    ? candidate as CloseableBitmap
    : null;
}

function materialTextures(material: THREE.Material): THREE.Texture[] {
  const textures = new Set<THREE.Texture>();
  const collect = (value: unknown): void => {
    if (value instanceof THREE.Texture) {
      textures.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry);
      return;
    }
    if (value !== null && typeof value === 'object' && 'value' in value) {
      collect((value as { readonly value?: unknown }).value);
    }
  };
  for (const value of Object.values(material as unknown as Record<string, unknown>)) collect(value);
  return [...textures];
}

function modelResources(root: THREE.Object3D): {
  readonly geometries: Set<THREE.BufferGeometry>;
  readonly materials: Set<THREE.Material>;
  readonly textures: Set<THREE.Texture>;
  readonly bitmaps: Set<CloseableBitmap>;
} {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<CloseableBitmap>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points) && !(object instanceof THREE.Line)) return;
    geometries.add(object.geometry as THREE.BufferGeometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) {
      materials.add(material);
      for (const texture of materialTextures(material)) {
        textures.add(texture);
        const bitmap = closeableBitmap(texture.source.data);
        if (bitmap !== null) bitmaps.add(bitmap);
      }
    }
  });
  return { geometries, materials, textures, bitmaps };
}

/**
 * GLTFなどの通常Three.jsモデルが所有するGPU/decoded-image資源を重複なく解放する。
 * Spark objectはこのhelperの対象外。
 */
export function disposeModelResources(root: THREE.Object3D): void {
  const resources = modelResources(root);
  root.removeFromParent();
  for (const texture of resources.textures) texture.dispose();
  for (const bitmap of resources.bitmaps) closeBitmapOnce(bitmap);
  for (const material of resources.materials) material.dispose();
  for (const geometry of resources.geometries) geometry.dispose();
}

export function disposeMaterialResources(materials: Iterable<THREE.Material>): void {
  const uniqueMaterials = new Set(materials);
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<CloseableBitmap>();
  for (const material of uniqueMaterials) {
    for (const texture of materialTextures(material)) {
      textures.add(texture);
      const bitmap = closeableBitmap(texture.source.data);
      if (bitmap !== null) bitmaps.add(bitmap);
    }
  }
  for (const texture of textures) texture.dispose();
  for (const bitmap of bitmaps) closeBitmapOnce(bitmap);
  for (const material of uniqueMaterials) material.dispose();
}

/**
 * TextureをGPUへ明示uploadした後、decode済みImageBitmapだけを閉じる。
 * Texture自体は表示中なので保持する。
 */
export function uploadModelTexturesAndReleaseBitmaps(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
): void {
  const resources = modelResources(root);
  const texturesByBitmap = new Map<CloseableBitmap, THREE.Texture[]>();
  const texturesWithoutBitmap: THREE.Texture[] = [];
  for (const texture of resources.textures) {
    const bitmap = closeableBitmap(texture.source.data);
    if (bitmap === null) {
      texturesWithoutBitmap.push(texture);
      continue;
    }
    const group = texturesByBitmap.get(bitmap) ?? [];
    group.push(texture);
    texturesByBitmap.set(bitmap, group);
  }
  try {
    for (const texture of texturesWithoutBitmap) renderer.initTexture(texture);
    for (const [bitmap, textures] of texturesByBitmap) {
      try {
        for (const texture of textures) renderer.initTexture(texture);
      } finally {
        // Close each decoded source as soon as every Texture sharing it is on GPU,
        // instead of retaining every bitmap until all uploads have completed.
        closeBitmapOnce(bitmap);
      }
    }
  } finally {
    // If an upload fails, release the current and not-yet-uploaded decoded sources.
    for (const bitmap of resources.bitmaps) closeBitmapOnce(bitmap);
  }
}

export async function decodeImageBitmapWithinMaxEdge(
  blob: Blob,
  maxEdge: number,
  decode: typeof createImageBitmap = globalThis.createImageBitmap,
): Promise<ImageBitmap> {
  if (typeof decode !== 'function') throw new Error('ImageBitmap decode is unavailable on this device');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dimensions = rasterDimensions(bytes, blob.type);
  if (dimensions === null) throw new Error(`unsupported embedded raster type: ${blob.type || 'unknown'}`);
  const fitted = fitRasterWithinMaxEdge(dimensions, maxEdge);
  const options: ImageBitmapOptions = {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  };
  if (fitted.width !== dimensions.width || fitted.height !== dimensions.height) {
    options.resizeWidth = fitted.width;
    options.resizeHeight = fitted.height;
    options.resizeQuality = 'high';
  }
  const bitmap = await decode(blob, options);
  if (Math.max(bitmap.width, bitmap.height) > maxEdge) {
    const closeable = closeableBitmap(bitmap);
    if (closeable !== null) closeBitmapOnce(closeable);
    throw new Error(`embedded texture exceeded the ${maxEdge}px runtime limit after decode`);
  }
  return bitmap;
}

class BoundedImageBitmapLoader extends THREE.ImageBitmapLoader {
  private decodeTail: Promise<void> = Promise.resolve();

  constructor(
    manager: THREE.LoadingManager,
    private readonly maxEdge: number,
    private readonly onFailure: (error: Error) => void,
    private readonly onDecoded: (bitmap: ImageBitmap) => void,
  ) {
    super(manager);
  }

  override load(
    requestedUrl: string,
    onLoad?: (data: ImageBitmap) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ): void {
    const withPath = this.path === undefined ? requestedUrl : `${this.path}${requestedUrl}`;
    const url = this.manager.resolveURL(withPath);
    this.manager.itemStart(url);
    const credentials: RequestCredentials = this.crossOrigin === 'anonymous' ? 'same-origin' : 'include';
    const pending = this.decodeTail.then(() => fetch(url, { credentials, headers: this.requestHeader }))
      .then(async (response) => {
        if (!response.ok) throw new Error(`embedded texture request failed (${response.status})`);
        return decodeImageBitmapWithinMaxEdge(await response.blob(), this.maxEdge);
      });
    this.decodeTail = pending.then(() => undefined, () => undefined);
    void pending
      .then((bitmap) => {
        this.onDecoded(bitmap);
        onLoad?.(bitmap);
      })
      .catch((reason: unknown) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        this.onFailure(error);
        if (url.startsWith('blob:')) globalThis.URL.revokeObjectURL(url);
        onError?.(error);
        this.manager.itemError(url);
      })
      .finally(() => this.manager.itemEnd(url));
  }
}

class MetadataOnlyImageBitmapLoader extends THREE.Loader<ImageBitmap> {
  readonly isImageBitmapLoader = true as const;

  override load(
    requestedUrl: string,
    onLoad?: (data: ImageBitmap) => void,
    _onProgress?: (event: ProgressEvent) => void,
    _onError?: (err: unknown) => void,
  ): void {
    const withPath = this.path === undefined ? requestedUrl : `${this.path}${requestedUrl}`;
    const url = this.manager.resolveURL(withPath);
    this.manager.itemStart(url);
    queueMicrotask(() => {
      // Material inspection needs slot identity/name only. A non-rendered shape
      // placeholder lets GLTFLoader finish without fetching or decoding pixels.
      onLoad?.({ width: 1, height: 1 } as ImageBitmap);
      this.manager.itemEnd(url);
    });
  }
}

function loadGltf(
  bytes: Uint8Array,
  warnings: string[],
  texturePolicy?: GltfTexturePolicy,
): Promise<THREE.Object3D> {
  // 外部URI参照はオフライン原則により拒否する（docs/03 §5）。
  // data:/blob: 以外の参照は空データに差し替え、警告として報告する。
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    warnings.push(`外部URI参照をブロックしました: ${url.slice(0, 120)}`);
    return 'data:application/octet-stream;base64,';
  });
  const loader = new GLTFLoader(manager);
  const textureFailures: Error[] = [];
  const decodedBitmaps = new Set<CloseableBitmap>();
  let parseSettled = false;
  const releaseDecodedBitmaps = (): void => {
    for (const bitmap of decodedBitmaps) closeBitmapOnce(bitmap);
    decodedBitmaps.clear();
  };
  if (texturePolicy?.kind === 'skip') {
    loader.register((parser) => ({
      name: 'LOCIVIEW_skip_texture_decode',
      beforeRoot: async () => {
        parser.textureLoader = new MetadataOnlyImageBitmapLoader(manager) as unknown as THREE.ImageBitmapLoader;
      },
    }));
  } else if (texturePolicy?.kind === 'max-edge') {
    const maxEdge = texturePolicy.maxEdge;
    fitRasterWithinMaxEdge({ width: 1, height: 1 }, maxEdge);
    loader.register((parser) => ({
      name: 'LOCIVIEW_bounded_texture_decode',
      beforeRoot: async () => {
        parser.textureLoader = new BoundedImageBitmapLoader(
          manager,
          maxEdge,
          (error) => textureFailures.push(error),
          (bitmap) => {
            const closeable = closeableBitmap(bitmap);
            if (closeable === null) return;
            if (parseSettled) closeBitmapOnce(closeable);
            else decodedBitmaps.add(closeable);
          },
        )
          .setCrossOrigin(parser.options.crossOrigin)
          .setRequestHeader(parser.options.requestHeader) as THREE.ImageBitmapLoader;
      },
    }));
  }
  // バッファをコピーせずそのまま渡す（38MBのGLBで38MBの無駄なコピーが発生していた。
  // iOSのメモリ上限に直結するため重要）。GLTFLoaderはバッファを破棄しない。
  const buf =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => {
    loader.parse(
      buf as ArrayBuffer,
      '',
      (gltf) => {
        parseSettled = true;
        if (textureFailures.length > 0) {
          disposeModelResources(gltf.scene);
          releaseDecodedBitmaps();
          reject(new Error(`embedded texture activation failed: ${textureFailures[0]!.message}`));
          return;
        }
        resolve(gltf.scene);
      },
      (err) => {
        parseSettled = true;
        releaseDecodedBitmaps();
        reject(err instanceof Error ? err : new Error('GLTF parse error'));
      },
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
