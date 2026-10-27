// Lifetime-only, engine-free cleanup. This never certifies a constructor or
// creates/returns an engine object; both decoders own their own acceptance checks.
type Fields = Record<string, unknown>;
const fields = (v: unknown): Fields | undefined => v && typeof v === 'object' ? v as Fields : undefined;
export interface CloseableBitmap { readonly width: number; readonly height: number; close(): void }
const closed = new WeakSet<object>(), retired = new WeakSet<object>();
export function closeBitmapOnce(bitmap: CloseableBitmap): void {
  if (closed.has(bitmap)) return; closed.add(bitmap); bitmap.close();
}
interface Owner { readonly extra: readonly unknown[]; readonly bitmaps: ReadonlySet<CloseableBitmap>; readonly close: () => void }
const owners = new WeakMap<object, Owner>();
export function rememberModelOwner(root: object, extra: readonly unknown[], bitmaps: ReadonlySet<CloseableBitmap>, close: () => void): void {
  owners.set(root,{extra,bitmaps,close});
}
export function releaseOwnedResources(roots: readonly unknown[], extra: readonly unknown[] = [], bitmaps: Iterable<CloseableBitmap> = []): void {
  const geometries = new Set<object>(), materials = new Set<object>(), textures = new Set<object>();
  const images = new Set(bitmaps), nodes = new Set<object>(), values = new Set<object>();
  const textureValues = (v: unknown): void => {
    const f=fields(v);if(!f||values.has(f))return;values.add(f);
    if(f.isTexture){textures.add(f);const image=fields(fields(f.source)?.data);
      if(image&&typeof image.close==='function'&&typeof image.width==='number'&&typeof image.height==='number')images.add(image as unknown as CloseableBitmap);return;}
    if(Array.isArray(v)){v.forEach(textureValues);return;}
    for(const x of Object.values(f))if(typeof x!=='function')textureValues(x);
  };
  const material = (v: unknown) => {const f=fields(v);if(!f||materials.has(f))return;materials.add(f);textureValues(f);};
  const visit = (v: unknown): void => {
    const n=fields(v);if(!n||nodes.has(n))return;nodes.add(n);
    const owner=owners.get(n);if(owner){owners.delete(n);owner.close();owner.extra.forEach(visit);for(const b of owner.bitmaps)images.add(b);}
    if(n.isMaterial){material(n);return;}if(n.isTexture){textureValues(n);return;}
    if(n.isMesh||n.isPoints||n.isLine){const g=fields(n.geometry);if(g)geometries.add(g);if(Array.isArray(n.material))n.material.forEach(material);else material(n.material);}
    if(Array.isArray(n.children))n.children.forEach(visit);
  };
  roots.forEach(visit);extra.forEach(visit);
  let failure:unknown;
  for(const set of [textures,materials,geometries])for(const value of set){const f=fields(value);
    try {if(typeof f?.dispose==='function')f.dispose.call(value);}catch(error){failure??=error;}}
  for(const image of images)try{closeBitmapOnce(image);}catch(error){failure??=error;}
  if(failure)throw failure;
}
export function releaseOwnedModel(root: unknown): void {
  const f=fields(root);if(!f||retired.has(f))return;retired.add(f);
  if(typeof f.removeFromParent==='function')f.removeFromParent.call(root);
  releaseOwnedResources([root]);
}
export function releaseOwnedMaterials(materials: Iterable<unknown>): void { releaseOwnedResources([], [...materials]); }
