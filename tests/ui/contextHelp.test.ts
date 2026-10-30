import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextHelp, mountContextHelp } from '../../src/ui/projectScene/contextHelp';
import { RecordedDocument, RecordedNode, record } from './domRecorder';

class HelpNode extends RecordedNode {
  override getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  closest(selector: string): HelpNode | null {
    const matches = selector === '[data-lv-help-for]' ? this.attributes.has('data-lv-help-for') : this.className.split(' ').includes(selector.slice(1));
    return matches ? this : (this.parent as HelpNode | null)?.closest(selector) ?? null;
  }
  getBoundingClientRect() { return { left: 20, top: 20, bottom: 64, width: 44, height: 44 }; }
  getClientRects() { let node: RecordedNode | null = this; while (node) { if (node.hidden) return []; node = node.parent; } return [this.getBoundingClientRect()]; }
}
class HelpDocument extends RecordedDocument {
  body = new HelpNode('body', this);
  events = new Map<string, Set<EventListener>>();
  defaultView = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    innerWidth: 320, innerHeight: 400, addEventListener() {}, removeEventListener() {} };
  override createElement(tag: string) { return new HelpNode(tag, this); }
  getElementById(id: string): HelpNode | null {
    const walk = (node: RecordedNode): HelpNode | null => node.id === id ? node as HelpNode : node.children.map(walk).find(Boolean) ?? null;
    return walk(this.body);
  }
  addEventListener(name: string, action: EventListener) { const list = this.events.get(name) ?? new Set(); list.add(action); this.events.set(name, list); }
  removeEventListener(name: string, action: EventListener) { this.events.get(name)?.delete(action); }
  event(name: string, target: RecordedNode, data = {}) {
    const event = { target, relatedTarget: null, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...data };
    for (const action of this.events.get(name) ?? []) action(event as unknown as Event);
    return event;
  }
}
let changed: (() => void)[];
beforeEach(() => {
  vi.useFakeTimers(); changed = [];
  vi.stubGlobal('MutationObserver', class { constructor(callback: () => void) { changed.push(callback); } observe() {} disconnect() {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const document = new HelpDocument(), root = document.createElement('section'), input = document.createElement('input'); input.value = '入力を保持'; input.setAttribute('aria-describedby', 'current-error');
  const help = record(contextHelp(document.asDocument(), '背景を視点にも残すには、視点を更新してください。', [input as unknown as HTMLElement]));
  root.append(input, help); document.body.append(root);
  const stop = mountContextHelp(document.asDocument(), root as unknown as HTMLElement);
  return { document, root, input, help, trigger: help.children[0]!, note: help.children[1]!, stop };
}
describe('optional contextual explanations', () => {
  it('preserves existing descriptions and waits two seconds; a brief pass never opens it', () => {
    const h = setup(); expect(h.input.getAttribute('aria-describedby')).toContain('current-error'); expect(h.note.hidden).toBe(true);
    h.document.event('pointerover', h.input); vi.advanceTimersByTime(1999); expect(h.note.hidden).toBe(true);
    h.document.event('pointerout', h.input); vi.advanceTimersByTime(2001); expect(h.note.hidden).toBe(true);
    h.document.event('pointerover', h.trigger); vi.advanceTimersByTime(2000); expect(h.note.hidden).toBe(false); expect(h.note.parent).toBe(h.document.body);
    expect(h.input.value).toBe('入力を保持'); h.stop();
  });
  it('lets the pointer enter and read the explanation, and Escape does not cancel an edit', () => {
    const h = setup(); h.document.event('pointerover', h.trigger); vi.advanceTimersByTime(2000);
    h.document.event('pointerout', h.trigger, { relatedTarget: h.note }); h.document.event('pointerover', h.note); vi.advanceTimersByTime(30_000); expect(h.note.hidden).toBe(false);
    const first = h.document.event('keydown', h.trigger, { key: 'Escape' }); expect(h.note.hidden).toBe(true); expect(first.stopPropagation).toHaveBeenCalledOnce();
    const second = h.document.event('keydown', h.input, { key: 'Escape' }); expect(second.stopPropagation).not.toHaveBeenCalled(); expect(h.input.value).toBe('入力を保持'); h.stop();
  });
  it('supports keyboard focus and explicit touch opening without the focus/click double toggle', () => {
    const h = setup(); h.document.activeElement = h.trigger; h.document.event('focusin', h.trigger); expect(h.note.hidden).toBe(false);
    h.document.event('keydown', h.trigger, { key: 'Escape' }); h.document.event('pointerdown', h.trigger, { pointerType: 'touch' }); h.document.event('focusin', h.trigger); expect(h.note.hidden).toBe(true);
    h.document.event('click', h.trigger, { detail: 1 }); expect(h.note.hidden).toBe(false); expect(h.document.activeElement).toBe(h.trigger);
    h.document.event('pointerdown', h.trigger, { pointerType: 'touch' }); h.document.event('click', h.trigger, { detail: 1 }); expect(h.note.hidden).toBe(true); h.stop();
  });
  it('restores keyboard explanations after a cancelled touch gesture', () => {
    const h = setup(); h.document.event('pointerdown', h.trigger, { pointerType: 'touch' });
    h.document.event('pointercancel', h.trigger); h.document.activeElement = h.input; h.document.event('focusin', h.input);
    expect(h.note.hidden).toBe(false); h.stop();
  });
  it('does not swallow edit cancellation before help appears, and follows focus across shared anchors', () => {
    const h = setup(); h.document.event('pointerover', h.trigger);
    const escape = h.document.event('keydown', h.input, { key: 'Escape' }); expect(escape.preventDefault).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000); expect(h.note.hidden).toBe(true);
    h.document.activeElement = h.input; h.document.event('focusin', h.input); expect(h.note.hidden).toBe(false);
    h.document.activeElement = h.trigger; h.document.event('focusin', h.trigger); h.document.event('pointerout', h.input); vi.advanceTimersByTime(200);
    expect(h.note.hidden).toBe(false); h.stop();
  });
  it('shares nested scope lifetime and cancels pending or detached explanations', () => {
    const h = setup(), releaseNested = mountContextHelp(h.document.asDocument(), h.root as unknown as HTMLElement);
    h.document.event('pointerover', h.trigger); h.stop(); vi.advanceTimersByTime(2000); expect(h.note.hidden).toBe(false);
    h.help.hidden = true; changed.forEach(fn => fn()); expect(h.note.hidden).toBe(true); h.help.hidden = false;
    h.document.event('pointerover', h.trigger); vi.advanceTimersByTime(2000);
    h.help.remove(); changed.forEach(fn => fn()); expect(h.note.hidden).toBe(true); expect(h.document.body.children).not.toContain(h.note);
    h.root.append(h.help); h.document.event('pointerover', h.trigger); releaseNested(); vi.advanceTimersByTime(2000); expect(h.note.hidden).toBe(true);
    expect([...h.document.events.values()].every(set => set.size === 0)).toBe(true);
  });
});
