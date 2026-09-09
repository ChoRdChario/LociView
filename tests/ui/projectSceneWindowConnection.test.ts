import { describe, expect, it } from 'vitest';
import { value } from '../../src/scene/types';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { createCaptionWindowControls, type WindowContext } from '../../src/ui/projectScene/captionWindowControls';
import { captionWindowView, planCaptionWindow } from '../../src/ui/projectScene/captionWindowState';
import { planCaptionList } from '../../src/ui/projectScene/captionListState';
import { planNavigation } from '../../src/ui/projectScene/navigationState';
import { editCaptionDraft } from '../../src/ui/projectScene/captionDetailState';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';

const descendants = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(descendants)];
const button = (root: RecordedNode, text: string) => descendants(root).find(n => n.tag === 'button' && n.textContent === text)!;
const named = (root: RecordedNode, name: string) => descendants(root).find(n => n.attributes.get('aria-label') === name)!;
const select = (s: SyntheticSession, id: string) => s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId: id }));
const go = (s: SyntheticSession, id: string) => s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: id }));
const visible = (s: SyntheticSession) => captionWindowView(s.captionContext().source, s.windowMemory, s.memory.selectedCaptionId).visibleIds;

function mountedLayer() {
  const document = new RecordedDocument(), session = new SyntheticSession();
  const render = () => layer.render({ source: session.captionContext().source, memory: session.windowMemory,
    selectedId: session.memory.selectedCaptionId, moveBlock: session.pending ? '操作を完了してください。' : null });
  const layer = createCaptionWindowControls(document.asDocument(), plan => { const accepted = session.acceptWindow(plan); render(); return accepted; },
    active => { session.setWindowDragging(active); render(); });
  const project = (width = 900, height = 600, pins = [{ id: f.shared, x: 800, y: 500, visible: true }, { id: f.second, x: 750, y: 400, visible: true }], ready = true) =>
    layer.project({ ready, width, height, pins });
  const root = record(layer.root), tools = record(layer.tools);
  const pick = (id: string) => { expect(select(session, id)).toBe(true); render(); project(); };
  return { document, session, layer, render, project, root, tools, pick };
}

