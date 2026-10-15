import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeModelResources } from '../../viewer/loaders';
import type { ValidatedGlb } from '../../projectFiles/glb';
import type { ValidationContent } from '../../projectFiles/content';
import { renderModel, type ValidationModelClosure, type DisplayModelVersion, type ReadonlyRenderModel } from './modelTypes';
import type { ResidentSurface } from './viewportPicking';
import { placementMatrix } from './viewportModel';
import { canonical, same } from '../../domain/projectGraphSupport';
import type { JsonObject } from '../../domain/values';
import { validationMaterialSlots, validationMaterialIssue, type ValidationMaterialEffects } from './validationMaterials';
import { patchHardChroma } from '../../viewer/hardChroma';
import { decodeOccurrenceGlb, type DecodedOccurrenceSlot } from '../../projectFiles/glbOccurrences';
import { materialForDisplay } from '../../domain/materialIntent';

export interface SavedModelResidentPort { create(model: ValidationModelClosure | ReadonlyRenderModel, effects?: ValidationMaterialEffects): ResidentSurface; dispose(): void }
export interface ValidationResidentCache extends SavedModelResidentPort { prepare(versions: readonly DisplayModelVersion[]): Promise<void>;
  validate(c: ValidationModelClosure, effects?: ValidationMaterialEffects): void }
export interface DecodedValidationModel { root: THREE.Object3D; materialLocators: ReadonlyMap<THREE.Material, JsonObject>; occurrenceSlots?: readonly DecodedOccurrenceSlot[]; dispose(): void }

/** No arbitrary URL/path input. The caller supplies already inspected, owned GLB bytes. */
export async function decodeValidationModel(source: ValidatedGlb): Promise<DecodedValidationModel> {
  if (source.occurrences) return decodeOccurrenceGlb(source);
  const manager = new THREE.LoadingManager(), owned = new Set<ImageBitmap>();
  const materialLocators = new Map<THREE.Material, JsonObject>();
  const sourceLocators = new Set(source.materials.map(s => canonical(s.sourceLocator!)));
  const all = new THREE.Group(); let failed = false, closed = false;
  manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw Error('外部参照のあるモデルは表示できません。'); return url; });
  manager.onError = () => { failed = true; };
  const dispose = () => {
    if (closed) return; closed = true;
    // The shared disposer owns reachable bitmaps; close only unreachable late/failed decodes here.
    all.traverse(node => { if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      for (const field of Object.values(material)) if (field instanceof THREE.Texture) owned.delete(field.source.data as ImageBitmap);
    } });
    disposeModelResources(all); for (const bitmap of owned) bitmap.close(); owned.clear(); materialLocators.clear();
  };
  class TrackedImages extends THREE.ImageBitmapLoader {
    override load(url: string, done?: (bitmap: ImageBitmap) => void, progress?: (event: ProgressEvent) => void, error?: (e: unknown) => void) {
      return super.load(url, bitmap => {
        if (closed) { bitmap.close(); error?.(Error('表示を取り消しました。')); return; }
        owned.add(bitmap); done?.(bitmap);
      }, progress, e => { failed = true; error?.(e); });
    }
  }
  try {
    const loader = new GLTFLoader(manager);
    loader.register(parser => ({ name: 'LOCIVIEW_validation_saved_png', beforeRoot: async () => {
      parser.textureLoader = new TrackedImages(manager).setOptions({ premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    }, loadMesh: async index => {
      const mesh = await parser.loadMesh(index);
      if (closed) { disposeModelResources(mesh); throw Error('モデルの表示を取り消しました。'); }
      all.add(mesh); // Own resources before inspecting; load failure can precede scene construction.
      mesh.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        // Pinned loader supplies primitives; its declaration currently omits that field.
        const association = parser.associations.get(node) as { meshes?: number; primitives?: number } | undefined, primitiveIndex = association?.primitives;
        if (association?.meshes !== index || !Number.isSafeInteger(primitiveIndex)) throw Error('材質と面の対応を確認できません。');
        const primitive = parser.json.meshes[index]?.primitives[primitiveIndex!];
        if (!primitive || Array.isArray(node.material)) throw Error('材質の対応形式が未対応です。');
        const materialIndex = parser.associations.get(node.material)?.materials;
        const locator: JsonObject = primitive.material === undefined ? { kind: 'representationMaterial', slotIndex: 0 } :
          { kind: 'gltfMaterial', materialIndex: primitive.material };
        if (materialIndex !== primitive.material || !sourceLocators.has(canonical(locator)) ||
          materialLocators.has(node.material) && !same(materialLocators.get(node.material), locator))
          throw Error('保存した材質と表示する面が一致しません。');
        materialLocators.set(node.material, locator);
      });
      return mesh;
    } }));
    const gltf = await loader.parseAsync(source.bytes.slice().buffer as ArrayBuffer, '');
    all.add(...gltf.scenes); const root = gltf.scene;
    if (failed || !root) throw Error('モデルのテクスチャを表示できません。');
    let triangles = 0;
    root.updateMatrixWorld(true);
    root.traverse(node => { if (node instanceof THREE.Mesh) {
      if (Array.isArray(node.material) || !materialLocators.has(node.material)) throw Error('表示する材質の対応がありません。');
      triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3;
    } });
    const expected = source.surfaceRanges.reduce((n, r) => n + Number(r.count), 0);
    const bounds = new THREE.Box3().setFromObject(root, true), actual = [...bounds.min.toArray(), ...bounds.max.toArray()];
    if (triangles !== expected || actual.some((v, i) => !Number.isFinite(v) ||
      Math.abs(v - [...source.bounds.min, ...source.bounds.max][i]!) > 1e-6 * Math.max(1, Math.abs(v))))
      throw Error('保存したモデルと描画した形状が一致しません。');
    return { root, materialLocators, dispose };
  } catch (error) { dispose(); throw error; }
}

