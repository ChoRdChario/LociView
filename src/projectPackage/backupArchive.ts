import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { capabilityFields, checkRequiredCapabilities } from '../projectMetadata/requiredCapabilities';
import { ProjectMetadataSource, type MetadataLimits } from '../projectMetadata/source';
import { canonical } from '../domain/projectGraphSupport';
import type { JsonValue } from '../domain/values';
import { PACKAGE_FORMAT, PACKAGE_WIRE_VERSION, PACKAGE_LIMITS as L } from './contract';
import { packageByteHash, PackageControlError, readManifestControl, canonicalControl } from './manifest';
import { BackupSourceCapture } from './backupSource';
import { backupEncode, backupEvidenceRefs, readBackupBases, inspectBackupOriginals, type BackupEvidenceBytes } from './backupEvidence';
import { packageSourceLimits } from './contributionEvidence';
import { writeCausalArchive, type WorkspaceArchiveOptions } from './workspaceArchive';
import { PackageArchive } from './zipArchive';
import { checkAbort } from './zipChecks';

const fail = (code: string): never => { throw new PackageControlError(code); };
const same = (a: unknown, b: unknown) => canonical(a as JsonValue) === canonical(b as JsonValue);
export function prepareBackupManifest(capture: BackupSourceCapture, options: WorkspaceArchiveOptions) {
  const originals = capture.originals(), descriptors = originals.map(({ path, sha256, byteLength }) => ({ path, sha256, byteLength }));
  const payloads = [...descriptors, ...capture.blobs];
  const manifest = backupEncode({ format: PACKAGE_FORMAT, wireVersion: PACKAGE_WIRE_VERSION, purpose: 'backup',
    packageId: options.packageId, createdByVersion: options.createdByVersion, ...(options.memo !== undefined ? { memo: options.memo } : {}),
    identity: capture.proof.identity, metadataEnvelope: capture.proof.envelope, targetHeads: capture.targetHeads,
    metadata: descriptors[0], protectedInventory: descriptors[1], exchangeBases: descriptors[2], baseEvidence: capture.description.baseEvidence,
    blobs: capture.blobs, summary: capture.summary, ...capabilityFields(capture.description.requiredCapabilities), payloadTotals: { entryCount: payloads.length,
      uncompressedBytes: payloads.reduce((n, e) => n + e.byteLength, 0), largestEntryBytes: Math.max(0, ...payloads.map(e => e.byteLength)) } });
  if (manifest.length + 64 + descriptors[1]!.byteLength + descriptors[2]!.byteLength + capture.description.baseControlBytes > L.controlsBytes) fail('backup-control-budget');
  const checksum = new TextEncoder().encode(packageByteHash(manifest));
  return { manifest, checksum, control: readManifestControl(manifest, checksum) };
}
export async function writeBackupArchive(capture: BackupSourceCapture, store: Pick<OriginBlobStore, 'openReadOnly'>,
  destination: WritableStream<Uint8Array>, options: WorkspaceArchiveOptions) {
  const owned = { packageId: options.packageId, createdByVersion: options.createdByVersion, memo: options.memo, signal: options.signal };
  let started = false;
  try {
    const controls = prepareBackupManifest(capture, owned); started = true;
    return await writeCausalArchive(capture, controls, capture.originals(), store, destination, owned);
  } catch (error) { if (!started) await destination.abort(error).catch(() => {}); throw error; }
}
/** Self-contained integrity only. Historical observations confer no local restore authority. */
export class BackupArchive {
  readonly kind = 'backup-archive-inspection';
  private constructor(readonly archive: PackageArchive, readonly source: ProjectMetadataSource,
    readonly description: Awaited<ReturnType<typeof inspectBackupOriginals>>) { Object.freeze(this); }
  static async inspect(file: Blob, limits: MetadataLimits, signal?: AbortSignal) {
    const archive = await PackageArchive.inspect(file, signal), m = archive.control.manifest;
    if (m.purpose !== 'backup') return fail('backup-purpose');
    const bytes = await archive.entryBytes('metadata.am', L.sourceBytes, signal);
    const source = ProjectMetadataSource.fromFullSource(bytes, { identity: m.identity, envelope: m.metadataEnvelope }, packageSourceLimits(limits));
    if (!same(source.heads, m.targetHeads)) fail('backup-heads');
    const table = await archive.entryBytes('exchange-bases.json', L.controlBytes, signal), evidence: BackupEvidenceBytes[] = [];
    const declared = readBackupBases(table, source.proof);
    if (!same(backupEvidenceRefs(declared.table), m.baseEvidence)) fail('backup-evidence-union');
    if (archive.control.entries[0]!.byteLength + 64 + m.exchangeBases.byteLength + m.protectedInventory.byteLength + declared.baseControlBytes > L.controlsBytes) fail('backup-control-budget');
    for (const reference of m.baseEvidence) evidence.push({ reference, bytes: await archive.entryBytes(`base-evidence/sha256/${reference.sha256}`, L.sourceBytes, signal) });
    const description = await inspectBackupOriginals(source, table, evidence, limits, signal);
    checkRequiredCapabilities(m.requiredCapabilities, description.requiredCapabilities);
    if (archive.control.entries[0]!.byteLength + 64 + m.exchangeBases.byteLength + m.protectedInventory.byteLength + description.baseControlBytes > L.controlsBytes) fail('backup-control-budget');
    const inventory = canonicalControl(await archive.entryBytes('protected-inventory.json', L.controlBytes, signal));
    if (!same(inventory, description.inventory) || !same(m.blobs, description.blobs)) fail('backup-protected-inventory');
    if (!same(m.summary, description.summary)) fail('backup-summary');
    checkAbort(signal); return new BackupArchive(archive, source, description);
  }
}
