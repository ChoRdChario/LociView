import { newId } from '../../projectMetadata/persistence';
import { prepareValidationProject, type ValidationFile } from '../../projectFiles/initialProject';
import { prepareValidationCreation } from '../../projectFiles/creation';
import type { FileValidationLimits } from '../../projectFiles/validation';
import type { PngDecoder } from '../../projectFiles/png';
import type { openValidationHost } from './validationHost';
import { createValidationModeHost, type ValidationDisplayHost } from './validationModeHost';
import type { LocalOpenMode } from './savedHost';
import type { ValidationProjectEntry } from './validationCatalog';
import { createSavedWorkspace } from './metadataWorkspace';
import type { ViewportFactory } from './viewportHost';
import { createValidationReceiveControls } from './validationReceiveControls';

type Host = ReturnType<typeof createValidationModeHost>;
export interface ValidationWorkspacePorts {
  fileLimits: FileValidationLimits; decode?: PngDecoder;
  list(): Promise<ValidationProjectEntry[]>;
  open(run: string, initial?: ReturnType<typeof prepareValidationCreation>, mode?: LocalOpenMode): Promise<Awaited<ReturnType<typeof openValidationHost>>>;
  render(host: ValidationDisplayHost): Promise<{ factory: ViewportFactory; dispose(): void }>;
  selected(run: string | null, mode?: LocalOpenMode): void;
}

