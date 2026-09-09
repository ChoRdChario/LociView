import { describe, expect, it } from 'vitest';
import { value, type Field } from '../../src/scene/types';
import { captionColorKey, captionListPlanIsCurrent, captionListView, ownerFilterKey, planCaptionList,
  type CaptionListContext, type CaptionListItem, type CaptionListPlan } from '../../src/ui/projectScene/captionListState';
import { createCaptionListControls } from '../../src/ui/projectScene/captionListControls';
import { planNavigation } from '../../src/ui/projectScene/navigationState';
import { RecordedDocument, record } from './domRecorder';

const a = 'cap_' + '1'.repeat(32), b = 'cap_' + '2'.repeat(32), c = 'cap_' + '3'.repeat(32);
const model = 'ast_' + '1'.repeat(32), scene = 'scn_' + '1'.repeat(32);
const red = '#ff0000', blue = '#0000ff';
const unresolved = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
const item = (id: string, title: string, color: string): CaptionListItem => ({ id, title: value(title), body: value('記録'),
  color: value(color), owner: value({ kind: 'asset', assetId: model, name: value('試験モデル') }), mediaCount: value(2), pin: 'visible' });
function fixture(): CaptionListContext {
  return { source: { kind: 'ready', token: 'snapshot-1', sceneId: scene,
    captions: [item(a, 'Engine', red), { ...item(b, '脚庫', blue), body: value('Landing GEAR'), owner: value({ kind: 'project' }) }] },
  memory: { selectedCaptionId: a, listScrollTop: 240, search: '', ownerFilter: { kind: 'all' }, pinColors: null },
  pending: null, mutationBlock: null };
}
function change(context: CaptionListContext, plan: CaptionListPlan): CaptionListContext {
  expect(plan.kind).toBe('change'); if (plan.kind !== 'change') throw Error('not a change');
  expect(captionListPlanIsCurrent(plan, context)).toBe(true); return { ...context, memory: plan.memory };
}
function host(initial = fixture()) {
  const document = new RecordedDocument(); const plans: CaptionListPlan[] = []; const compositions: boolean[] = [];
  let context = initial;
  const controls = createCaptionListControls(document.asDocument(), plan => {
    plans.push(plan);
    if (plan.kind === 'change' && captionListPlanIsCurrent(plan, context)) { context = { ...context, memory: plan.memory }; controls.render(context); }
  }, active => compositions.push(active));
  controls.render(context);
  const root = record(controls.root), filters = root.children[0]!, search = filters.children[0]!.children[0]!;
  const status = root.children[1]!, reveal = root.children[2]!;
  const colorBar = root.children[4]!, colorChoices = colorBar.children[1]!, all = colorBar.children[2]!, list = root.children[5]!;
  return { document, controls, root, search, status, reveal, colorBar, colorChoices, all, list, plans, compositions,
    get context() { return context; }, render(next: CaptionListContext) { if (controls.render(next)) context = next; } };
}

