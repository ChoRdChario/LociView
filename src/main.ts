// Dev Harness — ViewerCore + データ層の結線検証用（製品UIではない）
// 製品UIは docs/05 のコンセンサス後に実装する。

import { exportProjectZip, inspectZip, mergeFromInspection } from './assets/package';
import { visibleEntities } from './core/reduce';
import { ProjectStore, type Identity } from './core/store';
import { MemoryFS } from './platform/fs';
import { detectFormat, loadModel } from './viewer/loaders';
import { ViewerCore } from './viewer/viewer';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const logEl = $('#log');

function log(msg: string): void {
  logEl.textContent = `${new Date().toLocaleTimeString()} ${msg}\n${logEl.textContent ?? ''}`.slice(0, 4000);
}

// ---- 初期化 --------------------------------------------------------------------

const identity: Identity = {
  userId: localStorage.getItem('lv-dev-userId') ?? `usr_DEV${Math.random().toString(36).slice(2, 8)}`,
  deviceId: localStorage.getItem('lv-dev-deviceId') ?? `dev_DEV${Math.random().toString(36).slice(2, 8)}`,
  displayName: 'Dev',
};
localStorage.setItem('lv-dev-userId', identity.userId);
localStorage.setItem('lv-dev-deviceId', identity.deviceId);

const fs = new MemoryFS();
const DIR = 'projects/dev';
const viewer = new ViewerCore();
viewer.init($('#gl'));

let store: ProjectStore;
let modelAssetId: string | null = null;

async function initStore(): Promise<void> {
  store = await ProjectStore.create(fs, DIR, 'Dev Harness', identity);
  store.subscribe(renderPins);
  log(`プロジェクト作成 ${store.manifest.projectId.slice(0, 16)}… actor=${store.actorId.slice(0, 8)}…`);
}
await initStore();

// ---- モデル読込 -----------------------------------------------------------------

async function openModel(name: string, bytes: Uint8Array): Promise<void> {
  const format = detectFormat(name, bytes);
  if (format === null) {
    log(`対応していない形式: ${name}`);
    return;
  }
  try {
    const model = await loadModel(format, bytes);
    viewer.setModel(model);
    modelAssetId = store.createEntity('asset', {
      kind: 'model',
      path: `models/${name}`,
      originalName: name,
      size: bytes.length,
    });
    await fs.writeBytes(`${DIR}/models/${name}`, bytes);
    const s = model.stats;
    $('#stats').textContent =
      `${name} [${format}] 頂点${s.vertices.toLocaleString()} 三角形${s.triangles.toLocaleString()} ` +
      `点${s.points.toLocaleString()} メッシュ${s.meshes} マテリアル${model.materials.length}` +
      (model.warnings.length > 0 ? `\n⚠ ${model.warnings.join(' / ')}` : '');
    log(`読込OK: ${name}（${format}）`);
  } catch (e) {
    log(`読込失敗: ${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

$('#file-model').addEventListener('change', async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (file === undefined) return;
  await openModel(file.name, new Uint8Array(await file.arrayBuffer()));
});

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-sample]')) {
  btn.addEventListener('click', async () => {
    const name = btn.dataset.sample!;
    const res = await fetch(`/samples/${name}`);
    if (!res.ok) {
      log(`サンプル取得失敗: ${name}`);
      return;
    }
    await openModel(name, new Uint8Array(await res.arrayBuffer()));
  });
}

// ---- ピン ⇄ キャプション ----------------------------------------------------------

viewer.onPick((hit) => {
  const color = $<HTMLInputElement>('#pin-color').value;
  const capId = store.createEntity('caption', {
    title: `ピン ${new Date().toLocaleTimeString()}`,
    body: '',
    color,
    tags: [],
    attachments: [],
    anchor: {
      modelAssetId,
      position: hit.position,
      ...(hit.normal !== null ? { normal: hit.normal } : {}),
    },
  });
  viewer.setPinSelected(capId);
  log(`ピン追加 ${capId.slice(0, 12)}… @ [${hit.position.map((v) => v.toFixed(3)).join(', ')}]`);
});

viewer.onPinSelect((id) => {
  renderPins();
  log(`ピン選択 ${id.slice(0, 12)}…`);
});

function renderPins(): void {
  const captions = visibleEntities(store.state, 'caption');
  // ビューアへ同期
  viewer.clearPins();
  const listEl = $('#pin-list');
  listEl.innerHTML = '';
  for (const c of captions) {
    const anchor = c.fields.anchor as { position?: [number, number, number] } | undefined;
    if (anchor?.position !== undefined) {
      viewer.addPin({
        id: c.id,
        position: anchor.position,
        color: typeof c.fields.color === 'string' ? c.fields.color : '#eab308',
      });
    }
    const row = document.createElement('div');
    row.textContent = `● ${String(c.fields.title ?? '(無題)')}`;
    row.style.color = typeof c.fields.color === 'string' ? c.fields.color : '#eab308';
    if (viewer.selectedPin === c.id) row.classList.add('sel');
    row.addEventListener('click', () => {
      viewer.setPinSelected(c.id);
      renderPins();
    });
    listEl.appendChild(row);
  }
  if (viewer.selectedPin !== null) viewer.setPinSelected(viewer.selectedPin);
}

$('#btn-pinmode').addEventListener('click', () => {
  viewer.pinMode = !viewer.pinMode;
  const btn = $('#btn-pinmode');
  btn.textContent = `ピン追加モード: ${viewer.pinMode ? 'ON' : 'OFF'}`;
  btn.classList.toggle('active', viewer.pinMode);
});

// ---- ZIP入出力 -----------------------------------------------------------------

$('#btn-export').addEventListener('click', async () => {
  const bytes = await exportProjectZip(fs, DIR, store);
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${store.manifest.name}.lociview`;
  a.click();
  URL.revokeObjectURL(a.href);
  log(`ZIP書き出し ${(bytes.length / 1024).toFixed(1)}KB（captions.csv同梱）`);
});

$('#btn-import').addEventListener('click', () => $('#file-import').click());
$('#file-import').addEventListener('change', async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (file === undefined) return;
  try {
    const insp = await inspectZip(new Uint8Array(await file.arrayBuffer()));
    if (insp.kind !== 'lociview') {
      log('LociViewプロジェクトではありません（インポートウィザードは未実装）');
      return;
    }
    if (insp.manifest!.projectId === store.manifest.projectId) {
      const report = await mergeFromInspection(fs, DIR, store, insp);
      log(
        `マージ完了: 新規${report.created.length} 更新${report.updated.length} ` +
          `削除${report.deleted.length} 復活${report.revived.length} 上書き${report.overwritten.length}`,
      );
    } else {
      log(`別プロジェクト（${insp.manifest!.name}）。開き直しはハーネス未対応`);
    }
  } catch (e) {
    log(`取込失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ---- 表示 ----------------------------------------------------------------------

$('#bg-color').addEventListener('input', (ev) => {
  viewer.setBackground((ev.target as HTMLInputElement).value);
});
$('#btn-fit').addEventListener('click', () => viewer.fitCamera());

log('Dev Harness 起動完了');

// 開発検証用にwindowへ公開（製品ビルドには含めない）
(window as unknown as Record<string, unknown>).__lv = { viewer, fs, getStore: () => store };
