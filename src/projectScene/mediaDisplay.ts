import { scalarLength, singleLineControls } from '../domain/values';
import { value, type Field,type Lifecycle } from '../scene/types';
import type { HistoryCell,HistoryChange } from './displayCells';
export interface MediaImage {readonly record:{readonly id:string;readonly payloadDigest:string;readonly mediaKind:'image';readonly label:string;
  readonly blob:{readonly algorithm:'sha256';readonly digest:string;readonly byteLength:number;readonly mediaType:'image/png'|'image/jpeg'|'image/webp'|'image/gif'}};readonly base64:string}
export interface MediaFileSelection { readonly name: string; readonly size: number; readonly blob?: Blob; arrayBuffer(): Promise<ArrayBuffer> }
export interface MediaFileAddition { readonly sceneId: string; readonly captionId: string; readonly attachmentId: string;
  readonly orderKey: string; readonly eventId: string; readonly file: MediaFileSelection }
export const attachmentFields = ['captionId', 'mediaResourceId', 'altText', 'orderKey', 'lifecycle'] as const;
export const attachmentKey = (id: string, field: typeof attachmentFields[number]) => `attachment/${id}/${field}`;
export interface SyntheticAttachment {
  readonly id: string; readonly captionId: Field<string>; readonly mediaResourceId: Field<string>;
  readonly altText: Field<string>; readonly orderKey: Field<string>; readonly lifecycle: Field<Lifecycle>;
  readonly captionCandidates: readonly string[]; readonly deleteEdit: boolean;
  readonly available?: boolean;
}
export interface MediaData { readonly cells: Readonly<Record<string, HistoryCell>>; readonly records: Readonly<Record<string, SyntheticAttachment>>;
  readonly causalChanges?: readonly HistoryChange[];
  /** Explicit empty map forbids the old in-memory fixture fallback. */
  readonly images?: Readonly<Record<string, MediaImage>> }
export function normalizeAlt(text: string): string {
  scalarLength(text, 65_536, ['altText']); const normalized = text.normalize('NFC');
  scalarLength(normalized, 4096, ['altText']); if (singleLineControls.test(normalized)) throw new Error('説明は1行で入力してください。'); return normalized;
}
function readyAttachment(r: SyntheticAttachment) {
  return r.available !== false && !r.deleteEdit && r.lifecycle.kind === 'value' && r.lifecycle.value.state === 'active' &&
    r.captionId.kind === 'value' && r.mediaResourceId.kind === 'value' && r.orderKey.kind === 'value';
}
/** Same visibility/review boundary as the gallery, indexed once for the whole list. */
export function captionAttachmentCounts(data: MediaData | undefined): ReadonlyMap<string, Field<number>> {
  const counts = new Map<string, Field<number>>();
  for (const row of Object.values(data?.records ?? {})) {
    if (!row.deleteEdit && row.lifecycle.kind === 'value' && row.lifecycle.value.state === 'deleted') continue;
    const ready = readyAttachment(row);
    for (const captionId of new Set(row.captionCandidates)) {
      const previous = counts.get(captionId);
      if (previous?.kind === 'unresolved') continue;
      counts.set(captionId, ready ? value((previous?.value ?? 0) + 1) : { kind: 'unresolved', reason: 'invalid' });
    }
  }
  return counts;
}
export function captionAttachments(data: MediaData | undefined, captionId: string) {
  const relevant = Object.values(data?.records ?? {}).filter(r => r.captionCandidates.includes(captionId) &&
    (r.deleteEdit || r.lifecycle.kind !== 'value' || r.lifecycle.value.state !== 'deleted'));
  const ready = relevant.filter(readyAttachment);
  ready.sort((a, b) => { const x = (a.orderKey as { value: string }).value, y = (b.orderKey as { value: string }).value;
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return { ready, review: relevant.filter(r => !ready.includes(r)) };
}
export function attachmentImage(row: SyntheticAttachment, data?: MediaData) {
  if (row.mediaResourceId.kind !== 'value') return undefined;
  const id = row.mediaResourceId.value;
  return data?.images?.[id];
}
export function copyableAttachments(data: MediaData | undefined, captionId: string) {
  const rows = captionAttachments(data, captionId);
  if (rows.review.length || rows.ready.some(r => r.altText.kind !== 'value')) (()=>{throw Error('コピー元の添付の競合を先に確認してください。');})();
  return rows.ready;
}
