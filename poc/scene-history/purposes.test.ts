import { expect, it } from 'vitest';
import { A, type Doc, type Ref, heads, index, sha, same, validateRoot } from './journal-format';
import { atomic, bootstrap, derive, freshId, gcAttempt, put, type Node, type Workspace, type Base } from './purposes';

const change = (doc: Doc, fn: (d: Record<string, any>) => void): Doc => A.change(A.clone(doc), { time: 0 }, fn);
const decoder = new TextDecoder();
function fixture() {
  const ids = Object.fromEntries(Object.entries({ scene: 'scn', otherScene: 'scn', frame: 'frm', asset: 'ast',
    owner: 'ast', unassigned: 'ast', binding: 'bnd', oldBinding: 'bnd', revision: 'rev', oldRevision: 'rev',
    rep: 'rep', sourceRep: 'rep', oldRep: 'rep', ownerBinding: 'bnd', ownerRevision: 'rev', ownerRep: 'rep',
    unassignedBinding: 'bnd', unassignedRevision: 'rev', unassignedRep: 'rep', assetFrame: 'frm', ownerFrame: 'frm',
    unassignedFrame: 'frm', compatibility: 'cmp', otherCompatibility: 'cmp', group: 'grp', family: 'fam',
    layout: 'lay', slot: 'slot', caption: 'cap', hiddenCaption: 'cap', deletedCaption: 'cap', attachment: 'att',
    media: 'med', unusedMedia: 'med', tag: 'tag', tagEdge: 'tgm', member: 'sam', otherMember: 'sam',
    captionMember: 'scm', sharedMember: 'scm', hiddenMember: 'scm', view: 'view', otherView: 'view',
    material: 'ovr', otherMaterial: 'ovr' }).map(([k, p]) => [k, freshId(p)])) as Record<string, string>;
  const payload = new Map<string, Uint8Array>();
  const blob = (label: string): Ref => {
    const bytes = new TextEncoder().encode(label); const digest = sha(bytes); payload.set(digest, bytes);
    return { algorithm: 'sha256', digest, byteLength: bytes.length, mediaType: 'application/octet-stream' };
  };
  const blobs = { model: blob('CURRENT MODEL / EMBEDDED_METADATA_RETAINED'), source: blob('EDITABLE DERIVATION SOURCE'),
    old: blob('WEAK_OLD_MODEL_SENTINEL'), owner: blob('HIDDEN OWNER MODEL'), unassigned: blob('UNASSIGNED MODEL'),
    image: blob('CURRENT MEDIA / EXIF_RETAINED'), unused: blob('UNREFERENCED_BLOB_SENTINEL'),
    baseline: blob('MIGRATION_BASELINE_SENTINEL'), opaque: blob('UNKNOWN_ONLY_BLOB_SENTINEL') };
  const b = bootstrap(); const nodes: Node[] = [];
  const add = (key: string, kind: string, fields: Record<string, any>) => nodes.push({ id: ids[key]!, kind, active: true, ...fields });
  add('scene', 'scene', { name: 'Inspection', orderKey: 'A', defaultViewId: ids.view });
  add('otherScene', 'scene', { name: 'Assembly', orderKey: 'B', defaultViewId: ids.otherView });
  const addModel = (key: string, frame: string, binding: string, revision: string, rep: string, ref: Ref) => {
    add(key, 'asset', { label: key, assetFrameId: ids[frame], activeBindingId: ids[binding] });
    add(binding, 'binding', { assetId: ids[key], assetRevisionId: ids[revision], transform: [0, 0, 0, 1] });
    add(revision, 'revision', { assetId: ids[key], representationIds: [ids[rep]],
      classes: [{ id: ids.compatibility, families: [ids.family] }] });
    add(rep, 'representation', { assetId: ids[key], blob: ref, variantFamilyId: ids.family,
      materialLayoutId: ids.layout, slotIds: [ids.slot], compositeGroupId: ids.group });
  };
  addModel('asset', 'assetFrame', 'binding', 'revision', 'rep', blobs.model);
  addModel('owner', 'ownerFrame', 'ownerBinding', 'ownerRevision', 'ownerRep', blobs.owner);
  addModel('unassigned', 'unassignedFrame', 'unassignedBinding', 'unassignedRevision', 'unassignedRep', blobs.unassigned);
  // Only the target model shares these equality classes with its own derivative.
  for (const n of nodes) if (n.assetId && n.assetId !== ids.asset) {
    if (n.kind === 'revision') n.classes = [{ id: freshId('cmp'), families: [n.assetId === ids.owner ? (ids.ownerFamily ??= freshId('fam')) : (ids.unassignedFamily ??= freshId('fam'))] }];
    if (n.kind === 'representation') { n.variantFamilyId = n.assetId === ids.owner ? ids.ownerFamily : ids.unassignedFamily;
      n.materialLayoutId = freshId('lay'); n.slotIds = [freshId('slot')]; n.compositeGroupId = freshId('grp'); }
  }
  add('oldBinding', 'binding', { assetId: ids.asset, assetRevisionId: ids.oldRevision, transform: [0, 0, 0, 1] });
  add('oldRevision', 'revision', { assetId: ids.asset, representationIds: [ids.oldRep], classes: [{ id: ids.otherCompatibility, families: [freshId('fam')] }] });
  add('oldRep', 'representation', { assetId: ids.asset, blob: blobs.old, variantFamilyId: freshId('fam'), materialLayoutId: freshId('lay'), slotIds: [freshId('slot')] });
  add('sourceRep', 'representation', { assetId: ids.asset, blob: blobs.source, variantFamilyId: ids.family,
    materialLayoutId: ids.layout, slotIds: [ids.slot], compositeGroupId: ids.group });
  nodes.find(n => n.id === ids.binding)!.parentBindingId = ids.oldBinding;
  nodes.find(n => n.id === ids.revision)!.parentRevisionId = ids.oldRevision;
  nodes.find(n => n.id === ids.rep)!.derivedFrom = ids.sourceRep;
  const assetAnchor = { kind: 'asset', assetId: ids.asset, assetFrameId: ids.assetFrame, positionAsset: [1, 2, 3],
    authoredAnchorCompatibilityId: ids.compatibility, authoredAssetRevisionId: ids.oldRevision,
    hitEvidence: { method: 'proxy', confidence: 'approximate', source: { representationId: ids.oldRep, surfaceRef: { index: 17 } } } };
  add('caption', 'caption', { title: 'Shared caption', body: 'Original body', anchor: assetAnchor });
  add('hiddenCaption', 'caption', { title: 'List-only caption', body: 'Owner not displayed', anchor: {
    kind: 'asset', assetId: ids.owner, assetFrameId: ids.ownerFrame, positionAsset: [4, 5, 6],
    authoredAnchorCompatibilityId: nodes.find(n => n.id === ids.ownerRevision)!.classes[0].id, hitEvidence: { method: 'manual' } } });
  add('deletedCaption', 'caption', { title: 'Deleted', body: 'DELETED_SECRET_SENTINEL', anchor: {
    kind: 'project', projectFrameId: ids.frame, positionProject: [0, 0, 0] } });
  add('member', 'sceneAsset', { sceneId: ids.scene, assetId: ids.asset, orderKey: 'A' });
  add('otherMember', 'sceneAsset', { sceneId: ids.otherScene, assetId: ids.owner, orderKey: 'A' });
  add('captionMember', 'sceneCaption', { sceneId: ids.scene, captionId: ids.caption, orderKey: 'A' });
  add('sharedMember', 'sceneCaption', { sceneId: ids.otherScene, captionId: ids.caption, orderKey: 'A' });
  add('hiddenMember', 'sceneCaption', { sceneId: ids.scene, captionId: ids.hiddenCaption, orderKey: 'B' });
  add('attachment', 'attachment', { captionId: ids.caption, mediaId: ids.media, orderKey: 'A' });
  add('media', 'media', { label: 'Photo', blob: blobs.image });
  add('unusedMedia', 'media', { label: 'Unused', blob: blobs.unused });
  add('tag', 'tag', { label: 'Inspection' }); add('tagEdge', 'tagMembership', { captionId: ids.caption, tagId: ids.tag });
  for (const [key, scene] of [['view', 'scene'], ['otherView', 'otherScene']]) add(key!, 'view', { sceneId: ids[scene!],
    name: key, projectFrameId: ids.frame, camera: { eye: [1, 2, 3], target: [0, 0, 0] }, background: { color: '#ebe9e4' } });
  for (const [key, scene] of [['material', undefined], ['otherMaterial', ids.otherScene]]) add(key!, 'material', {
    routing: { scope: scene ? { kind: 'scene', sceneId: scene } : { kind: 'project' },
      target: { assetId: ids.asset, variantFamilyId: ids.family, materialLayoutId: ids.layout, logicalMaterialSlotId: ids.slot } },
    appearance: { color: '#cccccc' }, compositing: { mode: 'opaque' } });
  const initial = change(b.doc, d => {
    for (const [key, value] of Object.entries({ title: 'Synthetic Project', frameId: ids.frame, defaultSceneId: ids.scene })) d.project[key] = atomic(value);
    nodes.forEach(n => put(d, n)); d.contributors.label = atomic('OLD_PROFILE_SENTINEL');
    d.migration.activeBaselineBlobs = atomic([blobs.baseline]); d.migration.registry = atomic('MIGRATION_REGISTRY_SENTINEL');
  });
  const doc = change(initial, d => { d.nodes[ids.deletedCaption!].active = atomic(false);
    d.nodes[ids.caption!].body = atomic('Current body'); d.contributors.label = atomic('CURRENT_PROFILE_SENTINEL'); });
  const inventory = { verified: Object.values(blobs), protected: [blobs.baseline] };
  const base: Base = { target: b.target, heads: heads(doc), inventory: structuredClone(inventory), packageId: freshId('pkg') };
  const workspace: Workspace = { doc, target: b.target, inventory, exchangeBases: [base] };
  return { workspace, base, ids, blobs, payload };
}
const nodeOf = (result: ReturnType<typeof derive>, kind: string) => Object.values(result.snapshot!.nodes).filter(n => n.kind === kind);
const digests = (result: ReturnType<typeof derive>) => result.blobs.map(b => b.digest).sort();
function forkField(w: Workspace, id: string, field: string, a: any, b: any): Workspace {
  // Explicit candidate writes, including choosing the currently materialized value.
  const left = change(w.doc, d => { delete d.nodes[id][field]; d.nodes[id][field] = atomic(a); });
  const right = change(w.doc, d => { delete d.nodes[id][field]; d.nodes[id][field] = atomic(b); });
  return { ...w, doc: A.merge(A.clone(left), A.clone(right)) };
}

