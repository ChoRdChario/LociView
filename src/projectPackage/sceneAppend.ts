import * as A from '@automerge/automerge/slim';
import { immutableKinds, object } from '../domain/projectGraphSupport';
import { projectRecordMaps } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { recordBlobRefs } from '../domain/portableMedia';
import type { JsonObject } from '../domain/values';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { editorMessage, localEditorMessageMatches, type LocalEditorContext } from '../projectMetadata/editorAttribution';
import { checkedProof, fail, scalar, type MetadataLimits, type MetadataProof, type PhysicalDoc } from '../projectMetadata/format';
import { digest, equalBytes, json, readReceipt, technicalId, writeReceipt } from '../projectMetadata/persistence';
import type { ProjectMetadataSource } from '../projectMetadata/source';
import { type CleanReconstruction } from './cleanRecords';
import { packageReference } from './cleanInputDescriptor';
import type { EvidenceRef } from './contract';
import type { ReviewArchive } from './reviewArchive';
import { prepareReviewEdit } from './reviewSnapshot';

const maps = Object.keys(projectRecordMaps) as (keyof typeof projectRecordMaps)[];
const frame = (project: JsonObject) => object(project.frame);
const unit = (value: JsonObject) => object(value.unit).metersPerProjectUnit;
const root = (fs: ProjectWorkspaceFS) => `${fs.projectRoot ? `${fs.projectRoot}/` : ''}v2/packages/scene-append/`;
const path = (fs: ProjectWorkspaceFS, id: string) => `${root(fs)}${technicalId(id)}/`;
const table = (record: JsonObject, map: string) => object(record[map]);

export interface SceneAppendInput {
  schema: 'lociview-scene-append-1'; id: string; archive: EvidenceRef; snapshot: EvidenceRef;
  proof: MetadataProof; predecessor: string; baseHeads: readonly string[];
  sceneId: string; recipe: CleanReconstruction; change: EvidenceRef; records: EvidenceRef;
  blobs: JsonObject[]; stagedBlobs: JsonObject[];
}
export type SceneAppendState = { id: string; state: 'unbound' | 'input-required' | 'prepared' | 'repair-required'; cancellable?: boolean };

export function sceneAppendCompatibility(base: ProjectMetadataSource, review: ReviewArchive) {
  if (base.semanticProfile !== review.review.semanticProfile) return 'プロジェクトの保存形式が異なります。';
  const target = unit(base.projectFrame());
  const incoming = unit(frame(object(review.review.snapshot.project)));
  if (typeof target !== 'number' || typeof incoming !== 'number') return 'シーンまたは追加先の単位を確認できません。';
  return target !== incoming ? 'シーンと追加先の単位が異なります。' : '';
}

function native(base: ProjectMetadataSource) { return A.applyChanges(A.init<PhysicalDoc>(), base.originalChanges())[0]; }

function addition(doc: A.Doc<PhysicalDoc>, records: JsonObject, limits: MetadataLimits, message: string) {
  return A.getLastLocalChange(A.change(A.clone(doc), { message }, draft => {
    for (const map of maps) for (const [id, value] of Object.entries(table(records, map))) {
      if (Object.hasOwn(immutableKinds, map)) draft[map][id] = scalar(value, limits);
      else {
        draft[map][id] = {};
        for (const [field, fieldValue] of Object.entries(object(value))) draft[map][id][field] = scalar(fieldValue, limits);
      }
    }
  })) ?? fail('scene-append-empty');
}

/** Read the exact original change. Existing objects may only serve as parent collections. */
function addedRecords(doc: A.Doc<PhysicalDoc>, bytes: Uint8Array, id: string, limits: MetadataLimits) {
  const change = A.decodeChange(bytes);
  if (!localEditorMessageMatches(change.message, id, limits) || json(change.deps.sort()) !== json(A.getHeads(doc).sort()) ||
    change.ops.length > limits.maxOperations) return fail('scene-append-change');
  const records = Object.fromEntries(maps.map(map => [map, Object.create(null)])) as Record<string, Record<string, JsonObject>>;
  const collections = new Map(maps.map(map => [A.getObjectId(doc[map]), map]));
  const fields = new Map<string, Record<string, unknown>>();
  const used = new Set(maps.flatMap(map => Object.keys(doc[map])));
  for (const [offset, op] of change.ops.entries()) {
    if (op.pred.length || ('insert' in op && op.insert) || typeof op.key !== 'string') return fail('scene-append-write');
    const map = collections.get(op.obj);
    if (map) {
      if (used.has(op.key) || !new RegExp(`^${projectRecordMaps[map]}_[0-9a-f]{32}$`).test(op.key)) return fail('scene-append-write');
      used.add(op.key);
      if (op.action === 'makeMap' && !Object.hasOwn(immutableKinds, map)) {
        const record = Object.create(null);
        records[map]![op.key] = record;
        fields.set(`${change.startOp + offset}@${change.actor}`, record);
        continue;
      }
      if (op.action !== 'set' || !Object.hasOwn(immutableKinds, map)) return fail('scene-append-write');
      records[map]![op.key] = object(JSON.parse(op.value as string));
    } else {
      const record = fields.get(op.obj);
      if (!record || Object.hasOwn(record, op.key) || op.action !== 'set' || typeof op.value !== 'string' || op.datatype !== undefined)
        return fail('scene-append-write');
      record[op.key] = JSON.parse(op.value);
    }
  }
  return records;
}

