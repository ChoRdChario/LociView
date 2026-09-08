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

  it('isolates Scene core/UI from ordinary entries; only the exact synthetic development host may connect them', () => {
    const walk = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
      const name = join(path, entry.name); return entry.isDirectory() ? walk(name) : [name];
    });
    for (const path of walk('src').filter(p => /\.(ts|tsx|js)$/.test(p))) {
      const source = readFileSync(path, 'utf8');
      if (/[\\/](scene|domain)[\\/]/.test(path)) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        expect(imports.every(p => p?.startsWith('./') || p === '../domain/values')).toBe(true);
      } else if (/[\\/]ui[\\/]projectScene[\\/]/.test(path)) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        // 05 §13.3 permits the existing side-effect-free presentation helper,
        // not the Native controller/schema runtime or a general Native dependency.
        const shared = ['../../scene/types', '../../domain/captionText', '../../domain/values', '../../domain/materialIntent', '../../nativeGs/backgroundColor'];
        expect(imports.every(p => p?.startsWith('./') || shared.includes(p!)), path).toBe(true);
      } else if (/[\\/]harness[\\/]projectScene[\\/](fixture|session|workspace|entry|historyPort|historyProjection|teamWorkspace|modelFixture|modelClosure|modelHistory|developmentControls|membershipResolution)\.ts$/.test(path)) {
        const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(m => m[2]);
        const permitted = ['../../scene/types', '../../scene/commands', '../../scene/resolve',
          '../../ui/projectScene/navigationState', '../../ui/projectScene/navigationControls',
          '../../ui/projectScene/captionListState', '../../ui/projectScene/captionListControls',
          '../../ui/projectScene/captionDetailState', '../../ui/projectScene/captionDetailControls',
          '../../ui/projectScene/captionIncludeState', '../../ui/projectScene/captionIncludeControls',
          '../../ui/projectScene/pinModeState', '../../ui/projectScene/pinModeControls',
          '../../ui/projectScene/modelListState', '../../ui/projectScene/modelListControls'];
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
