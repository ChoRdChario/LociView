import type { ProjectProviderRead } from '../../scene/projectProvider';
import { projectMaterialRoutes } from '../../scene/projectMaterialRoutes';
import type { Field } from '../../scene/types';
import { canonical, same } from '../../domain/projectGraphSupport';
import { validateMaterialIntent, type MaterialAppearance, type MaterialCompositing, type MaterialIntent } from '../../domain/materialIntent';
import { materialKey, materialLimits, type MaterialData } from './materialHistory';
import type { HistoryCell } from './historyPort';

/** Same-provider display/acknowledgment plus complete original routing reservations. */
export function metadataMaterialData(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>): MaterialData {
  const records: Record<string, MaterialData['records'][string]> = {}, cells: Record<string, HistoryCell> = {};
  const fields = new Map(provider.inspection.candidates.fields.map(f => [JSON.stringify(f.path), f]));
  let routingUncertain = false;
  for (const [id, row] of Object.entries(provider.details.mutable.materialOverridesById)) {
    const material = provider.resources.materials[id]!, candidates = projectMaterialRoutes(provider, id);
    if (!candidates.complete && !(material.lifecycle.kind === 'value' && material.lifecycle.value.state === 'deleted')) routingUncertain = true;
    let intent: Field<MaterialIntent> = { kind: 'unresolved', reason: 'invalid' };
    if (material.intent.kind !== 'value') intent = material.intent;
    else try { intent = { kind: 'value', value: validateMaterialIntent(material.intent.value, materialLimits, provider.semanticProfile) }; } catch { /* Preserve invalid source. */ }
    records[id] = { ...material, candidates: candidates.routes,
      routing: candidates.hasUnknownFields ? { kind: 'unresolved', reason: 'invalid' } : material.routing,
      appearance: row.appearance as Field<MaterialAppearance>, compositing: row.compositing as Field<MaterialCompositing>, intent };
    for (const name of ['routing', 'appearance', 'compositing', 'lifecycle']) {
      const f = fields.get(JSON.stringify(['materialOverridesById', id, name])), value = row[name], original = f?.candidates[0]?.value;
      if (value?.kind === 'value' && value.value !== undefined && f?.valid && f.candidates.length === 1 &&
        original?.kind === 'value' && same(original.value, value.value)) cells[materialKey(id, name)] = { kind: 'value', value: canonical(value.value) };
    }
  }
  return { records, cells, routingUncertain };
}
