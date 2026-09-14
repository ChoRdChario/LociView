import { fail } from '../projectMetadata/format';
import { json, technicalId } from '../projectMetadata/persistence';
import type { CleanArchive } from './cleanArchive';
import { packageByteHash } from './manifest';

export const packageReference = (value: unknown) => {
  const bytes = new TextEncoder().encode(json(value));
  return { sha256: packageByteHash(bytes), byteLength: bytes.length };
};

/** Identical ordinary clean-input descriptor, also bound by a review-edit parent. */
export function cleanInputDescriptor(id: string, inspection: CleanArchive) {
  technicalId(id);
  const a = inspection.archive, m = a.control.manifest;
  if (m.purpose !== 'clean') return fail('clean-input-purpose');
  const manifest = a.control.entries.find(e => e.path === 'manifest.json')!, metadata = m.metadata;
  const refs = [manifest, metadata].map(({ sha256, byteLength }) => ({ sha256, byteLength })).sort((a, b) => a.sha256 < b.sha256 ? -1 : 1);
  return { schema: 'lociview-clean-input-1', jobId: id, archive: { sha256: a.sha256, byteLength: a.byteLength },
    manifest: { sha256: manifest.sha256, byteLength: manifest.byteLength }, metadata: { sha256: metadata.sha256, byteLength: metadata.byteLength },
    destination: inspection.source.proof, roots: { blobs: m.blobs.map(({ sha256, byteLength }) => ({ sha256, byteLength })), evidence: refs } };
}
