// ViewerCore (docs/03 §4, docs/04 §7)
// LociMyu viewer.module.cdn.js の機能等価物のTS実装。
// - ピンはモデルローカル座標で扱う（docs/02 §5 anchor）
// - dispose規律: モデル・ピンの破棄でgeometry/material/textureを確実に解放する

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LoadedModel } from './loaders';

export interface PickHit {
  /** モデルローカル座標 */
  position: [number, number, number];
  normal: [number, number, number] | null;
}

export interface ViewerPin {
  id: string;
  position: [number, number, number];
  color: string;
}

export interface CameraState {
  eye: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
  ortho: boolean;
}

const DEFAULT_BG = 0x0b0d11;

export class ViewerCore {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private canvas!: HTMLCanvasElement;

  /** アセットtransform適用用の親。ピンもこの中に置く=モデルローカル座標 */
  private modelRoot = new THREE.Group();
  private currentModel: LoadedModel | null = null;
  private pinLayer = new THREE.Group();
  private pins = new Map<string, THREE.Mesh>();
  private selectedPinId: string | null = null;
  private pinRadius = 0.01;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private rafId = 0;
  private disposed = false;

  private pickHandlers = new Set<(hit: PickHit) => void>();
  private pinSelectHandlers = new Set<(id: string) => void>();
  /** trueの間、通常クリックでピンを打てる（タッチ対応。docs/05 §3.3） */
  pinMode = false;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(DEFAULT_BG);
    this.scene.add(this.modelRoot);
    this.modelRoot.add(this.pinLayer);

    const { width, height } = this.canvasSize();
    this.camera = new THREE.PerspectiveCamera(45, width / Math.max(height, 1), 0.001, 1e7);
    this.camera.position.set(0, 1, 3);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(3, 5, 2);
    this.scene.add(dir);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
    globalThis.addEventListener('resize', this.onResize);