it('derives all five purposes from one causal Project with exact history and independent clean genesis', () => {
  const { workspace: w, base, ids, blobs, payload } = fixture();
  const before = [...index(w.doc)].map(([hash, p]) => [hash, sha(p.bytes)]), bases = structuredClone(w.exchangeBases);
  const team = derive(w, 'teamWorkspace'), backup = derive(w, 'backup');
  const contribution = derive(w, 'contribution', { base }), review = derive(w, 'review', { sceneId: ids.scene });
  const clean = derive(w, 'clean');
  for (const r of [team, backup]) {
    expect(r.historyBearing).toBe(true); expect(r.target).toEqual(w.target);
    const reopened = A.load(r.metadata!); expect(heads(reopened)).toEqual(heads(w.doc));
    expect([...index(reopened)].map(([h, p]) => [h, sha(p.bytes)])).toEqual(before);
    expect(digests(r)).toEqual([blobs.model, blobs.source, blobs.owner, blobs.unassigned, blobs.image, blobs.baseline].map(b => b.digest).sort());
  }
  expect(backup.exchangeBases).toEqual(bases); expect(backup.disclosure.join(' ')).toContain('受領を証明');
  for (const r of [team, contribution, review, clean]) expect(r.exchangeBases).toBeUndefined();
  expect(contribution.standalone).toBe(false); expect(contribution.mode).toBe('merge'); expect(contribution.changes).toEqual([]); expect(contribution.blobs).toEqual([]);
  expect(review.metadata).toBeUndefined(); expect(review.target).toBeUndefined(); expect(review.mode).toBe('view');
  expect(nodeOf(review, 'scene')).toHaveLength(1); expect(nodeOf(clean, 'scene')).toHaveLength(2);
  expect(nodeOf(clean, 'asset')).toHaveLength(3); expect(nodeOf(clean, 'caption')).toHaveLength(2);
  expect(clean.target!.identity.projectId).not.toBe(w.target.identity.projectId);
  expect(clean.target!.identity.historyEpoch).not.toBe(w.target.identity.historyEpoch);
  const cleanDoc = A.load(clean.metadata!); validateRoot(cleanDoc, clean.target!);
  expect([...index(cleanDoc).keys()].some(h => index(w.doc).has(h))).toBe(false);
  expect([...index(w.doc)].map(([h, p]) => [h, sha(p.bytes)])).toEqual(before); expect(w.exchangeBases).toEqual(bases);
  // Original opaque media/model bytes are intentionally NOT sanitized.
  expect(review.disclosure.join(' ')).toContain('内部のメタデータは除去しません');
  const outputPayload = review.blobs.map(b => decoder.decode(payload.get(b.digest)!)).join(' ');
  expect(outputPayload).toContain('EXIF_RETAINED'); expect(outputPayload).toContain('EMBEDDED_METADATA_RETAINED');
});

