import { NativeSha256, digestNativeBytes } from '../../nativeGs/sha256';

// Engine-free read projections. Objects originate only in the owned decoders;
// neither this table nor its hash is persistent provenance or a source locator.
type Fields = Record<string, unknown>;
const object = (v: unknown): Fields => {
  if (!v || typeof v !== 'object') throw Error('モデルの対応を確認できません。');
  return v as Fields;
};
const array = (v: unknown): readonly unknown[] => Array.isArray(v) ? v : [];
const ignoredMaterial = new Set(['id', 'uuid', 'version', '_listeners', 'userData']);
const origins = new WeakMap<object, string>();
export function rememberTextureOrigin(texture: object, source: string): void {
  origins.set(texture, source);
  const owner = object(texture).source; if (owner && typeof owner === 'object') origins.set(owner, source);
}
/** Track the actual image dependency, including UV clones sharing Texture.source. */
export function trackGltfImages(parser: unknown): void {
  const p = object(parser), load = p.loadImageSource;
  if (typeof load !== 'function') throw Error('画像の元参照を確認できません。');
  p.loadImageSource = function(this: unknown, index: unknown, loader: unknown) {
    if (!Number.isSafeInteger(index) || Number(index) < 0) throw Error('画像の元参照が不正です。');
    return Promise.resolve(load.call(this, index, loader)).then(texture => {
      rememberTextureOrigin(object(texture), `gltf-image:${index}`); return texture;
    });
  };
}
/** MTL TextureLoader returns before its image is ready; bind its owned URI now. */
export function trackMtlTextures(creator: unknown, own?: (texture: object) => void): void {
  const c = object(creator), load = c.loadTexture;
  if (typeof load !== 'function') throw Error('材質画像の元参照を確認できません。');
  c.loadTexture = function(this: unknown, ...args: unknown[]) {
    const texture = load.apply(this, args);
    if (typeof args[0] !== 'string') throw Error('材質画像の元参照が不正です。');
    rememberTextureOrigin(object(texture), 'mtl-uri:' + digestNativeBytes(new TextEncoder().encode(args[0])).sha256);
    own?.(object(texture));
    return texture;
  };
}

function numbers(v: unknown): number[] {
  const a = Array.isArray(v) || ArrayBuffer.isView(v) ? Array.from(v as ArrayLike<number>) : [];
  if (a.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw Error('モデルの数値を確認できません。');
  return a.map(n => n || 0);
}
function plain(v: unknown, seen = new Set<object>()): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw Error('モデルの数値を確認できません。');
    return v || 0;
  }
  if (typeof v !== 'object') throw Error('モデルの材質を確認できません。');
  if (seen.has(v)) throw Error('モデルの材質が循環しています。');
  seen.add(v);
  try {
    if (ArrayBuffer.isView(v)) return numbers(v);
    if (Array.isArray(v)) return v.map(x => plain(x, seen));
    const f = object(v);
    if (f.isColor) return ['color', plain(f.r), plain(f.g), plain(f.b)];
    if (f.isVector2) return ['vec2', plain(f.x), plain(f.y)];
    if (f.isVector3) return ['vec3', plain(f.x), plain(f.y), plain(f.z)];
    if (f.isVector4 || f.isQuaternion) return ['vec4', plain(f.x), plain(f.y), plain(f.z), plain(f.w)];
    if (f.isMatrix3 || f.isMatrix4) return ['matrix', numbers(f.elements)];
    if (f.isTexture) {
      const image = f.image && typeof f.image === 'object' ? object(f.image) : {};
      const source = f.source && typeof f.source === 'object' ? f.source : undefined;
      const origin = origins.get(v) ?? (source ? origins.get(source) : undefined);
      if (!origin) throw Error('材質画像の正確な元参照を確認できません。');
      const keys = ['mapping','channel','wrapS','wrapT','magFilter','minFilter','anisotropy','format','type',
        'flipY','colorSpace','premultiplyAlpha','unpackAlignment','generateMipmaps','offset','repeat','center','rotation','matrixAutoUpdate','matrix'];
      return ['texture', origin, origin.startsWith('gltf-image:') ? [image.width ?? null,image.height ?? null] : 'pending-owned-mtl',
        keys.map(k => [k, plain(f[k], seen)])];
    }
    return Object.keys(f).sort().filter(k => typeof f[k] !== 'function').map(k => [k, plain(f[k], seen)]);
  } finally { seen.delete(v); }
}
const textHash = (v: unknown): string => digestNativeBytes(new TextEncoder().encode(JSON.stringify(v))).sha256;

