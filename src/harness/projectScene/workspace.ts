import { createNavigationControls } from '../../ui/projectScene/navigationControls';
import { createCaptionListControls } from '../../ui/projectScene/captionListControls';
import { createCaptionDetailControls } from '../../ui/projectScene/captionDetailControls';
import { createModelListControls } from '../../ui/projectScene/modelListControls';
import { captionColorKey } from '../../ui/projectScene/captionListState';
import { SyntheticSession } from './session';
import { createPinModeControls } from '../../ui/projectScene/pinModeControls';
import { createModelUpdateControls, createPinCoordinateControls, createModelPlacementControls } from './developmentControls';
import { modelVersion } from './modelFixture';
import { createCaptionIncludeControls } from '../../ui/projectScene/captionIncludeControls';
import { createViewportHost, type ViewportFactory } from './viewportHost';
import { createMaterialControls } from '../../ui/projectScene/materialControls';
import { createMediaControls } from './mediaControls';

/** One mounted integration host. Components own their DOM; synthetic session owns all working/UI state. */
export function createDevelopmentWorkspace(document: Document, session = new SyntheticSession(),
  options: { team?: boolean; onAction?: () => void; viewportFactory?: ViewportFactory } = {}) {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
    const node = document.createElement(tag); node.textContent = text; return node;
  };
  const root = make('main'); root.className = 'lv-development';
  const header = make('header'); header.className = 'lv-development-header';
  const brand = make('span', 'LociView'); brand.className = 'lv-development-brand';
  const name = make('h1', 'シーンと記録の編集');
  const notice = make('p', '開発用・合成データのみ。変更は保存されず、再読み込みで失われます。');
  notice.className = 'lv-development-notice';
  const message = make('p'); message.className = 'lv-development-message';
  const working = make('section'), workingStatus = make('p'), retryWorking = make('button', '更新を再試行');
  working.setAttribute('aria-label', '更新の確認'); workingStatus.setAttribute('role', 'status');
  retryWorking.type = 'button'; working.append(workingStatus, retryWorking);
  retryWorking.addEventListener('click', () => { session.acknowledgment.retry(); afterAction(); });
  message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  const content = make('div'); content.className = 'lv-development-content';
  const stage = make('section'); stage.className = 'lv-development-stage'; stage.setAttribute('aria-label', 'シーンの構成');
  const composition = make('div'); composition.className = 'lv-development-composition';
  const sceneName = make('h2'), models = make('ul'), pinCount = make('p');
  const disconnected = make('p', '3D描画・ピン配置は未接続です。ここではシーンの構成を確認できます。');
  disconnected.className = 'lv-development-pending';
  composition.append(sceneName, models, pinCount, disconnected);
  const editor = make('section'); editor.className = 'lv-development-editor';
  const editorHeading = make('h2', 'キャプションの編集');
  const sidebar = make('aside'); sidebar.className = 'lv-development-sidebar'; sidebar.setAttribute('aria-label', '作業パネル');
  const materialPanel = make('section'), viewPanel = make('section');
  materialPanel.className = viewPanel.className = 'lv-development-pending-panel';
  materialPanel.append(make('h2', 'マテリアル'), make('p', '表面の選択・色の調整は未接続です。'));
  viewPanel.append(make('h2', '視点'), make('p', '全体表示・方向プリセット・保存した視点は未接続です。'));
  const footer = make('footer', options.team ?
    '更新の受信はこのページ内の2人分の編集だけが対象です。ファイルの読込・保存は未接続です。' :
    'ファイルの読込・保存・共同編集は未接続です。既存プロジェクトには触れません。');
  footer.className = 'lv-development-footer';
  let disposed = false;
  const afterAction = () => { render(); options.onAction?.(); };
  const navigation = createNavigationControls(document, plan => { session.acceptNavigation(plan); afterAction(); });
  const list = createCaptionListControls(document, plan => {
    const accepted = session.acceptList(plan); afterAction();
    if (accepted && plan.kind === 'change' && plan.intent === 'select') list.revealSelected();
  }, active => { session.setSearchComposing(active); afterAction(); });
  const detail = createCaptionDetailControls(document, event => { session.acceptDetail(event); afterAction(); });
  const modelList = createModelListControls(document, plan => {
    const accepted = session.acceptModel(plan); afterAction();
    if (accepted && plan.kind === 'change' && plan.action === 'select') modelList.revealSelected();
  });
  const modelUpdate = createModelUpdateControls(document, session, afterAction);
  const placement = createModelPlacementControls(document, session, afterAction);
  const pin = createPinModeControls(document, plan => { session.acceptPin(plan); afterAction(); });
  const coordinates = createPinCoordinateControls(document, session, afterAction);
  const numeric = make('details'), numericLabel = make('summary', '数値で調整');
  numeric.className = 'lv-development-numeric'; numeric.append(numericLabel, coordinates.root);
  const include = createCaptionIncludeControls(document, plan => { session.acceptInclude(plan); afterAction(); });
  const viewport = createViewportHost(document, session, afterAction, options.viewportFactory);
  const material = createMaterialControls(document, plan => { session.acceptMaterial(plan); afterAction(); });
  const media = createMediaControls(document, session.media, afterAction);
  header.append(brand, name, navigation.saveStatus);
  const pinHelp = make('p', 'モデルの面をShift＋クリックで追加。追加・移動中は矢印をドラッグして調整できます。');
  pinHelp.className = 'lv-development-pin-help';
  const information = make('details'), informationLabel = make('summary', 'シーンの構成');
  information.className = 'lv-development-information'; information.append(informationLabel, composition);
  editor.append(editorHeading, detail.root, media.root);
  const windowActions = make('section'); windowActions.className = 'lv-development-window-actions';
  windowActions.append(detail.windowActions, viewport.windowTools);
  stage.append(viewport.stageTools, pin.modeStrip, viewport.root, numeric, placement.modeStrip, information);
  viewPanel.replaceChildren(viewport.view);
  materialPanel.replaceChildren(material.root);
  sidebar.append(navigation.taskControl, navigation.sceneControl, navigation.sceneContext, pin.actions, pinHelp,
    list.root, windowActions, editor, include.root, modelList.root, placement.actions, modelUpdate.root, materialPanel, viewPanel);
  content.append(stage, sidebar); root.append(header, notice, working, message, content, footer);
  function render() {
    if (disposed) return;
    working.hidden = !session.workingBlock;
    workingStatus.textContent = session.workingBlock ? `${session.workingBlock}${session.acknowledgment.error ? ` ${session.acknowledgment.error}` : ''}` : '';
    retryWorking.hidden = session.acknowledgment.state !== 'failed';
    // Keep editors mounted and draft DOM intact, but prevent overlapping native input.
    content.inert = header.inert = !!session.workingBlock;
    content.setAttribute('aria-busy', String(session.acknowledgment.state === 'checking'));
    viewport.render(!root.hidden);
    // Session admission aggregates all component pending-input rules before a Scene change.
    // Refresh every mounted recipient even while hidden; never unmount an editor to change tabs.
    const captionContext = session.captionContext();
    const detailOkay = detail.render({ ...session.detailContext(),
      windowBlock: null });
    const listOkay = list.render(captionContext);
    const modelsOkay = modelList.render(session.modelContext());
    const materialOkay = material.render(session.materialContext());
    media.render();
    const pinsOkay = pin.render(session.pinContext()), includeOkay = include.render(session.includeContext()); coordinates.render(); modelUpdate.render(); placement.render();
    if (!detailOkay || !listOkay || !modelsOkay || !pinsOkay || !includeOkay || !materialOkay) {
      message.textContent = '入力中の状態を保持しています。操作を完了してから切り替えてください。';
      message.hidden = false; return;
    }
    navigation.render({ scenes: session.snapshot.state, session: session.session, pending: session.pending, save: { kind: 'unsaved' } });
    const task = session.session.task;
    editor.hidden = windowActions.hidden = navigation.sceneControl.hidden = pin.actions.hidden = task !== 'captions';
    navigation.sceneContext.hidden = task === 'captions';
    numeric.hidden = !session.pinCoordinates;
    pinHelp.hidden = task !== 'captions' || !!session.pinCoordinates;
    list.root.hidden = task !== 'captions'; modelList.root.hidden = task !== 'models';
    include.root.hidden = task !== 'captions';
    modelUpdate.root.hidden = task !== 'models';
    placement.actions.hidden = task !== 'models';
    materialPanel.hidden = task !== 'materials'; viewPanel.hidden = task !== 'views';
    // A second visible-list pass restores the desired inner scroll after a tab was hidden.
    if (task === 'captions') list.render(captionContext);
    if (task === 'models') modelList.render(session.modelContext());
    const current = session.composition;
    disconnected.textContent = viewport.pickingConnected ? '合成モデルの表示です。ピンの追加・移動中は、選んだモデルの面から位置を指定できます。' : viewport.connected ?
      '合成モデルの表示です。位置は座標で指定できます。3D上の位置選択は未接続です。' :
      '3D表示は未接続です。シーンの構成と座標入力を確認できます。';
    sceneName.textContent = current.name.kind === 'value' ? current.name.value : 'シーン名を確認';
    const names = current.assets.map(asset => {
      const version = modelVersion(asset.assetId, asset.projection.bindingId, session.modelVersions);
      return make('li', `${session.snapshot.modelNames[asset.assetId] ?? 'モデル名を確認'} — ${version?.label ?? '状態を確認'}${
        version ? ` ・ 位置 ${version.closure.binding.assetToProject.translation.join(' / ')}` : ''}`);
    });
    models.replaceChildren(...(names.length ? names : [make('li', 'このシーンにモデルはありません。')]));
    models.setAttribute('aria-label', 'シーンに含まれるモデル');
    const captions = captionContext.source.kind === 'ready' ? captionContext.source.captions : [];
    const intended = captions.filter(c => c.pin === 'visible' && (session.memory.pinColors === null ||
      session.memory.pinColors.includes(captionColorKey(c.color) ?? ''))).length;
    pinCount.textContent = `キャプション ${captions.length}件 ・ ピン表示対象 ${intended}件${viewport.connected ? '' : '（描画未接続）'}`;
    message.textContent = session.message; message.hidden = !session.message;
  }
  const unsubscribe = session.acknowledgment.subscribe(afterAction);
  render();
  return { root, session, render, dispose() {
    disposed = true; unsubscribe(); navigation.dispose(); list.dispose(); detail.dispose(); modelList.dispose();
    pin.dispose(); coordinates.dispose(); modelUpdate.dispose(); placement.dispose(); include.dispose(); viewport.dispose(); material.dispose(); media.dispose(); root.remove();
  } };
}
