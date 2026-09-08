import { planSceneCommand, previewScenePlan } from '../../scene/commands';
import { chooseStartupScene, resolveScene } from '../../scene/resolve';
import { value, type Composition, type Field } from '../../scene/types';
import { navigationPlanIsCurrent, type NavigationPlan, type NavigationSession, type PendingInteraction,
  type SceneUiMemory } from '../../ui/projectScene/navigationState';
import { captionListPlanIsCurrent, type CaptionListContext, type CaptionListItem,
  type CaptionListPlan } from '../../ui/projectScene/captionListState';
import { acceptCaptionApply, beginCaptionDraft, captionApplyIsCurrent, hasCaptionDraft,
  type CaptionDraft, type DetailContext, type DetailSource } from '../../ui/projectScene/captionDetailState';
import type { CaptionDetailEvent } from '../../ui/projectScene/captionDetailControls';
import { modelListPlanIsCurrent, newModelListMemory, planModelList, type ModelListContext,
  type ModelListMemory, type ModelListPlan, type ModelMembership } from '../../ui/projectScene/modelListState';
import { createSyntheticProject, fixtureIds, freezeSynthetic, type SyntheticProject } from './fixture';
import { captionKey, membershipKey, type SyntheticAuthority } from './historyProjection';

const fresh = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const unknown = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'invalid' });
const emptyMemory = (): SceneUiMemory => Object.freeze({ selectedCaptionId: null, listScrollTop: 0,
  search: '', pinColors: null, ownerFilter: { kind: 'all' as const } });

