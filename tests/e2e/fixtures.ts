import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { deflateSync } from 'node:zlib';
import { serializeGlb } from '../../src/assets/glbOptimize';
import { gsFixture } from '../helpers/gsFixture';

/** Owned synthetic inputs; no user data or externally downloaded sample. */
export function triangleGlb(z = 0) {
  const bin = new Uint8Array(36);
  new Float32Array(bin.buffer).set([-1, 0, z, 1, 0, z, 0, 2, z]);
  return Buffer.from(serializeGlb({ asset: { version: '2.0' }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, z], max: [1, 2, z] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.5, 0.8, 1], roughnessFactor: 0.7 } }],
  }, bin));
}

export function smallPng(red = 40,splitAlpha=false) {
  const chunk = (type: string, data: Buffer) => {
    const payload = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const head = Buffer.alloc(4), tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, payload, tail]);
  };
  const width=splitAlpha?64:2,height=splitAlpha?48:2;
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const row = splitAlpha?Buffer.alloc(1+width*4):Buffer.from([0, red, 120, 200, 255, 220, 160, 60, 255]);
  if(splitAlpha)for(let x=0;x<width;x++)row.set([red,120,200,x<width/2?0:255],1+x*4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array.from({length:height},()=>row)))), chunk('IEND', Buffer.alloc(0))]);
}

/** Nonoverlapping owned sources: lit/double, opaque/unlit alpha.25, source MASK .8×.8×texture. */
export function sourceMaterialPanelsGlb(change?:(json:any)=>void){
  const parts:Buffer[]=[],views:any[]=[],accessors:any[]=[],primitives:any[]=[];let offset=0;
  const floats=(values:number[],type:string,extra:object={})=>{const bytes=Buffer.alloc(values.length*4);values.forEach((n,i)=>bytes.writeFloatLE(n,i*4));const view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});parts.push(bytes);offset+=bytes.length;const index=accessors.length;accessors.push({bufferView:view,componentType:5126,count:values.length/Number(type.slice(-1)),type,...extra});return index;};
  for(const [i,x]of[-3,0,3].entries()){
    const position=floats([x-1,-1,0,x+1,-1,0,x+1,1,0,x-1,-1,0,x+1,1,0,x-1,1,0],'VEC3',{min:[x-1,-1,0],max:[x+1,1,0]}),uv=floats([0,0,1,0,1,1,0,0,1,1,0,1],'VEC2'),attributes:any={POSITION:position,TEXCOORD_0:uv};
    if(i===2)attributes.COLOR_0=floats(Array.from({length:6},()=>[1,1,1,.8]).flat(),'VEC4');primitives.push({attributes,material:i});
  }
  const image=smallPng(40,true),imageView=views.length;views.push({buffer:0,byteOffset:offset,byteLength:image.length});parts.push(image);offset+=image.length;
  const j:any={asset:{version:'2.0'},extensionsUsed:['KHR_materials_unlit'],scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives}],buffers:[{byteLength:offset}],bufferViews:views,accessors,
    materials:[{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.4,.8,.2,1],metallicFactor:0,roughnessFactor:.7}},
      {extensions:{KHR_materials_unlit:{}},pbrMetallicRoughness:{baseColorFactor:[.3,.6,.9,.25]}},
      {alphaMode:'MASK',alphaCutoff:.5,pbrMetallicRoughness:{baseColorFactor:[1,1,1,.8],baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.7}}],
    samplers:[{magFilter:9728,minFilter:9728,wrapS:33071,wrapT:33071}],textures:[{source:0,sampler:0}],images:[{bufferView:imageView,mimeType:'image/png'}]};
  change?.(j);return Buffer.from(serializeGlb(j,Buffer.concat(parts)));
}