export function validatePreparedSceneAppend(base: ProjectMetadataSource, bytes: Uint8Array, input: SceneAppendInput, limits: MetadataLimits) {
  const records = addedRecords(native(base), bytes, input.id, limits);
  if (json(packageReference(records)) !== json(input.records) || Object.keys(records.scenesById!).join(',') !== input.sceneId ||
    json(blobInventory(records)) !== json(input.blobs))
    return fail('scene-append-records');
}

function blobInventory(records: JsonObject) {
  const blobs = new Map<string, JsonObject>();
  for (const map of ['representationsById', 'mediaResourcesById']) for (const record of Object.values(table(records, map)))
    for (const blob of recordBlobRefs(object(record))) blobs.set(json(blob), blob);
  return [...blobs.keys()].sort().map(key => blobs.get(key)!);
}

export async function planSceneAppend(base: ProjectMetadataSource, review: ReviewArchive, limits: MetadataLimits, id: string,
  editor?: LocalEditorContext, saved?: { input: SceneAppendInput; bytes: Uint8Array }) {
  const reason = sceneAppendCompatibility(base, review);
  if (reason) throw Error(reason);
  const { records, reconstruction } = await prepareReviewEdit(review.review, limits, saved?.input.recipe);
  const targetFrame = base.projectFrame(), doc = native(base);
  const scenes = Object.values(table(records, 'scenesById')).map(object);
  if (scenes.length !== 1) return fail('scene-append-count');
  const scene = scenes[0]!, sceneId = scene.id as string;
  const existingIds = new Set<string>();
  for (const map of maps) for (const id of Object.keys(doc[map])) existingIds.add(id);
  for (const scalar of (await base.inspectOriginal({ maxNodes: limits.maxNodes, maxWork: limits.maxWork })).scalars) {
    if (scalar.value.kind !== 'value') continue;
    const pending = [scalar.value.value];
    while (pending.length) {
      const value = pending.pop();
      if (typeof value === 'string' && /^[a-z]+_[0-9a-f]{32}$/.test(value)) existingIds.add(value);
      else if (value && typeof value === 'object') for (const field of Object.values(value)) pending.push(field);
    }
  }
  if (reconstruction.idMap.some(row => existingIds.has(row.to)) || reconstruction.lifecycles.some(row => existingIds.has(row.eventId))) fail('scene-append-id');
  const order = Object.values(doc.scenesById as Record<string, Record<string, unknown>>).flatMap(value => {
    if (A.getConflicts(value, 'lifecycle')) return fail('scene-append-order');
    if (JSON.parse(String(value.lifecycle)).state !== 'active') return [];
    if (A.getConflicts(value, 'orderKey')) return fail('scene-append-order');
    return [JSON.parse(String(value.orderKey)) as string];
  }).sort().at(-1);
  if (order !== undefined && (typeof order !== 'string' || !/^[0-9A-Za-z]{1,64}$/.test(order))) return fail('scene-append-order');
  const tail = order ?? '';
  const position = tail.length < 64 ? tail.length : [...tail].findLastIndex(letter => letter !== 'z');
  if (position < 0) return fail('scene-append-order');
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  Object.assign(scene, { orderKey: tail.slice(0, position) + alphabet[tail.length < 64 ? 30 : alphabet.indexOf(tail[position]!) + 1] });
  for (const value of Object.values(table(records, 'captionsById'))) {
    const anchor = object(object(value).anchor);
    if (anchor.kind === 'project') Object.assign(anchor, { projectFrameId: targetFrame.id });
  }
  for (const value of Object.values(table(records, 'viewsById'))) Object.assign(object(value), { projectFrameId: targetFrame.id });
  const inventory = blobInventory(records);
  const snapshot = review.archive.control.entries.find(entry => entry.path === 'review.json')!;
  const archive = { sha256: review.archive.sha256, byteLength: review.archive.byteLength };
  const snapshotRef = { sha256: snapshot.sha256, byteLength: snapshot.byteLength };
  const recordsRef = packageReference(Object.fromEntries(maps.map(map => [map, records[map]])));
  const bytes = saved?.bytes ?? addition(doc, records, limits, editorMessage(id, editor));
  if (saved) {
    if (saved.input.sceneId !== sceneId || json(saved.input.blobs) !== json(inventory) || json(saved.input.records) !== json(recordsRef) ||
      json(saved.input.snapshot) !== json(snapshotRef) || json(saved.input.archive) !== json(archive)) return fail('scene-append-originals');
    validatePreparedSceneAppend(base, bytes, saved.input, limits);
  }
  return { next: base.appendOriginal([bytes]), bytes, sceneId, reconstruction, blobs: inventory, archive, snapshot: snapshotRef, records: recordsRef };
}

