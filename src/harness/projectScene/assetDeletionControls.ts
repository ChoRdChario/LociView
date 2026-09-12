import type { SyntheticSession } from './session';

/** Dependency inspection and confirmation in the existing model panel; no cascade. */
export function createAssetDeletionControls(document: Document, session: SyntheticSession, changed: () => void) {
  const root = document.createElement('section'); root.setAttribute('aria-label', 'モデルの削除');
  const button = (text: string, action: () => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.addEventListener('click', () => { if (!b.disabled) { action(); changed(); } }); return b;
  };
  const begin = button('プロジェクトから削除', () => { session.beginAssetDeletion(); });
  const panel = document.createElement('section'); panel.setAttribute('aria-label', 'モデル削除の確認');
  const title = document.createElement('p'), list = document.createElement('ul'), note = document.createElement('p');
  note.setAttribute('role', 'status');
  const confirm = button('削除する', () => { session.confirmAssetDeletion(); });
  const cancel = button('取り消す', () => { session.cancelAssetDeletion(); });
  panel.append(title, list, note, confirm, cancel); root.append(begin, panel);
  const render = () => {
    root.hidden = !session.assetDeletionAvailable || session.session.task !== 'models';
    const d = session.modelDeletion, stale = !!d && d.token !== session.snapshot.state.token;
    begin.hidden = !!d; panel.hidden = !d;
    begin.disabled = !session.modelContext().memory.assetId || session.readOnly || !!session.pending || session.modelDeletionBlocked;
    confirm.disabled = !d || !!d.impact.dependencies.length || stale || session.readOnly || session.pending !== 'text' || session.modelDeletionBlocked;
    cancel.disabled = !!session.workingBlock;
    if (!d) return;
    title.textContent = `「${d.name}」をプロジェクトから削除しますか？`;
    list.replaceChildren(...d.impact.dependencies.map(dependency => {
      const li = document.createElement('li');
      const field = dependency.kind === 'scene' && dependency.sceneId ? session.snapshot.state.scenes[dependency.sceneId]?.name :
        dependency.kind === 'caption' ? session.snapshot.resources.captions[dependency.id]?.title : null;
      const name = field?.kind === 'value' ? field.value : dependency.id;
      li.textContent = `${dependency.kind === 'scene' ? 'シーンの登録' : dependency.kind === 'caption' ? 'キャプション' : 'マテリアル設定'}：${name}${dependency.uncertain ? '（参照の確認が必要）' : ''}`;
      return li;
    }));
    note.textContent = stale ? '内容が更新されています。取り消して、参照を確認し直してください。' : d.impact.dependencies.length ?
      '参照が残っているため削除できません。削除を取り消してから、シーンの登録やマテリアル設定を解除してください。キャプションを残す場合は、このモデルも残してください。要確認の参照は自動修復しません。' :
      '参照している項目はありません。モデルを削除しますが、本体と履歴は保持します。この画面では元に戻せません。';
  };
  return { root, render };
}
