import type { ProjectProviderRead } from '../scene/projectProvider';
import { recordBlobRefs } from '../domain/portableMedia';
import type { JsonObject } from '../domain/values';
import { metadataImmutableReader } from '../projectMetadata/records';
import { validationMetadataLimits as limits, fileError, fileObject, type ProjectFilePolicy } from './validation';

/** All known immutable declarations, including inactive historical models and media. */
export function validationDeclaredBodyBytes(provider: Extract<ProjectProviderRead,{kind:'scene-provider'}>, policy?: ProjectFilePolicy, addition?: JsonObject): number {
  const read=metadataImmutableReader(provider,limits), sizes=new Map<string,number>();
  const records:JsonObject[]=[];
  for(const map of ['representationsById','mediaResourcesById'] as const) for(const id of Object.keys(provider.details.immutable[map]))records.push(read(map,id));
  if(addition)records.push(addition);
  for(const record of records) for (const blob of recordBlobRefs(record)) {
    const size=blob.byteLength as number, hash=blob.digest as string;
    if(!Number.isSafeInteger(size)||size<=0)return fileError('保存した本体の大きさを確認してください。');
    if(policy && size>(record.contentKind==='gaussianSplat'?policy.gs:policy.nonGs).maxFileBytes)return fileError('保存した本体が容量の上限を超えています。');
    if(sizes.has(hash)&&sizes.get(hash)!==size)return fileError('保存した本体の大きさが一致しません。');
    sizes.set(hash,size);
  }
  const total=[...sizes.values()].reduce((n,size)=>n+size,0);
  if(!Number.isSafeInteger(total)||policy&&total>policy.projectBodyBytes)return fileError('モデルとメディアの合計が容量の上限を超えています。');
  return total;
}

/** Refuse a definitely new over-budget body before allocating it; equal sizes
 * still require the ordinary exact-digest check before any staging. */
export function assertValidationBodyAllocation(provider: Extract<ProjectProviderRead,{kind:'scene-provider'}>, policy: ProjectFilePolicy, size: number): void {
  const total=validationDeclaredBodyBytes(provider,policy);
  if(!Number.isSafeInteger(size)||size<=0)return fileError('本体の大きさを確認してください。');
  if(size<=policy.projectBodyBytes-total)return;
  const read=metadataImmutableReader(provider,limits);
  for(const map of ['representationsById','mediaResourcesById'] as const) for(const id of Object.keys(provider.details.immutable[map])) {
    if(recordBlobRefs(read(map,id)).some(ref=>ref.byteLength===size))return;
  }
  return fileError('モデルとメディアの合計が容量の上限を超えています。');
}
