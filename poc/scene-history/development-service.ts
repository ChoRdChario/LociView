// Isolated complete-source service. No product format, UI driver or Native converter.
import { A, type Doc, type Ref, type Target, require, canonical, parse, refs, same, validateRoot } from './journal-format';
import { readDevelopmentSource, developmentCandidateInput, developmentSourceLimits, sourceKey } from './development-source';
import { inspectAtomicHistory, HistoryIndex, type AtomicChange, type AtomicCandidate } from '../../src/domain/atomicHistory';
import type { HistorySnapshot } from '../../src/harness/projectScene/historyPort';
import { readProjectScene, type ProjectProviderRead } from '../../src/scene/projectProvider';
import type { ProjectContentVerifier } from '../../src/domain/projectContentChecks';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
type RecordValue = Record<string, any>;
type Entry = { path: string[]; key: string; value: RecordValue; change: AtomicChange };
export interface GuardChoice { unit: string; kind: 'managed' | 'birth'; alternatives: readonly RecordValue[]; unresolved: boolean }
export interface ServiceRead { token: string; provider: Provider; guards: readonly GuardChoice[]; retained: Ref[] }
const namespace = 'isolatedBridge';
const encoder = new TextEncoder();
const decode = (text: string) => { const value = parse(encoder.encode(text)); require(canonical(value) === text, 'noncanonical service value'); return value; };
const pathOf = (key: string): string[] => {
  const path = JSON.parse(key);
  require(Array.isArray(path) && path.length && path.every(k => typeof k === 'string' && k.length) && sourceKey(path) === key, 'invalid service path');
  return path;
};
const controlKey = (key: string) => pathOf(key)[0] === namespace;
const closed = (v: RecordValue, keys: string[]) => require(v && typeof v === 'object' && !Array.isArray(v) && same(Object.keys(v).sort(), [...keys].sort()), 'invalid guard members');
const id = (v: unknown, prefix: string) => require(typeof v === 'string' && new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(v), 'invalid guard ID');
const unitId = (v: string) => require(/^[a-z][a-z0-9-]{0,47}$/.test(v), 'invalid guard unit');

/** Private validation projection only. Never serialize this in place of original bytes. */
export function serviceDomainSource(raw: HistorySnapshot): HistorySnapshot {
  require(raw.originalAtomicHistory && raw.causalChanges, 'missing complete service source');
  const domainEntries = <T>(v: Readonly<Record<string, T>>) => Object.fromEntries(Object.entries(v).filter(([k]) => !controlKey(k)));
  return { token: raw.token, cells: domainEntries(raw.cells), cellVersions: domainEntries(raw.cellVersions ?? {}),
    causalChanges: raw.causalChanges.map(c => ({ ...c, writes: domainEntries(c.writes) })),
    originalAtomicHistory: { ...raw.originalAtomicHistory, changes: raw.originalAtomicHistory.changes.map(c => ({ ...c,
      writes: c.writes.filter(w => { require(w.path.length === 1, 'invalid source path'); return !controlKey(w.path[0]!); }) })) } };
}

