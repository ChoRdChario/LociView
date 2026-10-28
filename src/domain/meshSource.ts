import type { JsonObject } from './values';

/** Approved07l source/neutral values only; no engine, package or persistence authority. */
export type MeshSourceFormat = 'stl' | 'ply' | 'obj' | 'gltf';
export const meshSourceDeclarations = Object.freeze({
  stl: {id:'development-validation-mesh-stl-1',sha256:'66141d778507d0cb06506c657a02277e16cbf486d3b39c557310aae1f35a07c4',mediaType:'model/stl'},
  ply: {id:'development-validation-mesh-ply-1',sha256:'b565818a2bf3179b59ddab0ce257c3e9e375630fdad065e774e54415b225a032',mediaType:'application/ply'},
  obj: {id:'development-validation-mesh-obj-1',sha256:'394466b628306f9232fee52653d3b6bf0e2990d5d22d21f8528aade61dbada36',mediaType:'text/plain'},
  gltf: {id:'development-validation-mesh-gltf-1',sha256:'b39fc6b9c7a9bb47afbb9e2d7290e035ee13fbcce61da775ee98a2fc61816fd1',mediaType:'model/gltf+json'},
});
for(const declaration of Object.values(meshSourceDeclarations))Object.freeze(declaration);
export function meshSourceFormat(profile:unknown):MeshSourceFormat|null{
  if(!profile||typeof profile!=='object'||Array.isArray(profile)||Object.keys(profile).sort().join(',')!=='id,specificationSha256')return null;
  const p=profile as Record<string,unknown>;return(Object.keys(meshSourceDeclarations) as MeshSourceFormat[]).find(f=>meshSourceDeclarations[f].id===p.id&&meshSourceDeclarations[f].sha256===p.specificationSha256)??null;
}
export type MeshSourceAddress =
  | {readonly kind:'flat';readonly slotIndex:0}
  | {readonly kind:'obj-material-run';readonly objectOrdinal:number;readonly materialRunOrdinal:number;readonly slotIndex:number}
  | {readonly kind:'gltf-occurrence';readonly nodeIndex:number;readonly primitiveIndex:number;readonly materialIndex:number|null;readonly slotIndex:number};
export interface MeshSourceSlot {readonly slotIndex:number;readonly address:MeshSourceAddress}
export interface NeutralMeshGeometry {
  readonly positions:Float32Array;readonly normals:Float32Array;
  readonly colors?:Float32Array;readonly uvs?:Float32Array;readonly indices?:Uint16Array|Uint32Array;
  readonly groups:readonly {readonly start:number;readonly count:number;readonly materialIndex:number}[];
}
export interface NeutralMeshMaterial {
  readonly kind:'standard'|'phong';readonly name:string;readonly vertexColors:boolean;readonly flatShading:boolean;
  readonly colorSrgb:readonly [number,number,number];
}
export interface NeutralMeshPrimitive {
  readonly name:string;readonly nodeIndex:number;readonly primitiveIndex:0;
  readonly geometry:NeutralMeshGeometry;readonly materialSlots:readonly number[];
}
export interface MeshSourceData {
  readonly kind:'mesh-source';readonly format:MeshSourceFormat;readonly bytes:Uint8Array;
  readonly bounds:{readonly min:number[];readonly max:number[]};
  readonly materials:readonly JsonObject[];readonly surfaceRanges:readonly JsonObject[];
  readonly sourceSlots:readonly MeshSourceSlot[];readonly externalMaterialsUnavailable:boolean;
  readonly primitives?:readonly NeutralMeshPrimitive[];readonly materialDescriptors?:readonly NeutralMeshMaterial[];
  readonly jpeg?:true;readonly occurrences?:readonly {nodeIndex:number;primitiveIndex:number;materialIndex:number|null;slotIndex:number}[];
}
