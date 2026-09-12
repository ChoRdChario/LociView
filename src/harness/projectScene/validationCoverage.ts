import * as THREE from 'three';
import { hardChromaCoverageMaterial } from '../../viewer/hardChroma';
import type { PickCoverage } from './viewportPicking';

export interface CoveragePixel { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly ndc: THREE.Vector2 }
/** Bottom-origin drawing-buffer pixel and its exact center; not CSS or MSAA edge coverage. */
export function coveragePixel(x: number, y: number, cssWidth: number, cssHeight: number, size: THREE.Vector2): CoveragePixel | null {
  if (![x, y, cssWidth, cssHeight, size.x, size.y].every(Number.isFinite) || cssWidth <= 0 || cssHeight <= 0 ||
    !Number.isSafeInteger(size.x) || !Number.isSafeInteger(size.y) || size.x < 1 || size.y < 1 || x < 0 || y < 0 || x >= cssWidth || y >= cssHeight) return null;
  const px = Math.min(size.x - 1, Math.floor(x * size.x / cssWidth)), top = Math.min(size.y - 1, Math.floor(y * size.y / cssHeight)), py = size.y - 1 - top;
  return { x: px, y: py, width: size.x, height: size.y, ndc: new THREE.Vector2(2 * (px + 0.5) / size.x - 1, 2 * (py + 0.5) / size.y - 1) };
}
/** Own only three vertices, including normalized/interleaved UV/color contributions. */
export function coverageTriangle(hit: THREE.Intersection<THREE.Object3D>) {
  if (!(hit.object instanceof THREE.Mesh) || !hit.face || !Number.isSafeInteger(hit.faceIndex)) throw Error('対象の面を確認できません。');
  const source = hit.object.geometry as THREE.BufferGeometry, geometry = new THREE.BufferGeometry(), vertices = [hit.face.a, hit.face.b, hit.face.c];
  try {
    if (Object.keys(source.morphAttributes).length || (hit.object as THREE.SkinnedMesh).isSkinnedMesh) throw Error('この面の位置を確認できません。');
    for (const [name, attribute] of Object.entries(source.attributes)) {
      if (vertices.some(i => !Number.isSafeInteger(i) || i < 0 || i >= attribute.count)) throw Error('対象の頂点を確認できません。');
      const values: number[] = [];
      for (const index of vertices) for (let component = 0; component < attribute.itemSize; component++) values.push(attribute.getComponent(index, component));
      if (!values.every(Number.isFinite)) throw Error('対象の頂点を確認できません。');
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
    }
    return geometry;
  } catch (error) { geometry.dispose(); throw error; }
}

/** Boolean only. CPU retains target/position; never read IDs or reconstruct GPU depth. */
export function createValidationCoverage(renderer: THREE.WebGLRenderer) {
  const target = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  const scene = new THREE.Scene(), materials = new Map<THREE.Material, THREE.Material>();
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; target.dispose(); for (const m of materials.values()) m.dispose(); materials.clear(); };
  return { dispose, begin(camera: THREE.Camera, pixel: CoveragePixel, failed: (error: unknown) => void): PickCoverage {
    let count = 0, invalid = false;
    const cache = new Map<string, 'covered' | 'discarded'>();
    return (hit, source) => {
      if (invalid) return 'unknown';
      const key = `${hit.object.uuid}:${hit.faceIndex}:${source.uuid}`, previous = cache.get(key); if (previous) return previous;
      let geometry: THREE.BufferGeometry | undefined, mesh: THREE.Mesh | undefined;
      const priorTarget = renderer.getRenderTarget(), cube = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
      const clear = renderer.getClearColor(new THREE.Color()).clone(), alpha = renderer.getClearAlpha(), auto = renderer.autoClear;
      const xr = renderer.xr.enabled, shadow = renderer.shadowMap.autoUpdate, checkErrors = renderer.debug.checkShaderErrors, onError = renderer.debug.onShaderError;
      let shaderError = false;
      try {
        if (disposed) throw Error('3D表示を再試行してください。');
        if (++count > 128) throw Error('面が重なりすぎて位置を確認できません。視点を変えて再試行してください。');
        const gl = renderer.getContext();
        if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw Error('描画環境を確認できません。3D表示を再試行してください。');
        geometry = coverageTriangle(hit);
        let material = materials.get(source);
        if (!material) { material = hardChromaCoverageMaterial(source); materials.set(source, material); }
        mesh = new THREE.Mesh(geometry, material); mesh.matrix.copy(hit.object.matrixWorld); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; scene.add(mesh);
        const tileX = pixel.x - pixel.x % 2, tileY = pixel.y - pixel.y % 2;
        target.viewport.set(-tileX, -tileY, pixel.width, pixel.height); target.scissorTest = false;
        renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.autoClear = false;
        renderer.debug.checkShaderErrors = true;
        renderer.debug.onShaderError = (...args) => { shaderError = true; onError?.(...args); };
        renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear(true, false, false); renderer.render(scene, camera);
        const output = new Uint8Array([31, 47, 59, 71]);
        renderer.readRenderTargetPixels(target, pixel.x % 2, pixel.y % 2, 1, 1, output);
        if (shaderError || gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw Error('色の透過を確認できません。3D表示を再試行してください。');
        const result = output.every(v => v === 0) ? 'discarded' : output[0] === 255 && output[1] === 0 && output[2] === 255 && output[3] === 255 ? 'covered' : null;
        if (!result) throw Error('この位置の見え方を確認できません。視点を変えて再試行してください。');
        cache.set(key, result); return result;
      } catch (error) {
        // A failed program must not be reused on retry without another compile check.
        for (const material of materials.values()) material.dispose(); materials.clear();
        invalid = true; failed(error); return 'unknown';
      }
      finally {
        if (mesh) scene.remove(mesh); geometry?.dispose();
        renderer.debug.checkShaderErrors = checkErrors; renderer.debug.onShaderError = onError;
        renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = shadow; renderer.autoClear = auto;
        renderer.setClearColor(clear, alpha); renderer.setRenderTarget(priorTarget, cube, mip);
      }
    };
  } };
}
