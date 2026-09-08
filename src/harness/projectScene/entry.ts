import { createDevelopmentWorkspace } from './workspace';
import { createTeamWorkspace } from './teamWorkspace';
import { createSyntheticViewport } from './viewport';
import '../../ui/projectScene/captionList.css';
import '../../ui/projectScene/captionDetail.css';
import '../../ui/projectScene/modelList.css';
import '../../ui/projectScene/captionActions.css';
import '../../ui/projectScene/viewControls.css';
import '../../ui/projectScene/materialControls.css';
import './workspace.css';

document.title = 'LociView — シーン編集・開発用';
document.documentElement.classList.add('lv-development-page');
const loading = document.createElement('p'); loading.textContent = '開発用の編集画面を準備しています。';
loading.setAttribute('role', 'status'); document.body.replaceChildren(loading);
// The candidate is serve-only. Even the Spark/PWA harness build must not adopt or precache it.
let factory: import('./historyPort').DevelopmentHistoryFactory | undefined;
let bootFailure = '';
if (import.meta.env.DEV) {
  try {
    factory = await (await import('../../../poc/scene-history/development-browser')).loadDevelopmentHistory();
  } catch (error) {
    bootFailure = error instanceof Error ? error.message : '更新エンジンを読み込めません。';
  }
}
// Do not replace an editable workspace after asynchronous initialization.
const workspace = factory ? createTeamWorkspace(document, factory, createSyntheticViewport) : (() => {
  const single = createDevelopmentWorkspace(document, undefined, { viewportFactory: createSyntheticViewport }), initial = single.session.snapshot;
  if (bootFailure) { single.session.message = `${bootFailure} 1人分の編集のみ利用できます。`; single.render(); }
  return { ...single, hasChanges: () => single.session.snapshot !== initial || single.session.pending !== null };
})();
document.body.replaceChildren(workspace.root);
// Refuse silent navigation loss once the user has edited, even though this host has no durable storage.
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (workspace.hasChanges()) {
    event.preventDefault(); event.returnValue = '';
  }
};
window.addEventListener('beforeunload', beforeUnload);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('beforeunload', beforeUnload); workspace.dispose();
  document.documentElement.classList.remove('lv-development-page');
});
