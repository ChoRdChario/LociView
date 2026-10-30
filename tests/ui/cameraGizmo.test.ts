import { describe, expect, it, vi } from 'vitest';
import { createCameraGizmo, projectCameraAxes } from '../../src/ui/projectScene/cameraGizmo';
import { RecordedDocument, record } from './domRecorder';

const front = { position: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0] };
function fixture(navigate?:Parameters<typeof createCameraGizmo>[3]) {
  const document = new RecordedDocument(), axis = vi.fn(), fit = vi.fn();
  const controls = createCameraGizmo(document.asDocument(), axis, fit,navigate), root = record(controls.root), compass = root.children[0]!;
  const buttons = compass.children.filter(n => n.tag === 'button');
  Object.assign(compass, { getBoundingClientRect: () => ({ left: 100, top: 50 }) });
  const pointer = (x: number, y: number) => compass.fire('click', { detail: 1, clientX: x + 100, clientY: y + 50, preventDefault() {}, stopPropagation() {} });
  return { controls, root, compass, buttons, axis, fit, pointer };
}
describe('compact camera orientation', () => {
  it('projects signed axes faithfully in front, top and orbit views, retaining depth', () => {
    const tips = projectCameraAxes(front);
    expect(tips).toEqual([{ x: 90, y: 56, depth: 0 }, { x: 22, y: 56, depth: -0 }, { x: 56, y: 22, depth: 0 },
      { x: 56, y: 90, depth: -0 }, { x: 56, y: 56, depth: 1 }, { x: 56, y: 56, depth: -1 }]);
    const top = projectCameraAxes({ ...front, position: [0, 5, 0], up: [0, 0, -1] });
    expect(top[2]).toEqual({ x: 56, y: 56, depth: 1 }); expect(top[4]).toEqual({ x: 56, y: 90, depth: 0 });
    const orbit = projectCameraAxes({ ...front, position: [5, 4, 3] });
    for (let i = 0; i < 6; i += 2) { expect(orbit[i]!.x + orbit[i + 1]!.x).toBeCloseTo(112); expect(orbit[i]!.y + orbit[i + 1]!.y).toBeCloseTo(112); }
    expect(projectCameraAxes({ ...front, up: [0, 0, 0] })).toEqual(projectCameraAxes(undefined));
  });
  it('uses small signed tips with explicit keyboard actions and the existing fit intent', () => {
    const f = fixture(); f.controls.render({ camera: front, axis: '+z', blocked: false });
    expect(f.buttons.map(b => b.textContent)).toEqual(['X', '', 'Y', '', 'Z', '']);
    expect(f.buttons.map(b => b.getAttribute('aria-label'))).toEqual(['X', '−X', 'Y', '−Y', 'Z', '−Z']);
    expect(f.buttons[4]!.getAttribute('aria-pressed')).toBe('true');
    f.buttons.forEach(b => b.fire('click', { detail: 0 }));
    expect(f.axis.mock.calls.flat()).toEqual(['right', 'left', 'top', 'bottom', 'front', 'back']);
    f.root.children.find(n => n.className === 'lv-camera-fit')!.fire('click'); expect(f.fit).toHaveBeenCalledOnce();
  });
  it('resolves overlapping hit areas by distance then depth and toggles the selected axis', () => {
    const f = fixture(); f.controls.render({ camera: front, axis: null, blocked: false });
    f.pointer(56, 56); expect(f.axis).toHaveBeenLastCalledWith('front');
    f.controls.render({ camera: front, axis: '+z', blocked: false });
    f.pointer(56, 56); expect(f.axis).toHaveBeenLastCalledWith('back');
    f.pointer(86, 56); expect(f.axis).toHaveBeenLastCalledWith('right');
    f.pointer(0, 0); expect(f.axis).toHaveBeenCalledTimes(3);
  });
  it('highlights the nearest tip when another axis owns the overlapping native hit area', () => {
    const f = fixture(), camera = { ...front, position: [5, 4, 3] }, tip = projectCameraAxes(camera)[1]!;
    f.controls.render({ camera, axis: null, blocked: false });
    f.compass.fire('pointermove', { pointerId: 1, clientX: tip.x + 100, clientY: tip.y + 50 });
    expect(f.buttons.map(b => b.dataset.hovered)).toEqual(['false', 'true', 'false', 'false', 'false', 'false']);
    f.pointer(tip.x, tip.y); expect(f.axis).toHaveBeenCalledWith('left');
    f.compass.fire('pointerleave'); expect(f.buttons.every(b => b.dataset.hovered === 'false')).toBe(true);
  });
  it('keeps one owned drag through self-blocking, ends it on pointerup and never snaps afterward',()=>{
    const navigate=vi.fn((_event:unknown)=>true),f=fixture(navigate),event={button:0,pointerId:2,clientX:150,clientY:100,preventDefault(){},stopPropagation(){}};
    f.controls.render({camera:front,axis:'+z',blocked:false});f.compass.fire('pointerdown',event);f.compass.fire('pointermove',{...event,clientX:154});expect(navigate).not.toHaveBeenCalled();
    f.compass.fire('pointermove',{...event,clientX:170});const id=navigate.mock.calls[0]![0] as any;expect(id).toMatchObject({phase:'begin',kind:'orbit'});
    f.controls.render({camera:front,axis:null,blocked:true,navigationBlocked:false,navigating:true});f.compass.fire('pointermove',{...event,clientX:180});
    f.compass.fire('pointerup',event);expect(navigate.mock.calls.map(c=>(c[0] as any).phase)).toEqual(['begin','move','move','end']);
    expect(new Set(navigate.mock.calls.map(c=>(c[0] as any).id)).size).toBe(1);f.pointer(56,56);expect(f.axis).not.toHaveBeenCalled();f.controls.dispose();
  });
  it('supports keyboard pan and releases the owned drag on cancellation, external block and disposal',()=>{
    const navigate=vi.fn((_event:Parameters<NonNullable<Parameters<typeof createCameraGizmo>[3]>>[0])=>true),f=fixture(navigate),pan=f.root.children.find(n=>n.className==='lv-camera-pan')!;
    f.controls.render({camera:front,axis:null,blocked:false});pan.fire('keydown',{key:'ArrowRight',preventDefault(){}});expect(navigate.mock.calls.map(c=>c[0].phase)).toEqual(['begin','move','end']);expect(navigate.mock.calls[0]![0]).toMatchObject({kind:'pan'});
    const event={button:0,pointerId:2,clientX:150,clientY:100,preventDefault(){},stopPropagation(){}};
    for(const end of ['pointercancel','lostpointercapture','blocked','dispose']){
      f.controls.render({camera:front,axis:null,blocked:false});pan.fire('pointerdown',event);pan.fire('pointermove',{...event,clientY:120});
      if(end==='blocked')f.controls.render({camera:front,axis:null,blocked:true,navigationBlocked:true});else if(end==='dispose')f.controls.dispose();else pan.fire(end,event);
      expect(navigate.mock.calls.at(-1)![0].phase).toBe('end');
    }
  });
  it('does not advertise drag navigation when the current viewport has no navigation port',()=>{
    const navigate=vi.fn((_event:unknown)=>true),f=fixture(navigate);f.controls.render({camera:front,axis:null,blocked:false,navigationAvailable:false});
    expect(f.root.children.find(n=>n.className==='lv-camera-pan')!.hidden).toBe(true);
    const event={button:0,pointerId:2,clientX:150,clientY:100,preventDefault(){},stopPropagation(){}};
    f.compass.fire('pointerdown',event);f.compass.fire('pointermove',{...event,clientX:170});f.compass.fire('pointerup',event);expect(navigate).not.toHaveBeenCalled();
    f.compass.fire('pointerdown',event);f.controls.render({camera:front,axis:null,blocked:false,navigationAvailable:false});f.compass.fire('pointerup',event);f.pointer(56,56);expect(f.axis).toHaveBeenCalledWith('front');
    f.buttons[0]!.fire('click',{detail:0});expect(f.axis).toHaveBeenCalledWith('right');f.controls.dispose();
  });
  it('does not snap after dragging, while blocked, or after disposal', () => {
    const f = fixture(); f.controls.render({ camera: front, axis: null, blocked: false });
    f.compass.fire('pointerdown', { button: 0, pointerId: 1, clientX: 150, clientY: 100, preventDefault() {} });
    f.compass.fire('pointermove', { pointerId: 1, clientX: 170, clientY: 100 }); f.pointer(56, 56);
    expect(f.axis).not.toHaveBeenCalled();
    f.controls.render({ camera: front, axis: null, blocked: true }); expect(f.buttons.every(b => b.disabled)).toBe(true);
    f.buttons[0]!.fire('click'); f.pointer(56, 56); expect(f.axis).not.toHaveBeenCalled();
    f.controls.render({ camera: front, axis: null, blocked: false }); f.controls.dispose();
    f.buttons[0]!.fire('click'); f.root.children.find(n => n.className === 'lv-camera-fit')!.fire('click');
    expect(f.axis).not.toHaveBeenCalled(); expect(f.fit).not.toHaveBeenCalled();
  });
});