function inspectGuards(raw: HistorySnapshot, doc: Doc, provider: Provider): GuardChoice[] {
  const history = raw.originalAtomicHistory!;
  const inspected = inspectAtomicHistory(history, developmentSourceLimits); require(inspected.kind !== 'rejected', 'invalid service DAG');
  const index = new HistoryIndex(history, developmentSourceLimits.maxWork);
  const entries: Entry[] = [];
  for (const change of history.changes) for (const w of change.writes) if (controlKey(w.path[0]!)) {
    require(w.value.kind === 'value' && typeof w.value.value === 'string', 'deleted guard evidence');
    entries.push({ path: pathOf(w.path[0]!), key: w.path[0]!, value: decode(w.value.value), change });
  }
  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) { const group = grouped.get(entry.key) ?? []; group.push(entry); grouped.set(entry.key, group); }
  const immutable = (key: string) => {
    const group = grouped.get(key); require(group?.length === 1, 'missing or rewritten guard registration');
    // Final-write inspection must not hide earlier assignments in the same change.
    const operations = A.getAllChanges(doc).flatMap(b => A.decodeChange(b).ops.filter(op => op.key === key));
    require(operations.length === 1 && operations[0]!.action === 'set', 'rewritten immutable guard');
    return group[0]!;
  };
  const foundation = immutable(sourceKey([namespace, 'foundation']));
  closed(foundation.value, ['caseId', 'baselineHeads']); unitId(foundation.value.caseId);
  require(foundation.change.deps.length && same(foundation.value.baselineHeads, [...foundation.change.deps].sort()), 'foundation ancestry mismatch');
  require(same(foundation.value.baselineHeads, history.changes.filter(c => !c.deps.length).map(c => c.id).sort()), 'foundation is not the fixed development baseline');
  const mutable = provider.details.mutable;
  const scalar = (map: keyof typeof mutable, recordId: string, field: string) => {
    const cell = mutable[map][recordId]?.[field]; require(cell?.kind === 'value', 'guard endpoint is not authoritative'); return cell.value;
  };
  const entryAt = (key: string, change: AtomicChange) => {
    const e = immutable(key); require(e.change.id === change.id || index.before(e.change.id, change.id), 'guard registration is not an ancestor'); return e;
  };
  const groups = new Map<string, { kind: 'managed' | 'birth'; unit: string; identity: Entry; registrations: Entry[]; selections: Entry[] }>();
  for (const e of entries) {
    if (e === foundation) continue;
    require(index.before(foundation.change.id, e.change.id), 'guard outside registered foundation');
    const [, kind, unit, field, recordId] = e.path;
    require((kind === 'managed' || kind === 'birth') && !!unit, 'unknown guard namespace'); unitId(unit);
    const key = sourceKey([namespace, kind, unit]);
    const identity = immutable(sourceKey([namespace, kind, unit, 'identity']));
    if (kind === 'managed') { closed(identity.value, ['captionId']); id(identity.value.captionId, 'cap'); }
    else { closed(identity.value, ['sourceUnit']); unitId(identity.value.sourceUnit); }
    require(identity.change.id === e.change.id || index.before(identity.change.id, e.change.id), 'unit identity is not an ancestor');
    const group = groups.get(key) ?? { kind, unit, identity, registrations: [], selections: [] }; groups.set(key, group);
    if (field === 'identity') require(e.path.length === 4, 'invalid unit path');
    else if (field === 'selection') {
      require(e.path.length === 4, 'invalid selection path'); group.selections.push(e);
      if (kind === 'managed') {
        closed(e.value, ['membershipIds']); require(Array.isArray(e.value.membershipIds) && e.value.membershipIds.length <= 32 &&
          same(e.value.membershipIds, [...new Set(e.value.membershipIds)].sort()), 'invalid managed selection');
        e.value.membershipIds.forEach((v: unknown) => id(v, 'scm'));
      } else { closed(e.value, ['captionId']); if (e.value.captionId !== null) id(e.value.captionId, 'cap'); }
    } else {
      require(e.path.length === 5 && !!recordId && field === (kind === 'managed' ? 'members' : 'targets'), 'unknown guard path');
      immutable(e.key); group.registrations.push(e);
      if (kind === 'managed') {
        id(recordId, 'scm'); closed(e.value, ['sceneId']); id(e.value.sceneId, 'scn');
        require(scalar('sceneCaptionMembershipsById', recordId, 'captionId') === identity.value.captionId &&
          scalar('sceneCaptionMembershipsById', recordId, 'sceneId') === e.value.sceneId, 'managed endpoint mismatch');
      } else {
        id(recordId, 'cap'); closed(e.value, ['membershipId', 'sceneId']); id(e.value.membershipId, 'scm'); id(e.value.sceneId, 'scn');
        require(scalar('sceneCaptionMembershipsById', e.value.membershipId, 'captionId') === recordId &&
          scalar('sceneCaptionMembershipsById', e.value.membershipId, 'sceneId') === e.value.sceneId, 'birth endpoint mismatch');
        // A target is introduced complete in this original change, not a partial
        // future record, reference alias or an already-existing Caption.
        for (const field of ['id', 'lifecycle', 'title', 'body', 'colorSrgb', 'anchor']) {
          const k = sourceKey(['captionsById', recordId, field]);
          const writes = history.changes.flatMap(c => c.writes.filter(w => w.path[0] === k).map(w => ({ c, w })));
          require(writes.some(x => x.c.id === e.change.id && x.w.value.kind === 'value') &&
            writes.every(x => x.c.id === e.change.id || index.before(e.change.id, x.c.id)), 'incomplete or reused birth');
        }
      }
    }
  }
  const choices: GuardChoice[] = [], claimedEdges = new Set<string>(), claimedBirths = new Set<string>(), claimedUnits = new Set<string>();
  for (const group of groups.values()) {
    const owner = canonical([group.kind, group.kind === 'managed' ? group.identity.value.captionId : group.identity.value.sourceUnit]);
    require(!claimedUnits.has(owner), 'duplicate source unit ownership'); claimedUnits.add(owner);
    const prefix = [namespace, group.kind, group.unit];
    const selectionKey = sourceKey([...prefix, 'selection']);
    require(group.selections.length && group.selections.some(s => s.change.id === group.identity.change.id), 'unit lacks initial selection');
    for (const r of group.registrations) {
      const recordId = r.path[4]!;
      const claimed = group.kind === 'managed' ? claimedEdges : claimedBirths;
      require(!claimed.has(recordId), 'duplicate guard ownership'); claimed.add(recordId);
      require(group.selections.some(s => s.change.id === r.change.id), 'registration without atomic selection');
    }
    for (const s of group.selections) {
      if (group.kind === 'managed') {
        const registered = group.registrations.filter(r => r.change.id === s.change.id || index.before(r.change.id, s.change.id));
        for (const edge of s.value.membershipIds) entryAt(sourceKey([...prefix, 'members', edge]), s.change);
        for (const r of registered) {
          const k = sourceKey(['sceneCaptionMembershipsById', r.path[4]!, 'lifecycle']);
          const w = s.change.writes.find(w => w.path[0] === k);
          require(w?.value.kind === 'value' && typeof w.value.value === 'string' &&
            decode(w.value.value).state === (s.value.membershipIds.includes(r.path[4]) ? 'active' : 'deleted'), 'non-atomic managed lifecycle');
        }
      } else {
        if (s.change.id === group.identity.change.id) require(s.value.captionId === null &&
          group.registrations.every(r => index.before(s.change.id, r.change.id)), 'birth must start unselected');
        else if (s.value.captionId !== null) entryAt(sourceKey([...prefix, 'targets', s.value.captionId]), s.change);
      }
    }
    const field = inspected.fields.find(f => f.path[0] === selectionKey); require(field?.candidates.length, 'missing guard selection');
    const candidates = field.candidates.map((c: AtomicCandidate) => {
      require(c.value.kind === 'value' && typeof c.value.value === 'string', 'absent selection candidate'); return decode(c.value.value);
    });
    let unresolved = candidates.length !== 1;
    if (group.kind === 'managed') {
      for (const r of group.registrations) {
        const edge = provider.state.captionMemberships[r.path[4]!]; require(edge, 'missing managed edge');
        if (!unresolved && (edge.lifecycle.kind !== 'value' || edge.lifecycle.value.state !==
          (candidates[0]!.membershipIds.includes(edge.id) ? 'active' : 'deleted'))) unresolved = true;
      }
      if (unresolved) for (const r of group.registrations) suppressMembership(provider, r.path[4]!);
    } else {
      const selected = unresolved ? null : candidates[0]!.captionId;
      for (const r of group.registrations) if (r.path[4] !== selected) suppressCaption(provider, r.path[4]!);
    }
    choices.push({ unit: group.unit, kind: group.kind, alternatives: candidates, unresolved });
  }
  return choices;
}

