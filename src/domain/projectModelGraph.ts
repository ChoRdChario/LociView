import { active, canonical, GraphInspection, list, object, same, string } from './projectGraphSupport';
import type { JsonObject, JsonValue } from './values';

const visual = new Set(['meshPrimary', 'pointPrimary', 'gsPrimary', 'visualPatch']);
const identity = (t: JsonObject) => same(t.translation, [0, 0, 0]) && same(t.rotationXYZW, [0, 0, 0, 1]) && t.uniformScale === 1 && t.reflection === 'none';
const familiesIn = (reps: readonly JsonObject[]) => new Map(reps.map(r => [string(r.variantFamilyId), r]));
export function familyCatalog(r: JsonObject): JsonValue | undefined {
  if (!r.materialCatalog) return undefined;
  const c = object(r.materialCatalog); return { layoutId: c.layoutId!, slots: list(c.slots).map(s => {
    const slot = object(s); return { logicalMaterialSlotId: slot.logicalMaterialSlotId!, sourceSemantics: slot.sourceSemantics! };
  }) };
}

/** Known metadata relations only. Verified profile/material/bounds/surface semantics are still required. */
export function inspectModelGraph(g: GraphInspection): void {
  const assets = g.table('assetsById'), reps = g.table('representationsById');
  const projectFrame = object(object(g.records.project).frame).id;
  const frameOwners = new Map<string, string[]>(), frames = new Map<string, JsonObject[]>(), families = new Map<string, JsonObject[]>(), groups = new Map<string, JsonObject[]>();
  for (const a of Object.values(assets)) {
    const id = string(a.id), frame = string(a.assetFrameId), owners = frameOwners.get(frame) ?? []; owners.push(id); frameOwners.set(frame, owners);
    if (frame === projectFrame) g.issue('assetsById', id, 'assetFrameId', 'project-frame-collision');
    if (active(a)) g.roots.add(id);
    const status = object(a.status);
    if (status.kind === 'ready') {
      const bindingId = string(status.activeBindingId); g.edge(id, bindingId, 'status.activeBindingId');
      const binding = g.table('assetBindingsById')[bindingId];
      if (!binding || binding.assetId !== a.id) g.issue('assetsById', id, 'status', binding ? 'foreign-owner' : 'missing-reference');
    }
  }
  for (const owners of frameOwners.values()) if (owners.length > 1) for (const id of owners) g.issue('assetsById', id, 'assetFrameId', 'shared-asset-frame');
  for (const r of Object.values(reps)) {
    const id = string(r.id), owner = assets[string(r.assetId)];
    if (!owner) g.issue('representationsById', id, 'assetId', 'missing-reference');
    if (['meshPrimary', 'pointPrimary', 'visualPatch'].includes(string(r.role)) && !r.materialCatalog)
      g.issue('representationsById', id, 'materialCatalog', 'required-material-catalog-missing');
    const frame = string(r.representationFrameId);
    if (frame === projectFrame) g.issue('representationsById', id, 'representationFrameId', 'project-frame-collision');
    const foreign = frameOwners.get(frame);
    if (foreign?.some(a => a !== r.assetId)) g.issue('representationsById', id, 'representationFrameId', 'foreign-asset-frame');
    if ((owner?.assetFrameId === frame || r.role === 'splatExclusion') && (!identity(object(r.representationToAsset)) || owner?.assetFrameId !== frame))
      g.issue('representationsById', id, 'representationToAsset', 'asset-frame-alias-requires-identity');
    for (const [index, key] of [[frames, frame], [families, string(r.variantFamilyId)], ...(r.compositeGroupId ? [[groups, string(r.compositeGroupId)] as const] : [])] as const) {
      const entries = index.get(key) ?? []; entries.push(r); index.set(key, entries);
    }
    for (const target of list(r.derivedFrom)) {
      g.edge(id, string(target), 'derivedFrom');
      if (!reps[string(target)] || reps[string(target)]!.assetId !== r.assetId) g.issue('representationsById', id, 'derivedFrom', reps[string(target)] ? 'foreign-owner' : 'missing-reference');
    }
    g.edge(id, `blob:${string(object(r.blob).digest)}`, 'blob');
    if (r.derivation) for (const digest of list(object(r.derivation).inputBlobDigests)) g.edge(id, `blob:${string(digest)}`, 'derivation.inputBlobDigests', 'weak');
    g.issue('representationsById', id, 'formatProfile', 'verified-profile-content-bounds-catalog-required', 'unverified');
  }
  const uniform = (members: readonly JsonObject[], field: string, key: (r: JsonObject) => JsonValue | undefined, code: string) => {
    const expected = key(members[0]!), encoded = expected === undefined ? undefined : canonical(expected);
    if (members.some(r => { const value = key(r); return (value === undefined ? undefined : canonical(value)) !== encoded; }))
      for (const r of members) g.issue('representationsById', string(r.id), field, code);
  };
  for (const rs of frames.values()) uniform(rs, 'representationFrameId', r => [r.assetId!, r.representationToAsset!], 'shared-frame-mismatch');
  for (const rs of families.values()) {
    uniform(rs, 'variantFamilyId', r => ({ assetId: r.assetId!, role: r.role!, contentKind: r.contentKind!, logicalBoundsAsset: r.logicalBoundsAsset!,
      relations: ['compositeGroupId', 'proxyForGsVariantFamilyId', 'targetGsVariantFamilyIds'].map(k => r[k] ?? null), catalog: familyCatalog(r) ?? null }), 'family-semantics-mismatch');
    if (rs[0]!.role === 'splatExclusion' && rs.length !== 1) for (const r of rs) g.issue('representationsById', string(r.id), 'variantFamilyId', 'exclusion-family-not-singleton');
  }
  for (const rs of groups.values()) uniform(rs, 'compositeGroupId', r => r.assetId, 'foreign-group-owner');
  inspectDerivation(g);
  const classes = new Map<string, { revision: JsonObject; entry: JsonObject }[]>();
  for (const revision of g.all('assetRevisionsById')) {
    const id = string(revision.id), owner = assets[string(revision.assetId)];
    for (const digest of list(object(revision.provenance).inputBlobDigests)) g.edge(id, `blob:${string(digest)}`, 'provenance.inputBlobDigests', 'weak');
    if (!owner) g.issue('assetRevisionsById', id, 'assetId', 'missing-reference');
    if (revision.parentRevisionId) {
      const parent = g.ref('assetRevisionsById', revision, 'parentRevisionId', 'assetRevisionsById', 'weak');
      if (parent && parent.assetId !== revision.assetId) g.issue('assetRevisionsById', id, 'parentRevisionId', 'foreign-owner');
    }
    const contents: JsonObject[] = [];
    for (const repId of list(revision.representationIds)) {
      const r = reps[string(repId)]; g.edge(id, string(repId), 'representationIds');
      if (!r || r.assetId !== revision.assetId) g.issue('assetRevisionsById', id, 'representationIds', r ? 'foreign-owner' : 'missing-reference');
      else contents.push(r);
    }
    const families = familiesIn(contents), domain = new Set(contents.filter(r => visual.has(string(r.role))).map(r => string(r.variantFamilyId))), covered = new Set<string>();
    if (!domain.size) g.issue('assetRevisionsById', id, 'representationIds', 'empty-visual-set');
    for (const value of list(revision.anchorCompatibilityClasses)) {
      const c = object(value), classId = string(c.id), entries = classes.get(classId) ?? []; entries.push({ revision, entry: c }); classes.set(classId, entries);
      for (const f of list(c.targetVariantFamilyIds)) {
        const familyId = string(f);
        if (!domain.has(familyId) || covered.has(familyId) || (families.get(familyId)?.role === 'visualPatch' && list(c.targetVariantFamilyIds).length !== 1))
          g.issue('assetRevisionsById', id, 'anchorCompatibilityClasses', 'invalid-class-partition');
        covered.add(familyId);
      }
    }
    if ([...domain].some(f => !covered.has(f))) g.issue('assetRevisionsById', id, 'anchorCompatibilityClasses', 'invalid-class-partition');
    for (const r of contents) {
      if (r.role === 'interactionProxy' && families.get(string(r.proxyForGsVariantFamilyId))?.role !== 'gsPrimary')
        g.issue('assetRevisionsById', id, 'representationIds', 'proxy-target-not-gs-in-revision');
      if (r.role === 'splatExclusion') {
        if (list(r.targetGsVariantFamilyIds).some(f => families.get(string(f))?.role !== 'gsPrimary')) g.issue('assetRevisionsById', id, 'representationIds', 'exclusion-target-not-gs-in-revision');
        if (!contents.some(p => p.role === 'visualPatch' && p.compositeGroupId === r.compositeGroupId)) g.issue('assetRevisionsById', id, 'representationIds', 'exclusion-group-without-patch');
      }
    }
    inspectMaterialMaps(g, revision, contents);
  }
  for (const entries of classes.values()) {
    const first = entries[0]!;
    if (entries.some(e => e.revision.assetId !== first.revision.assetId || !same(e.entry.targetVariantFamilyIds, first.entry.targetVariantFamilyIds))) {
      for (const { revision } of entries) g.issue('assetRevisionsById', string(revision.id), 'anchorCompatibilityClasses', 'class-owner-or-membership-changed');
    } else if (entries.length > 1) for (const { revision } of entries)
      g.issue('assetRevisionsById', string(revision.id), 'anchorCompatibilityClasses', 'verified-surface-equivalence-required', 'unverified');
  }
  for (const binding of g.all('assetBindingsById')) {
    const id = string(binding.id);
    if (!assets[string(binding.assetId)]) g.issue('assetBindingsById', id, 'assetId', 'missing-reference');
    for (const [field, map, strength] of [['assetRevisionId', 'assetRevisionsById', 'strong'], ['parentBindingId', 'assetBindingsById', 'weak']] as const) {
      if (!binding[field]) continue;
      const r = g.ref('assetBindingsById', binding, field, map, strength);
      if (r && r.assetId !== binding.assetId) g.issue('assetBindingsById', id, field, 'foreign-owner');
    }
  }
}

