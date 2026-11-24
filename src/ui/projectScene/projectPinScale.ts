import { editOnly } from './modePresentation';
import { panelNodes, type ProjectPanelHost } from './projectPanel';
import type { WorkspaceProvider } from './projectWorkspacePorts';

function savedSizes(provider: WorkspaceProvider) {
  if (provider.semanticProfile !== 'map2') return null;
  const sizes: number[] = [];
  for (const asset of Object.values(provider.resources.assets)) {
    if (asset.lifecycle.kind !== 'value') return null;
    if (asset.lifecycle.value.state !== 'active') continue;
    const size = asset.pinScale;
    if (size?.kind !== 'value') return null;
    sizes.push(size.value ?? 1);
  }
  if (!sizes.length || provider.issues.some(issue => issue.code === 'concurrent-delete-edit' && issue.path[0] === 'assetsById')) return null;
  return { first: sizes[0]!, mixed: sizes.some(size => size !== sizes[0]) };
}

/** Preserve each saved size until a gesture explicitly sets a common size. */
export function createProjectPinScale(document: Document, host: ProjectPanelHost) {
  const { make } = panelNodes(document), root = make('section'), label = make('label', 'ピンの大きさ');
  const slider = make('input'), value = make('output');
  root.className = 'lv-pin-scale'; editOnly(root);
  slider.type = 'range'; slider.min = '-3'; slider.max = '3'; slider.step = '0.01';
  slider.setAttribute('aria-label', 'ピンの大きさ');
  const sizeScope = 'すべてのモデルに付いたピンに適用します。';
  slider.title = sizeScope; slider.setAttribute('aria-description', sizeScope);
  label.append(slider); root.append(label, value);
  let disposed = false, displayToken = '', saved: ReturnType<typeof savedSizes> = null;
  let start: { token: string; sceneId: string } | null = null, preview: number | null = null, submitted = false;
  const current = () => {
    if (!start) return false;
    const { provider, sceneId } = host.source();
    return start.token === provider.token && start.sceneId === sceneId;
  };
  function reset() { start = null; preview = null; submitted = false; }
  function capture() {
    if (disposed || slider.disabled || host.block('captions')) return;
    const { provider, sceneId } = host.source();
    start = { token: provider.token, sceneId }; submitted = false;
  }
  function render() {
    if (disposed) return;
    const { provider } = host.source();
    if (displayToken !== provider.token) { displayToken = provider.token; saved = savedSizes(provider); }
    slider.disabled = !saved || !!host.block('captions');
    const active = current() ? preview : null;
    const mixed = active === null && saved?.mixed;
    const size = active ?? (mixed ? 1 : saved?.first ?? 1);
    if (active === null) slider.value = String(Math.log10(size));
    const formatted = !saved ? '変更できません' : mixed ? 'モデルごとに異なります' : `${Number(size.toPrecision(3))}倍`;
    value.textContent = formatted; slider.setAttribute('aria-valuetext', formatted);
  }
  slider.addEventListener('pointerdown', capture);
  slider.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (!host.block('captions')) { reset(); host.changed(); } return; }
    if (!start || submitted) capture();
  });
  slider.addEventListener('input', () => {
    if (disposed || slider.disabled || host.block('captions')) return;
    if (!start) capture();
    if (!current()) return;
    // Equal travel for each decade keeps small imported model scales adjustable.
    const exponent = Number(slider.value);
    if (!Number.isFinite(exponent) || exponent < -3 || exponent > 3) return;
    preview = Number((10 ** exponent).toPrecision(3)); host.changed();
  });
  slider.addEventListener('change', () => {
    if (submitted) return;
    const size = preview, token = start?.token;
    const valid = !disposed && !!token && current() && !slider.disabled && !host.block('captions');
    if (!valid || size === null || !token || !saved || !saved.mixed && size === saved.first) { reset(); host.changed(); return; }
    // The workspace owns retry; keep its exact proposed value visible until that command succeeds.
    submitted = true;
    host.dispatch('captions', token, { kind: 'setProjectPinScale', pinScale: size }, () => {
      reset(); host.message('ピンの大きさを変更しました。');
    });
  });
  const discardGesture = () => { if (start && !submitted) { reset(); host.changed(); } };
  slider.addEventListener('pointercancel', discardGesture);
  slider.addEventListener('blur', discardGesture);
  return { root, render, hasChanges: () => current() && preview !== null, composing: () => false,
    previewScale: () => current() ? preview : null,
    reveal() { slider.focus({ preventScroll: false }); },
    dispose() { disposed = true; reset(); root.remove(); } };
}
