import { describe, expect, it } from 'vitest';
import { value, type Field, type MaterialTarget } from '../../src/scene/types';
import { materialFields, materialInput, validateMaterialIntent, type MaterialIntent, type MaterialEditField } from '../../src/domain/materialIntent';
import { acceptMaterialApply, editMaterialDraft, materialApplyIssue, materialPlanIsCurrent, materialTargetKey, materialView,
  newMaterialSelection, planMaterial, type MaterialContext, type MaterialEffect, type MaterialPlan, type MaterialSurfacePort } from '../../src/ui/projectScene/materialState';
import { createMaterialControls } from '../../src/ui/projectScene/materialControls';
import { RecordedDocument, record } from './domRecorder';

const id = (prefix: string, n: number) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
const project = id('prj', 1), scene = id('scn', 1), asset = id('ast', 1), other = id('ast', 2);
const target: MaterialTarget = Object.freeze({ assetId: asset, variantFamilyId: id('fam', 1), materialLayoutId: id('lay', 1), logicalMaterialSlotId: id('slot', 1) });
const limits = { maxNodes: 1000, maxDepth: 12, maxStringScalars: 1000 };
const intent = (appearance: unknown = {}, coverage = 'inherit') => validateMaterialIntent({ appearance, compositing: { coverage: { policy: coverage }, optics: 'inherit' }, future: { keep: true } }, limits);
const unresolved = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
function surface(): MaterialSurfacePort {
  return { target, name: value('外側'), sourceIntent: value(intent()), scene: value(null),
    project: value({ id: id('ovr', 1), target, scope: 'project', sceneId: null, intent: value(intent({ opacity: 0.4, doubleSided: true,
      chroma: { keyColorSrgb: [0.123456, 0.234567, 0.345678], tolerance: 0.1, softness: 0 } })) }),
    fieldIssues: Object.fromEntries(materialFields.map(field => [field, null])) as Record<MaterialEditField, null>, admit: () => null };
}
function fixture(selected = true, item = surface()): MaterialContext {
  return { source: { kind: 'ready', token: 'snapshot-1', projectId: project, sceneId: scene, limits, models: [
    { assetId: asset, name: value('試験モデル'), surfaces: value([item]), reason: null },
    { assetId: other, name: value('点群'), surfaces: value([]), reason: 'このモデルには編集できる面がありません。' }] },
    selection: selected ? Object.freeze({ assetId: asset, target, scope: 'scene' }) : newMaterialSelection(),
    draft: null, pending: null, mutationBlock: null, feedback: { kind: 'idle' } };
}
function applyLocal(context: MaterialContext, plan: MaterialPlan): MaterialContext {
  expect(materialPlanIsCurrent(plan, context)).toBe(true);
  if (plan.kind === 'draft') return { ...context, draft: plan.draft };
  if (plan.kind === 'select') return { ...context, selection: plan.selection };
  if (plan.kind === 'cancel') return { ...context, draft: null };
  throw Error('not local');
}
function editing(context = fixture()): MaterialContext { return applyLocal(context, planMaterial(context, { kind: 'begin' })); }
function edit(context: MaterialContext, field: MaterialEditField, raw: string): MaterialContext {
  return applyLocal(context, { kind: 'draft', baseDraft: context.draft, draft: editMaterialDraft(context.draft!, field, raw) });
}
function effect(context: MaterialContext, kind: 'apply' | 'remove'): MaterialEffect {
  const plan = planMaterial(context, { kind }); expect(plan.kind).toBe(kind);
  if (plan.kind !== 'apply' && plan.kind !== 'remove') throw Error('not effect'); return plan;
}
function host(initial = fixture()) {
  const document = new RecordedDocument(), plans: MaterialPlan[] = []; let context = initial;
  const controls = createMaterialControls(document.asDocument(), plan => {
    plans.push(plan); if (['draft', 'select', 'cancel'].includes(plan.kind) && materialPlanIsCurrent(plan, context)) {
      context = applyLocal(context, plan); controls.render(context);
    }
  });
  controls.render(context); const root = record(controls.root), choices = root.children[0]!, actions = root.children[6]!, confirmation = root.children[7]!;
  const fields = new Map(materialFields.map((field, i) => [field, root.children[5]!.children[i]!.children[0]!]));
  return { document, controls, root, fields, plans, model: choices.children[0]!.children[0]!, surface: choices.children[1]!.children[0]!, scope: choices.children[2]!.children[0]!,
    status: root.children[1]!, observed: root.children[2]!, impact: root.children[3]!, begin: root.children[4]!, apply: actions.children[0]!, cancel: actions.children[1]!, remove: actions.children[2]!, retry: actions.children[3]!, review: actions.children[4]!,
    confirmation, confirm: confirmation.children[1]!, get context() { return context; }, render(next: MaterialContext) { if (controls.render(next)) context = next; } };
}

