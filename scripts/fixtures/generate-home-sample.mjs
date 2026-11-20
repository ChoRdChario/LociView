// Self-authored product example: geometry and raster diagram contain no external assets.
// Rebuilds the small embedded portable package with the existing production serializers.
import { build } from 'vite';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';

const entry = 'virtual:lociview-home-sample';
const bundled = await build({ configFile: false, logLevel: 'silent', plugins: [{ name: 'owned-home-sample',
  resolveId(id) { if (id === entry) return '\0' + entry; },
  load(id) { if (id === '\0' + entry) return `export {serializeGlb} from ${JSON.stringify(resolve('src/assets/glbOptimize.ts'))}; export {serializeNativeSnapshotV1} from ${JSON.stringify(resolve('src/nativeGs/schema.ts'))};`; },
}], build: { ssr: true, write: false, minify: false, rollupOptions: { input: entry, output: { inlineDynamicImports: true } } } });
const output = Array.isArray(bundled) ? bundled[0].output : bundled.output;
const chunk = output.find(value => value.type === 'chunk' && value.isEntry);
if (!chunk) throw Error('Home sample serializers were not bundled');
const { serializeGlb, serializeNativeSnapshotV1 } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
const positions = [], normals = [];
for (const [normal, corners] of [
  [[0,0,1],[[-1,-.65,.3],[1,-.65,.3],[1,.65,.3],[-1,.65,.3]]],
  [[0,0,-1],[[1,-.65,-.3],[-1,-.65,-.3],[-1,.65,-.3],[1,.65,-.3]]],
  [[1,0,0],[[1,-.65,.3],[1,-.65,-.3],[1,.65,-.3],[1,.65,.3]]],
  [[-1,0,0],[[-1,-.65,-.3],[-1,-.65,.3],[-1,.65,.3],[-1,.65,-.3]]],
  [[0,1,0],[[-1,.65,.3],[1,.65,.3],[1,.65,-.3],[-1,.65,-.3]]],
  [[0,-1,0],[[-1,-.65,-.3],[1,-.65,-.3],[1,-.65,.3],[-1,-.65,.3]]],
]) for (const index of [0,1,2,0,2,3]) { positions.push(...corners[index]); normals.push(...normal); }
const bin = Buffer.concat([Buffer.from(new Float32Array(positions).buffer), Buffer.from(new Float32Array(normals).buffer)]);
const model = serializeGlb({ asset: { version:'2.0', generator:'LociView self-authored Home sample' }, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0,name:'観察用パネル'}],
  meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},material:0}]}], buffers:[{byteLength:bin.length}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.length*4},{buffer:0,byteOffset:positions.length*4,byteLength:normals.length*4}],
  accessors:[{bufferView:0,componentType:5126,count:36,type:'VEC3',min:[-1,-.65,-.3],max:[1,.65,.3]},{bufferView:1,componentType:5126,count:36,type:'VEC3'}],
  materials:[{pbrMetallicRoughness:{baseColorFactor:[.43,.49,.44,1],metallicFactor:0,roughnessFactor:.8}}] }, bin);
