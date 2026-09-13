import type { createValidationModeHost } from './validationModeHost';
import type { SyntheticSession } from './session';

/** Same editor, deliberate file handoff. No receipt follows a browser download click. */
export function createValidationOutputControls(document: Document, host: ReturnType<typeof createValidationModeHost>,
  session: () => SyntheticSession | undefined, changed: () => void, otherBusy: () => boolean) {
  const root = document.createElement('section'), heading = document.createElement('h2'), actions = document.createElement('div'),
    commands = document.createElement('div'), status = document.createElement('p'), list = document.createElement('div'), select = document.createElement('input');
  heading.textContent = 'ファイルで渡す'; root.setAttribute('aria-label', 'ファイルで渡す'); status.setAttribute('role', 'status');
  select.type = 'file'; select.setAttribute('aria-label', '保存先のファイルを選択'); select.hidden = true;
  const nameField = document.createElement('label'), nameInput = document.createElement('input');
  nameField.textContent = '名前（任意）'; nameInput.type = 'text'; nameInput.setAttribute('aria-label', '名前（任意）'); nameField.append(nameInput);
  root.append(heading, actions, nameField, commands, status, list, select);
  let busy = false, disposed = false, feedback = '', selected: string | null = null, cancellation: string | null = null;
  let purpose: 'teamWorkspace' | 'contribution' | 'backup' = 'teamWorkspace', baseId = '', choicePending = false, checkpointName = '', composing = false;
  const resetChoice = () => { purpose = 'teamWorkspace'; baseId = ''; checkpointName = ''; choicePending = false; };
  const urls: string[] = [];
  const perform = (action: () => Promise<unknown>, message: string, writes = true, consumeChoice = false, completed?: () => void) => {
    if (disposed || busy || composing || otherBusy()) return;
    const s = session();
    if (writes && host.authority.readOnly) { feedback = '編集を開始してから実行してください。'; render(); return; }
    if (s?.interactionPending || s && s.acknowledgment.state !== 'idle' || host.hasPending()) {
      feedback = '入力・操作を確定するか、取り消してから実行してください。'; render(); return;
    }
    busy = true; feedback = 'ファイルを確認しています。'; render(); changed();
    void (async () => {
      try { await action(); if (!disposed) { feedback = message; if (consumeChoice) resetChoice(); completed?.(); } }
      catch (error) { if (!disposed) feedback = error instanceof Error ? error.message : 'ファイル処理を完了できません。'; }
      finally { busy = false; if (!disposed) { render(); changed(); } }
    })();
  };
  const button = (parent: HTMLElement, text: string, action: () => void, writes = true) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.disabled = busy || composing || otherBusy() || writes && !!host.authority.readOnly;
    b.addEventListener('click', () => { if (!b.disabled) action(); }); parent.append(b); return b;
  };
  const render = () => {
    if (disposed) return; actions.replaceChildren(); commands.replaceChildren(); list.replaceChildren();
    const label = document.createElement('label'), kind = document.createElement('select'); label.textContent = '渡す内容';
    kind.setAttribute('aria-label', '渡す内容');
    for (const [value, text] of [['teamWorkspace', '作業一式'], ['contribution', '変更分'], ['backup', 'バックアップ']]) {
      const option = document.createElement('option'); option.value = value!; option.textContent = text!; kind.append(option);
    }
    kind.value = purpose; kind.disabled = busy || composing || otherBusy() || !!host.authority.readOnly; label.append(kind); actions.append(label);
    nameField.hidden = purpose !== 'backup'; nameInput.disabled = busy || otherBusy() || !!host.authority.readOnly;
    if (!composing && nameInput.value !== checkpointName) nameInput.value = checkpointName;
    kind.addEventListener('change', () => {
      if (kind.disabled || !['teamWorkspace', 'contribution', 'backup'].includes(kind.value)) return;
      purpose = kind.value as typeof purpose; baseId = ''; choicePending = true; render(); changed();
    });
    const chosen = host.workspaceOutput.bases.find(b => b.selection.workspacePackageId === baseId);
    if (purpose === 'contribution') {
      const label = document.createElement('label'), base = document.createElement('select'), empty = document.createElement('option');
      label.textContent = '元にする作業一式'; base.setAttribute('aria-label', '元にする作業一式');
      empty.value = ''; empty.textContent = '選択してください'; base.append(empty);
      for (const choice of host.workspaceOutput.bases) {
        const option = document.createElement('option'); option.value = choice.selection.workspacePackageId; option.textContent = choice.label; base.append(option);
      }
      base.value = chosen ? baseId : ''; base.disabled = kind.disabled; label.append(base); actions.append(label);
      base.addEventListener('change', () => { if (!base.disabled) { baseId = base.value; choicePending = true; render(); changed(); } });
      const help = document.createElement('p'); help.textContent = host.workspaceOutput.bases.length ?
        '相手と共有した作業一式を選択してください。' : '先に作業一式を受け取るか、作成してください。'; actions.append(help);
    }
    const create = button(commands, 'ファイルを作成', () => {
      const token = host.read().source?.token; if (!token) return;
      if (purpose === 'contribution') {
        if (chosen) perform(() => host.workspaceOutput.generateContribution(token, chosen.selection), '変更分を生成しました。ファイルへの保存は未確認です。', true, true);
      } else if (purpose === 'backup') {
        const name = checkpointName.trim().normalize('NFC') || undefined;
        perform(() => host.workspaceOutput.generateBackup(token, name), 'バックアップを生成しました。ファイルへの保存は未確認です。', true, true);
      } else perform(() => host.workspaceOutput.generate(token), '作業一式を生成しました。ファイルへの保存は未確認です。', true, true);
    });
    create.disabled ||= purpose === 'contribution' && !chosen || !!selected || !!cancellation;
    if (choicePending) button(commands, '選択を取り消す', () => { resetChoice(); render(); changed(); });
    status.textContent = host.workspaceOutput.error || feedback;
    for (const [i, job] of host.workspaceOutput.jobs.entries()) {
      if (['cancelled', 'abandoned'].includes(job.state)) continue;
      const row = document.createElement('section'), text = document.createElement('p');
      const complete = job.state === 'generated' || job.state === 'file-verified';
      const name = job.purpose === 'contribution' ? '変更分' : job.purpose === 'backup' ? 'バックアップ' : '作業一式';
      text.textContent = `${name} ${job.label || i + 1} — ${job.state === 'file-verified' ? '選択したファイルの内容を確認済み' : complete ? '生成済み・ファイルへの保存は未確認' :
        job.state === 'repair-required' ? '生成データを確認できません。元データは保持しています。' : 'ファイル生成が未完了です。'}`;
      row.append(text); list.append(row);
      if (job.stale || job.token && job.token !== host.read().source?.token) {
        const older = document.createElement('p'); older.textContent = '作成後の変更はこのファイルに含まれません。'; row.append(older);
      }
      if (complete) {
        button(row, 'ダウンロード', () => perform(async () => {
          const blob = await host.workspaceOutput.download(job.id); if (disposed) return;
          const url = URL.createObjectURL(blob), a = document.createElement('a'); urls.push(url);
          a.href = url; a.download = job.purpose === 'contribution' ? 'LociView-contribution.zip' : job.purpose === 'backup' ? 'LociView-backup.zip' : 'LociView-workspace.zip'; a.hidden = true; root.append(a);
          try { a.click(); } finally { a.remove(); }
        }, 'ダウンロードを開始しました。保存先のファイルは未確認です。', false), false);
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '保存先のファイルを確認';
        details.append(summary); row.append(details);
        button(details, 'ファイルを選択', () => { selected = job.id; select.value = ''; select.click(); changed(); });
      } else if (job.state === 'incomplete') button(row, '生成を再開', () => perform(() => host.workspaceOutput.retry(job.id), `${name}を生成しました。ファイルへの保存は未確認です。`));
      if (job.cancellable) button(row, '生成を取りやめる', () => { cancellation = job.id; render(); changed(); });
    }
    if (cancellation) {
      const id = cancellation, text = document.createElement('p'); text.textContent = 'この生成を取りやめます。プロジェクトと生成途中のデータは削除しません。'; list.append(text);
      button(list, '取りやめる', () => perform(() => host.workspaceOutput.cancel(id), '生成を取りやめました。', true, false,
        () => { if (cancellation === id) cancellation = null; }));
      button(list, '戻る', () => { cancellation = null; render(); changed(); });
    }
    if (selected) button(list, 'ファイル確認を取り消す', () => { selected = null; select.value = ''; render(); changed(); });
  };
  select.addEventListener('change', () => {
    const id = selected, file = select.files?.[0]; if (id && file) perform(() => host.workspaceOutput.verifyFile(id, file), '選択したファイルの内容を確認しました。', true, false,
      () => { if (selected === id) { selected = null; select.value = ''; } });
  });
  // Keep this input mounted across refreshes, including native IME composition.
  nameInput.addEventListener('input', () => { if (!nameInput.disabled) { checkpointName = nameInput.value; choicePending = true; changed(); } });
  nameInput.addEventListener('compositionstart', () => { composing = true; choicePending = true; changed(); });
  nameInput.addEventListener('compositionend', () => { checkpointName = nameInput.value; composing = false; choicePending = true; changed(); });
  render(); return { root, render, busy: () => busy, hasChanges: () => busy || composing || choicePending || !!selected || !!cancellation,
    dispose: () => { disposed = true; for (const url of urls) URL.revokeObjectURL(url); root.remove(); } };
}
