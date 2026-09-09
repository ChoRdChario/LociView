import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fixtureModelBytes } from './modelClosure';
import { defaultPose, fittedPose, placementMatrix, switchProjection, type CameraPose, type SyntheticDisplay } from './viewportModel';
import type { ViewportFactory, ViewportObservation } from './viewportHost';
import { readProjectCamera, readSolidBackground, type SolidBackground } from './viewHistory';
import type { DisplayCapture } from './viewSession';
import { pickResidentSurface, type ResidentSurface } from './viewportPicking';
import { createPinGizmo } from './pinGizmo';

/** Existing Three.js dependency, exact synthetic fixture only. No model loaders or Native controller. */
export const createSyntheticViewport: ViewportFactory = (canvas, changed, proposePin) => {
  let renderer: THREE.WebGLRenderer | null = null, controls: OrbitControls | null = null;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  const scene = new THREE.Scene(), models = new THREE.Group(); scene.add(models); scene.background = new THREE.Color('#e8e6e2');
  const resident = new Map<string, ResidentSurface>();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77736e, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(3, 5, 4); scene.add(light);
  const poses = new Map<string, CameraPose>();
  const backgrounds = new Map<string, SolidBackground>();
  let background: SolidBackground = { kind: 'solid', colorSrgb: [232 / 255, 230 / 255, 226 / 255] };
  let entryPending = false, notice: string | null = null;
  let pose = defaultPose(), display: SyntheticDisplay | null = null, modelKey = '', active = false, disposed = false, applying = false;
  let issue: string | null = null, contextLost = false, dragging = false, axis: ViewportObservation['axis'] = null, serial = 0, raf = 0, lastObservation = '';
  let width = 1, height = 1;
  let pickEpoch = 0;
  let gizmo: ReturnType<typeof createPinGizmo> | null = null;
  const errorText = (e: unknown) => e instanceof Error ? e.message : '3D表示を開始できません。';
  function observePose() {
    if (!camera || !controls) return;
    const tuple = (v: THREE.Vector3) => v.toArray().map(n => n || 0) as [number, number, number];
    pose = { position: tuple(camera.position), target: tuple(controls.target),
      up: tuple(camera.up), projection: camera instanceof THREE.PerspectiveCamera
        ? { kind: 'perspective', verticalFov: THREE.MathUtils.degToRad(camera.fov) }
        : { kind: 'orthographic', verticalSpan: (camera.top - camera.bottom) / camera.zoom } };
    if (display) { poses.set(display.sceneId, pose); backgrounds.set(display.sceneId, background); }
  }
  function useCapture(input: DisplayCapture) {
    const c = readProjectCamera(input.camera), b = readSolidBackground(input.background);
    pose = { position: c.position, target: c.target, up: c.up, projection: c.projection.kind === 'perspective'
      ? { kind: 'perspective', verticalFov: c.projection.verticalFovRadians } : c.projection };
    background = b; axis = null;
  }
  function enterScene() {
    if (!display || !entryPending) return;
    const entry = display.entry;
    notice = entry?.kind === 'blocked' ? entry.reason : null;
    if (entry?.kind === 'ready') useCapture(entry.payload);
    else if (entry?.kind !== 'blocked') {
      pose = poses.get(display.sceneId) ?? (display.bounds ? fittedPose(display.bounds, defaultPose(), width / height) : defaultPose());
      background = backgrounds.get(display.sceneId) ?? { kind: 'solid', colorSrgb: [232 / 255, 230 / 255, 226 / 255] };
    }
    poses.set(display.sceneId, pose); backgrounds.set(display.sceneId, background); entryPending = false; axis = null;
  }
  function clearModels() {
    resident.clear();
    for (const child of [...models.children]) {
      child.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (node.material as THREE.Material).dispose(); } });
      models.remove(child);
    }
  }
  function release() {
    pickEpoch++;
    gizmo?.dispose(); gizmo = null;
    observePose(); cancelAnimationFrame(raf); raf = 0; controls?.dispose(); controls = null; camera = null;
    clearModels(); renderer?.dispose(); renderer = null; modelKey = ''; dragging = false;
  }
  function fail(e: unknown) { issue = `3D表示を停止しました。${errorText(e)} 編集内容は保持しています。`; release(); serial++; changed(); }
  function buildModels() {
    if (!display || !renderer) return;
    const key = JSON.stringify([display.models.map(m => m.binding.id), display.materials]); if (key === modelKey) return;
    pickEpoch++;
    clearModels();
    try {
      for (const model of display.models) {
        const appearance = display.materials?.[model.binding.assetId];
        if (appearance && 'issue' in appearance) continue; // Diagnosed unsupported effect; no source-looking replacement.
        const raw = JSON.parse(new TextDecoder().decode(fixtureModelBytes(model.shape))) as { positions: number[]; indices: number[] };
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(raw.positions, 3));
        geometry.setIndex(raw.indices); geometry.computeVertexNormals();
        const params = { color: appearance ? new THREE.Color().setRGB(...appearance.colorLinear, THREE.LinearSRGBColorSpace) : new THREE.Color('#a8a29a'),
          side: appearance?.doubleSided ? THREE.DoubleSide : THREE.FrontSide, transparent: false, depthWrite: true, opacity: 1, visible: appearance?.visible ?? true };
        const material = appearance?.unlit ? new THREE.MeshBasicMaterial(params) : new THREE.MeshStandardMaterial({ ...params, roughness: 0.8 });
        const mesh = new THREE.Mesh(geometry, material), asset = new THREE.Group();
        mesh.matrix.copy(placementMatrix(model.representation.representationToAsset)); mesh.matrixAutoUpdate = false;
        asset.matrix.copy(placementMatrix(model.binding.assetToProject)); asset.matrixAutoUpdate = false;
        asset.add(mesh); models.add(asset);
        resident.set(model.binding.assetId, { mesh, asset });
      }
      modelKey = key;
    } catch (e) { clearModels(); throw e; }
  }
  function installPose() {
    if (!renderer) return;
    pickEpoch++;
    const previousCamera = camera, previousControls = controls, previousGizmo = gizmo, previousBackground = scene.background, previousTouchAction = canvas.style.touchAction;
    applying = true;
    try {
      const target = new THREE.Vector3(...pose.target), position = new THREE.Vector3(...pose.position);
      const extent = display?.bounds ? new THREE.Vector3(...display.bounds.max).sub(new THREE.Vector3(...display.bounds.min)).length() : 1;
      const center = display?.bounds ? new THREE.Vector3(...display.bounds.min).add(new THREE.Vector3(...display.bounds.max)).multiplyScalar(0.5) : target;
      const distance = position.distanceTo(center), far = Math.max(10, distance + extent * 10);
      if (!Number.isFinite(far)) throw new Error('表示範囲を確認してください。');
      if (pose.projection.kind === 'perspective') camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(pose.projection.verticalFov), width / height, Math.max(1e-6, far / 1e7), far);
      else { const half = pose.projection.verticalSpan / 2; camera = new THREE.OrthographicCamera(-half * width / height, half * width / height, half, -half, -far, far); }
      camera.position.copy(position); camera.up.set(...pose.up); camera.lookAt(target); camera.updateMatrixWorld(true);
      if (![...camera.projectionMatrix.elements, ...camera.matrixWorld.elements].every(Number.isFinite)) throw new Error('表示範囲を確認してください。');
      // Register TransformControls before OrbitControls: handle-down disables orbit
      // before its listener sees that same event (including touch).
      gizmo = proposePin ? createPinGizmo(canvas, scene, camera, (target, world) => {
        const surface = resident.get(target.assetId);
        if (!surface || JSON.stringify(target) !== JSON.stringify(display?.pinEdit?.target) || !display?.pinEdit?.enabled) return false;
        surface.asset.updateMatrixWorld(true);
        const p = surface.asset.worldToLocal(new THREE.Vector3(...world));
        return [p.x, p.y, p.z].every(Number.isFinite) && proposePin(target, [p.x || 0, p.y || 0, p.z || 0]);
      }, busy => { if (controls) controls.enabled = !busy; serial++; if (!applying) changed(); }) : null;
      controls = new OrbitControls(camera, canvas); controls.enableDamping = false; controls.target.copy(target);
      controls.addEventListener('start', () => { dragging = true; serial++; changed(); });
      controls.addEventListener('end', () => { dragging = false; observePose(); serial++; changed(); });
      controls.addEventListener('change', () => {
        if (!applying) { try { axis = null; observePose(); updateClipping(); serial++; pickEpoch++; } catch (e) { fail(e); } }
      });
      controls.update();
      scene.background = new THREE.Color().setRGB(...background.colorSrgb, THREE.SRGBColorSpace);
      previousControls?.dispose();
      previousGizmo?.dispose(); gizmo?.update(display?.pinEdit);
      // The old OrbitControls.disconnect resets this shared element to auto.
      canvas.style.touchAction = 'none';
    } catch (e) {
      if (controls !== previousControls) controls?.dispose();
      if (gizmo !== previousGizmo) gizmo?.dispose(); gizmo = previousGizmo;
      camera = previousCamera; controls = previousControls; scene.background = previousBackground;
      canvas.style.touchAction = previousTouchAction;
      throw e;
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
      const fingerprint = JSON.stringify([serial, width, height, display?.token, display?.pins, display?.preview, pose, background]);
      if (fingerprint !== lastObservation) { lastObservation = fingerprint; changed(); }
    } catch (e) { fail(e); }
  }
  function ensure() {
    if (!active || disposed || issue || !display) return;
    const rect = canvas.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
    const resized = width !== rect.width || height !== rect.height; width = rect.width; height = rect.height;
    if (resized) pickEpoch++;
    try {
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
        if (entryPending) enterScene();
        else { pose = poses.get(display.sceneId) ?? pose; background = backgrounds.get(display.sceneId) ?? background; }
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
      if (sceneChanged) { entryPending = true; if (renderer) { enterScene(); installPose(); } }
      else if (boundsChanged) { observePose(); installPose(); }
      buildModels(); gizmo?.update(next.pinEdit); serial++;
    },
    setActive(next) { if (!next && active) release(); active = next; ensure(); },
    pick(target, x, y) {
      if (!active || disposed || !renderer || !camera || issue || contextLost || dragging || gizmo?.dragging || !display) return null;
      return pickResidentSurface(display, target, resident, camera, new THREE.Vector2(x * 2 / width - 1, 1 - y * 2 / height));
    },
    read() {
      const project = (position: readonly [number, number, number]) => {
        const p = new THREE.Vector3(...position); if (camera) { camera.updateMatrixWorld(true); p.project(camera); }
        return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2,
          visible: Boolean(camera && p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1) };
      };
      const pins = display?.pins.map(pin => ({ id: pin.id, ...project(pin.position) })) ?? [];
      return { token: JSON.stringify([serial, display?.sceneId, display?.projectFrameId, display?.bounds, width, height, pose, background]),
        pickToken: String(pickEpoch),
        ready: Boolean(active && renderer && camera && !issue), issue,
        notice: [notice, ...(display?.materialNotices ?? []), ...Object.values(display?.materials ?? {}).flatMap(m => 'issue' in m ? [m.issue] : [])].filter(Boolean).join(' ') || null,
        dragging: dragging || !!gizmo?.dragging, manipulating: !!gizmo?.dragging,
        projection: pose.projection.kind, axis, pins, preview: display?.preview ? project(display.preview) : undefined };
    },
    camera(intent) {
      if (!active || !renderer || issue || !display || dragging || gizmo?.dragging) throw new Error('3D表示を確認してください。');
      observePose();
      if (intent.kind === 'recall') throw new Error('保存した視点は未接続です。');
      if (intent.kind === 'projection') pose = switchProjection(pose, intent.projection);
      else { if (!display.bounds) throw new Error('表示するモデルがありません。'); pose = fittedPose(display.bounds, pose, width / height, intent.kind === 'axis' ? intent.axis : undefined); }
      axis = intent.kind === 'axis' ? intent.axis : null; installPose(); observePose(); serial++; changed();
    },
    capture() {
      if (!active || !renderer || issue || !display || dragging || gizmo?.dragging) throw new Error('3D表示を確認してください。');
      return { camera: readProjectCamera({ position: pose.position, target: pose.target, up: pose.up,
        projection: pose.projection.kind === 'perspective' ? { kind: 'perspective', verticalFovRadians: pose.projection.verticalFov } : pose.projection }), background: readSolidBackground(background) };
    },
    recall(payload) {
      if (!active || !renderer || issue || !display || dragging || gizmo?.dragging) throw new Error('3D表示を確認してください。');
      const previousPose = pose, previousBackground = background, previousAxis = axis;
      try { useCapture(payload); installPose(); }
      catch (e) { pose = previousPose; background = previousBackground; axis = previousAxis; throw e; }
      poses.set(display.sceneId, pose); backgrounds.set(display.sceneId, background); notice = null; serial++; changed();
    },
    retry() { if (contextLost) throw new Error('描画環境の復旧を待って再試行してください。'); release(); issue = null; ensure(); },
    dispose() { disposed = true; release(); resize.disconnect(); canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored); },
  };
};