it('review follows durable Scene membership, keeps a minimal hidden owner and drops derivation/weak payloads', () => {
  const { workspace: w, ids, blobs } = fixture();
  const options = { sceneId: ids.scene, ui: { search: 'none', pinColors: [], windows: [], isolate: [], camera: 'elsewhere' } };
  const result = derive(w, 'review', options);
  expect(result.preflight).toEqual({ sceneName: 'Inspection', models: 1, captions: 2, media: 1, entryView: 'included' });
  expect(digests(result)).toEqual([blobs.model.digest, blobs.image.digest].sort());
  expect(nodeOf(result, 'asset')).toHaveLength(1); expect(nodeOf(result, 'sceneAsset')).toHaveLength(1);
  expect(nodeOf(result, 'nonvisualOwner')).toHaveLength(1);
  const owner = nodeOf(result, 'nonvisualOwner')[0]!;
  expect(Object.keys(owner).sort()).toEqual(['active', 'assetFrameId', 'id', 'kind', 'transform']);
  const cap = nodeOf(result, 'caption').find(n => n.title === 'List-only caption')!;
  expect(cap.anchor.assetId).toBe(owner.id); expect(cap.anchor.kind).toBe('asset'); expect(cap.anchor.assetFrameId).toBe(owner.assetFrameId);
  expect(nodeOf(result, 'attachment')).toHaveLength(1); expect(nodeOf(result, 'tagMembership')).toHaveLength(1);
  expect(nodeOf(result, 'view')).toHaveLength(1); expect(nodeOf(result, 'material')).toHaveLength(1);
  expect(() => derive(w, 'review')).toThrow('select one durable Scene');
});

