import type { MetadataEdit } from '../../projectMetadata/commands';
import { chooseStartupScene, resolveScene } from '../../scene/resolve';
import { createCaptionListControls } from './captionListControls';
import { captionListPlanIsCurrent, type CaptionListContext } from './captionListState';
import { createCaptionDetailControls } from './captionDetailControls';
import { beginCaptionDraft, captionApplyIsCurrent, hasCaptionDraft, type CaptionDraft, type DetailContext } from './captionDetailState';
import type { SceneUiMemory } from './navigationState';
import { fieldValue, projectAttachments, projectCaptions, projectCaptionSceneCount } from './projectRead';
import { surfaceAnchor, type ProjectWorkspacePorts, type WorkspaceFileInteraction, type WorkspacePinProposal, type WorkspaceSurface, type Point3 } from './projectWorkspacePorts';
import { createProjectModels } from './projectModels';
import { createProjectViews } from './projectViews';
import { createProjectMaterials } from './projectMaterials';
import { createProjectMedia } from './projectMedia';
import type { ProjectTask, ProjectPanel, ProjectPanelHost, ProjectModelPanel } from './projectPanel';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const emptyMemory = (): SceneUiMemory => ({ selectedCaptionId: null, search: '', listScrollTop: 0, pinColors: null, ownerFilter: { kind: 'all' } });
const sameTarget = (a: WorkspaceSurface, b: WorkspaceSurface) => JSON.stringify(a) === JSON.stringify(b);
const colorBytes = (hex: string) => hex.slice(1).match(/../g)!.map(n => parseInt(n, 16) / 255);

