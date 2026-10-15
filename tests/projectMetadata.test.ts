import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge'; // Node-only Wasm initialization, never a browser import.
import { ProjectMetadataSource, type MetadataLimits } from '../src/projectMetadata/source';
import { inspectProjectCandidates } from '../src/domain/projectCandidates';
import { inspectAtomicHistory } from '../src/domain/atomicHistory';
import { fixture, id, limits as valueLimits } from './helpers/projectRecordsFixture';
import { canonical } from '../src/domain/projectGraphSupport';
import { readProjectScene } from '../src/scene/projectProvider';
import { developmentContentVerifier } from '../poc/scene-history/content-verifier';
import { summarizeFullHistory } from '../src/projectPackage/historySummary';
import { PACKAGE_LIMITS } from '../src/projectPackage/contract';
import { planWorkspaceClosure } from '../src/projectPackage/closure';
import { immutableDigest } from '../src/domain/projectGraphSupport';
import { createFixtureModel } from '../src/harness/projectScene/modelClosure';

const limits: MetadataLimits = { ...valueLimits, maxWork: 1_000_000, maxChanges: 100,
  maxChangeBytes: 1_000_000, maxTotalBytes: 4_000_000, maxOperations: 10_000 };
function create(records = fixture()) {
  const bootstrap = ProjectMetadataSource.bootstrap(records.schema, records.identity, limits);
  return { bootstrap, source: bootstrap.initialize(records), records };
}
function raw(source: ProjectMetadataSource) { return A.applyChanges(A.init<Record<string, any>>(), source.originalChanges())[0]; }
function changed(source: ProjectMetadataSource, mutate: (draft: Record<string, any>) => void) {
  const doc = A.change(raw(source), mutate);
  return A.getAllChanges(doc);
}
function field(source: ProjectMetadataSource, name: string) {
  const read = inspectAtomicHistory(source.read().history, limits);
  if (read.kind !== 'atomic-history-inspection') throw Error('test read failed');
  return read.fields.find(f => canonical(f.path) === canonical(['captionsById', id('cap'), name]))!;
}

