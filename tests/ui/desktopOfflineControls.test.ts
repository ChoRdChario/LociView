import {expect,it,vi} from 'vitest';
import {createOfflineControls,createOfflineSettings} from '../../src/ui/projectScene/offlineControls';
import type {DesktopOfflinePort,DesktopOfflineState} from '../../src/platform/desktopOfflinePorts';
import {RecordedDocument,record} from './domRecorder';

it('keeps preparation local, confirms removal and ignores late results after disposal',async()=>{
  let state:DesktopOfflineState={phase:'error',registered:true,message:'準備を確認できません。'},notify=()=>{};
  let finish!:()=>void;const stop=vi.fn();
  const port:DesktopOfflinePort={read:()=>state,subscribe:f=>{notify=f;return stop;},recheck:vi.fn(async()=>{}),prepare:vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})),remove:vi.fn(async()=>{}),install:vi.fn(async()=>{}),installAvailable:()=>false};
  const events=new Map<string,Set<(event:Event)=>void>>(),document=Object.assign(new RecordedDocument(),{
    addEventListener(type:string,listener:(event:Event)=>void){const set=events.get(type)??new Set();set.add(listener);events.set(type,set);},
    removeEventListener(type:string,listener:(event:Event)=>void){events.get(type)?.delete(listener);}});
  const control=createOfflineControls(document.asDocument(),port),root=record(control.root),[status,details]=root.children,prepare=details!.children[1]!.children[0]!;
  const settings=createOfflineSettings(document.asDocument(),control.root);expect(record(settings.body).children).toContain(root);
  details!.open=true;for(const listener of events.get('focusin')!)listener({target:details!.children[0]}as unknown as Event);expect(details!.open).toBe(true);
  for(const listener of events.get('pointerdown')!)listener({target:status}as unknown as Event);expect(details!.open).toBe(false);
  const remove=details!.children[1]!.children[4]!,confirmation=details!.children[1]!.children[5]!,accept=confirmation.children[1]!,cancel=confirmation.children[2]!;
  expect(confirmation.children[0]!.textContent).toContain('同じアプリ');expect(confirmation.children[0]!.textContent).not.toMatch(/静的|再配信|従来版へ戻る/);
  const escape={key:'Escape',isComposing:true,preventDefault:vi.fn(),stopPropagation:vi.fn()};details!.open=true;details!.fire('keydown',escape);expect(details!.open).toBe(true);
  details!.fire('keydown',{...escape,isComposing:false});expect(details!.open).toBe(false);expect(escape.stopPropagation).toHaveBeenCalledOnce();
  expect(remove.hidden).toBe(false);remove.click();expect(confirmation.hidden).toBe(false);expect(port.remove).not.toHaveBeenCalled();cancel.click();expect(confirmation.hidden).toBe(true);
  remove.click();accept.click();await Promise.resolve();expect(port.remove).toHaveBeenCalledOnce();await Promise.resolve();
  prepare!.click();expect(status!.dataset.busy).toBe('true');expect(prepare!.disabled).toBe(true);expect(port.prepare).toHaveBeenCalledOnce();
  settings.dispose();expect(stop).not.toHaveBeenCalled();control.dispose();const before=status!.textContent;state={phase:'ready',registered:true,message:'late'};notify();finish();await Promise.resolve();expect(status!.textContent).toBe(before);expect(stop).toHaveBeenCalledOnce();expect([...events.values()].every(set=>!set.size)).toBe(true);
});

it('keeps cache-state diagnosis secondary and does not request network preparation for it',async()=>{
  const state:DesktopOfflineState={phase:'ready',registered:true,message:'ready'};
  const port:DesktopOfflinePort={read:()=>state,subscribe:()=>()=>{},recheck:vi.fn(async()=>{}),prepare:vi.fn(async()=>{}),remove:vi.fn(async()=>{}),install:vi.fn(async()=>{}),installAvailable:()=>false};
  const document=Object.assign(new RecordedDocument(),{addEventListener(){},removeEventListener(){}}),control=createOfflineControls(document.asDocument(),port),root=record(control.root),body=root.children[1]!.children[1]!,diagnostics=body.children[2]!;
  expect(body.children[0]!.textContent).toBe('更新を確認');expect(diagnostics.tag).toBe('details');expect(diagnostics.open).toBe(false);expect(diagnostics.children[1]!.textContent).toBe('準備状態を確認');
  diagnostics.open=true;diagnostics.children[1]!.click();await Promise.resolve();expect(port.recheck).toHaveBeenCalledOnce();expect(port.prepare).not.toHaveBeenCalled();control.dispose();
});
