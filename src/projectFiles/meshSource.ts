import stlText from '../../docs/specs/profiles/mesh-stl-1.profile.json?raw';
import plyText from '../../docs/specs/profiles/mesh-ply-1.profile.json?raw';
import objText from '../../docs/specs/profiles/mesh-obj-1.profile.json?raw';
import gltfText from '../../docs/specs/profiles/mesh-gltf-1.profile.json?raw';
import goldenText from '../../docs/specs/profiles/mesh-conversion-8.goldens.json?raw';
import { meshSourceDeclarations, type MeshSourceData, type MeshSourceFormat } from '../domain/meshSource';
import type { JsonObject } from '../domain/values';
import { checkFileLimits, fileError, type FileValidationLimits } from './validation';
import { inspectMeshStl } from './meshStl';
import { inspectMeshPly } from './meshPly';
import { inspectMeshObj } from './meshObj';
import { inspectMeshGltf } from './meshGltf';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';

const texts={stl:stlText,ply:plyText,obj:objText,gltf:gltfText};
const hash=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const profiles=new Map<MeshSourceFormat,Promise<JsonObject>>();
export function meshSourceProfile(format:MeshSourceFormat):Promise<JsonObject>{let p=profiles.get(format);if(!p){p=(async()=>{const declaration=meshSourceDeclarations[format],text=texts[format],spec=JSON.parse(text),sha=await hash(text);
    if(sha!==declaration.sha256||spec.id!==declaration.id||spec.goldens.sha256!==await hash(goldenText)||spec.goldens.sha256!=='6fb753973ff29b782ae4f7d15b8b37ea6ec7c5ecd5fcf82e508a94db562697eb')return fileError('モデルの入力形式を確認できません。');
    return Object.freeze({id:declaration.id,specificationSha256:sha});})();profiles.set(format,p);}return p;}
export type ValidatedMeshSource=MeshSourceData;
/** Exact existing Native declaration; target tuples are separately hash-bound. */
export function nativeMeshSourceFormat(profile:{readonly id:string}):MeshSourceFormat|null{
  const match=/^lociview-native-model-(stl|ply|obj|gltf)-v1$/.exec(profile.id);return match?match[1] as MeshSourceFormat:null;
}
/** Content hints only. A recognized invalid source is refused by its exact inspector. */
export function classifyMeshSource(bytes:Uint8Array):MeshSourceFormat|null{
  if(bytes.length>=4&&bytes[0]===103&&bytes[1]===108&&bytes[2]===84&&bytes[3]===70)return null;
  const prefix=new TextDecoder().decode(bytes.subarray(0,65536));
  if(/^ply\r?\n/.test(prefix))return /(?:^|\r?\n)element\s+face\s+/.test(prefix)?'ply':null;
  if(bytes.length>=84){const n=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(80,true);if(n>0&&84+50*n===bytes.length)return'stl';}
  const text=new TextDecoder().decode(bytes);
  if(/^\s*solid(?:\s|$)/.test(text))return'stl';
  if(/^\s*\{/.test(text))return'gltf';
  return /^[ \t]*(?:v|vn|vt|f|o|g|s|mtllib|usemtl)(?:[ \t]|$)/m.test(text)?'obj':null;
}
export async function inspectMeshSource(format:MeshSourceFormat,input:Uint8Array,limits:FileValidationLimits,png?:PngDecoder,jpeg?:JpegDecoder,signal?:AbortSignal):Promise<ValidatedMeshSource>{
  checkFileLimits(limits);if(!input.length||input.length>limits.maxFileBytes)return fileError('モデルが容量の上限を超えています。');const bytes=input.slice();signal?.throwIfAborted();await meshSourceProfile(format);signal?.throwIfAborted();
  switch(format){case'stl':return inspectMeshStl(bytes,limits,signal);case'ply':return inspectMeshPly(bytes,limits,signal);case'obj':return inspectMeshObj(bytes,limits,signal);case'gltf':return inspectMeshGltf(bytes,limits,png,jpeg,signal);}
}
