import { isDeepStrictEqual } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyImportPlan,
  type ImportPlan,
  type ImportResult,
} from '../../src/assets/importWizard';
import { formatHlc, parseHlc } from '../../src/core/hlc';
import { parseOpsJsonl } from '../../src/core/jsonl';
import {
  GENERATOR,
  MANIFEST_FORMAT,
  parseManifest,
  SCHEMA_VERSION,
} from '../../src/core/manifest';
import { visibleEntities } from '../../src/core/reduce';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS, type ProjectWorkspaceFS, type WorkspaceFS } from '../../src/platform/fs';
import {
  FaultInjectingMemoryFS,
  type FaultEvent,
  type FaultOutcome,
} from '../helpers/faultFs';
import { ResolvedCorruptingMemoryFS } from '../helpers/resolvedCorruptingFs';

const USER: Readonly<Identity> = Object.freeze({
  userId: 'usr_00000000000000000000000080',
  deviceId: 'dev_00000000000000000000000080',
  displayName: 'wizard publication characterization',
});
const PROJECT_NAME = 'wizard publication characterization';
const MODEL_NAME = 'wizard-model.glb';
const IMAGE_NAME = 'wizard-image.png';
const MODEL_BYTES = new TextEncoder().encode('wizard original model bytes');
const OPTIMIZED_BYTES = new TextEncoder().encode('wizard optimized bytes');
const IMAGE_BYTES = new TextEncoder().encode('wizard image bytes');

type WizardFaultBoundary =
  | 'root-marker-after'
  | 'root-marker-prefix'
  | 'initial-log-prefix'
  | 'optimized-blob-prefix'
  | 'image-blob-prefix'
  | 'final-asset-log-prefix';

interface WizardClosure {
  active: boolean;
  complete: boolean;
  safe: boolean;
  optimizedPresent: boolean;
  dir: string | null;
  projectId: string | null;
}

interface WizardFaultResult {
  inputShapeValid: boolean;
  faultReached: boolean;
  closureSafe: boolean;
  outcomeBound: boolean;
  publicationHistorySafe: boolean;
}

type ImportActionOutcome =
  | { status: 'fulfilled'; result: ImportResult }
  | { status: 'rejected'; result: null };

type ResolvedWriteRole = 'original-model' | 'optimized-model' | 'image-media';

interface ResolvedWriteResult {
  inputShapeValid: boolean;
  optimizerInputExact: boolean;
  faultReached: boolean;
  verificationObserved: boolean;
  closureSafe: boolean;
  outcomeBound: boolean;
  publicationHistorySafe: boolean;
}

type ReceiptRecheckRole = ResolvedWriteRole;

interface ReceiptRecheckResult {
  inputShapeValid: boolean;
  initialVerificationReturnedExact: boolean;
  corruptionInjected: boolean;
  closureSafe: boolean;
  outcomeBound: boolean;
  publicationHistorySafe: boolean;
}

interface SnapshotResult {
  inputShapeValid: boolean;
  pauseReached: boolean;
  pauseBeforeEffects: boolean;
  optimizerInputExact: boolean;
  outcomeBound: boolean;
  closureSafe: boolean;
  publicationHistorySafe: boolean;
}

interface MarkerPointSnapshot {
  readonly eventStartIndex: number;
  readonly path: string;
  readonly files: ReadonlyMap<string, Uint8Array | null>;
}

type MarkerHistoryFS = FaultInjectingMemoryFS & {
  readonly markerStarts: readonly MarkerPointSnapshot[];
  readonly markerCommits: readonly MarkerPointSnapshot[];
};

function bytesEqual(actual: Uint8Array | null, expected: Uint8Array): boolean {
  return actual !== null &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function freshPlan(): ImportPlan {
  return {
    models: [{
      path: `source/${MODEL_NAME}`,
      name: MODEL_NAME,
      data: new Uint8Array(MODEL_BYTES),
    }],
    images: [{
      path: `source/${IMAGE_NAME}`,
      name: IMAGE_NAME,
      data: new Uint8Array(IMAGE_BYTES),
    }],
    videos: [],
    tables: [],
    sources: [],
    selectedSourceIndex: 0,
    migration: null,
    fileIdMap: new Map(),
    diagnostics: {
      archive: [],
      rejectedCandidates: [],
      selection: null,
      selectedSource: [],
    },
    warnings: [],
  };
}

function planShapeIsExact(plan: ImportPlan): boolean {
  return plan.models.length === 1 &&
    plan.images.length === 1 &&
    plan.videos.length === 0 &&
    plan.tables.length === 0 &&
    plan.sources.length === 0 &&
    plan.selectedSourceIndex === 0 &&
    plan.migration === null &&
    plan.fileIdMap.size === 0 &&
    plan.diagnostics.archive.length === 0 &&
    plan.diagnostics.rejectedCandidates.length === 0 &&
    plan.diagnostics.selection === null &&
    plan.diagnostics.selectedSource.length === 0 &&
    plan.warnings.length === 0 &&
    plan.models[0]?.path === `source/${MODEL_NAME}` &&
    plan.models[0]?.name === MODEL_NAME &&
    plan.images[0]?.path === `source/${IMAGE_NAME}` &&
    plan.images[0]?.name === IMAGE_NAME &&
    bytesEqual(plan.models[0]?.data ?? null, MODEL_BYTES) &&
    bytesEqual(plan.images[0]?.data ?? null, IMAGE_BYTES) &&
    !bytesEqual(MODEL_BYTES, OPTIMIZED_BYTES) &&
    !bytesEqual(MODEL_BYTES, IMAGE_BYTES) &&
    !bytesEqual(OPTIMIZED_BYTES, IMAGE_BYTES);
}

function payloadBytes(payload: string | Uint8Array): Uint8Array {
  return typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
}

function payloadOps(payload: string | Uint8Array): unknown[] {
  const text = new TextDecoder().decode(payloadBytes(payload));
  const parsed: unknown[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Non-JSON payloads simply do not match semantic operation boundaries.
    }
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());
}

function isCanonicalWizardOp(
  value: unknown,
  kind: 'set' | 'image',
  expectedActor: string,
): value is Op {
  if (!isRecord(value) || !isRecord(value.v)) return false;
  if (
    !hasExactKeys(value, ['op', 'hlc', 'actor', 'user', 't', 'e', 'id', 'v']) ||
    !Number.isSafeInteger(value.op) || Number(value.op) < 1 ||
    value.actor !== expectedActor ||
    !/^a_[0-9A-HJKMNP-TV-Z]{13}$/u.test(expectedActor) ||
    value.user !== USER.userId ||
    value.t !== 'create' ||
    typeof value.hlc !== 'string'
  ) {
    return false;
  }
  try {
    const parsed = parseHlc(value.hlc);
    if (
      parsed.actor !== expectedActor ||
      formatHlc(parsed.physical, parsed.counter, parsed.actor) !== value.hlc
    ) {
      return false;
    }
  } catch {
    return false;
  }

  if (kind === 'set') {
    return value.e === 'set' &&
      typeof value.id === 'string' && /^set_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(value.id) &&
      isDeepStrictEqual(value.v, { name: '標準', order: 1 });
  }
  if (
    value.e !== 'asset' ||
    typeof value.id !== 'string' ||
    !/^ast_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(value.id)
  ) {
    return false;
  }
  return isDeepStrictEqual(value.v, {
    kind: 'image',
    path: `media/${value.id}.png`,
    originalName: IMAGE_NAME,
    mime: '',
    size: IMAGE_BYTES.length,
  });
}

