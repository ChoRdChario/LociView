import { materialFields, type MaterialIntent } from '../../domain/materialIntent';
import { value, type Field } from '../../scene/types';
import { acceptMaterialApply, materialPlanIsCurrent, newMaterialSelection, type MaterialContext, type MaterialDraft, type MaterialEffect,
  type MaterialPlan, type MaterialRecordPort, type MaterialSelection } from '../../ui/projectScene/materialState';
import type { PendingInteraction } from '../../ui/projectScene/navigationState';
import { fixtureIds, type SyntheticProject } from './fixture';
import { syntheticVersions } from './modelFixture';
import { canonicalFixture } from './modelClosure';
import { materialBucket, materialCapability, materialKey, materialLimits, materialTarget, sourceMaterialIntent, type MaterialRouting } from './materialHistory';

const fresh = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
export class SyntheticMaterialSession {
  private selections = new Map<string, MaterialSelection>();
  private drafts = new Map<string, MaterialDraft>();
  private feedback = new Map<string, MaterialContext['feedback']>();
  private prepared: { plan: MaterialEffect; id: string; changes: Readonly<Record<string, string>> } | null = null;
  message = '';
  constructor(private readonly read: () => SyntheticProject, private readonly scene: () => string,
    private readonly write: (token: string, changes: Readonly<Record<string, string>>) => void) {}
  get pending(): PendingInteraction | null { return [...this.drafts.values()].some(d => d.composing) ? 'composition' : this.drafts.size ? 'text' : null; }
  context(otherPending: PendingInteraction | null): MaterialContext {
    const p = this.read(), sceneId = this.scene();
    if (!this.selections.has(sceneId)) this.selections.set(sceneId, newMaterialSelection());
    const record = (routing: MaterialRouting): Field<MaterialRecordPort | null> => {
      const b = materialBucket(p.materialData, routing);
      return b.kind !== 'value' ? b : value(b.value ? { id: b.value.id, target: routing.target, scope: routing.scope.kind,
        sceneId: routing.scope.kind === 'scene' ? sceneId : null, intent: b.value.intent } : null);
    };
    return { source: { kind: 'ready', token: p.state.token, projectId: fixtureIds.project, sceneId, limits: materialLimits,
      models: Object.values(p.resources.assets).map(asset => {
        const version = asset.projection.kind === 'value' ? (p.modelVersions ?? syntheticVersions).find(v => v.projection.bindingId === (asset.projection as { value: { bindingId: string } }).value.bindingId) : null;
        const name = value(p.modelNames[asset.id] ?? 'モデル');
        if (!version) return { assetId: asset.id, name, surfaces: { kind: 'unresolved' as const, reason: 'conflict' as const }, reason: 'モデルの更新候補を確認してください。' };
        const target = materialTarget(version.closure), project = record({ scope: { kind: 'project' }, target }), scene = record({ scope: { kind: 'scene', sceneId }, target });
        return { assetId: asset.id, name, surfaces: value([{ target, name: value('表面'), project, scene, sourceIntent: value(sourceMaterialIntent),
          fieldIssues: Object.fromEntries(materialFields.map(f => [f, f === 'opacity' || f === 'softness' ? '半透明の表示は未接続です。' : null])) as Record<typeof materialFields[number], string | null>,
          admit: materialCapability }]), reason: null };
      }) }, selection: this.selections.get(sceneId)!, draft: this.drafts.get(sceneId) ?? null, pending: otherPending,
      mutationBlock: null, feedback: this.feedback.get(sceneId) ?? { kind: 'idle' } };
  }
  accept(plan: MaterialPlan, context: MaterialContext): boolean {
    try {
      if (plan.kind === 'blocked') throw new Error(plan.reason);
      if (!materialPlanIsCurrent(plan, context)) throw new Error('設定が更新されています。入力と操作対象を保持しています。');
      if (plan.kind === 'select') this.selections.set(this.scene(), plan.selection);
      else if (plan.kind === 'draft') this.drafts.set(this.scene(), plan.draft);
      else if (plan.kind === 'cancel') this.drafts.delete(this.scene());
      else if (plan.kind === 'review') throw new Error('画面上部の更新候補と、モデル・面の対応を確認してください。');
      else {
        let prepared = this.prepared;
        if (!prepared || prepared.plan !== plan) {
          const id = plan.recordId ?? fresh('ovr'), changes: Record<string, string> = {};
          if (plan.kind === 'remove') changes[materialKey(id, 'lifecycle')] = canonicalFixture({ state: 'deleted', eventId: fresh('evt'), reason: 'userDelete' });
          else {
            if (!plan.recordId) {
              changes[materialKey(id, 'routing')] = canonicalFixture({ target: plan.selection.target, scope: plan.selection.scope === 'scene' ? { kind: 'scene', sceneId: this.scene() } : { kind: 'project' } });
              changes[materialKey(id, 'compositing')] = canonicalFixture(plan.intent.compositing);
              changes[materialKey(id, 'lifecycle')] = canonicalFixture({ state: 'active', eventId: fresh('evt'), reason: 'initial' });
            }
            changes[materialKey(id, 'appearance')] = canonicalFixture(plan.intent.appearance);
          }
          prepared = this.prepared = { plan, id, changes: Object.freeze(changes) };
        }
        this.write(plan.token, prepared.changes);
        const data = this.read().materialData;
        if (Object.entries(prepared.changes).some(([key, text]) => data?.cells[key]?.kind !== 'value' || (data.cells[key] as { value: string }).value !== text))
          throw new Error('適用結果を確認できません。入力と操作を保持しています。');
        if (plan.kind === 'apply') {
          const intent = data?.records[prepared.id]?.intent;
          if (intent?.kind !== 'value' || canonicalFixture(intent.value) !== canonicalFixture(plan.intent)) throw new Error('適用した見え方を確認できません。');
          const remaining = acceptMaterialApply(plan, this.drafts.get(this.scene()) ?? null, { plan, projectId: plan.projectId, sceneId: plan.sceneId,
            selection: plan.selection, recordId: prepared.id, intent: plan.intent });
          if (remaining) throw new Error('入力を保持しています。適用結果を確認してください。');
          this.drafts.delete(this.scene());
        }
        this.prepared = null;
      }
      // Selection changes must not relabel/erase a previous failed operation.
      if (plan.kind !== 'select') this.feedback.set(this.scene(), { kind: 'idle' });
      this.message = ''; return true;
    } catch (e) {
      this.message = e instanceof Error ? e.message : 'マテリアルを変更できません。';
      if (plan.kind === 'apply' || plan.kind === 'remove') this.feedback.set(this.scene(), { kind: 'failed', plan, message: this.message });
      return false;
    }
  }
}
