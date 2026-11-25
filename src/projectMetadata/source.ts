import { usePointAnchorProof, type PointAnchorProof } from './pointAnchorProof';
import { EDITOR_CAPABILITY, PORTABLE_MEDIA_CAPABILITY, SCENE_PLACEMENT_CAPABILITY, type ReaderCapabilities } from './requiredCapabilities';
import { editorMessage, EditorAttributionError, type LocalEditorContext, type EditorDeclaration } from './editorAttribution';
import * as A from '@automerge/automerge/slim';
import { inspectProjectCandidates } from '../domain/projectCandidates';
import { admitProjectRecords, checkProjectHeader, projectRecordMaps } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { projectSemanticProfile, type ProjectSemanticProfile } from '../domain/projectProfile';
import { checkMutableField } from '../domain/projectMutableFields';
import { immutableKinds, object, same } from '../domain/projectGraphSupport';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { planMetadataEdit, type MetadataEdit, type LiveRecordEdit, type TagAddition } from './commands';
export type { LiveRecordEdit } from './commands';
import { adapterFormatVersion, adapterFormatVersion2, metadataSemanticProfile, checkedChanges, checkedProof, checkLimits, fail, inspectPhysical, inspectPhysicalSource, inspectOriginalSource, originalEntryWitness, scalar, MetadataSourceError,
  type MetadataLimits, type MetadataProof, type PhysicalDoc, type OriginalInspectionBudget } from './format';

export type { MetadataLimits, MetadataProof } from './format';

function sameOriginalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  return true;
}

/**
 * Owned source history only. No storage/acknowledgment, user-file importer or
 * interactive session. Callers initialize local Wasm before using this module.
 */
export class ProjectMetadataSource {
  private constructor(private readonly doc: PhysicalDoc, readonly proof: MetadataProof, private readonly limits: MetadataLimits,
    private readonly snapshot: ReturnType<typeof inspectPhysical>, private readonly portableChanges: ReadonlySet<string>,
    private readonly scenePlacementChanges: ReadonlySet<string>, private readonly originalMedia: readonly JsonObject[],
    private readonly declarations: readonly Readonly<{changeId: string; declaration: EditorDeclaration}>[]) {}