function attribute(v: unknown): unknown {
  const a = object(v), size = Number(a.itemSize), count = Number(a.count);
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(count) || count < 0) throw Error('モデルの属性を確認できません。');
  const data = a.isInterleavedBufferAttribute ? object(a.data) : a;
  const values = data.array as ArrayLike<number>;
  if (!values || !ArrayBuffer.isView(values)) throw Error('モデルの属性本体を確認できません。');
  const hash = new NativeSha256(), chunk = new Uint8Array(64 * 1024), view = new DataView(chunk.buffer); let used = 0;
  const add = (n: number) => {
    if (!Number.isFinite(n)) throw Error('モデルの属性が有限ではありません。');
    view.setFloat64(used, n || 0, true); used += 8;
    if (used === chunk.length) { hash.update(chunk); used = 0; }
  };
  for (let i = 0; i < count; i++) for (let c = 0; c < size; c++) {
    const get = a[['getX','getY','getZ','getW'][c]!] ?? a.getComponent;
    if (typeof get === 'function') add(Number(get.call(v, i, c)));
    else {
      if (a.normalized) throw Error('正規化属性の対応を確認できません。');
      add(Number(values[i * Number(data.stride ?? size) + Number(a.offset ?? 0) + c]));
    }
  }
  if (used) hash.update(chunk.subarray(0, used));
  return [values.constructor.name, a.normalized === true, size, count, hash.digestHex()];
}
function geometry(v: unknown): string {
  const g = object(v), attrs = object(g.attributes), morph = object(g.morphAttributes ?? {}), range = object(g.drawRange);
  const total = g.index ? Number(object(g.index).count) : Number(object(attrs.position).count);
  const start = Number(range.start), requested = Number(range.count);
  const end = requested === Infinity ? total : Math.min(total, start + requested);
  return textHash([Object.keys(attrs).sort().map(k => [k, attribute(attrs[k])]), g.index ? attribute(g.index) : null,
    Object.keys(morph).sort().map(k => [k, array(morph[k]).map(attribute)]), g.morphTargetsRelative === true,
    array(g.groups).map(x => { const r = object(x); return [r.start, r.count === Infinity ? 'all' : r.count, r.materialIndex]; }),
    [start, end]]);
}
function material(v: unknown, keys?: readonly string[]): { digest: string; keys: readonly string[] } {
  const m = object(v), selected = keys ?? Object.keys(m).filter(k => !ignoredMaterial.has(k) && typeof m[k] !== 'function').sort();
  if (keys) {
    const extra = Object.keys(m).filter(k => !ignoredMaterial.has(k) && !keys.includes(k) && typeof m[k] !== 'function');
    if (extra.length) {
      const Constructor = m.constructor as new () => { dispose(): void };
      const defaults = new Constructor();
      try { for (const k of extra) if (JSON.stringify(plain(m[k])) !== JSON.stringify(plain(object(defaults)[k]))) throw Error('新しい材質の解釈を確認できません。'); }
      finally { defaults.dispose(); }
    }
  }
  return { keys: [...selected], digest: textHash(selected.map(k => [k, plain(m[k])])) };
}

