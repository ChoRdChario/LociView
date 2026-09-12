import type { CaptionDeletionCommand, CaptionDeletionImpact } from '../scene/commands';
import type { ProjectProviderRead } from '../scene/projectProvider';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { candidateReader } from './membership';
import { fail, type MetadataLimits } from './format';
import type { MetadataRecordEdit } from './commands';

type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
/** Deletion is not copying: inspect identity/endpoints/lifecycle, preserve other candidates. */
export function captionDeletionImpact(provider: Provider, captionId: string, limits: MetadataLimits): CaptionDeletionImpact {
  const r = candidateReader(provider, limits);
  r.active('captionsById', captionId);
  const children = <K extends 'sceneId' | 'mediaResourceId' | 'tagId'>(
    map: 'sceneCaptionMembershipsById' | 'captionAttachmentsById' | 'captionTagMembershipsById', field: K,
  ): ({ id: string } & Record<K, string>)[] => r.related(map, { captionId }).map(id => {
    const endpoint = r.exact(map, id, field);
    if (typeof endpoint !== 'string') return fail('caption-deletion-endpoint');
    return { id, [field]: endpoint } as { id: string } & Record<K, string>;
  });
  return { captionId, memberships: children('sceneCaptionMembershipsById', 'sceneId'),
    attachments: children('captionAttachmentsById', 'mediaResourceId'), tags: children('captionTagMembershipsById', 'tagId') };
}

export function planCaptionDeletion(provider: Provider, command: CaptionDeletionCommand, limits: MetadataLimits): MetadataRecordEdit[] {
  if (Object.keys(command).sort().join(',') !== 'captionId,eventId,kind,observedAttachmentIds,observedMembershipIds,observedTagMembershipIds')
    fail('caption-deletion-shape');
  const guard = new ProjectRecordFields(); guard.id(command.captionId, 'cap', []); guard.id(command.eventId, 'evt', []);
  const impact = captionDeletionImpact(provider, command.captionId, limits);
  const sets = [
    ['sceneCaptionMembershipsById', command.observedMembershipIds, impact.memberships],
    ['captionAttachmentsById', command.observedAttachmentIds, impact.attachments],
    ['captionTagMembershipsById', command.observedTagMembershipIds, impact.tags],
  ] as const;
  const lifecycle = { state: 'deleted', reason: 'userDelete', eventId: command.eventId };
  const edits: MetadataRecordEdit[] = [{ map: 'captionsById', id: command.captionId, create: false, fields: { lifecycle } }];
  for (const [map, observed, actual] of sets) {
    const ids = new Set(actual.map(e => e.id));
    if (!Array.isArray(observed) || observed.length !== ids.size || new Set(observed).size !== observed.length || !observed.every(id => ids.has(id)))
      fail('caption-deletion-observed');
    for (const id of observed) edits.push({ map, id, create: false, fields: { lifecycle } });
  }
  return edits;
}