describe('disconnected Caption list contracts (not browser/render/storage evidence)', () => {
  it('matches title OR body without legacy owner classification hiding records', () => {
    let context = fixture(); const before = structuredClone(context);
    context = change(context, planCaptionList(context, { kind: 'search', query: '  gear ' }));
    expect(captionListView(context.source, context.memory).rows.map(row => row.item.id)).toEqual([b]);
    context = change(context, planCaptionList(context, { kind: 'owner', filter: { kind: 'asset', assetId: model } }));
    expect(captionListView(context.source, context.memory).rows.map(row => row.item.id)).toEqual([b]);
    expect(context.memory.selectedCaptionId).toBe(a); expect(context.memory.listScrollTop).toBe(240);
    context = change(context, planCaptionList(context, { kind: 'owner', filter: { kind: 'project' } }));
    expect(captionListView(context.source, context.memory).rows.map(row => row.item.id)).toEqual([b]);
    expect(context.source).toEqual(before.source);
  });

  it('retains uncertain text/owner matches as review rows and never chooses a default color', () => {
    const context = fixture(); if (context.source.kind !== 'ready') return;
    const uncertain = { ...item(c, 'unknown', red), title: unresolved<string>(), body: unresolved<string>(), owner: unresolved<CaptionListItem['owner'] extends Field<infer T> ? T : never>(), color: unresolved<string>() };
    const source = { ...context.source, captions: [...context.source.captions, uncertain] };
    const view = captionListView(source, { ...context.memory, search: 'missing', ownerFilter: { kind: 'asset', assetId: model } });
    expect(view.rows.map(row => row.item.id)).toEqual([c]); expect(view.rows[0]?.uncertainMatch).toBe(true);
    expect(view.rows[0]?.color).toBeNull(); expect(view.colors).toEqual([red, blue]);
    expect(captionListView(source, { ...context.memory, pinColors: [] }).rows.map(row => row.item.id)).toEqual([c]);
    expect(view.owners.some(owner => owner.filter.kind === 'unresolved')).toBe(true);
    expect(captionColorKey(value('url(https://untrusted.example/a)'))).toBeNull();
    expect(captionColorKey(value('#aBc'))).toBe('#aabbcc');
  });

  it('color filtering also hides rows; zero stays zero, explicit all differs from future-inclusive all', () => {
    let context = fixture(); const source = context.source;
    for (const color of [red, blue]) context = change(context, planCaptionList(context, { kind: 'color', color }));
    expect(context.memory.pinColors).toEqual([]);
    let view = captionListView(source, context.memory);
    expect(view.rows).toEqual([]); expect(view.selectionVisible).toBe(false);
    for (const color of [red, blue]) context = change(context, planCaptionList(context, { kind: 'color', color }));
    expect(context.memory.pinColors).toEqual([red, blue]);
    if (source.kind !== 'ready') return;
    const future = { ...source, captions: [...source.captions, item(c, 'new', '#123456')] };
    expect(captionListView(future, context.memory).rows.some(row => row.item.id === c)).toBe(false);
    context = change(context, planCaptionList(context, { kind: 'allColors' }));
    expect(captionListView(future, context.memory).rows.at(-1)?.colorHidden).toBe(false);
    expect(context.source).toBe(source); expect(context.memory.selectedCaptionId).toBe(a);
  });

  it('blocks selection while drafts/modes are pending, allows filtering, rejects stale effects and requests explicit model recovery', () => {
    const context = fixture(); if (context.source.kind !== 'ready') return;
    const source = { ...context.source, captions: [{ ...context.source.captions[0]!, pin: 'ownerHidden' as const }] };
    const blocked = { ...context, source, pending: 'pinMove' as const };
    expect(planCaptionList({ ...context, pending: 'text' }, { kind: 'select', captionId: b }).kind).toBe('blocked');
    expect(planCaptionList(blocked, { kind: 'select', captionId: a }).kind).toBe('unchanged');
    expect(planCaptionList(blocked, { kind: 'showModel', captionId: a }).kind).toBe('blocked');
    expect(planCaptionList(blocked, { kind: 'search', query: 'test' }).kind).toBe('change');
    const available = { ...context, source }, plan = planCaptionList(available, { kind: 'showModel', captionId: a });
    expect(plan).toMatchObject({ kind: 'effect', action: 'showModel', assetId: model, captionId: a });
    expect(captionListPlanIsCurrent(plan, available)).toBe(true);
    expect(captionListPlanIsCurrent(plan, { ...available, source: { ...source, token: 'new' } })).toBe(false);
    expect(captionListPlanIsCurrent(plan, { ...available, memory: { ...available.memory } })).toBe(false);
    expect(captionListPlanIsCurrent(plan, { ...available, mutationBlock: '閲覧のみ' })).toBe(false);
    expect(captionListPlanIsCurrent(plan, blocked)).toBe(false);
    expect(planCaptionList(context, { kind: 'showModel', captionId: b }).kind).toBe('blocked');
    expect(planCaptionList(context, { kind: 'select', captionId: c }).kind).toBe('blocked');
  });

  it('keeps memories across navigation and cannot treat unavailable or duplicate projections as an empty successful list', () => {
    const context = fixture(); const otherScene = 'scn_' + '2'.repeat(32);
    const session = { sceneId: scene, task: 'captions' as const, sceneMemory: { [scene]: context.memory } };
    const tab = planNavigation({ token: '1', defaultSceneId: value(scene), scenes: {}, assetMemberships: {}, captionMemberships: {} }, session, null, { kind: 'task', task: 'views' });
    expect('session' in tab && tab.session.sceneMemory[scene]).toBe(context.memory);
    const plan = planCaptionList(context, { kind: 'select', captionId: b });
    expect(captionListPlanIsCurrent(plan, { ...context, source: { ...context.source, sceneId: otherScene } })).toBe(false);
    const unavailable = { kind: 'unavailable' as const, token: '1', sceneId: scene, reason: '未完了の統合を復旧してください。' };
    expect(captionListView(unavailable, context.memory).issue).toContain('復旧');
    expect(planCaptionList({ ...context, source: unavailable }, { kind: 'select', captionId: a }).kind).toBe('blocked');
    if (context.source.kind !== 'ready') return;
    expect(captionListView({ ...context.source, captions: [item(a, 'one', red), item(a, 'two', blue)] }, context.memory).issue).not.toBeNull();
  });

  it('renders color circles immediately above the list with native pressed states and retains keyed rows/focus/scroll', () => {
    const h = host(); h.list.clientHeight = 100;
    expect(h.root.children.indexOf(h.list) - h.root.children.indexOf(h.colorBar)).toBe(1);
    expect(h.search.attributes.get('aria-label')).toBe('検索'); expect(h.root.children[0]!.children).toHaveLength(1);
    const first = h.list.children[0]!, select = first.children[0]!, redButton = h.colorChoices.children[0]!;
    select.focus(); h.colorChoices.children[1]!.fire('click');
    expect(h.list.children[0]).toBe(first); expect(select.attributes.get('aria-current')).toBe('true');
    expect(h.document.activeElement).toBe(select); expect(select.focusCalls.at(-1)).toEqual({ preventScroll: true });
    expect(h.list.scrollTop).toBe(240); expect(redButton.attributes.get('aria-pressed')).toBe('true');
    expect(h.list.children).toHaveLength(1);
    redButton.fire('click'); expect(h.context.memory.selectedCaptionId).toBe(a);
    expect(h.document.activeElement).toBe(h.search); expect(h.reveal.hidden).toBe(false);
    h.reveal.fire('click'); expect(h.context.memory.pinColors).toBeNull(); expect(h.list.children).toHaveLength(2);
    h.list.scrollTop = 310; h.list.fire('scroll'); expect(h.context.memory.listScrollTop).toBe(310);
    h.list.clientHeight = 0; h.list.scrollTop = 0; h.list.fire('scroll'); expect(h.context.memory.listScrollTop).toBe(310);
    h.controls.dispose();
  });

  it('keeps selection when search hides its row, offers explicit reveal and preserves IME across refresh/Scene refusal', () => {
    const h = host(); h.search.focus(); h.search.fire('compositionstart'); h.search.value = '脚'; h.search.fire('input');
    h.render({ ...h.context }); expect(h.search.value).toBe('脚'); expect(h.context.memory.search).toBe('');
    expect(h.controls.render({ ...h.context, source: { ...h.context.source, sceneId: 'other' } })).toBe(false);
    expect(h.controls.isComposing()).toBe(true); expect(h.status.textContent).toContain('入力を確定');
    h.search.fire('compositionend'); expect(h.context.memory.search).toBe('脚'); expect(h.compositions).toEqual([true, false]);
    expect(h.context.memory.selectedCaptionId).toBe(a); expect(h.reveal.hidden).toBe(false);
    expect(h.status.textContent).toContain('絞り込みで非表示');
    h.reveal.fire('click'); expect(h.context.memory.search).toBe(''); expect(h.context.memory.selectedCaptionId).toBe(a);
    expect(h.list.children).toHaveLength(2); expect(h.reveal.hidden).toBe(true);
    h.controls.dispose();
  });

  it('keeps unavailable/hidden-owner recovery visible, uses safe text, and never turns failure or read-only state into a save', () => {
    const context = fixture(); if (context.source.kind !== 'ready') return;
    const literal = '<img onerror=alert(1)>';
    const h = host({ ...context, source: { ...context.source, captions: [{ ...item(a, literal, red), pin: 'ownerHidden' }] }, mutationBlock: '編集モードに切り替えてください。' });
    const row = h.list.children[0]!, button = row.children[0]!, recovery = row.children[1]!;
    expect(button.children[1]!.textContent).toBe(literal); expect(button.children[1]!.children).toEqual([]);
    expect(recovery.textContent).toBe('モデルを表示'); expect(recovery.disabled).toBe(true);
    expect(button.children[3]!.textContent).toContain('編集モード');
    h.render({ ...h.context, source: { ...h.context.source, kind: 'unavailable', reason: literal } });
    expect(h.status.textContent).toBe(literal); expect(h.search.disabled).toBe(true); expect(h.all.disabled).toBe(true);
    h.controls.dispose();
  });

  it('retains a filtered review selection and explicitly reveals its recovery action', () => {
    const context = fixture(); if (context.source.kind !== 'ready') return;
    const h = host({ ...context, source: { ...context.source, captions: [{ ...item(a, '確認対象', red), pin: 'needsReview' }] },
      memory: { ...context.memory, selectedCaptionId: a, pinColors: [] } });
    expect(h.reveal.hidden).toBe(false); h.reveal.fire('click');
    const row = h.list.children[0]!, select = row.children[0]!, action = row.children[1]!;
    expect(select.children[3]!.textContent).toContain('ピン位置を確認');
    expect(action.hidden).toBe(false); expect(action.textContent).toBe('状態を確認');
    select.fire('click'); expect(h.context.memory.selectedCaptionId).toBe(a);
    expect(h.context.memory.pinColors).toBeNull(); h.controls.dispose();
  });

  it('retains missing owner/color memory, explains missing selection and scrolls only the inner list on explicit reveal', () => {
    const h = host(); const before = h.context;
    h.render({ ...before, memory: { ...before.memory, pinColors: [red], ownerFilter: { kind: 'asset', assetId: 'absent' } } });
    expect(h.list.children).toHaveLength(1); expect(h.status.textContent).not.toContain('モデルを選び直して');
    expect(h.context.memory.pinColors).toEqual([red]);
    h.render(before); h.list.clientHeight = 100; h.list.scrollTop = 0;
    h.list.children[0]!.offsetTop = 250; h.list.children[0]!.offsetHeight = 44;
    h.controls.revealSelected(); expect(h.list.scrollTop).toBe(194); expect(h.context.memory.listScrollTop).toBe(194);
    h.render({ ...h.context, memory: { ...h.context.memory, selectedCaptionId: c } });
    expect(h.status.textContent).toContain('このシーンにありません'); expect(h.context.memory.selectedCaptionId).toBe(c);
    const count = h.plans.length; const rowButton = h.list.children[0]!.children[0]!;
    h.controls.dispose(); rowButton.fire('click'); h.search.fire('input'); h.all.fire('click');
    expect(h.plans).toHaveLength(count);
    expect(ownerFilterKey({ kind: 'project' })).not.toBe(ownerFilterKey({ kind: 'unresolved' }));
  });

  it('retains 100 ordered rows and ignores a synthetic clamped restore event instead of overwriting desired scroll memory', () => {
    const context = fixture(); if (context.source.kind !== 'ready') return;
    const captions = Array.from({ length: 100 }, (_, index) => item(`cap_${index.toString(16).padStart(32, '0')}`, `記録 ${index}`, red));
    const h = host({ ...context, source: { ...context.source, captions } });
    expect(h.list.children).toHaveLength(100);
    const originalRows = [...h.list.children];
    expect(originalRows.map(row => row.children[0]!.children[1]!.textContent)).toEqual(captions.map(item => item.title.kind === 'value' ? item.title.value : ''));
    // Inject only the clamp/event contract, not actual layout or native scrolling.
    let recordedTop = 0;
    Object.defineProperty(h.list, 'scrollTop', { get: () => recordedTop, set: (value: number) => { recordedTop = Math.min(value, 20); } });
    h.list.clientHeight = 100; h.render({ ...h.context }); h.list.fire('scroll');
    expect(h.context.memory.listScrollTop).toBe(240); expect(recordedTop).toBe(20);
    expect(h.list.children).toEqual(originalRows);
    h.list.scrollTop = 10; h.list.fire('scroll'); expect(h.context.memory.listScrollTop).toBe(10);
    h.controls.dispose();
  });
});
