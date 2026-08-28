import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { loadModel } from '../viewer/loaders';
import { inspectNativeGsPlyV1 } from './plyProfile';
import { resolveNativeGsSliceV1, type NativeResourceStateV1, type NativeSliceResolutionV1 } from './resolver';
import {
  nativeModelFormat,
  newNativeId,
  type NativeCaptionV1,
  type NativeCanonicalTransformV1,
  type NativeProjectSnapshotV1,
  type NativeRepresentationV1,
  type NativeSim3V1,
} from './schema';
import { NativeSparkRuntime } from './sparkRuntime';
import type { WorkspaceReadableFile } from '../platform/fs';

export interface NativeGsViewerCallbacks {
  onCaptionChanged(caption: NativeCaptionV1): void;
  onIssuesChanged(issues: readonly string[]): void;
  onProgress(message: string): void;
  onRuntimeError(message: string): void;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class NativeGsViewer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.01, 100_000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly gizmo: TransformControls;
  private readonly gizmoRoot: THREE.Object3D;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver;
  private readonly assetGroups = new Map<string, THREE.Group>();
  private readonly representationObjects = new Map<string, THREE.Object3D>();
  private readonly representationBounds = new Map<string, THREE.Box3>();
  private readonly resourceStates = new Map<string, NativeResourceStateV1>();
  private readonly callbacks: NativeGsViewerCallbacks;
  private snapshot: NativeProjectSnapshotV1;
  private sparkRuntime: NativeSparkRuntime | null = null;
  private captionMarker: THREE.Mesh | null = null;
  private currentCaption: NativeCaptionV1 | null = null;
  private placementArmed = false;
  private editingEnabled = false;
  private gizmoDragging = false;
  private disposed = false;
  private animationFrame = 0;
  private resolution: NativeSliceResolutionV1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    snapshot: NativeProjectSnapshotV1,
    callbacks: NativeGsViewerCallbacks,
  ) {
    this.snapshot = snapshot;
    this.callbacks = callbacks;
    this.resolution = resolveNativeGsSliceV1(snapshot, this.resourceStates);
    this.scene.background = new THREE.Color(0x101725);
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
    this.scene.add(this.gizmoRoot);
    this.gizmo.addEventListener('dragging-changed', (event) => {
      this.gizmoDragging = (event as unknown as { value: boolean }).value;
      this.controls.enabled = !this.gizmoDragging;
      if (!this.gizmoDragging) this.syncCaptionFromMarker();
    });
    this.gizmo.addEventListener('objectChange', () => this.syncCaptionFromMarker());
    this.canvas.addEventListener('click', this.onCanvasClick);
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
      const binding = this.snapshot.assetBindingRevisions.find((entry) => entry.id === asset.status.activeBindingId);
      if (binding === undefined) continue;
      applySim3(group, binding.assetToProject);
      this.assetGroups.set(asset.id, group);
      this.scene.add(group);
    }
    const ordered = [...this.snapshot.representations].sort((left, right) => {
      const rank = (role: NativeRepresentationV1['role']): number => role === 'meshPrimary' ? 0 : role === 'interactionProxy' ? 1 : 2;
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
    if (this.currentCaption !== null) this.showCaption(this.currentCaption);
    this.updateResolution();
    this.fitCamera();
  }

  getResourceStates(): ReadonlyMap<string, NativeResourceStateV1> {
    return new Map(this.resourceStates);
  }

  getResolution(): NativeSliceResolutionV1 {
    return this.resolution;
  }

  setSnapshot(snapshot: NativeProjectSnapshotV1): void {
    this.snapshot = snapshot;
    for (const binding of snapshot.assetBindingRevisions) {
      const group = this.assetGroups.get(binding.assetId);
      if (group !== undefined) applySim3(group, binding.assetToProject);
    }
    this.currentCaption = snapshot.captions[0] ?? null;
    if (this.currentCaption === null) this.hideCaption();
    else this.showCaption(this.currentCaption);
    this.placementArmed = false;
    this.updateResolution();
  }

  setEditingEnabled(enabled: boolean): void {
    this.editingEnabled = enabled;
    if (!enabled) this.placementArmed = false;
    this.updateResolution();
  }

  armPlacement(): boolean {
    this.updateResolution();
    const interaction = this.resolution.interaction;
    this.placementArmed = this.editingEnabled && interaction.enabled;
    if (!interaction.enabled) {
      this.callbacks.onIssuesChanged([...this.resolution.issues, interaction.reason]);
    }
    return this.placementArmed;
  }

  disposeGs(): void {
    const gs = this.snapshot.representations.find((representation) => representation.role === 'gsPrimary');
    if (gs !== undefined) {
      this.representationObjects.get(gs.id)?.removeFromParent();
      this.representationObjects.delete(gs.id);
      this.representationBounds.delete(gs.id);
      this.resourceStates.set(gs.id, { availability: 'missing', registration: 'known' });
    }
    this.sparkRuntime?.disposeSplat();
    this.updateResolution();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('click', this.onCanvasClick);
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
    this.assetGroups.clear();
    this.captionMarker?.geometry.dispose();
    if (this.captionMarker !== null) disposeMaterial(this.captionMarker.material);
    this.captionMarker = null;
    this.renderer.dispose();
  }

  private async loadMeshLike(representation: NativeRepresentationV1, source: WorkspaceReadableFile): Promise<void> {
    const format = nativeModelFormat(representation.formatProfile.id);
    if (format === null) throw new Error(`unsupported model profile ${representation.formatProfile.id}`);
    const loaded = await loadModel(format, await collectStream(source));
    if (representation.role === 'interactionProxy') {
      if (loaded.stats.triangles < 1) throw new Error('Interaction Proxy must contain triangles');
      makeProxyInvisible(loaded.root);
    }
    loaded.root.name = representation.id;
    loaded.root.userData.representationId = representation.id;
    applyCanonicalTransform(loaded.root, representation.representationToAsset);
    const group = this.assetGroups.get(representation.assetId);
    if (group === undefined) throw new Error('Representation Asset group is unavailable');
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
        const targetGs = this.snapshot.representations.find((candidate) => (
          candidate.role === 'gsPrimary' && candidate.assetId === representation.assetId &&
          candidate.variantFamilyId === representation.proxyForGsVariantFamilyId
        ));
        object.visible = targetGs !== undefined && visible.has(targetGs.id);
      } else {
        object.visible = visible.has(representation.id);
      }
    }
    if (this.captionMarker !== null && this.currentCaption !== null) {
      const active = this.snapshot.representations.some((representation) => (
        representation.assetId === this.currentCaption?.anchor.assetId &&
        representation.role !== 'interactionProxy' && visible.has(representation.id)
      ));
      this.captionMarker.visible = active;
      if (active && this.editingEnabled) this.gizmo.attach(this.captionMarker);
      else this.gizmo.detach();
      this.gizmoRoot.visible = active && this.editingEnabled;
    } else {
      this.gizmoRoot.visible = false;
    }
    this.callbacks.onIssuesChanged(this.resolution.issues);
  }

  private readonly onCanvasClick = (event: MouseEvent): void => {
    const interaction = this.resolution.interaction;
    if (!this.editingEnabled || !this.placementArmed || this.gizmoDragging || !interaction.enabled) return;
    this.placementArmed = false;
    const surface = this.representationObjects.get(interaction.surfaceRepresentationId);
    const group = this.assetGroups.get(interaction.targetAssetId);
    if (surface === undefined || group === undefined) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(surface, true)[0];
    if (hit === undefined) {
      this.callbacks.onIssuesChanged([...this.resolution.issues, 'No hit on the selected interaction surface.']);
      return;
    }
    const asset = this.snapshot.assets.find((candidate) => candidate.id === interaction.targetAssetId);
    const binding = this.snapshot.assetBindingRevisions.find((candidate) => candidate.id === asset?.status.activeBindingId);
    const revision = this.snapshot.assetRevisions.find((candidate) => candidate.id === binding?.assetRevisionId);
    const visual = revision?.representationIds
      .map((id) => this.snapshot.representations.find((candidate) => candidate.id === id))
      .find((candidate) => candidate?.role === interaction.targetRole);
    const compatibility = revision?.anchorCompatibilityClasses.find((entry) => entry.targetVariantFamilyIds.includes(visual?.variantFamilyId ?? ''));
    if (asset === undefined || revision === undefined || compatibility === undefined) {
      this.callbacks.onIssuesChanged([...this.resolution.issues, 'Caption target closure is invalid.']);
      return;
    }
    const positionAsset = group.worldToLocal(hit.point.clone());
    const caption: NativeCaptionV1 = {
      id: this.currentCaption?.id ?? newNativeId('cap'),
      title: this.currentCaption?.title ?? 'Caption',
      body: this.currentCaption?.body ?? '',
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
    this.currentCaption = caption;
    this.showCaption(caption);
    this.callbacks.onCaptionChanged(caption);
    this.callbacks.onIssuesChanged([...this.resolution.issues, 'Coarse hit accepted. Adjust the gizmo, then save.']);
  };

  private showCaption(caption: NativeCaptionV1): void {
    if (this.captionMarker === null) {
      this.captionMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 20, 12),
        new THREE.MeshStandardMaterial({ color: 0xffd33d, emissive: 0x8a5b00, emissiveIntensity: 1.4 }),
      );
      this.captionMarker.name = 'Caption positionAsset';
    }
    const group = this.assetGroups.get(caption.anchor.assetId);
    if (group === undefined) return;
    group.add(this.captionMarker);
    this.captionMarker.position.fromArray(caption.anchor.positionAsset);
    this.captionMarker.quaternion.identity();
    this.captionMarker.scale.setScalar(1);
    if (this.editingEnabled) this.gizmo.attach(this.captionMarker);
    this.updateResolution();
  }

  private hideCaption(): void {
    this.gizmo.detach();
    this.captionMarker?.removeFromParent();
  }

  private syncCaptionFromMarker(): void {
    if (!this.editingEnabled || this.captionMarker === null || this.currentCaption === null) return;
    this.currentCaption = {
      ...this.currentCaption,
      anchor: { ...this.currentCaption.anchor, positionAsset: tuple(this.captionMarker.position), hitEvidence: { method: 'manual' } },
    };
    this.callbacks.onCaptionChanged(this.currentCaption);
  }

  private fitCamera(): void {
    this.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    for (const [representationId, object] of this.representationObjects) {
      const representation = this.snapshot.representations.find((candidate) => candidate.id === representationId);
      if (representation?.role === 'interactionProxy') continue;
      const localGsBounds = this.representationBounds.get(representationId);
      const objectBounds = localGsBounds === undefined
        ? new THREE.Box3().setFromObject(object)
        : localGsBounds.clone().applyMatrix4(object.matrixWorld);
      if (!objectBounds.isEmpty()) bounds.union(objectBounds);
    }
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.5);
    this.controls.target.copy(center);
    this.camera.near = Math.max(radius / 10_000, 0.001);
    this.camera.far = Math.max(radius * 100, 100);
    this.camera.position.copy(center).add(new THREE.Vector3(radius * 1.4, radius * 0.9, radius * 1.8));
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
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