/** Embedded owned texture plus UVs; exercises bitmap lifetime on GPU recovery. */
export function texturedTriangleGlb() {
  const image=smallPng(), bin=new Uint8Array(60+image.length);
  new Float32Array(bin.buffer,0,9).set([-1,0,0,1,0,0,0,2,0]);
  new Float32Array(bin.buffer,36,6).set([0,0,1,0,.5,1]);bin.set(image,60);
  return Buffer.from(serializeGlb({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Panel',mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},material:0}]}],buffers:[{byteLength:bin.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:24},{buffer:0,byteOffset:60,byteLength:image.length}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}, {bufferView:1,componentType:5126,count:3,type:'VEC2'}],
    materials:[{name:'Panel paint',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.7}}],
    textures:[{source:0}],images:[{bufferView:2,mimeType:'image/png'}]},bin));
}

/** Existing admitted Native recipe-1 shape, synthesized locally for real browser entry. */
export async function nativeConversionBackup(model: Buffer, image: Buffer, captionCount = 2, appearance = false,
  extension?: {update(snapshot: any): void; bodies: ReadonlyMap<string, Buffer>}) {
  const id = (prefix: string, n: number) => `${prefix}_${String(n).padStart(26, '0')}`;
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const placement = () => ({ translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 });
  const modelBlob = { algorithm: 'sha256', digest: hash(model), byteLength: model.length, mediaType: 'model/gltf-binary' };
  const imageBlob = { algorithm: 'sha256', digest: hash(image), byteLength: image.length, mediaType: 'image/png' };
  const snapshot = { format: 'lociview-native-project-snapshot', schemaVersion: 1, snapshotId: id('snp', 1), generation: 1,
    project: { id: id('prj', 1), title: 'Nativeから引き継ぐ記録', frame: { id: id('frm', 1), handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } } },
    assets: [2, 1].map(n => ({ id: id('ast', n), label: n === 1 ? '建物' : '非表示の設備', assetFrameId: id('frm', n + 1), status: { kind: 'ready', activeBindingId: id('bnd', n) } })),
    assetBindingRevisions: [1, 2].map(n => ({ id: id('bnd', n), assetId: id('ast', n), assetRevisionId: id('rev', n), assetToProject: { ...placement(), translation: [n, 0, 0] }, method: 'manual' })),
    assetRevisions: [1, 2].map(n => ({ id: id('rev', n), assetId: id('ast', n), representationIds: [id('rep', n)], anchorCompatibilityClasses: [{ id: id('cls', n), targetVariantFamilyIds: [id('fam', n)] }] })),
    representations: [1, 2].map(n => ({ id: id('rep', n), assetId: id('ast', n), representationFrameId: id('frm', n + 3), contentKind: 'mesh', purposes: ['source', 'display'], role: 'meshPrimary',
      variantFamilyId: id('fam', n), formatProfile: { id: 'lociview-native-model-glb-v1' }, blob: modelBlob, representationToAsset: { ...placement(), reflection: 'none' }, derivedFrom: [] })),
    presentation: { displayMode: 'gs-only', captionTargetAssetId: null, hiddenAssetIds: [id('ast', 2)], activeDisplaySetId: id('set', 2) },
    displaySets: [{ id: id('set', 2), name: '観察', orderKey: 'ZZ', defaultSavedViewId: id('view', 1) }, { id: id('set', 0), name: '全体', orderKey: 'AA', defaultSavedViewId: null }],
    savedViews: [{ id: id('view', 1), displaySetId: id('set', 2), name: '記録した視点', orderKey: 'old', projectFrameId: id('frm', 1),
      camera: { position: [1, 2, 8], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 0.7 } }, background: { kind: 'solid', colorSrgb: [0.1, 0.2, 0.3] } }],
    captions: [{ id: id('cap', 1), title: '既存のピン', body: '本文を保持', displaySetId: id('set', 2), tags: ['観察', '記録'], attachmentMediaIds: [id('med', 2), id('med', 1)],
      anchor: { kind: 'asset', assetId: id('ast', 1), assetFrameId: id('frm', 2), positionAsset: [3, 0.5, 0], authoredAssetRevisionId: id('rev', 1), authoredAnchorCompatibilityId: id('cls', 1), hitEvidence: { method: 'manual' } } },
      { id: id('cap', 2), title: '未配置の記録', body: '', displaySetId: id('set', 2), tags: ['記録'], color: '#123456', anchor: null }],
    mediaResources: [1, 2].map(n => ({ id: id('med', n), label: `画像 ${n}`, kind: 'image', blob: imageBlob })) };
  const placed = snapshot.captions[0]! as Extract<(typeof snapshot.captions)[number], { anchor: object }>;
  for (let n = 3; n <= captionCount; n++) snapshot.captions.push({ ...placed, id: id('cap', n),
    title: `${String(n).padStart(3, '0')}：長い日本語の記録名を狭い画面でも省略せず確認するための現地観察記録`,
    body: `現地観察の記録 ${n}`, tags: [], attachmentMediaIds: [] });
  if (appearance) Object.assign(snapshot,{meshMaterialAppearances:snapshot.displaySets.map((set,i)=>({id:id('mat',i+1),
    displaySetId:set.id,assetId:id('ast',1),authoredAssetRevisionId:id('rev',1),representationId:id('rep',1),materialSlotKey:'m/0/0',
    opacity:1,doubleSided:true,unlit:true,chroma:{enabled:false,colorSrgb:[0,1,0],tolerance:.2,feather:0}}))});
  extension?.update(snapshot);
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const manifest = { format: 'lociview-native-portable-backup', packageVersion: 2,
    nativeSnapshot: { schemaVersion: 1, projectId: snapshot.project.id, snapshotId: snapshot.snapshotId, generation: snapshot.generation, entry: 'native/snapshot.json', byteLength: bytes.length, algorithm: 'sha256', digest: hash(bytes) },
    representations: snapshot.representations.map(r => ({ representationId: r.id, entry: `native/representations/${r.id}.bin`, ...r.blob })),
    media: snapshot.mediaResources.map(m => ({ mediaId: m.id, entry: `native/media/${m.id}.bin`, ...m.blob })) };
  const writer = new ZipWriter(new Uint8ArrayWriter());
  const add = (path: string, content: Uint8Array) => writer.add(path, new Uint8ArrayReader(content), { level: 0 });
  await add('native/package.json', Buffer.from(JSON.stringify(manifest))); await add('native/snapshot.json', bytes);
  for (const row of manifest.representations) await add(row.entry, extension?.bodies.get(row.representationId) ?? model);
  for (const row of manifest.media) await add(row.entry, image);
  return Buffer.from(await writer.close());
}

