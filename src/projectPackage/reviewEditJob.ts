import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { underWriteLease, writeReceipt } from '../projectMetadata/persistence';
import type { MetadataProjectSession } from '../projectMetadata/session';
import { CleanInputJob } from './cleanInputJob';
import { PreparedReviewEdit } from './reviewEdit';
import { abandonReviewEdit, persistReviewEdit, readReviewEdit, reviewEditRoot, reviewEditPublication, reviewEditStates, type CompletedReviewChild } from './reviewEditControls';

/** Parent persistence and clean initialization take successive, never nested, write leases.
 * The existing file service owns one outer package-operation lock. */
export class ReviewEditJob {
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly session: MetadataProjectSession, private readonly limits: MetadataLimits) {}
  states(completedChild?: (observation: CompletedReviewChild) => void) { return reviewEditStates(this.fs, this.limits, completedChild); }
  async start(prepared: PreparedReviewEdit) {
    await underWriteLease(this.fs, () => persistReviewEdit(this.fs, prepared, this.limits));
    return this.retry(prepared.id);
  }
  async retry(id: string) {
    let parent = await readReviewEdit(this.fs, id, this.limits);
    if (!parent.started) {
      await underWriteLease(this.fs, () => persistReviewEdit(this.fs, parent.prepared, this.limits));
      parent = await readReviewEdit(this.fs, id, this.limits);
    }
    const job = await CleanInputJob.prepareReview(this.fs, parent.descriptor.childId, parent.prepared.copy, parent.binding, this.limits);
    await this.session.initializeClean(job);
    await underWriteLease(this.fs, async () => {
      parent = await readReviewEdit(this.fs, id, this.limits);
      await job.validateCompletion();
      await writeReceipt(this.fs, `${reviewEditRoot(this.fs, id)}published.json`, await reviewEditPublication(this.fs, parent, this.limits), this.limits);
    });
    return this.session.read(); // Preserve any later edits when completion is retried.
  }
  async reselect(id: string, file: Blob) {
    const state = (await this.states()).find(s => s.id === id);
    if (state?.state !== 'input-required') return fail('review-edit-reselect-denied');
    const parent = await readReviewEdit(this.fs, id, this.limits, file);
    return this.start(parent.prepared);
  }
  abandon(id: string) { return underWriteLease(this.fs, () => abandonReviewEdit(this.fs, id, this.limits)); }
}
