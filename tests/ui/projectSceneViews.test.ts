import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { value, type Field, type SceneState, type SceneResources } from '../../src/scene/types';
import { planSceneCommand } from '../../src/scene/commands';
import { acceptEntryView, entryViewIssue, newViewMemory, planView, savedViewChoices, viewAxes, viewPlanIsCurrent,
  type ViewContext, type ViewPlan, type SavedViewItem, type ViewSource } from '../../src/ui/projectScene/viewState';
import { createViewControls } from '../../src/ui/projectScene/viewControls';
import { RecordedDocument, record } from './domRecorder';

const id = (kind: string, n: number) => `${kind}_${n.toString(16).padStart(32, '0')}`;
const scene = id('scn', 1), other = id('scn', 2), frame = id('frm', 1), first = id('view', 1), second = id('view', 2), foreign = id('view', 3);
const unresolved = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
const life = () => value({ state: 'active' as const, eventId: id('evt', 1) });
function view(key: string, name: string, sceneId = scene): SavedViewItem {
  return { id: key, name: value(name), sceneId, projectFrameId: frame, lifecycle: life(), orderKey: value('A'),
    camera: value({ position: [2, 2, 2], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 1 } }),
    background: value({ kind: 'solid', colorSrgb: [0.1, 0.1, 0.1] }) };
}
function source(): ViewSource & { kind: 'ready' } {
  return { kind: 'ready', token: 'source-one', sceneId: scene, projectFrameId: frame,
    entryViewId: value(first), views: [view(first, '入口'), view(second, '全景'), view(foreign, '別のシーン', other)] };
}
function context(): ViewContext {
  return { source: source(), runtime: { kind: 'ready', token: 'camera-one', sceneId: scene, projectFrameId: frame,
    projection: 'perspective', axis: null, bounds: value('available') }, memory: newViewMemory(scene), cameraBlock: null,
    mutationBlock: null, cameraFeedback: { kind: 'idle' }, entryFeedback: { kind: 'idle' } };
}
function entry(ctx: ViewContext, viewId: string | null): ViewContext {
  const plan = planView(ctx, { kind: 'chooseEntry', viewId }); expect(plan.kind).toBe('change');
  if (plan.kind !== 'change') throw Error('missing draft'); return { ...ctx, memory: plan.memory };
}
function host() {
  let ctx = context(); const events: ViewPlan[] = [];
  const controls = createViewControls(new RecordedDocument().asDocument(), plan => {
    events.push(plan);
    if (plan.kind === 'change' && viewPlanIsCurrent(plan, ctx)) { ctx = { ...ctx, memory: plan.memory }; controls.render(ctx); }
  });
  controls.render(ctx); const root = record(controls.root), camera = root.children[0]!, saved = root.children[1]!, start = root.children[2]!;
  const stage = record(controls.stageTools);
  return { controls, events, root, fit: camera.children[0]!, axes: camera.children[1]!, projection: camera.children[2]!.children[0]!,
    cameraNote: camera.children[3]!, cameraStatus: camera.children[4]!, picker: saved.children[0]!.children[0]!, recall: saved.children[1]!,
    savedNote: saved.children[2]!, savedReview: saved.children[3]!, entry: start.children[0]!.children[0]!, apply: start.children[2]!,
    cancel: start.children[3]!, entryNote: start.children[4]!, entryStatus: start.children[5]!, entryReview: start.children[6]!,
    quickFit: stage.children[0]!, quickNote: stage.children[1]!, get context() { return ctx; },
    render(next: ViewContext) { if (controls.render(next)) ctx = next; } };
}

