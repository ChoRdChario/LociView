import { object, same, string } from '../domain/projectGraphSupport';
import { fail, type MetadataLimits, type MetadataProof } from '../projectMetadata/format';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { newId, technicalId } from '../projectMetadata/persistence';
import { CleanArchive, writeCleanArchive } from './cleanArchive';
import { cleanInputDescriptor, packageReference } from './cleanInputDescriptor';
import { type CleanReconstruction } from './cleanRecords';
import { inspectCleanSource } from './cleanSource';
import { packageSourceLimits } from './contributionEvidence';
import { PACKAGE_LIMITS as L } from './contract';
import { packageByteHash } from './manifest';
import { ReviewArchive } from './reviewArchive';
import { prepareReviewEdit } from './reviewSnapshot';

/** Pure explicit preparation. IDs, original bytes, metadata actor/root and private ZIP are frozen once. */
export class PreparedReviewEdit {
  private constructor(readonly id: string, readonly childId: string, readonly original: Blob,
    readonly review: ReviewArchive, readonly reconstruction: CleanReconstruction, readonly copy: Blob,
    readonly clean: CleanArchive) {}
  get run() { return technicalId(string(this.clean.source.proof.identity.projectId).slice(4)); }
  descriptor() {
    const bytes = this.clean.source.encodeFullSource(), child = cleanInputDescriptor(this.childId, this.clean);
    const original = { sha256: this.review.archive.sha256, byteLength: this.original.size }, snapshot = packageReference(this.review.review.snapshot),
      recipe = packageReference(this.reconstruction), metadata = { sha256: packageByteHash(bytes), byteLength: bytes.length },
      copy = { sha256: this.clean.archive.sha256, byteLength: this.copy.size };
    return { schema: 'lociview-review-edit-1', jobId: this.id, childId: this.childId,
      original, snapshot, recipe, metadata, copy, destination: this.clean.source.proof, childInput: packageReference(child),
      roots: { blobs: child.roots.blobs, evidence: [...child.roots.evidence, original, snapshot, recipe, metadata, copy]
        .filter((e, i, all) => all.findIndex(r => r.sha256 === e.sha256) === i).sort((a, b) => a.sha256 < b.sha256 ? -1 : 1) } };
  }
  static async prepare(file: Blob, limits: MetadataLimits) {
    const original = file.slice(), review = await ReviewArchive.inspect(original, limits);
    const { records, reconstruction, semanticProfile } = await prepareReviewEdit(review.review, limits);
    const source = ProjectMetadataSource.bootstrap(object(records.schema), object(records.identity), packageSourceLimits(limits), { time: 0, semanticProfile }).initialize(records, { time: 0 });
    const description = await inspectCleanSource(source, limits), bytes = source.encodeFullSource();
    const parts: BlobPart[] = []; let size = 0;
    await writeCleanArchive({ metadataBytes: () => bytes.slice(), proof: source.proof, targetHeads: source.heads,
      metadata: { path: 'metadata.am', sha256: packageByteHash(bytes), byteLength: bytes.length },
      blobs: description.closure.entries, bodyRefs: description.closure.semanticRefs, summary: description.summary },
    { openReadOnly: async ref => {
      const digest = 'digest' in ref ? ref.digest : undefined;
      const entry = review.review.closure.entries.find(e => e.sha256 === digest);
      if (!entry) return fail('review-edit-body');
      const blob = review.archive.entryBlob(entry.path);
      return { size: blob.size, stream: () => blob.stream(), blob: async () => blob };
    } }, new WritableStream<Uint8Array>({ write(chunk) {
      if ((size += chunk.length) > L.archiveBytes) fail('review-edit-budget'); parts.push(chunk.slice().buffer);
    } }), { packageId: `pkg_${newId()}`, createdByVersion: 'isolated-review-edit-1' });
    const copy = new Blob(parts), clean = await CleanArchive.inspect(copy, limits);
    return new PreparedReviewEdit(newId(), newId(), original, review, reconstruction, copy, clean);
  }
  /** Cold verification reconstructs records, never an Automerge actor or initialization. */
  static async restore(input: { id: string; childId: string; original: Blob; recipe: CleanReconstruction;
    metadata: Uint8Array; destination: MetadataProof; copy: Blob }, limits: MetadataLimits) {
    technicalId(input.id); technicalId(input.childId);
    const review = await ReviewArchive.inspect(input.original, limits), clean = await CleanArchive.inspect(input.copy, limits);
    const source = ProjectMetadataSource.fromFullSource(input.metadata, input.destination, packageSourceLimits(limits));
    const prepared = await prepareReviewEdit(review.review, limits, input.recipe), description = await inspectCleanSource(source, limits);
    if (!same(prepared.records, description.records) || source.token !== clean.source.token ||
      packageByteHash(input.metadata) !== packageByteHash(clean.source.encodeFullSource())) fail('review-edit-reconstruction');
    return new PreparedReviewEdit(input.id, input.childId, input.original.slice(), review, prepared.reconstruction, input.copy.slice(), clean);
  }
}
