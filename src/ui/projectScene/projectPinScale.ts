import { editOnly } from './modePresentation';
import { panelNodes, type ProjectPanelHost } from './projectPanel';
import { fieldValue } from './projectRead';

/** Asset-wide saved setting, owned by the Caption task rather than one Caption. */
export function createProjectPinScale(document: Document, host: ProjectPanelHost) {
  const { make, button } = panelNodes(document), root = make('details'), summary = make('summary', 'ピンの大きさ');
  root.className = 'lv-pin-scale'; root.setAttribute('aria-label', 'ピンの大きさ');
  const body = make('div'), modelLabel = make('label', 'ピンのモデル'), model = make('select');
  model.setAttribute('aria-label', 'ピンのモデル'); modelLabel.append(model);
  const label = make('label', 'ピンの表示倍率'), input = make('input'), note = make('p');
  input.type = 'number'; input.min = '0.001'; input.max = '1000'; input.step = 'any'; input.setAttribute('aria-label', 'ピンの表示倍率'); label.append(input);
  note.setAttribute('role', 'status');
  let selected = '', composing = false, disposed = false, optionKey = '';
  type Scope = { token: string; sceneId: string; assetId: string };
  let scope: Scope | null = null, draft: (Scope & { raw: string }) | null = null;
  root.addEventListener('toggle',()=>{
    if(disposed||!root.open||selected||draft||composing||host.block('captions',false))return;
    const active=Object.values(host.source().provider.resources.assets).filter(asset=>asset.lifecycle.kind==='value'&&asset.lifecycle.value.state==='active');
    if(active.length===1){selected=active[0]!.id;host.changed();}
  });
  const capture = () => { const { provider, sceneId } = host.source(); if (selected && !draft) scope = { token: provider.token, sceneId, assetId: selected }; };
  const valid = () => !!draft && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(draft.raw.trim()) &&
    Number.isFinite(Number(draft.raw)) && Number(draft.raw) >= 0.001 && Number(draft.raw) <= 1000;
  model.addEventListener('change', () => {
    if (disposed || model.disabled || draft || composing || host.block('captions', false)) { model.value = selected; return; }
    selected = model.value; scope = null; host.changed();
  });
  input.addEventListener('focus', capture); input.addEventListener('pointerdown', capture);
  input.addEventListener('input', () => {
    if (disposed || input.disabled || host.block('captions')) return;
    if (!scope) capture(); if (!scope) return;
    draft = { ...(draft ?? scope), raw: input.value }; host.changed();
  });
  input.addEventListener('compositionstart', () => { composing = true; host.changed(); });
  input.addEventListener('compositionend', () => { if (draft) draft = { ...draft, raw: input.value }; composing = false; host.changed(); });
  const apply = button('倍率を適用', () => {
    const captured = draft, { provider, sceneId } = host.source();
    if (disposed || !captured || host.block('captions') || composing || !valid() || captured.token !== provider.token || captured.sceneId !== sceneId || captured.assetId !== selected) return;
    const value = Number(captured.raw), previous = provider.details.mutable.assetsById[captured.assetId]?.pinScale;
    if (previous?.kind === 'value' && (previous.value ?? 1) === value) { draft = null; scope = null; host.changed(); return; }
    host.dispatch('captions', captured.token, { kind: 'setAssetPinScale', assetId: captured.assetId, pinScale: value }, () => {
      draft = null; scope = null; host.message('ピンの表示倍率を変更しました。');
    });
  });
  const cancel = button('倍率の変更を取り消す', () => { if (!disposed && !host.block('captions', false) && !composing) { draft = null; scope = null; host.changed(); } });
  body.append(modelLabel, label, note, apply, cancel); root.append(summary, body); editOnly(root);
  function render() {
    if (disposed) return;
    const { provider, sceneId } = host.source();
    const entries = Object.values(provider.resources.assets).filter(asset=>asset.lifecycle.kind==='value'&&asset.lifecycle.value.state==='active').map(asset => {
      const name = fieldValue(provider.details.mutable.assetsById[asset.id]?.label);
      return [asset.id, typeof name === 'string' && name ? name : '名称を確認'] as const;
    });
    if(selected&&!entries.some(([id])=>id===selected))entries.push([selected,'選択したモデルを確認']);
    const nextKey = JSON.stringify(entries);
    if (nextKey !== optionKey) {
      const values: readonly (readonly [string, string])[] = [['', 'モデルを選択'], ...entries];
      optionKey = nextKey; model.replaceChildren(...values.map(([value, text]) => { const option = make('option', text); option.value = value; return option; }));
    }
    model.value = selected;
    const asset = selected ? provider.resources.assets[selected] : undefined, scale = selected ? provider.details.mutable.assetsById[selected]?.pinScale : undefined;
    const ready = provider.semanticProfile === 'map2' && asset?.lifecycle.kind === 'value' && asset.lifecycle.value.state === 'active' && scale?.kind === 'value' &&
      !provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[0] === 'assetsById' && i.path[1] === selected);
    const stale = !!draft && (draft.token !== provider.token || draft.sceneId !== sceneId || draft.assetId !== selected);
    model.disabled = !!host.block('captions', false) || !!draft || composing;
    input.disabled = !!host.block('captions') || !ready;
    if (!composing) input.value = draft?.raw ?? (scale?.kind === 'value' ? String(scale.value ?? 1) : '');
    label.hidden = !selected; apply.hidden = !selected; apply.disabled = !!host.block('captions') || !ready || !draft || composing || stale || !valid();
    cancel.hidden = !draft; cancel.disabled = !!host.block('captions', false) || composing;
    note.textContent = stale ? '内容が更新されています。入力を保持しています。取り消して選び直してください。' : !selected ? '' : !ready ?
      'このモデルの倍率を確認できません。モデルと設定の状態を確認してください。' : 'このモデルのピンに、すべてのシーンで適用します。';
    note.hidden = !note.textContent; if (draft || composing) root.open = true;
  }
  return { root, body, render, hasChanges: () => !!draft, composing: () => composing,
    reveal() { root.open = true; input.focus({ preventScroll: false }); },
    dispose() { disposed = true; root.remove(); } };
}
