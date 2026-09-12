import * as THREE from 'three';

export interface HardChroma { readonly keyColorSrgb: readonly number[]; readonly tolerance: number }
const settings = new WeakMap<THREE.Material, HardChroma>();
export const hardChroma = (material: THREE.Material) => settings.get(material);
const colorToken = '#include <color_fragment>', endToken = '#include <dithering_fragment>';
const declarations = 'uniform vec3 lvHardKey;\nuniform float lvHardTolerance;\n';
const coverage = '\nif (distance(diffuseColor.rgb, lvHardKey) / sqrt(3.0) <= lvHardTolerance) discard;\n';

/** Exact binary pre-lighting coverage; only call on an owned, opaque source clone. */
export function patchHardChroma(material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, input: HardChroma, coverageOnly = false) {
  if (settings.has(material) || input.keyColorSrgb.length !== 3 ||
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
  const setting = hardChroma(material);
  if (!setting || !(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial))
    throw Error('この面の色の透過を確認できません。');
  const clone = material.clone(); patchHardChroma(clone, setting, true);
  clone.blending = THREE.NoBlending; clone.depthTest = false; clone.depthWrite = false;
  return clone;
}
