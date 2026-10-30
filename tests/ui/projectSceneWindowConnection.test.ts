import { describe, expect, it, vi } from 'vitest';
import { value } from '../../src/scene/types';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { createCaptionWindowControls, type WindowContext } from '../../src/ui/projectScene/captionWindowControls';
import { captionWindowView, planCaptionWindow } from '../../src/ui/projectScene/captionWindowState';
import { planCaptionList } from '../../src/ui/projectScene/captionListState';
import { planModelList } from '../../src/ui/projectScene/modelListState';
import type { SyntheticDisplay } from '../../src/harness/projectScene/viewportModel';
import { planNavigation } from '../../src/ui/projectScene/navigationState';
import { editCaptionDraft } from '../../src/ui/projectScene/captionDetailState';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';

const descendants = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(descendants)];
const button = (root: RecordedNode, text: string) => descendants(root).find(n => n.tag === 'button' && n.textContent === text)!;
const named = (root: RecordedNode, name: string) => descendants(root).find(n => n.attributes.get('aria-label') === name)!;
const select = (s: SyntheticSession, id: string) => s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId: id }));
const go = (s: SyntheticSession, id: string) => s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: id }));
const visible = (s: SyntheticSession) => captionWindowView(s.captionContext().source, s.windowMemory, s.memory.selectedCaptionId).visibleIds;

function mountedLayer(withContent = false, onRelease?: () => void) {
  const document = new RecordedDocument(), session = new SyntheticSession();
  // Extension identity only; this is not image decoding or a browser-layout fixture.
  const contentDispose = vi.fn(), content = vi.fn(() => {
    const root = document.createElement('div'); root.append(document.createElement('img'));
    return { root: root as unknown as HTMLElement, render() {}, dispose: contentDispose };
  });
  const render = () => layer.render({ source: session.captionContext().source, memory: session.windowMemory,
    selectedId: session.memory.selectedCaptionId, moveBlock: session.pending ? '操作を完了してください。' : null });
  const layer = createCaptionWindowControls(document.asDocument(), plan => { const accepted = session.acceptWindow(plan); render(); return accepted; },
    active => { session.setWindowDragging(active); render(); if (!active) onRelease?.(); }, withContent ? content : undefined);
  const project = (width = 900, height = 600, pins = [{ id: f.shared, x: 800, y: 500, visible: true }, { id: f.second, x: 750, y: 400, visible: true }], ready = true) =>
    layer.project({ ready, width, height, pins, sourceToken: session.snapshot.state.token, sceneId: session.sceneId });
  const root = record(layer.root), tools = record(layer.tools);
  const pick = (id: string) => { expect(select(session, id)).toBe(true); render(); project(); };
  return { document, session, layer, render, project, root, tools, pick, content, contentDispose };
}

