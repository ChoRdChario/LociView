import * as THREE from 'three';
import { detectFormat, type ModelFormat } from '../viewer/loaders';
import { clear, el, fmtBytes } from '../ui/dom';
import { OpfsFS } from '../platform/opfs';
import type { WorkspaceFS } from '../platform/fs';
import { ProjectMutationCoordinator, type ProjectMutationSession } from '../platform/projectLock';
import { registerPwa } from '../platform/pwa';
import { inspectNativeGsPlyV1 } from './plyProfile';
import { isNativeGsOfflineReady, prepareNativeGsOffline } from './offline';
import {
  NATIVE_GS_PROFILE_ID,
  NATIVE_IDENTITY_TRANSFORM,
  nativeModelProfileId,
  newNativeId,
  normalizeNativeSim3,
  type NativeAssetBindingRevisionV1,
  type NativeDisplayMode,
  type NativeProjectDraftV1,
  type NativeProjectSnapshotV1,
  type NativeRepresentationDraftV1,
  type NativeSim3V1,
} from './schema';
import {
  assertNativeProjectDoesNotMixV1,
  createNativeProjectV1,
  listNativeProjectsV1,
  nativeProjectRoot,
  openNativeProjectV1,
  readNativeRepresentationV1,
  saveNativeProjectV1,
  type NativeBinarySource,
} from './storage';
import { NativeGsViewer } from './viewer';
import './style.css';

interface SelectedFiles {
  readonly mesh: File | null;
  readonly gs: File | null;
  readonly proxy: File | null;
}

interface DraftResult {
  readonly draft: NativeProjectDraftV1;
  readonly sources: ReadonlyMap<string, NativeBinarySource>;
}

function fileSource(file: File, mediaType: string): NativeBinarySource {
  return { size: file.size, mediaType, stream: () => file.stream() };
}

function modelMediaType(format: ModelFormat): string {
  switch (format) {
    case 'glb': return 'model/gltf-binary';
    case 'gltf': return 'model/gltf+json';
    case 'obj': return 'text/plain';
    case 'stl': return 'model/stl';
    case 'ply': return 'application/octet-stream';
  }
}

async function inspectModelFile(file: File, label: string): Promise<ModelFormat> {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 64 * 1024)).arrayBuffer());
  const format = detectFormat(file.name, head);
  if (format === null) throw new Error(`${label}はGLB/GLTF/OBJ/STL/通常PLYのいずれでもありません。`);
  if (format === 'ply') {
    const inspection = await inspectNativeGsPlyV1(file);
    if (inspection.kind === 'supported-gs') throw new Error(`${label}にGS PLYが選ばれています。GS欄へ指定してください。`);
  }
  return format;
}

function labelFromFile(file: File, fallback: string): string {
  const withoutExtension = file.name.replace(/\.[^.]+$/, '').trim();
  return withoutExtension === '' ? fallback : withoutExtension.slice(0, 160);
}

