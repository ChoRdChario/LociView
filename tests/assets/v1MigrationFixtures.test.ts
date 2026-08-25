import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyImportPlan, buildImportPlan, type ImportPlan } from '../../src/assets/importWizard';
import {
  exportProjectZip,
  importNewProject,
  inspectZip,
  mergeFromInspection,
  type ZipInspection,
} from '../../src/assets/package';
import { readZipEntries, writeZipEntries, type ZipEntryData } from '../../src/assets/zipio';
import { isVisible, visibleEntities, type ProjectState } from '../../src/core/reduce';
import { parseOpsJsonl } from '../../src/core/jsonl';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import { analyzeLociMyuSheets, type SheetTable } from '../../src/io/locimyu';
import { MemoryFS } from '../../src/platform/fs';
import { makeXlsx } from '../helpers/makeXlsx';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = resolve(repositoryRoot, 'fixtures/v1-migration');

interface EntryOracle {
  path: string;
  byteSize: number;
  sha256: string;
  role?: string;
}

interface TransportArtifactOracle {
  path: string;
  byteSize: number;
  sha256: string;
  entries: EntryOracle[];
}

interface AuthoredSheet {
  name: string;
  rows: Array<Array<string | { number: string }>>;
}

interface SourceOracle {
  locimyu: {
    output: string;
    primary: { path: string; sheets: AuthoredSheet[] };
    backup: { path: string; sheets: AuthoredSheet[] };
  };
  native: {
    outputs: { base: string; branchA: string; branchB: string };
    manifest: {
      format: 'lociview-project';
      schemaVersion: number;
      projectId: string;
      name: string;
      createdAt: string;
      generator: string;
    };
  };
}

interface AssetBlobOracle {
  kind: string;
  originalName: string;
  byteSize: number;
  sha256: string;
}

interface ExpectedCaption {
  legacyId: string;
  captionId: string;
  title: string;
  body: string;
  color: string;
  position: [number, number, number] | null;
  legacyImageFileId: string | null;
}

interface ExpectedLociMyu {
  sources: Array<{ fileName: string; looksLikeBackup: boolean; captionCount: number }>;
  selectedSource: string;
  modelNames: string[];
  imageNames: string[];
  fileIdMap: Array<[string, string]>;
  numericGidEvidence: { raw: string; normalized: string };
  gidMappingIsGuess: boolean;
  sets: Array<{ name: string; legacyGid: string | null; captions: ExpectedCaption[] }>;
  views: Array<{
    name: string;
    sheetGid: string;
    background: string | null;
    eye: [number, number, number];
    target: [number, number, number];
    up: [number, number, number];
    fov: number;
    ortho: boolean;
  }>;
  materials: Array<{
    sheetGid: string;
    materialKey: string;
    opacity: number;
    doubleSided: boolean;
    unlitLike: boolean;
    chroma: { enable: boolean; color: string; tolerance: number; feather: number } | null;
  }>;
  unlinkedImageReferences: Array<[string, string[]]>;
  apply: {
    captionCount: number;
    setCount: number;
    linkedImages: number;
    unlinkedImages: number;
    chromaDisabledCount: number;
    selectedTitles: string[];
    rejectedBackupTitle: string;
  };
  warnings?: string[];
  migratedState: unknown;
}

interface ExpectedNative {
  projectId: string;
  rawProbe: { path: string; line: string };
  baseVector: Record<string, number>;
  branchAVector: Record<string, number>;
  branchBVector: Record<string, number>;
  mergedVector: Record<string, number>;
  visibleCounts: Record<string, number>;
  surfaceCaption: { id: string; body: string; color: string };
  unplacedCaption: { id: string; title: string; futureSafe: unknown; hasAnchor: boolean };
  tombstoneCaptionId: string;
  binaryUnion: EntryOracle[];
  staleMarker: string;
  baseState: unknown;
  branchAState: unknown;
  branchBState: unknown;
  convergedState: unknown;
}

interface ExpectedOracle {
  transport: { artifacts: TransportArtifactOracle[] };
  locimyu: ExpectedLociMyu;
  native: ExpectedNative;
}

interface CaptionIdentityVectorOracle {
  vectorId: string;
  identityKey: {
    legacyId: string;
    occurrence: number;
    sheetIdentity: { kind: 'legacyGid' | 'sheetName'; value: string };
  };
  fullDigest: string;
  captionId: string;
}

interface CaptionIdentityExpectedOracle {
  recipeId: 'locimyu-caption-id-2';
  vectors: CaptionIdentityVectorOracle[];
  fixtureCaptions: Array<{
    setName: string;
    historicalCaptionId: string;
    vectorId: string;
  }>;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readFixtureBytes(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve(fixtureRoot, relativePath)));
}

async function readFixtureJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(resolve(fixtureRoot, relativePath), 'utf8')) as T;
}

function transportArtifact(expected: ExpectedOracle, path: string): TransportArtifactOracle {
  const artifact = expected.transport.artifacts.find((candidate) => candidate.path === path);
  if (artifact === undefined) throw new Error(`fixture: missing transport oracle for ${path}`);
  return artifact;
}

function identityVector(
  expected: CaptionIdentityExpectedOracle,
  vectorId: string,
): CaptionIdentityVectorOracle {
  const vector = expected.vectors.find((candidate) => candidate.vectorId === vectorId);
  if (vector === undefined) throw new Error(`fixture: missing Caption identity vector ${vectorId}`);
  return vector;
}

