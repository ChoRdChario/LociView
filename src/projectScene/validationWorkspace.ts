import { inspectZipContainerMetadata } from '../assets/zipio';
import type {DesktopOfflinePort} from '../platform/desktopOfflinePorts';
import {createOfflineControls,createOfflineSettings} from '../ui/projectScene/offlineControls';
import { mountContextHelp } from '../ui/projectScene/contextHelp';
import { PACKAGE_LIMITS } from '../projectPackage/contract';
import type {WorkspaceFileInteraction} from '../ui/projectScene/projectWorkspacePorts';
import type {createProductWorkspace} from './productWorkspace';
import { isPointPly } from '../projectFiles/pointPly';
import { classifyMeshSource, inspectMeshSource } from '../projectFiles/meshSource';
import { isAdditionalPhoto, freshPhotoSelectionIssue, type PhotoDecoder } from '../projectFiles/photo';
import { hasTimedOrHeicSignature, isHeic, inspectProjectMedia, type MediaDecoders } from '../projectFiles/media';
import { projectResumeReference, type ProjectResumeReference } from '../ui/resumeReference';
import { newId } from '../projectMetadata/persistence';
import { prepareValidationProject, validationModelFile, type ValidationModelFile, type ValidationFile } from '../projectFiles/initialProject';
import { prepareValidationCreation } from '../projectFiles/creation';
import { prepareNativeConversion } from '../projectFiles/nativeConversion';
import {createMaterialConversionNotice} from '../ui/projectScene/conversionNotice';
import { prepareFrozenV1Conversion } from '../projectFiles/frozenV1Conversion';
import { prepareLociMyuConversion } from '../projectFiles/lociMyuConversion';
import { validationMetadataLimits, projectFilePolicy, type FileValidationLimits, type ProjectFilePolicy } from '../projectFiles/validation';
import { WorkspaceArchive } from '../projectPackage/workspaceArchive';
import { CleanArchive } from '../projectPackage/cleanArchive';
import { PackageArchive } from '../projectPackage/zipArchive';
import { BackupArchive } from '../projectPackage/backupArchive';
import type { PngDecoder } from '../projectFiles/png';
import { isJpeg, type JpegDecoder } from '../projectFiles/jpeg';
import type { openValidationHost, ValidationHostOptions, ValidationNormalHost, FirstBackupRecovery } from './validationHost';
import { createValidationModeHost, type ValidationDisplayHost } from './validationModeHost';
import type { LocalOpenMode } from './hostPorts';
import type { ValidationProjectEntry } from './validationCatalog';
import type { ModelCandidateRenderer } from './modelCandidatePreview';
import type { ViewportFactory } from './viewportPorts';
import { createValidationReceiveControls } from './validationReceiveControls';
import { prepareReviewView, type ReviewView } from './reviewView';
import { createReviewWorkspace } from './reviewWorkspace';
import { PreparedReviewEdit, type ReviewEditArchivePort } from '../projectPackage/reviewEdit';
import { createDeferredViewport } from './deferredViewport';

type Host = ReturnType<typeof createValidationModeHost>;
export interface MountedEditor {
 readonly root:HTMLElement;readonly session:WorkspaceFileInteraction|undefined;
 render():void;hasProjectHeader?():boolean;inputPending(includePresentation?:boolean):boolean;hasChanges(includePresentation?:boolean):boolean;unmount():void;dispose():Promise<void>;
}
export type MountedEditorFactory=(host:Host,factory:ViewportFactory,tools:ReturnType<typeof createValidationReceiveControls>|undefined,
 renderCandidate:ModelCandidateRenderer|undefined,navigation:NonNullable<Parameters<typeof createProductWorkspace>[5]>)=>MountedEditor;
export interface ValidationWorkspacePorts {
  offline?:DesktopOfflinePort;
  fileLimits: FileValidationLimits; filePolicy?: ProjectFilePolicy; decode?: PngDecoder; jpeg?: JpegDecoder; photo?: PhotoDecoder; mediaDecoders?:MediaDecoders;
  mountEditor:MountedEditorFactory;
  progressivePresentation?:boolean;
  smoothDisplay?:boolean;
  introduction?:string;
  initialFiles?:readonly File[];
  openLegacy?(file?:File):Promise<void>;
  reviewEditArchive?:ReviewEditArchivePort;
  storageEstimate?(): Promise<Readonly<{ usage?: number; quota?: number }>>;
  localSettings?: { read(): string; save(displayName: string): boolean };
  lastProject?: { read(): ProjectResumeReference | null; remember(reference: ProjectResumeReference): void };
  list(): Promise<ValidationProjectEntry[]>;
  open(run: string, initial?: ReturnType<typeof prepareValidationCreation>, mode?: LocalOpenMode, workspaceFile?: Blob, reviewEdit?: PreparedReviewEdit,
    firstBackup?: ValidationHostOptions['firstBackup']): Promise<ValidationNormalHost | FirstBackupRecovery>;
  render(host: ValidationDisplayHost): Promise<{ factory: ViewportFactory; readonly ready?:Promise<void>; detachPreparation?():void; dispose(): void }>;
  renderReview?(view: ReviewView): Promise<{ factory: ViewportFactory; dispose(): void }>;
  renderModelCandidate?(host: ValidationDisplayHost, display: Parameters<ModelCandidateRenderer>[0]): ReturnType<ModelCandidateRenderer>;
  selected(run: string | null, mode?: LocalOpenMode): void;
}

