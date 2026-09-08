import { cloneCanonicalValue, DomainValidationError, reject, type JsonObject, type JsonValue, type ValidationIssue, type ValueLimits } from './values';
import { admitSceneRecord } from './sceneRecords';
import { admitMaterialRecord } from './materialRecords';
import { ProjectRecordFields } from './projectRecordFields';

export const projectRecordMaps = Object.freeze({ assetsById: 'ast', assetRevisionsById: 'rev', assetBindingsById: 'bnd',
  representationsById: 'rep', mediaResourcesById: 'med', captionsById: 'cap', captionAttachmentsById: 'att', captionTagsById: 'tag',
  captionTagMembershipsById: 'tgm', scenesById: 'scn', sceneAssetMembershipsById: 'sam', sceneCaptionMembershipsById: 'scm',
  viewsById: 'view', materialOverridesById: 'ovr' } as const);
export type ProjectRecordMap = keyof typeof projectRecordMaps;
/** Structural success only: deliberately not compatible with SceneResources or a Project session. */
export type ProjectRecordsAdmission = Readonly<{ kind: 'valid-records'; records: JsonObject; hasUnknownFields: boolean; entityCount: number }> |
  Readonly<{ kind: 'rejected'; issue: ValidationIssue }>;

/**
 * Stage A of the complete provider. Already decoded plain data only, before any
 * authoritative projection. No graph, history, digest, decoder, blob or write receipt.
 * The future adapter must supply/check all candidates; passing its winner here is not admission.
 */
export function admitProjectRecords(input: unknown, requested: ValueLimits): ProjectRecordsAdmission {
  try {
    // Validate caller budgets too: a NaN/negative option must not loosen the semantic ceilings.
    for (const [key, n] of Object.entries(requested)) if (!Number.isSafeInteger(n) || n < 0) reject('limit', [key]);
    const limits = { maxDepth: Math.min(32, requested.maxDepth), maxNodes: Math.min(5_000_000, requested.maxNodes), maxStringScalars: requested.maxStringScalars };
    const c = new ProjectRecordFields(), root = c.shape(cloneCanonicalValue(input, limits), ['schema', 'identity', 'project', ...Object.keys(projectRecordMaps)], []);
    const schema = c.shape(c.required(root, 'schema', []), ['major', 'minor'], ['schema']);
    c.enum(c.required(schema, 'major', ['schema']), [2], ['schema', 'major']); c.integer(c.required(schema, 'minor', ['schema']), ['schema', 'minor']);
    const identity = c.shape(c.required(root, 'identity', []), ['projectId', 'historyEpoch', 'lineageSeed'], ['identity']);
    c.id(c.required(identity, 'projectId', ['identity']), 'prj', ['identity', 'projectId']);
    c.id(c.required(identity, 'historyEpoch', ['identity']), 'hep', ['identity', 'historyEpoch']); c.digest(c.required(identity, 'lineageSeed', ['identity']), ['identity', 'lineageSeed']);
    const project = c.shape(c.required(root, 'project', []), ['title', 'frame', 'defaultSceneId'], ['project']);
    c.text(c.required(project, 'title', ['project']), 256, ['project', 'title']); c.id(c.required(project, 'defaultSceneId', ['project']), 'scn', ['project', 'defaultSceneId']);
    const frame = c.shape(c.required(project, 'frame', ['project']), ['id', 'handedness', 'upAxis', 'unit'], ['project', 'frame']);
    c.id(c.required(frame, 'id', ['project', 'frame']), 'frm', ['project', 'frame', 'id']);
    c.enum(c.required(frame, 'handedness', ['project', 'frame']), ['right'], ['project', 'frame', 'handedness']);
    c.enum(c.required(frame, 'upAxis', ['project', 'frame']), ['+Y'], ['project', 'frame', 'upAxis']);
    const up = ['project', 'frame', 'unit'], unit = c.shape(c.required(frame, 'unit', ['project', 'frame']), ['kind', 'metersPerProjectUnit'], up);
    c.enum(c.required(unit, 'kind', up), ['meters', 'custom', 'unknown'], [...up, 'kind']);
    if (unit.kind === 'unknown') c.absent(unit, ['metersPerProjectUnit'], up);
    else if (unit.kind === 'meters') c.enum(c.required(unit, 'metersPerProjectUnit', up), [1], [...up, 'metersPerProjectUnit']);
    else c.positive(c.required(unit, 'metersPerProjectUnit', up), [...up, 'metersPerProjectUnit']);
    let entityCount = 0;
    const attachments = new Map<string, number>(), tagMemberships = new Map<string, number>();
    for (const map of Object.keys(projectRecordMaps) as ProjectRecordMap[]) {
      const table = c.object(c.required(root, map, []), [map]);
      entityCount += Object.keys(table).length; if (entityCount > 1_000_000) reject('limit', [map]);
      for (const [key, entry] of Object.entries(table)) {
        c.id(key, projectRecordMaps[map], [map, key]); const record = c.object(entry, [map, key]);
        try {
          if (c.id(c.required(record, 'id', []), projectRecordMaps[map], ['id']) !== key) reject('identity', ['id']);
          checkRecord(c, map, record, limits);
          if (map === 'captionAttachmentsById' || map === 'captionTagMembershipsById') {
            const counts = map === 'captionAttachmentsById' ? attachments : tagMemberships, id = record.captionId as string;
            const count = (counts.get(id) ?? 0) + 1; if (count > 4096) reject('limit', ['captionId']); counts.set(id, count);
          }
        } catch (error) {
          if (error instanceof DomainValidationError) throw new DomainValidationError(error.issue.code, [map, key, ...error.issue.path]); throw error;
        }
      }
    }
    // Migration support/unknown root members are preserved and flagged as opaque,
    // not claimed to have passed the separate migration or history-free policy.
    return Object.freeze({ kind: 'valid-records', records: root, hasUnknownFields: c.unknown, entityCount });
  } catch (error) {
    if (error instanceof DomainValidationError) return Object.freeze({ kind: 'rejected', issue: error.issue }); throw error;
  }
}

