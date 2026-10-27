import { snapshotTargets, trackGltfImages, type NeutralTarget } from '../viewer/compat180/sceneProof';
// Private actual180 construction proof; public result contains copied values only.
import * as THREE from 'three-compat-180';
import { GLTFLoader, type GLTFParser } from 'three-compat-180/addons/loaders/GLTFLoader.js';
import type { JsonObject } from '../domain/values';
import { canonical } from '../domain/projectGraphSupport';
import { releaseOwnedResources, closeBitmapOnce } from '../viewer/compat180/resources';
import { inspectValidationGlb, inspectValidationJpegGlb, validationGlbParts, type ValidatedGlb } from './glb';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { fileError, occurrenceGlbProfileText, occurrenceJpegGlbProfileText, type FileValidationLimits } from './validation';
import { digestNativeBytes } from '../nativeGs/sha256';

export function occurrenceInputKey(source:ValidatedGlb):string {
  const sha256=digestNativeBytes(source.bytes).sha256;
  const profile=source.jpeg?occurrenceJpegGlbProfileText:occurrenceGlbProfileText;
  return JSON.stringify([sha256,digestNativeBytes(new TextEncoder().encode(profile)).sha256,
    source.bytes.length,source.jpeg===true,source.bounds,source.materials,source.surfaceRanges,source.occurrences]);
}
interface LegacyOccurrenceProof { readonly inputKey:string; readonly rows:readonly LegacyOccurrenceRow[] }

export interface LegacyOccurrenceRow {
  readonly childPath: readonly number[]; readonly materialArraySlot: 0;
  readonly nodeIndex: number; readonly primitiveIndex: number; readonly materialIndex: number | null; readonly slotIndex: number;
  readonly v1Key: string; readonly target: NeutralTarget;
}
export async function captureLegacyOccurrenceProof(source:ValidatedGlb, signal?:AbortSignal):Promise<LegacyOccurrenceProof> {
  const {bytes,...metadata}=source;
  const owned:ValidatedGlb={...structuredClone(metadata),bytes:bytes.slice()};
  return captureOwnedOccurrenceProof(owned,signal);
}
/** Only glbOccurrences' private capture may supply this already-owned input. */
export async function captureOwnedOccurrenceProof(source:ValidatedGlb,signal?:AbortSignal):Promise<LegacyOccurrenceProof> {
  signal?.throwIfAborted();
  const inputKey=occurrenceInputKey(source);
  const decoded=await decodeOccurrenceGlb(source);
  try {
    signal?.throwIfAborted();
    const rows = decoded.occurrenceSlots.map(slot => {
      const names: string[] = []; let node: THREE.Object3D | null = slot.node;
      while (node !== decoded.root) {
        const parent: THREE.Object3D | null = node?.parent ?? null;
        if (!parent || !node) throw Error('旧モデルの階層を確認できません。');
        names.unshift(node.name !== '' ? node.name : '#' + parent.children.indexOf(node)); node = parent;
      }
      const target = snapshotTargets(slot.node, undefined, false).rows[0]; if (!target) throw Error('旧材質の面を確認できません。');
      return Object.freeze({ childPath:Object.freeze([...slot.childPath]), materialArraySlot:slot.materialArraySlot,
        nodeIndex:slot.nodeIndex, primitiveIndex:slot.primitiveIndex, materialIndex:slot.materialIndex, slotIndex:slot.slotIndex,
        v1Key:`m/${names.join('|')}/${slot.materialArraySlot}`, target });
    });
    if(inputKey!==occurrenceInputKey(source))throw Error('元のモデル入力が変更されました。');
    return Object.freeze({ inputKey, rows:Object.freeze(rows) });
  } finally { decoded.dispose(); }
}

