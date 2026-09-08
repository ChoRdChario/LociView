import { value, type Field, type Membership } from '../../scene/types';
import { freezeSynthetic } from './fixture';
import { captionKey, membershipKey, projectHistory } from './historyProjection';
import type { DevelopmentHistory, HistorySnapshot } from './historyPort';

export type MemberKind = 'asset' | 'caption';
export interface DuplicateMembership {
  readonly kind: MemberKind; readonly sceneId: string; readonly resourceId: string;
  readonly edges: readonly Membership[];
}
export interface CopyIds { readonly edgeId: string; readonly captionId: string; readonly membershipId: string }
export interface MembershipResolutionPlan {
  readonly token: string; readonly group: DuplicateMembership; readonly originalEdgeId: string;
  readonly action: 'one' | 'both'; readonly eventId: string; readonly copies: readonly CopyIds[];
  readonly changes: Readonly<Record<string, string>>;
}
function fail(message: string): never { throw new Error(message); }
const exact = <T>(field: Field<T>): T => field.kind === 'value' ? field.value : fail('内容の競合を先に確認してください。');

/** Duplicate semantic keys, not scalar lifecycle candidates. Neither ordering nor arrival chooses a winner. */
export function duplicateMemberships(snapshot: HistorySnapshot): readonly DuplicateMembership[] {
  const project = projectHistory(snapshot), groups = new Map<string, DuplicateMembership>();
  for (const kind of ['asset', 'caption'] as const) {
    for (const edge of Object.values(kind === 'asset' ? project.state.assetMemberships : project.state.captionMemberships)) {
      if (edge.lifecycle.kind === 'value' && edge.lifecycle.value.state === 'deleted') continue;
      const key = `${kind}/${edge.sceneId}/${edge.resourceId}`, old = groups.get(key);
      groups.set(key, { kind, sceneId: edge.sceneId, resourceId: edge.resourceId, edges: [...(old?.edges ?? []), edge] });
    }
  }
  return freezeSynthetic([...groups.values()].filter(group => group.edges.length > 1));
}

/** Exact synthetic preflight. Fresh IDs are supplied once, retained on failure, and never derived from names. */
export function planMembershipResolution(snapshot: HistorySnapshot, group: DuplicateMembership, originalEdgeId: string,
  action: 'one' | 'both', eventId: string, copies: readonly CopyIds[]): MembershipResolutionPlan {
  const current = duplicateMemberships(snapshot).find(g => g.kind === group.kind && g.sceneId === group.sceneId && g.resourceId === group.resourceId);
  if (!current || JSON.stringify(current) !== JSON.stringify(group) || !current.edges.some(e => e.id === originalEdgeId))
    fail('対象と残す項目を選び直してください。');
  if (current.edges.some(e => exact(e.lifecycle).state !== 'active')) fail('所属の状態を先に確認してください。');
  if (!/^evt_[0-9a-f]{32}$/.test(eventId)) fail('操作の識別情報を確認してください。');
  if (action === 'both' && group.kind !== 'caption') fail('モデルの独立コピーは未接続です。');
  const others = current.edges.filter(e => e.id !== originalEdgeId), project = projectHistory(snapshot);
  const allIds = new Set([...Object.keys(project.resources.captions), ...Object.keys(project.resources.assets),
    ...Object.keys(project.state.captionMemberships), ...Object.keys(project.state.assetMemberships)]);
  const fresh = (id: string, prefix: string) => {
    if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(id) || allIds.has(id)) fail('コピーの識別情報が重複しています。');
    allIds.add(id);
  };
  if (copies.length !== (action === 'both' ? others.length : 0) || new Set(copies.map(c => c.edgeId)).size !== copies.length ||
    copies.some(copy => !others.some(edge => edge.id === copy.edgeId))) fail('コピーする項目を確認してください。');
  const changes: Record<string, string> = {};
  for (const edge of others) changes[membershipKey(edge.id)] = JSON.stringify({ ...edge,
    lifecycle: value({ state: 'deleted', eventId, reason: 'conflictResolution' }) });
  for (const copy of copies) {
    fresh(copy.captionId, 'cap'); fresh(copy.membershipId, 'scm');
    const source = project.resources.captions[group.resourceId];
    if (!source || exact(source.lifecycle).state !== 'active') fail('キャプションの状態を確認してください。');
    const fields = { title: exact(source.title), body: exact(source.body), color: exact(project.colors[source.id]!),
      anchor: JSON.stringify(exact(source.anchor)) };
    changes[captionKey(copy.captionId, 'template')] = JSON.stringify({ templateId: project.captionTemplates[source.id], sourceId: source.id, eventId });
    for (const [key, text] of Object.entries(fields)) changes[captionKey(copy.captionId, key as keyof typeof fields)] = text;
    const edge = others.find(e => e.id === copy.edgeId)!;
    changes[membershipKey(copy.membershipId)] = JSON.stringify({ ...edge, id: copy.membershipId, resourceId: copy.captionId,
      lifecycle: value({ state: 'active', eventId, reason: 'conflictResolution' }) });
  }
  // Reuse the exact known fixture projector before the single causal publication.
  projectHistory({ token: snapshot.token, cells: { ...snapshot.cells, ...Object.fromEntries(Object.entries(changes).map(([key, text]) =>
    [key, { kind: 'value' as const, value: text }])) } }, snapshot);
  return freezeSynthetic({ token: snapshot.token, group: current, originalEdgeId, action, eventId, copies: [...copies], changes });
}

export function applyMembershipResolution(history: DevelopmentHistory, plan: MembershipResolutionPlan) {
  const snapshot = history.read();
  if (snapshot.token !== plan.token) fail('更新されています。選択を確認してください。コピーは追加していません。');
  const checked = planMembershipResolution(snapshot, plan.group, plan.originalEdgeId, plan.action, plan.eventId, plan.copies);
  if (JSON.stringify(checked) !== JSON.stringify(plan)) fail('コピーの計画を確認してください。');
  return history.write(plan.token, plan.changes);
}
