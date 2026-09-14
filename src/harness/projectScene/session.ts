import { planSceneCommand, previewScenePlan, type SceneAuthoringCommand, type CaptionDeletionImpact, type CaptionDeletionCommand, type AssetDeletionImpact } from '../../scene/commands';
import { chooseStartupScene, resolveScene, memberships } from '../../scene/resolve';
import { value, type Anchor, type Composition, type Field } from '../../scene/types';
import { navigationPlanIsCurrent, planNavigation, type NavigationPlan, type NavigationSession, type PendingInteraction,
  type SceneUiMemory } from '../../ui/projectScene/navigationState';
import { captionListPlanIsCurrent, captionListView, planCaptionList, type CaptionListContext, type CaptionListItem,
  type CaptionListPlan } from '../../ui/projectScene/captionListState';
import { acceptCaptionApply, beginCaptionDraft, captionApplyIsCurrent, hasCaptionDraft,
  type CaptionDraft, type DetailContext, type DetailSource } from '../../ui/projectScene/captionDetailState';
import type { CaptionDetailEvent } from '../../ui/projectScene/captionDetailControls';
import { captionWindowPlanIsCurrent, newCaptionWindowMemory, planCaptionWindow,
  type CaptionWindowMemory, type CaptionWindowPlan } from '../../ui/projectScene/captionWindowState';
import { modelListPlanIsCurrent, newModelListMemory, planModelList, type ModelListContext,
  type ModelListMemory, type ModelListPlan, type ModelMembership } from '../../ui/projectScene/modelListState';
import { createSyntheticProject, fixtureIds, freezeSynthetic, type SyntheticProject } from './fixture';
import { bindingKey, captionKey, membershipKey, type SyntheticAuthority } from './historyProjection';
import { pinPositionInParent } from './pinParent';
import { decodeSyntheticAnchor, modelVersion, syntheticVersions, versionFromClosure } from './modelFixture';
import { canonicalFixture, createFixtureModel, fixtureModelIds, moveFixtureModel, readFixtureModel, type FixtureModelClosure } from './modelClosure';
import type { DisplayModelVersion, DisplayModelClosure, ModelFileAddition, ModelFileReplacement, ModelReplacementTarget } from './modelTypes';
import { modelClosureKey } from './modelHistory';
import { newPinModeMemory, pinActionIssue, pinModePlanIsCurrent, planPinMode, type PinModeContext,
  type PinModeMemory, type PinModePlan, type PinProposal } from '../../ui/projectScene/pinModeState';
import { captionIncludePlanIsCurrent, newCaptionIncludeMemory, type CaptionIncludeContext,
  type CaptionIncludeMemory, type CaptionIncludePlan } from '../../ui/projectScene/captionIncludeState';
import { SyntheticViewSession } from './viewSession';
import { projectViewHistory, viewHistorySeed, orderBetween } from './viewHistory';
import { SyntheticMaterialSession } from './materialSession';
import { projectMaterialHistory } from './materialHistory';
import type { MaterialPlan } from '../../ui/projectScene/materialState';
import { SyntheticMediaSession, type MediaContext } from './mediaSession';
import { mediaSeed, projectMediaHistory, captionAttachmentCounts, type MediaFileSelection } from './mediaHistory';
import { previewHistory } from './historyPort';
import { WorkingAcknowledgment, afterWorking, type WorkingResult } from './acknowledgment';
import type { PinSurfaceTarget } from './viewportPicking';
import type { GizmoProposal, ModelPlacementTarget } from './pinGizmo';
import { degreesRotation, finiteInput, isCanonicalRotation, rotationDegrees, type ModelManipulation, type ModelTransformMode } from './modelTransform';

export interface SyntheticPinInput {
  readonly coordinates: readonly [string, string, string]; readonly familyId: string | null;
}
export interface ModelUpdatePlan { readonly token: string; readonly sceneId: string; readonly assetId: string; readonly bindingId: string }
export interface SceneAuthoringDraft { readonly kind: 'create' | 'rename' | 'default'; readonly token: string;
  readonly sceneId: string; readonly name: string; readonly composing: boolean }
export interface ModelPlacementDraft {
  readonly token: string; readonly sceneId: string; readonly assetId: string; readonly source: DisplayModelClosure;
  readonly coordinates: readonly [string, string, string]; readonly composing: boolean; readonly prepared?: FixtureModelClosure;
  readonly preparedBindingId?: string;
  readonly angles: readonly [string, string, string]; readonly scale: string;
  readonly rotation: ModelManipulation['rotationXYZW']; readonly mode: ModelTransformMode;
}

const fresh = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const unknown = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'invalid' });
const emptyMemory = (): SceneUiMemory => Object.freeze({ selectedCaptionId: null, listScrollTop: 0,
  search: '', pinColors: null, ownerFilter: { kind: 'all' as const } });