function containsWizardOperation(
  payload: string | Uint8Array,
  kind: 'set' | 'image',
  expectedActor: string,
): boolean {
  return payloadOps(payload).some((value) => isCanonicalWizardOp(value, kind, expectedActor));
}

function wizardLogActor(path: string): string | null {
  const match = /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}\/ops\/(a_[0-9A-HJKMNP-TV-Z]{13})\.jsonl$/.exec(path);
  return match?.[1] ?? null;
}

function isOptimizedModelPath(path: string): boolean {
  return /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}\/models\/[^/]+\.opt\.glb$/.test(path);
}

function isOriginalModelPath(path: string): boolean {
  return /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}\/models\/[^/]+\.glb$/.test(path) &&
    !path.endsWith('.opt.glb');
}

function isImagePath(path: string): boolean {
  return /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}\/media\/[^/]+\.png$/.test(path);
}

function isRootMarkerPath(path: string): boolean {
  return /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}\/lociview\.json$/.test(path);
}

function isProjectListingMarkerPath(path: string): boolean {
  return path.startsWith('projects/') && path.endsWith('/lociview.json');
}

function isActiveLogPath(dir: string, path: string): boolean {
  const prefix = `${dir}/ops/`;
  return path.startsWith(prefix) && path.slice(prefix.length).endsWith('.jsonl');
}

function vectorMatchesOps(
  vector: Readonly<Record<string, number>>,
  ops: readonly Pick<Op, 'actor' | 'op'>[],
): boolean {
  const expected: Record<string, number> = {};
  for (const op of ops) {
    if ((expected[op.actor] ?? 0) < op.op) expected[op.actor] = op.op;
  }
  return isDeepStrictEqual(vector, expected);
}

async function snapshotProjectFiles(
  fs: FaultInjectingMemoryFS,
): Promise<ReadonlyMap<string, Uint8Array | null>> {
  const pending = (await fs.list('projects/')).map((path) => ({ path, bytes: fs.readBytes(path) }));
  const files = new Map<string, Uint8Array | null>();
  for (const item of pending) files.set(item.path, await item.bytes);
  return files;
}

async function markerStartFiles(
  fs: FaultInjectingMemoryFS,
  path: string,
): Promise<ReadonlyMap<string, Uint8Array | null> | null> {
  return isProjectListingMarkerPath(path) ? snapshotProjectFiles(fs) : null;
}

async function captureMarkerMutation(
  fs: FaultInjectingMemoryFS,
  captured: Set<number>,
  starts: MarkerPointSnapshot[],
  commits: MarkerPointSnapshot[],
  path: string,
  startFiles: ReadonlyMap<string, Uint8Array | null> | null,
): Promise<void> {
  if (startFiles === null) return;
  const event = [...fs.events].reverse().find((candidate) =>
    candidate.path === path && !captured.has(candidate.startIndex),
  );
  if (event === undefined) return;
  captured.add(event.startIndex);
  starts.push({
    eventStartIndex: event.startIndex,
    path,
    files: startFiles,
  });
  if (event.commitIndex !== null) {
    commits.push({
      eventStartIndex: event.startIndex,
      path,
      files: await snapshotProjectFiles(fs),
    });
  }
}

class WizardFaultFS extends FaultInjectingMemoryFS {
  private armed = false;
  private readonly capturedMarkerEvents = new Set<number>();
  matchedPath: string | null = null;
  expectedOutcome: FaultOutcome | null = null;
  readonly markerStarts: MarkerPointSnapshot[] = [];
  readonly markerCommits: MarkerPointSnapshot[] = [];

  constructor(private readonly boundary: WizardFaultBoundary | null) {
    super();
  }

  private armForPayload(path: string, payload: string | Uint8Array): void {
    if (this.armed || this.boundary === null) return;

    let outcome: FaultOutcome | null = null;
    const logActor = wizardLogActor(path);
    if (this.boundary === 'root-marker-after' && isRootMarkerPath(path)) {
      outcome = 'commit-then-throw';
    } else if (this.boundary === 'root-marker-prefix' && isRootMarkerPath(path)) {
      outcome = 'write-prefix-then-throw';
    } else if (
      this.boundary === 'initial-log-prefix' &&
      logActor !== null &&
      containsWizardOperation(payload, 'set', logActor)
    ) {
      outcome = 'write-prefix-then-throw';
    } else if (
      this.boundary === 'optimized-blob-prefix' &&
      isOptimizedModelPath(path) &&
      bytesEqual(payloadBytes(payload), OPTIMIZED_BYTES)
    ) {
      outcome = 'write-prefix-then-throw';
    } else if (
      this.boundary === 'image-blob-prefix' &&
      isImagePath(path) &&
      bytesEqual(payloadBytes(payload), IMAGE_BYTES)
    ) {
      outcome = 'write-prefix-then-throw';
    } else if (
      this.boundary === 'final-asset-log-prefix' &&
      logActor !== null &&
      containsWizardOperation(payload, 'image', logActor)
    ) {
      outcome = 'write-prefix-then-throw';
    }
    if (outcome === null) return;

    this.armed = true;
    this.matchedPath = path;
    this.expectedOutcome = outcome;
    if (outcome === 'commit-then-throw') {
      this.failNextWriteAfterCommit(path, `injected wizard ${this.boundary}`);
    } else {
      this.failNextWriteAfterPrefix(path, 3, `injected wizard ${this.boundary}`);
    }
  }

  override async writeText(path: string, text: string): Promise<void> {
    this.armForPayload(path, text);
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.writeText(path, text);
    } finally {
      await captureMarkerMutation(
        this,
        this.capturedMarkerEvents,
        this.markerStarts,
        this.markerCommits,
        path,
        startFiles,
      );
    }
  }

  override async appendText(path: string, text: string): Promise<void> {
    this.armForPayload(path, text);
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.appendText(path, text);
    } finally {
      await captureMarkerMutation(
        this,
        this.capturedMarkerEvents,
        this.markerStarts,
        this.markerCommits,
        path,
        startFiles,
      );
    }
  }

  override async appendBytes(path: string, data: Uint8Array): Promise<void> {
    this.armForPayload(path, data);
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.appendBytes(path, data);
    } finally {
      await captureMarkerMutation(
        this,
        this.capturedMarkerEvents,
        this.markerStarts,
        this.markerCommits,
        path,
        startFiles,
      );
    }
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.armForPayload(path, data);
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.writeBytes(path, data);
    } finally {
      await captureMarkerMutation(
        this,
        this.capturedMarkerEvents,
        this.markerStarts,
        this.markerCommits,
        path,
        startFiles,
      );
    }
  }

  override async remove(path: string): Promise<void> {
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.remove(path);
    } finally {
      await captureMarkerMutation(
        this,
        this.capturedMarkerEvents,
        this.markerStarts,
        this.markerCommits,
        path,
        startFiles,
      );
    }
  }
}

class WizardResolvedCorruptingMemoryFS extends ResolvedCorruptingMemoryFS {
  private readonly capturedMarkerEvents = new Set<number>();
  readonly markerStarts: MarkerPointSnapshot[] = [];
  readonly markerCommits: MarkerPointSnapshot[] = [];

