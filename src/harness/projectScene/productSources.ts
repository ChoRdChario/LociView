import { value, type Field } from '../../scene/types';
import { resolveScene } from '../../scene/resolve';
import type { JsonObject } from '../../domain/values';
import { materialFields } from '../../domain/materialIntent';
import { materialResolutionContext } from '../../projectMetadata/materialResolution';
import { assetStatusCandidates } from '../../projectMetadata/assetStatus';
import { assetMembershipGroups, planAssetMembershipResolution } from '../../projectMetadata/membership';
import { assetCopySource, prepareAssetMembershipCopy } from '../../projectMetadata/modelMembership';
import { entryViewCandidates, viewFieldCandidates } from '../../projectMetadata/viewResolution';
import { newId } from '../../projectMetadata/persistence';
import type { MaterialRecordPort, MaterialSource } from '../../ui/projectScene/materialState';
import type { ProjectWorkspacePorts, WorkspaceMaterialReview } from '../../ui/projectScene/projectWorkspacePorts';
import { fieldValue } from '../../ui/projectScene/projectRead';
import { metadataViewData } from './metadataViews';
import { entryKey, viewKey, orderBetween } from './viewHistory';
import { viewLabel, viewDescription } from './viewCandidateLabels';
import { rotationDegrees, degreesRotation, finiteInput } from './modelTransform';
import { materialBucket, materialLimits, sourceMaterialIntent } from './materialHistory';
import { validationMaterialSlots, validationMaterialSourceIssue, validationMaterialIssue } from './validationMaterials';
import { describeMaterialCandidate } from './materialReview';
import { normalizeAlt } from './mediaHistory';
import { canonicalFixture } from './modelClosure';
import { pinPositionInParent } from './pinParent';
import type { createValidationModeHost } from './validationModeHost';

