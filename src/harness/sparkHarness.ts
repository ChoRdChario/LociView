// Disposable Spark/Three technical harness. This module is reachable only from
// the nondefault dev.html?mode=spark entry and is not a production renderer or
// persistence implementation.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import gsFixtureUrl from '../../fixtures/gs/profile-golden-sh3-v1.ply?url';

type DisplayMode = 'mixed' | 'gs-only' | 'mesh-only';
type CaptionTarget = 'mesh' | 'gs';
type Scenario =
  | 'healthy'
  | 'gs-failure'
  | 'proxy-failure'
  | 'binding-failure'
  | 'transform-failure'
  | 'both-failure';
type BootFault = Exclude<Scenario, 'healthy'>;
type ResourceState = 'pending' | 'ready' | 'failed';

type Vec3Tuple = [number, number, number];

interface ManualAssetAnchor {
  kind: 'asset';
  assetId: string;
  assetFrameId: string;
  positionAsset: Vec3Tuple;
  authoredAssetRevisionId: string;
  authoredAnchorCompatibilityId: string;
  hitEvidence: { method: 'manual' };
}

interface HarnessSnapshot {
  ready: boolean;
  sparkVersion: '2.1.0';
  displayMode: DisplayMode;
  target: CaptionTarget;
  scenario: Scenario;
  placementArmed: boolean;
  visible: { mesh: boolean; gs: boolean; proxyRendered: false };
  interaction: { enabled: boolean; surfaceRepresentationId: string | null; reason: string | null };
  gs: {
    initialized: boolean;
    splatCount: number;
    finiteBounds: boolean;
    candidateFormatOnly: true;
  };
  resources: {
    mesh: ResourceState;
    gs: ResourceState;
    proxy: ResourceState;
    bootFault: BootFault | null;
    issues: string[];
  };
  currentAnchor: ManualAssetAnchor | null;
  savedAnchor: ManualAssetAnchor | null;
  restoredFromStorage: boolean;
  lastHit: {
    surfaceRepresentationId: string;
    pointWorld: Vec3Tuple;
    positionAsset: Vec3Tuple;
    roundTripError: number;
  } | null;
  frameCount: number;
  runtimeErrorCount: number;
  diagnostics: string[];
}

interface HarnessApi {
  getSnapshot(): HarnessSnapshot;
  setDisplayMode(mode: DisplayMode): void;
  setTarget(target: CaptionTarget): void;
  setScenario(scenario: Scenario): void;
  armPlacement(): boolean;
  saveCaption(): boolean;
  clearSavedCaption(): void;
  suggestedClick(target?: CaptionTarget): { clientX: number; clientY: number } | null;
  markerClientPosition(): { clientX: number; clientY: number } | null;
  gizmoClientCandidates(axis?: 'X' | 'Y' | 'Z'): Array<{
    clientX: number;
    clientY: number;
    objectType: string;
    materialVisible: boolean | null;
  }>;
  setOrbitEnabled(enabled: boolean): void;
}

function readBootFault(): BootFault | null {
  const value = new URLSearchParams(globalThis.location.search).get('fault');
  switch (value) {
    case 'gs-failure':
    case 'proxy-failure':
    case 'binding-failure':
    case 'transform-failure':
    case 'both-failure':
      return value;
    default:
      return null;
  }
}

const IDS = {
  meshAsset: 'asset-harness-independent-mesh',
  meshFrame: 'frame-harness-mesh-asset',
  meshBinding: 'binding-harness-mesh-v1',
  meshRevision: 'revision-harness-mesh-v1',
  meshRepresentation: 'representation-harness-mesh-primary',
  meshFamily: 'family-harness-mesh',
  meshCompatibility: 'compatibility-harness-mesh',
  gsAsset: 'asset-harness-partial-gs',
  gsFrame: 'frame-harness-gs-asset',
  gsBinding: 'binding-harness-gs-v1',
  gsRevision: 'revision-harness-gs-v1',
  gsRepresentation: 'representation-harness-gs-primary',
  gsFamily: 'family-harness-gs',
  gsCompatibility: 'compatibility-harness-gs',
  proxyRepresentation: 'representation-harness-gs-proxy',
  proxyFamily: 'family-harness-gs-proxy',
} as const;

