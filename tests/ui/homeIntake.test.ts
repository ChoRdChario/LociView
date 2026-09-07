import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountHome, type HomeDeps } from '../../src/ui/home';
import type { NativeHomeUi } from '../../src/nativeGs/homeUi';
import type { WorkspaceFS } from '../../src/platform/fs';
import { inspectZip } from '../../src/assets/package';
import { inspectZipContainerIdentity } from '../../src/assets/zipio';
import { confirmDialog, infoDialog } from '../../src/ui/dialogs';
import { downloadBlob } from '../../src/ui/dom';
import {
  parseCandidateV1ManifestBytes,
  readPublishedCandidateV1ManifestBytes,
} from '../../src/core/manifest';

vi.mock('../../src/platform/pwa', () => ({
  isStandalone: vi.fn(() => true),
  onInstallAvailability: vi.fn(),
  promptInstall: vi.fn(),
}));
vi.mock('../../src/ui/dialogs', () => ({
  confirmDialog: vi.fn(),
  infoDialog: vi.fn(async () => undefined),
}));
vi.mock('../../src/ui/dom', async (original) => ({
  ...await original<object>(),
  downloadBlob: vi.fn(),
}));
vi.mock('../../src/assets/package', async (original) => ({
  ...await original<object>(),
  inspectZip: vi.fn(),
}));
vi.mock('../../src/assets/zipio', async (original) => ({
  ...await original<object>(),
  inspectZipContainerIdentity: vi.fn(),
}));
vi.mock('../../src/core/manifest', async (original) => ({
  ...await original<object>(),
  readPublishedCandidateV1ManifestBytes: vi.fn(),
  parseCandidateV1ManifestBytes: vi.fn(),
}));

class HomeNode extends EventTarget {
  constructor(readonly tag = 'div') { super(); }
  nodes: HomeNode[] = [];
  parent: HomeNode | null = null;
  attrs = new Map<string, string>();
  className = '';
  hidden = false;
  disabled = false;
  open = false;
  value = '';
  files?: File[];
  textContent = '';
  focusCount = 0;
  readonly classList = {
    add: (...names: string[]) => {
      const values = new Set(this.className.split(/\s+/u).filter(Boolean));
      for (const name of names) values.add(name);
      this.className = [...values].join(' ');
    },
    remove: (...names: string[]) => {
      const removed = new Set(names);
      this.className = this.className.split(/\s+/u).filter((name) => name !== '' && !removed.has(name)).join(' ');
    },
  };
  get children(): HomeNode[] { return this.nodes.filter((node) => node.tag !== '#text'); }
  get firstChild(): HomeNode | null { return this.nodes[0] ?? null; }
  setAttribute(key: string, value: string) {
    this.attrs.set(key, value);
    if (key === 'hidden') this.hidden = true;
    if (key === 'disabled') this.disabled = true;
  }
  append(...nodes: HomeNode[]) {
    for (const node of nodes) {
      node.parent?.removeChild(node);
      node.parent = this;
      this.nodes.push(node);
    }
  }
  removeChild(node: HomeNode) {
    this.nodes = this.nodes.filter((candidate) => candidate !== node);
    node.parent = null;
  }
  focus() { this.focusCount += 1; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}

function search(node: HomeNode, predicate: (candidate: HomeNode) => boolean): HomeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = search(child, predicate);
    if (found !== undefined) return found;
  }
}

function drop(root: HomeNode, file: File): void {
  const picker = search(root, (node) => node.className.split(/\s+/u).includes('lv-drop'))!;
  const event = Object.assign(new Event('drop'), { dataTransfer: { files: [file] } });
  picker.dispatchEvent(event);
}

