import { createSyntheticProject, freezeSynthetic, type SyntheticProject } from './fixture';
import { syntheticVersions } from './modelFixture';
import { fixtureModelBytes } from './modelClosure';
import { cloneCanonicalValue, type JsonObject } from '../../domain/values';
import type { ProjectProviderRead } from '../../scene/projectProvider';
import { value } from '../../scene/types';
import { ProjectMetadataSource, type MetadataLimits } from '../../projectMetadata/source';
import { newId } from '../../projectMetadata/persistence';

export const metadataFixtureLimits: MetadataLimits = { maxNodes: 100_000, maxDepth: 32, maxStringScalars: 65_536,
  maxWork: 1_000_000, maxChanges: 1000, maxChangeBytes: 1_000_000, maxTotalBytes: 8_000_000, maxOperations: 20_000 };
const initial = createSyntheticProject();
export const metadataModels = syntheticVersions.filter(v => {
  const asset = initial.resources.assets[v.assetId];
  return asset?.projection.kind === 'value' && asset.projection.value.bindingId === v.projection.bindingId;
});
const field = <T>(v: { kind: 'value'; value: T } | { kind: 'unresolved'; reason: unknown }): T => {
  if (v.kind !== 'value') throw Error('合成データの初期値がありません。'); return v.value;
};
export const metadataSeedBody = () => fixtureModelBytes('original');

/** Construct known logical records independently, never convert an old PoC history. */
export function createMetadataFixture(run: string): ProjectMetadataSource {
  const byId = (rows: readonly { id: string }[]) => Object.fromEntries(rows.map(r => [r.id, r]));
  const membership = (rows: typeof initial.state.captionMemberships, name: string) => byId(Object.values(rows).map(r => ({
    id: r.id, sceneId: r.sceneId, [name]: r.resourceId, orderKey: field(r.orderKey), lifecycle: field(r.lifecycle),
  })));
  const records = cloneCanonicalValue({ schema: { major: 2, minor: 0 },
    identity: { projectId: `prj_${run}`, historyEpoch: `hep_${newId()}`, lineageSeed: newId() + newId() },
    project: { title: '保存するシーンと記録', defaultSceneId: field(initial.state.defaultSceneId),
      frame: { id: initial.resources.projectFrameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } } },
    assetsById: byId(metadataModels.map(m => ({ id: m.assetId, label: initial.modelNames[m.assetId], assetFrameId: m.projection.assetFrameId,
      status: { kind: 'ready', activeBindingId: m.projection.bindingId }, lifecycle: field(initial.resources.assets[m.assetId]!.lifecycle) }))),
    assetBindingsById: byId(metadataModels.map(m => m.closure.binding)), assetRevisionsById: byId(metadataModels.map(m => m.closure.revision)),
    representationsById: byId(metadataModels.map(m => m.closure.representation)),
    captionsById: byId(Object.values(initial.resources.captions).map(c => ({ id: c.id, title: field(c.title), body: field(c.body),
      colorSrgb: field(initial.colors[c.id]!).slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255),
      anchor: field(c.anchor), lifecycle: field(c.lifecycle) }))),
    scenesById: byId(Object.values(initial.state.scenes).map(s => ({ id: s.id, name: field(s.name), orderKey: field(s.orderKey), lifecycle: field(s.lifecycle) }))),
    sceneAssetMembershipsById: membership(initial.state.assetMemberships, 'assetId'),
    sceneCaptionMembershipsById: membership(initial.state.captionMemberships, 'captionId'),
    mediaResourcesById: {}, captionAttachmentsById: {}, captionTagsById: {}, captionTagMembershipsById: {}, viewsById: {}, materialOverridesById: {},
  }, metadataFixtureLimits) as JsonObject;
  return ProjectMetadataSource.bootstrap(records.schema as JsonObject, records.identity as JsonObject, metadataFixtureLimits).initialize(records);
}

export function metadataProjectView(provider: ProjectProviderRead): SyntheticProject {
  if (provider.kind !== 'scene-provider') throw Error('保存したシーンを確認できません。');
  const names: Record<string, string> = {}, colors: Record<string, ReturnType<typeof value<string>>> = {};
  const captionOwners: Record<string, { assetId: string; assetFrameId: string }> = {}, captionTemplates: Record<string, string> = {};
  for (const [id, row] of Object.entries(provider.details.mutable.assetsById)) {
    if (row.label?.kind === 'value' && typeof row.label.value === 'string') names[id] = row.label.value;
  }
  for (const [id, row] of Object.entries(provider.details.mutable.captionsById)) {
    captionTemplates[id] = id;
    const anchor = provider.resources.captions[id]?.anchor;
    if (anchor?.kind === 'value' && anchor.value.kind === 'asset')
      captionOwners[id] = { assetId: anchor.value.assetId, assetFrameId: anchor.value.assetFrameId };
    if (row.colorSrgb?.kind === 'value' && Array.isArray(row.colorSrgb.value))
      colors[id] = value(`#${row.colorSrgb.value.map(v => Math.round(Number(v) * 255).toString(16).padStart(2, '0')).join('')}`);
  }
  return freezeSynthetic({ ...initial, state: provider.state, resources: provider.resources,
    modelNames: names, colors, captionOwners, captionTemplates, modelVersions: metadataModels });
}
