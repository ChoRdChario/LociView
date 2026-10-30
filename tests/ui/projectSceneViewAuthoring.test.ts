import { describe, expect, it } from 'vitest';
import { value, type Field } from '../../src/scene/types';
import { newViewMemory, type ViewContext, type ViewSource, type SavedViewItem } from '../../src/ui/projectScene/viewState';
import { acceptViewAuthor, editViewName, planViewAuthor, viewAuthorPlanIsCurrent,
  type ViewAuthorContext, type ViewAuthorDraft, type ViewAuthorPlan } from '../../src/ui/projectScene/viewAuthoringState';
import { acceptViewBackground, editViewBackground, planViewBackground, viewBackgroundPlanIsCurrent,
  type ViewBackgroundContext } from '../../src/ui/projectScene/viewBackgroundState';
import { createViewAuthorControls, createViewBackgroundControls, type ViewAuthorEvent, type ViewBackgroundEvent } from '../../src/ui/projectScene/viewAuthoringControls';
import { RecordedDocument, record } from './domRecorder';
import { orderBetween } from '../../src/projectScene/viewDisplay';

const id = (kind: string, n: number) => `${kind}_${n.toString(16).padStart(32, '0')}`;
const scene = id('scn', 1), other = id('scn', 2), frame = id('frm', 1), first = id('view', 1), second = id('view', 2), third = id('view', 3);
const unknown = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
const item = (key: string, name: string, orderKey: string): SavedViewItem => ({ id: key, name: value(name), orderKey: value(orderKey), sceneId: scene,
  projectFrameId: frame, lifecycle: value({ state: 'active', eventId: id('evt', 1) }),
  camera: value({ position: [2, 2, 2], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 1 } }),
  background: value({ kind: 'solid', colorSrgb: [0.1, 0.2, 0.3], future: 'preserved by host' }) });
function source(): Extract<ViewSource, { kind: 'ready' }> {
  return { kind: 'ready', sceneId: scene, projectFrameId: frame, token: 'source', entryViewId: value(null),
    views: [item(first, '入口', 'A'), item(second, '全景', 'B'), item(third, '詳細', 'C')] };
}
function author(): ViewAuthorContext {
  const view: ViewContext = { source: source(), memory: { ...newViewMemory(scene), selectedViewId: second },
    runtime: { kind: 'ready', token: 'runtime', sceneId: scene, projectFrameId: frame, projection: 'perspective', axis: null, bounds: value('available') },
    cameraBlock: null, mutationBlock: null, cameraFeedback: { kind: 'idle' }, entryFeedback: { kind: 'idle' } };
  return { view, draft: null, capture: { kind: 'ready', capture: { sceneId: scene, projectFrameId: frame, runtimeToken: 'runtime', token: 'exact-capture' } },
    versions: { viewId: second, sourceToken: 'source', camera: 'camera-field', background: 'background-field' },
    deletion: { viewId: second, sourceToken: 'source', issue: null }, feedback: { kind: 'idle' }, orderBetween };
}
// Pure state remains cloneable; the trusted host function is compared by identity separately.
const stateSnapshot = (ctx: ViewAuthorContext) => structuredClone({ ...ctx, orderBetween: null });
function start(ctx: ViewAuthorContext, kind: 'new' | 'edit' | 'capture'): ViewAuthorContext {
  const plan = planViewAuthor(ctx, { kind }); if (plan.kind !== 'draft') throw Error(`draft: ${JSON.stringify(plan)}`); return { ...ctx, draft: plan.draft };
}
function named(ctx: ViewAuthorContext, name = '記録'): ViewAuthorContext { return { ...ctx, draft: editViewName(ctx.draft!, name) }; }
function background(): ViewBackgroundContext {
  return { view: author().view, source: { kind: 'solid', sceneId: scene, projectFrameId: frame, token: 'exact-background', hex: '#1a334d' }, draft: null, feedback: { kind: 'idle' } };
}
function authorHost() {
  let ctx = author(); const events: ViewAuthorEvent[] = [];
  const controls = createViewAuthorControls(new RecordedDocument().asDocument(), event => {
    events.push(event);
    if ((event.kind === 'draft' && viewAuthorPlanIsCurrent(event, ctx)) || (event.kind === 'input' && event.baseDraft === ctx.draft)) ctx = { ...ctx, draft: event.draft };
    if (event.kind === 'cancel' && event.draft === ctx.draft) ctx = { ...ctx, draft: null };
    controls.render(ctx);
  });
  controls.render(ctx); const root = record(controls.root), [start, form, manage, status, review] = root.children, actions = record(controls.actions), confirm = record(controls.confirmation);
  return { controls, events, root, add: start!.children[0]!, edit: start!.children[1]!, name: form!.children[0]!.children[0]!, capture: form!.children[2]!,
    captureNote: form!.children[3]!, apply: actions.children[0]!, cancel: actions.children[1]!, earlier: manage!.children[1]!, later: manage!.children[2]!,
    remove: manage!.children[4]!, deleteNote: manage!.children[5]!, status: status!, review: review!, confirmation: confirm!, confirm: confirm!.children[1]!,
    get context() { return ctx; }, render(next: ViewAuthorContext) { if (controls.render(next)) ctx = next; } };
}
function backgroundHost() {
  let ctx = background(); const events: ViewBackgroundEvent[] = [];
  const controls = createViewBackgroundControls(new RecordedDocument().asDocument(), event => {
    events.push(event);
    if (event.kind === 'draft' && event.baseDraft === ctx.draft) ctx = { ...ctx, draft: event.draft };
    if (event.kind === 'cancel' && event.draft === ctx.draft) ctx = { ...ctx, draft: null };
    controls.render(ctx);
  }); controls.render(ctx);
  const root = record(controls.root);
  return { controls, events, root, hex: root.children[0]!.children[0]!, picker: root.children[1]!, standard: root.children[2]!,
    apply: record(controls.actions).children[0]!, cancel: record(controls.actions).children[1]!, status: root.children.find(n => n.getAttribute('role') === 'status')!, confirmation: record(controls.confirmation), confirm: record(controls.confirmation).children[1]!,
    get context() { return ctx; }, render(next: ViewBackgroundContext) { if (controls.render(next)) ctx = next; } };
}

