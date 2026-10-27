import { inspectProjectImage, type PhotoDecoder } from './photo';
import { inspectZipContainerIdentity, readZipEntries, sanitizeZipPath } from '../assets/zipio';
import { parseCandidateV1ManifestBytes, type ProjectManifest } from '../core/manifest';
import { parseOpsJsonl, v1OperationLogActor } from '../core/jsonl';
import { admitNonDivergentV1Operations, type LocatedV1Operation } from '../core/operationAdmission';
import { reduce, sortOps, visibleEntities, isVisible, type EntityRecord } from '../core/reduce';
import type { Op } from '../core/schema';
import { cloneCanonicalValue, singleLineControls, type JsonObject, type JsonValue } from '../domain/values';
import { digest, json } from '../projectMetadata/persistence';
import type { StoredBlobRef } from '../projectMetadata/blobStore';
import { readValidationBody } from './content';
import { inspectFreshValidationGlb, type ValidatedGlb } from './glb';
import { inspectOccurrenceGlb, inspectOccurrenceJpegGlb, captureLegacyOccurrenceProof } from './glbOccurrences';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { checkFileLimits, fileError, fileObject, fileList, fileNumber, fileVector, limitedJson, validationMetadataLimits, type FileValidationLimits } from './validation';

export const frozenV1Recipe = 'v1-project-scene-migration-recipe-1';
export const frozenV1JpegRecipe = 'v1-project-scene-migration-recipe-2';
export const frozenV1PhotoRecipe = 'v1-project-scene-migration-recipe-3';
export const frozenV1DefaultViewRecipe = 'v1-project-scene-migration-recipe-4';
export const frozenV1PlacementRecipe = 'v1-project-scene-migration-recipe-5';
export const frozenV1MaterialRecipe = 'v1-project-scene-migration-recipe-6';
export type FrozenV1Recipe = typeof frozenV1MaterialRecipe | typeof frozenV1PlacementRecipe | typeof frozenV1DefaultViewRecipe | typeof frozenV1PhotoRecipe | typeof frozenV1Recipe | typeof frozenV1JpegRecipe;
export const codeOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const byteProof = async (bytes: Uint8Array) => ({ byteLength: bytes.length, digest: await digest(bytes) });
const fail = () => fileError('この旧形式ファイルの設定は、まだそのまま変換できません。');
const closed = (value: unknown, keys: string[]) => { const o = fileObject(value); if (Object.keys(o).some(k => !keys.includes(k))) fail(); return o; };
export const sourceColor = (value: unknown) => {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) return fail();
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
};
const text = (value: unknown): string => typeof value === 'string' ? value : fail();
const vector = (value: unknown) => fileVector(value, 3);
const materialFail = (id: string, field: string, reason: string): never => fileError(`材質 ${id}・${field}：${reason}`);
function checkMaterialFields(id: string, value: unknown) {
  const v = fileObject(value), bad = (field: string) => materialFail(id, field, '保存値の型または対応している設定を確認してください。');
  const keys = ['setId', 'modelAssetId', 'materialKey', 'opacity', 'doubleSided', 'unlit', 'unlitLike', 'chroma', 'legacyKey'];
  for (const field of Object.keys(v)) if (!keys.includes(field)) bad(field.slice(0, 64));
  for (const [field, prefix] of [['setId', 'set'], ['modelAssetId', 'ast']] as const)
    if (Object.hasOwn(v, field) && (typeof v[field] !== 'string' || !new RegExp(`^${prefix}_[0-7][0123456789ABCDEFGHJKMNPQRSTVWXYZ]{25}$`, 'u').test(v[field] as string))) bad(field);
  if (Object.hasOwn(v, 'materialKey') && (typeof v.materialKey !== 'string' || !v.materialKey.length || singleLineControls.test(v.materialKey))) bad('materialKey');
  const unit = (n: unknown, field: string) => { if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) bad(field); };
  if (Object.hasOwn(v, 'opacity')) unit(v.opacity, 'opacity');
  for (const field of ['doubleSided', 'unlit', 'unlitLike', 'legacyKey']) if (Object.hasOwn(v, field) && typeof v[field] !== 'boolean') bad(field);
  if (Object.hasOwn(v, 'unlit') && Object.hasOwn(v, 'unlitLike') && v.unlit !== v.unlitLike) bad('unlit/unlitLike');
  if (Object.hasOwn(v, 'chroma')) {
    if (!v.chroma || typeof v.chroma !== 'object' || Array.isArray(v.chroma)) bad('chroma');
    const c = v.chroma as Record<string, unknown>;
    if (Object.keys(c).some(k => !['enable', 'color', 'tol', 'tolerance', 'feather'].includes(k)) || typeof c.enable !== 'boolean') bad('chroma');
    if (Object.hasOwn(c, 'color') && (typeof c.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c.color))) bad('chroma.color');
    for (const field of ['tol', 'tolerance', 'feather']) if (Object.hasOwn(c, field)) unit(c[field], `chroma.${field}`);
  }
  return v;
}