function overlayCurrentCaptionIdentities(
  historical: ExpectedLociMyu,
  identityExpected: CaptionIdentityExpectedOracle,
): ExpectedLociMyu {
  const current = structuredClone(historical);
  const currentIdByHistoricalId = new Map(
    identityExpected.fixtureCaptions.map((binding) => [
      binding.historicalCaptionId,
      identityVector(identityExpected, binding.vectorId).captionId,
    ]),
  );
  for (const set of current.sets) {
    for (const caption of set.captions) {
      caption.captionId = currentIdByHistoricalId.get(caption.captionId) ?? caption.captionId;
    }
  }
  current.unlinkedImageReferences = current.unlinkedImageReferences.map(([fileId, captionIds]) => [
    fileId,
    captionIds.map((captionId) => currentIdByHistoricalId.get(captionId) ?? captionId),
  ]);
  const migratedState = current.migratedState as {
    captions?: Array<{ id: string; [key: string]: unknown }>;
  };
  if (!Array.isArray(migratedState.captions)) throw new Error('fixture: expected migrated Caption state');
  migratedState.captions = migratedState.captions
    .map((caption) => ({
      ...caption,
      id: currentIdByHistoricalId.get(caption.id) ?? caption.id,
    }))
    .sort((left, right) => left.id.localeCompare(right.id, 'en'));
  return current;
}

function entryInventory(entries: readonly ZipEntryData[]): EntryOracle[] {
  return entries
    .map((entry) => ({
      path: entry.path,
      byteSize: entry.data.length,
      sha256: sha256(entry.data),
    }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.path, 'utf8'), Buffer.from(b.path, 'utf8')));
}

async function packageEntryInventory(bytes: Uint8Array): Promise<EntryOracle[]> {
  return entryInventory(await readZipEntries(bytes));
}

function inspectionOpsInventory(inspection: ZipInspection): EntryOracle[] {
  return inspection.opsFiles
    .map((file) => ({
      path: file.path,
      byteSize: new TextEncoder().encode(file.text).length,
      sha256: sha256(file.text),
    }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.path, 'utf8'), Buffer.from(b.path, 'utf8')));
}

function inspectionBinaryInventory(inspection: ZipInspection): EntryOracle[] {
  return entryInventory(inspection.binaries);
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([key, nested]) => [key, canonicalJson(nested)]),
  );
}

function nativeStateProjection(state: ProjectState): unknown[] {
  return Object.entries(state.byKind)
    .flatMap(([kind, records]) =>
      Object.values(records).map((record) => ({
        kind,
        id: record.id,
        fields: canonicalJson(record.fields),
        ...(!isVisible(record) ? { deletedAt: record.deletedAt, lastWrite: record.lastWrite } : {}),
      })),
    )
    .sort((a, b) => `${a.kind}\0${a.id}`.localeCompare(`${b.kind}\0${b.id}`, 'en'));
}

function migratedStateProjection(store: ProjectStore): unknown {
  const visible = Object.entries(store.state.byKind).flatMap(([kind, records]) =>
    Object.values(records)
      .filter(isVisible)
      .map((record) => ({ kind, id: record.id, fields: { ...record.fields } })),
  );
  const setNameById = new Map(
    visible
      .filter((record) => record.kind === 'set')
      .map((record) => [record.id, String(record.fields.name ?? '')]),
  );
  const assetNameById = new Map(
    visible
      .filter((record) => record.kind === 'asset')
      .map((record) => [record.id, String(record.fields.originalName ?? '')]),
  );

  const rewriteReference = (key: string, value: unknown): unknown => {
    if (key === 'setId' && typeof value === 'string') return setNameById.get(value) ?? value;
    if (key === 'modelAssetId' && typeof value === 'string') return assetNameById.get(value) ?? value;
    if (key === 'attachments' && Array.isArray(value)) {
      return value.map((id) => (typeof id === 'string' ? assetNameById.get(id) ?? id : id)).sort();
    }
    if (key === 'anchor' && value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
          nestedKey,
          rewriteReference(nestedKey, nestedValue),
        ]),
      );
    }
    return value;
  };

  const records = (kind: string): Array<{ id: string; fields: Record<string, unknown> }> =>
    visible.filter((record) => record.kind === kind);
  const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  return canonicalJson({
    sets: records('set')
      .map((record) => ({ name: String(record.fields.name ?? ''), order: Number(record.fields.order ?? 0) }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'en')),
    assets: records('asset')
      .map((record) =>
        canonicalJson(
          Object.fromEntries(
            Object.entries(record.fields).filter(
              ([key]) => key !== 'path' && key !== 'optimizedPath',
            ),
          ),
        ) as Record<string, unknown>,
      )
      .sort((a, b) => String(a.originalName ?? '').localeCompare(String(b.originalName ?? ''), 'en')),
    captions: records('caption')
      .map((record) => {
        const anchor = record.fields.anchor;
        const anchorProjection =
          anchor !== null && typeof anchor === 'object'
            ? rewriteReference('anchor', anchor)
            : null;
        return {
          id: record.id,
          setName: rewriteReference('setId', record.fields.setId),
          title: String(record.fields.title ?? ''),
          body: String(record.fields.body ?? ''),
          color: String(record.fields.color ?? ''),
          tags: stringArray(record.fields.tags),
          attachments: rewriteReference('attachments', record.fields.attachments),
          anchor: anchorProjection,
          legacyImageFileId:
            typeof record.fields.legacyImageFileId === 'string' ? record.fields.legacyImageFileId : null,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id, 'en')),
    views: records('view')
      .map((record) => ({
        setName: rewriteReference('setId', record.fields.setId),
        name: String(record.fields.name ?? ''),
        cameraState: canonicalJson(record.fields.cameraState),
        background: String(record.fields.background ?? ''),
      }))
      .sort((a, b) => `${String(a.setName)}\0${a.name}`.localeCompare(`${String(b.setName)}\0${b.name}`, 'en')),
    materials: records('material')
      .map((record) => ({
        setName: rewriteReference('setId', record.fields.setId),
        modelName: rewriteReference('modelAssetId', record.fields.modelAssetId),
        materialKey: String(record.fields.materialKey ?? ''),
        opacity: Number(record.fields.opacity ?? 1),
        doubleSided: record.fields.doubleSided === true,
        unlit: record.fields.unlit === true,
        chroma: canonicalJson(record.fields.chroma ?? null),
        legacyKey: record.fields.legacyKey === true,
      }))
      .sort((a, b) => a.materialKey.localeCompare(b.materialKey, 'en')),
  });
}

