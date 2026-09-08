import { scalarLength, singleLineControls } from '../../domain/values';
import { value, type Field, type Lifecycle } from '../../scene/types';
import { freezeSynthetic } from './fixture';
import { canonicalFixture, fixtureRecordDigest, fixtureSha256 } from './modelClosure';
import type { HistoryCell, HistoryChange, HistorySnapshot } from './historyPort';

// Generated 64x48 RGB PNGs: triangle/square, no source file, private bytes or imported URL.
const images = [
  ['三角形', 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAw0lEQVR4nO3YsQ2FQAyDYZZjL0ZhNspXvBkokCgoIOc4Z53Okvv8X5vl/zuG3iIvMEBdYIC6wAB1gQHqAgOKD+zbOjBg39ZrQwLu+lJDFeBRX2cwIFxfZOADXuorDGTAZz3dwAQE67kGA6B6ooEDAOpZBgIArqcYsoBkfd4wN4BSnzTgAGJ9xgAC6PWwAQEU1WOG+QCl9YChDdChvtXQAOhW32SIAjrXxw1zACT1QcM3QFgfMfg3qp4B6hmgngHqGaDeCXktm9EHNZ9BAAAAAElFTkSuQmCC'],
  ['四角形', 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAX0lEQVR4nO3PMRGAMAAEwbhECSpwSUmBhmig4QizM1d+8Tvu61y6kT8AqB8A1A8A6gcA9QOA+gHAk/W2H+8EAAAAAAAAAAAAAAAAAAAA8C/ABwOoA6gDqAOoA6hbHjABdyJdVrsjQugAAAAASUVORK5CYII='],
] as const;
export const fixtureMedia = freezeSynthetic(images.map(([label, base64], index) => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const record = { id: `med_${(index + 1).toString(16).padStart(32, '0')}`, mediaKind: 'image' as const, label,
    blob: { algorithm: 'sha256' as const, digest: fixtureSha256(bytes), byteLength: bytes.length, mediaType: 'image/png' as const } };
  return { record: { ...record, payloadDigest: fixtureRecordDigest('media-resource', record) }, base64 };
}));
export const mediaSeed = () => Object.fromEntries(fixtureMedia.map(m => [`media/${m.record.id}`, canonicalFixture(m.record)]));
export const attachmentFields = ['captionId', 'mediaResourceId', 'altText', 'orderKey', 'lifecycle'] as const;
export const attachmentKey = (id: string, field: typeof attachmentFields[number]) => `attachment/${id}/${field}`;
export interface SyntheticAttachment {
  readonly id: string; readonly captionId: Field<string>; readonly mediaResourceId: Field<string>;
  readonly altText: Field<string>; readonly orderKey: Field<string>; readonly lifecycle: Field<Lifecycle>;
  readonly captionCandidates: readonly string[]; readonly deleteEdit: boolean;
}
export interface MediaData { readonly cells: Readonly<Record<string, HistoryCell>>; readonly records: Readonly<Record<string, SyntheticAttachment>>;
  readonly causalChanges: readonly HistoryChange[] }
export function normalizeAlt(text: string): string {
  scalarLength(text, 65_536, ['altText']); const normalized = text.normalize('NFC');
  scalarLength(normalized, 4096, ['altText']); if (singleLineControls.test(normalized)) throw new Error('説明は1行で入力してください。'); return normalized;
}
function fail(s = '添付の内容・参照関係を確認してください。'): never { throw new Error(s); }
const candidates = (cell: HistoryCell) => cell.kind === 'value' ? [cell.value] : cell.candidates.map(c => c.value);
const parseLife = (text: string): Lifecycle => {
  const v = JSON.parse(text); if (!v || canonicalFixture(v) !== text || Object.keys(v).sort().join(',') !== 'eventId,reason,state' ||
    !/^evt_[0-9a-f]{32}$/.test(v.eventId) || !(v.state === 'active' ? ['initial', 'restore', 'conflictResolution'].includes(v.reason) :
      v.state === 'deleted' && ['userDelete', 'conflictResolution'].includes(v.reason))) fail(); return v;
};
/** Causal facts supplied by the fixed adapter; no timestamps or current-value heuristic. */
function deletionReview(id: string, changes: readonly HistoryChange[]) {
  const byId = new Map(changes.map(c => [c.id, c])), cache = new Map<string, Set<string>>();
  const ancestors = (id: string, visiting = new Set<string>()): Set<string> => {
    if (cache.has(id)) return cache.get(id)!; if (visiting.has(id) || !byId.has(id)) fail('添付の変更履歴を確認してください。');
    const found = new Set<string>(), next = new Set([...visiting, id]);
    for (const dep of byId.get(id)!.deps) { found.add(dep); ancestors(dep, next).forEach(v => found.add(v)); } cache.set(id, found); return found;
  };
  const lifeKey = attachmentKey(id, 'lifecycle'), prefix = `attachment/${id}/`;
  const life = changes.filter(c => Object.hasOwn(c.writes, lifeKey)).map(c => ({ c, value: c.writes[lifeKey] === null ? fail() : parseLife(c.writes[lifeKey]!) }));
  if (!life.length) fail('添付の変更履歴を確認してください。');
  const edits = changes.filter(c => Object.keys(c.writes).some(k => k.startsWith(prefix) && k !== lifeKey));
  for (const event of life) {
    if (life.some(prior => prior.c.id !== event.c.id && prior.value.eventId === event.value.eventId)) fail('添付の操作識別情報が再使用されています。');
    if (event.value.state === 'active' && event.value.reason === 'initial' && life.some(prior => prior.value.state === 'deleted' && ancestors(event.c.id).has(prior.c.id)))
      fail('削除した添付は明示的に復元してください。');
  }
  for (const deleted of life.filter(l => l.value.state === 'deleted')) for (const edit of edits) {
    if (ancestors(edit.id).has(deleted.c.id) && !life.some(restored => restored.value.state === 'active' && ['restore', 'conflictResolution'].includes(restored.value.reason ?? '') &&
      (restored.c.id === edit.id || ancestors(edit.id).has(restored.c.id)) && ancestors(restored.c.id).has(deleted.c.id)))
      fail('削除後の添付を復元せずに編集した更新は適用できません。');
  }
  const latest = life.filter(l => !life.some(other => ancestors(other.c.id).has(l.c.id)));
  return latest.some(l => l.value.state === 'deleted' && edits.some(e => e.id !== l.c.id &&
    !ancestors(l.c.id).has(e.id) && !ancestors(e.id).has(l.c.id)));
}
export function projectMediaHistory(snapshot: HistorySnapshot, captionIds: readonly string[], previous?: HistorySnapshot): MediaData {
  const cells = Object.fromEntries(Object.entries(snapshot.cells).filter(([k]) => k.startsWith('media/') || k.startsWith('attachment/'))), records: Record<string, SyntheticAttachment> = {};
  const known = mediaSeed(), ids = new Set<string>();
  for (const [key, text] of Object.entries(known)) if (cells[key]?.kind !== 'value' || (cells[key] as { value: string }).value !== text) fail('既知の画像本体・識別情報が一致しません。');
  for (const key of Object.keys(cells)) {
    if (key.startsWith('media/')) { if (!Object.hasOwn(known, key)) fail(); }
    else if (/^attachment\/att_[0-9a-f]{32}\/(captionId|mediaResourceId|altText|orderKey|lifecycle)$/.test(key)) ids.add(key.split('/')[1]!); else fail();
  }
  for (const key of Object.keys(previous?.cells ?? {})) if ((key.startsWith('attachment/') || key.startsWith('media/')) && !cells[key]) fail();
  for (const id of ids) {
    const fields = Object.fromEntries(attachmentFields.map(f => {
      const cell = cells[attachmentKey(id, f)]; if (!cell || !candidates(cell).length) fail();
      const checked = candidates(cell).map(text => {
        if (typeof text !== 'string' || text.length > 65_536) fail();
        if (f === 'captionId' && !captionIds.includes(text)) fail();
        if (f === 'mediaResourceId' && !Object.hasOwn(known, `media/${text}`)) fail();
        if (f === 'altText' && normalizeAlt(text) !== text) fail();
        if (f === 'orderKey' && !/^[0-9A-Za-z]{1,64}$/.test(text)) fail();
        return f === 'lifecycle' ? parseLife(text) : text;
      });
      return [f, cell.kind === 'value' ? value(checked[0]!) : { kind: 'unresolved', reason: 'conflict' }];
    })) as unknown as Omit<SyntheticAttachment, 'id' | 'captionCandidates' | 'deleteEdit'>;
    const deleteEdit = deletionReview(id, snapshot.causalChanges ?? []);
    records[id] = { ...fields, id, captionCandidates: candidates(cells[attachmentKey(id, 'captionId')]!), deleteEdit };
  }
  for (const captionId of captionIds) if (Object.values(records).filter(r => r.captionCandidates.includes(captionId)).length > 4096) fail();
  return freezeSynthetic({ cells, records, causalChanges: snapshot.causalChanges ?? [] });
}
export function captionAttachments(data: MediaData | undefined, captionId: string) {
  const relevant = Object.values(data?.records ?? {}).filter(r => r.captionCandidates.includes(captionId) &&
    (r.deleteEdit || r.lifecycle.kind !== 'value' || r.lifecycle.value.state !== 'deleted'));
  const ready = relevant.filter(r => !r.deleteEdit && r.lifecycle.kind === 'value' && r.lifecycle.value.state === 'active' &&
    r.captionId.kind === 'value' && r.mediaResourceId.kind === 'value' && r.orderKey.kind === 'value');
  ready.sort((a, b) => { const x = (a.orderKey as { value: string }).value, y = (b.orderKey as { value: string }).value;
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return { ready, review: relevant.filter(r => !ready.includes(r)) };
}
export function attachmentImage(row: SyntheticAttachment) {
  return row.mediaResourceId.kind === 'value' ? fixtureMedia.find(m => m.record.id === (row.mediaResourceId as { value: string }).value) : undefined;
}
export function copyableAttachments(data: MediaData | undefined, captionId: string) {
  const rows = captionAttachments(data, captionId);
  if (rows.review.length || rows.ready.some(r => r.altText.kind !== 'value')) fail('コピー元の添付の競合を先に確認してください。');
  return rows.ready;
}
