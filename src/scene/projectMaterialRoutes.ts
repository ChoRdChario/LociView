import type { ProjectProviderRead } from './projectProvider';
import type { Material } from './types';
import { object } from '../domain/projectGraphSupport';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
type Routing = Extract<Material['routing'], { kind: 'value' }>['value'];

/** Reservation keys only, never authoritative resolved values or invented targets. */
export function projectMaterialRoutes(provider: Provider, id: string) {
  const field = provider.inspection.candidates.fields.find(f => f.path.length === 3 &&
    f.path[0] === 'materialOverridesById' && f.path[1] === id && f.path[2] === 'routing');
  const routes: Routing[] = []; let complete = !!field?.candidates.length;
  for (const c of field?.candidates ?? []) {
    if (!field!.validOperationIds.includes(c.operationId) || c.value.kind !== 'value') { complete = false; continue; }
    const raw = object(c.value.value), scope = object(raw.scope), t = object(raw.target);
    // Unknown extras cannot change the known reservation key or create an empty slot.
    routes.push({ scope: scope.kind === 'scene' ? { kind: 'scene', sceneId: scope.sceneId as string } : { kind: 'project' },
      target: { assetId: t.assetId as string, variantFamilyId: t.variantFamilyId as string,
        materialLayoutId: t.materialLayoutId as string, logicalMaterialSlotId: t.logicalMaterialSlotId as string } });
  }
  return { routes, complete, hasUnknownFields: field?.hasUnknownFields ?? false };
}
