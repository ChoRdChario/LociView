import type { SyntheticSession } from './session';

/** One destructive intent, separate from removing a single Scene membership. */
export function createCaptionDeletionControls(document: Document, session: SyntheticSession, changed: () => void) {
  const root = document.createElement('section'); root.setAttribute('aria-label', 'キャプションの削除');
  const makeButton = (text: string, action: () => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.addEventListener('click', () => { if (!b.disabled) { action(); changed(); } }); return b;
  };
  const begin = makeButton('プロジェクトから削除', () => { session.beginCaptionDeletion(); });
  const confirmation = document.createElement('section'); confirmation.setAttribute('aria-label', '削除の確認');
  const title = document.createElement('p'), effects = document.createElement('ul'), note = document.createElement('p');
  note.setAttribute('role', 'status');
  const confirm = makeButton('削除する', () => { session.confirmCaptionDeletion(); });
  const cancel = makeButton('取り消す', () => { session.cancelCaptionDeletion(); });
  confirmation.append(title, effects, note, confirm, cancel); root.append(begin, confirmation);
  const render = () => {
    root.hidden = !session.captionDeletionAvailable;
    const d = session.captionDeletion, stale = !!d && d.token !== session.snapshot.state.token;
    begin.hidden = !!d; confirmation.hidden = !d;
    begin.disabled = !session.memory.selectedCaptionId || session.readOnly || !!session.pending || session.captionDeletionBlocked;
    confirm.disabled = !d || stale || session.readOnly || session.pending !== 'text' || session.captionDeletionBlocked;
    cancel.disabled = !!session.workingBlock;
    if (!d) return;
    title.textContent = `「${d.title}」をプロジェクト全体から削除しますか？`;
    const rows = d.impact.memberships.map(e => {
      const name = session.snapshot.state.scenes[e.sceneId]?.name;
      return `シーン：${name?.kind === 'value' ? name.value : '名前を確認できません'}（${e.sceneId}）`;
    });
    rows.push(...d.impact.attachments.map(e => `添付：${e.id}（${e.mediaResourceId}）`),
      ...d.impact.tags.map(e => `タグの登録：${e.id}（${e.tagId}）`));
    effects.replaceChildren(...rows.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    note.textContent = stale ? '内容が更新されています。取り消して、影響を確認し直してください。' :
      `${d.impact.memberships.length}件のシーン登録・添付${d.impact.attachments.length}件・タグ登録${d.impact.tags.length}件も削除します。メディア本体は残ります。この画面では元に戻せません。`;
  };
  return { root, render };
}