describe('same-host comparison windows; authored DOM only, not raster or native input', () => {
  it('opens review pins in comparison windows and rejects stale projection receipts through same-source filters/hide', () => {
    const doc = new RecordedDocument(), s = new SyntheticSession();
    expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: f.equipment }))).toBe(true);
    const update = s.modelUpdateContext(), version = update.choices.find(v => v.closure.shape === 'updated')!;
    expect(s.acceptModelUpdate({ token: update.token, sceneId: update.sceneId, assetId: f.equipment, bindingId: version.projection.bindingId })).toBe(true);
    const original = s.snapshot;
    let latest: SyntheticDisplay | undefined, receipt: SyntheticDisplay | undefined, hold = false, notified = () => {};
    const workspace = createDevelopmentWorkspace(doc.asDocument(), s, { viewportFactory: (_canvas, changed) => {
      notified = changed;
      return { update(d) { if (d.readOnly) throw Error('expected editor display'); latest = d; if (!hold) receipt = d; }, setActive() {}, camera() {}, retry() {}, dispose() {},
        read: () => ({ token: 'camera', display: receipt, ready: true, issue: null, dragging: false, projection: 'perspective', axis: null,
          pins: receipt?.pins.map(p => ({ id: p.id, x: 800, y: 500, visible: true })) ?? [] }) };
    } });
    const root = record(workspace.root), stage = named(root, '3D表示');
    Object.assign(descendants(stage).find(n => n.tag === 'canvas')!, { getBoundingClientRect: () => ({ width: 900, height: 600 }) });
    workspace.render();
    const pin = (title: string) => descendants(stage).find(n => n.className === 'lv-development-pin' && n.textContent === title)!;
    const current = pin('設備の確認箇所'), color = current.style.backgroundColor;
    expect(current.hidden).toBe(false); expect(current.attributes.get('data-review')).toBe('true');
    expect(current.attributes.get('aria-description')).toBe('要確認'); current.fire('click');
    const windows = named(stage, 'キャプションのウィンドウ');
    const lines = () => descendants(windows).filter(n => n.className === 'lv-caption-window-line');
    expect(s.memory.selectedCaptionId).toBe(f.shared); expect(lines()[0]!.hidden).toBe(false);
    expect(descendants(named(windows, '設備の確認箇所')).some(n => n.textContent.startsWith('要確認'))).toBe(true);
    pin('入口の記録').fire('click'); expect(s.windowMemory.retained).toEqual([f.shared, f.second]);

    hold = true;
    expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'visibility', action: 'hide', assetId: f.equipment }))).toBe(true);
    workspace.render(); expect(lines().every(n => n.hidden)).toBe(true); // Old receipt, same Project token.
    const source = s.captionContext().source;
    expect(source.kind === 'ready' && source.captions.find(c => c.id === f.shared)).toMatchObject({ pin: 'ownerHidden', needsReview: true });
    expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'visibility', action: 'show', assetId: f.equipment }))).toBe(true);
    workspace.render(); expect(pin('設備の確認箇所').hidden).toBe(true);
    receipt = latest; notified(); expect(pin('設備の確認箇所').hidden).toBe(false); expect(lines()[0]!.hidden).toBe(false);
    expect(pin('設備の確認箇所').style.backgroundColor).toBe(color);
    for (const color of new Set(latest!.pins.map(p => p.color)))
      expect(s.acceptList(planCaptionList(s.captionContext(), { kind: 'color', color }))).toBe(true);
    workspace.render(); expect(lines().every(n => n.hidden)).toBe(true);
    receipt = latest; notified(); expect(lines().every(n => n.hidden)).toBe(true);
    expect(s.snapshot).toBe(original); workspace.dispose();
  });

  it('accumulates consecutive selections without a retain action, closes independently and explicitly reopens', () => {
    const doc = new RecordedDocument(), workspace = createDevelopmentWorkspace(doc.asDocument()), root = record(workspace.root), s = workspace.session;
    const original = s.snapshot; select(s, f.shared); workspace.render();
    const detail = named(root, 'キャプションの表示');
    select(s, f.second); workspace.render();
    expect(visible(s)).toEqual([f.shared, f.second]);
    select(s, f.second); workspace.render(); expect(visible(s)).toEqual([f.shared, f.second]);
    expect(descendants(root).some(n => n.textContent === '比較に残す')).toBe(false);
    const windows = named(root, 'キャプションのウィンドウ'), shared = named(windows, '設備の確認箇所');
    const reading = named(windows, '比較ウィンドウの本文'), editor = descendants(root).find(n => n.tag === 'textarea' && n.attributes.get('aria-label') === '本文')!;
    expect(named(root, '本文').tag).toBe('textarea'); expect(named(root, '本文')).toBe(editor);
    expect(reading.attributes.get('role')).toBe('group'); expect((reading as unknown as HTMLElement).tabIndex).toBe(0);
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
    button(named(windows, '入口の記録'), '×').fire('click'); button(detail, '比較に表示').fire('click');
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

  it('resizes one window by pointer, arrows or activation without replacing content, Project state or Scene-local preferences', () => {
    const h = mountedLayer(true), s = h.session; h.pick(f.shared); h.pick(f.second);
    const a = named(h.root, '設備の確認箇所'), b = named(h.root, '入口の記録'), handle = named(a, '大きさを変更');
    const body = a.children.find(n => n.className === 'lv-caption-window-body')!, image = descendants(a).find(n => n.tag === 'img')!;
    const text = descendants(a).find(n => n.className === 'lv-caption-window-text')!, line = h.root.children.find(n => n.className === 'lv-caption-window-line')!;
    const snapshot = s.snapshot, draft = s.detailContext().draft, memory = s.memory, windows = s.windowMemory;
    const other = { ...b.style }, connector = line.style.width; body.scrollTop = 90;
    const event = { button: 0, pointerId: 8, clientX: 300, clientY: 210, preventDefault() {} };
    handle.fire('pointerdown', event); expect(s.pending).toBe('window'); expect(handle.disabled).toBe(false);
    expect(go(s, f.detail)).toBe(false); expect(s.pinContext().otherPending).toBe('window');
    handle.fire('pointermove', { ...event, clientX: 380, clientY: 290 });
    expect([a.style.left, a.style.top, a.style.width, a.style.height]).toEqual(['16px', '16px', '360px', '280px']);
    expect(s.windowMemory).toBe(windows); expect(line.style.width).not.toBe(connector);
    handle.fire('pointerup', event); expect(s.pending).toBeNull(); const resized = s.windowMemory;
    handle.fire('click', { detail: 1 }); expect(s.windowMemory).toBe(resized); // No preset after drag.
    expect(resized.placements[0]!.rect).toEqual({ left: 16, top: 16, width: 360, height: 280 });
    h.project(150, 120); expect([a.style.width, a.style.height]).toEqual(['150px', '120px']); expect(s.windowMemory).toBe(resized);
    h.project(); expect([a.style.width, a.style.height]).toEqual(['360px', '280px']);
    handle.fire('keydown', { key: 'ArrowRight', preventDefault() {} }); expect(a.style.width).toBe('380px');
    handle.fire('click', { detail: 0 }); expect([a.style.width, a.style.height]).toEqual(['220px', '180px']);
    handle.fire('click', { detail: 0 }); expect([a.style.width, a.style.height]).toEqual(['280px', '200px']);
    const beforeClick = s.windowMemory;
    handle.fire('pointerdown', event); handle.fire('pointerup', event); expect(s.windowMemory).toBe(beforeClick);
    handle.fire('click', { detail: 1 }); expect([a.style.width, a.style.height]).toEqual(['360px', '280px']);
    expect([a.style.left, a.style.top]).toEqual(['16px', '16px']); expect(b.style).toEqual(other);
    expect(a.children).toContain(body); expect(descendants(a)).toContain(image); expect(descendants(a)).toContain(text); expect(body.scrollTop).toBe(90);
    expect(h.content).toHaveBeenCalledTimes(2); expect(h.contentDispose).not.toHaveBeenCalled();
    expect(s.snapshot).toBe(snapshot); expect(s.memory).toBe(memory); expect(s.detailContext().draft).toBe(draft);
    expect(visible(s)).toEqual([f.shared, f.second]);
    const preferred = s.windowMemory;
    expect(go(s, f.detail)).toBe(true); h.render(); h.pick(f.shared);
    expect(s.windowMemory.placements).toHaveLength(0);
    expect(go(s, f.overview)).toBe(true); h.render(); h.project(); expect(s.windowMemory).toBe(preferred);
    expect([named(h.root, '設備の確認箇所').style.width, named(h.root, '設備の確認箇所').style.height]).toEqual(['360px', '280px']);
    expect(new SyntheticSession().windowMemory.placements).toHaveLength(0); h.layer.dispose();
  });

  it('rolls back interrupted/stale resizing, releases pending and rejects late pointer/click completion', () => {
    for (const cause of ['Escape', 'pointercancel', 'lostpointercapture', 'extent', 'releaseExtent', 'source', 'selection', 'scene', 'membership', 'otherPointer', 'dispose']) {
      const h = mountedLayer(false, () => { if (cause === 'releaseExtent') h.project(500, 400); }), s = h.session; h.pick(f.shared);
      const card = named(h.root, '設備の確認箇所'), handle = named(card, '大きさを変更'), memory = s.windowMemory;
      const context: WindowContext = { source: s.captionContext().source, memory, selectedId: s.memory.selectedCaptionId, moveBlock: null };
      const event = { button: 0, pointerId: 9, clientX: 300, clientY: 210, preventDefault() {} };
      handle.fire('pointerdown', event); handle.fire('pointermove', { ...event, clientX: 380, clientY: 290 });
      handle.fire('pointerup', { ...event, pointerId: 77 }); expect(s.pending).toBe('window'); expect(s.windowMemory).toBe(memory);
      if (cause === 'Escape') handle.fire('keydown', { key: 'Escape', preventDefault() {} });
      else if (cause === 'extent') h.project(500, 400);
      else if (cause === 'releaseExtent') handle.fire('pointerup', event);
      else if (cause === 'source') h.layer.render({ ...context, source: { ...context.source, token: 'changed' } });
      else if (cause === 'selection') h.layer.render({ ...context, selectedId: f.second });
      else if (cause === 'scene') h.layer.render({ ...context, source: { ...context.source, sceneId: f.detail } });
      else if (cause === 'membership') {
        if (context.source.kind !== 'ready') throw Error('source');
        h.layer.render({ ...context, source: { ...context.source, captions: [] } });
      } else if (cause === 'otherPointer') handle.fire('pointerdown', { ...event, pointerId: 77 });
      else if (cause === 'dispose') h.layer.dispose();
      else handle.fire(cause, event);
      expect(s.pending, cause).toBeNull(); expect(s.windowMemory, cause).toBe(memory);
      handle.fire('pointerup', event); handle.fire('click', { detail: 1 }); expect(s.windowMemory, cause).toBe(memory);
      if (cause !== 'dispose') {
        h.render(); h.project(); const restored = named(h.root, '設備の確認箇所');
        expect([restored.style.width, restored.style.height], cause).toEqual(['280px', '200px']);
        // A cancelled gesture must not swallow the next keyboard activation.
        named(restored, '大きさを変更').fire('click', { detail: 0 }); expect(restored.style.width, cause).toBe('360px');
      }
      h.layer.dispose(); expect(s.pending).toBeNull();
    }
  });

  it('keeps top-left fixed at size limits and refuses all sizing inputs during drafts or invalid extents', () => {
    const h = mountedLayer(), s = h.session; h.pick(f.shared);
    const card = named(h.root, '設備の確認箇所'), handle = named(card, '大きさを変更');
    expect(s.acceptWindow(planCaptionWindow(s.captionContext().source, s.windowMemory, s.memory.selectedCaptionId,
      { kind: 'place', captionId: f.shared, rect: { left: 600, top: 390, width: 280, height: 200 } }))).toBe(true);
    h.render(); const event = { button: 0, pointerId: 10, clientX: 880, clientY: 590, preventDefault() {} };
    handle.fire('pointerdown', event); handle.fire('pointermove', { ...event, clientX: 1000, clientY: 1000 }); handle.fire('pointerup', event);
    expect([card.style.left, card.style.top, card.style.width, card.style.height]).toEqual(['600px', '390px', '300px', '210px']);
    handle.fire('click', { detail: 1 }); handle.fire('click', { detail: 0 });
    expect([card.style.left, card.style.top, card.style.width, card.style.height]).toEqual(['600px', '390px', '220px', '180px']);
    const memory = s.windowMemory, snapshot = s.snapshot, detail = s.detailContext();
    const draft = editCaptionDraft(detail.draft!, detail.source, 'body', '入力途中');
    expect(s.acceptDetail({ kind: 'draft', baseDraft: detail.draft!, draft })).toBe(true); h.render();
    expect(handle.disabled).toBe(true);
    const attempt = () => { handle.fire('pointerdown', event); handle.fire('pointermove', { ...event, clientX: 1000 });
      handle.fire('pointerup', event); handle.fire('click', { detail: 0 }); handle.fire('keydown', { key: 'ArrowRight', preventDefault() {} }); };
    attempt(); expect(s.pending).toBe('text'); expect(s.windowMemory).toBe(memory); expect(s.detailContext().draft).toBe(draft);
    s.acceptDetail({ kind: 'cancel', draft }); h.render();
    for (const extent of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      h.project(extent, 600); attempt(); expect(s.windowMemory).toBe(memory); expect(s.pending).toBeNull();
    }
    h.project(); expect([card.style.width, card.style.height]).toEqual(['220px', '180px']);
    expect(s.snapshot).toBe(snapshot); h.layer.dispose();
  });

  it('retains text under filters/review/unavailable membership and never invents connectors or conflict winners', () => {
    const h = mountedLayer(); h.pick(f.shared); const card = named(h.root, '設備の確認箇所');
    const line = h.root.children.find(n => n.className === 'lv-caption-window-line')!; expect(line.hidden).toBe(false);
    const memory = h.session.windowMemory;
    h.session.acceptList(planCaptionList(h.session.captionContext(), { kind: 'search', query: '見つからない語' }));
    h.render(); h.project(900, 600, []); expect(line.hidden).toBe(true); expect(h.root.children).toContain(card);
    expect(h.session.windowMemory).toBe(memory);
    const source = h.session.captionContext().source; if (source.kind !== 'ready') throw Error('source unavailable');
    const context: WindowContext = { source: { ...source, token: 'review-update', captions: source.captions.map(c => c.id === f.shared ? { ...c,
      pin: 'needsReview', title: { kind: 'unresolved', reason: 'conflict' }, body: value('<img src=x onerror=bad()>\r\n記録') } : c) }, memory, selectedId: f.shared, moveBlock: null };
    h.layer.render(context); expect(card.attributes.get('aria-label')).toBe('タイトルを確認');
    h.project(); expect(line.hidden).toBe(true); // Old source coordinates cannot connect the new review state.
    const projection = { ready: true, width: 900, height: 600, sourceToken: context.source.token, sceneId: context.source.sceneId,
      pins: [{ id: f.shared, x: 800, y: 500, visible: true }] };
    h.layer.project({ ...projection, sceneId: 'old-scene' }); expect(line.hidden).toBe(true);
    h.layer.project(projection); expect(line.hidden).toBe(false);
    h.layer.project({ ...projection, pins: [] }); expect(line.hidden).toBe(true);
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

it('window body pointer/focus activates and raises that window without changing Caption editing selection or Project data',()=>{
 const h=mountedLayer();h.pick(f.shared);h.pick(f.second);const before=h.session.snapshot,selected=h.session.memory.selectedCaptionId,cards=h.root.children.filter(n=>n.className==='lv-caption-window');expect(cards).toHaveLength(2);
 cards[0]!.fire('pointerdown');expect(visible(h.session).at(-1)).toBe(f.shared);expect(cards[0]!.dataset.active).toBe('true');expect(h.session.memory.selectedCaptionId).toBe(selected);expect(h.session.snapshot).toBe(before);
 cards[1]!.fire('focusin');expect(visible(h.session).at(-1)).toBe(f.second);expect(cards[1]!.dataset.active).toBe('true');h.layer.dispose();
});
