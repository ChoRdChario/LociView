import type { ProjectProviderRead } from '../../scene/projectProvider';
import type { Field, Lifecycle } from '../../scene/types';
import { canonical, same } from '../../domain/projectGraphSupport';
import type { HistoryCell } from './historyPort';
import { attachmentFields, attachmentKey, type MediaData, type SyntheticAttachment } from './mediaHistory';

/** Same-provider fields/candidates. Image sources are supplied only by verified saved-byte I/O. */
export function metadataMediaData(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>, images: NonNullable<MediaData['images']>): MediaData {
  const fields = new Map(provider.inspection.candidates.fields.map(f => [JSON.stringify(f.path), f]));
  const cells: Record<string, HistoryCell> = {}, records: Record<string, SyntheticAttachment> = {};
  const available: Record<string, NonNullable<MediaData['images']>[string]> = {};
  for (const [id, field] of Object.entries(provider.details.immutable.mediaResourcesById)) {
    const image = images[id];
    if (field.kind === 'value' && image && same(field.value, image.record)) available[id] = image;
  }
  for (const [id, r] of Object.entries(provider.details.mutable.captionAttachmentsById)) {
    const original = fields.get(JSON.stringify(['captionAttachmentsById', id, 'captionId']));
    const valid = new Set(original?.validOperationIds);
    const captionCandidates = (original?.candidates ?? []).flatMap(c => valid.has(c.operationId) && c.value.kind === 'value' &&
      typeof c.value.value === 'string' ? [c.value.value] : []);
    const target = provider.details.attachments[id], mediaId = r.mediaResourceId;
    records[id] = { id, captionId: r.captionId as Field<string>, mediaResourceId: mediaId as Field<string>,
      altText: r.altText?.kind === 'value' && r.altText.value === undefined ? { kind: 'value', value: '' } : r.altText as Field<string>,
      orderKey: r.orderKey as Field<string>, lifecycle: r.lifecycle as Field<Lifecycle>, captionCandidates,
      available: target?.kind === 'value' && mediaId?.kind === 'value' && typeof mediaId.value === 'string' && !!available[mediaId.value],
      deleteEdit: provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[0] === 'captionAttachmentsById' && i.path[1] === id) };
    for (const name of attachmentFields) {
      const f = fields.get(JSON.stringify(['captionAttachmentsById', id, name])), projected = r[name], c = f?.candidates[0]?.value;
      if (f?.valid && f.candidates.length === 1 && projected?.kind === 'value' && c?.kind === 'value' && same(c.value, projected.value))
        cells[attachmentKey(id, name)] = { kind: 'value', value: typeof c.value === 'string' ? c.value : canonical(c.value) };
    }
  }
  return { records, cells, images: available };
}
