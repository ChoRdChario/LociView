import * as THREE from 'three';
import type { JsonObject } from '../domain/values';
import { inspectValidationPng, type PngDecoder } from './png';
import { inspectGlbMaterials } from './glbMaterials';
import { checkFileLimits, fileError, fileFields, fileInteger, fileList, fileNumber, fileObject, fileVector, limitedJson, type FileValidationLimits } from './validation';

export interface ValidatedGlb {
  readonly bytes: Uint8Array;
  readonly bounds: { min: number[]; max: number[] };
  readonly materials: readonly JsonObject[];
  readonly surfaceRanges: readonly JsonObject[];
}
/** Own container checks: legacy parseGlb accepts duplicate/truncated chunks and is not admission. */
export function validationGlbParts(bytes: Uint8Array, limits: FileValidationLimits) {
  checkFileLimits(limits);
  if (bytes.length < 28 || bytes.length > limits.maxFileBytes) return fileError('GLBの大きさが不正か、この検証の上限を超えています。');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== 0x46546c67 || v.getUint32(4, true) !== 2 || v.getUint32(8, true) !== bytes.length)
    return fileError('GLB 2.0のファイルを選択してください。');
  const size = v.getUint32(12, true), binOffset = 20 + size;
  if (v.getUint32(16, true) !== 0x4e4f534a || size % 4 || binOffset + 8 > bytes.length || v.getUint32(binOffset + 4, true) !== 0x004e4942)
    return fileError('GLBのJSONまたは本体が不足しています。');
  const binSize = v.getUint32(binOffset, true);
  if (binSize % 4 || binOffset + 8 + binSize !== bytes.length) return fileError('GLBの本体サイズが一致しません。');
  return { json: limitedJson(bytes.subarray(20, binOffset), limits), bin: bytes.subarray(binOffset + 8) };
}

