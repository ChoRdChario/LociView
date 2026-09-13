import type { createValidationModeHost } from './validationModeHost';
import type { SyntheticSession } from './session';
import { createValidationOutputControls } from './validationOutputControls';

/** One file/recovery area, available even before a Scene editor can mount. */
export function createValidationReceiveControls(document: Document, host: ReturnType<typeof createValidationModeHost>,
  session: () => SyntheticSession | undefined, changed: () => void, recovered: () => Promise<void>, otherInput: () => boolean = () => false) {
  const root = document.createElement('section'), heading = document.createElement('h2'), form = document.createElement('form');
  heading.textContent = '更新ファイル'; root.setAttribute('aria-label', '更新ファイル');
  const label = document.createElement('label'), labelText = document.createElement('span'), input = document.createElement('input'), submit = document.createElement('button');
  labelText.textContent = '更新ファイルを選択'; input.type = 'file'; input.setAttribute('aria-label', '更新ファイルを選択'); label.append(labelText, input);
  submit.type = 'submit'; submit.textContent = '更新を受け取る';
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = '選択を取り消す';
  const help = document.createElement('p'); help.textContent = '同じプロジェクトの作業一式を統合します。元ファイルは変更しません。';
  const status = document.createElement('p'), jobs = document.createElement('section'); status.setAttribute('role', 'status');
  form.append(label, submit, clear); root.append(heading, help, form, status, jobs);
  let busy = false, disposed = false, feedback = '', selectedJob: string | null = null, cancel: { id: string; stale: boolean } | null = null;
  const output = createValidationOutputControls(document, host, session, changed, () => otherInput() || busy || !!input.files?.length || !!selectedJob || !!cancel);
  root.append(output.root);
  const guard = (recovery: boolean) => {
    const s = session();
    if (host.authority.readOnly) throw Error('閲覧中は受信できません。編集を開始してください。');
    if (otherInput() || s?.interactionPending || s && s.acknowledgment.state !== 'idle') throw Error('入力・操作を確定するか、取り消してから受信してください。');
    if (!recovery && host.hasPending()) throw Error('中断した更新を先に確認してください。');
  };
  const perform = (action: () => Promise<unknown>, recovery: boolean, completed: string) => {
    if (busy || output.hasChanges() || disposed) return;
    try { guard(recovery); } catch (error) { feedback = (error as Error).message; render(); return; }
    busy = true; feedback = '更新を確認しています。'; render(); changed();
    void (async () => {
      try {
        await action(); if (disposed) return;
        session()?.refreshHistory(); await recovered();
        input.value = ''; selectedJob = null; cancel = null; feedback = completed;
      } catch (error) { if (!disposed) feedback = error instanceof Error ? error.message : '受信できません。元のデータは保持しています。'; }
      finally { busy = false; if (!disposed) { render(); changed(); } }
    })();
  };
  const button = (parent: HTMLElement, text: string, action: () => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.disabled = busy || output.hasChanges() || !!host.authority.readOnly;
    b.addEventListener('click', () => { if (!b.disabled) action(); }); parent.append(b);
  };
  const render = () => {
    if (disposed) return;
    heading.textContent = host.workspaceFiles.initialImport ? '作業一式を開く' : '更新ファイル';
    root.setAttribute('aria-label', heading.textContent);
    help.textContent = host.workspaceFiles.initialImport ? '読み込み途中のデータは、元のファイルから再開できます。' :
      '同じプロジェクトの作業一式を統合します。元ファイルは変更しません。';
    output.render(); form.inert = busy || output.hasChanges(); submit.disabled = busy || output.hasChanges() || host.authority.readOnly || !input.files?.length;
    clear.disabled = busy; clear.hidden = !input.files?.length && !selectedJob;
    labelText.textContent = selectedJob ? '元のファイルを選び直す' : host.workspaceFiles.initialImport ? '作業一式を選択' : '更新ファイルを選択';
    input.setAttribute('aria-label', labelText.textContent);
    submit.textContent = selectedJob ? '受信を再開' : host.workspaceFiles.initialImport ? 'ファイルを開く' : '更新を受け取る';
    status.textContent = feedback || host.workspaceFiles.error || (host.authority.readOnly ? '閲覧中。受信するには編集を開始してください。' : '');
    jobs.replaceChildren();
    for (const job of host.workspaceFiles.jobs) {
      if (['abandoned', 'cancelled'].includes(job.state) || job.state === 'completed' && !host.workspaceFiles.error) continue;
      const row = document.createElement('section'), note = document.createElement('p');
      note.textContent = job.state === 'input-required' ? 'ファイルの読み込みが中断しました。元のファイルを選び直してください。' :
        job.state === 'unbound-input' ? '元のファイルを確認できません。この受信を取りやめ、新しく選択してください。' :
        job.state === 'stale' ? '受信前に手元の記録が更新されました。この受信を取りやめ、新しく受信してください。' :
        job.state === 'repair-required' ? '受信データを確認できません。元のデータは保持しています。修復が必要です。' :
        job.state === 'completed' ? '受信した更新の表示を再確認できます。' : '未完了の受信があります。';
      row.append(note); jobs.append(row);
      if (job.state === 'input-required') button(row, '元のファイルを選び直す', () => {
        selectedJob = job.id; input.value = ''; feedback = ''; render(); changed(); input.click();
      });
      if (job.state === 'incomplete' || job.state === 'completed') button(row, '受信を再開', () =>
        perform(() => host.workspaceFiles.retry(job.id), true, '更新を受け取りました。'));
      if (['input-required', 'unbound-input', 'stale'].includes(job.state)) button(row, 'この受信を取りやめる', () => {
        cancel = { id: job.id, stale: job.state === 'stale' }; render(); changed();
      });
    }
    if (cancel) {
      const target = cancel, note = document.createElement('p'); note.textContent = 'この受信を取りやめます。手元の記録と元ファイルは変更しません。'; jobs.append(note);
      button(jobs, '取りやめる', () => perform(() => target.stale ? host.workspaceFiles.cancelStale(target.id) :
        host.workspaceFiles.abandonInput(target.id), true, '受信を取りやめました。'));
      button(jobs, '戻る', () => { cancel = null; render(); changed(); });
    }
  };
  input.addEventListener('change', () => { feedback = ''; render(); changed(); });
  clear.addEventListener('click', () => { if (busy) return; input.value = ''; selectedJob = null; feedback = ''; render(); changed(); });
  form.addEventListener('submit', event => {
    event.preventDefault(); const file = input.files?.[0], token = host.read().source?.token, id = selectedJob;
    if (!file) { feedback = 'ファイルを選択してください。'; render(); return; }
    if (host.workspaceFiles.initialImport) {
      perform(() => id ? host.workspaceFiles.reselectImportedInput(id, file) : host.workspaceFiles.importWorkspace(file), true, '作業一式を読み込みました。');
    } else if (token) perform(() => id ? host.workspaceFiles.reselectInput(token, id, file) : host.workspaceFiles.receive(token, file), !!id, '更新を受け取りました。');
    else { feedback = '再開用データを確認してから受信してください。'; render(); }
  });
  render();
  return { root, render, busy: () => busy || output.busy(), hasChanges: () => busy || output.hasChanges() || !!input.files?.length || !!selectedJob || !!cancel,
    dispose: () => { disposed = true; output.dispose(); root.remove(); } };
}
