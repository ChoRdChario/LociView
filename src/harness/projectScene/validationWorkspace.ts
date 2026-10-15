import { isAdditionalPhoto, type PhotoDecoder } from '../../projectFiles/photo';
import { projectResumeReference, type ProjectResumeReference } from '../../ui/resumeReference';
import { newId } from '../../projectMetadata/persistence';
import { prepareValidationProject, type ValidationFile } from '../../projectFiles/initialProject';
import { prepareValidationCreation } from '../../projectFiles/creation';
import { prepareNativeConversion } from '../../projectFiles/nativeConversion';
import { prepareFrozenV1Conversion } from '../../projectFiles/frozenV1Conversion';
import { prepareLociMyuConversion } from '../../projectFiles/lociMyuConversion';
import { validationMetadataLimits, type FileValidationLimits } from '../../projectFiles/validation';
import { WorkspaceArchive } from '../../projectPackage/workspaceArchive';
import { CleanArchive } from '../../projectPackage/cleanArchive';
import { PackageArchive } from '../../projectPackage/zipArchive';
import type { PngDecoder } from '../../projectFiles/png';
import { isJpeg, type JpegDecoder } from '../../projectFiles/jpeg';
import type { openValidationHost } from './validationHost';
import { createValidationModeHost, type ValidationDisplayHost } from './validationModeHost';
import type { LocalOpenMode } from './savedHost';
import type { ValidationProjectEntry } from './validationCatalog';
import { createSavedWorkspace } from './metadataWorkspace';
import { createProductWorkspace } from './productWorkspace';
import { createMetadataConflictControls } from './metadataConflictControls';
import { createMetadataCaptionLifecycleControls } from './metadataCaptionLifecycleControls';
import { createMetadataMembershipControls } from './metadataMembershipControls';
import { createMetadataAssetStatusControls } from './metadataAssetStatusControls';
import { createMetadataMaterialControls } from './metadataMaterialControls';
import type { ModelCandidateRenderer } from './modelCandidatePreview';
import type { ViewportFactory } from './viewportHost';
import { createValidationReceiveControls } from './validationReceiveControls';
import { prepareReviewView, type ReviewView } from './reviewView';
import { createReviewWorkspace } from './reviewWorkspace';
import { PreparedReviewEdit } from '../../projectPackage/reviewEdit';

type Host = ReturnType<typeof createValidationModeHost>;
export interface ValidationWorkspacePorts {
  fileLimits: FileValidationLimits; decode?: PngDecoder; jpeg?: JpegDecoder; photo?: PhotoDecoder;
  productEditor?: boolean;
  lastProject?: { read(): ProjectResumeReference | null; remember(reference: ProjectResumeReference): void };
  list(): Promise<ValidationProjectEntry[]>;
  open(run: string, initial?: ReturnType<typeof prepareValidationCreation>, mode?: LocalOpenMode, workspaceFile?: Blob, reviewEdit?: PreparedReviewEdit): Promise<Awaited<ReturnType<typeof openValidationHost>>>;
  render(host: ValidationDisplayHost): Promise<{ factory: ViewportFactory; dispose(): void }>;
  renderReview?(view: ReviewView): Promise<{ factory: ViewportFactory; dispose(): void }>;
  renderModelCandidate?(host: ValidationDisplayHost, display: Parameters<ModelCandidateRenderer>[0]): ReturnType<ModelCandidateRenderer>;
  selected(run: string | null, mode?: LocalOpenMode): void;
}

