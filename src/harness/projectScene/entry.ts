import { createDevelopmentWorkspace } from './workspace';
import { createTeamWorkspace } from './teamWorkspace';
import { createSyntheticViewport } from './viewport';
import '../../ui/projectScene/captionList.css';
import '../../ui/projectScene/captionDetail.css';
import '../../ui/projectScene/modelList.css';
import '../../ui/projectScene/captionActions.css';
import '../../ui/projectScene/viewControls.css';
import '../../ui/projectScene/materialControls.css';
import '../../ui/projectScene/projectWorkspace.css';
import './workspace.css';

document.title = 'LociView — シーン編集・開発用';
document.documentElement.classList.add('lv-development-page');
const loading = document.createElement('p'); loading.textContent = '開発用の編集画面を準備しています。';
loading.setAttribute('role', 'status'); document.body.replaceChildren(loading);
// The candidate is serve-only. Even the Spark/PWA harness build must not adopt or precache it.
let factory: import('./historyPort').WorkingHistoryFactory | undefined;
let bootFailure = '';
const url = new URL(location.href), savedMode = url.searchParams.get('storage') === 'saved';
const metadataMode = url.searchParams.get('storage') === 'metadata';
const validationMode = url.searchParams.get('storage') === 'validation';
let metadataWorkspace: Awaited<ReturnType<typeof import('./metadataBrowser')['createMetadataBrowserWorkspace']>> | undefined;
if (import.meta.env.DEV) {
  try {
    if (validationMode) {
      metadataWorkspace = await (await import('./validationBrowser')).createValidationBrowserWorkspace(document, url.searchParams.get('run') ?? undefined);
    } else if (metadataMode) {
      metadataWorkspace = await (await import('./metadataBrowser')).createMetadataBrowserWorkspace(document,
        url.searchParams.get('run') ?? '', url.searchParams.get('create') === '1');
      url.searchParams.delete('create'); history.replaceState(null, '', url);
    } else {
      factory = await (await import('../../../poc/scene-history/development-browser')).loadDevelopmentHistory(savedMode ?
        { run: url.searchParams.get('run') ?? '', create: url.searchParams.get('create') === '1' } : undefined);
      if (savedMode) { url.searchParams.delete('create'); history.replaceState(null, '', url); }
    }
  } catch (error) {
    bootFailure = error instanceof Error ? error.message : '更新エンジンを読み込めません。';
  }
}
// Do not replace an editable workspace after asynchronous initialization.
const workspace = metadataWorkspace ?? (factory ? createTeamWorkspace(document, factory, createSyntheticViewport) : savedMode || metadataMode || validationMode ? (() => {
  const root = document.createElement('section'), title = document.createElement('h1'), error = document.createElement('p');
  title.textContent = '保存した開発画面を開けません'; error.textContent = bootFailure || '開発サーバーで開いてください。';
  error.setAttribute('role', 'alert');
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '再読み込み';
  retry.addEventListener('click', () => location.reload());
  const note = document.createElement('p'); note.textContent = '保存データは削除していません。メモリ上の編集には切り替えていません。';
  root.append(title, error, note, retry);
  return { root, hasChanges: () => false, dispose: () => root.remove() };
})() : (() => {
  const single = createDevelopmentWorkspace(document, undefined, { viewportFactory: createSyntheticViewport }), initial = single.session.snapshot;
  if (bootFailure) { single.session.message = `${bootFailure} 1人分の編集のみ利用できます。`; single.render(); }
  return { ...single, hasChanges: () => single.session.snapshot !== initial || single.session.pending !== null };
})());
document.body.replaceChildren(workspace.root);
if (import.meta.env.DEV && !savedMode && !metadataMode && !validationMode) {
  const optIn = document.createElement('button'); optIn.type = 'button'; optIn.textContent = '保存・再開を試す';
  const help = document.createElement('p'); help.textContent = '別の合成データで開始します。いまの編集は移しません。';
  optIn.addEventListener('click', () => {
    if (workspace.hasChanges() && !window.confirm('この画面の未保存の編集を離れ、新しい合成データで保存を試しますか？')) return;
    const target = new URL(location.href); target.searchParams.set('storage', 'saved');
    target.searchParams.set('run', crypto.randomUUID().replaceAll('-', '')); target.searchParams.set('create', '1');
    location.assign(target.href);
  });
  const section = document.createElement('section'); section.append(optIn, help); workspace.root.prepend(section);
  const metadata = document.createElement('button'); metadata.type = 'button'; metadata.textContent = '新しい保存方式を試す';
  metadata.addEventListener('click', () => {
    if (workspace.hasChanges() && !window.confirm('未保存の編集を離れ、新しい合成データで保存を試しますか？')) return;
    const target = new URL(location.href); target.searchParams.set('storage', 'metadata');
    target.searchParams.set('run', crypto.randomUUID().replaceAll('-', '')); target.searchParams.set('create', '1');
    location.assign(target.href);
  });
  section.append(metadata);
}
if (import.meta.env.DEV && !validationMode) {
  const validate = document.createElement('button'); validate.type = 'button'; validate.textContent = '実ファイルで検証';
  validate.addEventListener('click', () => {
    if (workspace.hasChanges()) { window.alert('入力・保存を確定するか、取り消してから開いてください。'); return; }
    const target = new URL(location.href); target.searchParams.set('storage', 'validation');
    target.searchParams.delete('run'); target.searchParams.delete('create'); location.assign(target.href);
  });
  workspace.root.prepend(validate);
}
// Refuse silent loss of memory edits, unconfirmed input, or pending saved work.
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (workspace.hasChanges()) {
    event.preventDefault(); event.returnValue = '';
  }
};
window.addEventListener('beforeunload', beforeUnload);
// The new host releases its lock on pagehide; a BFCache return needs a fresh lease/read.
const onPageShow = (event: PageTransitionEvent) => { if ((metadataMode || validationMode) && event.persisted) location.reload(); };
window.addEventListener('pageshow', onPageShow);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('pageshow', onPageShow);
  window.removeEventListener('beforeunload', beforeUnload); workspace.dispose();
  document.documentElement.classList.remove('lv-development-page');
});
