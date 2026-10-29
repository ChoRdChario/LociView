import { parseJsonWithoutDuplicateMembers } from '../core/json';
import { inspectProjectGraph } from '../domain/projectGraph';
import { canonical, immutableDigest, immutableKinds, list, object, same, string } from '../domain/projectGraphSupport';
import { checkMutableField, mutableFieldsFor, type MutableRecordMap } from '../domain/projectMutableFields';
import type { ProjectSemanticProfile } from '../domain/projectProfile';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { recordBlobRefs } from '../domain/portableMedia';
import { checkProjectHeader, checkProjectRecord, projectRecordMaps } from '../domain/projectRecords';
import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../domain/values';
import type { StoredBlobRef } from '../projectMetadata/blobStore';
import type { MetadataLimits } from '../projectMetadata/source';
import { PORTABLE_MEDIA_CAPABILITY, type ReaderCapabilities } from '../projectMetadata/requiredCapabilities';
import { prepareCleanRecords, type CleanReconstruction } from './cleanRecords';
import { PACKAGE_LIMITS as L, summaryAlgorithm, type AutomaticSummary, type Entry } from './contract';
import { packageByteHash, PackageControlError } from './manifest';

export const REVIEW_SCHEMA = Object.freeze({ kind: 'lociview-project-scene-review', version: '1' });
const REVIEW_SCHEMA2 = Object.freeze({ kind: 'lociview-project-scene-review', version: '2' });
export const reviewSchema = (profile: ProjectSemanticProfile) => profile === 'map2' ? REVIEW_SCHEMA2 : REVIEW_SCHEMA;
export function reviewSemanticProfile(schema: JsonValue | undefined): ProjectSemanticProfile {
  if (same(schema, REVIEW_SCHEMA)) return 'map1';
  if (same(schema, REVIEW_SCHEMA2)) return 'map2';
  return fail('schema');
}
export const reviewMaps = ['assetsById', 'representationsById', 'captionsById', 'mediaResourcesById', 'captionAttachmentsById',
  'captionTagsById', 'captionTagMembershipsById', 'sceneAssetMembershipsById', 'sceneCaptionMembershipsById', 'viewsById', 'materialOverridesById'] as const;
export type ReviewMap = typeof reviewMaps[number];
export function reviewCapabilities(review: ReviewSnapshot): ReaderCapabilities {
  return Object.values(table(review.snapshot, 'mediaResourcesById')).some(r => r.portableDisplay !== undefined) ? [PORTABLE_MEDIA_CAPABILITY] : [];
}
const fail = (code: string): never => { throw new PackageControlError(`review-${code}`); };
const table = (r: JsonObject, map: string) => object(r[map]) as Record<string, JsonObject>;
const encode = (r: JsonObject) => new TextEncoder().encode(canonical(r));
const setsEqual = (a: Iterable<string>, b: Iterable<string>) => same([...new Set(a)].sort(), [...new Set(b)].sort());
class ClosedFields extends ProjectRecordFields {
  constructor(private readonly charge: (n: number) => void, profile: ProjectSemanticProfile) { super(profile); }
  override shape(v: JsonValue, keys: readonly string[], p: readonly string[]) {
    const r = super.shape(v, keys, p); this.charge(1 + Object.keys(r).length); if (this.unknown) fail('unknown-field'); return r;
  }
  override list(v: JsonValue, max: number, p: readonly string[], min = 0) {
    const result = super.list(v, max, p, min); this.charge(1 + result.length); return result;
  }
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value;
}

function reviewLimits(limits: MetadataLimits) {
  for (const n of Object.values(limits)) if (!Number.isSafeInteger(n) || n < 0) fail('limits');
  return { maxDepth: Math.min(limits.maxDepth, L.maxDepth), maxNodes: Math.min(limits.maxNodes, limits.maxWork, L.maxNodes),
    maxStringScalars: Math.min(limits.maxStringScalars, L.maxStringScalars), maxBytes: Math.min(limits.maxTotalBytes, L.snapshotBytes),
    maxWork: Math.min(limits.maxWork, L.closureWork) };
}
/** Bound canonical size and derived graph work BEFORE allocating encoded bytes or hashing records. */
function snapshotBudget(root: JsonObject, bounds: ReturnType<typeof reviewLimits>) {
  let work = 0, bytes = 0;
  const charge = (n = 1) => { if ((work += n) > bounds.maxWork) fail('work-budget'); };
  const stack: JsonValue[] = [root], encoder = new TextEncoder();
  const addBytes = (n: number) => { if ((bytes += n) > bounds.maxBytes) fail('bytes'); };
  while (stack.length) {
    charge(); const v = stack.pop()!;
    if (v === null || typeof v !== 'object') addBytes(encoder.encode(JSON.stringify(v)).length);
    else if (Array.isArray(v)) { addBytes(2 + Math.max(0, v.length - 1)); for (const item of v) stack.push(item); }
    else { const entries = Object.entries(v); addBytes(2 + Math.max(0, entries.length - 1));
      for (const [key, item] of entries) { charge(); addBytes(encoder.encode(JSON.stringify(key)).length + 1); stack.push(item); } }
  }
  return charge;
}