// Uses existing accepted record/field names only. This is deliberately not
// exported or validated/claimed as ProjectDocV2: the profiles and payload
// digests required for such a claim are not ratified yet.
const HARNESS_PROJECT = {
  assets: [
    {
      id: IDS.meshAsset,
      label: 'Independent ordinary Mesh',
      assetFrameId: IDS.meshFrame,
      status: { kind: 'ready', activeBindingId: IDS.meshBinding },
    },
    {
      id: IDS.gsAsset,
      label: 'Independent partial GS',
      assetFrameId: IDS.gsFrame,
      status: { kind: 'ready', activeBindingId: IDS.gsBinding },
    },
  ],
  assetBindingRevisions: [
    {
      id: IDS.meshBinding,
      assetId: IDS.meshAsset,
      assetRevisionId: IDS.meshRevision,
      assetToProject: {
        translation: [-2.5, -0.5, 0] as const,
        rotationXYZW: [0, 0, 0, 1] as const,
        uniformScale: 1,
      },
    },
    {
      id: IDS.gsBinding,
      assetId: IDS.gsAsset,
      assetRevisionId: IDS.gsRevision,
      assetToProject: {
        translation: [1.5, 0.25, -0.75] as const,
        rotationXYZW: [0, 0.25881904510252074, 0, 0.9659258262890683] as const,
        uniformScale: 1.25,
      },
    },
  ],
  assetRevisions: [
    {
      id: IDS.meshRevision,
      assetId: IDS.meshAsset,
      representationIds: [IDS.meshRepresentation] as const,
      anchorCompatibilityClasses: [
        { id: IDS.meshCompatibility, targetVariantFamilyIds: [IDS.meshFamily] as const },
      ],
    },
    {
      id: IDS.gsRevision,
      assetId: IDS.gsAsset,
      representationIds: [IDS.gsRepresentation, IDS.proxyRepresentation] as const,
      anchorCompatibilityClasses: [
        { id: IDS.gsCompatibility, targetVariantFamilyIds: [IDS.gsFamily] as const },
      ],
    },
  ],
  representations: [
    {
      id: IDS.meshRepresentation,
      assetId: IDS.meshAsset,
      representationFrameId: 'frame-harness-mesh-representation',
      contentKind: 'mesh',
      purposes: ['source', 'display'] as const,
      role: 'meshPrimary',
      variantFamilyId: IDS.meshFamily,
      formatProfile: { id: 'harness-only-obj', specificationSha256: 'unratified' },
      blob: {
        algorithm: 'sha256',
        digest: 'c425cf4ea06178e8068f4cd896cd342b32bf586a8b24bd3dfc7f6dd6fd94810d',
        byteLength: 190,
        mediaType: 'model/obj',
      },
      representationToAsset: {
        translation: [0, 0, 0] as const,
        rotationXYZW: [0, 0, 0, 1] as const,
        uniformScale: 1,
        reflection: 'none',
      },
      logicalBoundsAsset: { min: [0, 0, 0] as const, max: [1, 1, 1] as const },
      derivedFrom: [] as const,
    },
    {
      id: IDS.gsRepresentation,
      assetId: IDS.gsAsset,
      representationFrameId: 'frame-harness-gs-representation',
      contentKind: 'gaussianSplat',
      purposes: ['source', 'display'] as const,
      role: 'gsPrimary',
      variantFamilyId: IDS.gsFamily,
      formatProfile: { id: 'harness-only-graphdeco-ply', specificationSha256: 'unratified' },
      blob: {
        algorithm: 'sha256',
        digest: 'd62becb6b21de9e2f7b24e51f05e2327ae261439b0b4af3c90bc4e75acf3cf5f',
        byteLength: 3573,
        mediaType: 'application/octet-stream',
      },
      representationToAsset: {
        translation: [0, 0, 0] as const,
        rotationXYZW: [0, 0, 0, 1] as const,
        uniformScale: 1,
        reflection: 'none',
      },
      logicalBoundsAsset: { min: [-1, -1, -1] as const, max: [1, 1, 1] as const },
      derivedFrom: [] as const,
    },
    {
      id: IDS.proxyRepresentation,
      assetId: IDS.gsAsset,
      representationFrameId: 'frame-harness-gs-proxy-representation',
      contentKind: 'mesh',
      purposes: ['interaction'] as const,
      role: 'interactionProxy',
      variantFamilyId: IDS.proxyFamily,
      proxyForGsVariantFamilyId: IDS.gsFamily,
      formatProfile: { id: 'harness-only-obj-proxy', specificationSha256: 'unratified' },
      // The same tiny OBJ bytes are reused under an interaction-only role. This
      // creates no converter or extra fixture and does not imply shared Assets.
      blob: {
        algorithm: 'sha256',
        digest: 'c425cf4ea06178e8068f4cd896cd342b32bf586a8b24bd3dfc7f6dd6fd94810d',
        byteLength: 190,
        mediaType: 'model/obj',
      },
      representationToAsset: {
        translation: [-1, -1, -1] as const,
        rotationXYZW: [0, 0, 0, 1] as const,
        uniformScale: 2,
        reflection: 'none',
      },
      logicalBoundsAsset: { min: [-1, -1, -1] as const, max: [1, 1, 1] as const },
      derivedFrom: [IDS.gsRepresentation] as const,
    },
  ],
} as const;

const STORAGE_KEY = 'lociview.spark-harness.caption.v1';
const INIT_TIMEOUT_MS = 30_000;