/** Product composition: provider reads and typed commands; owns no storage or fixture adapter. */
export function createProjectWorkspace(document: Document, ports: ProjectWorkspacePorts) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const button = (text: string, action: () => void) => { const b = make('button', text); b.type = 'button'; b.addEventListener('click', () => { if (!b.disabled && !disposed) action(); }); return b; };
  const root = make('main'); root.className = 'lv-project-workspace';
  const header = make('header'), heading = make('h1', 'LociViewで3Dモデルと記録を編集します。');
  const status = make('p'); status.setAttribute('role', 'status'); status.className = 'lv-operation-status';
  const retry = button('更新を再試行', () => { void runRetry(); }); header.append(heading, status, retry);
  const revise = button('入力を修正する', () => { if (!busy && ports.status().kind === 'idle') { pending = null; feedback = ''; render(); } }); header.append(revise);
  const body = make('div'); body.className = 'lv-project-body';
  const stage = make('section'), canvas = make('canvas'), markers = make('div');
  stage.className = 'lv-project-stage'; canvas.setAttribute('aria-label', '3Dモデルの表示'); canvas.tabIndex = 0;
  const viewportStatus = make('p'); viewportStatus.setAttribute('role', 'status'); viewportStatus.className = 'lv-project-viewport-status';
  const retryViewport = button('3D表示を再試行', () => viewAction(() => viewport.retry()));
  markers.className = 'lv-project-markers'; stage.append(canvas, markers, viewportStatus, retryViewport);
  const sidebar = make('aside'); sidebar.setAttribute('aria-label', '作業パネル');
  const taskTabs = make('div'), captionPanel = make('section'); taskTabs.setAttribute('role', 'tablist'); taskTabs.setAttribute('aria-label', '作業');
  const panels = new Map<ProjectTask, ProjectPanel>(); let task: ProjectTask = 'captions', models: ProjectModelPanel | undefined, mediaManager: ProjectPanel | undefined;
  const sceneArea = make('section'), scenes = make('div'); sceneArea.setAttribute('aria-label', 'シーン'); sceneArea.append(make('h2', 'シーン'), scenes);
  const sceneForm = make('form'), sceneLabel = make('label', 'シーン名'), sceneName = make('input');
  sceneName.setAttribute('aria-label', 'シーン名'); sceneLabel.append(sceneName);
  const createScene = button('シーンを追加', () => {}); createScene.type = 'submit'; sceneForm.append(sceneLabel, createScene); sceneArea.append(sceneForm);
  const pinArea = make('section'), pinStatus = make('p'), coords = make('div'); pinStatus.setAttribute('role', 'status');
  pinArea.setAttribute('aria-label', 'ピンの操作');
  const addPin = button('ピンを追加', () => { if (guardInput()) { choosing = true; placingCaption = null; render(); } });
  const movePin = button('位置を調整', () => {
    if (!guardInput()) return;
    const caption = provider().resources.captions[memory().selectedCaptionId ?? ''], anchor = fieldValue(caption?.anchor);
    if (!caption || anchor?.kind !== 'asset') { choosing = true; placingCaption = caption?.id ?? null; render(); return; }
    const target = viewport.target(anchor.assetId);
    if (!target) { feedback = '配置先モデルを確認してください。'; render(); return; }
    setPin({ target, position: anchor.positionAsset, captionId: caption.id }); render();
  });
  const coordinateInputs = ['X', 'Y', 'Z'].map((axis, i) => {
    const label = make('label', axis), input = make('input'); input.type = 'number'; input.step = 'any'; input.setAttribute('aria-label', `位置 ${axis}`);
    label.append(input); coords.append(label);
    input.addEventListener('input', () => {
      if (!pin || mutationBlock()) return;
      rawPosition[i] = input.value;
      if (rawPosition.every(v => v.trim() !== '' && Number.isFinite(Number(v)))) pin = { ...pin, position: rawPosition.map(Number) as unknown as Point3 };
      render();
    });
    input.addEventListener('compositionstart', () => { composing = true; render(); });
    input.addEventListener('compositionend', () => { composing = false; render(); }); return input;
  });
  const finishPin = button('位置を確定', () => {
    if (!pin || mutationBlock() || composing || !positionValid()) return;
    const captured = pin, target = viewport.target(captured.target.assetId);
    if (!target || !sameTarget(target, captured.target)) { feedback = '表示が変わっています。面を選び直してください。'; render(); return; }
    const currentAnchor = captured.captionId ? fieldValue(provider().resources.captions[captured.captionId]?.anchor) : undefined;
    const command: MetadataEdit = captured.captionId ? { kind: currentAnchor?.kind === 'asset' && currentAnchor.assetId === captured.target.assetId ? 'movePin' : 'reparentPin', sceneId, captionId: captured.captionId, anchor: surfaceAnchor(captured) } :
      { kind: 'addPin', sceneId, captionId: id('cap'), membershipId: id('scm'), eventId: id('evt'), anchor: surfaceAnchor(captured), colorSrgb: colorBytes('#a08045') };
    void run(command, () => {
      const captionId = command.kind === 'addPin' ? command.captionId : captured.captionId!;
      pin = null; choosing = false; placingCaption = null; selectCaption(captionId); feedback = 'ピンの位置を確定しました。';
    });
  });
  const cancelPin = button('取り消す', () => { if (!mutationBlock() && !composing) { pin = null; choosing = false; placingCaption = null; render(); } });
  pinArea.append(addPin, movePin, pinStatus, coords, finishPin, cancelPin);
  const media = make('section'), mediaLabel = make('label', 'メディアを追加'), mediaInput = make('input');
  media.setAttribute('aria-label', 'メディア'); mediaInput.type = 'file'; mediaInput.accept = 'image/png'; mediaInput.setAttribute('aria-label', 'メディアを追加'); mediaLabel.append(mediaInput);
  const cancelMedia = button('選択を取り消す', () => { if (!mutationBlock()) { pickerScope = null; mediaInput.value = ''; render(); } });
  media.append(make('h2', 'メディア'), mediaLabel, cancelMedia);
  const conflicts = make('section'); conflicts.setAttribute('aria-label', '記録の競合');
  let sceneId = chooseStartupScene(ports.read().state).sceneId ?? '', disposed = false, busy = false, composing = false, feedback = '';
  let draft: CaptionDraft | null = null, pin: WorkspacePinProposal | null = null, choosing = false, placingCaption: string | null = null;
  let rawPosition = ['', '', ''], pending: { action: () => Promise<unknown>; complete: () => void } | null = null;
  let pickerScope: { token: string; sceneId: string; captionId: string } | null = null;
  let gesture: { pointerId: number; token: string; receipt: string; x: number; y: number; left: number; top: number; width: number; height: number } | null = null;
  let rendering = false;
  let viewportFeedback = '';
  const memories = new Map<string, SceneUiMemory>();
  const conflictChoices = new Map<string, { token: string; operationId: string }>();
  const provider = () => ports.read();
  const memory = () => { if (!memories.has(sceneId)) memories.set(sceneId, emptyMemory()); return memories.get(sceneId)!; };
  const draftInput = () => hasCaptionDraft(draft) || !!draft?.composing || !!pin || choosing || composing || !!pickerScope || sceneName.value.trim() !== '';
  const panelInput = () => [...panels.values()].some(p => p.hasChanges());
  const dirty = () => draftInput() || conflictChoices.size > 0 || !!pending || panelInput() || !!mediaManager?.hasChanges() || viewport.read().dragging;
  const mutationBlock = () => busy ? '変更を適用しています。' : ports.status().kind === 'failed' ? ports.status().error || '更新を再試行してください。' :
    ports.readOnly ? '閲覧中です。編集を開始してください。' : ports.otherPending() ? 'ファイルの操作を完了してください。' : pending ? '再試行するか、入力を修正してください。' : null;
  const listContext = (): CaptionListContext => ({ source: { kind: 'ready', token: provider().token, sceneId,
    captions: projectCaptions(provider(), sceneId) }, memory: memory(), pending: dirty() ? 'text' : busy ? 'update' : null, mutationBlock: mutationBlock() });
  const detailContext = (): DetailContext => {
    const item = projectCaptions(provider(), sceneId).find(c => c.id === memory().selectedCaptionId);
    return { source: item ? { kind: 'ready', token: provider().token, sceneId, caption: item, sceneCount: projectCaptionSceneCount(provider(), item.id) } :
      { kind: 'unavailable', token: provider().token, sceneId, captionId: null, reason: '記録を選択してください。' },
      draft, mutationBlock: mutationBlock() || (pin || choosing || pickerScope || conflictChoices.size || panelInput() || mediaManager?.hasChanges() ? '現在の操作を完了してください。' : null), feedback: { kind: 'idle' } };
  };
  const list = createCaptionListControls(document, plan => {
    if (disposed || busy || pending || ports.otherPending()) return;
    if (plan.kind === 'blocked') { feedback = plan.reason; render(); return; }
    if (!captionListPlanIsCurrent(plan, listContext())) return;
    if (plan.kind === 'change') { memories.set(sceneId, plan.memory); if (plan.intent === 'select') resetDraft(); }
    if (plan.kind === 'effect' && plan.action === 'review') {
      selectCaption(plan.captionId); feedback = '記録の競合・配置先・メディアの状態を確認してください。';
    }
    render();
  }, active => { composing = active; render(); });
  const detail = createCaptionDetailControls(document, event => {
    if (disposed || mutationBlock() || panelInput() || mediaManager?.hasChanges()) return;
    if (event.kind === 'draft' && event.baseDraft === draft) draft = event.draft;
    else if (event.kind === 'cancel' && event.draft === draft) resetDraft();
    else if (event.kind === 'apply' && captionApplyIsCurrent(event, detailContext())) {
      const edits = { ...(event.changes.title !== undefined ? { title: event.changes.title } : {}),
        ...(event.changes.body !== undefined ? { body: event.changes.body } : {}),
        ...(event.changes.color !== undefined ? { colorSrgb: colorBytes(event.changes.color) } : {}) };
      void run({ kind: 'editCaption', captionId: event.captionId, edits }, () => { resetDraft(); feedback = '変更を適用しました。'; });
    } else if (event.kind === 'review') feedback = '下の競合欄で残す内容を選択してください。';
    render();
  });
  captionPanel.append(list.root, pinArea, detail.root, conflicts, media); sidebar.append(sceneArea, taskTabs, captionPanel); body.append(stage, sidebar); root.append(header, body);
  let mounted = false;
  const viewport = ports.createViewport(canvas, () => { if (mounted && !rendering) render(); }, (target, position) => {
    if (!pin || mutationBlock() || !sameTarget(target, pin.target) || !position.every(Number.isFinite)) return false;
    setPin({ ...pin, position }); render(); return true;
  }, proposal => models?.propose(proposal) ?? false);
  function panelBlock(owner: ProjectTask, writes = true, allowDrag = false): string | null {
    const global = writes ? mutationBlock() : busy || pending || ports.status().kind !== 'idle' ? '現在の更新を完了してください。' : ports.otherPending() ? 'ファイルの操作を完了してください。' : null;
    if (global) return global;
    if (owner !== 'captions' && mediaManager?.hasChanges()) return 'メディアの入力・操作を完了してください。';
    if (writes && hasCaptionDraft(draft)) return 'キャプションの変更を適用するか、取り消してください。';
    if (!allowDrag && viewport.read().dragging) return 'カメラ・配置の操作を終えてください。';
    if (composing || draft?.composing || pin || choosing || pickerScope || conflictChoices.size || sceneName.value.trim() !== '') return '現在の入力・操作を完了してください。';
    if ([...panels].some(([key, panel]) => key !== owner && panel.hasChanges())) return 'ほかの作業の入力を完了するか、取り消してください。';
    return null;
  }
  const panelHost: ProjectPanelHost = { ports, source: () => ({ provider: provider(), sceneId }), viewport: () => viewport, block: panelBlock,
    changed: render, message(text) { feedback = text; render(); },
    execute(owner, token, action, complete) { const block = panelBlock(owner);
      if (block || token !== provider().token) { feedback = block ?? '対象が更新されています。入力を保持しています。'; render(); return; }
      void perform(action, complete);
    },
    dispatch(owner, token, command, complete) { this.execute(owner, token, () => ports.dispatch(token, command), complete); },
  };
  mediaManager = createProjectMedia(document, panelHost, () => memory().selectedCaptionId); media.append(mediaManager.root);
  models = createProjectModels(document, panelHost); panels.set('models', models);
  panels.set('views', createProjectViews(document, panelHost)); panels.set('materials', createProjectMaterials(document, panelHost));
  const tabButtons = new Map<ProjectTask, HTMLButtonElement>();
  for (const [key, label] of [['captions', 'キャプション'], ['models', 'モデル'], ['views', '保存した視点'], ['materials', '材質']] as const) {
    const tab = button(label, () => { if (!busy && !pending && !ports.otherPending() && !composing && !draft?.composing && !mediaManager?.composing() && ![...panels.values()].some(p => p.composing())) { task = key; render(); } });
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `lv-project-${key}`); tab.id = `lv-project-tab-${key}`; tabButtons.set(key, tab); taskTabs.append(tab);
    tab.addEventListener('keydown', event => {
      if (tab.disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const keys = [...tabButtons.keys()], at = keys.indexOf(key);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (at + (event.key === 'ArrowLeft' ? keys.length - 1 : 1)) % keys.length;
      event.preventDefault(); const button = tabButtons.get(keys[next]!)!; button.focus({ preventScroll: true }); button.click();
    });
    const panel = key === 'captions' ? captionPanel : panels.get(key)!.root; panel.id = `lv-project-${key}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
    if (key !== 'captions') sidebar.append(panel);
  }
  const interaction: WorkspaceFileInteraction = {
    get interactionPending() { return dirty(); },
    get acknowledgment(): WorkspaceFileInteraction['acknowledgment'] { return { state: busy ? 'checking' : ports.status().kind === 'failed' ? 'failed' : 'idle' }; },
    refreshHistory() { if (!hasCaptionDraft(draft) && !draft?.composing) draft = null; render(); },
  };
  function guardInput(): boolean {
    const reason = mutationBlock();
    if (reason || dirty()) { feedback = reason || '入力・操作を確定するか、取り消してください。'; render(); return false; }
    return true;
  }
  function resetDraft() { draft = null; draft = beginCaptionDraft(detailContext().source); }
  function selectCaption(captionId: string) { memories.set(sceneId, { ...memory(), selectedCaptionId: captionId }); resetDraft(); }
  function setPin(next: WorkspacePinProposal) { pin = next; choosing = false; rawPosition = next.position.map(String); }
  function positionValid() { return rawPosition.every(v => v.trim() !== '' && Number.isFinite(Number(v))); }
  async function perform(action: () => Promise<unknown>, complete: () => void) {
    busy = true; feedback = '変更を適用しています。'; pending = { action, complete };
    try { render(); await action(); if (!disposed) { complete(); pending = null; } }
    catch (error) { if (!disposed) feedback = error instanceof Error ? error.message : '変更を適用できません。入力を保持しています。'; }
    finally { busy = false; if (!disposed) render(); }
  }
  async function run(command: MetadataEdit, complete: () => void) {
    if (mutationBlock()) return;
    const token = provider().token;
    await perform(() => ports.dispatch(token, command), complete);
  }
  async function runRetry() {
    if (busy || !pending || ports.readOnly || ports.otherPending()) return;
    const work = pending;
    await perform(() => ports.status().kind === 'failed' ? ports.retry() : work.action(), work.complete);
  }
  sceneForm.addEventListener('submit', event => {
    event.preventDefault(); if (mutationBlock() || panelInput() || mediaManager?.hasChanges() || composing || hasCaptionDraft(draft) || pin || choosing || pickerScope || conflictChoices.size || !sceneName.value.trim()) return;
    const p = provider(), source = p.state.scenes[sceneId]; if (!source) return;
    const edges = Object.values(p.state.assetMemberships).filter(e => e.sceneId === sceneId && fieldValue(e.lifecycle)?.state === 'active');
    const nextScene = id('scn'), name = sceneName.value;
    const orders = Object.values(p.state.scenes).map(s => fieldValue(s.orderKey)).filter((s): s is string => typeof s === 'string').sort();
    void run({ kind: 'createScene', sceneId: nextScene, activeSceneId: sceneId, sourceSceneId: sceneId, name, orderKey: (orders.at(-1) ?? '') + 'U',
      membershipIds: edges.map(() => id('sam')), eventId: id('evt') }, () => { sceneName.value = ''; sceneId = nextScene; draft = null; feedback = 'シーンを追加しました。'; });
  });
  sceneName.addEventListener('input', () => render());
  sceneName.addEventListener('compositionstart', () => { composing = true; render(); });
  sceneName.addEventListener('compositionend', () => { composing = false; render(); });
  mediaInput.addEventListener('click', () => {
    if (guardInput() && memory().selectedCaptionId) { pickerScope = { token: provider().token, sceneId, captionId: memory().selectedCaptionId! }; render(); }
  });
  mediaInput.addEventListener('cancel', () => { if (!pending && !busy) { pickerScope = null; render(); } });
  mediaInput.addEventListener('change', () => {
    const file = mediaInput.files?.[0], scope = pickerScope;
    if (!file || !scope || mutationBlock()) return;
    if (scope.token !== provider().token || scope.sceneId !== sceneId || scope.captionId !== memory().selectedCaptionId) { feedback = '対象が変わっています。元の記録を選び直してください。'; render(); return; }
    const orders = projectAttachments(provider(), scope.captionId).map(a => a.order).sort();
    const input = { ...scope, attachmentId: id('att'), eventId: id('evt'), orderKey: (orders.at(-1) ?? '') + 'U',
      file: { name: file.name, size: file.size, arrayBuffer: file.arrayBuffer.bind(file) } };
    void perform(() => ports.addMedia(scope.token, input), () => { pickerScope = null; mediaInput.value = ''; resetDraft(); feedback = 'メディアを追加しました。'; });
  });
  canvas.addEventListener('pointerdown', event => {
    if (gesture || !event.isPrimary || event.button !== 0 || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || !choosing || mutationBlock()) { gesture = null; return; }
    const read = viewport.read(), rect = canvas.getBoundingClientRect();
    if (!read.ready || read.dragging || read.token !== provider().token || !read.pickToken) return;
    gesture = { pointerId: event.pointerId, token: read.token, receipt: read.pickToken, x: event.clientX, y: event.clientY,
      left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  canvas.addEventListener('pointercancel', () => { gesture = null; });
  canvas.addEventListener('lostpointercapture', () => { gesture = null; });
  canvas.addEventListener('pointermove', event => {
    if (gesture && (gesture.pointerId !== event.pointerId || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4)) gesture = null;
  });
  canvas.addEventListener('pointerup', event => {
    const down = gesture; gesture = null; if (!down || !event.isPrimary || event.button !== 0 || down.pointerId !== event.pointerId || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || !choosing || mutationBlock()) return;
    const read = viewport.read(), rect = canvas.getBoundingClientRect();
    if (!read.ready || read.dragging || read.token !== down.token || read.pickToken !== down.receipt || provider().token !== down.token ||
      rect.left !== down.left || rect.top !== down.top || rect.width !== down.width || rect.height !== down.height ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return;
    const hit = viewport.pick(event.clientX - rect.left, event.clientY - rect.top); if (!hit) return;
    if (hit.target.token !== provider().token || hit.target.sceneId !== sceneId || !hit.position.every(Number.isFinite)) return;
    setPin({ ...hit, captionId: placingCaption }); render();
  });
  const cameraTools = make('div'); cameraTools.className = 'lv-project-camera';
  for (const [action, label] of [['fit', '全体表示'], ['front', '正面'], ['top', '上面']] as const)
    cameraTools.append(button(label, () => viewAction(() => viewport.camera(action)))); stage.append(cameraTools);
  function viewAction(action: () => void) {
    try { action(); viewportFeedback = ''; }
    catch (error) { viewportFeedback = error instanceof Error ? error.message : '3D表示を確認してください。'; }
    render();
  }
  function render() {
    if (disposed || rendering) return; rendering = true;
    try {
      const p = provider(), blocked = mutationBlock(), selected = memory().selectedCaptionId;
      status.dataset.busy = String(busy); status.textContent = ports.status().kind === 'failed' ? ports.status().error || feedback : feedback;
      retry.hidden = !pending; retry.disabled = busy || ports.readOnly || ports.otherPending() || ports.status().retryable === false;
      revise.hidden = !pending || busy || ports.status().kind !== 'idle';
      scenes.replaceChildren();
      for (const scene of Object.values(p.state.scenes)) {
        if (fieldValue(scene.lifecycle)?.state !== 'active') continue;
        const choice = button(fieldValue(scene.name) ?? '名称を確認', () => { if (!dirty() && !busy && !ports.otherPending()) { sceneId = scene.id; draft = null; feedback = ''; render(); } });
        choice.disabled = busy || dirty() || ports.otherPending(); choice.setAttribute('aria-pressed', String(scene.id === sceneId)); scenes.append(choice);
      }
      if (!draft) draft = beginCaptionDraft(detailContext().source);
      list.render(listContext()); detail.render({ ...detailContext(), windowBlock: '追加の表示操作は既存の編集画面で利用できます。' });
      addPin.disabled = !!blocked || dirty() || !sceneId;
      movePin.disabled = !!blocked || dirty() || !selected;
      movePin.textContent = selected && fieldValue(p.resources.captions[selected]?.anchor)?.kind === 'unplaced' ? 'ピンを配置' : '位置を調整';
      coords.hidden = !pin; finishPin.hidden = !pin; cancelPin.hidden = !pin && !choosing;
      finishPin.disabled = !!blocked || composing || !positionValid(); cancelPin.disabled = !!blocked || composing;
      pinStatus.textContent = choosing ? '配置先のモデルの面を選択してください。' : pin ? '位置を確認して確定してください。' : '';
      coordinateInputs.forEach((input, i) => { input.disabled = !!blocked; if (!composing) input.value = rawPosition[i]!; });
      sceneName.disabled = !!blocked || !!pin || choosing || hasCaptionDraft(draft) || !!pickerScope || conflictChoices.size > 0 || panelInput() || !!mediaManager?.hasChanges();
      createScene.disabled = sceneName.disabled || composing || !sceneName.value.trim() || !sceneId;
      mediaInput.disabled = !!blocked || panelInput() || !!mediaManager?.hasChanges() || hasCaptionDraft(draft) || !!pin || choosing || conflictChoices.size > 0 || !selected;
      cancelMedia.hidden = !pickerScope; cancelMedia.disabled = !!blocked;
      mediaManager!.render();
      conflicts.replaceChildren();
      for (const field of ['title', 'body'] as const) {
        if (!selected || p.resources.captions[selected]?.[field].kind !== 'unresolved') continue;
        const candidates = p.inspection.candidates.fields.find(f => f.path.join('/') === `captionsById/${selected}/${field}`);
        if (!candidates?.valid) continue;
        const label = make('label', `${field === 'title' ? 'タイトル' : '本文'}に残す内容`), select = make('select'), empty = make('option', '選択してください'); empty.value = ''; select.append(empty);
        for (const candidate of candidates.candidates) if (candidate.value.kind === 'value' && typeof candidate.value.value === 'string') {
          const option = make('option', candidate.value.value || '空の内容'); option.value = candidate.operationId; select.append(option);
        }
        const key = `${selected}/${field}`, chosen = conflictChoices.get(key);
        select.value = chosen?.operationId ?? ''; select.disabled = !!blocked || draftInput();
        label.append(select); const apply = button('この内容を使う', () => {
          const choice = conflictChoices.get(key);
          if (!mutationBlock() && !draftInput() && choice?.token === provider().token && provider().token === p.token)
            void run({ kind: 'resolveCaptionText', captionId: selected, field, choice: { kind: 'candidate', operationId: choice.operationId } },
              () => { conflictChoices.delete(key); resetDraft(); feedback = '残す内容を適用しました。'; });
        });
        apply.disabled = !!blocked || draftInput() || !chosen || chosen.token !== p.token;
        select.addEventListener('change', () => { if (mutationBlock() || draftInput() || p.token !== provider().token) return;
          if (select.value) conflictChoices.set(key, { token: p.token, operationId: select.value }); else conflictChoices.delete(key); render(); });
        const cancel = button('選択を取り消す', () => { if (!mutationBlock()) { conflictChoices.delete(key); render(); } });
        cancel.hidden = !chosen; cancel.disabled = !!blocked; conflicts.append(label, apply, cancel);
      }
      body.setAttribute('aria-busy', String(busy)); body.inert = busy;
      const resolved = sceneId ? resolveScene(p.state, p.resources, sceneId) : null;
      viewport.update({ token: p.token, sceneId, selectedId: selected, pin, choosing,
        pinColors: memory().pinColors, hiddenAssetIds: models!.hidden(), model: models!.proposal(), available: resolved?.kind === 'ready', readOnly: !!blocked || resolved?.kind !== 'ready' });
      for (const [key, tab] of tabButtons) { tab.setAttribute('aria-selected', String(task === key)); tab.tabIndex = task === key ? 0 : -1;
        tab.disabled = busy || !!pending || ports.otherPending() || composing || !!draft?.composing || !!mediaManager?.composing() || [...panels.values()].some(p => p.composing()); }
      captionPanel.hidden = task !== 'captions'; for (const [key, panel] of panels) { panel.root.hidden = key !== task; if (key === task) panel.render(); }
      const seen = viewport.read();
      viewportStatus.textContent = [viewportFeedback, seen.issue, seen.notice, resolved?.kind !== 'ready' && 'シーンを選択し、表示状態を確認してください。'].filter(Boolean).join(' ');
      retryViewport.hidden = !seen.issue && !viewportFeedback; retryViewport.disabled = busy || ports.otherPending();
      markers.replaceChildren();
      for (const projected of seen.pins) if (projected.visible) {
        const caption = p.resources.captions[projected.id]; if (!caption) continue;
        const marker = button(fieldValue(caption.title) || '名称なし', () => { if (!dirty() && !busy && !ports.otherPending()) { selectCaption(projected.id); render(); } });
        marker.className = 'lv-project-marker'; marker.style.left = `${projected.x}px`; marker.style.top = `${projected.y}px`;
        marker.setAttribute('aria-pressed', String(projected.id === selected)); markers.append(marker);
      }
      ports.changed();
    } finally { rendering = false; }
  }
  mounted = true; render();
  return { root, render, session: interaction, inputPending: () => dirty() || busy,
    hasChanges: () => dirty() || busy || !!pending,
    unmount() { if (disposed) return; disposed = true; mediaManager?.dispose(); viewport.dispose(); list.dispose(); detail.dispose(); for (const panel of panels.values()) panel.dispose(); root.remove(); } };
}
