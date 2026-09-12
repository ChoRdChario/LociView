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
  it('mounts local background drafts with exact readback, retry, pending guards, standard color and explicit View capture', () => {
    let token = 0, display: DisplayCapture = payload(), failed = false, applications = 0, rejectReceipt = false, applying = false;
    const s = new SyntheticSession(), initial = s.snapshot, w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s, { viewportFactory: () => ({
      update() {}, setActive() {}, read: () => ({ token: String(token), ready: true, issue: null, dragging: false, projection: 'perspective', axis: null, pins: [] }),
      capture: () => { if (applying && rejectReceipt) { rejectReceipt = false; throw Error('readback refusal'); } return display; },
      setBackground: (background, verify) => {
        applications++; if (failed) throw Error('background refusal'); const previous = display;
        display = { ...display, background }; applying = true;
        try { verify?.(); token++; } catch (e) { display = previous; throw e; } finally { applying = false; }
      },
      camera() {}, retry() {}, dispose() {} }) });
    const r = record(w.root); button(r, '視点').fire('click');
    const bg = area(r, '3D背景'), author = area(r, '視点の作成と管理'), hex = descendants(bg).find(n => n.attributes.get('aria-label') === '背景色')!;
    expect(display.background).toEqual(payload().background); expect(button(bg, '背景に適用').disabled).toBe(true);
    const input = (text: string) => { hex.value = text; hex.fire('input'); };
    input('#2468ac'); expect(s.pending).toBe('text'); expect(display.background).toEqual(payload().background);
    expect(button(r, '設備の確認').disabled).toBe(true); expect(button(author, '視点を作る').disabled).toBe(true);
    // An external camera movement is not a change to the background source token.
    display = { ...display, camera: { ...display.camera, position: [3, 4, 9] } }; token++; w.render();
    expect(button(bg, '背景に適用').disabled).toBe(false);
    failed = true; button(bg, '背景に適用').fire('click'); expect(s.pending).toBe('text');
    expect(display.background).toEqual(payload().background); expect(hex.value).toBe('#2468ac'); expect(descendants(bg).map(n => n.textContent).join(' ')).toContain('background refusal');
    failed = false; rejectReceipt = true; button(bg, '背景に適用').fire('click');
    expect(s.pending).toBe('text'); expect(display.background).toEqual(payload().background); expect(button(bg, '背景に適用').disabled).toBe(false);
    button(bg, '背景に適用').fire('click'); expect(s.pending).toBeNull(); expect(applications).toBe(3);
    const applied = display; expect(applied.background.colorSrgb).toEqual([36 / 255, 104 / 255, 172 / 255]);
    expect(s.snapshot).toBe(initial); // Local display, zero shared metadata writes.
    button(bg, '標準色').fire('click'); expect(hex.value).toBe('#e8e6e2'); expect(display).toBe(applied);
    button(bg, '取り消す').fire('click'); button(bg, '変更を取り消す').fire('click'); expect(s.pending).toBeNull();
    button(author, '視点を作る').fire('click'); expect(hex.readOnly).toBe(true);
    const name = descendants(author).find(n => n.tag === 'input')!; name.value = '背景と角度'; name.fire('input');
    button(author, '視点を追加').fire('click');
    const id = select(r, '保存した視点').value; expect(s.snapshot.viewData!.records[id]!.background).toEqual({ kind: 'value', value: applied.background });
    expect(s.snapshot.viewData!.records[id]!.camera).toEqual({ kind: 'value', value: applied.camera });
    change(select(area(r, '開始時の設定'), 'シーンを開いたときの視点'), id); expect(hex.readOnly).toBe(true);
    button(area(r, '開始時の設定'), '設定を適用').fire('click'); expect(hex.readOnly).toBe(false); w.dispose();
  });
  it('keeps IME/drafts through unavailable rendering and refuses an exact background change even when its HEX is unchanged', () => {
    let ready = true, token = 0, display: DisplayCapture = payload(), applications = 0;
    const s = new SyntheticSession(), w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s, { viewportFactory: () => ({
      update() {}, setActive() {}, read: () => ({ token: String(token), ready, issue: null, dragging: false, projection: 'perspective', axis: null, pins: [] }),
      capture: () => { if (!ready) throw Error('renderer unavailable'); return display; },
      setBackground: (background, verify) => { applications++; display = { ...display, background }; verify?.(); token++; }, camera() {}, retry() {}, dispose() {} }) });
    const r = record(w.root); button(r, '視点').fire('click'); const bg = area(r, '3D背景');
    const hex = descendants(bg).find(n => n.attributes.get('aria-label') === '背景色')!;
    hex.fire('compositionstart'); hex.value = '#abcdef'; hex.fire('input'); expect(s.pending).toBe('composition');
    ready = false; w.render(); expect(button(bg, '背景に適用').disabled).toBe(true); hex.fire('compositionend'); expect(s.pending).toBe('text');
    expect(hex.value).toBe('#abcdef'); button(bg, '取り消す').fire('click'); button(bg, '変更を取り消す').fire('click'); expect(s.pending).toBeNull();
    ready = true; w.render(); hex.value = '#abcdef'; hex.fire('input');
    display = { ...display, background: { kind: 'solid', colorSrgb: [0.1234568, 0.42, 0.8] } }; token++; w.render();
    expect(button(bg, '背景に適用').disabled).toBe(true); expect(descendants(bg).map(n => n.textContent).join(' ')).toContain('背景が更新'); expect(hex.value).toBe('#abcdef');
    expect(applications).toBe(0); w.dispose();
  });
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