document.title = 'LociView Spark 2.1.0 Technical Harness';
document.head.insertAdjacentHTML(
  'beforeend',
  `<style id="spark-harness-style">
    body { margin:0; height:100vh; min-height:620px; display:grid; grid-template-columns:minmax(0,1fr) 390px; background:#090d14; color:#dbeafe; font:14px/1.45 system-ui,sans-serif; }
    #spark-stage { min-width:0; position:relative; overflow:hidden; }
    #spark-canvas { width:100%; height:100%; display:block; touch-action:none; }
    #spark-overlay { position:absolute; inset:12px auto auto 12px; display:flex; gap:8px; align-items:center; pointer-events:none; }
    .badge { padding:5px 9px; border-radius:999px; background:rgba(8,15,28,.82); border:1px solid #334155; font-size:12px; }
    .badge.ok { color:#86efac; border-color:#166534; } .badge.bad { color:#fecaca; border-color:#991b1b; }
    #spark-panel { border-left:1px solid #243247; padding:14px; overflow:auto; background:#0d1420; display:flex; flex-direction:column; gap:12px; }
    #spark-panel h1 { margin:0; font-size:17px; } #spark-panel h2 { margin:0 0 7px; font-size:13px; color:#bfdbfe; }
    #spark-panel p { margin:0; } .small { font-size:11px; color:#94a3b8; }
    .card { border:1px solid #243247; border-radius:9px; padding:10px; background:#101a2a; }
    .row { display:flex; gap:7px; align-items:center; flex-wrap:wrap; }
    label { display:grid; gap:4px; flex:1; min-width:140px; }
    select,button { color:#e2e8f0; background:#111c2e; border:1px solid #334155; border-radius:6px; padding:7px 9px; font:inherit; }
    button { cursor:pointer; } button.primary { background:#1d4ed8; border-color:#2563eb; } button:disabled { opacity:.45; cursor:not-allowed; }
    #spark-diagnostics { margin:0; padding-left:18px; color:#fbbf24; }
    pre { margin:0; max-height:190px; overflow:auto; white-space:pre-wrap; word-break:break-word; color:#cbd5e1; font:11px/1.4 ui-monospace,monospace; }
    @media (max-width:760px) { body { min-height:100vh; grid-template-columns:1fr; grid-template-rows:minmax(54vh,1fr) auto; } #spark-panel { border-left:0; border-top:1px solid #243247; max-height:46vh; } }
  </style>`,
);

