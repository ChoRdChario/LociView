import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { planSceneCommand, previewScenePlan, type SceneCommand } from '../src/scene/commands';
import { chooseStartupScene, resolveScene } from '../src/scene/resolve';
import { value, type Field, type Lifecycle, type Membership, type Scene,
  type SceneResources, type SceneState } from '../src/scene/types';

const id = (prefix: string, n: number) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
const sca = id('scn', 1), scb = id('scn', 2), ast = id('ast', 1), cap = id('cap', 1);
const samA = id('sam', 1), samB = id('sam', 2), scmA = id('scm', 1), scmB = id('scm', 2);
const frame = id('frm', 1), assetFrame = id('frm', 2), viewA = id('view', 1), viewB = id('view', 2);
const unresolved = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'conflict' });
const lifecycle = (deleted = false): Field<Lifecycle> => deleted
  ? value({ state: 'deleted', eventId: id('evt', 1), reason: 'userDelete' })
  : value({ state: 'active', eventId: id('evt', 1), reason: 'initial' });
const scene = (key: string, name: string, viewId: string | null = null): Scene => ({ id: key,
  name: value(name), orderKey: value('A'), defaultViewId: value(viewId), lifecycle: lifecycle() });
const edge = (key: string, sceneId: string, resourceId: string, orderKey = 'A'): Membership =>
  ({ id: key, sceneId, resourceId, orderKey: value(orderKey), lifecycle: lifecycle() });
function fixture(): { state: SceneState; resources: SceneResources } {
  const state: SceneState = { token: 'head-1', defaultSceneId: value(sca),
    scenes: { [sca]: scene(sca, 'A', viewA), [scb]: scene(scb, 'B', viewB) },
    assetMemberships: { [samA]: edge(samA, sca, ast), [samB]: edge(samB, scb, ast) },
    captionMemberships: { [scmA]: edge(scmA, sca, cap), [scmB]: edge(scmB, scb, cap) } };
  const resources: SceneResources = { token: state.token, projectFrameId: frame,
    assets: { [ast]: { id: ast, lifecycle: lifecycle(), projection: value({ assetFrameId: assetFrame,
      bindingId: id('bnd', 1), revisionId: id('rev', 1), representationIds: [id('rep', 1)], anchorCompatibilityIds: ['surface-1'] }) } },
    captions: { [cap]: { id: cap, lifecycle: lifecycle(), title: value('Shared'), body: value('One resource'),
      anchor: value({ kind: 'asset', assetId: ast, assetFrameId: assetFrame, positionAsset: [1, 2, 3],
        authoredAnchorCompatibilityId: 'surface-1', authoredAssetRevisionId: id('rev', 1) }) } },
    views: { [viewA]: { id: viewA, sceneId: sca, projectFrameId: frame, lifecycle: lifecycle(),
      camera: value({ preset: 'A' }), background: value({ color: 'A' }) },
    [viewB]: { id: viewB, sceneId: scb, projectFrameId: frame, lifecycle: lifecycle(),
      camera: value({ preset: 'B' }), background: value({ color: 'B' }) } },
    materials: {} };
  return { state, resources };
}
function composition(state: SceneState, resources: SceneResources, sceneId = sca) {
  const result = resolveScene(state, resources, sceneId);
  expect(result.kind).toBe('ready'); if (result.kind !== 'ready') throw new Error('blocked');
  return result.composition;
}
function run(state: SceneState, resources: SceneResources, command: SceneCommand) {
  return previewScenePlan(state, planSceneCommand(state, resources, command, id('evt', 100)), `${state.token}-preview`);
}

