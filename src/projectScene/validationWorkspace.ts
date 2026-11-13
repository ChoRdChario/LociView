import { inspectZipContainerMetadata, isUnrecognizedZip } from '../assets/zipio';
import type {DesktopOfflinePort} from '../platform/desktopOfflinePorts';
import {createOfflineControls,createOfflineSettings} from '../ui/projectScene/offlineControls';
import { mountContextHelp } from '../ui/projectScene/contextHelp';
import {storageFailureText} from '../ui/projectScene/storageFeedback';
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
import type { openValidationHost, ValidationHostOptions, ValidationNormalHost, FirstBackupRecovery, FirstRestoreCaptionPreview } from './validationHost';
import { createValidationModeHost, type ValidationDisplayHost } from './validationModeHost';
import type { LocalOpenMode } from './hostPorts';
import type { ResumeReadingRequest, ValidationProjectEntry } from './validationCatalog';
import { createResumeReading, createCaptionTextReading } from './resumeReading';
import { chooseStartupScene, resolveScene } from '../scene/resolve';
import type { ModelCandidateRenderer } from './modelCandidatePreview';
import type { ViewportFactory } from './viewportPorts';
import { createValidationReceiveControls } from './validationReceiveControls';
import { prepareReviewView, reviewSceneChoices, type ReviewView } from './reviewView';
import { ReviewArchive } from '../projectPackage/reviewArchive';
import type { JsonObject } from '../domain/values';
import { createReviewWorkspace } from './reviewWorkspace';
import { PreparedReviewEdit, type ReviewEditArchivePort } from '../projectPackage/reviewEdit';
import { sceneAppendCompatibility } from '../projectPackage/sceneAppend';
import { createDeferredViewport } from './deferredViewport';

