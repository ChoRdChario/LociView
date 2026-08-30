import type { ProjectWorkspaceFS, WorkspaceFS, WorkspaceReadableFile } from '../platform/fs';
import { parseManifest } from '../core/manifest';
import { inspectNativeGsPlyV1, inspectNativePointPlyV1, type RestartableByteSource } from './plyProfile';
import {
  NATIVE_ACTIVE_FORMAT,
  NATIVE_GS_PROFILE_ID,
  NATIVE_POINT_PROFILE_ID,
  NATIVE_SCHEMA_VERSION,
  NATIVE_SNAPSHOT_FORMAT,
  isNativeImageMediaType,
  newNativeId,
  parseNativeActiveMarkerV1,
  parseNativeSnapshotV1,
  serializeNativeActiveMarkerV1,
  serializeNativeSnapshotV1,
  type NativeActiveMarkerV1,
  type NativeAssetBindingRevisionV1,
  type NativeAssetRevisionV1,
  type NativeAssetV1,
  type NativeBlobRefV1,
  type NativeProjectDraftV1,
  type NativeProjectSnapshotV1,
  type NativeMediaResourceV1,
  type NativeRepresentationDraftV1,
  type NativeRepresentationV1,
} from './schema';
import { digestNativeBytes, digestNativeStream, hashingNativeStream, type NativeStreamDigest } from './sha256';

export const NATIVE_PROJECTS_ROOT = 'native-projects';

export interface NativeBinarySource extends RestartableByteSource {
  readonly mediaType: string;
}

export interface NativeProjectSummary {
  readonly projectId: string;
  readonly title: string;
  readonly generation: number;
  readonly snapshotId: string;
}

export interface NativeOpenProject {
  readonly snapshot: NativeProjectSnapshotV1;
  readonly missingRepresentationIds: readonly string[];
  readonly sizeMismatchRepresentationIds: readonly string[];
  readonly missingMediaIds: readonly string[];
  readonly sizeMismatchMediaIds: readonly string[];
}

/** Transient input for one opened-project import; no new durable record type. */
export interface NativeAssetImportV1 {
  readonly asset: NativeAssetV1;
  readonly binding: NativeAssetBindingRevisionV1;
  readonly revision: NativeAssetRevisionV1;
  readonly representations: readonly NativeRepresentationDraftV1[];
}

export function nativeProjectRoot(projectId: string): string {
  return `${NATIVE_PROJECTS_ROOT}/${projectId}`;
}

export function nativeActiveMarkerPath(projectId: string): string {
  return `${nativeProjectRoot(projectId)}/active.json`;
}

export function nativeSnapshotPath(projectId: string, snapshotId: string): string {
  return `${nativeProjectRoot(projectId)}/snapshots/${snapshotId}.json`;
}

export function nativeRepresentationPath(projectId: string, representationId: string): string {
  return `${nativeProjectRoot(projectId)}/representations/${representationId}.bin`;
}

export function nativeMediaPath(projectId: string, mediaId: string): string {
  return `${nativeProjectRoot(projectId)}/media/${mediaId}.bin`;
}

export async function assertNativeProjectDoesNotMixV1(fs: WorkspaceFS, projectId: string): Promise<void> {
  for (const path of await fs.list('projects/')) {
    if (!/^projects\/[^/]+\/lociview\.json$/.test(path)) continue;
    const text = await fs.readText(path);
    if (text === null) continue;
    let existingProjectId: string;
    try {
      existingProjectId = parseManifest(text).projectId;
    } catch {
      continue;
    }
    if (existingProjectId === projectId) {
      throw new Error('native project: a v1 project with the same ID exists; mixed state is refused');
    }
  }
}

function assertProjectWorkspace(fs: ProjectWorkspaceFS, projectId: string): void {
  const expected = nativeProjectRoot(projectId);
  if (fs.projectRoot !== null && fs.projectRoot !== expected) {
    throw new Error(`native project: write capability is scoped to ${fs.projectRoot}, expected ${expected}`);
  }
  fs.mutationAuthority.assertEditable();
}

function sameGsFacts(
  left: NonNullable<NativeProjectSnapshotV1['representations'][number]['gsPly']>,
  right: NonNullable<NativeProjectSnapshotV1['representations'][number]['gsPly']>,
): boolean {
  return (
    left.shDegree === right.shDegree && left.splatCount === right.splatCount &&
    left.headerByteLength === right.headerByteLength && left.recordStrideBytes === right.recordStrideBytes &&
    left.payloadByteLength === right.payloadByteLength
  );
}

