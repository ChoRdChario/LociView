import {readFileSync} from 'node:fs';
import {meshSourceProfile} from '../src/projectFiles/meshSource';
import { describe,it,expect,vi } from 'vitest';
import * as A from '@automerge/automerge';
import { MemoryFS } from '../src/platform/fs';
import { OriginBlobStore } from '../src/projectMetadata/blobStore';
import type { MetadataStorageFactory } from '../src/projectMetadata/repository';
import { validationMetadataLimits as metadata, type ProjectFilePolicyInput } from '../src/projectFiles/validation';
import { prepareValidationProject,sealValidationRecord } from '../src/projectFiles/initialProject';
import { validationProjectService,prepareValidationCreation } from '../src/projectFiles/creation';
import { newId,json,underWriteLease } from '../src/projectMetadata/persistence';
import { createGsProxyWorkflow } from '../src/harness/projectScene/gsProxyWorkflow';
import { validationModelVersions } from '../src/harness/projectScene/validationProjection';
import { gsFixture } from './helpers/gsFixture';
import { triangleGlb } from './e2e/fixtures';
import { queueGsDecode } from '../src/viewer/gsDecodeQueue';
import { validationReceivedFacts,validationModelFacts,assertValidationModelClosures } from '../src/projectFiles/modelFacts';
import { assetCopySource,prepareAssetMembershipCopy } from '../src/projectMetadata/modelMembership';
import { ProjectMetadataSource } from '../src/projectMetadata/source';
import { readProjectScene } from '../src/scene/projectProvider';
import { metadataProviderReady } from '../src/projectMetadata/session';
import { assertValidationBodyAllocation } from '../src/projectFiles/bodyBudget';
import { TransactionJournal } from '../src/projectMetadata/journal';
import type { ContentRequest } from '../src/domain/projectContentChecks';
const limits={maxFileBytes:64*1024*1024,maxItems:100_000,maxValues:8_000_000,maxJsonBytes:1_000_000,maxPixels:1000};
function memoryStorage():MetadataStorageFactory{
  const rows=new Map<string,Uint8Array>(),matches=(key:string,prefix:string[])=>prefix.every((p,i)=>JSON.parse(key)[i]===p);
  return ()=>({load:async k=>rows.get(JSON.stringify(k))?.slice(),save:async(k,b)=>{rows.set(JSON.stringify(k),b.slice());},remove:async k=>{rows.delete(JSON.stringify(k));},loadRange:async p=>[...rows].filter(([k])=>matches(k,p)).map(([k,data])=>({key:JSON.parse(k),data:data.slice()})),removeRange:async p=>{for(const k of rows.keys())if(matches(k,p))rows.delete(k);}});
}
class FaultFS extends MemoryFS{rejectPublication=false;override async writeText(path:string,text:string){if(this.rejectPublication&&path.endsWith('/published.json'))throw Error('gs-publication-fault');return super.writeText(path,text);}}
async function setup(fileBacked=false,budget:ProjectFilePolicyInput=limits){
  A.getHeads(A.init());const fs=new FaultFS(),storage=memoryStorage(),store=new OriginBlobStore(fs,{maxBlobBytes:limits.maxFileBytes,maxChunkBytes:100_000,maxChunks:1000,metadata},{async request(name,_opts,callback){return callback({name,mode:'exclusive'});}} as LockManager);
  const service=validationProjectService(fs,storage,store,budget),model=fileBacked?{label:'SH4',file:new Blob([gsFixture().slice().buffer])}:{label:'SH4',bytes:gsFixture()},initial=prepareValidationCreation(await prepareValidationProject({run:newId(),title:'GS',models:[model]},budget),'map2');
  expect((await initial.persist(fs,store,service.session)).state).toBe('ready');
  const read=async()=>{const r=await service.session.read();if(r.state!=='ready'||r.provider?.kind!=='scene-provider')throw Error('GS provider');return r.provider;};
  const target=async()=>{const p=await read(),v=(await validationModelVersions(p))[0]!,c=v.closure;if(c.shape!=='saved-gs')throw Error('GS closure');
    return {token:p.token,sceneId:p.state.defaultSceneId.kind==='value'?p.state.defaultSceneId.value:'',assetId:v.assetId,expectedBindingId:c.binding.id,gsRepresentationId:c.representation.id,gsPayloadDigest:c.representation.payloadDigest,gsFamilyId:c.representation.variantFamilyId,expectedProxyId:c.proxy?.id??null};};
  const workflow=createGsProxyWorkflow(service.content,read,(token,command)=>service.session.edit(token,command));return {...service,fs,storage,store,read,target,workflow};
}
describe('01c same-GS Proxy commands and durable facts',()=>{
  it.each([['stl','stl-ascii'],['ply','ply-quad'],['obj','obj-slots'],['gltf','gltf-json']] as const)('Mesh07l attaches/changes %s through the actual Proxy command and keeps originals and current frame',async(format,name)=>{
    vi.stubGlobal('ProgressEvent',class extends Event{constructor(type:string,init:ProgressEventInit={}){super(type);Object.assign(this,{lengthComputable:false,loaded:0,total:0},init);}});vi.stubGlobal('createImageBitmap',async()=>{throw Error('Unexpected image');});
    try{const g=JSON.parse(readFileSync('docs/specs/profiles/mesh-conversion-8.goldens.json','utf8')).sources[name],bytes=new TextEncoder().encode(g.utf8),r=await setup(),{token,...target}=await r.target();
      const first=await r.workflow.prepare(token,target,{name:format,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer});expect((await r.session.read()).source!.token).toBe(token);await r.workflow.commit(token,first.id);r.workflow.completed();
      const {token:currentToken,...current}=await r.target(),p=await r.read(),again=await r.workflow.prepare(p.token,current,{name:format,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer});await r.workflow.commit(p.token,again.id);r.workflow.completed();
      const final=await r.read(),rep=(await validationModelVersions(final))[0]!.closure;if(rep.shape!=='saved-gs')throw Error('saved');expect(rep.proxy!.formatProfile).toEqual(await meshSourceProfile(format));expect((await validationProjectService(r.fs,r.storage,r.store,limits).session.read()).state).toBe('ready');
    }finally{vi.unstubAllGlobals();}
  });
  it('splits native GS admission from nonGS and rejects new unique bodies before a pending save while retaining duplicates',async()=>{
    const bytes=gsFixture(),proxy=triangleGlb(),nonGs={...limits,maxFileBytes:proxy.length},policy={nonGs,gs:limits,projectBodyBytes:bytes.length+proxy.length};
    expect(bytes.length).toBeGreaterThan(nonGs.maxFileBytes);
    const r=await setup(true,policy),{token,...target}=await r.target();
    const prepared=await r.workflow.prepare(token,target,{name:'surface.glb',size:proxy.length,arrayBuffer:async()=>Uint8Array.from(proxy).buffer});
    await r.workflow.commit(token,prepared.id);const after=await r.read(),sceneId=target.sceneId;
    expect(()=>assertValidationBodyAllocation(after,policy,bytes.length)).not.toThrow();
    expect(()=>assertValidationBodyAllocation(after,policy,proxy.length)).not.toThrow();
    expect(()=>assertValidationBodyAllocation(after,policy,1)).toThrow('合計');
    const add=async(data:Uint8Array)=>{const assetId=`ast_${newId()}`,records=await r.content.prepareModel({label:'GS',file:new Blob([data.slice().buffer])},assetId);
      return r.session.edit((await r.read()).token,{kind:'addGsAsset',sceneId,...records,membership:{id:`sam_${newId()}`,sceneId,assetId,orderKey:'B',lifecycle:{state:'active',reason:'initial',eventId:`evt_${newId()}`}}});};
    expect((await add(bytes)).state).toBe('ready');
    const before=await r.session.read(),paths=await r.fs.list('');
    await expect(add(gsFixture(0))).rejects.toThrow('合計');
    expect(await r.fs.list('')).toEqual(paths);expect((await r.session.read()).state).toBe('ready');expect((await r.session.read()).source?.token).toBe(before.source?.token);
    const fakeMedia={blob:{algorithm:'sha256',digest:'a'.repeat(64),byteLength:1,mediaType:'image/png'}};
    expect(()=>r.content.assertIntroduction(after,fakeMedia)).toThrow('合計');
    const cold=validationProjectService(r.fs,r.storage,r.store,policy);expect((await cold.session.read()).state).toBe('ready');
    const smaller=validationProjectService(r.fs,r.storage,r.store,nonGs);expect((await smaller.session.read()).state).toBe('repair-required');
    await expect(r.content.prepareGsProxy({label:'oversized.glb',bytes:new Uint8Array(nonGs.maxFileBytes+1)},target.assetId,target.gsFamilyId)).rejects.toThrow();
  });
  it('keeps native source snapshots through creation, stored inspection, verification and cold reopen',async()=>{
    const r=await setup(true),first=await r.target(),p=await r.read(),record=p.details.immutable.representationsById[first.gsRepresentationId];if(record?.kind!=='value')throw Error('GS');
    const original=r.fs.readStream.bind(r.fs),spy=vi.spyOn(r.fs,'readStream').mockImplementation(async path=>{const f=await original(path);return f&&path.startsWith('v2/cas/objects/')?{...f,stream(){throw Error('content must inspect checked Blob snapshot');}}:f;});
    try{const source=await r.content.modelContent(record.value,true);expect(source.kind).toBe('gs');if(source.kind!=='gs')throw Error('GS');expect(source.file).toBeInstanceOf(Blob);expect(source.bytes).toBeUndefined();expect(source.digest).toBe((record.value.blob as any).digest);await r.content.verify([record.value.blob as any]);}finally{spy.mockRestore();}
    const cold=validationProjectService(r.fs,r.storage,r.store,limits),ready=await cold.session.read();expect(ready.state).toBe('ready');expect(ready.source?.token).toBe((await r.session.read()).source?.token);const source=await cold.content.modelContent(record.value,true);expect(source.kind==='gs'&&source.file).toBeInstanceOf(Blob);
  });
  it('rejects an invalid File without writes and recovers prepared GS addition without its ephemeral source',async()=>{
    const r=await setup(true),target=await r.target(),assetId=`ast_${newId()}`,writes=[vi.spyOn(r.fs,'writeText'),vi.spyOn(r.fs,'writeBytes'),vi.spyOn(r.fs,'writeStream'),vi.spyOn(r.fs,'appendText'),vi.spyOn(r.fs,'appendBytes'),vi.spyOn(r.fs,'remove')];
    await expect(r.content.prepareModel({label:'bad.ply',file:new Blob([gsFixture().slice(0,-1).buffer])},assetId)).rejects.toThrow();for(const w of writes)expect(w).not.toHaveBeenCalled();
    const input={label:'new GS',file:new Blob([gsFixture(0).slice().buffer])},preparing=r.content.prepareModel(input,assetId);input.file=new Blob([new Uint8Array([0])]);const records=await preparing;for(const w of writes)expect(w).not.toHaveBeenCalled();
    r.fs.rejectPublication=true;await expect(r.session.edit(target.token,{kind:'addGsAsset',sceneId:target.sceneId,...records,membership:{id:`sam_${newId()}`,sceneId:target.sceneId,assetId,orderKey:'B',lifecycle:{state:'active',reason:'initial',eventId:`evt_${newId()}`}}})).rejects.toThrow('gs-publication-fault');
    r.content.releasePreparedModels();r.fs.rejectPublication=false;const cold=validationProjectService(r.fs,r.storage,r.store,limits),ready=await cold.session.retry();expect(ready.state).toBe('ready');if(ready.provider?.kind!=='scene-provider')throw Error('cold GS');expect((await validationModelVersions(ready.provider)).map(m=>m.assetId)).toContain(assetId);
    const source=await cold.content.modelContent(records.representation,true);expect(source.kind==='gs'&&source.file).toBeInstanceOf(Blob);if(source.kind!=='gs')throw Error('GS');expect(source.degree).toBe(0);expect(source.digest).toBe((records.representation.blob as any).digest);
  });
  it('adds another complete GS through its dedicated command and keeps the existing Project frame',async()=>{
    const r=await setup(),before=await r.session.read(),p=await r.read(),target=await r.target(),assetId=`ast_${newId()}`,records=await r.content.prepareModel({label:'SH0',bytes:gsFixture(0)},assetId);
    const fields={sceneId:target.sceneId,...records,membership:{id:`sam_${newId()}`,sceneId:target.sceneId,assetId,orderKey:'B',lifecycle:{state:'active',reason:'initial',eventId:`evt_${newId()}`}}};
    const files=await r.fs.list('');await expect(r.session.edit(p.token,{kind:'addAsset',...fields})).rejects.toThrow();expect(await r.fs.list('')).toEqual(files);
    const added=await r.session.edit(p.token,{kind:'addGsAsset',...fields});expect(added.state).toBe('ready');if(added.provider?.kind!=='scene-provider')throw Error('GS addition');
    expect(Object.keys(added.provider.resources.assets)).toHaveLength(2);expect(p.inspection.candidates.unambiguousRecords.project).toBeDefined();expect(added.provider.inspection.candidates.unambiguousRecords.project).toEqual(p.inspection.candidates.unambiguousRecords.project);expect((await validationModelVersions(added.provider)).every(v=>v.closure.shape==='saved-gs')).toBe(true);
  });
  it('adds/changes/removes a prepared surface with stable GS/class/placement/manual Caption, and cold-recovers fact-only removal',async()=>{
    const r=await setup(),first=await r.target(),p=await r.read(),v=(await validationModelVersions(p))[0]!,c=v.closure;
    const captionId=`cap_${newId()}`,anchor={kind:'asset' as const,assetId:first.assetId,assetFrameId:c.assetFrame.id,positionAsset:[.1,.2,.3] as const,authoredAssetRevisionId:c.revision.id,authoredAnchorCompatibilityId:c.revision.anchorCompatibilityClasses[0]!.id,hitEvidence:{method:'manual' as const}};
    await r.session.edit(p.token,{kind:'addPin',sceneId:first.sceneId,captionId,membershipId:`scm_${newId()}`,eventId:`evt_${newId()}`,anchor});
    for(let i=0;i<2;i++){
      const {token,...target}=await r.target(),bytes=triangleGlb(),prepared=await r.workflow.prepare(token,target,{name:`surface${i}.glb`,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
      await r.workflow.commit(token,prepared.id);const after=await r.read(),next=(await validationModelVersions(after))[0]!.closure;if(next.shape!=='saved-gs')throw Error('GS');
      expect(next.representation).toEqual(c.representation);expect(next.revision.anchorCompatibilityClasses).toEqual(c.revision.anchorCompatibilityClasses);expect(next.binding.assetToProject).toEqual(c.binding.assetToProject);expect(next.proxy?.proxyForGsVariantFamilyId).toBe(c.representation.variantFamilyId);
      expect(after.resources.captions[captionId]!.anchor).toEqual({kind:'value',value:anchor});
    }
    const {token,...target}=await r.target(),prepared=await r.workflow.prepare(token,target),puts=vi.spyOn(r.store,'put');r.fs.rejectPublication=true;
    await expect(r.workflow.commit(token,prepared.id)).rejects.toThrow('gs-publication-fault');expect(puts).not.toHaveBeenCalled();r.fs.rejectPublication=false;
    const cold=validationProjectService(r.fs,r.storage,r.store,limits),ready=await cold.session.retry();expect(ready.state).toBe('ready');if(ready.provider?.kind!=='scene-provider')throw Error('cold GS');
    const next=(await validationModelVersions(ready.provider))[0]!.closure;if(next.shape!=='saved-gs')throw Error('GS');expect(next.proxy).toBeUndefined();expect(next.representation).toEqual(c.representation);expect(ready.provider.resources.captions[captionId]!.anchor).toEqual({kind:'value',value:anchor});
  });
  it('refuses stale, cross-Asset and changed selection before reading a file or writing a journal',async()=>{
    const r=await setup(),{token,...target}=await r.target(),bytes=triangleGlb(),arrayBuffer=vi.fn(async()=>Uint8Array.from(bytes).buffer),before=await r.fs.list('');
    for(const changed of [{...target,assetId:`ast_${newId()}`},{...target,gsPayloadDigest:'0'.repeat(64)},{...target,expectedProxyId:`rep_${newId()}`}])await expect(r.workflow.prepare(token,changed,{name:'bad.glb',size:bytes.length,arrayBuffer})).rejects.toThrow();
    expect(arrayBuffer).not.toHaveBeenCalled();expect(await r.fs.list('')).toEqual(before);
    const chosen=await r.workflow.prepare(token,target,{name:'good.glb',size:bytes.length,arrayBuffer});
    await r.session.edit(token,{kind:'renameScene',sceneId:target.sceneId,name:'updated'});
    const files=await r.fs.list('');await expect(r.workflow.commit(token,chosen.id)).rejects.toThrow();expect(await r.fs.list('')).toEqual(files);
  });
  it('releases cancelled input and cannot adopt an older pending file after a newer selection',async()=>{
    const r=await setup(),{token,...target}=await r.target(),bytes=triangleGlb();let finish!:(v:ArrayBuffer)=>void;
    const first=r.workflow.prepare(token,target,{name:'old',size:bytes.length,arrayBuffer:()=>new Promise<ArrayBuffer>(yes=>{finish=yes;})});
    await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));const oldResult=first.catch(e=>e.message);
    r.workflow.cancel();const inspected=vi.spyOn(r.content,'prepareGsProxy'),second=await r.workflow.prepare(token,target,{name:'current',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
    finish(Uint8Array.from(bytes).buffer);expect(await oldResult).toContain('取り消し');const record=await inspected.mock.results[0]!.value;r.workflow.cancel();expect(()=>r.content.preparedModelRef(record)).toThrow();await expect(r.workflow.commit(token,second.id)).rejects.toThrow();
  });
  it('never repairs old class facts during receive and copies the closed GS plus Proxy into independent families',async()=>{
    const r=await setup(),{token,...target}=await r.target(),bytes=triangleGlb(),prepared=await r.workflow.prepare(token,target,{name:'proxy',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});await r.workflow.commit(token,prepared.id);
    const base=(await r.session.read()).source!,p=await r.read(),source=assetCopySource(p,target.sceneId,target.assetId,metadata),copy=await prepareAssetMembershipCopy(source,`sam_${newId()}`,prefix=>`${prefix}_${newId()}`);
    expect(copy.proxy?.representation.proxyForGsVariantFamilyId).toBe(copy.ids.family);expect(copy.representation.blob).toEqual(source.representation.blob);expect(copy.representation.materialCatalog).toBeUndefined();expect(copy.revision.parentRevisionId).toBeUndefined();
    const doc=A.change(A.load<Record<string,any>>(base.encodeFullSource()),draft=>{
      for(const [map,record]of [['representationsById',copy.representation],['representationsById',copy.proxy!.representation],['assetRevisionsById',copy.revision],['assetBindingsById',copy.binding]] as const)draft[map][record.id as string]=new A.ImmutableString(json(record));
      const life={state:'active',reason:'initial',eventId:`evt_${newId()}`};for(const [map,record]of [['assetsById',{...source.asset,id:copy.ids.asset,assetFrameId:copy.ids.assetFrame,status:{kind:'ready',activeBindingId:copy.ids.binding},lifecycle:life}],['sceneAssetMembershipsById',{id:copy.ids.membership,sceneId:target.sceneId,assetId:copy.ids.asset,orderKey:'B',lifecycle:life}]] as const)draft[map][record.id]=Object.fromEntries(Object.entries(record).map(([k,v])=>[k,new A.ImmutableString(json(v))]));
    });
    const next=ProjectMetadataSource.fromFullSource(A.save(doc),base.proof,metadata),puts=vi.spyOn(r.store,'put'),plan=await validationReceivedFacts(r.content,base,next,()=>{throw Error('old bytes must stay local');});await plan.stage();expect(puts).not.toHaveBeenCalled();
    const evidence=(await r.fs.list('')).filter(path=>path.includes('/evidence/'));let path:string|undefined;
    for(const candidate of evidence){const text=await r.fs.readText(candidate);if(text===null)throw Error('missing owned receipt');if(JSON.parse(text).key.fact==='surface-equivalence'){path=candidate;break;}}
    expect(path).toBeDefined();await r.fs.remove(path!);const writes=vi.spyOn(r.fs,'writeText');await expect(validationReceivedFacts(r.content,base,next,()=>{throw Error('no repair');})).rejects.toThrow();expect(writes).not.toHaveBeenCalled();
  });
  it('rejects Core-valid multi-visual or multiple-Proxy input before journal and also on old prepared cold recovery',async()=>{
    const r=await setup(),{token,...target}=await r.target(),bytes=triangleGlb(),prepared=await r.workflow.prepare(token,target,{name:'proxy',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});await r.workflow.commit(token,prepared.id);
    const ready=await r.session.read(),base=ready.source!,p=await r.read(),version=(await validationModelVersions(p))[0]!.closure;if(version.shape!=='saved-gs'||!version.proxy)throw Error('GS');
    for(const role of ['interactionProxy','meshPrimary'] as const){
      const newModel=await r.content.prepareModel({label:'unsupported',bytes:Uint8Array.from(bytes)},target.assetId),tx=newId();
      const representation=role==='meshPrimary'?newModel.representation:await sealValidationRecord('representation',{...newModel.representation,role,purposes:['interaction'],proxyForGsVariantFamilyId:version.representation.variantFamilyId});
      const classes=[...version.revision.anchorCompatibilityClasses,...(role==='meshPrimary'?newModel.revision.anchorCompatibilityClasses as any[]:[])].sort((a,b)=>a.id.localeCompare(b.id));
      const revision=await sealValidationRecord('asset-revision',{id:`rev_${newId()}`,assetId:target.assetId,parentRevisionId:version.revision.id,representationIds:[version.representation.id,version.proxy.id,representation.id!],anchorCompatibilityClasses:classes as any,provenance:{origin:'derived',inputBlobDigests:[(representation.blob as any).digest]}});
      const binding=await sealValidationRecord('asset-binding-revision',{id:`bnd_${newId()}`,assetId:target.assetId,parentBindingId:version.binding.id,assetRevisionId:revision.id!,method:'manual',assetToProject:version.binding.assetToProject as any});
      const doc=A.change(A.load<Record<string,any>>(base.encodeFullSource()),{message:`lociview:transaction:v1:${tx}`},draft=>{
        draft.representationsById[representation.id as string]=new A.ImmutableString(json(representation));draft.assetRevisionsById[revision.id as string]=new A.ImmutableString(json(revision));draft.assetBindingsById[binding.id as string]=new A.ImmutableString(json(binding));draft.assetsById[target.assetId].status=new A.ImmutableString(json({kind:'ready',activeBindingId:binding.id}));
      });
      const next=ProjectMetadataSource.fromFullSource(A.save(doc),base.proof,metadata),requests:ContentRequest[]=[];
      const generic=await readProjectScene(next.read(),metadata,{scope:'development-validation',verify:async q=>{requests.push(q);return r.content.inspectStored(q);}});
      expect(metadataProviderReady(generic,metadata)).toBe(true);if(generic.kind!=='scene-provider')throw Error('Core valid');expect(()=>assertValidationModelClosures(generic)).toThrow('組み合わせ');
      const mutations=[vi.spyOn(r.fs,'writeText'),vi.spyOn(r.fs,'writeBytes'),vi.spyOn(r.fs,'writeStream'),vi.spyOn(r.fs,'appendText'),vi.spyOn(r.fs,'appendBytes'),vi.spyOn(r.fs,'remove')];
      const before=await r.fs.list('');await expect(validationModelFacts(r.content).plan(base,next)).rejects.toThrow('組み合わせ');await expect(validationReceivedFacts(r.content,base,next,()=>{throw Error('old body');})).rejects.toThrow('組み合わせ');expect(await r.fs.list('')).toEqual(before);for(const m of mutations)expect(m).not.toHaveBeenCalled();
      if(role==='meshPrimary'){
        // An older writer already staged exact verified originals. The modern
        // recovery fence must still refuse publication without repairing them.
        await underWriteLease(r.fs,async()=>{for(const q of requests)expect((await r.content.verifier(true).verify(q) as any).outcome).toBe('verified');});
        const journal=new TransactionJournal(r.fs,metadata),prior=(await journal.entries()).at(-1)!,known=new Set(base.originalChanges().map(b=>A.decodeChange(b).hash)),parts=next.originalChanges().filter(b=>!known.has(A.decodeChange(b).hash));
        await underWriteLease(r.fs,()=>journal.stage({...prior.start,transactionId:tx,predecessor:prior.start.transactionId,purpose:'localCommand',baseHeads:base.heads},parts));
        for(const m of mutations)m.mockClear();const staged=await r.fs.list(''),cold=validationProjectService(r.fs,r.storage,r.store,limits);await expect(cold.session.retry()).rejects.toThrow('組み合わせ');expect(await r.fs.list('')).toEqual(staged);expect((await journal.entries()).at(-1)!.publication).toBeNull();for(const m of mutations)expect(m).not.toHaveBeenCalled();
      }
    }
  });
});
it('keeps cancelled vendor ownership until natural settlement and only queues the latest owner request',async()=>{
  let settle!:()=>void;const disposed=vi.fn(),starts:string[]=[],owner={},pending=new Promise<void>(r=>{settle=r;});
  const first=queueGsDecode(owner,()=>{starts.push('first');return{initialized:pending,value:1,dispose:disposed};});const firstResult=first.promise.catch(e=>e.name);first.cancel();
  const second=queueGsDecode(owner,()=>{starts.push('second');return{initialized:Promise.resolve(),value:2,dispose:vi.fn()};});const secondResult=second.promise.catch(e=>e.name);
  const last=queueGsDecode(owner,()=>{starts.push('last');return{initialized:Promise.resolve(),value:3,dispose:vi.fn()};});expect(starts).toEqual(['first']);expect(disposed).not.toHaveBeenCalled();
  settle();expect(await firstResult).toBe('AbortError');expect(await secondResult).toBe('AbortError');expect(await last.promise).toBe(3);expect(starts).toEqual(['first','last']);expect(disposed).toHaveBeenCalledOnce();last.cancel();
});
