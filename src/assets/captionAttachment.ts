import { isVisible } from '../core/reduce';
import { entityIdFor, type ProjectStore } from '../core/store';
import type { WorkspaceFS } from '../platform/fs';
import { writeVerifiedBytes } from './verifiedWrite';

export interface AttachmentSource {
  readonly name: string;
  readonly mime: string;
  readonly readBytes: () => Promise<Uint8Array>;
}

interface StagedAttachment {
  readonly id: string;
  readonly path: string;
  readonly originalName: string;
  readonly mime: string;
  readonly kind: 'image' | 'video';
  readonly size: number;
}

function safeExtension(name: string): string {
  const match = /\.([a-z0-9]{1,16})$/iu.exec(name);
  return match?.[1]?.toLowerCase() ?? 'bin';
}

function currentAttachmentIds(store: ProjectStore, captionId: string): string[] {
  const caption = store.state.byKind.caption?.[captionId];
  if (caption === undefined || !isVisible(caption)) {
    throw new Error(`caption attachment: caption not found: ${captionId}`);
  }
  const raw = caption.fields.attachments;
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : [];
}

/**
 * Verify every new media blob before publishing any asset or caption metadata.
 * The callback is synchronous so its caption update joins the same flush barrier.
 */
export async function addCaptionAttachments(
  fs: WorkspaceFS,
  dir: string,
  store: ProjectStore,
  captionId: string,
  sources: readonly AttachmentSource[],
  publishAttachments: (allAttachmentIds: readonly string[]) => void,
): Promise<readonly string[]> {
  const sourceSnapshots = sources.map((source) => ({
    name: source.name,
    mime: source.mime,
    readBytes: source.readBytes,
  }));
  currentAttachmentIds(store, captionId);
  if (sourceSnapshots.length === 0) return [];

  const staged: StagedAttachment[] = [];
  for (const source of sourceSnapshots) {
    const bytes = new Uint8Array(await source.readBytes());
    const id = entityIdFor('asset');
    const path = `media/${id}.${safeExtension(source.name)}`;
    await writeVerifiedBytes(fs, `${dir}/${path}`, bytes);
    staged.push({
      id,
      path,
      originalName: source.name,
      mime: source.mime,
      kind: source.mime.startsWith('video/') ? 'video' : 'image',
      size: bytes.length,
    });
  }

  const existingIds = currentAttachmentIds(store, captionId);
  const newIds = staged.map((attachment) => attachment.id);
  const allIds = Object.freeze([...existingIds, ...newIds]);
  for (const attachment of staged) {
    store.dispatch({
      t: 'create',
      e: 'asset',
      id: attachment.id,
      v: {
        kind: attachment.kind,
        path: attachment.path,
        originalName: attachment.originalName,
        mime: attachment.mime,
        size: attachment.size,
      },
    });
  }
  publishAttachments(allIds);
  await store.flush();
  return Object.freeze(newIds);
}
