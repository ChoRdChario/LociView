import { cloneCanonicalValue, type JsonValue } from '../../domain/values';
import { NativeSha256 } from '../../nativeGs/sha256';
import { freezeSynthetic } from './fixture';

/** Exact tiny fixture port, not a ratified decoder profile, model importer or BlobStore. */
export interface FixtureModelIds {
  readonly asset: string; readonly assetFrame: string; readonly representationFrame: string;
  readonly binding: string; readonly revision: string; readonly representation: string;
  readonly family: string; readonly compatibility: string; readonly layout: string; readonly slot: string;
}
export interface FixturePlacement {
  readonly translation: readonly [number, number, number];
  readonly rotationXYZW: readonly [number, number, number, number]; readonly uniformScale: number;
}
const prefixes: Record<keyof FixtureModelIds, string> = { asset: 'ast', assetFrame: 'frm', representationFrame: 'frm',
  binding: 'bnd', revision: 'rev', representation: 'rep', family: 'fam', compatibility: 'cmp', layout: 'lay', slot: 'slot' };
export function canonicalFixture(input: unknown): string {
  const value = cloneCanonicalValue(input, { maxNodes: 4096, maxDepth: 16, maxStringScalars: 65_536 });
  const encode = (item: JsonValue): string => item && typeof item === 'object' ? Array.isArray(item)
    ? `[${item.map(encode).join(',')}]` : `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode((item as Record<string, JsonValue>)[key]!)}`).join(',')}}`
    : JSON.stringify(item);
  return encode(value);
}
export function fixtureSha256(bytes: Uint8Array): string { const hash = new NativeSha256(); hash.update(bytes); return hash.digestHex(); }
const utf8 = (text: string) => new TextEncoder().encode(text);
export function fixtureRecordDigest(kind: 'representation' | 'asset-revision' | 'asset-binding-revision' | 'media-resource', record: object): string {
  const { payloadDigest: _digest, ...payload } = record as Record<string, unknown>;
  return fixtureSha256(utf8(`lociview:v2:immutable:${kind}:jcs-v1\n${canonicalFixture(payload)}`));
}
function sealed<T extends object>(kind: Parameters<typeof fixtureRecordDigest>[0], payload: T) {
  return { ...payload, payloadDigest: fixtureRecordDigest(kind, payload) };
}
const profileText = 'LociView development-only triangle fixture 1: JSON positions and indices; right-handed +Y; unknown units; static; opaque lit single-sided; one material slot; no textures, animation or extensions.';
const profile = { id: 'development-triangle-fixture-1', specificationSha256: fixtureSha256(utf8(profileText)) };
export function fixtureModelBytes(shape: 'original' | 'updated'): Uint8Array {
  return utf8(canonicalFixture({ positions: [0, 0, 0, 1, 0, 0, 0, 1, shape === 'updated' ? 0.5 : 0], indices: [0, 1, 2] }));
}
function validPlacement(p: FixturePlacement) {
  if (!p || !Array.isArray(p.translation) || p.translation.length !== 3 || !Array.isArray(p.rotationXYZW) || p.rotationXYZW.length !== 4 ||
    [...p.translation, ...p.rotationXYZW, p.uniformScale].some(n => typeof n !== 'number' || !Number.isFinite(n) || Object.is(n, -0)) || p.uniformScale <= 0)
    throw new Error('モデルの位置・回転・縮尺を確認してください。');
  const q = p.rotationXYZW, sign = q[3] || q[0] || q[1] || q[2];
  if (Math.abs(q.reduce((sum, n) => sum + n * n, 0) - 1) > 1e-12 || sign <= 0) throw new Error('モデルの回転を確認してください。');
}
export function fixtureIdsValid(ids: FixtureModelIds): void {
  if (!ids || Object.keys(ids).sort().join(',') !== Object.keys(prefixes).sort().join(',') ||
    Object.entries(prefixes).some(([key, prefix]) => !new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(ids[key as keyof FixtureModelIds])) ||
    new Set(Object.values(ids)).size !== Object.keys(prefixes).length) throw new Error('モデルコピーの識別情報を確認してください。');
}
export function allocateModelCopyIds(source: FixtureModelIds, fresh: (prefix: string) => string): FixtureModelIds {
  fixtureIdsValid(source);
  return Object.fromEntries(Object.entries(prefixes).map(([key, prefix]) => [key, fresh(prefix)])) as unknown as FixtureModelIds;
}
/** Closed supported fixture shape. Extra roles/relations are rejected, not copied by omission. */
export function createFixtureModel(ids: FixtureModelIds, shape: 'original' | 'updated', placement: FixturePlacement,
  parentBindingId?: string) {
  fixtureIdsValid(ids); validPlacement(placement);
  if (shape !== 'original' && shape !== 'updated') throw new Error('合成モデルの形状を確認してください。');
  const bytes = fixtureModelBytes(shape), digest = fixtureSha256(bytes);
  const evidence = (id: string) => ({ id, handedness: 'right' as const, upAxis: '+Y' as const, unit: { kind: 'unknown' as const } });
  const representation = sealed('representation', { id: ids.representation, assetId: ids.asset, representationFrameId: ids.representationFrame,
    contentKind: 'mesh' as const, purposes: ['source', 'display'], role: 'meshPrimary' as const, variantFamilyId: ids.family,
    formatProfile: profile, blob: { algorithm: 'sha256' as const, digest, byteLength: bytes.byteLength, mediaType: 'application/json' },
    representationToAsset: { translation: [0.25, 0, 0] as const, rotationXYZW: [0, 0, 0, 1] as const, uniformScale: 1, reflection: 'none' as const },
    logicalBoundsAsset: { min: [0.25, 0, 0] as const, max: [1.25, 1, shape === 'updated' ? 0.5 : 0] as const }, derivedFrom: [] as string[],
    materialCatalog: { layoutId: ids.layout, slots: [{ logicalMaterialSlotId: ids.slot,
      sourceLocator: { kind: 'representationMaterial' as const, slotIndex: 0 },
      sourceSemantics: { coverage: { kind: 'opaque' as const }, optics: 'surface' as const, lighting: 'lit' as const, doubleSided: false } }] } });
  const revision = sealed('asset-revision', { id: ids.revision, assetId: ids.asset, representationIds: [ids.representation],
    anchorCompatibilityClasses: [{ id: ids.compatibility, targetVariantFamilyIds: [ids.family] }],
    provenance: { origin: 'import' as const, inputBlobDigests: [digest] } });
  const binding = sealed('asset-binding-revision', { id: ids.binding, assetId: ids.asset, assetRevisionId: ids.revision,
    assetToProject: placement, method: parentBindingId ? 'manual' as const : 'import' as const,
    ...(parentBindingId ? { parentBindingId } : {}) });
  return freezeSynthetic({ shape, assetFrame: evidence(ids.assetFrame), representationFrame: evidence(ids.representationFrame),
    representation, revision, binding });
}
export type FixtureModelClosure = ReturnType<typeof createFixtureModel>;
export function fixtureModelIds(c: FixtureModelClosure): FixtureModelIds {
  return { asset: c.binding.assetId, assetFrame: c.assetFrame.id, representationFrame: c.representationFrame.id,
    binding: c.binding.id, revision: c.revision.id, representation: c.representation.id,
    family: c.representation.variantFamilyId, compatibility: c.revision.anchorCompatibilityClasses[0]!.id,
    layout: c.representation.materialCatalog.layoutId, slot: c.representation.materialCatalog.slots[0]!.logicalMaterialSlotId };
}
export function readFixtureModel(text: string): FixtureModelClosure {
  if (text.length > 65_536) throw new Error('合成モデルが大きすぎます。');
  const raw = cloneCanonicalValue(JSON.parse(text), { maxNodes: 4096, maxDepth: 16, maxStringScalars: 65_536 }) as unknown as FixtureModelClosure;
  const expected = createFixtureModel(fixtureModelIds(raw), raw.shape, raw.binding.assetToProject, raw.binding.parentBindingId);
  if (canonicalFixture(raw) !== canonicalFixture(expected)) throw new Error('モデルの参照・本体・メタデータを確認してください。');
  return expected;
}
export function remapFixtureModel(source: FixtureModelClosure, ids: FixtureModelIds): FixtureModelClosure {
  readFixtureModel(canonicalFixture(source));
  if (source.binding.parentBindingId) throw new Error('履歴を持つモデルの独立コピーは、この開発版では未接続です。');
  return createFixtureModel(ids, source.shape, source.binding.assetToProject);
}
export function moveFixtureModel(source: FixtureModelClosure, bindingId: string, translation: readonly [number, number, number]) {
  return createFixtureModel({ ...fixtureModelIds(source), binding: bindingId }, source.shape,
    { ...source.binding.assetToProject, translation }, source.binding.id);
}
