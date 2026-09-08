import { value, type Field, type Lifecycle, type Membership, type Scene, type SceneResources, type SceneState } from '../../scene/types';
import type { SyntheticModelVersion } from './modelFixture';
import type { ViewData } from './viewHistory';
import type { MaterialData } from './materialHistory';
import type { MediaData } from './mediaHistory';

// Fixed synthetic identities, NOT a source-file importer or a persistent Project schema.
const id = (prefix: string, n: number) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
export const fixtureIds = Object.freeze({ project: id('prj', 1), overview: id('scn', 1),
  detail: id('scn', 2), structure: id('ast', 1), equipment: id('ast', 2),
  shared: id('cap', 1), second: id('cap', 2) });
export interface SyntheticProject {
  readonly state: SceneState;
  readonly resources: SceneResources;
  readonly modelNames: Readonly<Record<string, string>>;
  readonly colors: Readonly<Record<string, Field<string>>>;
  /** Known fixture owner/frame template; copied resources still have independent editable cells. */
  readonly captionTemplates: Readonly<Record<string, string>>;
  readonly modelVersions?: readonly SyntheticModelVersion[];
  readonly viewData?: ViewData;
  readonly materialData?: MaterialData;
  readonly mediaData?: MediaData;
}
export function freezeSynthetic<T>(item: T): T {
  if (item && typeof item === 'object' && !Object.isFrozen(item)) {
    for (const child of Object.values(item)) freezeSynthetic(child);
    Object.freeze(item);
  }
  return item;
}
export function createSyntheticProject(): SyntheticProject {
  const f = fixtureIds;
  const life = value<Lifecycle>({ state: 'active', eventId: id('evt', 1), reason: 'initial' });
  const scene = (key: string, name: string, order: string): Scene => ({ id: key,
    lifecycle: life, name: value(name), orderKey: value(order), defaultViewId: value(null) });
  const edge = (key: string, sceneId: string, resourceId: string, order = 'A'): Membership =>
    ({ id: key, lifecycle: life, sceneId, resourceId, orderKey: value(order) });
  const state: SceneState = { token: 'synthetic-initial', defaultSceneId: value(f.overview),
    scenes: { [f.overview]: scene(f.overview, '全体', 'A'), [f.detail]: scene(f.detail, '設備の確認', 'B') },
    assetMemberships: { [id('sam', 1)]: edge(id('sam', 1), f.overview, f.structure),
      [id('sam', 2)]: edge(id('sam', 2), f.overview, f.equipment, 'B'),
      [id('sam', 3)]: edge(id('sam', 3), f.detail, f.equipment) },
    captionMemberships: { [id('scm', 1)]: edge(id('scm', 1), f.overview, f.shared),
      [id('scm', 2)]: edge(id('scm', 2), f.detail, f.shared),
      [id('scm', 3)]: edge(id('scm', 3), f.overview, f.second, 'B') } };
  const asset = (key: string, n: number) => ({ id: key, lifecycle: life,
    projection: value({ assetFrameId: id('frm', n), bindingId: id('bnd', n), revisionId: id('rev', n),
      representationIds: [id('rep', n)], anchorCompatibilityIds: [id('cmp', n)] }) });
  const caption = (key: string, owner: string, n: number, title: string, body: string) => ({ id: key,
    lifecycle: life, title: value(title), body: value(body), anchor: value({ kind: 'asset' as const,
      assetId: owner, assetFrameId: id('frm', n), positionAsset: [0, 0, 0] as const,
      authoredAnchorCompatibilityId: id('cmp', n), authoredAssetRevisionId: id('rev', n) }) });
  return freezeSynthetic({ state, resources: { token: state.token, projectFrameId: id('frm', 3),
    assets: { [f.structure]: asset(f.structure, 1), [f.equipment]: asset(f.equipment, 2) },
    captions: { [f.shared]: caption(f.shared, f.equipment, 2, '設備の確認箇所', 'この記録は2つのシーンで共有しています。'),
      [f.second]: caption(f.second, f.structure, 1, '入口の記録', '全体シーンだけに含まれる記録です。') },
    views: {}, materials: {} }, modelNames: { [f.structure]: '建物', [f.equipment]: '設備' },
    colors: { [f.shared]: value('#a08045'), [f.second]: value('#57758b') },
    captionTemplates: { [f.shared]: f.shared, [f.second]: f.second } });
}
