import { mediaDisplayDescription, type MediaPreviewGroup, type MediaPreviewReader } from '../../ui/projectScene/mediaPreview';
import { fixtureIds, type SyntheticProject } from './fixture';
import { attachmentImage, captionAttachments, fixtureMedia, type MediaImage } from './mediaHistory';
const mediaBodies=new WeakMap<MediaImage,Blob>();
const portable=(source:MediaImage|undefined)=>source?.record.blob.mediaType==='image/heic'&&source.displayMediaType==='image/png';
const previewBody=(source:MediaImage)=>{if(source.record.mediaKind==='image')return{base64:source.base64,mediaType:source.displayMediaType??source.record.blob.mediaType};let blob=mediaBodies.get(source);if(!blob){blob=new Blob([Uint8Array.from(atob(source.base64),c=>c.charCodeAt(0)).buffer],{type:source.record.blob.mediaType});mediaBodies.set(source,blob);}return{blob};};

export const mediaScope = (project: SyntheticProject, sceneId: string | null) => JSON.stringify([project.projectId ?? fixtureIds.project, sceneId]);
export function captionMediaGroup(project: SyntheticProject, sceneId: string | null, captionId: string): MediaPreviewGroup {
  const title = project.resources.captions[captionId]?.title;
  return { scope: JSON.stringify([mediaScope(project, sceneId), captionId]), label: title?.kind === 'value' ? title.value || 'キャプション' : 'キャプション',
    items: captionAttachments(project.mediaData, captionId).ready.map(row => {
      const image = attachmentImage(row, project.mediaData)!;
      return { id: row.id, resourceId: image.record.id, label: image.record.label,kind:image.record.mediaKind,
        description: mediaDisplayDescription(row.altText.kind === 'value' ? row.altText.value : '説明の更新候補を確認してください。',portable(image)), image: previewBody(image) };
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
    return { id: record.id, resourceId: record.id, label: record.label,kind:record.mediaKind, description: mediaDisplayDescription('',portable(source)), image: source ? previewBody(source) : null };
  }) };
}
