import type { ProjectProviderRead } from '../../scene/projectProvider';
import { canonicalFixture, readFixtureModel } from './modelClosure';
import { syntheticVersions, versionFromClosure } from './modelFixture';

/** Only known unchanged geometry; every current binding comes from this provider. */
export function metadataModelVersions(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>) {
  return Object.values(provider.resources.assets).flatMap(asset => {
    if (asset.lifecycle.kind !== 'value' || asset.lifecycle.value.state !== 'active' || asset.projection.kind !== 'value') return [];
    const p = asset.projection.value, records = provider.details.immutable;
    const template = syntheticVersions.find(v => v.assetId === asset.id && v.closure.shape === 'original' && v.projection.revisionId === p.revisionId);
    const binding = records.assetBindingsById[p.bindingId], revision = records.assetRevisionsById[p.revisionId];
    const rep = template && records.representationsById[template.closure.representation.id];
    if (!template || binding?.kind !== 'value' || revision?.kind !== 'value' || rep?.kind !== 'value' ||
      canonicalFixture(revision.value) !== canonicalFixture(template.closure.revision) ||
      canonicalFixture(rep.value) !== canonicalFixture(template.closure.representation) ||
      p.assetFrameId !== template.closure.assetFrame.id)
      throw Error('保存したモデルの配置と本体を確認できません。');
    const current = versionFromClosure(readFixtureModel(canonicalFixture({ ...template.closure, binding: binding.value })));
    if (canonicalFixture(current.projection) !== canonicalFixture(p)) throw Error('保存したモデルの参照が一致しません。');
    return [current];
  });
}
