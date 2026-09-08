import { describe, expect, it } from 'vitest';
import { value, type Field, type SceneState, type SceneResources } from '../../src/scene/types';
import { planSceneCommand } from '../../src/scene/commands';
import { captionIncludePlanIsCurrent, captionIncludeView, captionIncludeIssue, newCaptionIncludeMemory, planCaptionInclude,
  type CaptionIncludeContext, type CaptionIncludePlan, type CaptionIncludeSource } from '../../src/ui/projectScene/captionIncludeState';
import { createCaptionIncludeControls } from '../../src/ui/projectScene/captionIncludeControls';
import { RecordedDocument, record } from './domRecorder';

const id = (kind: string, n: number) => `${kind}_${n.toString(16).padStart(32, '0')}`;
const scene = id('scn', 1), caption = id('cap', 1), second = id('cap', 2), asset = id('ast', 1);
const unresolved = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
function source(): CaptionIncludeSource & { kind: 'ready' } {
  return { kind: 'ready', sceneId: scene, token: 'one', items: [caption, second].map((key, index) => ({
    caption: { id: key, title: value(index ? '遠景' : '調査記録'), body: value('位置の記録'), color: value('#abcdef'),
      owner: value({ kind: 'asset' as const, assetId: asset, name: value('建物') }), mediaCount: value(0), pin: 'ownerHidden' as const },
    lifecycle: value('active' as const), membership: value(index ? 'included' as const : 'absent' as const),
  })) };
}
function context(): CaptionIncludeContext {
  return { source: source(), memory: newCaptionIncludeMemory(scene), pending: null, mutationBlock: null, feedback: { kind: 'idle' } };
}
const selected = (): CaptionIncludeContext => ({ ...context(), memory: { ...newCaptionIncludeMemory(scene), captionId: caption } });
function host() {
  const events: CaptionIncludePlan[] = []; let current = context();
  const controls = createCaptionIncludeControls(new RecordedDocument().asDocument(), plan => {
    events.push(plan);
    if (plan.kind === 'change' && captionIncludePlanIsCurrent(plan, current)) { current = { ...current, memory: plan.memory }; controls.render(current); }
  });
  controls.render(current); const root = record(controls.root);
  return { controls, events, root, search: root.children[1]!.children[0]!, choices: root.children[2]!.children[0]!,
    selected: root.children[3]!, status: root.children[4]!, include: root.children[5]!, review: root.children[6]!,
    get context() { return current; }, render(next: CaptionIncludeContext) { if (controls.render(next)) current = next; } };
}

