import { describe, expect, it, vi } from 'vitest';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { inspectNativeImageSource } from '../../src/nativeGs/imageMediaAdmission';
import { fixtureMedia, captionAttachments, captionAttachmentCounts, projectMediaHistory, mediaSeed, normalizeAlt, type SyntheticAttachment } from '../../src/harness/projectScene/mediaHistory';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { planCaptionList } from '../../src/ui/projectScene/captionListState';
import { planNavigation } from '../../src/ui/projectScene/navigationState';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';
import { createMediaViewer, createMediaThumbnails, type MediaPreviewGroup } from '../../src/ui/projectScene/mediaPreview';
const nodes = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(nodes)];
const named = (r: RecordedNode, label: string) => nodes(r).find(n => n.attributes.get('aria-label') === label)!;
const button = (r: RecordedNode, text: string) => nodes(r).find(n => n.tag === 'button' && n.textContent === text)!;
const choose = (s: SyntheticSession) => s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId: f.shared }));
const count = (s: SyntheticSession, id = f.shared) => {
  const source = s.captionContext().source; if (source.kind !== 'ready') throw Error('list unavailable');
  return source.captions.find(c => c.id === id)!.mediaCount;
};
describe('same-host known PNG media connection; not decoder adoption, raster, IME or persistence', () => {
  it('mounts only one selected native player, preserving pause/source/URL and stale-event cleanup',()=>{
    const document=new RecordedDocument(),dom=document.asDocument(),createElement=dom.createElement.bind(dom),players:RecordedNode[]=[],pause=vi.fn(),load=vi.fn();
    vi.spyOn(dom,'createElement').mockImplementation(((tag:string)=>{const node=createElement(tag);if(tag==='video'||tag==='audio'){Object.assign(node,{pause,load,removeAttribute:(name:string)=>record(node).attributes.delete(name)});players.push(record(node));}return node;}) as Document['createElement']);
    const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:owned-test'),revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
    let group:MediaPreviewGroup={scope:'approved',label:'記録',items:[{id:'a',resourceId:'one',kind:'video',label:'動画',description:'説明',image:{blob:new Blob(['verified video'],{type:'video/mp4'})}},{id:'b',resourceId:'two',kind:'audio',label:'音声',description:'',image:{blob:new Blob(['verified audio'],{type:'audio/mpeg'})}}]};
    const viewer=createMediaViewer(dom),thumbnails=createMediaThumbnails(dom,()=>group,viewer),root=record(viewer.root);expect(players).toHaveLength(0);thumbnails.render();expect(players).toHaveLength(0);
    viewer.open(()=>group,'a',document.createElement('button') as unknown as HTMLElement);expect(players).toHaveLength(1);expect((players[0] as unknown as HTMLVideoElement).autoplay).toBe(false);expect((players[0] as unknown as HTMLVideoElement).controls).toBe(true);
    named(root,'次のメディア').fire('click');expect(players).toHaveLength(2);expect(pause).toHaveBeenCalledOnce();expect(revoke).toHaveBeenCalledOnce();
    const previousText=nodes(root).map(n=>n.textContent).join();players[0]!.fire('error');expect(nodes(root).map(n=>n.textContent).join()).toBe(previousText);
    group={...group,scope:'other'};viewer.render();expect(root.open).toBe(false);expect(pause).toHaveBeenCalledTimes(2);expect(revoke).toHaveBeenCalledTimes(2);viewer.dispose();thumbnails.dispose();create.mockRestore();revoke.mockRestore();
  });
  it('counts attachments rather than shared bytes or Scene memberships, including the Project inclusion list', () => {
    const s = new SyntheticSession(); choose(s);
    expect(count(s)).toEqual({ kind: 'value', value: 0 });
    for (let i = 0; i < 2; i++) expect(s.media.add(s.mediaContext(), fixtureMedia[0]!.record.id)).toBe(true);
    expect(count(s)).toEqual({ kind: 'value', value: 2 });
    const source = s.includeContext().source;
    expect(source.kind === 'ready' && source.items.find(i => i.caption.id === f.shared)!.caption.mediaCount).toEqual({ kind: 'value', value: 2 });
    expect(s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId: f.second }))).toBe(true);
    expect(s.media.add(s.mediaContext(), fixtureMedia[0]!.record.id)).toBe(true);
    expect(count(s, f.second)).toEqual({ kind: 'value', value: 1 }); expect(count(s)).toEqual({ kind: 'value', value: 2 });
    expect(s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }))).toBe(true);
    expect(count(s)).toEqual({ kind: 'value', value: 2 });
  });
  it.each(['owner', 'media', 'order', 'lifecycle', 'deleteEdit', 'unavailable'] as const)('keeps %s ambiguity visible instead of reporting a partial total', kind => {
    const s = new SyntheticSession(); choose(s); s.media.add(s.mediaContext(), fixtureMedia[0]!.record.id);
    const row = captionAttachments(s.snapshot.mediaData, f.shared).ready[0]!;
    const unresolved = { kind: 'unresolved' as const, reason: 'conflict' as const };
    const overrides: Partial<SyntheticAttachment> = kind === 'owner' ? { captionId: unresolved, captionCandidates: [f.shared, f.second, f.shared] } :
      kind === 'media' ? { mediaResourceId: unresolved } : kind === 'order' ? { orderKey: unresolved } :
      kind === 'lifecycle' ? { lifecycle: unresolved } : kind === 'deleteEdit' ? { deleteEdit: true,
        lifecycle: { kind: 'value', value: { state: 'deleted', eventId: 'evt_test', reason: 'userDelete' } } } : { available: false };
    const data = { ...s.snapshot.mediaData!, records: { [row.id]: row, uncertain: { ...row, id: 'uncertain', ...overrides } } };
    const counts = captionAttachmentCounts(data); expect(counts.get(f.shared)?.kind).toBe('unresolved');
    if (kind === 'owner') expect(counts.get(f.second)?.kind).toBe('unresolved');
    const project = { ...s.snapshot, mediaData: data };
    const review = new SyntheticSession({ read: () => project, write: () => { throw Error('read-only check'); } });
    const ui = createDevelopmentWorkspace(new RecordedDocument().asDocument(), review), r = record(ui.root);
    expect(nodes(named(r, 'キャプション')).some(n => n.textContent.includes('メディアを確認'))).toBe(true); ui.dispose();
  });
  it('excludes resolved deletion, preserves counts for alt-text conflicts and does not invent missing saved media', () => {
    const s = new SyntheticSession(); choose(s); s.media.add(s.mediaContext(), fixtureMedia[0]!.record.id);
    const row = captionAttachments(s.snapshot.mediaData, f.shared).ready[0]!;
    const data = { ...s.snapshot.mediaData!, records: {
      [row.id]: { ...row, captionCandidates: [f.shared, f.shared], altText: { kind: 'unresolved' as const, reason: 'conflict' as const } },
      deleted: { ...row, id: 'deleted', lifecycle: { kind: 'value' as const, value: { state: 'deleted' as const, eventId: 'evt_test', reason: 'userDelete' as const } } } } };
    expect(captionAttachmentCounts(data).get(f.shared)).toEqual({ kind: 'value', value: 1 });
    const absent = new SyntheticSession({ capabilities: { pins: false, membership: false, color: false, media: true }, read: () => new SyntheticSession().snapshot,
      write: () => { throw Error('read-only check'); } });
    expect(count(absent).kind).toBe('unresolved');
    const included = absent.includeContext().source;
    expect(included.kind === 'ready' && included.items.every(i => i.caption.mediaCount.kind === 'unresolved')).toBe(true);
  });
  it('verifies both exact fixture PNG byte/digest/CRC/pixel layouts with existing inspection', async () => {
    const crc = (bytes: Uint8Array) => { let c = 0xffffffff; for (const v of bytes) { c ^= v; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
    for (const m of fixtureMedia) {
      const bytes = Buffer.from(m.base64, 'base64'), blob = new Blob([bytes]);
      const admitted = await inspectNativeImageSource({ size: blob.size, mediaType: 'image/png', stream: () => blob.stream() });
      expect(admitted).toMatchObject({ width: 64, height: 48, mediaType: 'image/png', byteLength: bytes.length });
      expect(m.record.blob.digest).toBe(createHash('sha256').update(bytes).digest('hex'));
      const compressed: Uint8Array[] = []; let at = 8;
      while (at < bytes.length) { const length = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8);
        expect(crc(bytes.subarray(at + 4, at + 8 + length))).toBe(bytes.readUInt32BE(at + 8 + length));
        if (type === 'IDAT') compressed.push(bytes.subarray(at + 8, at + 8 + length)); at += length + 12;
      }
      expect(at).toBe(bytes.length); const pixels = inflateSync(Buffer.concat(compressed)); expect(pixels.length).toBe(48 * 193);
      expect([...new Set(pixels)]).toEqual(expect.arrayContaining([238, 234, 226]));
    }
  });
  it('mounts add/edit/IME/reorder/confirmed removal and confirmed floating images without changing selection on enlargement', () => {
    const document = new RecordedDocument(), session = new SyntheticSession(); choose(session);
    const w = createDevelopmentWorkspace(document.asDocument(), session), r = record(w.root), panel = named(r, 'メディア');
    const picker = named(panel, 'メディアを選択'); expect(button(panel, '選択したメディアを添付').disabled).toBe(true);
    button(picker, fixtureMedia[0]!.record.label).fire('click'); expect(captionAttachments(session.snapshot.mediaData, f.shared).ready).toHaveLength(0);
    button(panel, '選択したメディアを添付').fire('click');
    button(picker, fixtureMedia[1]!.record.label).fire('click'); button(panel, '選択したメディアを添付').fire('click');
    expect(captionAttachments(session.snapshot.mediaData, f.shared).ready).toHaveLength(2);
    expect(nodes(named(r, 'キャプション')).some(n => n.textContent === 'メディア 2')).toBe(true);
    const windows = named(r, 'キャプションのウィンドウ'), gallery = named(windows, '添付メディア'), firstImage = nodes(gallery).find(n => n.tag === 'img')!;
    button(gallery, '画像を表示').fire('click'); expect(session.memory.selectedCaptionId).toBe(f.shared);
    const viewer = named(r, 'メディアビューア'); expect(viewer.open).toBe(true); named(viewer, '閉じる').fire('click'); expect(viewer.open).toBe(false);
    button(panel, '説明を編集').fire('click'); const input = named(panel, 'メディアの説明');
    input.fire('compositionstart'); input.value = '<script>説明</script>'; input.fire('input'); expect(session.pending).toBe('composition');
    expect(named(r, 'シーン').children.every(n => n.disabled)).toBe(true); button(r, 'モデル').fire('click'); button(r, 'キャプション').fire('click'); expect(named(panel, 'メディアの説明')).toBe(input);
    expect(nodes(gallery).some(n => n.textContent.includes('<script>'))).toBe(false);
    input.fire('compositionend'); button(panel, '説明を適用').fire('click'); expect(session.pending).toBeNull();
    expect(nodes(gallery).find(n => n.tag === 'img')).toBe(firstImage); expect(nodes(gallery).some(n => n.textContent.includes('<script>説明</script>'))).toBe(true);
    firstImage.fire('error'); expect(button(gallery, '画像を再試行').hidden).toBe(false); w.render(); expect(button(gallery, '画像を再試行').hidden).toBe(false);
    button(gallery, '画像を再試行').fire('click'); const retriedImage = nodes(gallery).find(n => n.tag === 'img')!;
    expect(retriedImage).not.toBe(firstImage); firstImage.fire('error'); retriedImage.fire('load'); expect(button(gallery, '画像を再試行').hidden).toBe(true);
    const old = captionAttachments(session.snapshot.mediaData, f.shared).ready.map(r => r.id);
    button(panel, '後へ').fire('click'); expect(captionAttachments(session.snapshot.mediaData, f.shared).ready.map(r => r.id)).toEqual([old[1], old[0]]);
    button(panel, '添付を削除').fire('click'); expect(captionAttachments(session.snapshot.mediaData, f.shared).ready).toHaveLength(2);
    const confirmation = nodes(panel).filter(n => n.tag === 'section').find(n => n.children.some(c => c.textContent.includes('画像本体と別キャプション')))!;
    button(confirmation, '添付を削除').fire('click'); expect(captionAttachments(session.snapshot.mediaData, f.shared).ready).toHaveLength(1);
    expect(nodes(named(r, 'キャプション')).some(n => n.textContent === 'メディア 1')).toBe(true);
    expect(Object.keys(session.snapshot.mediaData!.records)).toHaveLength(2); expect(nodes(gallery).filter(n => n.tag === 'img')).toHaveLength(1); w.dispose();
  });
  it('rejects immutable resource mutation and invalid alt text, without interpreting any history URL', () => {
    const cells = Object.fromEntries(Object.entries(mediaSeed()).map(([k, text]) => [k, { kind: 'value' as const, value: text }]));
    expect(projectMediaHistory({ token: 't', cells }, [f.shared]).records).toEqual({});
    const key = Object.keys(cells)[0]!; expect(() => projectMediaHistory({ token: 't', cells: { ...cells, [key]: { kind: 'value', value: cells[key]!.value.replace('image/png', 'text/html') } } }, [f.shared])).toThrow();
    expect(() => normalizeAlt('x\ny')).toThrow(); expect(() => normalizeAlt('x'.repeat(4097))).toThrow(); expect(normalizeAlt('e\u0301')).toBe('é');
  });
  it('shares one viewer across the panel and retained windows, follows attachment identity and keeps draft/Scene selection separate', () => {
    const document = new RecordedDocument(), s = new SyntheticSession(); choose(s);
    s.media.add(s.mediaContext(), fixtureMedia[0]!.record.id); s.media.add(s.mediaContext(), fixtureMedia[0]!.record.id);
    const w = createDevelopmentWorkspace(document.asDocument(), s), root = record(w.root), panel = named(root, 'メディア');
    const viewer = named(root, 'メディアビューア'), gallery = named(panel, '添付メディア'), open = button(gallery, '画像を表示');
    open.fire('click'); expect(nodes(root).filter(n => n.tag === 'dialog')).toHaveLength(1);
    expect(nodes(viewer).some(n => n.textContent === '1 / 2')).toBe(true); expect(named(viewer, '前のメディア').disabled).toBe(true);
    const event = (key: string) => ({ key, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    viewer.fire('keydown', event('ArrowRight')); expect(nodes(viewer).some(n => n.textContent === '2 / 2')).toBe(true);
    expect(named(viewer, '次のメディア').disabled).toBe(true);
    const id = captionAttachments(s.snapshot.mediaData, f.shared).ready[0]!.id;
    expect(s.media.begin(s.mediaContext(), id)).toBe(true); s.media.input('未適用の説明', false); w.render();
    const draft = s.media.draft; viewer.fire('keydown', event('ArrowLeft')); expect(s.media.draft).toBe(draft);
    expect(s.memory.selectedCaptionId).toBe(f.shared); viewer.fire('keydown', event('Escape'));
    expect(viewer.open).toBe(false); expect(document.activeElement).toBe(open);
    s.media.cancel();
    const windows = named(root, 'キャプションのウィンドウ'); button(named(windows, '添付メディア'), '画像を表示').fire('click');
    expect(s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId: f.second }))).toBe(true); w.render();
    expect(viewer.open).toBe(true); expect(nodes(viewer).some(n => n.textContent === '1 / 2')).toBe(true);
    expect(s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }))).toBe(true); w.render();
    expect(viewer.open).toBe(false); w.dispose();
  });
  it('keeps image retry on the exact target, ignores old events, releases URLs and never substitutes a retargeted attachment', () => {
    const document = new RecordedDocument(), viewer = createMediaViewer(document.asDocument()), root = record(viewer.root);
    const create = vi.spyOn(URL, 'createObjectURL'), revoke = vi.spyOn(URL, 'revokeObjectURL');
    let group: MediaPreviewGroup | null = { scope: 'scene/caption', label: '<script>Caption</script>', items: [
      { id: 'attachment', resourceId: 'resource', label: '画像', description: '説明', image: { blob: new Blob(['verified test port'], { type: 'image/png' }) } }] };
    viewer.open(() => group, 'attachment', document.createElement('button') as unknown as HTMLElement);
    const original = nodes(root).find(n => n.tag === 'img')!; original.fire('error'); expect(button(root, '画像を再試行').hidden).toBe(false);
    viewer.render(); expect(button(root, '画像を再試行').hidden).toBe(false); button(root, '画像を再試行').fire('click');
    const retried = nodes(root).find(n => n.tag === 'img')!; expect(retried).not.toBe(original);
    retried.fire('error'); original.fire('load'); expect(button(root, '画像を再試行').hidden).toBe(false);
    button(root, '画像を再試行').fire('click'); nodes(root).find(n => n.tag === 'img')!.fire('load'); expect(button(root, '画像を再試行').hidden).toBe(true);
    group = { ...group!, items: [{ ...group!.items[0]!, resourceId: 'another-resource' }] }; viewer.render();
    expect(nodes(root).filter(n => n.tag === 'img')).toHaveLength(0); expect(nodes(root).some(n => n.textContent.includes('選び直してください'))).toBe(true);
    expect(named(root, '次のメディア').disabled).toBe(true); expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);
    group = null; viewer.render(); expect(root.open).toBe(false); viewer.dispose(); create.mockRestore(); revoke.mockRestore();
  });
  it('bounds lazy thumbnails and preserves explicit choice without rendering old-scope sources or interpreting labels', () => {
    const document = new RecordedDocument(), viewer = createMediaViewer(document.asDocument());
    let group: MediaPreviewGroup = { scope: 'one', label: '登録済みメディア', items: Array.from({ length: 13 }, (_, i) => ({
      id: String(i), resourceId: String(i), label: `${i}<script>`, description: '', image: { base64: fixtureMedia[0]!.base64 }
    })) }, selected: string | null = null;
    const chosen = vi.fn((id: string) => { selected = id; });
    const grid = createMediaThumbnails(document.asDocument(), () => group, viewer, { selected: () => selected, choose: chosen }), root = record(grid.root);
    grid.render(); expect(nodes(root).filter(n => n.tag === 'img')).toHaveLength(12); expect(chosen).not.toHaveBeenCalled();
    button(root, '0<script>').fire('click'); expect(chosen).toHaveBeenCalledWith('0'); expect(nodes(root).some(n => n.tag === 'script')).toBe(false);
    const old = nodes(root).find(n => n.tag === 'img')!; button(root, '次の一覧').fire('click'); expect(nodes(root).filter(n => n.tag === 'img')).toHaveLength(1);
    group = { ...group, scope: 'two', items: [group.items[0]!] }; grid.render();
    const fresh = nodes(root).find(n => n.tag === 'img')!; expect(fresh).not.toBe(old); old.fire('error'); expect(button(root, '画像を再試行').hidden).toBe(true);
    expect((fresh as unknown as HTMLImageElement).loading).toBe('lazy'); grid.dispose(); viewer.dispose();
  });
  it('loads verified async PNGs only for mounted thumbnails and discards late results after paging or disposal', async () => {
    const document = new RecordedDocument(), viewer = createMediaViewer(document.asDocument()), create = vi.spyOn(URL, 'createObjectURL'), revoke = vi.spyOn(URL, 'revokeObjectURL');
    const releases: ((blob: Blob) => void)[] = [], loads = Array.from({ length: 13 }, () => vi.fn(() => new Promise<Blob>(resolve => { releases.push(resolve); })));
    const group: MediaPreviewGroup = { scope: 'async', label: '保存済み画像', items: loads.map((load, i) => ({ id: String(i), resourceId: String(i), label: String(i), description: '', image: { load } })) };
    const thumbnails = createMediaThumbnails(document.asDocument(), () => group, viewer), root = record(thumbnails.root);
    thumbnails.render(); await vi.waitFor(() => expect(releases).toHaveLength(12)); expect(loads[12]).not.toHaveBeenCalled();
    button(root, '次の一覧').fire('click'); await vi.waitFor(() => expect(releases).toHaveLength(13));
    releases.slice(0, 12).forEach(resolve => resolve(new Blob(['verified bytes'], { type: 'image/png' }))); await Promise.resolve(); await Promise.resolve();
    expect(nodes(root).filter(n => n.tag === 'img')).toHaveLength(0); expect(create).not.toHaveBeenCalled();
    releases[12]!(new Blob(['verified last'], { type: 'image/png' })); await vi.waitFor(() => expect(nodes(root).filter(n => n.tag === 'img')).toHaveLength(1));
    thumbnails.dispose(); viewer.dispose(); expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length); create.mockRestore(); revoke.mockRestore();
  });
  it('retries an async body read on the exact item and ignores resolution after resource retargeting', async () => {
    const document = new RecordedDocument(), viewer = createMediaViewer(document.asDocument()), root = record(viewer.root);
    let resolve!: (blob: Blob) => void; const load = vi.fn().mockRejectedValueOnce(Error('read failed')).mockImplementationOnce(() => new Promise<Blob>(r => { resolve = r; }));
    let group: MediaPreviewGroup = { scope: 'exact', label: '記録', items: [{ id: 'att', resourceId: 'med', label: '画像', description: '', image: { load } }] };
    viewer.open(() => group, 'att', document.createElement('button') as unknown as HTMLElement);
    await vi.waitFor(() => expect(button(root, '画像を再試行').hidden).toBe(false)); expect(load).toHaveBeenCalledTimes(1);
    button(root, '画像を再試行').fire('click'); await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(nodes(root).find(n=>n.className==='lv-media-image')!.attributes.get('aria-busy')).toBe('true');
    expect(nodes(root).find(n=>n.className==='lv-operation-status')!.dataset.busy).toBe('true');
    group = { ...group, items: [{ ...group.items[0]!, resourceId: 'other' }] }; viewer.render(); resolve(new Blob(['stale verified bytes'], { type: 'image/png' }));
    await Promise.resolve(); await Promise.resolve(); expect(nodes(root).filter(n => n.tag === 'img')).toHaveLength(0);
    expect(nodes(root).some(n=>n.className==='lv-media-image')).toBe(false);
    expect(nodes(root).some(n=>n.className==='lv-operation-status'&&n.dataset.busy==='true')).toBe(false);
    expect(nodes(root).some(n => n.textContent.includes('選び直してください'))).toBe(true); viewer.dispose();
  });
});
