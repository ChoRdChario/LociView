import type { MetadataEdit } from '../../projectMetadata/commands';
import { normalizeSceneName } from '../../domain/values';
import { normalizeCaptionText } from '../../domain/captionText';
import type { WorkspaceRecoveryGroup, WorkspaceViewportState } from './projectWorkspacePorts';
import { newProjectId, panelNodes } from './projectPanel';

interface RecoveryHost {
  token(): string;
  groups(): readonly WorkspaceRecoveryGroup[];
  block(group?: WorkspaceRecoveryGroup): string | null;
  selectBlock(): boolean;
  cancelBlock(): boolean;
  changed(): void;
  apply(token: string, command: () => MetadataEdit, complete: () => void): void;
  membership: (token: string, sceneId: string, captionId: string, ids: readonly string[], keep: string, choice: 'one' | 'both') => MetadataEdit;
}
/** Checked whole-Project decisions. Owns only local forms, never storage or history. */
export function createProjectRecovery(document: Document, host: RecoveryHost) {
  const { make, button } = panelNodes(document), root = make('section'), list = make('ul');
  root.setAttribute('aria-label', '記録の競合'); root.append(list);
  type Form = { root: HTMLLIElement; group: WorkspaceRecoveryGroup; token: string; select: HTMLSelectElement;
    text: HTMLTextAreaElement; decision: HTMLSelectElement; apply: HTMLButtonElement; cancel: HTMLButtonElement;
    message: HTMLParagraphElement; composing: boolean };
  const forms = new Map<string, Form>(); let disposed = false;
  const dirty = (f: Form) => !!f.select.value || !!f.text.value || f.composing || f.group.target.kind === 'membership' && !!f.decision.value;
  const composing = () => [...forms.values()].some(f => f.composing);
  const valid = (f: Form) => {
    if (f.group.target.kind === 'membership' && (!['one', 'both'].includes(f.decision.value) || f.decision.value === 'both' && !f.group.copyReady)) return false;
    if (f.select.value !== 'manual') return true;
    try { if (f.group.manual === 'name') normalizeSceneName(f.text.value);
      else if (f.group.manual) normalizeCaptionText(f.group.manual, f.text.value); else return false; return true;
    } catch { return false; }
  };
  function command(f: Form): MetadataEdit {
    const target = f.group.target, choice = f.select.value === 'manual' ? { kind: 'manual' as const, text: f.text.value } : { kind: 'candidate' as const, operationId: f.select.value };
    switch (target.kind) {
      case 'name': return { kind: 'resolveSceneName', sceneId: target.sceneId, choice };
      case 'startup': return { kind: 'resolveDefaultScene', operationId: f.select.value };
      case 'text': return { kind: 'resolveCaptionText', captionId: target.captionId, field: target.field, choice };
      case 'field': return { kind: 'resolveCaptionField', captionId: target.captionId, field: target.field, operationId: f.select.value };
      case 'attachmentField': return { kind: 'resolveAttachmentField', captionId: target.captionId, attachmentId: target.attachmentId, field: target.field, operationId: f.select.value };
      case 'attachmentLifecycle': return { kind: 'resolveAttachmentLifecycle', captionId: target.captionId, attachmentId: target.attachmentId, state: f.select.value as 'active' | 'deleted', observedOperationIds: [...target.operationIds], eventId: newProjectId('evt') };
      case 'lifecycle': return { kind: 'resolveCaptionLifecycle', captionId: target.captionId, state: f.select.value as 'active' | 'deleted', observedOperationIds: [...target.operationIds], eventId: newProjectId('evt') };
      case 'captionLifecycleConfirm': return { kind: 'confirmCaptionLifecycle', captionId: target.captionId, state: f.select.value as 'active' | 'deleted', observedOperationIds: [...target.operationIds], eventId: newProjectId('evt') };
      case 'membership': return host.membership(f.token, target.sceneId, target.captionId, target.edgeIds, f.select.value, f.decision.value as 'one' | 'both');
    }
  }
  function render() {
    if (disposed) return;
    const groups = host.groups(), seen = new Set<string>(), nodes: HTMLLIElement[] = [];
    for (const group of groups) {
      seen.add(group.key); let f = forms.get(group.key);
      if (!f || f.token !== host.token() && !dirty(f)) {
        const item = make('li'), heading = make('h3', group.label), values = make('ul'), select = make('select'), text = make('textarea'), decision = make('select'), message = make('p');
        item.setAttribute('aria-label', group.label); select.setAttribute('aria-label', `${group.label}に残す内容`);
        text.setAttribute('aria-label', `${group.label}の入力`); decision.setAttribute('aria-label', `${group.label}の重複の扱い`);
        message.setAttribute('role', 'status');
        const option = (node: HTMLSelectElement, id: string, label: string) => { const o = make('option', label); o.value = id; node.append(o); };
        option(select, '', group.target.kind === 'membership' ? '元として残す登録を選択' : '選択してください');
        for (const c of group.choices) { const li = make('li', c.label); li.style.whiteSpace = 'pre-wrap'; values.append(li); option(select, c.id, c.label); }
        if (group.manual) option(select, 'manual', group.manual === 'name' ? '名前を入力' : '文言を入力');
        option(decision, '', '重複の扱いを選択'); option(decision, 'one', '一つにまとめる'); option(decision, 'both', '別々の記録として両方残す'); decision.value = '';
        decision.hidden = group.target.kind !== 'membership';
        const apply = button('競合を解消', () => {
          const current = forms.get(group.key);
          if (!current || host.block(current.group) || composing() || !current.group.ready || !valid(current) || !current.select.value || current.token !== host.token()) return;
          let sealed: MetadataEdit | undefined;
          host.apply(current.token, () => sealed ??= command(current), () => { forms.delete(group.key); host.changed(); });
        });
        const cancel = button('選択を取り消す', () => { if (!host.cancelBlock() && !composing()) { forms.delete(group.key); host.changed(); } });
        const note = make('p', group.note ?? ''), details = make('ul'); note.hidden = !group.note;
        for (const line of group.details ?? []) details.append(make('li', line)); details.hidden = !details.children.length;
        item.append(heading, note, values, details, select, text, decision, apply, cancel, message);
        f = { root: item, group, token: host.token(), select, text, decision, apply, cancel, message, composing: false }; forms.set(group.key, f);
        const current = f;
        select.addEventListener('change', () => { if (!host.selectBlock() && !composing()) host.changed(); });
        decision.addEventListener('change', () => { if (!host.selectBlock() && !composing()) host.changed(); });
        text.addEventListener('input', () => { if (!disposed) host.changed(); });
        text.addEventListener('compositionstart', () => { if (!disposed) { current.composing = true; host.changed(); } });
        text.addEventListener('compositionend', () => { if (!disposed) { current.composing = false; host.changed(); } });
      }
      nodes.push(f.root);
    }
    for (const [key, f] of forms) {
      if (!seen.has(key)) { if (dirty(f)) nodes.push(f.root); else { forms.delete(key); continue; } }
      const stale = f.token !== host.token(), block = host.block(f.group);
      f.select.disabled = !f.group.ready || host.selectBlock() || composing(); f.decision.disabled = f.select.disabled;
      f.text.hidden = f.select.value !== 'manual'; f.text.readOnly = host.cancelBlock() && !f.composing;
      f.apply.disabled = !f.group.ready || !f.select.value || !!block || composing() || stale || !valid(f);
      f.cancel.hidden = !dirty(f); f.cancel.disabled = host.cancelBlock() || composing();
      f.message.textContent = stale ? '内容が更新されています。入力は保持しています。取り消して選び直してください。' : !f.group.ready ? '候補を確認できないため解消できません。元の内容は保持しています。' :
        !valid(f) ? f.group.target.kind === 'membership' ? f.decision.value === 'both' && !f.group.copyReady ?
          '両方残すには、未解決の内容を先に確認してください。' : '重複の扱いを選択してください。' : '入力の長さ・改行・空白を確認してください。' : block ?? '';
    }
    for (const node of [...list.children]) if (!nodes.includes(node as HTMLLIElement)) node.remove();
    nodes.forEach((node, i) => { if (list.children[i] !== node) list.insertBefore(node, list.children[i] ?? null); });
    root.hidden = !nodes.length;
  }
  return { root, render, composing, hasChanges: () => [...forms.values()].some(dirty),
    comparison(): WorkspaceViewportState['comparison'] { for (const f of forms.values()) {
      const target = f.group.target, anchor = f.group.choices.find(c => c.id === f.select.value)?.anchor;
      if (!host.selectBlock() && !composing() && target.kind === 'field' && target.field === 'anchor' && anchor && f.group.ready && f.token === host.token()) return { token: f.token, captionId: target.captionId, anchor };
    } return null; },
    dispose() { disposed = true; forms.clear(); root.remove(); } };
}
