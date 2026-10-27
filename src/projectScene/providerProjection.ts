import { freezeDisplay, type ProjectDisplay } from './displayTypes';
import type { JsonObject } from '../domain/values';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { value } from '../scene/types';
import { metadataViewData } from './metadataViews';
import { metadataMaterialData } from './metadataMaterials';
import { metadataMediaData } from './metadataMedia';
import type { MediaData } from './mediaDisplay';
import type { DisplayModelVersion } from './modelTypes';
export function metadataProjectView(provider: ProjectProviderRead, images: NonNullable<MediaData['images']> = {},
  models?: readonly DisplayModelVersion[]): ProjectDisplay {
  if(!models)throw Error('保存したモデルの表示情報を確認してください。');
  if (provider.kind !== 'scene-provider') throw Error('保存したシーンを確認できません。');
  const identity = provider.inspection.candidates.fields.find(f => f.path.length === 1 && f.path[0] === 'identity');
  const original = identity?.candidates[0]?.value;
  if (!identity?.valid || identity.candidates.length !== 1 || original?.kind !== 'value' ||
    !original.value || typeof original.value !== 'object' || Array.isArray(original.value))
    throw Error('保存したプロジェクトの識別情報を確認できません。');
  const projectId = (original.value as JsonObject).projectId;
  if (typeof projectId !== 'string') throw Error('保存したプロジェクトの識別情報を確認できません。');
  const names: Record<string, string> = {}, colors: Record<string, ReturnType<typeof value<string>>> = {};
  const unsetCaptionColors: string[] = [];
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
    else if (row.colorSrgb?.kind === 'value' && row.colorSrgb.value === undefined) {
      colors[id] = value('#a08045'); unsetCaptionColors.push(id);
    }
  }
  return freezeDisplay({ projectId, semanticProfile: provider.semanticProfile, state: provider.state, resources: provider.resources,
    modelNames: names, colors, unsetCaptionColors, captionOwners, captionTemplates, modelVersions: models,
    viewData: metadataViewData(provider), materialData: metadataMaterialData(provider), mediaData: metadataMediaData(provider, images) });
}
