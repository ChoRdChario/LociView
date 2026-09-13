import type { createValidationModeHost } from './validationModeHost';
import type { SyntheticSession } from './session';

/** Same editor, deliberate file handoff. No receipt follows a browser download click. */
export function createValidationOutputControls(document: Document, host: ReturnType<typeof createValidationModeHost>,
  session: () => SyntheticSession | undefined, changed: () => void, otherBusy: () => boolean) {
  const root = document.createElement('section'), heading = document.createElement('h2'), actions = document.createElement('div'),
    status = document.createElement('p'), list = document.createElement('div'), select = document.createElement('input');
  heading.textContent = '作業一式を渡す'; root.setAttribute('aria-label', '作業一式を渡す'); status.setAttribute('role', 'status');
  select.type = 'file'; select.setAttribute('aria-label', '保存先のファイルを選択'); select.hidden = true;
  root.append(heading, actions, status, list, select);
  let busy = false, disposed = false, feedback = '', selected: string | null = null, cancellation: string | null = null;
  const urls: string[] = [];
  const perform = (action: () => Promise<unknown>, message: string, writes = true) => {
    if (disposed || busy || otherBusy()) return;
    const s = session();
    if (writes && host.authority.readOnly) { feedback = '編集を開始してから実行してください。'; render(); return; }
    if (s?.interactionPending || s && s.acknowledgment.state !== 'idle' || host.hasPending()) {
      feedback = '入力・操作を確定するか、取り消してから実行してください。'; render(); return;
    }
    busy = true; feedback = 'ファイルを確認しています。'; render(); changed();
    void (async () => {
      try { await action(); if (!disposed) { feedback = message; selected = null; cancellation = null; select.value = ''; } }
      catch (error) { if (!disposed) feedback = error instanceof Error ? error.message : 'ファイル処理を完了できません。'; }
      finally { busy = false; if (!disposed) { render(); changed(); } }
    })();
  };
  const button = (parent: HTMLElement, text: string, action: () => void, writes = true) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.disabled = busy || otherBusy() || writes && !!host.authority.readOnly;
    b.addEventListener('click', () => { if (!b.disabled) action(); }); parent.append(b);
  };
  const render = () => {
    if (disposed) return; actions.replaceChildren(); list.replaceChildren();
    button(actions, 'ファイルを作成', () => {
      const token = host.read().source?.token; if (token) perform(() => host.workspaceOutput.generate(token), '作業一式を生成しました。ファイルへの保存は未確認です。');
    });
    status.textContent = feedback || host.workspaceOutput.error;
    for (const [i, job] of host.workspaceOutput.jobs.entries()) {
      if (['cancelled', 'abandoned'].includes(job.state)) continue;
      const row = document.createElement('section'), text = document.createElement('p');
      const complete = job.state === 'generated' || job.state === 'file-verified';
      text.textContent = `作業一式 ${i + 1} — ${job.state === 'file-verified' ? '選択したファイルの内容を確認済み' : complete ? '生成済み・ファイルへの保存は未確認' :
        job.state === 'repair-required' ? '生成データを確認できません。元データは保持しています。' : 'ファイル生成が未完了です。'}`;
      row.append(text); list.append(row);
      if (job.token && job.token !== host.read().source?.token) {
        const older = document.createElement('p'); older.textContent = '作成後の変更はこのファイルに含まれません。'; row.append(older);
      }
      if (complete) {
        button(row, 'ダウンロード', () => perform(async () => {
          const blob = await host.workspaceOutput.download(job.id); if (disposed) return;
          const url = URL.createObjectURL(blob), a = document.createElement('a'); urls.push(url);
          a.href = url; a.download = 'LociView-workspace.zip'; a.hidden = true; root.append(a);
          try { a.click(); } finally { a.remove(); }
        }, 'ダウンロードを開始しました。保存先のファイルは未確認です。', false), false);
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '保存先のファイルを確認';
        details.append(summary); row.append(details);
        button(details, 'ファイルを選択', () => { selected = job.id; select.value = ''; select.click(); changed(); });
      } else if (job.state === 'incomplete') button(row, '生成を再開', () => perform(() => host.workspaceOutput.retry(job.id), '作業一式を生成しました。ファイルへの保存は未確認です。'));
      if (job.cancellable) button(row, '生成を取りやめる', () => { cancellation = job.id; render(); changed(); });
    }
    if (cancellation) {
      const id = cancellation, text = document.createElement('p'); text.textContent = 'この生成を取りやめます。プロジェクトと生成途中のデータは削除しません。'; list.append(text);
      button(list, '取りやめる', () => perform(() => host.workspaceOutput.cancel(id), '生成を取りやめました。'));
      button(list, '戻る', () => { cancellation = null; render(); changed(); });
    }
    if (selected) button(list, 'ファイル確認を取り消す', () => { selected = null; select.value = ''; render(); changed(); });
  };
  select.addEventListener('change', () => {
    const id = selected, file = select.files?.[0]; if (id && file) perform(() => host.workspaceOutput.verifyFile(id, file), '選択したファイルの内容を確認しました。');
  });
  render(); return { root, render, busy: () => busy, hasChanges: () => busy || !!selected || !!cancellation,
    dispose: () => { disposed = true; for (const url of urls) URL.revokeObjectURL(url); root.remove(); } };
}
