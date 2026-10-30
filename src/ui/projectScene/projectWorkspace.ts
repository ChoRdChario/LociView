import type { MetadataEdit } from '../../projectMetadata/commands';
import { chooseStartupScene, resolveScene, memberships } from '../../scene/resolve';
import type { Issue } from '../../scene/types';
import { createCaptionListControls } from './captionListControls';
import { captionListPlanIsCurrent, planCaptionList, type CaptionListContext } from './captionListState';
import { createCaptionDetailControls } from './captionDetailControls';
import { createCaptionIncludeControls } from './captionIncludeControls';
import { captionIncludePlanIsCurrent, newCaptionIncludeMemory, planCaptionInclude, type CaptionIncludeMemory, type CaptionIncludeContext } from './captionIncludeState';
import { beginCaptionDraft, captionApplyIsCurrent, hasCaptionDraft, type CaptionDraft, type DetailContext } from './captionDetailState';
import { createCaptionWindowControls } from './captionWindowControls';
import { captionWindowPlanIsCurrent, newCaptionWindowMemory, planCaptionWindow, type CaptionWindowMemory, type CaptionWindowPlan } from './captionWindowState';
import { createMediaViewer } from './mediaPreview';
import type { SceneUiMemory } from './navigationState';
import { fieldValue, projectAttachments, projectCaptions, projectCaptionSceneCount, projectCaptionInventory, projectModels, projectIdentity } from './projectRead';
import { surfaceAnchor, type ProjectWorkspacePorts, type WorkspaceFileInteraction, type WorkspacePinProposal, type WorkspaceSurface, type Point3 } from './projectWorkspacePorts';
import { createProjectModels } from './projectModels';
import { createProjectViews } from './projectViews';
import { createProjectMaterials } from './projectMaterials';
import { createProjectMedia } from './projectMedia';
import { createProjectRecovery } from './projectRecovery';
import { createProjectOrganization } from './projectOrganization';
import type { WorkspaceRecoveryGroup } from './projectWorkspacePorts';
import type { ProjectTask, ProjectPanel, ProjectPanelHost, ProjectModelPanel } from './projectPanel';
import { contextHelp, mountContextHelp } from './contextHelp';
import { editOnly, displayMode } from './modePresentation';
import { createCameraGizmo } from './cameraGizmo';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const emptyMemory = (): SceneUiMemory => ({ selectedCaptionId: null, search: '', listScrollTop: 0, pinColors: null, ownerFilter: { kind: 'all' } });
const sameTarget = (a: WorkspaceSurface, b: WorkspaceSurface) => JSON.stringify(a) === JSON.stringify(b);
const colorBytes = (hex: string) => hex.slice(1).match(/../g)!.map(n => parseInt(n, 16) / 255);
type PinAction = { kind: 'add' | 'move' | 'reparent' | 'place'; token: string; sceneId: string; captionId: string | null; assetId?: string; color?: string };
type SceneEdit = { kind: 'create' | 'rename' | 'default'; token: string; sceneId: string; name: string; composing: boolean };

