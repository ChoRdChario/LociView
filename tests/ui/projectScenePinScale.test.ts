import {expect,it,vi} from 'vitest';
import {createProjectPinScale} from '../../src/ui/projectScene/projectPinScale';
import type {ProjectPanelHost} from '../../src/ui/projectScene/projectPanel';
import {RecordedDocument,record,type RecordedNode} from './domRecorder';

function fixture(ids=['a']){
  const document=new RecordedDocument(),active=(state='active')=>({kind:'value',value:{state,eventId:'evt'}});
  const provider:any={token:'one',semanticProfile:'map2',issues:[],resources:{assets:Object.fromEntries([...ids,'deleted'].map(id=>[id,{id,lifecycle:active(id==='deleted'?'deleted':'active')}]))},
    details:{mutable:{assetsById:Object.fromEntries([...ids,'deleted'].map(id=>[id,{label:{kind:'value',value:id},pinScale:{kind:'value',value:1}}]))}}};
  let sceneId='scene',blocked=false;const dispatch=vi.fn();let panel:ReturnType<typeof createProjectPinScale>;
  const host={source:()=>({provider,sceneId}),block:(_owner:string,writes=true)=>blocked&&writes?'閲覧中':null,changed:()=>panel.render(),dispatch,message:vi.fn()} as unknown as ProjectPanelHost;
  panel=createProjectPinScale(document.asDocument(),host);panel.render();const root=record(panel.root),all=(node:RecordedNode):RecordedNode[]=>[node,...node.children.flatMap(all)],named=(name:string)=>all(root).find(node=>node.getAttribute('aria-label')===name)!,button=(name:string)=>all(root).find(node=>node.tag==='button'&&node.textContent===name)!;
  return{panel,root,provider,dispatch,named,button,changeScene(value:string){sceneId=value;panel.render();},view(){blocked=true;panel.render();}};
}
it('opens one active model directly, excludes deleted targets and keeps the whole control edit-only',()=>{
  const h=fixture(),model=h.named('ピンのモデル');expect(h.root.getAttribute('data-lv-edit-only')).toBe('');expect(model.children.map(n=>n.value)).toEqual(['','a']);
  h.root.open=true;h.root.fire('toggle');expect(model.value).toBe('a');expect(h.named('ピンの表示倍率').value).toBe('1');expect(h.panel.hasChanges()).toBe(false);
  h.view();expect(h.named('ピンの表示倍率').disabled).toBe(true);expect(h.button('倍率を適用').disabled).toBe(true);expect(h.dispatch).not.toHaveBeenCalled();h.panel.dispose();
});
it('requires an explicit model among several, retains stale raw input and cancels without following another target',()=>{
  const h=fixture(['a','b']),model=h.named('ピンのモデル'),input=h.named('ピンの表示倍率');h.root.open=true;h.root.fire('toggle');expect(model.value).toBe('');
  model.value='b';model.fire('change');input.fire('focus');input.value='2.5';input.fire('input');expect(h.panel.hasChanges()).toBe(true);expect(model.disabled).toBe(true);
  h.provider.resources.assets.b.lifecycle={kind:'value',value:{state:'deleted',eventId:'evt2'}};h.provider.token='two';h.panel.render();expect(input.value).toBe('2.5');expect(model.value).toBe('b');expect(h.button('倍率を適用').disabled).toBe(true);expect(h.button('倍率の変更を取り消す').disabled).toBe(false);
  h.button('倍率を適用').fire('click');expect(h.dispatch).not.toHaveBeenCalled();h.button('倍率の変更を取り消す').fire('click');expect(h.panel.hasChanges()).toBe(false);expect(model.value).toBe('b');h.panel.dispose();
});
it('keeps IME and Scene guards around the same Asset-wide Session command',()=>{
  const h=fixture();h.root.open=true;h.root.fire('toggle');const input=h.named('ピンの表示倍率');input.fire('focus');input.fire('compositionstart');input.value='2';input.fire('input');expect(h.button('倍率を適用').disabled).toBe(true);input.fire('compositionend');
  h.button('倍率を適用').fire('click');expect(h.dispatch).toHaveBeenCalledWith('captions','one',{kind:'setAssetPinScale',assetId:'a',pinScale:2},expect.any(Function));
  h.changeScene('other');expect(input.value).toBe('2');expect(h.button('倍率を適用').disabled).toBe(true);h.panel.dispose();
});
