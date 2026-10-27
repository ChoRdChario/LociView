import type { GsDemand } from '../viewer/gsDecodeQueue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeModelResources } from '../viewer/loaders';
import { isPointModel, isGsModel, type ValidatedModel, type ValidatedPoint } from '../projectFiles/pointPly';
import type { ValidatedGs } from '../projectFiles/gsPly';
import { createPointSurface } from '../viewer/pointSurface';
import type { ValidatedGlb } from '../projectFiles/glb';
import type { ValidationContent } from '../projectFiles/content';
import { renderModel, isSavedModel, type ValidationModelClosure, type DisplayModelVersion, type ReadonlyRenderModel } from './modelTypes';
import type { ResidentSurface } from './viewportPicking';
import { placementMatrix } from './viewportModel';
import { canonical, same } from '../domain/projectGraphSupport';
import type { JsonObject } from '../domain/values';
import { validationMaterialSlots, validationMaterialIssue, type ValidationMaterialEffects } from './validationMaterials';
import { patchHardChroma, patchBinaryMask } from '../viewer/hardChroma';
import { decodeOccurrenceGlb, type DecodedOccurrenceSlot } from '../projectFiles/glbOccurrences';
import { materialForDisplay } from '../domain/materialIntent';
import { readLegacyModelProof } from '../viewer/compat180/proof';
import { trackGltfImages, snapshotTargets, assertTargetTables } from '../viewer/compat180/sceneProof';

export interface SavedModelResidentPort {
  state?(model: ValidationModelClosure | ReadonlyRenderModel): { phase:'loading'|'ready'|'failed'; issue?:string };
  label?(model:ValidationModelClosure|ReadonlyRenderModel):string;
  subscribe?(changed:()=>void):()=>void;
  gsPending?(models:readonly (ValidationModelClosure|ReadonlyRenderModel)[]):boolean;
  gsDemand?(model: ValidationModelClosure | ReadonlyRenderModel): GsDemand | null; create(model: ValidationModelClosure | ReadonlyRenderModel, effects?: ValidationMaterialEffects): ResidentSurface; dispose(): void }
export interface ValidationResidentCache extends SavedModelResidentPort { prepare(versions: readonly DisplayModelVersion[]): Promise<void>;
  readonly ready:Promise<void>;
  validate(c: ValidationModelClosure, effects?: ValidationMaterialEffects): void }
export interface DecodedValidationModel { point?: ValidatedPoint; gs?: ValidatedGs; proxy?:DecodedValidationModel; proxyIssue?:string; root: THREE.Object3D; materialLocators: ReadonlyMap<THREE.Material, JsonObject>; occurrenceSlots?: readonly DecodedOccurrenceSlot[]; dispose(): void }