/** Recipe-5's normative serialized constants: validate, never renormalize them. */
export function frozenV1Placement(value: unknown) {
  const t = value === undefined ? {} : closed(value, ['scale', 'upAxis', 'offset']);
  const uniformScale = t.scale === undefined ? 1 : fileNumber(t.scale), axis = t.upAxis ?? 'Y';
  if (uniformScale <= 0 || !['Y', 'Z'].includes(axis as string) || t.upAxis === null) return fail();
  return { translation: t.offset === undefined ? [0, 0, 0] : vector(t.offset), uniformScale,
    rotationXYZW: axis === 'Z' ? [-0.7071067811865475, 0, 0, 0.7071067811865475] : [0, 0, 0, 1] };
}
const nonidentity = (placement: ReturnType<typeof frozenV1Placement>) => placement.uniformScale !== 1 ||
  placement.rotationXYZW[0] !== 0 || placement.translation.some(n => n !== 0);

/** Mirror the display's Matrix4.compose / Vector3.applyMatrix4, including q residue. */
function finiteProjectPoint(point: readonly number[], placement: ReturnType<typeof frozenV1Placement>) {
  const [x, y, z, w] = placement.rotationXYZW as [number, number, number, number], s = placement.uniformScale;
  const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2,
    yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  const [px, py, pz] = point as [number, number, number], t = placement.translation;
  const projected = [
    ((1 - (yy + zz)) * s) * px + ((xy - wz) * s) * py + ((xz + wy) * s) * pz + t[0]!,
    ((xy + wz) * s) * px + ((1 - (xx + zz)) * s) * py + ((yz - wx) * s) * pz + t[1]!,
    ((xz - wy) * s) * px + ((yz + wx) * s) * py + ((1 - (xx + yy)) * s) * pz + t[2]!,
  ];
  if (!projected.every(Number.isFinite)) fail();
}
/** New5 only: scalar readiness checks matching the current runtime camera guard. */
function checkPlacementReadiness(models: readonly FrozenV1Body[], captions: readonly EntityRecord[], views: readonly EntityRecord[]) {
  const placements = new Map(models.map(m => [m.record.id, frozenV1Placement(m.record.fields.transform)]));
  for (const model of models) {
    const b = model.model!.bounds, p = placements.get(model.record.id)!;
    for (const x of [b.min[0]!, b.max[0]!]) for (const y of [b.min[1]!, b.max[1]!]) for (const z of [b.min[2]!, b.max[2]!]) finiteProjectPoint([x, y, z], p);
  }
  for (const caption of captions) {
    const a = caption.fields.anchor;
    if (a && Object.hasOwn(a as object, 'position')) {
      const anchor = fileObject(a); finiteProjectPoint(vector(anchor.position), placements.get(text(anchor.modelAssetId))!);
    }
  }
  for (const view of views) {
    const c = fileObject(view.fields.cameraState), eye = vector(c.eye), target = vector(c.target), up = vector(c.up);
    const direction = target.map((n, i) => n - eye[i]!), length = Math.hypot(...direction), norm = Math.hypot(...up);
    if (!Number.isFinite(length) || !length || Math.abs(norm - 1) > 1e-12) fail();
    const d = direction.map(n => n / length), cross = [up[1]! * d[2]! - up[2]! * d[1]!, up[2]! * d[0]! - up[0]! * d[2]!, up[0]! * d[1]! - up[1]! * d[0]!];
    const fov = fileNumber(c.fov) * Math.PI / 180;
    if (Math.hypot(...cross) <= 1e-12 || !Number.isFinite(fov) || fov <= 0 || fov >= Math.PI) fail();
    sourceColor(view.fields.background);
  }
}

