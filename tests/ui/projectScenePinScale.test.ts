import { expect, it, vi } from 'vitest';
import { createProjectPinScale } from '../../src/ui/projectScene/projectPinScale';
import type { ProjectPanelHost } from '../../src/ui/projectScene/projectPanel';
import { RecordedDocument, record } from './domRecorder';

function fixture(sizes: (number | undefined)[] = [1]) {
  const document = new RecordedDocument();
  const assets = Object.fromEntries(sizes.map((size, index) => [String(index), {
    id: String(index), lifecycle: { kind: 'value', value: { state: 'active' } }, pinScale: { kind: 'value', value: size }
  }]));
  const provider = { token: 'one', semanticProfile: 'map2', issues: [], resources: { assets } };
  let sceneId = 'first', blocked = false;
  const dispatch = vi.fn();
  const host = { source: () => ({ provider, sceneId }), changed: () => panel.render(), block: () => blocked ? '閲覧中' : null, dispatch, message: vi.fn() } as unknown as ProjectPanelHost;
  const panel = createProjectPinScale(document.asDocument(), host); panel.render();
  const root = record(panel.root), slider = root.children[0]!.children[0]!;
  function drag(exponent: string) { slider.fire('pointerdown'); slider.value = exponent; slider.fire('input'); }
  return { panel, root, slider, drag, provider, dispatch, transition() { sceneId = 'next'; panel.render(); }, view() { blocked = true; panel.render(); } };
}

it('shows the shared slider at rest and keeps mixed model sizes until a gesture ends', () => {
  const h = fixture([0.03, 2]);
  expect(h.root.getAttribute('data-lv-edit-only')).toBe('');
  expect(h.slider.getAttribute('aria-valuetext')).toBe('モデルごとに異なります');
  h.drag('0.3'); expect(h.panel.previewScale()).toBe(2); expect(h.slider.getAttribute('aria-valuetext')).toBe('2倍');
  expect(h.dispatch).not.toHaveBeenCalled();
  h.slider.fire('change');
  expect(h.dispatch).toHaveBeenCalledExactlyOnceWith('captions', 'one', { kind: 'setProjectPinScale', pinScale: 2 }, expect.any(Function));
  h.slider.fire('blur'); expect(h.panel.previewScale()).toBe(2);
  h.dispatch.mock.calls[0]![3](); expect(h.panel.hasChanges()).toBe(false); h.panel.dispose();
});

it('cancels preview or a stale gesture without applying to a new scene or generation', () => {
  const h = fixture();
  h.drag('1'); h.slider.fire('pointercancel'); expect(h.panel.previewScale()).toBeNull();
  h.drag('2'); h.provider.token = 'two'; h.panel.render(); h.slider.fire('change');
  h.drag('3'); h.transition(); h.slider.fire('change'); expect(h.dispatch).not.toHaveBeenCalled();
  h.view(); expect(h.slider.disabled).toBe(true); h.drag('2'); h.slider.fire('change'); expect(h.dispatch).not.toHaveBeenCalled(); h.panel.dispose();
});

it('keeps unset sizes equivalent to one, and disables unresolved selections', () => {
  const h = fixture([1, undefined]); expect(h.slider.getAttribute('aria-valuetext')).toBe('1倍');
  h.drag('0'); h.slider.fire('change'); expect(h.dispatch).not.toHaveBeenCalled();
  h.provider.resources.assets['1']!.pinScale.kind = 'unresolved'; h.provider.token = 'two'; h.panel.render();
  expect(h.slider.disabled).toBe(true); h.panel.dispose();
});
