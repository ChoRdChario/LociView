import type { ProjectViewport, ViewportFactory, ViewportPresentationFrame } from './viewportPorts';
import type { RenderDisplay } from './viewportModel';

/** One mounted canvas; late preparation never replaces local Caption UI state. */
export function createDeferredViewport() {
  const preparations = new Set<Promise<unknown>>();
  const retired = new Set<Promise<void>>();
  let cleanupFailure: unknown;
  let prepared:ViewportFactory|undefined, attach: ((factory: ViewportFactory) => void) | undefined, observe: (()=>ReturnType<ProjectViewport['read']>)|undefined;
  const factory: ViewportFactory = (canvas, changed, pin, model) => {
    if (attach) throw Error('前の3D表示を閉じてから準備してください。');
    if (cleanupFailure) throw cleanupFailure;
    let closed = false, runtime: ProjectViewport | undefined, display: RenderDisplay | undefined, active = false, installation = 0, issue: string | null = null;
    const retirements = new Set<Promise<void>>(), installations = new Set<Promise<void>>();
    let capture:ReturnType<NonNullable<ProjectViewport['capture']>>|undefined,captureScene:string|undefined;
    const presentationListeners=new Set<(frame:ViewportPresentationFrame)=>boolean>();
    let stopPresentation:(()=>void)|undefined,presentationSequence=0;
    const detachPresentation=()=>{stopPresentation?.();stopPresentation=undefined;};
    const bindPresentation=()=>{
      if(closed||!runtime||stopPresentation||!presentationListeners.size)return;
      const owner=runtime;let sourceGeneration=-1;
      stopPresentation=owner.observePresentation?.(frame=>{
        if(closed||!active||runtime!==owner||frame.display!==display||!Number.isSafeInteger(frame.generation)||frame.generation<=sourceGeneration)return false;
        sourceGeneration=frame.generation;
        const forwarded=Object.freeze({...frame,generation:++presentationSequence});let handled=presentationListeners.size>0;
        for(const listener of presentationListeners){try{if(listener(forwarded)!==true)handled=false;}catch{handled=false;}}
        return handled&&!closed&&active&&runtime===owner&&display===frame.display;
      });
    };
    const retire = (owner: ProjectViewport) => {
      let failure: unknown;
      try { owner.dispose(); } catch (error) { cleanupFailure ??= error; failure = error; }
      try {
        const idle = owner.idle?.();
        if (idle) {
          const work = Promise.resolve(idle).catch(error => { cleanupFailure ??= error; throw error; });
          retirements.add(work); retired.add(work);
          const done = () => { retirements.delete(work); retired.delete(work); };
          void work.then(done, done);
        }
      } catch (error) { cleanupFailure ??= error; failure ??= error; }
      if (failure) throw failure;
    };
    const retireCurrent = () => {
      const owner = runtime; runtime = undefined;
      let failure: unknown;
      try { detachPresentation(); } catch (error) { cleanupFailure ??= error; failure = error; }
      try { if (owner) retire(owner); } catch (error) { failure ??= error; }
      if (failure) throw failure;
    };
    const install = (next: ViewportFactory) => {
      if (closed) return;
      const revision = ++installation; issue = null;
      try { const nextCapture=runtime?.capture?.();if(nextCapture){capture=nextCapture;captureScene=runtime?.read().display?.sceneId;} } catch { /* Retain the last usable camera across a failed installation. */ }
      retireCurrent();
      const create = () => {
        if (closed || revision !== installation) return;
        if (cleanupFailure) throw cleanupFailure;
        let candidate: ProjectViewport | undefined;
        try { candidate = next(canvas, changed, pin, model); if (display) candidate.update(display); candidate.setActive(active); if (capture&&captureScene===display?.sceneId) candidate.recall?.(capture); runtime = candidate;bindPresentation(); }
        catch (error) { if(runtime===candidate)runtime=undefined;try { if(candidate)retire(candidate); } finally { issue = cleanupFailure ? '表示の終了処理を完了できませんでした。再読み込みしてください。' : error instanceof Error ? error.message : '3D表示を準備できません。'; throw error; } }
        queueMicrotask(()=>{if(!closed)changed();});
      };
      if (!retired.size) { create(); return; }
      const work = Promise.allSettled([...retired]).then(create); installations.add(work);
      void work.then(() => installations.delete(work), error => {
        installations.delete(work);
        if (!closed && revision === installation) { issue = cleanupFailure ? '表示の終了処理を完了できませんでした。再読み込みしてください。' : error instanceof Error ? error.message : '3D表示を準備できません。'; changed(); }
      });
    };
    attach = install;
    const read = () => runtime?.read() ?? { token: '', display, ready: false, issue: cleanupFailure ? '表示の終了処理を完了できませんでした。再読み込みしてください。' : issue, loading: !issue && !cleanupFailure, dragging: false, projection: 'perspective' as const, axis: null, pins: [] };
    observe=read;
    // Keep a port for cleanup/retry even if a pre-attached factory fails during construction.
    try { if(prepared)install(prepared); } catch { /* The local issue and owned retirement remain observable. */ }
    return {
      async idle() {
        for (;;) {
          while (preparations.size || installations.size || retirements.size) await Promise.allSettled([...preparations, ...installations, ...retirements]);
          const owner = runtime; await owner?.idle?.();
          if (preparations.size || installations.size || retirements.size || owner !== runtime) continue;
          if (cleanupFailure) throw cleanupFailure;
          return;
        }
      },
      observePresentation(listener){if(closed)return()=>{};presentationListeners.add(listener);bindPresentation();return()=>{presentationListeners.delete(listener);if(!presentationListeners.size)detachPresentation();};},
      update(next) { display = next; runtime?.update(next); }, setActive(next) { active = next; runtime?.setActive(next); },
      read,
      camera(intent) { if (!runtime) throw Error('3Dモデルを読み込んでいます。'); runtime.camera(intent); },
      get navigateCamera(){return runtime?.navigateCamera?(event:Parameters<NonNullable<ProjectViewport['navigateCamera']>>[0])=>runtime?.navigateCamera?.(event)??false:undefined;},
      retry() { if(closed)return;if (cleanupFailure) throw cleanupFailure; if (runtime) runtime.retry(); else if(prepared)install(prepared); }, capture() { if (!runtime?.capture) throw Error('3Dモデルを読み込んでいます。'); return runtime.capture(); },
      recall: payload => runtime?.recall?.(payload), setBackground(input, verify) { if (!runtime?.setBackground) throw Error('3Dモデルを読み込んでいます。'); runtime.setBackground(input, verify); },
      setPinPointerActive: value => runtime?.setPinPointerActive?.(value), pointDiameter: id => runtime?.pointDiameter?.(id) ?? 3,
      setPointDiameter: (id, value) => runtime?.setPointDiameter?.(id, value), pick: (...args) => runtime?.pick?.(...args) ?? null,
      pickCreation: (...args) => runtime?.pickCreation?.(...args) ?? null,
      dispose() { if (closed) return; closed = true; installation++; if(attach===install)attach=undefined;presentationListeners.clear();retireCurrent(); },
    };
  };
  return { factory, read:()=>observe?.(), preparing<T>(work: Promise<T>): Promise<T> {
    preparations.add(work); return work.finally(() => preparations.delete(work));
  }, attach(next: ViewportFactory) { prepared=next;attach?.(next); } };
}