/** Owned Node fixture only; browser source ownership/streaming is verified separately. */
export async function nativeSpatialBackup(rows = 256,extension?:{bodies:ReadonlyMap<string,Buffer>;update(snapshot:any):void}) {
  const id=(p:string,n:number)=>`${p}_${String(n).padStart(26,'0')}`, sample=gsFixture(3);
  const header=Buffer.from(new TextDecoder().decode(sample.subarray(0,sample.length-248)).replace('element vertex 1',`element vertex ${rows}`));
  const gs=Buffer.alloc(header.length+rows*248);header.copy(gs);const width=Math.ceil(Math.sqrt(rows));
  for(let i=0;i<rows;i++){
    const offset=header.length+i*248;gs.writeFloatLE((i%width-width/2)/(width/2),offset);gs.writeFloatLE((Math.floor(i/width)-width/2)/(width/2),offset+4);
    gs.writeFloatLE(.4,offset+24);
    for(const k of [55,56,57])gs.writeFloatLE(Math.log(rows>10000?.003:.045),offset+k*4);gs.writeFloatLE(1,offset+58*4);
  }
  const pointHeader='ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n';
  const point=Buffer.from(pointHeader+'-1 0 0 255 0 0\n1 1 0 0 255 0\n'),proxy=triangleGlb(),hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
  const ref=(b:Buffer,mediaType:string)=>({algorithm:'sha256',digest:hash(b),byteLength:b.length,mediaType});
  const bodies=new Map<string,Buffer>([[id('rep',1),point],[id('rep',2),gs],[id('rep',3),proxy]]);
  for(const [id,body] of extension?.bodies??[])bodies.set(id,body);
  const file=await nativeConversionBackup(proxy,smallPng(),2,false,{bodies,update(s){
    const p=s.representations[0],g=s.representations[1],mesh=structuredClone(p);
    s.project.title='Native点群とGS';s.presentation.displayMode='mixed';s.presentation.hiddenAssetIds=[id('ast',3)];
    s.assets.find((a:any)=>a.id===id('ast',1)).label='点群';s.assets.find((a:any)=>a.id===id('ast',2)).label='GS';
    s.assetBindingRevisions[0].assetToProject.translation=[0,0,0];s.assetBindingRevisions[1].assetToProject.translation=[-1.5,0,0];
    Object.assign(p,{role:'pointPrimary',contentKind:'pointCloud',formatProfile:{id:'lociview-native-point-ply-ascii-xyz-rgb-v1'},blob:ref(point,'application/octet-stream'),
      pointPly:{pointCount:2,headerByteLength:Buffer.byteLength(pointHeader),encoding:'ascii'},representationToAsset:{translation:[1,0,0],rotationXYZW:[0,1,0,0],uniformScale:.5,reflection:'x'}});
    Object.assign(g,{role:'gsPrimary',contentKind:'gaussianSplat',formatProfile:{id:'lociview-native-graphdeco-ply-le-sh2-sh3-v1'},blob:ref(gs,'application/octet-stream'),
      gsPly:{shDegree:3,splatCount:rows,headerByteLength:header.length,recordStrideBytes:248,payloadByteLength:rows*248}});
    s.representations.push({...mesh,id:id('rep',3),assetId:g.assetId,representationFrameId:id('frm',8),role:'interactionProxy',purposes:['interaction'],variantFamilyId:id('fam',3),
      derivedFrom:[g.id],proxyForGsVariantFamilyId:g.variantFamilyId,representationToAsset:{translation:[.1,-.1,.05],rotationXYZW:[0,1,0,0],uniformScale:.8,reflection:'none'}});
    s.assetRevisions[1].representationIds.push(id('rep',3));
    s.representations.push({...mesh,id:id('rep',4),assetId:id('ast',3),representationFrameId:id('frm',10),variantFamilyId:id('fam',4)});
    s.assets.push({id:id('ast',3),label:'非表示の面モデル',assetFrameId:id('frm',9),status:{kind:'ready',activeBindingId:id('bnd',3)}});
    s.assetRevisions.push({id:id('rev',3),assetId:id('ast',3),representationIds:[id('rep',4)],anchorCompatibilityClasses:[{id:id('cls',3),targetVariantFamilyIds:[id('fam',4)]}]});
    s.assetBindingRevisions.push({...structuredClone(s.assetBindingRevisions[0]),id:id('bnd',3),assetId:id('ast',3),assetRevisionId:id('rev',3)});
    s.captions[0].anchor.positionAsset=[1,.5,0];
    extension?.update(s);
  }});
  const eocd=file.lastIndexOf(Buffer.from([80,75,5,6])),bodyRanges:{start:number;end:number}[]=[];
  let central=file.readUInt32LE(eocd+16);
  for(let i=0;i<file.readUInt16LE(eocd+10);i++){
    if(file.readUInt32LE(central)!==0x02014b50)throw Error('Owned Native fixture central directory');
    const nameLength=file.readUInt16LE(central+28),extraLength=file.readUInt16LE(central+30),commentLength=file.readUInt16LE(central+32),local=file.readUInt32LE(central+42);
    const name=file.toString('utf8',central+46,central+46+nameLength),start=local+30+file.readUInt16LE(local+26)+file.readUInt16LE(local+28);
    if(name.startsWith('native/representations/')||name.startsWith('native/media/'))bodyRanges.push({start,end:start+file.readUInt32LE(central+20)});
    central+=46+nameLength+extraLength+commentLength;
  }
  return {file,bodyRanges,gsDigest:hash(gs),gsBytes:gs.length,pointDigest:hash(point),proxyDigest:hash(bodies.get(id('rep',3))!),originalDigest:hash(file),rows};
}

