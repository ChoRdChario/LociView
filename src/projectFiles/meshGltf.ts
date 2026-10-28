import type { MeshSourceData, MeshSourceSlot } from '../domain/meshSource';
import type { JsonObject } from '../domain/values';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { inspectStaticMeshDocument } from './glb';
import { fileFields, fileInteger, fileList, fileObject, limitedJson, type FileValidationLimits } from './validation';
import { meshError } from './meshSourceSupport';

/** Strict URI adapter into shared checked static facts; original JSON is never rewritten/exported. */
export async function inspectMeshGltf(bytes:Uint8Array,limits:FileValidationLimits,png?:PngDecoder,jpeg?:JpegDecoder,signal?:AbortSignal):Promise<MeshSourceData>{
  signal?.throwIfAborted();const source=limitedJson(bytes,limits),j=structuredClone(source),buffers=fileList(source.buffers,1);if(buffers.length!==1)return meshError('glTF内の本体を確認してください。');
  const buffer=fileObject(buffers[0]);fileFields(buffer,['byteLength','uri']);let decodedTotal=0;
  const dataUri=(value:unknown,types:readonly string[])=>{
    if(typeof value!=='string')return meshError('glTFは画像と頂点データを内蔵したファイルが対象です。');const match=/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
    if(!match||!types.includes(match[1]!)||!match[2]||match[2].length%4)return meshError('glTFの外部参照やデータURI形式にはまだ対応していません。');
    const text=match[2]!,length=text.length/4*3-(text.endsWith('==')?2:text.endsWith('=')?1:0);decodedTotal+=length;
    if(!Number.isSafeInteger(decodedTotal)||decodedTotal>limits.maxFileBytes)return meshError('glTFの展開量が上限を超えています。');
    let decoded:string;try{decoded=atob(text);}catch{return meshError('glTFの内蔵データが不正です。');}
    if(decoded.length!==length||btoa(decoded)!==text)return meshError('glTFのbase64表記が不正です。');return{type:match[1]!,bytes:Uint8Array.from(decoded,c=>c.charCodeAt(0))};
  };
  const body=dataUri(buffer.uri,['application/octet-stream','application/gltf-buffer']);if(!body.bytes.length||fileInteger(buffer.byteLength)!==body.bytes.length)return meshError('glTFの本体サイズが一致しません。');
  const sourceViews=fileList(source.bufferViews,limits.maxItems),views=structuredClone(sourceViews);let logical=body.bytes.length;
  // Original references may not gain access to adapter-created image views/ranges.
  for(const raw of sourceViews){const v=fileObject(raw),offset=fileInteger(v.byteOffset??0),length=fileInteger(v.byteLength);if(v.buffer!==0||!length||offset+length>body.bytes.length)return meshError('glTFのデータ範囲が不正です。');}
  for(const raw of fileList(source.accessors,limits.maxItems)){const a=fileObject(raw);if(fileInteger(a.bufferView)>=sourceViews.length)return meshError('glTFの頂点参照が不正です。');}
  const appended:{at:number;bytes:Uint8Array}[]=[],images=fileList(source.images??[],limits.maxItems),adapted:Record<string,unknown>[]=[];let usesJpeg=false;
  for(const raw of images){signal?.throwIfAborted();const image=fileObject(raw);fileFields(image,['uri','bufferView','mimeType']);
    if(image.uri!==undefined){if(image.bufferView!==undefined)return meshError('glTFの画像参照が重複しています。');const data=dataUri(image.uri,['image/png','image/jpeg']);if(image.mimeType!==undefined&&image.mimeType!==data.type)return meshError('glTFの画像形式が一致しません。');
      const at=Math.ceil(logical/4)*4;logical=at+data.bytes.length;if(logical>limits.maxFileBytes)return meshError('glTFの展開量が上限を超えています。');appended.push({at,bytes:data.bytes});const {uri,...rest}=image;adapted.push({...rest,bufferView:views.length,mimeType:data.type});views.push({buffer:0,byteOffset:at,byteLength:data.bytes.length});usesJpeg ||=data.type==='image/jpeg';
    }else{if(fileInteger(image.bufferView)>=sourceViews.length)return meshError('glTFの画像参照が不正です。');usesJpeg ||=image.mimeType==='image/jpeg';adapted.push(structuredClone(image));}
  }
  const bin=new Uint8Array(Math.ceil(logical/4)*4);bin.set(body.bytes);for(const image of appended)bin.set(image.bytes,image.at);
  const {uri,...rest}=buffer;j.buffers=[{...rest,byteLength:logical}];j.bufferViews=views;if(source.images!==undefined)j.images=adapted;
  const facts=await inspectStaticMeshDocument(j,bin,limits,png,jpeg,true);signal?.throwIfAborted();
  const nodes=fileList(source.nodes,limits.maxItems).map(fileObject),meshes=fileList(source.meshes,limits.maxItems).map(fileObject);
  const occurrences=facts.surfaceRanges.map(r=>({nodeIndex:Number(r.nodeIndex),primitiveIndex:Number(r.primitiveIndex)})).sort((a,b)=>a.nodeIndex-b.nodeIndex||a.primitiveIndex-b.primitiveIndex).map((r,slotIndex)=>{
    const primitive=fileObject(fileList(meshes[Number(nodes[r.nodeIndex]!.mesh)]!.primitives,limits.maxItems)[r.primitiveIndex]);return{...r,materialIndex:primitive.material===undefined?null:Number(primitive.material),slotIndex};});
  const materials:JsonObject[]=[],sourceSlots:MeshSourceSlot[]=[];
  for(const o of occurrences){const sourceMaterial=facts.materials.find(m=>{const locator=m.sourceLocator as JsonObject;return o.materialIndex===null?locator.kind==='representationMaterial':locator.kind==='gltfMaterial'&&locator.materialIndex===o.materialIndex;});if(!sourceMaterial)return meshError('glTFの材質の対応を確認できません。');
    materials.push({sourceLocator:{kind:'representationMaterial',slotIndex:o.slotIndex},sourceSemantics:sourceMaterial.sourceSemantics!});sourceSlots.push({slotIndex:o.slotIndex,address:{kind:'gltf-occurrence',...o}});
  }
  return{kind:'mesh-source',format:'gltf',bytes,bounds:facts.bounds,materials,surfaceRanges:facts.surfaceRanges,sourceSlots,externalMaterialsUnavailable:false,occurrences,...(usesJpeg?{jpeg:true}: {})};
}