/** Reusable resident cache, scoped to one opened validation Project; never shared metadata. */
export async function prepareValidationResidents(versions: readonly DisplayModelVersion[], content: Pick<ValidationContent, 'model'>,
  decode: (source: ValidatedGlb) => Promise<DecodedValidationModel> = decodeValidationModel): Promise<ValidationResidentCache> {
  const models = (rows: readonly DisplayModelVersion[]) => rows.map(v => {
    if (v.closure.shape !== 'saved-glb') throw Error('実モデルの保存本体を選択してください。'); return renderModel(v.closure);
  });
  const core = await prepareReadonlyResidents(models(versions), content, decode);
  return { ...core, prepare: next => core.prepare(models(next)) };
}
export async function prepareReadonlyResidents(initial: readonly ReadonlyRenderModel[], content: Pick<ValidationContent, 'model'>,
  decode: (source: ValidatedGlb) => Promise<DecodedValidationModel> = decodeValidationModel) {
  const templates = new Map<string, { record: string; model: DecodedValidationModel }>();
  const live = new Set<() => void>(); let closed = false, preparing = false;
  const dispose = () => { if (closed) return; closed = true; for (const release of [...live]) release();
    for (const item of templates.values()) item.model.dispose(); templates.clear(); };
  const prepare = async (next: readonly ReadonlyRenderModel[]) => {
    if (closed || preparing) throw Error('モデルの表示準備を完了してください。');
    preparing = true; const staged = new Map<string, { record: string; model: DecodedValidationModel }>();
    try { for (const c of next) {
      const key = c.representation.id, record = canonical(c.representation);
      const previous = templates.get(key) ?? staged.get(key);
      if (previous) { if (previous.record !== record) throw Error('モデルの本体が一致しません。'); continue; }
      const source = await content.model(c.representation);
      if (!same(source.bounds, c.representation.logicalBoundsAsset)) throw Error('保存したモデルの範囲が一致しません。');
      staged.set(key, { record, model: await decode(source) });
      if (closed) throw Error('画面を閉じました。');
    }
      for (const [key, item] of staged) templates.set(key, item);
    } catch (error) { for (const item of staged.values()) item.model.dispose(); throw error; }
    finally { preparing = false; }
  };
  const validate = (c: ValidationModelClosure | ReadonlyRenderModel, effects: ValidationMaterialEffects = {}) => {
    const item = templates.get(c.representation.id), slots = validationMaterialSlots(c);
    if (closed || !item || item.record !== canonical(c.representation)) throw Error('保存したモデルの表示本体を再確認してください。');
    if (Object.keys(effects).some(id => !slots.some(s => s.target.logicalMaterialSlotId === id))) throw Error('材質の適用先がありません。');
    for (const slot of slots) {
      const effect = effects[slot.target.logicalMaterialSlotId];
      if (effect && !('issue' in effect)) {
        const issue = validationMaterialIssue(slot, effect, (c.representation.formatProfile as JsonObject)?.id === 'development-validation-glb-occurrence-1' ? 'map2' : 'map1'); if (issue) throw Error(issue);
        for (const [material, locator] of item.model.materialLocators) if (same(locator, slot.locator) && !(material instanceof THREE.MeshStandardMaterial))
          throw Error('元の材質の設定を確認してください。');
      }
    }
  };
  try {
    await prepare(initial);
    return { dispose, prepare, validate, create(input: ValidationModelClosure | ReadonlyRenderModel, effects: ValidationMaterialEffects = {}) {
      const c = renderModel(input);
      validate(c, effects);
      const item = templates.get(c.representation.id);
      if (closed || !item || item.record !== canonical(c.representation)) throw Error('保存したモデルの表示本体を再確認してください。');
      const root = item.model.root.clone(true), asset = new THREE.Group();
      const slots = validationMaterialSlots(c), byLocator = new Map(slots.map(s => [canonical(s.locator), s]));
      const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>(), materials = new Map<THREE.Material, THREE.Material>();
      let released = false;
      const release = () => { if (released) return; released = true; live.delete(release); asset.removeFromParent();
        for (const g of geometries.values()) g.dispose(); for (const m of materials.values()) m.dispose(); };
      try {
        root.traverse(node => { if (node instanceof THREE.Mesh) {
          if (!geometries.has(node.geometry)) geometries.set(node.geometry, node.geometry.clone());
          node.geometry = geometries.get(node.geometry)!;
          const clone = (m: THREE.Material) => {
            if (materials.has(m)) return materials.get(m)!;
            const locator = item.model.materialLocators.get(m), slot = locator && byLocator.get(canonical(locator));
            if (!slot) throw Error('表示する面と材質の対応を確認できません。');
            const effect = effects[slot.target.logicalMaterialSlotId];
            let result = m.clone(); materials.set(m, result);
            if (effect && 'issue' in effect) result.visible = false;
            else if (effect) {
              if (!(m instanceof THREE.MeshStandardMaterial)) throw Error('元の材質の設定を確認してください。');
              const a = materialForDisplay(effect, (c.representation.formatProfile as JsonObject)?.id === 'development-validation-glb-occurrence-1' ? 'map2' : 'map1').appearance;
              if (a.lighting === 'unlit') {
                result.dispose(); result = new THREE.MeshBasicMaterial({ color: m.color.clone(), map: m.map,
                  vertexColors: m.vertexColors, side: m.side, opacity: m.opacity, alphaMap: m.alphaMap, alphaTest: m.alphaTest,
                  transparent: m.transparent, toneMapped: m.toneMapped, depthTest: m.depthTest, depthWrite: m.depthWrite, visible: m.visible });
                materials.set(m, result);
              }
              if (a.baseColorSrgb) (result as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).color.setRGB(...a.baseColorSrgb as [number, number, number], THREE.SRGBColorSpace);
              if (a.doubleSided !== undefined) result.side = a.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
              if (a.opacity !== undefined) result.opacity = a.opacity;
              if (a.chroma) patchHardChroma(result as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, a.chroma);
            }
            return result;
          };
          node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
        } });
        const representation = new THREE.Group(); representation.matrix.copy(placementMatrix(c.representation.representationToAsset)); representation.matrixAutoUpdate = false;
        representation.add(root); asset.add(representation);
        asset.matrix.copy(placementMatrix(c.assetToProject)); asset.matrixAutoUpdate = false; asset.updateMatrixWorld(true);
        live.add(release); return { mesh: root, asset, dispose: release };
      } catch (error) { release(); throw error; }
    } };
  } catch (error) { dispose(); throw error; }
}
