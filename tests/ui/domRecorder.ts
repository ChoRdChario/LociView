/** Records authored DOM operations; NOT a browser, layout or native-input emulator. */
export class RecordedNode {
  children: RecordedNode[] = []; parent: RecordedNode | null = null;
  attributes = new Map<string, string>(); dataset: Record<string, string> = {};
  style: Record<string, string> = {}; textContent = ''; className = ''; id = '';
  value = ''; disabled = false; hidden = false; type = ''; title = ''; placeholder = '';
  scrollTop = 0; clientHeight = 0; offsetTop = 0; offsetHeight = 0;
  focusCalls: unknown[] = []; listeners = new Map<string, Set<() => void>>();
  constructor(readonly tag: string, readonly document: RecordedDocument) {}
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  append(...nodes: RecordedNode[]) { for (const node of nodes) this.insertBefore(node, null); }
  insertBefore(node: RecordedNode, before: RecordedNode | null) {
    node.remove(); const index = before === null ? this.children.length : this.children.indexOf(before);
    this.children.splice(index, 0, node); node.parent = this; return node;
  }
  replaceChildren(...nodes: RecordedNode[]) { for (const node of [...this.children]) node.remove(); this.append(...nodes); }
  addEventListener(event: string, handler: () => void) { const set = this.listeners.get(event) ?? new Set(); set.add(handler); this.listeners.set(event, set); }
  removeEventListener(event: string, handler: () => void) { this.listeners.get(event)?.delete(handler); }
  fire(event: string) { for (const handler of this.listeners.get(event) ?? []) handler(); }
  contains(node: RecordedNode | null): boolean { return node === this || this.children.some(child => child.contains(node)); }
  focus(options?: unknown) { this.document.activeElement = this; this.focusCalls.push(options); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
}
export class RecordedDocument {
  activeElement: RecordedNode | null = null;
  createElement(tag: string) { return new RecordedNode(tag, this); }
  asDocument() { return this as unknown as Document; }
}
export const record = (element: HTMLElement) => element as unknown as RecordedNode;
