import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {meshSourceDeclarations,type MeshSourceFormat} from '../src/domain/meshSource';
import {classifyMeshSource,inspectMeshSource,meshSourceProfile} from '../src/projectFiles/meshSource';
import {digest} from '../src/projectMetadata/persistence';
import {captureMeshOccurrenceProof,decodeMeshSource} from '../src/projectFiles/meshDecode';
const goldens=JSON.parse(readFileSync('docs/specs/profiles/mesh-conversion-8.goldens.json','utf8'));
const limits={maxFileBytes:64*1024*1024,maxJsonBytes:4*1024*1024,maxItems:100000,maxValues:5000000,maxPixels:16000000};
const fixture=(name:string):Uint8Array=>{const g=goldens.sources[name];return g.utf8?new TextEncoder().encode(g.utf8):new Uint8Array(Buffer.from(g.base64,'base64'));};
function binaryPly(){const text=goldens.sources['ply-quad'].utf8 as string,header=text.slice(0,text.indexOf('end_header\n')+11).replace('format ascii','format binary_little_endian'),h=new TextEncoder().encode(header),bytes=new Uint8Array(h.length+77),v=new DataView(bytes.buffer);bytes.set(h);let at=h.length;
  for(const row of [[0,0,0,128,0,0],[1,0,0,0,255,0],[1,1,0,0,0,255],[0,1,0,255,255,255]]){for(let i=0;i<3;i++){v.setFloat32(at,row[i]!,true);at+=4;}for(let i=3;i<6;i++)v.setUint8(at++,row[i]!);}
  v.setUint8(at++,4);for(const n of [0,1,2,3]){v.setInt32(at,n,true);at+=4;}return bytes;
}
describe('approved07l owned Mesh source admission; no device/adoption evidence',()=>{
  it('recognizes indented OBJ after long comments and rejects token expansion under the existing work budget',async()=>{
    const obj='#'+'.'.repeat(70000)+'\n v 0 0 0\n v 1 0 0\n v 0 1 0\n f 1 2 3\n',bytes=new TextEncoder().encode(obj);expect(classifyMeshSource(bytes)).toBe('obj');expect((await inspectMeshSource('obj',bytes,limits)).sourceSlots).toHaveLength(1);
    await expect(inspectMeshSource('obj',new TextEncoder().encode('v '+ '0 '.repeat(20000)),{...limits,maxValues:100})).rejects.toThrow();
    await expect(inspectMeshSource('stl',new TextEncoder().encode('solid s\n'+'facet normal 0 0 1 outer loop vertex 0 0 0 vertex 1 0 0 vertex 0 1 0 endloop endfacet '.repeat(1000)+'\nendsolid s\n'),{...limits,maxValues:100})).rejects.toThrow('検査量');
  });
  it('recognizes admitted STL/glTF after long leading whitespace without filename guessing',()=>{
    const prefix=' '.repeat(70000)+'\n';expect(classifyMeshSource(new TextEncoder().encode(prefix+new TextDecoder().decode(fixture('stl-ascii'))))).toBe('stl');expect(classifyMeshSource(new TextEncoder().encode(prefix+new TextDecoder().decode(fixture('gltf-json'))))).toBe('gltf');
  });
  it('binds four exact profile bytes and shared approved source/ID goldens',async()=>{
    for(const format of Object.keys(meshSourceDeclarations) as MeshSourceFormat[]){const d=meshSourceDeclarations[format],bytes=new Uint8Array(readFileSync(`docs/specs/profiles/mesh-${format}-1.profile.json`));expect(await digest(bytes)).toBe(d.sha256);expect(await meshSourceProfile(format)).toEqual({id:d.id,specificationSha256:d.sha256});}
    for(const g of Object.values(goldens.sources) as any[]){const bytes=g.utf8?new TextEncoder().encode(g.utf8):new Uint8Array(Buffer.from(g.base64,'base64'));expect(bytes.length).toBe(g.byteLength);expect(await digest(bytes)).toBe(g.sha256);}
  });
  it('keeps STL ASCII facet normals, solid groups and original bytes while owning input before awaits',async()=>{
    const input=fixture('stl-ascii'),before=input.slice(),pending=inspectMeshSource('stl',input,limits);input.fill(0);const m=await pending;
    expect(m.bytes).toEqual(before);expect(m.primitives![0]!.geometry.positions).toEqual(new Float32Array(goldens.transform.rawTrianglePositions));expect(m.primitives![0]!.geometry.normals).toEqual(new Float32Array([0,0,1,0,0,1,0,0,1]));expect(m.primitives![0]!.geometry.groups).toEqual([{start:0,count:3,materialIndex:0}]);
    const source=new TextEncoder().encode('solid Empty\nendsolid Empty\n'+new TextDecoder().decode(before));const multiple=await inspectMeshSource('stl',source,limits);expect(multiple.primitives![0]!.geometry.groups).toEqual([{start:0,count:0,materialIndex:0},{start:0,count:3,materialIndex:1}]);
    const zero=new TextEncoder().encode(new TextDecoder().decode(before).replace('normal 0 0 1','normal 0 0 0'));expect((await inspectMeshSource('stl',zero,limits)).primitives![0]!.geometry.normals.every(n=>n===0)).toBe(true);
  });
  it('keeps the exact Magics opaque binary STL color interpretation and face order',async()=>{
    const bytes=fixture('stl-magics-red'),m=await inspectMeshSource('stl',bytes,limits);expect(m.bytes).toEqual(bytes);expect([...m.primitives![0]!.geometry.colors!]).toEqual(goldens.sources['stl-magics-red'].linearRgbPerCorner);expect(m.primitives![0]!.geometry.groups).toEqual([]);expect(m.materialDescriptors![0]!.colorSrgb).toEqual([1,1,1]);
  });
  it.each(['ascii','binary'] as const)('keeps %s PLY quad winding, nonendpoint Float32 colors and generated normals',async encoding=>{
    const bytes=encoding==='ascii'?fixture('ply-quad'):binaryPly(),m=await inspectMeshSource('ply',bytes,limits),geometry=m.primitives![0]!.geometry,g=goldens.sources['ply-quad'];
    expect(m.bytes).toEqual(bytes);expect([...geometry.indices!]).toEqual(g.indices);expect(geometry.indices).toBeInstanceOf(Uint16Array);expect([...geometry.colors!]).toEqual(g.linearRgb);expect([...geometry.normals]).toEqual(g.normals);expect(m.surfaceRanges).toEqual(g.surfaceRanges);expect(m.bounds).toEqual({min:[0,0,0],max:[1,1,0]});
  });
  it('retains unused PLY vertices in bounds and leaves their generated normals zero',async()=>{
    const text=goldens.sources['ply-quad'].utf8.replace('element vertex 4','element vertex 5').replace('4 0 1 2 3\n','9 8 7 0 0 0\n4 0 1 2 3\n'),m=await inspectMeshSource('ply',new TextEncoder().encode(text),limits);expect(m.bounds.max).toEqual([9,8,7]);expect([...m.primitives![0]!.geometry.normals.slice(-3)]).toEqual([0,0,0]);
  });
  it('refuses malformed/unsupported STL whole sources without modifying input',async()=>{
    const binary=fixture('stl-magics-red'),ascii=goldens.sources['stl-ascii'].utf8 as string;
    const cases=[new TextEncoder().encode(ascii.replace('normal 0 0 1','normal NaN 0 1')),new TextEncoder().encode(ascii.replace('vertex 1 0 0','vertex 1e40 0 0')),new TextEncoder().encode(ascii.replace('endfacet','endfacet\nvertex 0 0 0')),binary.slice(0,-1)];
    for(const mutate of [(b:Uint8Array)=>b[9]=128,(b:Uint8Array)=>b.set(new TextEncoder().encode('COLOR='),20),(b:Uint8Array)=>new DataView(b.buffer).setFloat32(84,NaN,true)]){const b=binary.slice();mutate(b);cases.push(b);}
    for(const bytes of cases){const before=bytes.slice();await expect(inspectMeshSource('stl',bytes,limits)).rejects.toThrow();expect(bytes).toEqual(before);}
  });
  it('refuses unsupported PLY properties, non-triangle/quad faces, invalid indices and trailing bytes',async()=>{
    const s=goldens.sources['ply-quad'].utf8 as string;
    for(const text of [s.replace('property uchar blue','property uchar alpha'),s.replace('property float x','property float x\nproperty float x'),s.replace('4 0 1 2 3','5 0 1 2 3 0'),s.replace('4 0 1 2 3','3 0 -1 2'),s.replace('4 0 1 2 3','3 0 1 99'),s.replace('0 0 0 128','1e40 0 0 128'),s+'extra\n']){const bytes=new TextEncoder().encode(text),before=bytes.slice();await expect(inspectMeshSource('ply',bytes,limits)).rejects.toThrow();expect(bytes).toEqual(before);}
    const b=binaryPly();await expect(inspectMeshSource('ply',b.slice(0,-1),limits)).rejects.toThrow();await expect(inspectMeshSource('ply',new Uint8Array([...b,0]),limits)).rejects.toThrow();
  });
  it('enforces existing byte/work limits and explicit read-only cancellation before source publication',async()=>{
    const b=fixture('ply-quad');await expect(inspectMeshSource('ply',b,{...limits,maxFileBytes:b.length-1})).rejects.toThrow();await expect(inspectMeshSource('ply',b,{...limits,maxValues:10})).rejects.toThrow();const c=new AbortController();c.abort();await expect(inspectMeshSource('ply',b,limits,undefined,undefined,c.signal)).rejects.toMatchObject({name:'AbortError'});
  });
  it('keeps OBJ fan order, independent material runs and nonempty implicit object ordinals',async()=>{
    for(const name of ['obj-slots','obj-implicit-adoption']){
      const bytes=fixture(name),m=await inspectMeshSource('obj',bytes,limits);expect(m.bytes).toEqual(bytes);expect(m.format).toBe('obj');expect(m.materialDescriptors!.every(d=>d.kind==='phong')).toBe(true);
      if(name==='obj-slots'){expect(m.sourceSlots.map(s=>s.address)).toEqual(goldens.sources[name].sourceSlots.map((s:any)=>({kind:'obj-material-run',slotIndex:s.slotIndex,objectOrdinal:s.objectOrdinal,materialRunOrdinal:s.materialRunOrdinal})));expect(m.primitives![0]!.geometry.positions).toEqual(new Float32Array([0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0]));expect(m.primitives![0]!.geometry.groups).toEqual([{start:0,count:3,materialIndex:0},{start:3,count:3,materialIndex:1}]);}
      else{expect(m.surfaceRanges).toEqual([{kind:'meshTriangle',nodeIndex:0,primitiveIndex:0,count:2},{kind:'meshTriangle',nodeIndex:1,primitiveIndex:0,count:1}]);expect(m.primitives!.map(p=>p.name)).toEqual(['Adopted','Next']);}
    }
  });
  it('keeps OBJ midtone RGB, original-Number generated normals and unavailable MTL consequences',async()=>{
    const colored=await inspectMeshSource('obj',fixture('obj-mid-rgb'),limits);expect([...colored.primitives![0]!.geometry.colors!]).toEqual(goldens.sources['obj-mid-rgb'].linearRgbPerCorner);
    const text='mtllib never-read.mtl\nv 0 0 0\nv 1e-50 0 0\nv 0 1e-50 0\nf 1 2 3\nusemtl Adopted\ns off\n',m=await inspectMeshSource('obj',new TextEncoder().encode(text),limits);expect(m.externalMaterialsUnavailable).toBe(true);expect([...m.primitives![0]!.geometry.positions]).toEqual(Array(9).fill(0));expect([...m.primitives![0]!.geometry.normals]).toEqual([0,0,1,0,0,1,0,0,1]);expect(m.materialDescriptors).toMatchObject([{name:'Adopted',flatShading:true}]);expect(m.sourceSlots).toHaveLength(1);
  });
  it('refuses unknown OBJ directives, invalid/mixed references and incomplete colors without repairing source',async()=>{
    const base='v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
    for(const text of [base+'l 1 2\n',base.replace('f 1 2 3','f 1 0 3'),base.replace('f 1 2 3','f 1 2 9'),base.replace('f 1 2 3','vt 0 0\nf 1/1 2 3'),base.replace('v 0 0 0','v 0 0 0 1 0 0'),base+'s 42\n',base.replace('v 1 0 0','v 1e40 0 0'),base+'curv 1 2 3\n']){const b=new TextEncoder().encode(text),before=b.slice();await expect(inspectMeshSource('obj',b,limits)).rejects.toThrow();expect(b).toEqual(before);}
  });
  it('validates self-contained glTF through unchanged shared static facts, retaining source JSON and node/occurrence identity',async()=>{
    const bytes=fixture('gltf-json'),m=await inspectMeshSource('gltf',bytes,limits);expect(m.bytes).toEqual(bytes);expect(m.kind).toBe('mesh-source');expect(m.bounds).toEqual(goldens.sources['gltf-json'].rawBounds);expect(m.occurrences).toEqual(goldens.sources['gltf-json'].occurrences);expect(m.materials).toHaveLength(1);expect(m.materials[0]!.sourceLocator).toEqual({kind:'representationMaterial',slotIndex:0});
  });
  it('refuses glTF external/blob/noncanonical resources, invalid original view references and unused unsupported fields',async()=>{
    for(const change of [(j:any)=>j.buffers[0].uri='https://invalid.example/model.bin',(j:any)=>j.buffers[0].uri='blob:invalid',(j:any)=>j.buffers[0].uri+='=',(j:any)=>j.accessors[0].bufferView=99,(j:any)=>j.nodes.push({skin:0}),(j:any)=>j.images=[{uri:'data:image/png;base64,AA==',bufferView:0}],(j:any)=>j.scenes.push({nodes:[]})]){
      const j=JSON.parse(new TextDecoder().decode(fixture('gltf-json')));change(j);if(j.scenes.length>1)delete j.scene;const bytes=new TextEncoder().encode(JSON.stringify(j)),before=bytes.slice();await expect(inspectMeshSource('gltf',bytes,limits)).rejects.toThrow();expect(bytes).toEqual(before);
    }
  });
  it.each([['stl','stl-ascii'],['stl','stl-magics-red'],['ply','ply-quad'],['obj','obj-slots'],['obj','obj-mid-rgb'],['obj','obj-implicit-adoption'],['gltf','gltf-json']] as const)('proves %s %s against actual180 and independently builds/disposes186 with unique material slots',async(format,name)=>{
    if(format==='gltf'){vi.stubGlobal('ProgressEvent',class extends Event{readonly lengthComputable:boolean;readonly loaded:number;readonly total:number;constructor(type:string,init:ProgressEventInit={}){super(type);this.lengthComputable=init.lengthComputable??false;this.loaded=init.loaded??0;this.total=init.total??0;}});vi.stubGlobal('createImageBitmap',async()=>{throw Error('Unexpected image decode in texture-free fixture');});}
    try{const source=await inspectMeshSource(format,fixture(name),limits),proof=await captureMeshOccurrenceProof(source),display=await decodeMeshSource(source);
    try{expect(proof.rows).toHaveLength(source.sourceSlots.length);expect(display.materialLocators.size).toBe(source.sourceSlots.length);expect(new Set(display.materialLocators.keys()).size).toBe(source.sourceSlots.length);
      expect(proof.rows.map(r=>r.sourceAddress)).toEqual(source.sourceSlots.map(s=>s.address));const geometries:any[]=[];display.root.traverse((n:any)=>{if(n.isMesh)geometries.push(n.geometry);});const disposed=geometries.map(g=>vi.spyOn(g,'dispose'));display.dispose();display.dispose();expect(disposed.every(s=>s.mock.calls.length===1)).toBe(true);
    }finally{display.dispose();}
    }finally{vi.unstubAllGlobals();}
  });
  it('refuses forged neutral geometry and owns source before asynchronous decoder proof',async()=>{
    const source=await inspectMeshSource('obj',fixture('obj-mid-rgb'),limits),forged=structuredClone(source);forged.primitives![0]!.geometry.positions[0]=9;await expect(captureMeshOccurrenceProof(forged)).rejects.toThrow('元の面');
    const pending=captureMeshOccurrenceProof(source);source.primitives![0]!.geometry.positions[0]=9;expect((await pending).rows).toHaveLength(1);
  });
  it('rejects duplicate source slots and duplicate actual180 target addresses',async()=>{
    const source=await inspectMeshSource('obj',fixture('obj-slots'),limits),forged=structuredClone(source) as any;
    forged.sourceSlots[1]={slotIndex:1,address:{...forged.sourceSlots[0].address,slotIndex:1}};
    await expect(captureMeshOccurrenceProof(forged)).rejects.toThrow('重複');
  });
});