  private async capture(
    path: string,
    startFiles: ReadonlyMap<string, Uint8Array | null> | null,
  ): Promise<void> {
    await captureMarkerMutation(
      this,
      this.capturedMarkerEvents,
      this.markerStarts,
      this.markerCommits,
      path,
      startFiles,
    );
  }

  override async writeText(path: string, text: string): Promise<void> {
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.writeText(path, text);
    } finally {
      await this.capture(path, startFiles);
    }
  }

  override async appendText(path: string, text: string): Promise<void> {
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.appendText(path, text);
    } finally {
      await this.capture(path, startFiles);
    }
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.writeBytes(path, data);
    } finally {
      await this.capture(path, startFiles);
    }
  }

  override async appendBytes(path: string, data: Uint8Array): Promise<void> {
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.appendBytes(path, data);
    } finally {
      await this.capture(path, startFiles);
    }
  }

  override async remove(path: string): Promise<void> {
    const startFiles = await markerStartFiles(this, path);
    try {
      await super.remove(path);
    } finally {
      await this.capture(path, startFiles);
    }
  }
}

class ReceiptRecheckCorruptingFS extends WizardFaultFS {
  private readonly expected: Uint8Array;
  private injected = false;
  injectedPath: string | null = null;
  initialVerificationReturnedExact = false;
  corruptionInjected = false;

  constructor(
    private readonly matches: (path: string) => boolean,
    expected: Uint8Array,
  ) {
    super(null);
    this.expected = new Uint8Array(expected);
  }

  override async readBytes(path: string): Promise<Uint8Array | null> {
    const bytes = await super.readBytes(path);
    if (!this.injected && bytesEqual(bytes, this.expected) && this.matches(path)) {
      const exactResult = new Uint8Array(bytes!);
      const corrupt = Uint8Array.from(bytes!, (value, index) => index === 0 ? value ^ 0xff : value);
      this.injected = true;
      this.injectedPath = path;
      await super.writeBytes(path, corrupt);
      this.corruptionInjected = true;
      this.initialVerificationReturnedExact = true;
      return exactResult;
    }
    return bytes;
  }
}

class SnapshotPauseFS extends WizardFaultFS {
  private paused = false;
  private releasePause: (() => void) | null = null;
  private reachPause: (() => void) | null = null;
  readonly reached = new Promise<void>((resolve) => {
    this.reachPause = resolve;
  });

  constructor() {
    super(null);
  }

  release(): void {
    this.releasePause?.();
    this.releasePause = null;
  }

  private async pauseBeforeFirstMutation(): Promise<void> {
    if (this.paused) return;
    this.paused = true;
    await new Promise<void>((resolve) => {
      this.releasePause = resolve;
      this.reachPause?.();
      this.reachPause = null;
    });
  }

  override async writeText(path: string, text: string): Promise<void> {
    await this.pauseBeforeFirstMutation();
    await super.writeText(path, text);
  }

  override async appendText(path: string, text: string): Promise<void> {
    await this.pauseBeforeFirstMutation();
    await super.appendText(path, text);
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    await this.pauseBeforeFirstMutation();
    await super.writeBytes(path, data);
  }

  override async appendBytes(path: string, data: Uint8Array): Promise<void> {
    await this.pauseBeforeFirstMutation();
    await super.appendBytes(path, data);
  }

  override async remove(path: string): Promise<void> {
    await this.pauseBeforeFirstMutation();
    await super.remove(path);
  }
}

async function projectDirs(fs: WorkspaceFS): Promise<string[]> {
  const markerSuffix = '/lociview.json';
  return (await fs.list('projects/'))
    .filter(isProjectListingMarkerPath)
    .map((path) => path.slice(0, -markerSuffix.length))
    .sort();
}