describe('disconnected Scene domain (pure portions of SCN-DOM-01–09, not device/storage acceptance)', () => {
  it('SCN-DOM-01: derives A/B/A without mutating history, copying Caption content or leaking entry views', () => {
    const { state, resources } = fixture(); const before = structuredClone({ state, resources });
    const a = composition(state, resources); const b = composition(state, resources, scb);
    expect(a.entryView?.viewId).toBe(viewA); expect(b.entryView?.viewId).toBe(viewB);
    expect(composition(state, resources)).toEqual(a);
    expect(a.captions[0]?.captionId).toBe(b.captions[0]?.captionId);
    expect({ state, resources }).toEqual(before);
    expect(chooseStartupScene(state, scb)).toEqual({ sceneId: scb, issues: [] });
    const badDefault = { ...state, defaultSceneId: unresolved<string>() };
    expect(chooseStartupScene(badDefault).sceneId).toBeUndefined();
    expect(chooseStartupScene(badDefault, scb).sceneId).toBe(scb);
    expect(chooseStartupScene({ ...state, defaultSceneId: value(id('scn', 99)) }).sceneId).toBeUndefined();
    expect(resolveScene(state, resources, id('scn', 99)).kind).toBe('blocked');
  });

  it('SCN-DOM-02/03/07: excludes only membership; hidden-owner Caption stays listed and ProjectAnchor stays visible', () => {
    const { state, resources } = fixture();
    const next = run(state, resources, { kind: 'exclude', resourceKind: 'asset', membershipId: samA });
    const cap2 = id('cap', 2), scm2 = id('scm', 3);
    const withProject = { ...next, captionMemberships: { ...next.captionMemberships, [scm2]: edge(scm2, sca, cap2) } };
    const current = { ...resources, token: next.token, captions: { ...resources.captions,
      [cap2]: { ...resources.captions[cap]!, id: cap2,
        anchor: value({ kind: 'project' as const, projectFrameId: frame, positionProject: [0, 1, 2] as const }) } } };
    const a = composition(withProject, current); const b = composition(withProject, current, scb);
    expect(a.assets).toEqual([]); expect(a.captions.map(c => c.marker)).toEqual(['suppressed', 'visible']);
    expect(b.assets).toHaveLength(1); expect(resources.assets[ast]).toBeDefined();
    const result = resolveScene(withProject, current, sca);
    expect(result.issues).toContainEqual({ code: 'hidden-owner', entityId: cap, field: 'anchor', action: 'show-model' });
    const detached = run(state, resources, { kind: 'exclude', resourceKind: 'caption', membershipId: scmA });
    expect(composition(detached, { ...resources, token: detached.token }).captions).toEqual([]);
    expect(composition(detached, { ...resources, token: detached.token }, scb).captions).toHaveLength(1);
    expect(Object.keys(resources.captions)).toEqual([cap]);
  });

  it('SCN-DOM-03/04: new resource snapshot changes shared content/binding in both Scenes without remapping anchors', () => {
    const { state, resources } = fixture(); const before = structuredClone(state);
    const updated: SceneResources = { ...resources,
      assets: { [ast]: { ...resources.assets[ast]!, projection: value({ assetFrameId: assetFrame,
        bindingId: id('bnd', 2), revisionId: id('rev', 2), representationIds: [id('rep', 2)], anchorCompatibilityIds: ['surface-2'] }) } },
      captions: { [cap]: { ...resources.captions[cap]!, body: value('Participant edit') } } };
    for (const scn of [sca, scb]) {
      const result = composition(state, updated, scn);
      expect(result.assets[0]?.projection.bindingId).toBe(id('bnd', 2));
      expect(result.captions[0]?.body).toEqual(value('Participant edit'));
      expect(result.captions[0]?.marker).toBe('needsReview');
      expect(result.captions[0]?.anchor).toEqual(resources.captions[cap]!.anchor);
    }
    expect(state).toEqual(before);
  });

  it('SCN-DOM-05: duplicate/lifecycle/order conflicts never project a membership winner', () => {
    const { state, resources } = fixture(); const duplicateId = id('sam', 3);
    for (const entries of [
      { ...state.assetMemberships, [duplicateId]: edge(duplicateId, sca, ast) },
      { [duplicateId]: edge(duplicateId, sca, ast), ...state.assetMemberships },
      { ...state.assetMemberships, [duplicateId]: { ...edge(duplicateId, sca, ast), lifecycle: unresolved<Lifecycle>() } },
    ]) {
      const result = resolveScene({ ...state, assetMemberships: entries }, resources, sca);
      expect(result.kind).toBe('ready');
      if (result.kind === 'ready') expect(result.composition.assets).toEqual([]);
      expect(result.issues.some(i => i.code === 'duplicate')).toBe(true);
    }
    for (const override of [{ lifecycle: unresolved<Lifecycle>() }, { orderKey: unresolved<string>() }]) {
      const changed = { ...state, assetMemberships: { ...state.assetMemberships, [samA]: { ...state.assetMemberships[samA]!, ...override } } };
      expect(composition(changed, resources).assets).toEqual([]);
    }
    const blocked = { ...state, scenes: { ...state.scenes, [sca]: { ...state.scenes[sca]!, lifecycle: unresolved<Lifecycle>() } } };
    expect(resolveScene(blocked, resources, sca).kind).toBe('blocked');
    expect(composition(blocked, resources, scb).assets).toHaveLength(1);
  });

  it('SCN-DOM-05: unresolved binding, anchor, text and entry view affect only their own projection', () => {
    const { state, resources } = fixture();
    const badBinding = { ...resources, assets: { [ast]: { ...resources.assets[ast]!, projection: unresolved<import('../src/scene/types').AssetProjection>() } } };
    const a = composition(state, badBinding);
    expect(a.assets).toEqual([]); expect(a.captions[0]?.marker).toBe('suppressed');
    const badAnchor = { ...resources, captions: { [cap]: { ...resources.captions[cap]!, anchor: unresolved<import('../src/scene/types').Anchor>(), title: unresolved<string>() } } };
    const b = composition(state, badAnchor);
    expect(b.assets).toHaveLength(1); expect(b.captions[0]?.marker).toBe('suppressed');
    expect(b.captions[0]?.title.kind).toBe('unresolved'); expect(b.captions[0]?.body).toEqual(value('One resource'));
    expect(composition({ ...state, scenes: { ...state.scenes, [sca]: { ...state.scenes[sca]!, defaultViewId: value(viewB) } } }, resources).entryView).toBeUndefined();
    expect(composition(state, { ...resources, views: {} }).entryView).toBeUndefined();
    const viewConflict = { ...state, scenes: { ...state.scenes, [sca]: { ...state.scenes[sca]!, defaultViewId: unresolved<string | null>() } } };
    expect(composition(viewConflict, resources).assets).toHaveLength(1);
    expect(composition(viewConflict, resources).entryView).toBeUndefined();
  });

  it('uses exact whole-record Scene/Project material precedence and excludes duplicates at their scope', () => {
    const { state, resources } = fixture(); const projectId = id('ovr', 1), sceneId = id('ovr', 2);
    const target = { assetId: ast, variantFamilyId: id('fam', 1), materialLayoutId: id('lay', 1), logicalMaterialSlotId: id('slot', 1) };
    const project = { id: projectId, lifecycle: lifecycle(), routing: value({ scope: { kind: 'project' as const }, target }), intent: value({ color: 'project', opacity: 0.5 }) };
    const local = { id: sceneId, lifecycle: lifecycle(), routing: value({ scope: { kind: 'scene' as const, sceneId: sca }, target }), intent: value({ color: 'scene' }) };
    const r = { ...resources, materials: { [projectId]: project, [sceneId]: local } };
    expect(composition(state, r).materials[0]?.intent).toEqual({ color: 'scene' });
    expect(composition(state, r, scb).materials[0]?.intent).toEqual({ color: 'project', opacity: 0.5 });
    const dup = id('ovr', 3);
    const result = resolveScene(state, { ...r, materials: { ...r.materials, [dup]: { ...local, id: dup } } }, sca);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') expect(result.composition.materials[0]?.overrideId).toBe(projectId);
    expect(result.issues.filter(i => i.code === 'duplicate')).toHaveLength(2);
  });

  it('SCN-DOM-06: copies only resolved model memberships, with fresh IDs and stable order', () => {
    const { state, resources } = fixture(); const scn = id('scn', 3), sam = id('sam', 3);
    const next = run(state, resources, { kind: 'create', sceneId: scn, sourceSceneId: sca, activeSceneId: sca,
      name: '同じモデル・新しいシーン', orderKey: 'B', membershipIds: [sam] });
    expect(next.defaultSceneId).toEqual(state.defaultSceneId);
    expect(next.scenes[scn]?.defaultViewId).toEqual(value(null));
    expect(next.assetMemberships[sam]?.resourceId).toBe(ast);
    expect(next.captionMemberships).toEqual(state.captionMemberships);
    const result = composition(next, { ...resources, token: next.token }, scn);
    expect(result.assets).toHaveLength(1); expect(result.captions).toEqual([]); expect(result.entryView).toBeUndefined();
    expect(() => run(state, resources, { kind: 'create', sceneId: scn, sourceSceneId: sca, activeSceneId: scb,
      name: 'C', orderKey: 'B', membershipIds: [sam] })).toThrow('sourceSceneId');
    expect(() => run(state, resources, { kind: 'create', sceneId: scn, sourceSceneId: sca, activeSceneId: sca,
      name: 'C', orderKey: 'B', membershipIds: [] })).toThrow('membershipIds');
  });

  it('SCN-DOM-09: creates one default Scene and every explicit initial edge in one immutable plan', () => {
    const { state, resources } = fixture();
    const empty: SceneState = { ...state, scenes: {}, assetMemberships: {}, captionMemberships: {}, defaultSceneId: { kind: 'unresolved', reason: 'missing' } };
    const before = structuredClone(empty);
    const plan = planSceneCommand(empty, resources, { kind: 'initialize', sceneId: sca, name: 'シーン 1', orderKey: 'A',
      assets: [{ assetId: ast, membershipId: samA, orderKey: 'A' }] }, id('evt', 10));
    expect(Object.keys(plan.next.scenes)).toEqual([sca]); expect(plan.next.defaultSceneId).toEqual(value(sca));
    expect(Object.keys(plan.next.assetMemberships)).toEqual([samA]); expect(plan.next.captionMemberships).toEqual({});
    expect(empty).toEqual(before); expect(Object.isFrozen(plan.next.scenes[sca])).toBe(true);
    expect(() => previewScenePlan({ ...empty, token: 'new-head' }, plan, 'preview')).toThrow('stale');
    expect(() => previewScenePlan(empty, plan, empty.token)).toThrow('previewToken');
  });

  it('SCN-DOM-06: preserves tied source order even when fresh membership IDs sort in reverse', () => {
    const { state, resources } = fixture();
    const ast2 = id('ast', 2), source2 = id('sam', 3), scn = id('scn', 3);
    const input = { ...state, assetMemberships: { ...state.assetMemberships, [source2]: edge(source2, sca, ast) } };
    input.assetMemberships[source2] = edge(source2, sca, ast2);
    const r = { ...resources, assets: { ...resources.assets, [ast2]: { ...resources.assets[ast]!, id: ast2 } } };
    const sourceOrder = composition(input, r).assets.map(a => a.assetId);
    const next = run(input, r, { kind: 'create', sceneId: scn, sourceSceneId: sca, activeSceneId: sca,
      name: 'Ordered', orderKey: 'B', membershipIds: [id('sam', 5), id('sam', 4)] });
    expect(composition(next, { ...r, token: next.token }, scn).assets.map(a => a.assetId)).toEqual(sourceOrder);
    expect(next.assetMemberships[samA]).toEqual(input.assetMemberships[samA]);
    expect(next.assetMemberships[source2]).toEqual(input.assetMemberships[source2]);
  });

  it('SCN-DOM-08: deleting Scenes never cascades resources; default and dependent edges block', () => {
    const { state, resources } = fixture();
    expect(() => run(state, resources, { kind: 'delete', sceneId: sca })).toThrow('defaultSceneId');
    expect(() => run(state, resources, { kind: 'delete', sceneId: scb })).toThrow('dependencies');
    const emptyB: SceneState = { ...state, assetMemberships: { [samA]: state.assetMemberships[samA]! }, captionMemberships: { [scmA]: state.captionMemberships[scmA]! } };
    const r = { ...resources, views: { [viewA]: resources.views[viewA]! } };
    const next = run(emptyB, r, { kind: 'delete', sceneId: scb });
    expect(next.scenes[scb]?.lifecycle).toEqual(value({ state: 'deleted', eventId: id('evt', 100), reason: 'userDelete' }));
    expect(resources.assets[ast]).toBeDefined(); expect(resources.captions[cap]).toBeDefined();
    const unseen = { ...next, captionMemberships: { ...next.captionMemberships, [scmB]: edge(scmB, scb, cap) } };
    expect(resolveScene(unseen, { ...r, token: next.token }, scb).kind).toBe('blocked');
    expect(unseen.captionMemberships[scmB]?.lifecycle).toEqual(lifecycle());
  });

  it('validates exact endpoint, fresh ID, scalar limits, view ownership and unresolved fields', () => {
    const { state, resources } = fixture();
    expect(() => run(state, resources, { kind: 'rename', sceneId: sca, name: ' ' })).toThrow('name');
    expect(() => run(state, resources, { kind: 'rename', sceneId: sca, name: 'あ'.repeat(257) })).toThrow('name');
    expect(() => run(state, resources, { kind: 'rename', sceneId: sca, name: '\ud800' })).toThrow('name');
    for (const name of ['x\u0085y', 'x\u2028y', 'x\u2029y'])
      expect(() => run(state, resources, { kind: 'rename', sceneId: sca, name })).toThrow('name');
    expect(run(state, resources, { kind: 'rename', sceneId: sca, name: 'e\u0301' }).scenes[sca]?.name).toEqual(value('é'));
    expect(() => run(state, resources, { kind: 'rename', sceneId: '__proto__', name: 'x' })).toThrow('id');
    expect(() => run(state, resources, { kind: 'setView', sceneId: sca, viewId: viewB })).toThrow('invalid');
    const cleared = run(state, resources, { kind: 'setView', sceneId: sca, viewId: null });
    expect(cleared.scenes[sca]?.defaultViewId).toEqual(value(null));
    expect(run(state, resources, { kind: 'setDefault', sceneId: scb }).defaultSceneId).toEqual(value(scb));
    expect(() => run(state, resources, { kind: 'include', sceneId: sca, resourceKind: 'asset', resourceId: ast,
      membershipId: id('sam', 3), orderKey: 'A' })).toThrow('duplicate');
    expect(() => run(state, resources, { kind: 'include', sceneId: sca, resourceKind: 'asset', resourceId: id('ast', 99),
      membershipId: id('sam', 3), orderKey: 'A' })).toThrow('missing');
    const conflicted = { ...state, scenes: { ...state.scenes, [sca]: { ...state.scenes[sca]!, name: unresolved<string>() } } };
    expect(() => run(conflicted, resources, { kind: 'rename', sceneId: sca, name: 'winner' })).toThrow('conflict');
    expect(() => resolveScene(state, { ...resources, token: 'another' }, sca)).toThrow('token mismatch');
    expect(() => run(state, { ...resources, token: 'another' }, { kind: 'setDefault', sceneId: scb })).toThrow('token mismatch');
  });

  it('isolates ordinary entries; only approved hosts, disconnected metadata and pure package controls may use the new core', () => {
    const walk = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
      const name = join(path, entry.name); return entry.isDirectory() ? walk(name) : [name];
    });
    for (const path of walk('src').filter(p => /\.(ts|tsx|js)$/.test(p))) {
      const source = readFileSync(path, 'utf8');
      const reviewEditPackage = /[\\/]projectPackage[\\/](reviewEdit|reviewEditControls|reviewEditJob|cleanInputDescriptor)\.ts$/.test(path);
      const packageControl = reviewEditPackage || /[\\/]projectPackage[\\/](reviewSnapshot|reviewSelection|reviewSource|reviewArchive|reviewOutputJob|cleanRecords|cleanSource|cleanArchive|cleanOutputJob|cleanInputJob|contract|manifest|historySummary|closure|protectedInventory|workspaceSource|contributionSource|contributionArchive|contributionEvidence|contributionReceiveJob|contributionOutputJob|outputJobs|receiveJobs|zipChecks|zipArchive|workspaceArchive|receiveJob|workspaceBases|outputJob|backupEvidence|backupSource|backupArchive|backupOutputJob|backupRestoreJob|restoreControls)\.ts$/.test(path);
      const packageMetadata = reviewEditPackage || /[\\/]projectPackage[\\/](reviewSnapshot|reviewSelection|reviewSource|reviewArchive|reviewOutputJob|cleanRecords|cleanSource|cleanArchive|cleanOutputJob|cleanInputJob|historySummary|closure|protectedInventory|workspaceSource|workspaceArchive|contributionSource|contributionArchive|contributionEvidence|contributionReceiveJob|contributionOutputJob|outputJobs|receiveJobs|receiveJob|workspaceBases|outputJob|backupEvidence|backupSource|backupArchive|backupOutputJob|backupRestoreJob|restoreControls)\.ts$/.test(path);
      const packageJournal = /[\\/]projectMetadata[\\/](packageRemote|session|journal)\.ts$/.test(path) || /[\\/]projectFiles[\\/](receiveWorkspace|sendWorkspace)\.ts$/.test(path) ||
        /[\\/]harness[\\/]projectScene[\\/](reviewView|validationHost|validationWorkspace|validationCatalog|validationGeneration)\.ts$/.test(path);
      // 06 §11/§12.3 permit these exact disconnected primitives, not an app importer.
      if (!packageControl && !packageJournal) expect(source, path).not.toMatch(/(?:from\s+|import\s*\()['"][^'"]*\/projectPackage\//);
      const metadataFoundation = /[\\/]projectMetadata[\\/](format|source)\.ts$/.test(path);
      const metadataService = /[\\/]projectMetadata[\\/](persistence|generationScope|repository|journal|contentEvidence|blobStream|blobStore|blobInventory|session|commands|remote|packageRemote|membership|records|assetStatus|modelMembership|modelAddition|modelReplacement|captionCandidates|sceneAuthoring|viewResolution|captionDeletion|assetDeletion|startupScene)\.ts$/.test(path);
      // 05 §13.2 permits this exact new synthetic host, never ordinary/old saved activation.
      const metadataHost = /[\\/]harness[\\/]projectScene[\\/]metadata(Fixture|Storage|Host|Intent|MembershipControls|Models|ModelFacts|AssetStatusControls|ConflictControls|CaptionLifecycleControls|StartupControls)\.ts$/.test(path);
      const validationFiles = /[\\/]projectFiles[\\/](validation|png|glb|glbMaterials|initialProject|content|creation|modelFacts|receiveWorkspace|sendWorkspace)\.ts$/.test(path);
      const validationDisplay = /[\\/]harness[\\/]projectScene[\\/](modelTypes|modelCandidatePreview|validationProjection|validationRender|validationMaterials|validationCoverage)\.ts$/.test(path);
      const validationHost = /[\\/]harness[\\/]projectScene[\\/](reviewView|reviewWorkspace|savedHost|validationHost|validationModeHost|validationCatalog|validationGeneration|validationWorkspace|validationReceiveControls|validationOutputControls|validationBrowser|browserMetadataStorage)\.ts$/.test(path);
      if (!metadataFoundation && !metadataService && !metadataHost && !validationFiles && !validationDisplay && !validationHost && !packageMetadata) expect(source, path).not.toMatch(/(?:from\s+|import\s*\()['"][^'"]*\/projectMetadata\//);
      if (packageControl) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        const byFile: Record<string, string[]> = {
          reviewSnapshot: ['../core/json', '../domain/projectGraph', '../domain/projectGraphSupport', '../domain/projectMutableFields', '../domain/projectRecordFields', '../domain/projectRecords', '../domain/values', '../projectMetadata/blobStore', '../projectMetadata/source', './cleanRecords', './contract', './manifest'],
          reviewSelection: ['../domain/projectCandidates', '../domain/projectGraphSupport', '../domain/projectMutableFields', '../domain/projectRecords', '../domain/values', '../projectMetadata/source', '../projectMetadata/persistence', './cleanRecords', './contract', './manifest', './reviewSnapshot'],
          reviewSource: ['../domain/projectGraphSupport', '../domain/projectContentChecks', '../projectMetadata/blobStore', '../projectMetadata/session', '../projectMetadata/source', '../scene/projectProvider', './cleanSource', './contributionEvidence', './contract', './manifest', './reviewSelection', './reviewSnapshot', './zipChecks'],
          reviewArchive: ['../domain/projectGraphSupport', '../domain/values', '../projectMetadata/blobStore', '../projectMetadata/source', './contract', './manifest', './reviewSource', './reviewSnapshot', './zipArchive', './workspaceArchive', './zipChecks'],
          reviewOutputJob: ['../platform/fs', '../projectMetadata/blobStore', '../domain/projectContentChecks', '../projectMetadata/format', '../projectMetadata/source', '../projectMetadata/persistence', './contract', './manifest', './reviewSource', './reviewSnapshot', './reviewSelection', './reviewArchive', './workspaceArchive', './contributionEvidence', './workspaceBases', './protectedInventory', './zipChecks'],
          cleanRecords: ['../domain/projectCandidates', '../domain/projectGraph', '../domain/projectGraphSupport', '../domain/projectMutableFields', '../domain/projectRecords', '../domain/values', '../projectMetadata/persistence', '../projectMetadata/source', './contract', './manifest'],
          cleanSource: ['../domain/projectContentChecks', '../domain/projectGraphSupport', '../domain/projectRecords', '../domain/values', '../projectMetadata/blobStore', '../projectMetadata/blobStream', '../projectMetadata/source', '../projectMetadata/session', '../scene/projectProvider', './contract', './contributionEvidence', './closure', './cleanRecords', './manifest', './zipChecks', '../domain/projectCandidates', './protectedInventory'],
          cleanArchive: ['../projectMetadata/blobStore', '../domain/projectGraphSupport', '../domain/values', '../projectMetadata/source', './contract', './cleanSource', './contributionEvidence', './manifest', './zipArchive', './workspaceArchive', './zipChecks'],
          cleanInputJob: ['../platform/fs', '../projectMetadata/persistence', '../projectMetadata/format', '../projectMetadata/journal', './cleanArchive', './contract', './cleanInputDescriptor', './reviewEditControls', './workspaceBases'],
          cleanInputDescriptor: ['../projectMetadata/format', '../projectMetadata/persistence', './cleanArchive', './manifest'],
          reviewEdit: ['../domain/projectGraphSupport', '../projectMetadata/format', '../projectMetadata/source', '../projectMetadata/persistence', './cleanArchive', './cleanInputDescriptor', './cleanRecords', './cleanSource', './contributionEvidence', './contract', './manifest', './reviewArchive', './reviewSnapshot'],
          reviewEditControls: ['../platform/fs', '../projectMetadata/format', '../projectMetadata/persistence', '../projectMetadata/journal', './contract', './cleanInputDescriptor', './manifest', './reviewEdit', './cleanArchive', './workspaceBases'],
          reviewEditJob: ['../platform/fs', '../projectMetadata/format', '../projectMetadata/persistence', '../projectMetadata/session', './cleanInputJob', './reviewEdit', './reviewEditControls'],
          cleanOutputJob: ['../platform/fs', '../projectMetadata/blobStore', '../domain/projectContentChecks', '../projectMetadata/format', '../projectMetadata/source', '../projectMetadata/persistence', './contract', './manifest', './cleanSource', './cleanRecords', './cleanArchive', './workspaceArchive', './contributionEvidence', './workspaceBases', './protectedInventory', './zipChecks'],
          restoreControls: ['../platform/fs', '../projectMetadata/format', '../projectMetadata/persistence', '../projectMetadata/remote', './contract', './manifest'],
          backupRestoreJob: ['../platform/fs', '../domain/values', '../projectMetadata/blobStore', '../projectMetadata/format', '../projectMetadata/generationScope',
            '../projectMetadata/persistence', '../projectMetadata/session', '../projectMetadata/journal', './backupArchive', './contract', './workspaceBases',
            './receiveJobs', './outputJobs', './zipChecks', './restoreControls', '../projectMetadata/repository', '../projectMetadata/packageRemote', './manifest'],
          contract: [], manifest: ['../core/json', '../domain/values', '../domain/projectGraphSupport',
            '../domain/projectRecordFields', '../domain/projectRecords', '../nativeGs/sha256', './contract'],
          backupEvidence: ['@automerge/automerge/slim', '../domain/projectGraphSupport', '../domain/projectRecordFields', '../domain/values',
            '../projectMetadata/source', '../projectMetadata/blobStore', './workspaceBases', './contract', './manifest',
            './contributionEvidence', './historySummary', './closure', './protectedInventory', './zipChecks'],
          backupSource: ['../projectMetadata/session', '../projectMetadata/source', '../projectMetadata/blobStore', '../projectMetadata/blobStream',
            './workspaceBases', './contract', './manifest', './contributionEvidence', './backupEvidence', './workspaceArchive', './zipChecks'],
          backupArchive: ['../projectMetadata/blobStore', '../projectMetadata/source', '../domain/projectGraphSupport', '../domain/values',
            './contract', './manifest', './backupSource', './backupEvidence', './contributionEvidence', './workspaceArchive', './zipArchive', './zipChecks'],
          historySummary: ['../projectMetadata/source', '../domain/projectRecordFields', '../domain/projectRecords',
            '../domain/projectMutableFields', '../domain/projectGraphSupport', '../domain/values', './contract', './manifest'],
          closure: ['../domain/projectCandidates', '../domain/projectRecordFields', '../domain/projectGraphSupport', '../domain/values',
            '../projectMetadata/blobStore', './contract', './manifest'],
          protectedInventory: ['../domain/projectCandidates', '../domain/projectGraphSupport', '../domain/values', './contract', './manifest', './closure'],
          workspaceBases: ['@automerge/automerge/slim', '../platform/fs', '../projectMetadata/format', '../projectMetadata/persistence', '../projectMetadata/remote', '../projectMetadata/journal',
            '../projectMetadata/source', './contract', './manifest', './closure', './historySummary', './outputJob', './backupEvidence'],
          outputJob: ['../platform/fs', '../projectMetadata/blobStore', '../projectMetadata/format', '../projectMetadata/persistence', '../projectMetadata/source',
            './contract', './manifest', './workspaceSource', './workspaceArchive', './workspaceBases', './protectedInventory'],
          contributionOutputJob: ['../platform/fs', '../projectMetadata/blobStore', '../projectMetadata/format', '../projectMetadata/persistence', '../projectMetadata/source',
            './contract', './manifest', './contributionSource', './contributionEvidence', './contributionArchive', './workspaceBases', './protectedInventory'],
          backupOutputJob: ['../platform/fs', '../projectMetadata/blobStore', '../projectMetadata/format', '../projectMetadata/persistence', '../projectMetadata/source',
            './contract', './manifest', './backupArchive', './backupSource', './backupEvidence', './contributionEvidence', './workspaceArchive', '../domain/projectRecordFields', './workspaceBases', './zipChecks'],
          outputJobs: ['../platform/fs', '../projectMetadata/format', './outputJob', './contributionOutputJob', './backupOutputJob', './cleanOutputJob', './reviewOutputJob', './cleanSource', '../projectMetadata/blobStore',
            '../projectMetadata/persistence', './workspaceBases', './protectedInventory', './contract'],
          workspaceSource: ['../projectMetadata/session', '../projectMetadata/source', '../projectMetadata/blobStore', '../projectMetadata/blobStream',
            './contract', './manifest', './historySummary', './closure', './contributionEvidence'],
          // 06 §8.5/8.6: exact file/source/receive boundaries, not ordinary activation.
          contributionSource: ['@automerge/automerge/slim', '../domain/projectGraphSupport', '../domain/values', '../projectMetadata/blobStore',
            '../projectMetadata/blobStream', '../projectMetadata/session', '../projectMetadata/source', './contract', './manifest',
            './historySummary', './closure', './workspaceSource', './workspaceBases', './zipChecks', './zipArchive', './contributionEvidence'],
          contributionEvidence: ['@automerge/automerge/slim', '../domain/projectGraphSupport', '../domain/values', '../projectMetadata/source',
            './contract', './manifest', './historySummary', './closure'],
          contributionReceiveJob: ['../platform/fs', '../projectMetadata/blobStore', '../projectMetadata/format', '../projectMetadata/persistence',
            '../projectMetadata/remote', '../projectMetadata/journal', '../projectMetadata/packageRemote', './contract', './workspaceBases',
            './contributionSource', './contributionEvidence', './zipArchive', './closure'],
          receiveJobs: ['../platform/fs', '../projectMetadata/blobStore', '../projectMetadata/format', '../projectMetadata/journal',
            '../projectMetadata/packageRemote', './receiveJob', './contributionReceiveJob', './cleanInputJob'],
          contributionArchive: ['../projectMetadata/blobStore', '../domain/projectGraphSupport', '../domain/values', './contract', './manifest',
            './contributionSource', './workspaceArchive', './zipChecks'],
          zipChecks: ['./manifest'], zipArchive: ['../nativeGs/sha256', './contract', './manifest', './zipChecks'],
          workspaceArchive: ['@zip.js/zip.js', '../domain/projectGraphSupport', '../domain/values', '../projectMetadata/blobStore',
            '../projectMetadata/blobStream', '../projectMetadata/source', '../nativeGs/sha256', './contract', './manifest',
            './workspaceSource', './historySummary', './closure', './zipChecks', './zipArchive'],
          receiveJob: ['../platform/fs', '../projectMetadata/format', '../projectMetadata/persistence', '../projectMetadata/remote',
            '../projectMetadata/journal', '../projectMetadata/source', './contract', './workspaceArchive', './manifest', './closure', './historySummary', './workspaceBases'],
        };
        const name = path.split(/[\\/]/).at(-1)!.replace(/\.ts$/, '');
        expect(imports.every(p => byFile[name]!.includes(p!)), path).toBe(true);
        expect(source, path).not.toMatch(/\b(fetch|indexedDB|localStorage|sessionStorage|serviceWorker)\b/);
      } else if (/[\\/](scene|domain)[\\/]/.test(path)) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        const providerImports = path.replaceAll('\\', '/').endsWith('/scene/projectProvider.ts') ? [
          '../domain/projectContent', '../domain/projectGraphSupport', '../domain/projectMutableFields', '../domain/projectCandidates',
          '../domain/atomicHistory', '../domain/projectContentChecks',
        ] : path.replaceAll('\\', '/').endsWith('/scene/projectMaterialRoutes.ts') ? ['../domain/projectGraphSupport'] : [];
        expect(imports.every(p => p?.startsWith('./') || p === '../domain/values' || providerImports.includes(p!))).toBe(true);
      } else if (validationHost) {
        const byFile: Record<string, string[]> = {
          reviewView: ['three', '../../domain/projectGraphSupport', '../../domain/values', '../../domain/materialIntent', '../../projectPackage/reviewArchive', '../../projectFiles/glb', '../../projectFiles/png', '../../projectFiles/validation', '../../projectFiles/initialProject', '../../scene/types', '../../ui/projectScene/captionListState', './modelTypes', './viewportModel', './viewHistory', './validationMaterials'],
          reviewWorkspace: ['../../ui/projectScene/captionListControls', '../../ui/projectScene/captionListState', '../../ui/projectScene/captionWindowControls', '../../ui/projectScene/captionWindowState', '../../ui/projectScene/navigationState', '../../ui/projectScene/viewState', '../../ui/projectScene/mediaPreview', './reviewView', './viewportHost'],
          savedHost: ['./metadataHost', './fixture'],
          validationModeHost: ['./validationHost', './savedHost', './historyProjection', './fixture'],
          validationHost: ['../../platform/fs', '../../platform/projectLock', '../../projectMetadata/persistence', '../../projectMetadata/journal',
            '../../projectMetadata/repository', '../../projectMetadata/blobStore', '../../projectMetadata/session', '../../projectMetadata/captionDeletion',
            '../../projectMetadata/assetDeletion', '../../projectFiles/creation', '../../projectFiles/validation', '../../projectFiles/png',
            './metadataFixture', './validationProjection', './metadataIntent', './fixture', './historyProjection', './savedHost', './mediaHistory',
            '../../projectFiles/initialProject', '../../domain/values', './modelTypes', './viewHistory', '../../scene/resolve', './validationMaterials', '../../domain/projectGraphSupport', '../../domain/materialIntent', '../../projectFiles/receiveWorkspace', '../../projectFiles/sendWorkspace', '../../projectPackage/workspaceArchive', '../../projectPackage/cleanArchive', '../../projectPackage/zipArchive', '../../projectPackage/backupRestoreJob', '../../projectPackage/restoreControls', '../../projectPackage/reviewEdit', '../../projectPackage/reviewEditJob', '../../projectPackage/reviewEditControls', './validationGeneration'],
          validationGeneration: ['../../platform/fs', '../../projectMetadata/generationScope', '../../projectPackage/backupRestoreJob',
            '../../projectPackage/restoreControls', '../../projectFiles/creation', '../../projectFiles/validation', './validationHost'],
          validationCatalog: ['./validationHost', './validationGeneration', '../../projectFiles/receiveWorkspace', '../../projectFiles/sendWorkspace', '../../projectFiles/validation', '../../projectPackage/reviewEditControls'],
          validationWorkspace: ['../../projectMetadata/persistence', '../../projectFiles/initialProject', '../../projectFiles/creation',
            '../../projectFiles/validation', '../../projectPackage/workspaceArchive', '../../projectPackage/cleanArchive', '../../projectPackage/zipArchive', '../../projectPackage/reviewEdit', '../../projectFiles/png', './validationHost', './validationModeHost', './savedHost', './validationCatalog', './metadataWorkspace', './metadataConflictControls', './metadataCaptionLifecycleControls', './metadataMembershipControls', './metadataAssetStatusControls', './modelCandidatePreview', './viewportHost', './validationReceiveControls', './reviewView', './reviewWorkspace'],
          validationReceiveControls: ['./validationModeHost', './session', './validationOutputControls'],
          validationOutputControls: ['./validationModeHost', './session'],
          validationBrowser: ['../../platform/opfs', '../../platform/projectLock', '../../projectMetadata/blobStore', '../../projectMetadata/generationScope', '../../projectFiles/validation',
            './browserMetadataStorage', './validationHost', './validationCatalog', './validationWorkspace', './validationRender', './viewport', './viewportModel', './fixture'],
          browserMetadataStorage: ['@automerge/automerge/slim', '@automerge/automerge/automerge.wasm?url', '@automerge/automerge-repo-storage-indexeddb'],
        };
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        const name = path.split(/[\\/]/).at(-1)!.replace(/\.ts$/, '');
        expect(imports.every(p => byFile[name]!.includes(p!)), path).toBe(true);
        if (name !== 'browserMetadataStorage') expect(source, path).not.toMatch(/\b(fetch|indexedDB|localStorage|sessionStorage|serviceWorker)\b/);
      } else if (validationDisplay) {
        const byFile: Record<string, string[]> = {
          modelTypes: ['../../domain/values', '../../scene/types', './modelClosure', './mediaHistory'],
          modelCandidatePreview: ['../../scene/projectProvider', '../../projectMetadata/assetStatus', '../../projectMetadata/records', '../../projectMetadata/format', './modelTypes', './viewportModel', './viewportHost'],
          validationProjection: ['../../scene/projectProvider', '../../projectMetadata/records', '../../projectMetadata/format', '../../domain/projectGraphSupport', '../../projectFiles/validation', './fixture', './modelTypes'],
          validationRender: ['three', 'three/addons/loaders/GLTFLoader.js', '../../viewer/loaders', '../../viewer/hardChroma', '../../projectFiles/glb', '../../projectFiles/content', './modelTypes', './viewportPicking', './viewportModel', '../../domain/projectGraphSupport', '../../domain/values', './validationMaterials'],
          validationMaterials: ['../../domain/projectGraphSupport', '../../domain/materialIntent', '../../domain/values', '../../scene/types', './modelTypes'],
          validationCoverage: ['three', '../../viewer/hardChroma', './viewportPicking'],
        };
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        expect(imports.every(p => byFile[path.split(/[\\/]/).at(-1)!.replace(/\.ts$/, '')]!.includes(p!)), path).toBe(true);
        expect(source, path).not.toMatch(/\b(fetch|indexedDB|localStorage|sessionStorage|serviceWorker)\b/);
      } else if (validationFiles) {
        const byFile: Record<string, string[]> = {
          validation: ['../core/json', '../domain/values', '../projectMetadata/format', '../projectMetadata/persistence'],
          png: ['../viewer/rasterDimensions', './validation'],
          glb: ['three', '../domain/values', './png', './glbMaterials', './validation'],
          glbMaterials: ['../domain/values', './validation'],
          initialProject: ['../domain/projectGraphSupport', '../domain/projectRecords', '../domain/values', '../projectMetadata/persistence', '../projectMetadata/blobStore', './glb', './png', './validation'],
          content: ['../platform/fs', '../domain/projectContentChecks', '../domain/projectGraphSupport', '../domain/values', '../domain/projectRecordFields', '../projectMetadata/contentEvidence', '../projectMetadata/blobInventory', '../projectMetadata/blobStore', '../projectMetadata/session', '../projectMetadata/persistence', './glb', './png', './validation', './initialProject'],
          creation: ['../platform/fs', '../projectMetadata/blobStore', '../projectMetadata/source', '../projectMetadata/session', '../projectMetadata/repository', '../projectMetadata/persistence', './content', './initialProject', './png', './validation', './modelFacts'],
          modelFacts: ['../scene/projectProvider', '../projectMetadata/session', '../projectMetadata/source', '../projectMetadata/persistence', '../domain/projectContentChecks', '../domain/projectRecordFields', '../domain/values', './validation', './content'],
          receiveWorkspace: ['../platform/fs', '../platform/projectLock', '../projectMetadata/session', '../projectMetadata/format', '../projectPackage/receiveJob', '../projectPackage/cleanInputJob', './validation', '../projectMetadata/journal', '../projectMetadata/persistence', '../projectMetadata/blobStore', '../projectPackage/contract', '../projectPackage/zipArchive', '../projectPackage/contributionReceiveJob', '../projectPackage/receiveJobs', '../projectPackage/manifest'],
          sendWorkspace: ['../platform/fs', '../projectMetadata/session', '../projectMetadata/blobStore', '../projectMetadata/format', '../projectMetadata/persistence',
            '../projectPackage/outputJob', '../projectPackage/contributionOutputJob', '../projectPackage/backupOutputJob', '../projectPackage/cleanOutputJob', '../projectPackage/reviewOutputJob', '../projectPackage/reviewSelection', '../projectPackage/protectedInventory', '../projectPackage/contract', '../projectPackage/outputJobs', '../projectPackage/contributionSource', '../projectPackage/workspaceBases', './receiveWorkspace', './validation'],
        };
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        expect(imports.every(p => byFile[path.split(/[\\/]/).at(-1)!.replace(/\.ts$/, '')]!.includes(p!)), path).toBe(true);
        expect(source, path).not.toMatch(/\b(fetch|indexedDB|localStorage|sessionStorage|serviceWorker)\b/);
      } else if (metadataFoundation) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        const permitted = ['@automerge/automerge/slim', '../core/json', '../domain/atomicHistory',
          '../domain/projectGraphSupport', '../domain/projectRecords', '../domain/projectRecordFields',
          '../domain/values', '../domain/projectCandidates', '../domain/projectMutableFields', '../scene/projectProvider', './commands', './format'];
        expect(imports.every(p => permitted.includes(p!)), path).toBe(true);
        expect(source, path).not.toMatch(/\b(fetch|indexedDB|localStorage|sessionStorage|serviceWorker)\b/);
      } else if (metadataService) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        const byFile: Record<string, string[]> = {
          persistence: ['../core/json', '../domain/projectGraphSupport', '../domain/values', '../platform/fs', './format'],
          generationScope: ['../platform/fs', './format', './persistence', './repository'],
          repository: ['@automerge/automerge/slim', '@automerge/automerge-repo/slim', '../platform/fs', './format', './persistence', './source'],
          journal: ['@automerge/automerge/slim', '../platform/fs', '../domain/values', '../domain/projectRecordFields', './format', './source', './persistence', './remote', './packageRemote', '../projectPackage/contributionEvidence'],
          remote: ['@automerge/automerge/slim', '../domain/values', './format', './source', './persistence'],
          packageRemote: ['../domain/values', '../projectPackage/manifest', '../projectPackage/contract', './format', './source', './remote', './persistence', '../projectPackage/contributionEvidence', '../projectPackage/backupEvidence'],
          records: ['../domain/projectRecords', '../domain/projectRecordFields', '../domain/projectGraphSupport', '../scene/projectProvider', './format'],
          assetStatus: ['../domain/projectMutableFields', '../domain/projectRecords', '../domain/projectRecordFields', '../domain/projectGraphSupport',
            '../domain/values', '../scene/types', '../scene/projectProvider', './format'],
          membership: ['../domain/projectCandidates', '../domain/projectMutableFields', '../domain/projectRecordFields', '../domain/projectRecords',
            '../domain/projectGraphSupport', '../domain/values', '../scene/projectProvider', './commands', './format'],
          modelMembership: ['../domain/projectRecords', '../domain/projectRecordFields', '../domain/projectMutableFields', '../domain/projectGraphSupport',
            '../domain/values', '../scene/projectProvider', './membership', './commands', './format', './records'],
          modelAddition: ['../domain/projectRecords', '../domain/projectRecordFields', '../domain/projectMutableFields', '../domain/projectGraphSupport',
            '../domain/values', '../scene/projectProvider', './membership', './commands', './format'],
          modelReplacement: ['../domain/projectRecords', '../domain/projectRecordFields', '../domain/projectGraphSupport',
            '../domain/values', '../scene/projectProvider', '../scene/resolve', './membership', './records', './commands', './format'],
          captionCandidates: ['../scene/projectProvider', '../domain/projectMutableFields', '../domain/projectRecordFields', './membership', './format'],
          captionDeletion: ['../scene/commands', '../scene/projectProvider', '../domain/projectRecordFields', './membership', './format', './commands', '../domain/projectMutableFields', '../domain/values'],
          assetDeletion: ['../scene/commands', '../scene/projectProvider', '../domain/projectCandidates', '../domain/projectRecordFields', '../domain/projectGraphSupport', './membership', './format', './commands'],
          sceneAuthoring: ['../scene/commands', '../scene/projectProvider', '../domain/projectRecordFields', '../domain/projectMutableFields',
            '../domain/projectRecords', '../domain/values', './membership', './commands', './format'],
          viewResolution: ['../scene/projectProvider', '../domain/projectRecordFields', '../domain/projectMutableFields',
            '../domain/values', './membership', './commands', './format'],
          contentEvidence: ['../domain/projectContentChecks', '../domain/values', '../platform/fs', './format', './persistence'],
          blobStream: ['../nativeGs/sha256'],
          blobStore: ['../platform/fs', '../platform/projectLock', '../domain/projectRecordFields', '../domain/values', './format', './persistence', './blobStream'],
          blobInventory: ['../domain/projectContentChecks', '../domain/values', './contentEvidence', './format', './blobStore'],
          session: ['@automerge/automerge/slim', '../platform/fs', '../domain/values', '../domain/projectContentChecks', '../domain/captionText', '../scene/projectProvider',
            './format', './source', './repository', './journal', './persistence', './commands', './remote', './packageRemote', '../projectPackage/receiveJob', '../projectPackage/manifest', '../projectPackage/reviewEditControls',
            './blobStore', '../projectPackage/outputJob', '../projectPackage/contributionOutputJob', '../projectPackage/backupOutputJob', '../projectPackage/backupSource', '../projectPackage/cleanOutputJob', '../projectPackage/reviewOutputJob', '../projectPackage/reviewSource', '../projectPackage/reviewSelection', '../projectPackage/cleanInputJob', '../projectPackage/cleanSource', '../projectPackage/cleanRecords', '../projectPackage/contributionSource', '../projectPackage/outputJobs', '../projectPackage/workspaceBases', '../projectPackage/workspaceSource', '../projectPackage/protectedInventory', '../projectPackage/contract', '../projectPackage/contributionReceiveJob', '../projectPackage/contributionEvidence', '../projectPackage/receiveJobs', '../projectPackage/backupRestoreJob'],
          startupScene: ['../scene/projectProvider', '../domain/projectRecords', '../domain/projectRecordFields', './membership', './format'],
          commands: ['../domain/values', '../domain/projectMutableFields', '../domain/projectRecordFields', '../domain/projectRecords', '../domain/projectGraphSupport',
            '../domain/materialIntent', '../domain/captionText', '../scene/projectMaterialRoutes', '../scene/commands', '../scene/resolve', '../scene/types', '../scene/projectProvider', './format', './membership', './records', './assetStatus', './modelMembership', './captionCandidates', './sceneAuthoring', './viewResolution', './captionDeletion', './assetDeletion', './startupScene', './modelAddition', './modelReplacement'],
        };
        const name = path.split(/[\\/]/).at(-1)!.replace(/\.ts$/, '');
        expect(imports.every(p => byFile[name]!.includes(p!)), path).toBe(true);
        expect(source, path).not.toMatch(/\b(fetch|indexedDB|localStorage|sessionStorage|serviceWorker)\b/);
      } else if (/[\\/]harness[\\/]projectScene[\\/]metadata(Fixture|Storage|Host|Browser|Intent|Views|Materials|Media|Models|ModelFacts|ModelRecords|ReceiveControls|ConflictControls|CaptionLifecycleControls|MembershipControls|AssetStatusControls|Workspace|StartupControls)\.ts$/.test(path)) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        const byFile: Record<string, string[]> = {
          metadataFixture: ['./fixture', './modelFixture', './modelClosure', '../../domain/values', '../../scene/projectProvider',
            '../../scene/types', '../../projectMetadata/source', '../../projectMetadata/persistence', './metadataViews', './metadataMaterials', './metadataMedia', './mediaHistory', './metadataModels', './modelTypes'],
          metadataStorage: ['../../platform/fs', '../../domain/projectContentChecks', '../../domain/values', '../../projectMetadata/contentEvidence',
            '../../projectMetadata/source', '../../projectMetadata/persistence', '../../projectMetadata/session', './metadataFixture', './mediaHistory', './modelClosure', '../../domain/projectCandidates', './metadataModelRecords'],
          metadataHost: ['../../platform/fs', '../../platform/projectLock', '../../projectMetadata/session', '../../projectMetadata/repository',
            '../../projectMetadata/persistence', '../../projectMetadata/journal', './metadataFixture', './metadataStorage', './historyProjection', './metadataIntent', '../../projectMetadata/remote', './fixture', '../../projectMetadata/commands', '../../scene/projectProvider', './modelClosure', '../../domain/values', './metadataModelFacts', '../../projectMetadata/captionDeletion', '../../projectMetadata/assetDeletion'],
          metadataReceiveControls: ['./metadataHost', './session', './metadataConflictControls', './metadataMembershipControls', './metadataAssetStatusControls', './metadataCaptionLifecycleControls'],
          metadataCaptionLifecycleControls: ['./savedHost', './session', '../../projectMetadata/captionDeletion', '../../projectMetadata/persistence', '../../scene/types'],
          metadataAssetStatusControls: ['three', './savedHost', './session', '../../projectMetadata/assetStatus', './modelFixture', './modelCandidatePreview'],
            // Same approved conflict form: complete Scene/View candidates and pure input validation only.
          metadataConflictControls: ['./savedHost', './session', '../../projectMetadata/captionCandidates', '../../scene/types',
              '../../projectMetadata/sceneAuthoring', '../../domain/values', '../../projectMetadata/viewResolution'],
          metadataMembershipControls: ['./savedHost', './session', '../../projectMetadata/membership', '../../projectMetadata/persistence',
            '../../projectMetadata/modelMembership', './metadataModelRecords', './modelClosure', '../../domain/values'],
          metadataIntent: ['../../core/json', '../../domain/values', '../../domain/captionText', '../../scene/types', '../../projectMetadata/commands', './fixture', './metadataFixture', './mediaHistory', './modelClosure', './modelHistory'],
          metadataModels: ['../../scene/projectProvider', './modelClosure', './modelFixture', '../../projectMetadata/records', '../../projectMetadata/format', './metadataModelRecords'],
          metadataModelRecords: ['../../domain/projectRecords', '../../domain/projectRecordFields', '../../domain/projectGraphSupport', '../../domain/values', './modelClosure', './modelFixture'],
          metadataModelFacts: ['../../scene/projectProvider', '../../projectMetadata/session', '../../projectMetadata/persistence', '../../domain/projectContentChecks',
            './metadataFixture', './metadataStorage', './metadataModelRecords'],
          metadataMedia: ['../../scene/projectProvider', '../../scene/types', '../../domain/projectGraphSupport', './historyPort', './mediaHistory'],
          metadataViews: ['../../scene/projectProvider', '../../scene/types', '../../domain/projectGraphSupport', '../../domain/values', './viewHistory', './historyPort'],
          metadataMaterials: ['../../scene/projectProvider', '../../scene/projectMaterialRoutes', '../../scene/types', '../../domain/projectGraphSupport',
            '../../domain/materialIntent', './materialHistory', './historyPort'],
          // Same approved development entry, including recovery before a Scene/session exists.
          metadataWorkspace: ['./metadataHost', './session', './workspace', './viewportHost', './metadataReceiveControls', './metadataStartupControls', '../../scene/resolve', './savedHost'],
          metadataStartupControls: ['./savedHost', './session', './acknowledgment', '../../projectMetadata/startupScene'],
          metadataBrowser: ['./browserMetadataStorage',
            '../../platform/opfs', '../../platform/projectLock', './metadataHost', './viewport', './metadataWorkspace'],
        };
        const name = path.split(/[\\/]/).at(-1)!.replace(/\.ts$/, '');
        expect(imports.every(p => byFile[name]!.includes(p!)), path).toBe(true);
        if (name !== 'metadataBrowser') expect(source, path).not.toMatch(/\b(fetch|indexedDB|localStorage|sessionStorage|serviceWorker)\b/);
      } else if (/[\\/]ui[\\/]projectScene[\\/]/.test(path)) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        // 05 §13.3 permits the existing side-effect-free presentation helper,
        // not the Native controller/schema runtime or a general Native dependency.
        const shared = ['../../scene/types', '../../domain/captionText', '../../domain/values', '../../domain/materialIntent', '../../nativeGs/backgroundColor'];
        expect(imports.every(p => p?.startsWith('./') || shared.includes(p!)), path).toBe(true);
      } else if (/[\\/]harness[\\/]projectScene[\\/](fixture|session|workspace|entry|historyPort|historyProjection|teamWorkspace|modelFixture|modelClosure|modelHistory|developmentControls|membershipResolution|viewport|viewportHost|viewportModel|pinParent|viewHistory|viewSession|materialHistory|materialSession|materialReview|mediaHistory|mediaSession|mediaControls|mediaPresentation)\.ts$/.test(path)) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        const permitted = ['../../scene/types', '../../scene/commands', '../../scene/resolve',
          '../../ui/projectScene/navigationState', '../../ui/projectScene/navigationControls',
          '../../ui/projectScene/captionListState', '../../ui/projectScene/captionListControls',
          '../../ui/projectScene/captionDetailState', '../../ui/projectScene/captionDetailControls',
          '../../ui/projectScene/captionWindowState', '../../ui/projectScene/captionWindowControls',
          '../../ui/projectScene/captionIncludeState', '../../ui/projectScene/captionIncludeControls',
          '../../ui/projectScene/pinModeState', '../../ui/projectScene/pinModeControls',
          '../../ui/projectScene/modelListState', '../../ui/projectScene/modelListControls'];
        if (/[\\/](viewport(?:Model)?|pinParent)\.ts$/.test(path)) permitted.push('three');
        if (path.replaceAll('\\', '/').endsWith('/viewport.ts')) permitted.push('three/addons/controls/OrbitControls.js', '../../viewer/hardChroma');
        if (/[\\/](viewportHost|viewSession)\.ts$/.test(path)) permitted.push('../../ui/projectScene/viewControls', '../../ui/projectScene/viewState',
          '../../ui/projectScene/viewAuthoringState', '../../ui/projectScene/viewAuthoringControls');
        // V04 mounts the existing pure background planner in this host only.
        // Native presentation stays behind the UI boundary; no controller/storage import.
        if (path.replaceAll('\\', '/').endsWith('/viewSession.ts')) permitted.push('../../ui/projectScene/viewBackgroundState');
        if (path.replaceAll('\\', '/').endsWith('/viewHistory.ts')) permitted.push('../../domain/values');
        if (path.replaceAll('\\', '/').endsWith('/mediaHistory.ts')) permitted.push('../../domain/values');
        if (path.replaceAll('\\', '/').endsWith('/historyPort.ts')) {
          // Evidence sidecar type only; this does not admit a runtime provider.
          const typeOnly = "import type { AtomicHistory } from '../../domain/atomicHistory';";
          expect(source).toContain(typeOnly);
          expect(source.replace(typeOnly, '')).not.toContain('../../domain/atomicHistory');
          permitted.push('../../domain/atomicHistory');
        }
        if (/[\\/](materialHistory|materialSession|viewportModel)\.ts$/.test(path)) permitted.push('../../domain/materialIntent');
        if (path.replaceAll('\\', '/').endsWith('/materialHistory.ts')) permitted.push('../../domain/materialRecords');
        if (/[\\/](materialSession|session)\.ts$/.test(path)) permitted.push('../../ui/projectScene/materialState');
        if (path.replaceAll('\\', '/').endsWith('/workspace.ts')) permitted.push('../../ui/projectScene/materialControls');
        // I04 adds UI-only verified-image presentation, not a binary/storage reader.
        if (/[\\/](workspace|viewportHost|mediaControls|mediaPresentation)\.ts$/.test(path)) permitted.push('../../ui/projectScene/mediaPreview');
        if (path.replaceAll('\\', '/').endsWith('/modelClosure.ts')) {
          // Exact fixture canonicalization/hash helpers only; no Native controller or storage.
          permitted.push('../../domain/values', '../../nativeGs/sha256');
        }
        if (path.replaceAll('\\', '/').endsWith('/entry.ts')) {
          permitted.push('../../../poc/scene-history/development-browser');
          expect(source).toContain("if (import.meta.env.DEV) {");
        }
        expect(imports.every(p => p?.startsWith('./') || permitted.includes(p!)), path).toBe(true);
        expect(source, path).not.toMatch(/\b(fetch|indexedDB|localStorage|sessionStorage|serviceWorker)\b/);
      } else if (path.replaceAll('\\', '/') === 'src/dev-entry.ts') {
        expect(source.replaceAll('\r\n', '\n')).toContain("} else if (mode === 'project-scene') {\n  await import('./harness/projectScene/entry');");
        expect([...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]*\/(?:scene|domain|projectScene)\/[^'"]+)['"]/g)].map(m => m[1]))
          .toEqual(['./harness/projectScene/entry']);
      } else expect(source).not.toMatch(/(?:from\s+|import\s*\()['"][^'"]*\/(scene|domain|projectScene)\//);
    }
    const backgroundHelper = readFileSync('src/nativeGs/backgroundColor.ts', 'utf8');
    expect(backgroundHelper).not.toMatch(/^\s*import(?!\s+type\b)/m);
    expect(backgroundHelper).not.toMatch(/\bimport\s*\(|\bexport\s+[^;]*\bfrom\s+['"]/);
  });
});