describe('disconnected viewing aids and entry-view intentions', () => {
  it('separates six axis/fit/projection intentions from all Project content and editing state', () => {
    const ctx = context(), before = structuredClone(ctx), externalDraft = { body: '入力中', composing: true, pinMode: 'move' };
    const otherBefore = structuredClone(externalDraft);
    for (const action of [{ kind: 'fit' as const }, ...viewAxes.map(axis => ({ kind: 'axis' as const, axis })),
      { kind: 'projection' as const, projection: 'orthographic' as const }]) {
      const plan = planView({ ...ctx, mutationBlock: '閲覧のみ' }, action);
      expect(plan).toMatchObject({ kind: 'camera', action }); expect(viewPlanIsCurrent(plan, ctx)).toBe(true);
      expect(plan).not.toHaveProperty('sourceToken'); expect(plan).not.toHaveProperty('viewId');
    }
    expect(ctx).toEqual(before); expect(externalDraft).toEqual(otherBefore);
    expect(planView({ ...ctx, cameraBlock: 'ドラッグを終了してください。' }, { kind: 'fit' })).toMatchObject({ kind: 'blocked' });
  });

  it('keeps projection/recall available in an empty Scene and free camera independent of broken optional views', () => {
    const ctx = context(); if (ctx.runtime.kind !== 'ready') throw Error('runtime');
    const empty = { ...ctx, runtime: { ...ctx.runtime, bounds: value('empty' as const) }, memory: { ...ctx.memory, selectedViewId: first } };
    expect(planView(empty, { kind: 'fit' }).kind).toBe('blocked'); expect(planView(empty, { kind: 'axis', axis: '+y' }).kind).toBe('blocked');
    expect(planView(empty, { kind: 'projection', projection: 'orthographic' }).kind).toBe('camera'); expect(planView(empty, { kind: 'recall' }).kind).toBe('camera');
    const broken = { ...ctx, source: { ...source(), entryViewId: unresolved<string | null>() } };
    expect(planView(broken, { kind: 'fit' }).kind).toBe('camera'); expect(planView(broken, { kind: 'chooseEntry', viewId: second }).kind).toBe('blocked');
    const unavailable: ViewSource = { kind: 'unavailable', token: 'missing', sceneId: scene, projectFrameId: frame, reason: '復旧してください。' };
    expect(planView({ ...ctx, source: unavailable }, { kind: 'fit' }).kind).toBe('camera');
  });

  it('keeps exact Scene-owned choices, no first/default auto-selection, no field/duplicate conflict winner', () => {
    const ctx = context(), current = source();
    expect(savedViewChoices(ctx).map(item => item.id)).toEqual([first, second]);
    expect(ctx.memory.selectedViewId).toBeNull(); expect(planView(ctx, { kind: 'recall' }).kind).toBe('blocked');
    expect(planView(ctx, { kind: 'select', viewId: foreign }).kind).toBe('blocked');
    const chosen = { ...ctx, memory: { ...ctx.memory, selectedViewId: first } };
    for (const patch of [{ projectFrameId: 'foreign-frame' }, { camera: unresolved<unknown>() }, { background: unresolved<unknown>() },
      { lifecycle: unresolved<import('../../src/scene/types').Lifecycle>() }]) {
      expect(planView({ ...chosen, source: { ...current, views: [{ ...current.views[0]!, ...patch }] } }, { kind: 'recall' }).kind).toBe('blocked');
    }
    const unknownName = { ...current.views[0]!, name: unresolved<string>() };
    expect(planView({ ...chosen, source: { ...current, views: [unknownName] } }, { kind: 'recall' }).kind).toBe('camera');
    const duplicate = { ...chosen, source: { ...current, views: [view(first, 'A'), view(first, 'B')] } };
    expect(savedViewChoices(duplicate)).toMatchObject([{ label: '視点の候補を確認' }]); expect(planView(duplicate, { kind: 'recall' }).kind).toBe('blocked');
    const deleted = { ...current.views[0]!, lifecycle: value({ state: 'deleted' as const, eventId: id('evt', 2), reason: 'userDelete' as const }) };
    expect(savedViewChoices({ ...ctx, source: { ...current, views: [deleted] } })).toEqual([]);
  });

  it('recall requests camera/background together by exact ID, while entry changes only the Scene pointer', () => {
    const ctx = context(), chosen = { ...ctx, memory: { ...ctx.memory, selectedViewId: second } };
    const recall = planView(chosen, { kind: 'recall' }); expect(recall).toMatchObject({ kind: 'camera', action: { kind: 'recall' }, viewId: second });
    expect(chosen.source).toEqual(ctx.source);
    const draft = entry(ctx, second), plan = planView(draft, { kind: 'applyEntry' }); if (plan.kind !== 'entry') throw Error('entry');
    const state: SceneState = { token: ctx.source.token, defaultSceneId: value(scene), scenes: { [scene]: { id: scene, lifecycle: life(),
      name: value('現地'), orderKey: value('A'), defaultViewId: value(first) } }, assetMemberships: {}, captionMemberships: {} };
    const resources: SceneResources = { token: state.token, projectFrameId: frame, views: Object.fromEntries(source().views.map(item => [item.id, item])), assets: {}, captions: {}, materials: {} };
    const changed = planSceneCommand(state, resources, { kind: 'setView', sceneId: plan.sceneId, viewId: plan.viewId }, id('evt', 2));
    expect(changed.next.scenes[scene]!.defaultViewId).toEqual(value(second)); expect(changed.next.defaultSceneId).toEqual(value(scene));
    expect(changed.next.assetMemberships).toEqual({}); expect(draft.runtime).toBe(ctx.runtime); expect(plan).not.toHaveProperty('camera');
    expect(planView(entry(ctx, null), { kind: 'applyEntry' })).toMatchObject({ kind: 'entry', viewId: null });
  });

  it('preserves a null entry baseline and stale drafts across incoming changes instead of rebasing', () => {
    const ctx = { ...context(), source: { ...source(), entryViewId: value(null) } };
    let draft = entry(ctx, first);
    draft = { ...draft, source: { ...source(), token: 'new', entryViewId: value(first) } };
    draft = entry(draft, second); expect(draft.memory.entryDraft).toEqual({ baseId: null, viewId: second });
    expect(entryViewIssue(draft)).toContain('更新されています'); expect(planView(draft, { kind: 'applyEntry' }).kind).toBe('blocked');
    const failed = { ...draft, entryFeedback: { kind: 'failed' as const, message: '再試行' } };
    expect(failed.memory.entryDraft).toBe(draft.memory.entryDraft);
    const lost: ViewSource = { kind: 'unavailable', sceneId: scene, projectFrameId: frame, token: 'missing', reason: '復旧' };
    expect(planView({ ...failed, source: lost, mutationBlock: '閲覧のみ' }, { kind: 'cancelEntry' }).kind).toBe('change');
  });

  it('binds effects to runtime/frame/source/draft and accepts only matching working-state entry success', () => {
    const ctx = entry(context(), second), camera = planView(ctx, { kind: 'fit' }), plan = planView(ctx, { kind: 'applyEntry' });
    if (plan.kind !== 'entry') throw Error('entry');
    expect(viewPlanIsCurrent(camera, { ...ctx, runtime: { ...ctx.runtime, token: 'camera-new' } })).toBe(false);
    expect(viewPlanIsCurrent(plan, { ...ctx, source: { ...ctx.source, token: 'new' } })).toBe(false);
    expect(viewPlanIsCurrent(plan, { ...ctx, mutationBlock: '' })).toBe(false);
    expect(viewPlanIsCurrent(plan, { ...ctx, memory: { ...ctx.memory, selectedViewId: first } })).toBe(true);
    const observed = { ...source(), token: 'new', entryViewId: value(second) };
    expect(acceptEntryView(plan, ctx.memory, source())).toBe(ctx.memory);
    expect(acceptEntryView(plan, ctx.memory, observed).entryDraft).toBeNull();
    expect(acceptEntryView(plan, entry(ctx, null).memory, observed).entryDraft).not.toBeNull();
    expect(acceptEntryView(plan, ctx.memory, { ...observed, projectFrameId: 'foreign' })).toBe(ctx.memory);
    expect(planView({ ...ctx, entryFeedback: { kind: 'applying' } }, { kind: 'cancelEntry' }).kind).toBe('blocked');
    const recall = planView({ ...ctx, memory: { ...ctx.memory, selectedViewId: first } }, { kind: 'recall' });
    expect(viewPlanIsCurrent(recall, ctx)).toBe(false);
  });

  it('uses observed camera state, one shortcut intent path and independent selection/entry controls', () => {
    const h = host(); expect(h.picker.value).toBe(''); expect(h.entry.value).toBe(first);
    h.projection.value = 'orthographic'; h.projection.fire('change'); expect(h.projection.value).toBe('perspective');
    expect(h.events.at(-1)).toMatchObject({ kind: 'camera', action: { kind: 'projection', projection: 'orthographic' } });
    expect(h.axes.children.map(node => node.textContent)).toEqual(['+X', '-X', '+Y', '-Y', '+Z', '-Z']);
    h.fit.fire('click'); const fromTab = h.events.at(-1); h.quickFit.fire('click'); expect(h.events.at(-1)).toEqual(fromTab);
    h.picker.value = second; h.picker.fire('change'); expect(h.events.at(-1)?.kind).toBe('change'); expect(h.entry.value).toBe(first);
    h.recall.fire('click'); expect(h.events.at(-1)).toMatchObject({ kind: 'camera', viewId: second });
    h.entry.value = second; h.entry.fire('change'); expect(h.events.at(-1)?.kind).toBe('change'); expect(h.apply.disabled).toBe(false);
    h.apply.fire('click'); expect(h.events.at(-1)?.kind).toBe('entry'); expect(h.context.memory.entryDraft).not.toBeNull(); h.controls.dispose();
  });

  it('never displays stale projection/axis from another Scene/frame or defaults unknown projection', () => {
    const h = host(), original = h.context.runtime; if (original.kind !== 'ready') throw Error('runtime');
    for (const patch of [{ sceneId: other }, { projectFrameId: 'foreign' }, { token: '' }]) {
      h.render({ ...h.context, runtime: { ...original, ...patch, axis: '+x' } });
      expect(h.projection.value).toBe(''); expect(h.axes.children.every(node => node.attributes.get('aria-pressed') === 'false')).toBe(true);
      expect(h.fit.disabled).toBe(true); expect(h.projection.disabled).toBe(true);
    }
    h.render({ ...h.context, runtime: { ...original, axis: '+x', projection: 'orthographic' } });
    expect(h.projection.value).toBe('orthographic'); expect(h.axes.children[0]!.attributes.get('aria-pressed')).toBe('true'); h.controls.dispose();
  });

  it('renders unknown entry, vanished selected view and source failures without fallback or losing draft', () => {
    const h = host(); h.picker.value = second; h.picker.fire('change'); h.entry.value = second; h.entry.fire('change');
    const draft = h.context.memory.entryDraft;
    h.render({ ...h.context, source: { ...source(), views: [], token: 'missing' } });
    expect(h.picker.value).toBe(second); expect(h.entry.value).toBe(second); expect(h.context.memory.entryDraft).toBe(draft); expect(h.recall.disabled).toBe(true);
    expect(h.controls.render({ ...h.context, memory: newViewMemory(other), source: { ...source(), sceneId: other } })).toBe(false);
    h.cancel.fire('click'); expect(h.context.memory.entryDraft).toBeNull();
    h.render({ ...h.context, source: { ...source(), entryViewId: unresolved<string | null>() } });
    expect(h.entry.value).toBe('!unresolved'); expect(h.entry.disabled).toBe(true); expect(h.entryReview.hidden).toBe(false); expect(h.fit.disabled).toBe(false);
    h.entryReview.fire('click'); expect(h.events.at(-1)).toMatchObject({ kind: 'review', target: 'entry', viewId: null }); h.controls.dispose();
  });

  it('shows refused intentions beside the initiating lane, including the near-stage camera error', () => {
    const h = host(); expect(h.cameraStatus.hidden).toBe(true);
    h.picker.value = foreign; h.picker.fire('change'); expect(h.savedNote.hidden).toBe(false); expect(h.savedNote.textContent).toContain('このシーン');
    expect(h.cameraStatus.hidden).toBe(true);
    h.entry.value = foreign; h.entry.fire('change'); expect(h.entryStatus.hidden).toBe(false); expect(h.entryStatus.textContent).toContain('このシーン');
    expect(h.cameraStatus.hidden).toBe(true);
    h.projection.value = 'bad'; h.projection.fire('change'); expect(h.cameraStatus.hidden).toBe(false); expect(h.quickNote.hidden).toBe(false);
    expect(h.cameraStatus.textContent).toContain('投影方式'); expect(h.quickNote.textContent).toContain('投影方式');
    h.render({ ...h.context, cameraFeedback: { kind: 'applying' } }); expect(h.entryStatus.hidden).toBe(true);
    expect(h.controls.render({ ...h.context, memory: newViewMemory(other), source: { ...source(), sceneId: other } })).toBe(false);
    expect(h.entryStatus.hidden).toBe(false); expect(h.entryStatus.textContent).toContain('処理の完了'); h.controls.dispose();
  });

  it('keeps camera and metadata failure/retry lanes separate and treats labels/messages as text', () => {
    const h = host(), literal = '<img src=x onerror=alert(1)>';
    h.render({ ...h.context, source: { ...source(), views: [view(first, literal), view(second, '全景')] } });
    expect(h.picker.children.some(node => node.textContent === literal)).toBe(true);
    h.entry.value = second; h.entry.fire('change');
    h.render({ ...h.context, entryFeedback: { kind: 'failed', message: literal }, cameraFeedback: { kind: 'failed', message: '表示を再試行' } });
    expect(h.entryStatus.textContent).toContain(literal); expect(h.entryStatus.children).toEqual([]);
    expect(h.cameraStatus.textContent).toContain('表示を再試行'); expect(h.apply.disabled).toBe(false); expect(h.fit.disabled).toBe(false);
    expect(h.entryStatus.textContent).not.toContain('保存済み'); const count = h.events.length;
    h.controls.dispose(); h.fit.fire('click'); h.apply.fire('click'); h.quickFit.fire('click'); expect(h.events).toHaveLength(count);
    expect(readFileSync('src/ui/projectScene/viewControls.css', 'utf8')).toContain(':is(.lv-view-controls, .lv-view-stage-tools)[hidden]');
  });
});
