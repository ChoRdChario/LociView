// The published180 addon declarations use bare 'three', which would type their
// results as186. Declare only the API we use, against the actual private180 core.
declare module 'three-compat-180/addons/loaders/GLTFLoader.js' {
  import * as THREE from 'three-compat-180';
  export interface GLTFParser {
    json: { [key: string]: any };
    associations: Map<THREE.Object3D | THREE.Material | THREE.Texture, { nodes?: number; meshes?: number; primitives?: number; materials?: number; textures?: number }>;
    textureLoader: THREE.ImageBitmapLoader;
    options: { crossOrigin: string; requestHeader: Record<string,string> };
  }
  export interface GLTF { scene: THREE.Group; scenes: THREE.Group[]; parser: GLTFParser }
  interface Plugin { name: string; beforeRoot?: () => Promise<void>; afterRoot?: (gltf: GLTF) => Promise<void> }
  export class GLTFLoader extends THREE.Loader<GLTF> {
    register(callback: (parser: GLTFParser) => Plugin): this;
    parse(data: ArrayBuffer | string, path: string, done: (gltf: GLTF) => void, error?: (reason: unknown) => void): void;
    parseAsync(data: ArrayBuffer | string, path: string): Promise<GLTF>;
  }
}
declare module 'three-compat-180/addons/loaders/MTLLoader.js' {
  import * as THREE from 'three-compat-180';
  export interface MaterialCreator { materials: Record<string, THREE.Material>; preload(): void }
  export class MTLLoader extends THREE.Loader<MaterialCreator> { parse(text: string, path: string): MaterialCreator }
}
declare module 'three-compat-180/addons/loaders/OBJLoader.js' {
  import * as THREE from 'three-compat-180';
  import type { MaterialCreator } from 'three-compat-180/addons/loaders/MTLLoader.js';
  export class OBJLoader extends THREE.Loader<THREE.Group> { setMaterials(materials: MaterialCreator): this; parse(text: string): THREE.Group }
}
declare module 'three-compat-180/addons/loaders/PLYLoader.js' {
  import * as THREE from 'three-compat-180';
  export class PLYLoader extends THREE.Loader<THREE.BufferGeometry> { parse(data: ArrayBuffer | string): THREE.BufferGeometry }
}
declare module 'three-compat-180/addons/loaders/STLLoader.js' {
  import * as THREE from 'three-compat-180';
  export class STLLoader extends THREE.Loader<THREE.BufferGeometry> { parse(data: ArrayBuffer | string): THREE.BufferGeometry }
}
