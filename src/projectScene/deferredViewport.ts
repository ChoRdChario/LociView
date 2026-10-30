import type { ProjectViewport, ViewportFactory } from './viewportPorts';
import type { RenderDisplay } from './viewportModel';

/** One mounted canvas; late preparation never replaces local Caption UI state. */
export function createDeferredViewport() {
  let closed = false, prepared:ViewportFactory|undefined, attach: ((factory: ViewportFactory) => void) | undefined, observe: (()=>ReturnType<ProjectViewport['read']>)|undefined;
  const factory: ViewportFactory = (canvas, changed, pin, model) => {
    let runtime: ProjectViewport | undefined, display: RenderDisplay | undefined, active = false;
    let capture:ReturnType<NonNullable<ProjectViewport['capture']>>|undefined,captureScene:string|undefined;
    const install = (next: ViewportFactory) => {
      if (closed) return;
      try { const nextCapture=runtime?.capture?.();if(nextCapture){capture=nextCapture;captureScene=runtime?.read().display?.sceneId;} } catch { /* Retain the last usable camera across a failed installation. */ }
      runtime?.dispose(); runtime = undefined;
      const candidate = next(canvas, changed, pin, model);
      try { if (display) candidate.update(display); candidate.setActive(active); if (capture&&captureScene===display?.sceneId) candidate.recall?.(capture); runtime = candidate; }
      catch (error) { candidate.dispose(); throw error; }
      queueMicrotask(()=>{if(!closed)changed();});
    };
    attach = install;
    if(prepared)install(prepared);
    observe=()=>runtime?.read()??{token:'',ready:false,issue:null,loading:true,dragging:false,projection:'perspective',axis:null,pins:[]};
    return {
      update(next) { display = next; runtime?.update(next); }, setActive(next) { active = next; runtime?.setActive(next); },
      read: () => runtime?.read() ?? { token: '', display, ready: false, issue: null, loading: true, dragging: false, projection: 'perspective', axis: null, pins: [] },
      camera(intent) { if (!runtime) throw Error('3Dモデルを読み込んでいます。'); runtime.camera(intent); },
      get navigateCamera(){return runtime?.navigateCamera?(event:Parameters<NonNullable<ProjectViewport['navigateCamera']>>[0])=>runtime?.navigateCamera?.(event)??false:undefined;},
      retry() { runtime?.retry(); }, capture() { if (!runtime?.capture) throw Error('3Dモデルを読み込んでいます。'); return runtime.capture(); },
      recall: payload => runtime?.recall?.(payload), setBackground(input, verify) { if (!runtime?.setBackground) throw Error('3Dモデルを読み込んでいます。'); runtime.setBackground(input, verify); },
      setPinPointerActive: value => runtime?.setPinPointerActive?.(value), pointDiameter: id => runtime?.pointDiameter?.(id) ?? 3,
      setPointDiameter: (id, value) => runtime?.setPointDiameter?.(id, value), pick: (...args) => runtime?.pick?.(...args) ?? null,
      pickCreation: (...args) => runtime?.pickCreation?.(...args) ?? null,
      dispose() { if (closed) return; closed = true; attach = undefined; runtime?.dispose(); runtime = undefined; },
    };
  };
  return { factory, read:()=>observe?.(), attach(next: ViewportFactory) { if (!closed) {prepared=next;attach?.(next);} } };
}