it('history-free outputs re-key typed references/equality classes and omit source privacy sentinels', () => {
  const { workspace: w, ids, blobs } = fixture();
  const oldActors = [...new Set(A.getAllChanges(w.doc).map(c => A.decodeChange(c).actor))];
  for (const purpose of ['review', 'clean'] as const) {
    const result = derive(w, purpose, { sceneId: ids.scene });
    const text = JSON.stringify(result.snapshot);
    const changes = result.metadata ? A.getAllChanges(A.load(result.metadata)).map(c => JSON.stringify(A.decodeChange(c))).join('\n') : '';
    const sentinels = [...Object.values(ids), ...Object.values(w.target.identity), ...oldActors,
      'DELETED_SECRET_SENTINEL', 'OLD_PROFILE_SENTINEL', 'CURRENT_PROFILE_SENTINEL', 'MIGRATION_REGISTRY_SENTINEL', blobs.baseline.digest, blobs.old.digest, blobs.unused.digest];
    for (const sentinel of sentinels) { expect(text).not.toContain(sentinel); expect(changes).not.toContain(sentinel); }
    for (const n of Object.values(result.snapshot!.nodes)) { expect(n.parentBindingId).toBeUndefined(); expect(n.parentRevisionId).toBeUndefined(); }
    const cap = nodeOf(result, 'caption').find(n => n.title === 'Shared caption')!;
    expect(cap.anchor.authoredAssetRevisionId).toBeUndefined(); expect(cap.anchor.hitEvidence).toEqual({ method: 'proxy', confidence: 'approximate' });
    const asset = result.snapshot!.nodes[cap.anchor.assetId]!;
    expect(asset.assetFrameId).toBe(cap.anchor.assetFrameId);
    const binding = result.snapshot!.nodes[asset.activeBindingId]!;
    const revision = result.snapshot!.nodes[binding.assetRevisionId]!;
    expect(revision.classes[0].id).toBe(cap.anchor.authoredAnchorCompatibilityId);
    if (purpose === 'clean') {
      const rep = result.snapshot!.nodes[revision.representationIds[0]]!;
      const source = result.snapshot!.nodes[rep.derivedFrom]!;
      expect(rep.compositeGroupId).toBe(source.compositeGroupId);
      expect(nodeOf(result, 'representation').find(n => n.assetId !== asset.id)!.compositeGroupId).not.toBe(rep.compositeGroupId);
      expect(result.blobs.map(b => b.digest)).toContain(blobs.source.digest);
    }
  }
});

