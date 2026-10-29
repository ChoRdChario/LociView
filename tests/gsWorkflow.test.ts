import {readFileSync} from 'node:fs';
import {meshSourceProfile} from '../src/projectFiles/meshSource';
import { describe,it,expect,vi } from 'vitest';
import * as A from '@automerge/automerge';
import { MemoryFS } from '../src/platform/fs';
import { OriginBlobStore } from '../src/projectMetadata/blobStore';
import type { MetadataStorageFactory } from '../src/projectMetadata/repository';
import { validationMetadataLimits as metadata, projectFilePolicy, type ProjectFilePolicyInput } from '../src/projectFiles/validation';
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
import type { JsonObject } from '../src/domain/values';
import { inspectGsPly } from '../src/projectFiles/gsPly';
import { resolveScene } from '../src/scene/resolve';
import type { ReplaceAssetModelCommand } from '../src/projectMetadata/modelReplacement';
import { WorkspaceSender } from '../src/projectFiles/sendWorkspace';
import { WorkspaceReceiver } from '../src/projectFiles/receiveWorkspace';
import { BackupArchive } from '../src/projectPackage/backupArchive';
import { ReviewArchive } from '../src/projectPackage/reviewArchive';
import { CleanArchive } from '../src/projectPackage/cleanArchive';
const limits={maxFileBytes:64*1024*1024,maxItems:100_000,maxValues:8_000_000,maxJsonBytes:1_000_000,maxPixels:1000};
function memoryStorage():MetadataStorageFactory{
  const rows=new Map<string,Uint8Array>(),matches=(key:string,prefix:string[])=>prefix.every((p,i)=>JSON.parse(key)[i]===p);
  return ()=>({load:async k=>rows.get(JSON.stringify(k))?.slice(),save:async(k,b)=>{rows.set(JSON.stringify(k),b.slice());},remove:async k=>{rows.delete(JSON.stringify(k));},loadRange:async p=>[...rows].filter(([k])=>matches(k,p)).map(([k,data])=>({key:JSON.parse(k),data:data.slice()})),removeRange:async p=>{for(const k of rows.keys())if(matches(k,p))rows.delete(k);}});
}
class FaultFS extends MemoryFS{rejectPublication=false;override async writeText(path:string,text:string){if(this.rejectPublication&&path.endsWith('/published.json'))throw Error('gs-publication-fault');return super.writeText(path,text);}}
function recipient(budget:ProjectFilePolicyInput=limits){
  A.getHeads(A.init());const fs=new FaultFS(),storage=memoryStorage(),locks={async request(name,_opts,callback){return callback({name,mode:'exclusive'});}} as LockManager,store=new OriginBlobStore(fs,{maxBlobBytes:limits.maxFileBytes,maxChunkBytes:100_000,maxChunks:1000,metadata},locks);
  return {...validationProjectService(fs,storage,store,budget),fs,storage,locks,store};
}
async function setup(fileBacked=false,budget:ProjectFilePolicyInput=limits,transform?:JsonObject){
  const service=recipient(budget),{fs,storage,store,locks}=service,model=fileBacked?{label:'SH4',file:new Blob([gsFixture().slice().buffer])}:{label:'SH4',bytes:gsFixture()},prepared=await prepareValidationProject({run:newId(),title:'GS',models:[model]},budget);
  const records=structuredClone(prepared.records);
  if(transform){const reps=records.representationsById as Record<string,JsonObject>,rep=Object.values(reps)[0]!,{payloadDigest:_digest,...raw}=rep;
    reps[rep.id as string]=await sealValidationRecord('representation',{...raw,representationToAsset:transform,logicalBoundsAsset:(await inspectGsPly(gsFixture(),projectFilePolicy(budget).gs,{representationToAsset:transform})).bounds});}
  const initial=prepareValidationCreation({...prepared,records},'map2');
  expect((await initial.persist(fs,store,service.session)).state).toBe('ready');
  const read=async()=>{const r=await service.session.read();if(r.state!=='ready'||r.provider?.kind!=='scene-provider')throw Error('GS provider');return r.provider;};
  const target=async()=>{const p=await read(),v=(await validationModelVersions(p))[0]!,c=v.closure;if(c.shape!=='saved-gs')throw Error('GS closure');
    return {token:p.token,sceneId:p.state.defaultSceneId.kind==='value'?p.state.defaultSceneId.value:'',assetId:v.assetId,expectedBindingId:c.binding.id,gsRepresentationId:c.representation.id,gsPayloadDigest:c.representation.payloadDigest,gsFamilyId:c.representation.variantFamilyId,expectedProxyId:c.proxy?.id??null};};
  const workflow=createGsProxyWorkflow(service.content,read,(token,command)=>service.session.edit(token,command));return {...service,fs,storage,store,locks,read,target,workflow};
}
describe('01c same-GS Proxy commands and durable facts',()=>{
  it('refuses material commands on GS, Point and an opaque Mesh Proxy before storage mutation',async()=>{
    const r=await setup(),{token,...target}=await r.target(),bytes=triangleGlb();
    const prepared=await r.workflow.prepare(token,target,{name:'surface.glb',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});await r.workflow.commit(token,prepared.id);r.workflow.completed();
    const golden=JSON.parse(readFileSync('docs/specs/profiles/native-spatial-conversion-7.goldens.json','utf8')),assetId=`ast_${newId()}`,point=await r.content.prepareModel({label:'Point',bytes:new TextEncoder().encode(golden.point.utf8Source)},assetId),beforePoint=await r.read();
    await r.session.edit(beforePoint.token,{kind:'addAsset',sceneId:target.sceneId,...point,membership:{id:`sam_${newId()}`,sceneId:target.sceneId,assetId,orderKey:'B',lifecycle:{state:'active',reason:'initial',eventId:`evt_${newId()}`}}});
    const p=await r.read(),versions=await validationModelVersions(p),gs=versions.find(v=>v.closure.shape==='saved-gs')!.closure,cloud=versions.find(v=>v.closure.shape==='saved-point')!.closure;
    if(gs.shape!=='saved-gs'||cloud.shape!=='saved-point')throw Error('sources');
    const paths=await r.fs.list(''),writes=vi.spyOn(r.fs,'writeBytes'),text=vi.spyOn(r.fs,'writeText');
    for(const rep of [gs.representation,gs.proxy!,cloud.representation]){
      const catalog=rep.materialCatalog,slot=catalog?.slots[0];
      const command={kind:'createMaterial' as const,sceneId:target.sceneId,overrideId:`ovr_${newId()}`,routing:{scope:{kind:'project'},target:{assetId:rep.assetId,variantFamilyId:rep.variantFamilyId,materialLayoutId:catalog?.layoutId??`lay_${newId()}`,logicalMaterialSlotId:slot?.logicalMaterialSlotId??`slot_${newId()}`}},appearance:{lighting:'unlit'},compositing:{coverage:{policy:'inherit'},optics:'inherit'},eventId:`evt_${newId()}`};
      await expect(r.session.edit(p.token,command)).rejects.toThrow(catalog?'material-source':'material-target');expect((await r.session.read()).source!.token).toBe(p.token);expect(await r.fs.list('')).toEqual(paths);expect(writes).not.toHaveBeenCalled();expect(text).not.toHaveBeenCalled();
    }
    expect((await validationProjectService(r.fs,r.storage,r.store,limits).session.read()).state).toBe('ready');
  });
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


async function gsReplacement(r: Awaited<ReturnType<typeof setup>>, bytes=gsFixture(0)) {
  const p=await r.read(),prior=(await validationModelVersions(p))[0]!.closure;
  if(prior.shape!=='saved-gs')throw Error('GS closure');
  const prepared=await r.content.prepareModel({label:'updated.ply',file:new Blob([bytes.slice().buffer])},prior.binding.assetId,
    {representationToAsset:prior.representation.representationToAsset as unknown as JsonObject});
  const binding=await sealValidationRecord('asset-binding-revision',{id:prepared.binding.id!,assetId:prior.binding.assetId,assetRevisionId:prepared.revision.id!,
    parentBindingId:prior.binding.id,method:'manual',assetToProject:prior.binding.assetToProject as unknown as JsonObject});
  const command:ReplaceAssetModelCommand={kind:'replaceAssetModel',sceneId:(await r.target()).sceneId,assetId:prior.binding.assetId,expectedBindingId:prior.binding.id,
    revision:prepared.revision,representation:prepared.representation,binding};
  return {p,prior,prepared,command};
}
describe('08a ordinary GS body replacement',()=>{
  it('inspects only the native GS prefix for selection copy before committing a replacement',async()=>{
    const r=await setup(true),row=Array(89).fill(0);row[85]=1;
    const file=new Blob([gsFixture(4,Array.from({length:256},()=>row)).slice().buffer]),original=Blob.prototype.arrayBuffer,reads:number[]=[],fallback=vi.fn(async()=>{throw Error('Whole selected file forbidden');});
    const spy=vi.spyOn(Blob.prototype,'arrayBuffer').mockImplementation(function(this:Blob){reads.push(this.size);if(this.size>65536)throw Error('Whole GS forbidden');return original.call(this);});
    try{expect(await r.content.modelSelectionNotice({size:file.size,blob:file,arrayBuffer:fallback})).toEqual({externalMaterialsUnavailable:false});expect(fallback).not.toHaveBeenCalled();expect(reads).toEqual([65536]);}
    finally{spy.mockRestore();}
  });
  it.each([false,true])('preserves transformed source/placement/records with old Proxy=%s and assigns no surface to the new GS',async(proxy)=>{
    const transform={translation:[3,-2,.5],rotationXYZW:[0,0,1,0],uniformScale:2,reflection:'x'},r=await setup(true,limits,transform);
    if(proxy){const {token,...target}=await r.target(),bytes=triangleGlb(),pending=await r.workflow.prepare(token,target,{name:'old.glb',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});await r.workflow.commit(token,pending.id);r.workflow.completed();}
    const before=await r.read(),v=(await validationModelVersions(before))[0]!,c=v.closure;
    if(c.shape!=='saved-gs')throw Error('GS');
    const sceneId=(await r.target()).sceneId,captionId=`cap_${newId()}`,anchor={kind:'asset' as const,assetId:v.assetId,assetFrameId:c.assetFrame.id,positionAsset:[.1,.2,.3] as const,
      authoredAssetRevisionId:c.revision.id,authoredAnchorCompatibilityId:c.revision.anchorCompatibilityClasses[0]!.id,hitEvidence:{method:'manual' as const}};
    await r.session.edit(before.token,{kind:'addPin',sceneId,captionId,membershipId:`scm_${newId()}`,eventId:`evt_${newId()}`,anchor});
    const p=await r.read(),placement={translation:[8,9,10],rotationXYZW:[0,1,0,0],uniformScale:3},binding=await sealValidationRecord('asset-binding-revision',{
      id:`bnd_${newId()}`,assetId:v.assetId,assetRevisionId:c.revision.id,parentBindingId:c.binding.id,method:'manual',assetToProject:placement});
    await r.session.edit(p.token,{kind:'transformAsset',sceneId,assetId:v.assetId,expectedBindingId:c.binding.id,binding});
    const change=await gsReplacement(r),oldChanges=(await r.session.read()).source!.originalChanges(),beforeCaption=change.p.resources.captions[captionId],memberships=change.p.state.assetMemberships;
    const next=await r.session.edit(change.p.token,change.command);expect(next.state).toBe('ready');if(next.provider?.kind!=='scene-provider')throw Error('provider');
    const active=(await validationModelVersions(next.provider))[0]!.closure;if(active.shape!=='saved-gs')throw Error('GS');
    expect(active.proxy).toBeUndefined();expect(active.revision.representationIds).toEqual([active.representation.id]);
    expect(active.assetFrame).toEqual(change.prior.assetFrame);expect(active.binding.assetToProject).toEqual(placement);
    expect(active.representation.representationToAsset).toEqual(transform);expect(active.representation.logicalBoundsAsset).toEqual((await inspectGsPly(gsFixture(0),limits,{representationToAsset:transform})).bounds);
    expect(active.representation.variantFamilyId).not.toBe(change.prior.representation.variantFamilyId);expect(active.revision.anchorCompatibilityClasses).not.toEqual(change.prior.revision.anchorCompatibilityClasses);
    expect(next.provider.resources.captions[captionId]).toEqual(beforeCaption);expect(next.provider.state.assetMemberships).toEqual(memberships);
    const scene=resolveScene(next.provider.state,next.provider.resources,sceneId);expect(scene.kind==='ready'&&scene.composition.captions[0]).toMatchObject({marker:'needsReview',anchor:{kind:'value',value:anchor}});
    expect(next.source!.originalChanges().slice(0,oldChanges.length)).toEqual(oldChanges);
    const records=next.provider.inspection.candidates.unambiguousRecords as Record<string,any>;
    expect(records.representationsById[change.prior.representation.id]).toEqual(change.prior.representation);
    if(proxy)expect(records.representationsById[change.prior.proxy!.id]).toEqual(change.prior.proxy);
    expect((await r.content.modelContent(change.prior.representation,true)).kind).toBe('gs');expect((await r.content.modelContent(active.representation,true)).kind).toBe('gs');
    const same=await gsReplacement(r,gsFixture(0)),sameResult=await r.session.edit(same.p.token,same.command);expect(sameResult.state).toBe('ready');
    expect(same.prepared.representation.blob).toEqual(active.representation.blob);expect(same.prepared.revision.anchorCompatibilityClasses).not.toEqual(active.revision.anchorCompatibilityClasses);
    expect((await validationProjectService(r.fs,r.storage,r.store,limits).session.read()).source!.token).toBe(sameResult.source!.token);
  });
  it('refuses stale/profile/transform/old-surface and reused identity changes before writes',async()=>{
    const r=await setup(true),change=await gsReplacement(r),files=await r.fs.list('');
    const invalid=[{...change.command,expectedBindingId:`bnd_${newId()}`},
      {...change.command,representation:{...change.command.representation,formatProfile:{id:'native-gs',specificationSha256:'0'.repeat(64)}}},
      {...change.command,representation:{...change.command.representation,representationToAsset:{translation:[1,0,0],rotationXYZW:[0,0,0,1],uniformScale:1,reflection:'none'}}},
      {...change.command,representation:{...change.command.representation,variantFamilyId:change.prior.representation.variantFamilyId}},
      {...change.command,revision:{...change.command.revision,representationIds:[change.command.representation.id!,change.prior.representation.id]}}];
    for(const command of invalid){await expect(r.session.edit(change.p.token,command)).rejects.toThrow();expect(await r.fs.list('')).toEqual(files);expect((await r.session.read()).source!.token).toBe(change.p.token);}
    const policy={nonGs:limits,gs:limits,projectBodyBytes:gsFixture().length+1},small=await setup(true,policy),tooMuch=await gsReplacement(small);
    await expect(small.session.edit(tooMuch.p.token,tooMuch.command)).rejects.toThrow('合計');expect((await small.session.read()).source!.token).toBe(tooMuch.p.token);
  });
  it('recovers exact prepared GS replacement parts after publication failure without its ephemeral File',async()=>{
    const r=await setup(true),change=await gsReplacement(r);r.fs.rejectPublication=true;
    await expect(r.session.edit(change.p.token,change.command)).rejects.toThrow('gs-publication-fault');
    const paths=(await r.fs.list('')).filter(p=>p.endsWith('.amchange')),parts=await Promise.all(paths.map(p=>r.fs.readBytes(p)));
    r.content.releasePreparedModels();r.fs.rejectPublication=false;const cold=validationProjectService(r.fs,r.storage,r.store,limits),ready=await cold.session.retry();
    expect(ready.state).toBe('ready');expect(await Promise.all(paths.map(p=>r.fs.readBytes(p)))).toEqual(parts);
    if(ready.provider?.kind!=='scene-provider')throw Error('provider');const current=(await validationModelVersions(ready.provider))[0]!.closure;
    expect(current.binding.id).toBe(change.command.binding.id);expect(current.representation).toEqual(change.prepared.representation);
    await expect(cold.session.edit(ready.provider.token,change.command)).rejects.toThrow();
  });
});

it('08a exchanges all five purposes before Proxy reassignment and keeps independent peer edits and historical bodies',async()=>{
  const r=await setup(true),{token,...initial}=await r.target(),bytes=triangleGlb(),surface=await r.workflow.prepare(token,initial,{name:'old.glb',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
  await r.workflow.commit(token,surface.id);r.workflow.completed();const first=await r.read(),old=(await validationModelVersions(first))[0]!.closure;
  if(old.shape!=='saved-gs')throw Error('GS');const captionId=`cap_${newId()}`,anchor={kind:'asset' as const,assetId:initial.assetId,assetFrameId:old.assetFrame.id,positionAsset:[.1,.2,.3] as const,
    authoredAssetRevisionId:old.revision.id,authoredAnchorCompatibilityId:old.revision.anchorCompatibilityClasses[0]!.id,hitEvidence:{method:'manual' as const}};
  await r.session.edit(first.token,{kind:'addPin',sceneId:initial.sceneId,captionId,membershipId:`scm_${newId()}`,eventId:`evt_${newId()}`,anchor});
  const sender=new WorkspaceSender(r.fs,r.session,r.store,metadata,r.locks),workspace=await sender.download(await sender.generate((await r.read()).token));
  const peer=recipient(),receiver=new WorkspaceReceiver(peer.fs,peer.fs,peer.session,metadata,peer.locks),received=await receiver.importWorkspace(workspace);
  await peer.session.editCaption(received.source!.token,captionId,'body','kept local peer edit');
  const replacement=await gsReplacement(r),changed=await r.session.edit(replacement.p.token,replacement.command),base=(await sender.availableBases())[0]!.selection;
  const update=await sender.download(await sender.generateContribution(changed.source!.token,base)),merged=await receiver.receive((await peer.session.read()).source!.token,update);
  expect(merged.state).toBe('ready');if(merged.provider?.kind!=='scene-provider')throw Error('peer');
  expect(merged.provider.resources.captions[captionId]).toMatchObject({body:{kind:'value',value:'kept local peer edit'},anchor:{kind:'value',value:anchor}});
  const active=(await validationModelVersions(merged.provider))[0]!.closure;if(active.shape!=='saved-gs')throw Error('GS');expect(active.proxy).toBeUndefined();expect(active.representation).toEqual(replacement.prepared.representation);
  const out=new WorkspaceSender(peer.fs,peer.session,peer.store,metadata,peer.locks),review=await ReviewArchive.inspect(await out.download(await out.generateReview(merged.source!.token,{sceneId:initial.sceneId})),metadata);
  expect(Object.values(review.review.snapshot.representationsById as Record<string,any>).map(r=>r.role)).toEqual(['gsPrimary']);
  const cleanFile=await out.download(await out.generateClean(merged.source!.token)),clean=await CleanArchive.inspect(cleanFile,metadata);
  expect(Object.values(clean.description.records.representationsById as Record<string,any>).map(r=>r.role)).toEqual(['gsPrimary']);
  const copy=recipient(),copied=await new WorkspaceReceiver(copy.fs,copy.fs,copy.session,metadata,copy.locks).importWorkspace(cleanFile);expect(copied.state).toBe('ready');
  expect((await validationProjectService(copy.fs,copy.storage,copy.store,limits).session.read()).source!.token).toBe(copied.source!.token);
  const corrected=await peer.session.edit(merged.source!.token,{kind:'movePin',sceneId:initial.sceneId,captionId,anchor:{...anchor,positionAsset:[.4,.2,.3],authoredAssetRevisionId:active.revision.id,authoredAnchorCompatibilityId:active.revision.anchorCompatibilityClasses[0]!.id}});
  const returned=await out.download(await out.generateContribution(corrected.source!.token,(await out.availableBases())[0]!.selection));
  const back=await new WorkspaceReceiver(r.fs,r.fs,r.session,metadata,r.locks).receive(changed.source!.token,returned);
  expect(back.provider?.kind==='scene-provider'&&back.provider.resources.captions[captionId]).toMatchObject({body:{kind:'value',value:'kept local peer edit'},anchor:{kind:'value',value:{positionAsset:[.4,.2,.3]}}});
  const backup=await BackupArchive.inspect(await sender.download(await sender.generateBackup(back.source!.token,'GS replaced')),metadata);
  const records=(await backup.source.inspectOriginal({maxNodes:metadata.maxNodes,maxWork:metadata.maxWork})).candidates.unambiguousRecords as Record<string,any>;
  expect(records.representationsById[old.representation.id]).toEqual(old.representation);expect(records.representationsById[old.proxy!.id]).toEqual(old.proxy);
  for(const rep of [old.representation,active.representation]){const blob=rep.blob as any;expect(backup.archive.entryBlob('blobs/sha256/'+blob.digest).size).toBe(blob.byteLength);}
  expect((await validationProjectService(r.fs,r.storage,r.store,limits).session.read()).source!.token).toBe(back.source!.token);
});

it.each(['missing','corrupt'] as const)('08a refuses %s acknowledged replacement bytes on cold retry without recreating original parts',async(fault)=>{
  const r=await setup(true),change=await gsReplacement(r);r.fs.rejectPublication=true;
  await expect(r.session.edit(change.p.token,change.command)).rejects.toThrow('gs-publication-fault');r.content.releasePreparedModels();r.fs.rejectPublication=false;
  const digest=(change.prepared.representation.blob as any).digest as string,receipt=JSON.parse((await r.fs.readText(`v2/cas/sha256/${digest.slice(0,2)}/${digest.slice(2)}.json`))!),path=`v2/cas/objects/${receipt.objectId}.bin`;
  if(fault==='missing')await underWriteLease(r.fs,()=>r.fs.remove(path));else{const body=(await r.fs.readBytes(path))!;body[0]=body[0]!^1;await underWriteLease(r.fs,()=>r.fs.writeBytes(path,body));}
  const paths=(await r.fs.list('')).filter(p=>p.endsWith('.amchange')),parts=await Promise.all(paths.map(p=>r.fs.readBytes(p))),cold=validationProjectService(r.fs,r.storage,r.store,limits);
  await expect(cold.session.retry()).rejects.toThrow();expect(await Promise.all(paths.map(p=>r.fs.readBytes(p)))).toEqual(parts);
  expect((await new TransactionJournal(r.fs,metadata).entries()).at(-1)!.publication).toBeNull();
});
