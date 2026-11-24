import { createModelListControls } from './modelListControls';
import { modelListPlanIsCurrent, newModelListMemory, type ModelListContext, type ModelListMemory } from './modelListState';
import { projectIdentity, projectModels } from './projectRead';
import { localModelEditIssue, type WorkspaceFile, type WorkspaceModelProposal } from './projectWorkspacePorts';
import { newProjectId, panelNodes, sameProjectValue, type ProjectPanelHost, type ProjectModelPanel } from './projectPanel';
import { boundsCentre, placementAroundPivot, fitAlignmentBounds } from '../../domain/alignment';
import type { WorkspacePlacement } from './projectWorkspacePorts';
import { contextHelp } from './contextHelp';
import { editOnly, viewChoices } from './modePresentation';

export function createProjectModels(document: Document, host: ProjectPanelHost): ProjectModelPanel {
  const { make, button } = panelNodes(document), root = make('section'), fileArea = make('section'), placement = make('section'), review = make('section');
  root.setAttribute('aria-label', 'モデルの作業'); root.className = 'lv-model-task'; fileArea.setAttribute('aria-label', 'モデルのファイル'); placement.setAttribute('aria-label', 'モデルの配置'); review.setAttribute('aria-label', 'モデルの更新候補');
  const memories = new Map<string, ModelListMemory>();
  const preview = host.ports.createModelPreview?.();
  let edit: WorkspaceModelProposal | null = null, raw: string[] = [], composing = false, disposed = false;
  let reference: { assetId: string; bindingId: string } | null = null, pivot: 'origin' | 'centre' = 'origin';
  type PlacementStep = { before: WorkspacePlacement; after: WorkspacePlacement; bindingId: string };
  const historyKey = (sceneId: string, assetId: string) => `${sceneId}/${assetId}`;
  const scopeIssueFor = (details: NonNullable<ReturnType<ProjectPanelHost['ports']['modelDetails']>>) => localModelEditIssue(details.sceneCount, host.source().provider.semanticProfile === 'map2');
  let referenceScene = '';
  const placementHistory = new Map<string, { past: PlacementStep[]; future: PlacementStep[] }>();
  const setProposal = (proposal: WorkspaceModelProposal) => { edit = proposal; raw = [...proposal.placement.translation.map(String), ...host.ports.modelAngles(proposal.placement.rotationXYZW), String(proposal.placement.uniformScale)]; };
  let proxyScope: {token:string;target:NonNullable<ReturnType<typeof host.ports.modelDetails>>['gsProxyTarget'];removing:boolean;prepared?:{id:string;label:string;externalMaterialsUnavailable?:boolean};resumePlacement?:(registered:boolean)=>void} | null=null;
  let fileScope: { kind: 'add' | 'replace'; token: string; sceneId: string; assetId: string; expectedBindingId?: string; file?: WorkspaceFile; externalMaterialsUnavailable?:boolean } | null = null;
  let deletion: { token: string; assetId: string } | null = null;
  const choices = new Map<string, { token: string; value: string }>();
  const reviewNodes = new Map<string, HTMLElement>();
  const membershipDecisions = new Map<string, { token: string; sceneId: string; value: 'one' | 'both' }>();
  const memory = () => { const { provider, sceneId } = host.source(); if (!memories.has(sceneId)) memories.set(sceneId, newModelListMemory(projectIdentity(provider), sceneId)); return memories.get(sceneId)!; };
  const setMemory = (next: ModelListMemory) => memories.set(host.source().sceneId, next);
  const ownInput = () => !!edit || !!fileScope || !!proxyScope || !!deletion || choices.size > 0 || membershipDecisions.size > 0;
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
    } else if (plan.kind === 'review') { if (!ownInput() && !memory().composing) setMemory({ ...memory(), assetId: plan.assetId }); }
    } catch (error) { host.message((error as Error).message); }
    host.changed();
    if (plan.kind === 'review') { const node=plan.assetId?reviewNodes.get(plan.assetId):undefined; node?.focus?.({preventScroll:true});node?.scrollIntoView?.({block:'nearest'}); }
  }, assetId => { const groups=host.ports.modelReview(host.source().sceneId);return groups.statuses.some(g=>g.assetId===assetId)||groups.memberships.some(g=>g.assetId===assetId); });
  const input = (label: string) => { const node = make('input'); node.type = 'file'; node.accept = '.glb,.gltf,.obj,.stl,.ply,model/gltf-binary,model/gltf+json,model/stl,application/ply,text/plain'; node.hidden = true; node.setAttribute('aria-label', label); fileArea.append(node); return node; };
  const addInput = input('3Dモデルを追加'), replaceInput = input('モデルを差し替える');
  const beginFile = (kind: 'add' | 'replace') => {
    if (host.block('models') || ownInput() || memory().composing) return;
    const { provider, sceneId } = host.source(), details = memory().assetId ? host.ports.modelDetails(sceneId, memory().assetId!) : null;
    if (kind === 'replace' && (!details || details.replacementAvailable === false || scopeIssueFor(details))) return;
    fileScope = { kind, token: provider.token, sceneId, assetId: kind === 'add' ? newProjectId('ast') : details!.target.assetId,
      expectedBindingId: kind === 'replace' ? details!.target.bindingId : undefined };
    const selected = kind === 'add' ? addInput : replaceInput; selected.value = ''; host.changed(); selected.click();
  };
  const add = button('3Dモデルを追加', () => beginFile('add')), replace = button('モデルを差し替える', () => beginFile('replace'));
  const cancelFile = button('選択を取り消す', () => { if (!host.block('models', false) && !composing) { fileScope = null; addInput.value = replaceInput.value = ''; host.changed(); } });
  const confirmAddition=button('このモデルを追加',()=>applyFile());
  const confirmReplacement = button('差し替えを確定', () => applyFile()), fileNote = make('p'); fileNote.setAttribute('role', 'status');
  fileArea.append(add, replace, cancelFile, fileNote, confirmReplacement,confirmAddition);
  function applyFile() {
    const captured = fileScope; if (!captured?.file || host.ports.modelSelectionNotice&&captured.externalMaterialsUnavailable===undefined || host.block('models') || captured.token !== host.source().provider.token) return;
    const action = captured.kind === 'add' ? () => host.ports.addModel(captured.token, { sceneId: captured.sceneId, assetId: captured.assetId, file: captured.file! }) :
      () => host.ports.replaceModel(captured.token, { sceneId: captured.sceneId, assetId: captured.assetId, expectedBindingId: captured.expectedBindingId!, file: captured.file! });
    host.execute('models', captured.token, action, () => { fileScope = null; addInput.value = replaceInput.value = ''; setMemory({ ...memory(), assetId: captured.assetId });
      host.message(captured.kind === 'add' ? 'モデルを追加しました。' : 'モデルを差し替えました。配置と記録を保持しています。'); });
  }
  for (const node of [addInput, replaceInput]) {
    node.addEventListener('cancel', () => { if (!host.block('models', false)) { fileScope = null; host.changed(); } });
    node.addEventListener('change', () => {
      const selected = node.files?.[0]; if (!selected || !fileScope || host.block('models')) return;
      fileScope = { ...fileScope, externalMaterialsUnavailable:undefined, file: { name: selected.name, size: selected.size, blob: selected.slice(), arrayBuffer: selected.arrayBuffer.bind(selected) } };
      if (fileScope.token !== host.source().provider.token) host.message('対象が更新されています。元のモデルを選び直してください。');
      else if(host.ports.modelSelectionNotice){
        const captured=fileScope;let applied=false;
        host.execute('models',captured.token,async()=>{
          const notice=await host.ports.modelSelectionNotice!(captured.file!);
          if(disposed||fileScope!==captured||captured.token!==host.source().provider.token)throw Error('対象が更新されています。選び直してください。');
          if(captured.kind==='add'&&!notice.externalMaterialsUnavailable){await host.ports.addModel(captured.token,{sceneId:captured.sceneId,assetId:captured.assetId,file:captured.file!});applied=true;}
          else fileScope={...captured,externalMaterialsUnavailable:notice.externalMaterialsUnavailable};
        },()=>{if(applied){fileScope=null;addInput.value='';setMemory({...memory(),assetId:captured.assetId});host.message('モデルを追加しました。');}else host.message('');});
      }else if (fileScope.kind === 'add') applyFile(); host.changed();
    });
  }
  const proxyArea=make('section'),proxyNote=make('p'),proxyInput=input('ピン配置用モデルを選択');proxyArea.setAttribute('aria-label','ピン配置用モデル');proxyNote.setAttribute('role','status');
  const beginProxy=(removing:boolean,resumePlacement?:(registered:boolean)=>void)=>{
    if(host.block('models')||ownInput()||memory().composing)return;
    const assetId = memory().assetId, details = assetId ? host.ports.modelDetails(host.source().sceneId, assetId) : null;
    if (!details?.gsProxyTarget || !host.ports.prepareGsProxy) return;
    const issue = scopeIssueFor(details); if (issue) { host.message(issue); return; }
    proxyScope={token:host.source().provider.token,target:details.gsProxyTarget,removing,resumePlacement};
    if(removing)prepareProxy();else{proxyInput.value='';host.changed();proxyInput.click();}
  };
  const proxyAdd=button('ピン配置用モデルを追加',()=>beginProxy(false)),proxyRemove=button('ピン配置用モデルを外す',()=>beginProxy(true));
  function prepareProxy(file?:WorkspaceFile){
    const captured=proxyScope;if(!captured?.target||host.block('models')||!host.ports.prepareGsProxy)return;
    captured.prepared=undefined;
    host.execute('models',captured.token,async()=>{const result=await host.ports.prepareGsProxy!(captured.token,captured.target!,file);if(proxyScope===captured)captured.prepared=result;},()=>host.changed());
  }
  proxyInput.addEventListener('change',()=>{const file=proxyInput.files?.[0];if(file&&proxyScope)prepareProxy({name:file.name,size:file.size,arrayBuffer:file.arrayBuffer.bind(file)});});
  function cancelProxy() {
    if (host.block('models', false)) return;
    const captured = proxyScope;
    proxyScope = null; proxyInput.value = ''; host.ports.cancelGsProxy?.();
    captured?.resumePlacement?.(false); host.changed();
  }
  proxyInput.addEventListener('cancel',cancelProxy);
  const proxyConfirm=button('ピン配置用モデルを設定',()=>{
    const captured=proxyScope;if(!captured?.prepared||host.block('models')||!host.ports.commitGsProxy)return;
    host.execute('models',captured.token,()=>host.ports.commitGsProxy!(captured.token,captured.prepared!.id),()=>{
      if (proxyScope !== captured) return;
      proxyScope=null; captured.resumePlacement?.(true);
      host.message(captured.removing?'ピン配置用モデルを外しました。':'ピン配置用モデルを登録しました。');
    });
  });
  const proxyCancel=button('選択を取り消す',cancelProxy);
  proxyArea.append(proxyAdd,proxyRemove,proxyNote,proxyConfirm,proxyCancel);
  const begin = button('配置を調整', () => {
    if (host.block('models') || ownInput() || memory().composing) return;
    const m = memory(), { sceneId } = host.source(), details = m.assetId ? host.ports.modelDetails(sceneId, m.assetId) : null;
    const item = context().source.kind === 'ready' ? projectModels(host.source().provider, sceneId, m.projectId, m.hiddenAssetIds, host.viewport().read()) : null;
    const available = item?.kind === 'ready' ? item.items.find(i => i.id === m.assetId)?.display : undefined;
    if (!details || reference?.assetId === details.target.assetId || scopeIssueFor(details) || available?.kind !== 'value' || available.value !== 'visible') return;
    setProposal({ target: details.target, placement: details.placement, mode: 'translate', ...(pivot === 'centre' && details.boundsAsset ? { pivotAsset: boundsCentre(details.boundsAsset) } : {}) }); host.changed();
  });
  const fields = make('div'), labels = ['位置 X', '位置 Y', '位置 Z', '回転 X', '回転 Y', '回転 Z', '倍率'];
  fields.className = 'lv-model-transform-values';
  let cancelScrub: (() => void) | null = null;
  function updateField(index: number, value: string) {
    if (!edit || host.block('models')) return;
    raw[index] = value;
    try {
      const parsed = host.ports.modelPlacement(raw.slice(0, 3), raw.slice(3, 6), raw[6]!);
      let placement = { ...parsed, rotationXYZW: index >= 3 && index <= 5 ? parsed.rotationXYZW : edit.placement.rotationXYZW };
      if (index >= 3 && edit.pivotAsset) placement = placementAroundPivot(edit.placement, placement, edit.pivotAsset);
      edit = { ...edit, placement, fitReference: undefined };
      if (index >= 3 && edit.pivotAsset) placement.translation.forEach((axis, i) => { raw[i] = String(axis); });
    } catch { /* Keep incomplete text and the last valid preview. */ }
    host.changed();
  }
  const inputs = labels.map((text, index) => {
    const label = make('label'), heading = make('span', text), node = make('input');
    node.type = 'number'; node.step = 'any'; node.setAttribute('aria-label', text); label.append(heading, node); fields.append(label);
    node.addEventListener('input', () => updateField(index, node.value));
    node.addEventListener('compositionstart', () => { composing = true; host.changed(); });
    node.addEventListener('compositionend', () => { composing = false; host.changed(); });
    label.addEventListener('pointerdown', down => {
      if (!edit || cancelScrub || composing || node.disabled || host.block('models') || !valid() ||
        down.button !== 0 || down.isPrimary === false || !Number.isFinite(down.clientX) ||
        down.pointerType === 'touch' && down.target === node) return;
      const original = edit, originalRaw = [...raw], start = Number(raw[index]), browser = document.defaultView;
      let expected = edit, moved = false, pending: string | undefined, frame: number | undefined;
      const current = () => !disposed && !composing && edit === expected && !host.block('models') &&
        host.source().provider.token === original.target.token && host.source().sceneId === original.target.sceneId;
      const flush = () => {
        frame = undefined;
        if (pending === undefined || !current()) return;
        updateField(index, pending); expected = edit!; pending = undefined;
      };
      const finish = (restore: boolean) => {
        if (cancelScrub !== cancel) return;
        cancelScrub = null;
        if (frame !== undefined) browser?.cancelAnimationFrame(frame);
        label.removeEventListener('pointermove', move); label.removeEventListener('pointerup', end);
        label.removeEventListener('pointercancel', end); label.removeEventListener('lostpointercapture', end);
        label.removeEventListener('keydown', key);
        try { label.releasePointerCapture?.(down.pointerId); } catch { /* Already released. */ }
        if (!moved || !current()) return;
        if (restore) { edit = original; raw = originalRaw; host.changed(); }
        else flush();
      };
      const cancel = () => finish(true);
      const move = (event: PointerEvent) => {
        if (event.pointerId !== down.pointerId) return;
        if (!current() || event.buttons === 0 || !Number.isFinite(event.clientX)) { cancel(); return; }
        const dx = event.clientX - down.clientX;
        if (!moved && Math.abs(dx) < 4) return;
        moved = true; event.preventDefault();
        const step = (index >= 3 && index < 6 ? 0.5 : 0.01) * (event.shiftKey ? 0.1 : 1);
        const next = index === 6 ? start * Math.exp(dx * step) : start + dx * step;
        if (!Number.isFinite(next) || (index === 6 && next <= 0)) return;
        pending = String(Number(next.toPrecision(12)));
        if (browser && frame === undefined) frame = browser.requestAnimationFrame(flush);
        else if (!browser) flush();
      };
      const end = (event: PointerEvent) => { if (event.pointerId === down.pointerId) finish(event.type !== 'pointerup'); };
      const key = (event: KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
      };
      try { label.setPointerCapture?.(down.pointerId); } catch { return; }
      cancelScrub = cancel;
      if (down.target !== node && down.pointerType !== 'touch') node.focus({ preventScroll: true });
      label.addEventListener('pointermove', move); label.addEventListener('pointerup', end);
      label.addEventListener('pointercancel', end); label.addEventListener('lostpointercapture', end);
      label.addEventListener('keydown', key);
    });
    return node;
  });
  const modes = make('div'), modeButtons = new Map<string, HTMLButtonElement>();
  modes.className = 'lv-model-gizmo-modes'; modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'ギズモ切り替え'); modes.append(make('span', 'ギズモ切り替え'));
  for (const [mode, text] of [['translate', '移動'], ['rotate', '回転'], ['scale', '拡大縮小']] as const) {
    const control = button(text, () => { if (edit && !host.block('models') && !composing) { edit = { ...edit, mode }; host.changed(); } });
    modeButtons.set(mode, control); modes.append(control);
  }
  const confirm = button('配置を確定', () => {
    if (!edit || cancelScrub || host.block('models') || composing || !valid()) return;
    const captured = edit, current = host.ports.modelDetails(captured.target.sceneId, captured.target.assetId);
    if (!current || !sameProjectValue(current.target, captured.target)) { host.message('モデルが更新されています。入力を保持しています。'); return; }
    const reason = scopeIssueFor(current); if (reason) { host.message(reason); return; }
    if (sameProjectValue(current.placement, captured.placement)) { edit = null; host.message('配置に変更はありません。'); return; }
    const command = { sceneId: captured.target.sceneId, assetId: captured.target.assetId, expectedBindingId: captured.target.bindingId,
      bindingId: newProjectId('bnd'), placement: captured.placement, ...(captured.fitReference ? { fitReference: captured.fitReference } : {}) };
    host.execute('models', captured.target.token, () => host.ports.transformModel(captured.target.token, command), () => {
      const h = placementHistory.get(historyKey(captured.target.sceneId, captured.target.assetId)) ?? { past: [], future: [] };
      if (h.past.length && h.past.at(-1)!.bindingId !== current.target.bindingId) h.past = [];
      h.past.push({ before: current.placement, after: captured.placement, bindingId: command.bindingId }); h.future = []; placementHistory.set(historyKey(captured.target.sceneId, captured.target.assetId), h);
      edit = null; host.message('モデルの配置を確定しました。');
    });
  });
  const cancel = button('配置を取り消す', () => { if (!host.block('models', false) && !composing) { edit = null; host.changed(); } });
  const scopeNote = make('p'); scopeNote.setAttribute('role', 'status'); placement.append(make('h3', 'モデル配置'), begin, scopeNote, modes, fields);
  const placementActions = make('section'); placementActions.className = 'lv-task-footer'; placementActions.setAttribute('aria-label', '配置の終了操作'); placementActions.append(confirm, cancel);
  const alignment = make('details'); alignment.setAttribute('aria-label', '基準・リセット'); alignment.append(make('summary', '基準・リセット'));
  const pivotLabel = make('label', '回転・拡縮の基準'), pivotSelect = make('select'); pivotSelect.setAttribute('aria-label', '回転・拡縮の基準');
  for (const [value, label] of [['origin', 'モデルの原点'], ['centre', 'モデルの中心']]) { const option = make('option', label); option.value = value!; pivotSelect.append(option); } pivotLabel.append(pivotSelect);
  pivotSelect.addEventListener('change', () => { if (host.block('models') || composing || host.viewport().read().dragging) return;
    pivot = pivotSelect.value === 'centre' ? 'centre' : 'origin'; const details = memory().assetId ? host.ports.modelDetails(host.source().sceneId, memory().assetId!) : null;
    if (edit) { const { pivotAsset: _, ...rest } = edit; edit = { ...rest, ...(pivot === 'centre' && details?.boundsAsset ? { pivotAsset: boundsCentre(details.boundsAsset) } : {}) }; } host.changed();
  });
  const setReference = button('このモデルを基準にする', () => { if (host.block('models') || ownInput()) return; const id = memory().assetId, d = id ? host.ports.modelDetails(host.source().sceneId, id) : null;
    if (d) { reference = { assetId: d.target.assetId, bindingId: d.target.bindingId }; host.changed(); } });
  const clearReference = button('基準を解除', () => { if (!host.block('models', false) && !ownInput()) { reference = null; host.changed(); } });
  const referenceNote = make('p'); referenceNote.setAttribute('role', 'status');
  const referenceHelp = contextHelp(document, '基準にしたモデルの配置は、この画面では変更しません。ほかのモデルを選んで、基準の中心と大きさに合わせられます。', [setReference, clearReference]);
  const fit = button('基準の中心と大きさに合わせる', () => {
    if (host.block('models') || ownInput() || !reference) return; const s = host.source(), id = memory().assetId;
    const d = id ? host.ports.modelDetails(s.sceneId, id) : null, ref = host.ports.modelDetails(s.sceneId, reference.assetId);
    if (!d?.boundsAsset || scopeIssueFor(d) || !ref?.boundsAsset || ref.target.bindingId !== reference.bindingId || d.target.assetId === reference.assetId) return;
    try { setProposal({ target: d.target, placement: fitAlignmentBounds(d.boundsAsset, d.placement, ref.boundsAsset, ref.placement), mode: 'translate', fitReference: reference }); host.changed(); }
    catch (error) { host.message((error as Error).message); }
  });
  const resetTo = (imported: boolean) => { if (host.block('models') || ownInput()) return; const id = memory().assetId, d = id ? host.ports.modelDetails(host.source().sceneId, id) : null;
    if (!d || scopeIssueFor(d) || reference?.assetId === id || imported && !d.importedPlacement) return;
    setProposal({ target: d.target, placement: imported ? d.importedPlacement! : { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 }, mode: 'translate' }); host.changed(); };
  const resetIdentity = button('原点・回転なし・倍率1に戻す', () => resetTo(false)), resetImported = button('読み込み時の配置に戻す', () => resetTo(true));
  function compensatePlacement(forward: boolean) {
    if (host.block('models') || ownInput()) return; const id = memory().assetId, d = id ? host.ports.modelDetails(host.source().sceneId, id) : null, h = id ? placementHistory.get(historyKey(host.source().sceneId, id)) : undefined;
    const step = (forward ? h?.future : h?.past)?.at(-1); if (!d || scopeIssueFor(d) || !h || !step || d.target.bindingId !== step.bindingId || reference?.assetId === id) return;
    const bindingId = newProjectId('bnd'); host.execute('models', d.target.token, () => host.ports.transformModel(d.target.token, { sceneId: d.target.sceneId, assetId: d.target.assetId,
      expectedBindingId: d.target.bindingId, bindingId, placement: forward ? step.after : step.before }), () => {
      if (forward) { h.future.pop(); h.past.push({ ...step, bindingId }); if (h.future.length) h.future.at(-1)!.bindingId = bindingId; }
      else { h.past.pop(); h.future.push({ ...step, bindingId }); if (h.past.length) h.past.at(-1)!.bindingId = bindingId; }
      host.message(forward ? '配置をやり直しました。' : '配置を元に戻しました。');
    });
  }
  const undoPlacement = button('配置を元に戻す', () => compensatePlacement(false)), redoPlacement = button('配置をやり直す', () => compensatePlacement(true));
  alignment.append(referenceNote, setReference, clearReference, pivotLabel, fit, resetImported, resetIdentity, undoPlacement, redoPlacement, referenceHelp); placement.append(alignment);
  function valid() { try { host.ports.modelPlacement(raw.slice(0, 3), raw.slice(3, 6), raw[6]!); return true; } catch { return false; } }
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
  const manage = make('details'); manage.className = 'lv-model-management'; manage.append(make('summary', 'モデルを管理'), fileArea, remove, deletionNote, deletionBox);
  const content = make('div'); content.className = 'lv-model-content';
  content.append(list.root, proxyArea, placement, pointSizeArea, manage, review);
  root.append(content, placementActions); if (preview) root.append(preview.root);
  editOnly(manage, placementActions, fileArea, proxyArea, placement, remove, deletionBox);
  function render() {
    if (disposed) return;
    const shownScene = host.source().sceneId;
    if (referenceScene !== shownScene) { reference = null; referenceScene = shownScene; } placementActions.hidden = !edit; if (fileScope || deletion) manage.open = true; list.render(context()); const block = host.block('models'), selected = memory().assetId, { provider, sceneId } = host.source();
    const details = selected ? host.ports.modelDetails(sceneId, selected) : null;
    proxyArea.hidden=!details?.gsProxyTarget&&!proxyScope;
    proxyAdd.textContent=details?.gsProxyTarget?.expectedProxyId?'ピン配置用モデルを変更':'ピン配置用モデルを追加';
    const proxyBlocked = !details?.gsProxyTarget || !!scopeIssueFor(details) || !!block || ownInput();
    proxyAdd.disabled=proxyBlocked;proxyRemove.hidden=!details?.gsProxyTarget?.expectedProxyId;
    proxyRemove.disabled=proxyBlocked;proxyConfirm.hidden=!proxyScope?.prepared;proxyCancel.hidden=!proxyScope;
    proxyConfirm.textContent=proxyScope?.resumePlacement?'このモデルでピンを配置する':proxyScope?.removing?'取り外しを確定':proxyScope?.target?.expectedProxyId?'変更を確定':'ピン配置用モデルを設定';
    proxyConfirm.disabled=!!block||!proxyScope?.prepared||proxyScope.token!==provider.token;proxyCancel.disabled=!!host.block('models',false);
    proxyNote.textContent=proxyScope?.token&&proxyScope.token!==provider.token?'モデルが更新されています。入力は保持しています。取り消して選び直してください。':proxyScope?.removing?'モデル上を選んで位置を指定するには、ピン配置用モデルが必要です。保存済みの記録位置は変わりません。':proxyScope?.prepared?`${proxyScope.prepared.label} を選択中のモデルに関連付けます。同じ原点・向き・倍率で用意したモデルであることを確認してください。ピン配置用モデルは通常表示されず、保存済みの記録位置は変わりません。`:'このモデルと同じ座標で用意したモデルのデータを選択してください。';
    if(proxyScope?.prepared?.externalMaterialsUnavailable)proxyNote.textContent+=' OBJの外部材質・画像は読み込まず、既定の材質で表示します。';
    const source = context().source, selectedItem = source.kind === 'ready' ? source.items.find(i => i.id === selected) : undefined;
    placement.hidden = !selected && !edit && !reference; fields.hidden = modes.hidden = !edit;
    for (const [mode, control] of modeButtons) { control.setAttribute('aria-pressed', String(edit?.mode === mode)); control.disabled = !edit || !!block || composing; }
    pointSizeArea.hidden = !details?.pointCloud; pointSizeInput.disabled = !!host.block('models', false) || ownInput() || composing || memory().composing; if (selected) pointSizeInput.value = String(host.viewport().pointDiameter?.(selected) ?? 3);
    const included = selectedItem?.membership.kind === 'value' && selectedItem.membership.value.kind === 'included';
    const visible = selectedItem?.display.kind === 'value' && selectedItem.display.value === 'visible';
    const scopeIssue = details && included ? scopeIssueFor(details) : null;
    scopeNote.textContent = scopeIssue ?? ''; scopeNote.hidden = !scopeIssue;
    add.disabled = !!block || ownInput() || memory().composing || !sceneId;
    replace.disabled = !!block || ownInput() || memory().composing || !details || details.replacementAvailable === false || !included || !!scopeIssue;
    confirmAddition.hidden=fileScope?.kind!=='add'||!fileScope.file||!fileScope.externalMaterialsUnavailable;confirmAddition.disabled=!!block||fileScope?.token!==provider.token;
    confirmReplacement.hidden = fileScope?.kind !== 'replace' || !fileScope.file; confirmReplacement.disabled = !!block || fileScope?.token !== provider.token || !!host.ports.modelSelectionNotice&&fileScope?.externalMaterialsUnavailable===undefined;
    cancelFile.hidden = !fileScope; cancelFile.disabled = !!host.block('models', false);
    fileNote.textContent = fileScope?.kind === 'replace' ? `${fileScope.file?.name ?? 'ファイルを選択してください。'} ${details?.sceneCount.kind === 'value' ? 'このシーンのモデルを差し替えます。' : ''} 配置と記録は保持され、ピンは要確認になります。${details?.gsProxyTarget ? details.gsProxyTarget.expectedProxyId ? 'ピン配置用モデルは未設定になります。必要な場合は設定し直してください。' : '' : details?.pointCloud ? '同じ形式のXYZ・RGB点群を選択してください。' : '材質の調整は引き継ぎません。'}` : fileScope ? '追加するモデルを選択してください。' : '';
    if (!fileScope && scopeIssue && details?.replacementAvailable !== false) fileNote.textContent = 'このモデルの差し替えは、このシーンだけで使うモデルで行えます。';
    if(fileScope?.externalMaterialsUnavailable)fileNote.textContent+=' OBJの外部材質・画像は読み込まず、既定の材質で表示します。';
    const referenceDetails = reference ? host.ports.modelDetails(sceneId, reference.assetId) : null;
    const referenceChanged = !!reference && (!referenceDetails || referenceDetails.target.bindingId !== reference.bindingId);
    const referenceSelected = !!reference && reference.assetId === selected;
    begin.hidden = !!edit;
    begin.disabled = !!block || ownInput() || !details || !visible || !!scopeIssue || referenceSelected;
    setReference.disabled = !!block || ownInput() || !details || !visible;
    clearReference.hidden = !reference; clearReference.disabled = !!host.block('models', false) || ownInput();
    pivotSelect.value = pivot; pivotSelect.disabled = !!block || composing || host.viewport().read().dragging || !!fileScope || !!deletion;
    const name = reference ? provider.details.mutable.assetsById[reference.assetId]?.label : undefined;
    referenceNote.textContent = referenceChanged ? '基準モデルの配置が変わっています。基準を選び直してください。' : reference ? `基準：${name?.kind === 'value' ? name.value : 'モデル名を確認'}` : '';
    fit.disabled = !!block || ownInput() || !!scopeIssue || !visible || !details?.boundsAsset || !referenceDetails?.boundsAsset || referenceChanged || referenceSelected;
    resetIdentity.disabled = !!block || ownInput() || !!scopeIssue || !visible || !details || referenceSelected;
    resetImported.disabled = resetIdentity.disabled || !details?.importedPlacement;
    const history = selected ? placementHistory.get(historyKey(sceneId, selected)) : undefined;
    undoPlacement.disabled = resetIdentity.disabled || !history?.past.length || history.past.at(-1)!.bindingId !== details?.target.bindingId;
    redoPlacement.disabled = resetIdentity.disabled || !history?.future.length || history.future.at(-1)!.bindingId !== details?.target.bindingId;
    fields.hidden = modes.hidden = confirm.hidden = cancel.hidden = !edit; confirm.disabled = !!block || !!scopeIssue || composing || !valid(); cancel.disabled = !!host.block('models', false) || composing;
    inputs.forEach((node, index) => { node.disabled = !!block; if (!composing) node.value = raw[index] ?? ''; });
    deletionBox.hidden = !deletion;
    try { const deps = selected ? host.ports.modelDeletion(selected).dependencies : []; remove.disabled = !!block || ownInput() || !selected || deps.length > 0;
      deletionNote.textContent = deps.length ? `削除するには、参照しているシーン・記録・材質の設定を先に解除してください（${deps.length}件）。` : ''; }
    catch (error) { remove.disabled = true; deletionNote.textContent = selected ? (error as Error).message : ''; }
    review.replaceChildren(); reviewNodes.clear();
    const groups = host.ports.modelReview(sceneId);
    const choice = (key: string, label: string, values: readonly { id: string; label: string }[], apply: (value: string) => void, area: HTMLElement = review) => {
      const owned = choices.get(key), row = make('label', label), select = make('select'), empty = make('option', '選択してください'); empty.value = ''; select.append(empty); select.setAttribute('aria-label', label);
      for (const item of values) { const option = make('option', item.label); option.value = item.id; select.append(option); }
      select.value = owned?.value ?? ''; select.disabled = !!block || composing || memory().composing || !!edit || !!fileScope || !!owned && owned.token !== provider.token;
      select.addEventListener('change', () => { if (!select.disabled) { choices.set(key, { token: provider.token, value: select.value }); host.changed(); } }); row.append(select);
      const save = button('選択を確定', () => { if (!host.block('models') && owned?.token === host.source().provider.token && owned.value) apply(owned.value); });
      save.disabled = select.disabled || !owned?.value;
      const clear = button('選択を取り消す', () => { if (!host.block('models', false)) { choices.delete(key); membershipDecisions.delete(key); host.changed(); } }); clear.hidden = !owned && !membershipDecisions.has(key); clear.disabled = !!host.block('models', false);
      editOnly(row, save, clear); area.append(row, save, clear, viewChoices(document, label, values.map(item => item.label)));
    };
    for (const group of groups.statuses) { const area=make('section');area.tabIndex=-1;area.setAttribute('aria-label',group.label);reviewNodes.set(group.assetId,area);review.append(area);if (group.issue) area.append(make('p', group.issue));
      if (preview) for (const [index, item] of group.choices.entries()) { const show = button(`${group.label}：候補 ${index + 1} を表示`, () => {
        if (host.block('models', false)) return; try { preview.show(provider.token, sceneId, group.assetId, item.operationId, `${group.label}：候補 ${index + 1}`); } catch (error) { host.message((error as Error).message); }
      }); show.disabled = !!host.block('models', false); area.append(show); }
      choice(`status/${group.assetId}`, `${group.label}：残すモデルと配置`, group.choices.map(c => ({ id: c.operationId, label: c.label })), operationId => {
      host.dispatch('models', provider.token, { kind: 'resolveAssetStatus', assetId: group.assetId, operationId }, () => { choices.delete(`status/${group.assetId}`); host.message('モデルと配置を確定しました。'); });
    }, area); }
    for (const group of groups.memberships) {
      const area = make('section'); area.setAttribute('aria-label', group.label ?? 'モデル登録の重複');
      area.tabIndex=-1;if(!reviewNodes.has(group.assetId))reviewNodes.set(group.assetId,area);
      area.append(make('h3', group.label ?? 'モデル登録の重複'));
      if (group.note) area.append(make('p', group.note));
      if (group.details?.length) { const details = make('ul'); for (const text of group.details) details.append(make('li', text)); area.append(details); }
      review.append(area);
      const key = `${sceneId}/membership/${group.assetId}`, selectedDecision = membershipDecisions.get(key), row = make('label', '重複するモデル'), decision = make('select'); decision.setAttribute('aria-label', '重複するモデル');
      for (const [value, label] of [['one', '一つにまとめる'], ['both', '別々のモデルとして両方残す']]) { const option = make('option', label); option.value = value!; option.disabled = value === 'both' && group.copyReady === false; decision.append(option); }
      decision.value = selectedDecision?.value ?? 'one'; decision.disabled = !!block || !!edit || !!fileScope || composing || memory().composing || !!selectedDecision && selectedDecision.token !== provider.token;
      decision.addEventListener('change', () => { if (!decision.disabled) { membershipDecisions.set(key, { token: provider.token, sceneId, value: decision.value as 'one' | 'both' }); host.changed(); } }); editOnly(row); row.append(decision); area.append(row);
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
    selectedAsset: () => memory().assetId,
    chooseProxy(assetId, resumePlacement) {
      if (host.block('models') || ownInput() || memory().composing ||
          host.ports.modelDetails(host.source().sceneId, assetId)?.gsProxyTarget?.expectedProxyId !== null) return;
      setMemory({ ...memory(), assetId }); host.changed(); beginProxy(false, resumePlacement);
    },
    selectedSurface: () => { const assetId=memory().assetId,details=assetId?host.ports.modelDetails(host.source().sceneId,assetId):null; return assetId && (details?.pointCloud||details?.gsProxyTarget) ? assetId : null; }, hidden: () => memory().hiddenAssetIds, proposal: () => edit,
    show(assetId) { setMemory({ ...memory(), hiddenAssetIds: memory().hiddenAssetIds.filter(id => id !== assetId) }); },
    propose(next) { if (!edit || composing || memory().composing || next.mode !== edit.mode || host.block('models', true, true) || !sameProjectValue(next.target, edit.target)) return false;
      if (!next.placement.translation.every(Number.isFinite) || !Number.isFinite(next.placement.uniformScale) || next.placement.uniformScale <= 0) return false;
      edit = next; raw = [...next.placement.translation.map(String), ...host.ports.modelAngles(next.placement.rotationXYZW), String(next.placement.uniformScale)]; host.changed(); return true; },
    dispose() { disposed = true; cancelScrub?.(); fileScope=null; preview?.dispose(); list.dispose(); root.remove(); } };
}