/** Development-only state. Optional isolated memory-history authority; never durable save. */
export class SyntheticSession {
  private project = createSyntheticProject();
  private navigation: NavigationSession;
  private drafts = new Map<string, CaptionDraft>();
  private models = new Map<string, ModelListMemory>();
  private searchComposing = false;
  private detailFeedback: DetailContext['feedback'] = { kind: 'idle' };
  private modelFeedback: ModelListContext['feedback'] = { kind: 'idle' };
  message = '';
  constructor(private readonly authority?: SyntheticAuthority) {
    if (authority) this.project = authority.read();
    const sceneId = chooseStartupScene(this.project.state).sceneId;
    if (!sceneId) throw new Error('合成シーンを開けません。');
    this.navigation = Object.freeze({ sceneId, task: 'captions', sceneMemory: Object.freeze(
      Object.fromEntries(Object.keys(this.project.state.scenes).map(key => [key, emptyMemory()]))) });
    for (const key of Object.keys(this.project.state.scenes)) this.models.set(key, newModelListMemory(fixtureIds.project, key));
  }
  get snapshot() { return this.project; }
  get session() { return this.navigation; }
  get sceneId() { return this.navigation.sceneId!; }
  get memory() { return this.navigation.sceneMemory[this.sceneId]!; }
  get pending(): PendingInteraction | null {
    if (this.searchComposing || [...this.models.values()].some(m => m.composing) ||
      [...this.drafts.values()].some(d => d.composing !== null)) return 'composition';
    return [...this.drafts.values()].some(hasCaptionDraft) ? 'text' : null;
  }
  setSearchComposing(active: boolean) { this.searchComposing = active; }
  refreshHistory() {
    if (this.authority) this.publish(this.authority.read());
    // Keep the same draft objects and UI memory. Edited fields detect a changed source at apply.
  }
  private compositionOf(project: SyntheticProject, sceneId: string): Composition {
    const result = resolveScene(project.state, project.resources, sceneId);
    if (result.kind !== 'ready') throw new Error('シーンの状態を確認してください。');
    return result.composition;
  }
  get composition() { return this.compositionOf(this.project, this.sceneId); }
  private publish(next: SyntheticProject) {
    // Resolve before publishing any UI read port. No partial Scene/Resources token swap.
    for (const key of Object.keys(next.state.scenes)) this.compositionOf(next, key);
    this.project = freezeSynthetic(next);
  }
  captionContext(): CaptionListContext {
    const { resources, colors, modelNames, state } = this.project;
    const result = resolveScene(state, resources, this.sceneId);
    const source = result.kind === 'blocked'
      ? { kind: 'unavailable' as const, token: state.token, sceneId: this.sceneId, reason: 'シーンの状態を確認してください。' }
      : { kind: 'ready' as const, token: state.token, sceneId: this.sceneId,
        captions: result.composition.captions.map((caption): CaptionListItem => {
          const anchor = caption.anchor;
          const owner: CaptionListItem['owner'] = anchor.kind !== 'value' ? unknown() : anchor.value.kind === 'project'
            ? value({ kind: 'project' }) : value({ kind: 'asset', assetId: anchor.value.assetId,
              name: modelNames[anchor.value.assetId] === undefined ? unknown() : value(modelNames[anchor.value.assetId]!) });
          const hidden = result.issues.some(i => i.entityId === caption.captionId && i.code === 'hidden-owner');
          return { id: caption.captionId, title: caption.title, body: caption.body, owner,
            color: colors[caption.captionId] ?? unknown(), mediaCount: value(0),
            pin: hidden ? 'ownerHidden' : caption.marker === 'needsReview' ? 'needsReview' :
              caption.marker === 'visible' ? 'visible' : 'unavailable' };
        }) };
    return { source, memory: this.memory, pending: this.pending, mutationBlock: null };
  }
  private detailSource(): DetailSource {
    const list = this.captionContext().source;
    const captionId = this.memory.selectedCaptionId;
    const base = { token: list.token, sceneId: this.sceneId };
    const caption = list.kind === 'ready' ? list.captions.find(c => c.id === captionId) : undefined;
    if (!caption) return { ...base, kind: 'unavailable', captionId,
      reason: captionId ? 'キャプションの状態を確認してください。' : '右の一覧からキャプションを選択してください。' };
    const edges = Object.values(this.project.state.captionMemberships).filter(e => e.resourceId === caption.id &&
      (e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'deleted'));
    const sceneIds = new Set(edges.map(e => e.sceneId));
    const count = edges.some(e => e.lifecycle.kind !== 'value') || sceneIds.size !== edges.length
      ? unknown<number>() : value(sceneIds.size);
    return { ...base, kind: 'ready', caption, sceneCount: count };
  }
  detailContext(): DetailContext {
    const source = this.detailSource();
    if (source.kind === 'ready' && !this.drafts.has(source.caption.id))
      this.drafts.set(source.caption.id, beginCaptionDraft(source)!);
    const draft = source.kind === 'ready' ? this.drafts.get(source.caption.id)! : null;
    return { source, draft, mutationBlock: null, feedback: this.detailFeedback };
  }
  modelContext(): ModelListContext {
    const { state, resources, modelNames } = this.project;
    return { source: { kind: 'ready', projectId: fixtureIds.project, sceneId: this.sceneId, token: state.token,
      items: Object.values(resources.assets).map(asset => {
        const edges = Object.values(state.assetMemberships).filter(e => e.resourceId === asset.id && e.sceneId === this.sceneId &&
          (e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'deleted'));
        const edge = edges[0];
        const membership: Field<ModelMembership> = edges.length > 1 || edge?.lifecycle.kind === 'unresolved' ? unknown() : edge
          ? value({ kind: 'included', membershipId: edge.id, sceneId: edge.sceneId, assetId: edge.resourceId, orderKey: edge.orderKey })
          : value({ kind: 'absent' });
        return { id: asset.id, name: modelNames[asset.id] === undefined ? unknown<string>() : value(modelNames[asset.id]!),
          lifecycle: asset.lifecycle.kind === 'value' ? value(asset.lifecycle.value.state) : unknown<'active' | 'deleted'>(),
          membership, display: value(edge ? 'unavailable' as const : 'outsideScene' as const),
          displayReason: edge ? 'シーンに含まれています。3D描画は未接続です。' : null };
      }) }, memory: this.models.get(this.sceneId)!, pending: null, mutationBlock: null, feedback: this.modelFeedback };
  }
  acceptNavigation(plan: NavigationPlan): boolean {
    if (plan.kind === 'blocked') { this.message = plan.reason; return false; }
    if (plan.kind === 'unchanged') return true;
    if (!navigationPlanIsCurrent(plan, this.project.state, this.navigation, this.pending))
      return this.refuse('状態が変わっています。操作を選び直してください。');
    this.compositionOf(this.project, plan.session.sceneId!);
    this.navigation = plan.session; this.message = ''; return true;
  }
  acceptList(plan: CaptionListPlan): boolean {
    if (plan.kind === 'blocked') return this.refuse(plan.reason);
    if (!captionListPlanIsCurrent(plan, this.captionContext())) return this.refuse('一覧が更新されています。選び直してください。');
    if (plan.kind === 'change') {
      this.navigation = Object.freeze({ ...this.navigation, sceneMemory: Object.freeze({ ...this.navigation.sceneMemory, [this.sceneId]: plan.memory }) });
      if (plan.intent === 'select') this.detailFeedback = { kind: 'idle' };
    } else if (plan.kind === 'effect') {
      if (plan.action === 'review') return this.refuse('この開発版では状態修復は未接続です。');
      if (!plan.assetId) return this.refuse('対象のモデルを確認してください。');
      return this.acceptModel(planModelList(this.modelContext(), { kind: 'membership', assetId: plan.assetId, included: true }));
    }
    this.message = ''; return true;
  }
  acceptDetail(event: CaptionDetailEvent): boolean {
    const context = this.detailContext();
    if (event.kind === 'draft') {
      if (context.draft !== event.baseDraft) return this.refuse('入力の状態が変わっています。');
      this.drafts.set(event.draft.captionId, event.draft); this.message = ''; return true;
    }
    if (event.kind === 'cancel') {
      if (context.draft !== event.draft || event.draft.composing || context.feedback.kind === 'applying') return false;
      const clean = beginCaptionDraft(context.source);
      if (clean) this.drafts.set(clean.captionId, clean);
      this.detailFeedback = { kind: 'idle' }; this.message = ''; return true;
    }
    if (event.kind !== 'apply') return this.refuse('この開発版ではウィンドウ表示・状態修復は未接続です。');
    try {
      if (!captionApplyIsCurrent(event, context)) throw new Error('状態が変わっています。入力は保持しています。');
      const token = fresh('snapshot'), old = this.project.resources.captions[event.captionId]!;
      const nextCaption = { ...old, ...(event.changes.title !== undefined ? { title: value(event.changes.title) } : {}),
        ...(event.changes.body !== undefined ? { body: value(event.changes.body) } : {}) };
      const local = { ...this.project, state: { ...this.project.state, token },
        resources: { ...this.project.resources, token, captions: { ...this.project.resources.captions, [old.id]: nextCaption } },
        colors: event.changes.color === undefined ? this.project.colors : { ...this.project.colors, [old.id]: value(event.changes.color) } };
      this.publish(this.authority ? this.authority.write(this.project.state.token,
        Object.fromEntries(Object.entries(event.changes).map(([field, text]) =>
          [captionKey(old.id, field as 'title' | 'body' | 'color'), text!]))) : local);
      this.drafts.set(old.id, acceptCaptionApply(event, context.draft!, this.detailSource()));
      this.detailFeedback = { kind: 'idle' }; this.message = '変更を適用しました。このページ内だけの変更です。'; return true;
    } catch (error) {
      this.detailFeedback = { kind: 'failed', plan: event, message: this.errorText(error) };
      return this.refuse(this.detailFeedback.message);
    }
  }
  acceptModel(plan: ModelListPlan): boolean {
    if (plan.kind === 'blocked') return this.refuse(plan.reason);
    if (!modelListPlanIsCurrent(plan, this.modelContext())) return this.refuse('所属状態が変わっています。選び直してください。');
    if (plan.kind === 'change') this.models.set(this.sceneId, plan.memory);
    else if (plan.kind === 'review') return this.refuse('3D描画・モデルの修復は未接続です。シーンへの追加・除外は操作できます。');
    else if (plan.kind === 'membership') {
      try {
        const command = plan.action === 'include'
          ? { kind: 'include' as const, sceneId: plan.sceneId, resourceKind: 'asset' as const,
            resourceId: plan.assetId, membershipId: fresh('sam'), orderKey: 'Z' }
          : { kind: 'exclude' as const, resourceKind: 'asset' as const, membershipId: plan.membershipId };
        const prepared = planSceneCommand(this.project.state, this.project.resources, command, fresh('evt'));
        const state = previewScenePlan(this.project.state, prepared, fresh('snapshot'));
        const changed = state.assetMemberships[command.membershipId]!;
        this.publish(this.authority ? this.authority.write(this.project.state.token,
          { [membershipKey(changed.id)]: JSON.stringify(changed) }) :
          { ...this.project, state, resources: { ...this.project.resources, token: state.token } });
        this.modelFeedback = { kind: 'idle' };
      } catch (error) {
        this.modelFeedback = { kind: 'failed', plan, message: this.errorText(error) };
        return this.refuse(this.modelFeedback.message);
      }
    }
    this.message = ''; return true;
  }
  private refuse(reason: string) { this.message = reason; return false; }
  private errorText(error: unknown) { return error instanceof Error ? error.message : '適用できませんでした。'; }
}
