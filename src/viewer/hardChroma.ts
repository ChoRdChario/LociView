import * as THREE from 'three';

export interface HardChroma { readonly keyColorSrgb: readonly number[]; readonly tolerance: number }
const settings = new WeakMap<THREE.Material, HardChroma>();
export const hardChroma = (material: THREE.Material) => settings.get(material);
export interface BinaryMask { readonly opacity: number; readonly cutoff: number;
  readonly chroma?: HardChroma & { readonly softness: number } }
const masks = new WeakMap<THREE.Material, BinaryMask>();
export const binaryMask = (material: THREE.Material) => masks.get(material);
export const hasBinaryCoverage = (material: THREE.Material) => settings.has(material) || masks.has(material);
const colorToken = '#include <color_fragment>', endToken = '#include <dithering_fragment>';
const declarations = 'uniform vec3 lvHardKey;\nuniform float lvHardTolerance;\n';
const coverage = '\nif (distance(diffuseColor.rgb, lvHardKey) / sqrt(3.0) <= lvHardTolerance) discard;\n';

/** Exact binary pre-lighting coverage; only call on an owned, opaque source clone. */
export function patchHardChroma(material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, input: HardChroma, coverageOnly = false) {
  if (hasBinaryCoverage(material) || input.keyColorSrgb.length !== 3 ||
    ![...input.keyColorSrgb, input.tolerance].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw Error('色の透過設定を確認してください。');
  const source = material instanceof THREE.MeshStandardMaterial ? THREE.ShaderLib.standard : THREE.ShaderLib.basic;
  const check = (text: string) => {
    if (text.split(colorToken).length !== 2 || text.split(endToken).length !== 2) throw Error('色の透過を描画できません。');
  };
  check(source.fragmentShader);
  const owned = Object.freeze({ keyColorSrgb: Object.freeze([...input.keyColorSrgb]), tolerance: input.tolerance });
  const key = new THREE.Color().setRGB(...owned.keyColorSrgb as [number, number, number], THREE.SRGBColorSpace);
  settings.set(material, owned);
  material.transparent = false; material.depthWrite = true; material.opacity = 1;
  material.onBeforeCompile = shader => {
    check(shader.fragmentShader);
    shader.uniforms.lvHardKey = { value: key }; shader.uniforms.lvHardTolerance = { value: owned.tolerance };
    shader.fragmentShader = declarations + shader.fragmentShader.replace(colorToken, colorToken + coverage);
    if (coverageOnly) shader.fragmentShader = shader.fragmentShader.replace(endToken, endToken + '\ngl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);\n');
  };
  material.customProgramCacheKey = () => `lociview-hard-chroma-1:${coverageOnly ? 'coverage' : 'color'}`;
  material.needsUpdate = true;
}

/** Clone() deliberately does not copy shader hooks. Reapply the identical predicate. */
export function hardChromaCoverageMaterial(material: THREE.Material) {
  const mask = binaryMask(material);
  if (mask && (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial)) {
    const clone = material.clone(); patchBinaryMask(clone, mask, true);
    clone.blending = THREE.NoBlending; clone.depthTest = false; clone.depthWrite = false;
    return clone;
  }
  const setting = hardChroma(material);
  if (!setting || !(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial))
    throw Error('この面の色の透過を確認できません。');
  const clone = material.clone(); patchHardChroma(clone, setting, true);
  clone.blending = THREE.NoBlending; clone.depthTest = false; clone.depthWrite = false;
  return clone;
}

/** Explicit mask on a proven opaque source. Compose before discarding, including cutoff zero. */
export function patchBinaryMask(material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, input: BinaryMask, coverageOnly = false) {
  if (hasBinaryCoverage(material) || ![input.opacity, input.cutoff, ...(input.chroma ?
    [...input.chroma.keyColorSrgb, input.chroma.tolerance, input.chroma.softness] : [])].every(n => Number.isFinite(n) && n >= 0 && n <= 1) ||
    input.chroma && input.chroma.keyColorSrgb.length !== 3) throw Error('切り抜きの設定を確認してください。');
  const owned: BinaryMask = Object.freeze({ opacity: input.opacity, cutoff: input.cutoff, ...(input.chroma ? {
    chroma: Object.freeze({ ...input.chroma, keyColorSrgb: Object.freeze([...input.chroma.keyColorSrgb]) }) } : {}) });
  const check = (text: string) => {
    if (text.split(colorToken).length !== 2 || text.split(endToken).length !== 2) throw Error('切り抜きを描画できません。');
  };
  check((material instanceof THREE.MeshStandardMaterial ? THREE.ShaderLib.standard : THREE.ShaderLib.basic).fragmentShader);
  const key = new THREE.Color().setRGB(...(owned.chroma?.keyColorSrgb ?? [0, 0, 0]) as [number, number, number], THREE.SRGBColorSpace);
  masks.set(material, owned); material.transparent = false; material.depthWrite = true; material.opacity = 1;
  material.onBeforeCompile = shader => {
    check(shader.fragmentShader);
    Object.assign(shader.uniforms, { lvMaskOpacity: { value: owned.opacity }, lvMaskCutoff: { value: owned.cutoff },
      lvMaskChroma: { value: owned.chroma ? 1 : 0 }, lvMaskKey: { value: key },
      lvMaskTolerance: { value: owned.chroma?.tolerance ?? 0 }, lvMaskSoftness: { value: owned.chroma?.softness ?? 0 } });
    const predicate = `
float lvChromaCoverage = 1.0;
if (lvMaskChroma > 0.5) {
  float lvDistance = distance(diffuseColor.rgb, lvMaskKey) / sqrt(3.0);
  if (lvMaskSoftness == 0.0) lvChromaCoverage = lvDistance <= lvMaskTolerance ? 0.0 : 1.0;
  else {
    float lvU = clamp((lvDistance - lvMaskTolerance) / lvMaskSoftness, 0.0, 1.0);
    lvChromaCoverage = lvU * lvU * (3.0 - 2.0 * lvU);
  }
}
if (clamp(lvMaskOpacity * lvChromaCoverage, 0.0, 1.0) < lvMaskCutoff) discard;
diffuseColor.a = 1.0;
`;
    shader.fragmentShader = 'uniform float lvMaskOpacity, lvMaskCutoff, lvMaskChroma, lvMaskTolerance, lvMaskSoftness;\nuniform vec3 lvMaskKey;\n' +
      shader.fragmentShader.replace(colorToken, colorToken + predicate);
    if (coverageOnly) shader.fragmentShader = shader.fragmentShader.replace(endToken, endToken + '\ngl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);\n');
  };
  material.customProgramCacheKey = () => `lociview-binary-mask-1:${coverageOnly ? 'coverage' : 'color'}`;
  material.needsUpdate = true;
}
