import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopOffline,initializeDesktopOffline } from '../src/platform/desktopOffline';
import { desktopOfflineQuery, desktopOfflineScript,desktopOfflineManifest } from '../src/platform/desktopOfflinePorts';

const origin='http://127.0.0.1:49231/',script=new URL(desktopOfflineScript,origin).href;
class Worker extends EventTarget {
  scriptURL=script; state:ServiceWorkerState='activated'; complete=true;
  constructor(public build='a'){super();}
  postMessage(_query:unknown,ports:MessagePort[]){queueMicrotask(()=>{ports[0]!.postMessage({kind:desktopOfflineQuery,build:this.build,complete:this.complete,assets:15});ports[0]!.close();});}
}
const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const stop of cleanups.splice(0))stop();vi.restoreAllMocks();});
function fixture(){
  const reg=Object.assign(new EventTarget(),{scope:origin,active:null as Worker|null,waiting:null as Worker|null,installing:null as Worker|null,
    update:vi.fn(async()=>{}),unregister:vi.fn(async()=>{all=[];return true;})});
  let all:typeof reg[]=[];
  const sw=Object.assign(new EventTarget(),{controller:null as Worker|null,getRegistrations:vi.fn(async()=>all),register:vi.fn(async()=>{if(!all.includes(reg))all.push(reg);reg.active??=new Worker();return reg;})});
  const browser=Object.assign(new EventTarget(),{location:{href:origin,reload:vi.fn()},navigator:{serviceWorker:sw},isSecureContext:true,
    setTimeout:globalThis.setTimeout.bind(globalThis),clearTimeout:globalThis.clearTimeout.bind(globalThis)});
  const owner=createDesktopOffline('/','a',browser as unknown as Window);cleanups.push(()=>owner.dispose());
  return{...owner,reg,sw,browser,get all(){return all;},set all(value){all=value;}};
}
describe('dedicated offline app shell ownership (no Project/storage authority)',()=>{
  it('normalizes only identical duplicate manifest entries and requires every unique resource to carry SRI',()=>{
    const checked={url:'index.html',revision:'r1',integrity:'sha384-owned'};
    expect(desktopOfflineManifest([checked,{url:'./index.html',revision:'r1'}],origin)).toEqual([{...checked,url:origin+'index.html'}]);
    expect(()=>desktopOfflineManifest([checked,{...checked,revision:'r2'}],origin)).toThrow('Conflicting');
    expect(()=>desktopOfflineManifest([checked,{...checked,integrity:'sha384-other'}],origin)).toThrow('Conflicting');
    expect(()=>desktopOfflineManifest([{url:'unchecked.js',revision:'r1'}],origin)).toThrow('integrity');
    expect(()=>desktopOfflineManifest([{...checked,url:'https://other.invalid/a'}],origin)).toThrow('scope');
  });
  it('never registers on read; first installation requires reopen and actual control',async()=>{
    const f=fixture();await f.port.recheck();expect(f.sw.register).not.toHaveBeenCalled();expect(f.port.read().phase).toBe('unprepared');
    await f.port.prepare();expect(f.port.read().phase).toBe('reopen');expect(f.sw.register).toHaveBeenCalledWith(script,{scope:origin,updateViaCache:'none'});expect(f.reg.update).not.toHaveBeenCalled();
    f.sw.controller=f.reg.active;await f.port.recheck();expect(f.port.read().phase).toBe('ready');expect(f.browser.location.reload).not.toHaveBeenCalled();
  });
  it('binds completeness to the controlling/current build and reports a waiting update without activating it',async()=>{
    const f=fixture(),old=new Worker('old');f.reg.active=old;f.sw.controller=old;f.all=[f.reg];
    await f.port.recheck();expect(f.port.read().phase).toBe('error');
    f.reg.waiting=new Worker('a');await f.port.recheck();expect(f.port.read().phase).toBe('update');expect(f.reg.active).toBe(old);expect(f.sw.controller).toBe(old);
    f.reg.waiting=null;f.reg.active=new Worker('a');f.sw.controller=f.reg.active;f.reg.active.complete=false;
    await f.port.recheck();expect(f.port.read().phase).toBe('error');expect(f.browser.location.reload).not.toHaveBeenCalled();
  });
  it('refuses foreign overlapping registration or controller without registration/removal',async()=>{
    const f=fixture(),foreign=new Worker();foreign.scriptURL=origin+'sw.js';f.reg.active=foreign;f.all=[f.reg];
    await f.port.prepare();expect(f.port.read().message).toContain('別のアプリ');expect(f.sw.register).not.toHaveBeenCalled();
    await f.port.remove();expect(f.reg.unregister).not.toHaveBeenCalled();
    f.all=[];f.sw.controller=foreign;await f.port.prepare();expect(f.sw.register).not.toHaveBeenCalled();
  });
  it('keeps an existing usable worker after a failed update and permits explicit retry',async()=>{
    const f=fixture();f.reg.active=new Worker();f.sw.controller=f.reg.active;f.all=[f.reg];const original=f.reg.active;
    f.reg.update.mockRejectedValueOnce(new DOMException('空き容量不足','QuotaExceededError'));
    await f.port.prepare();expect(f.port.read().phase).toBe('error');expect(f.port.read().message).toContain('空き容量不足');expect(f.reg.active).toBe(original);
    await f.port.prepare();expect(f.port.read().phase).toBe('ready');expect(f.reg.unregister).not.toHaveBeenCalled();
  });
  it('does not report removal when another window registered concurrently; leaves caches/data alone',async()=>{
    const f=fixture();f.reg.active=new Worker();f.all=[f.reg];
    f.reg.unregister.mockImplementationOnce(async()=>true);await f.port.remove();expect(f.port.read().phase).toBe('error');expect(f.port.read().message).toContain('別の画面');
    await f.port.remove();expect(f.port.read().phase).toBe('removed');expect(f.sw.register).not.toHaveBeenCalled();await f.port.recheck();expect(f.port.read().phase).toBe('removed');
    expect(f.port.read().message).toContain('通信できる状態で同じアプリ');expect(f.port.read().message).toContain('プロジェクトは残ります');
    expect(f.port.read().message).not.toMatch(/静的|再配信|従来版へ戻る/);expect(f.browser.location.reload).not.toHaveBeenCalled();
  });
  it('rechecks registration after worker replies, so unregister in another window cannot masquerade as cold readiness',async()=>{
    const f=fixture();f.reg.active=new Worker();f.sw.controller=f.reg.active;f.all=[f.reg];let calls=0;
    f.sw.getRegistrations.mockImplementation(async()=>++calls===1?[f.reg]:[]);
    await f.port.recheck();expect(f.port.read().phase).toBe('error');expect(f.port.read().message).toContain('状態が変わりました');
  });
  it('retired preparation/removal cannot start a mutation after delayed ownership checks',async()=>{
    for(const action of ['prepare','remove']as const){const f=fixture();f.reg.active=new Worker();f.all=[f.reg];let release!:(value:typeof f.all)=>void;
      f.sw.getRegistrations.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
      const work=f.port[action]();f.dispose();release([f.reg]);await work;expect(f.sw.register).not.toHaveBeenCalled();expect(f.reg.unregister).not.toHaveBeenCalled();}
  });
  it('keeps removal available when an owned worker cannot reply',async()=>{
    const f=fixture();f.reg.active=new Worker();f.all=[f.reg];vi.spyOn(f.reg.active,'postMessage').mockImplementation(()=>{throw Error('worker unavailable');});
    await f.port.recheck();expect(f.port.read()).toMatchObject({phase:'error',registered:true});await f.port.remove();expect(f.port.read().phase).toBe('removed');
  });
  it('never claims or removes an exact-scope registration with no provable worker identity',async()=>{
    const f=fixture();f.all=[f.reg];await f.port.prepare();expect(f.sw.register).not.toHaveBeenCalled();await f.port.remove();expect(f.reg.unregister).not.toHaveBeenCalled();expect(f.port.read().message).toContain('別のアプリ');
  });
  it('does not create a new install waiter after disposal during update',async()=>{
    const f=fixture();f.reg.active=new Worker();f.all=[f.reg];let release!:()=>void;f.reg.update.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
    const work=f.port.prepare();await vi.waitFor(()=>expect(f.reg.update).toHaveBeenCalledOnce());f.dispose();f.reg.installing=new Worker();f.reg.installing.state='installing';release();await work;expect(f.port.read().phase).toBe('preparing');
  });
  it('retains a failed update worker after registration clears installing; healthy old code cannot mask the failure',async()=>{
    const f=fixture();f.reg.active=new Worker();f.sw.controller=f.reg.active;f.all=[f.reg];const old=f.reg.active;
    f.reg.update.mockImplementationOnce(async()=>{const next=new Worker('b');next.state='installing';f.reg.installing=next;f.reg.dispatchEvent(new Event('updatefound'));next.state='redundant';f.reg.installing=null;next.dispatchEvent(new Event('statechange'));});
    await f.port.prepare();expect(f.reg.update).toHaveBeenCalledOnce();expect(f.sw.register).not.toHaveBeenCalled();expect(f.port.read().phase).toBe('error');expect(f.reg.active).toBe(old);
    const reads=f.sw.getRegistrations.mock.calls.length;f.browser.dispatchEvent(new Event('focus'));await Promise.resolve();expect(f.sw.getRegistrations).toHaveBeenCalledTimes(reads);expect(f.port.read().phase).toBe('error');
    await f.port.recheck();expect(f.port.read().phase).toBe('ready');
  });
  it('retires an automatic old-ready read when a background install fails, then observes a genuinely new waiting worker',async()=>{
    const f=fixture();f.reg.active=new Worker();f.sw.controller=f.reg.active;f.all=[f.reg];await f.port.recheck();
    const failed=new Worker('b');failed.state='installing';f.reg.installing=failed;f.reg.dispatchEvent(new Event('updatefound'));failed.state='redundant';f.reg.installing=null;failed.dispatchEvent(new Event('statechange'));
    await Promise.resolve();expect(f.port.read().phase).toBe('error');
    const next=new Worker('b');next.state='installed';f.reg.waiting=next;f.reg.dispatchEvent(new Event('updatefound'));await vi.waitFor(()=>expect(f.port.read().phase).toBe('update'));
  });
  it('does not hide a newer failed installation behind an existing waiting worker or queued same-state events',async()=>{
    const f=fixture();f.reg.active=new Worker();f.sw.controller=f.reg.active;const older=new Worker('b');older.state='installed';f.reg.waiting=older;f.all=[f.reg];await f.port.recheck();
    f.reg.update.mockImplementationOnce(async()=>{const failed=new Worker('c');failed.state='installing';f.reg.installing=failed;f.reg.dispatchEvent(new Event('updatefound'));failed.state='redundant';f.reg.installing=null;failed.dispatchEvent(new Event('statechange'));});
    await f.port.prepare();expect(f.port.read().phase).toBe('error');const reads=f.sw.getRegistrations.mock.calls.length;
    f.reg.dispatchEvent(new Event('updatefound'));older.dispatchEvent(new Event('statechange'));f.browser.dispatchEvent(new Event('focus'));await Promise.resolve();expect(f.port.read().phase).toBe('error');expect(f.sw.getRegistrations).toHaveBeenCalledTimes(reads);
  });
  it('keeps explicit removal after a canceled installer sends a late redundant event',async()=>{
    const f=fixture();f.reg.active=new Worker();const pending=new Worker('b');pending.state='installing';f.reg.installing=pending;f.all=[f.reg];await f.port.recheck();await f.port.remove();expect(f.port.read().phase).toBe('removed');
    f.reg.installing=null;pending.state='redundant';pending.dispatchEvent(new Event('statechange'));expect(f.port.read().phase).toBe('removed');await Promise.resolve();expect(f.port.read().phase).toBe('removed');
  });
});

it('automatically prepares once at first boot and keeps cached offline starts and same-page removal independent',async()=>{
 const owner=fixture();await initializeDesktopOffline(owner.port);expect(owner.sw.register).toHaveBeenCalledOnce();
 owner.sw.controller=owner.reg.active;await owner.port.recheck();expect(owner.port.read().phase).toBe('ready');owner.reg.update.mockClear();
 await initializeDesktopOffline(owner.port,false);expect(owner.reg.update).not.toHaveBeenCalled();expect(owner.port.read().phase).toBe('ready');
 await owner.port.remove();await initializeDesktopOffline(owner.port);expect(owner.sw.register).toHaveBeenCalledOnce();expect(owner.port.read().phase).toBe('removed');
});

it('keeps browser-blocked registration local without an unhandled preparation failure',async()=>{
 const owner=fixture();owner.sw.register.mockResolvedValueOnce(undefined as never);await expect(initializeDesktopOffline(owner.port)).resolves.toBeUndefined();expect(owner.port.read()).toMatchObject({phase:'error',registered:false});expect(owner.sw.register).toHaveBeenCalledOnce();expect(owner.browser.location.reload).not.toHaveBeenCalled();
});