/** Read adapters only: no Session exposure, synthetic editor or mutation authority. */
export function productSources(host: ReturnType<typeof createValidationModeHost>): Pick<ProjectWorkspacePorts,
  'modelDetails' | 'modelPlacement' | 'modelAngles' | 'modelReview' | 'modelDeletion' | 'prepareModelMembership' | 'views' | 'viewOrder' | 'viewReview' | 'materials' | 'mediaDescription' | 'captionDeletion' | 'pinPositionInParent'> {
  const provider = () => { const p = host.read().provider; if (p?.kind !== 'scene-provider') throw Error('プロジェクトの内容を確認してください。'); return p; };
  return {
    mediaDescription: normalizeAlt,
    captionDeletion: (token, captionId) => host.authority.captionDeletionImpact!(token, captionId),
    pinPositionInParent(token, captionId, assetId) {
      const p = provider(), snapshot = host.authority.read();
      if (p.token !== token || snapshot.state.token !== token) throw Error('対象が更新されています。取り消して選び直してください。');
      if (!snapshot.modelVersions?.length || !snapshot.modelVersions.some(v => v.assetId === assetId && v.closure.shape === 'saved-glb')) return null;
      return pinPositionInParent(snapshot, captionId, assetId);
    },
    modelDetails(sceneId, assetId) {
      const p = provider(), snapshot = host.authority.read(); if (p.token !== snapshot.state.token) return null;
      const asset = p.resources.assets[assetId], projection = asset?.projection;
      const version = projection?.kind === 'value' ? snapshot.modelVersions?.find(v => v.assetId === assetId && v.projection.bindingId === projection.value.bindingId) : undefined;
      if (!version || version.closure.shape !== 'saved-glb') return null;
      const ids = new Set<string>(); let uncertain = false;
      for (const fields of Object.values(p.details.mutable.sceneAssetMembershipsById)) {
        if ((fieldValue(fields.lifecycle) as JsonObject | undefined)?.state === 'deleted') continue;
        const owner = fieldValue(fields.assetId); if (typeof owner === 'string' && owner !== assetId) continue;
        const scene = fieldValue(fields.sceneId);
        if (owner !== assetId || typeof scene !== 'string' || (fieldValue(fields.lifecycle) as JsonObject | undefined)?.state !== 'active' || ids.has(scene)) uncertain = true;
        else ids.add(scene);
      }
      return { target: { kind: 'model', token: p.token, sceneId, assetId, bindingId: version.projection.bindingId },
        placement: version.closure.binding.assetToProject, rotationDegrees: rotationDegrees(version.closure.binding.assetToProject.rotationXYZW),
        sceneCount: uncertain ? { kind: 'unresolved', reason: 'conflict' } : value(ids.size) };
    },
    modelPlacement(translation, rotation, scale) {
      if (translation.length !== 3 || rotation.length !== 3 || !translation.every(finiteInput) || !finiteInput(scale) || Number(scale) <= 0) throw Error('位置・回転と正の倍率を確認してください。');
      return { translation: translation.map(Number) as unknown as readonly [number, number, number],
        rotationXYZW: degreesRotation(rotation as [string, string, string]), uniformScale: Number(scale) };
    },
    modelAngles: rotationDegrees,
    modelReview(sceneId) {
      const p = provider(), statuses: ReturnType<ProjectWorkspacePorts['modelReview']>['statuses'][number][] = [];
      for (const [id, fields] of Object.entries(p.details.mutable.assetsById)) if (fields.status?.kind === 'unresolved') {
        try { statuses.push({ assetId: id, label: String(fieldValue(fields.label) ?? 'モデル'), choices: assetStatusCandidates(p, id, host.limits).map((c, i) => {
          const placement = c.binding.assetToProject as unknown as import('../../ui/projectScene/projectWorkspacePorts').WorkspacePlacement;
          return { operationId: c.operationId, label: `候補 ${i + 1}：位置 ${placement.translation.join(' / ')}、回転 ${rotationDegrees(placement.rotationXYZW).join(' / ')}°、倍率 ${placement.uniformScale}` };
        }) }); } catch { statuses.push({ assetId: id, label: String(fieldValue(fields.label) ?? 'モデル'), choices: [], issue: 'モデルまたは配置を確認できないため、候補を確定できません。保存した内容は保持しています。' }); }
      }
      return { statuses, memberships: assetMembershipGroups(p, host.limits).filter(g => g.sceneId === sceneId) };
    },
    modelDeletion: assetId => host.authority.assetDeletionImpact!(provider().token, assetId),
    async prepareModelMembership(token, sceneId, assetId, observedIds, keepId, choice) {
      const p = provider(); if (p.token !== token) throw Error('モデルの登録が更新されています。選択を保持しています。');
      const base = { kind: 'resolveAssetMembership' as const, sceneId, assetId, observedMembershipIds: [...observedIds], originalMembershipId: keepId, choice, eventId: `evt_${newId()}` };
      planAssetMembershipResolution(p, { ...base, choice: 'one' }, host.limits);
      if (choice === 'one') return base;
      const source = assetCopySource(p, sceneId, assetId, host.limits);
      return { ...base, copies: await Promise.all(observedIds.filter(id => id !== keepId).map(id => prepareAssetMembershipCopy(source, id, prefix => `${prefix}_${newId()}`))) };
    },
    viewOrder: orderBetween,
    viewReview(sceneId) {
      const p = provider(), groups: ReturnType<ProjectWorkspacePorts['viewReview']>[number][] = [];
      if (p.state.scenes[sceneId]?.defaultViewId.kind !== 'value') try { const entry = entryViewCandidates(p, sceneId, host.limits); groups.push({ key: `entry/${sceneId}`, label: '開始時の視点', target: { kind: 'entry' },
        choices: entry.candidates.map(c => ({ operationId: c.operationId, label: viewDescription(p, sceneId, 'defaultViewId', c.value.kind === 'value' ? c.value.value : undefined, sceneId) })) }); }
      catch { groups.push({ key: `entry/${sceneId}`, label: '開始時の視点：候補を確認できないため変更できません。', target: { kind: 'entry' }, choices: [] }); }
      for (const [id, fields] of Object.entries(p.details.mutable.viewsById)) if (fieldValue(fields.sceneId) === sceneId)
        for (const field of ['name', 'orderKey', 'camera', 'background'] as const) if (fields[field]?.kind === 'unresolved') try {
          const checked = viewFieldCandidates(p, id, field, host.limits);
          if (checked.candidates.some(c => c.value.kind !== 'value')) throw Error('候補を確認してください。');
          groups.push({ key: `${id}/${field}`, label: `${viewLabel(p, id)}：${({ name: '名称', orderKey: '順序', camera: 'カメラ', background: '背景' })[field]}`,
            target: { kind: 'view', viewId: id, field }, choices: checked.candidates.map(c => ({ operationId: c.operationId, label: viewDescription(p, id, field, c.value.kind === 'value' ? c.value.value : undefined, sceneId) })) });
        } catch { groups.push({ key: `${id}/${field}`, label: `${viewLabel(p, id)}：更新候補を確認できないため変更できません。`, target: { kind: 'view', viewId: id, field }, choices: [] }); }
      return groups;
    },
    views(sceneId, selected) {
      const p = provider(), data = metadataViewData(p), scene = p.state.scenes[sceneId], ready = resolveScene(p.state, p.resources, sceneId).kind === 'ready';
      const scope = { token: p.token, sceneId, projectFrameId: p.resources.projectFrameId };
      const camera = selected && data.versions[viewKey(selected, 'camera')], background = selected && data.versions[viewKey(selected, 'background')];
      return { source: ready ? { ...scope, kind: 'ready', views: Object.values(data.records), entryViewId: scene!.defaultViewId } :
        { ...scope, kind: 'unavailable', reason: 'シーンの状態を確認してください。' },
        versions: selected && camera && background ? { sourceToken: p.token, viewId: selected, camera, background } : null,
        entryVersion: data.versions[entryKey(sceneId)] ?? '',
        deletion: selected ? { sourceToken: p.token, viewId: selected,
          issue: Object.values(p.state.scenes).some(s => s.defaultViewId.kind !== 'value' || s.defaultViewId.value === selected) ? '開始時の視点の設定を確認してください。' : null } : null };
    },
    materials(sceneId) {
      const p = provider(), snapshot = host.authority.read();
      const record = (target: Parameters<typeof materialBucket>[1]['target'], scope: 'project' | 'scene'): Field<MaterialRecordPort | null> => {
        const bucket = materialBucket(snapshot.materialData, { target, scope: scope === 'scene' ? { kind: 'scene', sceneId } : { kind: 'project' } });
        return bucket.kind !== 'value' ? bucket : value(bucket.value ? { id: bucket.value.id, target, scope,
          sceneId: scope === 'scene' ? sceneId : null, intent: bucket.value.intent } : null);
      };
      const base = { token: p.token, sceneId, projectId: snapshot.projectId!, semanticProfile: p.semanticProfile, limits: materialLimits };
      const source: MaterialSource = snapshot.state.token !== p.token ? { ...base, kind: 'unavailable', reason: '表示の更新を再試行してください。' } :
        { ...base, kind: 'ready', models: Object.values(p.resources.assets).filter(a => !(a.lifecycle.kind === 'value' && a.lifecycle.value.state === 'deleted')).map(asset => {
          const projection = asset.projection;
          const version = projection.kind === 'value' ? snapshot.modelVersions?.find(v => v.assetId === asset.id && v.projection.bindingId === projection.value.bindingId) : undefined;
          const name = p.details.mutable.assetsById[asset.id]!.label as Field<string>;
          if (!version || version.closure.shape !== 'saved-glb') return { assetId: asset.id, name, surfaces: { kind: 'unresolved', reason: 'conflict' }, reason: 'モデルの状態を確認してください。' };
          return { assetId: asset.id, name, reason: null, surfaces: value(validationMaterialSlots(version.closure).map(slot => ({
            target: slot.target, name: value(slot.name), project: record(slot.target, 'project'), scene: record(slot.target, 'scene'), sourceIntent: value(sourceMaterialIntent),
            fieldIssues: Object.fromEntries(materialFields.map(f => [f, validationMaterialSourceIssue(slot) ??
              (['lighting', 'doubleSided', 'chroma', 'keyColor', 'tolerance'].includes(f) ? null : 'この設定は実モデルへ未接続です。')])) as Record<typeof materialFields[number], string | null>,
            admit: intent => validationMaterialIssue(slot, intent, p.semanticProfile) }))) };
        }) };
      const review: WorkspaceMaterialReview[] = [], seen = new Set<string>();
      for (const [id, fields] of Object.entries(p.details.mutable.materialOverridesById)) {
        if ((fieldValue(fields.lifecycle) as JsonObject | undefined)?.state === 'deleted') continue;
        const atom = p.inspection.candidates.fields.find(f => f.path.join('/') === `materialOverridesById/${id}/routing`);
        const route = atom?.valid && !atom.hasUnknownFields && atom.candidates.length === 1 && atom.candidates[0]!.value.kind === 'value' ? atom.candidates[0]!.value.value as JsonObject : null;
        if (!route || ((route.scope as JsonObject).kind === 'scene' && (route.scope as JsonObject).sceneId !== sceneId)) continue;
        try {
          const context = materialResolutionContext(p, sceneId, id, host.limits), appearance = context.atoms(id, 'appearance'), compositing = context.atoms(id, 'compositing');
          const bucket = canonicalFixture(context.routing), duplicate = !seen.has(bucket); seen.add(bucket);
          if (appearance.length < 2 && compositing.length < 2 && (!duplicate || context.ids.length < 2)) continue;
          const describe = (field: 'appearance' | 'compositing', value: JsonObject) => describeMaterialCandidate(field, canonicalFixture(value), snapshot);
          const target = context.routing.target as JsonObject, version = snapshot.modelVersions?.find(v => v.assetId === target.assetId);
          const slot = version?.closure.shape === 'saved-glb' ? validationMaterialSlots(version.closure).find(s => canonicalFixture(s.target) === canonicalFixture(target))?.name : undefined;
          review.push({ key: `${bucket}/${id}`, token: p.token, sceneId, overrideId: id, label: `${snapshot.modelNames[target.assetId as string] ?? 'モデル'}／${slot ?? '面を確認してください'}／${(context.routing.scope as JsonObject).kind === 'scene' ? 'このシーンだけ' : 'プロジェクト共通'}`,
            appearance: appearance.map(a => ({ operationId: a.operationId, label: describe('appearance', a.value) })),
            compositing: compositing.map(a => ({ operationId: a.operationId, label: describe('compositing', a.value) })),
            owners: duplicate ? context.ids.map((owner, index) => { const a = context.atoms(owner, 'appearance'), c = context.atoms(owner, 'compositing');
              return { id: owner, label: `設定 ${index + 1}：${a.length === 1 && c.length === 1 ? `${describe('appearance', a[0]!.value)}／${describe('compositing', c[0]!.value)}` : '内容の競合を先に解消してください'}` }; }) : [] });
        } catch { /* Exact unknown candidates stay unavailable in the source projection. */ }
      }
      return { source, review };
    },
  };
}