it('contribution uses exact declared base and original sibling changes, includes only new model bytes', () => {
  const { workspace: w, base, ids, blobs } = fixture();
  const a = change(w.doc, d => { d.nodes[ids.caption!].title = atomic('Local edit'); });
  const b = change(w.doc, d => { d.nodes[ids.caption!].body = atomic('Remote sibling'); });
  const joined = { ...w, doc: A.merge(A.clone(a), A.clone(b)) };
  const captions = derive(joined, 'contribution', { base }); expect(captions.blobs).toEqual([]);
  const baseHashes = new Set(index(w.doc).keys());
  expect(captions.changes!.map(c => A.decodeChange(c).hash).sort()).toEqual([...index(joined.doc).keys()].filter(h => !baseHashes.has(h)).sort());
  const restored = A.applyChanges(A.clone(w.doc), captions.changes!)[0]; expect(heads(restored)).toEqual(heads(joined.doc));
  for (const c of captions.changes!) expect(sha(c)).toBe(sha(index(joined.doc).get(A.decodeChange(c).hash)!.bytes));
  const newRep = freshId('rep'), newRev = freshId('rev'), newBinding = freshId('bnd');
  const updated = change(joined.doc, d => {
    const read = (id: string) => Object.fromEntries(Object.entries(d.nodes[id]).map(([k, v]) => [k, JSON.parse(String(v))])) as Node;
    put(d, { ...read(ids.rep!), id: newRep, blob: blobs.opaque } as Node);
    put(d, { ...read(ids.revision!), id: newRev, representationIds: [newRep] } as Node);
    put(d, { ...read(ids.binding!), id: newBinding, assetRevisionId: newRev } as Node);
    d.nodes[ids.asset!].activeBindingId = atomic(newBinding);
  });
  const revision = derive({ ...joined, doc: updated }, 'contribution', { base });
  expect(revision.blobs).toEqual([blobs.opaque]); expect(w.exchangeBases).toEqual([base]);
  expect(() => derive(w, 'contribution')).toThrow('retained exchange base');
  const wrong = { ...base, target: bootstrap().target };
  expect(() => derive({ ...w, exchangeBases: [wrong] }, 'contribution', { base: wrong })).toThrow('wrong base lineage');
  const missing = { ...base, heads: ['f'.repeat(64)] };
  expect(() => derive({ ...w, exchangeBases: [missing] }, 'contribution', { base: missing })).toThrow('missing base dependency');
});

