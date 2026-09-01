import {
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  NATIVE_SCHEMA_VERSION,
  NATIVE_SNAPSHOT_FORMAT,
  nativeCaptionDisplaySetIdV1,
  nativeCaptionOwnerAssetIdV1,
  nativeDisplaySetsV1,
  nativeSavedViewDisplaySetIdV1,
  newNativeId,
  parseNativeSnapshotV1,
  serializeNativeSnapshotV1,
  type NativeProjectSnapshotV1,
} from './schema';

export interface NativeExchangeSnapshotPlanV1 {
  readonly snapshot: NativeProjectSnapshotV1;
  /** package Representation ID -> durable source Representation ID */
  readonly representationSourceIds: ReadonlyMap<string, string>;
  /** package media ID -> durable source media ID */
  readonly mediaSourceIds: ReadonlyMap<string, string>;
}

function parsed(snapshot: NativeProjectSnapshotV1): NativeProjectSnapshotV1 {
  return parseNativeSnapshotV1(serializeNativeSnapshotV1(snapshot));
}

export function buildNativeCollaborationSnapshotPlanV1(
  source: NativeProjectSnapshotV1,
): NativeExchangeSnapshotPlanV1 {
  return {
    snapshot: source,
    representationSourceIds: new Map(source.representations.map((entry) => [entry.id, entry.id])),
    mediaSourceIds: new Map((source.mediaResources ?? []).map((entry) => [entry.id, entry.id])),
  };
}

export function buildNativeCleanCopySnapshotPlanV1(
  source: NativeProjectSnapshotV1,
): NativeExchangeSnapshotPlanV1 {
  const {
    collaborationBaseline: _collaborationBaseline,
    ...withoutBaseline
  } = source;
  const snapshot = parsed({
    ...withoutBaseline,
    snapshotId: newNativeId('snp'),
    generation: 1,
    project: { ...source.project, id: newNativeId('prj') },
  });
  return {
    snapshot,
    representationSourceIds: new Map(snapshot.representations.map((entry) => [entry.id, entry.id])),
    mediaSourceIds: new Map((snapshot.mediaResources ?? []).map((entry) => [entry.id, entry.id])),
  };
}

