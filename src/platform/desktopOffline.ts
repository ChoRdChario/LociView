import { desktopOfflineQuery, desktopOfflineRepair,desktopOfflineScript, type DesktopOfflinePort, type DesktopOfflineReport, type DesktopOfflineState } from './desktopOfflinePorts';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
const closedInstruction = '入力を確定し、必要なファイル保存を終えてから、このPC版の画面をすべて閉じて開き直してください。';
const preparationError=()=>Error('アプリを保存できませんでした。通信と空き容量を確認して、準備をやり直してください。');
/** Owns only the dedicated app shell. No Project/storage authority or ordinary PWA updater. */
export function createDesktopOffline(base: string, build: string, browser: Window = window) {
  const scope = new URL(base, browser.location.href).href, script = new URL(desktopOfflineScript, scope).href;
  const sw = browser.navigator.serviceWorker;
  let state: DesktopOfflineState = { phase: 'unprepared', registered: false, message: '通信できる間にアプリを準備すると、同じアドレス・ブラウザのプロファイルでオフライン起動できます。' };
  let disposed = false, busy = false, removed = false, failedPreparation=false,generation = 0, installEvent: InstallEvent | undefined;
  const listeners = new Set<() => void>(), watched = new Map<ServiceWorkerRegistration,()=>void>(), workers = new Map<ServiceWorker,()=>void>(), pending = new Set<()=>void>(), failedWorkers=new Set<ServiceWorker>();
  const publish = (next: DesktopOfflineState) => { if (!disposed) { state = next; for (const notify of listeners) notify(); } };
  const owns = (reg: ServiceWorkerRegistration) => {const known=[reg.active,reg.waiting,reg.installing].filter(Boolean);return reg.scope===scope&&known.length>0&&known.every(worker=>worker!.scriptURL===script);};
  const registrations = async () => {
    const all = await sw.getRegistrations();
    if (all.some(reg => scope.startsWith(reg.scope) && !owns(reg))) throw Error('別のアプリがこのアドレスをオフライン管理しています。専用のアドレスで開いてください。');
    if (sw.controller && sw.controller.scriptURL !== script) throw Error('この画面は別のアプリから開かれています。専用のアドレスで開いてください。');
    return all.find(owns);
  };
  const report = (worker: ServiceWorker,repair=false): Promise<DesktopOfflineReport> => new Promise((resolve, reject) => {
    if(disposed){reject(new DOMException('画面を閉じました。','AbortError'));return;}
    const channel = new MessageChannel();
    const close = () => { browser.clearTimeout(timer); channel.port1.close(); channel.port2.close(); pending.delete(cancel); };
    const cancel = () => { close(); reject(new DOMException('画面を閉じました。','AbortError')); };
    const timer = browser.setTimeout(() => { close(); reject(Error('アプリの準備状態を確認できません。もう一度確認してください。')); }, repair?60_000:8_000);
    pending.add(cancel);
    channel.port1.onmessage = event => {
      close(); const value: unknown = event.data;
      if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== desktopOfflineQuery || !('build' in value) || typeof value.build !== 'string' || !('complete' in value) || typeof value.complete !== 'boolean' || !('assets' in value) || typeof value.assets !== 'number' || value.assets < 1) reject(Error('対応するアプリの準備状態ではありません。'));
      else resolve(value as DesktopOfflineReport);
    };
    try { worker.postMessage(repair?desktopOfflineRepair:desktopOfflineQuery, [channel.port2]); }
    catch (error) { close(); reject(error); }
  });
  const supported = () => !!sw && browser.isSecureContext;
  const failure = (error: unknown) => publish({ phase: 'error', registered: state.registered, message: error instanceof Error ? error.message : '準備できませんでした。通信と空き容量を確認して、もう一度お試しください。' });
  const clearPreparationFailure=()=>{failedPreparation=false;failedWorkers.clear();};
  const preparationFailed=(error:unknown)=>{failedPreparation=true;failedWorkers.clear();for(const worker of workers.keys())failedWorkers.add(worker);
    for(const reg of watched.keys())for(const worker of [reg.active,reg.waiting,reg.installing])if(worker)failedWorkers.add(worker);failure(error);};
  const watch = (reg: ServiceWorkerRegistration) => {
    if (!watched.has(reg)) { const found=()=>{const fresh=[reg.installing,reg.waiting].some(worker=>worker&&!workers.has(worker)&&!failedWorkers.has(worker)&&worker.state!=='redundant');watch(reg);if(!busy&&fresh)clearPreparationFailure();changed();};watched.set(reg,found);reg.addEventListener('updatefound',found); }
    for (const worker of [reg.active, reg.waiting, reg.installing]) if(worker&&!workers.has(worker)) {
      let previous=worker.state;
      const change=()=>{const old=previous;previous=worker.state;if(disposed||old===previous)return;if(removed){changed();return;}
        if(previous==='redundant'&&(old==='installing'||old==='parsed')){if(!busy){++generation;preparationFailed(preparationError());}return;}
        if(!busy&&!failedWorkers.has(worker)&&(previous==='installed'||previous==='activated'))clearPreparationFailure();changed();};
      workers.set(worker,change);worker.addEventListener('statechange',change);
    }
  };
  const inspect = async (ticket: number) => {
    if (!supported()) { publish({ phase: 'blocked', registered: false, message: 'この環境ではオフライン準備を利用できません。対応するPCブラウザの専用アドレスで開いてください。' }); return; }
    const reg = await registrations();
    if (disposed || ticket !== generation) return;
    if (!reg) { publish({ phase: removed ? 'removed' : 'unprepared', registered: false, message: removed ? `準備を解除しました。${closedInstruction}従来版へ戻るには、同じアドレスで静的PC版を配信し、通信できる状態で開きます。プロジェクトは保持しています。` : '通信できる間にアプリを準備すると、同じアドレス・ブラウザのプロファイルでオフライン起動できます。' }); return; }
    removed=false;publish({...state,registered:true});
    watch(reg);
    const waitingWorker=reg.waiting,activeWorker=reg.active,controller=sw.controller;
    const waiting = waitingWorker ? await report(waitingWorker) : undefined;
    const active = activeWorker ? await report(activeWorker) : undefined;
    const controlled = controller ? await report(controller) : undefined;
    const current=await registrations();
    if (disposed || ticket !== generation) return;
    if(!current||current.waiting!==waitingWorker||current.active!==activeWorker||sw.controller!==controller)throw Error('アプリの準備状態が変わりました。もう一度確認してください。');
    if (waiting?.complete && active) publish({ phase: 'update', registered: true, message: `新しいアプリの準備ができました。${closedInstruction}` });
    else if (reg.installing) publish({ phase: 'preparing', registered: true, message: 'アプリを準備しています。作業は続けられます。' });
    else if (active?.complete && controlled?.complete && active.build === build && controlled.build === build) publish({ phase: 'ready', registered: true, message: 'この画面はオフラインで起動できるアプリから開いています。' });
    else if (active?.complete && active.build === build) publish({ phase: 'reopen', registered: true, message: `アプリを保存しました。${closedInstruction}` });
    else publish({ phase: 'error', registered: true, message: '必要なアプリ資源を確認できません。通信と空き容量を確認して、準備をやり直してください。' });
  };
  const refresh = async () => { if (disposed || busy) return; const ticket = ++generation; try { await inspect(ticket); } catch (error) { if (ticket === generation) failure(error); } };
  const recheck = async () => {if(disposed||busy)return;clearPreparationFailure();await refresh();};
  function changed() { if (!disposed && !busy&&!failedPreparation) void refresh(); }
  const prepare = async () => {
    if (disposed || busy) return; busy = true;clearPreparationFailure();const ticket = ++generation;let stopAttempt=()=>{};
    try {
      if (!supported()) throw Error('この環境ではオフライン準備を利用できません。');
      const existing=await registrations();
      if(disposed||ticket!==generation)return;
      publish({ phase: 'preparing', registered: state.registered, message: 'アプリを準備しています。作業は続けられます。' });
      // Explicit user intent only, including after removal. No automatic registration.
      const reg = existing??await sw.register(script, { scope, updateViaCache: 'none' }); removed = false;
      publish({...state,registered:true});
      await registrations(); if(disposed||ticket!==generation)return;watch(reg);
      let attempted=reg.installing;
      const capture=()=>{if(reg.installing)attempted=reg.installing;};reg.addEventListener('updatefound',capture);
      stopAttempt=()=>{reg.removeEventListener('updatefound',capture);pending.delete(stopAttempt);};pending.add(stopAttempt);
      if(existing&&!attempted)await reg.update();
      if(disposed||ticket!==generation)return;
      const worker = attempted??reg.installing;
      if (worker) await new Promise<void>((resolve, reject) => {
        const timer = browser.setTimeout(() => finish(Error('準備に時間がかかっています。通信と空き容量を確認して、もう一度お試しください。')), 60_000);
        const check = () => { if (worker.state === 'installed' || worker.state === 'activated') finish(); else if (worker.state === 'redundant') finish(preparationError()); };
        const cancel=()=>finish(new DOMException('画面を閉じました。','AbortError'));
        const finish = (error?: Error) => { browser.clearTimeout(timer); worker.removeEventListener('statechange', check); pending.delete(cancel);error ? reject(error) : resolve(); };
        pending.add(cancel);
        worker.addEventListener('statechange', check); check();
      });
      if(disposed||ticket!==generation)return;
      const current=await registrations();if(disposed||ticket!==generation)return;
      const preparedWorker=current?.waiting??current?.active;
      if(preparedWorker&&!(await report(preparedWorker,true)).complete)throw preparationError();
      await inspect(ticket);
    } catch (error) { if (ticket === generation)preparationFailed(error instanceof TypeError?preparationError():error); }
    finally {stopAttempt();busy = false;if(state.phase==='preparing')changed();}
  };
  const remove = async () => {
    if (disposed || busy) return; busy = true; const ticket = ++generation;
    try {
      if (!supported()) throw Error('準備状態を確認できません。');
      const reg = await registrations();
      if(disposed||ticket!==generation)return;
      if (reg) { if (!owns(reg)) throw Error('別のアプリの準備は解除できません。'); await reg.unregister(); }
      // The return boolean is insufficient: another window may register concurrently.
      const remaining = await registrations();
      if (remaining) throw Error('別の画面で準備が再開されました。このPC版の他の画面を閉じて、解除し直してください。');
      removed = true;clearPreparationFailure();await inspect(ticket);
    } catch (error) { if (ticket === generation) failure(error); }
    finally { busy = false; }
  };
  const beforeInstall = (event: Event) => { event.preventDefault(); installEvent = event as InstallEvent; for (const notify of listeners) notify(); };
  const installed = () => { installEvent = undefined; for (const notify of listeners) notify(); };
  browser.addEventListener('beforeinstallprompt', beforeInstall); browser.addEventListener('appinstalled', installed);
  sw?.addEventListener('controllerchange', changed); browser.addEventListener('focus', changed);
  const port: DesktopOfflinePort = { read: () => state, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, recheck, prepare, remove,
    installAvailable: () => !!installEvent, install: async () => { const event = installEvent; installEvent = undefined; try{if (event) { await event.prompt(); await event.userChoice; }}catch{failure(Error('インストールを開始できませんでした。ブラウザの案内を確認してください。オフライン準備とは別の操作です。'));}finally{installed();} } };
  return { port, dispose() { disposed = true; ++generation; for(const cancel of [...pending])cancel();listeners.clear(); sw?.removeEventListener('controllerchange', changed); browser.removeEventListener('focus', changed); browser.removeEventListener('beforeinstallprompt', beforeInstall); browser.removeEventListener('appinstalled', installed);for(const [reg,found]of watched)reg.removeEventListener('updatefound',found);for (const [worker,change] of workers) worker.removeEventListener('statechange',change); } };
}
