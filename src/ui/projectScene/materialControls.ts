import { materialFields, materialFieldLabels, materialInput,editMaterialIntent, type MaterialEditField } from '../../domain/materialIntent';
import { editMaterialDraft, materialApplyIssue, materialPlanIsCurrent, materialScopeLabel, materialSelectionKey, materialTargetKey,
  materialView, planMaterial, type MaterialContext, type MaterialDraft, type MaterialEffect, type MaterialIntentRequest, type MaterialPlan, type MaterialSelection } from './materialState';

import { contextHelp, mountContextHelp } from './contextHelp';
import { editOnly, viewOnly } from './modePresentation';

let nextMaterialControl = 0;
/** Disconnected static controls; emits intentions, never dispatches or applies a renderer fallback. */
export function createMaterialControls(document: Document, onPlan: (plan: MaterialPlan) => void) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const button = (text: string) => { const node = make('button', text); node.type = 'button'; return node; };
  const root = make('section'); root.className = 'lv-material-editor'; root.setAttribute('aria-label', '材質');
  const choices = make('div'); choices.className = 'lv-material-target';
  const select = (label: string) => { const wrapper = make('label', label), input = make('select'); input.setAttribute('aria-label', label); wrapper.append(input); choices.append(wrapper); return input; };
  const model = select('モデル'), surface = select('面'), scope = select('適用範囲');
  const optionSignatures = new WeakMap<HTMLSelectElement, string>();
  const options = (input: HTMLSelectElement, values: readonly (readonly [string, string])[], selected: string) => {
    const key = JSON.stringify(values); if (optionSignatures.get(input) !== key) {
      input.replaceChildren(...values.map(([value, label]) => { const option = make('option', label); option.value = value; return option; })); optionSignatures.set(input, key);
    }
    input.value = selected;
  };
  options(scope, [['scene', 'このシーンだけ'], ['project', 'プロジェクト共通']], 'scene');
  const status = make('p'); status.id = `lv-material-status-${++nextMaterialControl}`; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const observed = make('p'), impact = make('p'), unavailable = make('p'), begin = button('設定を編集'), editor = make('div'); editor.className = 'lv-material-fields';
  const controls = new Map<MaterialEditField, { group: HTMLLabelElement; input: HTMLInputElement | HTMLSelectElement; note: HTMLParagraphElement }>();
  const reading = make('dl'); reading.className = 'lv-material-values'; viewOnly(reading);
  const values = new Map<MaterialEditField, { group: HTMLElement; value: HTMLElement; note: HTMLElement }>();
  const cleanups: (() => void)[] = []; let context: MaterialContext | undefined, disposed = false, composing: MaterialEditField | null = null;
  cleanups.push(mountContextHelp(document, root));
  let confirmation: { kind: 'cancel'; draft: MaterialDraft } | { kind: 'remove'; plan: Extract<MaterialEffect, { kind: 'remove' }> } | null = null;
  const listen = (node: HTMLElement, event: string, handler: () => void) => { node.addEventListener(event, handler); cleanups.push(() => node.removeEventListener(event, handler)); };
  const send = (plan: MaterialPlan) => { if (disposed || !context) return; if (plan.kind === 'blocked') { status.textContent = plan.reason; status.hidden = false; } else onPlan(plan); };
  const request = (intent: MaterialIntentRequest) => {
    if (!context) return; const plan = planMaterial(context, intent);
    // Restore observed selection before reporting intent, including refused placeholders.
    model.value = context.selection.assetId ?? ''; surface.value = context.selection.target ? materialTargetKey(context.selection.target) : ''; scope.value = context.selection.scope;
    send(plan);
  };
  listen(model, 'change', () => request({ kind: 'model', assetId: model.value || null }));
  listen(surface, 'change', () => request({ kind: 'surface', key: surface.value }));
  listen(scope, 'change', () => request({ kind: 'scope', scope: scope.value as 'scene' | 'project' }));
  listen(begin, 'click', () => { if (!begin.disabled) request({ kind: 'begin' }); });
  const enums: Partial<Record<MaterialEditField, readonly (readonly [string, string])[]>> = {
    lighting: [['inherit', '元の設定'], ['lit', '照明あり'], ['unlit', '照明なし']],
    doubleSided: [['inherit', '元の設定'], ['front', '片面'], ['double', '両面']], chroma: [['off', '無効'], ['on', '有効']],
    coverage: [['inherit', '元の設定'], ['opaque', '不透明'], ['mask', '切り抜き']],
  };
  function updateDraft(field: MaterialEditField, input: HTMLInputElement | HTMLSelectElement) {
    if (!context?.draft || disposed || input.disabled || ('readOnly' in input && input.readOnly)) return;
    send({ kind: 'draft', baseDraft: context.draft, draft: editMaterialDraft(context.draft, field, input.value, composing) });
  }
  for (const field of materialFields) {
    const group = make('label', materialFieldLabels[field]), input = enums[field] ? make('select') : make('input'), note = make('p');
    input.setAttribute('aria-label', materialFieldLabels[field]); note.id = `lv-material-field-${++nextMaterialControl}`;
    input.setAttribute('aria-describedby', `${note.id} ${status.id}`);
    if (enums[field]) options(input as HTMLSelectElement, enums[field]!, '');
    else { (input as HTMLInputElement).type = 'text'; input.setAttribute('inputmode', field === 'keyColor' ? 'text' : 'decimal'); }
    group.append(input, note); editor.append(group); controls.set(field, { group, input, note });
    const row = make('div'), value = make('dd'), warning = make('p'); row.setAttribute('data-material-field', field);
    row.append(make('dt', materialFieldLabels[field]), value, warning); reading.append(row); values.set(field, { group: row, value, note: warning });
    listen(input, enums[field] ? 'change' : 'input', () => updateDraft(field, input));
    if (!enums[field]) {
      listen(input, 'compositionstart', () => { if (!context?.draft || input.disabled || (input as HTMLInputElement).readOnly) return;
        composing = field; updateDraft(field, input); });
      listen(input, 'compositionend', () => { if (composing !== field) return; updateDraft(field, input); composing = null;
        if (context?.draft) send({ kind: 'draft', baseDraft: context.draft, draft: Object.freeze({ ...context.draft, composing: null }) }); });
    }
  }
  const coverageHelp=contextHelp(document, '切り抜きでは、しきい値を下回る部分を非表示にします。滑らかな半透明にはなりません。', [controls.get('coverage')!.input]);
  const advanced=make('details'); advanced.append(make('summary','色の透過と詳細'));
  for(const field of ['chroma','keyColor','tolerance','softness','cutoff'] as const) advanced.append(controls.get(field)!.group);
  editor.append(advanced,coverageHelp);
  const actions = make('div'), apply = button('変更を適用'), cancel = button('取り消す'), remove = button('この範囲の設定を解除'), retry = button('再試行'), review = button('状態を確認');
  actions.className = 'lv-material-actions'; apply.className = 'lv-material-primary'; actions.append(apply, cancel, remove, retry, review);
  const confirmBox = make('section'), confirmText = make('p'), confirm = button(''), keep = button('戻る'); confirmBox.setAttribute('aria-label', '操作の確認'); confirmBox.hidden = true; confirmBox.append(confirmText, confirm, keep);
  root.append(choices, status, observed, impact, unavailable, begin, editor, actions, confirmBox);
  root.append(reading);
  editOnly(begin, editor, apply, cancel, remove, retry, review, confirmBox);
  listen(apply, 'click', () => { if (!apply.disabled) request({ kind: 'apply' }); });
  listen(retry, 'click', () => { if (!retry.disabled) request({ kind: 'retry' }); });
  listen(review, 'click', () => {
    if (!context) return;
    if (context.feedback.kind === 'failed') send({ kind: 'review', token: context.source.token, projectId: context.source.projectId, sceneId: context.source.sceneId, selection: context.feedback.plan.selection });
    else request({ kind: 'review' });
  });
  listen(cancel, 'click', () => {
    if (!context?.draft || cancel.disabled) return; confirmation = { kind: 'cancel', draft: context.draft };
    confirmText.textContent = '入力中の変更を取り消しますか？'; confirm.textContent = '変更を取り消す'; confirmBox.hidden = false; confirm.focus({ preventScroll: true });
  });
  listen(remove, 'click', () => {
    if (!context || remove.disabled) return; const plan = planMaterial(context, { kind: 'remove' });
    if (plan.kind !== 'remove') { send(plan); return; } confirmation = { kind: 'remove', plan };
    confirmText.textContent = `${materialScopeLabel(plan.selection.scope)}の設定を解除します。${materialView(context).fallback}`;
    confirm.textContent = '設定を解除する'; confirmBox.hidden = false; confirm.focus({ preventScroll: true });
  });
  listen(keep, 'click', () => { const button = confirmation?.kind === 'remove' ? remove : cancel; confirmation = null; confirmBox.hidden = true; button.focus({ preventScroll: true }); });
  listen(confirm, 'click', () => {
    if (!context || !confirmation || composing) return;
    const plan: MaterialPlan = confirmation.kind === 'remove' ? confirmation.plan : { kind: 'cancel', draft: confirmation.draft };
    if (!materialPlanIsCurrent(plan, context)) { status.textContent = '状態が変わっています。操作を確認してください。'; return; }
    confirmation = null; confirmBox.hidden = true; send(plan);
  });
  function describe(selection: MaterialSelection, view: ReturnType<typeof materialView>) {
    const model = view.models.find(item => item.assetId === selection.assetId), surfaces = model?.surfaces.kind === 'value' ? model.surfaces.value : [];
    const surface = selection.target && surfaces.find(item => materialTargetKey(item.target) === materialTargetKey(selection.target!));
    return [model?.name.kind === 'value' ? model.name.value : '対象のモデル', surface && surface.name.kind === 'value' ? surface.name.value : '対象の面', materialScopeLabel(selection.scope)].join(' / ');
  }
  function render(next: MaterialContext, presentation?: { viewing: boolean; readBlock: string | null }): boolean {
    if (disposed) return false;
    if (context && (context.draft || composing || context.feedback.kind === 'applying') &&
      (context.source.projectId !== next.source.projectId || context.source.sceneId !== next.source.sceneId || materialSelectionKey(context.selection) !== materialSelectionKey(next.selection))) {
      status.textContent = '編集中の変更を適用するか取り消してください。'; status.hidden = false; return false;
    }
    context = next; const view = materialView(next), d = next.draft, inFlight = next.feedback.kind === 'applying';
    const emptyCatalog = view.model?.surfaces.kind === 'value' && !view.model.surfaces.value.length && !view.model.reason;
    const unsupported = !!view.surface && !view.targetIssue && Object.values(view.surface.fieldIssues).every(reason => reason !== null);
    const noSettings = view.surface?.scene.kind === 'value' && view.surface.scene.value === null && view.surface.project.kind === 'value' && view.surface.project.value === null;
    const noControls = !d && (emptyCatalog || unsupported);
    unavailable.textContent = !noControls ? '' : emptyCatalog || noSettings ? 'このモデルには材質の調整項目がありません。元の表示を保持します。' : view.base ? 'この材質は調整できません。現在の設定を表示しています。' : '材質の状態を確認してください。';
    unavailable.hidden = !noControls;
    const sourceOnlySurface = unsupported && noSettings && view.surfaces.length === 1;
    surface.parentElement!.hidden = scope.parentElement!.hidden = !d && (emptyCatalog || sourceOnlySurface);
    if (confirmation && !materialPlanIsCurrent(confirmation.kind === 'remove' ? confirmation.plan : { kind: 'cancel', draft: confirmation.draft }, next)) { confirmation = null; confirmBox.hidden = true; }
    const modelOptions: [string, string][] = [['', 'モデルを選択'], ...view.models.map(item => [item.assetId, item.name.kind === 'value' ? item.name.value : 'モデル名を確認'] as [string, string])];
    if (next.selection.assetId && !view.model) modelOptions.push([next.selection.assetId, '選択したモデルを確認']);
    options(model, modelOptions, next.selection.assetId ?? '');
    const key = next.selection.target ? materialTargetKey(next.selection.target) : '';
    const surfaceOptions: [string, string][] = [['', '面を選択'], ...view.surfaces.map(item => [materialTargetKey(item.target), item.name.kind === 'value' ? item.name.value : '面の名前を確認'] as [string, string])];
    if (key && !view.surface) surfaceOptions.push([key, '選択した面を確認']); options(surface, surfaceOptions, key); scope.value = next.selection.scope;
    for (const control of [model, surface, scope]) control.disabled = Boolean(d || composing || inFlight || next.pending || view.issue);
    observed.textContent = sourceOnlySurface && !d ? '' : view.surface ? view.origin ? `現在の見え方：${view.origin === 'source' ? 'モデル元の設定' : materialScopeLabel(view.origin)}` : '現在の見え方を確認してください。' : '';
    impact.textContent = !view.surface || noControls || presentation?.viewing ? '' : next.selection.scope === 'scene' ? 'このシーンだけに適用します。'
      : '同じモデル・面を使うシーンで共通になります。シーン専用の設定がある場合は、そちらが優先されます。';
    const beginPlan = planMaterial(next, { kind: 'begin' }); begin.hidden = Boolean(d) || noControls; begin.disabled = beginPlan.kind === 'blocked';
    const base = d?.base ?? view.base, raw = (field: MaterialEditField) => d?.edits[field] ?? (base ? materialInput(base.appearance, field, next.source.semanticProfile, base.compositing) : '');
    if(raw('coverage')==='mask'||raw('chroma')==='on'||d && ['chroma','keyColor','tolerance','softness','cutoff'].some(field=>d.edits[field as MaterialEditField]!==undefined))advanced.open=true;
    const coverageChoices=next.source.semanticProfile==='map2'?[...enums.coverage!,['smoothBlend','半透明']as const]:enums.coverage!;
    editor.hidden = !base || noControls || !d; reading.hidden = !d && (emptyCatalog || unsupported && noSettings);
    reading.dataset.noneditable = String(!d && !reading.hidden);
    for (const [field, control] of controls) {
      const value = raw(field);
      if (field === 'coverage') options(control.input as HTMLSelectElement, coverageChoices.some(([key]) => key === value) ? coverageChoices :
        [...coverageChoices, [value, value === 'smoothBlend' ? '半透明（この環境では未対応）' : '現在の設定（この環境では未対応）']], value);
      if (composing !== field && d?.composing !== field && control.input.value !== value) control.input.value = value;
      const reason = view.surface?.fieldIssues[field], enabled = d && reason === null && !inFlight && next.mutationBlock === null && !next.pending && !view.editIssue;
      control.input.disabled = enums[field] ? !enabled : false;
      if (!enums[field]) (control.input as HTMLInputElement).readOnly = composing !== field && !enabled;
      // Keep all fields with retained input visible even after capability loss or disabling chroma.
      control.group.hidden = ['keyColor', 'tolerance', 'softness'].includes(field) && raw('chroma') !== 'on' && d?.edits[field] === undefined && composing !== field;
      if (field === 'cutoff') control.group.hidden = raw('coverage') !== 'mask' && d?.edits.cutoff === undefined;
      control.note.textContent = reason ?? ''; control.note.hidden = !control.note.textContent;
      const current = values.get(field)!, canonical = view.base ? materialInput(view.base.appearance, field, next.source.semanticProfile, view.base.compositing) : '';
      const choices = field === 'coverage' ? coverageChoices : enums[field];
      current.value.textContent = choices?.find(([key]) => key === canonical)?.[1] ?? canonical;
      current.note.textContent = reason ?? ''; current.note.hidden = !reason || noControls && new Set(Object.values(view.surface!.fieldIssues)).size === 1;
      const inactive = view.base && (['keyColor', 'tolerance', 'softness'].includes(field) && materialInput(view.base.appearance, 'chroma', next.source.semanticProfile, view.base.compositing) !== 'on' ||
        field === 'cutoff' && materialInput(view.base.appearance, 'coverage', next.source.semanticProfile, view.base.compositing) !== 'mask');
      current.group.hidden = !view.base || !!inactive && !reason;
    }
    const applyIssue = materialApplyIssue(next); apply.disabled = applyIssue !== null; apply.hidden = !d;
    cancel.hidden = !d; cancel.disabled = !d || Boolean(composing || d.composing) || inFlight;
    remove.disabled = planMaterial(next, { kind: 'remove' }).kind !== 'remove'; remove.hidden = !view.record && !d;
    retry.hidden = next.feedback.kind !== 'failed'; retry.disabled = next.feedback.kind !== 'failed' || !materialPlanIsCurrent(next.feedback.plan, next);
    let displayNotice:string|null=null;try{if(base)displayNotice=view.surface?.displayNotice?.(d?editMaterialIntent(base,d.edits,next.source.semanticProfile):base)??null;}catch{/* Invalid draft retains its normal field/apply error. */}
    status.textContent = [emptyCatalog && !d ? null : view.targetIssue, ...view.issues, displayNotice, presentation?.viewing ? presentation.readBlock : next.mutationBlock, next.pending && 'ほかの操作を完了するか取り消してください。',
      inFlight && '設定を適用中です。', d && !inFlight && (applyIssue || '未適用の入力があります。'),
      next.feedback.kind === 'failed' && `${describe(next.feedback.plan.selection, view)}：${next.feedback.plan.kind === 'remove' ? '設定を解除' : '変更を適用'}できませんでした。${next.feedback.message} 入力と操作対象を保持しています。`].filter(Boolean).join(' ');
    status.hidden = !status.textContent; return true;
  }
  return { root, review, render, isComposing: () => composing !== null, dispose: () => { disposed = true; cleanups.forEach(fn => fn()); root.remove(); } };
}
