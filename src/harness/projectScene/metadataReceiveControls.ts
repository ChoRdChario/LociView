import type { openMetadataHost } from './metadataHost';
import type { SyntheticSession } from './session';
import { createMetadataConflictControls } from './metadataConflictControls';
import { createMetadataMembershipControls } from './metadataMembershipControls';
import { createMetadataAssetStatusControls } from './metadataAssetStatusControls';
import { createMetadataCaptionLifecycleControls } from './metadataCaptionLifecycleControls';

/** Labelled controls in the existing synthetic host, not a file-import interface. */
export function createMetadataReceiveControls(document: Document, host: Awaited<ReturnType<typeof openMetadataHost>>,
  session: SyntheticSession, changed: () => void) {
  const root = document.createElement('section'), receive = document.createElement('button');
  const note = document.createElement('p'), status = document.createElement('p');
  const review = document.createElement('section'), reviewNote = document.createElement('p'), reviewItems = document.createElement('ul');
  review.setAttribute('aria-label', '削除と参照の要確認'); reviewNote.setAttribute('role', 'status');
  reviewNote.textContent = '削除と編集、または参照先の状態を確認してください。元の変更は保持しています。キャプション本体以外の修復は未接続です。';
  review.append(reviewNote, reviewItems);
  const conflicts = createMetadataConflictControls(document, host, session, () => { render(); changed(); });
  const lifecycle = createMetadataCaptionLifecycleControls(document, host, session, conflicts.composing, () => { render(); changed(); });
  review.append(lifecycle.root);
  const memberships = createMetadataMembershipControls(document, host, session, conflicts.composing, () => { render(); changed(); });
  const assetMemberships = createMetadataMembershipControls(document, host, session, conflicts.composing, () => { render(); changed(); }, 'asset');
  const models = createMetadataAssetStatusControls(document, host, session, conflicts.composing, () => { render(); changed(); });
  const demo = document.createElement('select'); demo.setAttribute('aria-label', '受信する合成更新');
  for (const [value, label] of [['title', 'タイトルの更新'], ['membership', 'シーンへの登録'], ['model', 'モデルの更新'], ['assetMembership', 'モデルのシーン登録']]) {
    const option = document.createElement('option'); option.value = value!; option.textContent = label!; demo.append(option);
  }
  demo.value = 'title';
  root.setAttribute('aria-label', '開発用の更新受信'); receive.type = 'button'; receive.textContent = '開発用の更新を受け取る';
  status.setAttribute('role', 'status'); root.append(demo, receive, note, status, review, conflicts.root, memberships.root, models.root, assetMemberships.root);
  const render = () => {
    const pending = session.pending;
    const provider = host.read().provider;
    const issues = provider?.kind === 'scene-provider' ? provider.issues.filter(i => i.kind === 'orphan' || i.code === 'concurrent-delete-edit' || i.code === 'pending-orphan-reference' ||
      i.code === 'atomic-field-conflict' && i.path[2] === 'lifecycle' && ['assetsById', 'sceneAssetMembershipsById', 'materialOverridesById', 'captionsById', 'sceneCaptionMembershipsById', 'captionAttachmentsById', 'captionTagMembershipsById'].includes(i.path[0]!)) : [];
    lifecycle.render();
    review.hidden = !issues.length && !lifecycle.hasChanges() && !lifecycle.hasResult();
    reviewNote.hidden = !issues.length;
    reviewItems.replaceChildren(...[...new Set(issues.map(i => `${i.code === 'concurrent-delete-edit' ? '削除と編集が競合' : i.code === 'atomic-field-conflict' ? '削除・復元の状態が競合' : '参照先の確認が必要'}：${i.path.join(' / ')}`))].map(text => {
      const li = document.createElement('li'); li.textContent = text; return li;
    }));
    receive.disabled = session.readOnly || !!pending && pending !== 'text' || conflicts.composing();
    demo.disabled = !!session.workingBlock;
    note.textContent = demo.value === 'assetMembership' ? '合成データの「建物」を「設備の確認」に登録します。先に同じ登録を手元で行うと、重複の解消を確認できます。' :
      demo.value === 'model' ? '合成データの「設備」を更新します。先に手元で設備を移動すると、モデルと配置の競合を確認できます。' :
      demo.value === 'membership' ? '合成データの「入口の記録」を「設備の確認」に登録します。先に同じ登録を手元で行うと、重複の解消を確認できます。' :
      '合成データのタイトルを受信します。同じ更新は重複しません。';
    conflicts.render(); memberships.render(); models.render(); assetMemberships.render();
  };
  demo.addEventListener('change', () => { status.textContent = ''; render(); });
  receive.addEventListener('click', () => {
    if (session.readOnly || session.pending && session.pending !== 'text' || conflicts.composing()) {
      status.textContent = session.readOnly ? 'このタブは閲覧専用です。' : '操作を終えてから受信してください。入力は保持しています。'; return;
    }
    const before = session.snapshot.state.token;
    const kind = demo.value === 'assetMembership' ? 'assetMembership' : demo.value === 'model' ? 'model' : demo.value === 'membership' ? 'membership' : 'title';
    session.applyWorking(() => host.receive(before, undefined, kind), () => {
      session.refreshHistory(); status.textContent = before === session.snapshot.state.token ? '受信済みの更新です。' : '更新を受信しました。';
      render(); changed();
    }, error => { status.textContent = error instanceof Error ? error.message : '受信できません。入力は保持しています。'; render(); changed(); });
    render(); changed();
  });
  const unsubscribe = session.acknowledgment.subscribe(render);
  render(); return { root, render, hasChanges: () => conflicts.hasChanges() || lifecycle.hasChanges() || memberships.hasChanges() || models.hasChanges() || assetMemberships.hasChanges(),
    dispose: () => { unsubscribe(); conflicts.dispose(); lifecycle.dispose(); memberships.dispose(); models.dispose(); assetMemberships.dispose(); } };
}
