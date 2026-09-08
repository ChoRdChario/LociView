import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { inspectNativeImageSource } from '../../src/nativeGs/imageMediaAdmission';
import { fixtureMedia, captionAttachments, projectMediaHistory, mediaSeed, normalizeAlt } from '../../src/harness/projectScene/mediaHistory';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { planCaptionList } from '../../src/ui/projectScene/captionListState';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';
const nodes = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(nodes)];
const named = (r: RecordedNode, label: string) => nodes(r).find(n => n.attributes.get('aria-label') === label)!;
const button = (r: RecordedNode, text: string) => nodes(r).find(n => n.tag === 'button' && n.textContent === text)!;
const choose = (s: SyntheticSession) => s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId: f.shared }));
describe('same-host known PNG media connection; not decoder adoption, raster, IME or persistence', () => {
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
    const picker = named(panel, 'メディアを選択'); expect(button(panel, 'メディアを追加').disabled).toBe(true);
    picker.value = fixtureMedia[0]!.record.id; picker.fire('change'); button(panel, 'メディアを追加').fire('click');
    picker.value = fixtureMedia[1]!.record.id; picker.fire('change'); button(panel, 'メディアを追加').fire('click');
    expect(captionAttachments(session.snapshot.mediaData, f.shared).ready).toHaveLength(2);
    const windows = named(r, 'キャプションのウィンドウ'), gallery = named(windows, '添付メディア'), firstImage = nodes(gallery).find(n => n.tag === 'img')!;
    button(gallery, '拡大').fire('click'); expect(session.memory.selectedCaptionId).toBe(f.shared); expect(button(gallery, '縮小').attributes.get('aria-expanded')).toBe('true');
    button(panel, '説明を編集').fire('click'); const input = named(panel, 'メディアの説明');
    input.fire('compositionstart'); input.value = '<script>説明</script>'; input.fire('input'); expect(session.pending).toBe('composition');
    expect(named(r, 'シーン').disabled).toBe(true); button(r, 'モデル').fire('click'); button(r, 'キャプション').fire('click'); expect(named(panel, 'メディアの説明')).toBe(input);
    expect(nodes(gallery).some(n => n.textContent.includes('<script>'))).toBe(false);
    input.fire('compositionend'); button(panel, '説明を適用').fire('click'); expect(session.pending).toBeNull();
    expect(nodes(gallery).find(n => n.tag === 'img')).toBe(firstImage); expect(nodes(gallery).some(n => n.textContent.includes('<script>説明</script>'))).toBe(true);
    firstImage.fire('error'); expect(button(gallery, '画像を再試行').hidden).toBe(false); w.render(); expect(button(gallery, '画像を再試行').hidden).toBe(false);
    button(gallery, '画像を再試行').fire('click'); firstImage.fire('load'); expect(button(gallery, '画像を再試行').hidden).toBe(true);
    const old = captionAttachments(session.snapshot.mediaData, f.shared).ready.map(r => r.id);
    button(panel, '後へ').fire('click'); expect(captionAttachments(session.snapshot.mediaData, f.shared).ready.map(r => r.id)).toEqual([old[1], old[0]]);
    button(panel, '添付を削除').fire('click'); expect(captionAttachments(session.snapshot.mediaData, f.shared).ready).toHaveLength(2);
    const confirmation = nodes(panel).filter(n => n.tag === 'section').find(n => n.children.some(c => c.textContent.includes('画像本体と別キャプション')))!;
    button(confirmation, '添付を削除').fire('click'); expect(captionAttachments(session.snapshot.mediaData, f.shared).ready).toHaveLength(1);
    expect(Object.keys(session.snapshot.mediaData!.records)).toHaveLength(2); expect(nodes(gallery).filter(n => n.tag === 'img')).toHaveLength(1); w.dispose();
  });
  it('rejects immutable resource mutation and invalid alt text, without interpreting any history URL', () => {
    const cells = Object.fromEntries(Object.entries(mediaSeed()).map(([k, text]) => [k, { kind: 'value' as const, value: text }]));
    expect(projectMediaHistory({ token: 't', cells }, [f.shared]).records).toEqual({});
    const key = Object.keys(cells)[0]!; expect(() => projectMediaHistory({ token: 't', cells: { ...cells, [key]: { kind: 'value', value: cells[key]!.value.replace('image/png', 'text/html') } } }, [f.shared])).toThrow();
    expect(() => normalizeAlt('x\ny')).toThrow(); expect(() => normalizeAlt('x'.repeat(4097))).toThrow(); expect(normalizeAlt('e\u0301')).toBe('é');
  });
});
