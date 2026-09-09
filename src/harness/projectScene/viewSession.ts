import { acceptEntryView, newViewMemory, savedViewChoices, viewPlanIsCurrent, type ViewContext, type ViewMemory, type ViewPlan, type ViewRuntime } from '../../ui/projectScene/viewState';
import { acceptViewAuthor, viewAuthorPlanIsCurrent, type ViewAuthorContext, type ViewAuthorDraft, type ViewCapture } from '../../ui/projectScene/viewAuthoringState';
import type { ViewAuthorEvent } from '../../ui/projectScene/viewAuthoringControls';
import { freezeSynthetic, type SyntheticProject } from './fixture';
import { canonicalFixture } from './modelClosure';
import { entryKey, orderBetween, readProjectCamera, readSolidBackground, viewKey, type ProjectCamera, type SolidBackground } from './viewHistory';
import type { WorkingWrite } from './acknowledgment';

export interface DisplayCapture { readonly camera: ProjectCamera; readonly background: SolidBackground }
const fresh = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const message = (e: unknown) => e instanceof Error ? e.message : '視点を変更できません。入力は保持しています。';

/** Working-state commands only. Payloads are retained separately from UI capture handles. */
export class SyntheticViewSession {
  private memories = new Map<string, ViewMemory>();
  private drafts = new Map<string, ViewAuthorDraft>();
  private captures = new WeakMap<ViewCapture, DisplayCapture>();
  private currentCapture: ViewCapture | null = null;
  private prepared: { draft: ViewAuthorDraft; id: string; changes: Readonly<Record<string, string>> } | null = null;
  private entryBases = new Map<string, string>();
  private authorFeedback: ViewAuthorContext['feedback'] = { kind: 'idle' };
  private entryFeedback: ViewContext['entryFeedback'] = { kind: 'idle' };
  private cameraFeedback: ViewContext['cameraFeedback'] = { kind: 'idle' };
  constructor(private readonly read: () => SyntheticProject, private readonly scene: () => string,
    private readonly write: WorkingWrite, private readonly block: () => string | null = () => null) {}
  get pending(): 'composition' | 'text' | null {
    return [...this.drafts.values()].some(d => d.composing) ? 'composition' :
      this.drafts.size || [...this.memories.values()].some(m => m.entryDraft) ? 'text' : null;
  }
  private get memory() { const id = this.scene(); if (!this.memories.has(id)) this.memories.set(id, newViewMemory(id)); return this.memories.get(id)!; }
  context(runtime: ViewRuntime, block: string | null): ViewContext {
    const p = this.read();
    return { source: { kind: 'ready', token: p.state.token, sceneId: this.scene(), projectFrameId: p.resources.projectFrameId,
      views: Object.values(p.viewData?.records ?? {}), entryViewId: p.state.scenes[this.scene()]!.defaultViewId },
      memory: this.memory, runtime, mutationBlock: this.block() ?? block, cameraBlock: this.block() ?? block,
      cameraFeedback: this.cameraFeedback, entryFeedback: this.entryFeedback };
  }
  authorContext(view: ViewContext, take: (() => DisplayCapture) | undefined): ViewAuthorContext {
    let capture: ViewAuthorContext['capture'] = { kind: 'unavailable', reason: '現在の表示を記録できません。' };
    if (view.runtime.kind === 'ready' && take) {
      try {
        if (!this.currentCapture || this.currentCapture.runtimeToken !== view.runtime.token || this.currentCapture.sceneId !== this.scene()) {
          const raw = take(), payload = freezeSynthetic({ camera: readProjectCamera(raw.camera), background: readSolidBackground(raw.background) });
          this.currentCapture = Object.freeze({ token: fresh('capture'), sceneId: this.scene(), projectFrameId: view.source.projectFrameId, runtimeToken: view.runtime.token });
          this.captures.set(this.currentCapture, payload);
        }
        capture = { kind: 'ready', capture: this.currentCapture };
      } catch (e) { capture = { kind: 'unavailable', reason: message(e) }; }
    }
    const id = view.memory.selectedViewId, versions = this.read().viewData?.versions;
    const camera = id && versions?.[viewKey(id, 'camera')], background = id && versions?.[viewKey(id, 'background')];
    const used = id && Object.values(this.read().state.scenes).some(s => s.defaultViewId.kind !== 'value' || s.defaultViewId.value === id);
    return { view, draft: this.drafts.get(this.scene()) ?? null, capture,
      versions: id && camera && background ? { sourceToken: view.source.token, viewId: id, camera, background } : null,
      deletion: id ? { sourceToken: view.source.token, viewId: id, issue: used ? '開始時の視点の設定を確認してください。' : null } : null,
      feedback: this.authorFeedback };
  }
  accept(plan: ViewPlan, context: ViewContext, camera: (payload: DisplayCapture | null) => void): boolean {
    const entryAction = plan.kind === 'entry' || (plan.kind === 'change' && plan.action !== 'select') || (plan.kind === 'review' && plan.target === 'entry');
    const failed = (e: unknown) => { if (entryAction) this.entryFeedback = { kind: 'failed', message: message(e) };
      else this.cameraFeedback = { kind: 'failed', message: message(e) }; };
    try {
      if (this.block()) throw new Error(this.block()!);
      if (plan.kind === 'blocked') throw new Error(plan.reason);
      if (!viewPlanIsCurrent(plan, context)) throw new Error('視点の状態が変わっています。操作を選び直してください。');
      if (plan.kind === 'change') {
        if (plan.action === 'select' && this.drafts.has(this.scene())) throw new Error('視点の編集を適用するか、取り消してください。');
        if (plan.action === 'chooseEntry' && !this.memory.entryDraft)
          this.entryBases.set(this.scene(), this.read().viewData?.versions[entryKey(this.scene())] ?? 'initial-empty-views');
        this.memories.set(this.scene(), plan.memory);
      } else if (plan.kind === 'entry') {
        if (this.entryBases.get(this.scene()) !== (this.read().viewData?.versions[entryKey(this.scene())] ?? 'initial-empty-views'))
          throw new Error('開始時の設定が更新されています。選択を残しています。取り消して確認してください。');
        return this.write(plan.sourceToken, { [entryKey(this.scene())]: canonicalFixture(plan.viewId) }, () => {
        this.memories.set(this.scene(), acceptEntryView(plan, this.memory, this.context(context.runtime, context.mutationBlock).source));
        if (this.memory.entryDraft) throw new Error('開始時の視点を確認できません。選択を保持しています。');
        this.entryFeedback = { kind: 'idle' };
        }, failed);
      } else if (plan.kind === 'camera') {
        let payload: DisplayCapture | null = null;
        if (plan.action.kind === 'recall') {
          const item = this.read().viewData?.records[plan.viewId!];
          if (!item || item.camera.kind !== 'value' || item.background.kind !== 'value') throw new Error('視点と背景を確認してください。');
          payload = { camera: item.camera.value, background: item.background.value };
        }
        camera(payload);
      } else throw new Error('画面上部で視点の更新候補を確認してください。');
      if (entryAction) this.entryFeedback = { kind: 'idle' }; else this.cameraFeedback = { kind: 'idle' }; return true;
    } catch (e) { failed(e); return false; }
  }
  acceptAuthor(event: ViewAuthorEvent, context: ViewAuthorContext): boolean {
    const failed = (e: unknown) => { this.authorFeedback = { kind: 'failed', message: message(e) }; };
    try {
      if (this.block()) throw new Error(this.block()!);
      const draft = this.drafts.get(this.scene()) ?? null;
      if (event.kind === 'input') {
        if (event.baseDraft !== draft || event.draft.sceneId !== this.scene()) throw new Error('編集中の視点を確認してください。');
        this.drafts.set(this.scene(), event.draft); this.prepared = null;
      } else if (event.kind === 'cancel') {
        if (event.draft !== draft || draft?.composing) throw new Error('文字の入力を確定してください。');
        this.drafts.delete(this.scene()); this.prepared = null;
      } else if (event.kind === 'review') throw new Error('画面上部で視点の更新候補を確認してください。');
      else {
        if (event.kind === 'blocked') throw new Error(event.reason);
        if (!viewAuthorPlanIsCurrent(event, context)) throw new Error('視点が更新されています。入力を保持しています。');
        if (event.kind === 'draft') { this.drafts.set(this.scene(), event.draft); this.prepared = null; }
        else if (event.kind === 'apply') {
          let prepared = this.prepared;
          if (!prepared || prepared.draft !== event.draft) {
            const id = event.viewId ?? fresh('view'), changes: Record<string, string> = {};
            if (!event.viewId) {
              const choices = savedViewChoices(context.view);
              if (choices.some(c => c.order === null)) throw new Error('視点の順序を確認してください。');
              changes[viewKey(id, 'identity')] = canonicalFixture({ id, sceneId: this.scene(), projectFrameId: context.view.source.projectFrameId });
              changes[viewKey(id, 'order')] = orderBetween(choices.at(-1)?.order ?? null, null);
              changes[viewKey(id, 'lifecycle')] = canonicalFixture({ state: 'active', eventId: fresh('evt'), reason: 'initial' });
            }
            if (event.name !== undefined) changes[viewKey(id, 'name')] = event.name;
            if (event.capture) {
              const payload = this.captures.get(event.capture); if (!payload) throw new Error('記録した表示を確認してください。');
              changes[viewKey(id, 'camera')] = canonicalFixture(payload.camera); changes[viewKey(id, 'background')] = canonicalFixture(payload.background);
            }
            prepared = this.prepared = { draft: event.draft, id, changes: Object.freeze(changes) };
          }
          const command = prepared;
          return this.write(event.sourceToken, command.changes, () => {
          const p = this.read(), item = p.viewData?.records[command.id];
          if (!item || Object.entries(command.changes).some(([key, text]) => p.viewData?.cells[key]?.kind !== 'value' ||
            (p.viewData.cells[key] as { value: string }).value !== text)) throw new Error('適用結果を確認できません。入力を保持しています。');
          const remaining = acceptViewAuthor(event, draft, { plan: event, source: this.context(context.view.runtime, null).source,
            viewId: command.id, captureToken: event.capture?.token });
          if (remaining) throw new Error('適用結果を確認できません。入力を保持しています。');
          this.drafts.delete(this.scene()); this.memories.set(this.scene(), Object.freeze({ ...this.memory, selectedViewId: command.id })); this.prepared = null;
          this.authorFeedback = { kind: 'idle' };
          }, failed);
        } else if (event.kind === 'delete') {
          return this.write(event.sourceToken, { [viewKey(event.viewId, 'lifecycle')]: canonicalFixture({ state: 'deleted', eventId: fresh('evt'), reason: 'userDelete' }) }, () => {
            this.memories.set(this.scene(), Object.freeze({ ...this.memory, selectedViewId: null })); this.authorFeedback = { kind: 'idle' };
          }, failed);
        } else {
          const rows = savedViewChoices(context.view).filter(row => row.id !== event.viewId), n = rows.findIndex(row => row.id === event.neighborId);
          const at = n + (event.direction === 'later' ? 1 : 0);
          return this.write(event.sourceToken, { [viewKey(event.viewId, 'order')]: orderBetween(rows[at - 1]?.order ?? null, rows[at]?.order ?? null) },
            () => { this.authorFeedback = { kind: 'idle' }; }, failed);
        }
      }
      this.authorFeedback = { kind: 'idle' }; return true;
    } catch (e) { failed(e); return false; }
  }
}
