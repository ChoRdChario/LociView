import type { JsonObject } from '../../domain/values';
import type { AssetProjection } from '../../scene/types';
import type { FixtureModelClosure, FixturePlacement } from './modelClosure';

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
    readonly materialCatalog: { readonly layoutId: string; readonly slots: readonly { readonly logicalMaterialSlotId: string }[] } };
}
export type DisplayModelClosure = FixtureModelClosure | ValidationModelClosure;
export interface DisplayModelVersion {
  readonly assetId: string; readonly label: string; readonly projection: AssetProjection;
  readonly families: readonly { readonly id: string; readonly name: string; readonly compatibilityId: string }[];
  readonly closure: DisplayModelClosure;
}
