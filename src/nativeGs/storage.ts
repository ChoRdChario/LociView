import type { ProjectWorkspaceFS, WorkspaceFS, WorkspaceReadableFile } from '../platform/fs';
import { parseManifest } from '../core/manifest';
import { inspectNativeGsPlyV1, type RestartableByteSource } from './plyProfile';
import {
  NATIVE_ACTIVE_FORMAT,
  NATIVE_GS_PROFILE_ID,
  NATIVE_SCHEMA_VERSION,
  NATIVE_SNAPSHOT_FORMAT,
  newNativeId,
  parseNativeActiveMarkerV1,
  parseNativeSnapshotV1,
  serializeNativeActiveMarkerV1,
  serializeNativeSnapshotV1,
  type NativeActiveMarkerV1,
  type NativeBlobRefV1,
  type NativeProjectDraftV1,
  type NativeProjectSnapshotV1,
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
}

export interface NativeOpenProject {
  readonly snapshot: NativeProjectSnapshotV1;
  readonly missingRepresentationIds: readonly string[];
  readonly sizeMismatchRepresentationIds: readonly string[];
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

async function writeAndVerifyBinary(
  fs: ProjectWorkspaceFS,
  path: string,
  source: NativeBinarySource,
): Promise<NativeBlobRefV1> {
  if (await fs.exists(path)) throw new Error(`native project: immutable Representation path already exists: ${path}`);
  let writeDigest: NativeStreamDigest | null = null;
  await fs.writeStream(path, hashingNativeStream(source.stream(), (digest) => {
    writeDigest = digest;
  }));
  if (writeDigest === null) throw new Error('native project: source stream ended without a digest');
  const written = writeDigest as NativeStreamDigest;
  if (written.byteLength !== source.size) {
    throw new Error(`native project: source size changed while writing ${path}`);
  }
  const stored = await fs.readStream(path);
  if (stored === null) throw new Error(`native project: staged binary is missing after write: ${path}`);
  if (stored.size !== source.size) throw new Error(`native project: staged binary size mismatch: ${path}`);
  const readBack = await digestNativeStream(stored.stream());
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

async function writeVerifiedSnapshot(
  fs: ProjectWorkspaceFS,
  snapshot: NativeProjectSnapshotV1,
): Promise<{ readonly text: string; readonly digest: NativeStreamDigest }> {
  const text = serializeNativeSnapshotV1(snapshot);
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
  await fs.writeText(path, text);
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
): Promise<NativeProjectSnapshotV1> {
  assertProjectWorkspace(fs, draft.project.id);
  if (await fs.exists(nativeActiveMarkerPath(draft.project.id))) {
    throw new Error('native project: project is already active');
  }
  if (sources.size !== draft.representations.length) {
    throw new Error('native project: every Representation requires exactly one local source');
  }
  const representations = [];
  for (const representation of [...draft.representations].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = sources.get(representation.id);
    if (source === undefined) throw new Error(`native project: missing source for ${representation.id}`);
    if (source.size < 1) throw new Error(`native project: empty source for ${representation.id}`);
    if (representation.role === 'gsPrimary') {
      onStatus?.(`Inspecting ${representation.role} header…`);
      if (representation.formatProfile.id !== NATIVE_GS_PROFILE_ID || representation.gsPly === undefined) {
        throw new Error('native project: GS Representation lacks the approved profile facts');
      }
      const inspection = await inspectNativeGsPlyV1(source);
      if (inspection.kind !== 'supported-gs' || !sameGsFacts(inspection.facts, representation.gsPly)) {
        throw new Error('native project: stored GS profile facts do not match the selected source');
      }
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
  };
  onStatus?.('Writing and verifying native snapshot v1…');
  const verified = await writeVerifiedSnapshot(fs, snapshot);
  // Publication boundary: no active project exists before this final write.
  onStatus?.('Publishing active receipt…');
  await publishActiveMarker(fs, snapshot, verified.digest);
  onStatus?.('Native project saved and active.');
  return snapshot;
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
  for (const representation of snapshot.representations) {
    const source = await fs.readStream(nativeRepresentationPath(projectId, representation.id));
    if (source === null) missingRepresentationIds.push(representation.id);
    else if (source.size !== representation.blob.byteLength) sizeMismatchRepresentationIds.push(representation.id);
  }
  return {
    snapshot,
    missingRepresentationIds,
    sizeMismatchRepresentationIds,
  };
}

export async function readNativeRepresentationV1(
  fs: WorkspaceFS,
  projectId: string,
  representationId: string,
): Promise<WorkspaceReadableFile | null> {
  return fs.readStream(nativeRepresentationPath(projectId, representationId));
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
      summaries.push({ projectId, title: opened.snapshot.project.title, generation: opened.snapshot.generation });
    } catch {
      // Invalid/unknown projects are never guessed into the active list.
    }
  }
  return summaries;
}