/** Valid snapshot metadata only. Not content verification, a Project, history, or a write capability. */
export interface ReviewSnapshot {
  readonly semanticProfile: ProjectSemanticProfile;
  readonly kind: 'review-snapshot'; readonly snapshot: JsonObject; readonly token: string;
  readonly closure: { readonly entries: readonly Entry[]; readonly semanticRefs: readonly StoredBlobRef[] };
  readonly summary: AutomaticSummary;
  readonly editEffect: { readonly missingModelCaptions: number; readonly newlyNeedsReviewCaptions: number };
}

export async function readReviewSnapshot(bytes: Uint8Array, limits: MetadataLimits): Promise<ReviewSnapshot> {
  const bounds = reviewLimits(limits);
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > bounds.maxBytes) return fail('bytes');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const snapshot = cloneCanonicalValue(parseJsonWithoutDuplicateMembers(text, bounds), bounds) as JsonObject;
  snapshotBudget(snapshot, bounds);
  const encoded = encode(snapshot);
  if (encoded.length !== bytes.length || encoded.some((b, i) => b !== bytes[i])) fail('canonical');
  return inspectReviewSnapshot(snapshot, limits);
}

/** Validate before deriving any omitted domain scaffolding; never normalize away unknown fields. */
export async function inspectReviewSnapshot(input: unknown, limits: MetadataLimits): Promise<ReviewSnapshot> {
  const bounds = reviewLimits(limits), cloned = cloneCanonicalValue(input, bounds) as JsonObject, charge = snapshotBudget(cloned, bounds);
  const profile = reviewSemanticProfile(cloned?.schema), mutableRecordFields = mutableFieldsFor(profile);
  const c = new ClosedFields(charge, profile), root = c.shape(cloned, ['schema', 'snapshotId', 'project', 'scene', ...reviewMaps], []);
  c.id(c.required(root, 'snapshotId', []), 'snp', ['snapshotId']);
  const project = c.shape(c.required(root, 'project', []), ['title', 'frame', 'defaultSceneId'], ['project']);
  for (const k of ['title', 'frame', 'defaultSceneId']) checkProjectHeader(c, k, c.required(project, k, ['project']));
  const scene = c.shape(c.required(root, 'scene', []), ['id', 'name', 'orderKey', 'defaultViewId'], ['scene']);
  const life = { state: 'active', reason: 'initial', eventId: `evt_${'0'.repeat(32)}` };
  checkProjectRecord(c, 'scenesById', { ...scene, lifecycle: life }); c.id(scene.id!, 'scn', ['scene', 'id']);
  if (project.defaultSceneId !== scene.id) fail('default-scene');
  let count = 1;
  for (const map of reviewMaps) {
    const records = c.object(c.required(root, map, []), [map]); count += Object.keys(records).length;
    if (count > L.closureRecords) fail('record-budget');
    for (const [key, value] of Object.entries(records)) {
      c.id(key, projectRecordMaps[map], [map, key]); const r = c.object(value, [map, key]);
      if (r.id !== key) fail('record-id');
      if (map === 'assetsById') {
        c.enum(c.required(r, 'kind', []), profile === 'map2' ? ['visual', 'nonvisualOwner', 'unplacedOwner'] : ['visual', 'nonvisualOwner'], []);
        const fields = r.kind === 'visual' ? ['kind', 'id', 'label', 'assetFrameId', 'assetToProject', 'compatibleAnchorClassIds', 'representationIds', 'anchorClassPartition'] :
          r.kind === 'unplacedOwner' ? ['kind', 'id', 'assetFrameId'] : ['kind', 'id', 'assetFrameId', 'assetToProject'];
        c.shape(r, profile === 'map2' ? [...fields, 'pinScale'] : fields, [map, key]);
        c.id(c.required(r, 'assetFrameId', []), 'frm', []);
        if (r.kind !== 'unplacedOwner') c.transform(c.required(r, 'assetToProject', []), []);
        if (r.pinScale !== undefined) checkMutableField(c, 'assetsById', 'pinScale', r.pinScale);
        if (r.kind === 'visual') {
          c.text(c.required(r, 'label', []), 256, []);
          c.sorted(c.required(r, 'representationIds', []), [], (v, p) => c.id(v, 'rep', p), 1);
          c.sorted(c.required(r, 'compatibleAnchorClassIds', []), [], (v, p) => c.id(v, 'cmp', p));
          let previous = '';
          for (const value of c.list(c.required(r, 'anchorClassPartition', []), 4096, [], 1)) {
            const entry = c.shape(value, ['id', 'targetVariantFamilyIds'], []), id = c.id(c.required(entry, 'id', []), 'cmp', []);
            if (id <= previous) fail('partition-order'); previous = id;
            c.sorted(c.required(entry, 'targetVariantFamilyIds', []), [], (v, p) => c.id(v, 'fam', p), 1);
          }
        }
      } else if (map === 'representationsById') {
        c.shape(r, ['id', 'assetId', 'representationFrameId', 'contentKind', 'purposes', 'role', 'variantFamilyId', 'formatProfile', 'blob', 'representationToAsset',
          'logicalBoundsAsset', 'materialCatalog', 'compositeGroupId', 'targetGsVariantFamilyIds', 'proxyForGsVariantFamilyId'], [map, key]);
        checkProjectRecord(c, map, { ...r, derivedFrom: [], payloadDigest: '0'.repeat(64) });
        if (list(r.purposes).includes('source')) fail('source-purpose');
      } else if (map === 'mediaResourcesById') {
        checkProjectRecord(c, map, r);
      } else {
        c.shape(r, Object.keys(mutableRecordFields[map as MutableRecordMap]).filter(k => k !== 'lifecycle'), [map, key]);
        checkProjectRecord(c, map, { ...r, lifecycle: life });
        if (map === 'captionsById') {
          const anchor = object(r.anchor); if (anchor.authoredAssetRevisionId !== undefined || anchor.hitEvidence && object(anchor.hitEvidence).source !== undefined) fail('anchor-provenance');
        }
      }
    }
  }
  // The general Project graph has bounded nested class/slot comparisons. Charge
  // their actual potential fanout here rather than letting a small caller budget
  // pay an uncounted captions×classes or materials×catalogs scan.
  const assetWork = new Map<string, { classes: number; slots: number }>();
  for (const a of Object.values(table(root, 'assetsById'))) {
    charge(); if (a.kind !== 'visual') continue;
    let slots = 0;
    for (const repId of list(a.representationIds)) {
      charge(); const r = table(root, 'representationsById')[string(repId)]; if (!r) fail('missing-representation');
      slots += 2 + (r!.materialCatalog ? list(object(r!.materialCatalog).slots).length : 0);
    }
    assetWork.set(string(a.id), { classes: list(a.anchorClassPartition).length, slots });
  }
  for (const r of Object.values(table(root, 'captionsById'))) charge(1 + (assetWork.get(string(object(r.anchor).assetId))?.classes ?? 0));
  for (const r of Object.values(table(root, 'materialOverridesById'))) charge(1 + (assetWork.get(string(object(object(r.routing).target).assetId))?.slots ?? 0));
  for (const r of Object.values(table(root, 'mediaResourcesById'))) {
    charge(); if (await immutableDigest(immutableKinds.mediaResourcesById, r) !== r.payloadDigest) fail('media-digest');
  }
  const graph = await inspectProjectGraph(await validationGraph(root, charge), limits, undefined, profile);
  if (graph.kind !== 'record-graph-inspection' || graph.hasUnknownFields ||
    graph.issues.some(i => i.kind !== 'unverified' && i.code !== 'anchor-class-not-current')) fail('graph');
  const assets = table(root, 'assetsById'), captions = table(root, 'captionsById');
  const sceneAssets = new Set(Object.values(table(root, 'sceneAssetMembershipsById')).map(r => string(r.assetId)));
  const ownerCaptions = new Map<string, JsonObject[]>();
  for (const caption of Object.values(captions)) {
    const a = object(caption.anchor), owner = a.kind === 'asset' ? a.assetId : a.kind === 'unplaced' ? a.ownerAssetId : undefined;
    if (owner === undefined) continue;
    const group = ownerCaptions.get(string(owner)) ?? []; group.push(caption); ownerCaptions.set(string(owner), group);
  }
  const includedReps = new Set<string>(); let missingModelCaptions = 0, newlyNeedsReviewCaptions = 0;
  for (const a of Object.values(assets)) {
    const id = string(a.id), owned = ownerCaptions.get(id) ?? [];
    const positioned = owned.filter(r => object(r.anchor).kind === 'asset');
    if (a.kind === 'nonvisualOwner' || a.kind === 'unplacedOwner') {
      if (sceneAssets.has(id) || !owned.length || a.kind === 'unplacedOwner' && positioned.length || a.kind === 'nonvisualOwner' && !positioned.length) fail('nonvisual-closure');
      missingModelCaptions += owned.length; continue;
    }
    if (!sceneAssets.has(id)) fail('visual-without-membership');
    const partition = new Set(list(a.anchorClassPartition).map(v => string(object(v).id))), compatible = new Set(list(a.compatibleAnchorClassIds).map(string));
    const referenced = new Set(positioned.map(r => string(object(r.anchor).authoredAnchorCompatibilityId)));
    if ([...partition].some(id => !compatible.has(id)) || [...compatible].some(id => !partition.has(id) && !referenced.has(id))) fail('compatible-set');
    for (const r of positioned) { const klass = string(object(r.anchor).authoredAnchorCompatibilityId); if (compatible.has(klass) && !partition.has(klass)) newlyNeedsReviewCaptions++; }
    for (const id of list(a.representationIds).map(string)) includedReps.add(id);
  }
  if (!setsEqual(includedReps, Object.keys(table(root, 'representationsById'))) ||
    !setsEqual(Object.keys(captions), Object.values(table(root, 'sceneCaptionMembershipsById')).map(r => string(r.captionId))) ||
    !setsEqual(Object.keys(table(root, 'mediaResourcesById')), Object.values(table(root, 'captionAttachmentsById')).map(r => string(r.mediaResourceId))) ||
    !setsEqual(Object.keys(table(root, 'captionTagsById')), Object.values(table(root, 'captionTagMembershipsById')).map(r => string(r.tagId)))) fail('extra-closure');
  const physical = new Map<string, Entry>(), semantic = new Map<string, StoredBlobRef>(); let total = 0;
  for (const map of ['representationsById', 'mediaResourcesById']) for (const r of Object.values(table(root, map))) {
    for (const blob of recordBlobRefs(r)) {
      const ref = blob as unknown as StoredBlobRef, existing = physical.get(ref.digest);
      if (existing && existing.byteLength !== ref.byteLength) fail('blob-length');
      semantic.set(canonical(blob), ref);
      if (!existing) { total += ref.byteLength; if (total > L.blobBytes || physical.size >= L.blobCount) fail('blob-budget');
        physical.set(ref.digest, { path: `blobs/sha256/${ref.digest}`, sha256: ref.digest, byteLength: ref.byteLength }); }
    }
  }
  const entries = [...physical.values()].sort((a, b) => a.sha256 < b.sha256 ? -1 : 1), bytes = encode(root);
  if (bytes.length > L.snapshotBytes) fail('bytes');
  return freeze({ kind: 'review-snapshot', semanticProfile: profile, snapshot: root, token: packageByteHash(bytes), closure: { entries, semanticRefs: [...semantic.values()] },
    summary: reviewSummary(root, entries), editEffect: { missingModelCaptions, newlyNeedsReviewCaptions } });
}

