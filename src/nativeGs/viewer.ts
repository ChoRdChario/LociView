import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { loadModel } from '../viewer/loaders';
import { patchMaterial, setChroma, setUnlit } from '../viewer/shaderPatch';
import { inspectNativeGsPlyV1, inspectNativePointPlyV1 } from './plyProfile';
import {
  clampNativePointDiameterCssPixels,
  NATIVE_POINT_DIAMETER_DEFAULT_CSS_PX,
  selectNativeProjectedPoint,
  type NativeProjectedPointPick,
} from './pointPresentation';
import {
  activeNativeBindingV1,
  activeNativeRepresentationsV1,
  allActiveNativeRepresentationsV1,
  nativeCaptionNeedsReviewV1,
  resolveNativeGsSliceV1,
  type NativeResourceStateV1,
  type NativeSliceResolutionV1,
} from './resolver';
import {
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  nativeModelFormat,
  nativeCaptionDisplaySetIdV1,
  newNativeId,
  normalizeNativeSim3,
  type NativeCaptionV1,
  type NativeCanonicalTransformV1,
  type NativeProjectCameraV1,
  type NativeProjectSnapshotV1,
  type NativeMeshMaterialAppearanceV1,
  type NativeRepresentationV1,
  type NativeSim3V1,
  type NativeSolidBackgroundV1,
} from './schema';
import { NativeSparkRuntime } from './sparkRuntime';
import type { WorkspaceReadableFile } from '../platform/fs';
import { nativeMaterialSlotKey } from './materialSlots';

export interface NativeGsViewerCallbacks {
  onCaptionCreationStarted(): boolean;
  onCaptionChanged(caption: NativeCaptionV1): boolean;
  onCaptionSelected(captionId: string): void;
  onAssetTransformCommitted(assetId: string, transform: NativeSim3V1): void;
  onIssuesChanged(issues: readonly string[]): void;
  onProgress(message: string): void;
  onRuntimeError(message: string): void;
}

export type NativeAssetGizmoMode = 'translate' | 'rotate' | 'scale';

type NativeGizmoTarget =
  | { readonly kind: 'caption' }
  | { readonly kind: 'asset'; readonly assetId: string }
  | null;

interface NativeMeshMaterialSlot {
  readonly representationId: string;
  readonly key: string;
  readonly name: string;
  readonly material: THREE.Material;
  readonly patchSupported: boolean;
  readonly baseline: {
    readonly opacity: number;
    readonly transparent: boolean;
    readonly depthWrite: boolean;
    readonly side: THREE.Side;
  };
}

export interface NativeMeshMaterialSlotInfo {
  readonly representationId: string;
  readonly key: string;
  readonly name: string;
  readonly supportsUnlitAndChroma: boolean;
  readonly baseline: {
    readonly opacity: number;
    readonly doubleSided: boolean;
    readonly unlit: boolean;
    readonly chroma: {
      readonly enabled: boolean;
      readonly colorSrgb: readonly [number, number, number];
      readonly tolerance: number;
      readonly feather: number;
    };
  };
}

function applySim3(object: THREE.Object3D, transform: NativeSim3V1): void {
  object.position.fromArray(transform.translation);
  object.quaternion.fromArray(transform.rotationXYZW);
  object.scale.setScalar(transform.uniformScale);
}

function applyCanonicalTransform(object: THREE.Object3D, transform: NativeCanonicalTransformV1): void {
  applySim3(object, transform);
  if (transform.reflection === 'x') object.scale.x *= -1;
}

function tuple(vector: THREE.Vector3): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

async function collectStream(source: WorkspaceReadableFile): Promise<Uint8Array> {
  const reader = source.stream().getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = new Uint8Array(result.value);
      chunks.push(chunk);
      size += chunk.byteLength;
      if (!Number.isSafeInteger(size) || size > source.size) throw new Error('model stream length is invalid');
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== source.size) throw new Error(`model stream truncated (${size} != ${source.size})`);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
  else material.dispose();
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object.userData.nativeSpark === true) return;
    if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
      object.geometry.dispose();
      disposeMaterial(object.material);
    }
  });
  root.removeFromParent();
}

function makeProxyInvisible(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    disposeMaterial(object.material);
    object.material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
    });
    object.userData.interactionOnly = true;
  });
}

function pointMaterials(object: THREE.Points): THREE.PointsMaterial[] {
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.filter((material): material is THREE.PointsMaterial => material instanceof THREE.PointsMaterial);
}

function preparePointPresentation(root: THREE.Object3D, diameterCssPixels: number): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Points)) return;
    for (const material of pointMaterials(object)) {
      material.size = diameterCssPixels;
      material.sizeAttenuation = false;
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\n' +
          'vec2 lociviewPointDelta = gl_PointCoord - vec2(0.5);\n' +
          'if (dot(lociviewPointDelta, lociviewPointDelta) > 0.25) discard;',
        );
      };
      material.customProgramCacheKey = () => 'lociview-native-point-disc-v1';
      material.needsUpdate = true;
    }
  });
}

function registerNativeMeshMaterialSlots(
  root: THREE.Object3D,
  representationId: string,
): NativeMeshMaterialSlot[] {
  const slots: NativeMeshMaterialSlot[] = [];
  const nameCounts = new Map<string, number>();
  const originalsToDispose = new Set<THREE.Material>();
  const visit = (object: THREE.Object3D, path: readonly number[]): void => {
    if (object instanceof THREE.Mesh) {
      const original = Array.isArray(object.material) ? object.material : [object.material];
      const cloned = original.map((material) => material.clone());
      for (const material of original) originalsToDispose.add(material);
      object.material = Array.isArray(object.material) ? cloned : cloned[0]!;
      cloned.forEach((material, slot) => {
        const baseName = material.name === '' ? '(unnamed)' : material.name;
        const occurrence = (nameCounts.get(baseName) ?? 0) + 1;
        nameCounts.set(baseName, occurrence);
        slots.push({
          representationId,
          key: nativeMaterialSlotKey(path, slot),
          name: occurrence === 1 ? baseName : `${baseName} (${occurrence})`,
          material,
          patchSupported: patchMaterial(material),
          baseline: {
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
            side: material.side,
          },
        });
      });
    }
    object.children.forEach((child, index) => visit(child, [...path, index]));
  };
  visit(root, []);
  for (const material of originalsToDispose) material.dispose();
  return slots;
}

