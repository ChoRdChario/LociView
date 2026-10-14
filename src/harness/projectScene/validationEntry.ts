import { createValidationBrowserWorkspace } from './validationBrowser';
import '../../ui/projectScene/captionList.css';
import '../../ui/projectScene/captionDetail.css';
import '../../ui/projectScene/modelList.css';
import '../../ui/projectScene/captionActions.css';
import '../../ui/projectScene/viewControls.css';
import '../../ui/projectScene/materialControls.css';
import './workspace.css';

// Dedicated static entry; never dispatch legacy or synthetic writers from URL state.
if (import.meta.env.MODE !== 'project-scene-validation') throw Error('専用の検証ビルドで開いてください。');
document.title = 'LociView — ファイル検証';
document.documentElement.classList.add('lv-development-page');
const loading = document.createElement('p'); loading.textContent = 'ファイル検証画面を準備しています。';
loading.setAttribute('role', 'status'); document.body.replaceChildren(loading);

let workspace: Awaited<ReturnType<typeof createValidationBrowserWorkspace>> | undefined;
try {
  const url = new URL(location.href);
  workspace = await createValidationBrowserWorkspace(document, url.searchParams.get('run') ?? undefined);
  document.body.replaceChildren(workspace.root);
} catch (error) {
  const root = document.createElement('section'), title = document.createElement('h1'), detail = document.createElement('p');
  title.textContent = '検証画面を開けません'; detail.setAttribute('role', 'alert');
  detail.textContent = error instanceof Error ? error.message : '保存領域を確認できません。';
  const note = document.createElement('p'); note.textContent = '保存データは削除していません。メモリ上の編集には切り替えていません。';
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '再読み込み';
  retry.addEventListener('click', () => location.reload()); root.append(title, detail, note, retry);
  document.body.replaceChildren(root);
}

const beforeUnload = (event: BeforeUnloadEvent) => {
  if (workspace?.hasChanges()) { event.preventDefault(); event.returnValue = ''; }
};
// The shared browser host releases its lease on pagehide. A restored page must reopen.
const pageShow = (event: PageTransitionEvent) => { if (event.persisted) location.reload(); };
window.addEventListener('beforeunload', beforeUnload);
window.addEventListener('pageshow', pageShow);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('beforeunload', beforeUnload);
  window.removeEventListener('pageshow', pageShow);
  workspace?.dispose(); document.documentElement.classList.remove('lv-development-page');
});