export async function readSceneAppend(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
  const dir = path(fs, id);
  const input = await readReceipt<SceneAppendInput>(fs, `${dir}input.json`, limits);
  const bound = await readReceipt(fs, `${dir}bound.json`, limits);
  const abandoned = await readReceipt(fs, `${dir}abandoned.json`, limits);
  if (!input || Object.keys(input).sort().join(',') !== 'archive,baseHeads,blobs,change,id,predecessor,proof,recipe,records,sceneId,schema,snapshot,stagedBlobs' ||
    input.schema !== 'lociview-scene-append-1' || input.id !== id || !/^scn_[0-9a-f]{32}$/.test(input.sceneId) ||
    !Array.isArray(input.baseHeads) || !input.baseHeads.length || input.baseHeads.some(head => !/^[0-9a-f]{64}$/.test(head)) ||
    json([...new Set(input.baseHeads)].sort()) !== json(input.baseHeads) || input.recipe?.schema !== 'lociview-clean-reconstruction-1' ||
    !Array.isArray(input.recipe.idMap) || !Array.isArray(input.recipe.lifecycles)) return fail('scene-append-input');
  technicalId(input.predecessor); checkedProof(input.proof, limits);
  for (const ref of [input.archive, input.snapshot, input.change, input.records]) {
    if (!ref || Object.keys(ref).sort().join(',') !== 'byteLength,sha256' || !Number.isSafeInteger(ref.byteLength) || ref.byteLength <= 0 ||
      !/^[0-9a-f]{64}$/.test(ref.sha256)) return fail('scene-append-reference');
  }
  const all = new Set<string>();
  for (const inventory of [input.blobs, input.stagedBlobs]) {
    if (!Array.isArray(inventory) || inventory.length > limits.maxNodes) return fail('scene-append-inventory');
    let prior = '';
    for (const blob of inventory) {
      const checked = new ProjectRecordFields(); checked.blob(blob, []);
      const key = json(blob);
      if (checked.unknown || key <= prior || inventory === input.stagedBlobs && !all.has(key)) return fail('scene-append-inventory');
      prior = key; all.add(key);
    }
  }
  const change = await fs.readStream(`${dir}change.amchange`);
  if (change && (change.size !== input.change.byteLength || change.size > limits.maxChangeBytes)) return fail('scene-append-part');
  const bytes = change ? await fs.readBytes(`${dir}change.amchange`) : null;
  if (change && (!bytes || bytes.length !== change.size || await digest(bytes) !== input.change.sha256)) return fail('scene-append-part');
  const expected = { schema: 'lociview-scene-append-bound-1', input: packageReference(input), change: input.change };
  if (bound && (!bytes || json(bound) !== json(expected))) return fail('scene-append-bound');
  const binding = bound ? packageReference(expected) : null;
  const stop = { schema: 'lociview-scene-append-abandoned-1', id, input: packageReference(input), bound: binding };
  if (abandoned && json(abandoned) !== json(stop)) return fail('scene-append-abandoned');
  return { input, bytes, binding, abandoned: !!abandoned, stop, expected };
}

export async function writeSceneAppend(fs: ProjectWorkspaceFS, input: SceneAppendInput, bytes: Uint8Array, limits: MetadataLimits) {
  const dir = path(fs, input.id);
  await writeReceipt(fs, `${dir}input.json`, input, limits);
  await fs.writeBytes(`${dir}change.amchange`, bytes);
  const read = await readSceneAppend(fs, input.id, limits);
  if (!read.bytes || !equalBytes(read.bytes, bytes)) return fail('scene-append-part-write');
  await writeReceipt(fs, `${dir}bound.json`, read.expected, limits);
  return readSceneAppend(fs, input.id, limits);
}

export async function abandonSceneAppend(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
  const read = await readSceneAppend(fs, id, limits);
  await writeReceipt(fs, `${path(fs, id)}abandoned.json`, read.stop, limits);
}

export async function sceneAppendIds(fs: ProjectWorkspaceFS, limits: MetadataLimits) {
  const prefix = root(fs), paths = await fs.list(prefix);
  if (paths.length > limits.maxChanges * 4) return fail('scene-append-count');
  return [...new Set(paths.map(value => {
    const m = /^([0-9a-f]{32})\/(input\.json|change\.amchange|bound\.json|abandoned\.json)$/.exec(value.slice(prefix.length));
    return m?.[1] ?? fail('scene-append-path');
  }))];
}
