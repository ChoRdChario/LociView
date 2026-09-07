import type { Entity, Field, Lifecycle, Membership, Scene, SceneResources, SceneState, Table } from './types';
import { value } from './types';
import { active, memberships, sameSnapshot } from './resolve';

type EdgeKind = 'asset' | 'caption';
export type SceneCommand =
  | { kind: 'initialize'; sceneId: string; name: string; orderKey: string;
      assets: readonly { assetId: string; membershipId: string; orderKey: string }[] }
  | { kind: 'create'; sceneId: string; sourceSceneId: string; activeSceneId: string;
      name: string; orderKey: string; membershipIds: readonly string[] }
  | { kind: 'rename'; sceneId: string; name: string }
  | { kind: 'setDefault'; sceneId: string }
  | { kind: 'setView'; sceneId: string; viewId: string | null }
  | { kind: 'include'; sceneId: string; resourceKind: EdgeKind; resourceId: string;
      membershipId: string; orderKey: string }
  | { kind: 'exclude'; resourceKind: EdgeKind; membershipId: string }
  | { kind: 'delete'; sceneId: string };

export class SceneCommandError extends Error {
  constructor(readonly code: 'invalid' | 'conflict' | 'missing' | 'deleted' | 'duplicate' | 'dependencies' | 'stale',
    readonly target: string) { super(`${code}: ${target}`); this.name = 'SceneCommandError'; }
}
const fail = (code: SceneCommandError['code'], target: string): never => { throw new SceneCommandError(code, target); };
const id = (text: string, prefix: string) => {
  if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(text)) fail('invalid', 'id');
};
const order = (text: string) => { if (!/^[0-9A-Za-z]{1,64}$/.test(text)) fail('invalid', 'orderKey'); };
const name = (text: string) => {
  if (!text.trim() || [...text].length > 256 || /[\u0000-\u001f\u007f]/u.test(text) ||
    [...text].some(c => c.length === 1 && /[\ud800-\udfff]/u.test(c))) fail('invalid', 'name');
};
function exact<T>(field: Field<T>, target: string): T {
  return field.kind === 'value' ? field.value : fail(field.reason, target);
}
function requireActive<T extends Entity>(table: Table<T>, key: string): T {
  const item = Object.hasOwn(table, key) ? table[key] : undefined;
  if (!item) return fail('missing', key);
  if (item.id !== key) return fail('invalid', key);
  if (exact(item.lifecycle, key).state !== 'active') return fail('deleted', key);
  return item;
}
function live(entity: Entity): boolean {
  // Unknown lifecycle may reference this target. Dependency deletion must wait.
  return entity.lifecycle.kind !== 'value' || entity.lifecycle.value.state !== 'deleted';
}
type SceneContent = Omit<SceneState, 'token'>;
export interface ScenePlan {
  readonly baseToken: string;
  /** Complete immutable domain result, NOT a saved/acknowledged snapshot. */
  readonly next: SceneContent;
}
function freeze<T>(input: T): T {
  if (input && typeof input === 'object') {
    for (const child of Object.values(input)) freeze(child);
    Object.freeze(input);
  }
  return input;
}

