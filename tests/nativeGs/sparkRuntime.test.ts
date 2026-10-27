import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {NativeSparkRuntime} from '../../src/nativeGs/sparkRuntime';
const state=vi.hoisted(()=>({candidates:[] as {resolve():void;dispose():void}[]}));
vi.mock('@sparkjsdev/spark',async()=>{
  const T=await import('three');
  class SplatMesh extends T.Group {
    static staticInitialized=Promise.resolve();
    initialized:Promise<void>;resolve!:()=>void;override dispose=vi.fn();isInitialized=true;packedSplats={numSplats:1};
    constructor(){super();this.initialized=new Promise(done=>{this.resolve=done;});state.candidates.push(this);}
    getBoundingBox(){return new T.Box3(new T.Vector3(-1,-1,-1),new T.Vector3(1,1,1));}
  }
  class SparkRenderer extends T.Group {override dispose=vi.fn();}
  return {SplatMesh,SparkRenderer,SplatFileType:{PLY:'ply'}};
});
it('releases a candidate exactly once when decode finishes after runtime disposal',async()=>{
  const runtime=await NativeSparkRuntime.create({} as THREE.WebGLRenderer,new THREE.Scene()),blob=new Blob(['owned']);
  const pending=runtime.load({size:blob.size,stream:()=>blob.stream()},'representation',1),failure=expect(pending).rejects.toThrow('obsolete');
  runtime.dispose();const candidate=state.candidates.at(-1)!;candidate.resolve();await failure;expect(candidate.dispose).toHaveBeenCalledOnce();
});
