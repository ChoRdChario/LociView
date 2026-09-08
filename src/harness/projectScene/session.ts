import { planSceneCommand, previewScenePlan } from '../../scene/commands';
import { chooseStartupScene, resolveScene } from '../../scene/resolve';
import { value, type Anchor, type Composition, type Field } from '../../scene/types';
import { navigationPlanIsCurrent, type NavigationPlan, type NavigationSession, type PendingInteraction,
  type SceneUiMemory } from '../../ui/projectScene/navigationState';
import { captionListPlanIsCurrent, planCaptionList, type CaptionListContext, type CaptionListItem,
  type CaptionListPlan } from '../../ui/projectScene/captionListState';
import { acceptCaptionApply, beginCaptionDraft, captionApplyIsCurrent, hasCaptionDraft,
  type CaptionDraft, type DetailContext, type DetailSource } from '../../ui/projectScene/captionDetailState';
import type { CaptionDetailEvent } from '../../ui/projectScene/captionDetailControls';
import { modelListPlanIsCurrent, newModelListMemory, planModelList, type ModelListContext,
  type ModelListMemory, type ModelListPlan, type ModelMembership } from '../../ui/projectScene/modelListState';
import { createSyntheticProject, fixtureIds, freezeSynthetic, type SyntheticProject } from './fixture';
import { bindingKey, captionKey, membershipKey, type SyntheticAuthority } from './historyProjection';
import { decodeSyntheticAnchor, modelVersion, syntheticVersions, versionFromClosure, type SyntheticModelVersion } from './modelFixture';
import { canonicalFixture, createFixtureModel, fixtureModelIds, moveFixtureModel, type FixtureModelClosure } from './modelClosure';
import { modelClosureKey } from './modelHistory';
import { newPinModeMemory, pinModePlanIsCurrent, planPinMode, type PinModeContext,
  type PinModeMemory, type PinModePlan, type PinProposal } from '../../ui/projectScene/pinModeState';
import { captionIncludePlanIsCurrent, newCaptionIncludeMemory, type CaptionIncludeContext,
  type CaptionIncludeMemory, type CaptionIncludePlan } from '../../ui/projectScene/captionIncludeState';