describe('Scene-owned view authoring intentions', () => {
  it('captures exact host identity once; creation never chooses a default, ID, order or current view', () => {
    const initial = author(), original = stateSnapshot(initial); let ctx = named(start(initial, 'new'), 'か\u3099');
    const saved = ctx.draft!.capture;
    ctx = { ...ctx, view: { ...ctx.view, runtime: { ...ctx.view.runtime, token: 'moved-camera' } } };
    const plan = planViewAuthor(ctx, { kind: 'apply' }); expect(plan).toMatchObject({ kind: 'apply', viewId: null, name: 'が', capture: saved });
    expect(plan).not.toHaveProperty('background'); expect(plan).not.toHaveProperty('defaultViewId'); expect(plan).not.toHaveProperty('orderKey');
    expect(stateSnapshot(initial)).toEqual(original); expect(initial.orderBetween).toBe(orderBetween); expect(ctx.draft!.capture).toBe(saved); expect(viewAuthorPlanIsCurrent(plan, ctx)).toBe(true);
    expect(planViewAuthor(start(initial, 'new'), { kind: 'apply' })).toMatchObject({ kind: 'blocked' });
  });
  it('validates name scalars/controls/IME and refuses to capture stale or foreign runtime', () => {
    const ctx = start(author(), 'new');
    for (const name of ['', ' ', 'a'.repeat(257), 'a\n', '\ud800']) expect(planViewAuthor(named(ctx, name), { kind: 'apply' }).kind).toBe('blocked');
    expect(planViewAuthor(named(ctx, '😀'.repeat(256)), { kind: 'apply' }).kind).toBe('apply');
    expect(planViewAuthor({ ...ctx, draft: editViewName(ctx.draft!, '未確定', true) }, { kind: 'apply' }).kind).toBe('blocked');
    const original = author(); if (original.capture.kind !== 'ready') throw Error('capture');
    for (const patch of [{ runtimeToken: 'old' }, { sceneId: other }, { projectFrameId: 'foreign' }, { token: '' }])
      expect(planViewAuthor({ ...original, capture: { kind: 'ready', capture: { ...original.capture.capture, ...patch } } }, { kind: 'new' }).kind).toBe('blocked');
    const started = planViewAuthor(original, { kind: 'new' }); expect(viewAuthorPlanIsCurrent(started, original)).toBe(true);
    expect(viewAuthorPlanIsCurrent(started, { ...original, view: { ...original.view, runtime: { ...original.view.runtime, token: 'moved' } } })).toBe(false);
  });
  it('renames sparsely despite independent camera conflict, preserves unknown fields, and refuses a changed name', () => {
    const initial = author(), src = source(); const rows = src.views.map(row => row.id === second ? { ...row, camera: unknown<unknown>() } : row);
    let ctx = named(start({ ...initial, view: { ...initial.view, source: { ...src, views: rows } } }, 'edit'));
    const plan = planViewAuthor(ctx, { kind: 'apply' }); expect(plan).toMatchObject({ kind: 'apply', viewId: second, name: '記録' });
    expect(plan).not.toHaveProperty('capture'); expect(plan).not.toHaveProperty('background'); expect(src.views[1]!.background).toEqual(value({ kind: 'solid', colorSrgb: [0.1, 0.2, 0.3], future: 'preserved by host' }));
    ctx = { ...ctx, view: { ...ctx.view, source: { ...src, token: 'changed', views: src.views.map(row => row.id === second ? { ...row, name: value('受信') } : row) } } };
    expect(planViewAuthor(ctx, { kind: 'apply' }).kind).toBe('blocked'); expect(ctx.draft!.name).toBe('記録');
  });
  it('updates camera/background without resolving name conflicts or rebasing atomic field versions', () => {
    const original = author(), src = source();
    let ctx = start(start({ ...original, view: { ...original.view, source: { ...src, views: src.views.map(row => row.id === second ? { ...row, name: unknown<string>() } : row) } } }, 'edit'), 'capture');
    const plan = planViewAuthor(ctx, { kind: 'apply' }); expect(plan).toMatchObject({ kind: 'apply', capture: ctx.draft!.capture }); expect(plan).not.toHaveProperty('name');
    ctx = { ...ctx, versions: { ...ctx.versions!, camera: 'changed-camera' } };
    expect(planViewAuthor(ctx, { kind: 'apply' }).kind).toBe('blocked');
    ctx = start(ctx, 'capture'); expect(ctx.draft!.captureBase!.camera).toBe('camera-field'); expect(planViewAuthor(ctx, { kind: 'apply' }).kind).toBe('blocked');
  });
  it('requires exact deletion admission, never clears entry, and emits one-item relative order intent', () => {
    const ctx = author(); const before = stateSnapshot(ctx);
    expect(planViewAuthor(ctx, { kind: 'delete' })).toMatchObject({ kind: 'delete', viewId: second });
    for (const entryViewId of [value(second), unknown<string | null>()]) expect(planViewAuthor({ ...ctx, view: { ...ctx.view, source: { ...source(), entryViewId } } }, { kind: 'delete' }).kind).toBe('blocked');
    for (const deletion of [null, { ...ctx.deletion!, sourceToken: 'stale' }, { ...ctx.deletion!, issue: '使用中' }]) expect(planViewAuthor({ ...ctx, deletion }, { kind: 'delete' }).kind).toBe('blocked');
    expect(planViewAuthor(ctx, { kind: 'move', direction: 'earlier' })).toMatchObject({ kind: 'move', viewId: second, neighborId: first });
    expect(planViewAuthor(ctx, { kind: 'move', direction: 'later' })).toMatchObject({ kind: 'move', viewId: second, neighborId: third });
    expect(planViewAuthor({ ...ctx, view: { ...ctx.view, source: { ...source(), views: [item(first, '不明', 'A'), { ...item(second, '不明', 'B'), orderKey: unknown<string>() }] } } }, { kind: 'move', direction: 'earlier' }).kind).toBe('blocked');
    expect(stateSnapshot(ctx)).toEqual(before); expect(ctx.orderBetween).toBe(orderBetween);
  });
  it('refuses impossible adjacent intervals before selection without blocking representable tied moves', () => {
    const initial = author(), tied = { ...initial, orderBetween,
      view: { ...initial.view, source: { ...source(), views: [item(first, '入口', 'A'), item(second, '全景', 'A'), item(third, '詳細', 'A')] } } };
    const selected = (viewId: string) => ({ ...tied, view: { ...tied.view, memory: { ...tied.view.memory, selectedViewId: viewId } } });
    expect(planViewAuthor(selected(first), { kind: 'move', direction: 'later' })).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('後へ移動できません') });
    expect(planViewAuthor(selected(third), { kind: 'move', direction: 'earlier' })).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('前へ移動できません') });
    for (const direction of ['earlier', 'later'] as const) expect(planViewAuthor(selected(second), { kind: 'move', direction })).toMatchObject({ kind: 'move', viewId: second, direction });
    for (const [keys, selectedViewId, direction] of [
      [['9', 'A', 'A0'], first, 'later'], [['A', 'B', 'z'.repeat(64)], second, 'later'],
    ] as const) {
      const ctx = { ...initial, orderBetween, view: { ...initial.view, memory: { ...initial.view.memory, selectedViewId },
        source: { ...source(), views: [item(first, '入口', keys[0]), item(second, '全景', keys[1]), item(third, '詳細', keys[2])] } } };
      expect(planViewAuthor(ctx, { kind: 'move', direction }).kind).toBe('blocked');
    }
    const h = authorHost(); h.render(selected(first)); expect(h.later.disabled).toBe(true);
    const note = h.root.children[2]!.children[3]!; expect(note.textContent).toContain('後へ移動できません');
    expect(h.later.attributes.get('aria-describedby')).toBe(note.id); h.later.fire('click'); expect(h.events).toEqual([]);
    h.render(selected(second)); expect(h.earlier.disabled).toBe(false); expect(h.later.disabled).toBe(false); h.controls.dispose();
  });
  it('rechecks source, selection and exact neighbors while keeping reorder independent from free-camera capture', () => {
    const ctx = author(), plan = planViewAuthor(ctx, { kind: 'move', direction: 'earlier' }); expect(plan.kind).toBe('move');
    expect(viewAuthorPlanIsCurrent(plan, { ...ctx, view: { ...ctx.view, source: { ...source(), token: 'received' } } })).toBe(false);
    expect(viewAuthorPlanIsCurrent(plan, { ...ctx, view: { ...ctx.view, memory: { ...ctx.view.memory, selectedViewId: third } } })).toBe(false);
    expect(viewAuthorPlanIsCurrent(plan, { ...ctx, view: { ...ctx.view, source: { ...source(), views: [item(first, '入口', 'Z'), item(second, '全景', 'B'), item(third, '詳細', 'A')] } } })).toBe(false);
    expect(viewAuthorPlanIsCurrent(plan, { ...ctx, capture: { kind: 'unavailable', reason: '表示の準備中です。' },
      view: { ...ctx.view, runtime: { ...ctx.view.runtime, token: 'free-camera-moved' } } })).toBe(true);
    const draft = start(ctx, 'edit'); expect(planViewAuthor(draft, { kind: 'move', direction: 'earlier' }).kind).toBe('blocked'); expect(draft.draft).not.toBeNull();
  });
  it('rejects duplicate/foreign/deleted selection and stale apply; acknowledges only the exact draft and verified receipt', () => {
    const initial = author(), src = source();
    for (const rows of [[item(second, 'A', 'A'), item(second, 'B', 'B')], [{ ...item(second, 'A', 'A'), sceneId: other }],
      [{ ...item(second, 'A', 'A'), lifecycle: value({ state: 'deleted' as const, eventId: id('evt', 2), reason: 'userDelete' as const }) }]])
      expect(planViewAuthor({ ...initial, view: { ...initial.view, source: { ...src, views: rows } } }, { kind: 'edit' }).kind).toBe('blocked');
    const ctx = named(start(initial, 'edit')), plan = planViewAuthor(ctx, { kind: 'apply' }); if (plan.kind !== 'apply') throw Error('apply');
    const observed = { ...src, token: 'applied', views: src.views.map(row => row.id === second ? { ...row, name: value('記録') } : row) };
    expect(viewAuthorPlanIsCurrent(plan, { ...ctx, view: { ...ctx.view, source: { ...src, token: 'new' } } })).toBe(false);
    const receipt = { plan, source: observed, viewId: second };
    expect(acceptViewAuthor(plan, ctx.draft, receipt)).toBeNull();
    expect(acceptViewAuthor(plan, ctx.draft, { ...receipt, source: src })).toBe(ctx.draft);
    const newer = editViewName(ctx.draft!, '後続入力'); expect(acceptViewAuthor(plan, newer, receipt)).toBe(newer);
    expect(acceptViewAuthor(plan, ctx.draft, { ...receipt, plan: { ...plan } })).toBe(ctx.draft);
  });
  it('keeps native name nodes/IME through refresh/source loss, and confirms only the unchanged cancellation', () => {
    const h = authorHost(); h.edit.fire('click'); h.name.fire('compositionstart'); h.name.value = '入力中'; h.name.fire('input');
    const original = h.name; h.render({ ...h.context, view: { ...h.context.view, source: { kind: 'unavailable', sceneId: scene, projectFrameId: frame, token: 'lost', reason: '再読込' } } });
    expect(h.name).toBe(original); expect(h.name.value).toBe('入力中'); expect(h.apply.disabled).toBe(true);
    h.name.fire('compositionend'); expect(h.context.draft!.composing).toBe(false); expect(h.context.draft!.name).toBe('入力中');
    expect(h.controls.render({ ...h.context, view: { ...h.context.view, memory: { ...newViewMemory(other) }, source: { ...source(), sceneId: other } } })).toBe(false);
    h.cancel.fire('click'); expect(h.confirmation.hidden).toBe(false); h.confirm.fire('click'); expect(h.context.draft).toBeNull(); h.controls.dispose();
  });
  it('confirms deletion against exact source/selection and retains failed capture instead of recapturing on retry', () => {
    const h = authorHost(); h.remove.fire('click'); expect(h.events).toEqual([]); expect(h.confirmation.hidden).toBe(false);
    h.render({ ...h.context, view: { ...h.context.view, source: { ...source(), token: 'changed' } } }); h.confirm.fire('click'); expect(h.events).toEqual([]);
    h.render(author()); h.remove.fire('click'); h.confirm.fire('click'); expect(h.events.at(-1)?.kind).toBe('delete');
    h.add.fire('click'); h.name.value = '<img onerror=alert(1)>'; h.name.fire('input'); const draft = h.context.draft!;
    h.review.fire('click'); expect(h.events.at(-1)).toMatchObject({ kind: 'review', viewId: null });
    h.render({ ...h.context, view: { ...h.context.view, runtime: { ...h.context.view.runtime, token: 'camera-moved' } }, feedback: { kind: 'failed', message: '<script>failure</script>' } });
    expect(h.captureNote.textContent).toContain('記録後'); expect(h.context.draft).toBe(draft); expect(h.status.children).toEqual([]); expect(h.apply.disabled).toBe(false);
    h.apply.fire('click'); expect(h.events.at(-1)).toMatchObject({ kind: 'apply', capture: draft.capture });
    h.cancel.fire('click'); h.name.value = '変更'; h.name.fire('input'); expect(h.confirmation.hidden).toBe(true); h.confirm.fire('click'); expect(h.context.draft).not.toBeNull();
    const count = h.events.length; h.controls.dispose(); h.add.fire('click'); h.confirm.fire('click'); expect(h.events).toHaveLength(count);
  });
});

