import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as OLD from 'three-compat-180';
import { GLTFLoader as OldLoader } from 'three-compat-180/addons/loaders/GLTFLoader.js';
import { loadModel, disposeModelResources } from '../../src/viewer/loaders';
import * as current from '../../src/viewer/modelLoader';
import { readLegacyModelTargets } from '../../src/viewer/compat180/proof';
import { assertTargetTables, snapshotTargets, rememberTextureOrigin } from '../../src/viewer/compat180/sceneProof';

const obj=()=>new TextEncoder().encode('o part\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
afterEach(()=>vi.restoreAllMocks());
function scene(interleaved=false) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',interleaved
    ?new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array([0,0,0,77,1,0,0,88,0,1,0,99]),4),3,0)
    :new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial();root.add(new THREE.Mesh(geometry,material));
  return {root,geometry,material};
}
describe('07j private actual180 proof and checked186 display',()=>{
  it('constructs180 loader/helpers with180 constructors, separate from186',async()=>{
    expect(THREE.REVISION).toBe('186');expect(OLD.REVISION).toBe('180');
    const old=await new OldLoader().parseAsync(JSON.stringify({asset:{version:'2.0'},scenes:[{}],scene:0}),'');
    expect(old.scene).toBeInstanceOf(OLD.Object3D);expect(old.scene).not.toBeInstanceOf(THREE.Object3D);
    const bytes=obj(),before=bytes.slice(),pending=readLegacyModelTargets('obj',bytes);bytes.fill(0);
    const rows=await pending;expect(rows).toHaveLength(1);expect(rows[0]!.kind).toBe('mesh');expect(rows[0]!.v1Key).toBe('m/part/0');
    const model=await loadModel('obj',before);expect(model.root).toBeInstanceOf(THREE.Object3D);expect(model.root).not.toBeInstanceOf(OLD.Object3D);disposeModelResources(model.root);
  });
  it('compares logical interleaved components, but rejects changed geometry',()=>{
    const a=scene(),b=scene(true);
    try{expect(()=>assertTargetTables(snapshotTargets(a.root),snapshotTargets(b.root))).not.toThrow();
      b.geometry.getAttribute('position').setX(1,2);expect(()=>assertTargetTables(snapshotTargets(a.root),snapshotTargets(b.root))).toThrow('面・材質');}
    finally{disposeModelResources(a.root);disposeModelResources(b.root);}
  });
  it('retains cloned-UV image identity and refuses an absent/swapped image source',()=>{
    const a=scene(),b=scene();
    const first=new THREE.Texture({width:1,height:1}),other=new THREE.Texture({width:1,height:1});
    rememberTextureOrigin(first,'gltf-image:0');rememberTextureOrigin(other,'gltf-image:1');a.material.map=first;b.material.map=first.clone();
    try{expect(()=>assertTargetTables(snapshotTargets(a.root),snapshotTargets(b.root))).not.toThrow();
      b.material.map=other;expect(()=>assertTargetTables(snapshotTargets(a.root),snapshotTargets(b.root))).toThrow('面・材質');
      b.material.map=new THREE.Texture({width:1,height:1});expect(()=>snapshotTargets(b.root)).toThrow('元参照');}
    finally{disposeModelResources(a.root);disposeModelResources(b.root);other.dispose();}
  });
  it('detects inherited visibility and authored light changes',()=>{
    const a=scene(),b=scene(),light=new THREE.PointLight(0xffffff,1);b.root.add(light);
    try{expect(()=>assertTargetTables(snapshotTargets(a.root),snapshotTargets(b.root))).toThrow('照明');
      a.root.add(new THREE.PointLight(0xffffff,1));expect(()=>assertTargetTables(snapshotTargets(a.root),snapshotTargets(b.root))).not.toThrow();
      b.root.visible=false;expect(()=>assertTargetTables(snapshotTargets(a.root),snapshotTargets(b.root))).toThrow();}
    finally{disposeModelResources(a.root);disposeModelResources(b.root);}
  });
  it('disposes an unaccepted186 model and does not expose it',async()=>{
    const invalid=scene();invalid.root.children[0]!.name='wrong target';const geometry=vi.spyOn(invalid.geometry,'dispose'),material=vi.spyOn(invalid.material,'dispose');
    vi.spyOn(current,'loadCurrentModel').mockResolvedValue({root:invalid.root,materials:[],stats:{vertices:3,triangles:1,points:0,meshes:1},kind:'mesh',warnings:[]});
    await expect(loadModel('obj',obj())).rejects.toThrow();expect(geometry).toHaveBeenCalledOnce();expect(material).toHaveBeenCalledOnce();
  });
  it('does not start either decoder for a cancelled preparation',async()=>{
    const signal=AbortSignal.abort(),decode=vi.spyOn(current,'loadCurrentModel');
    await expect(loadModel('obj',obj(),{signal})).rejects.toMatchObject({name:'AbortError'});expect(decode).not.toHaveBeenCalled();
  });
  it('settles and closes unused MTL images before the next engine starts',async()=>{
    const bitmaps: {close:ReturnType<typeof vi.fn>}[]=[];
    function textureLoader(engine: typeof THREE | typeof OLD) {
      const mockedEngine=engine as unknown as typeof THREE;
      return vi.spyOn(mockedEngine.TextureLoader.prototype,'load').mockImplementation(function(this: THREE.TextureLoader, url, done?) {
        if(engine===THREE) expect(bitmaps.slice(0,2).every(image=>image.close.mock.calls.length===1)).toBe(true);
        const image={width:1,height:1,close:vi.fn()};bitmaps.push(image);
        const texture=new mockedEngine.Texture() as ReturnType<THREE.TextureLoader['load']>;this.manager.itemStart(url);
        queueMicrotask(()=>{texture.source.data=image as unknown as HTMLImageElement;done?.(texture);this.manager.itemEnd(url);});return texture;
      });
    }
    textureLoader(OLD);textureLoader(THREE);
    const bytes=new TextEncoder().encode('o part\nusemtl used\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
    const model=await loadModel('obj',bytes,{mtlText:'newmtl used\nmap_Kd data:image/png;base64,AA==\nnewmtl unused\nmap_Kd data:image/png;base64,AQ==\n'});
    expect(bitmaps).toHaveLength(4);expect(bitmaps.slice(2).every(image=>image.close.mock.calls.length===0)).toBe(true);
    disposeModelResources(model.root);expect(bitmaps.every(image=>image.close.mock.calls.length===1)).toBe(true);
  });
  it('owns a late MTL image through cancellation and never starts186',async()=>{
    const image={width:1,height:1,close:vi.fn()},controller=new AbortController();let finish=()=>{};
    vi.spyOn(OLD.TextureLoader.prototype,'load').mockImplementation(function(this:OLD.TextureLoader,url,done){
      const texture=new OLD.Texture();this.manager.itemStart(url);
      finish=()=>{texture.image=image;done?.(texture);this.manager.itemEnd(url);};return texture;
    });
    const currentDecode=vi.spyOn(current,'loadCurrentModel');let settled=false;
    const pending=loadModel('obj',obj(),{signal:controller.signal,mtlText:'newmtl unused\nmap_Kd data:image/png;base64,AA==\n'});
    const result=pending.catch(error=>{settled=true;return error;});
    await vi.waitFor(()=>expect(OLD.TextureLoader.prototype.load).toHaveBeenCalledOnce());controller.abort();
    await Promise.resolve();expect(settled).toBe(false);expect(currentDecode).not.toHaveBeenCalled();
    finish();expect(await result).toMatchObject({name:'AbortError'});expect(image.close).toHaveBeenCalledOnce();expect(currentDecode).not.toHaveBeenCalled();
  });
});
