import type { MetadataEdit } from '../../projectMetadata/commands';
import type { CaptionSnapshot, CaptionRestoreValues } from '../../projectMetadata/captionAuthoring';
import type { WorkspaceAuthoringIntent, ProjectWorkspacePorts, WorkspaceProvider } from './projectWorkspacePorts';
import { activeRecord, fieldValue } from './projectRead';
import { newProjectId, panelNodes, sameProjectValue } from './projectPanel';
import { sceneChoices } from './navigationState';

interface OrganizationHost {
  ports: ProjectWorkspacePorts; source(): { provider: WorkspaceProvider; sceneId: string; captionId: string | null };
  localBlocked(): boolean;
  blocked(): string | null; run(command: MetadataEdit, complete: () => void): void;
  scene(id: string): void; caption(id: string): void; changed(): void; message(text: string): void;
}
type UndoEntry = { before: CaptionSnapshot; after: CaptionSnapshot };
const restoredValues = (snapshot: CaptionSnapshot): CaptionRestoreValues => Object.fromEntries(snapshot.fields.flatMap(f =>
  f.value.kind === 'value' ? [[f.field, f.value.value]] : [])) as CaptionRestoreValues;
/** Task controls only; complete reads and typed command preparation belong to the Host. */
export function createProjectOrganization(document: Document, host: OrganizationHost) {
  const { make, button } = panelNodes(document), sceneRoot = make('div'), captionRoot = make('div'), tagsRoot = make('details');
  sceneRoot.setAttribute('aria-label', 'シーンの整理'); captionRoot.setAttribute('aria-label', '記録の編集操作'); tagsRoot.setAttribute('aria-label', 'タグの管理');
  tagsRoot.append(make('summary', 'タグを管理'));
  let disposed = false, composing = false, form: { kind: 'sceneCopy' | 'sceneDelete' | 'tagEdit' | 'tagDelete'; token: string; id: string } | null = null;
  let captured: { token: string; tagId: string | null } | null = null;
  let settingsDraft: { before: string; value: string } | null = null;
  const settingsRoot = make('details'), displayNameLabel = make('label', 'このブラウザの表示名'), displayName = make('input'), settingsStatus = make('p');
  const displayNameBadge = make('span'); displayNameBadge.setAttribute('aria-label', 'このブラウザの利用者');
  settingsRoot.setAttribute('aria-label', '設定'); displayName.setAttribute('aria-label', 'このブラウザの表示名'); displayName.maxLength = 256; displayNameLabel.append(displayName);
  settingsStatus.setAttribute('role', 'status'); const settingsSummary = make('summary', '設定');
  const beginSettings = () => { if (!settingsDraft) settingsDraft = { before: host.ports.localSettings?.read() ?? '', value: displayName.value }; };
  displayName.addEventListener('input', () => { beginSettings(); settingsDraft!.value = displayName.value; host.changed(); });
  displayName.addEventListener('compositionstart', () => { beginSettings(); composing = true; host.changed(); });
  displayName.addEventListener('compositionend', () => { composing = false; if (settingsDraft) settingsDraft.value = displayName.value; host.changed(); });
  const applySettings = button('表示名を設定', () => {
    if (!settingsDraft || composing || host.localBlocked() || !host.ports.localSettings) return;
    if (settingsDraft.before !== host.ports.localSettings.read()) { settingsStatus.textContent = '別の画面で設定が変わっています。入力を取り消して確認してください。'; return; }
    if (host.ports.localSettings.save(settingsDraft.value)) { settingsDraft = null; settingsStatus.textContent = 'このブラウザの表示名を設定しました。'; host.changed(); }
    else settingsStatus.textContent = '設定できませんでした。入力は保持しています。';
  });
  const cancelSettings = button('表示名の入力を取り消す', () => { if (!composing && !host.localBlocked()) { settingsDraft = null; settingsStatus.textContent = ''; host.changed(); } });
  settingsRoot.append(settingsSummary, displayNameLabel, make('p', 'このブラウザだけの設定です。共有ファイルや過去の編集者名は変わりません。'), applySettings, cancelSettings, settingsStatus);
  const undoByCaption = new Map<string, { past: UndoEntry[]; future: UndoEntry[] }>();
  const perform = (intent: WorkspaceAuthoringIntent, complete: (command: MetadataEdit) => void) => {
    if (disposed || host.blocked() || composing || !host.ports.authoring) return;
    try { const { provider } = host.source(), command = host.ports.authoring.prepare(provider.token, intent); host.run(command, () => complete(command)); }
    catch (error) { host.message((error as Error).message); }
  };
  const sceneNote = make('p'), sceneNameLabel = make('label', '複製するシーン名'), sceneName = make('input');
  sceneName.setAttribute('aria-label', '複製するシーン名'); sceneNameLabel.append(sceneName);
  const sceneForm = make('div');
  const beginScene = (kind: 'sceneCopy' | 'sceneDelete') => {
    if (host.blocked() || form || captured) return; const s = host.source();
    form = { kind, token: s.provider.token, id: s.sceneId };
    sceneName.value = `${fieldValue(s.provider.state.scenes[s.sceneId]?.name) ?? 'シーン'} のコピー`; host.changed();
    if (kind === 'sceneCopy') sceneName.focus();
  };
  const copyScene = button('シーンを複製', () => beginScene('sceneCopy')), removeScene = button('シーンを削除', () => beginScene('sceneDelete'));
  const up = button('シーンを上へ', () => perform({ kind: 'reorderScene', sceneId: host.source().sceneId, direction: 'up' }, () => host.message('シーンの順序を変更しました。')));
  const down = button('シーンを下へ', () => perform({ kind: 'reorderScene', sceneId: host.source().sceneId, direction: 'down' }, () => host.message('シーンの順序を変更しました。')));
  const confirmScene = button('複製を作成', () => {
    const f = form, s = host.source(); if (!f || f.token !== s.provider.token || f.id !== s.sceneId) return;
    perform(f.kind === 'sceneCopy' ? { kind: 'duplicateScene', sourceId: f.id, name: sceneName.value } : { kind: 'deleteSceneContents', sceneId: f.id }, command => {
      form = null; if (command.kind === 'duplicateScene') { host.scene(command.sceneId); host.message('シーンを複製しました。記録は別々に編集できます。'); }
      else { const id = fieldValue(host.source().provider.state.defaultSceneId); if (id) host.scene(id); host.message('シーンを削除しました。記録・モデル・画像はプロジェクトに残っています。'); }
    });
  });
  const cancel = button('操作を取り消す', () => { if (!host.localBlocked() && !composing) { form = null; captured = null; host.changed(); } });
  sceneForm.append(sceneNameLabel, sceneNote, confirmScene, cancel); sceneRoot.append(copyScene, up, down, removeScene, sceneForm);
  for (const node of [sceneName]) {
    node.addEventListener('input', () => host.changed()); node.addEventListener('compositionstart', () => { composing = true; host.changed(); });
    node.addEventListener('compositionend', () => { composing = false; host.changed(); });
  }
  const orderChoices = make('div'); sceneRoot.append(orderChoices);
  const copyCaption = button('記録を複製', () => { const s = host.source(); if (s.captionId) perform({ kind: 'duplicateCaption', sceneId: s.sceneId, sourceId: s.captionId }, command => {
    if (command.kind === 'duplicateCaption') { host.caption(command.captionId); host.message('記録を複製しました。元の記録は変わりません。'); }
  }); });
  const undo = button('記録の変更を元に戻す', () => compensate(false)), redo = button('記録の変更をやり直す', () => compensate(true));
  const undoNote = make('p'); undoNote.textContent = 'この画面で確定したタイトル・本文・色を戻せます。';
  captionRoot.append(copyCaption, undo, redo, undoNote);
  const history = () => { const id = host.source().captionId; if (!id) return null; if (!undoByCaption.has(id)) undoByCaption.set(id, { past: [], future: [] }); return undoByCaption.get(id)!; };
  function currentMatches(snapshot: CaptionSnapshot) { try { const s = host.source(); return sameProjectValue(snapshot, host.ports.authoring!.snapshot(s.provider.token, snapshot.captionId)); } catch { return false; } }
  function compensate(forward: boolean) {
    const h = history(), entry = (forward ? h?.future : h?.past)?.at(-1); if (!entry || host.blocked() || form || captured) return;
    const expected = forward ? entry.before : entry.after; if (!currentMatches(expected)) { host.message('記録が更新されているため戻せません。現在の内容は保持しています。'); return; }
    host.run({ kind: 'restoreCaptionFields', expected, values: restoredValues(forward ? entry.after : entry.before) }, () => {
      const s = host.source(), current = host.ports.authoring!.snapshot(s.provider.token, expected.captionId);
      if (forward) { h!.future.pop(); h!.past.push({ before: entry.before, after: current }); if (h!.future.length && sameProjectValue(h!.future.at(-1)!.before, entry.after)) h!.future.at(-1)!.before = current; }
      else { h!.past.pop(); h!.future.push({ before: current, after: entry.after }); if (h!.past.length && sameProjectValue(h!.past.at(-1)!.after, entry.before)) h!.past.at(-1)!.after = current; }
      host.caption(expected.captionId); host.message(forward ? '記録の変更をやり直しました。' : '記録の変更を元に戻しました。');
    });
  }
  const tagList = make('div'), tagForm = make('div'), tagNameLabel = make('label', 'タグ名'), tagName = make('input'), tagColor = make('input');
  tagName.setAttribute('aria-label', 'タグ名'); tagColor.type = 'color'; tagColor.value = '#57758b'; tagColor.setAttribute('aria-label', 'タグの色'); tagNameLabel.append(tagName);
  const startTag = () => { if (!captured) captured = { token: host.source().provider.token, tagId: form?.kind === 'tagEdit' ? form.id : null }; };
  for (const node of [tagName, tagColor]) {
    node.addEventListener('focus', startTag); node.addEventListener('input', () => { startTag(); host.changed(); });
    node.addEventListener('compositionstart', () => { startTag(); composing = true; host.changed(); }); node.addEventListener('compositionend', () => { composing = false; host.changed(); });
  }
  const saveTag = button('タグを追加', () => {
    if (!captured || captured.token !== host.source().provider.token || !tagName.value.trim()) return;
    const fields = { label: tagName.value, colorSrgb: tagColor.value.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255) };
    perform(captured.tagId ? { kind: 'editTag', tagId: captured.tagId, ...fields } : { kind: 'createTag', ...fields }, () => {
      captured = null; form = null; tagName.value = ''; host.message('タグを保存しました。');
    });
  });
  const tagCancel = button('タグの入力を取り消す', () => { if (!host.localBlocked() && !composing) { captured = null; form = null; tagName.value = ''; host.changed(); } });
  const tagConfirm = button('タグを削除する', () => { const f = form; if (f?.kind === 'tagDelete' && f.token === host.source().provider.token) perform({ kind: 'deleteTag', tagId: f.id }, () => { form = null; host.message('タグを削除しました。記録は残っています。'); }); });
  const tagNote = make('p'); tagForm.append(tagNameLabel, tagColor, saveTag, tagCancel, tagNote, tagConfirm); tagsRoot.append(tagList, tagForm);
  function render() {
    if (disposed) return; const s = host.source(), enabled = !!host.ports.authoring, blocked = !!host.blocked(), owned = !!form || !!captured || !!settingsDraft;
    settingsRoot.hidden = !host.ports.localSettings;
    const savedName = host.ports.localSettings?.read() ?? ''; displayNameBadge.textContent = savedName; displayNameBadge.hidden = !savedName;
    if (!composing && displayName.value !== (settingsDraft?.value ?? host.ports.localSettings?.read() ?? '')) displayName.value = settingsDraft?.value ?? host.ports.localSettings?.read() ?? '';
    const localBlocked = host.localBlocked() || !!form || !!captured;
    displayName.disabled = localBlocked; applySettings.disabled = localBlocked || composing || !settingsDraft;
    cancelSettings.hidden = !settingsDraft; cancelSettings.disabled = localBlocked || composing;
    sceneRoot.hidden = captionRoot.hidden = tagsRoot.hidden = !enabled;
    const choices = sceneChoices(s.provider.state), index = choices.findIndex(c => c.id === s.sceneId);
    copyScene.disabled = blocked || owned; removeScene.disabled = blocked || owned || choices.length < 2 || fieldValue(s.provider.state.defaultSceneId) === s.sceneId;
    up.disabled = blocked || owned || index <= 0; down.disabled = blocked || owned || index < 0 || index === choices.length - 1;
    sceneForm.hidden = !form || !['sceneCopy', 'sceneDelete'].includes(form.kind); sceneNameLabel.hidden = form?.kind !== 'sceneCopy';
    const stale = form && form.token !== s.provider.token || captured && captured.token !== s.provider.token;
    sceneNote.textContent = stale ? '内容が更新されています。取り消して選び直してください。' : form?.kind === 'sceneCopy' ? '記録・視点・シーンの材質設定を複製します。モデルとメディアは共通です。' : 'このシーンの所属・視点・材質設定を外します。記録・モデル・メディアはプロジェクトに残ります。';
    confirmScene.textContent = form?.kind === 'sceneDelete' ? 'このシーンを削除する' : '複製を作成';
    confirmScene.disabled = blocked || composing || !!stale || form?.kind === 'sceneCopy' && !sceneName.value.trim(); cancel.disabled = host.localBlocked() || composing;
    orderChoices.replaceChildren(); const scene = s.provider.state.scenes[s.sceneId];
    if (enabled && scene?.orderKey.kind !== 'value') {
      try { const candidates = host.ports.authoring!.sceneOrderChoices(s.provider.token, s.sceneId);
        for (const [i, c] of candidates.entries()) { const choose = button(`順序の候補 ${i + 1} を使う`, () => { if (host.source().provider.token === s.provider.token) host.run({ kind: 'resolveSceneOrder', sceneId: s.sceneId, operationId: c.operationId }, () => host.message('シーンの順序を確定しました。')); }); choose.disabled = blocked || owned; orderChoices.append(choose); }
      } catch { orderChoices.append(make('p', 'シーンの順序を確認してください。')); }
    }
    const h = history(); copyCaption.disabled = blocked || owned || !s.captionId;
    undo.disabled = blocked || owned || !h?.past.length || !currentMatches(h.past.at(-1)!.after);
    redo.disabled = blocked || owned || !h?.future.length || !currentMatches(h.future.at(-1)!.before);
    undoNote.hidden = !h?.past.length && !h?.future.length;
    saveTag.textContent = captured?.tagId ? 'タグを更新' : 'タグを追加'; saveTag.disabled = blocked || composing || !!stale || !captured || !tagName.value.trim();
    tagCancel.hidden = !captured && !form?.kind.startsWith('tag'); tagCancel.disabled = host.localBlocked() || composing;
    tagConfirm.hidden = form?.kind !== 'tagDelete'; tagConfirm.disabled = blocked || composing || !!stale;
    tagNote.textContent = stale ? '内容が更新されています。入力は保持しています。取り消して選び直してください。' : form?.kind === 'tagDelete' ? 'すべての記録からこのタグを外します。記録や添付は残ります。' : '';
    tagName.disabled = tagColor.disabled = blocked || !!form && form.kind !== 'tagEdit';
    tagList.replaceChildren();
    for (const [tagId, fields] of Object.entries(s.provider.details.mutable.captionTagsById)) {
      const lifecycle = fieldValue(fields.lifecycle) as { state?: string } | undefined;
      const retainedLink = Object.values(s.provider.details.mutable.captionTagMembershipsById).some(f => fieldValue(f.tagId) === tagId &&
        (fieldValue(f.lifecycle) as { state?: string } | undefined)?.state !== 'deleted');
      if (lifecycle?.state === 'deleted' && !retainedLink && !s.provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[1] === tagId)) continue;
      const row = make('div'), label = fieldValue(fields.label), color = fieldValue(fields.colorSrgb);
      row.append(make('span', typeof label === 'string' ? label : '名前を確認するタグ'));
      const related = Object.entries(s.provider.details.mutable.captionTagMembershipsById).filter(([, f]) => activeRecord(f) && fieldValue(f.tagId) === tagId && fieldValue(f.captionId) === s.captionId);
      const toggle = button(related.length ? 'この記録からタグを外す' : 'この記録にタグを付ける', () => { if (s.captionId) perform({ kind: 'setCaptionTag', captionId: s.captionId, tagId, included: !related.length }, () => host.message('記録のタグを変更しました。')); });
      toggle.disabled = blocked || owned || !s.captionId || !activeRecord(fields); row.append(toggle);
      const edit = button('タグを編集', () => { if (blocked || owned) return; form = { kind: 'tagEdit', token: s.provider.token, id: tagId }; captured = { token: s.provider.token, tagId }; tagName.value = typeof label === 'string' ? label : ''; if (Array.isArray(color)) tagColor.value = '#' + color.map(v => Math.round(Number(v) * 255).toString(16).padStart(2, '0')).join(''); host.changed(); });
      const remove = button('タグを削除', () => { if (!blocked && !owned) { form = { kind: 'tagDelete', token: s.provider.token, id: tagId }; host.changed(); } });
      edit.disabled = remove.disabled = blocked || owned || !activeRecord(fields); row.append(edit, remove);
      for (const field of ['label', 'colorSrgb', 'orderKey'] as const) {
        const raw = s.provider.inspection.candidates.fields.find(f => f.path.join('/') === `captionTagsById/${tagId}/${field}`);
        if (!raw || raw.candidates.length < 2) continue;
        for (const [i, c] of raw.candidates.entries()) { const choose = button(`${field === 'label' ? '名前' : field === 'colorSrgb' ? '色' : '順序'}の候補 ${i + 1} を使う`, () => { if (host.source().provider.token === s.provider.token) host.run({ kind: 'resolveTagField', tagId, field, operationId: c.operationId }, () => host.message('タグの内容を確定しました。')); });
          const description = c.value.kind !== 'value' ? '未設定' : field === 'label' ? String(c.value.value) : field === 'colorSrgb' && Array.isArray(c.value.value) ? '#' + c.value.value.map(v => Math.round(Number(v) * 255).toString(16).padStart(2, '0')).join('') : `並び順の候補 ${i + 1}`;
          choose.disabled = blocked || owned; row.append(make('span', description), choose); }
      }
      if (!activeRecord(fields) || s.provider.issues.some(i => i.code === 'concurrent-delete-edit' && i.path[1] === tagId)) {
        row.append(make('p', '削除として確定すると、すべての記録からこのタグを外します。記録や添付は残ります。'));
        const chooseLifecycle = (state: 'active' | 'deleted') => { if (host.source().provider.token !== s.provider.token) return; const raw = s.provider.inspection.candidates.fields.find(f => f.path.join('/') === `captionTagsById/${tagId}/lifecycle`);
          if (!raw) return; const ids = Object.entries(s.provider.details.mutable.captionTagMembershipsById).filter(([, f]) => activeRecord(f) && fieldValue(f.tagId) === tagId).map(([id]) => id);
          host.run({ kind: 'resolveTagLifecycle', tagId, state, observedOperationIds: raw.candidates.map(c => c.operationId), observedIds: ids, eventId: newProjectId('evt') }, () => host.message(state === 'active' ? 'タグを残しました。解除済みの所属は戻しません。' : 'タグの削除を確定しました。記録は残っています。'));
        };
        const restore = button('このタグを残す', () => chooseLifecycle('active')), discard = button('タグの削除として確定', () => chooseLifecycle('deleted'));
        restore.disabled = discard.disabled = blocked || owned; row.append(restore, discard);
      }
      tagList.append(row);
    }
  }
  return { sceneRoot, captionRoot, tagsRoot, settingsRoot, displayNameBadge, render, hasChanges: () => !!form || !!captured || !!settingsDraft, composing: () => composing,
    recordEdit(before: CaptionSnapshot) { const s = host.source(), after = host.ports.authoring!.snapshot(s.provider.token, before.captionId);
      const h = undoByCaption.get(before.captionId) ?? { past: [], future: [] }; if (h.past.length && !sameProjectValue(h.past.at(-1)!.after, before)) h.past = [];
      h.past.push({ before, after }); h.future = []; undoByCaption.set(before.captionId, h); },
    dispose() { disposed = true; undoByCaption.clear(); sceneRoot.remove(); captionRoot.remove(); tagsRoot.remove(); settingsRoot.remove(); displayNameBadge.remove(); } };
}
