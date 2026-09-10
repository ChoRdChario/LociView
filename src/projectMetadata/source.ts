import * as A from '@automerge/automerge/slim';
import { inspectProjectCandidates } from '../domain/projectCandidates';
import { admitProjectRecords, checkProjectHeader, projectRecordMaps } from '../domain/projectRecords';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkMutableField } from '../domain/projectMutableFields';
import { immutableKinds, object, same } from '../domain/projectGraphSupport';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { adapterFormatVersion, checkedChanges, checkedProof, checkLimits, fail, inspectPhysical, scalar, MetadataSourceError,
  type MetadataLimits, type MetadataProof, type PhysicalDoc } from './format';

export type { MetadataLimits, MetadataProof } from './format';

/**
 * Owned source history only. No storage/acknowledgment, user-file importer or
 * interactive session. Callers initialize local Wasm before using this module.
 */
export class ProjectMetadataSource {
  private constructor(private readonly doc: PhysicalDoc, readonly proof: MetadataProof, private readonly limits: MetadataLimits) {}

  static bootstrap(schema: JsonObject, identity: JsonObject, requested: MetadataLimits): ProjectMetadataSource {
    const limits = checkLimits(requested), s = cloneCanonicalValue(schema, limits) as JsonObject,
      i = cloneCanonicalValue(identity, limits) as JsonObject;
    checkProjectHeader(new ProjectRecordFields(), 'schema', s);
    checkProjectHeader(new ProjectRecordFields(), 'identity', i);
    const doc = A.change(A.init<Record<string, any>>(), draft => {
      draft.schema = scalar(s, limits); draft.identity = scalar(i, limits); draft.project = {};
      for (const map of Object.keys(projectRecordMaps)) draft[map] = {};
    });
    const proof: MetadataProof = { identity: i, envelope: { adapter: 'automerge', adapterFormatVersion,
      lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: A.getHeads(doc)[0]! } } };
    return ProjectMetadataSource.validated(doc, proof, limits);
  }

  /** Complete retained original changes from this profile; not arbitrary package admission. */
  static reopen(original: readonly Uint8Array[], proof: MetadataProof, requested: MetadataLimits): ProjectMetadataSource {
    const limits = checkLimits(requested), p = checkedProof(proof, limits), parts = checkedChanges(original, limits);
    try {
      const [doc] = A.applyChanges(A.init<Record<string, any>>(), parts);
      const integrated = new Map(A.getAllChanges(doc).map(bytes => [A.decodeChange(bytes).hash, bytes]));
      for (const bytes of parts) {
        const persisted = integrated.get(A.decodeChange(bytes).hash);
        if (!persisted) fail('missing-dependencies');
        if (persisted!.length !== bytes.length || persisted!.some((v, i) => v !== bytes[i])) fail('original-bytes');
      }
      return ProjectMetadataSource.validated(doc, p, limits);
    } catch (error) { if (error instanceof MetadataSourceError) throw error; return fail('reopen'); }
  }

  private static validated(doc: PhysicalDoc, proof: MetadataProof, limits: MetadataLimits): ProjectMetadataSource {
    const p = checkedProof(proof, limits); inspectPhysical(doc, p, limits);
    return new ProjectMetadataSource(doc, p, limits);
  }

  read() { return inspectPhysical(this.doc, this.proof, this.limits); }
  get token(): string { return this.read().history.token; }
  originalChanges(): Uint8Array[] { return A.getAllChanges(this.doc).map(b => b.slice()); }

  /** Bootstrap is withheld from Project readiness. Initialize in one later change. */
  initialize(records: unknown): ProjectMetadataSource {
    if (A.getAllChanges(this.doc).length !== 1) fail('already-initialized');
    const admitted = admitProjectRecords(records, this.limits);
    if (admitted.kind !== 'valid-records') return fail('initial-records');
    const r = admitted.records, source = this.read();
    if (!same(r.identity, this.proof.identity) || !same(r.schema, source.schema)) fail('identity');
    const doc = A.change(A.clone(this.doc), draft => {
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
      if (error instanceof MetadataSourceError) throw error;
      return fail('append-original');
    }
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
    for (const field of names) checkMutableField(new ProjectRecordFields(), 'captionsById', field, edits[field]!);
    if (transactionId !== undefined && !/^[0-9a-f]{32}$/.test(transactionId)) fail('transaction-id');
    const doc = A.change(A.clone(this.doc), transactionId ? { message: `lociview:transaction:v1:${transactionId}` } : {},
      draft => { for (const field of names) draft.captionsById[captionId][field] = scalar(edits[field]!, this.limits); });
    return ProjectMetadataSource.validated(doc, this.proof, this.limits);
  }
}