it.each(['title', 'anchor', 'active'])('rejects included Caption %s conflicts but allows unrelated Scene conflicts in review', field => {
  const { workspace: w, ids } = fixture();
  const original = JSON.parse(String(w.doc.nodes[ids.caption!][field]));
  const a = field === 'anchor' ? { ...original, positionAsset: [10, 0, 0] } : field === 'active' ? false : 'First';
  const b = field === 'anchor' ? { ...original, positionAsset: [20, 0, 0] } : field === 'active' ? true : 'Second';
  const conflict = forkField(w, ids.caption!, field, a, b);
  expect(() => derive(conflict, 'review', { sceneId: ids.scene })).toThrow('unresolved resource');
  expect(() => derive(conflict, 'clean')).toThrow('unresolved resource');
  expect(derive(conflict, 'teamWorkspace').historyBearing).toBe(true);
  const unrelated = forkField(w, ids.otherScene!, 'name', 'One', 'Two');
  expect(derive(unrelated, 'review', { sceneId: ids.scene }).preflight!.sceneName).toBe('Inspection');
  expect(() => derive(unrelated, 'clean')).toThrow('unresolved resource');
});

it('requires exact optional-view confirmation; never treats that as permission to omit other conflicts', () => {
  const { workspace: w, ids } = fixture();
  const doc = change(w.doc, d => {
    const n = Object.fromEntries(Object.entries(d.nodes[ids.view!]).map(([k, v]) => [k, JSON.parse(String(v))]));
    put(d, { ...n, id: (ids.secondView = freshId('view')) } as Node);
  });
  const conflict = forkField({ ...w, doc }, ids.scene!, 'defaultViewId', ids.view, ids.secondView);
  expect(() => derive(conflict, 'review', { sceneId: ids.scene })).toThrow('confirm 開始視点なし');
  const result = derive(conflict, 'review', { sceneId: ids.scene, entryViewConfirmation: '開始視点なし' });
  expect(result.preflight!.entryView).toBe('none'); expect(nodeOf(result, 'view')).toHaveLength(2);
  expect(nodeOf(result, 'scene')[0]!.defaultViewId).toBeUndefined();
  const badView = forkField(w, ids.view!, 'camera', { eye: [0, 0, 0], target: [0, 1, 0] }, { eye: [2, 2, 2], target: [0, 1, 0] });
  expect(() => derive(badView, 'review', { sceneId: ids.scene })).toThrow('confirm 開始視点なし');
  expect(nodeOf(derive(badView, 'review', { sceneId: ids.scene, entryViewConfirmation: '開始視点なし' }), 'view')).toHaveLength(0);
  const badMaterial = forkField(w, ids.material!, 'appearance', { color: '#111111' }, { color: '#222222' });
  expect(() => derive(badMaterial, 'review', { sceneId: ids.scene, entryViewConfirmation: '開始視点なし' })).toThrow('unresolved resource');
});

it('retains every binding-conflict payload and rejects missing closure without selecting a winner', () => {
  const { workspace: w, ids, blobs } = fixture();
  const conflict = forkField(w, ids.asset!, 'activeBindingId', ids.binding, ids.oldBinding);
  const output = derive(conflict, 'teamWorkspace'); expect(digests(output)).toContain(blobs.old.digest);
  expect(() => derive(conflict, 'review', { sceneId: ids.scene })).toThrow('unresolved resource');
  const missing = { ...w, inventory: { ...w.inventory, verified: w.inventory.verified.filter(b => b.digest !== blobs.model.digest) } };
  for (const purpose of ['teamWorkspace', 'review', 'clean', 'backup'] as const) expect(() => derive(missing, purpose, { sceneId: ids.scene })).toThrow('missing verified blob');
  const duplicate = change(w.doc, d => { put(d, { id: freshId('sam'), kind: 'sceneAsset', active: true, sceneId: ids.scene, assetId: ids.asset, orderKey: 'Z' }); });
  expect(() => derive({ ...w, doc: duplicate }, 'review', { sceneId: ids.scene })).toThrow('duplicate semantic key');
});