type Host = ReturnType<typeof createValidationModeHost>;
export class DisplayRetirementError extends AggregateError {
  constructor(errors:readonly unknown[]){super(errors,'表示の終了処理を完了できません。再読み込みしてから再開してください。保存済みの記録は保持しています。');}
}
export interface MountedEditor {
 readonly root:HTMLElement;readonly session:WorkspaceFileInteraction|undefined;
 render():void;hasProjectHeader?():boolean;inputPending(includePresentation?:boolean):boolean;hasChanges(includePresentation?:boolean):boolean;unmount():void|Promise<void>;dispose():Promise<void>;
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
  list(reading?: ResumeReadingRequest, onlyRun?: string): Promise<ValidationProjectEntry[]>;
  open(run: string, initial?: ReturnType<typeof prepareValidationCreation>, mode?: LocalOpenMode, workspaceFile?: Blob, reviewEdit?: PreparedReviewEdit,
    firstBackup?: ValidationHostOptions['firstBackup'], standaloneWorkspace?: boolean, reading?: ResumeReadingRequest): Promise<ValidationNormalHost | FirstBackupRecovery>;
  render(host: ValidationDisplayHost): Promise<{ factory: ViewportFactory; readonly ready?:Promise<void>; detachPreparation?():void; dispose(): void; idle?():Promise<void> }>;
  renderReview?(view: ReviewView): Promise<{ factory: ViewportFactory; dispose(): void; idle?():Promise<void> }>;
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
  const fileHelp = document.createElement('p'); fileHelp.textContent = '3Dモデル・点群から新規作成、保存したファイルから再開できます。';
  openFile.type = 'submit'; openFile.textContent = 'ファイルを開く'; workspaceForm.append(workspaceLabel, fileHelp, openFile,fallback);
  const updatePanel = document.createElement('section'), updateNote = document.createElement('p');
  const updateConfirm = document.createElement('button'), updateCancel = document.createElement('button');
  updatePanel.className = 'lv-update-destination'; updatePanel.setAttribute('aria-label', '取り込み先'); updatePanel.hidden = true;
  updateNote.id = 'lv-home-update-destination'; updateConfirm.setAttribute('aria-describedby', updateNote.id);
  updateConfirm.type = updateCancel.type = 'button'; updateConfirm.textContent = '既存に取り込む'; updateCancel.textContent = '選択を取り消す';
  updatePanel.append(updateNote, updateConfirm, updateCancel);
  const conversionPanel = document.createElement('section'), conversionNote = document.createElement('p'), conversionHelp = document.createElement('p');
  const imageOmissions=document.createElement('details'),imageOmissionsSummary=document.createElement('summary'),imageOmissionsList=document.createElement('ul');
  imageOmissions.className='lv-conversion-images';imageOmissions.hidden=true;imageOmissions.append(imageOmissionsSummary,imageOmissionsList);
  const clearImageOmissions=(reset=false)=>{imageOmissions.hidden=true;imageOmissionsList.replaceChildren();if(reset)imageOmissions.open=false;};
  const materialNotice=createMaterialConversionNotice(document,ports.smoothDisplay);
  const convert = document.createElement('button'), cancelConversion = document.createElement('button');
  convert.type = cancelConversion.type = 'button'; convert.textContent = '新しいプロジェクトに変換'; cancelConversion.textContent = '選択を取り消す';
  conversionHelp.textContent = '元ファイルは変更しません。チームでは変換後のファイルを使ってください。変換元のZIPと変換の説明は、別に保管してください。';
  conversionPanel.append(conversionNote, conversionHelp, convert, cancelConversion); conversionPanel.hidden = true; workspaceForm.append(conversionPanel, updatePanel);
  const lociChoices = document.createElement('div'), workbookLabel = document.createElement('label'), workbook = document.createElement('select'),
    conversionTitleLabel = document.createElement('label'), conversionTitle = document.createElement('input'), relationLabel = document.createElement('label'), relation = document.createElement('input'),
    relationNote = document.createElement('p'), previewAgain = document.createElement('button'), saveReport = document.createElement('button');
  workbookLabel.textContent = '変換する表'; workbook.setAttribute('aria-label', '変換する表'); workbookLabel.append(workbook);
  conversionTitleLabel.textContent = '変換後のプロジェクト名'; conversionTitle.setAttribute('aria-label', '変換後のプロジェクト名'); conversionTitleLabel.append(conversionTitle);
  relation.type = 'checkbox'; relation.setAttribute('aria-label', '表と視点・材質の関連付けを確認'); relationLabel.textContent = '表と視点・材質の関連付けを確認'; relationLabel.className='lv-conversion-relation';relationLabel.append(relation);
  previewAgain.type = saveReport.type = 'button'; previewAgain.textContent = '変換内容を確認'; saveReport.textContent = '変換の説明を保存';
  lociChoices.append(workbookLabel, conversionTitleLabel, relationNote, relationLabel, previewAgain); lociChoices.hidden = true; conversionPanel.replaceChildren(lociChoices, conversionNote, imageOmissions,materialNotice.root,conversionHelp, saveReport, convert, cancelConversion);
  const coldReport = document.createElement('button'),coldReportActions=document.createElement('div'),coldReportStatus=document.createElement('p'); coldReport.type = 'button'; coldReport.textContent = '変換の説明を保存'; coldReport.hidden = true;
  coldReportActions.className='lv-file-source-actions';coldReportStatus.className='lv-operation-status';coldReportStatus.setAttribute('role','status');coldReportActions.append(coldReport,coldReportStatus);root.append(coldReportActions);
  const showColdReport=(show:boolean)=>{coldReport.hidden=!show;coldReportActions.hidden=!show;};showColdReport(false);
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'lv-operation-status lv-validation-status';
  const list = document.createElement('section'), refresh = document.createElement('button'), back = document.createElement('button');
  refresh.type = back.type = 'button'; refresh.textContent = '一覧を更新'; back.textContent = '別のプロジェクトを開く';
  const listHeading = document.createElement('h2'); listHeading.textContent = 'このブラウザから再開'; list.setAttribute('aria-label', 'このブラウザから再開');
  navigation.append(heading, help, workspaceForm, form, listHeading, refresh, list,legacy); root.append(back, status, cancelSelection, navigation, content);
  let host: Host | undefined, workspace: MountedEditor | undefined;
  let resumeReading: ReturnType<typeof createResumeReading> | undefined;
  let openingReading: object | undefined;
  const clearResumeReading = () => { resumeReading?.dispose(); resumeReading = undefined; };
  let presentation:{busy:boolean;reason:string}|null=null;
  let presentationState=()=>presentation;
  let stopPresentation!:()=>void;const presentationStopped=new Promise<void>(resolve=>{stopPresentation=resolve;});
  const untilOpen=<T>(work:Promise<T>)=>Promise.race([work,presentationStopped.then(()=>{throw new DOMException('画面を閉じました。','AbortError');})]);
  let reviewEditAttempt:PreparedReviewEdit|undefined;
  let reviewWorkspace: ReturnType<typeof createReviewWorkspace> | undefined;
  let firstRecovery: FirstBackupRecovery | undefined;
  const recoveryControls = new Map<HTMLButtonElement | HTMLInputElement, () => boolean>();
  let receiveTools: ReturnType<typeof createValidationReceiveControls> | undefined;
  let resident: Awaited<ReturnType<ValidationWorkspacePorts['render']>> | undefined;
  let busy = false, disposed = false, composing = false, selected: string | null = null, operation: Promise<void> | undefined;
  const renderJobs=new Set<Promise<unknown>>();
  const releaseRender=async(owner:{dispose():void;idle?():Promise<void>}|undefined)=>{
    const errors:unknown[]=[];try{owner?.dispose();}catch(error){errors.push(error);}
    try{await owner?.idle?.();}catch(error){errors.push(error);}
    if(errors.length){retirementFailure??=new AggregateError(errors,'表示の終了処理を完了できません。');throw retirementFailure;}
  };
  const ownRender=<T extends {dispose():void;idle?():Promise<void>}>(work:Promise<T>):Promise<T>=>{
    const job=work.then(async owner=>{if(disposed){await releaseRender(owner);throw new DOMException('画面を閉じました。','AbortError');}return owner;},error=>{
      if(error instanceof DisplayRetirementError)retirementFailure??=error;throw error;
    });
    renderJobs.add(job);void job.finally(()=>renderJobs.delete(job)).catch(()=>{});return job;
  };
  function registerRecoveryControl<T extends HTMLButtonElement | HTMLInputElement>(control: T, blocked: () => boolean = () => false): T {
    recoveryControls.set(control, blocked); control.disabled = busy || blocked(); return control;
  }
  let conversion: Awaited<ReturnType<typeof prepareNativeConversion>> | Awaited<ReturnType<typeof prepareFrozenV1Conversion>> = null;
  let lociPreview: Awaited<ReturnType<typeof prepareLociMyuConversion>> = null;
  let lociEvaluation: Awaited<ReturnType<NonNullable<Awaited<ReturnType<typeof prepareLociMyuConversion>>>['evaluate']>> | null = null;
  let lociDraft = 0, lociDecision: string | undefined;
  let selectionGeneration = 0, creationDraft = 0, selectionPending = false;
  let pendingUpdate: { file: File; run: string; generation: number; context: ReturnType<typeof selectionContext> } | undefined;
  let nativeSelectionChecking = false, selectionAbort: AbortController | undefined;
  let retirementFailure: AggregateError | undefined;
  let rawSelection: { models: ValidationModelFile[]; media: ValidationFile[] } | undefined;
  let creationAttempt: { run: string; initial: ReturnType<typeof prepareValidationCreation>; opened?: true; candidate?: ValidationNormalHost } | undefined;
  let selectionHost: Host | undefined;
  const lociTuple = () => JSON.stringify([workbook.value, conversionTitle.value, relation.checked]);
  const lociCurrent = () => !!lociEvaluation && lociDecision === lociTuple();
  let reportUrl: string | undefined;
  let mounted = false, resumedLast = false, confirmingResume = false, lastRemembered: string | undefined;
  let catalog: readonly ValidationProjectEntry[] = [];
  let catalogLoaded = false;
  const projectOpenButtons=new Set<HTMLButtonElement>();
  const changed = (includePresentation = true) => !!workspace?.hasChanges(includePresentation) || !!reviewWorkspace?.hasChanges() || !!receiveTools?.hasChanges() || !!host?.hasPending() || !!firstRecovery;
  const openNormal = async (...args: Parameters<ValidationWorkspacePorts['open']>): Promise<ValidationNormalHost> => {
    const opened = await ports.open(...args); if ('kind' in opened) { await opened.dispose(); throw Error('バックアップの初回復元を一覧から再開してください。'); } return opened;
  };
  const controls = () => {
    const inactive = busy || !!retirementFailure;
    // Keep progress/errors readable beside the current decision, outside the
    // temporarily inert forms. The existing execute fence still owns actions.
    navigation.inert = false; workspaceForm.inert = form.inert = list.inert = inactive; refresh.disabled = inactive;
    for(const button of projectOpenButtons)button.disabled=inactive||composing;
    if(navigation.hidden){if(status.parentElement!==root)root.insertBefore(status,navigation);}
    else navigation.insertBefore(status,form.hidden?form:listHeading);
    openFile.disabled = create.disabled = cancelConversion.disabled = inactive || composing;
    if(offline&&homeSettings){if(offline.root.parentElement===homeSettings.body){if(!homeSettings.root.parentElement)root.insertBefore(homeSettings.root,navigation);}
      else{homeSettings.root.open=false;homeSettings.root.remove();}}
    status.setAttribute('data-busy',String(busy)); status.setAttribute('aria-busy',String(busy));
    for (const [control, blocked] of recoveryControls) control.disabled = inactive || blocked();
    workspaceInput.disabled = title.disabled = inactive || !!creationAttempt;
    cancelSelection.disabled = !!retirementFailure || busy && !nativeSelectionChecking || composing || !!creationAttempt;
    cancelSelection.hidden = !selectionPending || !conversionPanel.hidden || !!pendingUpdate || !!firstRecovery;
    openFile.hidden = !form.hidden || !conversionPanel.hidden || !!pendingUpdate;
    updatePanel.hidden = !pendingUpdate; updateConfirm.disabled = updateCancel.disabled = inactive || composing;
    create.textContent = creationAttempt ? '作成を再試行' : 'プロジェクトを作成';
    convert.disabled = inactive || composing || !!lociPreview && (!lociCurrent() || lociEvaluation!.blocked);
    saveReport.hidden = !lociPreview && !(conversion && 'report' in conversion && conversion.report);
    saveReport.disabled = inactive || composing || (!!lociPreview ? !lociCurrent() : !conversion || !('report' in conversion) || !conversion.report); previewAgain.disabled = inactive || composing;
    legacy.disabled=fallback.disabled=inactive||composing;
    workbook.disabled = conversionTitle.disabled = relation.disabled = inactive;
    coldReport.disabled = inactive || composing || !!workspace?.hasChanges() || !!reviewWorkspace?.hasChanges() || !!receiveTools?.hasChanges(); back.disabled = inactive;
    back.hidden = !host && !reviewWorkspace || !!workspace && !!workspace.hasProjectHeader?.(); };
  title.addEventListener('compositionstart', () => { composing = true; creationDraft++; controls(); });
  title.addEventListener('compositionend', () => { composing = false; creationDraft++; controls(); });
  title.addEventListener('input', () => { creationDraft++; });
  conversionTitle.addEventListener('compositionstart', () => { composing = true; invalidateLoci(); controls(); });
  conversionTitle.addEventListener('compositionend', () => { composing = false; invalidateLoci(); controls(); });
  let selectedFileError: string | undefined;
  const execute = (action: () => Promise<void>, fileInspection?: {generation?: number}) => {
    if (busy || disposed || retirementFailure) return;
    const previousUpdate = pendingUpdate;
    const confirmFocused = document.activeElement === updateConfirm;
    busy = true; controls(); workspace?.render();
    const work = action(); operation = work;
    return work.catch(error => { if (!disposed) {
      const storageError = storageFailureText(error);
      status.textContent = storageError ?? (error instanceof Error ? error.message : '処理できません。入力と再開用データは保持しています。');
      selectedFileError = fileInspection?.generation === selectionGeneration && !storageError && !host && !creationAttempt && !firstRecovery && !reviewEditAttempt ? status.textContent : undefined;
    } })
      .finally(() => { busy = false; if (operation === work) operation = undefined; if (!disposed) {
        controls(); workspace?.render();
        if (pendingUpdate && (pendingUpdate !== previousUpdate || confirmFocused)) updateConfirm.focus?.();
      } });
  };
  const closeCurrent = async () => {
    openingReading = undefined;
    clearResumeReading();
    const oldWorkspace=workspace,oldHost=host,oldResident=resident,oldReview=reviewWorkspace,oldAttempt=reviewEditAttempt,oldTools=receiveTools,oldRecovery=firstRecovery;
    mounted=false;presentation=null;presentationState=()=>presentation;resumedLast=false;confirmingResume=false;workspace=undefined;host=undefined;resident=undefined;reviewWorkspace=undefined;reviewEditAttempt=undefined;receiveTools=undefined;firstRecovery=undefined;
    showColdReport(false);coldReportStatus.textContent='';if(reportUrl)URL.revokeObjectURL(reportUrl);reportUrl=undefined;recoveryControls.clear();
    const errors:unknown[]=[],attempt=async(action:()=>unknown)=>{try{await action();return true;}catch(error){errors.push(error);return false;}};
    const reviewEnd=attempt(()=>oldReview?.dispose()),workspaceEnd=attempt(()=>oldWorkspace?.dispose()),residentEnd=attempt(()=>releaseRender(oldResident));
    const reviewClosed=await reviewEnd;await attempt(()=>oldAttempt?.releaseScratch());
    const workspaceClosed=await workspaceEnd;if(!oldWorkspace||!workspaceClosed)await attempt(()=>oldHost?.dispose());
    const residentClosed=await residentEnd;await attempt(()=>oldTools?.dispose());await attempt(()=>oldRecovery?.dispose());content.replaceChildren();
    if(errors.length){
      const failure=new AggregateError(errors,'画面の終了処理を完了できませんでした。再読み込みしてから再開してください。保存済みの記録は保持しています。');
      if(!reviewClosed||!workspaceClosed||!residentClosed)retirementFailure??=failure;
      navigation.hidden=false;selected=null;ports.selected(null);throw retirementFailure??failure;
    }
    if(retirementFailure){navigation.hidden=false;selected=null;ports.selected(null);throw retirementFailure;}
  };
  const unmountCurrentDisplay = async () => {
    const previous=workspace,previousResident=resident;workspace=undefined;resident=undefined;
    const errors:unknown[]=[];let retirement:void|Promise<void>=undefined;
    try { retirement=previous?.unmount(); } catch(error) { errors.push(error); }
    // Abort the display owner before awaiting native jobs that it owns.
    try { previousResident?.dispose(); } catch(error) { errors.push(error); }
    try { await retirement; } catch(error) { errors.push(error); }
    try { await previousResident?.idle?.(); } catch(error) { errors.push(error); }
    if(errors.length)retirementFailure??=new AggregateError(errors,'画面の終了処理を完了できませんでした。再読み込みしてから再開してください。保存済みの記録は保持しています。');
    if(retirementFailure)throw retirementFailure;
  };
  const ensureMaySwitch = (includePresentation = true) => {
    if(retirementFailure)throw retirementFailure;
    if (composing || changed(includePresentation)) throw Error('入力・更新を確定するか、取り消してからプロジェクトを切り替えてください。');
  };
  const ensureMayLeaveSelection = () => {
    ensureMaySwitch(presentationState()?.busy !== false);
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
  const updateList = async (reading?: ResumeReadingRequest) => {
    const previousStatus = status.textContent, loadingMessage = '保存した作業を確認しています。', showProgress = !navigation.hidden;
    list.setAttribute('aria-busy', 'true');
    if (!list.children.length) list.textContent = '';
    if (showProgress) status.textContent = loadingMessage;
    let entries: ValidationProjectEntry[];
    try { entries = await ports.list(reading); }
    finally { list.setAttribute('aria-busy', 'false'); if (!disposed && showProgress && status.textContent === loadingMessage) status.textContent = previousStatus; }
    if (disposed) return;
    catalog = entries;
    catalogLoaded = true;
    projectOpenButtons.clear();list.replaceChildren();
    if (!entries.length) { list.textContent = 'このブラウザに保存した作業はありません。'; return; }
    for (const item of entries) {
      const row = document.createElement('div'), name = document.createElement('span'), state = document.createElement('span'), actions = document.createElement('div');
      row.className = 'lv-recent-project'; name.className = 'lv-recent-title'; state.className = 'lv-recent-state'; actions.className = 'lv-recent-actions';
      name.id = `lv-recent-title-${crypto.randomUUID()}`; row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', name.id);
      name.textContent = item.title; state.textContent = item.state === 'ready' ? '再開できます' : item.state === 'incomplete' ? '更新が未完了' : '要確認';
      row.append(name, state, actions);
      for (const mode of item.firstRestore === 'terminal' ? [] : item.firstRestore === 'pending' ? ['edit'] as const : ['view', 'edit'] as const) {
        const open = document.createElement('button'); open.type = 'button';
        open.disabled=busy||composing;projectOpenButtons.add(open);
        open.textContent = item.firstRestore === 'pending' ? '復元を再開' : mode === 'view' ? '閲覧で開く' : '編集で開く';
        open.setAttribute('aria-describedby', name.id);
        open.addEventListener('click', () => execute(async () => { ensureMayLeaveSelection(); await closeCurrent(); await openProject(item.run, undefined, mode); }));
        actions.append(open);
      }
      list.append(row);
    }
  };
  const mount = async (prepared?: Awaited<ReturnType<ValidationWorkspacePorts['render']>>, initialSceneId?: string) => {
    if(retirementFailure)throw retirementFailure;
    mounted = false;
    if (!host || disposed) { prepared?.dispose(); return; }
    const composition = resumeReading?.composition();
    if (composition) await untilOpen(composition);
    if (!host || disposed) { prepared?.dispose(); return; }
    const initialReading = resumeReading?.selection(); clearResumeReading();
    recoveryControls.clear(); content.replaceChildren();
    if (host.read().state !== 'ready' || host.hasPending() && !(host.backupRestore.needsDisplay && !host.backupRestore.pending)) {
      prepared?.dispose();
      const note = document.createElement('p'), retry = document.createElement('button');
      note.textContent = host.authority.status?.().error || '更新が未完了です。元の変更から再試行してください。';
      const owner = host;
      retry.type = 'button'; retry.textContent = '更新を再試行'; registerRecoveryControl(retry, () => host !== owner || !!owner.authority.readOnly);
      retry.addEventListener('click', () => { if (!retry.disabled) execute(async () => { if(host!==owner)return; await owner.authority.retry!(); await mount(); }); });
      content.append(note, retry); if (receiveTools) { receiveTools.render(); content.append(receiveTools.root); }
      retry.hidden = host.mode?.current === 'view' || host.workspaceFiles.initialImport && host.read().state === 'empty' ||
        !!host.workspaceFiles.reviewCopyError || host.workspaceFiles.reviewCopies.some(j => !['completed', 'abandoned'].includes(j.state)) ||
        host.backupRestore.pending || !!host.workspaceFiles.jobs.some(j => !['completed', 'cancelled', 'abandoned'].includes(j.state));
      if (host.sceneAppend.jobs.length || host.sceneAppend.error) {
        retry.hidden = true;
        note.textContent = host.sceneAppend.error || 'シーンの追加が中断しました。';
        const target = host;
        for (const job of host.sceneAppend.jobs) {
          if (job.state === 'repair-required') { note.textContent = 'シーン追加の再開用データに修復が必要です。'; continue; }
          if (target.authority.readOnly) continue;
          const input = registerRecoveryControl(document.createElement('input'), () => host !== target);
          const button = (text: string, action: () => Promise<void>, blocked: () => boolean = () => false) => {
            const control = document.createElement('button'); control.type = 'button'; control.textContent = text;
            registerRecoveryControl(control, () => host !== target || blocked());
            control.addEventListener('click', () => { if (!control.disabled) void execute(async () => { if (host === target) await action(); }); });
            content.append(control); return control;
          };
          if (job.state === 'input-required') {
            const label = document.createElement('label'); label.textContent = '元のシーンZIP'; input.type = 'file'; input.accept = '.zip';
            label.append(input); content.append(label);
          }
          if (job.state === 'input-required' || job.state === 'prepared') {
            const resume = button('シーン追加を再開', async () => {
              const id = await target.sceneAppend.retry(job.id, input.files?.[0]);
              await mount(undefined, id);
            }, () => job.state === 'input-required' && !input.files?.length);
            if (job.state === 'input-required') input.addEventListener('change', controls);
          }
          if (job.cancellable) button('シーン追加を取りやめる', async () => { await target.sceneAppend.cancel(job.id); await mount(); });
        }
      }
      const recoveryHost = host, recovery = recoveryHost.authority.nativeConversionRecovery;
      if (!recoveryHost.authority.readOnly && recovery && await recovery.sourceRequired()) {
        if (disposed || host !== recoveryHost) return;
        const label = document.createElement('label'), input = document.createElement('input'), resume = document.createElement('button');
        label.textContent = '変換元のファイル'; input.type = 'file'; input.accept = '.zip'; input.setAttribute('aria-label','変換元のファイル'); label.append(input);
        resume.type = 'button'; resume.textContent = '変換を再開';
        registerRecoveryControl(input, () => host !== recoveryHost); registerRecoveryControl(resume, () => host !== recoveryHost || !input.files?.length);
        input.addEventListener('change', controls);
        resume.addEventListener('click', () => { if(!resume.disabled)execute(async () => {const file = input.files?.[0]; if (!file || host !== recoveryHost) return; await recovery.reselect(file); await mount();}); });
        note.textContent = '変換元の保存が完了していません。同じファイルを選択すると、途中から再開できます。'; retry.hidden = true; content.append(label,resume);
      }
      if (host.mode?.current === 'view') {
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '編集する';
        registerRecoveryControl(edit, () => host !== recoveryHost);
        edit.addEventListener('click', () => { if(!edit.disabled)execute(async () => {
          await host!.mode!.change('edit', host!.read().source?.token, () => {}); await mount();
        }); });
        note.textContent = `更新が未完了です。編集を開始して復旧してください。${host.mode.detail}`; content.append(edit);
      }
      if(host.sceneAppend.jobs.length || host.sceneAppend.error)status.textContent='';
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
        {utilitiesRoot:offline?.root,fileActionsRoot:coldReportActions,smoothDisplay:ports.smoothDisplay,presentation:state,projectNavigationBlocked:()=>busy,openProject:()=>{void selectProject();},resumedLastProject:()=>resumedLast,storageEstimate:ports.storageEstimate,localSettings:ports.localSettings,initialReading,initialSceneId,changed:refresh});
      content.replaceChildren(workspace.root,retry);workspace.render();
      const prepare=async()=>{
        checked=false;mounted=false;presentation={busy:true,reason:'モデルを読み込んでいます。記録は閲覧・検索できます。'};retry.hidden=true;resident?.detachPreparation?.();workspace?.render();
        try{
          const next=await untilOpen(ownRender(ports.render(target).then(async value=>{if(!current()){await releaseRender(value);throw Error('表示先が変わりました。');}return value;})));
          if(!next)throw Error('表示の準備を確認できません。');
          if(!current()){await releaseRender(next);return;}
          const previous=resident;resident=next;try{bridge.attach(next.factory);}finally{await releaseRender(previous);}
          await untilOpen(next.ready??Promise.resolve());if(!current())return;
          checked=true;presentation=null;workspace?.render();refresh();
          if(target.backupRestore.needsDisplay){target.backupRestore.displayReady(token!);workspace?.render();}
        }catch(error){if(!current())return;presentation={busy:false,reason:error instanceof Error?error.message:'モデルを読み込めません。記録と原本は保持しています。'};retry.hidden=false;workspace?.render();controls();}
      };
      const load=()=>bridge.preparing(prepare());
      retry.addEventListener('click',()=>{void execute(load);});
      await load();status.textContent='';return;
    }
    presentation=null;presentationState=()=>presentation;
    status.textContent = 'モデルを読み込んでいます。';
    const target = host, token = target.read().source?.token, next = prepared ?? await ownRender(ports.render(target));
    await next.ready;
    if (disposed || host !== target) { await releaseRender(next); return; }
    resident = next;
    const fileTools = receiveTools;
    try { workspace=ports.mountEditor(target,next.factory,fileTools,
      ports.renderModelCandidate ? display=>ports.renderModelCandidate!(target,display) : undefined,
      {utilitiesRoot:offline?.root,fileActionsRoot:coldReportActions,smoothDisplay:ports.smoothDisplay,projectNavigationBlocked:()=>busy,openProject:()=>{void selectProject();},resumedLastProject:()=>resumedLast,storageEstimate:ports.storageEstimate,localSettings:ports.localSettings,
        initialReading,initialSceneId,changed:()=>{rememberCurrent();controls();}});
      content.replaceChildren(workspace.root); workspace.render();
      if (target.backupRestore.needsDisplay) { target.backupRestore.displayReady(target.read().source!.token); workspace.render(); } }
    catch (error) { await unmountCurrentDisplay(); throw error; }
    mounted = token === target.read().source?.token;
    if (mounted && selectionHost === target && target.read().state === 'ready' && !target.hasPending()) clearSelection();
    status.textContent = '';
  };
  const restoreDisplay = async (retry: boolean) => {
    if(retirementFailure)throw retirementFailure;
    const target = host; if (!target || disposed) throw Error('プロジェクトを開いてください。');
    const epoch = target.backupRestore.epoch;
    let staged: Awaited<ReturnType<ValidationWorkspacePorts['render']>> | undefined;
    let stagedPrepare: Parameters<ValidationDisplayHost['setDisplayPreparation']>[0] | undefined;
    let readContent: ValidationDisplayHost['content'] | undefined;
    try {
      await target.backupRestore[retry ? 'retry' : 'confirm'](async (next, sourceContent) => {
        readContent = sourceContent;
        staged = await ownRender(ports.render({ authority: { ...target.authority, read: () => next },
          content: { model: record => readContent!.model(record), modelContent: record => readContent!.modelContent(record) },
          setDisplayPreparation(callback) { stagedPrepare = callback; return () => { if (stagedPrepare === callback) stagedPrepare = undefined; }; } }));
        await staged.ready;
      });
      if (disposed || host !== target) throw Error('画面を閉じました。復元先は再度開いて確認してください。');
      if (!staged) throw Error('復元先の表示を準備できません。');
      // Only the selected runtime supplies future model reads; staging capabilities have expired.
      readContent = target.content; const next = staged, prepare = stagedPrepare;
      await unmountCurrentDisplay();
      const detach = prepare ? target.setDisplayPreparation(prepare) : () => {};
      staged = undefined; // mount now owns this resident, including failure/closed paths.
      await mount({ factory: next.factory, idle:next.idle, dispose: () => { detach(); next.dispose(); } });
    } catch (error) {
      await releaseRender(staged);
      if (target.backupRestore.epoch !== epoch) {
        await unmountCurrentDisplay(); content.replaceChildren();
        const note = document.createElement('p'); note.textContent = '復元先に切り替わりました。未完了の確認・表示を再開してください。';
        content.append(note); if (receiveTools) content.append(receiveTools.root);
      }
      throw error;
    }
  };
  const adoptProject = async (run: string, opened: Awaited<ReturnType<typeof openValidationHost>>, rememberedMode?: LocalOpenMode,
    prepared?: Awaited<ReturnType<ValidationWorkspacePorts['render']>>, preparation?: Parameters<ValidationDisplayHost['setDisplayPreparation']>[0], initialSceneId?: string) => {
    if (disposed || retirementFailure) { await opened.dispose(); if(retirementFailure)throw retirementFailure; return; }
    host = createValidationModeHost(opened, nextMode => openNormal(run, undefined, nextMode), nextMode => ports.selected(run, nextMode));
    if (selectionPending) selectionHost = host;
    receiveTools = createValidationReceiveControls(document, host, () => workspace?.session,
      () => { workspace?.render(); controls(); }, async () => { if (!workspace && !disposed) await mount(); }, recovery =>
        !!presentationState()?.busy || !recovery && !!presentationState() || (workspace?.inputPending(!recovery) ?? false), restoreDisplay);
    selected = run; ports.selected(run, host.mode!.current); navigation.hidden = true;
    const openingHost = host, openingToken = host.read().source?.token;
    confirmingResume = rememberedMode !== undefined;
    const detach = preparation ? host.setDisplayPreparation(preparation) : undefined;
    await mount(prepared ? { factory: prepared.factory, idle:prepared.idle, dispose: () => { detach?.(); prepared.dispose(); } } : undefined, initialSceneId);
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
    try { const available = await target.conversionReportAvailable(); if (!disposed && host === target) showColdReport(available); }
    catch { if (!disposed && host === target) { showColdReport(true); coldReportStatus.textContent = '変換の説明を確認できません。元ZIPを保管し、説明の保存から再確認してください。'; } }
  };
  const openProject = async (run: string, initial?: ReturnType<typeof prepareValidationCreation>, mode: LocalOpenMode = 'edit', workspaceFile?: Blob, remembered = false) => {
    if (!resumeReading) status.textContent = initial ? 'プロジェクトを作成しています。' : '再開用データを確認しています。';
    const owner = {}; openingReading = owner;
    const reading: ResumeReadingRequest | undefined = ports.progressivePresentation && !initial && !workspaceFile ? { run, show(value) {
      if (disposed || retirementFailure || openingReading !== owner || resumeReading || !value) return;
      const next = createResumeReading(document, value); resumeReading = next; navigation.hidden = true; status.textContent = ''; content.append(next.root); controls();
    } } : undefined;
    let opened: ValidationNormalHost | FirstBackupRecovery;
    try {
      opened = await (reading ? ports.open(run, initial, mode, workspaceFile, undefined, undefined, undefined, reading) : ports.open(run, initial, mode, workspaceFile));
      if (disposed || openingReading !== owner) { await opened.dispose(); return; }
    } catch (error) {
      if (openingReading === owner) { clearResumeReading(); navigation.hidden = false; }
      throw error;
    } finally { if (openingReading === owner) openingReading = undefined; }
    if ('kind' in opened) { clearResumeReading(); if (disposed) { await opened.dispose(); return; } firstRecovery = opened; selected = run; navigation.hidden = true; renderFirstRecovery(); return; }
    await adoptProject(run, opened, remembered ? mode : undefined);
  };
  const renderFirstRecovery = () => {
    const target = firstRecovery; if (!target || disposed) return;
    recoveryControls.clear();
    const state = target.state(), panel = document.createElement('section'), readerSlot = document.createElement('div'), note = document.createElement('p'), commands = document.createElement('div');
    panel.className = 'lv-first-restore-panel'; panel.setAttribute('aria-label', '保存ファイルから再開'); readerSlot.className = 'lv-first-restore-reading'; commands.className = 'lv-first-restore-actions';
    if (state.phase === 'preview') status.textContent = state.replacing ? 'このバックアップから作業を再開できます。' : '保存ファイルから作業を再開します。';
    note.textContent = state.error || (state.phase === 'preview' ? state.replacing
      ? 'バックアップの時点に切り替えます。現在の作業と元ファイルは残ります。' : 'このブラウザで編集できるようにします。元ファイルは変更しません。'
      : state.phase === 'terminal' ? 'プロジェクトはまだありません。復元の記録は保持しています。ファイルを選択して開き直せます。' : state.phase === 'beforeStart'
        ? '復元はまだ始まっていません。「復元を取りやめる」で一覧に戻り、元のバックアップを選び直してください。' : 'バックアップの初回復元が未完了です。記録を使って再開するか、取りやめてください。');
    const summary = document.createElement('h2'); summary.textContent = state.title;
    const fileSummary = document.createElement('p'); fileSummary.textContent = [state.fileName, state.memo].filter(Boolean).join(' — '); fileSummary.hidden = !fileSummary.textContent;
    const button = (label: string, action: () => Promise<void>) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      registerRecoveryControl(b); b.addEventListener('click', () => { if (!b.disabled) execute(action); }); commands.append(b); };
    const leave = async (cancel: boolean) => { if (cancel) await (state.phase === 'beforeStart' ? target.abandon() : target.cancel());
      await closeCurrent(); clearSelection(); selected = null; ports.selected(null); navigation.hidden = false; await updateList(); status.textContent = ''; };
    if (target.readOnly) button('編集する', async () => {
      try { const candidate = await target.edit(); if (disposed || firstRecovery !== target) { await candidate.dispose(); return; }
        await closeCurrent();
        if ('kind' in candidate) { firstRecovery = candidate; renderFirstRecovery(); } else await adoptProject(target.run, candidate);
      } catch (error) { renderFirstRecovery(); throw error; }
    });
    else if (state.phase === 'preview' || state.phase === 'pending' && state.retryable) button(state.phase === 'preview' ? state.replacing ? 'バックアップから復元' : 'このファイルから再開' : '復元を再開', async () => {
      status.textContent = 'バックアップから復元しています。';
      let staged: Awaited<ReturnType<ValidationWorkspacePorts['render']>> | undefined,
        preparation: Parameters<ValidationDisplayHost['setDisplayPreparation']>[0] | undefined, sourceContent: ValidationNormalHost['content'] | undefined,
        reading: ReturnType<typeof createCaptionTextReading> | undefined, fallback: ReturnType<typeof createResumeReading> | undefined, preview: FirstRestoreCaptionPreview | undefined, opened: ValidationNormalHost | undefined;
      let accepting = true;
      const withdraw = () => { reading?.dispose(); reading = undefined; preview = undefined; };
      try {
        opened = await target[state.phase === 'preview' ? 'confirm' : 'retry'](async (next, preparedContent) => {
          if (disposed || firstRecovery !== target) throw Error('画面を閉じました。復元記録は保持しています。');
          if (ports.progressivePresentation && !reading) try {
            const { sceneId } = chooseStartupScene(next.state);
            const scene = sceneId ? resolveScene(next.state, next.resources, sceneId) : undefined;
            if (scene?.kind === 'ready') {
              const records = scene.composition.captions.flatMap(c => c.title.kind === 'value' && c.body.kind === 'value'
                ? [{ id: c.captionId, title: c.title.value, body: c.body.value }] : []);
              if (records.length) {
                fallback?.dispose(); fallback = createResumeReading(document, { token: next.state.token, sceneId: scene.composition.sceneId,
                  title: state.title, records, ...(scene.composition.name.kind === 'value' ? { sceneName: scene.composition.name.value } : {}) }, 'restore');
                readerSlot.replaceChildren(fallback.root); status.textContent = '';
              }
            }
          } catch { fallback?.dispose(); fallback = undefined; }
          sourceContent = preparedContent; const candidate = await untilOpen(ownRender(ports.render({ authority: { readOnly: true, read: () => next,  },
            content: { model: record => sourceContent!.model(record), modelContent: record => sourceContent!.modelContent(record) },
            setDisplayPreparation(callback) { preparation = callback; return () => { if (preparation === callback) preparation = undefined; }; } }).then(async value => {
              if (disposed || firstRecovery !== target) { await releaseRender(value); throw Error('画面を閉じました。復元記録は保持しています。'); }
              return value;
            })));
          staged = candidate;
          if (candidate.ready) await untilOpen(candidate.ready);
          if (disposed || firstRecovery !== target) throw Error('画面を閉じました。復元記録は保持しています。');
        }, ports.progressivePresentation ? value => {
          if (disposed || firstRecovery !== target) return;
          if (!value) { withdraw(); return; }
          if (!accepting) return;
          if (preview || fallback) return;
          const view = createCaptionTextReading(document, value, 'first-restore');
          status.textContent = ''; summary.textContent = state.title; note.textContent = '元のファイルは変更しません。';
          preview = value; reading = view; readerSlot.replaceChildren(view.root);
        } : undefined);
        accepting = false;
        if (disposed || firstRecovery !== target) return;
        const view = reading ?? fallback; if (view?.composition()) view.setReady();
        const composition = view?.composition(); if (composition) await untilOpen(composition);
        if (disposed || firstRecovery !== target) return;
        const actual = preview ? target.takePreview(preview, opened) : undefined, selectedText = reading?.selection();
        const matching = selectedText?.captionId ? actual?.records.find(c => c.id === selectedText.captionId &&
          preview?.records.some(p => p.id === c.id && p.title === c.title && p.body === c.body)) : actual;
        const selection = actual && matching && selectedText ? { ...selectedText, token: actual.token, sceneId: actual.sceneId } : fallback?.selection();
        if (view) view.root.inert = true;
        sourceContent = opened.content; await closeCurrent();
        if (disposed) return;
        resumeReading = view && selection ? { ...view, selection: () => selection } : undefined;
        if (!selection) view?.dispose(); reading = undefined; fallback = undefined; preview = undefined;
        const prepared = staged, nextHost = opened; staged = undefined; opened = undefined;
        await adoptProject(target.run, nextHost, undefined, prepared, preparation);
      } catch (error) { clearResumeReading(); renderFirstRecovery(); throw error; } finally { accepting = false; withdraw(); fallback?.dispose(); try{await releaseRender(staged);}finally{await opened?.dispose();} }
    });
    if ((!target.readOnly || state.phase === 'preview') && state.cancellable) button(state.phase === 'preview' ? 'キャンセル' : '復元を取りやめる', () => leave(true));
    if (state.phase === 'terminal') button('一覧に戻る', () => leave(false));
    panel.append(summary, fileSummary, note, commands, readerSlot); content.replaceChildren(panel); controls();
  };
  const invalidateLoci = () => { lociDraft++; lociEvaluation = null; lociDecision = undefined; conversion = null;materialNotice.render();clearImageOmissions();
    if (lociPreview) conversionNote.textContent = '入力が変わりました。「変換内容を確認」で確認し直してください。'; controls(); };
  const clearConversion = () => { const old = lociPreview; legacyFile=undefined;fallback.hidden=true; lociDraft++; lociDecision = undefined; conversion = null; lociPreview = null; lociEvaluation = null; lociChoices.hidden = true; conversionPanel.hidden = true;materialNotice.render();clearImageOmissions(true); void old?.dispose().catch(() => {}); };
  const clearSelection = () => {
    selectionAbort?.abort(); selectionAbort = undefined; nativeSelectionChecking = false;
    selectionGeneration++; creationDraft++; selectionPending = false; pendingUpdate = undefined; rawSelection = undefined; creationAttempt = undefined; selectionHost = undefined;
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
  const selectionRead = async <T>(generation: number, context: ReturnType<typeof selectionContext>, read: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    const controller = new AbortController(); selectionAbort = controller; nativeSelectionChecking = true; controls();
    try { const result = await read(controller.signal); controller.signal.throwIfAborted(); return result; }
    catch (error) { if (controller.signal.aborted && !selectionCurrent(generation, context)) return; throw error; }
    finally { if (selectionAbort === controller) { selectionAbort = undefined; nativeSelectionChecking = false; controls(); } }
  };
  const replaceSelection = async (run: string, opened: ValidationNormalHost, generation: number, context: ReturnType<typeof selectionContext>, initialSceneId?: string) => {
    try { if (!guardSelection(generation, context)) { await opened.dispose(); return; } }
    catch (error) { await opened.dispose(); throw error; }
    try { await closeCurrent(); } catch (error) { await opened.dispose(); throw error; }
    await adoptProject(run, opened, undefined, undefined, undefined, initialSceneId);
  };
  const exportReport = (blob: Blob, fromFile=false) => { if (disposed) return; if (reportUrl) URL.revokeObjectURL(reportUrl); reportUrl = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = reportUrl; a.download = 'LociView-conversion-report.json'; a.hidden = true; root.append(a);
    try { a.click(); } finally { a.remove(); } (fromFile?coldReportStatus:status).textContent = 'ダウンロードを開始しました。元ZIPと説明ファイルの保存先で完了を確認してください。'; };
  const evaluateLoci = async () => {
    const target = lociPreview; if (!target || composing) return; invalidateLoci(); const draft = lociDraft, tuple = lociTuple();
    const evaluated = await target.evaluate(Number(workbook.value), conversionTitle.value, relation.checked);
    if (disposed || lociPreview !== target || draft !== lociDraft || tuple !== lociTuple() || composing) return; lociEvaluation = evaluated; lociDecision = tuple;
    relationLabel.hidden = evaluated.relation.kind !== 'confirmation-required';
    relationNote.textContent = evaluated.relation.kind === 'confirmation-required' ? `${evaluated.relation.relations.map(r => `${r.sheetGid} → ${r.sheetName}`).join(' / ')}。関連付けを確認すると、対応する視点・材質を引き継ぎます。` :
      evaluated.relation.kind === 'unavailable' ? '表との対応を確認できない視点・材質は有効にしません。' : '';
    const n = evaluated.summary; conversionNote.textContent = evaluated.blocked ? `この内容は変換できません。${n.blockingReason ?? '問題の詳細は説明ファイルで確認できます。'}` : `LociMyuファイル：モデル ${n.models}・シーン ${n.scenes}・キャプション ${n.captions}・メディア ${n.media}・視点 ${n.views}`;
    imageOmissionsSummary.textContent=`添付できない画像（${evaluated.imageOmissions.length}件）`;
    for(const item of evaluated.imageOmissions){const li=document.createElement('li'),caption=document.createElement('strong'),context=document.createElement('p'),reason=document.createElement('p');
      caption.textContent=item.caption||'題名なしの記録';context.textContent=`${item.scene}・${item.row}行目／${item.filename??'ファイル名を確認できません'}`;reason.textContent=item.reason;
      li.append(caption,context,reason);imageOmissionsList.append(li);}
    imageOmissions.hidden=evaluated.imageOmissions.length===0;
    if (!evaluated.blocked) {
      const notes: string[] = [];
      if (Number(n.missingIdRows) > 0) notes.push(`IDのない${n.missingIdRows}行は記録にしません`);
      if (Number(n.approximateViews) > 0) notes.push(`視点${n.approximateViews}件の表示幅を近似します`);
      if (Number(n.sourceOnlyViews) > 0) notes.push(`${evaluated.relation.kind === 'confirmation-required' && !relation.checked ? '関連付けを確認していない' : '関連付けや設定を確認できない'}視点${n.sourceOnlyViews}件は引き継ぎません`);
      if (notes.length) conversionNote.textContent += `。要確認：${notes.join('。')}。元のZIPに保持します`;
    }
    materialNotice.render(n.materialNotices as Parameters<typeof materialNotice.render>[0]);
    const effects = n.materialEffects as { scenes: number; overrides: number; sourceOnlyChromaRows: number } | null | undefined;
    const materialIssue = n.materialIssue as { field: string; reason: string } | null | undefined;
    if (!evaluated.blocked && effects) {
      conversionNote.textContent += `。材質の見え方：${effects.scenes}シーン・${effects.overrides}件`;
      if (Number(effects.sourceOnlyChromaRows) > 0) conversionNote.textContent += '。色の透過が無効なときの色・許容範囲・ぼかしは、元のZIPと説明ファイルだけに残り、変換後の編集値には引き継ぎません。';
    }
    conversionHelp.textContent = '変換元のZIPと変換の説明は、バックアップや共有ファイルに含めません。別に保管してください。'; controls();
  };
  workbook.addEventListener('change', () => { relation.checked = false; invalidateLoci(); if (!busy) execute(evaluateLoci); });
  conversionTitle.addEventListener('input', invalidateLoci);
  relation.addEventListener('change', () => { invalidateLoci(); if (!busy) execute(evaluateLoci); });
  previewAgain.addEventListener('click', () => execute(evaluateLoci));
  saveReport.addEventListener('click', () => { if (disposed || busy || composing) return;
    if (lociPreview && lociCurrent()) exportReport(lociEvaluation!.report());
    else if (conversion && 'report' in conversion && conversion.report) exportReport(conversion.report()); });
  coldReport.addEventListener('click', () => execute(async () => {
    coldReportStatus.dataset.busy='true';coldReportStatus.textContent='変換の説明を確認しています。';
    try {if (composing || workspace?.hasChanges() || reviewWorkspace?.hasChanges() || receiveTools?.hasChanges()) throw Error('入力・操作を確定するか取り消してください。'); const target = host; if (!target) return;
      const report = await target.conversionReport(); if (disposed || host !== target) return; if (!report) { showColdReport(false); return; } exportReport(report,true);
    }catch(error){if(!disposed)coldReportStatus.textContent=error instanceof Error?error.message:'変換の説明を確認できません。元ZIPを保管して再試行してください。';}
    finally{coldReportStatus.dataset.busy='false';}
  }));
  workspaceInput.addEventListener('change', () => {
    if (creationAttempt) return;
    if (selectedFileError && status.textContent === selectedFileError) status.textContent = '';
    selectedFileError = undefined;
    selectionAbort?.abort(); selectionAbort = undefined; nativeSelectionChecking = false;
    selectionGeneration++; creationDraft++; selectionPending = !!workspaceInput.files?.length; pendingUpdate = undefined; rawSelection = undefined;
    form.hidden = true; title.value = '新しいプロジェクト'; clearConversion(); controls();
  });
  cancelSelection.addEventListener('click', () => { if ((!busy || nativeSelectionChecking) && !composing && !creationAttempt) { clearSelection(); status.textContent = ''; } });
  updateCancel.addEventListener('click', () => {
    if (!busy && !composing && pendingUpdate) { clearSelection(); status.textContent = ''; workspaceInput.focus?.(); }
  });
  updateConfirm.addEventListener('click', () => execute(async () => {
    const target = pendingUpdate;
    if (!target || !guardSelection(target.generation, target.context)) return;
    status.textContent = '更新を確認しています。';
    const opened = await openNormal(target.run, undefined, 'edit');
    let transferred = false;
    try {
      if (!guardSelection(target.generation, target.context)) return;
      const current = opened.read();
      if (opened.authority.readOnly) throw Error('取り込み先を編集用に開けません。別のタブで編集中の場合は閉じてから再試行してください。');
      const output = opened.workspaceOutput;
      if (current.state !== 'ready' || !current.publication || current.source?.proof.identity.projectId !== `prj_${target.run}` || opened.hasPending() ||
        output.error || output.jobs.some(job => !['generated', 'file-verified', 'cancelled', 'abandoned'].includes(job.state)))
        throw Error('取り込み先を確認できません。一覧からプロジェクトを開き、未完了の処理を確認してください。');
      try { await opened.workspaceFiles.receive(current.source.token, target.file); }
      catch (error) { if (!opened.hasPending()) throw error; }
      transferred = true;
      await replaceSelection(target.run, opened, target.generation, target.context);
      if (!disposed && selected === target.run && !opened.hasPending()) status.textContent = '更新を取り込みました。';
    } finally { if (!transferred) await opened.dispose(); }
  }));
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
  const openSelection=async(files:readonly File[], inspection?: {generation?: number})=>{
    ensureMaySwitch(); if (creationAttempt) throw Error('作成を再試行してください。');
    const selection = files.map(file => ({ file: file instanceof Blob ? file.slice() : file, label: file.name }));
    if (!selection.length) throw Error('ファイルを選択してください。');
    const total = selection.reduce((n, item) => n + item.file.size, 0);
    if (selection.length > ports.fileLimits.maxItems || !Number.isSafeInteger(total) || !ports.filePolicy&&total>ports.fileLimits.maxFileBytes ||
      selection.some(item => !Number.isSafeInteger(item.file.size) || item.file.size < 0)) throw Error('選択したファイルが読み込みの上限を超えています。');
    const generation = ++selectionGeneration, draft = creationDraft, context = selectionContext(); selectionPending = true;
    if (inspection) inspection.generation = generation;
    status.textContent = 'ファイルを確認しています。';
    clearConversion(); pendingUpdate = undefined; rawSelection = undefined; form.hidden = true;
    const models: ValidationModelFile[] = [], media: ValidationFile[] = [], packages: File[] = []; let actualTotal = 0, bufferedBytes=0;
    let unitlessMesh=false, unavailableObjMaterials=false;
    for (const item of selection) {
      const selectedFile:{readonly size:number;arrayBuffer():Promise<ArrayBuffer>}=item.file;
      if(!(selectedFile instanceof Blob)&&selectedFile.size>ports.fileLimits.maxFileBytes-bufferedBytes)throw Error('一度に選択するファイルの合計を減らしてください。');
      const selected = await selectionRead(generation,context,async signal => selectedFile instanceof Blob
        ? validationModelFile({label:item.label,file:selectedFile},policy,true,ports.fileLimits.maxFileBytes-bufferedBytes,signal)
        : {label:item.label,bytes:new Uint8Array(await selectedFile.arrayBuffer())});
      if (!selected || !guardSelection(generation, context) || draft !== creationDraft) return;
      if('package' in selected){
        actualTotal+=selected.package.size;
        if(!Number.isSafeInteger(actualTotal)||actualTotal>PACKAGE_LIMITS.archiveBytes)throw Error('選択したファイルが読み込みの上限を超えています。');
        packages.push(new File([selected.package],selected.label));continue;
      }
      const file:ValidationModelFile=selected;
      actualTotal += file.file ? file.file.size : file.bytes.byteLength;
      if (!Number.isSafeInteger(actualTotal)) throw Error('選択したファイルが読み込みの上限を超えています。');
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
    const hint = await selectionRead(generation,context,signal=>inspectZipContainerMetadata(file,undefined,signal)).catch((error: unknown) => {
      if (isUnrecognizedZip(error))
        throw new Error('ZIPの内容を確認できません。元のファイルを選び直してください。', { cause: error });
      throw error;
    });
    if(!hint||!guardSelection(generation,context))return;
    if(ports.openLegacy&&hint.identity!=='foreign'){legacyFile=file;fallback.hidden=false;}
    const legacy = hint.identity==='v1' ? await prepareFrozenV1Conversion(file, ports.fileLimits, ports.decode, ports.jpeg, ports.photo) : null; if (!guardSelection(generation, context)) return;
    let loci: Awaited<ReturnType<typeof prepareLociMyuConversion>> = null;
    if (hint.identity === 'foreign' && hint.hasSpreadsheetEntry) {
      const controller = new AbortController(); selectionAbort = controller; nativeSelectionChecking = true; controls();
      try { loci = await prepareLociMyuConversion(file, ports.fileLimits, ports.decode, ports.jpeg, ports.photo, controller.signal); }
      catch (error) { if (controller.signal.aborted && !selectionCurrent(generation, context)) return; throw error; }
      finally { if (selectionAbort === controller) { selectionAbort = undefined; nativeSelectionChecking = false; controls(); } }
    }
    if (!guardSelection(generation, context)) { await loci?.dispose(); return; }
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
      workbookLabel.hidden = lociPreview.sources.length === 1;
      workbook.value = String(lociPreview.selectedSourceIndex); conversionTitle.value = lociPreview.suggestedTitle; relation.checked = false;
      lociChoices.hidden = false; conversionPanel.hidden = false; await evaluateLoci(); status.textContent = ''; return;
    }
    const selectedArchive = await PackageArchive.inspect(file); if (!guardSelection(generation, context)) return;
    const manifest = selectedArchive.control.manifest, { purpose } = manifest;
    // From here the selected package can require local catalog, recovery or renderer work.
    if (inspection) delete inspection.generation;
    fallback.hidden = true; legacyFile = undefined;
    if (purpose === 'contribution' || purpose === 'teamWorkspace') {
      if (!catalogLoaded) await updateList();
      if (!guardSelection(generation, context)) return;
      const run = manifest.identity.projectId.slice(4), destination = catalog.find(item => item.run === run);
      if (destination?.state === 'ready') {
        pendingUpdate = { file, run, generation, context };
        updateNote.textContent = `「${destination.title}」に更新を取り込みます。`;
        status.textContent = '';
        return;
      }
      if (destination) throw Error('取り込み先に確認が必要なデータがあります。一覧から開いてください。');
      if (purpose === 'contribution') throw Error('この変更分の元になった作業一式を先に開いてください。');
    }
    if (purpose === 'backup') {
      const archive = await BackupArchive.fromSelectedArchive(selectedArchive, validationMetadataLimits); if (!guardSelection(generation, context)) return;
      const run = (archive.source.proof.identity.projectId as string).slice(4), opened = await ports.open(run, undefined, 'edit', undefined, undefined,
        { file, archive: { sha256: archive.archive.sha256, byteLength: archive.archive.byteLength } });
      try { if (!guardSelection(generation, context)) { await opened.dispose(); return; } } catch (error) { await opened.dispose(); throw error; }
      if (!('kind' in opened)) { await opened.dispose(); throw Error('バックアップの復元用の入口に接続できません。'); }
      await closeCurrent(); firstRecovery = opened; selected = run; navigation.hidden = true; renderFirstRecovery(); return;
    }
    if (purpose === 'review') {
      if (!ports.renderReview) throw Error('閲覧用シーンの表示が未接続です。');
      const renderReview = ports.renderReview;
      const archive = await ReviewArchive.fromSelectedArchive(selectedArchive, validationMetadataLimits);
      if (!guardSelection(generation, context)) return;
      const scenes = reviewSceneChoices(archive.review.snapshot);
      const loadScene = async (id: string, previous?: ReviewView) => {
        ensureMaySwitch(); await closeCurrent();
        previous?.releaseDisplayData();
        if (disposed) return;
        selected = null; ports.selected(null); clearSelection(); navigation.hidden = true;
        const attempt = selectionGeneration, expected = selectionContext();
        const choose = document.createElement('select'), retry = document.createElement('button'), leave = document.createElement('button');
        choose.setAttribute('aria-label', '表示するシーン'); retry.type = 'button'; retry.textContent = 'シーンを開く';
        leave.type = 'button'; leave.textContent = '別のプロジェクトを開く'; leave.addEventListener('click', () => selectProject());
        for (const scene of scenes) { const option = document.createElement('option'); option.value = String(scene.id); option.textContent = String(scene.name); choose.append(option); }
        choose.value = id; content.append(choose, retry, leave);
        const load = async () => {
          if (!guardSelection(attempt, expected)) return;
          choose.disabled = retry.disabled = leave.disabled = true;
          status.textContent = 'シーンを開いています。';
          try {
            const next = await prepareReviewView(archive, policy, ports.decode, ports.jpeg, ports.photo, ports.mediaDecoders, choose.value);
            if (guardSelection(attempt, expected)) await showScene(next, attempt, expected);
          } finally { choose.disabled = retry.disabled = leave.disabled = false; }
        };
        retry.addEventListener('click', () => execute(load));
        await load();
      };
      const showScene = async (view: ReviewView, generation: number, context: ReturnType<typeof selectionContext>) => {
        const prepared = await ownRender(renderReview(view));
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
          }), {
            projects: async () => (await ports.list()).filter(project => project.state === 'ready'),
            inspect: async run => {
              const captured = selectionContext(), editGeneration = selectionGeneration;
              const opened = await openNormal(run, undefined, 'view');
              try {
                const read = opened.read();
                if (!selectionCurrent(editGeneration, captured) || read.state !== 'ready' || !read.source || !read.publication || opened.hasPending())
                  throw Error('追加先のプロジェクトを確認できません。選び直してください。');
                const publication = read.publication, token = read.source.token;
                return { reason: sceneAppendCompatibility(read.source, view.inspection), confirm: async () => {
                  let failure: unknown;
                  await execute(async () => {
                    try {
                      if (!guardSelection(editGeneration, captured)) return;
                      const target = await openNormal(run, undefined, 'edit');
                      const attemptId = newId();
                      let sceneId: string | undefined;
                      try {
                        sceneId = await target.sceneAppend.start(attemptId, publication, token, view.inspection);
                      } catch (error) {
                        if (target.sceneAppend.jobs.some(job => job.id === attemptId)) {
                          await replaceSelection(run, target, editGeneration, captured);
                          throw error;
                        }
                        await target.dispose(); throw error;
                      }
                      await replaceSelection(run, target, editGeneration, captured, sceneId);
                    } catch (error) { failure = error; }
                  });
                  if (failure) throw failure;
                } };
              } finally { await opened.dispose(); }
            },
          }, id => execute(async () => {
            if (reviewWorkspace !== currentReview || resident !== prepared) return;
            await loadScene(id, view);
          })); reviewWorkspace = currentReview; content.append(reviewWorkspace.root); reviewWorkspace.render();
          selected = null; ports.selected(null); navigation.hidden = true; clearSelection();
          status.textContent = '閲覧用シーンを開きました。編集プロジェクトは作成していません。';
        } catch (error) { if (resident === prepared) resident = undefined; throw error; }
        finally { if (resident !== prepared) await releaseRender(prepared); }
      };
      if (scenes.length > 1) await loadScene(String((archive.review.snapshot.project as JsonObject).defaultSceneId));
      else {
        const view = await prepareReviewView(archive, policy, ports.decode, ports.jpeg, ports.photo, ports.mediaDecoders);
        await showScene(view, generation, context);
      }
      return;
    }
    const inspected = purpose === 'clean' ? await CleanArchive.inspect(file, validationMetadataLimits) : await WorkspaceArchive.inspect(file, validationMetadataLimits);
    if (!guardSelection(generation, context)) return;
    const run = (inspected.source.proof.identity.projectId as string).slice(4);
    const opened = await openNormal(run, undefined, 'edit', file, undefined, undefined, purpose === 'teamWorkspace');
    await replaceSelection(run, opened, generation, context);
  };
  workspaceForm.addEventListener('submit',event=>{
    event.preventDefault();
    const files = Array.from(workspaceInput.files ?? []);
    if (!files.length) {
      if (disposed || openFile.disabled || workspaceForm.inert || navigation.hidden) return;
      workspaceInput.click(); return;
    }
    const inspection: {generation?: number} = {};
    void execute(()=>openSelection(files, inspection), inspection);
  });
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
    let reference: ProjectResumeReference | null = null;
    try { reference = projectResumeReference(ports.lastProject?.read()); } catch { /* No advisory hint is a normal selector start. */ }
    let reopening: readonly ValidationProjectEntry[] = [];
    try {
      if (reference) reopening = await ports.list(ports.progressivePresentation ? { run: reference.run, show(reading) {
        if (disposed) return;
        const next = reading ? createResumeReading(document, reading) : undefined;
        clearResumeReading(); resumeReading = next; navigation.hidden = !!next;
        if (next) {
          status.textContent = '';
          content.append(next.root);
        }
        controls();
      } } : undefined, reference.run);
      else await updateList();
    } catch (error) {
      if (disposed) return;
      clearResumeReading(); navigation.hidden = false;
      if (!reference) throw error;
      await updateList(); if (!disposed) status.textContent = '最後のプロジェクトを再開できません。一覧またはファイルから開いてください。'; return;
    }
    if (disposed) return;
    if (!reference) return;
    if (!reopening.some(entry => entry.run === reference.run && entry.state === 'ready')) {
      clearResumeReading(); navigation.hidden = false;
      await updateList();
      if (!disposed) status.textContent = '最後のプロジェクトを再開できません。一覧またはファイルから開いてください。'; return;
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
    async dispose() { if (disposed) return; disposed = true; openingReading = undefined; clearResumeReading(); stopHelp();
      homeSettings?.dispose();
      selectionAbort?.abort();
      stopPresentation();
      try { await operation; } catch { /* Original input and saved failure are never acknowledged here. */ }
      try { await creationAttempt?.candidate?.dispose(); }
      finally { await lociPreview?.dispose(); lociPreview = null; try { await closeCurrent(); } finally {
        try { while(renderJobs.size)await Promise.allSettled([...renderJobs]);if(retirementFailure)throw retirementFailure; }
        finally { offline?.dispose(); projectOpenButtons.clear();root.remove(); }
      } } }, get selected() { return selected; } };
}
