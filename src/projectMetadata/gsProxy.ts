import { checkProjectRecord, projectRecordMaps } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { gsSourceDeclaration } from '../domain/gsSource';
import { meshSourceFormat, meshSourceDeclarations } from '../domain/meshSource';
import { object, list, same } from '../domain/projectGraphSupport';
import type { JsonObject } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { resolveScene } from '../scene/resolve';
import { candidateReader } from './membership';
import { metadataImmutableReader } from './records';
import type { MetadataRecordEdit } from './commands';
import { fail, type MetadataLimits } from './format';

export interface GsProxyTarget { readonly sceneId: string; readonly assetId: string; readonly expectedBindingId: string;
  readonly gsRepresentationId: string; readonly gsPayloadDigest: string; readonly gsFamilyId: string;
  readonly expectedProxyId: string | null }
export type GsProxyCommand = GsProxyTarget & { readonly kind: 'attachGsProxy' | 'changeGsProxy' | 'removeGsProxy';
  readonly revision: JsonObject; readonly binding: JsonObject; readonly proxy?: JsonObject };
export function readGsProxyTarget(provider: Extract<ProjectProviderRead,{kind:'scene-provider'}>, target: GsProxyTarget, limits: MetadataLimits) {
  const reader=candidateReader(provider,limits), read=metadataImmutableReader(provider,limits); reader.active('assetsById',target.assetId);
  const scene=resolveScene(provider.state,provider.resources,target.sceneId), projection=provider.resources.assets[target.assetId]?.projection;
  if(scene.kind!=='ready' || !scene.composition.assets.some(a=>a.assetId===target.assetId) || projection?.kind!=='value' || projection.value.bindingId!==target.expectedBindingId) return fail('gs-proxy-stale');
  const binding=read('assetBindingsById',target.expectedBindingId), revision=read('assetRevisionsById',projection.value.revisionId);
  const reps=list(revision.representationIds).map(id=>read('representationsById',id as string)), sources=reps.filter(r=>r.role==='gsPrimary'), proxies=reps.filter(r=>r.role==='interactionProxy');
  const gs=sources[0], proxy=proxies[0];
  if(sources.length!==1 || proxies.length>1 || reps.length!==1+proxies.length || !gs || gs.assetId!==target.assetId ||
    !same(gs.formatProfile,gsSourceDeclaration) || gs.id!==target.gsRepresentationId || gs.payloadDigest!==target.gsPayloadDigest || gs.variantFamilyId!==target.gsFamilyId ||
    (proxy?.id??null)!==target.expectedProxyId || proxy && (proxy.assetId!==target.assetId || proxy.proxyForGsVariantFamilyId!==gs.variantFamilyId)) return fail('gs-proxy-target');
  return {binding,revision,gs,proxy};
}
/** Closed same-GS edit. No placement, GS identity, class or Caption rewriting. */
export function planGsProxy(provider: Extract<ProjectProviderRead,{kind:'scene-provider'}>, command: GsProxyCommand, limits: MetadataLimits): MetadataRecordEdit[] {
  const c=new ProjectRecordFields(provider.semanticProfile), {binding:oldBinding,revision:oldRevision,gs,proxy:oldProxy}=readGsProxyTarget(provider,command,limits);
  const removing=command.kind==='removeGsProxy', keys=['kind','sceneId','assetId','expectedBindingId','gsRepresentationId','gsPayloadDigest','gsFamilyId','expectedProxyId','revision','binding',...(!removing?['proxy']:[])];
  if(Object.keys(command).sort().join('|')!==keys.sort().join('|') || command.kind==='attachGsProxy' && oldProxy || command.kind!=='attachGsProxy' && !oldProxy) return fail('gs-proxy-shape');
  const {revision,binding,proxy}=command, edits:MetadataRecordEdit[]=[];
  for(const [map,r] of [['assetRevisionsById',revision],['assetBindingsById',binding],...(!removing?[['representationsById',proxy!]] as const:[])] as const) {
    if(!r) return fail('gs-proxy-record'); checkProjectRecord(c,map,r); edits.push({map,id:r.id as string,fields:r,create:true});
  }
  const exactKeys=(r:JsonObject,k:string[])=>{if(Object.keys(r).sort().join('|')!==k.sort().join('|'))fail('gs-proxy-fields');};
  exactKeys(binding,['id','assetId','assetRevisionId','parentBindingId','method','assetToProject','payloadDigest']);
  exactKeys(revision,['id','assetId','parentRevisionId','representationIds','anchorCompatibilityClasses','provenance','payloadDigest']);
  if(c.unknown || binding.assetId!==command.assetId || binding.assetRevisionId!==revision.id || binding.parentBindingId!==oldBinding.id || binding.method!=='manual' || !same(binding.assetToProject,oldBinding.assetToProject) ||
    revision.assetId!==command.assetId || revision.parentRevisionId!==oldRevision.id || !same(revision.anchorCompatibilityClasses,oldRevision.anchorCompatibilityClasses) ||
    !same(revision.representationIds,[gs.id!,...(!removing?[proxy!.id!]:[])])) return fail('gs-proxy-closure');
  const refs=removing?[]:[object(proxy!.blob).digest!];
  if(!same(revision.provenance,{origin:'derived',inputBlobDigests:refs})) return fail('gs-proxy-provenance');
  if(proxy) {
    exactKeys(proxy,['id','assetId','representationFrameId','contentKind','purposes','role','variantFamilyId','formatProfile','blob','representationToAsset','logicalBoundsAsset','derivedFrom','materialCatalog','proxyForGsVariantFamilyId','payloadDigest']);
    const p=object(proxy.formatProfile);
    const mesh=meshSourceFormat(p);
    if(proxy.assetId!==command.assetId || proxy.contentKind!=='mesh' || proxy.role!=='interactionProxy' || !same(proxy.purposes,['interaction']) || proxy.proxyForGsVariantFamilyId!==gs.variantFamilyId || !same(proxy.derivedFrom,[]) ||
      !same(proxy.representationToAsset,{translation:[0,0,0],rotationXYZW:[0,0,0,1],uniformScale:1,reflection:'none'}) ||
      !(mesh&&object(proxy.blob).mediaType===meshSourceDeclarations[mesh].mediaType || p.id==='development-validation-glb-1' && p.specificationSha256==='077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f' || p.id==='development-validation-glb-jpeg-1' && p.specificationSha256==='a08a1c90496df087b1cd454dd29177ff3da7fdc8b5ebfb07156189479a8f8db8')) return fail('gs-proxy-profile');
  }
  const reserved=new Set<string>(), reader=candidateReader(provider,limits);
  const reserve=(v:unknown):void=>{reader.charge();if(typeof v==='string')reserved.add(v);else if(Array.isArray(v))v.forEach(reserve);else if(v&&typeof v==='object')Object.values(v).forEach(reserve);};
  for(const change of provider.inspection.candidates.source.history.changes)for(const w of change.writes){if(Object.hasOwn(projectRecordMaps,w.path[0]!))reserve(w.path[1]);if(w.value.kind==='value')reserve(w.value.value);}
  const ids:[[unknown,string],...Array<[unknown,string]>]=[[revision.id,'rev'],[binding.id,'bnd']];
  if(proxy){const catalog=object(proxy.materialCatalog);ids.push([proxy.id,'rep'],[proxy.representationFrameId,'frm'],[proxy.variantFamilyId,'fam'],[catalog.layoutId,'lay'],...list(catalog.slots).map(s=>[object(s).logicalMaterialSlotId,'slot'] as [unknown,string]));}
  for(const [id,prefix]of ids){c.id(id as string,prefix,[]);if(reserved.has(id as string))fail('gs-proxy-id');reserved.add(id as string);}
  edits.push({map:'assetsById',id:command.assetId,create:false,fields:{status:{kind:'ready',activeBindingId:binding.id!}}}); return edits;
}