/** One opt-in selector/editor. A switch is refused while input/save/IME is pending. */
export function createValidationWorkspace(document: Document, ports: ValidationWorkspacePorts, initialRun?: string, initialMode: LocalOpenMode = 'edit') {
  const policy=projectFilePolicy(ports.filePolicy ?? ports.fileLimits);
  const root = document.createElement('section'), navigation = document.createElement('section'), content = document.createElement('section');
  const stopHelp = mountContextHelp(document, root);
  root.className = 'lv-validation-host'; navigation.className = 'lv-validation-home'; content.className = 'lv-validation-content';
  const offline=ports.offline?createOfflineControls(document,ports.offline):undefined;
  const homeSettings=offline?createOfflineSettings(document,offline.root):undefined;
  if(homeSettings)root.append(homeSettings.root);
  const heading = document.createElement('h1'); heading.textContent = 'LociView';
  const help = document.createElement('p'); help.textContent = ports.introduction ?? 'LociViewは、3Dモデルに記録を付け、ファイルで作業を受け渡すアプリです。';
  const legacy=document.createElement('button');legacy.type='button';legacy.textContent='以前のプロジェクトを開く';legacy.hidden=!ports.openLegacy;
  const fallback=document.createElement('button');fallback.type='button';fallback.textContent='元の形式で開く';fallback.hidden=true;let legacyFile:File|undefined;
  const form = document.createElement('form'), title = document.createElement('input'), creationNote = document.createElement('p'), cancelSelection = document.createElement('button');
  title.value = '新しいプロジェクト'; title.maxLength = 256; title.setAttribute('aria-label', 'プロジェクト名');
  const create = document.createElement('button'); create.textContent = 'プロジェクトを作成'; create.type = 'submit';
  cancelSelection.type = 'button'; cancelSelection.textContent = '選択を取り消す';
  const titleLabel = document.createElement('label'); titleLabel.textContent = 'プロジェクト名';
  titleLabel.append(title); form.append(creationNote, titleLabel, create); form.hidden = true;
  const workspaceForm = document.createElement('form'), workspaceLabel = document.createElement('label'), workspaceInput = document.createElement('input'), openFile = document.createElement('button');
  workspaceLabel.textContent = 'ファイルを選択'; workspaceInput.type = 'file'; workspaceInput.multiple = true; workspaceInput.setAttribute('aria-label', 'ファイルを選択'); workspaceLabel.append(workspaceInput);
  openFile.type = 'submit'; openFile.textContent = 'ファイルを開く'; workspaceForm.append(workspaceLabel, openFile,fallback);
  const conversionPanel = document.createElement('section'), conversionNote = document.createElement('p'), conversionHelp = document.createElement('p');
  const materialNotice=createMaterialConversionNotice(document,ports.smoothDisplay);
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
  lociChoices.append(workbookLabel, conversionTitleLabel, relationNote, relationLabel, previewAgain); lociChoices.hidden = true; conversionPanel.replaceChildren(lociChoices, conversionNote, materialNotice.root,conversionHelp, saveReport, convert, cancelConversion);
  const coldReport = document.createElement('button'); coldReport.type = 'button'; coldReport.textContent = '変換の説明を保存'; coldReport.hidden = true; root.append(coldReport);
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'lv-operation-status lv-validation-status';
  const list = document.createElement('section'), refresh = document.createElement('button'), back = document.createElement('button');
  refresh.type = back.type = 'button'; refresh.textContent = '一覧を更新'; back.textContent = '別のプロジェクトを開く';
  const listHeading = document.createElement('h2'); listHeading.textContent = 'このブラウザの再開用データ';
  navigation.append(heading, help, workspaceForm, form, listHeading, refresh, list,legacy); root.append(back, status, cancelSelection, navigation, content);
  let host: Host | undefined, workspace: MountedEditor | undefined;
  let presentation:{busy:boolean;reason:string}|null=null;
  let presentationState=()=>presentation;
  let stopPresentation!:()=>void;const presentationStopped=new Promise<void>(resolve=>{stopPresentation=resolve;});
  const untilOpen=<T>(work:Promise<T>)=>Promise.race([work,presentationStopped.then(()=>{throw new DOMException('画面を閉じました。','AbortError');})]);
  let reviewEditAttempt:PreparedReviewEdit|undefined;
  let reviewWorkspace: ReturnType<typeof createReviewWorkspace> | undefined;
  let firstRecovery: FirstBackupRecovery | undefined;
  const firstRecoveryButtons = new Set<HTMLButtonElement>();
  let receiveTools: ReturnType<typeof createValidationReceiveControls> | undefined;
  let resident: Awaited<ReturnType<ValidationWorkspacePorts['render']>> | undefined;
  let busy = false, disposed = false, composing = false, selected: string | null = null, operation: Promise<void> | undefined;
  let conversion: Awaited<ReturnType<typeof prepareNativeConversion>> | Awaited<ReturnType<typeof prepareFrozenV1Conversion>> = null;
  let lociPreview: Awaited<ReturnType<typeof prepareLociMyuConversion>> = null;
  let lociEvaluation: Awaited<ReturnType<NonNullable<Awaited<ReturnType<typeof prepareLociMyuConversion>>>['evaluate']>> | null = null;
  let lociDraft = 0, lociDecision: string | undefined;
  let selectionGeneration = 0, creationDraft = 0, selectionPending = false;
  let nativeSelectionChecking = false, selectionAbort: AbortController | undefined;
  let rawSelection: { models: ValidationModelFile[]; media: ValidationFile[] } | undefined;
  let creationAttempt: { run: string; initial: ReturnType<typeof prepareValidationCreation>; opened?: true; candidate?: ValidationNormalHost } | undefined;
  let selectionHost: Host | undefined;
  const lociTuple = () => JSON.stringify([workbook.value, conversionTitle.value, relation.checked]);
  const lociCurrent = () => !!lociEvaluation && lociDecision === lociTuple();
  let reportUrl: string | undefined;
  let mounted = false, resumedLast = false, confirmingResume = false, lastRemembered: string | undefined;
  let catalog: readonly ValidationProjectEntry[] = [];
  const changed = () => !!workspace?.hasChanges() || !!reviewWorkspace?.hasChanges() || !!receiveTools?.hasChanges() || !!host?.hasPending() || !!firstRecovery;
  const openNormal = async (...args: Parameters<ValidationWorkspacePorts['open']>): Promise<ValidationNormalHost> => {
    const opened = await ports.open(...args); if ('kind' in opened) { await opened.dispose(); throw Error('バックアップの初回復元を一覧から再開してください。'); } return opened;
  };
  const controls = () => { navigation.inert = busy; openFile.disabled = create.disabled = cancelConversion.disabled = busy || composing;
    if(offline&&homeSettings){if(offline.root.parentElement===homeSettings.body){if(!homeSettings.root.parentElement)root.insertBefore(homeSettings.root,navigation);}
      else{homeSettings.root.open=false;homeSettings.root.remove();}}
    status.setAttribute('data-busy',String(busy)); status.setAttribute('aria-busy',String(busy));
    for (const button of firstRecoveryButtons) button.disabled = busy;
    workspaceInput.disabled = title.disabled = busy || !!creationAttempt;
    cancelSelection.disabled = busy && !nativeSelectionChecking || composing || !!creationAttempt;
    cancelSelection.hidden = !selectionPending || !conversionPanel.hidden;
    openFile.hidden = !form.hidden || !conversionPanel.hidden;
    create.textContent = creationAttempt ? '作成を再試行' : 'プロジェクトを作成';
    convert.disabled = busy || composing || !!lociPreview && (!lociCurrent() || lociEvaluation!.blocked);
    saveReport.hidden = !lociPreview && !(conversion && 'report' in conversion && conversion.report);
    saveReport.disabled = busy || composing || (!!lociPreview ? !lociCurrent() : !conversion || !('report' in conversion) || !conversion.report); previewAgain.disabled = busy || composing;
    legacy.disabled=fallback.disabled=busy||composing;
    workbook.disabled = conversionTitle.disabled = relation.disabled = busy;
    coldReport.disabled = busy || composing || !!workspace?.hasChanges() || !!reviewWorkspace?.hasChanges() || !!receiveTools?.hasChanges(); back.disabled = busy;
    back.hidden = !host && !reviewWorkspace || !!workspace && !!workspace.hasProjectHeader?.(); };
  title.addEventListener('compositionstart', () => { composing = true; creationDraft++; controls(); });
  title.addEventListener('compositionend', () => { composing = false; creationDraft++; controls(); });
  title.addEventListener('input', () => { creationDraft++; });
  conversionTitle.addEventListener('compositionstart', () => { composing = true; invalidateLoci(); controls(); });
  conversionTitle.addEventListener('compositionend', () => { composing = false; invalidateLoci(); controls(); });
  const execute = (action: () => Promise<void>) => {
    if (busy || disposed) return; busy = true; controls(); workspace?.render();
    const work = action(); operation = work;
    return work.catch(error => { if (!disposed) status.textContent = error instanceof Error ? error.message : '処理できません。入力と再開用データは保持しています。'; })
      .finally(() => { busy = false; if (operation === work) operation = undefined; if (!disposed) { controls(); workspace?.render(); } });
  };
  const closeCurrent = async () => {
    const oldWorkspace=workspace,oldHost=host,oldResident=resident,oldReview=reviewWorkspace,oldAttempt=reviewEditAttempt,oldTools=receiveTools,oldRecovery=firstRecovery;
    mounted=false;presentation=null;presentationState=()=>presentation;resumedLast=false;confirmingResume=false;workspace=undefined;host=undefined;resident=undefined;reviewWorkspace=undefined;reviewEditAttempt=undefined;receiveTools=undefined;firstRecovery=undefined;
    coldReport.hidden=true;if(reportUrl)URL.revokeObjectURL(reportUrl);reportUrl=undefined;firstRecoveryButtons.clear();
    const errors:unknown[]=[],attempt=async(action:()=>unknown)=>{try{await action();return true;}catch(error){errors.push(error);return false;}};
    await attempt(()=>oldReview?.dispose());await attempt(()=>oldAttempt?.releaseScratch());
    const workspaceClosed=await attempt(()=>oldWorkspace?.dispose());if(!oldWorkspace||!workspaceClosed)await attempt(()=>oldHost?.dispose());
    await attempt(()=>oldResident?.dispose());await attempt(()=>oldTools?.dispose());await attempt(()=>oldRecovery?.dispose());content.replaceChildren();
    if(errors.length){navigation.hidden=false;selected=null;ports.selected(null);throw new AggregateError(errors,'画面の終了処理を完了できませんでした。再読み込みしてから再開してください。保存済みの記録は保持しています。');}
  };
  const ensureMaySwitch = () => {
    if (composing || changed()) throw Error('入力・更新を確定するか、取り消してからプロジェクトを切り替えてください。');
  };
  const ensureMayLeaveSelection = () => {
    ensureMaySwitch();
    const current = host?.read();
    // Explicit return may leave a saved Project whose renderer failed; it is not a mounted/resume acknowledgment.
    if (selectionHost && selectionHost === host && current?.state === 'ready' && current.publication && current.source && !host!.hasPending()) clearSelection();
    if (selectionPending || rawSelection || creationAttempt || !conversionPanel.hidden)
      throw Error('選択した内容の確認・作成を終えるか、選択を取り消してください。');
  };
  function selectProject() { return execute(async () => {
    ensureMayLeaveSelection(); await closeCurrent(); selected = null; ports.selected(null); navigation.hidden = false; status.textContent = ''; await updateList();
  }); }
  const currentResume = (presentationOnly = false) => {
    if ((!mounted && !presentationOnly) || disposed || !host || !workspace || workspace.hasChanges(!presentationOnly) || workspace.inputPending(!presentationOnly) || !selected || host.hasPending() ||
      workspace.hasProjectHeader && !workspace.hasProjectHeader()) return null;
    const current = host.read(), provider = current.provider;
    if (current.state !== 'ready' || !current.publication || provider?.kind !== 'scene-provider' || current.source?.token !== provider.token ||
      current.source.proof.identity.projectId !== `prj_${selected}`) return null;
    const field = provider.inspection.candidates.fields.find(f => f.path.length === 2 && f.path[0] === 'project' && f.path[1] === 'title');
    const value = field?.valid && field.candidates.length === 1 ? field.candidates[0]?.value : undefined;
    return value?.kind === 'value' && typeof value.value === 'string' && value.value.trim() ? { run: selected, mode: host.mode!.current, title: value.value } : null;
  };
  const rememberCurrent = () => {
    const current = currentResume(); if (confirmingResume || !current || !ports.lastProject) return;
    const reference = { run: current.run, mode: current.mode }, key = JSON.stringify(reference);
    if (lastRemembered === key) return; lastRemembered = key;
    try { ports.lastProject.remember(reference); } catch { /* Advisory settings never change a successful Project acknowledgment. */ }
  };
  const updateList = async () => {
    const entries = await ports.list(); if (disposed) return;
    catalog = entries;
    list.replaceChildren();
    if (!entries.length) { list.textContent = 'このブラウザの再開用データはありません。'; return; }
    for (const item of entries) {
      const row = document.createElement('p'), name = document.createElement('span');
      name.textContent = `${item.title} — ${item.state === 'ready' ? '再開用データ' : item.state === 'incomplete' ? '更新が未完了' : '要確認'} `;
      row.append(name);
      for (const mode of item.firstRestore === 'terminal' ? [] : item.firstRestore === 'pending' ? ['edit'] as const : ['view', 'edit'] as const) {
        const open = document.createElement('button'); open.type = 'button';
        open.textContent = item.firstRestore === 'pending' ? '復元を再開' : mode === 'view' ? '閲覧で開く' : '編集で開く';
        open.addEventListener('click', () => execute(async () => { ensureMayLeaveSelection(); await closeCurrent(); await openProject(item.run, undefined, mode); }));
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
      retry.hidden = host.mode?.current === 'view' || host.workspaceFiles.initialImport && host.read().state === 'empty' ||
        !!host.workspaceFiles.reviewCopyError || host.workspaceFiles.reviewCopies.some(j => !['completed', 'abandoned'].includes(j.state)) ||
        host.backupRestore.pending || !!host.workspaceFiles.jobs.some(j => !['completed', 'cancelled', 'abandoned'].includes(j.state));
      const recoveryHost = host, recovery = recoveryHost.authority.nativeConversionRecovery;
      if (!recoveryHost.authority.readOnly && recovery && await recovery.sourceRequired()) {
        if (disposed || host !== recoveryHost) return;
        const label = document.createElement('label'), input = document.createElement('input'), resume = document.createElement('button');
        label.textContent = '変換元のファイル'; input.type = 'file'; input.accept = '.zip'; input.setAttribute('aria-label','変換元のファイル'); label.append(input);
        resume.type = 'button'; resume.textContent = '変換を再開'; resume.disabled = true;
        input.addEventListener('change', () => {resume.disabled = !input.files?.length;});
        resume.addEventListener('click', () => execute(async () => {const file = input.files?.[0]; if (!file || host !== recoveryHost) return; await recovery.reselect(file); await mount();}));
        note.textContent = '変換元の保存が完了していません。同じファイルを選択すると、途中から再開できます。'; retry.hidden = true; content.append(label,resume);
      }
      if (host.mode?.current === 'view') {
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '編集する';
        edit.addEventListener('click', () => execute(async () => {
          await host!.mode!.change('edit', host!.read().source?.token, () => {}); await mount();
        }));
        note.textContent = `更新が未完了です。編集を開始して復旧してください。${host.mode.detail}`; content.append(edit);
      }
      return;
    }
    // File recovery must remain available even if renderer preparation fails or stalls.
    if (receiveTools) { receiveTools.render(); content.append(receiveTools.root); }
    if(ports.progressivePresentation&&!prepared){
      status.textContent='';
      const target=host,token=target.read().source?.token,bridge=createDeferredViewport();
      const retry=document.createElement('button');retry.type='button';retry.textContent='モデルを再読み込み';retry.hidden=true;
      const current=()=>!disposed&&host===target&&target.read().source?.token===token;
      let checked=false;
      const state=()=>presentation;
      presentationState=state;
      const refresh=()=>{if(!current())return;mounted=checked&&!state();if(mounted&&selectionHost===target&&!target.hasPending())clearSelection();rememberCurrent();controls();};
      presentation={busy:true,reason:'モデルを読み込んでいます。記録は閲覧・検索できます。'};
      workspace=ports.mountEditor(target,bridge.factory,receiveTools,ports.renderModelCandidate?display=>ports.renderModelCandidate!(target,display):undefined,
        {utilitiesRoot:offline?.root,smoothDisplay:ports.smoothDisplay,presentation:state,projectNavigationBlocked:()=>busy,openProject:()=>{void selectProject();},resumedLastProject:()=>resumedLast,storageEstimate:ports.storageEstimate,localSettings:ports.localSettings,changed:refresh});
      content.replaceChildren(workspace.root,retry);workspace.render();
      const load=async()=>{
        checked=false;mounted=false;presentation={busy:true,reason:'モデルを読み込んでいます。記録は閲覧・検索できます。'};retry.hidden=true;resident?.detachPreparation?.();workspace?.render();
        try{
          const next=await untilOpen(ports.render(target).then(value=>{if(!current()){value.dispose();throw Error('表示先が変わりました。');}return value;}));
          if(!next)throw Error('表示の準備を確認できません。');
          if(!current()){next.dispose();return;}
          const previous=resident;resident=next;try{bridge.attach(next.factory);}finally{previous?.dispose();}
          await untilOpen(next.ready??Promise.resolve());if(!current())return;
          checked=true;presentation=null;workspace?.render();refresh();
          if(target.backupRestore.needsDisplay){target.backupRestore.displayReady(token!);workspace?.render();}
        }catch(error){if(!current())return;presentation={busy:false,reason:error instanceof Error?error.message:'モデルを読み込めません。記録と原本は保持しています。'};retry.hidden=false;workspace?.render();controls();}
      };
      retry.addEventListener('click',()=>{void execute(load);});
      await load();status.textContent='';return;
    }
    presentation=null;presentationState=()=>presentation;
    status.textContent = 'モデルを読み込んでいます。';
    const target = host, token = target.read().source?.token, next = prepared ?? await ports.render(target);
    await next.ready;
    if (disposed || host !== target) { next.dispose(); return; }
    resident = next;
    const fileTools = receiveTools;
    try { workspace=ports.mountEditor(target,next.factory,fileTools,
      ports.renderModelCandidate ? display=>ports.renderModelCandidate!(target,display) : undefined,
      {utilitiesRoot:offline?.root,smoothDisplay:ports.smoothDisplay,projectNavigationBlocked:()=>busy,openProject:()=>{void selectProject();},resumedLastProject:()=>resumedLast,storageEstimate:ports.storageEstimate,localSettings:ports.localSettings,
        changed:()=>{rememberCurrent();controls();}});
      content.replaceChildren(workspace.root); workspace.render();
      if (target.backupRestore.needsDisplay) { target.backupRestore.displayReady(target.read().source!.token); workspace.render(); } }
    catch (error) { workspace?.unmount(); workspace = undefined; next.dispose(); resident = undefined; throw error; }
    mounted = token === target.read().source?.token;
    if (mounted && selectionHost === target && target.read().state === 'ready' && !target.hasPending()) clearSelection();
    status.textContent = '';
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
          content: { model: record => readContent!.model(record), modelContent: record => readContent!.modelContent(record) },
          setDisplayPreparation(callback) { stagedPrepare = callback; return () => { if (stagedPrepare === callback) stagedPrepare = undefined; }; } });
        await staged.ready;
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
  const adoptProject = async (run: string, opened: Awaited<ReturnType<typeof openValidationHost>>, rememberedMode?: LocalOpenMode,
    prepared?: Awaited<ReturnType<ValidationWorkspacePorts['render']>>, preparation?: Parameters<ValidationDisplayHost['setDisplayPreparation']>[0]) => {
    if (disposed) { await opened.dispose(); return; }
    host = createValidationModeHost(opened, nextMode => openNormal(run, undefined, nextMode), nextMode => ports.selected(run, nextMode));
    if (selectionPending) selectionHost = host;
    receiveTools = createValidationReceiveControls(document, host, () => workspace?.session,
      () => { workspace?.render(); controls(); }, async () => { if (!workspace && !disposed) await mount(); }, recovery =>
        !!presentationState()?.busy || !recovery && !!presentationState() || (workspace?.inputPending(!recovery) ?? false), restoreDisplay);
    selected = run; ports.selected(run, host.mode!.current); navigation.hidden = true;
    const openingHost = host, openingToken = host.read().source?.token;
    confirmingResume = rememberedMode !== undefined;
    const detach = preparation ? host.setDisplayPreparation(preparation) : undefined;
    await mount(prepared ? { factory: prepared.factory, dispose: () => { detach?.(); prepared.dispose(); } } : undefined);
    if (disposed) return;
    const current = currentResume();
    // A failed initial presentation can retain its readable metadata, but never
    // excuse a pending/stale Host or a different Project, title or requested mode.
    const readable = current ?? (ports.progressivePresentation && !prepared && presentation && host === openingHost &&
      host.read().source?.token === openingToken ? currentResume(true) : null);
    if (rememberedMode !== undefined && (!readable || readable.mode !== rememberedMode)) throw Error('最後のプロジェクトの再開用データを確認できません。');
    confirmingResume = false;
    resumedLast = rememberedMode !== undefined && !!current; rememberCurrent(); workspace?.render();
    if (resumedLast && current && (!workspace?.hasProjectHeader?.())) status.textContent = `最後のプロジェクトを再開しました：${current.title}`;
    else if (resumedLast) status.textContent = '';
    // Discover availability without retaining an old host's private report or altering file jobs.
    const target = host;
    try { const available = await target.conversionReportAvailable(); if (!disposed && host === target) coldReport.hidden = !available; }
    catch { if (!disposed && host === target) { coldReport.hidden = false; status.textContent = '変換の説明を確認できません。元ZIPを保管し、説明の保存から再確認してください。'; } }
  };
  const openProject = async (run: string, initial?: ReturnType<typeof prepareValidationCreation>, mode: LocalOpenMode = 'edit', workspaceFile?: Blob, remembered = false) => {
    status.textContent = initial ? 'プロジェクトを作成しています。' : '再開用データを確認しています。';
    const opened = await ports.open(run, initial, mode, workspaceFile);
    if ('kind' in opened) { if (disposed) { await opened.dispose(); return; } firstRecovery = opened; selected = run; navigation.hidden = true; renderFirstRecovery(); return; }
    await adoptProject(run, opened, remembered ? mode : undefined);
  };
  const renderFirstRecovery = () => {
    const target = firstRecovery; if (!target || disposed) return;
    firstRecoveryButtons.clear();
    const state = target.state(), panel = document.createElement('section'), note = document.createElement('p'), commands = document.createElement('div');
    note.textContent = state.error || (state.phase === 'preview' ? state.replacing
      ? 'バックアップの時点に切り替えます。現在の作業と元ファイルは残ります。' : 'このプロジェクトの再開用データはありません。バックアップから元のプロジェクトを復元します。元ファイルは変更しません。'
      : state.phase === 'terminal' ? 'プロジェクトはまだありません。復元の記録は保持しています。ファイルを選択して開き直せます。' : 'バックアップの初回復元が未完了です。記録を使って再開するか、取りやめてください。');
    const summary = document.createElement('p'); summary.textContent = `${state.title}${state.fileName ? ` — ${state.fileName}` : ''}${state.memo ? ` — ${state.memo}` : ''}`;
    const button = (label: string, action: () => Promise<void>) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      firstRecoveryButtons.add(b); b.addEventListener('click', () => { if (!b.disabled) execute(action); }); commands.append(b); };
    const leave = async (cancel: boolean) => { if (cancel) await (state.phase === 'beforeStart' ? target.abandon() : target.cancel());
      await closeCurrent(); clearSelection(); selected = null; ports.selected(null); navigation.hidden = false; await updateList(); status.textContent = ''; };
    if (target.readOnly) button('編集する', async () => {
      try { const candidate = await target.edit(); if (disposed || firstRecovery !== target) { await candidate.dispose(); return; }
        await closeCurrent();
        if ('kind' in candidate) { firstRecovery = candidate; renderFirstRecovery(); } else await adoptProject(target.run, candidate);
      } catch (error) { renderFirstRecovery(); throw error; }
    });
    else if (state.phase === 'preview' || state.phase === 'pending' && state.retryable) button(state.phase === 'preview' ? 'バックアップから復元' : '復元を再開', async () => {
      status.textContent = 'バックアップから復元しています。';
      let staged: Awaited<ReturnType<ValidationWorkspacePorts['render']>> | undefined,
        preparation: Parameters<ValidationDisplayHost['setDisplayPreparation']>[0] | undefined, sourceContent: ValidationNormalHost['content'] | undefined;
      try {
        const opened = await target[state.phase === 'preview' ? 'confirm' : 'retry'](async (next, content) => {
          if (disposed || firstRecovery !== target) throw Error('画面を閉じました。復元記録は保持しています。');
          sourceContent = content; staged = await ports.render({ authority: { readOnly: true, read: () => next,  },
            content: { model: record => sourceContent!.model(record), modelContent: record => sourceContent!.modelContent(record) },
            setDisplayPreparation(callback) { preparation = callback; return () => { if (preparation === callback) preparation = undefined; }; } });
          await staged.ready;
          if (disposed || firstRecovery !== target) throw Error('画面を閉じました。復元記録は保持しています。');
        });
        if (disposed || firstRecovery !== target) { await opened.dispose(); return; }
        sourceContent = opened.content; await closeCurrent();
        const prepared = staged; staged = undefined; await adoptProject(target.run, opened, undefined, prepared, preparation);
      } catch (error) { renderFirstRecovery(); throw error; } finally { staged?.dispose(); }
    });
    if ((!target.readOnly || state.phase === 'preview') && state.cancellable) button(state.phase === 'preview' ? 'キャンセル' : '復元を取りやめる', () => leave(true));
    if (state.phase === 'terminal') button('一覧に戻る', () => leave(false));
    panel.append(summary, note, commands); content.replaceChildren(panel); controls();
  };
  const invalidateLoci = () => { lociDraft++; lociEvaluation = null; lociDecision = undefined; conversion = null;materialNotice.render(); controls(); };
  const clearConversion = () => { legacyFile=undefined;fallback.hidden=true; lociDraft++; lociDecision = undefined; conversion = null; lociPreview = null; lociEvaluation = null; lociChoices.hidden = true; conversionPanel.hidden = true;materialNotice.render(); };
  const clearSelection = () => {
    selectionAbort?.abort(); selectionAbort = undefined; nativeSelectionChecking = false;
    selectionGeneration++; creationDraft++; selectionPending = false; rawSelection = undefined; creationAttempt = undefined; selectionHost = undefined;
    form.hidden = true; title.value = '新しいプロジェクト'; workspaceInput.value = ''; clearConversion(); controls();
  };
  const selectionContext = () => ({ host, workspace, reviewWorkspace, token: host?.read().source?.token });
  const selectionCurrent = (generation: number, context: ReturnType<typeof selectionContext>) =>
    !disposed && !composing && generation === selectionGeneration && host === context.host && workspace === context.workspace &&
    reviewWorkspace === context.reviewWorkspace && host?.read().source?.token === context.token;
  const guardSelection = (generation: number, context: ReturnType<typeof selectionContext>) => {
    if (!selectionCurrent(generation, context)) return false;
    ensureMaySwitch(); return true;
  };
  const replaceSelection = async (run: string, opened: ValidationNormalHost, generation: number, context: ReturnType<typeof selectionContext>) => {
    try { if (!guardSelection(generation, context)) { await opened.dispose(); return; } }
    catch (error) { await opened.dispose(); throw error; }
    await closeCurrent(); await adoptProject(run, opened);
  };
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
    materialNotice.render(n.materialNotices as Parameters<typeof materialNotice.render>[0]);
    const effects = n.materialEffects as { scenes: number; overrides: number; sourceOnlyChromaRows: number } | null | undefined;
    const materialIssue = n.materialIssue as { field: string; reason: string } | null | undefined;
    if (evaluated.blocked && materialIssue) conversionNote.textContent += ` ${materialIssue.field}：${materialIssue.reason}`;
    if (!evaluated.blocked && effects) {
      conversionNote.textContent += `。材質の見え方：${effects.scenes}シーン・${effects.overrides}件`;
      if (Number(effects.sourceOnlyChromaRows) > 0) conversionNote.textContent += '。色の透過が無効なときの色・許容範囲・ぼかしは、元のZIPと説明ファイルだけに残り、変換後の編集値には引き継ぎません。';
    }
    conversionHelp.textContent = '元ZIPと変換の説明を別に保管してください。変換後のバックアップや共有ファイルには元データと説明は含まれません。'; controls();
  };
  workbook.addEventListener('change', () => { relation.checked = false; invalidateLoci(); if (!busy) execute(evaluateLoci); });
  conversionTitle.addEventListener('input', invalidateLoci);
  relation.addEventListener('change', () => { invalidateLoci(); if (!busy) execute(evaluateLoci); });
  previewAgain.addEventListener('click', () => execute(evaluateLoci));
  saveReport.addEventListener('click', () => { if (disposed || busy || composing) return;
    if (lociPreview && lociCurrent()) exportReport(lociEvaluation!.report());
    else if (conversion && 'report' in conversion && conversion.report) exportReport(conversion.report()); });
  coldReport.addEventListener('click', () => execute(async () => { if (composing || workspace?.hasChanges() || reviewWorkspace?.hasChanges() || receiveTools?.hasChanges()) throw Error('入力・操作を確定するか取り消してください。'); const target = host; if (!target) return;
    const report = await target.conversionReport(); if (disposed || host !== target) return; if (!report) { coldReport.hidden = true; return; } exportReport(report); }));
  workspaceInput.addEventListener('change', () => {
    if (creationAttempt) return;
    selectionGeneration++; creationDraft++; selectionPending = !!workspaceInput.files?.length; rawSelection = undefined;
    form.hidden = true; title.value = '新しいプロジェクト'; clearConversion(); controls();
  });
  cancelSelection.addEventListener('click', () => { if ((!busy || nativeSelectionChecking) && !composing && !creationAttempt) { clearSelection(); status.textContent = ''; } });
  cancelConversion.addEventListener('click', () => { if (!busy && !composing) { clearSelection(); status.textContent = ''; } });
  convert.addEventListener('click', () => execute(async () => {
    ensureMaySwitch(); if (composing || lociPreview && (!lociCurrent() || lociEvaluation!.blocked) || !lociPreview && !conversion) throw Error('変換する内容を確認してください。');
    const generation = selectionGeneration, context = selectionContext(), draft = lociDraft, tuple = lociTuple();
    const current = () => guardSelection(generation, context) && draft === lociDraft && tuple === lociTuple();
    status.textContent = 'プロジェクトを変換しています。';
    const initial = await (lociPreview ? lociEvaluation!.create() : conversion!.create()); if (!current()) return;
    const run = (initial.source.proof.identity.projectId as string).slice(4);
    const opened = await openNormal(run, initial);
    try { if (!current()) { await opened.dispose(); return; } } catch (error) { await opened.dispose(); throw error; }
    await replaceSelection(run, opened, generation, context);
  }));
  const openSelection=async(files:readonly File[])=>{
    ensureMaySwitch(); if (creationAttempt) throw Error('作成を再試行してください。');
    const selection = files.map(file => ({ file: file instanceof Blob ? file.slice() : file, label: file.name }));
    if (!selection.length) throw Error('ファイルを選択してください。');
    const total = selection.reduce((n, item) => n + item.file.size, 0);
    if (selection.length > ports.fileLimits.maxItems || !Number.isSafeInteger(total) || !ports.filePolicy&&total>ports.fileLimits.maxFileBytes ||
      selection.some(item => !Number.isSafeInteger(item.file.size) || item.file.size < 0)) throw Error('選択したファイルがこの検証の上限を超えています。');
    const generation = ++selectionGeneration, draft = creationDraft, context = selectionContext(); selectionPending = true;
    status.textContent = 'ファイルを確認しています。';
    clearConversion(); rawSelection = undefined; form.hidden = true;
    const models: ValidationModelFile[] = [], media: ValidationFile[] = [], packages: File[] = []; let actualTotal = 0, bufferedBytes=0;
    let unitlessMesh=false, unavailableObjMaterials=false;
    for (const item of selection) {
      const selectedFile:{readonly size:number;arrayBuffer():Promise<ArrayBuffer>}=item.file;
      if(!(selectedFile instanceof Blob)&&selectedFile.size>ports.fileLimits.maxFileBytes-bufferedBytes)throw Error('一度に選択するファイルの合計を減らしてください。');
      const selected = selectedFile instanceof Blob ? await validationModelFile({label:item.label,file:selectedFile},policy,true,ports.fileLimits.maxFileBytes-bufferedBytes) : {label:item.label,bytes:new Uint8Array(await selectedFile.arrayBuffer())};
      if (!guardSelection(generation, context) || draft !== creationDraft) return;
      if('package' in selected){
        actualTotal+=selected.package.size;
        if(!Number.isSafeInteger(actualTotal)||actualTotal>PACKAGE_LIMITS.archiveBytes)throw Error('選択したファイルがこの検証の上限を超えています。');
        packages.push(new File([selected.package],selected.label));continue;
      }
      const file:ValidationModelFile=selected;
      actualTotal += file.file ? file.file.size : file.bytes.byteLength;
      if (!Number.isSafeInteger(actualTotal)) throw Error('選択したファイルがこの検証の上限を超えています。');
      if(file.file){models.push(file);continue;}
      const bytes=file.bytes;bufferedBytes+=bytes.byteLength;
      const meshFormat=classifyMeshSource(bytes);
      if(meshFormat){
        const controller=new AbortController();selectionAbort=controller;nativeSelectionChecking=true;controls();
        try{
          const checked=await inspectMeshSource(meshFormat,bytes,policy.nonGs,ports.decode,ports.jpeg,controller.signal);
          if(!guardSelection(generation,context)||draft!==creationDraft)return;
          unitlessMesh ||= meshFormat!=='gltf';unavailableObjMaterials ||= checked.externalMaterialsUnavailable;
          models.push(file);
        }catch(error){if(controller.signal.aborted&&!selectionCurrent(generation,context))return;throw error;}
        finally{if(selectionAbort===controller){selectionAbort=undefined;nativeSelectionChecking=false;controls();}}
      }
      else if (isPointPly(bytes) || bytes.length >= 4 && new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0, true) === 0x46546c67) models.push(file);
      else if(isHeic(bytes)){
        const controller=new AbortController();selectionAbort=controller;nativeSelectionChecking=true;controls();
        try{
          await inspectProjectMedia(bytes,policy.nonGs,ports.decode,ports.jpeg,ports.photo,ports.mediaDecoders,controller.signal);
          if(!guardSelection(generation,context)||draft!==creationDraft)return;
          media.push(file);
        }catch(error){if(controller.signal.aborted&&!selectionCurrent(generation,context))return;throw error;}
        finally{if(selectionAbort===controller){selectionAbort=undefined;nativeSelectionChecking=false;controls();}}
      }
      else if (hasTimedOrHeicSignature(bytes) || isAdditionalPhoto(bytes) || isJpeg(bytes) || [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) media.push(file);
      else {
        const issue = freshPhotoSelectionIssue(bytes); if (issue) throw Error(issue);
        // Existing package readers own container admission, including legacy ZIP forms.
        packages.push(new File([bytes.slice().buffer], item.label ?? 'LociMyu'));
      }
    }
    if (!packages.length) {
      if (!models.length) throw Error('3Dモデルを選択してください。画像はモデルと一緒に選択できます。');
      rawSelection = { models, media }; form.hidden = false;
      creationNote.textContent = `3Dモデル ${models.length}・メディア ${media.length}。元のファイルは変更しません。`;
      if(unitlessMesh)creationNote.textContent+=' このプロジェクトの単位は不明として扱います。';
      if(unavailableObjMaterials)creationNote.textContent+=' OBJの外部材質・画像は読み込まず、既定の材質で表示します。';
      status.textContent = ''; return;
    }
    if (packages.length !== 1 || models.length || media.length) throw Error('作業ファイルは1つずつ開いてください。モデルや画像と一緒には開けません。');
    const file = packages[0]!;
    const hint=await inspectZipContainerMetadata(file); if(!guardSelection(generation,context))return;
    if(ports.openLegacy&&hint.identity!=='foreign'){legacyFile=file;fallback.hidden=false;}
    const legacy = hint.identity==='v1' ? await prepareFrozenV1Conversion(file, ports.fileLimits, ports.decode, ports.jpeg, ports.photo) : null; if (!guardSelection(generation, context)) return;
    const loci = hint.identity!=='foreign'||!hint.hasSpreadsheetEntry ? null : await prepareLociMyuConversion(file, ports.fileLimits, ports.decode, ports.jpeg, ports.photo); if (!guardSelection(generation, context)) return;
    let native: Awaited<ReturnType<typeof prepareNativeConversion>> = null;
    if(hint.identity==='native-portable') {
      const controller=new AbortController();selectionAbort=controller;nativeSelectionChecking=true;controls();
      try {native=await prepareNativeConversion(file,policy,ports.decode,ports.jpeg,ports.photo,controller.signal);}
      catch(error){if(controller.signal.aborted&&!selectionCurrent(generation,context))return;throw error;}
      finally{if(selectionAbort===controller){selectionAbort=undefined;nativeSelectionChecking=false;controls();}}
    }
    if (!guardSelection(generation, context)) return;
    lociPreview = loci;
    if (native || legacy) {
      conversion = native ?? legacy; const n = conversion!.summary;
      conversionNote.textContent = `${native ? 'Native' : '旧LociView'}ファイル：モデル ${n.models}・シーン ${n.scenes}・キャプション ${n.captions}・メディア ${n.media}`;
      materialNotice.render(n.materialNotices);
      if (native?.summary.nativeSpatial) {
        conversionNote.textContent += '。元の単位・座標・記録を引き継ぎます。';
        if (native.summary.nativeSpatial.gs) conversionNote.textContent += 'GSの見え方や全体を収める範囲は変わる場合があります。';
        if (native.summary.nativeSpatial.proxies) conversionNote.textContent += '位置指定用の面は両面から選択できます。';
      }
      if(native?.summary.objExternalMaterialsUnavailable)conversionNote.textContent+='。OBJの外部材質・画像は読み込まず、既定の材質で表示します。';
      if (legacy) { const s = legacy.summary.sourceOnly;
        conversionNote.textContent += `。元ファイルだけに保持：編集者情報 ${s.profiles}・削除済み記録 ${s.deletedRecords}・キャッシュ ${s.caches}・削除済み本体 ${s.deletedPayloads}・未使用本体 ${s.unlinkedPayloads}・面の法線 ${s.anchorNormals}`;
        if ('appliedModelOffsets' in legacy.summary && legacy.summary.appliedModelOffsets > 0)
          conversionNote.textContent += '。モデルの保存済み位置補正を適用します。旧画面では反映されていなかった配置です。';
        if ('materialEffects' in legacy.summary) {
          const effects = legacy.summary.materialEffects;
          conversionNote.textContent += `。陰影・両面表示を引き継ぐ材質：${effects.scenes}シーン・${effects.overrides}件`;
          if (effects.sourceOnlyChromaRows > 0) conversionNote.textContent += '。色の透過が無効なときの色・許容範囲・ぼかしは、元のZIPと説明ファイルだけに残り、変換後の編集値には引き継ぎません。';
        } }
      conversionPanel.hidden = false; status.textContent = ''; return;
    }
    if (lociPreview) {
      workbook.replaceChildren(); for (const source of lociPreview.sources) { const option = document.createElement('option'); option.value = String(source.index); option.textContent = `${source.path}（${source.captions}件）`; workbook.append(option); }
      workbook.value = String(lociPreview.selectedSourceIndex); conversionTitle.value = lociPreview.suggestedTitle; relation.checked = false;
      lociChoices.hidden = false; conversionPanel.hidden = false; await evaluateLoci(); status.textContent = ''; return;
    }
    const purpose = (await PackageArchive.inspect(file)).control.manifest.purpose; if (!guardSelection(generation, context)) return;
    if (purpose === 'backup') {
      const archive = await BackupArchive.inspect(file, validationMetadataLimits); if (!guardSelection(generation, context)) return;
      const run = (archive.source.proof.identity.projectId as string).slice(4), opened = await ports.open(run, undefined, 'edit', undefined, undefined,
        { file, archive: { sha256: archive.archive.sha256, byteLength: archive.archive.byteLength } });
      try { if (!guardSelection(generation, context)) { await opened.dispose(); return; } } catch (error) { await opened.dispose(); throw error; }
      if (!('kind' in opened)) { await opened.dispose(); throw Error('バックアップの復元用の入口に接続できません。'); }
      await closeCurrent(); firstRecovery = opened; selected = run; navigation.hidden = true; renderFirstRecovery(); return;
    }
    if (purpose === 'contribution') throw Error('更新用ファイルです。対応するプロジェクトを開き、更新を受け取ってください。');
    if (purpose === 'review') {
      const view = await prepareReviewView(file, policy, ports.decode, ports.jpeg, ports.photo,ports.mediaDecoders);
      if (!ports.renderReview) throw Error('閲覧用シーンの表示が未接続です。');
      const prepared = await ports.renderReview(view);
      try {
        if (!guardSelection(generation, context)) return;
        await closeCurrent(); resident = prepared;
        const currentReview = createReviewWorkspace(document, view, prepared.factory, () => execute(async () => {
          if (reviewWorkspace !== currentReview || resident !== prepared) return;
          ensureMaySwitch(); const editGeneration = selectionGeneration, editContext = selectionContext();
          status.textContent = '編集コピーを作成しています。';
          reviewEditAttempt ??= await PreparedReviewEdit.fromInspectedReview(view.inspection, validationMetadataLimits,ports.reviewEditArchive);
          if (!guardSelection(editGeneration, editContext)) {await reviewEditAttempt.releaseScratch();reviewEditAttempt=undefined;return;}
          const opened = await openNormal(reviewEditAttempt.run, undefined, 'edit', undefined, reviewEditAttempt);
          // Preserve the View, its windows and the exact attempt until an actual recovery-capable Host exists.
          await replaceSelection(reviewEditAttempt.run, opened, editGeneration, editContext);
        })); reviewWorkspace = currentReview; content.append(reviewWorkspace.root); reviewWorkspace.render();
        selected = null; ports.selected(null); navigation.hidden = true; clearSelection();
        status.textContent = '閲覧用シーンを開きました。編集プロジェクトは作成していません。';
      } catch (error) { if (resident === prepared) resident = undefined; throw error; }
      finally { if (resident !== prepared) prepared.dispose(); }
      return;
    }
    const inspected = purpose === 'clean' ? await CleanArchive.inspect(file, validationMetadataLimits) : await WorkspaceArchive.inspect(file, validationMetadataLimits);
    if (!guardSelection(generation, context)) return;
    const run = (inspected.source.proof.identity.projectId as string).slice(4);
    const opened = await openNormal(run, undefined, 'edit', file);
    await replaceSelection(run, opened, generation, context);
  };
  workspaceForm.addEventListener('submit',event=>{event.preventDefault();void execute(()=>openSelection(Array.from(workspaceInput.files??[])));});
  const leaveForLegacy=(file?:File)=>{if(busy||composing||disposed||changed()||creationAttempt)return;clearSelection();void ports.openLegacy?.(file).catch(error=>{if(!disposed)status.textContent=error instanceof Error?error.message:'ファイルを開けません。';});};
  legacy.addEventListener('click',()=>leaveForLegacy());fallback.addEventListener('click',()=>{const file=legacyFile;if(file)leaveForLegacy(file);});
  form.addEventListener('submit', event => { event.preventDefault(); execute(async () => {
    ensureMaySwitch(); if (!rawSelection || form.hidden) throw Error('ファイルを選択して内容を確認してください。');
    if (!creationAttempt) {
      const generation = selectionGeneration, draft = creationDraft, context = selectionContext(), name = title.value, target = rawSelection;
      const run = newId(), prepared = await prepareValidationProject({ run, title: name, ...target }, policy, ports.decode, ports.jpeg, ports.photo,ports.mediaDecoders);
      if (!guardSelection(generation, context) || draft !== creationDraft || title.value !== name || rawSelection !== target) return;
      creationAttempt = { run, initial: prepareValidationCreation(prepared, 'map2') }; controls();
    }
    const attempt = creationAttempt, { run, initial } = attempt, generation = selectionGeneration, context = selectionContext(); status.textContent = 'プロジェクトを作成しています。';
    if (attempt.candidate?.hasPending()) await attempt.candidate.authority.retry!();
    const opened = attempt.candidate ?? await openNormal(run, attempt.opened ? undefined : initial); attempt.candidate = opened;
    const ready = opened.read();
    const releaseReopenable = async () => {
      if (ready.state === 'ready' && ready.publication && ready.source && !opened.hasPending()) attempt.opened = true;
      // Before initialization is durable, only this warm Host owns the exact retry.
      if (disposed || attempt.opened) { attempt.candidate = undefined; await opened.dispose(); }
    };
    try { if (!guardSelection(generation, context)) { await releaseReopenable(); return; } }
    catch (error) { await releaseReopenable(); throw error; }
    attempt.candidate = undefined; // Ownership transfers to the adopted Host, including pending initialization.
    await replaceSelection(run, opened, generation, context);
  }); });
  back.addEventListener('click', () => { void selectProject(); });
  refresh.addEventListener('click', () => execute(updateList));
  const ready=execute(async () => {
    if(ports.initialFiles?.length){await openSelection(ports.initialFiles);return;}
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
  return { root,ready:ready??Promise.resolve(), hasChanges: () => busy || composing || changed() || !navigation.hidden && (selectionPending || !!rawSelection || !!creationAttempt || !form.hidden && title.value !== '新しいプロジェクト'),
    async dispose() { if (disposed) return; disposed = true; stopHelp();
      homeSettings?.dispose();
      selectionAbort?.abort();
      stopPresentation();
      try { await operation; } catch { /* Original input and saved failure are never acknowledged here. */ }
      try { await creationAttempt?.candidate?.dispose(); }
      finally { await closeCurrent(); offline?.dispose(); root.remove(); } }, get selected() { return selected; } };
}
