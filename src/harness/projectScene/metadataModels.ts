import type { ProjectProviderRead } from '../../scene/projectProvider';
import { canonicalFixture } from './modelClosure';
import { syntheticPreparedVersions, versionFromClosure } from './modelFixture';
import { metadataImmutableReader } from '../../projectMetadata/records';
import type { MetadataLimits } from '../../projectMetadata/format';
import { readMetadataModel } from './metadataModelRecords';

/** Known stored geometry only; current and prepared choices never imply storage authority. */
export function metadataModelVersions(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, limits: MetadataLimits) {
  const readImmutable = metadataImmutableReader(provider, limits);
  return Object.values(provider.resources.assets).flatMap(asset => {
    if (asset.lifecycle.kind !== 'value' || asset.lifecycle.value.state !== 'active' || asset.projection.kind !== 'value') return [];
    const p = asset.projection.value, records = provider.details.immutable;
    const binding = records.assetBindingsById[p.bindingId], revision = records.assetRevisionsById[p.revisionId];
    const rep = p.representationIds.length === 1 && records.representationsById[p.representationIds[0]!];
    if (binding?.kind !== 'value' || revision?.kind !== 'value' || !rep || rep.kind !== 'value')
      throw Error('保存したモデルの配置と本体を確認できません。');
    const current = versionFromClosure(readMetadataModel(p.assetFrameId, binding.value, revision.value, rep.value));
    if (canonicalFixture(current.projection) !== canonicalFixture(p)) throw Error('保存したモデルの参照が一致しません。');
    const choices = syntheticPreparedVersions.filter(v => {
      if (v.assetId !== asset.id || v.projection.revisionId === p.revisionId) return false;
      if (!records.assetRevisionsById[v.projection.revisionId]) return false; // Old seed: no prepared version, never fill it in.
      const candidate = readImmutable('assetRevisionsById', v.projection.revisionId);
      const binding = readImmutable('assetBindingsById', v.projection.bindingId);
      const rep = readImmutable('representationsById', v.closure.representation.id);
      if (canonicalFixture(candidate) !== canonicalFixture(v.closure.revision) ||
        canonicalFixture(binding) !== canonicalFixture(v.closure.binding) || canonicalFixture(rep) !== canonicalFixture(v.closure.representation))
        throw Error('準備したモデルの参照を確認できません。');
      return true;
    });
    return [current, ...choices];
  });
}
