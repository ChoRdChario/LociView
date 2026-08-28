import type {
  NativeAssetBindingRevisionV1,
  NativeDisplayMode,
  NativeProjectSnapshotV1,
  NativeRepresentationV1,
} from './schema';

export interface NativeResourceStateV1 {
  readonly availability: 'ready' | 'missing' | 'failed';
  readonly registration: 'known' | 'unknown';
}

export interface NativeSliceResolutionV1 {
  readonly effectiveDisplayMode: NativeDisplayMode | 'none';
  readonly visibleRepresentationIds: readonly string[];
  readonly proxyRendered: false;
  readonly interaction:
    | {
        readonly enabled: true;
        readonly targetAssetId: string;
        readonly surfaceRepresentationId: string;
        readonly targetRole: 'meshPrimary' | 'gsPrimary';
      }
    | { readonly enabled: false; readonly reason: string };
  readonly issues: readonly string[];
}

function isReady(states: ReadonlyMap<string, NativeResourceStateV1>, representation: NativeRepresentationV1): boolean {
  const state = states.get(representation.id);
  return state?.availability === 'ready' && state.registration === 'known';
}

export function activeNativeBindingV1(
  snapshot: NativeProjectSnapshotV1,
  assetId: string,
): NativeAssetBindingRevisionV1 | null {
  const asset = snapshot.assets.find((candidate) => candidate.id === assetId);
  if (asset === undefined) return null;
  const binding = snapshot.assetBindingRevisions.find((candidate) => candidate.id === asset.status.activeBindingId);
  return binding?.assetId === assetId ? binding : null;
}

export function activeNativeRepresentationsV1(
  snapshot: NativeProjectSnapshotV1,
  assetId: string,
): NativeRepresentationV1[] {
  const binding = activeNativeBindingV1(snapshot, assetId);
  const revision = snapshot.assetRevisions.find((candidate) => candidate.id === binding?.assetRevisionId);
  if (binding?.assetId !== assetId || revision?.assetId !== assetId) return [];
  const ids = new Set(revision.representationIds);
  return snapshot.representations.filter((candidate) => candidate.assetId === assetId && ids.has(candidate.id));
}

export function allActiveNativeRepresentationsV1(snapshot: NativeProjectSnapshotV1): NativeRepresentationV1[] {
  const ids = new Set(snapshot.assets.flatMap((asset) => (
    activeNativeRepresentationsV1(snapshot, asset.id).map((representation) => representation.id)
  )));
  return snapshot.representations.filter((representation) => ids.has(representation.id));
}

