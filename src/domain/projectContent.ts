import { inspectProjectCandidates, type CandidateIssue, type ProjectCandidatesInspection } from './projectCandidates';
import type { HistoryReadLimits } from './atomicHistory';
import { canonical, list, object, same, string } from './projectGraphSupport';
import { checkContentFacts, sourceIndexInRange, type ContentCheck, type ContentFact, type ContentRequest, type EvidenceScope, type ProjectContentVerifier } from './projectContentChecks';
import { cloneCanonicalValue, DomainValidationError, reject, type JsonObject, type JsonValue, type ValidationIssue } from './values';

type Candidates = Extract<ProjectCandidatesInspection, { kind: 'project-candidate-inspection' }>;
export type ProjectContentInspection = Readonly<{ kind: 'rejected'; issue: ValidationIssue }> | Readonly<{
  kind: 'project-content-inspection'; token: string; scope: EvidenceScope; candidates: Candidates;
  checks: readonly ContentCheck[]; issues: readonly CandidateIssue[];
  pendingAuthority: readonly ['affected-closure-projection-and-same-token-provider'];
}>;
const repMap = 'representationsById', mediaMap = 'mediaResourcesById', revisionMap = 'assetRevisionsById';

/** Runs the candidate admission itself. A caller-supplied typed inspection is not authority. */
export async function inspectProjectContent(input: unknown, limits: HistoryReadLimits, verifier: ProjectContentVerifier): Promise<ProjectContentInspection> {
  const candidates = await inspectProjectCandidates(input, limits); if (candidates.kind === 'rejected') return candidates;
  try {
    const scope = verifier.scope;
    if (scope !== 'development-fixture' && scope !== 'ratified-profile') reject('value', ['evidenceScope']);
    let work = candidates.workUsed;
    const charge = (amount = 1) => { work += amount; if (work > limits.maxWork) reject('limit', ['contentWork']); };
    const checked = (map: string) => candidates.fields.filter(f => f.path.length === 2 && f.path[0] === map).flatMap(f => {
      const valid = new Set(f.validOperationIds);
      return f.candidates.filter(c => valid.has(c.operationId) && c.value.kind === 'value').map(c => object(c.value.kind === 'value' ? c.value.value : undefined));
    });
    const unique = (records: readonly JsonObject[]) => [...new Map(records.map(r => [canonical(r), r])).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, r]) => r);
    const reps = unique(checked(repMap)), media = unique(checked(mediaMap));
    // Only the known active strong closure requests bytes. Weak provenance never
    // causes a historical model read or becomes a package/GC root through inspection.
    const outgoing = new Map<string, string[]>();
    for (const edge of candidates.knownReferences) if (edge.strength === 'strong') {
      charge(); const targets = outgoing.get(edge.from) ?? []; targets.push(edge.to); outgoing.set(edge.from, targets);
    }
    const required = new Set(candidates.knownActiveRoots), queue = [...required];
    for (let i = 0; i < queue.length; i++) for (const to of outgoing.get(queue[i]!) ?? []) {
      charge(); if (!required.has(to)) { required.add(to); queue.push(to); }
    }
    const checks: ContentCheck[] = [], added: CandidateIssue[] = [];
    const report = (path: readonly string[], code: string, kind: CandidateIssue['kind'] = 'unverified', operationId?: string) => {
      added.push(Object.freeze({ path: Object.freeze([...path]), code, kind, ...(operationId ? { operationId } : {}) }));
    };
    const query = async (fact: ContentFact, records: readonly JsonObject[], context: JsonObject, path: readonly string[]): Promise<ContentCheck> => {
      const request = Object.freeze({ token: candidates.token, fact, records: Object.freeze([...records]), context: cloneCanonicalValue(context, limits) as JsonObject });
      charge(canonical(request as unknown as JsonValue).length);
      let result: ContentCheck = { request, path, outcome: 'failed' };
      try {
        const raw = await verifier.verify(request), response = object(cloneCanonicalValue(raw, limits));
        charge(canonical(response).length);
        if (!response || typeof response !== 'object' || Array.isArray(response)) reject('type', ['response']);
        if (Object.keys(response).sort().join(',') !== (response.outcome === 'verified' ? 'facts,outcome,request,scope' : 'outcome,request,scope')) reject('key', ['response']);
        if (!same(response.request, request as unknown as JsonValue) || response.scope !== scope) result = { request, path, outcome: 'stale' };
        else if (response.outcome === 'verified') {
          const facts = object(response.facts); if (!facts || typeof facts !== 'object' || Array.isArray(facts)) reject('type', ['facts']);
          checkContentFacts(request, facts); result = { request, path, outcome: 'verified', facts };
        } else if (['missing', 'unsupported', 'failed'].includes(string(response.outcome))) result = { request, path, outcome: response.outcome as ContentCheck['outcome'] };
        else reject('value', ['outcome']);
      } catch (error) {
        if (error instanceof DomainValidationError && error.issue.path[0] === 'contentWork') throw error;
        result = { request, path, outcome: error instanceof DomainValidationError ? 'malformed' : 'failed' };
      }
      const frozen = Object.freeze({ ...result, path: Object.freeze([...path]) }); checks.push(frozen);
      if (result.outcome !== 'verified') report(path, `${fact}-${result.outcome}`);
      return frozen;
    };
    const repEvidence = new Map<string, ContentCheck>();
    for (const r of reps.filter(r => required.has(string(r.id)))) {
      charge(); const result = await query('representation', [r], {}, [repMap, string(r.id), 'formatProfile']);
      repEvidence.set(canonical(r), result);
    }
    for (const r of media.filter(r => required.has(string(r.id)))) await query('media', [r], {}, [mediaMap, string(r.id), 'blob']);
    const families = new Map<string, JsonObject[]>();
    for (const r of reps.filter(r => required.has(string(r.id)))) { const key = canonical([r.assetId!, r.variantFamilyId!]), family = families.get(key) ?? []; family.push(r); families.set(key, family); }
    for (const records of families.values()) {
      const context = { assetId: records[0]!.assetId!, variantFamilyId: records[0]!.variantFamilyId! };
      const result = await query('family-envelope', records, context, [repMap, string(records[0]!.id), 'logicalBoundsAsset']);
      // One family result constrains every encoding; a failure is not just the first member's failure.
      if (result.outcome !== 'verified') for (const r of records.slice(1)) report([repMap, string(r.id), 'logicalBoundsAsset'], `family-envelope-${result.outcome}`);
      if (records.length > 1) {
        const contribution = await query('family-contribution', records, context, [repMap, string(records[0]!.id), 'variantFamilyId']);
        if (contribution.outcome !== 'verified') for (const r of records.slice(1)) report([repMap, string(r.id), 'variantFamilyId'], `family-contribution-${contribution.outcome}`);
      }
    }
    // Use only unambiguous complete revision/representation records for a class proof.
    // Immutable conflicts stay diagnosed; a successful sibling does not resolve them.
    const table = (map: string) => object(candidates.unambiguousRecords[map]) as Readonly<Record<string, JsonObject>>;
    const groups = new Map<string, { revision: JsonObject; entry: JsonObject }[]>();
    for (const r of Object.values(table(revisionMap))) for (const e of list(r.anchorCompatibilityClasses).map(object)) {
      charge(); const group = groups.get(string(e.id)) ?? []; group.push({ revision: r, entry: e }); groups.set(string(e.id), group);
    }
    const clearedClasses = new Set<string>();
    for (const [classId, entries] of groups) if (entries.length > 1) {
      const first = entries[0]!, selected: JsonObject[] = []; let complete = true;
      for (const e of entries) {
        if (e.revision.assetId !== first.revision.assetId || !same(e.entry.targetVariantFamilyIds, first.entry.targetVariantFamilyIds)) complete = false;
        selected.push(e.revision);
        for (const id of list(e.revision.representationIds)) {
          charge(); const r = table(repMap)[string(id)]; if (!r) { complete = false; continue; }
          if (list(e.entry.targetVariantFamilyIds).includes(r.variantFamilyId!)) {
            selected.push(r); if (repEvidence.get(canonical(r))?.outcome !== 'verified') complete = false;
          }
        }
        for (const family of list(e.entry.targetVariantFamilyIds)) if (!list(e.revision.representationIds).some(id => table(repMap)[string(id)]?.variantFamilyId === family)) complete = false;
      }
      if (!complete) continue;
      const result = await query('surface-equivalence', unique(selected), { classId, assetId: first.revision.assetId!, targetVariantFamilyIds: first.entry.targetVariantFamilyIds! },
        [revisionMap, string(first.revision.id), 'anchorCompatibilityClasses']);
      if (result.outcome === 'verified') for (const e of entries) clearedClasses.add(`${e.revision.id}:${classId}`);
      else for (const e of entries.slice(1)) report([revisionMap, string(e.revision.id), 'anchorCompatibilityClasses'], `surface-equivalence-${result.outcome}`);
    }
    const anchorsChecked = new Set<string>(), anchorsPending = new Set<string>();
    for (const f of candidates.fields) if (f.path[0] === 'captionsById' && f.path[2] === 'anchor') {
      const valid = new Set(f.validOperationIds);
      for (const c of f.candidates) if (valid.has(c.operationId) && c.value.kind === 'value') {
        charge(); const anchor = object(c.value.value), evidence = anchor.hitEvidence ? object(anchor.hitEvidence) : undefined;
        const source = evidence?.source ? object(evidence.source) : undefined; if (!source?.surfaceRef) continue;
        const r = table(repMap)[string(source.representationId)], facts = r && repEvidence.get(canonical(r));
        if (facts?.outcome !== 'verified') { anchorsPending.add(f.path[1]!); report(f.path, 'source-index-unverified', 'unverified', c.operationId); continue; }
        anchorsChecked.add(f.path[1]!);
        if (!sourceIndexInRange(object(source.surfaceRef), facts.facts!)) report(f.path, 'source-index-out-of-range', 'invalid', c.operationId);
      }
    }
    const issues = candidates.issues.filter(i => {
      if (i.kind !== 'unverified') return true;
      if (i.code === 'verified-profile-content-bounds-catalog-required' || i.code === 'verified-media-bytes-required') return !required.has(i.path[1]!); // required members have individual executed checks above
      if (i.code === 'verified-source-index-range-required') return !anchorsChecked.has(i.path[1]!) || anchorsPending.has(i.path[1]!);
      if (i.code === 'verified-surface-equivalence-required') {
        const r = table(revisionMap)[i.path[1]!];
        return !r || list(r.anchorCompatibilityClasses).some(e => { const id = string(object(e).id); return (groups.get(id)?.length ?? 0) > 1 && !clearedClasses.has(`${r.id}:${id}`); });
      }
      return true;
    });
    return Object.freeze({ kind: 'project-content-inspection', token: candidates.token, scope, candidates, checks: Object.freeze(checks),
      issues: Object.freeze([...new Map([...issues, ...added].map(i => [canonical(i as unknown as JsonValue), i])).values()]),
      pendingAuthority: Object.freeze(['affected-closure-projection-and-same-token-provider'] as const) });
  } catch (error) { if (error instanceof DomainValidationError) return Object.freeze({ kind: 'rejected', issue: error.issue }); throw error; }
}