it('preserves opaque bytes across an old-writer edit, GC refusal and same-lineage output; history-free refuses', () => {
  const { workspace: w, base, ids, blobs } = fixture();
  const future = change(w.doc, d => {
    const a = JSON.parse(String(d.nodes[ids.caption!].anchor)); a.future = { onlyBlob: blobs.opaque, nested: 'OPAQUE_SENTINEL' };
    d.nodes[ids.caption!].anchor = atomic(a); d.schema.minor = 1;
  });
  const inventory = { verified: w.inventory.verified, protected: [...w.inventory.protected, blobs.opaque] };
  const knownEdit = change(future, d => { d.nodes[ids.caption!].body = atomic('Old-writer edit'); });
  const workspace = { ...w, doc: knownEdit, inventory };
  expect(gcAttempt(workspace)).toBe('refused');
  for (const purpose of ['teamWorkspace', 'contribution', 'backup'] as const) {
    const result = derive(workspace, purpose, { base }); expect(digests(result)).toContain(blobs.opaque.digest);
    const reopened = result.metadata ? A.load<Record<string, any>>(result.metadata) : A.applyChanges(A.clone(w.doc), result.changes!)[0];
    expect(JSON.parse(String(reopened.nodes[ids.caption!].anchor)).future.onlyBlob).toEqual(blobs.opaque);
  }
  const futureBase: Base = { ...base, heads: heads(future), inventory };
  expect(derive({ ...workspace, exchangeBases: [futureBase] }, 'contribution', { base: futureBase }).blobs).toEqual([]);
  for (const purpose of ['review', 'clean'] as const) expect(() => derive(workspace, purpose, { sceneId: ids.scene })).toThrow('unknown fields block');
  expect(same(workspace.inventory, inventory)).toBe(true);
});

it.each(['schema', 'identity', 'migration', 'contributors'])('refuses unknown fields nested in the known %s root', root => {
  const { workspace: w, ids, blobs } = fixture();
  const doc = change(w.doc, d => { d[root].future = root === 'schema' || root === 'identity' ?
    { onlyBlob: atomic(blobs.opaque) } : atomic({ onlyBlob: blobs.opaque }); });
  // Identity mutation is invalid already, rather than an editable unknown field.
  for (const purpose of ['review', 'clean'] as const) expect(() => derive({ ...w, doc }, purpose, { sceneId: ids.scene })).toThrow();
  if (root !== 'identity') {
    const inventory = { ...w.inventory, protected: [...w.inventory.protected, blobs.opaque] };
    expect(digests(derive({ ...w, doc, inventory }, 'teamWorkspace'))).toContain(blobs.opaque.digest);
  }
});

it('refuses root-map and schema-version conflicts even when the materialized candidate looks known', () => {
  const { workspace: w, ids } = fixture();
  for (const root of ['schema', 'migration', 'contributors']) {
    const unknown = A.change(A.clone(w.doc, { actor: 'a'.repeat(32) }), d => {
      d[root] = root === 'schema' ? { major: 2, minor: 0, future: true } : { future: atomic('UNKNOWN_HIDDEN_ROOT') };
    });
    const known = A.change(A.clone(w.doc, { actor: 'f'.repeat(32) }), d => {
      d[root] = root === 'schema' ? { major: 2, minor: 0 } : {};
    });
    const doc = A.merge(A.clone(unknown), A.clone(known));
    expect(doc[root].future).toBeUndefined();
    expect(Object.keys(A.getConflicts(doc, root)!)).toHaveLength(2);
    for (const purpose of ['review', 'clean'] as const) expect(() => derive({ ...w, doc }, purpose, { sceneId: ids.scene })).toThrow('conflicting root map');
  }
  const left = change(w.doc, d => { d.schema.minor = 1; });
  const right = change(w.doc, d => { d.schema.minor = 2; });
  const doc = A.merge(A.clone(left), A.clone(right));
  expect(() => derive({ ...w, doc }, 'review', { sceneId: ids.scene })).toThrow('conflicting schema');
});

