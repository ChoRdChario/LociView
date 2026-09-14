import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { equalBytes, json, readReceipt, technicalId, writeReceipt } from '../projectMetadata/persistence';
import { TransactionJournal } from '../projectMetadata/journal';
import type { EvidenceRef } from './contract';
import { PACKAGE_LIMITS as L } from './contract';
import { cleanInputDescriptor, packageReference as reference } from './cleanInputDescriptor';
import { packageByteHash } from './manifest';
import { PreparedReviewEdit } from './reviewEdit';
import { CleanArchive } from './cleanArchive';
import { workspacePackageRoot } from './workspaceBases';

export interface ReviewEditBinding { jobId: string; prepared: EvidenceRef }
export type ReviewEditDescriptor = ReturnType<PreparedReviewEdit['descriptor']>;
export interface ReviewEditState { id: string; childId?: string; state: 'incomplete' | 'input-required' | 'unbound-input' | 'repair-required' | 'completed' | 'abandoned' }
export const reviewEditRoot = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}review-edit/${technicalId(id)}/`;
const index = (fs: ProjectWorkspaceFS, id: string) => `${workspacePackageRoot(fs)}review-edit-index/${technicalId(id)}.json`;
export const reviewEditMarker = (kind: 'index' | 'start', id: string, prepared: EvidenceRef) => ({ schema: `lociview-review-edit-${kind}-1`, jobId: id, prepared });
const abandoned = (id: string) => ({ schema: 'lociview-review-edit-abandoned-1', jobId: id, stage: 'beforeStart' });
export const reviewCleanMarker = (kind: 'index' | 'start', id: string, input: EvidenceRef, reviewEdit: ReviewEditBinding) =>
  ({ schema: `lociview-clean-review-input-${kind}-1`, jobId: id, input, reviewEdit });

/** Read typed backlink without opening the child, avoiding parent/child hash or validation cycles. */
export async function reviewEditChildBinding(fs: ProjectWorkspaceFS, childId: string, limits: MetadataLimits): Promise<ReviewEditBinding | undefined> {
  technicalId(childId); let result: ReviewEditBinding | undefined;
  for (const kind of ['index', 'start'] as const) {
    const path = kind === 'index' ? `${workspacePackageRoot(fs)}clean-input-index/${childId}.json` : `${workspacePackageRoot(fs)}clean-input/${childId}/start.json`;
    const marker = await readReceipt<{ schema: string; jobId: string; input: EvidenceRef; reviewEdit?: ReviewEditBinding }>(fs, path, limits);
    if (!marker || marker.schema === `lociview-clean-input-${kind}-1` && !marker.reviewEdit) continue;
    if (!marker.reviewEdit) return fail('review-edit-child-binding');
    const binding = marker.reviewEdit; technicalId(binding.jobId);
    if (json(marker) !== json(reviewCleanMarker(kind, childId, marker.input, binding)) || result && json(result) !== json(binding)) fail('review-edit-child-binding');
    result = binding;
  }
  return result;
}

async function reviewEditChildren(fs: ProjectWorkspaceFS, limits: MetadataLimits) {
  const prefix = `${workspacePackageRoot(fs)}clean-input/`, ix = `${workspacePackageRoot(fs)}clean-input-index/`;
  const paths = [...await fs.list(ix), ...(await fs.list(prefix)).filter(p => p.endsWith('/start.json'))];
  if (paths.length > L.entryCount) fail('review-edit-budget');
  const ids = new Set(paths.map(p => p.startsWith(ix) ? technicalId(p.slice(ix.length, -5)) : technicalId(p.slice(prefix.length, prefix.length + 32))));
  const children: { id: string; binding: ReviewEditBinding }[] = [];
  for (const id of ids) { const binding = await reviewEditChildBinding(fs, id, limits); if (binding) children.push({ id, binding }); }
  return children;
}
async function hasReviewEditChild(fs: ProjectWorkspaceFS, id: string, childId: string | undefined, limits: MetadataLimits) {
  if ((await reviewEditChildren(fs, limits)).some(c => c.binding.jobId === id)) return true;
  return !!childId && ((await new TransactionJournal(fs, limits).entries()).some(e => e.start.transactionId === childId) ||
    await fs.exists(`${workspacePackageRoot(fs)}clean-input/${childId}/published.json`));
}

/** Parent-only preparations and missing parents referenced by a durable child are both discoverable. */
export async function reviewEditIds(fs: ProjectWorkspaceFS, limits: MetadataLimits) {
  const prefix = `${workspacePackageRoot(fs)}review-edit/`, ix = `${workspacePackageRoot(fs)}review-edit-index/`;
  const paths = await fs.list(prefix), indices = await fs.list(ix); let controlBytes = 0;
  if (paths.length + indices.length > L.entryCount) fail('review-edit-budget');
  for (const path of [...paths, ...indices]) {
    if (!(path.startsWith(prefix) ? /^[0-9a-f]{32}\/(prepared\.json|recipe\.json|metadata\.am|copy\.zip|original\.zip|start\.json|published\.json|abandoned\.json)$/.test(path.slice(prefix.length)) : /^[0-9a-f]{32}\.json$/.test(path.slice(ix.length)))) fail('review-edit-path');
    const file = await fs.readStream(path), max = path.endsWith('.zip') ? L.archiveBytes : path.endsWith('.am') ? L.sourceBytes : L.controlBytes;
    if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > max) fail('review-edit-budget');
    if (path.endsWith('.json') && (controlBytes += file!.size) > L.controlsBytes) fail('review-edit-budget');
  }
  const ids = new Set([...paths.map(p => p.slice(prefix.length, prefix.length + 32)), ...indices.map(p => p.slice(ix.length, ix.length + 32))]);
  for (const child of await reviewEditChildren(fs, limits)) ids.add(child.binding.jobId);
  return [...ids];
}

async function blob(fs: ProjectWorkspaceFS, path: string, expected: EvidenceRef) {
  const f = await fs.readStream(path); if (!f?.blob || f.size !== expected.byteLength) return fail('review-edit-missing');
  const b = await f.blob(); if (b.size !== expected.byteLength) fail('review-edit-size'); return b;
}
export async function readReviewEdit(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits, replacement?: Blob) {
  const path = reviewEditRoot(fs, id), descriptor = await readReceipt<ReviewEditDescriptor>(fs, `${path}prepared.json`, limits);
  if (!descriptor || descriptor.jobId !== id || descriptor.schema !== 'lociview-review-edit-1') return fail('review-edit-prepared');
  technicalId(descriptor.childId);
  const ref = reference(descriptor), started = await readReceipt(fs, `${path}start.json`, limits);
  if (json(await readReceipt(fs, index(fs, id), limits)) !== json(reviewEditMarker('index', id, ref))) fail('review-edit-index');
  if (started && json(started) !== json(reviewEditMarker('start', id, ref))) fail('review-edit-start');
  if (!started && await hasReviewEditChild(fs, id, descriptor.childId, limits)) fail('review-edit-acknowledged-start-missing');
  if (await fs.exists(`${path}abandoned.json`)) fail('review-edit-abandoned');
  if (replacement && (started || await fs.exists(`${path}original.zip`))) fail('review-edit-reselect-denied');
  const recipe = await readReceipt<PreparedReviewEdit['reconstruction']>(fs, `${path}recipe.json`, limits), metadata = await fs.readBytes(`${path}metadata.am`);
  if (!recipe || !metadata || json(reference(recipe)) !== json(descriptor.recipe) || metadata.length !== descriptor.metadata.byteLength || packageByteHash(metadata) !== descriptor.metadata.sha256) fail('review-edit-evidence');
  const copy = await blob(fs, `${path}copy.zip`, descriptor.copy);
  const original = replacement ?? await blob(fs, `${path}original.zip`, descriptor.original);
  const prepared = await PreparedReviewEdit.restore({ id, childId: descriptor.childId, original, recipe: recipe!, metadata: metadata!, destination: descriptor.destination, copy }, limits);
  if (json(prepared.descriptor()) !== json(descriptor)) fail('review-edit-binding');
  return { prepared, descriptor, started: !!started, binding: { jobId: id, prepared: ref } };
}

/** Child admission requires a completed parent Start and all bound original evidence. No child recursion. */
export async function validateReviewEditChild(fs: ProjectWorkspaceFS, childId: string, input: unknown, binding: ReviewEditBinding, limits: MetadataLimits) {
  const parent = await readReviewEdit(fs, binding.jobId, limits);
  if (!parent.started || parent.descriptor.childId !== childId || json(parent.binding) !== json(binding) ||
    json(reference(input)) !== json(parent.descriptor.childInput)) fail('review-edit-child-binding');
  return parent;
}

/** Exact initial publication only: current heads may legitimately include subsequent user edits. */
export async function reviewEditPublication(fs: ProjectWorkspaceFS, parent: Awaited<ReturnType<typeof readReviewEdit>>, limits: MetadataLimits) {
  const { descriptor: d, prepared, binding } = parent, childRoot = `${workspacePackageRoot(fs)}clean-input/${d.childId}/`;
  if (!parent.started) return fail('review-edit-incomplete');
  const input = cleanInputDescriptor(d.childId, prepared.clean), start = reviewCleanMarker('start', d.childId, reference(input), binding);
  if (json(await readReceipt(fs, `${childRoot}input.json`, limits)) !== json(input) ||
    json(await readReceipt(fs, `${childRoot}start.json`, limits)) !== json(start) ||
    json(await readReceipt(fs, `${workspacePackageRoot(fs)}clean-input-index/${d.childId}.json`, limits)) !== json(reviewCleanMarker('index', d.childId, reference(input), binding))) fail('review-edit-child-evidence');
  const journal = new TransactionJournal(fs, limits), e = (await journal.entries()).find(e => e.start.transactionId === d.childId);
  if (!e?.prepared || !e.publication || e.start.purpose !== 'importClean' || e.start.repositoryId !== d.childId || e.start.predecessor !== null || e.start.baseHeads.length || e.prepared.remote ||
    json(e.start.proof) !== json(d.destination) || json(e.publication.heads) !== json(prepared.clean.source.heads)) return fail('review-edit-child-publication');
  const parts = await journal.validateParts(e.prepared), original = prepared.clean.source.originalChanges();
  if (parts.length !== original.length || parts.some((p, i) => !equalBytes(p, original[i]!))) fail('review-edit-originals');
  const publication = { schema: 'lociview-clean-input-published-1', jobId: d.childId, start: reference(start), journal: reference(e.prepared), publication: reference(e.publication) };
  if (json(await readReceipt(fs, `${childRoot}published.json`, limits)) !== json(publication)) fail('review-edit-child-incomplete');
  return { schema: 'lociview-review-edit-published-1', jobId: d.jobId, prepared: reference(d), childId: d.childId, publication: reference(publication) };
}

export async function reviewEditStates(fs: ProjectWorkspaceFS, limits: MetadataLimits): Promise<ReviewEditState[]> {
  const result: ReviewEditState[] = [];
  const children = await reviewEditChildren(fs, limits);
  for (const id of await reviewEditIds(fs, limits)) {
    const path = reviewEditRoot(fs, id); let childId = children.find(c => c.binding.jobId === id)?.id;
    try {
      const d = await readReceipt<ReviewEditDescriptor>(fs, `${path}prepared.json`, limits);
      if (d?.childId) { if (childId && childId !== d.childId) fail('review-edit-child-binding'); childId = technicalId(d.childId); }
      const stop = await readReceipt(fs, `${path}abandoned.json`, limits), started = await fs.exists(`${path}start.json`);
      if (!started && await hasReviewEditChild(fs, id, childId, limits)) fail('review-edit-acknowledged-start-missing');
      if (stop) {
        if (started || json(stop) !== json(abandoned(id)) || childId && ((await new TransactionJournal(fs, limits).entries()).some(e => e.start.transactionId === childId) ||
          await fs.exists(`${workspacePackageRoot(fs)}clean-input/${childId}/start.json`))) fail('review-edit-state');
        result.push({ id, childId, state: 'abandoned' }); continue;
      }
      if (!started) {
        // Only an absent original can be reselected. Other incomplete preparation is explicitly abandoned.
        if (!d || !await fs.exists(index(fs, id)) || !await fs.exists(`${path}recipe.json`) || !await fs.exists(`${path}metadata.am`) || !await fs.exists(`${path}copy.zip`)) {
          result.push({ id, childId, state: 'unbound-input' }); continue;
        }
        if (!await fs.exists(`${path}original.zip`)) { result.push({ id, childId, state: 'input-required' }); continue; }
      }
      const parent = await readReviewEdit(fs, id, limits), receipt = await readReceipt(fs, `${path}published.json`, limits);
      const childRoot = `${workspacePackageRoot(fs)}clean-input/${parent.descriptor.childId}/`, childStart = await readReceipt(fs, `${childRoot}start.json`, limits);
      const childJournal = (await new TransactionJournal(fs, limits).entries()).some(e => e.start.transactionId === parent.descriptor.childId);
      if (!childStart && (childJournal || await fs.exists(`${childRoot}published.json`))) fail('review-edit-child-start-missing');
      if (childStart) {
        const input = cleanInputDescriptor(parent.descriptor.childId, parent.prepared.clean), inputRef = reference(input);
        if (json(childStart) !== json(reviewCleanMarker('start', parent.descriptor.childId, inputRef, parent.binding)) ||
          json(await readReceipt(fs, `${childRoot}input.json`, limits)) !== json(input) ||
          json(await readReceipt(fs, `${workspacePackageRoot(fs)}clean-input-index/${parent.descriptor.childId}.json`, limits)) !== json(reviewCleanMarker('index', parent.descriptor.childId, inputRef, parent.binding))) fail('review-edit-child-evidence');
        const copy = await CleanArchive.inspect(await blob(fs, `${childRoot}input.zip`, parent.descriptor.copy), limits);
        if (copy.archive.sha256 !== parent.descriptor.copy.sha256) fail('review-edit-child-evidence');
      }
      if (receipt && json(receipt) !== json(await reviewEditPublication(fs, parent, limits))) fail('review-edit-completion');
      result.push({ id, childId, state: receipt ? 'completed' : 'incomplete' });
    } catch { result.push({ id, childId, state: 'repair-required' }); }
  }
  return result;
}

export async function assertReviewEditSlot(fs: ProjectWorkspaceFS, limits: MetadataLimits, ownChild?: string) {
  for (const state of await reviewEditStates(fs, limits)) {
    if (state.state === 'abandoned' || state.state === 'completed') continue;
    if (state.state !== 'incomplete' || !ownChild || ownChild !== state.childId) fail('review-edit-pending');
    const parent = await readReviewEdit(fs, state.id, limits); if (!parent.started) fail('review-edit-pending');
  }
}

export async function abandonReviewEdit(fs: ProjectWorkspaceFS, id: string, limits: MetadataLimits) {
  const state = (await reviewEditStates(fs, limits)).find(s => s.id === id);
  if (!state || !['input-required', 'unbound-input', 'abandoned'].includes(state.state) || await fs.exists(`${reviewEditRoot(fs, id)}start.json`)) fail('review-edit-abandon-denied');
  if (await hasReviewEditChild(fs, id, state?.childId, limits)) fail('review-edit-abandon-denied');
  await writeReceipt(fs, `${reviewEditRoot(fs, id)}abandoned.json`, abandoned(id), limits);
}

export async function persistReviewEdit(fs: ProjectWorkspaceFS, prepared: PreparedReviewEdit, limits: MetadataLimits) {
  fs.mutationAuthority.assertWorkspaceWriteAuthorized();
  const id = prepared.id, path = reviewEditRoot(fs, id), d = prepared.descriptor(), ref = reference(d);
  if (await fs.exists(`${path}start.json`) || await fs.exists(`${path}abandoned.json`)) fail('review-edit-state');
  if (await hasReviewEditChild(fs, id, prepared.childId, limits) || (await new TransactionJournal(fs, limits).entries()).length) fail('review-edit-existing-authority');
  if ((await reviewEditStates(fs, limits)).some(j => j.id !== id && j.state !== 'abandoned')) fail('review-edit-existing-authority');
  for (const control of [d, prepared.reconstruction, reviewEditMarker('index', id, ref), reviewEditMarker('start', id, ref)])
    if (reference(control).byteLength > L.controlBytes) fail('review-edit-control-budget');
  let bytes = 0;
  const paths = await fs.list(workspacePackageRoot(fs)); if (paths.length > L.entryCount) fail('review-edit-budget');
  for (const p of paths) { const f = await fs.readStream(p); if (!f || !Number.isSafeInteger(f.size) || f.size < 0) return fail('review-edit-size'); bytes += f.size; }
  const bodies = prepared.clean.description.closure.entries.reduce((n, e) => n + e.byteLength, 0);
  const journalBytes = prepared.clean.source.originalChanges().reduce((n, part) => n + part.byteLength, 0);
  if (bytes + prepared.original.size + 2 * prepared.copy.size + bodies + d.metadata.byteLength + 4 * journalBytes + 12 * L.controlBytes > 2_147_483_648 - 16_777_216) fail('review-edit-budget');
  await writeReceipt(fs, `${path}prepared.json`, d, limits);
  await writeReceipt(fs, index(fs, id), reviewEditMarker('index', id, ref), limits);
  await writeReceipt(fs, `${path}recipe.json`, prepared.reconstruction, limits);
  const write = async (name: string, payload: Blob) => {
    if (await fs.exists(`${path}${name}`)) return; // Existing bytes are verified below, never overwritten.
    await fs.writeStream(`${path}${name}`, payload.stream());
  };
  await write('metadata.am', new Blob([prepared.clean.source.encodeFullSource().slice().buffer]));
  await write('copy.zip', prepared.copy); await write('original.zip', prepared.original);
  await readReviewEdit(fs, id, limits);
  await writeReceipt(fs, `${path}start.json`, reviewEditMarker('start', id, ref), limits);
}