function suppressMembership(provider: Provider, id: string) {
  // The provider is a private clone. Diagnostics retain every record/candidate;
  // downstream authoritative state/details must not expose an unguarded edge.
  const edge = provider.state.captionMemberships[id];
  if (edge) (provider.state.captionMemberships as Record<string, unknown>)[id] = { ...edge, lifecycle: { kind: 'unresolved', reason: 'conflict' } };
  const detail = provider.details.mutable.sceneCaptionMembershipsById[id];
  if (detail) (provider.details.mutable.sceneCaptionMembershipsById as Record<string, unknown>)[id] = { ...detail, lifecycle: { kind: 'unresolved', reason: 'conflict' } };
}
function suppressCaption(provider: Provider, id: string) {
  delete (provider.resources.captions as Record<string, unknown>)[id];
  delete (provider.details.mutable.captionsById as Record<string, unknown>)[id];
  for (const e of Object.values(provider.state.captionMemberships)) if (e.resourceId === id) suppressMembership(provider, e.id);
  const referencesCaption = (map: string, recordId: string) => provider.inspection.candidates.fields.some(f =>
    same(f.path, [map, recordId, 'captionId']) && f.candidates.some(c => c.value.kind === 'value' && c.value.value === id));
  for (const key of Object.keys(provider.details.mutable.captionAttachmentsById))
    if (referencesCaption('captionAttachmentsById', key)) {
      delete (provider.details.mutable.captionAttachmentsById as Record<string, unknown>)[key];
      delete (provider.details.attachments as Record<string, unknown>)[key];
    }
  for (const key of Object.keys(provider.details.tagMemberships)) if (referencesCaption('captionTagMembershipsById', key)) {
    delete (provider.details.tagMemberships as Record<string, unknown>)[key];
    delete (provider.details.mutable.captionTagMembershipsById as Record<string, unknown>)[key];
  }
}

