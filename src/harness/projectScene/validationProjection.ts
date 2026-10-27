import { gsSourceProfile } from '../../projectFiles/gsPly';
import { pointSourceProfile } from '../../projectFiles/pointPly';
import type { ProjectProviderRead } from '../../scene/projectProvider';
import { metadataImmutableReader } from '../../projectMetadata/records';
import { same } from '../../domain/projectGraphSupport';
import { validationGlbProfile, occurrenceGlbProfile, jpegGlbProfile, occurrenceJpegGlbProfile, validationMetadataLimits } from '../../projectFiles/validation';
import { freezeSynthetic } from './fixture';
import type { DisplayModelVersion, ValidationModelClosure } from './modelTypes';
import type { MetadataLimits } from '../../projectMetadata/format';

/** Capacity accounting uses known declarations, not display eligibility of old weak models. */
export function validationDeclaredBodyBytes(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, limits: MetadataLimits): number {
  const read = metadataImmutableReader(provider, limits), bodies = new Map<string, number>();
  for (const map of ['representationsById', 'mediaResourcesById'] as const) for (const id of Object.keys(provider.details.immutable[map])) {
    const blob = read(map, id).blob as { digest: string; byteLength: number };
    if (bodies.has(blob.digest) && bodies.get(blob.digest) !== blob.byteLength) throw Error('保存した本体の大きさが一致しません。');
    bodies.set(blob.digest, blob.byteLength);
  }
  const bytes = [...bodies.values()].reduce((sum, size) => sum + size, 0);
  if (!Number.isSafeInteger(bytes)) throw Error('保存した本体の合計が扱える範囲を超えています。');
  return bytes;
}

/** Only content-admitted saved records; body reads happen separately, never a fixture fallback. */
export async function validationModelVersions(provider: ProjectProviderRead): Promise<readonly DisplayModelVersion[]> {
  if (provider.kind !== 'scene-provider') throw Error('保存したシーンを確認できません。');
  const read = metadataImmutableReader(provider, validationMetadataLimits), profile = await validationGlbProfile(), occurrence = await occurrenceGlbProfile();
  const gs = await gsSourceProfile(), point = await pointSourceProfile(), profiles = [profile, occurrence, await jpegGlbProfile(), await occurrenceJpegGlbProfile(), point, gs];
  return freezeSynthetic(Object.values(provider.resources.assets).flatMap(asset => {
    if (asset.lifecycle.kind !== 'value' || asset.lifecycle.value.state !== 'active' || asset.projection.kind !== 'value') return [];
    const p = asset.projection.value;

    const binding = read('assetBindingsById', p.bindingId), revision = read('assetRevisionsById', p.revisionId);
    const reps=p.representationIds.map(id=>read('representationsById',id)), visuals=reps.filter(r=>r.role!=='interactionProxy'), proxies=reps.filter(r=>r.role==='interactionProxy');
    if(visuals.length!==1 || proxies.length>1 || proxies.length && (visuals[0]!.role!=='gsPrimary' || proxies[0]!.proxyForGsVariantFamilyId!==visuals[0]!.variantFamilyId))throw Error('モデルと位置指定用の面の対応を確認できません。');
    const representation=visuals[0]!, proxy=proxies[0];
    if (binding.assetId !== asset.id || binding.assetRevisionId !== revision.id || revision.assetId !== asset.id ||
      representation.assetId !== asset.id || !same(revision.representationIds, p.representationIds) ||
      !profiles.some(profile => same(representation.formatProfile, profile))) throw Error('保存したモデルと表示本体の対応を確認できません。');
    // These exact immutable values were validated by the provider, not by this UI assertion.
    const closure: ValidationModelClosure = { shape: same(representation.formatProfile, gs) ? 'saved-gs' : same(representation.formatProfile, point) ? 'saved-point' : 'saved-glb', assetFrame: { id: p.assetFrameId },
      representationFrame: { id: representation.representationFrameId as string },
      binding: binding as ValidationModelClosure['binding'], revision: revision as ValidationModelClosure['revision'],
      representation: representation as ValidationModelClosure['representation'], ...(proxy ? {proxy:proxy as ValidationModelClosure['representation']} : {}) };
    const classes = closure.revision.anchorCompatibilityClasses;
    if (!same(classes.map(c => c.id).slice().sort(), p.anchorCompatibilityIds.slice().sort()))
      throw Error('保存したモデルのピンの対応を確認できません。');
    const name = provider.details.mutable.assetsById[asset.id]?.label;
    return [{ assetId: asset.id, label: name?.kind === 'value' && typeof name.value === 'string' ? name.value : '3Dモデル', projection: p,
      families: classes.flatMap(c => c.targetVariantFamilyIds.map(id => ({ id, name: '表面', compatibilityId: c.id }))), closure }];
  }));
}
