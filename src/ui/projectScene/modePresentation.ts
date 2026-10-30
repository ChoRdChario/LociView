/** Presentation only. The existing authority and disabled guards still reject writes. */
export function editOnly(...nodes: readonly HTMLElement[]) {
  for (const node of nodes) node.setAttribute('data-lv-edit-only', '');
}
export function viewOnly(...nodes: readonly HTMLElement[]) {
  for (const node of nodes) node.setAttribute('data-lv-view-only', '');
}
export function displayMode(root: HTMLElement, mode: 'view' | 'edit') {
  if (root.getAttribute?.('data-lv-mode') !== mode) root.setAttribute('data-lv-mode', mode);
}
/** Keep unresolved evidence readable when its resolution controls are hidden. */
export function viewChoices(document: Document, label: string, values: readonly string[]): HTMLElement {
  const root = document.createElement('section'), title = document.createElement('p'), list = document.createElement('ul');
  title.textContent = label; root.append(title, list); viewOnly(root);
  for (const value of values) { const item = document.createElement('li'); item.textContent = value; item.style.whiteSpace = 'pre-wrap'; list.append(item); }
  return root;
}
