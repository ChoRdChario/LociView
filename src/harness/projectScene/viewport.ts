import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fixtureModelBytes } from './modelClosure';
import { defaultPose, fittedPose, placementMatrix, switchProjection, type CameraPose, type SyntheticDisplay } from './viewportModel';
import type { ViewportFactory, ViewportObservation } from './viewportHost';

/** Existing Three.js dependency, exact synthetic fixture only. No model loaders or Native controller. */
export const createSyntheticViewport: ViewportFactory = (canvas, changed) => {
  let renderer: THREE.WebGLRenderer | null = null, controls: OrbitControls | null = null;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  const scene = new THREE.Scene(), models = new THREE.Group(); scene.add(models); scene.background = new THREE.Color('#e8e6e2');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77736e, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(3, 5, 4); scene.add(light);
  const poses = new Map<string, CameraPose>();
  let pose = defaultPose(), display: SyntheticDisplay | null = null, modelKey = '', active = false, disposed = false, applying = false;
  let issue: string | null = null, contextLost = false, dragging = false, axis: ViewportObservation['axis'] = null, serial = 0, raf = 0, lastObservation = '';
  let width = 1, height = 1;
  const errorText = (e: unknown) => e instanceof Error ? e.message : '3D表示を開始できません。';
  function observePose() {
    if (!camera || !controls) return;
    pose = { position: camera.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number],
      up: camera.up.toArray() as [number, number, number], projection: camera instanceof THREE.PerspectiveCamera
        ? { kind: 'perspective', verticalFov: THREE.MathUtils.degToRad(camera.fov) }
        : { kind: 'orthographic', verticalSpan: (camera.top - camera.bottom) / camera.zoom } };
    if (display) poses.set(display.sceneId, pose);
  }
  function clearModels() {
    for (const child of [...models.children]) {
      child.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (node.material as THREE.Material).dispose(); } });
      models.remove(child);
    }
  }
  function release() {
    observePose(); cancelAnimationFrame(raf); raf = 0; controls?.dispose(); controls = null; camera = null;
    clearModels(); renderer?.dispose(); renderer = null; modelKey = ''; dragging = false;
  }
  function fail(e: unknown) { issue = `3D表示を停止しました。${errorText(e)} 編集内容は保持しています。`; release(); serial++; changed(); }
  function buildModels() {
    if (!display || !renderer) return;
    const key = JSON.stringify(display.models.map(m => m.binding.id)); if (key === modelKey) return;
    clearModels();
    try {
      for (const model of display.models) {
        const raw = JSON.parse(new TextDecoder().decode(fixtureModelBytes(model.shape))) as { positions: number[]; indices: number[] };
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(raw.positions, 3));
        geometry.setIndex(raw.indices); geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: '#a8a29a', side: THREE.FrontSide, transparent: false, roughness: 0.8 });
        const mesh = new THREE.Mesh(geometry, material), asset = new THREE.Group();
        mesh.matrix.copy(placementMatrix(model.representation.representationToAsset)); mesh.matrixAutoUpdate = false;
        asset.matrix.copy(placementMatrix(model.binding.assetToProject)); asset.matrixAutoUpdate = false;
        asset.add(mesh); models.add(asset);
      }
      modelKey = key;
    } catch (e) { clearModels(); throw e; }
  }
  function installPose() {
    if (!renderer) return;
    applying = true;
    try {
      controls?.dispose();
      const target = new THREE.Vector3(...pose.target), position = new THREE.Vector3(...pose.position);
      const extent = display?.bounds ? new THREE.Vector3(...display.bounds.max).sub(new THREE.Vector3(...display.bounds.min)).length() : 1;
      const center = display?.bounds ? new THREE.Vector3(...display.bounds.min).add(new THREE.Vector3(...display.bounds.max)).multiplyScalar(0.5) : target;
      const distance = position.distanceTo(center), far = Math.max(10, distance + extent * 10);
      if (!Number.isFinite(far)) throw new Error('表示範囲を確認してください。');
      if (pose.projection.kind === 'perspective') camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(pose.projection.verticalFov), width / height, Math.max(1e-6, far / 1e7), far);
      else { const half = pose.projection.verticalSpan / 2; camera = new THREE.OrthographicCamera(-half * width / height, half * width / height, half, -half, -far, far); }
      camera.position.copy(position); camera.up.set(...pose.up); camera.lookAt(target); camera.updateMatrixWorld(true);
      controls = new OrbitControls(camera, canvas); controls.enableDamping = false; controls.target.copy(target);
      controls.addEventListener('start', () => { dragging = true; serial++; changed(); });
      controls.addEventListener('end', () => { dragging = false; observePose(); serial++; changed(); });
      controls.addEventListener('change', () => {
        if (!applying) { try { axis = null; observePose(); updateClipping(); serial++; } catch (e) { fail(e); } }
      });
      controls.update();
    } finally { applying = false; }
  }
  function updateClipping() {
    if (!camera || !display?.bounds) return;
    const min = new THREE.Vector3(...display.bounds.min), max = new THREE.Vector3(...display.bounds.max);
    const radius = max.clone().sub(min).length() / 2, distance = camera.position.distanceTo(min.add(max).multiplyScalar(0.5));
    const far = Math.max(10, distance + radius * 4);
    if (!Number.isFinite(far)) throw new Error('表示範囲を確認してください。');
    camera.near = camera instanceof THREE.PerspectiveCamera ? Math.max(1e-6, (distance - radius) / 1000) : -far;
    camera.far = far; camera.updateProjectionMatrix();
  }
  function draw() {
    if (!active || disposed || !renderer || !camera) return;
    try {
      // Reserve before notification: ready -> host render -> ensure may reenter synchronously.
      raf = requestAnimationFrame(draw);
      renderer.render(scene, camera);
      const fingerprint = JSON.stringify([serial, width, height, display?.token, display?.pins, pose]);
      if (fingerprint !== lastObservation) { lastObservation = fingerprint; changed(); }
    } catch (e) { fail(e); }
  }
  function ensure() {
    if (!active || disposed || issue || !display) return;
    const rect = canvas.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
    const resized = width !== rect.width || height !== rect.height; width = rect.width; height = rect.height;
    try {
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
        pose = poses.get(display.sceneId) ?? (display.bounds ? fittedPose(display.bounds, defaultPose(), width / height) : defaultPose());
        installPose(); buildModels();
      }
      if (resized || !raf) {
        renderer.setSize(width, height, false);
        if (camera instanceof THREE.PerspectiveCamera) camera.aspect = width / height;
        else if (camera) { const half = (camera.top - camera.bottom) / 2; camera.left = -half * width / height; camera.right = half * width / height; }
        camera?.updateProjectionMatrix(); serial++;
      }
      if (!raf) draw();
    } catch (e) { fail(e); }
  }
  const resize = new ResizeObserver(ensure); resize.observe(canvas);
  const lost = (event: Event) => { event.preventDefault(); contextLost = true; fail(new Error('描画環境の復旧を待って再試行してください。')); };
  const restored = () => { contextLost = false; issue = '描画環境が復旧しました。3D表示を再試行してください。'; serial++; changed(); };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return {
    update(next) {
      const sceneChanged = display?.sceneId !== next.sceneId;
      const boundsChanged = JSON.stringify(display?.bounds) !== JSON.stringify(next.bounds);
      if (sceneChanged) observePose(); display = next;
      if (sceneChanged) { pose = poses.get(next.sceneId) ?? (next.bounds ? fittedPose(next.bounds, defaultPose(), width / height) : defaultPose()); axis = null; installPose(); }
      else if (boundsChanged) { observePose(); installPose(); }
      buildModels(); serial++;
    },
    setActive(next) { if (!next && active) release(); active = next; ensure(); },
    read() {
      const pins = display?.pins.map(pin => {
        const p = new THREE.Vector3(...pin.position); if (camera) { camera.updateMatrixWorld(true); p.project(camera); }
        return { id: pin.id, x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2,
          visible: Boolean(camera && p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1) };
      }) ?? [];
      return { token: JSON.stringify([serial, display?.sceneId, display?.projectFrameId, display?.bounds, width, height, pose]),
        ready: Boolean(active && renderer && camera && !issue), issue, dragging, projection: pose.projection.kind, axis, pins };
    },
    camera(intent) {
      if (!active || !renderer || issue || !display || dragging) throw new Error('3D表示を確認してください。');
      observePose();
      if (intent.kind === 'recall') throw new Error('保存した視点は未接続です。');
      if (intent.kind === 'projection') pose = switchProjection(pose, intent.projection);
      else { if (!display.bounds) throw new Error('表示するモデルがありません。'); pose = fittedPose(display.bounds, pose, width / height, intent.kind === 'axis' ? intent.axis : undefined); }
      axis = intent.kind === 'axis' ? intent.axis : null; installPose(); observePose(); serial++; changed();
    },
    retry() { if (contextLost) throw new Error('描画環境の復旧を待って再試行してください。'); release(); issue = null; ensure(); },
    dispose() { disposed = true; release(); resize.disconnect(); canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored); },
  };
};
