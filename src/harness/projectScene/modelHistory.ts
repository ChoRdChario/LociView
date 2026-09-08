import { value, type Asset } from '../../scene/types';
import { createSyntheticProject, freezeSynthetic } from './fixture';
import type { HistorySnapshot } from './historyPort';
import { syntheticVersions, versionFromClosure } from './modelFixture';
import { canonicalFixture, readFixtureModel, type FixtureModelClosure } from './modelClosure';

export const modelClosureKey = (id: string) => `model/${id}`;
export const modelIdentityKey = (id: string) => `asset/${id}/identity`;
export const modelBindingKey = (id: string) => `asset/${id}/binding`;
export interface FixtureModelIdentity { readonly id: string; readonly label: string; readonly assetFrameId: string; readonly eventId: string }
const initial = createSyntheticProject();
export function modelHistorySeed(): Readonly<Record<string, string>> {
  return Object.fromEntries([
    ...syntheticVersions.map(v => [modelClosureKey(v.projection.bindingId), canonicalFixture(v.closure)]),
    ...Object.values(initial.resources.assets).flatMap(asset => {
      if (asset.projection.kind !== 'value' || asset.lifecycle.kind !== 'value') throw new Error('合成モデルを確認してください。');
      return [[modelBindingKey(asset.id), asset.projection.value.bindingId], [modelIdentityKey(asset.id), canonicalFixture({ id: asset.id,
        label: initial.modelNames[asset.id], assetFrameId: asset.projection.value.assetFrameId, eventId: asset.lifecycle.value.eventId })]];
    }),
  ]);
}
/** Known fixture graph only; rejects unknown roles and verifies all referenced tiny fixture bytes/digests. */
export function projectModelHistory(snapshot: HistorySnapshot, previous?: HistorySnapshot) {
  const closures: Record<string, FixtureModelClosure> = {}, identities: Record<string, FixtureModelIdentity> = {};
  const records = new Map<string, string>(), usedIds = new Set<string>();
  const register = (id: string, payload: unknown) => {
    const text = canonicalFixture(payload), old = records.get(id);
    if (old !== undefined && old !== text) throw new Error('同じモデル識別情報に異なる内容があります。');
    records.set(id, text); usedIds.add(id);
  };
  for (const [key, cell] of Object.entries(snapshot.cells)) {
    if (!key.startsWith('model/') && !key.startsWith('asset/')) continue;
    if (/^asset\/ast_[0-9a-f]{32}\/binding$/.test(key)) continue;
    if (cell.kind !== 'value') throw new Error('モデルの識別情報・固定データに競合があります。');
    if (/^model\/bnd_[0-9a-f]{32}$/.test(key)) {
      const c = readFixtureModel(cell.value);
      if (modelClosureKey(c.binding.id) !== key) throw new Error('モデルの参照を確認してください。');
      closures[c.binding.id] = c;
      for (const record of [c.binding, c.revision, c.representation]) register(record.id, record);
      for (const frame of [c.assetFrame, c.representationFrame]) register(frame.id, { ...frame, assetId: c.binding.assetId });
      register(c.representation.variantFamilyId, { assetId: c.binding.assetId, role: c.representation.role,
        bounds: c.representation.logicalBoundsAsset, catalog: c.representation.materialCatalog });
      register(c.revision.anchorCompatibilityClasses[0]!.id, { assetId: c.binding.assetId,
        families: c.revision.anchorCompatibilityClasses[0]!.targetVariantFamilyIds });
      register(c.representation.materialCatalog.layoutId, { assetId: c.binding.assetId, catalog: c.representation.materialCatalog });
      for (const slot of c.representation.materialCatalog.slots) register(slot.logicalMaterialSlotId, { assetId: c.binding.assetId, slot });
    } else if (/^asset\/ast_[0-9a-f]{32}\/identity$/.test(key)) {
      const meta = JSON.parse(cell.value) as FixtureModelIdentity;
      if (!meta || Object.keys(meta).sort().join(',') !== 'assetFrameId,eventId,id,label' || modelIdentityKey(meta.id) !== key ||
        !/^frm_[0-9a-f]{32}$/.test(meta.assetFrameId) || !/^evt_[0-9a-f]{32}$/.test(meta.eventId) ||
        typeof meta.label !== 'string' || !meta.label.trim() || [...meta.label].length > 256 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(meta.label))
        throw new Error('モデルの名前・識別情報を確認してください。');
      canonicalFixture(meta); identities[meta.id] = freezeSynthetic(meta); usedIds.add(meta.id); usedIds.add(meta.eventId);
    } else throw new Error('この開発版で扱わないモデル情報です。');
  }
  for (const [key, text] of Object.entries(modelHistorySeed())) {
    if (key.endsWith('/binding')) continue;
    const cell = snapshot.cells[key];
    if (cell?.kind !== 'value' || cell.value !== text) throw new Error('元の合成モデル情報がありません。');
  }
  for (const [key, cell] of Object.entries(previous?.cells ?? {})) {
    if ((key.startsWith('model/') || key.endsWith('/identity')) && JSON.stringify(snapshot.cells[key]) !== JSON.stringify(cell))
      throw new Error('公開済みモデル情報は書き換えられません。');
  }
  for (const c of Object.values(closures)) {
    const identity = identities[c.binding.assetId];
    if (!identity || identity.assetFrameId !== c.assetFrame.id) throw new Error('モデルの所有関係・座標系を確認してください。');
    const seen = new Set([c.binding.id]); let parent = c.binding.parentBindingId;
    while (parent) {
      const previous = closures[parent];
      if (!previous || previous.binding.assetId !== c.binding.assetId || previous.assetFrame.id !== c.assetFrame.id || seen.has(parent))
        throw new Error('モデルの更新履歴を確認してください。');
      seen.add(parent); parent = previous.binding.parentBindingId;
    }
  }
  const versions = Object.values(closures).map(versionFromClosure), assets: Record<string, Asset> = {}, names: Record<string, string> = {};
  for (const meta of Object.values(identities)) {
    const cell = snapshot.cells[modelBindingKey(meta.id)]; if (!cell) throw new Error('モデルの参照先がありません。');
    const targets = cell.kind === 'value' ? [cell.value] : cell.candidates.map(c => c.value);
    if (!targets.length || targets.some(id => closures[id]?.binding.assetId !== meta.id)) throw new Error('モデルの参照先を確認してください。');
    assets[meta.id] = { id: meta.id, lifecycle: value({ state: 'active', eventId: meta.eventId,
      reason: initial.resources.assets[meta.id] ? 'initial' : 'conflictResolution' }),
      projection: cell.kind === 'value' ? value(versions.find(v => v.projection.bindingId === cell.value)!.projection) : { kind: 'unresolved', reason: 'conflict' } };
    names[meta.id] = meta.label;
  }
  if (Object.keys(snapshot.cells).some(key => /^asset\//.test(key) && !identities[key.split('/')[1]!])) throw new Error('モデルがありません。');
  return { versions: freezeSynthetic(versions), assets, names, usedIds, identities };
}
