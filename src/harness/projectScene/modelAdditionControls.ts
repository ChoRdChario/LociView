import type { SyntheticSession } from './session';

export function createModelAdditionControls(document: Document, session: SyntheticSession, changed: () => void) {
  const root = document.createElement('section'), add = document.createElement('button'), input = document.createElement('input');
  const cancel = document.createElement('button'), note = document.createElement('p');
  add.type = cancel.type = 'button'; add.textContent = '3Dモデルを追加'; cancel.textContent = '選択を取り消す';
  input.type = 'file'; input.accept = '.glb,model/gltf-binary'; input.hidden = true; input.setAttribute('aria-label', '3Dモデルを追加');
  note.textContent = '静的GLBのみ。別のモデルとして、このシーンに追加します。';
  root.append(add, input, cancel, note);
  let disposed = false, target: { token: string; sceneId: string } | undefined;
  add.addEventListener('click', () => { if (disposed || add.disabled) return;
    target = { token: session.snapshot.state.token, sceneId: session.sceneId }; input.value = ''; input.click(); });
  input.addEventListener('change', () => { if (disposed) return;
    const file = input.files?.[0]; if (file && target) session.addModelFile(target, file); target = undefined; changed(); });
  cancel.addEventListener('click', () => { if (!disposed && session.cancelModelFile()) { input.value = ''; changed(); } });
  return { root, render() {
    root.hidden = session.session.task !== 'models' || !session.modelFileAdditionAvailable;
    add.disabled = session.readOnly || !!session.pending; cancel.hidden = !session.hasModelFileSelection;
    cancel.disabled = !!session.workingBlock;
  }, dispose() { disposed = true; target = undefined; root.remove(); } };
}
