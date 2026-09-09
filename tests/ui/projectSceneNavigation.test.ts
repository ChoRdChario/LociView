import { describe, expect, it } from 'vitest';
import { value, type SceneState } from '../../src/scene/types';
import { navigationPlanIsCurrent, planNavigation, sceneChoices, taskLabels,
  type NavigationPlan, type NavigationSession, type PendingInteraction } from '../../src/ui/projectScene/navigationState';
import { createNavigationControls, type NavigationProps } from '../../src/ui/projectScene/navigationControls';

const a = 'scn_' + '1'.repeat(32), b = 'scn_' + '2'.repeat(32), c = 'scn_' + '3'.repeat(32);
function fixture(): { state: SceneState; session: NavigationSession } {
  const scene = (id: string, name: string, orderKey: string) => ({ id, name: value(name), orderKey: value(orderKey),
    defaultViewId: value<string | null>(null), lifecycle: value({ state: 'active' as const, eventId: 'evt_' + '1'.repeat(32) }) });
  return { state: { token: 'snapshot-1', defaultSceneId: { kind: 'unresolved', reason: 'conflict' },
    scenes: { [b]: scene(b, '比較', 'B'), [a]: scene(a, '全体', 'A') }, assetMemberships: {}, captionMemberships: {} },
  session: { sceneId: a, task: 'captions', sceneMemory: {
    [a]: { selectedCaptionId: 'cap_' + '1'.repeat(32), listScrollTop: 240, search: '場所', pinColors: ['#ff0000'], ownerFilter: { kind: 'all' } },
    [b]: { selectedCaptionId: null, listScrollTop: 10, search: '', pinColors: [], ownerFilter: { kind: 'all' } },
  } } };
}

/** Minimal DOM contract recorder, deliberately not a browser/layout/keyboard emulator. */
class Node {
  children: Node[] = []; parent?: Node; attributes = new Map<string, string>(); dataset: Record<string, string> = {};
  textContent = ''; className = ''; id = ''; value = ''; disabled = false; type = '';
  listeners = new Map<string, Set<() => void>>();
  constructor(readonly tag: string) {}
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  append(...children: Node[]) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children: Node[]) { this.children = []; this.append(...children); }
  addEventListener(event: string, handler: () => void) { const set = this.listeners.get(event) ?? new Set(); set.add(handler); this.listeners.set(event, set); }
  removeEventListener(event: string, handler: () => void) { this.listeners.get(event)?.delete(handler); }
  fire(event: string) { for (const handler of this.listeners.get(event) ?? []) handler(); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
}
const documentPort = { createElement: (tag: string) => new Node(tag) } as unknown as Document;

