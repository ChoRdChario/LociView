import type { ProjectProviderRead } from '../../scene/projectProvider';
import type { Field } from '../../scene/types';
import { canonical, same } from '../../domain/projectGraphSupport';
import type { JsonValue } from '../../domain/values';
import { entryKey, readProjectCamera, readSolidBackground, viewKey, type ViewData } from './viewHistory';
import type { HistoryCell } from './historyPort';

/** UI projection only. All values and causal identities come from the same provider. */
export function metadataViewData(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>): ViewData {
  const fields = new Map(provider.inspection.candidates.fields.map(f => [JSON.stringify(f.path), f]));
  const cells: Record<string, HistoryCell> = {}, versions: Record<string, string> = {}, records: Record<string, ViewData['records'][string]> = {};
  const project = (key: string, path: string[], field: Field<JsonValue | undefined>, text: (v: JsonValue | undefined) => string) => {
    const f = fields.get(JSON.stringify(path)), candidates = f?.candidates ?? [];
    // Initially absent optional values and explicit delete operations remain distinct.
    versions[key] = JSON.stringify([path, candidates.map(c => JSON.stringify([c.changeId, c.operationId, c.value.kind])).sort()]);
    if (field.kind !== 'value' || (f && (!f.valid || candidates.length !== 1))) return;
    if (!f && field.value !== undefined) return;
    const original = candidates[0]?.value;
    if ((original?.kind === 'value' && !same(original.value, field.value)) ||
      (original?.kind === 'absent' && field.value !== undefined)) return;
    cells[key] = { kind: 'value', value: text(field.value) };
  };
  const mapped = <T>(field: Field<unknown>, parse: (v: unknown) => T): Field<T> => {
    if (field.kind !== 'value') return field;
    try { return { kind: 'value', value: parse(field.value) }; }
    catch { return { kind: 'unresolved', reason: 'invalid' }; } // Preserve source; no fallback capture.
  };
  for (const [id, r] of Object.entries(provider.details.mutable.viewsById)) {
    const v = provider.resources.views[id]; if (!v) continue;
    records[id] = { ...v, name: r.name as Field<string>, orderKey: r.orderKey as Field<string>,
      camera: mapped(v.camera, readProjectCamera), background: mapped(v.background, readSolidBackground) };
    for (const [field, key] of [['name', 'name'], ['orderKey', 'order'], ['camera', 'camera'], ['background', 'background'], ['lifecycle', 'lifecycle']])
      project(viewKey(id, key!), ['viewsById', id, field!], r[field!]!, value => typeof value === 'string' ? value : canonical(value!));
    const identityFields = ['id', 'sceneId', 'projectFrameId'];
    if (identityFields.every(k => r[k]?.kind === 'value')) cells[viewKey(id, 'identity')] = {
      kind: 'value', value: canonical({ id, sceneId: v.sceneId, projectFrameId: v.projectFrameId }) };
  }
  for (const [id, row] of Object.entries(provider.details.mutable.scenesById))
    project(entryKey(id), ['scenesById', id, 'defaultViewId'], row.defaultViewId!, value => canonical(value ?? null));
  return { records, cells, versions };
}
