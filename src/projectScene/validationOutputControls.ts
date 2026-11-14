import type { createValidationModeHost } from './validationModeHost';
import { editOnly, displayMode } from '../ui/projectScene/modePresentation';
import type { WorkspaceFileInteraction } from '../ui/projectScene/projectWorkspacePorts';
import {storageFailureText} from '../ui/projectScene/storageFeedback';
import type { BackupFileHandoff, BackupFileObserver } from '../projectPackage/backupOutputJob';

/** Same editor, deliberate file handoff. No receipt follows a browser download click. */
export function createValidationOutputControls(document: Document, host: ReturnType<typeof createValidationModeHost>,
  session: () => WorkspaceFileInteraction | undefined, changed: () => void, otherBusy: () => boolean) {
  const root = document.createElement('section'), heading = document.createElement('h2'), actions = document.createElement('div'),
    commands = document.createElement('div'), status = document.createElement('p'), list = document.createElement('div'), select = document.createElement('input');
  heading.textContent = 'ファイル'; root.setAttribute('aria-label', 'ファイル'); status.setAttribute('role', 'status');
  status.className = 'lv-operation-status';
  root.className = 'lv-file-output'; actions.className = 'lv-file-intents'; commands.className = 'lv-file-commands';
  select.type = 'file'; select.setAttribute('aria-label', '保存したファイルを選択'); select.hidden = true;
  const nameField = document.createElement('label'), nameInput = document.createElement('input');
  nameField.textContent = '保存名（任意）'; nameInput.type = 'text'; nameInput.setAttribute('aria-label', '保存名（任意）'); nameField.append(nameInput);
  const shareOptions = document.createElement('div'), partialLabel = document.createElement('label'), partial = document.createElement('input'), partialText = document.createElement('span');
  const scopeLabel = document.createElement('label'), scope = document.createElement('select');
  shareOptions.className = 'lv-share-scope'; partialLabel.className = 'lv-share-partial';
  partial.type = 'checkbox'; partialText.textContent = '一部だけ出力'; partial.setAttribute('aria-label', partialText.textContent); partialLabel.append(partial, partialText);
  scopeLabel.textContent = '出力する内容'; scope.setAttribute('aria-label', '出力する内容'); scopeLabel.append(scope);
  for (const [value, text] of [['review', 'シーン'], ['contribution', '共有後の変更']] as const) {
    const option = document.createElement('option'); option.value = value; option.textContent = text; scope.append(option);
  }
  shareOptions.append(partialLabel, scopeLabel);
  const history = document.createElement('details'), historyTitle = document.createElement('summary'), completedFiles = document.createElement('div');
  const primary = document.createElement('button'); primary.type = 'button'; primary.className = 'lv-file-primary'; editOnly(primary); commands.append(primary);
  historyTitle.textContent = '作成したファイル'; history.append(historyTitle, completedFiles);
  root.append(heading, shareOptions, actions, nameField, commands, status, list, history, select);
  editOnly(shareOptions, actions, nameField, commands, select);
  let busy = false, disposed = false, feedback = '', selected: string | null = null, cancellation: string | null = null;
  let completedFeedback = false;
  let storageFailure:{diagnostic:string|null|undefined;text:string}|undefined;
  let readingToken: string | null = null;
  let primaryAction = () => {};
  primary.addEventListener('click', () => { if (!disposed && !primary.disabled) primaryAction(); });
  type Presentation = 'all' | 'save' | 'share';
  let presentation: Presentation = 'all';
  type OutputPurpose = 'teamWorkspace' | 'contribution' | 'backup' | 'clean' | 'review';
  let purpose: OutputPurpose = 'backup', baseId = '', choicePending = false, checkpointName = '', composing = false;
  let cleanPreview: Awaited<ReturnType<typeof host.workspaceOutput.previewClean>> | null = null;
  let reviewPreview: Awaited<ReturnType<typeof host.workspaceOutput.previewReview>> | null = null;
  let autoBase = true, sceneIds: string[] = [], omitted: string[] = [], previewKey = '';
  const selection = () => ({
    sceneId: sceneIds[0] ?? '',
    ...(sceneIds.length > 1 ? { additionalSceneIds: sceneIds.slice(1) } : {}),
    ...(omitted.includes(sceneIds[0] ?? '') ? { omitConflictedEntryView: true } : {}),
    ...(omitted.some(id => id !== sceneIds[0]) ? { omitAdditionalEntryViews: omitted.filter(id => id !== sceneIds[0]) } : {}),
  });
  type Choice = { purpose: OutputPurpose; baseId: string; checkpointName: string; choicePending: boolean; sceneIds: string[]; omitted: string[]; autoBase: boolean };
  const choices = new Map<Presentation, Choice>();
  const resetChoice = () => { purpose = presentation === 'share' ? 'review' : 'backup'; baseId = ''; checkpointName = ''; choicePending = false; cleanPreview = null; reviewPreview = null; sceneIds = []; omitted = []; autoBase = true; };
  const choosePurpose = (next: typeof purpose, pending = true) => {
    if (busy || composing || selected || cancellation) return;
    if (purpose === next) return;
    feedback = ''; completedFeedback = false;
    purpose = next; baseId = ''; autoBase = true; cleanPreview = null; reviewPreview = null; sceneIds = []; omitted = []; choicePending = pending; render(); changed();
  };
  const refreshChoice = (control: HTMLElement) => {
    const focused = document.activeElement === control, key = control.dataset.choiceId, label = control.getAttribute('aria-label');
    choicePending = true; feedback = ''; completedFeedback = false; render(); changed();
    if (focused) Array.from(actions.querySelectorAll?.<HTMLElement>('input, select') ?? []).find(node =>
      key ? node.dataset.choiceId === key : node.getAttribute('aria-label') === label)?.focus({ preventScroll: true });
  };
  const urls = new Map<string, string>();
  const handedOff = new Set<string>();
  const download = async (id: string, offered?: BackupFileHandoff) => {
    const job = host.workspaceOutput.jobs.find(job => job.id === id);
    if (!job) throw Error('作成したファイルを確認できません。');
    const handoff: { archive?: Readonly<{ sha256: string; byteLength: number }> } = {};
    if (offered && (offered.id !== id || offered.token !== readingToken || offered.blob.size !== offered.archive.byteLength))
      throw Error('作成したファイルを確認できません。');
    if (offered) handoff.archive = offered.archive;
    const blob = offered?.blob ?? await host.workspaceOutput.download(id, archive => { handoff.archive = archive; }); if (disposed) return;
    const key = handoff.archive ? JSON.stringify([id, handoff.archive.sha256, handoff.archive.byteLength]) : undefined;
    let url = key && urls.get(key);
    if (!url) { url = URL.createObjectURL(blob); urls.set(key ?? url, url); }
    const a = document.createElement('a');
    const safeName = (name: string) => Array.from(name.replace(/[<>:"/\\|?*\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, '_').trim()).slice(0, 80).join('').replace(/[. ]+$/, '');
    const provider = host.read().provider;
    const title = provider?.kind === 'scene-provider' ? provider.inspection.candidates.fields.find(field =>
      field.path.length === 2 && field.path[0] === 'project' && field.path[1] === 'title') : undefined;
    const candidate = title?.valid && title.candidates.length === 1 ? title.candidates[0]?.value : undefined;
    const project = candidate?.kind === 'value' && typeof candidate.value === 'string' ? safeName(candidate.value) : '';
    const kind = { contribution: '変更分', backup: '保存', clean: 'コピー', review: 'シーン', teamWorkspace: '作業一式' }[job.purpose];
    const now = new Date(), pair = (n: number) => String(n).padStart(2, '0');
    const stamp = String(now.getFullYear()) + [now.getMonth() + 1, now.getDate()].map(pair).join('') + '-' +
      [now.getHours(), now.getMinutes(), now.getSeconds()].map(pair).join('');
    a.href = url; a.download = ['LociView', project, kind, stamp].filter(Boolean).join('-') + '.zip';
    const label = safeName(job.label ?? '');
    if (job.purpose === 'backup' && label) a.download = `LociView-${label}.zip`;
    a.hidden = true; root.append(a);
    try { a.click(); } finally { a.remove(); }
  };
  const handoffMessage = 'ダウンロードを開始しました。保存先で完了を確認してください。';
  const perform = (action: () => Promise<unknown>, message: string, writes = true, consumeChoice = false, completed?: () => void,
    workingMessage = 'ファイルを確認しています。', allowReading = false) => {
    if (disposed || busy || composing || otherBusy()) return;
    const s = session();
    if (writes && host.authority.readOnly) { completedFeedback = false; feedback = '編集を開始してから実行してください。'; render(); return; }
    if (s?.interactionPending || s && s.acknowledgment.state !== 'idle' || host.hasPending()) {
      completedFeedback = false; feedback = '入力・操作を確定するか、取り消してから実行してください。'; render(); return;
    }
    const origin = document.activeElement;
    let returnPrimary = (origin as HTMLElement | null)?.className === 'lv-file-primary';
    const moved = (event: Event) => { if (event.target !== origin && event.target !== document.body) returnPrimary = false; };
    document.addEventListener?.('focusin', moved);
    let succeeded = false;
    completedFeedback = false; storageFailure=undefined; busy = true; readingToken = allowReading ? host.read().source?.token ?? null : null; feedback = workingMessage; render(); changed();
    void (async () => {
      try { await action(); if (!disposed) { feedback = message; completedFeedback = true; if (consumeChoice) resetChoice(); completed?.(); succeeded = completedFeedback; } }
      catch (error) { completedFeedback = false; if (!disposed) {const text=storageFailureText(error);storageFailure=text?{diagnostic:host.workspaceOutput.error,text}:undefined;feedback=text??(error instanceof Error ? error.message : 'ファイル処理を完了できません。');} }
      finally { busy = false; readingToken = null; if (!disposed) { render(); changed(); }
        document.removeEventListener?.('focusin', moved);
        const target = root.querySelector?.<HTMLButtonElement>('.lv-file-primary');
        if (!disposed && succeeded && returnPrimary && target && !target.disabled &&
          (document.activeElement === origin || document.activeElement === document.body)) target.focus({ preventScroll: false });
      }
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
    const preview = reviewPreview?.token === host.read().source?.token && previewKey === JSON.stringify(selection()) ? reviewPreview : null;
    const portable = purpose === 'backup' ? current.backupRequiresPortableMediaReader : purpose === 'contribution' ? current.sourceRequiresPortableMediaReader || !!base?.requiresPortableMediaReader :
      purpose === 'teamWorkspace' ? current.sourceRequiresPortableMediaReader : purpose === 'review' ? preview?.requiresPortableMediaReader : undefined;
    return { includesDeclaredEditorNames: purpose === 'contribution' ? !!base?.deltaIncludesDeclaredEditorNames : requires, requiresEditorAttributionReader: requires,
      requiresPortableMediaReader: portable };
  };
  const generateAndDownload = (generate: (observeFile?: BackupFileObserver) => Promise<string>) => {
    const expected = currentDisclosure(); let needsDisclosure = false;
    return perform(async () => {
    let offered: BackupFileHandoff | undefined, accepting = true;
    try {
    const id = await generate(file => { if (accepting && !disposed) offered = file; }), job = host.workspaceOutput.jobs.find(j => j.id === id);
    accepting = false;
    // Generation is already durable even if the browser handoff then fails.
    // Keep that exact result available; retry must not silently create another job.
    if (presentation === 'share') choicePending = false;
    else resetChoice();
    if (job && (!!job.includesDeclaredEditorNames !== !!expected.includesDeclaredEditorNames || !!job.requiresEditorAttributionReader !== !!expected.requiresEditorAttributionReader || !!job.requiresPortableMediaReader !== !!expected.requiresPortableMediaReader)) {
      needsDisclosure = true; history.open = true; return;
    }
    await handoff(id, offered);
    } finally { accepting = false; offered = undefined; }
  }, handoffMessage, true, false, () => { if (needsDisclosure) { feedback = '作成したファイルの内容を確認し、ダウンロードしてください。'; completedFeedback = false; } }, 'ファイルを作成しています。', true); };
  const handoff = async (id: string, offered?: BackupFileHandoff) => {
    feedback = 'ダウンロードを準備しています。'; render();
    try { await download(id, offered); if (!disposed) handedOff.add(id); }
    catch (error) { history.open = true; throw Error(`${error instanceof Error ? error.message : 'ダウンロードを開始できません。'} 作成したファイルから再試行してください。`); }
  };
  const render = () => {
    displayMode(root, host.mode?.current ?? (host.authority.readOnly ? 'view' : 'edit'));
    if (disposed) return; actions.replaceChildren();
    for (const child of Array.from(commands.children)) if (child !== primary) child.remove();
    list.replaceChildren(); completedFiles.replaceChildren();
    const viewing=host.mode?.current === 'view' || host.authority.readOnly;
    root.dataset.presentation = presentation; heading.hidden=!!viewing;heading.textContent=viewing?'':presentation === 'save' ? '保存' : presentation === 'share' ? '共有' : 'ファイル';
    const choicesDisabled = busy || composing || otherBusy() || !!host.authority.readOnly || !!selected || !!cancellation;
    shareOptions.hidden = presentation !== 'share';
    partial.checked = purpose === 'review' || purpose === 'contribution'; partial.disabled = choicesDisabled;
    scopeLabel.hidden = !partial.checked; scope.value = purpose === 'contribution' ? 'contribution' : 'review'; scope.disabled = choicesDisabled;
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
    if (presentation === 'all' && (purpose === 'teamWorkspace' || purpose === 'contribution')) {
      const label = document.createElement('label'), kind = document.createElement('select'); label.textContent = '渡す内容';
      kind.setAttribute('aria-label', '渡す内容');
      for (const [value, text] of [['teamWorkspace', '作業一式'], ['contribution', '変更分']] as const) {
        const option = document.createElement('option'); option.value = value; option.textContent = text; kind.append(option);
      }
      kind.value = purpose; kind.disabled = choicesDisabled; label.append(kind); actions.append(label);
      kind.addEventListener('change', () => {
        if (!kind.disabled && (kind.value === 'teamWorkspace' || kind.value === 'contribution')) choosePurpose(kind.value);
      });
    }
    nameField.hidden = purpose !== 'backup'; nameInput.disabled = busy || otherBusy() || !!host.authority.readOnly;
    if(purpose==='backup'){const scope=document.createElement('p');scope.textContent='モデル・メディア・履歴を含む作業全体を保存します。保存したファイルは「ファイルを開く」から再開できます。';actions.append(scope);}
    if (presentation === 'share' && purpose === 'teamWorkspace') {
      const note = document.createElement('p'); note.textContent = '編集・返送できます。全シーンと編集履歴を含みます。'; actions.append(note);
    }
    if (!composing && nameInput.value !== checkpointName) nameInput.value = checkpointName;
    if (purpose === 'contribution' && autoBase && !baseId && host.workspaceOutput.bases.length === 1)
      baseId = host.workspaceOutput.bases[0]!.selection.workspacePackageId;
    const chosen = host.workspaceOutput.bases.find(b => b.selection.workspacePackageId === baseId);
    const disclosure = privacyNotice(currentDisclosure());
    if (disclosure) { const privacy = document.createElement('p'); privacy.textContent = disclosure; actions.append(privacy); }
    const cleanConfirmed = !!cleanPreview && cleanPreview.token === host.read().source?.token;
    let reviewConfirmed = false;
    if (purpose === 'review') {
      const provider = host.read().provider, sceneRecords = provider?.kind === 'scene-provider' ? provider.state.scenes : {};
      const available = Object.values(sceneRecords).flatMap(scene => {
        if (scene.lifecycle.kind !== 'value' || scene.lifecycle.value.state !== 'active' || scene.name.kind !== 'value') return [];
        return [{ id: scene.id, name: scene.name.value, order: scene.orderKey.kind === 'value' ? scene.orderKey.value : '',
          conflict: scene.defaultViewId.kind === 'unresolved' && scene.defaultViewId.reason === 'conflict' }];
      }).sort((a, b) => a.order < b.order ? -1 : a.order > b.order ? 1 : a.id.localeCompare(b.id));
      const selectedIds = new Set(sceneIds);
      sceneIds = available.filter(scene => selectedIds.has(scene.id)).map(scene => scene.id);
      const sole = available.length === 1 && presentation === 'share' ? available[0] : undefined;
      if (sole) {
        sceneIds = [sole.id];
        const target = document.createElement('p'); target.setAttribute('aria-label', '渡すシーン');
        target.textContent = `渡すシーン：${sole.name}`; actions.append(target);
      }
      omitted = available.filter(s => s.conflict && sceneIds.includes(s.id) && omitted.includes(s.id)).map(s => s.id);
      const group = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = '渡すシーン'; group.append(legend); group.setAttribute('aria-label', legend.textContent);
      group.className = 'lv-share-scenes'; if (!sole) actions.append(group);
      const check = (parent: HTMLElement, text: string, key: string, checked: boolean, change: (on: boolean) => void) => {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = 'checkbox'; input.dataset.choiceId = key; input.setAttribute('aria-label', text); input.checked = checked; input.disabled = choicesDisabled;
        const title = document.createElement('span'); title.textContent = text; label.append(input, title); parent.append(label);
        input.addEventListener('change', () => { if (input.disabled) return; change(input.checked); reviewPreview = null; refreshChoice(input); });
      };
      for (const scene of available) {
        if (!sole) check(group, scene.name, scene.id, selectedIds.has(scene.id), on => {
          sceneIds = on ? [...sceneIds, scene.id] : sceneIds.filter(id => id !== scene.id);
        });
        if (sceneIds.includes(scene.id) && scene.conflict) check(sole ? actions : group,
          available.length === 1 ? '開始視点なしで渡す' : `${scene.name}を開始視点なしで渡す`, 'omit-' + scene.id,
          omitted.includes(scene.id), on => { omitted = on ? [...omitted, scene.id] : omitted.filter(id => id !== scene.id); });
      }
      reviewConfirmed = !!reviewPreview && reviewPreview.token === host.read().source?.token && previewKey === JSON.stringify(selection());
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
      base.value = chosen ? baseId : ''; base.disabled = choicesDisabled; label.append(base); actions.append(label);
      base.addEventListener('change', () => { if (!base.disabled) { baseId = base.value; autoBase = false; refreshChoice(base); } });
      const help = document.createElement('p'); help.textContent = host.workspaceOutput.bases.length ?
        '相手と共有した作業一式を選択してください。' : '先に作業一式を受け取るか、作成してください。'; actions.append(help);
    }
    const create = primary;
    create.textContent = purpose === 'clean' && !cleanConfirmed || purpose === 'review' && !reviewConfirmed ? '内容を確認' :
      purpose === 'backup' ? 'ファイルに保存' : 'ダウンロード';
    create.disabled = busy || composing || otherBusy() || !!host.authority.readOnly;
    primaryAction = () => {
      const token = host.read().source?.token; if (!token) return;
      if (purpose === 'contribution') {
        if (chosen) generateAndDownload(() => host.workspaceOutput.generateContribution(token, chosen.selection));
      } else if (purpose === 'clean') {
        if (!cleanConfirmed) perform(async () => { cleanPreview = await host.workspaceOutput.previewClean(token); }, 'コピーに含める内容を確認してください。');
        else generateAndDownload(() => host.workspaceOutput.generateClean(token));
      } else if (purpose === 'review') {
        const selected = selection();
        if (!reviewConfirmed) perform(async () => { reviewPreview = await host.workspaceOutput.previewReview(token, selected); previewKey = JSON.stringify(selected); }, '渡す内容を確認してください。');
        else generateAndDownload(() => host.workspaceOutput.generateReview(token, selected));
      } else if (purpose === 'backup') {
        const name = checkpointName.trim().normalize('NFC') || undefined;
        generateAndDownload(offer => host.workspaceOutput.generateBackup(token, name, offer));
      } else generateAndDownload(() => host.workspaceOutput.generate(token));
    };
    create.disabled ||= purpose === 'contribution' && !chosen || purpose === 'review' && !sceneIds.length || !!selected || !!cancellation;
    create.className = 'lv-file-primary';
    if (choicePending) button(commands, '選択を取り消す', () => {
      resetChoice(); feedback = ''; completedFeedback = false; render(); changed(); if (presentation === 'share') partial.focus();
    });
    status.dataset.busy = String(busy);
    const diagnostic=host.workspaceOutput.error;
    status.textContent = busy ? feedback : storageFailure&&storageFailure.diagnostic===diagnostic ? storageFailure.text : diagnostic || feedback;
    const currentToken = host.read().source?.token;
    for (const [i, job] of host.workspaceOutput.jobs.entries()) {
      if (['cancelled', 'abandoned'].includes(job.state)) continue;
      const row = document.createElement('section'), text = document.createElement('p');
      const complete = job.state === 'generated' || job.state === 'file-verified';
      const name = job.purpose === 'contribution' ? '変更分' : job.purpose === 'backup' ? '保存ファイル' : job.purpose === 'clean' ? '独立コピー' : job.purpose === 'review' ? '閲覧用のシーン' : '作業一式';
      text.textContent = `${name} ${job.label || i + 1} — ${job.state === 'file-verified' ? '選び直したファイルを照合済み' :
        complete && handedOff.has(job.id) ? 'ダウンロード開始・保存先未確認' : complete ? '生成済み・ファイルへの保存は未確認' :
        job.state === 'repair-required' ? '生成データを確認できません。元データは保持しています。' : 'ファイル生成が未完了です。'}`;
      row.append(text); (complete ? completedFiles : list).append(row);
      const disclosure = privacyNotice(job);
      if (disclosure) { const privacy = document.createElement('p'); privacy.textContent = disclosure; row.append(privacy); }
      if (job.stale || job.token && job.token !== currentToken) {
        const older = document.createElement('p'); older.textContent = '作成後の変更はこのファイルに含まれません。'; row.append(older);
      }
      if (complete) {
        button(row, 'ダウンロード', () => perform(() => handoff(job.id), handoffMessage, false), false);
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '保存したファイルを確認';
        editOnly(details);
        details.append(summary); row.append(details);
        button(details, 'ファイルを選択', () => { selected = job.id; select.value = ''; select.click(); changed(); });
      } else if (job.state === 'incomplete') button(row, '生成を再開', () => perform(async () => {
        await host.workspaceOutput.retry(job.id);
        const confirmed = host.workspaceOutput.jobs.find(current => current.id === job.id);
        if (purpose === 'backup' && confirmed?.purpose === 'backup' &&
            (confirmed.state === 'generated' || confirmed.state === 'file-verified') &&
            confirmed.token !== undefined && confirmed.token === host.read().source?.token &&
            confirmed.label === (checkpointName.trim().normalize('NFC') || undefined)) resetChoice();
        await handoff(job.id);
      }, handoffMessage));
      if (job.cancellable) button(row, '生成を取りやめる', () => { cancellation = job.id; render(); changed(); });
    }
    if (host.workspaceOutput.jobs.length || host.workspaceOutput.error) {
      const recovering = !!host.workspaceOutput.error || host.workspaceOutput.jobs.some(job => ['unstarted', 'incomplete', 'repair-required'].includes(job.state));
      const cleanup = button(!recovering && completedFiles.children.length ? completedFiles : list, '一時ファイルを整理', () => {
        let message = '', needsAttention = false;
        perform(async () => {
          const token = host.read().source?.token; if (!token) throw Error('再開用データを確認してください。');
          const result = await host.workspaceOutput.cleanup(token), amount = (result.removedBytes / 1_000_000).toLocaleString('ja-JP', { maximumFractionDigits: 1 });
          message = result.removedFiles ? `${result.removedFiles}ファイル（${amount} MB）を整理しました。` : '整理できる一時ファイルはありません。';
          if (result.failedFiles) message += ' 一部を削除できませんでした。再試行できます。';
          if (result.retainedUncertain) message += ' 確認できないデータは残しました。';
          needsAttention = !!result.failedFiles || !!result.retainedUncertain;
        }, '', true, false, () => { feedback = message; if (needsAttention) completedFeedback = false; }, '一時ファイルを確認しています。');
      });
      cleanup.title = 'このプロジェクトの失敗した書き出しを整理します。原本・記録・保存済みファイル・復旧データは残します。';
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
  partial.addEventListener('change', () => {
    if (presentation === 'share' && !partial.disabled) choosePurpose(partial.checked ? 'review' : 'teamWorkspace', partial.checked);
  });
  scope.addEventListener('change', () => {
    if (presentation === 'share' && partial.checked && !scope.disabled && (scope.value === 'review' || scope.value === 'contribution')) choosePurpose(scope.value);
  });
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
  render(); return { root, render, choosePurpose, hasHandedOff: (jobId: string) => handedOff.has(jobId), setPresentation(value: typeof presentation) {
      if (value !== presentation) {
        choices.set(presentation, { purpose, baseId, checkpointName, choicePending, sceneIds, omitted, autoBase });
        presentation = value;
        const saved = choices.get(value);
        if (saved) ({ purpose, baseId, checkpointName, choicePending, sceneIds, omitted, autoBase } = saved);
        else resetChoice();
        cleanPreview = null; reviewPreview = null;
      }
      if (completedFeedback) { feedback = ''; completedFeedback = false; }
    },
    readingOutput: () => !disposed && busy && readingToken ? { token: readingToken, message: feedback } : null,
    outputFeedback: () => feedback,
    dismissCompletedFeedback: () => {
      if (disposed || busy || !completedFeedback) return false;
      feedback = ''; completedFeedback = false; return true;
    },
    closeReason: () => busy ? 'ファイルを処理中です。完了をお待ちください。' : composing ? '名前の入力を確定してください。' : selected ? '照合するファイルを選ぶか、「ファイル確認を取り消す」を選択してください。' : cancellation ? '取りやめの確認を完了するか、「戻る」を選択してください。' : null, busy: () => busy, hasChanges: () => busy || composing || !!selected || !!cancellation,
    dispose: () => { disposed = true; readingToken = null; for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); root.remove(); } };
}
