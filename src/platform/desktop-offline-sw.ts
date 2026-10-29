/// <reference lib="webworker" />
import { PrecacheController } from 'workbox-precaching';
import { desktopOfflineCachePrefix, desktopOfflineQuery,desktopOfflineRepair,desktopOfflineManifest } from './desktopOfflinePorts';

declare const self: ServiceWorkerGlobalScope;
const build = __DESKTOP_OFFLINE_BUILD_ID__;
const prefix = `${desktopOfflineCachePrefix}${encodeURIComponent(self.registration.scope)}:`;
const cacheName = prefix + build;
const precache = new PrecacheController({ cacheName, fallbackToNetwork: false });
const manifest=desktopOfflineManifest(self.__WB_MANIFEST,self.registration.scope);
precache.precache(manifest);

// Browser activation waits for old controlled windows. Retain other build caches:
// a different ID may belong to a concurrent installation, not an obsolete build.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const navigation = request.mode === 'navigate' && url.origin === self.location.origin &&
    [new URL(self.registration.scope).pathname, new URL('index.html', self.registration.scope).pathname].includes(url.pathname);
  const target = navigation ? new URL('index.html', self.registration.scope).href : url.href;
  if (!precache.getCacheKeyForURL(target)) return;
  // Only exact build resources and same-scope navigations. No runtime/user-data caching.
  event.respondWith(precache.matchPrecache(target).then(response => response ?? Response.error()));
});
async function checkResources(repair:boolean){
  const abort=new AbortController(),timer=repair?setTimeout(()=>abort.abort(),45_000):undefined;
  try{
    const cache = await caches.open(cacheName);
    const valid=async(response:Response|undefined,integrity:string)=>{
      if(!response?.ok)return false;
      const bytes=new Uint8Array(await crypto.subtle.digest('SHA-384',await response.arrayBuffer()));
      return `sha384-${btoa(String.fromCharCode(...bytes))}`===integrity;
    };
    for (const entry of manifest) {
      if(abort.signal.aborted)return false;
      const key=precache.getCacheKeyForURL(entry.url);
      const response = key?await cache.match(key):undefined;
      if(await valid(response,entry.integrity))continue;
      if(!repair||!key)return false;
      try{const replacement=await fetch(new Request(entry.url,{integrity:entry.integrity,cache:'reload',credentials:'same-origin',signal:abort.signal}));
        if(!await valid(replacement.clone(),entry.integrity))throw Error('Resource integrity mismatch');
        if(abort.signal.aborted)return false;await cache.put(key,replacement);
      }catch{return false;}
    }
    return manifest.length>0;
  }finally{clearTimeout(timer);}
}
let repairing:Promise<boolean>|undefined;
self.addEventListener('message', event => {
  if (![desktopOfflineQuery,desktopOfflineRepair].includes(event.data) || !event.ports[0]) return;
  event.waitUntil((async () => {
    let complete=false;
    try{complete=await(event.data===desktopOfflineRepair?(repairing??=(checkResources(true).finally(()=>{repairing=undefined;}))):checkResources(false));}catch{/* Incomplete remains retryable; no other cache or Project is modified. */}
    event.ports[0]!.postMessage({ kind: desktopOfflineQuery, build, complete, assets: manifest.length });
  })());
});