function checkSourceFields(op: Op, limits: FileValidationLimits) {
  const fields: Record<string, string[]> = {
    set: ['name', 'order', 'defaultViewId', 'defaultCameraState'],
    asset: ['kind', 'path', 'originalName', 'mime', 'size', 'sha256', 'transform', 'pinScale'],
    caption: ['setId', 'title', 'body', 'color', 'tags', 'attachments', 'anchor'],
    view: ['setId', 'name', 'cameraState', 'background'], profile: ['displayName', 'defaultPinColor'], meta: [],
    material: ['setId', 'modelAssetId', 'materialKey', 'opacity', 'doubleSided', 'unlit', 'unlitLike', 'chroma', 'legacyKey'],
  };
  if (!Object.hasOwn(fields, op.e)) fail();
  if (!op.v) return;
  const v = op.e === 'material' ? checkMaterialFields(op.id, op.v) : closed(op.v, fields[op.e]!);
  if (op.e === 'set') {
    if (Object.hasOwn(v, 'order')) fileNumber(v.order);
    if (Object.hasOwn(v, 'defaultCameraState') || Object.hasOwn(v, 'defaultViewId') && v.defaultViewId !== null &&
      (typeof v.defaultViewId !== 'string' || !/^view_[0-7][0123456789ABCDEFGHJKMNPQRSTVWXYZ]{25}$/u.test(v.defaultViewId))) fail();
  }
  if (op.e === 'asset') {
    if (v.kind !== undefined && !['model', 'image'].includes(text(v.kind))) fail();
    if (v.transform !== undefined) frozenV1Placement(v.transform);
    if (v.pinScale !== undefined && (fileNumber(v.pinScale) < 0.001 || Number(v.pinScale) > 1000)) fail();
    if (v.size !== undefined && (!Number.isSafeInteger(v.size) || Number(v.size) < 0)) fail();
    if (v.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(text(v.sha256))) fail();
  }
  if (op.e === 'caption') {
    if (v.color !== undefined) sourceColor(v.color);
    for (const field of ['tags', 'attachments']) if (v[field] !== undefined) {
      const values = fileList(v[field], limits.maxItems).map(text);
      if (field === 'tags' && new Set(values).size !== values.length) fail();
    }
    if (v.anchor !== undefined && v.anchor !== null) {
      const a = closed(v.anchor, ['modelAssetId', 'position', 'normal']); text(a.modelAssetId);
      if (Object.hasOwn(a, 'position')) vector(a.position);
      if (Object.hasOwn(a, 'normal')) vector(a.normal);
    }
  }
  if (op.e === 'view') {
    if (v.background !== undefined) sourceColor(v.background);
    if (v.cameraState !== undefined) {
      const c = closed(v.cameraState, ['eye', 'target', 'up', 'fov', 'ortho']);
      const eye = vector(c.eye), target = vector(c.target), up = vector(c.up), fov = fileNumber(c.fov);
      const d = target.map((n, i) => n - eye[i]!), cross = [d[1]! * up[2]! - d[2]! * up[1]!, d[2]! * up[0]! - d[0]! * up[2]!, d[0]! * up[1]! - d[1]! * up[0]!];
      if (c.ortho !== false || fov <= 1 || fov >= 179 || cross.every(n => n === 0) || cross.some(n => !Number.isFinite(n))) fail();
    }
  }
  if (op.e === 'profile' && v.defaultPinColor !== undefined) sourceColor(v.defaultPinColor);
}

export interface FrozenV1Body { record: EntityRecord; ref: StoredBlobRef; bytes: Uint8Array; model?: ValidatedGlb }
export interface FrozenV1Material {
  sourceMaterialId: string; sourceSetId: string; sourceAssetId: string; sourceMaterialKey: string; sourceGlbSha256: string;
  childPath: number[]; materialArraySlot: 0; nodeIndex: number; primitiveIndex: number; sourceMaterialIndex: number | null;
  sourceLocator: JsonObject; sourceSemantics: JsonObject; selectedOccurrenceCount: 1; doubleSided: boolean; unlit: boolean;
}
export interface FrozenV1MaterialReport {
  appliedModelOffsets: number; materialEffects: { scenes: number; overrides: number; sourceOnlyChromaRows: number };
  sourceOnlyMaterialValues: { sourceMaterialId: string; field: string; value: JsonValue }[];
}
interface FrozenV1PlanBase {
  manifest: ProjectManifest; models: readonly FrozenV1Body[]; media: readonly FrozenV1Body[];
  scenes: readonly EntityRecord[]; captions: readonly EntityRecord[]; views: readonly EntityRecord[];
  fingerprints: readonly { path: string; role: string; byteLength: number; digest: string }[];
  inventory: { count: number; byteLength: number; digest: string };
}
interface FrozenV1Report { models: number; scenes: number; captions: number; media: number; originalExcludedFromExports: true;
  sourceOnly: { profiles: number; deletedRecords: number; caches: number; deletedPayloads: number; unlinkedPayloads: number; anchorNormals: number } }
