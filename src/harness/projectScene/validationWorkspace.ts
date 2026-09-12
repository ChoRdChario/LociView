import { newId } from '../../projectMetadata/persistence';
import { prepareValidationProject, type ValidationFile } from '../../projectFiles/initialProject';
import { prepareValidationCreation } from '../../projectFiles/creation';
import type { FileValidationLimits } from '../../projectFiles/validation';
import type { PngDecoder } from '../../projectFiles/png';
import type { openValidationHost } from './validationHost';
import type { ValidationProjectEntry } from './validationCatalog';
import { createSavedWorkspace } from './metadataWorkspace';
import type { ViewportFactory } from './viewportHost';

type Host = Awaited<ReturnType<typeof openValidationHost>>;
export interface ValidationWorkspacePorts {
  fileLimits: FileValidationLimits; decode?: PngDecoder;
  list(): Promise<ValidationProjectEntry[]>;
  open(run: string, initial?: ReturnType<typeof prepareValidationCreation>): Promise<Host>;
  render(host: Host): Promise<{ factory: ViewportFactory; dispose(): void }>;
  selected(run: string | null): void;
}

/** One opt-in selector/editor. A switch is refused while input/save/IME is pending. */
export function createValidationWorkspace(document: Document, ports: ValidationWorkspacePorts, initialRun?: string) {
  const root = document.createElement('section'), navigation = document.createElement('section'), content = document.createElement('section');
  root.className = 'lv-validation-host'; navigation.className = 'lv-validation-home';
  const heading = document.createElement('h1'); heading.textContent = '実ファイルで検証';
  const help = document.createElement('p'); help.textContent = '静的GLB（内蔵PNG・外部参照なし）とPNGを使います。検証用の新しいプロジェクトに保存します。既存プロジェクトは変更しません。';
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
  const listHeading = document.createElement('h2'); listHeading.textContent = 'この端末の検証プロジェクト';
  navigation.append(heading, help, form, listHeading, refresh, list); root.append(back, status, navigation, content);
  let host: Host | undefined, workspace: ReturnType<typeof createSavedWorkspace> | undefined;
  let resident: Awaited<ReturnType<ValidationWorkspacePorts['render']>> | undefined;
  let busy = false, disposed = false, composing = false, selected: string | null = null, operation: Promise<void> | undefined;
  const changed = () => !!workspace?.hasChanges() || !!host?.hasPending();
  const controls = () => { navigation.inert = busy; create.disabled = busy || composing; back.disabled = busy; back.hidden = !host; };
  title.addEventListener('compositionstart', () => { composing = true; controls(); });
  title.addEventListener('compositionend', () => { composing = false; controls(); });
  const execute = (action: () => Promise<void>) => {
    if (busy || disposed) return; busy = true; controls();
    const work = action(); operation = work;
    void work.catch(error => { if (!disposed) status.textContent = error instanceof Error ? error.message : '処理できません。入力と保存データは保持しています。'; })
      .finally(() => { busy = false; if (operation === work) operation = undefined; if (!disposed) controls(); });
  };
  const closeCurrent = async () => {
    const oldWorkspace = workspace, oldHost = host, oldResident = resident;
    workspace = undefined; host = undefined; resident = undefined;
    if (oldWorkspace) await oldWorkspace.dispose(); else await oldHost?.dispose(); oldResident?.dispose(); content.replaceChildren();
  };
  const ensureMaySwitch = () => {
    if (composing || changed()) throw Error('入力・保存を確定するか、取り消してからプロジェクトを切り替えてください。');
  };
  const updateList = async () => {
    const entries = await ports.list(); if (disposed) return;
    list.replaceChildren();
    if (!entries.length) { list.textContent = '検証プロジェクトはありません。'; return; }
    for (const item of entries) {
      const row = document.createElement('p'), name = document.createElement('span'), open = document.createElement('button');
      name.textContent = `${item.title} — ${item.state === 'ready' ? '保存済み' : item.state === 'incomplete' ? '保存が未完了' : '要確認'} `;
      open.type = 'button'; open.textContent = item.state === 'ready' ? '開く' : '保存状態を確認';
      open.addEventListener('click', () => execute(async () => { ensureMaySwitch(); await closeCurrent(); await openProject(item.run); }));
      row.append(name, open); list.append(row);
    }
  };
  const mount = async () => {
    if (!host || disposed) return;
    content.replaceChildren();
    if (host.read().state !== 'ready' || host.hasPending()) {
      const note = document.createElement('p'), retry = document.createElement('button');
      note.textContent = host.authority.status?.().error || '保存が未完了です。元の変更から再試行してください。';
      retry.type = 'button'; retry.textContent = '保存を再試行'; retry.disabled = !!host.authority.readOnly;
      retry.addEventListener('click', () => execute(async () => { await host!.authority.retry!(); await mount(); }));
      content.append(note, retry); return;
    }
    status.textContent = '保存したモデルを読み込んでいます。';
    const target = host, next = await ports.render(target);
    if (disposed || host !== target) { next.dispose(); return; }
    resident = next;
    try { workspace = createSavedWorkspace(document, target, next.factory); content.replaceChildren(workspace.root); }
    catch (error) { next.dispose(); resident = undefined; throw error; }
    status.textContent = '検証用プロジェクト。通常画面・オフライン・実機での受入れは未完了です。';
  };
  const openProject = async (run: string, initial?: ReturnType<typeof prepareValidationCreation>) => {
    status.textContent = initial ? '検査した内容を保存しています。' : '保存内容を確認しています。';
    const opened = await ports.open(run, initial);
    if (disposed) { await opened.dispose(); return; }
    host = opened; selected = run; ports.selected(run); navigation.hidden = true; await mount();
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
  execute(initialRun ? () => openProject(initialRun) : updateList);
  return { root, hasChanges: () => busy || composing || changed() || !navigation.hidden && (!!files.files?.length || title.value !== '新しいプロジェクト'),
    async dispose() { if (disposed) return; disposed = true;
      try { await operation; } catch { /* Original input and saved failure are never acknowledged here. */ }
      await closeCurrent(); root.remove(); }, get selected() { return selected; } };
}