async function inspectWizardClosure(
  fs: ProjectWorkspaceFS,
  requireOptimized: boolean,
): Promise<WizardClosure> {
  const dirs = await projectDirs(fs);
  if (dirs.length === 0) {
    return {
      active: false,
      complete: false,
      safe: true,
      optimizedPresent: false,
      dir: null,
      projectId: null,
    };
  }
  if (dirs.length !== 1) {
    return {
      active: true,
      complete: false,
      safe: false,
      optimizedPresent: false,
      dir: null,
      projectId: null,
    };
  }
  const dir = dirs[0]!;
  let store: ProjectStore;
  try {
    store = await ProjectStore.open(fs, dir, USER);
  } catch {
    return {
      active: true,
      complete: false,
      safe: false,
      optimizedPresent: false,
      dir,
      projectId: null,
    };
  }

  const manifestText = await fs.readText(`${dir}/lociview.json`);
  let manifestExact = false;
  if (manifestText !== null) {
    try {
      const rawManifest = JSON.parse(manifestText) as unknown;
      const parsedManifest = parseManifest(manifestText);
      const createdAt = new Date(store.manifest.createdAt);
      manifestExact =
        isRecord(rawManifest) &&
        hasExactKeys(rawManifest, [
          'format',
          'schemaVersion',
          'projectId',
          'name',
          'createdAt',
          'generator',
        ]) &&
        isDeepStrictEqual(rawManifest, parsedManifest) &&
        isDeepStrictEqual(parsedManifest, store.manifest) &&
        store.manifest.format === MANIFEST_FORMAT &&
        store.manifest.schemaVersion === SCHEMA_VERSION &&
        /^prj_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(store.manifest.projectId) &&
        store.manifest.name === PROJECT_NAME &&
        !Number.isNaN(createdAt.getTime()) &&
        createdAt.toISOString() === store.manifest.createdAt &&
        store.manifest.generator === GENERATOR;
    } catch {
      manifestExact = false;
    }
  }

  const assets = visibleEntities(store.state, 'asset');
  const sets = visibleEntities(store.state, 'set');
  const profiles = visibleEntities(store.state, 'profile');
  const captions = visibleEntities(store.state, 'caption');
  const views = visibleEntities(store.state, 'view');
  const materials = visibleEntities(store.state, 'material');
  const model = assets.find((asset) => asset.fields.originalName === MODEL_NAME);
  const image = assets.find((asset) => asset.fields.originalName === IMAGE_NAME);
  const modelPath = model?.fields.path;
  const imagePath = image?.fields.path;
  const optimizedPath = model?.fields.optimizedPath;
  const optimizedPresent = typeof optimizedPath === 'string';
  const optimizedExact =
    optimizedPresent &&
    model !== undefined &&
    isOptimizedModelPath(`${dir}/${optimizedPath}`) &&
    optimizedPath !== modelPath &&
    model.fields.optimizedSize === OPTIMIZED_BYTES.length &&
    bytesEqual(await fs.readBytes(`${dir}/${optimizedPath}`), OPTIMIZED_BYTES);
  const optimizedAbsent =
    model?.fields.optimizedPath === undefined && model?.fields.optimizedSize === undefined;
  const optimizedSafe = optimizedExact || (!requireOptimized && optimizedAbsent);

  const expectedSetFields = { name: '標準', order: 1 };
  const expectedProfileFields = {
    displayName: USER.displayName ?? '',
    defaultPinColor: '#eab308',
  };
  const expectedModelFields = model === undefined
    ? null
    : {
        kind: 'model',
        path: modelPath,
        originalName: MODEL_NAME,
        mime: '',
        size: MODEL_BYTES.length,
        ...(optimizedExact
          ? {
              optimizedPath,
              optimizedSize: OPTIMIZED_BYTES.length,
            }
          : {}),
        transform: { scale: 1, upAxis: 'Y' },
        pinScale: 1,
      };
  const expectedImageFields = image === undefined
    ? null
    : {
        kind: 'image',
        path: imagePath,
        originalName: IMAGE_NAME,
        mime: '',
        size: IMAGE_BYTES.length,
      };

  const stateShapeExact =
    isDeepStrictEqual(Object.keys(store.state.byKind).sort(), ['asset', 'profile', 'set']) &&
    Object.keys(store.state.byKind.asset ?? {}).length === 2 &&
    Object.keys(store.state.byKind.set ?? {}).length === 1 &&
    Object.keys(store.state.byKind.profile ?? {}).length === 1 &&
    sets.length === 1 &&
    profiles.length === 1 &&
    profiles[0]?.id === USER.userId &&
    model !== undefined &&
    image !== undefined &&
    /^set_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(sets[0]!.id) &&
    /^ast_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(model.id) &&
    /^ast_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(image.id) &&
    model.id !== image.id &&
    typeof modelPath === 'string' &&
    isOriginalModelPath(`${dir}/${modelPath}`) &&
    typeof imagePath === 'string' &&
    isImagePath(`${dir}/${imagePath}`) &&
    isDeepStrictEqual(sets[0]!.fields, expectedSetFields) &&
    isDeepStrictEqual(profiles[0]!.fields, expectedProfileFields) &&
    isDeepStrictEqual(model.fields, expectedModelFields) &&
    isDeepStrictEqual(image.fields, expectedImageFields);

  const plannedEntities = stateShapeExact && model !== undefined && image !== undefined
    ? [
        { e: 'set', id: sets[0]!.id, v: expectedSetFields },
        { e: 'profile', id: USER.userId, v: expectedProfileFields },
        { e: 'asset', id: model.id, v: expectedModelFields },
        { e: 'asset', id: image.id, v: expectedImageFields },
      ]
    : [];
  const operationActors = [...new Set(store.allOps.map((op) => op.actor))];
  const actor = operationActors.length === 1 && /^a_[0-9A-HJKMNP-TV-Z]{13}$/u.test(operationActors[0]!)
    ? operationActors[0]!
    : null;
  const operationsExact =
    actor !== null &&
    store.allOps.length === plannedEntities.length &&
    plannedEntities.length === 4 &&
    store.allOps.every((op, index) => {
      const planned = plannedEntities[index]!;
      if (
        !hasExactKeys(op as unknown as Record<string, unknown>, [
          'op',
          'hlc',
          'actor',
          'user',
          't',
          'e',
          'id',
          'v',
        ]) ||
        op.op !== index + 1 ||
        op.actor !== actor ||
        op.user !== USER.userId ||
        op.t !== 'create' ||
        op.e !== planned.e ||
        op.id !== planned.id ||
        (index > 0 && store.allOps[index - 1]!.hlc >= op.hlc) ||
        !isDeepStrictEqual(op.v, planned.v)
      ) {
        return false;
      }
      try {
        const parsed = parseHlc(op.hlc);
        return parsed.actor === actor &&
          formatHlc(parsed.physical, parsed.counter, parsed.actor) === op.hlc;
      } catch {
        return false;
      }
    });

  const activeLogPaths = (await fs.list(`${dir}/ops/`))
    .filter((path) => isActiveLogPath(dir, path))
    .sort();
  const logText = activeLogPaths.length === 1 ? await fs.readText(activeLogPaths[0]!) : null;
  const parsedLog = logText === null ? null : parseOpsJsonl(logText);
  const activeLogExact =
    actor !== null &&
    isDeepStrictEqual(activeLogPaths, [`${dir}/ops/${actor}.jsonl`]) &&
    parsedLog !== null &&
    parsedLog.errors.length === 0 &&
    isDeepStrictEqual(parsedLog.ops, store.allOps);

  const modelBytesExact =
    model !== undefined &&
    typeof modelPath === 'string' &&
    isOriginalModelPath(`${dir}/${modelPath}`) &&
    bytesEqual(await fs.readBytes(`${dir}/${modelPath}`), MODEL_BYTES);
  const imageBytesExact =
    image !== undefined &&
    typeof imagePath === 'string' &&
    isImagePath(`${dir}/${imagePath}`) &&
    bytesEqual(await fs.readBytes(`${dir}/${imagePath}`), IMAGE_BYTES);
  const complete =
    manifestExact &&
    store.loadErrors.length === 0 &&
    /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(dir) &&
    stateShapeExact &&
    operationsExact &&
    vectorMatchesOps(store.vector, store.allOps) &&
    activeLogExact &&
    assets.length === 2 &&
    captions.length === 0 &&
    views.length === 0 &&
    materials.length === 0 &&
    modelBytesExact &&
    imageBytesExact &&
    optimizedSafe;
  return {
    active: true,
    complete,
    safe: complete,
    optimizedPresent,
    dir,
    projectId: store.manifest.projectId,
  };
}

function matchingFaultEvent(fs: WizardFaultFS): FaultEvent | undefined {
  return fs.events.find((event) =>
    event.path === fs.matchedPath && event.outcome === fs.expectedOutcome,
  );
}

async function markerStartsAfterActiveClosure(
  fs: FaultInjectingMemoryFS,
  closure: WizardClosure,
): Promise<boolean> {
  if (!closure.complete || closure.dir === null) return false;
  const store = await ProjectStore.open(fs, closure.dir, USER);
  const assets = visibleEntities(store.state, 'asset');
  const activePaths = [...new Set([
    ...(await fs.list(`${closure.dir}/ops/`))
      .filter((path) => isActiveLogPath(closure.dir!, path)),
    ...assets.flatMap((asset) => {
      const paths: string[] = [];
      if (typeof asset.fields.path === 'string') paths.push(`${closure.dir}/${asset.fields.path}`);
      if (typeof asset.fields.optimizedPath === 'string') {
        paths.push(`${closure.dir}/${asset.fields.optimizedPath}`);
      }
      return paths;
    }),
  ])];
  const markerPath = `${closure.dir}/lociview.json`;
  const markerEvents = fs.events.filter((event) =>
    event.path === markerPath && event.commitIndex !== null,
  );
  const closureEvents = activePaths.map((path) =>
    fs.events.filter((event) => event.path === path && event.commitIndex !== null),
  );
  if (
    markerEvents.length === 0 ||
    activePaths.length === 0 ||
    closureEvents.some((events) => events.length === 0)
  ) {
    return false;
  }
  const firstMarkerStart = Math.min(...markerEvents.map((event) => event.startIndex));
  const lastClosureCommit = Math.max(
    ...closureEvents.flatMap((events) => events.map((event) => event.commitIndex!)),
  );
  return lastClosureCommit < firstMarkerStart;
}

interface FinalMarkerAuthority {
  readonly dir: string;
  readonly markerPath: string;
  readonly manifest: unknown;
  readonly logs: ReadonlyMap<string, readonly Op[]>;
  readonly blobs: ReadonlyMap<string, Uint8Array>;
}