function chromaHex(color: readonly [number, number, number]): string {
  return `#${new THREE.Color().setRGB(...color, THREE.SRGBColorSpace).getHexString()}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class NativeGsViewer {
  private readonly scene = new THREE.Scene();
  private readonly perspectiveCamera = new THREE.PerspectiveCamera(48, 1, 0.01, 100_000);
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.perspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private readonly gizmo: TransformControls;
  private readonly gizmoRoot: THREE.Object3D;
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly assetGroups = new Map<string, THREE.Group>();
  private readonly representationObjects = new Map<string, THREE.Object3D>();
  private readonly representationBounds = new Map<string, THREE.Box3>();
  private readonly resourceStates = new Map<string, NativeResourceStateV1>();
  private readonly pointDiameters = new Map<string, number>();
  private readonly meshMaterialSlots = new Map<string, NativeMeshMaterialSlot[]>();
  private materialIssues: string[] = [];
  private readonly callbacks: NativeGsViewerCallbacks;
  private snapshot: NativeProjectSnapshotV1;
  private activeDisplaySetOverride: string | null = null;
  private sparkRuntime: NativeSparkRuntime | null = null;
  private readonly captionMarkers = new Map<string, THREE.Mesh>();
  private currentCaption: NativeCaptionV1 | null = null;
  private repositionCaptionId: string | null = null;
  private gizmoTarget: NativeGizmoTarget = null;
  private assetGizmoMode: NativeAssetGizmoMode = 'translate';
  private assetScaleDragStart = 1;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressStart: { readonly x: number; readonly y: number } | null = null;
  private editingEnabled = false;
  private gizmoDragging = false;
  private disposed = false;
  private animationFrame = 0;
  private resolution: NativeSliceResolutionV1;
  private backgroundSrgb: readonly [number, number, number] = [16 / 255, 23 / 255, 37 / 255];

  private static readonly LONG_PRESS_MS = 500;
  private static readonly LONG_PRESS_MOVE_PX = 10;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    snapshot: NativeProjectSnapshotV1,
    callbacks: NativeGsViewerCallbacks,
  ) {
    this.snapshot = snapshot;
    this.callbacks = callbacks;
    this.resolution = resolveNativeGsSliceV1(snapshot, this.resourceStates);
    this.scene.background = new THREE.Color().setRGB(...this.backgroundSrgb, THREE.SRGBColorSpace);
    this.camera.position.set(5.5, 4.2, 8.5);
    this.camera.lookAt(0, 0.4, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.35, 0);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xbfdcff, 0x273244, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const grid = new THREE.GridHelper(20, 40, 0x41658a, 0x26364a);
    grid.position.y = -1.15;
    this.scene.add(grid);
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setMode('translate');
    this.gizmo.setSpace('local');
    this.gizmo.setSize(0.75);
    const withHelper = this.gizmo as unknown as { getHelper?: () => THREE.Object3D };
    this.gizmoRoot = withHelper.getHelper?.() ?? this.gizmo as unknown as THREE.Object3D;
    this.gizmoRoot.visible = false;
    this.scene.add(this.gizmoRoot);
    this.gizmo.addEventListener('mouseDown', () => {
      if (this.gizmoTarget?.kind !== 'asset') return;
      const group = this.assetGroups.get(this.gizmoTarget.assetId);
      if (group !== undefined) this.assetScaleDragStart = group.scale.x;
    });
    this.gizmo.addEventListener('dragging-changed', (event) => {
      this.gizmoDragging = (event as unknown as { value: boolean }).value;
      this.controls.enabled = !this.gizmoDragging;
      if (this.gizmoDragging) return;
      if (this.gizmoTarget?.kind === 'caption') this.syncCaptionFromMarker();
      else if (this.gizmoTarget?.kind === 'asset') this.commitAssetTransformFromGroup();
    });
    this.gizmo.addEventListener('objectChange', () => {
      if (this.gizmoTarget?.kind === 'caption') this.syncCaptionFromMarker();
      else if (this.gizmoTarget?.kind === 'asset') this.enforceUniformAssetScale();
    });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.animate();
  }

  async load(
    openRepresentation: (representationId: string) => Promise<WorkspaceReadableFile | null>,
    offlineReady: boolean,
  ): Promise<void> {
    if (this.disposed) throw new Error('native viewer is disposed');
    for (const asset of this.snapshot.assets) {
      const group = new THREE.Group();
      group.name = asset.id;
      const binding = activeNativeBindingV1(this.snapshot, asset.id);
      if (binding === null) continue;
      applySim3(group, binding.assetToProject);
      this.assetGroups.set(asset.id, group);
      this.scene.add(group);
    }
    const ordered = allActiveNativeRepresentationsV1(this.snapshot).sort((left, right) => {
      const rank = (role: NativeRepresentationV1['role']): number => (
        role === 'meshPrimary' ? 0 : role === 'pointPrimary' ? 1 : role === 'interactionProxy' ? 2 : 3
      );
      return rank(left.role) - rank(right.role) || left.id.localeCompare(right.id);
    });
    for (const representation of ordered) {
      const source = await openRepresentation(representation.id);
      if (source === null) {
        this.resourceStates.set(representation.id, { availability: 'missing', registration: 'known' });
        continue;
      }
      if (source.size !== representation.blob.byteLength) {
        this.resourceStates.set(representation.id, { availability: 'failed', registration: 'known' });
        continue;
      }
      try {
        if (representation.role === 'gsPrimary') {
          if (!offlineReady) throw new Error('GS runtime is not offline-ready on this device');
          await this.loadGs(representation, source);
        } else if (representation.role === 'pointPrimary') {
          await this.loadPoint(representation, source);
        } else {
          await this.loadMeshLike(representation, source);
        }
        this.resourceStates.set(representation.id, { availability: 'ready', registration: 'known' });
      } catch (error) {
        this.resourceStates.set(representation.id, { availability: 'failed', registration: 'known' });
        this.callbacks.onRuntimeError(`${representation.role} activation failed: ${errorMessage(error)}`);
      }
    }
    this.currentCaption = this.snapshot.captions[0] ?? null;
    this.updateResolution();
    this.fitCamera();
  }

  getResourceStates(): ReadonlyMap<string, NativeResourceStateV1> {
    return new Map(this.resourceStates);
  }

  getResolution(): NativeSliceResolutionV1 {
    return this.resolution;
  }

  getPointDiameterCssPixels(assetId: string): number {
    return this.pointDiameters.get(assetId) ?? NATIVE_POINT_DIAMETER_DEFAULT_CSS_PX;
  }

  setPointDiameterCssPixels(assetId: string, requested: number): number {
    const hasPoint = activeNativeRepresentationsV1(this.snapshot, assetId)
      .some((representation) => representation.role === 'pointPrimary');
    const diameter = clampNativePointDiameterCssPixels(requested);
    if (!hasPoint) return diameter;
    this.pointDiameters.set(assetId, diameter);
    for (const representation of activeNativeRepresentationsV1(this.snapshot, assetId)) {
      if (representation.role !== 'pointPrimary') continue;
      const root = this.representationObjects.get(representation.id);
      if (root === undefined) continue;
      root.traverse((object) => {
        if (!(object instanceof THREE.Points)) return;
        for (const material of pointMaterials(object)) material.size = diameter;
      });
    }
    return diameter;
  }

  getProjectCamera(): NativeProjectCameraV1 {
    const projection = this.camera instanceof THREE.PerspectiveCamera
      ? { kind: 'perspective' as const, verticalFovRadians: THREE.MathUtils.degToRad(this.camera.fov) }
      : { kind: 'orthographic' as const, verticalSpan: (this.camera.top - this.camera.bottom) / this.camera.zoom };
    return {
      position: tuple(this.camera.position),
      target: tuple(this.controls.target),
      up: tuple(this.camera.up),
      projection,
    };
  }

  applyProjectCamera(camera: NativeProjectCameraV1): void {
    this.setOrthographic(camera.projection.kind === 'orthographic');
    this.camera.position.fromArray(camera.position);
    this.camera.up.fromArray(camera.up);
    this.controls.target.fromArray(camera.target);
    if (this.camera instanceof THREE.PerspectiveCamera && camera.projection.kind === 'perspective') {
      this.camera.fov = THREE.MathUtils.radToDeg(camera.projection.verticalFovRadians);
    } else if (this.camera instanceof THREE.OrthographicCamera && camera.projection.kind === 'orthographic') {
      this.setOrthographicVerticalSpan(camera.projection.verticalSpan);
    }
    this.updateCameraClipping();
    this.resize();
    this.controls.update();
    this.camera.updateMatrixWorld(true);
  }

  getBackground(): NativeSolidBackgroundV1 {
    return { kind: 'solid', colorSrgb: [...this.backgroundSrgb] as [number, number, number] };
  }

  setBackground(background: NativeSolidBackgroundV1): void {
    this.backgroundSrgb = [...background.colorSrgb] as [number, number, number];
    this.scene.background = new THREE.Color().setRGB(...this.backgroundSrgb, THREE.SRGBColorSpace);
  }

  isOrthographic(): boolean {
    return this.camera instanceof THREE.OrthographicCamera;
  }

  setOrthographic(on: boolean): void {
    if (on === this.isOrthographic()) return;
    const previous = this.camera;
    const target = this.controls.target.clone();
    const distance = Math.max(previous.position.distanceTo(target), 0.001);
    const verticalSpan = previous instanceof THREE.PerspectiveCamera
      ? Math.max(2 * Math.tan(THREE.MathUtils.degToRad(previous.fov) / 2) * distance, 0.001)
      : (previous.top - previous.bottom) / previous.zoom;
    if (on) {
      const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, Math.max(previous.far, 100));
      orthographic.position.copy(previous.position);
      orthographic.up.copy(previous.up);
      orthographic.quaternion.copy(previous.quaternion);
      this.camera = orthographic;
      this.setOrthographicVerticalSpan(verticalSpan);
    } else {
      const fov = THREE.MathUtils.radToDeg(2 * Math.atan(verticalSpan / (2 * distance)));
      this.perspectiveCamera.fov = THREE.MathUtils.clamp(fov, 1, 179);
      this.perspectiveCamera.position.copy(previous.position);
      this.perspectiveCamera.up.copy(previous.up);
      this.perspectiveCamera.quaternion.copy(previous.quaternion);
      this.camera = this.perspectiveCamera;
    }
    this.controls.dispose();
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.target.copy(target);
    this.gizmo.camera = this.camera;
    this.updateCameraClipping();
    this.resize();
    this.controls.update();
    this.refreshGizmoAttachment();
  }

  viewAxis(axis: '+x' | '-x' | '+y' | '-y' | '+z' | '-z'): void {
    const bounds = this.visibleBounds();
    if (bounds === null) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.5);
    const dirs: Record<typeof axis, readonly [number, number, number]> = {
      '+x': [1, 0, 0], '-x': [-1, 0, 0],
      '+y': [0, 1, 0], '-y': [0, -1, 0],
      '+z': [0, 0, 1], '-z': [0, 0, -1],
    };
    const distance = this.camera instanceof THREE.PerspectiveCamera
      ? radius * 1.25 / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2)
      : radius * 3;
    const direction = dirs[axis];
    this.camera.position.set(
      center.x + direction[0] * distance,
      center.y + direction[1] * distance,
      center.z + direction[2] * distance,
    );
    if (axis === '+y') this.camera.up.set(0, 0, -1);
    else if (axis === '-y') this.camera.up.set(0, 0, 1);
    else this.camera.up.set(0, 1, 0);
    if (this.camera instanceof THREE.OrthographicCamera) this.setOrthographicVerticalSpan(radius * 2.5);
    this.controls.target.copy(center);
    this.updateCameraClipping();
    this.resize();
    this.controls.update();
    this.camera.updateMatrixWorld(true);
  }

  setSnapshot(snapshot: NativeProjectSnapshotV1): void {
    this.snapshot = snapshot;
    this.repositionCaptionId = null;
    const retainedAssetIds = new Set(snapshot.assets.map((asset) => asset.id));
    for (const [assetId, group] of this.assetGroups) group.visible = retainedAssetIds.has(assetId);
    for (const asset of snapshot.assets) {
      const binding = activeNativeBindingV1(snapshot, asset.id);
      const group = this.assetGroups.get(asset.id);
      if (binding !== null && group !== undefined) applySim3(group, binding.assetToProject);
    }
    const gizmoTarget = this.gizmoTarget;
    if (gizmoTarget?.kind === 'asset' && !snapshot.assets.some((asset) => asset.id === gizmoTarget.assetId)) {
      this.gizmoTarget = null;
    }
    const selectedCaptionId = this.currentCaption?.id ?? null;
    this.currentCaption = selectedCaptionId === null
      ? null
      : snapshot.captions.find((caption) => caption.id === selectedCaptionId) ?? null;
    if (selectedCaptionId !== null && this.currentCaption === null) {
      if (this.gizmoTarget?.kind === 'caption') this.gizmoTarget = null;
    }
    this.clearLongPress();
    this.applyActiveMeshMaterialAppearances();
    this.updateResolution();
  }

  listMeshMaterialSlots(assetId: string): readonly NativeMeshMaterialSlotInfo[] {
    const activeIds = new Set(activeNativeRepresentationsV1(this.snapshot, assetId)
      .filter((representation) => representation.role === 'meshPrimary')
      .map((representation) => representation.id));
    return [...this.meshMaterialSlots.entries()]
      .filter(([representationId]) => activeIds.has(representationId))
      .flatMap(([, slots]) => slots.map((slot) => ({
        representationId: slot.representationId,
        key: slot.key,
        name: slot.name,
        supportsUnlitAndChroma: slot.patchSupported,
        baseline: {
          opacity: slot.baseline.opacity,
          doubleSided: slot.baseline.side === THREE.DoubleSide,
          unlit: false,
          chroma: {
            enabled: false,
            colorSrgb: [0, 0, 0] as const,
            tolerance: 0.1,
            feather: 0,
          },
        },
      })))
      .sort((a, b) => a.representationId.localeCompare(b.representationId) || a.key.localeCompare(b.key));
  }

  /** DisplaySet selection is viewing state. It may change in View mode without
   * mutating the durable Project snapshot. */
  setActiveDisplaySet(displaySetId: string): void {
    this.activeDisplaySetOverride = displaySetId;
    this.applyActiveMeshMaterialAppearances();
    this.updateResolution();
  }

  /** Releases loaded objects that are absent from an already-published snapshot. */
  setSnapshotAndReleaseAbsentResources(snapshot: NativeProjectSnapshotV1): void {
    this.setSnapshot(snapshot);
    const retainedRepresentationIds = new Set(snapshot.representations.map((representation) => representation.id));
    for (const [representationId, object] of this.representationObjects) {
      if (retainedRepresentationIds.has(representationId)) continue;
      if (object.userData.nativeSpark === true) {
        object.removeFromParent();
        this.sparkRuntime?.disposeSplat(representationId);
      } else {
        disposeObject(object);
      }
      this.representationObjects.delete(representationId);
      this.representationBounds.delete(representationId);
      this.resourceStates.delete(representationId);
      this.meshMaterialSlots.delete(representationId);
    }
    const retainedAssetIds = new Set(snapshot.assets.map((asset) => asset.id));
    for (const [assetId, group] of this.assetGroups) {
      if (retainedAssetIds.has(assetId)) continue;
      group.removeFromParent();
      this.assetGroups.delete(assetId);
    }
  }

  selectCaption(captionId: string | null): boolean {
    const next = captionId === null
      ? null
      : this.snapshot.captions.find((caption) => caption.id === captionId);
    if (next === undefined) return false;
    this.repositionCaptionId = null;
    this.currentCaption = next;
    this.clearLongPress();
    this.gizmoTarget = null;
    this.syncCaptionMarkers();
    this.refreshGizmoAttachment();
    return true;
  }

  setEditingEnabled(enabled: boolean): void {
    if (this.editingEnabled === enabled) return;
    this.editingEnabled = enabled;
    if (!enabled) {
      this.clearLongPress();
      this.repositionCaptionId = null;
      this.gizmoTarget = null;
      this.gizmoDragging = false;
      this.controls.enabled = true;
      this.applyActiveAssetTransforms();
    }
    this.updateResolution();
  }

  selectAlignmentAsset(assetId: string): boolean {
    const visual = activeNativeRepresentationsV1(this.snapshot, assetId)
      .some((representation) => (
        representation.role === 'meshPrimary' || representation.role === 'pointPrimary' || representation.role === 'gsPrimary'
      ));
    if (!visual || !this.assetGroups.has(assetId)) return false;
    this.repositionCaptionId = null;
    this.gizmoTarget = { kind: 'asset', assetId };
    this.gizmo.setMode(this.assetGizmoMode);
    this.updateResolution();
    return this.gizmoRoot.visible;
  }

  setAssetGizmoMode(mode: NativeAssetGizmoMode): void {
    this.assetGizmoMode = mode;
    if (this.gizmoTarget?.kind === 'asset') this.gizmo.setMode(mode);
    this.refreshGizmoAttachment();
  }

  editCaptionPosition(): boolean {
    if (this.currentCaption === null || !this.captionMarkers.has(this.currentCaption.id)) return false;
    this.repositionCaptionId = null;
    this.gizmoTarget = { kind: 'caption' };
    this.gizmo.setMode('translate');
    this.updateResolution();
    return this.gizmoRoot.visible;
  }

  stopCaptionPositionEditing(): boolean {
    if (this.gizmoTarget?.kind !== 'caption') return false;
    this.gizmoTarget = null;
    this.refreshGizmoAttachment();
    return true;
  }

  armCaptionReposition(captionId: string): boolean {
    if (!this.editingEnabled) return false;
    const caption = this.snapshot.captions.find((candidate) => candidate.id === captionId);
    const targetAssetId = caption?.anchor?.assetId ?? this.snapshot.presentation.captionTargetAssetId;
    if (caption === undefined || targetAssetId === null || !this.assetIsVisible(targetAssetId)) return false;
    this.currentCaption = caption;
    this.repositionCaptionId = caption.id;
    this.gizmoTarget = null;
    this.syncCaptionMarkers();
    this.refreshGizmoAttachment();
    return true;
  }

  disposeGs(): void {
    const gsRepresentations = allActiveNativeRepresentationsV1(this.snapshot)
      .filter((representation) => representation.role === 'gsPrimary');
    for (const gs of gsRepresentations) {
      this.representationObjects.get(gs.id)?.removeFromParent();
      this.representationObjects.delete(gs.id);
      this.representationBounds.delete(gs.id);
      this.resourceStates.set(gs.id, { availability: 'missing', registration: 'known' });
      this.sparkRuntime?.disposeSplat(gs.id);
    }
    this.updateResolution();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.clearLongPress();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.gizmo.detach();
    this.gizmo.dispose();
    this.controls.dispose();
    this.sparkRuntime?.dispose();
    this.sparkRuntime = null;
    for (const object of this.representationObjects.values()) {
      if (object.userData.nativeSpark === true) object.removeFromParent();
      else disposeObject(object);
    }
    this.representationObjects.clear();
    this.representationBounds.clear();
    this.meshMaterialSlots.clear();
    this.assetGroups.clear();
    for (const marker of this.captionMarkers.values()) {
      marker.removeFromParent();
      marker.geometry.dispose();
      disposeMaterial(marker.material);
    }
    this.captionMarkers.clear();
    this.renderer.dispose();
  }

  private async loadMeshLike(representation: NativeRepresentationV1, source: WorkspaceReadableFile): Promise<void> {
    const format = nativeModelFormat(representation.formatProfile.id);
    if (format === null) throw new Error(`unsupported model profile ${representation.formatProfile.id}`);
    const loaded = await loadModel(format, await collectStream(source));
    if (representation.role === 'interactionProxy') {
      if (loaded.stats.triangles < 1) throw new Error('Interaction Proxy must contain triangles');
      makeProxyInvisible(loaded.root);
    } else if (representation.role === 'meshPrimary') {
      this.meshMaterialSlots.set(
        representation.id,
        registerNativeMeshMaterialSlots(loaded.root, representation.id),
      );
    }
    loaded.root.name = representation.id;
    loaded.root.userData.representationId = representation.id;
    applyCanonicalTransform(loaded.root, representation.representationToAsset);
    const group = this.assetGroups.get(representation.assetId);
    if (group === undefined) throw new Error('Representation Asset group is unavailable');
    group.add(loaded.root);
    this.representationObjects.set(representation.id, loaded.root);
    this.applyActiveMeshMaterialAppearances();
  }

  private applyActiveMeshMaterialAppearances(): void {
    this.materialIssues = [];
    for (const slots of this.meshMaterialSlots.values()) {
      for (const slot of slots) {
        slot.material.opacity = slot.baseline.opacity;
        slot.material.transparent = slot.baseline.transparent;
        slot.material.depthWrite = slot.baseline.depthWrite;
        slot.material.side = slot.baseline.side;
        setUnlit(slot.material, false);
        setChroma(slot.material, null);
        slot.material.needsUpdate = true;
      }
    }
    const activeSetId = this.activeDisplaySetOverride ?? this.snapshot.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
    for (const appearance of this.snapshot.meshMaterialAppearances ?? []) {
      if (appearance.displaySetId !== activeSetId) continue;
      const issue = this.applyMeshMaterialAppearance(appearance);
      if (issue !== null) this.materialIssues.push(issue);
    }
  }

  private applyMeshMaterialAppearance(appearance: NativeMeshMaterialAppearanceV1): string | null {
    const slot = this.meshMaterialSlots.get(appearance.representationId)
      ?.find((candidate) => candidate.key === appearance.materialSlotKey);
    if (slot === undefined) {
      return `Material setting ${appearance.id} was not applied because its exact surface is unavailable.`;
    }
    slot.material.opacity = appearance.opacity;
    slot.material.side = appearance.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    slot.material.transparent = slot.baseline.transparent || appearance.opacity < 1 || appearance.chroma.enabled;
    slot.material.depthWrite = slot.baseline.depthWrite && appearance.opacity >= 1 && !appearance.chroma.enabled;
    setUnlit(slot.material, appearance.unlit && slot.patchSupported);
    setChroma(slot.material, appearance.chroma.enabled && slot.patchSupported ? {
      enable: true,
      color: chromaHex(appearance.chroma.colorSrgb),
      tolerance: appearance.chroma.tolerance,
      feather: appearance.chroma.feather,
    } : null);
    slot.material.needsUpdate = true;
    return !slot.patchSupported && (appearance.unlit || appearance.chroma.enabled)
      ? `Material setting ${appearance.id} applied opacity/sidedness only; this surface does not support unlit or chroma.`
      : null;
  }

  private async loadPoint(representation: NativeRepresentationV1, source: WorkspaceReadableFile): Promise<void> {
    if (representation.pointPly === undefined) throw new Error('ordinary-point PLY facts are absent');
    const inspection = await inspectNativePointPlyV1(source);
    if (
      inspection.kind !== 'supported-point' ||
      inspection.facts.pointCount !== representation.pointPly.pointCount ||
      inspection.facts.headerByteLength !== representation.pointPly.headerByteLength ||
      inspection.facts.encoding !== representation.pointPly.encoding
    ) {
      throw new Error('ordinary-point PLY no longer matches its admitted profile facts');
    }
    const loaded = await loadModel('ply', await collectStream(source));
    if (loaded.kind !== 'points' || loaded.stats.points !== representation.pointPly.pointCount || loaded.stats.triangles !== 0) {
      throw new Error('ordinary-point decoder output does not match the admitted point-only profile');
    }
    const diameter = this.getPointDiameterCssPixels(representation.assetId);
    preparePointPresentation(loaded.root, diameter);
    loaded.root.name = representation.id;
    loaded.root.userData.representationId = representation.id;
    applyCanonicalTransform(loaded.root, representation.representationToAsset);
    const group = this.assetGroups.get(representation.assetId);
    if (group === undefined) throw new Error('Point Asset group is unavailable');
    group.add(loaded.root);
    this.representationObjects.set(representation.id, loaded.root);
  }

  private async loadGs(representation: NativeRepresentationV1, source: WorkspaceReadableFile): Promise<void> {
    if (representation.gsPly === undefined) throw new Error('GS PLY facts are absent');
    const inspection = await inspectNativeGsPlyV1(source);
    if (
      inspection.kind !== 'supported-gs' ||
      inspection.facts.shDegree !== representation.gsPly.shDegree ||
      inspection.facts.splatCount !== representation.gsPly.splatCount ||
      inspection.facts.headerByteLength !== representation.gsPly.headerByteLength ||
      inspection.facts.recordStrideBytes !== representation.gsPly.recordStrideBytes ||
      inspection.facts.payloadByteLength !== representation.gsPly.payloadByteLength
    ) {
      throw new Error('GS PLY no longer matches its admitted header facts');
    }
    this.sparkRuntime ??= await NativeSparkRuntime.create(this.renderer, this.scene);
    const loaded = await this.sparkRuntime.load(source, representation.id, representation.gsPly.splatCount, (bytes) => {
      this.callbacks.onProgress(`GS load: ${bytes.toLocaleString()} / ${source.size.toLocaleString()} bytes`);
    });
    loaded.object.name = representation.id;
    loaded.object.userData.representationId = representation.id;
    loaded.object.userData.nativeSpark = true;
    applyCanonicalTransform(loaded.object, representation.representationToAsset);
    const group = this.assetGroups.get(representation.assetId);
    if (group === undefined) throw new Error('GS Asset group is unavailable');
    group.add(loaded.object);
    this.representationObjects.set(representation.id, loaded.object);
    this.representationBounds.set(representation.id, loaded.bounds.clone());
    this.callbacks.onProgress(`GS ready: ${loaded.splatCount.toLocaleString()} splats`);
  }

  private updateResolution(): void {
    this.resolution = resolveNativeGsSliceV1(this.snapshot, this.resourceStates);
    const visible = new Set(this.resolution.visibleRepresentationIds);
    for (const representation of this.snapshot.representations) {
      const object = this.representationObjects.get(representation.id);
      if (object === undefined) continue;
      if (representation.role === 'interactionProxy') {
        const targetGs = activeNativeRepresentationsV1(this.snapshot, representation.assetId).find((candidate) => (
          candidate.role === 'gsPrimary' &&
          candidate.variantFamilyId === representation.proxyForGsVariantFamilyId
        ));
        object.visible = targetGs !== undefined && visible.has(targetGs.id);
      } else {
        object.visible = visible.has(representation.id);
      }
    }
    this.syncCaptionMarkers();
    this.refreshGizmoAttachment();
    this.callbacks.onIssuesChanged([...this.resolution.issues, ...this.materialIssues]);
  }

  private applyActiveAssetTransforms(): void {
    for (const asset of this.snapshot.assets) {
      const binding = activeNativeBindingV1(this.snapshot, asset.id);
      const group = this.assetGroups.get(asset.id);
      if (binding !== null && group !== undefined) applySim3(group, binding.assetToProject);
    }
  }

  private assetIsVisible(assetId: string): boolean {
    const visible = new Set(this.resolution.visibleRepresentationIds);
    return activeNativeRepresentationsV1(this.snapshot, assetId).some((representation) => (
      representation.role !== 'interactionProxy' && visible.has(representation.id)
    ));
  }

  private refreshGizmoAttachment(): void {
    this.gizmo.detach();
    this.gizmoRoot.visible = false;
    if (!this.editingEnabled) return;
    if (this.gizmoTarget?.kind === 'caption') {
      const marker = this.currentCaption === null ? undefined : this.captionMarkers.get(this.currentCaption.id);
      if (marker === undefined || !marker.visible) return;
      this.gizmo.setMode('translate');
      this.gizmo.attach(marker);
      this.gizmoRoot.visible = true;
      return;
    }
    if (this.gizmoTarget?.kind !== 'asset' || !this.assetIsVisible(this.gizmoTarget.assetId)) return;
    const group = this.assetGroups.get(this.gizmoTarget.assetId);
    if (group === undefined) return;
    this.gizmo.setMode(this.assetGizmoMode);
    this.gizmo.attach(group);
    this.gizmoRoot.visible = true;
  }

  private enforceUniformAssetScale(): void {
    if (this.gizmoTarget?.kind !== 'asset' || this.assetGizmoMode !== 'scale') return;
    const group = this.assetGroups.get(this.gizmoTarget.assetId);
    if (group === undefined) return;
    const candidates = [group.scale.x, group.scale.y, group.scale.z];
    let selected = candidates[0]!;
    for (const candidate of candidates.slice(1)) {
      if (Math.abs(candidate - this.assetScaleDragStart) > Math.abs(selected - this.assetScaleDragStart)) {
        selected = candidate;
      }
    }
    group.scale.setScalar(Math.max(Math.abs(selected), 0.000001));
  }

  private commitAssetTransformFromGroup(): void {
    if (!this.editingEnabled || this.gizmoTarget?.kind !== 'asset') return;
    const assetId = this.gizmoTarget.assetId;
    const group = this.assetGroups.get(assetId);
    if (group === undefined) return;
    this.enforceUniformAssetScale();
    const transform = normalizeNativeSim3({
      translation: tuple(group.position),
      rotationXYZW: [group.quaternion.x, group.quaternion.y, group.quaternion.z, group.quaternion.w],
      uniformScale: group.scale.x,
    });
    this.callbacks.onAssetTransformCommitted(assetId, transform);
  }

  private pointerAt(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private pickPointAt(
    surface: THREE.Object3D,
    representationId: string,
    pointer: THREE.Vector2,
    diameterCssPixels: number,
  ): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !surface.visible) return null;
    const pointerCss = {
      xCss: (pointer.x + 1) * 0.5 * rect.width,
      yCss: (1 - pointer.y) * 0.5 * rect.height,
    };
    const pointObjects: THREE.Points[] = [];
    surface.traverse((object) => {
      if (object instanceof THREE.Points && object.visible) pointObjects.push(object);
    });
    const camera = this.camera;
    function* projectedPoints(): Generator<NativeProjectedPointPick> {
      const local = new THREE.Vector3();
      const world = new THREE.Vector3();
      const projected = new THREE.Vector3();
      for (const object of pointObjects) {
        const positions = object.geometry.getAttribute('position');
        if (positions === undefined) continue;
        for (let index = 0; index < positions.count; index += 1) {
          local.set(positions.getX(index), positions.getY(index), positions.getZ(index));
          world.copy(local).applyMatrix4(object.matrixWorld);
          projected.copy(world).project(camera);
          if (
            !Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z) ||
            projected.z < -1 || projected.z > 1
          ) continue;
          yield {
            representationId,
            pointIndex: index,
            xCss: (projected.x + 1) * 0.5 * rect.width,
            yCss: (1 - projected.y) * 0.5 * rect.height,
            depth: projected.z,
            world: tuple(world),
          };
        }
      }
    }
    const selected = selectNativeProjectedPoint(projectedPoints(), pointerCss, diameterCssPixels);
    return selected === null ? null : new THREE.Vector3().fromArray(selected.world);
  }

  private selectCaptionAt(pointer: THREE.Vector2): boolean {
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(pointer, this.camera);
    const captionHit = this.raycaster.intersectObjects(
      [...this.captionMarkers.values()].filter((marker) => marker.visible),
      false,
    )[0];
    const captionId = captionHit?.object.userData.nativeCaptionId;
    if (typeof captionId === 'string' && this.selectCaption(captionId)) {
      this.callbacks.onCaptionSelected(captionId);
      return true;
    }
    return false;
  }

  private placeCaptionAt(pointer: THREE.Vector2): void {
    const interaction = this.resolution.interaction;
    if (!this.editingEnabled) return;
    if (!interaction.enabled) {
      this.callbacks.onIssuesChanged([...this.resolution.issues, interaction.reason]);
      return;
    }
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(pointer, this.camera);
    const surface = this.representationObjects.get(interaction.surfaceRepresentationId);
    const group = this.assetGroups.get(interaction.targetAssetId);
    if (surface === undefined || group === undefined) return;
    const hitPoint = interaction.targetRole === 'pointPrimary'
      ? this.pickPointAt(
          surface,
          interaction.surfaceRepresentationId,
          pointer,
          this.getPointDiameterCssPixels(interaction.targetAssetId),
        )
      : this.raycaster.intersectObject(surface, true)[0]?.point ?? null;
    if (hitPoint === null) {
      this.callbacks.onIssuesChanged([...this.resolution.issues, 'No hit on the selected interaction surface.']);
      return;
    }
    const repositioned = this.repositionCaptionId === null
      ? null
      : this.snapshot.captions.find((caption) => caption.id === this.repositionCaptionId) ?? null;
    if (this.repositionCaptionId !== null && repositioned === null) {
      this.repositionCaptionId = null;
      this.callbacks.onIssuesChanged([...this.resolution.issues, 'The Caption selected for re-placement is unavailable.']);
      return;
    }
    if (repositioned?.anchor !== null && repositioned?.anchor !== undefined && repositioned.anchor.assetId !== interaction.targetAssetId) {
      this.callbacks.onIssuesChanged([...this.resolution.issues, 'Re-placement must use the Caption owning Asset.']);
      return;
    }
    if (repositioned === null) {
      if (!this.callbacks.onCaptionCreationStarted()) return;
      this.currentCaption = null;
      this.syncCaptionMarkers();
    }
    const asset = this.snapshot.assets.find((candidate) => candidate.id === interaction.targetAssetId);
    const binding = activeNativeBindingV1(this.snapshot, interaction.targetAssetId);
    const revision = this.snapshot.assetRevisions.find((candidate) => candidate.id === binding?.assetRevisionId);
    const visual = activeNativeRepresentationsV1(this.snapshot, interaction.targetAssetId)
      .find((candidate) => candidate.role === interaction.targetRole);
    const compatibility = revision?.anchorCompatibilityClasses.find((entry) => entry.targetVariantFamilyIds.includes(visual?.variantFamilyId ?? ''));
    if (asset === undefined || revision === undefined || compatibility === undefined) {
      this.callbacks.onIssuesChanged([...this.resolution.issues, 'Caption target closure is invalid.']);
      return;
    }
    const positionAsset = group.worldToLocal(hitPoint.clone());
    const caption: NativeCaptionV1 = {
      ...(repositioned ?? {}),
      id: repositioned?.id ?? newNativeId('cap'),
      title: repositioned?.title ?? 'Caption',
      body: repositioned?.body ?? '',
      anchor: {
        kind: 'asset',
        assetId: asset.id,
        assetFrameId: asset.assetFrameId,
        positionAsset: tuple(positionAsset),
        authoredAssetRevisionId: revision.id,
        authoredAnchorCompatibilityId: compatibility.id,
        hitEvidence: { method: 'manual' },
      },
    };
    if (!this.acceptCaptionChange(caption)) return;
    this.repositionCaptionId = null;
    this.gizmoTarget = { kind: 'caption' };
    this.syncCaptionMarkers();
    this.refreshGizmoAttachment();
    this.callbacks.onIssuesChanged([
      ...this.resolution.issues,
      repositioned === null
        ? 'Coarse hit accepted. Adjust the gizmo, then save.'
        : 'Caption re-placement accepted on the active surface. Adjust the gizmo, then save.',
    ]);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.gizmoDragging || this.gizmo.axis !== null) return;
    const pointer = this.pointerAt(event.clientX, event.clientY);
    if (this.selectCaptionAt(pointer)) return;

    if (event.pointerType === 'touch') {
      if (!this.editingEnabled) return;
      this.clearLongPress();
      this.longPressStart = { x: event.clientX, y: event.clientY };
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        this.longPressStart = null;
        this.placeCaptionAt(pointer);
      }, NativeGsViewer.LONG_PRESS_MS);
      return;
    }

    if (event.shiftKey) {
      this.placeCaptionAt(pointer);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.longPressTimer === null || this.longPressStart === null) return;
    const dx = event.clientX - this.longPressStart.x;
    const dy = event.clientY - this.longPressStart.y;
    if (dx * dx + dy * dy > NativeGsViewer.LONG_PRESS_MOVE_PX ** 2) this.clearLongPress();
  };

  private readonly onPointerUp = (): void => {
    this.clearLongPress();
  };

  private clearLongPress(): void {
    if (this.longPressTimer !== null) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
    this.longPressStart = null;
  }

  private syncCaptionMarkers(): void {
    const activeDisplaySetId = this.activeDisplaySetOverride ?? this.snapshot.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
    const activeCaptions = this.snapshot.captions.filter((caption) => nativeCaptionDisplaySetIdV1(caption) === activeDisplaySetId);
    const captionIds = new Set(activeCaptions.map((caption) => caption.id));
    for (const [captionId, marker] of this.captionMarkers) {
      if (captionIds.has(captionId)) continue;
      if (this.gizmo.object === marker) this.gizmo.detach();
      marker.removeFromParent();
      marker.geometry.dispose();
      disposeMaterial(marker.material);
      this.captionMarkers.delete(captionId);
    }
    for (const caption of activeCaptions) {
      if (caption.anchor === null) {
        const existing = this.captionMarkers.get(caption.id);
        if (existing !== undefined) {
          if (this.gizmo.object === existing) this.gizmo.detach();
          existing.removeFromParent();
          existing.geometry.dispose();
          disposeMaterial(existing.material);
          this.captionMarkers.delete(caption.id);
        }
        continue;
      }
      let marker = this.captionMarkers.get(caption.id);
      if (marker === undefined) {
        marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 20, 12),
        new THREE.MeshStandardMaterial({ color: 0xffd33d, emissive: 0x8a5b00, emissiveIntensity: 1.4 }),
      );
        marker.name = 'Caption positionAsset';
        marker.userData.nativeCaptionId = caption.id;
        this.captionMarkers.set(caption.id, marker);
      }
      const group = this.assetGroups.get(caption.anchor.assetId);
      if (group === undefined) {
        marker.removeFromParent();
        marker.visible = false;
        continue;
      }
      group.add(marker);
      marker.position.fromArray(caption.anchor.positionAsset);
      marker.quaternion.identity();
      marker.scale.setScalar(1);
      marker.visible = this.assetIsVisible(caption.anchor.assetId);
      const material = marker.material as THREE.MeshStandardMaterial;
      const selected = caption.id === this.currentCaption?.id;
      const needsReview = nativeCaptionNeedsReviewV1(this.snapshot, caption);
      material.color.setHex(needsReview ? (selected ? 0xff9f43 : 0xff6b6b) : selected ? 0xffd33d : 0x66d9ff);
      material.emissive.setHex(needsReview ? 0x8f2f1f : selected ? 0x8a5b00 : 0x075985);
      material.emissiveIntensity = selected ? 1.4 : 0.85;
    }
  }

  private syncCaptionFromMarker(): void {
    const marker = this.currentCaption === null ? undefined : this.captionMarkers.get(this.currentCaption.id);
    if (
      !this.editingEnabled || this.gizmoTarget?.kind !== 'caption' ||
      marker === undefined || this.currentCaption === null || this.currentCaption.anchor === null
    ) return;
    const next = {
      ...this.currentCaption,
      anchor: { ...this.currentCaption.anchor, positionAsset: tuple(marker.position), hitEvidence: { method: 'manual' } as const },
    };
    if (!this.acceptCaptionChange(next)) marker.position.fromArray(this.currentCaption.anchor.positionAsset);
  }

  private acceptCaptionChange(caption: NativeCaptionV1): boolean {
    if (!this.callbacks.onCaptionChanged(caption)) return false;
    const index = this.snapshot.captions.findIndex((candidate) => candidate.id === caption.id);
    const captions = index < 0
      ? [...this.snapshot.captions, caption]
      : this.snapshot.captions.map((candidate) => candidate.id === caption.id ? caption : candidate);
    this.snapshot = { ...this.snapshot, captions };
    this.currentCaption = caption;
    if (index < 0) this.callbacks.onCaptionSelected(caption.id);
    return true;
  }

  fitCamera(): void {
    const bounds = this.visibleBounds();
    if (bounds === null) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.5);
    const direction = new THREE.Vector3(1.4, 0.9, 1.8).normalize();
    const distance = this.camera instanceof THREE.PerspectiveCamera
      ? radius * 1.25 / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2)
      : radius * 3;
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.up.set(0, 1, 0);
    if (this.camera instanceof THREE.OrthographicCamera) this.setOrthographicVerticalSpan(radius * 2.5);
    this.updateCameraClipping();
    this.resize();
    this.controls.update();
    this.camera.updateMatrixWorld(true);
  }

  private visibleBounds(): THREE.Box3 | null {
    this.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    const visible = new Set(this.resolution.visibleRepresentationIds);
    for (const [representationId, object] of this.representationObjects) {
      const representation = this.snapshot.representations.find((candidate) => candidate.id === representationId);
      if (representation?.role === 'interactionProxy' || !visible.has(representationId)) continue;
      const localGsBounds = this.representationBounds.get(representationId);
      const objectBounds = localGsBounds === undefined
        ? new THREE.Box3().setFromObject(object)
        : localGsBounds.clone().applyMatrix4(object.matrixWorld);
      if (!objectBounds.isEmpty()) bounds.union(objectBounds);
    }
    return bounds.isEmpty() ? null : bounds;
  }

  private setOrthographicVerticalSpan(verticalSpan: number): void {
    if (!(this.camera instanceof THREE.OrthographicCamera)) return;
    const aspect = Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
    const halfHeight = verticalSpan / 2;
    const halfWidth = halfHeight * aspect;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
  }

  private updateCameraClipping(): void {
    const distance = Math.max(this.camera.position.distanceTo(this.controls.target), 0.001);
    this.camera.near = Math.max(distance / 100_000, 0.0001);
    this.camera.far = Math.max(distance * 1_000, 100);
    this.camera.updateProjectionMatrix();
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = width / height;
    } else {
      const halfHeight = (this.camera.top - this.camera.bottom) / 2;
      const halfWidth = halfHeight * (width / height);
      this.camera.left = -halfWidth;
      this.camera.right = halfWidth;
    }
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.callbacks.onRuntimeError('WebGL context was lost. New GS writes remain disabled until the project is reopened.');
  };
}
