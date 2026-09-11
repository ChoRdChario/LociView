import type { SyntheticSession } from './session';

/** Ordinary Scene actions within the existing workspace; never a storage writer. */
export function createSceneAuthoringControls(document: Document, session: SyntheticSession, changed: () => void) {
  const root = document.createElement('details'), summary = document.createElement('summary'), actions = document.createElement('div');
  root.setAttribute('aria-label', 'シーンの管理'); summary.textContent = 'シーンを管理';
  const make = (text: string) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; return b; };
  const create = make('シーンを作成'), rename = make('名前を変更'), setDefault = make('開始シーンにする');
  const form = document.createElement('section'), label = document.createElement('label'), name = document.createElement('input');
  const note = document.createElement('p'), status = document.createElement('p'), apply = make('作成'), cancel = make('取り消す');
  form.setAttribute('aria-label', 'シーンの変更'); label.textContent = 'シーン名'; label.append(name); name.setAttribute('aria-label', 'シーン名');
  name.type = 'text'; note.id = `scene-authoring-${crypto.randomUUID()}`; form.setAttribute('aria-describedby', note.id);
  status.setAttribute('role', 'status'); actions.append(create, rename, setDefault); form.append(label, note, apply, cancel);
  root.append(summary, actions, form, status);
  const render = () => {
    root.hidden = !session.sceneAuthoringAvailable;
    const draft = session.sceneAuthoringDraft, scene = session.snapshot.state.scenes[session.sceneId], defaultScene = session.snapshot.state.defaultSceneId;
    const block = session.readOnly || !!session.pending;
    create.disabled = block; rename.disabled = block || scene?.name.kind !== 'value';
    setDefault.disabled = block || defaultScene.kind !== 'value' || defaultScene.value === session.sceneId;
    actions.hidden = !!draft; form.hidden = !draft;
    status.textContent = defaultScene.kind !== 'value' ? '開始シーンを確認してください。' : defaultScene.value === session.sceneId ? '開始シーン' : '';
    if (!draft) return;
    if (!draft.composing && name.value !== draft.name) name.value = draft.name;
    label.hidden = draft.kind === 'default';
    note.textContent = draft.kind === 'create' ? 'このシーンのモデルを引き継ぎます。キャプションは追加されません。' :
      draft.kind === 'default' ? '次にプロジェクトを開くときの開始シーンにします。' : '';
    note.hidden = !note.textContent;
    apply.textContent = draft.kind === 'create' ? '作成' : draft.kind === 'rename' ? '変更' : '設定';
    const stale = draft.token !== session.snapshot.state.token || draft.sceneId !== session.sceneId;
    name.disabled = session.readOnly || !!session.workingBlock;
    apply.disabled = name.disabled || draft.composing || stale || session.pending !== 'text' || draft.kind !== 'default' && !draft.name.trim();
    cancel.disabled = !!session.workingBlock || draft.composing;
    if (stale) status.textContent = '内容が更新されています。入力は保持しています。取り消して選び直してください。';
  };
  for (const [button, kind] of [[create, 'create'], [rename, 'rename'], [setDefault, 'default']] as const)
    button.addEventListener('click', () => { if (session.beginSceneAuthoring(kind)) { root.open = true; render(); if (kind !== 'default') name.focus(); } changed(); });
  name.addEventListener('input', () => { session.editSceneAuthoring(name.value); changed(); });
  name.addEventListener('compositionstart', () => { session.editSceneAuthoring(name.value, true); changed(); });
  name.addEventListener('compositionend', () => { session.editSceneAuthoring(name.value, false); changed(); });
  cancel.addEventListener('click', () => { session.cancelSceneAuthoring(); changed(); });
  apply.addEventListener('click', () => { if (!apply.disabled) session.applySceneAuthoring(); changed(); });
  return { root, render };
}
