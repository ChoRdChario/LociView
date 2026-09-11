import type { ProjectProviderRead } from '../../scene/projectProvider';
import { canonicalFixture, readFixtureModel } from './modelClosure';
import { syntheticPreparedVersions, versionFromClosure } from './modelFixture';
import { metadataImmutableReader } from '../../projectMetadata/records';
import type { MetadataLimits } from '../../projectMetadata/format';

/** Known stored geometry only; current and prepared choices never imply storage authority. */
export function metadataModelVersions(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, limits: MetadataLimits) {
  const readImmutable = metadataImmutableReader(provider, limits);
  return Object.values(provider.resources.assets).flatMap(asset => {
    if (asset.lifecycle.kind !== 'value' || asset.lifecycle.value.state !== 'active' || asset.projection.kind !== 'value') return [];
    const p = asset.projection.value, records = provider.details.immutable;
    const template = syntheticPreparedVersions.find(v => v.assetId === asset.id && v.projection.revisionId === p.revisionId);
    const binding = records.assetBindingsById[p.bindingId], revision = records.assetRevisionsById[p.revisionId];
    const rep = template && records.representationsById[template.closure.representation.id];
    if (!template || binding?.kind !== 'value' || revision?.kind !== 'value' || rep?.kind !== 'value' ||
      canonicalFixture(revision.value) !== canonicalFixture(template.closure.revision) ||
      canonicalFixture(rep.value) !== canonicalFixture(template.closure.representation) ||
      p.assetFrameId !== template.closure.assetFrame.id)
      throw Error('保存したモデルの配置と本体を確認できません。');
    const current = versionFromClosure(readFixtureModel(canonicalFixture({ ...template.closure, binding: binding.value })));
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