/** Owned07l source vectors, never user files or public fixtures. */
export function meshSources(){
  const goldens=JSON.parse(readFileSync('docs/specs/profiles/mesh-conversion-8.goldens.json','utf8'));
  return (['stl','ply','obj','gltf'] as const).map((format,i)=>{const g=goldens.sources[['stl-magics-red','ply-quad','obj-slots','gltf-json'][i]!];return{format,bytes:format==='obj'?Buffer.from('mtllib unavailable.mtl\n'+g.utf8):g.utf8?Buffer.from(g.utf8):Buffer.from(g.base64,'base64')};});
}
export async function nativeMeshBackup(opaqueMaterials=false,standardMaterials=false){
  const id=(p:string,n:number)=>`${p}_${String(n).padStart(26,'0')}`,hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),sources=meshSources();
  if(opaqueMaterials){const source=sources.find(s=>s.format==='gltf')!,j=JSON.parse(source.bytes.toString('utf8'));j.materials[0].doubleSided=true;j.materials[0].extensions={KHR_materials_unlit:{}};j.extensionsUsed=['KHR_materials_unlit'];if(standardMaterials)j.materials[0].alphaMode='BLEND';source.bytes=Buffer.from(JSON.stringify(j));}
  const proxy=Buffer.from('mtllib unavailable.mtl\no Surface\nv -1 0 0\nv 1 0 0\nv 0 2 0\nv -1 1 0\ns off\nusemtl First\nf 1 2 3\nusemtl Second\nf 1 3 4\n'),bodies=new Map([[id('rep',3),proxy],...sources.map((s,i)=>[id('rep',100+i),s.bytes] as const)]);
  return nativeSpatialBackup(256,{bodies,update(s){
    const placement=()=>({translation:[0,0,0],rotationXYZW:[0,0,0,1],uniformScale:1});
    const blob=(b:Buffer,mediaType:string)=>({algorithm:'sha256',digest:hash(b),byteLength:b.length,mediaType});
    Object.assign(s.representations.find((r:any)=>r.id===id('rep',3)),{formatProfile:{id:'lociview-native-model-obj-v1'},blob:blob(proxy,'text/plain')});
    for(const [i,source] of sources.entries()){const n=100+i,asset=id('ast',n),rep=id('rep',n),family=id('fam',n),revision=id('rev',n);
      s.assets.push({id:asset,label:source.format,assetFrameId:id('frm',200+n),status:{kind:'ready',activeBindingId:id('bnd',n)}});
      s.assetBindingRevisions.push({id:id('bnd',n),assetId:asset,assetRevisionId:revision,assetToProject:{...placement(),translation:[i*3+6,0,0]},method:'manual'});
      s.assetRevisions.push({id:revision,assetId:asset,representationIds:[rep],anchorCompatibilityClasses:[{id:id('cls',n),targetVariantFamilyIds:[family]}]});
      s.representations.push({id:rep,assetId:asset,representationFrameId:id('frm',400+n),contentKind:'mesh',purposes:['source','display'],role:'meshPrimary',variantFamilyId:family,formatProfile:{id:`lociview-native-model-${source.format}-v1`},blob:blob(source.bytes,source.format==='stl'?'model/stl':source.format==='obj'?'text/plain':source.format==='gltf'?'model/gltf+json':'application/octet-stream'),representationToAsset:{...placement(),translation:[1,2,3],uniformScale:2,reflection:'x'},derivedFrom:[]});
    }
    if(opaqueMaterials)s.meshMaterialAppearances=[102,103].map((n,i)=>({id:id('mat',n),displaySetId:s.displaySets[0].id,assetId:id('ast',n),authoredAssetRevisionId:id('rev',n),representationId:id('rep',n),materialSlotKey:'m/0/0',opacity:1,doubleSided:true,unlit:i===0,chroma:{enabled:false,colorSrgb:[0,1,0],tolerance:.3,feather:0}}));
    if(standardMaterials)for(const [i,a]of s.meshMaterialAppearances.entries()){a.opacity=i===0?.5:1;a.chroma.enabled=true;a.chroma.feather=i===0?.2:0;}
  }});
}

