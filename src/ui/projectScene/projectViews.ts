import type { MetadataEdit } from '../../projectMetadata/commands';
import { editOnly, viewChoices } from './modePresentation';
import type { JsonObject } from '../../domain/values';
import { createViewControls } from './viewControls';
import { createViewAuthorControls, createViewBackgroundControls } from './viewAuthoringControls';
import { acceptEntryView, newViewMemory, savedViewChoices, viewPlanIsCurrent, type ViewContext, type ViewMemory } from './viewState';
import { acceptViewAuthor, viewAuthorPlanIsCurrent, type ViewAuthorContext, type ViewAuthorDraft, type ViewCapture } from './viewAuthoringState';
import { acceptViewBackground, solidViewBackgroundSource, viewBackgroundPlanIsCurrent, type ViewBackgroundContext, type ViewBackgroundDraft } from './viewBackgroundState';
import type { WorkspaceViewPayload } from './projectWorkspacePorts';
import { newProjectId, panelNodes, sameProjectValue, type ProjectPanelHost, type ProjectPanel } from './projectPanel';

export function createProjectViews(document: Document, host: ProjectPanelHost): ProjectPanel {
  const { make, button } = panelNodes(document), root = make('section'), review = make('section'); root.setAttribute('aria-label', '視点の作業'); review.setAttribute('aria-label', '視点の更新候補');
  const choices = new Map<string, { token: string; operationId: string }>();
  type State = { memory: ViewMemory; draft: ViewAuthorDraft | null; background: ViewBackgroundDraft | null; entryBase: string;
    cameraFeedback: ViewContext['cameraFeedback']; backgroundFeedback: ViewBackgroundContext['feedback'] };
  const states = new Map<string, State>(), captures = new WeakMap<ViewCapture, WorkspaceViewPayload>();
  let capture: ViewCapture | null = null, disposed = false;
  const state = () => { const sceneId = host.source().sceneId; if (!states.has(sceneId)) states.set(sceneId, { memory: newViewMemory(sceneId),
    draft: null, background: null, entryBase: '', cameraFeedback: { kind: 'idle' }, backgroundFeedback: { kind: 'idle' } }); return states.get(sceneId)!; };
  const context = (owner: 'entry' | 'author' | 'background' = 'entry'): ViewContext => {
    const { provider, sceneId } = host.source(), s = state(), source = host.ports.views(sceneId, s.memory.selectedViewId).source;
    const runtime = host.viewport().read().view ?? { kind: 'unavailable' as const, token: '', sceneId, projectFrameId: provider.resources.projectFrameId, reason: '3D表示を確認してください。' };
    const ownOther = owner === 'entry' ? s.draft || s.background : owner === 'author' ? s.memory.entryDraft || s.background : s.draft || s.memory.entryDraft;
    return { source, runtime, memory: s.memory, mutationBlock: host.block('views') || (ownOther || choices.size ? '現在の視点・背景の入力を完了してください。' : null),
      cameraBlock: host.block('views', false) || ((owner === 'background' ? s.draft || s.memory.entryDraft : s.background || s.draft?.composing) ? '現在の入力を確定してください。' : null),
      entryFeedback: { kind: 'idle' }, cameraFeedback: s.cameraFeedback };
  };
  const authorContext = (): ViewAuthorContext => {
    const view = context('author'), s = state(); let current: ViewAuthorContext['capture'] = { kind: 'unavailable', reason: '現在の表示を記録できません。' };
    if (view.runtime.kind === 'ready') try {
      if (!capture || capture.runtimeToken !== view.runtime.token || capture.sceneId !== view.source.sceneId) {
        const payload = host.viewport().capture();
        capture = Object.freeze({ token: newProjectId('capture'), sceneId: view.source.sceneId, projectFrameId: view.source.projectFrameId, runtimeToken: view.runtime.token });
        captures.set(capture, payload);
      }
      current = { kind: 'ready', capture };
    } catch (error) { current = { kind: 'unavailable', reason: (error as Error).message }; }
    const data = host.ports.views(view.source.sceneId, s.memory.selectedViewId);
    return { view, draft: s.draft, capture: current, versions: data.versions, deletion: data.deletion, feedback: { kind: 'idle' },
      orderBetween: (before, after) => host.ports.viewOrder(before, after) };
  };
  const backgroundContext = (): ViewBackgroundContext => {
    const view = context('background'), scope = { sceneId: view.source.sceneId, projectFrameId: view.source.projectFrameId };
    let source: ViewBackgroundContext['source'];
    try { source = solidViewBackgroundSource(scope, host.viewport().capture().background); }
    catch (error) { source = { ...scope, kind: 'unavailable', token: '', reason: (error as Error).message }; }
    return { view, source, draft: state().background, feedback: state().backgroundFeedback };
  };
  const controls = createViewControls(document, plan => {
    const current = context(), s = state();
    if (disposed || !viewPlanIsCurrent(plan, current)) return;
    try {
      if (plan.kind === 'change') {
        if (s.draft || s.background || host.block('views', false)) throw Error('現在の入力を完了してください。');
        if (plan.action === 'chooseEntry' && !s.memory.entryDraft) s.entryBase = host.ports.views(current.source.sceneId, s.memory.selectedViewId).entryVersion;
        s.memory = plan.memory;
      } else if (plan.kind === 'entry') {
        if (s.entryBase !== host.ports.views(plan.sceneId, s.memory.selectedViewId).entryVersion) throw Error('開始時の設定が更新されています。選択を保持しています。');
        host.dispatch('views', plan.sourceToken, { kind: 'setEntryView', sceneId: plan.sceneId, viewId: plan.viewId }, () => {
          s.memory = acceptEntryView(plan, s.memory, host.ports.views(plan.sceneId, s.memory.selectedViewId).source);
          if (s.memory.entryDraft) throw Error('開始時の設定を確認できません。'); host.message('開始時の視点を設定しました。');
        });
      } else if (plan.kind === 'camera') {
        if (host.block('views', false)) return;
        if (plan.action.kind === 'recall') {
          const item = current.source.kind === 'ready' ? current.source.views.find(v => v.id === plan.viewId) : undefined;
          if (!item || item.camera.kind !== 'value' || item.background.kind !== 'value') throw Error('視点を確認してください。');
          host.viewport().recall({ camera: item.camera.value as JsonObject, background: item.background.value as WorkspaceViewPayload['background'] });
        } else host.viewport().viewCamera(plan.action);
        s.cameraFeedback = { kind: 'idle' };
      } else if (plan.kind === 'review') host.message('保存した視点と開始時の設定に未解決の状態があります。更新候補を確認してください。');
      else if (plan.kind === 'blocked') host.message(plan.reason);
    } catch (error) { s.cameraFeedback = { kind: 'failed', message: (error as Error).message }; }
    host.changed();
  });
  const author = createViewAuthorControls(document, event => {
    if (disposed) return; const s = state(), current = authorContext();
    if (host.block('views', event.kind !== 'input' && event.kind !== 'cancel')) return;
    try {
    if (event.kind === 'input' && event.baseDraft === s.draft) s.draft = event.draft;
    else if (event.kind === 'cancel' && event.draft === s.draft) s.draft = null;
    else if (event.kind === 'review') host.message('保存した視点の更新候補を確認してください。');
    else if (event.kind !== 'input' && event.kind !== 'cancel' && viewAuthorPlanIsCurrent(event, current)) {
      if (event.kind === 'draft') s.draft = event.draft;
      else if (event.kind === 'apply') {
        const payload = event.capture ? captures.get(event.capture) : undefined;
        if (event.capture && !payload) { host.message('記録した表示を確認できません。入力を保持しています。'); return; }
        const viewId = event.viewId ?? newProjectId('view'), rows = savedViewChoices(current.view);
        if (event.viewId === null && rows.some(row => row.order === null)) throw Error('視点の順序に未解決の状態があります。入力を保持しています。');
        const command: MetadataEdit = event.viewId === null ? { kind: 'createView', sceneId: event.sceneId, viewId,
          projectFrameId: event.projectFrameId, name: event.name!, orderKey: host.ports.viewOrder(rows.at(-1)?.order ?? null, null),
          camera: payload!.camera, background: payload!.background, eventId: newProjectId('evt') } :
          { kind: 'editView', sceneId: event.sceneId, viewId, edits: { ...(event.name !== undefined ? { name: event.name } : {}),
            ...(payload ? { camera: payload.camera, background: payload.background } : {}) } };
        host.dispatch('views', event.sourceToken, command, () => {
          const observed = host.ports.views(event.sceneId, s.memory.selectedViewId).source;
          const item = observed.kind === 'ready' ? observed.views.find(v => v.id === viewId) : undefined;
          if (payload && (!item || item.camera.kind !== 'value' || item.background.kind !== 'value' || !sameProjectValue(item.camera.value, payload.camera) || !sameProjectValue(item.background.value, payload.background)))
            throw Error('記録した表示の適用結果を確認できません。');
          s.draft = acceptViewAuthor(event, s.draft, { plan: event, source: observed, viewId, captureToken: event.capture?.token });
          if (s.draft) throw Error('視点の適用結果を確認できません。');
          author.render(authorContext()); // Release the old draft target before selecting a newly created view.
          s.memory = { ...s.memory, selectedViewId: viewId }; host.message('保存した視点を更新しました。');
        });
      } else if (event.kind === 'delete') host.dispatch('views', event.sourceToken, { kind: 'deleteView', sceneId: event.sceneId, viewId: event.viewId, eventId: newProjectId('evt') },
        () => { s.memory = { ...s.memory, selectedViewId: null }; host.message('視点を削除しました。'); });
      else if (event.kind === 'move') {
        const rows = savedViewChoices(current.view).filter(row => row.id !== event.viewId), neighbor = rows.findIndex(row => row.id === event.neighborId), at = neighbor + (event.direction === 'later' ? 1 : 0);
        host.dispatch('views', event.sourceToken, { kind: 'editView', sceneId: event.sceneId, viewId: event.viewId,
          edits: { orderKey: host.ports.viewOrder(rows[at - 1]?.order ?? null, rows[at]?.order ?? null) } }, () => host.message('視点の順序を変更しました。'));
      }
    }
    } catch (error) { host.message((error as Error).message); }
    host.changed();
  });
  const background = createViewBackgroundControls(document, event => {
    const s = state(); if (disposed || host.block('views', false)) return;
    if (event.kind === 'draft' && event.baseDraft === s.background) s.background = event.draft;
    else if (event.kind === 'cancel' && event.draft === s.background) s.background = null;
    else if (event.kind === 'background' && viewBackgroundPlanIsCurrent(event, backgroundContext())) {
      try {
        let verified = false;
        host.viewport().background(event.background, () => {
          const observed = backgroundContext(), exact = host.viewport().capture().background;
          if (observed.view.runtime.kind !== 'ready' || acceptViewBackground(event, s.background, { plan: event, source: observed.source, background: exact }))
            throw Error('背景の適用結果を確認できません。入力を保持しています。');
          verified = true;
        });
        if (!verified) throw Error('背景の適用結果を確認できません。'); s.background = null; s.backgroundFeedback = { kind: 'idle' };
      } catch (error) { s.backgroundFeedback = { kind: 'failed', message: (error as Error).message }; }
    }
    host.changed();
  });
  function renderReview() {
    review.replaceChildren(); const { provider, sceneId } = host.source(), s = state();
    for (const group of host.ports.viewReview(sceneId)) {
      const key = `${sceneId}/${group.key}`, owned = choices.get(key), row = make('label', group.label), select = make('select'), empty = make('option', '選択してください'); empty.value = ''; select.append(empty); select.setAttribute('aria-label', group.label);
      for (const item of group.choices) { const option = make('option', item.label); option.value = item.operationId; select.append(option); }
      const block = host.block('views') || s.draft || s.background || s.memory.entryDraft;
      select.value = owned?.operationId ?? ''; select.disabled = !!block || !!owned && owned.token !== provider.token;
      select.addEventListener('change', () => { if (!select.disabled) { choices.set(key, { token: provider.token, operationId: select.value }); host.changed(); } }); row.append(select);
      const apply = button('選択を確定', () => {
        if (select.disabled || !owned?.operationId || owned.token !== host.source().provider.token) return;
        const command: MetadataEdit = group.target.kind === 'entry' ? { kind: 'resolveEntryView', sceneId, operationId: owned.operationId } :
          { kind: 'resolveViewField', sceneId, viewId: group.target.viewId, field: group.target.field, choice: { kind: 'candidate', operationId: owned.operationId } };
        host.dispatch('views', provider.token, command, () => { choices.delete(key); host.message('視点の更新候補を確定しました。'); });
      }); editOnly(row, apply); apply.disabled = select.disabled || !owned?.operationId;
      const cancel = button('選択を取り消す', () => { if (!host.block('views', false)) { choices.delete(key); host.changed(); } }); editOnly(cancel); cancel.hidden = !owned; cancel.disabled = !!host.block('views', false); review.append(row, apply, cancel, viewChoices(document, group.label, group.choices.map(item => item.label)));
    }
  }
  const cameraDetails=make('details');cameraDetails.append(make('summary','投影とカメラ'));controls.root.insertBefore(cameraDetails,controls.camera);cameraDetails.append(controls.camera);
  root.append(controls.root, author.root, background.root, review, controls.entryActions, author.actions, author.confirmation, background.actions, background.confirmation);
  return { root, render() { if (!disposed) { controls.render(context()); author.render(authorContext()); background.render(backgroundContext()); renderReview(); } },
    hasChanges: () => !!state().draft || !!state().memory.entryDraft || !!state().background || choices.size > 0,
    composing: () => !!state().draft?.composing || !!state().background?.composing,
    dispose() { disposed = true; controls.dispose(); author.dispose(); background.dispose(); root.remove(); } };
}
