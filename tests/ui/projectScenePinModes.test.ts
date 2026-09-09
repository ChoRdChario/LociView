import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { value, type Field } from '../../src/scene/types';
import { newPinModeMemory, pinModePlanIsCurrent, pinActionIssue, planPinMode,
  type PinModeContext, type PinModePlan, type PinModeSource } from '../../src/ui/projectScene/pinModeState';
import { createPinModeControls } from '../../src/ui/projectScene/pinModeControls';
import { RecordedDocument, record } from './domRecorder';

const scene = 'scene', assetA = 'model-a', assetB = 'model-b', cap = 'caption';
function source(): PinModeSource & { kind: 'ready' } {
  return { kind: 'ready', token: 'one', sceneId: scene, models: [assetA, assetB].map((assetId, i) => ({
    assetId, token: assetId + '-binding', name: value(i ? '北館' : '南館'), addBlock: null, moveBlock: null,
  })), selected: { captionId: cap, title: value('入口'), assetId: value(assetB), token: 'anchor-1', sceneCount: value(2), block: null } };
}
function context(): PinModeContext {
  return { source: source(), memory: newPinModeMemory(scene), otherPending: null, mutationBlock: null,
    proposal: null, proposalIssue: null, feedback: { kind: 'idle' } };
}
function start(kind: 'add' | 'move' = 'move'): PinModeContext {
  const ctx = { ...context(), memory: { ...newPinModeMemory(scene), addTargetId: assetA } };
  const plan = planPinMode(ctx, { kind }); if (plan.kind !== 'change') throw Error('cannot start');
  return { ...ctx, memory: plan.memory };
}
const proposal = (ctx: PinModeContext): PinModeContext => ({ ...ctx, proposal: Object.freeze({ token: 'position-1', mode: ctx.memory.mode! }) });
function host() {
  const events: PinModePlan[] = []; let current = context();
  const controls = createPinModeControls(new RecordedDocument().asDocument(), plan => {
    events.push(plan);
    if (plan.kind === 'change' && pinModePlanIsCurrent(plan, current)) {
      current = { ...current, memory: plan.memory, proposal: plan.intent === 'cancel' ? null : current.proposal };
      controls.render(current);
    }
  });
  controls.render(current); const actions = record(controls.actions), strip = record(controls.modeStrip);
  return { controls, events, actions, strip, target: actions.children[6]!.children[1]!.children[0]!, add: actions.children[0]!, move: actions.children[1]!,
    impact: actions.children[4]!, moveTarget: actions.children[5]!, heading: strip.children[0]!, status: strip.children[1]!,
    finish: strip.children[2]!, cancel: strip.children[3]!, confirmation: strip.children[4]!,
    get context() { return current; }, render(next: PinModeContext) { if (controls.render(next)) current = next; } };
}

