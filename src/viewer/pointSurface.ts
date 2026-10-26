import * as THREE from 'three';
import { binaryPointCapability, pointRegistrySnapshot, defaultPointProfile, resolvePointPresentation, type PointViewport } from '../domain/pointPresentation';

export interface ProjectedPointFrame { readonly centersCss: Float32Array; readonly depths: Float32Array; readonly eligible: Uint8Array; readonly depthBits: number }

/** Owned source centres and RGB only. The screen quad has no source triangle meaning. */
export function createPointSurface(positions: Float32Array, colors: Float32Array) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 1,-1,0, 1,1,0, -1,-1,0, 1,1,0, -1,1,0], 3));
  const projected = new Float32Array(positions.length), screens = new Float32Array(positions.length / 3 * 2), eligibility = new Uint8Array(positions.length / 3);
  const clipAttribute = new THREE.InstancedBufferAttribute(projected,3), screenAttribute = new THREE.InstancedBufferAttribute(screens,2);
  geometry.setAttribute('pointClip', clipAttribute); geometry.setAttribute('pointScreen', screenAttribute);
  geometry.setAttribute('pointColor', new THREE.InstancedBufferAttribute(colors, 3));
  geometry.instanceCount = positions.length / 3;
  const material = new THREE.ShaderMaterial({ transparent: false, depthTest: true, depthWrite: true, toneMapped: false,
    uniforms: { sampleOrigin: { value: new THREE.Vector2(0,0) }, cssSize: { value: new THREE.Vector2(1,1) }, bufferSize: { value: new THREE.Vector2(1,1) }, diameter: { value: 3 } },
    vertexShader: `attribute vec3 pointClip;
attribute vec2 pointScreen;
attribute vec3 pointColor;
uniform vec2 cssSize;
uniform vec2 bufferSize;
uniform float diameter;
varying vec2 centerCss;
varying vec3 sourceColor;
varying float eligible;
void main() {
  vec4 center = vec4(pointClip, 1.0);
  eligible = pointClip.z >= -1.0 && pointClip.z <= 1.0 ? 1.0 : 0.0;
  centerCss = pointScreen;
  sourceColor = pointColor;
  vec2 paddingCss = 2.0 * cssSize / bufferSize;
  gl_Position = center;
  gl_Position.xy += position.xy * (diameter * 0.5 + paddingCss) * 2.0 / cssSize * center.w;
}`,
    fragmentShader: `uniform vec2 sampleOrigin;
uniform vec2 cssSize;
uniform vec2 bufferSize;
uniform float diameter;
varying vec2 centerCss;
varying vec3 sourceColor;
varying float eligible;
void main() {
  vec2 fullPixel = gl_FragCoord.xy + sampleOrigin;
  vec2 sampleCss = vec2(fullPixel.x, bufferSize.y - fullPixel.y) * cssSize / bufferSize;
  if (eligible < 0.5 || distance(sampleCss, centerCss) > diameter * 0.5) discard;
  gl_FragColor = vec4(sourceColor, 1.0);
  #include <colorspace_fragment>
}` });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false;
  // These synthetic quads must never enter the Mesh-source raycaster.
  mesh.raycast = () => {};
  let resolvedDiameter = 3;
  let view: PointViewport = { cssWidth: 1, cssHeight: 1, devicePixelRatio: 1, renderScale: 1 }, frameKey = '', depthBits = 0;
  const frame: ProjectedPointFrame = { centersCss: screens, depths: projected, eligible: eligibility, get depthBits() { return depthBits; } };
  function project(camera: THREE.Camera, bits: number): ProjectedPointFrame {
    camera.updateMatrixWorld(true); mesh.updateWorldMatrix(true,false); depthBits = bits;
    const key = JSON.stringify([mesh.matrixWorld.elements,camera.matrixWorldInverse.elements,camera.projectionMatrix.elements,view]);
    if (key === frameKey) return frame;
    const world = new THREE.Vector3(), clip = new THREE.Vector4();
    for (let i=0;i<positions.length/3;i++) {
      world.fromArray(positions,i*3).applyMatrix4(mesh.matrixWorld);
      clip.set(world.x,world.y,world.z,1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      const valid = [clip.x,clip.y,clip.z,clip.w].every(Number.isFinite) && clip.w > 0 && clip.z >= -clip.w && clip.z <= clip.w;
      eligibility[i] = valid ? 1 : 0;
      // One owned Float32 projection is used by both drawing and picking. Raw positions never change.
      projected[i*3] = valid ? Math.fround(clip.x/clip.w) : 0; projected[i*3+1] = valid ? Math.fround(clip.y/clip.w) : 0; projected[i*3+2] = valid ? Math.fround(clip.z/clip.w) : 2;
      screens[i*2] = valid ? Math.fround((clip.x/clip.w+1)*view.cssWidth/2) : 0;
      screens[i*2+1] = valid ? Math.fround((1-clip.y/clip.w)*view.cssHeight/2) : 0;
      if (![projected[i*3],projected[i*3+1],screens[i*2],screens[i*2+1]].every(Number.isFinite)) { eligibility[i]=0; projected[i*3]=projected[i*3+1]=screens[i*2]=screens[i*2+1]=0; projected[i*3+2]=2; }
    }
    clipAttribute.needsUpdate = screenAttribute.needsUpdate = true; frameKey=key; return frame;
  }
  return { mesh, project, get diameter() { return resolvedDiameter; }, configure(nextView: PointViewport, diameter: number): string | null {
    view = nextView;

    const issue = binaryPointCapability(view), resolved = resolvePointPresentation(pointRegistrySnapshot, defaultPointProfile, diameter);
    resolvedDiameter = resolved.diameterCssPixels; mesh.visible = !issue;
    material.uniforms.cssSize!.value.set(Math.fround(view.cssWidth), Math.fround(view.cssHeight));
    material.uniforms.bufferSize!.value.set(Math.max(1, Math.floor(view.cssWidth * view.devicePixelRatio * view.renderScale + .5)), Math.max(1, Math.floor(view.cssHeight * view.devicePixelRatio * view.renderScale + .5)));
    material.uniforms.diameter!.value = resolved.diameterCssPixels;
    return issue ?? (resolved.diagnosedDefault ? '点の大きさを既定の3pxに戻しました。' : null);
  }, dispose() { geometry.dispose(); material.dispose(); } };
}
