// ViewerCore (docs/03 §4, docs/04 §7)
// LociMyu viewer.module.cdn.js の機能等価物のTS実装。
// - ピンはモデルローカル座標で扱う（docs/02 §5 anchor）
// - dispose規律: モデル・ピンの破棄でgeometry/material/textureを確実に解放する

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
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
  private tapMissHandlers = new Set<() => void>();
  private tickHandlers = new Set<() => void>();
  private pinScale = 1;

  // ピン移動ギズモ（3軸ドラッグ。ピン選択中に表示）
  private gizmo: TransformControls | null = null;
  private gizmoPinId: string | null = null;
  private pinMoveHandlers = new Set<(id: string, position: [number, number, number]) => void>();
  /** trueの間、通常クリックでピンを打てる（開発ハーネス用。製品UIは長押し/Shift+Click） */
  pinMode = false;

  // 長押し=ピン追加（コンセンサスQ3。指が動いたらキャンセル=回転優先）
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressStart: { x: number; y: number } | null = null;
  static readonly LONG_PRESS_MS = 500;
  static readonly LONG_PRESS_MOVE_PX = 10;

  // マテリアル既定値（リセット・セット切替用）
  private matDefaults = new Map<
    THREE.Material,
    { opacity: number; transparent: boolean; side: THREE.Side; depthWrite: boolean }
  >();
  private basePointSize = 1;
  private backgroundHex: string | null = null;

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

    // ピン移動ギズモ
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setMode('translate');
    this.gizmo.setSize(0.8);
    this.gizmo.addEventListener('dragging-changed', (ev) => {
      const dragging = (ev as unknown as { value: boolean }).value;
      this.controls.enabled = !dragging; // ドラッグ中はカメラ回転を止める
      if (!dragging && this.gizmoPinId !== null) {
        const mesh = this.pins.get(this.gizmoPinId);
        if (mesh !== undefined) {
          const p = mesh.position;
          for (const fn of this.pinMoveHandlers) fn(this.gizmoPinId, [p.x, p.y, p.z]);
        }
      }
    });
    this.gizmo.addEventListener('objectChange', () => this.renderOnce());
    // three r169以降はgetHelper()の戻りをシーンに入れる（旧APIは本体を直接addする）
    const g = this.gizmo as unknown as { getHelper?: () => THREE.Object3D };
    this.scene.add(g.getHelper !== undefined ? g.getHelper() : (this.gizmo as unknown as THREE.Object3D));

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.style.touchAction = 'none';
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
    this.basePointSize = diag * 0.002;
    model.root.traverse((o) => {
      if (o instanceof THREE.Points) {
        (o.material as THREE.PointsMaterial).size = this.basePointSize;
      }
    });
    // 既定値を記録（リセット・表示セット切替に使用）
    this.matDefaults.clear();
    for (const entry of model.materials) {
      for (const m of entry.materials) {
        this.matDefaults.set(m, {
          opacity: m.opacity,
          transparent: m.transparent,
          side: m.side,
          depthWrite: m.depthWrite,
        });
      }
    }
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
    for (const fn of this.tickHandlers) fn();
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
    this.applyPinScales();
    this.renderOnce();
  }

  removePin(id: string): void {
    const mesh = this.pins.get(id);
    if (mesh === undefined) return;
    if (this.gizmoPinId === id && this.gizmo !== null) {
      this.gizmo.detach();
      this.gizmoPinId = null;
    }
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
    this.applyPinScales();
  }

  /** 全ピンの表示倍率（Viewsタブのスライダー） */
  setPinScale(mult: number): void {
    this.pinScale = Number.isFinite(mult) && mult > 0 ? mult : 1;
    this.applyPinScales();
    this.renderOnce();
  }

  private applyPinScales(): void {
    for (const [pinId, mesh] of this.pins) {
      mesh.scale.setScalar(this.pinScale * (pinId === this.selectedPinId ? 1.6 : 1.0));
    }
  }

  get selectedPin(): string | null {
    return this.selectedPinId;
  }

  /** 選択ピンに3軸移動ギズモを表示する。nullで解除 */
  showPinGizmo(pinId: string | null): void {
    if (this.gizmo === null) return;
    const mesh = pinId !== null ? this.pins.get(pinId) : undefined;
    if (mesh === undefined) {
      if (this.gizmoPinId !== null) {
        this.gizmo.detach();
        this.gizmoPinId = null;
        this.renderOnce();
      }
      return;
    }
    if (this.gizmoPinId === pinId && this.gizmo.object === mesh) return;
    this.gizmo.attach(mesh);
    this.gizmoPinId = pinId;
    this.renderOnce();
  }

  /** ギズモドラッグ確定時（モデルローカル座標） */
  onPinMove(fn: (id: string, position: [number, number, number]) => void): () => void {
    this.pinMoveHandlers.add(fn);
    return () => this.pinMoveHandlers.delete(fn);
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
    this.backgroundHex = hex;
    this.scene.background = new THREE.Color(hex ?? DEFAULT_BG);
    this.renderOnce();
  }

  getBackground(): string | null {
    return this.backgroundHex;
  }

  /** 全マテリアルを読込直後の状態へ戻す（表示セット切替の前段で使用） */
  resetAllMaterials(): void {
    for (const [m, d] of this.matDefaults) {
      m.opacity = d.opacity;
      m.transparent = d.transparent;
      m.side = d.side;
      m.depthWrite = d.depthWrite;
      m.needsUpdate = true;
    }
    this.renderOnce();
  }

  /** 点群の点サイズ倍率（Modelタブ） */
  setPointScale(mult: number): void {
    if (this.currentModel === null) return;
    this.currentModel.root.traverse((o) => {
      if (o instanceof THREE.Points) {
        (o.material as THREE.PointsMaterial).size = this.basePointSize * mult;
      }
    });
    this.renderOnce();
  }

  /** アセットtransformの適用（docs/04 §3。原本は無改変、表示レイヤーのみ） */
  setModelTransform(t: { scale?: number; upAxis?: 'Y' | 'Z' }): void {
    const scale = t.scale ?? 1;
    this.modelRoot.scale.setScalar(Number.isFinite(scale) && scale > 0 ? scale : 1);
    this.modelRoot.rotation.set(t.upAxis === 'Z' ? -Math.PI / 2 : 0, 0, 0);
    this.modelRoot.updateWorldMatrix(true, true);
    this.fitCamera();
  }

  /** ±XYZ軸ビュー（LociMyu Views継承） */
  viewAxis(axis: '+x' | '-x' | '+y' | '-y' | '+z' | '-z'): void {
    if (this.currentModel === null) return;
    const box = new THREE.Box3().setFromObject(this.currentModel.root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = (maxDim / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.6;
    const dirs: Record<typeof axis, [number, number, number]> = {
      '+x': [1, 0, 0], '-x': [-1, 0, 0],
      '+y': [0, 1, 0], '-y': [0, -1, 0],
      '+z': [0, 0, 1], '-z': [0, 0, -1],
    };
    const dir = dirs[axis];
    // 真上/真下ビューではupをZ軸に逃がす
    if (axis === '+y') this.camera.up.set(0, 0, -1);
    else if (axis === '-y') this.camera.up.set(0, 0, 1);
    else this.camera.up.set(0, 1, 0);
    this.camera.position.set(
      center.x + dir[0] * dist,
      center.y + dir[1] * dist,
      center.z + dir[2] * dist,
    );
    this.controls.target.copy(center);
    this.controls.update();
    this.camera.updateMatrixWorld(true);
    this.renderOnce();
  }

  onTapMiss(fn: () => void): () => void {
    this.tapMissHandlers.add(fn);
    return () => this.tapMissHandlers.delete(fn);
  }

  /** 描画ごとに呼ばれるフック（キャプションオーバーレイの追従用） */
  onRenderTick(fn: () => void): () => void {
    this.tickHandlers.add(fn);
    return () => this.tickHandlers.delete(fn);
  }

  /** モデルローカル座標 → ステージCSSピクセル座標（オーバーレイ・結線用） */
  projectModelPoint(pos: [number, number, number]): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(pos[0], pos[1], pos[2]);
    this.modelRoot.updateWorldMatrix(true, false);
    v.applyMatrix4(this.modelRoot.matrixWorld);
    this.camera.updateMatrixWorld(true);
    v.project(this.camera);
    const { width, height } = this.canvasSize();
    return {
      x: ((v.x + 1) / 2) * width,
      y: ((-v.y + 1) / 2) * height,
      visible: v.z > -1 && v.z < 1,
    };
  }

  /** モデルの対角長（UIのステップ幅算出用） */
  modelDiag(): number | null {
    if (this.currentModel === null) return null;
    const box = new THREE.Box3().setFromObject(this.currentModel.root);
    if (box.isEmpty()) return null;
    return box.getSize(new THREE.Vector3()).length();
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
    this.clearLongPress();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    globalThis.removeEventListener('resize', this.onResize);
    this.clearModel();
    if (this.gizmo !== null) {
      this.gizmo.detach();
      this.gizmo.dispose();
      this.gizmo = null;
    }
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
      for (const fn of this.tickHandlers) fn();
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
    // ギズモ操作中・ギズモの軸に触れている間は選択/追加ロジックを動かさない
    if (this.gizmo !== null && (this.gizmo.dragging || this.gizmo.axis !== null)) return;
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

    // 1) ピン選択（タップ/クリック常時有効。コンセンサスQ3）
    const pinHits = this.raycaster.intersectObjects([...this.pins.values()], false);
    const firstPin = pinHits[0];
    if (firstPin !== undefined) {
      const id = firstPin.object.userData.pinId as string;
      this.setPinSelected(id);
      for (const fn of this.pinSelectHandlers) fn(id);
      return;
    }

    // 2) タッチは長押しでピン追加（指が動いたらキャンセル=回転優先）
    if (ev.pointerType === 'touch') {
      this.longPressStart = { x: ev.clientX, y: ev.clientY };
      const ndc = this.ndc.clone();
      this.clearLongPress();
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        this.performPinAdd(ndc);
      }, ViewerCore.LONG_PRESS_MS);
      return;
    }

    // 3) マウスは Shift+Click（LociMyu継承）/ pinMode（ハーネス用）
    if (ev.shiftKey || this.pinMode) {
      this.performPinAdd(this.ndc.clone());
      return;
    }
    for (const fn of this.tapMissHandlers) fn();
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    if (this.longPressTimer === null || this.longPressStart === null) return;
    const dx = ev.clientX - this.longPressStart.x;
    const dy = ev.clientY - this.longPressStart.y;
    if (dx * dx + dy * dy > ViewerCore.LONG_PRESS_MOVE_PX ** 2) this.clearLongPress();
  };

  private readonly onPointerUp = (): void => {
    // 長押し発火前の離し = タッチの素早いタップ（ピンにも当たっていない）→ 選択解除通知
    const wasPendingTap = this.longPressTimer !== null;
    this.clearLongPress();
    if (wasPendingTap) {
      for (const fn of this.tapMissHandlers) fn();
    }
  };

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private performPinAdd(ndc: THREE.Vector2): void {
    if (this.currentModel === null) return;
    this.camera.updateMatrixWorld(true);
    this.modelRoot.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(ndc, this.camera);
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
  }
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
