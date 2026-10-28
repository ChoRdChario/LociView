import type { MeshSourceData, NeutralMeshGeometry } from '../domain/meshSource';
import type { FileValidationLimits } from './validation';
import { flatMeshSource, meshError, meshFloat, meshLinear, meshLines, meshTokens, meshNumber, meshText, meshWork } from './meshSourceSupport';

export function inspectMeshStl(bytes:Uint8Array,limits:FileValidationLimits,signal?:AbortSignal):MeshSourceData{
  signal?.throwIfAborted();const work=meshWork(limits);let geometry:NeutralMeshGeometry;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=bytes.length>=84?view.getUint32(80,true):0;
  if(count&&84+50*count===bytes.length){
    let marker=-1;for(let i=0;i<=74;i++)if(new TextDecoder('ascii').decode(bytes.subarray(i,i+6))==='COLOR='){if(marker>=0||i>=70)return meshError('STLの色の指定を確認してください。');marker=i;}
    const colored=marker>=0;if(colored&&bytes[marker+9]!==255)return meshError('このSTLの不透明度にはまだ対応していません。');
    work(count*(12+18+(colored?9:0)));const positions=new Float32Array(count*9),normals=new Float32Array(count*9),colors=colored?new Float32Array(count*9):undefined;
    for(let f=0;f<count;f++){signal?.throwIfAborted();const start=84+50*f,attribute=view.getUint16(start+48,true);if(!colored&&attribute!==0)return meshError('STLの色の方式にはまだ対応していません。');
      const normal=[0,4,8].map(o=>meshFloat(view.getFloat32(start+o,true)));
      const rgb=colored?(attribute&0x8000?[bytes[marker+6]!/255,bytes[marker+7]!/255,bytes[marker+8]!/255]:[attribute&31,attribute>>5&31,attribute>>10&31].map(n=>n/31)).map(meshLinear):undefined;
      for(let v=0;v<3;v++)for(let k=0;k<3;k++){const at=f*9+v*3+k;positions[at]=meshFloat(view.getFloat32(start+12+v*12+k*4,true));normals[at]=normal[k]!;if(colors)colors[at]=rgb![k]!;}
    }
    geometry={positions,normals,...(colors?{colors}:{}),groups:[]};
  }else{
    const text=meshText(bytes),groups:{start:number;count:number;materialIndex:number}[]=[];
    const parse=(positions?:Float32Array,normals?:Float32Array)=>{
      let inside=false,faces=0,solidFaces=0,solidStart=0,solidName='',step=0;const values:number[]=[];
      const pattern=['facet','normal','','','','outer','loop','vertex','','','','vertex','','','','vertex','','','','endloop','endfacet'];
      for(const raw of meshLines(text)){signal?.throwIfAborted();const line=raw.trim();if(!line)continue;const first=/^\S+/.exec(line)![0];
        if(!inside){if(first!=='solid')return meshError('STLのsolid宣言を確認してください。');if(!positions)work(line.length);solidName=line.slice(5).trim().replace(/\s+/g,' ');solidFaces=0;solidStart=faces*3;inside=true;continue;}
        if(step===0&&first==='endsolid'){if(!positions)work(line.length);const name=line.slice(8).trim().replace(/\s+/g,' ');if(name&&name!==solidName)return meshError('STLのsolid終端を確認してください。');if(!positions){work(1);if(groups.length>=limits.maxItems)return meshError();groups.push({start:solidStart,count:solidFaces*3,materialIndex:groups.length});}inside=false;continue;}
        for(const cell of meshTokens(line)){if(!positions)work(1);const expected=pattern[step]!;if(expected){if(cell!==expected)return meshError();}else values.push(meshFloat(meshNumber(cell)));
          if(++step===pattern.length){if(!positions)work(30);else for(let v=0;v<3;v++)for(let k=0;k<3;k++){positions[faces*9+v*3+k]=values[3+v*3+k]!;normals![faces*9+v*3+k]=values[k]!;}
            faces++;solidFaces++;step=0;values.length=0;}
        }
      }
      if(inside||step||!faces)return meshError('STLの面や終端が不足しています。');return faces;
    };
    const faces=parse(),positions=new Float32Array(faces*9),normals=new Float32Array(faces*9);parse(positions,normals);geometry={positions,normals,groups};
  }
  return flatMeshSource('stl',bytes,{name:'STL',nodeIndex:0,primitiveIndex:0,geometry,materialSlots:[0]});
}