function checkRecord(c: ProjectRecordFields, map: ProjectRecordMap, r: JsonObject, limits: ValueLimits) {
  const required = (key: string) => c.required(r, key, []), id = (key: string, prefix: string) => c.id(required(key), prefix, [key]);
  const optionalId = (key: string, prefix: string) => c.optional(r, key, [], (v, p) => c.id(v, prefix, p));
  const text = (key: string, max = 256, body = false) => c.text(required(key), max, [key], body);
  const shape = (fields: readonly string[], mutable = true) => { c.shape(r, ['id', ...fields, mutable ? 'lifecycle' : 'payloadDigest'], []);
    if (mutable) c.lifecycle(required('lifecycle'), ['lifecycle']); else { c.digest(required('payloadDigest'), ['payloadDigest']); c.absent(r, ['lifecycle'], []); } };
  const order = () => c.order(required('orderKey'), ['orderKey']);
  const color = () => c.optional(r, 'colorSrgb', [], (v, p) => c.color(v, p));
  const delegated = map === 'scenesById' ? 'scene' : map === 'sceneAssetMembershipsById' ? 'assetMembership' : map === 'sceneCaptionMembershipsById' ? 'captionMembership' : null;
  if (delegated || map === 'materialOverridesById') {
    const result = delegated ? admitSceneRecord(delegated, r, limits, r.id as string) : admitMaterialRecord(r, limits, r.id as string);
    if (result.kind === 'rejected') throw new DomainValidationError(result.issue.code, result.issue.path);
    c.unknown ||= result.hasUnknownFields; return;
  }
  if (map === 'assetsById') {
    shape(['label', 'assetFrameId', 'status']); text('label'); id('assetFrameId', 'frm');
    const s = c.shape(required('status'), ['kind', 'activeBindingId', 'reason', 'expectedLabel', 'expectedDigest', 'pendingAssetToProject'], ['status']);
    c.enum(c.required(s, 'kind', ['status']), ['ready', 'unresolved'], ['status', 'kind']);
    if (s.kind === 'ready') { c.id(c.required(s, 'activeBindingId', ['status']), 'bnd', ['status', 'activeBindingId']);
      c.absent(s, ['reason', 'expectedLabel', 'expectedDigest', 'pendingAssetToProject'], ['status']); }
    else { c.absent(s, ['activeBindingId'], ['status']); c.enum(c.required(s, 'reason', ['status']), ['missingSource', 'unsupportedFormat', 'migrationError'], ['status', 'reason']);
      c.optional(s, 'expectedLabel', ['status'], (v, p) => c.text(v, 256, p)); c.optional(s, 'expectedDigest', ['status'], (v, p) => c.digest(v, p));
      c.optional(s, 'pendingAssetToProject', ['status'], (v, p) => c.transform(v, p)); }
  } else if (map === 'assetBindingsById') {
    shape(['assetId', 'assetRevisionId', 'assetToProject', 'parentBindingId', 'method', 'residual'], false);
    id('assetId', 'ast'); id('assetRevisionId', 'rev'); optionalId('parentBindingId', 'bnd'); c.transform(required('assetToProject'), ['assetToProject']);
    c.enum(required('method'), ['import', 'manual', 'bounds', 'correspondence', 'migration'], ['method']); c.optional(r, 'residual', [], (v, p) => c.number(v, p));
  } else if (map === 'assetRevisionsById') {
    shape(['assetId', 'parentRevisionId', 'representationIds', 'anchorCompatibilityClasses', 'materialCompatibilityMaps', 'provenance'], false);
    id('assetId', 'ast'); optionalId('parentRevisionId', 'rev');
    const reps = c.list(required('representationIds'), 4096, ['representationIds']).map((v, i) => c.id(v, 'rep', ['representationIds', String(i)]));
    if (new Set(reps).size !== reps.length) reject('value', ['representationIds']);
    const classes = c.list(required('anchorCompatibilityClasses'), 4096, ['anchorCompatibilityClasses']); let previous = '';
    classes.forEach((v, i) => { const p = ['anchorCompatibilityClasses', String(i)], o = c.shape(v, ['id', 'targetVariantFamilyIds'], p);
      const key = c.id(c.required(o, 'id', p), 'cmp', [...p, 'id']); if (key <= previous) reject('canonical', p); previous = key;
      c.sorted(c.required(o, 'targetVariantFamilyIds', p), [...p, 'targetVariantFamilyIds'], (v, p) => c.id(v, 'fam', p), 1); });
    provenance(c, required('provenance'), ['provenance']);
    c.optional(r, 'materialCompatibilityMaps', [], (v, p) => c.list(v, Number.MAX_SAFE_INTEGER, p).forEach((v, i) => {
      const q = [...p, String(i)], o = c.shape(v, ['source', 'destination', 'slots'], q);
      for (const field of ['source', 'destination']) { const ep = [...q, field], e = c.shape(c.required(o, field, q), ['assetRevisionId', 'variantFamilyId', 'layoutId'], ep);
        for (const [key, prefix] of [['assetRevisionId', 'rev'], ['variantFamilyId', 'fam'], ['layoutId', 'lay']]) c.id(c.required(e, key!, ep), prefix!, [...ep, key!]); }
      const slots = c.object(c.required(o, 'slots', q), [...q, 'slots']);
      if (Object.keys(slots).length > 65_536) reject('limit', [...q, 'slots']);
      for (const [k, v] of Object.entries(slots)) { c.id(k, 'slot', [...q, 'slots', k]); c.id(v, 'slot', [...q, 'slots', k]); }
    }));
  } else if (map === 'representationsById') representation(c, r);
  else if (map === 'mediaResourcesById') {
    shape(['blob', 'mediaKind', 'label'], false); c.blob(required('blob'), ['blob']); c.enum(required('mediaKind'), ['image', 'video', 'audio', 'document'], ['mediaKind']);
    c.optional(r, 'label', [], (v, p) => c.text(v, 256, p));
  } else if (map === 'captionsById') { shape(['title', 'body', 'colorSrgb', 'anchor']); text('title', 512); text('body', 65_536, true); color(); c.anchor(required('anchor'), ['anchor']); }
  else if (map === 'captionAttachmentsById') { shape(['captionId', 'mediaResourceId', 'altText', 'orderKey']); id('captionId', 'cap'); id('mediaResourceId', 'med'); order();
    c.optional(r, 'altText', [], (v, p) => c.text(v, 4096, p)); }
  else if (map === 'captionTagsById') { shape(['label', 'colorSrgb', 'orderKey']); text('label'); order(); color(); }
  else if (map === 'captionTagMembershipsById') { shape(['captionId', 'tagId']); id('captionId', 'cap'); id('tagId', 'tag'); }
  else if (map === 'viewsById') { shape(['sceneId', 'name', 'orderKey', 'projectFrameId', 'camera', 'background']); id('sceneId', 'scn'); text('name'); order(); id('projectFrameId', 'frm');
    c.camera(required('camera'), ['camera']); c.background(required('background'), ['background']); }
}

