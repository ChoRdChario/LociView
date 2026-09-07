import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootNativeGsApp } from '../../src/nativeGs/app';
import { OpfsFS } from '../../src/platform/opfs';
import type { NativeHomeUi } from '../../src/nativeGs/homeUi';
import { inspectNativePortablePackageV1, restoreNativePortablePackageV1 } from '../../src/nativeGs/portablePackage';
import {
  detectNativePackageContainerKindV1,
  inspectNativeExchangePackageV1,
  restoreNativeExchangePackageV1,
} from '../../src/nativeGs/packageExchange';
import { listNativeProjectsV1 } from '../../src/nativeGs/storage';
import { makeGsPlySource, makeNativeDraft, makePointPlySource, snapshotFromDraft } from './nativeTestProject';

vi.mock('../../src/platform/opfs', () => ({ OpfsFS: { isAvailable: vi.fn(), open: vi.fn(async () => ({})) } }));
vi.mock('../../src/platform/pwa', () => ({ registerPwa: vi.fn(async () => null) }));
vi.mock('../../src/nativeGs/offline', async (original) => ({
  ...await original<object>(), isNativeGsOfflineReady: vi.fn(async () => false),
}));
vi.mock('../../src/nativeGs/storage', async (original) => ({
  ...await original<object>(), listNativeProjectsV1: vi.fn(async () => []),
}));
vi.mock('../../src/nativeGs/portablePackage', async (original) => ({
  ...await original<object>(),
  inspectNativePortablePackageV1: vi.fn(),
  restoreNativePortablePackageV1: vi.fn(),
}));
vi.mock('../../src/nativeGs/packageExchange', async (original) => ({
  ...await original<object>(),
  detectNativePackageContainerKindV1: vi.fn(),
  inspectNativeExchangePackageV1: vi.fn(),
  restoreNativeExchangePackageV1: vi.fn(),
}));

/** Native home composition only: no real files, OPFS, dialogs or browser layout. */
class HomeNode extends EventTarget {
  constructor(readonly tag = 'div') { super(); }
  nodes: HomeNode[] = [];
  parent: HomeNode | null = null;
  attrs = new Map<string,string>();
  private inputValue = '';
  files: File[] | null = null;
  className = '';
  hidden = false;
  disabled = false;
  open = false;
  textContent = '';
  focusCount = 0;
  style = { setProperty: vi.fn() };
  get children(): HomeNode[] { return this.nodes.filter((node) => node.tag !== '#text'); }
  get firstChild(): HomeNode | null { return this.nodes[0] ?? null; }
  get childElementCount(): number { return this.children.length; }
  get value(): string { return this.inputValue; }
  set value(value: string) {
    this.inputValue = value;
    if (value === '' && this.attrs.get('type') === 'file') this.files = null;
  }
  setAttribute(key: string, value: string) {
    this.attrs.set(key, value);
    if (key === 'hidden') this.hidden = true;
    if (key === 'disabled') this.disabled = true;
  }
  append(...nodes: HomeNode[]) { for (const node of nodes) { node.parent?.removeChild(node); node.parent = this; this.nodes.push(node); } }
  removeChild(node: HomeNode) { this.nodes = this.nodes.filter((entry) => entry !== node); node.parent = null; }
  scrollIntoView() {}
  focus() { if (!this.disabled) this.focusCount += 1; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}
const search = (node: HomeNode, predicate: (node: HomeNode) => boolean): HomeNode | undefined => {
  if (predicate(node)) return node;
  for (const child of node.children) { const found = search(child, predicate); if (found) return found; }
};
const collect = (node: HomeNode, predicate: (node: HomeNode) => boolean): HomeNode[] => {
  const found = predicate(node) ? [node] : [];
  for (const child of node.children) found.push(...collect(child, predicate));
  return found;
};

function gltfWithPrimitiveModes(modes: readonly number[]): string {
  return JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{
      byteLength: 36,
      uri: 'data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAA',
    }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{
      bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0],
    }],
    meshes: [{ primitives: modes.map((mode) => ({ attributes: { POSITION: 0 }, mode })) }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  });
}

const triangleGltf = gltfWithPrimitiveModes([4]);

