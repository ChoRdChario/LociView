import type { SavedWorkspaceHost } from './savedHost';
import type { SyntheticSession } from './session';
import { captionLifecycleRecovery, type CaptionLifecycleResolution } from '../../projectMetadata/captionDeletion';
import { newId } from '../../projectMetadata/persistence';
import type { Anchor } from '../../scene/types';

/** One explicit parent-only decision in the existing review area, not a trash browser. */
export function createMetadataCaptionLifecycleControls(document: Document, host: Pick<SavedWorkspaceHost, 'read' | 'resolve' | 'limits'>,
  session: SyntheticSession, composing: () => boolean, changed: () => void, blockedReason: () => string | null = () => null) {
  const limits = host.limits;
  let disposed = false;
  const root = document.createElement('section'); root.setAttribute('aria-label', 'キャプションの削除・復元');
  const list = document.createElement('ul');
  const result = document.createElement('p'); result.setAttribute('role', 'status');
  root.append(list, result);
  type Form = { root: HTMLLIElement; token: string; choice: HTMLSelectElement; apply: HTMLButtonElement;
    cancel: HTMLButtonElement; message: HTMLParagraphElement; ready: boolean; command?: CaptionLifecycleResolution; externalMessage?: string };
  const forms = new Map<string, Form>(), dirty = (f: Form) => !!f.choice.value;
  const blocked = () => disposed || session.readOnly || !!session.pending && session.pending !== 'text' || composing() || !!blockedReason();
  const render = () => {
    if (disposed) return;
    const p = host.read().provider, nodes: HTMLLIElement[] = [], seen = new Set<string>();
    if (p?.kind === 'scene-provider') for (const field of p.inspection.candidates.fields) {
      if (field.path[0] !== 'captionsById' || field.path[2] !== 'lifecycle' || field.path.length !== 3) continue;
      const id = field.path[1]!, issues = p.issues.filter(i => i.path[0] === 'captionsById' && i.path[1] === id && i.path[2] === 'lifecycle');
      if (!issues.some(i => i.code === 'concurrent-delete-edit' || i.code === 'atomic-field-conflict')) continue;
      seen.add(id); let form = forms.get(id);
      if (!form || form.token !== p.token && !dirty(form)) {
        const item = document.createElement('li'), heading = document.createElement('p'), contents = document.createElement('ul');
        const related = document.createElement('ul'), note = document.createElement('p'), message = document.createElement('p');
        const choice = document.createElement('select'), apply = document.createElement('button'), cancel = document.createElement('button');
        const number = Object.keys(p.details.mutable.captionsById).sort().indexOf(id) + 1, title = p.resources.captions[id]?.title;
        const label = `キャプション ${number}：${title?.kind === 'value' ? title.value : 'タイトルに競合あり'}`;
        heading.textContent = label; item.setAttribute('aria-label', `${label}の削除・復元`);
        choice.setAttribute('aria-label', `${label}の扱い`); contents.setAttribute('aria-label', '保持している内容'); related.setAttribute('aria-label', '関連する登録と添付');
        let recovery: ReturnType<typeof captionLifecycleRecovery> | undefined;
        try { recovery = captionLifecycleRecovery(p, id, limits); } catch { /* No partial source or guessed identity. */ }
        const line = (list: HTMLElement, text: string) => { const li = document.createElement('li'); li.textContent = text; li.style.whiteSpace = 'pre-wrap'; list.append(li); };
        if (recovery) {
          for (const f of recovery.fields) {
            const name = f.path[2]!; if (!['title', 'body', 'anchor', 'colorSrgb'].includes(name)) continue;
            for (const [i, c] of f.candidates.entries()) {
              let text = c.value.kind === 'value' && typeof c.value.value === 'string' ? c.value.value : '未設定';
              if (name === 'anchor' && c.value.kind === 'value') {
                const anchor = c.value.value as unknown as Anchor, owner = anchor.kind === 'asset' ? p.details.mutable.assetsById[anchor.assetId]?.label : undefined;
                text = anchor.kind === 'project' ? `プロジェクト内の位置 ${anchor.positionProject.join(' / ')}` :
                  `${owner?.kind === 'value' ? owner.value : 'モデル名を確認'}・位置 ${anchor.positionAsset.join(' / ')}`;
              } else if (name === 'colorSrgb' && c.value.kind === 'value') text = `sRGB ${(c.value.value as number[]).join(' / ')}`;
              line(contents, `${{ title: 'タイトル', body: '本文', anchor: 'ピン位置', colorSrgb: 'ピンの色' }[name]}${f.candidates.length > 1 ? ` 候補 ${i + 1}` : ''}：${text}`);
            }
          }
          for (const [i, child] of recovery.children.entries()) {
            const name = child.kind === 'scene' && child.referenceId ? p.state.scenes[child.referenceId]?.name : undefined;
            line(related, `${child.kind === 'scene' ? `シーン登録：${name?.kind === 'value' ? name.value : '名称を確認'}` :
              child.kind === 'attachment' ? `添付 ${i + 1}` : `タグ登録 ${i + 1}`} — ${child.uncertain ? '対応先を要確認' :
              child.state === 'deleted' ? '削除済み・復元しません' : child.state === 'active' ? '登録あり・親の復元後に再表示される場合があります' : '状態を要確認'}`);
          }
          note.textContent = '削除と編集・復元が競合しています。キャプション本体だけを変更します。削除済みの登録・添付は復元しません。';
        } else message.textContent = '候補と履歴を確認できないため、この操作では解消できません。元の内容は保持しています。';
        for (const [value, label] of [['', '扱いを選択'], ['deleted', '削除状態を維持'], ['active', 'キャプションを復元']]) {
          const option = document.createElement('option'); option.value = value!; option.textContent = label!; choice.append(option);
        }
        apply.type = cancel.type = 'button'; apply.textContent = '選択を確定'; cancel.textContent = '取り消す'; message.setAttribute('role', 'status');
        item.append(heading, note, contents, related, choice, apply, cancel, message);
        const current: Form = { root: item, token: p.token, choice, apply, cancel, message, ready: !!recovery };
        forms.set(id, current); form = current;
        choice.addEventListener('change', () => { if (disposed || session.workingBlock) return; current.command = undefined; render(); changed(); });
        cancel.addEventListener('click', () => { if (disposed || session.workingBlock || composing()) return; forms.delete(id); render(); changed(); });
        apply.addEventListener('click', () => {
          if (blocked() || !recovery || current.token !== host.read().source?.token || !['active', 'deleted'].includes(choice.value)) return;
          const command = current.command ??= { kind: 'resolveCaptionLifecycle', captionId: id, state: choice.value as 'active' | 'deleted',
            observedOperationIds: recovery.lifecycle.candidates.map(c => c.operationId), eventId: `evt_${newId()}` };
          session.applyWorking(() => host.resolve(current.token, command), () => {
            if (disposed) return;
            forms.delete(id); session.refreshHistory();
            result.textContent = command.state === 'active' ? 'キャプションを復元しました。「キャプションの追加・除外」で登録を確認できます。削除済みの添付は戻りません。' :
              '削除状態を確定しました。元の内容は履歴に残っています。'; render(); changed();
          }, error => { if (!disposed) { message.textContent = error instanceof Error ? error.message : '解消できません。選択は保持しています。'; render(); changed(); } });
          render(); changed();
        });
      }
      nodes.push(form.root);
    }
    for (const [id, form] of forms) {
      if (!seen.has(id)) { if (dirty(form)) nodes.push(form.root); else { forms.delete(id); continue; } }
      const stale = form.token !== host.read().source?.token;
      const externalBlock = blockedReason();
      if (form.externalMessage && form.message.textContent === form.externalMessage) form.message.textContent = '';
      form.externalMessage = externalBlock || undefined;
      form.choice.disabled = !form.ready || session.readOnly || !!session.workingBlock || !!externalBlock;
      form.apply.disabled = !form.ready || !form.choice.value || blocked() || stale;
      form.cancel.disabled = !!session.workingBlock || composing();
      if (stale) form.message.textContent = '内容が更新されています。選択は保持しています。取り消して選び直してください。';
      else if (externalBlock) form.message.textContent = externalBlock;
      else if (dirty(form) && !form.message.textContent) form.message.textContent = 'この選択はまだ適用されていません。';
    }
    for (const child of Array.from(list.children)) if (!nodes.includes(child as HTMLLIElement)) child.remove();
    for (const [i, node] of nodes.entries()) if (list.children[i] !== node) list.insertBefore(node, list.children[i] ?? null);
  };
  render(); return { root, render, hasChanges: () => [...forms.values()].some(dirty), hasResult: () => !!result.textContent,
    dispose: () => { disposed = true; forms.clear(); root.remove(); } };
}