const CROCKFORD = '[0-9A-HJKMNP-TV-Z]';
const ACTOR_RE = new RegExp(`^a_${CROCKFORD}{13}$`);
const KNOWN_ID_RE = new RegExp(`^(?:prj|usr|dev|set|cap|view|mat|ast)_[0-7]${CROCKFORD}{25}$`);
const USER_ID_RE = new RegExp(`^usr_[0-7]${CROCKFORD}{25}$`);
const PROJECT_ID_RE = new RegExp(`^prj_[0-7]${CROCKFORD}{25}$`);
const CAPTION_ID_RE = new RegExp(`^cap_[0-7]${CROCKFORD}{25}$`);
const HLC_RE = new RegExp(
  `^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z-[0-9a-f]{4}-(a_${CROCKFORD}{13})$`,
);

function expectCanonicalNativeOps(ops: readonly Op[]): void {
  const prefixes: Readonly<Record<string, string>> = {
    profile: 'usr',
    set: 'set',
    caption: 'cap',
    view: 'view',
    material: 'mat',
    asset: 'ast',
  };
  const sequenceByActor = new Map<string, number>();
  for (const op of ops) {
    expect(op.actor).toMatch(ACTOR_RE);
    expect(op.user).toMatch(USER_ID_RE);
    expect(op.id).toMatch(KNOWN_ID_RE);
    const expectedPrefix = prefixes[op.e];
    if (expectedPrefix !== undefined) expect(op.id.startsWith(`${expectedPrefix}_`)).toBe(true);
    const match = HLC_RE.exec(op.hlc);
    expect(match?.[1]).toBe(op.actor);
    expect(new Date(op.hlc.slice(0, 24)).toISOString()).toBe(op.hlc.slice(0, 24));
    const previous = sequenceByActor.get(op.actor) ?? 0;
    expect(op.op).toBe(previous + 1);
    sequenceByActor.set(op.actor, op.op);
  }
}

function planProjection(
  plan: ImportPlan,
): Omit<ExpectedLociMyu, 'apply' | 'warnings' | 'migratedState' | 'numericGidEvidence'> {
  const migration = plan.migration;
  if (migration === null) throw new Error('fixture: expected a LociMyu migration plan');
  return {
    sources: plan.sources.map((source) => ({
      fileName: source.fileName,
      looksLikeBackup: source.looksLikeBackup,
      captionCount: source.captionCount,
    })),
    selectedSource: plan.sources[plan.selectedSourceIndex]?.fileName ?? '',
    modelNames: plan.models.map((model) => model.name),
    imageNames: plan.images.map((image) => image.name),
    fileIdMap: [...plan.fileIdMap.entries()],
    gidMappingIsGuess: migration.gidMappingIsGuess,
    sets: migration.sets.map((set) => ({
      name: set.name,
      legacyGid: set.legacyGid,
      captions: set.captions.map((caption) => ({
        legacyId: caption.legacyId,
        captionId: caption.captionId,
        title: caption.title,
        body: caption.body,
        color: caption.color,
        position: caption.position,
        legacyImageFileId: caption.legacyImageFileId,
      })),
    })),
    views: migration.views.map((view) => ({
      name: view.name,
      sheetGid: view.sheetGid,
      background: view.bgColor,
      eye: view.cameraState.eye,
      target: view.cameraState.target,
      up: view.cameraState.up,
      fov: view.cameraState.fov,
      ortho: view.cameraState.ortho,
    })),
    materials: migration.materials.map((material) => ({
      sheetGid: material.sheetGid,
      materialKey: material.materialKey,
      opacity: material.opacity,
      doubleSided: material.doubleSided,
      unlitLike: material.unlitLike,
      chroma: material.chroma,
    })),
    unlinkedImageReferences: [...migration.unlinkedImages.entries()],
  };
}

function expectedPlanProjection(
  expected: ExpectedLociMyu,
): Omit<ExpectedLociMyu, 'apply' | 'warnings' | 'migratedState' | 'numericGidEvidence'> {
  const {
    apply: _apply,
    warnings: _warnings,
    migratedState: _migratedState,
    numericGidEvidence: _numericGidEvidence,
    ...projection
  } = expected;
  return projection;
}

function sourceSheetProjection(sheets: readonly AuthoredSheet[]): Array<{ name: string; rows: string[][] }> {
  const cell = (value: string | { number: string }): string =>
    typeof value === 'string' ? value : String(Number(value.number));
  return sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.map((row) => row.map(cell)) }));
}

async function workspaceBinaryInventory(fs: MemoryFS, dir: string): Promise<EntryOracle[]> {
  const entries: ZipEntryData[] = [];
  for (const prefix of ['models/', 'media/', 'thumbs/']) {
    for (const path of await fs.list(`${dir}/${prefix}`)) {
      const data = await fs.readBytes(path);
      if (data !== null) entries.push({ path: path.slice(dir.length + 1), data });
    }
  }
  return entryInventory(entries);
}

function expectedLociMyuAssetInventory(
  expectedLociMyu: ExpectedLociMyu,
  entries: readonly EntryOracle[],
): AssetBlobOracle[] {
  const expectedNames = new Map<string, string>([
    ...expectedLociMyu.modelNames.map((name): [string, string] => [name, 'model']),
    ...expectedLociMyu.imageNames.map((name): [string, string] => [name, 'image']),
  ]);
  return entries
    .map((entry) => ({ ...entry, originalName: entry.path.slice(entry.path.lastIndexOf('/') + 1) }))
    .filter((entry) => expectedNames.has(entry.originalName))
    .map((entry) => ({
      kind: expectedNames.get(entry.originalName)!,
      originalName: entry.originalName,
      byteSize: entry.byteSize,
      sha256: entry.sha256,
    }))
    .sort((a, b) => a.originalName.localeCompare(b.originalName, 'en'));
}

