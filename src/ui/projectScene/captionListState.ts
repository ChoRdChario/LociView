import type { Field } from '../../scene/types';
import { sceneSwitchReason, type CaptionOwnerFilter, type PendingInteraction, type SceneUiMemory } from './navigationState';

/** Validated read projection, not a wire format or an untrusted-data validator. */
export interface CaptionListItem {
  readonly id: string;
  readonly title: Field<string>;
  readonly body: Field<string>;
  /** Explicit resolved presentation color. Unknown never means default yellow. */
  readonly color: Field<string>;
  readonly owner: Field<Readonly<{ kind: 'project' }> |
    Readonly<{ kind: 'asset'; assetId: string; name: Field<string> }>>;
  readonly mediaCount: Field<number>;
  readonly pin: 'visible' | 'ownerHidden' | 'needsReview' | 'unavailable';
}
export type CaptionListSource = Readonly<{ token: string; sceneId: string }> & (
  Readonly<{ kind: 'ready'; captions: readonly CaptionListItem[] }> |
  Readonly<{ kind: 'unavailable'; reason: string }>);
export interface CaptionListContext {
  readonly source: CaptionListSource;
  readonly memory: SceneUiMemory;
  readonly pending: PendingInteraction | null;
  /** Host's reason that shared edits are unavailable. Local finding still works. */
  readonly mutationBlock: string | null;
}
export type CaptionListIntent =
  | Readonly<{ kind: 'search'; query: string }>
  | Readonly<{ kind: 'owner'; filter: CaptionOwnerFilter }>
  | Readonly<{ kind: 'color'; color: string }>
  | Readonly<{ kind: 'allColors' | 'revealSelection' }>
  | Readonly<{ kind: 'scroll'; top: number }>
  | Readonly<{ kind: 'select' | 'showModel' | 'review'; captionId: string }>;
interface PlanBase { readonly token: string; readonly sceneId: string; readonly baseMemory: SceneUiMemory }
export type CaptionListPlan = Readonly<{ kind: 'blocked'; reason: string }> |
  Readonly<{ kind: 'unchanged'; explicitSelection?: PlanBase & { readonly captionId: string } }> |
  (PlanBase & Readonly<{ kind: 'change'; memory: SceneUiMemory; intent: CaptionListIntent['kind'] }>) |
  (PlanBase & Readonly<{ kind: 'effect'; action: 'showModel' | 'review'; captionId: string; assetId?: string }>);

/** Safe CSS value and comparison key only; never repairs the underlying record. */
export function captionColorKey(field: Field<string>): string | null {
  if (field.kind !== 'value') return null;
  const color = field.value.toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  return /^#[0-9a-f]{3}$/.test(color) ? '#' + [...color.slice(1)].map(c => c + c).join('') : null;
}
export const ownerFilterKey = (filter: CaptionOwnerFilter): string =>
  filter.kind === 'asset' ? `asset:${filter.assetId}` : filter.kind;
export const captionOwnerLabel = (item: CaptionListItem): string => {
  if (item.owner.kind !== 'value') return 'モデルを確認';
  const owner = item.owner.value;
  return owner.kind === 'project' ? 'モデルに依存しない' : owner.name.kind === 'value'
    ? owner.name.value.trim() ? owner.name.value : '名称なし' : 'モデル名を確認';
};
export const captionTitle = (item: CaptionListItem): string => item.title.kind === 'value'
  ? item.title.value.trim() ? item.title.value : '無題' : 'タイトルを確認';

export function captionSourceIssue(source: CaptionListSource): string | null {
  if (source.kind === 'unavailable') return source.reason || 'キャプションを読み込めません。状態を確認してください。';
  if (!source.token || !source.sceneId || new Set(source.captions.map(item => item.id)).size !== source.captions.length)
    return '一覧の状態を確認してください。';
  return null;
}
function matchSearch(item: CaptionListItem, query: string): boolean | null {
  if (!query) return true;
  const fields = [item.title, item.body];
  if (fields.some(field => field.kind === 'value' && field.value.toLowerCase().includes(query))) return true;
  return fields.some(field => field.kind !== 'value') ? null : false;
}
export interface CaptionListRow {
  readonly item: CaptionListItem;
  readonly uncertainMatch: boolean;
  readonly color: string | null;
  readonly colorHidden: boolean;
}
export function captionListView(source: CaptionListSource, memory: SceneUiMemory) {
  const issue = captionSourceIssue(source);
  const captions = source.kind === 'ready' && !issue ? source.captions : [];
  const query = memory.search.trim().toLowerCase();
  const rows: CaptionListRow[] = [];
  const colors = new Set<string>();
  const owners = new Map<string, { filter: CaptionOwnerFilter; label: string }>();
  for (const item of captions) {
    const color = captionColorKey(item.color);
    if (color) colors.add(color);
    const filter: CaptionOwnerFilter = item.owner.kind !== 'value' ? { kind: 'unresolved' }
      : item.owner.value.kind === 'project' ? { kind: 'project' } : { kind: 'asset', assetId: item.owner.value.assetId };
    const key = ownerFilterKey(filter), label = captionOwnerLabel(item), previous = owners.get(key);
    // Divergent names in a bad projection never become a first/last-label winner.
    owners.set(key, { filter, label: previous && previous.label !== label ? 'モデル名を確認' : label });
    const bySearch = matchSearch(item, query);
    const colorHidden = color !== null && memory.pinColors !== null && !memory.pinColors.includes(color);
    // Old UI memory may still contain an owner filter; it no longer hides records.
    // Unknown colors stay discoverable for recovery, never guessed or silently dropped.
    if (bySearch === false || colorHidden) continue;
    rows.push({ item, uncertainMatch: bySearch === null, color, colorHidden });
  }
  return { issue, rows, colors: [...colors], owners: [...owners.values()], total: captions.length,
    selected: captions.find(item => item.id === memory.selectedCaptionId),
    selectionVisible: rows.some(row => row.item.id === memory.selectedCaptionId) };
}