export interface SyntheticPinInput {
  readonly coordinates: readonly [string, string, string]; readonly familyId: string | null;
}
export interface ModelUpdatePlan { readonly token: string; readonly sceneId: string; readonly assetId: string; readonly bindingId: string }
export interface ModelPlacementDraft {
  readonly token: string; readonly sceneId: string; readonly assetId: string; readonly source: FixtureModelClosure;
  readonly coordinates: readonly [string, string, string]; readonly composing: boolean; readonly prepared?: FixtureModelClosure;
}

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
  private includes = new Map<string, CaptionIncludeMemory>();
  private includeFeedback: CaptionIncludeContext['feedback'] = { kind: 'idle' };
  private pins = new Map<string, PinModeMemory>();
  private pinInput: SyntheticPinInput | null = null;
  private pinProposal: PinProposal | null = null;
  private pinInputComposing = false;
  private placement: ModelPlacementDraft | null = null;
  private pinFeedback: PinModeContext['feedback'] = { kind: 'idle' };
  private searchComposing = false;
  private viewportDragging = false;
  private viewportState = { ready: false, assetIds: [] as readonly string[], issue: null as string | null };
  private detailFeedback: DetailContext['feedback'] = { kind: 'idle' };
  private modelFeedback: ModelListContext['feedback'] = { kind: 'idle' };
  message = '';
  constructor(private readonly authority?: SyntheticAuthority) {
    if (authority) this.project = authority.read();
    const sceneId = chooseStartupScene(this.project.state).sceneId;
    if (!sceneId) throw new Error('合成シーンを開けません。');
    this.navigation = Object.freeze({ sceneId, task: 'captions', sceneMemory: Object.freeze(
      Object.fromEntries(Object.keys(this.project.state.scenes).map(key => [key, emptyMemory()]))) });
    for (const key of Object.keys(this.project.state.scenes)) {
      this.includes.set(key, newCaptionIncludeMemory(key));
      this.models.set(key, newModelListMemory(fixtureIds.project, key)); this.pins.set(key, newPinModeMemory(key));
    }
  }
  get snapshot() { return this.project; }
  get session() { return this.navigation; }
  get sceneId() { return this.navigation.sceneId!; }
  get memory() { return this.navigation.sceneMemory[this.sceneId]!; }
  get pending(): PendingInteraction | null {
    const text = this.textPending;
    return text === 'composition' ? text : this.viewportDragging ? 'camera' : this.placement ? 'modelTransform' : this.pinInput ? 'pinMove' : text;
  }
  private get textPending(): PendingInteraction | null {
    if (this.placement?.composing || this.pinInputComposing || this.searchComposing || [...this.includes.values()].some(m => m.composing) || [...this.models.values()].some(m => m.composing) ||
      [...this.drafts.values()].some(d => d.composing !== null)) return 'composition';
    return [...this.drafts.values()].some(hasCaptionDraft) ? 'text' : null;
  }
  setSearchComposing(active: boolean) { this.searchComposing = active; }
  setViewportDragging(active: boolean): boolean { const changed = this.viewportDragging !== active; this.viewportDragging = active; return changed; }
  setViewportState(ready: boolean, assetIds: readonly string[], issue: string | null): boolean {
    const next = { ready, assetIds, issue }, changed = JSON.stringify(next) !== JSON.stringify(this.viewportState);
    this.viewportState = next; return changed;
  }
  get displayReady() { return this.viewportState.ready; }
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
  includeContext(): CaptionIncludeContext {
    const { state, resources, colors, modelNames } = this.project;
    return { source: { kind: 'ready', token: state.token, sceneId: this.sceneId,
      items: Object.values(resources.captions).map(caption => {
        const anchor = caption.anchor.kind === 'value' ? caption.anchor.value : null;
        const edges = Object.values(state.captionMemberships).filter(e => e.sceneId === this.sceneId && e.resourceId === caption.id &&
          (e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'deleted'));
        return { caption: { id: caption.id, title: caption.title, body: caption.body, color: colors[caption.id] ?? unknown<string>(),
          mediaCount: value(0), pin: anchor?.kind === 'asset' && !this.composition.assets.some(asset => asset.assetId === anchor.assetId)
            ? 'ownerHidden' as const : 'unavailable' as const, owner: anchor?.kind === 'asset' ? value({ kind: 'asset' as const,
            assetId: anchor.assetId, name: value(modelNames[anchor.assetId] ?? 'モデル') }) : unknown<CaptionListItem['owner'] extends Field<infer T> ? T : never>() },
          lifecycle: caption.lifecycle.kind === 'value' ? value(caption.lifecycle.value.state) : unknown<'active' | 'deleted'>(),
          membership: edges.length > 1 || edges.some(e => e.lifecycle.kind !== 'value') ? unknown<'absent' | 'included'>() :
            value(edges.length ? 'included' as const : 'absent' as const) };
      }) }, memory: this.includes.get(this.sceneId)!, pending: this.pending, mutationBlock: null, feedback: this.includeFeedback };
  }
  acceptInclude(plan: CaptionIncludePlan): boolean {
    try {
      if (plan.kind === 'blocked') throw new Error(plan.reason);
      if (!captionIncludePlanIsCurrent(plan, this.includeContext())) throw new Error('所属状態が変わっています。選び直してください。');
      if (plan.kind === 'change') this.includes.set(this.sceneId, plan.memory);
      else if (plan.kind === 'review') return this.refuse('画面上部で重複した項目・更新の競合を確認してください。');
      else {
        const membershipId = fresh('scm'), prepared = planSceneCommand(this.project.state, this.project.resources,
          { kind: 'include', sceneId: this.sceneId, resourceKind: 'caption', resourceId: plan.captionId, membershipId, orderKey: 'Z' }, fresh('evt'));
        const state = previewScenePlan(this.project.state, prepared, fresh('snapshot'));
        this.publish(this.authority ? this.authority.write(this.project.state.token,
          { [membershipKey(membershipId)]: JSON.stringify(state.captionMemberships[membershipId]) }) :
          { ...this.project, state, resources: { ...this.project.resources, token: state.token } });
        this.message = 'このシーンに追加しました。キャプションの内容と所有モデルは変わりません。';
      }
      this.includeFeedback = { kind: 'idle' }; return true;
    } catch (error) { this.includeFeedback = { kind: 'failed', message: this.errorText(error) }; return this.refuse(this.errorText(error)); }
  }
  detailContext(): DetailContext {
    const source = this.detailSource();
    if (source.kind === 'ready' && !this.drafts.has(source.caption.id))
      this.drafts.set(source.caption.id, beginCaptionDraft(source)!);
    const draft = source.kind === 'ready' ? this.drafts.get(source.caption.id)! : null;
    return { source, draft, mutationBlock: this.placement ? 'モデルの配置を確定するか、取り消してください。' :
      this.pinInput ? 'ピンの操作を確定するか、取り消してください。' : null, feedback: this.detailFeedback };
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
          membership, display: value(!edge ? 'outsideScene' as const : this.viewportState.ready && this.viewportState.assetIds.includes(asset.id) ? 'visible' as const : 'unavailable' as const),
          displayReason: !edge || (this.viewportState.ready && this.viewportState.assetIds.includes(asset.id)) ? null :
            asset.projection.kind !== 'value' || edges.length > 1 ? 'モデルの更新・所属の候補を確認してください。' :
              this.viewportState.issue ?? 'シーンに含まれています。3D表示を確認してください。' };
      }) }, memory: this.models.get(this.sceneId)!, pending: this.viewportDragging ? 'camera' : this.placement ? 'modelTransform' : this.pinInput ? 'pinMove' : null, mutationBlock: null, feedback: this.modelFeedback };
  }
  get modelVersions() { return this.project.modelVersions ?? syntheticVersions; }
  modelUpdateContext() {
    const model = this.models.get(this.sceneId)!, asset = model.assetId ? this.project.resources.assets[model.assetId] : undefined;
    const projection = asset?.projection.kind === 'value' ? asset.projection.value : null;
    const sceneCount = asset ? new Set(Object.values(this.project.state.assetMemberships).filter(e => e.resourceId === asset.id &&
      (e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'deleted')).map(e => e.sceneId)).size : 0;
    return { token: this.project.state.token, sceneId: this.sceneId, assetId: asset?.id ?? null,
      name: asset ? this.project.modelNames[asset.id] ?? 'モデル' : '',
      current: projection ? modelVersion(asset!.id, projection.bindingId, this.modelVersions) : undefined,
      choices: this.modelVersions.filter(v => v.assetId === asset?.id && v.projection.bindingId !== projection?.bindingId), sceneCount,
      issue: this.viewportDragging ? 'カメラ操作を終えてください。' : this.placement ? 'モデルの配置を確定するか、取り消してください。' : this.pinInput ? 'ピンの操作を確定するか、取り消してください。' : this.textPending === 'composition'
        ? '文字の入力を確定してください。' : !asset ? '一覧からモデルを選択してください。' :
          asset.lifecycle.kind !== 'value' || asset.lifecycle.value.state !== 'active' || !projection ? 'モデルの更新状態を確認してください。' : null };
  }
  acceptModelUpdate(plan: ModelUpdatePlan): boolean {
    try {
      const context = this.modelUpdateContext(); let version = modelVersion(plan.assetId, plan.bindingId, this.modelVersions);
      if (context.issue || plan.token !== context.token || plan.sceneId !== context.sceneId || plan.assetId !== context.assetId ||
        !version || !context.choices.includes(version)) throw new Error(context.issue ?? '対象が更新されています。モデルを選び直してください。');
      if (context.current && canonicalFixture(context.current.closure.binding.assetToProject) !== canonicalFixture(version.closure.binding.assetToProject)) {
        version = versionFromClosure(createFixtureModel({ ...fixtureModelIds(version.closure), binding: fresh('bnd') }, version.closure.shape,
          context.current.closure.binding.assetToProject, context.current.projection.bindingId));
      }
      this.publishModelVersion(plan.token, version);
      this.message = '合成モデルを更新しました。記録と座標は保持しています。'; return true;
    } catch (error) { return this.refuse(this.errorText(error)); }
  }
  private publishModelVersion(baseToken: string, version: SyntheticModelVersion) {
    const token = fresh('snapshot'), asset = this.project.resources.assets[version.assetId]!;
    const versions = this.modelVersions.some(v => v.projection.bindingId === version.projection.bindingId) ? this.modelVersions : [...this.modelVersions, version];
    const changes = { [bindingKey(asset.id)]: version.projection.bindingId,
      ...(versions === this.modelVersions ? {} : { [modelClosureKey(version.projection.bindingId)]: canonicalFixture(version.closure) }) };
    this.publish(this.authority ? this.authority.write(baseToken, changes) : { ...this.project, modelVersions: versions,
      state: { ...this.project.state, token }, resources: { ...this.project.resources, token,
        assets: { ...this.project.resources.assets, [asset.id]: { ...asset, projection: value(version.projection) } } } });
  }
  get modelPlacement() { return this.placement; }
  beginModelPlacement(): boolean {
    const ctx = this.modelUpdateContext();
    if (this.pending || ctx.issue || !ctx.current || !ctx.assetId) return this.refuse(ctx.issue ?? '入力を確定し、モデルを選択してください。');
    this.placement = freezeSynthetic({ token: ctx.token, sceneId: this.sceneId, assetId: ctx.assetId, source: ctx.current.closure,
      coordinates: ctx.current.closure.binding.assetToProject.translation.map(String) as [string, string, string], composing: false });
    this.message = ''; return true;
  }
  changeModelPlacement(coordinates: readonly [string, string, string], composing = false): boolean {
    if (!this.placement) return false;
    const { prepared: _prepared, ...old } = this.placement;
    this.placement = freezeSynthetic({ ...old, coordinates: [...coordinates] as [string, string, string], composing }); return true;
  }
  finishModelPlacement(cancel = false): boolean {
    try {
      const draft = this.placement; if (!draft || draft.composing) throw new Error('入力を確定してください。');
      if (cancel) { this.placement = null; this.message = ''; return true; }
      const active = this.project.resources.assets[draft.assetId]?.projection;
      if (draft.token !== this.project.state.token || draft.sceneId !== this.sceneId || active?.kind !== 'value' || active.value.bindingId !== draft.source.binding.id)
        throw new Error('モデルが更新されています。指定した位置は保持しています。');
      if (draft.coordinates.some(raw => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) || !Number.isFinite(Number(raw))))
        throw new Error('X・Y・Zを有限の数値で指定してください。');
      const position = draft.coordinates.map(raw => Number(raw) || 0) as [number, number, number];
      if (position.every((n, i) => n === draft.source.binding.assetToProject.translation[i])) { this.placement = null; this.message = '位置は変更されていません。'; return true; }
      const prepared = draft.prepared ?? moveFixtureModel(draft.source, fresh('bnd'), position);
      this.placement = freezeSynthetic({ ...draft, prepared });
      this.publishModelVersion(draft.token, versionFromClosure(prepared)); this.placement = null;
      this.message = 'モデルの配置を適用しました。保存は未接続です。'; return true;
    } catch (error) { return this.refuse(this.errorText(error)); }
  }
  get pinCoordinates() { return this.pinInput; }
  setPinComposing(active: boolean) { this.pinInputComposing = active; }
  pinContext(): PinModeContext {
    const { state, resources, modelNames } = this.project;
    const modelSource = this.modelContext().source;
    const items = modelSource.kind === 'ready' ? modelSource.items : [];
    const source = this.detailSource(), selectedId = this.memory.selectedCaptionId;
    const caption = selectedId ? resources.captions[selectedId] : undefined;
    const anchor = caption?.anchor.kind === 'value' ? caption.anchor.value : null;
    const models = items.map(item => {
      const asset = resources.assets[item.id]!, present = item.membership.kind === 'value' && item.membership.value.kind === 'included';
      return { assetId: asset.id, name: value(modelNames[asset.id] ?? 'モデル'),
        token: JSON.stringify([asset.projection, asset.lifecycle, item.membership]),
        addBlock: 'この接続版ではピンの追加は未接続です。',
        moveBlock: !present ? '所有モデルをこのシーンに表示してください。' : asset.projection.kind !== 'value'
          ? 'モデルの更新候補を確認してください。' : null };
    });
    const selected = caption ? { captionId: caption.id, title: caption.title,
      assetId: anchor?.kind === 'asset' ? value(anchor.assetId) : unknown<string>(),
      token: JSON.stringify([caption.anchor, caption.lifecycle]),
      sceneCount: source.kind === 'ready' ? source.sceneCount : unknown<number>(),
      block: !anchor ? 'ピン位置の競合を確認してください。' : anchor.kind !== 'asset' ? 'この接続版ではモデルに付いたピンだけ移動できます。' : null } : null;
    const correction = this.pinInput ? this.preparePinAnchor() : null;
    return { source: { kind: 'ready', token: state.token, sceneId: this.sceneId, models, selected },
      memory: this.pins.get(this.sceneId)!, otherPending: this.viewportDragging ? 'camera' : this.placement ? 'modelTransform' : this.textPending, mutationBlock: null,
      proposal: this.pinProposal, proposalIssue: correction?.issue ?? null, feedback: this.pinFeedback };
  }
  pinCoordinateContext() {
    const mode = this.pins.get(this.sceneId)!.mode;
    const asset = mode ? this.project.resources.assets[mode.target.assetId] : undefined;
    const version = asset?.projection.kind === 'value' ? modelVersion(asset.id, asset.projection.value.bindingId, this.modelVersions) : undefined;
    const caption = mode?.caption ? this.project.resources.captions[mode.caption.captionId] : undefined;
    const anchor = caption?.anchor.kind === 'value' && caption.anchor.value.kind === 'asset' ? caption.anchor.value : null;
    const needsFamily = !anchor || !version?.projection.anchorCompatibilityIds.includes(anchor.authoredAnchorCompatibilityId);
    return { mode, input: this.pinInput, families: version?.families ?? [], needsFamily };
  }
  private preparePinAnchor(): { anchor?: Anchor; issue: string | null } {
    try {
      const { mode, input, families, needsFamily } = this.pinCoordinateContext();
      if (!mode?.caption || !input) throw new Error('ピンの操作を開始してください。');
      const old = this.project.resources.captions[mode.caption.captionId]!.anchor;
      const asset = this.project.resources.assets[mode.target.assetId]!, projection = asset.projection;
      if (old.kind !== 'value' || old.value.kind !== 'asset' || projection.kind !== 'value' ||
        old.value.assetId !== asset.id || old.value.assetFrameId !== projection.value.assetFrameId) throw new Error('ピンのモデルを確認してください。');
      const family = input.familyId ? families.find(f => f.id === input.familyId) : undefined;
      if (needsFamily && !family) throw new Error('補正先の表面を選択してください。');
      if (input.coordinates.some(raw => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) || !Number.isFinite(Number(raw))))
        throw new Error('X・Y・Zを有限の数値で指定してください。');
      const positionAsset = input.coordinates.map(raw => Number(raw) || 0);
      const anchor = decodeSyntheticAnchor(JSON.stringify({ kind: 'asset', assetId: asset.id, assetFrameId: projection.value.assetFrameId,
        positionAsset, authoredAssetRevisionId: projection.value.revisionId,
        authoredAnchorCompatibilityId: needsFamily ? family!.compatibilityId : old.value.authoredAnchorCompatibilityId,
        hitEvidence: { method: 'manual' } }), this.project.captionTemplates[mode.caption.captionId]!);
      return { anchor, issue: null };
    } catch (error) { return { issue: this.errorText(error) }; }
  }
  changePinCoordinates(input: SyntheticPinInput): boolean {
    const mode = this.pins.get(this.sceneId)!.mode;
    if (!mode || !this.pinInput) return false;
    this.pinInput = freezeSynthetic({ coordinates: [...input.coordinates] as [string, string, string], familyId: input.familyId });
    this.pinProposal = this.preparePinAnchor().issue ? null : Object.freeze({ token: fresh('proposal'), mode });
    this.pinFeedback = { kind: 'idle' }; return true;
  }
  acceptPin(plan: PinModePlan): boolean {
    try {
      if (plan.kind === 'blocked') throw new Error(plan.reason);
      if (!pinModePlanIsCurrent(plan, this.pinContext())) throw new Error('対象が更新されています。指定中の位置は保持しています。');
      if (plan.kind === 'change') {
        this.pins.set(this.sceneId, plan.memory);
        if (plan.intent === 'cancel') { this.pinInput = null; this.pinProposal = null; this.pinInputComposing = false; }
        else if (plan.intent === 'move') {
          const caption = this.project.resources.captions[plan.memory.mode!.caption!.captionId]!;
          if (caption.anchor.kind !== 'value' || caption.anchor.value.kind !== 'asset') throw new Error('ピンを確認してください。');
          this.pinInput = { coordinates: caption.anchor.value.positionAsset.map(String) as [string, string, string], familyId: null };
          this.changePinCoordinates(this.pinInput);
        }
      } else {
        const correction = this.preparePinAnchor(), captionId = plan.mode.caption!.captionId;
        if (correction.issue || !correction.anchor) throw new Error(correction.issue ?? '位置を確認してください。');
        const token = fresh('snapshot'), caption = this.project.resources.captions[captionId]!;
        this.publish(this.authority ? this.authority.write(plan.token, { [captionKey(captionId, 'anchor')]: JSON.stringify(correction.anchor) }) : {
          ...this.project, state: { ...this.project.state, token }, resources: { ...this.project.resources, token,
            captions: { ...this.project.resources.captions, [captionId]: { ...caption, anchor: value(correction.anchor) } } } });
        this.pins.set(this.sceneId, { ...this.pins.get(this.sceneId)!, mode: null }); this.pinInput = null; this.pinProposal = null;
        this.message = 'ピン座標を適用しました。保存は未接続です。';
      }
      this.pinFeedback = { kind: 'idle' }; return true;
    } catch (error) { this.pinFeedback = { kind: 'failed', message: this.errorText(error) }; return this.refuse(this.errorText(error)); }
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
      if (plan.action === 'review') {
        if (plan.captionId !== this.memory.selectedCaptionId && !this.acceptList(planCaptionList(this.captionContext(),
          { kind: 'select', captionId: plan.captionId }))) return false;
        return this.acceptPin(planPinMode(this.pinContext(), { kind: 'move' }));
      }
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
    else if (plan.kind === 'review') return this.refuse('モデルの修復は未接続です。シーンへの追加・除外は操作できます。');
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