describe('disconnected pin-mode intentions, not picking or anchor construction', () => {
  it('requires explicit add model; move uses exact existing owner regardless of add selection', () => {
    expect(planPinMode(context(), { kind: 'add' }).kind).toBe('blocked');
    const add = start('add'), move = start('move');
    expect(add.memory.mode?.target.assetId).toBe(assetA); expect(add.memory.mode?.caption).toBeNull();
    expect(move.memory.mode?.target.assetId).toBe(assetB); expect(move.memory.mode?.caption?.captionId).toBe(cap);
    expect(move.memory.addTargetId).toBe(assetA);
    expect(planPinMode(move, { kind: 'target', assetId: assetA }).kind).toBe('blocked');
  });

  it('separates new-placement eligibility from existing movement; no proxy or owner inference', () => {
    const ctx = context(), current = source();
    const withoutSurface = { ...current, models: current.models.map(item => ({ ...item, addBlock: '配置用モデルを確認してください。' })) };
    const changed = { ...ctx, source: withoutSurface, memory: { ...ctx.memory, addTargetId: assetB } };
    expect(planPinMode(changed, { kind: 'add' }).kind).toBe('blocked');
    expect(planPinMode(changed, { kind: 'move' }).kind).toBe('change');
    const unknown: Field<string> = { kind: 'unresolved', reason: 'conflict' };
    expect(planPinMode({ ...ctx, source: { ...current, selected: { ...current.selected!, assetId: unknown } } }, { kind: 'move' }).kind).toBe('blocked');
    expect(planPinMode({ ...ctx, source: { ...current, selected: { ...current.selected!, block: 'ピン位置を確認してください。' } } }, { kind: 'move' }).kind).toBe('blocked');
  });

  it('requires validated impact/proposal and binds finish to exact mode, proposal and target snapshots', () => {
    const active = start(); expect(planPinMode(active, { kind: 'finish' }).kind).toBe('blocked');
    const ready = proposal(active), plan = planPinMode(ready, { kind: 'finish' });
    expect(plan.kind).toBe('finish'); expect(pinModePlanIsCurrent(plan, ready)).toBe(true);
    expect(pinModePlanIsCurrent(plan, { ...ready, proposal: { ...ready.proposal!, token: 'new-position' } })).toBe(false);
    expect(planPinMode({ ...ready, proposal: { ...ready.proposal!, mode: start().memory.mode! } }, { kind: 'finish' }).kind).toBe('blocked');
    const current = source();
    for (const patch of [{ source: { ...current, token: 'new', models: current.models.map(item => ({ ...item, token: 'new-binding' })) } },
      { source: { ...current, selected: { ...current.selected!, token: 'new-anchor' } } },
      { source: { ...current, selected: null } }, { mutationBlock: '閲覧のみ' }, { otherPending: 'text' as const }]) {
      expect(planPinMode({ ...ready, ...patch }, { kind: 'finish' }).kind).toBe('blocked');
    }
    for (const sceneCount of [value(0), value(1.5), { kind: 'unresolved' as const, reason: 'conflict' as const }])
      expect(planPinMode({ ...context(), source: { ...current, selected: { ...current.selected!, sceneCount } } }, { kind: 'move' }).kind).toBe('blocked');
  });

  it('retains proposal after failure and guards write-in-flight versus exact local cancellation', () => {
    const ctx = proposal(start()), failed = { ...ctx, feedback: { kind: 'failed' as const, message: '再試行' } };
    expect(planPinMode(failed, { kind: 'finish' }).kind).toBe('finish'); expect(failed.proposal).toBe(ctx.proposal);
    const intent = { kind: 'cancel' as const, confirmedMode: ctx.memory.mode!, confirmedProposal: ctx.proposal };
    const lost: PinModeContext = { ...failed, mutationBlock: '書込み不可', source: { kind: 'unavailable', sceneId: scene, token: 'missing', reason: '復旧' } };
    const cancel = planPinMode(lost, intent); expect(cancel.kind).toBe('change'); expect(pinModePlanIsCurrent(cancel, lost)).toBe(true);
    expect(planPinMode({ ...lost, feedback: { kind: 'applying' } }, intent).kind).toBe('blocked');
    expect(planPinMode({ ...lost, proposal: { ...ctx.proposal!, token: 'new' } }, intent).kind).toBe('blocked');
    expect(pinModePlanIsCurrent(cancel, { ...lost, proposal: null })).toBe(false);
    expect(planPinMode(ctx, { kind: 'cancel', confirmedMode: start().memory.mode!, confirmedProposal: ctx.proposal }).kind).toBe('blocked');
  });

  it('rejects duplicated model rows and stale begin plans without selecting first model', () => {
    const ctx = context(), current = source();
    const unknown = { ...current, models: [current.models[0]!, current.models[0]!] };
    expect(pinActionIssue({ ...ctx, source: unknown }, 'move')).toContain('モデル');
    const plan = planPinMode(ctx, { kind: 'move' });
    expect(pinModePlanIsCurrent(plan, { ...ctx, mutationBlock: '' })).toBe(false);
    expect(pinModePlanIsCurrent(plan, { ...ctx, source: { ...current, token: 'later' } })).toBe(false);
    expect(ctx.memory.addTargetId).toBeNull();
  });

  it('shows distinct add and move target before entry, shared impact and a separate near-stage strip', () => {
    const h = host(); expect(h.target.attributes.get('aria-label')).toBe('追加先モデル');
    expect(h.add.disabled).toBe(false); expect(h.move.disabled).toBe(false); expect(h.strip.hidden).toBe(true);
    h.target.value = assetA; h.target.fire('change'); expect(h.moveTarget.textContent).toBe('選択：入口');
    expect(h.impact.textContent).toContain('2シーン'); h.move.fire('click');
    expect(h.heading.textContent).toContain('入口 — 北館'); expect(h.strip.hidden).toBe(false); expect(h.finish.disabled).toBe(true);
    h.render(proposal(h.context)); expect(h.finish.disabled).toBe(false); h.finish.fire('click');
    expect(h.events.at(-1)?.kind).toBe('finish'); expect(h.context.memory.mode).not.toBeNull();
    expect(h.status.textContent).not.toContain('保存済み'); h.controls.dispose();
    // Authored CSS contract only: the root hidden attribute must beat display:flex.
    expect(readFileSync('src/ui/projectScene/captionActions.css', 'utf8'))
      .toContain(':is(.lv-caption-include, .lv-pin-actions, .lv-pin-mode)[hidden]');
  });

  it('keeps mode and cancellation after source loss; does not discard a proposal changed during confirmation', () => {
    const h = host(); h.move.fire('click'); h.render(proposal(h.context)); h.cancel.fire('click');
    expect(h.confirmation.hidden).toBe(false);
    h.render({ ...h.context, proposal: { ...h.context.proposal!, token: 'position-2' } });
    expect(h.confirmation.hidden).toBe(true); const count = h.events.length; h.confirmation.children[1]!.fire('click'); expect(h.events).toHaveLength(count);
    h.render({ ...h.context, source: { kind: 'unavailable', token: 'missing', sceneId: scene, reason: '復旧してください。' } });
    expect(h.finish.disabled).toBe(true); expect(h.cancel.disabled).toBe(false); expect(h.heading.textContent).toContain('北館');
    expect(h.controls.render({ ...h.context, source: { ...h.context.source, sceneId: 'other' } })).toBe(false);
    h.cancel.fire('click'); h.confirmation.children[2]!.fire('click'); expect(h.context.memory.mode).not.toBeNull();
    h.cancel.fire('click'); h.confirmation.children[1]!.fire('click'); expect(h.context.memory.mode).toBeNull(); expect(h.context.proposal).toBeNull();
    h.controls.dispose();
  });

  it('keeps retry state and treats imported target names as text, cleaning listeners on dispose', () => {
    const h = host(), current = source();
    h.render({ ...h.context, source: { ...current, models: current.models.map(item => ({ ...item, name: value('<svg onload=x>') })) } });
    h.move.fire('click'); h.render(proposal(h.context)); h.render({ ...h.context, feedback: { kind: 'failed', message: '再試行してください。' } });
    expect(h.heading.textContent).toContain('<svg onload=x>'); expect(h.heading.children).toEqual([]);
    expect(h.status.textContent).toContain('指定中の位置は保持'); expect(h.finish.disabled).toBe(false);
    const count = h.events.length; h.controls.dispose(); h.move.fire('click'); h.finish.fire('click'); expect(h.events).toHaveLength(count);
  });
});
