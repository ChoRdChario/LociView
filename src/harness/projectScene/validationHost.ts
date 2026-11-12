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
  confirm(...args:Parameters<TypedFirstBackup['confirm']>):Promise<ValidationNormalHost>;
  retry(...args:Parameters<TypedFirstBackup['retry']>):Promise<ValidationNormalHost>;
  edit():Promise<ValidationNormalHost|FirstBackupRecovery>;
};
function legacyEntry(opened:Awaited<ReturnType<typeof openTypedEntry>>):ValidationNormalHost|FirstBackupRecovery {
  if(!('kind' in opened))return legacyValidationHost(opened);
  const actualHosts=new WeakMap<ValidationNormalHost,Awaited<ReturnType<typeof openTypedHost>>>();
  const wrap=(host:Awaited<ReturnType<typeof openTypedHost>>)=>{const result=legacyValidationHost(host);actualHosts.set(result,host);return result;};
  return Object.assign(Object.create(opened) as TypedFirstBackup,{
    confirm:async(...args:Parameters<TypedFirstBackup['confirm']>)=>wrap(await opened.confirm(...args)),
    retry:async(...args:Parameters<TypedFirstBackup['retry']>)=>wrap(await opened.retry(...args)),
    takePreview:(value:Parameters<TypedFirstBackup['takePreview']>[0],host:ValidationNormalHost)=>opened.takePreview(value,actualHosts.get(host)??host),
    edit:async()=>legacyEntry(await opened.edit())});
}
export async function openValidationEntry(options:ValidationHostOptions){return legacyEntry(await openTypedEntry(options));}