describe('disconnected material controls (not rendering, browser or save acceptance)', () => {
  it('selects exact model/surface/scope with no default or write, and never invents a catalog for an empty model', () => {
    let context = fixture(false); const before = context.source;
    expect(materialView(context).targetIssue).toContain('モデルを選択');
    context = applyLocal(context, planMaterial(context, { kind: 'model', assetId: asset }));
    expect(context.selection.target).toBeNull(); expect(materialView(context).targetIssue).toContain('面を選択');
    context = applyLocal(context, planMaterial(context, { kind: 'surface', key: materialTargetKey(target) }));
    context = applyLocal(context, planMaterial(context, { kind: 'scope', scope: 'project' }));
    expect(context.selection).toEqual({ assetId: asset, target, scope: 'project' }); expect(context.draft).toBeNull(); expect(context.source).toBe(before);
    expect(planMaterial(context, { kind: 'surface', key: '外側' }).kind).toBe('blocked');
    context = applyLocal(context, planMaterial(context, { kind: 'model', assetId: other }));
    expect(materialView(context).targetIssue).toContain('編集できる面がありません');
  });
  it('uses whole-record Scene precedence, exposes lower fallback and does not treat conflicts as absence', () => {
    const s: MaterialSurfacePort = { ...surface(), scene: value({ id: id('ovr', 2), target, scope: 'scene', sceneId: scene, intent: value(intent({ lighting: 'unlit' })) }) };
    const context = fixture(true, s), view = materialView(context);
    expect(view.origin).toBe('scene'); expect(view.base?.appearance).toEqual({ lighting: 'unlit' }); expect(view.fallback).toContain('プロジェクト共通');
    const conflicted = fixture(true, { ...s, scene: unresolved() });
    expect(materialView(conflicted).origin).toBe('project'); expect(materialView(conflicted).issues).not.toEqual([]);
    expect(planMaterial(conflicted, { kind: 'begin' }).kind).toBe('blocked'); expect(planMaterial(conflicted, { kind: 'remove' }).kind).toBe('blocked');
    const common = { ...context, selection: { ...context.selection, scope: 'project' as const } };
    expect(materialView(common).base?.appearance.opacity).toBe(0.4); expect(materialView(common).fallback).toContain('引き続き');
    expect(materialView(fixture(true, { ...s, project: value(null), sourceIntent: unresolved() })).fallback).toContain('確認できず');
  });
  it('retains exact untouched color/unknown data, preserves complete compositing, and creates no write for unchanged display values', () => {
    let context = editing(), original = context.draft!.base;
    context = edit(context, 'keyColor', materialInput(original.appearance, 'keyColor')); expect(context.draft!.edits).toEqual({});
    context = edit(context, 'opacity', '65'); const plan = effect(context, 'apply'); if (plan.kind !== 'apply') return;
    expect(plan.recordId).toBeNull(); expect(plan.selection.target).toBe(target); expect(plan.intent.future).toEqual({ keep: true });
    expect(plan.intent.appearance.chroma?.keyColorSrgb).toEqual(original.appearance.chroma?.keyColorSrgb);
    expect(plan.intent.appearance.doubleSided).toBe(true); expect(plan.intent.compositing).toEqual(original.compositing);
    expect(plan.intent.appearance.opacity).toBe(0.65); expect(original.appearance.opacity).toBe(0.4);
  });
  it('refuses unavailable applicability, empty-string denial, opaque alpha and stale support without replacing intent', () => {
    for (const issue of ['', 'この見え方には未対応です。']) {
      const context = edit(editing(fixture(true, { ...surface(), admit: () => issue })), 'opacity', '30');
      expect(materialApplyIssue(context)).not.toBeNull(); expect(planMaterial(context, { kind: 'apply' }).kind).toBe('blocked');
    }
    const s = surface(), normal = edit(editing(fixture(true, s)), 'opacity', '30'), plan = effect(normal, 'apply');
    const changed = fixture(true, { ...s, admit: () => '' });
    expect(materialPlanIsCurrent(plan, { ...normal, source: changed.source })).toBe(false);
    const throwing = fixture(true, { ...s, admit: () => { throw new Error(); } });
    expect(materialPlanIsCurrent(plan, { ...normal, source: throwing.source })).toBe(false);
    expect(planMaterial({ ...normal, source: throwing.source }, { kind: 'apply' }).kind).toBe('blocked');
    const unavailable = edit(editing(fixture(true, { ...s, fieldIssues: { ...s.fieldIssues, opacity: '不透明度は未対応です。' } })), 'opacity', '30');
    expect(materialApplyIssue(unavailable)).toContain('未対応');
    const opaque = fixture(true, { ...s, project: value(null), sourceIntent: value(intent({}, 'opaque')) });
    expect(planMaterial(edit(editing(opaque), 'opacity', '20'), { kind: 'apply' }).kind).toBe('blocked');
  });
  it('retains raw edits on conflict/access/source changes and blocks cross-target/Scene effects without rebasing', () => {
    const context = edit(editing(), 'opacity', '63'), plan = effect(context, 'apply');
    for (const patch of [{ token: 'new' }, { projectId: id('prj', 9) }, { sceneId: id('scn', 9) }])
      expect(materialPlanIsCurrent(plan, { ...context, source: { ...context.source, ...patch } })).toBe(false);
    expect(materialPlanIsCurrent(plan, { ...context, selection: { ...context.selection, scope: 'project' } })).toBe(false);
    expect(materialPlanIsCurrent(plan, { ...context, mutationBlock: '' })).toBe(false);
    expect(materialPlanIsCurrent(plan, { ...context, pending: 'pinMove' })).toBe(false);
    const lost = { ...context, source: { ...context.source, kind: 'unavailable' as const, reason: '統合を復旧してください。' } };
    expect(planMaterial(lost, { kind: 'apply' }).kind).toBe('blocked'); expect(lost.draft!.edits.opacity).toBe('63');
    expect(materialPlanIsCurrent({ kind: 'cancel', draft: context.draft! }, lost)).toBe(true);
  });
  it('retries exactly the submitted plan, rejects another operation, and accepts only an exact host receipt', () => {
    const context = edit(editing(), 'opacity', '25'), plan = effect(context, 'apply'); if (plan.kind !== 'apply') return;
    expect(planMaterial({ ...context, feedback: { kind: 'failed', plan, message: '保存失敗' } }, { kind: 'retry' })).toBe(plan);
    expect(materialPlanIsCurrent(plan, { ...context, feedback: { kind: 'applying', plan } })).toBe(true);
    expect(materialPlanIsCurrent(plan, { ...context, feedback: { kind: 'applying', plan: { ...plan } } })).toBe(false);
    const receipt = { plan, projectId: project, sceneId: scene, selection: plan.selection, recordId: id('ovr', 9), intent: plan.intent };
    expect(acceptMaterialApply(plan, context.draft, receipt)).toBeNull();
    expect(acceptMaterialApply(plan, context.draft, { ...receipt, plan: { ...plan } })).toBe(context.draft);
    expect(acceptMaterialApply(plan, context.draft, { ...receipt, intent: intent() })).toBe(context.draft);
    const newer = edit(context, 'opacity', '26').draft; expect(acceptMaterialApply(plan, newer, receipt)).toBe(newer);
  });
  it('refuses duplicate/foreign targets and an override routed to another scope or target', () => {
    const s = surface(), context = fixture(); if (context.source.kind !== 'ready') return;
    const duplicate = { ...context, source: { ...context.source, models: [context.source.models[0]!, context.source.models[0]!] } };
    expect(materialView(duplicate).issue).not.toBeNull();
    for (const patch of [{ scope: 'scene' as const }, { sceneId: scene }, { target: { ...target, logicalMaterialSlotId: id('slot', 9) } }]) {
      if (s.project.kind !== 'value' || !s.project.value) return;
      const c = fixture(true, { ...s, project: value({ ...s.project.value, ...patch }) });
      expect(materialView(c).issues).not.toEqual([]);
      expect(planMaterial({ ...c, selection: { ...c.selection, scope: 'project' } }, { kind: 'begin' }).kind).toBe('blocked');
    }
  });
  it('shows exact selectors/observed source and changes only local selection until explicit edit/apply', () => {
    const h = host(fixture(false)); expect(h.model.value).toBe(''); expect(h.surface.value).toBe(''); expect(h.begin.disabled).toBe(true);
    h.model.value = asset; h.model.fire('change'); expect(h.surface.value).toBe('');
    h.surface.value = materialTargetKey(target); h.surface.fire('change'); expect(h.observed.textContent).toContain('プロジェクト共通');
    h.surface.value = ''; h.surface.fire('change'); expect(h.surface.value).toBe(materialTargetKey(target));
    expect(h.context.selection.target).toBe(target);
    h.scope.value = 'project'; h.scope.fire('change'); expect(h.context.selection.scope).toBe('project');
    expect(h.plans.every(plan => plan.kind === 'select')).toBe(true); expect(h.fields.get('lighting')!.disabled).toBe(true);
    h.begin.fire('click'); h.fields.get('opacity')!.value = '35'; h.fields.get('opacity')!.fire('input');
    h.apply.fire('click'); expect(h.plans.at(-1)).toMatchObject({ kind: 'apply', recordId: id('ovr', 1) });
    expect(h.context.draft?.edits.opacity).toBe('35'); expect(h.observed.textContent).toContain('プロジェクト共通'); h.controls.dispose();
  });
  it('retains IME/static input on source loss and rejects Scene transition, then confirms cancellation', () => {
    const h = host(); h.begin.fire('click'); const input = h.fields.get('opacity')!; input.focus(); input.fire('compositionstart'); input.value = '３０'; input.fire('input');
    h.render({ ...h.context, source: { ...h.context.source, kind: 'unavailable', reason: '読み込み失敗' } });
    expect(h.context.draft?.edits.opacity).toBe('３０'); expect(input.value).toBe('３０'); expect(h.document.activeElement).toBe(input);
    expect(h.controls.render({ ...h.context, source: { ...h.context.source, sceneId: 'other' } })).toBe(false);
    input.fire('compositionend'); expect(h.controls.isComposing()).toBe(false); expect(h.context.draft?.composing).toBeNull();
    expect(h.apply.disabled).toBe(true); expect(h.cancel.disabled).toBe(false); h.cancel.fire('click'); expect(h.context.draft).not.toBeNull();
    h.confirm.fire('click'); expect(h.context.draft).toBeNull(); h.controls.dispose();
  });
  it('requires exact removal confirmation, shows fallback, and invalidates confirmation when the snapshot changes', () => {
    const context = fixture(); const h = host({ ...context, selection: { ...context.selection, scope: 'project' } });
    h.remove.fire('click'); expect(h.confirmation.hidden).toBe(false); expect(h.confirmation.children[0]!.textContent).toContain('モデル元の設定');
    expect(h.plans).toEqual([]); h.render({ ...h.context, source: { ...h.context.source, token: 'new' } });
    expect(h.confirmation.hidden).toBe(true); h.confirm.fire('click'); expect(h.plans).toEqual([]);
    h.remove.fire('click'); h.confirm.fire('click'); expect(h.plans.at(-1)).toMatchObject({ kind: 'remove', recordId: id('ovr', 1) });
    expect(materialView(h.context).record?.id).toBe(id('ovr', 1)); h.controls.dispose();
  });
  it('keeps failed removal tied to its original scope after selection changes and displays untrusted text literally', () => {
    const base = fixture(), context = { ...base, selection: { ...base.selection, scope: 'project' as const } }, plan = effect(context, 'remove');
    const literal = '<img onerror=alert(1)>', h = host({ ...context, feedback: { kind: 'failed', plan, message: literal } });
    h.scope.value = 'scene'; h.scope.fire('change'); expect(h.retry.disabled).toBe(true); expect(h.status.textContent).toContain('プロジェクト共通');
    expect(h.status.textContent).toContain(literal); expect(h.status.children).toEqual([]);
    h.review.fire('click'); expect(h.plans.at(-1)).toMatchObject({ kind: 'review', selection: { scope: 'project' } });
    expect(materialPlanIsCurrent(h.plans.at(-1)!, h.context)).toBe(true);
    h.controls.dispose(); const count = h.plans.length; h.apply.fire('click'); h.scope.fire('change'); expect(h.plans).toHaveLength(count);
  });
  it('keeps unsupported controls honest without discarding existing values or hiding retained chroma edits', () => {
    const s = surface(), h = host(fixture(true, { ...s, fieldIssues: { ...s.fieldIssues, lighting: '照明の編集には未対応です。' } }));
    h.begin.fire('click'); expect(h.fields.get('lighting')!.disabled).toBe(true);
    const color = h.fields.get('keyColor')!; color.value = '#ffffff'; color.fire('input');
    h.fields.get('chroma')!.value = 'off'; h.fields.get('chroma')!.fire('change');
    expect(color.parent!.hidden).toBe(false); expect(h.context.draft?.edits.keyColor).toBe('#ffffff'); expect(h.apply.disabled).toBe(true);
    expect(h.status.textContent).toContain('有効にするか'); h.controls.dispose();
  });
});