function setup(options: { existingConventional?: boolean } = {}) {
  const root = new HomeNode();
  const release = vi.fn();
  let notifyCreationPending: (pending: boolean) => void = () => undefined;
  const acceptModelFile = vi.fn(async () => undefined);
  const acceptPackageFile = vi.fn();
  const creation = new HomeNode('section');
  creation.hidden = true;
  const nativeHome: NativeHomeUi = {
    projects: new HomeNode() as unknown as HTMLElement,
    creation: creation as unknown as HTMLElement,
    transfer: new HomeNode('section') as unknown as HTMLElement,
    onCreationPendingChange(listener) {
      notifyCreationPending = listener;
      listener(false);
      return () => undefined;
    },
    acceptModelFile,
    acceptPackageFile,
    busy: false,
    beginIntake: vi.fn(() => release),
  };
  const list = vi.fn(async () => options.existingConventional
    ? ['projects/saved/lociview.json']
    : []);
  const registerConventionalPackage = vi.fn(async () => 'projects/registered');
  const openProject = vi.fn(async () => undefined);
  const deps: HomeDeps = {
    nativeHome,
    fs: { list } as unknown as WorkspaceFS,
    identity: {
      userId: 'usr_00000000000000000000000001',
      deviceId: 'dev_00000000000000000000000001',
      displayName: 'test',
    },
    openProject,
    registerConventionalPackage,
    openProfile: vi.fn(),
    storageWarning: null,
    listNativeProjects: vi.fn(async () => []),
    openNativeProjects: vi.fn(),
    restoreNativePackage: vi.fn(),
    convertLociMyuZipToNative: vi.fn(),
  };
  mountHome(root as unknown as HTMLElement, deps);
  return {
    root, release, acceptModelFile, acceptPackageFile, registerConventionalPackage, openProject,
    notifyCreationPending,
  };
}

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: (tag: string) => new HomeNode(tag),
    createTextNode: (text: string) => Object.assign(new HomeNode('#text'), { textContent: text }),
  });
  vi.stubGlobal('HTMLInputElement', HomeNode);
  vi.stubGlobal('HTMLTextAreaElement', HomeNode);
  vi.stubGlobal('HTMLSelectElement', HomeNode);
  vi.mocked(infoDialog).mockResolvedValue(undefined);
  vi.mocked(readPublishedCandidateV1ManifestBytes).mockResolvedValue(new Uint8Array([1]));
  vi.mocked(parseCandidateV1ManifestBytes).mockReturnValue({
    projectId: 'prj_01J00000000000000000000001',
    name: '保存済み旧プロジェクト',
    createdAt: '2026-09-07T00:00:00.000Z',
  } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ordinary home file intake', () => {
  it('keeps the idle product and file-entry guidance concise', () => {
    const mounted = setup();
    expect(search(mounted.root, (node) => node.nodes.some((text) => (
      text.textContent === 'LociViewは、3Dデータにキャプションとメディアを添付するツールです'
    )))).toBeDefined();
    expect(search(mounted.root, (node) => node.nodes.some((text) => (
      text.textContent === '作業内容はこの端末に保存されます。同じプロジェクトを使う相手とは、共同編集用ファイルでキャプション変更をやり取りできます。'
    )))).toBeDefined();
    expect(search(mounted.root, (node) => node.nodes.some((text) => (
      text.textContent === '選択またはここにドロップ'
    )))).toBeDefined();
    expect(search(mounted.root, (node) => node.nodes.some((text) => (
      text.textContent.includes('LociViewが内容を確認') || text.textContent.includes('別の端末へ渡す')
    )))).toBeUndefined();
  });

  it('shows one idle intake and replaces it with model creation after inspection', () => {
    const mounted = setup();
    const picker = search(mounted.root, (node) => node.className.split(/\s+/u).includes('lv-drop'))!;
    expect(picker.attrs.get('aria-label')).toBe('ファイルを開く');
    expect(picker.attrs.get('aria-describedby')).toBe('lv-file-open-hint');
    const projectHeading = search(mounted.root, (node) => node.nodes.some((text) => (
      text.textContent === 'この端末のプロジェクト'
    )))!;
    const projects = projectHeading.parent!;
    expect(picker.hidden).toBe(false);
    expect(projects.hidden).toBe(false);

    mounted.notifyCreationPending(true);
    expect(picker.hidden).toBe(true);
    expect(projects.hidden).toBe(true);

    mounted.notifyCreationPending(false);
    expect(picker.hidden).toBe(false);
    expect(projects.hidden).toBe(false);
    expect(picker.focusCount).toBe(1);
  });

  it('routes by inspected content even when package and model filenames are misleading', async () => {
    vi.mocked(inspectZipContainerIdentity).mockResolvedValueOnce('native-portable');
    const packageHome = setup();
    const renamedPackage = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'research-data.bin');
    drop(packageHome.root, renamedPackage);
    await vi.waitFor(() => expect(packageHome.acceptPackageFile).toHaveBeenCalledWith(renamedPackage));

    vi.mocked(inspectZipContainerIdentity).mockRejectedValueOnce(new Error('not a ZIP container'));
    const modelHome = setup();
    const renamedModel = new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], 'research-data.bin');
    drop(modelHome.root, renamedModel);
    await vi.waitFor(() => expect(modelHome.acceptModelFile).toHaveBeenCalledWith(renamedModel));
  });

  it('cancels a valid old-format file before registration or navigation', async () => {
    vi.mocked(inspectZipContainerIdentity).mockResolvedValueOnce('v1');
    vi.mocked(inspectZip).mockResolvedValueOnce({
      manifest: { projectId: 'prj_01J00000000000000000000002' },
      opsIssues: [],
    } as never);
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const mounted = setup();
    drop(mounted.root, new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'old-project.data'));

    await vi.waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    expect(mounted.registerConventionalPackage).not.toHaveBeenCalled();
    expect(mounted.openProject).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
    const status = search(mounted.root, (node) => node.className.split(/\s+/u).includes('lv-file-status'))!;
    expect(status.textContent).toContain('中止しました');
  });

  it('uses one truthful confirmation for an already-saved old-format Project', async () => {
    vi.mocked(inspectZipContainerIdentity).mockResolvedValueOnce('v1');
    vi.mocked(inspectZip).mockResolvedValueOnce({
      manifest: { projectId: 'prj_01J00000000000000000000001' },
      opsIssues: [],
    } as never);
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const mounted = setup({ existingConventional: true });
    drop(mounted.root, new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'another-copy.bin'));

    await vi.waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    expect(vi.mocked(confirmDialog).mock.calls[0]?.[2]).toBe('保存済みを閲覧専用で開く');
    expect(mounted.registerConventionalPackage).not.toHaveBeenCalled();
    expect(mounted.openProject).not.toHaveBeenCalled();
  });

  it('does not download a malformed-source report until the user explicitly requests it', async () => {
    vi.mocked(inspectZipContainerIdentity).mockResolvedValueOnce('v1');
    vi.mocked(inspectZip).mockResolvedValueOnce({
      manifest: { projectId: 'prj_01J00000000000000000000003' },
      opsIssues: [{ path: 'ops/source.jsonl', line: 3, reason: 'schema violation' }],
    } as never);
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const cancelled = setup();
    drop(cancelled.root, new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'malformed.bin'));
    await vi.waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(cancelled.registerConventionalPackage).not.toHaveBeenCalled();

    vi.clearAllMocks();
    vi.mocked(inspectZipContainerIdentity).mockResolvedValueOnce('v1');
    vi.mocked(inspectZip).mockResolvedValueOnce({
      manifest: { projectId: 'prj_01J00000000000000000000003' },
      opsIssues: [{ path: 'ops/source.jsonl', line: 3, reason: 'schema violation' }],
    } as never);
    vi.mocked(confirmDialog).mockResolvedValueOnce(true);
    const confirmed = setup();
    drop(confirmed.root, new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'malformed-again.bin'));
    await vi.waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(confirmed.registerConventionalPackage).not.toHaveBeenCalled();
    expect(confirmed.openProject).not.toHaveBeenCalled();
  });
});