describe('current solid-background controls', () => {
  it('leaves unedited exact background alone; edits only the background with validated HEX', () => {
    const ctx = background(), original = structuredClone(ctx);
    expect(planViewBackground(ctx).kind).toBe('blocked');
    const unchanged = { ...ctx, draft: editViewBackground(ctx, '#1A334D') }; expect(planViewBackground(unchanged).kind).toBe('blocked');
    for (const hex of ['bad', '#12', '#gggggg', '#000000ff']) expect(planViewBackground({ ...ctx, draft: editViewBackground(ctx, hex) }).kind).toBe('blocked');
    const drafted = { ...ctx, view: { ...ctx.view, mutationBlock: '閲覧のみ' }, draft: editViewBackground(ctx, ' #102030 ') };
    const plan = planViewBackground(drafted); expect(plan).toMatchObject({ kind: 'background', background: { kind: 'solid', colorSrgb: [16 / 255, 32 / 255, 48 / 255] } });
    expect(plan).not.toHaveProperty('camera'); expect(plan).not.toHaveProperty('name'); expect(ctx).toEqual(original);
  });
  it('retains stale/failed edits, ignores unrelated camera movement, and requires exact observed background for acknowledgement', () => {
    let ctx = background(); ctx = { ...ctx, draft: editViewBackground(ctx, '#abcdef') }; const plan = planViewBackground(ctx); if (plan.kind !== 'background') throw Error('plan');
    expect(viewBackgroundPlanIsCurrent(plan, { ...ctx, view: { ...ctx.view, runtime: { ...ctx.view.runtime, token: 'moved' } } })).toBe(true);
    expect(viewBackgroundPlanIsCurrent(plan, { ...ctx, feedback: { kind: 'applying' } })).toBe(true);
    expect(viewBackgroundPlanIsCurrent(plan, { ...ctx, view: { ...ctx.view, cameraFeedback: { kind: 'applying' } } })).toBe(false);
    expect(viewBackgroundPlanIsCurrent(plan, { ...ctx, source: { ...ctx.source, token: 'updated-background' } })).toBe(false);
    const receipt = { plan, source: { ...ctx.source, kind: 'solid' as const, token: 'done', hex: '#abcdef' }, background: plan.background };
    expect(acceptViewBackground(plan, ctx.draft, receipt)).toBeNull();
    expect(acceptViewBackground(plan, ctx.draft, { ...receipt, background: { kind: 'solid', colorSrgb: [plan.background.colorSrgb[0] + 0.00001, plan.background.colorSrgb[1], plan.background.colorSrgb[2]] } })).toBe(ctx.draft);
    expect(planViewBackground({ ...ctx, source: { kind: 'unavailable', token: 'lost', sceneId: scene, projectFrameId: frame, reason: '透明背景はこの操作の対象外です。' } }).kind).toBe('blocked');
  });
  it('retains invalid HEX with neutral picker, keeps standard color local until apply and cancels without a renderer write', () => {
    const h = backgroundHost(); h.hex.value = '#12'; h.hex.fire('input'); expect(h.hex.value).toBe('#12'); expect(h.picker.hidden).toBe(true); expect(h.apply.disabled).toBe(true);
    h.standard.fire('click'); expect(h.hex.value).toBe('#101725'); expect(h.events.every(event => event.kind === 'draft')).toBe(true);
    expect(h.context.source).toMatchObject({ hex: '#1a334d' }); h.apply.fire('click'); expect(h.events.at(-1)?.kind).toBe('background');
    const draft = h.context.draft; h.render({ ...h.context, feedback: { kind: 'failed', message: '再試行' } }); expect(h.context.draft).toBe(draft); expect(h.apply.disabled).toBe(false);
    h.render({ ...h.context, source: { ...h.context.source, token: 'changed' } }); expect(h.apply.disabled).toBe(true); expect(h.cancel.disabled).toBe(false);
    h.cancel.fire('click'); h.confirm.fire('click'); expect(h.context.draft).toBeNull(); h.controls.dispose();
  });
  it('keeps background composition and draft during loss/Scene switch, blocks unintended reset and cleans listeners', () => {
    const h = backgroundHost(); h.hex.fire('compositionstart'); h.hex.value = '#abcdef'; h.hex.fire('input');
    h.render({ ...h.context, source: { kind: 'unavailable', sceneId: scene, projectFrameId: frame, token: 'lost', reason: '<img>' } });
    expect(h.hex.value).toBe('#abcdef'); expect(h.picker.disabled).toBe(true); expect(h.standard.disabled).toBe(true);
    h.hex.fire('compositionend'); expect(h.context.draft!.composing).toBe(false); expect(h.context.draft!.hex).toBe('#abcdef');
    expect(h.controls.render({ ...h.context, source: { ...h.context.source, sceneId: other } })).toBe(false); expect(h.status.hidden).toBe(false);
    h.cancel.fire('click'); h.confirm.fire('click'); expect(h.context.draft).toBeNull(); const count = h.events.length;
    h.controls.dispose(); h.standard.fire('click'); h.hex.fire('input'); expect(h.events).toHaveLength(count);
  });
});
