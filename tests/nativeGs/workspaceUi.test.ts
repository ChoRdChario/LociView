import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeUiDialog, mountNativeWorkspaceUi, NATIVE_WORKSPACE_TABS } from '../../src/nativeGs/workspaceUi';

// Narrow DOM double for actual navigation listeners; not layout/browser evidence.
class UiElement extends EventTarget {
  children: UiElement[] = [];
  parent: UiElement | null = null;
  attrs = new Map<string, string>();
  className = '';
  classList = { add: (...classes: string[]) => { this.className += ` ${classes.join(' ')}`; } };
  id = '';
  hidden = false;
  tabIndex = 0;
  scrollTop = 0;
  value = '';
  open = false;
  focus() { active = this; }
  append(...nodes: UiElement[]) {
    for (const node of nodes) {
      if (node.parent !== null) node.parent.children = node.parent.children.filter((child) => child !== node);
      node.parent = this; this.children.push(node);
    }
  }
  setAttribute(key: string, value: string) { this.attrs.set(key, value); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { this.dispatchEvent(new Event('click')); }
}
let active: UiElement | null = null;
const html = (node: UiElement) => node as unknown as HTMLElement;
const find = (node: UiElement, predicate: (node: UiElement) => boolean): UiElement | undefined => {
  if (predicate(node)) return node;
  for (const child of node.children) { const match = find(child, predicate); if (match) return match; }
};
function setup() {
  active = null;
  vi.stubGlobal('document', {
    createElement: () => new UiElement(), createTextNode: () => new UiElement(),
  });
  const root = new UiElement();
  const parts = Object.fromEntries(['header','stage','caption','model','material','view','status']
    .map((id) => [id, new UiElement()])) as Record<'header'|'stage'|'caption'|'model'|'material'|'view'|'status', UiElement>;
  const controller = mountNativeWorkspaceUi(html(root), Object.fromEntries(
    Object.entries(parts).map(([key, node]) => [key, html(node)]),
  ) as Parameters<typeof mountNativeWorkspaceUi>[1]);
  return { root, parts, controller };
}
afterEach(() => vi.unstubAllGlobals());

describe('Native workspace navigation', () => {
  it('mounts four labelled tabs and preserves actual inputs, canvas and scroll across switches', () => {
    const { root, parts, controller } = setup();
    const input = new UiElement(); input.value = '未適用の数値・IME入力';
    parts.caption.append(input); parts.caption.scrollTop = 120;
    const canvas = new UiElement(); parts.stage.append(canvas);
    controller.showTab('material'); parts.material.scrollTop = 90;
    expect(parts.caption.hidden).toBe(true);
    controller.showTab('caption');
    expect(parts.caption.hidden).toBe(false);
    expect(parts.caption.scrollTop).toBe(120);
    expect(parts.caption.children[0]).toBe(input);
    expect(input.value).toBe('未適用の数値・IME入力');
    expect(parts.stage.children[0]).toBe(canvas);
    controller.showTab('material'); expect(parts.material.scrollTop).toBe(90);
    for (const [id] of NATIVE_WORKSPACE_TABS) {
      expect(find(root, (node) => node.attrs.get('id') === `ng-tab-${id}`)?.attrs.get('aria-controls')).toBe(`ng-pane-${id}`);
      expect(parts[id].attrs.get('aria-labelledby')).toBe(`ng-tab-${id}`);
    }
  });

  it('supports click, arrow wrap, Home/End and a single keyboard tab stop', () => {
    const { root, parts } = setup();
    const tab = (id: string) => find(root, (node) => node.attrs.get('id') === `ng-tab-${id}`)!;
    tab('model').click(); expect(parts.model.hidden).toBe(false);
    const key = (id: string, value: string) => {
      const event = new Event('keydown', { cancelable: true });
      Object.defineProperty(event, 'key', { value }); tab(id).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    };
    key('model', 'End'); expect(active).toBe(tab('view'));
    key('view', 'ArrowRight'); expect(active).toBe(tab('caption'));
    key('caption', 'ArrowLeft'); expect(active).toBe(tab('view'));
    key('view', 'Home'); expect(active).toBe(tab('caption'));
    expect(NATIVE_WORKSPACE_TABS.map(([id]) => tab(id).tabIndex)).toEqual([0,-1,-1,-1]);
  });

  it('keeps dialog contents mounted for retry after close', () => {
    setup();
    const file = new UiElement(); file.value = 'selected-file';
    const dialog = createNativeUiDialog('共有', html(file));
    const element = dialog.element as unknown as UiElement;
    dialog.open(); expect(element.open).toBe(true);
    find(element, (node) => node.attrs.get('aria-label') === '共有を閉じる')!.click();
    expect(element.open).toBe(false);
    dialog.open(); expect(element.children.includes(file)).toBe(true);
    expect(file.value).toBe('selected-file');
  });
});
