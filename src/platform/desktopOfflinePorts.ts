/** App-shell lifetime only. These operations never acknowledge or modify a Project. */
export type DesktopOfflinePhase = 'unprepared' | 'checking' | 'preparing' | 'reopen' | 'ready' | 'update' | 'removed' | 'blocked' | 'error';
export interface DesktopOfflineState {
  readonly phase: DesktopOfflinePhase;
  readonly message: string;
  readonly registered: boolean;
}
export interface DesktopOfflinePort {
  read(): DesktopOfflineState;
  subscribe(listener: () => void): () => void;
  recheck(): Promise<void>;
  prepare(): Promise<void>;
  remove(): Promise<void>;
  installAvailable(): boolean;
  install(): Promise<void>;
}
export const desktopOfflineScript = 'desktop-offline-sw.js';
export const desktopOfflineCachePrefix = 'lociview-desktop-offline-1:';
export const desktopOfflineQuery = 'lociview-desktop-offline-state-1';
export const desktopOfflineRepair = 'lociview-desktop-offline-repair-1';
export interface DesktopOfflineReport { readonly kind: typeof desktopOfflineQuery; readonly build: string; readonly complete: boolean; readonly assets: number }

/** VitePWA adds its manifest again after transforms. Conflicting/unchecked entries fail closed. */
export function desktopOfflineManifest(entries:readonly(string|{url:string;revision?:string|null;integrity?:string})[],scope:string){
  const unique=new Map<string,{url:string;revision?:string|null;integrity?:string}>();
  for(const entry of entries){if(typeof entry==='string')throw Error('Offline resource lacks integrity');const url=new URL(entry.url,scope).href;
    if(!url.startsWith(scope)||new URL(url).search||new URL(url).hash)throw Error('Offline resource outside candidate scope');const old=unique.get(url);
    if(old&&(old.revision!==entry.revision||old.integrity&&entry.integrity&&old.integrity!==entry.integrity))throw Error('Conflicting offline resource');
    if(!old||!old.integrity)unique.set(url,{...entry,url});
  }
  return[...unique.values()].map(entry=>{if(!entry.integrity?.startsWith('sha384-'))throw Error('Offline resource lacks integrity');return{...entry,integrity:entry.integrity};});
}