export function planCaptionList(context: CaptionListContext, intent: CaptionListIntent): CaptionListPlan {
  const { source, memory } = context, issue = captionSourceIssue(source);
  if (issue) return { kind: 'blocked', reason: issue };
  const view = captionListView(source, memory);
  const base = { token: source.token, sceneId: source.sceneId, baseMemory: memory };
  const change = (patch: Partial<SceneUiMemory>): CaptionListPlan => ({ ...base, kind: 'change',
    memory: Object.freeze({ ...memory, ...patch }), intent: intent.kind });
  switch (intent.kind) {
    case 'search': return intent.query === memory.search ? { kind: 'unchanged' } : change({ search: intent.query });
    case 'owner': return ownerFilterKey(intent.filter) === ownerFilterKey(memory.ownerFilter) ? { kind: 'unchanged' }
      : intent.filter.kind === 'all' || view.owners.some(owner => ownerFilterKey(owner.filter) === ownerFilterKey(intent.filter))
        ? change({ ownerFilter: Object.freeze({ ...intent.filter }) }) : { kind: 'blocked', reason: 'モデルを選び直してください。' };
    case 'allColors': return memory.pinColors === null ? { kind: 'unchanged' } : change({ pinColors: null });
    case 'color': {
      if (!view.colors.includes(intent.color)) return { kind: 'blocked', reason: '色を選び直してください。' };
      const colors = new Set(memory.pinColors ?? view.colors);
      if (colors.has(intent.color)) colors.delete(intent.color); else colors.add(intent.color);
      return change({ pinColors: Object.freeze([...colors]) });
    }
    case 'scroll': return Number.isFinite(intent.top) && intent.top >= 0
      ? intent.top === memory.listScrollTop ? { kind: 'unchanged' } : change({ listScrollTop: intent.top })
      : { kind: 'blocked', reason: '一覧の位置を確認してください。' };
    case 'revealSelection': return !view.selected ? { kind: 'blocked', reason: '選択したキャプションの状態を確認してください。' }
      : change({ search: '', ownerFilter: { kind: 'all' }, pinColors: null });
    default: {
      const item = source.kind === 'ready' ? source.captions.find(item => item.id === intent.captionId) : undefined;
      if (!item) return { kind: 'blocked', reason: 'キャプションの状態を確認してください。' };
      // Preserve explicit reselection for host viewing aids without changing editor selection.
      if (intent.kind === 'select' && item.id === memory.selectedCaptionId) return { kind: 'unchanged', explicitSelection: { ...base, captionId: item.id } };
      if (context.pending) return { kind: 'blocked', reason: sceneSwitchReason(context.pending) };
      if (intent.kind === 'select') return change({ selectedCaptionId: item.id });
      if (intent.kind === 'review') return { ...base, kind: 'effect', action: 'review', captionId: item.id };
      if (context.mutationBlock) return { kind: 'blocked', reason: context.mutationBlock };
      if (item.pin !== 'ownerHidden' || item.owner.kind !== 'value' || item.owner.value.kind !== 'asset')
        return { kind: 'blocked', reason: 'キャプションのモデルを確認してください。' };
      return { ...base, kind: 'effect', action: 'showModel', captionId: item.id, assetId: item.owner.value.assetId };
    }
  }
}
export function captionListPlanIsCurrent(plan: CaptionListPlan, context: CaptionListContext): boolean {
  if (plan.kind === 'blocked') return true;
  if (plan.kind === 'unchanged') {
    const selected = plan.explicitSelection;
    return !selected || (!captionSourceIssue(context.source) && selected.token === context.source.token &&
      selected.sceneId === context.source.sceneId && selected.baseMemory === context.memory && selected.captionId === context.memory.selectedCaptionId);
  }
  return !captionSourceIssue(context.source) && plan.token === context.source.token &&
    plan.sceneId === context.source.sceneId && plan.baseMemory === context.memory &&
    (!(plan.kind === 'effect' || plan.intent === 'select') || context.pending === null) &&
    (!(plan.kind === 'effect' && plan.action === 'showModel') || context.mutationBlock === null);
}
