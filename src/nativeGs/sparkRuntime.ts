import * as THREE from 'three';
import type { RestartableByteSource } from './plyProfile';

interface SparkSplatMesh extends THREE.Object3D {
  readonly initialized: Promise<unknown>;
  readonly isInitialized: boolean;
  readonly packedSplats?: { readonly numSplats: number };
  getBoundingBox(centersOnly?: boolean): THREE.Box3;
  dispose(): void;
}

interface SparkRendererObject extends THREE.Object3D {
  readonly geometry?: THREE.BufferGeometry;
  readonly material?: THREE.Material | THREE.Material[];
  dispose(): void;
}

interface SparkModuleV210 {
  readonly SplatFileType: { readonly PLY: unknown };
  readonly SplatMesh: {
    readonly staticInitialized: Promise<unknown>;
    new(options: {
      stream: ReadableStream<Uint8Array>;
      streamLength: number;
      fileName: string;
      fileType: unknown;
      editable: false;
      raycastable: false;
      enableLod: false;
      onProgress?: (event: ProgressEvent) => void;
    }): SparkSplatMesh;
  };
  readonly SparkRenderer: {
    new(options: { renderer: THREE.WebGLRenderer; enableLod: false }): SparkRendererObject;
  };
}

let sparkModulePromise: Promise<SparkModuleV210> | null = null;

export async function initializeNativeSparkModule(): Promise<SparkModuleV210> {
  sparkModulePromise ??= import('@sparkjsdev/spark')
    .then((module) => module as unknown as SparkModuleV210)
    .catch((error: unknown) => {
      sparkModulePromise = null;
      throw error;
    });
  const module = await sparkModulePromise;
  await module.SplatMesh.staticInitialized;
  return module;
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
  if (material === undefined) return;
  if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
  else material.dispose();
}

export class NativeSparkRuntime {
  private readonly splatMeshes = new Map<string, SparkSplatMesh>();
  private readonly loadGenerations = new Map<string, number>();
  private sparkRenderer: SparkRendererObject | null = null;
  private disposed = false;

  private constructor(
    private readonly module: SparkModuleV210,
    renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
  ) {
    this.sparkRenderer = new module.SparkRenderer({ renderer, enableLod: false });
    scene.add(this.sparkRenderer);
  }

  static async create(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Promise<NativeSparkRuntime> {
    return new NativeSparkRuntime(await initializeNativeSparkModule(), renderer, scene);
  }

  async load(
    source: RestartableByteSource,
    representationId: string,
    expectedSplatCount: number,
    onProgress?: (loaded: number) => void,
  ): Promise<{ readonly object: THREE.Object3D; readonly splatCount: number; readonly bounds: THREE.Box3 }> {
    if (this.disposed) throw new Error('Spark runtime is disposed');
    this.disposeSplat(representationId);
    const generation = (this.loadGenerations.get(representationId) ?? 0) + 1;
    this.loadGenerations.set(representationId, generation);
    const candidate = new this.module.SplatMesh({
      stream: source.stream(),
      streamLength: source.size,
      fileName: `${representationId}.ply`,
      fileType: this.module.SplatFileType.PLY,
      editable: false,
      raycastable: false,
      enableLod: false,
      onProgress: onProgress === undefined ? undefined : (event) => onProgress(event.loaded),
    });
    try {
      await candidate.initialized;
      if (this.disposed || generation !== this.loadGenerations.get(representationId)) {
        candidate.removeFromParent();
        candidate.dispose();
        throw new Error('Spark load became obsolete before activation');
      }
      const splatCount = candidate.packedSplats?.numSplats ?? 0;
      if (!candidate.isInitialized || splatCount !== expectedSplatCount) {
        throw new Error(`Spark decode disagrees with PLY header count (${splatCount} != ${expectedSplatCount})`);
      }
      const bounds = candidate.getBoundingBox(true);
      if (
        bounds.isEmpty() ||
        ![bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)
      ) {
        throw new Error('Spark produced non-finite or empty bounds');
      }
      this.splatMeshes.set(representationId, candidate);
      return { object: candidate, splatCount, bounds };
    } catch (error) {
      candidate.removeFromParent();
      candidate.dispose();
      throw error;
    }
  }

  disposeSplat(representationId?: string): void {
    if (representationId !== undefined) {
      this.loadGenerations.set(representationId, (this.loadGenerations.get(representationId) ?? 0) + 1);
      const splat = this.splatMeshes.get(representationId);
      splat?.removeFromParent();
      splat?.dispose();
      this.splatMeshes.delete(representationId);
      return;
    }
    const representationIds = new Set([...this.loadGenerations.keys(), ...this.splatMeshes.keys()]);
    for (const id of representationIds) this.disposeSplat(id);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeSplat();
    const renderer = this.sparkRenderer;
    this.sparkRenderer = null;
    renderer?.removeFromParent();
    renderer?.dispose();
    renderer?.geometry?.dispose();
    disposeMaterial(renderer?.material);
    this.scene.remove(...this.scene.children.filter((child) => child === renderer));
  }
}