/** No arbitrary URL/path input. The caller supplies already inspected, owned GLB bytes. */
export async function decodeValidationModel(source: ValidatedGlb, signal?: AbortSignal): Promise<DecodedValidationModel> {
  signal?.throwIfAborted();
  if (source.occurrences) return decodeOccurrenceGlb(source, signal);
  const { bytes, ...metadata } = source;
  source = { ...structuredClone(metadata), bytes: bytes.slice() };
  const legacy = await readLegacyModelProof('glb', source.bytes, { signal });
  signal?.throwIfAborted();
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
    loader.register(parser => { trackGltfImages(parser); return { name: 'LOCIVIEW_validation_saved_png', beforeRoot: async () => {
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
    } }; });
    const gltf = await loader.parseAsync(source.bytes.slice().buffer as ArrayBuffer, '');
    all.add(...gltf.scenes); const root = gltf.scene;
    signal?.throwIfAborted();
    assertTargetTables(legacy.table, snapshotTargets(root, legacy.table.rows));
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
export async function prepareValidationResidents(versions: readonly DisplayModelVersion[], content: { modelContent?(record: JsonObject): Promise<ValidatedModel>; model?(record: JsonObject): Promise<ValidatedGlb> },
  decode: (source: ValidatedGlb, signal?: AbortSignal) => Promise<DecodedValidationModel> = decodeValidationModel, progressive = false): Promise<ValidationResidentCache> {
  const models = (rows: readonly DisplayModelVersion[]) => rows.map(v => {
    if (!isSavedModel(v.closure)) throw Error('実モデルの保存本体を選択してください。'); return renderModel(v.closure);
  });
  const core = await prepareReadonlyResidents(models(versions), content, decode, progressive);
  return { ...core, label: c => versions.find(v=>v.assetId===renderModel(c).assetId)?.label??'3Dモデル', prepare: next => core.prepare(models(next)) };
}
export async function prepareReadonlyResidents(initial: readonly ReadonlyRenderModel[], content: { modelContent?(record: JsonObject): Promise<ValidatedModel>; model?(record: JsonObject): Promise<ValidatedGlb> },
  decode: (source: ValidatedGlb, signal?: AbortSignal) => Promise<DecodedValidationModel> = decodeValidationModel, progressive = false) {
  const lifetime = new AbortController();
  const templates = new Map<string, { record: string; model: DecodedValidationModel }>();
  const failures=new Map<string,string>(),listeners=new Set<()=>void>();
  const notify=()=>{for(const changed of listeners)changed();};
  const uses=new Map<string,number>();let wanted=new Set<string>();
  const collect=()=>{if(closed)return;for(const [key,item]of templates)if(!wanted.has(key)&&!uses.get(key)){item.model.dispose();templates.delete(key);}};
  const live = new Set<() => void>(); let closed = false, preparing = false;
  const keyFor=(c:ValidationModelClosure|ReadonlyRenderModel)=>`${c.representation.id}/${c.proxy?.id??''}`;
  const dispose = () => { if (closed) return; closed = true; lifetime.abort(); for (const release of [...live]) release();
    for (const item of templates.values()) item.model.dispose(); templates.clear();listeners.clear(); };
  const prepare = async (next: readonly ReadonlyRenderModel[], publish = false) => {
    if (closed || preparing) throw Error('モデルの表示準備を完了してください。');
    preparing = true; const staged = new Map<string, { record: string; model: DecodedValidationModel }>(),errors:unknown[]=[];
    if(publish)wanted=new Set(next.map(keyFor));
    try { for (const c of next) {
      try {
      const key = keyFor(c), record = canonical(c.representation);
      const previous = templates.get(key) ?? staged.get(key);
      if (previous) { if (previous.record !== record) throw Error('モデルの本体が一致しません。'); continue; }
      const source = content.modelContent ? await content.modelContent(c.representation) : await content.model!(c.representation);
      if (!same(nativeSpatialModelBounds(c.representation, source), c.representation.logicalBoundsAsset)) throw Error('保存したモデルの範囲が一致しません。');
      let decoded:DecodedValidationModel;
      if(isGsModel(source)){
        decoded={gs:source,root:new THREE.Group(),materialLocators:new Map(),dispose(){this.proxy?.dispose();}};
        if(c.proxy){try{const proxy=content.modelContent?await content.modelContent(c.proxy):await content.model!(c.proxy);if(isPointModel(proxy)||isGsModel(proxy))throw Error('位置指定用の面を確認してください。');
          decoded.proxy=await decode(proxy,lifetime.signal);}catch(e){decoded.proxyIssue=(e as Error).message;}}
      }else decoded=isPointModel(source)?{point:source,root:new THREE.Group(),materialLocators:new Map(),dispose(){}}:await decode(source,lifetime.signal);
      staged.set(key, { record, model:decoded });
      if (closed) throw Error('画面を閉じました。');
      if(publish){templates.set(key,staged.get(key)!);staged.delete(key);failures.delete(key);notify();}
      }catch(error){if(!publish||closed)throw error;failures.set(keyFor(c),error instanceof Error?error.message:'モデルを読み込めません。');errors.push(error);notify();}
    }
      for (const [key, item] of staged) {templates.set(key, item);failures.delete(key);}
      wanted=new Set(next.map(keyFor));collect();
      if(errors.length)throw new AggregateError(errors,'一部のモデルを読み込めません。記録と原本は保持しています。');
    } catch (error) { for (const item of staged.values()) item.model.dispose(); throw error; }
    finally { preparing = false; }
  };
  const validate = (c: ValidationModelClosure | ReadonlyRenderModel, effects: ValidationMaterialEffects = {}) => {
    const item = templates.get(keyFor(c)), slots = validationMaterialSlots(c);
    if (closed || !item || item.record !== canonical(c.representation)) throw Error('保存したモデルの表示本体を再確認してください。');
    if (Object.keys(effects).some(id => !slots.some(s => s.target.logicalMaterialSlotId === id))) throw Error('材質の適用先がありません。');
    if (item.model.point) return; // Unsupported point effects are diagnosed locally by the resident.
    for (const slot of slots) {
      const effect = effects[slot.target.logicalMaterialSlotId];
      if (effect && !('issue' in effect)) {
        const issue = validationMaterialIssue(slot, effect, ['development-validation-glb-occurrence-1', 'development-validation-glb-occurrence-jpeg-1'].includes(String((c.representation.formatProfile as JsonObject)?.id)) ? 'map2' : 'map1'); if (issue) throw Error(issue);
        for (const [material, locator] of item.model.materialLocators) if (same(locator, slot.locator) && !(material instanceof THREE.MeshStandardMaterial))
          throw Error('元の材質の設定を確認してください。');
      }
    }
  };
  try {
    // Scheduling only: smaller admitted bodies can become usable before a large decode.
    const bytes=(model:ReadonlyRenderModel)=>{const blob=model.representation.blob;if(blob&&typeof blob==='object'&&!Array.isArray(blob)){const count=(blob as JsonObject).byteLength;if(typeof count==='number')return count;}return Number.MAX_SAFE_INTEGER;};
    const ready=prepare(progressive?[...initial].sort((a,b)=>bytes(a)-bytes(b)):initial,progressive);void ready.catch(()=>{});
    if(!progressive)await ready;
    return { dispose, prepare, validate, ready,
      state(input:ValidationModelClosure|ReadonlyRenderModel){const key=keyFor(input),issue=failures.get(key);return issue?{phase:'failed' as const,issue}:{phase:templates.has(key)?'ready' as const:'loading' as const};},
      subscribe(changed:()=>void){listeners.add(changed);return()=>{listeners.delete(changed);};},
      gsPending(models:readonly (ValidationModelClosure|ReadonlyRenderModel)[]){return models.some(c=>c.representation.contentKind==='gaussianSplat'&&!templates.has(keyFor(c)));},
      gsDemand(input:ValidationModelClosure|ReadonlyRenderModel){const c=renderModel(input),item=templates.get(keyFor(c));
      if(closed||!item||item.record!==canonical(c.representation))throw Error('保存したモデルの表示本体を再確認してください。');
      return item.model.gs&&!item.model.gs.displayIssue?{count:item.model.gs.count,degree:item.model.gs.degree}:null;}, create(input: ValidationModelClosure | ReadonlyRenderModel, effects: ValidationMaterialEffects = {}) {
      const c = renderModel(input);
      validate(c, effects);
      const item = templates.get(keyFor(c));
      if (closed || !item || item.record !== canonical(c.representation)) throw Error('保存したモデルの表示本体を再確認してください。');
      const retain=()=>uses.set(keyFor(c),(uses.get(keyFor(c))??0)+1),drop=()=>{const key=keyFor(c),count=(uses.get(key)??0)-1;if(count>0)uses.set(key,count);else uses.delete(key);collect();};
      if(item.model.gs){
        const asset=new THREE.Group(),object=new THREE.Group();object.matrix.copy(placementMatrix(c.representation.representationToAsset));object.matrixAutoUpdate=false;
        asset.matrix.copy(placementMatrix(c.assetToProject));asset.matrixAutoUpdate=false;asset.add(object);
        const proxy=item.model.proxy?.root.clone(true),geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
        if(proxy){proxy.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry=node.geometry.clone();geometries.push(node.geometry);const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,colorWrite:false,depthWrite:false});materials.push(material);node.material=material;node.layers.set(31);}});const placement=new THREE.Group();placement.matrix.copy(placementMatrix(c.proxy!.representationToAsset));placement.matrixAutoUpdate=false;placement.add(proxy);asset.add(placement);}
        asset.updateMatrixWorld(true);
        const release=()=>{if(!live.delete(release))return;asset.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();drop();};retain();live.add(release);
        return {mesh:object,asset,gs:{source:item.model.gs,object,issue:null,ready:false},...(proxy?{interaction:proxy}:{}),interactionIssue:item.model.proxyIssue??(!c.proxy?'位置指定用の面を追加してください。':null),dispose:release};
      }
      if (item.model.point) {
        const source = item.model.point, point = createPointSurface(source.positions, source.colors), asset = new THREE.Group(), representation = new THREE.Group();
        representation.matrix.copy(placementMatrix(c.representation.representationToAsset)); representation.matrixAutoUpdate = false;
        representation.add(point.mesh); asset.add(representation); asset.matrix.copy(placementMatrix(c.assetToProject)); asset.matrixAutoUpdate = false; asset.updateMatrixWorld(true);
        const issue = Object.keys(effects).length ? 'この点群の材質調整は表示できません。点群のデータと記録は保持しています。' : null;
        const release = () => { if (!live.delete(release)) return; asset.removeFromParent(); point.dispose();drop(); };
        retain();
        live.add(release);
        return { mesh: point.mesh, asset, points: { positions: source.positions, representationId: c.representation.id, object: point.mesh,
          project: point.project, diameter: 3, issue, configure(view: import('../domain/pointPresentation').PointViewport, diameter: number) { const localIssue = point.configure(view, diameter); this.diameter = point.diameter; if (issue) point.mesh.visible = false; this.issue = issue ?? localIssue; return this.issue; } }, dispose: release };
      }
      const root = item.model.root.clone(true), asset = new THREE.Group();
      const slots = validationMaterialSlots(c), byLocator = new Map(slots.map(s => [canonical(s.locator), s]));
      const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>(), materials = new Map<THREE.Material, THREE.Material>();
      let released = false;
      const release = () => { if (released) return; released = true; const retained=live.delete(release); asset.removeFromParent();
        for (const g of geometries.values()) g.dispose(); for (const m of materials.values()) m.dispose(); if(retained)drop(); };
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
              const displayed = materialForDisplay(effect, ['development-validation-glb-occurrence-1', 'development-validation-glb-occurrence-jpeg-1'].includes(String((c.representation.formatProfile as JsonObject)?.id)) ? 'map2' : 'map1');
              const a = displayed.appearance;
              if (a.lighting === 'unlit') {
                result.dispose(); result = new THREE.MeshBasicMaterial({ color: m.color.clone(), map: m.map,
                  vertexColors: m.vertexColors, side: m.side, opacity: m.opacity, alphaMap: m.alphaMap, alphaTest: m.alphaTest,
                  transparent: m.transparent, toneMapped: m.toneMapped, depthTest: m.depthTest, depthWrite: m.depthWrite, visible: m.visible });
                materials.set(m, result);
              }
              if (a.baseColorSrgb) (result as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).color.setRGB(...a.baseColorSrgb as [number, number, number], THREE.SRGBColorSpace);
              if (a.doubleSided !== undefined) result.side = a.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
              if (a.opacity !== undefined) result.opacity = a.opacity;
              if (displayed.compositing.coverage.policy === 'mask') patchBinaryMask(result as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
                { opacity: a.opacity ?? 1, cutoff: displayed.compositing.coverage.alphaCutoff!, ...(a.chroma ? { chroma: a.chroma } : {}) });
              else if (a.chroma) patchHardChroma(result as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, a.chroma);
            }
            return result;
          };
          node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
        } });
        const representation = new THREE.Group(); representation.matrix.copy(placementMatrix(c.representation.representationToAsset)); representation.matrixAutoUpdate = false;
        representation.add(root); asset.add(representation);
        asset.matrix.copy(placementMatrix(c.assetToProject)); asset.matrixAutoUpdate = false; asset.updateMatrixWorld(true);
        retain();live.add(release); return { mesh: root, asset, dispose: release };
      } catch (error) { release(); throw error; }
    } };
  } catch (error) { dispose(); throw error; }
}
import { nativeSpatialModelBounds } from '../projectFiles/nativeSpatial';
