import type { ProjectProviderRead } from '../../scene/projectProvider';
import { metadataImmutableReader } from '../../projectMetadata/records';
import { same } from '../../domain/projectGraphSupport';
import { validationGlbProfile, validationMetadataLimits } from '../../projectFiles/validation';
import { freezeSynthetic } from './fixture';
import type { DisplayModelVersion, ValidationModelClosure } from './modelTypes';

/** Only content-admitted saved records; body reads happen separately, never a fixture fallback. */
export async function validationModelVersions(provider: ProjectProviderRead): Promise<readonly DisplayModelVersion[]> {
  if (provider.kind !== 'scene-provider') throw Error('保存したシーンを確認できません。');
  const read = metadataImmutableReader(provider, validationMetadataLimits), profile = await validationGlbProfile();
  return freezeSynthetic(Object.values(provider.resources.assets).flatMap(asset => {
    if (asset.lifecycle.kind !== 'value' || asset.lifecycle.value.state !== 'active' || asset.projection.kind !== 'value') return [];
    const p = asset.projection.value;
    if (p.representationIds.length !== 1) throw Error('この検証版では、1つの表示本体を持つモデルだけを開けます。');
    const binding = read('assetBindingsById', p.bindingId), revision = read('assetRevisionsById', p.revisionId);
    const representation = read('representationsById', p.representationIds[0]!);
    if (binding.assetId !== asset.id || binding.assetRevisionId !== revision.id || revision.assetId !== asset.id ||
      representation.assetId !== asset.id || !same(revision.representationIds, p.representationIds) ||
      !same(representation.formatProfile, profile)) throw Error('保存したモデルと表示本体の対応を確認できません。');
    // These exact immutable values were validated by the provider, not by this UI assertion.
    const closure: ValidationModelClosure = { shape: 'saved-glb', assetFrame: { id: p.assetFrameId },
      representationFrame: { id: representation.representationFrameId as string },
      binding: binding as ValidationModelClosure['binding'], revision: revision as ValidationModelClosure['revision'],
      representation: representation as ValidationModelClosure['representation'] };
    const classes = closure.revision.anchorCompatibilityClasses;
    if (!same(classes.map(c => c.id).slice().sort(), p.anchorCompatibilityIds.slice().sort()))
      throw Error('保存したモデルのピンの対応を確認できません。');
    const name = provider.details.mutable.assetsById[asset.id]?.label;
    return [{ assetId: asset.id, label: name?.kind === 'value' && typeof name.value === 'string' ? name.value : '3Dモデル', projection: p,
      families: classes.flatMap(c => c.targetVariantFamilyIds.map(id => ({ id, name: '表面', compatibilityId: c.id }))), closure }];
  }));
}
