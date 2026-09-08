import { describe, expect, it } from 'vitest';
import { value } from '../../src/scene/types';
import type { CaptionListSource } from '../../src/ui/projectScene/captionListState';
import { captionWindowPlanIsCurrent, captionWindowView, newCaptionWindowMemory, planCaptionWindow,
  type CaptionWindowIntent, type CaptionWindowMemory } from '../../src/ui/projectScene/captionWindowState';

const a = 'cap_' + '1'.repeat(32), b = 'cap_' + '2'.repeat(32), sceneA = 'scn_' + '1'.repeat(32), sceneB = 'scn_' + '2'.repeat(32);
const source: CaptionListSource = { kind: 'ready', token: 'one', sceneId: sceneA,
  captions: [a, b].map(id => ({ id, title: value('比較'), body: value('記録'), color: value('#abcdef'),
    owner: value({ kind: 'project' }), mediaCount: value(0), pin: 'visible' })) };
function run(memory: CaptionWindowMemory, selected: string | null, intent: CaptionWindowIntent, input = source) {
  const plan = planCaptionWindow(input, memory, selected, intent);
  expect(plan.kind).toBe('change'); if (plan.kind !== 'change') throw Error(plan.reason);
  expect(captionWindowPlanIsCurrent(plan, input, memory, selected)).toBe(true); return plan.memory;
}

describe('disconnected comparison window STATE, not a floating renderer', () => {
  it('retains multiple exact IDs, deduplicates the selected follower and separates front order from selection', () => {
    let memory = newCaptionWindowMemory(sceneA); const selected = a;
    memory = run(memory, selected, { kind: 'retain', captionId: a });
    memory = run(memory, selected, { kind: 'retain', captionId: b });
    expect(captionWindowView(source, memory, selected).visibleIds).toEqual([a, b]);
    memory = run(memory, selected, { kind: 'front', captionId: a });
    expect(captionWindowView(source, memory, selected).visibleIds).toEqual([b, a]);
    expect(selected).toBe(a); expect(memory.retained).toEqual([a, b]);
  });

  it('closing the selected follower does not reopen it on refresh or change selection; explicit open restores it', () => {
    let memory = newCaptionWindowMemory(sceneA); const selected = a;
    expect(captionWindowView(source, memory, selected).visibleIds).toEqual([a]);
    memory = run(memory, selected, { kind: 'close', captionId: a });
    expect(captionWindowView(source, memory, selected).visibleIds).toEqual([]);
    expect(captionWindowView(source, memory, selected).visibleIds).toEqual([]);
    memory = run(memory, selected, { kind: 'open', captionId: a });
    expect(captionWindowView(source, memory, selected).visibleIds).toEqual([a]);
    expect(planCaptionWindow(source, memory, selected, { kind: 'open', captionId: b }).kind).toBe('blocked');
  });

  it('keeps shared Caption retention/position independent per Scene, including close and A/B/A', () => {
    const rect = { left: 20, top: 30, width: 280, height: 180 };
    let first = run(newCaptionWindowMemory(sceneA), a, { kind: 'retain', captionId: a });
    first = run(first, a, { kind: 'place', captionId: a, rect });
    const inputB = { ...source, sceneId: sceneB }, second = run(newCaptionWindowMemory(sceneB), a, { kind: 'retain', captionId: a }, inputB);
    first = run(first, a, { kind: 'close', captionId: a });
    expect(captionWindowView(inputB, second, a).visibleIds).toEqual([a]);
    expect(first.placements[0]?.rect).toEqual(rect); expect(second.placements).toEqual([]);
    expect(captionWindowView(source, first, a).visibleIds).toEqual([]);
  });

  it('suppresses unavailable memberships without deleting comparison intent; hidden/review pins retain window content', () => {
    const memory = run(newCaptionWindowMemory(sceneA), null, { kind: 'retain', captionId: a });
    const missing: CaptionListSource = { ...source, kind: 'ready', captions: [] };
    expect(captionWindowView(missing, memory, null)).toMatchObject({ visibleIds: [], suppressedIds: [a] });
    const unavailable: CaptionListSource = { token: 'two', sceneId: sceneA, kind: 'unavailable', reason: '状態を確認' };
    expect(captionWindowView(unavailable, memory, null).visibleIds).toEqual([]); expect(memory.retained).toEqual([a]);
    if (source.kind !== 'ready') return;
    const hidden = { ...source, captions: source.captions.map(item => ({ ...item, pin: 'ownerHidden' as const })) };
    expect(captionWindowView(hidden, memory, null).visibleIds).toEqual([a]);
  });

  it('accepts only complete valid arrangements, preserves all windows on failure and checks stale local selection', () => {
    let memory = run(newCaptionWindowMemory(sceneA), a, { kind: 'retain', captionId: b });
    const rect = { left: 8, top: 8, width: 200, height: 120 };
    expect(planCaptionWindow(source, memory, a, { kind: 'arrange', placements: [{ captionId: a, rect }] }).kind).toBe('blocked');
    expect(planCaptionWindow(source, memory, a, { kind: 'place', captionId: a, rect: { ...rect, width: Infinity } }).kind).toBe('blocked');
    expect(captionWindowView(source, memory, a).visibleIds).toHaveLength(2);
    const plan = planCaptionWindow(source, memory, a, { kind: 'arrange', placements: [
      { captionId: a, rect }, { captionId: b, rect: { ...rect, left: 220 } },
    ] });
    expect(captionWindowPlanIsCurrent(plan, source, memory, b)).toBe(false);
    expect(captionWindowPlanIsCurrent(plan, { ...source, token: 'two' }, memory, a)).toBe(false);
    if (plan.kind !== 'change') throw Error('missing plan');
    memory = plan.memory; rect.left = 999;
    expect(memory.placements[0]?.rect.left).toBe(8); expect(captionWindowView(source, memory, a).visibleIds).toHaveLength(2);
  });
});
