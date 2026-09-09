import type { Anchor, AssetProjection } from '../../scene/types';
import { createSyntheticProject, freezeSynthetic } from './fixture';
import { createFixtureModel, type FixtureModelClosure } from './modelClosure';

/** Known synthetic read projections, NOT imported immutable records or verified model bytes. */
export interface SyntheticModelVersion {
  readonly assetId: string; readonly label: string; readonly projection: AssetProjection;
  readonly families: readonly { readonly id: string; readonly name: string; readonly compatibilityId: string }[];
  readonly closure: FixtureModelClosure;
}
const initial = createSyntheticProject();
const id = (prefix: string, n: number) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
export const syntheticVersions: readonly SyntheticModelVersion[] = freezeSynthetic(
  Object.values(initial.resources.assets).flatMap((asset, index) => {
    if (asset.projection.kind !== 'value') throw new Error('合成モデルの初期値がありません。');
    const base = asset.projection.value, n = index + 1;
    const originalFamily = { id: id('fam', n), name: '元の表面', compatibilityId: base.anchorCompatibilityIds[0]! };
    const newFamily = { id: id('fam', n + 10), name: '更新後の表面', compatibilityId: id('cmp', n + 10) };
    return [
      { assetId: asset.id, label: '初期モデル', projection: base, families: [originalFamily] },
      { assetId: asset.id, label: '形状を更新したモデル', projection: { ...base,
        bindingId: id('bnd', n + 10), revisionId: id('rev', n + 10), representationIds: [id('rep', n + 10)],
        anchorCompatibilityIds: [newFamily.compatibilityId] }, families: [newFamily] },
      { assetId: asset.id, label: '表面が同じ表示用モデル', projection: { ...base,
        bindingId: id('bnd', n + 20), revisionId: id('rev', n + 20), representationIds: [id('rep', n + 20)] }, families: [originalFamily] },
    ].map((version, index) => ({ ...version, closure: createFixtureModel({ asset: asset.id, assetFrame: base.assetFrameId,
      representationFrame: id('frm', n + 100), binding: version.projection.bindingId, revision: version.projection.revisionId,
      representation: version.projection.representationIds[0]!, family: version.families[0]!.id,
      compatibility: version.families[0]!.compatibilityId, layout: id('lay', n + (index === 1 ? 10 : 0)), slot: id('slot', n + (index === 1 ? 10 : 0)) },
    index === 1 ? 'updated' : 'original', { translation: [n * 2, 0.5, 0], rotationXYZW: [0, 0, 0.6, 0.8], uniformScale: 1.5 }) }));
  }));
export const modelVersion = (assetId: string, bindingId: string, versions = syntheticVersions) => versions.find(v =>
  v.assetId === assetId && v.projection.bindingId === bindingId);

export function versionFromClosure(closure: FixtureModelClosure): SyntheticModelVersion {
  const known = syntheticVersions.find(v => v.projection.bindingId === closure.binding.id);
  return freezeSynthetic({ assetId: closure.binding.assetId, label: known?.label ?? (closure.binding.parentBindingId ? '位置を変更したモデル' : '合成モデル'),
    projection: { assetFrameId: closure.assetFrame.id, bindingId: closure.binding.id, revisionId: closure.revision.id,
      representationIds: closure.revision.representationIds, anchorCompatibilityIds: closure.revision.anchorCompatibilityClasses.map(c => c.id) },
    families: closure.revision.anchorCompatibilityClasses.flatMap(c => c.targetVariantFamilyIds.map(id =>
      ({ id, name: closure.shape === 'updated' ? '更新後の表面' : '元の表面', compatibilityId: c.id }))), closure });
}

/** Validate every candidate; an older known class is valid review state, not an automatic rebind. */
export function decodeSyntheticAnchor(text: string, owner: string | { readonly assetId: string; readonly assetFrameId: string },
  versions = syntheticVersions): Anchor {
  const baseline = typeof owner === 'string' ? initial.resources.captions[owner]?.anchor : undefined;
  const expected = typeof owner === 'string' ? initial.captionOwners[owner] : owner;
  if (!expected) throw new Error('キャプションの所有モデルを確認してください。');
  // Only the two exact original fixture anchors omit authored manual evidence.
  if (baseline?.kind === 'value' && text === JSON.stringify(baseline.value)) return baseline.value;
  if (Object.values(initial.resources.captions).some(c => c.anchor.kind === 'value' && c.anchor.value.kind === 'asset' &&
    c.anchor.value.assetId === expected.assetId && c.anchor.value.assetFrameId === expected.assetFrameId && text === JSON.stringify(c.anchor.value)))
    return JSON.parse(text) as Anchor;
  const anchor = JSON.parse(text) as Record<string, unknown>;
  const allowed = ['kind', 'assetId', 'assetFrameId', 'positionAsset', 'authoredAssetRevisionId', 'authoredAnchorCompatibilityId', 'hitEvidence'];
  if (!anchor || Object.keys(anchor).length !== allowed.length || Object.keys(anchor).some(key => !allowed.includes(key)) ||
    anchor.kind !== 'asset' || anchor.assetId !== expected.assetId || anchor.assetFrameId !== expected.assetFrameId ||
    !Array.isArray(anchor.positionAsset) || anchor.positionAsset.length !== 3 ||
    anchor.positionAsset.some(n => typeof n !== 'number' || !Number.isFinite(n) || Object.is(n, -0)) ||
    JSON.stringify(anchor.hitEvidence) !== '{"method":"manual"}' ||
    !versions.some(v => v.assetId === anchor.assetId && v.projection.assetFrameId === anchor.assetFrameId && v.projection.revisionId === anchor.authoredAssetRevisionId &&
      v.families.some(f => f.compatibilityId === anchor.authoredAnchorCompatibilityId)))
    throw new Error('ピンの位置・モデル・表面を確認してください。');
  return freezeSynthetic(anchor) as unknown as Anchor;
}