it('omits resolved tombstones with old field conflicts, but detects semantic material duplicates independent of key order', () => {
  const { workspace: w, ids } = fixture();
  const oldConflict = forkField(w, ids.deletedCaption!, 'body', 'DELETED_A', 'DELETED_B');
  expect(nodeOf(derive(oldConflict, 'clean'), 'caption')).toHaveLength(2);
  const duplicate = change(w.doc, d => {
    const m = Object.fromEntries(Object.entries(d.nodes[ids.material!]).map(([k, v]) => [k, JSON.parse(String(v))])) as Node;
    put(d, { ...m, id: freshId('ovr'), routing: { target: m.routing.target, scope: m.routing.scope } } as Node);
  });
  expect(() => derive({ ...w, doc: duplicate }, 'review', { sceneId: ids.scene })).toThrow('duplicate semantic key');
});

it('clean preserves compatible/needsReview distinctions and never guesses nonmanual source correspondence', () => {
  const { workspace: w, ids } = fixture();
  for (const compatible of [true, false]) {
    const doc = change(w.doc, d => {
      const a = JSON.parse(String(d.nodes[ids.caption!].anchor)); a.hitEvidence = { method: 'manual' };
      if (!compatible) a.authoredAnchorCompatibilityId = ids.otherCompatibility;
      d.nodes[ids.caption!].anchor = atomic(a);
    });
    const result = derive({ ...w, doc }, 'clean');
    const cap = nodeOf(result, 'caption').find(n => n.title === 'Shared caption')!;
    const asset = result.snapshot!.nodes[cap.anchor.assetId]!;
    const revision = result.snapshot!.nodes[result.snapshot!.nodes[asset.activeBindingId]!.assetRevisionId]!;
    expect(revision.classes.some((c: any) => c.id === cap.anchor.authoredAnchorCompatibilityId)).toBe(compatible);
    expect(cap.anchor.authoredAssetRevisionId).toBe(compatible ? revision.id : undefined);
  }
  const doc = change(w.doc, d => {
    const a = JSON.parse(String(d.nodes[ids.caption!].anchor));
    a.authoredAssetRevisionId = ids.revision; a.hitEvidence = { method: 'mesh', confidence: 'surface', source: { representationId: ids.rep, surfaceRef: { index: 3 } } };
    d.nodes[ids.caption!].anchor = atomic(a);
  });
  const withoutEvidence = derive({ ...w, doc }, 'clean');
  expect(nodeOf(withoutEvidence, 'caption').find(n => n.title === 'Shared caption')!.anchor.hitEvidence.source).toBeUndefined();
  // Synthetic affirmative validation port only; not a mesh/GS surface validator.
  const withEvidence = derive({ ...w, doc }, 'clean', { validEvidence: (a, records) =>
    a.assetId === records.get(a.authoredAssetRevisionId)?.assetId &&
    records.get(a.authoredAssetRevisionId)!.representationIds.includes(a.hitEvidence.source.representationId) });
  const cap = nodeOf(withEvidence, 'caption').find(n => n.title === 'Shared caption')!;
  expect(withEvidence.snapshot!.nodes[cap.anchor.authoredAssetRevisionId]!.representationIds).toContain(cap.anchor.hitEvidence.source.representationId);
  expect(cap.anchor.hitEvidence.source.surfaceRef).toEqual({ index: 3 });
});
