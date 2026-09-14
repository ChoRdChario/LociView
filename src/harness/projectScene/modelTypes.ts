import type { JsonObject } from '../../domain/values';
import type { AssetProjection } from '../../scene/types';
import type { FixtureModelClosure, FixturePlacement } from './modelClosure';
import type { MediaFileSelection } from './mediaHistory';

export interface ModelFileAddition { readonly sceneId: string; readonly assetId: string; readonly file: MediaFileSelection }
export interface ModelFileReplacement extends ModelFileAddition { readonly expectedBindingId: string }
export interface ModelReplacementTarget { readonly token: string; readonly sceneId: string; readonly assetId: string; readonly expectedBindingId: string }

/** Saved read projection only. Complete immutable records remain attached, not reconstructed as fixtures. */
export interface ValidationModelClosure {
  readonly shape: 'saved-glb';
  readonly assetFrame: { readonly id: string };
  readonly representationFrame: { readonly id: string };
  readonly binding: JsonObject & { readonly id: string; readonly payloadDigest: string; readonly assetId: string; readonly assetRevisionId: string;
    readonly assetToProject: FixturePlacement; readonly parentBindingId?: string };
  readonly revision: JsonObject & { readonly id: string; readonly payloadDigest: string; readonly assetId: string; readonly representationIds: readonly string[];
    readonly anchorCompatibilityClasses: readonly { readonly id: string; readonly targetVariantFamilyIds: readonly string[] }[] };
  readonly representation: JsonObject & { readonly id: string; readonly payloadDigest: string; readonly assetId: string; readonly variantFamilyId: string;
    readonly representationFrameId: string; readonly representationToAsset: FixturePlacement;
    readonly logicalBoundsAsset: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
    readonly materialCatalog: { readonly layoutId: string; readonly slots: readonly { readonly logicalMaterialSlotId: string;
      readonly sourceLocator: JsonObject; readonly sourceSemantics: JsonObject }[] } };
}
export type DisplayModelClosure = FixtureModelClosure | ValidationModelClosure;
/** Read-only rendering facts, not a Binding, Revision or metadata source. */
export interface ReadonlyRenderModel {
  readonly shape: 'render-glb'; readonly key: string; readonly assetId: string; readonly assetToProject: FixturePlacement;
  readonly representation: JsonObject & { readonly id: string; readonly assetId: string; readonly variantFamilyId: string;
    readonly representationToAsset: FixturePlacement;
    readonly logicalBoundsAsset: ValidationModelClosure['representation']['logicalBoundsAsset'];
    readonly materialCatalog: ValidationModelClosure['representation']['materialCatalog'] };
}
export const renderModel = (model: ValidationModelClosure | ReadonlyRenderModel): ReadonlyRenderModel => model.shape === 'render-glb' ? model :
  ({ shape: 'render-glb', key: model.binding.id, assetId: model.binding.assetId, assetToProject: model.binding.assetToProject, representation: model.representation });
export const renderOwner = (model: DisplayModelClosure | ReadonlyRenderModel) => model.shape === 'render-glb' ? model.assetId : model.binding.assetId;
export const renderPlacement = (model: DisplayModelClosure | ReadonlyRenderModel) => model.shape === 'render-glb' ? model.assetToProject : model.binding.assetToProject;
/** Explicit placement edit; no model-content introduction or fixture reconstruction. */
export interface ModelPlacementCommand {
  readonly sceneId: string; readonly assetId: string; readonly expectedBindingId: string;
  readonly bindingId: string; readonly placement: FixturePlacement;
}
export interface DisplayModelVersion {
  readonly assetId: string; readonly label: string; readonly projection: AssetProjection;
  readonly families: readonly { readonly id: string; readonly name: string; readonly compatibilityId: string }[];
  readonly closure: DisplayModelClosure;
}
