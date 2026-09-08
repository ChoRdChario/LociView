import { createDevelopmentWorkspace } from './workspace';
import { SyntheticSession } from './session';
import { historyAuthority, historySeed, projectHistory } from './historyProjection';
import type { DevelopmentHistoryFactory, MemoryUpdate } from './historyPort';
import { decodeSyntheticAnchor, modelVersion, syntheticVersions } from './modelFixture';
import { sceneSwitchReason } from '../../ui/projectScene/navigationState';

/** Two independently edited histories in one disposable page, not a file-sharing UI. */
export function createTeamWorkspace(document: Document, factory: DevelopmentHistoryFactory) {
  const histories = factory(historySeed(), projectHistory);
  const sessions = histories.map(h => new SyntheticSession(historyAuthority(h)));
  const initial = histories.map(h => h.read().token);
  const names = ['準備担当', '参加者'];
  const lastReceived: (MemoryUpdate | undefined)[] = [];
  let active = 0, disposed = false;
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
  const workspaces = sessions.map(session => createDevelopmentWorkspace(document, session, { team: true, onAction: renderTeam }));
  root.append(toolbar, conflictPanel, ...workspaces.map(w => w.root));
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
      const result = histories[active]!.receive(update);
      lastReceived[active] = update;
      session.refreshHistory();
      status.textContent = result.added ? '更新を受け取りました。未適用の入力も保持しています。' : '受信済みです。編集内容は変わりません。';
    });
  }
  receive.addEventListener('click', () => receiveUpdate(false));
  retry.addEventListener('click', () => receiveUpdate(true));
  function renderTeam() {
    if (disposed) return;
    actor.value = String(active); retry.disabled = !lastReceived[active];
    const shownActor = active, history = histories[shownActor]!;
    const session = sessions[shownActor]!, snapshot = history.read();
    actor.disabled = receive.disabled = session.pending !== null && session.pending !== 'text';
    if (actor.disabled) retry.disabled = true;
    const conflicts = Object.entries(snapshot.cells).filter(([, cell]) => cell.kind === 'conflict');
    conflictPanel.hidden = !conflicts.length;
    const elements: HTMLElement[] = [];
    if (conflicts.length) elements.push(make('h2', '残す内容を選択'), make('p',
      '同じ項目に異なる編集があります。使用する内容を選択してください。'));
    for (const [key, cell] of conflicts) {
      if (cell.kind !== 'conflict') continue;
      if (key.startsWith('membership/')) {
        elements.push(make('p', 'モデルの所属に競合があります。残す項目の選択・独立した別項目として両方残す操作は未接続です。')); continue;
      }
      const [, id, field] = key.split('/');
      const ordinal = Object.keys(session.snapshot.resources.captions).indexOf(id!) + 1;
      const subject = key.startsWith('asset/') ? `${session.snapshot.modelNames[id!] ?? 'モデル'} — 使用するモデル` :
        `キャプション ${ordinal} — ${field === 'title' ? 'タイトル' : field === 'body' ? '本文' : field === 'anchor' ? 'ピン位置' : 'ピン色'}`;
      const group = make('fieldset'), legend = make('legend', subject);
      const confirm = make('button', '選んだ内容を使用'); confirm.type = 'button'; confirm.disabled = true;
      let selected: string | null = null;
      group.append(legend);
      for (const [i, candidate] of cell.candidates.entries()) {
        let description = candidate.value || '（空欄）';
        if (key.startsWith('asset/')) description = modelVersion(id!, candidate.value)?.label ?? 'モデル候補を確認';
        if (field === 'anchor') {
          const anchor = decodeSyntheticAnchor(candidate.value, id!);
          if (anchor.kind === 'asset') {
            const version = syntheticVersions.find(v => v.assetId === anchor.assetId && v.projection.revisionId === anchor.authoredAssetRevisionId);
            description = `${session.snapshot.modelNames[anchor.assetId]} — X ${anchor.positionAsset[0]} / Y ${anchor.positionAsset[1]} / Z ${anchor.positionAsset[2]} — ${version?.label ?? '以前のモデル'}`;
          }
        }
        const choice = make('label'), radio = make('input'), text = make('span', description);
        radio.type = 'radio'; radio.name = `choice-${active}-${key}`; radio.value = candidate.id;
        radio.setAttribute('aria-label', `${subject} 候補 ${i + 1}`);
        radio.disabled = session.pending !== null;
        radio.addEventListener('change', () => { selected = candidate.id; confirm.disabled = false; });
        choice.append(radio, text); group.append(choice);
      }
      confirm.addEventListener('click', () => attempt(() => {
        if (disposed || active !== shownActor) throw new Error('操作する人が変わっています。候補を選び直してください。');
        if (session.pending !== null || !selected) throw new Error('入力を適用するか、取り消してから選択してください。');
        history.choose(snapshot.token, key, selected);
        session.refreshHistory(); status.textContent = '選んだ内容を適用しました。相手側でも更新を受け取ってください。';
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
    dispose() { disposed = true; workspaces.forEach(w => w.dispose()); root.remove(); } };
}
