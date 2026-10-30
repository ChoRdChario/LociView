import { contextHelp, registerContextHelpPointer } from './contextHelp';
import type { CameraNavigationEvent } from './viewState';

const axes = [
  ['right', 'X', 0, 1, '+x', 'Xの正方向から表示。もう一度選択すると反対側を表示します。'],
  ['left', '−X', 0, -1, '-x', 'Xの負方向から表示。もう一度選択すると反対側を表示します。'],
  ['top', 'Y', 1, 1, '+y', '上から表示。もう一度選択すると下から表示します。'],
  ['bottom', '−Y', 1, -1, '-y', '下から表示。もう一度選択すると上から表示します。'],
  ['front', 'Z', 2, 1, '+z', '正面から表示。もう一度選択すると背面から表示します。'],
  ['back', '−Z', 2, -1, '-z', '背面から表示。もう一度選択すると正面から表示します。'],
] as const;
type AxisAction = typeof axes[number][0];
type Tip = { x: number; y: number; depth: number };
const center = 56, radius = 34;
const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const normalize = (v: number[]) => {
  const length = Math.hypot(...v);
  if (v.length !== 3 || !v.every(Number.isFinite) || length < 1e-9) throw Error('camera');
  return v.map(value => value / length);
};

/** Screen-space orientation only; world Y-up and the viewport's camera stay unchanged. */
export function projectCameraAxes(camera: unknown): Tip[] {
  let right: number[], up: number[], toward: number[];
  try {
    const value = camera as { position: number[]; target: number[]; up: number[] };
    if (![value.position, value.target, value.up].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) throw Error('camera');
    toward = normalize(value.position.map((v, i) => v - value.target[i]!));
    right = normalize(cross(value.up, toward)); up = cross(toward, right);
  } catch {
    toward = normalize([1, 1, 1]); right = normalize(cross([0, 1, 0], toward)); up = cross(toward, right);
  }
  return axes.map(([, , component, sign]) => ({ x: center + radius * right[component]! * sign,
    y: center - radius * up[component]! * sign, depth: toward[component]! * sign }));
}