/** Development-only UI state. Optional authority owns memory or confirmed saved history. */
export class SyntheticSession {
  readonly acknowledgment = new WorkingAcknowledgment();
  readonly views = new SyntheticViewSession(() => this.project, () => this.sceneId,
    (token, changes, done, failed) => this.applyWorking(() => this.writeViews(token, changes), done, failed),
    () => this.workingBlock, () => this.viewRestriction);
  readonly materials = new SyntheticMaterialSession(() => this.project, () => this.sceneId,
    (token, changes, done, failed) => this.applyWorking(() => this.writeMaterials(token, changes), done, failed), () => this.workingBlock, () => this.materialRestriction);
  readonly media = new SyntheticMediaSession(() => this.mediaContext(),
    (token, changes, done, failed) => this.applyWorking(() => this.writeMedia(token, changes), done, failed), () => this.workingBlock,
    () => !!this.authority?.addMediaFile,
    (token, command, done, failed) => this.applyWorking(() => {
      if (this.mediaRestriction || !this.authority?.addMediaFile) throw Error(this.mediaRestriction ?? 'ファイルの追加は未接続です。');
      return afterWorking(this.authority.addMediaFile(token, command), next => this.publish(next));
    }, done, failed));
  private project = createSyntheticProject();
  private navigation: NavigationSession;
  private drafts = new Map<string, CaptionDraft>();
  private models = new Map<string, ModelListMemory>();
  private windows = new Map<string, CaptionWindowMemory>();
  private windowDragging = false;
  private includes = new Map<string, CaptionIncludeMemory>();
  private includeFeedback: CaptionIncludeContext['feedback'] = { kind: 'idle' };
  private pins = new Map<string, PinModeMemory>();
  private pinInput: SyntheticPinInput | null = null;
  private pinAddColor: string | null = null;
  private pinProposal: PinProposal | null = null;
  private pinInputComposing = false;
  private placement: ModelPlacementDraft | null = null;
  private captionComparison: { token: string; sceneId: string; captionId: string; anchor: Anchor; label: string } | null = null;
  private sceneDraft: SceneAuthoringDraft | null = null;
  private deletion: { token: string; sceneId: string; title: string; impact: CaptionDeletionImpact } | null = null;
  private assetDeletion: { token: string; sceneId: string; name: string; impact: AssetDeletionImpact } | null = null;
  private modelFile: { token: string; command: ModelFileAddition } | null = null;
  private replacement: { target: ModelReplacementTarget; command: ModelFileReplacement; name: string; sceneCount: number } | null = null;
  get modelFileReplacementAvailable() { return !!this.authority?.replaceModelFile; }
  get modelReplacementSelection() { return this.replacement; }
  selectModelReplacement(target: ModelReplacementTarget, file: MediaFileSelection): boolean {
    const context = this.modelUpdateContext();
    if (!this.modelFileReplacementAvailable || this.readOnly || this.pending || this.externalChanges() || context.issue ||
      target.token !== context.token || target.sceneId !== context.sceneId || target.assetId !== context.assetId ||
      target.expectedBindingId !== context.current?.projection.bindingId)
      return this.refuse('入力を確定し、差し替えるモデルを確認してください。');
    this.replacement = { target: { ...target }, name: context.name, sceneCount: context.sceneCount,
      command: { sceneId: target.sceneId, assetId: target.assetId, expectedBindingId: target.expectedBindingId,
        file: { name: file.name, size: file.size, arrayBuffer: file.arrayBuffer.bind(file) } } };
    this.message = ''; return true;
  }
  get modelReplacementIssue(): string | null {
    const d = this.replacement, context = this.modelUpdateContext();
    if (this.readOnly) return 'このタブは閲覧専用です。';
    if (context.issue) return context.issue;
    if (this.externalChanges()) return '他の入力を確定するか、取り消してください。';
    if (this.modelFile || this.sceneDraft || this.deletion || this.views.pending || this.materials.pending || this.media.pending ||
      [...this.drafts.values()].some(hasCaptionDraft)) return '他の入力を確定するか、取り消してください。';
    if (d && (d.target.token !== context.token || d.target.sceneId !== context.sceneId || d.target.assetId !== context.assetId ||
      d.target.expectedBindingId !== context.current?.projection.bindingId)) return '対象が更新されています。選択を取り消して、選び直してください。';
    return null;
  }
  cancelModelReplacement(): boolean { if (this.workingBlock) return false; this.replacement = null; this.message = ''; return true; }
  confirmModelReplacement(): boolean {
    const d = this.replacement, issue = this.modelReplacementIssue;
    if (!d || !this.authority?.replaceModelFile || issue) return this.refuse(issue ?? '差し替える3Dモデルを選択してください。');
    return this.applyWorking(() => afterWorking(this.authority!.replaceModelFile!(d.target.token, d.command), next => this.publish(next)), () => {
      const projection = this.project.resources.assets[d.command.assetId]?.projection;
      if (projection?.kind !== 'value' || projection.value.bindingId === d.command.expectedBindingId)
        throw Error('モデルの差し替えを確認できません。選択を保持しています。');
      this.replacement = null; this.message = 'モデルを差し替えました。要確認のピンは、位置を確認して調整できます。';
    });
  }
  get modelFileAdditionAvailable() { return !!this.authority?.addModelFile; }
  get hasModelFileSelection() { return !!this.modelFile; }
  cancelModelFile() { if (this.workingBlock) return false; this.modelFile = null; this.message = ''; return true; }
  addModelFile(expected: { token: string; sceneId: string }, file: MediaFileSelection) {
    if (!this.authority?.addModelFile || this.readOnly || this.pending || this.externalChanges() ||
      expected.token !== this.project.state.token || expected.sceneId !== this.sceneId)
      return this.refuse('入力を確定し、追加先のシーンを確認してください。');
    const selection = { token: expected.token, command: { sceneId: expected.sceneId, assetId: fresh('ast'), file } };
    this.modelFile = selection;
    return this.applyWorking(() => afterWorking(this.authority!.addModelFile!(selection.token, selection.command), next => this.publish(next)), () => {
      if (!this.project.modelVersions?.some(v => v.assetId === selection.command.assetId) ||
        !this.composition.assets.some(a => a.assetId === selection.command.assetId)) throw Error('モデルの追加を確認できません。入力を保持しています。');
      this.models.set(this.sceneId, { ...this.models.get(this.sceneId)!, assetId: selection.command.assetId, query: '' });
      this.modelFile = null; this.message = '';
    });
  }
  private pinFeedback: PinModeContext['feedback'] = { kind: 'idle' };
  private searchComposing = false;
  private viewportDragging = false;
  private viewportState = { ready: false, assetIds: [] as readonly string[], issue: null as string | null };
  private detailFeedback: DetailContext['feedback'] = { kind: 'idle' };
  private modelFeedback: ModelListContext['feedback'] = { kind: 'idle' };
  message = '';
  constructor(private readonly authority?: SyntheticAuthority, private readonly externalChanges: () => boolean = () => false) {
    if (authority) this.project = authority.read();
    const sceneId = chooseStartupScene(this.project.state).sceneId;
    if (!sceneId) throw new Error('合成シーンを開けません。');
    this.navigation = Object.freeze({ sceneId, task: 'captions', sceneMemory: Object.freeze(
      Object.fromEntries(Object.keys(this.project.state.scenes).map(key => [key, emptyMemory()]))) });
    for (const key of Object.keys(this.project.state.scenes)) {
      this.windows.set(key, newCaptionWindowMemory(key));
      this.includes.set(key, newCaptionIncludeMemory(key));
      this.models.set(key, newModelListMemory(this.project.projectId ?? fixtureIds.project, key)); this.pins.set(key, newPinModeMemory(key));
    }
  }
  get snapshot() { return this.project; }
  get savedDevelopment() { return this.authority?.storage === 'saved-development'; }
  get captionTextOnly() { return this.authority?.writeScope === 'caption-text'; }
  get readOnly() { return this.authority?.readOnly === true; }
  get editingRestriction() { return this.readOnly ? 'このタブは閲覧専用です。' : this.captionTextOnly ? 'この保存経路では未接続の編集です。' : null; }
  get pinRestriction() { return this.readOnly || !this.authority?.capabilities?.pins ? this.editingRestriction : null; }
  get membershipRestriction() { return this.readOnly || !this.authority?.capabilities?.membership ? this.editingRestriction : null; }
  get colorReadOnly() { return this.captionTextOnly && !this.authority?.capabilities?.color; }
  get viewRestriction() { return this.readOnly || !this.authority?.capabilities?.views ? this.editingRestriction : null; }
  get materialRestriction() { return this.readOnly || !this.authority?.capabilities?.materials ? this.editingRestriction : null; }
  get mediaRestriction() { return this.readOnly || !this.authority?.capabilities?.media ? this.editingRestriction : null; }
  get placementRestriction() { return this.readOnly || !this.authority?.capabilities?.placement ? this.editingRestriction : null; }
  get modelUpdateRestriction() { return this.readOnly || !this.authority?.capabilities?.preparedRevision && !this.modelFileReplacementAvailable ? this.editingRestriction : null; }
  get sceneAuthoringAvailable() { return !!this.authority?.capabilities?.sceneAuthoring && !!this.authority.authorScene; }
  get sceneAuthoringDraft() { return this.sceneDraft; }
  get captionDeletionAvailable() { return !!this.authority?.captionDeletionImpact && !!this.authority.deleteCaption; }
  get assetDeletionAvailable() { return !!this.authority?.assetDeletionImpact && !!this.authority.deleteAsset; }
  get modelDeletion() { return this.assetDeletion; }
  get modelDeletionBlocked() { return this.captionDeletionBlocked || !!this.deletion; }
  beginAssetDeletion(): boolean {
    const assetId = this.models.get(this.sceneId)!.assetId;
    if (!assetId || !this.assetDeletionAvailable || this.readOnly || this.pending || this.externalChanges())
      return this.refuse('入力を確定してから削除対象を確認してください。');
    try {
      const impact = this.authority!.assetDeletionImpact!(this.project.state.token, assetId);
      this.assetDeletion = { token: this.project.state.token, sceneId: this.sceneId, name: this.project.modelNames[assetId] ?? 'モデル名を確認', impact };
      this.message = ''; return true;
    } catch (error) { return this.refuse(this.errorText(error)); }
  }
  cancelAssetDeletion(): boolean {
    if (this.workingBlock) return false;
    this.assetDeletion = null; this.message = ''; return true;
  }
  confirmAssetDeletion(): boolean {
    const d = this.assetDeletion;
    if (!d || d.impact.dependencies.length || this.readOnly || this.workingBlock || this.pending !== 'text' || this.modelDeletionBlocked) return false;
    if (d.token !== this.project.state.token || d.sceneId !== this.sceneId || d.impact.assetId !== this.models.get(this.sceneId)!.assetId)
      return this.refuse('内容が更新されています。削除を取り消して、参照を確認し直してください。');
    return this.applyWorking(() => afterWorking(this.authority!.deleteAsset!(d.token,
      { kind: 'deleteAsset', assetId: d.impact.assetId, eventId: fresh('evt') }), next => this.publish(next)), () => {
      this.assetDeletion = null;
      for (const [key, memory] of this.models) if (memory.assetId === d.impact.assetId)
        this.models.set(key, Object.freeze({ ...memory, assetId: null }));
      this.message = 'プロジェクトからモデルを削除しました。';
    });
  }
  get captionDeletion() { return this.deletion; }
  get captionDeletionBlocked() { return this.externalChanges() || !!this.views.pending || !!this.materials.pending || !!this.media.pending ||
    !!this.sceneDraft || [...this.drafts.values()].some(hasCaptionDraft); }
  beginCaptionDeletion(): boolean {
    const captionId = this.memory.selectedCaptionId;
    if (!captionId || !this.captionDeletionAvailable || this.readOnly || this.pending || this.externalChanges())
      return this.refuse('入力を確定してから削除対象を確認してください。');
    try {
      const impact = this.authority!.captionDeletionImpact!(this.project.state.token, captionId);
      const title = this.project.resources.captions[captionId]?.title;
      this.deletion = { token: this.project.state.token, sceneId: this.sceneId, impact,
        title: title?.kind === 'value' ? title.value || '無題' : 'タイトルに競合あり' };
      this.message = ''; return true;
    } catch (error) { return this.refuse(this.errorText(error)); }
  }
  cancelCaptionDeletion(): boolean {
    if (this.workingBlock) return false;
    this.deletion = null; this.message = ''; return true;
  }
  confirmCaptionDeletion(): boolean {
    const d = this.deletion;
    if (!d || this.readOnly || this.workingBlock || this.pending !== 'text' || this.captionDeletionBlocked) return false;
    if (d.token !== this.project.state.token || d.sceneId !== this.sceneId || d.impact.captionId !== this.memory.selectedCaptionId)
      return this.refuse('内容が更新されています。削除を取り消して、影響を確認し直してください。');
    const { captionId, memberships, attachments, tags } = d.impact;
    const command: CaptionDeletionCommand = { kind: 'deleteCaption', captionId, eventId: fresh('evt'),
      observedMembershipIds: memberships.map(e => e.id), observedAttachmentIds: attachments.map(e => e.id), observedTagMembershipIds: tags.map(e => e.id) };
    return this.applyWorking(() => afterWorking(this.authority!.deleteCaption!(d.token, command), next => this.publish(next)), () => {
      this.deletion = null; this.drafts.delete(captionId);
      this.navigation = Object.freeze({ ...this.navigation, sceneMemory: Object.freeze(Object.fromEntries(
        Object.entries(this.navigation.sceneMemory).map(([id, m]) => [id, m.selectedCaptionId === captionId ? Object.freeze({ ...m, selectedCaptionId: null }) : m]))) });
      for (const [id, m] of this.windows) this.windows.set(id, Object.freeze({ ...m,
        retained: m.retained.filter(c => c !== captionId), dismissed: m.dismissed.filter(c => c !== captionId),
        order: m.order.filter(c => c !== captionId), placements: m.placements.filter(c => c.captionId !== captionId) }));
      this.message = 'プロジェクトから削除しました。';
    });
  }
  beginSceneAuthoring(kind: SceneAuthoringDraft['kind']): boolean {
    if (!this.sceneAuthoringAvailable || this.readOnly || this.pending) return this.refuse('入力を確定してからシーンを編集してください。');
    const current = this.project.state.scenes[this.sceneId]!;
    if (kind === 'rename' && current.name.kind !== 'value' || kind === 'default' && this.project.state.defaultSceneId.kind !== 'value')
      return this.refuse('シーンの競合を先に解消してください。');
    this.sceneDraft = { kind, token: this.project.state.token, sceneId: this.sceneId,
      name: kind === 'create' ? '' : current.name.kind === 'value' ? current.name.value : '', composing: false };
    this.message = ''; return true;
  }
  editSceneAuthoring(name: string, composing = this.sceneDraft?.composing ?? false) {
    // A lease/readonly change must not strand local IME state or its final text.
    if (this.sceneDraft && (!this.workingBlock && !this.readOnly || this.sceneDraft.composing && !composing))
      this.sceneDraft = { ...this.sceneDraft, name, composing };
  }
  cancelSceneAuthoring() {
    if (!this.workingBlock && !this.sceneDraft?.composing) { this.sceneDraft = null; this.message = ''; }
  }
  applySceneAuthoring(): boolean {
    const d = this.sceneDraft;
    if (!d || d.composing || !this.sceneAuthoringAvailable || this.readOnly || this.workingBlock || this.pending !== 'text') return false;
    if (d.token !== this.project.state.token || d.sceneId !== this.sceneId) return this.refuse('内容が更新されています。入力を保持しています。取り消して選び直してください。');
    try {
      let command: SceneAuthoringCommand;
      if (d.kind === 'create') {
        const issues: import('../../scene/types').Issue[] = [];
        const edges = memberships(this.project.state, this.project.state.assetMemberships, d.sceneId, this.project.resources.assets, issues);
        if (issues.length) throw Error('モデルの登録を確認してからシーンを作成してください。');
        const keys = Object.values(this.project.state.scenes).filter(s => s.lifecycle.kind !== 'value' || s.lifecycle.value.state !== 'deleted')
          .map(s => { if (s.orderKey.kind !== 'value') throw Error('シーンの順序を確認してください。'); return s.orderKey.value; }).sort();
        command = { kind: 'createScene', sceneId: fresh('scn'), sourceSceneId: d.sceneId, activeSceneId: this.sceneId,
          name: d.name, orderKey: orderBetween(keys.at(-1) ?? null, null), membershipIds: edges.map(() => fresh('sam')), eventId: fresh('evt') };
      } else command = d.kind === 'rename' ? { kind: 'renameScene', sceneId: d.sceneId, name: d.name } : { kind: 'setDefaultScene', sceneId: d.sceneId };
      return this.applyWorking(() => afterWorking(this.authority!.authorScene!(d.token, command), next => this.publish(next)), () => {
        this.sceneDraft = null;
        if (command.kind === 'createScene') this.acceptNavigation(planNavigation(this.project.state, this.navigation, this.pending, { kind: 'scene', sceneId: command.sceneId }));
        this.message = command.kind === 'createScene' ? 'シーンを作成しました。' : command.kind === 'renameScene' ? '名前を変更しました。' : '開始シーンを設定しました。';
      });
    } catch (error) { return this.refuse(this.errorText(error)); }
  }
  get savedStatus() { return this.authority?.status?.(); }
  get canRetryWorking() { return !this.readOnly && this.savedStatus?.retryable !== false &&
    (this.acknowledgment.state === 'failed' || this.savedStatus?.kind === 'failed'); }
  get workingBlock() { return this.acknowledgment.block ?? (this.savedStatus?.kind === 'failed' ?
    this.savedStatus.error ?? '未完了の更新があります。更新を再試行してください。' : null); }
  retryWorking() {
    if (!this.canRetryWorking) return false;
    if (this.acknowledgment.state === 'failed') return this.acknowledgment.retry();
    if (this.authority?.retry && this.savedStatus?.kind === 'failed')
      return this.applyWorking(() => this.authority!.retry!(), () => this.refreshHistory());
    return false;
  }
  /** One confirmation/retry path for every editor and team command. */
  applyWorking(action: () => WorkingResult<unknown>, confirmed: () => void,
    failed: (error: unknown) => void = error => { this.message = this.errorText(error); }): boolean {
    const before = this.project.state.token;
    return this.acknowledgment.run(action, confirmed, failed, () => {
      if (this.authority?.status?.().kind === 'failed' && this.authority.retry)
        return () => afterWorking(this.authority!.retry!(), next => this.publish(next));
      if (this.authority && this.authority.read().state.token !== before)
        return () => this.publish(this.authority!.read()); // Confirmation only, never new changes.
      return undefined;
    });
  }
  private writeProject(base: string, changes: Readonly<Record<string, string>>, local: SyntheticProject) {
    return this.authority ? afterWorking(this.authority.write(base, changes, { sceneId: this.sceneId }), next => this.publish(next)) : this.publish(local);
  }
  get session() { return this.navigation; }
  get sceneId() { return this.navigation.sceneId!; }
  setCaptionComparison(value: { token: string; captionId: string; anchor: Anchor; label: string } | null) {
    this.captionComparison = value ? { ...value, sceneId: this.sceneId } : null;
  }
  get captionComparisonPreview() {
    const p = this.captionComparison;
    return p && p.token === this.project.state.token && p.sceneId === this.sceneId && !this.workingBlock && !this.pinInput && !this.placement ? p : null;
  }
  get memory() { return this.navigation.sceneMemory[this.sceneId]!; }
  get pending(): PendingInteraction | null {
    return this.workingBlock ? 'update' : this.interactionPending;
  }
  /** Local input/gestures, separate from a host-owned journal awaiting explicit recovery. */
  get interactionPending(): PendingInteraction | null {
    const text = this.textPending;
    return text === 'composition' ? text : this.windowDragging ? 'window' : this.viewportDragging ? 'camera' : this.placement ? 'modelTransform' : this.pinInput ? 'pinMove' : text;
  }
  private get textPending(): PendingInteraction | null {
    if (this.sceneDraft?.composing) return 'composition';
    if (this.views.pending === 'composition' || this.materials.pending === 'composition' || this.media.pending === 'composition') return 'composition';
    if (this.placement?.composing || this.pinInputComposing || this.searchComposing || [...this.includes.values()].some(m => m.composing) || [...this.models.values()].some(m => m.composing) ||
      [...this.drafts.values()].some(d => d.composing !== null)) return 'composition';
    return this.views.pending ?? this.materials.pending ?? this.media.pending ?? (this.modelFile || this.replacement || this.assetDeletion || this.deletion || this.sceneDraft || [...this.drafts.values()].some(hasCaptionDraft) ? 'text' : null);
  }
  setSearchComposing(active: boolean) { this.searchComposing = active; }
  setViewportDragging(active: boolean): boolean { const changed = this.viewportDragging !== active; this.viewportDragging = active; return changed; }
  setViewportState(ready: boolean, assetIds: readonly string[], issue: string | null): boolean {
    const next = { ready, assetIds, issue }, changed = JSON.stringify(next) !== JSON.stringify(this.viewportState);
    this.viewportState = next; return changed;
  }
  get displayReady() { return this.viewportState.ready; }
  get windowMemory() { return this.windows.get(this.sceneId)!; }
  setWindowDragging(active: boolean) { this.windowDragging = active; }
  acceptWindow(plan: CaptionWindowPlan): boolean {
    if (plan.kind === 'blocked') return this.refuse(plan.reason);
    if (!captionWindowPlanIsCurrent(plan, this.captionContext().source, this.windowMemory, this.memory.selectedCaptionId))
      return this.refuse('ウィンドウの状態が変わっています。操作を選び直してください。');
    this.windows.set(this.sceneId, plan.memory); this.message = ''; return true;
  }
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
    const memories = { ...this.navigation.sceneMemory };
    for (const key of Object.keys(next.state.scenes)) if (!Object.hasOwn(memories, key)) {
      memories[key] = emptyMemory(); this.windows.set(key, newCaptionWindowMemory(key));
      this.includes.set(key, newCaptionIncludeMemory(key)); this.models.set(key, newModelListMemory(this.project.projectId ?? fixtureIds.project, key));
      this.pins.set(key, newPinModeMemory(key));
    }
    this.navigation = Object.freeze({ ...this.navigation, sceneMemory: Object.freeze(memories) });
    this.project = freezeSynthetic(next);
  }
  private writeViews(base: string, changes: Readonly<Record<string, string>>) {
    if (this.viewRestriction) throw new Error(this.viewRestriction);
    if (base !== this.project.state.token) throw new Error('視点が更新されています。入力を保持しています。');
    if (this.authority) return afterWorking(this.authority.write(base, changes, { sceneId: this.sceneId }), next => this.publish(next));
    const token = fresh('snapshot'), previous = { token: base, cells: this.project.viewData?.cells ??
      Object.fromEntries(Object.entries(viewHistorySeed()).map(([key, text]) => [key, { kind: 'value' as const, value: text }])),
      cellVersions: this.project.viewData?.versions };
    const next = { token, cells: { ...previous.cells, ...Object.fromEntries(Object.entries(changes).map(([key, text]) => [key, { kind: 'value' as const, value: text }])) },
      cellVersions: { ...Object.fromEntries(Object.keys(previous.cells).map(key => [key, previous.cellVersions?.[key] ?? 'initial-empty-views'])),
        ...Object.fromEntries(Object.keys(changes).map(key => [key, `${token}/${key}`])) } };
    const result = projectViewHistory(next, previous);
    this.publish({ ...this.project, state: { ...this.project.state, token, scenes: result.scenes },
      resources: { ...this.project.resources, token, views: result.data.records }, viewData: result.data });
  }
  materialContext() {
    const other: PendingInteraction | null = this.workingBlock ? 'update' : this.assetDeletion ? 'text' : this.windowDragging ? 'window' : this.viewportDragging ? 'camera' : this.placement ? 'modelTransform' : this.pinInput ? 'pinMove' :
      this.searchComposing || [...this.includes.values()].some(m => m.composing) || [...this.models.values()].some(m => m.composing) ||
      [...this.drafts.values()].some(d => d.composing) ? 'composition' : this.views.pending ?? this.media.pending;
    return this.materials.context(other);
  }
  acceptMaterial(plan: MaterialPlan) {
    const accepted = this.materials.accept(plan, this.materialContext()); this.message = this.materials.message; return accepted; }
  mediaContext(): MediaContext {
    const source = this.captionContext().source, captionId = this.memory.selectedCaptionId;
    const other = this.windowDragging || this.viewportDragging || this.placement || this.pinInput;
    const composing = this.searchComposing || [...this.includes.values()].some(m => m.composing) || [...this.models.values()].some(m => m.composing) ||
      [...this.drafts.values()].some(d => d.composing);
    return { project: this.project, sceneId: this.sceneId, captionId,
      block: this.workingBlock ?? this.mediaRestriction ?? (this.deletion || this.assetDeletion ? '削除の確認を終えてください。' : other ? '移動中の操作を終えてください。' : composing ? '文字の入力を確定してください。' : this.views.pending || this.materials.pending ?
        '他の編集中の設定を適用するか取り消してください。' : source.kind !== 'ready' || !source.captions.some(c => c.id === captionId) ? 'キャプションを選択してください。' : null) };
  }
  private writeMedia(base: string, changes: Readonly<Record<string, string>>) {
    if (this.mediaRestriction) throw new Error(this.mediaRestriction);
    if (base !== this.project.state.token) throw new Error('添付が更新されています。入力を保持しています。');
    if (this.authority) return afterWorking(this.authority.write(base, changes, { sceneId: this.sceneId }), next => this.publish(next));
    const token = fresh('snapshot'), data = this.project.mediaData;
    const previous = { token: base, cells: data?.cells ?? Object.fromEntries(Object.entries(mediaSeed()).map(([k, text]) => [k, { kind: 'value' as const, value: text }])), causalChanges: data?.causalChanges };
    const mediaData = projectMediaHistory(previewHistory(previous, token, changes), Object.keys(this.project.resources.captions), previous);
    this.publish({ ...this.project, state: { ...this.project.state, token }, resources: { ...this.project.resources, token }, mediaData });
  }
  private writeMaterials(base: string, changes: Readonly<Record<string, string>>) {
    if (this.materialRestriction) throw new Error(this.materialRestriction);
    if (base !== this.project.state.token) throw new Error('設定が更新されています。入力を保持しています。');
    if (this.authority) return afterWorking(this.authority.write(base, changes, { sceneId: this.sceneId }), next => this.publish(next));
    const token = fresh('snapshot'), previous = { token: base, cells: this.project.materialData?.cells ?? {} };
    const cells = { ...previous.cells, ...Object.fromEntries(Object.entries(changes).map(([key, text]) => [key, { kind: 'value' as const, value: text }])) };
    const data = projectMaterialHistory({ token, cells }, this.modelVersions.map(v => v.closure), previous);
    this.publish({ ...this.project, state: { ...this.project.state, token }, resources: { ...this.project.resources, token, materials: data.records }, materialData: data });
  }
  captionContext(): CaptionListContext {
    const { resources, colors, modelNames, state } = this.project;
    const mediaCounts = captionAttachmentCounts(this.project.mediaData);
    const noMedia = this.authority?.capabilities?.media && !this.project.mediaData ? unknown<number>() : value(0);
    const modelSource = this.modelContext().source;
    const locallyHidden = new Set(modelSource.kind === 'ready' ? modelSource.items.filter(item =>
      item.display.kind === 'value' && item.display.value === 'temporarilyHidden').map(item => item.id) : []);
    const result = resolveScene(state, resources, this.sceneId);
    const source = result.kind === 'blocked'
      ? { kind: 'unavailable' as const, token: state.token, sceneId: this.sceneId, reason: 'シーンの状態を確認してください。' }
      : { kind: 'ready' as const, token: state.token, sceneId: this.sceneId,
        captions: result.composition.captions.map((caption): CaptionListItem => {
          const anchor = caption.anchor;
          const owner: CaptionListItem['owner'] = anchor.kind !== 'value' ? unknown() : anchor.value.kind === 'project'
            ? value({ kind: 'project' }) : value({ kind: 'asset', assetId: anchor.value.assetId,
              name: modelNames[anchor.value.assetId] === undefined ? unknown() : value(modelNames[anchor.value.assetId]!) });
          const hidden = result.issues.some(i => i.entityId === caption.captionId && i.code === 'hidden-owner') ||
            (caption.marker !== 'suppressed' && anchor.kind === 'value' && anchor.value.kind === 'asset' && locallyHidden.has(anchor.value.assetId));
          return { id: caption.captionId, title: caption.title, body: caption.body, owner,
            needsReview: result.issues.some(i => i.entityId === caption.captionId && i.code === 'needs-review'),
            color: colors[caption.captionId] ?? unknown(), mediaCount: mediaCounts.get(caption.captionId) ?? noMedia,
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
    const lifecycle = captionId ? this.project.resources.captions[captionId]?.lifecycle : undefined;
    if (!caption) return { ...base, kind: 'unavailable', captionId,
      reason: lifecycle?.kind === 'value' && lifecycle.value.state === 'deleted' ? 'このキャプションは削除されました。' :
        captionId ? 'キャプションの状態を確認してください。' : '右の一覧からキャプションを選択してください。' };
    const edges = Object.values(this.project.state.captionMemberships).filter(e => e.resourceId === caption.id &&
      (e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'deleted'));
    const sceneIds = new Set(edges.map(e => e.sceneId));
    const count = edges.some(e => e.lifecycle.kind !== 'value') || sceneIds.size !== edges.length
      ? unknown<number>() : value(sceneIds.size);
    return { ...base, kind: 'ready', caption: this.project.unsetCaptionColors?.includes(caption.id) ? { ...caption, color: value('') } : caption, sceneCount: count };
  }
  includeContext(): CaptionIncludeContext {
    const { state, resources, colors, modelNames } = this.project;
    const mediaCounts = captionAttachmentCounts(this.project.mediaData);
    const noMedia = this.authority?.capabilities?.media && !this.project.mediaData ? unknown<number>() : value(0);
    return { source: { kind: 'ready', token: state.token, sceneId: this.sceneId,
      items: Object.values(resources.captions).map(caption => {
        const anchor = caption.anchor.kind === 'value' ? caption.anchor.value : null;
        const edges = Object.values(state.captionMemberships).filter(e => e.sceneId === this.sceneId && e.resourceId === caption.id &&
          (e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'deleted'));
        return { caption: { id: caption.id, title: caption.title, body: caption.body, color: colors[caption.id] ?? unknown<string>(),
          mediaCount: mediaCounts.get(caption.id) ?? noMedia, pin: anchor?.kind === 'asset' && !this.composition.assets.some(asset => asset.assetId === anchor.assetId)
            ? 'ownerHidden' as const : 'unavailable' as const, owner: anchor?.kind === 'asset' ? value({ kind: 'asset' as const,
            assetId: anchor.assetId, name: value(modelNames[anchor.assetId] ?? 'モデル') }) : unknown<CaptionListItem['owner'] extends Field<infer T> ? T : never>() },
          lifecycle: caption.lifecycle.kind === 'value' ? value(caption.lifecycle.value.state) : unknown<'active' | 'deleted'>(),
          membership: edges.length > 1 || edges.some(e => e.lifecycle.kind !== 'value') ? unknown<'absent' | 'included'>() :
            value(edges.length ? 'included' as const : 'absent' as const) };
      }) }, memory: this.includes.get(this.sceneId)!, pending: this.pending, mutationBlock: null, feedback: this.includeFeedback };
  }
  acceptInclude(plan: CaptionIncludePlan): boolean {
    if (this.membershipRestriction) return this.refuse(this.membershipRestriction);
    const failed = (error: unknown) => { this.includeFeedback = { kind: 'failed', message: this.errorText(error) }; this.refuse(this.errorText(error)); };
    try {
      if (this.workingBlock) throw new Error(this.workingBlock);
      if (plan.kind === 'blocked') throw new Error(plan.reason);
      if (!captionIncludePlanIsCurrent(plan, this.includeContext())) throw new Error('所属状態が変わっています。選び直してください。');
      if (plan.kind === 'change') this.includes.set(this.sceneId, plan.memory);
      else if (plan.kind === 'review') return this.refuse('画面上部で重複した項目・更新の競合を確認してください。');
      else {
        const edges = Object.values(this.project.state.captionMemberships).filter(e => e.sceneId === this.sceneId &&
          e.resourceId === plan.captionId && (e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'deleted'));
        if (plan.kind === 'exclude' && (edges.length !== 1 || edges[0]!.lifecycle.kind !== 'value'))
          throw new Error('所属状態が変わっています。選び直してください。');
        const membershipId = plan.kind === 'include' ? fresh('scm') : edges[0]!.id;
        const command = plan.kind === 'include' ? { kind: 'include' as const, sceneId: this.sceneId,
          resourceKind: 'caption' as const, resourceId: plan.captionId, membershipId, orderKey: 'Z' } :
          { kind: 'exclude' as const, resourceKind: 'caption' as const, membershipId };
        const prepared = planSceneCommand(this.project.state, this.project.resources, command, fresh('evt'));
        const state = previewScenePlan(this.project.state, prepared, fresh('snapshot'));
        return this.applyWorking(() => this.writeProject(plan.token,
          { [membershipKey(membershipId)]: JSON.stringify(state.captionMemberships[membershipId]) },
          { ...this.project, state, resources: { ...this.project.resources, token: state.token } }), () => {
          if (plan.kind === 'exclude' && this.memory.selectedCaptionId === plan.captionId)
            this.navigation = Object.freeze({ ...this.navigation, sceneMemory: Object.freeze({ ...this.navigation.sceneMemory,
              [this.sceneId]: Object.freeze({ ...this.memory, selectedCaptionId: null }) }) });
          this.message = plan.kind === 'include' ? 'このシーンに追加しました。' : 'このシーンから外しました。キャプションは残っています。';
          this.includeFeedback = { kind: 'idle' };
        }, failed);
      }
      this.includeFeedback = { kind: 'idle' }; return true;
    } catch (error) { failed(error); return false; }
  }
  detailContext(): DetailContext {
    const source = this.detailSource();
    if (source.kind === 'ready' && !this.drafts.has(source.caption.id))
      this.drafts.set(source.caption.id, beginCaptionDraft(source)!);
    const draft = source.kind === 'ready' ? this.drafts.get(source.caption.id)! : source.captionId ? this.drafts.get(source.captionId) ?? null : null;
    return { source, draft, readonlyFields: this.colorReadOnly ? ['color'] : [], mutationBlock: this.workingBlock ?? (this.deletion || this.assetDeletion ? '削除の確認を終えてください。' : this.readOnly ? 'このタブは閲覧専用です。' : this.windowDragging ? 'ウィンドウの移動を終えてください。' : this.placement ? 'モデルの配置を確定するか、取り消してください。' :
      this.pinInput ? 'ピンの操作を確定するか、取り消してください。' : null), feedback: this.detailFeedback };
  }
  modelContext(): ModelListContext {
    const { state, resources, modelNames } = this.project;
    return { source: { kind: 'ready', projectId: this.project.projectId ?? fixtureIds.project, sceneId: this.sceneId, token: state.token,
      items: Object.values(resources.assets).map(asset => {
        const edges = Object.values(state.assetMemberships).filter(e => e.resourceId === asset.id && e.sceneId === this.sceneId &&
          (e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'deleted'));
        const edge = edges[0];
        const membership: Field<ModelMembership> = edges.length > 1 || edge?.lifecycle.kind === 'unresolved' ? unknown() : edge
          ? value({ kind: 'included', membershipId: edge.id, sceneId: edge.sceneId, assetId: edge.resourceId, orderKey: edge.orderKey })
          : value({ kind: 'absent' });
        return { id: asset.id, name: modelNames[asset.id] === undefined ? unknown<string>() : value(modelNames[asset.id]!),
          lifecycle: asset.lifecycle.kind === 'value' ? value(asset.lifecycle.value.state) : unknown<'active' | 'deleted'>(),
          membership, display: value(!edge ? 'outsideScene' as const : membership.kind === 'value' &&
            asset.lifecycle.kind === 'value' && asset.lifecycle.value.state === 'active' && asset.projection.kind === 'value' &&
            this.viewportState.ready && this.viewportState.assetIds.includes(asset.id)
            ? this.hiddenAssetIds.includes(asset.id) ? 'temporarilyHidden' as const : 'visible' as const : 'unavailable' as const),
          displayReason: !edge || (this.viewportState.ready && this.viewportState.assetIds.includes(asset.id)) ? null :
            asset.projection.kind !== 'value' || edges.length > 1 ? 'モデルの更新・所属の候補を確認してください。' :
              this.viewportState.issue ?? 'シーンに含まれています。3D表示を確認してください。' };
      }) }, memory: this.models.get(this.sceneId)!, pending: this.workingBlock ? 'update' : this.textPending === 'composition' ? 'composition' :
        this.assetDeletion || this.replacement ? 'text' : this.windowDragging ? 'window' : this.viewportDragging ? 'camera' : this.placement ? 'modelTransform' :
          this.pinInput ? 'pinMove' : this.views.pending, mutationBlock: this.workingBlock ?? this.membershipRestriction, feedback: this.modelFeedback };
  }
  get hiddenAssetIds() { return this.models.get(this.sceneId)!.hiddenAssetIds; }
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
      issue: this.workingBlock ?? (this.assetDeletion ? '削除の確認を終えてください。' : this.windowDragging ? 'ウィンドウの移動を終えてください。' : this.viewportDragging ? 'カメラ操作を終えてください。' : this.placement ? 'モデルの配置を確定するか、取り消してください。' : this.pinInput ? 'ピンの操作を確定するか、取り消してください。' : this.textPending === 'composition'
        ? '文字の入力を確定してください。' : !asset ? '一覧からモデルを選択してください。' :
          asset.lifecycle.kind !== 'value' || asset.lifecycle.value.state !== 'active' || !projection ? 'モデルの更新状態を確認してください。' : null) };
  }
  acceptModelUpdate(plan: ModelUpdatePlan): boolean {
    try {
      if (this.modelUpdateRestriction) throw Error(this.modelUpdateRestriction);
      const context = this.modelUpdateContext(); let version = modelVersion(plan.assetId, plan.bindingId, this.modelVersions);
      if (context.issue || plan.token !== context.token || plan.sceneId !== context.sceneId || plan.assetId !== context.assetId ||
        !version || !context.choices.includes(version)) throw new Error(context.issue ?? '対象が更新されています。モデルを選び直してください。');
      const fixture = readFixtureModel(canonicalFixture(version.closure));
      if (context.current && (this.authority?.capabilities?.preparedRevision ||
        canonicalFixture(context.current.closure.binding.assetToProject) !== canonicalFixture(version.closure.binding.assetToProject))) {
        version = versionFromClosure(createFixtureModel({ ...fixtureModelIds(fixture), binding: fresh('bnd') }, fixture.shape,
          context.current.closure.binding.assetToProject, context.current.projection.bindingId));
      }
      const selected = version;
      return this.applyWorking(() => this.publishModelVersion(plan.token, selected), () => {
        this.message = '合成モデルを更新しました。記録と座標は保持しています。';
      });
    } catch (error) { return this.refuse(this.errorText(error)); }
  }
  private publishModelVersion(baseToken: string, version: DisplayModelVersion) {
    const token = fresh('snapshot'), asset = this.project.resources.assets[version.assetId]!;
    const versions = this.modelVersions.some(v => v.projection.bindingId === version.projection.bindingId) ? this.modelVersions : [...this.modelVersions, version];
    const changes = { [bindingKey(asset.id)]: version.projection.bindingId,
      ...(versions === this.modelVersions ? {} : { [modelClosureKey(version.projection.bindingId)]: canonicalFixture(version.closure) }) };
    return this.writeProject(baseToken, changes, { ...this.project, modelVersions: versions,
      state: { ...this.project.state, token }, resources: { ...this.project.resources, token,
        assets: { ...this.project.resources.assets, [asset.id]: { ...asset, projection: value(version.projection) } } } });
  }
  get modelPlacement() { return this.placement; }
  get modelTransformAvailable() { return !!this.authority?.capabilities?.transform; }
  get modelPlacementBusy() { return this.viewportDragging || !!this.workingBlock; }
  modelPlacementProposal(): GizmoProposal<ModelPlacementTarget> | undefined {
    const draft = this.placement, active = draft && this.project.resources.assets[draft.assetId]?.projection;
    if (!draft || this.hiddenAssetIds.includes(draft.assetId) || draft.token !== this.project.state.token || draft.sceneId !== this.sceneId || active?.kind !== 'value' ||
      active.value.bindingId !== draft.source.binding.id || !draft.coordinates.every(finiteInput) ||
      !draft.angles.every(finiteInput) || !finiteInput(draft.scale) || Number(draft.scale) <= 0) return;
    return { target: { kind: 'model', token: draft.token, sceneId: draft.sceneId, assetId: draft.assetId, bindingId: draft.source.binding.id },
      position: draft.coordinates.map(n => Number(n) || 0) as [number, number, number],
      ...(this.modelTransformAvailable ? { manipulation: { mode: draft.mode, rotationXYZW: draft.rotation, uniformScale: Number(draft.scale) } } : {}),
      enabled: !this.placementRestriction && !this.workingBlock && !draft.composing };
  }
  acceptModelPosition(target: ModelPlacementTarget, position: readonly [number, number, number], manipulation?: ModelManipulation): boolean {
    const current = this.modelPlacementProposal();
    if (!current?.enabled || JSON.stringify(target) !== JSON.stringify(current.target) || !position.every(Number.isFinite))
      return this.refuse('モデルが更新されています。指定した位置は保持しています。');
    if (manipulation) {
      if (!this.modelTransformAvailable || manipulation.mode !== this.placement!.mode || !Number.isFinite(manipulation.uniformScale) || manipulation.uniformScale <= 0) return false;
      try {
        const { prepared: _prepared, preparedBindingId: _preparedId, ...draft } = this.placement!;
        if (!isCanonicalRotation(manipulation.rotationXYZW)) return false;
        const rotation = manipulation.rotationXYZW;
        this.placement = freezeSynthetic({ ...draft, rotation, angles: rotationDegrees(rotation), scale: String(manipulation.uniformScale) });
      } catch { return false; }
    }
    return this.changeModelPlacement(position.map(n => String(n || 0)) as [string, string, string]);
  }
  beginModelPlacement(): boolean {
    if (this.placementRestriction) return this.refuse(this.placementRestriction);
    const ctx = this.modelUpdateContext();
    if (this.pending || ctx.issue || !ctx.current || !ctx.assetId) return this.refuse(ctx.issue ?? '入力を確定し、モデルを選択してください。');
    const resolved = resolveScene(this.project.state, this.project.resources, this.sceneId);
    if (resolved.kind !== 'ready' || this.hiddenAssetIds.includes(ctx.assetId) || !resolved.composition.assets.some(a => a.assetId === ctx.assetId)) return this.refuse('このシーンに表示したモデルを選択してください。');
    if (ctx.current.closure.shape === 'saved-glb' && !this.authority?.transformModel) return this.refuse('実モデルの配置編集はこの画面では未接続です。');
    const source = ctx.current.closure.shape === 'saved-glb' ? ctx.current.closure : readFixtureModel(canonicalFixture(ctx.current.closure));
    this.placement = freezeSynthetic({ token: ctx.token, sceneId: this.sceneId, assetId: ctx.assetId, source,
      coordinates: ctx.current.closure.binding.assetToProject.translation.map(String) as [string, string, string], composing: false,
      angles: rotationDegrees(ctx.current.closure.binding.assetToProject.rotationXYZW), rotation: ctx.current.closure.binding.assetToProject.rotationXYZW,
      scale: String(ctx.current.closure.binding.assetToProject.uniformScale), mode: 'translate' });
    this.message = ''; return true;
  }
  changeModelPlacement(coordinates: readonly [string, string, string], composing = false): boolean {
    if (this.workingBlock) return this.refuse(this.workingBlock);
    if (!this.placement) return false;
    const { prepared: _prepared, preparedBindingId: _preparedId, ...old } = this.placement;
    this.placement = freezeSynthetic({ ...old, coordinates: [...coordinates] as [string, string, string], composing }); return true;
  }
  changeModelTransform(angles: readonly [string, string, string], scale: string, composing = false): boolean {
    if (!this.modelTransformAvailable || !this.placement) return false;
    const finishingLocalComposition = this.placement.composing && !composing && !this.placement.prepared && !this.placement.preparedBindingId;
    if ((this.workingBlock || this.placementRestriction) && !finishingLocalComposition) return false;
    const { prepared: _prepared, preparedBindingId: _preparedId, ...old } = this.placement;
    let rotation = old.rotation;
    if (angles.some((v, i) => v !== old.angles[i])) {
      try { rotation = degreesRotation(angles); } catch { /* Retain invalid numeric input; proposal/confirmation refuses. */ }
    }
    this.placement = freezeSynthetic({ ...old, angles: [...angles] as [string, string, string], rotation, scale, composing }); return true;
  }
  setModelTransformMode(mode: ModelTransformMode): boolean {
    if (!this.modelTransformAvailable || !this.placement || this.placement.composing || this.modelPlacementBusy || this.placementRestriction ||
      !['translate', 'rotate', 'scale'].includes(mode)) return false;
    this.placement = freezeSynthetic({ ...this.placement, mode }); return true;
  }
  finishModelPlacement(cancel = false): boolean {
    try {
      if (this.workingBlock) throw new Error(this.workingBlock);
      if (this.viewportDragging) throw new Error('移動操作を終えてから確定してください。');
      const draft = this.placement; if (!draft || draft.composing) throw new Error('入力を確定してください。');
      if (cancel) { this.placement = null; this.message = ''; return true; }
      if (this.placementRestriction) throw new Error(this.placementRestriction);
      const active = this.project.resources.assets[draft.assetId]?.projection;
      if (draft.token !== this.project.state.token || draft.sceneId !== this.sceneId || active?.kind !== 'value' || active.value.bindingId !== draft.source.binding.id)
        throw new Error('モデルが更新されています。指定した位置は保持しています。');
      if (draft.coordinates.some(raw => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) || !Number.isFinite(Number(raw))))
        throw new Error('X・Y・Zを有限の数値で指定してください。');
      if (!draft.angles.every(finiteInput) || !finiteInput(draft.scale) || Number(draft.scale) <= 0)
        throw new Error('回転角は有限の数値、倍率は0より大きい数値で指定してください。');
      const position = draft.coordinates.map(raw => Number(raw) || 0) as [number, number, number];
      const placement = { translation: position, rotationXYZW: draft.rotation, uniformScale: Number(draft.scale) };
      if (canonicalFixture(placement) === canonicalFixture(draft.source.binding.assetToProject)) { this.placement = null; this.message = '配置は変更されていません。'; return true; }
      if (draft.source.shape === 'saved-glb') {
        if (!this.modelTransformAvailable || !this.authority?.transformModel) throw Error('実モデルの配置編集はこの画面では未接続です。');
        const bindingId = draft.preparedBindingId ?? fresh('bnd');
        this.placement = freezeSynthetic({ ...draft, preparedBindingId: bindingId });
        return this.applyWorking(() => afterWorking(this.authority!.transformModel!(draft.token, { sceneId: draft.sceneId,
          assetId: draft.assetId, expectedBindingId: draft.source.binding.id, bindingId, placement }), next => {
          const saved = next.resources.assets[draft.assetId]?.projection;
          if (saved?.kind !== 'value' || saved.value.bindingId !== bindingId) throw Error('モデルの配置の保存を確認できません。入力を保持しています。');
          this.publish(next);
        }), () => {
          const saved = this.project.resources.assets[draft.assetId]?.projection;
          if (saved?.kind !== 'value' || saved.value.bindingId !== bindingId) throw Error('モデルの配置の保存を確認できません。入力を保持しています。');
          this.placement = null; this.message = 'モデルの配置を適用しました。';
        });
      }
      const prepared = draft.prepared ?? (this.modelTransformAvailable
        ? createFixtureModel({ ...fixtureModelIds(draft.source), binding: fresh('bnd') }, draft.source.shape, placement, draft.source.binding.id)
        : moveFixtureModel(draft.source, fresh('bnd'), position));
      this.placement = freezeSynthetic({ ...draft, prepared });
      return this.applyWorking(() => this.publishModelVersion(draft.token, versionFromClosure(prepared)), () => {
        this.placement = null; this.message = `モデルの配置を適用しました。${this.savedDevelopment ? '' : '保存は未接続です。'}`;
      });
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
      const hidden = this.hiddenAssetIds.includes(asset.id);
      return { assetId: asset.id, name: value(modelNames[asset.id] ?? 'モデル'),
        token: JSON.stringify([asset.projection, asset.lifecycle, item.membership, hidden]),
        addBlock: !present || hidden ? '追加先モデルをこのシーンに表示してください。' : asset.projection.kind !== 'value' ||
          !modelVersion(asset.id, asset.projection.value.bindingId, this.modelVersions) ? 'モデルの状態を確認してください。' : null,
        moveBlock: !present || hidden ? '所有モデルをこのシーンに表示してください。' : asset.projection.kind !== 'value'
          ? 'モデルの更新候補を確認してください。' : null };
    });
    const selected = caption ? { captionId: caption.id, title: caption.title,
      assetId: anchor?.kind === 'asset' ? value(anchor.assetId) : unknown<string>(),
      token: JSON.stringify([caption.anchor, caption.lifecycle]),
      sceneCount: source.kind === 'ready' ? source.sceneCount : unknown<number>(),
      reparentBlock: this.authority && !this.authority.reparentPin ? 'この編集経路では親モデルを変更できません。' :
        !anchor || caption.lifecycle.kind !== 'value' || caption.lifecycle.value.state !== 'active' || source.kind !== 'ready'
          ? 'ピンの状態を確認してください。競合がある場合は先に解消してください。' : null,
      block: !anchor ? 'ピン位置の競合を確認してください。' : anchor.kind !== 'asset' ? 'この接続版ではモデルに付いたピンだけ移動できます。' : null } : null;
    const correction = this.pinInput ? this.preparePinAnchor() : null;
    return { source: { kind: 'ready', token: state.token, sceneId: this.sceneId, models, selected },
      memory: this.pins.get(this.sceneId)!, otherPending: this.workingBlock ? 'update' : this.windowDragging ? 'window' : this.viewportDragging ? 'camera' : this.placement ? 'modelTransform' : this.textPending, mutationBlock: this.workingBlock ?? this.pinRestriction,
      proposal: this.pinProposal, proposalIssue: correction?.issue ?? null, feedback: this.pinFeedback };
  }
  pinCoordinateContext() {
    const mode = this.pins.get(this.sceneId)!.mode;
    const asset = mode ? this.project.resources.assets[mode.target.assetId] : undefined;
    const version = asset?.projection.kind === 'value' ? modelVersion(asset.id, asset.projection.value.bindingId, this.modelVersions) : undefined;
    const caption = mode?.caption ? this.project.resources.captions[mode.caption.captionId] : undefined;
    const anchor = caption?.anchor.kind === 'value' && caption.anchor.value.kind === 'asset' ? caption.anchor.value : null;
    const needsFamily = mode?.kind === 'reparent' || !anchor || !version?.projection.anchorCompatibilityIds.includes(anchor.authoredAnchorCompatibilityId);
    return { mode, input: this.pinInput, families: version?.families ?? [], needsFamily };
  }
  pinSurfaceTarget(ignorePending = false, duringGizmo = false): PinSurfaceTarget | null {
    if (this.pinRestriction) return null;
    if (!ignorePending && (this.workingBlock || this.textPending || this.pinInputComposing || (!duringGizmo && this.viewportDragging) || this.windowDragging)) return null;
    const context = this.pinContext(), mode = context.memory.mode;
    if (!mode || context.source.kind !== 'ready') return null;
    if (mode.kind === 'reparent' && mode.sourceToken !== context.source.token) return null;
    const target = context.source.models.find(m => m.assetId === mode.target.assetId);
    if (!target || target.token !== mode.target.token || (mode.kind === 'move' ? target.moveBlock : target.addBlock)) return null;
    return this.surfaceTarget(target.assetId);
  }
  pinShortcutTarget(): PinSurfaceTarget | null {
    if (this.pinRestriction) return null;
    const context = this.pinContext();
    return !context.memory.mode && !pinActionIssue(context, 'add') && context.memory.addTargetId
      ? this.surfaceTarget(context.memory.addTargetId) : null;
  }
  /** Exact eligible models for a user-selected visible surface; no chosen owner yet. */
  pinCreationTargets(): readonly PinSurfaceTarget[] {
    if (this.pinRestriction) return [];
    const context = this.pinContext();
    if (context.source.kind !== 'ready' || context.memory.mode || this.workingBlock || context.otherPending ||
      this.pinInputComposing) return [];
    return context.source.models.filter(model => model.token && model.addBlock === null)
      .flatMap(model => { const target = this.surfaceTarget(model.assetId); return target ? [target] : []; });
  }
  acceptPinCreation(target: PinSurfaceTarget, position: readonly [number, number, number]): boolean {
    if (!position.every(Number.isFinite) || !this.pinCreationTargets().some(t => JSON.stringify(t) === JSON.stringify(target)))
      return this.refuse('表示が変わっています。面を選び直してください。');
    return this.acceptPin(planPinMode(this.pinContext(), { kind: 'target', assetId: target.assetId })) &&
      this.acceptPin(planPinMode(this.pinContext(), { kind: 'add' })) && this.acceptPinSurface(target, position);
  }
  acceptPinShortcut(target: PinSurfaceTarget, position: readonly [number, number, number]): boolean {
    if (!position.every(Number.isFinite) || JSON.stringify(target) !== JSON.stringify(this.pinShortcutTarget())) return false;
    return this.acceptPin(planPinMode(this.pinContext(), { kind: 'add' })) && this.acceptPinSurface(target, position);
  }
  private surfaceTarget(assetId: string): PinSurfaceTarget | null {
    const asset = this.project.resources.assets[assetId], projection = asset?.projection;
    const version = projection?.kind === 'value' ? modelVersion(asset!.id, projection.value.bindingId, this.modelVersions) : undefined;
    if (!version || version.families.length !== 1) return null;
    const family = version.families[0]!;
    return { token: this.project.state.token, sceneId: this.sceneId, assetId: version.assetId, assetFrameId: version.projection.assetFrameId,
      bindingId: version.projection.bindingId, revisionId: version.projection.revisionId,
      representationId: version.closure.representation.id, familyId: family.id, compatibilityId: family.compatibilityId };
  }
  get pinPreviewAnchor() {
    if (!this.pinSurfaceTarget(true)) return null;
    return this.preparePinAnchor().anchor ?? null;
  }
  acceptPinSurface(target: PinSurfaceTarget, position: readonly [number, number, number], duringGizmo = false): boolean {
    if (JSON.stringify(target) !== JSON.stringify(this.pinSurfaceTarget(false, duringGizmo)) || !position.every(Number.isFinite))
      return this.refuse('表示が変わっています。指定中の位置は保持しています。');
    const accepted = this.changePinCoordinates({ coordinates: position.map(n => String(n || 0)) as [string, string, string], familyId: target.familyId });
    if (accepted) this.message = '仮の位置を表示しています。位置を確認して確定してください。';
    return accepted;
  }
  private preparePinAnchor(): { anchor?: Anchor; issue: string | null } {
    try {
      const { mode, input, families, needsFamily } = this.pinCoordinateContext();
      if (!mode || !input) throw new Error('ピンの操作を開始してください。');
      if (mode.kind === 'reparent' && mode.sourceToken !== this.project.state.token) throw Error('対象が更新されています。取り消して選び直してください。');
      const old = mode.caption ? this.project.resources.captions[mode.caption.captionId]?.anchor : undefined;
      const asset = this.project.resources.assets[mode.target.assetId]!, projection = asset.projection;
      if (projection.kind !== 'value' || (mode.kind === 'move' && (old?.kind !== 'value' || old.value.kind !== 'asset' ||
        old.value.assetId !== asset.id || old.value.assetFrameId !== projection.value.assetFrameId))) throw new Error('ピンのモデルを確認してください。');
      const family = input.familyId ? families.find(f => f.id === input.familyId) : undefined;
      if (needsFamily && !family) throw new Error('ピンを置く表面を選択してください。');
      if (input.coordinates.some(raw => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) || !Number.isFinite(Number(raw))))
        throw new Error('X・Y・Zを有限の数値で指定してください。');
      const positionAsset = input.coordinates.map(raw => Number(raw) || 0);
      const anchor = decodeSyntheticAnchor(JSON.stringify({ kind: 'asset', assetId: asset.id, assetFrameId: projection.value.assetFrameId,
        positionAsset, authoredAssetRevisionId: projection.value.revisionId,
        authoredAnchorCompatibilityId: needsFamily ? family!.compatibilityId : old?.kind === 'value' && old.value.kind === 'asset' ? old.value.authoredAnchorCompatibilityId : undefined,
        hitEvidence: { method: 'manual' } }), { assetId: asset.id, assetFrameId: projection.value.assetFrameId }, this.modelVersions);
      return { anchor, issue: null };
    } catch (error) { return { issue: this.errorText(error) }; }
  }
  changePinCoordinates(input: SyntheticPinInput): boolean {
    if (this.workingBlock) return this.refuse(this.workingBlock);
    const mode = this.pins.get(this.sceneId)!.mode;
    if (!mode || !this.pinInput) return false;
    this.pinInput = freezeSynthetic({ coordinates: [...input.coordinates] as [string, string, string], familyId: input.familyId });
    this.pinProposal = this.preparePinAnchor().issue ? null : Object.freeze({ token: fresh('proposal'), mode });
    this.pinFeedback = { kind: 'idle' }; return true;
  }
  acceptPin(plan: PinModePlan): boolean {
    if (this.pinRestriction && !(plan.kind === 'change' && plan.intent === 'cancel')) return this.refuse(this.pinRestriction);
    const failed = (error: unknown) => { this.pinFeedback = { kind: 'failed', message: this.errorText(error) }; this.refuse(this.errorText(error)); };
    try {
      if (this.workingBlock) throw new Error(this.workingBlock);
      if (plan.kind === 'blocked') throw new Error(plan.reason);
      if (!pinModePlanIsCurrent(plan, this.pinContext())) throw new Error('対象が更新されています。指定中の位置は保持しています。');
      if ((plan.kind === 'finish' && plan.mode.kind === 'reparent' || plan.kind === 'change' && plan.intent === 'reparent') &&
        this.authority && this.authority.read().state.token !== plan.token)
        throw Error('対象が更新されています。取り消して選び直してください。');
      if (plan.kind === 'change') {
        this.pins.set(this.sceneId, plan.memory);
        if (plan.intent === 'cancel') { this.pinInput = null; this.pinProposal = null; this.pinInputComposing = false; this.pinAddColor = null; }
        else if (plan.intent === 'add' || plan.intent === 'beginAdd') {
          if (plan.intent === 'beginAdd' || !plan.baseMemory.choosingSurface) this.pinAddColor = plan.baseMemory.addColor;
          this.pinInput = { coordinates: ['', '', ''], familyId: null }; this.pinProposal = null;
        }
        else if (plan.intent === 'move') {
          this.pinAddColor = null;
          const caption = this.project.resources.captions[plan.memory.mode!.caption!.captionId]!;
          if (caption.anchor.kind !== 'value' || caption.anchor.value.kind !== 'asset') throw new Error('ピンを確認してください。');
          this.pinInput = { coordinates: caption.anchor.value.positionAsset.map(String) as [string, string, string], familyId: null };
          this.changePinCoordinates(this.pinInput);
        }
        else if (plan.intent === 'reparent') {
          const mode = plan.memory.mode!;
          const position = pinPositionInParent(this.project, mode.caption!.captionId, mode.target.assetId);
          this.pinAddColor = null; this.pinProposal = null;
          this.pinInput = { coordinates: position ? position.map(String) as [string, string, string] : ['', '', ''], familyId: null };
          const families = this.pinCoordinateContext().families;
          this.changePinCoordinates({ ...this.pinInput, familyId: families.length === 1 ? families[0]!.id : null });
          this.message = position ? '現在の位置を保った仮表示です。確認して確定してください。' :
            '元の位置を確認できません。変更先モデルの面を選択して位置を指定してください。';
        }
      } else {
        const correction = this.preparePinAnchor();
        if (correction.issue || !correction.anchor) throw new Error(correction.issue ?? '位置を確認してください。');
        const adding = plan.mode.kind === 'add', captionId = adding ? fresh('cap') : plan.mode.caption!.captionId;
        const token = fresh('snapshot'), eventId = fresh('evt'), owner = correction.anchor;
        if (owner.kind !== 'asset') throw new Error('ピンのモデルを確認してください。');
        const caption = adding ? { id: captionId, lifecycle: value({ state: 'active' as const, eventId, reason: 'initial' as const }),
          title: value(''), body: value(''), anchor: value(owner) } : this.project.resources.captions[captionId]!;
        const changes: Record<string, string> = { [captionKey(captionId, 'anchor')]: JSON.stringify(owner) };
        let local: SyntheticProject = {
          ...this.project, state: { ...this.project.state, token }, resources: { ...this.project.resources, token,
            captions: { ...this.project.resources.captions, [captionId]: { ...caption, anchor: value(owner) } } } };
        if (adding) {
          const color = this.pinAddColor; if (!color || !/^#[0-9a-f]{6}$/.test(color)) throw Error('追加色を確認してください。');
          const membershipId = fresh('scm'), edge = { id: membershipId, sceneId: this.sceneId, resourceId: captionId,
            lifecycle: caption.lifecycle, orderKey: value('Z') };
          Object.assign(changes, { [captionKey(captionId, 'identity')]: JSON.stringify({ assetId: owner.assetId, assetFrameId: owner.assetFrameId, eventId }),
            [captionKey(captionId, 'title')]: '', [captionKey(captionId, 'body')]: '', [captionKey(captionId, 'color')]: color,
            [membershipKey(membershipId)]: JSON.stringify(edge) });
          local = { ...local, state: { ...local.state, captionMemberships: { ...local.state.captionMemberships, [membershipId]: edge } },
            colors: { ...local.colors, [captionId]: value(color) }, captionTemplates: { ...local.captionTemplates, [captionId]: captionId },
            captionOwners: { ...local.captionOwners, [captionId]: { assetId: owner.assetId, assetFrameId: owner.assetFrameId } } };
        }
        return this.applyWorking(() => plan.mode.kind === 'reparent' && this.authority
          ? afterWorking(this.authority.reparentPin!(plan.token, { kind: 'reparentPin', sceneId: this.sceneId, captionId, anchor: owner }), next => this.publish(next))
          : this.writeProject(plan.token, changes, plan.mode.kind === 'reparent' ? { ...local,
            captionOwners: { ...local.captionOwners, [captionId]: { assetId: owner.assetId, assetFrameId: owner.assetFrameId } } } : local), () => {
          this.pins.set(this.sceneId, { ...this.pins.get(this.sceneId)!, mode: null }); this.pinInput = null; this.pinProposal = null; this.pinAddColor = null;
          this.pinFeedback = { kind: 'idle' };
          if (adding && !this.acceptList(planCaptionList(this.captionContext(), { kind: 'select', captionId })))
            throw new Error('追加済みです。一覧からキャプションを選択してください。');
          const list = captionListView(this.captionContext().source, this.memory);
          const filtered = adding && (!list.selectionVisible || list.rows.find(r => r.item.id === captionId)?.colorHidden);
          this.message = `${adding ? 'キャプションを追加しました。' : 'ピン座標を適用しました。'}${filtered ? '絞り込みで一覧またはピンが非表示です。' : ''}${this.savedDevelopment ? '' : '保存は未接続です。'}`;
        }, failed);
      }
      this.pinFeedback = { kind: 'idle' }; return true;
    } catch (error) { failed(error); return false; }
  }
  acceptNavigation(plan: NavigationPlan): boolean {
    if (this.workingBlock) return this.refuse(this.workingBlock);
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
      if (plan.intent === 'select') {
        this.detailFeedback = { kind: 'idle' };
        this.acceptWindow(planCaptionWindow(this.captionContext().source, this.windowMemory, this.memory.selectedCaptionId,
          { kind: 'open', captionId: this.memory.selectedCaptionId! }));
      }
    } else if (plan.kind === 'unchanged' && plan.explicitSelection) {
      return this.acceptWindow(planCaptionWindow(this.captionContext().source, this.windowMemory, this.memory.selectedCaptionId,
        { kind: 'open', captionId: plan.explicitSelection.captionId }));
    } else if (plan.kind === 'effect') {
      if (plan.action === 'review') {
        if (plan.captionId !== this.memory.selectedCaptionId && !this.acceptList(planCaptionList(this.captionContext(),
          { kind: 'select', captionId: plan.captionId }))) return false;
        return this.acceptPin(planPinMode(this.pinContext(), { kind: 'move' }));
      }
      if (!plan.assetId) return this.refuse('対象のモデルを確認してください。');
      const context = this.modelContext();
      const item = context.source.kind === 'ready' ? context.source.items.find(item => item.id === plan.assetId) : undefined;
      return this.acceptModel(planModelList(context, item?.membership.kind === 'value' && item.membership.value.kind === 'included'
        ? { kind: 'visibility', action: 'show', assetId: plan.assetId } : { kind: 'membership', assetId: plan.assetId, included: true }));
    }
    this.message = ''; return true;
  }
  acceptDetail(event: CaptionDetailEvent): boolean {
    if (this.workingBlock) return this.refuse(this.workingBlock);
    const context = this.detailContext();
    if (event.kind === 'window') {
      if (context.source.kind !== 'ready' || event.token !== context.source.token || event.sceneId !== this.sceneId ||
        event.captionId !== this.memory.selectedCaptionId) return this.refuse('キャプションを選び直してください。');
      return this.acceptWindow(planCaptionWindow(this.captionContext().source, this.windowMemory, this.memory.selectedCaptionId,
        { kind: event.action, captionId: event.captionId }));
    }
    if (event.kind === 'draft') {
      if (context.draft !== event.baseDraft) return this.refuse('入力の状態が変わっています。');
      this.drafts.set(event.draft.captionId, event.draft); this.message = ''; return true;
    }
    if (event.kind === 'cancel') {
      if (context.draft !== event.draft || event.draft.composing || context.feedback.kind === 'applying') return false;
      const clean = beginCaptionDraft(context.source);
      if (clean) this.drafts.set(clean.captionId, clean);
      else this.drafts.delete(event.draft.captionId);
      this.detailFeedback = { kind: 'idle' }; this.message = ''; return true;
    }
    if (event.kind !== 'apply') return this.refuse('この開発版では状態修復は未接続です。');
    const failed = (error: unknown) => { this.detailFeedback = { kind: 'failed', plan: event, message: this.errorText(error) }; this.refuse(this.detailFeedback.message); };
    try {
      if (!captionApplyIsCurrent(event, context)) throw new Error('状態が変わっています。入力は保持しています。');
      const token = fresh('snapshot'), old = this.project.resources.captions[event.captionId]!;
      const nextCaption = { ...old, ...(event.changes.title !== undefined ? { title: value(event.changes.title) } : {}),
        ...(event.changes.body !== undefined ? { body: value(event.changes.body) } : {}) };
      const local = { ...this.project, state: { ...this.project.state, token },
        resources: { ...this.project.resources, token, captions: { ...this.project.resources.captions, [old.id]: nextCaption } },
        colors: event.changes.color === undefined ? this.project.colors : { ...this.project.colors, [old.id]: value(event.changes.color) } };
      const changes = Object.fromEntries(Object.entries(event.changes).map(([field, text]) => [captionKey(old.id, field as 'title' | 'body' | 'color'), text!]));
      return this.applyWorking(() => this.writeProject(event.token, changes, local), () => {
        this.drafts.set(old.id, acceptCaptionApply(event, context.draft!, this.detailSource()));
        this.detailFeedback = { kind: 'idle' }; this.message = this.savedDevelopment ? '変更を適用しました。' : '変更を適用しました。このページ内だけの変更です。';
      }, failed);
    } catch (error) { failed(error); return false; }
  }
  acceptModel(plan: ModelListPlan): boolean {
    if (this.membershipRestriction && plan.kind !== 'change' && plan.kind !== 'visibility' && plan.kind !== 'unchanged') return this.refuse(this.membershipRestriction);
    if (this.workingBlock) return this.refuse(this.workingBlock);
    if (plan.kind === 'blocked') return this.refuse(plan.reason);
    if (!modelListPlanIsCurrent(plan, this.modelContext())) return this.refuse('所属状態が変わっています。選び直してください。');
    if (plan.kind === 'change' || plan.kind === 'visibility') this.models.set(this.sceneId, plan.memory);
    else if (plan.kind === 'review') return this.refuse('モデルの修復は未接続です。シーンへの追加・除外は操作できます。');
    else if (plan.kind === 'membership') {
      const failed = (error: unknown) => { this.modelFeedback = { kind: 'failed', plan, message: this.errorText(error) }; this.refuse(this.modelFeedback.message); };
      try {
        const command = plan.action === 'include'
          ? { kind: 'include' as const, sceneId: plan.sceneId, resourceKind: 'asset' as const,
            resourceId: plan.assetId, membershipId: fresh('sam'), orderKey: 'Z' }
          : { kind: 'exclude' as const, resourceKind: 'asset' as const, membershipId: plan.membershipId };
        const prepared = planSceneCommand(this.project.state, this.project.resources, command, fresh('evt'));
        const state = previewScenePlan(this.project.state, prepared, fresh('snapshot'));
        const changed = state.assetMemberships[command.membershipId]!;
        return this.applyWorking(() => this.writeProject(plan.token, { [membershipKey(changed.id)]: JSON.stringify(changed) },
          { ...this.project, state, resources: { ...this.project.resources, token: state.token } }), () => {
          if (plan.action === 'include') {
            const memory = this.models.get(plan.sceneId)!;
            this.models.set(plan.sceneId, freezeSynthetic({ ...memory, hiddenAssetIds: memory.hiddenAssetIds.filter(id => id !== plan.assetId) }));
          }
          this.modelFeedback = { kind: 'idle' }; this.message = '';
        }, failed);
      } catch (error) { failed(error); return false; }
    }
    this.message = ''; return true;
  }
  private refuse(reason: string) { this.message = reason; return false; }
  private errorText(error: unknown) { return error instanceof Error ? error.message : '適用できませんでした。'; }
}
