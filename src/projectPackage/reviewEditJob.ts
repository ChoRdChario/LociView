import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { underWriteLease, withMetadataRead, writeReceipt } from '../projectMetadata/persistence';
import type { MetadataProjectSession, MetadataSessionRead } from '../projectMetadata/session';
import { cleanInputDescriptor } from './cleanInputDescriptor';
import { CleanInputJob } from './cleanInputJob';
import { PreparedReviewEdit } from './reviewEdit';
import { PreparedReviewCopy, ReviewCopyInputJob } from './reviewCopyInput';
import { abandonReviewEdit, persistReviewEdit, readReviewEdit, reviewEditRoot, reviewEditStates, type CompletedReviewChild } from './reviewEditControls';

/** Parent persistence and clean initialization take successive, never nested, write leases.
 * The existing file service owns one outer package-operation lock. */
export class ReviewEditJob {
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly session: MetadataProjectSession, private readonly limits: MetadataLimits) {}
  async states(completedChild?: (observation: CompletedReviewChild) => void) {
    const completed: CompletedReviewChild[] = [];
    const states = await withMetadataRead(this.fs, undefined, async ({ fs }) => [
      ...await reviewEditStates(fs, this.limits, row => completed.push(row)), ...await ReviewCopyInputJob.states(fs, this.limits)]);
    for (const row of completed) completedChild?.(row);
    return states;
  }
  async start(prepared: PreparedReviewEdit | PreparedReviewCopy): Promise<MetadataSessionRead> {
    if (prepared instanceof PreparedReviewCopy) {
      if ((await ReviewCopyInputJob.ids(this.fs, this.limits)).includes(prepared.id)) {
        const state = (await ReviewCopyInputJob.states(this.fs, this.limits)).find(s => s.id === prepared.id);
        if (state?.state === 'input-required') return this.reselect(prepared.id, prepared.original);
        return this.retry(prepared.id);
      }
      return this.session.initializeReviewCopy(ReviewCopyInputJob.prepare(this.fs, prepared, this.limits));
    }
    await underWriteLease(this.fs, () => persistReviewEdit(this.fs, prepared, this.limits));
    return this.retry(prepared.id);
  }
  async retry(id: string) {
    if ((await ReviewCopyInputJob.ids(this.fs, this.limits)).includes(id))
      return this.session.initializeReviewCopy(await ReviewCopyInputJob.retry(this.fs, id, this.limits));
    let parent = await readReviewEdit(this.fs, id, this.limits);
    if (!parent.started) {
      await underWriteLease(this.fs, () => persistReviewEdit(this.fs, parent.prepared, this.limits));
      parent = await readReviewEdit(this.fs, id, this.limits);
    }
    const input = cleanInputDescriptor(parent.descriptor.childId, parent.prepared.clean);
    const job = await CleanInputJob.prepareReview(this.fs, input, parent.binding, this.limits);
    await this.session.initializeClean(job);
    await underWriteLease(this.fs, async () => {
      const publication = await job.reviewParentPublication(parent.binding);
      await writeReceipt(this.fs, `${reviewEditRoot(this.fs, id)}published.json`, publication, this.limits);
    });
    return this.session.read(); // Preserve any later edits when completion is retried.
  }
  async reselect(id: string, file: Blob): Promise<MetadataSessionRead> {
    if ((await ReviewCopyInputJob.ids(this.fs, this.limits)).includes(id))
      return this.session.initializeReviewCopy(await ReviewCopyInputJob.reselect(this.fs, id, file, this.limits));
    const state = (await this.states()).find(s => s.id === id);
    if (state?.state !== 'input-required') return fail('review-edit-reselect-denied');
    const parent = await readReviewEdit(this.fs, id, this.limits, file);
    return this.start(parent.prepared);
  }
  async abandon(id: string) {
    return underWriteLease(this.fs, async () => (await ReviewCopyInputJob.ids(this.fs, this.limits)).includes(id)
      ? ReviewCopyInputJob.abandon(this.fs, id, this.limits) : abandonReviewEdit(this.fs, id, this.limits));
  }
}