/** Product composition: provider reads and typed commands; owns no storage or fixture adapter. */
export function createProjectWorkspace(document: Document, ports: ProjectWorkspacePorts) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const button = (text: string, action: () => void) => { const b = make('button', text); b.type = 'button'; b.addEventListener('click', () => { if (!b.disabled && !disposed) action(); }); return b; };
  const root = make('main'); root.className = 'lv-project-workspace';
  const stopHelp = mountContextHelp(document, root);
  const header = make('header'), introduction = make('p', 'LociViewは3Dモデルと記録を編集できるアプリです。');
  const headerActions = make('div'); headerActions.className = 'lv-workspace-actions';
  const projectTitle = make('h1'), resumeStatus = make('p'), fileStatus = make('p'), help = make('details');
  projectTitle.setAttribute('aria-label', 'プロジェクト名'); resumeStatus.setAttribute('aria-label', '再開データの状態'); fileStatus.setAttribute('aria-label', '保存ファイルの状態');
  help.setAttribute('aria-label', 'ヘルプ'); help.append(make('summary', 'ヘルプ'), introduction);
  for (const [title, text] of [
    ['はじめる', 'プロジェクトを選び、変更するときは「編集する」を選択します。シーンを切り替えても「開始シーン」は変わりません。'],
    ['記録する', '「ピンを追加」でモデルの面を選択し、位置を確定します。Shiftを押しながら面を選択しても追加できます。「数値で配置」では追加先モデルとX・Y・Zを指定します。未配置のピンは、最初にモデルの面を選択してください。'],
    ['保存と共有', 'ブラウザ内の再開データは、端末のデータ削除で失われます。「ファイルに保存」でバックアップを作れます。保存先のファイルの内容確認は、ファイル欄から必要に応じて行えます。「相手に渡す」で作業一式を共有し、同じプロジェクトの変更分を受け取れます。'],
    ['困ったとき', '更新に失敗したら入力を保持したまま「更新を再試行」を選択します。競合は「状態を確認」から残す内容を選択します。3D表示だけに問題がある場合は「3D表示を再試行」を選択してください。'],
  ]) help.append(make('h3', title), make('p', text));
  const storageHelp = make('details'), storageStatus = make('p'); let storageChecking = false, storageEpoch = 0;
  storageHelp.setAttribute('aria-label', 'このサイトの保存容量'); storageStatus.setAttribute('role', 'status');
  const storageCheck = button('保存容量を確認', () => { void queryStorage(); });
  storageHelp.append(make('summary', 'このサイトの保存容量'),
    contextHelp(document, 'このサイト全体の推定値です。プロジェクト単独の容量や端末の空き容量を示すものではありません。保存できるかは実際の保存結果で確認してください。', [storageCheck]), storageCheck, storageStatus);
  help.append(storageHelp);
  async function queryStorage() {
    if (disposed || storageChecking) return;
    const epoch = ++storageEpoch; storageChecking = true; storageCheck.disabled = true; storageStatus.textContent = '保存容量を確認しています。';
    try {
      const estimate = await ports.storageEstimate?.(); if (disposed || epoch !== storageEpoch) return;
      const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
      const usage = finite(estimate?.usage), quota = finite(estimate?.quota);
      const bytes = (n: number | null) => {
        if (n === null) return '不明';
        const units = ['B', 'KB', 'MB', 'GB', 'TB']; let unit = 0;
        while (n >= 1000 && unit < units.length - 1) { n /= 1000; unit++; }
        return `${n.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} ${units[unit]}`;
      };
      storageStatus.textContent = usage === null && quota === null ? 'この環境では保存容量の目安を確認できません。' :
        `使用量の目安：${bytes(usage)}。保存上限の目安：${bytes(quota)}。`;
    } catch { if (!disposed && epoch === storageEpoch) storageStatus.textContent = '保存容量を確認できませんでした。もう一度確認できます。'; }
    finally { if (!disposed && epoch === storageEpoch) { storageChecking = false; storageCheck.disabled = false; } }
  }
  const identity = make('div'); identity.className = 'lv-project-identity'; identity.append(projectTitle, resumeStatus, fileStatus);
  const headerTools = make('div'); headerTools.className = 'lv-header-tools'; headerTools.append(headerActions, help); header.append(identity, headerTools);
  const resumeNotice = make('p'); resumeNotice.setAttribute('role', 'status');
  const otherProject = button('別のプロジェクトを開く', () => {
    if (!disposed && !busy && !dirty() && !ports.otherPending() && !ports.projectNavigationBlocked?.()) ports.openProject?.();
  });
  help.append(resumeNotice, otherProject);
  const status = make('p'); status.setAttribute('role', 'status'); status.className = 'lv-operation-status';
  const retry = button('更新を再試行', () => { void runRetry(); }); header.append(status, retry);
  const revise = button('入力を修正する', () => { if (!busy && ports.status().kind === 'idle') { pending = null; feedback = ''; render(); } }); header.append(revise);
  const body = make('div'); body.className = 'lv-project-body';
  const compactNavigation = make('nav'); compactNavigation.className = 'lv-compact-navigation'; compactNavigation.setAttribute('aria-label', '表示領域');
  let compactSurface: 'stage' | 'panel' = 'panel', captionSurface: 'list' | 'detail' = 'list';
  const stageVisible=()=>compactSurface==='stage'||!document.defaultView?.matchMedia?.('(max-width: 760px)').matches;
  const showStage = button('3D・比較', () => { if(!viewBlocked()){compactSurface = 'stage'; render();} }), showPanel = button('作業パネル', () => { if(!viewBlocked()){compactSurface = 'panel'; render();} });
  compactNavigation.append(showStage, showPanel);
  const stage = make('section'), canvas = make('canvas'), markers = make('div');
  stage.className = 'lv-project-stage'; canvas.setAttribute('aria-label', '3Dモデルの表示'); canvas.tabIndex = 0;
  const viewportStatus = make('p'); viewportStatus.setAttribute('role', 'status'); viewportStatus.className = 'lv-project-viewport-status';
  const retryViewport = button('3D表示を再試行', () => viewAction(() => viewport.retry()));
  const stageDisplay = make('div'); stageDisplay.className = 'lv-stage-display';
  markers.className = 'lv-project-markers'; stageDisplay.append(canvas, markers);
  const viewportTools = make('section'); viewportTools.className = 'lv-project-viewport-tools'; viewportTools.setAttribute('aria-label', '3D表示の操作');
  viewportTools.append(viewportStatus, retryViewport);
  const mediaViewer = createMediaViewer(document);
  const sidebar = make('aside'); sidebar.setAttribute('aria-label', '作業パネル');
  const sceneContext = make('p'); sceneContext.className = 'lv-current-scene';
  const retainedEdit = make('section'), retainedNote = make('p'); retainedEdit.className = 'lv-retained-edit';
  let retainedOwner: ProjectTask = 'captions';
  const returnToEdit = button('編集に戻る', () => { if(retainedOwner==='views')cameraPositions.open=true;else task = retainedOwner;
    const settingsOwner=organization?.inputOwner()==='settings';
    const organizationCaption=retainedOwner==='captions'&&organization?.hasChanges()&&organization.inputOwner()==='caption';
    if(retainedOwner==='captions' && !settingsOwner)captionSurface=sceneEdit || organization?.inputOwner()==='scene' ? 'list' : 'detail';
    if(sceneEdit || organization?.inputOwner()==='scene')sceneManagement.open=true;
    if(organization?.inputOwner()==='settings') organization.settingsRoot.open=true;
    if(organization?.hasChanges() && organization.inputOwner()==='caption'){organizeCaptions.open=true;organization.tagsRoot.open=true;}
    compactSurface = retainedOwner==='views'?'stage':'panel'; render();
    const target=settingsOwner ? organization!.settingsRoot : organizationCaption ? organization!.tagsRoot : retainedOwner==='captions' ? sceneEdit || organization?.inputOwner()==='scene' ? sceneArea : detailHeading : panels.get(retainedOwner)!.root;
    target.tabIndex=-1;target.focus?.({preventScroll:false}); });
  retainedEdit.append(retainedNote, returnToEdit);
  const taskTabs = make('div'), captionPanel = make('section'); taskTabs.setAttribute('role', 'tablist'); taskTabs.setAttribute('aria-label', '作業');
  const panels = new Map<ProjectTask, ProjectPanel>(); let task: ProjectTask = 'captions', models: ProjectModelPanel | undefined, mediaManager: ReturnType<typeof createProjectMedia> | undefined;
  const sceneArea = make('section'), scenes = make('div'); sceneArea.setAttribute('aria-label', 'シーン'); sceneArea.append(make('h2', 'シーン'), scenes);
  const sceneForm = make('form'), sceneLabel = make('label', 'シーン名'), sceneName = make('input');
  sceneForm.setAttribute('aria-label', 'シーンの変更');
  sceneName.setAttribute('aria-label', 'シーン名'); sceneLabel.append(sceneName);
  const createScene = button('シーンを追加', () => {}); createScene.type = 'submit';
  const sceneNote = make('p'), sceneStatus = make('p'), sceneManagement = make('details'), sceneActions = make('div');
  sceneManagement.setAttribute('aria-label', 'シーンの管理'); sceneStatus.setAttribute('role', 'status');
  const newScene = button('シーンを作る', () => beginSceneChange('create'));
  const renameScene = button('名前を変更', () => beginSceneChange('rename')), defaultScene = button('開始シーンにする', () => beginSceneChange('default'));
  const cancelScene = button('取り消す', () => { if (!busy && !pending && ports.status().kind === 'idle' && !ports.otherPending() && !sceneEdit?.composing) { clearSceneEdit(); render(); } });
  sceneActions.append(newScene, renameScene, defaultScene); sceneManagement.append(make('summary', 'シーンを管理'), sceneStatus, sceneActions);
  sceneForm.append(sceneLabel, sceneNote, createScene, cancelScene); sceneArea.append(sceneManagement, sceneForm);
  const pinArea = make('section'), pinStatus = make('p'), coords = make('div'); pinStatus.setAttribute('role', 'status');
  pinArea.setAttribute('aria-label', 'ピンの操作');
  const addPin = button('ピンを追加', () => { if (guardInput()) { pinAction = { kind: 'add', token: provider().token, sceneId, captionId: null, assetId: models?.selectedSurface() ?? undefined, color: addColorValue() }; choosing = true; placingCaption = null; render(); } });
  const addColorLabel = make('label', '追加色'), addColor = make('input'); addColor.type = 'color'; addColor.setAttribute('aria-label', '追加色'); addColorLabel.append(addColor);
  const numericAdd = make('details'), numericLabel = make('label', '追加先モデル'), numericModel = make('select'), beginNumeric = button('このモデルに追加', () => {
    if (!guardInput() || numericScope !== numericKey) return;
    const target = viewport.target(numericModel.value); if (!target) return;
    pinAction = { kind: 'add', token: provider().token, sceneId, captionId: null, assetId: target.assetId, color: addColorValue() };
    numericTarget = target; pin = null; rawPosition = ['', '', '']; choosing = false; placingCaption = null;numericAdd.open=false; render();
  });
  numericModel.setAttribute('aria-label', '追加先モデル'); numericLabel.append(numericModel); numericAdd.append(make('summary', '座標で追加'), numericLabel, beginNumeric,
    contextHelp(document,'モデルを選び、モデル内のX・Y・Z座標を指定してピンを追加します。面がない場合も使えます。',[beginNumeric]));
  const captureNumeric = () => { numericScope = numericKey; };
  numericModel.addEventListener('focus', captureNumeric); numericModel.addEventListener('pointerdown', captureNumeric);
  numericModel.addEventListener('change', () => { if (numericModel.disabled || numericScope !== numericKey) numericModel.value = ''; render(); });
  const captureAddColor = () => { colorScope = { token: provider().token, sceneId }; };
  addColor.addEventListener('focus', captureAddColor); addColor.addEventListener('pointerdown', captureAddColor);
  addColor.addEventListener('input', () => {
    if (mutationBlock() || dirty() || colorScope && (colorScope.token !== provider().token || colorScope.sceneId !== sceneId) || !/^#[0-9a-f]{6}$/i.test(addColor.value)) { addColor.value = addColorValue(); return; }
    addColors.set(sceneId, addColor.value.toLowerCase()); gesture = null; gestureGeneration++; render();
  });
  const movePin = button('位置を調整', () => {
    if (!guardInput()) return;
    const caption = provider().resources.captions[memory().selectedCaptionId ?? ''], anchor = fieldValue(caption?.anchor);
    if (!caption || !anchor || fieldValue(caption.lifecycle)?.state !== 'active' || projectCaptionSceneCount(provider(), caption.id).kind !== 'value') return;
    if (anchor.kind === 'unplaced') { pinAction = { kind: 'place', token: provider().token, sceneId, captionId: caption.id, assetId: anchor.ownerAssetId }; choosing = true; placingCaption = caption.id; render(); return; }
    if (anchor.kind !== 'asset') return;
    const target = viewport.target(anchor.assetId);
    if (!target) { feedback = '配置先モデルを確認してください。'; render(); return; }
    pinAction = { kind: 'move', token: provider().token, sceneId, captionId: caption.id, assetId: anchor.assetId };
    if (projectCaptions(provider(), sceneId).find(item => item.id === caption.id)?.needsReview) {
      pin = null; choosing = true; placingCaption = caption.id; rawPosition = ['', '', '']; render(); return;
    }
    setPin({ target, position: anchor.positionAsset, captionId: caption.id, ...(anchor.hitEvidence?.method === 'point-cloud' && anchor.hitEvidence.source?.representationId === target.representationId ? { point: {pointIndex:anchor.hitEvidence.source.surfaceRef.pointIndex} } : {}) }); render();
  });
  const parent = make('details'), parentTitle = make('summary', '親モデルを変更'), parentLabel = make('label', '変更先モデル'), parentTarget = make('select'), parentNote = make('p');
  parentTarget.setAttribute('aria-label', '変更先モデル'); parentLabel.append(parentTarget);
  const startParent = button('位置を確認', () => {
    if (!guardInput() || parentScope !== parentKey) return;
    const selected = memory().selectedCaptionId, target = viewport.target(parentTarget.value);
    if (!selected || !target || parentIssue(target.assetId)) return;
    try {
      const position = ports.pinPositionInParent(provider().token, selected, target.assetId);
      pinAction = { kind: 'reparent', token: provider().token, sceneId, captionId: selected, assetId: target.assetId };
      placingCaption = selected;
      if (position) setPin({ target, position, captionId: selected }); else choosing = true;
      feedback = position ? '現在の位置を保った仮表示です。確認して確定してください。' : '元の位置を確認できません。変更先モデルの面を選択して位置を指定してください。'; render();
    } catch (error) { feedback = (error as Error).message; render(); }
  });
  parent.append(parentTitle, parentLabel, startParent, parentNote);
  const captureParent = () => { parentScope = parentKey; };
  parentTarget.addEventListener('focus', captureParent); parentTarget.addEventListener('pointerdown', captureParent);
  parentTarget.addEventListener('change', () => { if (parentTarget.disabled || parentScope !== parentKey) parentTarget.value = ''; render(); });
  const coordinateInputs = ['X', 'Y', 'Z'].map((axis, i) => {
    const label = make('label', axis), input = make('input'); input.type = 'number'; input.step = 'any'; input.setAttribute('aria-label', `位置 ${axis}`);
    label.append(input); coords.append(label);
    input.addEventListener('input', () => {
      const target = pin?.target ?? numericTarget; if (!target || mutationBlock() || !pinCurrent()) return;
      rawPosition[i] = input.value;
      if (positionValid()) { pin = { target, captionId: pinAction!.captionId, position: rawPosition.map(Number) as unknown as Point3 }; numericTarget = null; }
      render();
    });
    input.addEventListener('compositionstart', () => { composing = true; render(); });
    input.addEventListener('compositionend', () => {
      rawPosition[i] = input.value; composing = false; const target = pin?.target ?? numericTarget;
      if (target && !mutationBlock() && pinCurrent() && positionValid()) { pin = { target, captionId: pinAction!.captionId, position: rawPosition.map(Number) as unknown as Point3 }; numericTarget = null; }
      render();
    }); return input;
  });
  const finishPin = button('位置を確定', () => {
    if (!pin || !!numericTarget || choosing || mutationBlock() || composingInput() || viewport.read().dragging || !positionValid() || !pinCurrent()) return;
    const captured = pin, target = viewport.target(captured.target.assetId);
    if (!target || !sameTarget(target, captured.target)) { feedback = '表示が変わっています。面を選び直してください。'; render(); return; }
    const command: MetadataEdit = captured.captionId ? { kind: pinAction!.kind === 'move' ? 'movePin' : 'reparentPin', sceneId, captionId: captured.captionId, anchor: surfaceAnchor(captured) } :
      { kind: 'addPin', sceneId, captionId: id('cap'), membershipId: id('scm'), eventId: id('evt'), anchor: surfaceAnchor(captured), colorSrgb: colorBytes(pinAction!.color!) };
    void run(command, () => {
      const captionId = command.kind === 'addPin' ? command.captionId : captured.captionId!;
      clearPin(); selectCaption(captionId); feedback = 'ピンの位置を確定しました。';
      queueMicrotask(() => { if (!disposed) detailHeading.focus?.({ preventScroll: true }); });
    });
  });
  const cancelPin = button('取り消す', () => { if (!busy && !pending && ports.status().kind === 'idle' && !ports.otherPending() && !composingInput()) { clearPin(); render(); (memory().selectedCaptionId ? movePin : addPin).focus?.({preventScroll:true}); } });
  const repick = button('面で位置を指定', () => { if (pin && !mutationBlock() && !composingInput() && pinCurrent()) { gesture = null; choosing = true; placingCaption = pin.captionId; render(); } });
  const addSurface=button('位置指定用の面を追加',()=>{if(!busy&&!pending){clearPin();task='models';render();const panel=panels.get('models')!.root;panel.tabIndex=-1;panel.focus?.({preventScroll:true});}});
  const pinAddRow = make('div'); pinAddRow.className = 'lv-pin-add-row'; pinAddRow.append(addPin, addColorLabel);
  pinArea.append(pinAddRow, numericAdd, movePin, parent);
  const pinTask = make('section'), pinTaskActions = make('div'); pinTask.className = 'lv-pin-task'; pinTask.setAttribute('aria-label', '位置の調整');
  pinTaskActions.className = 'lv-pin-task-actions'; pinTaskActions.append(repick, finishPin, cancelPin); pinTask.append(pinStatus, coords, addSurface, pinTaskActions);
  const deletionArea = make('section'), deletionBox = make('section'), deletionTitle = make('p'), deletionEffects = make('ul'), deletionNote = make('p'), referenceIssues = make('section');
  deletionArea.setAttribute('aria-label', 'キャプションの削除'); deletionBox.setAttribute('aria-label', '削除の確認'); deletionNote.setAttribute('role', 'status');
  referenceIssues.setAttribute('aria-label', '記録の状態');
  const deletionDiagnostics=make('details'),deletionDiagnosticList=make('ul'),referenceDiagnostics=make('details'),referenceDiagnosticList=make('ul'),referenceMessages=make('div');
  deletionDiagnostics.append(make('summary','技術情報'),deletionDiagnosticList);referenceDiagnostics.append(make('summary','技術情報'),referenceDiagnosticList);
  referenceIssues.append(referenceMessages,referenceDiagnostics);
  const beginDelete = button('プロジェクトから削除', () => {
    if (!guardInput() || !memory().selectedCaptionId) return;
    try { const p = provider(), captionId = memory().selectedCaptionId!;
      deletion = { token: p.token, sceneId, captionId, title: fieldValue(p.resources.captions[captionId]?.title) || '名称を確認', impact: ports.captionDeletion(p.token, captionId) }; feedback = ''; render();
    } catch (error) { feedback = (error as Error).message; render(); }
  });
  const confirmDelete = button('削除する', () => {
    const captured = deletion; if (!captured || mutationBlock() || composingInput() || viewport.read().dragging || captured.token !== provider().token || captured.sceneId !== sceneId || captured.captionId !== memory().selectedCaptionId) return;
    const { memberships, attachments, tags } = captured.impact;
    void run({ kind: 'deleteCaption', captionId: captured.captionId, eventId: id('evt'), observedMembershipIds: memberships.map(e => e.id),
      observedAttachmentIds: attachments.map(e => e.id), observedTagMembershipIds: tags.map(e => e.id) }, () => {
      deletion = null;
      for (const [key, value] of memories) if (value.selectedCaptionId === captured.captionId) memories.set(key, { ...value, selectedCaptionId: null });
      for (const [key, value] of windowMemories) windowMemories.set(key, { ...value, retained: value.retained.filter(c => c !== captured.captionId),
        dismissed: value.dismissed.filter(c => c !== captured.captionId), order: value.order.filter(c => c !== captured.captionId), placements: value.placements.filter(c => c.captionId !== captured.captionId) });
      resetDraft(); feedback = 'プロジェクトから削除しました。';
    });
  });
  const cancelDelete = button('取り消す', () => { if (!busy && !pending && ports.status().kind === 'idle' && !ports.otherPending() && !composing) { deletion = null; render(); } });
  deletionBox.append(deletionTitle, deletionEffects, deletionNote, deletionDiagnostics, confirmDelete, cancelDelete); deletionArea.append(beginDelete, deletionBox, referenceIssues);
  const media = make('section'), mediaLabel = make('label', 'メディアを追加'), mediaInput = make('input');
  media.setAttribute('aria-label', 'メディア'); mediaInput.type = 'file'; mediaInput.accept = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif,video/mp4,audio/mp4,audio/mpeg,.m4a,.mp3'; mediaInput.setAttribute('aria-label', 'メディアを追加'); mediaLabel.className = 'lv-media-add'; mediaLabel.append(mediaInput);
  const cancelMedia = button('選択を取り消す', cancelMediaSelection);
  const heicHelp = make('p', 'HEICは、このブラウザで読み込める場合に追加できます。原本と表示用PNGを保存します。HDRなどの見え方が変わる場合があります。');
  heicHelp.hidden = true; mediaInput.addEventListener('change', () => { heicHelp.hidden = !/\.hei[cf]$/i.test(mediaInput.files?.[0]?.name ?? ''); });
  const mediaDraftNotice = make('div'), returnToBody = button('本文へ戻る', () => { captionSurface='detail';render(); detail.focusBody(); });
  mediaDraftNotice.append(make('p','メディアを追加する前に、本文の変更を適用してください。'),returnToBody);
  editOnly(mediaDraftNotice); media.append(make('h2', 'メディア'), mediaDraftNotice, mediaLabel, cancelMedia, heicHelp);
  const conflicts = make('section');
  let sceneId = chooseStartupScene(ports.read().state).sceneId ?? '', disposed = false, busy = false, composing = false, feedback = '';
  let draft: CaptionDraft | null = null, pin: WorkspacePinProposal | null = null, choosing = false, placingCaption: string | null = null;
  let sceneEdit: SceneEdit | null = null, sceneInputScope: { token: string; sceneId: string } | null = null;
  let pinAction: PinAction | null = null;
  let numericTarget: WorkspaceSurface | null = null, numericKey = '', numericScope = '';
  let colorScope: { token: string; sceneId: string } | null = null;
  const addColors = new Map<string, string>(), addColorValue = () => addColors.get(sceneId) ?? '#a08045';
  let parentKey = '', parentScope = '';
  let deletion: { token: string; sceneId: string; captionId: string; title: string; impact: ReturnType<ProjectWorkspacePorts['captionDeletion']> } | null = null;
  let rawPosition = ['', '', ''], pending: { action: () => Promise<unknown>; complete: () => void; owner?: 'media' } | null = null;
  let pickerScope: { token: string; sceneId: string; captionId: string } | null = null;
  let gesture: { pointerId: number; action: PinAction | null; token: string; sceneId: string; receipt: string; x: number; y: number; left: number; top: number; width: number; height: number; generation: number; shifted: boolean; color: string } | null = null;
  let gestureGeneration = 0, gestureContext = ''; const pressedPointers = new Set<number>();
  let rendering = false, renderAgain = false, windowMoving = false;
  let viewportFeedback = '';
  const memories = new Map<string, SceneUiMemory>();
  const windowMemories = new Map<string, CaptionWindowMemory>();
  const includeMemories = new Map<string, CaptionIncludeMemory>();
  let recovery: ReturnType<typeof createProjectRecovery> | undefined;
  let organization: ReturnType<typeof createProjectOrganization> | undefined;
  const provider = () => ports.read();
  const memory = () => { if (!memories.has(sceneId)) memories.set(sceneId, emptyMemory()); return memories.get(sceneId)!; };
  const windowMemory = () => { if (!windowMemories.has(sceneId)) windowMemories.set(sceneId, newCaptionWindowMemory(sceneId)); return windowMemories.get(sceneId)!; };
  const includeMemory = () => { if (!includeMemories.has(sceneId)) includeMemories.set(sceneId, newCaptionIncludeMemory(sceneId)); return includeMemories.get(sceneId)!; };
  const composingInput = () => composing || !!draft?.composing || !!sceneEdit?.composing || includeMemory().composing || !!recovery?.composing() || !!mediaManager?.composing() || !!organization?.composing() || [...panels.values()].some(p => p.composing());
  const draftInput = () => hasCaptionDraft(draft) || !!draft?.composing || !!pin || !!numericTarget || choosing || !!deletion || composing || !!pickerScope || !!sceneEdit || includeMemory().composing;
  const panelInput = () => !!organization?.hasChanges() || [...panels.values()].some(p => p.hasChanges());
  const dirty = () => draftInput() || !!recovery?.hasChanges() || !!pending || panelInput() || !!mediaManager?.hasChanges() || windowMoving || viewport.read().dragging;
  const mutationBlock = () => windowMoving ? 'ウィンドウの操作を完了してください。' : busy ? '変更を適用しています。' : ports.status().kind === 'failed' ? ports.status().error || '更新を再試行してください。' :
    ports.presentation?.()?.reason ?? (ports.readOnly ? '閲覧中です。編集を開始してください。' : ports.otherPending() ? 'ファイルの操作を完了してください。' : pending ? '再試行するか、入力を修正してください。' : null);
  const listContext = (): CaptionListContext => ({ source: { kind: 'ready', token: provider().token, sceneId,
    captions: projectCaptions(provider(), sceneId, models?.hidden()) }, memory: memory(), pending: dirty() ? 'text' : busy ? 'update' : null,
    showModelPending: composingInput() || pressedPointers.size || pin || numericTarget || choosing || deletion || pickerScope || sceneEdit || recovery?.hasChanges() || panelInput() || mediaManager?.hasChanges() || windowMoving || viewport.read().dragging ? 'text' : null,
    mutationBlock: busy || pending || windowMoving || ports.status().kind !== 'idle' || ports.otherPending() ? '現在の操作を完了してください。' : null });
  const detailContext = (): DetailContext => {
    const item = projectCaptions(provider(), sceneId, models?.hidden()).find(c => c.id === memory().selectedCaptionId);
    return { source: item ? { kind: 'ready', token: provider().token, sceneId, caption: item, sceneCount: projectCaptionSceneCount(provider(), item.id) } :
      { kind: 'unavailable', token: provider().token, sceneId, captionId: memory().selectedCaptionId,
        reason: memory().selectedCaptionId ? 'この記録は削除されたか、所属・更新の状態を確認する必要があります。未適用の入力は保持しています。' : '記録を選択してください。' },
      draft, mutationBlock: mutationBlock() || (pin || !!numericTarget || choosing || deletion || sceneEdit || includeMemory().composing || pickerScope || recovery?.hasChanges() || panelInput() || mediaManager?.hasChanges() ? '現在の操作を完了してください。' : null), feedback: { kind: 'idle' } };
  };
  const list = createCaptionListControls(document, plan => {
    if (disposed || busy || pending || windowMoving || ports.otherPending()) return;
    if (plan.kind === 'blocked') { feedback = plan.reason; render(); return; }
    if (!captionListPlanIsCurrent(plan, listContext())) return;
    if (plan.kind === 'change') { memories.set(sceneId, plan.memory); if (plan.intent === 'select') { resetDraft(); if(organizeCaptions.open)alignOrganization();openWindow(memory().selectedCaptionId!); captionSurface = 'detail'; } }
    if (plan.kind === 'unchanged' && plan.explicitSelection) { openWindow(plan.explicitSelection.captionId); captionSurface = 'detail'; }
    if (plan.kind === 'effect' && plan.action === 'review') {
      selectCaption(plan.captionId); feedback = '記録の競合・配置先・メディアの状態を確認してください。';
    }
    if (plan.kind === 'effect' && plan.action === 'showModel') {
      const p = provider(), anchor = fieldValue(p.resources.captions[plan.captionId]?.anchor), source = projectModels(p, sceneId, projectIdentity(p), models!.hidden(), viewport.read());
      const asset = anchor?.kind === 'asset' && source.kind === 'ready' ? source.items.find(a => a.id === anchor.assetId) : undefined;
      if (asset?.lifecycle.kind !== 'value' || asset.lifecycle.value !== 'active' || asset.membership.kind !== 'value' ||
        p.resources.assets[asset.id]?.projection.kind !== 'value' || !projectCaptions(p, sceneId, models!.hidden()).some(c => c.id === plan.captionId && c.pin === 'ownerHidden')) { feedback = 'モデルの所属と状態を確認してください。'; render(); return; }
      if (asset.membership.value.kind === 'included') { models!.show(asset.id); feedback = 'モデルを表示しました。'; }
      else if (!mutationBlock()) { void run({ kind: 'include', sceneId, resourceKind: 'asset', resourceId: asset.id, membershipId: id('sam'), eventId: id('evt'), orderKey: ports.viewOrder(null, null) },
        () => { models!.show(asset.id); feedback = 'このシーンにモデルを追加して表示しました。'; }); return; }
      else feedback = mutationBlock()!;
    }
    render();
    if (plan.kind === 'effect' && plan.action === 'review') recovery?.reveal(group => 'captionId' in group.target && group.target.captionId === plan.captionId);
    if (plan.kind === 'change' && plan.intent === 'select' || plan.kind === 'unchanged' && plan.explicitSelection) detailHeading.focus?.({ preventScroll: true });
  }, active => { composing = active; render(); }, {compact:true});
  const detail = createCaptionDetailControls(document, event => {
    if (event.kind === 'window') {
      if (!disposed && !busy && !pending && !windowMoving && !ports.otherPending() && event.token === provider().token &&
        event.sceneId === sceneId && event.captionId === memory().selectedCaptionId) { openWindow(event.captionId); render(); }
      return;
    }
    if (event.kind === 'review') {
      if (disposed || busy || pending || windowMoving || viewport.read().dragging || composingInput() || ports.otherPending() || event.token !== provider().token || event.captionId !== memory().selectedCaptionId) return;
      render(); recovery?.reveal(group => (group.target.kind === 'text' || group.target.kind === 'field') && group.target.captionId === event.captionId && group.target.field === (event.field === 'color' ? 'colorSrgb' : event.field)); return;
    }
    if (disposed || mutationBlock() || panelInput() || mediaManager?.hasChanges()) return;
    if (event.kind === 'draft' && event.baseDraft === draft) draft = event.draft;
    else if (event.kind === 'cancel' && event.draft === draft) resetDraft();
    else if (event.kind === 'apply' && captionApplyIsCurrent(event, detailContext())) {
      const edits = { ...(event.changes.title !== undefined ? { title: event.changes.title } : {}),
        ...(event.changes.body !== undefined ? { body: event.changes.body } : {}),
        ...(event.changes.color !== undefined ? { colorSrgb: colorBytes(event.changes.color) } : {}) };
      void run({ kind: 'editCaption', captionId: event.captionId, edits }, () => { resetDraft(); feedback = '変更を適用しました。'; });
    }
    render();
  });
  const captionNavigation = make('nav'); captionNavigation.setAttribute('aria-label', '記録の前後移動');
  const detailHeading = make('h2'); detailHeading.tabIndex = -1;
  const captionBack = button('一覧へ戻る', () => { captionSurface = 'list'; render(); list.focusSearch(); });
  const openDetail = button('選択したキャプション', () => { captionSurface = 'detail'; render(); detailHeading.focus?.({ preventScroll: true }); });
  const detailPane = make('section'); detailPane.className = 'lv-caption-reading';
  function stepCaption(direction: 'previous' | 'next') {
    if (disposed || busy || pending || windowMoving || ports.otherPending()) return;
    const context = listContext(), plan = planCaptionList(context, { kind: 'step', direction });
    if (plan.kind !== 'change' || !captionListPlanIsCurrent(plan, listContext())) return;
    memories.set(sceneId, plan.memory); resetDraft();if(organizeCaptions.open)alignOrganization(); openWindow(plan.memory.selectedCaptionId!); render();
  }
  const previousCaption = button('前の記録', () => stepCaption('previous')), nextCaption = button('次の記録', () => stepCaption('next'));
  captionNavigation.append(captionBack, previousCaption, nextCaption);
  const includeContext = (): CaptionIncludeContext => ({ source: projectCaptionInventory(provider(), sceneId, models?.hidden()), memory: includeMemory(),
    pending: dirty() ? 'text' : null, mutationBlock: mutationBlock(), feedback: { kind: busy ? 'applying' : 'idle' } });
  const inclusion = createCaptionIncludeControls(document, plan => {
    if (disposed || plan.kind === 'blocked') return;
    if (plan.kind === 'change') {
      const current = includeMemory(), localText = plan.baseMemory === current && plan.sceneId === sceneId && plan.memory.sceneId === sceneId && plan.memory.captionId === current.captionId;
      if (!captionIncludePlanIsCurrent(plan, includeContext()) && !localText) return;
      if ((busy || pending || windowMoving || ports.otherPending()) && !localText) return;
      includeMemories.set(sceneId, plan.memory); render(); return;
    }
    if (!captionIncludePlanIsCurrent(plan, includeContext())) return;
    if (busy || pending || windowMoving || ports.otherPending() || dirty()) return;
    if (plan.kind === 'review') { feedback = '記録の状態と所属・更新の競合を確認してください。'; render(); return; }
    const edges = Object.values(provider().state.captionMemberships).filter(e => e.sceneId === sceneId && e.resourceId === plan.captionId && fieldValue(e.lifecycle)?.state === 'active');
    if (mutationBlock() || plan.kind === 'exclude' && edges.length !== 1) return;
    const command: MetadataEdit = plan.kind === 'include' ? { kind: 'include', sceneId, resourceKind: 'caption', resourceId: plan.captionId,
      membershipId: id('scm'), orderKey: 'Z', eventId: id('evt') } : { kind: 'exclude', resourceKind: 'caption', membershipId: edges[0]!.id, eventId: id('evt') };
    void run(command, () => {
      if (plan.kind === 'exclude') {
        if (memory().selectedCaptionId === plan.captionId) { memories.set(sceneId, { ...memory(), selectedCaptionId: null }); resetDraft(); }
        const m = windowMemory(); windowMemories.set(sceneId, { ...m, retained: m.retained.filter(c => c !== plan.captionId), dismissed: m.dismissed.filter(c => c !== plan.captionId),
          order: m.order.filter(c => c !== plan.captionId), placements: m.placements.filter(c => c.captionId !== plan.captionId) });
      }
      feedback = plan.kind === 'include' ? 'このシーンに追加しました。' : 'このシーンから外しました。キャプションは残っています。';
    });
  });
  inclusion.root.setAttribute('aria-label', 'キャプションの追加・除外');
  editOnly(sceneManagement, sceneForm, pinArea, pinTask, mediaLabel, cancelMedia, heicHelp, beginDelete, deletionBox, retry, revise);
  const organizeCaptions = make('details'); organizeCaptions.append(make('summary', '記録を整理'), inclusion.root, deletionArea);
  function alignOrganization(){
    if(busy||pending||windowMoving||ports.otherPending()||composingInput())return;
    const selected=memory().selectedCaptionId;if(!selected)return;
    for(const intent of [{kind:'search',query:''},{kind:'select',captionId:selected}] as const){
      const context=includeContext(),plan=planCaptionInclude(context,intent);
      if(plan.kind==='change'&&captionIncludePlanIsCurrent(plan,context))includeMemories.set(sceneId,plan.memory);
    }
  }
  organizeCaptions.addEventListener('click',event=>{if((event.target as Element)?.closest?.('summary')&&!organizeCaptions.open){alignOrganization();render();}});
  const recordTools=make('div');recordTools.className='lv-record-tools';recordTools.setAttribute('aria-label','選択した記録の操作');recordTools.append(movePin,parent,organizeCaptions);
  list.tools.append(pinArea,recordTools);editOnly(movePin,parent);
  pinAddRow.append(numericAdd);captionPanel.className='lv-caption-task';
  const recordSheets=new Map<HTMLDetailsElement,HTMLElement>();
  for(const disclosure of [numericAdd,parent,organizeCaptions]){
    const sheet=make('div');sheet.className='lv-record-sheet';for(const child of Array.from(disclosure.children).slice(1))sheet.append(child);disclosure.append(sheet);recordSheets.set(disclosure,sheet);
    disclosure.addEventListener('toggle',()=>{if(disclosure.open)for(const other of recordSheets.keys())if(other!==disclosure&&!composingInput())other.open=false;positionRecordSheets();});
    disclosure.addEventListener('click',event=>{if((event.target as Element)?.closest?.('summary')&&composingInput())event.preventDefault();});
    disclosure.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&!composingInput()&&!busy&&!pending&&!ports.otherPending()){event.preventDefault();disclosure.open=false;(disclosure.children[0] as HTMLElement).focus?.({preventScroll:true});}});
  }
  function positionRecordSheets(){
    const win=document.defaultView;if(!win)return;
    for(const [owner,sheet] of recordSheets){if(!owner.open)continue;const rect=owner.getBoundingClientRect?.();if(!rect)continue;
      const width=Math.min(380,Math.max(120,win.innerWidth-24)),above=win.innerHeight-rect.bottom<180&&rect.top>win.innerHeight/2;
      const max=Math.max(100,Math.min(420,above?rect.top-20:win.innerHeight-rect.bottom-20));
      sheet.style.width=`${width}px`;sheet.style.left=`${Math.max(12,Math.min(win.innerWidth-width-12,rect.right-width))}px`;sheet.style.maxHeight=`${max}px`;
      sheet.style.top=above?'auto':`${rect.bottom+8}px`;sheet.style.bottom=above?`${win.innerHeight-rect.top+8}px`:'auto';
    }
  }
  const closeRecordSheets=(event:Event)=>{
    if(composingInput())return;
    const target=event.target as Node|null;if(!target)return;
    for(const owner of recordSheets.keys())if(owner.open&&!owner.contains(target))owner.open=false;
  };
  document.addEventListener?.('pointerdown',closeRecordSheets,true);
  document.addEventListener?.('focusin',closeRecordSheets);
  const captionContent=make('div');captionContent.className='lv-caption-content';
  detail.mediaSlot.append(media);captionContent.append(captionNavigation,detailHeading);
  for(const child of Array.from(detail.root.children))if(child!==detail.actions&&child!==detail.confirmation)captionContent.append(child);
  captionContent.append(conflicts);detail.root.append(captionContent,detail.actions,detail.confirmation);detailPane.append(detail.root);
  captionPanel.append(list.root,openDetail,detailPane);sidebar.append(sceneArea,sceneContext,taskTabs,retainedEdit,captionPanel);
  stageDisplay.append(pinTask); stage.append(viewportTools, stageDisplay); body.append(stage, sidebar); root.append(header, compactNavigation, body, mediaViewer.root);
  let feedbackTimer: number | undefined;
  let mounted = false, observationFrame:number|null=null, observationEpoch=0;
  function cancelObservation(){
    const frame=observationFrame;observationFrame=null;observationEpoch++;
    if(frame!==null&&typeof globalThis.cancelAnimationFrame==='function')globalThis.cancelAnimationFrame(frame);
  }
  function viewportChanged(){
    if(!mounted||disposed||rendering||observationFrame!==null)return;
    if(typeof globalThis.requestAnimationFrame!=='function'){render();return;}
    const epoch=observationEpoch;
    observationFrame=globalThis.requestAnimationFrame(()=>{
      if(disposed||epoch!==observationEpoch)return;
      observationFrame=null;render(); // Read current state; never retain an authority snapshot.
    });
  }
  let beforePinDrag: WorkspacePinProposal | null = null;
  const viewport = ports.createViewport(canvas, viewportChanged, (target, position, phase) => {
    if (!pin || mutationBlock() || composingInput() || !pinCurrent() || !sameTarget(target, pin.target) || !position.every(Number.isFinite)) return false;
    if (phase === 'begin') { beforePinDrag = pin; return true; }
    if (phase === 'restore' && beforePinDrag && sameTarget(target, beforePinDrag.target)) setPin(beforePinDrag);
    else setPin({ ...pin, position, point: undefined }); render(); return true;
  }, proposal => models?.propose(proposal) ?? false);
  function panelBlock(owner: ProjectTask, writes = true, allowDrag = false): string | null {
    if (windowMoving) return 'ウィンドウの操作を完了してください。';
    const global = writes ? mutationBlock() : busy || pending || ports.status().kind !== 'idle' ? '現在の更新を完了してください。' : ports.otherPending() ? 'ファイルの操作を完了してください。' : null;
    if (global) return global;
    if (owner !== 'captions' && mediaManager?.hasChanges()) return 'メディアの入力・操作を完了してください。';
    if (writes && hasCaptionDraft(draft)) return 'キャプションの変更を適用するか、取り消してください。';
    if (!allowDrag && viewport.read().dragging) return 'カメラ・配置の操作を終えてください。';
    if (composing || draft?.composing || pin || !!numericTarget || choosing || deletion || pickerScope || recovery?.hasChanges() || sceneEdit || includeMemory().composing) return '現在の入力・操作を完了してください。';
    if ([...panels].some(([key, panel]) => key !== owner && panel.hasChanges())) return 'ほかの作業の入力を完了するか、取り消してください。';
    return null;
  }
  const panelHost: ProjectPanelHost = { ports, source: () => ({ provider: provider(), sceneId }), viewport: () => viewport, block: panelBlock,
    selectedModel: () => models?.selectedAsset?.() ?? null,
    changed: render, message(text) { feedback = text; render(); },
    execute(owner, token, action, complete) { const block = panelBlock(owner);
      if (block || token !== provider().token) { feedback = block ?? '対象が更新されています。入力を保持しています。'; render(); return; }
      void perform(action, complete);
    },
    dispatch(owner, token, command, complete) { const undo = organization?.beginAction(command) ?? null; this.execute(owner, token, () => ports.dispatch(token, command), () => { organization?.recordAction(undo); complete(); }); },
  };
  organization = createProjectOrganization(document, {
    ports, source: () => ({ provider: provider(), sceneId, captionId: memory().selectedCaptionId }),
    localBlocked: () => busy || !!pending || ports.otherPending() || windowMoving || hasCaptionDraft(draft) || !!draft?.composing ||
      composing || !!sceneEdit || includeMemory().composing || !!pin || !!numericTarget || choosing || !!deletion || !!pickerScope ||
      !!recovery?.hasChanges() || !!mediaManager?.hasChanges() || [...panels.values()].some(p => p.hasChanges()) || viewport.read().dragging,
    blocked: () => mutationBlock() || (hasCaptionDraft(draft) || draft?.composing || composing || sceneEdit || includeMemory().composing ||
      pin || numericTarget || choosing || deletion || pickerScope || recovery?.hasChanges() || mediaManager?.hasChanges() ||
      [...panels.values()].some(p => p.hasChanges()) || viewport.read().dragging ? '現在の入力・操作を完了してください。' : null),
    run: (command, complete) => { void run(command, complete); },
    scene(next) { sceneId = next; draft = null; }, caption: selectCaption, changed: render, message(text) { feedback = text; render(); },
  });
  sceneManagement.append(organization.sceneRoot);recordSheets.get(organizeCaptions)!.append(organization.captionRoot,organization.tagsRoot);
  help.append(organization.displayNameBadge); headerTools.append(organization.settingsRoot);
  const wrapDisclosure=(disclosure:HTMLDetailsElement)=>{const panel=make('div');panel.className='lv-header-sheet';
    for(const child of Array.from(disclosure.children).slice(1))panel.append(child);disclosure.append(panel);return panel;};
  const helpSheet=wrapDisclosure(help),settingsSheet=wrapDisclosure(organization.settingsRoot);
  function positionHeaderSheets(){
    const win=document.defaultView;if(!win)return;
    for(const [entry,panel] of [[help,helpSheet],[organization!.settingsRoot,settingsSheet]] as const){
      const rect=entry.getBoundingClientRect?.();if(!rect)continue;
      const top=Math.min(rect.bottom+8,Math.max(12,win.innerHeight-180));panel.style.top=`${top}px`;panel.style.maxHeight=`${Math.max(120,win.innerHeight-top-12)}px`;
    }
  }
  document.defaultView?.addEventListener('resize',positionHeaderSheets);
  document.defaultView?.addEventListener('resize',render);
  for(const disclosure of [help,organization.settingsRoot]){
    disclosure.addEventListener('toggle',()=>{if(disclosure.open){for(const other of [help,organization!.settingsRoot])if(other!==disclosure)other.open=false;}});
    disclosure.addEventListener('click',event=>{if((event.target as Element)?.closest?.('summary') && (ports.otherPending()||ports.disclosureOpening?.()===false)){event.preventDefault();feedback='ファイルの操作を完了してください。';render();}});
  }
  mediaManager = createProjectMedia(document, panelHost, () => memory().selectedCaptionId, mediaViewer); media.append(mediaManager.root);
  function recoveryBlock(group?: WorkspaceRecoveryGroup): string | null {
    const global = mutationBlock(); if (global) return global;
    if (composingInput() || pin || !!numericTarget || choosing || deletion || pickerScope || sceneEdit || panelInput() || mediaManager?.hasChanges() || viewport.read().dragging)
      return '現在の入力・操作を完了してください。';
    if (group?.target.kind === 'startup' && hasCaptionDraft(draft)) return 'キャプションの変更を適用するか、取り消してください。';
    return null;
  }
  recovery = createProjectRecovery(document, { token: () => provider().token, groups: () => ports.recovery(), block: recoveryBlock,
    cancelBlock: () => busy || !!pending || windowMoving || ports.otherPending() || ports.status().kind !== 'idle',
    selectBlock: () => busy || !!pending || windowMoving || ports.otherPending() || ports.status().kind !== 'idle' || !!pin || !!numericTarget || choosing || !!deletion || !!pickerScope || !!sceneEdit || panelInput() || !!mediaManager?.hasChanges() || viewport.read().dragging || composing || !!draft?.composing || includeMemory().composing,
    changed: render, membership: ports.prepareCaptionMembership,
    apply(token, command, complete) {
      if (recoveryBlock() || token !== provider().token) return;
      void perform(async () => ports.dispatch(token, command()), () => { complete(); feedback = '競合を解消しました。'; });
    } });
  conflicts.append(recovery.root);
  const windowBlock = () => busy || pending || ports.otherPending() ? '現在の更新・ファイル操作を完了してください。' :
    draftInput() || recovery?.hasChanges() || panelInput() || mediaManager?.hasChanges() || viewport.read().dragging ? '入力・操作を確定するか、取り消してください。' : null;
  function acceptWindow(plan: CaptionWindowPlan): boolean {
    if (disposed || busy || pending || ports.otherPending() || plan.kind === 'blocked' ||
      !captionWindowPlanIsCurrent(plan, listContext().source, windowMemory(), memory().selectedCaptionId)) return false;
    if (plan.memory.placements !== windowMemory().placements && windowBlock()) return false;
    windowMemories.set(sceneId, plan.memory); render(); return true;
  }
  function openWindow(captionId: string) {
    const plan = planCaptionWindow(listContext().source, windowMemory(), memory().selectedCaptionId, { kind: 'open', captionId });
    if (plan.kind !== 'change') return false;
    windowMemories.set(sceneId, plan.memory); return true;
  }
  const windows = createCaptionWindowControls(document, acceptWindow, active => {
    windowMoving = active; if (rendering) renderAgain = true; else render();
  }, captionId => mediaManager!.gallery(captionId));
  const compareTools = make('details'); compareTools.className = 'lv-comparison-actions'; compareTools.append(make('summary', '開いた記録'), windows.tools);
  stageDisplay.append(windows.root, compareTools);
  models = createProjectModels(document, panelHost); panels.set('models', models);
  const views=createProjectViews(document,panelHost);panels.set('views',views); panels.set('materials', createProjectMaterials(document, panelHost));
  const cameraPositions=make('details'),cameraSheet=make('div');cameraPositions.className='lv-camera-positions';cameraPositions.setAttribute('aria-label','カメラ位置');
  const cameraHeader=make('div'),closeCamera=button('閉じる',()=>{if(!viewBlocked()&&!views.composing()){cameraPositions.open=false;render();(cameraPositions.children[0] as HTMLElement).focus?.({preventScroll:true});}});cameraHeader.className='lv-camera-sheet-header';cameraHeader.append(make('strong','カメラ位置'),closeCamera);
  cameraSheet.className='lv-camera-sheet';cameraSheet.append(cameraHeader,views.root);cameraPositions.append(make('summary','カメラ位置'),cameraSheet);stageDisplay.append(cameraPositions);
  cameraPositions.addEventListener('toggle',()=>{if(!cameraPositions.open&&views.composing())cameraPositions.open=true;render();});
  cameraPositions.addEventListener('click',event=>{if((event.target as Element)?.closest?.('summary')&&viewBlocked())event.preventDefault();});
  cameraPositions.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&!views.composing()&&!viewBlocked()){event.preventDefault();cameraPositions.open=false;render();(cameraPositions.children[0] as HTMLElement).focus?.({preventScroll:true});}});
  const tabButtons = new Map<ProjectTask, HTMLButtonElement>();
  for (const [key, label] of [['captions', 'キャプション'], ['models', 'モデル'], ['materials', '描画']] as const) {
    const tab = button(label, () => { if (!busy && !pending && !windowMoving && !ports.otherPending() && !composing && !sceneEdit?.composing && !includeMemory().composing && !draft?.composing && !mediaManager?.composing() && ![...panels.values()].some(p => p.composing())) { task = key; feedback=''; render(); } });
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `lv-project-${key}`); tab.id = `lv-project-tab-${key}`; tabButtons.set(key, tab); taskTabs.append(tab);
    tab.addEventListener('keydown', event => {
      if (tab.disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const keys = [...tabButtons.keys()], at = keys.indexOf(key);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (at + (event.key === 'ArrowLeft' ? keys.length - 1 : 1)) % keys.length;
      event.preventDefault(); const button = tabButtons.get(keys[next]!)!; button.focus(); button.click();
    });
    const panel = key === 'captions' ? captionPanel : panels.get(key)!.root; panel.id = `lv-project-${key}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
    if (key !== 'captions') sidebar.append(panel);
  }
  const interaction: WorkspaceFileInteraction = {
    get interactionPending() { return dirty(); },
    get acknowledgment(): WorkspaceFileInteraction['acknowledgment'] { return { state: busy ? 'checking' : pending ? 'failed' : 'idle' }; },
    refreshHistory() { if (!hasCaptionDraft(draft) && !draft?.composing) draft = null; render(); },
  };
  function guardInput(): boolean {
    const reason = mutationBlock();
    if (reason || dirty()) { feedback = reason || '入力・操作を確定するか、取り消してください。'; render(); return false; }
    return true;
  }
  function resetDraft() { draft = null; draft = beginCaptionDraft(detailContext().source); }
  function selectCaption(captionId: string) { memories.set(sceneId, { ...memory(), selectedCaptionId: captionId }); resetDraft();if(organizeCaptions.open)alignOrganization(); openWindow(captionId); captionSurface = 'detail'; }
  function setPin(next: WorkspacePinProposal) { pin = next; numericTarget = null; choosing = false; rawPosition = next.position.map(String);parent.open=false;numericAdd.open=false; }
  function clearPin() { compactSurface = 'panel'; gesture = null; gestureGeneration++; pin = null; numericTarget = null; pinAction = null; choosing = false; placingCaption = null; rawPosition = ['', '', '']; }
  function pinCurrent() {
    if (!pinAction || pinAction.token !== provider().token || pinAction.sceneId !== sceneId || pinAction.captionId && pinAction.captionId !== memory().selectedCaptionId) return false;
    if (pinAction.captionId) { const caption = provider().resources.captions[pinAction.captionId];
      if (fieldValue(caption?.lifecycle)?.state !== 'active' || caption?.anchor.kind !== 'value' || projectCaptionSceneCount(provider(), pinAction.captionId).kind !== 'value') return false;
    }
    const target = pin?.target ?? numericTarget;
    return !target || (!pinAction.assetId || target.assetId === pinAction.assetId) && !!viewport.target(target.assetId) && sameTarget(viewport.target(target.assetId)!, target);
  }
  function parentIssue(assetId: string) {
    const p = provider(), selected = memory().selectedCaptionId, caption = selected ? p.resources.captions[selected] : undefined, anchor = fieldValue(caption?.anchor);
    if (!caption || !anchor || fieldValue(caption.lifecycle)?.state !== 'active' || anchor.kind === 'unplaced') return 'ピンの状態を確認してください。';
    if (projectCaptionSceneCount(p, caption.id).kind !== 'value') return '影響するシーンを確認してください。';
    if (anchor.kind === 'asset' && anchor.assetId === assetId) return '別の親モデルを選択してください。';
    if (!assetId) return '変更先モデルを選択してください。';
    return viewport.target(assetId) ? null : '変更先モデルをこのシーンに表示し、状態を確認してください。';
  }
  function renderCaptionActions() {
    const p = provider(), selected = memory().selectedCaptionId, caption = selected ? p.resources.captions[selected] : undefined, anchor = fieldValue(caption?.anchor), blocked = mutationBlock();
    const targets = Object.values(p.resources.assets).filter(a => fieldValue(a.lifecycle)?.state === 'active' && (anchor?.kind !== 'asset' || a.id !== anchor.assetId)).map(a => ({ id: a.id,
      label: fieldValue(p.details.mutable.assetsById[a.id]?.label) as string | undefined, target: viewport.target(a.id) }));
    const numericTargets = Object.values(p.resources.assets).flatMap(a => { const target = viewport.target(a.id); return target ? [{ id: a.id, name: fieldValue(p.details.mutable.assetsById[a.id]?.label) as string | undefined, target }] : []; });
    const nextNumericKey = JSON.stringify([p.token, sceneId, numericTargets]);
    if (nextNumericKey !== numericKey) { numericKey = nextNumericKey; numericModel.replaceChildren(); const empty = make('option', '追加先モデルを選択'); empty.value = ''; numericModel.append(empty);
      for (const t of numericTargets) { const option = make('option', t.name ?? '名称を確認'); option.value = t.id; numericModel.append(option); } numericModel.value = ''; }
    numericModel.disabled = !!blocked || dirty(); beginNumeric.disabled = numericModel.disabled || !numericModel.value || numericScope !== numericKey;
    addPin.disabled = addPin.disabled || !numericTargets.length; addColor.disabled = addPin.disabled; addColor.value = addColorValue();
    const key = JSON.stringify([p.token, sceneId, selected, targets]);
    if (key !== parentKey) { const empty = make('option', '変更先モデルを選択'); empty.value = ''; parentTarget.replaceChildren(empty); parentTarget.value = '';
      for (const item of targets) { const option = make('option', item.label || '名称を確認'); option.value = item.id; option.disabled = !item.target; parentTarget.append(option); } parentKey = key;
    }
    parent.hidden = !selected || anchor?.kind === 'unplaced';
    parentTarget.disabled = !!blocked || dirty(); startParent.disabled = parentTarget.disabled || parentScope !== parentKey || !!parentIssue(parentTarget.value);
    parentNote.textContent = parentIssue(parentTarget.value) ?? ''; parentNote.hidden = !parentNote.textContent;
    movePin.disabled = !!blocked || dirty() || !caption || fieldValue(caption.lifecycle)?.state !== 'active' || !anchor || anchor.kind === 'project' || projectCaptionSceneCount(p, caption.id).kind !== 'value';
    beginDelete.hidden = !!deletion; beginDelete.disabled = !!blocked || dirty() || !selected;
    deletionBox.hidden = !deletion;
    confirmDelete.disabled = !!blocked || !deletion || composingInput() || viewport.read().dragging || deletion.token !== p.token || deletion.sceneId !== sceneId || deletion.captionId !== selected;
    cancelDelete.disabled = busy || !!pending || ports.status().kind !== 'idle' || ports.otherPending() || composing;
    if (deletion) {
      const { impact } = deletion; deletionTitle.textContent = `「${deletion.title}」をプロジェクト全体から削除しますか？`;
      const rows = impact.memberships.map(e => `シーン：${fieldValue(p.state.scenes[e.sceneId]?.name) ?? '名称を確認'}`);
      rows.push(...impact.attachments.map(e => { const media = fieldValue(p.details.immutable.mediaResourcesById[e.mediaResourceId]); return `添付：${typeof media?.label === 'string' ? media.label : 'メディア'}`; }),
        ...impact.tags.map(e => `タグの登録：${String(fieldValue(p.details.mutable.captionTagsById[e.tagId]?.label) ?? '名称を確認')}`));
      deletionEffects.replaceChildren(...rows.map(text => make('li', text)));
      deletionDiagnosticList.replaceChildren(...[...impact.memberships.map(e=>`シーン ${e.sceneId} / 登録 ${e.id}`),...impact.attachments.map(e=>`添付 ${e.id}`),...impact.tags.map(e=>`タグ登録 ${e.id}`)].map(text=>make('li',text)));
      deletionNote.textContent = deletion.token !== p.token ? '内容が更新されています。取り消して、影響を確認し直してください。' :
        `${impact.memberships.length}件のシーン登録・添付${impact.attachments.length}件・タグ登録${impact.tags.length}件も削除します。メディア本体とタグは残ります。この画面の「記録の変更を元に戻す」で戻せます。別の更新や未解決の内容がある場合は戻せません。`;
    }
    const issues = p.issues.filter(i => i.kind === 'orphan' || i.code === 'concurrent-delete-edit' || i.code === 'pending-orphan-reference' ||
      i.code === 'atomic-field-conflict' && i.path[2] === 'lifecycle' && ['captionsById', 'sceneCaptionMembershipsById', 'captionAttachmentsById', 'captionTagMembershipsById'].includes(i.path[0]!));
    referenceIssues.hidden = !issues.length;
    referenceMessages.replaceChildren(...[...new Set(issues.map(i => i.code === 'concurrent-delete-edit' ? '削除と編集が競合しています。内容は履歴に保持しています。' : i.code === 'atomic-field-conflict' ? '削除・復元の状態が競合しています。' : '参照先の確認が必要です。関係する内容は履歴に保持しています。'))].map(text => make('p', text)));
    referenceDiagnosticList.replaceChildren(...issues.map(i=>make('li',`${i.code}: ${i.path.join(' / ')}`)));
  }
  function positionValid() { return rawPosition.every(v => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim()) && Number.isFinite(Number(v))); }
  async function perform(action: () => Promise<unknown>, complete: () => void, owner?: 'media') {
    document.defaultView?.clearTimeout(feedbackTimer); busy = true; feedback = '変更を適用しています。'; pending = { action, complete, owner };
    try { render(); await action(); if (!disposed) { complete(); pending = null; const completed = feedback;
      feedbackTimer = document.defaultView?.setTimeout(() => { if (!disposed && !busy && !pending && ports.status().kind === 'idle' && feedback === completed) { feedback = ''; render(); } }, 6000);
    } }
    catch (error) { if (!disposed) feedback = error instanceof Error ? error.message : '変更を適用できません。入力を保持しています。'; }
    finally { busy = false; if (!disposed) render(); }
  }
  async function run(command: MetadataEdit, complete: () => void) {
    if (mutationBlock()) return;
    const token = provider().token;
    const undo = organization?.beginAction(command) ?? null;
    await perform(() => ports.dispatch(token, command), () => { organization?.recordAction(undo); complete(); });
  }
  async function runRetry() {
    if (busy || !pending || ports.readOnly || ports.otherPending()) return;
    const work = pending;
    await perform(() => ports.status().kind === 'failed' ? ports.retry() : work.action(), work.complete, work.owner);
  }
  function sceneBlock() {
    return mutationBlock() || (hasCaptionDraft(draft) || draft?.composing || panelInput() || mediaManager?.hasChanges() || composing || includeMemory().composing || pin || !!numericTarget || choosing || deletion || pickerScope || recovery?.hasChanges() || viewport.read().dragging ? '現在の入力・操作を完了してください。' : null);
  }
  function clearSceneEdit() { sceneEdit = null; sceneInputScope = null; sceneName.value = ''; }
  function beginSceneChange(kind: 'create' | 'rename' | 'default') {
    if (!guardInput()) return;
    const p = provider(), scene = p.state.scenes[sceneId];
    if (!scene || fieldValue(scene.lifecycle)?.state !== 'active' || kind === 'rename' && scene.name.kind !== 'value' || kind === 'default' && p.state.defaultSceneId.kind !== 'value') return;
    sceneEdit = { kind, token: p.token, sceneId, name: kind === 'create' ? '' : fieldValue(scene.name) ?? '', composing: false };
    sceneInputScope = { token: p.token, sceneId }; sceneManagement.open = true; render(); if (kind !== 'default') sceneName.focus();
  }
  const captureSceneInput = () => { if (!sceneEdit) sceneInputScope = { token: provider().token, sceneId }; };
  sceneName.addEventListener('focus', captureSceneInput); sceneName.addEventListener('pointerdown', captureSceneInput);
  function editSceneName(active = sceneEdit?.composing ?? false) {
    if (!sceneEdit) return;
    const settling = !!sceneEdit.composing && !active;
    if ((sceneBlock() || sceneEdit?.kind === 'default') && !settling) return;
    sceneEdit = { ...(sceneEdit ?? { kind: 'create', ...(sceneInputScope ?? { token: provider().token, sceneId }) }), name: sceneName.value, composing: active };
    render();
  }
  sceneName.addEventListener('input', () => editSceneName());
  sceneName.addEventListener('compositionstart', () => editSceneName(true));
  sceneName.addEventListener('compositionend', () => editSceneName(false));
  sceneForm.addEventListener('submit', event => {
    event.preventDefault(); const captured = sceneEdit, p = provider();
    if (!captured || sceneBlock() || captured.composing || captured.token !== p.token || captured.sceneId !== sceneId || captured.kind !== 'default' && !captured.name.trim()) return;
    try {
      let command: MetadataEdit;
      if (captured.kind === 'create') {
        const issues: Issue[] = [], edges = memberships(p.state, p.state.assetMemberships, sceneId, p.resources.assets, issues);
        if (issues.length) throw Error('モデルの登録を確認してからシーンを作成してください。');
        const orders = Object.values(p.state.scenes).filter(s => fieldValue(s.lifecycle)?.state !== 'deleted').map(s => {
          if (s.orderKey.kind !== 'value') throw Error('シーンの順序を確認してください。'); return s.orderKey.value;
        }).sort();
        command = { kind: 'createScene', sceneId: id('scn'), activeSceneId: sceneId, sourceSceneId: sceneId, name: captured.name,
          orderKey: ports.viewOrder(orders.at(-1) ?? null, null), membershipIds: edges.map(() => id('sam')), eventId: id('evt') };
      } else command = captured.kind === 'rename' ? { kind: 'renameScene', sceneId, name: captured.name } : { kind: 'setDefaultScene', sceneId };
      void run(command, () => {
        clearSceneEdit(); if (command.kind === 'createScene') { sceneId = command.sceneId; draft = null; }
        feedback = captured.kind === 'create' ? 'シーンを追加しました。' : captured.kind === 'rename' ? 'シーン名を変更しました。' : '開始シーンを設定しました。';
      });
    } catch (error) { feedback = (error as Error).message; render(); }
  });
  mediaInput.addEventListener('click', () => {
    if (guardInput() && memory().selectedCaptionId) { pickerScope = { token: provider().token, sceneId, captionId: memory().selectedCaptionId! }; render(); }
  });
  function canCancelMedia() {
    if (disposed || busy || ports.readOnly || ports.status().kind !== 'idle' || ports.otherPending() || windowMoving || composingInput()) return false;
    if (!pending) return true;
    return pending.owner === 'media' && !hasCaptionDraft(draft) && !pin && !numericTarget && !choosing && !deletion && !sceneEdit &&
      !panelInput() && !mediaManager?.hasChanges() && !recovery?.hasChanges() && !viewport.read().dragging;
  }
  function cancelMediaSelection() { if (canCancelMedia()) { if (pending?.owner === 'media') { pending = null; feedback = ''; } pickerScope = null; mediaInput.value = ''; heicHelp.hidden = true; render(); } }
  mediaInput.addEventListener('cancel', cancelMediaSelection);
  mediaInput.addEventListener('change', () => {
    const file = mediaInput.files?.[0], scope = pickerScope;
    if (!file || !scope || mutationBlock()) return;
    if (scope.token !== provider().token || scope.sceneId !== sceneId || scope.captionId !== memory().selectedCaptionId) { feedback = '対象が変わっています。元の記録を選び直してください。'; render(); return; }
    const orders = projectAttachments(provider(), scope.captionId).map(a => a.order).sort();
    const input = { ...scope, attachmentId: id('att'), eventId: id('evt'), orderKey: (orders.at(-1) ?? '') + 'U',
      file: { name: file.name, size: file.size, arrayBuffer: file.arrayBuffer.bind(file) } };
    const undo = organization?.beginAction({ kind: 'newMediaAttachment', captionId: scope.captionId, attachmentId: input.attachmentId }) ?? null;
    void perform(() => ports.addMedia(scope.token, input), () => { organization?.recordAction(undo); pickerScope = null; mediaInput.value = ''; heicHelp.hidden = true; resetDraft(); feedback = 'メディアを追加しました。'; }, 'media');
  });
  const modifiedPointer = (event: PointerEvent) => event.altKey || event.ctrlKey || event.metaKey;
  const invalidateGesture = () => { gesture = null; gestureGeneration++; };
  canvas.addEventListener('pointerdown', event => {
    if (disposed) return;
    pressedPointers.add(event.pointerId); invalidateGesture();
    const read = viewport.read(), direct = event.shiftKey && !pinAction && !dirty();
    if (pressedPointers.size === 1 && event.isPrimary && event.button === 0 && (choosing || direct) && !read.dragging) {
      viewport.reservePointer(true); canvas.setPointerCapture?.(event.pointerId);
    }
    if (pressedPointers.size !== 1 || !event.isPrimary || event.button !== 0 || modifiedPointer(event) || (!direct && !choosing) || mutationBlock() || composingInput()) return;
    const rect = canvas.getBoundingClientRect();
    if (!read.ready || read.dragging || read.token !== provider().token || !read.pickToken || !direct && !pinCurrent() ||
      ![event.clientX, event.clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return;
    gesture = { pointerId: event.pointerId, action: pinAction, token: read.token, sceneId, receipt: read.pickToken, x: event.clientX, y: event.clientY,
      left: rect.left, top: rect.top, width: rect.width, height: rect.height, generation: gestureGeneration, shifted: Boolean(event.shiftKey), color: addColorValue() };
  }, true);
  const cancelPointer = (event: PointerEvent) => { if (disposed) return; pressedPointers.delete(event.pointerId); invalidateGesture(); if (!pressedPointers.size) viewport.reservePointer(false); };
  canvas.addEventListener('pointercancel', cancelPointer, true);
  canvas.addEventListener('lostpointercapture', event => { if (pressedPointers.has(event.pointerId)) cancelPointer(event); }, true);
  const movePointer = (event: PointerEvent) => {
    if (disposed) return;
    if (gesture?.pointerId === event.pointerId && (Boolean(event.shiftKey) !== gesture.shifted || modifiedPointer(event) ||
      !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4)) invalidateGesture();
  };
  canvas.addEventListener('pointermove', movePointer, true);
  canvas.addEventListener('pointerup', event => {
    if (disposed) return;
    const down = gesture; movePointer(event); pressedPointers.delete(event.pointerId);
    if (!pressedPointers.size) viewport.reservePointer(false);
    if (!down || down !== gesture || !event.isPrimary || event.button !== 0 || down.pointerId !== event.pointerId || pressedPointers.size || modifiedPointer(event)) { invalidateGesture(); return; }
    gesture = null;
    queueMicrotask(() => {
      if (disposed || down.generation !== gestureGeneration || pressedPointers.size || down.action !== pinAction || down.sceneId !== sceneId || mutationBlock() || composingInput()) return;
      const direct = down.shifted && !down.action;
      if (direct ? dirty() || down.color !== addColorValue() : !choosing || !pinCurrent()) return;
      const read = viewport.read(), rect = canvas.getBoundingClientRect();
      if (!read.ready || read.dragging || read.token !== down.token || read.pickToken !== down.receipt || provider().token !== down.token ||
        rect.left !== down.left || rect.top !== down.top || rect.width !== down.width || rect.height !== down.height) return;
      try { const hit = viewport.pick(event.clientX - rect.left, event.clientY - rect.top, pinAction?.assetId ?? models?.selectedSurface() ?? undefined, direct);
        if (!hit) { feedback = '配置する面を特定できません。視点を変えて選び直してください。'; render(); return; }
        if (pinAction?.assetId && hit.target.assetId !== pinAction.assetId || hit.target.token !== provider().token || hit.target.sceneId !== sceneId || !hit.position.every(Number.isFinite)) return;
        if (direct) { pinAction = { kind: 'add', token: down.token, sceneId, captionId: null, color: down.color }; placingCaption = null; }
        setPin({ ...hit, point: pinAction?.kind === 'reparent' ? undefined : hit.point, captionId: placingCaption }); render();
      } catch (error) { feedback = (error as Error).message; render(); }
    });
  }, true);
  const cameraGizmo = createCameraGizmo(document, axis => viewAction(() => viewport.camera(axis)), () => viewAction(() => viewport.camera('fit')),event=>{
    if(event.phase==='end')return viewport.navigateCamera?.(event)??false;
    if(cameraNavigationBlocked()||event.phase==='begin'&&viewport.read().dragging)return false;
    try{return viewport.navigateCamera?.(event)??false;}catch(error){viewportFeedback=(error as Error).message;return false;}
  });
  cameraGizmo.root.append(views.cameraControls);stageDisplay.append(cameraGizmo.root);
  const cameraNavigationBlocked=()=>disposed||busy||!!pending||windowMoving||ports.otherPending()||composingInput()||pressedPointers.size>0;
  const viewBlocked = () => cameraNavigationBlocked() || viewport.read().dragging;
  function viewAction(action: () => void) {
    if (viewBlocked()) return;
    try { action(); viewportFeedback = ''; }
    catch (error) { viewportFeedback = error instanceof Error ? error.message : '3D表示を確認してください。'; }
    render();
  }
  function render() {
    if (disposed || rendering) return;cancelObservation();rendering = true;
    try {
      const p = provider(), blocked = mutationBlock(), selected = memory().selectedCaptionId;
      displayMode(root, ports.mode ?? (ports.readOnly ? 'view' : 'edit'));
      positionHeaderSheets();
      const summary = ports.projectStatus();
      projectTitle.textContent = summary.title?.trim() || '名前を確認できないプロジェクト';
      resumeNotice.textContent = ports.resumedLastProject?.() && summary.resumable && summary.title ? `最後のプロジェクトを再開しました：${summary.title}` : '';
      resumeNotice.hidden = !resumeNotice.textContent; otherProject.hidden = !ports.openProject;
      otherProject.disabled = busy || dirty() || ports.otherPending() || !!ports.presentation?.() || !!ports.projectNavigationBlocked?.();
      resumeStatus.textContent = busy || ports.status().kind === 'checking' ? '変更を適用中' : pending || ports.status().kind === 'failed' ? '更新が未完了です。入力を保持しています。再試行してください。' :
        draftInput() || panelInput() || recovery?.hasChanges() || mediaManager?.hasChanges() ? '未適用の変更' : summary.resumable ? '再開データあり' : '再開データを確認してください。';
      fileStatus.textContent = summary.backup === 'verified' ? '保存ファイルと一致' : summary.backup === 'unavailable' ? '保存ファイルを確認してください。' : 'ファイル未確認';
      const nextGestureContext = JSON.stringify([p.token, sceneId, ports.readOnly, ports.imageScope(), ports.otherPending(), models?.hidden(), memory().pinColors]);
      if (gestureContext !== nextGestureContext) { gestureContext = nextGestureContext; gesture = null; gestureGeneration++; }
      status.dataset.busy = String(busy); status.textContent = ports.status().kind === 'failed' ? ports.status().error || feedback : feedback;
      retry.hidden = !pending; retry.disabled = busy || ports.readOnly || ports.otherPending() || ports.status().retryable === false;
      revise.hidden = !pending || busy || ports.status().kind !== 'idle';
      scenes.replaceChildren();
      for (const scene of Object.values(p.state.scenes).sort((a, b) => {
        const left = fieldValue(a.orderKey), right = fieldValue(b.orderKey); return left === undefined ? right === undefined ? a.id.localeCompare(b.id) : 1 : right === undefined ? -1 : left < right ? -1 : left > right ? 1 : a.id.localeCompare(b.id);
      })) {
        if (fieldValue(scene.lifecycle)?.state !== 'active') continue;
        const choice = button(fieldValue(scene.name) ?? '名称を確認', () => { if (!dirty() && !busy && !ports.otherPending()) { sceneId = scene.id; draft = null; feedback = ''; render(); } });
        choice.disabled = busy || dirty() || ports.otherPending(); choice.setAttribute('aria-pressed', String(scene.id === sceneId)); scenes.append(choice);
      }
      if (!draft) draft = beginCaptionDraft(detailContext().source);
      list.render(listContext()); inclusion.render(includeContext()); detail.render({ ...detailContext(),
        editorFields: memory().selectedCaptionId ? ports.captionEditors?.(memory().selectedCaptionId!) : undefined,
        windowBlock: busy || pending || windowMoving || ports.otherPending() ? '現在の操作を完了してください。' : null });
      previousCaption.disabled = busy || ports.otherPending() || planCaptionList(listContext(), { kind: 'step', direction: 'previous' }).kind !== 'change';
      nextCaption.disabled = busy || ports.otherPending() || planCaptionList(listContext(), { kind: 'step', direction: 'next' }).kind !== 'change';
      windows.render({ source: listContext().source, memory: windowMemory(), selectedId: selected, moveBlock: windowBlock() });compareTools.hidden=windows.tools.hidden;
      addPin.disabled = !!blocked || dirty() || !sceneId;
      movePin.disabled = !!blocked || dirty() || !selected;movePin.hidden=!selected;
      movePin.textContent = selected && fieldValue(p.resources.captions[selected]?.anchor)?.kind === 'unplaced' ? 'ピンを配置' : '位置を調整';
      const pinActive = !!pinAction || !!pin || !!numericTarget || choosing;
      if (pinTask.hidden && pinActive) {
        compactSurface = 'stage'; const opening = pinAction;
        queueMicrotask(() => { if (!disposed && pinAction === opening && !pinTask.hidden && document.defaultView?.matchMedia?.('(max-width:760px)').matches) {
          const target = !coords.hidden && !coordinateInputs[0]!.disabled ? coordinateInputs[0]! : pinTask; target.tabIndex = target === pinTask ? -1 : 0; target.focus?.({preventScroll:true});
        } });
      }
      pinTask.hidden = !pinActive;
      coords.hidden = !pin && !numericTarget; finishPin.hidden = !pin && !numericTarget; cancelPin.hidden = !pin && !numericTarget && !choosing;
      finishPin.textContent = pinAction?.kind === 'reparent' ? '親モデルと位置を確定' : '位置を確定';
      finishPin.disabled = !!blocked || composingInput() || choosing || viewport.read().dragging || !positionValid() || !pinCurrent(); cancelPin.disabled = busy || !!pending || ports.status().kind !== 'idle' || ports.otherPending() || composingInput();
      repick.hidden = !pin; repick.disabled = !!blocked || composingInput() || !pinCurrent();
      const count = selected ? projectCaptionSceneCount(p, selected) : undefined;
      const selectedSurface=models?.selectedSurface(), gsTarget=selectedSurface?ports.modelDetails(sceneId,selectedSurface)?.gsProxyTarget:undefined;
      addSurface.hidden=!choosing||!gsTarget||gsTarget.expectedProxyId!==null;addSurface.disabled=busy||!!pending;
      pinStatus.textContent = [pinAction && !pinCurrent() ? '対象が更新されています。取り消して選び直してください。' : choosing ? gsTarget&&gsTarget.expectedProxyId===null?'このモデルの位置指定用の面を追加してください。本文や画像は面がなくても編集できます。':'配置先のモデルの面を選択してください。' : pin ? '位置を確認して確定してください。' : numericTarget ? 'X・Y・Zを入力してください。' : '',
        pinAction?.kind === 'reparent' && count?.kind === 'value' ? `${count.value}シーンに反映されます。変更先モデルがないシーンでは一覧のみになります。` : ''].filter(Boolean).join(' ');
      coordinateInputs.forEach((input, i) => { input.disabled = !!blocked || !pinCurrent(); if (!composing) input.value = rawPosition[i]!; });
      const scene = p.state.scenes[sceneId], start = fieldValue(p.state.defaultSceneId), staleScene = !!sceneEdit && (sceneEdit.token !== p.token || sceneEdit.sceneId !== sceneId);
      sceneName.disabled = !!sceneBlock(); if (!sceneEdit?.composing && sceneName.value !== (sceneEdit?.name ?? '')) sceneName.value = sceneEdit?.name ?? '';
      sceneForm.hidden = !sceneEdit; sceneActions.hidden = !!sceneEdit; newScene.disabled = !!blocked || dirty(); renameScene.disabled = !!blocked || dirty() || scene?.name.kind !== 'value';
      defaultScene.disabled = !!blocked || dirty() || p.state.defaultSceneId.kind !== 'value' || start === sceneId;
      sceneLabel.hidden = sceneEdit?.kind === 'default';
      createScene.textContent = sceneEdit?.kind === 'rename' ? '名前を確定' : sceneEdit?.kind === 'default' ? '開始シーンを設定' : 'シーンを追加';
      createScene.disabled = !!sceneBlock() || !sceneEdit || sceneEdit.composing || staleScene || sceneEdit.kind !== 'default' && !sceneEdit.name.trim() || !sceneId;
      cancelScene.hidden = !sceneEdit; cancelScene.disabled = busy || !!pending || ports.status().kind !== 'idle' || ports.otherPending() || !!sceneEdit?.composing;
      sceneNote.textContent = sceneEdit?.kind === 'create' ? 'このシーンのモデルを引き継ぎます。キャプションは追加されません。' : sceneEdit?.kind === 'default' ? '次にプロジェクトを開くときの開始シーンにします。' : ''; sceneNote.hidden = !sceneNote.textContent;
      sceneStatus.textContent = staleScene ? '内容が更新されています。入力は保持しています。取り消して選び直してください。' : start ? `開始シーン：${fieldValue(p.state.scenes[start]?.name) ?? '名称を確認'}` : '開始シーンの状態を確認してください。';
      mediaInput.disabled = !!blocked || !!sceneEdit || includeMemory().composing || !!deletion || panelInput() || !!mediaManager?.hasChanges() || hasCaptionDraft(draft) || !!pin || !!numericTarget || choosing || !!recovery?.hasChanges() || !selected;
      mediaDraftNotice.hidden = !hasCaptionDraft(draft);
      cancelMedia.hidden = !pickerScope; cancelMedia.disabled = !canCancelMedia();
      mediaManager!.render();
      recovery!.render();
      organization!.render();
      body.setAttribute('aria-busy', String(busy)); body.inert = busy;
      const resolved = sceneId ? resolveScene(p.state, p.resources, sceneId) : null;
      viewport.update({ token: p.token, sceneId, selectedId: selected, pin, choosing,
        pinColors: memory().pinColors, hiddenAssetIds: models!.hidden(), model: models!.proposal(), windowMoving,
        available: resolved?.kind === 'ready', readOnly: !!blocked || resolved?.kind !== 'ready', comparison: recovery!.comparison() });
      renderCaptionActions();
      for (const [key, tab] of tabButtons) { tab.setAttribute('aria-selected', String(task === key)); tab.tabIndex = task === key ? 0 : -1;
        tab.disabled = busy || !!pending || windowMoving || ports.otherPending() || composingInput(); }
      captionPanel.hidden = task !== 'captions'; for (const [key, panel] of panels) { panel.root.hidden = key==='views'?!cameraPositions.open:key !== task; if (key === task||key==='views') panel.render(); }
      sidebar.dataset.task=task;closeCamera.disabled=viewBlocked()||views.composing();
      sceneContext.textContent = `シーン：${fieldValue(p.state.scenes[sceneId]?.name) ?? '名称を確認'}`; sceneContext.hidden = true;
      const hasCaptionInput = draftInput() || !!mediaManager?.hasChanges() || !!recovery?.hasChanges() || !!organization?.hasChanges();
      const settingsInput=organization!.hasChanges() && organization!.inputOwner()==='settings';
      const other = [...panels].find(([key, panel]) => key !== task && !(key==='views'&&cameraPositions.open&&stageVisible()) && panel.hasChanges());
      retainedOwner = settingsInput ? task : hasCaptionInput && task !== 'captions' ? 'captions' : other?.[0] ?? task;
      retainedEdit.hidden = retainedOwner === task && !organization!.hasChanges();
      retainedNote.textContent = `${settingsInput?'設定':retainedOwner==='views'?'カメラ位置':tabButtons.get(retainedOwner)?.textContent ?? 'キャプション'}に未適用の変更があります。`;
      detailHeading.textContent = selected ? fieldValue(p.resources.captions[selected]?.title) || '名称なし' : 'キャプション';
      detailPane.hidden = false;list.root.hidden = false;sceneArea.hidden = false;captionBack.hidden = true;openDetail.hidden = true;
      captionBack.disabled = openDetail.disabled = returnToEdit.disabled = showStage.disabled = showPanel.disabled = viewBlocked();
      body.dataset.surface = compactSurface; showStage.setAttribute('aria-pressed', String(compactSurface === 'stage')); showPanel.setAttribute('aria-pressed', String(compactSurface === 'panel'));
      const seen = viewport.read();
      const extent = canvas.getBoundingClientRect?.() ?? { width: 0, height: 0 };
      windows.project({ ready: seen.ready, sourceToken: seen.token, sceneId: seen.sceneId, width: extent.width, height: extent.height, pins: seen.pins });
      viewportStatus.dataset.busy = String(!!ports.presentation?.()?.busy || !!seen.loading);
      canvas.setAttribute('aria-busy', viewportStatus.dataset.busy);
      viewportStatus.textContent = [ports.presentation?.()?.reason, viewportFeedback, seen.issue, seen.notice, resolved?.kind !== 'ready' && 'シーンを選択し、表示状態を確認してください。'].filter(Boolean).join(' ');
      viewportStatus.hidden = !viewportStatus.textContent;
      retryViewport.hidden = !seen.issue && !viewportFeedback&&!seen.retryAvailable; retryViewport.disabled = viewBlocked();
      let camera: unknown=seen.camera; try { camera ??= viewport.capture().camera; } catch { /* Preparation has no camera yet. */ }
      cameraGizmo.render({ camera, axis: seen.view?.kind === 'ready' ? seen.view.axis : null, blocked: !(seen.cameraReady??seen.ready)||viewBlocked(),navigationBlocked:cameraNavigationBlocked()||!(seen.cameraReady??seen.ready),navigating:seen.navigating,navigationAvailable:!!viewport.navigateCamera });
      markers.replaceChildren();
      for (const projected of seen.pins) if (seen.ready && seen.token === p.token && seen.sceneId === sceneId && projected.visible && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
        const caption = p.resources.captions[projected.id]; if (!caption) continue;
        const marker = button(fieldValue(caption.title) || '名称なし', () => { if (!dirty() && !busy && !ports.otherPending()) { selectCaption(projected.id); render(); } });
        marker.className = 'lv-project-marker'; marker.style.left = `${projected.x}px`; marker.style.top = `${projected.y}px`;
        marker.style.transform = `translate(-50%, -50%) scale(${projected.scale ?? 1})`; if (projected.color) marker.style.backgroundColor = projected.color;
        marker.setAttribute('data-review', String(projected.status === 'needsReview'));
        marker.style.setProperty?.('--lv-pin-color', projected.color ?? '#a08045');
        if (projected.status === 'needsReview') {
          marker.setAttribute('aria-description', projected.notice ?? '要確認'); marker.title = `${marker.textContent}（${projected.notice ?? '要確認'}）`;
        }
        marker.setAttribute('aria-pressed', String(projected.id === selected)); marker.style.zIndex = projected.id === selected ? '2' : '1'; markers.append(marker);
      }
      positionRecordSheets();ports.changed();
    } finally { rendering = false; if (renderAgain) { renderAgain = false; render(); } }
  }
  mounted = true; render();
  return { root, headerActions, projectNavigation: otherProject, utilityArea: settingsSheet, clearNotice(){if(!pending&&ports.status().kind==='idle')feedback='';}, dismissDisclosures(){help.open=false;organization!.settingsRoot.open=false;}, setExternalBusy: (active:boolean) => { body.inert=busy||active; }, render, session: interaction, activeScene: () => sceneId, inputPending: () => dirty() || busy,
    hasChanges: () => dirty() || busy || !!pending,
    unmount() { if (disposed) return; disposed = true;document.removeEventListener?.('pointerdown',closeRecordSheets,true);document.removeEventListener?.('focusin',closeRecordSheets);otherProject.remove();document.defaultView?.clearTimeout(feedbackTimer);document.defaultView?.removeEventListener('resize',positionHeaderSheets);document.defaultView?.removeEventListener('resize',render);cameraGizmo.dispose();stopHelp();cancelObservation();storageEpoch++; gesture = null; gestureGeneration++; pressedPointers.clear(); viewport.reservePointer(false); recovery?.dispose(); organization?.dispose(); windows.dispose(); mediaManager?.dispose(); mediaViewer.dispose(); viewport.dispose(); list.dispose(); inclusion.dispose(); detail.dispose(); for (const panel of panels.values()) panel.dispose(); root.remove(); } };
}
