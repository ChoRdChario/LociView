import type { MeshSourceData } from '../domain/meshSource';
import type { FileValidationLimits } from './validation';
import { flatMeshSource, meshError, meshFloat, meshLinear, meshNumber, meshText, meshVertexNormals, meshWork } from './meshSourceSupport';

type Property={name:string;type:'float'|'byte'};
export function inspectMeshPly(bytes:Uint8Array,limits:FileValidationLimits,signal?:AbortSignal):MeshSourceData{
  const work=meshWork(limits);let at=0,format='',vertices=0,faces=0,element='',list=false,indexSigned=false,ended=false;
  const props:Property[]=[],names=new Set<string>();
  const line=()=>{const begin=at;while(at<bytes.length&&bytes[at]!==10){if(at>=65536)return meshError('PLYのヘッダーが大きすぎます。');const n=bytes[at]!;if(n!==9&&n!==13&&(n<32||n>126))return meshError();at++;}
    if(at>=bytes.length||++at>65536)return meshError('PLYのヘッダーが不足しています。');const text=new TextDecoder('ascii').decode(bytes.subarray(begin,at-1));if(/\r(?!$)/.test(text))return meshError();return text.trim();};
  if(line()!=='ply')return meshError('面を持つPLYを確認してください。');
  while(at<bytes.length){signal?.throwIfAborted();const text=line(),c=text.split(/\s+/);if(!text||c[0]==='comment'||c[0]==='obj_info')continue;
    if(c[0]==='format'){if(format||element||c.length!==3||c[2]!=='1.0'||!['ascii','binary_little_endian'].includes(c[1]!))return meshError();format=c[1]!;continue;}
    if(c[0]==='element'){if(!format||c.length!==3||!/^\d+$/.test(c[2]!))return meshError();const n=Number(c[2]);if(!Number.isSafeInteger(n)||n<=0)return meshError();
      if(c[1]==='vertex'&&!element){vertices=n;element='vertex';}else if(c[1]==='face'&&element==='vertex'&&props.length){faces=n;element='face';}else return meshError('このPLYのelement構成にはまだ対応していません。');continue;}
    if(c[0]==='property'){
      if(element==='vertex'){const name=c[2]!,float=['float','float32'].includes(c[1]!),byte=['uchar','uint8'].includes(c[1]!);if(c.length!==3||names.has(name)||!((['x','y','z','nx','ny','nz'].includes(name)&&float)||(['red','green','blue'].includes(name)&&byte)))return meshError('このPLYの頂点属性にはまだ対応していません。');names.add(name);props.push({name,type:float?'float':'byte'});}
      else if(element==='face'){if(list||c.length!==5||c[1]!=='list'||!['uchar','uint8'].includes(c[2]!)||!['int','int32','uint','uint32'].includes(c[3]!)||!['vertex_indices','vertex_index'].includes(c[4]!))return meshError('このPLYの面の属性にはまだ対応していません。');list=true;indexSigned=['int','int32'].includes(c[3]!);}
      else return meshError();continue;
    }
    if(text==='end_header'){ended=true;break;}return meshError();
  }
  const normal=['nx','ny','nz'].filter(n=>names.has(n)).length,color=['red','green','blue'].filter(n=>names.has(n)).length;
  if(!ended||!vertices||!faces||!list||!['x','y','z'].every(n=>names.has(n))||normal!==0&&normal!==3||color!==0&&color!==3)return meshError();
  work(vertices*(props.length*2+6+(color?3:0)));const bodyOffset=at,bodyText=format==='ascii'?meshText(bytes.subarray(bodyOffset)):undefined;
  if(bodyText&&/[^\x09\x0a\x0d\x20-\x7e]/.test(bodyText))return meshError();
  const scan=(positions?:Float32Array,normals?:Float32Array,colors?:Float32Array,indices?:Uint16Array|Uint32Array)=>{
    let offset=bodyOffset,textAt=0,indexAt=0,maxIndex=0;const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const scalar=(type:'float'|'byte'|'index'):number=>{
      if(bodyText!==undefined){while(textAt<bodyText.length&&/[\t\r\n ]/.test(bodyText[textAt]!))textAt++;const start=textAt;while(textAt<bodyText.length&&!/[\t\r\n ]/.test(bodyText[textAt]!))textAt++;
        const token=bodyText.slice(start,textAt);if(!token||type!=='float'&&!/^[+-]?\d+$/.test(token))return meshError();const n=meshNumber(token);if(type!=='float'&&(!Number.isInteger(n)||n<0||n>(type==='byte'?255:4294967295)))return meshError();return type==='float'?meshFloat(n):n;
      }
      const size=type==='byte'?1:4;if(offset+size>bytes.length)return meshError('PLYの本体が不足しています。');const n=type==='float'?data.getFloat32(offset,true):type==='byte'?data.getUint8(offset):indexSigned?data.getInt32(offset,true):data.getUint32(offset,true);offset+=size;
      if(!Number.isFinite(n)||n<0&&type!=='float')return meshError();return type==='float'?meshFloat(n):n;
    };
    for(let v=0;v<vertices;v++){signal?.throwIfAborted();for(const prop of props){const n=scalar(prop.type);if(!positions)continue;let axis=['x','y','z'].indexOf(prop.name);if(axis>=0){positions[v*3+axis]=n;continue;}axis=['nx','ny','nz'].indexOf(prop.name);if(axis>=0){normals![v*3+axis]=n;continue;}axis=['red','green','blue'].indexOf(prop.name);colors![v*3+axis]=meshLinear(n/255);}}
    for(let f=0;f<faces;f++){signal?.throwIfAborted();const count=scalar('byte');if(count!==3&&count!==4)return meshError('PLYは三角形と四角形の面が対象です。');const row=Array.from({length:count},()=>scalar('index'));if(row.some(n=>n>=vertices))return meshError('PLYの面が存在しない頂点を参照しています。');
      const output=count===3?row:[row[0]!,row[1]!,row[3]!,row[1]!,row[2]!,row[3]!];if(!indices)work(count+1+output.length);for(const n of output){maxIndex=Math.max(maxIndex,n);if(indices)indices[indexAt]=n;indexAt++;}}
    if(bodyText===undefined?offset!==bytes.length:bodyText.slice(textAt).trim()!=='')return meshError('PLYの末尾に未対応のデータがあります。');return{indexCount:indexAt,maxIndex};
  };
  const counted=scan(),positions=new Float32Array(vertices*3),normals=normal?new Float32Array(vertices*3):undefined,colors=color?new Float32Array(vertices*3):undefined;
  const indices=counted.maxIndex>=65535?new Uint32Array(counted.indexCount):new Uint16Array(counted.indexCount);scan(positions,normals,colors,indices);
  return flatMeshSource('ply',bytes,{name:'PLY',nodeIndex:0,primitiveIndex:0,materialSlots:[0],geometry:{positions,normals:normals??meshVertexNormals(positions,indices),...(colors?{colors}:{}),indices,groups:[]}});
}