async function finalMarkerAuthority(
  fs: ProjectWorkspaceFS,
  closure: WizardClosure,
): Promise<FinalMarkerAuthority | null> {
  if (!closure.complete || closure.dir === null) return null;
  const markerPath = `${closure.dir}/lociview.json`;
  const markerText = await fs.readText(markerPath);
  if (markerText === null) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(markerText) as unknown;
  } catch {
    return null;
  }

  const logs = new Map<string, readonly Op[]>();
  const logPaths = (await fs.list(`${closure.dir}/ops/`))
    .filter((path) => isActiveLogPath(closure.dir!, path))
    .sort();
  for (const path of logPaths) {
    const text = await fs.readText(path);
    if (text === null) return null;
    const parsed = parseOpsJsonl(text);
    if (parsed.errors.length !== 0) return null;
    logs.set(path, parsed.ops);
  }

  const store = await ProjectStore.open(fs, closure.dir, USER);
  const blobPaths = new Set<string>();
  for (const asset of visibleEntities(store.state, 'asset')) {
    if (typeof asset.fields.path === 'string') blobPaths.add(`${closure.dir}/${asset.fields.path}`);
    if (typeof asset.fields.optimizedPath === 'string' && asset.fields.optimizedPath !== '') {
      blobPaths.add(`${closure.dir}/${asset.fields.optimizedPath}`);
    }
  }
  const blobs = new Map<string, Uint8Array>();
  for (const path of [...blobPaths].sort()) {
    const bytes = await fs.readBytes(path);
    if (bytes === null) return null;
    blobs.set(path, bytes);
  }
  return { dir: closure.dir, markerPath, manifest, logs, blobs };
}

function markerBytesAreExact(
  bytes: Uint8Array | null | undefined,
  expectedManifest: unknown,
): boolean {
  if (bytes === null || bytes === undefined) return false;
  try {
    return isDeepStrictEqual(
      JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      expectedManifest,
    );
  } catch {
    return false;
  }
}

function markerPointMatchesFinalAuthority(
  snapshot: MarkerPointSnapshot,
  authority: FinalMarkerAuthority,
  requireMarker: boolean,
): boolean {
  if (snapshot.path !== authority.markerPath) return false;
  const markerPaths = [...snapshot.files.keys()].filter(isProjectListingMarkerPath).sort();
  const markerPresent = markerPaths.length === 1 && markerPaths[0] === authority.markerPath;
  if (
    (requireMarker && !markerPresent) ||
    (!markerPresent && markerPaths.length !== 0) ||
    (markerPresent && !markerBytesAreExact(snapshot.files.get(authority.markerPath), authority.manifest))
  ) {
    return false;
  }

  const actualLogPaths = [...snapshot.files.keys()]
    .filter((path) => isActiveLogPath(authority.dir, path))
    .sort();
  const expectedLogPaths = [...authority.logs.keys()].sort();
  if (!isDeepStrictEqual(actualLogPaths, expectedLogPaths)) return false;
  for (const path of expectedLogPaths) {
    const bytes = snapshot.files.get(path);
    if (bytes === null || bytes === undefined) return false;
    const parsed = parseOpsJsonl(new TextDecoder().decode(bytes));
    if (parsed.errors.length !== 0 || !isDeepStrictEqual(parsed.ops, authority.logs.get(path))) {
      return false;
    }
  }
  for (const [path, expected] of authority.blobs) {
    if (!bytesEqual(snapshot.files.get(path) ?? null, expected)) return false;
  }
  return true;
}

async function closureFromMarkerSnapshot(
  files: ReadonlyMap<string, Uint8Array | null>,
): Promise<WizardClosure> {
  const snapshotFs = new MemoryFS();
  for (const [path, bytes] of files) {
    if (bytes !== null) await snapshotFs.writeBytes(path, bytes);
  }
  return inspectWizardClosure(snapshotFs, false);
}

async function markerSegmentIsSafe(
  start: MarkerPointSnapshot,
  commit: MarkerPointSnapshot,
): Promise<boolean> {
  if (start.eventStartIndex !== commit.eventStartIndex || start.path !== commit.path) return false;
  const committedMarkerPaths = [...commit.files.keys()].filter(isProjectListingMarkerPath).sort();
  if (committedMarkerPaths.length === 0) {
    const startMarkerPaths = [...start.files.keys()].filter(isProjectListingMarkerPath).sort();
    if (startMarkerPaths.length === 0) return true;
    if (startMarkerPaths.length !== 1 || startMarkerPaths[0] !== start.path) return false;
    const beforeRemoval = await closureFromMarkerSnapshot(start.files);
    return beforeRemoval.complete &&
      beforeRemoval.dir !== null &&
      start.path === `${beforeRemoval.dir}/lociview.json`;
  }
  if (committedMarkerPaths.length !== 1 || committedMarkerPaths[0] !== commit.path) return false;

  const committedClosure = await closureFromMarkerSnapshot(commit.files);
  if (!committedClosure.complete || committedClosure.dir === null) return false;
  const startMarkerPaths = [...start.files.keys()].filter(isProjectListingMarkerPath).sort();
  if (
    startMarkerPaths.length > 1 ||
    (startMarkerPaths.length === 1 && startMarkerPaths[0] !== commit.path)
  ) {
    return false;
  }
  const startFiles = new Map(start.files);
  if (startMarkerPaths.length === 0) {
    const markerBytes = commit.files.get(commit.path);
    if (markerBytes === null || markerBytes === undefined) return false;
    startFiles.set(commit.path, markerBytes);
  }
  const startClosure = await closureFromMarkerSnapshot(startFiles);
  return startClosure.complete &&
    startClosure.dir === committedClosure.dir &&
    startClosure.projectId === committedClosure.projectId;
}

function markerSegmentsKeepAuthorityInactiveDuringMutation(
  fs: MarkerHistoryFS,
  commitsByStart: ReadonlyMap<number, MarkerPointSnapshot>,
): boolean {
  let activeDir: string | null = null;
  const committedEvents = fs.events
    .filter((event) => event.commitIndex !== null)
    .sort((left, right) => left.commitIndex! - right.commitIndex!);
  for (const event of committedEvents) {
    if (isProjectListingMarkerPath(event.path)) {
      const snapshot = commitsByStart.get(event.startIndex);
      if (snapshot === undefined) return false;
      const markers = [...snapshot.files.keys()].filter(isProjectListingMarkerPath);
      activeDir = markers.length === 1
        ? markers[0]!.slice(0, -'/lociview.json'.length)
        : null;
      continue;
    }
    if (
      activeDir !== null &&
      (
        event.path.startsWith(`${activeDir}/ops/`) ||
        event.path.startsWith(`${activeDir}/models/`) ||
        event.path.startsWith(`${activeDir}/media/`)
      )
    ) {
      return false;
    }
  }
  return true;
}