    this.startLoop();
  }

  // ---- モデル -----------------------------------------------------------------

  setModel(model: LoadedModel): void {
    this.clearModel();
    this.currentModel = model;
    this.modelRoot.add(model.root);

    // ピンサイズと点群サイズをモデル規模から決める
    const box = new THREE.Box3().setFromObject(model.root);
    const diag = box.getSize(new THREE.Vector3()).length();
    this.pinRadius = Math.max(diag * 0.006, 1e-6);
    model.root.traverse((o) => {
      if (o instanceof THREE.Points) {
        (o.material as THREE.PointsMaterial).size = diag * 0.002;
      }
    });
    this.fitCamera();
  }

  clearModel(): void {
    if (this.currentModel !== null) {
      this.modelRoot.remove(this.currentModel.root);
      disposeObject(this.currentModel.root);
      this.currentModel = null;
    }
    this.clearPins();
  }

  get model(): LoadedModel | null {
    return this.currentModel;
  }

  fitCamera(): void {
    if (this.currentModel === null) return;
    const box = new THREE.Box3().setFromObject(this.currentModel.root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = (maxDim / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.6;
    this.camera.near = Math.max(maxDim / 1000, 1e-4);
    this.camera.far = Math.max(maxDim * 100, 10);
    this.camera.position.copy(center).add(new THREE.Vector3(dist * 0.6, dist * 0.4, dist));
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
    this.camera.updateMatrixWorld(true);
    this.renderOnce();
  }

  /** 1フレームだけ即時描画する（RAF外からの状態変更直後の反映用） */
  renderOnce(): void {
    if (this.disposed) return;
    const { width, height } = this.canvasSize();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  // ---- ピン（モデルローカル座標） -------------------------------------------------

  addPin(pin: ViewerPin): void {
    this.removePin(pin.id);
    const geom = new THREE.SphereGeometry(this.pinRadius, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pin.color) });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(...pin.position);
    mesh.userData.pinId = pin.id;
    mesh.renderOrder = 999;
    this.pinLayer.add(mesh);
    this.pins.set(pin.id, mesh);
    this.renderOnce();
  }

  removePin(id: string): void {
    const mesh = this.pins.get(id);
    if (mesh === undefined) return;
    this.pinLayer.remove(mesh);
    disposeObject(mesh);
    this.pins.delete(id);
  }

  clearPins(): void {
    for (const id of [...this.pins.keys()]) this.removePin(id);
    this.selectedPinId = null;
  }

  setPinSelected(id: string | null): void {
    this.selectedPinId = id;
    for (const [pinId, mesh] of this.pins) {
      const scale = pinId === id ? 1.6 : 1.0;
      mesh.scale.setScalar(scale);
    }
  }

  get selectedPin(): string | null {
    return this.selectedPinId;
  }

  onPick(fn: (hit: PickHit) => void): () => void {
    this.pickHandlers.add(fn);
    return () => this.pickHandlers.delete(fn);
  }

  onPinSelect(fn: (id: string) => void): () => void {
    this.pinSelectHandlers.add(fn);
    return () => this.pinSelectHandlers.delete(fn);
  }

  // ---- 表示調整 ----------------------------------------------------------------

  setBackground(hex: string | null): void {
    this.scene.background = new THREE.Color(hex ?? DEFAULT_BG);
    this.renderOnce();
  }

  applyMaterialProps(key: string, props: { opacity?: number; doubleSided?: boolean }): void {
    const entry = this.currentModel?.materials.find((m) => m.key === key);
    if (entry === undefined) return;
    for (const m of entry.materials) {
      if (props.opacity !== undefined) {
        m.transparent = props.opacity < 1;
        m.opacity = props.opacity;
        m.depthWrite = props.opacity >= 1;
      }
      if (props.doubleSided !== undefined) {
        m.side = props.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
      }
      m.needsUpdate = true;
    }
  }

  getCameraState(): CameraState {
    const eye = this.camera.position;
    const target = this.controls.target;
    const up = this.camera.up;
    return {
      eye: [eye.x, eye.y, eye.z],
      target: [target.x, target.y, target.z],
      up: [up.x, up.y, up.z],
      fov: this.camera.fov,
      ortho: false, // 平行投影はMVP後半で実装（docs/01 FR-06）
    };
  }

  setCameraState(s: CameraState): void {
    this.camera.position.set(...s.eye);
    this.camera.up.set(...s.up);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(...s.target);
    this.controls.update();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    globalThis.removeEventListener('resize', this.onResize);
    this.clearModel();
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ---- 内部 -----------------------------------------------------------------

  private canvasSize(): { width: number; height: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) };
  }

  private startLoop(): void {
    const loop = (): void => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(loop);
      const { width, height } = this.canvasSize();
      const pr = this.renderer.getPixelRatio();
      const w = Math.floor(width * pr);
      const h = Math.floor(height * pr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / Math.max(height, 1);
        this.camera.updateProjectionMatrix();
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private readonly onResize = (): void => {
    // サイズ反映はループ内で行う
  };

  private readonly onContextLost = (ev: Event): void => {
    ev.preventDefault(); // restoredを待つ（スマホで頻発。docs/04 §7）
  };

  private readonly onContextRestored = (): void => {
    // three r150+ は自動で再アップロードする
  };

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    // 描画フレーム未経過でもピックが正しく動くよう、行列を明示的に更新する
    // （lookAt直後はmatrixWorldの回転が古い。RAF停止環境・初回描画前の防御）
    this.camera.updateMatrixWorld(true);
    this.modelRoot.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    // タッチはピック半径を広げる (docs/04 §6)
    this.raycaster.params.Points.threshold = this.pinRadius * (ev.pointerType === 'touch' ? 4 : 2);

    // 1) ピン選択（常時有効）
    const pinHits = this.raycaster.intersectObjects([...this.pins.values()], false);
    const firstPin = pinHits[0];
    if (firstPin !== undefined) {
      const id = firstPin.object.userData.pinId as string;
      this.setPinSelected(id);
      for (const fn of this.pinSelectHandlers) fn(id);
      return;
    }

    // 2) ピン追加（Shift+Click または ピン追加モード）
    if (!ev.shiftKey && !this.pinMode) return;
    if (this.currentModel === null) return;
    const hits = this.raycaster.intersectObject(this.currentModel.root, true);
    const hit = hits[0];
    if (hit === undefined) return;

    const local = this.modelRoot.worldToLocal(hit.point.clone());
    let normal: [number, number, number] | null = null;
    if (hit.face !== null && hit.face !== undefined) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      normal = [n.x, n.y, n.z];
    }
    const pick: PickHit = { position: [local.x, local.y, local.z], normal };
    for (const fn of this.pickHandlers) fn(pick);
  };
}

/** three.jsリソースの再帰破棄 */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
      (o.geometry as THREE.BufferGeometry).dispose();
      const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const v of Object.values(m)) {
          if (v instanceof THREE.Texture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}