/** Caller supplies fresh CSPRNG IDs; no filenames/digests/time/order generate identity. */
export function planSceneCommand(state: SceneState, resources: SceneResources,
  command: SceneCommand, eventId: string): ScenePlan {
  sameSnapshot(state, resources); id(eventId, 'evt');
  // Clone only the small Scene-domain slice. Never clone models/media or Automerge history.
  const next = structuredClone({ defaultSceneId: state.defaultSceneId, scenes: state.scenes,
    assetMemberships: state.assetMemberships, captionMemberships: state.captionMemberships }) as {
      defaultSceneId: Field<string>; scenes: Record<string, Scene>;
      assetMemberships: Record<string, Membership>; captionMemberships: Record<string, Membership>;
    };
  const life = (state: 'active' | 'deleted'): Field<Lifecycle> => state === 'active'
    ? value({ state, eventId, reason: 'initial' }) : value({ state, eventId, reason: 'userDelete' });
  // Collision checks include tombstones and resources. Never reuse an identity.
  const fresh = (key: string, prefix: string) => {
    id(key, prefix);
    if ([next.scenes, next.assetMemberships, next.captionMemberships, resources.assets,
      resources.captions, resources.views, resources.materials].some(t => Object.hasOwn(t, key))) fail('duplicate', key);
  };
  const scene = (key: string) => { id(key, 'scn'); return requireActive(next.scenes, key); };
  const add = (kind: EdgeKind, sceneId: string, resourceId: string, membershipId: string, orderKey: string) => {
    scene(sceneId); id(resourceId, kind === 'asset' ? 'ast' : 'cap');
    requireActive<Entity>(kind === 'asset' ? resources.assets : resources.captions, resourceId);
    const table = kind === 'asset' ? next.assetMemberships : next.captionMemberships;
    fresh(membershipId, kind === 'asset' ? 'sam' : 'scm'); order(orderKey);
    if (Object.values(table).some(e => e.sceneId === sceneId && e.resourceId === resourceId && live(e)))
      fail('duplicate', resourceId);
    table[membershipId] = { id: membershipId, sceneId, resourceId, orderKey: value(orderKey), lifecycle: life('active') };
  };
  const create = (sceneId: string, sceneName: string, orderKey: string) => {
    fresh(sceneId, 'scn'); name(sceneName); order(orderKey);
    next.scenes[sceneId] = { id: sceneId, name: value(sceneName), orderKey: value(orderKey),
      defaultViewId: value(null), lifecycle: life('active') };
  };
  switch (command.kind) {
    case 'initialize': {
      if (Object.keys(state.scenes).length || Object.keys(state.assetMemberships).length ||
        Object.keys(state.captionMemberships).length) fail('invalid', 'already initialized');
      create(command.sceneId, command.name, command.orderKey);
      for (const initial of command.assets) add('asset', command.sceneId, initial.assetId, initial.membershipId, initial.orderKey);
      next.defaultSceneId = value(command.sceneId); break;
    }
    case 'create': {
      if (command.sourceSceneId !== command.activeSceneId) fail('invalid', 'sourceSceneId');
      scene(command.sourceSceneId);
      const issues: import('./types').Issue[] = [];
      const source = memberships(state, state.assetMemberships, command.sourceSceneId, resources.assets, issues);
      // A source with unresolved memberships must not silently become a partial copy.
      if (issues.length) fail('conflict', 'source memberships');
      if (source.length !== command.membershipIds.length) fail('invalid', 'membershipIds');
      create(command.sceneId, command.name, command.orderKey);
      // Fresh IDs have a different tie-break order. Give the NEW edges distinct
      // keys in source resolved order; leave every existing edge/key untouched.
      const width = Math.max(1, (source.length - 1).toString(36).length);
      source.forEach((edge, i) => add('asset', command.sceneId, edge.resourceId,
        command.membershipIds[i]!, i.toString(36).padStart(width, '0')));
      break;
    }
    case 'rename': {
      const current = scene(command.sceneId); exact(current.name, 'name'); name(command.name);
      next.scenes[current.id] = { ...current, name: value(command.name) }; break;
    }
    case 'setDefault':
      scene(command.sceneId); exact(state.defaultSceneId, 'defaultSceneId');
      next.defaultSceneId = value(command.sceneId); break;
    case 'setView': {
      const current = scene(command.sceneId); exact(current.defaultViewId, 'defaultViewId');
      if (command.viewId !== null) {
        id(command.viewId, 'view'); const view = requireActive(resources.views, command.viewId);
        if (view.sceneId !== current.id || view.projectFrameId !== resources.projectFrameId) fail('invalid', view.id);
        exact(view.camera, 'camera'); exact(view.background, 'background');
      }
      next.scenes[current.id] = { ...current, defaultViewId: value(command.viewId) }; break;
    }
    case 'include':
      add(command.resourceKind, command.sceneId, command.resourceId, command.membershipId, command.orderKey); break;
    case 'exclude': {
      id(command.membershipId, command.resourceKind === 'asset' ? 'sam' : 'scm');
      const table = command.resourceKind === 'asset' ? next.assetMemberships : next.captionMemberships;
      const edge = requireActive(table, command.membershipId); scene(edge.sceneId);
      const siblings = Object.values(table).filter(e => e.sceneId === edge.sceneId && e.resourceId === edge.resourceId && live(e));
      if (siblings.length !== 1) fail('conflict', edge.id); // Explicit conflict resolution is a different command.
      table[edge.id] = { ...edge, lifecycle: life('deleted') }; break;
    }
    case 'delete': {
      const current = scene(command.sceneId);
      if (exact(state.defaultSceneId, 'defaultSceneId') === current.id) fail('dependencies', 'defaultSceneId');
      if (Object.values(next.scenes).filter(s => active(s, s.id, [])).length <= 1) fail('dependencies', 'last scene');
      if (Object.values(next.assetMemberships).some(e => e.sceneId === current.id && live(e)) ||
        Object.values(next.captionMemberships).some(e => e.sceneId === current.id && live(e)) ||
        Object.values(resources.views).some(v => v.sceneId === current.id && live(v)) ||
        Object.values(resources.materials).some(m => live(m) && (m.routing.kind !== 'value' ||
          (m.routing.value.scope.kind === 'scene' && m.routing.value.scope.sceneId === current.id))))
        fail('dependencies', current.id);
      next.scenes[current.id] = { ...current, lifecycle: life('deleted') }; break;
    }
  }
  return freeze({ baseToken: state.token, next });
}

/** Pure preview only. The future write authority must revalidate and durably encode one causal change. */
export function previewScenePlan(state: SceneState, plan: ScenePlan, previewToken: string): SceneState {
  if (state.token !== plan.baseToken) fail('stale', plan.baseToken);
  if (!previewToken || previewToken === state.token) fail('invalid', 'previewToken');
  return freeze({ token: previewToken, ...plan.next });
}
