import type { MeshSourceData, MeshSourceSlot, NeutralMeshMaterial, NeutralMeshPrimitive } from '../domain/meshSource';
import type { FileValidationLimits } from './validation';
import { meshBounds, meshError, meshFloat, meshLinear, meshLines, meshTokens, meshNumber, meshText, meshWork } from './meshSourceSupport';

interface Run {name:string;smooth:boolean;start:number;end:number;count:number;inherited:boolean}
interface ObjectRow {index:number;name:string;declared:boolean;smooth:boolean;vertices:number;uv:boolean;colored:boolean;runs:Run[]}
interface Output {positions:Float32Array;normals:Float32Array;colors?:Float32Array;uvs?:Float32Array;at:number}
/** Strict source grammar/ordinals; the old decoder is a separate proof, never admission. */
export function inspectMeshObj(bytes:Uint8Array,limits:FileValidationLimits,signal?:AbortSignal):MeshSourceData{
  const text=meshText(bytes);if(/\\\r?\n|\\$/.test(text))return meshError('OBJの行継続にはまだ対応していません。');const work=meshWork(limits);
  const scan=(outputs?:ReadonlyMap<number,Output>)=>{
    const vertices:number[][]=[],colors:(number[]|undefined)[]=[],normals:number[][]=[],uvs:number[][]=[],objects:ObjectRow[]=[];let current:ObjectRow|undefined,referenceColor:boolean|undefined,external=false;
    const charge=(n:number)=>{if(!outputs)work(n);};
    const last=()=>current!.runs.at(-1);
    const finalize=(end:boolean)=>{const r=last();if(r&&r.end<0){r.end=current!.vertices;r.count=r.end-r.start;r.inherited=false;}if(end&&current!.runs.length>1)current!.runs=current!.runs.filter(r=>r.count>0);return r;};
    const start=(name:string,declared=true)=>{
      if(current&&!current.declared){current.name=name;current.declared=declared;return;}
      const previous=current?last():undefined;if(current)finalize(true);
      if(objects.length>=limits.maxItems)return meshError('OBJのオブジェクト数が上限を超えています。');
      current={index:objects.length,name,declared,smooth:true,vertices:0,uv:false,colored:false,runs:[]};
      if(previous?.name)current.runs.push({...previous,start:0,end:-1,count:-1,inherited:true});objects.push(current);charge(1);
    };
    start('',false);
    const index=(token:string,count:number)=>{if(!/^[+-]?\d+$/.test(token))return meshError('OBJの面の参照を確認してください。');const n=Number(token);if(!Number.isSafeInteger(n)||n===0)return meshError();const at=n>0?n-1:count+n;if(at<0||at>=count)return meshError('OBJの面が存在しない頂点を参照しています。');return at;};
    const faceNormal=(a:number[],b:number[],c:number[])=>{const cb=[c[0]!-b[0]!,c[1]!-b[1]!,c[2]!-b[2]!],ab=[a[0]!-b[0]!,a[1]!-b[1]!,a[2]!-b[2]!];
      const n=[cb[1]!*ab[2]!-cb[2]!*ab[1]!,cb[2]!*ab[0]!-cb[0]!*ab[2]!,cb[0]!*ab[1]!-cb[1]!*ab[0]!],length=Math.sqrt(n[0]!**2+n[1]!**2+n[2]!**2),scale=1/(length||1);return n.map(v=>meshFloat(v*scale));};
    for(const raw of meshLines(text)){signal?.throwIfAborted();const line=raw.trim();if(!line||line[0]==='#')continue;const split=line.search(/\s/),command=split<0?line:line.slice(0,split),value=split<0?'':line.slice(split).trim();
      if(command==='o'||command==='g'){charge(value.length);start(value);continue;}
      if(command==='usemtl'){if(!value)return meshError('OBJの材質名を確認してください。');charge(value.length);const previous=finalize(false);if(previous&&(previous.inherited||previous.count<=0))current!.runs.pop();
        current!.runs.push({name:value,smooth:previous?.smooth??current!.smooth,start:previous?.end??0,end:-1,count:-1,inherited:false});if(current!.runs.length>limits.maxItems)return meshError();continue;}
      if(command==='mtllib'){if(!value)return meshError('OBJの材質ファイル宣言を確認してください。');external=true;charge(value.length);continue;}
      if(command==='s'){if(!['off','0','on','1'].includes(value))return meshError('このOBJのsmoothing指定にはまだ対応していません。');current!.smooth=value!=='off'&&value!=='0';if(last())last()!.smooth=current!.smooth;continue;}
      if(!['v','vn','vt','f'].includes(command))return meshError('このOBJの行形式にはまだ対応していません。');
      const cells:string[]=[];for(const token of meshTokens(value)){if(command!=='f'&&cells.length>=(command==='v'?6:command==='vn'?3:2))return meshError('OBJの頂点属性を確認してください。');charge(1);cells.push(token);}
      if(command==='v'||command==='vn'||command==='vt'){
        if(command==='v'?cells.length!==3&&cells.length!==6:cells.length!==(command==='vn'?3:2))return meshError('OBJの頂点属性を確認してください。');charge(cells.length*2);const row=cells.map(meshNumber);row.forEach(meshFloat);
        if(command==='v'){vertices.push(row.slice(0,3));if(row.length===6&&row.slice(3).some(n=>n<0||n>1))return meshError('OBJの頂点色を確認してください。');colors.push(row.length===6?row.slice(3).map(meshLinear):undefined);}
        else if(command==='vn')normals.push(row.map(meshFloat));else uvs.push(row.map(meshFloat));continue;
      }
      if(command!=='f'||cells.length<3)return meshError('このOBJの行形式にはまだ対応していません。');
      charge(cells.length*3);const corners=cells.map(cell=>{const parts=cell.split('/',4);if(parts.length>3||!parts[0])return meshError();return{v:index(parts[0],vertices.length),uv:parts[1]?index(parts[1],uvs.length):undefined,n:parts[2]?index(parts[2],normals.length):undefined};});
      const hasUV=corners[0]!.uv!==undefined,hasNormal=corners[0]!.n!==undefined;if(corners.some(c=>(c.uv!==undefined)!==hasUV||(c.n!==undefined)!==hasNormal))return meshError('OBJの面の属性参照が揃っていません。');
      for(const c of corners){const colored=colors[c.v]!==undefined;if(referenceColor!==undefined&&referenceColor!==colored)return meshError('OBJの頂点色が一部欠けています。');referenceColor=colored;}
      current!.uv ||=hasUV;current!.colored ||=referenceColor===true;
      for(let i=1;i<corners.length-1;i++){
        charge(3*(6+(referenceColor?3:0)+2));const triangle=[corners[0]!,corners[i]!,corners[i+1]!],generated=hasNormal?undefined:faceNormal(...triangle.map(c=>vertices[c.v]!) as [number[],number[],number[]]);
        const output=outputs?.get(current!.index);
        for(const c of triangle){if(output){const p=vertices[c.v]!,n=hasNormal?normals[c.n!]!:generated!;for(let k=0;k<3;k++){output.positions[output.at*3+k]=meshFloat(p[k]!);output.normals[output.at*3+k]=n[k]!;if(output.colors)output.colors[output.at*3+k]=colors[c.v]![k]!;}
            if(output.uvs){const uv=c.uv===undefined?[0,0]:uvs[c.uv]!;output.uvs[output.at*2]=uv[0]!;output.uvs[output.at*2+1]=uv[1]!;}output.at++;}current!.vertices++;}
      }
    }
    finalize(true);return{objects:objects.filter(o=>o.vertices>0),external};
  };
  const scanned=scan();if(!scanned.objects.length)return meshError('OBJに表示できる面がありません。');const outputs=new Map<number,Output>();
  for(const o of scanned.objects)outputs.set(o.index,{positions:new Float32Array(o.vertices*3),normals:new Float32Array(o.vertices*3),...(o.colored?{colors:new Float32Array(o.vertices*3)}:{}),...(o.uv?{uvs:new Float32Array(o.vertices*2)}:{}),at:0});
  scan(outputs);const primitives:NeutralMeshPrimitive[]=[],descriptors:NeutralMeshMaterial[]=[],sourceSlots:MeshSourceSlot[]=[];
  for(const [objectOrdinal,o] of scanned.objects.entries()){
    const output=outputs.get(o.index)!,runs=o.runs.length?o.runs:[{name:'',smooth:o.smooth,start:0,end:o.vertices,count:o.vertices,inherited:false}],slots:number[]=[];
    if(output.at!==o.vertices)return meshError('OBJの面の数が一致しません。');
    for(const [materialRunOrdinal,run] of runs.entries()){const slotIndex=descriptors.length;slots.push(slotIndex);descriptors.push({kind:'phong',name:run.name,flatShading:!run.smooth,vertexColors:o.colored,colorSrgb:[1,1,1]});sourceSlots.push({slotIndex,address:{kind:'obj-material-run',objectOrdinal,materialRunOrdinal,slotIndex}});}
    primitives.push({name:o.name,nodeIndex:objectOrdinal,primitiveIndex:0,materialSlots:slots,geometry:{positions:output.positions,normals:output.normals,...(output.colors?{colors:output.colors}:{}),...(output.uvs?{uvs:output.uvs}:{}),groups:runs.length>1?runs.map((r,i)=>({start:r.start,count:r.count,materialIndex:i})):[]}});
  }
  return{kind:'mesh-source',format:'obj',bytes,bounds:meshBounds(primitives),materials:descriptors.map((_,slotIndex)=>({sourceLocator:{kind:'representationMaterial',slotIndex},sourceSemantics:{coverage:{kind:'opaque'},optics:'surface',lighting:'lit',doubleSided:false}})),
    surfaceRanges:primitives.map(p=>({kind:'meshTriangle',nodeIndex:p.nodeIndex,primitiveIndex:0,count:p.geometry.positions.length/9})),sourceSlots,externalMaterialsUnavailable:scanned.external,primitives,materialDescriptors:descriptors};
}