interface DecodedOccurrenceSlot {
  readonly node: THREE.Mesh; readonly childPath: readonly number[]; readonly materialArraySlot: 0;
  readonly nodeIndex: number; readonly primitiveIndex: number; readonly materialIndex: number | null; readonly slotIndex: number;
}
/** Owned inspected input only. No source URLs, metadata, storage or UI authority. */
async function decodeOccurrenceGlb(source: ValidatedGlb) {
  if (!source.occurrences || THREE.REVISION !== '180' || !THREE.ColorManagement.enabled || THREE.ColorManagement.workingColorSpace !== THREE.LinearSRGBColorSpace)
    throw Error('モデルと材質の対応を確認できません。');
  const manager = new THREE.LoadingManager(), owned = new Set<ImageBitmap>(), roots = new Set<THREE.Object3D>(), originals = new Set<THREE.Material>();
  const materialLocators = new Map<THREE.Material, JsonObject>(), occurrenceSlots: DecodedOccurrenceSlot[] = [];
  let parser: GLTFParser | undefined, closed = false, failed = false;
  manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw Error('外部参照のあるモデルは表示できません。'); return url; });
  manager.onError = () => { failed = true; };
  const dispose = () => {
    if (closed) return; closed = true;
    const final = new THREE.Group();
    for (const object of parser?.associations.keys() ?? []) {
      if (object instanceof THREE.Object3D) roots.add(object);
      else if (object instanceof THREE.Material) originals.add(object);
    }
    // Reparent only after lifetime end, never while proving Native child paths.
    for (const root of roots) final.add(root);
    final.traverse(n => { if (n instanceof THREE.Mesh) for (const m of Array.isArray(n.material) ? n.material : [n.material]) originals.add(m); });
    releaseOwnedResources([final], [...originals], owned); owned.clear(); materialLocators.clear(); roots.clear(); originals.clear();
  };
  class Images extends THREE.ImageBitmapLoader {
    override load(url: string, done?: (bitmap: ImageBitmap) => void, progress?: (event: ProgressEvent) => void, error?: (e: unknown) => void) {
      return super.load(url, bitmap => { if (closed) { closeBitmapOnce(bitmap); error?.(Error('表示を取り消しました。')); return; }
        owned.add(bitmap); done?.(bitmap);
      }, progress, e => { failed = true; error?.(e); });
    }
  }
  try {
    const loader = new GLTFLoader(manager);
    loader.register(p => { parser = p; return { name: 'LOCIVIEW_occurrence_png', beforeRoot: async () => {
      p.textureLoader = new Images(manager).setOptions({ premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } }; });
    loader.register(p => { trackGltfImages(p); return { name:'LOCIVIEW_occurrence_texture_origin' }; });
    const gltf = await loader.parseAsync(source.bytes.slice().buffer as ArrayBuffer, '');
    for (const root of gltf.scenes) roots.add(root);
    const root = gltf.scene, p = gltf.parser, seen = new Set<number>(); let triangles = 0;
    const byPair = new Map(source.occurrences.map(r => [`${r.nodeIndex}/${r.primitiveIndex}`, r]));
    const locators = new Set(source.materials.map(m => canonical(m.sourceLocator!)));
    if (failed || !root) throw Error('モデルのテクスチャを表示できません。');
    const visit = (node: THREE.Object3D, childPath: readonly number[]) => {
      if (node instanceof THREE.Mesh) {
        if (!(node.geometry instanceof THREE.BufferGeometry) || (Array.isArray(node.material)?node.material:[node.material]).some(m=>!(m instanceof THREE.Material))) throw Error('旧面の構築環境を確認できません。');
        const a = p.associations.get(node) as { meshes?: number; primitives?: number } | undefined;
        let owner: THREE.Object3D | null = node, nodeIndex: number | undefined;
        while (owner) { const index = p.associations.get(owner)?.nodes; if (index !== undefined) { nodeIndex = index; break; } if (owner === root) break; owner = owner.parent; }
        const row = byPair.get(`${nodeIndex}/${a?.primitives}`);
        const primitive = a?.meshes === undefined || a.primitives === undefined ? undefined : p.json.meshes[a.meshes]?.primitives[a.primitives];
        const list = Array.isArray(node.material) ? node.material : [node.material];
        if (!row || !primitive || !Number.isSafeInteger(a?.meshes) || !Number.isSafeInteger(a?.primitives) ||
          p.json.nodes[nodeIndex!]?.mesh !== a?.meshes || list.length !== 1 || seen.has(row.slotIndex) ||
          (primitive.material ?? null) !== row.materialIndex || p.associations.get(list[0]!)?.materials !== (row.materialIndex ?? undefined))
          throw Error('モデルの面と材質の対応を確認できません。');
        seen.add(row.slotIndex); triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3;
        occurrenceSlots.push({ node, childPath: [...childPath], materialArraySlot: 0, ...row });
      }
      node.children.forEach((child, index) => visit(child, [...childPath, index]));
    };
    visit(root, []); root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root, true), actual = [...bounds.min.toArray(), ...bounds.max.toArray()];
    if (seen.size !== source.occurrences.length || triangles !== source.surfaceRanges.reduce((n, r) => n + Number(r.count), 0) ||
      actual.some((v, i) => !Number.isFinite(v) || Math.abs(v - [...source.bounds.min, ...source.bounds.max][i]!) > 1e-6 * Math.max(1, Math.abs(v))))
      throw Error('保存したモデルと描画した形状が一致しません。');
    occurrenceSlots.sort((a, b) => a.slotIndex - b.slotIndex);
    for (const row of occurrenceSlots) {
      const original = Array.isArray(row.node.material) ? row.node.material[0]! : row.node.material;
      originals.add(original); const material = original.clone();
      row.node.material = Array.isArray(row.node.material) ? [material] : material;
      const locator: JsonObject = { kind: 'representationMaterial', slotIndex: row.slotIndex };
      if (!locators.has(canonical(locator))) throw Error('保存した材質と表示する面が一致しません。');
      materialLocators.set(material, locator);
    }
    return { root, materialLocators, occurrenceSlots, dispose };
  } catch (error) { dispose(); throw error; }
}