describe('disconnected existing-Project Caption inclusion', () => {
  it('requires explicit identity and emits membership-only intent; hidden owner stays hidden', () => {
    expect(planCaptionInclude(context(), { kind: 'include' }).kind).toBe('blocked');
    const ctx = selected(), before = structuredClone(ctx.source), plan = planCaptionInclude(ctx, { kind: 'include' });
    expect(plan).toMatchObject({ kind: 'include', captionId: caption, sceneId: scene });
    expect(Object.keys(plan).sort()).toEqual(['baseMemory', 'captionId', 'kind', 'sceneId', 'token']);
    expect(ctx.source).toEqual(before); expect(captionIncludePlanIsCurrent(plan, ctx)).toBe(true);
    expect(planCaptionInclude({ ...ctx, memory: { ...ctx.memory, captionId: second } }, { kind: 'include' }).kind).toBe('blocked');
  });

  it('can feed the existing Scene command without copying Caption data or adding owner membership', () => {
    const ctx = selected(), intent = planCaptionInclude(ctx, { kind: 'include' });
    if (intent.kind !== 'include') throw Error('missing intent');
    const lifecycle = value({ state: 'active' as const, eventId: id('evt', 1) });
    const state: SceneState = { token: 'one', defaultSceneId: value(scene), scenes: { [scene]: { id: scene, lifecycle,
      name: value('現地'), orderKey: value('A'), defaultViewId: value(null) } }, assetMemberships: {}, captionMemberships: {} };
    const resources: SceneResources = { token: 'one', projectFrameId: 'frame', assets: {}, views: {}, materials: {},
      captions: { [caption]: { id: caption, lifecycle, title: value('記録'), body: value('本文'),
        anchor: value({ kind: 'project', projectFrameId: 'frame', positionProject: [0, 0, 0] }) } } };
    const before = structuredClone(resources);
    const plan = planSceneCommand(state, resources, { kind: 'include', resourceKind: 'caption', sceneId: intent.sceneId,
      resourceId: intent.captionId, membershipId: id('scm', 1), orderKey: 'A' }, id('evt', 2));
    expect(plan.next.captionMemberships[id('scm', 1)]?.resourceId).toBe(caption);
    expect(plan.next.assetMemberships).toEqual({}); expect(resources).toEqual(before); expect(state.captionMemberships).toEqual({});
  });

  it('blocks unresolved/deleted membership or lifecycle but not independent title/owner conflicts', () => {
    const ctx = selected(), current = source(), row = current.items[0]!;
    for (const patch of [{ membership: unresolved<'absent' | 'included'>() }, { lifecycle: unresolved<'active' | 'deleted'>() },
      { lifecycle: value('deleted' as const) }]) {
      expect(planCaptionInclude({ ...ctx, source: { ...current, items: [{ ...row, ...patch }] } }, { kind: 'include' }).kind).toBe('blocked');
    }
    const independent = { ...row, caption: { ...row.caption, title: unresolved<string>(), owner: unresolved<typeof row.caption.owner extends Field<infer T> ? T : never>() } };
    expect(planCaptionInclude({ ...ctx, source: { ...current, items: [independent] } }, { kind: 'include' }).kind).toBe('include');
    expect(captionIncludeView({ ...ctx, source: { ...current, items: [row, row] } }).rows).toEqual([]);
    expect(captionIncludeView({ ...ctx, source: { ...current, sceneId: 'other' } }).rows).toEqual([]);
  });

  it('guards source/memory, mutation rights, other pending input and IME without treating failure as success', () => {
    const ctx = selected(), plan = planCaptionInclude(ctx, { kind: 'include' });
    for (const patch of [{ mutationBlock: '' }, { pending: 'pinMove' as const }, { memory: { ...ctx.memory, composing: true } },
      { source: { ...ctx.source, token: 'new' } }]) expect(captionIncludePlanIsCurrent(plan, { ...ctx, ...patch })).toBe(false);
    expect(captionIncludeIssue({ ...ctx, feedback: { kind: 'applying' } })).toContain('追加中');
    expect(planCaptionInclude({ ...ctx, feedback: { kind: 'failed', message: '再試行' } }, { kind: 'include' }).kind).toBe('include');
  });

  it('retains selected item outside search, literal names and failure for retry; never auto-opens owner', () => {
    const h = host(); expect(h.include.disabled).toBe(true);
    h.choices.value = caption; h.choices.fire('change'); expect(h.include.disabled).toBe(false);
    expect(h.selected.textContent).toContain('モデルは非表示');
    h.search.value = '遠景'; h.search.fire('input'); expect(h.choices.value).toBe(caption);
    expect(h.choices.children.some(child => child.textContent.includes('検索条件の外'))).toBe(true);
    h.include.fire('click'); expect(h.events.at(-1)?.kind).toBe('include');
    h.render({ ...h.context, feedback: { kind: 'failed', message: '<img src=x>' } });
    expect(h.status.textContent).toContain('<img src=x>'); expect(h.status.children).toEqual([]);
    expect(h.context.memory.captionId).toBe(caption); expect(h.include.disabled).toBe(false);
    expect(h.status.textContent).not.toContain('保存済み'); h.controls.dispose();
  });

  it('keeps composition/search after inventory loss, blocks cross-Scene render and cleans listeners', () => {
    const h = host(), input = h.search;
    h.search.fire('compositionstart'); h.search.value = '調査'; h.search.fire('input');
    h.render({ ...h.context, source: { kind: 'unavailable', token: 'missing', sceneId: scene, reason: '復旧してください。' } });
    expect(h.search).toBe(input); expect(h.search.value).toBe('調査'); expect(h.include.disabled).toBe(true);
    expect(h.controls.render({ ...h.context, source: { ...h.context.source, sceneId: 'other' } })).toBe(false);
    h.search.fire('compositionend'); expect(h.context.memory.composing).toBe(false); expect(h.context.memory.query).toBe('調査');
    const count = h.events.length; h.controls.dispose(); h.search.fire('input'); h.include.fire('click'); expect(h.events).toHaveLength(count);
  });
});
