import type { Asset, Caption, CaptionProjection, Entity, Field, Issue, Material,
  MaterialTarget, Membership, SceneResources, SceneResult, SceneState, Table } from './types';

export function issue(issues: Issue[], code: Issue['code'], entityId: string, field: string,
  action: Issue['action'] = code === 'conflict' || code === 'duplicate' ? 'resolve' : 'repair'): void {
  issues.push({ code, entityId, field, action });
}
export function read<T>(field: Field<T>, id: string, key: string, issues: Issue[]): T | undefined {
  if (field.kind === 'value') return field.value;
  issue(issues, field.reason, id, key); return undefined;
}
export function active(entity: Entity | undefined, id: string, issues: Issue[]): boolean {
  if (!entity) { issue(issues, 'missing', id, 'entity'); return false; }
  if (entity.id !== id) { issue(issues, 'invalid', id, 'id'); return false; }
  const life = read(entity.lifecycle, id, 'lifecycle', issues);
  if (!life) return false;
  if (life.state === 'deleted') { issue(issues, 'deleted', id, 'lifecycle'); return false; }
  return true;
}
export function sameSnapshot(state: SceneState, resources: SceneResources): void {
  if (!state.token || state.token !== resources.token) throw new Error('Scene snapshot token mismatch');
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const isDeleted = (entity: Entity) => entity.lifecycle.kind === 'value' && entity.lifecycle.value.state === 'deleted';

/** Unresolved lifecycle/order entries reserve their semantic key, never allow a peer winner. */
export function memberships(state: SceneState, table: Table<Membership>, sceneId: string,
  targets: Table<Asset> | Table<Caption>, issues: Issue[]): Membership[] {
  const groups = new Map<string, Membership[]>();
  for (const [id, edge] of Object.entries(table).sort(([a], [b]) => compare(a, b))) {
    if (edge.sceneId !== sceneId || isDeleted(edge)) continue;
    if (edge.id !== id) { issue(issues, 'invalid', id, 'id'); }
    const group = groups.get(edge.resourceId) ?? [];
    group.push(edge); groups.set(edge.resourceId, group);
  }
  const selected: { edge: Membership; order: string }[] = [];
  for (const [resourceId, group] of groups) {
    if (group.length !== 1) {
      for (const edge of group) issue(issues, 'duplicate', edge.id, 'membership');
      continue;
    }
    const edge = group[0]!;
    if (table[edge.id] !== edge || !active(edge, edge.id, issues)) continue;
    const order = read(edge.orderKey, edge.id, 'orderKey', issues);
    if (order === undefined) continue;
    if (!/^[0-9A-Za-z]{1,64}$/.test(order)) { issue(issues, 'invalid', edge.id, 'orderKey'); continue; }
    if (!active(targets[resourceId], resourceId, issues)) {
      issue(issues, 'orphan', edge.id, 'resourceId'); continue;
    }
    selected.push({ edge, order });
  }
  return selected.sort((a, b) => compare(a.order, b.order) || compare(a.edge.id, b.edge.id)).map(x => x.edge);
}

export function chooseStartupScene(state: SceneState, retainedId?: string):
  { sceneId?: string; issues: readonly Issue[] } {
  if (retainedId && active(state.scenes[retainedId], retainedId, [])) return { sceneId: retainedId, issues: [] };
  const issues: Issue[] = [];
  const id = read(state.defaultSceneId, 'project', 'defaultSceneId', issues);
  return id !== undefined && active(state.scenes[id], id, issues) ? { sceneId: id, issues } : { issues };
}

const targetKey = (target: MaterialTarget) => JSON.stringify([target.assetId, target.variantFamilyId,
  target.materialLayoutId, target.logicalMaterialSlotId]);
function resolveMaterials(resources: SceneResources, sceneId: string, assetIds: Set<string>, issues: Issue[]) {
  const groups = new Map<string, { target: MaterialTarget; project: Material[]; scene: Material[] }>();
  for (const [id, material] of Object.entries(resources.materials).sort(([a], [b]) => compare(a, b))) {
    if (isDeleted(material)) continue;
    const routing = read(material.routing, id, 'routing', issues);
    if (!routing) continue;
    if (routing.scope.kind === 'scene' && routing.scope.sceneId !== sceneId) continue;
    if (!assetIds.has(routing.target.assetId)) continue;
    const key = targetKey(routing.target);
    const group = groups.get(key) ?? { target: routing.target, project: [], scene: [] };
    // Lifecycle conflicts reserve the key too; don't let another record win.
    group[routing.scope.kind].push(material); groups.set(key, group);
    if (material.id !== id) issue(issues, 'invalid', id, 'id');
  }
  const result: { overrideId: string; target: MaterialTarget; intent: unknown }[] = [];
  for (const [, group] of [...groups].sort(([a], [b]) => compare(a, b))) {
    const resolveScope = (items: Material[]) => {
      if (items.length > 1) {
        for (const item of items) issue(issues, 'duplicate', item.id, 'material');
        return undefined;
      }
      const item = items[0];
      if (!item || resources.materials[item.id] !== item || !active(item, item.id, issues)) return undefined;
      const intent = read(item.intent, item.id, 'intent', issues);
      return item.intent.kind === 'value' ? { overrideId: item.id, target: group.target, intent } : undefined;
    };
    const project = resolveScope(group.project); const scene = resolveScope(group.scene);
    // Invalid override applies none at that scope; valid lower scope/source survives.
    const selected = scene ?? project;
    if (selected) result.push(selected);
  }
  return result;
}

/** One complete snapshot in; no previous Scene, viewer or UI state is accepted. */
export function resolveScene(state: SceneState, resources: SceneResources, sceneId: string): SceneResult {
  sameSnapshot(state, resources);
  const issues: Issue[] = [];
  const scene = state.scenes[sceneId];
  if (!active(scene, sceneId, issues)) return { kind: 'blocked', issues };
  const assets: { assetId: string; membershipId: string; projection: import('./types').AssetProjection }[] = [];
  for (const edge of memberships(state, state.assetMemberships, sceneId, resources.assets, issues)) {
    const asset = resources.assets[edge.resourceId]!;
    const projection = read(asset.projection, asset.id, 'activeBinding', issues);
    if (projection) assets.push({ assetId: asset.id, membershipId: edge.id, projection });
  }
  const assetIds = new Set(assets.map(a => a.assetId));
  const captions: CaptionProjection[] = [];
  for (const edge of memberships(state, state.captionMemberships, sceneId, resources.captions, issues)) {
    const caption = resources.captions[edge.resourceId]!;
    read(caption.title, caption.id, 'title', issues); read(caption.body, caption.id, 'body', issues);
    const anchor = read(caption.anchor, caption.id, 'anchor', issues);
    let marker: CaptionProjection['marker'] = 'suppressed';
    if (anchor?.kind === 'project') {
      if (anchor.projectFrameId === resources.projectFrameId) marker = 'visible';
      else issue(issues, 'invalid', caption.id, 'projectFrameId');
    } else if (anchor?.kind === 'asset') {
      const owner = resources.assets[anchor.assetId];
      if (!active(owner, anchor.assetId, issues)) issue(issues, 'orphan', caption.id, 'anchor');
      else {
        const projection = read(owner!.projection, owner!.id, 'activeBinding', issues);
        if (projection && projection.assetFrameId !== anchor.assetFrameId) issue(issues, 'invalid', caption.id, 'assetFrameId');
        else if (projection) {
          const compatible = projection.anchorCompatibilityIds.includes(anchor.authoredAnchorCompatibilityId);
          if (!compatible) issue(issues, 'needs-review', caption.id, 'anchor', 'review-anchor');
          if (assetIds.has(anchor.assetId)) marker = compatible ? 'visible' : 'needsReview';
          else issue(issues, 'hidden-owner', caption.id, 'anchor', 'show-model');
        }
      }
    }
    captions.push({ captionId: caption.id, membershipId: edge.id, title: caption.title,
      body: caption.body, anchor: caption.anchor, marker });
  }
  read(scene!.name, sceneId, 'name', issues);
  const defaultView = read(scene!.defaultViewId, sceneId, 'defaultViewId', issues);
  let entryView: import('./types').Composition['entryView'];
  if (defaultView) {
    const view = resources.views[defaultView];
    if (active(view, defaultView, issues)) {
      if (view!.sceneId !== sceneId || view!.projectFrameId !== resources.projectFrameId)
        issue(issues, 'invalid', defaultView, 'scene/frame');
      else {
        read(view!.camera, defaultView, 'camera', issues); read(view!.background, defaultView, 'background', issues);
        entryView = { viewId: defaultView, camera: view!.camera, background: view!.background };
      }
    }
  }
  return { kind: 'ready', composition: { sceneId, name: scene!.name, assets, captions,
    materials: resolveMaterials(resources, sceneId, assetIds, issues), ...(entryView ? { entryView } : {}) }, issues };
}
