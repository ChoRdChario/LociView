import type { Anchor, AssetProjection } from '../../scene/types';
import { createSyntheticProject, freezeSynthetic } from './fixture';

/** Known synthetic read projections, NOT imported immutable records or verified model bytes. */
export interface SyntheticModelVersion {
  readonly assetId: string; readonly label: string; readonly projection: AssetProjection;
  readonly families: readonly { readonly id: string; readonly name: string; readonly compatibilityId: string }[];
}
const initial = createSyntheticProject();
const id = (prefix: string, n: number) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
export const syntheticVersions: readonly SyntheticModelVersion[] = freezeSynthetic(
  Object.values(initial.resources.assets).flatMap((asset, index) => {
    if (asset.projection.kind !== 'value') throw new Error('合成モデルの初期値がありません。');
    const base = asset.projection.value, n = index + 1;
    const originalFamily = { id: `synthetic-family-${n}`, name: '元の表面', compatibilityId: base.anchorCompatibilityIds[0]! };
    const newFamily = { id: `synthetic-family-${n}-updated`, name: '更新後の表面', compatibilityId: `synthetic-surface-${n}-updated` };
    return [
      { assetId: asset.id, label: '初期モデル', projection: base, families: [originalFamily] },
      { assetId: asset.id, label: '形状を更新したモデル', projection: { ...base,
        bindingId: id('bnd', n + 10), revisionId: id('rev', n + 10), representationIds: [id('rep', n + 10)],
        anchorCompatibilityIds: [newFamily.compatibilityId] }, families: [newFamily] },
      { assetId: asset.id, label: '表面が同じ表示用モデル', projection: { ...base,
        bindingId: id('bnd', n + 20), revisionId: id('rev', n + 20), representationIds: [id('rep', n + 20)] }, families: [originalFamily] },
    ];
  }));
export const modelVersion = (assetId: string, bindingId: string) => syntheticVersions.find(v =>
  v.assetId === assetId && v.projection.bindingId === bindingId);

/** Validate every candidate; an older known class is valid review state, not an automatic rebind. */
export function decodeSyntheticAnchor(text: string, captionId: string): Anchor {
  const baseline = initial.resources.captions[captionId]?.anchor;
  if (baseline?.kind !== 'value' || baseline.value.kind !== 'asset') throw new Error('キャプションの所有モデルを確認してください。');
  if (text === JSON.stringify(baseline.value)) return baseline.value;
  const anchor = JSON.parse(text) as Record<string, unknown>;
  const allowed = ['kind', 'assetId', 'assetFrameId', 'positionAsset', 'authoredAssetRevisionId', 'authoredAnchorCompatibilityId', 'hitEvidence'];
  if (!anchor || Object.keys(anchor).length !== allowed.length || Object.keys(anchor).some(key => !allowed.includes(key)) ||
    anchor.kind !== 'asset' || anchor.assetId !== baseline.value.assetId || anchor.assetFrameId !== baseline.value.assetFrameId ||
    !Array.isArray(anchor.positionAsset) || anchor.positionAsset.length !== 3 ||
    anchor.positionAsset.some(n => typeof n !== 'number' || !Number.isFinite(n) || Object.is(n, -0)) ||
    JSON.stringify(anchor.hitEvidence) !== '{"method":"manual"}' ||
    !syntheticVersions.some(v => v.assetId === anchor.assetId && v.projection.revisionId === anchor.authoredAssetRevisionId &&
      v.families.some(f => f.compatibilityId === anchor.authoredAnchorCompatibilityId)))
    throw new Error('ピンの位置・モデル・表面を確認してください。');
  return freezeSynthetic(anchor) as unknown as Anchor;
}
