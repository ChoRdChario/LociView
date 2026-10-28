import type { MeshSourceData, MeshSourceFormat, NeutralMeshPrimitive } from '../domain/meshSource';
import { fileError, type FileValidationLimits } from './validation';

const decimal=/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
export const meshError=(detail='モデルの座標・面・材質の形式を確認してください。'):never=>fileError(detail);
export const meshNumber=(s:string):number=>{const n=Number(s);if(!decimal.test(s)||!Number.isFinite(n))return meshError();return n||0;};
export const meshFloat=(n:number):number=>{const v=Math.fround(n);if(!Number.isFinite(n)||!Number.isFinite(v))return meshError('頂点や法線の数値が大きすぎます。');return v||0;};
export const meshLinear=(c:number):number=>meshFloat(c<.04045?c*.0773993808:Math.pow(c*.9478672986+.0521327014,2.4));
export function meshWork(limits:FileValidationLimits){let work=0;return(n:number)=>{work+=n;if(!Number.isSafeInteger(n)||n<0||!Number.isSafeInteger(work)||work>limits.maxValues)meshError('モデルの検査量がこの検証の上限を超えています。');};}
export function meshText(bytes:Uint8Array):string{
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return meshError('モデルの文字列が不正です。');}
  if(text.includes('\0')||/\r(?!\n)/.test(text))return meshError();return text;
}
export function* meshLines(text:string):Generator<string>{let at=0;while(at<text.length){const end=text.indexOf('\n',at),last=end<0?text.length:end;let row=text.slice(at,last);if(row.endsWith('\r'))row=row.slice(0,-1);yield row;at=last+1;}}
/** Yield one token at a time; callers charge before retaining expanded values. */
export function* meshTokens(text:string):Generator<string>{let at=0;while(at<text.length){while(at<text.length&&/\s/.test(text[at]!))at++;if(at===text.length)break;const start=at;while(at<text.length&&!/\s/.test(text[at]!))at++;yield text.slice(start,at);}}
export function meshBounds(primitives:readonly NeutralMeshPrimitive[]){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of primitives)for(let i=0;i<p.geometry.positions.length;i++){const axis=i%3,n=p.geometry.positions[i]!;min[axis]=Math.min(min[axis]!,n)||0;max[axis]=Math.max(max[axis]!,n)||0;}
  if(min.some(n=>!Number.isFinite(n)))return meshError('表示できる面がありません。');return{min,max};
}
export function flatMeshSource(format:Extract<MeshSourceFormat,'stl'|'ply'>,bytes:Uint8Array,primitive:NeutralMeshPrimitive):MeshSourceData{
  const colored=!!primitive.geometry.colors,name=format==='stl'?'STL':'PLY';
  return{kind:'mesh-source',format,bytes,bounds:meshBounds([primitive]),materials:[{sourceLocator:{kind:'representationMaterial',slotIndex:0},sourceSemantics:{coverage:{kind:'opaque'},optics:'surface',lighting:'lit',doubleSided:false}}],
    surfaceRanges:[{kind:'meshTriangle',nodeIndex:0,primitiveIndex:0,count:(primitive.geometry.indices?.length??primitive.geometry.positions.length/3)/3}],
    sourceSlots:[{slotIndex:0,address:{kind:'flat',slotIndex:0}}],externalMaterialsUnavailable:false,primitives:[primitive],
    materialDescriptors:[{kind:'standard',name,vertexColors:colored,flatShading:false,colorSrgb:colored?[1,1,1]:[154/255,164/255,175/255]}]};
}
/** Pinned180 indexed BufferGeometry Float32 accumulation and normalization order. */
export function meshVertexNormals(positions:Float32Array,indices:Uint16Array|Uint32Array):Float32Array{
  const normals=new Float32Array(positions.length);
  for(let i=0;i<indices.length;i+=3){const a=indices[i]!*3,b=indices[i+1]!*3,c=indices[i+2]!*3;
    const cb=[positions[c]!-positions[b]!,positions[c+1]!-positions[b+1]!,positions[c+2]!-positions[b+2]!],ab=[positions[a]!-positions[b]!,positions[a+1]!-positions[b+1]!,positions[a+2]!-positions[b+2]!];
    const cross=[cb[1]!*ab[2]!-cb[2]!*ab[1]!,cb[2]!*ab[0]!-cb[0]!*ab[2]!,cb[0]!*ab[1]!-cb[1]!*ab[0]!];
    for(const at of [a,b,c])for(let k=0;k<3;k++)normals[at+k]=meshFloat(normals[at+k]!+cross[k]!);
  }
  for(let i=0;i<normals.length;i+=3){const length=Math.sqrt(normals[i]!**2+normals[i+1]!**2+normals[i+2]!**2),scale=1/(length||1);for(let k=0;k<3;k++)normals[i+k]=meshFloat(normals[i+k]!*scale);}
  return normals;
}