function provenance(c: ProjectRecordFields, v: JsonValue, p: readonly string[], derived = false) {
  const o = c.shape(v, derived ? ['kind', 'tool', 'parameterDigest', 'inputBlobDigests'] : ['origin', 'tool', 'sourceMediaType', 'inputBlobDigests'], p);
  if (derived) { c.enum(c.required(o, 'kind', p), ['lod', 'preview', 'interactionProxy', 'formatConversion', 'staticPoseBake', 'splatExclusion'], [...p, 'kind']);
    c.tool(c.required(o, 'tool', p), [...p, 'tool']); c.digest(c.required(o, 'parameterDigest', p), [...p, 'parameterDigest']); }
  else { c.enum(c.required(o, 'origin', p), ['import', 'derived', 'migration'], [...p, 'origin']); c.optional(o, 'tool', p, (v, p) => c.tool(v, p));
    c.optional(o, 'sourceMediaType', p, (v, p) => c.mime(v, p)); }
  c.sorted(c.required(o, 'inputBlobDigests', p), [...p, 'inputBlobDigests'], (v, p) => c.digest(v, p));
}

function representation(c: ProjectRecordFields, r: JsonObject) {
  c.shape(r, ['id', 'assetId', 'representationFrameId', 'contentKind', 'purposes', 'role', 'variantFamilyId', 'formatProfile', 'blob', 'representationToAsset', 'logicalBoundsAsset',
    'derivedFrom', 'derivation', 'materialCatalog', 'compositeGroupId', 'targetGsVariantFamilyIds', 'proxyForGsVariantFamilyId', 'payloadDigest'], []);
  const req = (k: string) => c.required(r, k, []);
  c.absent(r, ['lifecycle'], []); c.digest(req('payloadDigest'), ['payloadDigest']);
  c.id(req('assetId'), 'ast', ['assetId']); c.id(req('representationFrameId'), 'frm', ['representationFrameId']); c.id(req('variantFamilyId'), 'fam', ['variantFamilyId']);
  const roles = { meshPrimary: 'mesh', pointPrimary: 'pointCloud', gsPrimary: 'gaussianSplat', visualPatch: 'mesh', interactionProxy: 'mesh', splatExclusion: 'splatMask' } as const;
  c.enum(req('role'), Object.keys(roles), ['role']); c.enum(req('contentKind'), [roles[r.role as keyof typeof roles]], ['contentKind']);
  const order = ['source', 'display', 'preview', 'interaction'], purposes = c.list(req('purposes'), 4, ['purposes'], 1); let previous = -1;
  purposes.forEach((v, i) => { c.enum(v, order, ['purposes', String(i)]); const at = order.indexOf(v as string); if (at <= previous) reject('canonical', ['purposes']); previous = at; });
  if (r.role === 'interactionProxy') { if (purposes.length !== 1 || purposes[0] !== 'interaction') reject('value', ['purposes']);
    c.id(req('proxyForGsVariantFamilyId'), 'fam', ['proxyForGsVariantFamilyId']); } else c.absent(r, ['proxyForGsVariantFamilyId'], []);
  if (r.role === 'splatExclusion') { if (!purposes.includes('display')) reject('value', ['purposes']); c.id(req('compositeGroupId'), 'grp', ['compositeGroupId']);
    c.sorted(req('targetGsVariantFamilyIds'), ['targetGsVariantFamilyIds'], (v, p) => c.id(v, 'fam', p), 1); }
  else { c.absent(r, ['targetGsVariantFamilyIds'], []); if (r.role === 'visualPatch') c.optional(r, 'compositeGroupId', [], (v, p) => c.id(v, 'grp', p)); else c.absent(r, ['compositeGroupId'], []); }
  if (!['interactionProxy', 'splatExclusion'].includes(r.role as string) && purposes.some(v => v === 'interaction')) reject('value', ['purposes']);
  const profile = c.shape(req('formatProfile'), ['id', 'specificationSha256'], ['formatProfile']);
  c.pattern(c.required(profile, 'id', ['formatProfile']), /^[a-z0-9][a-z0-9.-]{0,63}$/, ['formatProfile', 'id']);
  c.digest(c.required(profile, 'specificationSha256', ['formatProfile']), ['formatProfile', 'specificationSha256']);
  c.blob(req('blob'), ['blob']); c.transform(req('representationToAsset'), ['representationToAsset'], true); c.bounds(req('logicalBoundsAsset'), ['logicalBoundsAsset']);
  c.sorted(req('derivedFrom'), ['derivedFrom'], (v, p) => c.id(v, 'rep', p)); c.optional(r, 'derivation', [], (v, p) => provenance(c, v, p, true));
  c.optional(r, 'materialCatalog', [], (v, p) => {
    const o = c.shape(v, ['layoutId', 'slots'], p); c.id(c.required(o, 'layoutId', p), 'lay', [...p, 'layoutId']);
    const slots = c.list(c.required(o, 'slots', p), 65_536, [...p, 'slots'], 1), locators = new Set<string>(); let previous = '';
    slots.forEach((v, i) => { const q = [...p, 'slots', String(i)], slot = c.shape(v, ['logicalMaterialSlotId', 'sourceLocator', 'sourceSemantics', 'displayName'], q);
      const id = c.id(c.required(slot, 'logicalMaterialSlotId', q), 'slot', [...q, 'logicalMaterialSlotId']); if (id <= previous) reject('canonical', q); previous = id;
      const locator = c.sourceLocator(c.required(slot, 'sourceLocator', q), [...q, 'sourceLocator']); if (locators.has(locator)) reject('value', [...q, 'sourceLocator']); locators.add(locator);
      c.optional(slot, 'displayName', q, (v, p) => c.text(v, 256, p));
      const sp = [...q, 'sourceSemantics'], s = c.shape(c.required(slot, 'sourceSemantics', q), ['coverage', 'optics', 'lighting', 'doubleSided'], sp);
      c.enum(c.required(s, 'optics', sp), ['surface', 'transmission'], [...sp, 'optics']); c.enum(c.required(s, 'lighting', sp), ['lit', 'unlit'], [...sp, 'lighting']);
      c.enum(c.required(s, 'doubleSided', sp), [true, false], [...sp, 'doubleSided']);
      const cp = [...sp, 'coverage'], cv = c.shape(c.required(s, 'coverage', sp), ['kind', 'alphaCutoff'], cp);
      c.enum(c.required(cv, 'kind', cp), ['opaque', 'mask', 'blend'], [...cp, 'kind']);
      if (cv.kind === 'mask') c.unit(c.required(cv, 'alphaCutoff', cp), [...cp, 'alphaCutoff']); else c.absent(cv, ['alphaCutoff'], cp);
    });
  });
}
