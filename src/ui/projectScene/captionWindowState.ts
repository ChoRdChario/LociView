import { captionSourceIssue, type CaptionListSource } from './captionListState';

export interface WindowRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
export interface CaptionPlacement { readonly captionId: string; readonly rect: WindowRect }
export interface CaptionWindowMemory {
  readonly sceneId: string;
  readonly retained: readonly string[];
  readonly dismissed: readonly string[];
  readonly order: readonly string[];
  readonly placements: readonly CaptionPlacement[];
}
export function newCaptionWindowMemory(sceneId: string): CaptionWindowMemory {
  return Object.freeze({ sceneId, retained: Object.freeze([]), dismissed: Object.freeze([]), order: Object.freeze([]), placements: Object.freeze([]) });
}
export type CaptionWindowIntent =
  Readonly<{ kind: 'open' | 'retain' | 'release' | 'close' | 'front'; captionId: string }> |
  Readonly<{ kind: 'place'; captionId: string; rect: WindowRect }> |
  Readonly<{ kind: 'arrange'; placements: readonly CaptionPlacement[] }>;
export type CaptionWindowPlan = Readonly<{ kind: 'blocked'; reason: string }> |
  Readonly<{ kind: 'change'; token: string; selectedCaptionId: string | null;
    baseMemory: CaptionWindowMemory; memory: CaptionWindowMemory }>;

/** Window order is NOT editing selection; selection is supplied by its single host authority. */
export function captionWindowView(source: CaptionListSource, memory: CaptionWindowMemory, selectedCaptionId: string | null) {
  const issue = source.sceneId !== memory.sceneId ? 'シーンを確認してください。' : captionSourceIssue(source);
  const available = new Set(source.kind === 'ready' && !issue ? source.captions.map(item => item.id) : []);
  const wanted = new Set(memory.retained);
  if (selectedCaptionId && !memory.dismissed.includes(selectedCaptionId)) wanted.add(selectedCaptionId);
  const order = [...new Set([...memory.order, ...wanted])].filter(id => wanted.has(id));
  return { issue, visibleIds: order.filter(id => available.has(id)), suppressedIds: order.filter(id => !available.has(id)),
    placements: memory.placements };
}
const validRect = (rect: WindowRect) => [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
  rect.left >= 0 && rect.top >= 0 && rect.width > 0 && rect.height > 0;
const atFront = (order: readonly string[], id: string) => [...order.filter(item => item !== id), id];

export function planCaptionWindow(source: CaptionListSource, memory: CaptionWindowMemory,
  selectedCaptionId: string | null, intent: CaptionWindowIntent): CaptionWindowPlan {
  const block = (reason: string): CaptionWindowPlan => ({ kind: 'blocked', reason });
  if (source.sceneId !== memory.sceneId || !source.token) return block('シーンを確認してください。');
  const view = captionWindowView(source, memory, selectedCaptionId);
  const change = (patch: Partial<CaptionWindowMemory>): CaptionWindowPlan => Object.freeze({ kind: 'change',
    token: source.token, selectedCaptionId, baseMemory: memory, memory: Object.freeze({ ...memory, ...patch }) });
  if (intent.kind === 'arrange') {
    const ids = intent.placements.map(item => item.captionId);
    if (view.issue || ids.length !== view.visibleIds.length || new Set(ids).size !== ids.length ||
        ids.some(id => !view.visibleIds.includes(id)) || intent.placements.some(item => !validRect(item.rect)))
      return block('すべてのウィンドウを配置できません。位置と大きさを調整してください。');
    const replacements = intent.placements.map(item => Object.freeze({ captionId: item.captionId, rect: Object.freeze({ ...item.rect }) }));
    return change({ placements: Object.freeze([...memory.placements.filter(item => !ids.includes(item.captionId)), ...replacements]) });
  }
  const id = intent.captionId;
  if (intent.kind === 'close' || intent.kind === 'release') {
    if (![...memory.retained, ...view.visibleIds, ...view.suppressedIds].includes(id)) return block('ウィンドウを選び直してください。');
    return change({ retained: Object.freeze(memory.retained.filter(item => item !== id)),
      dismissed: intent.kind === 'close' ? Object.freeze([...new Set([...memory.dismissed, id])]) : memory.dismissed });
  }
  if (view.issue || source.kind !== 'ready' || !source.captions.some(item => item.id === id))
    return block(view.issue || 'このシーンのキャプションを選択してください。');
  if (intent.kind === 'open' && id !== selectedCaptionId) return block('選択したキャプションのウィンドウを開いてください。');
  if ((intent.kind === 'front' || intent.kind === 'place') && !view.visibleIds.includes(id))
    return block('ウィンドウを開いてください。');
  if (intent.kind === 'place') {
    if (!validRect(intent.rect)) return block('位置と大きさを確認してください。');
    return change({ placements: Object.freeze([...memory.placements.filter(item => item.captionId !== id),
      Object.freeze({ captionId: id, rect: Object.freeze({ ...intent.rect }) })]) });
  }
  return change({ order: Object.freeze(atFront(memory.order, id)),
    retained: intent.kind === 'retain' ? Object.freeze([...new Set([...memory.retained, id])]) : memory.retained,
    dismissed: intent.kind === 'front' ? memory.dismissed : Object.freeze(memory.dismissed.filter(item => item !== id)) });
}
export function captionWindowPlanIsCurrent(plan: CaptionWindowPlan, source: CaptionListSource,
  memory: CaptionWindowMemory, selectedCaptionId: string | null): boolean {
  return plan.kind === 'blocked' || (plan.token === source.token && plan.baseMemory === memory &&
    source.sceneId === memory.sceneId && plan.selectedCaptionId === selectedCaptionId);
}
