import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeGsViewer } from '../../src/nativeGs/viewer';
import * as loaders from '../../src/viewer/loaders';
import { makeNativeDraft, snapshotFromDraft } from './nativeTestProject';
import type { NativeRepresentationV1 } from '../../src/nativeGs/schema';
import type { WorkspaceReadableFile } from '../../src/platform/fs';

afterEach(()=>vi.restoreAllMocks());
it('releases a late decoded generation without deleting its replacement or publishing an edit',async()=>{
  const snapshot=snapshotFromDraft(makeNativeDraft().draft),representation=snapshot.representations.find(r=>r.role==='meshPrimary')!;
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();root.add(new THREE.Mesh(geometry,material));
  const replacement=new THREE.Group(),objects=new Map([[representation.id,replacement]]),slots=new Map([[representation.id,[]]]);
  const viewer=Object.create(NativeGsViewer.prototype) as NativeGsViewer;
  Object.assign(viewer,{snapshot,options:{},loadGeneration:1,contextLost:false,disposed:false,representationObjects:objects,meshMaterialSlots:slots});
  let resolve!:(value:loaders.LoadedModel)=>void;
  const decode=vi.spyOn(loaders,'loadModel').mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const disposed=vi.spyOn(geometry,'dispose'),blob=new Blob(['owned OBJ']);
  const source={size:blob.size,stream:()=>blob.stream()} as WorkspaceReadableFile;
  const pending=(viewer as unknown as {loadMeshLike(r:NativeRepresentationV1,s:WorkspaceReadableFile,g:number,signal:AbortSignal):Promise<void>})
    .loadMeshLike(representation,source,1,new AbortController().signal);
  await vi.waitFor(()=>expect(decode).toHaveBeenCalledOnce());
  Object.assign(viewer,{loadGeneration:2});
  resolve({root,materials:[],stats:{vertices:8,triangles:12,meshes:1,points:0},kind:'mesh',warnings:[]});
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
  expect(objects.get(representation.id)).toBe(replacement);expect(slots.has(representation.id)).toBe(true);expect(disposed).toHaveBeenCalledOnce();
});

it('continues past one source read failure and retains the current view and selection during recovery',async()=>{
  const snapshot=snapshotFromDraft(makeNativeDraft().draft),mesh=snapshot.representations.find(r=>r.role==='meshPrimary')!;
  const viewer=Object.create(NativeGsViewer.prototype) as NativeGsViewer,selected={id:'selected'};
  const open=vi.fn(async(id:string)=>{if(id===mesh.id)throw Error('owned source unavailable');return null;});
  const update=vi.fn(),fit=vi.fn(),states=new Map(),reported=vi.fn();
  Object.assign(viewer,{snapshot,scene:new THREE.Scene(),currentCaption:selected,loadSource:{open,offlineReady:true},
    loadGeneration:0,loadAbort:new AbortController(),contextLost:false,disposed:false,
    assetGroups:new Map(),representationObjects:new Map(),representationBounds:new Map(),meshMaterialSlots:new Map(),resourceStates:states,
    runtimeIssues:[],callbacks:{onRuntimeError:reported},updateResolution:update,fitCamera:fit});
  const before=JSON.stringify(snapshot);
  await (viewer as unknown as {loadRepresentations(preserve:boolean):Promise<void>}).loadRepresentations(true);
  expect(open).toHaveBeenCalledTimes(snapshot.representations.length);expect(states.get(mesh.id).availability).toBe('failed');
  expect(reported).toHaveBeenCalledOnce();expect(update).toHaveBeenCalledOnce();expect(fit).not.toHaveBeenCalled();
  expect((viewer as unknown as {currentCaption:unknown}).currentCaption).toBe(selected);expect(JSON.stringify(snapshot)).toBe(before);
});

it('releases a late GS result after its Asset was removed by a successful save',async()=>{
  const draft=makeNativeDraft(),snapshot=snapshotFromDraft(draft.draft),rep=snapshot.representations.find(r=>r.role==='gsPrimary')!;
  let resolve!:(value:{object:THREE.Object3D;bounds:THREE.Box3;splatCount:number})=>void;
  const runtime={load:vi.fn(()=>new Promise(done=>{resolve=done;})),disposeSplat:vi.fn()},groups=new Map([[rep.assetId,new THREE.Group()]]);
  const viewer=Object.create(NativeGsViewer.prototype) as NativeGsViewer,objects=new Map();
  Object.assign(viewer,{snapshot,loadGeneration:1,contextLost:false,disposed:false,sparkRuntime:runtime,assetGroups:groups,
    representationObjects:objects,representationBounds:new Map(),callbacks:{onProgress:vi.fn()}});
  const pending=(viewer as unknown as {loadGs(r:NativeRepresentationV1,s:WorkspaceReadableFile,g:number):Promise<void>})
    .loadGs(rep,draft.sources.get(rep.id)! as WorkspaceReadableFile,1);
  await vi.waitFor(()=>expect(runtime.load).toHaveBeenCalledOnce());groups.clear();
  const object=new THREE.Group();resolve({object,bounds:new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1)),splatCount:1});
  await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(runtime.disposeSplat).toHaveBeenCalledExactlyOnceWith(rep.id);expect(objects.size).toBe(0);expect(object.parent).toBeNull();
});