describe('same-host comparison windows; authored DOM only, not raster or native input', () => {
  it('accumulates consecutive selections without a retain action, closes independently and explicitly reopens', () => {
    const doc = new RecordedDocument(), workspace = createDevelopmentWorkspace(doc.asDocument()), root = record(workspace.root), s = workspace.session;
    const original = s.snapshot; select(s, f.shared); workspace.render();
    const detail = named(root, 'キャプションの表示');
    select(s, f.second); workspace.render();
    expect(visible(s)).toEqual([f.shared, f.second]);
    select(s, f.second); workspace.render(); expect(visible(s)).toEqual([f.shared, f.second]);
    expect(descendants(root).some(n => n.textContent === '比較に残す')).toBe(false);
    const windows = named(root, 'キャプションのウィンドウ'), shared = named(windows, '設備の確認箇所');
    const retry = button(root, '3D表示を再試行'); expect(windows.contains(retry)).toBe(false);
    expect(named(root, '3D表示').contains(retry)).toBe(false); // Recovery is outside every floating overlap.
    button(shared, '設備の確認箇所').fire('click'); expect(s.memory.selectedCaptionId).toBe(f.second);
    const context = s.detailContext(), draft = editCaptionDraft(context.draft!, context.source, 'body', '未適用の文章');
    s.acceptDetail({ kind: 'draft', baseDraft: context.draft!, draft }); workspace.render();
    expect(descendants(windows).some(n => n.textContent === '未適用の文章')).toBe(false);
    button(named(windows, '入口の記録'), '×').fire('click'); workspace.render();
    expect(visible(s)).toEqual([f.shared]); expect(s.memory.selectedCaptionId).toBe(f.second); expect(s.detailContext().draft).toBe(draft);
    expect(s.snapshot).toBe(original);
    workspace.render(); expect(visible(s)).toEqual([f.shared]);
    select(s, f.second); workspace.render(); // Same-row explicit selection reopens without changing the draft.
    expect(visible(s)).toContain(f.second); expect(s.detailContext().draft).toBe(draft);
    button(named(windows, '入口の記録'), '×').fire('click'); button(detail, 'ウィンドウを表示').fire('click');
    expect(visible(s)).toContain(f.second);
    s.acceptDetail({ kind: 'cancel', draft });
    button(named(windows, '設備の確認箇所'), '×').fire('click'); select(s, f.shared); workspace.render();
    expect(visible(s)).toContain(f.shared); expect(s.snapshot).toBe(original); workspace.dispose();
  });

  it('separates front order from position, retains stable body nodes/scroll and only clamps display on resize', () => {
    const h = mountedLayer(); h.pick(f.shared); h.pick(f.second);
    const a = named(h.root, '設備の確認箇所'), b = named(h.root, '入口の記録');
    const position = (n: RecordedNode) => [n.style.left, n.style.top]; const first = position(a), second = position(b);
    const body = a.children.find(n => n.className === 'lv-caption-window-body')!; body.scrollTop = 90;
    button(a, '設備の確認箇所').fire('click'); expect(position(a)).toEqual(first); expect(position(b)).toEqual(second);
    expect(h.session.memory.selectedCaptionId).toBe(f.second); expect(h.session.windowMemory.placements).toEqual([]);
    const front = named(h.tools, '前面にするウィンドウ'); front.value = f.second; front.fire('change');
    expect(position(a)).toEqual(first); expect(h.session.memory.selectedCaptionId).toBe(f.second);
    button(a, '設備の確認箇所').fire('keydown', { key: 'ArrowRight', preventDefault() {} });
    const preferred = h.session.windowMemory, moved = position(a); expect(preferred.placements[0]?.rect.left).toBe(36);
    h.project(150, 120); expect(a.style.width).toBe('150px'); expect(h.session.windowMemory).toBe(preferred);
    h.project(); expect(position(a)).toEqual(moved); expect(a.children).toContain(body); expect(body.scrollTop).toBe(90);
    button(h.tools, 'ウィンドウを並べる').fire('click'); expect(h.session.windowMemory.placements).toHaveLength(2);
    expect(h.session.memory.selectedCaptionId).toBe(f.second);
    h.layer.dispose(); expect(button(a, '設備の確認箇所').listeners.get('pointerdown')?.size).toBe(0);
  });

  it('retains text under filters/review/unavailable membership and never invents connectors or conflict winners', () => {
    const h = mountedLayer(); h.pick(f.shared); const card = named(h.root, '設備の確認箇所');
    const line = h.root.children.find(n => n.className === 'lv-caption-window-line')!; expect(line.hidden).toBe(false);
    const memory = h.session.windowMemory;
    h.session.acceptList(planCaptionList(h.session.captionContext(), { kind: 'search', query: '見つからない語' }));
    h.render(); h.project(900, 600, []); expect(line.hidden).toBe(true); expect(h.root.children).toContain(card);
    expect(h.session.windowMemory).toBe(memory);
    const source = h.session.captionContext().source; if (source.kind !== 'ready') throw Error('source unavailable');
    const context: WindowContext = { source: { ...source, captions: source.captions.map(c => c.id === f.shared ? { ...c,
      pin: 'needsReview', title: { kind: 'unresolved', reason: 'conflict' }, body: value('<img src=x onerror=bad()>\r\n記録') } : c) }, memory, selectedId: f.shared, moveBlock: null };
    h.layer.render(context); expect(card.attributes.get('aria-label')).toBe('タイトルを確認');
    h.project(); expect(line.hidden).toBe(true); // A stale visible-pin observation cannot bypass current review state.
    expect(descendants(card).find(n => n.className === 'lv-caption-window-text')!.textContent).toBe('<img src=x onerror=bad()>\r\n記録');
    expect(descendants(card).some(n => n.tag === 'img')).toBe(false);
    h.layer.render({ ...context, source: { ...source, captions: [] } }); expect(h.root.children.filter(n => n.className === 'lv-caption-window')).toHaveLength(0);
    expect(h.session.windowMemory).toBe(memory); h.render(); expect(named(h.root, '設備の確認箇所')).toBeDefined();
    h.project(900, 600, [{ id: f.shared, x: 800, y: 500, visible: true }], false);
    expect(h.root.children.find(n => n.className === 'lv-caption-window-line')!.hidden).toBe(true); h.layer.dispose();
  });

  it('keeps Scene/actor memories independent and cancels/rejects interrupted or stale moves', () => {
    const h = mountedLayer(), s = h.session; h.pick(f.shared); const card = named(h.root, '設備の確認箇所'), title = button(card, '設備の確認箇所');
    const snapshot = s.snapshot;
    const event = { button: 0, pointerId: 7, clientX: 50, clientY: 50, preventDefault() {} };
    title.fire('pointerdown', event); expect(s.pending).toBe('window'); expect(go(s, f.detail)).toBe(false);
    expect(s.modelContext().pending).toBe('window'); expect(s.pinContext().otherPending).toBe('window');
    title.fire('pointermove', { ...event, clientX: 150, clientY: 120 }); expect(card.style.left).toBe('116px');
    title.fire('keydown', { key: 'Escape', preventDefault() {} }); expect(card.style.left).toBe('16px'); expect(s.pending).toBeNull();
    expect(s.windowMemory.placements).toHaveLength(0); title.fire('pointerup', event); expect(s.windowMemory.placements).toHaveLength(0);
    title.fire('pointerdown', event); title.fire('pointermove', { ...event, clientX: 150 }); title.fire('pointerup', event);
    const remembered = s.windowMemory; expect(remembered.placements[0]?.rect.left).toBe(116); expect(s.snapshot).toBe(snapshot);
    const stale = planCaptionWindow(s.captionContext().source, remembered, f.shared, { kind: 'close', captionId: f.shared });
    const reselection = planCaptionList(s.captionContext(), { kind: 'select', captionId: f.shared });
    expect(go(s, f.detail)).toBe(true); h.render(); h.pick(f.shared); expect(s.windowMemory.retained).toEqual([f.shared]);
    expect(s.acceptWindow(stale)).toBe(false); expect(s.acceptList(reselection)).toBe(false);
    expect(go(s, f.overview)).toBe(true); h.render(); h.project(); expect(s.windowMemory).toBe(remembered);
    expect(named(h.root, '設備の確認箇所').style.left).toBe('116px');
    const other = new SyntheticSession(); expect(other.windowMemory.retained).toHaveLength(0);
    select(other, f.shared); expect(other.windowMemory.retained).toEqual([f.shared]); expect(other.windowMemory.placements).toHaveLength(0);
    h.layer.dispose(); expect(s.pending).toBeNull();
  });
});
