import type { JsonObject } from './values';

/** One immutable MediaResource owns its source and optional portable raster. */
export interface PortableDisplay {
  readonly kind: 'native-heic-raster-v1'; readonly blob: JsonObject;
  readonly width: number; readonly height: number;
}
export const portableDisplay = (record: JsonObject): PortableDisplay | undefined =>
  record.portableDisplay as unknown as PortableDisplay | undefined;
/** Call after the record's domain/declaration check; never infers extra source authority. */
export const recordBlobRefs = (record: JsonObject): readonly JsonObject[] => {
  const display = portableDisplay(record);
  return display ? [record.blob as JsonObject, display.blob] : [record.blob as JsonObject];
};
export const displayBlobRef = (record: JsonObject): JsonObject => portableDisplay(record)?.blob ?? record.blob as JsonObject;