function triangleGlb(): Uint8Array {
  const source = new TextEncoder().encode(triangleGltf);
  const jsonLength = Math.ceil(source.byteLength / 4) * 4;
  const result = new Uint8Array(20 + jsonLength);
  result.fill(0x20, 20);
  result.set(source, 20);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  return result;
}

const triangleObj = [
  'v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3', '',
].join('\n');

const triangleStl = [
  'solid triangle',
  'facet normal 0 0 1',
  'outer loop',
  'vertex 0 0 0',
  'vertex 1 0 0',
  'vertex 0 1 0',
  'endloop',
  'endfacet',
  'endsolid triangle',
  '',
].join('\n');
beforeEach(() => {
  vi.mocked(OpfsFS.isAvailable).mockResolvedValue(true);
  vi.mocked(listNativeProjectsV1).mockResolvedValue([]);
  vi.mocked(detectNativePackageContainerKindV1).mockResolvedValue('backup');
  vi.mocked(inspectNativePortablePackageV1).mockResolvedValue({
    manifest: { nativeSnapshot: { byteLength: 2 } },
    snapshot: {
      project: { id: 'prj_TEST', title: '確認用プロジェクト' },
      snapshotId: 'snp_TEST', generation: 1, assets: [], representations: [], captions: [], mediaResources: [],
    },
    representationByteLength: 0,
    mediaByteLength: 0,
  } as never);
  vi.stubGlobal('document', {
    createElement: (tag: string) => new HomeNode(tag),
    createTextNode: (text: string) => Object.assign(new HomeNode('#text'), { textContent: text }),
  });
  vi.stubGlobal('HTMLInputElement', HomeNode);
  vi.stubGlobal('HTMLTextAreaElement', HomeNode);
  vi.stubGlobal('HTMLSelectElement', HomeNode);
  vi.stubGlobal('ProgressEvent', class extends Event {});
  vi.stubGlobal('navigator', { userAgent: '', storage: { persist: vi.fn(async () => false) } });
  vi.stubGlobal('window', { location: { search: '', href: 'http://127.0.0.1/', assign: vi.fn() } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function mountedHome() {
  let ui: NativeHomeUi | undefined;
  const root = new HomeNode();
  const openProject = vi.fn();
  await bootNativeGsApp(root as unknown as HTMLElement, {
    isCurrent: () => true, mount: (_, controls) => { ui = controls; }, openProject,
  });
  return { ui: ui!, openProject };
}

async function home() { return (await mountedHome()).ui; }

describe('composed Native home', () => {
  it('reserves intake exclusively and releases idempotently', async () => {
    const ui = await home();
    const release = ui.beginIntake()!;
    expect(ui.busy).toBe(true); expect(ui.beginIntake()).toBeNull();
    release(); release(); expect(ui.busy).toBe(false);
    const next = ui.beginIntake()!;
    release(); expect(ui.busy).toBe(true);
    next(); expect(ui.busy).toBe(false);
  });

  it('derives pending-export blocking from the result, so every cleanup re-enables navigation', async () => {
    const ui = await home();
    const transfer = ui.transfer as unknown as HomeNode;
    const result = transfer.children.find((node) => node.className === 'ng-row' && node.children.length === 0)!;
    const link = new HomeNode('a'); result.append(link);
    expect(ui.busy).toBe(true); expect(ui.beginIntake()).toBeNull();
    result.removeChild(link);
    expect(ui.busy).toBe(false); ui.beginIntake()!();
  });

  it('does not expose a meaningless cancel action while the home is idle', async () => {
    const ui = await home();
    const transfer = ui.transfer as unknown as HomeNode;
    const cancel = search(transfer, (node) => node.tag === 'button' && node.nodes.some((text) => text.textContent === '処理を中止'))!;
    expect(cancel.disabled).toBe(true);
    expect(cancel.hidden).toBe(true);
  });

  it('shows the detected package purpose before restore and cancel remains zero-write', async () => {
    const ui = await home();
    const transfer = ui.transfer as unknown as HomeNode;
    ui.acceptPackageFile(new File(['not read by the mocked inspector'], 'misleading-name.lociview'));
    await vi.waitFor(() => {
      expect(search(transfer, (node) => node.nodes.some((text) => text.textContent === 'この端末に復元'))).toBeDefined();
    });
    expect(restoreNativePortablePackageV1).not.toHaveBeenCalled();
    const cancel = search(transfer, (node) => node.tag === 'button' && node.nodes.some((text) => text.textContent === 'キャンセル'))!;
    expect(cancel.disabled).toBe(false);
    cancel.click();
    expect(restoreNativePortablePackageV1).not.toHaveBeenCalled();
    expect(ui.busy).toBe(false);
  });

  it('revalidates the inspected package after confirmation and stops before restore if it changed', async () => {
    const ui = await home();
    const transfer = ui.transfer as unknown as HomeNode;
    ui.acceptPackageFile(new File(['stable file object'], 'backup.lociview'));
    await vi.waitFor(() => expect(inspectNativePortablePackageV1).toHaveBeenCalledTimes(1));
    vi.mocked(inspectNativePortablePackageV1).mockResolvedValueOnce({
      manifest: { nativeSnapshot: { byteLength: 2 }, changedAfterConfirmation: true },
      snapshot: {
        project: { id: 'prj_TEST', title: '確認用プロジェクト' },
        snapshotId: 'snp_TEST', generation: 1, assets: [], representations: [], captions: [], mediaResources: [],
      },
      representationByteLength: 0,
      mediaByteLength: 0,
    } as never);
    const confirm = search(transfer, (node) => node.tag === 'button' && node.nodes.some((text) => text.textContent === 'この端末に復元'))!;
    confirm.click();
    await vi.waitFor(() => expect(inspectNativePortablePackageV1).toHaveBeenCalledTimes(2));
    expect(restoreNativePortablePackageV1).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(search(transfer, (node) => node.textContent.includes('確認後にファイルの内容または目的が変わりました'))).toBeDefined();
    });
  });

  it('shows GS offline preparation only in an established GS context', async () => {
    const ui = await home();
    const creation = ui.creation as unknown as HomeNode;
    const offline = search(creation, (node) => node.className.includes('ng-gs-offline'))!;
    expect(offline.hidden).toBe(true);

    const gsPly = makeGsPlySource(2, 1);
    await ui.acceptModelFile(new File([gsPly.bytes.slice().buffer as ArrayBuffer], 'renamed-gs.bin'));
    expect(offline.hidden).toBe(false);
    const remove = search(creation, (node) => node.tag === 'button' && node.nodes.some((text) => text.textContent === '外す'))!;
    remove.click();
    expect(offline.hidden).toBe(true);

    vi.mocked(inspectNativePortablePackageV1).mockResolvedValueOnce({
      manifest: { nativeSnapshot: { byteLength: 2 } },
      snapshot: snapshotFromDraft(makeNativeDraft(2).draft),
      representationByteLength: 0,
      mediaByteLength: 0,
    } as never);
    ui.acceptPackageFile(new File(['synthetic package'], 'neutral-name.lociview'));
    await vi.waitFor(() => expect(search(ui.transfer as unknown as HomeNode, (node) => (
      node.className.includes('ng-gs-offline') && !node.hidden
    ))).toBeDefined());
  });

  it('ignores a retained but inactive GS Representation when deciding offline relevance', async () => {
    vi.mocked(inspectNativePortablePackageV1).mockResolvedValueOnce({
      manifest: { nativeSnapshot: { byteLength: 2 } },
      snapshot: {
        project: { id: 'prj_TEST', title: 'Meshへ差し替え済み' },
        snapshotId: 'snp_TEST', generation: 2, assets: [],
        assetBindingRevisions: [], assetRevisions: [],
        representations: [{ role: 'gsPrimary' }], captions: [], mediaResources: [],
      },
      representationByteLength: 0,
      mediaByteLength: 0,
    } as never);
    const ui = await home();
    ui.acceptPackageFile(new File(['synthetic package'], 'retained-gs.lociview'));
    await vi.waitFor(() => expect(inspectNativePortablePackageV1).toHaveBeenCalled());
    expect(search(ui.transfer as unknown as HomeNode, (node) => (
      node.className.includes('ng-gs-offline') && !node.hidden
    ))).toBeUndefined();
  });

  it('opens the exact existing collaboration Project in Edit without restoring a copy', async () => {
    vi.mocked(detectNativePackageContainerKindV1).mockResolvedValueOnce('exchange');
    vi.mocked(listNativeProjectsV1).mockResolvedValue([{
      projectId: 'prj_TEST', title: '共同編集対象', generation: 1, snapshotId: 'snp_TEST',
    }]);
    vi.mocked(inspectNativeExchangePackageV1).mockResolvedValueOnce({
      manifest: { purpose: 'collaboration', nativeSnapshot: { byteLength: 2 } },
      snapshot: {
        project: { id: 'prj_TEST', title: '共同編集対象' },
        snapshotId: 'snp_TEST', generation: 1, assets: [], representations: [], captions: [], mediaResources: [],
      },
      representationByteLength: 0,
      mediaByteLength: 0,
    } as never);
    const { ui, openProject } = await mountedHome();
    const transfer = ui.transfer as unknown as HomeNode;
    ui.acceptPackageFile(new File(['synthetic exchange'], 'misleading-backup-name.lociview'));
    await vi.waitFor(() => expect(search(transfer, (node) => node.nodes.some((text) => (
      text.textContent === '対象プロジェクトを編集して開く'
    )))).toBeDefined());
    const confirm = search(transfer, (node) => node.tag === 'button' && node.nodes.some((text) => (
      text.textContent === '対象プロジェクトを編集して開く'
    )))!;
    confirm.click();
    expect(openProject).toHaveBeenCalledWith('prj_TEST', 'edit');
    expect(restoreNativeExchangePackageV1).not.toHaveBeenCalled();
  });

  it('offers one multi-file model entry and reveals GS-only controls after automatic classification', async () => {
    const ui = await home();
    const creation = ui.creation as unknown as HomeNode;
    expect(creation.hidden).toBe(true);
    expect(search(creation, (node) => node.nodes.some((text) => (
      text.textContent === 'モデルから新しく作る'
    )))).toBeUndefined();
    const modelInputs = collect(creation, (node) => node.attrs.get('aria-label') === '追加するモデルファイル');
    expect(modelInputs).toHaveLength(1);
    expect(modelInputs[0]!.attrs.get('multiple')).toBe('true');
    expect(modelInputs[0]!.attrs.get('accept')).toContain('application/octet-stream');
    expect(search(creation, (node) => node.nodes.some((text) => text.textContent === '別の3Dモデルを追加'))).toBeDefined();
    expect(search(creation, (node) => node.nodes.some((text) => (
      text.textContent === '通常点群とGaussian Splattingにも対応しています。'
    )))).toBeUndefined();
    expect(search(creation, (node) => node.nodes.some((text) => text.textContent.includes('内容から判定')))).toBeUndefined();
    expect(search(creation, (node) => node.attrs.get('aria-label') === '開いたモデルファイルの種類')).toBeUndefined();
    const proxy = search(creation, (node) => node.attrs.get('aria-label') === 'GSのキャプション配置用補助モデル')!;
    expect(proxy.parent!.hidden).toBe(true);

    const gsPly = makeGsPlySource(2, 1);
    modelInputs[0]!.files = [
      new File([gsPly.bytes.slice().buffer as ArrayBuffer], 'first.bin'),
      new File([triangleObj], 'second.bin'),
    ];
    modelInputs[0]!.dispatchEvent(new Event('change'));
    const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
    await vi.waitFor(() => expect(summary.hidden).toBe(false));
    expect(creation.hidden).toBe(false);
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === 'Gaussian Splatting（PLY）'))).toBeDefined();
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === '3Dモデル（OBJ）'))).toBeDefined();
    expect(proxy.parent!.hidden).toBe(false);
    expect(search(proxy.parent!, (node) => node.nodes.some((text) => text.textContent === 'GSの表示だけなら不要です。表面にピンを置く場合は必要です。'))).toBeDefined();
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === 'プロジェクトを作成するまで保存されません。元ファイルは変更されません。'))).toBeDefined();
    expect(search(creation, (node) => node.nodes.some((text) => text.textContent.includes('内容から')))).toBeUndefined();
    proxy.files = [new File([triangleObj], 'proxy.bin')];
    proxy.value = 'proxy.bin';
    const removeGs = search(summary, (node) => node.attrs.get('aria-label') === 'Gaussian Splatting（PLY）を選択から外す')!;
    removeGs.click();
    expect(proxy.parent!.hidden).toBe(true);
    expect(proxy.files).toBeNull();
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === '3Dモデル（OBJ）'))).toBeDefined();
  });

  it('rejects duplicate automatically detected roles without selecting a winner', async () => {
    const ui = await home();
    const creation = ui.creation as unknown as HomeNode;
    const modelInput = search(creation, (node) => node.attrs.get('aria-label') === '追加するモデルファイル')!;
    modelInput.files = [
      new File([triangleObj], 'first.bin'),
      new File([triangleStl], 'second.bin'),
    ];
    modelInput.dispatchEvent(new Event('change'));
    const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
    await vi.waitFor(() => {
      expect(search(creation, (node) => node.textContent === '3Dモデルを追加できませんでした。選択内容は変更されていません。')).toBeDefined();
    });
    expect(summary.hidden).toBe(true);
    expect(search(summary, (node) => node.textContent === '3Dモデル（OBJ）')).toBeUndefined();
    expect(search(summary, (node) => node.textContent === '3Dモデル（STL）')).toBeUndefined();
  });

  it('keeps a Point and GS selection together when they are selected in reverse role order', async () => {
    const ui = await home();
    const creation = ui.creation as unknown as HomeNode;
    const modelInput = search(creation, (node) => node.attrs.get('aria-label') === '追加するモデルファイル')!;
    const point = makePointPlySource(3);
    const gs = makeGsPlySource(2, 1);
    modelInput.files = [
      new File([gs.bytes.slice().buffer as ArrayBuffer], 'first.bin'),
      new File([point.bytes.slice().buffer as ArrayBuffer], 'second.bin'),
    ];
    modelInput.dispatchEvent(new Event('change'));
    const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
    await vi.waitFor(() => expect(summary.hidden).toBe(false));
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === '通常点群（PLY）'))).toBeDefined();
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === 'Gaussian Splatting（PLY）'))).toBeDefined();
  });

  it('keeps an existing selection unchanged when a later batch contains a valid role and a duplicate role', async () => {
    const ui = await home();
    const firstGs = makeGsPlySource(2, 1);
    await ui.acceptModelFile(new File([firstGs.bytes.slice().buffer as ArrayBuffer], 'existing.bin'));
    const creation = ui.creation as unknown as HomeNode;
    const modelInput = search(creation, (node) => node.attrs.get('aria-label') === '追加するモデルファイル')!;
    const point = makePointPlySource(3);
    const duplicateGs = makeGsPlySource(3, 2);
    modelInput.files = [
      new File([point.bytes.slice().buffer as ArrayBuffer], 'new-point.bin'),
      new File([duplicateGs.bytes.slice().buffer as ArrayBuffer], 'duplicate-gs.bin'),
    ];
    modelInput.dispatchEvent(new Event('change'));
    const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
    await vi.waitFor(() => expect(search(creation, (node) => node.textContent === '3Dモデルを追加できませんでした。選択内容は変更されていません。')).toBeDefined());
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === 'Gaussian Splatting（PLY）'))).toBeDefined();
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === '通常点群（PLY）'))).toBeUndefined();
  });

  it('adds a Point and GS one at a time through the same entry', async () => {
    const ui = await home();
    const point = makePointPlySource(3);
    const gs = makeGsPlySource(2, 1);
    await ui.acceptModelFile(new File([point.bytes.slice().buffer as ArrayBuffer], 'point.bin'));
    await ui.acceptModelFile(new File([gs.bytes.slice().buffer as ArrayBuffer], 'gs.bin'));
    const creation = ui.creation as unknown as HomeNode;
    const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === '通常点群（PLY）'))).toBeDefined();
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === 'Gaussian Splatting（PLY）'))).toBeDefined();
    const heading = search(creation, (node) => node.tag === 'h2' && node.nodes.some((text) => (
      text.textContent === '新しいプロジェクト'
    )))!;
    const removeGs = search(summary, (node) => node.attrs.get('aria-label') === 'Gaussian Splatting（PLY）を選択から外す')!;
    removeGs.click();
    expect(heading.focusCount).toBe(2);
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === '通常点群（PLY）'))).toBeDefined();
  });

  it('locks model choices and the GS proxy while Project creation is inspecting files', async () => {
    const ui = await home();
    const gs = makeGsPlySource(2, 1);
    const source = new File([gs.bytes.slice().buffer as ArrayBuffer], 'source.bin');
    await ui.acceptModelFile(source);
    const creation = ui.creation as unknown as HomeNode;
    const modelInput = search(creation, (node) => node.attrs.get('aria-label') === '追加するモデルファイル')!;
    const chooseModels = search(creation, (node) => node.tag === 'button' && node.textContent === '別の3Dモデルを追加')!;
    const proxy = search(creation, (node) => node.attrs.get('aria-label') === 'GSのキャプション配置用補助モデル')!;
    const create = search(creation, (node) => node.tag === 'button' && node.nodes.some((text) => text.textContent === '作成して編集'))!;
    const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
    const remove = search(summary, (node) => node.attrs.get('aria-label') === 'Gaussian Splatting（PLY）を選択から外す')!;
    let releaseInspection!: (bytes: ArrayBuffer) => void;
    const blockedInspection = new Promise<ArrayBuffer>((resolve) => { releaseInspection = resolve; });
    vi.spyOn(source, 'slice').mockReturnValue({ arrayBuffer: () => blockedInspection } as Blob);

    create.click();
    expect(create.disabled).toBe(true);
    expect(chooseModels.disabled).toBe(true);
    expect(modelInput.disabled).toBe(true);
    expect(proxy.disabled).toBe(true);
    expect(remove.disabled).toBe(true);
    remove.click();
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === 'Gaussian Splatting（PLY）'))).toBeDefined();

    releaseInspection(gs.bytes.slice().buffer as ArrayBuffer);
    await vi.waitFor(() => expect(create.disabled).toBe(false));
  });

  it.each([
    ['GLB', triangleGlb(), '3Dモデル（GLB）'],
    ['glTF', triangleGltf, '3Dモデル（glTF）'],
    ['OBJ', triangleObj, '3Dモデル（OBJ）'],
    ['STL', triangleStl, '3Dモデル（STL）'],
  ] as const)('validates renamed %s content without asking the user to choose its role', async (_format, bytes, detected) => {
    const ui = await home();
    const source = typeof bytes === 'string' ? bytes : Uint8Array.from(bytes).buffer;
    await ui.acceptModelFile(new File([source], 'renamed-model.bin'));
    const creation = ui.creation as unknown as HomeNode;
    expect(creation.hidden).toBe(false);
    const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
    expect(summary.hidden).toBe(false);
    expect(search(summary, (node) => node.nodes.some((text) => text.textContent === detected))).toBeDefined();
    const modelInput = search(creation, (node) => node.attrs.get('aria-label') === '追加するモデルファイル')!;
    expect(modelInput.attrs.get('multiple')).toBe('true');
    expect(search(creation, (node) => node.attrs.get('aria-label') === '開いたモデルファイルの種類')).toBeUndefined();
    const proxy = search(creation, (node) => node.attrs.get('aria-label') === 'GSのキャプション配置用補助モデル')!;
    expect(proxy.parent!.hidden).toBe(true);
    const remove = search(summary, (node) => node.tag === 'button' && node.nodes.some((text) => text.textContent === '外す'))!;
    remove.click(); expect(summary.hidden).toBe(true); expect(creation.hidden).toBe(true);
  });

  it('reveals model creation only after inspection and cancel returns to idle', async () => {
    const ui = await home();
    const states: boolean[] = [];
    const stop = ui.onCreationPendingChange((pending) => states.push(pending));
    const creation = ui.creation as unknown as HomeNode;
    expect(states).toEqual([false]);
    expect(creation.hidden).toBe(true);
    const status = search(creation, (node) => node.className === 'ng-status')!;
    expect(status.attrs.get('role')).toBe('status');
    expect(status.attrs.get('aria-live')).toBe('polite');

    await ui.acceptModelFile(new File([triangleObj], 'model.bin'));
    expect(states).toEqual([false, true]);
    expect(creation.hidden).toBe(false);
    expect(creation.tag).toBe('section');
    const heading = search(creation, (node) => node.tag === 'h2' && node.nodes.some((text) => (
      text.textContent === '新しいプロジェクト'
    )))!;
    const create = search(creation, (node) => node.tag === 'button' && node.nodes.some((text) => (
      text.textContent === '作成して編集'
    )))!;
    expect(create.disabled).toBe(false);
    expect(heading.focusCount).toBe(1);
    expect(create.focusCount).toBe(0);
    const cancel = search(creation, (node) => node.tag === 'button' && node.nodes.some((text) => (
      text.textContent === 'キャンセル'
    )))!;
    cancel.click();
    expect(states).toEqual([false, true, false]);
    expect(creation.hidden).toBe(true);
    stop();
  });

  it.each(['glb', 'gltf', 'obj', 'stl'] as const)(
    'rejects invalid bytes carrying only a .%s extension before Project creation',
    async (extension) => {
      const ui = await home();
      await expect(ui.acceptModelFile(new File(['not a model'], `misleading.${extension}`))).rejects.toThrow();
      const creation = ui.creation as unknown as HomeNode;
      const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
      expect(summary.hidden).toBe(true);
      expect(creation.hidden).toBe(true);
      expect(search(creation, (node) => node.attrs.get('aria-label') === '開いたモデルファイルの種類')).toBeUndefined();
    },
  );

  it.each([
    ['point-only OBJ', ['v 0 0 0', 'v 1 0 0', 'p 1 2', ''].join('\n')],
    ['point-only glTF', gltfWithPrimitiveModes([0])],
    ['mixed Mesh/Point glTF', gltfWithPrimitiveModes([4, 0])],
    ['mixed Mesh/Line OBJ', [
      'v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3', 'l 1 2', '',
    ].join('\n')],
    ['mixed Mesh/Line glTF', gltfWithPrimitiveModes([4, 1])],
  ] as const)('rejects %s rather than storing it as a Mesh', async (_label, bytes) => {
    const ui = await home();
    await expect(ui.acceptModelFile(new File([bytes], 'renamed-model.bin'))).rejects.toThrow();
    const creation = ui.creation as unknown as HomeNode;
    const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
    expect(summary.hidden).toBe(true);
    expect(search(creation, (node) => node.attrs.get('aria-label') === '開いたモデルファイルの種類')).toBeUndefined();
  });

  it('rejects a PLY that matches no supported role instead of guessing one', async () => {
    const ui = await home();
    const unsupported = new TextEncoder().encode([
      'ply', 'format ascii 1.0', 'element vertex 1',
      'property float x', 'property float y', 'property float z',
      'end_header', '0 0 0', '',
    ].join('\n'));
    await expect(ui.acceptModelFile(new File([unsupported], 'ambiguous.ply'))).rejects.toThrow();
    const creation = ui.creation as unknown as HomeNode;
    const summary = search(creation, (node) => node.attrs.get('aria-label') === '3Dモデル')!;
    expect(summary.hidden).toBe(true);
    expect(search(creation, (node) => node.attrs.get('aria-label') === '開いたモデルファイルの種類')).toBeUndefined();
  });

  it.each([false, true])('does not let a superseded asynchronous boot clear the current root (available=%s)', async (available) => {
    let resolve!: (value: boolean) => void;
    vi.mocked(OpfsFS.isAvailable).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const root = new HomeNode(); let current = true;
    const mount = vi.fn();
    const boot = bootNativeGsApp(root as unknown as HTMLElement, { isCurrent: () => current, mount, openProject: vi.fn() });
    current = false;
    const latest = new HomeNode(); root.nodes = []; root.append(latest);
    resolve(available); await boot;
    expect(root.firstChild).toBe(latest); expect(mount).not.toHaveBeenCalled();
  });
});