const pngChunk = (type, data) => {
  const body=Buffer.concat([Buffer.from(type),data]); let crc=0xffffffff;
  for(const b of body) { crc^=b; for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  const head=Buffer.alloc(4),tail=Buffer.alloc(4); head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,body,tail]);
};
const width=320,height=240,pixels=Buffer.alloc((width*3+1)*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  let color=[226,225,211];
  if(x>34&&x<286&&y>32&&y<208)color=[112,126,116];
  if(x>43&&x<277&&y>41&&y<199)color=[152,163,151];
  if([[57,55],[263,55],[57,185],[263,185]].some(([a,b])=>Math.hypot(x-a,y-b)<6))color=[70,75,68];
  if(x>171&&x<224&&Math.abs(y-(130-(x-171)*.45))<2)color=[227,215,174];
  const offset=y*(width*3+1)+1+x*3;for(let c=0;c<3;c++)pixels[offset+c]=color[c];
}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(pixels)),pngChunk('IEND',Buffer.alloc(0))]);
const id=(p,n=1)=>`${p}_${String(n).padStart(26,'0')}`, hash=b=>createHash('sha256').update(b).digest('hex');
const ref=(b,mediaType)=>({algorithm:'sha256',digest:hash(b),byteLength:b.length,mediaType});
const placement={translation:[0,0,0],rotationXYZW:[0,0,0,1],uniformScale:1};
const snapshot={format:'lociview-native-project-snapshot',schemaVersion:1,snapshotId:id('snp'),generation:1,
  project:{id:id('prj'),title:'はじめての記録',frame:{id:id('frm'),handedness:'right',upAxis:'+Y',unit:{kind:'unknown'}}},
  assets:[{id:id('ast'),label:'観察用パネル',assetFrameId:id('frm',2),status:{kind:'ready',activeBindingId:id('bnd')}}],
  assetBindingRevisions:[{id:id('bnd'),assetId:id('ast'),assetRevisionId:id('rev'),assetToProject:placement,method:'manual'}],
  assetRevisions:[{id:id('rev'),assetId:id('ast'),representationIds:[id('rep')],anchorCompatibilityClasses:[{id:id('cls'),targetVariantFamilyIds:[id('fam')]}]}],
  representations:[{id:id('rep'),assetId:id('ast'),representationFrameId:id('frm',3),contentKind:'mesh',purposes:['source','display'],role:'meshPrimary',variantFamilyId:id('fam'),
    formatProfile:{id:'lociview-native-model-glb-v1'},blob:ref(model,'model/gltf-binary'),representationToAsset:{...placement,reflection:'none'},derivedFrom:[]}],
  presentation:{displayMode:'mesh-only',captionTargetAssetId:id('ast'),hiddenAssetIds:[],activeDisplaySetId:id('set')},
  displaySets:[{id:id('set'),name:'全体',orderKey:'AA',defaultSavedViewId:id('view')}],
  savedViews:[{id:id('view'),displaySetId:id('set'),name:'開始位置',orderKey:'AA',projectFrameId:id('frm'),camera:{position:[2,1.5,4],target:[0,0,0],up:[0,1,0],projection:{kind:'perspective',verticalFovRadians:.7}},background:{kind:'solid',colorSrgb:[.16,.17,.15]}}],
  captions:[{id:id('cap'),title:'パネルの傷',body:'右側に細い傷があります。添付の見本図で確認できます。本文を書き換えて、自分の記録として試せます。',displaySetId:id('set'),tags:['点検'],attachmentMediaIds:[id('med')],color:'#c2a45a',
    anchor:{kind:'asset',assetId:id('ast'),assetFrameId:id('frm',2),positionAsset:[.35,0,.3],authoredAssetRevisionId:id('rev'),authoredAnchorCompatibilityId:id('cls'),hitEvidence:{method:'manual'}}}],
  mediaResources:[{id:id('med'),label:'パネルの見本図.png',kind:'image',blob:ref(image,'image/png')}]};
const bytes=Buffer.from(serializeNativeSnapshotV1(snapshot)),manifest={format:'lociview-native-portable-backup',packageVersion:2,
  nativeSnapshot:{schemaVersion:1,projectId:snapshot.project.id,snapshotId:snapshot.snapshotId,generation:1,entry:'native/snapshot.json',byteLength:bytes.length,algorithm:'sha256',digest:hash(bytes)},
  representations:[{representationId:id('rep'),entry:`native/representations/${id('rep')}.bin`,...ref(model,'model/gltf-binary')}],media:[{mediaId:id('med'),entry:`native/media/${id('med')}.bin`,...ref(image,'image/png')}]};
const zip=new ZipWriter(new Uint8ArrayWriter());
for(const [path,body]of [['native/package.json',Buffer.from(JSON.stringify(manifest))],['native/snapshot.json',bytes],[manifest.representations[0].entry,model],[manifest.media[0].entry,image]])await zip.add(path,new Uint8ArrayReader(body),{level:0});
const encoded=Buffer.from(await zip.close()).toString('base64');
await writeFile('src/projectScene/homeSample.ts',`// Self-authored geometry and diagram. Rebuild: node scripts/fixtures/generate-home-sample.mjs\n// Bundled locally for offline use; opened through the normal inspected-file path.\nconst portable = '${encoded}';\n\nexport function homeSampleFiles(): readonly File[] {\n  const bytes = Uint8Array.from(atob(portable), character => character.charCodeAt(0));\n  return [new File([bytes], 'LociView-sample.zip', { type: 'application/zip' })];\n}\n`);