async function workspaceAssetInventory(
  fs: MemoryFS,
  dir: string,
  store: ProjectStore,
): Promise<AssetBlobOracle[]> {
  const out: AssetBlobOracle[] = [];
  for (const asset of visibleEntities(store.state, 'asset')) {
    const path = asset.fields.path;
    expect(typeof path).toBe('string');
    const data = await fs.readBytes(`${dir}/${String(path)}`);
    expect(data).not.toBeNull();
    out.push({
      kind: String(asset.fields.kind ?? ''),
      originalName: String(asset.fields.originalName ?? ''),
      byteSize: data!.length,
      sha256: sha256(data!),
    });
  }
  return out.sort((a, b) => a.originalName.localeCompare(b.originalName, 'en'));
}

function inspectionAssetInventory(
  inspection: ZipInspection,
  store: ProjectStore,
): AssetBlobOracle[] {
  const binaryByPath = new Map(inspection.binaries.map((entry) => [entry.path, entry.data]));
  return visibleEntities(store.state, 'asset')
    .map((asset) => {
      const path = String(asset.fields.path ?? '');
      const data = binaryByPath.get(path);
      expect(data).toBeDefined();
      return {
        kind: String(asset.fields.kind ?? ''),
        originalName: String(asset.fields.originalName ?? ''),
        byteSize: data!.length,
        sha256: sha256(data!),
      };
    })
    .sort((a, b) => a.originalName.localeCompare(b.originalName, 'en'));
}

function visibleCounts(store: ProjectStore, kinds: readonly string[]): Record<string, number> {
  return Object.fromEntries(kinds.map((kind) => [kind, visibleEntities(store.state, kind).length]));
}

const CAPTION_HEADER = [
  'id',
  'title',
  'body',
  'color',
  'posX',
  'posY',
  'posZ',
  'imageFileId',
  'createdAt',
  'updatedAt',
];
const VIEW_HEADER = [
  'id',
  'captionSheetGid',
  'name',
  'bgColor',
  'cameraType',
  'eyeX',
  'eyeY',
  'eyeZ',
  'targetX',
  'targetY',
  'targetZ',
  'upX',
  'upY',
  'upZ',
  'fov',
  'createdAt',
  'updatedAt',
];
const MIGRATION_IDENTITY: Identity = {
  userId: 'usr_01J00000000000000000000090',
  deviceId: 'dev_01J00000000000000000000090',
  displayName: 'Synthetic migrator',
};

async function lociMyuZip(
  sheets: readonly { name: string; rows: string[][] }[],
  extraEntries: readonly ZipEntryData[] = [],
): Promise<Uint8Array> {
  const workbook = await makeXlsx(sheets);
  return writeZipEntries([{ path: 'LociMyu Save.xlsx', data: workbook }, ...extraEntries]);
}