async function publicationHistoryIsSafe(
  fs: MarkerHistoryFS,
  closure: WizardClosure,
): Promise<boolean> {
  const markerEvents = fs.events.filter((event) => isProjectListingMarkerPath(event.path));
  const committedEvents = markerEvents.filter((event) => event.commitIndex !== null);
  if (
    fs.markerStarts.length !== markerEvents.length ||
    fs.markerCommits.length !== committedEvents.length
  ) {
    return false;
  }
  const startsByStart = new Map(fs.markerStarts.map((snapshot) => [snapshot.eventStartIndex, snapshot]));
  const commitsByStart = new Map(fs.markerCommits.map((snapshot) => [snapshot.eventStartIndex, snapshot]));
  if (startsByStart.size !== fs.markerStarts.length || commitsByStart.size !== fs.markerCommits.length) {
    return false;
  }
  for (const event of committedEvents) {
    const start = startsByStart.get(event.startIndex);
    const commit = commitsByStart.get(event.startIndex);
    if (start === undefined || commit === undefined || !await markerSegmentIsSafe(start, commit)) {
      return false;
    }
  }
  if (!markerSegmentsKeepAuthorityInactiveDuringMutation(fs, commitsByStart)) return false;
  if (!closure.active) return true;

  const authority = await finalMarkerAuthority(fs, closure);
  if (authority === null) return false;
  const finalActivationEvent = [...committedEvents]
    .sort((left, right) => right.commitIndex! - left.commitIndex!)
    .find((event) => commitsByStart.get(event.startIndex)?.files.has(authority.markerPath));
  if (finalActivationEvent === undefined) return false;
  const finalStart = startsByStart.get(finalActivationEvent.startIndex);
  const finalCommit = commitsByStart.get(finalActivationEvent.startIndex);
  return finalStart !== undefined &&
    finalCommit !== undefined &&
    markerPointMatchesFinalAuthority(finalStart, authority, false) &&
    markerPointMatchesFinalAuthority(finalCommit, authority, true);
}

function resultMatchesClosure(result: ImportResult, closure: WizardClosure): boolean {
  return closure.complete &&
    closure.dir !== null &&
    closure.projectId !== null &&
    isDeepStrictEqual(result, {
      dir: closure.dir,
      projectId: closure.projectId,
      captionCount: 0,
      setCount: 1,
      linkedImages: 0,
      unlinkedImages: 0,
      chromaDisabledCount: 0,
    });
}

function outcomeMatchesClosure(
  outcome: ImportActionOutcome,
  closure: WizardClosure,
): boolean {
  if (outcome.status === 'fulfilled') return resultMatchesClosure(outcome.result, closure);
  return !closure.active || closure.complete;
}

async function settleImport(
  fs: FaultInjectingMemoryFS,
  plan: ImportPlan,
): Promise<{
  outcome: ImportActionOutcome;
  optimizerInputExact: boolean;
  optimizerCallCount: number;
}> {
  let optimizerInputExact = true;
  let optimizerCallCount = 0;
  let outcome: ImportActionOutcome;
  try {
    const result = await applyImportPlan(fs, USER, plan, {
      projectName: PROJECT_NAME,
      optimizeModel: async (bytes) => {
        optimizerCallCount++;
        optimizerInputExact = optimizerInputExact && bytesEqual(bytes, MODEL_BYTES);
        return new Uint8Array(OPTIMIZED_BYTES);
      },
    });
    outcome = { status: 'fulfilled', result };
  } catch {
    outcome = { status: 'rejected', result: null };
  }
  await fs.settleProbes();
  await Promise.resolve();
  return { outcome, optimizerInputExact, optimizerCallCount };
}

const FAULT_ROWS: ReadonlyArray<{
  boundary: WizardFaultBoundary;
  outcome: FaultOutcome;
}> = [
  { boundary: 'root-marker-after', outcome: 'commit-then-throw' },
  { boundary: 'root-marker-prefix', outcome: 'write-prefix-then-throw' },
  { boundary: 'initial-log-prefix', outcome: 'write-prefix-then-throw' },
  { boundary: 'optimized-blob-prefix', outcome: 'write-prefix-then-throw' },
  { boundary: 'image-blob-prefix', outcome: 'write-prefix-then-throw' },
  { boundary: 'final-asset-log-prefix', outcome: 'write-prefix-then-throw' },
];

