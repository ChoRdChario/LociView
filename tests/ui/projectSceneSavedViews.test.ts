import { describe, expect, it } from 'vitest';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { orderBetween, readProjectCamera, readSolidBackground } from '../../src/harness/projectScene/viewHistory';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';
import type { DisplayCapture } from '../../src/harness/projectScene/viewSession';

const descendants = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(descendants)];
const button = (r: RecordedNode, text: string) => descendants(r).find(n => n.tag === 'button' && n.textContent === text)!;
const select = (r: RecordedNode, name: string) => descendants(r).find(n => n.tag === 'select' && n.attributes.get('aria-label') === name)!;
const area = (r: RecordedNode, name: string) => descendants(r).find(n => n.tag === 'section' && n.attributes.get('aria-label') === name)!;
const change = (n: RecordedNode, value: string) => { n.value = value; n.fire('change'); };
const payload = () => ({ camera: { position: [1, 2, 8] as const, target: [0, 0, 0] as const, up: [0, 1, 0] as const,
  projection: { kind: 'perspective' as const, verticalFovRadians: 0.7 } }, background: { kind: 'solid' as const, colorSrgb: [0.1234567, 0.42, 0.8] as const } });

describe('Saved Views in the connected synthetic workspace, not browser/device evidence', () => {
  it('creates, recalls, renames, reorders, sets entry and confirms deletion in the same host, retaining frozen capture and IME input', () => {
    let cameraToken = 0, display: DisplayCapture = payload(); const recalled: unknown[] = [];
    const doc = new RecordedDocument(), s = new SyntheticSession(), w = createDevelopmentWorkspace(doc.asDocument(), s, { viewportFactory: () => ({
      update() {}, setActive() {}, read: () => ({ token: String(cameraToken), ready: true, issue: null, dragging: false, projection: 'perspective', axis: null, pins: [] }),
      capture: () => display, recall: p => { recalled.push(p); }, camera() {}, retry() {}, dispose() {} }) });
    const r = record(w.root); button(r, '視点').fire('click'); const author = area(r, '視点の作成と管理'), entry = area(r, '開始時の設定');
    const picker = select(r, '保存した視点'), name = descendants(author).find(n => n.tag === 'input')!;
    const add = (text: string) => { button(author, '視点を作る').fire('click'); name.value = text; name.fire('input'); button(author, '視点を追加').fire('click'); };
    button(author, '視点を作る').fire('click'); name.fire('compositionstart'); name.value = '全体を確認'; name.fire('input');
    expect(s.pending).toBe('composition'); expect(button(r, '設備の確認').disabled).toBe(true);
    name.fire('compositionend'); expect(s.pending).toBe('text');
    display = { ...payload(), camera: { ...payload().camera, position: [3, 4, 9] } }; cameraToken++; w.render();
    button(author, '視点を追加').fire('click'); expect(s.pending).toBeNull();
    const first = picker.value, row = s.snapshot.viewData!.records[first]!;
    expect(row.camera).toEqual({ kind: 'value', value: payload().camera }); expect(row.background).toEqual({ kind: 'value', value: payload().background });
    expect(s.snapshot.state.scenes[f.overview]!.defaultViewId).toEqual({ kind: 'value', value: null }); expect(recalled).toHaveLength(0);
    button(area(r, '保存した視点'), '表示').fire('click'); expect(recalled).toEqual([payload()]);
    add('別の角度'); const second = picker.value; expect(second).not.toBe(first);
    button(author, '前へ').fire('click'); expect(s.snapshot.viewData!.records[second]!.orderKey).not.toEqual(s.snapshot.viewData!.records[first]!.orderKey);
    change(picker, first); button(author, '編集').fire('click');
    const sameNameNode = descendants(author).find(n => n.tag === 'input'); expect(sameNameNode).toBe(name);
    name.value = '入口'; name.fire('input'); change(picker, second); expect(picker.value).toBe(first);
    button(author, '変更を適用').fire('click'); expect(s.snapshot.viewData!.records[first]!.name).toEqual({ kind: 'value', value: '入口' });
    expect(s.snapshot.viewData!.records[first]!.camera).toEqual(row.camera);
    change(select(entry, 'シーンを開いたときの視点'), first); button(entry, '設定を適用').fire('click');
    expect(recalled).toHaveLength(1); expect(button(author, '削除').disabled).toBe(true);
    change(select(entry, 'シーンを開いたときの視点'), ''); button(entry, '設定を適用').fire('click');
    button(author, '削除').fire('click'); expect(s.snapshot.viewData!.records[first]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    button(author, '削除する').fire('click'); expect(s.snapshot.viewData!.records[first]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    button(r, 'キャプション').fire('click'); button(r, '設備の確認').fire('click'); button(r, '視点').fire('click');
    expect(select(r, '保存した視点').children.some(n => n.value === second)).toBe(false);
    button(r, 'キャプション').fire('click'); button(r, '全体').fire('click'); button(r, '視点').fire('click');
    expect(select(r, '保存した視点').children.some(n => n.value === second)).toBe(true);
    expect(s.snapshot.resources.captions).toEqual(new SyntheticSession().snapshot.resources.captions); w.dispose();
  });
  it('validates exact camera/background shapes and allocates strict order intervals without rewriting neighbors', () => {
    expect(readProjectCamera(payload().camera)).toEqual(payload().camera);
    for (const camera of [{ ...payload().camera, up: [0, 2, 0] }, { ...payload().camera, position: [0, 0, 0] },
      { ...payload().camera, projection: { kind: 'perspective', verticalFov: 0.7 } }, { ...payload().camera, target: [-0, 0, 0] }])
      expect(() => readProjectCamera(camera)).toThrow();
    expect(() => readSolidBackground({ kind: 'transparent' })).toThrow('未対応');
    expect(() => readSolidBackground({ kind: 'solid', colorSrgb: [1, 2, 3] })).toThrow();
    for (const [before, after] of [[null, null], [null, 'A'], ['A', 'B'], ['A', 'A1'], ['A0', 'A1'], ['z', null]] as const) {
      const key = orderBetween(before, after); if (before) expect(key > before).toBe(true); if (after) expect(key < after).toBe(true);
    }
    expect(() => orderBetween('A', 'A')).toThrow(); expect(() => orderBetween('A', 'A0')).toThrow();
  });
});
