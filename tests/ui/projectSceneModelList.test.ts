import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { value, type Field } from '../../src/scene/types';
import { modelListView, modelListPlanIsCurrent, newModelListMemory, planModelList,
  type ModelListContext, type ModelListItem, type ModelListPlan, type ModelMembershipPlan } from '../../src/ui/projectScene/modelListState';
import { createModelListControls } from '../../src/ui/projectScene/modelListControls';
import { RecordedDocument, record } from './domRecorder';

const id = (prefix: string, n: number) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
const project = id('prj', 1), scene = id('scn', 1), otherScene = id('scn', 2), a = id('ast', 1), b = id('ast', 2), edge = id('sam', 1);
const unresolved = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
const item = (assetId: string, name: string, included = false): ModelListItem => ({ id: assetId, name: value(name), lifecycle: value('active'),
  membership: value(included ? { kind: 'included', membershipId: edge, sceneId: scene, assetId, orderKey: value('A') } : { kind: 'absent' }),
  display: value(included ? 'unavailable' : 'outsideScene'), displayReason: included ? 'モデルを読み込めません。' : null });
function fixture(): ModelListContext {
  return { source: { kind: 'ready', token: 'snapshot-1', projectId: project, sceneId: scene, items: [item(a, 'Engine', true), item(b, '脚庫')] },
    memory: newModelListMemory(project, scene), pending: null, mutationBlock: null, feedback: { kind: 'idle' } };
}
function withItems(context: ModelListContext, items: readonly ModelListItem[]): ModelListContext {
  return { ...context, source: { ...context.source, kind: 'ready', items } };
}
function change(context: ModelListContext, plan: ModelListPlan): ModelListContext {
  expect(plan.kind).toBe('change'); if (plan.kind !== 'change') throw Error('not change');
  expect(modelListPlanIsCurrent(plan, context)).toBe(true); return { ...context, memory: plan.memory };
}
function membership(context: ModelListContext, assetId: string, included: boolean): ModelMembershipPlan {
  const plan = planModelList(context, { kind: 'membership', assetId, included });
  expect(plan.kind).toBe('membership'); if (plan.kind !== 'membership') throw Error('not membership'); return plan;
}
function host(initial = fixture()) {
  const document = new RecordedDocument(), plans: ModelListPlan[] = []; let context = initial;
  const controls = createModelListControls(document.asDocument(), plan => {
    plans.push(plan); if (plan.kind === 'change' && modelListPlanIsCurrent(plan, context)) {
      context = { ...context, memory: plan.memory }; controls.render(context);
    }
  });
  controls.render(context); const root = record(controls.root), filters = root.children[0]!, search = filters.children[0]!.children[0]!;
  const filter = filters.children[1]!.children[0]!, status = root.children[1]!, failure = root.children[2]!, reveal = root.children[4]!, list = root.children[7]!;
  return { document, controls, root, search, filter, status, failure, reveal, list, plans,
    get context() { return context; }, render(next: ModelListContext) { if (controls.render(next)) context = next; } };
}