/** UI-owned camera input; owns no renderer, coordinates or persisted state. */
export function createCameraGizmo(document: Document, onAxis: (axis: AxisAction) => void, onFit: () => void,
  navigate?: (event:CameraNavigationEvent)=>boolean) {
  const root = document.createElement('div'), compass = document.createElement('div');
  root.className = 'lv-project-camera'; root.setAttribute('role', 'group'); root.setAttribute('aria-label', '方位');
  compass.className = 'lv-camera-axes'; root.append(compass);
  let disposed = false, blocked = false, selected: string | null = null, tips = projectCameraAxes(undefined);
  let navigationAvailable=!!navigate;
  let down: { id:number;x:number;y:number;lastX:number;lastY:number;kind:'orbit'|'pan';owner:string;started:boolean;capture:HTMLElement } | null = null, moved = false;
  let lastPointer: MouseEvent | undefined;
  const choose = (index: number, toggle: boolean) => {
    if (disposed || blocked) return;
    const target = toggle && selected === axes[index]![4] ? index ^ 1 : index;
    onAxis(axes[target]![0]);
  };
  const help = (button: HTMLButtonElement, text: string) => {
    const note = contextHelp(document, text, [button]); (note.children[0] as HTMLElement).hidden = true; root.append(note);
  };
  const lines = axes.map(([, , component]) => {
    const line = document.createElement('i'); line.setAttribute('aria-hidden', 'true'); line.dataset.axis = String(component); compass.append(line); return line;
  });
  const buttons = axes.map(([, name, component, sign, , description], index) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = sign > 0 ? name : '';
    button.setAttribute('aria-label', name); button.dataset.axis = String(component); button.dataset.sign = String(sign);
    button.addEventListener('click', event => { if (!(event.detail > 0)) choose(index, false); });
    compass.append(button); help(button, description); return button;
  });
  const fit = document.createElement('button'); fit.type = 'button'; fit.className = 'lv-camera-fit'; fit.setAttribute('aria-label', '全体表示');
  const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); fit.append(icon);
  fit.addEventListener('click', () => { if (!disposed && !blocked) onFit(); }); root.append(fit);
  help(fit, '表示中のモデル全体に視点を合わせます。');
  const pan=document.createElement('button'),panIcon=document.createElement('span');pan.type='button';pan.className='lv-camera-pan';pan.setAttribute('aria-label','平行移動');panIcon.setAttribute('aria-hidden','true');pan.append(panIcon);root.append(pan);pan.hidden=!navigate;
  help(pan,'左ドラッグで視点を平行移動します。矢印キーでも移動できます。');
  const finish=(cancel=false)=>{
    const held=down;down=null;if(!held)return;if(cancel)moved=true;
    try{if(held.started)navigate?.({phase:'end',id:held.owner});}finally{if(held.capture.hasPointerCapture?.(held.id))held.capture.releasePointerCapture(held.id);}
  };
  const begin=(event:PointerEvent,kind:'orbit'|'pan',capture:HTMLElement)=>{
    if(disposed||blocked||event.button!==0||down)return;
    event.preventDefault();event.stopPropagation?.();moved=false;
    down={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,kind,owner:crypto.randomUUID(),started:false,capture};
    capture.setPointerCapture?.(event.pointerId);
  };
  const move=(event:PointerEvent)=>{
    const held=down;if(!held||held.id!==event.pointerId)return;
    if(!held.started&&Math.hypot(event.clientX-held.x,event.clientY-held.y)>6){
      moved=true;if(!navigate||!navigationAvailable)return;held.started=true;
      if(!navigate({phase:'begin',id:held.owner,kind:held.kind})){finish(true);return;}
    }
    if(held.started){event.preventDefault();if(!navigate?.({phase:'move',id:held.owner,dx:event.clientX-held.lastX,dy:event.clientY-held.lastY})){finish(true);return;}
      held.lastX=event.clientX;held.lastY=event.clientY;}
  };
  const key=(event:KeyboardEvent,kind:'orbit'|'pan')=>{
    if(event.key==='Escape'&&down){event.preventDefault();finish(true);return;}
    if(disposed||blocked||!navigate||!navigationAvailable||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const owner=crypto.randomUUID();if(!navigate({phase:'begin',id:owner,kind}))return;
    try{navigate({phase:'move',id:owner,dx:event.key==='ArrowLeft'?-24:event.key==='ArrowRight'?24:0,dy:event.key==='ArrowUp'?-24:event.key==='ArrowDown'?24:0});}
    finally{navigate({phase:'end',id:owner});}
  };
  for(const [area,kind] of [[compass,'orbit'],[pan,'pan']] as const){
    const element:HTMLElement=area;
    element.addEventListener('pointerdown',event=>begin(event,kind,element));
    element.addEventListener('pointermove',move);
    element.addEventListener('pointerup',event=>{if(down?.id===event.pointerId)finish();});
    element.addEventListener('pointercancel',event=>{if(down?.id===event.pointerId)finish(true);});
    element.addEventListener('lostpointercapture',event=>{if(down?.id===event.pointerId)finish(true);});
    element.addEventListener('keydown',event=>key(event,kind));
  }
  const blur=()=>finish(true),visibility=()=>{if(document.visibilityState==='hidden')finish(true);};
  document.defaultView?.addEventListener('blur',blur);document.addEventListener?.('visibilitychange',visibility);
  const nearest = (event: MouseEvent) => {
    const bounds = compass.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    return tips.map((tip, index) => ({ index, distance: Math.hypot(tip.x - x, tip.y - y), depth: tip.depth }))
      .filter(tip => tip.distance <= 22).sort((a, b) => a.distance - b.distance || b.depth - a.depth)[0]?.index;
  };
  const stopPointerHelp = registerContextHelpPointer(compass, event => {
    const index = nearest(event); return index === undefined || blocked || down?.started ? null : buttons[index]!;
  });
  const hover = (event?: MouseEvent) => {
    lastPointer = event;
    const index = event && !blocked ? nearest(event) : undefined;
    buttons.forEach((button, i) => { button.dataset.hovered = String(i === index); });
  };
  // Transparent 44px hit areas may overlap. Resolve by actual tip distance, then depth.
  compass.addEventListener('click', event => {
    if (!(event.detail > 0)) return;
    event.preventDefault(); event.stopPropagation();
    const index = nearest(event); if (!moved && index !== undefined) { buttons[index]!.focus({ preventScroll: true }); choose(index, true); }
    down = null; moved = false;
  }, true);
  compass.addEventListener('pointermove', event => hover(event));
  compass.addEventListener('pointerover', event => hover(event));
  compass.addEventListener('pointerleave', () => hover());
  return { root, render(state: { camera: unknown; axis: string | null; blocked: boolean;navigationBlocked?:boolean;navigating?:boolean;navigationAvailable?:boolean }) {
    if (disposed) return;
    navigationAvailable=!!navigate&&state.navigationAvailable!==false;root.dataset.navigationAvailable=String(navigationAvailable);
    if(!navigationAvailable&&down?.started||(state.navigationBlocked??state.blocked)||down?.started&&state.navigating===false)finish(true);
    blocked = state.blocked; selected = state.axis; tips = projectCameraAxes(state.camera); hover(lastPointer);
    tips.forEach((tip, index) => {
      const button = buttons[index]!, line = lines[index]!;
      button.disabled = blocked; button.setAttribute('aria-pressed', String(selected === axes[index]![4]));
      button.style.left = `${tip.x - 22}px`; button.style.top = `${tip.y - 22}px`;
      button.style.zIndex = String(10 + Math.round((tip.depth + 1) * 10)); button.dataset.depth = tip.depth < 0 ? 'back' : 'front';
      line.style.width = `${Math.hypot(tip.x - center, tip.y - center)}px`;
      line.style.transform = `rotate(${Math.atan2(tip.y - center, tip.x - center)}rad)`;
      line.dataset.depth = button.dataset.depth;
    }); fit.disabled = blocked;pan.hidden=!navigationAvailable;pan.disabled=!navigationAvailable||blocked&&!down?.started;
  }, dispose() { disposed = true;finish(true);document.defaultView?.removeEventListener('blur',blur);document.removeEventListener?.('visibilitychange',visibility);stopPointerHelp(); } };
}
