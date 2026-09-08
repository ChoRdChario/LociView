import type { SyntheticSession } from './session';

/** Small development-only input adapters around the existing mounted model/pin controls. */
export function createModelUpdateControls(document: Document, session: SyntheticSession, changed: () => void) {
  const root = document.createElement('section'); root.className = 'lv-development-model-update';
  const title = document.createElement('h2'); title.textContent = 'モデルを更新';
  const state = document.createElement('p'), impact = document.createElement('p'), issue = document.createElement('p');
  const label = document.createElement('label'); label.textContent = '更新する合成モデル';
  const select = document.createElement('select'); select.setAttribute('aria-label', '更新する合成モデル'); label.append(select);
  const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'このモデルに更新';
  const note = document.createElement('p'); note.textContent = '合成データの更新です。ファイル読込・3D描画は未接続です。';
  root.append(title, state, label, impact, apply, issue, note);
  let context = session.modelUpdateContext(), scope = '', chosen = '', disposed = false;
  const change = () => { chosen = select.value; render(); };
  const accept = () => {
    if (disposed || apply.disabled || !context.assetId) return;
    session.acceptModelUpdate({ token: context.token, sceneId: context.sceneId, assetId: context.assetId, bindingId: chosen }); changed();
  };
  select.addEventListener('change', change); apply.addEventListener('click', accept);
  function render() {
    if (disposed) return;
    context = session.modelUpdateContext();
    const next = JSON.stringify([context.token, context.sceneId, context.assetId]);
    if (next !== scope) {
      chosen = ''; scope = next;
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = '選択してください';
      select.replaceChildren(empty);
      for (const version of context.choices) {
        const option = document.createElement('option'); option.value = version.projection.bindingId; option.textContent = version.label; select.append(option);
      }
    }
    state.textContent = context.assetId ? `${context.name} — ${context.current?.label ?? '更新候補を確認'}` : '';
    impact.textContent = context.assetId ? `${context.sceneCount}シーンのモデルが更新されます。記録とピン座標は保持されます。` : '';
    select.value = chosen; select.disabled = context.issue !== null;
    apply.disabled = Boolean(context.issue) || !context.choices.some(v => v.projection.bindingId === chosen);
    issue.textContent = context.issue ?? ''; issue.hidden = !context.issue;
  }
  return { root, render, dispose() { disposed = true; select.removeEventListener('change', change); apply.removeEventListener('click', accept); root.remove(); } };
}

export function createPinCoordinateControls(document: Document, session: SyntheticSession, changed: () => void) {
  const root = document.createElement('section'); root.className = 'lv-development-coordinates';
  root.setAttribute('aria-label', 'ピン座標・開発用');
  const note = document.createElement('p'); note.textContent = '合成モデル内の座標です。3D上の位置選択・ギズモは未接続です。'; root.append(note);
  const inputs = ['X', 'Y', 'Z'].map(axis => {
    const label = document.createElement('label'); label.textContent = axis;
    const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'decimal'; input.setAttribute('aria-label', axis);
    label.append(input); root.append(label); return input;
  });
  const familyLabel = document.createElement('label'); familyLabel.textContent = '補正先の表面';
  const family = document.createElement('select'); family.setAttribute('aria-label', '補正先の表面'); familyLabel.append(family); root.append(familyLabel);
  let disposed = false, fingerprint = '', composing: HTMLInputElement | null = null;
  const cleanups: (() => void)[] = [];
  const listen = (node: HTMLElement, type: string, action: () => void) => {
    node.addEventListener(type, action); cleanups.push(() => node.removeEventListener(type, action));
  };
  const update = () => {
    if (disposed || !session.pinCoordinates) return;
    session.changePinCoordinates({ coordinates: [inputs[0]!.value, inputs[1]!.value, inputs[2]!.value], familyId: family.value || null }); changed();
  };
  for (const input of inputs) {
    listen(input, 'input', update);
    listen(input, 'compositionstart', () => { composing = input; session.setPinComposing(true); changed(); });
    listen(input, 'compositionend', () => { composing = null; session.setPinComposing(false); update(); });
  }
  listen(family, 'change', update);
  function render() {
    if (disposed) return;
    const context = session.pinCoordinateContext(); root.hidden = !context.mode;
    if (!context.input) return;
    inputs.forEach((input, i) => {
      const raw = context.input!.coordinates[i]!;
      if (input !== composing && input.value !== raw) input.value = raw;
    });
    familyLabel.hidden = !context.needsFamily;
    const missingFamily = context.input.familyId && !context.families.some(item => item.id === context.input!.familyId) ? context.input.familyId : null;
    const key = JSON.stringify([context.families, missingFamily]);
    if (key !== fingerprint) {
      fingerprint = key; const empty = document.createElement('option'); empty.value = ''; empty.textContent = '選択してください'; family.replaceChildren(empty);
      if (missingFamily) {
        const missing = document.createElement('option'); missing.value = missingFamily; missing.textContent = '選択した表面（状態を確認）'; family.append(missing);
      }
      for (const item of context.families) {
        const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; family.append(option);
      }
    }
    family.value = context.input.familyId ?? '';
  }
  return { root, render, dispose() { disposed = true; cleanups.forEach(cleanup => cleanup()); root.remove(); } };
}
