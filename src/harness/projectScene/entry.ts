import { createDevelopmentWorkspace } from './workspace';
import '../../ui/projectScene/captionList.css';
import '../../ui/projectScene/captionDetail.css';
import '../../ui/projectScene/modelList.css';
import './workspace.css';

document.title = 'LociView — シーン編集・開発用';
document.documentElement.classList.add('lv-development-page');
const workspace = createDevelopmentWorkspace(document);
document.body.replaceChildren(workspace.root);
// Refuse silent navigation loss once the user has edited, even though this host has no durable storage.
const initial = workspace.session.snapshot;
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (workspace.session.snapshot !== initial || workspace.session.pending !== null) {
    event.preventDefault(); event.returnValue = '';
  }
};
window.addEventListener('beforeunload', beforeUnload);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('beforeunload', beforeUnload); workspace.dispose();
  document.documentElement.classList.remove('lv-development-page');
});
