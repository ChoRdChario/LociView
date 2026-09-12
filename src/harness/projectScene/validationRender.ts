import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeModelResources } from '../../viewer/loaders';
import type { ValidatedGlb } from '../../projectFiles/glb';
import type { ValidationContent } from '../../projectFiles/content';
import type { ValidationModelClosure, DisplayModelVersion } from './modelTypes';
import type { ResidentSurface } from './viewportPicking';
import { placementMatrix } from './viewportModel';
import { canonical, same } from '../../domain/projectGraphSupport';

export interface SavedModelResidentPort { create(model: ValidationModelClosure): ResidentSurface; dispose(): void }
export interface DecodedValidationModel { root: THREE.Object3D; dispose(): void }

/** No arbitrary URL/path input. The caller supplies already inspected, owned GLB bytes. */
export async function decodeValidationModel(source: ValidatedGlb): Promise<DecodedValidationModel> {
  const manager = new THREE.LoadingManager(), owned = new Set<ImageBitmap>();
  const all = new THREE.Group(); let failed = false, closed = false;
  manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw Error('外部参照のあるモデルは表示できません。'); return url; });
  manager.onError = () => { failed = true; };
  const dispose = () => {
    if (closed) return; closed = true;
    // The shared disposer owns reachable bitmaps; close only unreachable late/failed decodes here.
    all.traverse(node => { if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      for (const field of Object.values(material)) if (field instanceof THREE.Texture) owned.delete(field.source.data as ImageBitmap);
    } });
    disposeModelResources(all); for (const bitmap of owned) bitmap.close(); owned.clear();
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
    } }));
    const gltf = await loader.parseAsync(source.bytes.slice().buffer as ArrayBuffer, '');
    all.add(...gltf.scenes); const root = gltf.scene;
    if (failed || !root) throw Error('モデルのテクスチャを表示できません。');
    let triangles = 0;
    root.updateMatrixWorld(true);
    root.traverse(node => { if (node instanceof THREE.Mesh) triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3; });
    const expected = source.surfaceRanges.reduce((n, r) => n + Number(r.count), 0);
    const bounds = new THREE.Box3().setFromObject(root, true), actual = [...bounds.min.toArray(), ...bounds.max.toArray()];
    if (triangles !== expected || actual.some((v, i) => !Number.isFinite(v) ||
      Math.abs(v - [...source.bounds.min, ...source.bounds.max][i]!) > 1e-6 * Math.max(1, Math.abs(v))))
      throw Error('保存したモデルと描画した形状が一致しません。');
    return { root, dispose };
  } catch (error) { dispose(); throw error; }
}

/** Reusable resident cache, scoped to one opened validation Project; never shared metadata. */
export async function prepareValidationResidents(versions: readonly DisplayModelVersion[], content: Pick<ValidationContent, 'model'>,
  decode: (source: ValidatedGlb) => Promise<DecodedValidationModel> = decodeValidationModel): Promise<SavedModelResidentPort> {
  const templates = new Map<string, { record: string; model: DecodedValidationModel }>();
  const live = new Set<() => void>(); let closed = false;
  const dispose = () => { if (closed) return; closed = true; for (const release of [...live]) release();
    for (const item of templates.values()) item.model.dispose(); templates.clear(); };
  try {
    for (const version of versions) {
      const c = version.closure; if (c.shape !== 'saved-glb') throw Error('実モデルの保存本体を選択してください。');
      const key = c.representation.id, record = canonical(c.representation);
      if (templates.has(key)) { if (templates.get(key)!.record !== record) throw Error('モデルの本体が一致しません。'); continue; }
      const source = await content.model(c.representation);
      if (!same(source.bounds, c.representation.logicalBoundsAsset)) throw Error('保存したモデルの範囲が一致しません。');
      templates.set(key, { record, model: await decode(source) });
    }
    return { dispose, create(c) {
      const item = templates.get(c.representation.id);
      if (closed || !item || item.record !== canonical(c.representation)) throw Error('保存したモデルの表示本体を再確認してください。');
      const root = item.model.root.clone(true), asset = new THREE.Group();
      const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>(), materials = new Map<THREE.Material, THREE.Material>();
      let released = false;
      const release = () => { if (released) return; released = true; live.delete(release); asset.removeFromParent();
        for (const g of geometries.values()) g.dispose(); for (const m of materials.values()) m.dispose(); };
      try {
        root.traverse(node => { if (node instanceof THREE.Mesh) {
          if (!geometries.has(node.geometry)) geometries.set(node.geometry, node.geometry.clone());
          node.geometry = geometries.get(node.geometry)!;
          const clone = (m: THREE.Material) => { if (!materials.has(m)) materials.set(m, m.clone()); return materials.get(m)!; };
          node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
        } });
        const representation = new THREE.Group(); representation.matrix.copy(placementMatrix(c.representation.representationToAsset)); representation.matrixAutoUpdate = false;
        representation.add(root); asset.add(representation);
        asset.matrix.copy(placementMatrix(c.binding.assetToProject)); asset.matrixAutoUpdate = false; asset.updateMatrixWorld(true);
        live.add(release); return { mesh: root, asset, dispose: release };
      } catch (error) { release(); throw error; }
    } };
  } catch (error) { dispose(); throw error; }
}
