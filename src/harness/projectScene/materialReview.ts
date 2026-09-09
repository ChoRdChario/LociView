import type { WorkingHistory } from './historyPort';
import type { SyntheticSession } from './session';
import type { SyntheticProject } from './fixture';
import { canonicalFixture } from './modelClosure';
import { materialKey, routingKey, type MaterialRouting } from './materialHistory';

export function describeMaterialCandidate(field: string, text: string, project: SyntheticProject): string {
  const v = JSON.parse(text);
  if (field === 'lifecycle') return v.state === 'deleted' ? '設定を解除' : '設定を残す';
  if (field === 'routing') {
    const scene = v.scope.kind === 'scene' ? project.state.scenes[v.scope.sceneId]?.name : null;
    return `${project.modelNames[v.target.assetId] ?? 'モデル'} — ${scene?.kind === 'value' ? scene.value : 'プロジェクト共通'} — 面の識別 ${v.target.logicalMaterialSlotId}`;
  }
  if (field === 'appearance') return `${v.lighting === 'unlit' ? '照明なし' : v.lighting === 'lit' ? '照明あり' : '元の照明'}・${v.doubleSided ? '両面' : v.doubleSided === false ? '片面' : '元の面設定'}・不透明度 ${(v.opacity ?? 1) * 100}%` +
    (v.baseColorSrgb ? `・色 ${v.baseColorSrgb.join(' / ')}` : '') + (v.chroma ? `・色抜き ${v.chroma.keyColorSrgb.join(' / ')}、許容 ${v.chroma.tolerance}、ぼかし ${v.chroma.softness}` : '・色抜きなし') +
    (Object.keys(v).some(k => !['lighting', 'doubleSided', 'opacity', 'baseColorSrgb', 'chroma'].includes(k)) ? '・未対応の追加設定あり' : '');
  return `被覆 ${v.coverage.policy}${v.coverage.alphaCutoff !== undefined ? `・しきい値 ${v.coverage.alphaCutoff}` : ''}・光学 ${v.optics}`;
}

export function describeMaterialTarget(id: string, project: SyntheticProject): string {
  const review = project.materialReviewData ?? project.materialData, record = review?.records[id];
  if (record?.routing.kind !== 'value') return `適用先を確認 — 設定 ${id}`;
  const route = record.routing.value;
  const peers = Object.values(review!.records).filter(r =>
    r.candidates.some(c => routingKey(c) === routingKey(route)) && (r.lifecycle.kind !== 'value' || r.lifecycle.value.state !== 'deleted'));
  return describeMaterialCandidate('routing', canonicalFixture(route), project) + (peers.length > 1 ? ` — 設定 ${id}` : '');
}

/** Explicit duplicate-key choice. UI selection is never a materialized history winner. */
export function createMaterialConflictControls(document: Document, current: () => { history: WorkingHistory; session: SyntheticSession; actor: number }, changed: () => void) {
  const root = document.createElement('section'); root.setAttribute('aria-label', 'マテリアルの重複'); root.className = 'lv-development-conflicts';
  const choices = new Map<string, { selected: string | null; changes?: Readonly<Record<string, string>> }>();
  let disposed = false, error = '';
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
  function render() {
    if (disposed) return;
    const { history, session, actor } = current(), snapshot = history.read(), groups = new Map<string, { routing: MaterialRouting; ids: string[] }>();
    // Review exact source candidates even when the provider withholds the shared
    // routing/intent. This does not restore a renderer winner or editable fallback.
    const data = session.snapshot.materialReviewData ?? session.snapshot.materialData;
    for (const r of Object.values(data?.records ?? {})) {
      if (r.lifecycle.kind === 'value' && r.lifecycle.value.state === 'deleted') continue;
      if (r.routing.kind !== 'value') continue;
      const key = routingKey(r.routing.value), group = groups.get(key) ?? { routing: r.routing.value, ids: [] };
      group.ids.push(r.id); groups.set(key, group);
    }
    const nodes: HTMLElement[] = [], retained = new Set<string>();
    for (const [key, group] of groups) {
      if (group.ids.length < 2) continue;
      const fingerprint = `${actor}/${snapshot.token}/${key}`, choice = choices.get(fingerprint) ?? { selected: null };
      choices.set(fingerprint, choice); retained.add(fingerprint);
      const box = make('fieldset'), scene = group.routing.scope.kind === 'scene' ? session.snapshot.state.scenes[group.routing.scope.sceneId]?.name : null;
      box.append(make('legend', `${session.snapshot.modelNames[group.routing.target.assetId]} — ${scene?.kind === 'value' ? scene.value : 'プロジェクト共通'}`),
        make('p', '同じ面に複数の設定があります。残す設定を選択してください。'));
      const apply = make('button', '選んだ設定を残す'); apply.type = 'button';
      const invalid = group.ids.some(id => data!.records[id]!.lifecycle.kind !== 'value' || data!.records[id]!.intent.kind !== 'value');
      apply.disabled = !choice.selected || invalid || session.pending !== null;
      group.ids.forEach((id, i) => {
        const row = data!.records[id]!, label = make('label'), radio = make('input'); radio.type = 'radio'; radio.name = fingerprint; radio.value = id;
        radio.checked = choice.selected === id; radio.disabled = invalid || session.pending !== null;
        radio.setAttribute('aria-label', `${describeMaterialTarget(id, session.snapshot)} 見え方の候補 ${i + 1}`);
        const intent = row.intent.kind === 'value' ? row.intent.value : null;
        label.append(radio, make('span', intent ? describeMaterialCandidate('appearance', canonicalFixture(intent.appearance), session.snapshot) + ' / ' +
          describeMaterialCandidate('compositing', canonicalFixture(intent.compositing), session.snapshot) : '内容の競合を先に確認してください。'));
        radio.addEventListener('change', () => { choice.selected = id; delete choice.changes; apply.disabled = false; }); box.append(label);
      });
      apply.addEventListener('click', () => {
        if (disposed) return;
        try {
          const now = current();
          if (now.actor !== actor || now.session !== session || session.pending || !choice.selected || invalid || history.read().token !== snapshot.token)
            throw new Error('操作対象と入力の状態を確認してください。選択を保持しています。');
          if (!choice.changes) {
            const eventId = `evt_${crypto.randomUUID().replaceAll('-', '')}`;
            choice.changes = Object.freeze(Object.fromEntries(group.ids.filter(id => id !== choice.selected).map(id => [materialKey(id, 'lifecycle'),
              canonicalFixture({ state: 'deleted', eventId, reason: 'conflictResolution' })])));
          }
          const changes = choice.changes;
          session.applyWorking(() => history.write(snapshot.token, changes), () => { session.refreshHistory(); error = ''; },
            e => { error = e instanceof Error ? e.message : '設定を整理できません。選択は保持しています。'; });
        } catch (e) { error = e instanceof Error ? e.message : '設定を整理できません。選択は保持しています。'; }
        changed();
      });
      if (invalid) box.append(make('p', '設定内容の競合を先に確認してください。'));
      if (session.pending) box.append(make('p', '編集中の入力を適用するか、取り消してください。'));
      box.append(apply); nodes.push(box);
    }
    for (const key of choices.keys()) if (!retained.has(key)) choices.delete(key);
    if (error) { const status = make('p', error); status.setAttribute('role', 'status'); nodes.push(status); }
    root.replaceChildren(...nodes); root.hidden = !nodes.length;
  }
  return { root, render, dispose() { disposed = true; root.remove(); } };
}
