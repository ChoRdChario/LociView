import type { MeshSourceData } from '../domain/meshSource';
import { meshSourceDeclarations } from '../domain/meshSource';
import { NativeSha256, digestNativeBytes } from '../nativeGs/sha256';

function arrayHash(a:Float32Array|Uint16Array|Uint32Array){const sha=new NativeSha256(),chunk=new Uint8Array(65536),v=new DataView(chunk.buffer);let used=0;
  for(const n of a){if(!Number.isFinite(n))throw Error('モデルの数値を確認できません。');v.setFloat64(used,n||0,true);used+=8;if(used===chunk.length){sha.update(chunk);used=0;}}
  if(used)sha.update(chunk.subarray(0,used));return[a.constructor.name,a.length,sha.digestHex()];
}
/** Source + exact profile + checked neutral facts, never a reusable storage receipt. */
export function meshSourceInputKey(s:MeshSourceData):string{
  const profile=meshSourceDeclarations[s.format],geometry=s.primitives?.map(p=>({name:p.name,nodeIndex:p.nodeIndex,primitiveIndex:p.primitiveIndex,materialSlots:p.materialSlots,
    geometry:{positions:arrayHash(p.geometry.positions),normals:arrayHash(p.geometry.normals),colors:p.geometry.colors?arrayHash(p.geometry.colors):null,uvs:p.geometry.uvs?arrayHash(p.geometry.uvs):null,indices:p.geometry.indices?arrayHash(p.geometry.indices):null,groups:p.geometry.groups}}))??null;
  return JSON.stringify([s.format,profile.id,profile.sha256,digestNativeBytes(s.bytes).sha256,s.bytes.length,s.bounds,s.materials,s.surfaceRanges,s.sourceSlots,s.externalMaterialsUnavailable,s.jpeg===true,s.occurrences??null,geometry,s.materialDescriptors??null]);
}