/** Private validator scaffolding only: no metadata source, actor, history, renderer DTO or storage. */
async function validationGraph(snapshot: JsonObject, charge: (n?: number) => void): Promise<JsonObject> {
  const placeholder = (prefix: string, ordinal: number) => `${prefix}_${ordinal.toString(16).padStart(32, '0')}`;
  let event = 0;
  const lifecycle = () => ({ state: 'active', reason: 'initial', eventId: placeholder('evt', ++event) });
  const profile = reviewSemanticProfile(snapshot.schema);
  const out: JsonObject = { schema: { major: 2, minor: profile === 'map2' ? 1 : 0 }, identity: { projectId: placeholder('prj', 0), historyEpoch: placeholder('hep', 0), lineageSeed: '0'.repeat(64) },
    project: snapshot.project!, ...Object.fromEntries(Object.keys(projectRecordMaps).map(m => [m, {}])) };
  const scene = object(snapshot.scene); table(out, 'scenesById')[string(scene.id)] = { ...scene, lifecycle: lifecycle() };
  for (const map of reviewMaps) {
    if (map === 'assetsById') continue;
    for (const r of Object.values(table(snapshot, map))) {
      charge();
      const record = map === 'representationsById' ? { ...r, derivedFrom: [] } : map === 'mediaResourcesById' ? { ...r } : { ...r, lifecycle: lifecycle() };
      table(out, map)[string(r.id)] = record;
    }
  }
  let ordinal = 0;
  for (const id of Object.keys(table(snapshot, 'assetsById')).sort()) {
    charge();
    const a = table(snapshot, 'assetsById')[id]!;
    const pinScale: JsonObject = a.pinScale === undefined ? {} : { pinScale: a.pinScale };
    if (a.kind === 'nonvisualOwner' || a.kind === 'unplacedOwner') { table(out, 'assetsById')[id] = { id, lifecycle: lifecycle(), assetFrameId: a.assetFrameId!, label: 'モデル未収録', ...pinScale,
      status: { kind: 'unresolved', reason: 'missingSource', ...(a.kind === 'nonvisualOwner' ? { pendingAssetToProject: a.assetToProject! } : {}) } }; continue; }
    const bindingId = placeholder('bnd', ++ordinal), revisionId = placeholder('rev', ordinal);
    table(out, 'assetsById')[id] = { id, lifecycle: lifecycle(), label: a.label!, assetFrameId: a.assetFrameId!, ...pinScale, status: { kind: 'ready', activeBindingId: bindingId } };
    table(out, 'assetBindingsById')[bindingId] = { id: bindingId, assetId: id, assetRevisionId: revisionId, assetToProject: a.assetToProject!, method: 'import' };
    table(out, 'assetRevisionsById')[revisionId] = { id: revisionId, assetId: id, representationIds: a.representationIds!, anchorCompatibilityClasses: a.anchorClassPartition!,
      provenance: { origin: 'import', inputBlobDigests: [...new Set(list(a.representationIds).map(rep => string(object(table(out, 'representationsById')[string(rep)]?.blob).digest)))].sort() } };
  }
  for (const [map, kind] of Object.entries(immutableKinds)) for (const r of Object.values(table(out, map))) {
    charge();
    // Media's original digest was independently checked before reaching here.
    (r as Record<string, JsonValue>).payloadDigest = await immutableDigest(kind, r);
  }
  return out;
}