describe('disconnected ProjectScene navigation: UI intentions, not storage/render acceptance', () => {
  it('A/B/A and task changes retain UI memories and source data; entry effect occurs only on a real Scene change', () => {
    const { state, session } = fixture(); const before = structuredClone({ state, session });
    const tab = planNavigation(state, session, 'composition', { kind: 'task', task: 'models' });
    expect(tab.kind).toBe('change'); if (tab.kind !== 'change') return;
    expect(tab.enterScene).toBeUndefined(); expect(tab.session.sceneId).toBe(a);
    expect(tab.session.sceneMemory).toBe(session.sceneMemory);
    const changed = planNavigation(state, tab.session, null, { kind: 'scene', sceneId: b });
    expect(changed.kind).toBe('change'); if (changed.kind !== 'change') return;
    expect(changed.enterScene).toBe(b); expect(changed.session.task).toBe('models');
    expect(planNavigation(state, changed.session, null, { kind: 'scene', sceneId: b }).kind).toBe('unchanged');
    const returned = planNavigation(state, changed.session, null, { kind: 'scene', sceneId: a });
    expect(returned.kind).toBe('change'); if (returned.kind !== 'change') return;
    expect(returned.session.sceneMemory).toBe(session.sceneMemory);
    expect(returned.session.sceneMemory[a]).toEqual(before.session.sceneMemory[a]);
    expect({ state, session }).toEqual(before);
    expect(navigationPlanIsCurrent(changed, state, tab.session, null)).toBe(true);
    expect(navigationPlanIsCurrent(changed, { ...state, token: 'new' }, tab.session, null)).toBe(false);
    expect(navigationPlanIsCurrent(changed, state, changed.session, null)).toBe(false);
    expect(navigationPlanIsCurrent(changed, state, tab.session, 'text')).toBe(false);
  });

  it('blocks Scene changes for each uncommitted interaction, never tab changes or same-Scene no-ops', () => {
    const { state, session } = fixture();
    for (const pending of ['text', 'composition', 'pinPlacement', 'pinMove', 'modelTransform'] as PendingInteraction[]) {
      const result = planNavigation(state, session, pending, { kind: 'scene', sceneId: b });
      expect(result.kind).toBe('blocked'); if (result.kind === 'blocked') expect(result.reason).toBeTruthy();
      expect(result.session).toBe(session);
      expect(planNavigation(state, session, pending, { kind: 'task', task: 'views' }).kind).toBe('change');
      expect(planNavigation(state, session, pending, { kind: 'scene', sceneId: a }).kind).toBe('unchanged');
    }
  });

  it('never guesses a default, lifecycle/name/order winner or a missing Scene', () => {
    const { state, session } = fixture();
    expect(planNavigation(state, { ...session, sceneId: null }, null, { kind: 'task', task: 'models' }).session.sceneId).toBeNull();
    expect(sceneChoices(state).map(item => item.id)).toEqual([a, b]);
    const conflicted: SceneState = { ...state, scenes: {
      ...state.scenes, [a]: { ...state.scenes[a]!, name: { kind: 'unresolved', reason: 'conflict' },
        orderKey: { kind: 'unresolved', reason: 'conflict' } },
      [b]: { ...state.scenes[b]!, lifecycle: { kind: 'unresolved', reason: 'conflict' } },
    } };
    expect(sceneChoices(conflicted)).toEqual([
      { id: b, label: '比較（要確認）', available: false },
      { id: a, label: '名称を確認（順序を確認）', available: true },
    ]);
    expect(planNavigation(conflicted, session, null, { kind: 'scene', sceneId: b }).kind).toBe('blocked');
    expect(planNavigation(state, session, null, { kind: 'scene', sceneId: c }).kind).toBe('blocked');
  });

  it('renders separate slots and concise labels, reports failure, and does not change the pressed Scene before host acceptance', () => {
    const { state, session } = fixture(); const plans: NavigationPlan[] = [];
    const controls = createNavigationControls(documentPort, plan => plans.push(plan));
    const props: NavigationProps = { scenes: state, session, pending: null,
      save: { kind: 'failed', message: '容量を確保して再試行してください。' } };
    controls.render(props);
    const sceneRoot = controls.sceneControl as unknown as Node, tasks = controls.taskControl as unknown as Node;
    const select = sceneRoot.children[1]!;
    expect(select.attributes.get('aria-label')).toBe('シーン');
    expect(select.attributes.get('aria-describedby')).toBe(sceneRoot.children[2]!.id);
    expect(tasks.children.map(button => button.textContent)).toEqual(Object.values(taskLabels));
    expect(tasks.children[0]!.attributes.get('aria-pressed')).toBe('true');
    expect(controls.saveStatus.textContent).toContain('保存できませんでした');
    const optionsBefore = select.children;
    select.children.find(n => n.textContent === '比較')!.fire('click');
    expect(select.children[0]!.attributes.get('aria-pressed')).toBe('true'); expect(plans[0]).toMatchObject({ kind: 'change', enterScene: b });
    expect(controls.saveStatus.textContent).toContain('保存できませんでした');
    expect(props.save.kind).toBe('failed'); expect(props.session).toBe(session);
    controls.render({ ...props, save: { kind: 'saving' } });
    expect(select.children).toBe(optionsBefore);
    controls.render({ ...props, pending: 'pinMove' });
    expect(select.children.every(n => n.disabled)).toBe(true); expect(sceneRoot.children[2]!.textContent).toContain('ピンの移動');
    tasks.children[1]!.fire('click'); expect(plans.at(-1)).toMatchObject({ kind: 'change', session: { task: 'models' } });
    select.children.find(n => n.textContent === '比較')!.fire('click'); expect(plans.at(-1)).toMatchObject({ kind: 'change', session: { task: 'models' } }); expect(select.children[0]!.attributes.get('aria-pressed')).toBe('true');
    const count = plans.length; controls.dispose(); tasks.children[0]!.fire('click'); select.children[0]?.fire('click');
    expect(plans).toHaveLength(count);
  });

  it('passes imported strings as text and leaves no-Scene state recoverable without selecting an alternative', () => {
    const { state, session } = fixture(); const controls = createNavigationControls(documentPort, () => {});
    const literal = '<img src=x onerror=alert(1)>';
    controls.render({ scenes: { ...state, scenes: { [a]: { ...state.scenes[a]!, name: value(literal) } } },
      session, pending: null, save: { kind: 'recovery', message: literal } });
    const select = (controls.sceneControl as unknown as Node).children[1]!;
    expect(select.children[0]!.textContent).toBe(literal); expect(select.children[0]!.children).toEqual([]);
    expect(controls.saveStatus.textContent).toContain(literal);
    controls.render({ scenes: { ...state, scenes: {} }, session: { ...session, sceneId: null }, pending: null, save: { kind: 'unsaved' } });
    expect(select.children.every(n => n.disabled)).toBe(true); expect(select.children).toEqual([]);
    expect((controls.sceneControl as unknown as Node).children[2]!.textContent).toContain('状態を確認');
    expect(controls.saveStatus.textContent).toBe('未保存');
  });

  it('explains a missing, deleted or unresolved current Scene without silently selecting an available alternative', () => {
    for (const currentState of ['missing', 'deleted', 'unresolved'] as const) {
      const { state, session } = fixture(); const plans: NavigationPlan[] = [];
      const scenes = { ...state.scenes };
      if (currentState === 'missing') delete scenes[a];
      else scenes[a] = { ...scenes[a]!, lifecycle: currentState === 'deleted'
        ? value({ state: 'deleted', eventId: 'evt_' + '2'.repeat(32), reason: 'userDelete' })
        : { kind: 'unresolved', reason: 'conflict' } };
      const controls = createNavigationControls(documentPort, plan => plans.push(plan));
      const props: NavigationProps = { scenes: { ...state, scenes }, session, pending: null, save: { kind: 'unsaved' } };
      controls.render(props);
      const root = controls.sceneControl as unknown as Node, select = root.children[1]!;
      const previousValue = currentState === 'unresolved' ? a : '';
      expect(select.children.some(n => n.textContent === '比較' && !n.disabled)).toBe(true);
      expect(select.children.find(option => option.textContent === '比較')?.disabled).toBe(false);
      if (previousValue === '') expect(select.children.every(n => n.attributes.get('aria-pressed') === 'false')).toBe(true);
      expect(root.children[2]!.textContent).toContain('現在のシーンを表示できません');
      expect(root.children[2]!.textContent).toContain('別のシーンを選択');
      expect(plans).toEqual([]); expect(session.sceneId).toBe(a);
      select.children.find(n => n.textContent === '比較')!.fire('click');
      expect(plans.at(-1)).toMatchObject({ kind: 'change', enterScene: b });
      expect(session.sceneId).toBe(a); expect(controls.saveStatus.textContent).toBe('未保存');
      controls.render({ ...props, pending: 'text' });
      expect(select.children.every(n => n.disabled)).toBe(true);
      expect(root.children[2]!.textContent).toContain('現在のシーンを表示できません');
      expect(root.children[2]!.textContent).toContain('入力を確定');
      controls.render({ ...props, session: { ...session, sceneId: b } });
      expect(select.children.find(n => n.textContent === '比較')?.attributes.get('aria-pressed')).toBe('true'); expect(root.children[2]!.textContent).toBe('');
      expect(controls.sceneContext.textContent).toBe('シーン：比較');
      controls.dispose();
    }
  });
});
