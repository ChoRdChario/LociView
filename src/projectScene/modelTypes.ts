import type { JsonObject } from '../domain/values';
import type { AssetProjection } from '../scene/types';
import type { MediaFileSelection } from './mediaDisplay';

export interface ModelFileAddition { readonly sceneId: string; readonly assetId: string; readonly file: MediaFileSelection }
export interface ModelFileReplacement extends ModelFileAddition { readonly expectedBindingId: string }
export interface ModelReplacementTarget { readonly token: string; readonly sceneId: string; readonly assetId: string; readonly expectedBindingId: string }

/** Saved read projection only. Complete immutable records remain attached, not reconstructed as fixtures. */
export interface ValidationModelClosure {
  readonly shape: 'saved-glb' | 'saved-point' | 'saved-gs';
  readonly assetFrame: { readonly id: string };
  readonly representationFrame: { readonly id: string };
  readonly binding: JsonObject & { readonly id: string; readonly payloadDigest: string; readonly assetId: string; readonly assetRevisionId: string;
    readonly assetToProject: ModelPlacement; readonly parentBindingId?: string };
  readonly revision: JsonObject & { readonly id: string; readonly payloadDigest: string; readonly assetId: string; readonly representationIds: readonly string[];
    readonly anchorCompatibilityClasses: readonly { readonly id: string; readonly targetVariantFamilyIds: readonly string[] }[] };
  readonly proxy?: ValidationModelClosure['representation'];
  readonly representation: JsonObject & { readonly id: string; readonly payloadDigest: string; readonly assetId: string; readonly variantFamilyId: string;
    readonly representationFrameId: string; readonly representationToAsset: ModelPlacement;
    readonly logicalBoundsAsset: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
    readonly materialCatalog?: { readonly layoutId: string; readonly slots: readonly { readonly logicalMaterialSlotId: string;
      readonly sourceLocator: JsonObject; readonly sourceSemantics: JsonObject }[] } };
}
export type DisplayModelClosure = PreviewModelClosure | ValidationModelClosure;
/** Read-only rendering facts, not a Binding, Revision or metadata source. */
export interface ReadonlyRenderModel {
  readonly shape: 'render-glb' | 'render-point' | 'render-gs'; readonly key: string; readonly assetId: string; readonly assetToProject: ModelPlacement;
  readonly proxy?: ValidationModelClosure['representation'];
  readonly representation: JsonObject & { readonly id: string; readonly assetId: string; readonly variantFamilyId: string;
    readonly representationToAsset: ModelPlacement;
    readonly logicalBoundsAsset: ValidationModelClosure['representation']['logicalBoundsAsset'];
    readonly materialCatalog?: NonNullable<ValidationModelClosure['representation']['materialCatalog']> };
}
export const renderModel = (model: ValidationModelClosure | ReadonlyRenderModel): ReadonlyRenderModel => isReadonlyModel(model) ? model :
  ({ shape: model.shape === 'saved-gs' ? 'render-gs' : model.shape === 'saved-point' ? 'render-point' : 'render-glb', key: model.binding.id, assetId: model.binding.assetId, assetToProject: model.binding.assetToProject, representation: model.representation, ...(model.proxy ? {proxy:model.proxy}: {}) });
export const renderOwner = (model: DisplayModelClosure | ReadonlyRenderModel) => isReadonlyModel(model) ? model.assetId : model.binding.assetId;
export const renderPlacement = (model: DisplayModelClosure | ReadonlyRenderModel) => isReadonlyModel(model) ? model.assetToProject : model.binding.assetToProject;
/** Explicit placement edit; no model-content introduction or fixture reconstruction. */
export interface ModelPlacementCommand {
  readonly sceneId: string; readonly assetId: string; readonly expectedBindingId: string;
  readonly bindingId: string; readonly placement: ModelPlacement;
}
export interface DisplayModelVersion {
  readonly assetId: string; readonly label: string; readonly projection: AssetProjection;
  readonly families: readonly { readonly id: string; readonly name: string; readonly compatibilityId: string }[];
  readonly closure: DisplayModelClosure;
}

export const isSavedModel = (model: DisplayModelClosure): model is ValidationModelClosure => model.shape === 'saved-glb' || model.shape === 'saved-point' || model.shape === 'saved-gs';
export function isReadonlyModel(model: DisplayModelClosure | ReadonlyRenderModel): model is ReadonlyRenderModel { return model.shape === 'render-glb' || model.shape === 'render-point' || model.shape === 'render-gs'; }

/** Structural display descriptor for injected geometry adapters; carries no source admission. */
export interface PreviewModelClosure {
  readonly shape:'original'|'updated';
  readonly assetFrame:{id:string;handedness:'right';upAxis:'+Y';unit:{kind:'unknown'}};
  readonly representationFrame:PreviewModelClosure['assetFrame'];
  readonly binding:{id:string;payloadDigest:string;assetId:string;assetRevisionId:string;assetToProject:ModelPlacement;method:'manual'|'import';parentBindingId?:string};
  readonly revision:{id:string;payloadDigest:string;assetId:string;representationIds:string[];
    anchorCompatibilityClasses:{id:string;targetVariantFamilyIds:string[]}[];provenance:{origin:'import';inputBlobDigests:string[]}};
  readonly representation:{id:string;payloadDigest:string;assetId:string;variantFamilyId:string;representationFrameId:string;
    contentKind:'mesh';purposes:string[];role:'meshPrimary';formatProfile:{id:string;specificationSha256:string};
    blob:{algorithm:'sha256';digest:string;byteLength:number;mediaType:string};derivedFrom:string[];
    representationToAsset:{translation:readonly[0.25,0,0];rotationXYZW:readonly[0,0,0,1];uniformScale:number;reflection:'none'};
    logicalBoundsAsset:{min:readonly[0.25,0,0];max:readonly[1.25,1,0|0.5]};
    materialCatalog:{layoutId:string;slots:{logicalMaterialSlotId:string;sourceLocator:{kind:'representationMaterial';slotIndex:number};
      sourceSemantics:{coverage:{kind:'opaque'};optics:'surface';lighting:'lit';doubleSided:boolean}}[]}};
}
export interface ModelPlacement {readonly translation:readonly[number,number,number];readonly rotationXYZW:readonly[number,number,number,number];readonly uniformScale:number}