/** One opt-in selector/editor. A switch is refused while input/save/IME is pending. */
export function createValidationWorkspace(document: Document, ports: ValidationWorkspacePorts, initialRun?: string, initialMode: LocalOpenMode = 'edit') {
  const root = document.createElement('section'), navigation = document.createElement('section'), content = document.createElement('section');
  root.className = 'lv-validation-host'; navigation.className = 'lv-validation-home';
  const heading = document.createElement('h1'); heading.textContent = '実ファイルで検証';
  const help = document.createElement('p'); help.textContent = '静的GLB（内蔵PNG・外部参照なし）とPNGを使います。新しい検証プロジェクトを作成します。再開用データはこのブラウザ内のみで、ファイル保存は未接続です。既存プロジェクトは変更しません。';
  const form = document.createElement('form'), title = document.createElement('input'), files = document.createElement('input');
  title.value = '新しいプロジェクト'; title.maxLength = 256; title.setAttribute('aria-label', 'プロジェクト名');
  files.type = 'file'; files.multiple = true; files.setAttribute('aria-label', '3Dモデルとメディアを選択');
  const create = document.createElement('button'); create.textContent = 'プロジェクトを作成'; create.type = 'submit';
  const titleLabel = document.createElement('label'), filesLabel = document.createElement('label');
  titleLabel.textContent = 'プロジェクト名'; filesLabel.textContent = '3Dモデルとメディアを選択';
  titleLabel.append(title); filesLabel.append(files); form.append(titleLabel, filesLabel, create);
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const list = document.createElement('section'), refresh = document.createElement('button'), back = document.createElement('button');
  refresh.type = back.type = 'button'; refresh.textContent = '一覧を更新'; back.textContent = 'プロジェクトを選ぶ';
  const listHeading = document.createElement('h2'); listHeading.textContent = 'このブラウザの再開用データ';
  navigation.append(heading, help, form, listHeading, refresh, list); root.append(back, status, navigation, content);
  let host: Host | undefined, workspace: ReturnType<typeof createSavedWorkspace> | undefined;
  let receiveTools: ReturnType<typeof createValidationReceiveControls> | undefined;
  let resident: Awaited<ReturnType<ValidationWorkspacePorts['render']>> | undefined;
  let busy = false, disposed = false, composing = false, selected: string | null = null, operation: Promise<void> | undefined;
  const changed = () => !!workspace?.hasChanges() || !!receiveTools?.hasChanges() || !!host?.hasPending();
  const controls = () => { navigation.inert = busy; create.disabled = busy || composing; back.disabled = busy; back.hidden = !host; };
  title.addEventListener('compositionstart', () => { composing = true; controls(); });
  title.addEventListener('compositionend', () => { composing = false; controls(); });
  const execute = (action: () => Promise<void>) => {
    if (busy || disposed) return; busy = true; controls();
    const work = action(); operation = work;
    void work.catch(error => { if (!disposed) status.textContent = error instanceof Error ? error.message : '処理できません。入力と再開用データは保持しています。'; })
      .finally(() => { busy = false; if (operation === work) operation = undefined; if (!disposed) controls(); });
  };
  const closeCurrent = async () => {
    const oldWorkspace = workspace, oldHost = host, oldResident = resident;
    workspace = undefined; host = undefined; resident = undefined;
    if (oldWorkspace) await oldWorkspace.dispose(); else await oldHost?.dispose(); oldResident?.dispose(); content.replaceChildren();
    receiveTools?.dispose(); receiveTools = undefined;
  };
  const ensureMaySwitch = () => {
    if (composing || changed()) throw Error('入力・更新を確定するか、取り消してからプロジェクトを切り替えてください。');
  };
  const updateList = async () => {
    const entries = await ports.list(); if (disposed) return;
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
  const mount = async () => {
    if (!host || disposed) return;
    content.replaceChildren();
    if (host.read().state !== 'ready' || host.hasPending()) {
      const note = document.createElement('p'), retry = document.createElement('button');
      note.textContent = host.authority.status?.().error || '更新が未完了です。元の変更から再試行してください。';
      retry.type = 'button'; retry.textContent = '更新を再試行'; retry.disabled = !!host.authority.readOnly;
      retry.addEventListener('click', () => execute(async () => { await host!.authority.retry!(); await mount(); }));
      content.append(note, retry); if (receiveTools) { receiveTools.render(); content.append(receiveTools.root); }
      retry.hidden = !!host.workspaceFiles.jobs.some(j => !['completed', 'cancelled', 'abandoned'].includes(j.state));
      if (host.mode?.current === 'view') {
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '編集を開始する';
        edit.addEventListener('click', () => execute(async () => {
          await host!.mode!.change('edit', host!.read().source?.token, () => {}); await mount();
        }));
        note.textContent = `更新が未完了です。編集を開始して復旧してください。${host.mode.detail}`; content.append(edit);
      }
      return;
    }
    status.textContent = 'モデルを読み込んでいます。';
    const target = host, next = await ports.render(target);
    if (disposed || host !== target) { next.dispose(); return; }
    resident = next;
    try { workspace = createSavedWorkspace(document, target, next.factory, receiveTools ? () => receiveTools! : undefined);
      content.replaceChildren(workspace.root); workspace.render(); }
    catch (error) { next.dispose(); resident = undefined; throw error; }
    status.textContent = '検証用プロジェクト。通常画面・オフライン・実機での受入れは未完了です。';
  };
  const openProject = async (run: string, initial?: ReturnType<typeof prepareValidationCreation>, mode: LocalOpenMode = 'edit') => {
    status.textContent = initial ? 'プロジェクトを作成しています。' : '再開用データを確認しています。';
    const opened = await ports.open(run, initial, mode);
    if (disposed) { await opened.dispose(); return; }
    host = createValidationModeHost(opened, nextMode => ports.open(run, undefined, nextMode), nextMode => ports.selected(run, nextMode));
    receiveTools = createValidationReceiveControls(document, host, () => workspace?.session,
      () => { workspace?.render(); controls(); }, async () => { if (!workspace && !disposed) await mount(); });
    selected = run; ports.selected(run, host.mode!.current); navigation.hidden = true; await mount();
  };
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
      else if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) media.push(item);
      else throw Error('この検証では静的GLBとPNGを選択してください。元のファイルは変更していません。');
    }
    const run = newId(), initial = prepareValidationCreation(await prepareValidationProject({ run, title: name, models, media }, ports.fileLimits, ports.decode));
    if (disposed) return; await closeCurrent(); await openProject(run, initial);
    // Clear the selection only after creation is actually ready; the host retains exact retry input otherwise.
    if (host?.read().state === 'ready') files.value = '';
  }); });
  back.addEventListener('click', () => execute(async () => {
    ensureMaySwitch(); await closeCurrent(); selected = null; ports.selected(null); navigation.hidden = false; status.textContent = ''; await updateList();
  }));
  refresh.addEventListener('click', () => execute(updateList));
  execute(initialRun ? () => openProject(initialRun, undefined, initialMode) : updateList);
  return { root, hasChanges: () => busy || composing || changed() || !navigation.hidden && (!!files.files?.length || title.value !== '新しいプロジェクト'),
    async dispose() { if (disposed) return; disposed = true;
      try { await operation; } catch { /* Original input and saved failure are never acknowledged here. */ }
      await closeCurrent(); root.remove(); }, get selected() { return selected; } };
}