document.body.innerHTML = `
  <main id="spark-stage">
    <canvas id="spark-canvas" aria-label="Mesh and Gaussian Splatting candidate scene"></canvas>
    <div id="spark-overlay"><span class="badge" id="spark-ready">starting</span><span class="badge" id="spark-mode-badge">Mesh + GS</span></div>
  </main>
  <aside id="spark-panel">
    <h1>Spark 2.1.0 Technical Harness</h1>
    <p class="small">Candidate evidence only — no Spark adoption, production persistence, G1 pass, or release claim.</p>
    <section class="card">
      <h2>Display and Caption target</h2>
      <div class="row">
        <label>Display
          <select id="spark-display">
            <option value="mixed">Mesh + GS</option><option value="gs-only">GS only</option><option value="mesh-only">Mesh only</option>
          </select>
        </label>
        <label>Caption target
          <select id="spark-target"><option value="gs">partial GS</option><option value="mesh">ordinary Mesh</option></select>
        </label>
      </div>
      <p class="small" style="margin-top:7px">Mesh target raycasts itself. GS target raycasts only its explicit invisible Proxy.</p>
    </section>
    <section class="card">
      <h2>Two-stage Caption placement</h2>
      <div class="row"><button class="primary" id="spark-place">1. Arm placement</button><button id="spark-save">2. Save final position</button><button id="spark-clear">Clear saved</button></div>
      <p class="small" style="margin-top:7px">After the coarse surface hit, drag the ordinary gizmo. Saving stores only the target AssetFrame <code>positionAsset</code>.</p>
    </section>
    <section class="card">
      <h2>Approved degradation outcome</h2>
      <select id="spark-scenario" style="width:100%">
        <option value="healthy">Healthy fixture</option>
        <option value="gs-failure">1 — GS missing/broken</option>
        <option value="proxy-failure">2 — Proxy missing/broken</option>
        <option value="binding-failure">3 — invalid/cross-Asset binding</option>
        <option value="transform-failure">4 — Proxy registration unknown</option>
        <option value="both-failure">5 — both visual Assets unusable</option>
      </select>
      <ul id="spark-diagnostics"></ul>
    </section>
    <section class="card"><h2>Current evidence state</h2><pre id="spark-state">starting…</pre></section>
  </aside>`;

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Harness element missing: ${selector}`);
  return element;
};

const canvas = $<HTMLCanvasElement>('#spark-canvas');
const displaySelect = $<HTMLSelectElement>('#spark-display');
const targetSelect = $<HTMLSelectElement>('#spark-target');
const scenarioSelect = $<HTMLSelectElement>('#spark-scenario');
const placeButton = $<HTMLButtonElement>('#spark-place');
const saveButton = $<HTMLButtonElement>('#spark-save');

let runtimeErrorCount = 0;
globalThis.addEventListener('error', () => {
  runtimeErrorCount += 1;
  renderState();
});
globalThis.addEventListener('unhandledrejection', () => {
  runtimeErrorCount += 1;
  renderState();
});

const bootFault = readBootFault();

let ready = false;
let displayMode: DisplayMode = 'mixed';
let target: CaptionTarget = 'gs';
let scenario: Scenario = bootFault ?? 'healthy';
let placementArmed = false;
let restoredFromStorage = false;
let currentAnchor: ManualAssetAnchor | null = null;
let savedAnchor: ManualAssetAnchor | null = readSavedAnchor();
let lastHit: HarnessSnapshot['lastHit'] = null;
let frameCount = 0;
let splatCount = 0;
let finiteGsBounds = false;
let gsInitialized = false;
let gizmoDragging = false;
let disposed = false;
let meshResourceState: ResourceState = 'pending';
let gsResourceState: ResourceState = 'pending';
let proxyResourceState: ResourceState = 'pending';

const diagnostics: string[] = [];
const resourceIssues: string[] = [];
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101725);
const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 100);
camera.position.set(5.5, 4.2, 8.5);
camera.lookAt(0, 0.4, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.35, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xbfdcff, 0x273244, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(4, 7, 5);
scene.add(keyLight);
const grid = new THREE.GridHelper(12, 24, 0x41658a, 0x26364a);
grid.position.y = -1.15;
scene.add(grid);

const meshAssetGroup = new THREE.Group();
meshAssetGroup.name = IDS.meshAsset;
const gsAssetGroup = new THREE.Group();
gsAssetGroup.name = IDS.gsAsset;
scene.add(meshAssetGroup, gsAssetGroup);
applySim3(meshAssetGroup, HARNESS_PROJECT.assetBindingRevisions[0].assetToProject);
applySim3(gsAssetGroup, HARNESS_PROJECT.assetBindingRevisions[1].assetToProject);

let meshSurface: THREE.Object3D | null = null;
let proxySurface: THREE.Object3D | null = null;
let captionMarker: THREE.Mesh | null = null;
let sparkRenderer: (THREE.Object3D & { dispose(): void }) | null = null;
let splatMesh: (THREE.Object3D & {
  initialized: Promise<unknown>;
  isInitialized: boolean;
  packedSplats?: { numSplats: number };
  getBoundingBox(centersOnly?: boolean): THREE.Box3;
  dispose(): void;
}) | null = null;

scenarioSelect.value = scenario;

const gizmo = new TransformControls(camera, canvas);
gizmo.setMode('translate');
gizmo.setSpace('local');
gizmo.setSize(0.75);
const gizmoWithHelper = gizmo as unknown as { getHelper?: () => THREE.Object3D };
const gizmoRoot = gizmoWithHelper.getHelper?.() ?? (gizmo as unknown as THREE.Object3D);
scene.add(gizmoRoot);
gizmo.addEventListener('dragging-changed', (event) => {
  gizmoDragging = (event as unknown as { value: boolean }).value;
  controls.enabled = !gizmoDragging;
  if (!gizmoDragging) syncAnchorFromMarker();
});
gizmo.addEventListener('objectChange', () => {
  syncAnchorFromMarker();
  renderState();
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function isFiniteTuple(value: unknown): value is Vec3Tuple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function isManualAnchor(value: unknown): value is ManualAssetAnchor {
  if (typeof value !== 'object' || value === null) return false;
  const anchor = value as Partial<ManualAssetAnchor>;
  const expected =
    anchor.assetId === IDS.gsAsset
      ? {
          frame: IDS.gsFrame,
          revision: IDS.gsRevision,
          compatibility: IDS.gsCompatibility,
        }
      : anchor.assetId === IDS.meshAsset
        ? {
            frame: IDS.meshFrame,
            revision: IDS.meshRevision,
            compatibility: IDS.meshCompatibility,
          }
        : null;
  return (
    expected !== null &&
    anchor.kind === 'asset' &&
    anchor.assetFrameId === expected.frame &&
    anchor.authoredAssetRevisionId === expected.revision &&
    anchor.authoredAnchorCompatibilityId === expected.compatibility &&
    isFiniteTuple(anchor.positionAsset) &&
    anchor.hitEvidence?.method === 'manual' &&
    Object.keys(anchor.hitEvidence).length === 1
  );
}

function readSavedAnchor(): ManualAssetAnchor | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isManualAnchor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function copyAnchor(anchor: ManualAssetAnchor | null): ManualAssetAnchor | null {
  return anchor === null ? null : JSON.parse(JSON.stringify(anchor)) as ManualAssetAnchor;
}

function applySim3(
  object: THREE.Object3D,
  transform: {
    readonly translation: readonly [number, number, number];
    readonly rotationXYZW: readonly [number, number, number, number];
    readonly uniformScale: number;
  },
): void {
  object.position.fromArray(transform.translation);
  object.quaternion.fromArray(transform.rotationXYZW);
  object.scale.setScalar(transform.uniformScale);
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error(`${label} timed out`)), INIT_TIMEOUT_MS);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function tuple(vector: THREE.Vector3): Vec3Tuple {
  return [vector.x, vector.y, vector.z];
}

function visibleAssets(): { mesh: boolean; gs: boolean } {
  const meshRequested = displayMode === 'mixed' || displayMode === 'mesh-only';
  const gsRequested = displayMode === 'mixed' || displayMode === 'gs-only';
  return {
    mesh: meshRequested && meshResourceState === 'ready' && scenario !== 'both-failure',
    gs:
      gsRequested &&
      gsResourceState === 'ready' &&
      scenario !== 'gs-failure' &&
      scenario !== 'both-failure',
  };
}

function interactionResolution(): {
  enabled: boolean;
  surfaceRepresentationId: string | null;
  object: THREE.Object3D | null;
  assetGroup: THREE.Group | null;
  reason: string | null;
} {
  if (!ready) return { enabled: false, surfaceRepresentationId: null, object: null, assetGroup: null, reason: 'Harness is not ready.' };
  if (scenario === 'both-failure') {
    return { enabled: false, surfaceRepresentationId: null, object: null, assetGroup: null, reason: 'Both visual Assets are unusable; neither is activated.' };
  }
  if (target === 'mesh') {
    if (!visibleAssets().mesh || meshSurface === null) {
      return { enabled: false, surfaceRepresentationId: null, object: null, assetGroup: null, reason: 'The selected Mesh is not currently visible/usable.' };
    }
    return {
      enabled: true,
      surfaceRepresentationId: IDS.meshRepresentation,
      object: meshSurface,
      assetGroup: meshAssetGroup,
      reason: null,
    };
  }
  // Display mode and interaction target are independent. A healthy GS may be
  // hidden by the Mesh-only display while its explicitly bound invisible
  // Proxy remains the selected interaction surface.
  if (
    gsResourceState !== 'ready' ||
    scenario === 'gs-failure' ||
    splatMesh === null ||
    !gsInitialized
  ) {
    return { enabled: false, surfaceRepresentationId: null, object: null, assetGroup: null, reason: 'The selected GS is unusable.' };
  }
  if (proxyResourceState !== 'ready' || scenario === 'proxy-failure') {
    return { enabled: false, surfaceRepresentationId: null, object: null, assetGroup: null, reason: 'The GS remains viewable, but its dedicated Proxy is missing/broken. New placement is disabled.' };
  }
  if (scenario === 'binding-failure') {
    return { enabled: false, surfaceRepresentationId: null, object: null, assetGroup: null, reason: 'The Proxy binding is invalid/cross-Asset. No other Mesh is guessed.' };
  }
  if (scenario === 'transform-failure') {
    return { enabled: false, surfaceRepresentationId: null, object: null, assetGroup: null, reason: 'Proxy-to-GS registration is unknown. Identity is not guessed.' };
  }

  const revision = HARNESS_PROJECT.assetRevisions[1];
  const candidates = HARNESS_PROJECT.representations.filter(
    (representation) =>
      representation.id === IDS.proxyRepresentation &&
      representation.assetId === IDS.gsAsset &&
      representation.role === 'interactionProxy' &&
      representation.purposes.length === 1 &&
      representation.purposes[0] === 'interaction' &&
      'proxyForGsVariantFamilyId' in representation &&
      representation.proxyForGsVariantFamilyId === IDS.gsFamily &&
      revision.representationIds.includes(representation.id),
  );
  if (candidates.length !== 1 || proxySurface === null) {
    return { enabled: false, surfaceRepresentationId: null, object: null, assetGroup: null, reason: 'Exactly one same-Asset dedicated Proxy was not resolved.' };
  }
  return {
    enabled: true,
    surfaceRepresentationId: IDS.proxyRepresentation,
    object: proxySurface,
    assetGroup: gsAssetGroup,
    reason: null,
  };
}

function degradationDiagnostics(): string[] {
  switch (scenario) {
    case 'healthy':
      return ['Healthy candidate: explicit target selection is required; no interaction surface is inferred.'];
    case 'gs-failure':
      return ['GS missing/broken is reported. The independent Mesh remains visible and usable.'];
    case 'proxy-failure':
      return ['GS remains visible. New GS Caption placement is disabled; a saved GS-local Caption remains editable without Proxy re-raycast.'];
    case 'binding-failure':
      return ['Invalid/cross-Asset binding disables GS interaction and is reported. The unrelated Mesh is never substituted.'];
    case 'transform-failure':
      return ['Unknown Proxy registration disables only GS placement. No identity transform is guessed; other visual paths remain usable.'];
    case 'both-failure':
      return ['Both visual Assets are unusable, so neither is activated. This diagnostic remains available.'];
  }
}

function currentDiagnostics(): string[] {
  return [...degradationDiagnostics(), ...resourceIssues];
}

function applyVisibility(): void {
  const visible = visibleAssets();
  meshAssetGroup.visible = visible.mesh;
  gsAssetGroup.visible = visible.gs;

  if (captionMarker !== null && currentAnchor !== null) {
    captionMarker.visible = currentAnchor.assetId === IDS.gsAsset ? visible.gs : visible.mesh;
    if (captionMarker.visible) gizmo.attach(captionMarker);
    else gizmo.detach();
  }
}

function anchorFor(targetAsset: CaptionTarget, positionAsset: THREE.Vector3): ManualAssetAnchor {
  return targetAsset === 'gs'
    ? {
        kind: 'asset',
        assetId: IDS.gsAsset,
        assetFrameId: IDS.gsFrame,
        positionAsset: tuple(positionAsset),
        authoredAssetRevisionId: IDS.gsRevision,
        authoredAnchorCompatibilityId: IDS.gsCompatibility,
        hitEvidence: { method: 'manual' },
      }
    : {
        kind: 'asset',
        assetId: IDS.meshAsset,
        assetFrameId: IDS.meshFrame,
        positionAsset: tuple(positionAsset),
        authoredAssetRevisionId: IDS.meshRevision,
        authoredAnchorCompatibilityId: IDS.meshCompatibility,
        hitEvidence: { method: 'manual' },
      };
}

function showAnchor(anchor: ManualAssetAnchor): void {
  if (captionMarker === null) {
    captionMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 20, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd33d, emissive: 0x8a5b00, emissiveIntensity: 1.4 }),
    );
    captionMarker.name = 'Caption positionAsset';
  }
  const parent = anchor.assetId === IDS.gsAsset ? gsAssetGroup : meshAssetGroup;
  parent.add(captionMarker);
  captionMarker.position.fromArray(anchor.positionAsset);
  captionMarker.quaternion.identity();
  captionMarker.scale.setScalar(anchor.assetId === IDS.gsAsset ? 1 : 0.8);
  gizmo.attach(captionMarker);
  applyVisibility();
}

function syncAnchorFromMarker(): void {
  if (captionMarker === null || currentAnchor === null) return;
  currentAnchor = { ...currentAnchor, positionAsset: tuple(captionMarker.position), hitEvidence: { method: 'manual' } };
}

function placeFromClient(clientX: number, clientY: number): boolean {
  const resolution = interactionResolution();
  if (!placementArmed || !resolution.enabled || resolution.object === null || resolution.assetGroup === null) {
    diagnostics.splice(0, diagnostics.length, resolution.reason ?? 'Placement is not armed.');
    placementArmed = false;
    renderState();
    return false;
  }

  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  scene.updateMatrixWorld(true);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(resolution.object, true)[0];
  placementArmed = false;
  if (hit === undefined) {
    diagnostics.splice(0, diagnostics.length, 'No hit on the selected interaction surface. Nothing was inferred.');
    renderState();
    return false;
  }

  const hitWorld = hit.point.clone();
  const positionAsset = resolution.assetGroup.worldToLocal(hitWorld.clone());
  const roundTrip = resolution.assetGroup.localToWorld(positionAsset.clone());
  currentAnchor = anchorFor(target, positionAsset);
  lastHit = {
    surfaceRepresentationId: resolution.surfaceRepresentationId!,
    pointWorld: tuple(hitWorld),
    positionAsset: tuple(positionAsset),
    roundTripError: roundTrip.distanceTo(hitWorld),
  };
  showAnchor(currentAnchor);
  diagnostics.splice(0, diagnostics.length, `Coarse hit accepted from ${resolution.surfaceRepresentationId}. Adjust the gizmo, then save.`);
  renderState();
  return true;
}

canvas.addEventListener('click', (event) => {
  if (!gizmoDragging && placementArmed) placeFromClient(event.clientX, event.clientY);
});

function setDisplayMode(mode: DisplayMode): void {
  displayMode = mode;
  displaySelect.value = mode;
  applyVisibility();
  renderState();
}

function setTarget(nextTarget: CaptionTarget): void {
  target = nextTarget;
  targetSelect.value = nextTarget;
  placementArmed = false;
  renderState();
}

function setScenario(nextScenario: Scenario): void {
  scenario = nextScenario;
  scenarioSelect.value = nextScenario;
  placementArmed = false;
  diagnostics.splice(0, diagnostics.length, ...currentDiagnostics());
  applyVisibility();
  renderState();
}

function armPlacement(): boolean {
  const resolution = interactionResolution();
  placementArmed = resolution.enabled;
  diagnostics.splice(
    0,
    diagnostics.length,
    resolution.enabled
      ? `Placement armed for ${target === 'gs' ? 'GS dedicated Proxy' : 'Mesh itself'}. Click/tap the target in the canvas.`
      : (resolution.reason ?? 'Interaction unavailable.'),
  );
  renderState();
  return placementArmed;
}

function saveCaption(): boolean {
  syncAnchorFromMarker();
  if (currentAnchor === null) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentAnchor));
  savedAnchor = copyAnchor(currentAnchor);
  restoredFromStorage = false;
  diagnostics.splice(0, diagnostics.length, 'Final AssetFrame positionAsset saved in harness-only local storage.');
  renderState();
  return true;
}

function clearSavedCaption(): void {
  localStorage.removeItem(STORAGE_KEY);
  savedAnchor = null;
  currentAnchor = null;
  restoredFromStorage = false;
  lastHit = null;
  if (captionMarker !== null) captionMarker.removeFromParent();
  gizmo.detach();
  diagnostics.splice(0, diagnostics.length, 'Harness-only saved Caption cleared.');
  renderState();
}

function suggestedClick(suggestedTarget: CaptionTarget = target): { clientX: number; clientY: number } | null {
  const object = suggestedTarget === 'gs' ? proxySurface : meshSurface;
  if (object === null) return null;
  const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    clientX: rect.left + ((center.x + 1) / 2) * rect.width,
    clientY: rect.top + ((1 - center.y) / 2) * rect.height,
  };
}

function markerClientPosition(): { clientX: number; clientY: number } | null {
  if (captionMarker === null) return null;
  scene.updateMatrixWorld(true);
  const point = captionMarker.getWorldPosition(new THREE.Vector3()).project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    clientX: rect.left + ((point.x + 1) / 2) * rect.width,
    clientY: rect.top + ((1 - point.y) / 2) * rect.height,
  };
}

function gizmoClientCandidates(axis: 'X' | 'Y' | 'Z' = 'X'): Array<{
  clientX: number;
  clientY: number;
  objectType: string;
  materialVisible: boolean | null;
}> {
  if (captionMarker === null) return [];
  scene.updateMatrixWorld(true);
  const rect = canvas.getBoundingClientRect();
  const result: Array<{
    clientX: number;
    clientY: number;
    objectType: string;
    materialVisible: boolean | null;
  }> = [];
  gizmoRoot.traverse((object) => {
    if (object.name !== axis || !object.visible) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const point = box.getCenter(new THREE.Vector3()).project(camera);
    result.push({
      clientX: rect.left + ((point.x + 1) / 2) * rect.width,
      clientY: rect.top + ((1 - point.y) / 2) * rect.height,
      objectType: object.type,
      materialVisible:
        object instanceof THREE.Mesh
          ? (Array.isArray(object.material) ? object.material.every((material) => material.visible) : object.material.visible)
          : null,
    });
  });
  return result;
}

function getSnapshot(): HarnessSnapshot {
  const visible = visibleAssets();
  const resolution = interactionResolution();
  return {
    ready,
    sparkVersion: '2.1.0',
    displayMode,
    target,
    scenario,
    placementArmed,
    visible: { ...visible, proxyRendered: false },
    interaction: {
      enabled: resolution.enabled,
      surfaceRepresentationId: resolution.surfaceRepresentationId,
      reason: resolution.reason,
    },
    gs: {
      initialized: gsInitialized,
      splatCount,
      finiteBounds: finiteGsBounds,
      candidateFormatOnly: true,
    },
    resources: {
      mesh: meshResourceState,
      gs: gsResourceState,
      proxy: proxyResourceState,
      bootFault,
      issues: [...resourceIssues],
    },
    currentAnchor: copyAnchor(currentAnchor),
    savedAnchor: copyAnchor(savedAnchor),
    restoredFromStorage,
    lastHit: lastHit === null ? null : JSON.parse(JSON.stringify(lastHit)) as HarnessSnapshot['lastHit'],
    frameCount,
    runtimeErrorCount,
    diagnostics: [...diagnostics],
  };
}

function renderState(): void {
  const snapshot = getSnapshot();
  const readyBadge = $('#spark-ready');
  readyBadge.textContent = ready
    ? gsResourceState === 'ready'
      ? `ready · ${splatCount} splats`
      : 'ready · degraded'
    : 'starting';
  readyBadge.classList.toggle('ok', ready);
  readyBadge.classList.toggle('bad', runtimeErrorCount > 0);
  $('#spark-mode-badge').textContent =
    displayMode === 'mixed' ? 'Mesh + GS' : displayMode === 'gs-only' ? 'GS only' : 'Mesh only';
  placeButton.textContent = placementArmed ? 'Click/tap selected surface…' : '1. Arm placement';
  placeButton.disabled = !snapshot.interaction.enabled;
  saveButton.disabled = currentAnchor === null;
  $('#spark-diagnostics').innerHTML = snapshot.diagnostics.map((message) => `<li>${escapeHtml(message)}</li>`).join('');
  $('#spark-state').textContent = JSON.stringify(snapshot, null, 2);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

displaySelect.addEventListener('change', () => setDisplayMode(displaySelect.value as DisplayMode));
targetSelect.addEventListener('change', () => setTarget(targetSelect.value as CaptionTarget));
scenarioSelect.addEventListener('change', () => setScenario(scenarioSelect.value as Scenario));
placeButton.addEventListener('click', armPlacement);
saveButton.addEventListener('click', saveCaption);
$('#spark-clear').addEventListener('click', clearSavedCaption);

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

globalThis.addEventListener('resize', resize);
resize();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function initializeMeshAndProxyResources(): Promise<void> {
  if (bootFault === 'both-failure') {
    meshResourceState = 'failed';
    proxyResourceState = 'failed';
    resourceIssues.push('Boot fault: the Mesh visual was not activated.');
    resourceIssues.push('Boot fault: the dedicated Proxy was not activated.');
    return;
  }

  try {
    const objResponse = await fetch(`${import.meta.env.BASE_URL}samples/cube.obj`);
    if (!objResponse.ok) throw new Error(`HTTP ${objResponse.status}`);
    const parsed = new OBJLoader().parse(await objResponse.text());

    meshSurface = parsed.clone(true);
    meshSurface.name = IDS.meshRepresentation;
    meshSurface.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.material = new THREE.MeshStandardMaterial({ color: 0x3ba0ff, roughness: 0.55, metalness: 0.05 });
        object.userData.representationId = IDS.meshRepresentation;
      }
    });
    meshAssetGroup.add(meshSurface);
    meshResourceState = 'ready';

    if (bootFault === 'proxy-failure') {
      proxyResourceState = 'failed';
      resourceIssues.push('Boot fault: the dedicated Proxy was not activated.');
      return;
    }

    try {
      proxySurface = parsed.clone(true);
      proxySurface.name = IDS.proxyRepresentation;
      const proxyTransform = HARNESS_PROJECT.representations[2].representationToAsset;
      applySim3(proxySurface, proxyTransform);
      proxySurface.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false });
          object.userData.representationId = IDS.proxyRepresentation;
          object.userData.interactionOnly = true;
        }
      });
      gsAssetGroup.add(proxySurface);
      proxyResourceState = 'ready';
    } catch (error: unknown) {
      proxySurface?.removeFromParent();
      proxySurface = null;
      proxyResourceState = 'failed';
      resourceIssues.push(`Dedicated Proxy activation failed: ${errorMessage(error)}`);
    }
  } catch (error: unknown) {
    meshSurface?.removeFromParent();
    meshSurface = null;
    proxySurface?.removeFromParent();
    proxySurface = null;
    meshResourceState = 'failed';
    proxyResourceState = 'failed';
    resourceIssues.push(`Mesh fixture load/activation failed: ${errorMessage(error)}`);
    resourceIssues.push('The dedicated Proxy shares the tiny fixture bytes and could not be activated.');
  }
}

async function initializeGsResource(): Promise<void> {
  if (bootFault === 'gs-failure' || bootFault === 'both-failure') {
    gsResourceState = 'failed';
    resourceIssues.push('Boot fault: the GS visual was not activated.');
    return;
  }

  try {
    const gsResponse = await fetch(gsFixtureUrl);
    if (!gsResponse.ok) throw new Error(`HTTP ${gsResponse.status}`);

    const sparkModule = await withTimeout(import('@sparkjsdev/spark'), 'Spark dynamic import');
    await withTimeout(sparkModule.SplatMesh.staticInitialized, 'Spark WASM initialization');
    const candidateRenderer = new sparkModule.SparkRenderer({ renderer, enableLod: false });
    sparkRenderer = candidateRenderer;
    scene.add(candidateRenderer);

    const candidateSplatMesh = new sparkModule.SplatMesh({
      fileBytes: new Uint8Array(await gsResponse.arrayBuffer()),
      fileName: 'profile-golden-sh3-v1.ply',
      fileType: sparkModule.SplatFileType.PLY,
      editable: false,
      raycastable: false,
      enableLod: false,
    });
    splatMesh = candidateSplatMesh;
    await withTimeout(candidateSplatMesh.initialized, 'GS fixture decode');
    candidateSplatMesh.name = IDS.gsRepresentation;
    candidateSplatMesh.position.set(0, 0, 0);
    candidateSplatMesh.quaternion.identity();
    candidateSplatMesh.scale.setScalar(1);
    gsAssetGroup.add(candidateSplatMesh);
    gsInitialized = candidateSplatMesh.isInitialized;
    splatCount = candidateSplatMesh.packedSplats?.numSplats ?? 0;
    const bounds = candidateSplatMesh.getBoundingBox(true);
    finiteGsBounds =
      !bounds.isEmpty() &&
      [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite);
    if (!gsInitialized || splatCount !== 8 || !finiteGsBounds) {
      throw new Error(`candidate invariant failed (initialized=${gsInitialized}, splats=${splatCount}, finiteBounds=${finiteGsBounds})`);
    }
    gsResourceState = 'ready';
  } catch (error: unknown) {
    splatMesh?.removeFromParent();
    splatMesh?.dispose();
    splatMesh = null;
    sparkRenderer?.removeFromParent();
    sparkRenderer?.dispose();
    sparkRenderer = null;
    gsInitialized = false;
    splatCount = 0;
    finiteGsBounds = false;
    gsResourceState = 'failed';
    resourceIssues.push(`GS fixture load/decode failed: ${errorMessage(error)}`);
  }
}

async function initialize(): Promise<void> {
  if (!renderer.capabilities.isWebGL2) throw new Error('Spark technical harness requires WebGL2.');

  // Each visual/resource lane owns its failure. One broken candidate must not
  // reject initialization of the independent usable lane.
  await Promise.all([initializeMeshAndProxyResources(), initializeGsResource()]);

  ready = true;
  diagnostics.splice(0, diagnostics.length, ...currentDiagnostics());
  if (savedAnchor !== null) {
    const restoredAnchor = copyAnchor(savedAnchor);
    if (restoredAnchor === null) throw new Error('Saved anchor copy unexpectedly failed.');
    currentAnchor = restoredAnchor;
    restoredFromStorage = true;
    showAnchor(restoredAnchor);
  }
  applyVisibility();
  renderState();
}

function animate(): void {
  if (disposed) return;
  controls.update();
  renderer.render(scene, camera);
  frameCount += 1;
  if (frameCount < 10 || frameCount % 60 === 0) renderState();
}

function dispose(): void {
  if (disposed) return;
  disposed = true;
  renderer.setAnimationLoop(null);
  gizmo.detach();
  gizmo.dispose();
  controls.dispose();
  splatMesh?.dispose();
  sparkRenderer?.dispose();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  renderer.dispose();
}

const api: HarnessApi = {
  getSnapshot,
  setDisplayMode,
  setTarget,
  setScenario,
  armPlacement,
  saveCaption,
  clearSavedCaption,
  suggestedClick,
  markerClientPosition,
  gizmoClientCandidates,
  setOrbitEnabled: (enabled) => {
    controls.enabled = enabled;
  },
};
(globalThis as unknown as { __sparkHarness: HarnessApi }).__sparkHarness = api;
globalThis.addEventListener('pagehide', dispose, { once: true });

renderer.setAnimationLoop(animate);
renderState();
await initialize();