export type FrozenV1Plan = FrozenV1PlanBase & ({ recipe: typeof frozenV1MaterialRecipe; materials: readonly FrozenV1Material[]; report: FrozenV1Report & FrozenV1MaterialReport } |
  { recipe: typeof frozenV1PlacementRecipe; report: FrozenV1Report & { appliedModelOffsets: number } } |
  { recipe: Exclude<FrozenV1Recipe, typeof frozenV1PlacementRecipe | typeof frozenV1MaterialRecipe>; report: FrozenV1Report });

/** Temporary decoder provenance only; the caller retains each model's original base catalog. */
async function materialProof(rows: readonly EntityRecord[], models: readonly FrozenV1Body[], sceneIds: ReadonlySet<string>, limits: FileValidationLimits, png?: PngDecoder, jpeg?: JpegDecoder) {
  if (rows.length > Math.min(limits.maxItems, validationMetadataLimits.maxNodes)) return fail();
  const materials: FrozenV1Material[] = [], values: FrozenV1MaterialReport['sourceOnlyMaterialValues'] = [], tuples = new Set<string>(), routes = new Set<string>();
  const byModel = new Map<string, EntityRecord[]>(), modelIds = new Set(models.map(m => m.record.id)); let work = 0;
  const charge = (n: number) => { work += n; if (!Number.isSafeInteger(work) || work > Math.min(limits.maxValues, validationMetadataLimits.maxWork)) fail(); };
  for (const row of rows) {
    charge(1); const v = checkMaterialFields(row.id, row.fields), bad = (field: string, reason: string) => materialFail(row.id, field, reason);
    if (!sceneIds.has(v.setId as string)) bad('setId', '有効なシーンへの対応を確認できません。');
    if (!modelIds.has(v.modelAssetId as string)) bad('modelAssetId', '有効なモデルへの対応を確認できません。');
    if (typeof v.materialKey !== 'string' || !v.materialKey.length) bad('materialKey', '保存済みの正確な対応が必要です。');
    if (v.opacity !== undefined && v.opacity !== 1) bad('opacity', '不透明な材質だけを変換できます。');
    if (v.chroma !== undefined && (v.chroma as Record<string, unknown>).enable !== false) bad('chroma.enable', '色の透過が無効な材質だけを変換できます。');
    const tuple = json([v.setId, v.modelAssetId, v.materialKey]); if (tuples.has(tuple)) bad('materialKey', '保存済みの対応が重複しています。'); tuples.add(tuple);
    const own = byModel.get(v.modelAssetId as string) ?? []; own.push(row); byModel.set(v.modelAssetId as string, own);
    if (Object.hasOwn(v, 'legacyKey')) values.push({ sourceMaterialId: row.id, field: 'legacyKey', value: v.legacyKey as boolean });
    if (v.chroma) for (const field of ['color', 'tol', 'tolerance', 'feather']) if (Object.hasOwn(v.chroma, field))
      values.push({ sourceMaterialId: row.id, field: `chroma.${field}`, value: (v.chroma as JsonObject)[field]! });
  }
  for (const model of models) {
    const own = byModel.get(model.record.id); if (!own) continue;
    const inspected = model.model!.jpeg ? await inspectOccurrenceJpegGlb(model.bytes, limits, png, jpeg) : await inspectOccurrenceGlb(model.bytes, limits, png);
    const decoded = await captureLegacyOccurrenceProof(inspected);
    {
      const keys = new Map<string, typeof decoded.rows[number][]>(), counts = new Map<number | null, number>();
      for (const slot of decoded.rows) {
        charge(1 + 2 * slot.childPath.length);
        const key = slot.v1Key, list = keys.get(key) ?? []; list.push(slot); keys.set(key, list);
        counts.set(slot.materialIndex, (counts.get(slot.materialIndex) ?? 0) + 1);
      }
      const catalog = new Map(model.model!.materials.map(m => [json(m.sourceLocator), m]));
      for (const row of own) {
        charge(1); const f = row.fields, found = keys.get(f.materialKey as string), bad = (reason: string) => materialFail(row.id, 'materialKey', reason);
        if (found?.length !== 1) bad('元モデルの正確な材質アドレスを一意に確認できません。');
        const slot = found![0]!; if (counts.get(slot.materialIndex) !== 1) bad('共有された元材質には対応していません。');
        const locator: JsonObject = slot.materialIndex === null ? { kind: 'representationMaterial', slotIndex: 0 } : { kind: 'gltfMaterial', materialIndex: slot.materialIndex };
        const source = catalog.get(json(locator)), semantics = source?.sourceSemantics as JsonObject | undefined;
        if (!semantics || json(semantics) !== json({ coverage: { kind: 'opaque' }, optics: 'surface', lighting: 'lit', doubleSided: false })) bad('不透明・陰影あり・表面のみの元材質だけを変換できます。');
        const route = json([f.setId, model.record.id, locator]); if (routes.has(route)) bad('同じシーンの材質対応が重複しています。'); routes.add(route);
        materials.push({ sourceMaterialId: row.id, sourceSetId: f.setId as string, sourceAssetId: model.record.id, sourceMaterialKey: f.materialKey as string,
          sourceGlbSha256: model.ref.digest, childPath: [...slot.childPath], materialArraySlot: 0, nodeIndex: slot.nodeIndex, primitiveIndex: slot.primitiveIndex,
          sourceMaterialIndex: slot.materialIndex, sourceLocator: locator, sourceSemantics: semantics!, selectedOccurrenceCount: 1,
          doubleSided: f.doubleSided === true, unlit: f.unlit === true || f.unlitLike === true });
      }
    }
  }
  materials.sort((a, b) => codeOrder(a.sourceMaterialId, b.sourceMaterialId)); values.sort((a, b) => codeOrder(a.sourceMaterialId, b.sourceMaterialId) || codeOrder(a.field, b.field));
  return { materials, values };
}