const originalBudget = { maxNodes: PACKAGE_LIMITS.inspectionNodes, maxWork: PACKAGE_LIMITS.inspectionWork };
describe('explicit metadata semantic profiles', () => {
  it('edits only a known active map2 Asset pin scale and refuses ambiguous, stale or unsupported writes', async () => {
    const records = fixture(); records.schema.minor = 1; delete records.assetsById[id('ast')].pinScale;
    const source = ProjectMetadataSource.bootstrap(records.schema, records.identity, limits, { semanticProfile: 'map2' }).initialize(records);
    const rep = records.representationsById[id('rep')], before = source.originalChanges();
    const provider = (s: ProjectMetadataSource) => readProjectScene(s.read(), limits, developmentContentVerifier([
      { variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest },
    ]));
    const p = await provider(source), edit = { kind: 'setAssetPinScale' as const, assetId: id('ast'), pinScale: 0.001 }, tx = 'a'.repeat(32);
    for (const pinScale of [0.001, 1, 1000]) {
      const result = source.prepareEdit(source.token, { ...edit, pinScale }, p, tx);
      expect(result.read().history.changes.at(-1)!.writes.map(w => w.path)).toEqual([['assetsById', id('ast'), 'pinScale']]);
      expect(source.originalChanges()).toEqual(before);
    }
    for (const pinScale of [0, -1, 0.0009, 1001, NaN, Infinity]) expect(() => source.prepareEdit(source.token, { ...edit, pinScale }, p, tx)).toThrow();
    expect(() => source.prepareEdit('stale', edit, p, tx)).toThrow(/stale-token/);
    const old = create(records).source, op = await provider(old); expect(() => old.prepareEdit(old.token, edit, op, tx)).toThrow(/pin-scale-profile/);
    const left = ProjectMetadataSource.reopen(changed(source, d => { d.assetsById[id('ast')].pinScale = new A.ImmutableString('2'); }), source.proof, limits);
    const conflict = left.appendOriginal(changed(source, d => { d.assetsById[id('ast')].pinScale = new A.ImmutableString('3'); }));
    const cp = await provider(conflict); expect(() => conflict.prepareEdit(conflict.token, edit, cp, tx)).toThrow();
    const deleted = ProjectMetadataSource.reopen(changed(source, d => { d.assetsById[id('ast')].lifecycle = new A.ImmutableString(canonical({ state: 'deleted', eventId: id('evt', 2), reason: 'userDelete' })); }), source.proof, limits);
    const dp = await provider(deleted); expect(dp.kind).toBe('scene-provider'); if (dp.kind !== 'scene-provider') throw Error('provider');
    expect(dp.resources.assets[id('ast')]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'deleted', reason: 'userDelete' } });
    expect(() => deleted.prepareEdit(deleted.token, edit, dp, tx)).toThrow();
    const deleteEdit = deleted.appendOriginal(left.originalChanges()), dep = await provider(deleteEdit);
    expect(dep.kind).toBe('scene-provider'); if (dep.kind !== 'scene-provider') throw Error('provider');
    expect(dep.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[0] === 'assetsById' && i.path[1] === id('ast'))).toBe(true);
    expect(() => deleteEdit.prepareEdit(deleteEdit.token, edit, dep, tx)).toThrow();
  });
  it('binds map2 to its bootstrap and rejects envelope relabelling or later header changes', () => {
    const records = fixture(); records.schema.minor = 1;
    const old = create(records).source;
    const bootstrap = ProjectMetadataSource.bootstrap(records.schema, records.identity, limits, { semanticProfile: 'map2' });
    const source = bootstrap.initialize(records);
    expect(source.semanticProfile).toBe('map2');
    expect(source.read().history.changes.flatMap(c => c.writes).some(w => w.path[0] === 'semanticProfile')).toBe(false);
    expect(() => ProjectMetadataSource.reopen(old.originalChanges(), { ...old.proof,
      envelope: { ...old.proof.envelope, adapterFormatVersion: 'lociview-automerge-atomic-map-2' } }, limits)).toThrow();
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), { ...source.proof,
      envelope: { ...source.proof.envelope, adapterFormatVersion: 'lociview-automerge-atomic-map-1' } }, limits)).toThrow();
    for (const mutate of [
      (d: Record<string, any>) => { d.semanticProfile = new A.ImmutableString('"map1"'); },
      (d: Record<string, any>) => { delete d.semanticProfile; },
      (d: Record<string, any>) => { d.semanticProfile = new A.ImmutableString('"map1"'); d.semanticProfile = new A.ImmutableString('"map2"'); },
    ]) expect(() => ProjectMetadataSource.reopen(changed(source, mutate), source.proof, limits)).toThrow(/root-mutation/);
    const inserted = ProjectMetadataSource.reopen(changed(old, d => { d.semanticProfile = new A.ImmutableString('"map2"'); }), old.proof, limits);
    expect(inserted.semanticProfile).toBe('map1');
    expect(() => ProjectMetadataSource.reopen(inserted.originalChanges(), { ...inserted.proof,
      envelope: { ...inserted.proof.envelope, adapterFormatVersion: 'lociview-automerge-atomic-map-2' } }, limits)).toThrow();
    const root = A.decodeChange(bootstrap.originalChanges()[0]!);
    for (const transform of ['absent', 'wrong', 'duplicate'] as const) {
      const copy = structuredClone(root), marker = copy.ops.find(op => op.obj === '_root' && op.key === 'semanticProfile')!;
      if (transform === 'absent') copy.ops = copy.ops.filter(op => op !== marker);
      else if (transform === 'wrong') (marker as { value: unknown }).value = '"map1"';
      else copy.ops.push({ ...marker, pred: [] });
      const bytes = A.encodeChange(copy), hash = A.decodeChange(bytes).hash;
      expect(() => ProjectMetadataSource.reopen([bytes], { ...bootstrap.proof, envelope: { ...bootstrap.proof.envelope,
        lineageProof: { ...bootstrap.proof.envelope.lineageProof, rootChangeHash: hash } } }, limits)).toThrow();
    }
    expect(() => ProjectMetadataSource.bootstrap({ major: 2, minor: 0 }, records.identity, limits, { semanticProfile: 'map2' })).toThrow();
    expect(ProjectMetadataSource.fromFullSource(source.encodeFullSource(), source.proof, limits).originalChanges()).toEqual(source.originalChanges());
  });

  it('keeps old overwritten extensions opaque and validates map2 historical values', async () => {
    const oldRecords = fixture(); oldRecords.schema.minor = 1;
    oldRecords.assetsById[id('ast')].pinScale = 'opaque old value';
    oldRecords.materialOverridesById[id('ovr')].appearance = { chroma: { keyColorSrgb: [0, 1, 0], tolerance: 0.2, softness: 0, enabled: 'opaque old value' } };
    const old = create(oldRecords).source, originals = changed(old, d => { delete d.assetsById[id('ast')].pinScale;
      d.materialOverridesById[id('ovr')].appearance = new A.ImmutableString('{}'); });
    const reopened = ProjectMetadataSource.reopen(originals, old.proof, limits), oldSummary = summarizeFullHistory(await reopened.inspectOriginal(originalBudget));
    expect(oldSummary.hasOpaque).toBe(true);
    expect(oldSummary.fieldClasses).not.toContainEqual({ class: 'assetsById.pinScale', count: 1 });
    expect(reopened.originalChanges()).toEqual(originals);
    const records = fixture(); records.schema.minor = 1; records.assetsById[id('ast')].pinScale = 2;
    records.captionsById[id('cap')].anchor = { kind: 'unplaced', ownerAssetId: id('ast') };
    records.materialOverridesById[id('ovr')].appearance = { chroma: { keyColorSrgb: [0, 1, 0], tolerance: 0.2, softness: 0.5, enabled: false } };
    const source = ProjectMetadataSource.bootstrap(records.schema, records.identity, limits, { semanticProfile: 'map2' }).initialize(records);
    const inspection = await source.inspectOriginal(originalBudget), summary = summarizeFullHistory(inspection);
    expect(summary.hasOpaque).toBe(false); expect(summary.fieldClasses).toContainEqual({ class: 'assetsById.pinScale', count: 1 });
    expect(inspection.scalars.filter(w => w.path[0] === 'semanticProfile')).toHaveLength(1);
    const invalidThenRestored = changed(source, d => { d.assetsById[id('ast')].pinScale = new A.ImmutableString('0');
      d.assetsById[id('ast')].pinScale = new A.ImmutableString('2'); });
    const restored = ProjectMetadataSource.reopen(invalidThenRestored, source.proof, limits);
    const checked = await restored.inspectOriginal(originalBudget);
    expect(() => summarizeFullHistory(checked)).toThrow(/summary-historical-value-unsupported/);
    expect(restored.originalChanges()).toEqual(invalidThenRestored);
  });
});
describe('complete original scalar inspection for package summaries', () => {
  it('includes both live model-binding candidates without choosing a winner', async () => {
    const records = fixture(), updated = createFixtureModel({ asset: id('ast'), assetFrame: id('frm', 2), representationFrame: id('frm', 4),
      representation: id('rep', 2), revision: id('rev', 2), binding: id('bnd', 2), family: id('fam', 2), compatibility: id('cmp', 2),
      layout: id('lay', 2), slot: id('slot', 2) }, 'updated', { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 });
    records.representationsById[updated.representation.id] = updated.representation;
    records.assetRevisionsById[updated.revision.id] = updated.revision; records.assetBindingsById[updated.binding.id] = updated.binding;
    const other = { ...records.assetBindingsById[id('bnd')], id: id('bnd', 3) };
    other.payloadDigest = await immutableDigest('asset-binding-revision', other); records.assetBindingsById[other.id] = other;
    const { source } = create(records);
    const setBinding = (binding: string) => changed(source, d => {
      d.assetsById[id('ast')].status = new A.ImmutableString(canonical({ kind: 'ready', activeBindingId: binding }));
    });
    const left = ProjectMetadataSource.reopen(setBinding(updated.binding.id), source.proof, limits), merged = left.appendOriginal(setBinding(other.id));
    const inspection = await merged.inspectOriginal(originalBudget), before = merged.originalChanges();
    const closure = planWorkspaceClosure(inspection.candidates);
    const image = Object.values(records.mediaResourcesById)[0] as any;
    expect(closure.entries.map(entry => entry.sha256).sort()).toEqual([
      records.representationsById[id('rep')].blob.digest, updated.representation.blob.digest, image.blob.digest,
    ].sort());
    const status = inspection.candidates.fields.find(f => f.path.join('/') === `assetsById/${id('ast')}/status`)!;
    expect(status.candidates).toHaveLength(2);
    expect(summarizeFullHistory(inspection).fieldClasses).toContainEqual({ class: 'assetsById.status', count: 1 });
    expect(merged.originalChanges()).toEqual(before);
  });

  it('counts addressed entities after edits, reverts and conflicts, including the original schema', async () => {
    const { source, records } = create(), before = source.originalChanges();
    const edited = await source.prepareCaptionText(source.token, id('cap'), 'body', '追記');
    const reverted = await edited.prepareCaptionText(edited.token, id('cap'), 'body', records.captionsById[id('cap')].body);
    const other = await source.prepareCaptionText(source.token, id('cap'), 'body', '別の追記');
    const merged = reverted.appendOriginal(other.originalChanges());
    const inspection = await merged.inspectOriginal(originalBudget), summary = summarizeFullHistory(inspection);
    expect(inspection.scalars.filter(op => op.path[0] === 'schema')).toHaveLength(1);
    expect(inspection.scalars.filter(op => op.path.join('/') === `captionsById/${id('cap')}/body`)).toHaveLength(4);
    expect(summary.entityClasses).toContainEqual({ class: 'captionsById', count: 1 });
    expect(summary.entityClasses).toContainEqual({ class: 'project', count: 1 });
    expect(summary.fieldClasses).toContainEqual({ class: 'captionsById.body', count: 1 });
    expect(summary.fieldClasses).toContainEqual({ class: 'project.schema', count: 1 });
    expect(summary.fieldClasses).toContainEqual({ class: 'project.identity', count: 1 });
    expect(summary.hasOpaque).toBe(false);
    expect(field(merged, 'body').candidates).toHaveLength(2);
    expect(source.originalChanges()).toEqual(before);
    expect(inspection.scalars.every(op => Object.isFrozen(op) && Object.isFrozen(op.path) && Object.isFrozen(op.value))).toBe(true);
  });

  it('retains overwritten nested unknown values within one change, without leaking keys into summaries', async () => {
    const { source, records } = create(), anchor = records.captionsById[id('cap')].anchor;
    const parts = changed(source, d => {
      d.captionsById[id('cap')].anchor = new A.ImmutableString(canonical({ ...anchor, futureDiagnostic: { hidden: ['retained'] } }));
      d.captionsById[id('cap')].anchor = new A.ImmutableString(canonical(anchor));
    });
    const reopened = ProjectMetadataSource.reopen(parts, source.proof, limits);
    const inspection = await reopened.inspectOriginal(originalBudget), summary = summarizeFullHistory(inspection);
    expect(inspection.candidates.hasUnknownFields).toBe(false);
    expect(inspection.scalars.filter(op => op.changeHash === reopened.heads[0] && op.path[2] === 'anchor')).toHaveLength(2);
    expect(summary.hasOpaque).toBe(true);
    expect(summary.fieldClasses).toContainEqual({ class: 'opaque.field', count: 1 });
    expect(summary.fieldClasses).toContainEqual({ class: 'captionsById.anchor', count: 1 });
    expect(JSON.stringify(summary)).not.toMatch(/futureDiagnostic|retained|cap_/);
    expect(reopened.originalChanges()).toEqual(parts);
  });

  it('counts unknown deletions and required-field delete/set without rejecting an otherwise valid source', async () => {
    const records = fixture(); records.futureRoot = { unknown: true };
    records.captionsById[id('cap')].futureField = 'unknown';
    const { source } = create(records);
    const parts = changed(source, d => {
      delete d.futureRoot; delete d.captionsById[id('cap')].futureField;
      delete d.captionsById[id('cap')].title;
      d.captionsById[id('cap')].title = new A.ImmutableString('"戻したタイトル"');
    });
    const reopened = ProjectMetadataSource.reopen(parts, source.proof, limits);
    const inspection = await reopened.inspectOriginal(originalBudget), summary = summarizeFullHistory(inspection);
    expect(inspection.scalars.filter(op => op.value.kind === 'absent')).toHaveLength(3);
    expect(summary.entityClasses).toContainEqual({ class: 'opaque', count: 2 });
    expect(summary.fieldClasses).toContainEqual({ class: 'captionsById.title', count: 1 });
    expect(reopened.originalChanges()).toEqual(parts);
  });

  it('bounds cumulative original-node/work inspection and refuses unclassifiable history only in the generator', async () => {
    const { source } = create(), baseline = await source.inspectOriginal(originalBudget);
    await expect(source.inspectOriginal({ maxNodes: baseline.nodesUsed, maxWork: baseline.workUsed })).resolves.toMatchObject({ nodesUsed: baseline.nodesUsed });
    await expect(source.inspectOriginal({ ...originalBudget, maxNodes: baseline.nodesUsed - 1 })).rejects.toThrow(/budget/);
    await expect(source.inspectOriginal({ ...originalBudget, maxWork: baseline.workUsed - 1 })).rejects.toThrow(/budget/);
    await expect(source.inspectOriginal({ ...originalBudget, maxNodes: NaN })).rejects.toThrow(/original-budget/);
    const parts = changed(source, d => {
      d.captionsById[id('cap')].title = new A.ImmutableString('42');
      d.captionsById[id('cap')].title = new A.ImmutableString('"有効なタイトル"');
    });
    const reopened = ProjectMetadataSource.reopen(parts, source.proof, limits);
    const inspection = await reopened.inspectOriginal(originalBudget);
    expect(() => summarizeFullHistory(inspection)).toThrow(/summary-historical-value-unsupported/);
    expect(field(reopened, 'title').candidates[0]!.value).toEqual({ kind: 'value', value: '有効なタイトル' });
    expect(reopened.originalChanges()).toEqual(parts);
  });
});

