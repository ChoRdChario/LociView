import { parseJsonWithoutDuplicateMembers } from '../core/json';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import type { MetadataLimits } from '../projectMetadata/format';
import { digest } from '../projectMetadata/persistence';

/** Development execution budgets, supplied by the host; not product guarantees. */
export interface FileValidationLimits {
  readonly maxFileBytes: number; readonly maxJsonBytes: number; readonly maxItems: number;
  readonly maxValues: number; readonly maxPixels: number;
}
export const fileError = (detail: string): never => { throw Error(`読み込めません。${detail} 元のファイルは変更していません。`); };
export function checkFileLimits(limits: FileValidationLimits): void {
  for (const n of Object.values(limits)) if (!Number.isSafeInteger(n) || n <= 0) fileError('検査の上限を確認してください。');
}
export function fileObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fileError('ファイルの構造を確認してください。');
  return value as Record<string, unknown>;
}
export function fileList(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fileError('項目数またはファイルの構造を確認してください。');
  return value;
}
export function fileInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    return fileError('ファイル内の参照または大きさが不正です。');
  return value || 0;
}
export function fileNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fileError('ファイル内の数値が不正です。');
  return value || 0;
}
export function fileFields(value: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(value).some(k => ![...fields, 'name', 'extras'].includes(k))) fileError('この検証版では未対応のデータが含まれています。');
  if (value.name !== undefined && typeof value.name !== 'string') fileError('ファイル内の名前が不正です。');
}
export function fileVector(value: unknown, length: number): number[] {
  const values = fileList(value, length); if (values.length !== length) return fileError('座標の要素数が不正です。');
  return values.map(fileNumber);
}
export function limitedJson(bytes: Uint8Array, limits: FileValidationLimits): Record<string, unknown> {
  if (bytes.length > limits.maxJsonBytes) return fileError('モデル情報がこの検証の上限を超えています。');
  try {
    const input = parseJsonWithoutDuplicateMembers(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    // Bound depth/work, preserve source separately, and normalize JSON's signed zero.
    return fileObject(cloneCanonicalValue(input, { maxNodes: limits.maxItems, maxDepth: 32, maxStringScalars: limits.maxJsonBytes }));
  } catch { return fileError('モデル情報のJSONが不正か、検査の上限を超えています。'); }
}
export const validationMetadataLimits: MetadataLimits = { maxNodes: 100_000, maxDepth: 32, maxStringScalars: 65_536,
  maxWork: 1_000_000, maxChanges: 1000, maxChangeBytes: 1_000_000, maxTotalBytes: 8_000_000, maxOperations: 20_000 };
export const validationGlbProfileText = 'LociView development validation GLB 1: GLB2 JSON/BIN; no external resources; explicit or sole scene; static triangle Mesh; non-sparse core accessors; core metallic-roughness and KHR_materials_unlit; embedded static PNG decoded with integrity and pixel limits; no other extensions, animation, skin, morph or implicit scene choice. Original bytes retained. Not a ratified support profile.';
export const validationGlbProfile = async (): Promise<JsonObject> => ({ id: 'development-validation-glb-1',
  specificationSha256: await digest(new TextEncoder().encode(validationGlbProfileText)) });
export const occurrenceGlbProfileText = 'LociView development validation GLB occurrence 1. Inherit admission, static pose, bounds and PNG integrity rules of development-validation-glb-1@077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f without change. For the selected scene, enumerate each triangle primitive occurrence once in ascending (JSON nodeIndex, primitiveIndex), assign zero-based slotIndex, and use representationMaterial(slotIndex) including missing material. Each occurrence retains the source material semantics from its authored glTF material or the inherited implicit material. Inspect unused content under the inherited rules; do not allocate catalog slots for unused materials. Runtime provenance must bijectively match each decoded material slot to an enumerated occurrence before an override applies; no name, material-object identity, first-match or traversal-index substitution. Clones are per occurrence. The Three 0.180.0 association proof and closed witness defined by native-project-scene-recipe-2 are required; missing provenance or multi-slot decoded meshes are unsupported. Original GLB bytes and source (nodeIndex, primitiveIndex) surface identity are unchanged. Not a ratified support profile.';
export const occurrenceGlbProfile = async (): Promise<JsonObject> => ({ id: 'development-validation-glb-occurrence-1',
  specificationSha256: await digest(new TextEncoder().encode(occurrenceGlbProfileText)) });
