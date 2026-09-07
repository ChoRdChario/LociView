import { el } from '../ui/dom';

export type NativeWorkspaceTab = 'caption' | 'model' | 'material' | 'view';
export const NATIVE_WORKSPACE_TABS: readonly [NativeWorkspaceTab, string][] = [
  ['caption', 'キャプション'], ['model', 'モデル'], ['material', 'マテリアル'], ['view', '視点'],
];

/** Navigation changes visibility only; never rebuild inputs or dispatch edits. */
export function mountNativeWorkspaceUi(root: HTMLElement, content: {
  header: HTMLElement;
  stage: HTMLElement;
  caption: HTMLElement;
  model: HTMLElement;
  material: HTMLElement;
  view: HTMLElement;
  status: HTMLElement;
}) {
  const tabs = el('div', { class: 'ng-tabs', role: 'tablist', 'aria-label': '作業パネル' });
  const bodies = el('div', { class: 'ng-tab-bodies' });
  const buttons = new Map<NativeWorkspaceTab, HTMLButtonElement>();
  const scroll = new Map<NativeWorkspaceTab, number>();
  let active: NativeWorkspaceTab = 'caption';
  const showTab = (tab: NativeWorkspaceTab, focus = false): void => {
    scroll.set(active, content[active].scrollTop);
    active = tab;
    for (const [id] of NATIVE_WORKSPACE_TABS) {
      content[id].hidden = id !== tab;
      buttons.get(id)!.setAttribute('aria-selected', String(id === tab));
      buttons.get(id)!.tabIndex = id === tab ? 0 : -1;
    }
    content[tab].scrollTop = scroll.get(tab) ?? 0;
    if (focus) buttons.get(tab)!.focus();
  };
  for (const [id, title] of NATIVE_WORKSPACE_TABS) {
    const button = el('button', {
      id: `ng-tab-${id}`, role: 'tab', 'aria-controls': `ng-pane-${id}`,
      onclick: () => showTab(id),
    }, title);
    button.addEventListener('keydown', (event) => {
      const index = NATIVE_WORKSPACE_TABS.findIndex(([key]) => key === id);
      const next = event.key === 'ArrowRight' ? (index + 1) % 4
        : event.key === 'ArrowLeft' ? (index + 3) % 4
          : event.key === 'Home' ? 0 : event.key === 'End' ? 3 : null;
      if (next === null) return;
      event.preventDefault();
      showTab(NATIVE_WORKSPACE_TABS[next]![0], true);
    });
    buttons.set(id, button);
    tabs.append(button);
    content[id].id = `ng-pane-${id}`;
    content[id].classList.add('ng-tab-content');
    content[id].setAttribute('role', 'tabpanel');
    content[id].setAttribute('aria-labelledby', `ng-tab-${id}`);
    bodies.append(content[id]);
  }
  root.append(el('main', { class: 'ng-workspace' }, content.header,
    el('div', { class: 'ng-view' }, content.stage,
      el('aside', { class: 'ng-panel', 'aria-label': 'プロジェクトの操作' }, tabs, bodies)),
    content.status,
  ));
  showTab('caption');
  return { showTab };
}

/** Kept mounted between opens: selected files and error details survive closing. */
export function createNativeUiDialog(title: string, ...contents: HTMLElement[]) {
  const close = el('button', { class: 'ng-icon-button', 'aria-label': `${title}を閉じる` }, '×');
  const dialog = el('dialog', { class: 'ng-dialog', 'aria-label': title },
    el('header', { class: 'ng-head' }, el('h2', {}, title), close), ...contents);
  close.addEventListener('click', () => dialog.close());
  return { element: dialog, closeButton: close, open: () => { if (!dialog.open) dialog.showModal(); } };
}
