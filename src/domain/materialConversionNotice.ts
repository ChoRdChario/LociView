import type {JsonObject} from './values';
export type MaterialNormalizationReason='alpha-order'|'chroma-standard'|'hard-boundary'|'basic-chroma'|'smooth-display';
/** Inspected source display data; never a stored command, receipt or authorizing flag. */
export interface MaterialConversionNotice extends JsonObject {
  readonly scene:string;readonly model:string;readonly material:string;
  readonly reasons:readonly MaterialNormalizationReason[];
}
