// マテリアルシェーダ拡張（unlit / クロマキー）— LociMyu viewer.module.cdn.js の移植
//
// LociMyu実装からの修正点:
//   クロマキーは <dithering_fragment> の直後で diffuseColor.a を変更していたが、
//   その時点では既に gl_FragColor が確定済み（opaque_fragment で書き出し済み）のため
//   透過が反映されない。LociViewでは gl_FragColor.a を直接操作して正しく効かせる。
//
// unlit は「ライティングを無視して素の色を出す」表示で、
// 図面的な見え方や、テクスチャの色をそのまま確認したい場面で使う。

import * as THREE from 'three';

export interface ChromaSettings {
  enable: boolean;
  color: string;
  tolerance: number;
  feather: number;
}

interface PatchUniforms {
  uUnlit: { value: number };
  uChromaEnable: { value: number };
  uChromaColor: { value: THREE.Color };
  uChromaTolerance: { value: number };
  uChromaFeather: { value: number };
}

interface PatchedMaterial extends THREE.Material {
  userData: {
    lvUniforms?: PatchUniforms;
    lvPatched?: boolean;
    [k: string]: unknown;
  };
}

const HEADER = `
uniform float uUnlit;
uniform float uChromaEnable;
uniform vec3  uChromaColor;
uniform float uChromaTolerance;
uniform float uChromaFeather;
`;

/** 素の色（ライティング前の拡散色）を退避してunlitで使う */
const CAPTURE_BASE = `
	vec3 lvBaseColor = diffuseColor.rgb;
`;

const CHROMA_AND_UNLIT = `
	if ( uChromaEnable > 0.5 ) {
		float lvDist = distance( lvBaseColor, uChromaColor );
		float lvAlpha = smoothstep( uChromaTolerance, uChromaTolerance + max( uChromaFeather, 0.0001 ), lvDist );
		gl_FragColor.a *= lvAlpha;
	}
	if ( uUnlit > 0.5 ) {
		gl_FragColor = vec4( lvBaseColor, gl_FragColor.a );
	}
`;

function supportsPatch(mat: THREE.Material): boolean {
  return (
    (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial === true ||
    (mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial === true ||
    (mat as THREE.MeshPhongMaterial).isMeshPhongMaterial === true ||
    (mat as THREE.MeshLambertMaterial).isMeshLambertMaterial === true
  );
}

/** マテリアルへunlit/クロマキー用のシェーダ拡張を注入する（冪等） */
export function patchMaterial(mat: THREE.Material): boolean {
  if (!supportsPatch(mat)) return false;
  const m = mat as PatchedMaterial;
  if (m.userData.lvPatched === true) return true;

  const uniforms: PatchUniforms = {
    uUnlit: { value: 0 },
    uChromaEnable: { value: 0 },
    uChromaColor: { value: new THREE.Color(0, 0, 0) },
    uChromaTolerance: { value: 0.1 },
    uChromaFeather: { value: 0 },
  };
  m.userData.lvUniforms = uniforms;
  m.userData.lvPatched = true;

  const prev = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    let src = shader.fragmentShader;
    if (src.includes('uChromaEnable')) return; // 二重注入の防御

    // uniform宣言
    src = src.includes('void main()') ? src.replace('void main()', `${HEADER}\nvoid main()`) : HEADER + src;

    // 素の色を退避（ライティング適用前）
    const tokenColor = '#include <color_fragment>';
    if (src.includes(tokenColor)) {
      src = src.replace(tokenColor, `${tokenColor}\n${CAPTURE_BASE}`);
    } else {
      // 万一includeが無い形でも動くよう、mapの直後にフォールバック
      const tokenMap = '#include <map_fragment>';
      if (src.includes(tokenMap)) src = src.replace(tokenMap, `${tokenMap}\n${CAPTURE_BASE}`);
      else return; // 退避できないなら注入しない（描画を壊さない）
    }

    // gl_FragColor 確定後に適用（opaque_fragment 以降ならどこでもよいが、
    // トーンマッピング前に置くことで unlit の色が他の後処理と整合する）
    const tokenTone = '#include <tonemapping_fragment>';
    if (src.includes(tokenTone)) {
      src = src.replace(tokenTone, `${CHROMA_AND_UNLIT}\n${tokenTone}`);
    } else {
      const tokenOpaque = '#include <opaque_fragment>';
      if (src.includes(tokenOpaque)) src = src.replace(tokenOpaque, `${tokenOpaque}\n${CHROMA_AND_UNLIT}`);
      else return;
    }

    shader.fragmentShader = src;
  };

  m.needsUpdate = true;
  return true;
}

export function setUnlit(mat: THREE.Material, on: boolean): void {
  if (!patchMaterial(mat)) return;
  const u = (mat as PatchedMaterial).userData.lvUniforms;
  if (u !== undefined) u.uUnlit.value = on ? 1 : 0;
}

export function setChroma(mat: THREE.Material, c: ChromaSettings | null): void {
  if (!patchMaterial(mat)) return;
  const u = (mat as PatchedMaterial).userData.lvUniforms;
  if (u === undefined) return;
  if (c === null || !c.enable) {
    u.uChromaEnable.value = 0;
    return;
  }
  u.uChromaEnable.value = 1;
  u.uChromaColor.value.set(c.color);
  u.uChromaTolerance.value = c.tolerance;
  u.uChromaFeather.value = c.feather;
  // クロマキーは透過を生むため、透明扱いにしないと背景が抜けない
  mat.transparent = true;
  mat.depthWrite = false;
}

export function getUnlit(mat: THREE.Material): boolean {
  return (mat as PatchedMaterial).userData?.lvUniforms?.uUnlit.value === 1;
}

export function getChroma(mat: THREE.Material): ChromaSettings | null {
  const u = (mat as PatchedMaterial).userData?.lvUniforms;
  if (u === undefined || u.uChromaEnable.value !== 1) return null;
  return {
    enable: true,
    color: `#${u.uChromaColor.value.getHexString()}`,
    tolerance: u.uChromaTolerance.value,
    feather: u.uChromaFeather.value,
  };
}
