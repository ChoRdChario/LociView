import { MetadataSourceError } from '../projectMetadata/format';
import type { createValidationModeHost } from './validationModeHost';
import type { WorkspaceFileInteraction } from '../ui/projectScene/projectWorkspacePorts';
import { createValidationOutputControls } from './validationOutputControls';

/** One file/recovery area, available even before a Scene editor can mount. */
export function createValidationReceiveControls(document: Document, host: ReturnType<typeof createValidationModeHost>,
  session: () => WorkspaceFileInteraction | undefined, changed: () => void, recovered: () => Promise<void>, otherInput: (recovery?:boolean) => boolean = () => false,
  restoreDisplay?: (retry: boolean) => Promise<void>) {
  const root = document.createElement('section'), heading = document.createElement('h2'), form = document.createElement('form');
  heading.textContent = '更新ファイル'; root.setAttribute('aria-label', '更新ファイル');
  const label = document.createElement('label'), labelText = document.createElement('span'), input = document.createElement('input'), submit = document.createElement('button');
  labelText.textContent = '更新ファイルを選択'; input.type = 'file'; input.setAttribute('aria-label', '更新ファイルを選択'); label.append(labelText, input);
  submit.type = 'submit'; submit.textContent = '更新を受け取る';
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = '選択を取り消す';
  const help = document.createElement('p'); help.textContent = '同じプロジェクトの作業一式・変更分を統合します。元ファイルは変更しません。';
  const status = document.createElement('p'), jobs = document.createElement('section'); status.setAttribute('role', 'status');
  form.append(label, submit, clear); root.append(heading, help, form, status, jobs);
  let busy = false, disposed = false, feedback = '', selectedJob: string | null = null, selectedCopy: string | null = null,
    cancel: { id: string; stale: boolean; review?: boolean } | null = null;
  const restoreArea = document.createElement('details'), restoreSummary = document.createElement('summary'), restoreLabel = document.createElement('label'),
    restoreInput = document.createElement('input'), restoreCommands = document.createElement('div'), restoreStatus = document.createElement('p');
  restoreSummary.textContent = 'バックアップから復元'; restoreLabel.textContent = 'バックアップを選択';
  restoreInput.type = 'file'; restoreInput.setAttribute('aria-label', 'バックアップを選択'); restoreLabel.append(restoreInput);
  restoreStatus.setAttribute('role', 'status'); restoreArea.append(restoreSummary, restoreLabel, restoreStatus, restoreCommands);
  let restorePrepared = false, restoreCancel = false;
  const restoreChanges = () => !!restoreInput.files?.length || restorePrepared || restoreCancel;
  const output = createValidationOutputControls(document, host, session, changed, () => otherInput() || busy || !!input.files?.length || !!selectedJob || !!cancel || restoreChanges());
  root.append(restoreArea, output.root);
  const guard = (recovery: boolean, restore = false) => {
    const s = session();
    if (host.authority.readOnly) throw Error('閲覧中は受信できません。編集を開始してください。');
    if (otherInput(recovery||restore) || s?.interactionPending || s && s.acknowledgment.state !== 'idle') throw Error('入力・操作を確定するか、取り消してから受信してください。');
    if (!recovery && host.hasPending()) throw Error('中断した更新を先に確認してください。');
  };
  const perform = (action: () => Promise<unknown>, recovery: boolean, completed: string) => {
    if (busy || output.hasChanges() || restoreChanges() || disposed) return;
    try { guard(recovery); } catch (error) { feedback = (error as Error).message; render(); return; }
    busy = true; feedback = '更新を確認しています。'; render(); changed();
    void (async () => {
      try {
        await action(); if (disposed) return;
        session()?.refreshHistory(); await recovered();
        input.value = ''; selectedJob = null; selectedCopy = null; cancel = null; feedback = completed;
      } catch (error) { if (!disposed) feedback = error instanceof MetadataSourceError &&
        ['receive-reselected-file', 'contribution-reselected-file'].includes(error.code) ?
        '中断前と異なるファイルです。読み込みを始めた元のファイルを選び直してください。' :
        error instanceof Error ? error.message : '受信できません。元のデータは保持しています。'; }
      finally { busy = false; if (!disposed) { render(); changed(); } }
    })();
  };
  const button = (parent: HTMLElement, text: string, action: () => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.disabled = busy || output.hasChanges() || !!host.authority.readOnly;
    b.addEventListener('click', () => { if (!b.disabled) action(); }); parent.append(b);
  };
  const performRestore = (action: () => Promise<void>, recovery: boolean, completed: string, consume = true) => {
    if (busy || disposed || output.hasChanges() || input.files?.length || selectedJob || cancel) return;
    try { guard(recovery,true); } catch (error) { feedback = (error as Error).message; render(); return; }
    busy = true; feedback = '復元を確認しています。'; render(); changed();
    void (async () => {
      try {
        await action(); if (disposed) return;
        if (consume) { restoreInput.value = ''; restorePrepared = false; restoreCancel = false; }
        await recovered(); feedback = completed;
      } catch (error) { if (!disposed) feedback = error instanceof Error ? error.message : '復元を完了できません。元のデータは保持しています。'; }
      finally { busy = false; if (!disposed) { render(); changed(); } }
    })();
  };
  const render = () => {
    if (disposed) return;
    const copies = host.workspaceFiles.reviewCopies, copyPending = !!host.workspaceFiles.reviewCopyError || copies.some(j => !['completed', 'abandoned'].includes(j.state));
    heading.textContent = copyPending ? '編集コピー' : host.workspaceFiles.initialImport ? 'ファイルを開く' : '更新ファイル';
    root.setAttribute('aria-label', heading.textContent);
    help.textContent = copyPending ? '中断したコピー作成を確認してください。元の閲覧用ファイルは変更していません。' : host.workspaceFiles.initialImport ? '読み込み途中のデータは、元のファイルから再開できます。' :
      '同じプロジェクトの作業一式・変更分を統合します。元ファイルは変更しません。';
    output.render(); form.inert = busy || output.hasChanges() || restoreChanges(); submit.disabled = busy || otherInput() || output.hasChanges() || restoreChanges() || host.authority.readOnly || !input.files?.length;
    clear.disabled = busy; clear.hidden = !input.files?.length && !selectedJob;
    form.hidden = copyPending && !selectedCopy;
    labelText.textContent = selectedCopy ? '元の閲覧用ファイルを選び直す' : selectedJob ? '元のファイルを選び直す' : host.workspaceFiles.initialImport ? 'ファイルを選択' : '更新ファイルを選択';
    input.setAttribute('aria-label', labelText.textContent);
    submit.textContent = selectedCopy ? 'コピー作成を再開' : selectedJob ? '受信を再開' : host.workspaceFiles.initialImport ? 'ファイルを開く' : '更新を受け取る';
    status.textContent = feedback || host.workspaceFiles.reviewCopyError || host.workspaceFiles.error || (host.authority.readOnly ? '閲覧中。受信するには編集を開始してください。' : '');
    jobs.replaceChildren();
    for (const copy of copies) {
      if (['completed', 'abandoned'].includes(copy.state)) continue;
      const row = document.createElement('section'), note = document.createElement('p');
      note.textContent = copy.state === 'incomplete' ? '編集コピーの作成が未完了です。' : copy.state === 'input-required' ? '元の閲覧用ファイルを選び直してください。' :
        copy.state === 'unbound-input' ? 'コピー作成を開始できませんでした。取りやめてから、元の閲覧用ファイルを開き直してください。' :
          'コピー作成の記録を確認できません。データは消さず、修復が必要な状態で保持しています。';
      row.append(note); jobs.append(row);
      if (copy.state === 'incomplete') button(row, 'コピー作成を再開', () => perform(() => host.workspaceFiles.retryReviewCopy(copy.id), true, '編集コピーを作成しました。ファイルへの保存はしていません。'));
      if (copy.state === 'input-required') button(row, '元の閲覧用ファイルを選び直す', () => {
        selectedCopy = copy.id; selectedJob = null; input.value = ''; feedback = ''; render(); changed(); input.click();
      });
      if (['input-required', 'unbound-input'].includes(copy.state)) button(row, 'コピー作成を取りやめる', () => { cancel = { id: copy.id, stale: false, review: true }; render(); changed(); });
    }
    const pendingReceive = host.workspaceFiles.jobs.some(job => !['abandoned', 'cancelled', 'completed'].includes(job.state));
    for (const job of host.workspaceFiles.jobs) {
      if (['abandoned', 'cancelled'].includes(job.state) || job.state === 'completed' && (!host.workspaceFiles.error || pendingReceive)) continue;
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
      const target = cancel, note = document.createElement('p'); note.textContent = target.review ? 'コピー作成を取りやめます。元ファイルは変更しません。' : 'この受信を取りやめます。手元の記録と元ファイルは変更しません。'; jobs.append(note);
      button(jobs, '取りやめる', () => perform(() => target.review ? host.workspaceFiles.abandonReviewCopy(target.id) : target.stale ? host.workspaceFiles.cancelStale(target.id) :
        host.workspaceFiles.abandonInput(target.id), true, '受信を取りやめました。'));
      button(jobs, '戻る', () => { cancel = null; render(); changed(); });
    }
    restoreArea.hidden = !host.backupRestore.enabled;
    if (host.backupRestore.pending || host.backupRestore.needsDisplay) restoreArea.open = true;
    restoreInput.disabled = busy || otherInput(true) || output.hasChanges() || host.authority.readOnly || host.backupRestore.pending;
    restoreStatus.textContent = host.backupRestore.error || (host.backupRestore.pending ? '復元が未完了です。' :
      host.backupRestore.needsDisplay ? '復元先の表示を再開してください。' : '統合ではなく、バックアップの状態に切り替えます。元の作業とファイルは残ります。');
    restoreCommands.replaceChildren();
    if (host.backupRestore.retryable) button(restoreCommands, '復元を再開', () => performRestore(async () => {
      if (!restoreDisplay) throw Error('復元先の表示に接続できません。'); await restoreDisplay(true);
    }, true, 'バックアップから復元しました。ファイルへの反映はしていません。'));
    if (host.backupRestore.cancellable) button(restoreCommands, '復元を取りやめる', () => { restoreCancel = true; render(); changed(); });
    if (restoreCancel) {
      const note = document.createElement('p'); note.textContent = '復元を取りやめ、現在の作業を続けます。'; restoreCommands.append(note);
      button(restoreCommands, '取りやめる', () => performRestore(() => host.backupRestore.cancel(), true, '復元を取りやめました。'));
      button(restoreCommands, '戻る', () => { restoreCancel = false; render(); changed(); });
    } else if (!host.backupRestore.pending && !host.backupRestore.needsDisplay) {
      if (restorePrepared) {
        const note = document.createElement('p'); note.textContent = '現在の作業から、このバックアップの状態へ切り替えますか？'; restoreCommands.append(note);
        button(restoreCommands, 'このバックアップから復元', () => performRestore(async () => {
          if (!restoreDisplay) throw Error('復元先の表示に接続できません。'); await restoreDisplay(false);
        }, false, 'バックアップから復元しました。ファイルへの反映はしていません。'));
      } else if (restoreInput.files?.length) button(restoreCommands, '内容を確認', () => performRestore(async () => {
        const file = restoreInput.files?.[0]; if (!file) throw Error('バックアップを選択してください。');
        await host.backupRestore.prepare(file); restorePrepared = true;
      }, false, '復元内容を確認してください。', false));
      if (restoreChanges()) button(restoreCommands, '復元の選択を取り消す', () => {
        host.backupRestore.clearPreparation(); restoreInput.value = ''; restorePrepared = false; feedback = ''; render(); changed();
      });
    }
  };
  restoreInput.addEventListener('change', () => {
    if (busy) return; host.backupRestore.clearPreparation(); restorePrepared = false; feedback = ''; render(); changed();
  });
  input.addEventListener('change', () => { feedback = ''; render(); changed(); });
  clear.addEventListener('click', () => { if (busy) return; input.value = ''; selectedJob = null; selectedCopy = null; feedback = ''; render(); changed(); });
  form.addEventListener('submit', event => {
    event.preventDefault(); const file = input.files?.[0], token = host.read().source?.token, id = selectedJob;
    if (!file) { feedback = 'ファイルを選択してください。'; render(); return; }
    if (selectedCopy) {
      const copyId = selectedCopy; perform(() => host.workspaceFiles.reselectReviewCopy(copyId, file), true, '編集コピーを作成しました。ファイルへの保存はしていません。');
    } else if (host.workspaceFiles.initialImport) {
      perform(() => id ? host.workspaceFiles.reselectImportedInput(id, file) : host.workspaceFiles.importWorkspace(file), true, '作業一式を読み込みました。');
    } else if (token) perform(() => id ? host.workspaceFiles.reselectInput(token, id, file) : host.workspaceFiles.receive(token, file), !!id, '更新を受け取りました。');
    else { feedback = '再開用データを確認してから受信してください。'; render(); }
  });
  render();
  return { root, render, busy: () => busy || output.busy(), hasChanges: () => busy || output.hasChanges() || restoreChanges() || !!input.files?.length || !!selectedJob || !!selectedCopy || !!cancel,
    dispose: () => { disposed = true; output.dispose(); root.remove(); } };
}
