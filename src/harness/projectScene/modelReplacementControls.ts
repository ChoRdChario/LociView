import type { SyntheticSession } from './session';
import type { ModelReplacementTarget } from './modelTypes';

/** Explicit real-file replacement; never the synthetic prepared-version adapter. */
export function createModelReplacementControls(document: Document, session: SyntheticSession, changed: () => void) {
  const root = document.createElement('section'), choose = document.createElement('button'), input = document.createElement('input');
  const confirm = document.createElement('button'), cancel = document.createElement('button'), impact = document.createElement('p'), issue = document.createElement('p');
  root.setAttribute('aria-label', 'モデルの差し替え');
  choose.type = confirm.type = cancel.type = 'button'; choose.textContent = '3Dモデルを差し替える';
  confirm.textContent = '差し替える'; cancel.textContent = '選択を取り消す';
  input.type = 'file'; input.accept = '.glb,model/gltf-binary'; input.hidden = true; input.setAttribute('aria-label', '差し替える3Dモデルを選択');
  issue.setAttribute('role', 'status'); root.append(choose, input, impact, confirm, cancel, issue);
  let disposed = false, target: ModelReplacementTarget | undefined;
  choose.addEventListener('click', () => {
    if (disposed || choose.disabled) return;
    const c = session.modelUpdateContext(); if (!c.assetId || !c.current || c.issue) return;
    target = { token: c.token, sceneId: c.sceneId, assetId: c.assetId, expectedBindingId: c.current.projection.bindingId };
    input.value = ''; input.click();
  });
  input.addEventListener('change', () => {
    if (disposed) return;
    const file = input.files?.[0]; if (file && target) session.selectModelReplacement(target, file);
    target = undefined; changed();
  });
  confirm.addEventListener('click', () => { if (!disposed && !confirm.disabled) { session.confirmModelReplacement(); changed(); } });
  cancel.addEventListener('click', () => { if (!disposed && session.cancelModelReplacement()) { input.value = ''; changed(); } });
  return { root, render() {
    if (disposed) return;
    const d = session.modelReplacementSelection, problem = session.modelReplacementIssue;
    choose.disabled = !!session.pending || !!problem; choose.hidden = !!d;
    confirm.hidden = cancel.hidden = !d; confirm.disabled = !d || !!problem; cancel.disabled = !!session.workingBlock;
    impact.hidden = !d;
    impact.textContent = d ? `${d.name} → ${d.command.file.name}。${d.sceneCount}シーンに反映します。記録とピン位置は保持し、ピンは要確認になります。材質の調整は引き継ぎません。` : '';
    issue.textContent = problem ?? ''; issue.hidden = !problem;
  }, dispose() { disposed = true; target = undefined; root.remove(); } };
}