/** Frozen-v1 GLB/PNG subset from the existing owned operation-log fixture. */
export async function frozenV1ConversionBackup(model: Buffer, image: Buffer, appearance = false) {
  const id = (prefix: string, n: number) => `${prefix}_${String(n).padStart(26, '0')}`, actor = 'a_0000000000001', ops: Record<string, unknown>[] = [];
  const add = (e: string, n: number, v: Record<string, unknown>, t = 'create') => { const op = ops.length + 1;
    ops.push({ op, hlc: `2026-10-15T00:00:00.000Z-${op.toString(16).padStart(4, '0')}-${actor}`, actor, user: '', t, e,
      id: id(e === 'caption' ? 'cap' : e === 'asset' ? 'ast' : e === 'profile' ? 'usr' : e === 'material' ? 'mat' : e, n), ...(t === 'delete' ? {} : { v }) }); };
  add('set', 1, { name: '観察', order: 1 }); add('set', 2, { name: '全体', order: 2 });
  add('asset', 1, { kind: 'model', path: 'models/model.glb', originalName: '模型.glb', mime: '', size: model.length, transform: { scale: 1, upAxis: 'Y' }, pinScale: 1.5 });
  const digest = createHash('sha256').update(image).digest('hex');
  for (const n of [2, 3, 4]) add('asset', n, { kind: 'image', path: `media/image${n}.png`, originalName: `画像${n}.png`, mime: 'image/png', size: image.length, sha256: digest });
  add('caption', 1, { setId: id('set', 1), title: '配置済み', body: '元の本文', color: '#eab308', tags: ['記録', '観察'], attachments: [id('ast', 2), id('ast', 3), id('ast', 2)], anchor: { modelAssetId: id('ast', 1), position: [0.25, 0.5, 0], normal: [0, 0, 1] } });
  add('caption', 2, { setId: id('set', 1), title: '', body: '', color: '#123456' });
  add('caption', 3, { setId: id('set', 2), title: '親だけの記録', body: '', color: '#ff8000', anchor: { modelAssetId: id('ast', 1) } });
  add('view', 1, { setId: id('set', 1), name: '透視図', cameraState: { eye: [1, 2, 5], target: [0, 0, 0], up: [0, 1, 0], fov: 60, ortho: false }, background: '#123456' });
  add('profile', 1, { displayName: '過去の編集者', defaultPinColor: '#eab308' }); add('asset', 4, {}, 'delete');
  if (appearance) add('material', 1, { setId: id('set', 1), modelAssetId: id('ast', 1), materialKey: 'm/Panel/0', opacity: 1, doubleSided: true, unlit: true });
  const entries: [string, Uint8Array][] = [
    ['lociview.json', Buffer.from(JSON.stringify({ format: 'lociview-project', schemaVersion: 1, projectId: id('prj', 1), name: '旧形式の記録', createdAt: '2026-10-15T00:00:00.000Z', generator: 'synthetic-test' }))],
    [`ops/${actor}.jsonl`, Buffer.from('  ' + ops.map(op => JSON.stringify(op)).join('\r\n') + '\r\n' + JSON.stringify(ops[0]) + '\r\n')],
    ['models/model.glb', model], ...[2, 3, 4].map(n => [`media/image${n}.png`, image] as [string, Uint8Array]),
    ['snapshot.json', Buffer.from('{"stale":true}')], ['captions.csv', Buffer.from('ignored cache')], ['thumbs/unused.png', image],
  ];
  const writer = new ZipWriter(new Uint8ArrayWriter()); for (const [path, bytes] of entries) await writer.add(path, new Uint8ArrayReader(bytes), { level: 0 }); return Buffer.from(await writer.close());
}

/** One CSV, one static GLB and one exact image relation; no auxiliary mapping guess. */
export async function lociMyuConversionBackup(model: Buffer, image: Buffer) {
  const entries: [string, Uint8Array][] = [ ['models/model.glb', model], ['media/a.png', image],
    ['records.csv', Buffer.from('id,title,body,color,posX,posY,posZ,imageFileId,createdAt,updatedAt\nplaced,配置済み,元の本文,#123456,0.2,0.2,0,image1,,\nunplaced,未配置の記録,,#eab308,,,,image1,,\n')],
    ['file_ids.csv', Buffer.from('fileId,filename\nimage1,a.png\n')],
  ];
  const writer = new ZipWriter(new Uint8ArrayWriter()); for (const [path, bytes] of entries) await writer.add(path, new Uint8ArrayReader(bytes), { level: 0 }); return Buffer.from(await writer.close());
}