/** One opt-in selector/editor. A switch is refused while input/save/IME is pending. */
export function createValidationWorkspace(document: Document, ports: ValidationWorkspacePorts, initialRun?: string, initialMode: LocalOpenMode = 'edit') {
  const root = document.createElement('section'), navigation = document.createElement('section'), content = document.createElement('section');
  root.className = 'lv-validation-host'; navigation.className = 'lv-validation-home';
  const heading = document.createElement('h1'); heading.textContent = '実ファイルで検証';
  const help = document.createElement('p'); help.textContent = '静的GLB（内蔵PNG/JPEG・外部参照なし）とPNG/JPEG/WebP/GIF画像で検証プロジェクトを作ります。作業一式の生成・受け渡しができます。ダウンロードだけではファイルへの保存は確認できません。通常画面のプロジェクトは変更しません。';
  const form = document.createElement('form'), title = document.createElement('input'), files = document.createElement('input');
  title.value = '新しいプロジェクト'; title.maxLength = 256; title.setAttribute('aria-label', 'プロジェクト名');
  files.type = 'file'; files.multiple = true; files.setAttribute('aria-label', '3Dモデルとメディアを選択');
  const create = document.createElement('button'); create.textContent = 'プロジェクトを作成'; create.type = 'submit';
  const titleLabel = document.createElement('label'), filesLabel = document.createElement('label');
  titleLabel.textContent = 'プロジェクト名'; filesLabel.textContent = '3Dモデルとメディアを選択';
  titleLabel.append(title); filesLabel.append(files); form.append(titleLabel, filesLabel, create);
  const workspaceForm = document.createElement('form'), workspaceLabel = document.createElement('label'), workspaceInput = document.createElement('input'), openFile = document.createElement('button');
  workspaceLabel.textContent = 'ファイルを選択'; workspaceInput.type = 'file'; workspaceInput.setAttribute('aria-label', 'ファイルを選択'); workspaceLabel.append(workspaceInput);
  openFile.type = 'submit'; openFile.textContent = 'ファイルを開く'; workspaceForm.append(workspaceLabel, openFile);
  const conversionPanel = document.createElement('section'), conversionNote = document.createElement('p'), conversionHelp = document.createElement('p');
  const convert = document.createElement('button'), cancelConversion = document.createElement('button');
  convert.type = cancelConversion.type = 'button'; convert.textContent = '新しいプロジェクトに変換'; cancelConversion.textContent = 'キャンセル';
  conversionHelp.textContent = '元ファイルは変更しません。チームでは変換後のファイルを使ってください。元ファイルは書き出しに含まれないため、別に保管してください。';
  conversionPanel.append(conversionNote, conversionHelp, convert, cancelConversion); conversionPanel.hidden = true; workspaceForm.append(conversionPanel);
  const lociChoices = document.createElement('div'), workbookLabel = document.createElement('label'), workbook = document.createElement('select'),
    conversionTitleLabel = document.createElement('label'), conversionTitle = document.createElement('input'), relationLabel = document.createElement('label'), relation = document.createElement('input'),
    relationNote = document.createElement('p'), previewAgain = document.createElement('button'), saveReport = document.createElement('button');
  workbookLabel.textContent = '変換する表'; workbook.setAttribute('aria-label', '変換する表'); workbookLabel.append(workbook);
  conversionTitleLabel.textContent = '変換後のプロジェクト名'; conversionTitle.setAttribute('aria-label', '変換後のプロジェクト名'); conversionTitleLabel.append(conversionTitle);
  relation.type = 'checkbox'; relation.setAttribute('aria-label', '表と視点・材質の関連付けを確認'); relationLabel.textContent = '表と視点・材質の関連付けを確認'; relationLabel.append(relation);
  previewAgain.type = saveReport.type = 'button'; previewAgain.textContent = '変換内容を確認'; saveReport.textContent = '変換の説明を保存';
  lociChoices.append(workbookLabel, conversionTitleLabel, relationNote, relationLabel, previewAgain, saveReport); lociChoices.hidden = true; conversionPanel.replaceChildren(lociChoices, conversionNote, conversionHelp, convert, cancelConversion);
  const coldReport = document.createElement('button'); coldReport.type = 'button'; coldReport.textContent = '変換の説明を保存'; coldReport.hidden = true; root.append(coldReport);
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const list = document.createElement('section'), refresh = document.createElement('button'), back = document.createElement('button');
  refresh.type = back.type = 'button'; refresh.textContent = '一覧を更新'; back.textContent = '別のプロジェクトを開く';
  const listHeading = document.createElement('h2'); listHeading.textContent = 'このブラウザの再開用データ';
  navigation.append(heading, help, workspaceForm, form, listHeading, refresh, list); root.append(back, status, navigation, content);
  let host: Host | undefined, workspace: ReturnType<typeof createSavedWorkspace> | ReturnType<typeof createProductWorkspace> | undefined;
  let reviewWorkspace: ReturnType<typeof createReviewWorkspace> | undefined;
  let receiveTools: ReturnType<typeof createValidationReceiveControls> | undefined;
  let resident: Awaited<ReturnType<ValidationWorkspacePorts['render']>> | undefined;
  let busy = false, disposed = false, composing = false, selected: string | null = null, operation: Promise<void> | undefined;
  let conversion: Awaited<ReturnType<typeof prepareNativeConversion>> | Awaited<ReturnType<typeof prepareFrozenV1Conversion>> = null;
  let lociPreview: Awaited<ReturnType<typeof prepareLociMyuConversion>> = null;
  let lociEvaluation: Awaited<ReturnType<NonNullable<Awaited<ReturnType<typeof prepareLociMyuConversion>>>['evaluate']>> | null = null;
  let lociDraft = 0, lociDecision: string | undefined;
  const lociTuple = () => JSON.stringify([workbook.value, conversionTitle.value, relation.checked]);
  const lociCurrent = () => !!lociEvaluation && lociDecision === lociTuple();
  let reportUrl: string | undefined;
  let mounted = false, resumedLast = false, lastRemembered: string | undefined;
  let catalog: readonly ValidationProjectEntry[] = [];
  const changed = () => !!workspace?.hasChanges() || !!reviewWorkspace?.hasChanges() || !!receiveTools?.hasChanges() || !!host?.hasPending();
  const controls = () => { navigation.inert = busy; openFile.disabled = create.disabled = cancelConversion.disabled = busy || composing;
    convert.disabled = busy || composing || !!lociPreview && (!lociCurrent() || lociEvaluation!.blocked);
    saveReport.disabled = busy || composing || !lociCurrent(); previewAgain.disabled = busy || composing;
    workbook.disabled = conversionTitle.disabled = relation.disabled = busy;
    coldReport.disabled = busy || composing || !!workspace?.hasChanges() || !!reviewWorkspace?.hasChanges() || !!receiveTools?.hasChanges(); back.disabled = busy;
    back.hidden = !host && !reviewWorkspace || !!workspace && 'hasProjectHeader' in workspace && workspace.hasProjectHeader(); };
  title.addEventListener('compositionstart', () => { composing = true; controls(); });
  title.addEventListener('compositionend', () => { composing = false; controls(); });
  conversionTitle.addEventListener('compositionstart', () => { composing = true; invalidateLoci(); controls(); });
  conversionTitle.addEventListener('compositionend', () => { composing = false; invalidateLoci(); controls(); });
  const execute = (action: () => Promise<void>) => {
    if (busy || disposed) return; busy = true; controls();
    const work = action(); operation = work;
    return work.catch(error => { if (!disposed) status.textContent = error instanceof Error ? error.message : '処理できません。入力と再開用データは保持しています。'; })
      .finally(() => { busy = false; if (operation === work) operation = undefined; if (!disposed) controls(); });
  };
  const closeCurrent = async () => {
    const oldWorkspace = workspace, oldHost = host, oldResident = resident;
    mounted = false; resumedLast = false;
    workspace = undefined; host = undefined; resident = undefined;
    coldReport.hidden = true; if (reportUrl) URL.revokeObjectURL(reportUrl); reportUrl = undefined;
    reviewWorkspace?.dispose(); reviewWorkspace = undefined;
    if (oldWorkspace) await oldWorkspace.dispose(); else await oldHost?.dispose(); oldResident?.dispose(); content.replaceChildren();
    receiveTools?.dispose(); receiveTools = undefined;
  };
  const ensureMaySwitch = () => {
    if (composing || changed()) throw Error('入力・更新を確定するか、取り消してからプロジェクトを切り替えてください。');
  };
  function selectProject() { return execute(async () => {
    ensureMaySwitch(); await closeCurrent(); selected = null; ports.selected(null); navigation.hidden = false; status.textContent = ''; await updateList();
  }); }
  const currentResume = () => {
    if (!mounted || disposed || !host || !workspace || workspace.hasChanges() || workspace.inputPending() || !selected || host.hasPending() ||
      'hasProjectHeader' in workspace && !workspace.hasProjectHeader()) return null;
    const current = host.read(), provider = current.provider;
    if (current.state !== 'ready' || !current.publication || provider?.kind !== 'scene-provider' || current.source?.token !== provider.token ||
      current.source.proof.identity.projectId !== `prj_${selected}`) return null;
    const field = provider.inspection.candidates.fields.find(f => f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'title');
    const value = field?.valid && field.candidates.length === 1 ? field.candidates[0]?.value : undefined;
    return value?.kind === 'value' && typeof value.value === 'string' && value.value.trim() ? { run: selected, mode: host.mode!.current, title: value.value } : null;
  };
  const rememberCurrent = () => {
    const current = currentResume(); if (!current || !ports.lastProject) return;
    const reference = { run: current.run, mode: current.mode }, key = JSON.stringify(reference);
    if (lastRemembered === key) return; lastRemembered = key;
    try { ports.lastProject.remember(reference); } catch { /* Advisory settings never change a successful Project acknowledgment. */ }
  };
  const updateList = async () => {
    const entries = await ports.list(); if (disposed) return;
    catalog = entries;
    list.replaceChildren();
    if (!entries.length) { list.textContent = '検証プロジェクトはありません。'; return; }
    for (const item of entries) {
      const row = document.createElement('p'), name = document.createElement('span');
      name.textContent = `${item.title} — ${item.state === 'ready' ? '再開用データ' : item.state === 'incomplete' ? '更新が未完了' : '要確認'} `;
      row.append(name);
      for (const mode of ['view', 'edit'] as const) {
        const open = document.createElement('button'); open.type = 'button';
        open.textContent = mode === 'view' ? '閲覧で開く' : '編集で開く';
        open.addEventListener('click', () => execute(async () => { ensureMaySwitch(); await closeCurrent(); await openProject(item.run, undefined, mode); }));
        row.append(open);
      }
      list.append(row);
    }
  };
  const mount = async (prepared?: Awaited<ReturnType<ValidationWorkspacePorts['render']>>) => {
    mounted = false;
    if (!host || disposed) { prepared?.dispose(); return; }
    content.replaceChildren();
    if (host.read().state !== 'ready' || host.hasPending() && !(host.backupRestore.needsDisplay && !host.backupRestore.pending)) {
      prepared?.dispose();
      const note = document.createElement('p'), retry = document.createElement('button');
      note.textContent = host.authority.status?.().error || '更新が未完了です。元の変更から再試行してください。';
      retry.type = 'button'; retry.textContent = '更新を再試行'; retry.disabled = !!host.authority.readOnly;
      retry.addEventListener('click', () => execute(async () => { await host!.authority.retry!(); await mount(); }));
      content.append(note, retry); if (receiveTools) { receiveTools.render(); content.append(receiveTools.root); }
      retry.hidden = host.workspaceFiles.initialImport && host.read().state === 'empty' ||
        !!host.workspaceFiles.reviewCopyError || host.workspaceFiles.reviewCopies.some(j => !['completed', 'abandoned'].includes(j.state)) ||
        host.backupRestore.pending || !!host.workspaceFiles.jobs.some(j => !['completed', 'cancelled', 'abandoned'].includes(j.state));
      if (host.mode?.current === 'view') {
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '編集を開始する';
        edit.addEventListener('click', () => execute(async () => {
          await host!.mode!.change('edit', host!.read().source?.token, () => {}); await mount();
        }));
        note.textContent = `更新が未完了です。編集を開始して復旧してください。${host.mode.detail}`; content.append(edit);
      }
      return;
    }
    // File recovery must remain available even if renderer preparation fails or stalls.
    if (receiveTools) { receiveTools.render(); content.append(receiveTools.root); }
    status.textContent = 'モデルを読み込んでいます。';
    const target = host, token = target.read().source?.token, next = prepared ?? await ports.render(target);
    if (disposed || host !== target) { next.dispose(); return; }
    resident = next;
    const fileTools = receiveTools;
    try { workspace = ports.productEditor ? createProductWorkspace(document, target, next.factory, fileTools,
      ports.renderModelCandidate ? display => ports.renderModelCandidate!(target, display) : undefined,
      { openProject: () => { void selectProject(); }, resumedLastProject: () => resumedLast, changed: () => { rememberCurrent(); controls(); } }) : createSavedWorkspace(document, target, next.factory,
      (session, changed) => {
        const root = document.createElement('section');
        const blockedReason = () => fileTools?.hasChanges() ? 'ファイルの操作を終えるか、取り消してから解消してください。' : null;
        const text = createMetadataConflictControls(document, target, session, changed, { blockedReason });
        const lifecycle = createMetadataCaptionLifecycleControls(document, target, session, text.composing, changed, blockedReason);
        const memberships = createMetadataMembershipControls(document, target, session, text.composing, changed, 'caption', blockedReason);
        const models = createMetadataAssetStatusControls(document, target, session, text.composing, changed, { blockedReason,
          preview: ports.renderModelCandidate ? display => ports.renderModelCandidate!(target, display) : undefined });
        const modelMemberships = createMetadataMembershipControls(document, target, session, text.composing, changed, 'asset', blockedReason);
        const materials = createMetadataMaterialControls(document, target, session, text.composing, changed, blockedReason);
        const groups = [lifecycle, text, memberships, models, modelMemberships, materials]; root.append(...groups.map(g => g.root));
        return { root, render: () => { for (const group of groups) group.render(); },
          hasChanges: () => groups.some(g => g.hasChanges()), dispose: () => { for (const group of groups) group.dispose(); root.remove(); } };
      }, fileTools);
      content.replaceChildren(workspace.root); workspace.render();
      if (target.backupRestore.needsDisplay) { target.backupRestore.displayReady(target.read().source!.token); workspace.render(); } }
    catch (error) { workspace?.unmount(); workspace = undefined; next.dispose(); resident = undefined; throw error; }
    mounted = token === target.read().source?.token;
    status.textContent = '検証用プロジェクト。通常画面・オフライン・実機での受入れは未完了です。';
  };
  const restoreDisplay = async (retry: boolean) => {
    const target = host; if (!target || disposed) throw Error('プロジェクトを開いてください。');
    const epoch = target.backupRestore.epoch;
    let staged: Awaited<ReturnType<ValidationWorkspacePorts['render']>> | undefined;
    let stagedPrepare: Parameters<ValidationDisplayHost['setDisplayPreparation']>[0] | undefined;
    let readContent: ValidationDisplayHost['content'] | undefined;
    const removeOldDisplay = () => { workspace?.unmount(); workspace = undefined; resident?.dispose(); resident = undefined; };
    try {
      await target.backupRestore[retry ? 'retry' : 'confirm'](async (next, sourceContent) => {
        readContent = sourceContent;
        staged = await ports.render({ authority: { ...target.authority, read: () => next },
          content: { model: record => readContent!.model(record) },
          setDisplayPreparation(callback) { stagedPrepare = callback; return () => { if (stagedPrepare === callback) stagedPrepare = undefined; }; } });
      });
      if (disposed || host !== target) throw Error('画面を閉じました。復元先は再度開いて確認してください。');
      if (!staged) throw Error('復元先の表示を準備できません。');
      // Only the selected runtime supplies future model reads; staging capabilities have expired.
      readContent = target.content; const next = staged, prepare = stagedPrepare;
      removeOldDisplay();
      const detach = prepare ? target.setDisplayPreparation(prepare) : () => {};
      staged = undefined; // mount now owns this resident, including failure/closed paths.
      await mount({ factory: next.factory, dispose: () => { detach(); next.dispose(); } });
    } catch (error) {
      staged?.dispose();
      if (target.backupRestore.epoch !== epoch) {
        removeOldDisplay(); content.replaceChildren();
        const note = document.createElement('p'); note.textContent = '復元先に切り替わりました。未完了の確認・表示を再開してください。';
        content.append(note); if (receiveTools) content.append(receiveTools.root);
      }
      throw error;
    }
  };
  const adoptProject = async (run: string, opened: Awaited<ReturnType<typeof openValidationHost>>, rememberedMode?: LocalOpenMode) => {
    if (disposed) { await opened.dispose(); return; }
    host = createValidationModeHost(opened, nextMode => ports.open(run, undefined, nextMode), nextMode => ports.selected(run, nextMode));
    receiveTools = createValidationReceiveControls(document, host, () => workspace?.session,
      () => { workspace?.render(); controls(); }, async () => { if (!workspace && !disposed) await mount(); }, () => workspace?.inputPending() ?? false, restoreDisplay);
    selected = run; ports.selected(run, host.mode!.current); navigation.hidden = true; await mount();
    if (disposed) return;
    const current = currentResume();
    if (rememberedMode !== undefined && (!current || current.mode !== rememberedMode)) throw Error('最後のプロジェクトの再開用データを確認できません。');
    resumedLast = rememberedMode !== undefined && !!current; rememberCurrent(); workspace?.render();
    if (resumedLast && current && (!('hasProjectHeader' in workspace!) || !workspace!.hasProjectHeader())) status.textContent = `最後のプロジェクトを再開しました：${current.title}`;
    else if (resumedLast) status.textContent = '';
    // Discover availability without retaining an old host's private report or altering file jobs.
    const target = host;
    try { const available = await target.conversionReportAvailable(); if (!disposed && host === target) coldReport.hidden = !available; }
    catch { if (!disposed && host === target) { coldReport.hidden = false; status.textContent = '変換の説明を確認できません。元ZIPを保管し、説明の保存から再確認してください。'; } }
  };
  const openProject = async (run: string, initial?: ReturnType<typeof prepareValidationCreation>, mode: LocalOpenMode = 'edit', workspaceFile?: Blob, remembered = false) => {
    status.textContent = initial ? 'プロジェクトを作成しています。' : '再開用データを確認しています。';
    await adoptProject(run, await ports.open(run, initial, mode, workspaceFile), remembered ? mode : undefined);
  };
  const invalidateLoci = () => { lociDraft++; lociEvaluation = null; lociDecision = undefined; conversion = null; controls(); };
  const clearConversion = () => { lociDraft++; lociDecision = undefined; conversion = null; lociPreview = null; lociEvaluation = null; lociChoices.hidden = true; conversionPanel.hidden = true; };
  const exportReport = (blob: Blob) => { if (disposed) return; if (reportUrl) URL.revokeObjectURL(reportUrl); reportUrl = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = reportUrl; a.download = 'LociView-conversion-report.json'; a.hidden = true; root.append(a);
    try { a.click(); } finally { a.remove(); } status.textContent = 'ダウンロードを開始しました。元ZIPと説明ファイルの保存先で完了を確認してください。'; };
  const evaluateLoci = async () => {
    const target = lociPreview; if (!target || composing) return; invalidateLoci(); const draft = lociDraft, tuple = lociTuple();
    const evaluated = await target.evaluate(Number(workbook.value), conversionTitle.value, relation.checked);
    if (disposed || lociPreview !== target || draft !== lociDraft || tuple !== lociTuple() || composing) return; lociEvaluation = evaluated; lociDecision = tuple;
    relationLabel.hidden = evaluated.relation.kind !== 'confirmation-required';
    relationNote.textContent = evaluated.relation.kind === 'confirmation-required' ? evaluated.relation.relations.map(r => `${r.sheetGid} → ${r.sheetName}`).join(' / ') :
      evaluated.relation.kind === 'unavailable' ? '表との対応を確認できない視点・材質は有効にしません。' : '';
    const n = evaluated.summary; conversionNote.textContent = evaluated.blocked ? 'この内容は変換できません。説明ファイルで問題を確認してください。' : `LociMyuファイル：モデル ${n.models}・シーン ${n.scenes}・キャプション ${n.captions}・メディア ${n.media}・視点 ${n.views}`;
    conversionHelp.textContent = '元ZIPと変換の説明を別に保管してください。変換後のバックアップや共有ファイルには元データと説明は含まれません。'; controls();
  };
  workbook.addEventListener('change', () => { relation.checked = false; invalidateLoci(); if (!busy) execute(evaluateLoci); });
  conversionTitle.addEventListener('input', invalidateLoci);
  relation.addEventListener('change', () => { invalidateLoci(); if (!busy) execute(evaluateLoci); });
  previewAgain.addEventListener('click', () => execute(evaluateLoci));
  saveReport.addEventListener('click', () => { if (!disposed && !busy && !composing && lociCurrent()) exportReport(lociEvaluation!.report()); });
  coldReport.addEventListener('click', () => execute(async () => { if (composing || workspace?.hasChanges() || reviewWorkspace?.hasChanges() || receiveTools?.hasChanges()) throw Error('入力・操作を確定するか取り消してください。'); const target = host; if (!target) return;
    const report = await target.conversionReport(); if (disposed || host !== target) return; if (!report) { coldReport.hidden = true; return; } exportReport(report); }));
  workspaceInput.addEventListener('change', () => { if (!busy) clearConversion(); });
  cancelConversion.addEventListener('click', () => { if (!busy) { clearConversion(); status.textContent = ''; } });
  convert.addEventListener('click', () => execute(async () => {
    ensureMaySwitch(); if (composing || lociPreview && (!lociCurrent() || lociEvaluation!.blocked) || !lociPreview && !conversion) throw Error('変換する内容を確認してください。');
    status.textContent = 'プロジェクトを変換しています。';
    const initial = await (lociPreview ? lociEvaluation!.create() : conversion!.create()); if (disposed) return;
    const run = (initial.source.proof.identity.projectId as string).slice(4);
    const opened = await ports.open(run, initial);
    if (disposed) { await opened.dispose(); return; }
    await closeCurrent(); await adoptProject(run, opened); clearConversion();
    if (host?.read().state === 'ready' && !host.hasPending()) workspaceInput.value = '';
  }));
  workspaceForm.addEventListener('submit', event => { event.preventDefault(); execute(async () => {
    ensureMaySwitch(); const file = workspaceInput.files?.[0]; if (!file) throw Error('ファイルを選択してください。');
    status.textContent = 'ファイルを確認しています。';
    clearConversion();
    const legacy = await prepareFrozenV1Conversion(file, ports.fileLimits, ports.decode, ports.jpeg, ports.photo); if (disposed) return;
    lociPreview = legacy ? null : await prepareLociMyuConversion(file, ports.fileLimits, ports.decode, ports.jpeg, ports.photo); if (disposed) return;
    const native = legacy || lociPreview ? null : await prepareNativeConversion(file, ports.fileLimits, ports.decode, ports.jpeg, ports.photo); if (disposed) return;
    if (native || legacy) {
      conversion = native ?? legacy; const n = conversion!.summary;
      conversionNote.textContent = `${native ? 'Native' : '旧LociView'}ファイル：モデル ${n.models}・シーン ${n.scenes}・キャプション ${n.captions}・メディア ${n.media}`;
      if (legacy) { const s = legacy.summary.sourceOnly;
        conversionNote.textContent += `。元ファイルだけに保持：編集者情報 ${s.profiles}・削除済み記録 ${s.deletedRecords}・キャッシュ ${s.caches}・削除済み本体 ${s.deletedPayloads}・未使用本体 ${s.unlinkedPayloads}・面の法線 ${s.anchorNormals}`;
        if ('appliedModelOffsets' in legacy.summary && legacy.summary.appliedModelOffsets > 0)
          conversionNote.textContent += '。モデルの保存済み位置補正を適用します。旧画面では反映されていなかった配置です。'; }
      conversionPanel.hidden = false; status.textContent = ''; return;
    }
    if (lociPreview) {
      workbook.replaceChildren(); for (const source of lociPreview.sources) { const option = document.createElement('option'); option.value = String(source.index); option.textContent = `${source.path}（${source.captions}件）`; workbook.append(option); }
      workbook.value = String(lociPreview.selectedSourceIndex); conversionTitle.value = lociPreview.suggestedTitle; relation.checked = false;
      lociChoices.hidden = false; conversionPanel.hidden = false; await evaluateLoci(); status.textContent = ''; return;
    }
    const purpose = (await PackageArchive.inspect(file)).control.manifest.purpose;
    if (purpose === 'review') {
      const view = await prepareReviewView(file, ports.fileLimits, ports.decode, ports.jpeg, ports.photo);
      if (!ports.renderReview) throw Error('閲覧用シーンの表示が未接続です。');
      const prepared = await ports.renderReview(view);
      try {
        if (disposed) return;
        await closeCurrent(); resident = prepared;
        let editAttempt: PreparedReviewEdit | undefined;
        reviewWorkspace = createReviewWorkspace(document, view, prepared.factory, () => execute(async () => {
          status.textContent = '編集コピーを作成しています。';
          editAttempt ??= await PreparedReviewEdit.prepare(file, validationMetadataLimits);
          const opened = await ports.open(editAttempt.run, undefined, 'edit', undefined, editAttempt);
          if (disposed) { await opened.dispose(); return; }
          // Preserve the View, its windows and the exact attempt until an actual recovery-capable Host exists.
          await closeCurrent(); await adoptProject(editAttempt.run, opened);
        })); content.append(reviewWorkspace.root); reviewWorkspace.render();
        selected = null; ports.selected(null); navigation.hidden = true; workspaceInput.value = '';
        status.textContent = '閲覧用シーンを開きました。編集プロジェクトは作成していません。';
      } catch (error) { if (resident === prepared) resident = undefined; throw error; }
      finally { if (resident !== prepared) prepared.dispose(); }
      return;
    }
    const inspected = purpose === 'clean' ? await CleanArchive.inspect(file, validationMetadataLimits) : await WorkspaceArchive.inspect(file, validationMetadataLimits);
    if (disposed) return;
    const run = (inspected.source.proof.identity.projectId as string).slice(4);
    await closeCurrent(); await openProject(run, undefined, 'edit', file);
    if (host?.read().state === 'ready' && !host.hasPending()) workspaceInput.value = '';
  }); });
  form.addEventListener('submit', event => { event.preventDefault(); execute(async () => {
    ensureMaySwitch(); const selection = Array.from(files.files ?? []), name = title.value;
    if (!selection.length) throw Error('3Dモデルを選択してください。');
    if (selection.length > ports.fileLimits.maxItems || selection.reduce((n, f) => n + f.size, 0) > ports.fileLimits.maxFileBytes)
      throw Error('選択したファイルがこの検証の上限を超えています。');
    status.textContent = 'ファイルの内容を確認しています。';
    const models: ValidationFile[] = [], media: ValidationFile[] = [];
    for (const file of selection) {
      const bytes = new Uint8Array(await file.arrayBuffer()); if (disposed) return;
      const item = { label: file.name, bytes };
      if (bytes.length >= 4 && new DataView(bytes.buffer).getUint32(0, true) === 0x46546c67) models.push(item);
      else if (isAdditionalPhoto(bytes) || isJpeg(bytes) || [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) media.push(item);
      else throw Error('この検証では静的GLBとPNG/JPEG/WebP/GIF画像を選択してください。元のファイルは変更していません。');
    }
    const run = newId(), initial = prepareValidationCreation(await prepareValidationProject({ run, title: name, models, media }, ports.fileLimits, ports.decode, ports.jpeg, ports.photo), 'map2');
    if (disposed) return; await closeCurrent(); await openProject(run, initial);
    // Clear the selection only after creation is actually ready; the host retains exact retry input otherwise.
    if (host?.read().state === 'ready') files.value = '';
  }); });
  back.addEventListener('click', () => { void selectProject(); });
  refresh.addEventListener('click', () => execute(updateList));
  execute(async () => {
    if (initialRun !== undefined) {
      if (!projectResumeReference({ run: initialRun, mode: initialMode })) { await updateList(); status.textContent = '指定されたプロジェクトを確認できません。一覧またはファイルから開いてください。'; return; }
      try { await openProject(initialRun, undefined, initialMode); }
      catch (error) { if (!host && !disposed) await updateList(); throw error; }
      return;
    }
    await updateList(); if (disposed) return;
    let reference: ProjectResumeReference | null = null;
    try { reference = projectResumeReference(ports.lastProject?.read()); } catch { /* No advisory hint is a normal selector start. */ }
    if (!reference) return;
    if (!catalog.some(entry => entry.run === reference.run && entry.state === 'ready')) {
      status.textContent = '最後のプロジェクトを再開できません。一覧またはファイルから開いてください。'; return;
    }
    try { await openProject(reference.run, undefined, reference.mode, undefined, true); }
    catch {
      // Automatic opening never traps the selector behind a pending/recovery guard.
      try { await closeCurrent(); } finally {
        if (!disposed) {
          selected = null; ports.selected(null); navigation.hidden = false;
          await updateList(); if (!disposed) status.textContent = '最後のプロジェクトを再開できません。一覧またはファイルから開いてください。';
        }
      }
    }
  });
  return { root, hasChanges: () => busy || composing || changed() || !navigation.hidden && (!!workspaceInput.files?.length || !!files.files?.length || title.value !== '新しいプロジェクト'),
    async dispose() { if (disposed) return; disposed = true;
      try { await operation; } catch { /* Original input and saved failure are never acknowledged here. */ }
      await closeCurrent(); root.remove(); }, get selected() { return selected; } };
}