/** Read only, owned bytes and complete raw accounting; never the legacy writable importer. */
export async function inspectFrozenV1Source(input: Blob, limits: FileValidationLimits, decode?: PngDecoder, jpeg?: JpegDecoder, photo?: PhotoDecoder): Promise<{ plan: FrozenV1Plan; original: Uint8Array } | null> {
  checkFileLimits(limits); const file = input.slice();
  if (file.size > limits.maxFileBytes) return fileError('ファイルが検査の上限を超えています。');
  if (await inspectZipContainerIdentity(file) !== 'v1') return null;
  const original = await readValidationBody({ size: file.size, stream: () => file.stream() }, limits.maxFileBytes);
  const entries = await readZipEntries(original, { maxEntries: limits.maxItems, maxTotalBytes: limits.maxFileBytes, maxEntryBytes: limits.maxFileBytes });
  const files = new Map(entries.map(e => [e.path, e.data])), rawManifest = files.get('lociview.json')!;
  const m = limitedJson(rawManifest, limits), manifestKeys = ['format', 'schemaVersion', 'projectId', 'name', 'createdAt', 'generator'];
  if (Object.keys(m).sort().join(',') !== manifestKeys.sort().join(',')) fail();
  const manifest = parseCandidateV1ManifestBytes(rawManifest), located: LocatedV1Operation[] = [];
  const fingerprints: { path: string; role: string; byteLength: number; digest: string }[] = [];
  let jsonBytes = rawManifest.length;
  for (const entry of entries) {
    if (!entry.path.startsWith('ops/')) continue;
    const actor = v1OperationLogActor(entry.path, 'ops/'); if (!actor) fail();
    jsonBytes += entry.data.length; if (jsonBytes > limits.maxJsonBytes) fail();
    const parsed = parseOpsJsonl(new TextDecoder('utf-8', { fatal: true }).decode(entry.data), { candidateReadOnly: true });
    if (parsed.errors.length || located.length + parsed.entries.length > Math.min(limits.maxItems, validationMetadataLimits.maxOperations)) fail();
    for (const row of parsed.entries) {
      if (row.op.actor !== actor) fail(); checkSourceFields(row.op, limits);
      located.push({ ...row, source: entry.path });
    }
  }
  // Bound all retained nested values as one operation-owned input, not one budget per line.
  cloneCanonicalValue(located.map(r => r.op), validationMetadataLimits);
  const admitted = admitNonDivergentV1Operations(located); if (admitted.divergent.length) fail();
  const ops = admitted.accepted.map(r => r.op).sort((a, b) => codeOrder(a.actor, b.actor) || a.op - b.op);
  const assetKinds = new Map<string, { kind: string; hlc: string }>();
  for (const op of sortOps(ops)) if (op.e === 'asset' && op.v) {
    const old = assetKinds.get(op.id);
    if (op.v.kind !== undefined && (!old || codeOrder(op.hlc, old.hlc) > 0)) assetKinds.set(op.id, { kind: text(op.v.kind), hlc: op.hlc });
    if ((Object.hasOwn(op.v, 'transform') || Object.hasOwn(op.v, 'pinScale')) &&
      (op.v.kind === 'image' || assetKinds.get(op.id)?.kind !== 'model')) fail();
  }
  const inventory = { count: ops.length, ...await byteProof(new TextEncoder().encode(json(ops))) }, state = reduce(ops);
  const scenes = visibleEntities(state, 'set'); for (const scene of scenes) fileNumber(scene.fields.order);
  scenes.sort((a, b) => Number(a.fields.order) - Number(b.fields.order));
  if (!scenes.length || new Set(scenes.map(s => s.fields.order)).size !== scenes.length || visibleEntities(state, 'meta').length) fail();
  const sceneIds = new Set(scenes.map(s => s.id)), assets = visibleEntities(state, 'asset');
  const models: FrozenV1Body[] = [], media: FrozenV1Body[] = [], activePaths = new Set<string>();
  for (const record of assets) {
    const f = record.fields, kind = text(f.kind), path = text(f.path), bytes = files.get(path);
    if (!['model', 'image'].includes(kind) || sanitizeZipPath(path) !== path ||
      !(kind === 'model' ? path.startsWith('models/') : /^(media|thumbs)\//.test(path)) || !bytes) fail();
    if (kind === 'image' && (Object.hasOwn(f, 'transform') || Object.hasOwn(f, 'pinScale'))) fail();
    text(f.originalName);
    const mediaType = kind === 'model' ? 'model/gltf-binary' : await inspectProjectImage(bytes!, limits, decode, jpeg, photo);
    const ref: StoredBlobRef = { algorithm: 'sha256', digest: await digest(bytes!), byteLength: bytes!.length, mediaType };
    if (f.mime !== undefined && f.mime !== '' && f.mime !== mediaType || f.size !== undefined && f.size !== ref.byteLength || f.sha256 !== undefined && f.sha256 !== ref.digest) fail();
    const body: FrozenV1Body = { record, ref, bytes: bytes! };
    if (kind === 'model') { body.model = await inspectFreshValidationGlb(bytes!, limits, decode, jpeg); models.push(body); }
    else media.push(body);
    activePaths.add(path);
  }
  if (!models.length) fail(); models.sort((a, b) => codeOrder(a.record.id, b.record.id)); media.sort((a, b) => codeOrder(a.record.id, b.record.id));
  const modelIds = new Set(models.map(m => m.record.id)), imageIds = new Set(media.map(m => m.record.id));
  const order = (kind: string) => {
    const rows = visibleEntities(state, kind), keys = new Set<string>();
    for (const row of rows) {
      if (!sceneIds.has(text(row.fields.setId)) || !row.createdAt) fail();
      const key = `${row.fields.setId}/${row.createdAt}`; if (keys.has(key)) fail(); keys.add(key);
    }
    return rows.sort((a, b) => codeOrder(a.createdAt!, b.createdAt!));
  };
  const captions = order('caption'), views = order('view');
  for (const c of captions) {
    text(c.fields.title); text(c.fields.body); sourceColor(c.fields.color);
    const a = c.fields.anchor; if (a !== undefined && a !== null && !modelIds.has(text(fileObject(a).modelAssetId))) fail();
    for (const id of (c.fields.attachments ?? []) as string[]) if (!imageIds.has(id)) fail();
  }
  for (const v of views) { text(v.fields.name); if (!v.fields.cameraState) fail(); sourceColor(v.fields.background); }
  for (const scene of scenes) {
    text(scene.fields.name); const own = views.filter(v => v.fields.setId === scene.id).sort((a, b) => codeOrder(b.lastWrite!, a.lastWrite!));
    if (own.length > 1 && own[0]!.lastWrite === own[1]!.lastWrite) fail();
    if (scene.fields.defaultViewId != null && !own.some(v => v.id === scene.fields.defaultViewId)) fail();
  }
  const deleted = Object.values(state.byKind).flatMap(Object.values).filter(r => !isVisible(r)), deletedPaths = new Set(deleted.filter(r => r.kind === 'asset').map(r => r.fields.path));
  const sourceOnly = { profiles: visibleEntities(state, 'profile').length, deletedRecords: deleted.length, caches: 0, deletedPayloads: 0, unlinkedPayloads: 0,
    anchorNormals: captions.filter(c => c.fields.anchor && Object.hasOwn(fileObject(c.fields.anchor), 'normal')).length };
  for (const entry of entries) {
    let role: string;
    if (entry.path === 'lociview.json') role = 'manifest';
    else if (entry.path.startsWith('ops/')) role = 'log';
    else if (entry.path === 'snapshot.json' || entry.path === 'captions.csv') { role = 'cache'; sourceOnly.caches++; }
    else if (activePaths.has(entry.path)) role = 'active-payload';
    else if (/^(models|media|thumbs)\//.test(entry.path)) {
      if (deletedPaths.has(entry.path)) { role = 'deleted-payload'; sourceOnly.deletedPayloads++; }
      else { role = 'unlinked-payload'; sourceOnly.unlinkedPayloads++; }
    } else return fail();
    fingerprints.push({ path: entry.path, role, ...await byteProof(entry.data) });
  }
  fingerprints.sort((a, b) => codeOrder(a.path, b.path));
  // A historical nonnull default binds the new domain even if it later loses or its Set is deleted.
  const explicitDefaultHistory = ops.some(op => op.e === 'set' && op.v && Object.hasOwn(op.v, 'defaultViewId') && op.v.defaultViewId !== null);
  const placementHistory = ops.some(op => op.e === 'asset' && op.v?.transform !== undefined && nonidentity(frozenV1Placement(op.v.transform)));
  const base = { manifest, models, media, scenes, captions, views, fingerprints, inventory },
    report: FrozenV1Report = { models: models.length, scenes: scenes.length, captions: captions.length, media: media.length, sourceOnly, originalExcludedFromExports: true };
  if (ops.some(op => op.e === 'material')) {
    checkPlacementReadiness(models, captions, views);
    const { materials, values } = await materialProof(visibleEntities(state, 'material').sort((a, b) => codeOrder(a.id, b.id)), models, sceneIds, limits, decode, jpeg);
    return { original, plan: { ...base, recipe: frozenV1MaterialRecipe, materials, report: { ...report,
      appliedModelOffsets: models.filter(m => frozenV1Placement(m.record.fields.transform).translation.some(n => n !== 0)).length,
      materialEffects: { scenes: new Set(materials.map(m => m.sourceSetId)).size, overrides: materials.length,
        sourceOnlyChromaRows: new Set(values.filter(v => v.field.startsWith('chroma.')).map(v => v.sourceMaterialId)).size }, sourceOnlyMaterialValues: values } } };
  }
  if (placementHistory) {
    checkPlacementReadiness(models, captions, views);
    const appliedModelOffsets = models.filter(m => frozenV1Placement(m.record.fields.transform).translation.some(n => n !== 0)).length;
    return { original, plan: { ...base, recipe: frozenV1PlacementRecipe, report: { ...report, appliedModelOffsets } } };
  }
  return { original, plan: { ...base, recipe: explicitDefaultHistory ? frozenV1DefaultViewRecipe : media.some(m => m.ref.mediaType === 'image/webp' || m.ref.mediaType === 'image/gif') ? frozenV1PhotoRecipe : models.some(m => m.model?.jpeg) || media.some(m => m.ref.mediaType === 'image/jpeg') ? frozenV1JpegRecipe : frozenV1Recipe, report } };
}
