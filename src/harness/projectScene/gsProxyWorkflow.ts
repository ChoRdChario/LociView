import type { GsProxyTarget, GsProxyCommand } from '../../projectMetadata/gsProxy';
import { readGsProxyTarget } from '../../projectMetadata/gsProxy';
import { newId } from '../../projectMetadata/persistence';
import { cloneCanonicalValue, type JsonObject } from '../../domain/values';
import type { ProjectProviderRead } from '../../scene/projectProvider';
import type { ValidationContent } from '../../projectFiles/content';
import { sealValidationRecord } from '../../projectFiles/initialProject';
import { validationMetadataLimits } from '../../projectFiles/validation';
import { validationDeclaredBodyBytes } from './validationProjection';
import type { MediaFileSelection } from './mediaHistory';

/** Input preparation owns its captured target; Session alone publishes the eventual command. */
export function createGsProxyWorkflow(content: ValidationContent, current: ()=>Promise<ProjectProviderRead>,
  commit: (token:string,command:GsProxyCommand)=>Promise<unknown>) {
  let prepared: { id:string; token:string; target:GsProxyTarget; proxy?:JsonObject } | undefined;
  let generation=0,journalOwned=false;
  const cancel=()=>{if(journalOwned)return;generation++;if(prepared?.proxy)content.releasePreparedModel(prepared.proxy.id as string);prepared=undefined;};
  const check=async(token:string,target:GsProxyTarget)=>{
    const p=await current();if(p.kind!=='scene-provider'||p.token!==token)throw Error('モデルが更新されています。選択を取り消して選び直してください。');
    return {p,...readGsProxyTarget(p,target,validationMetadataLimits)};
  };
  return {
    cancel,
    completed(){journalOwned=false;cancel();},
    async prepare(token:string,input:GsProxyTarget,file?:MediaFileSelection) {
      if(journalOwned)throw Error('面の更新を完了してください。');cancel();const captured=++generation;
      const live=()=>{if(captured!==generation)throw Error('面の選択を取り消しました。');};
      const target=cloneCanonicalValue(input as unknown as JsonObject,validationMetadataLimits) as unknown as GsProxyTarget;
      const selected=file && {name:file.name,size:file.size,arrayBuffer:file.arrayBuffer.bind(file)};
      const before=await check(token,target);live();let proxy:JsonObject|undefined,adopted=false;
      try {
      if(selected){
        if(!Number.isSafeInteger(selected.size)||selected.size<=0||validationDeclaredBodyBytes(before.p,validationMetadataLimits)+selected.size>content.limits.maxFileBytes)throw Error('モデルを含む合計がこの検証の上限を超えています。');
        const bytes=new Uint8Array(await selected.arrayBuffer());live();await check(token,target);live();
        if(bytes.length!==selected.size)throw Error('選択した面の大きさが一致しません。');
        proxy=await content.prepareGsProxy({label:selected.name,bytes},target.assetId,target.gsFamilyId);live();await check(token,target);live();
      }else if(target.expectedProxyId===null)throw Error('外す面を確認してください。');
      const id=newId();prepared={id,token,target,...(proxy?{proxy}:{})};adopted=true;return {id,label:selected?.name??''};
      } finally {if(!adopted&&proxy)content.releasePreparedModel(proxy.id as string);}
    },
    async commit(token:string,id:string){
      const selected=prepared;if(!selected||selected.id!==id||selected.token!==token)throw Error('位置指定用の面を選び直してください。');
      const {revision:oldRevision,binding:oldBinding,gs}=await check(token,selected.target), {proxy}=selected;
      const revision=await sealValidationRecord('asset-revision',{id:`rev_${newId()}`,assetId:selected.target.assetId,parentRevisionId:oldRevision.id!,
        representationIds:[gs.id!,...(proxy?[proxy.id!]:[])],anchorCompatibilityClasses:oldRevision.anchorCompatibilityClasses!,provenance:{origin:'derived',inputBlobDigests:proxy?[(proxy.blob as JsonObject).digest!]:[]}});
      await check(token,selected.target);
      const binding=await sealValidationRecord('asset-binding-revision',{id:`bnd_${newId()}`,assetId:selected.target.assetId,assetRevisionId:revision.id!,parentBindingId:oldBinding.id!,method:'manual',assetToProject:oldBinding.assetToProject!});
      await check(token,selected.target);
      journalOwned=true;
      let result:unknown;
      try{result=await commit(token,{kind:proxy?selected.target.expectedProxyId===null?'attachGsProxy':'changeGsProxy':'removeGsProxy',...selected.target,revision,binding,...(proxy?{proxy}:{})});}
      catch(error){try{await current();journalOwned=false;}catch{/* Session owns interrupted bytes until its exact retry completes. */}throw error;}
      journalOwned=false;
      if(prepared===selected)prepared=undefined;content.releasePreparedModels();return result;
    }
  };
}