describe('v1 migration fixtures', () => {
  let source: SourceOracle;
  let expected: ExpectedOracle;
  let captionIdentityExpected: CaptionIdentityExpectedOracle;
  let currentLociMyuExpected: ExpectedLociMyu;

  beforeAll(async () => {
    source = await readFixtureJson<SourceOracle>('source.v1.json');
    expected = await readFixtureJson<ExpectedOracle>('expected.v1.json');
    captionIdentityExpected = await readFixtureJson<CaptionIdentityExpectedOracle>(
      'expected.locimyu-caption-id-2.json',
    );
    currentLociMyuExpected = overlayCurrentCaptionIdentities(expected.locimyu, captionIdentityExpected);
  });

  describe('LociMyu Drive ZIP', () => {
    let bytes: Uint8Array;
    let entries: ZipEntryData[];
    let plan: ImportPlan;

    beforeAll(async () => {
      bytes = await readFixtureBytes('locimyu-drive-exact-v1.zip');
      entries = await readZipEntries(bytes);
      plan = await buildImportPlan(entries);
    });

    it('matches logical entry hashes and the handwritten workbook/plan oracle', async () => {
      const artifact = transportArtifact(expected, source.locimyu.output);
      expect(entryInventory(entries)).toEqual(artifact.entries);

      const primary = plan.sources.find((candidate) => candidate.fileName === source.locimyu.primary.path);
      const backup = plan.sources.find((candidate) => candidate.fileName === source.locimyu.backup.path);
      expect(primary).toBeDefined();
      expect(backup).toBeDefined();
      expect(primary!.tables.map(({ name, rows }) => ({ name, rows }))).toEqual(
        sourceSheetProjection(source.locimyu.primary.sheets),
      );
      expect(backup!.tables.map(({ name, rows }) => ({ name, rows }))).toEqual(
        sourceSheetProjection(source.locimyu.backup.sheets),
      );
      expect(planProjection(plan)).toEqual(expectedPlanProjection(currentLociMyuExpected));
      expect(plan.warnings).toEqual(
        expected.locimyu.warnings ?? [
          'スプレッドシートが2個見つかりました。「LociMyu Save.xlsx」を使用します（取込前に切り替えられます）',
        ],
      );

      const rawScientificGid = source.locimyu.primary.sheets
        .find((sheet) => sheet.name === '__LM_SHEET_NAMES')
        ?.rows[2]?.[0];
      expect(rawScientificGid).toEqual({ number: '6.17884617E8' });
      expect(rawScientificGid).toEqual({ number: expected.locimyu.numericGidEvidence.raw });
      const primaryWorkbook = entries.find((entry) => entry.path === source.locimyu.primary.path);
      expect(primaryWorkbook).toBeDefined();
      const workbookXml = (await readZipEntries(primaryWorkbook!.data))
        .filter((entry) => entry.path.startsWith('xl/worksheets/'))
        .map((entry) => new TextDecoder().decode(entry.data))
        .join('\n');
      expect(workbookXml).toContain(`<v>${expected.locimyu.numericGidEvidence.raw}</v>`);
      expect(expected.locimyu.sets[1]?.legacyGid).toBe(expected.locimyu.numericGidEvidence.normalized);

      const historicalBindings = expected.locimyu.sets.flatMap((set) =>
        set.captions.map((caption) => ({ setName: set.name, historicalCaptionId: caption.captionId })),
      );
      expect(historicalBindings).toEqual(captionIdentityExpected.fixtureCaptions.map((binding) => ({
        setName: binding.setName,
        historicalCaptionId: binding.historicalCaptionId,
      })));
      expect(historicalBindings.every((binding) => /^cap_LM[0-9A-HJKMNP-TV-Z]{24}$/.test(binding.historicalCaptionId))).toBe(true);
      for (const binding of captionIdentityExpected.fixtureCaptions) {
        const vector = identityVector(captionIdentityExpected, binding.vectorId);
        const actualCaption = plan.migration!.sets
          .find((set) => set.name === binding.setName)!
          .captions.find((caption) => caption.legacyId === vector.identityKey.legacyId)!;
        expect(actualCaption.identity.key).toEqual(vector.identityKey);
        expect(sha256(actualCaption.identity.preimageBytes)).toBe(vector.fullDigest);
        expect(actualCaption.captionId).toBe(vector.captionId);
        expect(actualCaption.captionId.startsWith('cap_LM')).toBe(false);
      }
    });

    it('applies, opens, and exports/imports without random IDs or HLCs entering the semantic oracle', async () => {
      const freshPlan = await buildImportPlan(await readZipEntries(bytes));
      const fs = new MemoryFS();
      const result = await applyImportPlan(fs, MIGRATION_IDENTITY, freshPlan, {
        projectName: 'Synthetic migrated project',
      });
      expect({
        captionCount: result.captionCount,
        setCount: result.setCount,
        linkedImages: result.linkedImages,
        unlinkedImages: result.unlinkedImages,
        chromaDisabledCount: result.chromaDisabledCount,
      }).toEqual({
        captionCount: expected.locimyu.apply.captionCount,
        setCount: expected.locimyu.apply.setCount,
        linkedImages: expected.locimyu.apply.linkedImages,
        unlinkedImages: expected.locimyu.apply.unlinkedImages,
        chromaDisabledCount: expected.locimyu.apply.chromaDisabledCount,
      });

      const store = await ProjectStore.open(fs, result.dir, MIGRATION_IDENTITY);
      const stateProjection = migratedStateProjection(store);
      const logicalEntries = transportArtifact(expected, source.locimyu.output).entries;
      const expectedAssets = expectedLociMyuAssetInventory(currentLociMyuExpected, logicalEntries);
      expect(stateProjection).toEqual(currentLociMyuExpected.migratedState);
      expect(await workspaceAssetInventory(fs, result.dir, store)).toEqual(expectedAssets);
      const titles = visibleEntities(store.state, 'caption').map((record) => String(record.fields.title)).sort();
      expect(titles).toEqual([...expected.locimyu.apply.selectedTitles].sort());
      expect(titles).not.toContain(expected.locimyu.apply.rejectedBackupTitle);

      const exported = await exportProjectZip(fs, result.dir, store);
      const inspection = await inspectZip(exported);
      expect(inspectionAssetInventory(inspection, store)).toEqual(expectedAssets);
      const roundTripFs = new MemoryFS();
      await importNewProject(roundTripFs, 'projects/round-trip', inspection);
      const reopened = await ProjectStore.open(roundTripFs, 'projects/round-trip', MIGRATION_IDENTITY);
      expect(migratedStateProjection(reopened)).toEqual(stateProjection);
      expect(await workspaceAssetInventory(roundTripFs, 'projects/round-trip', reopened)).toEqual(expectedAssets);
    });
  });

  describe('native v1 lineage', () => {
    type PackageKey = 'base' | 'branchA' | 'branchB';
    const names: Record<PackageKey, string> = {
      base: 'native-v1-base.lociview',
      branchA: 'native-v1-branch-a.lociview',
      branchB: 'native-v1-branch-b.lociview',
    };
    let bytesByKey: Record<PackageKey, Uint8Array>;
    let inspectionByKey: Record<PackageKey, ZipInspection>;

    beforeAll(async () => {
      const base = await readFixtureBytes(names.base);
      const branchA = await readFixtureBytes(names.branchA);
      const branchB = await readFixtureBytes(names.branchB);
      bytesByKey = { base, branchA, branchB };
      inspectionByKey = {
        base: await inspectZip(base),
        branchA: await inspectZip(branchA),
        branchB: await inspectZip(branchB),
      };
    });

    it('inspects every package with canonical IDs/HLCs and logical raw/binary hashes', async () => {
      for (const key of Object.keys(names) as PackageKey[]) {
        const outputPath = source.native.outputs[key];
        const artifact = transportArtifact(expected, outputPath);
        const inspection = inspectionByKey[key];
        expect(await packageEntryInventory(bytesByKey[key])).toEqual(artifact.entries);
        expect(inspection.kind).toBe('lociview');
        expect(inspection.manifest).toEqual(source.native.manifest);
        expect(inspection.manifest?.projectId).toBe(expected.native.projectId);
        expect(inspection.manifest?.projectId).toMatch(PROJECT_ID_RE);
        expect(inspection.opsErrorCount).toBe(0);
        expectCanonicalNativeOps(inspection.ops);
        for (const file of inspection.opsFiles) {
          const actor = /^ops\/(a_[0-9A-HJKMNP-TV-Z]{13})\.jsonl$/u.exec(file.path)?.[1];
          expect(actor).toBeDefined();
          const parsed = parseOpsJsonl(file.text);
          expect(parsed.errors).toEqual([]);
          expect(parsed.ops.every((op) => op.actor === actor)).toBe(true);
          expect(parsed.ops.map((op) => op.op)).toEqual(parsed.ops.map((_op, index) => index + 1));
        }
        expect(inspectionOpsInventory(inspection)).toEqual(
          artifact.entries.filter((entry) => entry.path.startsWith('ops/')),
        );
        expect(inspectionBinaryInventory(inspection)).toEqual(
          artifact.entries.filter(
            (entry) =>
              entry.path.startsWith('models/') ||
              entry.path.startsWith('media/') ||
              entry.path.startsWith('thumbs/'),
          ),
        );
      }
    });

    it('direct import/open/export preserves raw op bytes and ignores stale derived caches', async () => {
      for (const key of Object.keys(names) as PackageKey[]) {
        const inspection = inspectionByKey[key];
        const fs = new MemoryFS();
        const dir = `projects/direct-${key}`;
        await importNewProject(fs, dir, inspection);
        expect(await fs.exists(`${dir}/snapshot.json`)).toBe(false);
        expect(await fs.exists(`${dir}/captions.csv`)).toBe(false);
        const store = await ProjectStore.open(fs, dir, MIGRATION_IDENTITY);
        const before = nativeStateProjection(store.state);
        const stateByKey: Record<PackageKey, unknown> = {
          base: expected.native.baseState,
          branchA: expected.native.branchAState,
          branchB: expected.native.branchBState,
        };
        const vectorByKey: Record<PackageKey, Record<string, number>> = {
          base: expected.native.baseVector,
          branchA: expected.native.branchAVector,
          branchB: expected.native.branchBVector,
        };
        expect(store.vector).toEqual(vectorByKey[key]);
        expect(before).toEqual(stateByKey[key]);
        expect(JSON.stringify(before)).not.toContain(expected.native.staleMarker);

        const exportedInspection = await inspectZip(await exportProjectZip(fs, dir, store));
        expect(exportedInspection.opsFiles).toEqual(inspection.opsFiles);
        expect(inspectionBinaryInventory(exportedInspection)).toEqual(inspectionBinaryInventory(inspection));

        const reopenedFs = new MemoryFS();
        await importNewProject(reopenedFs, `projects/reopened-${key}`, exportedInspection);
        const reopened = await ProjectStore.open(reopenedFs, `projects/reopened-${key}`, MIGRATION_IDENTITY);
        expect(nativeStateProjection(reopened.state)).toEqual(before);
      }

      const rawFile = inspectionByKey.base.opsFiles.find((file) => file.path === expected.native.rawProbe.path);
      expect(rawFile).toBeDefined();
      expect(rawFile!.text.split('\n')).toContain(expected.native.rawProbe.line);
      expect(inspectionByKey.base.ops.find((op) => op.id === expected.native.unplacedCaption.id)?.v?.futureSafe).toEqual(
        expected.native.unplacedCaption.futureSafe,
      );
    });

    async function mergeInOrder(order: readonly PackageKey[]): Promise<{
      fs: MemoryFS;
      dir: string;
      store: ProjectStore;
      idempotent: boolean;
    }> {
      const fs = new MemoryFS();
      const dir = `projects/merge-${order.join('-')}`;
      await importNewProject(fs, dir, inspectionByKey.base);
      const store = await ProjectStore.open(fs, dir, MIGRATION_IDENTITY);
      for (const key of order) await mergeFromInspection(fs, dir, store, inspectionByKey[key]);
      await store.flush();
      const opCount = store.allOps.length;
      const before = nativeStateProjection(store.state);
      const binariesBefore = await workspaceBinaryInventory(fs, dir);
      for (const key of order) {
        const report = await mergeFromInspection(fs, dir, store, inspectionByKey[key]);
        expect(report).toEqual({ created: [], updated: [], deleted: [], revived: [], overwritten: [], rejected: [] });
      }
      await store.flush();
      return {
        fs,
        dir,
        store,
        idempotent:
          store.allOps.length === opCount &&
          JSON.stringify(nativeStateProjection(store.state)) === JSON.stringify(before) &&
          JSON.stringify(await workspaceBinaryInventory(fs, dir)) === JSON.stringify(binariesBefore),
      };
    }

    it('converges A→B and B→A including field-LWW, blob union, and idempotent remerge', async () => {
      const branchATitleOp = inspectionByKey.branchA.ops.find(
        (op) =>
          op.t === 'update' &&
          op.id === expected.native.unplacedCaption.id &&
          typeof op.v?.title === 'string',
      );
      const branchBTitleOp = inspectionByKey.branchB.ops.find(
        (op) =>
          op.t === 'update' &&
          op.id === expected.native.unplacedCaption.id &&
          typeof op.v?.title === 'string',
      );
      expect(branchATitleOp).toBeDefined();
      expect(branchBTitleOp).toBeDefined();
      expect(branchATitleOp!.hlc.localeCompare(branchBTitleOp!.hlc, 'en')).toBeLessThan(0);
      expect(branchATitleOp!.actor.localeCompare(branchBTitleOp!.actor, 'en')).toBeGreaterThan(0);

      const ab = await mergeInOrder(['branchA', 'branchB']);
      const ba = await mergeInOrder(['branchB', 'branchA']);
      const abProjection = nativeStateProjection(ab.store.state);
      const baProjection = nativeStateProjection(ba.store.state);
      expect(abProjection).toEqual(baProjection);
      expect(abProjection).toEqual(expected.native.convergedState);
      expect(ab.idempotent).toBe(true);
      expect(ba.idempotent).toBe(true);
      expect(ab.store.vector).toEqual(expected.native.mergedVector);
      expect(ba.store.vector).toEqual(expected.native.mergedVector);
      expect(visibleCounts(ab.store, Object.keys(expected.native.visibleCounts))).toEqual(expected.native.visibleCounts);

      const surface = visibleEntities(ab.store.state, 'caption').find(
        (record) => record.id === expected.native.surfaceCaption.id,
      );
      expect(surface?.fields.body).toBe(expected.native.surfaceCaption.body);
      expect(surface?.fields.color).toBe(expected.native.surfaceCaption.color);
      const unplaced = visibleEntities(ab.store.state, 'caption').find(
        (record) => record.id === expected.native.unplacedCaption.id,
      );
      expect(unplaced?.fields.futureSafe).toEqual(expected.native.unplacedCaption.futureSafe);
      expect(unplaced?.fields.title).toBe(expected.native.unplacedCaption.title);
      expect(Object.hasOwn(unplaced?.fields ?? {}, 'anchor')).toBe(expected.native.unplacedCaption.hasAnchor);
      expect(
        visibleEntities(ab.store.state, 'caption').some(
          (record) => record.id === expected.native.tombstoneCaptionId,
        ),
      ).toBe(false);

      expect(await workspaceBinaryInventory(ab.fs, ab.dir)).toEqual(expected.native.binaryUnion);
      expect(await workspaceBinaryInventory(ba.fs, ba.dir)).toEqual(expected.native.binaryUnion);
      const rawText = await ab.fs.readText(`${ab.dir}/${expected.native.rawProbe.path}`);
      expect(rawText?.split('\n')).toContain(expected.native.rawProbe.line);
    });
  });
});

