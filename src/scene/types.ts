/** Pure Scene domain, spec 05 §13.1. Not a wire schema or a persistence adapter. */
export type Field<T> = Readonly<{ kind: 'value'; value: T }> |
  Readonly<{ kind: 'unresolved'; reason: 'conflict' | 'missing' | 'invalid' }>;
export const value = <T>(item: T): Field<T> => ({ kind: 'value', value: item });
export type Lifecycle = Readonly<{ state: 'active'; eventId: string;
  reason?: 'initial' | 'restore' | 'migrationResolution' | 'conflictResolution' }> |
  Readonly<{ state: 'deleted'; eventId: string;
    reason: 'userDelete' | 'replacement' | 'migrationResolution' | 'conflictResolution' }>;
export interface Entity { readonly id: string; readonly lifecycle: Field<Lifecycle> }
export interface Scene extends Entity {
  readonly name: Field<string>;
  readonly orderKey: Field<string>;
  readonly defaultViewId: Field<string | null>;
}
export interface Membership extends Entity {
  readonly sceneId: string;
  readonly resourceId: string;
  readonly orderKey: Field<string>;
}
export type Table<T> = Readonly<Record<string, T>>;
export interface SceneState {
  /** Opaque token for this complete read snapshot, not a timestamp or saved acknowledgement. */
  readonly token: string;
  readonly defaultSceneId: Field<string>;
  readonly scenes: Table<Scene>;
  readonly assetMemberships: Table<Membership>;
  readonly captionMemberships: Table<Membership>;
}
export interface AssetProjection {
  readonly assetFrameId: string;
  readonly bindingId: string;
  readonly revisionId: string;
  readonly representationIds: readonly string[];
  readonly anchorCompatibilityIds: readonly string[];
}
export interface Asset extends Entity { readonly projection: Field<AssetProjection> }
export type Anchor = Readonly<{ kind: 'asset'; assetId: string; assetFrameId: string;
  positionAsset: readonly [number, number, number]; authoredAnchorCompatibilityId: string;
  authoredAssetRevisionId?: string }> |
  Readonly<{ kind: 'project'; projectFrameId: string; positionProject: readonly [number, number, number] }>;
export interface Caption extends Entity {
  readonly title: Field<string>;
  readonly body: Field<string>;
  readonly anchor: Field<Anchor>;
}
export interface View extends Entity {
  readonly sceneId: string;
  readonly projectFrameId: string;
  /** Validated atomic application values; this core never parses or renders them. */
  readonly camera: Field<unknown>;
  readonly background: Field<unknown>;
}
export interface MaterialTarget {
  readonly assetId: string;
  readonly variantFamilyId: string;
  readonly materialLayoutId: string;
  readonly logicalMaterialSlotId: string;
}
export interface Material extends Entity {
  readonly routing: Field<Readonly<{ scope: { readonly kind: 'project' } |
    { readonly kind: 'scene'; readonly sceneId: string }; target: MaterialTarget }>>;
  /** Whole validated appearance/compositing intent, never a nested merge. */
  readonly intent: Field<unknown>;
}
/**
 * Provider contract: same snapshot token as SceneState; complete conflict sets
 * mapped to unresolved, never materialized winners. Validate full immutable
 * resource closures, anchor frames/numbers, view values and material targets
 * upstream. An unavailable blob/binding/frame/partition means unresolved asset
 * projection. Unknown unsafe fields must not be presented here as resolved.
 * The types below are a read projection, NOT an untrusted JSON admission API.
 */
export interface SceneResources {
  readonly token: string;
  readonly projectFrameId: string;
  readonly assets: Table<Asset>;
  readonly captions: Table<Caption>;
  readonly views: Table<View>;
  readonly materials: Table<Material>;
}
export interface Issue {
  readonly code: 'missing' | 'deleted' | 'conflict' | 'invalid' | 'orphan' |
    'duplicate' | 'hidden-owner' | 'needs-review';
  readonly entityId: string;
  readonly field: string;
  readonly action: 'repair' | 'resolve' | 'show-model' | 'review-anchor';
}
export interface CaptionProjection {
  readonly captionId: string;
  readonly membershipId: string;
  readonly title: Field<string>;
  readonly body: Field<string>;
  readonly anchor: Field<Anchor>;
  readonly marker: 'visible' | 'suppressed' | 'needsReview';
}
export interface Composition {
  readonly sceneId: string;
  readonly name: Field<string>;
  readonly assets: readonly Readonly<{ assetId: string; membershipId: string; projection: AssetProjection }>[];
  readonly captions: readonly CaptionProjection[];
  readonly materials: readonly Readonly<{ overrideId: string; target: MaterialTarget; intent: unknown }>[];
  readonly entryView?: Readonly<{ viewId: string; camera: Field<unknown>; background: Field<unknown> }>;
}
export type SceneResult = Readonly<{ kind: 'ready'; composition: Composition; issues: readonly Issue[] }> |
  Readonly<{ kind: 'blocked'; issues: readonly Issue[] }>;
