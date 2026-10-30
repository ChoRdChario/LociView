import type { createValidationModeHost } from './validationModeHost';
import { editOnly, displayMode } from '../ui/projectScene/modePresentation';
import type { WorkspaceFileInteraction } from '../ui/projectScene/projectWorkspacePorts';

/** Same editor, deliberate file handoff. No receipt follows a browser download click. */
export function createValidationOutputControls(document: Document, host: ReturnType<typeof createValidationModeHost>,
  session: () => WorkspaceFileInteraction | undefined, changed: () => void, otherBusy: () => boolean) {
  const root = document.createElement('section'), heading = document.createElement('h2'), actions = document.createElement('div'),
    commands = document.createElement('div'), status = document.createElement('p'), list = document.createElement('div'), select = document.createElement('input');
  heading.textContent = 'ファイル'; root.setAttribute('aria-label', 'ファイル'); status.setAttribute('role', 'status');
  status.className = 'lv-operation-status';
  root.className = 'lv-file-output'; actions.className = 'lv-file-intents'; commands.className = 'lv-file-commands';
  select.type = 'file'; select.setAttribute('aria-label', '保存先のファイルを選択'); select.hidden = true;
  const nameField = document.createElement('label'), nameInput = document.createElement('input');
  nameField.textContent = '名前（任意）'; nameInput.type = 'text'; nameInput.setAttribute('aria-label', '名前（任意）'); nameField.append(nameInput);
  const history = document.createElement('details'), historyTitle = document.createElement('summary'), completedFiles = document.createElement('div');
  historyTitle.textContent = '作成したファイル'; history.append(historyTitle, completedFiles);
  root.append(heading, actions, nameField, commands, status, list, history, select);
  editOnly(actions, nameField, commands, select);
  let busy = false, disposed = false, feedback = '', selected: string | null = null, cancellation: string | null = null;
  let completedFeedback = false;
  let presentation: 'all' | 'save' | 'share' = 'all';
  let purpose: 'teamWorkspace' | 'contribution' | 'backup' | 'clean' | 'review' = 'backup', baseId = '', choicePending = false, checkpointName = '', composing = false;
  let cleanPreview: Awaited<ReturnType<typeof host.workspaceOutput.previewClean>> | null = null;
  let reviewPreview: Awaited<ReturnType<typeof host.workspaceOutput.previewReview>> | null = null, sceneId = '', omitEntry = false;
  const resetChoice = () => { purpose = presentation === 'share' ? 'teamWorkspace' : 'backup'; baseId = ''; checkpointName = ''; choicePending = false; cleanPreview = null; reviewPreview = null; sceneId = ''; omitEntry = false; };
  const choosePurpose = (next: typeof purpose) => {
    if (purpose === next) return;
    if (completedFeedback) { feedback = ''; completedFeedback = false; }
    purpose = next; baseId = ''; cleanPreview = null; reviewPreview = null; sceneId = ''; omitEntry = false; choicePending = true; render(); changed();
  };
  const urls: string[] = [];
  const download = async (id: string) => {
    const job = host.workspaceOutput.jobs.find(job => job.id === id);
    if (!job) throw Error('作成したファイルを確認できません。');
    const blob = await host.workspaceOutput.download(id); if (disposed) return;
    const url = URL.createObjectURL(blob), a = document.createElement('a'); urls.push(url);
    a.href = url; a.download = job.purpose === 'contribution' ? 'LociView-contribution.zip' : job.purpose === 'backup' ? 'LociView-backup.zip' : job.purpose === 'clean' ? 'LociView-copy.zip' : job.purpose === 'review' ? 'LociView-review.zip' : 'LociView-workspace.zip';
    const label = Array.from((job.label ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()).slice(0, 80).join('').replace(/[. ]+$/, '');
    if (job.purpose === 'backup' && label) a.download = `LociView-${label}.zip`;
    a.hidden = true; root.append(a);
    try { a.click(); } finally { a.remove(); }
  };
  const handoffMessage = 'ダウンロードを開始しました。保存先で完了を確認してください。';
  const perform = (action: () => Promise<unknown>, message: string, writes = true, consumeChoice = false, completed?: () => void,
    workingMessage = 'ファイルを確認しています。') => {
    if (disposed || busy || composing || otherBusy()) return;
    const s = session();
    if (writes && host.authority.readOnly) { completedFeedback = false; feedback = '編集を開始してから実行してください。'; render(); return; }
    if (s?.interactionPending || s && s.acknowledgment.state !== 'idle' || host.hasPending()) {
      completedFeedback = false; feedback = '入力・操作を確定するか、取り消してから実行してください。'; render(); return;
    }
    completedFeedback = false; busy = true; feedback = workingMessage; render(); changed();
    void (async () => {
      try { await action(); if (!disposed) { feedback = message; completedFeedback = true; if (consumeChoice) resetChoice(); completed?.(); } }
      catch (error) { completedFeedback = false; if (!disposed) feedback = error instanceof Error ? error.message : 'ファイル処理を完了できません。'; }
      finally { busy = false; if (!disposed) { render(); changed(); } }
    })();
  };
  const button = (parent: HTMLElement, text: string, action: () => void, writes = true) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    if (writes) editOnly(b);
    b.disabled = busy || composing || otherBusy() || writes && !!host.authority.readOnly;
    b.addEventListener('click', () => { if (!b.disabled) action(); }); parent.append(b); return b;
  };
  const privacyNotice = (value: { includesDeclaredEditorNames?: boolean; requiresEditorAttributionReader?: boolean; requiresPortableMediaReader?: boolean }) => [value.includesDeclaredEditorNames ?
    '記録された編集者名を含みます。対応版のLociViewで開いてください。' : value.requiresEditorAttributionReader ?
    'この変更分を開くには編集者名の表示に対応したLociViewが必要です。今回の変更分に編集者名は含みません。' : '',
    value.requiresPortableMediaReader ? 'HEIC原本と表示用PNGの組に対応したLociViewで開いてください。' : ''].filter(Boolean).join(' ');
  const currentDisclosure = () => {
    const current = host.workspaceOutput.privacy, base = host.workspaceOutput.bases.find(b => b.selection.workspacePackageId === baseId);
    const requires = purpose === 'backup' ? current.backupIncludesNames : purpose === 'contribution' ? current.sourceIncludesNames || !!base?.includesDeclaredEditorNames : purpose === 'teamWorkspace' ? current.sourceIncludesNames : false;
    return { includesDeclaredEditorNames: purpose === 'contribution' ? !!base?.deltaIncludesDeclaredEditorNames : requires, requiresEditorAttributionReader: requires };
  };
  const generateAndDownload = (generate: () => Promise<string>) => {
    const expected = currentDisclosure(); let needsDisclosure = false;
    return perform(async () => {
    const id = await generate(), job = host.workspaceOutput.jobs.find(j => j.id === id);
    // Generation is already durable even if the browser handoff then fails.
    // Keep that exact result available; retry must not silently create another job.
    resetChoice();
    if (job && (!!job.includesDeclaredEditorNames !== !!expected.includesDeclaredEditorNames || !!job.requiresEditorAttributionReader !== !!expected.requiresEditorAttributionReader || job.requiresPortableMediaReader)) {
      needsDisclosure = true; history.open = true; return;
    }
    await handoff(id);
  }, handoffMessage, true, false, () => { if (needsDisclosure) { feedback = '作成したファイルの内容を確認し、ダウンロードしてください。'; completedFeedback = false; } }, 'ファイルを作成しています。'); };
  const handoff = async (id: string) => {
    feedback = 'ダウンロードを準備しています。'; render();
    try { await download(id); }
    catch (error) { history.open = true; throw Error(`${error instanceof Error ? error.message : 'ダウンロードを開始できません。'} 作成したファイルから再試行してください。`); }
  };
  const render = () => {
    displayMode(root, host.mode?.current ?? (host.authority.readOnly ? 'view' : 'edit'));
    if (disposed) return; actions.replaceChildren(); commands.replaceChildren(); list.replaceChildren(); completedFiles.replaceChildren();
    root.dataset.presentation = presentation; heading.textContent = presentation === 'save' ? '保存' : presentation === 'share' ? '共有' : 'ファイル';
    if (presentation === 'all') {
    const save = button(actions, '保存', () => choosePurpose('backup'));
    save.setAttribute('aria-pressed', String(purpose === 'backup'));
    const send = button(actions, '相手に渡す', () => choosePurpose('teamWorkspace'));
    send.setAttribute('aria-pressed', String(purpose === 'teamWorkspace' || purpose === 'contribution'));
    const more = document.createElement('details'), moreTitle = document.createElement('summary'); moreTitle.textContent = 'その他'; more.append(moreTitle);
    more.open = purpose === 'clean' || purpose === 'review'; actions.append(more);
    button(more, 'シーンを共有', () => choosePurpose('review')).setAttribute('aria-pressed', String(purpose === 'review'));
    button(more, '独立コピーを作る', () => choosePurpose('clean')).setAttribute('aria-pressed', String(purpose === 'clean'));
    }
    const label = document.createElement('label'), kind = document.createElement('select'); label.textContent = '渡す内容';
    kind.setAttribute('aria-label', '渡す内容');
    for (const [value, text] of (presentation === 'share' ? [['teamWorkspace', '作業一式'], ['contribution', '変更分'], ['review', 'シーン（閲覧用）'], ['clean', '独立コピー']] : [['teamWorkspace', '作業一式'], ['contribution', '変更分']])) {
      const option = document.createElement('option'); option.value = value!; option.textContent = text!; kind.append(option);
    }
    kind.value = purpose; kind.disabled = busy || composing || otherBusy() || !!host.authority.readOnly; label.append(kind);
    if (presentation === 'share' || purpose === 'teamWorkspace' || purpose === 'contribution') actions.append(label);
    nameField.hidden = purpose !== 'backup'; nameInput.disabled = busy || otherBusy() || !!host.authority.readOnly;
    if(purpose==='backup'){const scope=document.createElement('p');scope.textContent='モデル・メディアと履歴を含む作業全体を、バックアップに書き出します。';actions.append(scope);}
    if (!composing && nameInput.value !== checkpointName) nameInput.value = checkpointName;
    kind.addEventListener('change', () => {
      if (kind.disabled || !(presentation === 'share' ? ['teamWorkspace', 'contribution', 'review', 'clean'] : ['teamWorkspace', 'contribution']).includes(kind.value)) return;
      choosePurpose(kind.value as typeof purpose);
    });
    const chosen = host.workspaceOutput.bases.find(b => b.selection.workspacePackageId === baseId);
    const disclosure = privacyNotice(currentDisclosure());
    if (disclosure) { const privacy = document.createElement('p'); privacy.textContent = disclosure; actions.append(privacy); }
    const cleanConfirmed = !!cleanPreview && cleanPreview.token === host.read().source?.token;
    const reviewConfirmed = !!reviewPreview && reviewPreview.token === host.read().source?.token && reviewPreview.sceneId === sceneId && reviewPreview.omittedEntryView === omitEntry;
    if (purpose === 'review') {
      const provider = host.read().provider, sceneRecords = provider?.kind === 'scene-provider' ? provider.state.scenes : {};
      const label = document.createElement('label'), scenes = document.createElement('select'), empty = document.createElement('option');
      label.textContent = '渡すシーン'; scenes.setAttribute('aria-label', '渡すシーン'); empty.value = ''; empty.textContent = '選択してください'; scenes.append(empty);
      for (const scene of Object.values(sceneRecords)) {
        if (scene.lifecycle.kind !== 'value' || scene.lifecycle.value.state !== 'active' || scene.name.kind !== 'value') continue;
        const option = document.createElement('option'); option.value = scene.id; option.textContent = scene.name.value; scenes.append(option);
      }
      scenes.value = sceneId; scenes.disabled = kind.disabled; label.append(scenes); actions.append(label);
      scenes.addEventListener('change', () => { if (!scenes.disabled) { sceneId = scenes.value; omitEntry = false; reviewPreview = null; choicePending = true; render(); changed(); } });
      const scene = sceneRecords[sceneId];
      if (scene?.defaultViewId.kind === 'unresolved' && scene.defaultViewId.reason === 'conflict') {
        const label = document.createElement('label'), omit = document.createElement('input'); omit.type = 'checkbox'; omit.checked = omitEntry;
        omit.disabled = kind.disabled; label.append(omit, '開始視点なしで渡す'); actions.append(label);
        omit.addEventListener('change', () => { if (!omit.disabled) { omitEntry = omit.checked; reviewPreview = null; choicePending = true; render(); changed(); } });
      }
      const help = document.createElement('p'); help.textContent = '選んだシーンのモデル・記録だけを渡します。検索や色の絞り込みは反映しません。元のプロジェクトへ変更分は返せません。'; actions.append(help);
      if (reviewPreview) {
        const counts = document.createElement('p'); counts.textContent = reviewConfirmed ? `${reviewPreview.name} — モデル ${reviewPreview.models}・キャプション ${reviewPreview.captions}・メディア ${reviewPreview.media}` : '内容が変わりました。もう一度確認してください。'; actions.append(counts);
        if (reviewPreview.missingModelCaptions) { const note = document.createElement('p'); note.textContent = `モデルを含まない記録 ${reviewPreview.missingModelCaptions} 件は一覧だけに表示されます。`; actions.append(note); }
        if (reviewPreview.newlyNeedsReviewCaptions) { const note = document.createElement('p'); note.textContent = `受け手が編集コピーを作ると、${reviewPreview.newlyNeedsReviewCaptions} 件のピンが要確認になります。`; actions.append(note); }
      }
      const privacy = document.createElement('p'); privacy.textContent = '過去の変更履歴は含みません。文章・名前・素材に埋め込まれた情報は残ります。'; actions.append(privacy);
    }
    if (purpose === 'clean') {
      const help = document.createElement('p');
      help.textContent = 'すべてのシーンと現在の素材・記録を別プロジェクトにコピーします。過去の変更履歴は含みません。元のプロジェクトへ変更分を返すことはできません。';
      actions.append(help);
      if (cleanPreview) {
        const counts = document.createElement('p');
        counts.textContent = cleanConfirmed ? `シーン ${cleanPreview.scenes}・モデル ${cleanPreview.models}・キャプション ${cleanPreview.captions}・メディア ${cleanPreview.media}` : '内容が変わりました。もう一度確認してください。';
        actions.append(counts);
      }
      const privacy = document.createElement('p'); privacy.textContent = '記録の文章や名前、モデル・メディアに埋め込まれた情報は残ります。匿名化はしません。'; actions.append(privacy);
    }
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
    const create = button(commands, purpose === 'clean' && !cleanConfirmed || purpose === 'review' && !reviewConfirmed ? '内容を確認' :
      purpose === 'backup' ? 'ファイルに保存' : 'ダウンロード', () => {
      const token = host.read().source?.token; if (!token) return;
      if (purpose === 'contribution') {
        if (chosen) generateAndDownload(() => host.workspaceOutput.generateContribution(token, chosen.selection));
      } else if (purpose === 'clean') {
        if (!cleanConfirmed) perform(async () => { cleanPreview = await host.workspaceOutput.previewClean(token); }, 'コピーに含める内容を確認してください。');
        else generateAndDownload(() => host.workspaceOutput.generateClean(token));
      } else if (purpose === 'review') {
        const selection = { sceneId, ...(omitEntry ? { omitConflictedEntryView: true } : {}) };
        if (!reviewConfirmed) perform(async () => { reviewPreview = await host.workspaceOutput.previewReview(token, selection); }, '渡す内容を確認してください。');
        else generateAndDownload(() => host.workspaceOutput.generateReview(token, selection));
      } else if (purpose === 'backup') {
        const name = checkpointName.trim().normalize('NFC') || undefined;
        generateAndDownload(() => host.workspaceOutput.generateBackup(token, name));
      } else generateAndDownload(() => host.workspaceOutput.generate(token));
    });
    create.disabled ||= purpose === 'contribution' && !chosen || purpose === 'review' && !sceneId || !!selected || !!cancellation;
    create.className = 'lv-file-primary';
    if (choicePending) button(commands, '選択を取り消す', () => { resetChoice(); render(); changed(); });
    status.dataset.busy = String(busy);
    status.textContent = busy ? feedback : host.workspaceOutput.error || feedback;
    for (const [i, job] of host.workspaceOutput.jobs.entries()) {
      if (['cancelled', 'abandoned'].includes(job.state)) continue;
      const row = document.createElement('section'), text = document.createElement('p');
      const complete = job.state === 'generated' || job.state === 'file-verified';
      const name = job.purpose === 'contribution' ? '変更分' : job.purpose === 'backup' ? 'バックアップ' : job.purpose === 'clean' ? '独立コピー' : job.purpose === 'review' ? '閲覧用のシーン' : '作業一式';
      text.textContent = `${name} ${job.label || i + 1} — ${job.state === 'file-verified' ? '選択したファイルの内容を確認済み' : complete ? '生成済み・ファイルへの保存は未確認' :
        job.state === 'repair-required' ? '生成データを確認できません。元データは保持しています。' : 'ファイル生成が未完了です。'}`;
      row.append(text); (complete ? completedFiles : list).append(row);
      const disclosure = privacyNotice(job);
      if (disclosure) { const privacy = document.createElement('p'); privacy.textContent = disclosure; row.append(privacy); }
      if (job.stale || job.token && job.token !== host.read().source?.token) {
        const older = document.createElement('p'); older.textContent = '作成後の変更はこのファイルに含まれません。'; row.append(older);
      }
      if (complete) {
        button(row, 'ダウンロード', () => perform(() => handoff(job.id), handoffMessage, false), false);
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '保存先のファイルを確認';
        editOnly(details);
        details.append(summary); row.append(details);
        button(details, 'ファイルを選択', () => { selected = job.id; select.value = ''; select.click(); changed(); });
      } else if (job.state === 'incomplete') button(row, '生成を再開', () => perform(async () => {
        await host.workspaceOutput.retry(job.id); await handoff(job.id);
      }, handoffMessage));
      if (job.cancellable) button(row, '生成を取りやめる', () => { cancellation = job.id; render(); changed(); });
    }
    history.hidden = !completedFiles.children.length;
    if (cancellation) {
      const id = cancellation, text = document.createElement('p'); text.textContent = 'この生成を取りやめます。プロジェクトと生成途中のデータは削除しません。'; list.append(text);
      button(list, '取りやめる', () => perform(() => host.workspaceOutput.cancel(id), '生成を取りやめました。', true, false,
        () => { if (cancellation === id) cancellation = null; }));
      button(list, '戻る', () => { cancellation = null; render(); changed(); });
    }
    if (selected) button(list, 'ファイル確認を取り消す', cancelFileSelection);
  };
  function cancelFileSelection() {
    if (disposed || busy || !selected) return;
    selected = null; select.value = ''; render(); changed();
  }
  select.addEventListener('cancel', cancelFileSelection);
  select.addEventListener('change', () => {
    const id = selected, file = select.files?.[0];
    if (!file) { cancelFileSelection(); return; }
    if (id) perform(() => host.workspaceOutput.verifyFile(id, file), '選択したファイルの内容を確認しました。', true, false,
      () => { if (selected === id) { selected = null; select.value = ''; } });
  });
  // Keep this input mounted across refreshes, including native IME composition.
  nameInput.addEventListener('input', () => { if (!nameInput.disabled) { checkpointName = nameInput.value; choicePending = true; changed(); } });
  nameInput.addEventListener('compositionstart', () => { composing = true; choicePending = true; changed(); });
  nameInput.addEventListener('compositionend', () => { checkpointName = nameInput.value; composing = false; choicePending = true; changed(); });
  render(); return { root, render, choosePurpose, setPresentation(value: typeof presentation) { presentation = value; if (completedFeedback) { feedback = ''; completedFeedback = false; } },
    closeReason: () => busy ? 'ファイルを処理中です。完了をお待ちください。' : composing ? '名前の入力を確定してください。' : selected ? '照合するファイルを選ぶか、「ファイル確認を取り消す」を選択してください。' : cancellation ? '取りやめの確認を完了するか、「戻る」を選択してください。' : choicePending ? '選択が未完了です。下の「選択を取り消す」で戻れます。' : null, busy: () => busy, hasChanges: () => busy || composing || choicePending || !!selected || !!cancellation,
    dispose: () => { disposed = true; for (const url of urls) URL.revokeObjectURL(url); root.remove(); } };
}
