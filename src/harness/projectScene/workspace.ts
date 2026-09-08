import { createNavigationControls } from '../../ui/projectScene/navigationControls';
import { createCaptionListControls } from '../../ui/projectScene/captionListControls';
import { createCaptionDetailControls } from '../../ui/projectScene/captionDetailControls';
import { createModelListControls } from '../../ui/projectScene/modelListControls';
import { captionColorKey } from '../../ui/projectScene/captionListState';
import { SyntheticSession } from './session';

/** One mounted integration host. Components own their DOM; synthetic session owns all working/UI state. */
export function createDevelopmentWorkspace(document: Document, session = new SyntheticSession()) {
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
  const mediaNote = make('p', 'メディアの追加は未接続です。'); mediaNote.className = 'lv-development-pending';
  const sidebar = make('aside'); sidebar.className = 'lv-development-sidebar'; sidebar.setAttribute('aria-label', '作業パネル');
  const materialPanel = make('section'), viewPanel = make('section');
  materialPanel.className = viewPanel.className = 'lv-development-pending-panel';
  materialPanel.append(make('h2', 'マテリアル'), make('p', '表面の選択・色の調整は未接続です。'));
  viewPanel.append(make('h2', '視点'), make('p', '全体表示・方向プリセット・保存した視点は未接続です。'));
  const footer = make('footer', 'ファイルの読込・保存・共同編集は未接続です。既存プロジェクトには触れません。');
  footer.className = 'lv-development-footer';
  let disposed = false;
  const navigation = createNavigationControls(document, plan => { session.acceptNavigation(plan); render(); });
  const list = createCaptionListControls(document, plan => {
    const accepted = session.acceptList(plan); render();
    if (accepted && plan.kind === 'change' && plan.intent === 'select') list.revealSelected();
  }, active => { session.setSearchComposing(active); render(); });
  const detail = createCaptionDetailControls(document, event => { session.acceptDetail(event); render(); });
  const modelList = createModelListControls(document, plan => {
    const accepted = session.acceptModel(plan); render();
    if (accepted && plan.kind === 'change' && plan.action === 'select') modelList.revealSelected();
  });
  header.append(brand, name, navigation.sceneControl, navigation.saveStatus);
  editor.append(editorHeading, detail.root, mediaNote);
  stage.append(composition, editor);
  sidebar.append(navigation.taskControl, list.root, modelList.root, materialPanel, viewPanel);
  content.append(stage, sidebar); root.append(header, notice, message, content, footer);
  function render() {
    if (disposed) return;
    // Session admission aggregates all component pending-input rules before a Scene change.
    // Refresh every mounted recipient even while hidden; never unmount an editor to change tabs.
    const captionContext = session.captionContext();
    const detailOkay = detail.render({ ...session.detailContext(), retained: false,
      windowBlock: '複数ウィンドウ・ピンへの接続は未接続です。' });
    const listOkay = list.render(captionContext);
    const modelsOkay = modelList.render(session.modelContext());
    if (!detailOkay || !listOkay || !modelsOkay) {
      message.textContent = '入力中の状態を保持しています。操作を完了してから切り替えてください。';
      message.hidden = false; return;
    }
    navigation.render({ scenes: session.snapshot.state, session: session.session, pending: session.pending, save: { kind: 'unsaved' } });
    const task = session.session.task;
    list.root.hidden = task !== 'captions'; modelList.root.hidden = task !== 'models';
    materialPanel.hidden = task !== 'materials'; viewPanel.hidden = task !== 'views';
    // A second visible-list pass restores the desired inner scroll after a tab was hidden.
    if (task === 'captions') list.render(captionContext);
    if (task === 'models') modelList.render(session.modelContext());
    const current = session.composition;
    sceneName.textContent = current.name.kind === 'value' ? current.name.value : 'シーン名を確認';
    const names = current.assets.map(asset => make('li', session.snapshot.modelNames[asset.assetId] ?? 'モデル名を確認'));
    models.replaceChildren(...(names.length ? names : [make('li', 'このシーンにモデルはありません。')]));
    models.setAttribute('aria-label', 'シーンに含まれるモデル');
    const captions = captionContext.source.kind === 'ready' ? captionContext.source.captions : [];
    const intended = captions.filter(c => c.pin === 'visible' && (session.memory.pinColors === null ||
      session.memory.pinColors.includes(captionColorKey(c.color) ?? ''))).length;
    pinCount.textContent = `キャプション ${captions.length}件 ・ ピン表示対象 ${intended}件（描画未接続）`;
    message.textContent = session.message; message.hidden = !session.message;
  }
  render();
  return { root, session, render, dispose() {
    disposed = true; navigation.dispose(); list.dispose(); detail.dispose(); modelList.dispose(); root.remove();
  } };
}