export function resolveNativeGsSliceV1(
  snapshot: NativeProjectSnapshotV1,
  states: ReadonlyMap<string, NativeResourceStateV1>,
): NativeSliceResolutionV1 {
  const issues: string[] = [];
  const activeRepresentations = allActiveNativeRepresentationsV1(snapshot);
  const meshRepresentations = activeRepresentations.filter((representation) => representation.role === 'meshPrimary');
  const gsRepresentations = activeRepresentations.filter((representation) => representation.role === 'gsPrimary');
  const usableMesh = meshRepresentations.filter((representation) => isReady(states, representation));
  const usableGs = gsRepresentations.filter((representation) => isReady(states, representation));
  for (const representation of meshRepresentations) {
    const state = states.get(representation.id);
    if (state?.registration === 'unknown') issues.push(`Mesh registration is unknown: ${representation.id}`);
    else if (state?.availability !== 'ready') issues.push(`Mesh resource is unavailable: ${representation.id}`);
  }
  for (const representation of gsRepresentations) {
    const state = states.get(representation.id);
    if (state?.registration === 'unknown') issues.push(`GS registration is unknown: ${representation.id}`);
    else if (state?.availability !== 'ready') issues.push(`GS resource is unavailable: ${representation.id}`);
  }

  const requested = snapshot.presentation.displayMode;
  const meshRequested = requested === 'mixed' || requested === 'mesh-only';
  const gsRequested = requested === 'mixed' || requested === 'gs-only';
  let showMesh = meshRequested && usableMesh.length > 0;
  let showGs = gsRequested && usableGs.length > 0;
  if (!showMesh && !showGs) {
    if (usableMesh.length > 0) {
      showMesh = true;
      issues.push('Requested visual resources were unavailable; degraded to Mesh-only.');
    } else if (usableGs.length > 0) {
      showGs = true;
      issues.push('Requested visual resources were unavailable; degraded to GS-only.');
    }
  }
  const effectiveDisplayMode: NativeSliceResolutionV1['effectiveDisplayMode'] =
    showMesh && showGs ? 'mixed' : showMesh ? 'mesh-only' : showGs ? 'gs-only' : 'none';
  if (effectiveDisplayMode === 'none') issues.push('Both visual resource lanes are unusable; no Asset is activated.');

  const visibleRepresentationIds = [
    ...(showMesh ? usableMesh.map((representation) => representation.id) : []),
    ...(showGs ? usableGs.map((representation) => representation.id) : []),
  ].sort();
  const targetAssetId = snapshot.presentation.captionTargetAssetId;
  if (targetAssetId === null) {
    return {
      effectiveDisplayMode,
      visibleRepresentationIds,
      proxyRendered: false,
      interaction: { enabled: false, reason: 'Select a Caption target Asset explicitly.' },
      issues,
    };
  }
  const targetRepresentations = activeNativeRepresentationsV1(snapshot, targetAssetId);
  const targetMesh = targetRepresentations.find((representation) => representation.role === 'meshPrimary');
  if (targetMesh !== undefined) {
    if (!showMesh || !isReady(states, targetMesh)) {
      return {
        effectiveDisplayMode,
        visibleRepresentationIds,
        proxyRendered: false,
        interaction: { enabled: false, reason: 'The selected Mesh is not visible and usable.' },
        issues,
      };
    }
    return {
      effectiveDisplayMode,
      visibleRepresentationIds,
      proxyRendered: false,
      interaction: {
        enabled: true,
        targetAssetId,
        surfaceRepresentationId: targetMesh.id,
        targetRole: 'meshPrimary',
      },
      issues,
    };
  }

  const targetGs = targetRepresentations.find((representation) => representation.role === 'gsPrimary');
  if (targetGs === undefined || !showGs || !isReady(states, targetGs)) {
    return {
      effectiveDisplayMode,
      visibleRepresentationIds,
      proxyRendered: false,
      interaction: { enabled: false, reason: 'The selected GS is not visible and usable.' },
      issues,
    };
  }
  const allProxies = activeRepresentations.filter((representation) => representation.role === 'interactionProxy');
  const sameAssetProxies = targetRepresentations.filter((representation) => representation.role === 'interactionProxy');
  const bound = sameAssetProxies.filter((representation) => (
    representation.proxyForGsVariantFamilyId === targetGs.variantFamilyId &&
    representation.derivedFrom.length === 1 && representation.derivedFrom[0] === targetGs.id
  ));
  const suspicious = allProxies.some((representation) => (
    representation.proxyForGsVariantFamilyId === targetGs.variantFamilyId && representation.assetId !== targetAssetId
  ));
  if (suspicious || bound.length > 1 || (sameAssetProxies.length > 0 && bound.length !== 1)) {
    issues.push('The GS-to-Proxy binding is invalid or cross-Asset; no surface was inferred.');
    return {
      effectiveDisplayMode,
      visibleRepresentationIds,
      proxyRendered: false,
      interaction: { enabled: false, reason: 'Invalid or cross-Asset GS-to-Proxy binding.' },
      issues,
    };
  }
  const proxy = bound[0];
  if (proxy === undefined) {
    issues.push('The GS is view-only because no matching dedicated Proxy is available.');
    return {
      effectiveDisplayMode,
      visibleRepresentationIds,
      proxyRendered: false,
      interaction: { enabled: false, reason: 'GS is view-only: no matching dedicated Proxy.' },
      issues,
    };
  }
  const proxyState = states.get(proxy.id);
  if (proxyState?.registration === 'unknown') {
    issues.push('Proxy-to-GS registration is unknown; identity was not guessed.');
    return {
      effectiveDisplayMode,
      visibleRepresentationIds,
      proxyRendered: false,
      interaction: { enabled: false, reason: 'Proxy registration is unknown.' },
      issues,
    };
  }
  if (proxyState?.availability !== 'ready') {
    issues.push('The GS remains visible, but its dedicated Proxy is unavailable.');
    return {
      effectiveDisplayMode,
      visibleRepresentationIds,
      proxyRendered: false,
      interaction: { enabled: false, reason: 'GS is view-only: dedicated Proxy unavailable.' },
      issues,
    };
  }
  return {
    effectiveDisplayMode,
    visibleRepresentationIds,
    proxyRendered: false,
    interaction: {
      enabled: true,
      targetAssetId,
      surfaceRepresentationId: proxy.id,
      targetRole: 'gsPrimary',
    },
    issues,
  };
}
