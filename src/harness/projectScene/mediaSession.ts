import type { SyntheticProject } from './fixture';
import { attachmentKey, captionAttachments, fixtureMedia, normalizeAlt, type SyntheticAttachment } from './mediaHistory';
import { canonicalFixture } from './modelClosure';
import { orderBetween } from './viewHistory';

export interface MediaContext { readonly project: SyntheticProject; readonly captionId: string | null; readonly sceneId: string; readonly block: string | null }
export interface MediaDraft { readonly token: string; readonly sceneId: string; readonly captionId: string; readonly attachmentId: string; readonly raw: string; readonly composing: boolean }
interface MediaCommand { readonly token: string; readonly sceneId: string; readonly captionId: string;
  readonly changes: Readonly<Record<string, string>>; readonly draft?: MediaDraft }
const fresh = (p: string) => `${p}_${crypto.randomUUID().replaceAll('-', '')}`;
function fail(s: string): never { throw new Error(s); }
/** Confirmed working state only; no persistence receipt, source-file read or renderer acknowledgement. */
export class SyntheticMediaSession {
  draft: MediaDraft | null = null; failed: MediaCommand | null = null; message = '';
  private prepared: MediaCommand | null = null;
  constructor(readonly context: () => MediaContext, private write: (token: string, changes: Readonly<Record<string, string>>) => void) {}
  get pending() { return this.draft?.composing ? 'composition' as const : this.draft ? 'text' as const : null; }
  private check(expected: MediaContext) {
    const now = this.context();
    if (now.block) fail(now.block);
    if (!now.captionId || expected.captionId !== now.captionId || expected.sceneId !== now.sceneId || expected.project.state.token !== now.project.state.token)
      fail('対象が更新されています。入力と操作を保持しています。');
    return now.captionId;
  }
  private row(ctx: MediaContext, id: string): SyntheticAttachment {
    this.check(ctx); const rows = captionAttachments(ctx.project.mediaData, ctx.captionId!);
    return rows.ready.find(r => r.id === id) ?? fail('添付の競合・削除状態を先に確認してください。');
  }
  private attempt(fn: () => void) { try { fn(); this.message = ''; return true; } catch (e) {
    this.message = e instanceof Error ? e.message : 'メディアを変更できません。入力を保持しています。'; return false;
  } }
  begin(ctx: MediaContext, id: string) { return this.attempt(() => {
    if (this.draft) fail('編集中の説明を適用するか取り消してください。'); const row = this.row(ctx, id);
    if (row.altText.kind !== 'value') fail('説明の競合を先に確認してください。');
    this.draft = { token: ctx.project.state.token, sceneId: ctx.sceneId, captionId: ctx.captionId!, attachmentId: id, raw: row.altText.value, composing: false };
  }); }
  input(raw: string, composing: boolean) { if (this.draft) { this.draft = { ...this.draft, raw, composing }; this.prepared = null; } }
  cancel() { if (this.draft?.composing) return false; if (this.failed?.draft === this.draft) this.failed = null;
    this.draft = null; this.prepared = null; this.message = ''; return true; }
  private execute(command: MediaCommand) {
    const now = this.context(); this.check({ ...now, captionId: command.captionId, sceneId: command.sceneId, project: { ...now.project, state: { ...now.project.state, token: command.token } } });
    if (this.draft?.composing || (this.draft && command.draft !== this.draft) || (command.draft && command.draft !== this.draft)) fail('入力を確定してください。');
    try {
      this.write(command.token, command.changes);
      const cells = this.context().project.mediaData?.cells;
      if (Object.entries(command.changes).some(([key, text]) => cells?.[key]?.kind !== 'value' || (cells[key] as { value: string }).value !== text)) fail('適用結果を確認できません。入力を保持しています。');
      if (command.draft === this.draft) this.draft = null; this.prepared = null; this.failed = null;
    } catch (e) { this.failed = command; throw e; }
  }
  apply() { return this.attempt(() => {
    const d = this.draft; if (!d || d.composing) fail('説明の入力を確定してください。');
    if (this.prepared?.draft !== d) this.prepared = { token: d.token, sceneId: d.sceneId, captionId: d.captionId, draft: d,
      changes: Object.freeze({ [attachmentKey(d.attachmentId, 'altText')]: normalizeAlt(d.raw) }) };
    this.execute(this.prepared);
  }); }
  retry() { return this.attempt(() => { if (!this.failed) fail('再試行する操作はありません。'); this.execute(this.failed); }); }
  add(ctx: MediaContext, mediaId: string) { return this.attempt(() => {
    const captionId = this.check(ctx); if (this.draft) fail('編集中の説明を適用するか取り消してください。');
    if (!fixtureMedia.some(m => m.record.id === mediaId)) fail('メディアを選択してください。');
    const rows = captionAttachments(ctx.project.mediaData, captionId); if (rows.review.length) fail('添付の未解決の状態を先に確認してください。');
    const id = fresh('att'), changes = Object.fromEntries(Object.entries({ captionId, mediaResourceId: mediaId, altText: '',
      orderKey: orderBetween(rows.ready.at(-1)?.orderKey.kind === 'value' ? (rows.ready.at(-1)!.orderKey as { value: string }).value : null, null),
      lifecycle: canonicalFixture({ state: 'active', eventId: fresh('evt'), reason: 'initial' }) }).map(([field, text]) => [attachmentKey(id, field as 'captionId'), text]));
    this.execute({ token: ctx.project.state.token, sceneId: ctx.sceneId, captionId, changes: Object.freeze(changes) });
  }); }
  remove(ctx: MediaContext, id: string) { return this.attempt(() => {
    this.row(ctx, id); if (this.draft) fail('編集中の説明を適用するか取り消してください。');
    this.execute({ token: ctx.project.state.token, sceneId: ctx.sceneId, captionId: ctx.captionId!, changes: Object.freeze({
      [attachmentKey(id, 'lifecycle')]: canonicalFixture({ state: 'deleted', eventId: fresh('evt'), reason: 'userDelete' }) }) });
  }); }
  reorder(ctx: MediaContext, id: string, direction: -1 | 1) { return this.attempt(() => {
    this.row(ctx, id); if (this.draft) fail('編集中の説明を適用するか取り消してください。');
    const rows = captionAttachments(ctx.project.mediaData, ctx.captionId!); if (rows.review.length) fail('添付の順序を先に確認してください。');
    const at = rows.ready.findIndex(r => r.id === id), to = at + direction; if (to < 0 || to >= rows.ready.length) fail('移動先がありません。');
    const rest = rows.ready.filter(r => r.id !== id), key = (index: number) => rest[index]?.orderKey.kind === 'value' ? (rest[index]!.orderKey as { value: string }).value : null;
    let next: string; try { next = orderBetween(key(to - 1), key(to)); } catch { return fail('この間には移動できません。順序を確認してください。'); }
    this.execute({ token: ctx.project.state.token, sceneId: ctx.sceneId, captionId: ctx.captionId!, changes: Object.freeze({ [attachmentKey(id, 'orderKey')]: next }) });
  }); }
}
