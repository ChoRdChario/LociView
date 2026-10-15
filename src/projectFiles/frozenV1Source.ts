import { inspectProjectImage, type PhotoDecoder } from './photo';
import { inspectZipContainerIdentity, readZipEntries, sanitizeZipPath } from '../assets/zipio';
import { parseCandidateV1ManifestBytes, type ProjectManifest } from '../core/manifest';
import { parseOpsJsonl, v1OperationLogActor } from '../core/jsonl';
import { admitNonDivergentV1Operations, type LocatedV1Operation } from '../core/operationAdmission';
import { reduce, sortOps, visibleEntities, isVisible, type EntityRecord } from '../core/reduce';
import type { Op } from '../core/schema';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { digest, json } from '../projectMetadata/persistence';
import type { StoredBlobRef } from '../projectMetadata/blobStore';
import { readValidationBody } from './content';
import { inspectFreshValidationGlb, type ValidatedGlb } from './glb';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { checkFileLimits, fileError, fileObject, fileList, fileNumber, fileVector, limitedJson, validationMetadataLimits, type FileValidationLimits } from './validation';

export const frozenV1Recipe = 'v1-project-scene-migration-recipe-1';
export const frozenV1JpegRecipe = 'v1-project-scene-migration-recipe-2';
export const frozenV1PhotoRecipe = 'v1-project-scene-migration-recipe-3';
export const frozenV1DefaultViewRecipe = 'v1-project-scene-migration-recipe-4';
export type FrozenV1Recipe = typeof frozenV1DefaultViewRecipe | typeof frozenV1PhotoRecipe | typeof frozenV1Recipe | typeof frozenV1JpegRecipe;
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

function checkSourceFields(op: Op, limits: FileValidationLimits) {
  const fields: Record<string, string[]> = {
    set: ['name', 'order', 'defaultViewId', 'defaultCameraState'],
    asset: ['kind', 'path', 'originalName', 'mime', 'size', 'sha256', 'transform', 'pinScale'],
    caption: ['setId', 'title', 'body', 'color', 'tags', 'attachments', 'anchor'],
    view: ['setId', 'name', 'cameraState', 'background'], profile: ['displayName', 'defaultPinColor'], meta: [],
  };
  if (!Object.hasOwn(fields, op.e)) fail();
  if (!op.v) return;
  const v = closed(op.v, fields[op.e]!);
  if (op.e === 'set') {
    if (Object.hasOwn(v, 'order')) fileNumber(v.order);
    if (Object.hasOwn(v, 'defaultCameraState') || Object.hasOwn(v, 'defaultViewId') && v.defaultViewId !== null &&
      (typeof v.defaultViewId !== 'string' || !/^view_[0-7][0123456789ABCDEFGHJKMNPQRSTVWXYZ]{25}$/u.test(v.defaultViewId))) fail();
  }
  if (op.e === 'asset') {
    if (v.kind !== undefined && !['model', 'image'].includes(text(v.kind))) fail();
    if (v.transform !== undefined) {
      const t = closed(v.transform, ['scale', 'upAxis', 'offset']);
      if (t.scale !== undefined && t.scale !== 1 || t.upAxis !== undefined && t.upAxis !== 'Y' ||
        t.offset !== undefined && vector(t.offset).some(n => n !== 0)) fail();
    }
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
export interface FrozenV1Plan {
  recipe: FrozenV1Recipe;
  manifest: ProjectManifest; models: readonly FrozenV1Body[]; media: readonly FrozenV1Body[];
  scenes: readonly EntityRecord[]; captions: readonly EntityRecord[]; views: readonly EntityRecord[];
  fingerprints: readonly { path: string; role: string; byteLength: number; digest: string }[];
  inventory: { count: number; byteLength: number; digest: string };
  report: { models: number; scenes: number; captions: number; media: number; originalExcludedFromExports: true;
    sourceOnly: { profiles: number; deletedRecords: number; caches: number; deletedPayloads: number; unlinkedPayloads: number; anchorNormals: number } };
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
  return { original, plan: { recipe: explicitDefaultHistory ? frozenV1DefaultViewRecipe : media.some(m => m.ref.mediaType === 'image/webp' || m.ref.mediaType === 'image/gif') ? frozenV1PhotoRecipe : models.some(m => m.model?.jpeg) || media.some(m => m.ref.mediaType === 'image/jpeg') ? frozenV1JpegRecipe : frozenV1Recipe, manifest, models, media, scenes, captions, views, fingerprints, inventory,
    report: { models: models.length, scenes: scenes.length, captions: captions.length, media: media.length, sourceOnly, originalExcludedFromExports: true } } };
}