export interface NeutralTarget {
  readonly kind: 'mesh' | 'points' | 'line'; readonly childPath: readonly number[]; readonly namePath: readonly string[];
  readonly nativeKey: string; readonly v1Key: string; readonly slot: number; readonly materialName: string;
  readonly opacity: number; readonly side: number; readonly transparent: boolean; readonly depthWrite: boolean;
  readonly geometry: string; readonly material: string; readonly materialKeys: readonly string[];
  readonly world: readonly number[]; readonly pose: string;
}
export interface NeutralTargetTable { readonly rows: readonly NeutralTarget[]; readonly scene: string }
function inheritedState(node: unknown): unknown {
  let visible = true, groupOrder = 0; const chain: Fields[] = [];
  for (let n: unknown = node; n; n = object(n).parent) chain.unshift(object(n));
  for (const n of chain) { visible &&= n.visible !== false; if (n.isGroup) groupOrder = Number(n.renderOrder); }
  return [visible,groupOrder];
}
export function snapshotTargets(root: unknown, expected?: readonly NeutralTarget[], descend = true): NeutralTargetTable {
  const r = object(root); if (typeof r.updateMatrixWorld !== 'function') throw Error('モデルの配置を確認できません。');
  if (descend) r.updateMatrixWorld.call(root, true);
  const rows: NeutralTarget[] = [], lights: unknown[] = [], geometries = new WeakMap<object, string>();
  const visit = (node: unknown, path: number[], names: string[]) => {
    const n = object(node), kind = n.isMesh ? 'mesh' : n.isPoints ? 'points' : n.isLine ? 'line' : null;
    if (n.isLight) lights.push([n.type, inheritedState(node), numbers(object(n.matrixWorld).elements),
      ['color','groundColor','intensity','distance','decay','angle','penumbra','width','height','castShadow'].map(k => [k,plain(n[k])]),
      n.target ? numbers(object(object(n.target).matrixWorld).elements) : null,
      n.shadow ? ['bias','normalBias','radius','mapSize'].map(k => [k,plain(object(n.shadow)[k])]) : null]);
    if (kind) {
      const g = object(n.geometry); let gd = geometries.get(g);
      if (!gd) { gd = geometry(g); geometries.set(g, gd); }
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      const pose = textHash([n.isLineSegments === true,n.isLineLoop === true,n.isSkinnedMesh === true,n.isInstancedMesh === true,
        inheritedState(node), n.castShadow, n.receiveShadow, n.renderOrder, object(n.layers).mask,
        plain(n.morphTargetInfluences), n.bindMode ?? null, n.bindMatrix ? numbers(object(n.bindMatrix).elements) : null,
        n.bindMatrixInverse ? numbers(object(n.bindMatrixInverse).elements) : null,
        n.skeleton ? array(object(n.skeleton).bones).map(b => numbers(object(object(b).matrixWorld).elements)) : null,
        n.skeleton ? array(object(n.skeleton).boneInverses).map(b => numbers(object(b).elements)) : null,
        n.instanceMatrix ? attribute(n.instanceMatrix) : null, n.instanceColor ? attribute(n.instanceColor) : null, n.count ?? null]);
      mats.forEach((m, slot) => {
        const md = material(m, expected?.[rows.length]?.materialKeys), f = object(m);
        rows.push({ kind, childPath: [...path], namePath: [...names], nativeKey: `m/${path.length ? path.join('.') : 'root'}/${slot}`,
          v1Key: `m/${names.join('|')}/${slot}`, slot, materialName: String(f.name), opacity: Number(f.opacity), side: Number(f.side),
          transparent: f.transparent === true, depthWrite: f.depthWrite === true, geometry: gd!, material: md.digest, materialKeys: md.keys,
          world: numbers(object(n.matrixWorld).elements), pose });
      });
    }
    if (descend) array(n.children).forEach((child, i) => {
      const name = String(object(child).name);
      visit(child, [...path,i], [...names,name !== '' ? name : `#${i}`]);
    });
  };
  visit(root, [], []); return { rows, scene:textHash(lights) };
}
export function assertTargetRows(old: readonly NeutralTarget[], current: readonly NeutralTarget[], keys = true): void {
  const project = (rows: readonly NeutralTarget[]) => rows.map(r => keys ? r :
    ({ geometry:r.geometry, material:r.material, materialKeys:r.materialKeys, world:r.world, pose:r.pose }));
  if (JSON.stringify(project(old)) !== JSON.stringify(project(current))) throw Error('元の面・材質と表示の対応を確認できません。');
}
export function assertTargetTables(old: NeutralTargetTable, current: NeutralTargetTable): void {
  if (old.scene !== current.scene) throw Error('元の照明と表示の対応を確認できません。');
  assertTargetRows(old.rows,current.rows);
}
