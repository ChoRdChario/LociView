import { createFixtureModel } from '../../src/harness/projectScene/modelClosure';
import { fixtureMedia } from '../../src/harness/projectScene/mediaHistory';

export const id = (prefix: string, n = 1) => `${prefix}_${n.toString(16).padStart(32, '0')}`;
export const limits = { maxNodes: 100_000, maxDepth: 32, maxStringScalars: 65_536 };
export const lifecycle = () => ({ state: 'active', eventId: id('evt'), reason: 'initial' });
/** All amended map kinds, known public fixture metadata; never real input/adoption evidence. */
export function fixture(): Record<string, any> {
  const model = createFixtureModel({ asset: id('ast'), assetFrame: id('frm', 2), representationFrame: id('frm', 3), binding: id('bnd'), revision: id('rev'), representation: id('rep'),
    family: id('fam'), compatibility: id('cmp'), layout: id('lay'), slot: id('slot') }, 'original', { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 });
  const table = <T extends { id: string }>(record: T) => ({ [record.id]: record });
  return structuredClone({ schema: { major: 2, minor: 0 }, identity: { projectId: id('prj'), historyEpoch: id('hep'), lineageSeed: '0'.repeat(64) },
    project: { title: '資料', defaultSceneId: id('scn'), frame: { id: id('frm'), handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } } },
    assetsById: table({ id: id('ast'), label: '模型', assetFrameId: id('frm', 2), status: { kind: 'ready', activeBindingId: id('bnd') }, lifecycle: lifecycle() }),
    assetRevisionsById: table(model.revision), assetBindingsById: table(model.binding), representationsById: table(model.representation), mediaResourcesById: table(fixtureMedia[0]!.record),
    captionsById: table({ id: id('cap'), title: '記録', body: '本文\r\n\t次の行\r保持', colorSrgb: [0.1, 0.2, 0.3], lifecycle: lifecycle(),
      anchor: { kind: 'asset', assetId: id('ast'), assetFrameId: id('frm', 2), positionAsset: [0, 0, 0], authoredAssetRevisionId: id('rev'), authoredAnchorCompatibilityId: id('cmp'), hitEvidence: { method: 'manual' } } }),
    captionAttachmentsById: table({ id: id('att'), captionId: id('cap'), mediaResourceId: fixtureMedia[0]!.record.id, altText: '説明', orderKey: 'A', lifecycle: lifecycle() }),
    captionTagsById: table({ id: id('tag'), label: '確認', colorSrgb: [0.2, 0.3, 0.4], orderKey: 'A', lifecycle: lifecycle() }),
    captionTagMembershipsById: table({ id: id('tgm'), captionId: id('cap'), tagId: id('tag'), lifecycle: lifecycle() }),
    scenesById: table({ id: id('scn'), name: '全体', orderKey: 'A', defaultViewId: id('view'), lifecycle: lifecycle() }),
    sceneAssetMembershipsById: table({ id: id('sam'), sceneId: id('scn'), assetId: id('ast'), orderKey: 'A', lifecycle: lifecycle() }),
    sceneCaptionMembershipsById: table({ id: id('scm'), sceneId: id('scn'), captionId: id('cap'), orderKey: 'A', lifecycle: lifecycle() }),
    viewsById: table({ id: id('view'), sceneId: id('scn'), name: '正面', orderKey: 'A', projectFrameId: id('frm'), lifecycle: lifecycle(),
      camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 1 } }, background: { kind: 'solid', colorSrgb: [0.8, 0.8, 0.8] } }),
    materialOverridesById: table({ id: id('ovr'), routing: { scope: { kind: 'scene', sceneId: id('scn') }, target: { assetId: id('ast'), variantFamilyId: id('fam'), materialLayoutId: id('lay'), logicalMaterialSlotId: id('slot') } },
      appearance: {}, compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' }, lifecycle: lifecycle() }) });
}