export function buildNativeReviewSnapshotPlanV1(
  source: NativeProjectSnapshotV1,
): NativeExchangeSnapshotPlanV1 {
  const hidden = new Set(source.presentation.hiddenAssetIds ?? []);
  const sourceAssets = source.assets.filter((asset) => !hidden.has(asset.id));
  if (sourceAssets.length === 0) throw new Error('native review export: no visible Asset is available');
  const sourceBindings = new Map(source.assetBindingRevisions.map((binding) => [binding.id, binding]));
  const sourceRevisions = new Map(source.assetRevisions.map((revision) => [revision.id, revision]));
  const sourceRepresentations = new Map(source.representations.map((representation) => [representation.id, representation]));
  const sourceMedia = new Map((source.mediaResources ?? []).map((media) => [media.id, media]));
  const activeDisplaySetId = source.presentation.activeDisplaySetId ?? NATIVE_DEFAULT_DISPLAY_SET_ID;
  const sourceDisplaySet = nativeDisplaySetsV1(source).find((displaySet) => displaySet.id === activeDisplaySetId);
  if (sourceDisplaySet === undefined) throw new Error('native review export: active DisplaySet is unavailable');

  const idMap = new Map<string, string>();
  const mapped = (id: string, prefix: Parameters<typeof newNativeId>[0]): string => {
    const existing = idMap.get(id);
    if (existing !== undefined) return existing;
    const next = newNativeId(prefix);
    idMap.set(id, next);
    return next;
  };

  const projectId = newNativeId('prj');
  const projectFrameId = newNativeId('frm');
  const displaySetId = newNativeId('set');
  const activeAssetIds = new Set(sourceAssets.map((asset) => asset.id));
  const activeBindings = sourceAssets.map((asset) => {
    const binding = sourceBindings.get(asset.status.activeBindingId);
    if (binding === undefined) throw new Error(`native review export: active binding is missing for ${asset.id}`);
    return binding;
  });
  const activeRevisions = activeBindings.map((binding) => {
    const revision = sourceRevisions.get(binding.assetRevisionId);
    if (revision === undefined) throw new Error(`native review export: active revision is missing for ${binding.assetId}`);
    return revision;
  });
  const includedRepresentationIds = new Set(activeRevisions.flatMap((revision) => revision.representationIds));
  const includedRepresentations = [...includedRepresentationIds].map((representationId) => {
    const representation = sourceRepresentations.get(representationId);
    if (representation === undefined) throw new Error(`native review export: active Representation is missing: ${representationId}`);
    return representation;
  });
  for (const representation of includedRepresentations) {
    if (representation.derivedFrom.some((id) => !includedRepresentationIds.has(id))) {
      throw new Error(`native review export: Representation ${representation.id} has an unavailable active dependency`);
    }
  }

  const activeDisplaySetCaptions = source.captions.filter((caption) => (
    nativeCaptionDisplaySetIdV1(caption) === activeDisplaySetId
  ));
  const unknownOwnerCaption = activeDisplaySetCaptions.find((caption) => nativeCaptionOwnerAssetIdV1(caption) === null);
  if (unknownOwnerCaption !== undefined) {
    throw new Error(`native review export: Caption ${unknownOwnerCaption.id} has no durable owning Asset`);
  }
  const includedCaptions = activeDisplaySetCaptions.filter((caption) => (
    activeAssetIds.has(nativeCaptionOwnerAssetIdV1(caption)!)
  ));
  const activeRevisionByAsset = new Map(activeRevisions.map((revision) => [revision.assetId, revision]));
  for (const caption of includedCaptions) {
    if (caption.anchor === null) continue;
    const activeRevision = activeRevisionByAsset.get(caption.anchor.assetId);
    if (
      activeRevision === undefined || activeRevision.id !== caption.anchor.authoredAssetRevisionId ||
      !activeRevision.anchorCompatibilityClasses.some((entry) => entry.id === caption.anchor!.authoredAnchorCompatibilityId)
    ) {
      throw new Error(`native review export: Caption ${caption.id} requires anchor review before sharing`);
    }
  }
  const includedMediaIds = new Set(includedCaptions.flatMap((caption) => caption.attachmentMediaIds ?? []));
  const includedMedia = [...includedMediaIds].map((mediaId) => {
    const media = sourceMedia.get(mediaId);
    if (media === undefined) throw new Error(`native review export: Caption media is missing: ${mediaId}`);
    return media;
  });
  const includedSavedViews = (source.savedViews ?? []).filter((view) => nativeSavedViewDisplaySetIdV1(view) === activeDisplaySetId);
  const includedSavedViewIds = new Set(includedSavedViews.map((view) => view.id));

  const assets = sourceAssets.map((asset) => ({
    ...asset,
    id: mapped(asset.id, 'ast'),
    assetFrameId: mapped(asset.assetFrameId, 'frm'),
    status: { kind: 'ready' as const, activeBindingId: mapped(asset.status.activeBindingId, 'bnd') },
  }));
  const assetBindingRevisions = activeBindings.map((binding) => ({
    ...binding,
    id: mapped(binding.id, 'bnd'),
    assetId: mapped(binding.assetId, 'ast'),
    assetRevisionId: mapped(binding.assetRevisionId, 'rev'),
  }));
  const assetRevisions = activeRevisions.map((revision) => ({
    ...revision,
    id: mapped(revision.id, 'rev'),
    assetId: mapped(revision.assetId, 'ast'),
    representationIds: revision.representationIds.map((id) => mapped(id, 'rep')),
    anchorCompatibilityClasses: revision.anchorCompatibilityClasses.map((entry) => ({
      id: mapped(entry.id, 'cls'),
      targetVariantFamilyIds: entry.targetVariantFamilyIds.map((id) => mapped(id, 'fam')),
    })),
  }));
  const representations = includedRepresentations.map((representation) => ({
    ...representation,
    id: mapped(representation.id, 'rep'),
    assetId: mapped(representation.assetId, 'ast'),
    representationFrameId: mapped(representation.representationFrameId, 'frm'),
    variantFamilyId: mapped(representation.variantFamilyId, 'fam'),
    derivedFrom: representation.derivedFrom.map((id) => mapped(id, 'rep')),
    ...(representation.proxyForGsVariantFamilyId === undefined
      ? {}
      : { proxyForGsVariantFamilyId: mapped(representation.proxyForGsVariantFamilyId, 'fam') }),
  }));
  const captions = includedCaptions.map((caption) => ({
    ...caption,
    id: mapped(caption.id, 'cap'),
    ownerAssetId: mapped(nativeCaptionOwnerAssetIdV1(caption)!, 'ast'),
    displaySetId,
    ...(caption.attachmentMediaIds === undefined
      ? {}
      : { attachmentMediaIds: caption.attachmentMediaIds.map((id) => mapped(id, 'med')) }),
    anchor: caption.anchor === null ? null : {
      ...caption.anchor,
      assetId: mapped(caption.anchor.assetId, 'ast'),
      assetFrameId: mapped(caption.anchor.assetFrameId, 'frm'),
      authoredAssetRevisionId: mapped(caption.anchor.authoredAssetRevisionId, 'rev'),
      authoredAnchorCompatibilityId: mapped(caption.anchor.authoredAnchorCompatibilityId, 'cls'),
    },
  }));
  const mediaResources = includedMedia.map((media) => ({ ...media, id: mapped(media.id, 'med') }));
  const savedViews = includedSavedViews.map((view) => ({
    ...view,
    id: mapped(view.id, 'view'),
    projectFrameId,
    displaySetId,
  }));
  const meshMaterialAppearances = (source.meshMaterialAppearances ?? [])
    .filter((appearance) => (
      appearance.displaySetId === activeDisplaySetId && activeAssetIds.has(appearance.assetId) &&
      includedRepresentationIds.has(appearance.representationId)
    ))
    .map((appearance) => ({
      ...appearance,
      id: mapped(appearance.id, 'mat'),
      displaySetId,
      assetId: mapped(appearance.assetId, 'ast'),
      authoredAssetRevisionId: mapped(appearance.authoredAssetRevisionId, 'rev'),
      representationId: mapped(appearance.representationId, 'rep'),
    }));
  const snapshot = parsed({
    format: NATIVE_SNAPSHOT_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    snapshotId: newNativeId('snp'),
    generation: 1,
    project: {
      ...source.project,
      id: projectId,
      frame: { ...source.project.frame, id: projectFrameId },
    },
    assets,
    assetBindingRevisions,
    assetRevisions,
    representations,
    presentation: {
      displayMode: source.presentation.displayMode,
      captionTargetAssetId: source.presentation.captionTargetAssetId !== null && activeAssetIds.has(source.presentation.captionTargetAssetId)
        ? mapped(source.presentation.captionTargetAssetId, 'ast')
        : null,
      hiddenAssetIds: [],
      activeDisplaySetId: displaySetId,
    },
    captions,
    savedViews,
    displaySets: [{
      id: displaySetId,
      name: sourceDisplaySet.name,
      orderKey: sourceDisplaySet.orderKey,
      defaultSavedViewId: sourceDisplaySet.defaultSavedViewId !== null && includedSavedViewIds.has(sourceDisplaySet.defaultSavedViewId)
        ? mapped(sourceDisplaySet.defaultSavedViewId, 'view')
        : null,
    }],
    meshMaterialAppearances,
    mediaResources,
  });
  return {
    snapshot,
    representationSourceIds: new Map(includedRepresentations.map((entry) => [mapped(entry.id, 'rep'), entry.id])),
    mediaSourceIds: new Map(includedMedia.map((entry) => [mapped(entry.id, 'med'), entry.id])),
  };
}