async function buildDraft(title: string, files: SelectedFiles): Promise<DraftResult> {
  if (files.mesh === null && files.gs === null) throw new Error('通常MeshまたはGSを少なくとも一つ選択してください。');
  if (files.proxy !== null && files.gs === null) throw new Error('Interaction Proxyは対象GSと一緒に指定してください。');
  const projectId = newNativeId('prj');
  const projectFrameId = newNativeId('frm');
  const assets: NativeProjectDraftV1['assets'][number][] = [];
  const bindings: NativeAssetBindingRevisionV1[] = [];
  const revisions: NativeProjectDraftV1['assetRevisions'][number][] = [];
  const representations: NativeRepresentationDraftV1[] = [];
  const sources = new Map<string, NativeBinarySource>();
  let meshAssetId: string | null = null;
  let gsAssetId: string | null = null;

  if (files.mesh !== null) {
    const format = await inspectModelFile(files.mesh, '通常Mesh');
    meshAssetId = newNativeId('ast');
    const assetFrameId = newNativeId('frm');
    const revisionId = newNativeId('rev');
    const bindingId = newNativeId('bnd');
    const representationId = newNativeId('rep');
    const familyId = newNativeId('fam');
    assets.push({ id: meshAssetId, label: labelFromFile(files.mesh, 'ordinary Mesh'), assetFrameId, status: { kind: 'ready', activeBindingId: bindingId } });
    bindings.push({ id: bindingId, assetId: meshAssetId, assetRevisionId: revisionId, assetToProject: { translation: [-1.5, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 }, method: 'import' });
    revisions.push({
      id: revisionId,
      assetId: meshAssetId,
      representationIds: [representationId],
      anchorCompatibilityClasses: [{ id: newNativeId('cls'), targetVariantFamilyIds: [familyId] }],
    });
    representations.push({
      id: representationId,
      assetId: meshAssetId,
      representationFrameId: newNativeId('frm'),
      contentKind: 'mesh',
      purposes: ['source', 'display'],
      role: 'meshPrimary',
      variantFamilyId: familyId,
      formatProfile: { id: nativeModelProfileId(format) },
      representationToAsset: NATIVE_IDENTITY_TRANSFORM,
      derivedFrom: [],
      mediaType: modelMediaType(format),
    });
    sources.set(representationId, fileSource(files.mesh, modelMediaType(format)));
  }

  if (files.gs !== null) {
    const inspection = await inspectNativeGsPlyV1(files.gs);
    if (inspection.kind !== 'supported-gs') throw new Error('GS欄には対応Graphdeco binary little-endian SH2/SH3 PLYを選択してください。');
    gsAssetId = newNativeId('ast');
    const assetFrameId = newNativeId('frm');
    const revisionId = newNativeId('rev');
    const bindingId = newNativeId('bnd');
    const gsRepresentationId = newNativeId('rep');
    const gsFamilyId = newNativeId('fam');
    const representationIds = [gsRepresentationId];
    assets.push({ id: gsAssetId, label: labelFromFile(files.gs, 'partial GS'), assetFrameId, status: { kind: 'ready', activeBindingId: bindingId } });
    bindings.push({ id: bindingId, assetId: gsAssetId, assetRevisionId: revisionId, assetToProject: { translation: [1.5, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 }, method: 'import' });
    representations.push({
      id: gsRepresentationId,
      assetId: gsAssetId,
      representationFrameId: newNativeId('frm'),
      contentKind: 'gaussianSplat',
      purposes: ['source', 'display'],
      role: 'gsPrimary',
      variantFamilyId: gsFamilyId,
      formatProfile: { id: NATIVE_GS_PROFILE_ID },
      representationToAsset: NATIVE_IDENTITY_TRANSFORM,
      derivedFrom: [],
      gsPly: inspection.facts,
      mediaType: 'application/octet-stream',
    });
    sources.set(gsRepresentationId, fileSource(files.gs, 'application/octet-stream'));
    if (files.proxy !== null) {
      const proxyFormat = await inspectModelFile(files.proxy, 'Interaction Proxy');
      const proxyRepresentationId = newNativeId('rep');
      representationIds.push(proxyRepresentationId);
      representations.push({
        id: proxyRepresentationId,
        assetId: gsAssetId,
        representationFrameId: newNativeId('frm'),
        contentKind: 'mesh',
        purposes: ['interaction'],
        role: 'interactionProxy',
        variantFamilyId: newNativeId('fam'),
        formatProfile: { id: nativeModelProfileId(proxyFormat) },
        representationToAsset: NATIVE_IDENTITY_TRANSFORM,
        derivedFrom: [gsRepresentationId],
        proxyForGsVariantFamilyId: gsFamilyId,
        mediaType: modelMediaType(proxyFormat),
      });
      sources.set(proxyRepresentationId, fileSource(files.proxy, modelMediaType(proxyFormat)));
    }
    revisions.push({
      id: revisionId,
      assetId: gsAssetId,
      representationIds,
      anchorCompatibilityClasses: [{ id: newNativeId('cls'), targetVariantFamilyIds: [gsFamilyId] }],
    });
  }

  const displayMode: NativeDisplayMode = meshAssetId !== null && gsAssetId !== null ? 'mixed' : gsAssetId !== null ? 'gs-only' : 'mesh-only';
  return {
    draft: {
      project: {
        id: projectId,
        title: title.trim() === '' ? 'Native GS project' : title.trim().slice(0, 160),
        frame: { id: projectFrameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } },
      },
      assets,
      assetBindingRevisions: bindings,
      assetRevisions: revisions,
      representations,
      presentation: { displayMode, captionTargetAssetId: gsAssetId ?? meshAssetId },
      captions: [],
    },
    sources,
  };
}

function selectedFile(input: HTMLInputElement): File | null {
  return input.files?.[0] ?? null;
}

function setButtonDisabled(button: HTMLButtonElement, disabled: boolean): void {
  button.disabled = disabled;
}

export async function bootNativeGsApp(root: HTMLElement): Promise<void> {
  clear(root);
  root.className = 'ng-app';
  root.append(el('main', { class: 'ng-home' }, el('p', {}, 'Native project storageを初期化しています…')));
  if (!(await OpfsFS.isAvailable())) {
    clear(root);
    root.append(el('main', { class: 'ng-home' }, el('p', { class: 'ng-error' }, 'このブラウザではNative projectに必要なOPFSを利用できません。')));
    return;
  }
  const fs: WorkspaceFS = await OpfsFS.open();
  try {
    await navigator.storage.persist?.();
  } catch {
    // Best effort. Publication still remains marker-last and fail closed.
  }
  const coordinator = ProjectMutationCoordinator.browser(navigator.locks ?? null);
  const pwaRegistration = registerPwa({ onUpdate: () => undefined });
  let activeViewer: NativeGsViewer | null = null;
  let activeSession: ProjectMutationSession | null = null;
  let unsubscribeAccess: (() => void) | null = null;
  let transitionInFlight = false;

  const closeActive = (): void => {
    unsubscribeAccess?.();
    unsubscribeAccess = null;
    activeViewer?.dispose();
    activeViewer = null;
    activeSession?.release();
    activeSession = null;
  };

  const renderHome = async (): Promise<void> => {
    closeActive();
    clear(root);
    const status = el('p', { class: 'ng-note' }, 'offline状態を確認しています…');
    const prepare = el('button', { class: 'primary' }, 'GS offline準備');
    const title = el('input', { type: 'text', value: 'Native GS project', maxlength: '160' });
    const mesh = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const gs = el('input', { type: 'file', accept: '.ply,application/octet-stream' });
    const proxy = el('input', { type: 'file', accept: '.glb,.gltf,.obj,.stl,.ply' });
    const createStatus = el('p', { class: 'ng-status' });
    const create = el('button', { class: 'primary' }, 'Native projectを作成');
    const projectList = el('div', { class: 'ng-list' });

    const refreshOffline = async (): Promise<void> => {
      const ready = await isNativeGsOfflineReady(await pwaRegistration);
      status.className = ready ? 'ng-note ng-ok' : 'ng-note ng-warn';
      status.textContent = ready
        ? 'Spark 2.1.0 runtime: offline-ready'
        : import.meta.env.DEV
          ? '開発server: runtime確認は可能ですがoffline-ready証拠にはなりません。'
          : 'Spark runtimeはまだoffline-readyではありません。GSをofflineで開く前に準備してください。';
    };
    prepare.addEventListener('click', () => {
      setButtonDisabled(prepare, true);
      status.textContent = 'Spark runtimeを初期化しoffline cacheを検証しています…';
      void pwaRegistration.then((registration) => prepareNativeGsOffline(registration)).then((result) => {
        status.textContent = result.detail;
        status.className = result.offlineReady ? 'ng-note ng-ok' : 'ng-note ng-warn';
      }).catch((error: unknown) => {
        status.textContent = error instanceof Error ? error.message : String(error);
        status.className = 'ng-error';
      }).finally(() => setButtonDisabled(prepare, false));
    });

    create.addEventListener('click', () => {
      if (transitionInFlight) return;
      transitionInFlight = true;
      setButtonDisabled(create, true);
      createStatus.className = 'ng-status';
      createStatus.textContent = '入力を検査しています…';
      void (async () => {
        const built = await buildDraft(title.value, {
          mesh: selectedFile(mesh),
          gs: selectedFile(gs),
          proxy: selectedFile(proxy),
        });
        const required = [...built.sources.values()].reduce((sum, source) => sum + source.size, 0);
        const estimate = await navigator.storage.estimate?.();
        if (
          estimate?.quota !== undefined && estimate.usage !== undefined &&
          Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
          estimate.quota - estimate.usage < required
        ) {
          throw new Error(`保存可能容量が不足しています（必要 ${fmtBytes(required)}）。不完全projectはactiveにしません。`);
        }
        await assertNativeProjectDoesNotMixV1(fs, built.draft.project.id);
        const session = await coordinator.tryAcquire(fs, nativeProjectRoot(built.draft.project.id), built.draft.project.id);
        if (!session.holdsWriteLock) throw new Error(session.accessDetail);
        session.activateNewProject();
        try {
          const snapshot = await createNativeProjectV1(session.workspace, built.draft, built.sources, (message) => {
            createStatus.textContent = message;
          });
          activeSession = session;
          await renderProject(snapshot, session);
        } catch (error) {
          if (activeSession === session) closeActive();
          else session.release();
          throw error;
        }
      })().catch((error: unknown) => {
        createStatus.className = 'ng-error';
        createStatus.textContent = error instanceof Error ? error.message : String(error);
      }).finally(() => {
        transitionInFlight = false;
        setButtonDisabled(create, false);
      });
    });

    const summaries = await listNativeProjectsV1(fs);
    if (summaries.length === 0) projectList.append(el('p', { class: 'ng-note' }, 'activeなNative projectはまだありません。'));
    for (const summary of summaries) {
      const view = el('button', {}, 'View mode');
      const edit = el('button', { class: 'primary' }, 'Edit mode');
      view.addEventListener('click', () => void openProject(summary.projectId, 'view'));
      edit.addEventListener('click', () => void openProject(summary.projectId, 'edit'));
      projectList.append(el('div', { class: 'ng-project-row' },
        el('strong', {}, summary.title),
        el('span', { class: 'ng-note' }, `snapshot ${summary.generation}`),
        view,
        edit,
      ));
    }

    root.append(el('main', { class: 'ng-home' },
      el('header', { class: 'ng-head' },
        el('div', {}, el('h1', {}, 'LociView Native GS'), el('p', { class: 'ng-note' }, 'First production GS path — G0/G0-S/G1・releaseは未完了')),
        el('a', { href: import.meta.env.BASE_URL }, '通常v1へ戻る'),
      ),
      el('section', { class: 'ng-card' }, el('h2', {}, 'GS offline準備'), status, prepare),
      el('section', { class: 'ng-card' },
        el('h2', {}, 'Native projectを作成'),
        el('p', { class: 'ng-note' }, '通常MeshとGSは独立Assetです。ProxyはGS Asset内の非表示interaction representationです。Mesh-only／GS-onlyも作成できます。'),
        el('label', { class: 'ng-field' }, el('span', {}, 'Project名'), title),
        el('div', { class: 'ng-grid' },
          el('label', { class: 'ng-field' }, el('span', {}, '通常Mesh（任意）'), mesh),
          el('label', { class: 'ng-field' }, el('span', {}, 'Graphdeco GS PLY SH2/SH3（任意）'), gs),
          el('label', { class: 'ng-field' }, el('span', {}, 'GS専用Interaction Proxy（GS指定時のみ任意）'), proxy),
        ),
        create,
        createStatus,
      ),
      el('section', { class: 'ng-card' }, el('h2', {}, '保存済みNative projects'), projectList),
      el('p', { class: 'ng-note' }, '.lociview export/importと大容量backup streamingは後続workstreamです。'),
    ));
    await refreshOffline();
  };

  const openProject = async (projectId: string, mode: 'view' | 'edit'): Promise<void> => {
    if (transitionInFlight) return;
    transitionInFlight = true;
    closeActive();
    let openingSession: ProjectMutationSession | null = null;
    try {
      await assertNativeProjectDoesNotMixV1(fs, projectId);
      const session = mode === 'view'
        ? coordinator.openView(fs, nativeProjectRoot(projectId), projectId)
        : await coordinator.tryAcquire(fs, nativeProjectRoot(projectId), projectId);
      openingSession = session;
      const opened = await openNativeProjectV1(session.workspace, projectId);
      if (mode === 'edit' && session.holdsWriteLock) session.activateAfterDurableReload();
      activeSession = session;
      await renderProject(opened.snapshot, session);
    } catch (error) {
      if (activeSession === openingSession) closeActive();
      else openingSession?.release();
      clear(root);
      root.append(el('main', { class: 'ng-home' },
        el('p', { class: 'ng-error' }, error instanceof Error ? error.message : String(error)),
        el('button', { onclick: () => void renderHome() }, '一覧へ戻る'),
      ));
    } finally {
      transitionInFlight = false;
    }
  };

  const renderProject = async (initial: NativeProjectSnapshotV1, session: ProjectMutationSession): Promise<void> => {
    clear(root);
    let durable = initial;
    let working = initial;
    let saving = false;
    let dirty = false;
    const canvas = el('canvas', { 'aria-label': 'Native Mesh and Gaussian Splatting project' });
    const accessBadge = el('span', { class: 'ng-badge' });
    const modeBadge = el('span', { class: 'ng-badge' });
    const runtimeStatus = el('p', { class: 'ng-status' }, 'resourcesを読み込んでいます…');
    const diagnostics = el('ul', { class: 'ng-diagnostics' });
    const display = el('select');
    for (const [value, label] of [['mixed', 'Mesh + GS'], ['gs-only', 'GS only'], ['mesh-only', 'Mesh only']] as const) {
      display.append(el('option', { value }, label));
    }
    display.value = working.presentation.displayMode;
    const target = el('select');
    const arm = el('button', { class: 'primary' }, '1. Caption初期配置');
    const save = el('button', { class: 'primary' }, '2. Snapshot保存');
    const unload = el('button', {}, 'GSを解放');
    const close = el('button', {}, '閉じる');
    const transformAsset = el('select');
    const translationInputs = [0, 1, 2].map(() => el('input', { type: 'number', step: '0.01' }));
    const rotationInputs = [0, 1, 2].map(() => el('input', { type: 'number', step: '1' }));
    const scaleInput = el('input', { type: 'number', step: '0.01', min: '0.000001' });
    const applyTransformButton = el('button', {}, '位置・回転・scaleを適用');
    const captionTitle = el('input', { type: 'text', maxlength: '160' });
    const captionBody = el('textarea');

    for (const asset of working.assets) {
      const activeRevision = working.assetBindingRevisions.find((binding) => binding.id === asset.status.activeBindingId)?.assetRevisionId;
      const roles = working.assetRevisions.find((revision) => revision.id === activeRevision)?.representationIds
        .map((id) => working.representations.find((representation) => representation.id === id)?.role)
        .filter(Boolean) ?? [];
      const role = roles.includes('gsPrimary') ? 'GS' : 'Mesh';
      target.append(el('option', { value: asset.id }, `${asset.label} (${role})`));
      transformAsset.append(el('option', { value: asset.id }, `${asset.label} (${role})`));
    }
    target.value = working.presentation.captionTargetAssetId ?? '';

    const setDiagnostics = (messages: readonly string[]): void => {
      clear(diagnostics);
      for (const message of messages) diagnostics.append(el('li', {}, message));
    };
    const updateAccess = (): void => {
      accessBadge.textContent = session.sessionMode === 'view'
        ? 'View mode · read-only'
        : session.accessState === 'editable'
          ? 'Edit mode · write lock held'
          : `Edit mode · ${session.accessState}`;
      const editable = session.accessState === 'editable' && !saving;
      save.disabled = !editable || !dirty;
      applyTransformButton.disabled = !editable;
      arm.disabled = !editable;
      captionTitle.disabled = !editable;
      captionBody.disabled = !editable;
      display.disabled = saving;
      target.disabled = saving;
      close.disabled = saving;
      activeViewer?.setEditingEnabled(editable);
    };
    const markDirty = (): void => {
      dirty = true;
      updateAccess();
      runtimeStatus.textContent = '未保存のNative snapshot変更があります。';
    };
    const bindingFor = (assetId: string): NativeAssetBindingRevisionV1 | null => {
      const asset = working.assets.find((entry) => entry.id === assetId);
      return working.assetBindingRevisions.find((entry) => entry.id === asset?.status.activeBindingId) ?? null;
    };
    const populateTransform = (): void => {
      const binding = bindingFor(transformAsset.value);
      if (binding === null) return;
      binding.assetToProject.translation.forEach((value, index) => { translationInputs[index]!.value = String(value); });
      const q = new THREE.Quaternion().fromArray(binding.assetToProject.rotationXYZW);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      [euler.x, euler.y, euler.z].forEach((value, index) => { rotationInputs[index]!.value = String(THREE.MathUtils.radToDeg(value)); });
      scaleInput.value = String(binding.assetToProject.uniformScale);
    };

    root.append(el('main', { class: 'ng-view' },
      el('section', { class: 'ng-stage' }, canvas, el('div', { class: 'ng-stage-badges' }, accessBadge, modeBadge)),
      el('aside', { class: 'ng-panel' },
        el('div', {}, el('h1', {}, working.project.title), el('p', { class: 'ng-note' }, `Native snapshot v1 · generation ${working.generation}`)),
        el('section', { class: 'ng-card' },
          el('h2', {}, 'Display and Caption target'),
          el('div', { class: 'ng-grid' },
            el('label', { class: 'ng-field' }, el('span', {}, '表示'), display),
            el('label', { class: 'ng-field' }, el('span', {}, 'Caption対象Asset'), target),
          ),
          el('p', { class: 'ng-note' }, 'Meshは自身、GSは同じGS Asset内の明示Proxyだけへraycastします。GS非表示時はProxyもinteraction対象外です。'),
        ),
        el('section', { class: 'ng-card' },
          el('h2', {}, 'Two-stage Caption placement'),
          el('div', { class: 'ng-row' }, arm, save, unload),
          el('label', { class: 'ng-field' }, el('span', {}, 'Caption title'), captionTitle),
          el('label', { class: 'ng-field' }, el('span', {}, 'Caption body'), captionBody),
          el('p', { class: 'ng-note' }, 'Proxy/Mesh hit後にギズモで調整し、最終positionAssetだけを保存します。'),
        ),
        el('section', { class: 'ng-card' },
          el('h2', {}, 'Asset placement adjustment'),
          el('label', { class: 'ng-field' }, el('span', {}, 'Asset'), transformAsset),
          el('span', { class: 'ng-note' }, 'Translation X/Y/Z'), el('div', { class: 'ng-three' }, ...translationInputs),
          el('span', { class: 'ng-note' }, 'Rotation X/Y/Z (degrees)'), el('div', { class: 'ng-three' }, ...rotationInputs),
          el('label', { class: 'ng-field' }, el('span', {}, 'Uniform scale'), scaleInput),
          applyTransformButton,
          el('p', { class: 'ng-note' }, '元bytesは変更せず、Asset placementとして保存します。'),
        ),
        runtimeStatus,
        diagnostics,
        el('div', { class: 'ng-row' }, close, el('button', { onclick: () => location.reload() }, 'page reload')),
      ),
    ));

    const offlineReady = import.meta.env.DEV || await isNativeGsOfflineReady(await pwaRegistration);
    const viewer = new NativeGsViewer(canvas, working, {
      onCaptionChanged(caption) {
        const titleValue = captionTitle.value.trim();
        const next = { ...caption, title: titleValue === '' ? 'Caption' : titleValue, body: captionBody.value };
        working = { ...working, captions: [next] };
        captionTitle.value = next.title;
        captionBody.value = next.body;
        markDirty();
      },
      onIssuesChanged: setDiagnostics,
      onProgress(message) { runtimeStatus.textContent = message; },
      onRuntimeError(message) { setDiagnostics([...viewer.getResolution().issues, message]); },
    });
    activeViewer = viewer;
    unsubscribeAccess = session.subscribeAccess(() => updateAccess());
    await viewer.load(
      (representationId) => readNativeRepresentationV1(fs, working.project.id, representationId),
      offlineReady,
    );
    modeBadge.textContent = viewer.getResolution().effectiveDisplayMode;
    runtimeStatus.textContent = offlineReady
      ? 'Native resources ready. Camera、表示切替、Caption配置を確認できます。'
      : 'Spark offline準備がないためGSはactivateしていません。';
    captionTitle.value = working.captions[0]?.title ?? 'Caption';
    captionBody.value = working.captions[0]?.body ?? '';
    populateTransform();
    updateAccess();

    display.addEventListener('change', () => {
      working = { ...working, presentation: { ...working.presentation, displayMode: display.value as NativeDisplayMode } };
      viewer.setSnapshot(working);
      modeBadge.textContent = viewer.getResolution().effectiveDisplayMode;
      markDirty();
    });
    target.addEventListener('change', () => {
      working = { ...working, presentation: { ...working.presentation, captionTargetAssetId: target.value } };
      viewer.setSnapshot(working);
      markDirty();
    });
    arm.addEventListener('click', () => {
      runtimeStatus.textContent = viewer.armPlacement()
        ? '配置待機中：canvas上の選択対象をclick/tapしてください。'
        : '選択対象ではCaption配置を開始できません。';
    });
    unload.addEventListener('click', () => {
      viewer.disposeGs();
      modeBadge.textContent = viewer.getResolution().effectiveDisplayMode;
      runtimeStatus.textContent = 'GS runtime resourceを解放しました。再読込はprojectを閉じて開き直してください。';
    });
    transformAsset.addEventListener('change', populateTransform);
    applyTransformButton.addEventListener('click', () => {
      try {
        const assetId = transformAsset.value;
        const current = bindingFor(assetId);
        if (current === null) throw new Error('Asset bindingが見つかりません。');
        const euler = new THREE.Euler(
          THREE.MathUtils.degToRad(Number(rotationInputs[0]!.value)),
          THREE.MathUtils.degToRad(Number(rotationInputs[1]!.value)),
          THREE.MathUtils.degToRad(Number(rotationInputs[2]!.value)),
          'XYZ',
        );
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        const transform: NativeSim3V1 = normalizeNativeSim3({
          translation: translationInputs.map((input) => Number(input.value)) as [number, number, number],
          rotationXYZW: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
          uniformScale: Number(scaleInput.value),
        });
        const nextBinding: NativeAssetBindingRevisionV1 = { ...current, id: newNativeId('bnd'), assetToProject: transform, method: 'manual' };
        working = {
          ...working,
          assets: working.assets.map((asset) => asset.id === assetId ? { ...asset, status: { kind: 'ready', activeBindingId: nextBinding.id } } : asset),
          assetBindingRevisions: working.assetBindingRevisions.map((binding) => binding.id === current.id ? nextBinding : binding),
        };
        viewer.setSnapshot(working);
        markDirty();
      } catch (error) {
        runtimeStatus.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    captionTitle.addEventListener('input', () => {
      const caption = working.captions[0];
      if (caption === undefined) return;
      working = { ...working, captions: [{ ...caption, title: captionTitle.value.trim() || 'Caption' }] };
      markDirty();
    });
    captionBody.addEventListener('input', () => {
      const caption = working.captions[0];
      if (caption === undefined) return;
      working = { ...working, captions: [{ ...caption, body: captionBody.value }] };
      markDirty();
    });
    save.addEventListener('click', () => {
      if (saving || session.accessState !== 'editable') return;
      saving = true;
      updateAccess();
      runtimeStatus.textContent = 'Native snapshotを保存しています…';
      void saveNativeProjectV1(session.workspace, working).then((saved) => {
        durable = saved;
        working = saved;
        dirty = false;
        viewer.setSnapshot(saved);
        runtimeStatus.textContent = `保存済み：snapshot generation ${saved.generation}`;
      }).catch((error: unknown) => {
        working = durable;
        viewer.setSnapshot(durable);
        dirty = false;
        runtimeStatus.textContent = `保存失敗：${error instanceof Error ? error.message : String(error)}。最後のdurable snapshotを再表示しました。`;
      }).finally(() => {
        saving = false;
        updateAccess();
      });
    });
    close.addEventListener('click', () => void renderHome());
  };

  await renderHome();
}