describe('production metadata source foundation (no persistence/activation claim)', () => {
  it('reuses only a deeply immutable instance snapshot, never an edited or reopened source', async () => {
    const { source } = create(), snapshot = source.read(), original = source.originalChanges();
    expect(source.read()).toBe(snapshot); expect(source.token).toBe(snapshot.history.token);
    const frozen = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return;
      expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(frozen);
    };
    frozen(snapshot);
    expect(() => (snapshot.history.heads as string[]).push('foreign')).toThrow();
    expect(() => { (snapshot.schema as Record<string, unknown>).major = 999; }).toThrow();
    const edited = await source.prepareCaptionText(source.token, id('cap'), 'title', '次の記録');
    expect(edited.read()).not.toBe(snapshot); expect(edited.token).not.toBe(source.token);
    expect(source.read()).toBe(snapshot); expect(source.originalChanges()).toEqual(original);
    const reopened = ProjectMetadataSource.reopen(edited.originalChanges(), edited.proof, limits);
    expect(reopened.read()).not.toBe(edited.read()); expect(reopened.read()).toEqual(edited.read());
    expect(source.appendOriginal(original)).toBe(source);
    expect(() => ProjectMetadataSource.reopen(original, source.proof, { ...limits, maxOperations: 1 })).toThrow();
  });

  it('creates an empty root and external proof, then all-map contents in a later original change', async () => {
    const { bootstrap, source } = create();
    const initial = raw(bootstrap);
    expect(Object.keys(initial.project)).toEqual([]);
    expect(Object.keys(initial.captionsById)).toEqual([]);
    expect(bootstrap.proof.envelope.lineageProof.rootChangeHash).toBe(A.getHeads(initial)[0]);
    expect(bootstrap.read().history.changes[0]!.writes.map(w => w.path)).toEqual([['identity']]);
    const before = await inspectProjectCandidates(bootstrap.read(), limits);
    expect(before.kind).toBe('project-candidate-inspection');
    if (before.kind === 'project-candidate-inspection') expect(before.issues.length).toBeGreaterThan(0);
    expect(source.originalChanges()).toHaveLength(2);
    expect(source.originalChanges()[0]).toEqual(bootstrap.originalChanges()[0]);
    const result = await inspectProjectCandidates(source.read(), limits);
    expect(result.kind).toBe('project-candidate-inspection');
    if (result.kind === 'project-candidate-inspection') expect(result.issues.filter(i => i.kind === 'invalid')).toEqual([]);
    const r = fixture(), rep = r.representationsById[id('rep')];
    const provider = await readProjectScene(source.read(), limits, developmentContentVerifier([
      { variantFamilyId: rep.variantFamilyId, representationId: rep.id, payloadDigest: rep.payloadDigest },
    ]));
    expect(provider.kind).toBe('scene-provider');
    if (provider.kind === 'scene-provider') {
      expect(provider.token).toBe(source.token);
      expect(provider.state.scenes[id('scn')]).toBeDefined();
      expect(provider.resources.captions[id('cap')]).toBeDefined();
    }
    expect(() => source.initialize(fixture())).toThrow(/already-initialized/);
  });

  it('prepares Caption text without mutating the source, reopens exact bytes and does not duplicate replay', async () => {
    const { source } = create();
    const edited = await source.prepareCaptionText(source.token, id('cap'), 'body', '共有する本文');
    expect(source.originalChanges()).toHaveLength(2); expect(edited.originalChanges()).toHaveLength(3);
    const reopened = ProjectMetadataSource.reopen(edited.originalChanges(), edited.proof, limits);
    expect(reopened.token).toBe(edited.token);
    expect(reopened.originalChanges()).toEqual(edited.originalChanges());
    expect(reopened.appendOriginal(edited.originalChanges())).toBe(reopened);
    const copies = reopened.originalChanges(); copies[0]!.fill(0);
    expect(reopened.originalChanges()[0]).toEqual(source.originalChanges()[0]);
    await expect(edited.prepareCaptionText(source.token, id('cap'), 'title', 'stale')).rejects.toThrow(/stale-token/);
  });

  it('retains distinct-field branches and same-value/title conflicts, never an automatic winner', async () => {
    const { source } = create();
    const title = await source.prepareCaptionText(source.token, id('cap'), 'title', '確認');
    const body = await source.prepareCaptionText(source.token, id('cap'), 'body', '追記');
    const merged = title.appendOriginal(body.originalChanges());
    expect(field(merged, 'title').candidates).toHaveLength(1); expect(field(merged, 'body').candidates).toHaveLength(1);
    expect(field(merged, 'body').candidates[0]!.value).toEqual({ kind: 'value', value: '追記' });
    const sameTitle = await source.prepareCaptionText(source.token, id('cap'), 'title', '確認');
    const conflicted = title.appendOriginal(sameTitle.originalChanges());
    expect(field(conflicted, 'title').candidates).toHaveLength(2);
    await expect(conflicted.prepareCaptionText(conflicted.token, id('cap'), 'title', '自動解決しない')).rejects.toThrow(/caption-unresolved/);
    const reversed = sameTitle.appendOriginal(title.originalChanges());
    expect(reversed.token).toBe(conflicted.token);
    expect(field(reversed, 'title').candidates).toEqual(field(conflicted, 'title').candidates);
  });

  it('retains explicit absence beside a concurrent optional value', () => {
    const { source } = create();
    const absent = ProjectMetadataSource.reopen(changed(source, d => { delete d.captionsById[id('cap')].colorSrgb; }), source.proof, limits);
    const present = changed(source, d => { d.captionsById[id('cap')].colorSrgb = new A.ImmutableString('[0,0,1]'); });
    expect(field(absent.appendOriginal(present), 'colorSrgb').candidates.map(c => c.value.kind).sort()).toEqual(['absent', 'value']);
  });

  it('preserves unknown root siblings and complete atomic subtrees through Caption edits', async () => {
    const records = fixture(); records.futureSupport = { version: 8, nested: [true, '保持'] };
    records.captionsById[id('cap')].futureField = { x: { y: '未知' } };
    const { source } = create(records), before = source.originalChanges();
    const edited = await source.prepareCaptionText(source.token, id('cap'), 'body', '追記');
    const unknown = edited.read().history.changes.flatMap(c => c.writes).filter(w => w.path[0] === 'futureSupport' || w.path[2] === 'futureField');
    expect(unknown).toHaveLength(2);
    expect(unknown.map(w => w.value)).toContainEqual({ kind: 'value', value: records.futureSupport });
    expect(edited.originalChanges().slice(0, before.length)).toEqual(before);
  });

  it.each([
    (d: Record<string, any>) => { d.project = {}; },
    (d: Record<string, any>) => { delete d.captionsById[id('cap')]; },
    (d: Record<string, any>) => { d.captionsById[id('cap')] = { title: new A.ImmutableString('"新規"') }; },
    (d: Record<string, any>) => { d.identity = new A.ImmutableString('{}'); },
    (d: Record<string, any>) => { d.captionsById[id('cap')].title = 'Text object is not an atomic string'; },
  ])('rejects unsupported raw structure without accepting a repaired-looking winner', mutate => {
    const { source } = create();
    expect(() => ProjectMetadataSource.reopen(changed(source, mutate), source.proof, limits)).toThrow(/Metadata source invalid/);
  });

  it('rejects a copied identity/root proof, populated first change and partial original dependencies', () => {
    const { source, records } = create(), independent = create(records).source;
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), independent.proof, limits)).toThrow();
    const wrongIdentity = { ...source.proof, identity: { ...source.proof.identity, historyEpoch: id('hep', 8) } };
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), wrongIdentity, limits)).toThrow();
    expect(() => ProjectMetadataSource.reopen(source.originalChanges().slice(1), source.proof, limits)).toThrow();
    const populated = A.from({ schema: new A.ImmutableString(canonical(records.schema)), identity: new A.ImmutableString(canonical(records.identity)), project: { title: new A.ImmutableString('"bad"') } });
    expect(() => ProjectMetadataSource.reopen(A.getAllChanges(populated), { ...source.proof,
      envelope: { ...source.proof.envelope, lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: A.getHeads(populated)[0]! } } }, limits)).toThrow();
  });

  it('rejects competing mutable-container births and a delete/recreate in one logical change', () => {
    const { source, records } = create();
    const insert = (target: string) => (d: Record<string, any>) => {
      d.captionsById[target] = {};
      for (const [field, value] of Object.entries({ ...records.captionsById[id('cap')], id: target })) {
        d.captionsById[target][field] = new A.ImmutableString(canonical(value as any));
      }
    };
    const left = ProjectMetadataSource.reopen(changed(source, insert(id('cap', 2))), source.proof, limits);
    expect(() => left.appendOriginal(changed(source, insert(id('cap', 2))))).toThrow(/container-replacement/);
    expect(() => ProjectMetadataSource.reopen(changed(source, d => {
      delete d.captionsById[id('cap')]; insert(id('cap'))(d);
    }), source.proof, limits)).toThrow(/container-replacement|structure/);
  });

  it('rejects duplicate JSON keys, noncanonical scalars and configured byte/operation limits', () => {
    const { source } = create();
    for (const text of ['{"x":1,"x":2}', ' "text" ', '{"b":1,"a":2}']) {
      const parts = changed(source, d => { d.captionsById[id('cap')].future = new A.ImmutableString(text); });
      expect(() => ProjectMetadataSource.reopen(parts, source.proof, limits)).toThrow();
    }
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), source.proof, { ...limits, maxChangeBytes: 1 })).toThrow();
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), source.proof, { ...limits, maxOperations: 1 })).toThrow();
    expect(() => ProjectMetadataSource.reopen(source.originalChanges(), source.proof, { ...limits, maxWork: NaN })).toThrow();
    expect(() => source.appendOriginal([new TextEncoder().encode('untrusted malformed bytes')])).toThrow('Metadata source invalid (append-original)');
    for (const key of ['constructor', 'prototype', '__proto__', 'bad\nkey']) {
      // Encode original ops directly: the adapter must not depend on a JS assignment guard.
      const doc = raw(source), template = A.decodeChange(A.getLastLocalChange(A.change(A.clone(doc), d => {
        d.future = new A.ImmutableString('null');
      }))!);
      template.ops[0]!.key = key;
      expect(() => source.appendOriginal([A.encodeChange(template)])).toThrow();
    }
  });
});
