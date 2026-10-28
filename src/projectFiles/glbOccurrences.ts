import { snapshotTargets, assertTargetRows, trackGltfImages } from '../viewer/compat180/sceneProof';
import * as THREE from 'three';
import { GLTFLoader, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import type { JsonObject } from '../domain/values';
import { canonical } from '../domain/projectGraphSupport';
import { disposeModelResources, disposeMaterialResources } from '../viewer/loaders';
import { inspectValidationGlb, inspectValidationJpegGlb, validationGlbParts, type ValidatedGlb } from './glb';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { fileError, type FileValidationLimits } from './validation';
import { captureOwnedOccurrenceProof, occurrenceInputKey } from './legacy180Occurrences';
export { captureLegacyOccurrenceProof } from './legacy180Occurrences';

/** Actual180 proof and release precede a separately verified186 display. */
export async function decodeOccurrenceGlb(source: ValidatedGlb, signal?: AbortSignal) {
  const {bytes,...metadata}=source;
  const owned:ValidatedGlb={...structuredClone(metadata),bytes:bytes.slice()};
  const proof=await captureOwnedOccurrenceProof(owned,signal);
  signal?.throwIfAborted();
  const display = await decodeOccurrenceDisplay(owned);
  try {
    signal?.throwIfAborted();
    if(proof.inputKey!==occurrenceInputKey(owned))throw Error('元のモデル入力が変更されました。');
    if (proof.rows.length !== display.occurrenceSlots.length) throw Error('旧材質の面の数が一致しません。');
    for (const [index, slot] of display.occurrenceSlots.entries()) {
      const old = proof.rows[index]!;
      if (old.nodeIndex !== slot.nodeIndex || old.primitiveIndex !== slot.primitiveIndex || old.slotIndex !== slot.slotIndex || old.materialIndex !== slot.materialIndex)
        throw Error('旧材質の対応が一致しません。');
      assertTargetRows([old.target], snapshotTargets(slot.node, [old.target], false).rows, false);
    }
    return display;
  } catch(error) { display.dispose(); throw error; }
}

export async function inspectOccurrenceGlb(bytes: Uint8Array, limits: FileValidationLimits, decode?: PngDecoder): Promise<ValidatedGlb> {
  return occurrenceCatalog(await inspectValidationGlb(bytes, limits, decode), limits);
}
export async function inspectOccurrenceJpegGlb(bytes: Uint8Array, limits: FileValidationLimits, png?: PngDecoder, jpeg?: JpegDecoder): Promise<ValidatedGlb> {
  return occurrenceCatalog(await inspectValidationJpegGlb(bytes, limits, png, jpeg), limits);
}
function occurrenceCatalog(base: ValidatedGlb, limits: FileValidationLimits): ValidatedGlb {
  const j = validationGlbParts(base.bytes, limits).json;
  if (base.surfaceRanges.length > limits.maxItems) return fileError('材質の面の数が検査の上限を超えています。');
  const nodes = j.nodes as { mesh?: number }[], meshes = j.meshes as { primitives: { material?: number }[] }[];
  const occurrences = base.surfaceRanges.map(r => ({ nodeIndex: Number(r.nodeIndex), primitiveIndex: Number(r.primitiveIndex) }))
    .sort((a, b) => a.nodeIndex - b.nodeIndex || a.primitiveIndex - b.primitiveIndex)
    .map((r, slotIndex) => ({ ...r, slotIndex, materialIndex: meshes[nodes[r.nodeIndex]!.mesh!]!.primitives[r.primitiveIndex]!.material ?? null }));
  const oldMaterials = new Map(base.materials.map(m => [canonical(m.sourceLocator!), m]));
  const materials = occurrences.map(r => {
    const old = oldMaterials.get(canonical(r.materialIndex === null ? { kind: 'representationMaterial', slotIndex: 0 } : { kind: 'gltfMaterial', materialIndex: r.materialIndex }))!;
    return { sourceLocator: { kind: 'representationMaterial', slotIndex: r.slotIndex }, sourceSemantics: old.sourceSemantics! };
  });
  return { ...base, materials, occurrences };
}

export interface DecodedOccurrenceSlot {
  readonly node: THREE.Mesh; readonly childPath: readonly number[]; readonly materialArraySlot: 0;
  readonly nodeIndex: number; readonly primitiveIndex: number; readonly materialIndex: number | null; readonly slotIndex: number;
}
/** Owned inspected input only. No source URLs, metadata, storage or UI authority. */
export async function decodeOccurrenceDisplay(source: Pick<ValidatedGlb,'bytes'|'bounds'|'materials'|'surfaceRanges'|'occurrences'>,inlineResources=false) {
  if (!source.occurrences || THREE.REVISION !== '186' || !THREE.ColorManagement.enabled || THREE.ColorManagement.workingColorSpace !== THREE.LinearSRGBColorSpace)
    throw Error('モデルと材質の対応を確認できません。');
  const manager = new THREE.LoadingManager(), owned = new Set<ImageBitmap>(), roots = new Set<THREE.Object3D>(), originals = new Set<THREE.Material>();
  const materialLocators = new Map<THREE.Material, JsonObject>(), occurrenceSlots: DecodedOccurrenceSlot[] = [];
  let parser: GLTFParser | undefined, closed = false, failed = false;
  manager.setURLModifier(url => { if (!url.startsWith('blob:')&&!(inlineResources&&/^data:(?:application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg));base64,/.test(url))) throw Error('外部参照のあるモデルは表示できません。'); return url; });
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
    for (const m of originals) for (const v of Object.values(m)) if (v instanceof THREE.Texture) owned.delete(v.source.data as ImageBitmap);
    disposeModelResources(final); disposeMaterialResources(originals);
    for (const bitmap of owned) bitmap.close(); owned.clear(); materialLocators.clear();
  };
  class Images extends THREE.ImageBitmapLoader {
    override load(url: string, done?: (bitmap: ImageBitmap) => void, progress?: (event: ProgressEvent) => void, error?: (e: unknown) => void) {
      return super.load(url, bitmap => { if (closed) { bitmap.close(); error?.(Error('表示を取り消しました。')); return; }
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