describe('disconnected Project model inventory (pure/DOM contracts, not browser or write evidence)', () => {
  it('lists all Project models, independently of rendering, without selecting a default', () => {
    let context = fixture(); const before = structuredClone(context), source = context.source;
    expect(modelListView(context).rows.map(row => row.item.id)).toEqual([a, b]); expect(context.memory.assetId).toBeNull();
    context = change(context, planModelList(context, { kind: 'select', assetId: a }));
    context = change(context, planModelList(context, { kind: 'scroll', top: 240 }));
    context = change(context, planModelList(context, { kind: 'search', query: '  脚 ' }));
    expect(modelListView(context).rows.map(row => row.item.id)).toEqual([b]); expect(context.memory.assetId).toBe(a);
    expect(modelListView(context).selectionVisible).toBe(false); expect(context.memory.scrollTop).toBe(240);
    context = change(context, planModelList(context, { kind: 'reveal' }));
    context = change(context, planModelList(context, { kind: 'filter', filter: 'included' }));
    expect(modelListView(context).rows.map(row => row.item.id)).toEqual([a]); expect(context.source).toBe(source);
    expect(source).toEqual(before.source);
  });

  it('keeps unknown search/membership/lifecycle candidates reviewable instead of choosing a winner', () => {
    const unknown = { ...item(b, ''), name: unresolved<string>(), lifecycle: unresolved<'active' | 'deleted'>(), membership: unresolved<ModelListItem['membership'] extends Field<infer T> ? T : never>() };
    const base = fixture(), context = withItems({ ...base, memory: { ...base.memory, query: 'absent', filter: 'included' } }, [item(a, 'known', true), unknown]);
    const view = modelListView(context); expect(view.rows.map(row => row.item.id)).toEqual([b]); expect(view.rows[0]?.uncertainMatch).toBe(true);
    expect(planModelList(context, { kind: 'membership', assetId: b, included: true }).kind).toBe('blocked');
    expect(planModelList(context, { kind: 'review', assetId: b })).toMatchObject({ kind: 'review', assetId: b });
    expect(modelListView(withItems(base, [{ ...unknown, lifecycle: value('deleted') }])).rows).toEqual([]);
  });

  it('emits exact Scene/Asset/edge intentions, even when an included model has unavailable binding or order', () => {
    const base = fixture(), unavailable = { ...item(a, 'Engine', true), membership: value({ kind: 'included' as const,
      membershipId: edge, sceneId: scene, assetId: a, orderKey: unresolved<string>() }), lifecycle: unresolved<'active' | 'deleted'>() };
    const context = withItems(base, [unavailable, item(b, '脚庫')]), before = structuredClone(context);
    expect(membership(context, a, false)).toEqual({ kind: 'membership', action: 'exclude', token: 'snapshot-1', projectId: project, sceneId: scene, assetId: a, membershipId: edge });
    expect(membership(context, b, true)).toEqual({ kind: 'membership', action: 'include', token: 'snapshot-1', projectId: project, sceneId: scene, assetId: b });
    expect(planModelList(context, { kind: 'membership', assetId: a, included: true }).kind).toBe('blocked');
    expect(context).toEqual(before); // No Caption/model data, ID allocation or publishing exists in this port.
  });

  it('refuses duplicate inventory, unresolved membership and wrong/reused edge identity', () => {
    const base = fixture();
    expect(modelListView(withItems(base, [item(a, 'one'), item(a, 'two')])).issue).toContain('重複');
    for (const patch of [{ sceneId: otherScene }, { assetId: b }, { membershipId: 'bad' }]) {
      const wrong = { ...item(a, 'one'), membership: value({ kind: 'included' as const, membershipId: edge, sceneId: scene, assetId: a, orderKey: value('A'), ...patch }) };
      expect(planModelList(withItems(base, [wrong]), { kind: 'membership', assetId: a, included: false }).kind).toBe('blocked');
    }
    const reused = withItems(base, [item(a, 'one', true), item(b, 'two', true)]);
    expect(planModelList(reused, { kind: 'membership', assetId: a, included: false }).kind).toBe('blocked');
    expect(planModelList(reused, { kind: 'membership', assetId: b, included: false }).kind).toBe('blocked');
  });

  it('blocks incompatible modes/access, while retaining independent finding memory', () => {
    const base = fixture();
    for (const patch of [{ pending: 'pinMove' as const }, { pending: 'text' as const }, { mutationBlock: '' }, { mutationBlock: '閲覧のみ' }]) {
      const context = { ...base, ...patch };
      expect(planModelList(context, { kind: 'membership', assetId: a, included: false }).kind).toBe('blocked');
      expect(planModelList(context, { kind: 'search', query: '入力' }).kind).toBe('change');
    }
    const composed = { ...base, memory: { ...base.memory, composing: true } };
    expect(planModelList(composed, { kind: 'select', assetId: a }).kind).toBe('blocked');
    expect(membership(composed, a, false).assetId).toBe(a); // Does not unmount or clear the search field.
    expect(planModelList(base, { kind: 'scroll', top: NaN }).kind).toBe('blocked');
  });

  it('revalidates exact effect scope/edge/access and retries the same target despite finding or selection changes', () => {
    const base = fixture(), plan = membership(base, a, false);
    let context = change(base, planModelList(base, { kind: 'select', assetId: b }));
    context = change(context, planModelList(context, { kind: 'search', query: '脚' }));
    expect(modelListPlanIsCurrent(plan, context)).toBe(true);
    const failed: ModelListContext = { ...context, feedback: { kind: 'failed', plan, message: '保存できません。' } };
    expect(planModelList(failed, { kind: 'retry' })).toBe(plan);
    expect(modelListPlanIsCurrent(plan, { ...context, feedback: { kind: 'applying', plan } })).toBe(true);
    expect(modelListPlanIsCurrent(plan, { ...context, feedback: { kind: 'applying', plan: membership(base, b, true) } })).toBe(false);
    for (const patch of [{ token: 'new' }, { projectId: 'other' }, { sceneId: otherScene }])
      expect(modelListPlanIsCurrent(plan, { ...context, source: { ...context.source, ...patch } })).toBe(false);
    expect(modelListPlanIsCurrent(plan, { ...context, mutationBlock: '未完了の統合' })).toBe(false);
    const replaced = { ...item(a, 'Engine', true), membership: value({ kind: 'included' as const, membershipId: id('sam', 9), sceneId: scene, assetId: a, orderKey: value('A') }) };
    expect(modelListPlanIsCurrent(plan, withItems(context, [replaced]))).toBe(false);
    const local = planModelList(base, { kind: 'search', query: 'test' });
    expect(modelListPlanIsCurrent(local, { ...base, memory: { ...base.memory } })).toBe(false);
  });

  it('shows observed checks and exact intentions, not optimistic success or accidental selection', () => {
    const h = host(), row = h.list.children[0]!, check = row.children[1]!.children[0]!;
    expect(check.checked).toBe(true); expect(check.disabled).toBe(false); expect(row.children[2]!.textContent).toContain('読み込めません');
    expect(check.attributes.get('aria-label')).toBe('このシーンに表示');
    expect(h.filter.attributes.get('aria-label')).toBe('一覧の範囲'); expect(h.reveal.textContent).toBe('選択したモデルを一覧に表示');
    expect(h.list.children[1]!.children[2]!.hidden).toBe(true); expect(h.list.children[1]!.children[3]!.hidden).toBe(true);
    check.checked = false; check.fire('change');
    expect(check.checked).toBe(true); expect(h.context.memory.assetId).toBeNull();
    expect(h.plans.at(-1)).toMatchObject({ kind: 'membership', action: 'exclude', assetId: a, membershipId: edge });
    h.render(withItems(h.context, [item(a, 'Engine'), item(b, '脚庫')])); expect(check.checked).toBe(false);
    expect(h.list.children[0]).toBe(row); h.controls.dispose();
  });

  it('separates uncertain membership, temporary hiding and model failure with contextual recovery', () => {
    const base = fixture(), unknown = { ...item(a, 'Engine'), membership: unresolved<ModelListItem['membership'] extends Field<infer T> ? T : never>() };
    const h = host(withItems(base, [unknown, { ...item(b, '脚庫'), display: value('temporarilyHidden') }]));
    const row = h.list.children[0]!, check = row.children[1]!.children[0]!;
    expect(check.indeterminate).toBe(true); expect(check.disabled).toBe(true); expect(check.checked).toBe(false);
    row.children[3]!.fire('click'); expect(h.plans.at(-1)).toMatchObject({ kind: 'review', assetId: a });
    expect(h.list.children[1]!.children[2]!.textContent).toContain('一時的に非表示');
    expect(h.root.children[6]!.textContent).toContain('モデルとキャプションは残ります'); h.controls.dispose();
  });

  it('keeps failures bound to the submitted model after selection/filter changes and renders untrusted text literally', () => {
    const base = fixture(), literal = '<img onerror=alert(1)>', context = withItems(base, [item(a, literal, true), item(b, '脚庫')]);
    const plan = membership(context, a, false), h = host({ ...context, feedback: { kind: 'failed', plan, message: literal } });
    h.list.children[1]!.children[0]!.fire('click'); h.search.value = '脚'; h.search.fire('input');
    expect(h.context.memory.assetId).toBe(b); expect(h.failure.hidden).toBe(false);
    expect(h.failure.children[0]!.textContent).toContain(literal); expect(h.failure.children[0]!.children).toEqual([]);
    h.failure.children[1]!.fire('click'); expect(h.plans.at(-1)).toBe(plan);
    h.failure.children[2]!.fire('click'); expect(h.plans.at(-1)).toMatchObject({ kind: 'review', assetId: a });
    h.render({ ...h.context, source: { ...h.context.source, token: 'new' } }); expect(h.failure.children[1]!.disabled).toBe(true);
    expect(h.failure.hidden).toBe(false); h.controls.dispose();
  });

  it('preserves IME, selection, keyed nodes and own scroll; refuses a cross-Scene render while input is pending', () => {
    const h = host(), first = h.list.children[0]!; first.children[0]!.fire('click');
    expect(h.root.children[8]!.children[1]!.textContent).toContain('すべてのシーンで共通');
    h.search.focus(); h.search.fire('compositionstart'); h.search.value = '脚'; h.search.fire('input');
    h.render({ ...h.context }); expect(h.search.value).toBe('脚'); expect(h.context.memory.query).toBe('脚');
    expect(h.controls.render({ ...h.context, source: { ...h.context.source, sceneId: otherScene } })).toBe(false);
    expect(h.controls.isComposing()).toBe(true); expect(h.document.activeElement).toBe(h.search);
    h.search.fire('compositionend'); expect(h.context.memory.composing).toBe(false); expect(h.context.memory.assetId).toBe(a);
    h.reveal.fire('click'); expect(h.context.memory.query).toBe(''); expect(h.context.memory.assetId).toBe(a);
    expect(h.plans.some(plan => plan.kind === 'membership')).toBe(false);
    h.list.clientHeight = 100; h.list.scrollTop = 70; h.list.fire('scroll'); expect(h.context.memory.scrollTop).toBe(70);
    const row = h.list.children[0]!; row.offsetTop = 250; row.offsetHeight = 44;
    h.controls.revealSelected(); expect(h.context.memory.scrollTop).toBe(194);
    h.list.clientHeight = 0; h.list.scrollTop = 0; h.list.fire('scroll'); expect(h.context.memory.scrollTop).toBe(194);
    h.controls.dispose();
  });

  it('distinguishes unavailable/empty/filtered inventories, retains missing selection and cleans up removed focused rows', () => {
    const h = host(), row = h.list.children[0]!, select = row.children[0]!;
    select.fire('click'); select.focus(); h.search.value = '脚'; h.search.fire('input');
    expect(h.document.activeElement).toBe(h.search); expect(h.search.focusCalls.at(-1)).toEqual({ preventScroll: true });
    const count = h.plans.length; select.fire('click'); expect(h.plans).toHaveLength(count);
    h.render({ ...h.context, source: { ...h.context.source, kind: 'unavailable', reason: '未完了の統合を復旧してください。' } });
    expect(h.status.textContent).toContain('復旧'); expect(h.list.children[0]!.textContent).toBe('モデル一覧を表示できません。');
    expect(h.context.memory.assetId).toBe(a); h.search.value = '保持'; h.search.fire('input'); expect(h.context.memory.query).toBe('保持');
    h.render(withItems(h.context, [item(a, 'known')])); expect(h.list.children[0]!.textContent).toContain('条件に一致');
    h.render(withItems(h.context, [])); expect(h.list.children[0]!.textContent).toBe('このプロジェクトにモデルはありません。');
    expect(h.status.textContent).toContain('選択したモデルがありません'); expect(h.context.memory.assetId).toBe(a);
    h.controls.dispose(); const after = h.plans.length; h.search.fire('input'); h.list.fire('scroll'); expect(h.plans).toHaveLength(after);
  });

  it('preserves stable focus and desired scroll across a synthetic clamp, with a hidden-root and inner-scroll CSS contract', () => {
    const base = fixture(), h = host({ ...base, memory: { ...base.memory, scrollTop: 240 } });
    const rows = [...h.list.children], button = rows[0]!.children[0]!; button.focus(); const focusCalls = button.focusCalls.length;
    let top = 0; Object.defineProperty(h.list, 'scrollTop', { get: () => top, set: (value: number) => { top = Math.min(value, 20); } });
    h.list.clientHeight = 100; h.render({ ...h.context }); h.list.fire('scroll');
    expect(h.context.memory.scrollTop).toBe(240); expect(top).toBe(20); expect(h.list.children).toEqual(rows);
    expect(button.focusCalls).toHaveLength(focusCalls); expect(h.document.activeElement).toBe(button);
    h.list.scrollTop = 10; h.list.fire('scroll'); expect(h.context.memory.scrollTop).toBe(10);
    const css = readFileSync('src/ui/projectScene/modelList.css', 'utf8');
    expect(css).toContain('.lv-model-browser[hidden]'); expect(css).toContain('overscroll-behavior: contain'); expect(css).toContain(':focus-visible');
    h.controls.dispose();
  });
});
