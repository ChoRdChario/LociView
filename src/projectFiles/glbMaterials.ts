import type { JsonObject } from '../domain/values';
import { fileError, fileFields, fileInteger, fileList, fileNumber, fileObject, fileVector } from './validation';

export function inspectGlbMaterials(json: Record<string, unknown>, max: number) {
  const images = fileList(json.images ?? [], max), textures = fileList(json.textures ?? [], max), samplers = fileList(json.samplers ?? [], max);
  for (const raw of samplers) {
    const s = fileObject(raw); fileFields(s, ['magFilter', 'minFilter', 'wrapS', 'wrapT']);
    for (const [key, allowed] of Object.entries({ magFilter: [9728, 9729], minFilter: [9728, 9729, 9984, 9985, 9986, 9987], wrapS: [33071, 33648, 10497], wrapT: [33071, 33648, 10497] }))
      if (s[key] !== undefined && !allowed.includes(fileInteger(s[key]))) fileError('テクスチャの設定が不正です。');
  }
  for (const raw of textures) {
    const t = fileObject(raw); fileFields(t, ['source', 'sampler']);
    if (!images[fileInteger(t.source)] || t.sampler !== undefined && !samplers[fileInteger(t.sampler)]) fileError('テクスチャの参照先がありません。');
  }
  const textureInfo = (value: unknown, extra: 'scale' | 'strength' | null = null) => {
    const t = fileObject(value); fileFields(t, ['index', 'texCoord', ...(extra ? [extra] : [])]);
    if (!textures[fileInteger(t.index)] || t.texCoord !== undefined && fileInteger(t.texCoord) > 1) fileError('テクスチャの参照先またはUV座標が未対応です。');
    if (extra && t[extra] !== undefined) { const n = fileNumber(t[extra]); if (extra === 'strength' && (n < 0 || n > 1)) fileError('テクスチャの強度が不正です。'); }
  };
  const materialRows = fileList(json.materials ?? [], max);
  const materials: JsonObject[] = materialRows.map((raw, index): JsonObject => {
    const m = fileObject(raw); fileFields(m, ['pbrMetallicRoughness', 'normalTexture', 'occlusionTexture', 'emissiveTexture', 'emissiveFactor', 'alphaMode', 'alphaCutoff', 'doubleSided', 'extensions']);
    const ext = fileObject(m.extensions ?? {});
    if (Object.keys(ext).some(k => k !== 'KHR_materials_unlit') || ext.KHR_materials_unlit !== undefined && Object.keys(fileObject(ext.KHR_materials_unlit)).length)
      fileError('このマテリアル拡張にはまだ対応していません。');
    if (ext.KHR_materials_unlit !== undefined && !fileList(json.extensionsUsed ?? [], max).includes('KHR_materials_unlit'))
      fileError('マテリアル拡張の宣言が不足しています。');
    const pbr = fileObject(m.pbrMetallicRoughness ?? {}); fileFields(pbr, ['baseColorFactor', 'baseColorTexture', 'metallicFactor', 'roughnessFactor', 'metallicRoughnessTexture']);
    for (const [key, n] of [['baseColorFactor', 4], ['emissiveFactor', 3]] as const) {
      const v = key === 'baseColorFactor' ? pbr[key] : m[key];
      if (v !== undefined && fileVector(v, n).some(x => x < 0 || x > 1)) fileError('マテリアルの色が不正です。');
    }
    for (const key of ['metallicFactor', 'roughnessFactor']) if (pbr[key] !== undefined) {
      const n = fileNumber(pbr[key]); if (n < 0 || n > 1) fileError('マテリアルの値が不正です。');
    }
    for (const key of ['baseColorTexture', 'metallicRoughnessTexture']) if (pbr[key] !== undefined) textureInfo(pbr[key]);
    if (m.normalTexture !== undefined) textureInfo(m.normalTexture, 'scale');
    if (m.occlusionTexture !== undefined) textureInfo(m.occlusionTexture, 'strength');
    if (m.emissiveTexture !== undefined) textureInfo(m.emissiveTexture);
    const alpha = m.alphaMode ?? 'OPAQUE';
    if (!['OPAQUE', 'MASK', 'BLEND'].includes(alpha as string) || m.doubleSided !== undefined && typeof m.doubleSided !== 'boolean') fileError('面の表示設定が不正です。');
    const cutoff = fileNumber(m.alphaCutoff ?? 0.5); if (cutoff < 0 || cutoff > 1) fileError('透明度のしきい値が不正です。');
    return { sourceLocator: { kind: 'gltfMaterial', materialIndex: index }, sourceSemantics: {
      coverage: alpha === 'MASK' ? { kind: 'mask', alphaCutoff: cutoff } : { kind: alpha === 'BLEND' ? 'blend' : 'opaque' },
      optics: 'surface', lighting: ext.KHR_materials_unlit !== undefined ? 'unlit' : 'lit', doubleSided: m.doubleSided === true } };
  });
  const usedUVs = (material: number | undefined): number[] => {
    if (material === undefined) return [];
    const m = fileObject(materialRows[material]), pbr = fileObject(m.pbrMetallicRoughness ?? {});
    return [pbr.baseColorTexture, pbr.metallicRoughnessTexture, m.normalTexture, m.occlusionTexture, m.emissiveTexture]
      .filter(v => v !== undefined).map(v => fileInteger(fileObject(v).texCoord ?? 0));
  };
  return { materials, usedUVs };
}