function samePointFacts(
  left: NonNullable<NativeProjectSnapshotV1['representations'][number]['pointPly']>,
  right: NonNullable<NativeProjectSnapshotV1['representations'][number]['pointPly']>,
): boolean {
  return left.pointCount === right.pointCount &&
    left.headerByteLength === right.headerByteLength && left.encoding === right.encoding;
}

async function validateRepresentationSourceProfile(
  representation: NativeRepresentationDraftV1 | NativeRepresentationV1,
  source: RestartableByteSource,
  label: string,
): Promise<void> {
  if (representation.role === 'gsPrimary') {
    if (representation.formatProfile.id !== NATIVE_GS_PROFILE_ID || representation.gsPly === undefined) {
      throw new Error(`native project: ${label} GS Representation lacks the approved profile facts`);
    }
    const inspection = await inspectNativeGsPlyV1(source);
    if (inspection.kind !== 'supported-gs' || !sameGsFacts(inspection.facts, representation.gsPly)) {
      throw new Error(`native project: ${label} GS profile facts do not match the selected source`);
    }
  } else if (representation.role === 'pointPrimary') {
    if (representation.formatProfile.id !== NATIVE_POINT_PROFILE_ID || representation.pointPly === undefined) {
      throw new Error(`native project: ${label} Point Representation lacks the approved profile facts`);
    }
    const inspection = await inspectNativePointPlyV1(source);
    if (inspection.kind !== 'supported-point' || !samePointFacts(inspection.facts, representation.pointPly)) {
      throw new Error(`native project: ${label} Point profile facts do not match the selected source`);
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException('Operation aborted', 'AbortError');
}

async function writeAndVerifyBinary(
  fs: ProjectWorkspaceFS,
  path: string,
  source: NativeBinarySource,
  signal?: AbortSignal,
): Promise<NativeBlobRefV1> {
  throwIfAborted(signal);
  if (await fs.exists(path)) throw new Error(`native project: immutable binary path already exists: ${path}`);
  let writeDigest: NativeStreamDigest | null = null;
  await fs.writeStream(path, hashingNativeStream(source.stream(), (digest) => {
    writeDigest = digest;
  }));
  throwIfAborted(signal);
  if (writeDigest === null) throw new Error('native project: source stream ended without a digest');
  const written = writeDigest as NativeStreamDigest;
  if (written.byteLength !== source.size) {
    throw new Error(`native project: source size changed while writing ${path}`);
  }
  const stored = await fs.readStream(path);
  if (stored === null) throw new Error(`native project: staged binary is missing after write: ${path}`);
  if (stored.size !== source.size) throw new Error(`native project: staged binary size mismatch: ${path}`);
  const readBack = await digestNativeStream(stored.stream(), signal);
  if (readBack.byteLength !== written.byteLength || readBack.sha256 !== written.sha256) {
    throw new Error(`native project: staged binary read-back mismatch: ${path}`);
  }
  return {
    algorithm: 'sha256',
    digest: written.sha256,
    byteLength: written.byteLength,
    mediaType: source.mediaType,
  };
}

function representationWithBlob(
  representation: NativeRepresentationDraftV1,
  blob: NativeBlobRefV1,
): NativeRepresentationV1 {
  const { mediaType: _mediaType, ...record } = representation;
  return { ...record, blob };
}

async function writeVerifiedSnapshot(
  fs: ProjectWorkspaceFS,
  snapshot: NativeProjectSnapshotV1,
  exactText?: string,
): Promise<{ readonly text: string; readonly digest: NativeStreamDigest }> {
  const text = exactText ?? serializeNativeSnapshotV1(snapshot);
  const parsedText = parseNativeSnapshotV1(text);
  const normalizedExpected = serializeNativeSnapshotV1(
    parseNativeSnapshotV1(serializeNativeSnapshotV1(snapshot)),
  );
  if (serializeNativeSnapshotV1(parsedText) !== normalizedExpected) {
    throw new Error('native project: supplied snapshot text does not match the candidate state');
  }
  const bytes = new TextEncoder().encode(text);
  const digest = digestNativeBytes(bytes);
  const path = nativeSnapshotPath(snapshot.project.id, snapshot.snapshotId);
  if (await fs.exists(path)) throw new Error('native project: immutable snapshot path already exists');
  await fs.writeText(path, text);
  const readBack = await fs.readText(path);
  if (readBack === null) throw new Error('native project: snapshot is missing after write');
  const readBackDigest = digestNativeBytes(new TextEncoder().encode(readBack));
  if (readBackDigest.byteLength !== digest.byteLength || readBackDigest.sha256 !== digest.sha256) {
    throw new Error('native project: snapshot read-back verification failed');
  }
  const parsed = parseNativeSnapshotV1(readBack);
  if (parsed.snapshotId !== snapshot.snapshotId || parsed.project.id !== snapshot.project.id) {
    throw new Error('native project: snapshot identity changed during read-back');
  }
  return { text, digest };
}

async function publishActiveMarker(
  fs: ProjectWorkspaceFS,
  snapshot: NativeProjectSnapshotV1,
  snapshotDigest: NativeStreamDigest,
): Promise<void> {
  const marker: NativeActiveMarkerV1 = {
    format: NATIVE_ACTIVE_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    projectId: snapshot.project.id,
    generation: snapshot.generation,
    snapshotId: snapshot.snapshotId,
    snapshotByteLength: snapshotDigest.byteLength,
    snapshotSha256: snapshotDigest.sha256,
  };
  const path = nativeActiveMarkerPath(snapshot.project.id);
  const text = serializeNativeActiveMarkerV1(marker);
  try {
    await fs.writeText(path, text);
  } catch (writeError) {
    // The scoped writer can lose its lock immediately after the underlying
    // marker write commits. Resolve that commit-then-throw ambiguity by reading
    // the marker through the still-valid read capability. An exact marker is a
    // completed publication; anything else preserves the original failure.
    const committed = await fs.readText(path).catch(() => null);
    if (committed !== text) throw writeError;
  }
  const readBack = await fs.readText(path);
  if (readBack === null) throw new Error('native project: active marker is missing after publication');
  const parsed = parseNativeActiveMarkerV1(readBack);
  if (
    parsed.projectId !== marker.projectId || parsed.generation !== marker.generation ||
    parsed.snapshotId !== marker.snapshotId || parsed.snapshotByteLength !== marker.snapshotByteLength ||
    parsed.snapshotSha256 !== marker.snapshotSha256
  ) {
    throw new Error('native project: active marker read-back verification failed');
  }
}

export async function createNativeProjectV1(
  fs: ProjectWorkspaceFS,
  draft: NativeProjectDraftV1,
  sources: ReadonlyMap<string, NativeBinarySource>,
  onStatus?: (message: string) => void,
  mediaSources: ReadonlyMap<string, NativeBinarySource> = new Map(),
  assertPublicationAllowed?: () => void | Promise<void>,
): Promise<NativeProjectSnapshotV1> {
  assertProjectWorkspace(fs, draft.project.id);
  if (await fs.exists(nativeActiveMarkerPath(draft.project.id))) {
    throw new Error('native project: project is already active');
  }
  if (sources.size !== draft.representations.length) {
    throw new Error('native project: every Representation requires exactly one local source');
  }
  const mediaDrafts = draft.mediaResources ?? [];
  if (mediaSources.size !== mediaDrafts.length) {
    throw new Error('native project: every media resource requires exactly one local source');
  }
  const representations = [];
  for (const representation of [...draft.representations].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = sources.get(representation.id);
    if (source === undefined) throw new Error(`native project: missing source for ${representation.id}`);
    if (source.size < 1) throw new Error(`native project: empty source for ${representation.id}`);
    if (representation.role === 'gsPrimary' || representation.role === 'pointPrimary') {
      onStatus?.(`Inspecting ${representation.role} source…`);
      await validateRepresentationSourceProfile(representation, source, 'stored');
    }
    onStatus?.(`Streaming ${representation.role} bytes to project-local storage…`);
    const blob = await writeAndVerifyBinary(
      fs,
      nativeRepresentationPath(draft.project.id, representation.id),
      source,
    );
    onStatus?.(`Verified ${representation.role} size and SHA-256 by streamed read-back.`);
    representations.push((({ mediaType: _mediaType, ...record }) => ({ ...record, blob }))(representation));
  }
  const mediaResources: NativeMediaResourceV1[] = [];
  for (const media of [...mediaDrafts].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = mediaSources.get(media.id);
    if (source === undefined) throw new Error(`native project: missing media source for ${media.id}`);
    if (source.size < 1 || !isNativeImageMediaType(source.mediaType) || source.mediaType !== media.mediaType) {
      throw new Error(`native project: unsupported or empty image media source for ${media.id}`);
    }
    onStatus?.(`Streaming Caption image ${media.label} to project-local storage…`);
    const blob = await writeAndVerifyBinary(fs, nativeMediaPath(draft.project.id, media.id), source);
    mediaResources.push((({ mediaType: _mediaType, ...record }) => ({ ...record, blob }))(media));
    onStatus?.(`Verified Caption image ${media.label} size and SHA-256 by streamed read-back.`);
  }
  const snapshot: NativeProjectSnapshotV1 = {
    format: NATIVE_SNAPSHOT_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    snapshotId: newNativeId('snp'),
    generation: 1,
    project: draft.project,
    assets: draft.assets,
    assetBindingRevisions: draft.assetBindingRevisions,
    assetRevisions: draft.assetRevisions,
    representations,
    presentation: draft.presentation,
    captions: draft.captions,
    savedViews: draft.savedViews ?? [],
    ...(draft.displaySets === undefined ? {} : { displaySets: draft.displaySets }),
    ...(draft.meshMaterialAppearances === undefined ? {} : { meshMaterialAppearances: draft.meshMaterialAppearances }),
    ...(draft.mediaResources === undefined ? {} : { mediaResources }),
  };
  await assertPublicationAllowed?.();
  onStatus?.('Writing and verifying native snapshot v1…');
  const verified = await writeVerifiedSnapshot(fs, snapshot);
  // Publication boundary: no active project exists before this final write.
  await assertPublicationAllowed?.();
  onStatus?.('Publishing active receipt…');
  await publishActiveMarker(fs, snapshot, verified.digest);
  onStatus?.('Native project saved and active.');
  return snapshot;
}

interface NativeAssetPublicationOptions {
  readonly nextAssets: readonly NativeAssetV1[];
  readonly staleAction: string;
  readonly successMessage: string;
}

async function publishNativeAssetClosureV1(
  fs: ProjectWorkspaceFS,
  current: NativeProjectSnapshotV1,
  imported: NativeAssetImportV1,
  sources: ReadonlyMap<string, NativeBinarySource>,
  options: NativeAssetPublicationOptions,
  onStatus?: (message: string) => void,
): Promise<NativeProjectSnapshotV1> {
  assertProjectWorkspace(fs, current.project.id);
  const durable = await openNativeProjectV1(fs, current.project.id);
  if (durable.snapshot.generation !== current.generation || durable.snapshot.snapshotId !== current.snapshotId) {
    throw new Error(`native project: durable snapshot changed; reload before ${options.staleAction}`);
  }
  if (durable.missingMediaIds.length > 0 || durable.sizeMismatchMediaIds.length > 0) {
    throw new Error('native project: active Caption media bytes are unavailable');
  }
  for (const representation of current.representations) {
    const source = await fs.readStream(nativeRepresentationPath(current.project.id, representation.id));
    if (source === null || source.size !== representation.blob.byteLength) {
      throw new Error(`native project: active Representation bytes are unavailable: ${representation.id}`);
    }
  }
  if (imported.representations.length < 1 || sources.size !== imported.representations.length) {
    throw new Error('native project: one imported Asset requires every new Representation source');
  }

  const snapshotId = newNativeId('snp');
  const provisionalRepresentations: NativeRepresentationV1[] = [];
  for (const representation of imported.representations) {
    const source = sources.get(representation.id);
    if (source === undefined) throw new Error(`native project: missing import source for ${representation.id}`);
    if (source.size < 1) throw new Error(`native project: empty import source for ${representation.id}`);
    provisionalRepresentations.push(representationWithBlob(representation, {
      algorithm: 'sha256',
      digest: '0'.repeat(64),
      byteLength: source.size,
      mediaType: source.mediaType,
    }));
  }
  // Validate ID uniqueness, ownership, binding, Proxy relationship and GS facts
  // before the first persistent write.
  parseNativeSnapshotV1(serializeNativeSnapshotV1({
    ...current,
    snapshotId,
    generation: current.generation + 1,
    assets: options.nextAssets,
    assetBindingRevisions: [...current.assetBindingRevisions, imported.binding],
    assetRevisions: [...current.assetRevisions, imported.revision],
    representations: [...current.representations, ...provisionalRepresentations],
  }));

  const verifiedRepresentations: NativeRepresentationV1[] = [];
  const stagedPaths: string[] = [];
  const snapshotPath = nativeSnapshotPath(current.project.id, snapshotId);
  try {
    for (const representation of [...imported.representations].sort((a, b) => a.id.localeCompare(b.id))) {
      const source = sources.get(representation.id)!;
      if (representation.role === 'gsPrimary' || representation.role === 'pointPrimary') {
        onStatus?.(`Inspecting ${representation.role} source…`);
        await validateRepresentationSourceProfile(representation, source, 'imported');
      }
      const path = nativeRepresentationPath(current.project.id, representation.id);
      stagedPaths.push(path);
      onStatus?.(`Streaming ${representation.role} bytes to project-local storage…`);
      const blob = await writeAndVerifyBinary(fs, path, source);
      verifiedRepresentations.push(representationWithBlob(representation, blob));
      onStatus?.(`Verified ${representation.role} size and SHA-256 by streamed read-back.`);
    }
    const next = parseNativeSnapshotV1(serializeNativeSnapshotV1({
      ...current,
      snapshotId,
      generation: current.generation + 1,
      assets: options.nextAssets,
      assetBindingRevisions: [...current.assetBindingRevisions, imported.binding],
      assetRevisions: [...current.assetRevisions, imported.revision],
      representations: [...current.representations, ...verifiedRepresentations],
    }));
    stagedPaths.push(snapshotPath);
    onStatus?.('Writing and verifying native snapshot v1…');
    const verified = await writeVerifiedSnapshot(fs, next);
    onStatus?.('Publishing active receipt…');
    await publishActiveMarker(fs, next, verified.digest);
    onStatus?.(options.successMessage);
    return next;
  } catch (error) {
    // If publication committed immediately before an authority error, the
    // exact candidate is success. Otherwise clean only when the old snapshot is
    // still provably active; uncertain paths remain harmless unreferenced bytes.
    const active = await openNativeProjectV1(fs, current.project.id).catch(() => null);
    if (
      active?.snapshot.snapshotId === snapshotId &&
      active.snapshot.generation === current.generation + 1 &&
      active.missingRepresentationIds.length === 0 &&
      active.sizeMismatchRepresentationIds.length === 0 &&
      active.missingMediaIds.length === 0 &&
      active.sizeMismatchMediaIds.length === 0
    ) {
      return active.snapshot;
    }
    if (
      active?.snapshot.snapshotId === durable.snapshot.snapshotId &&
      active.snapshot.generation === durable.snapshot.generation &&
      fs.mutationAuthority.accessState === 'editable'
    ) {
      for (const path of [...stagedPaths].reverse()) await fs.remove(path).catch(() => {});
    }
    throw error;
  }
}

/**
 * Adds one Asset to an existing native project. New immutable bytes are
 * verified first; one whole-project snapshot and the active marker follow.
 */
export async function addNativeAssetV1(
  fs: ProjectWorkspaceFS,
  current: NativeProjectSnapshotV1,
  imported: NativeAssetImportV1,
  sources: ReadonlyMap<string, NativeBinarySource>,
  onStatus?: (message: string) => void,
): Promise<NativeProjectSnapshotV1> {
  return publishNativeAssetClosureV1(fs, current, imported, sources, {
    nextAssets: [...current.assets, imported.asset],
    staleAction: 'adding an Asset',
    successMessage: 'Asset added and native project saved.',
  }, onStatus);
}

function sameSim3(left: NativeAssetBindingRevisionV1['assetToProject'], right: NativeAssetBindingRevisionV1['assetToProject']): boolean {
  return left.uniformScale === right.uniformScale &&
    left.translation.every((value, index) => value === right.translation[index]) &&
    left.rotationXYZW.every((value, index) => value === right.rotationXYZW[index]);
}

/**
 * Replaces one Asset's active content without changing its identity, placement,
 * visibility, Captions, or any retained immutable record. Surface equivalence
 * is deliberately outside this publication boundary.
 */
export async function replaceNativeAssetV1(
  fs: ProjectWorkspaceFS,
  current: NativeProjectSnapshotV1,
  imported: NativeAssetImportV1,
  sources: ReadonlyMap<string, NativeBinarySource>,
  onStatus?: (message: string) => void,
): Promise<NativeProjectSnapshotV1> {
  const existing = current.assets.find((asset) => asset.id === imported.asset.id);
  if (existing === undefined) {
    throw new Error('native project: replacement Asset or active binding is unavailable');
  }
  const activeBinding = current.assetBindingRevisions.find((binding) => (
    binding.id === existing.status.activeBindingId && binding.assetId === existing.id
  ));
  if (activeBinding === undefined) {
    throw new Error('native project: replacement Asset or active binding is unavailable');
  }
  if (
    imported.asset.label !== existing.label || imported.asset.assetFrameId !== existing.assetFrameId ||
    imported.asset.status.activeBindingId !== imported.binding.id ||
    imported.binding.assetId !== existing.id || imported.binding.assetRevisionId !== imported.revision.id ||
    imported.revision.assetId !== existing.id || imported.representations.some((entry) => entry.assetId !== existing.id)
  ) {
    throw new Error('native project: replacement must preserve the selected Asset identity and frame');
  }
  if (imported.binding.method !== activeBinding.method || !sameSim3(imported.binding.assetToProject, activeBinding.assetToProject)) {
    throw new Error('native project: replacement must copy the exact active Asset placement');
  }
  return publishNativeAssetClosureV1(fs, current, imported, sources, {
    nextAssets: current.assets.map((asset) => asset.id === existing.id ? imported.asset : asset),
    staleAction: 'replacing an Asset',
    successMessage: 'Asset replaced and native project saved.',
  }, onStatus);
}

/**
 * Restores one already-validated portable snapshot without changing any IDs,
 * generations, metadata, or source bytes. The absent project root is the
 * unpublished staging area; only active.json makes it visible.
 */
export async function restoreNativeProjectV1(
  fs: ProjectWorkspaceFS,
  namespaceFs: WorkspaceFS,
  candidate: NativeProjectSnapshotV1,
  sources: ReadonlyMap<string, NativeBinarySource>,
  onStatus?: (message: string) => void,
  signal?: AbortSignal,
  exactSnapshotText?: string,
  mediaSources: ReadonlyMap<string, NativeBinarySource> = new Map(),
): Promise<NativeProjectSnapshotV1> {
  const snapshot = parseNativeSnapshotV1(exactSnapshotText ?? serializeNativeSnapshotV1(candidate));
  assertProjectWorkspace(fs, snapshot.project.id);
  throwIfAborted(signal);
  // This check is deliberately repeated after lock acquisition. A UI-only
  // preflight must not be able to race a v1 project into the same identity.
  await assertNativeProjectDoesNotMixV1(namespaceFs, snapshot.project.id);
  // An empty root gives this attempt exclusive ownership of every path it may
  // clean after failure; never delete unknown remnants from an older attempt.
  const existingPaths = await fs.list(`${nativeProjectRoot(snapshot.project.id)}/`);
  if (existingPaths.length > 0) {
    throw new Error('native restore: destination project root is not empty');
  }
  if (sources.size !== snapshot.representations.length) {
    throw new Error('native restore: every Representation requires exactly one package source');
  }
  if (mediaSources.size !== (snapshot.mediaResources ?? []).length) {
    throw new Error('native restore: every media resource requires exactly one package source');
  }

  const stagedPaths: string[] = [];
  const snapshotPath = nativeSnapshotPath(snapshot.project.id, snapshot.snapshotId);
  try {
    for (const representation of [...snapshot.representations].sort((a, b) => a.id.localeCompare(b.id))) {
      throwIfAborted(signal);
      const source = sources.get(representation.id);
      if (source === undefined) throw new Error(`native restore: missing package source for ${representation.id}`);
      if (source.size !== representation.blob.byteLength || source.mediaType !== representation.blob.mediaType) {
        throw new Error(`native restore: package source metadata mismatch for ${representation.id}`);
      }
      const path = nativeRepresentationPath(snapshot.project.id, representation.id);
      if (await fs.exists(path)) throw new Error(`native restore: destination staging path already exists: ${path}`);
      stagedPaths.push(path);
      onStatus?.(`Streaming ${representation.role} from portable backup…`);
      const blob = await writeAndVerifyBinary(fs, path, source, signal);
      if (
        blob.byteLength !== representation.blob.byteLength ||
        blob.digest !== representation.blob.digest ||
        blob.mediaType !== representation.blob.mediaType
      ) {
        throw new Error(`native restore: Representation size/SHA-256 mismatch for ${representation.id}`);
      }
      if (representation.role === 'gsPrimary' || representation.role === 'pointPrimary') {
        const stored = await fs.readStream(path);
        if (stored === null) throw new Error('native restore: verified profile staging bytes are unavailable');
        await validateRepresentationSourceProfile(representation, stored, 'restored');
      }
      onStatus?.(`Verified ${representation.role} size and SHA-256 by streamed read-back.`);
    }
    for (const media of [...(snapshot.mediaResources ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
      throwIfAborted(signal);
      const source = mediaSources.get(media.id);
      if (source === undefined) throw new Error(`native restore: missing package media source for ${media.id}`);
      if (source.size !== media.blob.byteLength || source.mediaType !== media.blob.mediaType) {
        throw new Error(`native restore: package media metadata mismatch for ${media.id}`);
      }
      const path = nativeMediaPath(snapshot.project.id, media.id);
      if (await fs.exists(path)) throw new Error(`native restore: destination staging path already exists: ${path}`);
      stagedPaths.push(path);
      onStatus?.(`Streaming Caption image ${media.label} from portable backup…`);
      const blob = await writeAndVerifyBinary(fs, path, source, signal);
      if (
        blob.byteLength !== media.blob.byteLength || blob.digest !== media.blob.digest ||
        blob.mediaType !== media.blob.mediaType
      ) {
        throw new Error(`native restore: media size/SHA-256 mismatch for ${media.id}`);
      }
      onStatus?.(`Verified Caption image ${media.label} size and SHA-256 by streamed read-back.`);
    }
    throwIfAborted(signal);
    onStatus?.('Writing and verifying restored native snapshot v1…');
    stagedPaths.push(snapshotPath);
    const verified = await writeVerifiedSnapshot(fs, snapshot, exactSnapshotText);
    throwIfAborted(signal);
    onStatus?.('Publishing restored active receipt…');
    await publishActiveMarker(fs, snapshot, verified.digest);
    onStatus?.('Portable backup restored and active.');
    return snapshot;
  } catch (error) {
    // Best-effort cleanup is scoped to paths written by this attempt. Even if a
    // browser interruption prevents cleanup, no valid marker was published.
    await fs.remove(nativeActiveMarkerPath(snapshot.project.id)).catch(() => {});
    for (const path of [...stagedPaths].reverse()) await fs.remove(path).catch(() => {});
    throw error;
  }
}

export async function saveNativeProjectV1(
  fs: ProjectWorkspaceFS,
  current: NativeProjectSnapshotV1,
): Promise<NativeProjectSnapshotV1> {
  assertProjectWorkspace(fs, current.project.id);
  const durable = await openNativeProjectV1(fs, current.project.id);
  if (durable.snapshot.generation !== current.generation || durable.snapshot.snapshotId !== current.snapshotId) {
    throw new Error('native project: durable snapshot changed; reload before saving');
  }
  for (const representation of current.representations) {
    const source = await fs.readStream(nativeRepresentationPath(current.project.id, representation.id));
    if (source === null || source.size !== representation.blob.byteLength) {
      throw new Error(`native project: active Representation bytes are unavailable: ${representation.id}`);
    }
  }
  for (const media of current.mediaResources ?? []) {
    const source = await fs.readStream(nativeMediaPath(current.project.id, media.id));
    if (source === null || source.size !== media.blob.byteLength) {
      throw new Error(`native project: active media bytes are unavailable: ${media.id}`);
    }
  }
  const next: NativeProjectSnapshotV1 = {
    ...current,
    snapshotId: newNativeId('snp'),
    generation: current.generation + 1,
  };
  const verified = await writeVerifiedSnapshot(fs, next);
  await publishActiveMarker(fs, next, verified.digest);
  return next;
}

export async function openNativeProjectV1(fs: WorkspaceFS, projectId: string): Promise<NativeOpenProject> {
  const markerText = await fs.readText(nativeActiveMarkerPath(projectId));
  if (markerText === null) throw new Error('native project: no active marker');
  const marker = parseNativeActiveMarkerV1(markerText);
  if (marker.projectId !== projectId) throw new Error('native project: active marker project mismatch');
  const snapshotText = await fs.readText(nativeSnapshotPath(projectId, marker.snapshotId));
  if (snapshotText === null) throw new Error('native project: active snapshot is missing');
  const digest = digestNativeBytes(new TextEncoder().encode(snapshotText));
  if (digest.byteLength !== marker.snapshotByteLength || digest.sha256 !== marker.snapshotSha256) {
    throw new Error('native project: active snapshot verification failed');
  }
  const snapshot = parseNativeSnapshotV1(snapshotText);
  if (
    snapshot.project.id !== projectId || snapshot.snapshotId !== marker.snapshotId ||
    snapshot.generation !== marker.generation
  ) {
    throw new Error('native project: active marker and snapshot disagree');
  }
  const missingRepresentationIds: string[] = [];
  const sizeMismatchRepresentationIds: string[] = [];
  const missingMediaIds: string[] = [];
  const sizeMismatchMediaIds: string[] = [];
  for (const representation of snapshot.representations) {
    const source = await fs.readStream(nativeRepresentationPath(projectId, representation.id));
    if (source === null) missingRepresentationIds.push(representation.id);
    else if (source.size !== representation.blob.byteLength) sizeMismatchRepresentationIds.push(representation.id);
  }
  for (const media of snapshot.mediaResources ?? []) {
    const source = await fs.readStream(nativeMediaPath(projectId, media.id));
    if (source === null) missingMediaIds.push(media.id);
    else if (source.size !== media.blob.byteLength) sizeMismatchMediaIds.push(media.id);
  }
  return {
    snapshot,
    missingRepresentationIds,
    sizeMismatchRepresentationIds,
    missingMediaIds,
    sizeMismatchMediaIds,
  };
}

export async function readNativeRepresentationV1(
  fs: WorkspaceFS,
  projectId: string,
  representationId: string,
): Promise<WorkspaceReadableFile | null> {
  return fs.readStream(nativeRepresentationPath(projectId, representationId));
}

export async function readNativeMediaV1(
  fs: WorkspaceFS,
  projectId: string,
  mediaId: string,
): Promise<WorkspaceReadableFile | null> {
  return fs.readStream(nativeMediaPath(projectId, mediaId));
}

/** Marker-first removal ensures an interrupted delete is never listed active. */
export async function deleteNativeProjectV1(
  fs: ProjectWorkspaceFS,
  projectId: string,
  expected: { readonly snapshotId: string; readonly generation: number },
): Promise<void> {
  assertProjectWorkspace(fs, projectId);
  const durable = await openNativeProjectV1(fs, projectId);
  if (
    durable.snapshot.snapshotId !== expected.snapshotId ||
    durable.snapshot.generation !== expected.generation
  ) {
    throw new Error('native project: project changed after deletion was confirmed; refresh and confirm again');
  }
  const root = nativeProjectRoot(projectId);
  const paths = await fs.list(`${root}/`);
  await fs.remove(nativeActiveMarkerPath(projectId));
  for (const path of paths) {
    if (path !== nativeActiveMarkerPath(projectId)) await fs.remove(path);
  }
}

export async function listNativeProjectsV1(fs: WorkspaceFS): Promise<NativeProjectSummary[]> {
  const files = await fs.list(`${NATIVE_PROJECTS_ROOT}/`);
  const ids = new Set<string>();
  for (const path of files) {
    const match = /^native-projects\/(prj_[0-9A-HJKMNPQRSTVWXYZ]{26})\/active\.json$/.exec(path);
    if (match !== null) ids.add(match[1]!);
  }
  const summaries: NativeProjectSummary[] = [];
  for (const projectId of [...ids].sort()) {
    try {
      await assertNativeProjectDoesNotMixV1(fs, projectId);
      const opened = await openNativeProjectV1(fs, projectId);
      summaries.push({
        projectId,
        title: opened.snapshot.project.title,
        generation: opened.snapshot.generation,
        snapshotId: opened.snapshot.snapshotId,
      });
    } catch {
      // Invalid/unknown projects are never guessed into the active list.
    }
  }
  return summaries;
}
