import {openValidationHost as openTypedHost,openValidationEntry as openTypedEntry} from '../../projectScene/validationHost';
import type {FirstBackupRecovery as TypedFirstBackup,ValidationHostOptions} from '../../projectScene/validationHost';
import type {MetadataEdit} from '../../projectMetadata/commands';
import {metadataIntent} from './metadataIntent';
export {validationArea,measureValidation} from '../../projectScene/validationHost';
export type {ValidationHostOptions,ValidationTiming} from '../../projectScene/validationHost';
export function legacyValidationHost<T extends {authority:{read():Parameters<typeof metadataIntent>[1]};dispatch(token:string,command:MetadataEdit):Promise<unknown>}>(host:T){
  const authority=Object.assign(Object.create(host.authority) as T['authority'],{async write(token:string,changes:Readonly<Record<string,string>>,context?:{sceneId:string}){
    await host.dispatch(token,metadataIntent(changes,host.authority.read(),context));return host.authority.read();}});
  return Object.assign(Object.create(host) as T,{authority});
}
export async function openValidationHost(options:ValidationHostOptions){return legacyValidationHost(await openTypedHost(options));}
export type ValidationNormalHost=Awaited<ReturnType<typeof openValidationHost>>;
export type FirstBackupRecovery=Omit<TypedFirstBackup,'confirm'|'retry'|'edit'> & {
  confirm(prepare:Parameters<TypedFirstBackup['confirm']>[0]):Promise<ValidationNormalHost>;
  retry(prepare:Parameters<TypedFirstBackup['retry']>[0]):Promise<ValidationNormalHost>;
  edit():Promise<ValidationNormalHost|FirstBackupRecovery>;
};
function legacyEntry(opened:Awaited<ReturnType<typeof openTypedEntry>>):ValidationNormalHost|FirstBackupRecovery {
  if(!('kind' in opened))return legacyValidationHost(opened);
  return Object.assign(Object.create(opened) as TypedFirstBackup,{
    confirm:async(prepare:Parameters<TypedFirstBackup['confirm']>[0])=>legacyValidationHost(await opened.confirm(prepare)),
    retry:async(prepare:Parameters<TypedFirstBackup['retry']>[0])=>legacyValidationHost(await opened.retry(prepare)),
    edit:async()=>legacyEntry(await opened.edit())});
}
export async function openValidationEntry(options:ValidationHostOptions){return legacyEntry(await openTypedEntry(options));}