describe('known v1 migration gaps', () => {
  let guessedGidWasRejected = false;
  let duplicateBasenameWasFlagged = false;
  let lastViewBecameDefaultCamera = false;
  let duplicateCaptionIdsStayedUnique = false;
  let missingActiveBlobWasDetected = false;
  let migratedCaptionIdsWereCanonical = false;
  let gapCaptionIdentityExpected: CaptionIdentityExpectedOracle;

  beforeAll(async () => {
    gapCaptionIdentityExpected = await readFixtureJson<CaptionIdentityExpectedOracle>(
      'expected.locimyu-caption-id-2.json',
    );
    const captionRows = [
      CAPTION_HEADER,
      ['c_SYNTH_GAP', 'Synthetic gap', '', '#eab308', '0', '0', '0', '', '', ''],
    ];

    const guessedZip = await lociMyuZip([
      { name: 'Synthetic set', rows: captionRows },
      {
        name: '__LM_VIEWS',
        rows: [
          VIEW_HEADER,
          ['v_GUESS', '617884617', 'Guess', '#202124', 'perspective', '1', '2', '3', '0', '0', '0', '0', '1', '0', '45', '', ''],
        ],
      },
    ]);
    const guessedPlan = await buildImportPlan(await readZipEntries(guessedZip));
    expect(guessedPlan.migration?.gidMappingIsGuess).toBe(true);
    const guessedFs = new MemoryFS();
    try {
      await applyImportPlan(guessedFs, MIGRATION_IDENTITY, guessedPlan, { projectName: 'guessed GID' });
    } catch (error) {
      if (!(error instanceof Error) || !/gid|mapping|ack|confirm|確認|承認|推定/iu.test(error.message)) {
        throw error;
      }
      guessedGidWasRejected = true;
    }

    const duplicateImageZip = await lociMyuZip(
      [{ name: 'Synthetic set', rows: [CAPTION_HEADER, ['c_IMAGE', 'Image', '', '', '0', '0', '0', 'DRIVE_DUP', '', '']] }],
      [
        { path: 'folder-a/same.png', data: new TextEncoder().encode('synthetic-a') },
        { path: 'folder-b/same.png', data: new TextEncoder().encode('synthetic-b') },
        { path: 'fileid-map.csv', data: new TextEncoder().encode('fileId,filename\nDRIVE_DUP,same.png\n') },
      ],
    );
    const duplicateImagePlan = await buildImportPlan(await readZipEntries(duplicateImageZip));
    expect(duplicateImagePlan.images).toHaveLength(2);
    duplicateBasenameWasFlagged = duplicateImagePlan.warnings.some(
      (warning) =>
        warning.includes('DRIVE_DUP') &&
        warning.includes('same.png') &&
        warning.includes('folder-a/same.png') &&
        warning.includes('folder-b/same.png'),
    );

    const lastViewZip = await lociMyuZip([
      { name: 'Synthetic set', rows: captionRows },
      {
        name: '__LM_SHEET_NAMES',
        rows: [['sheetGid', 'displayName', 'sheetTitle', 'updatedAt'], ['1', 'Synthetic', 'Synthetic set', '']],
      },
      {
        name: '__LM_VIEWS',
        rows: [
          VIEW_HEADER,
          ['v_LAST', '1', '__last', '#202124', 'orthographic', '3', '4', '5', '0', '0', '0', '', '', '', '', '', ''],
        ],
      },
    ]);
    const lastViewPlan = await buildImportPlan(await readZipEntries(lastViewZip));
    expect(lastViewPlan.migration?.views).toHaveLength(1);
    expect(lastViewPlan.migration?.views[0]?.cameraState).toEqual({
      eye: [3, 4, 5],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fov: 45,
      ortho: true,
    });
    const lastViewFs = new MemoryFS();
    const lastViewResult = await applyImportPlan(lastViewFs, MIGRATION_IDENTITY, lastViewPlan, {
      projectName: 'last view',
    });
    const lastViewStore = await ProjectStore.open(lastViewFs, lastViewResult.dir, MIGRATION_IDENTITY);
    const migratedSet = visibleEntities(lastViewStore.state, 'set').find(
      (record) => record.fields.name === 'Synthetic set',
    );
    expect(migratedSet).toBeDefined();
    const expectedDefaultCamera = {
      eye: [3, 4, 5],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fov: 45,
      ortho: true,
    };
    lastViewBecameDefaultCamera =
      visibleEntities(lastViewStore.state, 'view').length === 0 &&
      JSON.stringify(migratedSet?.fields.defaultCameraState) === JSON.stringify(expectedDefaultCamera);

    const duplicateTables: SheetTable[] = [
      { name: 'A', rows: [CAPTION_HEADER, ['c_DUPLICATE', 'A', '', '', '0', '0', '0', '', '', '']] },
      { name: 'B', rows: [CAPTION_HEADER, ['c_DUPLICATE', 'B', '', '', '1', '1', '1', '', '', '']] },
    ];
    const duplicateMigration = await analyzeLociMyuSheets(duplicateTables);
    expect(duplicateMigration.sets).toHaveLength(2);
    expect(duplicateMigration.sets.flatMap((set) => set.captions)).toHaveLength(2);
    const duplicateIds = duplicateMigration.sets.flatMap((set) => set.captions.map((caption) => caption.captionId));
    const repeatedIds = (await analyzeLociMyuSheets(duplicateTables)).sets.flatMap((set) =>
      set.captions.map((caption) => caption.captionId),
    );
    const duplicateZip = await lociMyuZip(duplicateTables);
    const duplicatePlan = await buildImportPlan(await readZipEntries(duplicateZip));
    expect(duplicatePlan.migration?.sets).toHaveLength(2);
    const duplicateFs = new MemoryFS();
    const duplicateResult = await applyImportPlan(duplicateFs, MIGRATION_IDENTITY, duplicatePlan, {
      projectName: 'duplicate caption IDs',
    });
    const duplicateStore = await ProjectStore.open(duplicateFs, duplicateResult.dir, MIGRATION_IDENTITY);
    const duplicateSetNames = new Map(
      visibleEntities(duplicateStore.state, 'set').map((record) => [record.id, String(record.fields.name)]),
    );
    const appliedCaptions = visibleEntities(duplicateStore.state, 'caption');
    duplicateCaptionIdsStayedUnique =
      new Set(duplicateIds).size === duplicateIds.length &&
      JSON.stringify(duplicateIds) === JSON.stringify(repeatedIds) &&
      JSON.stringify(duplicateIds) === JSON.stringify([
        identityVector(gapCaptionIdentityExpected, 'duplicate-a-0').captionId,
        identityVector(gapCaptionIdentityExpected, 'duplicate-b-0').captionId,
      ]) &&
      appliedCaptions.length === 2 &&
      appliedCaptions.some(
        (record) => record.fields.title === 'A' && duplicateSetNames.get(String(record.fields.setId)) === 'A',
      ) &&
      appliedCaptions.some(
        (record) => record.fields.title === 'B' && duplicateSetNames.get(String(record.fields.setId)) === 'B',
      );

    const nativeBytes = await readFixtureBytes('native-v1-base.lociview');
    const nativeInspection = await inspectZip(nativeBytes);
    const missingBlobFs = new MemoryFS();
    await importNewProject(missingBlobFs, 'projects/missing-blob', nativeInspection);
    const imported = await ProjectStore.open(missingBlobFs, 'projects/missing-blob', MIGRATION_IDENTITY);
    const activeAsset = visibleEntities(imported.state, 'asset').find(
      (record) => record.fields.originalName === 'synthetic-site.glb',
    );
    expect(activeAsset).toBeDefined();
    await missingBlobFs.remove(`projects/missing-blob/${String(activeAsset!.fields.path)}`);
    expect(await missingBlobFs.exists(`projects/missing-blob/${String(activeAsset!.fields.path)}`)).toBe(false);
    try {
      await ProjectStore.open(missingBlobFs, 'projects/missing-blob', MIGRATION_IDENTITY);
    } catch (error) {
      if (!(error instanceof Error) || !/blob|asset|file|missing|見つか|欠損|存在/iu.test(error.message)) {
        throw error;
      }
      missingActiveBlobWasDetected = true;
    }

    const canonicalZip = await lociMyuZip([{ name: 'Synthetic set', rows: captionRows }]);
    const canonicalPlan = await buildImportPlan(await readZipEntries(canonicalZip));
    expect(canonicalPlan.migration?.sets[0]?.captions).toHaveLength(1);
    const canonicalFs = new MemoryFS();
    const canonicalResult = await applyImportPlan(canonicalFs, MIGRATION_IDENTITY, canonicalPlan, {
      projectName: 'canonical caption id',
    });
    const canonicalStore = await ProjectStore.open(canonicalFs, canonicalResult.dir, MIGRATION_IDENTITY);
    const migratedCaption = visibleEntities(canonicalStore.state, 'caption')[0];
    expect(migratedCaption).toBeDefined();
    migratedCaptionIdsWereCanonical = CAPTION_ID_RE.test(migratedCaption!.id);
  });

  it.fails('requires explicit acknowledgement before applying guessed sheet-GID mappings', () => {
    expect(guessedGidWasRejected).toBe(true);
  });

  it.fails('flags duplicate image basenames before a file-ID map can select one silently', () => {
    expect(duplicateBasenameWasFlagged).toBe(true);
  });

  it.fails('treats __last as default camera state instead of a named view', () => {
    expect(lastViewBecameDefaultCamera).toBe(true);
  });

  it('does not collapse duplicate legacy caption IDs across sets', () => {
    expect(duplicateCaptionIdsStayedUnique).toBe(true);
  });

  it.fails('detects an active asset record whose referenced blob is missing', () => {
    expect(missingActiveBlobWasDetected).toBe(true);
  });

  it('emits canonical v1 IDs for migrated LociMyu captions', () => {
    expect(migratedCaptionIdsWereCanonical).toBe(true);
  });

  it.todo('observes durable preservation of the original v1 source once a public source-artifact API exists');
});
