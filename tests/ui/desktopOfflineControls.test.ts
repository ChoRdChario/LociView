import {expect,it,vi} from 'vitest';
import {createOfflineControls} from '../../src/ui/projectScene/offlineControls';
import type {DesktopOfflinePort,DesktopOfflineState} from '../../src/platform/desktopOfflinePorts';
import {RecordedDocument,record} from './domRecorder';

it('keeps preparation local, confirms removal and ignores late results after disposal',async()=>{
  let state:DesktopOfflineState={phase:'error',registered:true,message:'準備を確認できません。'},notify=()=>{};
  let finish!:()=>void;const stop=vi.fn();
  const port:DesktopOfflinePort={read:()=>state,subscribe:f=>{notify=f;return stop;},recheck:vi.fn(async()=>{}),prepare:vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})),remove:vi.fn(async()=>{}),install:vi.fn(async()=>{}),installAvailable:()=>false};
  const events=new Map<string,Set<(event:Event)=>void>>(),document=Object.assign(new RecordedDocument(),{
    addEventListener(type:string,listener:(event:Event)=>void){const set=events.get(type)??new Set();set.add(listener);events.set(type,set);},
    removeEventListener(type:string,listener:(event:Event)=>void){events.get(type)?.delete(listener);}});
  const control=createOfflineControls(document.asDocument(),port),root=record(control.root),[status,prepare,details]=root.children;
  details!.open=true;for(const listener of events.get('focusin')!)listener({target:details!.children[0]}as unknown as Event);expect(details!.open).toBe(true);
  for(const listener of events.get('pointerdown')!)listener({target:prepare}as unknown as Event);expect(details!.open).toBe(false);
  const remove=details!.children[1]!.children[3]!,confirmation=details!.children[1]!.children[4]!,accept=confirmation.children[1]!,cancel=confirmation.children[2]!;
  expect(remove.hidden).toBe(false);remove.click();expect(confirmation.hidden).toBe(false);expect(port.remove).not.toHaveBeenCalled();cancel.click();expect(confirmation.hidden).toBe(true);
  remove.click();accept.click();await Promise.resolve();expect(port.remove).toHaveBeenCalledOnce();await Promise.resolve();
  prepare!.click();expect(status!.dataset.busy).toBe('true');expect(prepare!.disabled).toBe(true);expect(port.prepare).toHaveBeenCalledOnce();
  control.dispose();const before=status!.textContent;state={phase:'ready',registered:true,message:'late'};notify();finish();await Promise.resolve();expect(status!.textContent).toBe(before);expect(stop).toHaveBeenCalledOnce();expect([...events.values()].every(set=>!set.size)).toBe(true);
});