/** Explicit edit-copy only. The fresh typed recipe, not validator IDs, becomes Project identity. */
export async function prepareReviewEdit(review: ReviewSnapshot, limits: MetadataLimits, recipe?: CleanReconstruction) {
  const verified = await inspectReviewSnapshot(review.snapshot, limits);
  if (verified.token !== review.token) fail('snapshot-changed');
  return { ...await prepareCleanRecords(await validationGraph(verified.snapshot, snapshotBudget(verified.snapshot, reviewLimits(limits))), limits, () => false, recipe, verified.semanticProfile),
    semanticProfile: verified.semanticProfile };
}

export function reviewSummary(snapshot: JsonObject, blobs: readonly Entry[]): AutomaticSummary {
  const entities = new Map<string, number>([['project', 1], ['scenesById', 1]]), fields = new Map<string, number>();
  for (const name of Object.keys(object(snapshot.project))) fields.set(`project.${name}`, 1);
  for (const name of Object.keys(object(snapshot.scene))) fields.set(`scenesById.${name}`, 1);
  for (const map of reviewMaps) for (const r of Object.values(table(snapshot, map))) {
    entities.set(map, (entities.get(map) ?? 0) + 1);
    for (const name of ['assetsById', 'representationsById', 'mediaResourcesById'].includes(map) ? ['record'] : Object.keys(r)) {
      const key = `${map}.${name}`; fields.set(key, (fields.get(key) ?? 0) + 1);
    }
  }
  const counts = (v: Map<string, number>) => [...v].sort(([a], [b]) => a < b ? -1 : 1).map(([name, count]) => ({ class: name, count }));
  return { algorithm: summaryAlgorithm(reviewSemanticProfile(snapshot.schema)), scope: 'snapshot', entityClasses: counts(entities), fieldClasses: counts(fields), blobEntryCount: blobs.length,
    blobBytes: blobs.reduce((n, e) => n + e.byteLength, 0) };
}