function inspectDerivation(g: GraphInspection) {
  const reps = g.table('representationsById'), remaining = new Map<string, number>(), dependents = new Map<string, string[]>(), depths = new Map<string, number>(), ready: string[] = [];
  for (const r of Object.values(reps)) {
    const id = string(r.id), deps = list(r.derivedFrom).map(string).filter(id => !!reps[id]); remaining.set(id, deps.length); depths.set(id, 0);
    if (!deps.length) ready.push(id);
    for (const dep of deps) { const ds = dependents.get(dep) ?? []; ds.push(id); dependents.set(dep, ds); }
  }
  // Iterative topological depth: no attacker-controlled recursion or quadratic path enumeration.
  for (let cursor = 0; cursor < ready.length; cursor++) {
    const id = ready[cursor]!, depth = depths.get(id)!;
    if (depth > 32) g.issue('representationsById', id, 'derivedFrom', 'derivation-depth-exceeded');
    for (const next of dependents.get(id) ?? []) {
      depths.set(next, Math.max(depths.get(next)!, depth + 1)); const n = remaining.get(next)! - 1; remaining.set(next, n); if (!n) ready.push(next);
    }
  }
  for (const [id, n] of remaining) if (n) g.issue('representationsById', id, 'derivedFrom', 'cyclic-derivation-closure');
}

