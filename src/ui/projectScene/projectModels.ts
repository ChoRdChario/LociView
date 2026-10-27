import { createModelListControls } from './modelListControls';
import { modelListPlanIsCurrent, newModelListMemory, type ModelListContext, type ModelListMemory } from './modelListState';
import { projectIdentity, projectModels } from './projectRead';
import type { WorkspaceFile, WorkspaceModelProposal } from './projectWorkspacePorts';
import { newProjectId, panelNodes, sameProjectValue, type ProjectPanelHost, type ProjectModelPanel } from './projectPanel';

export function createProjectModels(document: Document, host: ProjectPanelHost): ProjectModelPanel {
  const { make, button } = panelNodes(document), root = make('section'), fileArea = make('section'), placement = make('section'), review = make('section');
  root.setAttribute('aria-label', 'モデルの作業'); fileArea.setAttribute('aria-label', 'モデルのファイル'); placement.setAttribute('aria-label', 'モデルの配置'); review.setAttribute('aria-label', 'モデルの更新候補');
  const memories = new Map<string, ModelListMemory>();
  const preview = host.ports.createModelPreview?.();
  let edit: WorkspaceModelProposal | null = null, raw: string[] = [], composing = false, disposed = false;
  let pinSize: { token: string; sceneId: string; assetId: string; raw: string } | null = null;
  let pinSizeScope: { token: string; sceneId: string; assetId: string } | null = null;
  let proxyScope: {token:string;target:NonNullable<ReturnType<typeof host.ports.modelDetails>>['gsProxyTarget'];removing:boolean;prepared?:{id:string;label:string}} | null=null;
  let fileScope: { kind: 'add' | 'replace'; token: string; sceneId: string; assetId: string; expectedBindingId?: string; file?: WorkspaceFile } | null = null;
  let deletion: { token: string; assetId: string } | null = null;
  const choices = new Map<string, { token: string; value: string }>();
  const membershipDecisions = new Map<string, { token: string; sceneId: string; value: 'one' | 'both' }>();
  const memory = () => { const { provider, sceneId } = host.source(); if (!memories.has(sceneId)) memories.set(sceneId, newModelListMemory(projectIdentity(provider), sceneId)); return memories.get(sceneId)!; };
  const setMemory = (next: ModelListMemory) => memories.set(host.source().sceneId, next);
  const ownInput = () => !!edit || !!fileScope || !!proxyScope || !!deletion || !!pinSize || choices.size > 0 || membershipDecisions.size > 0;
  const context = (): ModelListContext => {
    const { provider, sceneId } = host.source(), m = memory(), block = host.block('models');
    return { source: projectModels(provider, sceneId, m.projectId, m.hiddenAssetIds, host.viewport().read()), memory: m,
      pending: composing || m.composing ? 'composition' : edit ? 'modelTransform' : ownInput() ? 'text' : host.block('models', false) ? 'update' : null, mutationBlock: block, feedback: { kind: 'idle' } };
  };
  const list = createModelListControls(document, plan => {
    if (disposed || host.block('models', false) || !modelListPlanIsCurrent(plan, context())) return;
    try {
    if (plan.kind === 'change' || plan.kind === 'visibility') setMemory(plan.memory);
    else if (plan.kind === 'membership') {
      const token = plan.token;
      host.dispatch('models', token, plan.action === 'exclude' ? { kind: 'exclude', resourceKind: 'asset', membershipId: plan.membershipId, eventId: newProjectId('evt') } :
        { kind: 'include', sceneId: plan.sceneId, resourceKind: 'asset', resourceId: plan.assetId, membershipId: newProjectId('sam'), eventId: newProjectId('evt'),
          orderKey: host.ports.viewOrder(Object.values(host.source().provider.state.assetMemberships).filter(e => e.sceneId === plan.sceneId && e.orderKey.kind === 'value').map(e => e.orderKey.kind === 'value' ? e.orderKey.value : '').sort().at(-1) ?? null, null) }, () => {
          if (plan.action === 'include') setMemory({ ...memory(), hiddenAssetIds: memory().hiddenAssetIds.filter(id => id !== plan.assetId) });
          host.message(plan.action === 'include' ? 'このシーンにモデルを追加しました。' : 'このシーンからモデルを外しました。');
        });
    } else if (plan.kind === 'review') { if (!ownInput() && !memory().composing) setMemory({ ...memory(), assetId: plan.assetId }); host.message('下の更新候補と依存関係を確認してください。'); }
    } catch (error) { host.message((error as Error).message); }
    host.changed();
  });
  const input = (label: string) => { const node = make('input'); node.type = 'file'; node.accept = '.glb,model/gltf-binary'; node.hidden = true; node.setAttribute('aria-label', label); fileArea.append(node); return node; };
  const addInput = input('3Dモデルを追加'), replaceInput = input('モデルを差し替える'); addInput.accept += ',.ply,application/ply';
  const beginFile = (kind: 'add' | 'replace') => {
    if (host.block('models') || ownInput() || memory().composing) return;
    const { provider, sceneId } = host.source(), details = memory().assetId ? host.ports.modelDetails(sceneId, memory().assetId!) : null;
    if (kind === 'replace' && (!details || details.replacementAvailable === false || details.sceneCount.kind !== 'value')) return;
    fileScope = { kind, token: provider.token, sceneId, assetId: kind === 'add' ? newProjectId('ast') : details!.target.assetId,
      expectedBindingId: kind === 'replace' ? details!.target.bindingId : undefined };
    const selected = kind === 'add' ? addInput : replaceInput; selected.value = ''; host.changed(); selected.click();
  };
  const add = button('3Dモデルを追加', () => beginFile('add')), replace = button('モデルを差し替える', () => beginFile('replace'));
  const cancelFile = button('選択を取り消す', () => { if (!host.block('models', false) && !composing) { fileScope = null; addInput.value = replaceInput.value = ''; host.changed(); } });
  const confirmReplacement = button('差し替えを確定', () => applyFile()), fileNote = make('p'); fileNote.setAttribute('role', 'status');
  fileArea.append(add, replace, cancelFile, fileNote, confirmReplacement);
  function applyFile() {
    const captured = fileScope; if (!captured?.file || host.block('models') || captured.token !== host.source().provider.token) return;
    const action = captured.kind === 'add' ? () => host.ports.addModel(captured.token, { sceneId: captured.sceneId, assetId: captured.assetId, file: captured.file! }) :
      () => host.ports.replaceModel(captured.token, { sceneId: captured.sceneId, assetId: captured.assetId, expectedBindingId: captured.expectedBindingId!, file: captured.file! });
    host.execute('models', captured.token, action, () => { fileScope = null; addInput.value = replaceInput.value = ''; setMemory({ ...memory(), assetId: captured.assetId });
      host.message(captured.kind === 'add' ? 'モデルを追加しました。' : 'モデルを差し替えました。配置と記録を保持しています。'); });
  }
  for (const node of [addInput, replaceInput]) {
    node.addEventListener('cancel', () => { if (!host.block('models', false)) { fileScope = null; host.changed(); } });
    node.addEventListener('change', () => {
      const selected = node.files?.[0]; if (!selected || !fileScope || host.block('models')) return;
      fileScope = { ...fileScope, file: { name: selected.name, size: selected.size, arrayBuffer: selected.arrayBuffer.bind(selected) } };
      if (fileScope.token !== host.source().provider.token) host.message('対象が更新されています。元のモデルを選び直してください。');
      else if (fileScope.kind === 'add') applyFile(); host.changed();
    });
  }
  const proxyArea=make('section'),proxyNote=make('p'),proxyInput=input('位置指定用の面を選択');proxyArea.setAttribute('aria-label','位置指定用の面');proxyNote.setAttribute('role','status');
  const beginProxy=(removing:boolean)=>{
    if(host.block('models')||ownInput()||memory().composing)return;
    const target=memory().assetId?host.ports.modelDetails(host.source().sceneId,memory().assetId!)?.gsProxyTarget:undefined;
    if(!target||!host.ports.prepareGsProxy)return;proxyScope={token:host.source().provider.token,target,removing};
    if(removing)prepareProxy();else{proxyInput.value='';host.changed();proxyInput.click();}
  };
  const proxyAdd=button('位置指定用の面を追加',()=>beginProxy(false)),proxyRemove=button('位置指定用の面を外す',()=>beginProxy(true));
  function prepareProxy(file?:WorkspaceFile){
    const captured=proxyScope;if(!captured?.target||host.block('models')||!host.ports.prepareGsProxy)return;
    host.execute('models',captured.token,async()=>{const result=await host.ports.prepareGsProxy!(captured.token,captured.target!,file);if(proxyScope===captured)captured.prepared=result;},()=>host.changed());
  }
  proxyInput.addEventListener('change',()=>{const file=proxyInput.files?.[0];if(file&&proxyScope)prepareProxy({name:file.name,size:file.size,arrayBuffer:file.arrayBuffer.bind(file)});});
  proxyInput.addEventListener('cancel',()=>{if(!host.block('models',false)){proxyScope=null;host.ports.cancelGsProxy?.();host.changed();}});
  const proxyConfirm=button('このモデルに面を追加',()=>{
    const captured=proxyScope;if(!captured?.prepared||host.block('models')||!host.ports.commitGsProxy)return;
    host.execute('models',captured.token,()=>host.ports.commitGsProxy!(captured.token,captured.prepared!.id),()=>{proxyScope=null;host.message(captured.removing?'位置指定用の面を外しました。':'位置指定用の面を登録しました。');});
  });
  const proxyCancel=button('面の選択を取り消す',()=>{if(!host.block('models',false)){host.ports.cancelGsProxy?.();proxyScope=null;proxyInput.value='';host.changed();}});
  proxyArea.append(proxyAdd,proxyRemove,proxyNote,proxyConfirm,proxyCancel);
  const begin = button('配置を調整', () => {
    if (host.block('models') || ownInput() || memory().composing) return;
    const m = memory(), { sceneId } = host.source(), details = m.assetId ? host.ports.modelDetails(sceneId, m.assetId) : null;
    const item = context().source.kind === 'ready' ? projectModels(host.source().provider, sceneId, m.projectId, m.hiddenAssetIds, host.viewport().read()) : null;
    const available = item?.kind === 'ready' ? item.items.find(i => i.id === m.assetId)?.display : undefined;
    if (!details || details.sceneCount.kind !== 'value' || available?.kind !== 'value' || available.value !== 'visible') return;
    edit = { target: details.target, placement: details.placement, mode: 'translate' };
    raw = [...details.placement.translation.map(String), ...details.rotationDegrees, String(details.placement.uniformScale)]; host.changed();
  });
  const fields = make('div'), labels = ['モデル位置 X', 'モデル位置 Y', 'モデル位置 Z', 'モデル回転 X', 'モデル回転 Y', 'モデル回転 Z', 'モデル倍率'];
  const inputs = labels.map((text, index) => {
    const label = make('label', text), node = make('input'); node.type = 'number'; node.step = 'any'; node.setAttribute('aria-label', text); label.append(node); fields.append(label);
    node.addEventListener('input', () => { if (!edit || host.block('models')) return; raw[index] = node.value;
      try { const parsed = host.ports.modelPlacement(raw.slice(0, 3), raw.slice(3, 6), raw[6]!);
        edit = { ...edit, placement: { ...parsed, rotationXYZW: index >= 3 && index <= 5 ? parsed.rotationXYZW : edit.placement.rotationXYZW } }; } catch { /* Invalid text stays in the form; last valid preview remains. */ } host.changed(); });
    node.addEventListener('compositionstart', () => { composing = true; host.changed(); }); node.addEventListener('compositionend', () => { composing = false; host.changed(); }); return node;
  });
  const modes = make('div'); for (const [mode, text] of [['translate', '移動'], ['rotate', '回転'], ['scale', '拡大縮小']] as const)
    modes.append(button(text, () => { if (edit && !host.block('models') && !composing) { edit = { ...edit, mode }; host.changed(); } }));
  const confirm = button('配置を確定', () => {
    if (!edit || host.block('models') || composing || !valid()) return;
    const captured = edit, current = host.ports.modelDetails(captured.target.sceneId, captured.target.assetId);
    if (!current || !sameProjectValue(current.target, captured.target)) { host.message('モデルが更新されています。入力を保持しています。'); return; }
    if (sameProjectValue(current.placement, captured.placement)) { edit = null; host.message('配置に変更はありません。'); return; }
    const command = { sceneId: captured.target.sceneId, assetId: captured.target.assetId, expectedBindingId: captured.target.bindingId,
      bindingId: newProjectId('bnd'), placement: captured.placement };
    host.execute('models', captured.target.token, () => host.ports.transformModel(captured.target.token, command), () => { edit = null; host.message('モデルの配置を確定しました。'); });
  });
  const cancel = button('配置を取り消す', () => { if (!host.block('models', false) && !composing) { edit = null; host.changed(); } });
  const impact = make('p'); impact.setAttribute('role', 'status'); placement.append(begin, impact, fields, modes, confirm, cancel);
  function valid() { try { host.ports.modelPlacement(raw.slice(0, 3), raw.slice(3, 6), raw[6]!); return true; } catch { return false; } }
  const pinSizeArea = make('section'), pinSizeLabel = make('label', 'ピンの表示倍率'), pinSizeInput = make('input'), pinSizeNote = make('p');
  pinSizeInput.type = 'number'; pinSizeInput.min = '0.001'; pinSizeInput.max = '1000'; pinSizeInput.step = 'any'; pinSizeInput.setAttribute('aria-label', 'ピンの表示倍率'); pinSizeLabel.append(pinSizeInput);
  const capturePinSize = () => { const { provider, sceneId } = host.source(), assetId = memory().assetId;
    if (assetId && !pinSize) pinSizeScope = { token: provider.token, sceneId, assetId }; };
  pinSizeInput.addEventListener('focus', capturePinSize); pinSizeInput.addEventListener('pointerdown', capturePinSize);
  const validPinSize = () => !!pinSize && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(pinSize.raw.trim()) && Number.isFinite(Number(pinSize.raw)) && Number(pinSize.raw) >= 0.001 && Number(pinSize.raw) <= 1000;
  pinSizeInput.addEventListener('input', () => {
    if (host.block('models') || edit || fileScope || deletion || choices.size || membershipDecisions.size || memory().composing) return;
    if (!pinSizeScope) capturePinSize(); if (!pinSizeScope) return;
    pinSize = { ...(pinSize ?? pinSizeScope), raw: pinSizeInput.value }; host.changed();
  });
  pinSizeInput.addEventListener('compositionstart', () => { composing = true; host.changed(); });
  pinSizeInput.addEventListener('compositionend', () => { if (pinSize) pinSize = { ...pinSize, raw: pinSizeInput.value }; composing = false; host.changed(); });
  const applyPinSize = button('倍率を適用', () => {
    const captured = pinSize, { provider, sceneId } = host.source();
    if (!captured || host.block('models') || composing || !validPinSize() || captured.token !== provider.token || captured.sceneId !== sceneId || captured.assetId !== memory().assetId) return;
    const value = Number(captured.raw), previous = provider.details.mutable.assetsById[captured.assetId]?.pinScale;
    if (previous?.kind === 'value' && (previous.value ?? 1) === value) { pinSize = null; pinSizeScope = null; host.changed(); return; }
    host.dispatch('models', captured.token, { kind: 'setAssetPinScale', assetId: captured.assetId, pinScale: value }, () => { pinSize = null; pinSizeScope = null; host.message('ピンの表示倍率を変更しました。'); });
  });
  const cancelPinSize = button('倍率の変更を取り消す', () => { if (!host.block('models', false) && !composing) { pinSize = null; pinSizeScope = null; host.changed(); } });
  pinSizeArea.append(pinSizeLabel, pinSizeNote, applyPinSize, cancelPinSize);
  const remove = button('プロジェクトから削除', () => {
    if (host.block('models') || ownInput() || memory().composing || composing || !memory().assetId) return;
    try { if (host.ports.modelDeletion(memory().assetId!).dependencies.length) return; deletion = { token: host.source().provider.token, assetId: memory().assetId! }; host.changed(); }
    catch (error) { host.message((error as Error).message); }
  });
  const deletionNote = make('p'), deletionBox = make('section'); deletionBox.append(make('p', 'このモデルをプロジェクトから削除しますか？ 元のモデルと履歴は保持されます。'));
  deletionBox.append(button('削除する', () => { const captured = deletion; if (!captured || host.block('models')) return;
    host.dispatch('models', captured.token, { kind: 'deleteAsset', assetId: captured.assetId, eventId: newProjectId('evt') }, () => { deletion = null; setMemory({ ...memory(), assetId: null }); host.message('モデルを削除しました。'); }); }),
    button('戻る', () => { if (!host.block('models', false)) { deletion = null; host.changed(); } }));
  const pointSizeArea = make('section'), pointSizeLabel = make('label', '点の大きさ（px）'), pointSizeInput = make('input');
  pointSizeInput.type = 'range'; pointSizeInput.min = '1'; pointSizeInput.max = '20'; pointSizeInput.step = '1'; pointSizeInput.setAttribute('aria-label', '点の大きさ（px）'); pointSizeLabel.append(pointSizeInput); pointSizeArea.append(pointSizeLabel);
  pointSizeInput.addEventListener('input', () => { const assetId = memory().assetId; if (assetId && !pointSizeInput.disabled) { host.viewport().setPointDiameter?.(assetId, Number(pointSizeInput.value)); host.changed(); } });
  root.append(list.root, fileArea, proxyArea, placement, pinSizeArea, pointSizeArea, review, remove, deletionNote, deletionBox); if (preview) root.append(preview.root);
  function render() {
    if (disposed) return; list.render(context()); const block = host.block('models'), selected = memory().assetId, { provider, sceneId } = host.source();
    const details = selected ? host.ports.modelDetails(sceneId, selected) : null;
    proxyArea.hidden=!details?.gsProxyTarget&&!proxyScope;
    proxyAdd.textContent=details?.gsProxyTarget?.expectedProxyId?'位置指定用の面を変更':'位置指定用の面を追加';
    proxyAdd.disabled=!!block||ownInput()||!details?.gsProxyTarget;proxyRemove.hidden=!details?.gsProxyTarget?.expectedProxyId;
    proxyRemove.disabled=!!block||ownInput();proxyConfirm.hidden=!proxyScope?.prepared;proxyCancel.hidden=!proxyScope;
    proxyConfirm.textContent=proxyScope?.removing?'面を外す':proxyScope?.target?.expectedProxyId?'面の変更を確定':'このモデルに面を追加';
    proxyConfirm.disabled=!!block||!proxyScope?.prepared||proxyScope.token!==provider.token;proxyCancel.disabled=!!host.block('models',false);
    proxyNote.textContent=proxyScope?.token&&proxyScope.token!==provider.token?'モデルが更新されています。入力は保持しています。取り消して選び直してください。':proxyScope?.removing?'新しく位置を選ぶには面の追加が必要です。保存済みの記録位置は変わりません。':proxyScope?.prepared?`${proxyScope.prepared.label} を選択中のモデルに関連付けます。同じ原点・向き・倍率で用意した面であることを確認してください。面は通常表示されず、保存済みの記録位置は変わりません。`:'このモデルと同じ座標で用意した面のデータを選択してください。';
    const source = context().source, selectedItem = source.kind === 'ready' ? source.items.find(i => i.id === selected) : undefined;
    pointSizeArea.hidden = !details?.pointCloud; pointSizeInput.disabled = !!block || !!edit || !!fileScope; if (selected) pointSizeInput.value = String(host.viewport().pointDiameter?.(selected) ?? 3);
    const included = selectedItem?.membership.kind === 'value' && selectedItem.membership.value.kind === 'included';
    const visible = selectedItem?.display.kind === 'value' && selectedItem.display.value === 'visible';
    const scale = selected ? provider.details.mutable.assetsById[selected]?.pinScale : undefined;
    const scaleReady = provider.semanticProfile === 'map2' && selectedItem?.lifecycle.kind === 'value' && selectedItem.lifecycle.value === 'active' && scale?.kind === 'value' &&
      !provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[0] === 'assetsById' && i.path[1] === selected);
    pinSizeArea.hidden = !selected;
    pinSizeInput.disabled = !!block || !scaleReady || !!edit || !!fileScope || !!deletion || choices.size > 0 || membershipDecisions.size > 0;
    if (!composing) pinSizeInput.value = pinSize?.raw ?? String(scale?.kind === 'value' ? scale.value ?? 1 : '');
    const staleScale = !!pinSize && (pinSize.token !== provider.token || pinSize.sceneId !== sceneId || pinSize.assetId !== selected);
    applyPinSize.disabled = !!block || !scaleReady || !pinSize || composing || staleScale || !validPinSize();
    cancelPinSize.hidden = !pinSize; cancelPinSize.disabled = !!host.block('models', false) || composing;
    pinSizeNote.textContent = staleScale ? '内容が更新されています。入力を保持しています。取り消して選び直してください。' : !scaleReady ? 'このプロジェクトでは倍率を変更できません。モデルと設定の状態を確認してください。' : 'このモデルに属するピンの大きさを、すべてのシーンで変更します。';
    add.disabled = !!block || ownInput() || memory().composing || !sceneId;
    replace.disabled = !!block || ownInput() || memory().composing || !details || details.replacementAvailable === false || !included || details.sceneCount.kind !== 'value';
    confirmReplacement.hidden = fileScope?.kind !== 'replace' || !fileScope.file; confirmReplacement.disabled = !!block || fileScope?.token !== provider.token;
    cancelFile.hidden = !fileScope; cancelFile.disabled = !!host.block('models', false);
    fileNote.textContent = fileScope?.kind === 'replace' ? `${fileScope.file?.name ?? 'ファイルを選択してください。'} ${details?.sceneCount.kind === 'value' ? `${details.sceneCount.value}シーンのモデルを差し替えます。` : ''} 配置と記録は保持され、ピンは要確認になります。材質の調整は引き継ぎません。` : fileScope ? '追加するGLBまたは点群のPLYを選択してください。' : '';
    begin.disabled = !!block || ownInput() || !details || !visible || details.sceneCount.kind !== 'value';
    fields.hidden = modes.hidden = confirm.hidden = cancel.hidden = !edit; confirm.disabled = !!block || composing || !valid(); cancel.disabled = !!host.block('models', false) || composing;
    inputs.forEach((node, index) => { node.disabled = !!block; if (!composing) node.value = raw[index] ?? ''; });
    impact.textContent = edit ? `${details?.sceneCount.kind === 'value' ? details.sceneCount.value : '要確認の'}シーンで共有されています。変更は全シーンに反映されます。` : '';
    deletionBox.hidden = !deletion;
    try { const deps = selected ? host.ports.modelDeletion(selected).dependencies : []; remove.disabled = !!block || ownInput() || !selected || deps.length > 0;
      deletionNote.textContent = deps.length ? `削除するには、参照しているシーン・記録・材質の設定を先に解除してください（${deps.length}件）。` : ''; }
    catch (error) { remove.disabled = true; deletionNote.textContent = selected ? (error as Error).message : ''; }
    review.replaceChildren();
    const groups = host.ports.modelReview(sceneId);
    const choice = (key: string, label: string, values: readonly { id: string; label: string }[], apply: (value: string) => void, area: HTMLElement = review) => {
      const owned = choices.get(key), row = make('label', label), select = make('select'), empty = make('option', '選択してください'); empty.value = ''; select.append(empty); select.setAttribute('aria-label', label);
      for (const item of values) { const option = make('option', item.label); option.value = item.id; select.append(option); }
      select.value = owned?.value ?? ''; select.disabled = !!block || composing || memory().composing || !!edit || !!fileScope || !!pinSize || !!owned && owned.token !== provider.token;
      select.addEventListener('change', () => { if (!select.disabled) { choices.set(key, { token: provider.token, value: select.value }); host.changed(); } }); row.append(select);
      const save = button('選択を確定', () => { if (!host.block('models') && !pinSize && owned?.token === host.source().provider.token && owned.value) apply(owned.value); });
      save.disabled = select.disabled || !owned?.value;
      const clear = button('選択を取り消す', () => { if (!host.block('models', false)) { choices.delete(key); membershipDecisions.delete(key); host.changed(); } }); clear.hidden = !owned && !membershipDecisions.has(key); clear.disabled = !!host.block('models', false);
      area.append(row, save, clear);
    };
    for (const group of groups.statuses) { if (group.issue) review.append(make('p', group.issue));
      if (preview) for (const [index, item] of group.choices.entries()) { const show = button(`${group.label}：候補 ${index + 1} を表示`, () => {
        if (host.block('models', false) || pinSize) return; try { preview.show(provider.token, sceneId, group.assetId, item.operationId, `${group.label}：候補 ${index + 1}`); } catch (error) { host.message((error as Error).message); }
      }); show.disabled = !!host.block('models', false) || !!pinSize; review.append(show); }
      choice(`status/${group.assetId}`, `${group.label}：残すモデルと配置`, group.choices.map(c => ({ id: c.operationId, label: c.label })), operationId => {
      host.dispatch('models', provider.token, { kind: 'resolveAssetStatus', assetId: group.assetId, operationId }, () => { choices.delete(`status/${group.assetId}`); host.message('モデルと配置を確定しました。'); });
    }); }
    for (const group of groups.memberships) {
      const area = make('section'); area.setAttribute('aria-label', group.label ?? 'モデル登録の重複');
      area.append(make('h3', group.label ?? 'モデル登録の重複'));
      if (group.note) area.append(make('p', group.note));
      if (group.details?.length) { const details = make('ul'); for (const text of group.details) details.append(make('li', text)); area.append(details); }
      review.append(area);
      const key = `${sceneId}/membership/${group.assetId}`, selectedDecision = membershipDecisions.get(key), row = make('label', '重複するモデル'), decision = make('select'); decision.setAttribute('aria-label', '重複するモデル');
      for (const [value, label] of [['one', '一つにまとめる'], ['both', '別々のモデルとして両方残す']]) { const option = make('option', label); option.value = value!; option.disabled = value === 'both' && group.copyReady === false; decision.append(option); }
      decision.value = selectedDecision?.value ?? 'one'; decision.disabled = !!block || !!edit || !!fileScope || !!pinSize || composing || memory().composing || !!selectedDecision && selectedDecision.token !== provider.token;
      decision.addEventListener('change', () => { if (!decision.disabled) { membershipDecisions.set(key, { token: provider.token, sceneId, value: decision.value as 'one' | 'both' }); host.changed(); } }); row.append(decision); area.append(row);
      choice(key, '残すモデル登録', group.edgeIds.map((id, i) => ({ id, label: `登録 ${i + 1}` })), originalMembershipId => {
        let prepared: ReturnType<typeof host.ports.prepareModelMembership> | undefined;
        const capturedDecision = membershipDecisions.get(key); if (capturedDecision && (capturedDecision.token !== provider.token || capturedDecision.sceneId !== sceneId)) return;
        const mode = capturedDecision?.value ?? 'one';
        host.execute('models', provider.token, () => { prepared ??= host.ports.prepareModelMembership(provider.token, sceneId, group.assetId, group.edgeIds, originalMembershipId, mode);
          return prepared.then(command => host.ports.dispatch(provider.token, command)); }, () => { choices.delete(key); membershipDecisions.delete(key); host.message('モデルの登録を整理しました。'); });
      }, area);
    }
    preview?.render(sceneId);
  }
  return { root, render, hasChanges: () => ownInput() || memory().composing || composing, composing: () => composing || memory().composing,
    selectedSurface: () => { const assetId=memory().assetId,details=assetId?host.ports.modelDetails(host.source().sceneId,assetId):null; return assetId && (details?.pointCloud||details?.gsProxyTarget) ? assetId : null; }, hidden: () => memory().hiddenAssetIds, proposal: () => edit,
    show(assetId) { setMemory({ ...memory(), hiddenAssetIds: memory().hiddenAssetIds.filter(id => id !== assetId) }); },
    propose(next) { if (!edit || composing || memory().composing || next.mode !== edit.mode || host.block('models', true, true) || !sameProjectValue(next.target, edit.target)) return false;
      if (!next.placement.translation.every(Number.isFinite) || !Number.isFinite(next.placement.uniformScale) || next.placement.uniformScale <= 0) return false;
      edit = next; raw = [...next.placement.translation.map(String), ...host.ports.modelAngles(next.placement.rotationXYZW), String(next.placement.uniformScale)]; host.changed(); return true; },
    dispose() { disposed = true; preview?.dispose(); list.dispose(); root.remove(); } };
}
