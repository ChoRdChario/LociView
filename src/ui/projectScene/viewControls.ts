import { entryViewIssue, planView, savedViewChoices, savedViewIssue, viewAxes, viewSourceIssue, viewRuntimeMatches,
  type ViewContext, type ViewIntent, type ViewPlan, type ViewProjection } from './viewState';

let nextViewControls = 0;
/** Reusable controls only; rendering or selecting an option never applies a camera. */
export function createViewControls(document: Document, onPlan: (plan: ViewPlan) => void) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const button = (text: string) => { const node = make('button', text); node.type = 'button'; return node; };
  const label = (text: string, control: HTMLElement) => { const node = make('label', text); control.setAttribute('aria-label', text); node.append(control); return node; };
  const message = () => { const node = make('p'); node.id = `lv-view-message-${++nextViewControls}`; return node; };
  const live = () => { const node = message(); node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); return node; };
  const root = make('section'); root.className = 'lv-view-controls'; root.setAttribute('aria-label', '視点');
  const camera = make('section'), fit = button('全体表示'), cameraStatus = live(), cameraNote = message();
  camera.setAttribute('aria-label', 'カメラ');
  const axes = make('div'); axes.className = 'lv-view-axes'; axes.setAttribute('role', 'group'); axes.setAttribute('aria-label', '座標軸から見る');
  const axisButtons = new Map(viewAxes.map(axis => [axis, button(axis.toUpperCase())]));
  axes.append(...axisButtons.values());
  const projection = make('select');
  const option = (value: string, text: string, disabled = false) => { const node = make('option', text); node.value = value; node.disabled = disabled; return node; };
  projection.append(option('', '投影方式を確認', true), option('perspective', '透視投影'), option('orthographic', '平行投影'));
  camera.append(fit, axes, label('投影方式', projection), cameraNote, cameraStatus);
  const saved = make('section'), picker = make('select'), recall = button('表示'), savedNote = message(), savedReview = button('状態を確認');
  saved.setAttribute('aria-label', '保存した視点'); saved.append(label('保存した視点', picker), recall, savedNote, savedReview);
  const entry = make('section'), entryPicker = make('select'), apply = button('設定を適用'), cancel = button('取り消す');
  const entryNote = message(), entryStatus = live(), entryReview = button('状態を確認');
  entry.setAttribute('aria-label', '開始時の設定');
  entry.append(label('シーンを開いたときの視点', entryPicker), make('p', '現在の表示は変わりません。'), apply, cancel, entryNote, entryStatus, entryReview);
  root.append(camera, saved, entry);
  // One shared host/state/intent path, even when the task tab is not visible.
  const stageTools = make('section'); stageTools.className = 'lv-view-stage-tools'; stageTools.setAttribute('aria-label', '表示の復帰');
  const quickFit = button('全体表示'), quickNote = live(); stageTools.append(quickFit, quickNote);
  for (const control of [fit, ...axisButtons.values(), projection]) control.setAttribute('aria-describedby', `${cameraNote.id} ${cameraStatus.id}`);
  recall.setAttribute('aria-describedby', savedNote.id); quickFit.setAttribute('aria-describedby', quickNote.id);
  for (const control of [entryPicker, apply]) control.setAttribute('aria-describedby', `${entryNote.id} ${entryStatus.id}`);
  let context: ViewContext | undefined, disposed = false, savedKey = '', entryKey = '';
  const cleanups: (() => void)[] = [];
  const listen = (node: HTMLElement, event: string, action: () => void) => { node.addEventListener(event, action); cleanups.push(() => node.removeEventListener(event, action)); };
  const request = (intent: ViewIntent) => {
    if (!context || disposed) return;
    const plan = planView(context, intent);
    // Until host acceptance, all controls still describe observed or retained state.
    render(context);
    if (plan.kind === 'blocked') {
      const entryAction = intent.kind === 'chooseEntry' || intent.kind === 'applyEntry' || intent.kind === 'cancelEntry' || (intent.kind === 'review' && intent.target === 'entry');
      const savedAction = intent.kind === 'select' || intent.kind === 'recall' || intent.kind === 'review';
      const status = entryAction ? entryStatus : savedAction ? savedNote : cameraStatus;
      status.textContent = plan.reason; status.hidden = false;
      if (!entryAction && !savedAction) { quickNote.textContent = plan.reason; quickNote.hidden = false; }
      return;
    }
    onPlan(plan);
  };
  listen(fit, 'click', () => { if (!fit.disabled) request({ kind: 'fit' }); });
  listen(quickFit, 'click', () => { if (!quickFit.disabled) request({ kind: 'fit' }); });
  for (const [axis, node] of axisButtons) listen(node, 'click', () => { if (!node.disabled) request({ kind: 'axis', axis }); });
  listen(projection, 'change', () => request({ kind: 'projection', projection: projection.value as ViewProjection }));
  listen(picker, 'change', () => request({ kind: 'select', viewId: picker.value || null }));
  listen(recall, 'click', () => { if (!recall.disabled) request({ kind: 'recall' }); });
  listen(entryPicker, 'change', () => request({ kind: 'chooseEntry', viewId: entryPicker.value || null }));
  listen(apply, 'click', () => { if (!apply.disabled) request({ kind: 'applyEntry' }); });
  listen(cancel, 'click', () => { if (!cancel.disabled) request({ kind: 'cancelEntry' }); });
  listen(savedReview, 'click', () => request({ kind: 'review', target: 'selected' }));
  listen(entryReview, 'click', () => request({ kind: 'review', target: 'entry' }));
  const reason = (plan: ViewPlan) => plan.kind === 'blocked' ? plan.reason : null;
  const feedback = (value: ViewContext['cameraFeedback']) => value.kind === 'failed' ? `変更できませんでした。${value.message}` : '';
  function render(next: ViewContext): boolean {
    if (disposed) return false;
    if (context && (context.memory.entryDraft || context.entryFeedback.kind === 'applying' || context.cameraFeedback.kind === 'applying') &&
      (context.memory.sceneId !== next.memory.sceneId || context.source.sceneId !== next.source.sceneId || context.source.projectFrameId !== next.source.projectFrameId)) {
      entryStatus.textContent = '開始時の設定を適用・取り消しするか、処理の完了を待ってください。'; entryStatus.hidden = false; return false;
    }
    context = next;
    const fitIssue = reason(planView(next, { kind: 'fit' })); fit.disabled = quickFit.disabled = fitIssue !== null;
    const projectionIssue = reason(planView(next, { kind: 'projection', projection: 'perspective' }));
    projection.disabled = projectionIssue !== null;
    const observedRuntime = viewRuntimeMatches(next) && next.runtime.kind === 'ready' ? next.runtime : null;
    projection.value = observedRuntime?.projection ?? '';
    for (const [axis, node] of axisButtons) {
      node.disabled = reason(planView(next, { kind: 'axis', axis })) !== null;
      node.setAttribute('aria-pressed', String(observedRuntime?.axis === axis));
    }
    cameraNote.textContent = [...new Set([fitIssue, projectionIssue].filter(Boolean))].join(' '); cameraNote.hidden = !cameraNote.textContent;
    cameraStatus.textContent = feedback(next.cameraFeedback); cameraStatus.hidden = !cameraStatus.textContent;
    quickNote.textContent = [fitIssue, feedback(next.cameraFeedback)].filter(Boolean).join(' '); quickNote.hidden = !quickNote.textContent;
    const choices = savedViewChoices(next), sourceIssue = viewSourceIssue(next);
    const savedOptions = choices.map(item => ({ value: item.id, text: item.label, disabled: false }));
    if (next.memory.selectedViewId && !savedOptions.some(item => item.value === next.memory.selectedViewId))
      savedOptions.unshift({ value: next.memory.selectedViewId, text: '選択した視点（状態を確認）', disabled: false });
    const key = JSON.stringify(savedOptions);
    if (key !== savedKey) { picker.replaceChildren(option('', '保存した視点を選択'), ...savedOptions.map(item => option(item.value, item.text))); savedKey = key; }
    picker.value = next.memory.selectedViewId ?? ''; picker.disabled = sourceIssue !== null;
    const recallIssue = reason(planView(next, { kind: 'recall' })); recall.disabled = recallIssue !== null;
    savedNote.textContent = recallIssue || ''; savedNote.hidden = !savedNote.textContent;
    savedReview.hidden = next.memory.selectedViewId === null || savedViewIssue(next, next.memory.selectedViewId) === null;
    savedReview.disabled = sourceIssue !== null;
    const observed = next.source.kind === 'ready' && next.source.entryViewId.kind === 'value' ? next.source.entryViewId : null;
    const wanted = next.memory.entryDraft ? next.memory.entryDraft.viewId ?? '' : observed ? observed.value ?? '' : '!unresolved';
    const entryOptions = choices.map(item => ({ value: item.id, text: item.label, disabled: item.issue !== null }));
    if (wanted && !entryOptions.some(item => item.value === wanted)) entryOptions.unshift({ value: wanted, text: '開始時の視点（状態を確認）', disabled: true });
    const entryFingerprint = JSON.stringify(entryOptions);
    if (entryFingerprint !== entryKey) {
      entryPicker.replaceChildren(option('', '指定なし'), ...entryOptions.map(item => option(item.value, item.text, item.disabled))); entryKey = entryFingerprint;
    }
    entryPicker.value = wanted;
    const busy = next.entryFeedback.kind === 'applying'; entryPicker.disabled = sourceIssue !== null || !observed || next.mutationBlock !== null || busy;
    const entryIssue = entryViewIssue(next);
    apply.disabled = entryIssue !== null; cancel.disabled = next.memory.entryDraft === null || busy;
    const observedIssue = !observed ? '開始時の視点の状態を確認してください。' : observed.value === null ? null : savedViewIssue(next, observed.value);
    entryNote.textContent = [sourceIssue, entryIssue !== '変更はありません。' && entryIssue,
      !next.memory.entryDraft && observedIssue, wanted === '' && '開始時に視点を変更しません。'].filter(Boolean).join(' ');
    entryNote.hidden = !entryNote.textContent;
    entryStatus.textContent = [feedback(next.entryFeedback), next.memory.entryDraft && !busy && '開始時の設定は未適用です。'].filter(Boolean).join(' ');
    entryStatus.hidden = !entryStatus.textContent;
    entryReview.hidden = !observedIssue; entryReview.disabled = sourceIssue !== null || busy;
    return true;
  }
  return { root, stageTools, render, dispose: () => { disposed = true; cleanups.forEach(cleanup => cleanup()); root.remove(); stageTools.remove(); } };
}