/** Same original heads drive domain authority, controls and conservative retention. */
export async function readDevelopmentService(doc: Doc, target: Target, verifier: ProjectContentVerifier): Promise<ServiceRead> {
  validateRoot(doc, target);
  const raw = readDevelopmentSource(A, doc as A.Doc<{ cells: Record<string, A.ImmutableString> }>);
  const input = developmentCandidateInput(serviceDomainSource(raw));
  const result = await readProjectScene(input, developmentSourceLimits, verifier);
  require(result.kind === 'scene-provider', 'full service provider unavailable');
  require(!result.issues.some(i => i.kind === 'invalid' || i.kind === 'orphan'), 'invalid full service domain');
  require(result.inspection.checks.every(c => c.outcome === 'verified'), 'full service content verification failed');
  require(result.token === raw.token && same(input.history.heads, raw.originalAtomicHistory!.heads), 'mixed service heads');
  const provider = structuredClone(result);
  const guards = inspectGuards(raw, doc, provider);
  // Explicit known immutable-body roots, including inactive and nonselected births.
  // No inferred BlobRef traversal through opaque controls; no GC is implemented.
  const retained = new Map<string, Ref>();
  for (const change of input.history.changes) for (const w of change.writes)
    if (w.path.length === 2 && ['representationsById', 'mediaResourcesById'].includes(w.path[0]!) && w.value.kind === 'value') {
      const ref = (w.value.value as RecordValue).blob as Ref; refs([ref]);
      require(!retained.has(ref.digest) || same(retained.get(ref.digest), ref), 'retained body identity mismatch'); retained.set(ref.digest, ref);
    }
  return { token: raw.token, provider, guards, retained: [...retained.values()].sort((a, b) => a.digest < b.digest ? -1 : 1) };
}
