import { createDevelopmentWorkspace } from './workspace';
import { SyntheticSession } from './session';
import { historyAuthority, historySeed, projectHistory } from './historyProjection';
import type { WorkingHistoryFactory, MemoryUpdate } from './historyPort';
import { decodeSyntheticAnchor, modelVersion, syntheticVersions } from './modelFixture';
import { sceneSwitchReason } from '../../ui/projectScene/navigationState';
import { applyMembershipResolution, duplicateMemberships, planMembershipResolution, type MembershipResolutionPlan } from './membershipResolution';
import type { Membership } from '../../scene/types';
import { allocateModelCopyIds, fixtureModelIds } from './modelClosure';
import type { ViewportFactory } from './viewportHost';
import { materialCopyIntent } from './materialHistory';
import { createMaterialConflictControls, describeMaterialCandidate, describeMaterialTarget } from './materialReview';
import { attachmentImage, attachmentKey, copyableAttachments, fixtureMedia } from './mediaHistory';
import { canonicalFixture } from './modelClosure';

/** Two independently edited histories in one disposable page, not a file-sharing UI. */
export function createTeamWorkspace<F extends WorkingHistoryFactory>(document: Document, factory: F, viewportFactory?: ViewportFactory) {
  const histories = factory(historySeed(), projectHistory) as ReturnType<F>;
  const sessions = histories.map(h => new SyntheticSession(historyAuthority(h)));
  const initial = histories.map(h => h.read().token);
  const names = ['準備担当', '参加者'];
  const lastReceived: (MemoryUpdate | undefined)[] = [];
  let active = 0, disposed = false;
  const memberChoices = new Map<string, { selected: string | null; plan?: MembershipResolutionPlan }>();
  const deleteChoices = new Map<string, { selected: string; changes?: Readonly<Record<string, string>> }>();
  const lifecycleChoices = new Map<string, { selected: string | null; value?: string }>();
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
    const node = document.createElement(tag); node.textContent = text; return node;
  };
  const root = make('div'), toolbar = make('section'), conflictPanel = make('section');
  root.className = 'lv-development-team'; toolbar.className = 'lv-development-team-toolbar';
  toolbar.setAttribute('aria-label', '2人での編集・開発用');
  const label = make('label', '操作する人 '), actor = make('select'); actor.setAttribute('aria-label', '操作する人');
  names.forEach((name, i) => { const option = make('option', name); option.value = String(i); actor.append(option); });
  label.append(actor);
  const receive = make('button', '相手の更新を受け取る'), retry = make('button', '同じ更新を再受信');
  receive.type = retry.type = 'button';
  const status = make('p', '2人分の編集をこのページ内で試せます。ファイル交換・保存は未接続です。');
  status.setAttribute('role', 'status');
  const instructions = make('p', 'それぞれの編集を適用してから、相手の更新を受け取ります。');
  toolbar.append(label, receive, retry, instructions, status);
  conflictPanel.className = 'lv-development-conflicts'; conflictPanel.setAttribute('aria-label', '更新の競合');
  let materialConflicts: ReturnType<typeof createMaterialConflictControls> | undefined;
  const workspaces = sessions.map(session => createDevelopmentWorkspace(document, session, { team: true, onAction: renderTeam, viewportFactory }));
  materialConflicts = createMaterialConflictControls(document, () => ({ history: histories[active]!, session: sessions[active]!, actor: active }), () => attempt(() => {}));
  root.append(toolbar, conflictPanel, materialConflicts.root, ...workspaces.map(w => w.root));
  function attempt(action: () => void) {
    if (disposed) return;
    try { action(); }
    catch (error) { status.textContent = error instanceof Error ? error.message : '受信できません。編集は保持しています。'; }
    render();
  }
  actor.addEventListener('change', () => attempt(() => {
    const pending = sessions[active]!.pending;
    if (pending && pending !== 'text') throw new Error(sceneSwitchReason(pending));
    const next = Number(actor.value); if (next !== 0 && next !== 1) return;
    active = next; status.textContent = `${names[active]}の編集です。もう1人の入力も保持しています。`;
  }));
  function receiveUpdate(replay: boolean) {
    attempt(() => {
      const session = sessions[active]!;
      if (session.pending && session.pending !== 'text') throw new Error(sceneSwitchReason(session.pending));
      const update = replay ? lastReceived[active] : histories[1 - active]!.exportUpdate();
      if (!update) throw new Error('再受信する更新がありません。');
      lastReceived[active] = update;
      const history = histories[active]!, before = history.read().token;
      session.applyWorking(() => history.receive(update), () => {
        session.refreshHistory();
        status.textContent = history.read().token !== before ? '更新を受け取りました。未適用の入力も保持しています。' : '受信済みです。編集内容は変わりません。';
      }, error => { status.textContent = error instanceof Error ? error.message : '受信できません。編集を保持しています。'; });
    });
  }
  receive.addEventListener('click', () => receiveUpdate(false));
  retry.addEventListener('click', () => receiveUpdate(true));
  function renderTeam() {
    if (disposed) return;
    materialConflicts?.render();
    actor.value = String(active); retry.disabled = !lastReceived[active];
    const shownActor = active, history = histories[shownActor]!;
    const session = sessions[shownActor]!, snapshot = history.read();
    actor.disabled = receive.disabled = session.pending !== null && session.pending !== 'text';
    if (actor.disabled) retry.disabled = true;
    const conflicts = Object.entries(snapshot.cells).filter(([, cell]) => cell.kind === 'conflict');
    const duplicates = duplicateMemberships(snapshot), shownScene = session.sceneId;
    const deleteReviews = Object.values(session.snapshot.mediaData?.records ?? {}).filter(r => r.deleteEdit);
    conflictPanel.hidden = !conflicts.length && !duplicates.length && !deleteReviews.length;
    const elements: HTMLElement[] = [];
    const retainedKeys = new Set<string>();
    if (duplicates.length) elements.push(make('h2', '重複した項目を整理'));
    for (const duplicate of duplicates) {
      const key = `${shownActor}/${snapshot.token}/${shownScene}/${duplicate.kind}/${duplicate.sceneId}/${duplicate.resourceId}`;
      retainedKeys.add(key);
      const choice = memberChoices.get(key) ?? { selected: null }; memberChoices.set(key, choice);
      const scene = session.snapshot.state.scenes[duplicate.sceneId]!, caption = session.snapshot.resources.captions[duplicate.resourceId];
      const title = duplicate.kind === 'asset' ? session.snapshot.modelNames[duplicate.resourceId] ?? 'モデル' :
        caption?.title.kind === 'value' ? caption.title.value || '無題' : 'タイトルの競合を確認';
      const sceneName = scene.name.kind === 'value' ? scene.name.value : 'シーン名を確認';
      const fieldset = make('fieldset'), legend = make('legend', `${sceneName} — ${title}`);
      const table = duplicate.kind === 'asset' ? session.snapshot.state.assetMemberships : session.snapshot.state.captionMemberships;
      const otherScenes = [...new Set(Object.values(table).filter(edge => edge.resourceId === duplicate.resourceId &&
        edge.sceneId !== duplicate.sceneId && (edge.lifecycle.kind !== 'value' || edge.lifecycle.value.state !== 'deleted')).map(edge => edge.sceneId))];
      const explanation = make('p', `元として残す項目を選択してください。他のシーン ${otherScenes.length}件の参照は変更しません。`);
      const preview = make('p'), one = make('button', '選んだ項目だけ残す'), both = make('button', duplicate.kind === 'caption'
        ? '別々のキャプションとして残す' : '別々のモデルとして残す');
      one.type = both.type = 'button';
      const syncChoice = () => {
        one.disabled = both.disabled = !choice.selected || session.pending !== null || duplicate.edges.some(edge => edge.lifecycle.kind !== 'value');
        const ordinal = duplicate.edges.findIndex(edge => edge.id === choice.selected) + 1;
        preview.textContent = !ordinal ? '' : `項目 ${ordinal}を元として残します。「別々に残す」場合、ほかの${duplicate.edges.length - 1}件はこのシーンだけの独立コピーになります。` +
          (duplicate.kind === 'asset' ? '元モデルのキャプションはコピーしません。' : '');
      };
      fieldset.append(legend, explanation);
      duplicate.edges.forEach((edge, i) => {
        const label = make('label'), radio = make('input'); radio.type = 'radio'; radio.name = `membership-${key}`;
        radio.value = edge.id; radio.checked = choice.selected === edge.id; radio.disabled = session.pending !== null;
        const text = `項目 ${i + 1}（表示順 ${edge.orderKey.kind === 'value' ? edge.orderKey.value : '要確認'}）`;
        radio.setAttribute('aria-label', `${sceneName} — ${title} 項目 ${i + 1}`);
        radio.addEventListener('change', () => { choice.selected = edge.id; delete choice.plan; syncChoice(); });
        label.append(radio, make('span', text)); fieldset.append(label);
      });
      const resolve = (action: 'one' | 'both') => attempt(() => {
        if (active !== shownActor || session.sceneId !== shownScene || session.pending !== null || !choice.selected)
          throw new Error('入力と操作対象を確認してください。選択は保持しています。');
        if (!choice.plan || choice.plan.action !== action) {
          const fresh = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
          const currentAsset = session.snapshot.resources.assets[duplicate.resourceId], projection = currentAsset?.projection;
          const source = projection?.kind === 'value' ? session.snapshot.modelVersions?.find(v => v.projection.bindingId === projection.value.bindingId)?.closure : undefined;
          if (action === 'both' && duplicate.kind === 'asset' && !source) throw new Error('モデルの更新候補を先に確認してください。');
          choice.plan = planMembershipResolution(snapshot, duplicate, choice.selected, action, fresh('evt'), action === 'one' || duplicate.kind !== 'caption' ? [] :
            duplicate.edges.filter(edge => edge.id !== choice.selected).map(edge => ({ edgeId: edge.id,
              captionId: fresh('cap'), membershipId: fresh('scm'), attachments: copyableAttachments(session.snapshot.mediaData, duplicate.resourceId)
                .map(a => ({ sourceId: a.id, attachmentId: fresh('att') })) })), action === 'one' || duplicate.kind !== 'asset' ? [] :
            duplicate.edges.filter(edge => edge.id !== choice.selected).map(edge => ({ edgeId: edge.id,
              membershipId: fresh('sam'), ids: allocateModelCopyIds(fixtureModelIds(source!), fresh),
              ...(materialCopyIntent(session.snapshot.materialData, duplicate.sceneId, source!) ? { materialOverrideId: fresh('ovr') } : {}) })));
        }
        const plan = choice.plan;
        session.applyWorking(() => applyMembershipResolution(history, plan), () => {
          session.refreshHistory(); status.textContent = action === 'one' ? '選んだ項目を残しました。' :
            '別々に編集できる項目として残しました。相手側でも更新を受け取ってください。';
        });
      });
      one.addEventListener('click', () => resolve('one')); both.addEventListener('click', () => resolve('both'));
      fieldset.append(preview, one);
      fieldset.append(both);
      if (session.pending !== null) fieldset.append(make('p', '未適用の入力を保持しています。適用するか取り消してから選択してください。'));
      if (duplicate.edges.some(edge => edge.lifecycle.kind !== 'value')) fieldset.append(make('p', '所属の競合を先に確認してください。'));
      syncChoice(); elements.push(fieldset);
    }
    for (const key of memberChoices.keys()) if (!retainedKeys.has(key)) memberChoices.delete(key);
    const attachmentSubject = (id: string) => {
      const row = session.snapshot.mediaData?.records[id], caption = row?.captionId.kind === 'value' ? session.snapshot.resources.captions[row.captionId.value] : null;
      return `${caption?.title.kind === 'value' ? caption.title.value : 'キャプションを確認'} — ${row && attachmentImage(row)?.record.label || 'メディアを確認'} — 添付 ${id}`;
    };
    const resolveAttachmentLife = (key: string, value: string) => {
      const cell = snapshot.cells[key];
      if (cell?.kind === 'conflict') {
        if (!history.resolveAttachmentLifecycle) throw new Error('この接続では削除状態を解決できません。候補と選択を保持しています。');
        return history.resolveAttachmentLifecycle(snapshot.token, key, cell.candidates.map(c => c.id), value);
      } else return history.write(snapshot.token, { [key]: value });
    };
    for (const choices of [deleteChoices, lifecycleChoices]) for (const key of choices.keys())
      if (key.startsWith(`${active}/`) && !key.startsWith(`${active}/${snapshot.token}/`)) choices.delete(key);
    for (const row of deleteReviews) {
      const key = `${active}/${snapshot.token}/${row.id}`, choice = deleteChoices.get(key) ?? { selected: '' }; deleteChoices.set(key, choice);
      const box = make('fieldset'), legend = make('legend', attachmentSubject(row.id)), choose = make('select');
      choose.setAttribute('aria-label', `${attachmentSubject(row.id)} 削除と編集の確認`);
      for (const [key, label] of [['', '選択してください'], ['deleted', '削除を維持'], ['active', '添付を復元']]) { const o = make('option', label); o.value = key!; choose.append(o); }
      choose.value = choice.selected;
      const apply = make('button', '選択を適用'); apply.type = 'button'; apply.disabled = !choice.selected || session.pending !== null; choose.disabled = session.pending !== null;
      choose.addEventListener('change', () => { choice.selected = choose.value; delete choice.changes; apply.disabled = !choose.value || session.pending !== null; });
      apply.addEventListener('click', () => attempt(() => {
        if (disposed || active !== shownActor || session.pending || !['deleted', 'active'].includes(choose.value)) throw new Error('対象と入力を確認してください。');
        if (!choice.changes) choice.changes = { [attachmentKey(row.id, 'lifecycle')]:
          canonicalFixture({ state: choose.value, eventId: `evt_${crypto.randomUUID().replaceAll('-', '')}`, reason: 'conflictResolution' }) };
        const field = attachmentKey(row.id, 'lifecycle'), command = choice.changes[field]!;
        session.applyWorking(() => resolveAttachmentLife(field, command), () => { session.refreshHistory(); deleteChoices.delete(key); });
      }));
      box.append(legend, make('p', '添付の削除と編集が同時に行われました。両方の変更を保持しています。'));
      for (const [field, label] of [['altText', '説明'], ['orderKey', '順序']] as const) {
        const cell = snapshot.cells[attachmentKey(row.id, field)]!;
        if (cell.kind === 'value') box.append(make('p', `${label}：${cell.value || '（空欄）'}`));
        else { box.append(make('p', `${label}は未解決です。`)); cell.candidates.forEach((c, i) => box.append(make('p', `候補 ${i + 1}：${c.value || '（空欄）'}`))); }
      }
      box.append(choose, apply); elements.push(box);
    }
    if (conflicts.length) elements.push(make('h2', '残す内容を選択'), make('p',
      '同じ項目に異なる編集があります。使用する内容を選択してください。'));
    for (const [key, cell] of conflicts) {
      if (cell.kind !== 'conflict') continue;
      const [, id, field] = key.split('/');
      const ordinal = Object.keys(session.snapshot.resources.captions).indexOf(id!) + 1;
      const membership = key.startsWith('membership/') ? JSON.parse(cell.candidates[0]!.value) as Membership : null;
      const saved = key.startsWith('view/') ? session.snapshot.viewData?.records[id!] : undefined;
      const viewLabel = saved?.name.kind === 'value' ? saved.name.value : '視点';
      const viewFields: Record<string, string> = { name: '名称', camera: 'カメラ', background: '背景', order: '順序', lifecycle: '削除状態' };
      const subject = membership ? `${session.snapshot.state.scenes[membership.sceneId]!.name.kind === 'value' ?
        (session.snapshot.state.scenes[membership.sceneId]!.name as { value: string }).value : 'シーン'} — 所属する項目` :
        key.startsWith('asset/') ? `${session.snapshot.modelNames[id!] ?? 'モデル'} — 使用するモデル` :
        key.startsWith('view/') ? `${viewLabel} — ${viewFields[field!] ?? '視点の状態'}` :
        key.startsWith('scene/') ? 'シーンを開いたときの視点' :
        key.startsWith('attachment/') ? `${attachmentSubject(id!)} — ${{ captionId: 'キャプション', mediaResourceId: '画像', altText: '説明', orderKey: '順序', lifecycle: '削除状態' }[field!]}` :
        key.startsWith('material/') ? `${describeMaterialTarget(id!, session.snapshot)} — ${{ routing: '適用先', appearance: '見え方', compositing: '合成方式', lifecycle: '設定の状態' }[field!] ?? '状態'}` :
        `キャプション ${ordinal} — ${field === 'title' ? 'タイトル' : field === 'body' ? '本文' : field === 'anchor' ? 'ピン位置' : 'ピン色'}`;
      const group = make('fieldset'), legend = make('legend', subject);
      const confirm = make('button', '選んだ内容を使用'); confirm.type = 'button'; confirm.disabled = true;
      const retainedKey = `${active}/${snapshot.token}/${key}`;
      const lifecycleChoice = key.startsWith('attachment/') && field === 'lifecycle'
        ? lifecycleChoices.get(retainedKey) ?? { selected: null } : null;
      if (lifecycleChoice) lifecycleChoices.set(retainedKey, lifecycleChoice);
      let selected: string | null = lifecycleChoice?.selected ?? null;
      confirm.disabled = !selected || session.pending !== null;
      group.append(legend);
      for (const [i, candidate] of cell.candidates.entries()) {
        let description = candidate.value || '（空欄）';
        if (key.startsWith('material/')) description = describeMaterialCandidate(field!, candidate.value, session.snapshot);
        if (key.startsWith('attachment/')) {
          const target = session.snapshot.resources.captions[candidate.value];
          if (field === 'captionId') description = target?.title.kind === 'value' ? `${target.title.value} — ${target.id}` : `キャプション ${candidate.value}`;
          if (field === 'mediaResourceId') description = fixtureMedia.find(m => m.record.id === candidate.value)!.record.label;
          if (field === 'lifecycle') description = JSON.parse(candidate.value).state === 'deleted' ? '削除する' : '残す';
        }
        if (key.startsWith('scene/')) {
          const target = JSON.parse(candidate.value) as string | null, row = target ? session.snapshot.viewData?.records[target] : null;
          description = target === null ? '指定なし' : row?.name.kind === 'value' ? row.name.value : '名称を確認';
        }
        if (key.startsWith('view/') && ['camera', 'background', 'lifecycle'].includes(field!)) {
          const v = JSON.parse(candidate.value);
          description = field === 'camera' ? `${v.projection.kind === 'perspective' ? '透視投影' : '平行投影'} — 位置 ${v.position.join(' / ')}、注視点 ${v.target.join(' / ')}、上方向 ${v.up.join(' / ')}、${v.projection.kind === 'perspective' ? `画角 ${v.projection.verticalFovRadians} rad` : `縦幅 ${v.projection.verticalSpan}`}` :
            field === 'background' ? `背景色（sRGB） ${v.colorSrgb.join(' / ')}` : v.state === 'deleted' ? '削除する' : '残す';
        }
        if (membership) {
          const edge = JSON.parse(candidate.value) as Membership, caption = session.snapshot.resources.captions[edge.resourceId];
          const name = session.snapshot.modelNames[edge.resourceId] ?? (caption?.title.kind === 'value' ? caption.title.value : 'キャプション');
          description = `${name} — ${edge.lifecycle.kind === 'value' && edge.lifecycle.value.state === 'active' ? 'このシーンに含める' : 'このシーンから除外'}`;
        }
        if (key.startsWith('asset/')) {
          const version = modelVersion(id!, candidate.value, session.snapshot.modelVersions);
          description = version ? `${version.label} — 位置 ${version.closure.binding.assetToProject.translation.join(' / ')}` : 'モデル候補を確認';
        }
        if (field === 'anchor') {
          const anchor = decodeSyntheticAnchor(candidate.value, session.snapshot.captionTemplates[id!]!);
          if (anchor.kind === 'asset') {
            const version = syntheticVersions.find(v => v.assetId === anchor.assetId && v.projection.revisionId === anchor.authoredAssetRevisionId);
            description = `${session.snapshot.modelNames[anchor.assetId]} — X ${anchor.positionAsset[0]} / Y ${anchor.positionAsset[1]} / Z ${anchor.positionAsset[2]} — ${version?.label ?? '以前のモデル'}`;
          }
        }
        const choice = make('label'), radio = make('input'), text = make('span', description);
        radio.type = 'radio'; radio.name = `choice-${active}-${key}`; radio.value = candidate.id;
        radio.setAttribute('aria-label', `${subject} 候補 ${i + 1}`);
        radio.disabled = session.pending !== null; radio.checked = selected === candidate.id;
        radio.addEventListener('change', () => { selected = candidate.id;
          if (lifecycleChoice) { lifecycleChoice.selected = selected; delete lifecycleChoice.value; }
          confirm.disabled = session.pending !== null; });
        choice.append(radio, text); group.append(choice);
      }
      confirm.addEventListener('click', () => attempt(() => {
        if (disposed || active !== shownActor) throw new Error('操作する人が変わっています。候補を選び直してください。');
        if (session.pending !== null || !selected) throw new Error('入力を適用するか、取り消してから選択してください。');
        if (lifecycleChoice) {
          lifecycleChoice.value ??= canonicalFixture({ state: JSON.parse(cell.candidates.find(c => c.id === selected)!.value).state,
            eventId: `evt_${crypto.randomUUID().replaceAll('-', '')}`, reason: 'conflictResolution' });
        }
        const selectedId = selected, command = lifecycleChoice?.value;
        session.applyWorking(() => command ? resolveAttachmentLife(key, command) : history.choose(snapshot.token, key, selectedId), () => {
          if (lifecycleChoice) lifecycleChoices.delete(retainedKey);
          session.refreshHistory(); status.textContent = '選んだ内容を適用しました。相手側でも更新を受け取ってください。';
        });
      }));
      group.append(confirm);
      if (session.pending !== null) group.append(make('p', '未適用の入力を保持しています。必要な文章を控え、適用するか取り消してから選択してください。'));
      elements.push(group);
    }
    conflictPanel.replaceChildren(...elements);
  }
  function render() {
    workspaces.forEach((workspace, i) => { workspace.root.hidden = i !== active; workspace.render(); });
    renderTeam();
  }
  render();
  return { root, sessions, histories, render,
    hasChanges: () => sessions.some(s => s.pending !== null) || histories.some((h, i) => h.read().token !== initial[i]),
    dispose() { disposed = true; materialConflicts?.dispose(); workspaces.forEach(w => w.dispose()); root.remove(); } };
}