  static bootstrap(schema: JsonObject, identity: JsonObject, requested: MetadataLimits, options?: { time?: 0; semanticProfile?: ProjectSemanticProfile }): ProjectMetadataSource {
    const profile = projectSemanticProfile(options?.semanticProfile);
    const limits = checkLimits(requested), s = cloneCanonicalValue(schema, limits) as JsonObject,
      i = cloneCanonicalValue(identity, limits) as JsonObject;
    checkProjectHeader(new ProjectRecordFields(profile), 'schema', s);
    checkProjectHeader(new ProjectRecordFields(), 'identity', i);
    const doc = A.change(A.init<Record<string, any>>(), options?.time === 0 ? { time: 0 } : {}, draft => {
      draft.schema = scalar(s, limits); draft.identity = scalar(i, limits); draft.project = {};
      if (profile === 'map2') draft.semanticProfile = scalar('map2', limits);
      for (const map of Object.keys(projectRecordMaps)) draft[map] = {};
    });
    const proof: MetadataProof = { identity: i, envelope: { adapter: 'automerge', adapterFormatVersion: profile === 'map2' ? adapterFormatVersion2 : adapterFormatVersion,
      lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: A.getHeads(doc)[0]! } } };
    return ProjectMetadataSource.validated(doc, proof, limits);
  }

  /** Complete retained original changes from this profile; not arbitrary package admission. */
  static reopen(original: readonly Uint8Array[], proof: MetadataProof, requested: MetadataLimits): ProjectMetadataSource {
    const limits = checkLimits(requested), p = checkedProof(proof, limits), parts = checkedChanges(original, limits);
    try {
      const [doc] = A.applyChanges(A.init<Record<string, any>>(), parts);
      const integrated = A.getAllChanges(doc);
      if (parts.length !== integrated.length || parts.some((bytes, i) => !sameOriginalBytes(bytes, integrated[i]!))) {
        const byHash = new Map(integrated.map(bytes => [A.decodeChange(bytes).hash, bytes]));
        for (const bytes of parts) {
          const saved = byHash.get(A.decodeChange(bytes).hash);
          if (!saved) return fail('missing-dependencies');
          if (!sameOriginalBytes(bytes, saved)) fail('original-bytes');
        }
      }
      return ProjectMetadataSource.validated(doc, p, limits);
    } catch (error) { if (error instanceof MetadataSourceError || error instanceof EditorAttributionError) throw error; return fail('reopen'); }
  }

  private static validated(doc: PhysicalDoc, proof: MetadataProof, limits: MetadataLimits): ProjectMetadataSource {
    const p = checkedProof(proof, limits), snapshot = inspectPhysicalSource(doc, p, limits);
    return new ProjectMetadataSource(doc, p, limits, snapshot.input, snapshot.portableChanges, snapshot.scenePlacementChanges, snapshot.mediaRecords, snapshot.declarations);
  }

  /** Complete pinned metadata encoding, not a package writer or durable save. */
  encodeFullSource(): Uint8Array { return A.save(this.doc).slice(); }

  static fromFullSource(bytes: Uint8Array, proof: MetadataProof, requested: MetadataLimits): ProjectMetadataSource {
    const limits = checkLimits(requested);
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > limits.maxTotalBytes) fail('full-source-budget');
    try {
      const doc = A.load<Record<string, any>>(bytes.slice(), { allowMissingChanges: false });
      if (A.getMissingDeps(doc, []).length) fail('full-source-dependencies');
      return ProjectMetadataSource.validated(doc, proof, limits);
    } catch (error) { if (error instanceof MetadataSourceError || error instanceof EditorAttributionError) throw error; return fail('full-source-invalid'); }
  }

  // This instance owns an immutable doc. Storage reads still reopen and validate
  // a new instance; token access must not traverse the same history each time.
  read() { return this.snapshot; }
  get semanticProfile(): ProjectSemanticProfile { return metadataSemanticProfile(this.proof.envelope.adapterFormatVersion); }
  /** Complete original scalar evidence, not a package or a storage acknowledgment. */
  inspectOriginal(budget: OriginalInspectionBudget) { return inspectOriginalSource(this.doc, this.proof, this.limits, budget); }
  get token(): string { return this.snapshot.history.token; }
  /** A later pending local edit can reopen a completed restore only for this exact command shape. */
  assertCaptionTextChange(bytes: Uint8Array, captionId: string, provider: Extract<ProjectProviderRead, {kind: 'scene-provider'}>): void {
    const record = this.doc.captionsById[captionId];
    if (!record || provider.token !== this.token) fail('restore-destination-not-ready');
    const target = A.getObjectId(record), edits: { title?: string; body?: string } = {};
    const { ops } = A.decodeChange(bytes);
    if (!target || !ops.length || ops.length > 2) fail('restore-destination-not-ready');
    for (const op of ops) {
      if (op.action !== 'set' || op.obj !== target || ('insert' in op && op.insert) || op.datatype !== undefined ||
        (op.key !== 'title' && op.key !== 'body') || Object.hasOwn(edits, op.key) || typeof op.value !== 'string')
        return fail('restore-destination-not-ready');
      const value: unknown = JSON.parse(op.value);
      if (typeof value !== 'string' || String(scalar(value, this.limits)) !== op.value) return fail('restore-destination-not-ready');
      const prior = provider.inspection.candidates.fields.find(f => f.path.length === 3 &&
        f.path[0] === 'captionsById' && f.path[1] === captionId && f.path[2] === op.key);
      if (!prior?.valid || prior.hasUnknownFields || prior.candidates.length !== 1 ||
        op.pred.length !== 1 || op.pred[0] !== prior.candidates[0]!.operationId) return fail('restore-destination-not-ready');
      edits[op.key] = value;
    }
    planMetadataEdit(provider, { kind: 'editCaption', captionId, edits }, this.limits);
  }
  /** Validate the one record encoded by a newly prepared live tag command. */
  assertTagAddition(bytes: Uint8Array, command: TagAddition, provider: Extract<ProjectProviderRead, {kind: 'scene-provider'}>): void {
    if (provider.token !== this.token) return fail('tag-change');
    const edits = planMetadataEdit(provider, command, this.limits), record = edits[0];
    const map = command.kind === 'createTag' ? 'captionTagsById' : 'captionTagMembershipsById';
    const id = command.kind === 'createTag' ? command.tagId : command.membershipId;
    if (edits.length !== 1 || !record?.create || record.map !== map || record.id !== id ||
      Object.keys(projectRecordMaps).some(name => Object.hasOwn(this.doc[name], id))) return fail('tag-change');
    const change = A.decodeChange(bytes), [make, ...writes] = change.ops;
    if (!same([...change.deps].sort(), this.heads) || !make || make.action !== 'makeMap' ||
      make.obj !== A.getObjectId(this.doc[map]) || make.key !== id || make.pred.length || ('insert' in make && make.insert))
      return fail('tag-change');
    const objectId = `${change.startOp}@${change.actor}`, fields = new Map(Object.entries(record.fields));
    for (const op of writes) {
      if (op.action !== 'set' || op.obj !== objectId || op.pred.length || op.datatype !== undefined || ('insert' in op && op.insert) ||
        typeof op.key !== 'string' || !fields.has(op.key) || op.value !== String(scalar(fields.get(op.key)!, this.limits))) return fail('tag-change');
      fields.delete(op.key);
    }
    if (fields.size) fail('tag-change');
  }

  /** Finite prepared attachment admission; never a generic pending-edit bypass. */
  assertCaptionAttachmentIntroduction(bytes: Uint8Array, provider: Extract<ProjectProviderRead, {kind: 'scene-provider'}>): JsonObject {
    if (provider.token !== this.token) return fail('restore-destination-not-ready');
    const change = A.decodeChange(bytes), ops = change.ops;
    if (ops.length !== 7 && ops.length !== 8) return fail('restore-destination-not-ready');
    const addingMedia = ops.length === 8, mapIndex = addingMedia ? 1 : 0, make = ops[mapIndex]!;
    const attachmentMap = A.getObjectId(this.doc.captionAttachmentsById), mediaMap = A.getObjectId(this.doc.mediaResourcesById);
    if (!attachmentMap || !mediaMap || make.action !== 'makeMap' || make.obj !== attachmentMap || typeof make.key !== 'string' ||
      make.pred.length || 'insert' in make && make.insert) return fail('restore-destination-not-ready');
    const attachmentId = make.key, attachmentObject = `${change.startOp + mapIndex}@${change.actor}`;
    if (Object.keys(projectRecordMaps).some(map => Object.hasOwn(this.doc[map], attachmentId))) return fail('restore-destination-not-ready');
    const readScalar = (op: typeof ops[number]) => {
      if (op.action !== 'set' || op.pred.length || op.datatype !== undefined || 'insert' in op && op.insert || typeof op.value !== 'string')
        return fail('restore-destination-not-ready');
      try {
        const value = JSON.parse(op.value);
        if (String(scalar(value, this.limits)) !== op.value) return fail('restore-destination-not-ready');
        return value;
      } catch { return fail('restore-destination-not-ready'); }
    };
    const fields: Record<string, JsonObject[string]> = {};
    for (const op of ops.slice(mapIndex + 1)) {
      if (op.obj !== attachmentObject || typeof op.key !== 'string' ||
        !['id', 'captionId', 'mediaResourceId', 'altText', 'orderKey', 'lifecycle'].includes(op.key) || Object.hasOwn(fields, op.key))
        return fail('restore-destination-not-ready');
      fields[op.key] = readScalar(op);
    }
    if (Object.keys(fields).sort().join(',') !== 'altText,captionId,id,lifecycle,mediaResourceId,orderKey' || fields.id !== attachmentId ||
      typeof fields.captionId !== 'string' || typeof fields.mediaResourceId !== 'string' || typeof fields.altText !== 'string' || typeof fields.orderKey !== 'string')
      return fail('restore-destination-not-ready');
    const lifecycle = object(fields.lifecycle), mediaId = fields.mediaResourceId;
    let media: JsonObject;
    if (addingMedia) {
      const op = ops[0]!;
      if (op.obj !== mediaMap || op.key !== mediaId || Object.keys(projectRecordMaps).some(map => Object.hasOwn(this.doc[map], mediaId)))
        return fail('restore-destination-not-ready');
      media = object(readScalar(op));
    } else {
      const value = provider.details.immutable.mediaResourcesById[mediaId];
      if (value?.kind !== 'value') return fail('restore-destination-not-ready');
      media = object(value.value);
    }
    let work = 0;
    for (const sceneId of Object.keys(provider.state.scenes)) {
      if (++work > this.limits.maxWork) return fail('restore-destination-not-ready');
      try {
        const planned = planMetadataEdit(provider, { kind: 'createAttachment', sceneId, captionId: fields.captionId, attachmentId,
          media, altText: fields.altText, orderKey: fields.orderKey, eventId: lifecycle.eventId as string }, this.limits);
        const expected = [ ...(addingMedia ? [{ map: 'mediaResourcesById', id: mediaId, create: true, fields: media }] : []),
          { map: 'captionAttachmentsById', id: attachmentId, create: true, fields } ];
        if (planned.length === expected.length && planned.every((write, i) => write.map === expected[i]!.map && write.id === expected[i]!.id &&
          write.create === true && same(write.fields, expected[i]!.fields))) return media;
      } catch (error) { if (!(error instanceof MetadataSourceError)) throw error; }
    }
    return fail('restore-destination-not-ready');
  }
  get heads(): string[] { return A.getHeads(this.doc).sort(); }
  /** Internal repository comparison against this already inspected source. */
  matchesStoredRecord(doc: PhysicalDoc, command: LiveRecordEdit, limits: MetadataLimits): boolean {
    if (Object.entries(this.limits).some(([key, n]) => n !== limits[key as keyof MetadataLimits]) ||
      A.getMissingDeps(doc, []).length || !same(A.getHeads(doc).sort(), this.heads)) return false;
    const expected = A.getAllChanges(this.doc), actual = A.getAllChanges(doc);
    if (actual.length !== expected.length || actual.some(bytes => !bytes.length || bytes.length > limits.maxChangeBytes) ||
      actual.reduce((sum, bytes) => sum + bytes.length, 0) > limits.maxTotalBytes) return false;
    if (!expected.every((bytes, i) => sameOriginalBytes(bytes, actual[i]!))) {
      const remaining = new Map(expected.map(bytes => [A.decodeChange(bytes).hash, bytes]));
      for (const bytes of actual) {
        const hash = A.decodeChange(bytes).hash, original = remaining.get(hash);
        if (!original || !sameOriginalBytes(bytes, original)) return false;
        remaining.delete(hash);
      }
      if (remaining.size) return false;
    }
    const matches = (map: string, id: string, fields: string[], allowAbsent = false) => {
      const before = this.doc[map][id], after = doc[map]?.[id];
      if (!doc[map] || A.getObjectId(this.doc[map]) !== A.getObjectId(doc[map])) return false;
      if (before === undefined || after === undefined) return allowAbsent && before === after;
      if (A.getObjectId(before) !== A.getObjectId(after)) return false;
      return fields.every(field => {
        const left = before[field], right = after[field];
        if (left !== undefined || right !== undefined) {
          if (!(left instanceof A.ImmutableString && right instanceof A.ImmutableString) || left.toString() !== right.toString()) return false;
        }
        const prior = A.getConflicts(before, field) ?? {}, saved = A.getConflicts(after, field) ?? {};
        return Object.keys(prior).length === Object.keys(saved).length &&
          Object.entries(prior).every(([operationId, value]) => typeof value === 'string' && Object.hasOwn(saved, operationId) && saved[operationId] === value);
      });
    };
    if (command.kind === 'editCaption') return matches('captionsById', command.captionId, ['title', 'body']);
    const tagFields = ['id', 'label', 'colorSrgb', 'orderKey', 'lifecycle'];
    if (command.kind === 'createTag') return matches('captionTagsById', command.tagId, tagFields, true);
    return matches('captionsById', command.captionId, ['id', 'lifecycle']) &&
      matches('captionTagsById', command.tagId, tagFields) &&
      matches('captionTagMembershipsById', command.membershipId, ['id', 'captionId', 'tagId', 'lifecycle'], true);
  }
  originalChanges(): Uint8Array[] { return A.getAllChanges(this.doc).map(b => b.slice()); }
  /** Only for a local edit prepared on this immutable ancestor. */
  changesForPreparedEdit(prepared: ProjectMetadataSource): Uint8Array[] {
    return A.getChanges(this.doc, prepared.doc).map(bytes => bytes.slice());
  }
  projectFrame(): JsonObject { return object(JSON.parse(String(this.doc.project.frame))); }
  /** Owned immutable header projection; never joins by actor, name or transaction ID. */
  editorDeclarations() {
    return this.declarations;
  }
  get includesDeclaredEditorNames(): boolean { return this.editorDeclarations().length > 0; }
  /** Original declarations are context, never reusable evidence of body integrity. */
  mediaRecords(): readonly JsonObject[] { return this.originalMedia.map(r => cloneCanonicalValue(r, this.limits) as JsonObject); }
  get requiredCapabilities(): ReaderCapabilities {
    return Object.freeze([...(this.includesDeclaredEditorNames ? [EDITOR_CAPABILITY] : []),
      ...(this.portableChanges.size ? [PORTABLE_MEDIA_CAPABILITY] : []),
      ...(this.scenePlacementChanges.size ? [SCENE_PLACEMENT_CAPABILITY] : [])]);
  }
  requiredCapabilitiesForChanges(hashes: ReadonlySet<string>): ReaderCapabilities {
    return Object.freeze([...(this.editorDeclarations().some(c => hashes.has(c.changeId)) ? [EDITOR_CAPABILITY] : []),
      ...([...this.portableChanges].some(hash => hashes.has(hash)) ? [PORTABLE_MEDIA_CAPABILITY] : []),
      ...([...this.scenePlacementChanges].some(hash => hashes.has(hash)) ? [SCENE_PLACEMENT_CAPABILITY] : [])]);
  }

  /** Closed history-free export profile: one empty root and one population change.
   * Scalar uniqueness/current-value equality are checked by the clean reader. */
  assertFreshInitialization(expectedRecordContainers?: number): void {
    const changes = this.originalChanges().map(b => A.decodeChange(b));
    if (changes.length !== 2 || changes.some(c => c.message || c.time !== 0 || (c as { extraBytes?: Uint8Array }).extraBytes?.length)) fail('not-fresh-initialization');
    const populated = changes.find(c => c.hash !== this.proof.envelope.lineageProof.rootChangeHash);
    if (!populated || populated.deps.length !== 1 || populated.deps[0] !== this.proof.envelope.lineageProof.rootChangeHash) fail('not-fresh-initialization');
    if (expectedRecordContainers !== undefined && populated!.ops.filter(op => op.action === 'makeMap').length !== expectedRecordContainers) fail('not-fresh-initialization');
  }

  /** Bootstrap is withheld from Project readiness. Initialize in one later change. */
  initialize(records: unknown, options?: { time: 0 }): ProjectMetadataSource {
    if (A.getAllChanges(this.doc).length !== 1) fail('already-initialized');
    const admitted = admitProjectRecords(records, this.limits, this.semanticProfile);
    if (admitted.kind !== 'valid-records') return fail('initial-records');
    const r = admitted.records, source = this.read();
    if (!same(r.identity, this.proof.identity) || !same(r.schema, source.schema)) fail('identity');
    const doc = A.change(A.clone(this.doc), options ?? {}, draft => {
      for (const [field, value] of Object.entries(object(r.project))) draft.project[field] = scalar(value, this.limits);
      for (const map of Object.keys(projectRecordMaps)) for (const [id, record] of Object.entries(object(r[map]))) {
        if (Object.hasOwn(immutableKinds, map)) draft[map][id] = scalar(record, this.limits);
        else { draft[map][id] = {}; for (const [field, value] of Object.entries(object(record))) draft[map][id][field] = scalar(value, this.limits); }
      }
      for (const [key, value] of Object.entries(r)) if (!['schema', 'identity', 'project', ...Object.keys(projectRecordMaps)].includes(key)) draft[key] = scalar(value, this.limits);
    });
    return ProjectMetadataSource.validated(doc, this.proof, this.limits);
  }

  /** Exact received source; validation and publication policy belong to the future ProjectSession. */
  appendOriginal(parts: readonly Uint8Array[]): ProjectMetadataSource {
    try {
      const incoming = checkedChanges(parts, this.limits), original = this.originalChanges();
      const byHash = new Map(original.map(b => [A.decodeChange(b).hash, b]));
      for (const b of incoming) {
        const hash = A.decodeChange(b).hash, prior = byHash.get(hash);
        if (prior && (prior.length !== b.length || prior.some((v, i) => v !== b[i]))) fail('change-identity');
        byHash.set(hash, b);
      }
      if (byHash.size === original.length) return this;
      return ProjectMetadataSource.reopen([...byHash.values()], this.proof, this.limits);
    } catch (error) {
      if (error instanceof MetadataSourceError || error instanceof EditorAttributionError) throw error;
      return fail('append-original');
    }
  }

  /** Internal typed command preparation; the Session supplies its own verified read. */
  prepareEdit(expectedToken: string, command: MetadataEdit, provider: ProjectProviderRead, transactionId: string, pointProof?: PointAnchorProof, editor?: LocalEditorContext): ProjectMetadataSource {
    if (expectedToken !== this.token || provider.kind !== 'scene-provider' || provider.token !== this.token) return fail('stale-token');
    if (!/^[0-9a-f]{32}$/.test(transactionId)) return fail('transaction-id');
    const edits = planMetadataEdit(provider, command, this.limits, usePointAnchorProof(pointProof, this, command, transactionId)), creating = new Set<string>();
    const entryWitness = command.kind === 'resolveEntryView' && edits.some(edit => edit.map !== 'project' && edit.remove?.includes('defaultViewId'))
      ? originalEntryWitness(this.doc, this.proof, this.limits, command.sceneId) : undefined;
    for (const edit of edits) if (edit.create) {
      if (creating.has(edit.id) || Object.keys(projectRecordMaps).some(map => Object.hasOwn(this.doc[map], edit.id))) fail('record-id-exists');
      creating.add(edit.id);
    }
    const doc = A.change(A.clone(this.doc), { message: editorMessage(transactionId, editor) }, draft => {
      // Pinned Automerge may encode assignment of the current conflict winner
      // as deletion of only its rivals. Our atomic profile requires a whole-field
      // write: remove all observed values, then set the explicit choice in the
      // SAME change. No intermediate absence is published or saved separately.
      if (command.kind === 'resolveCaptionText' || command.kind === 'resolveCaptionField') delete draft.captionsById[command.captionId][command.field];
      if (command.kind === 'resolveAttachmentField') delete draft.captionAttachmentsById[command.attachmentId][command.field];
      if (command.kind === 'resolveAttachmentLifecycle') delete draft.captionAttachmentsById[command.attachmentId].lifecycle;
      if (command.kind === 'resolveCaptionLifecycle' || command.kind === 'confirmCaptionLifecycle') delete draft.captionsById[command.captionId].lifecycle;
      if (command.kind === 'resolveAssetStatus') delete draft.assetsById[command.assetId].status;
      if (command.kind === 'resolveScenePlacement') delete draft.sceneAssetMembershipsById[command.membershipId].bindingId;
      if (command.kind === 'resolveScenePin') delete draft.sceneCaptionMembershipsById[command.membershipId].anchor;
      if (command.kind === 'resolveDefaultScene') delete draft.project.defaultSceneId;
      if (command.kind === 'resolveSceneName') delete draft.scenesById[command.sceneId].name;
      if (command.kind === 'resolveSceneOrder') delete draft.scenesById[command.sceneId].orderKey;
      if (command.kind === 'restoreScene') { delete draft.scenesById[command.sceneId].lifecycle; delete draft.project.defaultSceneId; }
      if (command.kind === 'resolveTagField') delete draft.captionTagsById[command.tagId][command.field];
      if (command.kind === 'resolveTagLifecycle') delete draft.captionTagsById[command.tagId].lifecycle;
      if (command.kind === 'resolveViewField') delete draft.viewsById[command.viewId][command.field];
      if (command.kind === 'resolveMaterialIntent') {
        for (const edit of edits) for (const field of Object.keys(edit.fields))
          delete draft.materialOverridesById[command.overrideId][field];
      }
      if (command.kind === 'resolveEntryView') delete draft.scenesById[command.sceneId].defaultViewId;
      for (const edit of edits) {
        if (edit.map === 'project') {
          draft.project.defaultSceneId = scalar(edit.fields.defaultSceneId, this.limits); continue;
        }
        if (edit.map === 'mediaResourcesById' || edit.map === 'assetBindingsById' || edit.map === 'assetRevisionsById' || edit.map === 'representationsById') {
          if (!edit.create) fail('immutable-replacement');
          draft[edit.map][edit.id] = scalar(edit.fields, this.limits); continue;
        }
        if (edit.create) draft[edit.map][edit.id] = {};
        for (const [field, value] of Object.entries(edit.fields)) draft[edit.map][edit.id][field] = scalar(value, this.limits);
        for (const field of edit.remove ?? []) {
          // Concurrent absent/absent candidates have no materialized property.
          // A bare delete would emit no operation and leave their causal conflict
          // unresolved. Write then delete in this SAME change; the adapter keeps
          // its final absent operation, never an intermediate displayed/saved value.
          if (field === 'bindingId' && command.kind === 'resolveScenePlacement' || field === 'anchor' && command.kind === 'resolveScenePin') {
            // The planner verified the inherited value before allowing this choice. Use it as the transient write.
            const membership = object(object(provider.inspection.candidates.unambiguousRecords[edit.map])[edit.id]);
            if (field === 'bindingId') {
              const base = provider.resources.assets[String(membership.assetId)]?.projection;
              if (base?.kind !== 'value') return fail('scene-placement-absence-witness');
              draft[edit.map][edit.id][field] = scalar(base.value.bindingId, this.limits);
            } else {
              const base = provider.resources.captions[String(membership.captionId)]?.anchor;
              if (base?.kind !== 'value') return fail('scene-placement-absence-witness');
              draft[edit.map][edit.id][field] = scalar(base.value, this.limits);
            }
          }
          if (command.kind === 'resolveCaptionField' && field === 'colorSrgb')
            draft[edit.map][edit.id][field] = scalar([0, 0, 0], this.limits);
          if (command.kind === 'resolveAttachmentField' && field === 'altText')
            draft[edit.map][edit.id][field] = scalar('', this.limits);
          if (command.kind === 'resolveEntryView' && field === 'defaultViewId')
            draft[edit.map][edit.id][field] = scalar(entryWitness!, this.limits);
          delete draft[edit.map][edit.id][field];
        }
      }
    });
    return ProjectMetadataSource.validated(doc, this.proof, this.limits);
  }

  /** Prepared, NOT saved. Session still needs full-provider/lease/journal authority. */
  async prepareCaptionText(expectedToken: string, captionId: string, field: 'title' | 'body', text: string, transactionId?: string): Promise<ProjectMetadataSource> {
    return this.prepareCaptionTexts(expectedToken, captionId, { [field]: text }, transactionId);
  }
  /** A single Apply may edit both text fields, but still creates one original change. */
  async prepareCaptionTexts(expectedToken: string, captionId: string, input: Readonly<Partial<Record<'title' | 'body', string>>>, transactionId?: string): Promise<ProjectMetadataSource> {
    if (expectedToken !== this.token) fail('stale-token');
    const edits = cloneCanonicalValue(input, this.limits) as JsonObject, names = Object.keys(edits);
    if (!names.length || names.some(field => !['title', 'body'].includes(field))) fail('caption-field');
    const inspection = await inspectProjectCandidates(this.read(), this.limits);
    if (inspection.kind !== 'project-candidate-inspection') return fail('candidate-read');
    const required = ['id', 'lifecycle', ...names];
    for (const name of required) {
      const f = inspection.fields.find(f => f.path.join('/') === `captionsById/${captionId}/${name}`);
      if (!f?.valid || f.candidates.length !== 1) return fail('caption-unresolved');
      const candidate = f.candidates[0]!.value;
      if (candidate.kind !== 'value') return fail('caption-unresolved');
      if (name === 'lifecycle' && object(candidate.value).state !== 'active') fail('caption-inactive');
    }
    if (inspection.issues.some(i => i.path[0] === 'captionsById' && i.path[1] === captionId &&
      (i.path.length === 2 || required.includes(i.path[2]!)) && ['invalid', 'review', 'orphan'].includes(i.kind))) fail('caption-unresolved');
    for (const field of names) checkMutableField(new ProjectRecordFields(this.semanticProfile), 'captionsById', field, edits[field]!);
    if (transactionId !== undefined && !/^[0-9a-f]{32}$/.test(transactionId)) fail('transaction-id');
    const doc = A.change(A.clone(this.doc), transactionId ? { message: `lociview:transaction:v1:${transactionId}` } : {},
      draft => { for (const field of names) draft.captionsById[captionId][field] = scalar(edits[field]!, this.limits); });
    return ProjectMetadataSource.validated(doc, this.proof, this.limits);
  }
}
