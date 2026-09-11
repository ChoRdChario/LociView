import type { openMetadataHost } from './metadataHost';
import type { SyntheticSession } from './session';
import { createMetadataConflictControls } from './metadataConflictControls';

/** Labelled controls in the existing synthetic host, not a file-import interface. */
export function createMetadataReceiveControls(document: Document, host: Awaited<ReturnType<typeof openMetadataHost>>,
  session: SyntheticSession, changed: () => void) {
  const root = document.createElement('section'), receive = document.createElement('button');
  const note = document.createElement('p'), status = document.createElement('p');
  const conflicts = createMetadataConflictControls(document, host, session, () => { render(); changed(); });
  root.setAttribute('aria-label', '開発用の更新受信'); receive.type = 'button'; receive.textContent = '開発用の更新を受け取る';
  note.textContent = '合成データのタイトルを受信します。同じ更新は重複しません。';
  status.setAttribute('role', 'status'); root.append(receive, note, status, conflicts.root);
  const render = () => {
    const pending = session.pending;
    receive.disabled = session.readOnly || !!pending && pending !== 'text' || conflicts.composing();
    conflicts.render();
  };
  receive.addEventListener('click', () => {
    if (session.readOnly || session.pending && session.pending !== 'text' || conflicts.composing()) {
      status.textContent = session.readOnly ? 'このタブは閲覧専用です。' : '操作を終えてから受信してください。入力は保持しています。'; return;
    }
    const before = session.snapshot.state.token;
    session.applyWorking(() => host.receive(before), () => {
      session.refreshHistory(); status.textContent = before === session.snapshot.state.token ? '受信済みの更新です。' : '更新を受信しました。';
      render(); changed();
    }, error => { status.textContent = error instanceof Error ? error.message : '受信できません。入力は保持しています。'; render(); changed(); });
    render(); changed();
  });
  const unsubscribe = session.acknowledgment.subscribe(render);
  render(); return { root, render, hasChanges: conflicts.hasChanges, dispose: unsubscribe };
}