function inspectMaterialMaps(g: GraphInspection, revision: JsonObject, contents: readonly JsonObject[]) {
  const destinations = new Map<string, Set<string>>(), sources = new Map<string, Set<string>>();
  const add = (index: Map<string, Set<string>>, key: string, value: string) => { const values = index.get(key) ?? new Set<string>(); values.add(value); index.set(key, values); };
  for (const value of revision.materialCompatibilityMaps ? list(revision.materialCompatibilityMaps) : []) {
    const m = object(value), source = object(m.source), destination = object(m.destination), id = string(revision.id);
    g.edge(id, string(source.assetRevisionId), 'materialCompatibilityMaps.source', 'weak');
    const bad = () => g.issue('assetRevisionsById', id, 'materialCompatibilityMaps', 'invalid-direct-parent-material-map');
    if (destination.assetRevisionId !== revision.id || source.assetRevisionId !== revision.parentRevisionId) { bad(); continue; }
    const parent = g.table('assetRevisionsById')[string(source.assetRevisionId)]; if (!parent || parent.assetId !== revision.assetId) { bad(); continue; }
    const find = (rs: readonly JsonObject[], e: JsonObject) => rs.find(r => r.variantFamilyId === e.variantFamilyId && r.materialCatalog && object(r.materialCatalog).layoutId === e.layoutId);
    const from = find(list(parent.representationIds).map(id => g.table('representationsById')[string(id)]).filter((r): r is JsonObject => !!r), source), to = find(contents, destination);
    if (!from || !to) { bad(); continue; }
    const slots = object(m.slots), fromIds = new Set(list(object(from.materialCatalog).slots).map(s => string(object(s).logicalMaterialSlotId))), toIds = new Set(list(object(to.materialCatalog).slots).map(s => string(object(s).logicalMaterialSlotId)));
    const values = Object.values(slots).map(string);
    if (Object.keys(slots).some(k => !fromIds.has(k)) || values.some(v => !toIds.has(v)) || new Set(values).size !== values.length) { bad(); continue; }
    if (Object.keys(slots).length !== fromIds.size || values.length !== toIds.size) g.issue('assetRevisionsById', id, 'materialCompatibilityMaps', 'partial-material-map', 'needs-review');
    for (const [fromSlot, toSlot] of Object.entries(slots)) {
      const a = canonical([source.assetRevisionId!, source.variantFamilyId!, source.layoutId!, fromSlot]), b = canonical([destination.assetRevisionId!, destination.variantFamilyId!, destination.layoutId!, toSlot]);
      add(destinations, a, b); add(sources, b, a);
    }
  }
  if ([...destinations.values(), ...sources.values()].some(values => values.size > 1))
    g.issue('assetRevisionsById', string(revision.id), 'materialCompatibilityMaps', 'ambiguous-material-maps', 'needs-review');
}
