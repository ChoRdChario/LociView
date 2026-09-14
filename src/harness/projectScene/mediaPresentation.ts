import type { MediaPreviewGroup, MediaPreviewReader } from '../../ui/projectScene/mediaPreview';
import { fixtureIds, type SyntheticProject } from './fixture';
import { attachmentImage, captionAttachments, fixtureMedia } from './mediaHistory';

export const mediaScope = (project: SyntheticProject, sceneId: string | null) => JSON.stringify([project.projectId ?? fixtureIds.project, sceneId]);
export function captionMediaGroup(project: SyntheticProject, sceneId: string | null, captionId: string): MediaPreviewGroup {
  const title = project.resources.captions[captionId]?.title;
  return { scope: JSON.stringify([mediaScope(project, sceneId), captionId]), label: title?.kind === 'value' ? title.value || 'キャプション' : 'キャプション',
    items: captionAttachments(project.mediaData, captionId).ready.map(row => {
      const image = attachmentImage(row, project.mediaData)!;
      return { id: row.id, resourceId: image.record.id, label: image.record.label,
        description: row.altText.kind === 'value' ? row.altText.value : '説明の更新候補を確認してください。', image: { base64: image.base64 } };
    }) };
}
/** Captured scope permits ordinary edits, not accidental reuse after a Scene/Project switch. */
export function captionMediaReader(read: () => SyntheticProject, scene: () => string | null, captionId: string): MediaPreviewReader {
  const scope = mediaScope(read(), scene());
  return () => mediaScope(read(), scene()) === scope ? captionMediaGroup(read(), scene(), captionId) : null;
}
export function registeredMediaGroup(project: SyntheticProject, sceneId: string | null): MediaPreviewGroup {
  const choices = project.mediaChoices ?? fixtureMedia.map(m => m.record);
  return { scope: mediaScope(project, sceneId), label: '登録済みメディア', items: choices.map(record => {
    const source = project.mediaData?.images === undefined ? fixtureMedia.find(m => m.record.id === record.id) : project.mediaData.images[record.id];
    return { id: record.id, resourceId: record.id, label: record.label, description: '', image: source ? { base64: source.base64 } : null };
  }) };
}
