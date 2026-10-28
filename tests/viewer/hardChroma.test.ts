import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { patchBinaryMask, binaryMask, hasBinaryCoverage, patchHardChroma, hardChroma, hardChromaCoverageMaterial } from '../../src/viewer/hardChroma';
import { coveragePixel, coverageTriangle, createValidationCoverage } from '../../src/harness/projectScene/validationCoverage';

const settings = { keyColorSrgb: [0.2, 0.4, 0.6], tolerance: 0.1 };
function candidate(material = new THREE.MeshStandardMaterial()) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0, 0, 1, -1], 3));
  geometry.setIndex([2, 0, 1, 2, 1, 3]);
  geometry.setAttribute('uv1', new THREE.Uint16BufferAttribute([0, 65535, 65535, 65535, 32768, 0, 0, 0], 2, true));
  geometry.setAttribute('color', new THREE.Uint8BufferAttribute([255, 0, 127, 255, 0, 255, 0, 255, 127, 255, 255, 255, 0, 0, 0, 255], 4, true));
  const object = new THREE.Mesh(geometry, material); object.position.set(3, 4, 5); object.updateMatrixWorld(true);
  const hit = { object, face: { a: 2, b: 0, c: 1, normal: new THREE.Vector3(0, 0, 1), materialIndex: 0 }, faceIndex: 0,
    distance: 2, point: new THREE.Vector3(3, 4, 5) } as THREE.Intersection<THREE.Object3D>;
  return { hit, geometry, material };
}
/** Records orchestration/errors only. Does not emulate or prove GPU filtering/raster output. */
class CoverageRenderer {
  target: THREE.WebGLRenderTarget | null = new THREE.WebGLRenderTarget(7, 9);
  autoClear = true; xr = { enabled: true }; shadowMap = { autoUpdate: true };
  debug = { checkShaderErrors: false, onShaderError: vi.fn() };
  clearColor = new THREE.Color('#789abc'); alpha = 0.3; rendered = false;
  mode = 'covered'; views: THREE.Vector4[] = []; cameras: THREE.Camera[] = []; triangles: THREE.BufferGeometry[] = []; matrices: THREE.Matrix4[] = [];
  cube = 3; mip = 1; renders = 0; queryMaterials: THREE.Material[] = [];
  getRenderTarget() { return this.target; } getActiveCubeFace() { return this.cube; } getActiveMipmapLevel() { return this.mip; }
  getClearColor(out: THREE.Color) { return out.copy(this.clearColor); } getClearAlpha() { return this.alpha; }
  getContext() { return { NO_ERROR: 0, isContextLost: () => this.rendered && this.mode === 'lost',
    getError: () => this.rendered && this.mode === 'gl-error' ? 1282 : 0 }; }
  setRenderTarget(target: THREE.WebGLRenderTarget | null, cube = 0, mip = 0) { this.target = target; this.cube = cube; this.mip = mip; }
  setClearColor(color: THREE.ColorRepresentation, alpha: number) { this.clearColor.set(color); this.alpha = alpha; }
  clear() {}
  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.rendered = true; this.renders++; this.views.push(this.target!.viewport.clone()); this.cameras.push(camera);
    const mesh = scene.children[0] as THREE.Mesh; this.triangles.push(mesh.geometry); this.matrices.push(mesh.matrix.clone()); this.queryMaterials.push(mesh.material as THREE.Material);
    if (this.mode === 'compile') this.debug.onShaderError();
  }
  readRenderTargetPixels(_target: unknown, _x: number, _y: number, _w: number, _h: number, out: Uint8Array) {
    if (this.mode === 'throw') throw Error('injected readback');
    if (this.mode !== 'untouched') out.set(this.mode === 'discarded' ? [0, 0, 0, 0] : [255, 0, 255, 255]);
  }
}
describe('hard-chroma shader and coverage protocol (no GPU/device acceptance)', () => {
  it('patches Standard/Basic after texture and vertex color, with exact binary linear boundary and independent probe hooks', () => {
    for (const original of [new THREE.MeshStandardMaterial({ roughness: 0.7 }), new THREE.MeshBasicMaterial()]) {
      original.map = new THREE.Texture(); original.color.setRGB(0.25, 0.5, 0.75); original.vertexColors = true;
      const material = original.clone(); patchHardChroma(material, settings);
      const shader = { uniforms: {}, fragmentShader: original instanceof THREE.MeshStandardMaterial ? THREE.ShaderLib.standard.fragmentShader : THREE.ShaderLib.basic.fragmentShader };
      material.onBeforeCompile(shader as any, {} as THREE.WebGLRenderer);
      expect(shader.fragmentShader).toContain('#include <color_fragment>\nif (distance(diffuseColor.rgb, lvHardKey) / sqrt(3.0) <= lvHardTolerance) discard;');
      expect(shader.fragmentShader.indexOf('discard;')).toBeLessThan(shader.fragmentShader.indexOf('#include <tonemapping_fragment>'));
      expect((shader.uniforms as any).lvHardKey.value).toEqual(new THREE.Color().setRGB(0.2, 0.4, 0.6, THREE.SRGBColorSpace));
      expect(material.transparent).toBe(false); expect(material.depthWrite).toBe(true); expect(material.opacity).toBe(1);
      expect(material.map).toBe(original.map); expect(material.color).toEqual(original.color); expect(hardChroma(original)).toBeUndefined();
      const query = hardChromaCoverageMaterial(material), clonedShader = { ...shader, uniforms: {}, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
      query.onBeforeCompile(clonedShader as any, {} as THREE.WebGLRenderer);
      expect(clonedShader.fragmentShader).toContain('gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0)');
      expect(query.customProgramCacheKey()).not.toBe(material.customProgramCacheKey()); expect(hardChroma(query)).toEqual(settings);
      query.dispose(); material.dispose(); original.dispose(); original.map.dispose();
    }
  });
  it('shares the composed mask predicate with its owned GPU probe and preserves cutoff zero', () => {
    for (const material of [new THREE.MeshStandardMaterial(), new THREE.MeshBasicMaterial()]) {
      const source = material.clone(), input = { opacity: 0, cutoff: 0, chroma: { ...settings, softness: 0.3 } };
      patchBinaryMask(material, input);
      const shader = { uniforms: {}, fragmentShader: (material instanceof THREE.MeshStandardMaterial ? THREE.ShaderLib.standard : THREE.ShaderLib.basic).fragmentShader };
      material.onBeforeCompile(shader as any, {} as THREE.WebGLRenderer);
      expect(shader.fragmentShader).toContain('clamp(lvMaskOpacity * lvChromaCoverage, 0.0, 1.0) < lvMaskCutoff');
      expect(shader.fragmentShader).toContain('diffuseColor.a = 1.0;');
      expect(shader.fragmentShader.indexOf('float lvChromaCoverage')).toBeLessThan(shader.fragmentShader.indexOf('#include <alphatest_fragment>'));
      const query = hardChromaCoverageMaterial(material), probe = { uniforms: {}, fragmentShader: (material instanceof THREE.MeshStandardMaterial ? THREE.ShaderLib.standard : THREE.ShaderLib.basic).fragmentShader };
      query.onBeforeCompile(probe as any, {} as THREE.WebGLRenderer);
      expect(probe.uniforms).toEqual(shader.uniforms); expect(binaryMask(query)).toEqual(input);
      expect(hasBinaryCoverage(query)).toBe(true); expect(hasBinaryCoverage(source)).toBe(false);
      expect(probe.fragmentShader).toContain('gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0)');
      expect(material.opacity).toBe(1); expect(material.transparent).toBe(false); expect(material.depthWrite).toBe(true);
      expect(binaryMask(material)).not.toBe(input); expect(binaryMask(material)!.chroma!.keyColorSrgb).not.toBe(input.chroma.keyColorSrgb);
      expect(() => patchBinaryMask(material, input)).toThrow();
      query.dispose(); material.dispose(); source.dispose();
    }
  });
  it('uses exact drawing-buffer centers and owns just the addressed triangle with normalized UV1/color attributes', () => {
    const pixel = coveragePixel(321.25, 100.5, 640.5, 480.25, new THREE.Vector2(1001, 751))!;
    expect(pixel.x).toBe(Math.floor(321.25 * 1001 / 640.5)); expect(pixel.y).toBe(750 - Math.floor(100.5 * 751 / 480.25));
    expect(pixel.ndc.x).toBe(2 * (pixel.x + 0.5) / 1001 - 1); expect(pixel.ndc.y).toBe(2 * (pixel.y + 0.5) / 751 - 1);
    expect(coveragePixel(640.5, 0, 640.5, 480.25, new THREE.Vector2(1001, 751))).toBeNull();
    const { hit, geometry } = candidate(), own = coverageTriangle(hit);
    expect(own.getAttribute('position').count).toBe(3); expect(own.index).toBeNull();
    expect(Array.from(own.getAttribute('position').array)).toEqual([0, 1, 0, -1, -1, 0, 1, -1, 0]);
    expect(own.getAttribute('color').getX(0)).toBeCloseTo(127 / 255); expect(own.getAttribute('uv1').getX(0)).toBeCloseTo(32768 / 65535);
    expect(own.getAttribute('color').array).not.toBe(geometry.getAttribute('color').array);
    own.dispose(); expect(geometry.getAttribute('position').count).toBe(4); geometry.dispose();
  });
  it('composes authored MASK after texture/vertex/alpha-map contributions and reapplies captured source opacity to the probe', () => {
    for (const original of [new THREE.MeshStandardMaterial(),new THREE.MeshBasicMaterial(),new THREE.MeshPhongMaterial()]) {
      original.opacity=.8;original.alphaTest=.5;
      const material=original.clone(),input={opacity:.7,cutoff:0,sourceMask:{opacity:original.opacity,cutoff:original.alphaTest}};
      patchBinaryMask(material,input);input.sourceMask.opacity=.1;
      const source=original instanceof THREE.MeshStandardMaterial?THREE.ShaderLib.standard:original instanceof THREE.MeshPhongMaterial?THREE.ShaderLib.phong:THREE.ShaderLib.basic;
      const compile=(m:THREE.Material)=>{const shader={uniforms:{},fragmentShader:source.fragmentShader};m.onBeforeCompile(shader as any,{} as THREE.WebGLRenderer);return shader;};
      const shader=compile(material),query=hardChromaCoverageMaterial(material),probe=compile(query);
      const predicate='float lvSourceCoverage = diffuseColor.a >= lvSourceCutoff ? 1.0 : 0.0;';
      expect(shader.fragmentShader).toContain('#include <alphamap_fragment>\n'+predicate);
      expect(shader.fragmentShader).toContain('clamp(lvSourceCoverage * lvMaskOpacity * lvChromaCoverage, 0.0, 1.0) < lvMaskCutoff');
      expect(shader.fragmentShader.indexOf('discard;')).toBeGreaterThan(shader.fragmentShader.indexOf(predicate));
      expect((shader.uniforms as any).lvMaskCutoff.value).toBe(0);expect((shader.uniforms as any).lvSourceCutoff.value).toBe(.5);
      expect(probe.uniforms).toEqual(shader.uniforms);expect(binaryMask(query)).toEqual(binaryMask(material));
      expect(material.opacity).toBe(.8);expect(query.opacity).toBe(.8);expect(material.alphaTest).toBe(0);expect(query.alphaTest).toBe(0);
      expect(original.alphaTest).toBe(.5);expect(original.opacity).toBe(.8);expect(hasBinaryCoverage(original)).toBe(false);
      const opaque=original.clone();patchBinaryMask(opaque,{opacity:1,cutoff:0});expect(opaque.customProgramCacheKey()).not.toBe(material.customProgramCacheKey());
      expect(Object.isFrozen(binaryMask(material)!.sourceMask)).toBe(true);
      query.dispose();opaque.dispose();material.dispose();original.dispose();
    }
    for(const sourceMask of [{opacity:NaN,cutoff:.5},{opacity:.8,cutoff:-1},{opacity:2,cutoff:.5}]){
      const m=new THREE.MeshBasicMaterial();expect(()=>patchBinaryMask(m,{opacity:1,cutoff:.5,sourceMask})).toThrow('切り抜き');expect(hasBinaryCoverage(m)).toBe(false);m.dispose();
    }
  });
  it('queries only the addressed face with an even-origin translated viewport and restores/disposes its own state', () => {
    const renderer = new CoverageRenderer(), before = { target: renderer.target, clear: renderer.clearColor.clone(), onError: renderer.debug.onShaderError };
    const { hit, material, geometry } = candidate(); patchHardChroma(material, settings);
    const map = material.map = new THREE.Texture(), textureDispose = vi.spyOn(map, 'dispose');
    const probe = createValidationCoverage(renderer as unknown as THREE.WebGLRenderer), camera = new THREE.PerspectiveCamera(), failed = vi.fn();
    const pixel = coveragePixel(26, 73, 100, 100, new THREE.Vector2(201, 201))!;
    const read = probe.begin(camera, pixel, failed);
    expect(read(hit, material)).toBe('covered'); expect(read(hit, material)).toBe('covered'); expect(renderer.renders).toBe(1);
    expect(renderer.views[0]!.toArray()).toEqual([-(pixel.x - pixel.x % 2), -(pixel.y - pixel.y % 2), 201, 201]);
    expect(renderer.cameras[0]).toBe(camera); expect(renderer.matrices[0]).toEqual(hit.object.matrixWorld);
    expect(renderer.triangles[0]!.getAttribute('position').count).toBe(3); expect(renderer.target).toBe(before.target);
    expect(renderer.clearColor).toEqual(before.clear); expect(renderer.alpha).toBe(0.3); expect(renderer.cube).toBe(3); expect(renderer.mip).toBe(1);
    expect(renderer.autoClear && renderer.xr.enabled && renderer.shadowMap.autoUpdate).toBe(true); expect(renderer.debug.onShaderError).toBe(before.onError);
    renderer.mode = 'discarded'; expect(probe.begin(camera, pixel, failed)(hit, material)).toBe('discarded'); expect(failed).not.toHaveBeenCalled();
    const queryDispose = vi.spyOn(renderer.queryMaterials[0]!, 'dispose'); probe.dispose(); probe.dispose(); expect(queryDispose).toHaveBeenCalledOnce(); expect(textureDispose).not.toHaveBeenCalled();
    geometry.dispose(); material.dispose(); map.dispose(); before.target!.dispose();
  });
  it('treats compile/context/readback errors and exhausted work as unknown, never an invisible foreground', () => {
    for (const mode of ['compile', 'lost', 'gl-error', 'throw', 'untouched']) {
      const renderer = new CoverageRenderer(), old = renderer.target, failed = vi.fn(); renderer.mode = mode;
      const { hit, material, geometry } = candidate(); patchHardChroma(material, settings);
      const probe = createValidationCoverage(renderer as unknown as THREE.WebGLRenderer);
      const read = probe.begin(new THREE.PerspectiveCamera(), coveragePixel(5, 5, 10, 10, new THREE.Vector2(10, 10))!, failed);
      expect(read(hit, material), mode).toBe('unknown'); expect(read(hit, material), mode).toBe('unknown'); expect(failed).toHaveBeenCalledOnce();
      expect(renderer.target).toBe(old); expect(renderer.autoClear && renderer.xr.enabled && renderer.shadowMap.autoUpdate).toBe(true);
      probe.dispose(); geometry.dispose(); material.dispose(); old!.dispose();
    }
    const renderer = new CoverageRenderer(), failed = vi.fn(), material = new THREE.MeshStandardMaterial(); patchHardChroma(material, settings);
    const probe = createValidationCoverage(renderer as unknown as THREE.WebGLRenderer);
    const read = probe.begin(new THREE.PerspectiveCamera(), coveragePixel(5, 5, 10, 10, new THREE.Vector2(10, 10))!, failed);
    for (let i = 0; i < 129; i++) { const { hit, geometry } = candidate(material); expect(read(hit, material)).toBe(i < 128 ? 'covered' : 'unknown'); geometry.dispose(); }
    expect(failed).toHaveBeenCalledOnce(); expect(renderer.renders).toBe(128); probe.dispose(); material.dispose(); renderer.target!.dispose();
  });
});