describe.sequential('G0S-BLOB import-wizard publication closure', () => {
  let successInputShapeValid = false;
  let successOptimizerInputExact = false;
  let successComplete = false;
  let vectorOracleSelfValid = false;
  let markerPointOracleSelfValid = false;
  let markerLast = false;
  let faultResults: Record<WizardFaultBoundary, WizardFaultResult>;
  let resolvedResults: Record<ResolvedWriteRole, ResolvedWriteResult>;
  let receiptRecheckResults: Record<ReceiptRecheckRole, ReceiptRecheckResult>;
  let snapshotResult: SnapshotResult;

  beforeAll(async () => {
    const successFs = new WizardFaultFS(null);
    const successPlan = freshPlan();
    successInputShapeValid = planShapeIsExact(successPlan);
    const success = await settleImport(successFs, successPlan);
    successOptimizerInputExact = success.optimizerInputExact;
    const successClosure = await inspectWizardClosure(successFs, true);
    successComplete = success.outcome.status === 'fulfilled' &&
      resultMatchesClosure(success.outcome.result, successClosure) &&
      successClosure.optimizedPresent &&
      success.optimizerCallCount === 1;
    const vectorActor = 'a_0000000000000';
    const vectorOps = [
      { actor: vectorActor, op: 1 },
      { actor: vectorActor, op: 4 },
    ];
    vectorOracleSelfValid =
      vectorMatchesOps({ [vectorActor]: 4 }, vectorOps) &&
      !vectorMatchesOps({ [vectorActor]: 3 }, vectorOps) &&
      !vectorMatchesOps({ [vectorActor]: 4, a_0000000000001: 1 }, vectorOps);
    const successAuthority = await finalMarkerAuthority(successFs, successClosure);
    const successStart = successFs.markerStarts.find((snapshot) =>
      successFs.events.some((event) =>
        event.path === snapshot.path &&
        event.startIndex === snapshot.eventStartIndex &&
        event.commitIndex !== null,
      ),
    );
    const successCommit = successFs.markerCommits[0];
    if (successAuthority !== null && successStart !== undefined && successCommit !== undefined) {
      const extraLogFiles = new Map(successStart.files);
      extraLogFiles.set(
        `${successAuthority.dir}/ops/stage/a_0000000000000.jsonl`,
        new Uint8Array(),
      );
      const corruptBlobFiles = new Map(successStart.files);
      const firstBlob = successAuthority.blobs.entries().next().value as
        | [string, Uint8Array]
        | undefined;
      if (firstBlob !== undefined) {
        corruptBlobFiles.set(
          firstBlob[0],
          Uint8Array.from(firstBlob[1], (value, index) => index === 0 ? value ^ 0xff : value),
        );
      }
      const privateOrphanFiles = new Map(successStart.files);
      privateOrphanFiles.set(
        `${successAuthority.dir}/staging/private-orphan.bin`,
        new Uint8Array([0x70]),
      );
      const corruptMarkerFiles = new Map(successCommit.files);
      corruptMarkerFiles.set(successAuthority.markerPath, new Uint8Array([0x7b, 0x22, 0x66]));
      const otherProjectMarkerFiles = new Map(successStart.files);
      const exactMarkerBytes = successCommit.files.get(successAuthority.markerPath);
      if (exactMarkerBytes !== null && exactMarkerBytes !== undefined) {
        otherProjectMarkerFiles.set(
          `projects/meta_${'0'.repeat(25)}1/lociview.json`,
          exactMarkerBytes,
        );
      }
      const deactivationStart: MarkerPointSnapshot = {
        ...successCommit,
        eventStartIndex: successCommit.eventStartIndex + 1_000,
      };
      const deactivationFiles = new Map(deactivationStart.files);
      deactivationFiles.delete(successAuthority.markerPath);
      const deactivationCommit: MarkerPointSnapshot = {
        ...deactivationStart,
        files: deactivationFiles,
      };
      const noOpRemovalStart: MarkerPointSnapshot = {
        ...deactivationCommit,
        eventStartIndex: deactivationCommit.eventStartIndex + 1,
      };
      const noOpRemovalCommit: MarkerPointSnapshot = { ...noOpRemovalStart };
      const replayBlobPath = firstBlob?.[0] ?? `${successAuthority.dir}/models/unreachable.glb`;
      const activeMutationFs = new WizardFaultFS(null);
      activeMutationFs.events.push(
        {
          startIndex: 1,
          commitIndex: 2,
          method: 'writeBytes',
          path: successAuthority.markerPath,
          outcome: 'pass',
        },
        { startIndex: 3, commitIndex: 4, method: 'writeBytes', path: replayBlobPath, outcome: 'pass' },
      );
      const activeCommit = { ...successCommit, eventStartIndex: 1 };
      activeMutationFs.markerCommits.push(activeCommit);
      const inactiveRepairFs = new WizardFaultFS(null);
      inactiveRepairFs.events.push(
        {
          startIndex: 1,
          commitIndex: 2,
          method: 'writeBytes',
          path: successAuthority.markerPath,
          outcome: 'pass',
        },
        {
          startIndex: 3,
          commitIndex: 4,
          method: 'remove',
          path: successAuthority.markerPath,
          outcome: 'pass',
        },
        { startIndex: 5, commitIndex: 6, method: 'writeBytes', path: replayBlobPath, outcome: 'pass' },
        {
          startIndex: 7,
          commitIndex: 8,
          method: 'writeBytes',
          path: successAuthority.markerPath,
          outcome: 'pass',
        },
      );
      const inactiveCommit = { ...deactivationCommit, eventStartIndex: 3 };
      const reactivationCommit = { ...successCommit, eventStartIndex: 7 };
      inactiveRepairFs.markerCommits.push(activeCommit, inactiveCommit, reactivationCommit);
      markerPointOracleSelfValid =
        markerPointMatchesFinalAuthority(successStart, successAuthority, false) &&
        markerPointMatchesFinalAuthority(successCommit, successAuthority, true) &&
        !markerPointMatchesFinalAuthority(
          { ...successCommit, files: corruptMarkerFiles },
          successAuthority,
          true,
        ) &&
        exactMarkerBytes !== null &&
        exactMarkerBytes !== undefined &&
        !markerPointMatchesFinalAuthority(
          { ...successStart, files: otherProjectMarkerFiles },
          successAuthority,
          false,
        ) &&
        !markerPointMatchesFinalAuthority(
          { ...successStart, files: extraLogFiles },
          successAuthority,
          false,
        ) &&
        firstBlob !== undefined &&
        !markerPointMatchesFinalAuthority(
          { ...successStart, files: corruptBlobFiles },
          successAuthority,
          false,
        ) &&
        markerPointMatchesFinalAuthority(
          { ...successStart, files: privateOrphanFiles },
          successAuthority,
          false,
        ) &&
        await markerSegmentIsSafe(deactivationStart, deactivationCommit) &&
        await markerSegmentIsSafe(noOpRemovalStart, noOpRemovalCommit) &&
        firstBlob !== undefined &&
        !markerSegmentsKeepAuthorityInactiveDuringMutation(
          activeMutationFs,
          new Map([[1, activeCommit]]),
        ) &&
        markerSegmentsKeepAuthorityInactiveDuringMutation(
          inactiveRepairFs,
          new Map([
            [1, activeCommit],
            [3, inactiveCommit],
            [7, reactivationCommit],
          ]),
        );
    }
    markerLast = await markerStartsAfterActiveClosure(successFs, successClosure);

    faultResults = {} as Record<WizardFaultBoundary, WizardFaultResult>;
    for (const row of FAULT_ROWS) {
      const fs = new WizardFaultFS(row.boundary);
      const plan = freshPlan();
      const inputShapeValid = planShapeIsExact(plan);
      const action = await settleImport(fs, plan);
      fs.assertAllConsumed();
      const event = matchingFaultEvent(fs);
      const closure = await inspectWizardClosure(
        fs,
        row.boundary !== 'optimized-blob-prefix',
      );
      faultResults[row.boundary] = {
        inputShapeValid,
        faultReached:
          event !== undefined &&
          event.outcome === row.outcome &&
          event.path === fs.matchedPath,
        closureSafe: closure.safe,
        outcomeBound: outcomeMatchesClosure(action.outcome, closure),
        publicationHistorySafe: await publicationHistoryIsSafe(fs, closure),
      };
    }

    const resolvedRows: ReadonlyArray<{
      role: ResolvedWriteRole;
      expected: Uint8Array;
      matches: (path: string) => boolean;
    }> = [
      { role: 'original-model', expected: MODEL_BYTES, matches: isOriginalModelPath },
      { role: 'optimized-model', expected: OPTIMIZED_BYTES, matches: isOptimizedModelPath },
      { role: 'image-media', expected: IMAGE_BYTES, matches: isImagePath },
    ];
    resolvedResults = {} as Record<ResolvedWriteRole, ResolvedWriteResult>;
    for (const row of resolvedRows) {
      const fs = new WizardResolvedCorruptingMemoryFS(row.matches, row.expected, 'bitflip');
      const plan = freshPlan();
      const inputShapeValid = planShapeIsExact(plan);
      let optimizerInputExact = true;
      let outcome: ImportActionOutcome;
      fs.beginAction();
      try {
        const result = await applyImportPlan(fs, USER, plan, {
          projectName: PROJECT_NAME,
          optimizeModel: async (bytes) => {
            optimizerInputExact = optimizerInputExact && bytesEqual(bytes, MODEL_BYTES);
            return new Uint8Array(OPTIMIZED_BYTES);
          },
        });
        outcome = { status: 'fulfilled', result };
      } catch {
        outcome = { status: 'rejected', result: null };
      } finally {
        fs.endAction();
      }
      await fs.settleProbes();
      const closure = await inspectWizardClosure(fs, row.role !== 'optimized-model');
      resolvedResults[row.role] = {
        inputShapeValid,
        optimizerInputExact,
        faultReached:
          fs.injectionCount === 1 &&
          fs.injectedPath !== null &&
          fs.requestedWrites.some((bytes) => bytesEqual(bytes, row.expected)),
        verificationObserved:
          fs.corruptBytes !== null &&
          fs.verificationReads.some((bytes) => bytesEqual(bytes, fs.corruptBytes!)),
        closureSafe: closure.safe,
        outcomeBound: outcomeMatchesClosure(outcome, closure),
        publicationHistorySafe: await publicationHistoryIsSafe(fs, closure),
      };
    }

    const receiptRows: ReadonlyArray<{
      role: ReceiptRecheckRole;
      expected: Uint8Array;
      matches: (path: string) => boolean;
    }> = [
      { role: 'original-model', expected: MODEL_BYTES, matches: isOriginalModelPath },
      { role: 'optimized-model', expected: OPTIMIZED_BYTES, matches: isOptimizedModelPath },
      { role: 'image-media', expected: IMAGE_BYTES, matches: isImagePath },
    ];
    receiptRecheckResults = {} as Record<ReceiptRecheckRole, ReceiptRecheckResult>;
    for (const row of receiptRows) {
      const fs = new ReceiptRecheckCorruptingFS(row.matches, row.expected);
      const plan = freshPlan();
      const inputShapeValid = planShapeIsExact(plan);
      const action = await settleImport(fs, plan);
      const closure = await inspectWizardClosure(fs, row.role !== 'optimized-model');
      receiptRecheckResults[row.role] = {
        inputShapeValid,
        initialVerificationReturnedExact: fs.initialVerificationReturnedExact,
        corruptionInjected: fs.corruptionInjected && fs.injectedPath !== null,
        closureSafe: closure.safe,
        outcomeBound: outcomeMatchesClosure(action.outcome, closure),
        publicationHistorySafe: await publicationHistoryIsSafe(fs, closure),
      };
    }

    const snapshotFs = new SnapshotPauseFS();
    const snapshotPlan = freshPlan();
    const originalModelFile = snapshotPlan.models[0]!;
    const originalImageFile = snapshotPlan.images[0]!;
    const originalModelData = originalModelFile.data;
    const originalImageData = originalImageFile.data;
    const snapshotIdentity: Identity = { ...USER };
    const snapshotInputShapeValid = planShapeIsExact(snapshotPlan);
    let snapshotOptimizerInputExact = true;
    let snapshotOptimizerCallCount = 0;
    const snapshotOptions: {
      projectName: string;
      optimizeModel: (bytes: Uint8Array) => Promise<Uint8Array | null>;
    } = {
      projectName: PROJECT_NAME,
      optimizeModel: async (bytes) => {
        snapshotOptimizerCallCount++;
        snapshotOptimizerInputExact = snapshotOptimizerInputExact && bytesEqual(bytes, MODEL_BYTES);
        return new Uint8Array(OPTIMIZED_BYTES);
      },
    };
    const snapshotAction = applyImportPlan(snapshotFs, snapshotIdentity, snapshotPlan, snapshotOptions);
    originalModelFile.path = 'source/mutated-alias.glb';
    originalModelFile.name = 'mutated-alias.glb';
    originalModelData.fill(0x6d);
    originalModelFile.data = new TextEncoder().encode('replacement model alias');
    originalImageFile.path = 'source/mutated-alias.png';
    originalImageFile.name = 'mutated-alias.png';
    originalImageData.fill(0x69);
    originalImageFile.data = new TextEncoder().encode('replacement image alias');
    snapshotPlan.models.splice(0, snapshotPlan.models.length, {
      path: 'source/mutated.glb',
      name: 'mutated.glb',
      data: new TextEncoder().encode('mutated model bytes'),
    });
    snapshotPlan.images.splice(0, snapshotPlan.images.length, {
      path: 'source/mutated.png',
      name: 'mutated.png',
      data: new TextEncoder().encode('mutated image bytes'),
    });
    snapshotPlan.fileIdMap.set('mutated', 'mutated.png');
    snapshotPlan.migration = structuredClone({
      sets: [],
      views: [],
      materials: [],
      unlinkedImages: new Map(),
      gidToSetName: new Map(),
      gidMappingIsGuess: false,
      warnings: ['mutated'],
    });
    snapshotOptions.projectName = 'mutated project name';
    snapshotOptions.optimizeModel = async () => new TextEncoder().encode('mutated optimized bytes');
    snapshotIdentity.userId = 'usr_00000000000000000000000081';
    snapshotIdentity.deviceId = 'dev_00000000000000000000000081';
    snapshotIdentity.displayName = 'mutated identity';
    await snapshotFs.reached;
    const pauseBeforeEffects = snapshotFs.events.length === 0 && snapshotOptimizerCallCount === 0;
    snapshotFs.release();
    let snapshotOutcome: ImportActionOutcome;
    try {
      snapshotOutcome = { status: 'fulfilled', result: await snapshotAction };
    } catch {
      snapshotOutcome = { status: 'rejected', result: null };
    }
    await snapshotFs.settleProbes();
    const snapshotClosure = await inspectWizardClosure(snapshotFs, true);
    snapshotResult = {
      inputShapeValid: snapshotInputShapeValid,
      pauseReached: true,
      pauseBeforeEffects,
      optimizerInputExact: snapshotOptimizerInputExact,
      outcomeBound: outcomeMatchesClosure(snapshotOutcome, snapshotClosure),
      closureSafe: snapshotClosure.safe,
      publicationHistorySafe: await publicationHistoryIsSafe(snapshotFs, snapshotClosure),
    };
  }, 30_000);

  it('uses fresh one-model/one-image bytes and completes the exact optimized success closure', () => {
    expect({
      successInputShapeValid,
      successOptimizerInputExact,
      successComplete,
      vectorOracleSelfValid,
      markerPointOracleSelfValid,
    }).toEqual({
      successInputShapeValid: true,
      successOptimizerInputExact: true,
      successComplete: true,
      vectorOracleSelfValid: true,
      markerPointOracleSelfValid: true,
    });
  });

  it('starts the root completion marker only after every active log and referenced blob commit', () => {
    expect(markerLast).toBe(true);
  });

  for (const row of FAULT_ROWS) {
    describe(row.boundary, () => {
      it('uses a fresh exact input and reaches the intended semantic write boundary', () => {
        expect({
          inputShapeValid: faultResults[row.boundary].inputShapeValid,
          faultReached: faultResults[row.boundary].faultReached,
        }).toEqual({ inputShapeValid: true, faultReached: true });
      });

      const assertSafety = (): void => {
        expect({
          closureSafe: faultResults[row.boundary].closureSafe,
          outcomeBound: faultResults[row.boundary].outcomeBound,
          publicationHistorySafe: faultResults[row.boundary].publicationHistorySafe,
        }).toEqual({
          closureSafe: true,
          outcomeBound: true,
          publicationHistorySafe: true,
        });
      };
      if (row.boundary === 'root-marker-prefix') {
        it.fails('leaves no completion marker or an exact reopenable planned closure', assertSafety);
      } else {
        it('leaves no completion marker or an exact reopenable planned closure', assertSafety);
      }
    });
  }

  for (const role of ['original-model', 'optimized-model', 'image-media'] as const) {
    it(`${role}: observes resolved wrong bytes and publishes only inactive or exact complete authority`, () => {
      expect(resolvedResults[role]).toEqual({
        inputShapeValid: true,
        optimizerInputExact: true,
        faultReached: true,
        verificationObserved: true,
        closureSafe: true,
        outcomeBound: true,
        publicationHistorySafe: true,
      });
    });
  }

  it('rechecks every referenced write role before activation after an exact initial verification', () => {
    expect(receiptRecheckResults).toEqual({
      'original-model': {
        inputShapeValid: true,
        initialVerificationReturnedExact: true,
        corruptionInjected: true,
        closureSafe: true,
        outcomeBound: true,
        publicationHistorySafe: true,
      },
      'optimized-model': {
        inputShapeValid: true,
        initialVerificationReturnedExact: true,
        corruptionInjected: true,
        closureSafe: true,
        outcomeBound: true,
        publicationHistorySafe: true,
      },
      'image-media': {
        inputShapeValid: true,
        initialVerificationReturnedExact: true,
        corruptionInjected: true,
        closureSafe: true,
        outcomeBound: true,
        publicationHistorySafe: true,
      },
    });
  });

  it('uses one call-time plan snapshot while asynchronous initialization is paused', () => {
    expect(snapshotResult).toEqual({
      inputShapeValid: true,
      pauseReached: true,
      pauseBeforeEffects: true,
      optimizerInputExact: true,
      outcomeBound: true,
      closureSafe: true,
      publicationHistorySafe: true,
    });
  });
});
