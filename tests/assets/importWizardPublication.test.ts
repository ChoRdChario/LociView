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
import type { WorkspaceFS } from '../../src/platform/fs';
import {
  FaultInjectingMemoryFS,
  type FaultEvent,
  type FaultOutcome,
} from '../helpers/faultFs';

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
  safety: boolean;
}

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
  return /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}\/models\/ast_[0-7][0-9A-HJKMNP-TV-Z]{25}\.opt\.glb$/.test(path);
}

function isImagePath(path: string): boolean {
  return /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}\/media\/ast_[0-7][0-9A-HJKMNP-TV-Z]{25}\.png$/.test(path);
}

function isRootMarkerPath(path: string): boolean {
  return /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}\/lociview\.json$/.test(path);
}

function isProjectListingMarkerPath(path: string): boolean {
  return path.startsWith('projects/') && path.endsWith('/lociview.json');
}

class WizardFaultFS extends FaultInjectingMemoryFS {
  private armed = false;
  matchedPath: string | null = null;
  expectedOutcome: FaultOutcome | null = null;

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
    await super.writeText(path, text);
  }

  override async appendText(path: string, text: string): Promise<void> {
    this.armForPayload(path, text);
    await super.appendText(path, text);
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.armForPayload(path, data);
    await super.writeBytes(path, data);
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
  fs: WorkspaceFS,
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
    optimizedPath === `models/${model.id}.opt.glb` &&
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
        path: `models/${model.id}.glb`,
        originalName: MODEL_NAME,
        mime: '',
        size: MODEL_BYTES.length,
        ...(optimizedExact
          ? {
              optimizedPath: `models/${model.id}.opt.glb`,
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
        path: `media/${image.id}.png`,
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
    .filter((path) => path.endsWith('.jsonl'))
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
    modelPath === `models/${model.id}.glb` &&
    bytesEqual(await fs.readBytes(`${dir}/${modelPath}`), MODEL_BYTES);
  const imageBytesExact =
    image !== undefined &&
    imagePath === `media/${image.id}.png` &&
    bytesEqual(await fs.readBytes(`${dir}/${imagePath}`), IMAGE_BYTES);
  const complete =
    manifestExact &&
    store.loadErrors.length === 0 &&
    /^projects\/meta_[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(dir) &&
    stateShapeExact &&
    operationsExact &&
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
  fs: WizardFaultFS,
  closure: WizardClosure,
): Promise<boolean> {
  if (!closure.complete || closure.dir === null) return false;
  const store = await ProjectStore.open(fs, closure.dir, USER);
  const assets = visibleEntities(store.state, 'asset');
  const activePaths = [
    ...(await fs.list(`${closure.dir}/ops/`)).filter((path) => path.endsWith('.jsonl')),
    ...assets.flatMap((asset) => {
      const paths: string[] = [];
      if (typeof asset.fields.path === 'string') paths.push(`${closure.dir}/${asset.fields.path}`);
      if (typeof asset.fields.optimizedPath === 'string') {
        paths.push(`${closure.dir}/${asset.fields.optimizedPath}`);
      }
      return paths;
    }),
  ];
  const markerPath = `${closure.dir}/lociview.json`;
  const markerEvents = fs.events.filter((event) => event.path === markerPath);
  const closureEvents = activePaths.map((path) => fs.events.filter((event) => event.path === path));
  if (
    markerEvents.length === 0 ||
    activePaths.length === 0 ||
    closureEvents.some((events) => events.length === 0 || events.some((event) => event.commitIndex === null))
  ) {
    return false;
  }
  const firstMarkerStart = Math.min(...markerEvents.map((event) => event.startIndex));
  const lastClosureCommit = Math.max(
    ...closureEvents.flatMap((events) => events.map((event) => event.commitIndex!)),
  );
  return lastClosureCommit < firstMarkerStart;
}

async function settleImport(
  fs: WizardFaultFS,
  plan: ImportPlan,
): Promise<{ result: ImportResult | null; optimizerInputExact: boolean }> {
  let optimizerInputExact = true;
  let result: ImportResult | null = null;
  try {
    result = await applyImportPlan(fs, USER, plan, {
      projectName: PROJECT_NAME,
      optimizeModel: async (bytes) => {
        optimizerInputExact = optimizerInputExact && bytesEqual(bytes, MODEL_BYTES);
        return new Uint8Array(OPTIMIZED_BYTES);
      },
    });
  } catch {
    // Throw versus return is intentionally outside the safety oracle.
  }
  await fs.settleProbes();
  await Promise.resolve();
  return { result, optimizerInputExact };
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
  let markerLast = false;
  let faultResults: Record<WizardFaultBoundary, WizardFaultResult>;

  beforeAll(async () => {
    const successFs = new WizardFaultFS(null);
    const successPlan = freshPlan();
    successInputShapeValid = planShapeIsExact(successPlan);
    const success = await settleImport(successFs, successPlan);
    successOptimizerInputExact = success.optimizerInputExact;
    const successClosure = await inspectWizardClosure(successFs, true);
    successComplete =
      success.result !== null &&
      isDeepStrictEqual(success.result, {
        dir: successClosure.dir,
        projectId: successClosure.projectId,
        captionCount: 0,
        setCount: 1,
        linkedImages: 0,
        unlinkedImages: 0,
        chromaDisabledCount: 0,
      }) &&
      successClosure.complete &&
      successClosure.optimizedPresent;
    markerLast = await markerStartsAfterActiveClosure(successFs, successClosure);

    faultResults = {} as Record<WizardFaultBoundary, WizardFaultResult>;
    for (const row of FAULT_ROWS) {
      const fs = new WizardFaultFS(row.boundary);
      const plan = freshPlan();
      const inputShapeValid = planShapeIsExact(plan);
      await settleImport(fs, plan);
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
        safety: closure.safe,
      };
    }
  }, 30_000);

  it('uses fresh one-model/one-image bytes and completes the exact optimized success closure', () => {
    expect({
      successInputShapeValid,
      successOptimizerInputExact,
      successComplete,
    }).toEqual({
      successInputShapeValid: true,
      successOptimizerInputExact: true,
      successComplete: true,
    });
  });

  it.fails('starts the root completion marker only after every active log and referenced blob commit', () => {
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

      it.fails('leaves no completion marker or an exact reopenable planned closure', () => {
        expect(faultResults[row.boundary].safety).toBe(true);
      });
    });
  }
});
