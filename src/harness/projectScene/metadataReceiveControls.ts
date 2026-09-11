import type { openMetadataHost } from './metadataHost';
import type { SyntheticSession } from './session';
import { createMetadataConflictControls } from './metadataConflictControls';
import { createMetadataMembershipControls } from './metadataMembershipControls';

/** Labelled controls in the existing synthetic host, not a file-import interface. */
export function createMetadataReceiveControls(document: Document, host: Awaited<ReturnType<typeof openMetadataHost>>,
  session: SyntheticSession, changed: () => void) {
  const root = document.createElement('section'), receive = document.createElement('button');
  const note = document.createElement('p'), status = document.createElement('p');
  const conflicts = createMetadataConflictControls(document, host, session, () => { render(); changed(); });
  const memberships = createMetadataMembershipControls(document, host, session, conflicts.composing, () => { render(); changed(); });
  const demo = document.createElement('select'); demo.setAttribute('aria-label', '受信する合成更新');
  for (const [value, label] of [['title', 'タイトルの更新'], ['membership', 'シーンへの登録']]) {
    const option = document.createElement('option'); option.value = value!; option.textContent = label!; demo.append(option);
  }
  demo.value = 'title';
  root.setAttribute('aria-label', '開発用の更新受信'); receive.type = 'button'; receive.textContent = '開発用の更新を受け取る';
  status.setAttribute('role', 'status'); root.append(demo, receive, note, status, conflicts.root, memberships.root);
  const render = () => {
    const pending = session.pending;
    receive.disabled = session.readOnly || !!pending && pending !== 'text' || conflicts.composing();
    demo.disabled = !!session.workingBlock;
    note.textContent = demo.value === 'membership' ? '合成データの「入口の記録」を「設備の確認」に登録します。先に同じ登録を手元で行うと、重複の解消を確認できます。' :
      '合成データのタイトルを受信します。同じ更新は重複しません。';
    conflicts.render(); memberships.render();
  };
  demo.addEventListener('change', () => { status.textContent = ''; render(); });
  receive.addEventListener('click', () => {
    if (session.readOnly || session.pending && session.pending !== 'text' || conflicts.composing()) {
      status.textContent = session.readOnly ? 'このタブは閲覧専用です。' : '操作を終えてから受信してください。入力は保持しています。'; return;
    }
    const before = session.snapshot.state.token;
    const kind = demo.value === 'membership' ? 'membership' : 'title';
    session.applyWorking(() => host.receive(before, undefined, kind), () => {
      session.refreshHistory(); status.textContent = before === session.snapshot.state.token ? '受信済みの更新です。' : '更新を受信しました。';
      render(); changed();
    }, error => { status.textContent = error instanceof Error ? error.message : '受信できません。入力は保持しています。'; render(); changed(); });
    render(); changed();
  });
  const unsubscribe = session.acknowledgment.subscribe(render);
  render(); return { root, render, hasChanges: () => conflicts.hasChanges() || memberships.hasChanges(), dispose: unsubscribe };
}