/** Static core geometry/material facts from actual bytes; no file-name or fixture authority. */
export async function inspectValidationGlb(input: Uint8Array, limits: FileValidationLimits, decodePng?: PngDecoder): Promise<ValidatedGlb> {
  checkFileLimits(limits);
  if (input.length > limits.maxFileBytes) return fileError('GLBがこの検証の上限を超えています。');
  const bytes = input.slice(), { json: j, bin } = validationGlbParts(bytes, limits), max = limits.maxItems;
  fileFields(j, ['asset', 'scene', 'scenes', 'nodes', 'meshes', 'buffers', 'bufferViews', 'accessors', 'materials', 'textures', 'images', 'samplers', 'extensionsUsed', 'extensionsRequired']);
  const asset = fileObject(j.asset); fileFields(asset, ['version', 'minVersion', 'generator', 'copyright']);
  if (asset.version !== '2.0' || asset.minVersion !== undefined && asset.minVersion !== '2.0') return fileError('GLBのバージョンが未対応です。');
  const usedExtensions = fileList(j.extensionsUsed ?? [], max), required = fileList(j.extensionsRequired ?? [], max);
  if ([...usedExtensions, ...required].some(e => e !== 'KHR_materials_unlit') || required.some(e => !usedExtensions.includes(e)))
    return fileError('このGLB拡張にはまだ対応していません。');
  const buffers = fileList(j.buffers, 1); if (buffers.length !== 1) return fileError('GLB内の本体を確認してください。');
  const buffer = fileObject(buffers[0]); fileFields(buffer, ['byteLength']); const byteLength = fileInteger(buffer.byteLength);
  if (!byteLength || byteLength > bin.length || bin.length - byteLength > 3 || bin.subarray(byteLength).some(n => n !== 0)) return fileError('GLBの本体サイズが一致しません。');
  const views = fileList(j.bufferViews, max).map(raw => {
    const v = fileObject(raw); fileFields(v, ['buffer', 'byteOffset', 'byteLength', 'byteStride', 'target']);
    const offset = fileInteger(v.byteOffset ?? 0), length = fileInteger(v.byteLength), stride = fileInteger(v.byteStride ?? 0);
    if (v.buffer !== 0 || !length || offset + length > byteLength || stride && (stride < 4 || stride > 252 || stride % 4) ||
      v.target !== undefined && ![34962, 34963].includes(fileInteger(v.target))) return fileError('GLBのデータ範囲が不正です。');
    return { offset, length, stride };
  });
  let work = 0;
  const charge = (count: number) => { work += count; if (!Number.isSafeInteger(work) || work > limits.maxValues) fileError('モデルの検査量がこの検証の上限を超えています。'); };
  const components: Record<number, { bytes: number; read(v: DataView, offset: number): number }> = {
    5120: { bytes: 1, read: (v, o) => v.getInt8(o) }, 5121: { bytes: 1, read: (v, o) => v.getUint8(o) },
    5122: { bytes: 2, read: (v, o) => v.getInt16(o, true) }, 5123: { bytes: 2, read: (v, o) => v.getUint16(o, true) },
    5125: { bytes: 4, read: (v, o) => v.getUint32(o, true) }, 5126: { bytes: 4, read: (v, o) => v.getFloat32(o, true) },
  };
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const accessors = fileList(j.accessors, max).map(raw => {
    const a = fileObject(raw); fileFields(a, ['bufferView', 'byteOffset', 'componentType', 'count', 'type', 'normalized', 'min', 'max']);
    const view = views[fileInteger(a.bufferView)], componentType = fileInteger(a.componentType), c = components[componentType];
    const dimension = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[String(a.type)];
    if (!view || !c || !dimension || a.normalized !== undefined && typeof a.normalized !== 'boolean' || a.normalized === true && ![5120, 5121, 5122, 5123].includes(componentType))
      return fileError('このアクセサー形式には対応していません。');
    const offset = fileInteger(a.byteOffset ?? 0), count = fileInteger(a.count), width = c.bytes * dimension, stride = view.stride || width;
    if (!count || offset % c.bytes || (view.offset + offset) % c.bytes || stride < width || offset + (count - 1) * stride + width > view.length)
      return fileError('頂点データの範囲が不正です。');
    charge(count * dimension);
    const min = Array(dimension).fill(Infinity) as number[], maxValues = Array(dimension).fill(-Infinity) as number[];
    const read = (index: number, axis: number) => c.read(data, view.offset + offset + index * stride + axis * c.bytes);
    for (let i = 0; i < count; i++) for (let axis = 0; axis < dimension; axis++) {
      const n = fileNumber(read(i, axis)); min[axis] = Math.min(min[axis]!, n); maxValues[axis] = Math.max(maxValues[axis]!, n);
    }
    for (const [key, actual] of [['min', min], ['max', maxValues]] as const) if (a[key] !== undefined) {
      const declared = fileVector(a[key], dimension);
      if (declared.some((n, i) => Math.abs(n - actual[i]!) > 1e-6 * Math.max(1, Math.abs(n), Math.abs(actual[i]!)))) fileError('頂点データと宣言された範囲が一致しません。');
    }
    return { count, dimension, componentType, normalized: a.normalized === true, read };
  });
  const { materials, usedUVs } = inspectGlbMaterials(j, max);
  const images = fileList(j.images ?? [], max);
  for (const raw of images) {
    const image = fileObject(raw); fileFields(image, ['bufferView', 'mimeType']);
    const view = views[fileInteger(image.bufferView)];
    if (!view || view.stride || image.mimeType !== 'image/png') return fileError('内蔵画像はPNGのみ対応しています。');
    const dimensions = await inspectValidationPng(bin.subarray(view.offset, view.offset + view.length), limits, decodePng);
    charge(dimensions.width * dimensions.height);
  }
  let implicitMaterial = false;
  const meshes = fileList(j.meshes, max).map(raw => {
    const m = fileObject(raw); fileFields(m, ['primitives']);
    const primitives = fileList(m.primitives, max); if (!primitives.length) return fileError('モデルに面がありません。');
    return primitives.map(raw => {
      const p = fileObject(raw); fileFields(p, ['attributes', 'indices', 'material', 'mode']);
      if ((p.mode ?? 4) !== 4) return fileError('この検証版は三角形のMeshのみ対応しています。');
      const attrs = fileObject(p.attributes); fileFields(attrs, ['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0']);
      const positions = accessors[fileInteger(attrs.POSITION)];
      if (!positions || positions.dimension !== 3 || positions.componentType !== 5126 || positions.normalized) return fileError('頂点座標が不正です。');
      for (const [key, rawIndex] of Object.entries(attrs)) {
        const a = accessors[fileInteger(rawIndex)], dims = key === 'POSITION' || key === 'NORMAL' ? [3] : key === 'TANGENT' ? [4] : key === 'COLOR_0' ? [3, 4] : [2];
        if (!a || a.count !== positions.count || !dims.includes(a.dimension) ||
          (key === 'POSITION' || key === 'NORMAL' || key === 'TANGENT' ? a.componentType !== 5126 || a.normalized :
            a.componentType !== 5126 && !([5121, 5123].includes(a.componentType) && a.normalized))) return fileError('頂点属性が不正です。');
      }
      let count = positions.count;
      if (p.indices !== undefined) {
        const a = accessors[fileInteger(p.indices)];
        if (!a || a.dimension !== 1 || ![5121, 5123, 5125].includes(a.componentType) || a.normalized) return fileError('面の参照が不正です。');
        charge(a.count);
        for (let i = 0; i < a.count; i++) if (a.read(i, 0) >= positions.count) return fileError('面が存在しない頂点を参照しています。');
        count = a.count;
      }
      if (!count || count % 3) return fileError('三角形の頂点数が不正です。');
      const material = p.material === undefined ? undefined : fileInteger(p.material);
      if (material !== undefined && !materials[material]) return fileError('面のマテリアルがありません。');
      if (material === undefined) implicitMaterial = true;
      if (usedUVs(material).some(n => attrs[`TEXCOORD_${n}`] === undefined)) return fileError('テクスチャ用のUV座標がありません。');
      return { positions, triangleCount: count / 3 };
    });
  });
  const nodes = fileList(j.nodes, max).map(raw => {
    const n = fileObject(raw); fileFields(n, ['mesh', 'children', 'matrix', 'translation', 'rotation', 'scale']);
    const mesh = n.mesh === undefined ? undefined : fileInteger(n.mesh); if (mesh !== undefined && !meshes[mesh]) return fileError('ノードのモデル参照が不正です。');
    const matrix = new THREE.Matrix4();
    if (n.matrix !== undefined) {
      if (['translation', 'rotation', 'scale'].some(k => n[k] !== undefined)) return fileError('ノードの変換が重複しています。');
      matrix.fromArray(fileVector(n.matrix, 16));
      if (matrix.elements[3] !== 0 || matrix.elements[7] !== 0 || matrix.elements[11] !== 0 || matrix.elements[15] !== 1) return fileError('ノードの行列が不正です。');
      const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); matrix.decompose(t, q, s);
      const rendered = new THREE.Matrix4().compose(t, q, s);
      if (rendered.elements.some((v, i) => !Number.isFinite(v) || Math.abs(v - matrix.elements[i]!) > 1e-10 * Math.max(1, Math.abs(v))))
        return fileError('この行列は表示時に形状を維持できません。変換を適用して書き出してください。');
      matrix.copy(rendered);
    } else {
      const t = fileVector(n.translation ?? [0, 0, 0], 3), q = fileVector(n.rotation ?? [0, 0, 0, 1], 4), s = fileVector(n.scale ?? [1, 1, 1], 3);
      if (Math.abs(q.reduce((sum, v) => sum + v * v, 0) - 1) > 1e-6) return fileError('ノードの回転が不正です。');
      matrix.compose(new THREE.Vector3().fromArray(t), new THREE.Quaternion().fromArray(q), new THREE.Vector3().fromArray(s));
    }
    const children = fileList(n.children ?? [], max).map(v => fileInteger(v));
    if (new Set(children).size !== children.length) return fileError('ノード参照が重複しています。');
    return { mesh, matrix, children };
  });
  const parent = new Set<number>();
  for (const node of nodes) for (const child of node.children) {
    if (!nodes[child] || parent.has(child)) return fileError('ノードの親が不正または重複しています。'); parent.add(child);
  }
  const scenes = fileList(j.scenes, max).map(raw => { const s = fileObject(raw); fileFields(s, ['nodes']); return fileList(s.nodes ?? [], max).map(v => fileInteger(v)); });
  const scene = j.scene === undefined ? scenes.length === 1 ? 0 : fileError('GLB内で開始シーンを指定してください。') : fileInteger(j.scene);
  if (!scenes[scene]) return fileError('開始シーンがありません。');
  const box = new THREE.Box3(), surfaceRanges: JsonObject[] = [], seen = new Set<number>();
  const visit = (id: number, parentMatrix: THREE.Matrix4, depth: number) => {
    if (depth > 256 || seen.has(id) || !nodes[id]) return fileError('ノードが循環しているか、参照が不正です。');
    seen.add(id); const n = nodes[id]!, world = parentMatrix.clone().multiply(n.matrix);
    if (world.elements.some(v => !Number.isFinite(v))) return fileError('モデルの座標が大きすぎます。');
    for (const [primitiveIndex, p] of (n.mesh === undefined ? [] : meshes[n.mesh]!).entries()) {
      charge(p.positions.count * 3);
      for (let i = 0; i < p.positions.count; i++) {
        const point = new THREE.Vector3(p.positions.read(i, 0), p.positions.read(i, 1), p.positions.read(i, 2)).applyMatrix4(world);
        if (point.toArray().some(v => !Number.isFinite(v))) return fileError('モデルの座標が大きすぎます。'); box.expandByPoint(point);
      }
      surfaceRanges.push({ kind: 'meshTriangle', nodeIndex: id, primitiveIndex, count: p.triangleCount });
    }
    n.children.forEach(child => visit(child, world, depth + 1));
  };
  for (const roots of scenes) if (new Set(roots).size !== roots.length || roots.some(id => !nodes[id] || parent.has(id))) return fileError('シーンのノード参照が不正です。');
  // Validate unused node trees too; they remain original content, not an ignored loophole.
  const state = new Uint8Array(nodes.length);
  const check = (id: number, depth: number) => { if (state[id] === 2) return; if (depth > 256 || state[id] === 1) return fileError('ノードが循環しています。');
    state[id] = 1; nodes[id]!.children.forEach(child => check(child, depth + 1)); state[id] = 2; };
  nodes.forEach((_, id) => check(id, 0));
  scenes[scene]!.forEach(id => visit(id, new THREE.Matrix4(), 0));
  if (!surfaceRanges.length || box.isEmpty()) return fileError('開始シーンに表示できる面がありません。');
  if (implicitMaterial) materials.push({ sourceLocator: { kind: 'representationMaterial', slotIndex: 0 },
    sourceSemantics: { coverage: { kind: 'opaque' }, optics: 'surface', lighting: 'lit', doubleSided: false } });
  return { bytes, bounds: { min: box.min.toArray().map(n => n || 0), max: box.max.toArray().map(n => n || 0) }, materials, surfaceRanges };
}
