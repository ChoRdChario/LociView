import type { MetadataEdit } from '../../projectMetadata/commands';
import { editOnly, viewChoices } from './modePresentation';
import { createMaterialControls } from './materialControls';
import { materialPlanIsCurrent, materialView, newMaterialSelection, type MaterialContext, type MaterialDraft, type MaterialSelection } from './materialState';
import { newProjectId, panelNodes, sameProjectValue, type ProjectPanelHost, type ProjectPanel } from './projectPanel';

export function createProjectMaterials(document: Document, host: ProjectPanelHost): ProjectPanel {
  const { make, button } = panelNodes(document), root = make('section'), review = make('section');
  root.setAttribute('aria-label', '材質の作業'); review.setAttribute('aria-label', '材質の更新候補');
  const states = new Map<string, { selection: MaterialSelection; draft: MaterialDraft | null; followedModel?: string | null }>();
  const choices = new Map<string, { token: string; appearance?: string; compositing?: string; owner?: string }>();
  let disposed = false;
  const state = () => { const key = host.source().sceneId; if (!states.has(key)) states.set(key, { selection: newMaterialSelection(), draft: null }); return states.get(key)!; };
  const context = (): MaterialContext => ({ source: host.ports.materials(host.source().sceneId).source, ...state(),
    pending: null, mutationBlock: host.block('materials') || (choices.size ? '更新候補の選択を確定するか、取り消してください。' : null), feedback: { kind: 'idle' } });
  const controls = createMaterialControls(document, plan => {
    const local = plan.kind === 'cancel' || plan.kind === 'select' || plan.kind === 'draft' && plan.baseDraft !== null;
    if (disposed || host.block('materials', !local) || !materialPlanIsCurrent(plan, context())) return;
    const owned = state();
    if (plan.kind === 'select') owned.selection = plan.selection;
    else if (plan.kind === 'draft') owned.draft = plan.draft;
    else if (plan.kind === 'cancel') owned.draft = null;
    else if (plan.kind === 'review') host.message('下の更新候補で残す内容を選択してください。');
    else if (plan.kind === 'apply' || plan.kind === 'remove') {
      const recordId = plan.recordId ?? newProjectId('ovr');
      const command: MetadataEdit = plan.kind === 'remove' ? { kind: 'resetMaterial', sceneId: plan.sceneId, overrideId: recordId, eventId: newProjectId('evt') } :
        plan.recordId ? { kind: 'editMaterial', sceneId: plan.sceneId, overrideId: recordId, appearance: plan.intent.appearance, compositing: plan.intent.compositing } :
          { kind: 'createMaterial', sceneId: plan.sceneId, overrideId: recordId,
            routing: { target: { ...plan.selection.target! }, scope: plan.selection.scope === 'scene' ? { kind: 'scene', sceneId: plan.sceneId } : { kind: 'project' } },
            appearance: plan.intent.appearance, compositing: plan.intent.compositing, eventId: newProjectId('evt') };
      host.dispatch('materials', plan.token, command, () => {
        const observed = materialView(context());
        if (plan.kind === 'apply' && (observed.record?.id !== recordId || observed.record.intent.kind !== 'value' || !sameProjectValue(observed.record.intent.value, plan.intent)))
          throw Error('適用結果を確認できません。入力を保持しています。');
        if (plan.kind === 'remove' && observed.record?.id === recordId) throw Error('解除結果を確認できません。');
        owned.draft = null; host.message(plan.kind === 'apply' ? '材質の設定を適用しました。' : '材質の設定を解除しました。');
      });
    }
    host.changed();
  });
  root.append(controls.root, review);
  function render() {
    if (disposed) return;
    const s=state(), selected=host.selectedModel?.(), source=context().source;
    if(host.selectedModel && !s.draft && !choices.size && !host.block('materials',false) && source.kind==='ready'){
      const eligible=source.models.filter(m=>!m.reason && m.surfaces.kind==='value');
      const follow=selected && selected!==s.followedModel ? source.models.find(m=>m.assetId===selected) : !s.selection.assetId && eligible.length===1 ? eligible[0] : undefined;
      if(follow){const surfaces=follow.surfaces.kind==='value'?follow.surfaces.value:[];
        s.selection={assetId:follow.assetId,target:surfaces.length===1?surfaces[0]!.target:null,scope:s.selection.scope};}
      s.followedModel=selected;
    }
    controls.render(context(), { viewing: host.ports.mode === 'view', readBlock: host.block('materials', false) }); review.replaceChildren();
    const { provider, sceneId } = host.source(), groups = host.ports.materials(sceneId).review;
    for (const group of groups) {
      const box = make('fieldset'), label = make('legend', group.label); box.append(label);
      const key = `${sceneId}/${group.key}`, owned = choices.get(key), blocked = host.block('materials') || (state().draft ? '材質の入力を確定してください。' : null);
      const choose = (name: 'appearance' | 'compositing' | 'owner', label: string, values: readonly { id: string; label: string }[]) => {
        const row = make('label', label), select = make('select'), empty = make('option', '選択してください'); empty.value = ''; select.append(empty);
        select.setAttribute('aria-label', label);
        for (const item of values) { const option = make('option', item.label); option.value = item.id; select.append(option); }
        select.value = owned?.[name] ?? (name !== 'owner' && values.length === 1 ? values[0]!.id : '');
        select.disabled = !!blocked || !!owned && owned.token !== provider.token;
        select.addEventListener('change', () => {
          if (select.disabled || provider.token !== host.source().provider.token) return;
          choices.set(key, { ...owned, token: provider.token, [name]: select.value }); host.changed();
        }); row.append(select); editOnly(row); box.append(row, viewChoices(document, label, values.map(item => item.label))); return select.value;
      };
      if (group.appearance.length > 1 || group.compositing.length > 1) {
        const appearance = choose('appearance', '残す見え方', group.appearance.map(a => ({ id: a.operationId, label: a.label })));
        const compositing = choose('compositing', '残す被覆・光学', group.compositing.map(a => ({ id: a.operationId, label: a.label })));
        const apply = button('選択を確定', () => {
          if (host.block('materials') || state().draft || provider.token !== host.source().provider.token || !appearance || !compositing) return;
          host.dispatch('materials', group.token, { kind: 'resolveMaterialIntent', sceneId, overrideId: group.overrideId,
            appearanceOperationId: appearance, compositingOperationId: compositing }, () => { choices.delete(key); host.message('材質の更新候補を確定しました。'); });
        }); editOnly(apply); apply.disabled = !!blocked || !appearance || !compositing || !!owned && owned.token !== provider.token; box.append(apply);
      }
      if (group.owners.length > 1) {
        const owner = choose('owner', '残す設定', group.owners);
        box.append(make('p', '選ばなかった重複設定は解除され、履歴に残ります。'));
        const keep = button('選んだ設定を残す', () => {
          if (host.block('materials') || state().draft || provider.token !== host.source().provider.token || !owner) return;
          host.dispatch('materials', group.token, { kind: 'resolveMaterialDuplicates', sceneId, overrideId: owner,
            observedOverrideIds: group.owners.map(o => o.id), eventId: newProjectId('evt') }, () => { choices.delete(key); host.message('重複する設定を整理しました。'); });
        }); editOnly(keep); keep.disabled = !!blocked || !owner || !!owned && owned.token !== provider.token; box.append(keep);
      }
      const cancel = button('選択を取り消す', () => { if (!host.block('materials', false)) { choices.delete(key); host.changed(); } });
      editOnly(cancel); cancel.hidden = !owned; cancel.disabled = !!host.block('materials', false); box.append(cancel); review.append(box);
    }
  }
  return { root, render, hasChanges: () => !!state().draft || choices.size > 0,
    composing: () => !!state().draft?.composing || controls.isComposing(),
    dispose() { disposed = true; controls.dispose(); root.remove(); } };
}
