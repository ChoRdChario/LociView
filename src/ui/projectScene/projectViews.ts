import type { MetadataEdit } from '../../projectMetadata/commands';
import { editOnly, viewChoices } from './modePresentation';
import type { JsonObject } from '../../domain/values';
import { createViewBackgroundControls } from './viewAuthoringControls';
import { newViewMemory, savedViewChoices, savedViewIssue, viewRuntimeMatches, type ViewContext, type ViewMemory } from './viewState';
import { acceptViewBackground, solidViewBackgroundSource, viewBackgroundPlanIsCurrent, type ViewBackgroundContext, type ViewBackgroundDraft } from './viewBackgroundState';
import { newProjectId, panelNodes, sameProjectValue, type ProjectPanelHost, type ProjectPanel } from './projectPanel';

/** Scene entry recording only. Existing views remain in source/history without a management picker. */
export function createProjectViews(document: Document, host: ProjectPanelHost): ProjectPanel & { cameraControls: HTMLElement } {
  const { make, button }=panelNodes(document),root=make('section'),review=make('section');root.setAttribute('aria-label','視点の作業');review.setAttribute('aria-label','視点の更新候補');
  const choices=new Map<string,{token:string;operationId:string}>(),reviewNodes=new Map<string,HTMLElement>();
  type State={memory:ViewMemory;background:ViewBackgroundDraft|null;backgroundFeedback:ViewBackgroundContext['feedback']};
  const states=new Map<string,State>();let disposed=false;
  const state=()=>{const sceneId=host.source().sceneId;if(!states.has(sceneId))states.set(sceneId,{memory:newViewMemory(sceneId),background:null,backgroundFeedback:{kind:'idle'}});return states.get(sceneId)!;};
  const context=(_owner?:'background'):ViewContext=>{const {provider,sceneId}=host.source(),s=state();return{source:host.ports.views(sceneId,null).source,memory:s.memory,
    runtime:host.viewport().read().view??{kind:'unavailable',token:'',sceneId,projectFrameId:provider.resources.projectFrameId,reason:'3D表示を確認してください。'},
    cameraBlock:host.block('views',false),mutationBlock:host.block('views'),cameraFeedback:{kind:'idle'},entryFeedback:{kind:'idle'}};};
  const backgroundContext=():ViewBackgroundContext=>{const view=context(),scope={sceneId:view.source.sceneId,projectFrameId:view.source.projectFrameId};let source:ViewBackgroundContext['source'];
    try{source=solidViewBackgroundSource(scope,host.viewport().capture().background);}catch(error){source={...scope,kind:'unavailable',token:'',reason:(error as Error).message};}return{view,source,draft:state().background,feedback:state().backgroundFeedback};};
  const recordIssue=()=>{const view=context();if(view.mutationBlock)return view.mutationBlock;if(state().background||choices.size)return '入力を適用するか取り消してください。';
    if(!viewRuntimeMatches(view)||view.runtime.kind!=='ready')return '3D表示を確認してください。';if(view.source.kind!=='ready')return view.source.reason;
    if(view.source.entryViewId.kind!=='value')return '開始視点の更新候補を確認してください。';if(view.source.entryViewId.value){const issue=savedViewIssue(view,view.source.entryViewId.value);if(issue)return issue;}
    if(savedViewChoices(view).some(row=>row.order===null))return '視点の更新候補を確認してください。';return null;};
  const recordEntry=button('開始視点を記録',()=>{if(disposed||recordIssue())return;try{
    const view=context(),{provider,sceneId}=host.source(),before=view.runtime;if(before.kind!=='ready'||view.source.kind!=='ready')return;
    const payload=host.viewport().capture(),after=host.viewport().read().view;if(!after||after.kind!=='ready'||before.token!==after.token||provider.token!==host.source().provider.token||sceneId!==host.source().sceneId)throw Error('表示が変わりました。もう一度記録してください。');
    const viewId=newProjectId('view'),rows=savedViewChoices(view);host.dispatch('views',provider.token,{kind:'createView',makeEntry:true,sceneId,viewId,projectFrameId:view.source.projectFrameId,name:'開始視点',orderKey:host.ports.viewOrder(rows.at(-1)?.order??null,null),camera:payload.camera,background:payload.background,eventId:newProjectId('evt')},()=>{
      const observed=host.ports.views(sceneId,null).source,item=observed.kind==='ready'?observed.views.find(v=>v.id===viewId):undefined;
      if(observed.kind!=='ready'||observed.entryViewId.kind!=='value'||observed.entryViewId.value!==viewId||!item||item.camera.kind!=='value'||item.background.kind!=='value'||!sameProjectValue(item.camera.value,payload.camera)||!sameProjectValue(item.background.value,payload.background))throw Error('開始視点の保存結果を確認できません。');host.message('開始視点を記録しました。');
    });
  }catch(error){host.message((error as Error).message);}host.changed();});
  editOnly(recordEntry);const entryNote=make('p');entryNote.setAttribute('role','status');
  const cameraControls=make('section'),projection=make('select');cameraControls.className='lv-camera-projection';projection.setAttribute('aria-label','投影方式');
  for(const [value,text]of[['perspective','透視投影'],['orthographic','平行投影']]){const option=make('option',text);option.value=value!;projection.append(option);}cameraControls.append(projection);
  projection.addEventListener('change',()=>{if(disposed||projection.disabled)return;const view=context();if(view.cameraBlock||state().background||view.runtime.kind!=='ready'||!viewRuntimeMatches(view))return;try{host.viewport().viewCamera({kind:'projection',projection:projection.value==='orthographic'?'orthographic':'perspective'});}catch(error){host.message((error as Error).message);}host.changed();});
  const background = createViewBackgroundControls(document, event => {
    const s = state(); if (disposed || host.block('views', false)) return;
    if (event.kind === 'draft' && event.baseDraft === s.background) s.background = event.draft;
    else if (event.kind === 'cancel' && event.draft === s.background) s.background = null;
    else if (event.kind === 'background' && viewBackgroundPlanIsCurrent(event, backgroundContext())) {
      try {
        let verified = false;
        host.viewport().background(event.background, () => {
          const observed = backgroundContext(), exact = host.viewport().capture().background;
          if (observed.view.runtime.kind !== 'ready' || acceptViewBackground(event, s.background, { plan: event, source: observed.source, background: exact }))
            throw Error('背景の適用結果を確認できません。入力を保持しています。');
          verified = true;
        });
        if (!verified) throw Error('背景の適用結果を確認できません。'); s.background = null; s.backgroundFeedback = { kind: 'idle' };
      } catch (error) { s.backgroundFeedback = { kind: 'failed', message: (error as Error).message }; }
    }
    host.changed();
  });
  function renderReview() {
    review.replaceChildren(); reviewNodes.clear(); const { provider, sceneId } = host.source(), s = state();
    for (const group of host.ports.viewReview(sceneId)) {
      const box=make('section');box.tabIndex=-1;box.setAttribute('aria-label',group.label);reviewNodes.set(group.key,box);review.append(box);
      const key = `${sceneId}/${group.key}`, owned = choices.get(key), row = make('label', group.label), select = make('select'), empty = make('option', '選択してください'); empty.value = ''; select.append(empty); select.setAttribute('aria-label', group.label);
      for (const item of group.choices) { const option = make('option', item.label); option.value = item.operationId; select.append(option); }
      const block = host.block('views') || s.background;
      select.value = owned?.operationId ?? ''; select.disabled = !!block || !!owned && owned.token !== provider.token;
      select.addEventListener('change', () => { if (!select.disabled) { choices.set(key, { token: provider.token, operationId: select.value }); host.changed(); } }); row.append(select);
      const apply = button('選択を確定', () => {
        if (select.disabled || !owned?.operationId || owned.token !== host.source().provider.token) return;
        const command: MetadataEdit = group.target.kind === 'entry' ? { kind: 'resolveEntryView', sceneId, operationId: owned.operationId } :
          { kind: 'resolveViewField', sceneId, viewId: group.target.viewId, field: group.target.field, choice: { kind: 'candidate', operationId: owned.operationId } };
        host.dispatch('views', provider.token, command, () => { choices.delete(key); host.message('視点の更新候補を確定しました。'); });
      }); editOnly(row, apply); apply.disabled = select.disabled || !owned?.operationId;
      const cancel = button('選択を取り消す', () => { if (!host.block('views', false)) { choices.delete(key); host.changed(); } }); editOnly(cancel); cancel.hidden = !owned; cancel.disabled = !!host.block('views', false); box.append(row, apply, cancel, viewChoices(document, group.label, group.choices.map(item => item.label)));
    }
  }
  const content=make('div');content.className='lv-camera-position-content';content.append(recordEntry,entryNote,background.root,review);root.append(content,background.actions,background.confirmation);
  return{root,cameraControls,render(){if(disposed)return;const view=context(),issue=recordIssue();recordEntry.disabled=!!issue;recordEntry.textContent=view.source.kind==='ready'&&view.source.entryViewId.kind==='value'&&view.source.entryViewId.value?'開始視点を更新':'開始視点を記録';entryNote.textContent=issue??'';entryNote.hidden=!issue||host.ports.mode==='view';
    projection.disabled=!!view.cameraBlock||!!state().background||view.runtime.kind!=='ready'||!viewRuntimeMatches(view);projection.value=view.runtime.kind==='ready'?view.runtime.projection:'';background.render(backgroundContext());renderReview();},
    hasChanges:()=>!!state().background||choices.size>0,composing:()=>!!state().background?.composing,dispose(){disposed=true;background.dispose();cameraControls.remove();root.remove();}};
}
